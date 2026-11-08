[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rootPrefix = $root.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$backupDirectory = Join-Path $root '.lab-backups'
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff')
$destination = Join-Path $backupDirectory "lab-source-$timestamp.zip"
$sourceRoots = @('.agents', 'apps', 'src', 'tests', 'evidence', 'docs', 'projects', 'assets', 'skills', 'roblox', 'scripts')
$rootFiles = @(
    '.gitattributes', '.gitignore', 'AGENTS.md', 'ARCHITECTURE.md', 'CHANGELOG.md',
    'CONTRIBUTING.md', 'OPERATIONS.md', 'QUALITY_STANDARDS.md', 'README.md',
    'SECURITY.md', 'TROUBLESHOOTING.md', 'package.json', 'rokit.toml'
)

function Test-SkippedRelativePath([string]$RelativePath) {
    $parts = $RelativePath -replace '\\', '/' -split '/'
    foreach ($part in $parts) {
        if ($part -in @('.git', 'node_modules', '.tools', '.lab-runtime', '.lab-backups')) { return $true }
        if ($part -eq '__pycache__') { return $true }
        if ($part -like '.rojo*') { return $true }
    }
    if ($RelativePath -match '(^|/)evidence/generated(/|$)' -or $RelativePath -match '(\.blend1|\.py[co])$') { return $true }
    return $false
}

function Get-WorkspaceRelativePath([string]$FullPath) {
    $resolvedPath = [System.IO.Path]::GetFullPath($FullPath)
    if (-not $resolvedPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Backup inputs must remain inside the Lab workspace.'
    }
    return $resolvedPath.Substring($rootPrefix.Length).Replace('\', '/')
}

function Assert-NotLink([System.IO.FileSystemInfo]$Item) {
    if ($Item.LinkType -in @('SymbolicLink', 'Junction')) {
        throw "Refusing to back up a symbolic link or junction: $($Item.FullName)"
    }
}

$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
foreach ($relativeRoot in $sourceRoots) {
    $fullRoot = Join-Path $root $relativeRoot
    if (-not (Test-Path -LiteralPath $fullRoot)) { continue }
    $rootItem = Get-Item -LiteralPath $fullRoot -Force
    Assert-NotLink $rootItem
    if (-not $rootItem.PSIsContainer) {
        if (-not (Test-SkippedRelativePath $relativeRoot)) { $files.Add([System.IO.FileInfo]$rootItem) }
        continue
    }
    $pendingDirectories = [System.Collections.Generic.Stack[System.IO.DirectoryInfo]]::new()
    $pendingDirectories.Push([System.IO.DirectoryInfo]$rootItem)
    while ($pendingDirectories.Count -gt 0) {
        $directory = $pendingDirectories.Pop()
        foreach ($item in Get-ChildItem -LiteralPath $directory.FullName -Force) {
            Assert-NotLink $item
            $relativePath = Get-WorkspaceRelativePath $item.FullName
            if (Test-SkippedRelativePath $relativePath) { continue }
            if ($item.PSIsContainer) { $pendingDirectories.Push([System.IO.DirectoryInfo]$item) }
            else { $files.Add([System.IO.FileInfo]$item) }
        }
    }
}
foreach ($relativeFile in $rootFiles) {
    $fullPath = Join-Path $root $relativeFile
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $fullPath -Force
    Assert-NotLink $item
    $files.Add([System.IO.FileInfo]$item)
}

$files = @($files | Sort-Object { Get-WorkspaceRelativePath $_.FullName } -Unique)
if ($files.Count -eq 0) { throw 'No Lab source files were available to back up.' }
if (Test-Path -LiteralPath $destination) { throw "Backup already exists; refusing to overwrite: $destination" }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$manifestFiles = [System.Collections.Generic.List[object]]::new()
$archive = [System.IO.File]::Open($destination, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
    $zip = [System.IO.Compression.ZipArchive]::new($archive, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in $files) {
            $relativePath = Get-WorkspaceRelativePath $file.FullName
            $entry = $zip.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
            $input = [System.IO.File]::OpenRead($file.FullName)
            try {
                $output = $entry.Open()
                try { $input.CopyTo($output) } finally { $output.Dispose() }
            } finally { $input.Dispose() }
            $manifestFiles.Add([pscustomobject]@{
                path = $relativePath
                length = $file.Length
                sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            })
        }
        $manifest = [pscustomobject]@{
            schemaVersion = 1
            createdAtUtc = [DateTime]::UtcNow.ToString('o')
            fileCount = $manifestFiles.Count
            files = @($manifestFiles)
        }
        $manifestEntry = $zip.CreateEntry('manifest.json', [System.IO.Compression.CompressionLevel]::Optimal)
        $manifestStream = $manifestEntry.Open()
        try {
            $json = $manifest | ConvertTo-Json -Depth 5
            $writer = [System.IO.StreamWriter]::new($manifestStream, [System.Text.UTF8Encoding]::new($false))
            try { $writer.Write($json) } finally { $writer.Dispose() }
        } finally { $manifestStream.Dispose() }
    } finally { $zip.Dispose() }
} catch {
    $archive.Dispose()
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    throw
} finally {
    if (-not $archive.SafeFileHandle.IsClosed) { $archive.Dispose() }
}

$backup = Get-Item -LiteralPath $destination
[pscustomobject]@{
    Path = $backup.FullName
    Bytes = $backup.Length
    CreatedAtUtc = $backup.LastWriteTimeUtc.ToString('o')
    Files = $manifestFiles.Count
    Manifest = 'manifest.json (SHA-256 per included source file)'
} | Format-List
