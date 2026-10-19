# Topic: item — equipment made from an existing part

**Goal:** an item (weapon, hat, armour…) with colours, stats and rarity; characters wear it via `look.equip`.

## Steps
1. `list_items` — see existing items; `get_catalog` → `items.types[]` (`id` ↔ `slots`), `items.rarity`, `items.stats`.
2. Write the item: `id`, `name`, `type` (`weapon` → `heldR`, `offhand` → `heldL`, `helmet` → `hat`…),
   `rarity`, `equip: { slot, part, palette }` (an existing part ref), `stats` (0–999), `description`, `"project"`.
3. `validate_item` with `{ "item": <item> }`.
4. `save_item` with `{ "item": <item> }` → key `local.my/<id>`.
5. `render_item` with `{ "key": "local.my/<id>", "mode": "card" }` (or `icon`, or `equipped` + `character`).

An item of type `weapon` in `heldR` makes its wearer able to use weapon actions.

## Example
<!-- example: item.json -->
