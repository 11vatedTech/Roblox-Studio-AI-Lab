import { createInterface } from 'node:readline';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
let initialized = false;
let studioId = 'fixture-studio';

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const input = JSON.parse(line);
  if (input.method === 'initialize') {
    send({ jsonrpc: '2.0', id: input.id, result: { protocolVersion: input.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } } });
  } else if (input.method === 'notifications/initialized') {
    initialized = true;
  } else if (input.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: input.id, result: { tools: [{ name: 'list_roblox_studios', description: 'Lists connected Studio instances', inputSchema: { type: 'object', properties: {} } }, { name: 'search_game_tree', description: 'Explores a place hierarchy', inputSchema: { type: 'object', properties: { studio_id: { type: 'string' } } } }, { name: 'execute_luau', description: 'Executes code in the place', inputSchema: { type: 'object', properties: { code: { type: 'string' } } } }, { name: 'start_stop_play', description: 'Starts or stops local play', inputSchema: { type: 'object', properties: { is_start: { type: 'boolean' }, studio_id: { type: 'string' } }, required: ['is_start', 'studio_id'] } }] } });
  } else if (input.method === 'tools/call' && initialized && input.params.name === 'list_roblox_studios') {
    send({ jsonrpc: '2.0', id: input.id, result: { content: [{ type: 'text', text: JSON.stringify([{ studio_id: studioId, name: 'Fixture Place', place_id: null }]) }] } });
  } else if (input.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: input.id, result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, studio_id: input.params.arguments.studio_id, arguments: input.params.arguments }) }] } });
  } else if (input.id !== undefined) {
    send({ jsonrpc: '2.0', id: input.id, error: { code: -32601, message: `Unknown method: ${input.method}` } });
  }
}
