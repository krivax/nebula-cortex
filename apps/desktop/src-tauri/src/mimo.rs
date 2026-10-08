use crate::{agent::{AgentState, RunRequest, Sink}, editor::EditorState};
use nebula_project::ProjectError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, sync::{Arc, Mutex}};
use tauri::Manager;

type Result<T> = std::result::Result<T, ProjectError>;
const SERVICE: &str = "dev.nebula.cortex.mimo";
fn fail(code: &'static str, message: &'static str) -> ProjectError { ProjectError { code, message } }
fn fingerprint(value: &str) -> String { format!("{:x}", Sha256::digest(value.as_bytes())) }
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct Settings { pub base_url: String, pub model: String, #[serde(default)] pub has_key: bool }
impl Default for Settings {
    fn default() -> Self { Self { base_url: "https://api.xiaomimimo.com/v1".into(), model: "mimo-v2.6-flash".into(), has_key: false } }
}
impl Settings {
    fn validate(&self) -> Result<()> {
        let url = tauri::Url::parse(&self.base_url).map_err(|_| fail("MIMO_URL", "Endereço do provedor inválido."))?;
        let local = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
        if self.base_url.len() > 2048 || (!local && url.scheme() != "https") || (url.scheme() != "https" && url.scheme() != "http") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
            return Err(fail("MIMO_URL", "Use HTTPS ou um servidor local, sem credenciais no endereço."));
        }
        if self.model.is_empty() || self.model.len() > 128 || !self.model.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.:/-".contains(&b)) {
            return Err(fail("MIMO_MODEL", "Informe um identificador de modelo válido."));
        }
        Ok(())
    }
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Info { settings: Settings, runtime_ready: bool, project: Option<String>, project_id: Option<String>, version: &'static str }
#[derive(Default)]
pub struct MimoState { pub(crate) agent: Arc<AgentState>, signature: Mutex<Option<String>>, operation: Mutex<()> }
fn directory(app: &tauri::AppHandle) -> Result<PathBuf> {
    app.path().app_local_data_dir().map(|p| p.join("mimo")).map_err(|_| fail("MIMO_DATA", "Não foi possível abrir os dados locais."))
}
fn read_settings(app: &tauri::AppHandle) -> Result<Settings> {
    let path = directory(app)?.join("settings.json");
    match fs::read(path) {
        Ok(bytes) => { let settings: Settings = serde_json::from_slice(&bytes).map_err(|_| fail("MIMO_CONFIG", "Configuração inválida. Abra as configurações do MiMo."))?; settings.validate()?; Ok(settings) },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Settings::default()),
        Err(_) => Err(fail("MIMO_CONFIG", "Não foi possível ler a configuração.")),
    }
}
fn runtime(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf)> {
    if let Ok(resources) = app.path().resource_dir() {
        let binary = resources.join("mimo-runtime/darwin-arm64/bin/mimo");
        let bridge = resources.join("agent/mimo-sidecar.cjs");
        if binary.is_file() && bridge.is_file() { return Ok((binary, bridge)); }
    }
    if cfg!(debug_assertions) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let binary = root.join(".mimo-runtime/darwin-arm64/bin/mimo"); let bridge = root.join("dist/mimo-sidecar.cjs");
        if binary.is_file() && bridge.is_file() { return Ok((binary, bridge)); }
    }
    Err(fail("MIMO_RUNTIME", "Prepare o motor com npm run mimo:prepare e gere o aplicativo novamente."))
}
fn write_settings(app: &tauri::AppHandle, settings: &Settings) -> Result<()> {
    let data = directory(app)?; fs::create_dir_all(&data).map_err(|_| fail("MIMO_CONFIG", "Não foi possível salvar a configuração."))?;
    let path = data.join("settings.json.tmp");
    use std::io::Write;
    let mut options = fs::OpenOptions::new(); options.create(true).write(true).truncate(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&path).map_err(|_| fail("MIMO_CONFIG", "Não foi possível salvar a configuração."))?;
    file.write_all(&serde_json::to_vec(&settings).unwrap()).map_err(|_| fail("MIMO_CONFIG", "Não foi possível salvar a configuração."))?;
    fs::rename(path, data.join("settings.json")).map_err(|_| fail("MIMO_CONFIG", "Não foi possível salvar a configuração."))?;
    Ok(())
}
#[cfg(target_os="macos")]
fn key(settings: &Settings) -> Result<Vec<u8>> {
    security_framework::passwords::generic_password(security_framework::passwords::PasswordOptions::new_generic_password(SERVICE, &fingerprint(&settings.base_url)))
        .map_err(|_| fail("MIMO_KEY", "A chave não está disponível no Keychain. Informe-a nas configurações."))
}
#[cfg(not(target_os="macos"))]
fn key(_: &Settings) -> Result<Vec<u8>> { Err(fail("MIMO_PLATFORM", "O armazenamento seguro inicial requer macOS.")) }
impl MimoState {
    pub fn stop(&self) { if let Ok(_operation) = self.operation.lock() { self.stop_inner(); } }
    fn stop_inner(&self) { self.agent.stop(); if let Ok(mut value) = self.signature.lock() { *value = None; } }
    pub(crate) fn start(self: &Arc<Self>, app: &tauri::AppHandle, request: RunRequest, sink: Sink) -> Result<()> {
        let _operation = self.operation.lock().map_err(|_| fail("MIMO_LOCK", "O motor está indisponível."))?;
        let settings = read_settings(app)?;
        if !settings.has_key { return Err(fail("MIMO_KEY", "Configure o modelo e a chave de API do MiMo antes de enviar.")); }
        let folder = app.state::<Arc<EditorState>>().folder()?.ok_or_else(|| fail("MIMO_PROJECT", "Abra a pasta do projeto no editor antes de enviar ao MiMo."))?;
        let project_id = fingerprint(&folder.to_string_lossy());
        if request.project_id.as_deref() != Some(&project_id) { return Err(fail("MIMO_PROJECT", "A conversa pertence a outro projeto. Crie uma conversa para a pasta atual.")); }
        let (binary, bridge) = runtime(app)?; let (node, _) = crate::agent::paths(app)?;
        let signature = fingerprint(&(project_id.clone() + &settings.base_url + &settings.model));
        let mut current = self.signature.lock().map_err(|_| fail("MIMO_LOCK", "O motor está indisponível."))?;
        if current.as_ref() != Some(&signature) { self.agent.stop(); *current = Some(signature); }
        let mut bytes = key(&settings)?;
        let secret = String::from_utf8(bytes.clone()).map_err(|_| fail("MIMO_KEY", "A chave armazenada é inválida."))?;
        bytes.fill(0);
        let profile = directory(app)?.join("projects").join(&project_id);
        let environment = vec![
            ("NEBULA_MIMO_BIN".into(), binary.to_string_lossy().into_owned()), ("NEBULA_MIMO_ROOT".into(), folder.to_string_lossy().into_owned()),
            ("NEBULA_MIMO_DATA".into(), profile.to_string_lossy().into_owned()), ("NEBULA_MIMO_BASE_URL".into(), settings.base_url),
            ("NEBULA_MIMO_MODEL".into(), settings.model), ("NEBULA_MIMO_API_KEY".into(), secret),
            ("PATH".into(), format!("{}:{}", node.parent().unwrap_or(Path::new("/usr/bin")).display(), std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin:/usr/sbin:/sbin".into()))),
        ];
        self.agent.start_env(&node, &bridge, request, sink, &environment)
    }
}
#[tauri::command]
pub async fn mimo_status(app: tauri::AppHandle, webview: tauri::Webview) -> Result<Info> {
    crate::agent::main_only(&webview)?;
    tauri::async_runtime::spawn_blocking(move || {
        let settings = read_settings(&app)?;
        let folder = app.state::<Arc<EditorState>>().folder()?;
        Ok(Info { settings, runtime_ready: runtime(&app).is_ok(), project: folder.as_ref().and_then(|p| p.file_name()).map(|p| p.to_string_lossy().into_owned()), project_id: folder.map(|p| fingerprint(&p.to_string_lossy())), version: "0.1.15" })
    }).await.map_err(|_| fail("MIMO_WORKER", "Não foi possível consultar o motor."))?
}
#[tauri::command]
pub async fn configure_mimo(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, Arc<MimoState>>, settings: Settings, api_key: String) -> Result<()> {
    crate::agent::main_only(&webview)?; settings.validate()?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = state.operation.lock().map_err(|_| fail("MIMO_LOCK", "O motor está indisponível."))?;
        if state.agent.busy() { return Err(fail("MIMO_BUSY", "Interrompa a tarefa antes de alterar as configurações.")); }
        let mut settings = settings; let api_key = api_key.trim();
        if !api_key.is_empty() {
            if api_key.len() > 8192 || api_key.chars().any(char::is_control) { return Err(fail("MIMO_KEY", "Chave inválida.")); }
            #[cfg(target_os="macos")]
            security_framework::passwords::set_generic_password(SERVICE, &fingerprint(&settings.base_url), api_key.as_bytes())
                .map_err(|_| fail("MIMO_KEY", "Não foi possível guardar a chave no Keychain."))?;
            #[cfg(not(target_os="macos"))]
            return Err(fail("MIMO_PLATFORM", "O armazenamento seguro inicial requer macOS."));
        } else { key(&settings)?; }
        settings.has_key = true;
        write_settings(&app, &settings)?;
        state.stop_inner(); Ok(())
    }).await.map_err(|_| fail("MIMO_WORKER", "Não foi possível configurar o motor."))?
}
#[tauri::command]
pub async fn reset_mimo(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, Arc<MimoState>>) -> Result<()> {
    crate::agent::main_only(&webview)?; let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _operation = state.operation.lock().map_err(|_| fail("MIMO_LOCK", "O motor está indisponível."))?;
        if state.agent.busy() { return Err(fail("MIMO_BUSY", "Interrompa a tarefa antes de remover a chave.")); }
        let settings = read_settings(&app)?;
        #[cfg(target_os="macos")]
        if settings.has_key {
            match security_framework::passwords::delete_generic_password(SERVICE, &fingerprint(&settings.base_url)) {
                Ok(()) => {},
                Err(error) if error.code() == -25300 => {}, // Item was already removed by the user.
                Err(_) => return Err(fail("MIMO_KEY", "Não foi possível remover a chave do Keychain.")),
            }
        }
        write_settings(&app, &Settings::default())?;
        state.stop_inner(); Ok(())
    }).await.map_err(|_| fail("MIMO_WORKER", "Não foi possível redefinir o motor."))?
}
#[tauri::command]
pub async fn reply_mimo_permission(webview: tauri::Webview, state: tauri::State<'_, Arc<MimoState>>, request_id: String, session_id: String, permission_id: String, allow: bool) -> Result<()> {
    crate::agent::main_only(&webview)?; let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || state.agent.reply(&request_id, &session_id, &permission_id, allow))
        .await.map_err(|_| fail("MIMO_WORKER", "Não foi possível responder ao pedido."))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_endpoint_and_model_without_exposing_secrets() {
        for base in ["https://api.xiaomimimo.com/v1", "http://127.0.0.1:8000/v1"] { assert!(Settings { base_url: base.into(), ..Settings::default() }.validate().is_ok()); }
        for base in ["http://example.com/v1", "https://token@example.com/v1", "https://example.com?api_key=secret", "file:///tmp"] { assert!(Settings { base_url: base.into(), ..Settings::default() }.validate().is_err()); }
        assert!(Settings { model: "wrong model".into(), ..Settings::default() }.validate().is_err());
        assert!(!serde_json::to_string(&Settings::default()).unwrap().contains("apiKey"));
    }
}
