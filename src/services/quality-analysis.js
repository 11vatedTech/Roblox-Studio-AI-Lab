import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_EXTENSIONS = new Set(['.lua', '.luau']);
const MAX_SOURCE_FILES = 1000;
const MAX_SOURCE_BYTES = 1024 * 1024;

async function collectScripts(root) {
  const scripts = [];
  async function visit(directory, depth) {
    if (depth > 12 || scripts.length >= MAX_SOURCE_FILES) return;
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (scripts.length >= MAX_SOURCE_FILES || entry.name === '.git' || entry.name === 'node_modules') continue;
      if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath, depth + 1);
      else if (entry.isFile() && SCRIPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stat = await fs.stat(fullPath);
        scripts.push({ fullPath, relativePath: path.relative(root, fullPath).replaceAll(path.sep, '/'), size: stat.size });
      }
    }
  }
  await visit(root, 0);
  return scripts;
}

function addFinding(findings, { file, line, rule, severity, title, detail }) {
  findings.push({ file, line, rule, severity, title, detail });
}

function scanSource(file, source, findings) {
  const lines = source.split(/\r?\n/);
  const serverRemotePattern = /(?:OnServerEvent|OnServerInvoke)\s*:\s*Connect\s*\(\s*function\b/g;
  for (const match of source.matchAll(serverRemotePattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    const handler = source.slice(match.index, match.index + 1200);
    const hasBoundaryCheck = /\b(?:typeof|IsA|IsDescendantOf|UserId|Magnitude|math\.clamp|cooldown|rateLimit|lastRequest|validate)\b/i.test(handler);
    if (!hasBoundaryCheck) {
      addFinding(findings, {
        file,
        line,
        rule: 'remote-handler-review',
        severity: 'review',
        title: 'Review server remote validation',
        detail: 'The handler has no common validation marker in its opening block. Confirm type, ownership, range, current state, permissions, and request-rate checks before trusting client input.',
      });
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/\bloadstring\s*\(/i.test(line)) {
      addFinding(findings, {
        file,
        line: index + 1,
        rule: 'dynamic-code-execution',
        severity: 'high',
        title: 'Dynamic Luau execution',
        detail: 'Review the source and remove dynamic execution unless a narrowly scoped, platform-supported need is documented.',
      });
    }
    if (/(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{16,}["']/i.test(line)) {
      addFinding(findings, {
        file,
        line: index + 1,
        rule: 'possible-hardcoded-secret',
        severity: 'high',
        title: 'Possible hardcoded credential',
        detail: 'A credential-like literal was detected. The matched value is intentionally omitted; rotate it if it was real and move secrets to an approved server-only secret store.',
      });
    }
    if (/HttpService\s*:\s*(?:GetAsync|PostAsync|RequestAsync)\s*\(/.test(line)) {
      addFinding(findings, {
        file,
        line: index + 1,
        rule: 'http-service-boundary',
        severity: 'review',
        title: 'External HTTP request',
        detail: 'Review the destination allowlist, response validation, timeout behavior, privacy impact, and failure handling.',
      });
    }
  }
}

export async function analyzeProject(projectRoot) {
  const rootStat = await fs.lstat(projectRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw Object.assign(new Error('Quality analysis requires a real project directory.'), { code: 'PROJECT_PATH_INVALID' });
  }
  const scripts = await collectScripts(projectRoot);
  const findings = [];
  const fileMetrics = [];
  let totalBytes = 0;

  for (const script of scripts) {
    if (script.size > MAX_SOURCE_BYTES) {
      addFinding(findings, {
        file: script.relativePath,
        line: null,
        rule: 'source-size-limit',
        severity: 'review',
        title: 'Source file exceeds the analysis limit',
        detail: `This file is ${script.size} bytes; the Lab skips source analysis above ${MAX_SOURCE_BYTES} bytes per file.`,
      });
      continue;
    }
    const source = await fs.readFile(script.fullPath, 'utf8');
    totalBytes += script.size;
    scanSource(script.relativePath, source, findings);
    fileMetrics.push({ path: script.relativePath, bytes: script.size, lines: source.length === 0 ? 0 : source.split(/\r?\n/).length });
  }

  const high = findings.filter((finding) => finding.severity === 'high').length;
  const review = findings.filter((finding) => finding.severity === 'review').length;
  return {
    capturedAt: new Date().toISOString(),
    analysisKind: 'static-source-heuristics',
    filesScanned: fileMetrics.length,
    findings,
    summary: {
      status: scripts.length === 0 ? 'unmeasured' : high > 0 ? 'action_required' : review > 0 ? 'review_required' : 'no_findings_review_runtime',
      high,
      review,
      totalBytes,
      totalLines: fileMetrics.reduce((sum, file) => sum + file.lines, 0),
    },
    fileMetrics,
    certified: false,
    limitation: 'Static heuristics identify review targets. They do not prove security, correctness, multiplayer behavior, or runtime performance.',
  };
}
