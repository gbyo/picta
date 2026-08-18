/**
 * The Identify Displays overlay. Reads its number from the query string and
 * does nothing else — no Tauri APIs, no permissions, no timers. The window is
 * destroyed from Rust after about two seconds.
 */
const number = new URLSearchParams(window.location.search).get('n') ?? '?';
const element = document.getElementById('number');
if (element) {
  element.textContent = number;
  element.setAttribute('aria-label', `Display ${number}`);
}
