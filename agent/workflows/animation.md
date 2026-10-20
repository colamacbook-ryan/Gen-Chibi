# Topic: animation — export an action as frames / sprite sheet / timeline

**Goal:** a reusable animation of one character performing one action (for games, web, chat).

## Steps
1. `list_actions` with `{ "character": "<key>" }` — only actions with `can: true` work for that character.
2. `render_action` with:
   - `character` (key), `action` (id);
   - attacks only: `partner` (key, default the frame mannequin), `react` (`hit | fall | ko | block | dodge`);
   - `fps` (4–30, default 12), `format`: `"sheet"` (one SVG sprite sheet + timeline) | `"frames"` (SVG per frame) |
     `"meta"` (timeline only), `cell` (sheet cell width px, default 160).
3. Use `meta`: `fps`, `frameCount`, `duration`, `impact` / `impactFrame` (the hit moment), `box`
   (fixed world viewBox for every frame), `segments` (which clip plays when).

Frames have a transparent background and a fixed frame that contains every pose and effect, so they line up
as sprites. Rasterise SVG to PNG / GIF on your side if you need bitmaps (the Studio does this for people:
Library › Motions, in Vietnamese UI: Thư viện › Động tác).
