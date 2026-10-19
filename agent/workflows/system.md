# Topic: system — version, update, rollback

- `get_app_version` (`check: false` to skip GitHub) → running version, latest release, notes, history.
- `update_app` → downloads the latest release (SHA-256 checked, data backed up) and restarts.
  The connection drops for a few seconds; call `get_app_version` after ~15 s.
- `rollback_app` with `{ "confirm": "ROLLBACK" }` → previous version. **Only when the owner explicitly asks.**
  Not available through the Internet link.
