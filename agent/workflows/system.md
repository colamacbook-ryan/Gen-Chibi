# Topic: system — version, update, rollback

- `get_app_version` (`check: false` to skip GitHub) → running version, latest release, notes, history.
- `update_app` → downloads the latest release (SHA-256 checked, data backed up) and restarts.
  The connection drops for a few seconds; call `get_app_version` after ~15 s.
- `rollback_app` with `{ "confirm": "ROLLBACK" }` → previous version. **Only when the owner explicitly asks.**
  Not available through the Internet link.

## Live stage (`live_event`)

The owner can watch a chibi character act out your work in real time (Studio › System › Live).
Agents that are not Claude Code (Claude Code uses hooks — no tool calls needed) report each real step with
`live_event` `{ "kind": "read", "label": "Reading the setup guide" }`:

- `kind`: `session_start` · `prompt` · `think` · `read` · `search` · `edit` · `write` · `run` · `test_run` · `test_pass` ·
  `test_fail` · `delegate_start` · `delegate_end` · `wait_user` · `error` · `limit` · `release` · `idle` · `stop`.
- `label`: optional, ≤ 48 characters of plain words. **Never** file contents, paths, commands, URLs, emails or secrets —
  the server strips them anyway and falls back to a default caption.
- Fire-and-forget, about 10 events per second at most (`UNAVAILABLE` = slow down). Do not let it slow your real work.

## Task switch (`live_task`)

Golden rule: when you start a task that differs from the current one, call `live_task` first —
`{ "task": "debug", "title": "Fix the date bug" }`. Tasks: `code` · `debug` · `test` · `research` · `read` · `write` ·
`design` · `plan` · `review` · `release` · `chat` · `other`. The title is ≤ 60 characters of plain words (cleaned like
labels; shown only in the event table). Calling it again with the same task does nothing. The stage plays a "new task"
beat (clapperboard, the character puts its props away, changes its hat badge and walks to the task's corner) and the
Studio shows "Working on: …".
