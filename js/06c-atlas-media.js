/* Atlas media is separate from sculpture browsing and the hall's pose inputs. */
const AtlasMedia = (() => {
  const pane = $('#atlasMedia'), button = $('#atlasMediaBtn'), search = $('#atlasSearch');
  const grid = $('#atlasGrid'), spec = $('#spec'), body = pane.parentElement;
  let active = false, previous = null, catalogue = null, loading = null, query = '', revision = 0;
  let player = null, selected = null;
  const timeLabel = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const safeLink = value => {
    try { const url = new URL(value, document.baseURI); return url.protocol === 'https:' ? url.href : ''; }
    catch (_) { return ''; }
  };
  function stopVideo() {
    if (!player) return;
    player.pause(); player.removeAttribute('src'); player.load();
    player = null; selected = null;
  }
  async function load() {
    if (catalogue) return catalogue;
    if (!loading) loading = fetch('data/atlas-pose-media.json', { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('The video collection could not be loaded.');
      const data = await response.json();
      if (data.format !== 'atlas-pose-media-v1' || !Array.isArray(data.videos)) throw new Error('Invalid video collection.');
      catalogue = data.videos.filter(item => item.id && item.title && safeLink(item.videoUrl) && safeLink(item.sourceUrl));
      return catalogue;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function renderCards() {
    if (!catalogue) return;
    const needle = query.trim().toLowerCase();
    const list = catalogue.filter(item => [item.title, item.workTitle, item.creator, item.goddess, item.sourcePlatform]
      .some(value => String(value || '').toLowerCase().includes(needle)));
    $('#atlasMediaCount').textContent = `${list.length} of ${catalogue.length} videos · Venus / Aphrodite`;
    $('#atlasMediaCards').innerHTML = list.map(item => `<button class="acard atlas-media-card" type="button" data-media-id="${esc(item.id)}"
      aria-label="Play ${esc(item.title)}" aria-pressed="${selected === item.id}">
      <span class="atlas-media-thumb"><img loading="lazy" src="${esc(item.poster)}" alt="Skeleton overlay from ${esc(item.workTitle)}"><span class="atlas-media-play" aria-hidden="true">▶</span><span class="atlas-media-duration">${timeLabel(item.duration)}</span></span>
      <span class="at">${String(item.number).padStart(2, '0')}. ${esc(item.workTitle)}</span>
      <span class="atlas-media-credit">${esc(item.creator)}</span><span class="am">${esc(item.goddess)} · Skeleton overlay</span>
      </button>`).join('') || '<p class="muted">No videos match your search.</p>';
    $$('#atlasMediaCards [data-media-id]').forEach(card => card.onclick = () => select(card.dataset.mediaId));
  }
  function select(id) {
    if (!active) return;
    const item = catalogue.find(entry => entry.id === id);
    if (!item) return;
    stopVideo(); selected = id;
    const detail = $('#atlasMediaDetail');
    detail.innerHTML = `<div class="atlas-media-watch"><video id="atlasMediaPlayer" controls playsinline preload="metadata" poster="${esc(item.poster)}" aria-label="${esc(item.title)}"></video>
        <p class="small muted" id="atlasMediaStatus" role="status">Loading video…</p></div>
      <div class="atlas-media-info"><div class="eyebrow">VIDEO ${String(item.number).padStart(2, '0')} · SKELETON OVERLAY</div>
        <h3>${esc(item.workTitle)}</h3><dl class="meta"><dt>Goddess</dt><dd>${esc(item.goddess)}</dd>
          <dt>Artist / company</dt><dd>${esc(item.creator)}</dd><dt>Duration</dt><dd>${timeLabel(item.duration)}</dd>
          <dt>Source</dt><dd>${esc(item.sourcePlatform)}</dd><dt>Theme</dt><dd>${esc(item.relationship)}</dd></dl>
        <p class="small muted">${esc(item.note)}</p><div class="row">
          <a class="btn ghost" href="${esc(safeLink(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">Original video ↗</a>
          <button class="btn ghost" id="atlasMediaDismiss" type="button">Close video</button></div></div>`;
    detail.hidden = false;
    player = $('#atlasMediaPlayer');
    const video = player, status = $('#atlasMediaStatus');
    video.addEventListener('playing', () => { status.textContent = 'Playing · Use the video controls to pause, seek or adjust sound.'; });
    video.addEventListener('pause', () => { if (video.currentSrc) status.textContent = 'Paused · Press play to continue.'; });
    video.addEventListener('waiting', () => { status.textContent = 'Buffering…'; });
    video.addEventListener('ended', () => { status.textContent = 'Finished · Choose another video or play again.'; });
    video.addEventListener('error', () => { status.textContent = 'This video could not be loaded. Try again, or view the original video.'; });
    video.addEventListener('loadedmetadata', () => { if (video.paused) status.textContent = 'Ready · Press play to watch.'; });
    $('#atlasMediaDismiss').onclick = () => { stopVideo(); detail.hidden = true; detail.innerHTML = ''; renderCards(); };
    video.src = safeLink(item.videoUrl);
    video.load();
    video.play().catch(() => { if (player === video) status.textContent = 'Ready · Press play to watch with sound.'; });
    renderCards();
    body.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function open() {
    if (active) return;
    previous = { gridHidden: grid.hidden, specHidden: spec.hidden, value: search.value,
      placeholder: search.placeholder, label: search.getAttribute('aria-label'), scrollTop: body.scrollTop,
      filter: $('#atlasFilters button[aria-pressed="true"]')?.dataset.f };
    active = true; query = ''; const current = ++revision;
    Atlas.pauseViewer();
    grid.hidden = true; spec.hidden = true; pane.hidden = false;
    button.setAttribute('aria-pressed', 'true');
    $$('#atlasFilters button').forEach(item => item.setAttribute('aria-pressed', 'false'));
    search.value = ''; search.placeholder = 'Search videos, artists or goddess'; search.setAttribute('aria-label', 'Search videos and images');
    body.scrollTop = 0;
    pane.innerHTML = '<h2>Videos / Images</h2><p class="muted" role="status">Loading videos…</p>';
    try {
      await load();
      if (!active || current !== revision) return;
      pane.innerHTML = `<div class="atlas-media-heading"><h2>Videos / Images</h2><p class="muted" id="atlasMediaCount" aria-live="polite"></p></div>
        <div class="atlas-media-detail" id="atlasMediaDetail" hidden></div><div class="atlas-media-cards" id="atlasMediaCards"></div>`;
      renderCards();
    } catch (_) {
      if (!active || current !== revision) return;
      pane.innerHTML = '<h2>Videos / Images</h2><p class="muted" role="status">The video collection could not be loaded.</p><button class="btn ghost" id="atlasMediaRetry">Try again</button>';
      $('#atlasMediaRetry').onclick = () => { close(); open(); };
    }
  }
  function close() {
    if (!active) return;
    active = false; revision++; stopVideo(); pane.hidden = true; pane.innerHTML = '';
    button.setAttribute('aria-pressed', 'false');
    grid.hidden = previous.gridHidden; spec.hidden = previous.specHidden;
    search.value = previous.value; search.placeholder = previous.placeholder;
    if (previous.label === null) search.removeAttribute('aria-label'); else search.setAttribute('aria-label', previous.label);
    $$('#atlasFilters button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.f === previous.filter)));
    body.scrollTop = previous.scrollTop; previous = null;
    Atlas.resumeViewer();
  }
  button.onclick = open;
  return { open, close, get active() { return active; }, search(value) { query = value; renderCards(); } };
})();
