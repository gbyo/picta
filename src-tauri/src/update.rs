//! Checking whether a newer Picta has been released.
//!
//! Deliberately the smallest thing that is useful: Picta asks GitHub what the
//! latest release is, compares it to its own version, and tells the operator.
//! It never downloads or runs anything. Replacing the executable stays a
//! deliberate human act, which is the right trade for a portable program that
//! often runs on machines the operator does not own.
//!
//! The request is made here in Rust rather than in the webview so the frontend
//! keeps no network capability at all and the Content Security Policy stays
//! closed.

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Where to ask. A compile-time constant: nothing in a `.picta` file, a
/// preference or the webview can redirect this request somewhere else.
const RELEASES_API: &str = "https://api.github.com/repos/gbyo/picta/releases/latest";
/// Where to send the operator to read about and download a release.
const RELEASES_PAGE: &str = "https://github.com/gbyo/picta/releases/latest";

const TIMEOUT: Duration = Duration::from_secs(10);
/// A release note that is longer than this is almost certainly not one.
const MAX_RESPONSE_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    /// True only when a strictly newer, non-prerelease version exists.
    pub available: bool,
    /// The version Picta is currently running.
    pub current_version: String,
    /// The latest released version, when it could be determined.
    pub latest_version: Option<String>,
    /// The page to open so the operator can read notes and download.
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// Strip a leading `v` and parse. Tags are written `v1.2.3`; versions are not.
fn parse_version(text: &str) -> Option<semver::Version> {
    let trimmed = text.trim();
    let stripped = trimmed.strip_prefix('v').unwrap_or(trimmed);
    semver::Version::parse(stripped).ok()
}

/// Compare two already-parsed versions. Split out so the decision is testable
/// without a network.
fn is_newer(latest: &semver::Version, current: &semver::Version) -> bool {
    // A prerelease is never offered over a release, and equal versions are not
    // an update.
    if !latest.pre.is_empty() {
        return false;
    }
    latest > current
}

/// Ask GitHub for the latest release. Any failure — offline, blocked by a
/// firewall, rate limited, unparseable — is reported as "no update known",
/// never as an error the operator has to deal with. A venue machine with no
/// internet must behave exactly as before.
#[tauri::command]
pub async fn check_for_update() -> UpdateStatus {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let mut status = UpdateStatus {
        available: false,
        current_version: current_version.clone(),
        latest_version: None,
        url: RELEASES_PAGE.to_string(),
    };

    let Some(current) = parse_version(&current_version) else {
        return status;
    };

    let client = match reqwest::Client::builder()
        .timeout(TIMEOUT)
        .connect_timeout(TIMEOUT)
        // GitHub rejects requests without one.
        .user_agent(concat!("Picta/", env!("CARGO_PKG_VERSION")))
        .build()
    {
        Ok(client) => client,
        Err(_) => return status,
    };

    let response = match client
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response,
        _ => return status,
    };

    // Read with a ceiling rather than trusting Content-Length.
    let body = match response.bytes().await {
        Ok(bytes) if bytes.len() <= MAX_RESPONSE_BYTES => bytes,
        _ => return status,
    };

    let Ok(release) = serde_json::from_slice::<GithubRelease>(&body) else {
        return status;
    };
    if release.draft || release.prerelease {
        return status;
    }

    let Some(latest) = parse_version(&release.tag_name) else {
        return status;
    };

    status.available = is_newer(&latest, &current);
    status.latest_version = Some(latest.to_string());
    status
}

/// Open the releases page in the operator's browser.
///
/// Takes no argument on purpose: the frontend cannot ask Picta to open an
/// arbitrary URL, only this one.
#[tauri::command]
pub fn open_releases_page() -> Result<(), String> {
    open_url(RELEASES_PAGE)
}

#[cfg(target_os = "windows")]
fn open_url(url: &str) -> Result<(), String> {
    // `start` is a cmd builtin; the empty title argument keeps a URL containing
    // spaces from being read as the window title.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn open_url(url: &str) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(text: &str) -> semver::Version {
        parse_version(text).expect("valid version")
    }

    #[test]
    fn accepts_tags_with_and_without_a_leading_v() {
        assert_eq!(v("v1.2.3"), v("1.2.3"));
        assert_eq!(v(" v1.2.3 ").to_string(), "1.2.3");
    }

    #[test]
    fn rejects_tags_that_are_not_versions() {
        assert!(parse_version("latest").is_none());
        assert!(parse_version("").is_none());
        assert!(parse_version("v1").is_none());
    }

    #[test]
    fn offers_only_strictly_newer_releases() {
        assert!(is_newer(&v("1.1.0"), &v("1.0.0")));
        assert!(is_newer(&v("1.0.1"), &v("1.0.0")));
        assert!(is_newer(&v("2.0.0"), &v("1.9.9")));
        assert!(!is_newer(&v("1.0.0"), &v("1.0.0")));
        assert!(!is_newer(&v("0.9.0"), &v("1.0.0")));
    }

    #[test]
    fn never_offers_a_prerelease() {
        assert!(!is_newer(&v("2.0.0-rc.1"), &v("1.0.0")));
    }

    #[test]
    fn compares_numerically_not_as_text() {
        // The mistake that tells someone 1.9.0 is newer than 1.10.0.
        assert!(is_newer(&v("1.10.0"), &v("1.9.0")));
        assert!(!is_newer(&v("1.9.0"), &v("1.10.0")));
    }
}
