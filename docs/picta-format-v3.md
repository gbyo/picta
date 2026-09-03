# `.picta` show format v3

Picta 2.0 writes JSON show documents with `version: 3`. A show references or embeds its Media and optional Team resources and stores event-only statistics, live group membership, volleyball score, Screens, and the default Screen id.

```json
{
  "version": 3,
  "media": { "kind": "inline", "data": { "version": 1, "name": "Sponsors", "items": [], "transition": "crossfade", "imageSizing": "fit", "imageDurationSeconds": 10 } },
  "event": {
    "stats": {},
    "liveGroups": {},
    "score": {
      "sport": "volleyball",
      "home": { "name": "Home", "primaryColor": "#20242b" },
      "away": { "name": "Opponent", "primaryColor": "#4b5563" },
      "homePoints": 0,
      "awayPoints": 0,
      "homeSets": 0,
      "awaySets": 0,
      "setNumber": 1,
      "serving": null,
      "matchFormat": "best-of-5"
    }
  },
  "screens": [{
    "id": "media-score",
    "name": "Media + Score",
    "background": { "kind": "black" },
    "cueTargetPanelId": "panel-left",
    "panels": [
      { "id": "panel-left", "rect": { "x": 0, "y": 0, "width": 0.5, "height": 1 }, "content": { "kind": "media" } },
      { "id": "panel-right", "rect": { "x": 0.5, "y": 0, "width": 0.5, "height": 1 }, "content": { "kind": "score" } }
    ]
  }],
  "defaultScreenId": "media-score"
}
```

Coordinates are normalized to the full output canvas. Panels may not overlap or extend outside it, IDs must be unique within a Screen, and one to four Panels are supported. Content is a discriminated union: `media`, `score`, `stats` (optionally with `groupId`), or `blank`. There is no required content role.

v1 and v2 files are migrated only in memory. Their recursive layout leaves are flattened into exact normalized rectangles, old primary media content becomes Media, the old statistics board becomes Stats, and a safe zeroed score is added. Saving writes v3; simply opening does not modify the source.
