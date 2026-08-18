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

use std::path::{Path, PathBuf};

use tauri::{Manager, Runtime};

/// Generous for a document that stores only paths, small enough that a
/// mistaken pick of a huge file cannot stall the app.
const MAX_PICTA_BYTES: u64 = 8 * 1024 * 1024;

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

pub fn is_team_path(path: &Path) -> bool {
    extension_is(path, &["pictateam"])
}

pub fn is_media_set_path(path: &Path) -> bool {
    extension_is(path, &["pictaset"])
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
    let metadata = std::fs::metadata(&path).map_err(|e| format!("Could not open this file: {e}"))?;
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
    std::fs::write(&path, contents).map_err(|e| format!("Could not save this file: {e}"))
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
    std::fs::write(&path, contents).map_err(|e| format!("Could not save this file: {e}"))
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
    let result = std::process::Command::new("open").arg("-R").arg(&path).status();
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
    std::fs::write(path, text).map_err(|e| format!("Could not save settings: {e}"))
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
}
