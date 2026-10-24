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
- The printed snippet contains the live token and nothing else secret (no owner token, no keys). After rotating the
  token in the Studio, run the command again.

The Studio panel shows the same snippet (with `$HOME/.local/lib/gen-chibi/live-hook.mjs`, expanded by the hook's shell).

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
