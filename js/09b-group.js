
/* ---------------------------------------------------------------
   Group works.
   STUDIO (private link, you and the group): reads and writes the
   shared store live — db documents + uploaded assets + who is viewing.
   PUBLIC (anyone with the link): reads the snapshot synced from the
   studio — works/works.json plus files under w/<item id>/.
   SITE (standalone website, no Claude accounts): Supabase holds the works
   and files; visitors read the public ones, members unlock editing with
   the group's edit code. The same db-like interface is emulated on top
   of Supabase so the rest of this module is shared.
   Store layout (studio):
     members/<uid>              { nick, role }            each member writes their own
     works/<uid>/items/<id>     one work item             each member writes their own
     works/group/items/<id>     items the owner adds for the group
     hall/main                  { owner, item }            the default sequence of the public hall
     hall/sync                  { at, items }              last sync to the public page
---------------------------------------------------------------- */
// This project always builds the standalone website ('site'). 'studio' and 'public' are the
// earlier claude.ai versions of the page; their branches are kept but never run here.
const MODE = 'site';
const LINKS = { public: null, studio: null };
const STUDIO = MODE === 'studio';
const SITE = MODE === 'site';
const BOOT_SOURCE = '示例日记 · 关键词规则';

const Group = (() => {
  const CATS = { research: '研究', concept: '概念', scan: '扫描', model: '建模', pose: '姿势', colour: '色彩', sound: '声音', skin: '表皮', render: '渲染', other: '其他' };
  const KINDS = { image: '图片', video: '视频', pdf: 'PDF', model: '3D 模型', sound: '声音', file: '文件', note: '文字', link: '链接', day: '一天的序列' };
  const KIND_CAT = { image: 'render', video: 'pose', pdf: 'research', model: 'scan', sound: 'sound', file: 'other', note: 'research', link: 'research', day: 'pose' };
  const GLYPH = { video: '▶', pdf: 'PDF', sound: '♪', file: 'FILE', note: '¶', link: '↗', model: '◇', image: '▢', day: 'DAY' };
  const MODEL_EXT = ['obj', 'stl', 'ply', 'glb'];
  const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
  const DL_OK = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip'];
  const MB = 1048576, WRAP_MAX = 14 * MB, RAW_MAX = 19.5 * MB, SITE_MAX = 50 * MB, TARGET_TRIS = 60000;
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const UPS = { '+Y': I3, '+Z': [[1, 0, 0], [0, 0, 1], [0, -1, 0]], '-Z': [[1, 0, 0], [0, 0, -1], [0, 1, 0]], '-Y': [[1, 0, 0], [0, -1, 0], [0, 0, -1]], '+X': [[0, -1, 0], [1, 0, 0], [0, 0, 1]], '-X': [[0, 1, 0], [-1, 0, 0], [0, 0, 1]] };
  const UP_NAMES = { '+Y': 'Y 轴朝上', '+Z': 'Z 轴朝上', '-Y': '−Y 朝上', '-Z': '−Z 朝上', '+X': 'X 轴朝上', '-X': '−X 朝上' };
  const YAW = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
  const mmul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const orientR = (up, yaw) => { let R = UPS[up] || I3; for (let k = 0; k < ((yaw % 4) + 4) % 4; k++) R = mmul(YAW, R); return R; };
  const validRot = R => Array.isArray(R) && R.length === 3 && R.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const extOf = n => (String(n).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  const fmtSize = b => b >= MB ? (b / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const fmtDate = s => s ? String(s).slice(0, 10) : '';
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function bufToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

  const G = {
    items: new Map(), members: {}, names: {}, main: null, sync: null, updated: null,
    uid: null, meName: '', isOwner: false, canWrite: null, db: null, assets: null, user: null,
    status: 'loading', firstSnap: {}, mainSeen: false, isOpen: false,
  };
  let loadedResolve = null, loadedDone = false, bootFallback = false;

  /* ---------- standalone site: Supabase behind a db-like interface ---------- */
  const SB = (() => {
    const C = window.VENUS_CONFIG || {};
    const url = String(C.supabaseUrl || '').trim().replace(/\/+$/, ''), key = String(C.supabaseKey || '').trim();
    const ok = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url) && key.length > 20;
    const H = (extra) => Object.assign({ apikey: key }, /^eyJ/.test(key) ? { Authorization: 'Bearer ' + key } : {}, extra || {});
    async function fail(r) {
      let m = '';
      try { const j = await r.json(); m = j.message || j.error || j.msg || ''; } catch (e) { /* not json */ }
      const wrong = /wrong edit code/.test(m);
      const e = new Error(wrong ? '编辑码不对' : (m || ('HTTP ' + r.status))); e.wrongCode = wrong; e.status = r.status; throw e;
    }
    async function rpc(fn, args) {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify(args || {}) });
      if (!r.ok) await fail(r);
      const t = await r.text(); return t ? JSON.parse(t) : null;
    }
    async function select(table, q) { const r = await fetch(`${url}/rest/v1/${table}?${q}`, { headers: H() }); if (!r.ok) await fail(r); return r.json(); }
    async function put(name, blob, type) {
      const r = await fetch(`${url}/storage/v1/object/works/${name}`, { method: 'POST', headers: H({ 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': '31536000' }), body: blob });
      if (!r.ok) await fail(r);
    }
    // open editing: when config.js carries editCode, every visitor can edit (no login)
    const openCode = typeof C.editCode === 'string' ? C.editCode.trim() : '';
    return { ok, rpc, select, put, openCode, fileURL: (p) => `${url}/storage/v1/object/public/works/${p}` };
  })();
  const LS = { get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private window */ } } };
  const Site = { code: '', me: '', rows: [], members: [], hall: [], ls: new Set(), loaded: false, busy: 0 };
  const snapOf = (id, data) => ({ id, exists: true, data: () => data, metadata: {} });
  function fireSite(l) {
    if (l.kind === 'members') l.cb({ docs: Site.members.map(m => snapOf(m.id, { nick: m.nick, role: m.role })) });
    else if (l.kind === 'works') l.cb({ docs: Site.rows.filter(r => r.owner === l.owner).map(r => snapOf(r.id, r.data)) });
    else { const h = Site.hall.find(x => x.key === l.key); l.cb({ id: l.key, exists: !!h, data: () => h ? h.data : undefined, metadata: {} }); }
  }
  async function siteRefresh() {
    const [w, m, h] = await Promise.all([
      Site.code ? SB.rpc('list_works', { code: Site.code }) : SB.select('works', 'select=*&order=created_at.desc&limit=2000'),
      SB.select('members', 'select=*'), SB.select('hall', 'select=*')]);
    Site.rows = Array.isArray(w) ? w : []; Site.members = Array.isArray(m) ? m : []; Site.hall = Array.isArray(h) ? h : [];
    Site.loaded = true; Site.ls.forEach(fireSite);
  }
  function listen(l) { Site.ls.add(l); if (Site.loaded) setTimeout(() => fireSite(l), 0); return () => Site.ls.delete(l); }
  async function siteWrite(p, d, op) {
    Site.busy++;
    try {
      if (p[0] === 'works') {
        const owner = p[1], id = p[3];
        if (op === 'delete') await SB.rpc('delete_work', { code: Site.code, wid: id });
        else {
          let data = d;
          if (op === 'update') { const cur = Site.rows.find(r => r.id === id); if (!cur) throw new Error('这件作品已经不存在'); data = { ...cur.data, ...d }; }
          await SB.rpc('save_work', { code: Site.code, wid: id, wowner: owner, wdata: data });
        }
      } else if (p[0] === 'members') await SB.rpc('save_member', { code: Site.code, mid: p[1], mnick: d.nick, mrole: d.role || '' });
      else if (p[0] === 'hall') await SB.rpc('set_hall', { code: Site.code, hkey: p[1], hdata: op === 'delete' ? null : d });
      await siteRefresh();
    } catch (e) { if (e.wrongCode) logout(true); throw e; }
    finally { Site.busy--; }
  }
  const siteDb = {
    collection(path) {
      const m = path.match(/^works\/([A-Za-z0-9_-]+)\/items$/);
      const q = { orderBy: () => q, limit: () => q, onSnapshot: (cb) => listen(m ? { kind: 'works', owner: m[1], cb } : { kind: 'members', cb }) };
      return q;
    },
    doc(path) {
      const p = path.split('/');
      return {
        onSnapshot: (cb) => listen({ kind: 'hall', key: p[1], cb }),
        set: (d) => siteWrite(p, d, 'set'), update: (d) => siteWrite(p, d, 'update'), delete: () => siteWrite(p, null, 'delete'),
      };
    },
  };
  const TYPE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'application/pdf': 'pdf', 'application/json': 'json', 'text/plain': 'txt' };
  const siteAssets = {
    async upload(blob, opt) {
      const type = (opt && opt.type) || blob.type || 'application/octet-stream';
      let ext = TYPE_EXT[type] || extOf(blob.name || '') || 'bin'; if (!/^[a-z0-9]{1,8}$/.test(ext)) ext = 'bin';
      const name = await SB.rpc('request_upload', { code: Site.code, ext });
      await SB.put(name, blob, type);
      return { id: name, url: SB.fileURL(name), sizeBytes: blob.size, contentType: type };
    },
    async delete() { return { deleted: false }; },
  };
  const siteUser = {
    me: async () => ({ id: Site.code ? (Site.me || null) : null, name: '', isOwner: !!Site.code, canEdit: !!Site.code, email: null }),
    can: async () => !!Site.code,
    profiles: async (ids) => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: '' }])),
  };
  async function initSite() {
    $('#gfPubLabel').textContent = '公开：访客也能看到（取消则只有输入编辑码的组员能看到）';
    $('#groupLogin').hidden = false;
    if (!SB.ok) { G.status = 'noconfig'; finishLoad(); changed(); return; }
    Site.code = SB.openCode || LS.get('venus.code'); Site.me = LS.get('venus.me');
    if (SB.openCode) { $('#groupLogin').hidden = true; $('#gfPub').checked = true; $('#gfPub').closest('label').hidden = true; }
    if (Site.code) { try { if (!(await SB.rpc('check_code', { code: Site.code }))) { Site.code = ''; LS.set('venus.code', ''); } } catch (e) { /* offline: try again on refresh */ } }
    G.canWrite = !!Site.code; G.isOwner = !!Site.code; G.uid = Site.code ? (Site.me || null) : null;
    await initStudio([siteDb, siteUser, siteAssets]);
    try { await siteRefresh(); G.status = 'live'; }
    catch (e) { G.status = 'error'; G.err = e.message; finishLoad(); changed(); }
    setInterval(() => { if (document.visibilityState === 'visible' && !Site.busy) siteRefresh().then(() => { if (G.status !== 'live') { G.status = 'live'; changed(); } }).catch(() => {}); }, 25000);
  }
  async function login(code) {
    const ok = await SB.rpc('check_code', { code });
    if (!ok) return false;
    Site.code = code; LS.set('venus.code', code);
    G.canWrite = true; G.isOwner = true;
    if (Site.me) { G.uid = Site.me; subscribeWorks(G.uid); }
    await siteRefresh(); changed();
    return true;
  }
  function logout(silent) {
    if (SB.openCode) { toast('网站的编辑码设置不对，暂时不能修改作品'); return; }
    Site.code = ''; LS.set('venus.code', '');
    G.canWrite = false; G.isOwner = false; G.uid = null;
    siteRefresh().catch(() => {}); changed();
    if (!silent) toast('已退出编辑：现在和访客看到的一样'); else toast('编辑码已失效，请重新登录');
  }
  function openLogin(then) {
    const box = $('#gloginBox'); box.hidden = false; $('#gcode').value = ''; $('#gloginStatus').textContent = ''; setTimeout(() => $('#gcode').focus(), 30);
    const go = async () => {
      const c = $('#gcode').value.trim(); if (!c) return;
      $('#gloginGo').disabled = true; $('#gloginStatus').textContent = '正在核对…';
      try {
        if (await login(c)) { box.hidden = true; toast('编辑已解锁'); if (!G.uid) openMe(then); else if (then) then(); }
        else $('#gloginStatus').textContent = '编辑码不对。请向组长确认。';
      } catch (e) { $('#gloginStatus').textContent = '连接失败：' + e.message; }
      $('#gloginGo').disabled = false;
    };
    $('#gloginGo').onclick = go;
    $('#gcode').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    $('#gloginCancel').onclick = () => { box.hidden = true; };
  }
  const loaded = new Promise(r => { loadedResolve = r; });

  /* ---------- item shape (same in both modes) ---------- */
  function cleanDay(day) {
    const seq = day.seq.slice(0, 10).map(a => ({
      cls: CLS.includes(a && a.cls) ? a.cls : 'standing', g: a && a.g && GESTURES[a.g] ? a.g : null,
      label: String((a && a.label) || '').slice(0, 30), time: a && typeof a.time === 'string' ? a.time.slice(0, 5) : null,
      hours: Number.isFinite(+(a && a.hours)) && +a.hours > 0 ? Math.min(12, Math.max(0.1, +a.hours)) : null,
    }));
    const override = {};
    if (day.override && typeof day.override === 'object') for (const [k, v] of Object.entries(day.override)) if (/^\d$/.test(k) && v) override[k] = String(v);
    const palettes = {};
    if (day.palettes && typeof day.palettes === 'object') for (const c of CLS) { const p = day.palettes[c]; if (Array.isArray(p) && p.length === 5 && p.every(x => /^#[0-9a-f]{6}$/i.test(x))) palettes[c] = p; }
    return { seq, override, palettes, source: String(day.source || '').slice(0, 80), text: day.text ? String(day.text).slice(0, 4000) : '' };
  }
  function norm(owner, id, d) {
    if (!d || typeof d !== 'object') return null;
    let kind = KINDS[d.kind] ? d.kind : 'note';
    const day = kind === 'day' && d.day && Array.isArray(d.day.seq) && d.day.seq.length ? cleanDay(d.day) : null;
    if (kind === 'day' && !day) kind = 'note';
    const files = Array.isArray(d.files) ? d.files.filter(f => f && typeof f === 'object' && (f.aid || f.p)).slice(0, 6).map(f => ({
      role: String(f.role || 'main'), aid: f.aid ? String(f.aid) : '', p: f.p ? String(f.p) : '', ct: String(f.ct || ''), name: String(f.name || '').slice(0, 160), size: +f.size || 0, w: f.w ? 1 : 0,
    })) : [];
    const atlas = d.atlas != null && REC[String(d.atlas)] && !REC[String(d.atlas)].member ? String(d.atlas) : null;
    return {
      key: owner + '/' + id, owner, id, kind, day, files, atlas,
      title: String(d.title || '').slice(0, 120), note: String(d.note || '').slice(0, 4000),
      cat: CATS[d.cat] ? d.cat : 'other', link: /^https?:\/\/\S+$/i.test(d.link || '') ? String(d.link).slice(0, 500) : '',
      pos: Number.isInteger(d.pos) && d.pos >= 0 && d.pos < 10 ? d.pos : null,
      cls: CLS.includes(d.cls) ? d.cls : null, rot: validRot(d.rot) ? d.rot : I3,
      pub: d.pub !== false, createdAt: String(d.createdAt || ''), updatedAt: String(d.updatedAt || d.createdAt || ''),
      credit: d.credit ? String(d.credit).slice(0, 40) : '', role: d.role ? String(d.role).slice(0, 40) : '',
    };
  }
  const fileOf = (it, role) => it.files.find(f => f.role === role) || null;
  const fileURL = (it, f) => !f ? '' : SITE ? SB.fileURL(f.aid) : STUDIO ? '/_blob/' + f.aid : `w/${it.id}/${f.p}`;
  function creditOf(it) {
    if (it.credit) return it.credit;
    const m = G.members[it.owner];
    if (m && m.nick) return m.nick;
    if (G.names[it.owner]) return G.names[it.owner];
    return it.owner === 'group' ? '小组' : '组员';
  }
  const roleOf = it => it.role || (G.members[it.owner] && G.members[it.owner].role) || '';
  function thumbOf(it) {
    const f = fileOf(it, 'thumb') || (it.kind === 'image' ? fileOf(it, 'main') : null);
    return f ? fileURL(it, f) : '';
  }
  const canEdit = it => SITE ? !!Site.code && !!G.db : STUDIO && !!G.db && !!G.uid && G.canWrite !== false && (it.owner === G.uid || G.isOwner);
  const canAdd = () => SITE ? !!Site.code && !!G.db : STUDIO && !!G.db && !!G.uid && G.canWrite !== false;
  const editorView = () => STUDIO || (SITE && !!Site.code && !SB.openCode);
  const byTime = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  function mainItem() {
    if (!G.main || !G.main.item) return null;
    const it = G.items.get((G.main.owner || 'pub') + '/' + G.main.item);
    return it && it.kind === 'day' ? it : null;
  }

  /* ---------- loading ---------- */
  function finishLoad() {
    if (loadedDone) return; loadedDone = true; loadedResolve();
    if (bootFallback && S.source === BOOT_SOURCE) { const m = mainItem(); if (m) applyItemDay(m, { source: '小组默认序列 · ' }); }
  }
  function maybeFinish() { if (G.mainSeen && (!G.main || G.firstSnap[G.main.owner])) finishLoad(); }
  async function initPublic() {
    try {
      if (location.protocol === 'file:') throw new Error('local');
      const r = await fetch('works/works.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      (Array.isArray(j.items) ? j.items : []).forEach(d => { if (!d || !/^[A-Za-z0-9_-]{1,40}$/.test(String(d.id))) return; const it = norm('pub', String(d.id), d); if (it) G.items.set(it.key, it); });
      G.updated = j.updated || null;
      G.main = j.main ? { owner: 'pub', item: String(j.main) } : null;
      G.status = 'public';
    } catch (e) { G.status = location.protocol === 'file:' ? 'local' : 'empty'; }
    finishLoad(); changed();
  }
  const subs = new Map();
  function subscribeWorks(uid) {
    if (!G.db || subs.has(uid) || subs.size >= 48) return;
    let q;
    try { q = G.db.collection(`works/${uid}/items`).orderBy('createdAt', 'desc').limit(400); } catch (e) { return; }
    subs.set(uid, q.onSnapshot((snap) => {
      for (const k of [...G.items.keys()]) if (k.startsWith(uid + '/')) G.items.delete(k);
      snap.docs.forEach(d => { const it = norm(uid, d.id, d.data()); if (it) G.items.set(it.key, it); });
      G.firstSnap[uid] = true; maybeFinish(); changed();
    }, dbErr));
  }
  function dbErr(e) {
    if (e && e.code === 'revoked') { G.status = 'revoked'; renderHead(); }
    else console.warn('[group] db', e && e.code, e && e.message);
  }
  async function initStudio(inj) {
    const [db, user, assets] = inj || await Promise.all([claudeUse('db'), claudeUse('user'), claudeUse('assets')]);
    G.db = db; G.user = user; G.assets = assets;
    if (user) {
      try { const me = await user.me(); G.uid = me.id || null; G.meName = me.name || ''; G.isOwner = !!me.isOwner; } catch (e) { /* stays anonymous */ }
      if (SITE) G.canWrite = !!Site.code; else
      try { G.canWrite = await user.can('data.write'); } catch (e) { G.canWrite = null; }
    }
    if (!db) { G.status = 'nodb'; finishLoad(); changed(); return; }
    G.status = 'live';
    db.collection('members').onSnapshot((snap) => {
      const m = {};
      snap.docs.forEach(d => { const x = d.data() || {}; m[d.id] = { nick: String(x.nick || '').slice(0, 30), role: String(x.role || '').slice(0, 40) }; });
      G.members = m; Object.keys(m).forEach(subscribeWorks); refreshNames(); changed();
    }, dbErr);
    subscribeWorks('group'); if (G.uid) subscribeWorks(G.uid);
    db.doc('hall/main').onSnapshot((s) => {
      const d = s.exists ? s.data() : null;
      G.main = d && d.owner && d.item ? { owner: String(d.owner), item: String(d.item) } : null;
      if (G.main) subscribeWorks(G.main.owner);
      G.mainSeen = true; maybeFinish(); changed();
    }, dbErr);
    db.doc('hall/sync').onSnapshot((s) => { G.sync = s.exists ? s.data() : null; renderHead(); }, dbErr);
    setTimeout(finishLoad, 6000);
  }
  async function refreshNames() {
    if (!G.user) return;
    const ids = Object.keys(G.members).filter(x => x !== 'group');
    if (!ids.length) return;
    try {
      const ps = await G.user.profiles(ids); let diff = false;
      for (const id of ids) { const n = (ps[id] && ps[id].name) || ''; if (G.names[id] !== n) { G.names[id] = n; diff = true; } }
      if (diff) changed();
    } catch (e) { /* names stay as the members wrote them */ }
  }

  /* ---------- reflecting the works in the hall ---------- */
  function registerModels() {
    for (const it of G.items.values()) {
      if (it.kind !== 'model' || !fileOf(it, 'mesh')) continue;
      const id = 'w-' + it.id, prev = REC[id];
      if (prev && prev.item.updatedAt !== it.updatedAt) meshCache.delete(id);
      REC[id] = { id, t: it.title || '组员模型', a: creditOf(it), d: fmtDate(it.createdAt), m: '小组作品', cls: it.cls || 'standing', g: null, y: null, rot: it.rot, sk: null, kind: 'figure', member: true, item: it, pose: [], gest: [], cloth: [], conf: null, desc: it.note, poseRaw: '' };
    }
  }
  let changeTimer = 0;
  function changed() {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      registerModels();
      const n = [...G.items.values()].length;
      const c = $('#groupCnt'); if (c) c.textContent = n ? String(n) : '';
      const sb = $('#saveDayBtn'); if (sb) sb.hidden = !canAdd();
      if (G.isOpen) { renderHead(); renderFilters(); if (!$('#groupGrid').hidden) renderGrid(); else if (cur) { const it = G.items.get(cur); if (it) renderInfo(it); else backToGrid(); } }
      if (typeof renderData === 'function' && S.pos.length) renderData();
      $$('.tag').forEach(t => { t.dataset.k = ''; });
      if (Sound.on) loadSounds();
    }, 60);
  }
  function linkedTo(i, atlasId) {
    return [...G.items.values()].filter(it => it.pos === i || (atlasId && it.atlas === atlasId)).sort(byTime);
  }
  const countAt = (i) => { let n = 0; for (const it of G.items.values()) if (it.pos === i) n++; return n; };
  function thumbFor(id) {
    const r = REC[id];
    const t = r && r.item ? thumbOf(r.item) : '';
    return t || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 100"><rect width="90" height="100" fill="#fff"/><path d="M45 18c8 0 12 7 11 14-1 6-4 9-4 13 0 6 12 7 12 22l-4 20H30l-4-20c0-15 12-16 12-22 0-4-3-7-4-13-1-7 3-14 11-14z" fill="#ebe7e1" stroke="#cfc8bd"/></svg>');
  }

  /* ---------- files ---------- */
  async function fileBytes(it, f) {
    const r = await fetch(fileURL(it, f)); if (!r.ok) throw new Error('文件无法读取（' + r.status + '）');
    if (f.w) {
      const j = await r.json(); if (!j || j.format !== 'file' || typeof j.b64 !== 'string') throw new Error('文件格式不对');
      return { buf: b64ToBuf(j.b64), name: j.name || f.name || 'file', type: j.type || '' };
    }
    return { buf: await r.arrayBuffer(), name: f.name || ('file.' + extOf(f.p || '')), type: f.ct };
  }
  async function fetchMemberMesh(it) {
    const f = fileOf(it, 'mesh'); if (!f) throw new Error('没有模型文件');
    const r = await fetch(fileURL(it, f)); if (!r.ok) throw new Error('模型文件无法读取');
    const j = await r.json();
    if (!j || j.format !== 'ggp1' || typeof j.b64 !== 'string') throw new Error('模型文件格式不对');
    return parseMeshBin(b64ToBuf(j.b64));
  }
  async function download(it, f) {
    try {
      toast('正在准备下载…');
      const { buf, name, type } = await fileBytes(it, f);
      const safe = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'file';
      if (SITE || DL_OK.includes(extOf(safe))) await saveFile(safe, new Blob([buf], { type: type || 'application/octet-stream' }));
      else await saveFile(safe.replace(/\.[^.]*$/, '') + '.zip', makeZip([{ name: safe, data: new Uint8Array(buf) }]));
    } catch (e) { toast('下载失败：' + e.message); }
  }
  const soundDone = new Set();
  async function loadSounds() {
    const want = {};
    for (const it of G.items.values()) if (it.kind === 'sound' && it.cls && fileOf(it, 'main')) { const c = want[it.cls]; if (!c || it.createdAt > c.createdAt) want[it.cls] = it; }
    for (const [cls, it] of Object.entries(want)) {
      const k = cls + '|' + it.key + '|' + it.updatedAt; if (soundDone.has(k)) continue; soundDone.add(k);
      try { const { buf } = await fileBytes(it, fileOf(it, 'main')); await Sound.load(cls, { arrayBuffer: async () => buf, name: (it.title || '组员录音') + ' · ' + creditOf(it) }); }
      catch (e) { console.warn('[group] sound', e); }
    }
  }

  /* ---------- the day sequences ---------- */
  function applyItemDay(it, opts = {}) {
    const d = it.day; if (!d) return Promise.resolve();
    registerModels();
    S.palettes = JSON.parse(JSON.stringify(DEFAULT_PALETTES)); Object.assign(S.palettes, JSON.parse(JSON.stringify(d.palettes || {})));
    S.posPal = {}; S.sel = 0;
    const day = d.seq.map(a => ({ ...a, hours: a.hours || CLASS[a.cls].dur }));
    const override = {}; for (const [k, v] of Object.entries(d.override || {})) if (REC[v]) override[k] = v;
    if (d.text) $('#journal').value = d.text;
    $('#textStatus').innerHTML = `${esc(it.title || '组员的一天')}：<b>${day.map(x => CLASS[x.cls].zh).join(' → ')}</b>`;
    return applyDay(day, { source: (opts.source || '小组 · ') + (it.title || creditOf(it) + ' 的一天'), fresh: true, override, animate: opts.animate });
  }
  function dayFromHall(withText) {
    const pal = {};
    for (const c of CLS) if (JSON.stringify(S.palettes[c]) !== JSON.stringify(DEFAULT_PALETTES[c])) pal[c] = S.palettes[c].slice();
    return {
      seq: S.day.map(a => ({ cls: a.cls, g: a.g || null, label: String(a.label || '').slice(0, 30), time: a.time || null, hours: a.hours || null })),
      override: { ...S.override }, palettes: pal, source: String(S.source || '').slice(0, 80),
      text: withText ? $('#journal').value.slice(0, 4000) : '',
    };
  }

  /* ---------- 3D viewer (detail and upload preview) ---------- */
  function makeViewer(canvas, keep) {
    let r = null, sc, cam, ctl, holder, raf = 0, running = false, spin = true;
    function init() {
      if (r) return;
      r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!keep });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      sc = new THREE.Scene(); sc.background = new THREE.Color(0xffffff);
      const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(r), 0.04).texture; sc.environmentIntensity = 0.75;
      sc.add(new THREE.HemisphereLight(0xffffff, 0xe6e1d8, 0.6));
      const key = new THREE.DirectionalLight(0xfff6ec, 2.4); key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 20 }); key.shadow.radius = 6; sc.add(key);
      const fill = new THREE.DirectionalLight(0xeef3ff, 0.7); fill.position.set(-4, 2, 2); sc.add(fill);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.12 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
      cam = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
      ctl = new OrbitControls(cam, canvas); ctl.enableDamping = true; ctl.dampingFactor = 0.08;
      holder = new THREE.Group(); sc.add(holder);
      new ResizeObserver(resize).observe(canvas.parentElement);
    }
    function resize() { if (!r) return; const b = canvas.parentElement.getBoundingClientRect(); if (!b.width || !b.height) return; r.setSize(b.width, b.height, false); cam.aspect = b.width / b.height; cam.updateProjectionMatrix(); }
    function frame() { if (!running) return; raf = requestAnimationFrame(frame); if (spin) holder.rotation.y += 0.004; ctl.update(); r.render(sc, cam); }
    return {
      show(geo) {
        init(); holder.clear(); holder.rotation.y = 0.45;
        const m = new THREE.Mesh(geo, ceramic); m.castShadow = true; m.receiveShadow = true; holder.add(m);
        geo.computeBoundingBox(); const b = geo.boundingBox;
        const c = new THREE.Vector3(0, b.max.y / 2, 0), rad = Math.max(b.max.y, b.max.x - b.min.x, b.max.z - b.min.z) * 0.62;
        cam.position.set(rad * 1.3, c.y + rad * 0.35, rad * 3.1); ctl.target.copy(c); ctl.update(); resize();
      },
      clear() { if (holder) holder.clear(); },
      start() { init(); if (running) return; running = true; resize(); frame(); },
      stop() { running = false; cancelAnimationFrame(raf); },
      setSpin(v) { spin = v; },
      snapshot(w, h) {
        init(); resize(); r.render(sc, cam);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        const sw = canvas.width, sh = canvas.height, k = Math.max(w / sw, h / sh);
        g.drawImage(canvas, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
        return new Promise(res => c.toBlob(res, 'image/webp', 0.86));
      },
    };
  }

  /* ---------- reading uploads ---------- */
  function clusterPass(P, mn, ext, N) {
    const cell = ext / N, D = N + 1, map = new Map(), sum = [], vid = new Int32Array(P.length / 3);
    let vc = 0;
    for (let i = 0, v = 0; i < P.length; i += 3, v++) {
      const ix = Math.min(N, Math.floor((P[i] - mn[0]) / cell)), iy = Math.min(N, Math.floor((P[i + 1] - mn[1]) / cell)), iz = Math.min(N, Math.floor((P[i + 2] - mn[2]) / cell));
      const k = (ix * D + iy) * D + iz;
      let id = map.get(k);
      if (id === undefined) { id = vc++; map.set(k, id); sum.push(0, 0, 0, 0); }
      sum[id * 4] += P[i]; sum[id * 4 + 1] += P[i + 1]; sum[id * 4 + 2] += P[i + 2]; sum[id * 4 + 3]++;
      vid[v] = id;
    }
    const idx = [];
    for (let t = 0; t < vid.length; t += 3) { const a = vid[t], b = vid[t + 1], c = vid[t + 2]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
    return { sum, vc, idx };
  }
  function clusterMesh(P) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { const v = P[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    if (!(ext > 0) || !isFinite(ext)) throw new Error('模型的尺寸读不出来');
    const tris = P.length / 9;
    let N = tris <= TARGET_TRIS ? 4096 : Math.max(24, Math.round(Math.sqrt(TARGET_TRIS / 3))), res = null;
    for (let k = 0; k < 6; k++) {
      res = clusterPass(P, mn, ext, N);
      const n = res.idx.length / 3;
      if (n <= TARGET_TRIS * 1.15 || N <= 24) { if (n >= TARGET_TRIS * 0.55 || tris <= TARGET_TRIS || N >= 1400) break; N = Math.min(1400, Math.round(N * Math.sqrt(TARGET_TRIS / Math.max(1, n)) * 0.95)); continue; }
      N = Math.max(24, Math.floor(N * Math.sqrt(TARGET_TRIS / n) * 0.95));
    }
    if (!res.idx.length) throw new Error('模型简化后没有剩下面');
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const pos = new Float32Array(res.vc * 3);
    for (let v = 0; v < res.vc; v++) { const n = res.sum[v * 4 + 3]; for (let a = 0; a < 3; a++) pos[v * 3 + a] = (res.sum[v * 4 + a] / n - c[a]) / ext; }
    return { pos, idx: Uint32Array.from(res.idx), srcTris: tris };
  }
  async function readModel(file) {
    const ext = extOf(file.name), buf = await file.arrayBuffer();
    let root;
    if (ext === 'obj') { const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'); root = new OBJLoader().parse(new TextDecoder().decode(buf)); }
    else if (ext === 'stl') { const { STLLoader } = await import('three/addons/loaders/STLLoader.js'); root = new THREE.Mesh(new STLLoader().parse(buf)); }
    else if (ext === 'ply') {
      const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js'); const g = new PLYLoader().parse(buf);
      if (!g.index) throw new Error('这个 PLY 是点云，没有三角面；请先在 MeshLab 或 CloudCompare 里生成网格');
      root = new THREE.Mesh(g);
    } else if (ext === 'glb') {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gl = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, (e) => rej(new Error('GLB 无法读取（Draco 压缩的文件请先导出为普通 GLB 或 OBJ）'))));
      root = gl.scene;
    } else throw new Error('3D 模型支持 OBJ、STL、PLY、GLB');
    root.updateMatrixWorld(true);
    const chunks = []; let n = 0; const v = new THREE.Vector3();
    root.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const g = o.geometry, P = g.attributes.position, I = g.index, M = o.matrixWorld, cnt = (I ? I.count : P.count) - (I ? I.count : P.count) % 3;
      const arr = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) { v.fromBufferAttribute(P, I ? I.getX(k) : k).applyMatrix4(M); arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z; }
      chunks.push(arr); n += cnt;
    });
    if (n < 3) throw new Error('文件里没有找到三角面');
    const P = new Float32Array(n * 3); let o = 0; for (const a of chunks) { P.set(a, o); o += a.length; }
    return clusterMesh(P);
  }
  function encodeMesh(pos, idx) {
    const buf = new ArrayBuffer(12 + pos.length * 4 + idx.length * 4), dv = new DataView(buf);
    dv.setUint32(0, MESH_MAGIC, true); dv.setUint32(4, pos.length / 3, true); dv.setUint32(8, idx.length, true);
    new Float32Array(buf, 12, pos.length).set(pos); new Uint32Array(buf, 12 + pos.length * 4, idx.length).set(idx);
    return new Uint8Array(buf);
  }
  async function imageRenditions(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('这张图片无法读取（HEIC 等格式请先转成 JPG 或 PNG）'); }
    const big = Math.max(bmp.width, bmp.height);
    const render = (k, q) => new Promise(res => {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); c.toBlob(res, 'image/webp', q);
    });
    let main = file;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 15 * MB || big > 4200) main = await render(Math.min(1, 3200 / big), 0.9);
    const thumb = await render(Math.min(1, 520 / big), 0.82);
    return { main, thumb };
  }
  async function videoThumb(file) {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
    try {
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video')); setTimeout(() => rej(new Error('timeout')), 8000); });
      v.currentTime = Math.min(1, (v.duration || 2) * 0.2);
      await new Promise(res => { v.onseeked = res; setTimeout(res, 3000); });
      const k = Math.min(1, 520 / Math.max(v.videoWidth, v.videoHeight || 1));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/webp', 0.82));
    } catch (e) { return null; } finally { URL.revokeObjectURL(v.src); }
  }
  async function wrapFile(file) {
    const b64 = bufToB64(new Uint8Array(await file.arrayBuffer()));
    return new Blob([JSON.stringify({ format: 'file', name: file.name, type: file.type || '', size: file.size, b64 })], { type: 'application/json' });
  }
  const UPERR = { too_large: '文件超过 20 MB', unsupported_type: '这种文件类型不能上传', quota_or_state: '工作台的存储空间已满，或页面暂时不能接收文件', rate_limited: '上传太频繁，请稍等再试', not_granted: '你现在只有查看权限，不能上传', capability_disabled: '这个页面现在不能上传文件', capability_removed: '这个页面现在不能上传文件', upstream_auth: '登录状态失效，请刷新页面', invalid_request: '文件内容无法上传' };
  async function upload(blob, type) {
    if (!G.assets) throw new Error('你现在没有上传权限');
    const go = () => G.assets.upload(blob, type ? { type } : undefined);
    try { return await go(); }
    catch (e) {
      if (e && e.code === 'store_unavailable') { await sleep(1200); try { return await go(); } catch (e2) { e = e2; } }
      throw new Error(UPERR[e && e.code] || ('上传失败（' + ((e && e.code) || '未知原因') + '）'));
    }
  }
  function kindOfFile(f) {
    const ext = extOf(f.name), t = f.type || '';
    if (MODEL_EXT.includes(ext)) return 'model';
    if (/^image\//.test(t) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp'].includes(ext)) return 'image';
    if (/^video\//.test(t) || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (/^audio\//.test(t) || AUDIO_EXT.includes(ext)) return 'sound';
    return 'file';
  }

  /* ---------- overlay: grid ---------- */
  const el = $('#group'), grid = $('#groupGrid'), detail = $('#gdetail');
  let fCat = 'all', fWho = 'all', query = '', cur = null;
  const viewer = makeViewer($('#gCanvas'), false);
  function renderHead() {
    if (!el) return;
    const n = G.items.size;
    let sub;
    if (SITE) {
      const me = G.uid && G.members[G.uid] ? G.members[G.uid].nick : '';
      sub = SB.openCode ? `小组平台 · ${n} 件 · 任何人都可以添加和修改作品${me ? ' · 你的署名：' + me : ''}` : Site.code ? `小组平台 · ${n} 件 · 你正在编辑${me ? '（' + me + '）' : ''} · 标为“仅组内”的作品访客看不到` : `组员作品 · ${n} 件 · 组员输入编辑码后可以添加和修改`;
    } else if (STUDIO) {
      const s = G.sync && G.sync.at ? `公开展厅上次同步：${fmtDate(G.sync.at)}（${+G.sync.items || 0} 件）` : '还没有同步到公开展厅';
      sub = `小组工作台 · ${n} 件 · 只有你和组员能编辑 · ${s}`;
    } else sub = G.status === 'public' ? `组员作品 · ${n} 件${G.updated ? ' · 更新于 ' + fmtDate(G.updated) : ''}` : '组员的作品';
    $('#groupSub').textContent = sub;
    $('#groupAdd').hidden = !canAdd();
    $('#groupMe').hidden = SITE ? !Site.code : !(STUDIO && G.db && G.uid && G.canWrite !== false);
    const gl = $('#groupLogin'); if (gl) { gl.hidden = !SITE || G.status === 'noconfig' || !!SB.openCode; gl.textContent = Site.code ? '退出编辑' : '组员登录'; }
    const ban = $('#groupBanner'); let msg = '';
    if (SITE) {
      if (G.status === 'noconfig') msg = '网站还没有连接数据库：请在 config.js 里填入 Supabase 的项目地址和 anon / publishable key（见 README.md）。';
      else if (G.status === 'error') msg = '暂时连不上小组数据库（' + (G.err || '网络错误') + '），稍后会自动重试。';
      else if (G.status === 'loading') msg = '正在载入组员作品…';
      else if (Site.code && !G.uid) msg = '先点“我的署名”选择你是谁，作品会标上你的名字。';
      else if (!n) msg = Site.code ? '还没有作品：点“+ 添加作品”上传第一件。' : '组员的作品会出现在这里。';
    } else if (STUDIO) {
      if (G.status === 'loading') msg = '正在连接小组工作台…';
      else if (G.status === 'nodb') msg = '小组数据暂时不可用。';
      else if (G.status === 'revoked') msg = '你对这个工作台的访问权限已经变化，请刷新页面。';
      else if (!G.uid) msg = '登录后才能添加作品。';
      else if (G.canWrite === false) msg = '你现在只能查看。请让页面所有者在右上角 Share 里把你设为可编辑（Editor）。';
      else if (!G.assets) msg = '你可以添加文字、链接和一天的序列；上传文件需要编辑权限。';
      else if (!G.members[G.uid] || !G.members[G.uid].nick) msg = '先点“我的署名”写上你的名字：公开展厅会用它标注你的作品。';
    } else {
      if (G.status === 'local') msg = '本地版不包含小组作品，请在线打开公开链接查看。';
      else if (!n) msg = '组员的作品同步后会出现在这里。';
    }
    ban.hidden = !msg; ban.textContent = msg;
    const pl = $('#groupPublicLink'); if (pl) { pl.hidden = !(STUDIO && LINKS.public); if (LINKS.public) pl.href = LINKS.public; }
  }
  function renderFilters() {
    const present = new Set([...G.items.values()].map(it => it.cat));
    const chips = [['all', '全部']].concat(Object.entries(CATS).filter(([k]) => present.has(k)));
    if (fCat !== 'all' && !present.has(fCat)) fCat = 'all';
    $('#groupFilters').innerHTML = chips.map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === fCat}">${t}</button>`).join('');
    $$('#groupFilters button').forEach(b => b.onclick = () => { fCat = b.dataset.f; renderFilters(); renderGrid(); });
    const who = {}; for (const it of G.items.values()) who[it.owner] = creditOf(it);
    const sel = $('#groupWho');
    sel.innerHTML = '<option value="all">全部组员</option>' + Object.entries(who).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${esc(k)}" ${k === fWho ? 'selected' : ''}>${esc(n)}</option>`).join('');
    sel.hidden = Object.keys(who).length < 2;
  }
  function visible() {
    const q = query.toLowerCase();
    return [...G.items.values()].filter(it =>
      (fCat === 'all' || it.cat === fCat) && (fWho === 'all' || it.owner === fWho) &&
      (!q || [it.title, it.note, creditOf(it), CATS[it.cat], KINDS[it.kind]].some(x => x && x.toLowerCase().includes(q)))).sort(byTime);
  }
  function dayDots(it) { return `<span class="gday">${it.day.seq.map(a => `<i style="background:${CLASS[a.cls].color}" title="${CLASS[a.cls].zh}"></i>`).join('')}</span>`; }
  function cardHTML(it) {
    const t = thumbOf(it);
    const vis = it.kind === 'day' ? dayDots(it) : t ? `<img loading="lazy" alt="" src="${esc(t)}">` : `<span class="gglyph">${GLYPH[it.kind]}</span>`;
    const isMain = mainItem() === it;
    const badges = [
      editorView() ? `<span class="tagchip ${it.pub ? 'pub' : ''}">${it.pub ? '公开' : '仅组内'}</span>` : '',
      it.pos != null ? `<span class="tagchip">第 ${pad2(it.pos + 1)} 位</span>` : '',
      it.atlas ? `<span class="tagchip">图谱 #${esc(it.atlas)}</span>` : '',
      isMain ? '<span class="tagchip pub">默认序列</span>' : '',
    ].join('');
    return `<button class="acard gcard" data-k="${esc(it.key)}">
      <span class="aimg gimg ${it.kind}">${vis}</span>
      <span class="gk">${KINDS[it.kind]} · ${CATS[it.cat]}</span>
      <span class="at">${esc(it.title || '（无标题）')}</span>
      <span class="am">${esc(creditOf(it))} · ${fmtDate(it.createdAt)}</span>
      <span class="gb">${badges}</span></button>`;
  }
  function renderGrid() {
    const list = visible();
    grid.innerHTML = list.map(cardHTML).join('') || (G.items.size ? '<p class="muted">没有符合条件的作品。</p>' : '');
    $$('.gcard', grid).forEach(b => b.onclick = () => showDetail(b.dataset.k));
  }
  function backToGrid() { cur = null; viewer.stop(); detail.hidden = true; grid.hidden = false; renderGrid(); }

  /* ---------- overlay: detail ---------- */
  async function showDetail(key) {
    const it = G.items.get(key); if (!it) return;
    cur = key; grid.hidden = true; detail.hidden = false;
    const media = $('#gmedia'), cv = $('#gCanvas'), tools = $('#gtools');
    media.innerHTML = ''; cv.hidden = true; tools.hidden = true; viewer.stop(); viewer.clear();
    renderInfo(it);
    const main = fileOf(it, 'main');
    if (it.kind === 'model') {
      cv.hidden = false; tools.hidden = false; viewer.start();
      try { const m = await meshOf('w-' + it.id); if (cur !== key) return; viewer.show(m.geo); }
      catch (e) { media.innerHTML = '<p class="muted">模型加载失败：' + esc(e.message) + '</p>'; }
    } else if (it.kind === 'image' && main) media.innerHTML = `<img alt="${esc(it.title)}" src="${esc(fileURL(it, main))}">`;
    else if (it.kind === 'video' && main) media.innerHTML = `<video controls playsinline preload="metadata" src="${esc(fileURL(it, main))}"></video>`;
    else if (it.kind === 'sound' && main) {
      media.innerHTML = '<div class="gbig">♪</div><p class="muted small">正在读取音频…</p>';
      try { const { buf, type } = await fileBytes(it, main); if (cur !== key) return; const u = URL.createObjectURL(new Blob([buf], { type: type || 'audio/mpeg' })); media.innerHTML = `<div class="gbig">♪</div><audio controls src="${u}"></audio>`; }
      catch (e) { media.innerHTML = '<p class="muted">音频无法读取。</p>'; }
    } else if (it.kind === 'day') {
      media.innerHTML = `<ol class="gseq">${it.day.seq.map((a, i) => `<li><span class="n">${pad2(i + 1)}</span><span class="dot" style="background:${CLASS[a.cls].color}"></span><span>${esc(a.time ? a.time + ' ' : '')}${esc(a.label || CLASS[a.cls].zh)}</span><span class="muted">${CLASS[a.cls].zh}${a.g ? ' · ' + GESTURES[a.g].zh : ''}</span></li>`).join('')}</ol>${it.day.text ? `<p class="gtext">${esc(it.day.text)}</p>` : ''}`;
    } else if (it.kind === 'link') media.innerHTML = `<div class="gbig">↗</div><a class="btn primary" href="${esc(it.link)}" target="_blank" rel="noopener">打开链接</a><p class="small muted gurl">${esc(it.link)}</p>`;
    else if (it.kind === 'note') media.innerHTML = `<p class="gtext lg">${esc(it.note || it.title)}</p>`;
    else media.innerHTML = `<div class="gbig">${GLYPH[it.kind]}</div>${main ? `<p class="small muted">${esc(main.name)} · ${fmtSize(main.size)}</p>` : ''}`;
  }
  function renderInfo(it) {
    const info = $('#ginfo'), main = fileOf(it, 'main'), orig = fileOf(it, 'orig');
    const isMain = mainItem() === it, mine = canEdit(it);
    const r = it.atlas ? REC[it.atlas] : null;
    info.innerHTML = `<button class="btn ghost" id="gBack">← 返回小组作品</button>
      <div class="eyebrow">${KINDS[it.kind]} · ${CATS[it.cat]}${editorView() ? ' · ' + (it.pub ? '公开' : '仅组内') : ''}</div>
      <h2 class="dname lg">${esc(it.title || '（无标题）')}</h2>
      <div class="den">${esc(creditOf(it))}${roleOf(it) ? ' · ' + esc(roleOf(it)) : ''} · ${fmtDate(it.createdAt)}</div>
      ${it.note && it.kind !== 'note' ? `<p class="desc">${esc(it.note)}</p>` : ''}
      <dl class="meta">
        ${it.pos != null ? `<dt>展厅位置</dt><dd>第 ${pad2(it.pos + 1)} 位</dd>` : ''}
        ${r ? `<dt>图谱</dt><dd>#${esc(r.id)} ${esc(recTitle(r))}</dd>` : ''}
        ${it.kind === 'model' ? `<dt>姿势类别</dt><dd>${CLASS[it.cls || 'standing'].zh}</dd>` : ''}
        ${it.kind === 'sound' && it.cls ? `<dt>用作声音</dt><dd>「${CLASS[it.cls].zh}」类</dd>` : ''}
        ${it.link && it.kind !== 'link' ? `<dt>链接</dt><dd><a href="${esc(it.link)}" target="_blank" rel="noopener">${esc(it.link.replace(/^https?:\/\//, '').slice(0, 48))} ↗</a></dd>` : ''}
        ${main ? `<dt>文件</dt><dd>${esc(main.name || KINDS[it.kind])} · ${fmtSize(main.size)}</dd>` : ''}
      </dl>
      <div class="row">
        ${it.kind === 'model' ? `<button class="btn primary" id="gPlace">放到展厅第 ${pad2(S.sel + 1)} 位</button>` : ''}
        ${it.kind === 'day' ? '<button class="btn primary" id="gLoadDay">在展厅中载入这一天</button>' : ''}
        ${it.pos != null ? '<button class="btn" id="gGoPos">去展厅里的位置</button>' : ''}
        ${r ? '<button class="btn" id="gAtlas">在图谱中查看</button>' : ''}
        ${(it.kind === 'image' || it.kind === 'pdf' || it.kind === 'video') && main ? `<a class="btn" href="${esc(fileURL(it, main))}" target="_blank" rel="noopener">在新窗口打开 ↗</a>` : ''}
        ${main && it.kind !== 'model' ? '<button class="btn" id="gDl">下载</button>' : ''}
        ${orig ? '<button class="btn" id="gDlOrig">下载原始模型</button>' : ''}
      </div>
      ${it.kind === 'day' && (SITE ? !!Site.code : STUDIO && G.db && G.canWrite !== false && G.uid) ? `<div class="row"><button class="btn" id="gMain">${isMain ? '取消公开展厅的默认序列' : '设为公开展厅的默认序列'}</button></div>` : ''}
      ${mine ? `<div class="row"><button class="btn" id="gEdit">编辑</button><button class="btn" id="gPub">${it.pub ? '改为仅组内可见' : '改为公开'}</button><button class="btn ghost danger" id="gDel">删除</button></div>` : ''}
      ${it.kind === 'model' ? '<p class="small muted">组员上传的模型：按图谱同样的方式缩放到姿势类别的尺寸，统一用白色陶瓷材质；展示用的是简化后的网格。</p>' : ''}`;
    $('#gBack').onclick = backToGrid;
    const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
    on('gPlace', () => { S.override[S.sel] = 'w-' + it.id; close(); applyDay(S.day, { source: S.source || '手动编排' }); setTimeout(() => flyToPosition(S.sel), 400); toast(`第 ${pad2(S.sel + 1)} 位换成：${it.title || '组员模型'}`); });
    on('gLoadDay', () => { close(); applyItemDay(it).then(() => flyHome()); });
    on('gGoPos', () => { close(); if (it.pos < S.pos.length) select(it.pos, { fly: true }); else toast('当前序列没有第 ' + pad2(it.pos + 1) + ' 位'); });
    on('gAtlas', () => { close(); Atlas.open(it.atlas); });
    on('gDl', () => download(it, main));
    on('gDlOrig', () => download(it, orig));
    on('gMain', async () => {
      try {
        if (isMain) await G.db.doc('hall/main').delete();
        else await G.db.doc('hall/main').set({ owner: it.owner, item: it.id, by: G.uid, at: new Date().toISOString() });
        toast(isMain ? '已取消默认序列' : SITE ? '已设为展厅的默认序列：所有人打开网站时都会先看到这一天' : '已设为公开展厅的默认序列（下次同步后生效）');
      } catch (e) { toast('没有保存：' + ((e && e.code) || e)); }
    });
    on('gEdit', () => Form.open(it));
    on('gPub', async () => { try { await G.db.doc(`works/${it.owner}/items/${it.id}`).update({ pub: !it.pub, updatedAt: new Date().toISOString() }); } catch (e) { toast('没有保存：' + ((e && e.code) || e)); } });
    on('gDel', (e) => {
      const b = e.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '确认删除？再点一次'; setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '删除'; } }, 4000); return; }
      removeItem(it);
    });
  }
  async function removeItem(it) {
    try {
      await G.db.doc(`works/${it.owner}/items/${it.id}`).delete();
      if (mainItem() === it) await G.db.doc('hall/main').delete().catch(() => {});
      if (G.assets) for (const f of it.files) if (f.aid) G.assets.delete(f.aid).catch(() => {});
      toast('已删除'); backToGrid();
    } catch (e) { toast('删除失败：' + ((e && e.code) || e)); }
  }

  function open(key) {
    el.hidden = false; G.isOpen = true;
    renderHead(); renderFilters();
    if (key && G.items.has(key)) showDetail(key); else backToGrid();
  }
  function close() { el.hidden = true; G.isOpen = false; viewer.stop(); cur = null; }
  $('#groupClose').onclick = close;
  $('#groupSearch').addEventListener('input', (e) => { query = e.target.value.trim(); renderGrid(); });
  $('#groupWho').addEventListener('change', (e) => { fWho = e.target.value; renderGrid(); });
  $('#gSpin').onclick = (e) => { const v = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(v)); viewer.setSpin(v); };
  $('#groupAdd').onclick = () => Form.open(null);
  $('#groupMe').onclick = () => openMe();

  /* ---------- member card ---------- */
  function openMe(then) {
    if (SITE) return openMeSite(then);
    const box = $('#gmeBox'), m = G.members[G.uid] || {};
    $('#gnick').value = m.nick || G.meName || ''; $('#grole').value = m.role || '';
    $('#gmeWho').textContent = G.isOwner ? '你是这个工作台的所有者：可以整理所有人的作品，并决定何时同步到公开展厅。' : '你是组员：可以添加、修改和删除自己的作品。';
    box.hidden = false; $('#gnick').focus();
    $('#gmeSave').onclick = async () => {
      const nick = $('#gnick').value.trim().slice(0, 30), role = $('#grole').value.trim().slice(0, 40);
      if (!nick) { $('#gmeStatus').textContent = '写一个署名，公开展厅会用它标注你的作品。'; return; }
      $('#gmeSave').disabled = true;
      try {
        await G.db.doc('members/' + G.uid).set({ nick, role, updatedAt: new Date().toISOString() });
        G.members[G.uid] = { nick, role }; box.hidden = true; $('#gmeStatus').textContent = ''; changed();
        if (then) then();
      } catch (e) { $('#gmeStatus').textContent = '没有保存（' + ((e && e.code) || e) + '）。如果你只有查看权限，请让所有者把你设为可编辑。'; }
      $('#gmeSave').disabled = false;
    };
    $('#gmeCancel').onclick = () => { box.hidden = true; };
  }


  function openMeSite(then) {
    const box = $('#gmeBox'), sel = $('#gmeSel');
    const ids = Object.keys(G.members).filter(k => k !== 'group').sort((a, b) => G.members[a].nick.localeCompare(G.members[b].nick));
    sel.hidden = false;
    sel.innerHTML = ids.map(k => `<option value="${esc(k)}" ${k === G.uid ? 'selected' : ''}>${esc(G.members[k].nick)}</option>`).join('') + '<option value="">＋ 我是新成员</option>';
    if (!G.uid) sel.value = ids.length ? ids[0] : '';
    const fill = () => { const m = G.members[sel.value] || {}; $('#gnick').value = m.nick || ''; $('#grole').value = m.role || ''; };
    sel.onchange = fill; fill();
    $('#gmeWho').textContent = '选择你是谁：之后你上传的作品都会标上这个署名（只保存在这台设备上，换设备时再选一次）。' + (SB.openCode ? '所有人都可以整理全部作品。' : '所有输入了编辑码的组员都可以整理全部作品。');
    box.hidden = false;
    $('#gmeSave').onclick = async () => {
      const nick = $('#gnick').value.trim().slice(0, 30), role = $('#grole').value.trim().slice(0, 40);
      if (!nick) { $('#gmeStatus').textContent = '写一个署名，作品会用它标注。'; return; }
      const id = sel.value || ('m' + rid());
      $('#gmeSave').disabled = true;
      try {
        await G.db.doc('members/' + id).set({ nick, role });
        Site.me = id; LS.set('venus.me', id); G.uid = id; G.members[id] = { nick, role }; subscribeWorks(id);
        box.hidden = true; $('#gmeStatus').textContent = ''; changed();
        if (then) then();
      } catch (e) { $('#gmeStatus').textContent = '没有保存：' + e.message; }
      $('#gmeSave').disabled = false;
    };
    $('#gmeCancel').onclick = () => { box.hidden = true; };
  }

  /* ---------- add / edit form ---------- */
  const Form = (() => {
    const box = $('#gform'), pv = makeViewer($('#gformCanvas'), true);
    let editing = null, file = null, kind = 'note', model = null, up = '+Y', yaw = 0, busy = false;
    function fillSelects() {
      $('#gfCat').innerHTML = Object.entries(CATS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
      $('#gfPos').innerHTML = '<option value="">不关联</option>' + Array.from({ length: Math.max(S.pos.length, 7) }, (_, i) => `<option value="${i}">第 ${pad2(i + 1)} 位${S.pos[i] ? ' · ' + esc(recTitle(REC[S.pos[i].work]).slice(0, 18)) : ''}</option>`).join('');
      $('#gfCls').innerHTML = CLS.map(c => `<option value="${c}">${CLASS[c].zh}</option>`).join('');
      $('#gfSnd').innerHTML = '<option value="">不用作展厅声音</option>' + CLS.map(c => `<option value="${c}">用作「${CLASS[c].zh}」类的声音</option>`).join('');
      $('#gfUp').innerHTML = Object.entries(UP_NAMES).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
    }
    function showFields() {
      $('#gfModel').hidden = kind !== 'model'; $('#gfSound').hidden = kind !== 'sound';
      $('#gfDayRow').hidden = kind !== 'day';
      $('#gdrop').hidden = !!editing || kind === 'day';
      $('#gfKind').textContent = KINDS[kind] + (file ? ' · ' + file.name + ' · ' + fmtSize(file.size) : '');
      const canFiles = !!G.assets;
      $('#gdrop').classList.toggle('off', !canFiles);
      $('#gdropTxt').textContent = canFiles ? '把文件拖到这里，或点击选择' : '上传文件需要编辑权限；你可以只写文字或链接';
    }
    function preview() {
      const media = $('#gprevMedia'), cv = $('#gformCanvas');
      cv.hidden = !(kind === 'model' && model); media.innerHTML = '';
      if (kind === 'model' && model) {
        pv.start();
        const { geo } = figureGeometry(model.pos, model.idx.slice(), orientR(up, yaw), $('#gfCls').value);
        pv.show(geo);
      } else {
        pv.stop();
        if (kind === 'image' && file) media.innerHTML = `<img alt="" src="${URL.createObjectURL(file)}">`;
        else if (kind === 'day') media.innerHTML = `<ol class="gseq">${S.day.map((a, i) => `<li><span class="n">${pad2(i + 1)}</span><span class="dot" style="background:${CLASS[a.cls].color}"></span><span>${esc(a.time ? a.time + ' ' : '')}${esc(a.label)}</span></li>`).join('') || '<li class="muted">展厅里还没有序列：先在“文字日记”里生成一串姿势。</li>'}</ol>`;
        else if (kind !== 'note') media.innerHTML = `<div class="gbig">${GLYPH[kind]}</div>`;
      }
    }
    async function pick(f) {
      if (busy) return;
      file = f; model = null; kind = kindOfFile(f);
      const st = $('#gfileStatus'); st.textContent = '';
      if (!$('#gfTitle').value.trim()) $('#gfTitle').value = f.name.replace(/\.[^.]+$/, '').slice(0, 80);
      $('#gfCat').value = KIND_CAT[kind] || 'other';
      const lim = SITE ? SITE_MAX : 20 * MB, limW = SITE ? SITE_MAX : WRAP_MAX;
      if (kind === 'video' && !(SITE ? /^(mp4|webm|mov|m4v)$/ : /^(mp4|webm)$/).test(extOf(f.name))) { st.textContent = '视频请先转成 MP4 或 WebM。'; file = null; kind = 'note'; }
      else if ((kind === 'video' || kind === 'pdf') && f.size > lim) { st.textContent = `文件超过 ${Math.round(lim / MB)} MB，请先压缩；或者把它放在网盘里，在这里填写链接。`; file = null; kind = 'note'; }
      else if ((kind === 'sound' || kind === 'file') && f.size > limW) { st.textContent = `文件超过 ${Math.round(limW / MB)} MB，请先压缩；或者把它放在网盘里，在这里填写链接。`; file = null; kind = 'note'; }
      else if (kind === 'model') {
        if (f.size > 400 * MB) { st.textContent = '模型太大（超过 400 MB）。'; file = null; kind = 'note'; }
        else {
          st.textContent = '正在读取并简化模型…'; busy = true;
          try {
            await sleep(30);
            model = await readModel(f);
            up = extOf(f.name) === 'stl' ? '+Z' : '+Y'; yaw = 0; $('#gfUp').value = up;
            st.textContent = `原模型 ${model.srcTris.toLocaleString()} 个三角面 → 展示用 ${(model.idx.length / 3).toLocaleString()} 个。用下面的按钮把雕像摆正，正面朝向你。`;
          } catch (e) { st.textContent = '模型无法读取：' + e.message; file = null; kind = 'note'; model = null; }
          busy = false;
        }
      }
      showFields(); preview();
    }
    function open(it, preset) {
      if (!canAdd()) { toast('你现在只能查看'); return; }
      const m = G.members[G.uid];
      if (!it && (!G.uid || !m || !m.nick)) { openMe(() => open(it, preset)); return; }
      editing = it; file = null; model = null; up = '+Y'; yaw = 0; busy = false;
      fillSelects();
      kind = it ? it.kind : (preset && preset.kind) || 'note';
      $('#gformTitle').textContent = it ? '编辑作品' : kind === 'day' ? '把这一天保存到工作台' : '添加作品';
      $('#gfTitle').value = it ? it.title : (preset && preset.title) || '';
      $('#gfNote').value = it ? it.note : '';
      $('#gfLink').value = it ? it.link : '';
      $('#gfCat').value = it ? it.cat : KIND_CAT[kind] || 'research';
      $('#gfPos').value = it && it.pos != null ? String(it.pos) : '';
      $('#gfAtlas').value = it && it.atlas ? it.atlas : '';
      $('#gfPub').checked = it ? it.pub : true;
      $('#gfCls').value = it && it.cls ? it.cls : 'standing';
      $('#gfSnd').value = it && it.kind === 'sound' && it.cls ? it.cls : '';
      $('#gfText').checked = false;
      $('#gfileStatus').textContent = ''; $('#gfStatus').textContent = '';
      $('#gfOrient').hidden = !!it;
      box.hidden = false; showFields(); preview();
      if (it && it.kind === 'model') { $('#gfileStatus').textContent = '姿势类别可以修改；朝向需要重新上传。'; meshOf('w-' + it.id).then(mm => { if (editing === it) { $('#gformCanvas').hidden = false; pv.start(); pv.show(mm.geo); } }).catch(() => {}); }
      setTimeout(() => $('#gfTitle').focus(), 30);
    }
    function closeForm() { if (busy) return; box.hidden = true; pv.stop(); file = null; model = null; editing = null; }
    async function save() {
      if (busy) return;
      const st = $('#gfStatus');
      const title = $('#gfTitle').value.trim().slice(0, 120), note = $('#gfNote').value.trim().slice(0, 4000);
      const link = $('#gfLink').value.trim();
      const posV = $('#gfPos').value, atlasV = $('#gfAtlas').value.trim().replace(/^#/, '');
      if (!title) { st.textContent = '写一个标题。'; return; }
      if (link && !/^https?:\/\/\S+$/i.test(link)) { st.textContent = '链接要以 http:// 或 https:// 开头。'; return; }
      if (atlasV && (!REC[atlasV] || REC[atlasV].member)) { st.textContent = '图谱里没有编号 #' + atlasV + '。'; return; }
      if (kind === 'day' && !S.day.length) { st.textContent = '展厅里还没有序列：先在“文字日记”里生成一串姿势。'; return; }
      if (!editing && kind === 'note' && link) kind = 'link';
      if (!editing && kind === 'note' && !note) { st.textContent = '写几句说明，或者选择一个文件 / 填一个链接。'; return; }
      const now = new Date().toISOString();
      const base = {
        title, note, link: link || '', cat: $('#gfCat').value, pos: posV === '' ? null : +posV, atlas: atlasV || null, pub: $('#gfPub').checked, updatedAt: now,
        cls: kind === 'model' ? $('#gfCls').value : kind === 'sound' ? ($('#gfSnd').value || null) : null,
      };
      busy = true; $('#gfSave').disabled = true;
      const made = [];
      try {
        if (editing) {
          await G.db.doc(`works/${editing.owner}/items/${editing.id}`).update(base);
          busy = false; closeForm(); toast('已保存'); return;
        }
        const files = [];
        const put = async (blob, role, name, type, extra) => { st.textContent = '正在上传' + ({ main: '', thumb: '缩略图', mesh: '模型', orig: '原始文件' }[role] || '') + '…'; const r = await upload(blob, type); made.push(r.id); files.push({ role, aid: r.id, ct: r.contentType, name: name || '', size: r.sizeBytes, ...(extra || {}) }); };
        if (file && kind === 'image') { st.textContent = '正在处理图片…'; const { main, thumb } = await imageRenditions(file); await put(main, 'main', file.name.replace(/\.[^.]+$/, '') + '.' + (main === file ? extOf(file.name) : 'webp'), main.type || 'image/webp'); await put(thumb, 'thumb', 'thumb.webp', thumb.type || 'image/webp'); }
        else if (file && kind === 'video') { await put(file, 'main', file.name, extOf(file.name) === 'webm' ? 'video/webm' : (SITE && extOf(file.name) === 'mov') ? 'video/quicktime' : 'video/mp4'); const th = await videoThumb(file); if (th) await put(th, 'thumb', 'thumb.webp', th.type || 'image/webp'); }
        else if (file && kind === 'pdf') await put(file, 'main', file.name, 'application/pdf');
        else if (file && (kind === 'sound' || kind === 'file')) { if (SITE) await put(file, 'main', file.name, file.type || 'application/octet-stream'); else { st.textContent = '正在打包文件…'; await put(await wrapFile(file), 'main', file.name, 'application/json', { w: 1 }); } }
        else if (file && kind === 'model') {
          const R = orientR(up, yaw);
          st.textContent = '正在生成缩略图…';
          const thumb = await pv.snapshot(360, 400);
          const json = JSON.stringify({ format: 'ggp1', vc: model.pos.length / 3, ic: model.idx.length, name: file.name, b64: bufToB64(encodeMesh(model.pos, model.idx)) });
          await put(new Blob([json], { type: 'application/json' }), 'mesh', 'mesh.json', 'application/json');
          if (thumb) await put(thumb, 'thumb', 'thumb.webp', thumb.type || 'image/webp');
          if (SITE) { if (file.size <= SITE_MAX) await put(file, 'orig', file.name, file.type || 'application/octet-stream'); }
          else if (file.size <= WRAP_MAX) await put(await wrapFile(file), 'orig', file.name, 'application/json', { w: 1 });
          else if (extOf(file.name) === 'obj' && file.size <= RAW_MAX) { try { await put(file, 'orig', file.name, 'text/plain'); } catch (e) { /* display mesh is enough */ } }
          base.rot = R;
        }
        const id = rid();
        const data = { ...base, kind, files, createdAt: now, by: G.uid };
        if (kind === 'day') data.day = dayFromHall($('#gfText').checked);
        st.textContent = '正在保存…';
        await G.db.doc(`works/${G.uid}/items/${id}`).set(data);
        busy = false; closeForm(); toast('已保存到小组工作台');
        if (G.isOpen) setTimeout(() => showDetail(G.uid + '/' + id), 400);
      } catch (e) {
        st.textContent = (e && e.message) || ('没有保存（' + ((e && e.code) || e) + '）');
        if (G.assets) for (const a of made) G.assets.delete(a).catch(() => {});
      } finally { busy = false; $('#gfSave').disabled = false; }
    }
    const inp = $('#gfile'), drop = $('#gdrop');
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f && G.assets) pick(f); });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && G.assets) pick(f); });
    drop.addEventListener('click', (e) => { if (!G.assets) e.preventDefault(); });
    $('#gfUp').onchange = (e) => { up = e.target.value; preview(); };
    $('#gfYaw').onclick = () => { yaw = (yaw + 1) % 4; preview(); };
    $('#gfCls').onchange = () => preview();
    $('#gfSave').onclick = save;
    $('#gfCancel').onclick = closeForm;
    return { open, close: closeForm };
  })();

  /* ---------- boot ---------- */
  function init() {
    if (SITE) {
      $('#saveDayBtn').onclick = () => Form.open(null, { kind: 'day', title: ((G.members[G.uid] && G.members[G.uid].nick) || '我') + ' 的一天' });
      $('#groupLogin').onclick = () => { if (Site.code) logout(); else openLogin(); };
      initSite().catch(e => { console.warn(e); G.status = 'error'; G.err = e.message; finishLoad(); changed(); });
    } else if (STUDIO) {
      $('#brandSub').textContent = '小组工作台 · Studio';
      $('#saveDayBtn').onclick = () => Form.open(null, { kind: 'day', title: ((G.members[G.uid] && G.members[G.uid].nick) || '我') + ' 的一天' });
      initStudio().catch(e => { console.warn(e); G.status = 'nodb'; finishLoad(); changed(); });
    } else initPublic();
    $('#groupBtn').onclick = () => open();
    const sl = $('#studioLink'); if (sl && LINKS.studio && !STUDIO) { sl.href = LINKS.studio; sl.hidden = false; }
  }
  async function bootMain(ms) {
    await Promise.race([loaded, sleep(ms)]);
    const m = mainItem();
    if (!m) bootFallback = true;
    return m;
  }
  return {
    init, open, close, bootMain, applyItemDay, fetchMemberMesh, thumbFor, countAt, linkedTo, creditOf, thumbOf, loadSounds,
    openItem: (it) => open(it.key), closeModals() { $('#gmeBox').hidden = true; $('#gloginBox').hidden = true; Form.close(); },
    get isOpen() { return G.isOpen; }, get formOpen() { return !$('#gform').hidden || !$('#gmeBox').hidden || !$('#gloginBox').hidden; },
    KINDS, CATS, G,
  };
})();
