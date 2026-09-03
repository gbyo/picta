# Screens and Panels

Runtime composition uses a flat `Screen.panels` array. Geometry has one interpretation shared by the editor preview, output orchestrator, and presentation renderer.

The common templates are Full, 50/50 left-right, 65/35 left-right, 35/65 left-right, and 50/50 top-bottom. A divider ratio is expressed against the complete Screen, not against a nested parent. Imported v2 trees are retained only by migration code and are flattened before normal runtime use.

A cue normally targets `cueTargetPanelId`, which defaults to a Media panel. The presentation replaces only that panel for the cue, leaving Score or Stats untouched. Shared panel IDs let the renderer move an existing media host when switching between Media + Score and Media + Stats, preserving the current media element and playback position.
