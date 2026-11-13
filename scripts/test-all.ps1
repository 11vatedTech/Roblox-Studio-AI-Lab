[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$versionText = (& $node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(?<major>\d+)') { throw "Could not read Node.js version: $versionText" }
if ([int]$Matches.major -lt 20) { throw "Node.js 20 or newer is required; found $versionText." }

Push-Location $root
try {
    & $node --test
    if ($LASTEXITCODE -ne 0) { throw 'Node test suite failed.' }
} finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot 'lint-luau.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Luau syntax validation failed.' }

& (Join-Path $PSScriptRoot 'run-luau-specs.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Luau CLI specs failed.' }

& (Join-Path $PSScriptRoot 'build-all.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Rojo build validation failed.' }
