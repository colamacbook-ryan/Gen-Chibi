# Topic: scene — backdrop + props

**Goal:** a scene usable as `event.scene` in films.

## Steps
1. `list_scenes`, then `get_catalog` → `scenes.layers.<layer>.scenery[].ref` (backdrop parts per layer `sky`, `far`, `mid`, `ground`, `front`;
   `deco` holds props), `scenes.paletteKeys`, `scenes.times`, `scenes.weathers`, `scenes.spots`, `scenes.budget`.
2. Write the scene: `id`, `name`, `layers.<layer>` = scenery part refs, `deco` (≤ 10 props with `x`, `y`, `scale`),
   `palette` (scene colour tokens), `time` (`day | dawn | dusk | night`), `weather`, `"project"`.
3. `validate_scene` with `{ "scene": <scene> }`.
4. `save_scene` with `{ "scene": <scene> }` → key `local.my/<id>`.
5. `render_scene` with `{ "key": "local.my/<id>", "cast": [{ "character": "<key>", "spot": "center" }] }` to check framing.

## Example
<!-- example: scene.json -->
