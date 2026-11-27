const API_BASE = location.protocol === 'file:' ? 'http://localhost:4173' : '';

window.YouChatAPI = {
  async login(handle) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    return res.json();
  },
  async getUsers(q = '') {
    const res = await fetch(`${API_BASE}/api/users?q=${encodeURIComponent(q)}`);
    return res.json();
  },
  async updateProfile(profile) {
    const res = await fetch(`${API_BASE}/api/profile/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    return res.json();
  },
  async getMessages(me, peer) {
    const res = await fetch(`${API_BASE}/api/messages?me=${encodeURIComponent(me)}&peer=${encodeURIComponent(peer)}`);
    return res.json();
  },
  async sendMessage(payload) {
    const res = await fetch(`${API_BASE}/api/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  async createQrLogin() {
    const res = await fetch(`${API_BASE}/api/qr-login/create`, { method: 'POST' });
    return res.json();
  },
  async getQrLoginStatus(token) {
    const res = await fetch(`${API_BASE}/api/qr-login/status?token=${encodeURIComponent(token)}`);
    return res.json();
  },
  async confirmQrLogin(token, handle) {
    const res = await fetch(`${API_BASE}/api/qr-login/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, handle }),
    });
    return res.json();
  },
};
