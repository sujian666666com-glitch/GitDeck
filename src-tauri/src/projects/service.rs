//! 项目管理的核心逻辑：读写配置、校验、增删改、扫描结果拼装。
//!
//! 所有函数都接收配置文件路径（不依赖 `AppHandle`），方便在测试里直接用临时目录。
//! 读改写由一个进程级互斥锁串行化，避免两个命令同时保存导致丢失修改。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use super::config::{self, StoredFolder, StoredProject};
use super::scan;
use super::types::{FolderNode, ProjectNode};
use crate::error::{AppError, AppResult};

/// 项目名最大字符数
pub const MAX_NAME_CHARS: usize = 64;

static LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock() -> MutexGuard<'static, ()> {
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 串行执行一次「读 → 改 → 写」。锁在阻塞线程内获取，不跨 await。
fn with_lock<T>(f: impl FnOnce() -> AppResult<T>) -> AppResult<T> {
    let _guard = lock();
    f()
}

/* ───────── 读取 ───────── */

/// 读取配置并扫描每个文件夹中的仓库
pub fn list(config_path: &Path) -> AppResult<Vec<ProjectNode>> {
    with_lock(|| {
        let config = config::load(config_path)?;
        Ok(config.projects.iter().map(build_project).collect())
    })
}

/* ───────── 项目 ───────── */

pub fn create(config_path: &Path, name: &str) -> AppResult<ProjectNode> {
    with_lock(|| {
        let name = validate_name(name)?;
        let mut config = config::load(config_path)?;
        let project =
            StoredProject { id: new_id(), name, folders: Vec::new() };
        config.projects.push(project.clone());
        config::save(config_path, &config)?;
        Ok(build_project(&project))
    })
}

pub fn rename(config_path: &Path, project_id: &str, name: &str) -> AppResult<ProjectNode> {
    with_lock(|| {
        let name = validate_name(name)?;
        let mut config = config::load(config_path)?;
        let project = config
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| AppError::NotFound("项目不存在".into()))?;
        project.name = name;
        let project = project.clone();
        config::save(config_path, &config)?;
        Ok(build_project(&project))
    })
}

pub fn delete(config_path: &Path, project_id: &str) -> AppResult<()> {
    with_lock(|| {
        let mut config = config::load(config_path)?;
        let before = config.projects.len();
        config.projects.retain(|project| project.id != project_id);
        if config.projects.len() == before {
            return Err(AppError::NotFound("项目不存在".into()));
        }
        config::save(config_path, &config)
    })
}

/* ───────── 文件夹 ───────── */

/// 给项目添加文件夹并立即扫描
pub fn add_folder(config_path: &Path, project_id: &str, path: &str) -> AppResult<FolderNode> {
    with_lock(|| {
        let mut config = config::load(config_path)?;
        let project = config
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| AppError::NotFound("项目不存在".into()))?;

        let canonical = canonical_dir(path)?;
        let duplicate = project
            .folders
            .iter()
            .any(|folder| same_path(&folder.path, &canonical));
        if duplicate {
            return Err(AppError::invalid("该文件夹已在项目中"));
        }

        let folder = StoredFolder { id: new_id(), path: path_to_string(&canonical) };
        project.folders.push(folder.clone());
        config::save(config_path, &config)?;
        Ok(build_folder(&folder))
    })
}

pub fn remove_folder(config_path: &Path, project_id: &str, folder_id: &str) -> AppResult<()> {
    with_lock(|| {
        let mut config = config::load(config_path)?;
        let project = config
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| AppError::NotFound("项目不存在".into()))?;

        let before = project.folders.len();
        project.folders.retain(|folder| folder.id != folder_id);
        if project.folders.len() == before {
            return Err(AppError::NotFound("文件夹不存在".into()));
        }
        config::save(config_path, &config)
    })
}

/* ───────── 内部辅助 ───────── */

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn validate_name(raw: &str) -> AppResult<String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::invalid("项目名称不能为空"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::invalid(format!("项目名称不能超过 {MAX_NAME_CHARS} 个字符")));
    }
    Ok(name.to_string())
}

/// 校验并规范化用户选择（或手输）的目录
fn canonical_dir(path: &str) -> AppResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid("请选择一个文件夹"));
    }
    let canonical = fs::canonicalize(trimmed)
        .map_err(|_| AppError::invalid(format!("文件夹不存在或无法访问：{trimmed}")))?;
    if !canonical.is_dir() {
        return Err(AppError::invalid(format!("不是文件夹：{trimmed}")));
    }
    Ok(canonical)
}

/// 比较两个路径是否指向同一目录：优先规范化（文件夹可能已被删除，退化为字符串比较）
fn same_path(stored: &str, candidate: &Path) -> bool {
    let stored_path = Path::new(stored);
    match (fs::canonicalize(stored_path), fs::canonicalize(candidate)) {
        (Ok(a), Ok(b)) => a == b,
        _ => stored_path == candidate,
    }
}

fn build_project(project: &StoredProject) -> ProjectNode {
    ProjectNode {
        id: project.id.clone(),
        name: project.name.clone(),
        folders: project.folders.iter().map(build_folder).collect(),
    }
}

fn build_folder(folder: &StoredFolder) -> FolderNode {
    let path = PathBuf::from(&folder.path);
    let name = folder_name(&path);
    match scan::scan_folder(&path) {
        Some(outcome) => FolderNode {
            id: folder.id.clone(),
            path: folder.path.clone(),
            name,
            exists: true,
            is_repo: outcome.is_repo,
            repos: outcome.repos,
        },
        None => FolderNode {
            id: folder.id.clone(),
            path: folder.path.clone(),
            name,
            exists: false,
            is_repo: false,
            repos: Vec::new(),
        },
    }
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path_to_string(path))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::projects::scan::init_repo;

    struct Fixture {
        dir: tempfile::TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            Self { dir: tempfile::tempdir().expect("temp dir") }
        }

        fn config(&self) -> PathBuf {
            self.dir.path().join("config").join("projects.json")
        }

        /// 在临时目录里建一个普通文件夹（返回规范化后的路径，macOS 上 /var 会变成 /private/var）
        fn folder(&self, name: &str) -> PathBuf {
            let path = self.dir.path().join(name);
            fs::create_dir_all(&path).expect("create folder");
            fs::canonicalize(path).expect("canonicalize folder")
        }

        fn repo(&self, name: &str) -> PathBuf {
            let path = self.dir.path().join(name);
            init_repo(&path);
            fs::canonicalize(path).expect("canonicalize repo")
        }
    }

    fn repo_paths(folder: &FolderNode) -> Vec<String> {
        folder.repos.iter().map(|repo| repo.name.clone()).collect()
    }

    #[test]
    fn create_list_rename_delete() {
        let f = Fixture::new();
        let path = f.config();

        let created = create(&path, "  AgentFlow  ").unwrap();
        assert_eq!(created.name, "AgentFlow", "名称应去掉首尾空格");
        assert!(created.folders.is_empty());
        assert!(uuid::Uuid::parse_str(&created.id).is_ok(), "ID 应为 uuid v4");

        assert_eq!(list(&path).unwrap(), vec![created.clone()]);

        let renamed = rename(&path, &created.id, "AgentFlow 2").unwrap();
        assert_eq!(renamed.name, "AgentFlow 2");
        assert_eq!(list(&path).unwrap()[0].name, "AgentFlow 2");

        delete(&path, &created.id).unwrap();
        assert!(list(&path).unwrap().is_empty());
    }

    #[test]
    fn list_on_missing_config_is_empty() {
        let f = Fixture::new();
        assert!(list(&f.config()).unwrap().is_empty());
    }

    #[test]
    fn validates_project_name() {
        let f = Fixture::new();
        let path = f.config();

        assert!(matches!(create(&path, "   "), Err(AppError::Invalid(_))));
        assert!(matches!(create(&path, ""), Err(AppError::Invalid(_))));

        let long = "名".repeat(MAX_NAME_CHARS + 1);
        let err = create(&path, &long).unwrap_err();
        assert!(matches!(err, AppError::Invalid(_)));
        assert!(err.to_string().contains("64"));

        let exact = "名".repeat(MAX_NAME_CHARS);
        assert_eq!(create(&path, &exact).unwrap().name, exact);
    }

    #[test]
    fn missing_ids_return_not_found() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();
        let folder_dir = f.folder("work");

        assert!(matches!(rename(&path, "nope", "X"), Err(AppError::NotFound(_))));
        assert!(matches!(delete(&path, "nope"), Err(AppError::NotFound(_))));
        assert!(matches!(
            add_folder(&path, "nope", folder_dir.to_str().unwrap()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            remove_folder(&path, &project.id, "nope"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn add_folder_scans_nested_repos() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();

        let root = f.folder("root");
        init_repo(&root.join("web"));
        init_repo(&root.join("services/auth"));
        fs::create_dir_all(root.join("node_modules/skipped")).unwrap();

        let folder = add_folder(&path, &project.id, root.to_str().unwrap()).unwrap();
        assert!(folder.exists);
        assert!(!folder.is_repo);
        assert_eq!(folder.name, "root");
        assert_eq!(repo_paths(&folder), vec!["services/auth", "web"]);
        assert_eq!(folder.repos[0].path, root.join("services/auth").to_string_lossy());

        // 扫描结果不入库，list 重新扫描后一致
        let listed = list(&path).unwrap();
        assert_eq!(listed[0].folders.len(), 1);
        assert_eq!(repo_paths(&listed[0].folders[0]), vec!["services/auth", "web"]);
    }

    #[test]
    fn add_folder_that_is_itself_a_repo() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();
        let repo = f.repo("solo");

        let folder = add_folder(&path, &project.id, repo.to_str().unwrap()).unwrap();
        assert!(folder.is_repo);
        assert_eq!(folder.name, "solo");
        assert_eq!(repo_paths(&folder), vec!["solo"]);
        assert_eq!(folder.repos[0].path, repo.to_string_lossy());
    }

    #[test]
    fn rejects_duplicate_missing_and_file_paths() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();
        let dir = f.folder("dup");

        add_folder(&path, &project.id, dir.to_str().unwrap()).unwrap();
        let err = add_folder(&path, &project.id, dir.to_str().unwrap()).unwrap_err();
        assert!(matches!(err, AppError::Invalid(_)));
        assert!(err.to_string().contains("已在项目中"));

        // 同一路径的不同写法也算重复
        let trailing = format!("{}/", dir.to_str().unwrap());
        assert!(matches!(add_folder(&path, &project.id, &trailing), Err(AppError::Invalid(_))));

        let missing = f.dir.path().join("nope");
        assert!(matches!(
            add_folder(&path, &project.id, missing.to_str().unwrap()),
            Err(AppError::Invalid(_))
        ));

        let file = f.dir.path().join("file.txt");
        fs::write(&file, "x").unwrap();
        let err = add_folder(&path, &project.id, file.to_str().unwrap()).unwrap_err();
        assert!(err.to_string().contains("不是文件夹"), "{err}");

        // 失败不应写入配置
        assert_eq!(list(&path).unwrap()[0].folders.len(), 1);
    }

    #[test]
    fn remove_folder_keeps_other_folders() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();
        let a = f.folder("a");
        let b = f.folder("b");
        let first = add_folder(&path, &project.id, a.to_str().unwrap()).unwrap();
        add_folder(&path, &project.id, b.to_str().unwrap()).unwrap();

        remove_folder(&path, &project.id, &first.id).unwrap();
        let listed = list(&path).unwrap();
        assert_eq!(listed[0].folders.len(), 1);
        assert_eq!(listed[0].folders[0].name, "b");
    }

    #[test]
    fn deleted_folder_stays_but_is_marked_missing() {
        let f = Fixture::new();
        let path = f.config();
        let project = create(&path, "P").unwrap();
        let dir = f.folder("gone");
        init_repo(&dir.join("repo"));
        add_folder(&path, &project.id, dir.to_str().unwrap()).unwrap();

        fs::remove_dir_all(&dir).unwrap();
        let listed = list(&path).unwrap();
        let folder = &listed[0].folders[0];
        assert!(!folder.exists);
        assert!(folder.repos.is_empty());
        assert!(!folder.is_repo);
    }

    #[test]
    fn corrupt_config_is_reported_and_not_overwritten() {
        let f = Fixture::new();
        let path = f.config();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let broken = "{ \"version\": 1, \"projects\": [";
        fs::write(&path, broken).unwrap();

        assert!(matches!(list(&path), Err(AppError::Config(_))));
        assert!(matches!(create(&path, "P"), Err(AppError::Config(_))));
        assert_eq!(fs::read_to_string(&path).unwrap(), broken);
    }

    #[test]
    fn keeps_project_order_and_versions() {
        let f = Fixture::new();
        let path = f.config();
        create(&path, "A").unwrap();
        create(&path, "B").unwrap();
        let names: Vec<_> = list(&path).unwrap().into_iter().map(|project| project.name).collect();
        assert_eq!(names, vec!["A", "B"]);

        let raw: serde_json::Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(raw["version"], 1);
    }
}
