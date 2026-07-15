# How to turn on race mode on the server — plain guide

You do this once, on the Hetzner server. The website is already updated. Until
you finish this, the «Жарыс» button just shows a polite "server not ready"
message and **normal quizzes keep working perfectly** — so nothing is broken
and there is no rush. Do it when no class is running (a restart at the end
clears any live room).

**What you need:** the Terminal app on your Mac, and your server password (if
it asks). That's it. You will paste commands one at a time.

Legend: after each command press **Enter**. If a command prints an error in
red, **stop and send me the red text** instead of continuing.

---

## Step 1 — Open Terminal and log into the server

Open **Terminal** on your Mac (press ⌘+Space, type "Terminal", Enter).

Paste this and press Enter:

```
ssh root@89.167.9.192
```

- If it asks `Are you sure you want to continue connecting?` → type `yes`, Enter.
- If it asks for a password → type your server password (you won't see it as
  you type — that's normal) and press Enter.

When the line at the left starts with something like `root@...:~#`, you're in.

---

## Step 2 — Make a safety copy of the current server

Paste, Enter:

```
cp /root/server.js /root/server.js.bak
```

Nothing prints — that's fine. This is your undo button for later.

---

## Step 3 — Add the `/race` rule to nginx (one safe command)

This finds the right file, adds the rule, and **checks itself**. If the rule
is already there it does nothing. Paste this whole block as one piece
(copy all of it, paste, Enter):

```
FILE=$(grep -rl "127.0.0.1:3001" /etc/nginx/ | head -1); \
cp "$FILE" "$FILE.bak"; \
python3 - "$FILE" <<'PY'
import sys, re
f = sys.argv[1]; s = open(f).read()
if re.search(r'location\s*=?\s*/race\b', s):
    print("Already has /race — nothing to do."); sys.exit(0)
block = """    location /race {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 24h;
    }
"""
lines = s.splitlines(keepends=True)
start = next((i for i,l in enumerate(lines) if re.search(r'location\s*=?\s*/live\b', l)), None)
if start is None:
    print("ERROR: could not find the /live rule to add next to. Stop and ask."); sys.exit(2)
depth = lines[start].count('{') - lines[start].count('}'); end = start
while depth > 0 and end+1 < len(lines):
    end += 1; depth += lines[end].count('{') - lines[end].count('}')
open(f,'w').write("".join(lines[:end+1] + [block] + lines[end+1:]))
print("Added /race to", f)
PY
```

You should see either **"Added /race to ..."** or **"Already has /race..."**.
Either one is good. If you see **ERROR** in that output, stop and send it to me.

---

## Step 4 — Check the nginx change is valid, then apply it

Paste, Enter:

```
nginx -t
```

You want to see **"syntax is ok"** and **"test is successful"**.

- ✅ If you see those two lines, apply it — paste, Enter:

  ```
  systemctl reload nginx
  ```

- ❌ If it shows an error instead, your config wasn't changed in a working way.
  Undo it with this (paste, Enter) and send me the error:

  ```
  FILE=$(grep -rl "127.0.0.1:3001" /etc/nginx/ | head -1); cp "$FILE.bak" "$FILE"
  ```

---

## Step 5 — Get the new server file (pulled from GitHub)

Paste, Enter:

```
curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js
```

It prints a little progress bar and finishes. If it printed the bar and
returned to the prompt, it worked.

---

## Step 6 — Restart the app

⚠️ This clears any quiz room that's live right now. Do it when no class is
running. Paste, Enter:

```
pm2 restart mathsabaq-live && pm2 save
```

You'll see a small table from pm2. That's normal.

---

## Step 7 — Confirm it worked

Paste, Enter:

```
curl -s https://mathsabaq.online/health
```

You want to see **`"version":8`** in the output. 🎉 If you see that, race mode
is ON.

- If it still says `"version":7`, the file didn't update — redo Step 5, then
  Step 6, then this check.

One more check that nginx is letting `/race` through. Paste, Enter:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mathsabaq.online/race/advance -H "Content-Type: application/json" -d "{}"
```

- Seeing **400** or **404** = ✅ good (the server answered).
- Seeing **502** = nginx didn't pick up the change. Re-run Step 4
  (`systemctl reload nginx`) and try again.

---

## Step 8 — Leave the server

Paste, Enter:

```
exit
```

You're back on your Mac. **The server part is done.**

---

## Step 9 — Re-upload your quiz packs (on the website, not the server)

This is the last thing, and it's only so the worked-solution explanations
show up. In your website admin, go to **/admin/quizzes** and re-upload the
packs you want explanations for — start with the cylinder pack (it already has
solutions for all 40 questions built in). Do this **only after** Step 7 showed
`"version":8`.

---

## If anything goes wrong — put it back the way it was

Log in again (Step 1) and paste, Enter:

```
cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live
```

That restores the old server. Race mode turns off, normal quizzes keep
working, and you lose nothing. You can try the steps again later.

---

### The whole thing, short version

1. `ssh root@89.167.9.192`
2. `cp /root/server.js /root/server.js.bak`
3. Paste the big `/race` command block (Step 3)
4. `nginx -t` → if ok → `systemctl reload nginx`
5. `curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js`
6. `pm2 restart mathsabaq-live && pm2 save`
7. `curl -s https://mathsabaq.online/health` → want `"version":8`
8. `exit`
9. Re-upload packs at /admin/quizzes
