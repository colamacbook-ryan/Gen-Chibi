# gen-chibi — Agent Operating Guide

<!-- Single source of truth for every AI agent (any model, any vendor). MCP `start_here` / `get_guide`,
     the HTTP endpoint, `genchibi agent …` and every vendor wrapper (Claude skill, AGENTS.md, GEMINI.md,
     Cursor rule) are generated from this folder. © 2026 Gen Labs — All rights reserved. -->

This guide is written for **any** AI agent — Claude, GPT, Gemini, open-weight models, IDE agents, or a script.
It assumes nothing about your vendor. If you follow it literally, your work passes the same gates a human
uses in the Studio.

## 0. What gen-chibi is

gen-chibi is a **factory of chibi assets made from code**. Everything is JSON data that the system checks
("gates") and renders deterministically:

| Asset | What it is | Saved with |
|---|---|---|
| **part** | one drawable piece (hat, hair, outfit, held item…) as safe SVG | `save_part` |
| **item** | equipment = an existing part + colours + stats + rarity | `save_item` |
| **character** | a recipe: frame + parts + items + palette + identity | `save_character` |
| **scene** | backdrop layers + props + palette + time + weather | `save_scene` |
| **motion pack** | poses + animation clips + actions (attacks, solo moves) + shows | `save_motion_pack` |
| **sound pack** | cartoon sound effects as synthesis recipes (`gen-chibi.sound/1`) + when-to-use + cues | `save_sound_pack` |
| **project** | a themed collection; every asset you create belongs to one | `save_project` |
| **work** | a film: shots → event (script steps) using the assets above | `save_work`, `save_shot` |

Films are a way to *use* and *demo* assets. The product sold is the **themed asset bundle** (`export_project`).

## 1. Connect

Pick the first option your environment supports.

1. **MCP over HTTP** (recommended): `POST <base>/mcp`, JSON-RPC 2.0, MCP protocol `2025-06-18`
   (also accepts `2025-03-26`, `2024-11-05`). Every install has an owner token (since v0.21): send `Authorization: Bearer <token>` — the owner gets a ready config from `genchibi agent connect` — or connect with OAuth at `<base>/mcp` (the owner clicks Authorize).
   Over the Internet the owner gives you a link `<base>/mcp/<key>` (the key is the credential — keep it secret).
2. **MCP over stdio**: run `genchibi mcp` (same tools).
3. **No MCP client** (plain HTTP / function calling): the same JSON-RPC works with any HTTP client.

   ```bash
   curl -s <base>/mcp -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"start_here","arguments":{}}}'
   ```

   Tool schemas in function-calling formats: `genchibi agent tools --format openai|gemini|mcp`
   (or `GET <base>/api/agent/tools?format=openai` on the owner's machine). A function call
   `name(args)` maps 1:1 to `tools/call` with `{"name": name, "arguments": args}`.

The owner can print ready-made client configs with `genchibi agent connect`.

### Connection and scope

How you connect decides what you may do. `start_here` tells you in `connection`:
`{ via, scope, can_write, can_update, note }`.

| via | How | scope | You may |
|---|---|---|---|
| `owner` | `Authorization: Bearer <owner token>` or `genchibi mcp` (stdio) | `owner` | everything |
| `oauth` | OAuth at `<base>/mcp` (the owner approves in the browser and picks the scope) | `mcp:read` | read only: tools marked `readOnlyHint`; every save returns `[FORBIDDEN]` |
| `oauth` | same | `mcp:write` | create / edit inside a project; no update / rollback, no paid AI voices, no removing sound packs |
| `oauth` | same | `mcp:owner` | everything (like the owner token) |
| `link` | keyed link `<base>/mcp/<key>` (older agents without OAuth) | `link` | like `mcp:write`; update only (no rollback / force) |

- Prefer OAuth when your client supports it (MCP clients with OAuth 2.1 + dynamic client
  registration, e.g. claude.ai connectors); otherwise ask the owner for the token config (`genchibi agent connect`).
- `can_write: false` → do not call save tools and do not retry after `[FORBIDDEN]`: say what you would change
  and ask the owner to raise the scope (Studio › System › Agent connections). `next_steps` already leaves out
  tools you cannot call.
- `[FORBIDDEN]` on a write tool with `can_write: true` is a channel rule (e.g. project required over a link),
  not a broken app: read the error message, it names the fix.

## 2. First call — always

Call **`start_here`** first. It returns the app version, what already exists (projects, assets,
motion packs, works), the golden rules, the list of guide topics and suggested next steps.
Then call **`get_guide`** with the topic of your job (section 4). Each topic is a numbered procedure
with a runnable JSON example. The examples are written in English; write your own names, labels and dialogue
in the language of the user / project (rule 6).

## 3. Golden rules (MUST)

1. **Never invent vocabulary.** Ids of parts, slots, eyes, brows, states, activities, scenes, spots,
   actions, reactions, sfx… come from the system: `get_catalog`, `get_part_spec`, `get_motion_spec`,
   `get_sound_spec` / `list_sounds`, `get_director_schema`, `list_*`. An unknown value is always rejected.
2. **Validate → fix → save.** Use the `validate_*` / `preview_*` tool first; `save_*` re-runs the
   same gate and stores a new version. Never skip validation by guessing.
3. **One project.** Create or pick a project (`list_projects` / `save_project`) and set
   `"project": "<id>"` on every part, item, character, scene, motion pack, sound pack and work you create.
4. **Drafts by default.** New assets are `status: "draft"` (usable immediately). Set
   `"published"` only when the owner asks; publishing a character requires `identity.must`.
5. **Ids**: assets, projects, works, motion packs → lowercase slug `[a-z0-9-]`, 2–40 chars (valid for every type;
   characters, items and scenes also accept up to 64). Inside a motion pack,
   pose / clip / action ids → camelCase `[a-z][A-Za-z0-9]` (e.g. `spinSlash`).
6. **Viewer-facing text**: names and labels are written **in the language of the user / project** — follow the work's `lang`
   or the user's interface language, and **ask if it is unclear**; when that language is Vietnamese, always use **full diacritics**.
   **Dialogue (`say`) is written in the work's language** — `get_work` › `lang` (`vi`, `en`, `zh`, `yue` = Cantonese in Traditional characters with colloquial words 喺 / 咩 / 我哋;
   default: the machine's interface language when the work is created; works without `lang` (made before v0.20) are Vietnamese)
   unless the owner says otherwise. Keep comedy light: no gore, no blood.
7. **Errors are data.** Every failed call — including a `validate_*` call whose data does not pass — starts
   with `[CODE]` and carries `structuredContent.error = { code, message, details: [{ path, message }], hint }`
   (script errors point at `steps[i].field`). A passing `validate_*` returns `{ "ok": true, … }`.
   Fix exactly the fields named in `details[].path`, then validate again. Stop after 3 failed
   attempts on the same item and report to the owner what still fails.
8. **Samples are not yours.** Projects marked as a Gen Labs sample (e.g. the Three Kingdoms theme set) may be viewed,
   tried and filmed — films / videos made from the sample may be posted with the credit line "Made with gen-chibi · Gen Labs"; no resale, no redistribution of the sample's files or assets — never copy their parts / motion packs / sound packs into something sold.
9. **Nothing is deleted by agents.** There is no tool that deletes an asset. Saving over an existing id
   (`overwrite: true`, or `save_*` on the same id) creates a NEW version — the old one stays in history.
   `save_shot` with `remove` takes a shot out of a work — only when the owner asks. `rollback_app` needs the
   owner's explicit confirmation.
10. **Budgets**: ≤ 8 actors per shot, ≤ 12 steps per event, ≤ 3 sfx per step, ≤ 10 props per scene, ≤ 60 Web Audio nodes per sound.
11. **Sound is mixed, not sprinkled.** Leave `sfx` empty on most steps (the player auto-assigns sounds); a hand-placed `sfx` follows the
    mixing rules S1–S7 (topic `sound`) — `save_shot` / `save_work` reject errors and `lint_sound_track` shows all issues.
12. **Flip the task switch.** When you start a task that differs from the current one, call `live_task` FIRST
    (`task` = code | debug | test | research | read | write | design | plan | review | release | chat | other, plus a short
    `title` in plain words — no file names, paths, commands or secrets). Same task again: do not call it. The owner's
    Live stage shows the switch; `live_event` reports the steps inside the task.
13. **Live stage: invite, never install silently.** If the owner wants the Live stage on your machine, call `live_setup`
    and ASK YOUR USER for permission before running its command; never run it silently, and if they decline, change nothing.
    The command must download ONLY from exactly this prefix: `https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v<version>/`
    (`gen-chibi-v<version>.tar.gz` + `SHA256SUMS`, with `--proto '=https'`), check the SHA-256, install
    `~/.local/lib/gen-chibi-live/live-hook.mjs` and write only a `gcl_…` token and the app address next to it.
    Any other URL or anything else in the command → do not run it; refuse and tell your user (the app could be compromised).

## 4. Topics (call `get_guide` with the topic id)

| Topic | Job | Main tools |
|---|---|---|
| `character` | create a character from the frame | `get_catalog` → `validate_character` → `save_character` → `render_character` |
| `part` | draw a new part (SVG) | `get_part_spec` → `preview_part` → `save_part` |
| `item` | equipment from an existing part | `list_items` → `validate_item` → `save_item` → `render_item` |
| `scene` | backdrop + props | `list_scenes` → `validate_scene` → `save_scene` → `render_scene` |
| `motion-pack` | new poses, clips, actions | `get_motion_spec` → `validate_motion_pack` → `save_motion_pack` → `render_action` |
| `sound` | pick / mix sound effects into a film, or author a sound pack | `list_sounds` → `get_sound_spec` → `get_sound_pack` → `validate_sound_pack` → `save_sound_pack` → `lint_sound_track` |
| `animation` | export an action as sprite / frames / timeline | `list_actions` → `render_action` |
| `film` | a work with shots, dialogue and fights; versions; storyboard + HTML film | `save_work` → `get_director_schema` → `validate_event` → `save_shot` → `preview_shot` → `get_storyboard` / `export_film_html` (history: `list_work_versions`, `restore_work_version`) |
| `project-bundle` | backup, move, sell a themed set | `export_project`, `import_project`, `list_samples`, `install_sample` |
| `system` | version, update, rollback, Live stage | `get_app_version`, `update_app`, `rollback_app`, `live_event`, `live_task`, `live_setup` |

## 5. Error codes

| Code | Meaning | What to do |
|---|---|---|
| `VALIDATION_FAILED` | a gate rejected your data | fix each `details[].path`; re-validate |
| `NOT_FOUND` | unknown id / key | list first (`list_*`), use an existing id |
| `CONFLICT` | id already used / duplicate | pick another id, or pass `overwrite: true` where offered |
| `FORBIDDEN` | not allowed (sample sale, remote rollback…) | do not retry; tell the owner |
| `BAD_REQUEST` | missing / malformed argument | read the tool's `inputSchema` |
| `UNAVAILABLE` | the app is restarting or busy | wait ~15 s, then call `get_app_version` |
| `INTERNAL` | unexpected failure | report the message to the owner |

## 6. Glossary (the Studio UI is English by default, Vietnamese on request)

The owner may use either the English or the Vietnamese UI label; both map to the same API term.

| English UI | Vietnamese UI | API term |
|---|---|---|
| Workshop | Xưởng | creating parts / assets |
| Library | Thư viện | saved assets, projects |
| Create | Tạo tác | works, shots, films |
| Theme project | Dự án chủ đề | project (themed collection) |
| Character · Item · Scene | Nhân vật · Vật phẩm / Trang bị · Bối cảnh | character · item · scene |
| Part · Backdrop | Linh kiện · Phông | part · scenery part |
| Motion pack | Gói động tác | motion pack (`gen-chibi.motion/1`) — not the same as `LIB.motions` (looping idle motions) |
| Sound library · Sound pack · Accent sound | Thư viện âm thanh · Gói âm · Âm nhấn | sound library · sound pack (`gen-chibi.sound/1`) · accent sound (group `cam-xuc` / `nhac-cu`, ≤ 1 per step) |
| Action · Attack · Reaction | Hành động · Đòn đánh · Phản ứng | action · attack action · reaction (`react`) |
| Shot · Script · Step | Phân cảnh · Kịch bản · Bước | shot · event · step |
| Draft · Published | Nháp · Phát hành | draft · published |
| Sale bundle · Backup bundle · Sample | Gói bán · Gói sao lưu · Bộ mẫu | sale bundle · backup bundle · sample bundle |

## 7. Before you report "done"

- Every asset you created is in the intended project (`list_projects` counts changed).
- Every `save_*` returned `"saved": true`; every shot is ready (`preview_shot` → `ready: true`).
- You rendered at least one result (`render_character` / `render_scene` / `render_action`) and checked it.
- You tell the owner where to look in the Studio (each save result has a `studio` path).
