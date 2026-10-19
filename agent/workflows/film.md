# Topic: film — a work with shots, dialogue, staging and fights

**Goal:** a work (film) whose shots are all "ready" and play in the Studio stage.

## Steps
1. Make sure the characters and the scene exist (`list_characters`, `list_scenes`); create missing ones first
   (topics `character`, `scene`).
2. `save_work` with `{ "title", "project", "logline", "script" }` (omit `id` to create) → work `id`.
3. `get_director_schema` with `{ "cast": ["<character id>", …] }` → the JSON Schema of an event for that cast
   (every allowed `state`, `activity`, `spot`, `camera`, `bubble`, `sfx`, `action`, `react`) and
   **`actorsCan`**: the actions each actor can perform (weapon actions only for actors holding a weapon).
4. Write the event: `{ "title", "scene": "<scene key>", "steps": [ … ≤ 12 ] }`. Each step:
   - required: `actor` (id), `state` (enum), `say` (Vietnamese, ≤ 120 chars; `""` allowed when the step is an action);
   - staging (optional — the player directs automatically if omitted): `spot`, `to`, `camera`, `bubble`, `sfx`, `activity`, `hold`;
   - action (optional): `action` from `actorsCan`; an **attack** needs `target` (another actor) and may set `react`
     (`hit | fall | ko | block | dodge`); a solo action has no target.
5. `validate_event` with `{ "event": <event>, "cast": [ids] }` → `ok: true`.
6. `save_shot` with `{ "work": "<work id>", "shot": { "title", "description", "scene", "cast": [keys], "event" } }`
   (`shot.id` to edit an existing shot; `remove: true` to drop one).
7. `preview_shot` with `{ "work": "<work id>", "shot": "<shot id>" }` → `ready`, `missing`, `warnings`,
   and the planned beats (who moves, which actions, how long). Fix anything listed.
8. Optional voices (voice by ROLE): set the film language once — `save_work` with `{ "id", "lang": "vi" | "en" | "zh" | "yue",
   "accent": "bac" | "nam" | "trung" (vi) · "us" | "uk" (en) · "pt" | "tw" (zh) · "hk" (yue = Cantonese) }`; write every line in that
   language (the voice reads the language of the text — for Cantonese write colloquial Cantonese in Traditional characters: 喺, 咩, 我哋).
   Give each character a voice role when saving it: `voice: { "role": "<id>" }` from `get_catalog` › `voiceRoles`
   (be-trai, be-gai, ong-lao, ba-lao, vo-tuong, quan-su, vua-chua, phan-dien…; without it the role is guessed from role / persona / name).
   `render_voice` with `{ "text", "character": "<key>", "lang", "accent", "state", "bubble" }` returns the line read by a
   Google AI voice (WAV, `audio` content) — the app picks the voice: designed voice of that role → Google voice library
   (right language, gender, age) → prebuilt voice. `design_voice` with `{ "role", "lang", "accent" }` creates a better voice
   for an adult role (elders, generals, regional accents; costs one Google call; child roles are refused by Google policy).
   It only works when the owner pasted a Google AI Studio key (Studio › Cài đặt AI › Giọng AI). The free tier allows very
   few lines per day — on `UNAVAILABLE` stop and tell the owner (`retryAt`), do not loop. Lines already read are cached (no quota used).

## Existing works and loose scripts
- `list_works` / `get_work` with `{ "id" }` — read a work (all shots, events) before editing it; edit a shot with `save_shot` + `shot.id`.
- `save_event` with `{ "event", "author" }` stores a loose script (no work) for the owner to turn into a shot in the Studio;
  `list_events` lists them. Prefer `save_shot` when you know the work.

## Staging tips
- Fighters stand in the front row (`left`, `midLeft`, `center`, `midRight`, `right`), at least one spot apart.
- Change `spot` between steps so people move; mix dialogue with short actions (≤ 3 attacks per shot).
- The owner plays and exports the film (HTML) in the Studio › Tạo tác.

## Example (shot.json — event.json is the same event alone)
<!-- example: work.json -->
<!-- example: shot.json -->
