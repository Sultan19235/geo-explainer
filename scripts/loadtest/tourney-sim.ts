/**
 * Tournament-mode student simulator — watch a full Турнир with fake pupils.
 *
 * You open a «Турнир» room on the site as usual (projector board and all),
 * then run this with the room code. N robot students join, and they really
 * SOLVE the problems: each bot regenerates the round's sequence from the
 * server's seed with the same drill generator the phones use, so scores,
 * duels, winners and the bracket are all genuine — just without 30 kids.
 *
 * Each bot gets its own personality: a thinking speed and an accuracy, drawn
 * from a seeded spread, so duels are decided by real skill differences and
 * the standings look like a real class. A couple of bots also wander off
 * mid-duel (phone in pocket) so the away badges get exercised.
 *
 * Usage (live site):
 *   npx tsx scripts/loadtest/tourney-sim.ts --code ABC123
 *   npx tsx scripts/loadtest/tourney-sim.ts --code ABC123 --students 30
 *
 * Usage (local dev server on :3001):
 *   npx tsx scripts/loadtest/tourney-sim.ts --code ABC123 \
 *     --server http://localhost:3001 --site http://localhost:3000
 *
 * Options:
 *   --code XXXXXX        room code from the console (required)
 *   --students 30        how many bots (default 30)
 *   --server URL         quiz backend (default https://mathsabaq.online)
 *   --site URL           the website, used to auto-detect the drill topic
 *                        (default https://matem.school)
 *   --topic <id>         skip auto-detection and name the drill topic
 *   --generator-file P   uploaded-generator quizzes: the local .js file
 *   --flaky N            how many bots wander off mid-duel (default 2)
 *   --seed N             reproducible personalities (default random)
 *   --quiet              only per-round summaries, no per-answer noise
 *
 * Stop any time with Ctrl-C — every bot sends its leave beacon on the way
 * out, exactly like closing a phone.
 */

import { DRILL_TOPICS, getDrillTopic } from "../../src/lib/drill/registry";
import {
  decodeDrillConfig,
  type DrillConfig,
  type DrillProblem,
  type DrillTopic,
} from "../../src/lib/drill/types";
import { mulberry32, type Rng } from "../../src/lib/drill/rng";
import { toPlain } from "../../src/lib/drill/exact";
import {
  evaluateDrillTopicCode,
  type EvaluatedTopic,
} from "../../src/lib/drill/topic-schema";
import { readFile } from "node:fs/promises";

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function flag(name: string, fallback = ""): string {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
}
const has = (name: string) => argv.includes(`--${name}`);

const OPT = {
  code: flag("code").toUpperCase(),
  students: Number(flag("students", "30")),
  server: flag("server", "https://mathsabaq.online").replace(/\/+$/, ""),
  site: flag("site", "https://matem.school").replace(/\/+$/, ""),
  topic: flag("topic"),
  generatorFile: flag("generator-file"),
  flaky: Number(flag("flaky", "2")),
  seed: Number(flag("seed", String((Math.random() * 2 ** 31) | 0))),
  quiet: has("quiet"),
};

if (!OPT.code || OPT.code.length < 4) {
  console.error(
    "Need a room code: npx tsx scripts/loadtest/tourney-sim.ts --code ABC123",
  );
  process.exit(1);
}

// ─── Names (a believable Kazakh classroom) ──────────────────────────────────

const NAMES = [
  "Аружан", "Ерасыл", "Айгерім", "Нұрсұлтан", "Аяулым", "Дінмұхаммед",
  "Мадина", "Алихан", "Ақбота", "Санжар", "Жансая", "Дамир",
  "Аружан Б.", "Ержан", "Диана", "Арсен", "Камила", "Тимур",
  "Дана", "Бекзат", "Сабина", "Ислам", "Айша", "Рамазан",
  "Зере", "Асылан", "Малика", "Нұрислам", "Томирис", "Даниал",
  "Инжу", "Абылай", "Ұлжан", "Мирас", "Асель", "Ерлан",
];

// ─── Small helpers ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

// The wire shapes this script reads (spec §2.5–§2.6). Deliberately loose and
// all-optional: the sim must survive a server that omits a field, never
// throw mid-tournament.
type Opp = { id?: string; name: string; correct?: number };
type AnswerRes = {
  ok?: boolean;
  right?: boolean;
  correct?: number;
  wrong?: number;
  lockRemainMs?: number;
  error?: string;
  expect?: number;
  remainMs?: number;
  status?: string;
};
type TourneyEvent = {
  type: string;
  phase?: string;
  round?: number;
  role?: string;
  seed?: number;
  openAt?: number;
  deadline?: number;
  won?: boolean;
  eliminated?: boolean;
  opponents?: Opp[];
  pair?: { opponents?: Opp[] };
  you?: {
    seq?: number;
    correct?: number;
    wrong?: number;
    wins?: number;
  };
};

function post<T = AnswerRes>(
  path: string,
  body: unknown,
): Promise<{ status: number; json: T | null }> {
  return fetch(`${OPT.server}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (r) => ({
      status: r.status,
      json: (await r.json().catch(() => null)) as T | null,
    }))
    .catch(() => ({ status: 0, json: null }));
}

/** Normal-ish number in [lo, hi] (sum of two uniforms — no long tails). */
function spread(rng: Rng, lo: number, hi: number): number {
  return lo + ((rng() + rng()) / 2) * (hi - lo);
}

// ─── Problem source: the same generator the phones run ──────────────────────

type Source = {
  label: string;
  /** The problem at position `seq` (1-based) of the round's seeded stream. */
  at: (seed: number, seq: number) => DrillProblem;
};

async function buildSource(config: DrillConfig): Promise<Source> {
  // Uploaded .js generator: evaluate the file the same way the sandbox
  // worker does (pure code, no DOM needed) and drive it per seq.
  if (OPT.generatorFile) {
    const code = await readFile(OPT.generatorFile, "utf8");
    const res = evaluateDrillTopicCode(code);
    if (!("topic" in res)) {
      console.error("Generator file rejected:\n  " + res.errors.join("\n  "));
      process.exit(1);
    }
    const ev: EvaluatedTopic = res.topic;
    return {
      label: `${ev.meta.id} (uploaded file)`,
      at: (seed, seq) =>
        ev.generate(mulberry32((seed + seq * 2654435761) >>> 0), config),
    };
  }

  const topic: DrillTopic | null = getDrillTopic(OPT.topic) ?? null;
  if (!topic) {
    console.error(
      `Unknown drill topic "${OPT.topic}". Known: ${DRILL_TOPICS.map((t) => t.id).join(", ")}`,
    );
    process.exit(1);
  }
  return {
    label: topic.id,
    at: (seed, seq) =>
      topic.generate(mulberry32((seed + seq * 2654435761) >>> 0), config),
  };
}

/** A wrong-but-typeable answer: nudge one digit so it still parses. */
function wrongAnswer(correct: string): string {
  const m = correct.match(/\d(?!.*\d)/); // last digit
  if (!m || m.index === undefined) return "1";
  const bumped = String((Number(m[0]) + 1) % 10);
  const out =
    correct.slice(0, m.index) + bumped + correct.slice(m.index + 1);
  return out === correct ? correct + "1" : out;
}

// ─── One robot student ──────────────────────────────────────────────────────

type BotState = {
  name: string;
  studentId: string;
  speedMs: number; // average thinking time per problem
  accuracy: number; // chance of answering correctly
  flaky: boolean;
  // live
  round: number;
  seq: number;
  correct: number;
  wrong: number;
  role: string;
  opponents: { name: string; correct?: number }[];
  wins: number;
  away: boolean;
  alive: boolean;
  // The server's verdict for the round just settled, captured verbatim from
  // the result event: a duel can be won on the tiebreak (fewer wrong) at
  // equal score, and the LIVE counters are reset by the next draw — so the
  // round table must read this frozen snapshot, never the live state.
  lastResult: {
    round: number;
    won: boolean;
    correct: number;
    opponents: { name: string; correct: number }[];
  } | null;
};

class Bot {
  st: BotState;
  /** Read by the terminal narrator to spot phase changes. */
  phase = "idle";
  private src: Source;
  private config: DrillConfig;
  private seed: number | null = null;
  private deadline = 0;
  private openAt = 0;
  private lockedUntil = 0;
  private rng: Rng;
  private stop = false;

  constructor(
    st: BotState,
    src: Source,
    config: DrillConfig,
    rng: Rng,
  ) {
    this.st = st;
    this.src = src;
    this.config = config;
    this.rng = rng;
  }

  async join(): Promise<boolean> {
    const r = await post("/submit", {
      code: OPT.code,
      studentId: this.st.studentId,
      name: this.st.name,
      score: 0,
      total: 0,
      finished: false,
      focused: true,
      tabSwitches: 0,
      awaySeconds: 0,
      joining: true,
    });
    return r.status === 200 && r.json?.status !== "not_found";
  }

  /** Heartbeat like a real phone (15s), so presence/away work on the board. */
  startHeartbeat() {
    const tick = async () => {
      while (!this.stop) {
        await sleep(15_000);
        if (this.stop) break;
        if (this.st.away) continue; // pocketed phone: nothing reaches the server
        await post("/submit", {
          code: OPT.code,
          studentId: this.st.studentId,
          name: this.st.name,
          score: 0,
          total: 0,
          finished: false,
          focused: true,
          tabSwitches: 0,
          awaySeconds: 0,
        });
      }
    };
    void tick();
  }

  /** The tournament SSE stream — same one the phones open. */
  async openStream() {
    while (!this.stop) {
      try {
        const res = await fetch(
          `${OPT.server}/tourney/stream?code=${OPT.code}&studentId=${this.st.studentId}`,
          { headers: { Accept: "text/event-stream" } },
        );
        if (!res.body) throw new Error("no stream body");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done || this.stop) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            for (const line of block.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  this.onEvent(JSON.parse(line.slice(6)));
                } catch {
                  /* keep-alive or partial — ignore */
                }
              }
            }
          }
        }
      } catch {
        /* reconnect below, like the real phone's 2s backoff */
      }
      if (!this.stop) await sleep(2000);
    }
  }

  private onEvent(ev: TourneyEvent) {
    switch (ev.type) {
      case "state":
        this.phase = ev.phase ?? this.phase;
        this.st.round = ev.round ?? 0;
        this.st.role = ev.role ?? this.st.role;
        if (typeof ev.seed === "number") this.seed = ev.seed;
        if (ev.you) {
          this.st.seq = ev.you.seq ?? 1;
          this.st.correct = ev.you.correct ?? 0;
          this.st.wrong = ev.you.wrong ?? 0;
          this.st.wins = ev.you.wins ?? this.st.wins;
        }
        if (ev.pair?.opponents) this.st.opponents = ev.pair.opponents;
        if (ev.openAt) this.openAt = ev.openAt;
        if (ev.deadline) this.deadline = ev.deadline;
        if (this.phase === "duel") void this.duelLoop();
        break;
      case "pairing":
        this.phase = "pairing";
        this.st.round = ev.round ?? this.st.round;
        this.st.role = ev.role ?? this.st.role;
        this.st.opponents = ev.opponents ?? [];
        this.st.correct = 0;
        this.st.wrong = 0;
        this.st.seq = 1;
        break;
      case "duel":
        this.phase = "duel";
        this.st.round = ev.round ?? this.st.round;
        this.seed = ev.seed ?? this.seed;
        this.openAt = ev.openAt ?? now();
        this.deadline = ev.deadline ?? now();
        this.st.seq = 1;
        this.st.correct = 0;
        this.st.wrong = 0;
        this.lockedUntil = 0;
        void this.duelLoop();
        break;
      case "tick":
        // opponent scored — mirror it so the terminal table shows both sides
        for (const o of ev.opponents ?? []) {
          const mine = this.st.opponents.find((x) => x.name === o.name);
          if (mine) mine.correct = o.correct;
        }
        break;
      case "result":
        this.phase = "result";
        this.st.lastResult = {
          round: ev.round ?? this.st.round,
          won: ev.won === true,
          correct: ev.you?.correct ?? 0,
          opponents: (ev.opponents ?? []).map((o) => ({
            name: o.name,
            correct: o.correct ?? 0,
          })),
        };
        if (ev.won) this.st.wins += 1;
        if (ev.eliminated) this.st.role = "losers";
        break;
      case "podium":
        this.phase = "podium";
        break;
    }
  }

  /** Solve problems until the round's clock runs out. */
  private async duelLoop() {
    if (this.st.role === "waiting") return; // latecomer sitting out
    const round = this.st.round;
    // wait out the 3-2-1 get-ready
    const wait = this.openAt - now();
    if (wait > 0) await sleep(wait);

    while (!this.stop && this.phase === "duel" && this.st.round === round) {
      if (now() > this.deadline - 300) break; // buzzer
      if (this.st.away) {
        await sleep(500);
        continue;
      }
      if (this.lockedUntil > now()) {
        await sleep(Math.min(this.lockedUntil - now(), 500));
        continue;
      }
      if (this.seed === null) return;

      // Think, then answer — right or wrong per this bot's accuracy.
      const think = spread(this.rng, this.st.speedMs * 0.6, this.st.speedMs * 1.4);
      await sleep(Math.min(think, Math.max(0, this.deadline - now())));
      if (this.stop || this.phase !== "duel" || this.st.round !== round) break;
      if (this.st.away) continue;

      let given: string;
      try {
        const p = this.src.at(this.seed, this.st.seq);
        const right = toPlain(p.answer, p.answerStyle);
        given = this.rng() < this.st.accuracy ? right : wrongAnswer(right);
      } catch {
        given = "1";
      }

      const r = await post("/tourney/answer", {
        code: OPT.code,
        studentId: this.st.studentId,
        round,
        seq: this.st.seq,
        given,
      });

      if (r.status === 200 && r.json?.ok) {
        this.st.correct = r.json.correct ?? this.st.correct;
        this.st.wrong = r.json.wrong ?? this.st.wrong;
        this.st.seq += 1;
        if (r.json.right === false && r.json.lockRemainMs) {
          this.lockedUntil = now() + r.json.lockRemainMs;
        }
        if (!OPT.quiet && this.rng() < 0.04) {
          log(
            `  ${this.st.name}: ${r.json.right ? "✓" : "✗"} ${given}  (${this.st.correct} дұрыс)`,
          );
        }
      } else if (r.status === 409 && r.json?.error === "bad_seq") {
        this.st.seq = r.json.expect ?? this.st.seq; // resync like the phone
      } else if (r.status === 429 && r.json?.error === "locked") {
        this.lockedUntil = now() + (r.json.remainMs ?? 3000);
      } else if (r.status === 409 || r.status === 404) {
        break; // round closed or kicked — stop pushing
      }
    }
  }

  /** Phone goes in a pocket for a while, then comes back. */
  async wander() {
    while (!this.stop) {
      await sleep(20_000 + this.rng() * 40_000);
      if (this.stop || this.phase !== "duel") continue;
      this.st.away = true;
      await post("/submit", {
        code: OPT.code,
        studentId: this.st.studentId,
        name: this.st.name,
        score: 0, total: 0, finished: false,
        focused: false, tabSwitches: 1, awaySeconds: 0,
      });
      log(`  💤 ${this.st.name} экраннан кетті (away)`);
      const gone = 15_000 + this.rng() * 20_000;
      await sleep(gone);
      this.st.away = false;
      await post("/submit", {
        code: OPT.code,
        studentId: this.st.studentId,
        name: this.st.name,
        score: 0, total: 0, finished: false,
        focused: true, tabSwitches: 1,
        awaySeconds: Math.round(gone / 1000),
      });
      log(`  🔙 ${this.st.name} қайта оралды`);
    }
  }

  async leave() {
    this.stop = true;
    await fetch(`${OPT.server}/leave`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ code: OPT.code, studentId: this.st.studentId }),
    }).catch(() => {});
  }
}

// ─── Console output ─────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

/**
 * One line per DUEL, not per bot: every bot knows only its own side, so the
 * same match arrives twice (once from each player). Dedupe on the sorted
 * name set and print the pair with the winner marked.
 */
function roundTable(bots: Bot[], round: number) {
  log("");
  log(`── ${round}-айналым нәтижелері ─────────────────────`);
  // Medal from the server's own verdict (each bot knows whether IT won),
  // never from comparing scores — equal scores are split by the tiebreak.
  const wonByName = new Map(
    bots
      .filter((b) => b.st.lastResult?.round === round)
      .map((b) => [b.st.name, b.st.lastResult!.won] as const),
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const b of bots) {
    const res = b.st.lastResult;
    if (!res || res.round !== round) continue; // sat this round out
    const side = [
      { name: b.st.name, score: res.correct },
      ...res.opponents.map((o) => ({ name: o.name, score: o.correct })),
    ];
    const key = side.map((s) => s.name).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (side.length === 1) {
      lines.push(`   ${b.st.name.padEnd(14)} ${String(res.correct).padStart(3)}   (тікелей өтеді)`);
      continue;
    }
    lines.push(
      "   " +
        side
          .map(
            (s) =>
              `${wonByName.get(s.name) ? "🏅" : "  "} ${s.name.padEnd(13)}${String(s.score).padStart(3)}`,
          )
          .join("  vs "),
    );
  }
  lines.forEach((l) => log(l));
}

// ─── Topic auto-detection (so you don't have to pass --topic) ───────────────

async function detectTopic(studentPath: string): Promise<string> {
  if (OPT.topic || OPT.generatorFile) return OPT.topic;
  try {
    const url = `${OPT.site}${studentPath}`;
    const html = await fetch(url).then((r) => r.text());
    const hits = DRILL_TOPICS.map((t) => t.id).filter((id) =>
      html.includes(`"topic\\":\\"${id}\\"`) || html.includes(`"topic":"${id}"`),
    );
    if (hits.length === 1) return hits[0];
    if (html.includes('file\\":true') || html.includes('"file":true')) {
      console.error(
        "This quiz uses an UPLOADED generator file. Re-run with:\n" +
          "  --generator-file /path/to/your-generator.js",
      );
      process.exit(1);
    }
  } catch {
    /* fall through to the friendly error below */
  }
  console.error(
    "Could not auto-detect the drill topic. Re-run naming it, e.g.:\n" +
      `  --topic ${DRILL_TOPICS[0].id}\n` +
      `Known topics: ${DRILL_TOPICS.map((t) => t.id).join(", ")}`,
  );
  process.exit(1);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log(`Турнир симуляторы — ${OPT.students} оқушы, ${OPT.code} бөлмесі`);

  // 1. Resolve the room: is it live, and is it a tournament?
  const resolved = await fetch(
    `${OPT.server}/resolve?code=${encodeURIComponent(OPT.code)}`,
  )
    .then((r) => r.json())
    .catch(() => null);
  if (!resolved || resolved.status === "not_found") {
    console.error(`Room ${OPT.code} not found. Is the console still open?`);
    process.exit(1);
  }
  if (!resolved.tourney) {
    console.error(
      `Room ${OPT.code} is not a tournament room (it's a ${resolved.race ? "race" : "self-paced"} room).`,
    );
    process.exit(1);
  }
  const studentPath: string = resolved.studentPath ?? "";
  const dopt = /[?&]dopt=([^&]+)/.exec(studentPath)?.[1] ?? null;
  const config: DrillConfig =
    (dopt && decodeDrillConfig(decodeURIComponent(dopt))) || {};

  // 2. Same generator the phones will run.
  const topicId = await detectTopic(studentPath);
  OPT.topic = topicId || OPT.topic;
  const src = await buildSource(config);
  log(`Тақырып: ${src.label}${dopt ? `  (баптау: ${decodeURIComponent(dopt)})` : ""}`);

  // 3. Personalities.
  const rng = mulberry32(OPT.seed);
  const bots: Bot[] = [];
  for (let i = 0; i < OPT.students; i++) {
    const st: BotState = {
      name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ""),
      studentId: `stu_sim${Date.now().toString(36).slice(-4)}${i.toString(36)}`,
      speedMs: Math.round(spread(rng, 1800, 7000)),
      accuracy: spread(rng, 0.55, 0.97),
      flaky: i < OPT.flaky,
      round: 0, seq: 1, correct: 0, wrong: 0,
      role: "waiting", opponents: [], wins: 0, away: false, alive: true,
      lastResult: null,
    };
    const bot = new Bot(st, src, config, mulberry32((OPT.seed + i * 7919) >>> 0));
    bots.push(bot);
    ALL_BOTS.push(bot);
  }

  // 4. Join (staggered, like kids scanning the QR one after another).
  let joined = 0;
  for (const b of bots) {
    const ok = await b.join();
    if (ok) {
      joined++;
      b.startHeartbeat();
      void b.openStream();
      if (b.st.flaky) void b.wander();
    } else {
      log(`  ⚠️  ${b.st.name} кіре алмады`);
    }
    await sleep(120 + rng() * 200);
  }
  log(`\n✅ ${joined} оқушы лоббиде. Консольде «Жеребе тарту» → «Айналымды бастау».`);
  log(`   (Ctrl-C — тоқтату; барлық боттар дұрыс шығады.)\n`);

  // 5. Narrate rounds in the terminal while the board shows the real thing.
  let lastRound = 0;
  let lastPhase = "";
  setInterval(() => {
    const round = Math.max(...bots.map((b) => b.st.round));
    const phases = bots.map((b) => b.phase);
    const phase = phases.includes("duel")
      ? "duel"
      : phases.includes("result")
        ? "result"
        : phases.includes("podium")
          ? "podium"
          : phases.includes("pairing")
            ? "pairing"
            : "idle";
    // Announce the draw on the round number alone — a teacher who presses
    // «Айналымды бастау» quickly can pass through 'pairing' between two
    // polls, and the draw is worth announcing either way.
    if (round > lastRound) {
      log(`\n🎲 ${round}-айналым жеребесі тартылды`);
      lastRound = round;
    }
    if (phase !== lastPhase) {
      if (phase === "duel") log(`\n⏱  ${round}-айналым басталды — дуэльдер жүріп жатыр…`);
      // Settle broadcasts land per student over a few ms — let every bot's
      // result arrive before drawing the table, or the last ones show stale
      // medals.
      if (phase === "result") setTimeout(() => roundTable(bots, round), 700);
      if (phase === "podium") {
        const top = [...bots].sort(
          (a, b) => b.st.wins - a.st.wins || b.st.correct - a.st.correct,
        );
        log(`\n🏆 Турнир аяқталды! Жеңімпаз: ${top[0]?.st.name}`);
        top.slice(0, 5).forEach((b, i) =>
          log(`   ${i + 1}. ${b.st.name.padEnd(14)} жеңіс: ${b.st.wins}`),
        );
      }
      lastPhase = phase;
    }
  }, 1000);
}

// Every bot, so Ctrl-C can send their leave beacons (the board then shows
// them gone instantly instead of waiting out the 45s silence sweep).
const ALL_BOTS: Bot[] = [];

async function shutdown() {
  log("\nБоттар шығып жатыр…");
  await Promise.all(ALL_BOTS.map((b) => b.leave()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
