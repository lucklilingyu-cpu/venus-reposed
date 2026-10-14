
/* ---------------------------------------------------------------
   Inputs: text journal, camera, video / photos
---------------------------------------------------------------- */
const claudeUse = (name) => (window.claude && typeof window.claude.use === 'function') ? Promise.resolve(window.claude.use(name)).catch(() => null) : Promise.resolve(null);
let claudeDenied = false;

/* ---------- keyword rules ---------- */
const KW = [
  ['reclining', ['刷手机', '沙发', '靠着', '靠在', '斜躺', '半躺', '追剧', '看电视', '躺着看', '躺着刷', '躺椅', 'sofa', 'couch', 'lounge', 'reclin', 'scroll']],
  ['horizontal', ['睡', '醒', '赖床', '躺', '午觉', 'bed', 'sleep', 'nap', 'woke', 'wake', 'lying down', 'lie down']],
  ['crouching', ['蹲', '肚子疼', '系鞋带', '捡', '擦地', '拔草', '种花', '抱膝', 'crouch', 'squat', 'tie my shoe', 'tied my shoe', 'pick up', 'picked up', 'stomach']],
  ['seated', ['坐', '地铁', '公交', '巴士', '吃', '饭', '画图', '画画', '上课', '开会', '读书', '看书', '写', '电脑', '打字', '建模', '学习', '咖啡', 'tube', 'bus', 'train', 'sit', 'sat ', 'lunch', 'dinner', 'breakfast', 'eat', 'class', 'meeting', 'study', 'sketch', 'draw', 'desk', 'café', 'cafe', 'coffee']],
  ['walking', ['走', '散步', '跑', '逛', '通勤', '回家', '出门', '赶路', '爬楼', 'walk', 'run', 'stroll', 'commute', 'hike']],
  ['standing', ['站', '刷牙', '排队', '做饭', '洗', '等', '商店', '买', '购物', '工作', '淋浴', '洗澡', 'shower', 'queue', 'cook', 'shop', 'stand', 'work', 'brush', 'wash']],
];
const GKW = {
  hair: ['洗头', '吹头', '梳头', '扎头发', '头发', 'hair'],
  oneleg: ['穿鞋', '脱鞋', '穿袜', '脱袜', '单腿', 'put on my shoe', 'one leg'],
  cover: ['冷', '抱臂', '害羞', '裹着', '抱着自己', 'cold', 'shy', 'arms crossed'],
  lookback: ['照镜子', '回头', '回眸', '背影', 'mirror', 'look back', 'looked back'],
};
const kwHit = (txt, kw) => /^[\x00-\x7f]+$/.test(kw) ? new RegExp('\\b' + kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(txt) : txt.includes(kw);
const ZH_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const PERIODS = [['清晨', 6], ['早上', 7], ['早晨', 7], ['上午', 10], ['中午', 12], ['午饭', 12], ['下午', 15], ['傍晚', 18], ['晚上', 20], ['晚饭', 19], ['睡前', 23], ['深夜', 24], ['morning', 9], ['noon', 12], ['lunch', 12.5], ['afternoon', 15], ['evening', 19], ['night', 22]];
function parseTime(s) {
  let m = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(am|pm)?/i);
  let h = null;
  if (m) { h = +m[1] + (+m[2]) / 60; if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12; }
  if (h == null && (m = s.match(/\b(\d{1,2})\s*(am|pm)\b/i))) { h = +m[1]; if (/pm/i.test(m[2]) && h < 12) h += 12; if (/am/i.test(m[2]) && h === 12) h = 0; }
  if (h == null && (m = s.match(/(十[一二]?|[零一二两三四五六七八九十]|\d{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?/))) {
    h = ZH_NUM[m[1]] != null ? ZH_NUM[m[1]] : +m[1];
    if (m[2] === '半') h += 0.5; else if (m[3]) h += +m[3] / 60;
    if (/下午|傍晚|晚上|晚/.test(s) && h < 12) h += 12;
  }
  let approx = false;
  if (h == null) { for (const [w, v] of PERIODS) if (s.toLowerCase().includes(w)) { h = v; approx = true; break; } }
  return h == null ? null : { h, approx };
}
const fmtTime = (h) => `${pad2(Math.floor(h) % 24)}:${pad2(Math.round((h % 1) * 60) % 60)}`;
function classifyText(s) {
  for (const [cls, list] of KW) if (list.some(k => kwHit(s, k))) return cls;
  return 'standing';
}
function gestureText(s, cls) {
  for (const [g, list] of Object.entries(GKW)) if (list.some(k => kwHit(s, k)) && GESTURES[g].cls.includes(cls)) return g;
  return null;
}
function cleanLabel(s) {
  return s.replace(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(am|pm)?/ig, '').replace(/\b\d{1,2}\s*(am|pm)\b/ig, '')
    .replace(/(下午|上午|晚上|傍晚|早上)?(十[一二]?|[零一二两三四五六七八九十]|\d{1,2})\s*点\s*(半|\d{1,2}\s*分?)?/g, (m0, p) => p || '')
    .replace(/^[\s,，、.。]+|[\s,，、.。]+$/g, '').replace(/\s+/g, ' ').slice(0, 18) || '（无描述）';
}
function parseRules(text) {
  const parts = text.split(/[，。；;！!？?\n、]|,\s*|\.\s+|\.$|\bthen\b|然后|之后/i).map(s => s && s.trim()).filter(Boolean);
  const items = parts.map(s => {
    const cls = classifyText(s);
    const t = parseTime(s);
    return { cls, g: gestureText(s, cls), label: cleanLabel(s), t: t ? t.h : null, raw: s };
  });
  // durations from consecutive times where possible
  items.forEach((it, i) => {
    let next = null;
    for (let j = i + 1; j < items.length; j++) if (items[j].t != null) { next = items[j].t; break; }
    let hrs;
    if (it.t != null && next != null) { const gap = next - it.t; hrs = gap > 0 ? gap / Math.max(1, items.slice(i + 1).findIndex(x => x.t != null) + 1) : null; }
    if (!hrs) hrs = CLASS[it.cls].dur;
    if (it.cls === 'horizontal' && /睡觉|sleep|晚上睡|入睡/.test(it.raw) && i === items.length - 1) hrs = 8;
    if (it.cls === 'seated' && /上课|画图|工作|class|study|sketch|draw/i.test(it.raw)) hrs = Math.max(hrs, 2.5);
    const CAP = { standing: 4, walking: 1.5, seated: 6, crouching: 0.5, reclining: 3, horizontal: 9 };
    it.hours = Math.round(THREE.MathUtils.clamp(hrs, 0.2, CAP[it.cls]) * 10) / 10;
  });
  return items.map(it => ({ cls: it.cls, g: it.g, label: it.label, time: it.t != null ? fmtTime(it.t) : null, hours: it.hours }));
}
function mergeDay(day) {
  const out = [];
  for (const d of day) {
    const last = out[out.length - 1];
    if (last && last.cls === d.cls && (last.g || null) === (d.g || null)) {
      last.label = (last.label + ' · ' + d.label).slice(0, 40); last.time = last.time || d.time; last.hours = Math.round((last.hours + d.hours) * 10) / 10;
    } else out.push({ ...d });
  }
  return out;
}
async function parseWithClaude(text) {
  if (claudeDenied) return null;
  const sample = await claudeUse('sample');
  if (!sample) return null;
  const prompt = `把下面这段“我的一天”拆成按时间顺序排列的活动，并给每个活动标注身体姿势类别。
姿势类别只能是：standing（站立）、walking（行走）、seated（坐）、crouching（蹲）、reclining（斜倚：身体靠着、半躺）、horizontal（水平：躺平、睡觉）。
可选的复杂姿势 gesture 只能是：hair（举手拧发，如洗头、吹头发）、oneleg（单腿平衡，如穿鞋、脱鞋）、cover（双臂遮挡，如冷、抱臂、害羞）、lookback（回眺，如照镜子看背后），没有就写 null。hair 只能配 standing 或 crouching，其余三种只能配 standing。
判断参考：睡觉、赖床 = horizontal；躺着或靠着刷手机、看电视 = reclining；吃饭、上课、画图、坐车 = seated；蹲、肚子疼、系鞋带 = crouching；走路、散步 = walking；站着做事、排队、刷牙、购物 = standing。
只输出一个 JSON 数组，不要其他文字。每一项：{"label": "活动描述（12 个字以内，沿用原文的用词和语言）", "time": "HH:MM 或 null", "hours": 估计持续的小时数, "cls": "类别", "gesture": null}
例：[{"label":"醒了赖床","time":"07:30","hours":0.5,"cls":"horizontal","gesture":null}]
最多 10 项。

日记：
${text.slice(0, 4000)}`;
  try {
    const arr = await sample.json(prompt, { modelTier: 'quick' });
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.slice(0, 10).map(o => {
      const cls = CLS.includes(o.cls) ? o.cls : 'standing';
      const g = o.gesture && GESTURES[o.gesture] && GESTURES[o.gesture].cls.includes(cls) ? o.gesture : null;
      const time = typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time) ? o.time.padStart(5, '0') : null;
      const hours = THREE.MathUtils.clamp(Number(o.hours) || CLASS[cls].dur, 0.1, 12);
      return { cls, g, label: String(o.label || '').slice(0, 24) || CLASS[cls].zh, time, hours: Math.round(hours * 10) / 10 };
    });
  } catch (e) {
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(e && e.code)) claudeDenied = true;
    return { error: e && e.code };
  }
}
async function runText() {
  const text = $('#journal').value.trim();
  const st = $('#textStatus');
  if (!text) { st.textContent = '先写几句你的一天。'; return; }
  const btn = $('#parseBtn'); btn.disabled = true;
  st.innerHTML = '<b>正在拆分活动…</b>';
  let day = null, source = '';
  const r = await parseWithClaude(text);
  if (Array.isArray(r)) { day = r; source = '由 Claude 解析'; }
  else {
    day = parseRules(text); source = '由关键词规则解析';
    if (r && r.error === 'rate_limited') st.textContent = 'Claude 暂时太忙，先用关键词规则。';
  }
  if (S.merge) day = mergeDay(day);
  day = day.slice(0, 10);
  btn.disabled = false;
  st.innerHTML = `${source}：<b>${day.map(d => CLASS[d.cls].zh).join(' → ')}</b>`;
  S.posPal = {};
  S.sel = 0;
  await applyDay(day, { source, fresh: true });
  flyHome();
}

/* ---------- pose classification from 13 joints (metres, y up) ---------- */
const sig = (x) => 1 / (1 + Math.exp(-x));
const bump = (x, a, b, s) => sig((x - a) / s) * sig((b - x) / s);
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len3 = (a) => Math.hypot(a.x, a.y, a.z);
const mid3 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: Math.min(a.v ?? 1, b.v ?? 1) });
function angAt(a, b, c) { const u = sub3(a, b), w = sub3(c, b); const d = (u.x * w.x + u.y * w.y + u.z * w.z) / ((len3(u) * len3(w)) || 1); return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI; }
function classifyPose(K, hist) {
  const vis = (p) => (p.v ?? 1) > 0.5;
  const sh = mid3(K.lsh, K.rsh), hp = mid3(K.lhip, K.rhip);
  const tv = sub3(sh, hp);
  const torso = Math.acos(Math.max(-1, Math.min(1, tv.y / (len3(tv) || 1)))) * 180 / Math.PI;
  const legsVis = vis(K.lkn) && vis(K.rkn) && (vis(K.lank) || vis(K.rank));
  const kL = angAt(K.lhip, K.lkn, K.lank), kR = angAt(K.rhip, K.rkn, K.rank);
  const kMean = (kL + kR) / 2, kMin = Math.min(kL, kR);
  const ankLow = Math.min(K.lank.y, K.rank.y);
  const ratio = (hp.y - ankLow) / Math.max(0.05, sh.y - ankLow);
  let walk = 0;
  if (hist && hist.length > 6) {
    let flips = 0, amp = 0, prev = 0;
    for (const d of hist) { const s = Math.abs(d) > 0.06 ? Math.sign(d) : 0; if (s && prev && s !== prev) flips++; if (s) prev = s; amp = Math.max(amp, Math.abs(d)); }
    walk = Math.min(1, flips / 2) * sig((amp - 0.12) / 0.03);
  }
  const P = {};
  const upright = sig((32 - torso) / 6);
  P.horizontal = sig((torso - 64) / 6);
  P.reclining = bump(torso, 26, 64, 5) * (legsVis ? sig((kMean - 100) / 12) * (sig((0.5 - ratio) / 0.12) * 0.6 + 0.4) : 1);
  if (!legsVis) {
    P.seated = upright * 0.8; P.standing = upright * 0.15; P.walking = 0; P.crouching = 0;
  } else {
    P.standing = upright * sig((kMean - 150) / 8) * (1 - walk);
    P.walking = upright * sig((kMean - 128) / 10) * walk;
    P.seated = upright * bump(kMean, 62, 138, 9) * sig((ratio - 0.22) / 0.06) * sig((kMin - 58) / 8);
    P.crouching = sig((52 - torso) / 8) * sig((80 - kMin) / 9) * sig((0.45 - ratio) / 0.07);
  }
  // one leg straight, the other foot lifted: still standing (sandal-binder balance)
  if (legsVis && Math.max(kL, kR) > 155 && Math.abs(K.lank.y - K.rank.y) > 0.2 && torso < 40) { P.standing = Math.max(P.standing, 0.9 * sig((40 - torso) / 6)); P.seated *= 0.15; P.crouching *= 0.15; }
  let sum = 0; for (const c of CLS) { P[c] = (P[c] || 0) + 0.004; sum += P[c]; }
  for (const c of CLS) P[c] /= sum;
  const top = CLS.reduce((a, b) => P[a] >= P[b] ? a : b);
  // gestures
  let g = null;
  const nose = K.nose, shW = len3(sub3(K.lsh, K.rsh)) || 0.3;
  if (K.lwr.y > nose.y - 0.05 && K.rwr.y > nose.y - 0.05) g = 'hair';
  else if (legsVis && Math.abs(K.lank.y - K.rank.y) > 0.22) g = 'oneleg';
  else {
    const chest = { x: sh.x, y: sh.y - 0.15, z: sh.z };
    const nearC = (w) => len3(sub3(w, chest)) < shW * 0.75, nearH = (w) => len3(sub3(w, hp)) < shW * 0.75;
    if ((nearC(K.lwr) && nearH(K.rwr)) || (nearC(K.rwr) && nearH(K.lwr)) || (nearC(K.lwr) && nearC(K.rwr))) g = 'cover';
    else if (Math.abs(nose.x - sh.x) > shW * 0.55 && torso < 35) g = 'lookback';
  }
  if (g && !GESTURES[g].cls.includes(top)) g = null;
  return { P, top, g, torso, kMean, ratio };
}
/* canonical skeleton -> the 13 joints the classifier reads */
function poseToK(pose, jitter = 0) {
  const J = pose.joints;
  const j = (p, dx = 0, dy = 0, dz = 0) => ({ x: p.x + dx + (Math.random() - 0.5) * jitter, y: p.y + dy + (Math.random() - 0.5) * jitter, z: p.z + dz + (Math.random() - 0.5) * jitter, v: 1 });
  return { nose: j(J.head, 0, -0.02, 0.09), lsh: j(J.shL), rsh: j(J.shR), lel: j(J.elbowL), rel: j(J.elbowR), lwr: j(J.wristL), rwr: j(J.wristR), lhip: j(J.hipL), rhip: j(J.hipR), lkn: j(J.kneeL), rkn: j(J.kneeR), lank: j(J.ankleL), rank: j(J.ankleR) };
}
const K_EDGES = [['lsh', 'rsh'], ['lsh', 'lel'], ['lel', 'lwr'], ['rsh', 'rel'], ['rel', 'rwr'], ['lsh', 'lhip'], ['rsh', 'rhip'], ['lhip', 'rhip'], ['lhip', 'lkn'], ['lkn', 'lank'], ['rhip', 'rkn'], ['rkn', 'rank']];
function drawStick(ctx, pts2, w, h, color = '#f0b84c') {
  ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, w * 0.012); ctx.strokeStyle = color;
  ctx.beginPath();
  for (const [a, b] of K_EDGES) { if (!pts2[a] || !pts2[b]) continue; ctx.moveTo(pts2[a][0] * w, pts2[a][1] * h); ctx.lineTo(pts2[b][0] * w, pts2[b][1] * h); }
  ctx.stroke();
  ctx.fillStyle = color;
  for (const k in pts2) { const p = pts2[k]; if (!p) continue; ctx.beginPath(); ctx.arc(p[0] * w, p[1] * h, k === 'nose' ? w * 0.025 : w * 0.01, 0, 7); ctx.fill(); }
}

/* ---------- MediaPipe (local version / any page allowed to load it) ---------- */
const MP_VER = '0.10.14';
let mp = null, mpLoading = null, mpTs = 0;
function withTimeout(p, ms, msg) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'timeout')), ms))]); }
async function loadMP() {
  if (mp) return mp;
  if (!mpLoading) mpLoading = (async () => {
    const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}`;
    const mod = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
    const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
    const lm = await mod.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'GPU' },
      runningMode: 'VIDEO', numPoses: 1,
    });
    mp = { mod, lm }; return mp;
  })();
  try { return await withTimeout(mpLoading, 25000, '姿势模型加载超时'); } catch (e) { mpLoading = null; throw e; }
}
const MPI = { nose: 0, lsh: 11, rsh: 12, lel: 13, rel: 14, lwr: 15, rwr: 16, lhip: 23, rhip: 24, lkn: 25, rkn: 26, lank: 27, rank: 28 };
function mpDetect(source) {
  mpTs = Math.max(mpTs + 1, performance.now());
  const r = mp.lm.detectForVideo(source, mpTs);
  if (!r || !r.landmarks || !r.landmarks[0]) return null;
  const L = r.landmarks[0], W = (r.worldLandmarks && r.worldLandmarks[0]) || L;
  const K = {}, P2 = {};
  for (const [k, i] of Object.entries(MPI)) {
    K[k] = { x: W[i].x, y: -W[i].y, z: -W[i].z, v: L[i].visibility ?? 1 };
    P2[k] = (L[i].visibility ?? 1) > 0.4 ? [L[i].x, L[i].y] : null;
  }
  return { K, P2 };
}

/* ---------- camera mode ---------- */
const Cam = { stream: null, raf: 0, demo: false, hist: [], holdCls: null, holdT0: 0, lastAdded: null, last: null, demoT0: 0 };
function camStatus(t) { $('#camStatus').innerHTML = t; }
function startSession() {
  if (S.source !== '摄像头') { S.posPal = {}; applyDay([], { source: '摄像头', fresh: true }); }
  Cam.hist = []; Cam.holdCls = null; Cam.lastAdded = null;
}
async function startCamera() {
  stopCamera();
  const msg = $('#camMsg');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg.textContent = '这个浏览器不能使用摄像头。'; camStatus('请用最新版 Chrome、Edge 或 Safari 通过 https 网址打开；也可以先点“模拟演示”，或在“视频 / 照片”里上传手机拍的片段。');
    return;
  }
  try {
    Cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  } catch (e) {
    msg.textContent = '摄像头没有打开';
    camStatus('浏览器没有允许使用摄像头：点地址栏左侧的图标，把摄像头改为“允许”后再试；或者先用“模拟演示”和“视频 / 照片”。');
    return;
  }
  const video = $('#camVideo'); video.srcObject = Cam.stream; await video.play().catch(() => {});
  msg.textContent = ''; camStatus('<b>正在加载姿势模型（MediaPipe）…</b>');
  try { await loadMP(); } catch (e) { camStatus('姿势模型没有加载成功（需要联网）。可以先用“模拟演示”。'); return; }
  camStatus('站进画面，让全身入镜；坐在电脑前时只拍到上半身也可以。保持一个姿势 2 秒就会加入序列。');
  startSession(); Cam.demo = false; $('#camAdd').disabled = false;
  $('#camStart').textContent = '关闭摄像头';
  const loop = () => {
    Cam.raf = requestAnimationFrame(loop);
    if (video.readyState < 2) return;
    let res = null; try { res = mpDetect(video); } catch (e) { return; }
    camFrame(res ? res.K : null, res ? res.P2 : null, true);
  };
  loop();
}
function stopCamera() {
  cancelAnimationFrame(Cam.raf); Cam.raf = 0;
  if (Cam.stream) { Cam.stream.getTracks().forEach(t => t.stop()); Cam.stream = null; }
  Cam.demo = false;
  $('#camStart').textContent = '打开摄像头';
  $('#camDemo').textContent = '模拟演示';
  const c = $('#camCanvas'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
  $('#holdBar').style.width = '0';
}
function startDemo() {
  stopCamera();
  Cam.demo = true; Cam.demoT0 = performance.now(); startSession();
  $('#camMsg').textContent = ''; $('#camDemo').textContent = '停止演示'; $('#camAdd').disabled = false;
  camStatus('模拟一位观众依次做出六类姿势，展示识别、百分比和“保持 2 秒加入序列”。');
  const order = ['horizontal', 'standing', 'walking', 'seated', 'crouching', 'reclining'];
  const poses = {}; order.forEach(c => poses[c] = buildPose(CANON[c]));
  const loop = () => {
    if (!Cam.demo) return;
    Cam.raf = requestAnimationFrame(loop);
    const t = (performance.now() - Cam.demoT0) / 1000;
    const k = Math.floor(t / 3.4);
    if (k >= order.length) { camStatus('演示结束：镜头前的六个姿势已经排进序列。'); Cam.demo = false; $('#camDemo').textContent = '模拟演示'; return; }
    const cls = order[k];
    const K = poseToK(poses[cls], 0.015);
    if (cls === 'walking') {
      const ph = Math.sin(t * 6), cz = (K.lank.z + K.rank.z) / 2, kz = (K.lkn.z + K.rkn.z) / 2;
      K.lank.z = cz + 0.24 * ph; K.rank.z = cz - 0.24 * ph; K.lkn.z = kz + 0.12 * ph; K.rkn.z = kz - 0.12 * ph;
    }
    // 2D projection for the stick figure
    const b = poses[cls].bounds, span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y) * 1.25;
    const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2;
    const P2 = {}; for (const key in K) P2[key] = [0.5 + (K[key].x - cx) / span * 0.75, 0.5 - (K[key].y - cy) / span];
    camFrame(K, P2, false);
  };
  loop();
}
function camFrame(K, P2, mirror) {
  const c = $('#camCanvas'), box = c.getBoundingClientRect();
  if (c.width !== Math.round(box.width * 2)) { c.width = Math.round(box.width * 2); c.height = Math.round(box.height * 2); }
  const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
  if (Cam.demo) { ctx.fillStyle = '#2c2226'; ctx.fillRect(0, 0, c.width, c.height); }
  if (!K) { renderBars(null); $('#holdBar').style.width = '0'; Cam.holdCls = null; return; }
  if (P2 && mirror) for (const k in P2) if (P2[k]) P2[k] = [1 - P2[k][0], P2[k][1]];
  drawStick(ctx, P2, c.width, c.height);
  const d = sub3(K.lank, K.rank), ha = sub3(K.lhip, K.rhip);
  const fl = Math.hypot(ha.z, ha.x) || 1;
  Cam.hist.push((d.x * ha.z - d.z * ha.x) / fl); if (Cam.hist.length > 90) Cam.hist.shift();
  const r = classifyPose(K, Cam.hist);
  Cam.last = r;
  renderBars(r.P);
  ctx.fillStyle = 'rgba(251,247,245,.92)'; ctx.font = `${Math.round(c.width * 0.045)}px "Noto Sans SC", sans-serif`;
  ctx.fillText(`${CLASS[r.top].zh} ${Math.round(r.P[r.top] * 100)}%${r.g ? ' · ' + GESTURES[r.g].zh : ''}`, c.width * 0.04, c.height * 0.09);
  // hold to confirm
  const now = performance.now();
  if (r.P[r.top] > 0.5 && r.top === Cam.holdCls) {
    const p = Math.min(1, (now - Cam.holdT0) / 2000);
    $('#holdBar').style.width = (p * 100) + '%';
    if (p >= 1 && Cam.lastAdded !== r.top) { addCamPose(r); Cam.lastAdded = r.top; }
  } else { Cam.holdCls = r.top; Cam.holdT0 = now; $('#holdBar').style.width = '0'; }
}
function addCamPose(r) {
  if (S.day.length >= 10) { toast('序列已有 10 个位置'); return; }
  const d = new Date();
  const entry = { cls: r.top, g: r.g, label: '镜头前 · ' + CLASS[r.top].zh + (r.g ? '（' + GESTURES[r.g].zh + '）' : ''), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, hours: CLASS[r.top].dur };
  const day = S.day.concat([entry]);
  S.sel = day.length - 1;
  applyDay(day, { source: '摄像头' });
  toast(`加入序列：${pad2(day.length)} ${CLASS[r.top].zh}`);
}

/* ---------- video / photos ---------- */
const Vid = { frames: [], busy: false };
let poseGalleryItems = null;
async function loadPoseGallery() {
  if (poseGalleryItems) return poseGalleryItems;
  const box = $('#poseGallery'), status = $('#poseGalleryStatus');
  try {
    const response = await fetch('data/pose-gallery.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    poseGalleryItems = Array.isArray(json.images) ? json.images : [];
    box.innerHTML = poseGalleryItems.map(item => `<button class="pose-gallery-item" type="button" data-pose-gallery="${esc(item.id)}" aria-pressed="false" aria-label="识别 ${esc(item.title)}"><img src="${esc(item.file)}" alt="" loading="lazy" decoding="async"><span>${esc(item.title)}</span></button>`).join('');
    $('#poseGalleryCount').textContent = `${poseGalleryItems.length} 张`;
    status.textContent = poseGalleryItems.length ? '选一张图片识别骨架。' : '图集中没有图片。';
    return poseGalleryItems;
  } catch (e) {
    status.textContent = '图片图集暂时无法载入。';
    return [];
  }
}
async function analyzeGalleryImage(id, button) {
  if (Vid.busy) return;
  Vid.busy = true;
  const status = $('#poseGalleryStatus'), box = $('#frames');
  $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
  status.textContent = '正在加载姿势模型并识别骨架…';
  try {
    const item = (await loadPoseGallery()).find(x => x.id === id);
    if (!item) throw new Error('找不到图片');
    await loadMP();
    const img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.file; });
    const fr = frameFrom(img, img.naturalWidth, img.naturalHeight, 0, null);
    const found = mpDetect(fr.canvas);
    box.replaceChildren();
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption');
    cap.textContent = item.title;
    if (found) {
      const palette = paletteFromCanvases([fr.canvas], 5);
      drawStick(fr.canvas.getContext('2d'), found.P2, fr.canvas.width, fr.canvas.height, '#f0b84c');
      fig.appendChild(fr.canvas); fig.appendChild(cap); box.appendChild(fig);
      const visible = Object.values(found.K).filter(p => (p.v ?? 0) > 0.5).length;
      const core = ['lsh', 'rsh', 'lhip', 'rhip', 'lkn', 'rkn', 'lank', 'rank'].filter(k => (found.K[k].v ?? 0) > 0.5).length;
      if (core < 8 && !(visible >= 8 && ['lsh', 'rsh', 'lhip', 'rhip'].filter(k => (found.K[k].v ?? 0) > 0.5).length >= 3 && ['lkn', 'rkn', 'lank', 'rank'].some(k => (found.K[k].v ?? 0) > 0.5))) {
        status.textContent = `检测到 ${visible}/13 个可见关节点，但肩、髋、膝和脚踝没有全部识别到；展厅暂未更新。请试试全身更清楚的图片。`;
        return;
      }
      const result = classifyPose(found.K, null);
      const label = `${item.title.slice(0, 28)} · ${CLASS[result.top].zh}`;
      S.posPal = { 0: palette }; S.sel = 0;
      await applyDay([{ cls: result.top, g: result.g, label, time: null, hours: CLASS[result.top].dur }], { source: '骨骼图集识别', fresh: true,
        onVisualComplete: (seq) => {
          const i = seq.findIndex(p => p.act && p.act.cls === result.top && (p.act.g || null) === (result.g || null));
          if (i < 0) return;
          Walk.exit();
          focusSculpture(i);
          status.textContent = `识别为「${CLASS[result.top].zh}」，展厅动画已完成，正在近景展示对应雕像。`;
        } });
      status.textContent = `识别为「${CLASS[result.top].zh}」，检测到 ${visible}/13 个可见关节点；展厅雕塑正在更新。`;
    } else {
      fig.appendChild(fr.canvas); fig.appendChild(cap); box.appendChild(fig);
      status.textContent = '没有找到可靠的身体骨架，展厅未更新。请试试主体更大、四肢更清楚的图片。';
    }
  } catch (e) {
    status.textContent = e && e.message === '姿势模型加载超时' ? '姿势模型加载超时；检查网络后再试。' : '识别没有完成；检查网络后再试。';
  } finally {
    Vid.busy = false;
    $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = false; });
    $('#videoGo').disabled = !Vid.frames.length;
  }
}
async function loadMedia(files) {
  Vid.frames = [];
  const box = $('#frames'); box.innerHTML = '';
  const st = $('#videoStatus');
  for (const f of files) {
    if (f.type.startsWith('image/')) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
      Vid.frames.push(frameFrom(img, img.naturalWidth, img.naturalHeight, Vid.frames.length, null));
    } else if (f.type.startsWith('video/')) {
      st.innerHTML = '<b>正在抽取关键帧…</b>';
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(f);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('视频无法读取')); });
      const dur = v.duration || 1, N = Math.min(12, Math.max(4, Math.round(dur / 2)));
      for (let k = 0; k < N; k++) {
        const t = dur * (0.04 + 0.92 * k / (N - 1));
        await new Promise(res => { v.onseeked = res; v.currentTime = t; });
        Vid.frames.push(frameFrom(v, v.videoWidth, v.videoHeight, Vid.frames.length, t));
      }
      Vid.duration = dur;
    }
    if (Vid.frames.length >= 12) break;
  }
  Vid.frames.forEach(fr => {
    const fig = document.createElement('figure'); fig.appendChild(fr.canvas);
    const cap = document.createElement('figcaption'); cap.textContent = fr.t != null ? `${fr.t.toFixed(1)}s` : `照片 ${fr.i + 1}`;
    fig.appendChild(cap); fr.cap = cap; box.appendChild(fig);
  });
  $('#videoGo').disabled = !Vid.frames.length;
  st.textContent = Vid.frames.length ? `已读入 ${Vid.frames.length} 帧。` : '没有读到可用的画面。';
}
function frameFrom(src, w, h, i, t) {
  const W = 480, H = Math.round(W * h / w) || 360;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(src, 0, 0, W, H);
  return { canvas: c, i, t };
}
async function analyzeMedia() {
  if (Vid.busy || !Vid.frames.length) return;
  Vid.busy = true; $('#videoGo').disabled = true;
  const st = $('#videoStatus');
  let results = null, engine = '';
  try {
    st.innerHTML = '<b>正在加载姿势模型…</b>';
    await withTimeout(loadMP(), 12000);
    results = Vid.frames.map(fr => { const r = mpDetect(fr.canvas); if (!r) return null; const c = classifyPose(r.K, null); return { cls: c.top, P: c.P, g: c.g, P2: r.P2 }; });
    engine = 'MediaPipe';
  } catch (e) { results = null; }
  if (!results) {
    const sample = await claudeUse('sample');
    const lim = sample ? await sample.limits().catch(() => null) : null;
    if (sample && lim && lim.images && !claudeDenied) {
      st.innerHTML = '<b>正在请 Claude 读取关键帧里的姿势…</b>';
      const blobs = await Promise.all(Vid.frames.slice(0, lim.images.maxCount || 10).map(fr => new Promise(res => fr.canvas.toBlob(res, 'image/jpeg', 0.82))));
      const prompt = `这 ${blobs.length} 张图片${Vid.frames[0].t != null ? '是同一段视频按时间顺序抽出的关键帧' : '是按顺序排列的照片'}。对每一张，判断画面中主要人物的身体姿势属于哪一类：standing（站立）、walking（行走，迈步中）、seated（坐）、crouching（蹲）、reclining（斜倚、半躺、靠着）、horizontal（躺平、睡）。再给出各类的可能性（加起来为 1），以及复杂姿势 gesture：hair（举手到头部）、oneleg（单腿站立）、cover（双臂遮挡身体）、lookback（回头看身后）或 null。只看身体姿势，不要识别或描述人物身份。
只输出 JSON：{"frames":[{"cls":"seated","p":{"standing":0.1,"walking":0,"seated":0.8,"crouching":0.1,"reclining":0,"horizontal":0},"gesture":null}]}，frames 的数量和顺序与图片一致；画面里没有人时 cls 写 null。`;
      try {
        const out = await sample.json(prompt, { images: blobs, modelTier: 'default' });
        const fr = out && Array.isArray(out.frames) ? out.frames : [];
        results = Vid.frames.map((_, k) => {
          const o = fr[k]; if (!o || !CLS.includes(o.cls)) return null;
          const P = {}; let s = 0; CLS.forEach(c => { P[c] = Math.max(0, Number(o.p && o.p[c]) || 0); s += P[c]; });
          if (!s) { CLS.forEach(c => P[c] = c === o.cls ? 1 : 0); s = 1; }
          CLS.forEach(c => P[c] /= s);
          const g = o.gesture && GESTURES[o.gesture] && GESTURES[o.gesture].cls.includes(o.cls) ? o.gesture : null;
          return { cls: o.cls, P, g };
        });
        engine = 'Claude';
      } catch (e) {
        if (['not_granted', 'sampling_disabled'].includes(e && e.code)) claudeDenied = true;
        st.textContent = e && e.code === 'not_granted' ? '没有获得使用 Claude 的许可，无法读取画面。可以下载本地版，用 MediaPipe 识别。' : 'Claude 没有读出画面里的姿势，请换一段更清楚的视频再试。';
        Vid.busy = false; $('#videoGo').disabled = false; return;
      }
    } else {
      st.textContent = '姿势模型没有加载成功（需要联网，首次加载约 10 MB）。请检查网络后再试。';
      Vid.busy = false; $('#videoGo').disabled = false; return;
    }
  }
  // captions + segments
  Vid.frames.forEach((fr, k) => {
    const r = results[k];
    fr.cap.textContent = (fr.t != null ? `${fr.t.toFixed(1)}s ` : '') + (r ? CLASS[r.cls].zh : '无人');
    if (r && r.P2) { const ctx = fr.canvas.getContext('2d'); drawStick(ctx, r.P2, fr.canvas.width, fr.canvas.height); }
  });
  const segs = [];
  results.forEach((r, k) => {
    if (!r) return;
    const last = segs[segs.length - 1];
    if (last && last.cls === r.cls && (last.g || null) === (r.g || null)) { last.frames.push(k); }
    else segs.push({ cls: r.cls, g: r.g, frames: [k] });
  });
  if (!segs.length) { st.textContent = '画面里没有找到人。'; Vid.busy = false; $('#videoGo').disabled = false; return; }
  const totalFrames = results.filter(Boolean).length;
  const isVideo = Vid.frames[0].t != null;
  const day = segs.slice(0, 10).map(sg => {
    const f0 = Vid.frames[sg.frames[0]], f1 = Vid.frames[sg.frames[sg.frames.length - 1]];
    const label = isVideo ? `视频 ${f0.t.toFixed(1)}–${f1.t.toFixed(1)}s` : `照片 ${sg.frames.map(k => k + 1).join('、')}`;
    return { cls: sg.cls, g: sg.g, label, time: null, hours: Math.round(sg.frames.length / totalFrames * 16 * 10) / 10 };
  });
  // colours of each segment go to its position's skin
  S.posPal = {};
  segs.slice(0, 10).forEach((sg, i) => { S.posPal[i] = paletteFromCanvases(sg.frames.map(k => Vid.frames[k].canvas), 5); });
  renderBars(null);
  st.innerHTML = `由 ${engine} 识别：<b>${day.map(d => CLASS[d.cls].zh).join(' → ')}</b>。视频时长按比例换算成一天的时长，每段的主色调已传给对应位置的表皮。`;
  S.sel = 0;
  await applyDay(day, { source: `由${engine}从${isVideo ? '视频' : '照片'}识别`, fresh: true });
  Vid.busy = false; $('#videoGo').disabled = false;
}

/* ---------- palettes from pictures (k-means) ---------- */
function paletteFromCanvases(canvases, k = 5) {
  const px = [];
  const t = document.createElement('canvas'); t.width = 64; t.height = 64; const g = t.getContext('2d', { willReadFrequently: true });
  for (const c of canvases) {
    g.clearRect(0, 0, 64, 64); g.drawImage(c, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    for (let i = 0; i < d.length; i += 4 * 3) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (!px.length) return DEFAULT_PALETTES.standing.slice();
  let C = [];
  for (let i = 0; i < k; i++) C.push(px[Math.floor((i + 0.5) / k * px.length)].slice());
  for (let it = 0; it < 12; it++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let bi = 0, bd = 1e9;
      C.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = j; } });
      const a = acc[bi]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++;
    }
    C = C.map((c, j) => acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c);
  }
  C.sort((a, b) => (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11) - (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11));
  return C.map(c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}

const GALLERY_ANNOTATION_KEY = 'venus.pose-gallery-annotations.v1';
const GALLERY_JOINTS = [
  ['nose', '头部中心'], ['lsh', '人物左肩'], ['rsh', '人物右肩'], ['lel', '人物左肘'], ['rel', '人物右肘'],
  ['lwr', '人物左手腕'], ['rwr', '人物右手腕'], ['lhip', '人物左髋'], ['rhip', '人物右髋'],
  ['lkn', '人物左膝'], ['rkn', '人物右膝'], ['lank', '人物左脚踝'], ['rank', '人物右脚踝'],
];
let gallerySelectedId = null, galleryEditPoints = {}, galleryEditSkipped = [], galleryAnnotations = {};
try { galleryAnnotations = JSON.parse(localStorage.getItem(GALLERY_ANNOTATION_KEY) || '{}') || {}; } catch (_) { galleryAnnotations = {}; }
function galleryAnnotationCount() {
  const count = Object.keys(galleryAnnotations).length, total = poseGalleryItems ? poseGalleryItems.length : 77;
  const el = $('#poseAnnotationCount'); if (el) el.textContent = count + ' / ' + total + ' 已校正';
}
function saveGalleryAnnotations() {
  try { localStorage.setItem(GALLERY_ANNOTATION_KEY, JSON.stringify(galleryAnnotations)); galleryAnnotationCount(); return true; }
  catch (_) { $('#poseAnnotatorStatus').textContent = '浏览器存储空间不足；请先导出标注文件。'; return false; }
}
function drawGalleryPoints(canvas, points) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, w * 0.004); ctx.strokeStyle = '#ffd34f'; ctx.fillStyle = '#ffd34f';
  for (const [a, b] of K_EDGES) if (points[a] && points[b]) { ctx.beginPath(); ctx.moveTo(points[a].x * w, points[a].y * h); ctx.lineTo(points[b].x * w, points[b].y * h); ctx.stroke(); }
  for (const [k, name] of GALLERY_JOINTS) { const p = points[k]; if (!p) continue; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, Math.max(5, w * 0.007), 0, Math.PI * 2); ctx.fill(); ctx.font = 'bold ' + Math.max(12, w * 0.014) + 'px sans-serif'; ctx.fillStyle = '#111'; ctx.fillText(name, p.x * w + 8, p.y * h - 7); ctx.fillStyle = '#ffd34f'; }
}
function setGalleryEditorPoint() {
  const canvas = $('#poseAnnotatorCanvas'), key = $('#poseJointSelect').value; drawGalleryPoints(canvas, galleryEditPoints);
  if (key) { const p = galleryEditPoints[key], label = GALLERY_JOINTS.find(j => j[0] === key)?.[1] || key; $('#poseAnnotatorStatus').textContent = p ? label + ' 已标记；点击图片可调整位置。' : galleryEditSkipped.includes(key) ? label + ' 已标记为遮挡。' : '请在图片上点击标记「' + label + '」，看不清时可标记为遮挡。'; }
}
function openGalleryAnnotator() {
  const item = poseGalleryItems?.find(x => x.id === gallerySelectedId); if (!item) return;
  const saved = galleryAnnotations[item.id]; galleryEditPoints = saved ? { ...(saved.points || {}) } : {}; galleryEditSkipped = saved ? [...(saved.skipped || [])] : [];
  const editor = $('#poseAnnotator'), img = $('#poseAnnotatorImage'), canvas = $('#poseAnnotatorCanvas');
  $('#poseAnnotatorTitle').textContent = '校正 ' + item.id + ' · ' + item.title;
  $('#poseClassSelect').value = saved?.cls || 'standing'; $('#poseGestureSelect').value = saved?.g || '';
  editor.hidden = false; $('#poseAnnotatorStatus').textContent = '正在载入原图…';
  img.onload = () => { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; setGalleryEditorPoint(); };
  img.onerror = () => { $('#poseAnnotatorStatus').textContent = '图片载入失败，请稍后再试。'; }; img.src = item.file;
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function updateHallFromGalleryAnnotation(item, annotation) {
  const cls = CLS.includes(annotation.cls) ? annotation.cls : 'standing';
  const validGesture = annotation.g && GESTURES[annotation.g]?.cls.includes(cls) ? annotation.g : null;
  S.posPal = {}; S.sel = 0;
  return applyDay([{ cls, g: validGesture, label: item.title.slice(0, 28) + ' · 校正' + CLASS[cls].zh, time: null, hours: CLASS[cls].dur }], { source: '骨骼图集人工校正', fresh: true });
}
function exportGalleryAnnotations() {
  const blob = new Blob([JSON.stringify({ version: 1, images: galleryAnnotations }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'pose-gallery-annotations.json'; a.click(); URL.revokeObjectURL(url);
}
async function importGalleryAnnotations(file) {
  try {
    const data = JSON.parse(await file.text()), images = data.images || data;
    if (!images || typeof images !== 'object' || Array.isArray(images)) throw new Error('format');
    for (const [id, item] of Object.entries(images)) {
      if (!/^\d{3}$/.test(id) || !item || !CLS.includes(item.cls)) continue;
      const points = {}; for (const [key] of GALLERY_JOINTS) { const p = item.points?.[key]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) points[key] = { x: THREE.MathUtils.clamp(p.x, 0, 1), y: THREE.MathUtils.clamp(p.y, 0, 1) }; }
      galleryAnnotations[id] = { cls: item.cls, g: item.g || null, points, skipped: Array.isArray(item.skipped) ? item.skipped : [] };
    }
    if (!saveGalleryAnnotations()) return; $('#poseGalleryStatus').textContent = '标注文件已导入到此浏览器。';
  } catch (_) { $('#poseGalleryStatus').textContent = '导入失败：请选择本图集导出的 JSON 标注文件。'; }
}



updateHallFromGalleryAnnotation = function (item, annotation) {
  const cls = CLS.includes(annotation.cls) ? annotation.cls : 'standing';
  const validGesture = annotation.g && GESTURES[annotation.g]?.cls.includes(cls) ? annotation.g : null;
  S.posPal = {}; S.sel = 0;
  return applyDay([{ cls, g: validGesture, label: item.title.slice(0, 28) + ' · 校正' + CLASS[cls].zh, time: null, hours: CLASS[cls].dur }], {
    source: '骨骼图集人工校正', fresh: true,
    onVisualComplete: (seq) => {
      const i = seq.findIndex(p => p.act && p.act.cls === cls && (p.act.g || null) === validGesture);
      if (i < 0) return;
      Walk.exit();
      focusSculpture(i);
      $('#poseGalleryStatus').textContent = `校正为「${CLASS[cls].zh}」，展厅动画已完成，正在近景展示对应雕像。`;
    },
  });
}
