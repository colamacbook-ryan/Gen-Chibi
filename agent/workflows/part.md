# Topic: part — draw a new part (SVG)

**Goal:** a reusable drawable part (hat, hair, outfit, held item…) in your library.

## Steps
1. `get_part_spec` with `{ "slot": "<slot>" }` — frame 200×240, anchors, the layers to use for this slot,
   colour tokens (`{ink}`, `{robe}`…), the allowed SVG subset, 45° rules, a complete example.
2. Draw the front view in `layers.<layer>` (SVG fragments, colour tokens instead of hard-coded colours).
3. Choose the 45° mode in `views.q45` (`drawn` with its own layers, or `same` / `face45` / `body45`).
4. Held items (`heldR`, `heldL`): set `tall: true` for long objects and `grip`:
   `"weapon"` (unlocks weapon actions), `"tool"` or `"prop"`.
5. `preview_part` with `{ "part": <part> }` — the system checks the SVG and dresses the frame mannequin in
   5 views × 4 poses. Fix every reported error.
6. `save_part` with `{ "part": <part>, "note": "…" }` → use it as `look.parts.<slot> = "local.my/<id>"`.

## Rules
- Only the SVG subset from `get_part_spec` (no scripts, no external URLs, no `<image>`).
- Set `"project": "<id>"`.

## Example
<!-- example: part.json -->
