#!/usr/bin/env node
/**
 * MathSabaq quiz load simulator — fake classrooms speaking the real protocol.
 *
 * Simulates R rooms × S students against the live quiz server (server/server.js
 * v8) with the exact cadence of the real clients (src/lib/quiz/use-live-session.ts
 * & use-race-session.ts): lobby /status poll every 2s, /submit heartbeat every
 * 15s, race rooms hold one /race/stream SSE per student and POST /race/answer.
 *
 * Each room presents its own X-Forwarded-For ("school NAT" IP) so the server's
 * per-IP rate limits see 100 schools, not one flood — same shape as production.
 * (Requires nginx to pass the header through, which the deployed config does;
 * run --preflight first to confirm, and use --no-xff if it doesn't.)
 *
 * Teachers are minted from QUIZ_TOKEN_SECRET (same HMAC format as the site's
 * /api/quiz-token) — one uid per room, so the one-room-per-teacher gate behaves
 * exactly as in production. A leftover room from a previous run is /end-ed via
 * the owner-token path and creation retried.
 *
 *   node loadtest.mjs --server https://mathsabaq.online --secret $QUIZ_TOKEN_SECRET \
 *        --rooms 100 --students 30 --mode paced
 *   node loadtest.mjs --server https://mathsabaq.online --secret $QUIZ_TOKEN_SECRET \
 *        --rooms 100 --students 30 --mode race --questions 8 --qtime 20
 *   node loadtest.mjs --server https://mathsabaq.online --preflight
 *
 * Every request is timed; the report (stdout + JSON file) breaks latency and
 * errors down per phase per endpoint. Ctrl-C ends all rooms and still reports.
 */

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const CFG = {
  server: String(flag('server', 'http://localhost:3001')),
  secret: String(flag('secret', process.env.QUIZ_TOKEN_SECRET || '')),
  rooms: Number(flag('rooms', 2)),
  students: Number(flag('students', 5)),
  mode: String(flag('mode', 'paced')), // paced | race
  rampSec: Number(flag('ramp', 120)), // join stampede spread
  lobbySec: Number(flag('lobby', 120)), // hold in lobby after everyone joined
  durationSec: Number(flag('duration', 480)), // paced quiz phase length
  questions: Number(flag('questions', 8)), // race question count
  qtimeSec: Number(flag('qtime', 20)), // race per-question seconds
  xff: !argv.includes('--no-xff'),
  preflight: argv.includes('--preflight'),
  out: String(flag('out', `loadtest-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)),
};

const base = new URL(CFG.server);
const isHttps = base.protocol === 'https:';
const httpMod = isHttps ? https : http;

// ─── Metrics ─────────────────────────────────────────────────────────────────
const M = {
  phase: 'init',
  phaseStarted: Date.now(),
  buckets: new Map(), // "phase|label" -> {n, err, statuses:{}, lat:[]}
  window: { n: 0, err: 0, lat: [] }, // rolling 5s ticker window
  sse: { open: 0, opened: 0, drops: 0, events: 0 },
  students: { joined: 0, active: 0, finished: 0, failed: 0 },
  phaseLog: [], // {phase, startedAt, endedAt}
};
const MAX_LAT_SAMPLES = 150_000;

function setPhase(name) {
  const now = Date.now();
  const last = M.phaseLog[M.phaseLog.length - 1];
  if (last && !last.endedAt) last.endedAt = now;
  M.phaseLog.push({ phase: name, startedAt: now });
  M.phase = name;
  M.phaseStarted = now;
  log(`━━ phase: ${name}`);
}

function recordReq(label, ms, status, errType) {
  const key = `${M.phase}|${label}`;
  let b = M.buckets.get(key);
  if (!b) {
    b = { n: 0, err: 0, statuses: {}, lat: [], latDropped: 0 };
    M.buckets.set(key, b);
  }
  b.n++;
  const ok = status >= 200 && status < 400;
  if (!ok) b.err++;
  const sKey = errType || String(status);
  b.statuses[sKey] = (b.statuses[sKey] || 0) + 1;
  if (b.lat.length < MAX_LAT_SAMPLES) b.lat.push(ms);
  else b.latDropped++;
  M.window.n++;
  if (!ok) M.window.err++;
  if (M.window.lat.length < 20_000) M.window.lat.push(ms);
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`);
}

// ─── HTTP core ───────────────────────────────────────────────────────────────
function makeAgent() {
  return new (isHttps ? https.Agent : http.Agent)({ keepAlive: true, maxSockets: 4 });
}

function request(entity, method, pathAndQuery, body, label) {
  return new Promise((resolve) => {
    const started = performance.now();
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpMod.request(
      {
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        path: pathAndQuery,
        method,
        agent: entity.agent,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...(CFG.xff && entity.ip ? { 'x-forwarded-for': entity.ip } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const ms = performance.now() - started;
          recordReq(label, ms, res.statusCode);
          let json = null;
          try { json = JSON.parse(data); } catch (_) {}
          resolve({ status: res.statusCode, json, ms });
        });
      },
    );
    req.setTimeout(15_000, () => req.destroy(new Error('timeout')));
    req.on('error', (e) => {
      const ms = performance.now() - started;
      const errType = e.message === 'timeout' ? 'timeout' : (e.code || 'neterr');
      recordReq(label, ms, 0, errType);
      resolve({ status: 0, json: null, ms, error: errType });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// SSE: one dedicated socket (agent:false), '\n\n'-framed `data:` JSON events.
// onEvent(obj); returns {close()}. Reconnects after 2s like the real client.
function openSse(entity, pathAndQuery, label, onEvent, isAlive) {
  let closed = false;
  let req = null;
  let retryTimer = null;

  function connect() {
    if (closed || !isAlive()) return;
    const started = performance.now();
    req = httpMod.request({
      hostname: base.hostname,
      port: base.port || (isHttps ? 443 : 80),
      path: pathAndQuery,
      method: 'GET',
      agent: false,
      headers: {
        accept: 'text/event-stream',
        ...(CFG.xff && entity.ip ? { 'x-forwarded-for': entity.ip } : {}),
      },
    }, (res) => {
      recordReq(label, performance.now() - started, res.statusCode);
      if (res.statusCode !== 200) { res.resume(); scheduleRetry(); return; }
      M.sse.open++;
      M.sse.opened++;
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue; // ': ping' keep-alives
            M.sse.events++;
            try { onEvent(JSON.parse(line.slice(6))); } catch (_) {}
          }
        }
      });
      res.on('end', () => { M.sse.open--; if (!closed && isAlive()) { M.sse.drops++; scheduleRetry(); } });
      res.on('error', () => {});
    });
    req.on('error', () => {
      recordReq(label, performance.now() - started, 0, 'sse_err');
      scheduleRetry();
    });
    req.end();
  }

  function scheduleRetry() {
    if (closed || !isAlive()) return;
    retryTimer = setTimeout(connect, 2000);
  }

  connect();
  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (req) try { req.destroy(); } catch (_) {}
    },
  };
}

// ─── Auth token (mirrors server/server.js parseQuizToken) ────────────────────
function mintToken(uid) {
  if (!CFG.secret) return undefined;
  const payload = Buffer.from(JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 3 * 3600 }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', CFG.secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// phase-level wait that reacts to Ctrl-C within a second
async function phaseWait(ms) {
  const until = Date.now() + ms;
  while (!STOP && Date.now() < until) await sleep(Math.min(1000, until - Date.now()));
}
const jitter = (ms, frac = 0.1) => ms * (1 - frac + Math.random() * 2 * frac);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

let STOP = false;

// ─── Room + student actors ───────────────────────────────────────────────────
function roomIp(i) {
  // one fake "school NAT" per room; 10.77.x.y is a private range the rate
  // limiter treats as an opaque key — it never routes anywhere.
  return `10.77.${Math.floor(i / 250)}.${(i % 250) + 1}`;
}

function makeRaceConfig() {
  return {
    auto: true,
    questions: Array.from({ length: CFG.questions }, (_, i) => ({
      id: `lq${i + 1}`,
      type: 'mcq',
      timeSec: CFG.qtimeSec,
      optionCount: 4,
      correct: i % 4,
    })),
  };
}

async function createRoom(i) {
  const room = {
    i,
    ip: roomIp(i),
    agent: makeAgent(),
    token: mintToken(`loadtest-${String(i).padStart(3, '0')}`),
    code: null,
    hostSecret: null,
    status: 'waiting',
    racePodium: false,
    raceQuestions: CFG.mode === 'race' ? makeRaceConfig().questions : null,
    sse: null,
    failed: false,
  };
  const body = {
    title: `Load test ${i + 1}`,
    token: room.token,
    studentPath: '/play/loadtest',
    ...(CFG.mode === 'race' ? { race: makeRaceConfig() } : {}),
  };
  let r = await request(room, 'POST', '/session', body, '/session');
  if (r.status === 409 && r.json && r.json.error === 'active_room') {
    // leftover room from a previous run — close it via the owner token & retry
    await request(room, 'POST', '/end', { code: r.json.code, token: room.token }, '/end');
    r = await request(room, 'POST', '/session', body, '/session');
  }
  if (r.status !== 200 || !r.json || !r.json.code) {
    room.failed = true;
    log(`room ${i} creation FAILED: http ${r.status} ${r.json ? JSON.stringify(r.json) : r.error || ''}`);
    return room;
  }
  if (CFG.mode === 'race' && (!r.json.race || r.json.race.qCount !== CFG.questions)) {
    room.failed = true;
    log(`room ${i} race ack MISSING/wrong — server not v8?`);
    return room;
  }
  room.code = r.json.code;
  room.hostSecret = r.json.hostSecret;
  // teacher board: SSE /live, hostSecret in the query like the real console
  room.sse = openSse(
    room,
    `/live?code=${room.code}&hostSecret=${encodeURIComponent(room.hostSecret)}`,
    '/live(sse)',
    (ev) => {
      if (ev.type === 'ended') room.status = 'ended';
      if (ev.type === 'race' && ev.phase === 'podium') room.racePodium = true;
    },
    () => !STOP && room.status !== 'ended',
  );
  return room;
}

async function runStudent(room, idx) {
  const s = {
    id: crypto.randomUUID(),
    name: `Оқушы ${idx + 1}`,
    ip: room.ip,
    agent: makeAgent(),
  };
  const submit = (extra) =>
    request(s, 'POST', '/submit', {
      code: room.code,
      studentId: s.id,
      name: s.name,
      score: extra.score ?? 0,
      total: extra.total ?? 0,
      finished: extra.finished ?? false,
      focused: true,
      tabSwitches: 0,
      awaySeconds: 0,
      ...(extra.answers ? { answers: extra.answers } : {}),
      ...(extra.joining ? { joining: true } : {}),
    }, '/submit');

  // 1. join (registers on the teacher board, like the real page load)
  const join = await submit({ joining: true });
  if (join.status !== 200) { M.students.failed++; return; }
  M.students.joined++;
  M.students.active++;

  try {
    // 2. lobby: poll /status every 2s until the room starts (the stampede load)
    while (!STOP) {
      const r = await request(s, 'GET', `/status?code=${room.code}&studentId=${s.id}`, undefined, '/status');
      const st = r.json && r.json.status;
      if (st === 'active') break;
      if (st === 'ended' || r.status === 404) return;
      await sleep(jitter(2000));
    }
    if (STOP) return;

    if (CFG.mode === 'race') await raceLife(room, s, submit);
    else await pacedLife(room, s, submit);
    M.students.finished++;
  } finally {
    M.students.active--;
    s.agent.destroy();
  }
}

// Self-paced quiz: heartbeat every 15s; an "answer" submit every 25–45s with a
// growing score; finish in the last stretch. Runs until the room ends.
async function pacedLife(room, s, submit) {
  let score = 0;
  const total = 10;
  const answers = {};
  let finished = false;
  let nextAnswerAt = Date.now() + rand(25_000, 45_000);
  await sleep(rand(0, 15_000)); // desync heartbeats across students
  while (!STOP && room.status !== 'ended') {
    let extra = { score, total, finished, answers };
    if (!finished && Date.now() >= nextAnswerAt) {
      const qNo = Object.keys(answers).length + 1;
      const ok = Math.random() < 0.7;
      answers[`q${qNo}`] = ok ? 1 : 0;
      if (ok) score++;
      if (qNo >= total) finished = true;
      nextAnswerAt = Date.now() + rand(25_000, 45_000);
      extra = { score, total, finished, answers };
    }
    const r = await submit(extra);
    if ((r.json && r.json.status === 'ended') || r.status === 404) break;
    await sleep(jitter(15_000, 0.05));
  }
}

// Race: hold /race/stream open, answer each question at a human-ish delay,
// keep the 15s heartbeat going (the real page does both). Ends at podium.
async function raceLife(room, s, submit) {
  let done = false;
  let answerTimer = null;

  const sse = openSse(
    s,
    `/race/stream?code=${room.code}&studentId=${s.id}`,
    '/race/stream(sse)',
    (ev) => {
      if (ev.type === 'question' || (ev.type === 'state' && ev.phase === 'question')) {
        const qIndex = ev.qIndex;
        const remainingMs = Number(ev.remainingMs) || CFG.qtimeSec * 1000;
        const timeMs = (Number(ev.timeSec) || CFG.qtimeSec) * 1000;
        const openIn = Math.max(0, remainingMs - timeMs); // 3s get-ready
        if (Math.random() < 0.08) return; // some students miss the question
        const think = rand(1500, timeMs * 0.85);
        if (answerTimer) clearTimeout(answerTimer);
        answerTimer = setTimeout(async () => {
          const q = room.raceQuestions[qIndex];
          if (!q) return;
          const pick = Math.random() < 0.6
            ? q.correct
            : (q.correct + 1 + Math.floor(Math.random() * 3)) % 4;
          await request(s, 'POST', '/race/answer',
            { code: room.code, studentId: s.id, qIndex, pick }, '/race/answer');
        }, openIn + think);
      }
      if (ev.type === 'podium' || (ev.type === 'state' && ev.phase === 'podium')) done = true;
      if (ev.type === 'ended') done = true;
    },
    () => !STOP && !done && room.status !== 'ended',
  );

  await sleep(rand(0, 15_000));
  while (!STOP && !done && room.status !== 'ended') {
    const r = await submit({ score: 0, total: 0 });
    if ((r.json && r.json.status === 'ended') || r.status === 404) break;
    await sleep(jitter(15_000, 0.05));
  }
  if (answerTimer) clearTimeout(answerTimer);
  sse.close();
}

// ─── Ticker ──────────────────────────────────────────────────────────────────
function startTicker() {
  return setInterval(() => {
    const lat = M.window.lat.sort((a, b) => a - b);
    const p95 = pct(lat, 95).toFixed(0);
    const elapsed = Math.round((Date.now() - M.phaseStarted) / 1000);
    log(
      `phase=${M.phase} +${elapsed}s | students ${M.students.active} active / ${M.students.joined} joined` +
      ` | ${(M.window.n / 5).toFixed(0)} req/s, p95 ${p95}ms, ${M.window.err} errs in window` +
      ` | sse open ${M.sse.open}, drops ${M.sse.drops}`,
    );
    M.window = { n: 0, err: 0, lat: [] };
  }, 5000);
}

// ─── Report ──────────────────────────────────────────────────────────────────
function report() {
  const last = M.phaseLog[M.phaseLog.length - 1];
  if (last && !last.endedAt) last.endedAt = Date.now();

  const rows = [];
  for (const [key, b] of M.buckets.entries()) {
    const [phase, label] = key.split('|');
    const lat = b.lat.sort((x, y) => x - y);
    rows.push({
      phase, endpoint: label, requests: b.n, errors: b.err,
      p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), max: Math.round(pct(lat, 100)),
      statuses: b.statuses,
    });
  }

  console.log('\n════════ LOAD TEST REPORT ════════');
  console.log(`server: ${CFG.server}   mode: ${CFG.mode}   rooms: ${CFG.rooms} × ${CFG.students} students`);
  console.log(`students joined: ${M.students.joined}/${CFG.rooms * CFG.students}` +
    `  failed: ${M.students.failed}  completed: ${M.students.finished}`);
  console.log(`sse: ${M.sse.opened} opened, ${M.sse.drops} drops, ${M.sse.events} events\n`);
  const pad = (v, w) => String(v).padStart(w);
  console.log(`${'phase'.padEnd(10)} ${'endpoint'.padEnd(20)} ${pad('reqs', 8)} ${pad('errs', 6)} ${pad('p50', 6)} ${pad('p95', 6)} ${pad('max', 7)}  statuses`);
  for (const r of rows.sort((a, b) => a.phase.localeCompare(b.phase) || b.requests - a.requests)) {
    console.log(
      `${r.phase.padEnd(10)} ${r.endpoint.padEnd(20)} ${pad(r.requests, 8)} ${pad(r.errors, 6)}` +
      ` ${pad(r.p50, 6)} ${pad(r.p95, 6)} ${pad(r.max, 7)}  ${JSON.stringify(r.statuses)}`,
    );
  }

  const totalErr = rows.reduce((n, r) => n + r.errors, 0);
  const totalReq = rows.reduce((n, r) => n + r.requests, 0);
  const worstP95 = Math.max(0, ...rows.filter((r) => r.requests > 50).map((r) => r.p95));
  console.log(`\ntotals: ${totalReq} requests, ${totalErr} errors (${((totalErr / Math.max(1, totalReq)) * 100).toFixed(2)}%), worst busy-endpoint p95 ${worstP95}ms`);
  const verdict = totalErr / Math.max(1, totalReq) < 0.005 && worstP95 < 500
    ? 'PASS — server absorbed this load with headroom'
    : totalErr / Math.max(1, totalReq) < 0.03 && worstP95 < 1500
      ? 'MARGINAL — usable but strained; check the resource CSV before scaling further'
      : 'FAIL — students would feel this; check 429/5xx counts and the resource CSV';
  console.log(`verdict: ${verdict}\n`);

  fs.writeFileSync(CFG.out, JSON.stringify({ cfg: CFG, phases: M.phaseLog, rows, sse: M.sse, students: M.students, verdict }, null, 2));
  console.log(`full JSON: ${CFG.out}`);
}

// ─── Preflight: does per-XFF rate-limit bucketing work through nginx? ────────
async function preflight() {
  log('preflight: checking that per-room fake IPs reach the rate limiter…');
  const probeA = { ip: '10.99.0.1', agent: makeAgent() };
  const probeB = { ip: '10.99.0.2', agent: makeAgent() };
  let saw429 = false;
  M.phase = 'preflight';
  for (let batch = 0; batch < 22 && !saw429; batch++) {
    const rs = await Promise.all(
      Array.from({ length: 100 }, () => request(probeA, 'GET', '/health', undefined, '/health')),
    );
    if (rs.some((r) => r.status === 429)) saw429 = true;
  }
  if (!saw429) {
    log('probe A never hit the limit (limit raised or disabled?) — fake IPs are safe to use either way.');
    return;
  }
  const b = await request(probeB, 'GET', '/health', undefined, '/health');
  if (b.status === 200) {
    log('PASS: probe A got rate-limited, probe B (different fake IP) did not.');
    log('→ per-room fake IPs work; run the real test as planned.');
  } else {
    log(`FAIL: probe B also got ${b.status} — nginx overwrites X-Forwarded-For.`);
    log('→ for the test evening, set LIVE_RATE_LIMIT_PER_MIN=0 and LIVE_MAX_RACE_SSE_PER_IP=10000');
    log('  in the server .env, pm2 restart, and rerun with --no-xff. Restore afterwards.');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (CFG.preflight) { await preflight(); return; }

  // enough file descriptors for students×(agent+SSE) + slack?
  const ulimit = Number(spawnSync('sh', ['-c', 'ulimit -n']).stdout.toString().trim());
  const need = CFG.rooms * CFG.students * 3 + 500;
  if (Number.isFinite(ulimit) && ulimit < need) {
    console.error(`✗ open-file limit ${ulimit} is too low for ${CFG.rooms * CFG.students} students (need ~${need}).`);
    console.error(`  Run:  ulimit -n ${Math.max(10240, need)}  in this terminal first, then retry.`);
    process.exit(1);
  }
  if (CFG.secret === '' ) {
    log('note: no --secret given — only works if the server\'s /session gate is open (local dev).');
  }

  const ticker = startTicker();
  process.on('SIGINT', () => {
    log('SIGINT — stopping, ending rooms…');
    STOP = true;
  });

  // Phase 1: teachers open rooms (batched — creates are cheap but sequential
  // enough to keep the one-per-teacher scan honest).
  setPhase('create');
  const rooms = [];
  for (let i = 0; i < CFG.rooms && !STOP; i += 10) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(10, CFG.rooms - i) }, (_, j) => createRoom(i + j)),
    );
    rooms.push(...batch);
  }
  const live = rooms.filter((r) => !r.failed);
  log(`rooms open: ${live.length}/${CFG.rooms}`);
  if (!live.length) { clearInterval(ticker); report(); process.exit(1); }

  // Phase 2: the stampede — every student joins at a random moment in the ramp
  // window, then sits in the lobby polling /status every 2s.
  setPhase('join');
  const studentRuns = [];
  for (const room of live) {
    for (let k = 0; k < CFG.students; k++) {
      const delay = rand(0, CFG.rampSec * 1000);
      studentRuns.push(sleep(delay).then(() => runStudent(room, k)));
    }
  }
  await phaseWait(CFG.rampSec * 1000 + 3000);

  // Phase 3: hold everyone in the lobby (worst-case chatter).
  setPhase('lobby');
  await phaseWait(CFG.lobbySec * 1000);

  // Phase 4: all teachers press Start within ~10s of each other.
  if (!STOP) {
    setPhase('start');
    await Promise.all(live.map(async (room) => {
      await sleep(rand(0, 10_000));
      const r = await request(room, 'POST', '/start', { code: room.code, hostSecret: room.hostSecret }, '/start');
      if (r.status === 200) {
        room.status = 'active';
        if (CFG.mode === 'race') {
          await request(room, 'POST', '/race/advance',
            { code: room.code, action: 'next', hostSecret: room.hostSecret }, '/race/advance');
        }
      }
    }));
  }

  // Phase 5: the quiz itself.
  setPhase('quiz');
  if (CFG.mode === 'race') {
    // auto mode drives itself question→reveal→…→podium; wait for podium
    // everywhere (cap: full theoretical race + slack).
    const capMs = CFG.questions * (CFG.qtimeSec + 14) * 1000 + 60_000;
    const t0 = Date.now();
    while (!STOP && Date.now() - t0 < capMs && live.some((r) => !r.racePodium && r.status !== 'ended')) {
      await sleep(2000);
    }
  } else {
    await phaseWait(CFG.durationSec * 1000);
  }

  // Phase 6: teachers end their rooms.
  setPhase('end');
  await Promise.all(live.map((room) =>
    request(room, 'POST', '/end', { code: room.code, hostSecret: room.hostSecret }, '/end')
      .then(() => { room.status = 'ended'; }),
  ));
  STOP = true;
  await Promise.race([Promise.allSettled(studentRuns), sleep(20_000)]);
  for (const room of live) room.sse?.close();

  clearInterval(ticker);
  report();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
