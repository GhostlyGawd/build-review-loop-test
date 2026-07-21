param([string]$Root = (Join-Path ([System.IO.Path]::GetTempPath()) "build-review-loop-permission-probe"))
$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath($Root)
if ([System.IO.Directory]::Exists($root)) { throw "Probe root must be fresh" }
$candidate = Join-Path $root "candidate"; $private = Join-Path $root "private"; $outside = Join-Path $root "outside"
New-Item -ItemType Directory -Path $candidate,$private,$outside | Out-Null
Set-Content -LiteralPath (Join-Path $candidate "seed.txt") -Value "seed" -NoNewline
Set-Content -LiteralPath (Join-Path $private "private-canary.txt") -Value "private" -NoNewline
Set-Content -LiteralPath (Join-Path $outside "outside-canary.txt") -Value "outside" -NoNewline
& git -C $candidate init -b main | Out-Null; & git -C $candidate config core.autocrlf false; & git -C $candidate add .
& git -C $candidate -c user.name=Probe -c user.email=probe@example.invalid commit -m root | Out-Null
$parent = (& git -C $candidate rev-parse HEAD).Trim(); $gitConfigHash = (Get-FileHash (Join-Path $candidate ".git\config") -Algorithm SHA256).Hash
$codex = "C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe"
$roots = 'permissions.probe.workspace_roots={"' + $candidate.Replace('\','\\') + '"=true}'
$command = '$env:GIT_CONFIG_GLOBAL="NUL"; $env:GIT_CONFIG_SYSTEM="NUL"; Set-Content -LiteralPath probe.txt -Value ok -NoNewline; git status --porcelain=v1 | Out-Null; node -e "process.exit(0)"; npm --version | Out-Null'
& $codex sandbox -c $roots -c 'permissions.probe.filesystem.:workspace_roots="write"' -c 'permissions.probe.network.enabled=false' -P probe -C $candidate powershell.exe -NoProfile -Command $command
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $candidate "probe.txt"))) { throw "Workspace command/write probe failed" }
if ((Get-Content -Raw (Join-Path $private "private-canary.txt")) -ne "private" -or (Get-Content -Raw (Join-Path $outside "outside-canary.txt")) -ne "outside") { throw "Private/outside canary changed" }
if ((Get-FileHash (Join-Path $candidate ".git\config") -Algorithm SHA256).Hash -ne $gitConfigHash) { throw "Sandbox changed protected Git metadata" }
for ($attempt = 0; $attempt -lt 40 -and ((Test-Path (Join-Path $candidate ".lock")) -or (Test-Path (Join-Path $candidate ".git\index.lock"))); $attempt++) { Start-Sleep -Milliseconds 50 }
$commitScript = Join-Path $PSScriptRoot "commit-candidate.ps1"
$result = & pwsh -NoProfile -File $commitScript -Workdir $candidate -ExpectedParent $parent -TemporaryIndexPath (Join-Path $root "runtime\index") -Message "Seal permission probe" -Timestamp ([DateTimeOffset]::UtcNow.ToString("o")) | ConvertFrom-Json
if ((& git -C $candidate status --porcelain=v1).Length -ne 0 -or $result.parent -ne $parent) { throw "Supervisor commit probe failed" }
[ordered]@{ version = "1.0.0"; modelCall = $false; workspaceWrite = $true; gitNodeNpm = $true; gitMetadataProtected = $true; privateAndOutsideCanariesUnchanged = $true; supervisorCommit = $result.commit; valid = $true } | ConvertTo-Json
