import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, stat, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defaultConfig, resolveModel, resolveAgentModel } from '../../.desktop-fork/packages/desktop/src/nebula/config';
import { inspectProject, projectContext } from '../../.desktop-fork/packages/desktop/src/main/nebula-project';
import { startOperator, stopOperator, operatorTool, registerOperatorProject } from '../../.desktop-fork/packages/desktop/src/main/nebula-operator';
import { credential, mcpCredential, reflexCredential, publicSettings, readSettings, saveSettings } from '../../.desktop-fork/packages/desktop/src/main/nebula-settings';
import { suggestReflex, reflexFeedback } from '../../.desktop-fork/packages/desktop/src/main/nebula-reflex';
import { localReflexVersion } from '../../.desktop-fork/packages/app/src/nebula/reflex';
import { openEditor, closeCurrentEditor } from '../../.desktop-fork/packages/desktop/src/main/nebula-editor';
import { startEditorBridge } from '../../.desktop-fork/packages/desktop/src/main/nebula-editor-bridge';
import { installCompanion } from '../../.desktop-fork/packages/desktop/src/main/nebula-editor-extension';
import { nodeExecutable } from '../../.desktop-fork/packages/desktop/src/nebula/platform';
import { createEditorMission, createMission, listMissions, bindMission, missionDetail, completeMission, missionChanges, editMission, removeMission, getMission } from '../../.desktop-fork/packages/desktop/src/main/nebula-missions';
import { getAppearance, setAppearance, initializeAppearance, appearancePath } from '../../.desktop-fork/packages/desktop/src/main/nebula-appearance';
import { editorRuntime, serverConnection, serverRequest, startServer, stopServer } from '../../.desktop-fork/packages/desktop/src/main/nebula-runtime';

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
  if (process.env.NEBULA_INTEGRATION_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox');
}

const fixtureState = { project: "" };
let externalCalls = 0;
const externalFixture = createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer nebula-mcp-test-token') { res.writeHead(401); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const request = JSON.parse(raw);
  if (!('id' in request)) { res.writeHead(202); res.end(); return; }
  const result = request.method === 'initialize' ? { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } }
    : request.method === 'tools/list' ? { tools: [{ name: 'project_info', description: 'Return synthetic project information', inputSchema: { type: 'object', properties: {} } }] }
    : request.method === 'tools/call' ? (externalCalls++, { content: [{ type: 'text', text: 'MCP externo validado.' }] }) : {};
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
});
const requests: { model: string; messages: { role: string; content: unknown }[]; tools?: unknown[] }[] = [];
const fixture = createServer(async (req, res) => {
  const token = req.headers.authorization;
  if (token !== 'Bearer nebula-local-test-key' && token !== 'Bearer ollama') { res.writeHead(401); res.end(); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const chunk = (delta: unknown, finish: string | null) => ({ id: 'test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] });
  const trigger = body.messages.findLastIndex((m: { role: string; content: unknown }) => m.role === 'user' && /\[(write|operator|interview|coordinate|external-mcp|local-mcp)\]/.test(JSON.stringify(m.content)));
  const lastUser = trigger >= 0 ? trigger : body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
  const user = JSON.stringify(body.messages[lastUser]?.content);
  const waiting = !body.messages.slice(lastUser + 1).some((m: { role: string }) => m.role === 'tool');
  const writing = user.includes('[write]') && waiting;
  const operator = user.includes('[operator]') && waiting;
  const interview = user.includes('[interview]') && waiting;
  const coordinate = user.includes('[coordinate]');
  const delegated = user.includes('[delegated-configuration]');
  const results = body.messages.slice(lastUser + 1).filter((m: { role: string }) => m.role === 'tool');
  const tool = coordinate && waiting ? { name: 'actor', arguments: { operation: { action: 'run', subagent_type: 'nebula_configuration_specialist', description: 'Verificar configuração sintética', prompt: '[delegated-configuration] Consulte o ambiente com a ferramenta MCP. Escopo: consulta sem alteração. Retorne a evidência observada.' } } }
    : delegated && waiting ? { name: 'nebula_operator_computer_environment', arguments: {} }
    : user.includes('[external-mcp]') && waiting ? { name: 'nebula_external_9_synthetic_project_info', arguments: {} }
    : user.includes('[local-mcp]') && waiting ? { name: 'nebula_external_5_stdio_local_info', arguments: {} }
    : writing ? { name: 'write', arguments: { file_path: join(fixtureState.project, 'approved.txt'), content: 'Alteração autorizada.\n' } }
    : operator ? { name: 'nebula_operator_computer_environment', arguments: {} }
    : interview ? { name: 'question', arguments: { questions: [{ header: 'Escopo', question: 'A mudança deve ficar no projeto? Recomendo manter o escopo local.', options: [{ label: 'Local (recomendado)', description: 'Preserva configurações globais.' }, { label: 'Global', description: 'Exige escopo explícito.' }] }] } } : undefined;
  const delta = tool ? { tool_calls: [{ index: 0, id: 'test-tool', type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] } : { role: 'assistant', content: delegated ? JSON.stringify(results).includes('supervised-terminal') ? 'Diagnóstico sintético confirmado pelo especialista.' : 'Falha: ambiente não observado.' : coordinate ? 'Resultado reunido: Diagnóstico sintético confirmado pelo especialista.' : 'Resposta local de teste.' };
  res.write('data: ' + JSON.stringify(chunk(delta, null)) + '\n\n');
  res.write('data: ' + JSON.stringify(chunk({}, tool ? 'tool_calls' : 'stop')) + '\n\n');
  res.end('data: [DONE]\n\n');
});
async function main() {
await app.whenReady();
app.on('window-all-closed', () => {});
const base = process.env.NEBULA_DESKTOP_DATA!;
await mkdir(base, { recursive: true });
const profile = await mkdtemp(join(base, 'test-'));
app.setPath('userData', profile);
const project = await realpath(await mkdtemp(join(base, 'project-')));
fixtureState.project = project;
await writeFile(join(project, 'example.txt'), 'Arquivo de teste.\n');
await writeFile(join(project, 'example.tsx'), 'export const example = 1');
await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { react: 'test' } }));
execFileSync('git', ['init', '--initial-branch=main'], { cwd: project, stdio: 'ignore' });
execFileSync('git', ['add', '.'], { cwd: project });
execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Initial fixture'], { cwd: project, stdio: 'ignore' });
await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
await new Promise<void>(resolve => externalFixture.listen(0, '127.0.0.1', resolve));
const externalURL = `http://127.0.0.1:${(externalFixture.address() as { port: number }).port}/mcp`;
const endpoint = `http://127.0.0.1:${(fixture.address() as { port: number }).port}/v1`;
async function api(path: string, method = 'GET', value?: unknown) {
  const connection = serverConnection();
  const response = await fetch(connection.url + path, { method, headers: { Authorization: `Basic ${Buffer.from(connection.username + ':' + connection.password).toString('base64')}`, 'Content-Type': 'application/json', 'x-mimocode-directory': encodeURIComponent(project) }, body: value === undefined ? undefined : JSON.stringify(value), signal: AbortSignal.timeout(30000) });
  assert.equal(response.ok, true, `${method} ${path}: ${response.status}`);
  return response.json();
}
try {
  const extensions = join(profile, 'extension-migration');
  await mkdir(extensions, { recursive: true });
  const otherExtension = { identifier: { id: 'test.other' }, version: '1.0.0', relativeLocation: 'test.other-1.0.0' };
  await writeFile(join(extensions, 'extensions.json'), JSON.stringify([otherExtension, { identifier: { id: 'nebula-cortex.nebula-companion' }, version: '0.1.0' }]));
  await writeFile(join(extensions, '.obsolete'), JSON.stringify({ 'nebula-cortex.nebula-companion-0.2.0': true, 'test.old-1.0.0': true }));
  await installCompanion(join(editorRuntime(), 'extensions/nebula-companion'), extensions);
  await installCompanion(join(editorRuntime(), 'extensions/nebula-companion'), extensions);
  const installed = JSON.parse(await readFile(join(extensions, 'extensions.json'), 'utf8'));
  assert.equal(installed.length, 2);
  assert.deepEqual(installed[0], otherExtension);
  assert.equal(installed[1].version, '0.2.0');
  assert.equal(JSON.parse(await readFile(join(installed[1].location.path, 'package.json'), 'utf8')).contributes.commands.length, 5);
  assert.deepEqual(JSON.parse(await readFile(join(extensions, '.obsolete'), 'utf8')), { 'test.old-1.0.0': true });
  console.log('PASS: atualização idempotente da extensão Nebula, registro consistente e extensões de terceiros preservadas.');
  const context = { action: 'explain', file: join(project, 'example.txt'), language: 'plaintext', text: 'Arquivo de teste.', scope: 'selection', dirty: false, range: { startLine: 1, endLine: 1 }, diagnostics: [] };
  let accepted = '';
  const bridge = await startEditorBridge(project, mission => { accepted = mission.id });
  const postContext = (value: unknown, extra = {}) => fetch(bridge.url, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) });
  assert.equal((await fetch(bridge.url, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await postContext(context, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await postContext(context)).status, 200);
  assert.ok(accepted);
  const editorMission = (await listMissions()).find(item => item.id === accepted)!;
  assert.equal(editorMission.sessionID, undefined);
  assert.equal(editorMission.file, 'example.txt');
  assert.ok(editorMission.prompt.includes('Arquivo de teste.'));
  if (process.platform !== 'win32') assert.equal((await stat(join(profile, 'missions.json'))).mode & 0o777, 0o600);
  assert.equal((await postContext({ ...context, action: 'fix', dirty: true })).status, 400);
  await assert.rejects(createEditorMission(project, { ...context, file: join(profile, 'missions.json') }));
  await assert.rejects(createEditorMission(project, { ...context, text: 'x'.repeat(65537) }));
  await assert.rejects(completeMission(editorMission.id));
  assert.deepEqual((await missionChanges(editorMission.id)).files, []);
  const concurrent = await Promise.all([createMission(project, 'Verificar exemplo A'), createMission(project, 'Verificar exemplo B')]);
  assert.ok(concurrent.every(item => (item.id !== editorMission.id)));
  assert.equal((await listMissions()).length, 3);
  const editable = await createMission(project, 'Objetivo anterior');
  const revised = await editMission(editable.id, '  Objetivo revisado  ');
  assert.equal(revised.objective, 'Objetivo revisado');
  assert.ok(revised.prompt.startsWith('Objetivo revisado\n\n'));
  assert.ok(!revised.prompt.includes('Objetivo anterior'));
  assert.equal(revised.created, editable.created);
  await assert.rejects(editMission(editable.id, '   '));
  await assert.rejects(editMission(editable.id, 'x'.repeat(8001)));
  assert.equal((await getMission(editable.id)).objective, 'Objetivo revisado');
  const editorEditable = await createEditorMission(project, context);
  const editorRevised = await editMission(editorEditable.id, 'Explicar os contratos');
  const editorRevisedAgain = await editMission(editorEditable.id, 'Explicar apenas as entradas');
  assert.equal(editorRevisedAgain.sourcePrompt, editorEditable.prompt);
  assert.ok(editorRevisedAgain.prompt.startsWith(editorEditable.prompt));
  assert.ok(!editorRevisedAgain.prompt.includes('Explicar os contratos'));
  assert.equal(editorRevisedAgain.action, 'explain');
  assert.equal(editorRevised.file, editorEditable.file);
  assert.deepEqual(editorRevised.range, editorEditable.range);
  await Promise.all([editMission(editable.id, 'Objetivo concorrente'), removeMission(editorEditable.id)]);
  assert.equal((await getMission(editable.id)).objective, 'Objetivo concorrente');
  await assert.rejects(getMission(editorEditable.id));
  await assert.rejects(editMission(editorEditable.id, 'Não recriar'));
  await removeMission(editable.id);
  await assert.rejects(removeMission(editable.id));
  await assert.rejects(removeMission('invalid-mission'));
  const racing = await createMission(project, 'Teste de fila');
  const raced = await Promise.allSettled([removeMission(racing.id), editMission(racing.id, 'Não ressuscitar')]);
  assert.equal(raced[0].status, 'fulfilled');
  assert.equal(raced[1].status, 'rejected');
  assert.equal((await listMissions()).length, 3);
  console.log('PASS: edição persistente, limites, contexto do editor preservado e remoção serializada sem ressuscitar registros.');
  bridge.close();
  await assert.rejects(fetch(bridge.url, { signal: AbortSignal.timeout(1000) }));
  console.log('PASS: ponte autenticada do editor, origem bloqueada, contexto selecionado, limites e projeto validados, rascunho sem chamada de IA, missões persistidas atomicamente e encerramento da ponte.');
  await initializeAppearance();
  assert.equal(getAppearance(), 'system');
  assert.equal(nativeTheme.themeSource, 'system');
  await setAppearance('light');
  assert.equal(getAppearance(), 'light');
  assert.equal(nativeTheme.shouldUseDarkColors, false);
  assert.deepEqual(JSON.parse(await readFile(appearancePath(), 'utf8')), { scheme: 'light', mode: 'light' });
  await setAppearance('dark');
  assert.equal(getAppearance(), 'dark');
  assert.equal(nativeTheme.shouldUseDarkColors, true);
  assert.deepEqual(JSON.parse(await readFile(appearancePath(), 'utf8')), { scheme: 'dark', mode: 'dark' });
  await assert.rejects(setAppearance('invalid'));
  assert.equal(getAppearance(), 'dark');
  await setAppearance('system');
  assert.equal(nativeTheme.themeSource, 'system');
  assert.deepEqual(JSON.parse(await readFile(appearancePath(), 'utf8')), { scheme: 'system', mode: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' });
  console.log('PASS: aparência padrão do sistema, modos claro/escuro persistidos, tema nativo, configuração compartilhada com o editor e valor inválido rejeitado.');
  const config = defaultConfig();
  config.providers[0].baseUrl = endpoint;
  config.models[0].model = 'test/code';
  config.externalMCP.push({ id: 'synthetic', name: 'Synthetic MCP', url: externalURL, enabled: true, authentication: 'bearer', agents: ['coordinator'] });
  const localMarker = join(profile, 'stdio-started.json');
  const disabledMarker = join(profile, 'stdio-disabled.json');
  const localCommand = [join(editorRuntime(), nodeExecutable()), resolve('integrations/mimo-desktop/stdio-fixture.mjs')];
  config.localMCP.push({ id: 'stdio', name: 'Synthetic stdio', command: [...localCommand, localMarker, 'path with spaces', '$(example)'], enabled: true, agents: ['coordinator'] });
  config.localMCP.push({ id: 'off', name: 'Disabled stdio', command: [...localCommand, disabledMarker], enabled: false, agents: ['coordinator'] });
  config.localMCP.push({ id: 'missing', name: 'Unavailable stdio', command: ['/tmp/example/missing-server'], enabled: true, agents: [] });
  config.models.push({ id: 'text', name: 'Textos', providerId: config.providers[0].id, model: 'test/text', capabilities: ['text', 'research', 'vision', 'image', 'video'], context: 32768, output: 4096 });
  config.assignments.text = 'text'; config.assignments.research = 'text'; config.assignments.vision = 'text'; config.assignments.image = 'text'; config.assignments.video = 'text';
  config.models.push({ id: 'configuration', name: 'Configuration', providerId: config.providers[0].id, model: 'test/configuration', capabilities: ['code'], context: 32768, output: 4096 });
  config.operator.models.configuration = 'configuration'; config.operator.questioning = 'deep';
  await saveSettings(config, { [config.providers[0].id]: 'nebula-local-test-key' }, [], { synthetic: 'nebula-mcp-test-token' });
  const publicConfig = await publicSettings();
  assert.equal(publicConfig.keys[config.providers[0].id], true);
  assert.equal(JSON.stringify(publicConfig).includes('nebula-local-test-key'), false);
  assert.equal((await readFile(join(profile, 'models.json'), 'utf8')).includes('nebula-local-test-key'), false);
  if (process.platform !== 'win32') assert.equal((await stat(join(profile, 'models.json'))).mode & 0o777, 0o600);
  assert.equal(publicConfig.mcpKeys.synthetic, true);
  assert.equal(JSON.stringify(publicConfig).includes('nebula-mcp-test-token'), false);
  assert.equal((await readFile(join(profile, 'models.json'), 'utf8')).includes('nebula-mcp-test-token'), false);
  {
    let calls = 0, invalid = false;
    const decisionFixture = createServer(async (req, res) => {
      calls += 1;
      assert.equal(req.headers.authorization, 'Bearer nebula-reflex-test-token');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const request = JSON.parse(raw);
      assert.deepEqual(Object.keys(request.state).sort(), ['hasImages', 'request']);
      const answer = (options: string[], selected: string) => ({ type: 'choice', choice: selected, confidence: 0.95, probabilities: Object.fromEntries(options.map(key => [key, key === selected ? 0.95 : 0.05 / (options.length - 1)])) });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(invalid ? { answers: { agent: 'execute' } } : { model: request.model, usage: { input_tokens: 1234, output_tokens: 0 }, answers: { agent: answer(Object.keys(request.questions.agent.criteria), 'writing'), clarification: answer(Object.keys(request.questions.clarification.criteria), 'audience') } }));
    });
    await new Promise<void>(resolve => decisionFixture.listen(0, '127.0.0.1', resolve));
    try {
      const previousDecision = '00000000-0000-4000-8000-000000000001';
      await writeFile(join(profile, 'reflex.json'), JSON.stringify({ version: 1, day: new Date().toISOString().slice(0, 10), attempts: 0, entries: [{ id: previousDecision, at: Date.now(), source: 'local', agent: 'writing', confidence: null, durationMs: 1, feedback: 'dismissed' }] }), { mode: 0o600 });
      const local = await suggestReflex({ text: 'Corrija o bug na função do exemplo', hasImages: false });
      assert.equal(local.source, 'local'); assert.equal(local.agent, 'development'); assert.equal(local.rulesVersion, localReflexVersion); assert.equal(calls, 0);
      for (const [text, expected] of [['Corrija a gramática do texto', 'writing'], ['Melhore o código sem trocar dependências', 'development'], ['Configure o MCP e depois escreva um texto', 'coordinator']]) {
        const result = await suggestReflex({ text, hasImages: false }); assert.equal(result.source, 'local'); assert.equal(result.agent, expected); assert.equal(calls, 0);
      }
      const remote = structuredClone(config);
      remote.reflex = { ...remote.reflex, provider: 'systemone', endpoint: `http://127.0.0.1:${(decisionFixture.address() as { port: number }).port}/v1/systemone`, dailyLimit: 2 };
      await saveSettings(remote, {}, [], {}, [], 'nebula-reflex-test-token');
      assert.equal((await publicSettings()).reflexKey, true);
      assert.equal(JSON.stringify(await publicSettings()).includes('nebula-reflex-test-token'), false);
      assert.equal((await readFile(join(profile, 'models.json'), 'utf8')).includes('nebula-reflex-test-token'), false);
      assert.equal(reflexCredential(await readSettings()), 'nebula-reflex-test-token');
      const recommended = await suggestReflex({ text: 'Corrija o bug na função do exemplo', hasImages: false });
      assert.equal(recommended.source, 'systemone'); assert.equal(recommended.agent, 'writing'); assert.equal(calls, 1);
      await reflexFeedback(recommended.id, 'applied');
      const manual = await suggestReflex({ text: 'Corrija o bug na função do exemplo', hasImages: false, explicitAgent: 'computer' });
      assert.equal(manual.source, 'explicit'); assert.equal(manual.agent, 'computer'); assert.equal(manual.locked, true); assert.equal(calls, 1);
      const editorMission = (await listMissions()).find(item => item.action === 'explain')!;
      const editor = await suggestReflex({ text: 'Use outro agente', hasImages: false, explicitAgent: 'writing', missionID: editorMission.id });
      assert.equal(editor.source, 'editor'); assert.equal(editor.agent, 'development'); assert.equal(calls, 1);
      invalid = true;
      const outcomes = await Promise.all([suggestReflex({ text: 'Corrija o bug na função do exemplo', hasImages: false }), suggestReflex({ text: 'Corrija o bug na função do exemplo', hasImages: false })]);
      assert.equal(calls, 2); assert.ok(outcomes.every(result => result.source === 'local' && result.agent === 'development' && result.notice));
      const log = await readFile(join(profile, 'reflex.json'), 'utf8');
      assert.equal(log.includes('Corrija o bug'), false); assert.equal(log.includes('nebula-reflex-test-token'), false);
      const ledger = JSON.parse(log); assert.equal(ledger.attempts, 2); assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === recommended.id).feedback, 'applied');
      assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === recommended.id).classifierModel, 'clef-flash');
      assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === recommended.id).inputTokens, 1234);
      assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === recommended.id).rulesVersion, undefined);
      assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === local.id).rulesVersion, localReflexVersion);
      assert.equal(ledger.entries.find((entry: {id: string}) => entry.id === previousDecision).feedback, 'dismissed');
      assert.ok(outcomes.every(result => ledger.entries.find((entry: {id: string}) => entry.id === result.id).rulesVersion === localReflexVersion));
  if (process.platform !== 'win32') assert.equal((await stat(join(profile, 'reflex.json'))).mode & 0o777, 0o600);
      assert.throws(() => reflexFeedback('invalid', 'applied'));
      const disabled = structuredClone(remote); disabled.reflex.enabled = false;
      await saveSettings(disabled, {}, []);
      assert.equal((await suggestReflex({ text: 'Corrija o exemplo', hasImages: false })).source, 'disabled'); assert.equal(calls, 2);
      const hosted = structuredClone(config); hosted.reflex = { ...hosted.reflex, provider: 'cloudflare', accountId: 'a'.repeat(32) };
      await assert.rejects(saveSettings(hosted, {}, []));
      await saveSettings(hosted, {}, [], {}, [], 'nebula-reflex-test-token');
      const moved = structuredClone(hosted); moved.reflex.accountId = 'b'.repeat(32);
      await assert.rejects(saveSettings(moved, {}, []));
      assert.equal(reflexCredential(await readSettings()), 'nebula-reflex-test-token');
      await assert.rejects(saveSettings(hosted, {}, [], {}, [], '', true));
      hosted.reflex.enabled = false;
      await saveSettings(hosted, {}, [], {}, [], '', true);
      assert.equal((await publicSettings()).reflexKey, false);
      await saveSettings(config, {}, []);
      console.log('PASS: Reflex local e SystemOne HTTP, token protegido por endpoint/modelo, escolha manual e editor preservados, falha sem outro provedor, limite concorrente, retorno registrado sem texto e desativação.');
    } finally { await new Promise<void>(resolve => { decisionFixture.close(() => resolve()); decisionFixture.closeAllConnections(); }); }
  }
  const movedMCP = structuredClone(config); movedMCP.externalMCP[0].url = 'https://example.com/mcp';
  await assert.rejects(saveSettings(movedMCP, {}, []));
  assert.equal(mcpCredential(await readSettings(), config.externalMCP[0]), 'nebula-mcp-test-token');
  await assert.rejects(saveSettings(config, {}, [], {}, ['synthetic']));
  const changed = structuredClone(config); changed.providers[0].baseUrl = 'https://example.com/v1';
  await saveSettings(changed, {}, []);
  assert.equal((await publicSettings()).keys[config.providers[0].id], false);
  await saveSettings(config, { [config.providers[0].id]: 'nebula-local-test-key' }, []);
  await startServer();
  const operatorConnection = await startOperator();
  await assert.rejects(operatorTool('browser_open', { url: 'file:///tmp/example' }));
  registerOperatorProject(project);
  await assert.rejects(operatorTool('computer_reveal', { path: profile }));
  const denied = await fetch(operatorConnection.url, { method: 'POST', body: '{}' }); assert.equal(denied.status, 403);
  const badOrigin = await fetch(operatorConnection.url, { method: 'POST', headers: { Authorization: `Bearer ${operatorConnection.token}`, Origin: 'https://example.com' }, body: '{}' }); assert.equal(badOrigin.status, 403);
  const mcpStatus = await api('/mcp'); assert.equal(mcpStatus.nebula_operator.status, 'connected'); assert.equal(mcpStatus.nebula_external_9_synthetic.status, 'connected');
  assert.equal(mcpStatus.nebula_external_5_stdio.status, 'connected');
  assert.equal(mcpStatus.nebula_external_3_off.status, 'disabled');
  assert.equal(mcpStatus.nebula_external_7_missing.status, 'failed');
  assert.equal(await access(disabledMarker).then(() => true, () => false), false);
  const localProcess = JSON.parse(await readFile(localMarker, 'utf8'));
  assert.deepEqual(localProcess.arguments, ['path with spaces', '$(example)']);
  assert.equal(localProcess.credentialInherited, false);
  const health = await api('/global/health'); assert.equal(health.healthy, true);
  const session = await api('/session', 'POST', { title: 'Teste de roteamento' });
  assert.equal(session.directory, project);
  for (const purpose of ['code', 'text', 'research', 'vision'] as const) {
    const selected = resolveModel(config, purpose);
    const result = await api(`/session/${session.id}/message`, 'POST', { agent: purpose === 'code' ? 'nebula_development' : purpose === 'research' ? 'nebula_research' : purpose === 'vision' ? 'nebula_vision' : 'nebula_text', system: projectContext(await inspectProject(project)), model: { providerID: selected.provider.id, modelID: selected.model.model }, parts: [{ type: 'text', text: 'Resposta de teste para ' + purpose }] });
    assert.equal(result.info.error, undefined);
    assert.equal(result.info.modelID, selected.model.model);
  }
  assert.equal(requests.some(request => JSON.stringify(request.messages).includes('TypeScript') && JSON.stringify(request.messages).includes('React')), true);
  assert.equal(requests.filter(request => JSON.stringify(request.messages).includes('Resposta de teste para code')).some(request => JSON.stringify(request.tools).includes('"name":"nebula_external_9_synthetic_project_info"')), false);
  assert.equal(requests.filter(request => JSON.stringify(request.messages).includes('Resposta de teste para code')).some(request => JSON.stringify(request.tools).includes('"name":"nebula_external_5_stdio_local_info"')), false);
  const localMCPSession = await api('/session', 'POST', { title: 'Local MCP' });
  const localMCPExecution = api(`/session/${localMCPSession.id}/message`, 'POST', { agent: 'nebula_coordinator', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: '[local-mcp] Consulte a ferramenta local sintética.' }] });
  let localPermission: { id: string; permission: string } | undefined;
  for (let n = 0; n < 100; n++) { localPermission = (await api('/permission')).find((item: { sessionID: string }) => item.sessionID === localMCPSession.id); if (localPermission) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(localPermission); assert.equal(localPermission.permission, 'nebula_external_5_stdio_local_info');
  assert.equal(await access(localMarker + '.called').then(() => true, () => false), false);
  await api(`/permission/${localPermission.id}/reply`, 'POST', { reply: 'once' });
  assert.equal((await localMCPExecution).info.error, undefined);
  assert.equal(await access(localMarker + '.called').then(() => true, () => false), true);
  assert.equal(JSON.stringify(await api(`/session/${localMCPSession.id}/message`)).includes('MCP stdio local validado.'), true);
  const externalSession = await api('/session', 'POST', { title: 'External MCP' });
  const externalExecution = api(`/session/${externalSession.id}/message`, 'POST', { agent: 'nebula_coordinator', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: '[external-mcp] Consulte a informação sintética.' }] });
  let externalPermission: { id: string; permission: string } | undefined;
  for (let n = 0; n < 100; n++) { externalPermission = (await api('/permission')).find((item: { sessionID: string }) => item.sessionID === externalSession.id); if (externalPermission) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(externalPermission); assert.equal(externalPermission.permission, 'nebula_external_9_synthetic_project_info'); assert.equal(externalCalls, 0);
  await api(`/permission/${externalPermission.id}/reply`, 'POST', { reply: 'once' });
  assert.equal((await externalExecution).info.error, undefined); assert.equal(externalCalls, 1);
  assert.equal(JSON.stringify(await api(`/session/${externalSession.id}/message`)).includes('MCP externo validado.'), true);
  const specialist = resolveAgentModel(config, 'configuration');
  const specialistSession = await api('/session', 'POST', { title: 'Specialist configuration' });
  const specialistReply = await api(`/session/${specialistSession.id}/message`, 'POST', { agent: 'nebula_configuration', model: { providerID: specialist.provider.id, modelID: specialist.model.model }, parts: [{ type: 'text', text: 'Verifique o ambiente sintético.' }] });
  assert.equal(specialistReply.info.error, undefined); assert.equal(specialistReply.info.modelID, 'test/configuration');
  assert.equal(requests.some(request => request.model === 'test/configuration' && JSON.stringify(request.messages).includes('enfraqueça autenticação')), true);
  const coordinatorSession = await api('/session', 'POST', { title: 'Coordinator delegation' });
  const coordinating = api(`/session/${coordinatorSession.id}/message`, 'POST', { agent: 'nebula_coordinator', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: '[coordinate] Delegue a consulta de configuração e reúna a evidência.' }] });
  let delegation: { id: string; permission: string; patterns: string[] } | undefined;
  for (let n = 0; n < 100; n++) { delegation = (await api('/permission')).find((item: { sessionID: string }) => item.sessionID === coordinatorSession.id); if (delegation) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(delegation); assert.equal(delegation.permission, 'actor'); assert.deepEqual(delegation.patterns, ['nebula_configuration_specialist']);
  assert.equal(requests.some(request => JSON.stringify(request.messages).includes('[delegated-configuration]')), false);
  await api(`/permission/${delegation.id}/reply`, 'POST', { reply: 'once' });
  let childPermission: { id: string; permission: string } | undefined;
  for (let n = 0; n < 100; n++) { childPermission = (await api('/permission')).find((item: { permission: string }) => item.permission === 'nebula_operator_computer_environment'); if (childPermission) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(childPermission, 'A delegação deve preservar autorização antes de executar a ferramenta');
  await api(`/permission/${childPermission.id}/reply`, 'POST', { reply: 'once' });
  const coordinated = await coordinating;
  assert.equal(coordinated.info.error, undefined);
  const childRequests = requests.filter(request => request.model === 'test/configuration' && JSON.stringify(request.messages).includes('[delegated-configuration]'));
  assert.ok(childRequests.length > 0, 'O especialista deve executar com o modelo configurado');
  assert.equal(childRequests.some(request => JSON.stringify(request.tools).includes('"name":"actor"')), false);
  assert.equal(childRequests.some(request => JSON.stringify(request.messages).includes('não repita a entrevista')), true);
  assert.equal(childRequests.some(request => JSON.stringify(request.messages.filter(message => message.role === 'tool')).includes('supervised-terminal')), true);
  const coordinatorMessages = await api(`/session/${coordinatorSession.id}/message`);
  assert.equal(coordinatorMessages.some((message: { parts: { type: string; tool?: string; state?: { status: string; input?: { operation?: { action?: string } }; output?: string } }[] }) => message.parts.some(part => part.type === 'tool' && part.tool === 'actor' && part.state?.status === 'completed' && part.state?.input?.operation?.action === 'run' && part.state?.output?.includes('Diagnóstico sintético confirmado'))), true);
  const interviewSession = await api('/session', 'POST', { title: 'Interview' });
  const interviewing = api(`/session/${interviewSession.id}/message`, 'POST', { agent: 'nebula_configuration', model: { providerID: specialist.provider.id, modelID: specialist.model.model }, parts: [{ type: 'text', text: '[interview] Investigue a decisão.' }] });
  let question: { id: string; sessionID: string; questions: unknown[] } | undefined;
  for (let n = 0; n < 100; n++) { question = (await api('/question')).find((item: { sessionID: string }) => item.sessionID === interviewSession.id); if (question) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(question); assert.equal(question.questions.length, 1);
  await api(`/question/${question.id}/reply`, 'POST', { answers: [['Local (recomendado)']] });
  assert.equal((await interviewing).info.error, undefined);
  const operatorSession = await api('/session', 'POST', { title: 'Operator environment' });
  const operating = api(`/session/${operatorSession.id}/message`, 'POST', { agent: 'nebula_computer', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: '[operator] Consulte o ambiente.' }] });
  let operatorPermission: { id: string } | undefined;
  for (let n = 0; n < 100; n++) { operatorPermission = (await api('/permission')).find((item: { sessionID: string }) => item.sessionID === operatorSession.id); if (operatorPermission) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(operatorPermission);
  await api(`/permission/${operatorPermission.id}/reply`, 'POST', { reply: 'once' });
  const operated = await operating; assert.equal(operated.info.error, undefined);
  const operatorMessages = await api(`/session/${operatorSession.id}/message`);
  assert.equal(operatorMessages.some((message: { parts: unknown[] }) => JSON.stringify(message.parts).includes('supervised-terminal')), true);
  const writeSession = await api('/session', 'POST', { title: 'Permissão de escrita' });
  const writeMission = await createMission(project, 'Verificar escrita supervisionada');
  await bindMission(writeMission.id, { directory: project, sessionID: writeSession.id, agent: 'build', model: 'test/code', prompt: writeMission.prompt });
  const pending = api(`/session/${writeSession.id}/message`, 'POST', { agent: 'build', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: '[write] Criar arquivo de teste.' }] });
  let permission: { id: string; sessionID: string; metadata?: { diff?: string } } | undefined;
  for (let n = 0; n < 100; n++) {
    const list = await api('/permission'); permission = list.find((p: { sessionID: string }) => p.sessionID === writeSession.id);
    if (permission) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(permission, 'O motor deve pedir autorização');
  const statuses = await serverRequest('/session/status', project);
  assert.notEqual((statuses[writeSession.id] as { type: string }).type, 'idle');
  assert.equal(await access(join(project, 'approved.txt')).then(() => true, () => false), false);
  assert.equal((await missionDetail(writeMission.id)).state, 'waiting');
  await assert.rejects(completeMission(writeMission.id));
  const removableRunning = await createMission(project, 'Remover registro durante execução');
  await bindMission(removableRunning.id, { directory: project, sessionID: writeSession.id, agent: 'build', model: 'test/code', prompt: removableRunning.prompt });
  await removeMission(removableRunning.id);
  assert.ok((await api('/permission')).some((entry: { id: string }) => entry.id === permission!.id));
  assert.notEqual(((await serverRequest('/session/status', project))[writeSession.id] as { type: string }).type, 'idle');
  await assert.rejects(bindMission(removableRunning.id, { directory: project, sessionID: writeSession.id, agent: 'build', model: 'test/code', prompt: removableRunning.prompt }));
  await api(`/permission/${permission.id}/reply`, 'POST', { reply: 'once' });
  await pending;
  assert.equal((await missionDetail(writeMission.id)).state, 'review');
  assert.ok((await missionDetail(writeMission.id)).evidence.some(item => item.tool === 'write' && item.status === 'completed'));
  assert.equal(await readFile(join(project, 'approved.txt'), 'utf8'), 'Alteração autorizada.\n');
  const artifacts = await api('/file?path=');
  assert.equal(artifacts.some((file: { name: string; type: string }) => file.name === 'approved.txt' && file.type === 'file'), true);
  const preview = await api('/file/content?path=approved.txt');
  assert.equal(preview.type, 'text');
  assert.equal(preview.content, 'Alteração autorizada.');
  let recordedChanges = await missionChanges(writeMission.id);
  for (let n = 0; n < 100 && !recordedChanges.files.some(item => item.file === 'approved.txt'); n++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    recordedChanges = await missionChanges(writeMission.id);
  }
  const recordedFile = recordedChanges.files.find(item => item.file === 'approved.txt');
  assert.ok(recordedFile, 'A escrita autorizada deve produzir diferença registrada pelo motor');
  assert.ok(recordedFile.patch.includes('Alteração autorizada.') || recordedFile.after.includes('Alteração autorizada.'));
  assert.equal(recordedFile.truncated, false);
  const recordedText = recordedFile.patch || recordedFile.after;
  await writeFile(join(project, 'approved.txt'), 'Edição posterior no projeto.\n');
  const unchangedRecord = (await missionChanges(writeMission.id)).files.find(item => item.file === 'approved.txt')!;
  assert.equal(unchangedRecord.patch || unchangedRecord.after, recordedText);
  assert.equal(await readFile(join(project, 'approved.txt'), 'utf8'), 'Edição posterior no projeto.\n');
  await assert.rejects(missionChanges('invalid-mission'));
  const boundEdited = await editMission(writeMission.id, 'Revisar a entrega registrada');
  assert.equal(boundEdited.prompt, writeMission.prompt);
  assert.equal(boundEdited.sessionID, writeSession.id);
  const messageContents = (messages: { info: { id: string; role: string }; parts: unknown[] }[]) => messages.map(message => ({ id: message.info.id, role: message.info.role, parts: message.parts }));
  const messagesBeforeRemoval = messageContents(await api(`/session/${writeSession.id}/message`));
  const removableBound = await createMission(project, 'Registro removível');
  await bindMission(removableBound.id, { directory: project, sessionID: writeSession.id, agent: 'build', model: 'test/code', prompt: removableBound.prompt });
  await removeMission(removableBound.id);
  assert.equal((await api(`/session/${writeSession.id}`)).id, writeSession.id);
  assert.deepEqual(messageContents(await api(`/session/${writeSession.id}/message`)), messagesBeforeRemoval);
  assert.equal(await readFile(join(project, 'approved.txt'), 'utf8'), 'Edição posterior no projeto.\n');
  await assert.rejects(getMission(removableBound.id));
  console.log('PASS: edição de missão vinculada preserva o envio original; remover registro preserva conversa, mensagens e arquivos.');
  await api(`/session/${writeSession.id}`, 'DELETE');
  await assert.rejects(missionChanges(writeMission.id));
  console.log('PASS: revisão de diferenças reais da missão, sem alterar arquivos e preservando o registro após edição posterior no disco.');
  const history = await api('/session?roots=true&limit=50');
  assert.equal(history.some((entry: { id: string; title: string }) => entry.id === session.id && entry.title === 'Teste de roteamento'), true);
  assert.equal(requests.some(r => r.model === 'test/code'), true);
  const explanation = await api('/session', 'POST', { title: 'Explicação somente de leitura' });
  await api(`/session/${explanation.id}/message`, 'POST', { agent: 'nebula_editor_explain', model: { providerID: config.providers[0].id, modelID: 'test/code' }, parts: [{ type: 'text', text: 'Explique o exemplo sintético sem alterações.' }] });
  const explanationCalls = requests.filter(r => JSON.stringify(r.messages).includes('Explique o exemplo sintético sem alterações.'));
  assert.ok(explanationCalls.length > 0);
  assert.ok(explanationCalls.every(r => !JSON.stringify(r.tools).includes('"name":"write"') && !JSON.stringify(r.tools).includes('"name":"bash"') && !JSON.stringify(r.tools).includes('"name":"actor"')));
  await bindMission(editorMission.id, { directory: project, sessionID: session.id, agent: 'nebula_editor_explain', model: 'test/code', prompt: editorMission.prompt });
  const missionStatus = await missionDetail(editorMission.id);
  assert.equal(missionStatus.state, 'review');
  assert.ok(missionStatus.agents.length > 0);
  await completeMission(editorMission.id);
  assert.equal((await missionDetail(editorMission.id)).state, 'completed');
  await assert.rejects(bindMission(editorMission.id, { directory: profile, sessionID: session.id, agent: 'nebula_editor_explain', model: 'test/code', prompt: editorMission.prompt }));
  console.log('PASS: missão vinculada à conversa real, estados observados no motor, revisão antes da conclusão e vínculo entre projetos recusado.');
  assert.equal(requests.some(r => r.model === 'test/text'), true);
  assert.equal(requests.filter(r => r.model === 'test/text' && JSON.stringify(r.messages.filter(m => m.role === 'user').at(-1)?.content).includes('para text')).some(r => JSON.stringify(r.tools).includes('"name":"write"')), false);
  await stopServer();
  for (let n = 0; n < 100; n++) { if (!processAlive(localProcess.pid)) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.equal(processAlive(localProcess.pid), false, 'O processo MCP deve encerrar com o motor');
  await startServer();
  const messages = await api(`/session/${session.id}/message`);
  assert.equal(messages.filter((m: { info: { role: string } }) => m.info.role === 'assistant').length, 4);
  await stopServer();
  config.providers[0].kind = 'ollama';
  await saveSettings(config, {}, [config.providers[0].id]);
  const saved = await readSettings();
  assert.equal(credential(saved, config.providers[0]), 'ollama');
  assert.equal((await publicSettings()).keys[config.providers[0].id], false);
  await startServer();
  const localSession = await api('/session', 'POST', { title: 'Ollama sem chave' });
  const local = await api(`/session/${localSession.id}/message`, 'POST', { agent: 'nebula_text', model: { providerID: config.providers[0].id, modelID: 'test/text' }, parts: [{ type: 'text', text: 'Teste local sem chave.' }] });
  assert.equal(local.info.error, undefined);
  await stopServer();
  config.externalMCP[0].enabled = false;
  config.localMCP[0].enabled = false;
  await saveSettings(config, {}, [], {}, ['synthetic']);
  assert.equal((await publicSettings()).mcpKeys.synthetic, false);
  await startServer();
  assert.equal((await api('/mcp')).nebula_external_9_synthetic.status, 'disabled');
  assert.equal((await api('/mcp')).nebula_external_5_stdio.status, 'disabled');
  const editorWindow = new BrowserWindow({ show: false });
  assert.equal(await openEditor(editorWindow, project), project);
  assert.equal(await closeCurrentEditor(), true);
  editorWindow.destroy();
  console.log('PASS: MCP stdio real, argumentos preservados, credenciais não herdadas, acesso por agente, autorização antes da chamada, servidor desativado não iniciado e encerramento com o motor; MCP externo autenticado, coordenação supervisionada, modelos por agente, entrevista, navegador/computador, histórico, artefatos e Editor Nebula.');
  await stopServer();
  app.exit(0);
} catch (error) {
  console.error(error);
  await stopServer();
  app.exit(1);
} finally { stopOperator(); fixture.closeAllConnections(); fixture.close(); externalFixture.closeAllConnections(); externalFixture.close(); }

}
function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    // Container PID 1 may retain an already terminated child as a zombie.
    if (process.platform === 'linux') return !/^Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1)!);
    return true;
  } catch { return false; }
}
void main().catch(error => { console.error(error); stopServer(); app.exit(1); });
