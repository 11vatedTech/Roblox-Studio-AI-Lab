[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 4177,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$url = "http://127.0.0.1:$Port"
$runtimeDirectory = Join-Path $root '.lab-runtime'
$pidFile = Join-Path $runtimeDirectory 'server.json'
$logDirectory = Join-Path $runtimeDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

try {
    $existing = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
    if ($existing.name -eq '11vatedTech AI Roblox Studio Lab') {
        Write-Host "Lab is already running at $url"
        if (-not $NoBrowser) { Start-Process $url }
        exit 0
    }
} catch { }

$node = (Get-Command node -ErrorAction Stop).Source
$serverEntry = '"' + (Join-Path $root 'src\server\start.js') + '"'
$stdoutLog = Join-Path $logDirectory 'lab.stdout.log'
$stderrLog = Join-Path $logDirectory 'lab.stderr.log'
$previousLabPort = $env:LAB_PORT
$env:LAB_PORT = [string]$Port
try {
    $process = Start-Process -FilePath $node -ArgumentList @($serverEntry) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
} finally {
    if ($null -eq $previousLabPort) { Remove-Item Env:LAB_PORT -ErrorAction SilentlyContinue }
    else { $env:LAB_PORT = $previousLabPort }
}
$processStartedAt = $process.StartTime.ToUniversalTime().ToString('o')
$state = [pscustomobject]@{ pid = $process.Id; root = $root; port = $Port; startedAt = [DateTime]::UtcNow.ToString('o'); processStartedAt = $processStartedAt; state = 'running' }
[IO.File]::WriteAllText($pidFile, ($state | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1
        if ($health.name -eq '11vatedTech AI Roblox Studio Lab') { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $ready) {
    $process.Refresh()
    if ($process.HasExited) { throw "Lab exited during startup. Review $stderrLog" }
    throw "Lab did not return a healthy response at $url. Review $stdoutLog and $stderrLog"
}
Write-Host "Lab is ready at $url"
if (-not $NoBrowser) { Start-Process $url }
