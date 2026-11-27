const fs = require('fs');

const DATA_FILE = '/tmp/youchat-data.json';

let db = {
  users: {},
  messages: [],
  qrSessions: {},
};

try {
  if (fs.existsSync(DATA_FILE)) {
    db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  }
} catch {}

function saveDb() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db));
  } catch {}
}

function normalizeHandle(h) {
  let s = String(h || '').trim().toLowerCase();
  if (!s) return '';
  if (!s.startsWith('@')) s = '@' + s;
  return s.replace(/[^@a-z0-9_а-яё]/gi, '');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `https://${req.headers.host || 'youchat-msg.ru'}`);
  const p = url.pathname;
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  if (p === '/api/auth/login' && req.method === 'POST') {
    const handle = normalizeHandle(body.handle);
    if (handle.length < 2) return res.status(400).json({ error: 'Введите корректный @username' });
    if (!db.users[handle]) {
      db.users[handle] = { handle, name: handle.slice(1), avatar: '😎', bio: 'В сети YouChat' };
      saveDb();
    }
    return res.status(200).json({ user: db.users[handle] });
  }

  if (p === '/api/users' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const list = Object.values(db.users).filter(
      (u) => u.handle.includes(q) || u.name.toLowerCase().includes(q)
    );
    return res.status(200).json({ users: list });
  }

  if (p === '/api/profile/update' && req.method === 'POST') {
    const handle = normalizeHandle(body.handle);
    if (!db.users[handle]) return res.status(404).json({ error: 'Пользователь не найден' });
    db.users[handle] = {
      ...db.users[handle],
      name: body.name || db.users[handle].name,
      avatar: body.avatar || db.users[handle].avatar,
      bio: body.bio !== undefined ? body.bio : db.users[handle].bio,
    };
    saveDb();
    return res.status(200).json({ user: db.users[handle] });
  }

  if (p === '/api/messages' && req.method === 'GET') {
    const me = normalizeHandle(url.searchParams.get('me'));
    const peer = url.searchParams.get('peer') === 'fav' ? 'fav' : normalizeHandle(url.searchParams.get('peer'));
    const msgs = db.messages.filter((m) =>
      peer === 'fav'
        ? m.from === me && m.to === 'fav'
        : (m.from === me && m.to === peer) || (m.from === peer && m.to === me)
    );
    return res.status(200).json({ messages: msgs });
  }

  if (p === '/api/messages/send' && req.method === 'POST') {
    const from = normalizeHandle(body.from);
    const to = body.to === 'fav' ? 'fav' : normalizeHandle(body.to);
    if (!from || !to) return res.status(400).json({ error: 'Invalid from/to' });
    const msg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      from,
      to,
      kind: body.kind || 'text',
      text: body.text || '',
      bg: body.bg,
      mediaType: body.mediaType,
      mediaUrl: body.mediaUrl,
      audio: body.audio,
      duration: body.duration,
      transcript: body.transcript,
      time: body.time || '',
      ts: Date.now(),
    };
    db.messages.push(msg);
    saveDb();
    return res.status(200).json({ message: msg });
  }

  if (p === '/api/qr-login/create' && req.method === 'POST') {
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    db.qrSessions[token] = { status: 'pending', handle: null };
    saveDb();
    return res.status(200).json({ token });
  }

  if (p === '/api/qr-login/status' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const sess = db.qrSessions[token];
    if (!sess) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({
      status: sess.status,
      user: sess.handle ? db.users[sess.handle] : null,
    });
  }

  if (p === '/api/qr-login/confirm' && req.method === 'POST') {
    const sess = db.qrSessions[body.token];
    const handle = normalizeHandle(body.handle);
    if (!sess || !db.users[handle]) return res.status(400).json({ error: 'Invalid token or user' });
    sess.status = 'confirmed';
    sess.handle = handle;
    saveDb();
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
};
