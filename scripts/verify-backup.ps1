[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$archiveFile = Get-Item -LiteralPath $ArchivePath -ErrorAction Stop
if ($archiveFile.PSIsContainer -or $archiveFile.Extension -ne '.zip') {
    throw 'ArchivePath must name an existing ZIP archive.'
}

$restoreRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lab-backup-restore-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $restoreRoot -ErrorAction Stop | Out-Null
$restoreRootFull = [System.IO.Path]::GetFullPath($restoreRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$expectedFiles = @{}
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try { [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Get-SafeEntryPath([string]$name) {
    if ([string]::IsNullOrWhiteSpace($name) -or $name.Contains([char]0)) { throw 'Archive contains an empty or invalid entry name.' }
    $normalized = $name.Replace('\', '/')
    if ($normalized.StartsWith('/') -or $normalized -match '^[A-Za-z]:' -or $normalized.StartsWith('//')) {
        throw "Archive contains a rooted entry path: $name"
    }
    $isDirectory = $normalized.EndsWith('/')
    $components = @($normalized.TrimEnd('/').Split('/'))
    $unsafeComponents = @($components | Where-Object { $_ -in @('', '.', '..') -or $_ -match '[<>:"|?*\[\]]' -or $_ -match '[ .]$' })
    if ($components.Count -eq 0 -or $unsafeComponents.Count -gt 0) {
        throw "Archive contains an unsafe entry path: $name"
    }
    foreach ($component in $components) {
        if ($component -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$') {
            throw "Archive contains a Windows device-name path: $name"
        }
    }
    $relative = $components -join [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath((Join-Path $restoreRootFull $relative))
    if (-not $full.StartsWith($restoreRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Archive entry escapes the restore directory: $name"
    }
    return [pscustomobject]@{ Relative = ($components -join '/'); Full = $full; IsDirectory = $isDirectory }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archiveFile.FullName)
try {
    $validated = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $zip.Entries) {
        $safe = Get-SafeEntryPath $entry.FullName
        if (-not $seen.Add($safe.Relative)) { throw "Archive contains a duplicate path: $($safe.Relative)" }
        $external = [uint32]$entry.ExternalAttributes
        $windowsAttributes = $external -band 0xFFFF
        $unixType = ($external -shr 16) -band 0xF000
        if (($windowsAttributes -band [uint32][System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $unixType -eq 0xA000) {
            throw "Archive contains a symbolic link or reparse entry: $($safe.Relative)"
        }
        $validated.Add([pscustomobject]@{ Entry = $entry; Safe = $safe })
    }

    $manifestRecord = $validated | Where-Object { $_.Safe.Relative -ceq 'manifest.json' -and -not $_.Safe.IsDirectory }
    if (-not $manifestRecord) { throw 'Archive is missing manifest.json.' }
    $manifestReader = [System.IO.StreamReader]::new($manifestRecord.Entry.Open())
    try { $manifest = $manifestReader.ReadToEnd() | ConvertFrom-Json } finally { $manifestReader.Dispose() }
    if ($manifest.schemaVersion -ne 1 -or $manifest.files -isnot [array] -or $manifest.fileCount -ne $manifest.files.Count) {
        throw 'Backup manifest is invalid or unsupported.'
    }

    foreach ($record in $validated) {
        $safe = $record.Safe
        if ($safe.IsDirectory) {
            New-Item -ItemType Directory -Path $safe.Full -Force | Out-Null
            continue
        }
        $parent = Split-Path -Parent $safe.Full
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        if (Test-Path -LiteralPath $safe.Full) { throw "Restore path already exists inside the new destination: $($safe.Relative)" }
        $input = $record.Entry.Open()
        try {
            $output = [System.IO.File]::Open($safe.Full, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            try { $input.CopyTo($output) } finally { $output.Dispose() }
        } finally { $input.Dispose() }
    }

    foreach ($file in $manifest.files) {
        if (-not $file.path -or $file.path -ceq 'manifest.json' -or $file.length -lt 0 -or $file.sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
            throw 'Backup manifest contains an invalid file record.'
        }
        $manifestPath = [string]$file.path
        if (-not $seen.Contains($manifestPath)) { throw "Manifest file is missing from the archive: $manifestPath" }
        $safe = Get-SafeEntryPath $manifestPath
        $restored = Join-Path $restoreRootFull ($safe.Relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $restored -PathType Leaf)) { throw "Manifest path is not a restored file: $manifestPath" }
        $item = Get-Item -LiteralPath $restored
        $hash = Get-Sha256Hex $restored
        if ($item.Length -ne [long]$file.length -or $hash -ine [string]$file.sha256) {
            throw "Restored file hash or length does not match its manifest: $manifestPath"
        }
        $expectedFiles[$safe.Relative] = $true
    }

    $archiveFiles = @($validated | Where-Object { -not $_.Safe.IsDirectory -and $_.Safe.Relative -cne 'manifest.json' })
    if ($archiveFiles.Count -ne $manifest.fileCount -or $expectedFiles.Count -ne $manifest.fileCount) {
        throw 'Archive entries and manifest file inventory do not match.'
    }
    foreach ($record in $archiveFiles) {
        if (-not $expectedFiles.ContainsKey($record.Safe.Relative)) { throw "Archive contains an unmanifested file: $($record.Safe.Relative)" }
    }

    $requiredFiles = @('package.json', 'src/server/app.js', 'tests/path-policy.test.js', '.agents/skills/roblox-production-lab/SKILL.md')
    foreach ($relative in $requiredFiles) {
        if (-not $expectedFiles.ContainsKey($relative)) { throw "Required source file is missing: $relative" }
    }
    $requiredRoots = @('.agents', 'apps', 'src', 'tests', 'evidence', 'docs', 'projects', 'assets', 'skills', 'roblox', 'scripts')
    foreach ($relative in $requiredRoots) {
        $prefix = "$relative/"
        if (-not ($expectedFiles.Keys | Where-Object { $_.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) })) {
            throw "Required source root is missing or empty: $relative"
        }
    }

    [pscustomobject]@{
        Result = 'PASS'
        Archive = $archiveFile.FullName
        RestoredTo = $restoreRootFull
        FilesVerified = $manifest.fileCount
        RequiredRoots = $requiredRoots -join ', '
        Hashes = 'All restored files match manifest SHA-256 and byte length.'
        RestoreCleanup = 'The temporary restore directory is removed after verification.'
    } | Format-List
} catch {
    Remove-Item -LiteralPath $restoreRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw
} finally {
    $zip.Dispose()
    if (Test-Path -LiteralPath $restoreRoot) {
        $restoreItem = Get-Item -LiteralPath $restoreRoot -Force
        if ($restoreItem.LinkType -in @('SymbolicLink', 'Junction')) {
            Remove-Item -LiteralPath $restoreRoot -Force
        } elseif ($restoreItem.PSIsContainer) {
            Remove-Item -LiteralPath $restoreRoot -Recurse -Force
        } else {
            Remove-Item -LiteralPath $restoreRoot -Force
        }
    }
}
