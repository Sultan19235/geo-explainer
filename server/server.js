/**
 * MathSabaq Live Score Server — v2
 * Hetzner Node.js backend — HTTP POST + SSE
 * No Socket.io. Pure HTTP. Sessions live in memory; final results are
 * persisted to Supabase when a session ends.
 *
 * Session lifecycle:  waiting → active → ended
 *   POST /session   → creates session (status: waiting)      [token-gated*]
 *   POST /start     → teacher starts quiz (status: active, starts 45-min timer)
 *   POST /end       → teacher ends quiz   (status: ended, persists results)
 *   GET  /status    → students poll session state
 *   POST /submit    → student sends score (response includes status + timeLeft)
 *   GET  /live      → teacher SSE stream
 *   GET  /health    → sessions/students counts + enabled features
 *
 * v2 over v1:
 *   - room codes are collision-checked (v1 could silently overwrite a live room)
 *   - /submit only broadcasts when a student's state actually changed
 *     (kills the every-5s no-op chatter; lobby idles cost ~nothing)
 *   - results are persisted to Supabase (quiz_session_results) on end/timeout,
 *     via plain REST — no new dependencies. Off until env vars are set.
 *   - optional auth gate on /session: HMAC token issued by the website
 *     (/api/quiz-token, PLAN.md "Gate 2"). Off until QUIZ_TOKEN_SECRET is set
 *     on BOTH sides — old uploaded consoles keep working until then.
 *   - light abuse limits (max sessions, max students per session, name length)
 *
 * Config (env or a .env file next to this script; real env vars win):
 *   PORT                        default 3000 (prod runs 3001 behind nginx)
 *   SUPABASE_URL                enables persistence together with…
 *   SUPABASE_SERVICE_ROLE_KEY   …this. Both unset → results are not saved.
 *   QUIZ_TOKEN_SECRET           enables the /session auth gate. Unset → open.
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
app.use(cors());

const SESSION_DURATION = 45 * 60 * 1000; // 45 minutes in ms

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const QUIZ_TOKEN_SECRET = process.env.QUIZ_TOKEN_SECRET || '';

const PERSIST_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const AUTH_ENFORCED = Boolean(QUIZ_TOKEN_SECRET);

// Safety valves — generous vs. the real classroom shape (30 students/room).
const MAX_SESSIONS = 20000;
const MAX_STUDENTS_PER_SESSION = 100;
const MAX_NAME_LENGTH = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── In-memory session store ───────────────────────────────────────────────
const sessions = new Map();

function generateCode() {
  // Collision-checked: v1 could overwrite an in-progress room (~1 in 2.2B per
  // create, but at 20k sessions/day it would eventually clobber a live class).
  for (let i = 0; i < 20; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    if (code.length === 6 && !sessions.has(code)) return code;
  }
  return null; // astronomically unlikely unless the store is packed
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
  if (!AUTH_ENFORCED) return { ok: true, uid: null };
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false };
  const [payloadB64, sig] = token.split('.');
  try {
    const expected = crypto
      .createHmac('sha256', QUIZ_TOKEN_SECRET)
      .update(payloadB64)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return { ok: false };
    return { ok: true, uid: typeof payload.uid === 'string' ? payload.uid : null };
  } catch (_) {
    return { ok: false };
  }
}

// ─── Results persistence ───────────────────────────────────────────────────
// One row per ended session in public.quiz_session_results (see the website
// repo's supabase/migrations). Plain REST insert with the service-role key —
// no client library needed. Persist is scheduled 3s after end so submits
// already in flight still make it into the saved row.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function persistResults(session, reason) {
  if (!PERSIST_ENABLED) return;
  if (session.students.size === 0) return; // empty test rooms → no junk rows

  const row = {
    quiz_id: session.quizId,
    teacher_user_id: session.createdBy,
    code: session.code,
    title: session.title,
    ended_reason: reason,
    started_at: session.startedAt ? new Date(session.startedAt).toISOString() : null,
    ended_at: new Date().toISOString(),
    student_count: session.students.size,
    students: Array.from(session.students.entries()).map(([id, s]) => ({
      student_id: id,
      name: s.name,
      score: s.score,
      total: s.total,
      finished: s.finished,
      tab_switches: s.tabSwitches,
      away_seconds: s.awaySeconds
    }))
  };

  for (const delayMs of [0, 2000, 8000]) {
    if (delayMs) await sleep(delayMs);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/quiz_session_results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });
      if (res.ok) return;
      console.error(`persist: Supabase responded ${res.status}: ${await res.text()}`);
    } catch (e) {
      console.error(`persist: ${e.message}`);
    }
  }
  // All retries failed — dump the row into pm2 logs so it can be recovered.
  console.error('PERSIST_FAILED ' + JSON.stringify(row));
}

function schedulePersist(session, reason) {
  if (session.persistScheduled) return;
  session.persistScheduled = true;
  setTimeout(() => {
    persistResults(session, reason).catch(e => console.error('persist:', e));
  }, 3000);
}

// Check if session should auto-end (45 min elapsed)
function checkAutoEnd(session) {
  if (session.status === 'active' && session.startedAt) {
    if (Date.now() - session.startedAt >= SESSION_DURATION) {
      session.status = 'ended';
      broadcast(session, { type: 'ended', reason: 'timeout' });
      schedulePersist(session, 'timeout');
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

// ─── Routes ───────────────────────────────────────────────────────────────

// Teacher creates a session → gets a code (status: waiting).
// Body: { title, quizId?, token? } — quizId/token are sent by v2 consoles;
// old consoles send only title and still work while the gate is open.
app.post('/session', (req, res) => {
  const auth = verifyQuizToken(req.body.token);
  if (!auth.ok) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (sessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server full' });
  }

  const code = generateCode();
  if (!code) return res.status(503).json({ error: 'Server full' });

  const quizId = typeof req.body.quizId === 'string' && UUID_RE.test(req.body.quizId)
    ? req.body.quizId
    : null;

  sessions.set(code, {
    code,
    createdAt: Date.now(),
    title: String(req.body.title || 'Math Quiz').slice(0, 200),
    quizId,
    createdBy: auth.uid,
    status: 'waiting',
    startedAt: null,
    persistScheduled: false,
    students: new Map(),
    teachers: new Set()
  });
  res.json({ code });
});

// Teacher starts the quiz (waiting → active)
app.post('/start', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found' });

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

  session.status = 'ended';

  // Broadcast to all teacher SSE streams
  broadcast(session, { type: 'ended', reason: 'teacher' });
  schedulePersist(session, 'teacher');

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

// Student submits score (heartbeat + on every answer / focus change)
app.post('/submit', (req, res) => {
  const { code, studentId, name, score, total, finished,
          focused, tabSwitches, awaySeconds } = req.body;

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
  });
});

// Quick health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: 2,
    sessions: sessions.size,
    students: Array.from(sessions.values()).reduce((n, s) => n + s.students.size, 0),
    persistence: PERSIST_ENABLED,
    authGate: AUTH_ENFORCED
  });
});

if (PERSIST_ENABLED && typeof fetch === 'undefined') {
  console.error('❌ Persistence configured but this Node has no global fetch — Node 18+ required.');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MathSabaq server v2 running on port ${PORT}`);
  console.log(`   results persistence: ${PERSIST_ENABLED ? 'ON (Supabase)' : 'OFF — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'}`);
  console.log(`   /session auth gate:  ${AUTH_ENFORCED ? 'ENFORCED' : 'OPEN — set QUIZ_TOKEN_SECRET to enforce'}`);
});
