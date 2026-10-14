
/* ---------------------------------------------------------------
   Atlas: the group's models (105 + new acquisitions) as a browsable gallery, and a
   white studio "specimen" view with the skeleton candidates
---------------------------------------------------------------- */
const Atlas = (() => {
  const el = $('#atlas'), grid = $('#atlasGrid'), spec = $('#spec'), info = $('#specInfo');
  let filter = 'all', query = '', built = false, cur = null;
  let r2 = null, sc2, cam2, ctl2, holder, bonesObj = null, raf = 0, spin = true, showBones = true;
  const FILTERS = [['all', '全部'], ...CLS.map(c => [c, CLASS[c].zh]), ['relief', '浮雕 / 待分类']];
  const count = (f) => f === 'all' ? ATLAS.records.length : f === 'relief' ? ATLAS.records.filter(r => r.kind !== 'figure' || !r.cls).length : FIGS.filter(r => r.cls === f).length;
  function renderFilters() {
    $('#atlasFilters').innerHTML = FILTERS.map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${t} <span class="muted">${count(k)}</span></button>`).join('');
    $$('#atlasFilters button').forEach(b => b.onclick = () => { filter = b.dataset.f; renderFilters(); renderGrid(); });
  }
  function match(r) {
    if (filter === 'relief' && (r.kind === 'figure' && r.cls)) return false;
    if (filter !== 'all' && filter !== 'relief' && r.cls !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [r.t, r.a, r.d, r.m, r.id, r.poseRaw].some(x => x && String(x).toLowerCase().includes(q));
  }
  function renderGrid() {
    const list = ATLAS.records.filter(match);
    grid.innerHTML = list.map(r => `<button class="acard" data-id="${r.id}">
        <span class="aimg"><img loading="lazy" alt="" src="${thumbURL(r.id)}"></span>
        <span class="at">${esc(recTitle(r))}</span>
        <span class="am">#${r.id} · ${r.cls ? CLASS[r.cls].zh : r.kind === 'figure' ? '姿势待确认' : '浮雕 / 建筑'}${r.sk ? ' · 骨骼' : ''}</span></button>`).join('') || '<p class="muted">没有符合条件的模型。</p>';
    $$('.acard', grid).forEach(b => b.onclick = () => show(b.dataset.id));
  }
  function ensureViewer() {
    if (r2) return;
    const cv = $('#specCanvas');
    r2 = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r2.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r2.toneMapping = THREE.ACESFilmicToneMapping; r2.toneMappingExposure = 0.95;
    r2.shadowMap.enabled = true; r2.shadowMap.type = THREE.PCFSoftShadowMap;
    sc2 = new THREE.Scene(); sc2.background = new THREE.Color(0xffffff);
    const pm = new THREE.PMREMGenerator(r2); sc2.environment = pm.fromScene(new RoomEnvironment(r2), 0.04).texture; sc2.environmentIntensity = 0.75;
    sc2.add(new THREE.HemisphereLight(0xffffff, 0xe6e1d8, 0.6));
    const key = new THREE.DirectionalLight(0xfff6ec, 2.4); key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 20 }); key.shadow.radius = 6; sc2.add(key);
    const fill = new THREE.DirectionalLight(0xeef3ff, 0.7); fill.position.set(-4, 2, 2); sc2.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.12 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc2.add(ground);
    cam2 = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    ctl2 = new OrbitControls(cam2, cv); ctl2.enableDamping = true; ctl2.dampingFactor = 0.08;
    holder = new THREE.Group(); sc2.add(holder);
    const resize = () => { const b = cv.parentElement.getBoundingClientRect(); r2.setSize(b.width, b.height, false); cam2.aspect = b.width / Math.max(1, b.height); cam2.updateProjectionMatrix(); };
    new ResizeObserver(resize).observe(cv.parentElement); resize();
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (spin && holder) holder.rotation.y += 0.004;
    ctl2.update(); r2.render(sc2, cam2);
  }
  async function show(id) {
    const previous = cur, oldGeometries = holder ? holder.children.filter(m => m.isMesh && m.userData.detail).map(m => m.geometry) : [];
    cur = id;
    const r = REC[id];
    grid.hidden = true; spec.hidden = false;
    ensureViewer();
    info.innerHTML = specInfo(r);
    bindInfo(r);
    holder.clear(); bonesObj = null;
    if (previous && MODEL_DETAILS[previous]) for (const geo of oldGeometries) releaseDetailGeometry(previous, geo);
    holder.rotation.y = 0;
    try {
      const mesh = await meshOf(id);
      if (cur !== id) return;
      const m = new THREE.Mesh(mesh.geo, ceramic); m.castShadow = true; m.receiveShadow = true;
      holder.add(m);
      $('#specCanvas').dataset.modelId = id;
      $('#specCanvas').dataset.triangles = String(mesh.geo.index.count / 3);
      detailedMeshOf(id).then(detail => {
        if (cur !== id || !holder.children.includes(m)) return;
        if (detail.detail) m.geometry = detail.geo;
        m.userData.detail = !!detail.detail;
        $('#specCanvas').dataset.triangles = String(m.geometry.index.count / 3);
        $('#specMeshStatus').textContent = (detail.detail ? '精细版' : '轻量版') + ' · ' + (m.geometry.index.count / 3).toLocaleString() + ' 个三角面 · 哑光石膏';
      }).catch(() => {});
      bonesObj = skeletonObject(mesh.skel, 0.006 * Math.max(1, (mesh.bounds.max.y) / 1.6)); if (bonesObj) { bonesObj.visible = showBones; holder.add(bonesObj); }
      const b = mesh.bounds, c = new THREE.Vector3(0, b.max.y / 2, 0);
      const rad = Math.max(b.max.y, b.max.x - b.min.x, b.max.z - b.min.z) * 0.62;
      cam2.position.set(rad * 1.3, c.y + rad * 0.35, rad * 3.1); ctl2.target.copy(c); ctl2.update();
    } catch (e) { info.insertAdjacentHTML('afterbegin', '<p class="muted">模型加载失败。</p>'); }
    if (!raf) loop();
  }
  function specInfo(r) {
    const placeable = r.kind === 'figure' && r.cls;
    const skn = r.sk ? ZH.sk[r.sk.src] : '暂无骨骼数据';
    return `<button class="btn ghost" id="specBack">← 返回图谱</button>
      <div class="eyebrow">Atlas #${esc(r.id)}${r.cls ? ' · ' + CLASS[r.cls].en : ''}</div>
      <h2 class="dname lg">${esc(recTitle(r))}</h2>
      <div class="den">${esc(recMeta(r))}</div>
      <dl class="meta">
        ${r.m ? `<dt>收藏</dt><dd>${esc(r.m)}</dd>` : ''}
        <dt>平台类别</dt><dd>${r.cls ? CLASS[r.cls].zh : r.kind === 'figure' ? '姿势待确认（暂不进入雕塑序列）' : '浮雕 / 建筑（不进入雕塑序列）'}${r.cls && r.alt && r.alt.length ? '（也可代表：' + r.alt.map(c => CLASS[c].zh).join('、') + '）' : ''}</dd>
        <dt>图谱姿势</dt><dd>${esc((r.pose || []).map(x => ZH.pose[x] || x).join('、') || '—')}</dd>
        <dt>骨骼</dt><dd>${esc(skn)}</dd>
        <dt>模型</dt><dd id="specMeshStatus">${MODEL_DETAILS[r.id] ? '轻量预览 · 正在载入精细版' : '轻量版 · 哑光石膏'}</dd>
        <dt>可信度</dt><dd>${r.conf != null ? Math.round(r.conf * 100) + '%' : '—'}</dd>
      </dl>
      <div class="tags">${tagList(r.gest, ZH.gest)}${tagList(r.cloth, ZH.cloth)}</div>
      <p class="desc">${esc(r.desc || r.poseRaw || '')}</p>
      ${r.identityNote ? `<p class="small muted">资料备注：${esc(r.identityNote)}</p>` : ''}
      ${r.skNote ? `<p class="small muted">骨骼备注：${esc(r.skNote)}</p>` : ''}
      ${r.license ? `<p class="small muted">版权：${esc(r.license)}${r.credit ? '。' + esc(r.credit) : ''}</p>` : ''}
      <div class="row">
        <button class="btn primary" id="specPlace" ${placeable ? '' : 'disabled'}>放到展厅第 ${pad2(S.sel + 1)} 位</button>
        ${r.src ? `<a class="btn ghost" href="${esc(r.src)}" target="_blank" rel="noopener">资料来源 ↗</a>` : ''}
      </div>
      <p class="small muted">骨骼都是候选结果，图谱中标为“未确认”；平台只用它做显示，不用于评判身体。</p>`;
  }
  function bindInfo(r) {
    $('#specBack').onclick = () => { spec.hidden = true; grid.hidden = false; cur = null; };
    const pl = $('#specPlace');
    if (pl && !pl.disabled) pl.onclick = () => {
      S.override[S.sel] = r.id;
      close();
      applyDay(S.day, { source: S.source || '手动编排' });
      setTimeout(() => flyToPosition(S.sel), 400);
      toast(`第 ${pad2(S.sel + 1)} 位换成：${recTitle(r)}`);
    };
  }
  function open(id) {
    if (!built) { renderFilters(); renderGrid(); built = true; $('#atlasSub').textContent = `${ATLAS.records.length} 件模型 · 哑光石膏 · 精细版按需加载`; }
    el.hidden = false; Atlas.isOpen = true;
    if (id) show(id); else { spec.hidden = true; grid.hidden = false; }
  }
  function close() { el.hidden = true; Atlas.isOpen = false; cancelAnimationFrame(raf); raf = 0; }
  $('#atlasClose').onclick = close;
  $('#atlasSearch').addEventListener('input', (e) => { query = e.target.value.trim(); renderGrid(); });
  $('#specBones').onclick = (e) => { showBones = !showBones; e.currentTarget.setAttribute('aria-pressed', String(showBones)); if (bonesObj) bonesObj.visible = showBones; };
  $('#specSpin').onclick = (e) => { spin = !spin; e.currentTarget.setAttribute('aria-pressed', String(spin)); };
  return { open, close, isOpen: false, usesGeometry: geo => !!holder && holder.children.some(m => m.geometry === geo) };
})();
