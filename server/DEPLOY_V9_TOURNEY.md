# How to turn on tournament mode on the server — plain guide

You do this once, on the Hetzner server. The website is already updated. Until
you finish this, the «Турнир» button just shows a polite "server not ready"
message and **normal quizzes and races keep working perfectly** — so nothing is
broken and there is no rush. Do it when no class is running (a restart at the
end clears any live room).

**The one new thing vs the race deploy:** the server is now THREE files, not
one. Besides `server.js` you also download `bracket.js` (the pairing engine)
and `exact.js` (the answer checker). All three must land together — a new
`server.js` without its two helpers will not start.

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

## Step 3 — Add the `/tourney` rule to nginx (two short commands)

Same idea as the `/race` step from last time: you download a tiny ready-made
helper and run it. It adds the `/tourney` rule, checks the config is valid,
and turns it on — and if anything's off it undoes itself. It's safe to run
more than once.

**Command 1 of 2** — download the helper. Paste, Enter:

```
curl -o /root/add-tourney-to-nginx.sh https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/add-tourney-to-nginx.sh
```

**Command 2 of 2** — run it. Paste, Enter:

```
bash /root/add-tourney-to-nginx.sh
```

Watch the last line it prints:

- ✅ **"SUCCESS: /tourney is added and nginx reloaded."** → done, go to Step 4.
- ❌ Any line starting with **ERROR** → it already put things back the way they
  were (nothing broken). Copy everything it printed and send it to me.

---

## Step 4 — Get the THREE new server files (pulled from GitHub)

This is the step that changed vs the race deploy. Paste these one at a time,
Enter after each:

```
curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js
```

```
curl -o /root/bracket.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/bracket.js
```

```
curl -o /root/exact.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/exact.js
```

Each prints a little progress bar and finishes. All three must succeed —
`server.js` will not start without its two neighbors.

---

## Step 5 — Restart the app

⚠️ This clears any quiz room that's live right now. Do it when no class is
running. Paste, Enter:

```
pm2 restart mathsabaq-live && pm2 save
```

You'll see a small table from pm2. That's normal.

---

## Step 6 — Confirm it worked

Paste, Enter:

```
curl -s https://mathsabaq.online/health
```

You want to see **`"version":9`** in the output. 🎉 If you see that, tournament
mode is ON.

- If it still says `"version":8`, the file didn't update — redo Step 4 (all
  three files), then Step 5, then this check.
- If the command prints nothing at all, the app may have failed to start
  (usually a missing `bracket.js` / `exact.js`). Run `pm2 logs mathsabaq-live
  --lines 20` and send me what it prints.

One more check that nginx is letting `/tourney` through. Paste, Enter:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mathsabaq.online/tourney/advance -H "Content-Type: application/json" -d "{}"
```

- Seeing **400** or **404** = ✅ good (the server answered).
- Seeing **502** = nginx didn't pick up the change. Re-run Step 3 (download and
  run the helper again) and try this check again.

---

## Step 7 — Leave the server

Paste, Enter:

```
exit
```

You're back on your Mac. **The server part is done.** Nothing pack-side:
existing drill generator quizzes work in tournament rooms as-is.

---

## If anything goes wrong — put it back the way it was

Log in again (Step 1) and paste, Enter:

```
cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live
```

That restores the old server. Tournament mode turns off, normal quizzes and
races keep working, and you lose nothing. (The extra `bracket.js` / `exact.js`
files can stay — the old server simply never loads them.) You can try the
steps again later.

---

### The whole thing, short version

1. `ssh root@89.167.9.192`
2. `cp /root/server.js /root/server.js.bak`
3. `curl -o /root/add-tourney-to-nginx.sh https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/add-tourney-to-nginx.sh`
   then `bash /root/add-tourney-to-nginx.sh` → want **SUCCESS**
4. `curl -o /root/server.js …/server/server.js`, `curl -o /root/bracket.js
   …/server/bracket.js`, `curl -o /root/exact.js …/server/exact.js` (full URLs
   above)
5. `pm2 restart mathsabaq-live && pm2 save`
6. `curl -s https://mathsabaq.online/health` → want `"version":9`
7. `exit`
