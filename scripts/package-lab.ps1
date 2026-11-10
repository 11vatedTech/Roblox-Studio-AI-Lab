[CmdletBinding()]
param(
    [string]$OutputPath,
    [switch]$SkipExtractionVerification
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')
function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try { [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $root ".lab-runtime\packages\lab-portable-$timestamp.zip"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $root $OutputPath
}
$destination = [IO.Path]::GetFullPath($OutputPath)

$toolEntries = @(
    @{ Path = '.tools/rojo-7.7.1/rojo.exe'; Source = '.tools\rojo-7.7.1\rojo.exe' },
    @{ Path = '.tools/luau-0.745/luau.exe'; Source = '.tools\luau-0.745\luau.exe' },
    @{ Path = '.tools/luau-0.745/luau-analyze.exe'; Source = '.tools\luau-0.745\luau-analyze.exe' },
    @{ Path = '.tools/luau-0.745/luau-compile.exe'; Source = '.tools\luau-0.745\luau-compile.exe' }
)
foreach ($tool in $toolEntries) {
    $toolPath = Join-Path $root $tool.Source
    $toolItem = Get-Item -LiteralPath $toolPath -Force -ErrorAction Stop
    if (-not $toolItem.Exists -or $toolItem.PSIsContainer -or $toolItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
        throw "A pinned package tool must be a regular local file: $($tool.Source)"
    }
}
$rojoPath = Join-Path $root '.tools\rojo-7.7.1\rojo.exe'
$rojoVersion = (& $rojoPath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $rojoVersion -ne 'Rojo 7.7.1') { throw "The portable package requires pinned Rojo 7.7.1; found '$rojoVersion'." }

& (Join-Path $PSScriptRoot 'backup.ps1') -ArchivePath $destination

Add-Type -AssemblyName System.IO.Compression
$archiveFile = [System.IO.File]::Open($destination, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
    $zip = [System.IO.Compression.ZipArchive]::new($archiveFile, [System.IO.Compression.ZipArchiveMode]::Update, $true)
    try {
        $manifestEntry = $zip.GetEntry('manifest.json')
        if (-not $manifestEntry) { throw 'The source package archive is missing manifest.json.' }
        $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
        try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        $files = [System.Collections.Generic.List[object]]::new()
        foreach ($file in $manifest.files) { $files.Add($file) }

        foreach ($tool in $toolEntries) {
            if ($zip.GetEntry($tool.Path)) { throw "The source archive unexpectedly contains a tool path: $($tool.Path)" }
            $entry = $zip.CreateEntry($tool.Path, [System.IO.Compression.CompressionLevel]::Optimal)
            $input = [System.IO.File]::OpenRead((Join-Path $root $tool.Source))
            try {
                $output = $entry.Open()
                try { $input.CopyTo($output) } finally { $output.Dispose() }
            } finally { $input.Dispose() }
            $toolItem = Get-Item -LiteralPath (Join-Path $root $tool.Source)
            $files.Add([pscustomobject]@{
                path = $tool.Path
                length = $toolItem.Length
                sha256 = Get-Sha256Hex $toolItem.FullName
            })
        }

        $manifestEntry.Delete()
        $manifest.files = @($files | Sort-Object path)
        $manifest.fileCount = $manifest.files.Count
        $manifest | Add-Member -NotePropertyName package -NotePropertyValue ([pscustomobject]@{
            format = 'lab-portable-source-toolchain'
            createdAtUtc = [DateTime]::UtcNow.ToString('o')
            nodeMinimumMajor = 20
            bundledNodeRuntime = $false
            rojoVersion = '7.7.1'
            luauVersion = '0.745'
            bundledTools = @($toolEntries | ForEach-Object Path)
        }) -Force
        $newManifest = $zip.CreateEntry('manifest.json', [System.IO.Compression.CompressionLevel]::Optimal)
        $manifestStream = $newManifest.Open()
        try {
            $writer = [System.IO.StreamWriter]::new($manifestStream, [System.Text.UTF8Encoding]::new($false))
            try { $writer.Write(($manifest | ConvertTo-Json -Depth 10)) } finally { $writer.Dispose() }
        } finally { $manifestStream.Dispose() }
    } finally { $zip.Dispose() }
} finally {
    if (-not $archiveFile.SafeFileHandle.IsClosed) { $archiveFile.Dispose() }
}

& (Join-Path $PSScriptRoot 'verify-backup.ps1') -ArchivePath $destination
$package = Get-Item -LiteralPath $destination
$packageHash = Get-Sha256Hex $destination
[pscustomobject]@{
    Result = 'PASS'
    Package = $package.FullName
    Bytes = $package.Length
    Sha256 = $packageHash
    NodeRuntime = 'Not bundled; Node.js 20 or newer must already be installed.'
    Tools = 'Rojo 7.7.1 and Luau 0.745 binaries are bundled and hash-verified.'
} | Format-List

if (-not $SkipExtractionVerification) {
    & (Join-Path $PSScriptRoot 'verify-package.ps1') -ArchivePath $destination
}
