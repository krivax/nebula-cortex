# Nebula Cortex

**Português** · [English](README.en.md) · [Español](README.es.md)

O Nebula Cortex é um assistente desktop para desenvolver software e trabalhar com agentes de IA, projetos, arquivos e um navegador integrado. Ele reúne uma área de conversa, o **Editor Nebula**, ferramentas autorizadas pelo usuário e modelos configuráveis em um único aplicativo.

**Estado atual: v0.1 experimental.** macOS ARM64 e Linux ARM64 têm verificações locais; Linux x64 e Windows x64 têm compilação e testes nativos configurados no GitHub Actions, ainda pendentes de execução. Windows usa aplicativo nativo `.exe`, sem WSL. Os pacotes de desenvolvimento não possuem assinatura/notarização.

## Como funciona

1. **Abra um projeto.** Escolha a pasta na interface para trabalhar com seus arquivos e conversas. Sem projeto selecionado, o assistente usa um workspace privado do aplicativo.
2. **Configure a IA.** Cadastre provedores e modelos em **Configurações de IA**. Você pode usar modelos diferentes para desenvolvimento, textos, pesquisa e análise de imagens, ou reutilizar um modelo com várias capacidades.
3. **Escolha um agente ou use o coordenador.** O Coordenador Nebula organiza o trabalho e pode chamar especialistas. Os agentes têm instruções, ferramentas e modelos próprios para suas áreas.
4. **Envie uma tarefa.** Revise a solicitação e envie pelo chat. A conversa mantém o histórico, exibe respostas em streaming e permite acompanhar ferramentas, perguntas, autorizações e resultados.
5. **Trabalhe no editor e revise.** Abra o Editor Nebula, edite os arquivos, envie contexto ao assistente e confira as diferenças registradas antes de confirmar a conclusão de uma missão.

Preparar uma missão ou enviar contexto do editor ao rascunho não inicia uma chamada de IA. O envio é manual. Ferramentas sujeitas a autorização aguardam sua aprovação; comandos aprovados e ações manuais no editor operam com os privilégios do usuário.

## Créditos aos projetos de origem

O Nebula foi desenvolvido a partir de um **fork do Xiaomi MiMo Code** e de um editor baseado no **código aberto do VS Code (Code-OSS)**. No macOS e Linux, essa base do editor é integrada por meio do **code-server**, mantido pela Coder; no Windows, o backend Code-OSS é compilado do repositório Microsoft para execução nativa.

| Projeto | Crédito e participação no Nebula |
| --- | --- |
| [Xiaomi MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) | Xiaomi Corporation e contribuidores: base do assistente, motor e desktop histórico usado no fork. |
| [VS Code / Code-OSS](https://github.com/microsoft/vscode) | Microsoft e contribuidores: base do Editor Nebula, incluindo árvore de arquivos, edição, Git, terminal e extensões. |
| [code-server](https://github.com/coder/code-server) | Coder e contribuidores: adaptação do Code-OSS para o editor integrado no macOS e Linux. |

Agradecemos aos autores e às comunidades desses projetos. O nome e as adaptações Nebula não substituem os créditos, direitos autorais, licenças e avisos dos componentes originais, que permanecem preservados. O Nebula é um projeto independente.

## Recursos disponíveis

| Área | O que você pode fazer |
| --- | --- |
| Assistente | Criar e retomar conversas, acompanhar streaming, cancelar tarefas e consultar o histórico. |
| Editor Nebula | Usar o workbench Code-OSS integrado, com explorador de arquivos em árvore, abas, busca, Git, terminal e extensões. |
| Agentes | Selecionar especialistas em desenvolvimento, configuração, navegador, computador, textos, pesquisa e análise visual. |
| Modelos e provedores | Configurar OpenRouter, Hugging Face, Ollama, Xiaomi e endpoints compatíveis com OpenAI; definir modelos por finalidade e por agente. |
| Missões | Adicionar, editar objetivos, remover registros, retomar conversas e revisar plano, ferramentas e diferenças de arquivos. |
| Navegador e MCP | Usar um navegador isolado e conectar servidores MCP remotos ou locais via stdio, escolhendo os agentes com acesso. |
| Artefatos | Consultar arquivos reais do projeto e prévias de texto. |
| Aparência | Escolher tema claro, escuro ou o padrão do sistema, que é a opção inicial. |
| Nebula Reflex | Receber uma sugestão de agente e de pergunta essencial para orientar a tarefa, aplicada manualmente. |

A análise visual depende de um modelo compatível com visão. O operador do computador oferece consulta de ambiente, arquivos do projeto e terminal supervisionado; o controle visual geral de outros aplicativos ainda está pendente.

### Editor e missões

No Editor Nebula, selecione um trecho ou use o arquivo ativo e escolha **Explicar código**, **Corrigir código** ou **Criar testes**. O assistente recebe um rascunho com arquivo, linguagem, linhas, conteúdo e diagnósticos. Explicações usam um agente de leitura; correções e testes exigem salvar o arquivo antes de preparar a solicitação.

Em **Missões**, prepare um objetivo, edite pelo lápis e remova pela lixeira. Remover o registro preserva conversas e arquivos; uma execução em andamento continua na conversa. Editar uma missão já enviada altera o objetivo salvo, enquanto novas orientações ao agente devem ser enviadas no chat. A conclusão é confirmada pelo usuário depois da revisão, e não certificada automaticamente pelo modelo.

## Executar o desktop

Requisitos: **Node.js 20.19+**, **npm** e **Git**. Plataformas preparadas: **macOS ARM64**, **Linux x64/ARM64 com glibc** e **Windows x64 nativo**. Linux requer ferramentas de compilação, bibliotecas gráficas e um serviço de chaveiro. A primeira preparação no Windows compila o Code-OSS e requer Python 3 e Visual Studio 2022 C++ Build Tools/Windows SDK. Consulte os [requisitos e o estado de validação por plataforma](docs/MULTIPLATAFORMA.md). A preparação inicial requer internet e vários GB de espaço livre.

Na raiz do repositório:

```sh
npm ci
npm run desktop:fork:prepare
npm run desktop:dev
```

O script de preparação recupera as revisões fixadas, verifica os checksums configurados, aplica o patch do Nebula e prepara os runtimes locais. `npm run dev` também inicia o desktop principal.

Para gerar o aplicativo:

```sh
npm run desktop:fork:app
```

O caminho do aplicativo depende da plataforma:

| Sistema | Aplicativo gerado em `.desktop-fork/packages/desktop/dist/` |
| --- | --- |
| macOS ARM64 | `mac-arm64/Nebula Cortex.app` |
| Linux ARM64 | `linux-arm64-unpacked/nebula-cortex` |
| Linux x64 | `linux-unpacked/nebula-cortex` |
| Windows x64 | `win-unpacked/Nebula Cortex.exe` |

Mantenha a pasta completa junto do executável. `npm run desktop:fork:archive` gera o arquivo de distribuição de desenvolvimento.

Em **Configurações de IA**, informe o endpoint, os modelos e suas capacidades e, quando necessário, a chave do provedor. O uso de provedores remotos pode ter custos definidos por eles. Ollama local em loopback dispensa chave. As capacidades configuradas devem corresponder às do modelo e da API; selecionar um provedor não garante que todos os seus modelos sejam compatíveis.

O desktop salva as chaves com o armazenamento seguro do sistema via Electron `safeStorage`. Runtimes, perfis locais, dependências e builds são ignorados pelo Git. Não inclua credenciais ou dados pessoais em commits, issues ou PRs.

## Verificar alterações

```sh
npm run check
npm run check:publication
npm run desktop:fork:test
npm run desktop:fork:integration
```

Os testes do fork exigem a preparação anterior na plataforma de destino. A integração usa o motor real com APIs locais sintéticas, sem chamadas a provedores pagos. A verificação de publicação examina a integridade do patch, avisos de terceiros, artefatos locais, tamanhos de arquivos e alguns padrões de credenciais; ela não substitui a revisão do conteúdo que será publicado.

## O que ainda está em desenvolvimento

- Geração real de imagens e vídeos: os modelos podem ser configurados, mas os fluxos de geração ainda não estão implementados.
- Instalador de plugins e skills do assistente. As conexões MCP e extensões do editor já têm mecanismos próprios.
- Checkpoints recuperáveis e restauração de arquivos com verificação de conflitos.
- Controle visual geral de outros aplicativos, avaliação ampliada do Reflex e distribuição assinada.

Veja o [plano de próximas entregas](docs/PROXIMAS-ENTREGAS.md).

## Contribuir

**Quem quiser contribuir com o Nebula é bem-vindo!** Você pode propor melhorias, relatar problemas, melhorar a documentação e as traduções ou enviar código.

Para contribuir com código, faça um fork, crie uma branch, implemente uma alteração com escopo claro e abra um **Pull Request (PR)**. Explique o problema, a solução e como verificou o resultado. Inclua testes relevantes e capturas de tela quando a alteração afetar a interface. Para mudanças grandes, abra uma issue primeiro para alinhar a proposta.

**Todos os PRs serão analisados pelos responsáveis pelo projeto antes de serem aceitos.** A revisão considera funcionamento, segurança, qualidade, compatibilidade e alinhamento com o projeto. Abrir um PR não garante sua aprovação; ajustes podem ser solicitados antes do merge. Ao alterar estes READMEs, mantenha as três versões consistentes.

As adaptações do desktop são distribuídas em `integrations/mimo-desktop/nebula.patch`, com manifesto em `upstream.json`. Se alterar o fork local, atualize o patch e seu checksum junto com o código para que a mudança possa ser reproduzida. Não envie os diretórios de runtime ou o checkout `.desktop-fork` ao repositório raiz.

## Arquitetura, origem e documentação

O desktop principal combina um fork histórico do repositório oficial **Xiaomi MiMo Code**, a interface Electron/Solid, o motor MiMo e o editor **Code-OSS/code-server**, com integrações e identidade próprias do Nebula. O projeto não é um produto oficial da Xiaomi, Microsoft ou Cursor, nem uma cópia completa da interface comercial atual do MiMo Desktop.

O código React/Tauri anterior permanece em `apps/desktop`. `npm run dev:legacy` inicia a prévia de navegador com respostas simuladas e editor Monaco em memória; essa prévia é separada do desktop principal.

- [Desktop, procedência e reprodução](docs/MIMO-DESKTOP-FORK.md)
- [Agentes e ferramentas](docs/AGENTES-NEBULA.md)
- [Missões e contexto do editor](docs/MISSOES-NEBULA.md)
- [Conexões MCP](docs/CONEXOES-MCP-NEBULA.md)
- [Nebula Reflex](docs/NEBULA-REFLEX.md)
- [Editor Code-OSS](docs/EDITOR-CODE-OSS.md)
- [Aparência](docs/APARENCIA-NEBULA.md)
- [Publicação no GitHub](docs/PUBLICACAO-GITHUB.md)
- [Registro de desenvolvimento](DESENVOLVIMENTO.md)

A documentação técnica complementar está atualmente em português. Os avisos e as licenças dos componentes externos estão preservados em `integrations` e `editor/third-party`. A licença do código próprio do Nebula ainda não foi definida em um arquivo `LICENSE` na raiz.
