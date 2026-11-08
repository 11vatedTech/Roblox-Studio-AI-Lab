const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

for await (const line of process.stdin) {
  const input = JSON.parse(String(line));
  if (input.method === 'server/discover') {
    send({ jsonrpc: '2.0', id: input.id, result: { supportedVersions: ['2026-07-28'] } });
  } else if (input.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: input.id, result: { tools: [{ name: 'list_roblox_studios', inputSchema: { type: 'object' } }] } });
  } else if (input.method === 'tools/call' && input.params.name === 'list_roblox_studios') {
    send({ jsonrpc: '2.0', id: input.id, result: { content: [{ type: 'text', text: JSON.stringify([{ id: 'current-studio-id', name: 'Current Place.rbxlx' }]) }] } });
  } else if (input.id !== undefined) {
    send({ jsonrpc: '2.0', id: input.id, error: { code: -32601, message: `Unknown method: ${input.method}` } });
  }
}
