const SOURCE_ROOT = 'https://raw.githubusercontent.com/Roblox/creator-docs/main/content/en-us/reference/engine/classes';
const DOC_ROOT = 'https://create.roblox.com/docs/reference/engine/classes';
const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_CACHE_ENTRIES = 24;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CLASS_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const SECTION_NAMES = ['properties', 'methods', 'events', 'callbacks'];

const CATALOG = [
  ['DataModel', 'runtime'], ['Workspace', 'world'], ['ReplicatedStorage', 'replication'],
  ['ServerScriptService', 'server'], ['ServerStorage', 'server'], ['StarterGui', 'ui'],
  ['StarterPlayer', 'player'], ['StarterPack', 'player'], ['Lighting', 'world'],
  ['SoundService', 'audio'], ['Teams', 'multiplayer'], ['CollectionService', 'world'],
  ['PhysicsService', 'physics'], ['RunService', 'runtime'], ['MarketplaceService', 'commerce'],
  ['DataStoreService', 'persistence'], ['MemoryStoreService', 'persistence'],
  ['MessagingService', 'multiplayer'], ['HttpService', 'networking'],
  ['ProximityPromptService', 'interaction'], ['ContextActionService', 'input'],
  ['Players', 'player'], ['UserInputService', 'input'], ['TweenService', 'animation'],
  ['PathfindingService', 'ai'], ['TextChatService', 'communication'],
  ['BadgeService', 'progression'], ['InsertService', 'assets'], ['AssetService', 'assets'],
  ['ContentProvider', 'assets'], ['GuiService', 'ui'], ['LocalizationService', 'accessibility'],
  ['PolicyService', 'policy'], ['AnalyticsService', 'analytics'], ['LogService', 'diagnostics'],
  ['Debris', 'runtime'], ['PhysicsSettings', 'physics'], ['MaterialService', 'world'],
  ['VoiceChatService', 'communication'], ['TeleportService', 'multiplayer'],
].map(([name, domain]) => ({ name, domain, url: `${DOC_ROOT}/${name}` }));

function block(lines, startIndex, contentIndent) {
  const values = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && line.match(/^\s*/)[0].length < contentIndent) break;
    values.push(line.length >= contentIndent ? line.slice(contentIndent) : '');
  }
  return values.join('\n').trim();
}

function classSummary(lines) {
  const index = lines.findIndex((line) => /^summary:\s*\|\s*$/.test(line));
  return index < 0 ? '' : block(lines, index, 2);
}

function extractMembers(lines) {
  const sections = {};
  let activeSection = null;
  let current = null;
  const finish = () => {
    if (!current || !activeSection) return;
    const raw = current.lines.join('\n');
    const memberLines = current.lines;
    const name = current.name.split('.').at(-1);
    const summaryIndex = memberLines.findIndex((line) => /^\s{4}summary:\s*\|\s*$/.test(line));
    const summary = summaryIndex < 0 ? '' : block(memberLines, summaryIndex, 6);
    const field = (key) => {
      const match = raw.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, 'm'));
      return match?.[1]?.replace(/^['"]|['"]$/g, '') ?? null;
    };
    sections[activeSection].push({
      name,
      kind: activeSection,
      type: field('type'),
      summary: summary.slice(0, 600),
      deprecated: Boolean(field('deprecation_message') && field('deprecation_message') !== "''"),
      threadSafety: field('thread_safety'),
    });
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sectionMatch = line.match(/^([a-z][A-Za-z0-9]*):\s*$/);
    if (sectionMatch) {
      finish();
      activeSection = SECTION_NAMES.includes(sectionMatch[1]) ? sectionMatch[1] : null;
      if (activeSection) sections[activeSection] = [];
      continue;
    }
    if (!activeSection) continue;
    const memberMatch = line.match(/^  - name:\s*(\S+)\s*$/);
    if (memberMatch) {
      finish();
      current = { name: memberMatch[1], lines: [line] };
      continue;
    }
    if (current) {
      if (line.trim() && line.match(/^\s*/)[0].length < 4) {
        finish();
        continue;
      }
      current.lines.push(line);
    }
  }
  finish();
  return sections;
}

async function readLimited(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error('The official reference document exceeded the 1 MiB Lab limit.'), { code: 'REFERENCE_TOO_LARGE', status: 502 });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class RobloxReferenceClient {
  #cache = new Map();

  constructor({ fetchImpl = fetch, now = () => Date.now(), timeoutMs = 8000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
  }

  catalog() {
    return { source: 'Roblox Creator Hub API reference', url: 'https://create.roblox.com/docs/reference/engine/classes', classes: CATALOG };
  }

  async getClass(name, search = '') {
    if (typeof name !== 'string' || !CLASS_NAME.test(name)) {
      throw Object.assign(new Error('Use a Roblox class name containing letters and numbers only.'), { code: 'INVALID_ENGINE_CLASS', status: 400 });
    }
    if (typeof search !== 'string' || search.length > 100) {
      throw Object.assign(new Error('Search text must be at most 100 characters.'), { code: 'INVALID_REFERENCE_SEARCH', status: 400 });
    }
    let cached = this.#cache.get(name);
    if (!cached || cached.expiresAt <= this.now()) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      timeout.unref?.();
      try {
        const response = await this.fetchImpl(`${SOURCE_ROOT}/${name}.yaml`, { signal: controller.signal, redirect: 'error', headers: { accept: 'text/plain' } });
        if (!response.ok) {
          const status = response.status === 404 ? 404 : 502;
          throw Object.assign(new Error(response.status === 404 ? `Roblox's current API reference has no class named ${name}.` : `Roblox's API reference returned HTTP ${response.status}.`), { code: status === 404 ? 'ENGINE_CLASS_NOT_FOUND' : 'REFERENCE_UPSTREAM_FAILED', status });
        }
        const document = await readLimited(response);
        const lines = document.split(/\r?\n/);
        const declaredName = document.match(/^name:\s*(\S+)\s*$/m)?.[1];
        const declaredType = document.match(/^type:\s*(\S+)\s*$/m)?.[1];
        if (declaredName !== name || declaredType !== 'class') {
          throw Object.assign(new Error('The official reference response did not match the requested Roblox class.'), { code: 'REFERENCE_RESPONSE_INVALID', status: 502 });
        }
        const inheritsIndex = lines.findIndex((line) => /^inherits:\s*$/.test(line));
        const inherits = [];
        if (inheritsIndex >= 0) {
          for (let index = inheritsIndex + 1; index < lines.length && /^  - /.test(lines[index]); index += 1) inherits.push(lines[index].slice(4));
        }
        const sectionData = extractMembers(lines);
        cached = {
          name,
          summary: classSummary(lines).slice(0, 1600),
          inherits,
          members: sectionData,
          sourceUrl: `${DOC_ROOT}/${name}`,
          rawSourceUrl: `${SOURCE_ROOT}/${name}.yaml`,
          sourceRevision: response.headers.get('etag'),
          retrievedAt: new Date(this.now()).toISOString(),
          expiresAt: this.now() + CACHE_TTL_MS,
        };
        this.#cache.delete(name);
        this.#cache.set(name, cached);
        while (this.#cache.size > MAX_CACHE_ENTRIES) this.#cache.delete(this.#cache.keys().next().value);
      } catch (error) {
        if (error?.name === 'AbortError') throw Object.assign(new Error('Roblox API reference request timed out.'), { code: 'REFERENCE_TIMEOUT', status: 504 });
        if (error?.code) throw error;
        throw Object.assign(new Error('Could not reach Roblox’s official API reference. Check network access and try again.'), { code: 'REFERENCE_UPSTREAM_FAILED', status: 502 });
      } finally {
        clearTimeout(timeout);
      }
    } else {
      this.#cache.delete(name);
      this.#cache.set(name, cached);
    }
    const term = search.trim().toLocaleLowerCase();
    const memberCount = Object.values(cached.members).reduce((total, members) => total + members.length, 0);
    const members = Object.fromEntries(Object.entries(cached.members).map(([kind, values]) => [
      kind,
      values.filter((item) => !term || `${item.name} ${item.type ?? ''} ${item.summary}`.toLocaleLowerCase().includes(term)).slice(0, 80),
    ]));
    return {
      class: cached.name,
      summary: cached.summary,
      inherits: cached.inherits,
      search: search.trim(),
      totalMembers: memberCount,
      returnedMembers: Object.values(members).reduce((total, values) => total + values.length, 0),
      members,
      source: 'official_roblox_creator_docs',
      sourceUrl: cached.sourceUrl,
      rawSourceUrl: cached.rawSourceUrl,
      sourceRevision: cached.sourceRevision,
      retrievedAt: cached.retrievedAt,
      cacheTtlSeconds: Math.floor(CACHE_TTL_MS / 1000),
    };
  }
}
