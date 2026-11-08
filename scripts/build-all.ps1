[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rootPrefix = $root.TrimEnd('\') + '\'
function Get-WorkspaceRelativePath([string]$Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build outputs must stay inside the Lab workspace.' }
    return $fullPath.Substring($rootPrefix.Length).Replace('/', '\')
}
$rojo = Join-Path $root '.tools\rojo-7.7.1\rojo.exe'
if (-not (Test-Path -LiteralPath $rojo)) {
    $command = Get-Command rojo -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Rojo 7.7.1 is not installed. Run scripts/install.ps1 or install the pinned tool from the official Rojo release.' }
    $rojo = $command.Source
}

$buildDirectory = Join-Path $root '.lab-runtime\builds'
New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
$projects = @((Join-Path $root 'roblox\templates\base'))
$projects += Get-ChildItem -LiteralPath (Join-Path $root 'projects') -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
$results = @()
foreach ($projectDirectory in $projects) {
    $projectFile = Join-Path $projectDirectory 'default.project.json'
    if (-not (Test-Path -LiteralPath $projectFile)) { continue }
    $slug = Split-Path -Leaf $projectDirectory
    $output = Join-Path $buildDirectory "$slug-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')).rbxlx"
    Push-Location $projectDirectory
    try {
        & $rojo build 'default.project.json' --output $output
        if ($LASTEXITCODE -ne 0) { throw "Rojo build failed for $projectDirectory." }
        $results += [pscustomobject]@{ Project = $projectDirectory; Output = $output; Bytes = (Get-Item -LiteralPath $output).Length; Status = 'built' }
    } finally {
        Pop-Location
    }
}
if ($results.Count -eq 0) { throw 'No Rojo project files were found to build.' }
$results | Format-Table -AutoSize
$reportPath = Join-Path $root 'evidence\build-report.json'
$reportDirectory = Split-Path -Parent $reportPath
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$report = [pscustomobject]@{
    schemaVersion = 1
    capturedAt = [DateTime]::UtcNow.ToString('o')
    rojoVersion = (& $rojo --version).Trim()
    projects = @($results | ForEach-Object { [pscustomobject]@{ project = Get-WorkspaceRelativePath $_.Project; output = Get-WorkspaceRelativePath $_.Output; bytes = $_.Bytes; status = $_.Status } })
}
[IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Host "Build report: $reportPath"
