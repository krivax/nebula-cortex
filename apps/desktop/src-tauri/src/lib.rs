use nebula_project::{ProjectBroker, ProjectError, ProjectFile, ProjectSnapshot, SaveResult};
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
mod editor;
mod agent;
mod mimo;

#[tauri::command]
fn backend_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
fn worker_error<T>(_: T) -> ProjectError {
    ProjectError {
        code: "WORKER_ERROR",
        message: "Não foi possível concluir a operação do projeto.",
    }
}
#[tauri::command]
async fn open_project(
    app: tauri::AppHandle,
    broker: tauri::State<'_, Arc<ProjectBroker>>,
) -> Result<Option<ProjectSnapshot>, ProjectError> {
    let broker = Arc::clone(broker.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let Some(selection) = app
            .dialog()
            .file()
            .set_title("Abrir projeto no Nebula Cortex")
            .blocking_pick_folder()
        else {
            return Ok(None);
        };
        let path = selection.into_path().map_err(|_| ProjectError {
            code: "INVALID_FOLDER",
            message: "Selecione uma pasta local.",
        })?;
        broker.grant(&path).map(Some)
    })
    .await
    .map_err(worker_error)?
}
#[tauri::command]
async fn read_project_file(
    broker: tauri::State<'_, Arc<ProjectBroker>>,
    project_id: String,
    path: String,
) -> Result<ProjectFile, ProjectError> {
    let broker = Arc::clone(broker.inner());
    tauri::async_runtime::spawn_blocking(move || broker.read(&project_id, &path))
        .await
        .map_err(worker_error)?
}
#[tauri::command]
async fn save_project_file(
    broker: tauri::State<'_, Arc<ProjectBroker>>,
    project_id: String,
    path: String,
    expected_revision: String,
    content: String,
) -> Result<SaveResult, ProjectError> {
    let broker = Arc::clone(broker.inner());
    tauri::async_runtime::spawn_blocking(move || {
        broker.save(&project_id, &path, &expected_revision, &content)
    })
    .await
    .map_err(worker_error)?
}
#[tauri::command]
fn close_project(
    broker: tauri::State<'_, Arc<ProjectBroker>>,
    project_id: String,
) -> Result<(), ProjectError> {
    broker.close(&project_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let menu = tauri::menu::Menu::default(app)?;
            // Cocoa's predefined actions bypass Monaco's selection/undo model.
            // Let the workbench receive these keys, including Cmd+W for tabs.
            #[cfg(target_os = "macos")]
            for item in menu.items()? {
                if let tauri::menu::MenuItemKind::Submenu(submenu) = item {
                    match submenu.text()?.as_str() {
                        "File" => { menu.remove(&submenu)?; }
                        "Window" => { submenu.remove_at(3)?; } // Cocoa Close (Cmd+W)
                        "Edit" => {
                            submenu.remove_at(6)?; // Select All
                            submenu.remove_at(1)?; // Redo
                            submenu.remove_at(0)?; // Undo
                        }
                        _ => {}
                    }
                }
            }
            Ok(menu)
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(ProjectBroker::default()))
        .manage(Arc::new(editor::EditorState::default()))
        .manage(Arc::new(agent::AgentState::default()))
        .manage(Arc::new(mimo::MimoState::default()))
        .invoke_handler(tauri::generate_handler![
            backend_version,
            mimo::mimo_status,
            mimo::configure_mimo,
            mimo::reset_mimo,
            mimo::reply_mimo_permission,
            agent::start_agent_run,
            agent::cancel_agent_run,
            open_project,
            read_project_file,
            save_project_file,
            close_project,
            editor::open_code_oss,
            editor::resize_code_oss,
            editor::code_oss_status,
            editor::close_code_oss
        ])
        .build(tauri::generate_context!())
        .expect("Falha ao iniciar o Nebula Cortex")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Arc<mimo::MimoState>>().stop();
                app.state::<Arc<agent::AgentState>>().stop();
                app.state::<Arc<editor::EditorState>>().stop();
            }
        });
}
