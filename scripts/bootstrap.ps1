[CmdletBinding()]
param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Get-CommandPath([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

$nodePath = Get-CommandPath 'node'
if (-not $nodePath) { throw 'Node.js 20 or newer is required. Install Node.js from the official vendor source, then rerun bootstrap.ps1.' }
$nodeVersionText = (& $nodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(?<major>\d+)') { throw "Could not read the Node.js version: $nodeVersionText" }
if ([int]$Matches.major -lt 20) { throw "Node.js 20 or newer is required; found $nodeVersionText." }

$gitPath = Get-CommandPath 'git'
if (-not $gitPath) { throw 'Git is required for source control. Install Git for Windows from its official source, then rerun bootstrap.ps1.' }
$gitVersionText = (& $gitPath --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Git was found but did not respond to --version.' }

foreach ($directory in @('projects', 'assets', 'evidence', 'evidence/studio', 'evidence/environment')) {
    $target = Join-Path $root $directory
    if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
}

$rojoPath = Join-Path $root '.tools\rojo-7.7.1\rojo.exe'
if (-not (Test-Path -LiteralPath $rojoPath)) { $rojoPath = Get-CommandPath 'rojo' }
$gitRoot = & $gitPath -C $root rev-parse --show-toplevel 2>$null
$gitRepository = $LASTEXITCODE -eq 0 -and [IO.Path]::GetFullPath($gitRoot.Trim()).Equals($root, [StringComparison]::OrdinalIgnoreCase)

$report = [pscustomobject]@{
    Node = $nodeVersionText
    Git = $gitVersionText
    Rojo = if ($rojoPath) { (& $rojoPath --version).Trim() } else { 'not installed' }
    GitRepository = $gitRepository
    Workspace = $root
}
$report | Format-List

if (-not $SkipTests) {
    Push-Location $root
    try {
        & $nodePath --test
        if ($LASTEXITCODE -ne 0) { throw 'Offline test suite failed.' }
    } finally {
        Pop-Location
    }
}
