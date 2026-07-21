param(
  [string]$Root = (Join-Path ([System.IO.Path]::GetTempPath()) "build-review-loop-actual-exec-probe"),
  [string]$EvidencePath = "",
  [int]$DeadlineSeconds = 600
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ProtocolRoot = Split-Path -Parent $PSScriptRoot
$Codex = "C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe"
$PromptPath = Join-Path $ProtocolRoot "experiment\prompts\actual-exec-capability-probe.md"
$CommitScript = Join-Path $PSScriptRoot "commit-candidate.ps1"
$ExpectedCliVersion = "codex-cli 0.145.0-alpha.18"
$ExpectedCliSha256 = "20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4"
$InvariantArgv = @(
  "-a", "never",
  "-m", "gpt-5.4",
  "-c", 'model_reasoning_effort="xhigh"',
  "-c", 'windows.sandbox="elevated"',
  "-c", "sandbox_workspace_write.network_access=false",
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox", "workspace-write",
  "--json"
)

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TreeHash([string]$Directory) {
  $material = [System.Text.StringBuilder]::new()
  foreach ($file in @(Get-ChildItem -LiteralPath $Directory -File -Recurse -Force | Sort-Object FullName -CaseSensitive)) {
    $relative = [System.IO.Path]::GetRelativePath($Directory, $file.FullName).Replace("\", "/")
    [void]$material.Append("$relative`0$(Get-Sha256 $file.FullName)`0$($file.Length)`n")
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($material.ToString())
  return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Invoke-Git([string]$Workdir, [string[]]$Arguments) {
  $output = (& git -C $Workdir @Arguments 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $output" }
  return $output
}

$root = [System.IO.Path]::GetFullPath($Root)
if ([System.IO.Directory]::Exists($root)) { throw "Probe root must be fresh: $root" }
$candidate = Join-Path $root "candidate"
$private = Join-Path $root "private"
$outside = Join-Path $root "outside"
$tempRoot = Join-Path $root "temp"
$cacheRoot = Join-Path $root "cache"
$dependencyRoot = Join-Path $root "dependency"
$evidenceRoot = Join-Path $root "evidence"
$finalPath = Join-Path $evidenceRoot "final.txt"
$stdoutPath = Join-Path $evidenceRoot "stdout.jsonl"
$stderrPath = Join-Path $evidenceRoot "stderr.txt"
$resolvedEvidencePath = if ([string]::IsNullOrWhiteSpace($EvidencePath)) { Join-Path $evidenceRoot "attestation.json" } else { [System.IO.Path]::GetFullPath($EvidencePath) }

New-Item -ItemType Directory -Path $candidate, $private, $outside, $tempRoot, $cacheRoot, $dependencyRoot, $evidenceRoot | Out-Null
[System.IO.File]::WriteAllText((Join-Path $candidate "probe-input.txt"), "actual-exec-capability-probe", $Utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $candidate "package.json"), '{"private":true,"scripts":{"probe":"node -e \"process.exit(0)\""}}', $Utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $private "private-canary.txt"), "private", $Utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $outside "outside-canary.txt"), "outside", $Utf8NoBom)

Invoke-Git $candidate @("init", "-b", "main") | Out-Null
Invoke-Git $candidate @("config", "core.autocrlf", "false") | Out-Null
Invoke-Git $candidate @("add", ".") | Out-Null
Invoke-Git $candidate @("-c", "user.name=Probe", "-c", "user.email=probe@example.invalid", "commit", "-m", "root") | Out-Null
$parent = Invoke-Git $candidate @("rev-parse", "HEAD")
$parentTree = Invoke-Git $candidate @("rev-parse", "HEAD^{tree}")
$gitBefore = Get-TreeHash (Join-Path $candidate ".git")
$privateBefore = Get-Sha256 (Join-Path $private "private-canary.txt")
$outsideBefore = Get-Sha256 (Join-Path $outside "outside-canary.txt")

if ((Get-Sha256 $Codex) -ne $ExpectedCliSha256) { throw "Codex binary hash mismatch" }
$actualVersion = (& $Codex --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $actualVersion -ne $ExpectedCliVersion) { throw "Codex CLI version mismatch" }
$promptBytes = [System.IO.File]::ReadAllBytes($PromptPath)
$promptSha256 = Get-Sha256 $PromptPath
$argv = @($InvariantArgv + @(
  "--add-dir", $tempRoot,
  "--add-dir", $cacheRoot,
  "--add-dir", $dependencyRoot,
  "-C", $candidate,
  "-o", $finalPath,
  "-"
))

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $Codex
$startInfo.WorkingDirectory = $ProtocolRoot
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Environment["TEMP"] = $tempRoot
$startInfo.Environment["TMP"] = $tempRoot
$startInfo.Environment["NPM_CONFIG_CACHE"] = $cacheRoot
$startInfo.Environment["CODEX_DEPENDENCY_ROOT"] = $dependencyRoot
$startInfo.Environment["PORT"] = "4173"
foreach ($argument in $argv) { [void]$startInfo.ArgumentList.Add($argument) }

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$startedAt = [System.DateTimeOffset]::UtcNow
if (-not $process.Start()) { throw "Codex actual-exec probe did not start" }
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$process.StandardInput.BaseStream.Write($promptBytes, 0, $promptBytes.Length)
$process.StandardInput.Close()
if (-not $process.WaitForExit($DeadlineSeconds * 1000)) {
  $process.Kill($true)
  throw "Codex actual-exec probe timed out"
}
$exitedAt = [System.DateTimeOffset]::new($process.ExitTime.ToUniversalTime())
$stdout = $stdoutTask.GetAwaiter().GetResult()
$stderr = $stderrTask.GetAwaiter().GetResult()
[System.IO.File]::WriteAllText($stdoutPath, $stdout, $Utf8NoBom)
[System.IO.File]::WriteAllText($stderrPath, $stderr, $Utf8NoBom)

$events = @()
$rawJsonlValid = $true
foreach ($line in ($stdout -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })) {
  try { $events += ($line | ConvertFrom-Json -DateKind String) } catch { $rawJsonlValid = $false }
}
$threadIds = @($events | Where-Object { $_.type -eq "thread.started" } | ForEach-Object { $_.thread_id })
$turnCompleted = @($events | Where-Object { $_.type -eq "turn.completed" }).Count -eq 1
$expectedWrites = @(
  @{ Path = (Join-Path $candidate "probe-output.txt"); Value = "actual-exec-workspace-write-ok" },
  @{ Path = (Join-Path $tempRoot "temp-root-write.txt"); Value = "ok" },
  @{ Path = (Join-Path $cacheRoot "cache-root-write.txt"); Value = "ok" },
  @{ Path = (Join-Path $dependencyRoot "dependency-root-write.txt"); Value = "ok" }
)
$writesValid = $true
foreach ($expected in $expectedWrites) {
  if (-not [System.IO.File]::Exists($expected.Path) -or [System.IO.File]::ReadAllText($expected.Path) -ne $expected.Value) { $writesValid = $false }
}
$gitAfterModel = Get-TreeHash (Join-Path $candidate ".git")
$gitMetadataUnchangedBeforeSupervisor = $gitAfterModel -eq $gitBefore
$privateUnchanged = (Get-Sha256 (Join-Path $private "private-canary.txt")) -eq $privateBefore
$outsideUnchanged = (Get-Sha256 (Join-Path $outside "outside-canary.txt")) -eq $outsideBefore
$modelStatus = Invoke-Git $candidate @("status", "--porcelain=v1")
$onlyAuthorizedCandidateWrite = ($modelStatus -split "`r?`n" | Where-Object { $_ }) -join "`n" -eq "?? probe-output.txt"

$commitInfo = $null
if ($process.ExitCode -eq 0 -and $rawJsonlValid -and $threadIds.Count -eq 1 -and $turnCompleted -and $writesValid -and $gitMetadataUnchangedBeforeSupervisor -and $privateUnchanged -and $outsideUnchanged -and $onlyAuthorizedCandidateWrite) {
  $commitInfo = (& $CommitScript -Workdir $candidate -ExpectedParent $parent -TemporaryIndexPath (Join-Path $dependencyRoot "supervisor-index") -Message "Seal actual-exec capability probe" -Timestamp $exitedAt.ToString("o")) | ConvertFrom-Json -DateKind String
}
$childCount = if ($null -ne $commitInfo) { [int](Invoke-Git $candidate @("rev-list", "--count", "$parent..HEAD")) } else { 0 }
$cleanAfterSupervisor = if ($null -ne $commitInfo) { (Invoke-Git $candidate @("status", "--porcelain=v1")).Length -eq 0 } else { $false }
$valid = $process.ExitCode -eq 0 -and $rawJsonlValid -and $threadIds.Count -eq 1 -and $turnCompleted -and $writesValid -and $gitMetadataUnchangedBeforeSupervisor -and $privateUnchanged -and $outsideUnchanged -and $onlyAuthorizedCandidateWrite -and $childCount -eq 1 -and $cleanAfterSupervisor

$attestation = [ordered]@{
  protocolVersion = "2.7.0"
  probeVersion = "2.0.0"
  executedAt = $startedAt.ToString("o")
  completedAt = $exitedAt.ToString("o")
  actualModelCall = $true
  harmlessPrompt = $true
  candidateContentExposed = $false
  approvalPolicy = "never"
  sandboxMode = "workspace-write"
  windowsSandbox = "elevated"
  networkEnabled = $false
  ignoreUserConfig = $true
  ignoreRules = $true
  cliVersion = $ExpectedCliVersion
  cliSha256 = $ExpectedCliSha256
  model = "gpt-5.4"
  reasoningEffort = "xhigh"
  promptSha256 = $promptSha256
  invariantArgv = $InvariantArgv
  environmentKeys = @("TEMP", "TMP", "NPM_CONFIG_CACHE", "CODEX_DEPENDENCY_ROOT", "PORT")
  addDirRoles = @("tempRoot", "cacheRoot", "dependencyRoot")
  parentCommit = $parent
  parentTree = $parentTree
  exitCode = $process.ExitCode
  rawJsonlValid = $rawJsonlValid
  threadCount = $threadIds.Count
  turnCompleted = $turnCompleted
  ordinaryWorkspaceWrite = $writesValid
  addDirWrites = $writesValid
  gitNodeNpm = $writesValid
  gitMetadataUnchangedBeforeSupervisor = $gitMetadataUnchangedBeforeSupervisor
  privateCanaryUnchanged = $privateUnchanged
  outsideCanaryUnchanged = $outsideUnchanged
  supervisorCommit = if ($null -ne $commitInfo) { $commitInfo.commit } else { $null }
  supervisorCommitExactlyOneChild = $childCount -eq 1
  supervisorCommitClean = $cleanAfterSupervisor
  hooksDisabled = $true
  valid = $valid
}
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $resolvedEvidencePath)) | Out-Null
[System.IO.File]::WriteAllText($resolvedEvidencePath, ($attestation | ConvertTo-Json -Depth 10) + "`n", $Utf8NoBom)
$attestation | ConvertTo-Json -Depth 10
if (-not $valid) { exit 1 }
