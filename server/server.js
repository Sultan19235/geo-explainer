/**
 * MathSabaq Live Score Server — v3
 * Hetzner Node.js backend — HTTP POST + SSE
 * No Socket.io. Pure HTTP. Sessions live in memory ONLY: by product decision
 * there is no class history — when a session ends, the scores the teacher saw
 * are the whole story, and nothing is written anywhere.
 *
 * Session lifecycle:  waiting → active → ended
 *   POST /session   → creates session (status: waiting)      [token-gated*]
 *   POST /start     → teacher starts quiz (status: active, starts 45-min timer)
 *   POST /end       → teacher ends quiz   (status: ended)
 *   GET  /status    → students poll session state
 *   POST /submit    → student sends score (response includes status + timeLeft)
 *   GET  /live      → teacher SSE stream
 *   GET  /health    → sessions/students counts + enabled features
 *
 * v3 over v2: results persistence removed (no Supabase, no history — sessions
 * evaporate when they end / age out). v2 over v1: collision-checked room
 * codes, /submit broadcasts only real changes, optional auth gate, abuse
 * limits.
 *
 * Config (env or a .env file next to this script; real env vars win):
 *   PORT                default 3000 (prod runs 3001 behind nginx)
 *   QUIZ_TOKEN_SECRET   enables the /session auth gate. Unset → open.
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

const QUIZ_TOKEN_SECRET = process.env.QUIZ_TOKEN_SECRET || '';
const AUTH_ENFORCED = Boolean(QUIZ_TOKEN_SECRET);

// Safety valves — generous vs. the real classroom shape (30 students/room).
const MAX_SESSIONS = 20000;
const MAX_STUDENTS_PER_SESSION = 100;
const MAX_NAME_LENGTH = 40;

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

// ─── Routes ───────────────────────────────────────────────────────────────

// Teacher creates a session → gets a code (status: waiting).
// Body: { title, token? } — old consoles send only title and still work
// while the gate is open. (quizId from older v2 consoles is ignored.)
app.post('/session', (req, res) => {
  if (!verifyQuizToken(req.body.token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (sessions.size >= MAX_SESSIONS) {
    return res.status(503).json({ error: 'Server full' });
  }

  const code = generateCode();
  if (!code) return res.status(503).json({ error: 'Server full' });

  sessions.set(code, {
    code,
    createdAt: Date.now(),
    title: String(req.body.title || 'Math Quiz').slice(0, 200),
    status: 'waiting',
    startedAt: null,
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
    version: 3,
    sessions: sessions.size,
    students: Array.from(sessions.values()).reduce((n, s) => n + s.students.size, 0),
    authGate: AUTH_ENFORCED
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MathSabaq server v3 running on port ${PORT}`);
  console.log(`   class history: never saved (by design)`);
  console.log(`   /session auth gate: ${AUTH_ENFORCED ? 'ENFORCED' : 'OPEN — set QUIZ_TOKEN_SECRET to enforce'}`);
});
