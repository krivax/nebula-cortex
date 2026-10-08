# Nebula Reflex — piloto de orientação

Piloto implementado em 05/10/2026 no desktop principal Electron/Solid. Modo local funcional; adapters Cloudflare Clef e Jev/SystemOne implementados e verificados com respostas HTTP sintéticas. O modelo hospedado não foi avaliado com credenciais reais nem houve chamadas pagas.

## Melhoria da orientação local — 06/10/2026

As regras `pt-v2` dão prioridade à operação pedida: “Escreva um texto sobre Rust” sugere Textos; “Pesquise bibliotecas Rust” sugere Pesquisa; “Corrija a função mostrada na imagem” sugere Desenvolvimento. Uma restrição como “sem trocar dependências” não transforma por si só uma correção de código em tarefa de Configuração. Verbos como programar e resumir agora são reconhecidos.

Etapas ligadas por “e depois”, “e também”, “em seguida” ou ponto e vírgula podem sugerir o Coordenador quando exigem especialistas distintos. Se falta um modelo compatível para algum especialista ou para o Coordenador, o Reflex pede escolha manual. Não troca o objetivo por outra especialidade só porque ela está disponível. Etapas vagas também levam à abstenção.

Na orientação local, blocos de código cercados por três crases/tis e linhas de citação Markdown não viram instruções de encaminhamento. Isso não modifica o pedido original, que continua disponível ao agente quando você o enviar. As regras reconhecem alguns formatos de objetivo, restrição e negação em português; não constituem compreensão completa da linguagem. A confirmação manual continua necessária para aplicar a sugestão.

URLs incompletas, como `https://`, agora mantêm a pergunta pela URL. Novas decisões locais registram a versão das regras; registros anteriores permanecem legíveis, inclusive o retorno aplicado/descartado.

## Usar o piloto

1. Escreva o objetivo no assistente e clique em **Orientar tarefa**.
2. Confira o especialista sugerido, o modelo já atribuído a ele e a pergunta de esclarecimento, quando houver.
3. Escolha **Usar este agente** ou **Manter minha escolha**. A tarefa só é enviada quando você pressionar **Enviar**.

Uma sugestão aceita passa a ser escolha explícita. O Reflex preserva escolhas manuais e ações do editor; não chama o classificador nesses casos. Uma missão geral começa no Coordenador por padrão, mas pode receber uma recomendação. Editar o pedido ou trocar o agente invalida o cartão anterior. Resultados atrasados não substituem a sugestão de um novo pedido.

Em **Configurações de IA → Nebula Reflex · Decisões**, ative/desative o recurso e escolha **Regras locais**, **Cloudflare · Clef** ou **Endpoint Jev / SystemOne**. O padrão é regras locais, sem API. Para Cloudflare, informe ID da conta, Clef-flash/Clef e token; para SystemOne, informe a URL completa do endpoint e o modelo. O token fica protegido pelo armazenamento seguro do sistema e vinculado ao endpoint e identificador do modelo. Trocar a conta, URL ou modelo não encaminha automaticamente a credencial anterior.

Somente o texto do pedido e a indicação de que existem anexos entram no estado enviado ao classificador. Não são lidos/enviados arquivos, histórico ou imagens. Pedidos acima de 4.096 caracteres usam somente as regras locais. O envio ocorre ao clicar em Orientar tarefa, sem consultas automáticas durante a digitação.

Chamadas externas têm prazo configurável de 500–10.000 ms e limite diário de 1–1.000 tentativas (UTC; padrão 20). Falhas também contam, porque podem gerar cobrança. O limite não é um teto monetário. Reserva serializada impede que chamadas concorrentes ultrapassem a cota. Redirecionamentos são recusados e respostas ficam limitadas a 64 KiB. Falha ou limite atingido retorna às regras locais, sem consultar outro provedor. Saída incerta do classificador pede escolha manual; não libera ações.

Respostas são validadas contra as opções oferecidas, distribuição de probabilidades e modelo solicitado. O piloto exige pontuação mínima configurável (padrão 0,75) e margem mínima de 0,15 entre as primeiras opções. São limiares provisórios, ainda não calibrados em uma amostra independente em português.

O registro local `reflex.json` contém até 200 decisões: ID, data, origem, agente, pontuação, duração, versão das regras locais quando usada, identificador do classificador, tokens informados e retorno aplicado/descartado. Não inclui texto, arquivos, imagens nem credenciais. A escrita é serializada e atômica, com permissões `0600`. Os identificadores dos serviços hospedados não revelam a revisão exata dos pesos.

## Avaliação e decisão nesta entrega

O conjunto original tem 165 pedidos sintéticos em português. A primeira versão correspondeu à categoria esperada em 161 casos; as quatro divergências motivaram os ajustes. Com `pt-v2`, os 165 casos originais e 37 casos adicionais de regressão corresponderam às expectativas. As regras foram ajustadas usando esses exemplos, criados durante a implementação: isso mede regressão e não estima acerto em produção. [Avaliação reproduzível](NEBULA-REFLEX-AVALIACAO.md), executável com `npm run desktop:fork:reflex-eval`.

Tipos, 35 testes e integração nativa passaram. Testes cobrem saída tipada, envelope REST Cloudflare, HTTP SystemOne real com API sintética, limite concorrente, timeout, redirecionamentos, tamanho, token protegido, preservação de escolha manual/editor, desativação, versão das regras, compatibilidade do registro anterior e registro sem texto. Na interface isolada foram conferidos recomendação, aceitação, envio ao agente de Desenvolvimento, esclarecimento de URL, abstenção, invalidação após editar, campos Clef e persistência da ativação. Em 06/10, o pacote atualizado mostrou Textos para revisão de gramática, Desenvolvimento para correção sem trocar dependências e Coordenador para configuração seguida de redação; aplicar a sugestão não enviou a tarefa e a escolha foi preservada. O cartão foi conferido visualmente em modo claro e a sobreposição de controles foi corrigida.

**Vale entregar o piloto local e manter Clef opcional. Ainda não há evidência própria de que Clef supera as regras no Nebula.** A comparação com o serviço hospedado exige uma conta/token configurados e chamadas com custo. Não foram usadas chaves do usuário. Execução local dos pesos Clef e fine-tuning não fazem parte desta entrega.

## Fundamento e direção do produto

Experimentar uma camada opcional de decisões estruturadas para orientar o uso do Nebula. Começar com encaminhamento de tarefas e esclarecimento do escopo, em modo de sugestão. Manter os agentes e modelos generativos atuais para produzir respostas, código e pesquisas.

Clef e Clef-flash são modelos de decisão publicados pela Cloudflare em 01/10/2026. Aceitam estado e perguntas tipadas, devolvendo escolhas, probabilidades e pontuações. São compatíveis com a API Jev/SystemOne. A variante Flash tem 9B parâmetros; a maior tem 27B. Os pesos são publicados sob Apache-2.0. São fatos do [anúncio oficial](https://blog.cloudflare.com/clef-decision-models/) e do [modelo oficial Flash](https://huggingface.co/Cloudflare/clef-flash), não resultados medidos no Nebula.

Não tratar a probabilidade do modelo como autorização ou garantia de acerto. Os testes executados no motor e as regras do executor continuam determinando o resultado e os acessos permitidos.

## Experiência proposta

O usuário descreve o objetivo normalmente. O Nebula apresenta uma recomendação curta, com opção de alterar o agente/modelo ou continuar manualmente. Por exemplo: “Recomendo Desenvolvimento. Esta tarefa envolve Rust e TypeScript. Antes de alterar, confirme se a mudança deve incluir o backend.” O motivo textual é montado a partir dos campos observados e da recomendação; o classificador não inventa uma explicação em texto livre.

| Situação | Apoio proposto |
|---|---|
| Corrigir um erro | Encaminhar para Desenvolvimento e priorizar contexto do arquivo/diagnósticos disponíveis |
| Configurar MCP ou modelos | Escolher Configuração e detectar informações que faltam |
| Verificar um site | Escolher Navegador e esclarecer URL, projeto e objetivo |
| Organizar arquivos | Escolher Computador e esclarecer a pasta e a operação |
| Pesquisar e escrever | Recomendar Pesquisa ou Textos, com os modelos já configurados pelo usuário |
| Pedido com várias etapas | Recomendar uma missão coordenada e os especialistas envolvidos |

No editor, ações explícitas como Explicar código já determinam a intenção e dispensam classificação. Detecção de linguagem vem dos arquivos e ferramentas do projeto. O Reflex pode sugerir especialidade, mas não substitui essa evidência.

## Fluxo e contratos

Pedido → regras locais e contexto mínimo → classificador opcional → validação da resposta → sugestão ao usuário → missão/agente existente → ferramentas com autorização → evidências no painel.

O contrato interno de decisão deve ter versão, finalidade, agente recomendado, necessidade de pergunta, especialidades candidatas, escolha dentro de uma lista de modelos disponíveis, probabilidades por opção e opção explícita de abstenção. Só aceitar enums/IDs existentes; validar saída, limites e prazo. Registrar versão do modelo, duração, uso informado e resultado aceito/alterado pelo usuário. Evitar guardar o código bruto novamente no log de decisões.

Regras locais prevalecem: agente explicitamente escolhido, ação explícita do editor, capacidades e orçamento dos modelos, permissões e escopo do projeto. O classificador não ganha ferramentas de execução e não aprova escrita, terminal, acesso ao computador ou navegador. Classificações de risco podem acrescentar perguntas; nunca dispensar uma autorização exigida pelo executor.

## Configuração e provedores

O piloto oferece ativação opcional, provedor, modelo, modo de sugestão, limite de tentativas e envio mínimo de contexto. Um orçamento monetário com preços e consumo reconciliados é uma evolução futura; não confundir o contador atual com esse controle.

Adapters separados implementam a API tipada SystemOne e o envelope REST Cloudflare. O catálogo de chat OpenAI compatível não implementa esse contrato apenas por registrar o nome Clef. O endpoint Cloudflare segue a [documentação oficial](https://developers.cloudflare.com/workers-ai/models/clef-flash/). Um endpoint Jev/local compatível pode ser configurado; o Nebula não instala nem executa os pesos por conta própria. Não assumir disponibilidade em OpenRouter ou nos Inference Providers da Hugging Face.

O modelo oficial utiliza um backbone e uma cabeça de classificação conjunta. Executar localmente exige preservar esse mecanismo; servir apenas o modelo como chat em Ollama não demonstra equivalência. Avaliar execução local depois de medir memória, latência e compatibilidade no hardware alvo. A documentação oficial apresenta execução PyTorch/CUDA; suporte prático ao macOS do Nebula ainda precisa de validação.

Se o serviço falhar, estiver desligado, atingir o orçamento ou produzir resultado inválido/ambíguo, manter escolha manual ou pedir esclarecimento. Não enviar contexto a outro provedor automaticamente.

## Próximas etapas

1. **Comparação independente:** manter o baseline local e avaliar Clef-flash/Clef/Jev no mesmo conjunto e em novos casos revisados por usuários. Medir erros, abstenções, calibração, tempo completo e custo.
2. **Aprimorar orientação:** revisar as divergências, ampliar casos e usar o retorno voluntário para medir aceitação. Os registros não incluem os pedidos; não formam automaticamente um dataset de treinamento.
3. **Escolha de modelos:** recomendar apenas entre modelos habilitados, respeitando finalidade, capacidades e orçamento. Comparar custo total e qualidade, incluindo o custo e a latência do classificador.
4. **Contexto e revisão:** ordenar arquivos candidatos e hipóteses de diagnóstico. O agente verifica as sugestões e conserva acesso ao restante do contexto. Conclusão das missões continua baseada em evidência e revisão.

Critérios iniciais: tipos e respostas inválidas rejeitados; escolha manual preservada; falhas sem bloquear tarefas; nenhuma alteração nas autorizações; roteamento medido em 150–300 casos sintéticos em português; erros por categoria, calibração, latência p50/p95 e custo por tarefa documentados. Definir os limiares de abstenção com esse conjunto, evitando um valor universal tratado como certeza.

A recomendação é condicional: promover o piloto somente se ele ajudar mais que as regras locais, sem piorar de forma relevante o tempo e o custo da tarefa. Fine-tuning fica para depois de reunir exemplos revisados e constatar uma necessidade concreta.
