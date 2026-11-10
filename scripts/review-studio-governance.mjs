#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { STUDIO_OPERATION_CATALOG, STUDIO_RISK_CLASSES } from '../src/services/studio-governance.js';

const root = process.cwd();
const evidencePath = 'evidence/studio/lab-playtest-governance-20261110.json';
const registryPath = 'evidence/registry.json';
const registerPath = 'docs/quality/lab-capability-register.json';
const capabilityId = 'LAB-STUDIO-002';
const expectedSourceCommit = '2b6210c64120f94e87324b2bcd6d7f95d8d70a8c';
const expectedTreeSha256 = 'ab61cdb600033d5c9a1b2a4f038afe230718851ddd7338765d5fb207e1ccdb3f';
const expectedAuditSha256 = 'bd782e799b13cb1c3afef09cf74f4895ce76baa8d4c99df268be3f54a9d3ca87';
const expectedAuditBytes = 4403;
const expectedCriteria = [0, 1];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalEvidenceHash(filePath) {
  return sha256(Buffer.from(fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'), 'utf8'));
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', shell: false }).trim();
}

function add(checks, name, passed, detail) {
  checks.push({ name, status: passed ? 'passed' : 'failed', detail });
  return passed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(root, filePath), 'utf8'));
}

function operation(evidence, id) {
  return (evidence.operations ?? []).find((entry) => entry.operationId === id) ?? null;
}

function auditDecision(evidence, operationId, decision) {
  return (evidence.audit?.entries ?? []).some((entry) => entry.operationId === operationId && entry.decision === decision);
}

async function liveState() {
  try {
    const response = await fetch(`http://127.0.0.1:4177/api/studio/state?studio_id=${encodeURIComponent('d5f07df7-b8ce-4c9b-9e56-6891c6172a64')}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { status: 'unavailable', detail: `HTTP ${response.status}` };
    const body = await response.json();
    const text = (body?.result?.content ?? []).filter((item) => item?.type === 'text').map((item) => item.text).join('\n');
    const mode = /Current Studio Mode:\s*([A-Za-z]+)/i.exec(text)?.[1] ?? null;
    return { status: mode === 'Edit' ? 'passed' : 'observed', detail: mode ? `Current mode: ${mode}` : 'No mode text.' };
  } catch (error) {
    return { status: 'unavailable', detail: error.message };
  }
}

async function main() {
  const checks = [];
  const evidenceFile = path.join(root, evidencePath);
  const evidenceBytes = fs.readFileSync(evidenceFile);
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  const evidenceSha256 = canonicalEvidenceHash(evidenceFile);
  const registry = readJson(registryPath);
  const register = readJson(registerPath);
  const record = registry.records.find((entry) => entry.id === 'evidence.studio.lab-playtest-governance-20261110');
  const capability = register.capabilities.find((entry) => entry.id === capabilityId);

  add(checks, 'evidence_status', evidence.status === 'passed', `Evidence status: ${evidence.status}.`);
  add(checks, 'source_commit', evidence.sourceIdentity?.commit === expectedSourceCommit, `Source commit: ${evidence.sourceIdentity?.commit ?? 'missing'}.`);
  add(checks, 'source_tree', evidence.sourceIdentity?.treeSha256 === expectedTreeSha256 && evidence.sourceIdentity?.dirty === false, `Source tree: ${evidence.sourceIdentity?.treeSha256 ?? 'missing'}, dirty=${evidence.sourceIdentity?.dirty ?? 'missing'}.`);
  add(checks, 'commit_exists', (() => { try { git(['cat-file', '-e', `${expectedSourceCommit}^{commit}`]); return true; } catch { return false; } })(), 'The reviewed source commit is present in this repository.');
  add(checks, 'evidence_registry_reference', record?.reference === evidencePath && record?.referenceSha256 === evidenceSha256, `Registry reference hash: ${evidenceSha256}.`);
  add(checks, 'capability_reference', Array.isArray(capability?.evidenceRefs) && capability.evidenceRefs.includes(evidencePath), `Capability refs: ${JSON.stringify(capability?.evidenceRefs ?? [])}.`);
  add(checks, 'coverage', JSON.stringify(evidence.capabilityCoverage?.find((entry) => entry.capabilityId === capabilityId)?.acceptanceCriteriaIndexes) === JSON.stringify(expectedCriteria), `Covered criteria: ${JSON.stringify(evidence.capabilityCoverage?.find((entry) => entry.capabilityId === capabilityId)?.acceptanceCriteriaIndexes)}.`);

  const riskIds = STUDIO_RISK_CLASSES.map((entry) => entry.id);
  const expectedRisks = ['inspection', 'reversible_mutation', 'destructive_mutation', 'upload', 'publishing'];
  add(checks, 'five_risk_classes', JSON.stringify(riskIds) === JSON.stringify(expectedRisks), `Risk classes: ${riskIds.join(', ')}.`);
  add(checks, 'closed_catalog_classes', expectedRisks.every((id) => STUDIO_OPERATION_CATALOG.some((entry) => entry.riskClass === id)), 'Every risk class has at least one catalog operation.');
  add(checks, 'playtest_catalog', STUDIO_OPERATION_CATALOG.some((entry) => entry.id === 'studio.start_playtest' && entry.tool === 'start_stop_play') && STUDIO_OPERATION_CATALOG.some((entry) => entry.id === 'studio.stop_playtest' && entry.tool === 'start_stop_play'), 'Start and stop are cataloged as start_stop_play.');
  add(checks, 'mutations_not_dashboard_exposed', STUDIO_OPERATION_CATALOG.filter((entry) => entry.riskClass !== 'inspection').every((entry) => entry.labExposed === false), 'No mutation operation is dashboard-exposed.');

  const start = operation(evidence, 'studio.start_playtest');
  const stop = operation(evidence, 'studio.stop_playtest');
  add(checks, 'start_operation', Boolean(start) && start.stateAfter === 'Play' && start.toolResult === 'Game Started' && start.riskClass === 'reversible_mutation', `Start: ${start?.toolResult ?? 'missing'}; state ${start?.stateAfter ?? 'missing'}.`);
  add(checks, 'stop_operation', Boolean(stop) && stop.stateAfter === 'Edit' && stop.toolResult === 'Game Stopped' && stop.riskClass === 'reversible_mutation', `Stop: ${stop?.toolResult ?? 'missing'}; state ${stop?.stateAfter ?? 'missing'}.`);
  add(checks, 'distinct_approvals', Boolean(start?.approvalId && stop?.approvalId && start.approvalId !== stop.approvalId), `Approval IDs: ${start?.approvalId ?? 'missing'}, ${stop?.approvalId ?? 'missing'}.`);
  add(checks, 'distinct_parameter_digests', Boolean(start?.parameterDigest && stop?.parameterDigest && start.parameterDigest !== stop.parameterDigest), 'Start and stop use distinct parameter digests.');
  add(checks, 'audit_presence', ['approval_issued', 'started', 'succeeded'].every((decision) => auditDecision(evidence, 'studio.start_playtest', decision) && auditDecision(evidence, 'studio.stop_playtest', decision)), 'Both operations have issued, started, and succeeded audit decisions.');
  add(checks, 'audit_no_token', !JSON.stringify(evidence.audit?.entries ?? []).includes('tokenSha256') && !JSON.stringify(evidence.audit?.entries ?? []).includes('"token"'), 'The captured audit entries contain no approval token or token hash.');
  add(checks, 'scope_bound', start?.approvalId && stop?.approvalId
    && evidence.operations.every((entry) => entry.parameterDigest && entry.executionId)
    && evidence.audit.entries.every((entry) => !entry.scope || (entry.scope.studioId === evidence.studio.instanceId && entry.scope.placeName === evidence.studio.placeName && entry.scope.sourceRevision === expectedSourceCommit)), 'Approval and audit scopes bind the reviewed Studio instance, place, and source revision.');

  let auditBytes = null;
  let auditDigest = null;
  try {
    auditBytes = fs.readFileSync(path.join(root, '.lab-runtime', 'studio-governance', 'audit.jsonl'));
    auditDigest = sha256(auditBytes);
  } catch { /* Check below records the failure. */ }
  add(checks, 'audit_source_digest', auditDigest === expectedAuditSha256 && auditBytes?.length === expectedAuditBytes, `Audit bytes=${auditBytes?.length ?? 'missing'}, sha256=${auditDigest ?? 'missing'}.`);

  const testRun = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm test'], { cwd: root, encoding: 'utf8', timeout: 120_000, shell: false })
    : spawnSync('npm', ['test'], { cwd: root, encoding: 'utf8', timeout: 120_000, shell: false });
  const passMatch = /ℹ pass (\d+)/.exec(testRun.stdout ?? '');
  const failMatch = /ℹ fail (\d+)/.exec(testRun.stdout ?? '');
  const testPass = !testRun.error && testRun.status === 0 && Number(failMatch?.[1] ?? -1) === 0 && Number(passMatch?.[1] ?? 0) >= 118;
  const failureTail = testPass ? '' : (testRun.stdout ?? '').split('\n').filter((line) => /✖|not ok|AssertionError|Error:|tests |pass |fail /.test(line)).slice(-12).join(' | ').slice(-1200);
  add(checks, 'full_node_suite', testPass, `npm test exit=${testRun.status ?? 'missing'}${testRun.error ? `, error=${testRun.error.message}` : ''}, pass=${passMatch?.[1] ?? 'missing'}, fail=${failMatch?.[1] ?? 'missing'}${failureTail ? `; ${failureTail}` : ''}.`);

  const state = await liveState();
  add(checks, 'live_state_observation', state.status === 'passed', state.detail);

  const evidenceCommit = git(['log', '-1', '--format=%H', '--', evidencePath]);
  const reviewerIdentity = `process:lab-review:${process.pid}:${randomUUID()}`;
  const passed = checks.every((entry) => entry.status === 'passed');
  const review = {
    schemaVersion: 1,
    type: 'independent-review',
    project: 'lab',
    status: passed ? 'passed' : 'failed',
    reviewerIdentity,
    authorIdentity: 'implementation-agent:buffy',
    separation: 'distinct-process',
    capacity: 'automated distinct process; not a human',
    reviewedCapability: capabilityId,
    reviewedSourceCommit: evidence.sourceIdentity.commit,
    reviewedSourceTreeSha256: evidence.sourceIdentity.treeSha256,
    reviewedEvidence: evidencePath,
    reviewedEvidenceSha256: evidenceSha256,
    reviewedEvidenceCommit: evidenceCommit,
    capabilityCoverage: [{ capabilityId, acceptanceCriteriaIndexes: expectedCriteria }],
    criteria: [
      { index: 0, result: checks.filter((entry) => ['five_risk_classes', 'closed_catalog_classes', 'playtest_catalog', 'mutations_not_dashboard_exposed'].includes(entry.name)).every((entry) => entry.status === 'passed') ? 'passed' : 'failed', basis: 'Five ordered classes and a closed catalog with no dashboard-exposed mutation.' },
      { index: 1, result: checks.filter((entry) => ['start_operation', 'stop_operation', 'distinct_approvals', 'audit_presence', 'audit_no_token', 'scope_bound', 'audit_source_digest'].includes(entry.name)).every((entry) => entry.status === 'passed') ? 'passed' : 'failed', basis: 'A live reversible operation used a single-use, scope-bound approval and a token-free, source-bound audit.' },
    ],
    checks,
    commands: [
      'node scripts/review-studio-governance.mjs',
      'npm test',
      'git cat-file -e 2b6210c64120f94e87324b2bcd6d7f95d8d70a8c^{commit}',
      'GET /api/studio/state?studio_id=d5f07df7-b8ce-4c9b-9e56-6891c6172a64 (read-only)',
    ],
    limitations: [
      'This is an automated distinct process, not a human reviewer; it does not add human judgment or identity attestation.',
      'The review did not re-run the live Studio start/stop sequence; it verified the source-bound record and the current read-only Studio state.',
      'The live evidence covers reversible playtest only; Rojo sync, save, destructive mutation, upload, publishing, and multiplayer/device behavior are out of scope.',
      'The approval issuer label is supplied by the local mission and is not cryptographically authenticated.',
    ],
    decidedAt: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: { code: error?.code ?? 'STUDIO_REVIEW_FAILED', message: error?.message ?? 'Independent review failed.' } })}\n`);
  process.exitCode = 1;
});
