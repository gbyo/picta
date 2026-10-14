# Controller architecture

The operator window is a React application. The audience renderer (`present.html`, `src/present.ts`) and the Identify overlay are deliberately separate, dependency-free renderers driven by events.

```
src/core/         Pure domain: Screens, score, sports, teams, media, cues, formats. No DOM, no Tauri.
src/app/          Non-React services: output orchestration, IPC, file IO, recovery, preflight.
src/controller/   The React controller.
  platform/       The only code that touches Tauri (tauri.ts), plus a scripted fake and a browser demo.
  runtime.ts      The installed Platform and OutputPort (one of each, created outside React).
  boot.ts         Startup, native menu/key/drag/close wiring, update checks. Returns a disposer.
  state/          One Zustand store, pure derivations, and promise-based dialog requests.
  actions/        Every operation the UI can perform, as plain functions.
  shortcuts.ts    The keyboard model and the shortcut table shown in the UI.
  components/picta/  Picta's UI grammar on top of Cladd (see "Design system"), plus product
                  primitives: ScreenRender, LayoutGlyph, MediaThumb, sortable lists.
  features/       Shell, program rail, and the Console, Media, Roster and Screens workspaces.
```

## Data flow

Components read narrow slices of the store and call actions. Actions change state and talk to the platform. They never push to the output directly for live data: `actions/sync.ts` subscribes to the store and sends the live display exactly what changed (score, stats board, theme, Screen). The same subscription keeps the window title honest and writes crash recovery.

The output state machine (`src/app/output-controller.ts`) is unchanged in its guarantees: staged, token-correlated startup; session/panel/media/cue tokens; shared media panels preserved across Screen switches. The controller adds an explicit operator-level phase (`off`, `preparing` with a named stage, `live`, `stopping`) and a failure record that stays visible until dismissed.

Native listeners and the output are created once in `boot()`, outside React, so Strict Mode double-mounting cannot duplicate them. `boot()` returns a disposer used by hot reload and tests.

## Design system

**Cladd (`@cladd-ui/react`) is the visual and compositional source of truth.** Surfaces and their depth levels, the `2xs`-`2xl` control sizes, radii, focus rings, light and dark themes, Select, Tabs, Dialog, Popover, Tooltip, Shortcut and the rest of the controls all come from Cladd. Feature code does not invent a second system on top of it.

`src/controller/styles/app.css` is the only place Picta bends Cladd. It tunes the radii and primary tone for a dense desktop app, and defines the operator state colours, each with one fixed meaning:

- `live`: the audience display is ON AIR. Used only for the tally, the status pill, the program frame and the live Screen. It is the only solid red in the application.
- `cue`: a temporary takeover of the program.
- `accent`: selection, focus and "what will go live".
- `warn`, `ok`, `danger`: attention, ready, destructive or failed.

`PictaProvider` (`components/picta/provider.tsx`) mounts `CladdProvider` once at the root. It follows Picta's theme (Cladd reads a `dark`/`light` class on `<html>`, Picta and the audience renderer read `data-theme`; `applyTheme` keeps both in step) and sets the app-wide component defaults: `md` (28px) controls, squared rather than pill-shaped, flush focus rings, no 0-9 quick-pick hints on Select. Overlays portal into `#root`, and `.app-container` is what a modal makes inert. The root font size is 16px, which Cladd's rem-based spacing assumes.

### The composition layer

Feature code composes these instead of choosing sizes, radii and spacings itself:

| Pattern | Component |
| --- | --- |
| Workspace frame: header, optional toolbar, body | `Workspace`, `WorkspaceHeader`, `WorkspaceToolbar`, `WorkspaceBody`, `WorkspaceMain` |
| Property surface for the selection | `Inspector`, `InspectorHeader`, `InspectorSection`, `PropertyRow` |
| Selectable rows | `SelectableRow` (and Cladd's `ListButton`) |
| Status and emptiness | `Banner`, `EmptyState`, `StatusDot` |
| Menus (actions only) | `ActionMenu`, `OverflowMenu`, `ContextActions`, `ResourceMenu` |
| Anchored panels and modals | `PictaPopover`, `ModalDialog` |
| Repeated controls | `ActionButton` (intent), `IconButton`, `Choice`, `CommitInput`, `ColorField`, `Field` |

A workspace reads the same way everywhere: **identity and quiet metadata, then the primary action, then one overflow menu**. A selected thing is shown by the inspector as **identity, named sections of property rows, contextual actions, and anything destructive in its own section at the end**. With nothing selected the inspector shows the parent object's own properties (the rotation, the team).

Text uses only Cladd's `xs` (12px), `sm` and `md` sizes, so nothing in the controller is smaller than 12px; controls use Cladd's `sm`-`xl` heights; radii and spacing come from Cladd tokens. A new arbitrary pixel value needs a reason (the live score numerals have one).

### What stays outside Cladd, and why

- **Base UI Menu / ContextMenu** (`components/picta/menu.tsx`): Cladd composes menus from Popover + List, which has no menu role, roving focus or typeahead. The behaviour stays on Base UI; the surface, rows, separators, shortcuts and animation are drawn from Cladd tokens so a menu looks like any Cladd popover.
- **cmdk** (`components/picta/command.tsx`): filtering, ranking and keyboard handling for the command palette, inside a Cladd Dialog with Cladd-styled rows.
- **Sonner** (`components/picta/toaster.tsx`): toasts with an Undo action, which Cladd's toast does not offer, styled with Cladd tokens.
- dnd-kit, react-resizable-panels, Zustand and Tauri are unchanged.

### Things to know when writing UI

- Cladd renders `<button>` without a `type`, so inside a `<form>` an unrelated Select, colour editor or segmented option would submit it. Forms use `explicitSubmit` (only Enter in a field or a `type="submit"` button submits).
- Cladd's Popover does not move focus. `PictaPopover` focuses into the popover, names it, and returns focus to the trigger when it was dismissed from the keyboard. After a mouse dismissal focus is left alone so Space keeps advancing media.
- Cladd Dialog has `role="dialog"` (not `alertdialog`), traps focus and focuses its confirm button. Picta supplies its own footer so the safe answer is focused (`useInitialFocus`).
- Global shortcuts stay quiet while any Cladd overlay (`.cladd-dialog`, `.cladd-popup`, `.cladd-popover`) is open.
- Cladd positions popovers and tooltips with CSS anchor positioning and colours with relative colour syntax. Chromium (WebView2) and recent WebKit support both; see "Platform requirements" in the README.

## Drag and drop

Tauri's native file-drop handler stays enabled so media, shows, teams and sets can be dropped from the desktop. Internal reordering uses dnd-kit, which is driven by pointer events rather than HTML5 drag-and-drop, so the two never compete. Every sortable list also has keyboard reordering and explicit move actions.

## Testing

Core logic has unit tests. Controller workflows are tested end to end in jsdom with React Testing Library against a scripted platform (`tests/controller/harness.tsx`) whose `FakeOutput` honours the same contract as the real output: going live and failing to, stopping, display loss, Screen switching, transport, scoring and Undo, cues, stats, documents, recovery and live safeguards.
