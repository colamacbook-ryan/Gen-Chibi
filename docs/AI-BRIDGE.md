# CLI bridge — the Studio's AI through agent CLIs on your machine (v0.26)

The AI assistant dock and the AI director can run on an **agent CLI that is already logged in on the server** — Antigravity CLI (`agy`) or Claude Code (`claude`) — instead of an LLM API key. The CLI runs **on the host, never in the app container**, inside a bubblewrap sandbox, and only gets gen-chibi's own tools (MCP) for the area you are in.

© 2026 Gen Labs — All rights reserved.

## Set it up (on the server, as the user who owns the CLI logins — no sudo)

```bash
genchibi ai bridge install        # copies the verified bridge files, pairs with the app, starts a systemd --user service
genchibi ai bridge login agy      # log agy in once with the bridge's OWN home (your usual agy login is not touched)
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

## Status of the agy lock

Whether agy can be verified depends on measurements on a real machine (P0): its stream-json tool events, whether its login survives a separate HOME (file vs. keyring), whether it honours `HTTPS_PROXY` and a fake base URL. Until those pass, `enable agy` reports **Not verified** with the missing evidence, and the Studio says so — use Claude Code or an API key meanwhile.
