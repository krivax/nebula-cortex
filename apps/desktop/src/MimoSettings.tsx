import { useEffect, useRef, useState } from 'react';
import { X, KeyRound, ShieldCheck } from 'lucide-react';
import { mimoNative, type MimoInfo } from './mimoClient';
import { describeNativeError } from './nativeProject';
export default function MimoSettings({ info, close, saved }: { info: MimoInfo | null; close: () => void; saved: () => Promise<void> }) {
  const [baseUrl, setBaseUrl] = useState(info?.settings.baseUrl ?? 'https://api.xiaomimimo.com/v1');
  const [model, setModel] = useState(info?.settings.model ?? 'mimo-v2.6-flash');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save() {
    setBusy(true); setError('');
    try { await mimoNative.configure({ baseUrl: baseUrl.trim(), model: model.trim(), hasKey: false }, apiKey); setApiKey(''); await saved(); close(); }
    catch (problem) { setError(describeNativeError(problem).message); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true); setError('');
    try { await mimoNative.reset(); setApiKey(''); await saved(); close(); }
    catch (problem) { setError(describeNativeError(problem).message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="mimo-settings" aria-labelledby="mimo-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}>
    <div className="settings-heading"><h2 id="mimo-title"><KeyRound size={21}/> Configurar MiMo</h2><button className="icon-button" aria-label="Fechar configurações" onClick={close} disabled={busy}><X size={18}/></button></div>
    <p>Motor oficial Xiaomi MiMo Code {info?.version ?? '0.1.15'}, conectado à pasta aberta no Editor Nebula.</p>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <label htmlFor="mimo-url">Endereço da API</label><input id="mimo-url" type="url" required value={baseUrl} onChange={e => setBaseUrl(e.target.value)} maxLength={2048} disabled={busy}/>
      <label htmlFor="mimo-model">Modelo</label><input id="mimo-model" required value={model} onChange={e => setModel(e.target.value)} maxLength={128} disabled={busy}/>
      <label htmlFor="mimo-key">Chave de API {info?.settings.hasKey && <small>· chave já guardada</small>}</label><input id="mimo-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} maxLength={8192} placeholder={info?.settings.hasKey ? 'Deixe vazio para manter a chave deste endereço' : 'Cole sua chave de API'} disabled={busy}/>
      <p className="settings-note"><ShieldCheck size={16}/> A chave fica no Keychain do macOS. O modelo recebe o conteúdo da tarefa e os arquivos cujo acesso você aprovar.</p>
      <p className="settings-runtime">{info?.runtimeReady ? 'Motor instalado' : 'Prepare o motor com npm run mimo:prepare'} · {info?.project ? `Projeto: ${info.project}` : 'Abra a pasta do projeto no editor para começar'}</p>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-actions"><button type="button" className="quiet-button" disabled={busy || !info?.settings.hasKey} onClick={() => { void reset(); }}>Remover chave e redefinir</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configuração'}</button></div>
    </form>
  </dialog>;
}
