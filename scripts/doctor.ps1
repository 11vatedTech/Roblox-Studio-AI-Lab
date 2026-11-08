[CmdletBinding()]
param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'evidence' }
if (-not [IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory = Join-Path $root $OutputDirectory }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function Find-Tool([string]$Name, [string[]]$Arguments = @('--version')) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        $path = $command.Source
        try {
            $version = (& $path @Arguments 2>&1 | Select-Object -First 1).ToString().Trim()
            return [pscustomobject]@{ Available = $true; Path = $path; Version = $version }
        } catch {
            return [pscustomobject]@{ Available = $true; Path = $path; Version = 'version probe failed' }
        }
    }
    return [pscustomobject]@{ Available = $false; Path = $null; Version = $null }
}

$commandNames = @('git', 'node', 'npm', 'python', 'codex', 'rojo', 'luau', 'luau-analyze', 'luau-compile', 'stylua', 'selene', 'wally', 'blender', 'ollama', 'nvidia-smi')
$tools = [ordered]@{}
foreach ($name in $commandNames) { $tools[$name] = Find-Tool $name }

$localToolPaths = @{
    rojo = Join-Path $root '.tools\rojo-7.7.1\rojo.exe'
    luau = Join-Path $root '.tools\luau-0.745\luau.exe'
    'luau-analyze' = Join-Path $root '.tools\luau-0.745\luau-analyze.exe'
    'luau-compile' = Join-Path $root '.tools\luau-0.745\luau-compile.exe'
}
foreach ($name in $localToolPaths.Keys) {
    $localPath = $localToolPaths[$name]
    if ((Test-Path -LiteralPath $localPath) -and -not $tools[$name].Available) {
        $versionLabel = if ($name -like 'luau*') { 'Luau 0.745 (pinned archive)' } else { (& $localPath --version).Trim() }
        $tools[$name] = [pscustomobject]@{ Available = $true; Path = $localPath; Version = $versionLabel }
    }
}

$blenderRoots = @(
    (Join-Path $env:ProgramFiles 'Blender Foundation'),
    (Join-Path ${env:ProgramFiles(x86)} 'Blender Foundation'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Blender Foundation')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if (-not $tools.blender.Available) {
    foreach ($blenderRoot in $blenderRoots) {
        $candidate = Get-ChildItem -LiteralPath $blenderRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'blender.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($candidate) {
            $tools.blender = [pscustomobject]@{ Available = $true; Path = $candidate; Version = (& $candidate --version 2>&1 | Select-Object -First 1).ToString().Trim() }
            break
        }
    }
}

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$computer = Get-CimInstance Win32_ComputerSystem
$workspaceDrive = [IO.Path]::GetPathRoot($root).TrimEnd('\')
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$workspaceDrive'"
$gpuMemoryByName = @{}
if ($tools.'nvidia-smi'.Available) {
    try {
        $gpuRows = @(& $tools.'nvidia-smi'.Path --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits 2>$null)
        if ($LASTEXITCODE -eq 0) {
            foreach ($row in $gpuRows) {
                $parts = $row -split ',\s*'
                if ($parts.Count -ge 3 -and $parts[1] -match '^\d+$' -and $parts[2] -match '^\d+$') {
                    $gpuMemoryByName[$parts[0].Trim()] = [pscustomobject]@{ TotalMemoryMiB = [int]$parts[1]; FreeMemoryMiB = [int]$parts[2] }
                }
            }
        }
    } catch { }
}
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object {
    $memory = $gpuMemoryByName[$_.Name]
    [pscustomobject]@{ Name = $_.Name; DriverVersion = $_.DriverVersion; TotalMemoryMiB = $memory.TotalMemoryMiB; FreeMemoryMiB = $memory.FreeMemoryMiB }
})
$studioExe = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Roblox\Versions') -Filter 'RobloxStudioBeta.exe' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$studioVersion = if ($studioExe) { [Diagnostics.FileVersionInfo]::GetVersionInfo($studioExe.FullName).FileVersion } else { $null }
$mcpLauncher = Join-Path $env:LOCALAPPDATA 'Roblox\mcp.bat'
$studioRunning = [bool](Get-Process -Name 'RobloxStudioBeta' -ErrorAction SilentlyContinue | Select-Object -First 1)
$codexInventory = [ordered]@{ available = [bool]$tools.codex.Available; mcpServers = @(); plugins = @(); status = 'not_probed' }
if ($tools.codex.Available) {
    try {
        $mcpOutput = (& $tools.codex.Path mcp list --json 2>$null | Out-String)
        if ($LASTEXITCODE -eq 0) {
            $mcpEntries = @($mcpOutput | ConvertFrom-Json)
            $codexInventory.mcpServers = @($mcpEntries | ForEach-Object { [pscustomobject]@{ name = $_.name; enabled = $_.enabled; transport = $_.transport.type } })
            $pluginOutput = (& $tools.codex.Path plugin list --json 2>$null | Out-String)
            if ($LASTEXITCODE -eq 0) {
                $pluginData = $pluginOutput | ConvertFrom-Json
                $codexInventory.plugins = @($pluginData.installed | ForEach-Object { [pscustomobject]@{ id = $_.pluginId; version = $_.version; enabled = $_.enabled } })
            }
            $codexInventory.status = 'probed'
        } else { $codexInventory.status = 'query_failed' }
    } catch { $codexInventory.status = 'query_failed' }
}
$ollamaModels = @()
if ($tools.ollama.Available) {
    try {
        $ollamaOutput = @(& $tools.ollama.Path list 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $ollamaModels = @($ollamaOutput | Select-Object -Skip 1 | ForEach-Object {
                if ($_ -match '^\s*(?<name>\S+)\s+(?<id>\S+)\s+(?<size>\S+(?:\s+\S+)?)\s+(?<modified>.+?)\s*$') {
                    [pscustomobject]@{ name = $Matches.name; size = $Matches.size }
                }
            } | Where-Object { $_ })
        }
    } catch { $ollamaModels = @() }
}
$gitRepo = $false
$gitRoot = $null
if ($tools.git.Available) {
    $gitRootText = (& $tools.git.Path -C $root rev-parse --show-toplevel 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -eq 0 -and $gitRootText) { $gitRoot = $gitRootText.Trim(); $gitRepo = [IO.Path]::GetFullPath($gitRoot).Equals($root, [StringComparison]::OrdinalIgnoreCase) }
}

$report = [pscustomobject]@{
    schemaVersion = 1
    capturedAt = [DateTime]::UtcNow.ToString('o')
    machine = [pscustomobject]@{
        os = $os.Caption
        version = $os.Version
        build = $os.BuildNumber
        cpu = $cpu.Name
        ramGiB = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
        gpus = $gpus
        workspaceDrive = $workspaceDrive
        freeDiskGiB = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }
    }
    tools = $tools
    git = [pscustomobject]@{ initializedInWorkspace = $gitRepo; root = $gitRoot }
    robloxStudio = [pscustomobject]@{
        installed = [bool]$studioExe
        executable = if ($studioExe) { $studioExe.FullName } else { $null }
        version = $studioVersion
        processRunning = $studioRunning
        mcpLauncherInstalled = Test-Path -LiteralPath $mcpLauncher
        mcpLauncher = if (Test-Path -LiteralPath $mcpLauncher) { $mcpLauncher } else { $null }
        liveMcpConnection = 'not tested by this diagnostic; use the Lab bridge or ChatGPT official Studio tools'
    }
    codex = [pscustomobject]$codexInventory
    localAi = [pscustomobject]@{
        ollamaAvailable = [bool]$tools.ollama.Available
        models = $ollamaModels
        inferenceTested = $false
        note = 'Model inventory came from the local Ollama CLI. No model inference or quality assessment was run.'
    }
    safety = [pscustomobject]@{
        secretsCollected = $false
        credentialsWritten = $false
        accountSettingsChanged = $false
        networkServicesConfigured = $false
    }
}

$json = $report | ConvertTo-Json -Depth 8
$jsonPath = Join-Path $OutputDirectory 'environment-report.json'
$markdownPath = Join-Path $OutputDirectory 'environment-report.md'
[IO.File]::WriteAllText($jsonPath, $json, [Text.UTF8Encoding]::new($false))
$toolLines = foreach ($name in $tools.Keys) {
    $item = $tools[$name]
    $versionText = if ($item.Version) { $item.Version } else { 'not found' }
    $pathText = if ($item.Path) { $item.Path } else { '—' }
    "| $name | $($item.Available) | $versionText | $pathText |"
}
$gpuLines = foreach ($gpu in $gpus) { "- $($gpu.Name) (driver $($gpu.DriverVersion))" }
$gpuMemoryLines = foreach ($gpu in $gpus | Where-Object { $_.TotalMemoryMiB }) { "- $($gpu.Name): $($gpu.TotalMemoryMiB) MiB total, $($gpu.FreeMemoryMiB) MiB free at capture" }
$codexServerLines = foreach ($server in $codexInventory.mcpServers) { "- $($server.name): enabled $($server.enabled), $($server.transport)" }
$codexPluginLines = foreach ($plugin in $codexInventory.plugins) { "- $($plugin.id) $($plugin.version): enabled $($plugin.enabled)" }
$modelLines = foreach ($model in $ollamaModels) { "- $($model.name) ($($model.size))" }
$markdown = @"
# Environment report

- Captured: $($report.capturedAt)
- Workspace: ``$root``
- OS: $($report.machine.os) $($report.machine.version) (build $($report.machine.build))
- CPU: $($report.machine.cpu)
- Memory: $($report.machine.ramGiB) GiB
- Free workspace drive: $($report.machine.freeDiskGiB) GiB on $workspaceDrive
- Roblox Studio: $(if ($report.robloxStudio.installed) { "$studioVersion at ``$($studioExe.FullName)``" } else { 'not found in checked install folders' })
- Studio process running at capture: $studioRunning
- Official Studio MCP launcher: $($report.robloxStudio.mcpLauncherInstalled)
- Live MCP connection: not tested by this diagnostic
- Git repository initialized at workspace root: $gitRepo
- Local model inference: not tested

## Graphics

$($gpuLines -join "`n")

## NVIDIA memory

$(if ($gpuMemoryLines) { $gpuMemoryLines -join "`n" } else { 'NVIDIA VRAM was unavailable from the installed driver tools.' })

## Developer tools

| Tool | Available | Version | Path |
|---|---:|---|---|
$($toolLines -join "`n")

## Codex integration inventory

- Codex CLI probe: $($codexInventory.status)
$(if ($codexServerLines) { $codexServerLines -join "`n" } else { '- No MCP servers reported' })
$(if ($codexPluginLines) { $codexPluginLines -join "`n" } else { '- No installed plugins reported' })

## Local model inventory

$(if ($modelLines) { $modelLines -join "`n" } else { 'No local Ollama models were returned by the CLI.' })

## Data handling

This report contains machine inventory and tool paths only. It does not collect credentials, environment-variable values, Roblox account data, or user files.
"@
[IO.File]::WriteAllText($markdownPath, $markdown, [Text.UTF8Encoding]::new($false))

[pscustomobject]@{ JsonReport = $jsonPath; MarkdownReport = $markdownPath; CapturedAt = $report.capturedAt; StudioInstalled = $report.robloxStudio.installed; McpLauncherInstalled = $report.robloxStudio.mcpLauncherInstalled; GitRepository = $gitRepo } | Format-List
