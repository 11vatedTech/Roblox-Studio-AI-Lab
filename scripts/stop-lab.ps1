[CmdletBinding()]
param(
    [switch]$Force,
    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 15
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeDirectory = Join-Path $root '.lab-runtime'
$pidFile = Join-Path $runtimeDirectory 'server.json'
if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    Write-Host 'No Lab process record exists.'
    exit 0
}

try {
    $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
} catch {
    throw "The Lab process record is unreadable. No process was stopped: $($_.Exception.Message)"
}

if ($record.root -isnot [string] -or [string]::IsNullOrWhiteSpace([string]$record.root)) {
    throw 'The Lab process record is missing a valid workspace root. No process was stopped.'
}
$recordedRoot = [IO.Path]::GetFullPath([string]$record.root)
if (-not $recordedRoot.Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The process record belongs to a different workspace. No process was stopped.'
}
$pidValue = 0
if (-not [int]::TryParse([string]$record.pid, [ref]$pidValue) -or $pidValue -le 0) {
    throw 'The Lab process record contains an invalid PID. No process was stopped.'
}
$port = 0
if (-not [int]::TryParse([string]$record.port, [ref]$port) -or $port -lt 1024 -or $port -gt 65535) {
    throw 'The Lab process record contains an invalid port. No process was stopped.'
}

$nodePath = [IO.Path]::GetFullPath((Get-Command node -ErrorAction Stop).Source)
$entryPath = [IO.Path]::GetFullPath((Join-Path $root 'src\server\start.js'))

function Get-VerifiedLabProcess([int]$ProcessId, $ProcessRecord, [string]$ExpectedNodePath, [string]$ExpectedEntryPath) {
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $candidate) { return $null }

    try { $actualExecutable = [IO.Path]::GetFullPath([string]$candidate.ExecutablePath) } catch { return $null }
    if (-not $actualExecutable.Equals($ExpectedNodePath, [StringComparison]::OrdinalIgnoreCase)) { return $null }
    if ([string]::IsNullOrWhiteSpace([string]$candidate.CommandLine) -or
        $candidate.CommandLine.IndexOf($ExpectedEntryPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }

    if ($ProcessRecord.processStartedAt) {
        try {
            $expectedStart = [DateTimeOffset]::Parse([string]$ProcessRecord.processStartedAt).UtcDateTime
            $actualStart = if ($candidate.CreationDate -is [DateTime]) {
                $candidate.CreationDate.ToUniversalTime()
            } else {
                [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$candidate.CreationDate).ToUniversalTime()
            }
            if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 5) { return $null }
        } catch {
            throw 'The recorded process start time could not be verified. No process was stopped.'
        }
    }

    return $candidate
}

$process = Get-VerifiedLabProcess $pidValue $record $nodePath $entryPath
if (-not $process) {
    $anyProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    if ($anyProcess) {
        throw 'The recorded PID no longer identifies this workspace Node entrypoint. It was not stopped.'
    }
    $record | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    $record | Add-Member -NotePropertyName state -NotePropertyValue 'stopped' -Force
    $record | Add-Member -NotePropertyName stopMode -NotePropertyValue 'already-exited' -Force
    [IO.File]::WriteAllText($pidFile, ($record | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    Write-Host 'The recorded Lab process had already exited.'
    exit 0
}

$shutdownUrl = "http://127.0.0.1:$port/api/shutdown"
try {
    $result = Invoke-RestMethod -Method Post -Uri $shutdownUrl -ContentType 'application/json' -Body '{}' -TimeoutSec 5
    if ($result.status -ne 'shutting_down') {
        Write-Warning 'The local service did not confirm its graceful shutdown request.'
    }
} catch {
    Write-Warning "The graceful shutdown request did not return normally: $($_.Exception.Message)"
}

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$remainingProcess = $null
while ([DateTime]::UtcNow -lt $deadline) {
    $remainingProcess = Get-VerifiedLabProcess $pidValue $record $nodePath $entryPath
    if (-not $remainingProcess) {
        $anyProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
        if (-not $anyProcess) { break }
        throw 'The PID was reused by a different process during shutdown. The replacement process was left untouched.'
    }
    Start-Sleep -Milliseconds 200
}

$stopMode = 'graceful'
if ($remainingProcess) {
    if (-not $Force) {
        throw "The Lab did not exit within $TimeoutSeconds seconds. It remains running. Inspect .lab-runtime\logs, then rerun with -Force only when forced termination is acceptable."
    }

    $verifiedAgain = Get-VerifiedLabProcess $pidValue $record $nodePath $entryPath
    if (-not $verifiedAgain) {
        throw 'The Lab process identity changed before forced termination. No process was stopped.'
    }
    $taskkillPath = Join-Path $env:SystemRoot 'System32\\taskkill.exe'
    if (-not (Test-Path -LiteralPath $taskkillPath -PathType Leaf)) {
        throw 'Windows taskkill.exe was not found; the Lab process was not force-stopped.'
    }
    & $taskkillPath /PID $pidValue /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Windows taskkill failed with exit code $LASTEXITCODE. The process may still be running."
    }
    $forceDeadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 200
        $remainingProcess = Get-VerifiedLabProcess $pidValue $record $nodePath $entryPath
        $anyProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    } while (($remainingProcess -or $anyProcess) -and [DateTime]::UtcNow -lt $forceDeadline)
    if ($remainingProcess) { throw 'The verified Lab process did not exit after forced termination.' }
    if ($anyProcess) { throw 'The PID was reused after forced termination; the replacement process was left untouched.' }
    $stopMode = 'forced-process-tree'
}

$record | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$record | Add-Member -NotePropertyName state -NotePropertyValue 'stopped' -Force
$record | Add-Member -NotePropertyName stopMode -NotePropertyValue $stopMode -Force
[IO.File]::WriteAllText($pidFile, ($record | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host "Stopped the Lab process using $stopMode shutdown."
