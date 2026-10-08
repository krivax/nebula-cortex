// Synthetic local MCP for native integration and GUI validation. No network or user files.
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
const marker = process.argv[2];
if (marker) writeFileSync(marker, JSON.stringify({ pid: process.pid, arguments: process.argv.slice(3), credentialInherited: Object.entries(process.env).some(([key, value]) => /^(NEBULA_(TOKEN|MCP_TOKEN)_|MIMOCODE_(AUTH_CONTENT|CONFIG_CONTENT|SERVER_PASSWORD)$)/.test(key) && !!value) }));
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (!('id' in request)) return;
  const result = request.method === 'initialize' ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-local', version: '1' } }
    : request.method === 'tools/list' ? { tools: [{ name: 'local_info', description: 'Return synthetic local information', inputSchema: { type: 'object', properties: {} } }] }
    : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'MCP stdio local validado.' }] } : {};
  if (request.method === 'tools/call' && marker) writeFileSync(marker + '.called', 'called');
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
