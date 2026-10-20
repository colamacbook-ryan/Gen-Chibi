# Topic: sound — the sound library: mix cartoon sound effects into a film, or author a sound pack

**Goal:** films that sound like a cartoon (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA — exaggerated, pitched, playful) without noise.
A sound is a **recipe** of synthesis layers + metadata (`gen-chibi.sound/1`, pure JSON — no audio files); the browser synthesises
it with Web Audio. A **sound pack** groups sounds. The built-in pack `gen.am` (the frame, 62 sounds, 8 groups) is always there;
packs of your project add themed sounds (e.g. `tq-am` for the Tam Quốc sample). **Sound names are global** (one namespace) —
a clash is rejected and names the pack that owns the name.

## Decide first
- Most steps need **no `sfx` at all**: the player auto-assigns ≤ 2 sounds from the step's `state` / `fx` / `activity`
  (each sound declares the cues it answers to; project packs win over the frame; some cues need a scene mood). Leave `sfx` out.
- Set `sfx` only to **accent a moment** you chose: ≤ 3 names per step, at most **one** accent sound (groups marked ACCENT below),
  and not on a step that has dialogue. `"sfx": []` = a silent step (switches auto-assign off for that step).
- Attacks: use `action` — the hit sound plays exactly at the strike point by itself (project packs can replace the default hit /
  block / miss sound through `cue.event`). Do not stack a hand-placed impact sound on top of an `action` step.
- You **cannot hear** anything (the server has no Web Audio): check with the gates and `lint_sound_track`, and ask the owner to press ▶ in
  Studio › Library › Sounds (they can also download any sound or recipe as WAV).

## Steps A — mix sounds into a script (the everyday job)
1. `list_sounds` with `{ "project": "<project id>" }` (+ optional `cat`, `tag`, `q`) → names you may use in that project
   (frame + shared packs + the project's own packs). Each entry has `use` ("when to use") and `accent`. Never invent a name.
2. Write the steps (topic `film`); add `sfx` only where Decide-first says so. Compose "wind-up → impact → aftermath" across
   2–3 steps, one sound per step (recipes below).
3. `validate_event` → `save_shot`. `save_shot` runs the mixing rules: an **error** rejects the save with a path
   (`shot.event.steps[i].sfx[k]`), warnings come back in `warnings`.
4. Before you report done: `lint_sound_track` with `{ "work": "<work id>" }` — fix every error, fix warnings you can.
   `lint_sound_track` also takes `{ "steps": [...], "project": "<id>" }`, `{ "event": … }` or `{ "shot": … }` for a draft.

## Mixing rules (generated from the engine — the single source; `lint_sound_track` runs exactly these)
<!-- generated: sound-rules -->

## Groups (`list_sounds › cat`)
<!-- generated: sound-cats -->

## Recipes (seconds → sound; one sound per step; offsets are only a guide to the rhythm)
<!-- generated: sound-recipes -->

## Example — a script that passes the rules (`lint_sound_track` input)
<!-- example: sound-track.json -->

## Steps B — author a new sound pack (only when the library lacks the sound)
1. `list_sounds` first: reuse beats inventing. Then `get_sound_spec` — the 8 layer kinds (tone, noise, crackle, modes, voice, fm, mallet,
   drum), number ranges, budgets (≤ 60 Web Audio nodes per sound, ≤ 24 layers, ≤ 4 s, ≤ 64 sounds per pack, ≤ 200 KB), cue
   vocabulary, and a complete example.
2. `get_sound_pack` with `{ "id": "gen.am", "names": ["bonk", "boing"] }` → copy the recipe of a similar sound as your model.
   Cartoon style: big pitch glides (1–2 octaves), a clear musical note, a wobbling tail, two beats (wind-up → hit) for big hits.
3. Write the pack with `"project": "<project id>"` (a pack of a project is usable only in that project — rule S6 — and travels with
   `export_project`). Each sound needs `label` (in the user's / project's language), `cat`, `tags`, `use` (one sentence "when to use", ≤ 160 chars), `dur`, `level`,
   `layers`; optional `cue` (`state` / `fx` / `activity` / `event` lists + `mood` condition) to be auto-assigned, `lanes` (stereo),
   `hitAt` (where the hit lands, for sounds with a wind-up).
4. `validate_sound_pack` with `{ "pack": <pack> }` → fix every `details[].path`.
5. `save_sound_pack` with `{ "pack": <pack>, "note": "…" }` (same `id` again = a new version; `warnings` reminds the pack's scope).
   Guards, each with a clear error:
   - A pack **without** `project` is a *shared* pack: its sounds can be called by name in every project, but it may **not** carry `cue`
     (a shared pack must not change the frame's auto-assign in every project). Want auto-assign? Give the pack a `project`.
   - Through an MCP **link** or the AI chatroom `project` is **required**, and you may not overwrite another project's pack or a shared pack
     (`FORBIDDEN` — use another `id`).
   - Dropping a sound that a work step or a motion pack event still calls, or moving the pack to another project while something calls it,
     answers `[CONFLICT]` listing every call site. Fix those first; only the owner may repeat with `force: true`.
   - ≤ 32 packs per project (the same cap as `import_project`); an unknown pack-level key (`project_id`…) or `partial: true`
     (what `get_sound_pack` returns with `names`) is an error — send a complete pack.
   Removing a pack is `delete_sound_pack` (owner only; same `[CONFLICT]` list while it is still called).
6. Use it: `step.sfx = ["<sound name>"]`, `events: [[t, { "sfx": "<name>" }]]` inside a motion pack, or a `cue`.
   Ask the owner to listen (Studio › Library › Sounds › ▶).

## Order matters when packs depend on each other
Save the **sound pack before** the motion pack that calls its sounds, and before the work whose steps name them. `export_project` /
`import_project` already do this (`soundPacks` before `motionPacks` before `works`), and `export_project` pulls every sound pack the
bundle calls — by a work step **or** by a motion pack event, including shared packs and packs of other projects (a sale bundle warns when
such a pack is still a draft).

## Example (a sound pack that passes the gate)
<!-- example: sound-pack.json -->
