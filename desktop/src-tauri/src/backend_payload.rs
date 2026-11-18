//! Versioned backend payloads for the desktop shell.
//!
//! Layout (under the app data directory):
//!
//! ```text
//! payload/
//!   current.json                 {"version": "...", "previous": "...", "activated_at": "..."}
//!   app/<version>/               extracted payload (server.py, module, tasks, ...)
//!   staging/<version>-<epoch>/   temporary extraction
//!   backup/<version>-<epoch>/    replaced version, kept for diagnosis
//! ```
//!
//! The bundled `runtime/app` is always the fallback. `current.json` is only
//! written after a payload has been verified and extracted, so a broken payload
//! cannot change the normal startup path.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const MAX_UNCOMPRESSED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

fn public_key() -> Option<&'static str> {
    option_env!("OAS_BACKEND_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PayloadVersion {
    pub version: String,
    pub path: String,
    pub active: bool,
    pub installed_at: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PayloadStatus {
    pub source: String,
    pub current_version: Option<String>,
    pub bundled_version: Option<String>,
    pub payload_root: String,
    pub versions: Vec<PayloadVersion>,
    pub signature_required: bool,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct PayloadPointer {
    pub version: String,
    pub previous: Option<String>,
    pub activated_at: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct PayloadManifest {
    pub version: String,
    pub file: String,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub signature: Option<String>,
}

pub struct ResolvedApp {
    pub path: PathBuf,
    pub source: String,
    pub version: Option<String>,
}

pub fn payload_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("payload"))
        .map_err(|error| format!("Unable to locate the user data directory: {error}"))
}

pub fn bundled_app_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|path| path.join("runtime").join("app"))
        .map_err(|error| format!("Unable to locate application resources: {error}"))
}

fn validate_version(version: &str) -> Result<(), String> {
    if version.is_empty() || version.len() > 64 {
        return Err("Payload version must be 1-64 characters".into());
    }
    if !version
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_'))
    {
        return Err(
            "Payload version may only contain ASCII letters, digits, '.', '-' and '_'".into(),
        );
    }
    Ok(())
}

fn epoch() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

pub fn read_pointer(app: &AppHandle) -> Result<Option<PayloadPointer>, String> {
    let path = payload_root(app)?.join("current.json");
    if !path.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    let pointer = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid {}: {error}", path.display()))?;
    Ok(Some(pointer))
}

fn write_pointer(app: &AppHandle, pointer: &PayloadPointer) -> Result<(), String> {
    let root = payload_root(app)?;
    fs::create_dir_all(&root).map_err(|error| format!("Unable to create payload root: {error}"))?;
    let path = root.join("current.json");
    let temporary = root.join("current.json.tmp");
    let text = serde_json::to_vec_pretty(pointer)
        .map_err(|error| format!("Unable to serialize payload pointer: {error}"))?;
    fs::write(&temporary, text)
        .map_err(|error| format!("Unable to write {}: {error}", temporary.display()))?;
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Unable to activate {}: {error}", path.display()))
}

pub fn clear_pointer(app: &AppHandle) -> Result<(), String> {
    let root = payload_root(app)?;
    let path = root.join("current.json");
    if !path.exists() {
        return Ok(());
    }
    let backup = root.join(format!("current.json.bak-{}", epoch()));
    fs::rename(&path, &backup)
        .map_err(|error| format!("Unable to clear {}: {error}", path.display()))
}

pub fn active_version(app: &AppHandle) -> Result<Option<String>, String> {
    let Some(pointer) = read_pointer(app)? else {
        return Ok(None);
    };
    if validate_version(&pointer.version).is_err() {
        return Ok(None);
    }
    let directory = payload_root(app)?.join("app").join(&pointer.version);
    if directory.join("server.py").is_file() {
        Ok(Some(pointer.version))
    } else {
        Ok(None)
    }
}

fn read_build_info_version(app_root: &Path) -> Option<String> {
    let text = fs::read_to_string(app_root.join("BUILD_INFO.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value
        .get("version")
        .and_then(|version| version.as_str())
        .map(str::to_string)
}

pub fn resolve_app_root(app: &AppHandle) -> Result<ResolvedApp, String> {
    let bundled = bundled_app_root(app)?;
    if let Some(version) = active_version(app)? {
        let path = payload_root(app)?.join("app").join(&version);
        return Ok(ResolvedApp {
            path,
            source: "payload".into(),
            version: Some(version),
        });
    }
    Ok(ResolvedApp {
        version: read_build_info_version(&bundled),
        path: bundled,
        source: "bundled".into(),
    })
}

pub fn status(app: &AppHandle) -> Result<PayloadStatus, String> {
    let root = payload_root(app)?;
    let bundled = bundled_app_root(app)?;
    let pointer = read_pointer(app).ok().flatten();
    let active = active_version(app)?;

    let mut versions = Vec::new();
    let app_root = root.join("app");
    if app_root.is_dir() {
        let entries = fs::read_dir(&app_root)
            .map_err(|error| format!("Unable to read {}: {error}", app_root.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || !path.join("server.py").is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if validate_version(name).is_err() {
                continue;
            }
            let installed_at = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs().to_string());
            versions.push(PayloadVersion {
                version: name.to_string(),
                path: path.display().to_string(),
                active: active.as_deref() == Some(name),
                installed_at,
            });
        }
    }
    versions.sort_by(|left, right| left.version.cmp(&right.version));

    let message = if active.is_none() && pointer.is_some() {
        Some("current.json 指向的版本不存在，已回退到内置载荷".into())
    } else {
        None
    };

    Ok(PayloadStatus {
        source: if active.is_some() {
            "payload"
        } else {
            "bundled"
        }
        .into(),
        current_version: active,
        bundled_version: read_build_info_version(&bundled),
        payload_root: root.display().to_string(),
        versions,
        signature_required: public_key().is_some(),
        message,
    })
}

pub fn read_manifest(source_dir: &Path) -> Result<(PayloadManifest, PathBuf), String> {
    let mut manifests = fs::read_dir(source_dir)
        .map_err(|error| format!("Unable to read {}: {error}", source_dir.display()))?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.ends_with(".manifest.json"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    manifests.sort();
    if manifests.len() > 1 {
        return Err(format!(
            "Multiple *.manifest.json files found in {}, please keep one payload per directory",
            source_dir.display()
        ));
    }
    let manifest_path = manifests
        .into_iter()
        .next()
        .ok_or_else(|| format!("No *.manifest.json found in {}", source_dir.display()))?;
    let text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Unable to read {}: {error}", manifest_path.display()))?;
    let manifest: PayloadManifest = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid {}: {error}", manifest_path.display()))?;
    validate_version(&manifest.version)?;
    Ok((manifest, manifest_path))
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("Unable to open {}: {error}", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Unable to hash {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn verify_signature(manifest: &PayloadManifest) -> Result<(), String> {
    let Some(configured) = public_key() else {
        return Ok(());
    };
    let signature = manifest.signature.as_deref().ok_or_else(|| {
        "Payload is unsigned but OAS_BACKEND_PUBLIC_KEY is configured".to_string()
    })?;
    let key_bytes = BASE64
        .decode(configured)
        .map_err(|error| format!("Invalid OAS_BACKEND_PUBLIC_KEY: {error}"))?;
    let key_array: [u8; 32] = key_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "OAS_BACKEND_PUBLIC_KEY must decode to 32 bytes".to_string())?;
    let key = VerifyingKey::from_bytes(&key_array)
        .map_err(|error| format!("Invalid Ed25519 public key: {error}"))?;
    let signature_bytes = BASE64
        .decode(signature)
        .map_err(|error| format!("Invalid payload signature: {error}"))?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|error| format!("Invalid payload signature: {error}"))?;
    let subject = format!("{}:{}", manifest.version, manifest.sha256);
    key.verify(subject.as_bytes(), &signature)
        .map_err(|_| "Payload signature verification failed".to_string())
}

pub fn verify_and_open_zip(
    source_dir: &Path,
    manifest: &PayloadManifest,
) -> Result<PathBuf, String> {
    if Path::new(&manifest.file)
        .file_name()
        .and_then(|name| name.to_str())
        != Some(manifest.file.as_str())
    {
        return Err("manifest file must be a plain file name".into());
    }
    let zip_path = source_dir.join(&manifest.file);
    let metadata = fs::metadata(&zip_path)
        .map_err(|error| format!("Unable to read {}: {error}", zip_path.display()))?;
    if metadata.len() != manifest.size {
        return Err(format!(
            "Payload size mismatch: expected {}, got {}",
            manifest.size,
            metadata.len()
        ));
    }
    let digest = sha256_file(&zip_path)?;
    if !digest.eq_ignore_ascii_case(&manifest.sha256) {
        return Err("Payload sha256 mismatch".into());
    }
    verify_signature(manifest)?;
    Ok(zip_path)
}

fn extract_zip(zip_path: &Path, target: &Path) -> Result<(), String> {
    let file = File::open(zip_path)
        .map_err(|error| format!("Unable to open {}: {error}", zip_path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("Invalid payload zip {}: {error}", zip_path.display()))?;
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Unable to read payload entry: {error}"))?;
        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                return Err(format!(
                    "Payload contains a symbolic link: {}",
                    entry.name()
                ));
            }
        }
        total = total.saturating_add(entry.size());
        if total > MAX_UNCOMPRESSED_BYTES {
            return Err("Payload is too large".into());
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("Unsafe path in payload: {}", entry.name()))?;
        let destination = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination)
                .map_err(|error| format!("Unable to create {}: {error}", destination.display()))?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Unable to create {}: {error}", parent.display()))?;
        }
        let mut output = File::create(&destination)
            .map_err(|error| format!("Unable to write {}: {error}", destination.display()))?;
        io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Unable to extract {}: {error}", destination.display()))?;
    }
    Ok(())
}

pub fn extract_payload(
    app: &AppHandle,
    zip_path: &Path,
    manifest: &PayloadManifest,
) -> Result<PathBuf, String> {
    let root = payload_root(app)?;
    let apps = root.join("app");
    fs::create_dir_all(&apps)
        .map_err(|error| format!("Unable to create {}: {error}", apps.display()))?;
    let staging = root
        .join("staging")
        .join(format!("{}-{}", manifest.version, epoch()));
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Unable to create {}: {error}", staging.display()))?;

    if let Err(error) = extract_zip(zip_path, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    if !staging.join("server.py").is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err("Payload does not contain server.py".into());
    }

    let target = apps.join(&manifest.version);
    let backup = if target.exists() {
        let backup = root
            .join("backup")
            .join(format!("{}-{}", manifest.version, epoch()));
        fs::create_dir_all(backup.parent().unwrap_or(root.as_path()))
            .map_err(|error| format!("Unable to create payload backup: {error}"))?;
        fs::rename(&target, &backup)
            .map_err(|error| format!("Unable to back up the current payload: {error}"))?;
        Some(backup)
    } else {
        None
    };
    if let Err(error) = fs::rename(&staging, &target) {
        let _ = fs::remove_dir_all(&staging);
        if let Some(backup) = &backup {
            let _ = fs::rename(backup, &target);
        }
        return Err(format!("Unable to activate the extracted payload: {error}"));
    }
    Ok(target)
}

pub fn activate(app: &AppHandle, version: &str) -> Result<(), String> {
    validate_version(version)?;
    let target = payload_root(app)?.join("app").join(version);
    if !target.join("server.py").is_file() {
        return Err(format!("Payload version {version} is not installed"));
    }
    let previous = active_version(app)?;
    write_pointer(
        app,
        &PayloadPointer {
            version: version.to_string(),
            previous,
            activated_at: Some(epoch()),
        },
    )
}

pub fn restore_pointer(app: &AppHandle, version: Option<&str>) -> Result<(), String> {
    match version {
        Some(version) => {
            validate_version(version)?;
            write_pointer(
                app,
                &PayloadPointer {
                    version: version.to_string(),
                    previous: None,
                    activated_at: Some(epoch()),
                },
            )
        }
        None => clear_pointer(app),
    }
}

pub fn current_pointer_version(app: &AppHandle) -> Result<Option<String>, String> {
    Ok(read_pointer(app)?.map(|pointer| pointer.version))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_validation_rejects_traversal() {
        assert!(validate_version("0.1.0-dev.1").is_ok());
        assert!(validate_version("../evil").is_err());
        assert!(validate_version("a/b").is_err());
        assert!(validate_version("").is_err());
    }
}
