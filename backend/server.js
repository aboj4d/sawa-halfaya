require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '5al3D647+';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';

if(JWT_SECRET === 'dev-secret-change-me') console.warn('WARNING: using default JWT_SECRET — set a strong JWT_SECRET in environment for production');
if(ADMIN_PASSWORD === '5al3D647+') console.warn('WARNING: using default ADMIN_PASSWORD — set ADMIN_PASSWORD in environment for production');

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Simple pure-JS JSON DB (database/db.json)
const dbDir = path.join(__dirname, '../database');
if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive:true });
const dbFile = path.join(dbDir, 'db.json');
let _db = { users: [], entries: [] };
function loadDb(){
  try{
    if(!fs.existsSync(dbFile)) { saveDb(); return; }
    const raw = fs.readFileSync(dbFile, 'utf8') || '';
    if(!raw) return;
    _db = JSON.parse(raw);
    _db.users = _db.users || [];
    _db.entries = _db.entries || [];
  }catch(e){ console.error('loadDb', e); }
}
function saveDb(){
  try{ fs.writeFileSync(dbFile, JSON.stringify(_db, null, 2), 'utf8'); }catch(e){ console.error('saveDb', e); }
}
loadDb();

function createUser(id, email, passwordHash, verifyToken){
  _db.users.push({ id, email, passwordHash, verified: 0, verifyToken, createdAt: new Date().toISOString() });
  saveDb();
}
function findUserByEmail(email){
  return _db.users.find(u => u.email === email) || null;
}
function findUserById(id){
  return _db.users.find(u => u.id === id) || null;
}
function setUserVerified(token){
  const u = _db.users.find(x => x.verifyToken === token);
  if(!u) return false;
  u.verified = 1; u.verifyToken = null; saveDb(); return true;
}
function updateVerifyToken(email, token){
  const u = _db.users.find(x => x.email === email);
  if(!u) return false; u.verifyToken = token; saveDb(); return true;
}

function createEntry(service, data, userId){
  const id = Date.now() + Math.floor(Math.random()*1000);
  _db.entries.push({ id, service, data, userId: userId || null, timestamp: new Date().toISOString() });
  saveDb();
}

// Setup nodemailer transporter if env available
let transporter = null;
if(process.env.SMTP_HOST && process.env.SMTP_USER){
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// --- auth routes with verification ---
app.post('/api/auth/register', (req, res) => {
  try{
    const { email, password } = req.body || {};
    if(!email || !password) return res.status(400).json({ ok:false, error:'email and password required' });
    const existing = findUserByEmail(email);
    if(existing) return res.status(400).json({ ok:false, error:'email taken' });
    const hash = bcrypt.hashSync(password, 10);
    const id = Date.now().toString();
    const verifyToken = Math.random().toString(36).slice(2,12);
    createUser(id, email, hash, verifyToken);

    // send verification email if transporter configured
    if(transporter && process.env.FROM_EMAIL){
      const verifyUrl = `${process.env.APP_URL || ('http://localhost:'+PORT)}/api/auth/verify?token=${verifyToken}`;
      transporter.sendMail({ from: process.env.FROM_EMAIL, to: email, subject: 'تحقق من بريدك - حلفايا', text: `اضغط الرابط للتحقق: ${verifyUrl}` })
        .catch(err => console.error('sendMail error', err));
      const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn:'7d' });
      return res.json({ ok:true, message:'registered, verification email sent', token });
    }

    // no SMTP: return token in response for testing
    const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn:'7d' });
    res.json({ ok:true, message:'registered (no-smtp)', token, verifyToken });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try{
    const { email, password } = req.body || {};
    if(!email || !password) return res.status(400).json({ ok:false, error:'email and password required' });
    const user = findUserByEmail(email);
    if(!user) return res.status(400).json({ ok:false, error:'invalid credentials' });
    const ok = bcrypt.compareSync(password, user.passwordHash);
    if(!ok) return res.status(400).json({ ok:false, error:'invalid credentials' });
    if(!user.verified) return res.status(403).json({ ok:false, error:'email not verified' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok:true, token, user: { id: user.id, email: user.email } });
  }catch(err){
    console.error(err);
    res.status(500).json({ ok:false, error: err.message });
  }
});

// verify endpoint
app.get('/api/auth/verify', (req, res) => {
  const token = req.query.token;
  if(!token) return res.status(400).send('token required');
  const ok = setUserVerified(token);
  if(ok) return res.send('verified');
  return res.status(400).send('invalid token');
});

app.post('/api/auth/resend', (req, res) => {
  const { email } = req.body || {};
  if(!email) return res.status(400).json({ ok:false, error:'email required' });
  const user = findUserByEmail(email);
  if(!user) return res.status(404).json({ ok:false, error:'not found' });
  const newToken = Math.random().toString(36).slice(2,12);
  updateVerifyToken(email, newToken);
  if(transporter && process.env.FROM_EMAIL){
    const verifyUrl = `${process.env.APP_URL || ('http://localhost:'+PORT)}/api/auth/verify?token=${newToken}`;
    transporter.sendMail({ from: process.env.FROM_EMAIL, to: email, subject: 'رمز التحقق - حلفايا', text: `اضغط الرابط للتحقق: ${verifyUrl}` })
      .catch(err => console.error('sendMail error', err));
    return res.json({ ok:true, message:'verification resent' });
  }
  res.json({ ok:true, verifyToken: newToken });
});

// helper to extract user from Authorization header
function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return next();
  const parts = auth.split(' ');
  if(parts.length === 2 && parts[0] === 'Bearer'){
    try{
      const payload = jwt.verify(parts[1], JWT_SECRET);
      req.user = payload;
    }catch(e){ /* ignore invalid token */ }
  }
  next();
}

app.use(authMiddleware);

app.get('/api/me', (req, res) => {
  if(!req.user) return res.status(401).json({ ok:false, error:'not authenticated' });
  const user = findUserById(req.user.id);
  if(!user) return res.status(404).json({ ok:false, error:'user not found' });
  res.json({ ok:true, user: { id: user.id, email: user.email } });
});

// admin login (use ADMIN_PASSWORD env)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if(!password) return res.status(400).json({ ok:false, error:'password required' });
  if(ADMIN_PASSWORD && password === ADMIN_PASSWORD){
    const token = jwt.sign({ admin:true }, JWT_SECRET, { expiresIn:'7d' });
    return res.json({ ok:true, token });
  }
  res.status(403).json({ ok:false, error:'invalid' });
});

function requireAdmin(req, res, next){
  if(req.user && req.user.admin) return next();
  // try to verify token directly from header
  const auth = req.headers.authorization;
  if(auth){
    try{ const p = jwt.verify(auth.split(' ')[1], JWT_SECRET); if(p && p.admin) { req.user = p; return next(); } }catch(e){}
  }
  res.status(403).json({ ok:false, error:'admin only' });
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = _db.users.map(u=>({ id: u.id, email: u.email, verified: u.verified, createdAt: u.createdAt }));
  res.json({ ok:true, users: rows });
});

app.get('/api/admin/entries', requireAdmin, (req, res) => {
  const service = req.query.service;
  let rows = _db.entries.slice().reverse();
  if(service) rows = rows.filter(r=>r.service === service);
  rows = rows.slice(0,500).map(r=>({ id: r.id, service: r.service, data: r.data, userId: r.userId, timestamp: r.timestamp }));
  res.json({ ok:true, entries: rows });
});

// admin delete user
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const idx = _db.users.findIndex(u=>u.id === id);
  if(idx === -1) return res.status(404).json({ ok:false, error:'not found' });
  _db.users.splice(idx,1);
  saveDb();
  res.json({ ok:true });
});

// admin delete entry
app.delete('/api/admin/entries/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const idx = _db.entries.findIndex(e=>String(e.id) === String(id));
  if(idx === -1) return res.status(404).json({ ok:false, error:'not found' });
  _db.entries.splice(idx,1);
  saveDb();
  res.json({ ok:true });
});

const services = ['inquiry','ads','complaints','requests','info'];
services.forEach(s => {
  app.post(`/api/${s}`, (req, res) => {
    try{
      const payload = Object.assign({}, req.body || {});
      const userId = req.user ? req.user.id : null;
      createEntry(s, payload, userId);
      res.json({ ok: true });
    } catch(err){
      console.error(err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

if(SSL_KEY_PATH && SSL_CERT_PATH && fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)){
  try{
    const key = fs.readFileSync(SSL_KEY_PATH);
    const cert = fs.readFileSync(SSL_CERT_PATH);
    https.createServer({ key, cert }, app).listen(PORT, ()=>{
      console.log(`Halfaya backend listening (HTTPS) on https://localhost:${PORT}`);
    });
  }catch(e){
    console.error('Failed to start HTTPS server:', e);
    app.listen(PORT, ()=> console.log(`Halfaya backend listening on http://localhost:${PORT}`));
  }
} else {
  app.listen(PORT, () => {
    console.log(`Halfaya backend listening on http://localhost:${PORT}`);
  });
}
