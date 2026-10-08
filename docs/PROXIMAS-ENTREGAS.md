# Próximas entregas do Nebula

Prioridades propostas em 06/10/2026 a partir da implementação atual. Esta lista define próximos incrementos, não funcionalidades já entregues.

Atualização de 08/10/2026: Design, Áudio e Vídeo do Nebula Studio foram retirados do aplicativo por solicitação do usuário. O plano criativo está suspenso, sem próximas etapas automáticas. O foco atual é o assistente, agentes, missões, Editor Nebula, navegador e configurações. Os documentos do Studio ficam apenas como registro histórico; projetos e mídias já salvos são preservados.

## 1. Checkpoints e recuperação das missões

O painel já reúne conversa, plano registrado, especialistas, ferramentas, arquivos e revisão. A próxima evolução é guardar checkpoints de alterações ligados à missão, permitir comparar o antes/depois e retomar uma execução interrompida com indicação do que foi realmente concluído.

Primeiro incremento entregue em 06/10: revisão das diferenças registradas pelo motor, com numeração de linhas, contagens, arquivos expansíveis e abertura do projeto no editor. A navegação de missões usa uma lista com rolagem própria. A captura de checkpoints recuperáveis e a restauração com verificação de conflitos continuam pendentes.

Critério de entrega: uma alteração de arquivo autorizada tem um estado anterior recuperável, comparação visível e restauração solicitada pelo usuário. A restauração detecta edições posteriores e pede resolução do conflito, sem sobrescrever trabalho mais recente. Operações externas, como publicar ou enviar uma mensagem, não são apresentadas como reversíveis por um checkpoint de arquivos.

## 2. Criação real de imagens

Os modelos de imagem e vídeo podem ser configurados, mas o fluxo de geração ainda não está implementado. Começar por imagens: usar o modelo atribuído a essa finalidade, exibir a solicitação, acompanhar a geração e salvar o resultado como artefato ligado ao projeto/conversa.

Critério de entrega: uma API compatível gera uma imagem real, erros são apresentados, o artefato pode ser aberto e reutilizado, e limites/tamanho/uso informado são registrados. Testes usam um serviço sintético; a validação com uma conta real é separada. Comparar os contratos oficiais dos provedores antes de escolher o primeiro adaptador. Vídeo vem depois desse fluxo estabilizado.

## 3. Instalador de plugins e skills

MCP remoto e programas MCP locais já podem ser configurados com acesso por agente. Ainda falta instalar e gerenciar plugins/skills do assistente pela interface. O Editor Nebula já tem seu próprio mecanismo de extensões; não tratar uma extensão do editor como plugin do assistente automaticamente.

Critério de entrega: origem e versão identificadas, dependências e acessos apresentados antes da ativação, instalação/desativação/remoção verificadas e diagnóstico de incompatibilidade. Começar com um catálogo pequeno e verificável. Não executar automaticamente scripts arbitrários encontrados em um pacote.

## Depois desses incrementos

- Controle visual de outros aplicativos do computador, com evidências de tela e acesso explícito do sistema operacional. O operador atual oferece navegador isolado, ambiente, arquivos do projeto e terminal supervisionado.
- Avaliação independente do Reflex com pedidos revisados por usuários; comparação do Clef real apenas com provedor configurado e custo conhecido.
- Empacotamento assinado e atualização com migração/recuperação verificadas.

O layout do chat foi consolidado antes desses incrementos: barra única de agente, modelo e autorização, ícones acessíveis, seleção identificada e controles que cabem com o painel de revisão aberto. O menu de agentes tem descrições, rolagem, navegação por teclado e fecha após selecionar uma opção. A indicação de autorização é informativa; não muda os acessos do executor.
