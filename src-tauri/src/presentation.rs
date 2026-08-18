//! The presentation window.
//!
//! Multi-monitor placement is the part of Picta most likely to go wrong, so the
//! rules here are deliberately blunt:
//!
//!  * The window is created hidden and only shown once it has been confirmed to
//!    sit on the monitor the operator picked. If that cannot be confirmed, the
//!    window is destroyed and an error is returned — Picta never shows output on
//!    a monitor the operator did not choose.
//!  * Placement is done in *physical* pixels. Logical coordinates are ambiguous
//!    across a mixed-DPI desktop, and physical coordinates are what monitor
//!    positions are reported in.
//!  * The window is borderless and sized to the monitor's exact bounds rather
//!    than asking the OS for fullscreen. Native fullscreen re-picks a monitor on
//!    some platforms and creates a separate Space on macOS.

use tauri::{
    LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::displays::{self, DisplayInfo};

pub const PRESENTATION_WINDOW: &str = "presentation";

/// How many times to re-apply geometry before giving up.
///
/// Windows can resize a window as it crosses a DPI boundary, so the first
/// `set_size` on a scaled monitor is often overruled; re-applying converges.
const PLACEMENT_ATTEMPTS: usize = 4;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Create (or reuse) the presentation window on `display_id` and show it.
pub async fn open<R: Runtime>(
    app: tauri::AppHandle<R>,
    display_id: String,
) -> Result<DisplayInfo, String> {
    let displays = displays::enumerate(&app)?;
    let target = displays::find(&displays, &display_id)
        .ok_or_else(|| "That display is no longer connected.".to_string())?
        .clone();

    // Reuse is only safe if we can re-verify placement, which we do below.
    let window = match app.get_webview_window(PRESENTATION_WINDOW) {
        Some(existing) => {
            existing.hide().map_err(err)?;
            existing
        }
        None => build(&app)?,
    };

    match place(&window, &target) {
        Ok(()) => {}
        Err(message) => {
            // Leave nothing behind that could pop up on the wrong screen.
            let _ = window.hide();
            let _ = window.destroy();
            return Err(message);
        }
    }

    window.show().map_err(err)?;

    // Confirm once more after showing: a compositor may have relocated the
    // window as it became visible.
    if !on_target(&window, &target) {
        let _ = window.hide();
        let _ = window.destroy();
        return Err(
            "Picta could not place the presentation on the selected display, so it did not start."
                .to_string(),
        );
    }

    window.set_focus().map_err(err)?;
    let _ = window.set_cursor_visible(false);

    #[cfg(target_os = "macos")]
    {
        // Simple fullscreen hides the menu bar and Dock without moving the
        // window into its own Space.
        let _ = window.set_simple_fullscreen(true);
    }

    Ok(target)
}

fn build<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    WebviewWindowBuilder::new(
        app,
        PRESENTATION_WINDOW,
        WebviewUrl::App("present.html".into()),
    )
    .title("Picta Presentation")
    .visible(false)
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .focused(false)
    // Nothing is ever dropped onto the presentation; leaving the OS handler off
    // keeps the window inert.
    .disable_drag_drop_handler()
    .inner_size(640.0, 360.0)
    .build()
    .map_err(err)
}

/// Move and size the window onto `target`, verifying the result.
fn place<R: Runtime>(window: &WebviewWindow<R>, target: &DisplayInfo) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Must be off before repositioning, or the window stays glued to the
        // screen it was last made fullscreen on.
        let _ = window.set_simple_fullscreen(false);
        let _ = window.set_visible_on_all_workspaces(true);
    }

    let position = PhysicalPosition::new(target.x, target.y);
    let size = PhysicalSize::new(target.width, target.height);

    for attempt in 0..PLACEMENT_ATTEMPTS {
        window.set_position(position).map_err(err)?;
        window.set_size(size).map_err(err)?;
        // Moving across a DPI boundary can change the size the OS applied, so
        // re-assert the position afterwards and re-check.
        window.set_position(position).map_err(err)?;

        if geometry_matches(window, target) {
            return Ok(());
        }
        if attempt + 1 == PLACEMENT_ATTEMPTS {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }

    // Geometry may legitimately differ on window managers that do not honour
    // exact placement (notably Wayland). Accept it only if the window is at
    // least on the right monitor; otherwise fail loudly.
    if on_target(window, target) {
        // Best effort: ask the compositor for the monitor's logical size.
        let logical = LogicalSize::new(
            f64::from(target.width) / target.scale_factor,
            f64::from(target.height) / target.scale_factor,
        );
        let _ = window.set_size(logical);
        return Ok(());
    }

    Err("Picta could not move the presentation window onto the selected display.".to_string())
}

fn geometry_matches<R: Runtime>(window: &WebviewWindow<R>, target: &DisplayInfo) -> bool {
    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };
    position.x == target.x
        && position.y == target.y
        && size.width == target.width
        && size.height == target.height
}

/// Does the OS agree that this window lives on the chosen monitor?
fn on_target<R: Runtime>(window: &WebviewWindow<R>, target: &DisplayInfo) -> bool {
    match window.current_monitor() {
        Ok(Some(monitor)) => {
            let position = monitor.position();
            let size = monitor.size();
            position.x == target.x
                && position.y == target.y
                && size.width == target.width
                && size.height == target.height
        }
        // Some Linux window managers cannot report this. Fall back to comparing
        // the window's own position against the monitor rectangle.
        _ => window
            .outer_position()
            .map(|p| {
                p.x >= target.x
                    && p.y >= target.y
                    && p.x < target.x.saturating_add(target.width as i32)
                    && p.y < target.y.saturating_add(target.height as i32)
            })
            .unwrap_or(false),
    }
}

/// Tear the presentation down. Safe to call when nothing is open.
pub fn close<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(PRESENTATION_WINDOW) {
        #[cfg(target_os = "macos")]
        {
            let _ = window.set_simple_fullscreen(false);
        }
        let _ = window.hide();
        let _ = window.destroy();
    }
}
