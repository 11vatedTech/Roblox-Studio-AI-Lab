[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $root '.lab-runtime\server.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No Lab process record exists.'; exit 0 }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)" -ErrorAction SilentlyContinue
if (-not $process) { Write-Host 'The recorded Lab process is already stopped.'; exit 0 }
$relativeEntry = [IO.Path]::GetFullPath((Join-Path $root 'src\server\start.js'))
$recordedRoot = [IO.Path]::GetFullPath([string]$record.root)
if (-not $recordedRoot.Equals($root, [StringComparison]::OrdinalIgnoreCase) -or -not $process.CommandLine -or $process.CommandLine.IndexOf($relativeEntry, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or -not $process.ExecutablePath.StartsWith([IO.Path]::GetDirectoryName((Get-Command node -ErrorAction Stop).Source), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The recorded PID no longer identifies the Lab Node process; it was not stopped.'
}
$shutdown = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($record.port)/api/control/shutdown" -ContentType 'application/json' -Body '{}' -TimeoutSec 3
if ($shutdown.status -ne 'shutting_down') { throw 'The Lab did not accept a graceful shutdown request.' }
$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
    Start-Sleep -Milliseconds 100
    $remaining = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)" -ErrorAction SilentlyContinue
    if (-not $remaining -or -not $remaining.CommandLine -or $remaining.CommandLine.IndexOf($relativeEntry, [StringComparison]::OrdinalIgnoreCase) -lt 0) { break }
} while ([DateTime]::UtcNow -lt $deadline)
if ($remaining -and $remaining.CommandLine -and $remaining.CommandLine.IndexOf($relativeEntry, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw 'The Lab did not finish graceful shutdown within 10 seconds; its process was left running for inspection.'
}
$record | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$record | Add-Member -NotePropertyName state -NotePropertyValue 'stopped' -Force
[IO.File]::WriteAllText($pidFile, ($record | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Write-Host 'Gracefully stopped the Lab process that matched the workspace and Node executable.'
