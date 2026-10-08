# Fundação — primeira entrega

Data: 30/09/2026. Etapa 0 em andamento; critério de conclusão ainda não atingido.

**Atualização de 01/10/2026:** MiMo Code oficial 0.1.15 integrado ao chat nativo e à pasta do Code-OSS, com SDK, sessões persistentes, chave no Keychain, ferramentas com autorização e prévia de diferenças, streaming e cancelamento. 26 testes JS/TS e 20 Rust passaram, além do pacote macOS de aproximadamente 934 MiB. O binário oficial foi exercitado com API local fictícia; chamada paga à Xiaomi ainda depende da chave do usuário. Detalhes em [MIMO-INTEGRACAO.md](MIMO-INTEGRACAO.md). Os registros seguintes são históricos. Migração do histórico completo da UI para SQLite, plugins/MCP e imagens continuam pendentes.

## Implementado

- Monorepo npm, React/TypeScript/Vite e aplicativo Tauri 2 de desenvolvimento compilado no macOS.
- Interface em português com barra lateral, conversas e painel de detalhes.
- Editor Monaco na WebView macOS, explorador em árvore, abertura autorizada de projeto e salvamento de arquivos existentes com conflitos. Importação no navegador e criação de arquivos/pastas continuam em memória.
- Provedor simulado, streaming, cancelamento e normalização de erros.
- Histórico da prévia em localStorage, recuperação de estados interrompidos e exportação JSON.
- Protocolo JSONL versão 1 com validação de entrada e processo Node independente.
- Contratos de ferramentas do agente com recusa por padrão; o acesso nativo a arquivos está disponível somente nos comandos do editor, sem executor de shell.
- Testes de protocolo, streaming, cancelamento, erros, recuperação e sidecar em processo separado.

## Decisão de arquitetura

Mantemos Tauri como escolha inicial, seguindo o plano. Monaco e os comandos de arquivos funcionaram na WebView macOS. Ainda não há evidência suficiente para confirmar PTY ou distribuição final; nenhuma conclusão sobre Tauri versus Electron foi tomada. A interface de demonstração importa apenas o motor simulado. O transporte de produção deverá encaminhar requisições pelo Rust, que será responsável pelo ciclo de vida do sidecar e autorização.

O sidecar atual só gera texto simulado e não recebe ferramentas. O broker TypeScript é um contrato inicial, não uma sandbox. A implementação futura deve aplicar decisões no executor nativo, canonicalizar caminhos e validar symlinks. Não disponibilizar execução arbitrária antes dessa validação.

Referências consultadas: [Tauri](https://v2.tauri.app/start/) e [sidecars](https://v2.tauri.app/develop/sidecar/). `externalBin` e o runtime Node autocontido serão adicionados quando houver um binário testado para a plataforma de destino.

## Próxima entrega

1. Implementar criação nativa de arquivos/pastas e recuperação de buffers não salvos; compilação Tauri e edição de arquivos existentes já validadas.
2. Implementar transporte Rust ↔ sidecar, monitoramento de morte e encerramento sem repetição de tarefas.
3. Empacotar Node com o sidecar e demonstrar instalação sem Node externo.
4. Implementar e validar terminal PTY com limites e cancelamento de processos filhos; Monaco já validado na WebView macOS.
5. Introduzir SQLite e migrations no backend, substituindo o armazenamento da prévia.

## Verificações

- `npm run typecheck`: passou.
- `npm test`: 7 testes passaram, incluindo processo sidecar via stdin/stdout.
- `npm run build`: passou; gera interface Vite e bundle Node (4,4 kB).
- `npm install`: auditoria reportou zero vulnerabilidades nessa instalação.
- Verificação na prévia: layout, envio com streaming, conclusão, recarga preservando histórico, cancelamento com resposta parcial e criação de conversa confirmados no navegador.
- Captura da interface: `docs/preview.png`.

Na entrega inicial, Rust/Cargo não estavam disponíveis; essa limitação foi resolvida na entrega nativa registrada abaixo. Distribuição final assinada/autocontida ainda não foi verificada. Exportação foi implementada, mas o download não foi validado manualmente. PTY e SQLite não foram implementados. Monaco foi acrescentado na revisão do escopo; a integração nativa permanece pendente.

## Revisão de escopo

Instalação de plugins, MCP, geração de imagens e os fluxos completos de programação são requisitos explícitos. A matriz de critérios foi incorporada ao documento principal. O editor não inclui o sistema de extensões do VS Code ou terminal. A gravação direta no projeto está disponível na versão desktop conforme a entrega abaixo.

### Validação do editor na prévia

Build e TypeScript passaram após integrar Monaco; os sete testes existentes continuam passando. No navegador, foram confirmados abertura do editor, edição de texto, indicação de modificação, alternância para a conversa sem perder a edição e comparação com o original. Não foram validados manualmente importação e download, nem funcionamento na WebView Tauri. Captura em `docs/editor-preview.png`. O bundle do editor é carregado sob demanda e mede aproximadamente 2,3 MB antes de compressão; otimização adicional ficará para a validação nativa.

### Explorador em árvore e abas

O editor foi ampliado com árvore hierárquica, abertura de pasta, arquivos homônimos por caminho, abas de pré-visualização/fixação, criação de pastas e arquivos, busca no conteúdo, breadcrumbs, configurações e navegação por teclado. TypeScript e build passaram. A suíte contém 12 testes aprovados, incluindo hierarquia, ordenação, expansão, validação de caminhos e transições de abas.

No navegador foram verificados: clique simples substituindo a aba temporária, duplo clique fixando a aba, recolher/expandir pelo teclado, localizar arquivo pelo caminho, busca de texto, importação de uma pasta real descartável com dois arquivos `index.ts` em diretórios diferentes, criação de pasta/arquivo e fechamento/reabertura preservando uma edição. Corrigido o deslocamento da árvore quando a lista de editores abertos crescia entre os dois cliques.

A gravação nativa, persistência dos buffers, download e atalhos reservados pelo navegador não foram homologados. Recursos e limites atualizados em `docs/EDITOR.md`.

### Editor nativo e acesso a projetos

Rust/Cargo preparados em ambiente local temporário, sem alterar o PATH do sistema. Criado backend `packages/native-project`, conectado por comandos Tauri ao editor: seletor nativo, listagem com diretórios vazios, tokens por projeto, leitura de UTF-8, validação de caminhos e salvamento com revisão/temporário/substituição atômica. Nenhuma rota de caminho absoluto ou ferramenta do agente foi habilitada. Ícone provisório adicionado para compilar o aplicativo.

Verificações atuais: TypeScript passou; 12 testes JS/TS e oito testes Rust passaram; `.app` de desenvolvimento macOS (aproximadamente 33 MiB) foi compilado e aberto com frontend embutido. Pela interface, foram verificados leitura/edição do arquivo real, Cmd+S, conflito após alteração externa e comparação lado a lado mantendo ambas as versões. Conteúdo do disco conferido independentemente. Captura em `docs/native-editor-conflict.png`.

A aplicação da edição após comparação continua verificando a revisão do disco; não há substituição automática de conflitos. Limites, pequena janela de concorrência com escritores externos e comandos de execução constam em `docs/EDITOR.md` e `README.md`. Criação no disco, observação de alterações, recuperação de buffers, SQLite, PTY, ligação do sidecar e distribuição final continuam pendentes. A etapa 0 permanece em andamento.

Validação final da resolução: a segunda alteração externa após a comparação também foi preservada; “Salvar versão editada” gravou a edição revisada depois de atualizar a revisão comparada. O arquivo resultante foi conferido no disco. Árvore com pasta vazia confirmada na WebView; captura final em `docs/native-editor-preview.png`.
