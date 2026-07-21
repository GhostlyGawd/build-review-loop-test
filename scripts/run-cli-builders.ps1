param(
  [Parameter(Mandatory = $true)]
  [string]$ContractPath
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ExpectedInvariant = @("-a", "never", "-m", "gpt-5.4", "-c", 'model_reasoning_effort="xhigh"', "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json")

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TextSha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [System.Convert]::ToHexString($hash).ToLowerInvariant()
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

$contractFullPath = [System.IO.Path]::GetFullPath($ContractPath)
$contract = Get-Content -LiteralPath $contractFullPath -Raw | ConvertFrom-Json
$lockPath = [System.IO.Path]::GetFullPath($contract.lockPath)
$schemaPath = [System.IO.Path]::GetFullPath($contract.contractSchemaPath)
if ((Get-Sha256 $lockPath) -ne $contract.lockSha256) { throw "Frozen lock hash mismatch" }
if ((Get-Sha256 $schemaPath) -ne $contract.contractSchemaSha256) { throw "Runtime contract schema hash mismatch" }
$lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json
if ($lock.cliBinarySha256 -ne $contract.cliSha256 -or $lock.cliRuntimeSchemaSha256 -ne $contract.contractSchemaSha256 -or $lock.cliRunnerSha256 -ne (Get-Sha256 $PSCommandPath) -or $lock.neutralBuilderPromptSha256 -ne $contract.promptSha256) { throw "Contract does not match frozen lock runtime bindings" }
if (($contract.invariantArgv -join "`0") -ne ($ExpectedInvariant -join "`0")) { throw "Invariant argv or ordering mismatch" }
if ($contract.deadlineSeconds -lt 1 -or $contract.deadlineSeconds -gt 2400) { throw "Invalid external deadline" }
if ($contract.invocations.Count -ne 2) { throw "Exactly two invocations are required" }
if ((Get-Sha256 $contract.cliPath) -ne $contract.cliSha256) { throw "CLI binary hash mismatch" }
$version = (& $contract.cliPath --version 2>&1 | Out-String).Trim()
if ($version -ne $contract.cliVersion) { throw "CLI version mismatch" }
$authStatus = (& $contract.cliPath login status 2>&1 | Out-String).Trim()
if ($authStatus -notlike "*$($contract.authStatus)*") { throw "ChatGPT auth status mismatch" }
$promptBytes = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($contract.promptPath))
if ((Get-Sha256 $contract.promptPath) -ne $contract.promptSha256) { throw "Raw stdin prompt hash mismatch" }
$evidenceRoot = [System.IO.Path]::GetFullPath($contract.evidenceRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
if (-not [System.IO.Path]::IsPathFullyQualified($evidenceRoot)) { throw "Evidence root must be absolute" }
if ([System.IO.Directory]::Exists($evidenceRoot) -and $null -ne (Get-ChildItem -LiteralPath $evidenceRoot -Force | Select-Object -First 1)) { throw "Evidence root must be fresh and empty" }
[System.IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null

$ids = @($contract.invocations | ForEach-Object { $_.invocationId })
if (($ids | Select-Object -Unique).Count -ne 2) { throw "Opaque invocation IDs must be distinct" }
$variablePaths = @()
foreach ($spec in $contract.invocations) {
  $variablePaths += @($spec.workdir, $spec.finalPath, $spec.stdoutPath, $spec.stderrPath, $spec.evidencePath, $spec.tempRoot, $spec.cacheRoot, $spec.dependencyRoot)
  $workdir = [System.IO.Path]::GetFullPath($spec.workdir).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  if (-not [System.IO.Directory]::Exists($workdir)) { throw "Workdir must exist" }
  if (-not [System.IO.Directory]::Exists((Join-Path $workdir ".git"))) { throw "Builder input must be an independent full clone" }
  if ((Invoke-Git $workdir @("remote")).Length -ne 0) { throw "Builder clone remotes must be disabled" }
  if ((Invoke-Git $workdir @("rev-parse", "HEAD")) -ne $contract.commonStartCommit -or (Invoke-Git $workdir @("rev-parse", "HEAD^{tree}")) -ne $contract.commonStartTree) { throw "Builder common-start commit/tree mismatch" }
  if ((Invoke-Git $workdir @("status", "--porcelain=v1")).Length -ne 0) { throw "Builder clone must start clean" }
  if (Test-PathsNestedOrEqual $workdir $evidenceRoot) { throw "Evidence root and candidate clone must be separate and nonnested" }
  foreach ($outputPath in @($spec.finalPath, $spec.stdoutPath, $spec.stderrPath, $spec.evidencePath, $spec.tempRoot, $spec.cacheRoot, $spec.dependencyRoot)) {
    $resolvedOutput = [System.IO.Path]::GetFullPath($outputPath)
    if (-not $resolvedOutput.StartsWith($evidenceRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Every output path must resolve beneath evidenceRoot" }
    if (Test-PathBeneath $workdir $resolvedOutput) { throw "Runtime output may not be inside a candidate clone" }
  }
}
if ((Test-PathBeneath $contract.invocations[0].workdir $contract.invocations[1].workdir) -or (Test-PathBeneath $contract.invocations[1].workdir $contract.invocations[0].workdir)) { throw "Candidate clones must be nonnested" }
if (($contract.invocations.port | Select-Object -Unique).Count -ne 2) { throw "Candidate ports must be distinct" }
if (($variablePaths | ForEach-Object { [System.IO.Path]::GetFullPath($_).ToLowerInvariant() } | Select-Object -Unique).Count -ne $variablePaths.Count) { throw "Runtime paths must be distinct" }

$runs = @()
foreach ($spec in $contract.invocations) {
  $workdir = [System.IO.Path]::GetFullPath($spec.workdir)
  $argv = @($ExpectedInvariant + @("-C", $workdir, "-o", [System.IO.Path]::GetFullPath($spec.finalPath), "-"))
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $contract.cliPath
  $startInfo.WorkingDirectory = (Split-Path -Parent $contractFullPath)
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($runtimeRoot in @($spec.tempRoot, $spec.cacheRoot, $spec.dependencyRoot)) { [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetFullPath($runtimeRoot)) | Out-Null }
  $startInfo.Environment["TEMP"] = [System.IO.Path]::GetFullPath($spec.tempRoot); $startInfo.Environment["TMP"] = [System.IO.Path]::GetFullPath($spec.tempRoot)
  $startInfo.Environment["NPM_CONFIG_CACHE"] = [System.IO.Path]::GetFullPath($spec.cacheRoot); $startInfo.Environment["CODEX_DEPENDENCY_ROOT"] = [System.IO.Path]::GetFullPath($spec.dependencyRoot); $startInfo.Environment["PORT"] = [string]$spec.port
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
  $stdoutPath = [System.IO.Path]::GetFullPath($run.spec.stdoutPath)
  $stderrPath = [System.IO.Path]::GetFullPath($run.spec.stderrPath)
  $evidencePath = [System.IO.Path]::GetFullPath($run.spec.evidencePath)
  foreach ($outputPath in @($stdoutPath, $stderrPath, $evidencePath, [System.IO.Path]::GetFullPath($run.spec.finalPath))) { [System.IO.Directory]::CreateDirectory((Split-Path -Parent $outputPath)) | Out-Null }
  [System.IO.File]::WriteAllText($stdoutPath, $stdout, $Utf8NoBom)
  [System.IO.File]::WriteAllText($stderrPath, $stderr, $Utf8NoBom)
  $events = @(); $rawJsonlValid = $true
  foreach ($line in ($stdout -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })) {
    try { $events += ($line | ConvertFrom-Json) } catch { $rawJsonlValid = $false }
  }
  $threadIds = @($events | Where-Object { $_.type -eq "thread.started" } | ForEach-Object { $_.thread_id })
  $turnEvents = @($events | Where-Object { $_.type -eq "turn.completed" })
  $turnCompleted = $turnEvents.Count -eq 1
  $usage = if ($turnEvents.Count -eq 1 -and $null -ne $turnEvents[0].usage) { $turnEvents[0].usage } else { $null }
  $result = [ordered]@{
    role = "builder"; invocationId = $run.spec.invocationId; contractSha256 = Get-Sha256 $contractFullPath; artifactSchemaSha256 = $null; processId = $processId; started = $run.started; startedAt = $run.startedAt.ToString("o")
    startError = $run.startError; stdinDelivered = $run.stdinDelivered; stdinError = $run.stdinError; exitCode = $exitCode; timedOut = $run.timedOut
    argv = $run.argv; argvSha256 = Get-TextSha256 ($run.argv -join "`0"); promptSha256 = $contract.promptSha256
    stdoutPath = $stdoutPath; stderrPath = $stderrPath; finalPath = [System.IO.Path]::GetFullPath($run.spec.finalPath); finalSha256 = if ([System.IO.File]::Exists([System.IO.Path]::GetFullPath($run.spec.finalPath))) { Get-Sha256 ([System.IO.Path]::GetFullPath($run.spec.finalPath)) } else { $null }; finalSchemaValid = $null; artifactBindingValid = $null
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
$valid = ($results | Where-Object { -not $_.started -or -not $_.stdinDelivered -or $_.timedOut -or $_.exitCode -ne 0 -or $_.threadIds.Count -ne 1 -or -not $_.turnCompleted -or -not $_.rawJsonlValid -or $null -eq $_.finalSha256 -or $_.sandboxMode -ne "workspace-write" }).Count -eq 0 -and ($threadIds | Select-Object -Unique).Count -eq 2
foreach ($run in $runs) { if ($run.started -and ((Invoke-Git ([System.IO.Path]::GetFullPath($run.spec.workdir)) @("status", "--porcelain=v1")).Length -ne 0)) { $valid = $false } }
$summary = [ordered]@{
  contractSha256 = Get-Sha256 $contractFullPath; runnerMode = if ($contract.smokeMode) { "smoke" } else { "builder" }
  deadlineSeconds = $contract.deadlineSeconds; binarySha256 = $contract.cliSha256; authStatus = $contract.authStatus
  promptSha256 = $contract.promptSha256; results = $results; valid = $valid
}
$summary | ConvertTo-Json -Depth 10
if (-not $valid) { exit 1 }
