# Part workflow — the gen-chibi factory standard

**English** | [Tiếng Việt](QUY-TRINH-LINH-KIEN.md)

> The factory's value is the **frame + workflow**, not any single character.
> Character = a combination of parts. One good part serves hundreds of characters, in every expression, pose and view.

## 1. The frame (invariant — every part must follow it)

| Component | Convention |
|---|---|
| Canvas | 200 × 240, ground y = 228, body centre x = 100 (`RIG.box`) |
| Joints | `stage` (props, static) · `root` → `pelvis` → `body` → `head` / `arm·fore·hand` L,R · `hem` (skirt) · `thigh·shin·foot` L,R |
| Anchors | `RIG.anchors`: eyes (80,108)/(120,108), mouth (100,131), chin (100,146), hands (72,193)/(128,193)… — draw to the anchors, not to a particular character |
| Layers | A part returns `{ layer: svg }`; the layer decides the draw order and the joint it attaches to (`RIG.layers`). Outfit example: `body` (upper body down to the waist, y=194), `hem` (lower skirt, top edge hidden under the belt), `arm/fore L,R` (sleeves) |
| Colour | Only the `C.P.*` palette (skin, hair, robe, trim, accent…) — characters change colour without redrawing |
| Stroke | Outline 2.6–3.2 (`stroke()`), inner detail 1.4–2, black shading 8–14 % (`shadow()`) |
| Parameters | `params`: scale / scaleX / scaleY / dx / dy around `pivot`, with min–max — AI and people adjust within a safe range |

## 2. Views (a required axis for every official part)

- **Front** — `draw(C, st, vals)`.
- **Real 45° drawing** — `views.q45(C, st, vals)`. The standard version **faces screen-left** (the screen-right hand is on the near side); right 45° = mirrored by the engine.
- **90° / 135° / back** (8 directions, v0.7.0) — `views.q90` (side view), `views.q135` (diagonal back), `views.q180` (back). Same turn-left convention; right = mirrored. When a view is missing, the engine **borrows the nearest one** (q90 → q45; q135 → q180 → q45; q180 → front). **Frame** parts must have all 4 (tests block it).
  In back views the engine hides the face automatically, brings the back item in front of the body and moves hand-held items behind the body. Data parts declare `views.q90|q135|q180` = `drawn` (with layers) | `same` (= the 45° version) | `front` | `hide`.
- **Slight 3/4** — the engine slides it with parallax automatically, nothing to draw.
- Missing `q45`: the engine slides temporarily (φ = 32°) so the part still works, and the gate reports the gap. **The official library must not have gaps** (tests block publishing).

The engine handles the shared work — parts do **not** deal with:
eye / brow / mouth positions at 45° (`GC.Q45`), face-bound effects (`fx.face = true` → mapped automatically), a hand raised to the face following the mouth, the far arm going behind the body, mirroring, reversing the body tilt, posture × movement × motion.

## 3. 45° projection tools (`GC.helpers`)

| Kind of detail | Tool | Example |
|---|---|---|
| Bound to the face (beard, moustache, mask patterns) | `face45(C, svg, clipHead?)` — the far half compresses with the far eye, the near half shifts with the near eye, the same projection as the eyes / mouth | three-strand beard, tiger beard, Peking-opera mask |
| On the body (collar, belt, breastplate, robe centre line) | `body45(svg, TORSO_UP \| HEM)` — pulls towards the new centre line x = 88, clipped to the body shape | court robe, battle armour |
| Its own shape (hair, hats, headscarves, capes, shoes) | **drawn by hand** following the standard left-facing version: the nape side (right) shows hair / the back mass, centre details shift left, the side face is darker | wrapped headscarf, official's hat, spiky hair |
| Unchanged when turning (chibi trouser legs…) | declare `views.q45 = draw` — states explicitly that it was reviewed | short trousers |

### DATA parts can use all the tools above (v0.13)
Parts from agents / users are SVG data and cannot call functions — so the frame offers three substitutes, all passing through the safety filter:

| Need | Write in the data | What the engine does at render time |
|---|---|---|
| Cover the whole head in its exact shape (mask, face paint, hair mass at the nape) | `<path d="{shape}" …/>` | replaced by the character's real head outline — round / square / oval, for the view being rendered |
| Face-bound detail in angled views | `<g class="gc-f45">…</g>` · clipped to the head: `gc-f45c` | `face45` (clipped by the head outline with `gc-f45c`) |
| Body / skirt detail in angled views | `<g class="gc-b45t">…</g>` · skirt: `gc-b45h` | `body45` with `TORSO_UP` / `HEM` |
| A mask that fills the eye area | `"eyeArea": "#rrggbb"` | the colour around the eyes |
| A long weapon | `"tall": true` (· `"upright": false` if it should not stand straight along the wrist) | put away when a motion needs both hands |

Projection marks are only valid on `<g>` inside `views.*` (the front version is not projected); `{shape}` only in the `d` of character parts (backdrops have no head).
A real sample: the Tam Quốc theme set (`studio/mau/tam-quoc.json`) — 26 data character parts, rebuilt from the code-written v0.5 set with `archive/tamquoc/port.js`, reaching the same 45° quality and adding 135° / back versions for hair.

## 4. Steps to create a part

1. **Pick the slot + layer**: which slot the part belongs to (`hat`, `outfit`…) and which layers it returns. Do not create a new layer when an existing one is enough.
2. **Draw the front** following the anchors and the palette; declare `params` if there are variants (hat height, beard length…).
3. **Draw 45°** with the tools in section 3 (prefer `face45` / `body45`; draw by hand when the part has its own shape).
4. **Review on the mannequin**: Studio › Parts & backdrops › click the part → Inspection bench (5 views: front · 45° · 90° · 135° · back × standing, surprised, running, sitting). Do not review on a particular character.
5. **Gates + tests**: `bash tools/test.sh` (licence, parameters, renders all 18 expressions × 32 activities × 2 facings × 10 views, full 45° coverage; frame parts have all 8 directions).
6. **Publish**: change `VERSION` + `CHANGELOG.md`, push `main` — CI creates the Release and the installs update themselves.

## 5. Character = combination, not drawing

A character is only a JSON recipe: chosen parts + parameters + colours + its own traits (`expressions`, `identity`). To give a character more abilities (views, new poses…) → **add parts / extend the frame**, do not edit the character.

## 6. One single write gate — every agent uses the same standard

Three entrances, **one** gate: no path writes straight into the store.

| Who creates | Through | Gate |
|---|---|---|
| External agents (Claude Code, Claude web/desktop, Cursor…) | MCP — 58 tools (`genchibi agent tools`) | `saveAssetChecked` / `savePartChecked` |
| The AI in the Studio chatroom (LLM API: OpenRouter, DeepSeek, MiniMax…) | A function-calling loop over **the same MCP tool set** (except the system tools and the AI-voice tools that use requests — `render_voice`, `design_voice`: owner only), with the same MCP instructions | as above |
| Studio users / HTTP API callers | `PUT /api/assets`, `POST /api/parts` → the same two functions | as above |

- The only blocking rule, `GC.blockingGates`: structural / safety errors (unknown part, licence, parameters, cannot render an expression / activity) block in every status; identity marks are required for **Published** (drafts are usable right away in the project without identity marks — decision Q3, 2026-10-18).
- Agent parts are **SVG data** (a safe subset, colour tokens) — the engine reads and re-renders them, and checks them again when the Studio loads them.
- The `preview_part` tool returns the inspection bench; `get_part_spec` returns this very frame in machine-readable form — agents always get the standard from the system, never guess.
- The test `tools/test-agent.mjs` uses a simulated LLM to assert: the AI writes only through tools, malicious SVG is blocked, system tools are refused, the HTTP API cannot bypass the gate.

## 7. Adding a new asset TYPE (two worked examples: equipment items, scenes)

A new asset type is not "a new drawing kit" but **a new way of combining on the same frame**. With these 8 parts it plugs into the factory:

| # | Part | Equipment item | Scene |
|---|---|---|---|
| 1 | **Closed vocabulary** (enum) | `GC.ITEM`: type → slot worn, rarity, stats | `GC.SCENE`: 6 backdrop layers, 8 spots, 4 times of day, 7 weathers, scene colour tokens, budget |
| 2 | **Combination data, no redrawing** | points to existing parts + its own palette + parameters; one part → many items | points to existing backdrops by layer (+ offset, flip) + props (position, scale, depth layer) + palette + time + weather; 27 backdrops → 8 scenes, changing the time only changes tokens |
| 3 | **Check function** (`check…`) | `checkItem` | `checkScene` (backdrops really exist on the right layer, hex per scene token, numbers clamped to range, plain text), `checkCast` (the cast) |
| 4 | **Gate** (`…Gate`) | `itemGate`: data, licence, 45° (info), renderable | `sceneGate`: data, backdrop licence, renderable, **actors can be placed on every spot**, budget (info) |
| 5 | **Stands on its own** | `itemSvg`: icon, card | `sceneSvg`: a 640×360 image (empty or with actors) |
| 6 | **Connects to other types** | characters wear it via `look.equip.<slot>` | characters stand on the **engine's standard spots** (`cast`), rendered with the same `svgBody` → full 45°, activities, equipment; scripts are placed in a scene with `event.scene` + `step.spot` |
| 7 | **One write gate** | `saveItemChecked` (MCP, `POST /api/items`, AI chatroom) | `saveSceneChecked` (MCP `list_scenes` / `validate_scene` / `save_scene` / `render_scene`, `POST /api/scenes`, AI chatroom); new backdrops go through the parts' own `get_part_spec` → `preview_part` → `save_part` |
| 8 | **Studio + tests** | Library › Items; Workshop › Item editor; tests with a valid sample as the baseline | Library › Scenes; Workshop › Scene editor + Parts & backdrops; tests with a valid sample as the baseline + **the rule "every official backdrop must be used by at least one scene"** |

### Backdrops (the raw material of scenes)
- Canvas 640×360. `sky` / `far` / `mid` / `ground` / `front` are drawn over the whole canvas (horizon ≈ y 230–260, ground from y ≈ 258); `deco` (props) are drawn around the origin (0,0) = the prop's foot, rising towards negative y — the engine places them by x, y, scale, flip.
- Only **scene colour tokens** (`{sky}`, `{grass}`, `{wood}`…) — changing the time (night, dusk) and each scene's own palette need no redrawing. Do not use character tokens.
- A flat, soft style, thin or no outlines: bold-outlined characters must stand out from the backdrop.
- Draw order: sky → (stars at night) → distant view → (fog) → buildings → ground → back props → back row → middle props → front row → front props → foreground → weather → time-of-day colour → (fireflies).
- Budget (L-42): a scene is the image tier (static SVG); actors ≤ 8, props ≤ 10, weather particles ≤ 60; rain / snow come from a seeded pseudo-random generator → the same scene always gives the same image (stable cache).

## 8. Three layers — three apps: Workshop · Library · Create (spec, in Vietnamese: `docs/spec/DAC-TA-3-GIAI-DOAN.md`)

| | **Workshop** `/xuong` | **Library** `/thu-vien` | **Create** `/tao-tac` |
|---|---|---|---|
| What it is | the core frame (theme-neutral) + the place to **create assets from the frame** | assets that passed the gates, **organised by theme project** | **Works**: films / stories with the AI director |
| Holds | skeleton, rules, parts, backdrops, pose & expression frames, gates; New asset, editors (AI assistant in the right-hand dock) | theme projects → characters, items, scenes | scripts, shots, finished scenes, the final stage, loose scripts from agents |
| Jobs | pick a frame → parameters → review → gate → save into a project | view, **take away** (images, 8-direction sprites, code), download / import **project bundles** | list of works → film room (AI director in the dock), play the whole sequence, **export HTML films**, storyboard |

One-way flow: **Workshop → Library → Create → finished product**. The frame is never modified: saving onto the frame (even from the Studio) makes a copy under "Mine".
Assets created by users or AI are saved as **drafts in the project** and usable right away — there is no approval step (Ryan, 2026-10-18). When the AI director is missing a character / scene, it goes into the Workshop and creates it (in the right project, through the gates).

## 7. Whole packs as JSON (v0.26)

Head shapes, eye / brow / mouth styles, props attached to hand joints, effects, motions, activities, mood variants and the characters themselves can all be written as **data** and registered with `GenChibi.registerDataPack` — see [PACK-DATA.md](PACK-DATA.md).
