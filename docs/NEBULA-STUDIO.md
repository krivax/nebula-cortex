# Nebula Studio — criação e edição

> **Suspenso em 08/10/2026.** Design, Áudio e Vídeo foram retirados do aplicativo por solicitação do usuário. Este documento mantém o registro do protótipo e das ideias anteriores; não descreve funcionalidades disponíveis na versão atual. Projetos e mídias já salvos não são apagados pela retirada. Uma retomada depende de nova definição com o usuário.

O Studio reúne Design, Música e Vídeo dentro do Nebula. Os editores e documentos são código próprio, sem forks de editores criativos. MiMo e Code-OSS continuam creditados na base anterior do aplicativo.

## Abrir, salvar e desfazer

Abra uma pasta e clique no ícone Studio à direita. Sem pasta, o aplicativo usa seu workspace pessoal. As áreas compartilham `.nebula-studio/project.json`; mídias ficam em `.nebula-studio/assets`. Projetos da primeira versão migram páginas e biblioteca musical automaticamente.

O autosave usa uma pausa de 700 ms e substituição atômica. Salvar grava imediatamente. Desfazer/Refazer conserva até 50 passos durante a sessão; reiniciar recupera o documento salvo, mas ainda não o histórico. Mudanças externas bloqueiam gravação para preservar a edição do disco. O aplicativo avisa ao fechar com alterações ou criação em andamento. Fila persistente, mesclagem visual e recuperação de resultados remotos ainda estão pendentes.

## Design por instrução

1. Em Configurações de IA, marque a capacidade **Design e layouts** no modelo de texto escolhido e atribua-o à finalidade correspondente. É necessário um endpoint chat completions compatível. Ollama local pode funcionar sem chave remota; provedores remotos precisam de chave.
2. Escolha Wireframe, Layout de site, Apresentação, Logomarca ou Peça visual e descreva seu pedido.
3. Gere uma composição e revise as páginas da proposta. **Aplicar proposta** substitui o Design atual; Desfazer recupera o anterior. Descartar mantém o documento.
4. Selecione camadas no canvas ou na lista. Use Shift + clique para selecionar várias. Escreva uma alteração e clique em **Alterar camadas selecionadas**. A proposta só pode modificar esses IDs; as demais camadas são preservadas. Proposta antiga não é aplicada se o documento mudou.

O pedido e o Design atual são enviados ao modelo escolhido. O resultado é validado como documento de páginas, retângulos, elipses e textos. São permitidas até 20 páginas e 400 objetos. Camadas têm nome, visibilidade e bloqueio; posição, dimensão, cor e texto podem ser editados no inspetor. Camadas travadas não são movidas nem enviadas como alvos de alteração.

SVG e PNG exportam a página selecionada; **PPTX editável** exporta todas as páginas com formas e textos próprios do PowerPoint. **HTML visual** exporta uma composição estática com SVGs, sem scripts. Esse HTML ainda não é um site responsivo implementável. A ferramenta ainda não gera/edita raster, importa imagens, agrupa camadas ou oferece máscara e alças de transformação. Logo é uma composição geométrica/textual; criação de marca precisa de revisão humana. A qualidade da composição depende do modelo conectado.

## Música por API configurável

Em Configurações de IA, adicione o provedor **MiniMax**, cadastre sua chave e um modelo **music-3.0** ou **music-2.6** (incluindo variantes **-free**). Marque a capacidade **Músicas** e atribua esse modelo à finalidade Músicas. O endpoint do provedor é configurável; contratos de outros fornecedores precisarão de adaptadores próprios.

Informe título, estilo/ideia e, se desejar, sua letra. Deixe a letra vazia para o modelo criá-la ou marque **Instrumental, sem voz**. Clique em Gerar música. O Nebula envia uma chamada real à API configurada, aguarda o resultado e salva o MP3 na biblioteca do projeto. Os cartões permitem ouvir, exportar MP3, reutilizar o briefing e remover da biblioteca. Remover não apaga o arquivo de mídia; limpeza de assets não utilizados ainda será implementada.

Limites: 2.000 caracteres no briefing, 3.500 na letra enviada, até 32 músicas, MP3 de até 24 MB e duração informada de até 30 minutos. A biblioteca conserva modelo, título, briefing, letra enviada e duração. Letra automática não é recebida como texto editável neste primeiro adaptador. O provedor pode cobrar; o custo depende de sua conta/modelo. Cancelar encerra a espera local, mas não garante cancelamento do job/cobrança remotos. Uma resposta recusada por conflito externo ainda não possui recuperação automática. Não repetir geração sem verificar o provedor.

Música gerada é uma faixa completa. Ainda não há separação de voz/instrumentos, edição por seções ou stems. **Laboratório de instrumentos** fica recolhido abaixo da biblioteca: contém osciladores próprios, exemplo de baixo/melodia/bumbo, ganho/mute e exportação WAV PCM estéreo. É uma prova técnica local, diferente da geração musical. Limites do laboratório: 16 faixas, 128 notas/faixa, 30 segundos.

## Vídeo — protótipo manual atual

Importar vídeo copia MP4/MOV/WebM/MKV, conserva o original e cria corte de até 5 segundos. Ajuste entrada/duração, remova ou reordene cortes. O monitor mostra a mídia do corte selecionado; ao terminar o corte, a prévia pausa na próxima posição. Texto é sobreposto no rodapé.

MP4 atual exporta cortes com escala/letterbox e texto, **sem áudio**, a 640 × 360/30 fps, MPEG-4 Part 2. Limites: arquivos de até 512 MB, 32 mídias, 16 cortes, 30 segundos/corte e 60 segundos/sequência. A prévia depende dos codecs do Electron. Ainda faltam geração de vídeo por IA e timeline com áudio/vídeo/texto independentes; são as próximas entregas, não recursos concluídos.

Importação/exportação de vídeo exige FFmpeg e ffprobe instalados. São procurados nos locais usuais do macOS e no PATH nas plataformas. Nenhum runtime de mídia é baixado automaticamente ou incluído nesta entrega. Exportação escolhe um arquivo fora da pasta interna; o diálogo nativo confirma substituições. Cancelar interrompe o FFmpeg e remove temporários.

## Verificação e próximas entregas

Contratos de Design e música são testados contra servidor local com respostas sintéticas, sem chamadas pagas. Testes conferem escopo das camadas, documentos inválidos, migração, payload musical, tamanho da resposta, cancelamento, persistência e conflitos. PPTX foi lido, regravado e conferido com python-pptx, com ZIP/XML íntegros e elementos editáveis. Testes anteriores continuam cobrindo síntese, SVG/WAV, FFmpeg real, importação, histórico e editor. Avaliar qualidade musical/visual com modelos comerciais requer sua configuração e exemplos reais; validação de contrato não demonstra essa qualidade.

O [plano atualizado](PLANO-NEBULA-STUDIO.md) prioriza geração real e resultados editáveis. Seguem vídeo por IA, timeline audiovisual, raster em camadas e stems. O Studio continua experimental e exige homologação nativa própria em Windows/Linux.
