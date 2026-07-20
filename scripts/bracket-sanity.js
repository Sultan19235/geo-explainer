#!/usr/bin/env node
/**
 * Tournament bracket sanity battery — docs/TOURNAMENT_MODE_SPEC.md §8.
 * Plain node, zero deps: drives server/bracket.js through full tournaments
 * at every roster size 2–35 plus the engineered scenarios (kick mid-round,
 * disconnected lucky-loser skipped, latecomer placement, trio formation,
 * 3-student bye chain, determinism), asserting the per-round invariants on
 * EVERY round of EVERY run:
 *   - every non-kicked participant appears in exactly one pair/trio across
 *     main + losers + bye; kicked students appear nowhere;
 *   - winners ∪ eliminated partitions the main-bracket duelists;
 *   - alive shrinks strictly every settled round until the champion;
 *   - standings rank every participant exactly once, ranks 1..N, no gaps.
 * Prints one PASS/FAIL line per check; exits non-zero on any failure.
 *
 *   node scripts/bracket-sanity.js
 */

'use strict';

const path = require('path');
const {
  mulberry32,
  planRound,
  settleRound,
  applyOutcome,
  finalStandings,
  compareScores,
} = require(path.join(__dirname, '..', 'server', 'bracket.js'));

let passed = 0;
let failed = 0;

function run(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ' — ' + (e && e.message ? e.message : e));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function makeRoster(n) {
  const roster = [];
  for (let i = 1; i <= n; i++) {
    roster.push({
      id: 'stu_' + String(i).padStart(2, '0'),
      name: 'Оқушы ' + i,
      kicked: false,
      connected: true,
      joinedAfterFirstDraw: false,
    });
  }
  return roster;
}

// Per-round seeds derived from one base seed (Knuth multiplicative mix, the
// same constant the console uses per-seq) so a whole run replays from one
// number — that is what the determinism scenario compares.
function roundSeed(base, round) {
  return (base + round * 2654435761) >>> 0;
}

function planIds(plan) {
  const ids = [];
  for (const row of plan.main) {
    ids.push(row.a);
    if (row.b != null) ids.push(row.b);
  }
  for (const row of plan.losers) {
    ids.push(row.a);
    if (row.b != null) ids.push(row.b);
    if (row.c != null) ids.push(row.c);
  }
  return ids;
}

function setScore(scores, id, s) {
  if (scores instanceof Map) scores.set(id, s);
  else scores[id] = s;
}

// Default per-round scores: seeded, alternating Map/plain-object container
// (settleRound accepts both), with a 5% chance a student never answered at
// all (no entry — exercises the zero-normalization path).
function defaultScores(round, plan, rng) {
  const useMap = round % 2 === 1;
  const scores = useMap ? new Map() : {};
  for (const id of planIds(plan)) {
    if (rng() < 0.05) continue;
    setScore(scores, id, {
      correct: randInt(rng, 0, 12),
      wrong: randInt(rng, 0, 6),
      lastCorrectAt: 1000 + randInt(rng, 0, 89000),
    });
  }
  return scores;
}

// ---------------------------------------------------------------- invariants

function checkPlanInvariants(plan, drawRoster, state, round) {
  const ids = planIds(plan);
  const seen = new Set();
  for (const id of ids) {
    assert(!seen.has(id), `round ${round}: ${id} drawn twice`);
    seen.add(id);
  }
  const expected = drawRoster.filter((r) => !r.kicked).map((r) => r.id);
  assert(
    seen.size === expected.length,
    `round ${round}: drew ${seen.size} of ${expected.length} eligible students`,
  );
  for (const id of expected) assert(seen.has(id), `round ${round}: ${id} missing from the draw`);
  for (const r of drawRoster) {
    if (r.kicked) assert(!seen.has(r.id), `round ${round}: kicked ${r.id} was drawn`);
  }

  let byeRows = 0;
  plan.main.forEach((row, i) => {
    assert(row.a != null, `round ${round}: main row ${i} missing a`);
    assert(row.c == null, `round ${round}: main row ${i} has a trio slot`);
    if (row.b == null) {
      byeRows++;
      assert(i === plan.main.length - 1, `round ${round}: bye row is not last`);
      assert(plan.byeId === row.a, `round ${round}: byeId does not match the solo row`);
    }
  });
  assert(byeRows === (plan.byeId != null ? 1 : 0), `round ${round}: bye row/byeId inconsistent`);

  // losers pool: full pairs, except the LAST row may be the trio; a solo row
  // is legal only as the single row of a 1-person pool
  plan.losers.forEach((row, i) => {
    const last = i === plan.losers.length - 1;
    if (row.c != null) assert(last, `round ${round}: trio is not the last losers row`);
    if (row.b == null) {
      assert(
        plan.losers.length === 1 && row.c == null,
        `round ${round}: solo losers row inside a bigger pool`,
      );
    }
  });

  if (!state.firstDrawDone) {
    assert(plan.luckyLoserId === null, `round ${round}: lucky loser on the first draw`);
    assert(plan.losers.length === 0, `round ${round}: losers pool on the first draw`);
  } else if (plan.luckyLoserId != null) {
    const lucky = plan.luckyLoserId;
    assert(plan.byeId === null, `round ${round}: bye and lucky loser in the same draw`);
    assert(
      plan.main.some((row) => row.a === lucky || row.b === lucky),
      `round ${round}: lucky loser not drawn into main`,
    );
    const prev = state.history[state.history.length - 1];
    assert(
      prev && prev.outcome.eliminated.includes(lucky),
      `round ${round}: lucky loser not from the just-settled round`,
    );
    const r = drawRoster.find((x) => x.id === lucky);
    assert(
      r && !r.kicked && r.connected !== false,
      `round ${round}: ineligible lucky loser promoted`,
    );
  }
}

function checkOutcomeInvariants(plan, outcome, roster, round) {
  const mainIds = [];
  for (const row of plan.main) {
    mainIds.push(row.a);
    if (row.b != null) mainIds.push(row.b);
  }
  const winners = new Set(outcome.winners);
  const elim = new Set(outcome.eliminated);
  assert(outcome.winners.length === plan.main.length, `round ${round}: one winner per main row`);
  assert(winners.size === outcome.winners.length, `round ${round}: duplicate winners`);
  assert(elim.size === outcome.eliminated.length, `round ${round}: duplicate eliminated`);
  assert(
    winners.size + elim.size === mainIds.length,
    `round ${round}: winners+eliminated do not partition the duelists`,
  );
  for (const id of mainIds) {
    assert(
      winners.has(id) !== elim.has(id),
      `round ${round}: ${id} must be exactly one of winner/eliminated`,
    );
  }

  assert(
    outcome.duels.length === plan.main.length + plan.losers.length,
    `round ${round}: settled row count diverges from the plan`,
  );
  const kicked = new Set(roster.filter((r) => r.kicked).map((r) => r.id));
  outcome.duels.forEach((row, i) => {
    const members = [row.a];
    if (row.b != null) members.push(row.b);
    if (row.c != null) members.push(row.c);
    assert(members.includes(row.winner), `round ${round}: winner outside settled row ${i}`);
    for (const id of members) {
      const s = row.scores[id];
      assert(
        s && Number.isFinite(s.correct) && Number.isFinite(s.wrong),
        `round ${round}: missing score snapshot for ${id}`,
      );
    }
    // kicked force-lose: a kicked winner is legal only when EVERY member is kicked
    if (kicked.has(row.winner)) {
      assert(
        members.every((id) => kicked.has(id)),
        `round ${round}: kicked ${row.winner} won over a non-kicked opponent`,
      );
    }
    const planRow = i < plan.main.length ? plan.main[i] : plan.losers[i - plan.main.length];
    assert(
      row.a === planRow.a && row.b === (planRow.b == null ? null : planRow.b),
      `round ${round}: settled row ${i} diverges from the plan`,
    );
    assert(
      row.bracket === (i < plan.main.length ? 'main' : 'losers'),
      `round ${round}: wrong bracket label on row ${i}`,
    );
  });

  const isFinal = plan.main.length === 1 && plan.main[0].b != null;
  if (isFinal) {
    assert(outcome.champion === outcome.winners[0], `round ${round}: the final must crown its winner`);
  } else {
    assert(outcome.champion === null, `round ${round}: champion outside the final`);
  }
}

function checkStandings(standings, roster, state) {
  assert(
    standings.length === roster.length,
    `standings rank ${standings.length} of ${roster.length} participants`,
  );
  const seen = new Set();
  standings.forEach((row, i) => {
    assert(row.rank === i + 1, `standings rank gap at index ${i}`);
    assert(!seen.has(row.studentId), `duplicate standings row for ${row.studentId}`);
    seen.add(row.studentId);
    assert(
      Number.isFinite(row.wins) && Number.isFinite(row.correct) && Number.isFinite(row.wrong),
      `non-numeric standings row for ${row.studentId}`,
    );
  });
  for (const r of roster) assert(seen.has(r.id), `${r.id} missing from standings`);
  if (state.champion != null) {
    assert(standings[0].studentId === state.champion, 'champion must be rank 1');
  }
}

// Mirrors server §2.4 step 3: every settled row adds its members' round
// scores; +1 wins per row winner (bye and losers solo included).
function buildTotals(log) {
  const totals = new Map();
  const get = (id) => {
    let t = totals.get(id);
    if (!t) {
      t = { correct: 0, wrong: 0, wins: 0 };
      totals.set(id, t);
    }
    return t;
  };
  for (const entry of log) {
    for (const row of entry.outcome.duels) {
      for (const id of Object.keys(row.scores)) {
        const t = get(id);
        t.correct += row.scores[id].correct;
        t.wrong += row.scores[id].wrong;
      }
      get(row.winner).wins += 1;
    }
  }
  return totals;
}

// ------------------------------------------------------------------- driver

// Runs a full tournament to the champion, checking every invariant on every
// round. Hooks let scenarios mutate the roster mid-flight (kicks, presence,
// latecomers) exactly where the live server would.
function driveTournament(opts) {
  const roster = opts.roster || makeRoster(opts.n);
  const baseSeed = opts.baseSeed;
  const maxRounds = opts.maxRounds || 40;
  let state = { alive: [], out: [], champion: null, history: [], firstDrawDone: false };
  const log = [];
  let round = 0;

  while (state.champion == null) {
    round++;
    assert(round <= maxRounds, `no champion after ${maxRounds} rounds`);
    if (opts.beforeDraw) opts.beforeDraw(round, state, roster);
    const drawRoster = roster.map((r) => ({ id: r.id, kicked: !!r.kicked, connected: r.connected }));
    const prevAlive = state.firstDrawDone ? state.alive.length : null;

    const plan = planRound(state, roster, mulberry32(roundSeed(baseSeed, round)));
    checkPlanInvariants(plan, drawRoster, state, round);
    if (opts.afterDraw) opts.afterDraw(round, plan, roster, state);
    if (opts.beforeSettle) opts.beforeSettle(round, plan, roster);

    const scoreRng = mulberry32(roundSeed((baseSeed ^ 0x9e3779b9) >>> 0, round));
    const scores = (opts.scoresFor || defaultScores)(round, plan, scoreRng);
    const outcome = settleRound(plan, scores, roster);
    checkOutcomeInvariants(plan, outcome, roster, round);

    const next = applyOutcome(state, plan, outcome);
    if (prevAlive != null && prevAlive >= 2) {
      assert(
        next.alive.length < prevAlive,
        `round ${round}: alive did not shrink (${prevAlive} -> ${next.alive.length})`,
      );
    }
    assert(next.alive.length >= 1, `round ${round}: alive dropped to zero`);
    log.push({ round, plan, outcome });
    if (opts.checkRound) opts.checkRound(round, plan, outcome, next, roster);
    state = next;
  }

  assert(
    state.alive.length === 1 && state.alive[0] === state.champion,
    'champion must be the sole alive survivor',
  );
  const totals = buildTotals(log);
  const standings = finalStandings(state, totals, roster);
  checkStandings(standings, roster, state);
  return { state, roster, log, standings, rounds: round, totals };
}

// ---------------------------------------------------------------- scenarios

run('mulberry32 determinism + range', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const c = mulberry32(43);
  let diverged = false;
  for (let i = 0; i < 16; i++) {
    const va = a();
    assert(va === b(), 'same seed must produce the same stream');
    assert(va >= 0 && va < 1, 'values must lie in [0, 1)');
    if (va !== c()) diverged = true;
  }
  assert(diverged, 'different seeds must diverge');
});

run('compareScores comparator', () => {
  const cs = compareScores;
  assert(cs({ correct: 5, wrong: 9, lastCorrectAt: 99 }, { correct: 4, wrong: 0, lastCorrectAt: 1 }) === -1, 'correct desc first');
  assert(cs({ correct: 4, wrong: 0, lastCorrectAt: 1 }, { correct: 5, wrong: 9, lastCorrectAt: 99 }) === 1, 'correct desc (flipped)');
  assert(cs({ correct: 5, wrong: 1, lastCorrectAt: 99 }, { correct: 5, wrong: 2, lastCorrectAt: 1 }) === -1, 'wrong asc second');
  assert(cs({ correct: 5, wrong: 1, lastCorrectAt: 10 }, { correct: 5, wrong: 1, lastCorrectAt: 20 }) === -1, 'earlier lastCorrectAt wins');
  assert(cs({ correct: 5, wrong: 1, lastCorrectAt: 10 }, { correct: 5, wrong: 1, lastCorrectAt: null }) === -1, 'never-correct counts as latest');
  assert(cs({ correct: 5, wrong: 1, lastCorrectAt: null }, { correct: 5, wrong: 1, lastCorrectAt: null }) === 0, 'full tie → 0 (position decides at the call site)');
  assert(cs({}, { correct: 0, wrong: 0 }) === 0, 'missing fields normalize to zero');
  assert(cs(undefined, { correct: 1, wrong: 0, lastCorrectAt: 5 }) === 1, 'missing score loses to a real one');
});

// every roster size 2..35 driven to the champion; with lucky-loser/bye
// top-ups a clean run always finishes in exactly ceil(log2 N) rounds
for (let n = 2; n <= 35; n++) {
  run(`roster ${n} → champion, invariants hold`, () => {
    const res = driveTournament({ n, baseSeed: 1000 + n });
    const expect = Math.ceil(Math.log2(n));
    assert(
      res.rounds === expect,
      `champion after ${res.rounds} rounds, expected ceil(log2 ${n}) = ${expect}`,
    );
  });
}

run('determinism: same seeds twice → deep-equal brackets', () => {
  for (const n of [2, 5, 13, 27, 35]) {
    const a = driveTournament({ n, baseSeed: 5000 + n });
    const b = driveTournament({ n, baseSeed: 5000 + n });
    assert(
      JSON.stringify({ log: a.log, standings: a.standings }) ===
        JSON.stringify({ log: b.log, standings: b.standings }),
      `n=${n}: replayed bracket diverged`,
    );
    const c = driveTournament({ n, baseSeed: 6000 + n });
    assert(
      JSON.stringify(a.log) !== JSON.stringify(c.log),
      `n=${n}: different seeds produced identical brackets (suspicious)`,
    );
  }
});

run('kicked mid-round: force-lose + excluded from later draws', () => {
  let kickedId = null;
  let opponentId = null;
  const res = driveTournament({
    n: 8,
    baseSeed: 4242,
    afterDraw(round, plan) {
      if (round === 1) {
        kickedId = plan.main[0].a;
        opponentId = plan.main[0].b;
      }
    },
    beforeSettle(round, plan, roster) {
      if (round === 1) roster.find((r) => r.id === kickedId).kicked = true;
    },
    scoresFor(round, plan, rng) {
      const scores = defaultScores(round, plan, rng);
      if (round === 1) {
        // crushing score for the kicked student — force-lose must beat it
        setScore(scores, kickedId, { correct: 99, wrong: 0, lastCorrectAt: 1 });
        setScore(scores, opponentId, { correct: 1, wrong: 5, lastCorrectAt: 50000 });
      }
      return scores;
    },
    checkRound(round, plan, outcome) {
      if (round === 1) {
        const row = outcome.duels.find((r) => r.a === kickedId || r.b === kickedId);
        assert(row.winner === opponentId, 'kicked student must force-lose');
        assert(outcome.eliminated.includes(kickedId), 'kicked student must be eliminated');
      } else {
        assert(!planIds(plan).includes(kickedId), 'kicked student drawn after the kick');
      }
    },
  });
  assert(res.state.champion !== kickedId, 'kicked student became champion');
  assert(res.rounds === 3, `n=8 with a kicked finalist should still take 3 rounds, took ${res.rounds}`);
  assert(res.standings.some((row) => row.studentId === kickedId), 'kicked student missing from standings');
});

run('kicked in the losers pool mid-round: force-lose there too', () => {
  let poolKick = null;
  let poolOpp = null;
  driveTournament({
    n: 8,
    baseSeed: 8888,
    afterDraw(round, plan) {
      if (round === 2) {
        assert(plan.losers.length === 2 && plan.losers[0].b != null, 'n=8 round 2 pool should be two pairs');
        poolKick = plan.losers[0].a;
        poolOpp = plan.losers[0].b;
      }
    },
    beforeSettle(round, plan, roster) {
      if (round === 2) roster.find((r) => r.id === poolKick).kicked = true;
    },
    scoresFor(round, plan, rng) {
      const scores = defaultScores(round, plan, rng);
      if (round === 2) {
        setScore(scores, poolKick, { correct: 99, wrong: 0, lastCorrectAt: 1 });
        setScore(scores, poolOpp, { correct: 0, wrong: 6, lastCorrectAt: null });
      }
      return scores;
    },
    checkRound(round, plan, outcome) {
      if (round === 2) {
        const row = outcome.duels.find((r) => r.bracket === 'losers' && (r.a === poolKick || r.b === poolKick));
        assert(row.winner === poolOpp, 'kicked losers-pool student must force-lose');
      }
      if (round === 3) {
        assert(!planIds(plan).includes(poolKick), 'kicked pool student drawn after the kick');
        // remaining pool of 5 → one pair + the trailing trio
        assert(
          plan.losers.length === 2 && plan.losers[0].c == null && plan.losers[1].c != null,
          'pool of 5 should settle as pair + trio',
        );
      }
    },
  });
});

run('disconnected lucky-loser candidate skipped', () => {
  const roster = makeRoster(5);
  let state = { alive: [], out: [], champion: null, history: [], firstDrawDone: false };
  const plan1 = planRound(state, roster, mulberry32(111));
  checkPlanInvariants(plan1, roster, state, 1);
  assert(plan1.byeId != null && plan1.main.length === 3, 'n=5 first draw = 2 pairs + bye');

  // engineered scores: each pair's `a` wins; pair-0 loser outranks pair-1 loser
  const best = plan1.main[0].b;
  const second = plan1.main[1].b;
  const scores = {};
  scores[plan1.main[0].a] = { correct: 10, wrong: 0, lastCorrectAt: 10 };
  scores[best] = { correct: 8, wrong: 1, lastCorrectAt: 20 };
  scores[plan1.main[1].a] = { correct: 9, wrong: 0, lastCorrectAt: 15 };
  scores[second] = { correct: 5, wrong: 2, lastCorrectAt: 30 };
  scores[plan1.byeId] = { correct: 3, wrong: 3, lastCorrectAt: 40 };
  const out1 = settleRound(plan1, scores, roster);
  checkOutcomeInvariants(plan1, out1, roster, 1);
  state = applyOutcome(state, plan1, out1);

  // all connected → the best loser returns
  const planA = planRound(state, roster, mulberry32(222));
  checkPlanInvariants(planA, roster, state, 2);
  assert(planA.luckyLoserId === best, 'best loser must be promoted when connected');

  // best loser disconnected → next-best returns; the skipped one is still
  // DRAWN (losers pool) — disconnection only blocks the promotion
  roster.find((r) => r.id === best).connected = false;
  const planB = planRound(state, roster, mulberry32(222));
  checkPlanInvariants(planB, roster, state, 2);
  assert(planB.luckyLoserId === second, 'disconnected candidate must be skipped');
  assert(planIds(planB).includes(best), 'disconnected student must still be drawn');
  assert(!planB.main.some((row) => row.a === best || row.b === best), 'skipped student must not be in main');

  // every loser disconnected → no promotion, bye instead (round-1 rule)
  roster.find((r) => r.id === second).connected = false;
  const planC = planRound(state, roster, mulberry32(222));
  checkPlanInvariants(planC, roster, state, 2);
  assert(planC.luckyLoserId === null && planC.byeId != null, 'no eligible loser → bye');
  assert(planIds(planC).includes(best) && planIds(planC).includes(second), 'disconnected students still drawn');
});

run('latecomer: losers pool only, never champion, ranked below the bracket', () => {
  const lateId = 'stu_late';
  const res = driveTournament({
    n: 6,
    baseSeed: 777,
    beforeDraw(round, state, roster) {
      if (round === 2) {
        roster.push({ id: lateId, name: 'Кешіккен', kicked: false, connected: true, joinedAfterFirstDraw: true });
      }
    },
    checkRound(round, plan) {
      if (round >= 2) {
        assert(!plan.main.some((r) => r.a === lateId || r.b === lateId), 'latecomer drawn into main');
        assert(planIds(plan).includes(lateId), 'latecomer missing from the losers pool');
      }
    },
  });
  assert(res.state.champion !== lateId, 'latecomer became champion');
  assert(res.rounds === 3, `latecomer must not stretch the bracket (took ${res.rounds})`);
  assert(res.standings.length === 7, 'latecomer missing from standings');
  assert(
    res.standings[res.standings.length - 1].studentId === lateId,
    'latecomer (elimination round 0) must rank below every main-bracket player',
  );
});

run('trio formation + full-tie position rule (a beats b beats c)', () => {
  let trioRow = null;
  const res = driveTournament({
    n: 7,
    baseSeed: 999,
    afterDraw(round, plan) {
      if (round === 2) {
        assert(plan.losers.length === 1, 'pool of 3 must form a single trio');
        trioRow = plan.losers[0];
        assert(trioRow.b != null && trioRow.c != null, 'trio must carry three members');
      }
      if (round === 3) {
        assert(
          plan.losers.length === 2 && plan.losers[0].c == null && plan.losers[1].c != null,
          'pool of 5 must be pair + trailing trio',
        );
      }
    },
    scoresFor(round, plan, rng) {
      const scores = defaultScores(round, plan, rng);
      if (round === 2 && trioRow) {
        for (const id of [trioRow.a, trioRow.b, trioRow.c]) {
          setScore(scores, id, { correct: 4, wrong: 1, lastCorrectAt: 5000 });
        }
      }
      return scores;
    },
    checkRound(round, plan, outcome) {
      if (round === 2) {
        const row = outcome.duels.find((r) => r.bracket === 'losers' && r.c != null);
        assert(row && row.winner === trioRow.a, 'identical trio scores → position a must win');
      }
    },
  });
  assert(res.rounds === 3, `n=7 should take 3 rounds, took ${res.rounds}`);
});

run('3-student bye chain: bye → final in 2 rounds, bye counts as a win', () => {
  const res = driveTournament({
    n: 3,
    baseSeed: 314,
    checkRound(round, plan, outcome) {
      if (round === 1) {
        assert(plan.byeId != null && plan.main.length === 2 && plan.main[1].b === null, 'first draw = pair + bye');
        const byeRow = outcome.duels.find((r) => r.bracket === 'main' && r.b === null);
        assert(byeRow.winner === plan.byeId, 'bye must auto-win');
        assert(outcome.winners.includes(plan.byeId), 'bye must advance');
        assert(outcome.eliminated.length === 1, 'only the duel loser is eliminated');
      }
      if (round === 2) {
        assert(plan.main.length === 1 && plan.main[0].b != null, 'round 2 must be the final');
        assert(plan.losers.length === 1 && plan.losers[0].b === null, '1-person pool → solo row');
        assert(outcome.champion != null, 'final must crown the champion');
      }
    },
  });
  assert(res.rounds === 2, `3 students must resolve in 2 rounds, took ${res.rounds}`);
  const byeId = res.log[0].plan.byeId;
  assert(res.totals.get(byeId).wins >= 1, 'bye must count as a win in totals');
});

run('lucky loser returns, rejoins main and can win it all', () => {
  let luckyId = null;
  const res = driveTournament({
    n: 5,
    baseSeed: 2026,
    afterDraw(round, plan) {
      if (round === 2) {
        assert(plan.luckyLoserId != null, 'n=5 round 2 must promote a lucky loser');
        luckyId = plan.luckyLoserId;
      }
    },
    scoresFor(round, plan, rng) {
      const scores = defaultScores(round, plan, rng);
      if (round >= 2 && luckyId) {
        setScore(scores, luckyId, { correct: 99, wrong: 0, lastCorrectAt: 1 });
      }
      return scores;
    },
    checkRound(round, plan, outcome, next) {
      if (round === 2) {
        assert(next.alive.includes(luckyId), 'winning lucky loser must rejoin the main bracket');
        assert(!next.out.includes(luckyId), 'winning lucky loser must leave the losers pool');
      }
    },
  });
  assert(res.rounds === 3, `n=5 should take 3 rounds, took ${res.rounds}`);
  assert(res.state.champion === luckyId, 'a returned lucky loser CAN become champion');
  assert(res.standings[0].studentId === luckyId && res.standings[0].rank === 1, 'champion must top the standings');
});

run('lobby-kicked student: never drawn, still ranked', () => {
  const roster = makeRoster(4);
  roster[3].kicked = true; // kicked before the first draw — appears in no round
  const res = driveTournament({ baseSeed: 555, roster });
  assert(res.rounds === 2, `3 effective students must resolve in 2 rounds, took ${res.rounds}`);
  for (const entry of res.log) {
    assert(!planIds(entry.plan).includes(roster[3].id), 'lobby-kicked student was drawn');
  }
  assert(res.standings.length === 4, 'kicked student missing from standings');
  assert(
    res.standings[res.standings.length - 1].studentId === roster[3].id,
    'never-drawn kicked student must rank last',
  );
});

run('FIFA lineage: later draws pair previous winners in pair order', () => {
  // 16 students → 8/4/2/1 pairs, no odd cases: every post-round-1 draw must
  // be exactly (winner of pair 0 vs winner of pair 1), (2 vs 3), … — the one
  // random жеребе is round 1.
  const res = driveTournament({ baseSeed: 4242, n: 16 });
  assert(res.rounds === 4, `16 students must resolve in 4 rounds, took ${res.rounds}`);
  for (let i = 1; i < res.log.length; i++) {
    const prevWinners = res.log[i - 1].outcome.winners;
    const main = res.log[i].plan.main;
    main.forEach((row, p) => {
      assert(
        row.a === prevWinners[2 * p] && row.b === prevWinners[2 * p + 1],
        `round ${i + 1} pair ${p} broke lineage: got (${row.a}, ${row.b}), ` +
          `expected (${prevWinners[2 * p]}, ${prevWinners[2 * p + 1]})`,
      );
    });
  }
});

run('FIFA lineage: lucky loser appended last, bye falls to the last winner', () => {
  // 10 students → 5 pairs → 5 winners (odd): the lucky loser must pair with
  // the LAST leftover winner, everyone else keeps strict pair order.
  const res = driveTournament({ baseSeed: 777, n: 10 });
  const r2 = res.log[1];
  const prevWinners = res.log[0].outcome.winners;
  if (r2.plan.luckyLoserId != null) {
    const last = r2.plan.main[r2.plan.main.length - 1];
    assert(
      last.b === r2.plan.luckyLoserId && last.a === prevWinners[prevWinners.length - 1],
      'lucky loser must pair with the leftover last winner',
    );
  } else {
    assert(
      r2.plan.byeId === prevWinners[prevWinners.length - 1],
      'with no eligible loser the bye must fall to the last winner',
    );
  }
  r2.plan.main.forEach((row, p) => {
    if (2 * p < prevWinners.length) {
      assert(row.a === prevWinners[2 * p], `round 2 pair ${p} slot a broke lineage`);
    }
  });
});

console.log('');
if (failed === 0) {
  console.log(`All green — ${passed} checks passed.`);
  process.exit(0);
} else {
  console.log(`${failed} of ${passed + failed} checks FAILED.`);
  process.exit(1);
}
