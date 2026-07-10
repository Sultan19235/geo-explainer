/**
 * MathSabaq Live Score Server — v5
 * Hetzner Node.js backend — HTTP POST + SSE
 * No Socket.io. Pure HTTP. Sessions live in memory ONLY. This server never
 * writes results anywhere — since 2026-07-10 the teacher's CONSOLE saves the
 * final scoreboard to Supabase itself (under the teacher's own login), so the
 * box stays credential-free.
 *
 * Session lifecycle:  waiting → active → ended
 *   POST /session   → creates session (status: waiting)      [token-gated*]
 *   POST /start     → teacher starts quiz (status: active, starts 45-min timer)
 *   POST /end       → teacher ends quiz   (status: ended)
 *   GET  /status    → students poll session state
 *   GET  /resolve   → room code → student join path (universal /join page)
 *   POST /submit    → student sends score (response includes status + timeLeft)
 *   GET  /live      → teacher SSE stream
 *   GET  /health    → sessions/students counts + enabled features
 *
 * v5 over v4: kahoot-style universal entrance. /session stores the console's
 * `studentPath` (the room's site-relative join link) and public
 * GET /resolve?code= hands it back, so the website's /join page can turn a
 * code typed from the whiteboard into the right quiz. v4 over v3: /submit accepts an optional per-question `answers` map
 * (question id -> 0|1) and relays it to the teacher's SSE stream, so the
 * console can save per-question detail. v3 over v2: results persistence
 * removed (no Supabase — sessions evaporate when they end / age out). v2 over
 * v1: collision-checked room codes, /submit broadcasts only real changes,
 * optional auth gate, abuse limits.
 *
 * Config (env or a .env file next to this script; real env vars win):
 *   PORT                     default 3000 (prod runs 3001 behind nginx)
 *   QUIZ_TOKEN_SECRET        enables the /session auth gate. Unset → open.
 *   LIVE_ALLOWED_ORIGINS     comma-separated origin allowlist for CORS. Unset →
 *                            reflect any origin (v3 behavior). Set to the
 *                            website origin(s) to lock the API to your site.
 *   LIVE_HOST_SECRET_ENFORCED  when set, /start, /end and /live require the
 *                            per-session hostSecret returned by /session, so
 *                            only the teacher who opened a room can control or
 *                            watch it. Unset → dormant (secret still issued).
 *   LIVE_RATE_LIMIT_PER_MIN  per-IP request ceiling per minute (default 2000;
 *                            0 disables). Generous for a NAT'd classroom.
 *   LIVE_MAX_SSE_PER_IP      max concurrent /live streams per IP (default 50).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Tiny .env loader (no dependency; real env vars take precedence) ───────
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch (_) {}

const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());

const SESSION_DURATION = 45 * 60 * 1000; // 45 minutes in ms

const QUIZ_TOKEN_SECRET = process.env.QUIZ_TOKEN_SECRET || '';
const AUTH_ENFORCED = Boolean(QUIZ_TOKEN_SECRET);

// Only the teacher who created a room may control (/start, /end) or watch
// (/live) it. /session hands the creator a per-session hostSecret; the
// student-facing code is NOT enough. Dormant until the env is set, so already
// deployed consoles keep working until they've adopted the secret.
const HOST_SECRET_ENFORCED = Boolean(process.env.LIVE_HOST_SECRET_ENFORCED);

// ─── CORS allowlist ─────────────────────────────────────────────────────────
// The website's student pages and teacher consoles call this backend
// cross-origin. Locking CORS to the site origin(s) stops arbitrary websites
// from scripting the API in a visitor's browser. Unset → reflect any origin
// (v3 behavior) so deploying this build changes nothing until the operator
// sets the list.
const ALLOWED_ORIGINS = (process.env.LIVE_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CORS_LOCKED = ALLOWED_ORIGINS.length > 0;

app.use(
  cors({
    origin(origin, cb) {
      // No Origin header = same-origin or a non-browser client (curl, the
      // student HTML's own fetch on some engines) — always allowed. When the
      // allowlist is unset we stay permissive; otherwise only listed origins
      // get CORS headers, so other sites' browsers can't read responses.
      if (!origin || !CORS_LOCKED || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  }),
);

// ─── Per-IP rate limiting (in-memory, best-effort) ──────────────────────────
// Blunts request floods and SSE-connection exhaustion on the single-core box.
// The default ceiling is deliberately high so a whole classroom behind one
// school NAT stays well under it while a single-host flood is still cut off.
const RATE_LIMIT_PER_MIN = Number(process.env.LIVE_RATE_LIMIT_PER_MIN ?? 2000);
const MAX_SSE_PER_IP = Number(process.env.LIVE_MAX_SSE_PER_IP ?? 50);
const rlHits = new Map(); // ip -> timestamps within the trailing minute
const sseByIp = new Map(); // ip -> open /live connection count

function clientIpOf(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function rateLimited(ip) {
  if (!RATE_LIMIT_PER_MIN) return false; // 0 disables the limiter
  const windowStart = Date.now() - 60_000;
  const arr = (rlHits.get(ip) || []).filter((t) => t > windowStart);
  arr.push(Date.now());
  rlHits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

app.use((req, res, next) => {
  const ip = clientIpOf(req);
  req.clientIp = ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
});

// Safety valves — generous vs. the real classroom shape (30 students/room).
const MAX_SESSIONS = 20000;
const MAX_STUDENTS_PER_SESSION = 100;
const MAX_NAME_LENGTH = 40;
const MAX_ANSWER_ENTRIES = 500;
const MAX_ANSWER_KEY_LENGTH = 64;

// Per-question outcomes from the student engine: { questionId: 0|1 }.
// Anything malformed is dropped rather than rejected so old clients (which
// never send the field) and hostile payloads degrade the same way.
function cleanAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key.length === 0 || key.length > MAX_ANSWER_KEY_LENGTH) continue;
    if (value !== 0 && value !== 1 && value !== true && value !== false) continue;
    out[key] = value ? 1 : 0;
    if (++n >= MAX_ANSWER_ENTRIES) break;
  }
  return n > 0 ? out : undefined;
}

// ─── In-memory session store ───────────────────────────────────────────────
const sessions = new Map();

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateCode() {
  // Collision-checked AND unpredictable: crypto.randomBytes (not Math.random)
  // so a live room's code can't be guessed from an observed one — guessing is
  // the only way an outsider could reach /live or /submit for a class.
  for (let i = 0; i < 20; i++) {
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let j = 0; j < 6; j++) code += CODE_ALPHABET[bytes[j] % CODE_ALPHABET.length];
    if (!sessions.has(code)) return code;
  }
  return null; // astronomically unlikely unless the store is packed
}

// Per-session teacher credential. Returned once to the room creator; required
// to control or watch the room when LIVE_HOST_SECRET_ENFORCED is set.
function generateHostSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

// The console's student join link for the room, e.g.
// "/play/algebra-7?q=a,b&shuffle=1". Stored so GET /resolve can turn a typed
// room code into the right quiz — the kahoot-style universal entrance.
// Site-RELATIVE on purpose: no origin is ever stored, so moving the website
// to a new domain invalidates nothing, and the /join page never leaves its
// own site. Invalid values are dropped silently — a bad or missing path must
// never block opening a room (old consoles don't send one at all).
const MAX_STUDENT_PATH_LENGTH = 1000;
function sanitizeStudentPath(p) {
  if (typeof p !== 'string' || p.length > MAX_STUDENT_PATH_LENGTH) return null;
  // "/play/..." plus printable non-space ASCII only (query values arrive
  // URL-encoded). Rules out protocol-relative "//", whitespace smuggling and
  // control characters wholesale.
  if (!/^\/play\/[!-~]*$/.test(p)) return null;
  // Normalize the way a browser will (dot segments, backslashes, %2e tricks)
  // and re-check the prefix on the RESULT — "/play/../admin" and friends
  // normalize right out of /play/. The normalized form is what gets stored,
  // so /resolve never serves a path this check didn't see.
  try {
    const u = new URL(p, 'http://base');
    if (u.origin !== 'http://base' || !u.pathname.startsWith('/play/')) return null;
    return u.pathname + u.search;
  } catch (_) {
    return null;
  }
}

function verifyHostSecret(session, provided) {
  if (!HOST_SECRET_ENFORCED) return true; // dormant gate
  if (!session.hostSecret) return true; // legacy session predating the secret
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(session.hostSecret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function broadcast(session, payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  session.teachers.forEach(res => {
    try { res.write(msg); } catch (_) {}
  });
}

// ─── Auth gate (PLAN.md "Gate 2") ──────────────────────────────────────────
// Token format: base64url(JSON {uid, exp}) + '.' + base64url(HMAC-SHA256).
// Issued by the website's /api/quiz-token for signed-in teachers; verified
// here with the shared secret. No secret configured → gate is open (v1
// behavior) so already-uploaded consoles keep working.
function verifyQuizToken(token) {
  if (!AUTH_ENFORCED) return true;
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  try {
    const expected = crypto
      .createHmac('sha256', QUIZ_TOKEN_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return Boolean(payload.exp && payload.exp >= Math.floor(Date.now() / 1000));
  } catch (_) {
    return false;
  }
}

// Check if session should auto-end (45 min elapsed)
function checkAutoEnd(session) {
  if (session.status === 'active' && session.startedAt) {
    if (Date.now() - session.startedAt >= SESSION_DURATION) {
      session.status = 'ended';
      broadcast(session, { type: 'ended', reason: 'timeout' });
    }
  }
}

// Helper: get time left in seconds
function getTimeLeft(session) {
  if (!session.startedAt || session.status !== 'active') return SESSION_DURATION / 1000;
  return Math.max(0, Math.round((SESSION_DURATION - (Date.now() - session.startedAt)) / 1000));
}

// Periodic auto-end check (every 30 seconds)
setInterval(() => {
  for (const session of sessions.values()) {
    checkAutoEnd(session);
  }
}, 30 * 1000);

// Clean up sessions older than 4 hours
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [code, session] of sessions.entries()) {
    if (session.createdAt < cutoff && session.teachers.size === 0) {
      sessions.delete(code);
    }
  }
}, 30 * 60 * 1000);

// Evict stale rate-limit buckets so the map doesn't grow with unique IPs.
setInterval(() => {
  const windowStart = Date.now() - 60_000;
  for (const [ip, hits] of rlHits.entries()) {
    const recent = hits.filter((t) => t > windowStart);
    if (recent.length === 0) rlHits.delete(ip);
    else rlHits.set(ip, recent);
  }
}, 5 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────

// Teacher creates a session → gets a code (status: waiting).
// Body: { title, token?, studentPath? } — old consoles send only title and
// still work while the gate is open. (quizId from older v2 consoles is
// ignored; v5 consoles send studentPath for the universal /join page.)
app.post('/session', (req, res) => {
  if (!verifyQuizToken(req.body.token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (sessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server full' });
  }

  const code = generateCode();
  if (!code) return res.status(503).json({ error: 'Server full' });

  const hostSecret = generateHostSecret();
  sessions.set(code, {
    code,
    hostSecret,
    createdAt: Date.now(),
    title: String(req.body.title || 'Math Quiz').slice(0, 200),
    studentPath: sanitizeStudentPath(req.body.studentPath),
    status: 'waiting',
    startedAt: null,
    students: new Map(),
    teachers: new Set()
  });
  // hostSecret goes ONLY to the creator here; students never receive it.
  res.json({ code, hostSecret });
});

// Teacher starts the quiz (waiting → active)
app.post('/start', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  session.status = 'active';
  session.startedAt = Date.now();

  // Broadcast to all teacher SSE streams
  broadcast(session, { type: 'started', startedAt: session.startedAt });

  res.json({ ok: true, startedAt: session.startedAt });
});

// Teacher ends the quiz (active → ended)
app.post('/end', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!verifyHostSecret(session, req.body.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  session.status = 'ended';

  // Broadcast to all teacher SSE streams
  broadcast(session, { type: 'ended', reason: 'teacher' });

  res.json({ ok: true });
});

// Student polls session status (used while waiting + to check if ended)
app.get('/status', (req, res) => {
  const { code } = req.query;
  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  res.json({
    status: session.status,
    timeLeft: getTimeLeft(session)
  });
});

// Universal join: the site's /join page turns a room code the teacher wrote
// on the board into this room's student link. Public by design — it reveals
// no more than the QR already hands every student in the class. The code is
// normalized here so phones may lowercase or pad it freely.
app.get('/resolve', (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  res.json({
    status: session.status,
    title: session.title,
    // null for rooms opened by pre-v5 consoles — the join page tells those
    // students to use the teacher's QR instead.
    studentPath: session.studentPath || null
  });
});

// Student submits score (heartbeat + on every answer / focus change)
app.post('/submit', (req, res) => {
  const { code, studentId, name, score, total, finished,
          focused, tabSwitches, awaySeconds, answers } = req.body;

  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  const prev = session.students.get(studentId);
  if (!prev && session.students.size >= MAX_STUDENTS_PER_SESSION) {
    return res.status(429).json({ error: 'Session full' });
  }

  const student = {
    name:        String(name || 'Student').slice(0, MAX_NAME_LENGTH),
    score:       score       || 0,
    total:       total       || 0,
    finished:    finished    || false,
    focused:     focused     !== undefined ? focused     : true,
    tabSwitches: tabSwitches !== undefined ? tabSwitches : 0,
    awaySeconds: awaySeconds !== undefined ? awaySeconds : 0,
    // Keep the last known map when a heartbeat omits/garbles the field, so a
    // brief bad submit can't wipe detail the console already relies on.
    answers:     cleanAnswers(answers) || (prev ? prev.answers : undefined),
    updatedAt:   Date.now()
  };

  session.students.set(studentId, student);

  // Broadcast only when something the teacher can see actually changed —
  // idle heartbeats (lobby waits, thinking time) produce no SSE traffic.
  // awaySeconds ticks are relayed in ≥15s steps so away timers still move.
  const changed = !prev
    || prev.score !== student.score
    || prev.total !== student.total
    || prev.finished !== student.finished
    || prev.focused !== student.focused
    || prev.tabSwitches !== student.tabSwitches
    || Math.abs(student.awaySeconds - prev.awaySeconds) >= 15;

  if (changed) {
    broadcast(session, {
      type: 'update',
      studentId,
      ...student
    });
  }

  res.json({
    ok: true,
    status: session.status,
    timeLeft: getTimeLeft(session)
  });
});

// Teacher opens SSE stream → receives live updates
app.get('/live', (req, res) => {
  const { code } = req.query;
  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  // The live stream carries every student's name, score and anti-cheat
  // telemetry — teacher-only. hostSecret rides the query string because
  // EventSource can't set headers.
  if (!verifyHostSecret(session, req.query.hostSecret)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ip = req.clientIp || clientIpOf(req);
  const openForIp = sseByIp.get(ip) || 0;
  if (openForIp >= MAX_SSE_PER_IP) {
    return res.status(429).json({ error: 'Too many live streams' });
  }
  sseByIp.set(ip, openForIp + 1);

  checkAutoEnd(session);

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send full current snapshot immediately (includes session status)
  const snapshot = Array.from(session.students.entries()).map(([id, s]) => ({
    studentId: id, ...s
  }));
  res.write(`data: ${JSON.stringify({
    type: 'snapshot',
    students: snapshot,
    status: session.status,
    timeLeft: getTimeLeft(session)
  })}\n\n`);

  // Keep-alive ping every 25 seconds
  const ping = setInterval(() => {
    try {
      checkAutoEnd(session);
      res.write(`: ping\n\n`);
    } catch (_) { clearInterval(ping); }
  }, 25000);

  session.teachers.add(res);

  req.on('close', () => {
    session.teachers.delete(res);
    clearInterval(ping);
    const n = (sseByIp.get(ip) || 1) - 1;
    if (n <= 0) sseByIp.delete(ip);
    else sseByIp.set(ip, n);
  });
});

// Quick health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: 5,
    sessions: sessions.size,
    students: Array.from(sessions.values()).reduce((n, s) => n + s.students.size, 0),
    authGate: AUTH_ENFORCED,
    hostSecretGate: HOST_SECRET_ENFORCED,
    corsLocked: CORS_LOCKED
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MathSabaq server v5 running on port ${PORT}`);
  console.log(`   class history: not saved HERE — the teacher console saves to Supabase`);
  console.log(`   /session auth gate: ${AUTH_ENFORCED ? 'ENFORCED' : 'OPEN — set QUIZ_TOKEN_SECRET to enforce'}`);
  console.log(`   host-secret gate:   ${HOST_SECRET_ENFORCED ? 'ENFORCED' : 'DORMANT — set LIVE_HOST_SECRET_ENFORCED to enforce'}`);
  console.log(`   CORS:               ${CORS_LOCKED ? `locked to ${ALLOWED_ORIGINS.join(', ')}` : 'OPEN — set LIVE_ALLOWED_ORIGINS to lock'}`);
  console.log(`   rate limit:         ${RATE_LIMIT_PER_MIN ? `${RATE_LIMIT_PER_MIN}/min per IP, ${MAX_SSE_PER_IP} live streams/IP` : 'disabled'}`);
});
