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

## Step 3 — Add the `/race` rule to nginx (two short commands)

Instead of typing anything tricky, you download a tiny ready-made helper and
run it. It adds the `/race` rule, checks the config is valid, and turns it on
— and if anything's off it undoes itself. It's safe to run more than once.

**Command 1 of 2** — download the helper. Paste, Enter:

```
curl -o /root/add-race-to-nginx.sh https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/add-race-to-nginx.sh
```

**Command 2 of 2** — run it. Paste, Enter:

```
bash /root/add-race-to-nginx.sh
```

Watch the last line it prints:

- ✅ **"SUCCESS: /race is added and nginx reloaded."** → done, go to Step 4.
- ❌ Any line starting with **ERROR** → it already put things back the way they
  were (nothing broken). Copy everything it printed and send it to me.

That's the whole nginx part — the helper already did the "check and apply"
that used to be a separate step.

---

## Step 4 — Get the new server file (pulled from GitHub)

Paste, Enter:

```
curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js
```

It prints a little progress bar and finishes. If it printed the bar and
returned to the prompt, it worked.

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

You want to see **`"version":8`** in the output. 🎉 If you see that, race mode
is ON.

- If it still says `"version":7`, the file didn't update — redo Step 4, then
  Step 5, then this check.

One more check that nginx is letting `/race` through. Paste, Enter:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mathsabaq.online/race/advance -H "Content-Type: application/json" -d "{}"
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

You're back on your Mac. **The server part is done.**

---

## Step 8 — Re-upload your quiz packs (on the website, not the server)

This is the last thing, and it's only so the worked-solution explanations
show up. In your website admin, go to **/admin/quizzes** and re-upload the
packs you want explanations for — start with the cylinder pack (it already has
solutions for all 40 questions built in). Do this **only after** Step 6 showed
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
3. `curl -o /root/add-race-to-nginx.sh https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/add-race-to-nginx.sh`
   then `bash /root/add-race-to-nginx.sh` → want **SUCCESS**
4. `curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js`
5. `pm2 restart mathsabaq-live && pm2 save`
6. `curl -s https://mathsabaq.online/health` → want `"version":8`
7. `exit`
8. Re-upload packs at /admin/quizzes
