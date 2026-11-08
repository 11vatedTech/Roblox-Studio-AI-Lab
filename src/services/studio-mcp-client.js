import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_INFO = { name: '11vatedtech-ai-roblox-studio-lab', version: '0.1.0' };
const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSION = '2025-11-25';
const ALLOWED_READ_TOOLS = new Set([
  'list_roblox_studios',
  'get_studio_state',
  'get_console_output',
  'search_game_tree',
  'inspect_instance',
  'script_read',
  'script_search',
  'script_grep',
  'screen_capture',
  'http_get',
  'skill',
]);
const MAX_MESSAGE_CHARS = 12 * 1024 * 1024;

export function createMinimalChildEnvironment(env = process.env) {
  const allowed = ['APPDATA', 'COMSPEC', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'PATH', 'PROCESSOR_ARCHITECTURE', 'SYSTEMROOT', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'];
  return Object.fromEntries(allowed.filter((key) => typeof env[key] === 'string').map((key) => [key, env[key]]));
}

function parseToolContent(result) {
  if (result?.isError) {
    throw Object.assign(new Error('Roblox Studio returned an MCP tool error.'), { code: 'STUDIO_TOOL_ERROR' });
  }
  if (Object.hasOwn(result ?? {}, 'structuredContent')) return result.structuredContent;
  const textBlocks = (result?.content ?? []).filter((item) => item.type === 'text').map((item) => item.text);
  if (textBlocks.length === 1) {
    try { return JSON.parse(textBlocks[0]); } catch { return textBlocks[0]; }
  }
  return textBlocks;
}

export class StudioMcpClient {
  #child = null;
  #state = 'disconnected';
  #tools = [];
  #toolDefinitions = [];
  #discoveredAt = null;
  #error = null;
  #requestId = 0;
  #pending = new Map();
  #stdoutBuffer = '';
  #stderrTail = '';
  #connectPromise = null;
  #protocolEra = null;
  #protocolVersion = null;
  #usesDefaultLauncher = false;

  constructor({ command, args, env = process.env, launcherPath, timeoutMs = 8000, spawnProcess = spawn } = {}) {
    this.#usesDefaultLauncher = command === undefined && args === undefined;
    this.command = command ?? (process.platform === 'win32' ? (env.ComSpec || 'cmd.exe') : (launcherPath ?? path.join(env.LOCALAPPDATA ?? '', 'Roblox', 'mcp.bat')));
    this.args = args ?? (command ? [] : (process.platform === 'win32' ? ['/c', 'cd /d %LOCALAPPDATA%\\Roblox && .\\mcp.bat'] : []));
    this.env = createMinimalChildEnvironment(env);
    this.launcherPath = launcherPath ?? path.join(env.LOCALAPPDATA ?? '', 'Roblox', 'mcp.bat');
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
  }

  getStatus() {
    return {
      state: this.#state,
      connected: this.#state === 'connected',
      protocolEra: this.#protocolEra,
      protocolVersion: this.#protocolVersion,
      tools: [...this.#tools],
      error: this.#error,
    };
  }

  getToolDefinition(name) {
    return this.#toolDefinitions.find((tool) => tool.name === name) ?? null;
  }

  getToolInventory() {
    const discovered = new Map(this.#toolDefinitions.map((tool) => [tool.name, tool]));
    const names = [...new Set([...this.#toolDefinitions.map((tool) => tool.name), ...ALLOWED_READ_TOOLS])].sort();
    const tools = names.slice(0, 100).map((name) => {
      const definition = discovered.get(name);
      const dashboardCallable = ALLOWED_READ_TOOLS.has(name);
      const schemaText = definition?.inputSchema ? JSON.stringify(definition.inputSchema) : '';
      const schemaAvailable = Boolean(schemaText) && Buffer.byteLength(schemaText, 'utf8') <= 64 * 1024;
      return {
        name,
        description: (definition?.description ?? '').slice(0, 4000),
        available: Boolean(definition),
        operationClass: dashboardCallable ? 'read_only' : 'unclassified',
        dashboardCallable: dashboardCallable && Boolean(definition),
        restriction: dashboardCallable
          ? (definition ? 'Exposed only through its named, argument-validated Lab route.' : 'The Studio server did not report this known read operation.')
          : 'Discovered by the Studio server but not exposed through the Lab dashboard.',
        inputSchema: schemaAvailable ? definition.inputSchema : null,
        inputSchemaStatus: !definition?.inputSchema ? 'not_reported' : schemaAvailable ? 'reported' : 'too_large',
      };
    });
    return {
      schemaVersion: 1,
      discoveredAt: this.#discoveredAt,
      discoveredToolCount: this.#toolDefinitions.length,
      reportedEntryCount: tools.length,
      truncated: names.length > tools.length,
      tools,
    };
  }

  async connect() {
    if (this.#state === 'connected') return this.getStatus();
    if (this.#connectPromise) return this.#connectPromise;
    this.#connectPromise = this.#connect();
    try {
      return await this.#connectPromise;
    } finally {
      this.#connectPromise = null;
    }
  }

  async #connect() {
    if (!this.command || (!this.args.length && !this.command)) {
      throw Object.assign(new Error('No Roblox Studio MCP launcher is configured.'), { code: 'STUDIO_MCP_NOT_INSTALLED' });
    }
    if (!this.args.length && !fs.existsSync(this.command)) {
      throw Object.assign(new Error('The Roblox Studio MCP launcher was not found.'), { code: 'STUDIO_MCP_NOT_INSTALLED' });
    }
    if (process.platform === 'win32' && this.#usesDefaultLauncher && !fs.existsSync(this.launcherPath)) {
      throw Object.assign(new Error('The Roblox Studio MCP launcher was not found.'), { code: 'STUDIO_MCP_NOT_INSTALLED' });
    }
    this.#state = 'connecting';
    this.#error = null;
    try {
      this.#child = this.spawnProcess(this.command, this.args, {
        cwd: process.cwd(),
        env: this.env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.#child.stdout.setEncoding('utf8');
      this.#child.stderr.setEncoding('utf8');
      this.#child.stdout.on('data', (chunk) => this.#receive(chunk));
      this.#child.stderr.on('data', (chunk) => {
        this.#stderrTail = `${this.#stderrTail}${chunk}`.slice(-2000);
      });
      this.#child.on('error', (error) => this.#failPending(error));
      this.#child.on('exit', (code, signal) => {
        if (this.#state === 'connected' || this.#state === 'connecting') {
          this.#state = 'error';
          this.#error = `Roblox Studio MCP process exited (code ${code ?? 'unknown'}${signal ? `, signal ${signal}` : ''}).`;
        }
        this.#failPending(Object.assign(new Error(this.#error ?? 'Roblox Studio MCP process exited.'), { code: 'STUDIO_MCP_EXITED' }));
      });

      let discovery;
      try {
        discovery = await this.#request('server/discover', {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
            'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        }, { timeoutMs: Math.min(1800, this.timeoutMs) });
      } catch {
        discovery = null;
      }

      if (discovery?.supportedVersions) {
        const versions = discovery.supportedVersions;
        if (!Array.isArray(versions) || !versions.includes(MODERN_VERSION)) {
          throw Object.assign(new Error(`The Studio MCP server supports no compatible modern protocol version (${Array.isArray(versions) ? versions.join(', ') : 'unknown'}).`), { code: 'STUDIO_MCP_VERSION_UNSUPPORTED' });
        }
        this.#protocolEra = 'modern';
        this.#protocolVersion = MODERN_VERSION;
      } else {
        const initialized = await this.#request('initialize', {
          protocolVersion: LEGACY_VERSION,
          capabilities: { tools: {} },
          clientInfo: CLIENT_INFO,
        }, { timeoutMs: this.timeoutMs });
        const negotiated = initialized?.protocolVersion;
        if (negotiated && !['2024-11-05', '2025-03-26', '2025-06-18', LEGACY_VERSION].includes(negotiated)) {
          throw Object.assign(new Error(`The Studio MCP server negotiated an unsupported legacy protocol version: ${negotiated}.`), { code: 'STUDIO_MCP_VERSION_UNSUPPORTED' });
        }
        this.#protocolEra = 'legacy';
        this.#protocolVersion = negotiated ?? LEGACY_VERSION;
        this.#notify('notifications/initialized');
      }

      const listed = await this.#request('tools/list', this.#protocolEra === 'modern' ? { _meta: this.#metadata() } : {});
      this.#toolDefinitions = (listed?.tools ?? []).filter((tool) => typeof tool?.name === 'string').map((tool) => ({
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : null,
      }));
      this.#tools = this.#toolDefinitions.map((tool) => tool.name);
      this.#discoveredAt = new Date().toISOString();
      if (!this.#tools.includes('list_roblox_studios')) {
        throw Object.assign(new Error('The Studio MCP server did not expose list_roblox_studios.'), { code: 'STUDIO_DISCOVERY_TOOL_MISSING' });
      }
      this.#state = 'connected';
      this.#error = null;
      return this.getStatus();
    } catch (error) {
      this.#state = 'error';
      this.#error = error?.code === 'STUDIO_MCP_EXITED'
        ? `${error.message} Open a place and enable Studio as an MCP server in Roblox Studio.${this.#stderrTail ? ` ${this.#stderrTail.trim().slice(-500)}` : ''}`
        : `${error?.message || 'Could not connect to Roblox Studio MCP.'}${this.#stderrTail ? ` ${this.#stderrTail.trim().slice(-500)}` : ''}`;
      await this.close({ preserveState: true });
      throw Object.assign(new Error(this.#error), { code: error?.code ?? 'STUDIO_MCP_CONNECTION_FAILED' });
    }
  }

  async listStudios() {
    const data = parseToolContent(await this.callReadTool('list_roblox_studios', {}));
    const entries = Array.isArray(data) ? data : Array.isArray(data?.studios) ? data.studios : Array.isArray(data?.instances) ? data.instances : null;
    if (!entries) throw Object.assign(new Error('Roblox Studio returned an unexpected instance list.'), { code: 'STUDIO_RESPONSE_INVALID' });
    return entries.map((entry) => {
      const id = entry?.studio_id ?? entry?.studioId ?? entry?.id;
      if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim()) {
        throw Object.assign(new Error('Roblox Studio returned an instance without an ID.'), { code: 'STUDIO_RESPONSE_INVALID' });
      }
      return { ...entry, studio_id: String(id) };
    });
  }

  async callReadTool(name, args = {}) {
    if (!ALLOWED_READ_TOOLS.has(name)) {
      throw Object.assign(new Error('This Studio operation is not available through the Lab dashboard.'), { code: 'STUDIO_TOOL_NOT_ALLOWED' });
    }
    if (this.#state !== 'connected') {
      throw Object.assign(new Error('Connect the official Studio MCP server before requesting live Studio data.'), { code: 'STUDIO_NOT_CONNECTED' });
    }
    const payload = { name, arguments: args };
    if (this.#protocolEra === 'modern') payload._meta = this.#metadata();
    return this.#request('tools/call', payload);
  }

  #metadata() {
    return {
      'io.modelcontextprotocol/protocolVersion': this.#protocolVersion,
      'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
      'io.modelcontextprotocol/clientCapabilities': {},
    };
  }

  #request(method, params, { timeoutMs = this.timeoutMs } = {}) {
    if (!this.#child || this.#child.stdin.destroyed) {
      return Promise.reject(Object.assign(new Error('The Studio MCP process is not running.'), { code: 'STUDIO_MCP_NOT_RUNNING' }));
    }
    const id = ++this.#requestId;
    const message = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(Object.assign(new Error(`Roblox Studio MCP did not answer ${method} within ${timeoutMs} ms.`), { code: 'STUDIO_MCP_TIMEOUT' }));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(Object.assign(new Error('Could not write a request to Roblox Studio MCP.'), { code: 'STUDIO_MCP_WRITE_FAILED' }));
      });
    });
  }

  #notify(method) {
    if (!this.#child || this.#child.stdin.destroyed) return;
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
  }

  #receive(chunk) {
    this.#stdoutBuffer += chunk;
    if (this.#stdoutBuffer.length > MAX_MESSAGE_CHARS && !this.#stdoutBuffer.includes('\n')) {
      this.#failPending(Object.assign(new Error('Studio MCP returned a message that exceeded the Lab size limit.'), { code: 'STUDIO_MCP_MESSAGE_TOO_LARGE' }));
      this.#child?.kill();
      return;
    }
    let newlineIndex;
    while ((newlineIndex = this.#stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.#stdoutBuffer.slice(0, newlineIndex).trim();
      this.#stdoutBuffer = this.#stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      if (line.length > MAX_MESSAGE_CHARS) {
        this.#failPending(Object.assign(new Error('Studio MCP returned a message that exceeded the Lab size limit.'), { code: 'STUDIO_MCP_MESSAGE_TOO_LARGE' }));
        this.#child?.kill();
        return;
      }
      let response;
      try { response = JSON.parse(line); } catch {
        this.#failPending(Object.assign(new Error('Studio MCP wrote invalid JSON-RPC data to stdout.'), { code: 'STUDIO_MCP_INVALID_MESSAGE' }));
        this.#child?.kill();
        return;
      }
      const pending = this.#pending.get(response.id);
      if (!pending) continue;
      this.#pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error) {
        const error = Object.assign(new Error(response.error.message || 'Studio MCP request failed.'), { code: response.error.code ?? 'STUDIO_MCP_REMOTE_ERROR', data: response.error.data });
        pending.reject(error);
      } else {
        pending.resolve(response.result);
      }
    }
  }

  #failPending(error) {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
  }

  async close({ preserveState = false } = {}) {
    const child = this.#child;
    this.#child = null;
    if (!preserveState) {
      this.#state = 'disconnected';
      this.#tools = [];
      this.#toolDefinitions = [];
      this.#discoveredAt = null;
      this.#protocolEra = null;
      this.#protocolVersion = null;
      this.#error = null;
    }
    this.#failPending(Object.assign(new Error('Studio MCP connection was closed.'), { code: 'STUDIO_MCP_CLOSED' }));
    if (!child) return;
    try { child.stdin.end(); } catch { /* Child may have already exited. */ }
    if (child.exitCode !== null || child.signalCode !== null) return;
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32' && Number.isInteger(child.pid)) {
        const taskkill = this.env.SYSTEMROOT ? path.join(this.env.SYSTEMROOT, 'System32', 'taskkill.exe') : 'taskkill.exe';
        const killer = this.spawnProcess(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false, env: this.env });
        await new Promise((resolve) => { killer.once('error', resolve); killer.once('exit', resolve); });
      } else {
        child.kill('SIGTERM');
      }
    }
  }
}

export function defaultStudioLauncherAvailable(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return false;
  return fs.existsSync(path.join(env.LOCALAPPDATA ?? '', 'Roblox', 'mcp.bat'));
}
