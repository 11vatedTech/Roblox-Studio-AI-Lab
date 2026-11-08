[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$compiler = Join-Path $root '.tools\luau-0.745\luau-compile.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $command = Get-Command luau-compile -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Luau 0.745 parser is unavailable. Run scripts/install.ps1 to install the checksum-pinned official CLI.' }
    $compiler = $command.Source
}
$sourceRoots = @((Join-Path $root 'roblox'), (Join-Path $root 'projects')) | Where-Object { Test-Path -LiteralPath $_ }
$sourceFiles = @($sourceRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Recurse -File -Filter '*.luau' } | ForEach-Object FullName)
if ($sourceFiles.Count -eq 0) { throw 'No Luau sources were found under roblox/ or projects/.' }
& $compiler --only-parse @sourceFiles
if ($LASTEXITCODE -ne 0) { throw 'Luau syntax parsing failed.' }
Write-Host "Luau syntax parsed successfully: $($sourceFiles.Count) source files using $compiler"
Write-Host 'Type analysis is not claimed: Roblox engine type definitions are not part of the stock Luau CLI archive.'
