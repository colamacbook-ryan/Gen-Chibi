# gen-chibi

**English** | [Tiếng Việt](README.vi.md)

**gen-chibi — a factory for themed chibi assets.** From one core frame (mannequin, item blocks, scene blocks) you build characters / items / scenes **in code**, store them in a Library organised by theme project, and **publish** them as themed sale bundles. **Making films** with the AI director is how the assets get used — and a live demo of the Library: chat your way to a script and shots, then export a single HTML file that plays in any browser — or a **video** (MP4 / WebM + subtitles + cover, for YouTube / TikTok) straight from Chrome / Edge ([Export video](docs/USER-GUIDE.md#export-video)). Every asset is a **JSON recipe** that passes automatic gates; the engine renders SVG / PNG / 8-direction sprites, or a "live" character that changes expression at runtime.

**Quick start:** open the Studio → **✨ Open the sample project "Fun Office"** → Create → click a work in the table → *Review* tab → ▶ Whole film → *Publish* tab → *Film (HTML)*. To see a complete theme set: **🏯 Open the sample theme set "Three Kingdoms"** ( 7 generals · 13 pieces of equipment · 8 scenes · a 6-shot film with staging, voices, sound and a martial-arts fight — built entirely from the core frame; a Gen Labs sample, not for sale). Full guide: [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).

- **Studio** — **3 standalone apps** `/xuong` · `/thu-vien` · `/tao-tac` (desktop, Data Console style), following the flow: **Workshop** — the core frame + **New asset** (pick a frame → parameters → review → gates → save), editors, parts, pose & expression frames, gates; **Library** — assets that passed the gates, organised by **theme project**: download images / 8-direction sprites, copy code, **Draft / Published**, **Backup bundle** (works included) and **Sale bundle** (published assets only), import bundles through the gates; **Motions**, **Sounds** (table of 62 + packs, ▶ play on the row, mixing rules S1–S7, import / download packs) and **Voices** (22 roles × 4 languages, machine voice + AI voice, voice design — the only home of the role voice set; AI settings keep just the key + daily line cap); **Create** — a table of **works** → each work is its own **film room** (an address with its id) with 5 tabs: *Script* · *Shots* (first-frame image, description, scene, cast, steps, duration; a pending diff when the AI proposes an edit) · *Review* (▶ each shot / the whole film, Draft · Needs changes · Approved + notes, "Approved x/y") · *Voice & sound* (language, AI dub, ONE table of locked voices per character + Lock voices for the whole cast, sound mixing rules) · *Publish* (standalone HTML film, video export, storyboard, JSON, bundle); when the AI is missing a character / scene it goes into the Workshop and creates it (in the right project).
- **AI assistant** (v0.18) — **one dock in the right-hand column, present in every area** (no separate chat page any more): its role follows the area (workshop staff · explainer of the core frame + motion packs · Library librarian — only combines / edits existing assets and invites you to the Workshop for new ones · AI director of the open work), a "Viewing: Area › Page › object" bar, **Pin & Spotlight** — `@` / Alt+P pins an element by its real ID into your message, the AI answers with clickable buttons (hover = highlight, click = go there), chat history per work / asset / project. 380 px wide, resizable, collapse with Alt+J.
- **Sound library** (v0.18): 62 exaggerated cartoon sound effects (BONK, BOING, ZIP, WHAM, SPLAT, TA-DA…) + per-project sound packs (Tam Quốc: war drums, horns, hoofbeats…) — synthesis recipes as data `gen-chibi.sound/1`, no audio files; the player assigns sounds to each shot automatically, and 7 mixing rules S1–S7 are checked in both the Studio and MCP; listen right away in **Studio › Library › Sounds** (Data Console table, *Mixing rules* and *Sound packs* tabs: import / download / remove packs), download WAV; sounds travel with project bundles and exported films. See `docs/USER-GUIDE.md` › Sound · Voices.
- **AI director**: the LLM writes scripts / dialogue within the closed vocabulary of the library; the server checks the result and makes the model fix mistakes. When you want a description / steps changed but did not say "just do it", the AI **proposes** the edit; you review the diff, then Apply / Discard.
- **MCP server**: agents from any vendor connect directly to create characters, equipment, scenes, motion packs, sound packs, make films and export animations — no core LLM API cost; one source of agent guidance (`agent/`), bootstrap with `genchibi agent`.
- **Auto-update** from GitHub Releases: SHA-256 check, data backup before switching, automatic return to the previous version if the new one fails.

## Install (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash
```

- Runs in **Docker**; on Linux the installer installs Docker itself when it is missing (get.docker.com) and keeps going in the same session even before your login picks up the `docker` group (log out and back in later to use `genchibi` without sudo). macOS: Docker Desktop, or **Node ≥ 18** with `--native`.
- Installs to `~/gen-chibi` by default, port `7480`, reachable from this machine only. Open **http://localhost:7480**.
- **First run (v0.23):** the installer's last line says what to do next. On this machine, open **http://localhost:7480** and sign in with **admin / admin** within 30 minutes. That window is opened only by a command on the server (the installer, `genchibi start`, `genchibi open`). It works only while the machine is **not online**, only from this machine (loopback, no proxy) and only until the owner account exists. When it is closed, the login page says exactly why and how to get in. Then:
  1. **Owner account** (required before any page): your username (not `admin`), display name, email (optional — only used as the Let's Encrypt contact for the Caddy path) and a password of at least 12 characters (a memorable phrase works well). `admin / admin` stops working right away.
  2. **Domain:** *Go online* (the same Go online steps as *System › Go online*) or *This machine only*. If an Internet step fails or takes too long, *Use it on this machine for now* lets you in and the home page keeps a reminder.
  3. **MCP check:** a real self-test on this machine (HTTP `/mcp`, owner token, `genchibi mcp` stdio), the connect cards for Claude Code / claude.ai / other agents, then a live check that waits for the first agent call. *Done* unlocks when an agent has connected, or choose *I'll connect an agent later* (the home page reminds you).

  Signing in again before the end takes you back to the step you were on. The browser remembers this device for 30 days. Forgot the password: `genchibi password` on the server. The check itself is broken: `genchibi setup skip` (logged); start over: `genchibi setup reset`. Over SSH: forward the port first (`ssh -L 7480:localhost:7480 <server>`), then open http://localhost:7480 on your computer.
- **Install straight onto a domain** (`--domain` / `--cloudflare`): the installer first asks for the owner username and password (hidden), or reads `GC_OWNER_USER` / `GC_OWNER_PASSWORD` from the environment when there is no terminal (they are never written to `.env`, the command line or the logs). Without them it installs but does **not** go online and prints the two commands to run next (`genchibi password`, then `genchibi online …`). The Studio then opens straight at step 3 (MCP check).
- **Upgrading from v0.22 or earlier:** your password keeps working; the username is `owner` (change it in *System › Owner account*). The home page shows a one-time *Check setup* banner (MCP self-test + connect cards). A v0.21 / v0.22 machine that was online and still waiting for the owner password stays online; set the owner account on the server with `genchibi password`.
- Options: `--dir <folder>` · `--port <port>` · `--native` · `--version vX.Y.Z` · `--lang en|vi` · `--domain <name>` · `--cloudflare` (see [Go online](#go-online-domain-https-mcp-in-one-step)).

## Language

English is the default everywhere: installer, CLI and Studio. Vietnamese can be chosen at install time and switched at any time afterwards.

- **At install time:** in an interactive terminal the installer asks exactly one question:
  `Language / Ngôn ngữ: [1] English  [2] Tiếng Việt  (Enter = English)`.
  Without a terminal (CI, pipes) it does not ask and uses English. To choose up front, pass `--lang vi` or set `GC_LANG=vi`:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh | bash -s -- --lang vi
  ```
  The choice is saved as `GC_LANG=en|vi` in the install's `.env`; running the installer again keeps the language in use unless you choose again (it does not ask, and never changes the Studio default on its own).
- **Later, for the whole install:** `genchibi lang` shows both the CLI language and the Studio default; `genchibi lang vi` (or `en`) writes `GC_LANG` to `.env` and switches the Studio default right away, so the CLI and the Studio default switch together.
- **Per user, in the Studio:** the language switch in the Studio changes the interface for you only and is remembered per server + browser; the Studio default (*System › Language*) stays the default for everyone else. `GC_LANG` is only the starting value or a deliberate override (`--lang`, `genchibi lang`).
- Your own content — character names, scripts, dialogue — is never translated. The *Tam Quốc* sample keeps its Vietnamese content; the *Fun Office* sample is offered in the interface language (English, or its Vietnamese edition *Văn phòng vui*).
- Upgrading from v0.19 or earlier: an install that already has data keeps Vietnamese (set once on the first start of v0.20) — by auto-update or by running the installer again without `--lang`; the CLI follows. Only new installs start in English. Switch any time with `genchibi lang en|vi` or the Studio switch. The Studio switch also has a page: *System › Language*.

## Commands

```
genchibi start | stop | restart | status
genchibi update            # check and update now
genchibi logs
genchibi backup | restore <file>
genchibi mcp               # MCP stdio bridge for agents
genchibi token             # set the GitHub token (private repo), hidden input — NOT the owner token (that is GC_API_TOKEN in .env, or data/owner-token)
genchibi lang [en|vi]      # show / set the language (CLI + Studio default)
genchibi open              # open the Studio (first run: opens the 30-minute admin / admin window)
genchibi password          # set / reset the owner password (first run: creates the owner account)
genchibi setup [skip|reset] # first-run setup: state · skip the wizard (logged) · run it again
genchibi online …          # go online: domain + HTTPS + MCP (see below)
genchibi agent connect     # connect configs for agents (never prints the token)
genchibi uninstall
```

## Go online (domain, HTTPS, MCP) in one step

**Beta** — path A is tested with a real Caddy (internal TLS) in Docker and simulated DNS; path B with a simulated Cloudflare API; the temporary link with a simulated `cloudflared`. None of them has run yet on a real VPS, with Let's Encrypt or with a real Cloudflare account.

You do exactly **one** thing outside the app — point an A record at the machine (**path A**), **or** create one Cloudflare API token (**path B**) — and within a few minutes you get `https://your-domain` (the Studio, behind the owner password) and `https://your-domain/mcp` that claude.ai can connect to. No `.env`, Caddyfile, DNS or dashboard editing by hand — with two exceptions on path B, each shown as a step with the exact instructions: if the token has no WAF permission you add one Skip rule yourself (the app prints the expression), and on the free plan *Bot Fight Mode* cannot be skipped by a rule, so you switch it off in the dashboard.

| Machine | You do | Command / where to click |
|---|---|---|
| **VPS with a public IP** (path A) | Create an A record `chibi.example.com → the machine's IP` | at install: `curl -fsSL https://raw.githubusercontent.com/colamacbook-ryan/Gen-Chibi/main/install.sh \| bash -s -- --domain chibi.example.com` · later: `genchibi online caddy chibi.example.com` |
| **Home machine / behind a router / ports 80-443 busy** (path B) | Create a Cloudflare API token | at install: `… \| bash -s -- --domain chibi.example.com --cloudflare` · later: `genchibi online cloudflare chibi.example.com`, or **Studio › System › Go online › Cloudflare** |
| **You already run a reverse proxy** | Keep it | `genchibi online proxy chibi.example.com` (prints the config to paste, then checks from outside) |
| (trial, **beta**) | nothing | `genchibi online quick` — a temporary `*.trycloudflare.com` link that changes on every restart (not for long-term OAuth) |

**Prerequisites (checked by the app, shown as ✓ / ✗ with the fix):**
- Path A: the machine has a public IP; ports **80 and 443** are open in the provider's firewall (security group) and in `ufw`; no other service holds 80/443; Docker mode (the edge Caddy runs in its own container `gen-chibi-edge`).
- Path B: the domain is on Cloudflare (Cloudflare nameservers, zone `active`, full setup); the account can use Cloudflare Tunnel (you may have to enable Zero Trust on the free plan once).
- Both: Cloudflare's *Bot Fight Mode* / *Block AI bots* can block claude.ai — the "MCP from the Internet" step tests with the `Claude-User` agent and tells you what to switch off.

**The Cloudflare API token (path B):** *Studio › System › Go online* and `genchibi online cloudflare` show a link that opens Cloudflare's token page with the permissions filled in. The token needs **Account › Cloudflare Tunnel › Edit**, **Zone › DNS › Edit**, **Zone › Zone › Read**, and optionally **Zone › WAF › Edit** (then the app adds the Skip rule that lets claude.ai through; without it the app shows the rule to add by hand). Set a short **TTL** (a day is plenty): the app deletes the token from memory when it is done (it keeps it, encrypted, only if you ask), and the running tunnel does not need it. The token is **never** accepted on the command line: in a terminal it is asked for hidden; without a terminal set `GC_CF_TOKEN` in the environment (or pipe it to `--token-stdin`).

**Step by step, as you watch:** `genchibi online` prints every step (domain / DNS, edge, ports, certificate, public address, MCP from the Internet) with ✓ / ✗ and the fix for a ✗, then `https://your-domain` and `https://your-domain/mcp`. Going online needs the owner account first: while the machine still has only `admin / admin` (or the account is not created yet), `genchibi online` and *Go online* refuse and say to run `genchibi password` on the server (or finish the first-run screen). The password is never asked for on the public address.

```
genchibi online                         # status: mode, address, each step, edge
genchibi online caddy <domain>          # path A (Docker): turns on the edge Caddy (ports 80/443), HTTPS
genchibi online cloudflare <domain>     # path B: chibi.example.com, or example.com (+ --sub name; default chibi)
genchibi online proxy <domain> | quick  # your own proxy | temporary link
genchibi online recheck [--waf-done]    # continue after fixing a step
genchibi online off                     # go offline (with GC_CF_TOKEN: also removes the tunnel / DNS / WAF rule the app made)
genchibi online migrate                 # machines set up by hand in .env (GC_PUBLIC_URL / GC_ALLOWED_HOSTS) before v0.21
```

Changing the public address signs out agents connected through OAuth (they must connect again); the command asks first (`--yes` without a terminal). `genchibi expose` / `genchibi link` (the v0.20 way) were removed in v0.23 — see [below](#removed-in-v023-genchibi-expose--genchibi-link).

**Backups contain your password and sessions; restoring turns Go online off.** `genchibi backup` saves `data/`, which now also holds the owner password (hashed), the Studio sessions / remembered devices and the online settings. `genchibi restore <file>` keeps the password of the backup but signs out every session and device, and turns Go online **off** (no public address, tunnel stopped, a new install id — a backup from another machine never takes over that machine's domain or tunnel). Run Go online again afterwards.

**You already have your own login page in front of the app** (for example a proxy that sends people to its own `/login`): the app now has its own owner account and its own `/login` page (`/setup` from v0.21 / v0.22 now redirects to `/login`). In your proxy, protect only the people routes and let the app's `/login` and `/oauth/authorize` reach the app behind your login (machine routes — `/mcp`, `/.well-known/…`, `/oauth/register|token|revoke` — must stay unprotected, as before). The snippet printed by `genchibi online proxy` shows where your own login fits.

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

Every install has an **owner token** since v0.21 (`GC_API_TOKEN` in `.env`, or `data/owner-token`), so agents on this machine that talk HTTP need the `Authorization: Bearer` header — `genchibi agent connect` prints configs that say where to read it; agents connected before v0.21 without a token must reconnect this way. `genchibi mcp` (stdio) reads the token itself.

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
The app is its own OAuth 2.1 authorization server, with RFC 9728 / 8414 discovery, dynamic client registration (DCR), PKCE S256 and expiring tokens stored as hashes. To connect: go online first ([above](#go-online-domain-https-mcp-in-one-step) — it sets the public address), open claude.ai *Customize › Connectors › Add custom connector*, paste `https://your-domain/mcp` and click **Connect**. The app's **Authorize** page appears so you can pick a permission level (`mcp:read` · `mcp:write` · `mcp:owner`); it uses your Studio sign-in (owner password), or asks you to sign in. Manage and revoke in **Studio › System › Agent connections**. If you use your own proxy or login page, the machine routes (`/mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`) must go straight to the app — `genchibi online proxy <domain>` prints that config. A sample Caddy config is in `docs/Caddyfile.oauth.example`; Cloudflare handling and common errors are in `docs/USER-GUIDE.md` › section 6.

### Removed in v0.23: `genchibi expose` / `genchibi link`
They were aliases of `genchibi online` since v0.21.3. Now they run nothing: they print one line `genchibi … was removed in v0.23 — use: genchibi online …` and exit with code `2`.

| Old command | Use instead |
|---|---|
| `genchibi expose <domain> [--overwrite-dns]` | `genchibi online cloudflare <domain> [--overwrite-dns]` |
| `genchibi expose --quick` | `genchibi online quick` |
| `genchibi expose --off` | `genchibi online off` |
| `genchibi link` · `genchibi link --check` | `genchibi online` · `genchibi online recheck` |

Machines that went online with the old `expose` (`.env` has `GC_TUNNEL`): the Docker profiles `tunnel` / `quick` and the native cloudflared started by `genchibi start` are gone, so that old tunnel is no longer started. `genchibi start` / `update` / `status` print one line asking you to run `genchibi online migrate`: it moves `GC_PUBLIC_URL` / `GC_ALLOWED_HOSTS` into Go online, stops a leftover old tunnel and removes `GC_TUNNEL` from `.env`. Then bring the domain back with `genchibi online cloudflare <domain>` (or `genchibi online quick`). The keyed MCP link (`https://<domain>/mcp/<key>`) still works while `GC_MCP_KEY` is set; if it leaks, change `GC_MCP_KEY` in `.env` and run `genchibi restart` (`expose --rotate` is gone).

Your own tunnel or proxy, LAN: use `genchibi online proxy <domain>` (or set `GC_BIND` and `GC_ALLOWED_HOSTS` in `.env` for a LAN). Since v0.21 the app never trusts a request because a proxy header is missing: the Studio always needs the owner password (sign-in), and scripts calling `/api` or `/mcp` send `Authorization: Bearer <owner token>`.

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
