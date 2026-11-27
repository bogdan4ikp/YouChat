const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const VK_APP_ID = process.env.VK_APP_ID || '';
const VK_CLIENT_SECRET = process.env.VK_CLIENT_SECRET || '';
const VK_SERVICE_TOKEN = process.env.VK_SERVICE_TOKEN || '';
const VK_OAUTH_STATE_SECRET = process.env.VK_OAUTH_STATE_SECRET || '';
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

function postFormJson(targetUrl, fields) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const body = new URLSearchParams(fields).toString();
    const request = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (resp.statusCode >= 400) return reject(new Error(parsed.error_description || parsed.error || 'VK request failed'));
          resolve(parsed);
        } catch (e) { reject(e); }
      });
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function createVkOAuthContext() {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const payload = Buffer.from(JSON.stringify({ state, verifier, expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', VK_OAUTH_STATE_SECRET).update(payload).digest('base64url');
  return { state, challenge, cookie: payload + '.' + signature };
}

function readVkOAuthContext(req) {
  const raw = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('vk_oauth_ctx='));
  if (!raw) return null;
  const value = decodeURIComponent(raw.slice('vk_oauth_ctx='.length));
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', VK_OAUTH_STATE_SECRET).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.state || !data.verifier || data.expiresAt < Date.now()) return null;
    return data;
  } catch { return null; }
}

const VK_COOKIE_SET = 'vk_oauth_ctx=; Domain=.youchat-msg.ru; Path=/api/auth/vk; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

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
    if (!VK_APP_ID || !VK_OAUTH_STATE_SECRET) {
      return res.status(503).json({ error: 'vk_oauth_not_configured' });
    }
    const oauth = createVkOAuthContext();
    res.setHeader('Set-Cookie', 'vk_oauth_ctx=' + encodeURIComponent(oauth.cookie) + '; Domain=.youchat-msg.ru; Path=/api/auth/vk; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
    const params = new URLSearchParams({
      client_id: VK_APP_ID,
      redirect_uri: VK_REDIRECT_URI,
      origin: 'https://youchat-msg.ru',
      response_type: 'code',
      state: oauth.state,
      code_challenge: oauth.challenge,
      code_challenge_method: 'S256',
      scope: 'vkid.personal_info',
      provider: 'vkid',
      prompt: 'login',
      lang_id: 'ru',
    });
    return res.redirect(302, 'https://id.vk.ru/authorize?' + params.toString());
  }

  if (p === '/api/auth/vk/callback' && req.method === 'GET') {
    const oauth = readVkOAuthContext(req);
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const deviceId = url.searchParams.get('device_id');
    res.setHeader('Set-Cookie', VK_COOKIE_SET);
    if (!oauth || !code || !deviceId || returnedState !== oauth.state) {
      return res.redirect(302, '/?vk_error=state_or_callback_invalid');
    }
    try {
      const tokenUrl = new URL('https://id.vk.ru/oauth2/auth');
      for (const [key, value] of Object.entries({
        grant_type: 'authorization_code',
        redirect_uri: VK_REDIRECT_URI,
        client_id: VK_APP_ID,
        code_verifier: oauth.verifier,
        state: oauth.state,
        device_id: deviceId,
      })) tokenUrl.searchParams.set(key, value);
      const tokenData = await postFormJson(tokenUrl.toString(), { code });
      if (tokenData.error || !tokenData.access_token) {
        return res.redirect(302, '/?vk_error=vk_token_exchange_failed');
      }
      const profileData = await postFormJson(
        'https://id.vk.ru/oauth2/user_info?client_id=' + encodeURIComponent(VK_APP_ID),
        { access_token: tokenData.access_token }
      );
      const user = profileData.user || profileData;
      const userId = String(user.user_id || user.id || tokenData.user_id || '');
      if (!userId) return res.redirect(302, '/?vk_error=vk_profile_missing');
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || ('VK User ' + userId);
      const avatar = user.avatar || user.avatar_url || user.photo_200 || '🔵';
      const handle = '@vk_' + userId;
      db.users[handle] = {
        ...(db.users[handle] || {}),
        handle, name, avatar,
        bio: 'Вход через ВКонтакте',
        vkId: userId,
      };
      saveDb();
      return res.redirect(302, '/?vk_login=' + encodeURIComponent(handle));
    } catch (error) {
      console.error('VK ID callback failed:', error && error.message);
      return res.redirect(302, '/?vk_error=vk_auth_failed');
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
