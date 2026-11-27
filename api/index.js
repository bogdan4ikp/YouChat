const fs = require('fs');
const https = require('https');

const VK_APP_ID = process.env.VK_APP_ID || '';
const VK_CLIENT_SECRET = process.env.VK_CLIENT_SECRET || '';
const VK_SERVICE_TOKEN = process.env.VK_SERVICE_TOKEN || '';
// Always use the single canonical callback registered in the VK application settings.
const VK_REDIRECT_URI = 'https://youchat-msg.ru/api/auth/vk/callback';

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

  if (p === '/api/auth/vk' && req.method === 'GET') {
    if (!VK_APP_ID || !VK_CLIENT_SECRET) {
      return res.status(503).json({ error: 'vk_oauth_not_configured' });
    }
    const redirectUri = VK_REDIRECT_URI;
    const params = new URLSearchParams({ client_id: VK_APP_ID, display: 'page', redirect_uri: redirectUri, response_type: 'code', v: '5.199' });
    const vkAuthUrl = `https://oauth.vk.com/authorize?${params.toString()}`;
    return res.redirect(302, vkAuthUrl);
  }

  if (p === '/api/auth/vk/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) return res.redirect(302, '/?vk_error=no_code');
    try {
      const redirectUri = VK_REDIRECT_URI;
      const tokenData = await fetchJson(
        `https://oauth.vk.com/access_token?client_id=${VK_APP_ID}&client_secret=${VK_CLIENT_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`
      );
      if (tokenData.error || !tokenData.user_id) {
        return res.redirect(302, `/?vk_error=${encodeURIComponent(tokenData.error_description || 'vk_auth_failed')}`);
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
      return res.redirect(302, `/?vk_login=${encodeURIComponent(handle)}`);
    } catch {
      return res.redirect(302, '/?vk_error=server_error');
    }
  }

  if (p === '/api/qr-login/create' && req.method === 'POST') {
    const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const expiresAt = Date.now() + 30000;
    db.qrSessions[token] = { status: 'pending', handle: null, expiresAt };
    saveDb();
    return res.status(200).json({ token, expiresAt });
  }

  if (p === '/api/qr-login/status' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const sess = db.qrSessions[token];
    if (!sess) return res.status(404).json({ error: 'Not found' });
    if (sess.status === 'pending' && sess.expiresAt && Date.now() > sess.expiresAt) {
      return res.status(200).json({ status: 'expired', user: null });
    }
    return res.status(200).json({
      status: sess.status,
      user: sess.handle ? db.users[sess.handle] : null,
    });
  }

  if (p === '/api/qr-login/confirm' && req.method === 'POST') {
    const sess = db.qrSessions[body.token];
    const handle = normalizeHandle(body.handle);
    if (!sess || !db.users[handle]) return res.status(400).json({ error: 'Invalid token or user' });
    if (sess.expiresAt && Date.now() > sess.expiresAt) {
      return res.status(400).json({ error: 'QR-код истёк, отсканируйте новый' });
    }
    sess.status = 'confirmed';
    sess.handle = handle;
    saveDb();
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'Not found' });
};
