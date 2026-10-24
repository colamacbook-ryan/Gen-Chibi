// gen-chibi — kế hoạch "mời agent tự nối Sân khấu Live" (tool MCP live_setup, INT-21 g: "Đề nghị, có hỏi chủ").
// © 2026 Gen Labs — All rights reserved.
// App CHỈ cấp hai thứ có kiểm dạng: token live riêng của agent (gcl_…) + địa chỉ app. Mã chạy trên máy agent (live-hook.mjs) luôn tải từ
// bản phát hành CHÍNH THỨC trên GitHub của đúng phiên bản này và kiểm SHA-256 theo SHA256SUMS TRƯỚC khi ghi — app không bao giờ phục vụ mã
// cho máy agent (không curl | sh). Lệnh có khuôn cố định (agent/GUIDE.md luật 13 mô tả để agent tự đối chiếu); agent PHẢI hỏi người dùng trước khi chạy.
'use strict';

const TOKEN_RE = /^gcl_[A-Za-z0-9_-]{43}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const REPO_RE = /^[A-Za-z0-9_.-]{1,64}\/[A-Za-z0-9_.-]{1,100}$/;
// địa chỉ app mà hook sẽ gửi tới: https công khai, hoặc http trên chính máy này
const URL_RE = /^(https:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?|http:\/\/(127\.0\.0\.1|localhost):\d{1,5})$/;
const RELBASE_RE = /^(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download|http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_\/-]*)$/;
const DIR = '$HOME/.local/lib/gen-chibi-live';

// o = { version, repo, publicUrl, port, local, os, agent, token, releaseBase? (chỉ test) } → { ok: true, … } | { ok: false, reason, why }
function plan(o) {
  const os = o.os || 'linux', agent = o.agent || 'claude-code';
  if (['linux', 'macos', 'windows'].indexOf(os) < 0) return { ok: false, reason: 'BAD_OS', why: 'os must be linux, macos or windows' };
  if (['claude-code', 'other'].indexOf(agent) < 0) return { ok: false, reason: 'BAD_AGENT', why: 'agent must be claude-code or other' };
  const url = o.publicUrl || (o.local ? 'http://127.0.0.1:' + o.port : '');
  if (!url) return { ok: false, reason: 'NOT_REACHABLE', why: 'gen-chibi has no public address (it is only reachable on its own machine) and this connection does not come from that machine, so a hook on your machine could not reach it. Ask the owner to put gen-chibi online first (genchibi online), or run the agent on the gen-chibi machine.' };
  if (!URL_RE.test(url)) return { ok: false, reason: 'BAD_URL', why: 'the app address is not a plain https origin' };
  if (agent === 'other') {
    return { ok: true, install: false, url, steps: ['Nothing to install: call the MCP tools live_task (when you start a different task) and live_event (at each step). The owner sees them on the Live stage.'],
      ask: 'Nothing runs on your machine — no permission needed beyond using the two tools.' };
  }
  if (os === 'windows') return { ok: false, reason: 'UNSUPPORTED_OS', why: 'Claude Code hooks for the Live stage need a POSIX shell: run Claude Code in WSL and call live_setup again with os = linux.' };
  if (!VERSION_RE.test(o.version || '') || !REPO_RE.test(o.repo || '') || !TOKEN_RE.test(o.token || '')) return { ok: false, reason: 'INTERNAL', why: 'version / repository / token in an unexpected format — not producing a command' };
  const base = o.releaseBase || 'https://github.com/' + o.repo + '/releases/download';
  if (!RELBASE_RE.test(base)) return { ok: false, reason: 'INTERNAL', why: 'release address in an unexpected format' };
  const V = o.version, rel = base + '/v' + V;
  const command = '( set -eu; V=' + V + '; R=' + rel + '; D="' + DIR + '"; T="$(mktemp -d)"; trap \'rm -rf "$T"\' EXIT; ' +
    'curl -fsSL "$R/gen-chibi-v$V.tar.gz" -o "$T/p.tgz"; curl -fsSL "$R/SHA256SUMS" -o "$T/SUMS"; ' +
    'W="$(awk -v f="gen-chibi-v$V.tar.gz" \'$2 == f || $2 == "*" f { print $1 }\' "$T/SUMS")"; ' +
    'G="$( { sha256sum "$T/p.tgz" 2>/dev/null || shasum -a 256 "$T/p.tgz"; } | awk \'{ print $1 }\')"; ' +
    '[ -n "$W" ] && [ "$W" = "$G" ] || { echo "gen-chibi: SHA-256 does not match the release — nothing installed" >&2; exit 1; }; ' +
    'tar -xzf "$T/p.tgz" -C "$T" "gen-chibi-v$V/tools/live-hook.mjs"; ' +
    'mkdir -p "$D"; chmod 700 "$D"; cp "$T/gen-chibi-v$V/tools/live-hook.mjs" "$D/live-hook.mjs"; chmod 600 "$D/live-hook.mjs"; ' +
    '( umask 077; printf \'%s\\n\' \'' + o.token + '\' > "$D/live-token"; printf \'%s\\n\' \'' + url + '\' > "$D/live-url" ); ' +
    'node "$D/live-hook.mjs" --install-claude "$HOME/.claude/settings.json" )';
  return {
    ok: true, install: true, url, version: V,
    ask: require('./rules').LIVE.ask,
    installs: [DIR + '/live-hook.mjs — the hook script, downloaded from the official release v' + V + ' (' + rel + ') and checked against its SHA256SUMS before anything is written',
      DIR + '/live-token — a live token for THIS agent only (it can only send Live events; the owner can revoke it in Studio › System › Live stage)',
      DIR + '/live-url — the address events go to: ' + url],
    changes: ['~/.claude/settings.json: adds Live hooks (a backup settings.json.bak-<time> is kept; your other settings and hooks stay). Restart Claude Code afterwards.'],
    command,
    undo: 'node "' + DIR + '/live-hook.mjs" --uninstall-claude "$HOME/.claude/settings.json" && rm -rf "' + DIR + '"   (then the owner can revoke the token in the Studio)',
    requirement: o.publicUrl ? 'The hook posts to the owner\'s public address ' + url + '.' : 'gen-chibi is only on its own machine: this works only if your agent runs on that same machine.',
    sends: 'Only the kind of each step (read, edit, test…), never prompts, file contents, paths, commands or results.'
  };
}

module.exports = { plan, TOKEN_RE, URL_RE, DIR };
