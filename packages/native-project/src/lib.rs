use cap_std::fs::{Dir, OpenOptions};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Component, Path},
    sync::Mutex,
};
use uuid::Uuid;

const FILE_LIMIT: u64 = 1_000_000;
const TOTAL_LIMIT: usize = 15_000_000;
const ENTRY_LIMIT: usize = 300;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectError {
    pub code: &'static str,
    pub message: &'static str,
}
type Result<T> = std::result::Result<T, ProjectError>;
fn error(code: &'static str, message: &'static str) -> ProjectError {
    ProjectError { code, message }
}
fn io_error(_: std::io::Error) -> ProjectError {
    error(
        "IO_ERROR",
        "Não foi possível acessar o arquivo no projeto autorizado.",
    )
}
fn lock_error<T>(_: std::sync::PoisonError<T>) -> ProjectError {
    error("STATE_ERROR", "O estado do projeto está indisponível.")
}
fn revision(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}
fn validate_path(path: &str) -> Result<&Path> {
    if path.is_empty()
        || path.contains('\\')
        || path
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == ".." || s.chars().any(char::is_control))
        || Path::new(path)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(error(
            "INVALID_PATH",
            "Use um caminho relativo dentro do projeto.",
        ));
    }
    Ok(Path::new(path))
}
fn read_text(dir: &Dir, path: &Path) -> Result<String> {
    let metadata = dir.symlink_metadata(path).map_err(io_error)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(error(
            "INVALID_FILE",
            "Selecione um arquivo regular, sem links simbólicos.",
        ));
    }
    if metadata.len() > FILE_LIMIT {
        return Err(error("FILE_LIMIT", "O arquivo excede o limite de 1 MB."));
    }
    let file = dir.open(path).map_err(io_error)?;
    let mut bytes = Vec::new();
    file.take(FILE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() > FILE_LIMIT as usize {
        return Err(error("FILE_LIMIT", "O arquivo excede o limite de 1 MB."));
    }
    if bytes.contains(&0) {
        return Err(error(
            "BINARY_FILE",
            "Arquivos binários não são suportados no editor.",
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| error("ENCODING_ERROR", "O editor aceita arquivos de texto UTF-8."))
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub path: String,
    pub content: String,
    pub revision: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub id: String,
    pub name: String,
    pub files: Vec<ProjectFile>,
    pub folders: Vec<String>,
    pub skipped: usize,
    pub truncated: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub revision: String,
}
struct Project {
    dir: Dir,
}
#[derive(Default)]
pub struct ProjectBroker {
    projects: Mutex<HashMap<String, Project>>,
}
impl ProjectBroker {
    /// Called only after the native user-controlled folder picker. Not exposed as an IPC command.
    pub fn grant(&self, path: &Path) -> Result<ProjectSnapshot> {
        let canonical = path.canonicalize().map_err(io_error)?;
        let dir =
            Dir::open_ambient_dir(&canonical, cap_std::ambient_authority()).map_err(io_error)?;
        let id = Uuid::new_v4().to_string();
        let name = canonical
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Projeto".into());
        let mut snapshot = ProjectSnapshot {
            id: id.clone(),
            name,
            files: vec![],
            folders: vec![],
            skipped: 0,
            truncated: false,
        };
        let mut total = 0;
        let mut scanned = 0;
        scan(&dir, "", &mut snapshot, &mut total, &mut scanned, 0)?;
        let mut projects = self.projects.lock().map_err(lock_error)?;
        if projects.len() >= 8 {
            return Err(error(
                "PROJECT_LIMIT",
                "Limite de oito projetos abertos atingido.",
            ));
        }
        projects.insert(id, Project { dir });
        Ok(snapshot)
    }
    pub fn read(&self, id: &str, path: &str) -> Result<ProjectFile> {
        let path_checked = validate_path(path)?;
        let projects = self.projects.lock().map_err(lock_error)?;
        let project = projects.get(id).ok_or_else(|| {
            error(
                "PROJECT_DENIED",
                "Abra a pasta novamente para autorizar o projeto.",
            )
        })?;
        let content = read_text(&project.dir, path_checked)?;
        Ok(ProjectFile {
            path: path.into(),
            revision: revision(content.as_bytes()),
            content,
        })
    }
    pub fn save(&self, id: &str, path: &str, expected: &str, content: &str) -> Result<SaveResult> {
        let checked = validate_path(path)?;
        if content.len() > FILE_LIMIT as usize || content.contains('\0') {
            return Err(error(
                "FILE_LIMIT",
                "O conteúdo deve ser texto UTF-8 de até 1 MB.",
            ));
        }
        let projects = self.projects.lock().map_err(lock_error)?;
        let project = projects.get(id).ok_or_else(|| {
            error(
                "PROJECT_DENIED",
                "Abra a pasta novamente para autorizar o projeto.",
            )
        })?;
        let original = read_text(&project.dir, checked)?;
        if revision(original.as_bytes()) != expected {
            return Err(error(
                "CONFLICT",
                "O arquivo mudou no disco. Compare as versões antes de salvar.",
            ));
        }
        let parent_path = checked
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let parent = project.dir.open_dir(parent_path).map_err(io_error)?;
        let name = checked
            .file_name()
            .ok_or_else(|| error("INVALID_PATH", "Nome de arquivo inválido."))?;
        let temp_name = format!(".nebula-{}.tmp", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        let result = (|| {
            let mut temporary = parent.open_with(&temp_name, &options).map_err(io_error)?;
            let permissions = parent.metadata(name).map_err(io_error)?.permissions();
            temporary.set_permissions(permissions).map_err(io_error)?;
            temporary.write_all(content.as_bytes()).map_err(io_error)?;
            temporary.sync_all().map_err(io_error)?;
            drop(temporary);
            // Recheck in the held parent directory immediately before the atomic replacement.
            let latest = read_text(&parent, Path::new(name))?;
            if revision(latest.as_bytes()) != expected {
                return Err(error(
                    "CONFLICT",
                    "O arquivo mudou no disco. Compare as versões antes de salvar.",
                ));
            }
            parent.rename(&temp_name, &parent, name).map_err(io_error)?;
            Ok(SaveResult {
                revision: revision(content.as_bytes()),
            })
        })();
        if result.is_err() {
            let _ = parent.remove_file(&temp_name);
        }
        result
    }
    pub fn close(&self, id: &str) -> Result<()> {
        self.projects.lock().map_err(lock_error)?.remove(id);
        Ok(())
    }
}
fn scan(
    dir: &Dir,
    prefix: &str,
    snapshot: &mut ProjectSnapshot,
    total: &mut usize,
    scanned: &mut usize,
    depth: usize,
) -> Result<()> {
    if depth > 20 || *scanned >= 5000 {
        snapshot.truncated = true;
        return Ok(());
    }
    let mut entries = dir
        .entries()
        .map_err(io_error)?
        .take(5000 - *scanned)
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(io_error)?;
    if entries.len() + *scanned >= 5000 {
        snapshot.truncated = true;
    }
    *scanned += entries.len();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if snapshot.files.len() + snapshot.folders.len() >= ENTRY_LIMIT {
            snapshot.truncated = true;
            break;
        }
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => {
                snapshot.skipped += 1;
                continue;
            }
        };
        if validate_path(&name).is_err() {
            snapshot.skipped += 1;
            continue;
        }
        if ["node_modules", ".git", "dist", "target", ".next"].contains(&name.as_str()) {
            snapshot.skipped += 1;
            continue;
        }
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let file_type = entry.file_type().map_err(io_error)?;
        if file_type.is_symlink() {
            snapshot.skipped += 1;
            continue;
        }
        if file_type.is_dir() {
            snapshot.folders.push(path.clone());
            if let Ok(child) = dir.open_dir(&name) {
                scan(&child, &path, snapshot, total, scanned, depth + 1)?;
            } else {
                snapshot.skipped += 1;
            }
        } else if file_type.is_file() {
            match read_text(dir, Path::new(&name)) {
                Ok(content) if *total + content.len() <= TOTAL_LIMIT => {
                    *total += content.len();
                    snapshot.files.push(ProjectFile {
                        path,
                        revision: revision(content.as_bytes()),
                        content,
                    });
                }
                Ok(_) => {
                    snapshot.truncated = true;
                    return Ok(());
                }
                Err(_) => snapshot.skipped += 1,
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn setup() -> (tempfile::TempDir, ProjectBroker, ProjectSnapshot) {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("src")).unwrap();
        fs::write(temp.path().join("src/app.ts"), "export const x = 1;\n").unwrap();
        let broker = ProjectBroker::default();
        let snapshot = broker.grant(temp.path()).unwrap();
        (temp, broker, snapshot)
    }
    #[test]
    fn writes_atomically_and_rejects_stale_revision() {
        let (temp, broker, project) = setup();
        let file = broker.read(&project.id, "src/app.ts").unwrap();
        let saved = broker
            .save(
                &project.id,
                &file.path,
                &file.revision,
                "export const x = 2;\n",
            )
            .unwrap();
        assert_ne!(saved.revision, file.revision);
        assert_eq!(
            fs::read_to_string(temp.path().join("src/app.ts")).unwrap(),
            "export const x = 2;\n"
        );
        assert_eq!(
            broker
                .save(&project.id, &file.path, &file.revision, "stale")
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        assert_eq!(fs::read_dir(temp.path().join("src")).unwrap().count(), 1);
    }
    #[test]
    fn preserves_external_edits_on_conflict() {
        let (temp, broker, project) = setup();
        let file = broker.read(&project.id, "src/app.ts").unwrap();
        fs::write(temp.path().join("src/app.ts"), "external edit").unwrap();
        assert_eq!(
            broker
                .save(&project.id, &file.path, &file.revision, "my edit")
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("src/app.ts")).unwrap(),
            "external edit"
        );
    }
    #[test]
    fn saving_a_compared_version_rechecks_new_external_changes() {
        let (temp, broker, project) = setup();
        let path = temp.path().join("src/app.ts");
        fs::write(&path, "external first").unwrap();
        let compared = broker.read(&project.id, "src/app.ts").unwrap();
        fs::write(&path, "external second").unwrap();
        assert_eq!(
            broker
                .save(&project.id, &compared.path, &compared.revision, "merged")
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "external second");
        let latest = broker.read(&project.id, "src/app.ts").unwrap();
        broker
            .save(&project.id, &latest.path, &latest.revision, "merged")
            .unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "merged");
    }
    #[test]
    fn truncates_large_project_listings() {
        let temp = tempfile::tempdir().unwrap();
        for n in 0..ENTRY_LIMIT + 1 {
            fs::write(temp.path().join(format!("{n:04}.ts")), "text").unwrap();
        }
        let project = ProjectBroker::default().grant(temp.path()).unwrap();
        assert_eq!(project.files.len(), ENTRY_LIMIT);
        assert!(project.truncated);
    }
    #[test]
    fn denies_traversal_absolute_and_ungranted_projects() {
        let (_, broker, project) = setup();
        for path in [
            "../secret",
            "/tmp/secret",
            "src/../app.ts",
            "src//app.ts",
            "src\\app.ts",
            "",
        ] {
            assert_eq!(
                broker.read(&project.id, path).unwrap_err().code,
                "INVALID_PATH"
            );
        }
        assert_eq!(
            broker.read("unknown", "src/app.ts").unwrap_err().code,
            "PROJECT_DENIED"
        );
        broker.close(&project.id).unwrap();
        assert_eq!(
            broker.read(&project.id, "src/app.ts").unwrap_err().code,
            "PROJECT_DENIED"
        );
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlinks_outside_scope() {
        let (temp, broker, project) = setup();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.ts"), "secret").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.ts"),
            temp.path().join("link.ts"),
        )
        .unwrap();
        std::os::unix::fs::symlink(outside.path(), temp.path().join("escape")).unwrap();
        assert!(broker.read(&project.id, "link.ts").is_err());
        assert!(broker.read(&project.id, "escape/secret.ts").is_err());
        assert!(broker
            .save(
                &project.id,
                "escape/secret.ts",
                &revision(b"secret"),
                "overwrite"
            )
            .is_err());
        assert_eq!(
            fs::read_to_string(outside.path().join("secret.ts")).unwrap(),
            "secret"
        );
    }
    #[test]
    fn scans_nested_and_empty_folders_and_enforces_limits() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("a/empty")).unwrap();
        fs::create_dir_all(temp.path().join("b")).unwrap();
        fs::write(temp.path().join("a/index.ts"), "a").unwrap();
        fs::write(temp.path().join("b/index.ts"), "b").unwrap();
        fs::write(temp.path().join("binary"), [0, 1]).unwrap();
        fs::write(
            temp.path().join("large"),
            vec![b'a'; FILE_LIMIT as usize + 1],
        )
        .unwrap();
        let broker = ProjectBroker::default();
        let project = broker.grant(temp.path()).unwrap();
        assert_eq!(project.files.len(), 2);
        assert!(project.folders.contains(&"a/empty".to_string()));
        assert_eq!(project.skipped, 2);
    }
    #[cfg(unix)]
    #[test]
    fn preserves_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let (temp, broker, project) = setup();
        let path = temp.path().join("src/app.ts");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        let file = broker.read(&project.id, "src/app.ts").unwrap();
        broker
            .save(&project.id, &file.path, &file.revision, "new")
            .unwrap();
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o755
        );
    }
}
