# Live stage (Agent Live Stage) — spike

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

Studio › System › Live stage › *Connect Claude Code* shows the snippet with your token. It looks like this
(gen-chibi never edits `~/.claude` itself — paste it into `~/.claude/settings.json` or a project's
`.claude/settings.local.json`):

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "GC_LIVE_URL=http://127.0.0.1:7480 GC_LIVE_TOKEN=gcl_… node /path/to/gen-chibi/tools/live-hook.mjs", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "SubagentStop":     [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "PreCompact":       [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "…same…", "timeout": 2 }] }]
  }
}
```

The adapter never blocks the agent: stdin read ≤ 250 ms, POST ≤ 300 ms, always exits 0, prints nothing on stdout
(`GC_LIVE_DEBUG=1` → reasons on stderr).

| Claude Code hook | Event |
|---|---|
| SessionStart / SessionEnd | `session_start` / `stop` |
| UserPromptSubmit | `prompt` (the prompt text is never sent) |
| PreToolUse Read · Grep / Glob / LS / WebSearch / WebFetch · Edit / MultiEdit · Write | `read` · `search` · `edit` · `write` |
| PreToolUse Bash | `test_run` if the command looks like a test (npm test, pytest, go test, test.sh…), `release` for git push / gh release / npm publish, else `run` |
| PostToolUse Bash (test) | `test_pass` / `test_fail` (decided locally from the result; the result is not sent) |
| PostToolUse with an error | `error` |
| PreToolUse Task / Agent · SubagentStop | `delegate_start` (label = sub-agent type) · `delegate_end` |
| TodoWrite / plan mode | `think` |
| Stop · Notification | `wait_user` (`limit` when the notification is about a usage limit) |
| PreCompact | `limit` |

## The director (engine/live.js, DOM-free, deterministic)

Each event becomes a plan: put away what is in hand → walk to the zone → (rummage the satchel → take out the prop)
→ perform → react → (put the prop back). Rules: no teleport (a new plan mid-walk continues from where the character
stands); bursts of the same class coalesce (20 reads in 2 s = one long, increasingly frantic search at the shelf);
minimum dwell 1.2 s for every main action; long waits escalate (coffee → watch → yawn → nap on the sofa); repeated
test failures escalate (facepalm → hammer → rubber duck → screen on fire + extinguisher); when the agent is faster
than the stage, old low-priority steps are skipped and hands move faster.

Replay a recorded session: `GC_LIVE_TOKEN=gcl_… node tools/live-replay.mjs [file.jsonl] --speed 2`
(default file `kinds/live/demo-session.jsonl`; `--dry` prints the schedule).
