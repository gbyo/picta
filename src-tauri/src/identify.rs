//! Identify Displays.
//!
//! Puts a large number on every attached monitor for about two seconds, using
//! the same numbering as Picta's display selector. Deliberately small,
//! borderless panels rather than fullscreen windows: nothing needs to cover the
//! operator's other screens, and a fullscreen window on macOS risks creating a
//! Space. Nothing about the monitor configuration is modified, and every window
//! is destroyed on a timer whether or not anything else happens.

use std::time::Duration;

use tauri::{Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindowBuilder};

use crate::displays::{self, DisplayInfo};

const LABEL_PREFIX: &str = "picta-identify-";
const VISIBLE_MS: u64 = 2000;

/// Panel edge length as a fraction of the monitor's shorter side, clamped so it
/// stays readable across a room on a small screen without dominating a large one.
fn panel_size(display: &DisplayInfo) -> PhysicalSize<u32> {
    let shorter = f64::from(display.width.min(display.height));
    let lower = (220.0 * display.scale_factor).min(shorter * 0.8);
    let upper = (620.0 * display.scale_factor).min(shorter * 0.8);
    let edge = (shorter * 0.34).clamp(lower.min(upper), upper);
    // Round to an even number of pixels so the panel centres exactly.
    let edge = ((edge / 2.0).round() * 2.0).max(2.0) as u32;
    PhysicalSize::new(edge, edge)
}

fn panel_position(display: &DisplayInfo, size: PhysicalSize<u32>) -> PhysicalPosition<i32> {
    // Integer maths throughout: monitor origins are frequently negative.
    let x = display.x + ((display.width as i32 - size.width as i32) / 2);
    let y = display.y + ((display.height as i32 - size.height as i32) / 2);
    PhysicalPosition::new(x, y)
}

pub async fn show_all<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    // Clear any overlay still on screen from a rapid second click.
    close_all(&app);

    let displays = displays::enumerate(&app)?;

    for display in &displays {
        let label = format!("{LABEL_PREFIX}{}", display.index);
        let url = format!("identify.html?n={}", display.index);

        let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title("Picta")
            .visible(false)
            .decorations(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            // Never steal focus from the controller, nor from whatever the
            // operator is actually working in.
            .focused(false)
            .disable_drag_drop_handler()
            .inner_size(320.0, 320.0)
            .build()
            .map_err(|e| e.to_string())?;

        let size = panel_size(display);
        let _ = window.set_size(size);
        let _ = window.set_position(panel_position(display, size));
        // Re-assert after the DPI-driven resize that Windows may apply.
        let _ = window.set_size(size);
        let _ = window.set_position(panel_position(display, size));

        #[cfg(target_os = "macos")]
        {
            let _ = window.set_visible_on_all_workspaces(true);
        }

        let _ = window.show();
    }

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(VISIBLE_MS));
        close_all(&handle);
    });

    Ok(())
}

/// Destroy every identify overlay. Called on the timer, on app exit, and before
/// a new round, so no overlay can ever be left behind.
pub fn close_all<R: Runtime>(app: &tauri::AppHandle<R>) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(LABEL_PREFIX) {
            let _ = window.destroy();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display(width: u32, height: u32, x: i32, y: i32, scale: f64) -> DisplayInfo {
        DisplayInfo {
            id: "test#0".into(),
            index: 1,
            name: Some("Test".into()),
            width,
            height,
            x,
            y,
            scale_factor: scale,
            is_primary: false,
        }
    }

    #[test]
    fn panel_is_centred_on_the_monitor() {
        let d = display(1920, 1080, 0, 0, 1.0);
        let size = panel_size(&d);
        let position = panel_position(&d, size);
        assert_eq!(position.x + size.width as i32 / 2, 960);
        assert_eq!(position.y + size.height as i32 / 2, 540);
    }

    #[test]
    fn panel_is_centred_on_monitors_at_negative_coordinates() {
        let d = display(1920, 1080, -1920, -1080, 1.0);
        let size = panel_size(&d);
        let position = panel_position(&d, size);
        assert_eq!(position.x + size.width as i32 / 2, -960);
        assert_eq!(position.y + size.height as i32 / 2, -540);
    }

    #[test]
    fn panel_always_fits_inside_the_monitor() {
        for (w, h, s) in [
            (1024u32, 768u32, 1.0f64),
            (1920, 1080, 1.0),
            (2560, 1440, 1.25),
            (3840, 2160, 2.0),
            (800, 600, 1.0),
            (640, 480, 2.0),
        ] {
            let d = display(w, h, 0, 0, s);
            let size = panel_size(&d);
            assert!(size.width <= w, "{w}x{h}@{s} -> {}", size.width);
            assert!(size.height <= h, "{w}x{h}@{s} -> {}", size.height);
            let position = panel_position(&d, size);
            assert!(position.x >= 0 && position.y >= 0, "{w}x{h}@{s}");
        }
    }
}
