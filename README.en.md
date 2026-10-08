# Nebula Cortex

[Português](README.md) · **English** · [Español](README.es.md)

Nebula Cortex is a desktop assistant for software development and working with AI agents, projects, files, and an integrated browser. It brings chat, the **Nebula Editor**, tools authorized by the user, and configurable models into one application.

**Current status: experimental v0.1.** macOS ARM64 and Linux ARM64 have local verification; native builds and tests for Linux x64 and Windows x64 are configured in GitHub Actions and still await execution. Windows uses a native `.exe` application without WSL. Development packages are unsigned/unnotarized.

## How it works

1. **Open a project.** Select a folder in the interface to work with its files and conversations. Without a selected project, the assistant uses a private application workspace.
2. **Configure AI.** Register providers and models in **AI Settings**. You can use different models for development, writing, research, and image analysis, or reuse a model with multiple capabilities.
3. **Choose an agent or use the coordinator.** The Nebula Coordinator organizes the work and can call specialists. Agents have their own instructions, tools, and models for their areas.
4. **Send a task.** Review your request and send it through chat. Conversations retain their history, stream responses, and let you follow tools, questions, approvals, and results.
5. **Work in the editor and review.** Open the Nebula Editor, edit files, send context to the assistant, and inspect recorded changes before confirming a mission's completion.

Preparing a mission or placing editor context in a draft does not start an AI request. Submission is manual. Tools that require authorization wait for your approval; approved commands and manual editor actions run with your user privileges.

## Credits to the original projects

Nebula was developed from a **fork of Xiaomi MiMo Code** and an editor based on the **open-source VS Code codebase (Code-OSS)**. On macOS and Linux, the editor is integrated through **code-server**, maintained by Coder; on Windows, the Code-OSS backend is built from Microsoft's repository for native execution.

| Project | Credit and role in Nebula |
| --- | --- |
| [Xiaomi MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) | Xiaomi Corporation and contributors: the assistant, engine, and historical desktop foundation used by the fork. |
| [VS Code / Code-OSS](https://github.com/microsoft/vscode) | Microsoft and contributors: the Nebula Editor foundation, including the file tree, editing, Git, terminal, and extensions. |
| [code-server](https://github.com/coder/code-server) | Coder and contributors: the Code-OSS adaptation used by the integrated editor on macOS and Linux. |

We thank the authors and communities behind these projects. The Nebula name and adaptations do not replace the original components' credits, copyrights, licenses, or notices, which remain preserved. Nebula is an independent project.

## Available features

| Area | What you can do |
| --- | --- |
| Assistant | Create and resume conversations, follow streaming, cancel tasks, and browse history. |
| Nebula Editor | Use the integrated Code-OSS workbench with a file tree, tabs, search, Git, terminal, and extensions. |
| Agents | Select specialists for development, configuration, browser, computer, writing, research, and visual analysis. |
| Models and providers | Configure OpenRouter, Hugging Face, Ollama, Xiaomi, and OpenAI-compatible endpoints; assign models by purpose and agent. |
| Missions | Add missions, edit objectives, remove records, resume conversations, and review plans, tools, and file changes. |
| Browser and MCP | Use an isolated browser and connect remote or local stdio MCP servers, choosing which agents have access. |
| Artifacts | Browse actual project files and text previews. |
| Appearance | Choose light, dark, or system appearance, which is the initial default. |
| Nebula Reflex | Receive an agent suggestion and an essential clarifying question to guide the task, applied manually. |

Visual analysis requires a vision-compatible model. The computer operator provides environment inspection, project files, and a supervised terminal; general visual control of other applications is still pending.

### Editor and missions

In the Nebula Editor, select a snippet or use the active file and choose **Explain code**, **Fix code**, or **Create tests**. The assistant receives a draft containing the file, language, lines, content, and diagnostics. Explanations use a read-only agent; fixes and tests require saving the file before preparing the request.

In **Missions**, prepare an objective, edit it with the pencil icon, and remove it with the trash icon. Removing a record preserves conversations and files; an ongoing execution continues in its conversation. Editing an already submitted mission changes the saved objective, while new instructions to the agent must be sent in chat. Completion is confirmed by the user after review, rather than automatically certified by the model.

## Run the desktop

Requirements: **Node.js 20.19+**, **npm**, and **Git**. Prepared platforms: **macOS ARM64**, **Linux x64/ARM64 with glibc**, and **native Windows x64**. Linux requires build tools, desktop libraries and a keyring service. Initial Windows preparation builds Code-OSS and requires Python 3 and Visual Studio 2022 C++ Build Tools/Windows SDK. See [platform requirements and validation status](docs/MULTIPLATAFORMA.md). Initial preparation requires internet access and several GB of free disk space.

From the repository root:

```sh
npm ci
npm run desktop:fork:prepare
npm run desktop:dev
```

The preparation script retrieves pinned revisions, verifies configured checksums, applies the Nebula patch, and prepares local runtimes. `npm run dev` also starts the main desktop.

To build the application:

```sh
npm run desktop:fork:app
```

The application path depends on the platform:

| System | Application under `.desktop-fork/packages/desktop/dist/` |
| --- | --- |
| macOS ARM64 | `mac-arm64/Nebula Cortex.app` |
| Linux ARM64 | `linux-arm64-unpacked/nebula-cortex` |
| Linux x64 | `linux-unpacked/nebula-cortex` |
| Windows x64 | `win-unpacked/Nebula Cortex.exe` |

Keep the entire folder alongside the executable. `npm run desktop:fork:archive` creates the development distribution archive.

In **AI Settings**, enter the endpoint, models, their capabilities, and the provider key when required. Remote providers may charge for usage according to their pricing. Local loopback Ollama does not require a key. Configured capabilities must match those of the model and API; choosing a provider does not guarantee that all its models are compatible.

The desktop saves keys using the operating system's secure storage through Electron `safeStorage`. Runtimes, local profiles, dependencies, and builds are ignored by Git. Do not include credentials or personal data in commits, issues, or PRs.

## Check changes

```sh
npm run check
npm run check:publication
npm run desktop:fork:test
npm run desktop:fork:integration
```

Fork tests require the preparation step on the target platform. Integration uses the actual engine with synthetic local APIs, without calling paid providers. The publication check inspects patch integrity, third-party notices, local artifacts, file sizes, and some credential patterns; it does not replace reviewing the content you will publish.

## Still in development

- Actual image and video generation: models can be configured, but generation workflows are not implemented yet.
- An installer for assistant plugins and skills. MCP connections and editor extensions already have their own mechanisms.
- Recoverable checkpoints and file restoration with conflict checking.
- General visual control of other applications, broader Reflex evaluation, and signed distribution.

See the [upcoming delivery plan](docs/PROXIMAS-ENTREGAS.md).

## Contributing

**Anyone who wants to contribute to Nebula is welcome!** You can suggest improvements, report issues, improve documentation and translations, or submit code.

To contribute code, fork the repository, create a branch, implement a clearly scoped change, and open a **Pull Request (PR)**. Explain the problem, your solution, and how you verified the result. Include relevant tests and screenshots when your change affects the interface. For substantial changes, open an issue first to align on the proposal.

**All PRs will be reviewed by the project maintainers before acceptance.** Reviews consider functionality, security, quality, compatibility, and alignment with the project. Opening a PR does not guarantee approval; changes may be requested before merging. When editing these READMEs, keep all three versions consistent.

Desktop adaptations are distributed in `integrations/mimo-desktop/nebula.patch`, with a manifest in `upstream.json`. If you change the local fork, update the patch and its checksum alongside the code so the change can be reproduced. Do not commit runtime directories or the `.desktop-fork` checkout to the root repository.

## Architecture, origins, and documentation

The main desktop combines a historical fork of the official **Xiaomi MiMo Code** repository, the Electron/Solid interface, the MiMo engine, and the **Code-OSS/code-server** editor, with Nebula's own integrations and identity. This project is not an official Xiaomi, Microsoft, or Cursor product, nor a complete copy of the current commercial MiMo Desktop interface.

The earlier React/Tauri code remains in `apps/desktop`. `npm run dev:legacy` starts the browser preview with simulated responses and an in-memory Monaco editor; that preview is separate from the main desktop.

- [Desktop, provenance, and reproduction](docs/MIMO-DESKTOP-FORK.md)
- [Agents and tools](docs/AGENTES-NEBULA.md)
- [Missions and editor context](docs/MISSOES-NEBULA.md)
- [MCP connections](docs/CONEXOES-MCP-NEBULA.md)
- [Nebula Reflex](docs/NEBULA-REFLEX.md)
- [Code-OSS editor](docs/EDITOR-CODE-OSS.md)
- [Appearance](docs/APARENCIA-NEBULA.md)
- [Publishing to GitHub](docs/PUBLICACAO-GITHUB.md)
- [Development log](DESENVOLVIMENTO.md)

Additional technical documentation is currently in Portuguese. External component notices and licenses are preserved in `integrations` and `editor/third-party`. A license for Nebula's own code has not yet been defined in a root `LICENSE` file.

Interface labels quoted above are translated for this guide; the current desktop interface is primarily in Portuguese.
