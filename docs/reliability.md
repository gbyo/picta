# Reliability notes

## Output preflight

Before **Start Output**, Picta checks each media item through the same local
WebView capability used by the presentation renderer. Images must load and
decode; videos must reach `canplay` and start briefly muted in a detached video
element. The preflight never attaches those elements to the presentation
window and never sends their audio to the audience. Items that fail are shown
by name and skipped for that output run when other items are usable.

This is intentionally a capability check, not a codec parser. Picta does not
bundle FFmpeg, Chromium, codecs or a transcoder, so a file can still fail later
if the OS media stack, file permissions or the file itself changes after
preflight. The live renderer remains the final authority and reports any
runtime failure.

## Recovery

Dirty show, team and media state is retained as a machine-local recovery JSON
snapshot in the application data directory. It is separate from `.picta`,
`.pictateam` and `.pictaset`, is written atomically, and is discarded after a
clean save or clean shutdown. Corrupt or obsolete recovery data is ignored and
removed; it cannot prevent startup.
