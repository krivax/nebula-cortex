# Nebula: fork desktop MiMo Code + editor Code-OSS

Entrega de 01/10/2026. O desktop principal agora usa um fork local do código oficial Xiaomi MiMo Code, com Electron/Solid e o editor Code-OSS/code-server existente em uma view nativa dentro da mesma janela. A interface React/Tauri anterior permanece disponível separadamente.

## Atualização visual de 02/10/2026

A interface histórica de programação foi substituída por um workspace baseado na [demonstração pública atual do MiMo Desktop](https://mimo-ai.xiaomimimo.com/desktop/). A referência apresenta navegação lateral de tarefas, plugins, artefatos, projetos e histórico, com compositor central em tema claro. O Nebula agora segue essa organização e mantém sua identidade e seu editor Code-OSS.

Essa interface é uma implementação própria sobre o fork histórico; não é o código da interface comercial atual. As funções não disponíveis estão indicadas na própria tela, sem simular instalações ou execução.

- Nova tarefa abre a conversa real do motor, com rascunho e anexos. Agente profissional e modelo aparecem no compositor; os modelos padrão continuam configurados por finalidade.
- Tarefas recentes e busca usam sessões reais do motor; selecionar uma tarefa reabre sua conversa.
- Projetos abrem pelo seletor nativo. Sem projeto selecionado, tarefas usam uma pasta privada do aplicativo.
- Artefatos listam os arquivos da pasta, navegam por subpastas e mostram prévia de texto por meio do motor.
- Plugins e MCP mostram o acesso às extensões do editor e o estado real das conexões. MCP remoto e local via stdio podem ser cadastrados nas configurações; o instalador de plugins do assistente continua pendente.
- Autorizações consultam os pedidos reais e encaminham para a conversa correspondente.

`npm run dev` e `npm run desktop:dev` abrem o desktop principal. `npm run dev:legacy` abre a prévia React anterior em 1420. Uma aba já aberta em 1420 não passa automaticamente a mostrar o aplicativo Electron.

## Procedência

O repositório [XiaomiMiMo/MiMo-Code](https://github.com/XiaomiMiMo/MiMo-Code) é oficial. Sua revisão atual já não inclui `packages/desktop`: o commit `f0293bf8ca10e8e3d1241e179f2c6a602e2132c9` removeu os pacotes desktop/web sem manutenção. Recuperamos a revisão oficial `14dfe68a1c121f859544ba810b3c308e8501bfb2`, versão 0.1.15, anterior à remoção.

Essa interface é uma superfície histórica herdada. Não estabelecemos equivalência com a interface comercial atualmente distribuída como MiMo Desktop. O fork foi criado **localmente**, na branch `codex/nebula-desktop`, e não foi publicado na conta GitHub do usuário. O remote `upstream` aponta para a Xiaomi; a licença e a política adicionais foram preservadas.

A origem, o commit e o compilador estão fixados em `integrations/mimo-desktop/upstream.json`. `nebula.patch` registra as adaptações, incluindo arquivos novos. `desktop:fork:prepare` recupera a revisão fixada e aplica o patch em uma nova máquina. O `bun.lock` original não foi alterado.

## Preparar, testar e executar

A preparação contempla macOS ARM64, Linux x64/ARM64 com glibc e Windows x64 nativo; os requisitos e a evidência de validação estão em [MULTIPLATAFORMA.md](MULTIPLATAFORMA.md). O script prepara Bun 1.3.14 localmente com SHA-512 verificado, instala as dependências com `bun ci --ignore-scripts` e prepara o Electron oficial. Os scripts de instalação nativa do motor CLI histórico são dispensados: usamos o binário oficial MiMo 0.1.15 já integrado.

```sh
npm ci
npm run desktop:fork:prepare
npm run desktop:fork:test
npm run desktop:fork:integration
npm run desktop:dev
```

`desktop:dev` executa o novo desktop, sem depender do Vite em 1420. A página em 1420 continua sendo a prévia React anterior. Para gerar o aplicativo:

```sh
npm run desktop:fork:app
```

O resultado é `.desktop-fork/packages/desktop/dist/mac-arm64/Nebula Cortex.app`. O pacote inclui MiMo, Node e Code-OSS; não requer Bun/Node externos para abrir. É um pacote de desenvolvimento local sem assinatura/notarização de distribuição. A versão anterior continua em `target/debug/bundle/macos/Nebula Cortex.app`, com `desktop:legacy:dev` para desenvolvimento Tauri.

## Configurar modelos

Abra **Configurações de IA** na barra superior. Cadastre um ou mais provedores: Xiaomi, OpenRouter, Hugging Face, Ollama ou outro endpoint OpenAI compatível. Para cada modelo, informe o ID exato, limites de contexto/saída e capacidades. Depois escolha o perfil para código, textos, pesquisas, criar imagens, criar vídeos e analisar imagens. O mesmo perfil pode ser atribuído a várias finalidades.

Os limites declarados devem corresponder ao modelo/provedor. A marcação de capacidade é uma configuração do usuário, não uma certificação automática da API. A API de chat deve ser compatível com OpenAI; modelos exclusivos de imagem/vídeo não são registrados no adaptador de chat.

Código, textos, pesquisas e análise de imagens são enviados ao provedor/modelo resolvido para o agente selecionado no compositor da conversa. Um modelo específico por agente pode substituir o padrão da finalidade. Anexos exigem a capacidade de visão. Desenvolvimento usa ferramentas de programação; textos e visão permitem perguntas sem ferramentas de execução; pesquisa permite consultas web sujeitas a autorização. Modelos incompatíveis com ferramentas, streaming ou imagens podem ser recusados pelo provedor. Não há troca silenciosa para outro modelo.

As atribuições para **criação de imagem e vídeo** estão disponíveis e persistem, mas seus fluxos de execução ainda exigem adaptadores para as APIs específicas de mídia. Escolher um modelo ali não habilita automaticamente geração de imagem/vídeo pela API de chat.

Ollama em loopback dispensa chave. Provedores remotos exigem chave. Os endpoints aceitam HTTPS e HTTP local; URLs com credenciais ou parâmetros são rejeitadas. As chaves são criptografadas com Electron `safeStorage`, que usa o mecanismo seguro do sistema, e vinculadas ao ID do provedor e ao endpoint. Alterar o endpoint não reutiliza a chave antiga. As credenciais não entram no patch ou no repositório. As configurações são gravadas atomicamente com modo 0600.

Salvar recarrega o assistente e reinicia o motor no mesmo endereço local. O editor mantém sua view e seus buffers. O salvamento é recusado enquanto tarefas conhecidas estão ativas. Os diálogos antigos de conexão de provedores encaminham ao novo armazenamento seguro.

## Projetos, editor e dados

O fork conserva a interface de projetos e sessões do upstream. As sessões do motor ficam em SQLite no perfil desktop, e o estado visual usa armazenamento local do aplicativo. Foi verificada a retomada de histórico após reiniciar o motor. Os perfis anteriores do Tauri continuam no aplicativo legado; **não há migração automática** dessas conversas nesta entrega.

**Editor Nebula**, baseado no Code-OSS, abre uma pasta e apresenta a IDE real, incluindo explorador em árvore, abas, busca, Git, terminal e extensões. A opção de abrir um projeto com VS Code/Cursor dentro do assistente encaminha ao editor integrado. Alternar para Assistente apenas oculta a view; retornar preserva as abas e alterações. Trocar a pasta ou fechar a janela respeita o aviso de alterações não salvas do editor.

O editor usa um servidor autenticado em loopback, com cookie em uma sessão isolada e sem preload/IPC do Nebula. O motor também usa uma senha aleatória em loopback. A execução manual no editor e os comandos aprovados do motor operam com os privilégios do usuário. Workspace Trust continua habilitado.

O MCP interno do Operador Nebula conecta ferramentas do navegador e do computador ao motor. Servidores remotos usam token Bearer criptografado e acesso por agente. Programas locais via stdio têm comando explícito, confirmação nativa antes da ativação e a mesma autorização das ferramentas. OAuth, instalador de plugins e os fluxos de geração de mídia continuam no desenvolvimento posterior. Detalhes em [CONEXOES-MCP-NEBULA.md](CONEXOES-MCP-NEBULA.md). A configuração automática de plugins do motor está desabilitada. Os agentes e seu escopo estão em [AGENTES-NEBULA.md](AGENTES-NEBULA.md).

## Verificação

- Typecheck do desktop e dos pacotes referenciados.
- Dezesseis testes de roteamento/configuração, agentes e inspeção técnica, além de quatro regressões do envio de prompts do upstream.
- Teste de integração com o binário oficial, API local controlada e armazenamento seguro real: modelos por finalidade, reutilização, endpoint vinculado à chave, arquivo criptografado, histórico após reiniciar, lista de tarefas, lista e prévia de arquivos, escrita após aprovação, delegação supervisionada com modelo por especialista, aprovação das ferramentas delegadas e Ollama sem chave.
- Regressão dos 26 testes existentes do Nebula.
- Interface nativa: salvar e recarregar configurações; abrir Code-OSS; explorar arquivos e gravar no disco; manter assistente e editor na mesma pasta; fechar o pacote com o editor aberto e reabrir sem erro.
- Nova interface nativa: enviar tarefas, alternar de código para textos e conferir o modelo recebido pela API local, reabrir uma conversa após reiniciar o aplicativo, limpar o rascunho em nova tarefa e consultar artefatos do projeto.

Para repetir a validação visual com uma API local, execute `node integrations/mimo-desktop/gui-fixture.mjs` e abra o pacote com `NEBULA_DESKTOP_DATA` apontando para `.desktop-runtime/operator-gui-validation`. Esse perfil separado contém modelos sintéticos `test/code`, `test/text` e `test/configuration` e uma pasta descartável. O processo da fixture deve permanecer ativo durante o teste. Encerre o aplicativo e a fixture ao terminar; abra normalmente o pacote para voltar ao seu perfil pessoal.

Os testes usam dados sintéticos e nenhuma API paga. Os provedores externos precisam das credenciais e dos modelos que o usuário escolher.

Documentação dos endpoints: [OpenRouter](https://openrouter.ai/docs/api_reference/overview), [Hugging Face](https://huggingface.co/docs/inference-providers/tasks/chat-completion), [Ollama](https://docs.ollama.com/api/openai-compatibility).
