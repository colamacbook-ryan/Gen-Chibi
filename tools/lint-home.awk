# gen-chibi — lint: mọi lần chạy genchibi trong tools/test-* phải có HOME tường minh (cùng dòng hoặc 3 dòng trên). In "tệp:dòng: …" cho lời gọi thiếu. © 2026 Gen Labs — All rights reserved.
{ L[NR] = $0 }
END { n = 0
  for (i = 1; i <= NR; i++) {
    l = L[i]; if (l ~ /^[ \t]*(#|\/\/)/) continue
    hit = 0
    if (l ~ /bash +"?\$ROOT\/cli\/genchibi"?/) hit = 1
    if (l ~ /"\$[A-Za-z0-9_]+\/\.local\/bin\/genchibi"[ ]+[a-z]/ && l !~ /(cmp|grep|cp|old_stub|chmod|sed|mv|cat|\[) [^;]*"\$[A-Za-z0-9_]+\/\.local\/bin\/genchibi"[ ]+[a-z]/) hit = 1
    if (l ~ /(spawn|spawnSync|execFileSync|execFile|run)\(/ && l ~ /(cli\/genchibi|cli', 'genchibi|\.local\/bin\/genchibi|\[cliPath\]|path\.join\(ROOT, .cli\/genchibi.\))/) hit = 1
    if (!hit) continue
    w = l " " L[i-1] " " L[i-2] " " L[i-3]; n++
    if (w !~ /HOME/) print FILENAME ":" i ": " substr(l, 1, 120)
  }
}
