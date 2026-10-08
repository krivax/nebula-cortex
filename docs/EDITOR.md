# Editor integrado

**Editor nativo atual:** workbench real Code-OSS via code-server, com explorador em árvore, terminal e extensões. Preparação, arquitetura e verificações em [EDITOR-CODE-OSS.md](EDITOR-CODE-OSS.md).

## Prévia Monaco e implementação anterior

O restante deste documento registra o editor Monaco do navegador e seu broker nativo anterior. Os limites abaixo não se aplicam ao workbench Code-OSS, que opera como uma IDE manual com os privilégios do usuário.

Entrega: 30/09/2026. A interface reproduz a organização de trabalho do VS Code, usando Monaco. Não incorpora o workbench completo, sistema de extensões, depurador ou terminal do VS Code.

## Funcionalidades implementadas

- Barra de atividades para explorador, pesquisa, comparação e configurações.
- Árvore com pastas expansíveis, ícones por tipo, ordenação de pastas antes de arquivos e realce da seleção.
- Abertura de pasta pelo seletor, mantendo caminhos relativos e distinguindo arquivos com o mesmo nome.
- Abas: clique simples abre pré-visualização; duplo clique ou edição fixa a aba. Fechar uma aba mantém o conteúdo do modelo disponível no explorador.
- Navegação da árvore com setas, Home, End, Enter e busca pela primeira letra.
- Abas navegáveis por setas, Home, End e Ctrl/Cmd+Tab.
- Seção de editores abertos, breadcrumbs, minimapa e estado de linha/coluna.
- Busca textual nos arquivos carregados e salto para a linha do resultado.
- Localização rápida de arquivos por nome/caminho e paleta de comandos implementados.
- Criação de arquivo ou pasta, inclusive caminhos aninhados, em memória.
- Barra lateral redimensionável; minimapa e quebra de linha configuráveis.
- Comparação com o conteúdo original e download de uma cópia editada.
- No desktop macOS: abertura nativa de projeto, leitura e salvamento de arquivos existentes, detecção de conflitos e comparação com a versão do disco.

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl/Cmd+S | Salvar arquivo existente do projeto no desktop |
| Ctrl/Cmd+P | Localizar arquivo |
| Ctrl/Cmd+Shift+P | Comandos do editor |
| Ctrl/Cmd+B | Alternar barra lateral |
| Ctrl/Cmd+W | Fechar aba ativa dentro do editor |
| Ctrl/Cmd+Tab | Próxima aba |
| Ctrl/Cmd+Shift+Tab | Aba anterior |

Os atalhos dependem de o navegador/WebView entregar a combinação ao aplicativo; atalhos reservados pelo sistema podem prevalecer. A árvore e os botões também permitem usar os recursos sem esses atalhos.

## Arquivos e persistência

No navegador, o seletor importa cópias de arquivos de texto para memória. Até 300 arquivos e 15 MB por importação, com limite de 1 MB por arquivo. Dependências, metadados Git, builds e formatos binários conhecidos são ignorados. Essa importação não inclui diretórios vazios. “Baixar cópia” não grava sobre o original nem marca o arquivo como salvo.

No desktop macOS, o seletor autoriza uma pasta no backend Rust, identificada por um token da janela. A árvore inclui diretórios vazios. A leitura aceita texto UTF-8, até 300 entradas (arquivos e pastas), 1 MB por arquivo, 15 MB no total, profundidade de 20 e até 5.000 entradas examinadas. Links simbólicos são ignorados na listagem. Caminhos absolutos, travessia e acessos fora da pasta são recusados. Até oito projetos podem permanecer autorizados por janela; os arquivos novos do editor continuam em memória. Não há transmissão para APIs ou execução de código ao abrir/salvar.

O salvamento de arquivos existentes compara o hash do conteúdo no disco com a revisão lida. A escrita usa arquivo temporário no mesmo diretório e substituição atômica, preservando permissões. Texto com BOM e finais de linha é preservado pelo modelo. Metadados estendidos/ACLs ainda não têm preservação homologada.

Em conflito, nenhum conteúdo é sobrescrito automaticamente: a edição fica no editor e a versão do disco aparece na comparação. É possível ajustar a edição à direita e clicar “Salvar versão editada”, que verifica novamente a revisão exibida do disco. Se outro programa mudar o arquivo depois da comparação, o conflito reaparece. Também é possível baixar a edição local. Há uma pequena janela entre a última verificação e a substituição atômica: ainda não há garantia de compare-and-swap contra escritores externos simultâneos.

Modelos, edições, abas e cursor sobrevivem à alternância entre conversa e editor enquanto a janela está aberta. Recarregar ou encerrar perde os buffers não salvos e as autorizações. Não há observador de arquivos ou recuperação automática de buffers nesta entrega.

## Verificação macOS

Aplicativo `.app` de desenvolvimento compilado e aberto com frontend embutido (`tauri://localhost`). Pasta descartável `/private/tmp/nebula-native-project`: árvore, leitura, edição, Cmd+S, conteúdo gravado no disco, alteração externa preservada e comparação lado a lado verificados pela interface e por leitura independente do arquivo. Resolução explícita verificada: uma segunda alteração externa ocorrida após a comparação foi recusada; a versão revisada foi gravada somente usando a revisão atual. Diretório vazio confirmado na árvore. Testes do backend cobrem caminhos inválidos, autorização, symlinks, versões desatualizadas, limites, limpeza de temporários e permissões. Capturas: `docs/native-editor-preview.png` e `docs/native-editor-conflict.png`.

## Referências da implementação

- [Interface e pré-visualização de abas do VS Code](https://code.visualstudio.com/docs/editing/getting-started/userinterface).
- [Seleção de diretórios e caminhos relativos](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory).
- [Integração ESM do Monaco](https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md).
