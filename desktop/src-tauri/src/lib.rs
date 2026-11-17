use serde::Serialize;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendInfo {
    host: String,
    port: u16,
    status: String,
    pid: Option<u32>,
    message: Option<String>,
}

impl Default for BackendInfo {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 0,
            status: "stopped".into(),
            pid: None,
            message: None,
        }
    }
}

#[derive(Default)]
struct BackendInner {
    child: Option<Child>,
    info: BackendInfo,
}

#[derive(Default)]
struct BackendManager {
    inner: Mutex<BackendInner>,
}

impl BackendManager {
    fn start(&self, app: &AppHandle) -> Result<BackendInfo, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Backend lock poisoned".to_string())?;
        if inner.child.is_some() {
            return Ok(inner.info.clone());
        }

        let port = reserve_port()?;
        let port_arg = port.to_string();
        let mut command = backend_command(app, &port_arg)?;
        let child = command
            .spawn()
            .map_err(|error| format!("Unable to start the FastAPI backend: {error}"))?;

        inner.info = BackendInfo {
            host: "127.0.0.1".into(),
            port,
            status: "starting".into(),
            pid: Some(child.id()),
            message: None,
        };
        inner.child = Some(child);
        Ok(inner.info.clone())
    }

    fn status(&self) -> BackendInfo {
        let Ok(mut inner) = self.inner.lock() else {
            return BackendInfo {
                status: "error".into(),
                message: Some("Backend lock poisoned".into()),
                ..BackendInfo::default()
            };
        };

        let exit = inner
            .child
            .as_mut()
            .and_then(|child| match child.try_wait() {
                Ok(Some(status)) => Some(Ok(status)),
                Ok(None) => None,
                Err(error) => Some(Err(error)),
            });
        if let Some(result) = exit {
            inner.child = None;
            inner.info.pid = None;
            match result {
                Ok(status) if status.success() => {
                    inner.info.status = "stopped".into();
                    inner.info.message = Some(format!("Backend exited with {status}"));
                }
                Ok(status) => {
                    inner.info.status = "error".into();
                    inner.info.message = Some(format!("Backend exited with {status}"));
                }
                Err(error) => {
                    inner.info.status = "error".into();
                    inner.info.message = Some(format!("Unable to inspect backend: {error}"));
                }
            }
        }
        inner.info.clone()
    }

    fn stop(&self) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if let Some(mut child) = inner.child.take() {
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                let _ = Command::new("taskkill")
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        inner.info.status = "stopped".into();
        inner.info.pid = None;
    }

    fn set_error(&self, message: String) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.info.status = "error".into();
            inner.info.message = Some(message);
        }
    }
}

fn reserve_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Unable to reserve a local port: {error}"))
        .and_then(|listener| {
            listener
                .local_addr()
                .map(|address| address.port())
                .map_err(|error| format!("Unable to read the local port: {error}"))
        })
}

fn backend_command(app: &AppHandle, port: &str) -> Result<Command, String> {
    let mut command;
    let mut log_path = None;
    if cfg!(debug_assertions) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .map(PathBuf::from)
            .ok_or_else(|| "Unable to locate the repository root".to_string())?;
        command = Command::new("uv");
        command.current_dir(root).args([
            "run",
            "--frozen",
            "--no-dev",
            "python",
            "-E",
            "-s",
            "server.py",
        ]);
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| format!("Unable to locate application resources: {error}"))?;
        let runtime = resource_dir.join("runtime");
        let app_root = runtime.join("app");
        #[cfg(windows)]
        let python = runtime.join("python").join("python.exe");
        #[cfg(not(windows))]
        let python = runtime.join("python").join("bin").join("python3");
        if !python.is_file() {
            return Err(format!(
                "Bundled Python runtime not found: {}",
                python.display()
            ));
        }

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Unable to locate the user data directory: {error}"))?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|error| format!("Unable to create the user data directory: {error}"))?;
        let log_dir = data_dir.join("log");
        std::fs::create_dir_all(&log_dir)
            .map_err(|error| format!("Unable to create the backend log directory: {error}"))?;
        log_path = Some(log_dir.join("backend.log"));

        command = Command::new(python);
        command
            .current_dir(&app_root)
            .args(["-E", "-s"])
            .arg(app_root.join("server.py"))
            .env("OAS_DATA_DIR", data_dir);
    }

    command
        .args(["--host", "127.0.0.1", "--port", port])
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONEXECUTABLE")
        .env_remove("PYTHONUSERBASE")
        .env_remove("PYTHONSTARTUP")
        .env_remove("PYTHONNOUSERSITE")
        .env_remove("PYTHONSAFEPATH")
        .env_remove("VIRTUAL_ENV")
        .env_remove("UV_PROJECT_ENVIRONMENT")
        .env_remove("UV_PYTHON")
        .env_remove("UV_SYSTEM_PYTHON")
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1");
    if let Some(path) = log_path {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|error| format!("Unable to open the backend log: {error}"))?;
        let stdout = file
            .try_clone()
            .map_err(|error| format!("Unable to clone the backend log handle: {error}"))?;
        command
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(file));
    } else {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(command)
}

#[tauri::command]
fn backend_status(state: State<'_, BackendManager>) -> BackendInfo {
    state.status()
}

#[tauri::command]
fn restart_backend(
    app: AppHandle,
    state: State<'_, BackendManager>,
) -> Result<BackendInfo, String> {
    state.stop();
    state.start(&app)
}

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let manager = BackendManager::default();
            if let Err(error) = manager.start(&app.handle()) {
                manager.set_error(error);
            }
            app.manage(manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_status, restart_backend])
        .build(tauri::generate_context!())
        .expect("error while building the OAS desktop application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. }) {
            app_handle.state::<BackendManager>().stop();
        }
    });
}
