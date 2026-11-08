import fs from 'node:fs';
import path from 'node:path';

const COMMANDS = ['git', 'node', 'npm', 'python', 'codex', 'rojo', 'luau', 'luau-analyze', 'luau-compile', 'stylua', 'selene', 'wally', 'blender', 'ollama', 'nvidia-smi'];

export function findExecutable(name, { pathValue = process.env.PATH ?? '', pathExt = process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM', platform = process.platform } = {}) {
  const extensions = platform === 'win32' ? pathExt.split(';').filter(Boolean) : [''];
  const requestedHasExtension = path.extname(name) !== '';
  const candidates = requestedHasExtension ? [name] : extensions.map((extension) => `${name}${extension}`);
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const candidate of candidates) {
      const fullPath = path.join(directory, candidate);
      try {
        if (fs.statSync(fullPath).isFile()) return fullPath;
      } catch {
        // A missing PATH entry is normal; keep probing the remaining entries.
      }
    }
  }
  return null;
}

function latestStudioExecutable(localAppData) {
  const versionsRoot = path.join(localAppData, 'Roblox', 'Versions');
  let versions;
  try {
    versions = fs.readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsRoot, entry.name, 'RobloxStudioBeta.exe'))
      .filter((filePath) => {
        try { return fs.statSync(filePath).isFile(); } catch { return false; }
      })
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {
    return null;
  }
  return versions[0] ?? null;
}

export function collectEnvironmentSnapshot({ env = process.env, platform = process.platform, arch = process.arch, cwd = process.cwd() } = {}) {
  const executableSuffix = platform === 'win32' ? '.exe' : '';
  const localTools = [
    path.join(cwd, '.tools', 'rojo-7.7.1'),
    path.join(cwd, '.tools', 'luau-0.745'),
  ];
  const pathValue = [env.PATH ?? '', ...localTools].join(path.delimiter);
  const tools = Object.fromEntries(COMMANDS.map((name) => [name, findExecutable(name, { pathValue, pathExt: env.PATHEXT, platform })]));
  const localRojo = path.join(localTools[0], `rojo${executableSuffix}`);
  const localLuauCompiler = path.join(localTools[1], `luau-compile${executableSuffix}`);
  if (!tools.rojo && fs.existsSync(localRojo)) tools.rojo = localRojo;
  if (!tools['luau-compile'] && fs.existsSync(localLuauCompiler)) tools['luau-compile'] = localLuauCompiler;
  if (!tools.blender) {
    const blenderRoots = [
      env.ProgramFiles && path.join(env.ProgramFiles, 'Blender Foundation'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Blender Foundation'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Blender Foundation'),
    ].filter(Boolean);
    for (const blenderRoot of blenderRoots) {
      try {
        const found = fs.readdirSync(blenderRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(blenderRoot, entry.name, 'blender.exe'))
          .find((candidate) => { try { return fs.statSync(candidate).isFile(); } catch { return false; } });
        if (found) { tools.blender = found; break; }
      } catch { /* Standard install location is absent. */ }
    }
  }
  const studioExe = env.LOCALAPPDATA ? latestStudioExecutable(env.LOCALAPPDATA) : null;
  const launcher = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Roblox', 'mcp.bat') : null;
  let machineReport = null;
  const reportPath = path.join(cwd, 'evidence', 'environment-report.json');
  try {
    const stat = fs.lstatSync(reportPath);
    if (stat.isFile() && !stat.isSymbolicLink()) machineReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch { /* The full diagnostic report has not been generated yet. */ }
  return {
    capturedAt: new Date().toISOString(),
    platform,
    arch,
    nodeVersion: process.versions.node,
    workspace: path.resolve(cwd),
    hardware: machineReport?.machine ?? null,
    machineReportCapturedAt: machineReport?.capturedAt ?? null,
    codex: machineReport?.codex ?? null,
    localAi: machineReport?.localAi ?? null,
    tools: Object.fromEntries(Object.entries(tools).map(([name, executable]) => [name, { available: Boolean(executable), executable }])),
    robloxStudio: {
      installed: Boolean(studioExe),
      executable: studioExe,
      mcpLauncherInstalled: Boolean(launcher && fs.existsSync(launcher)),
      mcpLauncher: launcher && fs.existsSync(launcher) ? launcher : null,
      liveConnection: 'unverified',
    },
  };
}
