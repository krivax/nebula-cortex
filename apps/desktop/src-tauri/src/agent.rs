//! A single supervised Node process. The workbench never receives this IPC route.
use nebula_project::ProjectError;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, Manager};

type Result<T> = std::result::Result<T, ProjectError>;
pub(crate) type Sink = Arc<dyn Fn(AgentEvent) -> bool + Send + Sync>;
fn fail(code: &'static str, message: &'static str) -> ProjectError { ProjectError { code, message } }
fn valid_id(id: &str) -> bool { !id.trim().is_empty() && id.encode_utf16().count() <= 128 }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunRequest {
    #[serde(default)]
    pub engine: Engine,
    #[serde(default, skip_serializing_if="Option::is_none")]
    pub project_id: Option<String>,
    version: u8,
    #[serde(rename = "type")]
    kind: String,
    request_id: String,
    session_id: String,
    prompt: String,
}
#[derive(Clone, Deserialize, Serialize, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Engine { #[default] Mock, Mimo }
impl RunRequest {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.version != 1 || self.kind != "run" || !valid_id(&self.request_id) || !valid_id(&self.session_id) || self.prompt.trim().is_empty() || self.prompt.encode_utf16().count() > 32000 {
            return Err(fail("AGENT_REQUEST", "Tarefa inválida ou maior que 32.000 caracteres."));
        }
        Ok(())
    }
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    version: u8,
    request_id: String,
    session_id: String,
    #[serde(flatten)]
    payload: Payload,
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Payload {
    Started,
    Delta { text: String },
    Error { code: String, message: String },
    Finished { status: Status },
    Snapshot { text: String },
    Activity { message: String },
    Tool { #[serde(rename="toolId")] tool_id: String, name: String, status: ToolStatus, description: String },
    Permission { #[serde(rename="permissionId")] permission_id: String, permission: String, patterns: Vec<String>, #[serde(default)] detail: String },
    PermissionResolved { #[serde(rename="permissionId")] permission_id: String },
}
#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(rename_all = "snake_case")]
enum ToolStatus { Pending, Running, Completed, Error }
#[derive(Clone, Deserialize, Serialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Status { Completed, Cancelled, Failed }
impl AgentEvent {
    fn valid(&self) -> bool {
        self.version == 1 && valid_id(&self.request_id) && valid_id(&self.session_id) && match &self.payload {
            Payload::Delta { text } | Payload::Snapshot { text } => text.encode_utf16().count() <= 32000,
            Payload::Error { code, message } => code.len() <= 128 && message.encode_utf16().count() <= 1000,
            Payload::Activity { message } => message.encode_utf16().count() <= 1000,
            Payload::Tool { tool_id, name, description, .. } => valid_id(tool_id) && name.len() <= 128 && description.encode_utf16().count() <= 1000,
            Payload::Permission { permission_id, permission, patterns, detail } => detail.encode_utf16().count() <= 16000 && valid_id(permission_id) && permission.len() <= 128 && patterns.len() <= 32 && patterns.iter().all(|p| p.encode_utf16().count() <= 4000) && patterns.iter().map(|p| p.encode_utf16().count()).sum::<usize>() <= 24000,
            Payload::PermissionResolved { permission_id } => valid_id(permission_id),
            _ => true,
        }
    }
}
struct Job { session_id: String, sink: Sink, started: bool, last_event: Instant, cancelled: Option<Instant>, permissions: HashSet<String> }
struct Process { child: Child, stdin: ChildStdin, generation: u64, group: bool }
impl Drop for Process {
    fn drop(&mut self) {
        #[cfg(unix)]
        if self.group { unsafe { libc::kill(-(self.child.id() as i32), libc::SIGKILL); } }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
struct Inner { process: Option<Process>, jobs: HashMap<String, Job>, generation: u64 }
#[derive(Default)]
pub struct AgentState { inner: Mutex<Inner> }
impl Inner {
    fn stop(&mut self) {
        self.process.take();
        for (request_id, job) in self.jobs.drain() {
            let envelope = |payload| AgentEvent { version: 1, request_id: request_id.clone(), session_id: job.session_id.clone(), payload };
            if job.cancelled.is_none() {
                (job.sink)(envelope(Payload::Error { code: "AGENT_EXIT".into(), message: "O motor de agentes foi interrompido. Envie uma nova tarefa para tentar novamente.".into() }));
            }
            (job.sink)(envelope(Payload::Finished { status: if job.cancelled.is_some() { Status::Cancelled } else { Status::Failed } }));
        }
    }
    fn write(&mut self, message: &impl Serialize) -> Result<()> {
        let mut line = serde_json::to_vec(message).map_err(|_| fail("AGENT_PROTOCOL", "Não foi possível preparar a tarefa."))?;
        line.push(b'\n');
        let process = self.process.as_mut().ok_or_else(|| fail("AGENT_OFFLINE", "O motor não está disponível."))?;
        let deadline = Instant::now() + Duration::from_secs(2);
        let mut remaining = line.as_slice();
        while !remaining.is_empty() {
            match process.stdin.write(remaining) {
                Ok(0) => return Err(fail("AGENT_WRITE", "O motor não recebeu a tarefa.")),
                Ok(n) => remaining = &remaining[n..],
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock && Instant::now() < deadline => thread::sleep(Duration::from_millis(5)),
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted && Instant::now() < deadline => {},
                Err(_) => return Err(fail("AGENT_WRITE", "O motor não recebeu a tarefa.")),
            }
        }
        Ok(())
    }
}
impl AgentState {
    fn start(self: &Arc<Self>, node: &Path, script: &Path, request: RunRequest, sink: Sink) -> Result<()> {
        self.start_env(node, script, request, sink, &[])
    }
    pub(crate) fn start_env(self: &Arc<Self>, node: &Path, script: &Path, request: RunRequest, sink: Sink, environment: &[(String, String)]) -> Result<()> {
        request.validate()?;
        let mut inner = self.inner.lock().map_err(|_| fail("AGENT_LOCK", "O motor não está disponível."))?;
        // Reap before accepting a new run; never replay any previous request.
        if inner.process.as_mut().is_some_and(|p| !matches!(p.child.try_wait(), Ok(None))) { inner.stop(); }
        if inner.jobs.contains_key(&request.request_id) || inner.jobs.len() >= 4 {
            return Err(fail("AGENT_BUSY", "Tarefa duplicada ou limite de quatro tarefas simultâneas."));
        }
        if inner.process.is_none() {
            let mut command = Command::new(node);
            command.arg(script).current_dir(script.parent().unwrap_or(Path::new(".")))
                .env_clear().stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
            for (key, value) in environment { command.env(key, value); }
            #[cfg(unix)] {
                use std::os::unix::process::CommandExt;
                if !environment.is_empty() { command.process_group(0); }
            }
            let mut child = command.spawn().map_err(|_| fail("AGENT_START", "Não foi possível iniciar o motor Node empacotado. Prepare o runtime com npm run editor:prepare."))?;
            let stdin = child.stdin.take().expect("piped stdin");
            let stdout = child.stdout.take().expect("piped stdout");
            inner.generation = inner.generation.wrapping_add(1);
            let generation = inner.generation;
            let process = Process { child, stdin, generation, group: !environment.is_empty() };
            #[cfg(unix)] {
                use std::os::fd::AsRawFd;
                let fd = process.stdin.as_raw_fd();
                let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
                if flags == -1 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } == -1 {
                    return Err(fail("AGENT_PIPE", "Não foi possível preparar o transporte do agente."));
                }
            }
            inner.process = Some(process);
            let weak = Arc::downgrade(self);
            thread::spawn(move || {
                let mut reader = BufReader::new(stdout);
                loop {
                    let mut line = Vec::new();
                    // Bound allocation even if a corrupt worker never emits a newline.
                    let read = reader.by_ref().take(262145).read_until(b'\n', &mut line);
                    let event = if matches!(read, Ok(n) if n > 0 && n <= 262144) && line.last() == Some(&b'\n') {
                        serde_json::from_slice::<AgentEvent>(&line).ok().filter(AgentEvent::valid)
                    } else { None };
                    let Some(state) = weak.upgrade() else { break };
                    let Ok(mut inner) = state.inner.lock() else { break };
                    if inner.process.as_ref().map(|p| p.generation) != Some(generation) { break; }
                    let Some(event) = event else { inner.stop(); break };
                    if !deliver(&mut inner, event) { inner.stop(); break; }
                }
            });
            let weak = Arc::downgrade(self);
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(50));
                let Some(state) = weak.upgrade() else { break };
                let Ok(mut inner) = state.inner.lock() else { break };
                let Some(process) = inner.process.as_mut() else { break };
                if process.generation != generation { break; }
                let exited = !matches!(process.child.try_wait(), Ok(None));
                let stalled = inner.jobs.values().any(|job| job.last_event.elapsed() > Duration::from_secs(60) || job.cancelled.is_some_and(|t| t.elapsed() > Duration::from_secs(if inner.process.as_ref().is_some_and(|p| p.group) { 8 } else { 2 })));
                if exited || stalled { inner.stop(); break; }
            });
        }
        inner.jobs.insert(request.request_id.clone(), Job { session_id: request.session_id.clone(), sink, started: false, last_event: Instant::now(), cancelled: None, permissions: HashSet::new() });
        if let Err(problem) = inner.write(&request) { inner.stop(); return Err(problem); }
        Ok(())
    }
    pub(crate) fn cancel(&self, request_id: &str, session_id: &str) -> Result<()> {
        if !valid_id(request_id) || !valid_id(session_id) { return Err(fail("AGENT_REQUEST", "Identificadores inválidos.")); }
        let mut inner = self.inner.lock().map_err(|_| fail("AGENT_LOCK", "O motor não está disponível."))?;
        let Some(job) = inner.jobs.get_mut(request_id) else { return Ok(()) };
        if job.session_id != session_id { return Err(fail("AGENT_SESSION", "A tarefa pertence a outra conversa.")); }
        if job.cancelled.is_some() { return Ok(()) }
        job.cancelled = Some(Instant::now());
        let message = serde_json::json!({ "version": 1, "type": "cancel", "requestId": request_id, "sessionId": session_id });
        if let Err(problem) = inner.write(&message) { inner.stop(); return Err(problem); }
        Ok(())
    }
    pub(crate) fn busy(&self) -> bool { self.inner.lock().map(|inner| !inner.jobs.is_empty()).unwrap_or(true) }
    pub(crate) fn reply(&self, request_id: &str, session_id: &str, permission_id: &str, allow: bool) -> Result<()> {
        let mut inner = self.inner.lock().map_err(|_| fail("AGENT_LOCK", "O motor não está disponível."))?;
        let job = inner.jobs.get_mut(request_id).ok_or_else(|| fail("MIMO_PERMISSION", "A tarefa já encerrou."))?;
        if job.session_id != session_id || job.cancelled.is_some() || !job.permissions.remove(permission_id) {
            return Err(fail("MIMO_PERMISSION", "O pedido de acesso não pertence à tarefa ativa."));
        }
        let message = serde_json::json!({ "version":1, "type":"permission_reply", "requestId": request_id, "sessionId": session_id, "permissionId": permission_id, "allow":allow });
        if let Err(problem) = inner.write(&message) { inner.stop(); return Err(problem); }
        Ok(())
    }
    pub fn stop(&self) { if let Ok(mut inner) = self.inner.lock() { inner.stop(); } }
}
impl Drop for AgentState { fn drop(&mut self) { self.stop(); } }
fn deliver(inner: &mut Inner, mut event: AgentEvent) -> bool {
    let Some(job) = inner.jobs.get_mut(&event.request_id) else { return false };
    if event.session_id != job.session_id { return false; }
    match &event.payload {
        Payload::Started if !job.started => job.started = true,
        Payload::Started => return false,
        _ if !job.started => return false,
        _ => {}
    }
    match &event.payload {
        Payload::Permission { permission_id, .. } => { job.permissions.insert(permission_id.clone()); },
        Payload::PermissionResolved { permission_id } => { job.permissions.remove(permission_id); },
        _ => {},
    }
    job.last_event = Instant::now();
    let finished = matches!(event.payload, Payload::Finished { .. });
    if job.cancelled.is_some() {
        if let Payload::Finished { status } = &mut event.payload { *status = Status::Cancelled; }
        if matches!(event.payload, Payload::Delta { .. } | Payload::Snapshot { .. } | Payload::Permission { .. }) { return true; }
    }
    let delivered = (job.sink)(event.clone());
    if finished { inner.jobs.remove(&event.request_id); }
    // A vanished channel must not leave tasks executing in the background.
    delivered
}
pub(crate) fn paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf)> {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Err(fail("AGENT_PLATFORM", "O runtime do agente está disponível inicialmente no macOS ARM64."));
    }
    if let Ok(resources) = app.path().resource_dir() {
        let node = resources.join("editor-runtime/darwin-arm64/node/bin/node");
        let script = resources.join("agent/sidecar.cjs");
        if node.is_file() && script.is_file() { return Ok((node, script)); }
    }
    if cfg!(debug_assertions) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let node = root.join(".editor-runtime/darwin-arm64/node/bin/node");
        let script = root.join("dist/sidecar.cjs");
        if node.is_file() && script.is_file() { return Ok((node, script)); }
    }
    Err(fail("AGENT_MISSING", "Runtime ausente. Execute npm run editor:prepare e gere o aplicativo novamente."))
}
pub(crate) fn main_only(webview: &tauri::Webview) -> Result<()> {
    if webview.label() != "main" { return Err(fail("AGENT_FORBIDDEN", "Esta janela não pode executar tarefas.")); }
    Ok(())
}
#[tauri::command]
pub async fn start_agent_run(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, Arc<AgentState>>, request: RunRequest, events: Channel<AgentEvent>) -> Result<()> {
    main_only(&webview)?;
    request.validate()?;
    if request.engine == Engine::Mimo {
        let mimo = Arc::clone(app.state::<Arc<crate::mimo::MimoState>>().inner());
        return tauri::async_runtime::spawn_blocking(move || mimo.start(&app, request, Arc::new(move |event| events.send(event).is_ok())))
            .await.map_err(|_| fail("MIMO_WORKER", "Não foi possível iniciar o MiMo."))?;
    }
    let (node, script) = paths(&app)?;
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || state.start(&node, &script, request, Arc::new(move |event| events.send(event).is_ok())))
        .await.map_err(|_| fail("AGENT_WORKER", "Não foi possível iniciar a tarefa."))?
}
#[tauri::command]
pub async fn cancel_agent_run(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, Arc<AgentState>>, request_id: String, session_id: String) -> Result<()> {
    main_only(&webview)?;
    let mock = Arc::clone(state.inner());
    let mimo = Arc::clone(app.state::<Arc<crate::mimo::MimoState>>().inner());
    tauri::async_runtime::spawn_blocking(move || { mock.cancel(&request_id, &session_id)?; mimo.agent.cancel(&request_id, &session_id) })
        .await.map_err(|_| fail("AGENT_WORKER", "Não foi possível interromper a tarefa."))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{self, Receiver};
    fn runtime() -> (PathBuf, PathBuf) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let node = root.join(".editor-runtime/darwin-arm64/node/bin/node");
        let script = root.join("dist/sidecar.cjs");
        assert!(node.is_file() && script.is_file(), "Prepare npm run editor:prepare e npm run build:sidecar antes dos testes de processo.");
        (node, script)
    }
    fn request(id: &str) -> RunRequest { RunRequest { engine: Engine::Mock, project_id: None, version: 1, kind: "run".into(), request_id: id.into(), session_id: "s".into(), prompt: "Olá".into() } }
    fn sink() -> (Sink, Receiver<AgentEvent>) {
        let (sender, receiver) = mpsc::channel();
        (Arc::new(move |event| sender.send(event).is_ok()), receiver)
    }
    fn terminal(receiver: &Receiver<AgentEvent>) -> Vec<AgentEvent> {
        let mut events = vec![];
        loop {
            let event = receiver.recv_timeout(Duration::from_secs(12)).expect("Tarefa não finalizou");
            let finished = matches!(event.payload, Payload::Finished { .. });
            events.push(event);
            if finished { return events; }
        }
    }
    #[test]
    fn real_worker_streams_and_reuses_process() {
        let (node, script) = runtime(); let state = Arc::new(AgentState::default());
        let (send, receive) = sink(); state.start(&node, &script, request("r"), send).unwrap();
        let pid = state.inner.lock().unwrap().process.as_ref().unwrap().child.id();
        let events = terminal(&receive);
        assert!(matches!(events.first().unwrap().payload, Payload::Started));
        assert!(events.iter().any(|e| matches!(e.payload, Payload::Delta { .. })));
        assert!(matches!(events.last().unwrap().payload, Payload::Finished { status: Status::Completed }));
        let (send, receive) = sink(); state.start(&node, &script, request("next"), send).unwrap();
        assert_eq!(pid, state.inner.lock().unwrap().process.as_ref().unwrap().child.id());
        state.cancel("next", "s").unwrap(); terminal(&receive); state.stop();
    }
    #[test]
    fn cancellation_is_session_scoped() {
        let (node, script) = runtime(); let state = Arc::new(AgentState::default()); let (send, receive) = sink();
        state.start(&node, &script, request("cancel"), send).unwrap();
        assert_eq!(state.cancel("cancel", "other").unwrap_err().code, "AGENT_SESSION");
        state.cancel("cancel", "s").unwrap();
        let events = terminal(&receive);
        assert!(matches!(events.last().unwrap().payload, Payload::Finished { status: Status::Cancelled }));
        assert!(!events.iter().any(|e| matches!(e.payload, Payload::Delta { .. })));
        state.stop();
    }
    #[test]
    fn death_fails_pending_run_and_new_request_restarts_without_replay() {
        let (node, script) = runtime(); let state = Arc::new(AgentState::default()); let (send, receive) = sink();
        state.start(&node, &script, request("dead"), send).unwrap();
        let pid = { let mut inner = state.inner.lock().unwrap(); let process = inner.process.as_mut().unwrap(); let pid = process.child.id(); process.child.kill().unwrap(); pid };
        let events = terminal(&receive);
        assert!(matches!(events.last().unwrap().payload, Payload::Finished { status: Status::Failed }));
        assert!(events.iter().any(|e| matches!(e.payload, Payload::Error { .. })));
        assert!(state.inner.lock().unwrap().process.is_none());
        let (send, receive) = sink(); state.start(&node, &script, request("new"), send).unwrap();
        assert_ne!(pid, state.inner.lock().unwrap().process.as_ref().unwrap().child.id());
        state.cancel("new", "s").unwrap();
        assert!(terminal(&receive).iter().all(|e| e.request_id == "new")); state.stop();
    }
    #[test]
    fn duplicate_and_concurrency_limit_do_not_disturb_existing_tasks() {
        let (node, script) = runtime(); let state = Arc::new(AgentState::default());
        let mut receivers = vec![];
        for id in ["1", "2", "3", "4"] { let (send, receive) = sink(); receivers.push(receive); state.start(&node, &script, request(id), send).unwrap(); }
        let (send, _) = sink(); assert_eq!(state.start(&node, &script, request("5"), send).unwrap_err().code, "AGENT_BUSY");
        let (send, _) = sink(); assert_eq!(state.start(&node, &script, request("1"), send).unwrap_err().code, "AGENT_BUSY");
        assert_eq!(state.inner.lock().unwrap().jobs.len(), 4); state.stop();
    }
    #[test]
    fn malformed_or_unbounded_output_terminates_worker() {
        let (node, _) = runtime();
        for source in ["process.stdout.write('invalid\\n'); setInterval(()=>{},1000)", "process.stdout.write('x'.repeat(300000)); setInterval(()=>{},1000)", "process.stdout.write(JSON.stringify({version:1,type:'started',requestId:'wrong',sessionId:'s'})+'\\n'); setInterval(()=>{},1000)"] {
            let file = std::env::temp_dir().join(format!("nebula-agent-{}.cjs", uuid::Uuid::new_v4()));
            std::fs::write(&file, source).unwrap();
            let state = Arc::new(AgentState::default()); let (send, receive) = sink(); state.start(&node, &file, request("bad"), send).unwrap();
            let events = terminal(&receive);
            assert!(matches!(events.last().unwrap().payload, Payload::Finished { status: Status::Failed }));
            assert!(state.inner.lock().unwrap().process.is_none());
            std::fs::remove_file(file).unwrap();
        }
    }
    #[test]
    fn unresponsive_worker_cannot_block_writes_or_cancellation() {
        let (node, _) = runtime();
        let file = std::env::temp_dir().join(format!("nebula-agent-{}.cjs", uuid::Uuid::new_v4()));
        std::fs::write(&file, "setInterval(()=>{},1000)").unwrap();
        let state = Arc::new(AgentState::default()); let (send, receive) = sink();
        let mut large = request("blocked"); large.prompt = "\u{0001}".repeat(32000);
        let before = Instant::now();
        assert_eq!(state.start(&node, &file, large, send).unwrap_err().code, "AGENT_WRITE");
        assert!(before.elapsed() < Duration::from_secs(4));
        assert!(matches!(terminal(&receive).last().unwrap().payload, Payload::Finished { status: Status::Failed }));
        std::fs::write(&file, "process.stdin.on('data',()=>{});process.stdout.write(JSON.stringify({version:1,type:'started',requestId:'stalled',sessionId:'s'})+'\\n');setInterval(()=>{},1000)").unwrap();
        let (send, receive) = sink(); state.start(&node, &file, request("stalled"), send).unwrap();
        assert!(matches!(receive.recv_timeout(Duration::from_secs(3)).unwrap().payload, Payload::Started));
        state.cancel("stalled", "s").unwrap();
        assert!(matches!(terminal(&receive).last().unwrap().payload, Payload::Finished { status: Status::Cancelled }));
        assert!(state.inner.lock().unwrap().process.is_none());
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    fn permissions_require_the_active_request_session_and_single_reply() {
        let (node, _) = runtime();
        let file = std::env::temp_dir().join(format!("nebula-permission-{}.cjs", uuid::Uuid::new_v4()));
        std::fs::write(&file, r#"require('readline').createInterface({input:process.stdin}).on('line',l=>{const r=JSON.parse(l); const e={version:1,requestId:r.requestId,sessionId:r.sessionId}; const emit=p=>process.stdout.write(JSON.stringify({...e,...p})+'\n');if(r.type==='run'){emit({type:'started'});emit({type:'permission',permissionId:'p',permission:'edit',patterns:['file.txt'],detail:'reviewed diff'});}else if(r.type==='permission_reply'){emit({type:'permission_resolved',permissionId:r.permissionId});emit({type:'finished',status:'completed'});}})"#).unwrap();
        let state = Arc::new(AgentState::default()); let (send, receive) = sink();
        state.start(&node, &file, request("r"), send).unwrap();
        assert!(matches!(receive.recv_timeout(Duration::from_secs(3)).unwrap().payload, Payload::Started));
        assert!(matches!(receive.recv_timeout(Duration::from_secs(3)).unwrap().payload, Payload::Permission { .. }));
        assert!(state.reply("other", "s", "p", true).is_err());
        assert!(state.reply("r", "other", "p", true).is_err());
        assert!(state.reply("r", "s", "unknown", true).is_err());
        state.reply("r", "s", "p", false).unwrap();
        assert!(state.reply("r", "s", "p", true).is_err());
        terminal(&receive); assert!(state.reply("r", "s", "p", true).is_err());
        state.stop(); std::fs::remove_file(file).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn stopping_mimo_group_also_stops_descendants() {
        let (node, _) = runtime();
        let file = std::env::temp_dir().join(format!("nebula-group-{}.cjs", uuid::Uuid::new_v4()));
        std::fs::write(&file, r#"require('readline').createInterface({input:process.stdin}).on('line',l=>{const r=JSON.parse(l);if(r.type!=='run')return;const child=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)']);const e={version:1,requestId:r.requestId,sessionId:r.sessionId};for(const p of [{type:'started'},{type:'delta',text:String(child.pid)}])process.stdout.write(JSON.stringify({...e,...p})+'\n');})"#).unwrap();
        let state = Arc::new(AgentState::default()); let (send, receive) = sink();
        state.start_env(&node, &file, request("r"), send, &[("NEBULA_TEST".into(), "1".into())]).unwrap();
        receive.recv_timeout(Duration::from_secs(3)).unwrap();
        let event = receive.recv_timeout(Duration::from_secs(3)).unwrap();
        let Payload::Delta { text } = event.payload else { panic!("Missing child PID"); };
        let pid: i32 = text.parse().unwrap();
        state.stop();
        let deadline = Instant::now() + Duration::from_secs(3);
        while unsafe { libc::kill(pid, 0) } == 0 && Instant::now() < deadline { thread::sleep(Duration::from_millis(25)); }
        assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
        std::fs::remove_file(file).unwrap();
    }
    #[test]
    fn request_limits_match_javascript_utf16() {
        let mut r = request("valid"); r.prompt = "💡".repeat(16000); assert!(r.validate().is_ok());
        r.prompt.push('x'); assert!(r.validate().is_err());
        r = request("valid"); r.version = 2; assert!(r.validate().is_err());
    }
}
