//! 仓库写操作互斥锁，避免并发写操作撞上 `index.lock`。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

static REPO_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> = OnceLock::new();

/// 在当前仓库的专属互斥锁保护下执行写操作
pub fn with_repo_lock<F, R>(repo_path: impl AsRef<Path>, f: F) -> R
where
    F: FnOnce() -> R,
{
    let repo_canonical = std::fs::canonicalize(repo_path.as_ref())
        .unwrap_or_else(|_| repo_path.as_ref().to_path_buf());
    let lock_arc = {
        let mut map = REPO_LOCKS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap();
        map.entry(repo_canonical)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = lock_arc.lock().unwrap();
    f()
}
