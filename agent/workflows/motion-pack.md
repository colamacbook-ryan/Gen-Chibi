# Topic: motion-pack — new poses, animation clips and actions

**Goal:** a themed set of moves (attacks, solo moves, a show) that films and animation export can use.
A motion pack is pure JSON data (`gen-chibi.motion/1`); the gate rejects anything outside the vocabulary.

## Steps
1. `get_motion_spec` — joints, channels and ranges, eases, strike points, fx / sfx / music names, budgets,
   the framework pose names you can build on, and a complete example.
2. `list_actions` — action ids already taken (framework + other packs). **Action ids are global**: pick new ones.
   `list_motion_packs` / `get_motion_pack` with `{ "key" }` — read an existing pack to learn from or to edit (save it again with the same `id`).
3. Write the pack (see example and the rules below), `"project": "<id>"`.
4. `validate_motion_pack` with `{ "pack": <pack> }` — runs the gate **and builds every action** on the frame
   mannequin (attacks against a second mannequin). Fix every `details[].path`.
5. `save_motion_pack` with `{ "pack": <pack>, "note": "…" }`.
6. `render_action` with `{ "character": "<key>", "action": "<id>", "format": "sheet" }` — look at the frames.

## Structure
```
{ id, name, description, project, status,
  poses:   { <poseId>: { $: <basePose>, <joint>: { x, y, rot, sx, sy }, wR, wL } },
  clips:   { <clipId>: { label, view, face, hide, keys, travel, speed, faces, events, cam, dur } },
  actions: { <actionId>: { label, clips: [clipId…], attack?, needs?, aim?, ranged?, art?, shock?, hint? } },
  shows:   { <showId>: { title, character, scene, steps: [{ clip, tempo?, dir?, dur?, pose? }] } } }
```

## Pose convention (side views are written facing LEFT; the engine mirrors for right)
- Forward is **−x**. `R` limbs are the near side. Arm `rot` + swings forward; thigh `rot` + kicks forward;
  shin `rot` − bends the knee; `root.rot` − leans forward. `wR` / `wL` = weapon angle in the world (0 = upright).
- Start from a framework pose with `$` (e.g. `"$": "fistGuard"`) and change only what moves.
- `sx` / `sy` stretch a limb — cartoon "rubber hose" stretch at the moment of a strike is encouraged (≤ 2).

## Keys, travel, events
- `keys: [[t, pose, ease?, extra?]]` — `t` seconds (ascending, ≤ 12), `pose` = pose id or inline pose,
  `ease` from the spec (`snap` for strikes, `out` / `io` for settles), `extra`: `{ ez, spin, dir, view, face, hide }`.
- `travel: [[t, dx, ease?]]` — root movement forward (+) or back (−) in world units.
- `events: [[t, { … }]]` — sound (`sfx`, `gain`), effects (`fx`, `at`, `size`, `text`, `color`), impact
  (`hit: true` and/or `hitstop` ≤ 0.4), camera shake / flash, speed lines (`lines`), afterimages (`ghosts`).

## Attack actions (`attack: true`)
- Need at least one impact event (`hit: true` or `hitstop`). Its `at` is the **strike point**:
  `tip` (weapon tip), `hand`, `handL`, `foot`.
- The engine walks the attacker in or out so that strike point meets the target, keeps both heads apart,
  stays inside the stage and away from bystanders. The target reacts (`hit`, `fall`, `ko`, `block`, `dodge`).
- `aim: "head"` for unarmed hits: chibi heads are large and limbs short, so fists land on the face, not the body.
- `needs: "weapon"` if the move only makes sense with a weapon (the system blocks it for unarmed actors).
- `ranged: true` + one `release: true` event = a throw; the projectile flight is computed (`art`: `rock` | `tomato`).

## Budgets (gate)
≤ 64 poses · ≤ 48 clips · ≤ 32 actions · ≤ 4 shows · ≤ 64 keys and ≤ 48 events per clip · total hitstop ≤ 1.2 s
per clip · ≤ 4 ghosts / lines / smear events per clip · one action (sum of its clips) ≤ 6 s — longer sequences
belong in `shows` · show ≤ 90 s · pack ≤ 300 KB · the test build of all actions must finish within 4 s.

## Example
<!-- example: motion-pack.json -->
