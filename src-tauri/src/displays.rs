//! Monitor enumeration.
//!
//! Everything the frontend knows about monitors comes from here. The important
//! part is `id`: it is derived from the monitor's own attributes rather than
//! from its position in the OS array, because that array is reshuffled the
//! moment a cable is unplugged.

use serde::{Deserialize, Serialize};
use tauri::{Manager, Monitor, Runtime};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    /// Stable within one enumeration. Derived from name/size/scale plus an
    /// ordinal so that two identical monitors still get distinct ids.
    pub id: String,
    /// 1-based number shown in the UI and by Identify Displays.
    pub index: usize,
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Raw monitor attributes, before ordering and id assignment.
#[derive(Debug, Clone, PartialEq)]
pub struct RawMonitor {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

impl RawMonitor {
    fn fingerprint(&self) -> String {
        format!(
            "{}|{}x{}@{}",
            self.name.as_deref().unwrap_or(""),
            self.width,
            self.height,
            format_scale(self.scale_factor)
        )
    }
}

/// Scale factors arrive as floats; round to 4 decimals so `1.2500000001` and
/// `1.25` are the same display across sessions.
fn format_scale(scale: f64) -> String {
    format!("{:.4}", scale)
}

fn from_monitor(monitor: &Monitor, primary: Option<&Monitor>) -> RawMonitor {
    let size = monitor.size();
    let position = monitor.position();
    let is_primary = primary.is_some_and(|p| {
        p.position() == position && p.size() == size && p.name() == monitor.name()
    });
    RawMonitor {
        name: monitor
            .name()
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty()),
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        scale_factor: monitor.scale_factor(),
        is_primary,
    }
}

/// Deterministic ordering: left to right, then top to bottom, then by name.
///
/// Sorting by reported position (rather than by enumeration order) keeps
/// "Display 2" pointing at the same screen for as long as nothing is plugged or
/// unplugged, and it handles negative coordinates, stacked and mixed-DPI
/// arrangements without any special cases.
pub fn order_and_identify(mut monitors: Vec<RawMonitor>) -> Vec<DisplayInfo> {
    monitors.sort_by(|a, b| {
        a.x.cmp(&b.x)
            .then(a.y.cmp(&b.y))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.width.cmp(&b.width))
            .then_with(|| a.height.cmp(&b.height))
    });

    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| {
            let fingerprint = m.fingerprint();
            let ordinal = seen.entry(fingerprint.clone()).or_insert(0);
            let id = format!("{}#{}", fingerprint, ordinal);
            *ordinal += 1;
            DisplayInfo {
                id,
                index: i + 1,
                name: m.name,
                width: m.width,
                height: m.height,
                x: m.x,
                y: m.y,
                scale_factor: m.scale_factor,
                is_primary: m.is_primary,
            }
        })
        .collect()
}

/// Enumerate the monitors attached right now.
///
/// Requires a window handle because that is how Tauri reaches the platform
/// monitor APIs; the controller window is always present while Picta runs.
pub fn enumerate<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<Vec<DisplayInfo>, String> {
    let window = app
        .get_webview_window(crate::MAIN_WINDOW)
        .ok_or_else(|| "Picta's controller window is not available.".to_string())?;

    let primary = window.primary_monitor().map_err(err)?;
    let monitors = window.available_monitors().map_err(err)?;
    let raw = monitors
        .iter()
        .map(|m| from_monitor(m, primary.as_ref()))
        .collect();
    Ok(order_and_identify(raw))
}

pub fn find<'a>(displays: &'a [DisplayInfo], id: &str) -> Option<&'a DisplayInfo> {
    displays.iter().find(|d| d.id == id)
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(name: &str, w: u32, h: u32, x: i32, y: i32, scale: f64) -> RawMonitor {
        RawMonitor {
            name: Some(name.to_string()),
            width: w,
            height: h,
            x,
            y,
            scale_factor: scale,
            is_primary: false,
        }
    }

    #[test]
    fn orders_left_to_right_including_negative_coordinates() {
        let displays = order_and_identify(vec![
            raw("Right", 1920, 1080, 2560, 0, 1.0),
            raw("Left", 1920, 1080, -1920, 0, 1.0),
            raw("Middle", 2560, 1440, 0, 0, 1.0),
        ]);
        let names: Vec<_> = displays.iter().map(|d| d.name.clone().unwrap()).collect();
        assert_eq!(names, vec!["Left", "Middle", "Right"]);
        assert_eq!(displays[0].index, 1);
        assert_eq!(displays[2].index, 3);
    }

    #[test]
    fn orders_stacked_displays_top_to_bottom() {
        let displays = order_and_identify(vec![
            raw("Below", 1920, 1080, 0, 1080, 1.0),
            raw("Above", 1920, 1080, 0, -1080, 1.0),
            raw("Origin", 1920, 1080, 0, 0, 1.0),
        ]);
        let names: Vec<_> = displays.iter().map(|d| d.name.clone().unwrap()).collect();
        assert_eq!(names, vec!["Above", "Origin", "Below"]);
    }

    #[test]
    fn ordering_is_independent_of_enumeration_order() {
        let a = order_and_identify(vec![
            raw("A", 1920, 1080, 0, 0, 1.0),
            raw("B", 1920, 1080, 1920, 0, 2.0),
        ]);
        let b = order_and_identify(vec![
            raw("B", 1920, 1080, 1920, 0, 2.0),
            raw("A", 1920, 1080, 0, 0, 1.0),
        ]);
        assert_eq!(a, b);
    }

    #[test]
    fn identical_monitors_get_distinct_ids() {
        let displays = order_and_identify(vec![
            raw("Samsung TV", 1920, 1080, 0, 0, 1.0),
            raw("Samsung TV", 1920, 1080, 1920, 0, 1.0),
        ]);
        assert_ne!(displays[0].id, displays[1].id);
        assert!(displays[0].id.starts_with("Samsung TV|1920x1080@1.0000#"));
    }

    #[test]
    fn mixed_dpi_is_reflected_in_the_id() {
        let displays = order_and_identify(vec![
            raw("Panel", 3840, 2160, 0, 0, 1.5),
            raw("Panel", 3840, 2160, 3840, 0, 2.0),
        ]);
        assert_ne!(displays[0].id, displays[1].id);
    }

    #[test]
    fn unnamed_monitors_still_get_ids() {
        let displays = order_and_identify(vec![RawMonitor {
            name: None,
            width: 1280,
            height: 720,
            x: 0,
            y: 0,
            scale_factor: 1.0,
            is_primary: true,
        }]);
        assert_eq!(displays.len(), 1);
        assert_eq!(displays[0].id, "|1280x720@1.0000#0");
        assert!(displays[0].is_primary);
    }
}
