import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  cancelTaskExecution,
  claimTaskExecution,
  heartbeatTaskExecution,
  listTaskPlans,
  readTaskExecutionFile,
  recoverStaleTaskExecutions,
  reviewTaskExecution,
  submitTaskExecution,
  validateTaskExecution,
  writeTaskExecutionFile,
} from '../services/task-plan-store.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDir, '../..');
const rootDir = path.resolve(process.env.LAB_WORKSPACE_ROOT ?? defaultRoot);
const toolRootDir = path.resolve(process.env.LAB_TOOL_ROOT ?? rootDir);
const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const sessionId = randomUUID();
const claims = new Map();
const client = { name: 'unidentified-mcp-client', version: 'unknown' };
let initialized = false;

const taskRefProperties = {
  project: { type: 'string', minLength: 1, maxLength: 100 },
  planId: { type: 'string', pattern: '^task-plan\\.[a-z0-9]+(?:-[a-z0-9]+)*$' },
  taskId: { type: 'string', pattern: '^task\\.[a-z0-9]+(?:-[a-z0-9]+)*$' },
};

const toolDefinitions = [
  {
    name: 'lab_task_queue',
    title: 'Browse approved Lab tasks',
    description: 'List task plans in one Lab project, including specialist assignments, state, and declared file ownership.',
    inputSchema: { type: 'object', properties: { project: taskRefProperties.project }, required: ['project'], additionalProperties: false },
  },
  {
    name: 'lab_task_claim',
    title: 'Claim an assigned Lab task',
    description: 'Claim a task as its assigned owner or reviewer. The Lab records this MCP server process and session. Review requires a separate MCP process from the author.',
    inputSchema: { type: 'object', properties: { ...taskRefProperties, role: { type: 'string', enum: ['owner', 'reviewer'] }, specialistId: { type: 'string', pattern: '^specialist\\.[a-z0-9]+(?:-[a-z0-9]+)*$' } }, required: ['project', 'planId', 'taskId', 'role', 'specialistId'], additionalProperties: false },
  },
  {
    name: 'lab_task_read',
    title: 'Read a task file',
    description: 'Read a file declared as task input or inspect a staged task output. File paths must match the task ownership contract exactly.',
    inputSchema: { type: 'object', properties: { ...taskRefProperties, path: { type: 'string', minLength: 1, maxLength: 512 } }, required: ['project', 'planId', 'taskId', 'path'], additionalProperties: false },
  },
  {
    name: 'lab_task_write',
    title: 'Stage a task output',
    description: 'Write UTF-8 text to an exact path declared with write ownership. Changes stay staged until the independent reviewer accepts them.',
    inputSchema: { type: 'object', properties: { ...taskRefProperties, path: { type: 'string', minLength: 1, maxLength: 512 }, artifactType: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,63}$' }, content: { type: 'string', minLength: 1, maxLength: 524288 } }, required: ['project', 'planId', 'taskId', 'path', 'artifactType', 'content'], additionalProperties: false },
  },
  {
    name: 'lab_task_heartbeat',
    title: 'Extend a task claim',
    description: 'Keep an active task claim alive while the assigned specialist or reviewer is working.',
    inputSchema: { type: 'object', properties: taskRefProperties, required: ['project', 'planId', 'taskId'], additionalProperties: false },
  },
  {
    name: 'lab_task_validate',
    title: 'Validate staged Roblox source',
    description: 'Run fixed Lab checks against a temporary staged project snapshot: pinned Luau parsing for changed Luau files and the pinned Rojo build for project source changes. The temporary place artifact is removed after its hashes are recorded.',
    inputSchema: { type: 'object', properties: taskRefProperties, required: ['project', 'planId', 'taskId'], additionalProperties: false },
  },
  {
    name: 'lab_task_submit',
    title: 'Submit specialist work for review',
    description: 'Submit staged outputs after every required artifact type has been produced. The task becomes reviewable by its separately assigned reviewer.',
    inputSchema: { type: 'object', properties: taskRefProperties, required: ['project', 'planId', 'taskId'], additionalProperties: false },
  },
  {
    name: 'lab_task_review',
    title: 'Review and accept or reject work',
    description: 'Record an independent review decision. Acceptance checks staged hashes, JSON syntax, and source conflicts, writes evidence, and integrates outputs; rejection returns the task for remediation.',
    inputSchema: { type: 'object', properties: { ...taskRefProperties, decision: { type: 'string', enum: ['accept', 'reject'] }, summary: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['project', 'planId', 'taskId', 'decision', 'summary'], additionalProperties: false },
  },
  {
    name: 'lab_task_cancel',
    title: 'Cancel a task claim',
    description: 'Revoke the active owner or reviewer claim and block the task with a recovery reason.',
    inputSchema: { type: 'object', properties: { ...taskRefProperties, reason: { type: 'string', minLength: 1, maxLength: 2000 } }, required: ['project', 'planId', 'taskId', 'reason'], additionalProperties: false },
  },
  {
    name: 'lab_task_recover_stale',
    title: 'Recover expired task claims',
    description: 'Find expired local MCP execution leases in one project, revoke them, and block those tasks pending explicit recovery.',
    inputSchema: { type: 'object', properties: { project: taskRefProperties.project }, required: ['project'], additionalProperties: false },
  },
];

function keyFor(args) {
  return `${args.project}/${args.planId}/${args.taskId}`;
}

function tokenFor(args) {
  const token = claims.get(keyFor(args));
  if (!token) throw Object.assign(new Error('This MCP process does not hold an active claim for the task. Claim it first or recover it after its lease expires.'), { code: 'TASK_EXECUTION_TOKEN_INVALID' });
  return token;
}

function actor() {
  return {
    sessionId,
    processId: process.pid,
    parentProcessId: process.ppid,
    client: { ...client },
  };
}

async function callTool(name, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Object.assign(new Error('Tool arguments must be an object.'), { code: 'INVALID_PARAMS' });
  if (name === 'lab_task_queue') return { project: args.project, plans: await listTaskPlans(rootDir, args.project) };
  if (name === 'lab_task_recover_stale') return await recoverStaleTaskExecutions(rootDir, args.project);
  if (name === 'lab_task_claim') {
    const claim = await claimTaskExecution(rootDir, { ...args, actor: actor() });
    claims.set(keyFor(args), claim.token);
    return { attempt: claim.attempt, role: args.role, processId: process.pid, sessionId, task: claim.task };
  }
  const token = tokenFor(args);
  if (name === 'lab_task_read') return await readTaskExecutionFile(rootDir, { ...args, token });
  if (name === 'lab_task_write') return await writeTaskExecutionFile(rootDir, { ...args, token });
  if (name === 'lab_task_heartbeat') return await heartbeatTaskExecution(rootDir, { ...args, token });
  if (name === 'lab_task_validate') return await validateTaskExecution(rootDir, { ...args, token, toolRootDir });
  if (name === 'lab_task_submit') {
    const result = await submitTaskExecution(rootDir, { ...args, token });
    claims.delete(keyFor(args));
    return result;
  }
  if (name === 'lab_task_review') {
    const result = await reviewTaskExecution(rootDir, { ...args, token });
    claims.delete(keyFor(args));
    return result;
  }
  if (name === 'lab_task_cancel') {
    const result = await cancelTaskExecution(rootDir, { ...args, token });
    claims.delete(keyFor(args));
    return result;
  }
  throw Object.assign(new Error(`Unknown Lab task tool: ${name}.`), { code: 'METHOD_NOT_FOUND' });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcError(id, code, message, data = undefined) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ code: typeof error?.code === 'string' ? error.code : 'LAB_TASK_FAILED', message: typeof error?.message === 'string' ? error.message.slice(0, 500) : 'The Lab task operation failed.' }) }],
  };
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    rpcError(message?.id ?? null, -32600, 'Invalid JSON-RPC request.');
    return;
  }
  if (message.method === 'notifications/initialized') {
    initialized = true;
    return;
  }
  if (message.method.startsWith('notifications/')) return;
  if (!Object.hasOwn(message, 'id')) return;
  if (message.method === 'initialize') {
    if (initialized) {
      rpcError(message.id, -32600, 'This MCP process has already been initialized.');
      return;
    }
    const requested = message.params?.protocolVersion;
    const protocolVersion = protocolVersions.includes(requested) ? requested : protocolVersions[0];
    const reported = message.params?.clientInfo;
    if (reported && typeof reported.name === 'string' && typeof reported.version === 'string') {
      client.name = reported.name.slice(0, 120) || 'unidentified-mcp-client';
      client.version = reported.version.slice(0, 80) || 'unknown';
    }
    send({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: '11vatedtech-ai-roblox-studio-lab-tasks', version: '1.0.0' },
      instructions: 'Use lab_task_queue to find approved assignments. Each MCP server process represents one specialist execution identity. Keep author and reviewer in separate MCP server processes. Writes are staged; only reviewer acceptance integrates them into project files. Client name and version are self-reported.',
    } });
    return;
  }
  if (message.method === 'ping') {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
    return;
  }
  if (!initialized) {
    rpcError(message.id, -32002, 'The MCP connection must complete initialization first.');
    return;
  }
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } });
    return;
  }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params?.name, message.params?.arguments ?? {});
      send({ jsonrpc: '2.0', id: message.id, result: { isError: false, content: [{ type: 'text', text: JSON.stringify(result) }] } });
    } catch (error) {
      send({ jsonrpc: '2.0', id: message.id, result: toolError(error) });
    }
    return;
  }
  rpcError(message.id, -32601, `Method not found: ${message.method}.`);
}

async function processLine(line) {
  if (Buffer.byteLength(line, 'utf8') > 1_100_000) {
    rpcError(null, -32700, 'MCP request exceeded the Lab message limit.');
    return;
  }
  let message;
  try { message = JSON.parse(line); } catch {
    rpcError(null, -32700, 'MCP request must be one newline-delimited JSON-RPC message.');
    return;
  }
  await handleMessage(message).catch((error) => {
    process.stderr.write(`Lab task MCP request failed: ${error?.message ?? 'unknown error'}\n`);
    if (Object.hasOwn(message ?? {}, 'id')) rpcError(message.id, -32603, 'The Lab task operation failed.');
  });
}

let inputBuffer = '';
let discardOversizedLine = false;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  let remaining = chunk;
  if (discardOversizedLine) {
    const newline = remaining.indexOf('\n');
    if (newline < 0) return;
    remaining = remaining.slice(newline + 1);
    discardOversizedLine = false;
  }
  inputBuffer += remaining;
  let newline;
  while ((newline = inputBuffer.indexOf('\n')) >= 0) {
    const line = inputBuffer.slice(0, newline).replace(/\r$/, '');
    inputBuffer = inputBuffer.slice(newline + 1);
    void processLine(line);
  }
  if (Buffer.byteLength(inputBuffer, 'utf8') > 1_100_000) {
    inputBuffer = '';
    discardOversizedLine = true;
    rpcError(null, -32700, 'MCP request exceeded the Lab message limit.');
  }
});
