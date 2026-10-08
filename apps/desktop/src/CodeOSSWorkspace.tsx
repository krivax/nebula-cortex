import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Code2, FolderOpen, LoaderCircle, X } from 'lucide-react';
import { describeNativeError } from './nativeProject';
import './code-oss.css';

interface EditorInfo { project: string; distribution: string; version: string }
interface EditorBounds { x: number; y: number; width: number; height: number }
export default function CodeOSSWorkspace({ visible = true }: { visible?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const lastBounds = useRef<EditorBounds>({ x: 0, y: 110, width: 640, height: 450 });
  const [info, setInfo] = useState<EditorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  function bounds() {
    const rect = host.current?.getBoundingClientRect();
    if (rect && rect.width >= 40 && rect.height >= 40) lastBounds.current = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    return lastBounds.current;
  }
  useEffect(() => {
    mounted.current = true;
    void invoke<EditorInfo | null>('code_oss_status').then(state => {
      if (mounted.current && state) setInfo(state);
    }).catch(() => { /* No active editor to restore. */ });
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!info) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { void invoke('resize_code_oss', { bounds: bounds(), visible }).catch(() => { if (mounted.current) setError('Não foi possível ajustar a área do editor.'); }); });
    };
    const observer = new ResizeObserver(resize);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize', resize);
    resize();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [info, visible]);
  useEffect(() => {
    if (!info) return;
    const timer = window.setInterval(() => {
      void invoke<EditorInfo | null>('code_oss_status').then(state => {
        if (!state && mounted.current) {
          void invoke('resize_code_oss', { bounds: bounds(), visible: false }).catch(() => {});
          setInfo(null); setError('O processo do editor encerrou. Abra o projeto novamente para retomar.');
        }
      }).catch(() => { if (mounted.current) setError('Não foi possível consultar o processo do editor.'); });
    }, 5000);
    return () => clearInterval(timer);
  }, [info]);
  async function open() {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const result = await invoke<EditorInfo | null>('open_code_oss', { bounds: bounds() });
      if (mounted.current && result) {
        setInfo(result);
        // The user may return to the conversation while the native picker/server is opening.
        const shown = !!host.current?.getClientRects().length;
        await invoke('resize_code_oss', { bounds: bounds(), visible: shown });
      }
    } catch (problem) { if (mounted.current) setError(describeNativeError(problem).message); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }
  async function close() {
    if (busy.current) return;
    if (!window.confirm('Fechar o projeto e encerrar o editor? Salve os arquivos e encerre as tarefas do terminal antes de continuar.')) return;
    busy.current = true; setLoading(true);
    try { await invoke('close_code_oss'); if (mounted.current) { setInfo(null); setError(''); } }
    catch (problem) { if (mounted.current) setError(describeNativeError(problem).message); }
    finally { busy.current = false; if (mounted.current) setLoading(false); }
  }
  return <section className="code-oss-workspace" aria-label="Editor Nebula integrado">
    <div className="code-oss-toolbar"><span><Code2 size={16}/>{info ? info.project : 'Editor Nebula'} <small>Editor Nebula</small></span><div>{info && <span className="code-oss-runtime">{info.distribution} {info.version}</span>}{info ? <button disabled={loading} onClick={() => { void close(); }}><X size={14}/> Fechar projeto</button> : <button disabled={loading} onClick={() => { void open(); }}>{loading ? <LoaderCircle className="code-oss-spinner" size={14}/> : <FolderOpen size={14}/>} Abrir projeto</button>}</div></div>
    {error && <p className="code-oss-error" role="alert">{error}</p>}
    <div ref={host} className="code-oss-host">{!info && <div className="code-oss-welcome"><Code2 size={64}/><h2>Seu projeto no Editor Nebula</h2><p>O workbench completo do VS Code, integrado ao Nebula.</p><p>Explore arquivos, use o terminal, revise o Git e gerencie extensões.</p><button disabled={loading} onClick={() => { void open(); }}>{loading ? <><LoaderCircle className="code-oss-spinner" size={18}/> Preparando editor…</> : <><FolderOpen size={18}/> Abrir pasta do projeto</>}</button></div>}</div>
  </section>;
}
