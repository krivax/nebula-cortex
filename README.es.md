# Nebula Cortex

[Português](README.md) · [English](README.en.md) · **Español**

Nebula Cortex es un asistente de escritorio para desarrollar software y trabajar con agentes de IA, proyectos, archivos y un navegador integrado. Reúne un área de conversación, el **Editor Nebula**, herramientas autorizadas por el usuario y modelos configurables en una sola aplicación.

**Estado actual: v0.1 experimental.** macOS ARM64 y Linux ARM64 cuentan con verificaciones locales; las compilaciones y pruebas nativas de Linux x64 y Windows x64 están configuradas en GitHub Actions y todavía deben ejecutarse. Windows utiliza una aplicación nativa `.exe`, sin WSL. Los paquetes de desarrollo no tienen firma ni notarización.

## Cómo funciona

1. **Abre un proyecto.** Selecciona una carpeta en la interfaz para trabajar con sus archivos y conversaciones. Sin un proyecto seleccionado, el asistente utiliza un espacio de trabajo privado de la aplicación.
2. **Configura la IA.** Registra proveedores y modelos en **Configuración de IA**. Puedes usar modelos distintos para desarrollo, textos, investigación y análisis de imágenes, o reutilizar un modelo con varias capacidades.
3. **Elige un agente o utiliza el coordinador.** El Coordinador Nebula organiza el trabajo y puede llamar a especialistas. Los agentes tienen instrucciones, herramientas y modelos propios para sus áreas.
4. **Envía una tarea.** Revisa la solicitud y envíala por el chat. La conversación conserva el historial, muestra respuestas en streaming y permite seguir herramientas, preguntas, autorizaciones y resultados.
5. **Trabaja en el editor y revisa.** Abre el Editor Nebula, edita archivos, envía contexto al asistente y comprueba los cambios registrados antes de confirmar la finalización de una misión.

Preparar una misión o colocar contexto del editor en un borrador no inicia una llamada de IA. El envío es manual. Las herramientas que requieren autorización esperan tu aprobación; los comandos aprobados y las acciones manuales del editor se ejecutan con los privilegios del usuario.

## Créditos a los proyectos de origen

Nebula se desarrolló a partir de un **fork de Xiaomi MiMo Code** y de un editor basado en el **código abierto de VS Code (Code-OSS)**. En macOS y Linux, el editor se integra mediante **code-server**, mantenido por Coder; en Windows, el backend Code-OSS se compila desde el repositorio de Microsoft para ejecutarse de forma nativa.

| Proyecto | Crédito y participación en Nebula |
| --- | --- |
| [Xiaomi MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) | Xiaomi Corporation y colaboradores: base del asistente, motor y escritorio histórico utilizado en el fork. |
| [VS Code / Code-OSS](https://github.com/microsoft/vscode) | Microsoft y colaboradores: base del Editor Nebula, incluido el árbol de archivos, edición, Git, terminal y extensiones. |
| [code-server](https://github.com/coder/code-server) | Coder y colaboradores: adaptación de Code-OSS utilizada por el editor integrado en macOS y Linux. |

Agradecemos a los autores y comunidades de estos proyectos. El nombre y las adaptaciones de Nebula no sustituyen los créditos, derechos de autor, licencias ni avisos de los componentes originales, que se conservan. Nebula es un proyecto independiente.

## Funciones disponibles

| Área | Qué puedes hacer |
| --- | --- |
| Asistente | Crear y retomar conversaciones, seguir el streaming, cancelar tareas y consultar el historial. |
| Editor Nebula | Usar el entorno Code-OSS integrado, con explorador de archivos en árbol, pestañas, búsqueda, Git, terminal y extensiones. |
| Agentes | Seleccionar especialistas en desarrollo, configuración, navegador, ordenador, textos, investigación y análisis visual. |
| Modelos y proveedores | Configurar OpenRouter, Hugging Face, Ollama, Xiaomi y endpoints compatibles con OpenAI; asignar modelos por finalidad y por agente. |
| Misiones | Añadir misiones, editar objetivos, eliminar registros, retomar conversaciones y revisar planes, herramientas y cambios de archivos. |
| Navegador y MCP | Usar un navegador aislado y conectar servidores MCP remotos o locales mediante stdio, eligiendo qué agentes tienen acceso. |
| Artefactos | Consultar archivos reales del proyecto y vistas previas de texto. |
| Apariencia | Elegir el tema claro, oscuro o del sistema, que es la opción inicial. |
| Nebula Reflex | Recibir una sugerencia de agente y una pregunta esencial para orientar la tarea, aplicada manualmente. |

El análisis visual requiere un modelo compatible con visión. El operador del ordenador ofrece consulta del entorno, archivos del proyecto y un terminal supervisado; el control visual general de otras aplicaciones sigue pendiente.

### Editor y misiones

En el Editor Nebula, selecciona un fragmento o utiliza el archivo activo y elige **Explicar código**, **Corregir código** o **Crear pruebas**. El asistente recibe un borrador con el archivo, lenguaje, líneas, contenido y diagnósticos. Las explicaciones utilizan un agente de lectura; las correcciones y pruebas requieren guardar el archivo antes de preparar la solicitud.

En **Misiones**, prepara un objetivo, edítalo con el lápiz y elimínalo con la papelera. Eliminar el registro conserva las conversaciones y los archivos; una ejecución en curso continúa en la conversación. Editar una misión ya enviada cambia el objetivo guardado, mientras que las nuevas instrucciones al agente deben enviarse por el chat. El usuario confirma la finalización tras revisar el resultado; el modelo no la certifica automáticamente.

## Ejecutar el escritorio

Requisitos: **Node.js 20.19+**, **npm** y **Git**. Plataformas preparadas: **macOS ARM64**, **Linux x64/ARM64 con glibc** y **Windows x64 nativo**. Linux requiere herramientas de compilación, bibliotecas gráficas y un servicio de llavero. La primera preparación en Windows compila Code-OSS y requiere Python 3 y Visual Studio 2022 C++ Build Tools/Windows SDK. Consulte los [requisitos y el estado de validación por plataforma](docs/MULTIPLATAFORMA.md). La preparación inicial necesita internet y varios GB de espacio libre.

Desde la raíz del repositorio:

```sh
npm ci
npm run desktop:fork:prepare
npm run desktop:dev
```

El script de preparación recupera las revisiones fijadas, verifica las sumas de comprobación configuradas, aplica el parche de Nebula y prepara los entornos de ejecución locales. `npm run dev` también inicia el escritorio principal.

Para generar la aplicación:

```sh
npm run desktop:fork:app
```

La ruta depende del sistema: `mac-arm64/Nebula Cortex.app`, `linux-arm64-unpacked/nebula-cortex`, `linux-unpacked/nebula-cortex` o `win-unpacked/Nebula Cortex.exe`, dentro de `.desktop-fork/packages/desktop/dist/`.

Mantenga la carpeta completa junto al ejecutable. `npm run desktop:fork:archive` genera el archivo de distribución de desarrollo.

En **Configuración de IA**, introduce el endpoint, los modelos, sus capacidades y, cuando sea necesario, la clave del proveedor. Los proveedores remotos pueden cobrar por el uso según sus tarifas. Ollama local en loopback no requiere clave. Las capacidades configuradas deben corresponder a las del modelo y de la API; elegir un proveedor no garantiza que todos sus modelos sean compatibles.

El escritorio guarda las claves mediante el almacenamiento seguro del sistema a través de Electron `safeStorage`. Git ignora los entornos de ejecución, perfiles locales, dependencias y compilaciones. No incluyas credenciales ni datos personales en commits, issues o PRs.

## Verificar cambios

```sh
npm run check
npm run check:publication
npm run desktop:fork:test
npm run desktop:fork:integration
```

Las pruebas del fork requieren la preparación previa en la plataforma de destino. La integración utiliza el motor real con APIs locales sintéticas, sin llamar a proveedores de pago. La verificación de publicación examina la integridad del parche, avisos de terceros, artefactos locales, tamaños de archivos y algunos patrones de credenciales; no sustituye la revisión del contenido que se publicará.

## Funciones en desarrollo

- Generación real de imágenes y vídeos: los modelos pueden configurarse, pero los flujos de generación todavía no están implementados.
- Instalador de plugins y skills del asistente. Las conexiones MCP y las extensiones del editor ya tienen sus propios mecanismos.
- Checkpoints recuperables y restauración de archivos con verificación de conflictos.
- Control visual general de otras aplicaciones, evaluación ampliada de Reflex y distribución firmada.

Consulta el [plan de próximas entregas](docs/PROXIMAS-ENTREGAS.md).

## Contribuir

**¡Toda persona que quiera contribuir a Nebula es bienvenida!** Puedes proponer mejoras, informar de problemas, mejorar la documentación y las traducciones o aportar código.

Para contribuir con código, haz un fork del repositorio, crea una rama, implementa un cambio con un alcance claro y abre un **Pull Request (PR)**. Explica el problema, la solución y cómo verificaste el resultado. Incluye pruebas relevantes y capturas de pantalla cuando el cambio afecte a la interfaz. Para cambios importantes, abre primero una issue para acordar la propuesta.

**Todos los PRs serán revisados por los responsables del proyecto antes de ser aceptados.** La revisión considera el funcionamiento, la seguridad, la calidad, la compatibilidad y la coherencia con el proyecto. Abrir un PR no garantiza su aprobación; pueden solicitarse ajustes antes del merge. Al editar estos READMEs, mantén las tres versiones coherentes.

Las adaptaciones del escritorio se distribuyen en `integrations/mimo-desktop/nebula.patch`, con un manifiesto en `upstream.json`. Si modificas el fork local, actualiza el parche y su suma de comprobación junto con el código para que el cambio pueda reproducirse. No añadas los directorios de ejecución ni el checkout `.desktop-fork` al repositorio raíz.

## Arquitectura, origen y documentación

El escritorio principal combina un fork histórico del repositorio oficial **Xiaomi MiMo Code**, la interfaz Electron/Solid, el motor MiMo y el editor **Code-OSS/code-server**, con integraciones e identidad propias de Nebula. El proyecto no es un producto oficial de Xiaomi, Microsoft o Cursor, ni una copia completa de la interfaz comercial actual de MiMo Desktop.

El código React/Tauri anterior permanece en `apps/desktop`. `npm run dev:legacy` inicia la vista previa del navegador con respuestas simuladas y un editor Monaco en memoria; esa vista previa es independiente del escritorio principal.

- [Escritorio, procedencia y reproducción](docs/MIMO-DESKTOP-FORK.md)
- [Agentes y herramientas](docs/AGENTES-NEBULA.md)
- [Misiones y contexto del editor](docs/MISSOES-NEBULA.md)
- [Conexiones MCP](docs/CONEXOES-MCP-NEBULA.md)
- [Nebula Reflex](docs/NEBULA-REFLEX.md)
- [Editor Code-OSS](docs/EDITOR-CODE-OSS.md)
- [Apariencia](docs/APARENCIA-NEBULA.md)
- [Publicación en GitHub](docs/PUBLICACAO-GITHUB.md)
- [Registro de desarrollo](DESENVOLVIMENTO.md)

La documentación técnica complementaria está actualmente en portugués. Los avisos y las licencias de los componentes externos se conservan en `integrations` y `editor/third-party`. La licencia del código propio de Nebula todavía no está definida en un archivo `LICENSE` en la raíz.

Las etiquetas de la interfaz citadas aquí están traducidas para esta guía; la interfaz actual del escritorio está principalmente en portugués.
