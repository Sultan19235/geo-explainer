/**
 * MathSabaq Tournament — bracket engine
 *
 * Pure pairing/settling logic for tournament mode (Турнир). Spec:
 * docs/TOURNAMENT_MODE_SPEC.md §3 (normative for every shape below).
 * CommonJS, zero dependencies, zero side effects — no I/O, no Date.now, no
 * Math.random: every random choice comes from the caller-provided rng
 * (mulberry32(roundSeed)), so a whole tournament replays bit-for-bit from
 * its seeds and plain `node` test scripts (scripts/bracket-sanity.js) can
 * require this file without starting the server.
 *
 * Data shapes:
 *   roster entry: {id, name, kicked, connected, joinedAfterFirstDraw}
 *   state:        {alive: [ids], out: [ids], champion: id|null,
 *                  history: [{round, plan, outcome}], firstDrawDone: bool}
 *     — the server creates it as {alive:[], out:[], champion:null,
 *       history:[], firstDrawDone:false}; only applyOutcome produces new
 *       states (planRound/settleRound never mutate their inputs).
 *   RoundPlan:    {main: [{a, b|null}], losers: [{a, b|null, c?}],
 *                  byeId: id|null, luckyLoserId: id|null}
 *   Outcome:      {winners: [ids], eliminated: [ids], duels: [rows],
 *                  champion: id|null}
 *     — winners/eliminated cover the MAIN bracket only and partition its
 *       duelists (the bye contributes a winner and no eliminated).
 *       Losers-pool results live in `duels` rows only: standings and the
 *       +1-wins credit, never advancement.
 *   duel row:     {bracket:'main'|'losers', a, b|null, c?, winner,
 *                  scores: {id: {correct, wrong, lastCorrectAt|null}}}
 *     — scores are snapshotted (normalized) into the row so history is
 *       self-contained: the next draw's lucky-loser promotion reads the
 *       just-settled round's scores back out of it, and the server maps
 *       rows straight to the §2.7 wire shape.
 */

'use strict';

// Same generator as src/lib/drill/rng.ts mulberry32 (keep in sync) — the
// console seeds each round's problem sequence with it, and the bracket uses
// it for draw shuffles, so one 31-bit seed reproduces both.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates on the seeded stream (port of src/lib/drill/rng.ts shuffle).
// Returns a new array; draw order is part of the determinism contract.
function shuffle(rng, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// scores arrive as a Map (live server) or a plain object (tests, history);
// a student who never answered has no entry at all. Normalize to one shape —
// lastCorrectAt stays null (not Infinity) so rows survive JSON untouched.
function normScore(raw) {
  const correct = raw && Number.isFinite(raw.correct) ? raw.correct : 0;
  const wrong = raw && Number.isFinite(raw.wrong) ? raw.wrong : 0;
  const lastCorrectAt =
    raw && Number.isFinite(raw.lastCorrectAt) ? raw.lastCorrectAt : null;
  return { correct, wrong, lastCorrectAt };
}

function scoreOf(scores, id) {
  let raw;
  if (scores instanceof Map) raw = scores.get(id);
  else if (scores) raw = scores[id];
  return normScore(raw);
}

/**
 * The tiebreak comparator (winner of a duel): correct desc → wrong asc →
 * lastCorrectAt asc (the earlier finisher of the same score wins; never
 * having answered correctly counts as latest). Returns -1 when `sa` ranks
 * better, 1 when `sb` does, 0 on a full tie — the FINAL tiebreak (pair
 * position: a beats b beats c) is positional, so it lives at the call
 * sites, not here. Deterministic, never random at settle time.
 */
function compareScores(sa, sb) {
  const a = normScore(sa);
  const b = normScore(sb);
  if (a.correct !== b.correct) return a.correct > b.correct ? -1 : 1;
  if (a.wrong !== b.wrong) return a.wrong < b.wrong ? -1 : 1;
  const la = a.lastCorrectAt == null ? Infinity : a.lastCorrectAt;
  const lb = b.lastCorrectAt == null ? Infinity : b.lastCorrectAt;
  if (la !== lb) return la < lb ? -1 : 1;
  return 0;
}

// Winner of one pair/trio/solo row. Kicked members force-lose regardless of
// score; if EVERY member is kicked (degenerate — the "winner" is excluded
// from the next draw anyway) fall back to the comparator over all of them.
// Iteration keeps plan order, and strict `< 0` keeps the earlier member on
// a tie — that IS the a-beats-b-beats-c rule.
function rowWinner(members, scores, kickedSet) {
  const eligible = members.filter((id) => !kickedSet.has(id));
  const pool = eligible.length > 0 ? eligible : members;
  let best = pool[0];
  for (let i = 1; i < pool.length; i++) {
    if (compareScores(scoreOf(scores, pool[i]), scoreOf(scores, best)) < 0) {
      best = pool[i];
    }
  }
  return best;
}

function kickedSetOf(roster) {
  const set = new Set();
  for (const r of roster) if (r.kicked) set.add(r.id);
  return set;
}

/**
 * Draw a round. First draw (state.firstDrawDone false): every non-kicked
 * roster student is a main-bracket candidate — shuffle, pair sequentially,
 * odd → the LAST unpaired student is the bye ({a, b:null} row; auto-win,
 * plays solo for fun). Later draws: candidates = state.alive (previous
 * winners + bye) minus kicked; odd → promote the lucky loser (best loser of
 * the JUST-settled round by compareScores, `connected !== false` and not
 * kicked only; comparator tie → earlier appearance in that round's main
 * plan) — no eligible loser → bye, same rule as round 1. Everyone else
 * non-kicked (eliminated minus the promoted lucky loser, plus latecomers)
 * lands in the losers pool: shuffle, pair; odd pool → the last THREE form a
 * trio {a,b,c}; a 1-person pool → solo {a, b:null}.
 *
 * Disconnected students are still drawn everywhere (recovery flows exist) —
 * they are only ineligible for the lucky-loser promotion. Kicked students
 * appear in no draw at all. rng order: main shuffle first, then losers
 * shuffle (part of the determinism contract).
 */
function planRound(state, roster, rng) {
  const kicked = kickedSetOf(roster);
  const eligible = roster.filter((r) => !kicked.has(r.id));

  let mainCandidates;
  let luckyLoserId = null;
  if (!state.firstDrawDone) {
    mainCandidates = eligible.map((r) => r.id);
  } else {
    const rosterIds = new Set(eligible.map((r) => r.id));
    mainCandidates = state.alive.filter((id) => rosterIds.has(id));
    if (mainCandidates.length % 2 === 1) {
      luckyLoserId = pickLuckyLoser(state, roster, kicked);
      if (luckyLoserId != null) mainCandidates = mainCandidates.concat([luckyLoserId]);
    }
  }

  const mainSet = new Set(mainCandidates);
  const losersCandidates = state.firstDrawDone
    ? eligible.map((r) => r.id).filter((id) => !mainSet.has(id))
    : [];

  const main = [];
  let byeId = null;
  const shuffledMain = shuffle(rng, mainCandidates);
  for (let i = 0; i + 1 < shuffledMain.length; i += 2) {
    main.push({ a: shuffledMain[i], b: shuffledMain[i + 1] });
  }
  if (shuffledMain.length % 2 === 1) {
    byeId = shuffledMain[shuffledMain.length - 1];
    main.push({ a: byeId, b: null });
  }

  const losers = [];
  const pool = shuffle(rng, losersCandidates);
  if (pool.length === 1) {
    losers.push({ a: pool[0], b: null });
  } else if (pool.length > 1) {
    let end = pool.length;
    let trio = null;
    if (pool.length % 2 === 1) {
      trio = { a: pool[end - 3], b: pool[end - 2], c: pool[end - 1] };
      end -= 3;
    }
    for (let i = 0; i + 1 < end; i += 2) {
      losers.push({ a: pool[i], b: pool[i + 1] });
    }
    if (trio) losers.push(trio);
  }

  return { main, losers, byeId, luckyLoserId };
}

// Best loser of the just-settled round. Candidates = that round's main-
// bracket eliminated (NOT the whole losers pool — the freshest elimination
// earns the return). Scores come from the settled duel rows in history, so
// the promotion needs no extra bookkeeping from the server. Cross-pair
// comparator ties break by appearance order in that round's main plan
// (pair index, a before b) — deterministic, never random.
function pickLuckyLoser(state, roster, kicked) {
  const last = state.history[state.history.length - 1];
  if (!last) return null;
  const byId = new Map();
  for (const r of roster) byId.set(r.id, r);

  const scoreById = new Map();
  for (const row of last.outcome.duels) {
    for (const id of Object.keys(row.scores)) scoreById.set(id, row.scores[id]);
  }
  const planOrder = new Map();
  last.plan.main.forEach((row, i) => {
    planOrder.set(row.a, i * 2);
    if (row.b != null) planOrder.set(row.b, i * 2 + 1);
  });

  const cands = last.outcome.eliminated.filter((id) => {
    const r = byId.get(id);
    return r && !kicked.has(id) && r.connected !== false;
  });
  if (cands.length === 0) return null;
  cands.sort(
    (x, y) =>
      compareScores(scoreById.get(x), scoreById.get(y)) ||
      planOrder.get(x) - planOrder.get(y),
  );
  return cands[0];
}

/**
 * Settle a finished round from the final per-student scores (Map or plain
 * object; missing entry = never answered = zeros). Main pairs: comparator
 * winner advances, loser is eliminated; the bye row auto-wins (even a
 * kicked bye "wins" — the next draw excludes them anyway, and this keeps
 * winners.length === main.length). Kicked students force-lose regardless
 * of score. Losers-pool rows settle the same way but feed standings only.
 *
 * Champion: the round was the final — exactly one main row AND it was a
 * real duel (not a bye) — then its winner is the champion (equivalently:
 * alive would become 1). A trio/solo/losers result can never crown.
 */
function settleRound(plan, scores, roster) {
  const kicked = kickedSetOf(roster);
  const winners = [];
  const eliminated = [];
  const duels = [];

  for (const row of plan.main) {
    const members = row.b == null ? [row.a] : [row.a, row.b];
    const winner = row.b == null ? row.a : rowWinner(members, scores, kicked);
    const snap = {};
    for (const id of members) snap[id] = scoreOf(scores, id);
    duels.push({ bracket: 'main', a: row.a, b: row.b == null ? null : row.b, winner, scores: snap });
    winners.push(winner);
    for (const id of members) if (id !== winner) eliminated.push(id);
  }

  for (const row of plan.losers) {
    const members = [row.a];
    if (row.b != null) members.push(row.b);
    if (row.c != null) members.push(row.c);
    const winner = members.length === 1 ? row.a : rowWinner(members, scores, kicked);
    const snap = {};
    for (const id of members) snap[id] = scoreOf(scores, id);
    const settled = { bracket: 'losers', a: row.a, b: row.b == null ? null : row.b, winner, scores: snap };
    if (row.c != null) settled.c = row.c;
    duels.push(settled);
  }

  const champion =
    plan.main.length === 1 && plan.main[0].b != null ? winners[0] : null;

  return { winners, eliminated, duels, champion };
}

/**
 * Fold a settled round into the state (pure — returns a NEW state, inputs
 * untouched). alive = the main-bracket winners. out gains this round's
 * eliminated AND everyone who played in the losers pool (so latecomers are
 * absorbed into out after their first draw), then DROPS the winners — a
 * promoted lucky loser who won their duel is back in the main bracket and
 * must leave the pool. firstDrawDone flips here (not at plan time): the
 * engine only re-plans after a settle, so the flag is accurate whenever
 * planRound reads it.
 */
function applyOutcome(state, plan, outcome) {
  const out = new Set(state.out);
  for (const id of outcome.eliminated) out.add(id);
  for (const row of plan.losers) {
    out.add(row.a);
    if (row.b != null) out.add(row.b);
    if (row.c != null) out.add(row.c);
  }
  for (const id of outcome.winners) out.delete(id);

  return {
    alive: outcome.winners.slice(),
    out: Array.from(out),
    champion: outcome.champion != null ? outcome.champion : state.champion,
    history: state.history.concat([
      { round: state.history.length + 1, plan, outcome },
    ]),
    firstDrawDone: true,
  };
}

function totalOf(totalsById, id) {
  let raw;
  if (totalsById instanceof Map) raw = totalsById.get(id);
  else if (totalsById) raw = totalsById[id];
  return {
    wins: raw && Number.isFinite(raw.wins) ? raw.wins : 0,
    correct: raw && Number.isFinite(raw.correct) ? raw.correct : 0,
    wrong: raw && Number.isFinite(raw.wrong) ? raw.wrong : 0,
  };
}

/**
 * Final standings — a total order over EVERY roster entry (kicked and
 * latecomers included), ranks 1..N with no gaps. Champion first; then by
 * elimination round desc (later elimination = higher; still-alive players
 * who never fell count as latest of all; never-in-main players — latecomers,
 * lobby kicks — count as round 0), then wins desc, correct desc, wrong asc,
 * studentId asc (the id makes the order total and stable). totalsById is
 * the server's tournament-wide totals (Map or plain object).
 */
function finalStandings(state, totalsById, roster) {
  const elimRound = new Map();
  for (const h of state.history) {
    for (const id of h.outcome.eliminated) elimRound.set(id, h.round);
  }
  const aliveSet = new Set(state.alive);

  const rows = roster.map((r) => {
    const t = totalOf(totalsById, r.id);
    let er = elimRound.has(r.id) ? elimRound.get(r.id) : 0;
    if (aliveSet.has(r.id) || r.id === state.champion) er = Infinity;
    return { studentId: r.id, wins: t.wins, correct: t.correct, wrong: t.wrong, er };
  });

  rows.sort((x, y) => {
    const xc = x.studentId === state.champion;
    const yc = y.studentId === state.champion;
    if (xc !== yc) return xc ? -1 : 1;
    if (x.er !== y.er) return x.er > y.er ? -1 : 1; // (Infinity !== Infinity) is false — no NaN math
    if (x.wins !== y.wins) return x.wins > y.wins ? -1 : 1;
    if (x.correct !== y.correct) return x.correct > y.correct ? -1 : 1;
    if (x.wrong !== y.wrong) return x.wrong < y.wrong ? -1 : 1;
    return x.studentId < y.studentId ? -1 : 1;
  });

  return rows.map((row, i) => ({
    studentId: row.studentId,
    rank: i + 1,
    wins: row.wins,
    correct: row.correct,
    wrong: row.wrong,
  }));
}

module.exports = {
  mulberry32,
  planRound,
  settleRound,
  applyOutcome,
  finalStandings,
  compareScores,
};
