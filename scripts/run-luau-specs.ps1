[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rootPrefix = $root.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$projectsRoot = Join-Path $root 'projects'
$luau = Join-Path $root '.tools\luau-0.745\luau.exe'

if (-not (Test-Path -LiteralPath $luau -PathType Leaf)) {
    throw 'Pinned Luau 0.745 CLI is unavailable. Run scripts/install.ps1 to install the checksum-pinned official compiler and runtime.'
}
$projectsItem = Get-Item -LiteralPath $projectsRoot -Force -ErrorAction Stop
if (-not $projectsItem.PSIsContainer -or $projectsItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
    throw 'The projects root must be a real directory.'
}

$specs = @(Get-ChildItem -LiteralPath $projectsRoot -Recurse -File -Filter '*.cli.spec.luau' | Sort-Object FullName)
if ($specs.Count -eq 0) { throw 'No Roblox-free Luau CLI specs were found under projects/.' }
if ($specs.Count -gt 500) { throw 'Luau CLI spec count exceeds the 500-file execution limit.' }

$projectsPrefix = [System.IO.Path]::GetFullPath($projectsRoot).TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$passed = 0
foreach ($spec in $specs) {
    $resolvedSpec = [System.IO.Path]::GetFullPath($spec.FullName)
    if (-not $resolvedSpec.StartsWith($projectsPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or $spec.LinkType -in @('SymbolicLink', 'Junction', 'HardLink') -or $spec.Length -gt 1024 * 1024) {
        throw "Luau CLI spec must be a regular in-project file no larger than 1 MiB: $resolvedSpec"
    }

    $current = Get-Item -LiteralPath $resolvedSpec -Force
    while ($current.FullName.StartsWith($projectsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        if ($current.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
            throw "Luau CLI spec path traverses a link: $resolvedSpec"
        }
        $current = Get-Item -LiteralPath (Split-Path -Parent $current.FullName) -Force
    }

    $relative = $resolvedSpec.Substring($rootPrefix.Length).Replace('\', '/')
    Write-Host "Running $relative"
    & $luau $resolvedSpec
    if ($LASTEXITCODE -ne 0) { throw "Luau CLI spec failed: $relative" }
    $passed += 1
}

Write-Host "PASS: $passed Luau CLI specs using pinned Luau 0.745. Engine-dependent Studio specs were not run by this command."
