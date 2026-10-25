# Changelog

## Chưa phát hành
*(v0.26.0 dự kiến — cầu nối CLI, INT-22; chưa phát hành: chờ đo P0 trên máy Ryan cho agy)*

### New
- **The Studio's AI can run on an agent CLI on your own machine** (Antigravity CLI `agy`, Claude Code) instead of an API key: `genchibi ai bridge install` → `login <cli>` → `enable <cli>`, then AI settings › AI route › *Agent CLI on this machine*. See [docs/AI-BRIDGE.md](docs/AI-BRIDGE.md).
- The CLI runs on the host (never in the app container) inside a **bubblewrap sandbox** (no host files, no D-Bus, network only through an allowlist proxy), with its **own HOME** and a per-turn MCP token. A CLI only runs once its lock is **verified with system evidence**: a sandbox self-test plus a canary on a fake local API (the CLI must refuse shell / file / web tools itself, and planted CLAUDE.md / AGENTS.md / memory must never reach the model). Every turn is watched; a violation stops it and marks the CLI *failed* until you enable it again on the host.
- Host limits (900 s per turn, 100 turns per hour, one at a time) — the Studio can only lower them. Cancel a CLI turn from the Studio; optional fallback to your API key when the CLI fails before writing anything.

## v0.25.0 — The Live stage sits on top of the AI assistant
Ryan: "cái sân khấu live phải luôn hiển thị trên đầu khung chatroom của assistant thì mới hợp lý" *(the Live stage should always show at the top of the assistant chat)*.

### New
- **A compact Live stage pinned at the top of the AI assistant dock on every page** — drag to resize (96–240 px), collapsible, remembered per device; it folds itself on the full Live page. A channel menu picks what it follows: Auto · Studio AI · External agents · one agent.
- **The Studio's own AI acts on the stage**: each tool it calls becomes a step, with a task taken from the area or the quick action. Labels are tool titles, never arguments.

### Changed
- **One live connection per browser**: a leader tab streams and shares events with your other tabs, and hands over when it closes. The server allows 16 viewers and 2 streams per session or token; extra streams wait instead of kicking each other off.

### Security
- The assistant's per-area tool limits are enforced inside the MCP tool gate itself: tools outside the area (`rollback_app`, `update_app`, `live_*`, `render_voice`, `import_project` …) return FORBIDDEN on every path.
- Every live event is cleaned again in the browser (known kinds only, labels redacted), including events shared between tabs.

### Performance (L-42)
- Full acting only while something happens; otherwise the character breathes at ≤ 12 fps. The stage stops drawing when the tab is hidden, the stage is collapsed, or a video is exporting.

### Next
- v0.25.1: free voices from a TTS engine on your own machine (VieNeu-TTS for Vietnamese / English, Kokoro for Mandarin).
- v0.26.0: the assistant runs on an agent CLI on your machine (Antigravity `agy` first), sandboxed with bubblewrap.

## v0.24.2 — Videos made from the sample kit may be monetized
- **Sample terms (Q48):** films / videos made from a Gen Labs sample may now be posted and monetized (ads, creator funds, sponsorships, paid courses) with the credit line "Made with gen-chibi · Gen Labs"; the sample characters and assets may not be resold, redistributed, or used as a logo / brand. Characters you create are still yours without restriction.

## v0.24.1 — Live stage setup for any connected agent (it asks its user first)
Ryan: "khi kết nối mcp về thì … yêu cầu agent đó tải app sân khấu về máy sở tại của nó rồi cài và liên kết vào để biểu diễn tại chỗ" *(when an agent connects over MCP, have it install the stage link on its own machine)* — chosen form: an invitation, and the agent must ask its user first.

### New
- **MCP tool `live_setup`.** gen-chibi invites a connected agent to link its own machine to your Live stage. The tool returns a short plan — what gets installed and where, which settings change, ONE command, how to undo, and where events go — and golden rule 13 tells every agent: ask your user first, never install silently. Declining changes nothing; MCP works as before. Only your own connections and agents you approved (OAuth, write access) can call it — not shared link keys, the Studio AI dock or read-only connections; at most 50 agent tokens and 5 calls a minute.
- **The command downloads only from `https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v<version>/`** — the prefix is pinned in the agent's golden rule, so any other URL is refused — **and checks the hook against `SHA256SUMS` before writing anything.** The app only provides a token and its URL (both format-checked), so a compromised app cannot hand an agent's machine arbitrary code. The token is written with `umask 077` and never appears on a command line.
- **Per-agent live tokens**: each agent gets its own token (stored as a hash only, with its own rate limit), listed in Studio › Live stage with **Revoke**.
- An agent on another machine can only reach your stage when gen-chibi is online with a domain; otherwise `live_setup` says so and issues no token. Windows: use WSL.

### Fixed
- The per-token rate limit applies right after a restart; the current task is tracked per channel and resets when a session starts or stops, and a new title updates the "Working on" chip; viewers who lost access no longer receive the next event.

## v0.24.0 — Live stage: a character acts out your AI agent's real work
Ryan: "mỗi bước làm việc của bạn trong quá trình xử lý và phản hồi luôn đi kèm với việc điều khiển 1 nhân vật trên sân khấu" *(every step the agent takes while working drives a character on a stage)*, with logical, continuous moves and a satchel for the tools.

### New
- **Live stage (Studio › System › Live stage).** One chibi character acts out every real step of your AI agent — reading, searching, editing, testing, delegating, waiting — walking between desk, bookshelf, test lab, coffee corner, sofa, door and launch pad. Tools come out of its satchel and go back in; a gentle camera follows it; speech bubbles use plain words in your language (never file names, commands or tool names) with a counter like "Editing ×5". Repeated test failures escalate (sweat → hammer → rubber duck → fire extinguisher); long waits go from coffee to a nap. Sound is optional (off by default).
- **Connect Claude Code:** `genchibi live hook --install-into ~/.claude/settings.json`. The hook script is a copy kept outside the install folder (Docker: from the verified release), your settings are merged with a backup, and the hook never blocks Claude Code and never sends prompts, file contents, paths, commands or results. Checked against a real Claude Code 2.1.310 session.
- **Task switch:** agents call `live_task` when they start a different task (a golden rule in the MCP instructions, `start_here` and the agent skill). The character claps a clapperboard, puts its props away, changes its hat badge and walks to that task's corner; the Studio shows "Working on: …".
- When the agent is faster than the stage, quick steps are folded into one action with a counter; errors, test results, releases and "waiting for you" always get their own beat.
- For other agents: MCP tools `live_event` and `live_task`; `POST /api/live/event` with the owner token or a per-install live token that can do nothing else; an SSE stream for the page. Labels are cleaned of paths, commands, secrets and emails.

### Security
- The live token lives in a private file next to the hook (never on a command line) and has its own rate limit; rotating it is one click.
- The Studio only shows the `genchibi live hook` command (never a hook command line served by the app), `--install-into` refuses other users' folders under sudo and never follows links, and Live streams close when you sign out.

### Known limits
- The hook sees tool calls, not the model's thinking or typing; the stage shows "thinking" in between.
- An agent in the cloud can only reach your stage when gen-chibi is online with a domain.

## v0.23.2 — Real vertical video, smoother export, more MCP tools for agents
The last technical round before Ryan tries everything from scratch (fresh install → `admin` / `admin` → owner account → domain → MCP check).

### Video
- **9:16 is now a true vertical film.** The camera frames whoever is speaking at a large size, keeps the speaker's face fully in the frame, avoids cutting through other faces, and lays out speech bubbles and captions to fit the tall frame (captions keep clear of the bottom where TikTok / Shorts put their buttons). 16:9 is unchanged.
- **Exporting keeps the Studio responsive.** The background and speech bubbles are drawn once and reused. On our 2-CPU test machine at 1080p the Studio was blocked for at most about 60–90 ms at a time during an export (before: up to about 120 ms).
- **Each work remembers its own export settings** (frame, quality, format) — they travel with project bundles and backups. Settings saved in the browser by v0.22 are moved into the work once.

### Agents (MCP)
- **Versions:** agents can list a work's versions and restore one. Restoring never loses anything — the current state is kept as a version first — and the old shots must still pass today's checks, otherwise nothing changes. Read-only connections cannot restore.
- **Storyboard and HTML film:** agents can export a work's storyboard (SVG) and its standalone HTML film — the same files the Studio's buttons make. AI voice clips are included only if they fit the size limit, and never for read-only connections.
- New `get_event` tool; `list_projects` also counts motion packs, sound packs and works; `save_work` reads and writes the work's video settings.
- **One source of rules:** MCP, `start_here` and the Studio AI chatroom now get the same golden rules, written once, and each only sees the rules for tools it can use. Rules are no longer cut off mid-sentence.

### Hardening follow-ups (after v0.23.1)
- Approved overrides refuse YAML tags other than `!reset` / `!override`, NUL bytes and UTF-16 / UTF-32 byte-order marks, and host paths under `/proc`, `/sys` or `/dev/fd`. Bind sources must already exist and carry no extended ACLs. As root, an override is refused when the install folder cannot be hidden while Docker Compose reads it.

### For developers
- One film-payload builder (`studio/film-html.js`) for the Studio, MCP `export_film_html` and the CI video job.
- Browser tests wait for the server to answer instead of sleeping a fixed time.

## v0.23.1 — Hardening: the app can no longer reach root through its own files; `genchibi doctor`; restore keeps the install id on the same machine
Before Ryan tests from scratch (INT-20 (e): "hoàn thiện hết các vấn đề kỹ thuật đi rồi tôi mới test" — *"finish all the technical issues first, then I'll test"*). No new features in the Studio.

### Read before updating (Docker installs)
- **If you have a `docker-compose.override.yml`, `start` / `update` stop until you decide once.** Run the command `genchibi` prints (`… override approve` or `… override off`, an absolute path so it works with `sudo`). Running containers are not touched before you decide.
- **Docker Compose itself reads your override.** `override approve` resolves it together with the verified compose files (`docker compose config`) and checks only what the override adds in Compose's own output — so comments, flow lists, anchors and Windows line endings are fine. Refused: `build`, `env_file`, `extends`, `include`, `develop`, `use_api_socket`, `provider`, `volumes_from`; the Docker socket anywhere; host paths that are relative, inside the install folder, contain `.` / `..`, have a missing parent folder, are links, or are `/`. Shown as warnings (you can still approve): `privileged`, host `pid` / `ipc` / `network_mode` / `userns_mode`, `cap_add`, `devices`, `security_opt`. Variables the override uses are taken once at approval.
- **As root, Docker Compose reads the override in a private view where the install folder is an empty, read-only folder**, so an override cannot pull in install-folder files however it is spelled. Also refused in the override text: explicit `? ` keys, `\` before a line break or a non-ASCII byte, and the NEL / LS / PS line-break characters. More warnings (still approvable): `device_cgroup_rules`, `group_add`, `runtime`, writable binds of system folders (`/etc`, `/root`, `/proc`, `/sys`, `/boot`, `/run`, `/var/lib/docker`). `override approve` lists the lines the override adds (with service and key), and shows the new lines when the result changes later.
- **Bind folders must be owned by root or by you and not writable by the app account** (checked at approval and on every run), so the app cannot swap them for a link after you approve.
- **genchibi runs exactly the approved result**, re-checks it on every `start` / `update`, and asks again if anything changed (the file, a variable value, or the verified compose files). Approval needs the Docker Compose plugin.
- **The first `genchibi` after the app is on v0.23.1 needs github.com once**: it downloads the release package, checks it against `SHA256SUMS`, and replaces itself. Offline, `stop`, `logs` and `mcp` still work.
- **With the edge Caddy on, the first `update` / `rollback` recreates the app container too** (a short interruption). Certificates are copied once to a folder outside the install folder.

### Security — what changed
- **`genchibi` (as root or as your own user) never runs or loads anything from the install folder.** It uses its own copy, verified against the release's `SHA256SUMS`, in `~/.local/lib/gen-chibi` (`~/gen-chibi-trust` when Docker comes from snap). `.env` is read as data (known keys only), never sourced.
- **Compose files come from the verified copy and never from a release older than v0.23.1**, even after a rollback or if the app points `current` back.
- **The run mode is no longer taken from `.env`.** A Docker install stays Docker; native only when the installer recorded it.
- **Old `genchibi` commands (v0.23.0 and earlier) replace themselves** the first time you run them; `genchibi doctor` shows ✗ for any old command left on your PATH.
- **Each install keeps its own approvals and edge Caddy folders** outside the install folder. One account per install: root and your user are told which one to use. `uninstall` removes only that install's state.
- **Containers never run as root or with a privileged group**, and the installer never changes owners on an existing folder.
- **`genchibi agent skill`** only unpacks regular files and folders, never as their original owner, and stops if the target contains links.

### New
- **`genchibi doctor [--yes] [--migrate]`**: one line per check (app, verified commands and compose files, override, container user, ports, set-up stage, edge, tunnel); exit 1 when something is ✗. For root installs made without sudo by v0.21.0–0.21.2 (containers ran as uid 1000), it proposes moving to a `genchibi` system account — only with evidence, never to the folder's own owner, and not while that user still has running processes. It moves the edge folders too.
- **A backup restored on the same machine keeps its install id**, so *Go offline* can still remove this machine's own Cloudflare tunnel and DNS record. A backup from another machine (or made before v0.23.1) still gets a new id.

### For developers
- `tools/mutations/v0231.json`: 120 mutations, each must turn a named test red. Old-command fixtures come from real tags (`tools/fixtures/old-cli/`, `old-compose/`) — a hand-written fixture hid a bug in an earlier round (L-83).
- `tools/test.sh` checks after every group that no test wrote to the real `$HOME`, and lints that every `genchibi` call in a test sets `HOME`. Every refused override fixture (45+) is a case a real `docker compose config` accepts.
- A browser test that failed when the quota reset fell on the next day (Vietnamese dates are written `23-10`) is fixed.

### Not in this release (v0.23.2)
- Real 9:16 video, a smoother 1080p export, more MCP tools (versions / restore, storyboard, HTML film export), video settings stored with the work.
- Not yet tried on: Docker from snap on a real machine, macOS hosts.

## v0.23.0 — Owner ready: first login with admin / admin, then a guided set-up (owner account → domain → MCP check)
Ryan: "tài khoản owner phải được khởi tạo mặc định làm admin pass admin, rồi lần đầu đăng nhập yêu cầu owner bắt buộc phải update khởi tạo lại thông tin owner lần đầu và thực hiện qui trình đăng ký để nối tên miền và chuẩn đoán kết nối mcp" *(In English: "the owner account should start as admin / admin; on first login the owner must re-create the owner details and go through the steps to connect a domain and check the MCP connection")*. Google sign-in and multi-user are left for later (owner-only for now).

### Breaking — read before updating
- **Sign-in is now username + password.** Installs upgraded from v0.21 / v0.22 use the username `owner` (change it in *System › Owner account*).
- **The one-time setup code of v0.21 is gone**:
  - `/setup` redirects to `/login`;
  - `/api/auth/setup*` return 404;
  - `genchibi open` no longer prints a code;
  - `genchibi online` no longer exits with code 3.
- **Go online needs an owner account first** (Studio and CLI). Legacy installs configured through `.env` are exempt, and `genchibi online migrate` still works.
- **`genchibi expose`, `genchibi link`, the compose profiles `tunnel` / `quick` and `GC_TUNNEL` are removed.** They now print "removed in v0.23 — use genchibi online …" and exit 2. Installs that still have `GC_TUNNEL` are told to run `genchibi online migrate`, which also stops the old tunnel.
- **Restoring a backup revokes every OAuth agent connection.** Reconnect agents afterwards.
- **Five built-in frame moves have new ids** so they no longer collide with poses: `weaponThrust`, `stompRage`, `joyHop`, `fistSalute`, `waveHello`. Saved works and packs are converted when read; the old ids keep working as hidden aliases.

### New — first run
- **A fresh install starts with `admin` / `admin`, accepted only through the link the server prints.** The installer's last line (and `genchibi open`, which opens it for you) gives `http://localhost:<port>/login#k=…`. The `#k` part is a one-time random key, valid for 30 minutes. On top of the key, every one of these must hold:
  - the machine is not online;
  - the app port only listens on this computer (Docker: the CLI checks the published ports, and refuses `network_mode: host`);
  - the request comes straight from the browser on this computer.

  Anywhere else, the sign-in page says exactly why and how to get in (`genchibi open`, `genchibi password`, or an SSH tunnel).
- **Then you must create your own owner account**: username, display name, optional e-mail (used only as the Let's Encrypt contact) and a new password of at least 12 characters. After that, `admin` / `admin` never works again, even after a restore.
- **Then the *First-time setup* wizard**, with a 3-step bar; signing in again resumes at the unfinished step:
  1. **Owner account.**
  2. **Domain.** Either *Put online* (the Go-online wizard) or *Only on this machine*. If the Internet side fails or is slow (DNS, certificate, Cloudflare), the step shows what is wrong and offers *Use on this machine for now*, so it never locks you out.
  3. **MCP check**:
     - local self-checks (`/mcp`, owner token, the app's stdio bridge);
     - **a host check**: `genchibi setup check` runs the exact `genchibi mcp` command you paste into Claude Code / Cursor, with its absolute path;
     - connection cards for Claude Code, claude.ai (when online) and other agents;
     - a live wait for your agent's first call. *I'll connect an agent later* is available once the local checks pass, and the home page keeps a reminder until an agent connects.

  `genchibi setup skip | reset` on the server is the escape hatch if a check itself is broken.
- **Installer `--domain` / `--cloudflare`** asks for the owner username and password in the terminal (hidden), or reads `GC_OWNER_USER` / `GC_OWNER_PASSWORD` from the environment and removes them right away. Without them it installs but does not go online, and prints the next commands.
- **Agents (B12)**:
  - pending authorization requests can be approved from the Studio's *Agent connections* page;
  - `start_here` tells an agent what its connection can do (read-only connections are not offered write tools);
  - `genchibi agent connect` prints the stdio command first, the same order as the Studio.

### Fixed
- **Tables no longer hide their last column with wider fonts.** The Go-online steps and the sign-in sessions overflowed with DejaVu Sans; the cells now wrap.
- **Reloading the page while a work was loading no longer sends you back to the works list.** The cancelled request used to overwrite the route.
- **Two `genchibi backup` runs in the same second no longer overwrite each other.**

### Security (reviewed before release, each guard with a test)
- **`admin` / `admin` needs the key from the link.** So another user account on the same computer, another container, or a machine on the LAN cannot use the 30-minute window. The key is never put on a command line (the browser is opened through a private file), is removed from the address bar, and is compared in constant time.
- **The rate limit is checked before the password.** Remote callers only get a generic `local-only` reason. Creating the owner is atomic and revokes every admin session. The set-up state only moves forward, so restoring or deleting files never brings `admin` back.
- **Sign-in and owner creation are protected against cross-site requests and DNS rebinding.**
- **The ACME e-mail is validated** before it reaches the Caddy config.

### Accepted risk
- During the 30-minute window, someone who can already run commands on the server, and builds their own forwarder (e.g. `ssh -R`), could use the link. Such a person already has owner-level access to that machine.

### For developers
- **Browser tests now run on CI for every push and every release**: 11 groups, Playwright 1.56.1 pinned, used only in CI.
- **One list of engine / Studio scripts** in `engine/scripts.json`.
- **`tools/mutate.mjs` + `tools/mutations/v023.json`**: 62 mutations, each must turn a named test red.
- **`tools/test.sh` fails if a test leaves a server process behind.**

### Not in this release (coming in v0.23.1 / v0.23.2)
- v0.23.1: the root-takeover surface through files the app container can write (CNS-233), a `genchibi doctor` fix for older root installs, and keeping the install id when restoring on the same machine.
- v0.23.2: real 9:16 video, a smoother 1080p export, more MCP tools, video settings stored with the work.

## v0.22.0 — Export video: one button in the Studio makes a video file you can upload to YouTube or TikTok
Owner decision: Ryan approved the v0.22 spec on 2026-10-21 ("duyệt, làm tiếp đi" — *"approved, keep going"*) with all proposed defaults.

### New
- **Work › Export video** (next to *Film (HTML)*): choose **16:9** or **9:16**, and **1080p** (default) or **720p**. The app first checks what your browser can do, then shows:
  - the format you will get;
  - roughly how long the export takes (about 2–3.5× the film's length);
  - roughly how big the file will be;
  - the length limit.

  **Start** asks where to save (if the browser allows it), shows progress per shot with **Cancel**, and ends with **Preview** and **Choose another cover frame**.
- **Four files**:
  - the video;
  - subtitles (`.srt`);
  - a cover image (`.jpg`, the first frame with dialogue);
  - a `.txt` with the title, the description and the credit line "Made with gen-chibi · Gen Labs".

  Existing files are never overwritten: a new name gets `-2`, `-3`… Cancel removes only the files this export created.
- **Formats**:
  - **MP4** (H.264 + AAC) from Chrome / Edge on Windows and macOS. Real Chrome exports it in CI on Windows and macOS at 720p, 1080p and 9:16, including from a hidden tab.
  - **WebM** (VP9 + Opus) on Linux and Chromium.
  - YouTube and TikTok accept both.
- **Sound in sync**:
  - AAC encoder delay is measured on your machine (2112 samples on macOS in CI) and compensated without an edit list.
  - On the decoded file, test clicks land within 3 ms of where they belong (measured with ffmpeg).
- **Picture**: matches the film in the Studio (mean pixel difference under 2/255 in tests).
- **9:16**: the landscape film centred in a vertical frame for now; a camera that crops to the speaker is planned next.
- **Lines without an AI voice are silent** in the video, but their bubbles still show. Before exporting, the usual dialog offers to dub them first. The browser's read-aloud voice cannot be recorded.
- **Limits**:
  - MP4: 5 min at 1080p, 10 min at 720p.
  - WebM: 15 min.
  - Keep the tab in front; a hidden tab still finishes, but more slowly.
- **Works in**: Chrome / Edge on a computer, with the Studio opened over `https` or `localhost`. Otherwise the button is disabled and says why. Firefox, Safari and phones are not supported yet.
- **Sample terms updated** (*Fun Office*, *Văn phòng vui*, *Three Kingdoms*): films / videos made from a Gen Labs sample may be posted with the credit line "Made with gen-chibi · Gen Labs"; no resale and no redistribution of the sample's files or assets. The repository licence is unchanged.

### How it works
- Everything runs in your browser and nothing is uploaded.
- The film is rendered frame by frame on a virtual clock in an isolated page.
- It is encoded with the browser's WebCodecs and packed by our own MP4 / WebM writer.
- No new dependency, no change to the Docker image.

### Security
- Only the export page may be framed, and only by the Studio itself (`X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`). Every other response still refuses framing.
- Odd paths (`//`, `/./`, `..`) are refused before any header decision, and every HTML page carries the Studio CSP.
- The export page has no inline script, and messages between it and the Studio check their origin.
- File names avoid Windows reserved names.
- Releases now wait for the Windows / macOS real-Chrome MP4 check.

### Changed
- `genchibi expose` / `genchibi link` (aliases since v0.21.3) are now removed in **v0.23**, not v0.22.

### Known issues
- During an export the Studio can pause briefly now and then. Measured worst case on our test machine: about 0.1 s, with a hard limit of 0.25 s at 1080p in tests. The video itself is not affected.
- MCP agents cannot export video yet (it needs a browser).
- The MP4 path is verified in CI with real Chrome; not yet by hand on an owner's computer.

### Tests
- `tools/test.sh` section 2o:
  - MP4 / WebM structure;
  - encoder-delay compensation for simulated Windows / macOS encoders;
  - real ffmpeg decode;
  - header and path isolation;
  - sample terms the same everywhere;
  - workflow structure.
- `tools/test-browser.mjs` groups `video` and `video-ui`:
  - pixel match at 720p and 1080p;
  - A/V sync, isolation, cancel, hidden tab, language;
  - the export panel, the reasons a button is disabled, the files written;
  - 51 name collisions on Cancel.
- `.github/workflows/video-mp4.yml` (used by CI and release): real Chrome on Windows and macOS exports MP4 at 720p, 1080p and 9:16, plus from a hidden tab, checked with ffprobe and marker sync.

## v0.21.3 — Safer root installs, Cloudflare clean-up only for what this machine created, temporary link can be turned on again
Ryan: "làm tiếp đi" *(In English: "keep going")* — closing the findings left open by v0.21.0 (CNS-204, CNS-210, CNS-212, CNS-213) and one bug found while testing them.
- **Fixed — temporary link turned on a second time**: *Go online › Temporary link*, then *Go offline*, then *Temporary link* again picked up the previous, dead `trycloudflare.com` address from the tunnel log, and the "Public address" step failed. The app now trusts only the launcher's live status for the address.
- **Security — installing as root without `sudo`** (no `SUDO_USER`): the app no longer runs as uid 1000 (which may be someone else's account). The installer creates or reuses a system account `genchibi` (no login, no home) and gives it the install folder; if it cannot create one, it stops before changing anything and tells you to rerun with `sudo` from your own account. Installs that already have `GC_UID` in `.env` keep it — if you installed v0.21.x as root without `sudo`, check `GC_UID` in `.env`.
- **Cloudflare clean-up belongs to the machine that created it**: every tunnel, DNS record and WAF rule the app creates now records the install id. *Go offline* only deletes resources of this install; after restoring a backup on another machine (new install id) it deletes nothing at Cloudflare and tells you which tunnel and record remain and how to remove them. Restoring a backup on the same machine also gets a new id, so remove the old tunnel by hand in that case (the step says so).
- **Less information before sign-in**: the public `GET /api/auth/state` now returns only what the sign-in and setup pages need; whether sign-in is temporarily blocked is shown after a blocked attempt.
- **Deprecated commands are now aliases**: `genchibi expose …` and `genchibi link …` print one "Deprecated" line and run the matching `genchibi online …` command (`expose <domain>` → `online cloudflare`, `expose --quick` → `online quick`, `expose --off` → `online off`, `link` → `online`, `link --check` → `online recheck`). They will be removed in v0.22.
- **Tests**: installer root paths with fake `useradd` / `adduser` (also as a non-root user), Cloudflare ownership by install id, the public auth state cell by cell, alias equivalence, quick → off → quick on the same launcher; when the suite runs as root it re-runs the installer tests as an unprivileged user (lesson from v0.21.0's CI failure).

## v0.21.2 — "Fun Office" in English: the one-click sample for English users is now an English film
Ryan: "Q23 làm bản tiếng Anh" *(In English: "Q23: make the English version")*.
- **New sample `Fun Office`** (`studio/mau/fun-office.json`, project `mau-fun-office`): the same story, staging and timing as *Văn phòng vui*, with English names (Nana, Boss Ted, Barry), English dialogue and an English film (`lang: en`, English voices) — work *First Day at Work*.
- **The Studio offers the sample in your interface language**: English → *Fun Office*, Vietnamese → *Văn phòng vui* (Quick start, empty library). The other edition stays one click away in *Library › Theme projects*; both install side by side. *Three Kingdoms* stays Vietnamese (ADR 0007).
- **Agents**: `start_here` suggests the sample in the machine's language; `list_samples` reports each sample's `lang`.
- **Test fix**: a browser check of the "out of AI voice quota" message failed when the retry time fell on the next day (date written `21-10`).
- **Tests**: `tools/test.sh` checks the English sample has no Vietnamese text, keeps the same staging as the Vietnamese one, and installs next to it without id clashes; the browser i18n group opens *Fun Office* in one click and plays its exported English film.

## v0.21.1 — The Studio footer shows only Gen Labs, no personal contact details
Ryan: "Q26 đổi thành Gen Labs" *(In English: "Q26: change it to Gen Labs")*.
- **Changed**: the Studio sidebar footer on every install showed the author's name and personal phone number. It now reads only "© 2026 Gen Labs — All rights reserved". `LICENSE`, `README` and the user guide keep their author line as before.
- **Guard**: `tools/test.sh` fails if the Studio or server code contains a phone link or an author contact line again.

## v0.21.0 — Online in one step: one install command, then the app takes your domain online itself (Caddy or Cloudflare Tunnel) — Studio and MCP ready
Ryan: "hãy nghĩ cách để owner cài về bằng 1 lệnh là vào docker hết rồi docker đó tự hỗ trợ thiết lập dễ dàng tên miền step by step bằng candy và tunnel --> user chỉ hỗ trợ gán ip lên domain hay token cloudflare là xong mọi thứ sẵn sàng ngay kể cả mcp" (INT-19).
*(In English: "Find a way for an owner to install with one command, everything in Docker, and have it guide domain setup step by step with Caddy and a tunnel — the user only points an IP at the domain or gives a Cloudflare token, and everything is ready, MCP included.")*

### Breaking — read before updating
- **Every install now has an owner token.** Installs without `GC_API_TOKEN` (the v0.20 default) get one generated in `data/owner-token` on first start. HTTP agents that called `/mcp` or `/api` without a header now get `401` with a hint: reconnect with `genchibi agent connect` (prints a config with the token) or use `genchibi mcp` (stdio, unchanged — it reads the token itself).
- **The Studio asks you to sign in, also on localhost.** First time: run `genchibi open` on the machine (it opens `/setup` with a one-time setup code) and choose a password (≥ 12 characters). The browser remembers you for 30 days. Forgot it: `genchibi password`. Exception: installs configured for the Internet through `.env` before v0.21 (`GC_PUBLIC_URL` / `GC_ALLOWED_HOSTS`) keep working with the token as before and show a "Set a password" banner.
- **The app no longer treats "no proxy header" or "inside Docker" as the owner.** Owner rights come only from positive proof: a signed-in session, the owner token, the one-time setup code (and MCP links / OAuth for `/mcp`). A minimal reverse proxy that adds no headers can no longer make Internet requests look local.
- **Rolling back to v0.20 or earlier while online takes the machine offline** (the app asks first; automatic rollback below v0.21 is blocked while online). The v0.21 launcher stays in place; remove the `gen-chibi-edge` container by hand (`genchibi online --caddy-off`) if you had Caddy on.

### New
- **System › Go online** (Studio) and **`genchibi online`** (CLI) — one wizard, four paths, each step shown as ✓ / ✗ with how to fix it:
  - **Server with a public IP → Caddy** *(beta)*: point an A record at the machine, run `genchibi online caddy <domain>` (or install with `--domain <domain>`); Caddy gets HTTPS by itself.
  - **Home computer / behind a router → Cloudflare Tunnel** *(beta)*: paste one Cloudflare API token (4 permissions, short TTL — the wizard links to the token page); the app creates the tunnel, the route, the DNS record and the WAF skip rule for agents, then deletes the API token from the machine.
  - **I already have a proxy**: the app prints the exact Caddy / nginx snippet (machine routes straight through, people through your login) and checks from the outside.
  - **Temporary link** *(beta)*: `*.trycloudflare.com`, no account; changes on every restart.
  - Done page: Studio and MCP addresses with copy buttons; claude.ai connects to `https://<domain>/mcp` with OAuth as in v0.19. **Go offline** removes what the app created.
- **Installer:** `--domain <domain>` (Caddy path; checks the A record and waits for it), `--domain <domain> --cloudflare` (token asked hidden, or `GC_CF_TOKEN` without a terminal — never on the command line); on a fresh Linux it installs Docker and carries on in the same session; the last line prints the setup code or the online addresses.
- **System › Owner account**: change password, see and revoke sessions and devices, failed sign-in alerts.
- **AI assistant / AI director** answer long turns without being cut by proxies (the request returns at once, the Studio polls the turn) — needed behind Cloudflare's ~100 s limit.

### Security (reviewed before release, each with a test)
- Passwords hashed with scrypt; **rate limit checked before the password is verified**, per address and per account (100 failures → strangers blocked for ≤ 15 minutes; your signed-in browsers, your device cookie and the owner token still get in; the Studio shows an alert). Signed device cookies; changing the password revokes every session.
- One-time setup code: 50 bits, 1 hour, single use (also under parallel requests), never in a URL or on a command line.
- Edge: Caddy runs in its own container (`gen-chibi-edge`, `caddy:2.11.7`) as your user, sees only `edge/conf` read-only, admin only on a unix socket, and proves itself to the app with a secret header; cloudflared runs under the launcher, pinned to 2026.10.2 with SHA-256 checked before every start, token in `run/tunnel.token` (0600, never visible to Caddy); its local port proves it belongs to this app (HMAC challenge) before the tunnel starts.
- Every connection the wizard makes to your domain goes through one check that refuses private / loopback / link-local / NAT64 / 6to4-private addresses and pins the checked IP; domain names are validated before they reach the Caddy config.
- Studio pages send a Content-Security-Policy and refuse framing.
- `genchibi open` hands the setup code to the browser through a private redirect file in `run/`, never on a command line; test switches (`GC_TEST_*`) only work when `GC_TEST=1`.

### Deprecated (removed in v0.22)
- `genchibi expose` / `genchibi link` (still work as before; use `genchibi online`), compose profiles `tunnel` / `quick`, `GC_TUNNEL`. Installs configured through `.env` can move to the app with `genchibi online migrate` (or *Migrate* in the Studio).

### Files and ports
- New: `data/auth.json`, `data/owner-token`, `data/setup-code*`, `data/legacy.json`, `data/online.json`, `data/install-id`, `run/edge-intent.json`, `run/edge-status.json`, `run/tunnel.token`, `edge/conf/{Caddyfile,sites.caddy,edge-secret}`, `docker-compose.edge.yml`, `logs/tunnel.log`. Ports: tunnel ingress `GC_PORT + 2` (loopback, only while a tunnel is on), cloudflared metrics on a random loopback port.
- **Backups now contain your password hash, sessions and online settings.** Restoring a backup turns online off, gives the install a new id and revokes all sessions.

### Not yet run for real (tested only against fakes)
| | Status |
|---|---|
| Caddy path | Caddy 2.11.7 ran for real in Docker with an internal certificate; **not yet on a VPS with Let's Encrypt** |
| Cloudflare path | full flow against a Cloudflare API fake; **not yet against a real account** (permission names, Zero Trust requirement, CNAME at the apex, WAF on the Free plan) |
| Temporary link | end to end with a fake cloudflared through the real launcher; real cloudflared not run (no outbound 7844 in our test machine) |
| Others | proxies cutting at 100 s (simulated), arm64, macOS native, Podman, corporate proxies |
Ryan will run *Go online* on a fresh install of this release as the first real acceptance.

### Known issues
- Native installs on v0.20.0 or earlier stop once while updating (fixed from v0.20.1 on): run `genchibi start`.
- Machines with their own login page at `/login` in front of the app: the app's own sign-in page is also at `/login` — keep your proxy protecting people routes only and let the app's `/login` pass behind your login.
- Restoring a backup on a *different* machine keeps the record of the Cloudflare tunnel the old machine created, so *Go offline* there could remove the old machine's tunnel. Restore on the same machine, or run *Go online* again on the new one before going offline.
- Installing as root without `sudo` (no `SUDO_USER`) runs the app as uid 1000 and gives that uid the install folder (the installer prints this). Before v0.21 the app ran as root. If uid 1000 is someone else's account on that server, install with `sudo` from your own account. A dedicated system user is planned for v0.22.

### Tests
`tools/test.sh` 1380 ✓ (v0.20.1: 899) · browser suite 95 ✓ (v0.20.1: 79) · new: `tools/test-auth-owner.mjs` (access table cell by cell, L-66-style guessing, setup code, legacy machine, upgrade without token), `tools/test-online.mjs` (Cloudflare API fake, Caddy fake, SSRF), `tools/test-online-cli.mjs` (CLI end to end, no token in argv), `tools/test-ingress.mjs` (port squatting), `tools/test-edge.sh` (compose mounts, real Caddy), `tools/test-update.sh` §8 (edge health, ABI, SHA).

## v0.20.1 — Native installs keep running after an update that ships a new launcher
Found by the review of the v0.21 plan (CNS-171) and reproduced on a real native install: v0.19.1 → v0.20.0 updated, then stopped for good.
- **Fixed**: when an update brings a new `launcher.js`, the launcher replaces itself and must restart. In Docker the container restarts it; in native mode (`--native`, started with `nohup`) nothing did, so the app stopped after the update. The launcher now starts the new launcher itself (same environment, same log file), hands over `logs/launcher.pid` so `genchibi stop` / `status` keep working, then exits. Docker mode is unchanged.
- **If your native install stopped after updating to v0.20.0, or stops once more while updating to v0.20.1**: run `genchibi start`. The launcher that was running before this release cannot restart itself; from v0.20.1 on it does.
- Tests: `tools/test-update.sh` section 7 builds a release with a different launcher, updates a native install to it and checks the new version answers, the pid file points to the new launcher, the old one is gone and `launcher.js` was replaced (31 ✓). The previous release's tests never exercised this path because every test build shared the same launcher; the v0.20.0 launcher fails the new section (2 ✗).

## v0.20.0 — English first: the Studio, installer, CLI and agent contract in English, switchable to Vietnamese at install time or any time after
Ryan: "ngoài ra hệ thống này tôi cần thêm giao diện tiếng Anh để cho người châu âu sử dụng , nên là trên github hay quá trình cài đặt tốt nhất dùng tiếng anh làm chủ đạo và có thể chuyển sang tiếng việt trong quá trình cài đặt hoặc quá trình sử dụng" (ADR 0007).
*(In English: "I also need an English interface so European users can use this system — on GitHub and during installation, English should lead, with the option to switch to Vietnamese during installation or while using it.")*
- **English by default** in:
  - GitHub (`README.md`; Vietnamese in `README.vi.md`) and the user guide (`docs/USER-GUIDE.md`, `docs/FRAME-SPEC.md`, `docs/PART-WORKFLOW.md`; the Vietnamese originals stay and link both ways);
  - the installer, the `genchibi` CLI and its help, operator logs and startup errors;
  - the Studio, server messages, the agent *Authorize* page and the exported HTML film player;
  - the agent contract: every MCP tool description, agent instruction and error, built-in frame data and catalogue returned to agents, and the `agent/examples`. This closes the language half of CNS-067 (the Gemini schema half stays open).
- **New work follows your language**: a work created in the English Studio gets English dialogue, English AI voices and an English film (`work.lang = en`); a work an agent creates follows the machine's default language. Works made before v0.20 have no `lang` and stay Vietnamese. Default names of new assets (*New item*, `new-character`…) follow the interface language.
- **Switch to Vietnamese when you want**:
  - **at install time** with `--lang vi` / `GC_LANG=vi`, or by answering the one bilingual question the installer asks in an interactive terminal (`Language / Ngôn ngữ: [1] English [2] Tiếng Việt`, Enter = English; no question without a terminal, so CI and pipes stay English);
  - **for the whole machine** with `genchibi lang vi|en` or *System › Language* in the Studio — both change the same setting, and `genchibi lang` shows it;
  - **per person** with the **EN | VI** switch in the Studio sidebar. The switch redraws in place without reloading or losing what you are editing, and is remembered per browser.
  - In the Studio the order is: your browser choice > the machine default > English. Pages the server builds on its own (the *Authorize* page) follow your browser's `Accept-Language`, then the machine default.
- **Upgrading from v0.19 or earlier keeps Vietnamese**: an install that already has data stays in Vietnamese on its first start of v0.20, and running the installer again without choosing a language keeps it. Only new installs start in English.
- **Your content is not translated**: character names, scripts and dialogue stay as written, including names that happen to match a built-in word (a character called *Nam* stays *Nam*). The *Three Kingdoms* and *Fun Office* samples keep their Vietnamese films. The AI assistant answers in your interface language.
- **How it works** (gettext style, one source for Studio, server and player — `engine/i18n.js`, no new dependency):
  - every existing Vietnamese string is the message id, and `locales/en/*.json` hold the English (~3,000 distinct strings, plus ~120 CLI and installer lines), so Vietnamese mode is unchanged to the letter;
  - context keys (`pt`, like gettext's `pgettext`) cover words with two English meanings, e.g. *Updates* / *Updated*, *Approved* / *Passed*;
  - sentences built at run time are matched back to their templates in linear time with a fixed budget per sentence, so no input can stall the server;
  - plural forms are supported.
- **Release notes now reach GitHub and the in-app update check**: the release workflow compared the whole heading line, so recent releases showed only "Phát hành vX". `tools/release-notes.sh` (shared by CI and tests) takes the `## vX.Y.Z — …` section, and `tools/test.sh` fails if the current VERSION has none.
- **Layout fix found while translating**: the page header no longer lets buttons slide under the *AI assistant* toggle, and banner text is no longer squeezed into a one-word column. Both bugs existed since v0.18 with the dock open; longer English text made them obvious.
- **Security review before release** (fixed, each with a test): translating an error built from a very long id sent over MCP could block the server for seconds (now under 10 ms) · numeric ids keep their exact text (`007` no longer becomes `7`) · errors on the agent endpoints (`/mcp`, OAuth metadata, registration, token) are always English · OAuth `error_description` is plain ASCII (RFC 6749) · `settings.json` is read once per change instead of twice per request.
- **Tests** (`tools/test.sh` 895 ✓ — v0.19.1 had 679; browser suite 79 ✓ — was 70):
  - `tools/i18n-scan.mjs` (every message id used has an English string, no unused keys, no unwrapped Vietnamese text in UI code);
  - `tools/test-i18n.mjs` (core, context keys, plural, server language negotiation, upgrade rule);
  - `tools/test-i18n-server.mjs` (server and MCP in English, agent endpoints English on a Vietnamese machine, run-time template matching under 50 ms for hostile input, a new work's language from the Studio / the AI assistant / an agent, frame data an agent copies stays free of Vietnamese, user names are never translated);
  - `tools/test-lang.sh` (installer + CLI in both languages, upgrade and reinstall keep the language, bash 3.2-safe);
  - browser group `GC_ONLY=i18n`:
    - no Vietnamese text on 35 pages and tabs in English mode, including values the system pre-fills in forms, except user content;
    - no overlapping header controls and no squeezed banner text at 1366 px with the dock open;
    - the switch works and is remembered, errors come in the user's language, user names that match built-in words are not translated, and the exported film works in English.
  - Existing tests run in Vietnamese mode so they keep their meaning.
- English terms (ADR 0007): Workshop · Library · Create · Works · Shot · Scene · Draft / Needs changes / Approved · Published · motion pack · sound pack · mixing rules · voice role · accent · AI dub · AI assistant · AI director · Pin & Spotlight · Agent connections.

## v0.19.1 — Chip "Giọng AI x/y" đếm đúng số câu đã lồng
Ryan: "làm tiếp đi, sửa luôn CNS-146 rồi phát hành".
- **Sửa CNS-146**: chip "Giọng AI x/y" ở đầu phòng làm phim và trong bảng Tạo tác báo thiếu. Phim mẫu Tam Quốc có 24/31 câu giọng AI mà chip báo 12/31, còn hộp xuất phim báo đúng "còn 7/31". Gốc: server đếm theo **bước thô** của kịch bản, trong khi Studio lồng tiếng và phim xuất đọc theo **beat của đạo diễn** (đạo diễn tự đổi cảm xúc / kiểu bong bóng của câu nên khoá clip khác; 13/31 câu của bộ mẫu Tam Quốc thuộc loại này).
- **Một nguồn câu thoại** `GC.film.lines(work)` (engine): mọi câu cần giọng của tác phẩm, đúng như bộ phát sẽ đọc (beat của đạo diễn theo dự án tác phẩm, bỏ phân cảnh chưa diễn được, mỗi câu một lần). Studio lồng tiếng, Studio xuất phim và server đếm chip cùng dùng. Vai giọng cũng một nguồn: `GC.voices.roleOf`. Khoá câu không đổi so với v0.19.0 (đã đối chiếu cả hai bộ mẫu), nên clip đã lồng vẫn được nhận.
- Server nhớ danh sách câu theo **chữ ký nội dung** (phân cảnh, bối cảnh, diễn viên, dự án): đổi gì thì tính lại, không đổi thì dùng lại. Mở tác phẩm lần đầu tốn thêm khoảng 150 ms để dựng kế hoạch đạo diễn, các lần sau như cũ (khoảng 30 ms).
- Lồng tiếng xong, chip đầu phòng và dòng "Giọng AI đã lồng x/y" tự đọc lại số mới (trước đây giữ số lúc mở phòng tới khi tải lại trang).
- Kiểm thử: `tools/test-voice.js` thêm ca CNS-146 trên bộ mẫu Tam Quốc qua đúng đường lồng tiếng thật (Google giả lập): chưa lồng → 0/31 · lồng nửa → 16/31 · lồng đủ → 31/31 · bảng tác phẩm cùng số · sửa lời một câu → tính lại. Server v0.19.0 chạy ca này ra 10/16, tức là test đỏ đúng chỗ.

## v0.19.0 — MCP từ xa có cấp phép OAuth: dán `https://tên-miền/mcp` vào Claude, bấm "Cấp phép" trên web
Ryan: "cập nhật được rồi nhưng có cách nào để hệ thống tự sinh mcp theo dạng https://tên-miền/mcp để bạn chủ động kết nối vào được rồi tôi chỉ cần vào cài đặt của web để chọn xác thực cấp phép không ?" · "và trang đăng nhập hiện tại là tôi kêu agent local làm thêm , nên hình như bản trên github chưa có".
- **Điều kiện** (một lần): `GC_PUBLIC_URL=https://tên-miền` + `GC_API_TOKEN` trong `.env`; proxy / tunnel cho các đường máy (`/mcp`, `/.well-known/oauth-*`, `/oauth/register|token|revoke`) đi thẳng tới app; cổng 443. Sau đó mỗi agent mới chỉ cần dán địa chỉ và bấm Cấp phép.
- **Địa chỉ `<GC_PUBLIC_URL>/mcp` tự có, agent tự khám phá**: đặt `GC_PUBLIC_URL=https://tên-miền` (lệnh `genchibi expose` tự đặt). `POST /mcp` không có token (hoặc token sai) trả **401 + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`** — Claude chỉ bắt đầu OAuth khi thấy 401 này. Metadata RFC 9728 (cả `/.well-known/oauth-protected-resource` lẫn bản hậu tố `/mcp`) và RFC 8414 (`/.well-known/oauth-authorization-server`: `issuer` khớp từng byte, PKCE S256, `authorization_response_iss_parameter_supported`; cố ý **không** khai cờ CIMD hay `offline_access`). Thiếu `GC_PUBLIC_URL` (hoặc dùng `http` với host công cộng) → OAuth **tắt**, `/mcp` vẫn 401 trơn như cũ.
- **Agent tự đăng ký, chủ chỉ bấm Cấp phép**: `POST /oauth/register` (RFC 7591) — chịu được trường lạ / thiếu, không bao giờ cấp `client_secret` (client công khai + PKCE), kẹp độ dài từng trường, bỏ ký tự vô hình / đảo chiều trong tên. `redirect_uri` mặc định chỉ nhận `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` và loopback `http://localhost|127.0.0.1:<port bất kỳ>/callback` (CLI; loopback so bỏ qua port, còn lại so tuyệt đối); client khác thêm bằng `GC_OAUTH_REDIRECTS`. Client chưa từng được cấp phép tự hết hạn sau 24 giờ; trần 50 client (đầy thì xoá client chưa duyệt cũ nhất **không có yêu cầu đang chờ**, hết chỗ thì 429).
- **Trang "Cấp phép kết nối agent"** (`GET /oauth/authorize`, tự chứa — một HTML, CSS + JS nhúng, CSP nonce, không tải tệp Studio): ghi tên agent (tự khai), **tên miền callback** (nhãn quen / bạn đã thêm / máy của bạn), mức agent xin; chủ **chọn mức** (mặc định `mcp:write`), nhập `GC_API_TOKEN` (hoặc dùng phiên Studio đã có), bấm **Cấp phép** (bật sau 800 ms, chống bấm nhầm / clickjacking) hoặc **Từ chối**. Nút gọi `POST /api/oauth/approve {request, decision, scope}` → `{redirect}`: đi qua đúng cổng `/api` sẵn có (token chủ + `X-GC-Request` + `originOK`; cục bộ không token cũng được) — **không tin "đã qua cổng đăng nhập ngoài"**. Lỗi trước khi tin được `redirect_uri` → trang lỗi, **không redirect** (không open-redirect). Redirect về agent mang `code` + `state` + **`iss`** (RFC 9207).
- **Token**: `POST /oauth/token` nhận **form-urlencoded** (Claude gửi dạng này) và JSON; mã dùng một lần, sống 60 giây, gắn client + redirect_uri + PKCE + resource; access 1 giờ, refresh 30 ngày **trượt, xoay vòng** (dùng lại refresh cũ = thu hồi cả chuỗi; riêng refresh *vừa* xoay mà bị gửi lại trong 60 giây khi cặp kế chưa ai dùng → cấp cặp mới, vì mất response hoặc hai phiên refresh song song); mã dùng lần hai thu hồi token đã cấp từ mã đó; `resource` (RFC 8707) chuẩn hoá rồi so với `<GC_PUBLIC_URL>/mcp` (origin trần cũng được hiểu là `/mcp` vì máy chỉ có một resource; khác thì `invalid_target`), token mang `aud`; đổi `GC_PUBLIC_URL` sang miền khác thì token cũ (kể cả refresh) bị gỡ. `POST /oauth/revoke` (RFC 7009). Mã lỗi đúng RFC 6749, `Cache-Control: no-store`.
- **Phạm vi ánh xạ vào kênh SẴN CÓ — không có hệ quyền thứ hai**: `mcp:read` = kênh link + chỉ tool `readOnlyHint` (cổng đóng khi tên tool lạ) · `mcp:write` = kênh link (tạo / sửa trong dự án; không giọng AI tốn lượt, không gỡ gói âm) + **không** `update_app` / `rollback_app` · `mcp:owner` = như token chủ máy. Kết nối OAuth không bao giờ gọi GitHub (`get_app_version` chỉ trả bản đã biết) và **không mở `/api`**. Token OAuth là Bearer tường minh nên `/mcp` không chặn theo Origin cho request mang token đó (backend claude.ai không gửi Origin). Token chủ máy, link có khoá `/mcp/<key>` chạy y như cũ.
- **Hệ thống › Kết nối agent** (Studio): địa chỉ MCP + nút chép + 3 bước dán vào claude.ai › Customize › Connectors; công tắc **"Cho phép agent tự đăng ký"** (mặc định bật khi có `GC_PUBLIC_URL`); bảng client (tên, domain callback, phạm vi, cấp lúc, dùng lần cuối, trạng thái); **Đổi phạm vi** (có hiệu lực ngay với token đang dùng) và **Thu hồi** (huỷ cả access lẫn refresh); ba mức quyền; mục riêng cho link có khoá cũ (link cũ mạnh hơn `mcp:write` một bậc: vẫn cập nhật được app). Không bao giờ hiện token / băm / secret.
- **Lưu trữ + bảo mật**: `data/oauth.json` (chmod 600) chỉ chứa **băm sha256** của token / secret (mã cấp phép chỉ nằm trong bộ nhớ), `lastUsedAt` ghi trễ; tệp hỏng được đổi tên `oauth.json.corrupt-<ts>` chứ không ghi đè; bảng không prototype (id `__proto__` / `constructor` không chạm `Object.prototype`); token không bao giờ vào log; từ chối đường dẫn có dot-segment / `%2e` trước mọi định tuyến. **Giới hạn tốc độ**: chỉ đếm lần *thất bại* của token / approve (request đúng không bao giờ bị chặn, kẻ lạ thử sai từ nhiều IP không làm chủ nhận 429), đếm mọi lần với đăng ký / authorize; trần theo IP trước, trần toàn cục rất cao (200 đăng ký / 10 phút, 600 authorize / phút) chỉ cộng cho request đã qua trần IP; request loopback thật được miễn; IP khách mặc định lấy từ mục cuối `X-Forwarded-For` và chỉ khi kết nối tới app đến từ loopback / mạng riêng (`GC_CLIENT_IP_HEADER=cf-connecting-ip` khi đứng sau Cloudflare). Yêu cầu chờ duyệt: tối đa 3 mỗi client, bảng đầy thì 429 — không đẩy yêu cầu của người khác.
- **`genchibi expose`** mở thêm đúng các đường OAuth qua tunnel (`/.well-known/oauth-*`, `/oauth/(register|token|revoke|authorize)`, `/api/oauth/approve`) và in cách nối bằng OAuth. **Bản cài cũ phải chạy lại `genchibi expose <tên-miền>`** để tunnel mở thêm các đường này. `docs/Caddyfile.oauth.example` + `docs/HUONG-DAN.md`: khi có cổng đăng nhập riêng đứng trước app (Caddy + `/login`), cho **đường máy đi thẳng** (`@machine`: `/mcp*`, `/.well-known/oauth-protected-resource*`, `/.well-known/oauth-authorization-server*`, `/oauth/register|token|revoke`) và để `/oauth/authorize` + Studio sau cổng; `forward_auth` đặt **trong** `handle` cuối, không đặt ở cấp site (nếu không `/mcp` nhận 302 / 401 của trang login, mất `WWW-Authenticate` và agent không tự khám phá được). Mục FAQ "trang đăng nhập riêng trước app" + `docker-compose.override.yml` (genchibi không bao giờ đụng file này).
- **v0.19 không thêm hệ thống đăng nhập**: chủ máy vẫn xác minh bằng token / phiên Studio sẵn có; trang đăng nhập riêng đứng ngoài app (nếu có) chỉ là lớp thêm, không thay được kiểm tra trong app. Đưa trang đăng nhập vào bản chính hay giữ ngoài app là việc **chờ Ryan quyết** (đề xuất: v0.20 làm đăng nhập Studio thật).
- **Khi trang đăng nhập riêng làm rơi / cắt địa chỉ** lúc chuyển hướng về trang Cấp phép: trang lỗi nói đúng nguyên nhân và cách xử lý (bấm Connect lần nữa khi đã đăng nhập, hoặc sửa cổng giữ nguyên query) thay vì chỉ báo "client_id không tồn tại". Studio › Kết nối agent: nhãn **"Đã cấu hình"** (không còn "Đã bật") và cảnh báo rõ khi thiếu `GC_API_TOKEN` (mọi request qua proxy / tunnel bị chặn); không gợi ý `genchibi expose` cho tên miền đã đứng sau proxy riêng.
- Biến môi trường mới: `GC_OAUTH_REDIRECTS` (thêm callback cho phép đăng ký), `GC_OAUTH_ACCESS_TTL` (giây, mặc định 3600), `GC_CLIENT_IP_HEADER` (`x-forwarded-for` | `cf-connecting-ip` | `x-real-ip`), `GC_OAUTH_RATE` (hệ số nhân trần toàn cục, chỉ để chạy test số lượng lớn). Endpoint mới: `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server`, `/oauth/{register,authorize,token,revoke}`, `/api/oauth` (+ `/approve`, `/clients/<id>` PUT, `/clients/<id>/revoke`).
- Kiểm thử: `tools/test-oauth.mjs` (nối vào `tools/test.sh`, mục **4c**) — khám phá đủ chuỗi (401 + header, 2 đường PRM, AS metadata không cờ CIMD) · DCR (allowlist callback, không secret, trần, tốc độ, ký tự vô hình) · authorize thiếu token chủ bị chặn · redirect lệch không redirect · PKCE / resource / state / iss · code một lần · refresh xoay vòng + ân hạn · hết hạn · thu hồi (RFC 7009 + trong Cài đặt) · phạm vi read / write / owner (danh sách tool theo phạm vi + gọi thẳng tool bị chặn) · token chủ máy + link có khoá vẫn chạy · `oauth.json` không chứa token rõ · log không lộ token · **đường máy qua "cổng đăng nhập ngoài" giả** (proxy chỉ cho path máy đi thẳng, discovery → DCR → token → `/mcp` chạy trọn không cần cookie / phiên Studio; approve vẫn đòi token chủ dù đã qua cổng) · đồng hồ giả (code 60 s, client 24 giờ, refresh trượt 30 ngày, trần 50) · DoS chính chủ (approve / token / pending / register). Nhóm trình duyệt `GC_ONLY=oauth`: trang Cấp phép (tên agent chữ thô, domain callback, token sai bị chặn, Cấp phép / Từ chối, nút trễ 800 ms) + Cài đặt › Kết nối agent (đổi phạm vi, thu hồi, công tắc). `tools/test-update.sh` mục 6: `docker-compose.override.yml` không bị update / rollback / `sync_compose` đụng tới.
- **Review bảo mật trước phát hành** (đã sửa, mỗi mục có test): refresh phải kiểm audience (đổi `GC_PUBLIC_URL` không để refresh cũ đổi được token mới) · giới hạn tốc độ từng làm DoS chính chủ (đếm cả request đúng / bị chặn, trần toàn cục thấp) → đổi sang "chỉ đếm thất bại theo IP" · đẩy yêu cầu chờ duyệt của người khác · `__proto__` / `constructor` làm 500 và làm bẩn `Object.prototype` · tin `cf-connecting-ip` / `x-real-ip` do client tự đặt · consent một cú click · cổng chỉ-đọc mở với tên tool lạ · `get_app_version` qua OAuth gọi GitHub · `GC_PUBLIC_URL` http công cộng · dot-segment · ký tự vô hình · `oauth.json` hỏng bị ghi đè lặng lẽ · refresh mất response · `style` inline bị CSP chặn.

## v0.18.1 — Nút Cập nhật không còn bị chặn nhầm "nguồn lạ"
Ryan: "tôi chưa cập nhật được nút cập nhật báo chặn nguồn lạ".
- **Rào chống CSRF bớt chặn nhầm**: lệnh thay đổi vẫn bắt buộc header `X-GC-Request` (lớp chặn chính — trang khác không gửi được vì máy chủ không trả CORS), còn kiểm Origin (lớp thứ hai) nay chấp nhận các cách mở hợp lệ: Origin trùng Host · trùng tên proxy báo (`X-Forwarded-Host`) hoặc `GC_PUBLIC_URL` · cùng là máy cục bộ (`localhost` ↔ `127.0.0.1` ↔ `[::1]`) và **cùng cổng**. Origin hỏng → 403 thay vì lỗi 500.
- **Khi vẫn chặn thì nói rõ vì sao**: câu báo ghi trang đang mở ở đâu, máy chủ nhận địa chỉ nào và cách khắc phục (mở đúng địa chỉ, hoặc `genchibi update` trong terminal — lệnh không đi qua trình duyệt nên không bị rào này chặn). Thêm vào *Câu hỏi thường gặp* của hướng dẫn.
- Kiểm thử: `tools/test-update.sh` mục 1b — 7 ca (trùng Host, localhost ↔ 127.0.0.1, [::1], proxy `X-Forwarded-Host`, khác cổng bị chặn, nguồn lạ 403 kèm lời giải thích, Origin hỏng 403).

## v0.18.0 — Thư viện › Âm thanh (hiệu ứng hoạt hình khoa trương, luật ghép) và Thư viện › Giọng; Trợ lý AI là một dock cột phải ở mọi khu; mỗi tác phẩm là một phòng làm phim riêng
Ryan: "các âm thanh hiệu ứng cũng cần cho vào thư viện để sau này có thể dùng lại nhé, nên đa dạng 1 chút và qui trình ghép cũng nên có qui định cụ thể để user và agent sau này có thể sử dụng dễ dàng nhanh chóng ." · "mấy cái âm thanh cũ mới của bạn cũng nghe chán ngắt tôi muốn cái kiểu khoa trương như trong phim hoạt hình ấy" · "làm tiếp đi, xong thì phát hành luôn , mà sao tôi chưa thấy những cái bạn tạo ra nằm đâu trên thư viện nào nhỉ" · "và trợ lý AI tạo asset hay tạo tác , hay tạo khung xương đều phải nằm ở chatroom dạng ở cột bên phải như Ai assitand mới đúng chứ nhỉ" · "và hình như còn thiếu khu vực chuyên môn để AI hiển thị mô tả phân cảnh kịch bản và review xem thử từng cảnh và toàn bộ --> được quản lý theo từng tác phẩm riêng đúng ko ?" · "hãy tăng tốc hoàn thiện cho chỉnh chu và goal luôn chứ lâu quá".
- **Âm thanh thành asset của thư viện** (`gen-chibi.sound/1`, loại asset thứ năm): mỗi âm là một **công thức tổng hợp dạng dữ liệu** (tone · noise · crackle · modes · voice · fm · mallet · drum, làn stereo) + nhãn tiếng Việt, nhóm, thẻ, câu **"dùng khi"**, thời lượng, cue (cảnh nào tự gán). Không có tệp âm thanh nào, không thư viện bên thứ ba; cổng kiểm chỉ nhận số + chuỗi trong danh sách cho phép (không mã, khoá lạ là lỗi có path (cả ở cấp gói)), ≤ 60 node Web Audio mỗi âm (L-42), tên âm là chung toàn thư viện (trùng → báo gói đang giữ tên).
- **Bộ chuẩn `gen.am`: 62 âm, 8 nhóm** — *Va chạm & đánh · Di chuyển · Hài hước · Cảm xúc & nhấn · Phép & năng lượng · Thiên nhiên · Đồ vật & chuông · Nhạc cụ hiệu ứng* — viết lại theo phong cách hoạt hình **khoa trương**: cao độ trượt 1–2 quãng tám, có nốt nhạc rõ, đuôi rung / lắc, cú lớn có hai nhịp (lấy đà → va): BONK, BOING, ZIP, WHAM, SPLAT, TA-DA, ba-dum-tss… 17 tên âm cũ (pop, whoosh, step, sting, hit, boing…) **giữ nguyên tên** nên kịch bản / gói cũ chạy không cần sửa, chỉ nghe khác. Độ to hiệu chuẩn bằng máy đo (±7 dB), không vỡ khi chồng 12 âm.
- **Gói âm riêng từng dự án**: bộ mẫu Tam Quốc có `tq-am` (trống trận, tù và, vó ngựa, kiếm cổ, mưa tên, ngựa hí, bắn tên). Âm của dự án nào chỉ dùng trong dự án đó; gói đi theo **gói dự án** (sao lưu · nhập · gói bán — chỉ gói đã phát hành), phim HTML xuất ra **nhúng gói âm phim dùng** (mở `file://` vẫn nghe đúng), sao lưu **tự đủ** (một hàm `bundleDeps` chung cho sao lưu, gói bán và phim xuất: kéo theo gói dùng chung mà phân cảnh gọi tên **và gói âm mà gói động tác gọi** `events[].sfx`; trần 32 gói âm / 8 gói động tác mỗi dự án, trần lưu = trần nhập, xuất vượt trần báo ngay); gói bán kèm gói âm nháp cần thiết và cảnh báo. Gói bán chặn **theo nội dung công thức** của bộ mẫu (đổi tên âm / tên gói / nhãn không lách được).
- **Bộ phát và đạo diễn dùng thư viện thay bảng cứng**: âm tự gán cho từng bước = `GC.sounds.cueFor({ state, fx, activity, mood, project })` — gói dự án thắng bộ chuẩn, cảnh hùng tráng / hài / buồn có thể đổi lựa chọn; âm sự kiện (trúng đòn, bị đỡ, né, bước chân, chuyển máy) cũng tra theo cue; `step.sfx` và sự kiện của gói động tác nhận **mọi tên trong thư viện** (lỗi có path + gợi ý tên gần nhất), lược đồ / lời nhắc đạo diễn / Bảng bước / luật S6 / bộ phát cùng một danh sách âm `GC.sounds.allowedSounds` theo **dự án của tác phẩm** (dàn diễn viên chỉ dự phòng) và dặn AI **để trống gần hết các bước**. Bước ra đòn không lời giờ phát `sfx` ghi tay (trước đây bị bỏ). Thiếu `engine/sounds.js` thì bộ phát / đạo diễn vẫn lập kế hoạch với 17 tên nhưng không có tiếng.
- **7 luật ghép S1–S7** (một nguồn ở `engine/sounds.js`, Studio · MCP · hướng dẫn agent cùng dùng): ≤ 3 âm / ≤ 1 âm nhấn mỗi bước (lỗi) · ≤ 4 âm trong 2 s · âm nhấn không đè thoại · âm va chạm để đòn tự phát · một âm ≤ 3 bước liền · âm phải có trong thư viện của dự án (lỗi, gợi ý tên gần nhất) · âm dài chỉ đầu / cuối cảnh. `save_shot` / `save_work` chạy luật: **lỗi → từ chối kèm path**, cảnh báo → trả kèm; `save_work` chỉ chặn lỗi do chính lần đổi. Âm **tự gán** cũng chịu S1 / S3 (cảnh báo "TỰ GÁN", tắt bằng `sfx: []`) và tự gán giữ tối đa một âm nhấn mỗi bước. Câu luật ở Studio, mô tả tool, hướng dẫn agent và tài liệu **sinh từ `RULES`** (test so khớp từng câu). Cộng 5 **công thức ghép mẫu** "đà → va → hậu quả" (vỏ chuối, đấm choáng, loé ý tưởng, biến hình, ba-dum-tss).
- **MCP 46 → 53 tool**: `list_sounds` (lọc nhóm / thẻ / chữ bỏ dấu / dự án) · `get_sound_spec` (chuẩn + luật + công thức + ví dụ chạy được) · `get_sound_pack` (cả bộ chuẩn làm mẫu, hoặc vài âm) · `validate_sound_pack` · `save_sound_pack` (phiên bản, bỏ âm đang được gọi hoặc đổi dự án → 409 kèm danh sách, chủ máy mới `force` được; qua link / chatroom bắt buộc `project`, không đè gói chung / gói dự án khác — cả qua `import_project`; gói dùng chung **không được có `cue`** (Q16 mặc định: không đổi âm tự gán của khung); ≤ 32 gói âm mỗi dự án) · `lint_sound_track` (steps / event / shot / cả tác phẩm; trần 12 bước × 200 phân cảnh, 1 MB) · **`delete_sound_pack`** (chỉ chủ máy; tệp vào thùng rác, lịch sử phiên bản còn). HTTP `GET / POST /api/sound-packs`, `DELETE /api/sound-packs/<id>` (409 khi còn chỗ gọi, `?force=1`). Gói âm giữ `license` / `owner` / `author`; id `constructor` / `__proto__` bị chặn; gói cũ lưu trước bản này có `cue` dùng chung thì nạp khoan dung (bỏ cue, kèm cảnh báo trong `start_here`). `preview_shot` cho agent (không nghe được) thấy **âm nào sẽ phát ở từng bước**. Hướng dẫn agent: chủ đề `sound` (luật S1–S7, nhóm, công thức **sinh từ engine**, không chép tay) + ví dụ CI chạy thật; "agent từ số 0" đi trọn luồng âm thanh chỉ bằng hướng dẫn.
- **Cho Studio**: `GC.sounds.list / info / packs / pack`, `GC.audio.sfx` (▶ nghe), **`GC.audio.renderWav(tên | danh sách, opts)` → Promise<ArrayBuffer>** (WAV 16-bit stereo dựng offline bằng chuỗi trộn riêng, không cần unlock — để tải một âm hoặc cả công thức ghép). Bảng bước: ô chọn âm lấy nhãn tiếng Việt từ thư viện.
- Bộ mẫu **Tam Quốc** (bản `2026.10.19-am2` — nút ⟳ Cập nhật hiện): trống trận làm nền hiệp đấu tập, vó ngựa lính báo tin, ngựa hí lúc Tào Tháo tháo chạy, tù và ở bước im ngay trước lời thề vườn đào (không đè lời) — `lintSoundTrack` sạch.
- **Thư viện › Âm thanh và Thư viện › Giọng** (Studio, kiểu Data Console (một phần: chưa có thanh công thức / ô truy vấn / CSV — CNS-110), desktop): hai trang mới ngay dưới *Động tác* — để những gì đã tạo **nằm đúng trong Thư viện, xem và nghe được**. Bảng kiểu Excel (dải chữ cột, ID hàng, cột đóng băng, sắp xếp theo tiêu đề cột, footer đếm), ô tìm **không dấu**, **Inspector 400 px**, phím `↑` `↓` / `J` `K` đổi hàng, `Space` nghe hàng đang chọn, `/` nhảy vào ô tìm; khi cột Trợ lý AI bên phải mở và chỗ chật thì Inspector tự rơi xuống dưới bảng.
- **Thư viện › Âm thanh** — 3 tab:
  - **Âm**: 62 âm bộ chuẩn + âm của mọi gói (bộ mẫu Tam Quốc: 7 âm → 69). Cột ID âm (tên dùng trong `step.sfx`), nhãn, nhóm, giây, **"dùng khi"**, thẻ, gói, dự án, **cảnh tự gán (cue)**. Lọc 8 nhóm (có số đếm) · thẻ · gói · dự án (chỉ hiện âm dự án đó dùng được = luật S6). **▶ nghe ngay trên hàng.** Inspector: **Nghe**, **Tải WAV** (dựng offline — một âm lẫn công thức), **Chép tên**, thẻ bấm để lọc, cue, ghi chú điểm va / âm nhấn / âm dài, và hộp **Dùng trong kịch bản**: một **bước kịch bản JSON** chép dán được ngay (`sfx: ["tên"]`; âm nhấn đặt ở bước không lời; qua S1–S7) + đoạn **gọi MCP** (`lint_sound_track` kèm `project`, cách tra `list_sounds` / `get_sound_pack`).
  - **Luật ghép**: quy trình ghép 5 bước, **bảy luật S1–S7** (Lỗi chặn lưu / Cảnh báo chỉ nhắc) và **5 công thức ghép mẫu** — mỗi công thức có **▶ Nghe chuỗi** (đúng độ trễ từng âm), **Tải WAV**, **Chép các bước** — lấy thẳng từ `GC.sounds` (`RULES`, `RECIPES`, `guide()`), **một nguồn** với agent nên không bao giờ lệch. Ô **Thử kiểm luật**: dán các bước JSON, chọn dự án → lỗi / cảnh báo kèm vị trí, như `lint_sound_track`.
  - **Gói âm**: danh sách gói (ID, tên, dự án, phiên bản, số âm, trạng thái, nguồn), **Tải JSON**, **Xem âm** của gói, **Gỡ gói** (gói của người dùng; bấm 2 lần; còn chỗ gọi → danh sách + "Vẫn gỡ"; tệp vào thùng rác); **Nhập gói**: chọn tệp hoặc dán JSON → *Kiểm gói (không lưu)* → *Nhập vào thư viện* (`POST api/sound-packs`, chọn dự án). Lỗi cổng kiểm hiện **kèm đường dẫn** (cả cổng cục bộ lẫn máy chủ), trùng tên âm bị chặn ngay. Máy chủ chưa có `api/sound-packs` hoặc bản xem thử: chỉ hiện gói trong engine, vẫn kiểm được, nút nhập khoá.
- **Thư viện › Giọng** — nơi **duy nhất** xem / nghe / thiết kế bộ giọng vai (CNS-106; Cài đặt AI › Giọng AI chỉ còn key, bật / tắt, trần câu / ngày, giọng tạm hỏng, số câu hôm nay + lối "Xem bộ giọng vai → Thư viện › Giọng"; một bộ hàm cast / thiết kế dùng chung):
  - **Bộ giọng vai**: 22 vai — ID vai, vai, nhóm tuổi, giới, văn / võ / quyền quý / hài…, **phong cách nói**, **thiết kế được?** (4 vai trẻ em ghi **Google chặn**), giọng AI sẽ dùng, nhân vật của dự án dùng vai đó, **câu mẫu** theo vai × ngôn ngữ (88 câu trong một hằng `VOICE_LINES` dễ sửa; ông lão tiếng Việt: "Con à, đời người như chén trà…"). Thanh trên chọn **ngôn ngữ + giọng vùng** (vi Bắc / Nam / Trung · en Mỹ / Anh · zh phổ thông / Đài · yue Hồng Kông), dự án, kiểu vai, tuổi.
    - Mỗi hàng: **▶ giọng máy** (trình duyệt, miễn phí) và **AI**: clip mẫu **đã có** → nghe ngay, **không tốn lượt** (kiểm bằng `dry`); chưa có → **"Đọc mẫu bằng AI (1 lượt)"** — **báo trước, bấm 2 lần** mới đọc (tự huỷ sau 5 giây); hết lượt thì báo **giờ thử lại**, không khoá giao diện.
    - Inspector: câu mẫu + nghe, mô tả vai, **giọng AI sẽ được chọn** (cast) ở ngôn ngữ / vùng đang chọn, **giọng đã thiết kế** (nghe mẫu), nút **Thiết kế giọng cho vai này** (tốn 1 lượt, bấm 2 lần; vai trẻ em mờ kèm lý do Google chặn), danh sách **nhân vật trong dự án dùng vai** (bấm mở hồ sơ; *đã chọn* / *đoán*).
  - Giọng **chốt theo tác phẩm** không nằm ở đây: nút **Chốt giọng cho tác phẩm › phòng làm phim** mở thẳng tab *Giọng & âm thanh* của tác phẩm — ở đó có **một bảng** nhân vật → vai → giọng chốt (`work.voices`), nguồn, câu thoại, ▶ máy / ▶ AI đúng giọng chốt, **Chốt giọng cả dàn (miễn phí)**.
  - **Chưa có key Google**: vẫn xem và nghe được giọng máy; có lời nhắc và nút tới *Cài đặt AI › Giọng AI*. Dán key và trần câu / ngày vẫn ở Cài đặt AI.
- **Trợ lý AI = một dock cột phải, có mặt ở cả 4 khu** (Xưởng · Bộ khung · Thư viện · Tạo tác; trang Hệ thống dùng vai chung). Không còn trang chat riêng "Trợ lý AI tạo asset" (route cũ mở dock) và panel chat cột trái của Tạo tác. Rộng mặc định **380 px**, kéo đổi được (chuột, hoặc ← → khi mép đang chọn), thu gọn / mở bằng nút **Trợ lý AI** và **Alt+J**, nhớ trạng thái + độ rộng theo máy; dưới 1100 px thành **ngăn kéo phủ** bên phải.
- **Đổi vai theo khu** — máy chủ nhận `context { zone, page, object: {kind, id}, tab, shot }` và chọn **chỉ dẫn + bộ tool** theo khu, tất cả nằm một nguồn ở `server/mcp.js` (`ZONES`): *Xưởng* tạo / sửa asset từ khung · *Bộ khung* giải thích khung, tạo asset từ khung, dựng **gói động tác / tư thế** trên khung xương (`save_motion_pack`) — **không sửa khung gốc** (INT-10) · *Thư viện* tìm / xem / ghép asset đã có — **không tạo mới** (máy chủ từ chối, AI mời sang Xưởng bằng chip `⟦zone:xuong|Mở Xưởng⟧`), không động tới tác phẩm · *Tạo tác* AI đạo diễn của tác phẩm đang mở (kèm hiện trạng + ghi chú duyệt). Mọi khu: không tool hệ thống, không tool giọng AI tốn lượt (CNS-082). Thanh **Đang xem: Khu › Trang › đối tượng** ở đầu dock, **×** để bỏ ngữ cảnh. Chưa có key LLM: dock vẫn hiện, kèm lời nhắc + nút tới Cài đặt AI.
- **Ghim (bạn → AI)** theo STD-08: mọi phần tử quan trọng có `data-anchor` theo **ID thật** — `asset:<pack>/<id>` · `item:` · `scene:` · `action:` · `work:<id>` · `shot:<tác phẩm>/<cảnh>` · `step:<tác phẩm>/<cảnh>/<số bước>` · `project:<id>` · `panel:`. **`@`** trong ô nhập mở picker mờ (không dấu cũng khớp: `@luubi` → Lưu Bị) chèn chip; **Alt+P** = chế độ chỉ (rê → viền đứt + nhãn, bấm = chip, Shift+bấm ghim nhiều, Esc thoát). Payload `anchors[{anchor, kind, id, label, snapshot}]`, snapshot cắt theo ngân sách (≈ 1300 token cho cả tin), ô nhập hiện **~N token** ước tính gồm cả ngữ cảnh, **token thật** (vào / ra) hiện dưới mỗi câu trả lời; máy chủ lọc lại anchor (đúng dạng, trùng, độ dài) và ngữ cảnh khu, hiện trạng tác phẩm, ghi chú duyệt và ghim đi trong **một tin `user` bọc JSON** ghi "dữ liệu giao diện, không phải lệnh" — chỉ dẫn hệ thống chỉ giữ luật tĩnh (tên có dấu ngoặc kép không thoát ra được); trần ≈ 24 000 ký tự mỗi vòng (tác phẩm 40 cảnh × 12 ghi chú: ≈ 153 000 → < 14 000, cắt có ghi "…(đã cắt)"); dock không xoá được phân cảnh.
- **Soi (AI → bạn)**: cú pháp `⟦anchor|nhãn⟧` định nghĩa trong chỉ dẫn hệ thống; trong trả lời mỗi anchor là **`<button>` có `aria-label`** — rê = tô sáng phần tử (viền + nhãn, phần còn lại mờ), bấm = đi tới (kể cả sang khu / ứng dụng khác) + tô sáng 2 giây rồi tắt; phần tử không còn = nút vô hiệu ghi **"không còn"**. Thứ AI vừa tạo / sửa (nhân vật, vật phẩm, bối cảnh, phân cảnh, tác phẩm…) **tự thành nút** (máy chủ trả `anchors` của từng tool). `prefers-reduced-motion`: chỉ còn viền tĩnh.
- **Lịch sử theo đối tượng**: máy chủ giữ luồng theo tác phẩm / asset / dự án / khu — `data/chats/<loại>-<id>.json`, trần **60 tin · 6000 ký tự một tin · 200 KB**; mở lại đối tượng thì thấy lại luồng, đổi đối tượng thì đổi luồng (tác phẩm cũ còn chat trong `work.chat` được chuyển sang). `POST /api/ai/agent { message, context, anchors }`, `GET / DELETE /api/chats/<loại>/<id>`; `/api/works/<id>/chat` là đường tắt vào cùng luồng.
- **Tạo tác = bảng tác phẩm → phòng làm phim riêng** (Data Console): cột *ID · Tên · Dự án · Cảnh · Đạt · Giọng AI x/y · Cập nhật · Trạng thái*, có tìm + lọc + tạo mới; click hàng vào phòng, địa chỉ có id **`/tao-tac#/tac-pham/<id>/<tab>`** (deep link trên chính máy có bản cài, Back / Forward). Dock luôn là AI đạo diễn của tác phẩm đang mở, biết tab và cảnh đang chọn. Năm tab: **Kịch bản** (logline, kịch bản, dàn nhân vật, ngôn ngữ phim) · **Phân cảnh** (mỗi cảnh: ảnh khung đầu, tên, mô tả, bối cảnh, dàn diễn viên, số bước, **thời lượng ước tính**, *Xem bước*, Bảng bước, AI viết lời thoại; mọi thứ AI đạo diễn viết hiện ở đây) · **Xem & duyệt** (▶ từng cảnh và ▶ cả phim; **Nháp / Cần sửa / Đạt** + ghi chú gắn cảnh, tuỳ chọn gắn bước; "Gửi AI sửa theo ghi chú" ghim cảnh + bước vào dock) · **Giọng & âm thanh** (ngôn ngữ / giọng vùng, Lồng tiếng AI, giọng chốt theo nhân vật, ô Âm thanh chấm luật S1–S7 của cả tác phẩm) · **Xuất bản** (Phim HTML có hộp hỏi khi thiếu giọng, Storyboard SVG / PNG, JSON, gói dự án). Lồng tiếng AI, hộp thiếu giọng, `needGood`, gói âm của v0.17.1 / v0.18 giữ nguyên hành vi, chỉ dời chỗ.
- **Duyệt từng cảnh lưu vào tác phẩm** (`work.review`): `{ shots: { <id cảnh>: { status: draft | fix | ok, notes: [{ id, text, step?, at, by }] } }, note }` qua `save_work` / HTTP, cổng riêng — **chặn khoá lạ** (đường dẫn máy đọc được), kẹp ghi chú 400 ký tự / 12 ghi chú một cảnh / 40 cảnh, id + giờ do máy chủ đặt; **chỉ chủ đặt "Đạt" trong Studio** (Q18 mặc định); AI (dock) và agent (MCP token, stdio, link) chỉ đặt Nháp / Cần sửa và **thêm** ghi chú mang nhãn `by` (owner · ai · agent · system), không xoá / sửa ghi chú của chủ, không xoá cả bảng duyệt; nhập gói có cảnh trùng id mà nội dung khác → về "Nháp"; cảnh đổi nội dung sau khi "Đạt" tự về "Nháp" kèm ghi chú (số **Đạt x/y** không nói dối); gói dự án mang theo `review`; MCP `get_work` trả `review` để agent đọc ghi chú.
- **Đề xuất sửa chờ duyệt** (STD-08 `propose_edit`, chỉ có trong dock — agent MCP không có chủ duyệt tại chỗ): AI muốn sửa **mô tả cảnh** hoặc **danh sách bước** mà bạn chưa bảo "làm luôn" thì đề xuất; máy chủ kiểm ngay (bước sai thì AI phải sửa lại), Studio hiện **diff** (từ thêm xanh / bớt đỏ; dòng bước thêm / bớt) với **Áp dụng** / **Bỏ**; Áp dụng đi lại qua cổng phân cảnh (dàn diễn viên đổi trong lúc chờ → 422, đề xuất còn nguyên để xem).
- Kiểm thử: **2m** thư viện (354 kiểm tra; cổng kiểm 64 ca sai, tự gán = bảng cũ ở ~27 000 tổ hợp, S1–S7) · **2n** nối vào app (lược đồ / bộ kiểm / lời nhắc đạo diễn, bộ phát theo dự án + không khí, gói động tác, store + 6 tool + HTTP, lint khi lưu, gói dự án sao lưu / nhập / bán + chặn bán theo nội dung, Tam Quốc, hướng dẫn một nguồn — 211 kiểm tra) · **2l** thêm `renderWav` (WAV đúng đầu tệp, đỉnh ≤ −0,3 dBFS, không đụng bộ phát đang chạy, chạy khi chưa unlock) · trình duyệt: phim Tam Quốc xuất ra mang `DATA.soundPacks`, mở `file://` phát lời thề gọi tù và, `renderWav` chạy trong phim · Thư viện (trình duyệt `GC_ONLY=lib`): 8 mục: bảng 62 + 7 âm, lọc nhóm / thẻ / gói / dự án, tìm không dấu, sắp xếp, ▶ gọi `sfx` đúng tên, phím ↑↓ / Space, chép JSON bước (qua S1–S7) + MCP, tải WAV (RIFF), S1–S7 khớp `RULES`, nghe chuỗi đúng độ trễ, kiểm luật, nhập gói lỗi hiện path (cục bộ + máy chủ), endpoint 404; 22 vai, cast đổi theo ngôn ngữ / vùng, `dry` không tốn lượt, "Đọc mẫu bằng AI" gửi đúng role / lang / accent / giọng, hết lượt báo giờ thử lại, thiết kế (vai trẻ em bị chặn), nhân vật Tam Quốc dùng vai, giọng chốt của tác phẩm, chưa có key có lời nhắc · dock + phòng làm phim: `tools/test-dock.mjs` (59 kiểm) + `tools/test-dock-core.mjs` (83 kiểm: quyền duyệt theo 3 kênh, bản sao khung, ngữ cảnh bọc JSON + trần, khoá lượt theo tác phẩm, Thư viện không tạo mới) — 59 kiểm cũ gồm phía máy chủ: vai + tool theo khu, ghim, luồng theo đối tượng + trần, đề xuất sửa, review) vào `tools/test.sh`; nhóm trình duyệt mới trong `tools/test-browser.mjs` (LLM giả, không ra mạng): dock ở cả 4 khu · context đổi theo khu · `@` picker chèn chip · payload có anchors · chip trong trả lời điều hướng + tô sáng · "không còn" · lịch sử theo tác phẩm · danh sách → phòng · duyệt lưu + "Đạt x/y" · Áp dụng / Bỏ · chưa có key; các test cũ của Tạo tác (lồng tiếng, xuất phim, hộp thiếu giọng, Bảng bước) vẫn xanh.
- **Sửa lỗi (cổng cortex v0.18)**: bản sao nhân vật / vật phẩm / bối cảnh tạo từ **khung** luôn là **Nháp** (trước đây mang "Phát hành" của khung và lọt vào gói bán — có từ v0.12.0); trần lịch sử chat 200 KB đo trên tệp thật; hai luồng chat cùng ghi một tác phẩm → lượt sau nhận 409 (khoá theo tác phẩm, không ghi chồng). Phong cách 62 âm hoạt hình **chờ Ryan nghe trong app** (Q17).
- **Lời thoại mở khi sân khấu đã đứng yên, hiện đủ lâu trên máy chậm** (CNS-099, lỗi thật có từ v0.17.1): bộ phát đếm giờ bằng hẹn giờ trong khi thứ người xem thấy chỉ tiến khi trình duyệt vẽ khung — máy bận (0,7–3 s không vẽ khung) thì bong bóng mở lúc diễn viên trên màn hình còn đang đi tới chỗ (đè đầu tới 48 000 px²) và câu ngắn chỉ hiện 0,1–0,26 s. Nay bong bóng chỉ mở khi diễn viên + máy quay đã đứng yên trên màn hình, giờ đọc / giữ khung tính từ lúc bong bóng thật sự hiện, bong bóng đã đóng không bật lại; bước im không còn mở bong bóng rỗng (vẫn diễn, phát âm, giữ khung). Nhịp phim chậm hơn ~0,15 s mỗi câu trên máy nhanh. Test: rào "không còn chuyển động lúc mở", "không bong bóng rỗng", "hiện ≥ 380 ms", lượt tất định "khung hình trễ 0,9 s", chi phí bố cục lấy nhỏ nhất trong 5 lần giải; 10/10 xanh khi máy bận và khi rảnh, bản hỏng cố ý vẫn đỏ.

## v0.17.1 — Giọng nói trong phim: không cắt đuôi câu, không để robot lẫn vào giọng AI, báo trước khi xuất phim thiếu giọng
Ryan: "4,5,6 bị lỗi âm thanh giọng nói. bạn làm hoàn thiện cho kỹ đi". Phân cảnh 4–6 của phim Tam Quốc là chỗ Google hết lượt giữa chừng: câu chưa có clip giọng AI rơi về giọng trình duyệt — trên Linux, Chrome không có giọng tiếng Việt nên chỉ còn blip bíp bíp, Firefox là espeak-ng chung một giọng robot cho cả dàn — và cùng một nhân vật đổi từ giọng AI sang robot / blip ngay giữa phim. Tái hiện bằng speechSynthesis giả (13 kịch bản trình duyệt × phim 31 câu có 19 câu giọng AI) rồi sửa tận gốc.
- **Câu đọc bằng giọng máy không còn bị cắt đuôi**: đồng hồ an toàn (tự giải phóng khi trình duyệt không bắn `onend`) tính từ lúc **bắt đầu nói** (`onstart`) thay vì lúc gọi `speak()` — giọng mạng (Edge Online, Google) trễ 0,3–2 s mới lên tiếng — và cộng quãng nghỉ ở dấu câu mà ước lượng cũ không đếm. Giọng nạp chậm 1,8 s: 10 / 17 câu bị cắt → 0.
- **Edge chọn đúng giọng thần kinh**: Edge liệt kê giọng máy cũ "Microsoft An" **trước** "NamMinh Online (Natural)", hai giọng hoà điểm nên giọng cũ thắng. Điểm Natural / Online tăng lên để thắng điểm "giọng máy" — vai nam dùng NamMinh, vai nữ dùng HoaiMy (trước: cả 12 câu giọng An đời cũ).
- **Giọng máy bị kẹt không còn im lặng mà miệng vẫn nhép**: không có `onstart` sau 1,5 s mà `speechSynthesis.speaking` vẫn false (Chrome nuốt `speak()` sau `cancel()`) → `cancel` rồi nói lại **đúng một lần**; vẫn kẹt → cả câu bằng blip, và 30 giây sau mới thử lại giọng máy (các câu kế khỏi chờ lại từng câu). Giọng mạng đang nạp (`speaking` = true) vẫn được chờ, tới 4 s. Miệng chỉ nhép khi đã có dấu hiệu đang nói: số câu nhép lúc im lặng 12–17 / 17 → 0 ở mọi kịch bản kẹt.
- **Giọng dự phòng hai hạng — robot không lẫn vào giọng AI**: `GC.audio.voiceTier()` phân giọng trình duyệt thành **basic** — máy đọc kiểu cũ nhận ra được (espeak / speech-dispatcher / pico / festival / mbrola, biến thể "+Tên", Microsoft đời cũ không "Online", giọng chỉ mang tên ngôn ngữ như "Vietnamese") — và **good** cho mọi giọng còn lại (Natural / Online / Neural, Google, Apple "Linh", Google TTS / Samsung TTS trên Android…: tên lạ mặc định good để điện thoại không mất giọng thật). Giọng truyền cho `say()` có thêm `needGood`: chỉ đọc bằng giọng máy nếu giọng tìm được thuộc hạng good, không thì **blip**. Bộ phát (`opts.needGood`) bật khi kiểu giọng là **tự động** và tác phẩm / phim có ít nhất một clip giọng AI — cả **phim xuất** lẫn **Sân khấu final**; chọn hẳn **Máy đọc** thì không bật (muốn máy đọc thì cứ đọc). Trên Sân khấu, "có clip AI" biết từ clip đầu tiên về. Kết quả đo: Firefox espeak-ng / Chrome Linux espeak — 12 câu robot lẫn giọng AI → 12 câu blip (cả phim một kiểu giọng); Edge thật — 12 câu giọng An đời cũ → giọng Natural.
- **Xuất phim thiếu giọng AI hỏi trước**: bấm **Phim (HTML)** khi Giọng AI sẵn sàng mà còn câu chưa có clip → hộp "Còn N/M câu chưa có giọng AI — câu thiếu sẽ đọc bằng giọng máy / blip" với ba nút **Lồng tiếng rồi xuất** (lồng như nút Lồng tiếng AI, xong hoặc dừng vì hết lượt thì tự xuất; bấm Dừng lồng tiếng thì không xuất) · **Xuất luôn** · **Huỷ**. Giọng AI chưa sẵn sàng thì xuất như cũ. Phim xuất ra có nhãn nhỏ **"Giọng AI 19/31"** cạnh ô Giọng khi chưa đủ (title nói rõ phần còn lại đọc bằng giọng máy / blip).
- **Giới hạn mỗi phút của Google không còn làm dừng lồng tiếng (CNS-098)**: 429 không phải trần của máy mà giờ thử lại cách ≤ 2 phút → hiện "Google giới hạn mỗi phút — tự lồng tiếp lúc HH:MM:SS", chờ tới giờ rồi đọc tiếp **đúng câu đó** (tối đa 10 lần chờ mỗi lượt bấm; **Dừng lồng tiếng** huỷ cả lúc đang chờ). Giờ thử lại xa → "Hết lượt hôm nay — thử lại lúc …" (trước là "Hết lượt giọng AI"); chạm trần câu / ngày giữ nguyên chữ. `retryAt` nhận cả ISO lẫn ms epoch.
- **Ký hiệu "…" "—" "–" không còn làm giọng máy đọc vấp**: đổi thành dấu phẩy ngay trước khi đưa cho `SpeechSynthesisUtterance` (bỏ ở đầu chữ / cuối câu / trước dấu câu); chữ trên màn hình giữ nguyên, chỉ số từ của `onboundary` vẫn khớp.
- Kiểm thử: **2k** thêm đồng hồ ảo (chạy tức thì, tất định) + AudioContext giả đếm âm tiết blip — synth kẹt (nuốt `speak()`, `speaking` = false → cancel + nói lại một lần → blip; kẹt một lần rồi chạy được vẫn là giọng máy; nạp chậm 1,8 s không bị cắt; `speaking` = true quá 4 s → blip), hạng giọng với 55 tên giọng thật (Edge, Google, Apple, Android, espeak, Chrome Linux, Microsoft cũ), `needGood` × 11 tổ hợp bộ giọng, "…" / "—" giữ đúng chỉ số từ; đối chiếu đỏ trên mã cũ. **Trình duyệt** thêm 5b (giới hạn mỗi phút: chờ → tự lồng đủ 15 câu, retryAt ms epoch, Dừng lúc chờ, tối đa 10 lần, trần ngày dừng ngay), 5c (hộp xuất thiếu giọng: 3 nút, Huỷ / Xuất luôn / Lồng tiếng rồi xuất, hết lượt giữa chừng, Dừng thì không xuất, chưa có key), `needGood` trên Sân khấu (tự động / AI Google / máy đọc / chưa có clip) và trong phim xuất (đủ, 9/15, 0 clip; nhãn "Giọng AI 9/15"). Đột biến 6 chỗ ở lớp engine + 7 chỗ ở Studio đều làm test đỏ.
- **Review trước phát hành** (đã sửa): "Xuất luôn" trong hộp xuất phim tính lại theo tác phẩm lúc bấm (hộp mở lâu — vừa lồng thêm, đổi ngôn ngữ, sửa kịch bản — không còn xuất bản cũ; đổi ngôn ngữ / bắt đầu lồng tiếng thì đóng hộp); đổi tác phẩm trong lúc hỏi giọng thì không hiện hộp của tác phẩm cũ, "Lồng tiếng rồi xuất" không lồng nhầm tác phẩm; trình duyệt báo lỗi ngay trong `speak()` (Chrome `not-allowed`) thì câu chuyển blip và **không** bị nói lại đè lên blip (test: câu dài, onerror đồng bộ → đúng 1 lần speak; gỡ bản sửa → đỏ); đồng hồ máy chạy nhanh hơn server thì mỗi lần chờ giới hạn phút vẫn tối thiểu 1,5 s; giọng đùa / MacinTalk / Eloquence của macOS (Fred, Albert, Zarvox, Eddy, Grandpa…) là hạng cơ bản, Fred không còn được ưu tiên cho vai nam.
- Test trình duyệt "tua biên đạo 14,4 s" hết đỏ chập chờn: chờ nhãn cập nhật ở khung vẽ kế tiếp thay vì đọc ngay.

## v0.17.0 — Lời thoại không che mặt, giọng AI theo vai bằng 4 thứ tiếng, chuỗi trộn âm thanh mới
Ryan: "bong bóng chat che vào nhân vật và cách trình bày không chuyên nghiệp" · "hiệu ứng âm thanh tệ quá" · "nên có hệ thống xịn 1 chút về tiếng việt , tiếng anh và tiếng trung chuyên biệt theo nhu cầu" · "nhất là nên có nhiều loại giọng cho các loại nhân vật già trẻ lớn bé , văn võ, trai gái, ông bà lão" · "nhập token vào là chạy được ngay chứ không phải cấu hình rắc rối" · "thêm tiếng cantoness (hongkong) nữa nhé".
- **Lời thoại không che mặt ai**: bộ giải bố cục (`GC.film.solveLayout`, thuần số) đo đầu từng diễn viên từ khung xương thật (cả chu kỳ động tác, cả quãng bước tới / lùi) qua máy quay hiện tại, rồi chấm các chỗ đặt bong bóng — không đè đầu ai, đuôi không cắt ngang đầu người khác, gần miệng người nói. Hết chỗ sạch thì **phụ đề** dải dưới (thẻ tên màu nhân vật). Ô **Lời thoại: tự động / bong bóng / phụ đề** ở Sân khấu final và trong phim xuất ra. Đo trên hai phim mẫu (46 câu): 0 px² đè đầu, bố cục ~8 ms / câu (tính một lần mỗi câu).
- **Chữ lời thoại**: phông **Be Vietnam Pro** nhúng (SIL OFL 1.1, cắt Latin + tiếng Việt, ~45 KB; toàn văn giấy phép đi kèm phim xuất), một cỡ chữ theo khung, mọi từ đọc được ngay (từ chưa đọc chỉ nhạt nhẹ), thẻ tên trong bong bóng đủ tương phản 4,5 : 1; vẽ lại bong bóng nói / hét / nghĩ / thì thầm; tôn trọng giảm chuyển động.
- **Chuỗi trộn âm thanh mới**: hiệu ứng đi bus riêng có nén nhẹ + phòng vang (đáp ứng xung sinh bằng code), không bị nén "keo" của nhạc / lời làm xẹp; limiter + cắt mềm −0,3 dBFS — 12 âm chồng nhau không vỡ; 17 hiệu ứng tổng hợp lại nhiều lớp, độ to đều (chênh LUFS 24 → 7 dB). Ryan nghe bản so sánh: "mấy cái âm thanh cũ mới của bạn cũng nghe chán ngắt tôi muốn cái kiểu khoa trương như trong phim hoạt hình ấy" → bộ hiệu ứng khoa trương kiểu hoạt hình + thư viện âm thanh làm ở bản kế (bài học L-63).
- **Giọng AI theo vai** (Google Gemini TTS): 22 vai — bé trai, bé gái, thiếu niên, thiếu nữ, thanh niên, trung niên, ông lão, bà lão, võ tướng, nữ tướng, hiệp khách, quân sư, tiểu thư, vua, hoàng hậu, phản diện (nam / nữ), vai hài (nam / nữ), người kể chuyện… — vai đoán từ vai trò / tính cách / tên, chọn tay được (bộ mẫu đã chọn sẵn). **4 ngôn ngữ** của tác phẩm: tiếng Việt, tiếng Anh (Mỹ / Anh), tiếng Trung (phổ thông / Đài Loan), **tiếng Quảng Đông (Hồng Kông)** — lời thoại viết bằng ngôn ngữ đó (AI đạo diễn và hướng dẫn agent theo ngôn ngữ của tác phẩm).
- **Mỗi nhân vật một giọng, chốt theo tác phẩm**: giọng đã **thiết kế** cho vai → giọng **thư viện Google** bản ngữ hợp giới + tuổi + cao độ + chất giọng (40 giọng tiếng Việt, hơn 300 giọng Anh) → giọng dựng sẵn hợp vai. Giọng của dàn được chốt vào tác phẩm: thêm diễn viên hay Google thêm giọng không đổi giọng người cũ; Studio, MCP và phim xuất cùng một giọng; gói dự án mang theo.
- **Thiết kế giọng vai** (một nút, ~25 s, tốn một lượt): ông lão, bà lão, võ tướng, tiếng Trung / Quảng Đông… Giọng lưu trong project Google của chủ máy (Google giữ 1 năm kể từ lần dùng cuối, tối đa 200 giọng). **Giọng vùng tiếng Việt (Bắc / Trung / Nam) chỉ có ở vai đã thiết kế giọng** — thư viện Google không phân vùng; Sân khấu báo số vai đã có giọng vùng và có nút thiết kế cho cả dàn (bấm tay, báo trước số lượt). Google chặn thiết kế giọng trẻ em → vai bé lồng bằng giọng nữ cao trẻ trung có sẵn (cách lồng tiếng hoạt hình).
- **Dán key là chạy**: Cài đặt AI › Giọng AI — một ô dán key Google AI Studio → kiểm ngay bằng lệnh miễn phí → tự bật; đã có key Gemini của AI đạo diễn thì dùng luôn. Đọc qua **Interactions API** đúng hướng dẫn Google (chữ nguyên văn, cách nói của vai + cảm xúc ở `speech_metadata.style`); model quét lúc chạy, hết lượt tự chuyển model kế, hết hẳn thì báo đúng giờ thử lại Google đưa (đọc từ phản hồi thật) và rơi về giọng trình duyệt. Câu đã đọc lưu đệm theo nội dung — nghe lại, xuất phim không tốn lượt. Gói miễn phí của Google: 10 câu / ngày / model.
- **Chi tiêu chỉ chủ máy**: lồng tiếng / thiết kế giọng chỉ chạy khi chủ máy bấm (Studio, stdio, MCP có token); qua link MCP chỉ lấy câu đã lồng sẵn, AI chatroom không có tool giọng; **trần câu / ngày** (mặc định 200, đổi ở Cài đặt AI). Giọng Google báo không còn thì tạm bỏ 24 giờ, có nút thử lại.
- **Lồng tiếng AI** cả tác phẩm (Sân khấu final, có tiến độ, dừng đúng khi hết lượt); bộ phát hỏi trước clip của cả phân cảnh; **phim xuất** nhúng giọng đã lồng + ngôn ngữ (mở file:// không gọi mạng). Hồ sơ nhân vật › Giọng: vai, giọng vùng, giọng AI, cao độ / tốc độ.
- **Giọng trình duyệt dự phòng** đúng ngôn ngữ + giọng vùng + giới của vai (giọng Edge / Google / hệ điều hành; Anh Anh en-GB, Đài Loan zh-TW, Quảng Đông zh-HK), không bao giờ đọc tiếng Việt bằng giọng Anh hay tiếng Quảng Đông bằng giọng phổ thông.
- **MCP 46 tool**: `render_voice` nhận `role` / `lang` / `accent` / `work` (giọng đã chốt) / `include_audio`; mới `design_voice` (chỉ chủ máy); `save_work` nhận `lang` / `accent`; `get_catalog` có `voiceRoles`, `voiceLangs`; nhân vật lưu `voice.role` / `voice.accent` / `voice.ai`; lỗi hết lượt có `retryAt`. Hướng dẫn agent (phim bước 8, nhân vật, luật vàng 6) viết lại.
- Kiểm thử: **2k** giọng AI với mạng giả dựng từ **phản hồi thật đã đo** (`tools/fixtures/voice`, 0 lời gọi Google): dán key, Interactions / đời trước, 429 thật, trần ngày, giọng hỏng có hạn, cast theo vai + chốt theo tác phẩm, thiết kế (vai trẻ em bị chặn), tiếng Quảng Đông, kênh link / chatroom, gói dự án giữ ngôn ngữ, giọng trình duyệt; thử ngược 5 rào đỏ → test đỏ. **2l** âm thanh (render offline trong Chromium khi có Playwright: không NaN / vỡ / câm, độ to, rò node = 0, clip giọng mọi định dạng). Trình duyệt: lời thoại (46 câu, phụ đề, khung 640 / 420 px, hiệu năng, thử ngược bộ giải cũ → đỏ) + nhóm "giọng AI" (mock mọi `api/voice`, chặn mọi yêu cầu ra ngoài). Cổng cortex v0.17: 3 🔴 + 4 🟠 đã sửa trước khi nâng `VERSION`.

## v0.16.0 — Gói động tác thành asset, bộ đòn khung trung lập, MCP đầy đủ cho agent mọi hãng
Ryan chốt Q9 / Q10 theo mặc định (ADR 0006): biên đạo kéo về trục asset; khung có bộ động tác trung lập, đòn riêng chủ đề thành gói của bộ chủ đề. Thêm: "xây hệ thống api mcp cho hoàn chỉnh và skill sử dụng và bootstrap cụ thể" · "agent sau này chưa chắc là claude".
- **Gói động tác** (`gen-chibi.motion/1`) — loại asset thứ tư, dữ liệu thuần qua cổng như linh kiện / cảnh: tư thế + clip + hành động + màn diễn. Cổng kẹp mọi số, tra mọi tên trong từ vựng, không nhận hàm / HTML, chặn khoá prototype và kế thừa vòng tròn, có trần tổng (khựng hình, bóng mờ / vệt chém, **một hành động ≤ 6 s**, kích thước) + trần cứng lúc chạy; dựng thử có hạn chót 4 s (gói nặng bị từ chối, không chặn server). Tư thế / clip của gói mang tiền tố riêng (không đè được khung); id hành động chung toàn hệ → trùng khung / gói khác / tên trạng thái bị chặn. Lưu = kiểm + **dựng thử** mọi hành động trên ma-nơ-canh. Nằm trong gói dự án (nhập trước tác phẩm), sao lưu, gói bán; bộ mẫu nhận ra theo **nội dung từng clip** (tư thế giải ra số khớp): chép nguyên clip, đổi id gói / id đòn / tên clip / tên tư thế, thêm tư thế thừa vẫn bị chặn bán. Chữ ký so khớp **chính xác**: sửa số liệu của clip (dù rất nhỏ) thì app tự cài không nhận ra — phần đó do giấy phép bộ mẫu điều chỉnh, không phải kỹ thuật.
- **Bộ động tác của khung** (trung lập chủ đề): tay không + hài — **đấm** (tay cao su, đánh vào mặt: chibi đầu to tay ngắn, đấm vào thân thì hai đầu chồng nhau), **đá**, **đẩy mặt**, **ném cà chua** (đường bay tính từ tay lúc buông tới ngực đối thủ); đòn binh khí chung đâm / quét (`needs: weapon`); một mình: vẫy chào + 9 động tác cũ. Điểm đánh theo từng cú (mũi binh khí / nắm tay / bàn chân). Đòn chạm gần (đá, đẩy) đánh xong **lùi về** thay vì đứng sát rồi chồng đầu; chồng đầu trước lúc va chạm thì chỉ thu ngắn đúng phần thiếu (đá trúng rồi ngã: đòn hụt ≤ 16 thay vì 46 như bản nháp).
- **Binh khí có nguồn dữ liệu**: nhân vật có binh khí khi tay phải cầm trang bị loại *Vũ khí* hoặc linh kiện khai `grip: weapon` (quạt lông Gia Cát Lượng là đạo cụ). Linh kiện tự vẽ trước v0.16 chưa khai `grip`: vật cầm tay **dài** vẫn tính là binh khí (phim cũ không mất màn đấu) — khai `grip` để chắc chắn. Bộ kiểm chặn đòn binh khí cho người tay không và gợi ý đòn làm được; AI đạo diễn chỉ được mời đòn của khung + gói thuộc dự án của dàn diễn viên.
- **Bộ Tam Quốc**: đòn kiểu Tử Long (liên hoàn, xoay chém, tung người bổ, múa thương) + màn "Tử Long 30 giây" chuyển thành **gói động tác dữ liệu** của bộ mẫu — màn 30 giây khớp tuyệt đối số đo bản code cũ. Khung không còn tham chiếu nhân vật / tên Tam Quốc.
- **Xuất hoạt ảnh một hành động** (engine, chạy cả Node): khung cố định ôm trọn đòn + hiệu ứng, nền trong suốt → các khung SVG, sprite sheet, timeline (`gen-chibi.anim/1`: fps, khung va chạm, đoạn clip). Đòn dài hơn trần khung (120) thì **tự hạ fps** cho khung phủ trọn đòn (`requestedFps`, `truncated`); sprite sheet đặt tiền tố id riêng cho từng khung.
- **Studio · Bảng bước** (Q9 "ô chọn đòn"): soạn kịch bản một phân cảnh không cần AI — lưới kiểu bảng tính (`B01`…, ≤ 12 bước), mọi ô chọn sinh từ lược đồ đạo diễn; ô Hành động chỉ có đòn diễn viên của hàng làm được (nhãn đòn đánh / ném / cần binh khí); Đối thủ mở khi chọn đòn đánh, Phản ứng khi có đối thủ; trường phụ (máy quay, bong bóng, hiệu ứng, âm thanh…) ở ô "thêm…". Lỗi kiểm hiện cạnh hàng, cảnh báo dàn dựng hiện trước khi lưu; lưu qua đúng cổng như AI / MCP.
- **Studio · Thư viện › Động tác**: đòn của khung + từng gói động tác theo dự án (Nháp / Phát hành / Bộ mẫu); xem trước trên nhân vật thật với đối thủ + phản ứng; **tải hoạt ảnh một đòn**: PNG sprite sheet, **GIF** (bộ mã hoá GIF89a viết thuần trong Studio, nền trong suốt, lặp mãi), SVG sheet, JSON timeline; tải / nhập gói động tác (lỗi cổng hiện đủ). Phim HTML xuất ra mang theo gói động tác của đòn đã dùng (review bắt lỗi rơi gói khi đóng gói — đã sửa, có test phim Tam Quốc đủ 6/6 chương). Nhập gói chọn **dự án** (mặc định dự án vừa dùng, trừ dự án mẫu; để trống = gói chung dùng với mọi dàn diễn viên); gói / JSON hoạt ảnh của bộ mẫu mang dấu và giấy phép bộ mẫu; ô người ra đòn làm mờ người không làm được; fps tự hạ được ghi rõ; xuất PNG / GIF nhả luồng sau từng khung và hiện % (trang vẫn bấm được trong lúc xuất).
- **Bảng bước an toàn hơn** (review): sửa trong lúc đang lưu không còn bị đánh dấu "đã lưu" (mất chữ lặng lẽ); nút Lưu khoá khi đang gửi; kéo bôi chữ ra ngoài không đóng bảng; cảnh báo dàn dựng chỉ tính lại khi đổi dàn / đòn / chỗ đứng (gõ thoại không nhấp nháy); giữ tiêu điểm khi xoá hàng / bấm chip, Esc không đóng khi đang gõ dấu, hỏi trước khi rời trang còn thay đổi.
- **MCP đầy đủ cho mọi việc tạo / kiểm / dựng / xuất asset (31 → 44 tool)**: `start_here` (gọi đầu tiên), `get_guide`, `list_actions`, `list_motion_packs`, `get_motion_pack`, `get_motion_spec`, `validate_motion_pack`, `save_motion_pack`, `render_action`, `preview_shot`, `list_samples`, `install_sample`, `list_events`; `get_catalog` có hành động, `get_director_schema` có `actorsCan`, `render_character` nhận `action`. **Mọi** lời gọi hỏng ở mọi tool (cả `validate_*` không đạt) có **mã ổn định** `[VALIDATION_FAILED]` / `NOT_FOUND` / `CONFLICT` / `FORBIDDEN` / … + `structuredContent.error.details[].path` (lỗi kịch bản chỉ `steps[i].field`) + gợi ý; trường cũ (`saved`, `errors`, `gates`, `conflicts`) vẫn giữ trong `structuredContent`. **Đổi so với v0.15 (client ngoài để ý):** chữ của lời gọi lỗi không còn là JSON thuần (mở đầu `[CODE]`, JSON cũ nằm ở dòng cuối); `import_project` lỗi: `structuredContent.error` là object (trước là chuỗi); `validate_*` không đạt giờ là lỗi `isError`; lỗi `save_shot` chỉ `shot.event.steps[i].field`. Chưa có tool: xoá / thùng rác / lịch sử phiên bản (cố ý — agent không xoá), xuất storyboard / phim HTML (Studio).
- **Hướng dẫn agent một nguồn, trung lập model** (`agent/`): GUIDE.md (luật vàng, mã lỗi, thuật ngữ Việt ↔ API) + 9 quy trình theo chủ đề + ví dụ JSON được CI chạy thật. Phát qua MCP, HTTP thuần (`GET /mcp?guide=` · `?tools=openai|gemini|mcp`), và lớp bọc từng hãng sinh từ cùng nguồn (Claude skill, `AGENTS.md`, `GEMINI.md`, Cursor rule).
- **Bootstrap**: `genchibi agent connect` (cấu hình nối Claude Code / Cursor / Gemini CLI / Codex CLI / curl; không in token, link Internet không kèm token) · `agent skill <hãng>` (cài vào thư mục đang đứng / `--dir`; không ghi đè `AGENTS.md` / `GEMINI.md` / rule có sẵn của bạn trừ khi `--force`) · `agent guide [chủ đề]` · `agent tools --format openai|gemini`. Token gửi qua stdin của curl, không lộ trong `ps`.
- **Không mất đòn im lặng**: thanh Sẵn sàng báo đòn không có (thiếu gói) hoặc diễn viên không làm được; bộ phát ghi cảnh báo thay vì bỏ qua. Gói sao lưu kéo theo gói động tác mà phim của dự án dùng (cả gói của dự án khác) → khôi phục ở máy sạch đủ màn đấu.
- **Chặn quá tải**: một hành động ≤ 6 s, ≤ 4 sự kiện bóng mờ / vạch tốc độ / vệt chém mỗi clip, dựng thử ≤ 4 s, ≤ 8 gói động tác mỗi gói dự án, lô JSON-RPC ≤ 20 lời gọi; id trùng tên dành riêng của JavaScript (`toString`, `constructor`…) bị chặn; `render_action` kẹp `fps` / `cell`.
- Sửa: `weaponOf` coi `gen.core/none` là tay không (trước đây tay không bị tính như cầm binh khí dài 24). Trang demo biên đạo chỉ nhúng thứ cần dùng, không tải font ngoài (CNS-040).
- Kiểm thử: **3c** thêm lô JSON-RPC > 20 → 413 và **CLI chạy thật** (`agent skill` không ghi đè tệp của bạn, `--force`, cài vào thư mục đang đứng, `connect` không in token, token không nằm trong argv của curl). **2j** (`tools/test-motion.js`) — cổng gói động tác chặn đúng chỗ 15 kiểu tấn công (thời lượng khổng lồ, 2 000 khựng hình, NaN, hàm, prototype, chèn màu, vòng kế thừa, phần tử null, quá ngân sách vệt chém, hành động quá dài…) + gói nặng nhất cổng cho qua dựng thử dưới trần, hết hạn chót → "quá nặng" không lưu, gói dự án tối đa 8 gói động tác; hình học đấm / đá / đẩy mặt / ném **đo độc lập** từ ma trận khớp ở các cặp chỗ đứng thật × trúng / ngã / choáng, và tâm hai đầu không chồng ở 3 đòn × 5 phản ứng × mọi cặp; gói bán chặn gói mẫu ngụy trang 4 kiểu, gói tự làm bán được; sao lưu tự đủ + khôi phục máy sạch; dữ liệu trước v0.16; hoạt ảnh phủ trọn đòn; 28 lời gọi hỏng ở mọi tool + 19 trường kịch bản làm hỏng lần lượt đúng hợp đồng `[CODE]` và đường dẫn. Trình duyệt thêm bảng bước (ô hành động lọc theo binh khí, đổi đòn rồi lưu) và trang Động tác (GIF giải mã lại đủ khung + lặp, nhập gói hỏng hiện lỗi 422); 3c **"agent từ số 0"** — agent tất định chỉ dùng hướng dẫn + ví dụ nguyên văn qua JSON-RPC thuần đi trọn luồng (dự án → linh kiện → trang bị → nhân vật → cảnh → gói động tác → phim → hoạt ảnh → gói dự án), hợp đồng lỗi có mã, đường không-MCP, lớp bọc từng hãng, độ phủ hướng dẫn ↔ tool.

## v0.15.1 — Sửa màn đấu v0.15.0: binh khí xuyên người, chồng đầu, lộn đè người xem
v0.15.0 phát hành theo lệnh Ryan trước khi review mã + kiểm toàn vẹn (cortex) chạy xong; bản này sửa mọi phát hiện của hai vòng đó.
- **Đính chính v0.15.0**: changelog v0.15.0 viết "hình học binh khí đọc thẳng từ bản vẽ" và "không chồng người" — **không đúng**. Màn đấu khi đó vẫn tính tầm bằng cây thương mặc định (mũi thương bạc xuyên qua thân đối thủ), còn test đo bằng chính hàm sai nên không bắt được. Bản này dùng hình học thật; test đo độc lập từ ma trận khớp + bản vẽ.
- **Không chồng đầu**: `duel()` dựng xong thì đo khoảng cách tâm đầu hai người suốt màn; đổ người tới (đâm, quét, bổ) hoặc đối thủ gập người khi trúng mà hai đầu gần hơn ~0,9 bề rộng đầu → người ra đòn lùi lại đúng phần thiếu rồi dựng lại (gần nhất trước đây 36, nay ≥ 71 ở mọi cặp đòn × phản ứng × vị trí).
- **Tung người bổ xuống** là đòn **đập đất**: mũi thương cắm xuống ngay trước mặt đối thủ, trúng bằng chấn động (vòng sóng, RẦM!) — trường mới `shock` trong `ACTIONS`.
- **Không lộn / văng / lùi đè lên người đứng xem**: đạo diễn truyền chỗ đứng của người xem (`walls`) vào biên đạo; né lộn ngược, văng ngã, lùi lấy đà dừng trước họ một thân người. Hết chỗ lùi thì đòn **bay ngắn lại** (`tscale` theo từng bước) thay vì thu nhỏ đều mọi bước (từng làm đòn bổ hụt hẳn). Người đứng chen giữa hai đấu thủ không làm đổi màn đấu.
- Xoay người chém sang trái không còn quay lưng về đối thủ; liên hoàn canh tầm theo cú đâm (không theo cú hất lên); né canh cú đầu, trúng canh cú cuối; giữ diễn viên trong sân khấu tính đúng gốc của từng người.
- Bộ phát phim: bấm dừng giữa màn đấu gỡ sạch lớp hiệu ứng + bộ điều khiển; hết màn không còn xoay người một vòng; khung điện ảnh không loé lên lúc tắt; dựng lại màn khi vị trí lệch thì đúng hướng và không làm hỏng phim nếu lỗi.
- Cảm xúc tay đưa lên mặt (nghĩ ngợi, hả hê, thèm, van xin, nghiến răng, ủ rũ, xoa…) **cất binh khí** — không còn kiếm / thương cắt ngang mặt.
- Bảo mật bộ mẫu: dấu theo nội dung so bằng JSON chuẩn hoá (đảo thứ tự khoá không gỡ được dấu); `action` / `react` là khoá prototype (`toString`, `constructor`) bị chặn.
- **Cập nhật bộ mẫu**: máy đang giữ Tam Quốc bản cũ (chưa có *Đấu tập trước trận*) thấy nút **⟳ Cập nhật Tam Quốc** ở Thư viện › Dự án chủ đề.
- Kiểm thử: 2g đo tâm đầu ≥ 68 suốt màn, mũi binh khí bằng hình học thật, người xem sau lưng không bị đè; mỗi rào mới đã được thử ngược (tắt rào → test đỏ). Test trình duyệt: dừng giữa màn đấu, luồng cập nhật bộ mẫu; tự dọn server khi test hỏng giữa chừng.

## v0.15.0 — Biên đạo: nhân vật diễn liên hoàn, đấu võ trong phim, máy quay điện ảnh
Ryan: "các động tác quá nghèo nàn… rất khó để biểu diễn ra các chuỗi hành động liên hoàn đẹp mắt sinh động", "khi làm phim phải kết hợp hiệu ứng phóng to thu nhỏ, di chuyển nhanh chậm và rất nhiều thứ khác". Thử thách: "1 nhân vật hoạt động linh hoạt trong vòng 30s… liên hoàn, chuyển tiếp mượt mà, không trùng nhau".
- **Biên đạo** (`engine/choreo.js`, thuần dữ liệu, chạy cả trong Node): tư thế then chốt + nhịp (bật nhanh, vượt quá rồi về, rơi tự do) → **lò xo** cho phần lắc theo (đầu, vạt áo, cẳng tay, binh khí) → dịch chuyển gốc trong thế giới → **hai đồng hồ** giờ truyện / giờ thật (**slow-mo**, tua nhanh, **khựng hình** khi trúng đòn) → **máy quay** bám kiểu lò xo, dẫn khung, nghiêng, rung, **thị sai 4 lớp cảnh** → hiệu ứng (vệt chém, va chạm, bụi, vòng sóng, mảnh vỡ, bóng mờ, vạch tốc độ, khung điện ảnh, chữ tượng thanh) + âm thanh theo nhịp. Nhiều diễn viên chung một đồng hồ. Đổi chính diện ↔ nghiêng đi qua góc 45° ở giữa.
- **Màn mẫu "Tử Long 30 giây"**: Triệu Vân diễn liền 29 hành vi không lặp (rón rén, giật mình, chạy, múa thương, đâm, quét, xoay, tung người slow-mo, bổ xuống, trúng đá, lộn, choáng, bật dậy, lướt, lộn ngược, gạt đỡ, phản đòn, nhảy mừng, thi lễ…). `tools/choreo-demo.js` xuất thành trang HTML tự chạy kèm số đo.
- **Đấu võ trong phim**: bước kịch bản có `action` / `target` / `react` (xem Hướng dẫn). `GC.choreo.duel` tự tính tầm (lướt tới / lùi lại cho mũi binh khí chạm mặt trước thân đối thủ, không chồng người), đối thủ phản ứng đúng khung va chạm (trúng, ngã lộn, choáng, gạt đỡ, né), không văng khỏi sân khấu. Bộ phát chạy biên đạo ngay trên diễn viên đang có (`render.full().drive`), máy quay hai người bám theo, đẩy máy khi trúng, người xem giật mình. Hình học binh khí (dài tới mũi, nghiêng sẵn) đọc thẳng từ bản vẽ đồ cầm tay *(đính chính ở v0.15.1: bản này chưa dùng tới — sửa ở v0.15.1)*.
- AI đạo diễn được dạy các đòn / phản ứng; lược đồ + bộ kiểm chặn đòn thiếu đối thủ, đối thủ cho hành động một mình, phản ứng lạ. Phim Tam Quốc thêm phân cảnh **Đấu tập trước trận** (Triệu Vân ↔ Trương Phi).
- **18 cảm xúc thành 18 dáng toàn thân** khác nhau rõ (17 động tác mới, nghiêng thân, dồn trọng tâm, tay bất đối xứng, tay "cao su"): khoảng cách hình bóng giữa hai cảm xúc gần nhất 1,4 → 8,1.
- Engine: `finishPose`, `jointMatrices`, `sceneLayers`, `keyPoints` / `poseDistance` (đo hình bóng), `director.hide` (cất / rút binh khí).
- Dấu bộ mẫu **theo nội dung** (review bảo mật): gói bán so hình vẽ từng linh kiện với bộ mẫu app mang sẵn — gỡ dấu trong gói hay đổi id vẫn bị nhận ra.
- Kiểm thử: `tools/test.sh` 2g (đấu trong phim: chạm ±14, phản ứng đúng khung ±0,03 s, không chồng người, không văng khỏi sân khấu), 2h (cảm xúc khác dáng), 2i (màn 30 s: thời lượng, không lặp, độ mượt p99 ≤ 24 đv/khung); trình duyệt: trang biên đạo độc lập, phân cảnh đấu diễn thật trong bộ phát phim.

## v0.14.0 — Phim sống: dàn dựng, máy quay, nhép miệng, bong bóng truyện tranh, âm thanh, giọng nói
Ryan xem phim v0.13: "nhân vật chỉ biết đứng yên rồi nhúng nhúng… bong bóng chữ không chuyên nghiệp… không có âm thanh hiệu ứng… không có giọng nói… không nhép miệng". Bộ phát được làm lại từ gốc.
- **Đạo diễn tự động** (`GC.film.direct`, thuần dữ liệu, test được trong Node): nhân vật **đi / chạy ra sân** từ hai phía; **đi tới chỗ mới** khi kịch bản đổi chỗ đứng; **bước tới** người nghe khi giận / thề / van xin, **lùi lại** khi sốc / hoảng (không đè lên người khác); người nói **quay về người nghe**, khoa tay khi nói (động tác mới `talk`); người nghe quay về người nói, **gật gù** (động tác mới `nod`), **giật mình** khi bị hét.
- **Máy quay**: cận mặt người nói (đọc được biểu cảm), khung hai người khi đối đáp, toàn cảnh khi cả nhóm ăn mừng; câu hét đẩy máy vào + rung, câu sốc chớp trắng.
- **Nhép miệng**: miệng người nói đổi ngậm / mở nhỏ / mở to theo từng âm tiết của giọng đọc (chỉ thay lớp miệng — rẻ).
- **Bong bóng thoại kiểu truyện tranh** vẽ SVG: nói (bo tròn), **hét** (răng cưa, chữ đậm rung), **nghĩ** (đám mây + bọt bay về đầu), thì thầm (viền đứt); đuôi chỉ đúng miệng người nói, thẻ tên theo màu nhân vật, chữ hiện từng từ theo giọng.
- **Âm thanh** (`engine/audio.js`, Web Audio tổng hợp — không tệp, không mạng, chạy cả trong phim mở bằng file://): 17 hiệu ứng theo cảm xúc / hành động / bước chân / thẻ tiêu đề; tiếng nền theo bối cảnh (chim, dế, mưa, gió, trong nhà); nhạc nhẹ theo không khí phân cảnh (êm, căng, hùng tráng, hài, buồn), tự hạ khi có lời.
- **Giọng nói riêng từng nhân vật**: máy đọc tiếng Việt của trình duyệt (cao độ + tốc độ theo nhân vật); không có giọng Việt thì **giọng blip** kiểu game (có dấu thanh, câu hỏi lên giọng). Công thức nhân vật có trường `voice { pitch, rate }`; Thư viện › Nhân vật › **Giọng**: kéo, nghe thử, lưu. Chưa đặt thì tự chọn theo vai.
- Sân khấu Studio và phim xuất ra có nút 🔊 bật / tắt tiếng và chọn giọng (tự động / máy đọc / blip / tắt).
- Kịch bản có thể chỉ đạo từng câu: `to`, `camera` (close / two / wide), `bubble` (say / shout / think / whisper), `sfx` — AI đạo diễn được dạy các trường này và được nhắc đổi `spot` để nhân vật đi lại.
- Hai phim mẫu viết lại có dàn dựng + giọng riêng (Văn phòng vui, Tam Quốc).
- Theo kiểm toàn vẹn (cortex): **bộ mẫu Tam Quốc** mang dấu Gen Labs — xem, sửa thử, làm phim; **không xuất gói bán** (sao lưu vẫn giữ dấu; đổi tên không gỡ được); gói làm bằng bản gen-chibi mới hơn → báo cập nhật trước khi ghi; tóc dữ liệu thiếu bản sau lưng → khung tự phủ mảng tóc theo viền đầu; Lưu Bị có **song kiếm**, Triệu Vân có **thương bạc tua đỏ** — mỗi tướng một bộ dấu nhận diện riêng.
- Theo review mã: `hold` (giữ khung) lại có hiệu lực — câu "..." `hold: 5` hiện đủ 5 giây; câu hét ở toàn cảnh zoom quanh tâm khung (không lệch góc trái trên); bước thoại thiếu `say` không còn hiện chữ "undefined"; bấm diễn rồi dừng ngay trong cùng nhịp không còn bật nhạc sau khi đã dừng; phim xuất ra chốt sẵn giọng từng nhân vật (giống Studio).
- **Dấu nguồn gốc bộ mẫu theo từng mục** (review mã, CNS-022): linh kiện / trang bị / cảnh / nhân vật nhập từ bộ mẫu mang dấu riêng; gói bán của **dự án khác** dùng tới chúng bị chặn (403, nêu tên mục); gói sao lưu mang dấu theo, nhập lại ở máy khác vẫn chặn.
- Kiểm thử: `tools/test.sh` 2g (đạo diễn tự động: ra sân, đi lại, bong bóng, máy quay, khẩu hình, phản ứng mọi câu; lược đồ chặn giá trị sai), 2f mở rộng; trình duyệt đo đúng điều người xem thấy (nhân vật di chuyển, miệng nhép, máy quay cận, bong bóng có đuôi + thẻ tên, âm thanh bật).

## v0.13.0 — Bài thử khung: bộ chủ đề Tam Quốc dựng từ khung
- **Bộ chủ đề mẫu "Tam Quốc"** (`studio/mau/tam-quoc.json`): 7 tướng (Gia Cát Lượng, Quan Vũ, Trương Phi, Tào Tháo, Lưu Bị, Triệu Vân, Lính quèn), 13 trang bị, 8 bối cảnh, 26 linh kiện nhân vật + 27 phông dạng dữ liệu, phim *Từ vườn đào tới Xích Bích* (5 phân cảnh). Dựng lại bộ v0.5 (viết bằng code) thành **dự án chủ đề tạo từ khung**, đi qua đúng cổng nhập như mọi gói; mọi asset đã Phát hành → xem ngay một **Gói bán** trọn bộ. Lưu Bị và Triệu Vân phối 0 linh kiện mới.
- **Linh kiện dữ liệu ngang linh kiện code** (phát hiện khi chạy bài thử khung):
  - `d="{shape}"` — vẽ theo **dáng đầu thật** của nhân vật ở mọi góc (mặt nạ kinh kịch khít đầu tròn / vuông / oval; mảng tóc sau gáy).
  - **Đánh dấu chiếu 45°** `<g class="gc-f45 | gc-f45c | gc-b45t | gc-b45h">` trong các lớp góc nghiêng: engine thay bằng phép chiếu mặt / thân thật lúc dựng — dữ liệu không cần `clipPath`, `url()`.
  - `eyeArea` cho mặt nạ, `tall` / `upright` cho vật cầm tay.
  - Bộ lọc số nhận dạng `.25` (SVG hợp lệ, rất hay gặp ở SVG do AI / người viết).
  - `get_part_spec` mô tả đủ các năng lực trên cho agent.
- Tóc có bản **135° / sau lưng** (trước đây tóc búi / dựng / gọn biến mất khi nhân vật quay lưng).
- Engine: ở 135° mượn bản sau lưng của linh kiện là bản vẽ thật — không còn đè tóc bằng lớp tóc sau (tóc chỉ có bản sau lưng từng biến mất ở 135°).
- An toàn (theo review): đánh dấu chiếu **không được lồng nhau** (mỗi phép chiếu nhân đôi nội dung — lồng 14 tầng từng phình 336 ký tự thành 6,5 MB), phải là nhóm có nội dung chỉ mang `class`; `<g …/>` tự đóng được chuẩn hoá và không còn làm lệch cặp nhóm; thay đánh dấu là vòng lặp tuyến tính không đệ quy; id cắt theo đầu kèm góc nhìn (bàn soát nhiều góc trong một SVG); viền `{shape}` nhận mọi thứ tự thuộc tính.
- Cổng linh kiện có **lời khuyên** (không chặn) cho lỗi qua được cổng nhưng lộ ra khi nhìn: tóc thiếu bản sau lưng, mặt nạ tô kín mặt chưa dùng `{shape}`, vật cầm tay thiếu icon — trả về ở `preview_part` / `save_part`.
- Studio: chọn dự án mẫu — **Văn phòng vui** (xem luồng 10 giây) hoặc **Tam Quốc** (bộ chủ đề trọn vẹn).
- `archive/tamquoc/port.js` — công cụ dev dựng lại gói từ nguồn; `tools/test.sh` (2f) chặn gói lệch nguồn, dựng 210 ảnh (7 tướng × 10 góc × 3 biểu cảm) không còn token / đánh dấu sót, chặn 7 kiểu dữ liệu sai.

## v0.12.0 — Nháp / Phát hành, Gói bán, thư viện gen.*
Áp các quyết định Q1–Q4 của Ryan (2026-10-18) — xem `docs/spec/DAC-TA-3-GIAI-DOAN.md`.
- **Hai trạng thái asset: Nháp / Phát hành** (thay Chờ duyệt / Đã duyệt). Nháp dùng ngay trong dự án — mặc định cho mọi asset, kể cả AI tự tạo; **Phát hành** đưa asset vào gói bán (nhân vật cần dấu nhận diện). Nút **Phát hành / Về nháp** ở khu *Dùng* của Thư viện; bấm xong vẫn đứng ở asset đó. Dữ liệu cũ tự quy đổi (`approved` → Phát hành, `review` → Nháp).
- **Gói bán** (Thư viện › Dự án chủ đề): chỉ asset phát hành, không kèm tác phẩm; asset phát hành cần thứ còn nháp (ví dụ vật phẩm đang cầm) → gói vẫn kéo theo cho đủ và **cảnh báo**. **Gói sao lưu** giữ nguyên: mọi asset + tác phẩm. Gói ghi `kind: sale | backup`. MCP `export_project` có `sale: true`. Bản xem thử không server dùng cùng luật.
- **Đổi tên thư viện** `afi.core` → **`gen.core`**, `afi.khung` → **`gen.khung`** (tệp `kinds/character/gen.core.js`, `kinds/khung/gen.khung.js`). Tham chiếu, gói dự án và dữ liệu cũ `afi.*` vẫn đọc được (`aliases` của pack, `GC.canon`) và được chuẩn hoá sang tên mới khi lưu.
- Dữ liệu lưu trước v0.12 (tham chiếu `afi.*`) được chuẩn hoá ở mọi lối: tra nhân vật (MCP / phân cảnh), đọc tác phẩm (Studio, AI đạo diễn), xuất gói (gói luôn ghi tên mới, `requires` đủ), sửa phân cảnh cũ không âm thầm mất bối cảnh / lời thoại; Studio nạp bản ghi cũ trong pack khung thành bản sao *Của tôi* như server (theo review).
- **Định vị:** gen-chibi là nhà máy asset chibi theo chủ đề; làm phim là cách dùng asset và là bản demo của thư viện (README, Hướng dẫn).
- Hook dự án chặn `pkill -f` / `killall` khi làm việc trên repo (bài học vận hành).
- Sửa test tự cập nhật trượt ngẫu nhiên ~1/16 lần: bước "làm hỏng checksum" gán ký tự đầu thành `0` — no-op khi hash vốn bắt đầu bằng `0`. Nay luôn đổi sang ký tự khác và kiểm đã hỏng thật trước khi kiểm updater chặn.
- Kiểm thử: gói bán (rỗng khi toàn nháp, chỉ asset phát hành, cảnh báo phụ thuộc nháp), quy đổi trạng thái cũ, phát hành thiếu dấu nhận diện bị chặn / nháp thì không, MCP `export_project` sale, tham chiếu `afi.*` cũ (nhân vật, item, gói, bản ghi trong pack khung), luồng trình duyệt Phát hành → Gói bán.

## v0.11.1 — Hoàn thiện theo kiểm toàn vẹn (cortex)
- Menu Xưởng tách hai nhóm: **Xưởng — tạo asset từ khung** (Tạo asset mới, bàn chỉnh, Trợ lý AI tạo asset) và **Khung chuẩn — quy cách · kiểm** (việc của Gen Labs). Mở Xưởng vào thẳng *Tạo asset mới*.
- Bảng tình trạng tác phẩm: phân cảnh thiếu diễn viên / bối cảnh có nút **+ Nhân vật ở Xưởng** / **+ Bối cảnh ở Xưởng** (đúng dự án của tác phẩm).
- Nhập gói lưu đè: báo rõ các mục trùng sẽ chuyển sang dự án nào.

## v0.11.0 — Thành phẩm: xuất phim, storyboard, gói dự án, dự án mẫu
- **Xuất phim HTML độc lập** (Tạo tác › Tác phẩm › Xuất): một tệp .html chứa bộ phát + nhân vật + bối cảnh + lời thoại; mở bằng trình duyệt bất kỳ, không cần cài, không cần mạng — thẻ tiêu đề từng phân cảnh, bóng thoại có tên người nói, danh sách phân cảnh, toàn màn hình, phím cách. Chỉ nhúng trường cần để dựng hình; bộ phát mang giấy phép *chỉ để xem phim đó*.
- **Storyboard SVG / PNG**: ảnh từng phân cảnh + mô tả + lời thoại; an toàn với emoji / ký tự điều khiển. Cùng **JSON** của tác phẩm.
- **Trình diễn dùng chung** `engine/player.js` (`GC.film`): một định nghĩa "sẵn sàng" cho bảng tình trạng, sân khấu Studio và phim xuất ra; ngân sách ≤ 8 diễn viên sống, hết cảnh là huỷ.
- **Bảng tình trạng tác phẩm**: "Sẵn sàng x/y phân cảnh" + cảnh nào thiếu gì (bối cảnh, diễn viên, lời thoại, quá chỗ đứng) — bấm để tới đúng phân cảnh.
- **Gói dự án** `gen-chibi.project/1`: xuất (nhân vật, vật phẩm, bối cảnh, linh kiện tự vẽ, tác phẩm — tự đủ, kéo theo asset dự án khác mà phân cảnh dùng, khai báo `requires`) và **nhập** (mọi mục qua đúng cổng kiểm; trùng id → hỏi lưu đè thành phiên bản mới; gói cần thư viện chưa cài / id trùng trong gói / > 200 phân cảnh bị chặn; không tạo dự án rỗng). MCP thêm `export_project`, `import_project` (31 tool).
- **Dự án mẫu một chạm** "Văn phòng vui": 3 nhân vật, 1 vật phẩm, 2 bối cảnh, phim 4 phân cảnh — người mới xem trọn luồng trong 10 giây.
- **Gom luồng Tạo tác**: Tác phẩm là lối vào duy nhất; *Kịch bản lẻ* agent gửi qua MCP (`save_event`) hiện ngay trong Tác phẩm → **+ Thành phân cảnh**. Trang "Diễn thử một cảnh" cũ đã gỡ; *Trợ lý AI tạo asset* chuyển về Xưởng; nút "+ mới" ở bàn chỉnh đi qua Tạo asset mới (luôn có dự án).
- Thuật ngữ thống nhất: **Vật phẩm**, **Bối cảnh** (asset), **Phân cảnh** (một cảnh của phim).
- **Sửa (review + cortex):** khung không bao giờ bị sửa — lưu vào khung từ Studio thành bản sao trong "Của tôi"; sửa ở bàn chỉnh không còn đẩy asset ra khỏi dự án; nhập gói không còn treo server (một lần đọc đĩa, ghi tác phẩm một lần); `/xuong/`, `/thu-vien/`, `/tao-tac/` chuyển về địa chỉ không có `/`; chế độ tối: chữ trên nút đủ tương phản.
- Tài liệu: **`docs/HUONG-DAN.md`** (hướng dẫn người dùng), README định vị lại + đủ 31 tool, QUY-TRINH-LINH-KIEN mục 8 theo 3 ứng dụng.
- Test mới: dự án mẫu qua cổng 100%, gói hỏng / trùng / thiếu thư viện, khung bất biến, giữ dự án khi sửa; trình duyệt: phim xuất ra mở bằng `file://` (không server) và diễn được, storyboard, dự án mẫu một chạm, kịch bản lẻ → phân cảnh.

## v0.10.0 — Ba ứng dụng độc lập · luồng làm việc liền mạch · Gen Labs
- **Tách 3 lớp thành 3 ứng dụng riêng** (yêu cầu của Ryan): `/xuong`, `/thu-vien`, `/tao-tac` — mỗi ứng dụng một địa chỉ, chỉ có menu của lớp mình (+ Hệ thống), màu riêng phủ toàn giao diện, tự nhớ trang đang mở. Bấm sang việc của lớp khác thì mở đúng ứng dụng đó. Bản xem thử không server dùng `?app=…`.
- **Màn chọn khu** (`/`): 3 thẻ ứng dụng + **Bắt đầu nhanh** 3 bước (tạo dự án → tạo asset từ khung → làm phim), tự đánh dấu bước đã xong và đưa nút cho bước kế tiếp.
- **Luồng không đứt đoạn:** lưu asset xong có *Tạo tiếp* (cùng khung, cùng dự án) · *Xem trong Thư viện* · *Làm phim với dự án này*; trang dự án có *Làm phim với dự án này*; Xưởng và Tạo tác nhớ **dự án dùng gần nhất**; vào Tạo tác từ một dự án thì mở tác phẩm của dự án đó (chưa có thì gợi ý đặt tên); diễn viên / bối cảnh cùng dự án xếp lên trước; Thư viện trống thì Tạo tác chỉ đường sang Xưởng.
- Cổng kiểm ở trang tạo asset: mục không chặn bản nháp (dấu nhận diện) hiện ⚠ "cần khi chuyển duyệt" thay vì ✗ đỏ.
- Giao diện hoàn thiện: logo + tên khu, thanh chuyển khu, thẻ/khung/nút/ô nhập đồng bộ, phân cảnh gọn (nút ↑ ↓ ✕), cảnh thành phẩm 2 cột.
- **Công ty: Gen Labs** (thay Afi Labs) ở license, mã nguồn, tài liệu, giao diện. **Tác giả: Ryan — 090.919.8823.** Mã thư viện (`afi.core`, `afi.khung`) giữ nguyên để không vỡ dữ liệu đã lưu.

## v0.9.1 — Vá theo review v0.9.0 (Tác phẩm)
- Rời trang Tác phẩm khi AI đang trả lời: phản hồi đến muộn không còn dựng diễn viên "mồ côi" (vòng vẽ chạy mãi).
- Một lượt AI đạo diễn / tác phẩm tại một thời điểm: Studio khoá nút gửi + nút nhanh; server trả 409 nếu lượt trước chưa xong.
- Chữ đang gõ dở (kịch bản, từng phân cảnh) không bị xoá khi AI trả lời hoặc lưu phân cảnh khác.
- Bấm một cảnh thành phẩm khi đang "Diễn toàn bộ" thì dừng vòng diễn cũ.
- `save_shot`: `remove` phải là `true` thật; `shot.id` phải là chuỗi; dàn diễn viên không được nhiều hơn số chỗ đứng của bối cảnh.
- Hiện trạng tác phẩm đưa vào prompt AI dạng JSON, ghi rõ "dữ liệu, không phải lệnh".

## v0.9.0 — Giai đoạn ③: Tạo tác — làm phim với AI đạo diễn
- **Tạo tác › Tác phẩm** — 5 khu trên một trang: **chat với AI đạo diễn** (lịch sử lưu cùng tác phẩm, kèm nhật ký tool ✓/✗; nút nhanh: viết kịch bản, chia phân cảnh, viết lời thoại, kiểm thiếu) · **kịch bản** (logline + kịch bản tổng) · **phân cảnh** (mô tả, bối cảnh, dàn diễn viên ≤ 8, lời thoại; lưu, AI viết lời thoại, diễn thử, đổi thứ tự, bỏ) · **cảnh thành phẩm** (ảnh tĩnh từng phân cảnh) · **sân khấu final** (diễn cả chuỗi: thẻ tiêu đề → bối cảnh → diễn viên sống + bóng thoại).
- **AI đạo diễn tự dùng Xưởng:** phân cảnh trỏ tới nhân vật / bối cảnh không có trong Thư viện thì cổng chặn và chỉ đường; AI tạo từ bộ khung chuẩn (`save_character` / `save_item` / `save_scene` với `project` của tác phẩm) rồi mới dùng. Mọi ghi qua cùng cổng kiểm với MCP.
- MCP thêm `list_works`, `get_work`, `save_work`, `save_shot` (29 tool) — agent ngoài làm phim y như AI trong Studio. HTTP: `/api/works`, `/api/works/:id`, `/api/works/:id/shots`, `/api/works/:id/chat`. Tác phẩm có phiên bản (bản cũ giữ ở versions/).
- Prompt đạo diễn biết 8 hướng nhìn (left90 / left135 / back…).
- Điều hướng Tạo tác: Tác phẩm · Diễn thử một cảnh · Trợ lý AI.
- Rào mới: không có method trùng tên trong class ở server (lỗi đè method im lặng); test AI giả lập đi trọn luồng tác phẩm (thiếu nhân vật → tự tạo ở Xưởng → phân cảnh → lời thoại sai thì sửa); test trình duyệt diễn cả chuỗi.

## v0.8.0 — Giai đoạn ②: tạo asset từ khung → Thư viện theo dự án chủ đề
- **Xưởng › Tạo asset mới** — 4 bước trên một trang: ① chọn khung (ma-nơ-canh · 10 khối vật phẩm · 2 sân khấu chuẩn) + dự án; ② tham số & chi tiết (linh kiện từng bộ phận, tham số, bảng màu, mắt / mày, dấu nhận diện, tính cách — vật phẩm: loại, độ hiếm, độ dài / cỡ, màu, chỉ số — bối cảnh: lớp phông, giờ, thời tiết, màu); ③ soát (nhân vật 8 hướng + 4 hoạt động; vật phẩm icon + thẻ + mặc lên ma-nơ-canh 4 góc; bối cảnh như chọn / đêm / có diễn viên); ④ cổng kiểm & lưu. Khung không bị sửa — bản của bạn là bản sao.
- **Dự án chủ đề:** mọi asset của người dùng có trường `project`. Trang **Thư viện › Dự án chủ đề** (tạo dự án, xem asset theo dự án, **tải gói dự án JSON** gồm công thức + linh kiện tự vẽ đang dùng). Thư viện nhân vật / trang bị / cảnh chia mục theo dự án; đổi dự án ngay ở khung "Dùng".
- Điều hướng theo đúng dòng chảy **Xưởng → Thư viện → Tạo tác**: Xưởng gồm Bộ khung chuẩn, Tạo asset mới, các bàn chỉnh, kho linh kiện, khung chuyển động, cổng kiểm; Tạo tác dành cho làm phim / truyện với AI.
- Server: `GET/POST /api/projects` (projects.json). MCP thêm `list_projects`, `save_project` (25 tool); `save_character` / `save_item` / `save_scene` nhận `project` (slug, kiểm chặt).
- Test: MCP dự án (tạo, lưu vào dự án, đếm, chặn id lạ); trình duyệt đi trọn luồng tạo nhân vật / vật phẩm / bối cảnh vào dự án rồi kiểm Thư viện.

## v0.7.0 — 8 hướng nhìn (2.5D)
- **Engine:** thêm góc 90° (nhìn ngang), 135° (quay lưng chéo) và sau lưng — đủ 8 hướng: `front · left45/right45 · left90/right90 · left135/right135 · back` (giữ `left/right` 3/4 nhẹ). Bên phải = lật gương; sau lưng engine tự giấu mặt, đưa vật sau lưng (áo choàng…) lên trước thân, vật cầm tay ra sau thân; 90° chỉ một mắt.
- Linh kiện thiếu góc nào thì **mượn góc gần nhất** (90° → 45°; 135° → sau lưng → 45°; sau lưng → chính diện); cổng kiểm có mục thông tin "Bản vẽ 8 hướng".
- **Khung vẽ đủ 8 hướng:** đầu, thân, chân, bàn chân ma-nơ-canh; khối mũ, áo, áo choàng, giày, che mặt. Test chặn: linh kiện khung thiếu góc nào là trượt; dựng 32 hoạt động × 10 góc không NaN.
- Linh kiện dữ liệu (MCP `save_part`) khai báo được `views.q90 | q135 | q180` = `drawn` | `same` | `front` | `hide`.
- Studio: chọn được 10 góc ở Thư viện, Tư thế & hoạt động, Bộ khung chuẩn; bàn soát linh kiện 5 góc; nút **Sprite 8 hướng** (một hàng PNG, vòng theo chiều kim đồng hồ). MCP `render_character` / `render_item` nhận 10 góc.

## v0.6.0 — Xưởng: bộ khung chuẩn không chủ đề
- **Bộ khung chuẩn** cho mọi asset (kiểu greybox của làm game), thay cho nội dung Tam Quốc:
  - **Nhân vật:** ma-nơ-canh đầu trọc, không quần áo — đủ 18 biểu cảm × 32 hoạt động × 5 góc nhìn; mọi nhân vật mới bắt đầu từ ma-nơ-canh.
  - **Vật phẩm:** 10 khối đại diện theo dáng (que dài, que ngắn, đĩa dẹt, hộp, cầu, đội đầu, khoác thân, sau lưng, giày, che mặt), có tham số, mỗi khối kèm một vật phẩm khung.
  - **Bối cảnh:** khối trời / tường, chân trời, khối nhà, nền có lưới tỉ lệ (vạch hàng trước / hàng sau), tiền cảnh, khối hộp / trụ / cây / đá / bàn / cờ; 2 sân khấu chuẩn (ngoài trời, trong nhà).
  - **Đạo cụ của hoạt động** (ghế, nệm, chiếu, chăn, bàn, nước, bát, đũa, chén, sách, bút) chuyển thành khối xám, giữ đúng vị trí theo tư thế.
  - Bảng màu mặc định xám trung tính; asset chủ đề đổi token để "thay áo".
- **Quy cách thống nhất** `docs/QUY-CACH-KHUNG.md` (kích thước, điểm gắn, lớp, góc nhìn, tham số, màu, quy trình tạo asset từ khung). Đặc tả 3 giai đoạn v3 theo lời Ryan.
- `afi.core` thành **khung lõi** (khuôn mặt, biểu cảm, chuyển động, hoạt động, thân ma-nơ-canh); khối vật phẩm / bối cảnh ở `kinds/khung/afi.khung.js`.
- **Tam Quốc đã cất** ở `archive/tamquoc/` (không nạp vào bản chạy, không nằm trong gói phát hành); sau này dựng lại như một dự án chủ đề từ khung.
- Studio: trang **Xưởng › Bộ khung chuẩn** (quy cách + ma-nơ-canh mọi góc và hoạt động + khối vật phẩm + khối bối cảnh). Thư viện không bày đồ của khung; bản cài mới có thư viện trống kèm lời dẫn.
- MCP / Trợ lý AI / Đạo diễn mặc định dùng ma-nơ-canh; toàn bộ test chuyển sang khung.

## v0.5.3 — Studio ba lớp: Thư viện · Tạo tác · Xưởng
- **Thư viện** (xanh dương): hàng mẫu Afi đã duyệt — xem, tải ảnh, chép mã.
- **Tạo tác** (xanh lá, mới): nhân vật / trang bị / cảnh của tôi, Đạo diễn AI, Trợ lý AI (chat) — nơi người dùng phối và xuất thành phẩm.
- **Xưởng** (hổ phách): chỉ còn khuôn của Afi — kho linh kiện & phông, khung tư thế & hoạt động, khung biểu cảm & động tác, cổng kiểm.
- Dòng chảy Xưởng → Thư viện → Tạo tác; `docs/QUY-TRINH-LINH-KIEN.md` mục 8 viết lại theo ba lớp.

## v0.5.2 — Hỗ trợ repo private: token cập nhật
- **`GC_GITHUB_TOKEN`** (fine-grained, chỉ Contents: Read-only): bộ cập nhật gọi API GitHub có `Authorization: Bearer`, tải gói và SHA256SUMS qua URL API của asset (`Accept: application/octet-stream`). Token **chỉ gửi tới đúng host đầu tiên** — khi GitHub chuyển hướng sang host lưu trữ, token bị bỏ. Không token thì hành vi cũ giữ nguyên.
- Repo private mà thiếu / sai token → báo lỗi rõ (nêu cách sửa), vẫn chạy bản cũ; không đoán qua trang công khai.
- `install.sh` nhận `GC_GITHUB_TOKEN`: đọc release qua API, chọn asset theo tên, tải qua URL API; token đi bằng tệp cấu hình curl (không nằm trên dòng lệnh), ghi vào `.env` (thêm dòng nếu thiếu, giữ nguyên dòng khác). Không token mà repo private → hướng dẫn tạo token.
- Lệnh mới `genchibi token [giá-trị|--clear]`: nhập ẩn (hoặc stdin) để token không vào lịch sử shell, ghi `.env`, khởi động lại. `docker-compose.yml` truyền `GC_GITHUB_TOKEN` vào container.
- Rào mới `tools/test-token.js` (GitHub giả: 404 khi thiếu token, asset redirect sang host khác — host đích mà nhận Authorization là trượt; token sai; installer; `genchibi token`; token không lọt vào trạng thái/lịch sử/output).
- README: mục "Repo private: token cập nhật".

## v0.5.1 — Vá theo review v0.5.0 (cảnh)
- Review: không có blocker; không chèn được script/markup vào SVG cảnh, không prototype pollution, không ghi đè thư viện chính thức, không path traversal.
- **Phông "Trời quang" thiếu tham số màu ở hai đám mây** → 6 cảnh mất mây và SVG chứa `NaN`/`undefined`. Đã sửa; **rào mới**: test quét mọi cảnh × giờ × thời tiết và mọi phông × giờ, cấm `NaN`, `undefined`, `null`, `[object`, `Infinity`.
- **Mã nhúng web**: JSON trong `<script>` được escape (`<` `>` `&` U+2028/2029) — tên do agent đặt chứa `</script>` không thoát ra trang của người dùng. Test hồi quy trên trình duyệt.
- Đạo diễn: `spot` chỉ dùng khi có `scene`, phải là chỗ đứng cảnh mở, hai diễn viên không đứng cùng chỗ; Studio báo khi diễn viên nhiều hơn chỗ đứng.
- Sân khấu đạo diễn dựng hai lớp (nền sau diễn viên · lớp trước: đạo cụ trước, tiền cảnh, thời tiết, màu giờ) — hết nhuộm màu giờ hai lần, đúng thứ tự như ảnh tĩnh.
- `render_scene` giờ / thời tiết lạ → lỗi rõ ràng; lỗi cảnh tối đa 20 dòng, giá trị lặp lại bị cắt (không khuếch đại dữ liệu); mô tả cảnh không tạo dòng giả trong prompt đạo diễn; id gradient trời theo giờ (bàn soát ngày/đêm không lẫn); tra chỗ đứng qua `own()`.

## v0.5.0 — Loại asset thứ ba: cảnh · Studio tách Thư viện / Xưởng
- **Cảnh** = phối phông có sẵn theo 6 lớp (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ (ngày / bình minh / hoàng hôn / đêm) + thời tiết (mưa, tuyết, hoa rơi, lá bay, sương, đom đóm). Phông chỉ dùng token màu cảnh nên đổi giờ không phải vẽ lại.
- Thư viện chính thức `afi.scenes`: 27 phông → 8 cảnh (Thảo lư Long Trung, Doanh trại lúc chiều, Dưới chân thành, Bờ sông Xích Bích, Thư phòng, Rừng trúc đêm, Vườn đào, Núi tuyết). Rào test: mọi phông chính thức phải được ít nhất một cảnh dùng.
- **Chỗ đứng chuẩn của engine** (8 chỗ, hai hàng): mọi dàn diễn viên đặt được vào mọi cảnh, dựng bằng đúng khung nhân vật (45°, 32 hoạt động, trang bị). Từ hai diễn viên, ai chưa chọn góc tự quay 45° về giữa. Ngân sách: diễn viên ≤ 8, đạo cụ ≤ 10, hạt thời tiết ≤ 60; mưa/tuyết có hạt giống → ảnh ổn định.
- **Một cổng ghi**: `saveSceneChecked` cho MCP (4 tool mới — 23 tool), `POST /api/scenes` và AI trong chatroom. Phông mới đi qua chính `get_part_spec` → `preview_part` (bàn soát ngày/đêm kèm diễn viên) → `save_part`, cùng bộ lọc SVG an toàn với token màu cảnh. Không ghi đè cảnh chính thức.
- **Đạo diễn AI diễn trong cảnh**: kịch bản có `"scene"`, mỗi bước có `"spot"`; Studio đặt diễn viên đúng chỗ, phủ màu giờ.
- **Studio tách hai khu**: **Thư viện** (xanh) — thành phẩm duyệt theo nhóm (Chính thức / Của tôi… rồi phe / loại / ngoài trời–trong nhà), xem biến thể và **lấy về dùng**: ảnh (SVG, PNG, avatar, sprite 18 biểu cảm, icon/thẻ item, cảnh 1280/1920, nền trống) và mã (mã tham chiếu, lệnh MCP, mã nhúng web, SVG, JSON công thức). **Xưởng** (hổ phách) — bàn phối nhân vật / trang bị / cảnh, kho linh kiện & phông (bàn soát phông), khung tư thế & biểu cảm, Xưởng AI, Đạo diễn AI, cổng kiểm. Trang "Xuất bản" cũ gộp vào khu Dùng của Thư viện.
- `docs/QUY-TRINH-LINH-KIEN.md`: mục 7 có hai ví dụ (item, cảnh) + chuẩn phông; mục 8 mới: Thư viện và Xưởng.

## v0.4.1 — Vá độ bền cho item (review v0.4.0)
- Review bảo mật v0.4.0: **không có lỗ hổng** (escape chữ, hex, prototype, path traversal, ghi đè chính thức đều đứng vững). Vá 4 điểm độ bền:
- Item bị lưu lại sang bộ phận khác không còn làm vỡ nhân vật đang mặc nó (engine bỏ qua item lệch bộ phận); cổng ghi chặn đổi bộ phận của item đã lưu — muốn đổi thì tạo id mới.
- `equip.part` không phải chuỗi → báo lỗi rõ ràng thay vì lỗi nội bộ.
- Lọc ký tự điều khiển trong tên / Hán tự / mô tả / truyền thuyết (trước đây làm thẻ SVG hỏng).
- `render_item` chế độ `equipped` mặc thử được **item nháp chưa lưu** (đăng ký tạm, xoá ngay sau khi dựng).
- Test hồi quy cho cả 4 điểm.

## v0.4.0 — Loại asset thứ hai: item trang bị
- **Item trang bị** = phối: trỏ tới linh kiện có sẵn + bảng màu riêng (chỉ áp lên linh kiện đó) + tham số + độ hiếm + chỉ số. Một linh kiện cho nhiều phẩm cấp (Đao sắt thường ↔ Thanh Long Yển Nguyệt Đao huyền thoại) — không vẽ thêm.
- Từ vựng đóng: 8 loại (vũ khí, tay phụ, pháp khí, mũ/khăn, giáp/áo, áo choàng, giày, mặt nạ) → bộ phận mặc; 5 độ hiếm; 6 chỉ số.
- **Tự đứng được**: icon theo độ hiếm và thẻ item (tên, Hán tự, loại, độ hiếm, chỉ số, mô tả). Khung icon là thuộc tính của linh kiện (`part.icon`) — vẽ một lần, mọi item dùng chung.
- **Mặc được**: nhân vật có `look.equip.<slot>`; mọi thứ của khung tự áp dụng (45°, 32 hoạt động, bàn soát, trait theo linh kiện).
- Thư viện chính thức `afi.items`: 13 item (Thanh Long đao, Xà mâu, Đao sắt, Thương gỗ, Kiếm sắt, Quạt lông vũ, Bầu rượu, Khăn cuốn, Khăn chiến đỏ, Giáp đồng, Giáp bạc Thường Sơn, Áo choàng đỏ, Ủng da).
- **Một cổng ghi**: `saveItemChecked` cho MCP (4 tool mới: `list_items`, `validate_item`, `save_item`, `render_item` — 19 tool), HTTP `POST /api/items` và AI trong chatroom. Item chính thức không bị ghi đè — sửa sẽ tạo bản trong "Của tôi".
- Studio › **Trang bị**: lưới icon theo loại, thẻ, mặc thử lên mọi nhân vật (chính diện / 45° / tấn công / chạy), sửa độ hiếm, linh kiện, bảng màu, chỉ số.
- Linh kiện dữ liệu (agent tạo) khai báo được khung icon.
- `docs/QUY-TRINH-LINH-KIEN.md` mục 7: **quy trình thêm một loại asset** (8 phần), item là ví dụ mẫu.

## v0.3.1 — Vá bảo mật cho tạo linh kiện (review v0.3.0)
- **ReDoS** (cao): regex kiểm `transform` có thể bị chuỗi ~1 300 ký tự làm treo server (mọi lối ghi, kể cả link MCP). Viết lại không chồng lấn; gộp khoảng trắng trước khi tách thẻ để bộ lọc chạy tuyến tính.
- **MCP / AI trong chatroom không còn ghi đè được nhân vật của thư viện chính thức** (trước đây truyền `pack: "afi.tamquoc"` là đè được). Chỉ Studio của chủ máy được lưu bản chỉnh trong thư viện chính thức.
- Bảng tra của bộ lọc không còn dính prototype (`constructor`…); chặn thuộc tính lặp; token màu chỉ nhận hex; lỗi trong tool không làm hỏng cả lượt AI.
- Linh kiện của người dùng không được trùng id với linh kiện chính thức cùng bộ phận.
- Test hồi quy cho cả 5 điểm.

## v0.3.0 — Tạo linh kiện qua MCP + một cổng ghi duy nhất cho mọi agent
- **Linh kiện dạng dữ liệu**: agent/người dùng tạo linh kiện bằng SVG thuộc tập con an toàn (path, circle, ellipse, rect, line, polyline, polygon, g), màu là hex hoặc token bảng màu `{robe}`. Engine đọc rồi dựng lại SVG — chặn script, on*, url(), style, href, image, text, comment, entity (16 kiểu tấn công trong test). Bắt buộc khai báo 45°: `drawn` | `same` | `face45` | `body45`.
- **3 tool MCP mới** (15 tool): `get_part_spec` (khung sườn dạng máy đọc + ví dụ), `preview_part` (bàn soát: ma-nơ-canh × 4 góc × 4 tình huống, một ảnh SVG), `save_part` (lưu vào "Của tôi", có phiên bản). Nhân vật dùng ngay qua `look.parts.<slot> = "local.my/<id>"`.
- **Một cổng ghi duy nhất**: MCP, API HTTP của Studio (`PUT /api/assets`, `POST /api/parts`) và AI trong chatroom cùng đi qua `saveAssetChecked` / `savePartChecked`. Trước đây `PUT /api/assets` lưu thẳng không qua cổng kiểm — đã đóng.
- **Luật chặn chung** `GC.blockingGates`: lỗi cấu trúc/an toàn chặn mọi trạng thái; dấu nhận diện bắt buộc khi chờ duyệt / đã duyệt.
- **Xưởng AI (chat)** trong Studio: AI chạy bằng LLM API của người dùng nhưng chỉ làm việc qua đúng bộ tool MCP (trừ cập nhật/rollback app), cùng chỉ dẫn; hiện từng lượt gọi tool và ảnh bàn soát/dựng hình.
- Cổng nhận diện so theo mã linh kiện (khớp cả `ci-hat` lẫn `local.my/ci-hat`).
- Test mới: bộ lọc SVG (tấn công), luồng MCP tạo linh kiện → phối → dựng 45°, `tools/test-agent.mjs` (AI chatroom với LLM giả lập đi đúng cổng).

## v0.2.3 — Phủ đủ 45° + quy trình tạo lập linh kiện
- **Toàn bộ 24 linh kiện chính thức có bản 45° vẽ thật** (thêm: tóc búi, tóc dựng, râu ba chòm, râu hổ, râu dài mảnh, khăn buộc trán, mũ vải mềm, mũ quan, áo bào, giáp trận, áo choàng, 3 mặt nạ kinh kịch) → cả 5 nhân vật tự đủ 45° mà không sửa nhân vật nào.
- **Công cụ chiếu 45° dùng chung** `GC.helpers.face45` (chi tiết bám mặt, cùng phép chiếu với mắt/miệng của engine) và `body45` (chi tiết trên thân, dồn về đường giữa áo mới).
- **Quy trình tạo lập linh kiện** thành chuẩn: `docs/QUY-TRINH-LINH-KIEN.md` (khung sườn, góc nhìn, công cụ, 6 bước tạo).
- **Bàn soát linh kiện** (Studio › Thư viện linh kiện › bấm một linh kiện): mặc lên ma-nơ-canh chuẩn × 4 góc nhìn × đứng/kinh ngạc/chạy/ngồi + bảng kiểm (45°, tham số, license, nguồn). Thư viện xem trước bằng ma-nơ-canh, không dựa vào nhân vật cụ thể.
- **Rào tự động**: test chặn phát hành khi linh kiện chính thức thiếu bản 45°, license hoặc nguồn.

## v0.2.2 — Góc nghiêng 45° vẽ thật (ở mức linh kiện)
- **Trục góc nhìn trong hệ linh kiện**: linh kiện có thể kèm bản vẽ `views.q45`; nhân vật phối linh kiện nào cũng tự có 45° (`view: left45 | right45`). Bản chuẩn quay mặt sang trái màn hình, 45° phải = lật gương.
- Linh kiện chưa có bản 45°: engine tự trượt parallax (φ = 32°) để vẫn dùng được. Cổng kiểm **"Bản vẽ nghiêng 45°: x/y linh kiện"** cho biết còn thiếu linh kiện nào; Thư viện linh kiện gắn nhãn "45°".
- Vị trí mặt 45° (mắt gần/xa, mày, miệng) thuộc engine → mọi kiểu mắt/mày/miệng đều hưởng. Hiệu ứng bám mặt (nước mắt, má hồng, mặt tái, bong bóng) tự ánh xạ theo mắt gần/xa. Tay đưa lên mặt (che miệng, vuốt râu, uống) tự đi theo miệng.
- Bản vẽ 45° đã có: dáng đầu tròn / hàm vuông / trái xoan (tai phía gáy nằm trên đầu), mái gọn, tóc dài sau lưng, râu dê, quần ống gọn, ủng, khăn cuốn, áo hạc sưởng → **Gia Cát Lượng đủ bộ 45° vẽ thật**.
- Studio: chọn góc 45° trái/phải; sân khấu báo linh kiện nào đang dùng bản trượt. MCP: `get_catalog` liệt kê `views` của từng linh kiện, `render_character` nhận `left45/right45`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 5 góc nhìn; khẳng định bộ Gia Cát Lượng phủ đủ 45°.

## v0.2.1 — Góc nghiêng 3/4
- **Góc nhìn 3/4** (`view: front | left | right`, theo màn hình) cho mọi nhân vật, không vẽ lại linh kiện: quay kiểu parallax trên mặt cầu (x = R·sin(θ − φ)) — mắt xa hẹp lại, mắt gần rộng ra, miệng/râu/mái trượt theo, tóc sau và tai trượt ngược, thân quay ít hơn đầu, phía sau đầu lộ tóc (lưỡi liềm tóc tới ngang tai), tay phía xa lùi ra sau thân khi đang buông.
- Đang di chuyển mà chưa chọn góc: tự nghiêng 3/4 về hướng đi.
- Studio › Tư thế & hoạt động: chọn góc nhìn (Tự động · Chính diện · 3/4 trái · 3/4 phải); Đạo diễn AI và MCP `render_character` nhận `view`.
- Test: 32 hoạt động × mọi nhân vật × 3 thời điểm × 2 hướng × 3 góc nhìn.

## v0.2.0 — Tư thế & hoạt động (engine 0.3)
- **Khung xương có chân**: hông, đùi, gối, cổ chân; vạt áo tách khỏi thân trên và co giãn theo tư thế. Thêm khớp sân khấu cho đạo cụ đứng yên.
- **Ghép 4 trục** như animation layer của game engine: tư thế nền × di chuyển × động tác tay × biểu cảm, cộng đạo cụ và hướng (quay trái/phải).
  - 12 tư thế: đứng, đứng tấn, ngồi ghế, ngồi xếp bằng, quỳ, ngồi xổm, co rúm, nằm, bò, trên không, bay, bơi.
  - 10 di chuyển: đi, chạy, rón rén, nhảy, bò, bơi, bay lượn, lơ lửng, run rẩy, nhún nhảy.
  - 15 động tác mới: ăn, uống, đọc, viết, chém, đâm, đỡ, ôm đầu, vẫy, chỉ, cúi chào, ôm quyền, cổ vũ, vung tay, thả lỏng.
  - 11 đạo cụ (ghế, nệm, chiếu + gối, chăn, bàn, mặt nước, bát, đũa, chén, sách, bút lông) và 5 hiệu ứng (bụi chân, vệt tốc độ, gió, bọt nước, run).
  - **32 hoạt động đặt sẵn** theo nhóm Tư thế · Di chuyển · Sinh hoạt · Chiến đấu · Cảm xúc · Giao tiếp — agent gọi theo tên (`eat`, `sleep`, `attack`, `flee`…).
- Bóng đổ co lại khi nhảy/bay, giãn khi nằm; chữ hiệu ứng (Zzz, !!) luôn đứng thẳng và đọc xuôi kể cả khi nằm hoặc quay trái.
- Studio: trang **Tư thế & hoạt động** — lưới hoạt động theo nhóm, sân khấu ghép tự do từng trục, tải SVG khung hình.
- Đạo diễn AI và MCP: mỗi cảnh nhận `activity`, `posture`, `move`, `facing`; `get_catalog` liệt kê hoạt động/tư thế/di chuyển/đạo cụ; `render_character` dựng theo hoạt động và theo thời điểm `t` trong chu kỳ.
- Cổng kiểm "Dựng đủ hoạt động" (chạy ở hồ sơ asset, khi lưu qua MCP, trong test — không chạy ở danh sách để giữ nhanh với hàng trăm nhân vật).

## v0.1.9
- Bảo mật `genchibi expose`: chỉ nhận `cert.pem` trình duyệt tải về **sau** khi lần đăng nhập bắt đầu (đúng tên, tệp thường) và hỏi xác nhận trước khi dùng — không còn tự lấy tệp có sẵn trong thư mục Tải xuống (tránh tệp bị cài sẵn đưa tunnel sang tài khoản Cloudflare khác).

## v0.1.8
- `genchibi expose`: bước đăng nhập Cloudflare chịu lỗi — tự thử lại 3 lần khi hết 1 phút chờ bấm Authorize, tự nhận `cert.pem` trình duyệt đã tải về (thư mục Tải xuống, 2 giờ gần đây), dùng lại chứng chỉ có sẵn; chỉ in link cần mở, không in đường dẫn bên trong container.

## v0.1.7
- Sửa: cài đặt và tự cập nhật lỗi 403 khi GitHub API hết lượt gọi của IP (giới hạn 60 lượt/giờ, mạng dùng chung IP hay gặp). Giờ tự chuyển sang đọc bản mới nhất từ trang `github.com/.../releases/latest` và tải gói trực tiếp; vẫn kiểm SHA-256 như cũ.

## v0.1.6
- **`genchibi expose <tên-miền>`**: một lệnh mở MCP ra Internet qua Cloudflare Tunnel — tạo tunnel, trỏ DNS (không ghi đè bản ghi có sẵn trừ khi thêm `--overwrite-dns`), chỉ cho đường `/mcp` đi qua, sinh khoá, khởi động lại, thử gọi qua Internet và in link. Thêm `--quick` (link tạm trycloudflare), `--rotate`, `--off`; `genchibi link [--check]`. Docker: tunnel là container `gen-chibi-tunnel` tự bật lại cùng app.
- **Link MCP có khoá** `/mcp/<GC_MCP_KEY>`: agent dán link là nối được, không cần header (Claude web/desktop Connectors, Cursor…). Link chỉ cấp quyền MCP; sai khoá trả 404. Qua link chỉ được kiểm và cập nhật bình thường; `rollback_app` và `force` cần token chủ máy hoặc stdio (chống xoá vòng backup bằng rollback lặp).
- **MCP tự cập nhật**: tool `get_app_version`, `update_app`, `rollback_app` — agent tự kiểm và cập nhật từ GitHub Releases (SHA-256, sao lưu, tự rollback khi bản mới lỗi). MCP có 12 tool.
- Studio › Cài đặt AI: hiện link MCP, nút sao chép link và lệnh Claude Code.
- CLI `genchibi` đi theo bản cài: lệnh mới đến cùng bản cập nhật (cài lại một lần từ v0.1.5 trở về trước). `genchibi start` đồng bộ `docker-compose.yml` theo bản đang chạy.
- `GC_ALLOWED_HOSTS` nhận tên con dạng `*.trycloudflare.com`.
- Bảo mật tunnel: chứng chỉ tài khoản Cloudflare (`cert.pem`) chỉ dùng lúc thiết lập rồi xoá — container tunnel chỉ giữ khoá của riêng tunnel; tên miền được kiểm chặt trước khi ghi `.env`; link không lộ trong danh sách tiến trình khi kiểm.
- Test: `tools/test-auth.sh` 16 ca (link, wildcard host); `tools/test-update.sh` thêm bước agent cập nhật qua MCP (16 ca).

## v0.1.5
- Bảo mật (sửa v0.1.4): khi có `GC_API_TOKEN`, **mọi** `/api` (trừ `/api/health`) và `/mcp` đều cần token — không còn miễn cho Host `localhost`, vì tunnel có thể đổi Host thành localhost và chạy trên chính máy này. So token bằng thời gian hằng.
- Bảo mật: chưa có token mà request đi qua tunnel/reverse proxy (`X-Forwarded-For`, `Forwarded`, `Cf-Connecting-Ip`, `X-Real-Ip`) thì từ chối toàn bộ — app không bao giờ lộ ra Internet khi chưa khoá.
- Studio: màn đăng nhập bằng token cho bản cài có khoá (giữ trong trình duyệt), báo token sai.
- README: hướng dẫn mở MCP qua tunnel/tên miền riêng.

## v0.1.4
- Sửa lỗi: mắt của mọi nhân vật đứng yên khi đầu nghiêng/nhún. Nguyên nhân: animation chớp mắt (CSS `transform`) đặt trên chính nhóm lớp `eyes` nên đè mất transform của khung xương. Giờ chớp mắt chạy trên nhóm con `.gc-eyes`.
- Mở MCP qua tunnel/tên miền riêng: khi đã đặt `GC_API_TOKEN`, `/mcp` luôn cần token; `/api` chỉ cần token khi truy cập qua tên miền ngoài. Studio mở bằng `localhost` vẫn dùng như cũ.
- Test: luật cấu trúc chặn CSS animation/transform trên nhóm lớp `[data-l]`; `tools/test-browser.mjs` kiểm mọi lớp gắn vào đầu đi cùng đầu (Chromium).

## v0.1.3
- Studio: dải báo "Có bản mới" trên mọi trang, bấm để xem ghi chú và cập nhật.
- `genchibi start` gọn hơn với Docker.

## v0.1.2
- Mạng có proxy: tự cập nhật và gọi LLM đi qua `HTTPS_PROXY` (tôn trọng `NO_PROXY`, hỗ trợ proxy có mật khẩu và chứng chỉ CA bổ sung). Trước đây Node bỏ qua proxy nên máy sau proxy công ty không cập nhật được.
- `install.sh` ghi cấu hình proxy và CA của máy vào `.env`.

## v0.1.1
- MCP: `get_character` và `render_character` nhận cả id ngắn (vd. `trieu-van`), không bắt buộc key đầy đủ.
- Bảo mật: không có token thì server chỉ phục vụ kết nối từ chính máy này (kiểm địa chỉ thật, không tin header Host); CLI từ chối chạy khi mở ra mạng mà thiếu `GC_API_TOKEN`.
- Phát hành tự động khi `VERSION` trên `main` thay đổi.

## v0.1.0
Bản MVP đầu tiên.
- Engine 0.2: khung xương có khuỷu tay, thư viện theo nhóm (pack), kế thừa 4 tầng (kho → trait → nhân vật → đạo diễn), tham số linh kiện.
- Thư viện chính thức `afi.core` (18 biểu cảm, 28 động tác, 21 hiệu ứng) và `afi.tamquoc` (5 tướng).
- Tầng vẽ có ngân sách: ảnh cache cho danh sách, thở bằng CSS cho avatar, diễn đủ tối đa 8 nhân vật.
- Studio: quản lý nhân vật, chỉnh linh kiện + tham số + màu, ghi đè biểu cảm, phiên bản, xuất SVG/PNG/sprite sheet.
- Đạo diễn AI qua LLM API (OpenRouter, DeepSeek, MiniMax, tuỳ chỉnh), có kiểm tra model.
- MCP server (HTTP + stdio) cho agent.
- Cài một lệnh, tự cập nhật từ GitHub Releases, sao lưu trước khi cập nhật, tự rollback.
