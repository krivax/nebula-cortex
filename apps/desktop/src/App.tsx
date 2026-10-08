import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, Plus, MessageSquare, Folder, Download, PanelRight, Sparkles, Code2, FileText, ShieldCheck, Orbit, X, Check, Terminal, Settings2 } from 'lucide-react';
import type { AgentEvent, Engine } from '../../../packages/protocol/src/index';
import { runConversation } from './agentTransport';
import { decodeSessions, newConversation, updateMessage, STORAGE_KEY, type Conversation } from './store';
import { describeNativeError, isNativeDesktop } from './nativeProject';
import { mimoNative, type MimoInfo } from './mimoClient';
import MimoSettings from './MimoSettings';

const suggestions = [
  { icon: Code2, title: 'Começar uma implementação', description: 'Transforme uma ideia em um plano de código', prompt: 'Leia a estrutura do projeto e proponha o próximo recurso a implementar.' },
  { icon: FileText, title: 'Entender um projeto', description: 'Explore a arquitetura e os próximos passos', prompt: 'Leia o README e explique a arquitetura deste projeto.' },
  { icon: ShieldCheck, title: 'Revisar uma abordagem', description: 'Encontre riscos antes de desenvolver', prompt: 'Revise o projeto e apresente os problemas mais importantes antes de alterar os arquivos.' },
];
const CodeWorkspace = lazy(() => isNativeDesktop() ? import('./CodeOSSWorkspace') : import('./CodeWorkspace'));
const native = isNativeDesktop();
type Permission = Extract<AgentEvent, { type: 'permission' }>;
function readInitial(): { sessions: Conversation[]; error: string } {
  try { const sessions = decodeSessions(localStorage.getItem(STORAGE_KEY)); return { sessions: sessions.length ? sessions : [newConversation(native ? 'mimo' : 'mock')], error: '' }; }
  catch { return { sessions: [newConversation(native ? 'mimo' : 'mock')], error: 'Não foi possível recuperar o histórico. O original foi preservado; exporte a conversa antes de sair.' }; }
}
export default function App() {
  const [initial] = useState(readInitial);
  const [sessions, setSessions] = useState(initial.sessions);
  const [selected, setSelected] = useState(initial.sessions[0].id);
  const [input, setInput] = useState('');
  const [error, setError] = useState(initial.error);
  const [panel, setPanel] = useState(false);
  const [view, setView] = useState<'chat' | 'editor'>('chat');
  const [editorOpened, setEditorOpened] = useState(false);
  const [running, setRunning] = useState(false);
  const [nativeVersion, setNativeVersion] = useState('');
  const [mimo, setMimo] = useState<MimoInfo | null>(null);
  const [settings, setSettings] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [replying, setReplying] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const preparing = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const conversation = sessions.find(s => s.id === selected) ?? sessions[0];
  const engine = conversation.engine ?? 'mock';
  async function refreshMimo() { const info = await mimoNative.status(); setMimo(info); return info; }
  useEffect(() => {
    if (initial.error) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); }
    catch { setError('O armazenamento local está indisponível ou cheio. Exporte seu histórico para preservá-lo.'); }
  }, [sessions, initial.error]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation.messages, permissions]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (native) void import('@tauri-apps/api/core').then(({ invoke }) => invoke<string>('backend_version')).then(setNativeVersion).catch(() => setError('Falha ao conectar ao backend nativo.'));
  }, []);
  useEffect(() => {
    if (!native) return;
    void refreshMimo().catch(() => {});
    const timer = setInterval(() => { void refreshMimo().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [view]);
  function createConversation() {
    if (sessions.length >= 100) { setError('Limite de 100 conversas. Exporte o histórico.'); return; }
    const next = newConversation(native ? 'mimo' : 'mock'); setSessions(s => [next, ...s]); setSelected(next.id); setInput('');
  }
  function openSettings() { setView('chat'); setSettings(true); }
  function exportHistory() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, conversation }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `nebula-${conversation.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reply(permission: Permission, allow: boolean) {
    if (replying || !controller.current || controller.current.signal.aborted) return;
    setReplying(permission.permissionId);
    try { await mimoNative.reply(permission.requestId, permission.sessionId, permission.permissionId, allow); }
    catch (problem) { setError(describeNativeError(problem).message); }
    finally { setReplying(null); }
  }
  async function send() {
    const prompt = input.trim();
    if (!prompt || controller.current || preparing.current) return;
    if (prompt.length > 32000) { setError('A tarefa deve ter até 32.000 caracteres.'); return; }
    let projectId = conversation.projectId;
    let model: string | undefined;
    preparing.current = true;
    try {
      if (engine === 'mimo') {
        if (!native) { setError('Abra o aplicativo desktop para usar o MiMo.'); return; }
        const info = await refreshMimo();
        if (!info.runtimeReady || !info.settings.hasKey) { openSettings(); setError('Configure o motor e a chave de API para usar o MiMo.'); return; }
        if (!info.projectId) { setEditorOpened(true); setView('editor'); setError('Abra a pasta do projeto no editor antes de enviar a tarefa.'); return; }
        if (projectId && projectId !== info.projectId) { setError('Esta conversa pertence a outra pasta. Abra o projeto original ou crie uma nova conversa.'); return; }
        projectId = info.projectId; model = info.settings.model;
      }
    } catch (problem) { setError(describeNativeError(problem).message); return; }
    finally { preparing.current = false; }
    const sessionId = conversation.id; const requestId = crypto.randomUUID(); const assistantId = crypto.randomUUID();
    const abort = new AbortController(); controller.current = abort; setRunning(true); setInput(''); setError(''); setPermissions([]);
    setSessions(all => all.map(s => s.id !== sessionId ? s : { ...s, projectId, title: s.messages.length ? s.title : prompt.slice(0, 44), messages: [...s.messages, { id: crypto.randomUUID(), role: 'user', content: prompt, engine }, { id: assistantId, role: 'assistant', content: '', status: 'running', engine, model }] }));
    try {
      await runConversation({ version: 1, type: 'run', requestId, sessionId, prompt, engine, ...(projectId ? { projectId } : {}) }, abort.signal, event => {
        if (event.type === 'permission') setPermissions(p => [...p.filter(v => v.permissionId !== event.permissionId), event]);
        if (event.type === 'permission_resolved') setPermissions(p => p.filter(v => v.permissionId !== event.permissionId));
        if (event.type === 'finished') setPermissions([]);
        setSessions(all => all.map(s => s.id !== sessionId ? s : { ...s, messages: s.messages.map(m => m.id !== assistantId ? m : updateMessage(m, event)) }));
      });
    } catch {
      setError('Não foi possível concluir a resposta. Envie uma nova tarefa para tentar novamente.');
      setSessions(all => all.map(s => s.id !== sessionId ? s : { ...s, messages: s.messages.map(m => m.id !== assistantId ? m : { ...m, status: abort.signal.aborted ? 'cancelled' : 'failed' }) }));
    } finally { controller.current = null; setRunning(false); setPermissions([]); }
  }
  const projectName = mimo?.project ?? 'Nenhum projeto aberto';
  return <div className={'app-shell ' + (view === 'editor' ? 'editor-mode' : '')}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><Orbit size={22}/></span><div>Nebula <strong>Cortex</strong><small>SEU ESPAÇO DE DESENVOLVIMENTO</small></div></div>
      <button className="new-chat" onClick={() => { createConversation(); setView('chat'); }}><Plus size={17}/> Nova conversa <span>＋</span></button>
      <div className="section-label">PROJETO <Folder size={13}/></div>
      <button className="project project-link" onClick={() => { setEditorOpened(true); setView('editor'); }}><span className="project-icon">N</span><div>{native ? projectName : 'Prévia do navegador'}<small>{mimo?.project ? 'Editor Nebula · MiMo Code' : 'Clique para abrir o editor'}</small></div></button>
      <div className="section-label conversations-label">CONVERSAS <span>{sessions.length}</span></div>
      <nav className="conversations" aria-label="Conversas">{sessions.map(s => <button key={s.id} className={selected === s.id ? 'conversation selected' : 'conversation'} onClick={() => { setSelected(s.id); setInput(''); setView('chat'); }}><MessageSquare size={15}/><span>{s.title}</span>{s.engine === 'mimo' && <small className="engine-tag">MiMo</small>}</button>)}</nav>
      <div className="sidebar-footer"><span className="avatar">K</span><div>Workspace pessoal<small>{native ? 'MiMo + Editor Nebula · v0.1' : 'Prévia local · v0.1'}</small></div><span className="status-dot"/></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb"><Folder size={15}/><span>{mimo?.project ?? 'Nebula Cortex'}</span><span className="slash">/</span><strong>{conversation.title}</strong></div><div className="header-actions">{native && <button className="editor-toggle" onClick={openSettings} disabled={running}><Settings2 size={15}/> Configurar MiMo</button>}{permissions.length > 0 && view === 'editor' && <button className="permission-alert" onClick={() => setView('chat')}>Autorizar acesso ({permissions.length})</button>}<button className="editor-toggle" aria-pressed={view === 'editor'} onClick={() => { setEditorOpened(true); setView(v => v === 'chat' ? 'editor' : 'chat'); }}><Code2 size={16}/>{view === 'editor' ? 'Voltar à conversa' : 'Abrir editor'}</button><button className="icon-button" aria-label="Exportar conversa" title="Exportar conversa" onClick={exportHistory}><Download size={17}/></button><button className={'icon-button ' + (panel ? 'active' : '')} aria-label="Mostrar detalhes do ambiente" aria-pressed={panel} onClick={() => setPanel(p => !p)}><PanelRight size={18}/></button></div></header>
      {error && <div className="error" role="alert">{error}<button aria-label="Fechar aviso" onClick={() => setError('')}><X size={14}/></button></div>}
      <div className="workspace-content" style={{ display: view === 'editor' ? 'flex' : 'none' }}>{editorOpened && <Suspense fallback={<p className="editor-loading">Abrindo editor…</p>}><CodeWorkspace visible={view === 'editor'}/></Suspense>}</div>
      <div className="content-area" style={{ display: view === 'chat' ? 'flex' : 'none' }}><div className="chat-area">
        <div className="messages">{conversation.messages.length === 0 ? <div className="welcome">
          <div className="eyebrow"><span className="status-dot"/> {engine === 'mimo' ? 'XIAOMI MIMO CODE + CODE-OSS' : 'UM NOVO ESPAÇO PARA SUAS IDEIAS'}</div>
          <h1>Da ideia ao código.<br/><span>Com você no controle.</span></h1>
          <p>{engine === 'mimo' ? 'Converse com o MiMo e trabalhe na mesma pasta do editor.' : 'Explore o chat com respostas de demonstração.'}<br/>Por onde vamos começar?</p>
          <div className="suggestions">{suggestions.map(({ icon: Icon, title, description, prompt }) => <button key={title} onClick={() => setInput(prompt)}><Icon size={20}/><strong>{title}</strong><span>{description}</span><span className="card-arrow">↗</span></button>)}</div>
          <div className="demo-note"><Sparkles size={14}/><span>{engine === 'mimo' ? mimo?.settings.hasKey ? 'MiMo configurado. Leituras, edições e comandos pedem sua autorização.' : 'Configure sua chave de API e abra o projeto para começar.' : 'Modo simulado ativo, sem consumo de API.'}</span></div>
        </div> : <div className="thread">{conversation.messages.map(m => <article key={m.id} className={'message ' + m.role}><div className={'message-avatar ' + m.role}>{m.role === 'assistant' ? <Orbit size={19}/> : 'K'}</div><div className="message-body"><div className="message-heading">{m.role === 'assistant' ? 'Nebula' : 'Você'}{m.role === 'assistant' && <small>{m.engine === 'mimo' ? `MiMo · ${m.model ?? 'Code'}` : 'Simulado'}</small>}</div><div className="message-text">{m.content || (m.status === 'running' ? 'Preparando resposta…' : 'Resposta sem texto.')}</div>{m.tools?.map(tool => <div key={tool.toolId} className={'tool-record ' + tool.status}><Terminal size={13}/><strong>{tool.name}</strong><span>{tool.description}</span><small>{tool.status === 'completed' ? 'Concluído' : tool.status === 'cancelled' ? 'Interrompido' : tool.status === 'error' ? 'Falhou' : tool.status === 'running' ? 'Executando' : 'Preparando'}</small></div>)}{m.status && <div className={'run-status ' + m.status}>{m.status === 'running' ? `● ${m.activity ?? 'Respondendo'}` : m.status === 'cancelled' ? '■ Interrompido' : m.status === 'failed' ? 'Falha na resposta' : <><Check size={12}/> Concluído</>}</div>}</div></article>)}<div ref={bottom}/></div>}</div>
        {permissions.length > 0 && <div className="permission-list" aria-live="polite">{permissions.map(permission => <section className="permission-card" key={permission.permissionId} aria-label="Pedido de autorização MiMo"><h3><ShieldCheck size={17}/> MiMo solicita: {permission.permission}</h3><p>Projeto: {mimo?.project ?? projectName}. Autorize esta operação uma vez ou recuse.</p><pre>{permission.patterns.join('\n')}</pre>{permission.detail && <details open><summary>Alteração proposta</summary><pre>{permission.detail}</pre></details>}<div><button disabled={!!replying} onClick={() => { void reply(permission, false); }}>Recusar</button><button className="primary-button" disabled={!!replying} onClick={() => { void reply(permission, true); }}>{replying === permission.permissionId ? 'Enviando…' : 'Permitir uma vez'}</button></div></section>)}</div>}
        <div className="composer-wrap"><form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="sr-only" htmlFor="prompt">Sua tarefa</label><textarea id="prompt" value={input} onChange={e => setInput(e.target.value)} placeholder="Descreva uma tarefa ou compartilhe uma ideia…" rows={3} maxLength={32000} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><div className="composer-toolbar"><label className="model-label"><span className="model-dot"/><select aria-label="Motor da conversa" value={engine} disabled={running || conversation.messages.length > 0} onChange={e => { const value = e.target.value as Engine; setSessions(all => all.map(s => s.id !== selected ? s : { ...s, engine: value })); }}><option value="mock">Nebula · Simulado</option><option value="mimo" disabled={!native}>Xiaomi · MiMo Code</option></select></label><div className="composer-actions"><span className="local-label"><ShieldCheck size={13}/>{engine === 'mimo' ? 'Ferramentas com autorização' : 'Sem ferramentas locais'}</span>{running ? <button className="send-button stop" type="button" aria-label="Interromper resposta" onClick={() => { controller.current?.abort(); setPermissions([]); }}><Square size={15}/></button> : <button className="send-button" type="submit" aria-label="Enviar tarefa" disabled={!input.trim()}><ArrowUp size={19}/></button>}</div></div></form><div className="composer-hint"><span>Enter para enviar · Shift + Enter para nova linha</span><span>{engine === 'mimo' ? mimo?.settings.model ?? 'Configure o modelo' : 'Respostas de demonstração'}</span></div></div>
      </div>{panel && <aside className="details"><div className="details-title">Ambiente <button className="icon-button" aria-label="Fechar detalhes" onClick={() => setPanel(false)}><X size={16}/></button></div><div className="detail-card"><Folder size={19}/><h3>{projectName}</h3><p>{mimo?.project ? 'A pasta do Editor Nebula é o diretório de trabalho do MiMo. Cada conversa fica vinculada ao projeto em que começou.' : 'Abra a pasta pelo editor para conectar os arquivos ao MiMo.'}</p></div><div className="detail-card"><Terminal size={19}/><h3>Motor de agentes</h3><p>{native ? `MiMo Code ${mimo?.version ?? '0.1.15'} · ${mimo?.runtimeReady ? 'instalado' : 'não preparado'}. Sessões e ferramentas supervisionadas pelo Rust.` : 'Streaming simulado nesta prévia do navegador.'}</p><span className="detail-tag">{nativeVersion ? `Tauri · ${nativeVersion}` : 'Prévia no navegador'}</span></div><div className="detail-card"><ShieldCheck size={19}/><h3>Histórico e credenciais</h3><p>Conversas salvas nesta janela. O MiMo mantém suas sessões no disco. Chave de API no Keychain do macOS.</p></div></aside>}</div>
      <footer className="statusbar"><span><span className="status-dot"/> {running ? 'Tarefa em andamento' : 'Pronto para começar'}</span><span>{engine === 'mimo' ? `MiMo Code · ${mimo?.settings.hasKey ? 'Chave configurada' : 'Configure a API'}` : 'Motor simulado · Sem API'}</span></footer>
    </main>
    {settings && <MimoSettings info={mimo} close={() => setSettings(false)} saved={async () => { await refreshMimo(); setError(''); }}/>}</div>;
}
