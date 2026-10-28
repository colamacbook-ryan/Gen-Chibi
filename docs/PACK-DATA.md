# Data packs — a character pack as pure JSON (v0.26)

A **data pack** (`gen-chibi.pack/1`) carries everything a look needs — colour tokens, eye / brow / mouth styles, head shapes, parts, props, effects, motions, activities, even the characters — as one JSON file. No code, no functions. Signature art lives in the owner's pack, never in the engine.

```js
const r = GenChibi.registerDataPack(json);   // checks the WHOLE pack first; any error → nothing registered
r.errors   // [] when ok · r.warnings (partAdvice) · r.counts · r.pack
GenChibi.checkDataPack(json)                 // dry run → { errors, warnings, def }
GenChibi.unregisterPack('owner.id')          // remove everything the pack added
```
Re-registering the same pack id replaces it. Ids already owned by **another** pack (eye pose, motion, token…) are refused; frame ids can never be overwritten. A pack's characters must pass `gate()` (draft status: identity not required) or the whole pack is rolled back.

## Pack object
| key | content |
|---|---|
| `format` `id` `name` `owner` `license` `version` `description` | `id` is `word.name`; `owner` and `license` are required |
| `tokens` | `{ name: "#hex" }` or derived `{ name: { from, to?, t? } }` (= `from` mixed `t` toward `to`; a character that does not set the token gets the derived colour) |
| `eyeStyles` `eyePoses` `browStyles` `browPoses` `mouths` | see below |
| `parts` | the existing data-part schema (`checkDataPart`) + **head shapes** + **mood variants** |
| `props` `fx` `motions` `activities` | see below |
| `assets` | character recipes (`look.parts` refs may be plain ids of the pack) |

## Safe expressions and templates
SVG strings go through the same filter as every data part (only `g path circle ellipse rect line polyline polygon`, hex or `{token}` colours). Numbers are written `{=expression}`: numbers, variables, `+ - * / %`, comparisons, `&& || !`, `c ? a : b`, and `min max abs sqrt round floor ceil sin cos pow clamp iff`. No `eval`; results are clamped to ±9999 and rounded to 2 decimals; templates are checked by expanding them with sample numbers and running the SVG filter. Colour tokens: the palette (`{skin}`, `{hairShade}`, `{rim}`…), `{ink}`, and `{eyeArea}` (eyes only).

`svg` is a string or an array of `"…"` / `{ "if": "expr", "svg": "…" }` (the part is drawn when the expression is non-zero).

## Eyes (E5, E9)
Built-in variables: `x y` (eye centre) · `w h` (style half-size) · `side` (−1 left, +1 right) · `lid slant` (style values or 0).
```json
{ "id": "my-eye", "w": 12, "h": 14.5,
  "vars": { "k": 1, "pr": 5.4 },                // defaults
  "calc": { "ew": "w*k", "px": "x+..." },        // computed AFTER the pose set its own vars
  "template": [ "<ellipse cx=\"{=x}\" cy=\"{=y}\" rx=\"{=ew}\" .../>", { "if": "lidf", "svg": "…" } ],
  "poses": { "normal": {}, "half": { "vars": { "lidf": 0.55 } }, "happy": { "svg": "…" } } }
```
Order per pose: `vars` → pose `vars` → `calc` → draw. A style's `poses` override the global eye poses with the same id (E9); poses missing there fall back to the global ones. Every id in `poses` must exist globally (register it in the pack's `eyePoses`, or it is a built-in). `eyePoses: [{ id, vars?, svg }]` are global poses. `browStyles: [{ id, w, len }]`, `browPoses: [{ id, rot, dy, arc, rotR?, dyR? }]`, `mouths: [{ id, vars?, svg }]` (variables `x y` = mouth anchor).

## Head shapes (E5)
A part with `slot: "head"` and `shape` (path d), optional `shape45 shape90 shape135`. Layers are usually `ears`, `head` (`<path d="{shape}" …/>`), `shade`. Other parts' `d="{shape}"` fit it in every view.

## Mood variants (E4)
```json
"variants": { "mode": "replace", "mood": { "sad": { "hat": "<svg…>" }, "angry": { "hat": "…" } } }
```
Keys: a mood (`calm happy shock think sad angry smug`, derived from the resolved eyes / brows / mouth by `GenChibi.moodOf`) or a state id (`rage`…); the mood wins. `replace` (default) swaps the named layers, `append` draws on top of the base layer. Drawn views (`views.q45` …) can carry their own `variants`; `same` / `body45` / `face45` reuse the front ones.

## Props attached to hands (E8)
```json
{ "id": "finger", "anchor": { "joint": "handR", "dx": 0, "dy": -6, "rot": 0, "scale": 0.5, "z": "front" },
  "layers": { "held": "<svg in hand-local coordinates; (0,0) = the grip point>" } }
```
`joint`: `handL | handR | hand` (= the hand holding it). The prop lives on the hand joint, so it follows the arm in every pose and view. `z: "front"` (default) draws above the hand and is not hidden by a motion's `hide`; `"held"` uses the held-item layer. Without `anchor`, layers `propBack propMid propFront heldL heldR` use stage coordinates as before.

## Effects, motions, activities
`fx: [{ id, face?, layers: { fxBack|fxHead|fxFront|cheeks: svg } }]`.
`motions: [{ id, dur, still?, hide?, hold?, props?, tracks: { joint: { x|y|rot|sx|sy: [[t, v], …] } } }]` (t increasing in [0,1], ≤ 16 keys).
`activities: [{ id, label, group, posture?, move?, action?, state?, face?, fx?, props? }]` — refs must exist; ids must not clash with a state or a choreography move.

## Engine options added in 0.26
| | |
|---|---|
| `look.params.rig.size` | min lowered to **0.6** (default 1 unchanged) |
| `look.params.rig.legs` | 1–1.8 long legs: thigh stretched, shin kept, body raised so feet stay on the ground (postures `lie fly swim` do not lift) |
| `palette.ink` · `svgString(…, { ink })` | outline colour of the engine's own strokes and `{ink}`; option beats palette beats `#2b211d` |
| `svgString(…, { outline: { color?, width?, sticker? } })` | outline + white sticker **baked into paths** (no `filter`): silhouettes of every layer re-drawn with wide strokes under the real layers. `width` 0.5–12 frame units (default 3, compensated for joint scale); `sticker: true | number | { width, color }`; `skip: [layer…]`. Faint details (opacity < 0.5) and hairlines are left out of the silhouette. Also works in `render.full` / `image` / `idle` (`opts.outline`) |
| tokens `hairShade hairLight rim robeShade robeLight trimShade glow` | in the default palette, derived from `hair skin robe trim accent` unless the character sets them |
