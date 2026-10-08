# Conexões MCP no Nebula

Implementação de 03/10/2026. O desktop permite cadastrar servidores MCP remotos e programas locais via stdio nas Configurações de IA, além do MCP interno do Operador Nebula. O cadastro usa o cliente MCP do motor MiMo e as ferramentas recebidas são reais.

## Configurar

1. Abra **Configurações de IA → 5. Conexões MCP remotas**, ou use **Plugins e MCP → Configurar conexões MCP**.
2. Clique em **Adicionar MCP**, dê um nome e informe o endpoint HTTP do servidor. Use HTTPS; HTTP é aceito apenas em loopback. URLs com credenciais, query ou fragmento são recusadas.
3. Escolha **Sem token** ou **Bearer token**. Para Bearer, informe somente o token, sem o prefixo `Bearer`.
4. Marque os agentes que poderão utilizar as ferramentas. Uma conexão nova permite acesso somente ao Coordenador; cada especialista precisa ser selecionado se também for utilizá-la. A mesma escolha vale para o perfil delegado do especialista.
5. Salve. O motor reinicia e o assistente recarrega, preservando a view do editor. Não é permitido salvar durante tarefas conhecidas em execução.
6. Reabra as configurações e use **Consultar conexões salvas** para ver o estado aplicado. Alterações ainda não salvas não mudam esse estado.

A opção **Conexão ativa** permite desativar o servidor sem remover seu cadastro. Para excluir um token de uma conexão Bearer, desative-a ou mude a autenticação antes de salvar. Remover a conexão também remove sua credencial do arquivo de configurações.

## Programas locais (stdio)

Em **6. MCP local (stdio)**, adicione um programa já instalado, seu caminho absoluto e os argumentos em campos separados. O comando é enviado como uma lista ao motor, sem composição automática de uma linha de shell. Argumentos com espaços conservam seus limites. Cadastros novos começam desativados. Marque **Programa ativo**, escolha os agentes e salve.

Uma confirmação nativa mostra programa, argumentos e agentes antes de gravar uma ativação nova. Reativar, mudar o comando ou ampliar os agentes com acesso exige nova confirmação. Cancelar conserva a configuração anterior. O executável precisa existir e ter permissão de execução. Enquanto estiver ativo, o motor poderá iniciá-lo ao abrir projetos, inclusive nas próximas execuções do Nebula; desative e salve para interromper.

O programa executa com os privilégios do usuário e pode acessar arquivos e rede por conta própria, inclusive antes de qualquer chamada de ferramenta. A autorização das ferramentas não é uma sandbox para o programa. As variáveis que contêm as chaves de provedores, tokens MCP e senha do motor são esvaziadas explicitamente no ambiente do processo local; isso não impede um programa com os mesmos privilégios de acessar outros dados do usuário. Não informe senhas nos argumentos, que são armazenados em texto na configuração.

Não há instalação automática nem ambiente personalizado nesta etapa. Configure runtimes já instalados por caminho absoluto quando o servidor exigir Node, Python ou outro interpretador. O cliente inicia o processo na pasta do projeto; não há campo próprio para diretório de trabalho.

## Credenciais e acesso

Tokens são criptografados com Electron safeStorage e gravados no vault existente, com modo 0600. A configuração pública contém somente um indicador de token salvo. O token é vinculado ao ID e ao endpoint do servidor: mudar a URL não reutiliza o token anterior. Uma conexão Bearer ativa sem token é recusada antes de gravar a configuração.

O token é passado ao motor por variável de ambiente privada para formar o cabeçalho de autenticação. Ele precisa existir em memória durante a conexão; não é incluído no patch ou no repositório. Ferramentas de um servidor não selecionado são negadas ao agente e não aparecem em sua lista de ferramentas. Cada chamada de ferramenta disponível exige aprovação, incluindo chamadas realizadas por um especialista delegado em primeiro plano. A aprovação mostra a ferramenta e seus argumentos; o histórico conserva a chamada e o resultado.

Descrições e respostas de um MCP são conteúdo não confiável e não concedem autorização. A escolha do servidor e do escopo cabe ao usuário. O app não habilita execução local de comandos fornecidos por um servidor remoto.

## Verificação e limites

Os testes verificam migração de configurações anteriores, endpoints e IDs válidos, acesso por agente, modelo de especialista, conexão com autenticação real no motor, token criptografado, recusa ao mudar endpoint sem novo token, chamada somente após aprovação, desativação e exclusão de token. A API e o MCP de teste usam dados sintéticos em loopback, sem provedor pago.

O pacote nativo também foi validado pela interface: adicionar o servidor, salvar Bearer, reabrir sem revelar o token, consultar o estado conectado, autorizar uma chamada e receber o resultado no histórico. Evidências: [configuração](nebula-mcp-settings-validation.png), [autorização](nebula-mcp-permission-validation.png) e [resultado](nebula-mcp-validation.png).

Para reproduzir sem API paga, execute `node integrations/mimo-desktop/gui-fixture.mjs` e abra o pacote com `NEBULA_DESKTOP_DATA` apontando para `.desktop-runtime/operator-gui-validation`. Cadastre o `mcpURL` informado pela fixture e use o token sintético `gui-mcp-test-token`, permitindo acesso ao Coordenador. Envie `[external-mcp-test]` e autorize a ferramenta uma vez. Esse marcador existe apenas na fixture. Encerre app e fixture e abra normalmente o pacote para voltar ao perfil pessoal.

A integração nativa verifica também stdio real, argumentos com espaços e caracteres de shell preservados, ausência das credenciais no ambiente do filho, isolamento por agente, autorização antes da chamada, programa desativado não iniciado, falha de executável ausente, desativação e encerramento do processo junto com o motor. A fixture local é `integrations/mimo-desktop/stdio-fixture.mjs`.

Na interface do pacote nativo, foram conferidos cadastro com argumentos separados, confirmação antes da ativação, cancelamento sem gravação nem execução, estado conectado e chamada da ferramenta pelo Coordenador. O resultado foi recuperado do histórico depois de reabrir o aplicativo. Evidências: [confirmação nativa](nebula-stdio-activation-validation.png), [cadastro conectado](nebula-stdio-settings-validation.png) e [resultado persistido](nebula-stdio-validation.png).

Para reproduzir no perfil sintético, a fixture GUI informa `stdioCommand`: use o primeiro item como programa e os demais como argumentos. Ative o cadastro, confirme o programa de teste e envie `[local-mcp-test]` ao Coordenador. Autorize uma chamada. O marcador pertence exclusivamente à fixture local, sem acesso a provedor pago.

Esta etapa suporta MCP remoto com autenticação sem token ou Bearer e MCP local por stdio. OAuth, headers personalizados, variáveis próprias do programa e instalação de plugins continuam pendentes. O modelo escolhido precisa suportar chamadas de ferramentas. O estado de conexão mostra conectado, desativado, falha ou indisponível; mensagens remotas não são exibidas para evitar revelar credenciais em erros.
