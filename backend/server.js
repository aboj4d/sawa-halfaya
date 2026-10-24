require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const { createServiceRouter } = require('./services');
const { createRateLimiter } = require('./rateLimit');
const { securityHeaders } = require('./security');
const { normalizeEmail, isValidEmail, isValidPassword, PASSWORD_MIN, PASSWORD_MAX } = require('./validators');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const IS_DEV = NODE_ENV === 'development';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';

// --- secrets: never fall back to a known default ---------------------------
// In development only, a random value is generated for each run.
function requireSecret(name, { printGenerated = false } = {}) {
  const value = process.env[name];
  if (value) return value;
  if (IS_DEV) {
    const generated = crypto.randomBytes(24).toString('hex');
    console.warn(`WARNING: ${name} is not set — using a random value for this run (development only)` +
      (printGenerated ? `: ${generated}` : ''));
    return generated;
  }
  console.error(`FATAL: ${name} is not set. Define it in the environment or in backend/.env ` +
    `(see backend/.env.example). For local development you can set NODE_ENV=development.`);
  process.exit(1);
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const ADMIN_PASSWORD = requireSecret('ADMIN_PASSWORD', { printGenerated: true });
if (JWT_SECRET.length < 32) console.warn('WARNING: JWT_SECRET is shorter than 32 characters — use a longer random value');
if (ADMIN_PASSWORD.length < 12) console.warn('WARNING: ADMIN_PASSWORD is shorter than 12 characters — use a longer password');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// --- app setup --------------------------------------------------------------
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}
app.use(securityHeaders);

// CORS: only the configured frontend/app origins. With none configured,
// browser cross-origin requests are refused in production and allowed in
// development. Requests without an Origin header (same-origin, curl) pass.
const allowedOrigins = [process.env.FRONTEND_URL, process.env.APP_URL].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, IS_DEV);
    return callback(null, allowedOrigins.includes(origin));
  }
}));
app.use(express.json({ limit: '20kb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- rate limiters ----------------------------------------------------------
const MINUTE = 60 * 1000;
const loginLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 10, message: 'too many attempts, try again later' });
const adminLoginLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 5, message: 'too many attempts, try again later' });
const registerLimiter = createRateLimiter({ windowMs: 60 * MINUTE, max: 5, message: 'too many registrations, try again later' });
const resendLimiter = createRateLimiter({ windowMs: 60 * MINUTE, max: 5, message: 'too many requests, try again later' });
const serviceLimiter = createRateLimiter({ windowMs: 15 * MINUTE, max: 30, message: 'too many submissions, try again later' });

// --- simple pure-JS JSON DB (database/db.json) ------------------------------
const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbFile = path.join(dbDir, 'db.json');
let _db = { users: [], entries: [] };
function loadDb() {
  try {
    if (!fs.existsSync(dbFile)) { saveDb(); return; }
    const raw = fs.readFileSync(dbFile, 'utf8') || '';
    if (!raw) return;
    _db = JSON.parse(raw);
    _db.users = _db.users || [];
    _db.entries = _db.entries || [];
  } catch (e) { console.error('loadDb', e); }
}
function saveDb() {
  try { fs.writeFileSync(dbFile, JSON.stringify(_db, null, 2), 'utf8'); } catch (e) { console.error('saveDb', e); }
}
loadDb();

function createUser(id, email, passwordHash, verifyToken, verifyExpires) {
  _db.users.push({ id, email, passwordHash, verified: 0, verifyToken, verifyExpires, createdAt: new Date().toISOString() });
  saveDb();
}
function findUserByEmail(email) {
  return _db.users.find(u => u.email === email) || null;
}
function findUserById(id) {
  return _db.users.find(u => u.id === id) || null;
}
// returns 'ok' | 'expired' | 'invalid'
function setUserVerified(token) {
  const u = _db.users.find(x => x.verifyToken && x.verifyToken === token);
  if (!u) return 'invalid';
  if (!u.verifyExpires || Date.parse(u.verifyExpires) < Date.now()) return 'expired';
  u.verified = 1; u.verifyToken = null; u.verifyExpires = null; saveDb();
  return 'ok';
}
function updateVerifyToken(email, token, expires) {
  const u = _db.users.find(x => x.email === email);
  if (!u) return false;
  u.verifyToken = token; u.verifyExpires = expires; saveDb();
  return true;
}

function createEntry(service, data, userId) {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  _db.entries.push({ id, service, data, userId: userId || null, timestamp: new Date().toISOString() });
  saveDb();
}

// --- email verification -----------------------------------------------------
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
function newVerifyToken() {
  return {
    token: crypto.randomBytes(32).toString('hex'),
    expires: new Date(Date.now() + VERIFY_TTL_MS).toISOString()
  };
}

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
const canSendMail = !!(transporter && process.env.FROM_EMAIL);
if (!canSendMail && !IS_DEV) {
  console.warn('WARNING: SMTP is not configured — registration is disabled until SMTP_HOST, SMTP_USER, SMTP_PASS and FROM_EMAIL are set');
}
if (canSendMail && !process.env.APP_URL) {
  console.warn('WARNING: APP_URL is not set — verification links will point to http://localhost:' + PORT);
}

function sendVerificationMail(email, token, subject) {
  const verifyUrl = `${process.env.APP_URL || ('http://localhost:' + PORT)}/api/auth/verify?token=${token}`;
  return transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to: email,
    subject,
    text: `اضغط الرابط للتحقق: ${verifyUrl}`
  }).catch(err => console.error('sendMail error', err));
}

// hash compared when the user does not exist, so timing does not reveal accounts
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(8).toString('hex'), 10);

// --- auth routes ------------------------------------------------------------
app.post('/api/auth/register', registerLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'a valid email is required' });
    if (!isValidPassword(password)) {
      return res.status(400).json({ ok: false, error: `password must be at least ${PASSWORD_MIN} characters (max ${PASSWORD_MAX} bytes)` });
    }
    if (!canSendMail && !IS_DEV) {
      return res.status(503).json({ ok: false, error: 'registration is temporarily unavailable' });
    }
    if (findUserByEmail(email)) return res.status(400).json({ ok: false, error: 'email taken' });

    const hash = bcrypt.hashSync(password, 10);
    const id = Date.now().toString();
    const { token: verifyToken, expires } = newVerifyToken();
    createUser(id, email, hash, verifyToken, expires);

    // No session token is issued before the email is verified.
    if (canSendMail) {
      sendVerificationMail(email, verifyToken, 'تحقق من بريدك - حلفايا');
      return res.json({ ok: true, message: 'registered, verification email sent' });
    }
    // development without SMTP only: expose the token so the flow can be tested
    return res.json({ ok: true, message: 'registered (development, no SMTP)', verifyToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server error' });
  }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ ok: false, error: 'email and password required' });
    }
    const user = findUserByEmail(email);
    const passwordOk = bcrypt.compareSync(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !passwordOk) return res.status(400).json({ ok: false, error: 'invalid credentials' });
    if (!user.verified) return res.status(403).json({ ok: false, error: 'email not verified' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'server error' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).send('invalid token');
  const result = setUserVerified(token);
  if (result === 'ok') return res.send('verified');
  if (result === 'expired') return res.status(400).send('token expired');
  return res.status(400).send('invalid token');
});

app.post('/api/auth/resend', resendLimiter, (req, res) => {
  const email = normalizeEmail((req.body || {}).email);
  if (!isValidEmail(email)) return res.status(400).json({ ok: false, error: 'a valid email is required' });

  const generic = { ok: true, message: 'if the account exists and is not verified, a verification email was sent' };
  const user = findUserByEmail(email);
  if (!user || user.verified) return res.json(generic);
  if (!canSendMail && !IS_DEV) return res.status(503).json({ ok: false, error: 'email service is temporarily unavailable' });

  const { token, expires } = newVerifyToken();
  updateVerifyToken(email, token, expires);
  if (canSendMail) {
    sendVerificationMail(email, token, 'رمز التحقق - حلفايا');
    return res.json(generic);
  }
  return res.json(Object.assign({}, generic, { verifyToken: token })); // development only
});

// extracts the user from the Authorization header (invalid tokens are ignored)
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return next();
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    try {
      req.user = jwt.verify(parts[1], JWT_SECRET);
    } catch (e) { /* ignore invalid token */ }
  }
  next();
}

app.use('/api', authMiddleware);

app.get('/api/me', (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ ok: false, error: 'not authenticated' });
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ ok: false, error: 'user not found' });
  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

// --- admin ------------------------------------------------------------------
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) return res.status(400).json({ ok: false, error: 'password required' });
  if (safeEqual(password, ADMIN_PASSWORD)) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ ok: true, token });
  }
  res.status(403).json({ ok: false, error: 'invalid' });
});

function requireAdmin(req, res, next) {
  if (req.user && req.user.admin === true) return next();
  res.status(403).json({ ok: false, error: 'admin only' });
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = _db.users.map(u => ({ id: u.id, email: u.email, verified: u.verified, createdAt: u.createdAt }));
  res.json({ ok: true, users: rows });
});

app.get('/api/admin/entries', requireAdmin, (req, res) => {
  const service = req.query.service;
  let rows = _db.entries.slice().reverse();
  if (service) rows = rows.filter(r => r.service === service);
  rows = rows.slice(0, 500).map(r => ({ id: r.id, service: r.service, data: r.data, userId: r.userId, timestamp: r.timestamp }));
  res.json({ ok: true, entries: rows });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const idx = _db.users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'not found' });
  _db.users.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/admin/entries/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const idx = _db.entries.findIndex(e => String(e.id) === String(id));
  if (idx === -1) return res.status(404).json({ ok: false, error: 'not found' });
  _db.entries.splice(idx, 1);
  saveDb();
  res.json({ ok: true });
});

// --- public service forms (validated in services.js) -------------------------
app.use('/api', createServiceRouter({ createEntry, limiter: serviceLimiter }));

// --- error handler (malformed / oversized JSON, unexpected errors) -----------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'payload too large' });
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ ok: false, error: 'invalid JSON' });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: 'server error' });
});

// --- start -------------------------------------------------------------------
if (SSL_KEY_PATH && SSL_CERT_PATH && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  try {
    const key = fs.readFileSync(SSL_KEY_PATH);
    const cert = fs.readFileSync(SSL_CERT_PATH);
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log(`Halfaya backend listening (HTTPS) on https://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to start HTTPS server:', e);
    app.listen(PORT, () => console.log(`Halfaya backend listening on http://localhost:${PORT}`));
  }
} else {
  app.listen(PORT, () => {
    console.log(`Halfaya backend listening on http://localhost:${PORT}`);
  });
}
