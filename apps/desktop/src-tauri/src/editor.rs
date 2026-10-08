//! Embed the upstream Code-OSS workbench in a separate, unprivileged WebView.
//! This is a manual IDE running as the desktop user, not the agent's file sandbox.
use nebula_project::ProjectError;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const LABEL: &str = "code-oss";
const VERSION: &str = "4.139.1";
type Result<T> = std::result::Result<T, ProjectError>;
fn fail(code: &'static str, message: &'static str) -> ProjectError {
    ProjectError { code, message }
}
fn io_error(_: std::io::Error) -> ProjectError {
    fail("EDITOR_IO", "Não foi possível preparar o editor local.")
}
fn view_error(_: tauri::Error) -> ProjectError {
    fail(
        "EDITOR_VIEW",
        "Não foi possível integrar a janela do editor.",
    )
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorInfo {
    pub project: String,
    pub distribution: &'static str,
    pub version: &'static str,
}
#[derive(Clone, Copy, Deserialize)]
pub struct EditorBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl EditorBounds {
    fn validate(self) -> Result<Self> {
        if [self.x, self.y, self.width, self.height]
            .iter()
            .any(|v| !v.is_finite())
            || self.x < 0.0
            || self.y < 0.0
            || self.width < 40.0
            || self.height < 40.0
            || self.x + self.width > 20000.0
            || self.y + self.height > 20000.0
        {
            return Err(fail("EDITOR_BOUNDS", "Dimensões do editor inválidas."));
        }
        Ok(self)
    }
}
struct RunningEditor {
    child: Child,
    port: u16,
    folder: PathBuf,
    cookie: String,
    info: EditorInfo,
}
impl Drop for RunningEditor {
    fn drop(&mut self) {
        // code-server and its extension host are launched in their own process group.
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
pub struct EditorState {
    running: Mutex<Option<RunningEditor>>,
}
impl EditorState {
    pub(crate) fn folder(&self) -> Result<Option<PathBuf>> {
        self.info()?;
        let running = self.running.lock().map_err(|_| fail("EDITOR_STATE", "O editor está indisponível."))?;
        Ok(running.as_ref().map(|r| r.folder.clone()))
    }
    pub fn stop(&self) {
        if let Ok(mut running) = self.running.lock() {
            *running = None;
        }
    }
    fn info(&self) -> Result<Option<EditorInfo>> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| fail("EDITOR_STATE", "O estado do editor está indisponível."))?;
        if let Some(editor) = running.as_mut() {
            if editor.child.try_wait().map_err(io_error)?.is_none() {
                return Ok(Some(editor.info.clone()));
            }
            *running = None;
        }
        Ok(None)
    }
    fn start(&self, runtime: &Path, data: &Path, folder: &Path) -> Result<EditorInfo> {
        let mut running = self
            .running
            .lock()
            .map_err(|_| fail("EDITOR_STATE", "O estado do editor está indisponível."))?;
        if running.is_some() {
            return Err(fail(
                "EDITOR_OPEN",
                "Feche o editor atual antes de trocar de projeto.",
            ));
        }
        let ready: serde_json::Value =
            serde_json::from_slice(&fs::read(runtime.join("ready.json")).map_err(|_| {
                fail(
                    "EDITOR_MISSING",
                    "Prepare o Code-OSS executando npm run editor:prepare.",
                )
            })?)
            .map_err(|_| {
                fail(
                    "EDITOR_VERSION",
                    "Runtime do editor inválido. Prepare-o novamente.",
                )
            })?;
        if ready["version"] != VERSION {
            return Err(fail(
                "EDITOR_VERSION",
                "A versão do runtime não corresponde ao projeto.",
            ));
        }
        let folder = folder.canonicalize().map_err(io_error)?;
        if !folder.is_dir() {
            return Err(fail("EDITOR_FOLDER", "Selecione uma pasta local."));
        }
        fs::create_dir_all(data.join("User")).map_err(io_error)?;
        let companion = data.join("extensions/nebula-cortex.nebula-companion-0.1.0");
        fs::create_dir_all(&companion).map_err(io_error)?;
        fs::write(
            companion.join("package.json"),
            include_str!("../../../../editor/extensions/nebula-companion/package.json"),
        )
        .map_err(io_error)?;
        fs::write(
            companion.join("extension.cjs"),
            include_str!("../../../../editor/extensions/nebula-companion/extension.cjs"),
        )
        .map_err(io_error)?;
        let settings = data.join("User/settings.json");
        if !settings.exists() {
            fs::write(&settings, r#"{"workbench.colorTheme":"Default Dark Modern","workbench.startupEditor":"none","telemetry.telemetryLevel":"off","remote.autoForwardPorts":false,"window.title":"${dirty}${activeEditorShort}${separator}${rootName} — Nebula Editor","security.workspace.trust.enabled":true}"#).map_err(io_error)?;
        }
        let config = data.join("nebula-code-server.yaml");
        if !config.exists() {
            fs::write(&config, "{}\n").map_err(io_error)?;
        }
        let port = TcpListener::bind(("127.0.0.1", 0))
            .map_err(io_error)?
            .local_addr()
            .map_err(io_error)?
            .port();
        let password = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let mut command = Command::new(runtime.join("node/bin/node"));
        command
            .arg(runtime.join("server/node_modules/code-server/out/node/entry.js"))
            .arg("--bind-addr")
            .arg(format!("127.0.0.1:{port}"))
            .args([
                "--auth",
                "password",
                "--app-name",
                "Nebula Editor",
                "--disable-telemetry",
                "--disable-update-check",
                "--disable-proxy",
                "--disable-getting-started-override",
            ])
            .arg("--cookie-suffix")
            .arg(Uuid::new_v4().simple().to_string())
            .arg("--config")
            .arg(config)
            .arg("--user-data-dir")
            .arg(data)
            .arg("--extensions-dir")
            .arg(data.join("extensions"))
            .arg(&folder)
            .current_dir(&folder)
            .env("PASSWORD", &password)
            .env_remove("HASHED_PASSWORD")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let child = command.spawn().map_err(|_| {
            fail(
                "EDITOR_START",
                "Não foi possível iniciar o runtime Code-OSS.",
            )
        })?;
        let info = EditorInfo {
            project: folder
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "Projeto".into()),
            distribution: "Code-OSS / code-server",
            version: VERSION,
        };
        let mut editor = RunningEditor {
            child,
            port,
            folder,
            cookie: String::new(),
            info: info.clone(),
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if editor.child.try_wait().map_err(io_error)?.is_some() {
                return Err(fail(
                    "EDITOR_EXIT",
                    "O runtime encerrou antes de abrir. Execute npm run editor:prepare novamente.",
                ));
            }
            if let Ok(response) = request(port, "GET", "/healthz", "") {
                if response.starts_with("HTTP/1.1 200") {
                    break;
                }
            }
            if Instant::now() > deadline {
                return Err(fail(
                    "EDITOR_TIMEOUT",
                    "O editor demorou para iniciar. Tente abrir novamente.",
                ));
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let response = request(port, "POST", "/login", &format!("password={password}"))?;
        editor.cookie = login_cookie(&response)?;
        *running = Some(editor);
        Ok(info)
    }
}
fn request(port: u16, method: &str, path: &str, body: &str) -> Result<String> {
    let mut socket = TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(500),
    )
    .map_err(io_error)?;
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(io_error)?;
    socket
        .set_write_timeout(Some(Duration::from_secs(3)))
        .map_err(io_error)?;
    write!(socket, "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}", body.len()).map_err(io_error)?;
    let mut response = String::new();
    socket
        .take(128_000)
        .read_to_string(&mut response)
        .map_err(io_error)?;
    Ok(response)
}
fn login_cookie(response: &str) -> Result<String> {
    if !response.starts_with("HTTP/1.1 302") {
        return Err(fail(
            "EDITOR_AUTH",
            "Não foi possível autenticar a sessão local do editor.",
        ));
    }
    response
        .split("\r\n\r\n")
        .next()
        .unwrap_or("")
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("set-cookie") {
                Some(value.trim().to_string())
            } else {
                None
            }
        })
        .ok_or_else(|| fail("EDITOR_AUTH", "O editor não criou uma sessão autenticada."))
}
fn runtime_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    let platform = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "darwin-arm64"
    } else {
        return Err(fail(
            "EDITOR_PLATFORM",
            "O runtime Code-OSS ainda está disponível apenas no macOS ARM64.",
        ));
    };
    // Bundled artifacts take precedence; the checkout path is development-only.
    if let Ok(resources) = app.path().resource_dir() {
        let bundled = resources.join("editor-runtime").join(platform);
        if bundled.join("ready.json").exists() {
            return Ok(bundled);
        }
    }
    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../.editor-runtime")
            .join(platform));
    }
    Err(fail(
        "EDITOR_MISSING",
        "O aplicativo não contém o runtime Code-OSS.",
    ))
}
#[tauri::command]
pub async fn open_code_oss(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<EditorState>>,
    bounds: EditorBounds,
) -> Result<Option<EditorInfo>> {
    let bounds = bounds.validate()?;
    if let Some(info) = state.info()? {
        if app.get_webview(LABEL).is_none() {
            attach(&app, state.inner(), bounds)?;
        }
        resize_code_oss(app, bounds, true).await?;
        return Ok(Some(info));
    }
    if let Some(stale_view) = app.get_webview(LABEL) {
        stale_view.close().map_err(view_error)?;
    }
    let handle = app.clone();
    let state = Arc::clone(state.inner());
    let info = tauri::async_runtime::spawn_blocking(move || {
        let Some(selection) = handle
            .dialog()
            .file()
            .set_title("Abrir projeto no Code-OSS")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let path = selection
            .into_path()
            .map_err(|_| fail("EDITOR_FOLDER", "Selecione uma pasta local."))?;
        let runtime = runtime_path(&handle)?;
        let data = handle
            .path()
            .app_local_data_dir()
            .map_err(view_error)?
            .join("code-oss");
        state.start(&runtime, &data, &path).map(Some)
    })
    .await
    .map_err(|_| fail("EDITOR_WORKER", "A abertura do editor foi interrompida."))??;
    if info.is_none() {
        return Ok(None);
    }
    if let Err(problem) = attach(&app, app.state::<Arc<EditorState>>().inner(), bounds) {
        app.state::<Arc<EditorState>>().stop();
        return Err(problem);
    }
    Ok(info)
}
fn attach(app: &tauri::AppHandle, state: &EditorState, bounds: EditorBounds) -> Result<()> {
    let bounds = window_bounds(app, bounds)?;
    let running = state
        .running
        .lock()
        .map_err(|_| fail("EDITOR_STATE", "O estado do editor está indisponível."))?;
    let editor = running
        .as_ref()
        .ok_or_else(|| fail("EDITOR_STATE", "Abra o editor novamente."))?;
    let origin = format!("http://127.0.0.1:{}", editor.port);
    // Explicitly select the picked folder; upstream otherwise restores a previous
    // workspace from its profile/cookie even when a new folder was passed to CLI.
    let mut target = format!("{origin}/").parse::<tauri::Url>().unwrap();
    target.query_pairs_mut().append_pair("folder", &editor.folder.to_string_lossy());
    let allowed_port = editor.port;
    let builder = tauri::webview::WebviewBuilder::new(
        LABEL,
        WebviewUrl::External(format!("{origin}/healthz").parse().unwrap()),
    )
    .on_navigation(move |url| {
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port() == Some(allowed_port)
    });
    let window = app
        .get_window("main")
        .ok_or_else(|| fail("EDITOR_VIEW", "Janela principal indisponível."))?;
    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(view_error)?;
    let mut cookie = tauri::webview::Cookie::parse(editor.cookie.clone())
        .map_err(|_| fail("EDITOR_AUTH", "Sessão do editor inválida."))?
        .into_owned();
    cookie.set_domain("127.0.0.1");
    cookie.set_path("/");
    cookie.set_http_only(true);
    if let Err(problem) = webview
        .set_cookie(cookie)
        .and_then(|_| webview.navigate(target))
    {
        let _ = webview.close();
        return Err(view_error(problem));
    }
    Ok(())
}
// DOM coordinates are relative to the main WebView, which can be inset below
// the macOS title bar. Child coordinates are relative to the native parent.
fn window_bounds(app: &tauri::AppHandle, mut bounds: EditorBounds) -> Result<EditorBounds> {
    let main = app.get_webview("main")
        .ok_or_else(|| fail("EDITOR_VIEW", "Janela principal indisponível."))?;
    let scale = main.window().scale_factor().map_err(view_error)?;
    let offset = main.position().map_err(view_error)?.to_logical::<f64>(scale);
    bounds.x += offset.x;
    bounds.y += offset.y;
    #[cfg(target_os = "macos")]
    {
        bounds.y += mac_title_inset(&main.window())?;
    }
    bounds.validate()
}
#[cfg(target_os = "macos")]
fn mac_title_inset(window: &tauri::Window) -> Result<f64> {
    let handle = window.clone();
    let (send, receive) = std::sync::mpsc::sync_channel(1);
    window.run_on_main_thread(move || {
        let inset = handle.ns_window().map_err(view_error).map(|pointer| {
            // Tauri owns this NSWindow; access is confined to its main thread.
            let native = unsafe { &*pointer.cast::<objc2_app_kit::NSWindow>() };
            let layout = native.contentLayoutRect();
            (native.frame().size.height - layout.origin.y - layout.size.height).max(0.0)
        });
        let _ = send.send(inset);
    }).map_err(view_error)?;
    receive.recv_timeout(Duration::from_secs(3))
        .map_err(|_| fail("EDITOR_VIEW", "Não foi possível medir a área da janela."))?
}
#[tauri::command]
pub async fn resize_code_oss(
    app: tauri::AppHandle,
    bounds: EditorBounds,
    visible: bool,
) -> Result<()> {
    let bounds = bounds.validate()?;
    if let Some(view) = app.get_webview(LABEL) {
        if visible {
            let bounds = window_bounds(&app, bounds)?;
            // Apply both together: macOS native bounds use a different origin,
            // so reading them between position and size can shift the child.
            view.set_bounds(tauri::Rect {
                position: LogicalPosition::new(bounds.x, bounds.y).into(),
                size: LogicalSize::new(bounds.width, bounds.height).into(),
            })
                .map_err(view_error)?;
            view.show().map_err(view_error)?;
        } else {
            view.hide().map_err(view_error)?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn code_oss_status(state: tauri::State<'_, Arc<EditorState>>) -> Result<Option<EditorInfo>> {
    state.info()
}
#[tauri::command]
pub async fn close_code_oss(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<EditorState>>,
) -> Result<()> {
    if let Some(view) = app.get_webview(LABEL) {
        view.close().map_err(view_error)?;
    }
    let state = Arc::clone(state.inner());
    let mimo = Arc::clone(app.state::<Arc<crate::mimo::MimoState>>().inner());
    tauri::async_runtime::spawn_blocking(move || { state.stop(); mimo.stop(); })
        .await
        .map_err(|_| fail("EDITOR_WORKER", "Não foi possível encerrar o editor."))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_accepts_valid_view_bounds() {
        assert!(EditorBounds {
            x: 0.0,
            y: 70.0,
            width: 1000.0,
            height: 700.0
        }
        .validate()
        .is_ok());
        for x in [f64::NAN, f64::INFINITY, -1.0, 21000.0] {
            assert!(EditorBounds {
                x,
                y: 0.0,
                width: 100.0,
                height: 100.0
            }
            .validate()
            .is_err());
        }
    }
    #[test]
    fn requires_authenticated_redirect_and_never_reads_cookie_from_body() {
        assert_eq!(
            login_cookie("HTTP/1.1 302 Found\r\nSet-Cookie: session=abc; Path=/\r\n\r\n").unwrap(),
            "session=abc; Path=/"
        );
        assert!(login_cookie("HTTP/1.1 200 OK\r\nSet-Cookie: session=abc\r\n\r\n").is_err());
        assert!(login_cookie("HTTP/1.1 302 Found\r\n\r\nSet-Cookie: attacker=value").is_err());
    }
}
