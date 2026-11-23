use crate::error::{blocking, AppError, AppResult};
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

struct SpawnedShell {
    session: Session,
    reader: Box<dyn Read + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Clone, Default)]
pub struct Sessions(Arc<Mutex<HashMap<String, Arc<Mutex<Session>>>>>);

impl Sessions {
    fn get(&self, id: &str) -> AppResult<Arc<Mutex<Session>>> {
        self.0
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::NotFound("终端会话已结束".into()))
    }

    pub fn clear(&self) {
        let sessions = std::mem::take(&mut *self.0.lock().unwrap());
        for session in sessions.into_values() {
            let _ = session.lock().unwrap().killer.kill();
        }
    }

    fn remove(&self, id: &str, terminate: bool) {
        let session = self.0.lock().unwrap().remove(id);
        if let Some(session) = session {
            if terminate {
                let _ = session.lock().unwrap().killer.kill();
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum TerminalEvent {
    Output(Vec<u8>),
    Exit,
}

fn size(cols: u16, rows: u16) -> AppResult<PtySize> {
    if cols == 0 || rows == 0 {
        return Err(AppError::invalid("终端尺寸无效"));
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn pty_error(err: impl std::fmt::Display) -> AppError {
    std::io::Error::other(format!("终端操作失败：{err}")).into()
}

fn spawn(repo: &Path, size: PtySize) -> AppResult<SpawnedShell> {
    if !repo.is_absolute() || !repo.join(".git").exists() {
        return Err(AppError::invalid("仓库目录无效"));
    }
    let pair = native_pty_system().openpty(size).map_err(pty_error)?;
    let reader = pair.master.try_clone_reader().map_err(pty_error)?;
    let writer = pair.master.take_writer().map_err(pty_error)?;
    let mut cmd = CommandBuilder::new_default_prog();
    cmd.cwd(repo);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(pty_error)?;
    Ok(SpawnedShell {
        session: Session {
            master: pair.master,
            writer,
            killer: child.clone_killer(),
        },
        reader,
        child,
    })
}

#[tauri::command]
pub async fn terminal_open(
    sessions: State<'_, Sessions>,
    repo_path: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> AppResult<String> {
    let sessions = sessions.inner().clone();
    blocking(move || {
        let SpawnedShell {
            session,
            mut reader,
            mut child,
        } = spawn(Path::new(&repo_path), size(cols, rows)?)?;
        let id = uuid::Uuid::new_v4().to_string();
        sessions
            .0
            .lock()
            .unwrap()
            .insert(id.clone(), Arc::new(Mutex::new(session)));
        // ConPTY 的输出管道会随控制台句柄关闭。先等待 shell 退出并释放 master，再读到 EOF。
        let finished = sessions.clone();
        let child_id = id.clone();
        std::thread::spawn(move || {
            let _ = child.wait();
            finished.remove(&child_id, false);
        });
        let reader_id = id.clone();
        std::thread::spawn(move || {
            let mut buf = [0; 8192];
            while let Ok(count) = reader.read(&mut buf) {
                if count == 0 {
                    break;
                }
                if on_event
                    .send(TerminalEvent::Output(buf[..count].to_vec()))
                    .is_err()
                {
                    sessions.remove(&reader_id, true);
                    break;
                }
            }

            let _ = on_event.send(TerminalEvent::Exit);
        });
        Ok(id)
    })
    .await
}

#[tauri::command]
pub async fn terminal_write(
    sessions: State<'_, Sessions>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    let session = sessions.get(&session_id)?;
    blocking(move || {
        let mut session = session.lock().unwrap();
        session.writer.write_all(data.as_bytes())?;
        session.writer.flush()?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn terminal_resize(
    sessions: State<'_, Sessions>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    let session = sessions.get(&session_id)?;
    let size = size(cols, rows)?;
    blocking(move || {
        session
            .lock()
            .unwrap()
            .master
            .resize(size)
            .map_err(pty_error)
    })
    .await
}

#[tauri::command]
pub async fn terminal_close(sessions: State<'_, Sessions>, session_id: String) -> AppResult<()> {
    let sessions = sessions.inner().clone();
    blocking(move || {
        sessions.remove(&session_id, true);
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::TempRepo;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn shells_read_from_their_own_repo_and_close() {
        let first = TempRepo::new();
        let second = TempRepo::new();
        let mut sessions = Vec::new();
        for repo in [&first, &second] {
            let marker = uuid::Uuid::new_v4().to_string();
            repo.write("marker.txt", &marker);
            let SpawnedShell {
                session,
                mut reader,
                child,
            } = spawn(repo.path(), size(80, 24).unwrap()).unwrap();
            let (done, output) = mpsc::channel();
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                let _ = reader.read_to_end(&mut bytes);
                let _ = done.send(String::from_utf8_lossy(&bytes).into_owned());
            });
            sessions.push((session, child, output, marker));
        }
        for (mut session, mut child, output, marker) in sessions {
            session.master.resize(size(90, 30).unwrap()).unwrap();
            let command = if cfg!(windows) {
                "type marker.txt\r\nexit\r\n"
            } else {
                "cat marker.txt; exit\n"
            };
            session.writer.write_all(command.as_bytes()).unwrap();
            session.writer.flush().unwrap();
            child.wait().unwrap();
            drop(session);
            assert!(output
                .recv_timeout(Duration::from_secs(12))
                .expect("shell exited")
                .contains(&marker));
        }
    }
}
