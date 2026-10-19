# Topic: project-bundle — projects, backup, move, sell, samples

## Create the project you work in
- `list_projects` — existing projects and their counts.
- `save_project` with `{ "id", "name", "description" }` (slug id). Then set `"project": "<id>"` on everything you create.

<!-- example: project.json -->

## Export / import
- `export_project` with `{ "id": "<project>" }` → a backup bundle `gen-chibi.project/1`: characters, items, scenes,
  the parts they use, motion packs, works.
- `export_project` with `{ "id", "sale": true }` → a **sale bundle**: only `published` assets, no works.
  Blocked (`FORBIDDEN`) when the project is a sample or uses sample content (detected by content, renaming
  does not help).
- `import_project` with `{ "bundle": <bundle> }` — every item passes the same gates as creating it.
  `CONFLICT` lists clashing ids; repeat with `"overwrite": true` only if the owner agrees.

## Samples (Gen Labs)
- `list_samples` → bundled sample projects, installed or not, and whether an update exists.
- `install_sample` with `{ "id": "<sample id>" }` (`"overwrite": true` to update an installed sample).
- Samples are for viewing, trying, filming — not for sale.
