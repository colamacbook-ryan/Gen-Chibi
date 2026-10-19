# Topic: character — create a character from the frame

**Goal:** a new character saved in your project, usable in films and bundles.

## Steps
1. `start_here` — note the project id you will use (create it with `save_project` if needed).
2. `get_catalog` — read `slots.<slot>.parts` (allowed parts per slot, with their `params` min–max), `eyeStyles`, `browStyles`,
   `paletteKeys`, `states`, `activities`.
3. Optional: `get_character` with `key: "gen.khung/ma-no-canh"` (the bald frame) or any existing character, to copy its shape
   (the frame is data of Gen Labs and never changes: a copy saved from it always starts as `draft`, whatever the frame says).
4. Write the recipe (see example):
   - `id` slug, `name` (Vietnamese), `role`, `persona`, `"project": "<id>"`;
   - `look.eyes` / `look.brows` = an id from `eyeStyles` / `browStyles`;
   - `look.parts.<slot>` = `"<pack>/<id>"` of a part listed in `slots.<slot>.parts` (`gen.khung/…` frame blocks, `local.my/…` your parts);
   - `look.equip.<slot>` = item keys (`local.my/<item-id>`), e.g. a weapon in `heldR`;
   - `look.palette` = hex colours for keys in `paletteKeys`; `look.params` = numbers inside each part's min–max;
   - `identity.must` = the distinctive parts (`"<slot>:<part-id>"`) — required to publish.
   - Voice (optional, for films): `voice: { "role": "<id>" }` from `get_catalog` › `voiceRoles` (be-gai, ong-lao, vo-tuong,
     quan-su…); without it the role is guessed from `role` / `persona` / `name`. Optional `accent` (`get_catalog` › `voiceLangs`),
     `ai` (a voice the owner picked), `pitch` 0.5–2 / `rate` 0.6–1.6 (browser voice only).
5. `validate_character` with `{ "asset": <recipe> }` → `ok: true` when no gate BLOCKS the asset's status (a draft
   does not need `identity.must`; unmet non-blocking gates come back as `warnings`). On failure it is a
   `[VALIDATION_FAILED]` error whose `details[].path` names the gate (`gates.<id>`).
6. `save_character` with `{ "asset": <recipe>, "note": "why" }` → `saved: true`, `key: "local.my/<id>"`.
7. `render_character` with `{ "key": "local.my/<id>", "state": "proud" }` (any state from the catalog) — look at it.

## Weapons and actions
A character "holds a weapon" (unlocks actions marked `needs: weapon`) when `heldR` holds an **item of type
`weapon`**, or a part declared `grip: "weapon"`. Fans, books, cups are props. `list_actions` with
`character` tells you exactly which actions this character can perform.

## Common errors
- `VALIDATION_FAILED … parts` → a part ref is not in the catalog for that slot; use `get_catalog`.
- `identity.must` mismatch → each entry must be a part the character actually wears.

## Example
<!-- example: character.json -->
