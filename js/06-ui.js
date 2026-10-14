
/* ---------------------------------------------------------------
   Interface: sequence strip, data panel, bars, gestures, labels
---------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
let toastTimer = null;
function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
function setLoading(text) { const l = $('#loading'); if (!text) { l.hidden = true; return; } l.hidden = false; $('#loadingText').textContent = text; }
const STATUS_TXT = { keep: '保留', swap: '替换', new: '新增', beyond: '原有', manual: '手动选择' };
function statusText(p) { if (p.status === 'beyond') return S.day.length ? '叙事之外 · 原样' : '展厅原有'; return STATUS_TXT[p.status]; }
const thumbURL = (id) => (REC[id] && REC[id].member) ? Group.thumbFor(id) : `t/${id}.webp?v=${ATLAS.revision || ''}`;

function iconCanvas(cls, size = 60, color) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; c.className = 'icon';
  drawPoseIcon(c.getContext('2d'), cls, size / 2, size / 2, size * 0.8, { color: color || '#232323', width: Math.max(2, size * 0.05) });
  return c;
}
function clsOptions(sel) { return CLS.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${CLASS[c].zh}</option>`).join(''); }

let dragFrom = -1;
function renderStrip(selOnly) {
  const box = $('#cards');
  if (selOnly && box.children.length === S.pos.length + 1) {
    $$('.card', box).forEach((c, i) => c.classList.toggle('sel', i === S.sel));
    return;
  }
  box.innerHTML = '';
  S.pos.forEach((p, i) => {
    const r = REC[p.work];
    const cls = p.act ? p.act.cls : r.cls;
    const card = document.createElement('div');
    card.className = 'card' + (i === S.sel ? ' sel' : '') + (p.act ? '' : ' beyond');
    card.dataset.i = i; card.tabIndex = 0; card.setAttribute('role', 'button');
    card.draggable = !!p.act;
    const g = p.act && p.act.g ? ' · ' + GESTURES[p.act.g].zh : '';
    card.innerHTML = `
      ${p.act ? '<button class="del" aria-label="删除这个姿势">×</button>' : ''}
      <div class="top"><img class="thumb" alt="" src="${thumbURL(p.work)}"><div style="min-width:0">
        <div class="num">${pad2(i + 1)}${p.act && p.act.time ? ' · ' + esc(p.act.time) : ''}</div>
        <div class="act" title="${esc(p.act ? p.act.label : '')}">${p.act ? esc(p.act.label) : '（叙事之外）'}</div></div></div>
      ${p.act ? `<select aria-label="姿势类别">${clsOptions(p.act.cls)}</select>` : `<span class="small muted">${CLASS[cls].zh}</span>`}
      <span class="badge ${p.status}">${esc(statusText(p))}${esc(g)}</span>
      <div class="sculpt" title="${esc(recTitle(r))}">${esc(recTitle(r))}</div>`;
    card.addEventListener('click', (e) => { if (e.target.closest('select,.del')) return; select(i, { fly: true }); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i, { fly: true }); } });
    const sel = card.querySelector('select');
    if (sel) sel.addEventListener('change', () => {
      const d = S.day.slice(); d[i] = { ...d[i], cls: sel.value };
      if (d[i].g && !GESTURES[d[i].g].cls.includes(sel.value)) d[i].g = null;
      S.sel = i; applyDay(d, { source: S.source + ' · 已手动修改' });
    });
    const del = card.querySelector('.del');
    if (del) del.addEventListener('click', () => { const d = S.day.slice(); d.splice(i, 1); applyDay(d); });
    card.addEventListener('dragstart', (e) => { dragFrom = i; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {} });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => { if (dragFrom >= 0 && i < S.day.length) e.preventDefault(); });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === i || i >= S.day.length) return;
      const d = S.day.slice(); const [m] = d.splice(dragFrom, 1); d.splice(i, 0, m); dragFrom = -1;
      S.sel = i; applyDay(d, { source: S.source + ' · 已手动修改' });
    });
    box.appendChild(card);
  });
  const add = document.createElement('button');
  add.className = 'addcard'; add.innerHTML = '<span style="font-size:20px;line-height:1">+</span><span>加一个姿势</span>';
  add.addEventListener('click', () => openAddMenu(add));
  box.appendChild(add);
  const n = { keep: 0, swap: 0, new: 0, beyond: 0, manual: 0 };
  S.pos.forEach(p => n[p.status]++);
  $('#summary').innerHTML = S.day.length || n.manual
    ? `保留 <b>${n.keep}</b> · 替换 <b>${n.swap}</b>${n.new ? ` · 新增 <b>${n.new}</b>` : ''}${n.manual ? ` · 手动 <b>${n.manual}</b>` : ''}${n.beyond ? ` · 叙事之外 <b>${n.beyond}</b>` : ''} <span class="muted">· ${esc(S.source)}</span>`
    : '展厅原状：沿轴线排列的现有雕塑（示意，取自图谱）';
}
function openAddMenu(anchor) {
  closeAddMenu();
  const m = document.createElement('div'); m.className = 'addmenu'; m.id = 'addmenu';
  m.innerHTML = CLS.map(c => `<button data-c="${c}">${CLASS[c].zh}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - 200, r.left - 40)) + 'px';
  m.style.top = Math.max(8, r.top - m.offsetHeight - 6) + 'px';
  m.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (S.day.length >= 10) { toast('序列最多 10 个位置'); closeAddMenu(); return; }
    const c = b.dataset.c;
    const d = S.day.concat([{ cls: c, g: null, label: '手动添加 · ' + CLASS[c].zh, time: null, hours: CLASS[c].dur }]);
    S.sel = d.length - 1; closeAddMenu();
    applyDay(d, { source: S.source || '手动编排' });
  });
  setTimeout(() => document.addEventListener('pointerdown', outsideAdd), 0);
}
function outsideAdd(e) { if (!e.target.closest('#addmenu')) closeAddMenu(); }
function closeAddMenu() { const m = $('#addmenu'); if (m) m.remove(); document.removeEventListener('pointerdown', outsideAdd); }

function renderBars(probs) {
  if (!probs && typeof Cam !== 'undefined' && (Cam.demo || Cam.stream) && !$('#mode-camera').hidden) return;
  const box = $('#bars');
  let vals, title;
  if (probs) { vals = probs; title = '当前姿势属于各类的可能性'; }
  else {
    const tot = {}; CLS.forEach(c => tot[c] = 0);
    S.day.forEach(d => tot[d.cls] += (d.hours || CLASS[d.cls].dur));
    const sum = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    vals = {}; CLS.forEach(c => vals[c] = tot[c] / sum);
    title = S.day.length ? '这一天的姿势构成（按时长）' : '这一天的姿势构成（还没有序列）';
  }
  $('#barsTitle').textContent = title;
  if (box.children.length !== CLS.length) {
    box.innerHTML = CLS.map(c => `<div class="bar" data-c="${c}"><span>${CLASS[c].zh}</span><span class="track"><span class="fill" style="background:${CLASS[c].color};width:0"></span></span><span class="v">0%</span></div>`).join('');
  }
  CLS.forEach((c, k) => {
    const row = box.children[k];
    row.querySelector('.fill').style.width = Math.round((vals[c] || 0) * 100) + '%';
    row.querySelector('.v').textContent = Math.round((vals[c] || 0) * 100) + '%';
  });
}
function renderGestures() {
  const box = $('#gestures');
  const p = S.pos[S.sel];
  box.innerHTML = '';
  for (const [k, g] of Object.entries(GESTURES)) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button';
    const ok = p && p.act && g.cls.includes(p.act.cls);
    b.disabled = !ok;
    b.setAttribute('aria-pressed', String(!!(p && p.act && p.act.g === k)));
    const n = FIGS.filter(r => r.g === k).length;
    b.title = g.note + `（图谱中 ${n} 件）` + (ok ? '' : '；选中一张' + g.cls.map(c => CLASS[c].zh).join('或') + '的卡片后可用');
    b.textContent = `${g.zh} = ${g.note}`;
    b.addEventListener('click', () => {
      const d = S.day.slice(); const cur = d[S.sel];
      d[S.sel] = { ...cur, g: cur.g === k ? null : k };
      applyDay(d, { source: S.source + ' · 复杂姿势' });
    });
    box.appendChild(b);
  }
}
const tagList = (arr, dict) => (arr || []).filter(Boolean).map(x => `<span class="tagchip">${esc(dict[x] || x.replace(/_/g, ' '))}</span>`).join('');
function renderData() {
  const box = $('#dataScroll');
  const p = S.pos[S.sel];
  if (!p) { box.innerHTML = '<p class="muted">还没有序列。</p>'; return; }
  const r = REC[p.work], cls = r.cls, pal = paletteFor(S.sel);
  const orig = p.orig ? REC[p.orig.id] : null;
  const statusLine = { keep: '姿势相同，保留展厅原有的雕塑', swap: '姿势不同，从图谱换入', new: '叙事比展厅长，新增一个位置', manual: '在图谱里手动选择', beyond: S.day.length ? '叙事已结束，这个位置保持原样' : '展厅现有序列中的一件' }[p.status];
  const skn = r.member ? '无（组员上传的模型）' : r.sk ? ZH.sk[r.sk.src] : '暂无骨骼数据';
  const linked = Group.linkedTo(S.sel, r.member ? null : r.id);
  box.innerHTML = `
    <div class="dcard">
      <div class="eyebrow">Position ${pad2(S.sel + 1)} · ${CLASS[cls].en}</div>
      <span class="badge ${p.status}">${esc(r.member && p.status === 'manual' ? '放入了组员上传的模型' : statusLine)}</span>
      <div class="specimen"><img alt="" src="${thumbURL(r.id)}"></div>
      <h2 class="dname">${esc(recTitle(r))}</h2>
      <div class="den">${r.member ? `小组作品 · ${esc(Group.creditOf(r.item))} · ${esc(r.d)}` : `ATLAS #${esc(r.id)} · ${esc(recMeta(r))}`}</div>
      <dl class="meta">
        ${r.m && !r.member ? `<dt>收藏</dt><dd>${esc(r.m)}</dd>` : ''}
        <dt>姿势</dt><dd>${CLASS[cls].zh}${r.member ? '' : `<span class="muted">（图谱标注：${esc((r.pose || []).map(x => ZH.pose[x] || x).join('、'))}）</span>`}</dd>
        <dt>骨骼</dt><dd>${esc(skn)}</dd>
        ${r.member ? '' : `<dt>可信度</dt><dd>${r.conf != null ? Math.round(r.conf * 100) + '%' : '—'}</dd>`}
      </dl>
      <div class="tags">${tagList(r.gest, ZH.gest)}${tagList(r.cloth, ZH.cloth)}</div>
      <div class="meaning">
        <div class="from">${r.member ? '组员的说明：' + esc(r.desc || '—') : '图谱里的姿势描述：' + esc(r.poseRaw || r.desc || '—')}</div>
        <div class="arrow">→ 今天的意义</div>
        <div class="to">${p.act ? esc((p.act.time ? p.act.time + ' ' : '') + p.act.label) : '（这一天里没有对应的动作）'}</div>
      </div>
      ${p.status === 'swap' && orig ? `<p class="small muted" style="margin:0">换下了：${esc(recTitle(orig))}（${CLASS[orig.cls].zh}）</p>` : ''}
      <div class="row">${r.member ? '<button class="btn" id="openMemberHere">在小组作品中查看</button>' : '<button class="btn" id="openAtlasHere">在图谱中查看</button>'}${r.src ? `<a class="btn ghost" href="${esc(r.src)}" target="_blank" rel="noopener">资料来源 ↗</a>` : ''}</div>
    </div>
    ${linked.length ? `<hr class="soft"><div class="dcard"><h3 class="ph sm">小组作品 · 关联这个位置${r.member ? '' : '或这件雕塑'}（${linked.length}）</h3>
      <div class="dlinks">${linked.slice(0, 6).map(it => { const t = Group.thumbOf(it); return `<button data-k="${esc(it.key)}" title="${esc(it.title)}"><span class="ti">${t ? `<img alt="" src="${esc(t)}">` : `<span>${esc(Group.KINDS[it.kind])}</span>`}</span><span class="tt">${esc(it.title || Group.KINDS[it.kind])}</span><span class="tt muted">${esc(Group.creditOf(it))}</span></button>`; }).join('')}</div>
      ${linked.length > 6 ? '<button class="btn ghost" id="moreLinked">查看全部小组作品</button>' : ''}</div>` : ''}
    <hr class="soft">
    <div class="dcard">
      <h3 class="ph sm">色板 · ${CLASS[cls].zh}${S.posPal[S.sel] ? '（取自视频）' : ''}</h3>
      <div class="swatches">${pal.map(c => `<span style="background:${c}" title="${c}"></span>`).join('')}</div>
      <div class="row"><button class="btn" id="palBtn">从图片取色</button><button class="btn ghost" id="palReset">恢复默认</button></div>
    </div>
    <div class="dcard">
      <h3 class="ph sm">声音 · ${CLASS[cls].zh}</h3>
      <div class="small muted">${Sound.custom[cls] ? esc(Sound.customName[cls]) + '（组员上传）' : esc(CLASS[cls].sound) + '（合成占位）'}</div>
      <canvas class="wave" id="wave" width="560" height="88"></canvas>
      <div class="row"><button class="btn" id="sndPlay">${Sound.on && Sound.cls === cls ? '停止' : '播放'}</button><button class="btn ghost" id="sndUp">上传这一类的声音</button></div>
    </div>
    <hr class="soft">
    <div class="dcard">
      <h3 class="ph sm">本次替换记录</h3>
      <ol class="log">${S.pos.map((q, i) => `<li><span class="n">${pad2(i + 1)}</span><span>${q.act ? CLASS[q.act.cls].zh + ' · ' : ''}${esc(recTitle(REC[q.work]))}${q.status === 'swap' ? `<span class="muted">（换下 ${esc(recTitle(REC[q.orig.id]))}）</span>` : ''}</span><span class="badge ${q.status}">${esc(statusText(q))}</span></li>`).join('')}</ol>
    </div>`;
  if (r.member) $('#openMemberHere').onclick = () => Group.openItem(r.item); else $('#openAtlasHere').onclick = () => Atlas.open(r.id);
  $$('.dlinks button', box).forEach(b => b.onclick = () => Group.open(b.dataset.k));
  const ml = $('#moreLinked'); if (ml) ml.onclick = () => Group.open();
  $('#palBtn').onclick = () => { paletteTarget = cls; $('#paletteFile').click(); };
  $('#palReset').onclick = () => { S.palettes[cls] = DEFAULT_PALETTES[cls].slice(); delete S.posPal[S.sel]; refreshPalettes(cls); };
  $('#sndPlay').onclick = () => { if (Sound.on && Sound.cls === cls) { Sound.stop(); } else { Sound.enable().then(() => Group.loadSounds()).then(() => Sound.play(cls)); } renderData(); };
  $('#sndUp').onclick = () => { soundTarget = cls; $('#soundFile').click(); };
}
let paletteTarget = null, soundTarget = null;
function refreshPalettes(cls) { renderData(); scheduleSkin(50, { own: true }); } // palettes tint the ribbons
function updateLabels() {
  const w = window.innerWidth, h = window.innerHeight;
  V.forEach((vp, i) => {
    const p = S.pos[i]; if (!p) return;
    const tag = vp.tag;
    if (vp !== focusedSculpture || !vp.fig || !vp.fig.visible || !vp.bounds) { tag.classList.add('hidden'); return; }
    // Anchor just above this model's highest point, including its current rise and world transform.
    const b = vp.bounds;
    _v.set((b.min.x + b.max.x) / 2, b.max.y + 0.07, (b.min.z + b.max.z) / 2);
    vp.fig.localToWorld(_v); _v.project(camera);
    const vis = _v.z > -1 && _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
    tag.classList.toggle('hidden', !vis);
    if (!vis) return;
    const r = REC[p.work];
    const key = p.work + '|' + recTitle(r) + '|' + r.d;
    if (tag.dataset.k !== key) {
      tag.dataset.k = key;
      tag.querySelector('.sculpture-name').textContent = recTitle(r);
      tag.querySelector('.sculpture-year').textContent = r.d || (r.y != null ? (r.y < 0 ? '公元前 ' + Math.abs(r.y) : r.y + ' 年') : 'unknown');
    }
    tag.style.left = ((_v.x + 1) / 2 * w) + 'px';
    tag.style.top = ((1 - _v.y) / 2 * h) + 'px';
  });
}
