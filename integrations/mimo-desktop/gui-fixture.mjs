// Isolated GUI validation with a local API; no production profile or paid provider.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const profile = resolve('.desktop-runtime/operator-gui-validation');
await mkdir(join(profile, 'workspace'), { recursive: true });
await writeFile(join(profile, 'workspace/README.md'), '# Workspace de teste\nArquivo sintético para validação da interface.\n');
await writeFile(join(profile, 'workspace/package.json'), JSON.stringify({ dependencies: { react: 'test' } }));
await writeFile(join(profile, 'workspace/example.tsx'), 'export const example = 1');
await writeFile(join(profile, 'workspace/example.rs'), 'fn main() {}');
if (process.env.NEBULA_GUI_REVIEW === '1') {
  const project = join(profile, 'workspace');
  execFileSync('/usr/bin/git', ['init', '--initial-branch=main'], { cwd: project, stdio: 'ignore' });
  execFileSync('/usr/bin/git', ['add', 'README.md', 'package.json', 'example.tsx', 'example.rs'], { cwd: project });
  execFileSync('/usr/bin/git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'Review fixture baseline'], { cwd: project, stdio: 'ignore' });
}
function findSnapshot(value) {
  if (typeof value === 'string') { try { return findSnapshot(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (value.snapshot && value.elements) return value;
  for (const child of Object.values(value)) { const found = findSnapshot(child); if (found) return found; }
}
const fixture = createServer(async (req, res) => {
  if (req.url === '/mcp-fixture') {
    if (req.headers.authorization !== 'Bearer gui-mcp-test-token') { res.writeHead(401); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const request = JSON.parse(raw);
    if (!('id' in request)) { res.writeHead(202); res.end(); return; }
    const result = request.method === 'initialize' ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-gui', version: '1' } }
      : request.method === 'tools/list' ? { tools: [{ name: 'project_info', description: 'Return synthetic project information', inputSchema: { type: 'object', properties: {} } }] }
      : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'Conexão MCP da interface validada.' }] } : {};
    if (request.method === 'tools/call') console.log(JSON.stringify({ externalMcpToolExecuted: true }));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result })); return;
  }
  if (req.url === '/browser-fixture') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="pt"><title>Teste do Navegador Nebula</title><body><h1>Aplicação sintética</h1><label>Nome <input aria-label="Nome"></label><button onclick="document.querySelector(\'p\').textContent=\'Olá, \'+document.querySelector(\'input\').value;console.log(\'Interação validada\')">Confirmar</button><p>Aguardando interação.</p></body></html>');
    return;
  }
  if (req.headers.authorization !== 'Bearer ollama') { res.writeHead(401); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  console.log(JSON.stringify({ model: body.model, stream: body.stream, professionalContext: JSON.stringify(body.messages).includes('especializado do Nebula'), projectContext: JSON.stringify(body.messages).includes('TypeScript') }));
  let answer = 'Validação local: tarefa concluída pelo motor MiMo.';
  let tool;
  const trigger = body.messages.findLastIndex(message => message.role === 'user' && /\[(browser-test|grill-test|coordinate-test|delegated-configuration|external-mcp-test|local-mcp-test|mission-diff-test)\]/.test(JSON.stringify(message.content)));
  const lastUser = trigger >= 0 ? trigger : body.messages.findLastIndex(message => message.role === 'user');
  const user = JSON.stringify(body.messages[lastUser]?.content);
  const results = body.messages.slice(lastUser + 1).filter(message => message.role === 'tool');
  const available = new Set((body.tools ?? []).map(item => item.function?.name));
  if (trigger >= 0) console.log(JSON.stringify({ tools: [...available], trigger: user.slice(0, 160) }));
  if (user.includes('[mission-diff-test]') && available.has('write')) {
    if (results.length === 0) tool = { name: 'write', arguments: { file_path: join(profile, 'workspace/example.tsx'), content: 'export const example = 2;\nexport const doubled = example * 2;\n' } };
    if (results.length > 0) answer = 'Validação local: arquivo example.tsx atualizado e diferenças registradas.';
  }
  if (user.includes('[browser-test]') && available.has('nebula_operator_browser_open')) {
    const step = results.length;
    const snapshot = results.map(result => findSnapshot(result.content)).filter(Boolean).at(-1);
    const prefix = 'nebula_operator_browser_';
    if (step === 0) tool = { name: prefix + 'open', arguments: { url: `http://127.0.0.1:${fixture.address().port}/browser-fixture` } };
    if (step === 1 || step === 3 || step === 5) tool = { name: prefix + 'snapshot', arguments: {} };
    if (step === 2 && snapshot) tool = { name: prefix + 'fill', arguments: { snapshot: snapshot.snapshot, reference: snapshot.elements.find(element => element.name === 'Nome').reference, text: 'Nebula' } };
    if (step === 4 && snapshot) tool = { name: prefix + 'click', arguments: { snapshot: snapshot.snapshot, reference: snapshot.elements.find(element => element.name === 'Confirmar').reference } };
    if (step === 6) tool = { name: prefix + 'console', arguments: {} };
    if (step >= 7) { const verified = snapshot?.text.includes('Olá, Nebula'); answer = verified ? 'Navegador validado: campo preenchido, botão acionado e resultado Olá, Nebula observado.' : 'Falha: resultado esperado não observado.'; console.log(JSON.stringify({ browserVerified: !!verified })); }
    if (tool) console.log(JSON.stringify({ tool: tool.name, step }));
  }
  if (user.includes('[external-mcp-test]')) {
    const name = [...available].find(name => name.startsWith('nebula_external_') && name.endsWith('_project_info'));
    if (results.length === 0 && name) tool = { name, arguments: {} };
    if (results.length > 0) { const verified = JSON.stringify(results).includes('Conexão MCP da interface validada'); answer = verified ? 'Conexão MCP da interface validada: ferramenta externa executada após autorização.' : 'Falha: resultado MCP não recebido.'; console.log(JSON.stringify({ externalMcpVerified: verified })); }
  }
  if (user.includes('[local-mcp-test]')) {
    const name = [...available].find(name => name.startsWith('nebula_external_') && name.endsWith('_local_info'));
    if (results.length === 0 && name) tool = { name, arguments: {} };
    if (results.length > 0) { const verified = JSON.stringify(results).includes('MCP stdio local validado'); answer = verified ? 'MCP local validado: programa conectado e ferramenta executada após autorização.' : 'Falha: resultado stdio não recebido.'; console.log(JSON.stringify({ localMcpVerified: verified })); }
  }
  if (user.includes('[coordinate-test]') && available.has('actor')) {
    if (results.length === 0) tool = { name: 'actor', arguments: { operation: { action: 'run', subagent_type: 'nebula_configuration_specialist', description: 'Inspecionar ambiente sintético', prompt: '[delegated-configuration] Consulte o ambiente com a ferramenta MCP. Escopo: consulta sem alteração. Retorne a evidência observada.' } } };
    if (results.length >= 1) { const verified = JSON.stringify(results).includes('Diagnóstico sintético confirmado pelo especialista'); answer = verified ? 'Coordenação validada: especialista de Configuração executou com seu modelo, consultou o ambiente autorizado e retornou o diagnóstico.' : 'Falha: evidência do especialista não recebida.'; console.log(JSON.stringify({ coordinatorVerified: verified })); }
  }
  if (user.includes('[delegated-configuration]')) {
    if (results.length === 0 && available.has('nebula_operator_computer_environment')) tool = { name: 'nebula_operator_computer_environment', arguments: {} };
    if (results.length > 0) answer = JSON.stringify(results).includes('supervised-terminal') ? 'Diagnóstico sintético confirmado pelo especialista.' : 'Falha: ambiente não observado.';
  }
  if (user.includes('[grill-test]') && available.has('question') && results.length === 0) tool = { name: 'question', arguments: { questions: [{ header: 'Escopo', question: 'A configuração deve ficar apenas no projeto? Recomendo o escopo local.', options: [{ label: 'Local (recomendado)', description: 'Preserva o ambiente global.' }, { label: 'Global', description: 'Expande o escopo da tarefa.' }] }] } };
  const base = { id: 'gui-test', created: 1, model: body.model };
  if (!body.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'Validação da interface' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const delta = tool ? { tool_calls: [{ index: 0, id: `gui-tool-${results.length}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] } : { role: 'assistant', content: answer };
  for (const [part, finish_reason] of [[delta, null], [{}, tool ? 'tool_calls' : 'stop']]) {
    res.write('data: ' + JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: part, finish_reason }] }) + '\n\n');
  }
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const config = {
  version: 1,
  providers: [{ id: 'gui_local', name: 'API local de teste', kind: 'ollama', baseUrl: `http://127.0.0.1:${fixture.address().port}/v1` }],
  models: [{ id: 'gui_code', name: 'Teste de código', providerId: 'gui_local', model: 'test/code', capabilities: ['code'], context: 32768, output: 4096 }, { id: 'gui_text', name: 'Teste de textos', providerId: 'gui_local', model: 'test/text', capabilities: ['text', 'research', 'vision'], context: 32768, output: 4096 }, { id: 'gui_configuration', name: 'Teste de configuração', providerId: 'gui_local', model: 'test/configuration', capabilities: ['code'], context: 32768, output: 4096 }],
  assignments: { code: 'gui_code', text: 'gui_text', research: 'gui_text', vision: 'gui_text', image: null, video: null },
  operator: { questioning: 'deep', models: { development: null, configuration: 'gui_configuration', browser: null, computer: null, writing: null, research: null, vision: null } },
};
await writeFile(join(profile, 'models.json'), JSON.stringify({ config, vault: {} }), { mode: 0o600 });
console.log(JSON.stringify({ profile, pid: process.pid, mcpURL: `http://127.0.0.1:${fixture.address().port}/mcp-fixture`, stdioCommand: [resolve('.editor-runtime/darwin-arm64/node/bin/node'), resolve('integrations/mimo-desktop/stdio-fixture.mjs'), join(profile, 'stdio-gui-started.json')], ready: true }));
const stop = () => { fixture.closeAllConnections(); fixture.close(() => process.exit(0)); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
