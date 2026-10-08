export interface ModelCapabilities { tools: boolean; vision: boolean; contextWindow: number }
export interface ProviderAdapter {
  id: string;
  models: { id: string; name: string; capabilities: ModelCapabilities }[];
  stream(prompt: string, signal: AbortSignal): AsyncIterable<string>;
}
export class MockProvider implements ProviderAdapter {
  id = 'mock';
  models = [{ id: 'nebula-simulated', name: 'Nebula · Simulado', capabilities: { tools: false, vision: false, contextWindow: 32000 } }];
  constructor(private delayMs = 35) {}
  async *stream(prompt: string, signal: AbortSignal) {
    const response = `Recebi sua tarefa: “${prompt}”\n\nEste é o primeiro protótipo do Nebula Cortex. A conversa já transmite a resposta de forma incremental e pode ser interrompida.\n\nPara executar essa tarefa em um projeto real, as próximas entregas conectarão os provedores de modelos e as ferramentas autorizadas pelo backend. Neste modo simulado, nenhum arquivo é acessado e nenhum comando é executado.\n\nVocê pode criar outra conversa, testar o cancelamento ou exportar este histórico.`;
    for (const token of response.match(/\S+\s*/g) ?? []) {
      if (signal.aborted) return;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, this.delayMs);
        signal.addEventListener('abort', done, { once: true });
      });
      if (signal.aborted) return;
      yield token;
    }
  }
}
