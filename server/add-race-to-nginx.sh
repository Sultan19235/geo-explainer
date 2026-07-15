#!/usr/bin/env bash
# Adds the /race location to the box's nginx site so server v8 (race mode)
# works. Safe to run more than once: it backs the file up, does nothing if
# /race is already present, and never applies a broken config (it runs
# `nginx -t` and only reloads on success; on failure it restores the backup).
#
# Usage on the Hetzner box:  bash add-race-to-nginx.sh
set -euo pipefail

FILE="$(grep -rl '127.0.0.1:3001' /etc/nginx/ 2>/dev/null | head -1 || true)"
if [ -z "$FILE" ]; then
  echo "ERROR: could not find the nginx file that proxies to the app (127.0.0.1:3001)."
  echo "Stop here and send this message to Claude."
  exit 1
fi
echo "Found nginx file: $FILE"

cp "$FILE" "$FILE.race-bak"
echo "Backed it up to: $FILE.race-bak"

python3 - "$FILE" <<'PY'
import sys, re
f = sys.argv[1]
s = open(f).read()
if re.search(r'location\s*=?\s*/race\b', s):
    print("Already has /race — nothing to change."); sys.exit(0)
block = """    location /race {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 24h;
    }
"""
lines = s.splitlines(keepends=True)
start = next((i for i, l in enumerate(lines)
              if re.search(r'location\s*=?\s*/live\b', l)), None)
if start is None:
    print("ERROR: could not find the /live rule to add next to. Stop and ask Claude.")
    sys.exit(2)
depth = lines[start].count('{') - lines[start].count('}')
end = start
while depth > 0 and end + 1 < len(lines):
    end += 1
    depth += lines[end].count('{') - lines[end].count('}')
open(f, 'w').write("".join(lines[:end + 1] + [block] + lines[end + 1:]))
print("Added the /race rule.")
PY

echo "Checking the nginx config is valid..."
if nginx -t; then
  systemctl reload nginx
  echo
  echo "SUCCESS: /race is added and nginx reloaded. Go to Step 4 in the guide."
else
  cp "$FILE.race-bak" "$FILE"
  echo
  echo "ERROR: the new config did not pass nginx's check, so I put the old one back."
  echo "Nothing changed. Send this whole message to Claude."
  exit 1
fi
