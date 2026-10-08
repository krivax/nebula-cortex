# Publicar o Nebula Cortex

Estado de 07/10/2026: código **v0.1 experimental**, com validação local em macOS ARM64 e Linux ARM64. Windows x64 nativo e Linux x64 possuem pipeline de build/testes, ainda pendente de execução. Consulte [MULTIPLATAFORMA.md](MULTIPLATAFORMA.md). Ainda não é uma distribuição final assinada/notarizada.

## O que está disponível

Assistente com conversas persistentes, agentes por finalidade, modelos configuráveis, autorizações de ferramentas, MCP remoto/local, navegador isolado, Editor Nebula com árvore de arquivos, temas claro/escuro/sistema e missões com criação, edição, remoção e revisão de diferenças. Consulte os documentos de cada integração para seus limites.

Geração de imagem/vídeo, instalador de plugins/skills do assistente, checkpoints recuperáveis, controle visual de outros aplicativos e distribuição assinada continuam em [PROXIMAS-ENTREGAS.md](PROXIMAS-ENTREGAS.md). Esses recursos não devem aparecer como concluídos na apresentação do repositório.

## Validar a cópia local

Na raiz do projeto, execute:

```sh
npm ci
npm run check
npm run check:publication
npm run desktop:fork:test
npm run desktop:fork:integration
```

As duas últimas verificações exigem os runtimes preparados por `npm run desktop:fork:prepare`, na plataforma de destino. As APIs dos testes são sintéticas e locais. `npm run check` gera o sidecar antes dos testes, evitando depender de um bundle de uma execução anterior.

`check:publication` verifica o checksum do patch desktop, arquivos de procedência/licença, artefatos locais incluídos no Git, arquivos grandes e alguns padrões de credenciais. Ele verifica arquivos adicionados ao índice e arquivos novos não ignorados, sem imprimir possíveis segredos. A varredura não comprova ausência de dados privados em imagens ou em formatos não reconhecidos.

O `.gitignore` exclui runtimes, dependências, builds, perfis de teste, logs, arquivos `.env` e configuração local. Envie `integrations/mimo-desktop/nebula.patch` e `upstream.json`: eles recompõem o fork desktop na máquina de quem clonar. Não use `git add -f` para incluir `.desktop-fork` ou `.desktop-runtime`.

## Criar o primeiro commit e enviar

O repositório raiz ainda não tem commits nem remote. O fork interno tem seu próprio histórico e um remote `upstream` da Xiaomi. Execute os comandos **na raiz do Nebula**, não dentro de `.desktop-fork`.

Crie um repositório vazio na sua conta GitHub. Depois:

```sh
git add .
npm run check:publication
git diff --cached --stat
git commit -m "Initial Nebula Cortex experimental release"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Substitua a URL pela do seu repositório. Revise o conteúdo que será público antes do commit. Uma tag `v0.1.0` pode ser criada depois do envio; os binários locais não devem entrar no commit do código.

## Licenças e procedência

Os avisos do MiMo Code, Code-OSS/code-server e da referência `grill-me` permanecem em seus diretórios. As versões e checksums estão nos manifestos; veja [MIMO-DESKTOP-FORK.md](MIMO-DESKTOP-FORK.md) e `editor/third-party/NOTICE.md`. O projeto não se apresenta como produto oficial Xiaomi, Microsoft ou Cursor.

Não há um arquivo `LICENSE` na raiz para o código próprio do Nebula. A escolha dessa licença pertence ao autor e deve ser definida antes de anunciar o código próprio como licenciado para reutilização. As licenças e políticas dos componentes externos não foram substituídas.
