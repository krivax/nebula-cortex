const vscode = require('vscode');
const { randomBytes } = require('node:crypto');
const { watchFile, unwatchFile } = require('node:fs');
const { readFile } = require('node:fs/promises');
let welcome;
function showWelcome() {
  if (welcome) { welcome.reveal(); return; }
  welcome = vscode.window.createWebviewPanel('nebula.welcome', 'Editor Nebula', vscode.ViewColumn.Active, {
    enableScripts: false,
    localResourceRoots: [],
    enableCommandUris: ['workbench.action.files.newUntitledFile', 'workbench.action.showCommands', 'workbench.action.terminal.new'],
  });
  const nonce = randomBytes(16).toString('hex');
  welcome.webview.html = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'"><title>Editor Nebula</title><style nonce="${nonce}">
    body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:48px 32px}main{max-width:780px;margin:auto}.brand{font-size:12px;letter-spacing:.14em;color:var(--vscode-descriptionForeground)}h1{font-size:42px;letter-spacing:-.04em;font-weight:600;margin:16px 0}p{color:var(--vscode-descriptionForeground);line-height:1.7}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:28px 0 40px}a{color:var(--vscode-button-foreground);background:var(--vscode-button-background);padding:12px 18px;border-radius:8px;text-decoration:none}a:hover{background:var(--vscode-button-hoverBackground)}a:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}.guide{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}article{padding:20px;border:1px solid var(--vscode-widget-border,var(--vscode-panel-border));border-radius:12px}h2{font-size:15px;margin:0 0 12px}article p{margin:0;font-size:13px}footer{margin-top:36px;font-size:12px;color:var(--vscode-descriptionForeground)}
    </style></head><body><main><div class="brand">NEBULA CORTEX</div><h1>Editor Nebula</h1><p>Seu projeto, suas ferramentas e seus agentes em um só ambiente.</p><nav class="actions" aria-label="Começar no editor"><a href="command:workbench.action.files.newUntitledFile">Criar arquivo</a><a href="command:workbench.action.terminal.new">Abrir terminal</a><a href="command:workbench.action.showCommands">Buscar comando</a></nav><section class="guide"><article><h2>Explore o projeto</h2><p>Use a árvore de arquivos à esquerda, a busca, as abas e a revisão do Git para navegar e editar.</p></article><article><h2>Trabalhe com os agentes</h2><p>O ícone de conversa na barra superior volta ao Assistente. Defina o objetivo e acompanhe as autorizações antes de executar ferramentas.</p></article><article><h2>Confira o resultado</h2><p>Abra sua aplicação pelo ícone de navegador. O ícone de engrenagem configura modelos, agentes e conexões MCP.</p></article></section><footer>Fechar esta página preserva seus arquivos. Para reabrir, busque “Nebula: Abrir início do editor” na paleta de comandos.</footer></main></body></html>`;
  welcome.onDidDispose(() => { welcome = undefined; });
}
exports.activate = context => {
  for (const [action, label] of [['explain', 'Explicar código'], ['fix', 'Corrigir código'], ['tests', 'Criar testes']]) {
    context.subscriptions.push(vscode.commands.registerCommand(`nebula.${action}`, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.scheme !== 'file') { vscode.window.showWarningMessage('Abra um arquivo salvo do projeto.'); return; }
      if (editor.document.isDirty && action !== 'explain') { vscode.window.showWarningMessage('Salve o arquivo antes de pedir correções ou testes.'); return; }
      const selection = editor.selection;
      const text = editor.document.getText(selection.isEmpty ? undefined : selection);
      if (!text.trim() || text.length > 65536) { vscode.window.showWarningMessage('Selecione um trecho com até 65 mil caracteres.'); return; }
      const url = process.env.NEBULA_EDITOR_BRIDGE_URL;
      const token = process.env.NEBULA_EDITOR_BRIDGE_TOKEN;
      if (!url || !token) { vscode.window.showErrorMessage('Abra o editor pelo Nebula para usar os agentes.'); return; }
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri).slice(0, 40).map(item => ({ line: item.range.start.line + 1, message: item.message.slice(0, 1000), severity: vscode.DiagnosticSeverity[item.severity] }));
      try {
        const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ action, file: editor.document.uri.fsPath, language: editor.document.languageId, text, scope: selection.isEmpty ? 'file' : 'selection', dirty: editor.document.isDirty, range: { startLine: selection.isEmpty ? 1 : selection.start.line + 1, endLine: selection.isEmpty ? editor.document.lineCount : selection.end.line + 1 }, diagnostics }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        vscode.window.showInformationMessage(`${label}: revise e envie a solicitação no Assistente Nebula.`);
      } catch { vscode.window.showErrorMessage('Não foi possível enviar o contexto. Confira o projeto aberto e tente novamente.'); }
    }));
  }
  const appearanceFile = process.env.NEBULA_APPEARANCE_FILE;
  if (appearanceFile) {
    let disposed = false;
    let pending = Promise.resolve();
    const sync = () => {
      pending = pending.catch(() => undefined).then(async () => {
        const value = JSON.parse(await readFile(appearanceFile, 'utf8'));
        if (disposed || (value.mode !== 'light' && value.mode !== 'dark')) return;
        const config = vscode.workspace.getConfiguration('workbench');
        const selected = config.get(value.mode === 'dark' ? 'preferredDarkColorTheme' : 'preferredLightColorTheme') || (value.mode === 'dark' ? 'Default Dark Modern' : 'Default Light Modern');
        if (config.get('colorTheme') !== selected) await config.update('colorTheme', selected, vscode.ConfigurationTarget.Global);
      });
      void pending.catch(() => console.warn('Não foi possível sincronizar o tema do Editor Nebula'));
    };
    watchFile(appearanceFile, { interval: 500, persistent: false }, sync);
    context.subscriptions.push({ dispose() { disposed = true; unwatchFile(appearanceFile, sync); } });
    sync();
  }
  context.subscriptions.push(vscode.commands.registerCommand('nebula.welcome', showWelcome));
  context.subscriptions.push(vscode.commands.registerCommand('nebula.editorInfo', () => {
    vscode.window.showInformationMessage('Editor Nebula: arquivos, busca, Git, terminal e extensões dentro do seu projeto. Use os ícones da barra superior para acessar o assistente, o navegador e as configurações de IA.');
  }));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, -100);
  status.text = '$(sparkle) Nebula';
  status.tooltip = 'Editor Nebula integrado ao Nebula Cortex';
  status.command = 'nebula.welcome';
  status.show();
  context.subscriptions.push(status);
  if (!context.globalState.get('nebula.welcome.v1')) {
    showWelcome();
    void context.globalState.update('nebula.welcome.v1', true);
  }
};
exports.deactivate = () => welcome?.dispose();
