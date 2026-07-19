#!/usr/bin/env bash
# Adds the /tourney location to the box's nginx site so server v9 (tournament
# mode) works. Safe to run more than once: it backs the file up, does nothing
# if /tourney is already present, and never applies a broken config (it runs
# `nginx -t` and only reloads on success; on failure it restores the backup).
#
# Usage on the Hetzner box:  bash add-tourney-to-nginx.sh
set -euo pipefail

# Find the ENABLED site file that proxies to the live app on :3001. The app
# address may be written as localhost:3001 or 127.0.0.1:3001; we accept both.
# Prefer files under sites-enabled (the ones nginx actually loads) and never a
# .bak copy. Fall back to sites-available if nothing is symlinked yet.
find_site() {
  local pat='proxy_pass[[:space:]]+http://(127\.0\.0\.1|localhost):3001'
  # 1) enabled sites, following the symlinks into sites-available
  for d in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
    [ -d "$d" ] || continue
    while IFS= read -r cand; do
      case "$cand" in *.bak) continue;; esac
      # resolve a symlink to its real file so we edit the actual config
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

cp "$FILE" "$FILE.tourney-bak"
echo "Backed it up to: $FILE.tourney-bak"

python3 - "$FILE" <<'PY'
import sys, re
f = sys.argv[1]
s = open(f).read()
if re.search(r'location\s*=?\s*/tourney\b', s):
    print("Already has /tourney — nothing to change."); sys.exit(0)

# Match the app target exactly as this file writes it (localhost or 127.0.0.1).
m = re.search(r'proxy_pass\s+http://(127\.0\.0\.1|localhost):3001', s)
target = m.group(0).split()[1] if m else "http://localhost:3001"
block = (
    "    location /tourney {\n"
    "        proxy_pass %s;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Connection '';\n"
    "        proxy_buffering off;\n"
    "        proxy_read_timeout 24h;\n"
    "    }\n"
) % target

lines = s.splitlines(keepends=True)
# Insert next to the /race rule (a v9 box already ran the race helper); a box
# that somehow skipped v8 still has /live to anchor on.
start = next((i for i, l in enumerate(lines)
              if re.search(r'location\s*=?\s*/race\b', l)), None)
if start is None:
    start = next((i for i, l in enumerate(lines)
                  if re.search(r'location\s*=?\s*/live\b', l)), None)
if start is None:
    print("ERROR: could not find the /race or /live rule to add next to. Stop and ask Claude.")
    sys.exit(2)
# The anchor rule may be a one-liner or span several lines — find its closing
# brace by counting, and insert /tourney right after it.
depth = lines[start].count('{') - lines[start].count('}')
end = start
while depth > 0 and end + 1 < len(lines):
    end += 1
    depth += lines[end].count('{') - lines[end].count('}')
open(f, 'w').write("".join(lines[:end + 1] + [block] + lines[end + 1:]))
print("Added the /tourney rule.")
PY

echo "Checking the nginx config is valid..."
if nginx -t; then
  systemctl reload nginx
  echo
  echo "SUCCESS: /tourney is added and nginx reloaded. Go to Step 4 in the guide."
else
  cp "$FILE.tourney-bak" "$FILE"
  echo
  echo "ERROR: the new config did not pass nginx's check, so I put the old one back."
  echo "Nothing changed. Send this whole message to Claude."
  exit 1
fi
