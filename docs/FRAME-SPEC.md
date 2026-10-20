# Core frame spec — applies to EVERY asset

**English** | [Tiếng Việt](QUY-CACH-KHUNG.md)

> The `gen.khung` core frame is the drawing spec turned into shapes. Every asset created (by Gen Labs, users or AI) must match this spec,
> and is checked automatically by the gates before it enters the Library. Technical details for drawing parts: `docs/PART-WORKFLOW.md`.
> © 2026 Gen Labs — All rights reserved.

## 1. Characters — the mannequin frame (`gen.khung/ma-no-canh`)

| Item | Spec |
|---|---|
| Canvas | 200 × 240 units; the feet touch the ground at **(100, 228)**; visible area −24…224 × −18…240 |
| Head | x 50–150, y 54–147 (face centre 100, 100); eyes (80 / 120, 108); mouth (100, 131) |
| Body | upper body y 146–194 (waist 186); hips / skirt y 188–212; legs y 198–228 |
| Joints (18) | hips → torso → head; shoulder → elbow (74 / 126, 177) → wrist / palm (72 / 128, 193); groin → knee → ankle |
| Slots (11) | head shape · mask · hair · beard · hat · outfit · back · trousers · shoes · left hand holds · right hand holds |
| Views (8 directions + slight 3/4) | front · 45° · 90° (side view) · 135° (diagonal back) · back — each angled view has a left / right version (the standard version turns left; right = mirrored) + a slight 3/4 left / right (the engine slides it). The 8-direction sprite runs clockwise: front · left45 · left90 · left135 · back · right135 · right90 · right45 |
| Expressions | 18 (eyes + brows + mouth + effects + motion) |
| Movement | 12 postures × 10 movements × 58 looping motions; 32 preset activities |
| Frame motion set (v0.16, `gen.dong-tac`) | theme-neutral: **unarmed + comedy** — punch (to the face, rubber arm), kick, face push, tomato throw; **generic weapon moves** — thrust, sweep (`needs: weapon`); solo — angry stomp, pose, jump for joy, salute, wave, stretch, head scratch, startle, flip; × 5 reactions (hit, flip-fall, dizzy, parry, dodge). Moves specific to one theme live in that set's **motion pack** (e.g. Tam Quốc: combo, spinning slash, leaping chop, spear twirl) |
| Required for parts | a 45° version (except hand-held items), licence, source; passes the gate in every expression × activity × view. **Frame** parts draw all 4 angle shapes (q45 · q90 · q135 · q180); when a theme asset is missing a view, the engine borrows the nearest one |

## 2. Items — 10 representative blocks by shape

> A block is only a **shape**. A hand-held item is a **weapon** (unlocking the "needs weapon" moves) when a character holds it through **equipment of type Weapon**, or a part that declares `grip: "weapon"`; fans, books, cups… are `grip: "prop"`, tools are `"tool"` (v0.16).

| Block | Slot | Attachment point | Parameters | Base for |
|---|---|---|---|---|
| Long stick | right hand holds | right palm (128, 193) | length 0.7–1.3 | spear, lance, staff, long-handled blade |
| Short stick | right hand holds | right palm, tilted 24° | length 0.7–1.4 | sword, knife, brush, short stick |
| Flat disc | left hand holds | left palm (72, 193) | size 0.7–1.4 | shield, fan, mirror |
| Box | left hand holds | left palm | size 0.7–1.4 | book, box, letter |
| Sphere | left hand holds | left palm | size 0.7–1.4 | vase, fruit, wine gourd |
| Headwear | hat | top of the head, brim y ≈ 84 | height 0.7–1.4 | hat, headscarf, conical hat |
| Body wear | outfit | torso + skirt + sleeves | width 0.88–1.18 | shirt, armour, robe |
| Back piece | back | shoulders (y 150) → heels (y 222) | — | cape, bag, wings |
| Shoes | shoes | ankles (87 / 113, 221) | — | boots, sandals, clogs |
| Face cover | mask | across the eyes, y 98–116 | — | mask, eye band, face paint |

Item = block + its own palette + parameters + rarity + stats. The icon and card are rendered automatically from the block.

## 3. Scenes — the stage frame (`gen.khung/san-khau-chuan`, `phong-chuan`)

| Item | Spec |
|---|---|
| Canvas | 640 × 360; horizon y ≈ 230–260; ground from y ≈ 258 |
| Layers (6) | sky / wall · distant view · buildings · ground · props (≤ 10) · foreground |
| Spots (8) | front row y 330, scale 0.8: x 100 · 210 · 320 · 430 · 540 — back row y 280, scale 0.62: x 205 · 320 · 435 (dashed marks on the grid floor) |
| Props | drawn around the origin (0, 0) = the prop's foot; placed with x, y, scale, flip, depth layer (behind / between / in front of the actors) |
| Frame prop blocks | box · pillar · tree · rock · table · flag / sign |
| Time (4) | day · dawn · dusk · night — only changes colour tokens + a colour overlay |
| Weather (7) | clear · rain · snow · falling blossoms · blowing leaves · fog · fireflies |
| Budget | actors ≤ 8 · props ≤ 10 · weather particles ≤ 60 |

## 4. Colour
- Every frame uses **colour tokens** only: characters (`skin`, `robe`, `metal`, `wood`, `hat`…), scenes (`sky`, `ground`, `wall`, `stone`, `leaf`…).
- Frames use a neutral grey palette; theme assets change the tokens to "re-dress" — never redraw.

## 5. Creating an asset from the frame (common workflow)
1. Pick a frame (mannequin / item block / scene block).
2. Add parameters, colours, and extra drawn parts in the right slots and layers above.
3. Review on the inspection bench: every view × activity (characters, items) or day / night + actors (scenes).
4. Pass the gates → save into the Library under a theme project.
