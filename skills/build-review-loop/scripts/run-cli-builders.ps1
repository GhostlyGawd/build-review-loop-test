param(
  [Parameter(Mandatory = $true)]
  [string]$ContractPath
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ExpectedInvariant = @("-a", "never", "-m", "gpt-5.4", "-c", 'model_reasoning_effort="xhigh"', "-c", 'windows.sandbox="elevated"', "-c", "sandbox_workspace_write.network_access=false", "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json")

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TextSha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [System.Convert]::ToHexString($hash).ToLowerInvariant()
}

function ConvertFrom-JsonLiteral([string]$Json) {
  return $Json | ConvertFrom-Json -DateKind String
}

function Invoke-NativeCapture([string]$FilePath, [string[]]$Arguments) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Native process did not start: $FilePath" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdoutTask.GetAwaiter().GetResult()
    Stderr = $stderrTask.GetAwaiter().GetResult()
  }
}

function Get-CanonicalPhysicalMap([string]$HelperPath, [System.Collections.Specialized.OrderedDictionary]$Paths) {
  $arguments = @($HelperPath) + @($Paths.Values)
  $result = Invoke-NativeCapture "node" $arguments
  if ($result.ExitCode -ne 0) { throw "Canonical path helper failed: $($result.Stderr.Trim())" }
  $values = @(ConvertFrom-JsonLiteral $result.Stdout)
  if ($values.Count -ne $Paths.Count) { throw "Canonical path helper returned the wrong path count" }
  $mapped = @{}
  $index = 0
  foreach ($key in $Paths.Keys) { $mapped[$key] = [string]$values[$index]; $index++ }
  return $mapped
}

function Assert-PowerShellHost($Lock) {
  $hostPath = [System.IO.Path]::GetFullPath([System.Environment]::ProcessPath)
  if (-not $hostPath.Equals([System.IO.Path]::GetFullPath($Lock.powerShellHostPath), [System.StringComparison]::OrdinalIgnoreCase) -or $PSVersionTable.PSVersion.ToString() -ne $Lock.powerShellVersion -or (Get-Sha256 $hostPath) -ne $Lock.powerShellHostSha256) {
    throw "PowerShell host path/version/hash mismatch"
  }
}

function Assert-JsonSchema([string]$SchemaPath, [string]$JsonPath, [string]$Label) {
  $schemaCheck = 'const fs=require("node:fs");const Ajv=require("ajv/dist/2020").default;const schema=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const value=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const validate=new Ajv({allErrors:true,strict:true,strictTypes:false,validateFormats:false}).compile(schema);if(!validate(value)){process.stderr.write(JSON.stringify(validate.errors));process.exit(1);}'
  $protocolRoot = Split-Path -Parent (Split-Path -Parent $SchemaPath)
  Push-Location $protocolRoot
  try { $result = Invoke-NativeCapture "node" @("-e", $schemaCheck, $SchemaPath, $JsonPath) } finally { Pop-Location }
  if ($result.ExitCode -ne 0) { throw "$Label schema invalid: $($result.Stderr.Trim())" }
}

function Invoke-Git([string]$Workdir, [string[]]$Arguments) {
  $output = (& git -C $Workdir @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed in $Workdir`: $output" }
  return $output
}

function Test-PathBeneath([string]$Root, [string]$Candidate) {
  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $candidatePath = [System.IO.Path]::GetFullPath($Candidate)
  return $candidatePath.StartsWith($rootPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}
function Test-PathsNestedOrEqual([string]$Left, [string]$Right) {
  $leftPath = [System.IO.Path]::GetFullPath($Left).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $rightPath = [System.IO.Path]::GetFullPath($Right).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  return $leftPath.Equals($rightPath, [System.StringComparison]::OrdinalIgnoreCase) -or (Test-PathBeneath $leftPath $rightPath) -or (Test-PathBeneath $rightPath $leftPath)
}
function Assert-PathsSeparate([string]$Left, [string]$Right, [string]$Label) {
  if (Test-PathsNestedOrEqual $Left $Right) { throw "$Label must be physically distinct and nonnested" }
}

function Assert-NoReparseAncestors([string]$Path, [string]$Label) {
  $cursor = [System.IO.Path]::GetFullPath($Path)
  while (-not [System.IO.File]::Exists($cursor) -and -not [System.IO.Directory]::Exists($cursor)) {
    $parent = [System.IO.Path]::GetDirectoryName($cursor)
    if ([string]::IsNullOrEmpty($parent) -or $parent -eq $cursor) { throw "$Label has no existing physical ancestor" }
    $cursor = $parent
  }
  while (-not [string]::IsNullOrEmpty($cursor)) {
    $item = Get-Item -LiteralPath $cursor -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw "$Label crosses a symlink, junction, or reparse point: $cursor" }
    $parent = [System.IO.Path]::GetDirectoryName($cursor)
    if ([string]::IsNullOrEmpty($parent) -or $parent -eq $cursor) { break }
    $cursor = $parent
  }
}

function Get-VisibleFilesystemSnapshot([string]$Root, [bool]$RejectReparse) {
  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $entries = [System.Collections.Generic.List[object]]::new()
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($rootPath)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force | Sort-Object FullName -CaseSensitive)) {
      $relative = [System.IO.Path]::GetRelativePath($rootPath, $item.FullName).Replace("\", "/")
      $isRootGit = $directory -eq $rootPath -and $item.Name -eq ".git"
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        if ($RejectReparse) { throw "Visible filesystem contains a symlink, junction, or reparse point: $relative" }
        $entries.Add([pscustomobject][ordered]@{ path = $relative; type = "reparse"; sha256 = $null; bytes = $null })
        continue
      }
      if ($isRootGit) { continue }
      if ($item.PSIsContainer) {
        $entries.Add([pscustomobject][ordered]@{ path = $relative; type = "directory"; sha256 = $null; bytes = $null })
        $pending.Push($item.FullName)
      } else {
        $entries.Add([pscustomobject][ordered]@{ path = $relative; type = "file"; sha256 = Get-Sha256 $item.FullName; bytes = $item.Length })
      }
    }
  }
  return [ordered]@{ version = "1.0.0"; entries = @($entries | Sort-Object path -CaseSensitive) }
}

$contractFullPath = [System.IO.Path]::GetFullPath($ContractPath)
$contract = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $contractFullPath -Raw)
$lockPath = [System.IO.Path]::GetFullPath($contract.lockPath)
$schemaPath = [System.IO.Path]::GetFullPath($contract.contractSchemaPath)
if ((Get-Sha256 $lockPath) -ne $contract.lockSha256) { throw "Frozen lock hash mismatch" }
if ((Get-Sha256 $schemaPath) -ne $contract.contractSchemaSha256) { throw "Runtime contract schema hash mismatch" }
Assert-JsonSchema $schemaPath $contractFullPath "Runtime contract"
$lock = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $lockPath -Raw)
Assert-PowerShellHost $lock
$canonicalPathHelperPath = [System.IO.Path]::GetFullPath($contract.canonicalPathHelperPath)
if ((Get-Sha256 $canonicalPathHelperPath) -ne $contract.canonicalPathHelperSha256 -or $contract.canonicalPathHelperSha256 -ne $lock.canonicalPathHelperSha256) { throw "Canonical path helper binding mismatch" }
$candidateCommitScriptPath = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSCommandPath) "commit-candidate.ps1"))
if ((Get-Sha256 $candidateCommitScriptPath) -ne $lock.candidateCommitScriptSha256) { throw "Supervisor commit helper binding mismatch" }
$builderManifestPath = [System.IO.Path]::GetFullPath($contract.builderInputManifestPath)
$builderManifestSchemaPath = [System.IO.Path]::GetFullPath($contract.builderInputManifestSchemaPath)
$builderAllowlistPath = [System.IO.Path]::GetFullPath($contract.builderInputAllowlistPath)
$builderPreparationScriptPath = [System.IO.Path]::GetFullPath($contract.builderInputPreparationScriptPath)
$pathsToCanonicalize = [ordered]@{
  contract = $contractFullPath
  lock = $lockPath
  schema = $schemaPath
  helper = $canonicalPathHelperPath
  commitHelper = $candidateCommitScriptPath
  manifest = $builderManifestPath
  manifestSchema = $builderManifestSchemaPath
  allowlist = $builderAllowlistPath
  preparationScript = $builderPreparationScriptPath
  prompt = [System.IO.Path]::GetFullPath($contract.promptPath)
  evidenceRoot = [System.IO.Path]::GetFullPath($contract.evidenceRoot)
}
foreach ($spec in $contract.invocations) {
  $prefix = $spec.invocationId
  $pathsToCanonicalize["$prefix.workdir"] = [System.IO.Path]::GetFullPath($spec.workdir)
  $pathsToCanonicalize["$prefix.git"] = [System.IO.Path]::GetFullPath((Join-Path $spec.workdir ".git"))
  foreach ($field in @("finalPath", "stdoutPath", "stderrPath", "evidencePath", "postStatePath", "tempRoot", "cacheRoot", "dependencyRoot")) { $pathsToCanonicalize["$prefix.$field"] = [System.IO.Path]::GetFullPath($spec.$field) }
}
$physical = Get-CanonicalPhysicalMap $canonicalPathHelperPath $pathsToCanonicalize
if ((Get-Sha256 $builderManifestPath) -ne $contract.builderInputManifestSha256) { throw "Builder input manifest hash mismatch" }
if ((Get-Sha256 $builderManifestSchemaPath) -ne $contract.builderInputManifestSchemaSha256 -or $contract.builderInputManifestSchemaSha256 -ne $lock.builderInputManifestSchemaSha256) { throw "Builder input manifest schema binding mismatch" }
if ((Get-Sha256 $builderAllowlistPath) -ne $contract.builderInputAllowlistSha256 -or $contract.builderInputAllowlistSha256 -ne $lock.builderInputAllowlistSha256) { throw "Builder input allowlist binding mismatch" }
if ((Get-Sha256 $builderPreparationScriptPath) -ne $contract.builderInputPreparationScriptSha256 -or $contract.builderInputPreparationScriptSha256 -ne $lock.builderInputPreparationScriptSha256) { throw "Builder input preparation script binding mismatch" }
Assert-JsonSchema $builderManifestSchemaPath $builderManifestPath "Builder input manifest"
$builderManifest = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $builderManifestPath -Raw)
if ($builderManifest.sourceCommit -ne $contract.sourceCommonStartCommit -or $builderManifest.sourceTree -ne $contract.sourceCommonStartTree -or $builderManifest.projectionCommit -ne $contract.commonStartCommit -or $builderManifest.projectionTree -ne $contract.commonStartTree -or $builderManifest.projectionSha256 -ne $contract.builderInputProjectionSha256 -or $builderManifest.allowlistSha256 -ne $contract.builderInputAllowlistSha256) { throw "Builder input manifest diverges from runtime contract" }
$expectedPromptSha256 = if ($contract.smokeMode) { $lock.runnerSmokePromptSha256 } else { $lock.neutralBuilderPromptSha256 }
if ($lock.cliBinarySha256 -ne $contract.cliSha256 -or $lock.cliRuntimeSchemaSha256 -ne $contract.contractSchemaSha256 -or $lock.cliRunnerSha256 -ne (Get-Sha256 $PSCommandPath) -or $expectedPromptSha256 -ne $contract.promptSha256) { throw "Contract does not match frozen lock runtime bindings" }
if (($contract.invariantArgv -join "`0") -ne ($ExpectedInvariant -join "`0")) { throw "Invariant argv or ordering mismatch" }
if ($contract.deadlineSeconds -lt 1 -or $contract.deadlineSeconds -gt 2400) { throw "Invalid external deadline" }
if ($contract.invocations.Count -ne 2) { throw "Exactly two invocations are required" }
if ((Get-Sha256 $contract.cliPath) -ne $contract.cliSha256) { throw "CLI binary hash mismatch" }
$versionResult = Invoke-NativeCapture $contract.cliPath @("--version")
if ($versionResult.ExitCode -ne 0 -or $versionResult.Stdout.Trim() -ne $contract.cliVersion) { throw "CLI version mismatch" }
$authResult = Invoke-NativeCapture $contract.cliPath @("login", "status")
if ($authResult.ExitCode -ne 0) { throw "ChatGPT auth status command failed" }
$authStatus = "$($authResult.Stdout)`n$($authResult.Stderr)".Trim()
if ($authStatus -notlike "*$($contract.authStatus)*") { throw "ChatGPT auth status mismatch" }
$promptBytes = [System.IO.File]::ReadAllBytes($physical.prompt)
if ((Get-Sha256 $contract.promptPath) -ne $contract.promptSha256) { throw "Raw stdin prompt hash mismatch" }
$evidenceRoot = $physical.evidenceRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if (-not [System.IO.Path]::IsPathFullyQualified($evidenceRoot)) { throw "Evidence root must be absolute" }
Assert-NoReparseAncestors $evidenceRoot "Evidence root"
if ([System.IO.Directory]::Exists($evidenceRoot) -and $null -ne (Get-ChildItem -LiteralPath $evidenceRoot -Force | Select-Object -First 1)) { throw "Evidence root must be fresh and empty" }

$ids = @($contract.invocations | ForEach-Object { $_.invocationId })
if (($ids | Select-Object -Unique).Count -ne 2) { throw "Opaque invocation IDs must be distinct" }
$workdirPaths = @()
$authoritativeOutputPaths = @()
$runtimeRootPaths = @()
$authoritativeOutputFields = @("finalPath", "stdoutPath", "stderrPath", "evidencePath", "postStatePath")
$runtimeRootFields = @("tempRoot", "cacheRoot", "dependencyRoot")
foreach ($spec in $contract.invocations) {
  $prefix = $spec.invocationId
  $workdir = $physical["$prefix.workdir"].TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $workdirPaths += $workdir
  Assert-NoReparseAncestors ([System.IO.Path]::GetFullPath($spec.workdir)) "Builder workdir"
  Assert-NoReparseAncestors ([System.IO.Path]::GetFullPath((Join-Path $spec.workdir ".git"))) "Builder Git directory"
  if (-not [System.IO.Directory]::Exists($workdir)) { throw "Workdir must exist" }
  Assert-PathsSeparate $workdir $evidenceRoot "Builder evidence root and workdir"
  foreach ($field in $authoritativeOutputFields) {
    $resolvedOutput = $physical["$prefix.$field"]
    $authoritativeOutputPaths += $resolvedOutput
    Assert-NoReparseAncestors ([System.IO.Path]::GetFullPath($spec.$field)) "Authoritative output"
    if (-not $resolvedOutput.StartsWith($evidenceRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Every output path must resolve beneath evidenceRoot" }
  }
  foreach ($field in $runtimeRootFields) {
    $runtimeRoot = $physical["$prefix.$field"]
    $runtimeRootPaths += $runtimeRoot
    Assert-NoReparseAncestors ([System.IO.Path]::GetFullPath($spec.$field)) "Builder runtime root"
  }
}
$privateInputPaths = @($physical.contract, $physical.lock, $physical.schema, $physical.helper, $physical.commitHelper, $physical.manifest, $physical.manifestSchema, $physical.allowlist, $physical.preparationScript, $physical.prompt)
$privateInputRawPaths = @($contractFullPath, $lockPath, $schemaPath, $canonicalPathHelperPath, $candidateCommitScriptPath, $builderManifestPath, $builderManifestSchemaPath, $builderAllowlistPath, $builderPreparationScriptPath, [System.IO.Path]::GetFullPath($contract.promptPath))
foreach ($privatePath in $privateInputRawPaths) { Assert-NoReparseAncestors $privatePath "Private runtime input" }
Assert-PathsSeparate $workdirPaths[0] $workdirPaths[1] "Builder workdirs"
for ($left = 0; $left -lt $authoritativeOutputPaths.Count; $left++) {
  foreach ($workdir in $workdirPaths) { Assert-PathsSeparate $authoritativeOutputPaths[$left] $workdir "Builder authoritative output and workdir" }
  for ($right = $left + 1; $right -lt $authoritativeOutputPaths.Count; $right++) { Assert-PathsSeparate $authoritativeOutputPaths[$left] $authoritativeOutputPaths[$right] "Builder authoritative outputs" }
}
for ($left = 0; $left -lt $runtimeRootPaths.Count; $left++) {
  $runtimeRoot = $runtimeRootPaths[$left]
  Assert-PathsSeparate $runtimeRoot $evidenceRoot "Builder runtime root and evidence root"
  foreach ($workdir in $workdirPaths) { Assert-PathsSeparate $runtimeRoot $workdir "Builder runtime root and workdir" }
  foreach ($outputPath in $authoritativeOutputPaths) { Assert-PathsSeparate $runtimeRoot $outputPath "Builder runtime root and authoritative output" }
  for ($right = $left + 1; $right -lt $runtimeRootPaths.Count; $right++) { Assert-PathsSeparate $runtimeRoot $runtimeRootPaths[$right] "Builder runtime roots" }
}
foreach ($privatePath in $privateInputPaths) {
  Assert-PathsSeparate $privatePath $evidenceRoot "Private builder input and evidence root"
  foreach ($workdir in $workdirPaths) { Assert-PathsSeparate $privatePath $workdir "Private builder input and workdir" }
  foreach ($outputPath in $authoritativeOutputPaths) { Assert-PathsSeparate $privatePath $outputPath "Private builder input and authoritative output" }
  foreach ($runtimeRoot in $runtimeRootPaths) { Assert-PathsSeparate $privatePath $runtimeRoot "Private builder input and runtime root" }
}
if (($contract.invocations.port | Select-Object -Unique).Count -ne 2) { throw "Candidate ports must be distinct" }

foreach ($spec in $contract.invocations) {
  $workdir = $physical["$($spec.invocationId).workdir"].TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  if (-not [System.IO.Directory]::Exists($physical["$($spec.invocationId).git"])) { throw "Builder input must be an independent full clone" }
  if ((Invoke-Git $workdir @("remote")).Length -ne 0) { throw "Builder clone remotes must be disabled" }
  if ((Invoke-Git $workdir @("rev-parse", "HEAD")) -ne $contract.commonStartCommit -or (Invoke-Git $workdir @("rev-parse", "HEAD^{tree}")) -ne $contract.commonStartTree) { throw "Builder common-start commit/tree mismatch" }
  if ((Invoke-Git $workdir @("rev-list", "--count", "HEAD")) -ne "1" -or (Invoke-Git $workdir @("rev-list", "--parents", "-n", "1", "HEAD")).Split(" ").Count -ne 1) { throw "Builder input must be a source-history-free root commit" }
  if ((Invoke-Git $workdir @("config", "--get", "core.autocrlf")) -ne "false") { throw "Builder clone must pin core.autocrlf=false" }
  $trackedPaths = @((Invoke-Git $workdir @("ls-files")) -split "\r?\n" | Where-Object { $_ -ne "" })
  $manifestPaths = @($builderManifest.files | ForEach-Object { $_.path })
  if (($trackedPaths -join "`0") -ne ($manifestPaths -join "`0")) { throw "Builder tracked paths diverge from the private allowlist manifest" }
  $projectionMaterial = [System.Text.StringBuilder]::new()
  foreach ($record in $builderManifest.files) {
    $filePath = Join-Path $workdir ($record.path.Replace("/", [System.IO.Path]::DirectorySeparatorChar))
    if (-not [System.IO.File]::Exists($filePath) -or (Get-Sha256 $filePath) -ne $record.sha256 -or ([System.IO.FileInfo]$filePath).Length -ne $record.bytes) { throw "Builder projected file does not match manifest: $($record.path)" }
    [void]$projectionMaterial.Append("$($record.path)`0$($record.sha256)`0$($record.bytes)`n")
  }
  $projectionBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($projectionMaterial.ToString())
  $projectionHash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::HashData($projectionBytes)).Replace("-", "").ToLowerInvariant()
  if ($projectionHash -ne $contract.builderInputProjectionSha256) { throw "Builder projection content hash mismatch" }
  $visibleSnapshot = Get-VisibleFilesystemSnapshot $workdir $true
  $visibleFiles = @($visibleSnapshot.entries | Where-Object { $_.type -eq "file" })
  $visibleDirectories = @($visibleSnapshot.entries | Where-Object { $_.type -eq "directory" } | ForEach-Object { $_.path })
  $expectedDirectories = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($manifestPath in $manifestPaths) {
    $parent = [System.IO.Path]::GetDirectoryName($manifestPath.Replace("/", [System.IO.Path]::DirectorySeparatorChar))
    while (-not [string]::IsNullOrEmpty($parent)) { [void]$expectedDirectories.Add($parent.Replace("\", "/")); $parent = [System.IO.Path]::GetDirectoryName($parent) }
  }
  $expectedDirectoryList = @($expectedDirectories); [Array]::Sort($expectedDirectoryList, [System.StringComparer]::Ordinal)
  if ((@($visibleFiles | ForEach-Object { $_.path }) -join "`0") -ne ($manifestPaths -join "`0") -or ($visibleDirectories -join "`0") -ne ($expectedDirectoryList -join "`0")) { throw "Builder visible filesystem contains unmanifested files or directories" }
  foreach ($index in 0..($builderManifest.files.Count - 1)) { if ($visibleFiles[$index].sha256 -ne $builderManifest.files[$index].sha256 -or $visibleFiles[$index].bytes -ne $builderManifest.files[$index].bytes) { throw "Builder visible filesystem bytes diverge from manifest" } }
  if ((Invoke-Git $workdir @("status", "--porcelain=v1")).Length -ne 0) { throw "Builder clone must start clean" }
}
[System.IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
foreach ($outputPath in $authoritativeOutputPaths) { [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($outputPath)) | Out-Null }

$runs = @()
foreach ($spec in $contract.invocations) {
  $prefix = $spec.invocationId
  $workdir = $physical["$prefix.workdir"]
  $argv = @($ExpectedInvariant + @("--add-dir", $physical["$prefix.tempRoot"], "--add-dir", $physical["$prefix.cacheRoot"], "--add-dir", $physical["$prefix.dependencyRoot"], "-C", $workdir, "-o", $physical["$prefix.finalPath"], "-"))
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $contract.cliPath
  $startInfo.WorkingDirectory = (Split-Path -Parent $contractFullPath)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($field in @("tempRoot", "cacheRoot", "dependencyRoot")) { [System.IO.Directory]::CreateDirectory($physical["$prefix.$field"]) | Out-Null }
  $startInfo.Environment["TEMP"] = $physical["$prefix.tempRoot"]; $startInfo.Environment["TMP"] = $physical["$prefix.tempRoot"]
  $startInfo.Environment["NPM_CONFIG_CACHE"] = $physical["$prefix.cacheRoot"]; $startInfo.Environment["CODEX_DEPENDENCY_ROOT"] = $physical["$prefix.dependencyRoot"]; $startInfo.Environment["PORT"] = [string]$spec.port
  foreach ($argument in $argv) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  $startedAt = [System.DateTimeOffset]::UtcNow
  $started = $false
  $startError = $null
  try { $started = $process.Start() } catch { $startError = $_.Exception.ToString() }
  $runs += [pscustomobject]@{
    spec = $spec; argv = $argv; process = $process; started = $started; startedAt = $startedAt; startError = $startError
    stdoutTask = if ($started) { $process.StandardOutput.ReadToEndAsync() } else { $null }
    stderrTask = if ($started) { $process.StandardError.ReadToEndAsync() } else { $null }
    stdinDelivered = $false; stdinError = $null; timedOut = $false
  }
}

foreach ($run in $runs | Where-Object { $_.started }) {
  try {
    $run.process.StandardInput.BaseStream.Write($promptBytes, 0, $promptBytes.Length)
    $run.process.StandardInput.Close()
    $run.stdinDelivered = $true
  } catch {
    $run.stdinError = $_.Exception.ToString()
    try { $run.process.StandardInput.Close() } catch {}
  }
}

$firstStart = ($runs | Where-Object { $_.started } | Sort-Object startedAt | Select-Object -First 1).startedAt
$deadline = if ($null -ne $firstStart) { $firstStart.AddSeconds($contract.deadlineSeconds) } else { [System.DateTimeOffset]::UtcNow }
while (($runs | Where-Object { $_.started -and -not $_.process.HasExited }).Count -gt 0 -and [System.DateTimeOffset]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
foreach ($run in $runs | Where-Object { $_.started -and -not $_.process.HasExited }) { $run.timedOut = $true; $run.process.Kill($true) }

$results = @()
foreach ($run in $runs) {
  $stdout = ""; $stderr = ""; $exitCode = $null; $processId = $null
  if ($run.started) {
    $run.process.WaitForExit()
    $stdout = $run.stdoutTask.GetAwaiter().GetResult()
    $stderr = $run.stderrTask.GetAwaiter().GetResult()
    $exitCode = $run.process.ExitCode
    $processId = $run.process.Id
  }
  $prefix = $run.spec.invocationId
  $stdoutPath = $physical["$prefix.stdoutPath"]
  $stderrPath = $physical["$prefix.stderrPath"]
  $evidencePath = $physical["$prefix.evidencePath"]
  $postStatePath = $physical["$prefix.postStatePath"]
  foreach ($outputPath in @($stdoutPath, $stderrPath, $evidencePath, $postStatePath, $physical["$prefix.finalPath"])) { [System.IO.Directory]::CreateDirectory((Split-Path -Parent $outputPath)) | Out-Null }
  [System.IO.File]::WriteAllText($stdoutPath, $stdout, $Utf8NoBom)
  [System.IO.File]::WriteAllText($stderrPath, $stderr, $Utf8NoBom)
  $events = @(); $rawJsonlValid = $true
  foreach ($line in ($stdout -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })) {
    try { $events += (ConvertFrom-JsonLiteral $line) } catch { $rawJsonlValid = $false }
  }
  $threadIds = @($events | Where-Object { $_.type -eq "thread.started" } | ForEach-Object { $_.thread_id })
  $turnEvents = @($events | Where-Object { $_.type -eq "turn.completed" })
  $turnCompleted = $turnEvents.Count -eq 1
  $usage = if ($turnEvents.Count -eq 1 -and $null -ne $turnEvents[0].usage) { $turnEvents[0].usage } else { $null }
  $commitInfo = $null; $commitError = $null
  $commitEligible = -not $contract.smokeMode -and $run.started -and $run.stdinDelivered -and -not $run.timedOut -and $exitCode -eq 0 -and $rawJsonlValid -and $threadIds.Count -eq 1 -and $turnCompleted -and [System.IO.File]::Exists($physical["$prefix.finalPath"])
  if ($commitEligible) {
    try {
      $commitInfo = (& $candidateCommitScriptPath -Workdir $physical["$prefix.workdir"] -ExpectedParent $contract.commonStartCommit -TemporaryIndexPath (Join-Path $physical["$prefix.dependencyRoot"] "supervisor-index") -Message "Seal neutral builder output" -Timestamp ([System.DateTimeOffset]::new($run.process.ExitTime.ToUniversalTime()).ToString("o"))) | ConvertFrom-JsonLiteral
    } catch { $commitError = $_.Exception.ToString() }
  }
  $postState = Get-VisibleFilesystemSnapshot $physical["$prefix.workdir"] $false
  [System.IO.File]::WriteAllText($postStatePath, ($postState | ConvertTo-Json -Depth 8), $Utf8NoBom)
  $result = [ordered]@{
    role = "builder"; invocationId = $run.spec.invocationId; contractSha256 = Get-Sha256 $contractFullPath; artifactSchemaSha256 = $null; processId = $processId; started = $run.started; startedAt = $run.startedAt.ToString("o")
    startError = $run.startError; stdinDelivered = $run.stdinDelivered; stdinError = $run.stdinError; exitCode = $exitCode; timedOut = $run.timedOut
    argv = $run.argv; argvSha256 = Get-TextSha256 ($run.argv -join "`0"); promptSha256 = $contract.promptSha256
    stdoutPath = $stdoutPath; stderrPath = $stderrPath; finalPath = $physical["$prefix.finalPath"]; finalSha256 = if ([System.IO.File]::Exists($physical["$prefix.finalPath"])) { Get-Sha256 $physical["$prefix.finalPath"] } else { $null }; finalSchemaValid = $null; artifactBindingValid = $null
    postStatePath = $postStatePath; postStateSha256 = Get-Sha256 $postStatePath
    inputCommit = $contract.commonStartCommit; supervisorCommit = if ($null -ne $commitInfo) { $commitInfo.commit } else { $null }; supervisorCommitTree = if ($null -ne $commitInfo) { $commitInfo.tree } else { $null }; supervisorCommitScriptSha256 = $lock.candidateCommitScriptSha256; supervisorCommitError = $commitError
    threadIds = $threadIds; turnCompleted = $turnCompleted; rawJsonlValid = $rawJsonlValid; unauthorizedToolOrWriteDetected = $null; unauthorizedToolOrWriteUnavailableReason = "runner cannot observe every external tool or write; scoped candidate checks are enforced separately"; sandboxMode = "workspace-write"; inputDisposition = "authorized-worktree-write"; isolationEnforcedBy = "audited-procedural-boundary-plus-cli-sandbox"
    usage = $usage; usageUnavailableReason = if ($null -eq $usage) { "turn.completed did not expose usage" } else { $null }
    runtimeModel = $null; runtimeModelUnavailableReason = "not present in trusted JSONL lifecycle metadata"
    runtimeProvider = $null; runtimeProviderUnavailableReason = "not present in trusted JSONL lifecycle metadata"
    reasoningSetting = $null; reasoningSettingUnavailableReason = "not present in trusted JSONL lifecycle metadata"; metadataSource = "unavailable"
    stdoutSha256 = Get-Sha256 $stdoutPath; stderrSha256 = Get-Sha256 $stderrPath
  }
  [System.IO.File]::WriteAllText($evidencePath, ($result | ConvertTo-Json -Depth 8), $Utf8NoBom)
  $results += [pscustomobject]$result
}

$threadIds = @($results | ForEach-Object { $_.threadIds })
$allowedEvidenceFiles = @($authoritativeOutputPaths | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object -Unique)
$actualEvidenceFiles = @((Get-ChildItem -LiteralPath $evidenceRoot -File -Recurse -Force | ForEach-Object { $_.FullName.ToLowerInvariant() }) | Sort-Object -Unique)
$allowedEvidenceDirectories = @()
foreach ($outputPath in $authoritativeOutputPaths) {
  $cursor = [System.IO.Path]::GetDirectoryName($outputPath)
  while (-not $cursor.Equals($evidenceRoot, [System.StringComparison]::OrdinalIgnoreCase)) { $allowedEvidenceDirectories += $cursor.ToLowerInvariant(); $cursor = [System.IO.Path]::GetDirectoryName($cursor) }
}
$allowedEvidenceDirectories = @($allowedEvidenceDirectories | Sort-Object -Unique)
$actualEvidenceDirectories = @((Get-ChildItem -LiteralPath $evidenceRoot -Directory -Recurse -Force | ForEach-Object { $_.FullName.ToLowerInvariant() }) | Sort-Object -Unique)
$evidenceShapeValid = ($allowedEvidenceFiles -join "`0") -eq ($actualEvidenceFiles -join "`0") -and ($allowedEvidenceDirectories -join "`0") -eq ($actualEvidenceDirectories -join "`0") -and (Get-ChildItem -LiteralPath $evidenceRoot -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 } | Measure-Object).Count -eq 0
$valid = ($results | Where-Object { -not $_.started -or -not $_.stdinDelivered -or $_.timedOut -or $_.exitCode -ne 0 -or $_.threadIds.Count -ne 1 -or -not $_.turnCompleted -or -not $_.rawJsonlValid -or $null -eq $_.finalSha256 -or $_.sandboxMode -ne "workspace-write" -or (-not $contract.smokeMode -and $null -eq $_.supervisorCommit) }).Count -eq 0 -and ($threadIds | Select-Object -Unique).Count -eq 2 -and $evidenceShapeValid
foreach ($run in $runs) { if ($run.started -and ((Invoke-Git $physical["$($run.spec.invocationId).workdir"] @("status", "--porcelain=v1")).Length -ne 0)) { $valid = $false } }
$summary = [ordered]@{
  contractSha256 = Get-Sha256 $contractFullPath; runnerMode = if ($contract.smokeMode) { "smoke" } else { "builder" }
  deadlineSeconds = $contract.deadlineSeconds; binarySha256 = $contract.cliSha256; authStatus = $contract.authStatus
  promptSha256 = $contract.promptSha256; results = $results; valid = $valid
}
$summary | ConvertTo-Json -Depth 10
if (-not $valid) { exit 1 }
