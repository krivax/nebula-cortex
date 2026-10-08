# Nebula no macOS, Linux e Windows

O Windows usa um aplicativo **nativo `.exe`**, com Electron, motor MiMo oficial para Windows e Editor Nebula compilado do Code-OSS. Não depende de WSL. O editor no macOS e Linux usa code-server, que também deriva do Code-OSS. Créditos: [Xiaomi MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code), [Microsoft VS Code / Code-OSS](https://github.com/microsoft/vscode) e [Coder code-server](https://github.com/coder/code-server). Licenças e avisos são preservados nos runtimes e no pacote.

## Estado da validação

| Plataforma | Implementação e evidência em 07/10/2026 |
| --- | --- |
| macOS ARM64 | Runtimes, testes unitários, integração real do motor/editor/MCP e empacotamento verificados localmente. |
| Linux ARM64, glibc | Preparação, tipos, 55 testes do fork, integração real do motor/editor/MCP e empacotamento verificados em Debian 12 ARM64 isolado. A verificação em container não substitui testes de instalação em distribuições e ambientes gráficos diferentes. |
| Linux x64, glibc | Runtimes oficiais e scripts preparados; compilação, integração e pacote configurados no runner Ubuntu 24.04 do GitHub Actions. Execução desse runner ainda pendente. |
| Windows x64 | Backend nativo Code-OSS, executáveis `.exe`, caminhos Windows e encerramento da árvore de processos implementados. Compilação e integração configuradas no runner Windows Server 2022. Ainda não executadas em Windows; não é uma homologação concluída. |

Windows ARM64, macOS Intel e Linux musl/Alpine não são alvos desta entrega. Os pacotes gerados são de desenvolvimento, sem assinatura, notarização ou instalador. Distribua a pasta completa, não apenas o executável.

## Preparar pelo código-fonte

Em todas as plataformas: Node.js 20.19+ (o CI usa 24.21.0), npm e Git no PATH. Internet e vários GB livres são necessários. O script baixa Node, Bun e MiMo oficiais com checksums fixados. As revisões do fork e do editor ficam nos manifestos em `integrations` e `editor`.

```sh
npm ci
npm run desktop:fork:prepare
npm run desktop:dev
```

### Windows x64

Instale Python 3 e Visual Studio 2022 ou Build Tools com **Desktop development with C++**, MSVC x64 e Windows SDK. Execute a preparação no Developer PowerShell x64, com ferramentas do SDK como `signtool` no PATH. Evite um caminho muito longo para o checkout.

A primeira preparação compila `vscode-reh-web-win32-x64` a partir da revisão Microsoft fixada em `editor/upstream.json`, com identidade Editor Nebula e catálogo Open VSX. Esse build é mais demorado que a instalação nos outros sistemas. Não utiliza o servidor proprietário distribuído pela Microsoft.

O editor se comunica por loopback, token aleatório e cookie em uma sessão isolada. As credenciais usam o armazenamento seguro do Windows via Electron. O motor usa `mimo.exe`; Node e Bun também usam seus executáveis Windows. O encerramento usa `taskkill /T /F` para alcançar subprocessos do motor/editor.

### Linux x64/ARM64

Use uma distribuição com glibc, sessão gráfica e serviço de chaveiro Secret Service/KWallet disponível. O Nebula não grava chaves de API em texto simples quando o armazenamento seguro está indisponível.

No Ubuntu 24.04, as dependências de compilação e desktop podem ser instaladas com:

```sh
sudo apt-get update
sudo apt-get install -y build-essential python3 libgtk-3-0 libnss3 libasound2t64 libgbm1 libsecret-1-0
```

No Debian 12, use `libasound2` no lugar de `libasound2t64`. Instale/ative o chaveiro da sua sessão. Para testes automatizados sem interface física, o workflow acrescenta Xvfb, D-Bus e GNOME Keyring. A opção de desativar sandbox presente no harness é exclusiva dos testes isolados; não é configuração do aplicativo normal.

## Testar e gerar o aplicativo

```sh
npm run check
npm run check:publication
npm run desktop:fork:test
npm run desktop:fork:integration
npm run desktop:fork:app
npm run desktop:fork:archive
```

A integração usa APIs locais sintéticas, credenciais de teste e perfil próprio. No Linux precisa de display e armazenamento seguro disponíveis. Não testa modelos remotos pagos.

Os arquivos ficam em `.desktop-fork/packages/desktop/dist/`:

| Plataforma | Aplicativo | Arquivo de distribuição |
| --- | --- | --- |
| macOS ARM64 | `mac-arm64/Nebula Cortex.app` | `nebula-darwin-arm64.tar.gz` |
| Linux ARM64 | `linux-arm64-unpacked/nebula-cortex` | `nebula-linux-arm64.tar.gz` |
| Linux x64 | `linux-unpacked/nebula-cortex` | `nebula-linux-x64.tar.gz` |
| Windows x64 | `win-unpacked/Nebula Cortex.exe` | `nebula-win32-x64.zip` |

O arquivo contém a pasta completa e os runtimes; o TAR preserva permissões e links no Linux/macOS. O Windows recebe uma pasta portátil, ainda sem instalador `.msi`/NSIS.

## Validação no GitHub

O workflow `.github/workflows/desktop.yml` executa preparação, testes, integração e empacotamento nos três sistemas. Só disponibiliza o arquivo como artifact após todos os passos passarem. Pode ser executado manualmente pela aba Actions e também roda em PRs e pushes nas branches configuradas. Não publica Releases nem faz upload dos perfis e credenciais.

Antes de anunciar suporte completo a Windows e Linux x64, execute esse workflow no repositório publicado, confira os resultados e abra os pacotes nas máquinas de destino. Este checkout ainda não possui um remoto GitHub para disparar a validação Windows.
