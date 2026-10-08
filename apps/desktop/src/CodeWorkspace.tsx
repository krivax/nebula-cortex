import { useEffect, useMemo, useRef, useState } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { Files, Search, Settings, FolderOpen, Download, Save, GitCompareArrows, FilePlus2, FolderPlus, ChevronsDownUp, X, ChevronRight, ChevronDown, Ellipsis, Check, Code2 } from 'lucide-react';
import FileTree from './FileTree';
import { isNativeDesktop, nativeProject, describeNativeError, type NativeBinding } from './nativeProject';
import FileIcon from './FileIcon';
import { buildFileTree, normalizeWorkspacePath, parentPaths, openTab, pinTab, shouldImportPath, type EditorTab } from './workspace';
import './workspace.css';

self.MonacoEnvironment = { getWorker: (_moduleId, label) => label === 'json' ? new JsonWorker() : new EditorWorker() };
interface WorkspaceFile { path: string; name: string; original: string; model: monaco.editor.ITextModel; created?: boolean; native?: NativeBinding }
const examples = [
  { path: 'nebula-cortex/src/App.tsx', content: 'import { Welcome } from "./components/Welcome";\nimport { projectName } from "./utils/project";\n\nexport default function App() {\n  return <Welcome name={projectName} />;\n}\n' },
  { path: 'nebula-cortex/src/components/Welcome.tsx', content: 'interface WelcomeProps {\n  name: string;\n}\n\nexport function Welcome({ name }: WelcomeProps) {\n  return (\n    <main>\n      <h1>Bem-vindo ao {name}</h1>\n      <p>Seu projeto começa aqui.</p>\n    </main>\n  );\n}\n' },
  { path: 'nebula-cortex/src/utils/project.ts', content: 'export const projectName = "Nebula Cortex";\n\nexport function greet(name: string): string {\n  return `Olá, ${name}!`;\n}\n' },
  { path: 'nebula-cortex/src/styles.css', content: ':root {\n  font-family: system-ui, sans-serif;\n  color: #cccccc;\n  background: #1f1f1f;\n}\n\nmain {\n  max-width: 960px;\n  margin: 0 auto;\n  padding: 32px;\n}\n' },
  { path: 'nebula-cortex/docs/arquitetura.md', content: '# Arquitetura\n\nInterface React → backend Rust → motor de agentes.\n\nEsta pasta contém arquivos de demonstração. Abra uma pasta para explorar seus próprios arquivos.\n' },
  { path: 'nebula-cortex/package.json', content: '{\n  "name": "nebula-cortex",\n  "private": true,\n  "version": "0.1.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  }\n}\n' },
  { path: 'nebula-cortex/README.md', content: '# Nebula Cortex\n\nWorkspace de demonstração.\n\n## Editor\n\n- Explore as pastas em árvore.\n- Clique para pré-visualizar; clique duas vezes para manter a aba.\n- Abra uma pasta do computador para importar arquivos de texto.\n- Crie arquivos e pastas em memória.\n- Compare alterações e baixe cópias editadas.\n\nAs edições ficam em memória. Baixe uma cópia antes de recarregar.\n' },
];
function language(name: string) {
  return /\.tsx?$/.test(name) ? 'typescript' : /\.[cm]?jsx?$/.test(name) ? 'javascript' : /\.json$/.test(name) ? 'json' : /\.md$/.test(name) ? 'markdown' : /\.css$/.test(name) ? 'css' : /\.html?$/.test(name) ? 'html' : 'plaintext';
}
function makeFile(path: string, content: string): WorkspaceFile {
  const normalized = normalizeWorkspacePath(path);
  const model = monaco.editor.createModel(content, language(normalized), monaco.Uri.parse(`inmemory://workspace/${crypto.randomUUID()}/${normalized}`));
  model.updateOptions({ tabSize: 2, insertSpaces: true });
  return { path: normalized, name: normalized.split('/').at(-1)!, original: content, model };
}
export default function CodeWorkspace() {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor | null>(null);
  const filesRef = useRef<WorkspaceFile[]>([]);
  const alive = useRef(false);
  const importing = useRef(false);
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState>());
  const reveal = useRef<{ path: string; line: number } | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const quickInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [treeSelection, setTreeSelection] = useState('');
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [expanded, setExpanded] = useState(new Set(['nebula-cortex', 'nebula-cortex/src', 'nebula-cortex/src/components', 'nebula-cortex/src/utils']));
  const [compare, setCompare] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const nativeIds = useRef(new Set<string>());
  const [conflict, setConflict] = useState<{ path: string; disk: string; revision: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [sidebar, setSidebar] = useState<'files' | 'search' | null>('files');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<'files' | 'commands' | null>(null);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIndex, setQuickIndex] = useState(0);
  const [creation, setCreation] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [openEditorsExpanded, setOpenEditorsExpanded] = useState(true);
  const [settings, setSettings] = useState(false);
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [position, setPosition] = useState({ line: 1, column: 1 });
  const [width, setWidth] = useState(245);
  const current = files.find(f => f.path === selected);
  const tree = useMemo(() => buildFileTree(files.map(f => f.path), folders), [files, folders]);
  const dirty = new Set(files.filter(f => f.created || f.model.getValue(undefined, true) !== f.original).map(f => f.path));
  useEffect(() => {
    alive.current = true;
    const next = examples.map(f => makeFile(f.path, f.content));
    filesRef.current = next; setFiles(next); setSelected(next[0].path); setTreeSelection(next[0].path); setTabs([{ path: next[0].path, preview: false }]);
    return () => { alive.current = false; for (const id of nativeIds.current) void nativeProject.close(id).catch(() => {}); nativeIds.current.clear(); filesRef.current.forEach(f => f.model.dispose()); filesRef.current = []; };
  }, []);
  useEffect(() => {
    const listeners = files.map(f => f.model.onDidChangeContent(() => { setRevision(r => r + 1); setTabs(t => pinTab(t, f.path)); }));
    return () => listeners.forEach(l => l.dispose());
  }, [files]);
  useEffect(() => {
    if (!host.current || !current) return;
    let original: monaco.editor.ITextModel | undefined;
    const common = { theme: 'vs-dark', automaticLayout: true, fontSize: 13, fontFamily: 'Menlo, Monaco, Consolas, monospace', minimap: { enabled: minimap }, wordWrap: wordWrap ? 'on' as const : 'off' as const, scrollBeyondLastLine: false, padding: { top: 12 }, ariaLabel: `Editor de ${current.name}` };
    let code: monaco.editor.IStandaloneCodeEditor;
    if (compare) {
      original = monaco.editor.createModel(conflict?.path === current.path ? conflict.disk : current.original, language(current.name));
      const diff = monaco.editor.createDiffEditor(host.current, { ...common, originalEditable: false, renderSideBySide: true });
      diff.setModel({ original, modified: current.model }); editor.current = diff; code = diff.getModifiedEditor();
    } else { code = monaco.editor.create(host.current, { ...common, model: current.model }); editor.current = code; }
    const previous = viewStates.current.get(current.path); if (previous) code.restoreViewState(previous);
    if (reveal.current?.path === current.path) { const line = reveal.current.line; code.setPosition({ lineNumber: line, column: 1 }); code.revealLineInCenter(line); reveal.current = null; }
    const cursor = code.onDidChangeCursorPosition(e => setPosition({ line: e.position.lineNumber, column: e.position.column }));
    const initialPosition = code.getPosition(); if (initialPosition) setPosition({ line: initialPosition.lineNumber, column: initialPosition.column });
    return () => { const state = code.saveViewState(); if (state) viewStates.current.set(current.path, state); cursor.dispose(); editor.current?.dispose(); editor.current = null; original?.dispose(); };
  }, [current, current?.original, compare, minimap, wordWrap, conflict]);
  useEffect(() => { if (quick) quickInput.current?.focus(); }, [quick]);
  function showQuick(mode: 'files' | 'commands') { setQuick(mode); setQuickQuery(''); setQuickIndex(0); }
  function openFile(path: string, pinned = false, line?: number) {
    const file = filesRef.current.find(f => f.path === path); if (!file) return;
    setTabs(t => openTab(t, path, pinned || !!file.created || file.model.getValue(undefined, true) !== file.original));
    setSelected(path); setTreeSelection(path); setExpanded(all => new Set([...all, ...parentPaths(path)]));
    if (line) {
      if (selected === path && editor.current) { const code = 'getModifiedEditor' in editor.current ? editor.current.getModifiedEditor() : editor.current; code.setPosition({ lineNumber: line, column: 1 }); code.revealLineInCenter(line); }
      else reveal.current = { path, line };
    }
    setQuick(null);
  }
  function closeTab(path: string) {
    const index = tabs.findIndex(t => t.path === path); const next = tabs.filter(t => t.path !== path); setTabs(next);
    if (selected === path) {
      const fallback = next[Math.max(0, index - 1)]?.path ?? '';
      setSelected(fallback); setTreeSelection(fallback);
      if (fallback) setExpanded(all => new Set([...all, ...parentPaths(fallback)]));
    }
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const workspace = host.current?.closest('.workspace-content');
      if (!workspace || workspace instanceof HTMLElement && workspace.style.display === 'none') return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'p') { event.preventDefault(); showQuick(event.shiftKey ? 'commands' : 'files'); }
        if (key === 'b') { event.preventDefault(); setSidebar(s => s ? null : 'files'); }
        if (key === 's') { event.preventDefault(); void saveCurrent(); }
        if (key === 'w') { event.preventDefault(); if (selected) closeTab(selected); }
        if (key === 'tab' && tabs.length) { event.preventDefault(); const index = tabs.findIndex(t => t.path === selected); openFile(tabs[(index + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length].path); }
      }
      if (event.key === 'Escape') { setQuick(null); setSettings(false); }
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [selected, tabs, current]);
  function toggleFolder(path: string) { setExpanded(all => { const next = new Set(all); if (next.has(path)) next.delete(path); else next.add(path); return next; }); }
  async function importFiles(list: FileList | null, directory: boolean) {
    if (!list?.length || importing.current) return;
    importing.current = true;
    try {
    const base = treeSelection && !filesRef.current.some(f => f.path === treeSelection) ? treeSelection : parentPaths(selected).at(-1) ?? 'arquivos';
    const candidates = Array.from(list).map(file => ({ file, path: normalizeWorkspacePath(directory ? file.webkitRelativePath || file.name : `${base}/${file.name}`) })).filter(f => shouldImportPath(f.path));
    if (filesRef.current.length + candidates.length > 300 || candidates.reduce((sum, c) => sum + c.file.size, 0) > 15_000_000) { setNotice('Abra até 300 arquivos de texto e 15 MB por importação. Pastas de dependências e builds são ignoradas.'); return; }
      const ready: { path: string; content: string }[] = []; let skipped = list.length - candidates.length;
      const existing = new Set(filesRef.current.map(f => f.path));
      for (const { file, path } of candidates) {
        if (file.size > 1_000_000 || existing.has(path)) { skipped++; continue; }
        const content = await file.text(); if (!alive.current) return;
        if (content.includes('\0')) { skipped++; continue; }
        ready.push({ path, content }); existing.add(path);
      }
      buildFileTree([...filesRef.current.map(f => f.path), ...ready.map(f => f.path)], folders);
      const next = ready.map(f => makeFile(f.path, f.content));
      filesRef.current = [...filesRef.current, ...next]; setFiles(filesRef.current);
      if (next[0]) { setExpanded(all => new Set([...all, ...parentPaths(next[0].path)])); openFile(next[0].path, true); }
      setNotice(`${next.length} arquivo(s) aberto(s) em memória${skipped ? ` · ${skipped} ignorado(s): binários, duplicados ou limites` : ''}.`);
    } catch { setNotice('Não foi possível abrir a seleção. Caminhos em conflito não substituem arquivos existentes.'); } finally { importing.current = false; }
  }
  function createEntry() {
    if (!newName.trim() || !creation) return;
    const base = treeSelection && !files.some(f => f.path === treeSelection) ? treeSelection : parentPaths(selected).at(-1) ?? tree[0]?.path ?? 'workspace';
    try {
      const path = normalizeWorkspacePath(`${base}/${newName.trim()}`);
      if (files.some(f => f.path === path) || folders.includes(path)) throw new Error('Esse nome já existe.');
      if (creation === 'file' && files.length >= 300) throw new Error('Limite de 300 arquivos atingido.');
      const nodes = buildFileTree(files.map(f => f.path), folders);
      const exists = (items: typeof nodes): boolean => items.some(n => n.path === path || n.kind === 'folder' && exists(n.children));
      if (exists(nodes)) throw new Error('Esse nome já existe.');
      buildFileTree([...files.map(f => f.path), ...(creation === 'file' ? [path] : [])], [...folders, ...(creation === 'folder' ? [path] : [])]);
      if (creation === 'folder') { setFolders(all => [...all, path]); setTreeSelection(path); }
      else { const file = makeFile(path, ''); file.created = true; filesRef.current = [...filesRef.current, file]; setFiles(filesRef.current); openFile(path, true); }
      setExpanded(all => new Set([...all, ...parentPaths(path), ...(creation === 'folder' ? [path] : [])]));
      setCreation(null); setNewName(''); setNotice('Criado em memória. Baixe os arquivos para guardar uma cópia.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Nome inválido.'); }
  }
  async function openProject() {
    if (!isNativeDesktop()) { folderInput.current?.click(); return; }
    if (importing.current) return;
    importing.current = true;
    try {
      const project = await nativeProject.open();
      if (!project) return;
      if (!alive.current) { await nativeProject.close(project.id); return; }
      const baseName = project.name.replace(/[\\/\x00-\x1f]/g, '_').trim() || 'Projeto';
      let root = baseName; let suffix = 2;
      while (filesRef.current.some(f => f.path.split('/')[0] === root) || folders.some(f => f.split('/')[0] === root)) root = `${baseName} (${suffix++})`;
      if (filesRef.current.length + project.files.length > 600) { await nativeProject.close(project.id); setNotice('Limite de arquivos do editor atingido. Abra menos projetos.'); return; }
      const next = project.files.map(f => { const file = makeFile(`${root}/${f.path}`, f.content); file.native = { projectId: project.id, path: f.path, revision: f.revision }; return file; });
      nativeIds.current.add(project.id);
      filesRef.current = [...filesRef.current, ...next]; setFiles(filesRef.current);
      setFolders(all => [...all, root, ...project.folders.map(p => `${root}/${p}`)]);
      setExpanded(all => new Set([...all, root]));
      if (next[0]) openFile(next[0].path, true);
      setNotice(`Projeto aberto: ${project.name}. ${next.length} arquivos${project.skipped ? ` · ${project.skipped} ignorados` : ''}${project.truncated ? ' · listagem limitada' : ''}.`);
    } catch (error) { setNotice(describeNativeError(error).message); }
    finally { importing.current = false; }
  }
  async function saveCurrent(comparedRevision?: string) {
    const file = filesRef.current.find(f => f.path === selected);
    if (!file?.native) { setNotice('Este arquivo está em memória. Salvar no disco está disponível para arquivos existentes da pasta aberta no desktop; use “Baixar cópia” para guardar este arquivo.'); return; }
    if (savingRef.current) return;
    const content = file.model.getValue(undefined, true);
    savingRef.current = true; setSaving(true);
    try {
      const result = await nativeProject.save({ ...file.native, revision: comparedRevision ?? file.native.revision }, content);
      if (!alive.current) return;
      file.original = content; file.native.revision = result.revision; file.created = false;
      setConflict(value => value?.path === file.path ? null : value); setRevision(r => r + 1); setNotice(`Salvo: ${file.name}.`);
    } catch (error) {
      const problem = describeNativeError(error);
      if (problem.code === 'CONFLICT') {
        try { const disk = await nativeProject.read(file.native); if (alive.current) setConflict({ path: file.path, disk: disk.content, revision: disk.revision }); } catch { /* Keep the original conflict message and unsaved buffer. */ }
      }
      if (alive.current) setNotice(problem.message);
    } finally { savingRef.current = false; if (alive.current) setSaving(false); }
  }
  function download() {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.model.getValue(undefined, true)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = current.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return files.flatMap(file => file.model.getValue(undefined, true).split('\n').flatMap((text, i) => text.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? [{ path: file.path, name: file.name, line: i + 1, text: text.trim() }] : [])).slice(0, 100);
  }, [query, files, revision]);
  const commands = [
    { name: 'Arquivo: Abrir pasta…', action: () => { void openProject(); } },
    { name: 'Arquivo: Salvar', action: () => { void saveCurrent(); } },
    { name: 'Arquivo: Abrir arquivos…', action: () => fileInput.current?.click() },
    { name: 'Arquivo: Novo arquivo', action: () => { setSidebar('files'); setCreation('file'); setNewName(''); } },
    { name: 'Arquivo: Nova pasta', action: () => { setSidebar('files'); setCreation('folder'); setNewName(''); } },
    { name: 'Exibir: Alternar barra lateral', action: () => setSidebar(s => s ? null : 'files') },
    { name: 'Editor: Alternar minimapa', action: () => setMinimap(v => !v) },
    { name: 'Editor: Alternar quebra de linha', action: () => setWordWrap(v => !v) },
    { name: 'Editor: Comparar com o original', action: () => setCompare(v => !v) },
  ];
  const quickItems = quick === 'commands' ? commands.filter(c => c.name.toLocaleLowerCase().includes(quickQuery.toLocaleLowerCase())) : files.filter(f => f.path.toLocaleLowerCase().includes(quickQuery.toLocaleLowerCase())).slice(0, 100).map(f => ({ name: f.path, action: () => openFile(f.path, true) }));
  const actualQuickIndex = Math.min(quickIndex, Math.max(0, quickItems.length - 1));
  function executeQuick(index: number) { const item = quickItems[index]; if (item) { setQuick(null); item.action(); } }
  const currentPath = current?.path.split('/') ?? [];
  return <section className="code-workspace vscode-workspace" aria-label="Editor integrado">
    <input ref={folderInput} className="sr-only" tabIndex={-1} aria-label="Selecionar pasta do projeto" type="file" multiple {...{ webkitdirectory: '' }} onChange={e => { void importFiles(e.target.files, true); e.target.value = ''; }}/>
    <input ref={fileInput} className="sr-only" tabIndex={-1} aria-label="Selecionar arquivos" type="file" multiple onChange={e => { void importFiles(e.target.files, false); e.target.value = ''; }}/>
    <div className="editor-body"><nav className="activity-bar" aria-label="Painéis do editor"><button className={sidebar === 'files' ? 'active' : ''} aria-label="Explorador de arquivos" aria-pressed={sidebar === 'files'} onClick={() => setSidebar(s => s === 'files' ? null : 'files')}><Files size={23}/></button><button className={sidebar === 'search' ? 'active' : ''} aria-label="Buscar no projeto" aria-pressed={sidebar === 'search'} onClick={() => setSidebar(s => s === 'search' ? null : 'search')}><Search size={23}/></button><button aria-label="Comparar arquivo com o original" aria-pressed={compare} onClick={() => setCompare(v => !v)} disabled={!current}><GitCompareArrows size={23}/>{dirty.size > 0 && <span className="activity-count">{dirty.size}</span>}</button><div className="activity-spacer"/><button aria-label="Configurações do editor" aria-expanded={settings} onClick={() => setSettings(s => !s)}><Settings size={22}/></button></nav>
      {sidebar && <><aside className="file-explorer vscode-explorer" style={{ width }}><div className="vscode-sidebar-heading"><span>{sidebar === 'files' ? 'EXPLORADOR' : 'PESQUISAR'}</span><button className="workspace-icon-button" aria-label="Abrir comandos do editor" onClick={() => showQuick('commands')}><Ellipsis size={18}/></button></div>
        {sidebar === 'files' ? <><div className="folder-actions"><button onClick={() => { void openProject(); }}><FolderOpen size={15}/> Abrir pasta</button><button className="workspace-icon-button" aria-label="Abrir arquivos" onClick={() => fileInput.current?.click()}><Files size={16}/></button></div>
          <button className="explorer-section-heading" aria-expanded={openEditorsExpanded} onClick={() => setOpenEditorsExpanded(v => !v)}>{openEditorsExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} EDITORES ABERTOS <span>{tabs.length}</span></button>
          {openEditorsExpanded && <div className="open-editors">{tabs.map(tab => { const file = files.find(f => f.path === tab.path)!; return <div key={tab.path} className={'open-editor-row ' + (selected === tab.path ? 'selected' : '')}><button aria-label={`Fechar ${file.name}`} className="workspace-icon-button" onClick={() => closeTab(tab.path)}>{dirty.has(tab.path) ? <span className="dirty-indicator">●</span> : <X size={13}/>}</button><button className={tab.preview ? 'preview' : ''} onClick={() => openFile(tab.path, false)}><FileIcon name={file.name}/><span>{file.name}</span><small>{parentPaths(file.path).at(-1)?.split('/').at(-1)}</small></button></div>; })}</div>}
          <div className="workspace-section-header"><span>PASTAS</span><div><button className="workspace-icon-button" aria-label="Novo arquivo" onClick={() => { setCreation('file'); setNewName(''); }}><FilePlus2 size={15}/></button><button className="workspace-icon-button" aria-label="Nova pasta" onClick={() => { setCreation('folder'); setNewName(''); }}><FolderPlus size={15}/></button><button className="workspace-icon-button" aria-label="Recolher todas as pastas" onClick={() => setExpanded(new Set())}><ChevronsDownUp size={15}/></button></div></div>
          {creation && <form className="new-entry-form" onSubmit={e => { e.preventDefault(); createEntry(); }}><label className="sr-only" htmlFor="entry-name">{creation === 'file' ? 'Nome do novo arquivo' : 'Nome da nova pasta'}</label><input autoFocus id="entry-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder={creation === 'file' ? 'nome.ts' : 'nome da pasta'} onKeyDown={e => { if (e.key === 'Escape') setCreation(null); }}/><button className="workspace-icon-button" type="submit" aria-label="Confirmar criação"><Check size={14}/></button><button className="workspace-icon-button" type="button" aria-label="Cancelar criação" onClick={() => setCreation(null)}><X size={14}/></button></form>}
          <FileTree nodes={tree} expanded={expanded} selected={treeSelection} dirty={dirty} onToggle={toggleFolder} onOpen={openFile} onSelectFolder={setTreeSelection}/>
        </> : <div className="workspace-search"><label className="sr-only" htmlFor="workspace-search">Pesquisar texto nos arquivos</label><input autoFocus id="workspace-search" placeholder="Pesquisar nos arquivos" value={query} onChange={e => setQuery(e.target.value)}/><span className="search-result-count">{query ? `${results.length}${results.length === 100 ? '+' : ''} resultado(s)` : 'Busca nos arquivos abertos nesta janela'}</span>{results.map(result => <button className="search-result" key={`${result.path}:${result.line}`} onClick={() => openFile(result.path, true, result.line)}><span><FileIcon name={result.name}/>{result.name}<small>:{result.line}</small></span><code>{result.text}</code><small>{result.path}</small></button>)}</div>}
      </aside><div className="explorer-resize" role="separator" aria-label="Largura do explorador" aria-orientation="vertical" aria-valuemin={165} aria-valuemax={450} aria-valuenow={width} tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setWidth(w => Math.min(450, Math.max(165, w + (e.key === 'ArrowRight' ? 10 : -10)))); } }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(w => Math.min(450, Math.max(165, w + e.movementX))); }}/></>}
      <div className="editor-column"><div className="vscode-tabbar"><div className="editor-tabs" role="tablist" aria-label="Arquivos abertos">{tabs.map(tab => { const file = files.find(f => f.path === tab.path)!; return <div className={'editor-tab ' + (selected === tab.path ? 'active ' : '') + (tab.preview ? 'preview' : '')} key={tab.path}><button role="tab" tabIndex={selected === tab.path ? 0 : -1} onKeyDown={e => { const index = tabs.findIndex(t => t.path === tab.path); let target: EditorTab | undefined; if (e.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length]; if (e.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length]; if (e.key === 'Home') target = tabs[0]; if (e.key === 'End') target = tabs.at(-1); if (target) { e.preventDefault(); openFile(target.path); const model = files.find(f => f.path === target.path)?.model; if (model) document.getElementById(`tab-${model.id}`)?.focus(); } }} id={`tab-${file.model.id}`} aria-selected={selected === tab.path} aria-controls="code-editor-panel" onClick={() => openFile(tab.path)} onDoubleClick={() => setTabs(t => pinTab(t, tab.path))} title={tab.path}><FileIcon name={file.name}/><span>{file.name}</span></button><button className="tab-close" aria-label={`Fechar aba ${file.name}`} onClick={() => closeTab(tab.path)}>{dirty.has(tab.path) ? <span className="dirty-indicator">●</span> : <X size={14}/>}</button></div>; })}</div><div className="tabbar-actions"><button className="workspace-icon-button" aria-label="Salvar arquivo no projeto" title="Salvar (⌘/Ctrl+S)" disabled={!current?.native || saving} onClick={() => { void saveCurrent(); }}><Save size={16}/></button><button className="workspace-icon-button" aria-label="Localizar arquivo" title="Localizar arquivo (⌘/Ctrl+P)" onClick={() => showQuick('files')}><Search size={16}/></button><button className={'workspace-icon-button ' + (compare ? 'active' : '')} aria-label="Alternar comparação" aria-pressed={compare} disabled={!current} onClick={() => setCompare(c => !c)}><GitCompareArrows size={16}/></button><button className="workspace-icon-button" aria-label="Baixar cópia do arquivo" title="Baixar cópia do arquivo" onClick={download} disabled={!current}><Download size={16}/></button></div></div>
        {current && <nav className="editor-breadcrumbs" aria-label="Caminho do arquivo">{currentPath.map((part, i) => <span key={i}>{i > 0 && <ChevronRight size={12}/>} {i === currentPath.length - 1 && <FileIcon name={part}/>} {part}</span>)}{compare && <small>{conflict?.path === current.path ? 'Disco ↔ Sua edição' : 'Original ↔ Alterações'}</small>}</nav>}
        {conflict && conflict.path === current?.path && <div className="workspace-conflict" role="alert"><span>O arquivo mudou no disco. Sua edição está preservada.</span><button onClick={() => setCompare(true)}>Comparar com disco</button>{compare && <button disabled={saving} title="Substituir a versão do disco exibida à esquerda pela edição à direita" onClick={() => { void saveCurrent(conflict.revision); }}>Salvar versão editada</button>}<button onClick={download}>Baixar minha versão</button></div>}
        {notice && <div className="workspace-notice" role="status">{notice}<button className="workspace-icon-button" aria-label="Fechar mensagem do editor" onClick={() => setNotice('')}><X size={13}/></button></div>}
        <div id="code-editor-panel" role="tabpanel" aria-labelledby={current ? `tab-${current.model.id}` : undefined} className="monaco-host" ref={host} style={{ display: current ? 'block' : 'none' }}/>
        {!current && <div className="editor-empty"><Code2 size={72}/><h2>Nebula Cortex</h2><p>Abra um arquivo no explorador para começar.</p><button onClick={() => showQuick('files')}>Localizar arquivo <kbd>⌘ / Ctrl P</kbd></button><button onClick={() => { void openProject(); }}>Abrir pasta <FolderOpen size={17}/></button></div>}
      </div>
    </div>
    <footer className="vscode-statusbar"><span><Files size={13}/> {files.length} arquivos <span className="memory-label">{current?.native ? saving ? '· Salvando…' : '· Projeto local' : '· Edições em memória'}</span></span><div>{current && <><span>Ln {position.line}, Col {position.column}</span><span>Espaços: 2</span><span>UTF-8</span><span>{current.model.getEOL() === '\r\n' ? 'CRLF' : 'LF'}</span><span>{language(current.name)}</span></>}<span>Nebula</span></div></footer>
    {settings && <div className="editor-settings" role="dialog" aria-label="Configurações do editor"><h3>Editor <button className="workspace-icon-button" aria-label="Fechar configurações" onClick={() => setSettings(false)}><X size={14}/></button></h3><label><input type="checkbox" checked={minimap} onChange={e => setMinimap(e.target.checked)}/> Minimap</label><label><input type="checkbox" checked={wordWrap} onChange={e => setWordWrap(e.target.checked)}/> Quebra de linha</label><p>Projetos abertos no desktop permitem salvar no disco. Arquivos da prévia ficam em memória e podem ser baixados como cópia.</p></div>}
    {quick && <div className="quick-overlay" onClick={() => setQuick(null)}><div className="quick-open" role="dialog" aria-modal="true" aria-label={quick === 'files' ? 'Localizar arquivo' : 'Comandos do editor'} onClick={e => e.stopPropagation()}><input ref={quickInput} aria-label={quick === 'files' ? 'Nome ou caminho do arquivo' : 'Buscar comando'} role="combobox" aria-controls="quick-results" aria-expanded="true" aria-activedescendant={quickItems.length ? `quick-${actualQuickIndex}` : undefined} value={quickQuery} onChange={e => { setQuickQuery(e.target.value); setQuickIndex(0); }} placeholder={quick === 'files' ? 'Pesquisar arquivos pelo nome ou caminho' : 'Digite um comando'} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setQuickIndex(i => Math.min(quickItems.length - 1, i + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setQuickIndex(i => Math.max(0, i - 1)); } if (e.key === 'Enter') { e.preventDefault(); executeQuick(actualQuickIndex); } }}/><div id="quick-results" role="listbox" aria-label="Resultados">{quickItems.slice(0, 100).map((item, i) => <div role="option" id={`quick-${i}`} aria-selected={actualQuickIndex === i} className={actualQuickIndex === i ? 'selected' : ''} key={item.name} onClick={() => executeQuick(i)}>{quick === 'files' ? <FileIcon name={item.name}/> : <ChevronRight size={14}/>}<span>{item.name}</span></div>)}{!quickItems.length && <p>Nenhum resultado.</p>}</div></div></div>}
  </section>;
}
