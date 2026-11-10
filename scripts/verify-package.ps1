[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try { [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
$archiveItem = Get-Item -LiteralPath $ArchivePath -Force -ErrorAction Stop
if ($archiveItem.PSIsContainer -or $archiveItem.Extension -ine '.zip' -or $archiveItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
    throw 'ArchivePath must identify a regular ZIP package.'
}
$archivePathFull = [IO.Path]::GetFullPath($archiveItem.FullName)
$originalHash = Get-Sha256Hex $archivePathFull

# The source verifier rejects traversal, duplicate, link, missing, and tampered entries before extraction.
& (Join-Path $PSScriptRoot 'verify-backup.ps1') -ArchivePath $archivePathFull
if ((Get-Sha256Hex $archivePathFull) -ne $originalHash) {
    throw 'The package changed while its archive contents were being validated.'
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
$verificationId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$verificationRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ("lp-" + $verificationId)))
$zipCopy = [IO.Path]::GetFullPath((Join-Path $tempBase ("lp-" + $verificationId + '.zip')))
if (-not $verificationRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'The package verification directory escaped the system temporary root.' }
if ((Test-Path -LiteralPath $verificationRoot) -or (Test-Path -LiteralPath $zipCopy)) { throw 'A temporary package verification path already exists; retry the verification.' }
New-Item -ItemType Directory -Path $verificationRoot -ErrorAction Stop | Out-Null
$extractRoot = $verificationRoot

try {
    Copy-Item -LiteralPath $archivePathFull -Destination $zipCopy
    if ((Get-Sha256Hex $zipCopy) -ne $originalHash) {
        throw 'The private package copy does not match the validated archive.'
    }
    Expand-Archive -LiteralPath $zipCopy -DestinationPath $extractRoot -ErrorAction Stop

    $manifestPath = Join-Path $extractRoot 'manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $validPackageMetadata = $manifest.package.format -eq 'lab-portable-source-toolchain' -and $manifest.package.nodeMinimumMajor -eq 20 -and $manifest.package.bundledNodeRuntime -eq $false -and $manifest.package.rojoVersion -eq '7.7.1' -and $manifest.package.luauVersion -eq '0.745'
    if (-not $validPackageMetadata) {
        throw 'The package toolchain manifest is invalid or unsupported.'
    }

    $excludedPaths = @('.git/', 'node_modules/', '.lab-runtime/', '.lab-backups/')
    foreach ($file in $manifest.files) {
        $normalized = ([string]$file.path).Replace('\', '/')
        foreach ($excluded in $excludedPaths) {
            if ($normalized.StartsWith($excluded, [StringComparison]::OrdinalIgnoreCase) -or $normalized.Contains("/$excluded")) {
                throw "The portable package contains excluded runtime state: $normalized"
            }
        }
        if ($normalized -match '(^|/)\.env($|\.(?!example$))' -or $normalized -match '(^|/)(?i:secrets?|credentials?)(/|$)') {
            throw "The portable package contains a secret-like path: $normalized"
        }
    }

    $node = Get-Command node -ErrorAction Stop
    $nodeVersion = (& $node.Source --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>\d+)' -or [int]$Matches.major -lt 20) {
        throw "The extracted package needs Node.js 20 or newer; found '$nodeVersion'."
    }
    $rojo = Join-Path $extractRoot '.tools\rojo-7.7.1\rojo.exe'
    if (-not (Test-Path -LiteralPath $rojo -PathType Leaf) -or ((& $rojo --version).Trim() -ne 'Rojo 7.7.1')) {
        throw 'The extracted package does not contain the pinned Rojo 7.7.1 tool.'
    }
    foreach ($tool in @('luau.exe', 'luau-analyze.exe', 'luau-compile.exe')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extractRoot ".tools\luau-0.745\$tool") -PathType Leaf)) {
            throw "The extracted package is missing pinned Luau tool $tool."
        }
    }

    Push-Location $extractRoot
    try {
        & (Join-Path $extractRoot 'scripts\test-all.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'The clean-extraction offline test and build run failed.' }
    } finally {
        Pop-Location
    }
    Write-Host "PASS: package extracted to a clean directory and passed the offline suite using $nodeVersion."
    Write-Host 'Evidence validation requiring the original Git checkout is run separately by CI.'
} finally {
    if (Test-Path -LiteralPath $verificationRoot) {
        $tempItem = Get-Item -LiteralPath $verificationRoot -Force
        if ($tempItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
            Remove-Item -LiteralPath $verificationRoot -Force
        } elseif ($tempItem.PSIsContainer) {
            Remove-Item -LiteralPath $verificationRoot -Recurse -Force
        } else {
            Remove-Item -LiteralPath $verificationRoot -Force
        }
    }
    if (Test-Path -LiteralPath $zipCopy -PathType Leaf) {
        Remove-Item -LiteralPath $zipCopy -Force
    }
}
