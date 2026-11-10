[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PlaceFile,
    [Parameter(Mandatory = $true)][string]$PlaceName,
    [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = 'Stop'

function Write-Result([object]$Value, [int]$ExitCode = 0) {
    $Value | ConvertTo-Json -Compress
    exit $ExitCode
}

function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($FilePath)
        try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
        finally { $stream.Dispose() }
    } finally { $algorithm.Dispose() }
}

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sandboxRoot = [IO.Path]::GetFullPath((Join-Path $root '.lab-runtime\sandbox'))
if (-not $sandboxRoot.EndsWith([IO.Path]::DirectorySeparatorChar)) { $sandboxRoot += [IO.Path]::DirectorySeparatorChar }
try { $resolvedPlace = (Resolve-Path -LiteralPath $PlaceFile).Path }
catch {
    Write-Result ([ordered]@{ status = 'failed'; code = 'SANDBOX_SAVE_FILE_MISSING'; message = 'The sandbox place file does not exist.' }) 1
}
$resolvedPlace = [IO.Path]::GetFullPath($resolvedPlace)
if (-not $resolvedPlace.StartsWith($sandboxRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Write-Result ([ordered]@{ status = 'failed'; code = 'SANDBOX_SAVE_PATH_OUTSIDE'; message = 'The save helper only writes inside .lab-runtime/sandbox.' }) 1
}
if ([IO.Path]::GetFileName($resolvedPlace) -ne $PlaceName -or $PlaceName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.rbxlx?$') {
    Write-Result ([ordered]@{ status = 'failed'; code = 'SANDBOX_SAVE_PLACE_MISMATCH'; message = 'The place file name does not match the approved sandbox place.' }) 1
}

$processes = @(Get-Process -Name RobloxStudioBeta -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.MainWindowTitle.Contains($PlaceName) -and $_.MainWindowTitle.Contains('Roblox Studio')
})
if ($processes.Count -ne 1) {
    Write-Result ([ordered]@{ status = 'failed'; code = 'SANDBOX_SAVE_WINDOW_AMBIGUOUS'; message = "Expected exactly one Studio window containing $PlaceName; found $($processes.Count)." }) 1
}
$studio = $processes[0]
$beforeItem = Get-Item -LiteralPath $resolvedPlace
$beforeHash = Get-Sha256Hex $resolvedPlace
$backupDir = Join-Path $sandboxRoot 'backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupName = '{0}.{1}.bak.rbxlx' -f $PlaceName, ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
$backupPath = Join-Path $backupDir $backupName
Copy-Item -LiteralPath $resolvedPlace -Destination $backupPath
$backupHash = Get-Sha256Hex $backupPath

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LabSaveWin32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
'@
Add-Type -AssemblyName System.Windows.Forms

$targetHandle = [IntPtr]$studio.MainWindowHandle
$previousHandle = [LabSaveWin32]::GetForegroundWindow()
$result = [ordered]@{
    status = 'failed'
    code = 'SANDBOX_SAVE_UNKNOWN'
    placeFile = $resolvedPlace
    placeName = $PlaceName
    processId = $studio.Id
    windowTitle = $studio.MainWindowTitle
    beforeSha256 = $beforeHash
    afterSha256 = $beforeHash
    beforeBytes = $beforeItem.Length
    changed = $false
    backupPath = $backupPath
    backupSha256 = $backupHash
}
$exitCode = 1

try {
    if ([LabSaveWin32]::IsIconic($targetHandle)) { [void][LabSaveWin32]::ShowWindow($targetHandle, 9) }
    [void][LabSaveWin32]::SetForegroundWindow($targetHandle)
    Start-Sleep -Milliseconds 350
    $foreground = [LabSaveWin32]::GetForegroundWindow()
    $foregroundPid = 0
    [void][LabSaveWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
    if ($foregroundPid -ne $studio.Id) {
        $result.code = 'SANDBOX_SAVE_FOCUS_FAILED'
        $result.message = 'The target Studio window could not be verified as the foreground window.'
    } else {
        [System.Windows.Forms.SendKeys]::SendWait('^s')
        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        do {
            Start-Sleep -Milliseconds 500
            $afterHash = Get-Sha256Hex $resolvedPlace
            if ($afterHash -ne $beforeHash) { break }
        } while ((Get-Date) -lt $deadline)

        $result.afterSha256 = $afterHash
        $result.changed = $afterHash -ne $beforeHash
        $result.status = if ($result.changed) { 'saved' } else { 'no-change' }
        $result.code = if ($result.changed) { 'SANDBOX_SAVE_WROTE_FILE' } else { 'SANDBOX_SAVE_NO_CHANGE' }
        if ($result.changed) { $exitCode = 0 }
    }
} catch {
    if ($result.code -eq 'SANDBOX_SAVE_UNKNOWN') { $result.code = 'SANDBOX_SAVE_EXCEPTION' }
    $result.message = $_.Exception.Message
} finally {
    if ($previousHandle -ne [IntPtr]::Zero -and $previousHandle -ne $targetHandle) {
        [void][LabSaveWin32]::SetForegroundWindow($previousHandle)
    }
}
Write-Result $result $exitCode
