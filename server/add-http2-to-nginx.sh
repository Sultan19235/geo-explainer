#!/usr/bin/env bash
# Enables HTTP/2 on the box's nginx site (the one that proxies the live quiz
# app on :3001). Why: over HTTP/1.1 a browser allows only ~6 connections per
# host SHARED ACROSS ALL TABS, and every open teacher board holds one SSE
# connection forever — a few old quiz tabs starve every new request (slow
# room creation, 10-15s "thinking" on tournament buttons, boards missing
# events). HTTP/2 multiplexes everything over one connection and ends the
# competition.
#
# Safe to run more than once: it backs the file up, does nothing if http2 is
# already on, and never applies a broken config (it runs `nginx -t` and only
# reloads on success; on failure it restores the backup).
#
# NOTE: uses the `listen 443 ssl http2;` syntax on purpose — the box runs
# nginx 1.24, and the newer `http2 on;` directive needs 1.25.1+.
#
# Usage on the Hetzner box:  bash add-http2-to-nginx.sh
set -euo pipefail

# Find the ENABLED site file that proxies to the live app on :3001. The app
# address may be written as localhost:3001 or 127.0.0.1:3001; we accept both.
# Prefer files under sites-enabled (the ones nginx actually loads) and never a
# .bak copy. Fall back to sites-available if nothing is symlinked yet.
find_site() {
  local pat='proxy_pass[[:space:]]+http://(127\.0\.0\.1|localhost):3001'
  for d in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
    [ -d "$d" ] || continue
    while IFS= read -r cand; do
      case "$cand" in *.bak) continue;; esac
      cand="$(readlink -f "$cand" 2>/dev/null || echo "$cand")"
      case "$cand" in *.bak) continue;; esac
      if grep -qE "$pat" "$cand" 2>/dev/null; then echo "$cand"; return 0; fi
    done < <(find "$d" \( -type f -o -type l \) 2>/dev/null)
  done
  return 1
}

FILE="$(find_site || true)"
if [ -z "$FILE" ]; then
  echo "ERROR: could not find the nginx file that proxies to the app on port 3001."
  echo "Stop here and send this message to Claude."
  exit 1
fi
echo "Found nginx file: $FILE"

cp "$FILE" "$FILE.http2-bak"
echo "Backed it up to: $FILE.http2-bak"

python3 - "$FILE" <<'PY'
import sys, re
f = sys.argv[1]
s = open(f).read()

changed = 0
out = []
for line in s.splitlines(keepends=True):
    # Only TLS listen lines get http2: "listen 443 ssl;" and
    # "listen [::]:443 ssl;" in any argument order, certbot comments intact.
    if re.search(r'^\s*listen\b', line) and re.search(r'\bssl\b', line) \
            and '443' in line and not re.search(r'\bhttp2\b', line):
        line = re.sub(r'\s*;', ' http2;', line, count=1)
        changed += 1
    out.append(line)

if changed == 0:
    if re.search(r'^\s*listen\b.*\bhttp2\b', s, re.M):
        print("http2 is already on — nothing to change.")
        sys.exit(0)
    print("ERROR: found no `listen ... 443 ssl;` line to upgrade. Stop and ask Claude.")
    sys.exit(2)

open(f, 'w').write("".join(out))
print(f"Enabled http2 on {changed} listen line(s).")
PY

echo "Checking the nginx config is valid..."
if nginx -t; then
  systemctl reload nginx
  echo
  echo "SUCCESS: HTTP/2 is on and nginx reloaded."
  echo "Check from your Mac:  curl -sI https://mathsabaq.online/health | head -1"
  echo "It should now say:    HTTP/2 200"
else
  cp "$FILE.http2-bak" "$FILE"
  echo
  echo "ERROR: the new config did not pass nginx's check, so I put the old one back."
  echo "Nothing changed. Send this whole message to Claude."
  exit 1
fi
