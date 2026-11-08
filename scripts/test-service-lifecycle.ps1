[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$startScript = Join-Path $PSScriptRoot 'start-lab.ps1'
$stopScript = Join-Path $PSScriptRoot 'stop-lab.ps1'
$runtimeDirectory = Join-Path $root '.lab-runtime'
$pidFile = Join-Path $runtimeDirectory 'server.json'
$stdoutLog = Join-Path $runtimeDirectory 'logs\lab.stdout.log'
$stderrLog = Join-Path $runtimeDirectory 'logs\lab.stderr.log'

foreach ($scriptPath in @($startScript, $stopScript, $PSCommandPath)) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) {
        $details = ($parseErrors | ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }) -join '; '
        throw "PowerShell syntax validation failed for $scriptPath : $details"
    }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$url = "http://127.0.0.1:$port"

function Get-ProcessById([int]$ProcessId) {
    return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Assert-LabStopped([int]$ProcessId) {
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        if (-not (Get-ProcessById $ProcessId)) { return }
        Start-Sleep -Milliseconds 200
    }
    throw "Lab process $ProcessId remained alive after stop-lab.ps1 returned."
}

$cycleResults = @()
try {
    for ($cycle = 1; $cycle -le 2; $cycle++) {
        & $startScript -Port $port -NoBrowser
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3
        if ($health.status -ne 'ok' -or $health.name -ne '11vatedTech AI Roblox Studio Lab' -or $health.bindAddress -ne '127.0.0.1') {
            throw "Startup cycle $cycle returned an invalid health response."
        }

        $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        if ($record.state -ne 'running' -or $record.port -ne $port -or -not $record.processStartedAt) {
            throw "Startup cycle $cycle did not persist its process identity."
        }
        $process = Get-ProcessById ([int]$record.pid)
        if (-not $process) { throw "Startup cycle $cycle did not create the recorded Node process." }
        $nodePath = [IO.Path]::GetFullPath((Get-Command node -ErrorAction Stop).Source)
        $entryPath = [IO.Path]::GetFullPath((Join-Path $root 'src\server\start.js'))
        if (-not [IO.Path]::GetFullPath([string]$process.ExecutablePath).Equals($nodePath, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Startup cycle $cycle process executable did not match Node."
        }
        if ([string]$process.CommandLine -notmatch [regex]::Escape($entryPath)) {
            throw "Startup cycle $cycle process command line did not match the Lab entrypoint."
        }

        $pidValue = [int]$record.pid
        & $stopScript -TimeoutSeconds 15
        $stopped = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        if ($stopped.state -ne 'stopped' -or $stopped.stopMode -ne 'graceful') {
            throw "Stop cycle $cycle did not finish through the graceful stop path."
        }
        Assert-LabStopped $pidValue
        try {
            Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 1 | Out-Null
            throw "The Lab still answered health requests after stop cycle $cycle."
        } catch {
            if ($_.Exception.Message -like 'The Lab still answered*') { throw }
        }

        $cycleResults += [pscustomobject]@{
            cycle = $cycle
            pid = $pidValue
            processStartedAt = $record.processStartedAt
            stopMode = $stopped.stopMode
            result = 'passed'
        }
    }
} finally {
    if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
        try {
            $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            if ($record.root -eq $root -and $record.state -ne 'stopped') {
                & $stopScript -Force -TimeoutSeconds 5
            }
        } catch {
            Write-Warning "Lifecycle test cleanup could not stop the recorded Lab process: $($_.Exception.Message). Logs: $stdoutLog ; $stderrLog"
        }
    }
}

$evidenceDirectory = Join-Path $root 'evidence\ci'
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null
$evidencePath = Join-Path $evidenceDirectory 'service-lifecycle-windows.json'
$evidence = [ordered]@{
    schemaVersion = 1
    capturedAt = [DateTime]::UtcNow.ToString('o')
    runnerOS = [Environment]::OSVersion.VersionString
    powershellVersion = $PSVersionTable.PSVersion.ToString()
    nodeVersion = (& node --version).Trim()
    port = $port
    cycles = @($cycleResults)
    result = 'passed'
    scope = 'Windows CI startup, HTTP health, graceful stop, process exit, and restart using the production PowerShell entrypoints.'
    limitations = @('Hosted CI evidence does not replace a target-workstation smoke test or certify live Roblox Studio/MCP behavior.')
}
[IO.File]::WriteAllText($evidencePath, ($evidence | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
$cycleResults | Format-Table -AutoSize
Write-Host "PASS: two Windows Lab startup/shutdown cycles. Evidence: evidence/ci/service-lifecycle-windows.json"
