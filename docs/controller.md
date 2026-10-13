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
  components/ui/  shadcn/ui primitives on Base UI, restyled with Picta's tokens.
  components/picta/  Product primitives: ScreenRender, LayoutGlyph, MediaThumb, Hint, sortable lists.
  features/       Shell, program rail, and the Console, Media, Roster and Screens workspaces.
```

## Data flow

Components read narrow slices of the store and call actions. Actions change state and talk to the platform. They never push to the output directly for live data: `actions/sync.ts` subscribes to the store and sends the live display exactly what changed (score, stats board, theme, Screen). The same subscription keeps the window title honest and writes crash recovery.

The output state machine (`src/app/output-controller.ts`) is unchanged in its guarantees: staged, token-correlated startup; session/panel/media/cue tokens; shared media panels preserved across Screen switches. The controller adds an explicit operator-level phase (`off`, `preparing` with a named stage, `live`, `stopping`) and a failure record that stays visible until dismissed.

Native listeners and the output are created once in `boot()`, outside React, so Strict Mode double-mounting cannot duplicate them. `boot()` returns a disposer used by hot reload and tests.

## Design system

`src/controller/styles/app.css` defines semantic tokens: surfaces (`canvas`, `surface`, `raised`, `overlay`, `sunken`), text (`fg`, `fg-muted`, `fg-faint`) and state colours with fixed meanings:

- `live`: the audience display is ON AIR. Used only for the tally, the status pill, the program frame and the live Screen.
- `cue`: a temporary takeover of the program.
- `accent`: selection, focus and "what will go live".
- `warn`, `ok`, `danger`: attention, ready, destructive or failed.

Both a dark (default) and a light theme are defined from the same tokens. Fonts are the operating system's UI fonts; nothing is loaded from the network.

## Drag and drop

Tauri's native file-drop handler stays enabled so media, shows, teams and sets can be dropped from the desktop. Internal reordering uses dnd-kit, which is driven by pointer events rather than HTML5 drag-and-drop, so the two never compete. Every sortable list also has keyboard reordering and explicit move actions.

## Testing

Core logic has unit tests. Controller workflows are tested end to end in jsdom with React Testing Library against a scripted platform (`tests/controller/harness.tsx`) whose `FakeOutput` honours the same contract as the real output: going live and failing to, stopping, display loss, Screen switching, transport, scoring and Undo, cues, stats, documents, recovery and live safeguards.
