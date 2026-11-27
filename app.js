const STORAGE_KEY = 'youchat_local_v1';

const defaultState = {
  activeView: 'chats',
  activeChatId: 'fav',
  chatFilter: 'all',
  profile: {
    name: 'Богдан',
    handle: '@bogdan_yc',
    avatar: '😎',
    bio: 'Дизайн, код и ночные разговоры в YouChat 🌙',
  },
  chats: [
    {
      id: 'fav',
      name: 'Избранное',
      avatar: '🔖',
      type: 'direct',
      online: true,
      status: 'ваши сохранённые сообщения',
      unread: 0,
      messages: [],
    },
  ],
  stickers: [],
  notifications: [
    { id: 'n1', text: 'Добро пожаловать в YouChat! Переписка сохраняется локально.', time: 'сейчас', unread: false },
  ],
};

const OLD_DEFAULT_STICKERS = new Set([
  '🔥|#27272a',
  '😂|#27272a',
  '❤️|#3f1d2b',
  '🌙|#1e293b',
  'ОК|#14532d',
]);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    const cleanedStickers = (parsed.stickers || []).filter((s) => {
      if (s.mediaType) return true;
      return !OLD_DEFAULT_STICKERS.has(`${s.text}|${s.bg}`);
    });
    return {
      ...structuredClone(defaultState),
      ...parsed,
      stickers: cleanedStickers,
      profile: { ...defaultState.profile, ...(parsed.profile || {}) },
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      profile: state.profile,
      chats: state.chats,
      stickers: state.stickers,
    }));
  } catch {}
}

const state = loadState();

// Navigation
document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    state.activeView = view;
    document.querySelectorAll('.nav-item[data-view]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
  });
});

// Chat filters with sliding pill animation
const filterIndicator = document.getElementById('chatFilterIndicator');
function moveFilterIndicator(tab) {
  if (!filterIndicator || !tab) return;
  filterIndicator.style.width = `${tab.offsetWidth}px`;
  filterIndicator.style.transform = `translateX(${tab.offsetLeft - 4}px)`;
}

document.querySelectorAll('#chatFilterTabs .seg-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#chatFilterTabs .seg-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    moveFilterIndicator(tab);
    state.chatFilter = tab.dataset.filter;
    renderChatList();
  });
});

window.addEventListener('resize', () => {
  moveFilterIndicator(document.querySelector('#chatFilterTabs .seg-tab.active'));
});
requestAnimationFrame(() => {
  moveFilterIndicator(document.querySelector('#chatFilterTabs .seg-tab.active'));
});

document.getElementById('chatSearchInput').addEventListener('input', renderChatList);

function renderChatList() {
  const query = document.getElementById('chatSearchInput').value.trim().toLowerCase();
  const listEl = document.getElementById('chatList');
  listEl.innerHTML = '';

  const filtered = state.chats.filter((c) => {
    const matchesFilter = state.chatFilter === 'all' || c.type === state.chatFilter;
    const matchesQuery = c.name.toLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });

  filtered.forEach((chat) => {
    const lastMsg = chat.messages[chat.messages.length - 1];
    const item = document.createElement('div');
    item.className = `chat-item ${chat.id === state.activeChatId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="avatar-wrap">
        <div class="avatar">${chat.avatar}</div>
        <span class="status-dot ${chat.online ? 'online' : ''}"></span>
      </div>
      <div class="chat-meta">
        <div class="chat-top-row">
          <span class="chat-name">${chat.name}</span>
          <span class="chat-time">${lastMsg ? lastMsg.time : ''}</span>
        </div>
        <div class="chat-bottom-row">
          <span class="chat-preview">${lastMsg ? lastMsg.text : 'Нет сообщений'}</span>
          ${chat.unread > 0 ? `<span class="unread-pill">${chat.unread}</span>` : ''}
        </div>
      </div>
    `;
    item.addEventListener('click', () => {
      state.activeChatId = chat.id;
      chat.unread = 0;
      updateUnreadBadge();
      renderChatList();
      renderActiveChat();
      document.querySelector('.chats-layout').classList.add('chat-open');
    });
    listEl.appendChild(item);
  });
}

function updateUnreadBadge() {
  const total = state.chats.reduce((acc, c) => acc + c.unread, 0);
  const badge = document.getElementById('totalUnreadBadge');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'inline-block' : 'none';
}

function renderActiveChat() {
  const chat = state.chats.find((c) => c.id === state.activeChatId);
  if (!chat) return;

  document.getElementById('activeChatAvatar').textContent = chat.avatar;
  document.getElementById('activeChatName').textContent = chat.name;
  document.getElementById('activeChatStatus').textContent = chat.status;
  const dot = document.getElementById('activeChatStatusDot');
  dot.className = `status-dot ${chat.online ? 'online' : ''}`;

  const area = document.getElementById('messagesArea');
  area.innerHTML = '';
  if (chat.messages.length === 0) {
    area.innerHTML = `
      <div class="empty-chat-card">
        <div class="empty-chat-title">Здесь пока ничего нет...</div>
        <div class="empty-chat-sub">Отправьте сообщение, стикер или запишите голосовое.</div>
      </div>
    `;
    return;
  }
  chat.messages.forEach((m, idx) => {
    const row = document.createElement('div');
    row.className = `msg-row ${m.from === 'me' ? 'outgoing' : 'incoming'}`;

    if (m.kind === 'audio' && m.audio) {
      const heights = [35, 65, 90, 50, 80, 100, 60, 40, 85, 70, 45, 95, 55, 75, 40, 60];
      const waveHtml = heights.map((h) => `<span style="height:${h}%"></span>`).join('');
      const dur = m.duration || '0:01';
      row.innerHTML = `
        <div class="voice-msg-wrap">
          <button type="button" class="transcribe-btn ${m.showTranscript ? 'active' : ''}" title="Транскрибировать в текст">→А</button>
          <div class="voice-bubble">
            <button type="button" class="voice-play-btn">▶</button>
            <div class="voice-wave">${waveHtml}</div>
            <span class="voice-duration">${dur}</span>
          </div>
        </div>
        ${m.showTranscript ? `<div class="voice-transcript">${escapeHtml(m.transcript || 'Речь не распознана')}</div>` : ''}
        <span class="msg-time">${m.time}</span>
      `;

      const audio = new Audio(m.audio);
      const playBtn = row.querySelector('.voice-play-btn');
      const bars = row.querySelectorAll('.voice-wave span');

      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          audio.play();
          playBtn.textContent = '⏸';
        } else {
          audio.pause();
          playBtn.textContent = '▶';
        }
      });

      audio.addEventListener('timeupdate', () => {
        const progress = audio.duration ? audio.currentTime / audio.duration : 0;
        const activeCount = Math.floor(progress * bars.length);
        bars.forEach((b, i) => b.classList.toggle('played', i <= activeCount));
      });

      audio.addEventListener('ended', () => {
        playBtn.textContent = '▶';
        bars.forEach((b) => b.classList.remove('played'));
      });

      row.querySelector('.transcribe-btn').addEventListener('click', () => {
        m.showTranscript = !m.showTranscript;
        saveState();
        renderActiveChat();
      });
    } else if (m.kind === 'image') {
      row.innerHTML = `
        <div class="msg-image-bubble">
          <img src="${m.mediaUrl}" alt="${escapeHtml(m.text || 'Изображение')}" />
          ${m.text ? `<div class="msg-image-caption">${escapeHtml(m.text)}</div>` : ''}
        </div>
        <span class="msg-time">${m.time}</span>
      `;
    } else if (m.kind === 'sticker') {
      if (m.mediaType === 'image') {
        row.innerHTML = `
          <img class="msg-sticker-media" src="${m.mediaUrl}" alt="Стикер" style="cursor:pointer;" title="Нажмите, чтобы сохранить или удалить" />
          <span class="msg-time">${m.time}</span>
        `;
      } else if (m.mediaType === 'video') {
        row.innerHTML = `
          <video class="msg-sticker-media" src="${m.mediaUrl}" autoplay loop muted playsinline style="cursor:pointer;" title="Нажмите, чтобы сохранить или удалить"></video>
          <span class="msg-time">${m.time}</span>
        `;
      } else {
        row.innerHTML = `
          <div class="msg-sticker" style="background:${m.bg || '#27272a'};cursor:pointer;" title="Нажмите, чтобы сохранить или удалить">${escapeHtml(m.text)}</div>
          <span class="msg-time">${m.time}</span>
        `;
      }

      const stickerEl = row.querySelector('.msg-sticker-media, .msg-sticker');
      stickerEl.addEventListener('click', () => {
        openStickerActionModal(m);
      });
    } else {
      row.innerHTML = `
        <div class="msg-bubble">${escapeHtml(m.text || '')}</div>
        <span class="msg-time">${m.time}</span>
      `;
    }

    area.appendChild(row);
  });
  area.scrollTop = area.scrollHeight;
}

document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return;

  const chat = state.chats.find((c) => c.id === state.activeChatId);
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  chat.messages.push({ from: 'me', text, time });
  input.value = '';
  voiceBtn.style.display = 'flex';
  sendBtn.style.display = 'none';
  saveState();
  syncProfileUI();
  renderActiveChat();
  renderChatList();
  window.YouChatAPI.sendMessage({
    from: state.profile.handle,
    to: chat.id,
    kind: 'text',
    text,
    time,
  }).catch(() => {});
});

// Notifications
function renderNotifications() {
  const list = document.getElementById('notifList');
  list.innerHTML = '';
  state.notifications.forEach((n) => {
    const row = document.createElement('div');
    row.className = `notif-item ${n.unread ? 'unread' : ''}`;
    row.innerHTML = `
      <span>${escapeHtml(n.text)}</span>
      <span class="chat-time">${n.time}</span>
    `;
    list.appendChild(row);
  });
}

document.getElementById('markAllReadBtn').addEventListener('click', () => {
  state.notifications.forEach((n) => (n.unread = false));
  renderNotifications();
});

// Global Search by @username
async function renderGlobalSearch() {
  const rawQ = document.getElementById('globalSearchInput').value.trim();
  const q = rawQ.toLowerCase();
  const res = document.getElementById('globalSearchResults');
  res.innerHTML = '';

  let usersList = [];
  try {
    const data = await window.YouChatAPI.getUsers(q);
    if (data && Array.isArray(data.users)) usersList = data.users;
  } catch {}

  const seen = new Set();
  const items = [];

  usersList.forEach((u) => {
    if (u.handle === state.profile.handle || seen.has(u.handle)) return;
    seen.add(u.handle);
    items.push({ id: u.handle, name: u.name || u.handle, avatar: u.avatar || '👤', status: u.handle });
  });

  state.chats.forEach((c) => {
    if (seen.has(c.id)) return;
    if (!q || c.name.toLowerCase().includes(q) || (c.status && c.status.toLowerCase().includes(q))) {
      seen.add(c.id);
      items.push(c);
    }
  });

  // If user typed a @username that isn't in list yet, allow starting a chat directly
  if (rawQ.length >= 2) {
    const targetHandle = (rawQ.startsWith('@') ? rawQ : '@' + rawQ).toLowerCase().replace(/[^@a-z0-9_]/g, '');
    if (targetHandle.length >= 2 && targetHandle !== state.profile.handle && !seen.has(targetHandle)) {
      items.unshift({
        id: targetHandle,
        name: targetHandle.slice(1),
        avatar: '👤',
        status: `Начать чат с ${targetHandle}`,
        isNew: true,
      });
    }
  }

  if (items.length === 0) {
    res.innerHTML = '<div class="post-time" style="padding:8px 4px;">Введите @username, чтобы найти человека и начать чат</div>';
    return;
  }

  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'search-user-row';
    row.innerHTML = `
      <div class="chat-header-user">
        <div class="avatar small">${c.avatar}</div>
        <div>
          <div class="post-author">${escapeHtml(c.name)}</div>
          <div class="post-time">${escapeHtml(c.status || '')}</div>
        </div>
      </div>
      <button class="pill-btn secondary">${c.isNew ? 'Написать' : 'Открыть'}</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      if (!state.chats.some((ch) => ch.id === c.id)) {
        state.chats.push({
          id: c.id,
          name: c.name,
          avatar: c.avatar,
          type: 'direct',
          online: true,
          status: c.id,
          unread: 0,
          messages: [],
        });
        saveState();
      }
      state.activeChatId = c.id;
      document.querySelector('.nav-item[data-view="chats"]').click();
      renderChatList();
      renderActiveChat();
      document.querySelector('.chats-layout').classList.add('chat-open');
    });
    res.appendChild(row);
  });
}

document.getElementById('globalSearchInput').addEventListener('input', renderGlobalSearch);

// Profile Edit Modal
const modal = document.getElementById('editProfileModal');
document.getElementById('editProfileBtn').addEventListener('click', () => {
  document.getElementById('editAvatarInput').value = state.profile.avatar;
  document.getElementById('editNameInput').value = state.profile.name;
  document.getElementById('editHandleInput').value = state.profile.handle;
  document.getElementById('editBioInput').value = state.profile.bio;
  modal.classList.add('open');
});

document.getElementById('cancelEditProfile').addEventListener('click', () => {
  modal.classList.remove('open');
});

document.getElementById('saveEditProfile').addEventListener('click', () => {
  state.profile.avatar = document.getElementById('editAvatarInput').value || '😎';
  state.profile.name = document.getElementById('editNameInput').value.trim() || 'Богдан';
  state.profile.handle = document.getElementById('editHandleInput').value.trim() || '@bogdan_yc';
  state.profile.bio = document.getElementById('editBioInput').value.trim();
  saveState();
  syncProfileUI();
  modal.classList.remove('open');
});

function syncProfileUI() {
  document.getElementById('profileAvatar').textContent = state.profile.avatar;
  document.getElementById('profileName').textContent = state.profile.name;
  document.getElementById('profileHandle').textContent = state.profile.handle;
  document.getElementById('profileHandleRow').textContent = state.profile.handle;
  document.getElementById('profileBio').textContent = state.profile.bio || 'Не указано';
  const fav = state.chats.find((c) => c.id === 'fav');
  document.getElementById('profileMsgCount').textContent = fav ? fav.messages.length : 0;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.getElementById('mobileBackBtn').addEventListener('click', () => {
  document.querySelector('.chats-layout').classList.remove('chat-open');
});

// Stickers
const stickerDrawer = document.getElementById('stickerDrawer');
const stickerGrid = document.getElementById('stickerGrid');
const createStickerModal = document.getElementById('createStickerModal');

document.getElementById('emojiBtn').addEventListener('click', () => {
  stickerDrawer.classList.toggle('open');
});

function renderStickers() {
  stickerGrid.innerHTML = '';
  if (state.stickers.length === 0) {
    stickerGrid.innerHTML = '<div style="font-size:12.5px;color:var(--text-secondary);padding:8px 4px;">Стикеров пока нет — нажми «+ Создать стикер»</div>';
    return;
  }
  state.stickers.forEach((s) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'sticker-item';
    el.style.background = s.bg || '#27272a';
    if (s.mediaType === 'image') {
      el.innerHTML = `<img src="${s.mediaUrl}" alt="Стикер" />`;
    } else if (s.mediaType === 'video') {
      el.innerHTML = `<video src="${s.mediaUrl}" autoplay loop muted playsinline></video>`;
    } else {
      el.textContent = s.text;
    }
    el.addEventListener('click', () => {
      const chat = state.chats.find((c) => c.id === state.activeChatId);
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      chat.messages.push({
        from: 'me',
        kind: 'sticker',
        text: s.text || 'Стикер',
        bg: s.bg,
        mediaType: s.mediaType,
        mediaUrl: s.mediaUrl,
        time,
      });
      saveState();
      syncProfileUI();
      renderActiveChat();
      renderChatList();
      stickerDrawer.classList.remove('open');
    });
    stickerGrid.appendChild(el);
  });
}

document.getElementById('openCreateStickerBtn').addEventListener('click', () => {
  createStickerModal.classList.add('open');
});

document.getElementById('cancelCreateSticker').addEventListener('click', () => {
  createStickerModal.classList.remove('open');
});

document.getElementById('saveCreateSticker').addEventListener('click', () => {
  const fileInput = document.getElementById('stickerMediaInput');
  const file = fileInput.files[0];
  const text = document.getElementById('stickerTextInput').value.trim();
  const bg = document.getElementById('stickerBgInput').value;

  if (file) {
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onloadend = () => {
      if (isVideo) {
        state.stickers.push({ mediaType: 'video', mediaUrl: reader.result, text: 'Видеостикер' });
        saveState();
        renderStickers();
      } else {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const scale = Math.max(size / img.width, size / img.height);
          const x = (size - img.width * scale) / 2;
          const y = (size - img.height * scale) / 2;
          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          state.stickers.push({ mediaType: 'image', mediaUrl: canvas.toDataURL('image/webp', 0.85), text: 'Фотостикер' });
          saveState();
          renderStickers();
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
    createStickerModal.classList.remove('open');
    return;
  }

  if (!text) return;
  state.stickers.push({ text, bg });
  saveState();
  renderStickers();
  document.getElementById('stickerTextInput').value = '';
  createStickerModal.classList.remove('open');
});

// High-quality Voice Recording with live waveform & cancel
let mediaRecorder = null;
let audioChunks = [];
let voiceInterval = null;
let voiceSeconds = 0;
let voiceCancelled = false;
let audioCtx = null;
let animFrameId = null;
let recognition = null;
let liveTranscript = '';
let interimTranscript = '';

const voiceBtn = document.getElementById('voiceBtn');
const voiceTimer = document.getElementById('voiceTimer');
const voiceUI = document.getElementById('voiceRecordingUI');
const msgInput = document.getElementById('messageInput');
const tgInputPill = document.getElementById('tgInputPill');
const sendBtn = document.getElementById('sendBtn');
const cancelVoiceBtn = document.getElementById('cancelVoiceBtn');
const voiceBars = document.querySelectorAll('#voiceBars span');

msgInput.addEventListener('input', () => {
  const hasText = msgInput.value.trim().length > 0;
  voiceBtn.style.display = hasText ? 'none' : 'flex';
  sendBtn.style.display = hasText ? 'flex' : 'none';
});

function stopVoiceUI(stream) {
  clearInterval(voiceInterval);
  cancelAnimationFrame(animFrameId);
  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  voiceUI.style.display = 'none';
  tgInputPill.style.display = 'flex';
  voiceBtn.classList.remove('recording');
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

cancelVoiceBtn.addEventListener('click', () => {
  voiceCancelled = true;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
});

voiceBtn.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    voiceCancelled = false;
    mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
    });

    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 };

    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    voiceSeconds = 0;
    voiceCancelled = false;
    liveTranscript = '';
    interimTranscript = '';
    voiceTimer.textContent = '0:00';

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.lang = 'ru-RU';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            liveTranscript += text + ' ';
          } else {
            interim += text;
          }
        }
        interimTranscript = interim;
      };
      try { recognition.start(); } catch {}
    }
    tgInputPill.style.display = 'none';
    voiceUI.style.display = 'flex';
    voiceBtn.classList.add('recording');

    // Live audio level bars
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 32;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function drawBars() {
      analyser.getByteFrequencyData(dataArray);
      voiceBars.forEach((bar, i) => {
        const val = dataArray[i % dataArray.length] || 0;
        const h = Math.max(4, Math.min(20, (val / 255) * 20));
        bar.style.height = `${h}px`;
      });
      animFrameId = requestAnimationFrame(drawBars);
    }
    drawBars();

    voiceInterval = setInterval(() => {
      voiceSeconds += 1;
      const m = Math.floor(voiceSeconds / 60);
      const s = String(voiceSeconds % 60).padStart(2, '0');
      voiceTimer.textContent = `${m}:${s}`;
    }, 1000);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stopVoiceUI(stream);
      if (voiceCancelled || audioChunks.length === 0) return;

      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const chat = state.chats.find((c) => c.id === state.activeChatId);
        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const m = Math.floor(voiceSeconds / 60);
        const s = String(voiceSeconds % 60).padStart(2, '0');
        const finalText = (liveTranscript + ' ' + interimTranscript).trim();
        chat.messages.push({
          from: 'me',
          kind: 'audio',
          text: '🎤 Голосовое сообщение',
          audio: reader.result,
          duration: `${m}:${s}`,
          transcript: finalText || 'Речь не распознана (проверь микрофон или открой через localhost)',
          showTranscript: false,
          time,
        });
        saveState();
        syncProfileUI();
        renderActiveChat();
        renderChatList();
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
  } catch {
    alert('Нет доступа к микрофону. Разреши доступ в браузере.');
  }
});

// Sticker Action Modal (in-app UI)
const stickerActionModal = document.getElementById('stickerActionModal');
const stickerActionPreview = document.getElementById('stickerActionPreview');
const stickerActionTitle = document.getElementById('stickerActionTitle');
const stickerActionDesc = document.getElementById('stickerActionDesc');
const confirmStickerActionBtn = document.getElementById('confirmStickerAction');
let pendingStickerMsg = null;

function openStickerActionModal(m) {
  pendingStickerMsg = m;
  if (m.mediaType === 'image') {
    stickerActionPreview.innerHTML = `<img class="msg-sticker-media" src="${m.mediaUrl}" alt="Стикер" />`;
  } else if (m.mediaType === 'video') {
    stickerActionPreview.innerHTML = `<video class="msg-sticker-media" src="${m.mediaUrl}" autoplay loop muted playsinline></video>`;
  } else {
    stickerActionPreview.innerHTML = `<div class="msg-sticker" style="background:${m.bg || '#27272a'}">${escapeHtml(m.text)}</div>`;
  }

  const existsIdx = state.stickers.findIndex((s) =>
    m.mediaType ? s.mediaUrl === m.mediaUrl : s.text === m.text && s.bg === m.bg
  );

  if (existsIdx !== -1) {
    stickerActionTitle.textContent = 'Удалить стикер?';
    stickerActionDesc.textContent = 'Этот стикер уже есть в вашей коллекции.';
    confirmStickerActionBtn.textContent = 'Удалить';
    confirmStickerActionBtn.style.background = '#ef4444';
    confirmStickerActionBtn.style.color = '#fff';
  } else {
    stickerActionTitle.textContent = 'Сохранить стикер?';
    stickerActionDesc.textContent = 'Добавить этот стикер в вашу коллекцию.';
    confirmStickerActionBtn.textContent = 'Сохранить';
    confirmStickerActionBtn.style.background = '';
    confirmStickerActionBtn.style.color = '';
  }

  stickerActionModal.classList.add('open');
}

document.getElementById('cancelStickerAction').addEventListener('click', () => {
  stickerActionModal.classList.remove('open');
  pendingStickerMsg = null;
});

confirmStickerActionBtn.addEventListener('click', () => {
  if (!pendingStickerMsg) return;
  const m = pendingStickerMsg;
  const existsIdx = state.stickers.findIndex((s) =>
    m.mediaType ? s.mediaUrl === m.mediaUrl : s.text === m.text && s.bg === m.bg
  );

  if (existsIdx !== -1) {
    state.stickers.splice(existsIdx, 1);
  } else {
    state.stickers.push({
      text: m.text,
      bg: m.bg,
      mediaType: m.mediaType,
      mediaUrl: m.mediaUrl,
    });
  }
  saveState();
  renderStickers();
  stickerActionModal.classList.remove('open');
  pendingStickerMsg = null;
});

// My QR & Scanner Modal (for finding account, NOT login)
const myQrModal = document.getElementById('myQrModal');
const myQrCanvas = document.getElementById('myQrCanvas');
const qrTabShow = document.getElementById('qrTabShow');
const qrTabScan = document.getElementById('qrTabScan');
const qrScannerVideo = document.getElementById('qrScannerVideo');
const qrScanResult = document.getElementById('qrScanResult');

document.getElementById('openMyQrBtn').addEventListener('click', () => {
  document.getElementById('qrUserHandle').textContent = state.profile.handle;
  window.YouChatQR.drawQrMatrix(myQrCanvas, `youchat://user/${state.profile.handle}`);
  qrTabShow.style.display = 'block';
  qrTabScan.style.display = 'none';
  document.querySelectorAll('#qrModalTabs .seg-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  myQrModal.classList.add('open');
});

document.querySelectorAll('#qrModalTabs .seg-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#qrModalTabs .seg-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.qrtab === 'show') {
      qrTabShow.style.display = 'block';
      qrTabScan.style.display = 'none';
      window.YouChatQR.stopScanner();
    } else {
      qrTabShow.style.display = 'none';
      qrTabScan.style.display = 'block';
      window.YouChatQR.startScanner(qrScannerVideo, qrScanResult, (raw) => {
        if (raw.startsWith('youchat://user/')) {
          const targetHandle = raw.replace('youchat://user/', '').trim();
          window.YouChatAPI.login(targetHandle).then(({ user }) => {
            if (user && !state.chats.some((c) => c.id === user.handle)) {
              state.chats.push({
                id: user.handle,
                name: user.name || user.handle,
                avatar: user.avatar || '👤',
                type: 'direct',
                online: true,
                status: user.handle,
                unread: 0,
                messages: [],
              });
            }
            state.activeChatId = targetHandle;
            myQrModal.classList.remove('open');
            document.querySelector('.nav-item[data-view="chats"]').click();
            renderChatList();
            renderActiveChat();
          });
        }
      });
    }
  });
});

document.getElementById('closeMyQrModal').addEventListener('click', () => {
  window.YouChatQR.stopScanner();
  myQrModal.classList.remove('open');
});

document.getElementById('downloadQrBtn').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `youchat-${state.profile.handle.replace('@', '')}.png`;
  link.href = myQrCanvas.toDataURL('image/png');
  link.click();
});

const shareChatPickerModal = document.getElementById('shareChatPickerModal');
const shareChatPickerList = document.getElementById('shareChatPickerList');

document.getElementById('shareQrToChatBtn').addEventListener('click', () => {
  shareChatPickerList.innerHTML = '';
  state.chats.forEach((chat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-picker-item';
    btn.innerHTML = `
      <div class="avatar small">${chat.avatar}</div>
      <div>
        <div class="post-author">${escapeHtml(chat.name)}</div>
        <div class="post-time">${escapeHtml(chat.status || '')}</div>
      </div>
    `;
    btn.addEventListener('click', () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      chat.messages.push({
        from: 'me',
        kind: 'image',
        text: `QR-код профиля ${state.profile.handle}`,
        mediaUrl: myQrCanvas.toDataURL('image/png'),
        time,
      });
      state.activeChatId = chat.id;
      saveState();
      syncProfileUI();
      renderActiveChat();
      renderChatList();
      shareChatPickerModal.classList.remove('open');
      window.YouChatQR.stopScanner();
      myQrModal.classList.remove('open');
      document.querySelector('.nav-item[data-view="chats"]').click();
    });
    shareChatPickerList.appendChild(btn);
  });
  shareChatPickerModal.classList.add('open');
});

document.getElementById('cancelShareChatPicker').addEventListener('click', () => {
  shareChatPickerModal.classList.remove('open');
});

document.getElementById('qrFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if ('BarcodeDetector' in window) {
    try {
      const img = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(img);
      qrScanResult.textContent = codes.length > 0 ? `Найдено: ${codes[0].rawValue}` : 'QR-код на фото не найден';
    } catch {
      qrScanResult.textContent = 'Не удалось распознать фото';
    }
  } else {
    qrScanResult.textContent = 'Ваш браузер не поддерживает BarcodeDetector для фото';
  }
});

// Separate QR Login Modal (camera only, no gallery upload)
const qrLoginModal = document.getElementById('qrLoginModal');
const loginQrCanvas = document.getElementById('loginQrCanvas');
const loginTabShow = document.getElementById('loginTabShow');
const loginTabScan = document.getElementById('loginTabScan');
const loginScannerVideo = document.getElementById('loginScannerVideo');
const loginScanResult = document.getElementById('loginScanResult');

function refreshLoginQr() {
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  window.YouChatQR.drawQrMatrix(loginQrCanvas, `youchat-auth://session/${token}`);
}

document.getElementById('openQrLoginBtn').addEventListener('click', () => {
  refreshLoginQr();
  loginTabShow.style.display = 'block';
  loginTabScan.style.display = 'none';
  document.querySelectorAll('#qrLoginTabs .seg-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  qrLoginModal.classList.add('open');
});

document.querySelectorAll('#qrLoginTabs .seg-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#qrLoginTabs .seg-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.logintab === 'show') {
      loginTabShow.style.display = 'block';
      loginTabScan.style.display = 'none';
      window.YouChatQR.stopScanner();
    } else {
      loginTabShow.style.display = 'none';
      loginTabScan.style.display = 'block';
      window.YouChatQR.startScanner(loginScannerVideo, loginScanResult, async (raw) => {
        if (raw.startsWith('youchat-auth://session/')) {
          const token = raw.replace('youchat-auth://session/', '').trim();
          const res = await window.YouChatAPI.confirmQrLogin(token, state.profile.handle);
          loginScanResult.textContent = res.ok ? 'Вход подтверждён!' : 'Неверный или устаревший код';
        }
      });
    }
  });
});

document.getElementById('refreshLoginQrBtn').addEventListener('click', refreshLoginQr);
document.getElementById('closeQrLoginModal').addEventListener('click', () => {
  window.YouChatQR.stopScanner();
  qrLoginModal.classList.remove('open');
});

// Auth & Local Network Sync
const authScreen = document.getElementById('authScreen');
const authQrBox = document.getElementById('authQrBox');
const authQrCanvas = document.getElementById('authQrCanvas');
const authQrTimer = document.getElementById('authQrTimer');
let authQrPoll = null;
let authQrCountdown = null;
let syncInterval = null;

async function enterAccount(user, authMethod) {
  state.profile = { ...state.profile, ...user };
  localStorage.setItem('youchat_current_user', user.handle);
  if (authMethod) localStorage.setItem('youchat_auth_method', authMethod);
  authScreen.classList.remove('open');
  clearInterval(authQrPoll);
  clearInterval(authQrCountdown);
  syncProfileUI();
  await syncNetworkUsersAndMessages();
  clearInterval(syncInterval);
  syncInterval = setInterval(syncNetworkUsersAndMessages, 1800);
}

async function syncNetworkUsersAndMessages() {
  if (!state.profile.handle) return;
  try {
    const { users } = await window.YouChatAPI.getUsers('');
    users.forEach((u) => {
      if (u.handle === state.profile.handle) return;
      if (!state.chats.some((c) => c.id === u.handle)) {
        state.chats.push({
          id: u.handle,
          name: u.name || u.handle,
          avatar: u.avatar || '👤',
          type: 'direct',
          online: true,
          status: u.handle,
          unread: 0,
          messages: [],
        });
      }
    });
    const active = state.chats.find((c) => c.id === state.activeChatId);
    if (active) {
      const { messages } = await window.YouChatAPI.getMessages(state.profile.handle, active.id);
      if (messages && messages.length !== active.messages.length) {
        active.messages = messages.map((m) => ({
          ...m,
          from: m.from === state.profile.handle ? 'me' : 'them',
        }));
        renderActiveChat();
        renderChatList();
      }
    }
  } catch {}
}

document.getElementById('authVkBtn').addEventListener('click', () => {
  const base = location.protocol === 'file:' ? 'http://localhost:4173' : '';
  location.href = `${base}/api/auth/vk`;
});

async function startAuthQrSession() {
  clearInterval(authQrPoll);
  clearInterval(authQrCountdown);
  let secondsLeft = 30;
  if (authQrTimer) authQrTimer.textContent = `Новый код через ${secondsLeft}с`;

  try {
    const { token } = await window.YouChatAPI.createQrLogin();
    if (!token) return;
    requestAnimationFrame(() => {
      window.YouChatQR.drawQrMatrix(authQrCanvas, `youchat-auth://session/${token}`);
    });

    authQrCountdown = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        startAuthQrSession();
      } else if (authQrTimer) {
        authQrTimer.textContent = `Новый код через ${secondsLeft}с`;
      }
    }, 1000);

    authQrPoll = setInterval(async () => {
      try {
        const res = await window.YouChatAPI.getQrLoginStatus(token);
        if (res.status === 'confirmed' && res.user) {
          await enterAccount(res.user, 'qr');
        } else if (res.status === 'expired') {
          startAuthQrSession();
        }
      } catch {}
    }, 1200);
  } catch {
    const fallbackToken = Math.random().toString(36).slice(2, 10);
    window.YouChatQR.drawQrMatrix(authQrCanvas, `youchat-auth://session/${fallbackToken}`);
    authQrCountdown = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) {
        startAuthQrSession();
      } else if (authQrTimer) {
        authQrTimer.textContent = `Новый код через ${secondsLeft}с`;
      }
    }, 1000);
  }
}

document.getElementById('authQrBtn').addEventListener('click', () => {
  authQrBox.style.display = 'block';
  startAuthQrSession();
});

function isDesktopOrTV() {
  const ua = navigator.userAgent || '';
  const isTV = /SmartTV|Tizen|Web0S|BRAVIA|AppleTV|GoogleTV|Android TV|NetCast|Viera/i.test(ua);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isTV || !isMobile;
}

if (!isDesktopOrTV()) {
  const qrDivider = document.getElementById('authQrDivider');
  const qrBtn = document.getElementById('authQrBtn');
  if (qrDivider) qrDivider.style.display = 'none';
  if (qrBtn) qrBtn.style.display = 'none';
  if (authQrBox) authQrBox.style.display = 'none';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('youchat_current_user');
  localStorage.removeItem('youchat_auth_method');
  clearInterval(syncInterval);
  clearInterval(authQrPoll);
  clearInterval(authQrCountdown);
  authQrBox.style.display = 'none';
  authScreen.classList.add('open');
});

// Auto-login if saved (only VK or QR) or returned from VK OAuth
(async () => {
  const params = new URLSearchParams(location.search);
  const vkLogin = params.get('vk_login');
  const vkError = params.get('vk_error');
  if (vkLogin || vkError) {
    history.replaceState(null, '', location.pathname);
  }
  if (vkError) {
    alert(`Ошибка входа через ВКонтакте: ${vkError}`);
  }
  const savedMethod = localStorage.getItem('youchat_auth_method');
  const isValidSaved = savedMethod === 'vk' || savedMethod === 'qr';
  if (!vkLogin && !isValidSaved) {
    localStorage.removeItem('youchat_current_user');
    return;
  }
  const handleToLogin = vkLogin || localStorage.getItem('youchat_current_user');
  if (handleToLogin) {
    try {
      const { user } = await window.YouChatAPI.login(handleToLogin);
      if (user) await enterAccount(user, vkLogin ? 'vk' : savedMethod);
    } catch {}
  }
})();

// Init
updateUnreadBadge();
renderChatList();
renderActiveChat();
renderStickers();
renderNotifications();
renderGlobalSearch();
syncProfileUI();
