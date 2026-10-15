const HALL_MUSIC_MAX_PLAY_MS = 60 * 1000; // Shared by Image, Camera and Text; starts on playing.
/* Music categories come from the source pages and catalogue categories, never titles. */
const HALL_MUSIC_CATEGORIES = Object.freeze({
  'venus-pop': 'Venus · Popular Music', 'diana': 'Diana & Artemis', 'water-nymphs': 'Water Nymphs',
  'venus-classical': 'Venus · Classical Music', 'classical-gallery': 'Classical Recording Gallery', 'background': 'Venus · Background Music'
});
const HALL_MUSIC_POOLS = Object.freeze({ active: ['venus-pop', 'diana', 'water-nymphs'], calm: ['venus-classical', 'classical-gallery'], background: ['background'] });
function hallMusicKey(value) { return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s_\-·&/+（）(),.]+/g, ''); }
function hallMusicPose(value) {
  const aliases = {
    standing: ['standing', 'stand', 'upright', 'upright_unspecified', '站立', '直立', '直立（未细分）'],
    walking: ['walking', 'walk', '行走'], seated: ['seated', 'sitting', 'sit', '坐', '坐姿'],
    crouching: ['crouching', 'crouch', 'squatting', 'squat', '蹲'],
    reclining: ['reclining', 'recline', '斜倚', '斜倚 / 卧'], horizontal: ['horizontal', 'lying', 'lying down', 'lying flat', '平躺', '水平'],
    relief: ['relief', '浮雕'], unclassified: ['unclassified', 'unknown', 'undetermined', 'relief/unclassified', '未分类', '未定']
  };
  const key = hallMusicKey(value);
  for (const [cls, names] of Object.entries(aliases)) if (names.some(n => hallMusicKey(n) === key)) return { cls, reason: '' };
  // Existing raw Atlas aliases only used for music grouping; both uncertain classes share calm.
  if (['seated_or_reclining_uncertain', '坐或卧（不确定）'].some(n => hallMusicKey(n) === key)) return { cls: 'seated_or_reclining_uncertain', pool: 'calm', reason: 'existing-atlas-alias-same-calm-pool' };
  return { cls: 'unclassified', reason: key ? 'unknown-sculpture-class:' + String(value) : 'missing-sculpture-class' };
}
function hallMusicCategory(value) {
  const key = hallMusicKey(value);
  return Object.keys(HALL_MUSIC_CATEGORIES).find(id => hallMusicKey(id) === key || hallMusicKey(HALL_MUSIC_CATEGORIES[id]) === key) || null;
}
function hallMusicSelection(output = {}) {
  const pose = hallMusicPose(output.rawClass);
  const pool = pose.pool || (['standing', 'walking'].includes(pose.cls) ? 'active' : ['seated', 'crouching', 'reclining', 'horizontal'].includes(pose.cls) ? 'calm' : 'background');
  return Object.freeze({ ...output, pose: pose.cls, pool, reason: output.reason || pose.reason || '', categories: HALL_MUSIC_POOLS[pool] });
}
function hallMusicOutput(sequence, records) {
  // No primary-sculpture field: first valid participating output, not preserved background pieces.
  const index = sequence.findIndex(p => p.act && records[p.work]);
  if (index < 0) return hallMusicSelection({ rawClass: null, work: null, outputIndex: null, reason: 'no-valid-output-sculpture', rule: 'first-valid-participating-output' });
  const p = sequence[index], record = records[p.work];
  return hallMusicSelection({ rawClass: record.cls, work: p.work, outputIndex: index, rule: 'first-valid-participating-output' });
}
function hallMusicCatalogue(items) {
  const unique = new Map();
  for (const track of items) {
    const sourceCategories = Array.isArray(track.categories) ? track.categories : [];
    if (!sourceCategories.length) throw new Error('曲目缺少原始分类：' + track.id);
    const categories = sourceCategories.map(value => { const id = hallMusicCategory(value); if (!id) throw new Error('未知音乐分类：' + value); return id; });
    let url; try { url = new URL(track.url); } catch (_) { continue; }
    if (url.protocol !== 'https:' || !/\.(mp3|ogg|wav|m4a|aac)$/i.test(url.pathname)) continue;
    const key = track.sha256 || url.href;
    if (unique.has(key)) { const previous = unique.get(key); previous.categories = [...new Set([...previous.categories, ...categories])]; }
    else unique.set(key, { ...track, audioKey: key, categories: [...new Set(categories)] });
  }
  return [...unique.values()];
}
/* One background player. Input tickets survive recognition, never a later input.
   Movement calls boardStarted exactly once from its first non-zero tween update. */
function createHallMusic({ audio, loadTracks, now = () => performance.now(), setTimer = setTimeout,
  clearTimer = clearTimeout, random = Math.random, onState = () => {}, legacyStop = () => {} } = {}) {
  let epoch = 0, ticket = null, task = null, catalogPromise = null, lastPlayed = null;
  let budgetTimer = 0, loadTimer = 0, detach = () => {}, attemptSerial = 0;
  const SILENCE = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA==';
  audio.preload = 'none'; audio.loop = false; audio.volume = 0.65;
  function state(value, detail = '') { onState({ state: value, detail, selection: task?.selection || null, track: task?.track || null, input: ticket?.reason || '', epoch }); }
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
      const valid = hallMusicCatalogue(items);
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
    clearTimer(loadTimer); loadTimer = 0; t.state = 'playing'; lastPlayed = t.track.audioKey;
    if (t.deadline == null) t.deadline = now() + HALL_MUSIC_MAX_PLAY_MS;
    if (now() >= t.deadline) { stop('playback-duration-limit'); return; }
    if (!budgetTimer) budgetTimer = setTimer(() => { if (current(t)) stop('playback-duration-limit'); }, t.deadline - now());
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
    if (t.deadline != null && now() >= t.deadline) { stop('playback-duration-limit'); return; }
    if (t.attempts >= 3) { fail(t, '当前动作音乐池暂时无法播放，保持静音；可点击开启声音重试'); return; }
    void choose(t);
  }
  async function choose(t) {
    if (!current(t)) return;
    t.state = 'loading'; state('loading');
    let list;
    try { list = (await tracks()).filter(x => x.categories.some(c => t.selection.categories.includes(c))); } catch (e) { fail(t, '音乐库暂时无法读取：' + e.message); return; }
    if (!current(t)) return;
    let pool = list.filter(x => !t.tried.has(x.audioKey) && (list.length < 2 || x.audioKey !== lastPlayed));
    if (!pool.length) pool = list.filter(x => !t.tried.has(x.audioKey));
    if (!pool.length) { fail(t, '当前动作音乐池没有其他可播放曲目，保持静音'); return; }
    cleanAttempt(); resetAudio();
    t.track = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    t.tried.add(t.track.audioKey); t.attempts++;
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
  function boardStarted(value, output) {
    if (!isCurrent(value) || task) return;
    task = { selection: hallMusicSelection(output), ticket: value, state: 'loading', track: null, attempts: 0, tried: new Set(), deadline: null };
    void choose(task);
  }
  function resume() {
    const t = task; if (!t || !current(t)) return;
    if (t.deadline != null && now() >= t.deadline) { stop('playback-duration-limit'); return; }
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
      selection: task?.selection || null, track: task?.track?.id || null, deadline: task?.deadline ?? null, attempts: task?.attempts || 0 }; } };
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
      if (sceneCanvas) { sceneCanvas.dataset.musicState = value.state; sceneCanvas.dataset.musicTrack = value.track?.id || ''; sceneCanvas.dataset.musicInput = value.input; sceneCanvas.dataset.musicSelection = JSON.stringify(value.selection);
        if (value.selection?.reason && ['loading', 'playing'].includes(value.state)) console.info('[HallMusic classification]', value.selection); }
      button.hidden = !['blocked', 'failed'].includes(value.state);
      button.style.display = button.hidden ? 'none' : '';
      button.title = value.detail || `开启当前棋盘音乐（最多${HALL_MUSIC_MAX_PLAY_MS / 1000}秒）`;
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

