# How to turn on level mode (Деңгейлер) on the server — plain guide

You do this once, on the Hetzner server, **after** the website deploy. This is
the smallest server update so far: ONE file, no nginx changes, no new
endpoints. Until you do it, everything keeps working — level rooms will run
fine on the students' screens too, the only thing missing is the **level
column on your teacher board** (the old server silently drops the new field).
So there is no rush; do it when no class is running (the restart clears any
live room).

**What you need:** the Terminal app on your Mac, and your server password (if
it asks). Paste commands one at a time, press **Enter** after each. If a
command prints an error in red, **stop and send me the red text**.

---

## Step 1 — Log into the server

```
ssh root@89.167.9.192
```

- `Are you sure you want to continue connecting?` → type `yes`, Enter.
- Password prompt → type it (invisible while typing is normal), Enter.

When the prompt looks like `root@...:~#`, you're in.

---

## Step 2 — Safety copy of the current server

```
cp /root/server.js /root/server.js.bak
```

Nothing prints — that's fine. This is your undo button.

---

## Step 3 — Get the new server file (pulled from GitHub)

Only `server.js` changed — `bracket.js` and `exact.js` stay as they are.

```
curl -o /root/server.js https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/server/server.js
```

A small progress bar prints and finishes.

---

## Step 4 — Restart the app

⚠️ This clears any quiz room that's live right now. Do it when no class is
running.

```
pm2 restart mathsabaq-live && pm2 save
```

A small pm2 table prints — normal.

---

## Step 5 — Confirm it worked

```
curl -s https://mathsabaq.online/health
```

You should see:

```
{"ok":true,"version":10}
```

**version 10** is the win. If it still says 9, the curl in Step 3 didn't
land — run Step 3 and 4 again.

---

## If something went wrong — undo

```
cp /root/server.js.bak /root/server.js && pm2 restart mathsabaq-live
```

That puts the previous (v9) server back exactly as it was.

---

## What v10 adds (for the record)

`/submit` accepts one optional field, `level` — the ladder rung a student in
a level-mode drill room is on. The server clamps it (1–99), keeps it
monotonic within a run (a stale heartbeat can't demote anyone; a deliberate
re-join resets it), ignores it in race/tournament rooms, and passes it to
your board's live stream. Rooms that never send it behave byte-for-byte as
v9.
