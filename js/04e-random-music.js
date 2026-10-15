/* One background player. Input tickets survive recognition, never a later input.
   Movement calls boardStarted exactly once from its first non-zero tween update. */
function createHallMusic({ audio, loadTracks, now = () => performance.now(), setTimer = setTimeout,
  clearTimer = clearTimeout, random = Math.random, onState = () => {}, legacyStop = () => {} } = {}) {
  let epoch = 0, ticket = null, task = null, catalogPromise = null, lastPlayed = null;
  let budgetTimer = 0, loadTimer = 0, detach = () => {}, attemptSerial = 0;
  const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
  audio.preload = 'none'; audio.loop = false; audio.volume = 0.65;
  function state(value, detail = '') { onState({ state: value, detail, track: task?.track || null, input: ticket?.reason || '', epoch }); }
  function cleanAttempt() { detach(); detach = () => {}; clearTimer(loadTimer); loadTimer = 0; attemptSerial++; }
  function resetAudio() { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  function stop(reason = 'stopped') {
    epoch++; ticket = null; task = null; cleanAttempt(); clearTimer(budgetTimer); budgetTimer = 0;
    resetAudio(); state('idle', reason);
  }
  function isCurrent(value) { return !!value && value === ticket && value.id === epoch; }
  function current(t) { return task === t && isCurrent(t.ticket); }
  function prime(value) {
    // Same element, silent PCM, invoked synchronously inside a genuine input gesture.
    // Browsers may still refuse delayed playback; the actual play() is always caught.
    audio.src = SILENCE;
    try { Promise.resolve(audio.play()).then(() => {
      if (isCurrent(value) && !task && audio.src === SILENCE) audio.pause();
    }).catch(() => {}); } catch (_) { /* actual track reports its permission failure */ }
  }
  function beginInput(reason, gesture = false) {
    stop('new-input'); ticket = Object.freeze({ id: epoch, reason }); legacyStop();
    if (gesture) prime(ticket);
    state('armed'); return ticket;
  }
  function tracks() {
    if (!catalogPromise) catalogPromise = Promise.resolve().then(loadTracks).then(items => {
      const valid = items.filter(t => {
        try { const u = new URL(t.url); return u.protocol === 'https:' && /\.(mp3|ogg|wav|m4a|aac)$/i.test(u.pathname); } catch (_) { return false; }
      });
      if (!valid.length) throw new Error('empty music catalogue'); return valid;
    }).catch(e => { catalogPromise = null; throw e; });
    return catalogPromise;
  }
  function fail(t, message) { if (!current(t)) return; cleanAttempt(); clearTimer(budgetTimer); budgetTimer = 0; resetAudio(); t.state = 'failed'; state('failed', message); }
  function aliveAttempt(t, serial, url) {
    return current(t) && attemptSerial === serial && audio.src === url;
  }
  function markPlaying(t, serial, url) {
    if (!aliveAttempt(t, serial, url) || audio.paused || t.state === 'blocked') return;
    clearTimer(loadTimer); loadTimer = 0; t.state = 'playing'; lastPlayed = t.track.id;
    if (t.deadline == null) t.deadline = now() + 30000;
    if (now() >= t.deadline) { stop('30-second-limit'); return; }
    if (!budgetTimer) budgetTimer = setTimer(() => { if (current(t)) stop('30-second-limit'); }, t.deadline - now());
    state('playing');
  }
  function requestPlay(t, serial, url) {
    if (!aliveAttempt(t, serial, url)) return;
    try { Promise.resolve(audio.play()).catch(e => {
      if (!aliveAttempt(t, serial, url)) return;
      if (e?.name === 'NotAllowedError') {
        clearTimer(loadTimer); loadTimer = 0; t.state = 'blocked'; state('blocked', '开启声音');
      } else if (e?.name !== 'AbortError') retry(t, serial);
      else if (current(t)) fail(t, '播放被中断，请点击开启声音重试');
    }); } catch (e) {
      if (e?.name === 'NotAllowedError') { clearTimer(loadTimer); t.state = 'blocked'; state('blocked', '开启声音'); }
      else retry(t, serial);
    }
  }
  function retry(t, serial) {
    if (!current(t) || serial !== attemptSerial) return;
    cleanAttempt(); resetAudio();
    if (t.deadline != null && now() >= t.deadline) { stop('30-second-limit'); return; }
    if (t.attempts >= 3) { fail(t, '音乐暂时无法播放，可点击开启声音重试'); return; }
    void choose(t);
  }
  async function choose(t) {
    if (!current(t)) return;
    t.state = 'loading'; state('loading');
    let list;
    try { list = await tracks(); } catch (_) { fail(t, '音乐库暂时无法读取，可点击开启声音重试'); return; }
    if (!current(t)) return;
    let pool = list.filter(x => !t.tried.has(x.id) && (list.length < 2 || x.id !== lastPlayed));
    if (!pool.length) pool = list.filter(x => !t.tried.has(x.id));
    if (!pool.length) { fail(t, '没有其他可播放曲目'); return; }
    cleanAttempt(); resetAudio();
    t.track = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    t.tried.add(t.track.id); t.attempts++;
    const serial = attemptSerial, url = new URL(t.track.url).href;
    const playing = () => markPlaying(t, serial, url);
    const ended = () => { if (aliveAttempt(t, serial, url)) stop('track-ended'); };
    const error = () => { if (aliveAttempt(t, serial, url)) retry(t, serial); };
    audio.addEventListener('playing', playing); audio.addEventListener('ended', ended); audio.addEventListener('error', error);
    detach = () => { audio.removeEventListener('playing', playing); audio.removeEventListener('ended', ended); audio.removeEventListener('error', error); };
    audio.src = url; audio.load();
    loadTimer = setTimer(() => { if (aliveAttempt(t, serial, url)) retry(t, serial); }, 8000);
    legacyStop(); requestPlay(t, serial, url);
  }
  function boardStarted(value) {
    if (!isCurrent(value) || task) return;
    task = { ticket: value, state: 'loading', track: null, attempts: 0, tried: new Set(), deadline: null };
    void choose(task);
  }
  function resume() {
    const t = task; if (!t || !current(t)) return;
    if (t.deadline != null && now() >= t.deadline) { stop('30-second-limit'); return; }
    legacyStop();
    if (t.state === 'blocked' && t.track) {
      t.state = 'loading'; state('loading');
      const serial = attemptSerial, url = new URL(t.track.url).href;
      loadTimer = setTimer(() => { if (aliveAttempt(t, serial, url)) retry(t, serial); }, 8000);
      requestPlay(t, serial, url); // directly in the button gesture, with no intervening await
    } else if (t.state === 'failed') {
      prime(t.ticket);
      t.attempts = 0; t.tried.clear(); void choose(t);
    }
  }
  return { beginInput, isCurrent, boardStarted, resume, stop, preload: () => tracks().catch(() => {}),
    ownsBackground: () => !!ticket,
    get snapshot() { return { epoch, input: ticket?.reason, state: task?.state || (ticket ? 'armed' : 'idle'),
      track: task?.track?.id || null, deadline: task?.deadline ?? null, attempts: task?.attempts || 0 }; } };
}
const HallMusic = (() => {
  const audio = new Audio();
  const button = document.createElement('button'); button.type = 'button'; button.className = 'iconbtn';
  button.id = 'musicEnable'; button.textContent = '开启声音'; button.hidden = true; button.style.display = 'none';
  button.setAttribute('aria-label', '开启当前棋盘音乐');
  (document.querySelector('.tools') || document.body).appendChild(button);
  const api = createHallMusic({ audio,
    loadTracks: async () => { const r = await fetch('data/random-music.json?v=b7d1caef013043d2', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return (await r.json()).tracks; },
    legacyStop: () => { Sound.suspendForMusic(); if (typeof setSoundBtn === 'function') setSoundBtn(); },
    onState: value => {
      const sceneCanvas = document.getElementById('scene');
      if (sceneCanvas) { sceneCanvas.dataset.musicState = value.state; sceneCanvas.dataset.musicTrack = value.track?.id || ''; sceneCanvas.dataset.musicInput = value.input; }
      button.hidden = !['blocked', 'failed'].includes(value.state);
      button.style.display = button.hidden ? 'none' : '';
      button.title = value.detail || '开启当前棋盘音乐';
      if (['blocked', 'failed'].includes(value.state) && typeof toast === 'function') toast(value.detail);
    },
  });
  api.preload(); // catalogue only; no audio request or playback before movement
  button.addEventListener('click', () => api.resume());
  window.addEventListener('pagehide', () => api.stop('pagehide'));
  window.addEventListener('beforeunload', () => api.stop('beforeunload'));
  return api;
})();
function musicGesture() { return !!navigator.userActivation?.isActive; }

