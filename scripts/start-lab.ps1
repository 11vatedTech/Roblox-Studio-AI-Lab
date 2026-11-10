[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$port = if ($env:LAB_PORT) { [int]$env:LAB_PORT } else { 4177 }
if ($port -lt 1024 -or $port -gt 65535) { throw 'LAB_PORT must be an integer from 1024 through 65535.' }
$url = "http://127.0.0.1:$port"
$runtimeDirectory = Join-Path $root '.lab-runtime'
$pidFile = Join-Path $runtimeDirectory 'server.json'
$logDirectory = Join-Path $runtimeDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

try {
    $existing = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
    if ($existing.name -eq '11vatedTech AI Roblox Studio Lab') {
        Write-Host "Lab is already running at $url"
        Start-Process $url
        exit 0
    }
} catch { }

$node = (Get-Command node -ErrorAction Stop).Source
$serverEntry = '"' + (Join-Path $root 'src\server\start.js') + '"'
$stdoutLog = Join-Path $logDirectory 'lab.stdout.log'
$stderrLog = Join-Path $logDirectory 'lab.stderr.log'
$process = Start-Process -FilePath $node -ArgumentList @($serverEntry) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
$state = [pscustomobject]@{ pid = $process.Id; root = $root; port = $port; startedAt = [DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText($pidFile, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $process.Refresh()
    if ($process.HasExited) { break }
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
        if ($health.name -eq '11vatedTech AI Roblox Studio Lab') { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $ready) {
    $process.Refresh()
    if ($process.HasExited) {
        if (Test-Path -LiteralPath $pidFile) {
            $recordOnDisk = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            $recordedRoot = [IO.Path]::GetFullPath([string]$recordOnDisk.root)
            if ([int]$recordOnDisk.pid -eq $process.Id -and $recordedRoot.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
                Remove-Item -LiteralPath $pidFile -Force
            }
        }
        throw "Lab exited during startup. Review $stderrLog"
    }
    throw "Lab did not return a healthy response at $url. Review $stdoutLog and $stderrLog"
}
Write-Host "Lab is ready at $url"
Start-Process $url
