[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$studioDirectory = Join-Path $env:LOCALAPPDATA 'Roblox\Versions'
$studio = Get-ChildItem -LiteralPath $studioDirectory -Filter 'RobloxStudioBeta.exe' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$launcher = Join-Path $env:LOCALAPPDATA 'Roblox\mcp.bat'
$rojo = Join-Path $root '.tools\rojo-7.7.1\rojo.exe'
if (-not (Test-Path -LiteralPath $rojo)) {
    $rojoCommand = Get-Command rojo -ErrorAction SilentlyContinue
    if ($rojoCommand) { $rojo = $rojoCommand.Source } else { $rojo = $null }
}
$studioProcesses = @(Get-Process -Name 'RobloxStudioBeta' -ErrorAction SilentlyContinue)
$openStudioPlace = $studioProcesses | Where-Object { $_.MainWindowTitle -match '\.rbxlx? - Roblox Studio$' } | Select-Object -First 1
$buildableProject = Test-Path -LiteralPath (Join-Path $root 'roblox\templates\base\default.project.json')
$studioVersion = if ($studio) { [Diagnostics.FileVersionInfo]::GetVersionInfo($studio.FullName).FileVersion } else { $null }
$rojoVersion = if ($rojo) { (& $rojo --version).Trim() } else { $null }
$labUrl = 'http://127.0.0.1:4177'
$mcpConnected = $false
$studioToolNames = @()
$studioInstance = $null
$studioMode = $null
$dataModelRead = $false
$consoleRead = $false
$liveProbeError = $null
$captures = @()
try {
    $connectionResponse = Invoke-RestMethod -Uri "$labUrl/api/studio" -TimeoutSec 3
    $mcpConnected = [bool]$connectionResponse.connection.connected
    $studioToolNames = @($connectionResponse.connection.tools)
    if ($mcpConnected) {
        $instancesResponse = Invoke-RestMethod -Uri "$labUrl/api/studio/instances" -TimeoutSec 5
        $studioInstance = $instancesResponse.instances | Select-Object -First 1
        if ($studioInstance) {
            $escapedStudioId = [Uri]::EscapeDataString([string]$studioInstance.studio_id)
            $stateResponse = Invoke-RestMethod -Uri "$labUrl/api/studio/state?studio_id=$escapedStudioId" -TimeoutSec 10
            $stateText = (($stateResponse.result.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n")
            if ($stateText -match 'Current Studio Mode:\s*(?<mode>\w+)') { $studioMode = $Matches.mode }
            $dataModelType = if ($studioMode -eq 'Play') { 'Client' } else { 'Edit' }
            $treeResponse = Invoke-RestMethod -Uri "$labUrl/api/studio/tree?studio_id=$escapedStudioId&datamodel_type=$dataModelType&depth=2&limit=25&path=Workspace" -TimeoutSec 20
            $dataModelRead = $treeResponse.result.resultType -eq 'complete' -and -not $treeResponse.result.isError
            $consoleResponse = Invoke-RestMethod -Uri "$labUrl/api/studio/console?studio_id=$escapedStudioId" -TimeoutSec 15
            $consoleRead = $consoleResponse.result.resultType -eq 'complete' -and -not $consoleResponse.result.isError
        }
    }
} catch { $liveProbeError = $_.Exception.Message }
try {
    $captureResponse = Invoke-RestMethod -Uri "$labUrl/api/captures" -TimeoutSec 3
    $captures = @($captureResponse.captures)
} catch { }
$latestCapture = $captures | Select-Object -First 1
$liveDataModelStatus = if ($dataModelRead) { "verified: $dataModelType Workspace tree returned from $($studioInstance.name)" } elseif ($mcpConnected) { 'connected, but a live DataModel tree read did not complete' } else { 'not verified: Lab MCP monitor is disconnected or unavailable' }
$livePlaytestStatus = if ($studioMode -eq 'Play') { 'Play mode active when report was captured; objective completion and multiplayer remain unverified' } else { 'no live Play-mode session observed when report was captured' }
$viewportStatus = if ($latestCapture) { "verified: $($captures.Count) local capture(s); latest $($latestCapture.id) at $($latestCapture.capturedAt), SHA-256 $($latestCapture.sha256)" } else { 'no Studio viewport images are present in the local evidence archive' }

$report = [pscustomobject]@{
    schemaVersion = 1
    capturedAt = [DateTime]::UtcNow.ToString('o')
    workspace = $root
    studioInstalled = [bool]$studio
    studioExecutable = if ($studio) { $studio.FullName } else { $null }
    studioVersion = $studioVersion
    studioProcessRunning = [bool]$studioProcesses.Count
    studioPlaceOpen = [bool]$openStudioPlace
    studioPlaceName = if ($openStudioPlace) { [IO.Path]::GetFileName(($openStudioPlace.MainWindowTitle -replace ' - Roblox Studio$', '')) } else { $null }
    officialMcpLauncherInstalled = Test-Path -LiteralPath $launcher
    officialMcpConnection = [pscustomobject]@{
        connected = $mcpConnected
        liveStudioPlace = if ($studioInstance) { $studioInstance.name } else { $null }
        studioInstanceId = if ($studioInstance) { $studioInstance.studio_id } else { $null }
        studioMode = $studioMode
        discoveredToolCount = $studioToolNames.Count
        discoveredTools = $studioToolNames
        probeError = $liveProbeError
    }
    rojoAvailable = [bool]$rojo
    rojoPath = $rojo
    rojoVersion = $rojoVersion
    baseProjectPresent = $buildableProject
    liveDataModelInspection = $liveDataModelStatus
    liveConsoleRead = $consoleRead
    livePlaytest = $livePlaytestStatus
    viewportCapture = $viewportStatus
}
$reportPath = Join-Path $root 'evidence\roblox-verification.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $reportPath) -Force | Out-Null
[IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$report | Format-List
Write-Host "Report: $reportPath"

if (-not $studio -or -not (Test-Path -LiteralPath $launcher) -or -not $rojo -or -not $buildableProject) { exit 2 }
