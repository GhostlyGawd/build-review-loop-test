param(
  [Parameter(Mandatory = $true)][string]$Workdir,
  [Parameter(Mandatory = $true)][string]$ExpectedParent,
  [Parameter(Mandatory = $true)][string]$TemporaryIndexPath,
  [Parameter(Mandatory = $true)][string]$Message,
  [Parameter(Mandatory = $true)][string]$Timestamp
)

$ErrorActionPreference = "Stop"
$emptyExcludes = [System.IO.Path]::GetFullPath($TemporaryIndexPath) + ".excludes"
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($emptyExcludes)) | Out-Null
[System.IO.File]::WriteAllText($emptyExcludes, "")

function Invoke-Git([string[]]$Arguments, [hashtable]$Environment = @{}) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = "git"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  foreach ($argument in @("-c", "core.hooksPath=NUL", "-c", "core.excludesFile=$emptyExcludes", "-C", $Workdir) + $Arguments) { [void]$psi.ArgumentList.Add($argument) }
  $psi.Environment["GIT_CONFIG_GLOBAL"] = "NUL"
  $psi.Environment["GIT_CONFIG_SYSTEM"] = "NUL"
  $psi.Environment["XDG_CONFIG_HOME"] = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($TemporaryIndexPath))
  foreach ($key in $Environment.Keys) { $psi.Environment[$key] = [string]$Environment[$key] }
  $process = [System.Diagnostics.Process]::Start($psi)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  $output = ($stdout + $stderr).Trim()
  if ($process.ExitCode -ne 0) { throw "git $($Arguments -join ' ') failed: $output" }
  return $output
}

$root = [System.IO.Path]::GetFullPath($Workdir)
$index = [System.IO.Path]::GetFullPath($TemporaryIndexPath)
if (-not [System.IO.Directory]::Exists($root) -or -not [System.IO.Directory]::Exists((Join-Path $root ".git"))) { throw "Candidate must be an existing Git worktree" }
if ($index.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Temporary index must be outside the candidate" }
if ((Invoke-Git @("rev-parse", "HEAD")) -ne $ExpectedParent) { throw "Candidate parent changed before supervisor commit" }
if ((Invoke-Git @("remote")).Length -ne 0) { throw "Candidate remotes must remain disabled" }
if ((Invoke-Git @("config", "--get", "core.autocrlf")) -ne "false") { throw "Candidate core.autocrlf must remain false" }

$changed = @((Invoke-Git @("status", "--porcelain=v1", "--untracked-files=all")) -split "\r?\n" | Where-Object { $_ -ne "" })
if ($changed.Count -eq 0) { throw "Candidate produced no committable changes" }
$protected = @(
  ".gitattributes", ".gitignore", ".nvmrc", ".prettierignore", "docs/permissions-playground-spec.md",
  "docs/public-test-contract.md", "eslint.config.js", "package.json", "package-lock.json", "scripts/run-public-tests.mjs",
  "tests/public/", "tsconfig.app.json", "tsconfig.json", "tsconfig.node.json", "vite.config.ts"
)
foreach ($line in $changed) {
  $path = $line.Substring(3).Replace("\\", "/")
  if ($path.Contains(" -> ")) { $path = ($path -split " -> ")[-1] }
  if ($protected | Where-Object { $path -eq $_ -or ($_.EndsWith("/") -and $path.StartsWith($_, [System.StringComparison]::Ordinal)) }) { throw "Candidate changed frozen path: $path" }
}

[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($index)) | Out-Null
if ([System.IO.File]::Exists($index)) { [System.IO.File]::Delete($index) }
$envMap = @{ GIT_INDEX_FILE = $index }
[void](Invoke-Git @("read-tree", $ExpectedParent) $envMap)
[void](Invoke-Git @("add", "-A", "--", ".") $envMap)
$tree = Invoke-Git @("write-tree") $envMap
if ($tree -eq (Invoke-Git @("rev-parse", "$ExpectedParent^{tree}"))) { throw "Candidate changes produced no new tree" }
$commitEnv = $envMap.Clone()
$commitEnv["GIT_AUTHOR_NAME"] = "Experiment Supervisor"; $commitEnv["GIT_AUTHOR_EMAIL"] = "supervisor@example.invalid"
$commitEnv["GIT_COMMITTER_NAME"] = "Experiment Supervisor"; $commitEnv["GIT_COMMITTER_EMAIL"] = "supervisor@example.invalid"
$commitEnv["GIT_AUTHOR_DATE"] = $Timestamp; $commitEnv["GIT_COMMITTER_DATE"] = $Timestamp
$commit = Invoke-Git @("-c", "commit.gpgSign=false", "commit-tree", $tree, "-p", $ExpectedParent, "-m", $Message) $commitEnv
[void](Invoke-Git @("update-ref", "HEAD", $commit, $ExpectedParent))
[System.IO.File]::Copy($index, (Join-Path $root ".git\index"), $true)
$finalStatus = ""
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $finalStatus = Invoke-Git @("status", "--porcelain=v1")
  if ($finalStatus.Length -eq 0) { break }
  Start-Sleep -Milliseconds 50
}
if ($finalStatus.Length -ne 0) { throw "Supervisor commit did not leave a clean worktree: $finalStatus" }
$parents = (Invoke-Git @("rev-list", "--parents", "-n", "1", $commit)) -split " "
if ($parents.Count -ne 2 -or $parents[1] -ne $ExpectedParent) { throw "Supervisor commit is not exactly one child" }
[ordered]@{ parent = $ExpectedParent; tree = $tree; commit = $commit; message = $Message; hookExecution = $false; temporaryIndex = $index } | ConvertTo-Json -Compress
