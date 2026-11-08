const view = document.querySelector('#view');
const nav = document.querySelector('#navigation');
const notice = document.querySelector('#notice');
const currentSection = document.querySelector('#current-section');
const routeTitles = {
  overview: 'CONTROL ROOM', projects: 'PROJECTS', studio: 'ROBLOX STUDIO', explorer: 'EXPERIENCE EXPLORER', engine: 'ENGINE REFERENCE',
  assets: 'ASSET LIBRARY', agents: 'AGENT WORKBENCH', design: 'GAME INTELLIGENCE', code: 'CODE & ARCHITECTURE',
  playtest: 'PLAYTESTING', visual: 'VISUAL QA', performance: 'PERFORMANCE', security: 'SECURITY',
  analytics: 'ANALYTICS', docs: 'DOCUMENTATION', settings: 'DIAGNOSTICS',
};
let studioInstances = [];
let selectedStudioId = '';
let selectedProject = '';
let activeDocumentKind = 'docs';
let knowledgeFilters = { q: '', kind: '', family_id: '', mechanic_id: '', platform_state: '', maturity: '' };
let taskSpecialists = [];
let taskAssignmentCandidates = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function bytes(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function timeString() {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

document.querySelector('#clock').textContent = `LOCAL / ${timeString()}`;
setInterval(() => { document.querySelector('#clock').textContent = `LOCAL / ${timeString()}`; }, 30000);

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, 5200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) },
  });
  const type = response.headers.get('content-type') ?? '';
  const result = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = result?.error?.message ?? `Request failed with status ${response.status}.`;
    throw Object.assign(new Error(message), { code: result?.error?.code ?? 'LAB_REQUEST_FAILED', operation: result?.operation });
  }
  return result;
}

function header(title, eyebrow, description, actions = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1><p class="lede">${escapeHtml(description)}</p></div>${actions ? `<div class="button-row">${actions}</div>` : ''}</div>`;
}

function metric(label, value, foot, unit = '') {
  return `<article class="metric"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}<small>${escapeHtml(unit)}</small></div><div class="metric-foot">${escapeHtml(foot)}</div></article>`;
}

function emptyState(title, detail) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

function statusTag(state, label) {
  const normalized = String(state ?? '').toLowerCase();
  const kind = ['connected', 'online', 'ok', 'installed'].includes(normalized) ? '' : ['unverified', 'missing', 'error', 'blocked', 'unmeasured'].includes(normalized) ? 'warn' : 'off';
  return `<span class="tag ${kind}"><i class="status-dot"></i>${escapeHtml(label)}</span>`;
}

function knowledgeValueHtml(value, depth = 0) {
  if (value === null || value === undefined || value === '') return '<span class="muted">Not recorded</span>';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return `<span>${escapeHtml(value)}</span>`;
  if (depth >= 3) return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
  if (Array.isArray(value)) {
    if (!value.length) return '<span class="muted">None recorded</span>';
    return `<ul class="knowledge-list">${value.slice(0, 16).map((item) => `<li>${knowledgeValueHtml(item, depth + 1)}</li>`).join('')}</ul>`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, 16);
    if (!entries.length) return '<span class="muted">None recorded</span>';
    return `<dl class="knowledge-facts">${entries.map(([key, item]) => `<div><dt>${escapeHtml(key.replaceAll(/([A-Z])/g, ' $1'))}</dt><dd>${knowledgeValueHtml(item, depth + 1)}</dd></div>`).join('')}</dl>`;
  }
  return '<span class="muted">Not recorded</span>';
}

function renderKnowledgeRecord(record) {
  const maturity = typeof record.maturity === 'object' ? record.maturity?.level : record.maturity;
  const platformState = typeof record.platformState === 'object' ? record.platformState?.state : record.platformState;
  const sourceRefs = Array.isArray(record.sourceRefs) ? record.sourceRefs : [];
  const sources = sourceRefs.map((source) => {
    const url = typeof source === 'string' ? source : source?.url ?? source?.href ?? source?.reference ?? '';
    const label = typeof source === 'string' ? source : source?.title ?? source?.label ?? source?.source ?? url ?? 'Source';
    const reviewed = typeof source === 'object' ? source?.retrievedAt ?? source?.reviewedAt ?? source?.checkedAt : '';
    const safeUrl = /^https:\/\/create\.roblox\.com\/docs\//.test(url) ? url : '';
    return `<li>${safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)}</span>`}${reviewed ? `<small>${escapeHtml(reviewed)}</small>` : ''}</li>`;
  }).join('');
  const dependencySection = Array.isArray(record.dependencies) && record.dependencies.length
    ? `<details><summary>Dependencies <small>${record.dependencies.length}</small></summary>${knowledgeValueHtml(record.dependencies)}</details>`
    : '';
  return `<article class="knowledge-card">
    <div class="knowledge-card-heading"><div><p class="panel-kicker">${escapeHtml(record.kind)} · ${escapeHtml(record.id)}</p><h3>${escapeHtml(record.title ?? record.name ?? record.id)}</h3></div><div class="knowledge-tags"><span class="tag off">${escapeHtml(maturity ?? 'unassessed')}</span><span class="tag warn">${escapeHtml(platformState ?? 'unknown')}</span></div></div>
    <p class="small">${escapeHtml(record.summary ?? 'No summary recorded.')}</p>
    ${record.designKnowledge ? `<details><summary>Design knowledge</summary>${knowledgeValueHtml(record.designKnowledge)}</details>` : ''}
    ${record.technicalPatterns ? `<details><summary>Technical patterns</summary>${knowledgeValueHtml(record.technicalPatterns)}</details>` : ''}
    ${record.animation ? `<details><summary>Animation requirements</summary>${knowledgeValueHtml(record.animation)}</details>` : ''}
    ${record.testing ? `<details><summary>Testing and quality</summary>${knowledgeValueHtml(record.testing)}</details>` : ''}
    ${record.failureModes ? `<details><summary>Failure modes</summary>${knowledgeValueHtml(record.failureModes)}</details>` : ''}
    ${dependencySection}
    <div class="knowledge-provenance"><span>Owner: ${escapeHtml(record.owner ?? 'unassigned')}</span><span>Reviewed: ${escapeHtml(record.reviewedAt ?? 'not recorded')}</span><span>Version: ${escapeHtml(record.version ?? '—')}</span></div>
    ${sources ? `<ul class="knowledge-sources">${sources}</ul>` : '<p class="small muted">No source references recorded.</p>'}
  </article>`;
}

function renderKnowledgeResults(data) {
  const diagnosticCount = Number.isInteger(data.diagnosticCount) ? data.diagnosticCount : (Array.isArray(data.diagnostics) ? data.diagnostics.length : 0);
  const diagnostics = Array.isArray(data.diagnostics) && data.diagnostics.length
    ? `<details class="knowledge-diagnostics"><summary>Registry diagnostics <small>${diagnosticCount}</small></summary><ul>${data.diagnostics.slice(0, 10).map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item.message ?? item.code ?? JSON.stringify(item))}</li>`).join('')}</ul></details>`
    : '';
  const matches = Array.isArray(data.matches) ? data.matches : [];
  return `<div class="knowledge-results-meta"><span>${escapeHtml(matches.length)} shown · ${escapeHtml(data.total ?? matches.length)} matched</span><span>${escapeHtml(diagnosticCount)} registry diagnostic${diagnosticCount === 1 ? '' : 's'}</span></div>
    ${diagnostics}
    ${matches.length ? `<div class="knowledge-results">${matches.map(renderKnowledgeRecord).join('')}</div>` : emptyState(diagnosticCount ? 'No valid matching records' : 'No matching knowledge', diagnosticCount ? 'The registry returned diagnostics. Review them before treating the catalogue as complete.' : 'Broaden the query or clear filters. Missing knowledge remains an explicit gap; the Lab will not substitute a nearby template.')}`;
}

function knowledgeSearchUrl(filters = knowledgeFilters) {
  const params = new URLSearchParams();
  for (const key of ['q', 'kind', 'family_id', 'mechanic_id', 'platform_state', 'maturity']) {
    const value = String(filters[key] ?? '').trim();
    if (value) params.set(key, value);
  }
  params.set('limit', '50');
  return `/api/knowledge?${params}`;
}

function pageStart(route) {
  const routeTitle = routeTitles[route] ?? routeTitles.overview;
  currentSection.textContent = routeTitle;
  for (const link of nav.querySelectorAll('a[data-route]')) {
    const active = link.dataset.route === route;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function worldMap({ studioOnline, projects, healthChecks }) {
  const studioClass = studioOnline ? 'online' : 'warn';
  const projectClass = projects > 0 ? 'online' : '';
  const qaClass = healthChecks > 0 ? 'online' : '';
  return `<div class="world-map" aria-label="Live Lab systems map">
    <svg viewBox="0 0 390 205" role="img" aria-labelledby="map-title map-desc">
      <title id="map-title">Lab system links</title><desc id="map-desc">A live status map of the local workspace, Roblox Studio connection and validation evidence.</desc>
      <ellipse class="map-orbit" cx="194" cy="104" rx="151" ry="74"/><ellipse class="map-orbit" cx="194" cy="104" rx="99" ry="49"/>
      <path class="map-link" d="M194 104 72 57M194 104 317 59M194 104 320 151M194 104 75 151"/>
      <circle class="map-center" cx="194" cy="104" r="25"/><circle class="map-pulse" cx="194" cy="104" r="4"/>
      <circle class="map-node ${projectClass}" cx="72" cy="57" r="8"/><circle class="map-node ${studioClass}" cx="317" cy="59" r="8"/>
      <circle class="map-node ${qaClass}" cx="320" cy="151" r="8"/><circle class="map-node" cx="75" cy="151" r="8"/>
      <text class="map-label" x="43" y="39">SOURCE</text><text class="map-label" x="282" y="39">STUDIO</text>
      <text class="map-label" x="284" y="177">QUALITY</text><text class="map-label" x="45" y="177">ASSETS</text>
      <text class="map-caption" x="167" y="146">LOCAL CORE</text>
    </svg>
  </div>`;
}

async function renderOverview() {
  const data = await api('/api/overview');
  const environment = data.environment;
  const studio = data.studio;
  const studioReady = studio.connected && studioInstances.length > 0;
  const projectCount = data.projects.count;
  const missingToolCount = Object.values(environment.tools).filter((item) => !item.available).length;
  const healthChecks = Object.values(environment.tools).filter((item) => item.available).length;
  const capabilitySummary = data.capabilities.summary;
  const capabilityStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'BLOCKED_EXTERNAL', 'BLOCKED_HUMAN_APPROVAL', 'FAILED', 'DEFERRED_WITH_JUSTIFICATION'];
  const capabilityTags = capabilityStatuses.filter((status) => capabilitySummary[status] > 0).map((status) => `<span class="tag ${status.startsWith('BLOCKED') || status === 'FAILED' ? 'warn' : ''}">${escapeHtml(status.replaceAll('_', ' '))} · ${escapeHtml(capabilitySummary[status])}</span>`).join('');
  const openCapabilityItems = data.capabilities.openItems.map((item) => `<div class="status-row"><span class="status-icon warn">·</span><div class="status-copy"><strong>${escapeHtml(item.title)}</strong><small class="mono">${escapeHtml(item.id)} · ${escapeHtml(item.status.replaceAll('_', ' '))}</small></div><span class="status-value">OPEN</span></div>`).join('');
  const mcpText = studio.connected ? `${studioInstances.length} Studio instance${studioInstances.length === 1 ? '' : 's'} listed` : 'MCP bridge disconnected';
  view.innerHTML = `${header('Make worlds that answer back.', 'CREATIVE SYSTEMS / ROBLOX', 'A local production bench for game design, Luau, art direction, Studio inspection, and evidence-led iteration.')}
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">WORLD BUILD / ${escapeHtml(environment.platform.toUpperCase())}</p>
        <h1>Build the <em>whole world.</em><br/>Prove every system.</h1>
        <p class="lede">The Lab reads this machine and workspace directly. Studio operations stay on Roblox’s official local MCP bridge.</p>
        <div class="hero-meta">${statusTag(studioReady ? 'connected' : studio.connected ? 'unverified' : 'disconnected', mcpText)}${statusTag(environment.robloxStudio.installed ? 'installed' : 'missing', environment.robloxStudio.installed ? 'Studio found' : 'Studio not found')}${statusTag(projectCount > 0 ? 'online' : 'unmeasured', `${projectCount} local projects`)}</div>
      </div>
      ${worldMap({ studioOnline: studioReady, projects: projectCount, healthChecks })}
    </section>
    <section class="metric-grid" aria-label="Live workspace measures">
      ${metric('Local projects', projectCount, 'Read from projects/')}
      ${metric('Agent workflows', data.library.specialistWorkflows, 'Markdown instruction files')}
      ${metric('Documentation', data.library.documentationFiles, 'Local reference files')}
      ${metric('Tool gaps', missingToolCount, 'PATH probes still missing', 'detected')}
    </section>
    <section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">MACHINE-READABLE ACCEPTANCE</p><h2>${escapeHtml(capabilitySummary.verified)} of ${escapeHtml(capabilitySummary.total)} Lab requirements verified</h2><p>Implemented, verified, blocked, and unfinished states remain separate. Register updated ${escapeHtml(new Date(data.capabilities.updatedAt).toLocaleString())}.</p></div><a class="button secondary" href="/api/capabilities" target="_blank" rel="noopener">Open register</a></div><div class="button-row">${capabilityTags}</div><div class="section-gap">${openCapabilityItems}</div></section>
    <section class="split-grid">
      <article class="panel">
        <div class="panel-heading"><div><p class="panel-kicker">Environment pulse</p><h2>What this machine can run</h2><p>Only detected executables and the installed Studio launcher appear here.</p></div><a class="doc-link" href="#settings"><span>Open diagnostics</span><small>→</small></a></div>
        ${toolStatusRow('Git', environment.tools.git)}${toolStatusRow('Node.js', environment.tools.node)}${toolStatusRow('Roblox Studio MCP launcher', { available: environment.robloxStudio.mcpLauncherInstalled, executable: environment.robloxStudio.mcpLauncher })}
      </article>
      <article class="panel">
        <div class="panel-heading"><div><p class="panel-kicker">Current evidence</p><h2>Studio link</h2><p>Process presence is not treated as a live MCP connection.</p><p><a class="doc-link" href="/api/evidence" target="_blank" rel="noopener"><span>Evidence registry</span><small>${escapeHtml(data.evidence.summary.total)} records · ${escapeHtml(data.evidence.summary.passed)} scoped passes →</small></a></p></div></div>
        ${studio.connected ? (studioInstances.length ? studioInstances.map((instance) => studioRow(instance)).join('') : emptyState('Server connected; no Studio instance listed', 'Open a place in Studio and check that Enable Studio as MCP server is on.')) : emptyState('No live Studio link yet', 'Connect the local official MCP server after enabling it in Studio. The Lab will verify the link by requesting the real instance list.')}
      </article>
    </section>`;
}

function toolStatusRow(label, item) {
  const available = Boolean(item?.available);
  return `<div class="status-row"><span class="status-icon ${available ? '' : 'warn'}">${available ? '✓' : '·'}</span><div class="status-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item?.executable ?? 'Not found on PATH / checked locations')}</small></div><span class="status-value">${available ? 'READY' : 'MISSING'}</span></div>`;
}

function studioRow(instance) {
  const active = selectedStudioId === instance.studio_id;
  return `<button class="doc-link" type="button" data-action="select-studio" data-id="${escapeHtml(instance.studio_id)}"><span><strong>${escapeHtml(instance.name ?? 'Untitled place')}</strong><small class="mono">${escapeHtml(instance.studio_id)}${instance.place_id ? ` · place ${escapeHtml(instance.place_id)}` : ' · local place'}</small></span><small>${active ? 'SELECTED' : 'SELECT'}</small></button>`;
}

async function renderProjects() {
  const data = await api('/api/projects');
  const rows = data.projects.map((project) => `<tr><td><strong>${escapeHtml(project.displayName ?? project.name)}</strong><div class="small mono">${escapeHtml(project.path)}</div></td><td>${escapeHtml(project.sourceFiles)}</td><td>${escapeHtml(project.fileCount)}</td><td>${escapeHtml(project.openTaskCount ?? 0)} open · ${escapeHtml(project.taskPlanCount ?? 0)} plans</td><td>${escapeHtml(project.template ?? 'Unmanaged local project')}</td><td><div class="button-row"><button class="button secondary" type="button" data-action="open-project" data-project="${escapeHtml(project.name)}">Inspect source</button><button class="button secondary" type="button" data-action="inspect-rojo" data-project="${escapeHtml(project.name)}">Rojo status</button><button class="button secondary" type="button" data-action="build-project" data-project="${escapeHtml(project.name)}">Build place</button></div></td></tr>`).join('');
  view.innerHTML = `${header('Projects', 'SOURCE / TASKS / RECOVERY', 'Project rows come from the local source tree; task counts are read from each project’s saved Lab plans.')}
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">Local workspaces</p><h2>Experience projects</h2><p>Project creation is local and copies the Lab’s complete base template.</p></div><span class="tag"><i class="status-dot"></i>${data.projects.length} FOUND</span></div>
      <form id="project-form" class="form-row"><label class="sr-only" for="project-name">New project name</label><input class="field" id="project-name" name="name" required minlength="1" maxlength="48" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="e.g. signal-garden" autocomplete="off"/><button class="button" type="submit">Create from starter</button></form>
      ${data.projects.length ? `<table class="data-table"><thead><tr><th>Project</th><th>Luau</th><th>Files</th><th>Open tasks</th><th>Template</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : emptyState('No projects yet', 'Create a project to get a Rojo-ready source tree and a secure, replayable collection loop.')}
      <div id="project-build-result" class="section-gap" hidden></div>
    </section>`;
  const form = document.querySelector('#project-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.querySelector('#project-name');
    const result = await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: input.value }) });
    selectedProject = result.project.name;
    showNotice(`Created ${result.project.name} from the local Roblox starter.`);
    await render();
  });
}

async function loadStudios() {
  const data = await api('/api/studio/instances');
  studioInstances = data.instances;
  if (!studioInstances.some((instance) => instance.studio_id === selectedStudioId)) selectedStudioId = studioInstances[0]?.studio_id ?? '';
  return studioInstances;
}

function studioPicker() {
  if (!studioInstances.length) return '';
  return `<label class="sr-only" for="studio-picker">Studio instance</label><select id="studio-picker" class="field select">${studioInstances.map((instance) => `<option value="${escapeHtml(instance.studio_id)}" ${instance.studio_id === selectedStudioId ? 'selected' : ''}>${escapeHtml(instance.name ?? 'Untitled')} — ${escapeHtml(instance.studio_id)}</option>`).join('')}</select>`;
}

async function renderStudio() {
  const data = await api('/api/studio');
  const connection = data.connection;
  const inventory = data.toolInventory;
  if (connection.connected) {
    try { await loadStudios(); } catch (error) { showNotice(error.message, true); }
  } else {
    studioInstances = [];
    selectedStudioId = '';
  }
  const details = connection.connected
    ? `<div class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">Live instances</p><h2>Connected places</h2><p>Returned by Roblox Studio’s own list_roblox_studios operation.</p></div><div class="button-row"><button class="button secondary" type="button" data-action="refresh-studios">Refresh list</button><button class="button danger" type="button" data-action="disconnect-studio">Disconnect monitor</button></div></div>${studioInstances.length ? studioInstances.map(studioRow).join('') : emptyState('MCP process answered, but no place is listed', 'Open a place and enable Studio as an MCP server in the Assistant settings.')}</div>`
    : `<div class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">Local stdio bridge</p><h2>Connect to the actual Studio session</h2><p>The Lab starts Roblox’s installed mcp.bat process and verifies its tool list and open instances.</p></div></div><div class="callout">This dashboard only exposes named read operations. Script editing, asset uploads, publishing, account changes, and player data stay outside its API.</div><div class="button-row section-gap"><button class="button" type="button" data-action="connect-studio">Connect official MCP</button><span class="tag ${data.launcherInstalled ? '' : 'warn'}"><i class="status-dot"></i>${data.launcherInstalled ? 'LAUNCHER FOUND' : 'LAUNCHER MISSING'}</span></div></div>`;
  const inventoryRows = inventory?.tools?.map((tool) => `<article class="engine-member"><div><strong>${escapeHtml(tool.name)}</strong><span class="tag ${tool.dashboardCallable ? '' : 'warn'}">${tool.dashboardCallable ? 'READ ONLY ROUTE' : 'NOT EXPOSED'}</span><code>${tool.available ? 'AVAILABLE' : 'UNAVAILABLE'}</code></div>${tool.description ? `<p>${escapeHtml(tool.description)}</p>` : ''}<small>Class: ${escapeHtml(tool.operationClass)} · ${escapeHtml(tool.restriction)}</small>${tool.inputSchema ? `<details class="studio-schema"><summary>Input schema · ${escapeHtml(tool.inputSchemaStatus)}</summary><pre class="mono-block">${escapeHtml(JSON.stringify(tool.inputSchema, null, 2))}</pre></details>` : `<p class="small">Input schema ${escapeHtml(tool.inputSchemaStatus)}.</p>`}</article>`).join('') ?? '';
  const toolInventoryPanel = `<section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">MCP CAPABILITY INVENTORY</p><h2>Discovered Studio tools</h2><p>This is the actual tools/list result. Only explicitly named read routes are callable from the Lab; other discovered tools stay blocked.</p></div><span class="tag ${connection.connected ? '' : 'off'}"><i class="status-dot"></i>${connection.connected ? `${inventory?.discoveredToolCount ?? 0} DISCOVERED` : 'NOT CONNECTED'}</span></div>${connection.connected && inventoryRows ? `<div class="engine-members">${inventoryRows}</div>` : emptyState('Tool inventory unavailable', 'Connect to Roblox Studio to read the current server tool names and input schemas.')}</section>`;
  view.innerHTML = `${header('Roblox Studio', 'FIRST-PARTY / LIVE SESSION', 'Connect the local MCP server built into Roblox Studio. The Lab confirms a connection only after the server responds and a real instance list is returned.')}
    <section class="split-grid">
      <article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Connection state</p><h2>${connection.connected ? 'MCP server is answering' : connection.state === 'error' ? 'Connection failed' : 'Disconnected'}</h2><p>The process state below comes from an MCP handshake, not Studio process detection.</p></div>${statusTag(connection.state, String(connection.state).replace('_', ' '))}</div>
        <div class="status-row"><span class="status-icon ${connection.connected ? '' : 'warn'}">${connection.connected ? '✓' : '!'}</span><div class="status-copy"><strong>Official launcher</strong><small>${escapeHtml(data.launcherInstalled ? 'Roblox mcp.bat is present' : 'mcp.bat was not found')}</small></div><span class="status-value">${data.launcherInstalled ? 'FOUND' : 'MISSING'}</span></div>
        <div class="status-row"><span class="status-icon ${connection.connected ? '' : 'warn'}">${connection.connected ? '✓' : '·'}</span><div class="status-copy"><strong>Protocol</strong><small>${escapeHtml(connection.protocolEra ? `${connection.protocolEra} / ${connection.protocolVersion}` : 'No negotiation completed')}</small></div><span class="status-value">${connection.connected ? 'ACTIVE' : 'OFFLINE'}</span></div>
        ${connection.error ? `<div class="error-card section-gap">${escapeHtml(connection.error)}</div>` : ''}
      </article>
      <article class="panel"><div class="panel-heading"><div><p class="panel-kicker">How access works</p><h2>Explicit surfaces</h2></div></div>
        <div class="status-row"><span class="status-icon">R</span><div class="status-copy"><strong>Lab monitor</strong><small>Local stdio; fixed read-only operations</small></div><span class="status-value">THIS APP</span></div>
        <div class="status-row"><span class="status-icon">C</span><div class="status-copy"><strong>ChatGPT Studio tools</strong><small>Roblox official plugin / Quick Connect</small></div><span class="status-value">SET UP IN STUDIO</span></div>
        <p class="small section-gap">To load editing tools in ChatGPT, enable Studio as an MCP server in Assistant settings and use Quick Connect for ChatGPT (codex), then open a new chat. Keep Open Cloud permissions scoped to each task.</p>
      </article>
    </section>${details}${toolInventoryPanel}`;
}

async function requireStudio() {
  await loadStudios();
  if (!selectedStudioId) throw new Error('No Roblox Studio place is listed by the connected MCP server.');
}

async function renderExplorer() {
  const connection = await api('/api/studio');
  if (connection.connection.connected) {
    try { await loadStudios(); } catch { studioInstances = []; }
  } else studioInstances = [];
  view.innerHTML = `${header('Experience explorer', 'DATAMODEL / DEPENDENCIES', 'Inspect the hierarchy that is open in Studio. Tree data is fetched live; the Lab never substitutes a sample tree for a disconnected session.')}
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">DataModel</p><h2>Live instance hierarchy</h2><p>Choose an open Studio instance and a depth limit. The response is the actual MCP result.</p></div>${statusTag(connection.connection.state, connection.connection.connected ? 'MCP CONNECTED' : 'MCP DISCONNECTED')}</div>
      ${studioInstances.length ? `<div class="form-row">${studioPicker()}<label class="sr-only" for="datamodel-type">DataModel</label><select id="datamodel-type" class="field select"><option value="Edit" selected>Edit DataModel</option><option value="Client">Client DataModel</option><option value="Server">Server DataModel</option></select><label class="sr-only" for="tree-depth">Tree depth</label><select id="tree-depth" class="field select"><option value="2">Depth 2</option><option value="4" selected>Depth 4</option><option value="6">Depth 6</option><option value="8">Depth 8</option><option value="10">Depth 10</option></select><button class="button" type="button" data-action="load-tree">Read live tree</button></div><div id="tree-result">${emptyState('Ready to inspect', 'Choose an Edit, Client, or Server DataModel to inspect.')}</div>` : emptyState('Studio data is unavailable', 'Connect the official MCP server and open a place in Roblox Studio before reading the hierarchy.')}
    </section>`;
  bindStudioPicker();
}

function engineClassCard(item) {
  return `<button class="doc-link" type="button" data-action="select-engine-class" data-class="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.domain)}</small></button>`;
}

function engineMembersMarkup(data) {
  const groups = Object.entries(data.members).filter(([, members]) => members.length);
  if (!groups.length) return emptyState('No matching members', 'Try a broader property, method, event, or type name.');
  return groups.map(([kind, members]) => `<section class="engine-section"><h3>${escapeHtml(kind)} <small>${members.length}${data.search ? ' MATCHES' : ' SHOWN'}</small></h3>${members.slice(0, 14).map((member) => `<article class="engine-member"><div><strong>${escapeHtml(member.name)}</strong>${member.type ? `<code>${escapeHtml(member.type)}</code>` : ''}${member.deprecated ? '<span class="severity high">DEPRECATED</span>' : ''}</div>${member.summary ? `<p>${escapeHtml(member.summary)}</p>` : ''}${member.threadSafety ? `<small>Thread safety: ${escapeHtml(member.threadSafety)}</small>` : ''}</article>`).join('')}${members.length > 14 ? `<p class="small">Showing 14 of ${members.length} returned. Add a symbol search to narrow the list.</p>` : ''}</section>`).join('');
}

async function loadEngineReference(className, search = '') {
  const target = document.querySelector('#engine-result');
  if (!target) return;
  target.innerHTML = '<div class="loading-state"><span class="loader"></span><span>Retrieving current Roblox API reference…</span></div>';
  const data = await api(`/api/engine/class?name=${encodeURIComponent(className)}&q=${encodeURIComponent(search)}`);
  target.innerHTML = `<div class="panel-heading"><div><p class="panel-kicker">${escapeHtml(data.source)} · ${escapeHtml(data.class)}</p><h2>${escapeHtml(data.class)}</h2><p>${escapeHtml(data.summary || 'No class summary is present in the current reference source.')}</p></div><a class="doc-link external-doc" href="${escapeHtml(data.sourceUrl)}" target="_blank" rel="noopener noreferrer">Creator Hub ↗</a></div>
    <div class="engine-meta"><span>INHERITS ${escapeHtml(data.inherits.join(' ← ') || '—')}</span><span>${escapeHtml(data.returnedMembers)} / ${escapeHtml(data.totalMembers)} MEMBERS${data.search ? ' MATCHED' : ''}</span><span>FETCHED ${escapeHtml(new Date(data.retrievedAt).toLocaleString())}</span></div>
    <div class="engine-members">${engineMembersMarkup(data)}</div>
    <p class="small">Source: <a href="${escapeHtml(data.rawSourceUrl)}" target="_blank" rel="noopener noreferrer">official Roblox Creator Docs YAML ↗</a>${data.sourceRevision ? ` · ETag ${escapeHtml(data.sourceRevision)}` : ''} · cache lifetime ${escapeHtml(data.cacheTtlSeconds)}s.</p>`;
}

async function renderEngine() {
  const catalog = await api('/api/engine/catalog');
  const classes = catalog.classes.map(engineClassCard).join('');
  view.innerHTML = `${header('Roblox engine reference', 'OFFICIAL API / CURRENT DOCS', 'Retrieve live class summaries and member signatures from Roblox Creator Docs. Results show their source and retrieval time; open the linked page for full descriptions and examples.')}
    <section class="split-grid engine-layout"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Reference lookup</p><h2>Search a class</h2><p>Any current engine class name can be queried. Search narrows properties, methods, events, and callbacks.</p></div><span class="tag"><i class="status-dot"></i>ROBLOX SOURCE</span></div>
      <div class="form-row"><label class="sr-only" for="engine-class-input">Roblox class name</label><input id="engine-class-input" class="field" maxlength="64" value="Workspace" placeholder="Workspace"><label class="sr-only" for="engine-search-input">Member search</label><input id="engine-search-input" class="field" maxlength="100" placeholder="Member name, type, or summary"><button class="button" type="button" data-action="lookup-engine">Look up</button></div>
      <div class="panel-heading section-gap"><div><p class="panel-kicker">COMMON API SURFACES</p><h2>Class catalog</h2></div><span class="tag">${catalog.classes.length} STARTING POINTS</span></div><div class="engine-catalog">${classes}</div>
    </article><article id="engine-result" class="panel"><div class="loading-state"><span class="loader"></span><span>Retrieving current Roblox API reference…</span></div></article></section>`;
  try { await loadEngineReference('Workspace'); } catch (error) { document.querySelector('#engine-result').innerHTML = `<div class="error-card">${escapeHtml(error.message)}</div><p class="small section-gap">The official reference service is unavailable right now. Try again when network access returns.</p>`; }
}

function bindStudioPicker() {
  document.querySelector('#studio-picker')?.addEventListener('change', (event) => { selectedStudioId = event.target.value; });
}

async function renderAssets() {
  const data = await api('/api/assets');
  const assets = data.assets;
  const list = assets.map((asset) => `<div class="status-row"><span class="status-icon">◇</span><div class="status-copy"><strong>${escapeHtml(asset.path)}</strong><small>${escapeHtml(bytes(asset.size))} · modified ${escapeHtml(new Date(asset.modifiedAt).toLocaleDateString())}</small></div><span class="status-value">LOCAL</span></div>`).join('');
  view.innerHTML = `${header('Asset library', 'SOURCE / RIGHTS / BUDGET', 'A provenance-first inventory of files inside assets/. External Creator Store and generated assets are never shown as local until they are actually saved here.')}
    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Local asset files</p><h2>Available on disk</h2><p>Each entry is a real file with size and modified time.</p></div><span class="tag ${assets.length ? '' : 'off'}"><i class="status-dot"></i>${assets.length} FILES</span></div>
      ${assets.length ? list : emptyState('No assets have been catalogued', 'Export Blender or GIMP work into assets/, then add its source, license, dimensions, and optimization notes to the asset ledger.')}
    </article><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Provenance gate</p><h2>Before an asset enters a place</h2></div></div>
      <div class="status-row"><span class="status-icon warn">1</span><div class="status-copy"><strong>Source</strong><small>Creator, origin, and date</small></div></div><div class="status-row"><span class="status-icon warn">2</span><div class="status-copy"><strong>Rights</strong><small>License and usage permission</small></div></div><div class="status-row"><span class="status-icon warn">3</span><div class="status-copy"><strong>Technical budget</strong><small>Triangles, texture size, collision, LOD</small></div></div>
      <p class="small section-gap">Asset upload and purchase actions are not enabled in this dashboard.</p>
    </article></section>`;
}

function selectedValues(select) {
  return [...(select?.selectedOptions ?? [])].map((option) => option.value).filter(Boolean);
}

function taskTransitionButton(plan, task, nextStatus, label, secondary = false) {
  return `<button class="button ${secondary ? 'secondary' : ''}" type="button" data-action="transition-task" data-plan-id="${escapeHtml(plan.id)}" data-task-id="${escapeHtml(task.id)}" data-next-status="${escapeHtml(nextStatus)}" data-revision="${escapeHtml(plan.revision)}">${escapeHtml(label)}</button>`;
}

function renderTaskCard(plan, task) {
  const safeTaskKey = task.id.replaceAll(/[^a-z0-9-]/g, '-');
  const execution = task.execution;
  let actions = '';
  if (task.status === 'proposed') actions = taskTransitionButton(plan, task, 'approved', 'Approve task');
  if (task.status === 'approved') actions = '<p class="small">Approved and ready. The assigned owner can claim this task through the Lab Tasks MCP connection.</p>';
  if (task.status === 'blocked') actions = `<p class="small">Execution is stopped. Review the reason above, then resume explicitly.</p>${taskTransitionButton(plan, task, 'in_progress', 'Resume task')}`;
  if (task.status === 'failed') actions = taskTransitionButton(plan, task, 'approved', 'Reopen task');
  if (task.status === 'in_progress') actions = `<p class="small">${execution?.activeRole === 'owner' ? `Owner process ${escapeHtml(execution.activeProcessId)} holds the task claim.` : 'The owner can claim this task through MCP.'}${execution?.attemptCount ? ` Attempt ${escapeHtml(execution.attemptCount)}.` : ''}</p><label class="task-field"><span>Stop reason and recovery step</span><input class="field" type="text" maxlength="2000" data-block-reason="true" placeholder="Required to revoke a claim"/></label>${taskTransitionButton(plan, task, 'blocked', 'Stop task', true)}`;
  if (task.status === 'review') actions = `<p class="small">${execution?.activeRole === 'reviewer' ? `Reviewer process ${escapeHtml(execution.activeProcessId)} holds the review claim.` : `Submitted and waiting for ${escapeHtml(task.reviewerId)} in a separate MCP process.`}${execution?.validationStatus ? ` Latest fixed validation: ${escapeHtml(execution.validationStatus)}${execution.validationCheckedAt ? ` at ${escapeHtml(new Date(execution.validationCheckedAt).toLocaleString())}` : ''}.` : ''}</p><label class="task-field"><span>Stop reason and recovery step</span><input class="field" type="text" maxlength="2000" data-block-reason="true" placeholder="Required to revoke a claim"/></label>${taskTransitionButton(plan, task, 'blocked', 'Stop task', true)}`;
  return `<article class="task-card" data-task-card="${escapeHtml(task.id)}" data-reviewer-id="${escapeHtml(task.reviewerId)}"><div class="task-card-heading"><div><p class="panel-kicker">${escapeHtml(task.ownerId)} → ${escapeHtml(task.reviewerId)}</p><h4>${escapeHtml(task.title)}</h4><p>${escapeHtml(task.description)}</p></div>${statusTag(task.status, task.status.replaceAll('_', ' ').toUpperCase())}</div>
    <div class="task-meta"><span>${escapeHtml(task.capabilityIds.join(', '))}</span><span>${escapeHtml(task.knowledgeIds?.length ? task.knowledgeIds.join(', ') : 'No linked knowledge records')}</span></div>
    ${task.artifacts?.length ? `<div class="task-artifact-grid">${task.artifacts.map((artifact) => `<div class="task-artifact"><strong>${escapeHtml(artifact.type)}</strong><small>${escapeHtml(artifact.reference ?? 'Output not linked')}${task.status === 'review' ? ' · STAGED' : ''}</small></div>`).join('')}</div>` : ''}
    ${task.reason ? `<p class="task-reason">${escapeHtml(task.reason)}</p>` : ''}${actions ? `<div class="task-actions">${actions}</div>` : ''}
    <div class="task-handoff-row"><button class="button secondary" type="button" data-action="load-task-handoff" data-plan-id="${escapeHtml(plan.id)}" data-task-id="${escapeHtml(task.id)}" data-target="handoff-${safeTaskKey}">Open agent handoff</button><button class="button secondary" type="button" data-action="copy-task-handoff" data-target="handoff-${safeTaskKey}">Copy handoff</button></div>
    <textarea id="handoff-${safeTaskKey}" class="task-handoff" aria-label="Structured agent handoff" readonly hidden></textarea></article>`;
}

async function refreshTaskAssignmentOptions() {
  const capabilitySelect = document.querySelector('#task-capabilities');
  const ownerSelect = document.querySelector('#task-owner');
  const status = document.querySelector('#task-match-status');
  if (!capabilitySelect || !ownerSelect) return;
  const capabilityIds = selectedValues(capabilitySelect);
  if (!capabilityIds.length) {
    taskAssignmentCandidates = [];
    ownerSelect.innerHTML = '<option value="">Select a required capability first</option>';
    ownerSelect.disabled = true;
    status.textContent = 'Choose the capabilities this task needs; the Lab will show only owners with a compatible reviewer.';
    populateTaskContractOptions();
    return;
  }
  const query = new URLSearchParams();
  capabilityIds.forEach((id) => query.append('capability_id', id));
  const result = await api(`/api/specialists?${query}`);
  taskAssignmentCandidates = result.matches;
  ownerSelect.innerHTML = result.matches.length
    ? result.matches.map((item) => `<option value="${escapeHtml(item.specialist.id)}">${escapeHtml(item.specialist.displayName)} · ${escapeHtml(item.specialist.division)}</option>`).join('')
    : '<option value="">No complete owner and reviewer match</option>';
  ownerSelect.disabled = result.matches.length === 0;
  status.textContent = result.matches.length
    ? `${result.matches.length} specialist match${result.matches.length === 1 ? '' : 'es'} cover every selected capability.`
    : 'No registered specialist covers all selected capabilities. Split the request into separately owned tasks.';
  populateTaskContractOptions();
}

function populateTaskContractOptions() {
  const ownerId = document.querySelector('#task-owner')?.value;
  const owner = taskAssignmentCandidates.find((item) => item.specialist.id === ownerId);
  const outputs = document.querySelector('#task-outputs');
  const inputs = document.querySelector('#task-inputs');
  const reviewer = document.querySelector('#task-reviewer');
  if (!owner) {
    if (outputs) outputs.innerHTML = '<option value="">Select an eligible owner first</option>';
    if (inputs) inputs.innerHTML = '';
    if (reviewer) reviewer.innerHTML = '<option value="">No reviewer available</option>';
    return;
  }
  outputs.innerHTML = owner.specialist.outputArtifactTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type.replaceAll('-', ' '))}</option>`).join('');
  inputs.innerHTML = owner.specialist.inputArtifactTypes.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type.replaceAll('-', ' '))}</option>`).join('');
  const allSpecialists = new Map(taskSpecialists.map((item) => [item.specialist.id, item.specialist]));
  reviewer.innerHTML = owner.reviewerIds.map((id) => {
    const item = allSpecialists.get(id);
    return `<option value="${escapeHtml(id)}">${escapeHtml(item?.displayName ?? id)}</option>`;
  }).join('');
}

function renderTaskPlans(plans) {
  if (!plans.length) return emptyState('No project tasks yet', 'Create a scoped handoff above. The Lab saves each plan in the selected project and keeps execution evidence with the task.');
  return `<div class="task-plans">${plans.map((plan) => `<details class="task-plan" open><summary><span><strong>${escapeHtml(plan.title)}</strong><small>${escapeHtml(plan.summary)}</small></span>${statusTag(plan.status, plan.status.replaceAll('_', ' ').toUpperCase())}</summary>
    <div class="task-plan-meta"><span>Revision ${escapeHtml(plan.revision)}</span><span>${escapeHtml(plan.tasks.length)} task${plan.tasks.length === 1 ? '' : 's'}</span><span>Updated ${escapeHtml(new Date(plan.updatedAt).toLocaleString())}</span></div>
    ${plan.tasks.map((task) => renderTaskCard(plan, task)).join('')}</details>`).join('')}</div>`;
}

async function renderAgents() {
  const [skillsData, projectsData, knowledgeData, specialistsData] = await Promise.all([
    api('/api/skills'), api('/api/projects'), api(knowledgeSearchUrl({ ...knowledgeFilters, q: '', kind: '', family_id: '', mechanic_id: '', platform_state: '', maturity: '' })), api('/api/specialists?limit=100'),
  ]);
  const projects = projectsData.projects;
  if (!selectedProject || !projects.some((project) => project.name === selectedProject)) selectedProject = projects[0]?.name ?? '';
  taskSpecialists = specialistsData.matches;
  const capabilities = [...new Set(taskSpecialists.flatMap((item) => item.specialist.capabilityIds))].sort();
  const planData = selectedProject ? await api(`/api/task-plans?project=${encodeURIComponent(selectedProject)}`) : { plans: [] };
  const skillItems = skillsData.skills.map((item) => `<button class="doc-link" type="button" data-action="read-library" data-kind="skills" data-path="${escapeHtml(item.path.replace(/^skills\//, ''))}"><span>${escapeHtml(item.path.replace(/^skills\//, ''))}</span><small>${escapeHtml(bytes(item.size))} · OPEN</small></button>`).join('');
  const projectOptions = projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.displayName ?? project.name)}</option>`).join('');
  const capabilityOptions = capabilities.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
  const knowledgeOptions = knowledgeData.matches.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.id)} · ${escapeHtml(record.summary.slice(0, 90))}</option>`).join('');
  view.innerHTML = `${header('Agent workbench', 'TASKS / OWNERSHIP / REVIEW', 'Approve scoped work, then let assigned AI clients execute through the Lab’s local Tasks MCP connection. Outputs stay staged until a separate reviewer process accepts them.')}
    <section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">Create a task handoff</p><h2>Project work item</h2><p>For cross-discipline work, split the scope into separately owned tasks. Knowledge records are snapshotted into the handoff with their provenance.</p></div><span class="tag"><i class="status-dot"></i>${escapeHtml(taskSpecialists.length)} REGISTERED SPECIALISTS</span></div>
      ${projects.length ? `<div class="task-form-grid">
        <label class="task-field"><span>Project</span><select id="task-project" class="field select">${projectOptions}</select></label>
        <label class="task-field"><span>Plan title</span><input id="task-brief-title" class="field" type="text" maxlength="200" placeholder="Tactical combat study"/></label>
        <label class="task-field task-field-wide"><span>Plan summary</span><textarea id="task-brief-summary" class="field" maxlength="4000" rows="2" placeholder="What project outcome does this work support?"></textarea></label>
        <label class="task-field"><span>Task title</span><input id="task-title" class="field" type="text" maxlength="200" placeholder="Specify the combat loop"/></label>
        <label class="task-field task-field-wide"><span>Task and acceptance detail</span><textarea id="task-description" class="field" maxlength="4000" rows="3" placeholder="State the expected behavior, dependencies, and reviewable result."></textarea></label>
        <label class="task-field"><span>Required specialist capabilities</span><select id="task-capabilities" class="field select" multiple size="7">${capabilityOptions}</select></label>
        <label class="task-field"><span>Relevant knowledge records</span><select id="task-knowledge" class="field select" multiple size="7">${knowledgeOptions}</select></label>
        <p id="task-match-status" class="small task-field-wide">Choose the capabilities this task needs; the Lab will show only owners with a compatible reviewer.</p>
        <label class="task-field"><span>Specialist owner</span><select id="task-owner" class="field select" disabled><option value="">Select a required capability first</option></select></label>
        <label class="task-field"><span>Independent reviewer</span><select id="task-reviewer" class="field select"><option value="">No reviewer available</option></select></label>
        <label class="task-field"><span>Expected output artifacts</span><select id="task-outputs" class="field select" multiple size="6"><option value="">Select an eligible owner first</option></select></label>
        <label class="task-field"><span>Required input artifacts</span><select id="task-inputs" class="field select" multiple size="6"></select></label>
        <label class="task-field"><span>Read ownership paths</span><textarea id="task-read-paths" class="field" rows="2" placeholder="projects-relative/path, one per line"></textarea></label>
        <label class="task-field"><span>Write ownership paths</span><textarea id="task-write-paths" class="field" rows="2" placeholder="src/server/Module.luau, one per line"></textarea></label>
      </div><div class="button-row section-gap"><button class="button" type="button" data-action="create-task-plan">Create proposed task</button><span class="small">Creation saves a proposed task. Approve it here, then connect an assigned owner and reviewer as separate MCP processes.</span></div>` : emptyState('Create a project first', 'Task ownership and artifacts are stored inside a selected local project.')}
    </section>
    <section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">Project execution state</p><h2>${escapeHtml(selectedProject || 'No project selected')}</h2><p>The MCP owner stages contracted files. A separate reviewer inspects them; acceptance checks hashes, integrates outputs, and writes review evidence.</p></div><button class="button secondary" type="button" data-action="refresh">Refresh tasks</button></div>${renderTaskPlans(planData.plans)}</section>
    <section class="split-grid section-gap"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Specialist contracts</p><h2>Role playbooks</h2><p>These are source files that the Lab includes in each handoff.</p></div><span class="tag"><i class="status-dot"></i>${skillsData.skills.length} FILES</span></div>${skillsData.skills.length ? `<div class="doc-list">${skillItems}</div>` : emptyState('No specialist skills', 'No role contracts were discovered under skills/.')}</article>
    <article id="library-reader" class="panel"><div class="panel-heading"><div><p class="panel-kicker">Handoff reader</p><h2>Structured task context</h2></div></div>${emptyState('No handoff opened', 'Open a task handoff to inspect its owner contract, reviewer contract, knowledge snapshot, and permissions.')}</article></section>`;

  document.querySelector('#task-project')?.addEventListener('change', (event) => {
    selectedProject = event.target.value;
    void renderAgents();
  });
  document.querySelector('#task-capabilities')?.addEventListener('change', () => { void refreshTaskAssignmentOptions().catch((error) => showNotice(error.message, true)); });
  document.querySelector('#task-owner')?.addEventListener('change', populateTaskContractOptions);
}

async function renderDesign() {
  const [knowledge, documents] = await Promise.all([
    api(knowledgeSearchUrl()),
    api('/api/library?kind=docs'),
  ]);
  const docs = documents.files.filter((item) => item.path.includes('/templates/') || item.path.includes('/showcase/'));
  const items = docs.map((item) => `<button class="doc-link" type="button" data-action="read-library" data-kind="docs" data-path="${escapeHtml(item.path.replace(/^docs\//, ''))}"><span>${escapeHtml(item.path.replace(/^docs\//, ''))}</span><small>${escapeHtml(bytes(item.size))} · OPEN</small></button>`).join('');
  const kindOptions = [
    ['game-family', 'Game families'], ['mechanic', 'Mechanics'], ['visual-style', 'Visual styles'],
    ['animation-domain', 'Animation domains'], ['engine-capability', 'Engine capabilities'],
    ['product-pattern', 'Product patterns'], ['production-pattern', 'Production patterns'], ['failure-pattern', 'Failure patterns'],
  ].map(([value, label]) => `<option value="${value}" ${knowledgeFilters.kind === value ? 'selected' : ''}>${label}</option>`).join('');
  const platformOptions = ['released', 'beta', 'experimental', 'announced', 'delayed', 'deprecated', 'unknown', 'not-applicable']
    .map((value) => `<option value="${value}" ${knowledgeFilters.platform_state === value ? 'selected' : ''}>${value}</option>`).join('');
  const maturityOptions = ['L1', 'L2', 'L3', 'L4']
    .map((value) => `<option value="${value}" ${knowledgeFilters.maturity === value ? 'selected' : ''}>${value}</option>`).join('');
  view.innerHTML = `${header('Roblox game intelligence', 'GENRES / MECHANICS / CREATIVE / ENGINE', 'Search the versioned local knowledge registry across game families, hybrid mechanics, art direction, animation, and Roblox platform capabilities. Records expose sources and maturity; search results do not claim that an agent has executed or certified the work.')}
    <section class="panel">
      <div class="panel-heading"><div><p class="panel-kicker">Structured knowledge registry</p><h2>Find the systems an experience needs</h2><p>Use multi-label family and mechanic links to explore combinations. A missing record stays visible as a knowledge gap.</p></div><span class="tag"><i class="status-dot"></i>${escapeHtml(knowledge.total ?? knowledge.matches.length)} RECORDS</span></div>
      <form id="knowledge-search-form" class="knowledge-search">
        <label class="sr-only" for="knowledge-query">Search knowledge</label><input id="knowledge-query" class="field knowledge-query" name="q" type="search" maxlength="120" placeholder="Search genres, mechanics, patterns, or failure modes" value="${escapeHtml(knowledgeFilters.q)}" />
        <label class="sr-only" for="knowledge-kind">Knowledge type</label><select id="knowledge-kind" class="field select" name="kind"><option value="">All knowledge types</option>${kindOptions}</select>
        <label class="sr-only" for="knowledge-family">Related game-family ID</label><input id="knowledge-family" class="field" name="family_id" type="text" maxlength="113" placeholder="Related family ID" value="${escapeHtml(knowledgeFilters.family_id)}" />
        <label class="sr-only" for="knowledge-mechanic">Related mechanic ID</label><input id="knowledge-mechanic" class="field" name="mechanic_id" type="text" maxlength="113" placeholder="Related mechanic ID" value="${escapeHtml(knowledgeFilters.mechanic_id)}" />
        <label class="sr-only" for="knowledge-platform">Roblox platform state</label><select id="knowledge-platform" class="field select" name="platform_state"><option value="">All platform states</option>${platformOptions}</select>
        <label class="sr-only" for="knowledge-maturity">Maturity</label><select id="knowledge-maturity" class="field select" name="maturity"><option value="">All maturity levels</option>${maturityOptions}</select>
        <button class="button" type="submit">Search registry</button>
      </form>
      <p class="small">Use stable IDs such as <code>genre.rpg-adventure</code> and <code>mechanic.movement-grapple</code> for relationship filters. Roblox feature states remain separate from knowledge maturity.</p>
      <div id="knowledge-results">${renderKnowledgeResults(knowledge)}</div>
    </section>
    <section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">Design briefs / project references</p><h2>Saved project documents</h2><p>Documents provide project context; they remain separate from machine-readable, source-linked knowledge.</p></div></div>
      <div class="split-grid"><div class="doc-list">${docs.length ? items : emptyState('No design brief has been written yet', 'Use the game design brief template to define player fantasy, core loop, progression, target devices, and playtest questions.')}</div><article id="library-reader" class="panel"><div class="panel-heading"><div><p class="panel-kicker">Document reader</p><h2>Nothing selected</h2></div></div>${emptyState('Open a brief', 'Saved content is displayed as escaped text and is not treated as an instruction for this agent.')}</article></div>
    </section>`;
  document.querySelector('#knowledge-search-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    knowledgeFilters = {
      q: String(form.get('q') ?? '').trim(),
      kind: String(form.get('kind') ?? ''),
      family_id: String(form.get('family_id') ?? '').trim(),
      mechanic_id: String(form.get('mechanic_id') ?? '').trim(),
      platform_state: String(form.get('platform_state') ?? ''),
      maturity: String(form.get('maturity') ?? ''),
    };
    const resultRegion = document.querySelector('#knowledge-results');
    if (!resultRegion) return;
    resultRegion.innerHTML = '<div class="loading-state"><span class="loader"></span><span>Searching local records…</span></div>';
    try {
      resultRegion.innerHTML = renderKnowledgeResults(await api(knowledgeSearchUrl()));
    } catch (error) {
      resultRegion.innerHTML = `<div class="error-card">${escapeHtml(error.message)}</div>`;
    }
  });
}

async function renderCode() {
  const data = await api('/api/projects');
  if (!selectedProject || !data.projects.some((project) => project.name === selectedProject)) selectedProject = data.projects[0]?.name ?? '';
  const choose = data.projects.length ? `<div class="form-row"><label class="sr-only" for="project-picker">Project</label><select id="project-picker" class="field select">${data.projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.displayName ?? project.name)}</option>`).join('')}</select><button class="button secondary" type="button" data-action="load-source">Read source tree</button><button class="button secondary" type="button" data-action="run-quality">Run offline checks</button></div><div id="source-result">${emptyState('Choose a project', 'The Lab will display actual source files and static review output for the selected project.')}</div>` : emptyState('No project source is available', 'Create a project from the Projects view, then browse the copied Luau modules here.');
  view.innerHTML = `${header('Code & architecture', 'LUAAU / BOUNDARIES / SOURCE', 'Browse source inside projects/ and run local static checks. File reads stay under the selected project directory and text size limit.')}
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">Workspace source</p><h2>Project code</h2><p>Static review is a heuristic; it does not certify runtime behavior.</p></div></div>${choose}</section>`;
  document.querySelector('#project-picker')?.addEventListener('change', (event) => { selectedProject = event.target.value; });
}

async function renderPlaytest() {
  const data = await api('/api/studio');
  if (data.connection.connected) {
    try { await loadStudios(); } catch { studioInstances = []; }
  } else studioInstances = [];
  view.innerHTML = `${header('Playtesting', 'RUN / OBSERVE / REPEAT', 'A test result needs a real Studio session and captured console evidence. The Lab reports the official tool state and will not convert missing evidence into a pass.')}
    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Studio test gate</p><h2>${data.connection.connected ? 'MCP connected' : 'Blocked: no live Studio session'}</h2><p>Process detection alone is not playtest evidence.</p></div>${statusTag(data.connection.state, data.connection.connected ? 'CONNECTED' : 'BLOCKED')}</div>
      ${studioInstances.length ? `<div class="form-row">${studioPicker()}<button class="button secondary" type="button" data-action="read-studio-state">Read play state</button><button class="button secondary" type="button" data-action="read-console">Read console</button></div><div id="playtest-output">${emptyState('No test evidence captured in this session', 'Read state and console after you run a playtest in Roblox Studio.')}</div>` : emptyState('No Studio test session is available', 'Connect the official MCP server, open a local or unpublished test place, and run the playtest in Studio. Do not use a production place for initial verification.')}
    </article><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Certification rule</p><h2>Evidence in sequence</h2></div></div><div class="status-row"><span class="status-icon warn">1</span><div class="status-copy"><strong>Load the intended place</strong><small>Record place name and Studio instance ID</small></div></div><div class="status-row"><span class="status-icon warn">2</span><div class="status-copy"><strong>Run the actual test</strong><small>Check server/client behavior and invalid inputs</small></div></div><div class="status-row"><span class="status-icon warn">3</span><div class="status-copy"><strong>Inspect console and viewport</strong><small>Save result with timestamp and instance ID</small></div></div></article></section>`;
  bindStudioPicker();
}

async function renderVisual() {
  const [data, gallery, projects] = await Promise.all([api('/api/studio'), api('/api/captures'), api('/api/projects')]);
  if (data.connection.connected) {
    try { await loadStudios(); } catch { studioInstances = []; }
  } else studioInstances = [];
  if (!selectedProject || !projects.projects.some((project) => project.name === selectedProject)) selectedProject = projects.projects.find((project) => project.name === 'signal-garden')?.name ?? projects.projects[0]?.name ?? '';
  const captureCards = gallery.captures.map((capture) => `<article class="capture-card"><a href="${escapeHtml(capture.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open full viewport capture"><img src="${escapeHtml(capture.url)}" alt="Roblox Studio viewport captured ${escapeHtml(new Date(capture.capturedAt).toLocaleString())}" loading="lazy"/></a><div class="capture-meta"><strong>${escapeHtml(capture.project ?? 'Unassigned project')}</strong><span>${escapeHtml(new Date(capture.capturedAt).toLocaleString())}</span><small class="review-state">${escapeHtml(capture.assessment?.status ?? 'unreviewed')}${capture.assessment?.note ? ` · ${escapeHtml(capture.assessment.note)}` : ''}</small>${capture.framing?.cameraPosition ? `<small>Camera ${escapeHtml(capture.framing.cameraPosition.join(', '))} → ${escapeHtml(capture.framing.lookAtPosition?.join(', ') ?? 'viewport target')}</small>` : '<small>Studio viewport framing</small>'}<small>Studio ${escapeHtml(capture.studioId)} · ${escapeHtml(bytes(capture.bytes))} · ${escapeHtml(capture.sha256.slice(0, 12))}…</small></div></article>`).join('');
  const signalGardenFrame = selectedProject === 'signal-garden';
  view.innerHTML = `${header('Visual QA', 'VIEWPORT / READABILITY / FRAME', 'Capture the real Studio viewport for review. A screenshot supports visual analysis; it does not prove game correctness or performance.')}
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">Studio viewport</p><h2>Capture actual output</h2><p>Verified viewport images and their Studio provenance are saved in evidence/studio/.</p></div>${statusTag(data.connection.state, data.connection.connected ? 'CONNECTED' : 'BLOCKED')}</div>
      ${studioInstances.length ? `<div class="form-row">${studioPicker()}<label class="sr-only" for="capture-project">Project</label><select id="capture-project" class="field select"><option value="">Unassigned project</option>${projects.projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.displayName ?? project.name)}</option>`).join('')}</select><button class="button" type="button" data-action="capture-viewport">Capture viewport</button></div><div class="form-row"><label class="sr-only" for="camera-position">Camera position, X Y Z</label><input id="camera-position" class="field" type="text" inputmode="decimal" aria-label="Camera position X, Y, Z" placeholder="Camera X,Y,Z" value="${signalGardenFrame ? '115,65,90' : ''}"/><label class="sr-only" for="look-at-position">Look-at position, X Y Z</label><input id="look-at-position" class="field" type="text" inputmode="decimal" aria-label="Look-at position X, Y, Z" placeholder="Look at X,Y,Z" value="${signalGardenFrame ? '0,10,0' : ''}"/></div><p class="small">${signalGardenFrame ? 'Suggested Signal Garden overview framing; the capture remains an actual image from the open Studio place.' : 'Leave camera fields empty to capture the current viewport framing.'}</p><div id="capture-result" class="image-frame">${emptyState('No viewport image captured', 'Capture after the correct place and camera are visible in Studio.')}</div><p id="capture-caption" class="small section-gap"></p>` : emptyState('Viewport capture is blocked', 'Connect Studio MCP and open a place before requesting a screenshot.')}
    </section><section class="panel section-gap"><div class="panel-heading"><div><p class="panel-kicker">EVIDENCE ARCHIVE</p><h2>Viewport captures</h2><p>Local image files with timestamp, Studio instance, project assignment, byte count and SHA-256 digest.</p></div><span class="tag"><i class="status-dot"></i>${gallery.captures.length} SAVED</span></div>${gallery.captures.length ? `<div class="capture-gallery">${captureCards}</div>` : emptyState('No saved viewport captures', 'Capture an open Studio viewport. The image and provenance record will remain available after the browser is closed.')}</section>`;
  bindStudioPicker();
  document.querySelector('#capture-project')?.addEventListener('change', (event) => {
    selectedProject = event.target.value;
    const camera = document.querySelector('#camera-position');
    const lookAt = document.querySelector('#look-at-position');
    if (camera && lookAt) {
      camera.value = selectedProject === 'signal-garden' ? '115,65,90' : '';
      lookAt.value = selectedProject === 'signal-garden' ? '0,10,0' : '';
    }
  });
}

async function renderPerformance() {
  const projects = await api('/api/projects');
  if (!selectedProject || !projects.projects.some((project) => project.name === selectedProject)) selectedProject = projects.projects[0]?.name ?? '';
  if (!selectedProject) {
    view.innerHTML = `${header('Performance', 'FRAME TIME / MEMORY / NETWORK', 'Measure real source and runtime behavior. No device or Studio profile is inferred from code size alone.')}${emptyState('No project is available to measure', 'Create or select a local project first.')}`;
    return;
  }
  const report = await api(`/api/performance?project=${encodeURIComponent(selectedProject)}`);
  const largest = report.source.largestFiles.map((file) => `<div class="status-row"><span class="status-icon">⌁</span><div class="status-copy"><strong>${escapeHtml(file.path)}</strong><small>${escapeHtml(file.lines)} lines · ${escapeHtml(bytes(file.bytes))}</small></div></div>`).join('');
  view.innerHTML = `${header('Performance', 'SOURCE BUDGET / RUNTIME PROFILE', 'Source measurements are local and reproducible. Frame time, memory, network, and device behavior remain unmeasured until a real Studio profile runs on target hardware.')}
    <div class="form-row"><label class="sr-only" for="project-picker">Project</label><select id="project-picker" class="field select">${projects.projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.displayName ?? project.name)}</option>`).join('')}</select><button class="button secondary" type="button" data-action="refresh">Refresh source profile</button></div>
    <section class="metric-grid">${metric('Luau files', report.source.files, 'Read from the selected project')}${metric('Source lines', report.source.lines, 'Current on-disk total')}${metric('Source size', bytes(report.source.bytes), 'UTF-8 file bytes')}${metric('Runtime profile', '—', report.runtime.detail)}</section>
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">Largest Luau files</p><h2>Source review targets</h2></div></div>${report.source.files ? largest : emptyState('No Luau source files found', 'The current project has no .lua or .luau files to measure.')}</section>`;
  document.querySelector('#project-picker')?.addEventListener('change', (event) => { selectedProject = event.target.value; render(); });
}

async function renderSecurity() {
  const projects = await api('/api/projects');
  if (!selectedProject || !projects.projects.some((project) => project.name === selectedProject)) selectedProject = projects.projects[0]?.name ?? '';
  if (!selectedProject) {
    view.innerHTML = `${header('Security', 'TRUST BOUNDARIES / REMOTES / SECRETS', 'Static checks inspect local Luau source for high-risk patterns and areas that need human review.')}${emptyState('No project is available to scan', 'Create or select a local project first.')}`;
    return;
  }
  const report = await api(`/api/quality?project=${encodeURIComponent(selectedProject)}`);
  const findings = report.report.findings.map((finding) => `<div class="finding"><span class="severity ${finding.severity === 'high' ? 'high' : ''}">${escapeHtml(finding.severity)}</span><div><strong>${escapeHtml(finding.title)} <span class="muted mono">${finding.line ? `· ${escapeHtml(finding.file)}:${escapeHtml(finding.line)}` : `· ${escapeHtml(finding.file)}`}</span></strong><p>${escapeHtml(finding.detail)}</p></div><span class="panel-kicker">${escapeHtml(finding.rule)}</span></div>`).join('');
  view.innerHTML = `${header('Security', 'TRUST BOUNDARIES / REMOTES / SECRETS', 'Static checks report specific source patterns for review. A clean heuristic scan is not a security certification.')}
    <div class="form-row"><label class="sr-only" for="project-picker">Project</label><select id="project-picker" class="field select">${projects.projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.displayName ?? project.name)}</option>`).join('')}</select><button class="button secondary" type="button" data-action="run-quality">Re-run checks</button></div>
    <section class="metric-grid">${metric('Luau files scanned', report.report.filesScanned, 'Bounded to local project source')}${metric('High severity', report.report.summary.high, 'Requires manual investigation')}${metric('Review markers', report.report.summary.review, 'Human judgment required')}${metric('Certification', 'NOT ISSUED', 'Static scans cannot certify an experience')}</section>
    <section class="panel"><div class="panel-heading"><div><p class="panel-kicker">${escapeHtml(report.report.summary.status.replaceAll('_', ' '))}</p><h2>Findings</h2><p>${escapeHtml(report.report.limitation)}</p></div></div>${findings || emptyState(report.report.filesScanned ? 'No heuristic findings' : 'Unmeasured: no Luau files found', report.report.filesScanned ? 'This is not a release pass. Run real multiplayer and Studio checks.' : 'Add source files before assessing the project.')}</section>`;
  document.querySelector('#project-picker')?.addEventListener('change', (event) => { selectedProject = event.target.value; render(); });
}

async function renderAnalytics() {
  const projects = await api('/api/projects');
  if (!selectedProject || !projects.projects.some((project) => project.name === selectedProject)) selectedProject = projects.projects[0]?.name ?? '';
  if (!selectedProject) {
    view.innerHTML = `${header('Analytics', 'RETENTION / ENGAGEMENT / HEALTH', 'This local view only displays data files that actually exist. It does not synthesize player metrics or query a live experience.')}${emptyState('No local analytics source', 'Create a project and save a measured export under its analytics/ directory to begin a report.')}`;
    return;
  }
  const data = await api(`/api/analytics?project=${encodeURIComponent(selectedProject)}`);
  const files = data.files.map((file) => `<div class="status-row"><span class="status-icon">⌗</span><div class="status-copy"><strong>${escapeHtml(file.path)}</strong><small>${escapeHtml(bytes(file.size))} · modified ${escapeHtml(new Date(file.modifiedAt).toLocaleDateString())}</small></div></div>`).join('');
  view.innerHTML = `${header('Analytics', 'RETENTION / ENGAGEMENT / HEALTH', 'Player metrics are only reported from project files or an explicitly connected analytics source. This dashboard does not collect player information.')}
    <div class="form-row"><label class="sr-only" for="project-picker">Project</label><select id="project-picker" class="field select">${projects.projects.map((project) => `<option value="${escapeHtml(project.name)}" ${project.name === selectedProject ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}</select></div>
    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Local analytics artifacts</p><h2>Observed files</h2><p>Read from the selected project's analytics folder.</p></div><span class="tag ${data.files.length ? '' : 'off'}"><i class="status-dot"></i>${data.files.length} FILES</span></div>${data.files.length ? files : emptyState('No analytics files', 'No retention, session, conversion, or stability values are reported because there are no measured artifacts.')}</article><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Data policy</p><h2>Minimal collection</h2></div></div><p class="small">Design analytics events around product questions. Keep event payloads aggregate and age-appropriate; do not collect secrets, precise location, chat content, or identity data for product metrics.</p><p class="small">Publishing, Open Cloud access, and live analytics permissions are not requested by this view.</p></article></section>`;
  document.querySelector('#project-picker')?.addEventListener('change', (event) => { selectedProject = event.target.value; render(); });
}

async function renderDocs() {
  const data = await api('/api/library?kind=docs');
  const docs = data.files.map((item) => `<button class="doc-link" type="button" data-action="read-library" data-kind="docs" data-path="${escapeHtml(item.path.replace(/^docs\//, ''))}"><span>${escapeHtml(item.path.replace(/^docs\//, ''))}</span><small>${escapeHtml(bytes(item.size))} · OPEN</small></button>`).join('');
  view.innerHTML = `${header('Documentation', 'ARCHITECTURE / OPERATIONS / STANDARDS', 'Local Markdown files are indexed from docs/. Select a file to read its saved content; the dashboard does not execute or trust the contents.')}
    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Repository reference</p><h2>Documentation index</h2></div><span class="tag"><i class="status-dot"></i>${data.files.length} FILES</span></div>${data.files.length ? `<div class="doc-list">${docs}</div>` : emptyState('No documentation files', 'Project setup and design documents will appear here once written.')}</article><article id="library-reader" class="panel"><div class="panel-heading"><div><p class="panel-kicker">Document reader</p><h2>No document selected</h2></div></div>${emptyState('Open a file', 'The document is shown as escaped text in this local viewer.')}</article></section>`;
}

async function renderSettings() {
  const data = await api('/api/environment');
  const environment = data.environment;
  const hardware = environment.hardware;
  const codex = environment.codex;
  const localAi = environment.localAi;
  const toolRows = Object.entries(environment.tools).map(([name, item]) => toolStatusRow(name, item)).join('');
  const gpuRows = hardware?.gpus?.map((gpu) => {
    const name = gpu.name ?? gpu.Name ?? 'Graphics device';
    const totalMemory = gpu.totalMemoryMiB ?? gpu.TotalMemoryMiB;
    const memory = Number.isFinite(Number(totalMemory)) && Number(totalMemory) > 0 ? ` · ${escapeHtml(totalMemory)} MiB NVIDIA memory` : '';
    return escapeHtml(name) + memory;
  }).join(' · ') ?? 'GPU inventory unavailable';
  const codexServers = codex?.mcpServers?.length ? codex.mcpServers.map((server) => `${escapeHtml(server.name)} (${server.enabled ? 'enabled' : 'disabled'}, ${escapeHtml(server.transport)})`).join(' · ') : 'No MCP server registrations were captured';
  const codexPlugins = codex?.plugins?.length ? codex.plugins.map((plugin) => `${escapeHtml(plugin.id)} ${escapeHtml(plugin.version)} (${plugin.enabled ? 'enabled' : 'disabled'})`).join(' · ') : 'No plugin inventory was captured';
  const localModels = localAi?.models?.length ? localAi.models.map((model) => `${escapeHtml(model.name)} (${escapeHtml(model.size)})`).join(' · ') : 'No local Ollama models returned';
  view.innerHTML = `${header('Diagnostics', 'LOCAL MACHINE / TOOLCHAIN', 'Tool availability is checked live. Hardware, GPU memory, and local model inventory are captured by scripts/doctor.ps1; finding a tool does not prove its workflow works.')}
    <section class="split-grid"><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Windows workstation</p><h2>${escapeHtml(hardware?.os ?? environment.platform)} · ${escapeHtml(hardware?.build ?? environment.arch)}</h2><p>Hardware inventory ${escapeHtml(environment.machineReportCapturedAt ? new Date(environment.machineReportCapturedAt).toLocaleString() : 'not captured')}</p></div></div>
      ${hardware ? `<div class="status-row"><div class="status-copy"><strong>CPU / memory</strong><small>${escapeHtml(hardware.cpu)} · ${escapeHtml(hardware.ramGiB)} GiB installed · ${escapeHtml(hardware.freeDiskGiB)} GiB free on workspace drive</small></div></div><div class="status-row"><div class="status-copy"><strong>Graphics / VRAM</strong><small>${gpuRows}</small></div></div>` : emptyState('Hardware details not captured', 'Run scripts/doctor.ps1 to generate the full Windows report.')}
      <div class="status-row"><div class="status-copy"><strong>Roblox Studio</strong><small>${escapeHtml(environment.robloxStudio.executable ?? 'Not found under the checked Roblox install directory')}</small></div><span class="status-value">${environment.robloxStudio.installed ? 'INSTALLED' : 'NOT FOUND'}</span></div>
      <div class="status-row"><div class="status-copy"><strong>Studio MCP launcher</strong><small>${escapeHtml(environment.robloxStudio.mcpLauncher ?? 'Not found')}</small></div><span class="status-value">${environment.robloxStudio.mcpLauncherInstalled ? 'INSTALLED' : 'NOT FOUND'}</span></div>
    </article><article class="panel"><div class="panel-heading"><div><p class="panel-kicker">Engineering tools</p><h2>Command availability</h2><p>Executable discovery does not claim a tool workflow has been tested.</p></div></div>${toolRows}
      <div class="panel-heading section-gap"><div><p class="panel-kicker">Codex desktop / local models</p><h2>AI workstation integrations</h2><p>Registrations are shown separately from a successful live Studio handshake.</p></div></div>
      <div class="status-row"><div class="status-copy"><strong>Codex MCP registrations</strong><small>${codex ? escapeHtml(codex.status) : 'Run scripts/doctor.ps1 to capture the Codex inventory'} · ${codexServers}</small></div></div>
      <div class="status-row"><div class="status-copy"><strong>Codex plugins</strong><small>${codexPlugins}</small></div></div>
      <div class="status-row"><div class="status-copy"><strong>Local Ollama models</strong><small>${localModels} · inference not run</small></div></div>
    </article></section>`;
}

async function render() {
  const route = (location.hash.slice(1) || 'overview').split('/')[0];
  pageStart(routeTitles[route] ? route : 'overview');
  view.innerHTML = '<div class="loading-state"><span class="loader"></span><span>Reading local data…</span></div>';
  try {
    const page = {
      overview: renderOverview, projects: renderProjects, studio: renderStudio, explorer: renderExplorer, engine: renderEngine,
      assets: renderAssets, agents: renderAgents, design: renderDesign, code: renderCode,
      playtest: renderPlaytest, visual: renderVisual, performance: renderPerformance, security: renderSecurity,
      analytics: renderAnalytics, docs: renderDocs, settings: renderSettings,
    }[route] ?? renderOverview;
    await page();
  } catch (error) {
    view.innerHTML = `${header(routeTitles[route] ? route.replaceAll('-', ' ') : 'Control room', 'LOCAL DATA / REQUEST FAILED', 'The Lab did not receive a valid response for this view.')}
      <div class="error-card">${escapeHtml(error.message)}</div><div class="button-row section-gap"><button class="button secondary" type="button" data-action="refresh">Retry</button></div>`;
  }
}

function renderLibraryText(result) {
  const reader = document.querySelector('#library-reader');
  if (!reader) return;
  reader.innerHTML = `<div class="panel-heading"><div><p class="panel-kicker">${escapeHtml(result.kind)} / ${escapeHtml(result.path)}</p><h2>Saved instructions</h2></div></div><pre class="mono-block">${escapeHtml(result.content)}</pre>`;
}

async function handleAction(actionButton) {
  const action = actionButton.dataset.action;
  if (action === 'refresh') return render();
  if (action === 'create-task-plan') {
    const splitPaths = (value) => value.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean).map((path) => ({ path, mode: 'write' }));
    const readPaths = splitPaths(document.querySelector('#task-read-paths')?.value ?? '').map((item) => ({ ...item, mode: 'read' }));
    const writePaths = splitPaths(document.querySelector('#task-write-paths')?.value ?? '');
    const task = {
      title: document.querySelector('#task-title')?.value.trim() ?? '',
      description: document.querySelector('#task-description')?.value.trim() ?? '',
      capabilityIds: selectedValues(document.querySelector('#task-capabilities')),
      knowledgeIds: selectedValues(document.querySelector('#task-knowledge')),
      inputArtifactTypes: selectedValues(document.querySelector('#task-inputs')),
      outputArtifactTypes: selectedValues(document.querySelector('#task-outputs')),
      ownerId: document.querySelector('#task-owner')?.value || undefined,
      reviewerId: document.querySelector('#task-reviewer')?.value || undefined,
      fileOwnership: [...readPaths, ...writePaths],
    };
    const body = {
      project: document.querySelector('#task-project')?.value ?? selectedProject,
      brief: {
        title: document.querySelector('#task-brief-title')?.value.trim() ?? '',
        summary: document.querySelector('#task-brief-summary')?.value.trim() ?? '',
      },
      tasks: [task],
      unknowns: [],
      assumptions: [],
    };
    const result = await api('/api/task-plans', { method: 'POST', body: JSON.stringify(body) });
    selectedProject = result.plan.project;
    showNotice(`Created proposed work item for ${result.plan.tasks[0].ownerId}, with ${result.plan.tasks[0].reviewerId} assigned to review.`);
    return renderAgents();
  }
  if (action === 'transition-task') {
    const project = selectedProject;
    const planId = actionButton.dataset.planId;
    const taskId = actionButton.dataset.taskId;
    const status = actionButton.dataset.nextStatus;
    const expectedRevision = Number(actionButton.dataset.revision);
    const card = actionButton.closest('[data-task-card]');
    const body = { expectedRevision, status };
    if (status === 'blocked') {
      body.reason = card.querySelector('[data-block-reason]')?.value.trim() ?? '';
      if (!body.reason) throw new Error('Enter the reason and next recovery action before blocking this task.');
    }
    await api(`/api/task-plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', body: JSON.stringify(body) });
    showNotice(status === 'approved' ? 'Task approved and available to the assigned MCP specialist.' : status === 'blocked' ? 'Task stopped and its active local claim was revoked.' : status === 'in_progress' ? 'Task explicitly resumed and ready for the assigned specialist.' : status === 'failed' ? 'Task reopened for approval.' : `Task moved to ${status.replaceAll('_', ' ')}.`);
    return renderAgents();
  }
  if (action === 'load-task-handoff') {
    const query = new URLSearchParams({ project: selectedProject });
    const result = await api(`/api/task-plans/${encodeURIComponent(actionButton.dataset.planId)}/tasks/${encodeURIComponent(actionButton.dataset.taskId)}/handoff?${query}`);
    const target = document.querySelector(`#${actionButton.dataset.target}`);
    if (!target) throw new Error('The handoff reader is not available.');
    target.value = JSON.stringify(result.handoff, null, 2);
    target.hidden = false;
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    showNotice('Loaded the registered owner, reviewer, knowledge snapshot, and operation limits.');
    return;
  }
  if (action === 'copy-task-handoff') {
    const target = document.querySelector(`#${actionButton.dataset.target}`);
    if (!target || !target.value) throw new Error('Open this task’s handoff before copying it.');
    target.hidden = false;
    target.focus();
    target.select();
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(target.value);
        showNotice('Structured handoff copied.');
        return;
      } catch { /* Keep the selected text available for manual copy. */ }
    }
    showNotice('Handoff text is selected; copy it into the chosen agent session.');
    return;
  }
  if (action === 'connect-studio') {
    actionButton.disabled = true;
    try {
      const result = await api('/api/studio/connect', { method: 'POST', body: '{}' });
      studioInstances = result.instances;
      selectedStudioId = studioInstances[0]?.studio_id ?? '';
      showNotice(`Connected to the Roblox Studio MCP server; ${studioInstances.length} instance${studioInstances.length === 1 ? '' : 's'} listed.`);
    } catch (error) {
      showNotice(error.message, true);
    }
    return render();
  }
  if (action === 'disconnect-studio') {
    await api('/api/studio/disconnect', { method: 'POST', body: '{}' });
    studioInstances = [];
    selectedStudioId = '';
    showNotice('Disconnected the Lab monitor. Roblox Studio remains open.');
    return render();
  }
  if (action === 'refresh-studios') return render();
  if (action === 'select-studio') {
    selectedStudioId = actionButton.dataset.id;
    showNotice('Selected the live Studio instance for this session.');
    return render();
  }
  if (action === 'open-project') {
    selectedProject = actionButton.dataset.project;
    location.hash = '#code';
    return;
  }
  if (action === 'build-project') {
    const project = actionButton.dataset.project;
    const resultPanel = document.querySelector('#project-build-result');
    actionButton.disabled = true;
    showNotice(`Building ${project} with the pinned Rojo 7.7.1 workflow…`);
    try {
      const result = await api(`/api/projects/${encodeURIComponent(project)}/build`, { method: 'POST', body: '{}' });
      const operation = result.operation;
      resultPanel.hidden = false;
      resultPanel.innerHTML = `<article class="panel"><div class="panel-heading"><div><p class="panel-kicker">ROJO BUILD · ${escapeHtml(operation.id)}</p><h2>Place file is ready</h2><p>${escapeHtml(operation.rojoVersion)} · ${bytes(operation.output.bytes)} · source ${escapeHtml(operation.sourceDigest.slice(0, 16))}…</p></div><a class="button" href="${escapeHtml(operation.downloadUrl)}">Download .rbxlx</a></div><p class="small mono">SHA-256 ${escapeHtml(operation.output.sha256)}</p><p class="small">Operation ${escapeHtml(operation.status)} in ${escapeHtml(operation.durationMs)} ms. The artifact remains in the Lab runtime build folder.</p></article>`;
      showNotice(`${project} built successfully with Rojo ${operation.rojoVersion}; output hash and source digest are recorded.`);
    } catch (error) {
      resultPanel.hidden = false;
      const diagnostics = error.operation?.diagnostics?.map((item) => `<li>${escapeHtml(item)}</li>`).join('') ?? '';
      resultPanel.innerHTML = `<article class="panel"><div class="panel-heading"><div><p class="panel-kicker">ROJO BUILD · FAILED</p><h2>Build did not complete</h2><p>${escapeHtml(error.message)}</p></div></div>${diagnostics ? `<ul class="small">${diagnostics}</ul>` : ''}<p class="small">No place file is offered for a failed operation.</p></article>`;
      showNotice(error.message, true);
    } finally {
      actionButton.disabled = false;
    }
    return;
  }
  if (action === 'inspect-rojo') {
    const project = actionButton.dataset.project;
    const resultPanel = document.querySelector('#project-build-result');
    actionButton.disabled = true;
    try {
      const result = await api(`/api/projects/${encodeURIComponent(project)}/rojo`);
      const manifest = result.manifest;
      const builds = result.recentBuilds.map((operation) => `<article class="engine-member"><div><strong>${escapeHtml(operation.status.toUpperCase())} · ${escapeHtml(operation.id)}</strong><code>${escapeHtml(operation.rojoVersion ?? 'Rojo unavailable')}</code>${operation.downloadUrl ? `<a class="button secondary" href="${escapeHtml(operation.downloadUrl)}">Download place</a>` : ''}</div><p>${escapeHtml(operation.completedAt ?? operation.startedAt)} · ${escapeHtml(operation.durationMs ?? '—')} ms${operation.output ? ` · ${bytes(operation.output.bytes)} · SHA-256 ${escapeHtml(operation.output.sha256)}` : ''}</p>${operation.failure ? `<p class="small">${escapeHtml(operation.failure.message)}</p>` : ''}</article>`).join('');
      resultPanel.hidden = false;
      resultPanel.innerHTML = `<article class="panel"><div class="panel-heading"><div><p class="panel-kicker">ROJO PROJECT INSPECTION · ${escapeHtml(project)}</p><h2>${escapeHtml(manifest.status.toUpperCase())} manifest · ${escapeHtml(result.rojo.available ? `Rojo ${result.rojo.version}` : 'Rojo unavailable')}</h2><p>${escapeHtml(manifest.name ?? manifest.path)}${manifest.inputFileCount ? ` · ${escapeHtml(manifest.inputFileCount)} files · ${bytes(manifest.inputBytes)} · source ${escapeHtml(manifest.sourceDigest.slice(0, 16))}…` : ''}</p></div></div>${manifest.diagnostics.length ? `<ul class="small">${manifest.diagnostics.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}<div class="engine-members">${builds || emptyState('No build records', 'A build record is written after the first Lab-managed build attempt.')}</div></article>`;
      showNotice(`${project}: ${manifest.status} Rojo configuration; ${result.recentBuilds.length} recent build record${result.recentBuilds.length === 1 ? '' : 's'}.`);
    } finally {
      actionButton.disabled = false;
    }
    return;
  }
  if (action === 'read-library') {
    const kind = actionButton.dataset.kind;
    const relativePath = actionButton.dataset.path;
    activeDocumentKind = kind;
    const result = await api(`/api/library?kind=${encodeURIComponent(kind)}&path=${encodeURIComponent(relativePath)}`);
    renderLibraryText(result);
    return;
  }
  if (action === 'select-engine-class') {
    document.querySelector('#engine-class-input').value = actionButton.dataset.class;
    document.querySelector('#engine-search-input').value = '';
    await loadEngineReference(actionButton.dataset.class);
    return;
  }
  if (action === 'lookup-engine') {
    const className = document.querySelector('#engine-class-input').value.trim();
    const search = document.querySelector('#engine-search-input').value.trim();
    await loadEngineReference(className, search);
    return;
  }
  if (action === 'load-tree') {
    await requireStudio();
    const depth = document.querySelector('#tree-depth')?.value ?? '4';
    const datamodelType = document.querySelector('#datamodel-type')?.value ?? 'Edit';
    const result = await api(`/api/studio/tree?studio_id=${encodeURIComponent(selectedStudioId)}&depth=${encodeURIComponent(depth)}&datamodel_type=${encodeURIComponent(datamodelType)}`);
    document.querySelector('#tree-result').innerHTML = `<pre class="mono-block">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>`;
    return;
  }
  if (action === 'load-source' || action === 'run-quality') {
    const projectPicker = document.querySelector('#project-picker');
    if (projectPicker) selectedProject = projectPicker.value;
    if (!selectedProject) throw new Error('Select a project first.');
    const container = document.querySelector('#source-result');
    if (action === 'run-quality' && !container) return renderSecurity();
    if (!container) throw new Error('The source results panel is not available on this page.');
    if (action === 'run-quality') {
      const data = await api(`/api/quality?project=${encodeURIComponent(selectedProject)}`);
      const findings = data.report.findings.map((finding) => `<div class="finding"><span class="severity ${finding.severity === 'high' ? 'high' : ''}">${escapeHtml(finding.severity)}</span><div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.file)}${finding.line ? `:${escapeHtml(finding.line)}` : ''} · ${escapeHtml(finding.detail)}</p></div><span class="panel-kicker">${escapeHtml(finding.rule)}</span></div>`).join('');
      container.innerHTML = `<p class="panel-kicker">${escapeHtml(data.report.filesScanned)} LUAAU FILES · ${escapeHtml(data.report.findings.length)} FINDINGS</p>${findings || emptyState(data.report.filesScanned ? 'No heuristic findings' : 'Unmeasured', data.report.limitation)}`;
    } else {
      const data = await api(`/api/source?project=${encodeURIComponent(selectedProject)}`);
      const list = data.files.map((file) => `<button class="doc-link" type="button" data-action="read-source" data-file="${escapeHtml(file.path)}"><span>${escapeHtml(file.path)}</span><small>${escapeHtml(bytes(file.size))} · READ</small></button>`).join('');
      container.innerHTML = `<div class="doc-list">${list || emptyState('No readable source files', 'This project contains no text source files in the supported types.')}</div><pre id="source-content" class="mono-block section-gap">Select a file to read its saved contents.</pre>`;
    }
    return;
  }
  if (action === 'read-source') {
    const file = actionButton.dataset.file;
    selectedProject = document.querySelector('#project-picker')?.value ?? selectedProject;
    const data = await api(`/api/source?project=${encodeURIComponent(selectedProject)}&path=${encodeURIComponent(file)}`);
    const target = document.querySelector('#source-content');
    if (target) target.textContent = data.content;
    return;
  }
  if (action === 'read-studio-state' || action === 'read-console') {
    await requireStudio();
    const endpoint = action === 'read-studio-state' ? 'state' : 'console';
    const result = await api(`/api/studio/${endpoint}?studio_id=${encodeURIComponent(selectedStudioId)}`);
    document.querySelector('#playtest-output').innerHTML = `<pre class="mono-block">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>`;
    return;
  }
  if (action === 'capture-viewport') {
    await requireStudio();
    const project = document.querySelector('#capture-project')?.value || null;
    const cameraPosition = document.querySelector('#camera-position')?.value.trim() ?? '';
    const lookAtPosition = document.querySelector('#look-at-position')?.value.trim() ?? '';
    const query = new URLSearchParams({ studio_id: selectedStudioId });
    if (cameraPosition) query.set('camera_position', cameraPosition);
    if (lookAtPosition) query.set('look_at_position', lookAtPosition);
    const result = await api(`/api/studio/capture?${query}`);
    const blocks = result.result?.content ?? [];
    const image = blocks.find((block) => block.type === 'image' && /^image\/(png|jpeg|webp)$/.test(block.mimeType ?? ''));
    const target = document.querySelector('#capture-result');
    const caption = document.querySelector('#capture-caption');
    if (image?.data) {
      const framing = { cameraPosition: cameraPosition ? cameraPosition.split(',').map(Number) : null, lookAtPosition: lookAtPosition ? lookAtPosition.split(',').map(Number) : null };
      const saved = await api('/api/captures', { method: 'POST', body: JSON.stringify({ studioId: selectedStudioId, project, framing, result: result.result }) });
      target.innerHTML = `<img alt="Roblox Studio viewport screenshot" src="${escapeHtml(saved.capture.url)}"/>`;
      caption.textContent = `Saved to evidence/studio/${saved.capture.imageName} · Studio ${selectedStudioId} · SHA-256 ${saved.capture.sha256}`;
      showNotice('Viewport image and provenance saved to the Lab evidence archive.');
      await renderVisual();
    } else {
      target.innerHTML = `<pre class="mono-block">${escapeHtml(JSON.stringify(result.result, null, 2))}</pre>`;
      caption.textContent = 'The tool returned no PNG, JPEG, or WebP image block.';
    }
    return;
  }
}

document.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('button[data-action]');
  if (!actionButton) return;
  try { await handleAction(actionButton); } catch (error) { showNotice(error.message, true); }
});

window.addEventListener('hashchange', render);
document.querySelector('#refresh-button').addEventListener('click', () => render());
void render();
