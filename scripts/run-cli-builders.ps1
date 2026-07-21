param(
  [Parameter(Mandatory = $true)]
  [string]$ContractPath
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$ExpectedInvariant = @("-a", "never", "exec", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "danger-full-access", "--json")

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TextSha256([string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [System.Security.Cryptography.SHA256]::HashData($bytes)
  return [System.Convert]::ToHexString($hash).ToLowerInvariant()
}

$contractFullPath = [System.IO.Path]::GetFullPath($ContractPath)
$contract = Get-Content -LiteralPath $contractFullPath -Raw | ConvertFrom-Json
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

$ids = @($contract.invocations | ForEach-Object { $_.invocationId })
if (($ids | Select-Object -Unique).Count -ne 2) { throw "Opaque invocation IDs must be distinct" }
$variablePaths = @()
foreach ($spec in $contract.invocations) {
  $variablePaths += @($spec.workdir, $spec.finalPath, $spec.stdoutPath, $spec.stderrPath, $spec.evidencePath)
}
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
  [System.IO.File]::WriteAllText($stdoutPath, $stdout, $Utf8NoBom)
  [System.IO.File]::WriteAllText($stderrPath, $stderr, $Utf8NoBom)
  $events = @()
  foreach ($line in ($stdout -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })) {
    try { $events += ($line | ConvertFrom-Json) } catch {}
  }
  $threadIds = @($events | Where-Object { $_.type -eq "thread.started" } | ForEach-Object { $_.thread_id })
  $turnCompleted = @($events | Where-Object { $_.type -eq "turn.completed" }).Count -eq 1
  $unauthorized = $false
  $workdirLower = ([System.IO.Path]::GetFullPath($run.spec.workdir)).ToLowerInvariant()
  foreach ($event in $events | Where-Object { $_.item.type -eq "command_execution" }) {
    foreach ($match in [regex]::Matches([string]$event.item.command, '[A-Za-z]:\\[^"\s]+')) {
      $observed = $match.Value.ToLowerInvariant()
      if (-not $observed.StartsWith($workdirLower) -and -not $observed.EndsWith("pwsh.exe") -and -not $observed.EndsWith("powershell.exe")) { $unauthorized = $true }
    }
  }
  $result = [ordered]@{
    invocationId = $run.spec.invocationId; processId = $processId; started = $run.started; startedAt = $run.startedAt.ToString("o")
    startError = $run.startError; stdinDelivered = $run.stdinDelivered; stdinError = $run.stdinError; exitCode = $exitCode; timedOut = $run.timedOut
    argv = $run.argv; argvSha256 = Get-TextSha256 ($run.argv -join "`0"); promptSha256 = $contract.promptSha256
    threadIds = $threadIds; turnCompleted = $turnCompleted; unauthorizedToolOrWriteDetected = $unauthorized
    runtimeModel = $null; runtimeModelUnavailableReason = "not present in trusted JSONL lifecycle metadata"
    runtimeProvider = $null; runtimeProviderUnavailableReason = "not present in trusted JSONL lifecycle metadata"
    reasoningSetting = $null; reasoningSettingUnavailableReason = "not present in trusted JSONL lifecycle metadata"
    stdoutSha256 = Get-Sha256 $stdoutPath; stderrSha256 = Get-Sha256 $stderrPath
  }
  [System.IO.File]::WriteAllText($evidencePath, ($result | ConvertTo-Json -Depth 8), $Utf8NoBom)
  $results += [pscustomobject]$result
}

$threadIds = @($results | ForEach-Object { $_.threadIds })
$valid = ($results | Where-Object { -not $_.started -or -not $_.stdinDelivered -or $_.timedOut -or $_.exitCode -ne 0 -or $_.threadIds.Count -ne 1 -or -not $_.turnCompleted -or $_.unauthorizedToolOrWriteDetected }).Count -eq 0 -and ($threadIds | Select-Object -Unique).Count -eq 2
$summary = [ordered]@{
  contractSha256 = Get-Sha256 $contractFullPath; runnerMode = if ($contract.smokeMode) { "smoke" } else { "builder" }
  deadlineSeconds = $contract.deadlineSeconds; binarySha256 = $contract.cliSha256; authStatus = $contract.authStatus
  promptSha256 = $contract.promptSha256; results = $results; valid = $valid
}
$summary | ConvertTo-Json -Depth 10
if (-not $valid) { exit 1 }
