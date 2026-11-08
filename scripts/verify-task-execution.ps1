[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$rootPrefix = $root.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar
$evidenceDirectory = Join-Path $root 'evidence\p0'
$evidenceItem = Get-Item -LiteralPath $evidenceDirectory -Force -ErrorAction Stop
if (-not $evidenceItem.PSIsContainer -or $evidenceItem.LinkType -in @('SymbolicLink', 'Junction', 'HardLink')) {
    throw 'The task-execution evidence directory must be a real directory inside the Lab workspace.'
}

$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmssfff'Z'")
$relativeEvidence = "evidence/p0/lab-task-execution-$stamp.json"
$evidencePath = Join-Path $root ($relativeEvidence.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
$resolvedEvidence = [System.IO.Path]::GetFullPath($evidencePath)
if (-not $resolvedEvidence.StartsWith((Join-Path $evidenceDirectory ''), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The generated evidence path escaped evidence/p0.'
}

Push-Location $root
try {
    $previousRecordPath = $env:LAB_TASK_EXECUTION_EVIDENCE_PATH
    $env:LAB_TASK_EXECUTION_EVIDENCE_PATH = $relativeEvidence
    $command = 'node --test tests/lab-task-mcp.test.js tests/task-execution.test.js'
    $output = @(& node --test tests/lab-task-mcp.test.js tests/task-execution.test.js 2>&1 | ForEach-Object { $_.ToString() })
    $exitCode = $LASTEXITCODE
    $env:LAB_TASK_EXECUTION_EVIDENCE_PATH = $previousRecordPath

    if ($exitCode -ne 0) {
        if (Test-Path -LiteralPath $resolvedEvidence -PathType Leaf) { Remove-Item -LiteralPath $resolvedEvidence }
        $output | ForEach-Object { Write-Host $_ }
        throw "Task execution verification failed with exit code $exitCode."
    }
    if (-not (Test-Path -LiteralPath $resolvedEvidence -PathType Leaf)) {
        throw 'The integration test passed without producing its process-attributed evidence record.'
    }

    $record = Get-Content -LiteralPath $resolvedEvidence -Raw | ConvertFrom-Json
    $record | Add-Member -Force -NotePropertyName verificationRun -NotePropertyValue ([ordered]@{
        command = $command
        result = 'passed'
        exitCode = $exitCode
        nodeVersion = (& node --version | Out-String).Trim()
        completedAt = [DateTime]::UtcNow.ToString('o')
        output = $output
    })
    $json = $record | ConvertTo-Json -Depth 30
    [System.IO.File]::WriteAllText($resolvedEvidence, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $output | ForEach-Object { Write-Host $_ }
    Write-Host "PASS: task execution workflow verified. Evidence: $relativeEvidence"
} finally {
    Pop-Location
    if ($null -ne $previousRecordPath) { $env:LAB_TASK_EXECUTION_EVIDENCE_PATH = $previousRecordPath }
    else { Remove-Item Env:LAB_TASK_EXECUTION_EVIDENCE_PATH -ErrorAction SilentlyContinue }
}
