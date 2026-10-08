# Componentes do editor Nebula

- Code-OSS, Microsoft Corporation, MIT. `CodeOSS-LICENSE.txt` obtido de https://github.com/microsoft/vscode/blob/main/LICENSE.txt em 30/09/2026.
- code-server 4.139.1, Coder Technologies Inc., MIT. `code-server-LICENSE.txt` copiado da distribuição npm oficial; avisos preservados em `server/node_modules/code-server/ThirdPartyNotices.txt`.
- Node.js 24.21.0: a licença da distribuição oficial, incluindo avisos de terceiros, é copiada para `node/LICENSE` no runtime.

Versões e patches em `editor/upstream.json` e `editor/dependency-patches.json`. Licenças individuais das dependências são preservadas junto aos pacotes.

No Windows, o backend Code-OSS é compilado diretamente da revisão Microsoft fixada em `editor/upstream.json`. `LICENSE.txt` e `ThirdPartyNotices.txt` dessa revisão são copiados para `server/` no runtime e incluídos no pacote. O backend code-server é usado somente no macOS/Linux.
