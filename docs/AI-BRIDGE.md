# CLI bridge — the Studio's AI through agent CLIs on your machine (v0.26)

The AI assistant dock and the AI director can run on an **agent CLI that is already logged in on the server** — Antigravity CLI (`agy`) or Claude Code (`claude`) — instead of an LLM API key. The CLI runs **on the host, never in the app container**, inside a bubblewrap sandbox, and only gets gen-chibi's own tools (MCP) for the area you are in.

© 2026 Gen Labs — All rights reserved.

## Set it up (on the server, as the user who owns the CLI logins — no sudo)

```bash
genchibi ai bridge install        # copies the verified bridge files, pairs with the app, starts a systemd --user service
genchibi ai bridge login agy      # paste a SEPARATE Google AI Studio API key (default; hidden prompt, stored 0600, never on a command line)
genchibi ai bridge enable agy     # sandbox self-test + lock canary with a fake local API (no quota) → "Lock: verified"
```

Then in the Studio: **AI settings › AI route › Agent CLI on this machine**, pick the CLI (and a model the bridge scanned). Claude Code works the same way: `login claude`, `enable claude`.

Other commands: `genchibi ai bridge status | start | stop | logs | run (foreground) | probe [cli] | disable <cli> | config --turn-sec N --per-hour N --tool-calls N --writes N | uninstall`.

Requirements: Linux with **bubblewrap** and user namespaces (Fedora has both), Node.js ≥ 18 on the host. macOS: not yet (no sandbox → the bridge refuses).

## What a compromised app container can and cannot do

The app container is treated as possibly compromised. Through the bridge it can only queue turns (inside the host limits), send prompts, and answer MCP calls. It **cannot** run commands, read files or agent context (CLAUDE.md, AGENTS.md, memory, credentials) or open network connections on the host, because:

1. **The command is built from constants + the host registry.** A job is signed data (HMAC from pairing) with a fixed set of fields; anything else — an MCP URL, an stdio server, extra flags — is refused. The CLI must be enabled on the host *and* verified.
2. **Own HOME per CLI** (`~/.local/share/gen-chibi/bridge/<cli>-home`), turn folders in `$XDG_RUNTIME_DIR/gen-chibi-bridge/` (outside HOME). A context canary plants a nonce in CLAUDE.md / AGENTS.md / GEMINI.md / memory and checks that it never reaches the model request or MCP arguments.
3. **bubblewrap on every CLI**: `--unshare-all --clearenv --cap-drop ALL`, private `/home` and `/run` tmpfs, read-only `/usr` and root, no D-Bus / display (no browser), network only through the bridge's allowlist proxy. A self-test proves each of these at enable time and at every bridge start.
4. **The CLI blocks its own tools, with system evidence**: the fake local API asks for shell / read / write / web tools and the CLI must refuse them itself (a model saying "no" does not count). Claude Code's `init` event is checked every turn (only `mcp__genchibi__*` tools, only the genchibi server, no foreign plugins / skills / hooks). agy is watched live: any non-genchibi tool event, any blocked connection, any stray file in the turn folder → the turn is stopped and the CLI is marked **failed** until you enable it again.
5. **MCP over HTTP only, through the proxy**, with a per-turn token (`gcj_`) that the app accepts only from the host, only during the turn, and revokes on cancel. The proxy strips `WWW-Authenticate` and kills the CLI on a 401 / 403. Per-turn limits: 60 tool calls, 30 writes.
6. The bridge refuses to run as root.

Remaining risks, plainly: the CLI's own login file lives inside the sandbox (it needs it); prompt injection reaches the app's own tools in the current area (same as with an API key) and your plan's quota (capped by the host limits); the model provider sees what is sent. Using a personal plan for an automated backend may be restricted by the provider's terms — check them; the bridge is for single-owner self-hosting.

## Limits (host side)

Defaults: 900 s per turn, 100 turns per hour, one turn at a time, queue of 3. Change them on the server with `genchibi ai bridge config`. The Studio can only **lower** them.

## Fallback

"Fallback" in AI settings uses the API key route when the CLI fails **before any write** (bridge off, not logged in, out of quota, lock not verified). After a `save_*` call there is no fallback.

## agy login: API key (default) or OAuth (opt-in)

Measured on a real machine (agy 1.4.5): agy keeps its OAuth token in the desktop keyring (Secret Service over D-Bus). The sandbox **never** gets D-Bus or the keyring — that would expose all of your keyring. So:

- **Default — a separate AI Studio key** (`genchibi ai bridge login agy`): stored in `~/.local/lib/gen-chibi/bridge/agy-gemini.key` (0600). It reaches agy as `GEMINI_API_KEY` through a read-only file inside the sandbox, never on a command line (a sandbox's command line is readable by other processes). Give that key a low quota.
- **OAuth — only if you choose it** (`genchibi ai bridge login agy --oauth`): agy runs *inside the sandbox* (no D-Bus, its own HOME), you open the printed URL in your browser and paste the code; agy then stores the token in `~/.local/share/gen-chibi/bridge/agy-home/.config/antigravity/plugin-secrets.json` (forced to 0600). **Warning: that token has the Google scope `cloud-platform` (full Google Cloud access).** The Studio and `genchibi ai bridge status` show this warning while OAuth is in use.

agy is never started with `--dangerously-skip-permissions`; its `init` event must report a `permission_mode` that is not a bypass mode, and MCP calls must go through `call_mcp_tool` to the `genchibi` server only.

## Status of the agy lock

Measured (gen-relay T-20261025-07): bubblewrap 0.11.0 with user namespaces works; the stream-json schema (`init` / `step_update` / `result` with `denied_actions`) is what the bridge parses; headless agy auto-denies the `command` permission; `AGY_LLM_GATEWAY_URL` exists, so the fake-API canary is possible. Still unmeasured: the exact `--input-format stream-json` message, the `call_mcp_tool` parameter names, whether agy honours `HTTPS_PROXY`, and whether the gateway override speaks the protocol of the fake API. `enable agy` measures these itself; until they pass it reports **Not verified** with the missing evidence, and the Studio says so — use Claude Code or an API key meanwhile.
