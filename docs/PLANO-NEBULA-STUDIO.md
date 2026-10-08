# Plano de desenvolvimento — Nebula Studio

> **Suspenso em 08/10/2026.** Design, Áudio e Vídeo foram retirados do aplicativo por solicitação do usuário. Este documento mantém o registro do protótipo e das ideias anteriores; não descreve funcionalidades disponíveis na versão atual. Projetos e mídias já salvos não são apagados pela retirada. Uma retomada depende de nova definição com o usuário.

Atualizado em 07/10/2026 após a correção de direção do produto. O fluxo principal passa a ser **descrever → gerar com IA → revisar → editar partes → exportar**. O laboratório manual anterior é uma prova técnica e não representa a experiência final solicitada.

## Produto e autoria

Design deve permitir wireframes, apresentações, layouts de sites, logomarcas e peças visuais, com camadas selecionáveis e alterações por instrução. A referência é o fluxo do [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs). Música deve oferecer criação por descrição, letra própria/automática, instrumental e biblioteca, tomando o [Suno Studio](https://help.suno.com/en/articles/13670529) como referência de uso. Vídeo deve combinar geração real com timeline de vídeo, áudio e texto independentes, considerando a interação de editores como CapCut.

Os três editores, seus documentos e operações são código próprio do Nebula. Não incorporar forks ou componentes de editores de design, áudio ou vídeo. APIs de modelos, formatos abertos e infraestrutura de mídia podem ser utilizados. A base existente MiMo do desktop e Code-OSS do Editor Nebula mantém sua procedência e créditos.

Referências de produtos definem necessidades de uso, não acesso aos seus modelos proprietários ou promessa de resultados idênticos. A qualidade de geração depende do modelo conectado. Treinar um modelo fundacional de música/vídeo do zero não está no escopo.

## Etapas e critérios de aceite

| Etapa | Entrega | Critério de aceite | Estado |
| --- | --- | --- | --- |
| 0. Fundação própria | Documento, biblioteca local, histórico, autosave, IPC, proteção de credenciais | Salvar/reabrir, desfazer, detectar alterações externas e conservar originais | Implementação inicial; recuperação durável ainda pendente |
| 1. Design por conversa | Pedidos para wireframe/site/slides/logo/peça visual, documento em páginas/camadas, proposta antes de aplicar | JSON validado; modificar só IDs selecionados; preservar o restante; SVG/PNG/HTML e PPTX com formas/textos editáveis | Implementado neste incremento; qualidade visual com modelos reais ainda exige avaliação |
| 2. Música por API | API configurável primeiro, descrição de estilo, letra própria/automática, instrumental, biblioteca, reprodução, MP3 | Contrato real, erros/cancelamento, arquivo persistido, reabertura e exportação | Adaptador MiniMax implementado; testes com respostas sintéticas, sem geração paga |
| 3. Vídeo gerado por IA | Adaptador assíncrono, jobs persistentes, geração texto/imagem→vídeo, biblioteca | Salvar ID antes de polling; retomar sem repetir cobrança; baixar e validar resultado; inserir sem apagar materiais existentes | Próxima entrega |
| 4. Timeline audiovisual | Editor próprio com faixas independentes de vídeo, áudio e texto | Trim/split/deslocamento, ganho/mute, legendas com duração própria; prévia e MP4 com áudio sincronizado | Pendente; protótipo atual só possui cortes e texto, exporta sem áudio |
| 5. Imagens e Design avançado | Geração/edição raster, imagens em camadas, grupos, máscara, zoom, alças, alinhamento, identidade visual, site responsivo e handoff | Seleção delimita edição; imagens reais com origem registrada; HTML implementável e prévia isolada | Pendente; HTML atual é uma composição visual estática |
| 6. Música e stems | Separação real, waveforms, solo/mute, cortes/fades, mixagem, regeneração por seção | Voz/instrumentos em arquivos distintos e alinhados; preservar original; editar só a faixa escolhida | Pendente; MP3 gerado ainda é uma faixa completa |
| 7. Integração e distribuição | Reutilizar identidade/trilha entre Studios, cache, recuperação, runtimes fixados e testes nativos | Produção integrada; falhas/reinício sem perda; macOS, Windows nativo e Linux homologados | Pendente; compatibilidade de código não substitui testes em cada sistema |

A ordem é 0 → 1/2 → 3 → 4 → 5/6 → 7. Recuperação e qualidade acompanham cada entrega. Não adiar a geração real até terminar todos os controles manuais. Recursos sem execução real não aparecem como disponíveis.

## Adaptadores iniciais

- **Design estruturado:** chat completions compatível com OpenAI, usando o modelo atribuído a Design e layouts. O resultado contém páginas, retângulos, elipses e texto; não é imagem achatada. Ollama, OpenRouter e outros podem atender quando o modelo retorna o schema corretamente.
- **Música:** [MiniMax Music API](https://platform.minimax.io/docs/api-reference/music-generation). Endpoint, chave e modelo são configuráveis. Primeiro contrato: Music 3.0/2.6 e variantes free. Outros provedores exigem adaptadores de seus contratos; não presumir que toda API seja compatível com esse endpoint. Não usar proxies não oficiais do Suno.
- **Vídeo planejado:** [API assíncrona de vídeo do OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), com modelo atribuído à finalidade Vídeo. Validar criação, consulta, download, erros, custo e cancelamento antes de disponibilizar.
- **Imagem raster planejada:** adaptador específico de geração/edição de imagens; um modelo de texto não será apresentado como gerador raster.

As chaves continuam no armazenamento seguro do sistema e não entram no renderer, nos documentos criativos nem nos arquivos exportados. O clique de geração inicia o envio ao provedor; não há geração automática ao digitar. Cancelamento local não garante cancelamento da cobrança remota.

## Recuperação e contexto

A fundação atual detecta conflito por revisão/hash, grava atomicamente e mantém até 50 passos durante a sessão. Ainda faltam fila de jobs durável, recuperação de respostas depois de encerramento e mesclagem visual. Se o documento mudar no disco durante a geração musical, a aplicação é recusada para preservar essa edição; recuperar automaticamente o resultado remoto é trabalho prioritário da etapa 3. Não repetir uma chamada paga silenciosamente.

Cada agente deve receber a seleção e o briefing relevantes, usar contexto profissional e perguntar apenas por decisões ausentes que afetem o resultado. As propostas de Design já identificam os IDs modificáveis. Agentes especializados com ferramentas criativas e orquestração entre Studios serão acrescentados sobre os adaptadores reais, sem simular execução.

## Verificação por entrega

Testes cobrem migração, limites, propostas fora do escopo, camadas travadas, conteúdo inválido, endpoints, credenciais, contratos HTTP, arquivos, conflitos e cancelamento. Exportações precisam de leitura por ferramentas independentes. Interface deve ser verificada em perfil sintético, nos temas e em janelas menores. APIs pagas são avaliadas com credenciais fornecidas pelo usuário, separando validação do contrato e avaliação da qualidade gerada.

O Studio permanece experimental até a execução nativa em Windows/Linux, distribuição do runtime de mídia e recuperação durável. Consulte [uso e limites atuais](NEBULA-STUDIO.md).
