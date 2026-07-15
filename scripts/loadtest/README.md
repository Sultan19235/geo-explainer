# Quiz load test — 100 rooms × 30 students, step by step

This folder simulates thousands of students against the live quiz server so we
can see how the Hetzner box behaves **before** real traffic gets there. The
fake students speak the exact same protocol as real phones (same 2s lobby
polls, 15s heartbeats, race SSE streams), so what the server experiences is
indistinguishable from a real school day.

Two tools:

| file | runs where | what it does |
|---|---|---|
| `loadtest.mjs` | your Mac | pretends to be N teachers + N×30 students |
| `record-resources.sh` | the Hetzner box | writes CPU / memory / connections to a CSV every 5s |

**Run tests in the evening** — the simulator shares the box with real
classrooms. Ctrl-C at any time ends all test rooms cleanly (and the server
auto-ends anything left after 45 minutes anyway).

---

## One-time preparation

1. **You need the quiz token secret** (the same `QUIZ_TOKEN_SECRET` the server
   uses). On the Hetzner box:

   ```
   grep QUIZ_TOKEN_SECRET /root/mathsabaq-live/.env
   ```

   (adjust the path if the server lives elsewhere — `pm2 describe
   mathsabaq-live` shows it). Copy the value; you'll paste it into the Mac
   commands below. **Never commit it anywhere.**

2. **On your Mac**, open Terminal in this folder and raise the open-files
   limit (needed once per terminal window):

   ```
   cd ~/Desktop/geo-explainer/scripts/loadtest
   ulimit -n 10240
   ```

---

## Step 1 — start the recorder on the Hetzner box

SSH into the box, download the recorder from GitHub and start it:

```
curl -sO https://raw.githubusercontent.com/Sultan19235/geo-explainer/main/scripts/loadtest/record-resources.sh
bash record-resources.sh
```

It prints the CSV filename it is writing (e.g. `quiz-load-20260715-2100.csv`)
and adds a row every 5 seconds. Leave it running in this SSH window for the
whole evening. A second SSH window with `htop` is a nice live view but not
required.

## Step 2 — preflight (1 minute, from the Mac)

```
node loadtest.mjs --server https://mathsabaq.online --preflight
```

Use the same server address the teacher console talks to (the Hetzner quiz
API, **not** the Vercel site). Expected output: `PASS: probe A got
rate-limited, probe B did not`. If it says FAIL, the guide text it prints
tells you exactly which two lines to change in the server `.env` for the
evening (and to restore after).

## Step 3 — dress rehearsal: 5 rooms × 30 students (~8 minutes)

```
node loadtest.mjs --server https://mathsabaq.online --secret '<QUIZ_TOKEN_SECRET>' \
  --rooms 5 --students 30 --mode paced --ramp 60 --lobby 60 --duration 180
```

Watch the progress line every 5 seconds: `students … active`, `req/s`, `p95`
(how long the server takes to answer, in ms — under ~100 is invisible to a
student), `errs` (must stay 0). If this looks clean, go bigger.

## Step 4 — the real thing: 100 rooms × 30 students, self-paced (~18 min)

```
node loadtest.mjs --server https://mathsabaq.online --secret '<QUIZ_TOKEN_SECRET>' \
  --rooms 100 --students 30 --mode paced --ramp 180 --lobby 180 --duration 600
```

This is the full "10:00am bell" simulation: 3,000 students joining within 3
minutes, 3 minutes of worst-case lobby chatter, all 100 teachers pressing
Start within 10 seconds, then 10 minutes of steady quiz load.

## Step 5 — race mode: 100 rooms × 30 students (~10 min)

```
node loadtest.mjs --server https://mathsabaq.online --secret '<QUIZ_TOKEN_SECRET>' \
  --rooms 100 --students 30 --mode race --questions 8 --qtime 20 --ramp 120 --lobby 60
```

This is the harder test: 3,000 phones each hold a live connection open for the
whole game and answer every question within seconds of each other.

## Step 6 — collect the results

1. On the Hetzner box: press Ctrl-C in the recorder window, then copy the CSV
   to your Mac (run this **on the Mac**):

   ```
   scp root@<server-ip>:~/quiz-load-*.csv ~/Desktop/
   ```

2. On the Mac, each test also wrote a `loadtest-report-*.json` in this folder
   with the full latency/error breakdown (a summary was already printed).

3. Give both files to Claude → it will chart CPU/memory/connections per phase
   and give the plain verdict: keep the current plan, apply the free config
   fixes, or upgrade — and to which tier.

---

## Reading the numbers yourself (cheat sheet)

- **p95 latency** under 100ms: students feel nothing. 100–500ms: fine.
  Over 1s: kids see lag.
- **errors** column: `429` = a limit was hit (rate limit or SSE cap — config,
  not hardware); `5xx`/`neterr`/`timeout` = the server or box is actually
  struggling.
- **CSV `box_cpu_pct`** at the worst moment under ~60%: plenty of headroom.
  Pinned near 100% with `node_cpu_pct` ≈ 100: the single Node core is the
  wall (Node uses one core no matter how many the plan has — a *dedicated*
  vCPU plan helps more than a *bigger* one).
- **CSV `conns_3001`** during race mode should be ≈ number of simulated
  students. If it plateaus below that while students report connection
  errors, it's the nginx/OS connection ceiling — a config fix, not a plan
  upgrade.

## Knobs

| flag | default | meaning |
|---|---|---|
| `--rooms` / `--students` | 2 / 5 | classrooms / students per classroom |
| `--mode` | paced | `paced` (öz qarqynymen) or `race` (Жарыс) |
| `--ramp` | 120 | seconds over which students join (the stampede) |
| `--lobby` | 120 | seconds everyone waits in the lobby |
| `--duration` | 480 | paced-mode quiz length, seconds |
| `--questions` / `--qtime` | 8 / 20 | race: question count / seconds each |
| `--no-xff` | off | don't fake per-room IPs (only with limits lifted) |
| `--preflight` | — | just check rate-limit bucketing, then exit |
