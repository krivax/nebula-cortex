# Editor nativo Code-OSS

Atualização: 01/10/2026. O aplicativo macOS incorpora o workbench real Code-OSS por meio do fork code-server em uma WebView filha na janela do Nebula. A prévia do navegador continua usando Monaco.

## Base e personalização

- code-server **4.139.1**, commit `53c2f3253bcf32886706fc023e794bbeb253c90f`; workbench empacotado **1.139.1**.
- Node **24.21.0**, macOS ARM64; versão e checksum em `editor/upstream.json`.
- Extensão própria `editor/extensions/nebula-companion`: comando “Nebula: Sobre o editor integrado” e indicador na barra de status.
- Perfil próprio, Dark Modern, telemetria desativada e Workspace Trust habilitado.

O fork upstream é mantido pelo [code-server](https://github.com/coder/code-server). Esta entrega integra e personaliza sua distribuição; não cria um fork independente do repositório completo. A base aberta é [Code-OSS](https://github.com/microsoft/vscode). Recursos proprietários de IA do Cursor e do VS Code não são fornecidos por essa base.

Explorador, abas, divisões, busca, paleta, terminal, Git e host de extensões vêm do workbench upstream. O catálogo padrão é Open VSX; algumas extensões proprietárias estão indisponíveis ou são incompatíveis. Veja a [FAQ upstream](https://github.com/coder/code-server/blob/main/docs/FAQ.md).

## Preparar e executar

Requer Rust/Cargo, ferramentas Xcode e rede durante a preparação. Depois de `npm install`:

```sh
npm run editor:prepare
npm run native:app
```

Abra `target/debug/bundle/macos/Nebula Cortex.app`, clique em **Abrir editor → Abrir projeto** e escolha uma pasta. `npm run desktop:dev` usa o runtime preparado no checkout e inicia o Vite.

O `.app` de teste inclui Node e o servidor; seu editor não depende de Node externo em execução. Ocupa aproximadamente 836 MiB, está homologado apenas em macOS ARM64 e ainda não é uma distribuição assinada/notarizada. O sidecar do agente é um processo separado e foi empacotado na entrega de 01/10/2026; veja [AGENT-TRANSPORT.md](AGENT-TRANSPORT.md).

A preparação verifica SHA-256 do Node oficial e fixa a versão do code-server. As quatro substituições em `editor/dependency-patches.json` verificam SHA-512 dos arquivos npm oficiais. `editor/runtime-package-lock.json` registra a árvore instalada; uma instalação limpa por `npm ci` dessa árvore vendorizada ainda não foi validada. `.editor-runtime` é gerado e ignorado pelo Git.

## Ciclo de vida e acesso

O Rust abre o seletor nativo, inicia o servidor em **127.0.0.1** numa porta efêmera e cria uma senha aleatória por processo. Autentica a sessão e instala um cookie HttpOnly na WebView filha. Senha e cookie não chegam ao React. A navegação da filha fica limitada à origem local do editor; apenas a WebView principal recebe capabilities Tauri.

Alternar para a conversa oculta a WebView e mantém sessão/terminal. Posição e tamanho são aplicados juntos. O processo é monitorado; após falha, a interface permite reabrir. Fechar o projeto encerra servidor e grupo de processos. Isso não garante encerramento de todos os processos que um shell possa destacar em sessões próprias.

**O editor manual opera com os privilégios do usuário**, como uma IDE local. Terminal e extensões podem acessar outros arquivos; a seleção inicial de uma pasta não é sandbox. Workspace Trust permanece habilitado para pastas não confiáveis. As ferramentas do agente continuam recusadas até implementar o executor e sua política de permissões. O broker limitado em `packages/native-project` é separado e não controla o filesystem desse workbench.

Perfil e extensões ficam no diretório local de dados Tauri, em `code-oss/`; configurações existentes são preservadas. Recuperação upstream de buffers após falha ainda não foi validada manualmente.

## Verificações

- TypeScript, 12 testes JS/TS e 10 testes Rust passaram.
- `.app` com runtime embutido abriu o workbench autenticado dentro do Nebula.
- Pasta descartável: árvore, leitura/gravação conferida no disco, criação de arquivo Markdown no disco, Cmd+A/S/Z/W e refazer, divisão em duas colunas, ampliação/restauração da janela, fechamento/reabertura do projeto, comando `printf` no terminal, alternância conversa/editor preservando a sessão e extensão Nebula ativa.
- Auditoria npm da árvore preparada após as substituições: zero vulnerabilidades reportadas. Não é uma auditoria integral de segurança de toda a distribuição upstream.

A sessão anterior deixou de responder em sua porta local após fechar; a sessão reaberta respondeu ao endpoint de saúde em outra porta. Captura: `docs/code-oss-editor-preview.png`. Instalação de extensões externas, depuração de projeto real, recuperação após crash e execução em máquina limpa ainda precisam de validação. IA real, plugins/MCP do Nebula e geração de imagens continuam pendentes.

## Licenças

O pacote inclui `node/LICENSE`, licenças MIT em `notices/` e avisos upstream preservados em `server/node_modules/code-server/ThirdPartyNotices.txt`. Origem das cópias em `editor/third-party/NOTICE.md`.
