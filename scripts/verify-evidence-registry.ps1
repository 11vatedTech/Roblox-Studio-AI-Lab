[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try { [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$evidenceDirectory = Join-Path $root 'evidence\p0'
$evidenceItem = Get-Item -LiteralPath $evidenceDirectory -Force -ErrorAction Stop
if (-not $evidenceItem.PSIsContainer -or $evidenceItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
    throw 'The evidence output directory must be a real directory inside the Lab workspace.'
}

$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'")
$relativeEvidence = "evidence/p0/lab-evidence-registry-verification-$stamp.json"
$evidencePath = [IO.Path]::GetFullPath((Join-Path $root ($relativeEvidence.Replace('/', [IO.Path]::DirectorySeparatorChar))))
if (-not $evidencePath.StartsWith((Join-Path $evidenceDirectory ''), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The generated evidence path escaped evidence/p0.'
}

Push-Location $root
try {
    $command = 'node --test tests/evidence-registry.test.js tests/capability-register-api.test.js tests/lab-server.test.js'
    $output = @(& node --test tests/evidence-registry.test.js tests/capability-register-api.test.js tests/lab-server.test.js 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $output | ForEach-Object { Write-Host $_ }
        throw "Evidence registry verification failed with exit code $exitCode."
    }

    $sourceFiles = @(
        'src/services/evidence-registry.js',
        'src/server/app.js',
        'apps/control-center/public/app.js',
        'docs/quality/evidence-registry.schema.json',
        'evidence/registry.json'
    ) | ForEach-Object {
        $file = Get-Item -LiteralPath (Join-Path $root $_) -Force -ErrorAction Stop
        if (-not $file.Exists -or $file.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) { throw "Evidence source is not a regular file: $_" }
        [ordered]@{ path = $_; sha256 = Get-Sha256Hex $file.FullName }
    }
    $branch = (& git branch --show-current 2>$null | Out-String).Trim()
    $head = $null
    try {
        $headValue = (& git rev-parse --verify HEAD 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -eq 0 -and $headValue) { $head = $headValue }
    } catch { $head = $null }
    $record = [ordered]@{
        schemaVersion = 1
        kind = 'lab-evidence-registry-verification'
        generatedAt = [DateTime]::UtcNow.ToString('o')
        command = $command
        result = 'passed'
        exitCode = $exitCode
        nodeVersion = (& node --version | Out-String).Trim()
        branch = $branch
        head = $head
        sourceDigests = $sourceFiles
        output = $output
        limitations = @('This verifies the local evidence loader, source binding checks, API routes, and API overview integration; it does not independently certify the referenced game scenarios or provider identity.')
    }
    $json = $record | ConvertTo-Json -Depth 12
    $stream = [IO.File]::Open($evidencePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    $output | ForEach-Object { Write-Host $_ }
    Write-Host "PASS: evidence registry validated and integrated. Evidence: $relativeEvidence"
} finally {
    Pop-Location
}
