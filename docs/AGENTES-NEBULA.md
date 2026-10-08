# Agentes profissionais e Operador Nebula

Implementação de 02/10/2026. O desktop principal abre com o Coordenador Nebula selecionado e permite escolher diretamente sete especialistas: Desenvolvimento, Configuração, Navegador, Computador, Textos, Pesquisa e Análise de imagens. Os perfis são enviados ao motor oficial MiMo, não são respostas simuladas da interface.

## Contexto e modelos

Desenvolvimento recebe um levantamento técnico da pasta selecionada: linguagens presentes, manifests e frameworks reconhecidos pelas dependências. O levantamento percorre até quatro níveis e 1.500 arquivos; ignora arquivos ocultos, links simbólicos, dependências e diretórios gerados. Não lê arquivos de segredos. Contagem de extensões não comprova a linguagem do problema: o agente deve inspecionar os arquivos envolvidos antes de escolher padrões e ferramentas.

O contexto técnico é anexado à primeira mensagem da sessão e persiste no motor. Cada perfil possui suas próprias instruções profissionais, práticas de diagnóstico e verificação e política de ferramentas. Isso orienta o modelo escolhido; não transforma automaticamente um modelo sem capacidade adequada em especialista. A qualidade precisa ser acompanhada com tarefas e avaliações reais.

Em **Configurações de IA → Agentes profissionais**, um modelo pode ser escolhido para cada agente. A opção padrão herda o modelo da finalidade: coordenador/desenvolvimento/configuração/computador usam código; navegador/pesquisa usam pesquisas; textos usam textos; análise visual usa visão. A configuração valida a capacidade declarada e mantém as credenciais no armazenamento criptografado existente. Configurações anteriores recebem os padrões automaticamente, sem apagar provedores ou modelos.

## Coordenação real

O Coordenador chama os especialistas pelo mecanismo nativo `actor` do motor MiMo. Cada chamada utiliza o contexto profissional e o modelo configurado para o especialista. Perfis internos de delegação são registrados como subagentes; eles não podem criar novos agentes. Especialistas sem modelo compatível atribuído não são oferecidos ao Coordenador. O usuário também pode selecionar um especialista diretamente no compositor.

O contexto orienta o Coordenador a esclarecer decisões, distribuir responsabilidades por arquivos, informar o objetivo e os critérios de aceitação, executar dependências em sequência e reunir evidências de conclusão. Especialistas recebem somente o briefing; o Coordenador precisa incluir nele os fatos e decisões relevantes. As instruções orientam o modelo e não garantem por si só uma boa decomposição para qualquer tarefa.

Tarefas com leitura/edição de arquivos, terminal ou navegador usam **execução supervisionada em primeiro plano** (`actor run`). Assim o especialista pode solicitar a aprovação humana de suas ferramentas durante a execução. O início da delegação também exige aprovação e mostra o agente e a descrição da tarefa. Trabalho em segundo plano (`actor spawn` com coleta por `wait/status`) cabe quando não precisa de novas autorizações: o motor recusa ferramentas sem autorização prévia nessa modalidade. Não foi habilitada aprovação automática para contornar essa restrição. O navegador continua sendo um recurso compartilhado, com ações sequenciais.

## Perguntas e skills

A referência `grill-me` de Matt Pocock está em `integrations/agent-skills/grill-me`, com revisão fixada, fonte e licença MIT preservadas. Seus princípios de investigar decisões, recomendar uma resposta e perguntar uma questão por vez foram adaptados ao fluxo do Nebula. Não há instalação automática de skills encontradas em projetos ou na internet.

Os agentes recebem receitas de contexto incorporadas ao aplicativo: especialidade por linguagem, diagnóstico científico, diagnóstico de configuração, evidência de navegador, ações no computador e verificação. As receitas são instruções de comportamento; o modelo usa as ferramentas efetivamente disponíveis para executá-las.

Três modos ficam disponíveis:

- **Perguntar quando necessário**: investigar fatos e perguntar sobre ambiguidades que mudem a solução.
- **Investigar decisões (grill-me)**: aprofundar planos e decisões, uma pergunta por vez, com recomendação.
- **Executar com premissas explícitas**: resolver detalhes reversíveis e perguntar quando faltar informação indispensável ou autorização.

O modo de entrevista não modifica autorizações de ferramentas. As decisões já fornecidas permanecem válidas. O motor conserva perguntas e respostas no histórico da sessão.

## Navegador e computador

O Navegador Nebula abre uma janela Electron isolada, sem usar cookies do navegador pessoal e sem preload ou IPC do aplicativo. O agente pode abrir URLs HTTP/HTTPS, observar título/texto/elementos, preencher campos comuns, clicar em elementos, voltar e consultar o console. As referências são obtidas por snapshots e são invalidadas após ações ou navegação. Campos de senha exigem interação manual. Downloads, popups e pedidos de permissões da página são bloqueados nesta etapa. Não há ferramenta que execute JavaScript arbitrário fornecido pelo agente.

As ferramentas chegam ao motor por um servidor MCP próprio, autenticado com um token aleatório em loopback. Requisições sem token ou com `Origin` são rejeitadas. Cada ação passa pelo fluxo de autorização existente do motor; instruções de páginas não são autorização. O navegador compartilha uma única sessão de execução, com ações serializadas, e não funciona como vários operadores paralelos independentes.

Computador dispõe de informações básicas do sistema, revelação de arquivos pertencentes à pasta selecionada e comandos do terminal supervisionado. Caminhos são resolvidos antes de verificar se pertencem ao projeto. Controle visual genérico de aplicativos externos, conexão com abas já abertas do Chrome/Edge ainda estão pendentes. Não há acesso irrestrito ao computador nem alteração automática das permissões do macOS.

## MCP externo

Servidores remotos e programas locais via stdio podem ser cadastrados nas configurações e oferecidos apenas aos agentes selecionados, incluindo seus perfis delegados. A ativação de um programa local exige confirmação nativa, mostrando o comando e os agentes. A conexão não concede autorização automática para executar ferramentas. Tokens Bearer são criptografados e vinculados ao endpoint. Consulte [CONEXOES-MCP-NEBULA.md](CONEXOES-MCP-NEBULA.md).

## Verificação

Os testes de configuração verificam migração, modelo por agente e compatibilidade. A inspeção técnica é exercitada com um projeto misto e arquivos ocultos, gerados e links simbólicos. A integração usa o motor oficial, armazenamento seguro e uma API local sintética para conferir contextos enviados, modelo de configuração, pergunta com resposta, conexão MCP autenticada e autorização antes de inspecionar o ambiente. A delegação real verifica aprovação do início, execução com o modelo de Configuração, autorização da ferramenta dentro do especialista, retorno do resultado ao Coordenador e indisponibilidade de delegação recursiva.

Na interface nativa, foram verificados seleção do agente/modelo de configuração, pergunta com recomendação e resposta, além de um fluxo completo de navegador: abrir a página sintética, obter referências, preencher um campo, observar novamente, clicar, confirmar o resultado e consultar o console. Também foi verificada a coordenação na interface: iniciar o especialista de Configuração, autorizar sua consulta de ambiente e apresentar o resultado recebido ao Coordenador. Evidência em `docs/nebula-coordinator-validation.png`. Essa fixture verifica o encadeamento das ferramentas; não avalia a qualidade de raciocínio de um provedor comercial.

`npm run desktop:fork:test` executa a verificação de tipos e os testes dos pacotes. `npm run desktop:fork:integration` executa a integração nativa.

Para validar a interface sem uma API paga, execute `node integrations/mimo-desktop/gui-fixture.mjs` e abra o pacote com `NEBULA_DESKTOP_DATA` apontando para `.desktop-runtime/operator-gui-validation`. A fixture inclui uma página local para preenchimento e clique, além de modelos sintéticos por agente. `[grill-test]` em uma tarefa de Configuração exercita a pergunta; `[browser-test]` em uma tarefa de Navegador exercita o fluxo de ações. `[coordinate-test]` em uma tarefa do Coordenador exercita a delegação supervisionada para Configuração. Esses marcadores existem somente na fixture de teste. Encerre ambos os processos e abra normalmente o pacote para voltar ao perfil pessoal.
