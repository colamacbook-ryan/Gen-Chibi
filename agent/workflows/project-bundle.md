# Topic: project-bundle — projects, backup, move, sell, samples

## Create the project you work in
- `list_projects` — existing projects and their counts.
- `save_project` with `{ "id", "name", "description" }` (slug id). Then set `"project": "<id>"` on everything you create.

<!-- example: project.json -->

## Export / import
- `export_project` with `{ "id": "<project>" }` → a backup bundle `gen-chibi.project/1`: characters, items, scenes,
  the parts they use, motion packs, sound packs, works — self-contained: assets, motion packs and sound packs that the works use are pulled
  in even when they belong to another project.
- `export_project` with `{ "id", "sale": true }` → a **sale bundle**: only `published` assets, no works.
  Blocked (`FORBIDDEN`) when the project is a sample or uses sample content. Sample content is recognised by
  its drawing / motion data (each clip with its poses resolved), so changing ids or names does not help; the
  licence covers the rest. Never copy sample parts, motion packs or sound packs into something sold (golden rule 8).
- `import_project` with `{ "bundle": <bundle> }` — every item passes the same gates as creating it.
  `CONFLICT` lists clashing ids; repeat with `"overwrite": true` only if the owner agrees.

## Samples (Gen Labs)
- `list_samples` → bundled sample projects, installed or not, and whether an update exists.
- `install_sample` with `{ "id": "<sample id>" }` (`"overwrite": true` to update an installed sample).
- Samples: view, try and make films; films / videos made from the sample may be posted and monetized with the credit line "Made with gen-chibi · Gen Labs"; don't resell or redistribute the sample characters or assets themselves, or use them as a logo / brand — not for sale.
