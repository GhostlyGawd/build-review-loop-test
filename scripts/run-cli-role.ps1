param(
  [Parameter(Mandatory = $true)]
  [string]$ContractPath
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$RolePolicy = @{
  reviewer = @{ Max = 900; Sandbox = "read-only"; Disposition = "read-only-snapshot"; PromptLock = "reviewerPromptTemplateSha256"; ArtifactLock = "reviewArtifactSchemaSha256" }
  fixer = @{ Max = 1500; Sandbox = "workspace-write"; Disposition = "authorized-worktree-write"; PromptLock = "fixerPromptTemplateSha256"; ArtifactLock = "fixArtifactSchemaSha256" }
  tester = @{ Max = 900; Sandbox = "workspace-write"; Disposition = "discard-after-run"; PromptLock = "testerPromptTemplateSha256"; ArtifactLock = "testArtifactSchemaSha256" }
  evaluator = @{ Max = 1800; Sandbox = "workspace-write"; Disposition = "discard-after-run"; PromptLock = "evaluatorPromptTemplateSha256"; ArtifactLock = "evaluationArtifactSchemaSha256" }
}

function Get-Sha256([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-TextSha256([string]$Value) { return [System.Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($Value))).ToLowerInvariant() }
function ConvertFrom-JsonLiteral([string]$Json) { return $Json | ConvertFrom-Json -DateKind String }
function Invoke-NativeCapture([string]$FilePath, [string[]]$Arguments) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new(); $startInfo.FileName = $FilePath; $startInfo.UseShellExecute = $false; $startInfo.CreateNoWindow = $true; $startInfo.RedirectStandardOutput = $true; $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add($argument) }
  $process = [System.Diagnostics.Process]::new(); $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "Native process did not start: $FilePath" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync(); $process.WaitForExit()
  return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdoutTask.GetAwaiter().GetResult(); Stderr = $stderrTask.GetAwaiter().GetResult() }
}
function Assert-PowerShellHost($Lock) {
  $hostPath = [System.IO.Path]::GetFullPath([System.Environment]::ProcessPath)
  if (-not $hostPath.Equals([System.IO.Path]::GetFullPath($Lock.powerShellHostPath), [System.StringComparison]::OrdinalIgnoreCase) -or $PSVersionTable.PSVersion.ToString() -ne $Lock.powerShellVersion -or (Get-Sha256 $hostPath) -ne $Lock.powerShellHostSha256) { throw "PowerShell host path/version/hash mismatch" }
}
function Invoke-Git([string]$Workdir, [string[]]$Arguments) { $output = (& git -C $Workdir @Arguments 2>&1 | Out-String).Trim(); if ($LASTEXITCODE -ne 0) { throw "git failed in $Workdir`: $output" }; return $output }
function Resolve-Beneath([string]$Root, [string]$Candidate) {
  $resolved = [System.IO.Path]::GetFullPath($Candidate)
  if (-not $resolved.StartsWith($Root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Output path escapes evidenceRoot" }
  return $resolved
}
function Test-NestedOrEqual([string]$Left, [string]$Right) {
  $leftPath = [System.IO.Path]::GetFullPath($Left).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $rightPath = [System.IO.Path]::GetFullPath($Right).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  return $leftPath.Equals($rightPath, [System.StringComparison]::OrdinalIgnoreCase) -or $leftPath.StartsWith($rightPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or $rightPath.StartsWith($leftPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}
function Test-HasGitAncestor([string]$Candidate) {
  $cursor = [System.IO.DirectoryInfo]::new([System.IO.Path]::GetFullPath($Candidate))
  while ($null -ne $cursor) {
    if ([System.IO.File]::Exists((Join-Path $cursor.FullName ".git")) -or [System.IO.Directory]::Exists((Join-Path $cursor.FullName ".git"))) { return $true }
    $cursor = $cursor.Parent
  }
  return $false
}
function Get-PackageSha256([string]$Directory) {
  $rootPath = [System.IO.Path]::GetFullPath($Directory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $records = foreach ($file in (Get-ChildItem -LiteralPath $rootPath -File -Recurse -Force | Sort-Object { [System.IO.Path]::GetRelativePath($rootPath, $_.FullName).Replace('\', '/') })) {
    $relative = [System.IO.Path]::GetRelativePath($rootPath, $file.FullName).Replace('\', '/')
    "$relative`0$(Get-Sha256 $file.FullName)`n"
  }
  return Get-TextSha256 ($records -join "")
}

$contractFullPath = [System.IO.Path]::GetFullPath($ContractPath)
$contract = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $contractFullPath -Raw)
$lockPath = [System.IO.Path]::GetFullPath($contract.lockPath); $schemaPath = [System.IO.Path]::GetFullPath($contract.contractSchemaPath)
$runnerPath = [System.IO.Path]::GetFullPath($contract.runnerPath); $evidenceSchemaPath = [System.IO.Path]::GetFullPath($contract.evidenceSchemaPath)
$promptTemplatePath = [System.IO.Path]::GetFullPath($contract.promptTemplatePath); $artifactSchemaPath = [System.IO.Path]::GetFullPath($contract.artifactSchemaPath)
if ((Get-Sha256 $lockPath) -ne $contract.lockSha256 -or (Get-Sha256 $schemaPath) -ne $contract.contractSchemaSha256 -or (Get-Sha256 $runnerPath) -ne $contract.runnerSha256 -or (Get-Sha256 $evidenceSchemaPath) -ne $contract.evidenceSchemaSha256 -or (Get-Sha256 $promptTemplatePath) -ne $contract.promptTemplateSha256 -or (Get-Sha256 $artifactSchemaPath) -ne $contract.artifactSchemaSha256) { throw "Frozen lock, runner, prompt, or schema hash mismatch" }
$lock = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $lockPath -Raw)
Assert-PowerShellHost $lock
$policy = $RolePolicy[$contract.role]
if ($null -eq $policy) { throw "Unsupported model role" }
if (-not $runnerPath.Equals([System.IO.Path]::GetFullPath($PSCommandPath), [System.StringComparison]::OrdinalIgnoreCase) -or $lock.cliBinarySha256 -ne $contract.cliSha256 -or $lock.roleRuntimeSchemaSha256 -ne $contract.contractSchemaSha256 -or $lock.roleRunnerSha256 -ne $contract.runnerSha256 -or $lock.supervisionEvidenceSchemaSha256 -ne $contract.evidenceSchemaSha256 -or $lock.($policy.PromptLock) -ne $contract.promptTemplateSha256 -or $lock.($policy.ArtifactLock) -ne $contract.artifactSchemaSha256) { throw "Role contract does not match frozen lock bindings" }
if ($contract.deadlineSeconds -lt 1 -or $contract.deadlineSeconds -gt $policy.Max) { throw "Invalid role deadline" }
if ($contract.sandboxMode -ne $policy.Sandbox -or $contract.inputDisposition -ne $policy.Disposition) { throw "Role isolation policy mismatch" }
if ((Get-Sha256 $contract.cliPath) -ne $contract.cliSha256) { throw "CLI binary hash mismatch" }
$versionResult = Invoke-NativeCapture $contract.cliPath @("--version")
if ($versionResult.ExitCode -ne 0 -or $versionResult.Stdout.Trim() -ne $contract.cliVersion) { throw "CLI version mismatch" }
$authResult = Invoke-NativeCapture $contract.cliPath @("login", "status")
if ($authResult.ExitCode -ne 0 -or "$($authResult.Stdout)`n$($authResult.Stderr)".Trim() -notlike "*$($contract.authStatus)*") { throw "ChatGPT auth status mismatch" }
$promptBytes = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($contract.promptPath))
if ((Get-Sha256 $contract.promptPath) -ne $contract.promptSha256) { throw "Raw stdin prompt hash mismatch" }
$renderedPrompt = [System.IO.File]::ReadAllText($promptTemplatePath)
foreach ($substitution in $contract.promptSubstitutions.PSObject.Properties) {
  $token = "{{$($substitution.Name)}}"
  if (-not $renderedPrompt.Contains($token)) { throw "Prompt substitution is not authorized by the frozen template" }
  $renderedPrompt = $renderedPrompt.Replace($token, [string]$substitution.Value)
}
if ($renderedPrompt -match '\{\{[A-Z0-9_]+\}\}' -or -not [System.Linq.Enumerable]::SequenceEqual([byte[]]$promptBytes, [byte[]][System.Text.Encoding]::UTF8.GetBytes($renderedPrompt))) { throw "Rendered prompt does not derive exactly from frozen template substitutions" }
if ($contract.role -eq "fixer" -and (Get-Sha256 ([System.IO.Path]::GetFullPath($contract.handoffPath))) -ne $contract.handoffSha256) { throw "Fixer finding handoff hash mismatch" }
$workdir = [System.IO.Path]::GetFullPath($contract.workdir).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if (-not [System.IO.Directory]::Exists($workdir)) { throw "Workdir must exist" }
$substitutions = @{}; foreach ($property in $contract.promptSubstitutions.PSObject.Properties) { $substitutions[$property.Name] = [string]$property.Value; if ($substitutions[$property.Name] -match "[`r`n]" -or $substitutions[$property.Name] -match '\{\{') { throw "Prompt substitutions must be single-line literal values" } }
$expectedSubstitutionKeys = if ($contract.role -eq "fixer") { @("CANDIDATE_LABEL", "CYCLE_NUMBER", "SNAPSHOT_COMMIT", "FINDINGS_PATH", "WALL_CLOCK_DEADLINE_ISO") } elseif ($contract.role -eq "evaluator") { @("PACKAGE_LABEL", "PACKAGE_PATH", "EVALUATION_SEQUENCE", "RUBRIC_PATH", "EVALUATION_SCHEMA_PATH", "HIDDEN_SUITE_PATH", "HIDDEN_SUITE_SHA256", "WALL_CLOCK_DEADLINE_ISO") } else { @("CANDIDATE_LABEL", "CYCLE_NUMBER", "SNAPSHOT_COMMIT", "WALL_CLOCK_DEADLINE_ISO") }
if ((@($substitutions.Keys | Sort-Object) -join "`0") -ne (@($expectedSubstitutionKeys | Sort-Object) -join "`0") -or $substitutions.WALL_CLOCK_DEADLINE_ISO -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$') { throw "Role prompt substitution keys or deadline are invalid" }
if ($contract.role -eq "evaluator") {
  if ($substitutions.PACKAGE_LABEL -ne $contract.packageLabel -or -not ([System.IO.Path]::GetFullPath($substitutions.PACKAGE_PATH).Equals($workdir, [System.StringComparison]::OrdinalIgnoreCase)) -or $substitutions.EVALUATION_SEQUENCE -ne [string]$contract.evaluationSequence -or -not ([System.IO.Path]::GetFullPath($substitutions.RUBRIC_PATH).Equals([System.IO.Path]::GetFullPath($contract.rubricPath), [System.StringComparison]::OrdinalIgnoreCase)) -or -not ([System.IO.Path]::GetFullPath($substitutions.EVALUATION_SCHEMA_PATH).Equals($artifactSchemaPath, [System.StringComparison]::OrdinalIgnoreCase)) -or -not ([System.IO.Path]::GetFullPath($substitutions.HIDDEN_SUITE_PATH).Equals([System.IO.Path]::GetFullPath($contract.hiddenSuitePath), [System.StringComparison]::OrdinalIgnoreCase)) -or $substitutions.HIDDEN_SUITE_SHA256 -ne $contract.hiddenSuiteSha256) { throw "Evaluator prompt substitutions diverge from contract inputs" }
} else {
  if ($substitutions.CANDIDATE_LABEL -ne $contract.candidateLabel -or $substitutions.CYCLE_NUMBER -ne [string]$contract.cycle -or $substitutions.SNAPSHOT_COMMIT -ne $contract.inputCommit) { throw "Role prompt substitutions diverge from candidate input" }
  if ($contract.role -eq "fixer" -and -not ([System.IO.Path]::GetFullPath($substitutions.FINDINGS_PATH).Equals([System.IO.Path]::GetFullPath($contract.handoffPath), [System.StringComparison]::OrdinalIgnoreCase))) { throw "Fixer prompt handoff path diverges from contract" }
}
$gitDirectory = Join-Path $workdir ".git"
if ($contract.role -eq "evaluator") {
  if (Test-HasGitAncestor $workdir) { throw "Evaluator package must be history-free and outside every Git worktree" }
  $packageManifestPath = [System.IO.Path]::GetFullPath($contract.packageManifestPath)
  $packageManifestSchemaPath = [System.IO.Path]::GetFullPath($contract.packageManifestSchemaPath)
  $packageScriptPath = [System.IO.Path]::GetFullPath($contract.packageScriptPath)
  $rubricPath = [System.IO.Path]::GetFullPath($contract.rubricPath)
  $hiddenSuitePath = [System.IO.Path]::GetFullPath($contract.hiddenSuitePath)
  if (Test-NestedOrEqual $packageManifestPath $workdir) { throw "Private package manifest must remain outside evaluator input" }
  if ((Get-Sha256 $packageManifestPath) -ne $contract.packageManifestSha256 -or (Get-Sha256 $packageManifestSchemaPath) -ne $contract.packageManifestSchemaSha256 -or (Get-Sha256 $packageScriptPath) -ne $contract.packageScriptSha256 -or (Get-Sha256 $rubricPath) -ne $contract.rubricSha256 -or (Get-Sha256 $hiddenSuitePath) -ne $contract.hiddenSuiteSha256) { throw "Evaluator package, rubric, hidden-suite, or packaging commitment mismatch" }
  if ($lock.blindedPackageSchemaSha256 -ne $contract.packageManifestSchemaSha256 -or $lock.blindedPackageScriptSha256 -ne $contract.packageScriptSha256 -or $lock.rubricSha256 -ne $contract.rubricSha256 -or $lock.hiddenSuiteId -ne $contract.hiddenSuiteId -or $lock.hiddenSuiteSha256 -ne $contract.hiddenSuiteSha256) { throw "Evaluator inputs do not match frozen lock" }
  $manifestCheck = 'const fs=require("node:fs");const Ajv=require("ajv/dist/2020").default;const ajv=new Ajv({allErrors:true,strict:true,strictTypes:false,validateFormats:false});process.exit(ajv.compile(JSON.parse(fs.readFileSync(process.argv[1],"utf8")))(JSON.parse(fs.readFileSync(process.argv[2],"utf8")))?0:1);'
  $protocolRoot = Split-Path -Parent (Split-Path -Parent $lockPath)
  Push-Location $protocolRoot
  try { & node -e $manifestCheck $packageManifestSchemaPath $packageManifestPath 2>$null; $manifestValid = $LASTEXITCODE -eq 0 } finally { Pop-Location }
  if (-not $manifestValid) { throw "Evaluator package manifest schema invalid" }
  $packageManifest = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $packageManifestPath -Raw)
  $packageEntry = @($packageManifest.packages | Where-Object { $_.packageLabel -eq $contract.packageLabel })
  if ($packageManifest.frozenGateSetSha256 -ne $lock.frozenGateSetSha256 -or $packageEntry.Count -ne 1 -or $packageEntry[0].packageSha256 -ne $contract.packageSha256 -or (Get-PackageSha256 $workdir) -ne $contract.packageSha256) { throw "Evaluator workdir does not match its blinded package commitment" }
} else {
  if (-not [System.IO.Directory]::Exists($gitDirectory)) { throw "Role input must be an independent full clone" }
  if ((Invoke-Git $workdir @("remote")).Length -ne 0) { throw "Role clone remotes must be disabled" }
  if ((Invoke-Git $workdir @("rev-parse", "HEAD")) -ne $contract.inputCommit -or (Invoke-Git $workdir @("rev-parse", "HEAD^{tree}")) -ne $contract.inputTree) { throw "Role input commit/tree mismatch" }
  if ((Invoke-Git $workdir @("status", "--porcelain=v1")).Length -ne 0) { throw "Role clone must start clean" }
}
$evidenceRoot = [System.IO.Path]::GetFullPath($contract.evidenceRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
[void](Resolve-Beneath $evidenceRoot $contract.tempRoot); [void](Resolve-Beneath $evidenceRoot $contract.cacheRoot); [void](Resolve-Beneath $evidenceRoot $contract.dependencyRoot)
if (Test-NestedOrEqual $evidenceRoot $workdir) { throw "Evidence root and role input must be separate and nonnested" }
if ([System.IO.Directory]::Exists($evidenceRoot) -and $null -ne (Get-ChildItem -LiteralPath $evidenceRoot -Force | Select-Object -First 1)) { throw "Evidence root must be fresh and empty" }
[System.IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
$finalPath = Resolve-Beneath $evidenceRoot $contract.finalPath
$stdoutPath = Resolve-Beneath $evidenceRoot $contract.stdoutPath
$stderrPath = Resolve-Beneath $evidenceRoot $contract.stderrPath
$evidencePath = Resolve-Beneath $evidenceRoot $contract.evidencePath
$runtimePaths = @($finalPath, $stdoutPath, $stderrPath, $evidencePath, [System.IO.Path]::GetFullPath($contract.tempRoot), [System.IO.Path]::GetFullPath($contract.cacheRoot), [System.IO.Path]::GetFullPath($contract.dependencyRoot))
if (($runtimePaths | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique).Count -ne $runtimePaths.Count) { throw "Role runtime paths must be distinct" }
for ($left = 4; $left -lt $runtimePaths.Count; $left++) { for ($right = $left + 1; $right -lt $runtimePaths.Count; $right++) { if (Test-NestedOrEqual $runtimePaths[$left] $runtimePaths[$right]) { throw "Role temp, cache, and dependency roots must be nonnested" } } }
foreach ($output in @($finalPath, $stdoutPath, $stderrPath, $evidencePath)) { [System.IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null }
foreach ($runtimeRoot in @($contract.tempRoot, $contract.cacheRoot, $contract.dependencyRoot)) { [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetFullPath($runtimeRoot)) | Out-Null }
$argv = @("-a", "never", "-m", "gpt-5.4", "-c", 'model_reasoning_effort="xhigh"', "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", $contract.sandboxMode, "--json", "-C", $workdir, "-o", $finalPath, "-")
$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $contract.cliPath
$startInfo.WorkingDirectory = $workdir
$startInfo.UseShellExecute = $false; $startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardInput = $true; $startInfo.RedirectStandardOutput = $true; $startInfo.RedirectStandardError = $true
$startInfo.Environment["TEMP"] = [System.IO.Path]::GetFullPath($contract.tempRoot); $startInfo.Environment["TMP"] = [System.IO.Path]::GetFullPath($contract.tempRoot); $startInfo.Environment["NPM_CONFIG_CACHE"] = [System.IO.Path]::GetFullPath($contract.cacheRoot); $startInfo.Environment["CODEX_DEPENDENCY_ROOT"] = [System.IO.Path]::GetFullPath($contract.dependencyRoot); $startInfo.Environment["PORT"] = [string]$contract.port
foreach ($argument in $argv) { [void]$startInfo.ArgumentList.Add($argument) }
$process = [System.Diagnostics.Process]::new(); $process.StartInfo = $startInfo
$startedAt = [System.DateTimeOffset]::UtcNow; $started = $false; $startError = $null; $stdinDelivered = $false; $stdinError = $null; $timedOut = $false
try { $started = $process.Start() } catch { $startError = $_.Exception.ToString() }
$stdoutTask = if ($started) { $process.StandardOutput.ReadToEndAsync() } else { $null }
$stderrTask = if ($started) { $process.StandardError.ReadToEndAsync() } else { $null }
if ($started) {
  try { $process.StandardInput.BaseStream.Write($promptBytes, 0, $promptBytes.Length); $process.StandardInput.Close(); $stdinDelivered = $true } catch { $stdinError = $_.Exception.ToString(); try { $process.StandardInput.Close() } catch {} }
  if (-not $process.WaitForExit($contract.deadlineSeconds * 1000)) { $timedOut = $true; $process.Kill($true); $process.WaitForExit() }
}
$stdout = if ($started) { $stdoutTask.GetAwaiter().GetResult() } else { "" }
$stderr = if ($started) { $stderrTask.GetAwaiter().GetResult() } else { "" }
[System.IO.File]::WriteAllText($stdoutPath, $stdout, $Utf8NoBom); [System.IO.File]::WriteAllText($stderrPath, $stderr, $Utf8NoBom)
$events = @(); $rawJsonlValid = $true; foreach ($line in ($stdout -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })) { try { $events += (ConvertFrom-JsonLiteral $line) } catch { $rawJsonlValid = $false } }
$threadIds = @($events | Where-Object { $_.type -eq "thread.started" } | ForEach-Object { $_.thread_id })
$turnEvents = @($events | Where-Object { $_.type -eq "turn.completed" })
$usage = if ($turnEvents.Count -eq 1 -and $null -ne $turnEvents[0].usage) { $turnEvents[0].usage } else { $null }
$finalSha256 = $null
$finalSchemaValid = $false
$artifactBindingValid = $false
if ([System.IO.File]::Exists($finalPath) -and $threadIds.Count -eq 1 -and $started) {
  try {
    $artifact = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $finalPath -Raw)
    $artifact.PSObject.Properties.Remove("runtimeEvidenceSha256")
    $artifact | Add-Member -NotePropertyName runtimeInvocationId -NotePropertyValue $contract.invocationId -Force
    $artifact | Add-Member -NotePropertyName runtimeProcessId -NotePropertyValue $process.Id -Force
    $artifact | Add-Member -NotePropertyName runtimeThreadId -NotePropertyValue $threadIds[0] -Force
    [System.IO.File]::WriteAllText($finalPath, ($artifact | ConvertTo-Json -Depth 20), $Utf8NoBom)
    $finalSha256 = Get-Sha256 $finalPath
  } catch { $finalSha256 = $null }
}
if ($null -ne $finalSha256) {
  $schemaCheck = 'const fs=require("node:fs");const Ajv=require("ajv/dist/2020").default;const schema=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const ajv=new Ajv({allErrors:true,strict:true,strictTypes:false,validateFormats:false});const findingPath=require("node:path").join(require("node:path").dirname(process.argv[1]),"finding.schema.json");if(fs.existsSync(findingPath))ajv.addSchema(JSON.parse(fs.readFileSync(findingPath,"utf8")));const valid=ajv.compile(schema)(JSON.parse(fs.readFileSync(process.argv[2],"utf8")));process.exit(valid?0:1);'
  $protocolRoot = Split-Path -Parent (Split-Path -Parent $lockPath)
  Push-Location $protocolRoot
  try { & node -e $schemaCheck $artifactSchemaPath $finalPath 2>$null; $finalSchemaValid = $LASTEXITCODE -eq 0 } finally { Pop-Location }
  if ($finalSchemaValid) {
    $artifact = ConvertFrom-JsonLiteral (Get-Content -LiteralPath $finalPath -Raw)
    $runtimeIdentityValid = $artifact.runtimeInvocationId -eq $contract.invocationId -and $artifact.runtimeProcessId -eq $process.Id -and $artifact.runtimeThreadId -eq $threadIds[0]
    if ($contract.role -eq "reviewer") { $artifactBindingValid = $runtimeIdentityValid -and $artifact.snapshotCommit -eq $contract.inputCommit }
    elseif ($contract.role -eq "fixer") { $finalCommit = Invoke-Git $workdir @("rev-parse", "HEAD"); $commitLine = (Invoke-Git $workdir @("rev-list", "--parents", "-n", "1", "HEAD")) -split " "; $artifactBindingValid = $runtimeIdentityValid -and $artifact.startCommit -eq $contract.inputCommit -and $artifact.finalCommit -eq $finalCommit -and $commitLine.Count -eq 2 -and $commitLine[1] -eq $contract.inputCommit }
    elseif ($contract.role -eq "tester") { $artifactBindingValid = $runtimeIdentityValid -and $artifact.snapshotCommit -eq $contract.inputCommit }
    else { $artifactBindingValid = $runtimeIdentityValid -and $artifact.packageLabel -eq $contract.packageLabel -and $artifact.packageSha256 -eq $contract.packageSha256 }
  }
}
$result = [ordered]@{
  role = $contract.role; invocationId = $contract.invocationId; contractSha256 = Get-Sha256 $contractFullPath; artifactSchemaSha256 = $contract.artifactSchemaSha256; processId = if ($started) { $process.Id } else { $null }; started = $started; startedAt = $startedAt.ToString("o"); startError = $startError
  stdinDelivered = $stdinDelivered; stdinError = $stdinError; exitCode = if ($started) { $process.ExitCode } else { $null }; timedOut = $timedOut; argv = $argv; argvSha256 = Get-TextSha256 ($argv -join "`0"); promptSha256 = $contract.promptSha256
  stdoutPath = $stdoutPath; stderrPath = $stderrPath; finalPath = $finalPath; finalSha256 = $finalSha256; finalSchemaValid = $finalSchemaValid; artifactBindingValid = $artifactBindingValid; threadIds = $threadIds; turnCompleted = $turnEvents.Count -eq 1; rawJsonlValid = $rawJsonlValid; unauthorizedToolOrWriteDetected = $null; unauthorizedToolOrWriteUnavailableReason = "runner cannot observe every external tool or write; scoped input checks are enforced separately"; sandboxMode = $contract.sandboxMode; inputDisposition = $contract.inputDisposition; isolationEnforcedBy = "audited-procedural-boundary-plus-cli-sandbox"
  usage = $usage; usageUnavailableReason = if ($null -eq $usage) { "turn.completed did not expose usage" } else { $null }
  runtimeModel = $null; runtimeModelUnavailableReason = "not present in trusted JSONL lifecycle metadata"; runtimeProvider = $null; runtimeProviderUnavailableReason = "not present in trusted JSONL lifecycle metadata"; reasoningSetting = $null; reasoningSettingUnavailableReason = "not present in trusted JSONL lifecycle metadata"; metadataSource = "unavailable"
  stdoutSha256 = Get-Sha256 $stdoutPath; stderrSha256 = Get-Sha256 $stderrPath
}
[System.IO.File]::WriteAllText($evidencePath, ($result | ConvertTo-Json -Depth 10), $Utf8NoBom)
$valid = $result.started -and $result.stdinDelivered -and -not $result.timedOut -and $result.exitCode -eq 0 -and $result.threadIds.Count -eq 1 -and $result.turnCompleted -and $result.rawJsonlValid -and $result.finalSchemaValid -and $result.artifactBindingValid
if ($contract.role -in @("reviewer", "fixer") -and (Invoke-Git $workdir @("status", "--porcelain=v1")).Length -ne 0) { $valid = $false }
if ($contract.role -eq "reviewer" -and ((Invoke-Git $workdir @("rev-parse", "HEAD")) -ne $contract.inputCommit -or (Invoke-Git $workdir @("rev-parse", "HEAD^{tree}")) -ne $contract.inputTree)) { $valid = $false }
if ($contract.role -eq "tester" -and ((Invoke-Git $workdir @("status", "--porcelain=v1")).Length -ne 0 -or (Invoke-Git $workdir @("rev-parse", "HEAD")) -ne $contract.inputCommit -or (Invoke-Git $workdir @("rev-parse", "HEAD^{tree}")) -ne $contract.inputTree)) { $valid = $false }
if ($contract.role -eq "evaluator" -and (Get-PackageSha256 $workdir) -ne $contract.packageSha256) { $valid = $false }
[ordered]@{ contractSha256 = Get-Sha256 $contractFullPath; result = $result; valid = $valid } | ConvertTo-Json -Depth 12
if (-not $valid) { exit 1 }
