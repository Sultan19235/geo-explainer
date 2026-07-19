# Tournament Mode (Турнир) — Classroom QA Checklist

Run this once on localhost before deploying, and once on prod before the
first real class. You need: 1 laptop (console + board) and ideally 3–5
phones (2 is the minimum; browser tabs work too).

## Local run (before deploy)

```bash
# terminal 1 — the live server (v9)
node server/server.js
# terminal 2 — the site
npm run dev
```

Open a drill-generator quiz's console (e.g. the dev-preview pack at
`/play/dev-preview/host` if it has a drill generator, or any generator quiz
from /admin/quizzes).

## Setup checks

- [ ] «Турнир» mode button appears ONLY for drill-generator quizzes
      (registry topic or uploaded .js) — fixed-question quizzes still show
      «Өз қарқынымен»/«Жарыс» only.
- [ ] Round length (60/90/120/180с) and lockout (Жоқ/3/4/5/8с) selects work.
- [ ] Opening the room shows a build spinner (answer keys generating), then
      the lobby with QR + code. On a v8 server this must FAIL loudly
      («Сервер турнир режимін қолдамайды») — no half-made room.

## Tournament flow (5 phones: A B C D E)

- [ ] All five join via QR/code; lobby shows them; start the room.
- [ ] «Жеребе тарту» → bracket appears on the board: 2 duels + 1 bye (5 is
      odd); each phone shows its opponent (bye phone shows the solo card).
- [ ] «Айналымды бастау» → 3-2-1 on phones → problems appear. SAME first
      problem on every phone (shared round seed).
- [ ] Typing a correct answer: green flash, next problem, score bar moves on
      BOTH duelists' phones and on the board pair card.
- [ ] Wrong answer: red flash + lockout countdown, keypad frozen, then next
      problem. Score does not decrease.
- [ ] Put phone B in a pocket (lock it): phone A shows the away badge with a
      ticking timer within ~20s; board shows it too.
- [ ] Round timer hits 0 → phones show waiting → result cards (won/lost),
      board bracket settles with scores.
- [ ] Next «Жеребе»: 2 winners + bye = 3 in main → one duel + lucky loser
      promoted (best loser returns — banner on board, «Сен турнирге
      қайттың!» on their phone). Losers keep playing in «Жұбаныш ойыны».
- [ ] Run to the final → champion card on their phone, «Марапаттау» →
      podium + confetti + full standings (every pupil ranked, no gaps).
- [ ] «Аяқтау» → students KEEP their podium screen (no 0/0 screen);
      console shows the usual results screen; the result autosaves to the
      profile (check the dashboard row).

## Edge checks (worth 5 minutes)

- [ ] Reload a student phone mid-duel → it comes back on the same problem
      number with the same score (server snapshot restore).
- [ ] Reload the console mid-duel → resume → bracket + live scores repaint
      (not 0:0), QR/join link unchanged.
- [ ] Kick a student mid-duel → their opponent's phone flips the badge to
      "left" quickly; at settle the kicked student loses regardless of score;
      they stay in the final standings.
- [ ] A student joining AFTER the first draw waits, then enters the losers
      pool at the next draw (never the main bracket).
- [ ] Double-click every teacher button — nothing breaks (409s are ignored).
- [ ] Old rooms unaffected: run one «Өз қарқынымен» and one «Жарыс» room
      end-to-end as a regression smoke.

## Deploy (after local QA)

Follow `server/DEPLOY_V9_TOURNEY.md`: Vercel first, then on the Hetzner box
nginx `/tourney` allowlist (script: `server/add-tourney-to-nginx.sh`) → copy
**all three** files `server/server.js server/bracket.js server/exact.js` →
`pm2 restart mathsabaq-live` → `curl https://mathsabaq.online/health` must
report `"version":9`.
