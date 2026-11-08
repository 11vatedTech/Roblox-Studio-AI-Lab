const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

for await (const line of process.stdin) {
  const input = JSON.parse(String(line));
  if (input.method === 'server/discover') {
    send({ jsonrpc: '2.0', id: input.id, result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'fixture-modern', version: '1.0.0' } } } });
  } else if (input.method === 'tools/list' && input.params._meta?.['io.modelcontextprotocol/protocolVersion'] === '2026-07-28') {
    send({ jsonrpc: '2.0', id: input.id, result: { resultType: 'complete', tools: [{ name: 'list_roblox_studios', inputSchema: { type: 'object', properties: {} } }] } });
  } else if (input.method === 'tools/call' && input.params.name === 'list_roblox_studios' && input.params._meta?.['io.modelcontextprotocol/protocolVersion'] === '2026-07-28') {
    send({ jsonrpc: '2.0', id: input.id, result: { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify([{ studio_id: 'modern-studio', name: 'Modern Place', place_id: 77 }]) }], isError: false } });
  } else if (input.id !== undefined) {
    send({ jsonrpc: '2.0', id: input.id, error: { code: -32601, message: 'Method not found' } });
  }
}
