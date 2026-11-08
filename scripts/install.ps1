[CmdletBinding()]
param([switch]$SkipBootstrapTests)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source

$nodeVersionText = (& $nodePath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersionText -notmatch '^v(?<major>\d+)') { throw "Could not read Node.js version: $nodeVersionText" }
if ([int]$Matches.major -lt 20) { throw "Node.js 20 or newer is required; found $nodeVersionText." }

$rojoDirectory = Join-Path $root '.tools\rojo-7.7.1'
$rojoExecutable = Join-Path $rojoDirectory 'rojo.exe'
if (Test-Path -LiteralPath $rojoExecutable) {
    $existingVersion = (& $rojoExecutable --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $existingVersion -ne 'Rojo 7.7.1') { throw "The local Rojo binary is not the pinned release: $existingVersion" }
} else {
    New-Item -ItemType Directory -Path (Join-Path $root '.tools') -Force | Out-Null
    $archive = Join-Path $root '.tools\rojo-7.7.1-windows-x86_64.zip'
    $extractDirectory = Join-Path $root '.tools\rojo-7.7.1-extracted'
    $downloadUrl = 'https://github.com/rojo-rbx/rojo/releases/download/v7.7.1/rojo-7.7.1-windows-x86_64.zip'
    $expectedSha256 = 'd4dfa3493a1613a43fc87312d6dac660d7c8bf38e6a99aa5dcd0d26154ba0b82'

    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $downloadUrl -OutFile $archive }
    $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) { throw "Rojo archive SHA-256 mismatch. Expected $expectedSha256; found $actualSha256." }
    if (Test-Path -LiteralPath $extractDirectory) { throw 'A previous Rojo extraction exists. Review .tools/rojo-7.7.1-extracted before running install again.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $extractDirectory
    $sourceExecutable = Join-Path $extractDirectory 'rojo.exe'
    if (-not (Test-Path -LiteralPath $sourceExecutable)) { throw 'The verified release did not contain rojo.exe at its archive root.' }
    if (Test-Path -LiteralPath $rojoDirectory) { throw 'The pinned Rojo destination already exists but has no executable. Review it before installing.' }
    New-Item -ItemType Directory -Path $rojoDirectory | Out-Null
    Copy-Item -LiteralPath $sourceExecutable -Destination $rojoExecutable
    $installedVersion = (& $rojoExecutable --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $installedVersion -ne 'Rojo 7.7.1') { throw "Installed Rojo version check failed: $installedVersion" }
    Write-Host "Installed official Rojo 7.7.1 locally. Archive SHA-256: $actualSha256"
}

$luauDirectory = Join-Path $root '.tools\luau-0.745'
$luauAnalyzer = Join-Path $luauDirectory 'luau-analyze.exe'
$luauCompiler = Join-Path $luauDirectory 'luau-compile.exe'
$luauRuntime = Join-Path $luauDirectory 'luau.exe'
if ((Test-Path -LiteralPath $luauAnalyzer) -and (Test-Path -LiteralPath $luauCompiler) -and (Test-Path -LiteralPath $luauRuntime)) {
    Write-Host 'Pinned Luau 0.745 runtime, parser, and analyzer are installed locally.'
} else {
    $archive = Join-Path $root '.tools\luau-0.745-windows.zip'
    $extractDirectory = Join-Path $root '.tools\luau-0.745-extracted'
    $downloadUrl = 'https://github.com/luau-lang/luau/releases/download/0.745/luau-windows.zip'
    $expectedSha256 = '5afe2fd5db34a045a2e4261ec0ea3144da6346ff38808726d5ac6e06115081c6'
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $downloadUrl -OutFile $archive }
    $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $expectedSha256) { throw "Luau archive SHA-256 mismatch. Expected $expectedSha256; found $actualSha256." }
    if (Test-Path -LiteralPath $extractDirectory) { throw 'A previous Luau extraction exists. Review .tools/luau-0.745-extracted before running install again.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $extractDirectory
    foreach ($executable in @('luau.exe', 'luau-analyze.exe', 'luau-compile.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extractDirectory $executable))) { throw "The verified release did not contain $executable." }
    }
    if (Test-Path -LiteralPath $luauDirectory) { throw 'The pinned Luau destination already exists but is incomplete. Review it before installing.' }
    New-Item -ItemType Directory -Path $luauDirectory | Out-Null
    foreach ($executable in @('luau.exe', 'luau-analyze.exe', 'luau-compile.exe')) {
        Copy-Item -LiteralPath (Join-Path $extractDirectory $executable) -Destination (Join-Path $luauDirectory $executable)
    }
    Write-Host "Installed official Luau 0.745 locally. Archive SHA-256: $actualSha256"
}

$bootstrapArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'bootstrap.ps1'))
if ($SkipBootstrapTests) { $bootstrapArgs += '-SkipTests' }
& powershell.exe @bootstrapArgs
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed.' }
