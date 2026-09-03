//! Narrow filesystem access.
//!
//! The frontend has no general filesystem permission. It can only:
//!  * read and write files whose name ends in `.picta`, `.pictateam` or
//!    `.pictaset`,
//!  * ask whether given paths exist,
//!  * add supported local media files to the asset-protocol scope so the
//!    controller and presentation webviews may render them.
//!
//! The extension checks matter: they are what stops a `.picta` document from
//! widening Picta's own read scope to arbitrary files on the machine. A
//! document is data, never configuration for what Picta is allowed to touch.

use std::io::Write;
use std::path::{Path, PathBuf};

use tempfile::NamedTempFile;

use tauri::{Manager, Runtime};

/// Generous for a document that stores only paths, small enough that a
/// mistaken pick of a huge file cannot stall the app.
const MAX_PICTA_BYTES: u64 = 8 * 1024 * 1024;
const RECOVERY_FILE_NAME: &str = "recovery.json";

const IMAGE_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];
const VIDEO_EXTENSIONS: [&str; 2] = ["mp4", "webm"];
const DOCUMENT_EXTENSIONS: [&str; 3] = ["picta", "pictateam", "pictaset"];

fn extension_is(path: &Path, wanted: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| wanted.contains(&e.as_str()))
}

pub fn is_picta_path(path: &Path) -> bool {
    extension_is(path, &["picta"])
}

pub fn is_image_path(path: &Path) -> bool {
    extension_is(path, &IMAGE_EXTENSIONS)
}

pub fn is_video_path(path: &Path) -> bool {
    extension_is(path, &VIDEO_EXTENSIONS)
}

pub fn is_media_path(path: &Path) -> bool {
    is_image_path(path) || is_video_path(path)
}

fn is_document_path(path: &Path) -> bool {
    extension_is(path, &DOCUMENT_EXTENSIONS)
}

fn is_allowed_path(path: &Path) -> bool {
    is_document_path(path) || is_media_path(path)
}

/// Replace a file without ever truncating the previous contents first.
///
/// The temporary file is created beside the destination, written completely,
/// flushed to disk, and then persisted with tempfile's platform-aware atomic
/// replacement. A failed write or replacement drops the temporary file while
/// leaving the destination untouched.
fn replace_temporary(temporary: NamedTempFile, path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };

        let (file, temporary_path) = temporary.keep().map_err(|error| error.error)?;
        drop(file);
        let from: Vec<u16> = temporary_path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let to: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let moved = unsafe {
            MoveFileExW(
                from.as_ptr(),
                to.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if moved == 0 {
            let error = std::io::Error::last_os_error();
            let _ = std::fs::remove_file(temporary_path);
            return Err(error);
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        temporary
            .persist(path)
            .map(|_| ())
            .map_err(|error| error.error)
    }
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    atomic_write_with(path, contents, replace_temporary)
}

fn atomic_write_with(
    path: &Path,
    contents: &str,
    replace: impl FnOnce(NamedTempFile, &Path) -> std::io::Result<()>,
) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let mut temporary = tempfile::Builder::new()
        .prefix(".picta-write-")
        .tempfile_in(parent)
        .map_err(|error| {
            format!(
                "Could not create a temporary file for {}: {error}",
                path.display()
            )
        })?;

    temporary
        .write_all(contents.as_bytes())
        .map_err(|error| format!("Could not write the new contents: {error}"))?;
    temporary
        .flush()
        .map_err(|error| format!("Could not flush the new contents: {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Could not flush the new contents to disk: {error}"))?;
    replace(temporary, path)
        .map_err(|error| format!("Could not replace {}: {error}", path.display()))?;

    // Directory metadata is what makes the rename durable after a power loss
    // on Unix. It is not available uniformly on Windows, so this is best effort.
    #[cfg(unix)]
    if let Ok(directory) = std::fs::File::open(parent) {
        let _ = directory.sync_all();
    }

    Ok(())
}

pub fn read_picta(path: &str) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_picta_path(&path) {
        return Err("Picta can only open .picta files.".to_string());
    }
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Could not open this file: {e}"))?;
    if !metadata.is_file() {
        return Err("That path is not a file.".to_string());
    }
    if metadata.len() > MAX_PICTA_BYTES {
        return Err("That file is too large to be a Picta file.".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read this file: {e}"))
}

pub fn read_document(path: &str) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_document_path(&path) {
        return Err("Picta can only open .picta, .pictateam or .pictaset files.".to_string());
    }
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("Could not open this file: {e}"))?;
    if !metadata.is_file() {
        return Err("That path is not a file.".to_string());
    }
    if metadata.len() > MAX_PICTA_BYTES {
        return Err("That file is too large for a Picta data file.".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("Could not read this file: {e}"))
}

pub fn write_picta(path: &str, contents: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_picta_path(&path) {
        return Err("Picta can only save .picta files.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err("That folder no longer exists.".to_string());
        }
    }
    if contents.len() as u64 > MAX_PICTA_BYTES {
        return Err("That Picta file is too large.".to_string());
    }
    atomic_write(&path, contents)
}

pub fn write_document(path: &str, contents: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_document_path(&path) {
        return Err("Picta can only save .picta, .pictateam or .pictaset files.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err("That folder no longer exists.".to_string());
        }
    }
    if contents.len() as u64 > MAX_PICTA_BYTES {
        return Err("That Picta data file is too large.".to_string());
    }
    atomic_write(&path, contents)
}

/// Reveal one of Picta's own document files in the platform file manager.
/// This is deliberately narrower than a generic shell/open command.
pub fn reveal_path(path: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !is_document_path(&path) {
        return Err("Picta can only reveal .picta, .pictateam or .pictaset files.".to_string());
    }
    if !path.is_file() {
        return Err("That Picta file no longer exists.".to_string());
    }

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .status();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open")
        .arg(path.parent().unwrap_or_else(|| Path::new(".")))
        .status();

    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("The file manager returned {status}.")),
        Err(error) => Err(format!("Could not open the file manager: {error}")),
    }
}

pub fn paths_exist(paths: &[String]) -> Vec<bool> {
    paths
        .iter()
        .map(|p| {
            let path = Path::new(p);
            is_allowed_path(path) && path.is_file()
        })
        .collect()
}

/// Let the webviews render these supported local media files, and nothing else.
pub fn allow_media<R: Runtime>(app: &tauri::AppHandle<R>, paths: &[String]) -> Result<(), String> {
    let scope = app.asset_protocol_scope();
    for raw in paths {
        let path = Path::new(raw);
        if !is_media_path(path) {
            // Silently skipping would be worse: the media would render as
            // nothing with no explanation.
            return Err(format!(
                "{} is not a supported local media type.",
                path.file_name().and_then(|n| n.to_str()).unwrap_or(raw)
            ));
        }
        scope
            .allow_file(path)
            .map_err(|e| format!("Could not open {raw}: {e}"))?;
    }
    Ok(())
}

/// Kept as a small compatibility wrapper for older frontend builds.
pub fn allow_images<R: Runtime>(app: &tauri::AppHandle<R>, paths: &[String]) -> Result<(), String> {
    allow_media(app, paths)
}

// ---------------------------------------------------------------------------
// Machine-specific preferences
// ---------------------------------------------------------------------------
//
// Deliberately not a database and deliberately not part of `.picta`: these are
// facts about this computer (which monitor, where the window sits, which folder
// was last used), and carrying them inside a document would be actively wrong
// when that document is opened on another machine.

fn prefs_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not locate the settings folder: {e}"))?;
    Ok(dir.join("preferences.json"))
}

pub fn load_prefs<R: Runtime>(app: &tauri::AppHandle<R>) -> serde_json::Value {
    let Ok(path) = prefs_path(app) else {
        return serde_json::Value::Null;
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return serde_json::Value::Null;
    };
    // A corrupt preferences file must never stop Picta from starting.
    serde_json::from_str(&text).unwrap_or(serde_json::Value::Null)
}

pub fn save_prefs<R: Runtime>(
    app: &tauri::AppHandle<R>,
    value: &serde_json::Value,
) -> Result<(), String> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create the settings folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    atomic_write(&path, &text).map_err(|e| format!("Could not save settings: {e}"))
}

// ---------------------------------------------------------------------------
// Machine-local crash recovery
// ---------------------------------------------------------------------------

fn recovery_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not locate the recovery folder: {e}"))?;
    Ok(dir.join(RECOVERY_FILE_NAME))
}

/// Recovery is deliberately a JSON value behind a separate native command. It
/// is never part of a public `.picta`, `.pictateam`, or `.pictaset` file.
pub fn load_recovery<R: Runtime>(app: &tauri::AppHandle<R>) -> serde_json::Value {
    let Ok(path) = recovery_path(app) else {
        return serde_json::Value::Null;
    };
    let Ok(metadata) = std::fs::metadata(&path) else {
        return serde_json::Value::Null;
    };
    if !metadata.is_file() || metadata.len() > MAX_PICTA_BYTES {
        return serde_json::Value::Null;
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return serde_json::Value::Null;
    };
    // Corrupt recovery is disposable data, never a startup blocker.
    serde_json::from_str(&text).unwrap_or(serde_json::Value::Null)
}

pub fn save_recovery<R: Runtime>(
    app: &tauri::AppHandle<R>,
    value: &serde_json::Value,
) -> Result<(), String> {
    let path = recovery_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create the recovery folder: {e}"))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Could not encode recovery data: {e}"))?;
    if text.len() as u64 > MAX_PICTA_BYTES {
        return Err("Recovery data is too large.".to_string());
    }
    atomic_write(&path, &text).map_err(|e| format!("Could not save recovery data: {e}"))
}

pub fn clear_recovery<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let path = recovery_path(app)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not discard recovery data: {error}")),
    }
}

/// A `.picta` path passed on the command line, if any.
///
/// Structured so an installed build could later register a file association
/// without any change here; the portable build simply never receives one.
pub fn startup_file() -> Option<String> {
    std::env::args().skip(1).find_map(|arg| {
        if arg.starts_with('-') {
            return None;
        }
        let path = PathBuf::from(&arg);
        if is_picta_path(&path) && path.is_file() {
            std::fs::canonicalize(&path)
                .map(|p| p.to_string_lossy().to_string())
                .ok()
                .or(Some(arg))
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn recognises_picta_files_case_insensitively() {
        assert!(is_picta_path(Path::new("/tmp/Show.picta")));
        assert!(is_picta_path(Path::new("/tmp/Show.PICTA")));
        assert!(!is_picta_path(Path::new("/tmp/Show.json")));
        assert!(!is_picta_path(Path::new("/tmp/picta")));
    }

    #[test]
    fn recognises_supported_images_only() {
        for good in ["a.png", "a.PNG", "a.jpg", "a.jpeg", "a.webp"] {
            assert!(is_image_path(Path::new(good)), "{good}");
        }
        for bad in ["a.gif", "a.mp4", "a.pdf", "a.exe", "a.svg", "a"] {
            assert!(!is_image_path(Path::new(bad)), "{bad}");
        }
    }

    #[test]
    fn recognises_supported_videos_and_documents_only() {
        for good in [
            "clip.mp4",
            "clip.MP4",
            "clip.webm",
            "show.picta",
            "team.pictateam",
            "ads.pictaset",
        ] {
            assert!(is_allowed_path(Path::new(good)), "{good}");
        }
        for bad in ["clip.mov", "clip.avi", "clip.mkv", "show.json", "photo.svg"] {
            assert!(!is_allowed_path(Path::new(bad)), "{bad}");
        }
    }

    #[test]
    fn refuses_to_read_non_picta_paths() {
        let result = read_picta("/etc/hosts");
        assert!(result.is_err());
    }

    #[test]
    fn refuses_to_write_non_picta_paths() {
        let result = write_picta("/tmp/picta-test-output.txt", "{}");
        assert!(result.is_err());
    }

    #[test]
    fn refuses_to_read_or_write_arbitrary_document_extensions() {
        assert!(read_document("/etc/hosts").is_err());
        assert!(write_document("/tmp/picta-test-output.json", "{}").is_err());
    }

    #[test]
    fn missing_paths_report_as_missing() {
        let results = paths_exist(&["/definitely/not/here.png".to_string()]);
        assert_eq!(results, vec![false]);
    }

    #[test]
    fn writes_new_picta_documents() {
        let directory = tempdir().expect("temporary test directory");
        for extension in DOCUMENT_EXTENSIONS {
            let path = directory.path().join(format!("new.{extension}"));
            let text = format!("{{\"extension\":\"{extension}\"}}");
            write_document(path.to_str().expect("UTF-8 test path"), &text).expect("write document");
            assert_eq!(fs::read_to_string(&path).expect("read document"), text);
        }
        let show = directory.path().join("compat.picta");
        write_picta(show.to_str().expect("UTF-8 test path"), "compat")
            .expect("write compatibility document");
        assert_eq!(
            fs::read_to_string(show).expect("read compatibility document"),
            "compat"
        );
    }

    #[test]
    fn replaces_an_existing_document_without_partial_contents() {
        let directory = tempdir().expect("temporary test directory");
        let path = directory.path().join("replace.pictaset");
        fs::write(&path, "old contents").expect("seed document");

        write_document(path.to_str().expect("UTF-8 test path"), "new contents")
            .expect("replace document");
        assert_eq!(
            fs::read_to_string(&path).expect("read replacement"),
            "new contents"
        );
    }

    #[test]
    fn replacement_failure_keeps_the_original_path_intact() {
        let directory = tempdir().expect("temporary test directory");
        let destination = directory.path().join("original.picta");
        fs::write(&destination, "keep me").expect("seed destination");

        let result = atomic_write_with(&destination, "new", |_temporary, _path| {
            Err(std::io::Error::other("injected replacement failure"))
        });
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(&destination).expect("read original document"),
            "keep me"
        );
        assert!(fs::read_dir(directory.path())
            .expect("read temporary directory")
            .flatten()
            .all(|entry| !entry
                .file_name()
                .to_string_lossy()
                .starts_with(".picta-write-")));
    }

    #[test]
    fn successful_save_leaves_no_temporary_files() {
        let directory = tempdir().expect("temporary test directory");
        let path = directory.path().join("clean.pictateam");
        write_document(path.to_str().expect("UTF-8 test path"), "complete")
            .expect("write document");
        assert!(fs::read_dir(directory.path())
            .expect("read temporary directory")
            .flatten()
            .all(|entry| !entry
                .file_name()
                .to_string_lossy()
                .starts_with(".picta-write-")));
    }
}
