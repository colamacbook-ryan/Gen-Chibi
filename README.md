# gen-chibi

**English** | [Tiếng Việt](README.vi.md)

**gen-chibi — a factory for themed chibi assets.** From one core frame (mannequin, item blocks, scene blocks) you build characters / items / scenes **in code**, store them in a Library organised by theme project, and **publish** them as themed sale bundles. **Making films** with the AI director is how the assets get used — and a live demo of the Library: chat your way to a script and shots, then export a single HTML file that plays in any browser. Every asset is a **JSON recipe** that passes automatic gates; the engine renders SVG / PNG / 8-direction sprites, or a "live" character that changes expression at runtime.

**Quick start:** open the Studio → **✨ open the sample project "Văn phòng vui"** (Fun Office) → Create → click a work in the table → *Review* tab → ▶ Whole film → *Publish* tab → *Film (HTML)*. To see a complete theme set: **🏯 open the sample theme set "Tam Quốc"** (Three Kingdoms: 7 generals · 13 pieces of equipment · 8 scenes · a 6-shot film with staging, voices, sound and a martial-arts fight — built entirely from the core frame; a Gen Labs sample, not for sale). Full guide: [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).

- **Studio** — **3 standalone apps** `/xuong` · `/thu-vien` · `/tao-tac` (desktop, Data Console style), following the flow: **Workshop** — the core frame + **New asset** (pick a frame → parameters → review → gates → save), editors, parts, pose & expression frames, gates; **Library** — assets that passed the gates, organised by **theme project**: download images / 8-direction sprites, copy code, **Draft / Published**, **Backup bundle** (works included) and **Sale bundle** (published assets only), import bundles through the gates; **Motions**, **Sounds** (table of 62 + packs, ▶ play on the row, mixing rules S1–S7, import / download packs) and **Voices** (22 roles × 4 languages, machine voice + AI voice, voice design — the only home of the role voice set; AI settings keep just the key + daily line cap); **Create** — a table of **works** → each work is its own **film room** (an address with its id) with 5 tabs: *Script* · *Shots* (first-frame image, description, scene, cast, steps, duration; a pending diff when the AI proposes an edit) · *Review* (▶ each shot / the whole film, Draft · Needs changes · Approved + notes, "Approved x/y") · *Voice & sound* (language, AI dub, ONE table of locked voices per character + Lock voices for the whole cast, sound mixing rules) · *Publish* (standalone HTML film, storyboard, JSON, bundle); when the AI is missing a character / scene it goes into the Workshop and creates it (in the right project).
- **AI assistant** (v0.18) — **one dock in the right-hand column, present in every area** (no separate chat page any more): its role follows the area (workshop staff · explainer of the core frame + motion packs · Library librarian — only combines / edits existing assets and invites you to the Workshop for new ones · AI director of the open work), a "Viewing: Area › Page › object" bar, **Pin & Spotlight** — `@` / Alt+P pins an element by its real ID into your message, the AI answers with clickable buttons (hover = highlight, click = go there), chat history per work / asset / project. 380 px wide, resizable, collapse with Alt+J.
- **Sound library** (v0.18): 62 exaggerated cartoon sound effects (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA…) + per-project sound packs (Tam Quốc: war drums, horns, hoofbeats…) — synthesis recipes as data `gen-chibi.sound/1`, no audio files; the player assigns sounds to each shot automatically, and 7 mixing rules S1–S7 are checked in both the Studio and MCP; listen right away in **Studio › Library › Sounds** (Data Console table, *Mixing rules* and *Sound packs* tabs: import / download / remove packs), download WAV; sounds travel with project bundles and exported films. See `docs/USER-GUIDE.md` › Sound · Voices.
- **AI director**: the LLM writes scripts / dialogue within the closed vocabulary of the library; the server checks the result and makes the model fix mistakes. When you want a description / steps changed but did not say "just do it", the AI **proposes** the edit; you review the diff, then Apply / Discard.
- **MCP server**: agents from any vendor connect directly to create characters, equipment, scenes, motion packs, sound packs, make films and export animations — no core LLM API cost; one source of agent guidance (`agent/`), bootstrap with `genchibi agent`.
- **Auto-update** from GitHub Releases: SHA-256 check, data backup before switching, automatic return to the previous version if the new one fails.

## Install (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
```

- Needs **Docker** running (macOS: Docker Desktop) or **Node ≥ 18** (`--native`).
- Installs to `~/gen-chibi` by default, port `7480`, reachable from this machine only. Open **http://localhost:7480**.
- Options: `--dir <folder>` · `--port <port>` · `--native` · `--version vX.Y.Z` · `--lang en|vi`.

## Language

English is the default everywhere: installer, CLI and Studio. Vietnamese can be chosen at install time and switched at any time afterwards.

- **At install time:** in an interactive terminal the installer asks exactly one question:
  `Language / Ngôn ngữ: [1] English  [2] Tiếng Việt  (Enter = English)`.
  Without a terminal (CI, pipes) it does not ask and uses English. To choose up front, pass `--lang vi` or set `GC_LANG=vi`:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi
  ```
  The choice is saved as `GC_LANG=en|vi` in the install's `.env`; running the installer again keeps it unless you choose again.
- **Later, for the whole install:** `genchibi lang` shows the current language; `genchibi lang vi` (or `en`) writes `GC_LANG` to `.env` and restarts the app, so the CLI and the Studio default switch together.
- **Per user, in the Studio:** the language switch in the Studio changes the interface for you only and is remembered per server + browser; `GC_LANG` stays the default for everyone else.
- Your own content — character names, scripts, dialogue — is never translated. The *Tam Quốc* sample keeps its Vietnamese content.
- Upgrading from v0.19 or earlier: an install that already has data keeps Vietnamese (set once on the first start of v0.20); only new installs start in English. Switch any time with `genchibi lang en|vi` or the Studio switch. The Studio switch also has a page: *System › Language*.

## Commands

```
genchibi start | stop | restart | status
genchibi update            # check and update now
genchibi logs
genchibi backup | restore <file>
genchibi mcp               # MCP stdio bridge for agents
genchibi token             # set the GitHub token (private repo), hidden input
genchibi lang [en|vi]      # show / set the language (CLI + Studio default)
genchibi open | uninstall
```

## Core frame (Workshop)
Every asset is built from one **theme-neutral core frame** (like the greybox of game development):
- **Characters:** a bald, unclothed mannequin — 18 joints, 18 expressions, 32 activities, **8 directions** (front · 45° · 90° · 135° · back, on both sides) + a slight 3/4; download 8-direction sprites from the Library.
- **Items:** 10 representative blocks by shape — long stick, short stick, flat disc, box, sphere, headwear, body wear, back piece, shoes, face cover.
- **Scenes:** sky / wall blocks, horizon, building blocks, ground with a scale grid, foreground, box / pillar / tree / rock / table / flag blocks; 8 standard spots.
- One **spec** for every asset: [`docs/FRAME-SPEC.md`](docs/FRAME-SPEC.md). Three-phase specification (Vietnamese): [`docs/spec/DAC-TA-3-GIAI-DOAN.md`](docs/spec/DAC-TA-3-GIAI-DOAN.md).
- The old Tam Quốc set is archived in `archive/tamquoc/` (not loaded into the running app).

## Poses & activities
One frame = **expression** (face) × **base pose** (lower body) × **movement** (cycle) × **motion** (arms) + props + direction. Combinations are never drawn by hand: the engine stacks layers like the animation layers of a game engine.

- 32 preset activities: stand, sit on a chair, sit cross-legged, kneel, squat, lie down · walk, run, tiptoe, jump, crawl, fly, swim, flee · eat, drink, sleep, read, write · slash, thrust, defend, charge, celebrate · scared, faint · bow, fist salute, kowtow, wave, point, cheer.
- Free combination: `{ "state": "panic", "posture": "stand", "move": "run", "motion": "flail", "facing": "left" }`.
- Workshop › Poses & activities: preview and try combinations, download SVG.

## Items (second asset type)
Item = a combination of existing parts + its own palette + rarity + stats; it stands on its own (icon, card) and can be worn by a character (`look.equip`). Library › Items (download icon / card, copy code), Workshop › New asset / Item editor; every item starts from a frame block; MCP `list_items` / `validate_item` / `save_item` / `render_item`.

## Scenes (third asset type)
Scene = a combination of existing backdrops (sky, distant view, buildings, ground, props, foreground) + palette + time (day, dawn, dusk, night) + weather (rain, snow, falling blossoms, blowing leaves, fog, fireflies). Characters stand on 8 standard spots and turn 45° towards each other automatically. A script is placed in a scene with `"scene"` + `"spot"`. MCP `list_scenes` / `validate_scene` / `save_scene` / `render_scene`; new backdrops go through `get_part_spec` → `preview_part` → `save_part`.

## Part workflow
The factory keeps its value in the **frame + workflow**; a character is just a combination of parts. The standard for creating a part (coordinates, layers, front view + 45° (+ 90° / 135° / back), the `face45` / `body45` tools, review on the mannequin, gates, publishing): [`docs/PART-WORKFLOW.md`](docs/PART-WORKFLOW.md).

## Connect agents over MCP (any vendor — Claude, GPT, Gemini, open models, home-made agents)

```bash
genchibi agent connect                 # print connect configs for Claude Code, Cursor, Gemini CLI, Codex CLI, curl (never prints the token)
genchibi agent skill claude            # install the guide as a skill (cursor | gemini | codex | generic: AGENTS.md / GEMINI.md / rule)
genchibi agent guide film              # read one guide topic · genchibi agent tools --format openai  (function-calling schema)
```

Once connected, an agent **calls `start_here` first**, then `get_guide` for the job at hand. The guidance lives in **one source**:
[`agent/GUIDE.md`](agent/GUIDE.md) + `agent/workflows/*.md` + `agent/examples/*.json`. Written in English, model-neutral.
Every example is run for real through the gates in CI: the "agent from zero" test walks the whole flow using only the guide, over plain JSON-RPC.
No MCP client: `POST /mcp` JSON-RPC with curl, `GET /mcp?guide=<topic>`, `GET /mcp?tools=openai|gemini`.
Errors carry stable codes: `[VALIDATION_FAILED]`, `NOT_FOUND`… plus `structuredContent.error.details[].path`.

53 tools, by group:
- **Start:** `start_here`, `get_guide`
- **Characters:** `get_catalog` · `list/get/validate/save/render_character`
- **Parts:** `get_part_spec` · `preview_part` · `save_part`
- **Equipment:** `list/validate/save/render_item`
- **Scenes:** `list/validate/save/render_scene`
- **Motion packs:** `list_actions` · `list_motion_packs` · `get_motion_pack` · `get_motion_spec` · `validate/save_motion_pack` · `render_action` (sprite sheet / frames / timeline)
- **Sound library:** `list_sounds` · `get_sound_spec` · `get_sound_pack` · `validate_sound_pack` · `save_sound_pack` · `delete_sound_pack` (owner only) · `lint_sound_track` (the 7 mixing rules S1–S7)
- **Film:** `get_director_schema` · `validate_event` · `save_event` · `list_events` · `list/get/save_work` · `save_shot` · `preview_shot` · `render_voice` (reads dialogue with a Google AI voice by role + language + accent — works as soon as the owner pastes a key) · `design_voice` (designs a voice for one role: old man, old woman, warrior general…)
- **Projects & samples:** `list/save_project` · `export/import_project` · `list_samples` · `install_sample`
- **System:** `get_app_version` · `update_app` · `rollback_app`

Creating a part: `get_part_spec` → draw (safe SVG, colour tokens) → `preview_part` (inspection bench) → `save_part`. The AI assistant in the Studio (the right-hand dock in every area; in Create it is the AI director) uses exactly this tool set — every write path goes through one gate (see `docs/PART-WORKFLOW.md` section 6).

### Connect claude.ai with `https://your-domain/mcp` — OAuth, just click Authorize (v0.19)
The app is its own OAuth 2.1 authorization server, with RFC 9728 / 8414 discovery, dynamic client registration (DCR), PKCE S256 and expiring tokens stored as hashes. To connect: set `GC_PUBLIC_URL=https://your-domain`, open claude.ai *Customize › Connectors › Add custom connector*, paste `https://your-domain/mcp` and click **Connect**. The app's **Authorize** page appears so you can pick a permission level (`mcp:read` · `mcp:write` · `mcp:owner`), confirmed with the owner token. Manage and revoke in **Studio › System › Agent connections**. If you use a proxy or your own login page, the machine routes (`/mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`) must go straight to the app. A sample Caddy config is in `docs/Caddyfile.oauth.example`; Cloudflare handling and common errors are in `docs/USER-GUIDE.md` › section 6. Installs that ran `genchibi expose` before v0.19 should run that command once more.

### Expose MCP to the Internet — one command, one link
You need a domain whose DNS is managed by Cloudflare (the free plan is enough).

```bash
genchibi expose chibi.example.com   # the first time, opens a browser once to log in to Cloudflare
```

The command does everything: creates a Cloudflare Tunnel, points DNS, **lets only `/mcp` and the OAuth routes through** (the Studio stays on your machine), generates a key, turns on the token for the Studio, restarts, tests a call over the Internet, then prints the **MCP link**:

```
https://chibi.example.com/mcp/<key>
```

An agent pastes the link and is connected — no header needed:
- Claude Code: `claude mcp add -s user --transport http gen-chibi <link>`
- Claude web/desktop: Customize › Connectors › Add custom connector › paste the link (or paste `https://chibi.example.com/mcp` to connect with OAuth, see above)
- Cursor and other clients: `{"mcpServers":{"gen-chibi":{"url":"<link>"}}}`

The link grants MCP access only (it cannot open the Studio or settings). Other commands: `genchibi link` (print the link again) · `genchibi link --check` · `genchibi expose --rotate` (change the key; the old link stops working immediately) · `genchibi expose --off` · `genchibi expose --quick` (temporary `*.trycloudflare.com` link, no account needed, changes on every restart). Docker: the tunnel runs as the `gen-chibi-tunnel` container and comes back up with the app. Node: needs `cloudflared` in PATH.

Manual exposure (another tunnel, LAN): set `GC_API_TOKEN` and `GC_ALLOWED_HOSTS` in `.env`. With a token, every `/api` and `/mcp` call needs `Authorization: Bearer <token>`; without a token, the server refuses every request that comes through a tunnel / proxy.

### Agents update the app themselves
MCP tools `get_app_version` (running version, latest version on GitHub, release notes), `update_app` (downloads the new version, checks SHA-256, backs up, restarts; if the new version fails, it returns to the old one automatically), `rollback_app` (needs `confirm: "ROLLBACK"`).

## Core AI (LLM API)

Studio › System › AI settings: choose OpenRouter, DeepSeek, MiniMax or a custom OpenAI-compatible endpoint, paste the API key (encrypted with AES-256-GCM on the machine, never sent back to the browser). "Test model" runs a trial script and scores it: valid JSON, number of fixes needed, latency, tokens.

## Structure

```
engine/       core.js (skeleton, library, 4-level inheritance, gates), render.js (3 render tiers with budgets), player.js (plays works — shared by the Studio and exported films)
kinds/        character/gen.core.js (core frame: faces, expressions, movement, mannequin body) · khung/gen.khung.js (item blocks, scene blocks, mannequin, standard stage)
studio/       the 3 apps Workshop / Library / Create (one codebase) · mau/ sample projects
server/       local API, updater, core AI, MCP, secret store
locales/      English interface strings (locales/en/*.json — ADR 0007)
launcher.js   runs the current version, watches health after an update, automatic rollback
install.sh    one-command install · cli/genchibi
tools/        test.sh (CI), test-update.sh, test-lang.sh, package.sh
```

## Private repo: update token

When the release repo is private, GitHub answers 404 to every request without a token — both fresh installs and auto-update need a read-only token.

1. GitHub › Settings › Developer settings › Fine-grained personal access tokens › Generate new token.
2. **Repository access**: *Only select repositories* → only `gen-chibi`. **Permissions**: *Contents* = **Read-only** (no other permission needed).
3. Fresh install (a machine without gen-chibi):
   ```bash
   curl -fsSL -H "Authorization: Bearer $GC_GITHUB_TOKEN" https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | GC_GITHUB_TOKEN=$GC_GITHUB_TOKEN bash
   ```
   The installer writes the token to `.env` (chmod 600) and never prints it.
4. Existing install: run `genchibi token` (paste the token, hidden while typing) — the command writes `GC_GITHUB_TOKEN` to `.env` and restarts by itself. Remove the token: `genchibi token --clear`.

The token is only sent to `api.github.com`; when GitHub redirects a file download to its storage host, the token is dropped. The token never appears in `/api/info`, update status, logs or MCP.

## Releases

Edit `VERSION` + `CHANGELOG.md`, then push to `main` (or push a `vX.Y.Z` tag). The `release` workflow runs the tests, packages, creates the tag and the GitHub Release; every install picks it up within 6 hours (or click "Check for updates").

## License

© 2026 Gen Labs — **All rights reserved.** Author: **Ryan** — 090.919.8823. The repo is public for viewing only; no right to use it is granted. See [LICENSE](LICENSE).
