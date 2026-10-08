# Missões e contexto do Editor Nebula

Entrega de 05/10/2026 no desktop principal Electron/Solid.

## Trabalhar a partir do código

Abra um projeto no Editor Nebula. Selecione um trecho ou mantenha o arquivo ativo sem seleção. Na paleta de comandos ou no menu de contexto, use:

- **Nebula: Explicar código**: prepara uma explicação com um agente somente de leitura. Leitura e perguntas mantêm autorização; edição, terminal, MCP e delegação ficam indisponíveis nesse perfil.
- **Nebula: Corrigir código**: prepara uma solicitação ao agente de desenvolvimento, incluindo inspeção do arquivo atual, diferenças e verificação.
- **Nebula: Criar testes**: prepara uma solicitação de testes dos contratos do trecho, usando as ferramentas existentes no projeto.

O assistente abre com um rascunho contendo o caminho relativo, linguagem, linhas, código e até 40 diagnósticos do editor. Revise a solicitação e pressione **Enviar**. Preparar o contexto não chama uma API de IA nem modifica arquivos. O modelo é a atribuição de desenvolvimento configurada pelo usuário.

Correções e testes exigem salvar o arquivo primeiro. Explicações aceitam alterações não salvas e identificam esse estado no rascunho. O contexto fica limitado a 65.536 caracteres e a um arquivo real dentro do projeto aberto, incluindo verificação do destino de links simbólicos. Esse limite pertence ao envio do contexto; a IDE manual continua operando com os privilégios do usuário.

## Acompanhar uma missão

Em **Missões**, escreva um objetivo e escolha **Preparar missão**. A solicitação aparece no compositor com orientação para registrar etapas proporcionais ao trabalho e apresentar evidências. Ao enviar, a missão fica vinculada à conversa real e ao modelo escolhido.

O painel permite retomar a conversa e mostra os estados observados no motor, perguntas e autorizações pendentes, etapas registradas com `todowrite`, agentes que responderam, chamadas de ferramentas, arquivos alterados e a última resposta. Uma resposta terminada aparece como **Aguardando revisão**. Apenas **Confirmar conclusão após revisão** marca a missão como concluída pelo usuário. Uma nova solicitação enviada pela missão reabre esse estado.

As etapas dependem do registro feito pelo agente. O painel não inventa um plano nem certifica que a saída de uma ferramenta representa um teste aprovado. Uma chamada concluída significa que a ferramenta terminou; sua saída deve ser revisada. A visualização consulta até 100 mensagens por conversa, 20 conversas filhas e exibe as últimas 40 chamadas de ferramentas, com saídas abreviadas. O histórico completo continua na conversa.

## Adicionar, editar e remover

Prepare novas missões pelo campo **Objetivo da missão**. Cada registro na lista possui um lápis (**Editar objetivo**) e uma lixeira (**Remover missão**), com explicação ao passar o mouse e nomes acessíveis pelo teclado.

A edição aceita até 8.000 caracteres e exige um objetivo não vazio. Antes do primeiro envio, o rascunho é atualizado; missões do editor preservam o contexto original, o arquivo, as linhas, o agente e suas restrições. Edições repetidas substituem o objetivo anterior sem acumular instruções. Depois de vincular uma conversa, a edição altera somente o objetivo salvo: para orientar a execução, envie uma nova mensagem na conversa. Mensagens enviadas e a conclusão registrada permanecem preservadas.

A remoção exige confirmação no aplicativo e remove apenas o registro da missão. Conversas, mensagens e arquivos continuam disponíveis. Execuções em andamento continuam na conversa. O vínculo ativo e o rascunho pendente dessa missão são liberados, preservando o rascunho de outras missões e o texto independente de conversas. Não há restauração do registro removido.

Edição e remoção usam a mesma fila de escrita atômica da criação. Registros ausentes, identificadores inválidos e objetivos inválidos são recusados. Uma edição concorrente à remoção não recria a missão.

## Revisar diferenças de código

Selecione a missão e use **Ver diferenças**. Expanda um arquivo para conferir as linhas removidas e adicionadas, com numeração anterior/posterior e as contagens registradas pelo motor. A revisão aceita patches e o formato anterior de conteúdos antes/depois. **Atualizar diferenças** consulta novamente o registro; **Abrir projeto no Editor Nebula** abre o projeto para inspeção. A lista de missões tem rolagem própria e aparece ao lado dos detalhes em janelas largas; em janelas menores, os detalhes ficam abaixo de uma lista com altura limitada.

A comparação pertence ao histórico da conversa principal da missão. Uma edição posterior no disco pode ser diferente desse registro. Arquivos sem comparação textual, conversas excluídas e falhas do motor recebem mensagens próprias. Ausência de diferenças registradas não comprova ausência de alterações no projeto. Checkpoints para restaurar arquivos e a resolução de conflitos permanecem na próxima etapa.

O carregamento das diferenças ocorre por solicitação, com até 100 arquivos, 65.536 caracteres por arquivo e 262.144 por resposta. Patches exibem até 1.000 linhas; prévias parciais são identificadas. Conteúdos anteriores/posteriores abreviados ficam em painéis separados para evitar produzir diferenças artificiais a partir de cortes. Enquanto uma missão executa ou aguarda o usuário, o estado continua sendo atualizado automaticamente. Nos demais estados, use **Atualizar** para consultar mudanças externas.

## Persistência e integração

As missões são salvas em `missions.json` no perfil do desktop, com escrita serializada, substituição atômica e permissões `0600`. O arquivo inclui o contexto de código e não é criptografado. O motor mantém as conversas em seu próprio armazenamento. Vínculos com conversas de outro projeto ou conversas filhas são recusados.

A extensão usa uma ponte HTTP local com porta e token aleatórios por sessão do editor. A ponte valida autenticação, origem, tamanho, projeto e dados; não expõe IPC Electron ao workbench. Seu encerramento acompanha o editor. A atualização da extensão própria preserva os registros das demais extensões.

## Verificação

`npm run desktop:fork:test` verifica tipos, configuração dos agentes e envio do compositor. `npm run desktop:fork:integration` executa o motor oficial com uma API local sintética: valida migração da extensão, ponte autenticada, contexto, limites, persistência, vínculo, estados, revisão explícita, autorizações e indisponibilidade de ferramentas de escrita no agente de explicação. A validação não usa provedores pagos.

Criação, envio manual, persistência, revisão e retomada da missão foram exercitados em um perfil descartável com o pacote macOS. A paleta exibiu os cinco comandos da extensão atualizada. Uma seleção TypeScript enviada por **Explicar código** abriu o rascunho correto, usou o agente de leitura e ficou vinculada à missão após resposta da API sintética. Nova tarefa abriu sem repetir o rascunho enviado. A qualidade de correções e testes gerados por um provedor pago não foi avaliada. Esta entrega integra missões ao motor existente; geração de imagem/vídeo e distribuição assinada continuam pendentes.

Ações consecutivas de criar testes, corrigir e explicar também foram conferidas sem reiniciar o aplicativo: cada ação substituiu o texto anterior, e o envio final levou o contexto de explicação ao agente de leitura. O rascunho permanece disponível durante a navegação e é liberado após vincular a missão, evitando que um compositor em saída o consuma antes do compositor visível.

O gerenciamento foi verificado com API sintética: objetivos inválidos recusados, edições sucessivas e concorrentes persistidas, contexto do editor mantido e registros removidos sem recriação. A remoção de missões vinculadas preservou a conversa, as mensagens e os arquivos. Na interface macOS isolada, criação, edição, bloqueio de objetivo vazio e atualização do rascunho foram exercitados; o diálogo de remoção foi aberto e cancelado. A remoção efetiva foi exercitada pela integração nativa.
