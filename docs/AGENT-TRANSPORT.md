# Transporte nativo do agente

Atualização de 01/10/2026: além do motor simulado descrito neste registro, o aplicativo agora supervisiona a ponte e o motor oficial MiMo Code, com ferramentas, permissões e sessões. A implementação e a verificação atuais estão em [MIMO-INTEGRACAO.md](MIMO-INTEGRACAO.md). Os dados de pacote e testes abaixo registram a entrega anterior.

Entrega de 01/10/2026. O chat do desktop agora usa React → canal IPC Tauri → supervisor Rust → processo Node → JSON Lines. A prévia do navegador mantém o motor em memória. Ambos usam o provedor simulado; não há chamadas a APIs nem ferramentas do agente.

## Execução e empacotamento

Prepare `npm run editor:prepare` e execute `npm run native:app` no macOS ARM64. O `.app` contém `agent/sidecar.cjs` e utiliza o executável Node oficial já incluído em `editor-runtime/darwin-arm64/node/bin/node`. Editor e agente são processos diferentes. A aplicação não procura Node no PATH nem transmite a configuração do ambiente do editor para o agente. O processo recebe ambiente vazio e trabalha no diretório do bundle do agente.

O script nativo gera o sidecar antes de executar Cargo/Tauri. A etapa de build do Tauri também executa o build completo da raiz; assim, frontend e sidecar são atualizados juntos. Em desenvolvimento, a resolução dos recursos pode usar o checkout. O pacote tem prioridade e a versão de produção exige recursos empacotados. Outras plataformas ainda precisam de runtime próprio.

## Ciclo de vida

- O processo inicia na primeira tarefa e permanece disponível para as seguintes, até sair ou até o aplicativo encerrar.
- O Rust registra a tarefa antes de escrever no stdin; eventos retornam pelo canal específico dessa requisição. São conferidos versão, identificadores, ordem e tamanho.
- Há até quatro execuções simultâneas no supervisor e no sidecar. A interface atual envia uma por vez. Cancelar exige os identificadores da tarefa e da conversa.
- Se o cancelamento acontecer durante a inicialização, a interface o encaminha assim que o backend aceitar a tarefa. Depois de cancelar, novos deltas são ignorados.
- Saída inválida, perda do canal, morte do processo e 60 segundos sem eventos encerram as tarefas pendentes. Cancelamento sem confirmação por dois segundos também encerra o processo. Isso pode encerrar outras tarefas nesse mesmo processo.
- Não existe repetição automática. Somente enviar uma nova tarefa inicia outro processo. A resposta parcial permanece no histórico com estado final.
- Encerrar o aplicativo mata e coleta o processo Node. O provedor atual não cria subprocessos. Isolamento de ferramentas e controle de descendentes deverão preceder ferramentas reais.

## Limites e fronteira

Os comandos do agente verificam que o chamador é a WebView `main`. A WebView do Code-OSS não recebe essa rota. Nenhum caminho de executável ou script vem da interface. O agente não recebe autorização de arquivos, shell, MCP ou credenciais; seus contratos de ferramentas continuam recusando operações.

Tarefas têm até 32.000 unidades UTF-16, compatíveis com o limite JavaScript. JSONL recebe até 256 KiB por linha para acomodar caracteres escapados. Entrada e saída têm leitura limitada; escrita no pipe usa modo não bloqueante e prazo de dois segundos. Deltas são divididos em até 8.192 unidades UTF-16 sem separar pares Unicode. Erros do transporte e stderr do processo não expõem detalhes internos na conversa.

O supervisor controla o ciclo de vida, mas não é uma sandbox do sistema operacional. Provedores reais, armazenamento seguro de chaves e o executor autorizado de ferramentas ainda precisam ser implementados. O histórico continua em localStorage; SQLite permanece pendente.

## Verificação

`npm run check`: 21 testes JS/TS e TypeScript aprovados. `npm run native:test`: 17 testes Rust aprovados (broker, editor e sete cenários do agente). Os cenários do transporte incluem streaming antes da confirmação IPC, cancelamento durante a inicialização, correlação da conversa, mensagens grandes, morte do sidecar, reinício sem repetir tarefas e pipes/cancelamentos travados. Os testes Rust de processo usam o Node preparado e o bundle gerado pelo script nativo.

O `.app` de desenvolvimento foi gerado com 836,97 MiB. Pela janela nativa foram confirmados streaming, conclusão, cancelamento preservando texto parcial, morte controlada do sidecar com estado de falha, envio de uma nova tarefa reiniciando o motor e encerramento do processo ao sair. A lista de processos confirmou uso do Node e do sidecar dentro de `Contents/Resources`, sem Node externo. Captura: `docs/native-agent-preview.png`. Uma falha descoberta na homologação — cancelar ao confirmar o início — foi corrigida e ganhou teste de regressão.
