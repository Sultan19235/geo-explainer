/**
 * MathSabaq Live Score Server
 * Hetzner Node.js backend — HTTP POST + SSE
 * No database. No Socket.io. Pure HTTP.
 *
 * Session lifecycle:  waiting → active → ended
 *   POST /session   → creates session (status: waiting)
 *   POST /start     → teacher starts quiz (status: active, starts 45-min timer)
 *   POST /end       → teacher ends quiz   (status: ended)
 *   GET  /status    → students poll session state
 *   POST /submit    → student sends score (response includes status + timeLeft)
 *   GET  /live      → teacher SSE stream
 */

const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const SESSION_DURATION = 45 * 60 * 1000; // 45 minutes in ms

// ─── In-memory session store ───────────────────────────────────────────────
const sessions = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcast(session, payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  session.teachers.forEach(res => {
    try { res.write(msg); } catch (_) {}
  });
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
  for (const [code, session] of sessions.entries()) {
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

// Teacher creates a session → gets a code (status: waiting)
app.post('/session', (req, res) => {
  const code = generateCode();
  sessions.set(code, {
    createdAt: Date.now(),
    title: req.body.title || 'Math Quiz',
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

// Student submits score (called every 5 seconds)
app.post('/submit', (req, res) => {
  const { code, studentId, name, score, total, finished,
          focused, tabSwitches, awaySeconds } = req.body;

  if (!code || !studentId) return res.status(400).json({ error: 'Missing fields' });

  const session = sessions.get(code);
  if (!session) return res.status(404).json({ error: 'Session not found', status: 'not_found' });

  checkAutoEnd(session);

  const student = {
    name:        name        || 'Student',
    score:       score       || 0,
    total:       total       || 0,
    finished:    finished    || false,
    focused:     focused     !== undefined ? focused     : true,
    tabSwitches: tabSwitches !== undefined ? tabSwitches : 0,
    awaySeconds: awaySeconds !== undefined ? awaySeconds : 0,
    updatedAt:   Date.now()
  };

  session.students.set(studentId, student);

  // Broadcast delta to all watching teachers
  broadcast(session, {
    type: 'update',
    studentId,
    ...student
  });

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
    sessions: sessions.size,
    students: Array.from(sessions.values()).reduce((n, s) => n + s.students.size, 0)
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ MathSabaq server running on port ${PORT}`);
});
