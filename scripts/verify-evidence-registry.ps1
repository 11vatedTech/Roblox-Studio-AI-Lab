[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex([string]$FilePath) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($FilePath)
    try { [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Get-Sha256Text([string]$Value) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Value)
        [System.BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    } finally { $algorithm.Dispose() }
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
    $testArguments = @(
        '--test',
        'tests/evidence-registry.test.js',
        'tests/capability-register.test.js',
        'tests/capability-register-api.test.js',
        'tests/lab-server.test.js',
        'tests/source-snapshot.test.js'
    )
    $command = 'node ' + ($testArguments -join ' ')
    $output = @(& node @testArguments 2>&1 | ForEach-Object { $_.ToString() })
    $testExitCode = $LASTEXITCODE

    $snapshotOutput = @(& node (Join-Path $root 'scripts\source-snapshot.mjs') $root 2>&1 | ForEach-Object { $_.ToString() })
    $snapshotExitCode = $LASTEXITCODE
    if ($snapshotExitCode -ne 0) { throw "Source snapshot failed with exit code ${snapshotExitCode}: $($snapshotOutput -join ' ')" }
    $snapshotJson = $snapshotOutput -join [Environment]::NewLine
    $sourceIdentity = $snapshotJson | ConvertFrom-Json

    $sourceFiles = @(
        'src/services/evidence-registry.js',
        'src/services/capability-register.js',
        'src/server/app.js',
        'apps/control-center/public/app.js',
        'scripts/source-snapshot.mjs',
        'tests/capability-register.test.js',
        'docs/quality/evidence-registry.schema.json',
        'evidence/registry.json'
    ) | ForEach-Object {
        $file = Get-Item -LiteralPath (Join-Path $root $_) -Force -ErrorAction Stop
        if (-not $file.Exists -or $file.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) { throw "Evidence source is not a regular file: $_" }
        [ordered]@{ path = $_; sha256 = Get-Sha256Hex $file.FullName }
    }
    $outputText = if ($output.Count -gt 0) { ($output -join [Environment]::NewLine) + [Environment]::NewLine } else { '' }
    $result = if ($testExitCode -eq 0) { 'passed' } else { 'failed' }
    $record = [ordered]@{
        schemaVersion = 1
        kind = 'lab-evidence-registry-verification'
        project = 'lab'
        generatedAt = [DateTime]::UtcNow.ToString('o')
        command = $command
        parameters = $testArguments
        result = $result
        exitCode = $testExitCode
        nodeVersion = (& node --version | Out-String).Trim()
        toolVersions = [ordered]@{
            node = (& node --version | Out-String).Trim()
            git = (& git --version | Out-String).Trim()
            powershell = $PSVersionTable.PSVersion.ToString()
        }
        operatingSystem = [Environment]::OSVersion.VersionString
        branch = $sourceIdentity.branch
        head = $sourceIdentity.commit
        sourceIdentity = $sourceIdentity
        sourceTreeSha256 = $sourceIdentity.treeSha256
        sourceDigests = $sourceFiles
        rawOutputSha256 = Get-Sha256Text $outputText
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
    if ($testExitCode -ne 0) { throw "Evidence registry verification failed with exit code $testExitCode. Failure evidence: $relativeEvidence" }
    Write-Host "PASS: evidence registry validated and integrated. Evidence: $relativeEvidence"
} finally {
    Pop-Location
}
