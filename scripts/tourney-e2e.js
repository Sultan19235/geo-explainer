#!/usr/bin/env node
/**
 * Tournament mode end-to-end — docs/TOURNAMENT_MODE_SPEC.md §8.
 * Plain node, zero deps: boots server/server.js as a child process on a free
 * port (gates disabled via env — unset QUIZ_TOKEN_SECRET means the auth gate
 * is open, unset LIVE_HOST_SECRET_ENFORCED leaves the secret dormant), then
 * drives the FULL protocol over real HTTP + SSE as 1 teacher + 5 students
 * (+1 latecomer):
 *   create session (rounds ack, incl. a dropped under-40-answers round) →
 *   join ×5 → pair (bye exists for the 5th) → start → answers (correct /
 *   equivalent-form correct / wrong / lockout 429 / bad_seq 409 / replay /
 *   unknown-student 404) → settle at the deadline → lucky loser on the next
 *   draw (3 winners = odd) → kick mid-duel (force-elimination) → trio in the
 *   round-3 losers pool → champion → podium → standings, asserting every
 *   §2.6–§2.8 event/response shape along the way.
 * Rounds run their FULL clock (no manual close exists), so with the
 * sanitizer-minimum roundSec=30 the whole run takes ~2 minutes.
 * Prints one PASS/FAIL line per check; kills the child on exit; exits
 * non-zero on any failure.
 *
 *   node scripts/tourney-e2e.js
 */

'use strict';

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server', 'server.js');

// ─── Tournament config the "console" sends ──────────────────────────────────
// roundSec 20 is below the sanitizer floor of 30 → the ack proves clamping.
// Round 4 has only 2 answers (< 40) → dropped → ack must say rounds: 3.
function makeAnswers() {
  const answers = ['4', '0,5', '2π/3', '−3', '√2/2'];
  for (let i = answers.length + 1; i <= 40; i++) answers.push(String(i));
  return answers;
}
const CONFIG = {
  roundSec: 20, // → clamped to 30
  lockoutSec: 5,
  rounds: [
    { seed: 111111, answers: makeAnswers() },
    { seed: 222222, answers: makeAnswers() },
    { seed: 333333, answers: makeAnswers() },
    { seed: 999999, answers: ['1', '2'] }, // unusable → dropped
  ],
};
const ROUND_SEC = 30; // what the sanitizer must clamp roundSec to
const WRONG = '999983'; // never a key in makeAnswers()

// ─── Tiny harness ───────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('PASS ' + name);
  } else {
    failed++;
    console.log('FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}
function checkEq(name, actual, expected) {
  check(name, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(BASE + pathname, {
      method,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Minimal SSE client: parses `data: {...}` blocks, hands each event to the
// first waiting matcher or queues it (events arriving before take() are
// never lost — settle broadcasts race the test's awaits).
class SseStream {
  constructor(pathname, label) {
    this.label = label;
    this.queue = [];
    this.waiters = [];
    this.buffer = '';
    this.req = http.get(BASE + pathname, (res) => {
      this.status = res.statusCode;
      res.setEncoding('utf8');
      res.on('data', (chunk) => this._ingest(chunk));
    });
    this.req.on('error', () => {});
  }
  _ingest(chunk) {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let ev = null;
        try { ev = JSON.parse(line.slice(6)); } catch (_) {}
        if (!ev) continue;
        const at = this.waiters.findIndex((w) => w.pred(ev));
        if (at !== -1) {
          const [w] = this.waiters.splice(at, 1);
          clearTimeout(w.timer);
          w.resolve(ev);
        } else {
          this.queue.push(ev);
        }
      }
    }
  }
  take(pred, timeoutMs, what) {
    const i = this.queue.findIndex(pred);
    if (i !== -1) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      w.timer = setTimeout(() => {
        const at = this.waiters.indexOf(w);
        if (at !== -1) this.waiters.splice(at, 1);
        reject(new Error(`timeout waiting for ${what} on ${this.label}`));
      }, timeoutMs);
      this.waiters.push(w);
    });
  }
  takeType(type, timeoutMs) {
    return this.take((ev) => ev.type === type, timeoutMs, `'${type}'`);
  }
  // pairing/duel/result events all carry `round`; matching on it keeps a
  // stale queued event from an earlier round (not every student's events are
  // consumed every round) from satisfying a later round's await.
  takeRound(type, round, timeoutMs) {
    return this.take((ev) => ev.type === type && ev.round === round, timeoutMs,
      `'${type}' r${round}`);
  }
  close() {
    try { this.req.destroy(); } catch (_) {}
  }
}

// ─── Scenario state ─────────────────────────────────────────────────────────
let child = null;
let code = null;
let hostSecret = null;
const streams = new Map(); // studentId -> SseStream
const heartbeats = [];
const names = new Map();   // studentId -> display name

function answer(studentId, round, seq, given) {
  return request('POST', '/tourney/answer', { code, studentId, round, seq, given });
}
function advance(action) {
  return request('POST', '/tourney/advance', { code, hostSecret, action });
}
function keyOf(round, seq) {
  return CONFIG.rounds[round - 1].answers[seq - 1];
}
async function join(studentId, name) {
  names.set(studentId, name);
  const r = await request('POST', '/submit', { code, studentId, name, joining: true, focused: true });
  if (!r.json || r.json.ok !== true) throw new Error(`join failed for ${studentId}`);
  streams.set(studentId, new SseStream(
    `/tourney/stream?code=${code}&studentId=${studentId}`, studentId));
  heartbeats.push(setInterval(() => {
    request('POST', '/submit', { code, studentId, name, focused: true }).catch(() => {});
  }, 10000));
  return r;
}

// Answer `n` problems correctly, in strict seq order, from the given seq.
async function answerCorrect(studentId, round, fromSeq, n) {
  for (let k = 0; k < n; k++) {
    const seq = fromSeq + k;
    const r = await answer(studentId, round, seq, keyOf(round, seq));
    if (r.status !== 200 || r.json.right !== true) {
      throw new Error(`expected correct answer to land for ${studentId} r${round} seq${seq}: ` +
        `${r.status} ${JSON.stringify(r.json)}`);
    }
  }
}

async function waitOpen(duelEv) {
  // Same host, same clock — waiting on openAt directly is exact here. Real
  // phones must anchor on remainingMs instead (spec §1).
  const wait = duelEv.openAt - Date.now() + 250;
  if (wait > 0) await sleep(wait);
}

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// ─── The scenario ───────────────────────────────────────────────────────────
async function main() {
  // Boot the server with every gate open and the rate limiter off. The vars
  // are set to '' (defined!) so a stray server/.env can't re-enable a gate
  // underneath the test — the tiny loader only fills UNDEFINED vars.
  child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(PORT),
      QUIZ_TOKEN_SECRET: '',
      LIVE_HOST_SECRET_ENFORCED: '',
      LIVE_ALLOWED_ORIGINS: '',
      LIVE_RATE_LIMIT_PER_MIN: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    await sleep(100);
    try {
      const h = await request('GET', '/health');
      ready = Boolean(h.json && h.json.ok);
    } catch (_) {}
  }
  if (!ready) throw new Error('server never became healthy');

  const health = await request('GET', '/health');
  checkEq('/health reports version 9', health.json.version, 9);

  // ── Session create: mode_conflict, then the real room + rounds ack ──
  const conflict = await request('POST', '/session', {
    title: 'conflict', race: { questions: [] }, tourney: CONFIG,
  });
  checkEq('race+tourney together → 400', conflict.status, 400);
  checkEq('… with error mode_conflict', conflict.json.error, 'mode_conflict');

  const created = await request('POST', '/session', {
    title: 'Турнир e2e', studentPath: '/play/drill-e2e?tourney=1', tourney: CONFIG,
  });
  checkEq('/session accepts the tourney config', created.status, 200);
  code = created.json.code;
  hostSecret = created.json.hostSecret;
  check('/session returns code + hostSecret', Boolean(code && hostSecret));
  check('/session acks tourney', Boolean(created.json.tourney));
  checkEq('ack rounds === 3 (under-40-answers round dropped)',
    created.json.tourney && created.json.tourney.rounds, 3);

  const live = new SseStream(`/live?code=${code}&hostSecret=${hostSecret}`, 'teacher');
  const snapshot = await live.takeType('snapshot', 5000);
  check('/live snapshot carries tourney', Boolean(snapshot.tourney));
  checkEq('… phase idle before start', snapshot.tourney.phase, 'idle');
  checkEq('… roundSec clamped to 30', snapshot.tourney.roundSec, ROUND_SEC);
  check('… bracket present', Boolean(snapshot.tourney.bracket));

  const started = await request('POST', '/start', { code, hostSecret });
  checkEq('/start ok', started.json.ok, true);
  await live.takeType('started', 5000);

  const resolve = await request('GET', `/resolve?code=${code}`);
  checkEq('/resolve flags tourney rooms', resolve.json.tourney, true);

  // ── Illegal advances before anyone joined ──
  const early = await advance('start');
  checkEq("advance 'start' from idle → 409", early.status, 409);
  checkEq('… error bad_phase', early.json.error, 'bad_phase');
  const empty = await advance('pair');
  checkEq('first draw with <2 students → 409', empty.status, 409);
  checkEq('… error too_few', empty.json.error, 'too_few');
  const badAction = await advance('bogus');
  checkEq('unknown action → 400 bad_action', badAction.json.error, 'bad_action');

  // ── Five students join ──
  const S = ['stu_a', 'stu_b', 'stu_c', 'stu_d', 'stu_e'];
  const NAME = { stu_a: 'Аружан', stu_b: 'Бекзат', stu_c: 'Салтанат', stu_d: 'Дәурен', stu_e: 'Ерасыл' };
  for (const id of S) await join(id, NAME[id]);

  const idleState = await streams.get('stu_a').takeType('state', 5000);
  checkEq('connect state: phase idle', idleState.phase, 'idle');
  checkEq('connect state: role waiting before the draw', idleState.you.role, 'waiting');
  checkEq('connect state: seq starts at 1', idleState.you.seq, 1);
  checkEq('connect state: roundSec clamped', idleState.roundSec, ROUND_SEC);

  // ── Round 1: draw ──
  const paired = await advance('pair');
  checkEq("advance 'pair' ok", paired.json.ok, true);
  checkEq('… phase pairing', paired.json.phase, 'pairing');
  checkEq('… round 1', paired.json.round, 1);

  const tPair1 = await live.take((e) => e.type === 'tourney' && e.phase === 'pairing', 5000, 'teacher pairing');
  const br1 = tPair1.bracket;
  checkEq('bracket roundCount 3', br1.roundCount, 3);
  checkEq('bracket round 1', br1.round, 1);
  checkEq('bracket champion null', br1.champion, null);
  check('bracket players carry all five names',
    S.every((id) => br1.players[id] && br1.players[id].name === NAME[id]));
  checkEq('bracket history has the drawn round', br1.history.length, 1);
  const h1 = br1.history[0];
  checkEq('round 1 row unsettled', h1.settled, false);
  check('round 1 byeId exists (5 students = odd)', typeof h1.byeId === 'string');
  checkEq('round 1 luckyLoserId null', h1.luckyLoserId, null);
  checkEq('round 1: two real pairs + the bye row',
    h1.main.filter((r) => r.b !== null).length, 2);
  check('bye row rides main with b:null',
    h1.main.some((r) => r.a === h1.byeId && r.b === null));
  check('bracket standings cover all five',
    Array.isArray(br1.standings) && br1.standings.length === 5);

  // Individualized pairing events: roles + the single bye.
  const roles = {};
  for (const id of S) {
    const ev = await streams.get(id).takeRound('pairing', 1, 5000);
    checkEq(`pairing round for ${id}`, ev.round, 1);
    check(`pairing luckyLoser false for ${id}`, ev.luckyLoser === false);
    roles[id] = ev;
  }
  const byeIds = S.filter((id) => roles[id].role === 'bye');
  checkEq('exactly one bye role', byeIds.length, 1);
  checkEq('bye role matches bracket byeId', byeIds[0], h1.byeId);
  check('bye sees no opponents', roles[h1.byeId].opponents.length === 0);
  const mains1 = h1.main.filter((r) => r.b !== null);
  const [p1, p2] = mains1;
  checkEq('main players see role main', roles[p1.a].role, 'main');
  checkEq('pairing reveals the opponent name',
    roles[p1.a].opponents[0] && roles[p1.a].opponents[0].name, NAME[p1.b]);

  const status1 = await request('GET', `/status?code=${code}&studentId=stu_a`);
  check('/status carries the tourney summary', Boolean(status1.json.tourney));
  checkEq('… phase pairing', status1.json.tourney.phase, 'pairing');
  checkEq('… round seed exposed', status1.json.tourney.seed, CONFIG.rounds[0].seed);

  // ── Round 1: start + answer pipeline ──
  const startR1 = await advance('start');
  checkEq("advance 'start' ok", startR1.json.ok, true);
  const duel1 = await streams.get(p1.a).takeRound('duel', 1, 5000);
  checkEq('duel event round', duel1.round, 1);
  checkEq('duel event seed', duel1.seed, CONFIG.rounds[0].seed);
  checkEq('duel event roundSec', duel1.roundSec, ROUND_SEC);
  check('duel clocks sane', isNum(duel1.openAt) && isNum(duel1.deadline)
    && duel1.deadline - duel1.openAt === ROUND_SEC * 1000
    && duel1.remainingMs > ROUND_SEC * 1000);
  const tDuel1 = await live.take((e) => e.type === 'tourney' && e.phase === 'duel' && e.round === 1, 5000, 'teacher duel');
  check('teacher duel event carries clocks', isNum(tDuel1.remainingMs) && isNum(tDuel1.deadline));

  const preOpen = await answer(p1.a, 1, 1, keyOf(1, 1));
  checkEq('answer before openAt → 409 bad_phase', preOpen.status, 409);
  await waitOpen(duel1);

  const midStatus = await request('GET', `/status?code=${code}&studentId=stu_a`);
  check('/status mid-duel has clocks',
    midStatus.json.tourney.phase === 'duel' && isNum(midStatus.json.tourney.remainingMs));

  // p1.a: two correct — the second via an equivalent form ("1/2" vs key "0,5")
  // to prove exact-value grading, not string matching.
  const a1r1 = await answer(p1.a, 1, 1, keyOf(1, 1));
  checkEq('correct answer accepted', a1r1.status, 200);
  check('… response shape {ok,correct,wrong,right,lockRemainMs}',
    a1r1.json.ok === true && a1r1.json.correct === 1 && a1r1.json.wrong === 0
    && a1r1.json.right === true && a1r1.json.lockRemainMs === 0);
  const a1r2 = await answer(p1.a, 1, 2, '1/2');
  check('equivalent form 1/2 === 0,5', a1r2.json.right === true && a1r2.json.correct === 2);

  // Opponent sees ticks.
  const tick = await streams.get(p1.b).takeType('tick', 5000);
  check('tick names the answering opponent',
    tick.opponents.length === 1 && tick.opponents[0].name === NAME[p1.a]
    && tick.opponents[0].correct >= 1);
  const score1 = await live.takeType('tourney_score', 5000);
  check('teacher tourney_score shape',
    score1.round === 1 && typeof score1.studentId === 'string'
    && isNum(score1.correct) && isNum(score1.wrong));

  // p1.b: correct, then wrong → 5s lockout → immediate retry 429 → after the
  // freeze the next answer lands again.
  await answerCorrect(p1.b, 1, 1, 1);
  const wrong1 = await answer(p1.b, 1, 2, WRONG);
  check('wrong answer graded wrong', wrong1.json.right === false && wrong1.json.wrong === 1);
  checkEq('wrong answer arms the lockout', wrong1.json.lockRemainMs, 5000);
  const locked = await answer(p1.b, 1, 3, keyOf(1, 3));
  checkEq('answer during lockout → 429', locked.status, 429);
  check('… error locked with remainMs', locked.json.error === 'locked' && locked.json.remainMs > 0);
  await sleep(5300);
  const afterLock = await answer(p1.b, 1, 3, WRONG);
  check('lockout expires — answer accepted again',
    afterLock.status === 200 && afterLock.json.wrong === 2);

  // p2.a: seq strictness — skip, then land, then replay.
  const skip = await answer(p2.a, 1, 2, keyOf(1, 2));
  checkEq('skipped seq → 409', skip.status, 409);
  check('… error bad_seq with expect 1', skip.json.error === 'bad_seq' && skip.json.expect === 1);
  await answerCorrect(p2.a, 1, 1, 1);
  const replay = await answer(p2.a, 1, 1, keyOf(1, 1));
  checkEq('replayed seq → 409', replay.status, 409);
  check('… expect moved to 2', replay.json.error === 'bad_seq' && replay.json.expect === 2);

  // The bye still plays (score feeds totals only); p2.b stays silent (0).
  await answerCorrect(h1.byeId, 1, 1, 1);

  const ghost = await answer('ghost_1', 1, 1, keyOf(1, 1));
  checkEq('unknown studentId → 404', ghost.status, 404);
  checkEq('… error not_joined', ghost.json.error, 'not_joined');

  // /submit must ignore client-sent score in tournament rooms.
  const cheat = await request('POST', '/submit', {
    code, studentId: p2.b, name: NAME[p2.b], score: 99, total: 99, focused: true,
  });
  checkEq('cheat /submit still ok', cheat.json.ok, true);

  // Resync mid-duel: a second stream for p1.a restores the exact position.
  const resync = new SseStream(`/tourney/stream?code=${code}&studentId=${p1.a}`, 'resync');
  const rs = await resync.takeType('state', 5000);
  check('resync state: phase duel + clocks', rs.phase === 'duel' && isNum(rs.remainingMs));
  check('resync state: seq/correct restored', rs.you.correct === 2 && rs.you.seq === 3);
  checkEq('resync state: role main', rs.you.role, 'main');
  check('resync state: pair carries opponent presence',
    rs.pair && rs.pair.opponents[0].name === NAME[p1.b]
    && typeof rs.pair.opponents[0].connected === 'boolean'
    && typeof rs.pair.opponents[0].away === 'boolean');
  resync.close();

  // ── Round 1 settles on the clock ──
  const settleWait = duel1.deadline - Date.now() + 8000;
  const res1a = await streams.get(p1.a).takeRound('result', 1, settleWait);
  check('result: p1 winner', res1a.won === true && res1a.eliminated === false
    && res1a.champion === false && res1a.nextRole === 'main');
  check('result: you score', res1a.you.correct === 2 && res1a.you.wrong === 0);
  check('result: opponent line', res1a.opponents.length === 1
    && res1a.opponents[0].name === NAME[p1.b] && res1a.opponents[0].correct === 1);
  const res1b = await streams.get(p1.b).takeRound('result', 1, 8000);
  check('result: p1 loser eliminated to the losers pool',
    res1b.won === false && res1b.eliminated === true && res1b.nextRole === 'losers');
  const res2a = await streams.get(p2.a).takeRound('result', 1, 8000);
  check('result: p2 winner (1:0)', res2a.won === true && res2a.nextRole === 'main');
  const res2b = await streams.get(p2.b).takeRound('result', 1, 8000);
  check('result: silent student loses 0:1', res2b.won === false && res2b.eliminated === true);
  const resBye = await streams.get(h1.byeId).takeRound('result', 1, 8000);
  check('result: bye auto-wins with no opponents',
    resBye.won === true && resBye.eliminated === false && resBye.opponents.length === 0
    && resBye.nextRole === 'main');

  const lateAnswer = await answer(p2.b, 1, 1, keyOf(1, 1));
  checkEq('answer after settle → 409 bad_phase', lateAnswer.status, 409);

  const tRes1 = await live.take((e) => e.type === 'tourney' && e.phase === 'result' && e.round === 1, 8000, 'teacher result');
  const h1s = tRes1.bracket.history[0];
  checkEq('settled round marked settled', h1s.settled, true);
  check('settled rows carry winners', h1s.main.every((r) => typeof r.winner === 'string'));
  check('settled scores match play',
    h1s.main.find((r) => r.a === p1.a || r.b === p1.a) !== undefined);
  check('no teacher update ever carried the cheat score',
    !live.queue.some((e) => e.type === 'update' && e.score === 99));

  // ── Latecomer joins between rounds → waiting, then losers pool ──
  await join('stu_f', 'Фариза');
  const fState = await streams.get('stu_f').takeType('state', 5000);
  check('latecomer connect state: waiting in result phase',
    fState.phase === 'result' && fState.you.role === 'waiting');
  check('latecomer gets no result block', fState.result === undefined);

  // ── Round 2: lucky loser (3 winners = odd) + kick mid-duel ──
  const winners1 = [p1.a, p2.a, h1.byeId];
  const bestLoser = p1.b; // 1 correct beats p2.b's 0 on the comparator
  await advance('pair');
  const tPair2 = await live.take((e) => e.type === 'tourney' && e.phase === 'pairing' && e.round === 2, 5000, 'teacher pairing 2');
  const h2 = tPair2.bracket.history[1];
  checkEq('round 2 luckyLoserId is the best round-1 loser', h2.luckyLoserId, bestLoser);
  checkEq('round 2 has no bye (4 main candidates)', h2.byeId, null);
  checkEq('round 2: two main pairs', h2.main.filter((r) => r.b !== null).length, 2);
  checkEq('round 2: one losers pair (eliminated + latecomer)', h2.losers.length, 1);
  const lucky = await streams.get(bestLoser).takeRound('pairing', 2, 5000);
  check('lucky loser is told so', lucky.luckyLoser === true && lucky.role === 'main');
  const fPair = await streams.get('stu_f').takeRound('pairing', 2, 5000);
  checkEq('latecomer drawn into the losers pool', fPair.role, 'losers');
  check('losers row holds p2 loser + latecomer', [h2.losers[0].a, h2.losers[0].b].includes('stu_f')
    && [h2.losers[0].a, h2.losers[0].b].includes(p2.b));
  check('round 2 main = winners + lucky loser', h2.main.every((r) =>
    [r.a, r.b].every((id) => winners1.includes(id) || id === bestLoser)));

  await advance('start');
  const duel2 = await streams.get(p1.a).takeRound('duel', 2, 5000);
  checkEq('round 2 duel seed', duel2.seed, CONFIG.rounds[1].seed);
  await waitOpen(duel2);

  const [q1, q2] = h2.main;
  const kickTarget = q1.a; // leads 2:1, then gets kicked → must still lose
  const kickSurvivor = q1.b;
  await answerCorrect(kickTarget, 2, 1, 2);
  await answerCorrect(kickSurvivor, 2, 1, 1);
  const kicked = await request('POST', '/kick', { code, studentId: kickTarget, hostSecret });
  checkEq('/kick ok', kicked.json.ok, true);
  const postKick = await answer(kickTarget, 2, 3, keyOf(2, 3));
  check('kicked student cannot keep scoring',
    postKick.json.ok === false && postKick.json.kicked === true);
  await answerCorrect(q2.a, 2, 1, 1); // q2: 1:0
  const loserRow2 = h2.losers[0];
  await answerCorrect(loserRow2.a, 2, 1, 1); // losers pair: a wins 1:0

  const resKickSurvivor = await streams.get(kickSurvivor).takeRound('result', 2, duel2.deadline - Date.now() + 8000);
  check('kicked opponent force-loses despite the higher score',
    resKickSurvivor.won === true && resKickSurvivor.nextRole === 'main');
  const resKicked = await streams.get(kickTarget).takeRound('result', 2, 8000);
  check('kicked student is eliminated', resKicked.won === false && resKicked.eliminated === true);
  const resLosersA = await streams.get(loserRow2.a).takeRound('result', 2, 8000);
  check('losers-pool winner banked (standings only)', resLosersA.won === true);
  const tRes2 = await live.take((e) => e.type === 'tourney' && e.phase === 'result' && e.round === 2, 8000, 'teacher result 2');
  checkEq('kicked marked in players', tRes2.bracket.players[kickTarget].kicked, true);
  checkEq('still no champion', tRes2.bracket.champion, null);

  // ── Round 3: the final + a TRIO in the losers pool ──
  await advance('pair');
  const tPair3 = await live.take((e) => e.type === 'tourney' && e.phase === 'pairing' && e.round === 3, 5000, 'teacher pairing 3');
  const h3 = tPair3.bracket.history[2];
  checkEq('final: one main pair', h3.main.length, 1);
  check('final pair are the two survivors', h3.main[0].b !== null);
  checkEq('losers pool of 3 forms one trio', h3.losers.length, 1);
  check('trio row carries c', typeof h3.losers[0].c === 'string');
  const trio = h3.losers[0];
  const trioEv = await streams.get(trio.a).takeRound('pairing', 3, 5000);
  check('trio member sees two opponents', trioEv.role === 'losers' && trioEv.opponents.length === 2);
  const kickedPairing = await streams.get(kickTarget).takeRound('pairing', 3, 5000);
  checkEq('kicked student is drawn nowhere', kickedPairing.role, 'waiting');

  await advance('start');
  const duel3 = await streams.get(h3.main[0].a).takeRound('duel', 3, 5000);
  checkEq('round 3 duel seed', duel3.seed, CONFIG.rounds[2].seed);
  await waitOpen(duel3);

  const finalist = h3.main[0].a;
  const runnerUp = h3.main[0].b;
  await answerCorrect(finalist, 3, 1, 2);
  await answerCorrect(runnerUp, 3, 1, 1);
  await answerCorrect(trio.a, 3, 1, 1); // trio.b / trio.c stay silent

  // Presence relay: trio.c leaves mid-duel → trio.a sees it immediately.
  await request('POST', '/leave', { code, studentId: trio.c });
  const gone = await streams.get(trio.a).take(
    (e) => e.type === 'presence' && e.opponents[0] && e.opponents[0].connected === false,
    5000, 'presence(left)');
  checkEq('presence relay names the leaver', gone.opponents[0].name, names.get(trio.c));

  const resChampion = await streams.get(finalist).takeRound('result', 3, duel3.deadline - Date.now() + 8000);
  check('champion result', resChampion.won === true && resChampion.champion === true
    && resChampion.nextRole === 'champion');
  const resRunnerUp = await streams.get(runnerUp).takeRound('result', 3, 8000);
  check('runner-up result', resRunnerUp.won === false && resRunnerUp.champion === false
    && resRunnerUp.nextRole === 'waiting');
  const resTrioWin = await streams.get(trio.a).takeRound('result', 3, 8000);
  check('trio winner result (cannot crown)', resTrioWin.won === true
    && resTrioWin.champion === false && resTrioWin.opponents.length === 2);
  const tRes3 = await live.take((e) => e.type === 'tourney' && e.phase === 'result' && e.round === 3, 8000, 'teacher result 3');
  checkEq('bracket crowns the champion', tRes3.bracket.champion, finalist);

  const pairAfter = await advance('pair');
  checkEq('pair after the champion → 409', pairAfter.status, 409);
  checkEq('… error bad_phase', pairAfter.json.error, 'bad_phase');

  // ── Podium ──
  const podium = await advance('podium');
  checkEq("advance 'podium' ok", podium.json.ok, true);
  const podChampion = await streams.get(finalist).takeType('podium', 5000);
  checkEq('podium: champion name', podChampion.champion.name, names.get(finalist));
  check('podium: top ≤3 rows of {name,wins,correct}',
    podChampion.top.length === 3 && podChampion.top.every((r) =>
      typeof r.name === 'string' && isNum(r.wins) && isNum(r.correct)));
  checkEq('podium: champion tops the top', podChampion.top[0].name, names.get(finalist));
  check('podium: champion you-line', podChampion.you.rank === 1 && podChampion.you.of === 6);
  const podTrio = await streams.get(trio.a).takeType('podium', 5000);
  check('podium: consolation you-line',
    isNum(podTrio.you.rank) && podTrio.you.rank > 1 && podTrio.you.of === 6);
  const tPod = await live.take((e) => e.type === 'tourney' && e.phase === 'podium', 5000, 'teacher podium');
  const standings = tPod.bracket.standings;
  checkEq('standings rank every participant (kicked + latecomer too)', standings.length, 6);
  check('standings ranks are 1..6 with no gaps',
    standings.map((r) => r.rank).sort((a, b) => a - b).join(',') === '1,2,3,4,5,6');
  checkEq('standings champion first', standings[0].studentId, finalist);
  check('standings rows are {studentId,rank,wins,correct,wrong}',
    standings.every((r) => typeof r.studentId === 'string' && isNum(r.rank)
      && isNum(r.wins) && isNum(r.correct) && isNum(r.wrong)));
  check('standings include the kicked student',
    standings.some((r) => r.studentId === kickTarget));
  const finishedUpd = await live.take(
    (e) => e.type === 'update' && e.studentId === finalist && e.finished === true,
    5000, 'finished update');
  check('podium marks connected students finished', finishedUpd.finished === true);
  const cheatRow = standings.find((r) => r.studentId === p2.b);
  check('client-sent score:99 never leaked into standings',
    Boolean(cheatRow) && cheatRow.correct < 99);

  const finalStatus = await request('GET', `/status?code=${code}&studentId=stu_a`);
  checkEq('/status reports podium', finalStatus.json.tourney.phase, 'podium');

  live.close();
}

// ─── Run ────────────────────────────────────────────────────────────────────
const watchdog = setTimeout(() => {
  console.log('FAIL global watchdog — the scenario hung');
  cleanup();
  process.exit(1);
}, 8 * 60 * 1000);
watchdog.unref();

function cleanup() {
  for (const h of heartbeats) clearInterval(h);
  for (const s of streams.values()) s.close();
  if (child) { try { child.kill('SIGKILL'); } catch (_) {} }
}

main()
  .catch((err) => {
    failed++;
    console.log('FAIL scenario aborted — ' + (err && err.message ? err.message : err));
  })
  .finally(() => {
    cleanup();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
