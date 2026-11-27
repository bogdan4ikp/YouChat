const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VK_APP_ID = '54926583';
const VK_CLIENT_SECRET = '5CLje5kqaETUa4Bq8a6c';
const VK_SERVICE_TOKEN = '3a6ce4ff3a6ce4ff3a6ce4ffbd392af80833a6c3a6ce4ff516565471deecbd191c223cf';

function fetchJson(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const PORT = 4173;
const DATA_FILE = path.join(__dirname, 'youchat-data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

let db = {
  users: {},       // handle -> { handle, name, avatar, bio }
  messages: [],    // { id, from, to, kind, text, bg, mediaType, mediaUrl, audio, duration, transcript, time, ts }
  qrSessions: {},  // token -> { status: 'pending' | 'confirmed', handle: string | null }
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

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

function normalizeHandle(h) {
  let s = String(h || '').trim().toLowerCase();
  if (!s) return '';
  if (!s.startsWith('@')) s = '@' + s;
  return s.replace(/[^@a-z0-9_]/g, '');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // API Routes
  if (p === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const handle = normalizeHandle(body.handle);
    if (handle.length < 2) return sendJson(res, 400, { error: 'Введите корректный @username' });

    if (!db.users[handle]) {
      db.users[handle] = {
        handle,
        name: handle.slice(1),
        avatar: '😎',
        bio: 'В сети YouChat',
      };
      saveDb();
    }
    return sendJson(res, 200, { user: db.users[handle] });
  }

  if (p === '/api/users' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const list = Object.values(db.users).filter(
      (u) => u.handle.includes(q) || u.name.toLowerCase().includes(q)
    );
    return sendJson(res, 200, { users: list });
  }

  if (p === '/api/profile/update' && req.method === 'POST') {
    const body = await readBody(req);
    const handle = normalizeHandle(body.handle);
    if (!db.users[handle]) return sendJson(res, 404, { error: 'Пользователь не найден' });
    db.users[handle] = {
      ...db.users[handle],
      name: body.name || db.users[handle].name,
      avatar: body.avatar || db.users[handle].avatar,
      bio: body.bio !== undefined ? body.bio : db.users[handle].bio,
    };
    saveDb();
    return sendJson(res, 200, { user: db.users[handle] });
  }

  if (p === '/api/messages' && req.method === 'GET') {
    const me = normalizeHandle(url.searchParams.get('me'));
    const peer = normalizeHandle(url.searchParams.get('peer'));
    const msgs = db.messages.filter((m) =>
      peer === 'fav'
        ? m.from === me && m.to === 'fav'
        : (m.from === me && m.to === peer) || (m.from === peer && m.to === me)
    );
    return sendJson(res, 200, { messages: msgs });
  }

  if (p === '/api/messages/send' && req.method === 'POST') {
    const body = await readBody(req);
    const from = normalizeHandle(body.from);
    const to = body.to === 'fav' ? 'fav' : normalizeHandle(body.to);
    if (!from || !to) return sendJson(res, 400, { error: 'Invalid from/to' });
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
    return sendJson(res, 200, { message: msg });
  }

  if (p === '/api/auth/vk' && req.method === 'GET') {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${PORT}`;
    const redirectUri = `${proto}://${host}/api/auth/vk/callback`;
    const vkAuthUrl = `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}&display=page&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&v=5.199`;
    res.writeHead(302, { Location: vkAuthUrl });
    res.end();
    return;
  }

  if (p === '/api/auth/vk/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(302, { Location: '/?vk_error=no_code' });
      res.end();
      return;
    }
    try {
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || `localhost:${PORT}`;
      const redirectUri = `${proto}://${host}/api/auth/vk/callback`;
      const tokenData = await fetchJson(
        `https://oauth.vk.com/access_token?client_id=${VK_APP_ID}&client_secret=${VK_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`
      );
      if (tokenData.error || !tokenData.user_id) {
        res.writeHead(302, { Location: `/?vk_error=${encodeURIComponent(tokenData.error_description || 'vk_auth_failed')}` });
        res.end();
        return;
      }
      const userId = String(tokenData.user_id);
      let name = `VK User ${userId}`;
      let avatar = '🔵';
      let handle = `@vk_${userId}`;
      try {
        const profileData = await fetchJson(
          `https://api.vk.com/method/users.get?user_ids=${userId}&fields=photo_200,screen_name&access_token=${tokenData.access_token || VK_SERVICE_TOKEN}&v=5.199`
        );
        const vkUser = profileData.response && profileData.response[0];
        if (vkUser) {
          name = `${vkUser.first_name || ''} ${vkUser.last_name || ''}`.trim() || name;
          if (vkUser.screen_name) handle = normalizeHandle(vkUser.screen_name) || handle;
          if (vkUser.photo_200) avatar = vkUser.photo_200;
        }
      } catch {}
      db.users[handle] = {
        ...(db.users[handle] || {}),
        handle,
        name,
        avatar,
        bio: 'Вход через ВКонтакте',
        vkId: userId,
      };
      saveDb();
      res.writeHead(302, { Location: `/?vk_login=${encodeURIComponent(handle)}` });
      res.end();
      return;
    } catch {
      res.writeHead(302, { Location: '/?vk_error=server_error' });
      res.end();
      return;
    }
  }

  if (p === '/api/qr-login/create' && req.method === 'POST') {
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const expiresAt = Date.now() + 30000;
    db.qrSessions[token] = { status: 'pending', handle: null, expiresAt };
    return sendJson(res, 200, { token, expiresAt });
  }

  if (p === '/api/qr-login/status' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const sess = db.qrSessions[token];
    if (!sess) return sendJson(res, 404, { error: 'Not found' });
    if (sess.status === 'pending' && sess.expiresAt && Date.now() > sess.expiresAt) {
      return sendJson(res, 200, { status: 'expired', user: null });
    }
    return sendJson(res, 200, {
      status: sess.status,
      user: sess.handle ? db.users[sess.handle] : null,
    });
  }

  if (p === '/api/qr-login/confirm' && req.method === 'POST') {
    const body = await readBody(req);
    const sess = db.qrSessions[body.token];
    const handle = normalizeHandle(body.handle);
    if (!sess || !db.users[handle]) return sendJson(res, 400, { error: 'Invalid token or user' });
    if (sess.expiresAt && Date.now() > sess.expiresAt) {
      return sendJson(res, 400, { error: 'QR-код истёк, отсканируйте новый' });
    }
    sess.status = 'confirmed';
    sess.handle = handle;
    return sendJson(res, 200, { ok: true });
  }

  // Static files
  const urlPath = p === '/' ? '/index.html' : p;
  const filePath = path.join(__dirname, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let lanIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
  }
  console.log(`YouChat Local: http://localhost:${PORT}`);
  console.log(`YouChat LAN:   http://${lanIp}:${PORT}`);
});
