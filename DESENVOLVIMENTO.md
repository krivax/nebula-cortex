# Nebula Cortex — Documentação e plano de desenvolvimento

Data: 03/10/2026. Status atual: fork desktop oficial histórico do MiMo Code recuperado e adaptado com Electron/Solid, Code-OSS integrado e configurações de modelos por finalidade. A interface agora segue a demonstração pública atual do MiMo Desktop, com tarefas, projetos, histórico pesquisável, compositor central e artefatos com arquivos reais. OpenRouter, Hugging Face, Ollama e endpoints compatíveis disponíveis. Criação de imagem/vídeo tem atribuições persistentes; execução de mídia e instalação de plugins continuam pendentes. MCP remoto e local via stdio estão disponíveis com acesso por agente. Procedência e testes em [docs/MIMO-DESKTOP-FORK.md](docs/MIMO-DESKTOP-FORK.md). A implementação React/Tauri anterior foi preservada como legado; o planejamento abaixo registra a fundação original e deve ser lido com essa mudança de base.

Os agentes profissionais agora têm contextos e modelos específicos, inspeção de linguagens do projeto e modos de questionamento adaptados de `grill-me`. O Operador Nebula usa um MCP interno autenticado para navegador isolado e inspeção/revelação de arquivos no computador. O Coordenador Nebula distribui tarefas usando o mecanismo nativo de agentes, com modelos próprios e autorização das ferramentas delegadas. O cadastro de MCP remoto, com tokens criptografados, e de programas locais via stdio, com confirmação nativa antes da ativação e acesso por agente, está implementado. OAuth, instalador de plugins e controle visual de outros aplicativos continuam pendentes. Detalhes em [docs/AGENTES-NEBULA.md](docs/AGENTES-NEBULA.md).

## 1. Objetivo

Criar um aplicativo desktop pessoal de assistência ao desenvolvimento, inspirado nas experiências de Codex e Claude Code, com escolha de modelos, projetos locais, ferramentas, revisão de alterações e execução de tarefas por agentes. A experiência-alvo deve cobrir os fluxos de programação do Codex, histórico, instalação de plugins, MCP, geração de imagens e um editor integrado acessível dentro de cada projeto.

O produto terá identidade própria e um motor independente de provedor. A meta é cobrir progressivamente as principais funcionalidades dessas experiências; não se presume paridade completa, acesso a componentes proprietários ou suporte uniforme de todos os modelos.

## 2. Decisões iniciais

- Desktop: Tauri 2, com interface em React e TypeScript.
- Interface: Vite; editor nativo com o fork Code-OSS/code-server e seu terminal. Monaco permanece na prévia do navegador.
- Backend nativo: Rust para integração com o sistema, persistência e fronteira de permissões.
- Motor de agentes: TypeScript em processo Node.js separado, empacotado como sidecar. A interface não executa comandos diretamente.
- Dados locais: SQLite com migrations incrementais.
- Credenciais: armazenamento seguro do sistema operacional; nunca em logs, conversas ou arquivos versionados.
- Primeira plataforma: macOS. Windows e Linux entram após validar o fluxo principal, mantendo contratos portáveis desde o início.
- Provedores iniciais: OpenAI e Anthropic via APIs oficiais. Depois: endpoints compatíveis, Ollama e outros provedores.
- SDKs oficiais de Codex e Claude serão integrações opcionais, separadas do motor independente.

Tauri é a escolha inicial pelo uso da WebView do sistema e possibilidade de distribuir um aplicativo menor. Não implica menor uso de memória em todos os cenários. Um protótipo deve validar editor, terminal, streaming e empacotamento do sidecar. Electron será reconsiderado caso diferenças de WebView ou integrações imponham custos relevantes.

## 3. Experiência do produto

Uma janela principal terá barra lateral de projetos e conversas, conversa central e painéis de arquivos, editor, terminal, ferramentas e alterações. O usuário poderá escolher modelo por conversa e, posteriormente, por agente.

O fluxo básico será: selecionar projeto → escolher modelo → enviar tarefa → acompanhar ferramentas → revisar diferenças → validar resultado. A execução deve poder ser interrompida sem perder o histórico e retomada com indicação clara do que já ocorreu. Cada projeto terá uma ação “Abrir editor” que apresenta um ambiente de edição dentro do aplicativo, com explorador de arquivos, abas, busca, diferenças e terminal. A conversa deverá permanecer acessível sem perder a tarefa ou edições em andamento.

## 4. Arquitetura

```text
Interface React
    │ IPC validado e eventos de streaming
Backend Tauri / Rust
    ├── SQLite e armazenamento seguro de credenciais
    ├── autorização de ferramentas e acesso ao sistema
    └── processo do motor de agentes
          ├── sessões, contexto e execução
          ├── adaptadores de provedores
          └── ferramentas autorizadas / MCP
```

O protocolo entre processos será versionado, com identificador de requisição, sessão, tarefa, cancelamento e erros estruturados. Mensagens recebidas devem ser validadas. A morte do sidecar não pode encerrar a interface nem provocar repetição silenciosa de comandos.

### Contratos centrais

- ProviderAdapter: catálogo de modelos, streaming, autenticação, ferramentas, uso e erros normalizados.
- ModelCapabilities: visão, ferramentas, áudio, contexto e recursos específicos declarados por modelo.
- AgentRuntime: ciclo de execução com limites, estados, cancelamento e checkpoints.
- ToolRegistry: ferramentas com esquema de entrada, classificação de efeito e executor.
- PermissionBroker: decisão de acesso vinculada à ferramenta, projeto, caminho e parâmetros.
- SessionStore: histórico e eventos persistidos, com migração e exportação.

A decisão de permissão precisa ser aplicada no executor, não apenas na interface ou no prompt. O sidecar não deve ter uma rota alternativa que contorne o broker. Tauri capabilities não constituem, sozinhas, sandbox para subprocessos; isolamento de comandos exigirá implementação e testes específicos por sistema operacional.

### Estrutura proposta

```text
apps/desktop/          interface e projeto Tauri
packages/agent-core/   motor independente
packages/providers/    adaptadores de modelos
packages/tools/        contratos e ferramentas
packages/protocol/     esquemas IPC e eventos
packages/testing/      provedores simulados e cenários
docs/                  decisões, arquitetura e operação
```

## 5. Funcionalidades previstas

| Área | Funcionalidades |
|---|---|
| Conversas | Streaming, Markdown, anexos, busca, exportação, renomear, arquivar e ramificar |
| Modelos | Seleção por conversa/agente, endpoints configuráveis, recursos e limites |
| Projetos | Pastas autorizadas, arquivos, busca, instruções locais e histórico |
| Código | Editor, patches, diferenças, testes e revisão antes de aplicar |
| Terminal | PTY, saída incremental, cancelamento, timeout e processos rastreáveis |
| Agentes | Planejamento, execução, revisão, delegação e retomada |
| Contexto | Orçamento de tokens, resumos, referências e memória optativa |
| Git | Status, branches, commits, worktrees e revisão |
| Integrações | MCP, APIs, SDKs oficiais e navegador |
| Plugins | Instalar, listar, configurar, atualizar, desativar e remover pacotes de skills, ferramentas e MCP, com origem e permissões visíveis |
| Imagens | Gerar, visualizar, editar e salvar imagens na conversa, usando provedores com suporte e credenciais próprias |
| Automação | Agendamentos, condições, notificações e limites |
| Multimodal | Imagens e arquivos; áudio e geração de mídia conforme suporte |
| Operação | Consumo, custos estimados, diagnóstico, backup e atualização |

## 6. Segurança e limites

- Aprovações com escopo explícito; comandos destrutivos e acesso fora do projeto terão tratamento próprio.
- Caminhos canônicos, tratamento de symlinks e rejeição de traversal.
- Renderização de Markdown sanitizada, CSP restritiva e isolamento de conteúdo remoto.
- Credenciais resolvidas no backend, com remoção de segredos dos registros de diagnóstico.
- Conteúdo de arquivos, páginas e ferramentas é dado não confiável; não pode alterar permissões.
- Registro de ações e resultados, sem coletar conteúdo sensível desnecessário.
- Limites de duração, chamadas, tokens e gasto por execução.
- Escritas com controle de conflito quando arquivos mudarem durante a tarefa.
- Checkpoints e patches reversíveis; reversão nunca deve apagar alterações posteriores do usuário.
- Automações e MCP recebem a mesma política de permissões das tarefas interativas.

Modelos locais dependem da memória e do hardware disponível. APIs podem transmitir conteúdo do projeto ao provedor escolhido; essa informação deve aparecer na configuração. Assinaturas de produtos não serão tratadas como autorização automática para uso de APIs. Custos serão apresentados como estimativa quando não houver informação confiável.

## 7. Etapas de desenvolvimento

As etapas representam entregas verificáveis, não estimativas de prazo. Cada etapa termina com demonstração do fluxo, validação pertinente e atualização desta documentação.

### Etapa 0 — Fundação e protótipo técnico

Criar repositório, documentação, estrutura, ferramentas de qualidade e aplicativo Tauri mínimo. Validar Monaco, terminal PTY, IPC, streaming simulado e distribuição do sidecar. Registrar decisão Tauri/Electron e estratégia de isolamento.

Concluída quando o aplicativo abre no macOS, inicia/encerra o sidecar, apresenta saída incremental e gera um pacote instalável sem exigir Node instalado pelo usuário.

### Etapa 1 — Conversas e persistência

Implementar layout, conversas, projetos cadastrados, SQLite, migrations, mensagens, estados de execução e exportação. Criar provedor simulado para desenvolvimento sem consumo de API.

Concluída quando conversas sobrevivem ao reinício, streaming pode ser cancelado e uma interrupção não corrompe dados.

### Etapa 2 — Provedores e modelos

Integrar OpenAI e Anthropic, guardar credenciais com segurança e permitir modelo/endpoint configurável. Normalizar eventos, erros, uso e capacidades sem esconder diferenças importantes.

Concluída quando uma conversa real funciona em cada provedor, credenciais não aparecem nos logs e erros de autenticação, rede e limite são recuperáveis. Integrações reais dependem de credenciais fornecidas pelo usuário.

### Etapa 3 — Ferramentas e permissões

Implementar leitura, listagem, busca, escrita por patch e execução de comandos, com broker de permissões, limites e registro. Validar caminhos, symlinks, cancelamento e processos filhos.

Concluída quando o agente resolve uma tarefa em projeto descartável e tentativas fora do escopo são recusadas pelo executor, inclusive após reinício.

### Etapa 4 — Fluxo completo de programação

Implementar ciclo de ferramentas, instruções AGENTS.md, skills locais, orçamento de contexto, editor integrado com explorador e abas, diferenças e verificação. Adicionar modos de consulta, planejamento e execução.

Concluída quando uma tarefa de alteração passa por inspeção, patch, teste e revisão; conflitos externos são detectados e o usuário consegue interromper a execução. A ação “Abrir editor” deve abrir arquivos reais do projeto autorizado, salvar alterações com detecção de conflitos, alternar entre conversa e editor sem perder estado e exibir diferenças antes de aplicar patches.

### Etapa 5 — Git e isolamento de tarefas

Integrar status, branches, commits e worktrees, preservando mudanças existentes. Oferecer preparação de alterações e revisão; publicação externa exige configuração e autoridade correspondente.

Concluída quando duas tarefas isoladas trabalham no mesmo repositório sem sobrescrever alterações da outra e a revisão mostra o diff correto.

### Etapa 6 — Agentes paralelos

Adicionar tarefas filhas, modelos por função, propriedade de arquivos, comunicação, concorrência limitada e consumo agregado. Preferir worktrees quando tarefas editarem áreas que possam conflitar.

Concluída quando planejamento, implementação e revisão colaboram em um cenário reproduzível e cancelamento interrompe os filhos associados.

### Etapa 7 — MCP e SDKs oficiais

Implementar cadastro de servidores MCP locais/remotos, descoberta de ferramentas, credenciais e restrições. Acrescentar gestão de plugins com manifesto validado, origem, versão, instalação, configuração, atualização, desativação e remoção. Compatibilidade com catálogos ou pacotes do Codex precisa ser verificada; não será presumida. Adicionar adaptadores opcionais de Codex e Claude Agent SDK após verificar seus contratos e requisitos atuais.

Concluída quando uma integração local e uma remota funcionam, desconexões são tratadas e ferramentas externas não contornam permissões. Sessões dos SDKs não serão presumidas intercambiáveis com sessões do motor próprio.

### Etapa 8 — Navegador e multimodalidade

Adicionar navegação em ambiente controlado, anexos de imagem e leitura de documentos com limites. Implementar geração e edição de imagens na conversa, incluindo prévia, estado da tarefa, cancelamento quando suportado, destino de salvamento e custos estimados. Implementar áudio e outras mídias apenas para provedores compatíveis.

Concluída quando uma tarefa usa navegador e imagem com origem e ações visíveis, e conteúdo remoto não consegue executar comandos locais por conta própria.

### Etapa 9 — Memória, retomada e automações

Implementar memória optativa por projeto, resumos de contexto, checkpoints, scheduler e notificações. Definir comportamento para suspensão do computador, execuções perdidas e alterações de credenciais.

Concluída quando uma tarefa retoma sem repetir efeitos já registrados e uma automação respeita limites e permissões sem aprovações invisíveis.

### Etapa 10 — Distribuição e maturidade

Validar Windows/Linux, acessibilidade, atalhos, consumo, migrações, backup/restauração, assinatura, atualizações e recuperação após falhas. Registrar matriz de funcionalidades e plataformas efetivamente homologadas.

Concluída quando instalação e atualização preservam sessões e configuração nas plataformas homologadas, com diagnóstico e procedimento de recuperação documentados.

## 8. Primeira versão utilizável

O primeiro marco abrange as etapas 0 a 4: aplicativo macOS com conversas persistidas, OpenAI/Anthropic, seleção de modelo, projetos autorizados, ferramentas, terminal, patches e revisão. Agentes paralelos, automações, navegador e multimodalidade avançada pertencem às entregas seguintes.

## 9. Estratégia de validação

- Testes de contratos dos adaptadores usando eventos simulados e cenários reais optativos.
- Testes do executor para permissões, caminhos, conflitos, cancelamento e limites.
- Testes de persistência, migrações e recuperação após encerramento inesperado.
- Cenários completos em repositórios descartáveis, sem tocar projetos pessoais durante testes.
- Revisão manual de interface e acessibilidade nas plataformas homologadas.
- Verificação do pacote distribuído, incluindo sidecar, PTY e armazenamento de credenciais.

Uma etapa não é considerada pronta apenas porque compila: seu critério de conclusão precisa ser demonstrado. Falhas, limitações e verificações pendentes devem ser registradas.

## 10. Pendências para resolver durante a implementação

- Nome visual, ícone e identidade do aplicativo.
- Política de execução automática e isolamento por sistema operacional.
- Distribuição pessoal ou pública; assinatura e infraestrutura de atualização.
- Modelos locais adequados ao hardware e lista de provedores prioritários.
- Autenticação permitida pelos SDKs escolhidos e custos atuais.
- Política de retenção, exportação e exclusão de histórico.

## 11. Referências oficiais

- Tauri: https://v2.tauri.app/start/
- Sidecars: https://v2.tauri.app/develop/sidecar/
- Segurança Electron: https://www.electronjs.org/docs/latest/tutorial/security
- Codex SDK: https://learn.chatgpt.com/docs/codex-sdk
- Claude Agent SDK: https://code.claude.com/docs/en/agent-sdk/overview

Essas referências foram consultadas durante o planejamento. Versões, APIs e termos devem ser confirmados novamente antes de implementar cada integração.

## 12. Registro de implementação

### 30/09/2026 — Fundação inicial

Criados monorepo npm, interface React/TypeScript, esqueleto Tauri 2, protocolo versionado e sidecar Node simulado. A prévia oferece conversas locais, streaming, cancelamento e exportação. Os testes cobrem contratos, recuperação de histórico e execução do sidecar em processo independente.

A etapa 0 permanece aberta: integração Rust/sidecar, Monaco, PTY e pacote autocontido ainda precisam ser demonstrados. O histórico da prévia usa localStorage provisoriamente; SQLite será implementado no backend. OpenAI/Anthropic não estão conectados. Consulte `README.md` e `docs/FUNDACAO.md` para executar e acompanhar as pendências.

### 30/09/2026 — Escopo ampliado após revisão com o usuário

O usuário explicitou que precisa dos fluxos do Codex para programação, histórico, instalação de plugins, MCP e geração de imagens, além de um editor no estilo VS Code dentro do projeto. Esses itens são requisitos do produto, não apenas possibilidades futuras. A primeira versão utilizável continua sendo um marco intermediário; não significa cumprimento de todo o escopo.

Adicionado botão “Abrir editor” à prévia, com Monaco, explorador, arquivos de demonstração, importação de arquivos de texto escolhidos pelo usuário, comparação e download de cópias editadas. A alternância entre conversa e editor mantém os modelos abertos em memória. Isso ainda não equivale ao VS Code completo ou à edição nativa de uma pasta autorizada.

## 13. Critérios de cobertura funcional solicitada

| Fluxo solicitado | Critério verificável | Estado atual |
|---|---|---|
| Histórico | Persistência SQLite, busca, renomear, arquivar, exportar e retomada sem repetir efeitos | Prévia local com exportação; SQLite e demais operações pendentes |
| Programação por agente | Inspecionar projeto, editar, executar testes, acompanhar terminal e revisar patches com permissões no executor | MiMo Code oficial integrado; sessões e ferramentas com permissões, diferença, cancelamento e teste local. API pública depende da chave; isolamento completo de shell e conflitos editor/agente pendentes |
| Editor dentro do projeto | Abrir por botão, árvore, edição/gravação, abas, busca, diff e terminal | Workbench Code-OSS/code-server dentro do app macOS; árvore, gravação, terminal e alternância validados. IDE manual com privilégios do usuário; recuperação após crash e extensões externas ainda sem validação |
| Plugins | Instalar pacote de origem identificada, configurar, ativar/desativar, atualizar e remover, controlando acessos | Pendente |
| MCP | Conectar servidor local/remoto, listar e executar ferramentas autorizadas, recuperar desconexões | Pendente |
| Geração de imagens | Gerar imagem real, exibir na conversa, editar e salvar com uso/custo rastreável | Pendente |
| Experiência desktop | Instalação macOS autocontida, sidecar supervisionado, persistência e recuperação | App macOS de desenvolvimento inclui editor, Node e sidecar supervisionado; persistência e distribuição final pendentes |

A equivalência será avaliada por cenários e comportamentos demonstrados. Componentes internos proprietários e serviços do Codex não estão disponíveis automaticamente para este aplicativo; integrações dependerão de APIs, contratos publicados e credenciais válidas. Monaco não fornece, sozinho, o sistema de extensões ou todos os recursos do VS Code.

### 30/09/2026 — Explorador em árvore e ambiente de edição

Substituída a lista plana por árvore expansível, com caminhos completos, ícones de arquivos e navegação por teclado. Acrescentados abertura de pasta, abas de pré-visualização/fixação, criação de arquivos e pastas em memória, busca textual, localização rápida, paleta de comandos, breadcrumbs, minimapa, configurações e redimensionamento da barra lateral. O editor ocupa a área de trabalho e mantém acesso à conversa.

A interface segue a organização do VS Code, mas não inclui seu sistema de extensões, depurador ou terminal. Gravação direta no disco e persistência dos buffers permanecem pendentes. Consulte `docs/EDITOR.md` para recursos e limites.

### 30/09/2026 — Editor conectado aos arquivos locais

Compilado e aberto um `.app` macOS de desenvolvimento com frontend embutido. Adicionado `packages/native-project` com autorização pelo seletor nativo, leitura/listagem limitada, acesso por token e caminhos relativos, isolamento por diretório (`cap-std`) e salvamento de arquivos existentes por substituição atômica. Revisões SHA-256 detectam alterações externas; a interface preserva a edição, compara com o disco e permite aplicar a versão editada usando a revisão comparada.

TypeScript, 12 testes JS/TS, oito testes Rust e build Tauri passaram. Abertura de pasta descartável, Monaco na WebView, edição, Cmd+S e rejeição de salvamento conflitante foram demonstrados pela interface e por leitura independente do disco. Critérios/limites em `docs/EDITOR.md`; captura em `docs/native-editor-conflict.png`.

A etapa 0 continua aberta: Rust/sidecar, PTY e distribuição autocontida ainda precisam ser demonstrados. Arquivos/pastas novos permanecem em memória; buffers não salvos não sobrevivem ao encerramento. SQLite, provedores reais, plugins, MCP e geração de imagens continuam pendentes. Não há equivalência completa com Codex ou VS Code nesta entrega.

Validação final da resolução: a segunda alteração externa após a comparação também foi preservada; “Salvar versão editada” gravou a edição revisada depois de atualizar a revisão comparada. O arquivo resultante foi conferido no disco. Árvore com pasta vazia confirmada na WebView; captura final em `docs/native-editor-preview.png`.

### 30/09/2026 — Workbench real solicitado pelo usuário

O requisito foi refinado para uma base derivada do VS Code/Cursor. Integrado o fork aberto Code-OSS/code-server 4.139.1, com Node 24.21.0 empacotado e extensão inicial Nebula. O workbench é exibido numa WebView filha sem capabilities Tauri, autenticado por sessão local criada no Rust. Monaco permanece no navegador.

Validados na pasta descartável: árvore, gravação conferida no disco, comando no terminal, extensão própria ativa e alternância para a conversa preservando a sessão. TypeScript, 12 testes JS/TS e 10 Rust passaram. Detalhes, limitações e preparação em `docs/EDITOR-CODE-OSS.md`.

A IDE manual tem acesso do usuário ao sistema; o broker de ferramentas do agente continua recusando operações. Extensões do editor não equivalem aos plugins/MCP do Nebula. Etapa 0 ainda aberta: transporte/supervisão do agente, persistência e distribuição final permanecem pendentes. Não há paridade completa com Codex/Cursor nesta entrega.

### 01/10/2026 — Retomada e validação do workbench

Corrigida a restauração indevida do projeto anterior: o backend navega explicitamente para a pasta selecionada, com caminho codificado na URL local. Ajustados o alinhamento da WebView filha no macOS e os menus nativos que interceptavam seleção, desfazer/refazer e fechamento de abas.

Criados e salvos arquivos reais pela interface na pasta descartável `.editor-runtime/fixture`. Cmd+A, Cmd+S, Cmd+Z e refazer foram exercitados; o conteúdo foi conferido independentemente no disco. O pacote inclui as licenças do Node, Code-OSS e code-server. A etapa do agente permanece separada e pendente.

Validação final da retomada: Cmd+W fecha a aba sem encerrar o app; divisão em duas colunas e ampliação/restauração da janela funcionaram. O cabeçalho do Nebula permaneceu acessível. Fechar o projeto encerrou o servidor antigo; reabrir criou uma sessão local nova, com leitura dos arquivos salvos. TypeScript, 12 testes JS/TS, 10 testes Rust e pacote nativo passaram. Captura em `docs/code-oss-editor-preview.png`.


### Transporte nativo e avaliação do MiMo — 01/10/2026

O chat desktop passou a executar o provedor simulado em processo Node separado, com supervisão Rust, canal IPC, cancelamento e erros finais sem repetição automática. O `.app` inclui o bundle do agente e usa o Node do próprio pacote. TypeScript, 21 testes JS/TS, 17 Rust e build nativo passaram. Streaming, cancelamento, morte do processo, nova tarefa após falha e encerramento foram exercitados pela janela. Detalhes em [docs/AGENT-TRANSPORT.md](docs/AGENT-TRANSPORT.md).

Por solicitação do usuário, foi avaliada a combinação do Code-OSS com a base oficial Xiaomi MiMo Code. O motor, servidor e SDK são públicos; a superfície desktop herdada é declarada sem manutenção e não confirma publicação integral do MiMo Desktop anunciado. A proposta é avaliar o motor oficial por uma ponte de sessões, eventos e permissões, preservando a IDE integrada. Revisão, licença e próximos critérios em [docs/MIMO-INTEGRACAO.md](docs/MIMO-INTEGRACAO.md). MiMo ainda não foi incorporado; provedores reais, SQLite, plugins/MCP e imagens permanecem pendentes.

### 01/10/2026 — Integração do motor oficial Xiaomi MiMo Code

Incorporados SDK e runtime npm oficiais 0.1.15, com versão fixada, download verificado e avisos de licença/política no pacote. A interface mantém o Code-OSS e acrescenta configuração de endpoint/modelo/chave (Keychain), seleção de motor, vínculo da conversa à pasta, streaming, atividades, ferramentas e aprovação/recusa por pedido. Diferenças propostas são exibidas antes da autorização. O MiMo mantém sessões em disco e retoma a sessão na próxima tarefa após reiniciar; autorizações pendentes não sobrevivem à recarga.

26 testes JS/TS e 20 Rust passaram. O cenário executou o binário oficial com API local e chave fictícia, cobrindo escrita após aprovação, recusa, cancelamento antes da aprovação e de shell já iniciado, bloqueio externo, falha de autenticação e retomada de contexto. O pacote macOS inclui motor, Node e editor, aproximadamente 934 MiB. A API Xiaomi paga não foi exercitada. Perfil do motor isolado, sem importação automática de plugins/MCP; a IDE e comandos aprovados continuam com os privilégios do usuário. Histórico SQLite completo da interface, plugins, MCP, imagens e paridade integral permanecem pendentes. Procedimentos em [docs/MIMO-INTEGRACAO.md](docs/MIMO-INTEGRACAO.md).


### 05/10/2026 — Missões conectadas ao Editor Nebula

Integrados comandos para explicar código, preparar correções e criar testes a partir do arquivo ou seleção do editor. A extensão envia contexto por uma ponte local autenticada; o assistente recebe um rascunho revisável, com envio manual. Explicações usam um perfil sem ferramentas de escrita, terminal, MCP ou delegação. Correções e testes exigem arquivo salvo e preservam autorizações.

O painel Missões persiste objetivos e vínculos com conversas, mostrando plano registrado, agentes, ferramentas, arquivos e última resposta. A conclusão requer revisão explícita do usuário. Corrigidos o registro da extensão ao atualizar e a limpeza do rascunho após navegar para a conversa criada.

Tipos, 21 testes e integração nativa com motor oficial/API sintética passaram; pacote macOS reconstruído. Na interface isolada foram exercitados criação, envio, persistência, revisão, retomada, comandos da extensão e envio de seleção TypeScript ao agente de leitura. Provedores pagos não foram usados. Procedimentos e limites em [docs/MISSOES-NEBULA.md](docs/MISSOES-NEBULA.md).

A troca consecutiva entre testes, correção e explicação foi validada sem reiniciar. Corrigido o consumo antecipado do rascunho durante a navegação; o envio final usou o texto de explicação e o agente somente de leitura.

### 05/10/2026 — Piloto Nebula Reflex

Avaliado o Clef/Clef-flash oficial da Cloudflare e desenvolvido um piloto opcional de decisões tipadas para recomendar agentes e identificar perguntas essenciais. Preserva escolha manual e autorizações, com adapter SystemOne separado do chat. Plano, uso e limites em [docs/NEBULA-REFLEX.md](docs/NEBULA-REFLEX.md).

Implementado o piloto: Orientar tarefa no compositor, escolha explícita para aplicar, perguntas fixas de esclarecimento, abstenção e invalidação após editar. Configuração permite modo local padrão, Clef/Cloudflare e endpoint Jev/SystemOne, com token protegido por endpoint/modelo, prazo, tamanho e limite diário serializado. Logs contêm somente metadados. Nenhuma nova ferramenta ou autorização foi acrescentada aos agentes.

Regras locais corresponderam a 161/165 categorias esperadas em um conjunto sintético de desenvolvimento; quatro divergências documentadas, sem estimativa de desempenho em produção. Tipos, 31 testes e integração nativa/API sintética passaram; interface isolada conferida até o envio ao especialista. Pacote macOS reconstruído. Modelo Clef hospedado, execução local dos pesos e fine-tuning não foram avaliados. Não houve chamadas pagas. [Relatório](docs/NEBULA-REFLEX-AVALIACAO.md).

### 06/10/2026 — Objetivo e disponibilidade no Nebula Reflex

As regras locais `pt-v2` priorizam a operação solicitada sobre o assunto mencionado e restrições como “sem trocar dependências”. Corrigidos os quatro casos divergentes do piloto. Etapas distintas podem sugerir o Coordenador; ausência de modelo para um especialista ou para a coordenação pede escolha manual. Código cercado e citações Markdown não viram instruções de encaminhamento. O pedido original enviado ao agente permanece integral.

Acrescentados 37 casos de regressão sobre objetivo, etapas, anexos, disponibilidade e esclarecimento. Os 165 casos originais e esses 37 casos passaram, com ajuste das regras sobre exemplos conhecidos; não é avaliação independente nem estimativa de desempenho em produção. Tipos, 35 testes e integração nativa passaram, incluindo compatibilidade do registro antigo e versão das novas decisões locais. Pacote macOS reconstruído; interface isolada conferiu Textos, Desenvolvimento, Coordenador, aplicação sem envio e preservação manual. Não houve chamadas pagas. [Uso e limites](docs/NEBULA-REFLEX.md).

### 06/10/2026 — Controles do chat com ícones

Reorganizado o rodapé do compositor numa grade com identificação do agente/modelo à esquerda e ícones de agente, configuração de modelos e autorização à direita. Removidas regras antigas que competiam por largura e escondiam spans em telas menores. Nomes longos usam reticências; os controles têm rótulos acessíveis, dicas e foco visível.

O menu de agentes mostra ícones e descrições, tem altura limitada à área disponível, rolagem, seleção por teclado e fechamento automático. A autorização permanece uma indicação informativa, sem mudar permissões. A seleção continua explícita e o ícone de modelos abre as configurações existentes.

Tipos e 35 testes passaram. Pacote macOS reconstruído e conferido em perfil isolado com modelo de nome longo, modos claro/escuro, chat novo e conversa aberta, painel de revisão ampliado, seleção por mouse/teclado e envio ao agente de Desenvolvimento com API sintética. Não foram usadas chaves reais. [Próximas entregas propostas](docs/PROXIMAS-ENTREGAS.md).

### 06/10/2026 — Exclusão de conversas em Recentes

Cada conversa ganhou um botão de lixeira separado da abertura do chat. A confirmação mostra o título, informa a remoção permanente de mensagens e conversas vinculadas, e começa com foco em Cancelar. A exclusão interrompe a execução antes de remover o histórico na pasta correta; falhas mantêm o item e exibem um aviso. Ao excluir a conversa aberta, o usuário volta à tela de nova tarefa.

Tipos e quatro testes HTTP do fluxo de exclusão passaram. Validado no motor real, com perfil e conversas sintéticos: conversa principal e filha removidas, outra conversa e arquivo preservados, exclusão persistente após reiniciar. Janela de confirmação e cancelamento conferidos no aplicativo isolado; pacote macOS reconstruído. O comando de testes do fork inclui os novos casos.

### 06/10/2026 — Revisão das alterações nas missões

Acrescentado **Ver diferenças**, com comparação registrada pelo motor, numeração anterior/posterior, linhas adicionadas/removidas, estado do arquivo e contagens. A leitura é sob demanda, identifica limites e formatos sem conteúdo textual e aceita o formato anterior de conteúdos antes/depois. Uma conversa excluída produz aviso de indisponibilidade. Abrir o projeto no Editor Nebula permanece disponível para conferir o disco.

A lista de missões tem rolagem própria, com detalhes ao lado em janelas largas e abaixo em janelas menores. Consultas periódicas ficam restritas a missões em execução ou aguardando o usuário; nos demais estados, a atualização é manual. Isso estabiliza a interação durante a revisão.

Tipos, 48 testes do fork e oito testes existentes de normalização de diferenças passaram. Integração com motor real e projeto Git sintético validou escrita autorizada, diferenças registradas, preservação do registro após edição posterior no disco e conversa excluída. Interface isolada conferiu criação, envio, autorização única, comparação real, atualização e troca de missão sem conteúdo anterior. Pacote macOS reconstruído. A restauração de arquivos por checkpoints continua na próxima etapa; nenhuma chamada paga foi realizada.

### 06/10/2026 — gerenciamento de missões

Adicionados edição do objetivo e remoção do registro por ícones na lista, com diálogos, validação e persistência serializada. Rascunhos preparados acompanham edições; contexto do editor e restrições permanecem preservados. Missões vinculadas mantêm o envio original. A remoção preserva conversas e arquivos e libera vínculos ativos. Verificação: tipos, 52 testes e integração nativa com API sintética; validação da interface em perfil separado.

### 06/10/2026 — revisão para publicação do código

Encerramento desta etapa como v0.1 experimental, homologada em macOS ARM64. Corrigido `npm run check` para gerar o sidecar antes dos testes e evitar uso de bundle ausente ou antigo. Criados `npm run check:publication` e `docs/PUBLICACAO-GITHUB.md`, com verificação de integridade do patch, presença dos avisos, arquivos locais indevidamente incluídos, limite de tamanho e padrões conhecidos de credenciais. A varredura é limitada e não certifica imagens ou todos os formatos de segredo. Não foi escolhido um LICENSE para o código próprio nem realizado envio ao GitHub.

Verificação desta revisão: 26 testes da base aprovados, tipos e build aprovados, 134 arquivos candidatos examinados na primeira execução, patch do fork íntegro e aplicação reversa validada. O desktop conserva a validação de 52 testes, integração nativa e pacote macOS feita na entrega de gerenciamento das missões. Runtimes, perfis, dependências e builds permanecem ignorados pelo Git. Recursos ainda pendentes estão em `docs/PROXIMAS-ENTREGAS.md`.

## 07/10/2026 — créditos e preparação multiplataforma

- READMEs em português, inglês e espanhol explicitam o fork Xiaomi MiMo Code e a origem Microsoft VS Code/Code-OSS, incluindo Coder/code-server. Créditos também no Sobre do aplicativo e avisos preservados.
- Preparação separada por plataforma: macOS ARM64, Linux x64/ARM64 (glibc), Windows x64 nativo. Node, Bun e MiMo oficiais com checksums fixados.
- Windows usa Code-OSS compilado do repositório Microsoft, não code-server nem WSL. Backend autenticado por token/cookie, caminhos/URIs Windows e encerramento da árvore de processos com taskkill implementados.
- Linux usa Electron e editor nativos. Secret Service/KWallet continua obrigatório para credenciais; sem fallback em texto simples.
- Workflow GitHub Actions com builds/testes nativos nos três sistemas e arquivos portáteis de desenvolvimento. Execução Windows e Linux x64 ainda pendente: não há remoto publicado para disparar esses runners. Não anuncia homologação concluída nesses sistemas.
- Verificações locais: macOS 28 testes da base, 55 testes do fork e integração real completos; build macOS concluído. Debian 12 Linux ARM64 em container isolado: preparação, tipos, 55 testes do fork, 27 testes da base (1 teste do sidecar legado específico de macOS omitido), integração real completa e build Linux concluídos.
- Integração verificou motor MiMo, autenticação/editor, extensão e ponte, missões, histórico, configurações, Reflex e MCP stdio/remoto. Harness reconhece zombies Linux como processos já encerrados; flag no-sandbox restrita ao teste isolado, não aplicada ao produto.
- Patch reproduzível atualizado para commit `28fb220b33c4b7b928dfd5807eb0af8727a9eca2`, SHA-256 `acbcded0b10c50410120dac95135ef135bf3bf82d84ee97adc405c4da4c48ae7`, aplicação direta/reversa verificadas. Auditoria de publicação passou com 144 arquivos.
- Guia: `docs/MULTIPLATAFORMA.md`. Pacotes ainda sem assinatura, notarização ou instalador. Licença do código próprio na raiz continua a definir.

Arquivos de desenvolvimento macOS ARM64 e Linux ARM64 compactados após os builds; os executáveis e recursos de editor/motor/licenças foram conferidos. Caches e dependências da cópia Linux de teste foram removidos após a validação para liberar espaço, mantendo logs e pacotes.

## 07/10/2026 — primeiro Nebula Studio próprio

- Implantado Studio experimental no desktop principal, com ícone à direita e abas Design/Áudio/Vídeo. Editores, modelo de documento, histórico e motores são código próprio; nenhum fork ou componente de editor de mídia externo foi incorporado. A base MiMo/Code-OSS mantém os créditos existentes.
- Design: formas/textos, lista de camadas, seleção/movimentação, propriedades e exportações SVG/PNG. Áudio: instrumentos determinísticos em faixas separadas, BPM/notas/volume/mute, agendamento sincronizado e WAV PCM estéreo. Vídeo: importação por cópia, prévia nativa, cortes/ordem/texto e MP4 sem áudio com FFmpeg instalado, sem runtime de mídia empacotado.
- Fundação: documento versionado, autosave atômico, histórico da sessão, revisão/hash para conflitos externos, validação de limites/referências, proteção contra links em assets e saídas fora da pasta interna. Autosave preserva controles e novas edições feitas durante gravação; importação entra no histórico. Cancelamento encerra FFmpeg e limpa temporários.
- Verificação: `npm run check` passou com 38 testes; a suíte final passou com 39 após adicionar o caso de consistência da cópia importada, incluindo 11 testes específicos dos motores. Tipos app/desktop e 55 testes do fork aprovados. Integração nativa existente (motor/editor/missões/Reflex/MCP) aprovada. FFmpeg real conferiu duração, ordem dos frames, sobreposição de texto, preservação dos originais e cancelamento. Interface em perfil sintético verificou edição, autosave, histórico, reabertura, reprodução, prévia e exportações PNG/WAV/MP4. Aplicativo macOS ARM64 atualizado, sem assinatura/notarização.
- Patch reproduzível: commit `8d6b262dd0dce0055a4a2a34159bcad5518dd540`, SHA-256 `1bdd538d2f1aba0217f962b043f2d7b3577bd0a068d573e504ffcd718efb8f16`, aplicação direta/reversa conferidas. Auditoria de publicação: 148 arquivos aprovados, sem padrões conhecidos de credenciais.
- Limites e uso em `docs/NEBULA-STUDIO.md`; plano atualizado em `docs/PLANO-NEBULA-STUDIO.md`. Etapa 0 tem provas funcionais e etapa 1 está parcial. Geração/separação por IA, recuperação durável, biblioteca/jobs, editores completos e homologação nativa do Studio em Windows/Linux continuam pendentes. Não houve uso de provedores pagos.

## 07/10/2026 — Design por instrução e geração musical configurável

- Reorientado o Studio para descrever, gerar, revisar e editar partes. O plano agora prioriza APIs reais antes de ampliar ferramentas manuais. Design, Áudio e Vídeo mantêm implementação própria; os créditos MiMo/Code-OSS da base permanecem.
- Design: modelo de texto compatível atribuído à nova finalidade Design e layouts; gera páginas/camadas para wireframe, site, slides, logo e peça visual. Proposta explícita antes de aplicar, escopo por IDs selecionados, bloqueio de camadas e recusa de proposta obsoleta. Até 20 páginas/400 objetos, retângulos/elipses/texto, nomes/visibilidade, texto multiline e seleção múltipla. PNG/SVG da página ativa, HTML visual estático e PPTX com formas/textos editáveis. Raster e HTML responsivo implementável ainda pendentes.
- Música: nova finalidade Músicas e provedor MiniMax, com endpoint/modelo/chave configuráveis; contrato Music 3.0/2.6 incluindo variantes free. Descrição, letra própria/automática ou instrumental; chamada real, validação de resposta, armazenamento local de MP3, biblioteca/player, reutilização de briefing, remoção do registro e exportação nativa. Laboratório de síntese anterior fica recolhido. Novos provedores exigem adaptadores próprios, não são presumidos compatíveis com esse contrato.
- Fundação: configurações/documentos anteriores migram sem perder atribuições ou elementos. Chaves ficam protegidas no processo nativo; geração só começa por clique. Uma operação criativa por vez, cancelamento/erros visíveis e proteção contra conflito externo. Briefings e propostas permanecem ao alternar áreas durante a sessão. Documento limitado a 1 MB. Jobs remotos não têm recuperação persistente; cancelamento local não promete cancelar cobrança.
- Verificação: `npm run check` aprovado com 49 testes; tipos app/desktop e 56 testes do fork aprovados. Integração nativa de editor, aparência, missões, Reflex, motor e MCP passou. Dez testes novos exercitam contratos HTTP com respostas sintéticas, escopo de camadas, migração, exportações, persistência/conflitos, respostas inválidas e cancelamento. Nenhuma chamada paga realizada.
- Interface em perfil sintético macOS ARM64: geração de proposta de duas páginas, aplicação, alteração só da cor do título, biblioteca musical com MP3 local válido, reprodução até o final e exportações MP3/PPTX. Reabertura conservou slides e música; troca de área conservou o briefing. MP3 exportado idêntico à mídia recebida. PPTX lido/regravado por python-pptx, ZIP/XML íntegros, duas páginas e elementos editáveis; exportação da UI confirmou título azul e textos multiline. Qualidade artística dos modelos comerciais ainda não foi avaliada.
- Build e aplicativo macOS ARM64 atualizados, sem assinatura/notarização; lockfile preservado. Patch reproduzível: commit `55f47f1caed0beccbcc95eb2ebf7da0f591453a7`, SHA-256 `a76e6ce2ba34a2c5b215dc976ab1cd26b5f1b97fba37ee3f85f9ef5f6d695630`, 487.166 bytes, aplicação direta/reversa verificadas.
- Próximas etapas: vídeo por IA com jobs duráveis, timeline audiovisual independente, imagens raster em camadas, stems e distribuição/homologação do Studio em Windows/Linux. O vídeo atual continua protótipo manual sem áudio. Plano, guia de uso e READMEs PT/EN/ES atualizados para distinguir recursos disponíveis e pendências.

## 08/10/2026 — retirada do Studio experimental

- Por solicitação do usuário, retirados Design, Áudio e Vídeo do aplicativo: navegação, telas, módulos, serviços nativos, IPC e protocolo de mídia. Assistente, Editor Nebula, navegador, missões, agentes, Reflex e configurações permanecem disponíveis. As etapas criativas anteriores estão suspensas.
- Projetos e mídias existentes não foram apagados. Configurações antigas continuam legíveis; finalidades Design e Músicas ficam ocultas na interface, preservando atribuições e credenciais existentes. A iteração musical ainda não concluída foi arquivada localmente em `.desktop-runtime/studio-paused-2026-10-08/`, fora do código distribuído.
- READMEs PT/EN/ES atualizados; documentos do Studio identificados como registro histórico suspenso e próximas entregas ajustadas.
- Verificação: tipos app/desktop aprovados, 28 testes da base e 56 testes do fork aprovados. Integração nativa verificou motor, editor, agentes, missões, histórico, aparência, Reflex e MCP. Interface macOS com perfil isolado confirmou ausência do Studio e dos seletores Design/Músicas, incluindo abertura de configurações antigas. Aplicativo macOS ARM64 recompilado.
- Patch reproduzível: commit `ea338b3dfed683c98bcb71b45186cb3ccd315a54`, SHA-256 `eb24dd6de43d7e535447d558be899f4eb0823fcaf34d826ecc27fc4e4143db96`, 365.783 bytes; aplicação direta/reversa verificadas. Auditoria de publicação aprovada com 146 arquivos examinados.
