# Live stage (Agent Live Stage) — v0.24

© 2026 Gen Labs — All rights reserved.

One chibi character acts out what an AI agent is doing **right now**: every real step (thinking, reading,
searching, editing, running commands / tests, delegating, waiting for you, errors, limits, releasing) drives the
character on a small office stage. Studio › System › **Live stage**.

## How events get in

| Source | How | Auth |
|---|---|---|
| Claude Code | hooks → `tools/live-hook.mjs` → `POST /api/live/event` | per-install **live token** (`data/live-token`, `gcl_…`) — opens only this one endpoint |
| Other agents | MCP tool `live_event { kind, label?, tool? }` | the agent's normal MCP access |
| You / scripts | `POST /api/live/event` with the owner token, or `tools/live-replay.mjs` | owner token or live token |

`GET /api/live/stream` (owner only) is a Server-Sent Events stream; the Studio page reads it with `fetch` so the
login header travels with it. `GET /api/live/info` returns the live token + a ready `settings.json` snippet;
`POST /api/live/token` rotates the token (the old one stops working at once).

Event: `{ kind, label?, tool?, at? }`, JSON ≤ 4 KB, `Content-Type: application/json` + `X-GC-Request: 1`.
Kinds: `session_start prompt think read search edit write run test_run test_pass test_fail delegate_start
delegate_end wait_user error limit release idle stop`. Rate limit per channel: bursts of 60, 10 / s sustained
(`429` + `Retry-After`).

### Privacy: the label rule (engine/live.js `redact`)

The bubble is a short summary — never file contents, commands or secrets. The server cleans every label:

1. control characters → spaces; NFC
2. a label that **looks like a command** (starts with a CLI program, or contains a CLI program + argument anywhere,
   or `|  &&  ;  $(  `  >  <  $VAR`) is dropped entirely
3. per word: emails, URLs, paths (`/`, `\`, `~`, `./`), file names with an extension (`a.js`), command-line flags
   (`-x`, `--y`) are removed
4. per word, secret-looking: key prefixes (`sk-`, `ghp_`, `github_pat_`, `xox?-`, `AKIA`, `AIza`, `eyJ`, `gcl_`…),
   hex ≥ 16, random letters+digits ≥ 20, `token= / secret: / password=`… are removed
5. only letters, digits, spaces and `. , ! ? ' - : … ( )` are kept
6. whitespace collapsed, cut to 48 characters; nothing left → the stage uses its own caption for the kind

The Claude Code adapter does not even send labels (only the kind, the tool name and the sub-agent type), so the
rule is a second fence for other agents. Labels are not written to the server log or to disk.

## Connect Claude Code

On the machine where Claude Code runs:

```bash
genchibi live hook --install-into ~/.claude/settings.json   # merge (backup settings.json.bak-<time>), atomic write
genchibi live hook                                          # print the snippet only (--json: just the JSON)
```

- The hook script is copied to `~/.local/lib/gen-chibi/live-hook.mjs` (0600). Docker installs copy it **only** from
  the SHA-256-verified release package (`$TD/rel/<version>/live-hook.mjs`, kept by the same verification as the
  compose files — v0.23.1 trust rules); native installs copy it from `current/`. Claude Code never runs code from the
  install folder.
- The command uses the absolute path of `node` (apps opened from the Dock do not see the terminal PATH).
- `--install-into` refuses symlinks, folders, files that are not a JSON object, a `hooks` that is not an object and
  any path inside the install folder; it keeps your keys and your own hooks, and running it again replaces the Live
  hooks instead of adding them twice. Without `--install-into` nothing is written.
- The snippet contains no secret: the live token is written to `~/.local/lib/gen-chibi/live-token` (0600) next to the
  hook script, which reads it — it never appears on a command line (`/proc/*/cmdline`). After rotating the token in the
  Studio, run the command again. The live token has its own rate-limit bucket (a rotated token starts fresh).
- Run as root (sudo), `--install-into` only writes into root's own folders; for another user's home it refuses and
  asks you to run it without sudo as that user. The file is opened once with `O_NOFOLLOW`, the backup is written from
  that same read, and the new file is written to a temporary file and renamed. Node errors are shown, not hidden.

The Studio panel shows **only the CLI command** (a constant of the Studio page, not something the server sends): an
app running in a container must never decide a command line that runs on the host.
The live SSE stream re-checks the viewer's access every ping; logging out closes it.

The adapter never blocks the agent: stdin read ≤ 250 ms, POST ≤ 300 ms, always exits 0, prints nothing on stdout
(`GC_LIVE_DEBUG=1` → reasons on stderr). Hook payload shapes were checked against **Claude Code 2.1.310** with a real
`claude -p` session (local fake API, no cost); the recorded payloads are in `tools/fixtures/live/` and replayed by the tests.

| Claude Code hook | Event |
|---|---|
| SessionStart / SessionEnd | `session_start` / `stop` |
| UserPromptSubmit | `prompt` (the prompt is never sent; background-task notifications injected by Claude Code are ignored) |
| PreToolUse Read / Skill · Grep / Glob / WebSearch / WebFetch / ToolSearch · Edit / NotebookEdit · Write | `read` · `search` · `edit` · `write` |
| PreToolUse Bash | `test_run` if the command looks like a test, `release` for git push / gh release / npm publish, else `run` |
| PostToolUse / PostToolUseFailure Bash (test) | `test_pass` / `test_fail` (decided locally; the output is not sent) |
| PostToolUseFailure (other) · interrupted by you | `error` · `wait_user` |
| SubagentStart · SubagentStop | `delegate_start` (+ a fixed group: explore / plan / review / test / general / other — not the real name) · `delegate_end` |
| TodoWrite / plan mode | `think` (the notebook comes out) |
| Stop · Notification (permission / question) · Notification idle | `wait_user` · `wait_user` · `idle` (`limit` when it is about a usage limit) |
| PreCompact | `limit` |

## Task switch (`live_task`)

Golden rule 12 (agent/GUIDE.md §3 — the single list `server/rules.js` turns into the MCP `initialize` instructions,
`start_here`, the Studio chatroom where the tool is available, and the agent skill): when an agent starts a task that
differs from the current one it calls `live_task { task, title? }` first. Tasks: code · debug · test · research · read ·
write · design · plan · review · release · chat · other. The title (≤ 60 characters) passes the label rule and is shown
only in the event table. Also accepted as `POST /api/live/event { kind: "task", task, title }` (live token). Same task
with the same title again → `{ same: true }`, nothing is broadcast; same task with a new title → broadcast with `retitle: true`
(the "Working on" chip updates, no new beat). The current task is remembered per channel (each agent token, the install's
live token, MCP, the owner) and forgotten on `session_start` / `stop`. The beat: put every prop away → take the clapperboard out of the satchel →
clap (the hat badge changes; bubble "New task: Debugging") → put it back → walk empty-handed to the task's corner.
Claude Code hooks cannot know the task type: Claude Code gets the rule through the skill / MCP instructions.

## Invitation: `live_setup` (v0.24.1 — "offer, ask the owner")

When an agent is connected over MCP, gen-chibi *invites* it to put the Live stage on its own machine — it never installs
anything by itself. Golden rule 13 (same single source as rule 12, so it is in `initialize`, `start_here` and the skill):
call `live_setup` and **ask your user before running its command; never run it silently**. `start_here` carries the
invitation (`live`) on connections that can write. Declining changes nothing.

- `live_setup { agent: claude-code | other, os: linux | macos | windows, name? }` is a write tool (`mcp:read` → `FORBIDDEN`).
- It returns a plan: what is installed and where (`~/.local/lib/gen-chibi-live/`: `live-hook.mjs`, `live-token`,
  `live-url`), the settings it changes (`~/.claude/settings.json`, backup kept), **one** command, how to undo, the address
  events go to and what is sent (only step kinds).
- **Pinned source.** The command must download only from exactly `https://github.com/colamacbook-ryan/Gen-Chibi/releases/download/v<version>/`
  (fixed in the code — `GC_REPO` does not change it — and written into golden rule 13, which the agent has from its
  gen-chibi skill installed from the verified release). A compromised app could return the same command shape pointing
  at another repository whose `SHA256SUMS` matches its own tarball, so the agent / user must check the prefix against
  that independent copy: any other URL → refuse and tell the user. `curl` runs with `--proto '=https' --proto-redir '=https'`.
- Owner only: link-key connections and the Studio AI dock get `FORBIDDEN`. At most 5 calls a minute per connection, and
  at most 50 active agent tokens (then `CONFLICT`: revoke one in Studio › Live stage — nothing is evicted).
- The command downloads the release tarball of **this exact version** from the official GitHub release, checks it against
  that release's `SHA256SUMS` and only then extracts `tools/live-hook.mjs` — the app never serves code to the agent's
  machine (no `curl | sh`). Only two things come from the app, both format-checked: the token (`gcl_` + 43 chars) and the
  address (a plain `https://` origin, or `http://127.0.0.1:<port>`). The token is written by the shell's `printf` builtin
  into a 0600 file (`chmod 600` again afterwards, in case the file already existed) — it is never an argument of any process; the installed hook commands contain no token.
- Address: the owner's public URL when gen-chibi is online. Otherwise only `http://127.0.0.1` works, so a connection that
  does not come from the same machine gets `[UNAVAILABLE]` with the requirement ("put gen-chibi online or run the agent on
  this machine") and **no token is issued**. Windows → run Claude Code in WSL. `agent: other` → nothing to install, call
  `live_task` / `live_event`.
- Each call issues a **separate agent token** (only its SHA-256 is stored, in `data/live-agents.json`, 0600), with its own
  rate bucket. Studio › System › Live stage lists them (name, created, last event) with **Revoke**; a revoked token gets
  401 immediately.
- Undo: `node ~/.local/lib/gen-chibi-live/live-hook.mjs --uninstall-claude ~/.claude/settings.json` then remove the folder.

## Bubbles: plain words only

The bubble text always comes from a fixed phrase table chosen by (kind, tool group, helper group, escalation
level) and translated to the UI language — e.g. "Digging through the code", "Looking it up online", "Sending a helper
to scout", "FIRE! Where's the extinguisher!". It never shows tool names, helper type names, labels sent by agents
or any content. Agent labels (cleaned by the rule above) appear only in the event table. A counter `×N` shows how
many events one action stands for.

## The director (engine/live.js, DOM-free, deterministic)

Each event becomes a plan: put away what is in hand → walk to the zone → (rummage the satchel → take out the prop)
→ perform → react → (put the prop back). Rules: no teleport (a new plan mid-walk continues from where the character
stands); bursts of the same class coalesce (20 reads in 2 s = one long, increasingly frantic search at the shelf);
minimum dwell 1.2 s for every main action; long waits escalate (coffee → watch → yawn → nap on the sofa); repeated
test failures escalate (facepalm → hammer → rubber duck → screen on fire + extinguisher); when the agent is faster
than the stage, quick steps are folded into one action with a counter ("summary acting"): no event is lost, and
errors, test results, releases, waiting for you, prompts, limits and delegation always get their own beat of their
own kind; hands move faster while the queue is long. A gentle deterministic camera follows the character (closer
while it works, wider on long walks and for the rocket launch).

Replay a recorded session: `GC_LIVE_TOKEN=gcl_… node tools/live-replay.mjs [file.jsonl] --speed 2`
(default file `kinds/live/demo-session.jsonl`; `--dry` prints the schedule).
