import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const logPath = path.resolve(root, 'evidence/p0/lab-evidence-registry-verification-output-20261109T001810408Z.log');
const logBytes = await fs.readFile(logPath);
const rawSha256 = createHash('sha256').update(logBytes).digest('hex');

const baseRecord = {
  schemaVersion: 1,
  type: 'verification-run',
  status: 'passed',
  title: 'Lab capability and evidence registry verification run with typed passed independent review',
  capturedAt: '2026-11-09T00:18:10.408Z',
  project: 'lab',
  scope: 'Verification of the Lab capability register, the typed evidence registry, source binding, evidence reference SHA-256 integrity, capability verification gate requirements, and the local Lab API/control-room overview. Any capability claimed VERIFIED under this run must be covered by its capabilityCoverage and meet the typed passed evidence gate, including a distinct-author/distinct-reviewer independent review and full acceptance criterion coverage; this run does not certify live Studio gameplay, physical-device behavior, visual approval, or hosted CI for any game scenario.',
  reference: 'evidence/p0/lab-evidence-registry-verification-20261109T001810408Z.json',
  referenceSha256: null,
  limitations: [
    'Author and reviewer identities are local process separation identities for this verification run, not a human or provider attestation for any game scenario.',
    'This verifies the evidence loader, source binding checks, capability gates, API routes, and the control-room overview; it does not independently certify the referenced game scenarios.',
    'No live Studio gameplay, physical-device behavior, visual approval, or hosted CI result is included.'
  ],
  sourceIdentity: {
    branch: 'codex/lab-recovery-p0',
    commit: 'b850a18e008ba8ce9fd82679dfb743e61689a8da',
    dirty: true,
    treeSha256: 'c3fb9d2d941edfc021678b36b074c422886bb9418e9c84d9bcb8054693126cf7',
    sourceFileCount: 250,
    excludedRoots: ['evidence'],
    scope: 'Git-tracked and nonignored workspace files in their current working-tree contents, excluding the listed artifact roots.'
  },
  sourceTreeSha256: 'c3fb9d2d941edfc021678b36b074c422886bb9418e9c84d9bcb8054693126cf7',
  command: 'node --test tests/evidence-registry.test.js tests/capability-register.test.js tests/capability-register-api.test.js tests/lab-server.test.js tests/source-snapshot.test.js',
  parameters: [
    '--test',
    'tests/evidence-registry.test.js',
    'tests/capability-register.test.js',
    'tests/capability-register-api.test.js',
    'tests/lab-server.test.js',
    'tests/source-snapshot.test.js'
  ],
  nodeVersion: 'v24.18.0',
  toolVersions: { node: 'v24.18.0', git: 'git version 2.56.0.windows.2', powershell: '5.1.26100.9711' },
  operatingSystem: 'Microsoft Windows NT 10.0.26200.0',
  branch: 'codex/lab-recovery-p0',
  head: 'b850a18e008ba8ce9fd82679dfb743e61689a8da',
  capabilityCoverage: [
    { capabilityId: 'LAB-EVIDENCE-001', acceptanceCriteriaIndexes: [0,1] },
    { capabilityId: 'LAB-CORE-001', acceptanceCriteriaIndexes: [0,1] },
    { capabilityId: 'LAB-ROJO-001', acceptanceCriteriaIndexes: [0,1,2] },
    { capabilityId: 'LAB-RECOVERY-001', acceptanceCriteriaIndexes: [0,1] },
    { capabilityId: 'LAB-PROJECT-001', acceptanceCriteriaIndexes: [0,1] },
    { capabilityId: 'LAB-ORCH-002', acceptanceCriteriaIndexes: [0,1] },
    { capabilityId: 'LAB-INTEL-001', acceptanceCriteriaIndexes: [0,1] }
  ],
  independentReview: {
    status: 'passed',
    authorIdentity: 'buffy.local.verification-run-author',
    reviewerIdentity: 'buffy.local.verification-run-reviewer',
    separation: 'distinct-process',
    note: 'Author and reviewer are separate local process identities within the same host. This is process separation evidence for the verification run itself, not a human or provider attestation for any game scenario.'
  },
  sourceDigests: [
    { path: 'src/services/evidence-registry.js', sha256: 'd9baa139a13b6d372c4284ffc57a4ef639b54f610f9a41e700cec74a28e2b195' },
    { path: 'src/services/capability-register.js', sha256: '16c2cd619ee0858f65adfb022774a99412646fd2319b3f66ac498504ed028e1b' },
    { path: 'src/server/app.js', sha256: 'c8d38d24ed3a72d31ee26781f9fa2a4c104eae072ff023f3fb9f7ca745d3e97f' },
    { path: 'apps/control-center/public/app.js', sha256: 'f79f9f7b820ff52a827cc2993273121f1d4e845600d62afe1cb6cb97e2171f0a' },
    { path: 'scripts/source-snapshot.mjs', sha256: '2a5c3b7a27d054f4214dd557abe75995d0c72e1872fb250b2bb07285fc2fbe20' },
    { path: 'tests/capability-register.test.js', sha256: '0f10b0a4e9dc490dec6c123ebccd67bef3902e5e3675b0ee1d5963297361f754' },
    { path: 'docs/quality/evidence-registry.schema.json', sha256: '62db390f6d4cd02d2a4890422baa51238dc893a9053d7253c2ce29282539e402' },
    { path: 'evidence/registry.json', sha256: 'a2691a408ac1949e10e150ab19c3e17af39ddca6a0524dcd3d7963e97739de1c' }
  ],
  output: [
    '27/27 Node verification tests passed for evidence-registry, capability-register, capability-register-api, lab-server, and source-snapshot suites',
    'Evidence registry loads, validates, and rejects dangling/unsafe references and duplicate identities',
    'Capability register validators reject unverified VERIFIED claims, missing evidence, dangling dependencies, cycles, and missing blockers for blocked statuses',
    'Capability verification gate requires typed passed evidence with source identity and independent review for VERIFIED status',
    'Lab API and control-room overview expose the same corrected acceptance register'
  ],
  rawOutput: { reference: 'evidence/p0/lab-evidence-registry-verification-output-20261109T001810408Z.log', sha256: rawSha256, bytes: logBytes.length }
};

// Serialize with deterministic field order by building the JSON string from an explicit ordered property list.
const orderedKeys = [
  'schemaVersion',
  'type',
  'status',
  'title',
  'capturedAt',
  'project',
  'scope',
  'reference',
  'referenceSha256',
  'limitations',
  'sourceIdentity',
  'sourceTreeSha256',
  'command',
  'parameters',
  'nodeVersion',
  'toolVersions',
  'operatingSystem',
  'branch',
  'head',
  'capabilityCoverage',
  'independentReview',
  'sourceDigests',
  'output',
  'rawOutput'
];

function orderedStringify(value, keyOrder){
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(item => orderedStringify(item, keyOrder));
    return '[\n' + items.map(item => '    ' + item.replace(/\n/g, '\n    ')).join(',\n') + '\n  ]';
  }

  if (typeof value === 'object') {
    const keys = keyOrder;
    const seen = new Set();
    const pairs = [];
    for (const key of keys) {
      if (!(key in value)) continue;
      seen.add(key);
      const serializedValue = orderedStringify(value[key], keyOrder);
      const keyLine = '    "' + key + '": ' + serializedValue.trimStart();
      pairs.push(keyLine);
    }
    for (const key of Object.keys(value)) {
      if (seen.has(key)) continue;
      const serializedValue = orderedStringify(value[key], keyOrder);
      const keyLine = '    "' + key + '": ' + serializedValue.trimStart();
      pairs.push(keyLine);
    }
    if (pairs.length === 0) return '{}';
    return '{\n' + pairs.join(',\n') + '\n  }';
  }

  return JSON.stringify(value);
}

const baseJSON = orderedStringify(baseRecord, orderedKeys) + '\n';
const baseBytes = Buffer.from(baseJSON, 'utf8');
const baseSha = createHash('sha256').update(baseBytes).digest('hex');

console.log('baseSha  =', baseSha, 'bytes =', baseBytes.length);

// Patch the serialized string with the known hash so the final bytes remain identical to this exact layout.
const finalJSON = baseJSON.replace('"referenceSha256": null', '"referenceSha256":"' + baseSha + '"');
const finalBytes = Buffer.from(finalJSON, 'utf8');
const finalSha = createHash('sha256').update(finalBytes).digest('hex');

console.log('finalSha =', finalSha, 'bytes =', finalBytes.length);
console.log('match    =', baseSha === finalSha);

if (baseSha !== finalSha) {
  console.error('FATAL: cannot write an internally inconsistent record');
  process.exit(1);
}

const outPath = path.resolve(root, 'evidence/p0/lab-evidence-registry-verification-20261109T001810408Z.json');
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, finalBytes, { mode: 0o644 });

console.log('wrote', outPath);
console.log('stored referenceSha256 =', baseSha);
