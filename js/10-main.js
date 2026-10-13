
/* ---------------------------------------------------------------
   Wiring and the render loop
---------------------------------------------------------------- */
$$('#views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$$('#modeTabs button').forEach(b => b.addEventListener('click', () => {
  const m = b.dataset.mode;
  $$('#modeTabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  ['text', 'camera', 'video'].forEach(k => { $('#mode-' + k).hidden = k !== m; });
  if (m !== 'camera') { stopCamera(); renderBars(null); }
}));
$('#journal').value = SAMPLE_DAYS.group;
$('#parseBtn').addEventListener('click', runText);
$('#samples').addEventListener('change', (e) => { const k = e.target.value; if (k) { $('#journal').value = SAMPLE_DAYS[k]; e.target.value = ''; $('#textStatus').textContent = '示例已填入，点“生成姿势序列”。'; } });
$('#mergeChk').addEventListener('change', (e) => { S.merge = e.target.checked; });
$('#camStart').addEventListener('click', () => { if (Cam.stream) { stopCamera(); camStatus(''); } else startCamera(); });
$('#camDemo').addEventListener('click', () => { if (Cam.demo) { stopCamera(); camStatus('演示已停止。'); } else startDemo(); });
$('#camAdd').addEventListener('click', () => { if (Cam.last) addCamPose(Cam.last); });
const vf = $('#videoFile'), drop = $('#drop');
vf.addEventListener('change', () => { if (vf.files.length) loadMedia(Array.from(vf.files)).catch(e => { $('#videoStatus').textContent = '读取失败：' + e.message; }); });
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = Array.from(e.dataTransfer.files || []).filter(x => /^(image|video)\//.test(x.type)); if (f.length) loadMedia(f).catch(er => { $('#videoStatus').textContent = '读取失败：' + er.message; }); });
$('#videoGo').addEventListener('click', analyzeMedia);
$('#resetBtn').addEventListener('click', () => { S.posPal = {}; applyDay([], { source: '', fresh: true }); $('#textStatus').textContent = ''; });
$('#paletteFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !paletteTarget) return;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
  const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * img.naturalHeight / img.naturalWidth) || 128; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  S.palettes[paletteTarget] = paletteFromCanvases([c], 5);
  Object.keys(S.posPal).forEach(k => { if (S.pos[k] && clsOf(S.pos[k].work) === paletteTarget) delete S.posPal[k]; });
  refreshPalettes(paletteTarget); toast(`已从图片提取「${CLASS[paletteTarget].zh}」的色板`);
});
$('#soundFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !soundTarget) return;
  try { await Sound.enable(); await Sound.load(soundTarget, f); setSoundBtn(); Sound.play(soundTarget); toast(`「${CLASS[soundTarget].zh}」使用：${f.name}`); renderData(); }
  catch (er) { toast('这段音频无法解码，请换一个 mp3 / wav 文件'); }
});
function setSoundBtn() { $('#soundBtn').setAttribute('aria-pressed', String(Sound.on)); }
$('#soundBtn').addEventListener('click', async () => {
  if (Sound.on) { Sound.disable(); } else { await Sound.enable(); await Group.loadSounds(); const p = S.pos[S.sel]; if (p) Sound.play(clsOf(p.work)); }
  setSoundBtn(); renderData();
});
const menu = $('#moreMenu');
$('#moreBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#moreBtn').setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#moreMenu,#moreBtn')) { menu.hidden = true; $('#moreBtn').setAttribute('aria-expanded', 'false'); } });
$$('#moreMenu [data-skin]').forEach(b => b.addEventListener('click', () => {
  S.skinStyle = b.dataset.skin; menu.hidden = true;
  if (S.view === 'sculpture' || S.view === 'color') setView('skin');
  scheduleSkin(0); toast({ smooth: '表皮：光滑曲面', ribs: '表皮：肋片（等高线）', fold: '表皮：折叠面' }[S.skinStyle]);
}));
$('#cutBtn').addEventListener('click', () => { S.cut = !S.cut; applyView(); menu.hidden = true; toast(S.cut ? '剖开前侧，看见表皮里的姿势' : '完整包裹'); if (S.view === 'sculpture' || S.view === 'color') setView('both'); });
$('#bonesBtn').addEventListener('click', () => { S.bones = !S.bones; applyView(); menu.hidden = true; toast(S.bones ? '显示骨架火柴人' : '隐藏骨架'); });
const CAMS = {
  painting: [[0, 10.4, 2.2], [0, 12.1, -8.4]],
  portico: [[-8.5, 4.6, 4.2], [-23, 5.6, 0]],
  trajan: [[7.5, 3.2, 6.4], [19, 8.5, 0]],
};
$$('#moreMenu [data-cam]').forEach(b => b.addEventListener('click', () => {
  menu.hidden = true; const k = b.dataset.cam;
  if (k === 'home') flyHome(); else flyTo(new THREE.Vector3(...CAMS[k][0]), new THREE.Vector3(...CAMS[k][1]), 1.8);
}));
$('#exportZip').addEventListener('click', () => { menu.hidden = true; exportZip(); });
$('#copyPrompt').addEventListener('click', () => { menu.hidden = true; copyPrompt(); });
$('#aboutBtn').addEventListener('click', () => { $('#about').hidden = false; });
$('#atlasBtn').addEventListener('click', () => Atlas.open());
$('#bonesQuick').addEventListener('click', () => { S.bones = !S.bones; applyView(); });
$('#aboutClose').addEventListener('click', () => { $('#about').hidden = true; });
$('#about').addEventListener('click', (e) => { if (e.target.id === 'about') $('#about').hidden = true; });
$('#dataToggle').addEventListener('click', () => { const p = $('#dataPanel'); p.classList.toggle('open'); $('#dataToggle').setAttribute('aria-pressed', String(p.classList.contains('open'))); });
$$('#sheetTabs button').forEach(b => b.addEventListener('click', () => {
  $$('#sheetTabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  ['inputPanel', 'strip', 'dataPanel'].forEach(id => $('#' + id).classList.toggle('m-on', id === b.dataset.sheet));
}));
$('#strip').classList.add('m-on');
document.addEventListener('keydown', (e) => {
  if (e.target.closest('textarea,input,select')) return;
  if (e.key === 'Escape') { $('#about').hidden = true; menu.hidden = true; stopTour(); if (Group.formOpen) { Group.closeModals(); return; } if (Atlas.isOpen) Atlas.close(); if (Group.isOpen) Group.close(); }
  if (e.key === 'ArrowRight') select(Math.min(S.pos.length - 1, S.sel + 1), { fly: true });
  if (e.key === 'ArrowLeft') select(Math.max(0, S.sel - 1), { fly: true });
});

/* tour along the axis */
let tour = null;
function stopTour() { if (!tour) return; clearTimeout(tour.timer); tour = null; $('#tourbar').hidden = true; $('#tourBtn').setAttribute('aria-pressed', 'false'); flyHome(); }
function tourStep() {
  if (!tour) return;
  const i = tour.i;
  if (i >= S.pos.length) { stopTour(); return; }
  select(i, { fly: true });
  const p = S.pos[i], w = REC[p.work];
  $('#tourText').textContent = `${pad2(i + 1)} / ${pad2(S.pos.length)} · ${CLASS[w.cls].zh}${p.act ? ' · ' + p.act.label : ''} — ${recTitle(w)}`;
  tour.i++; tour.timer = setTimeout(tourStep, 4200);
}
$('#tourBtn').addEventListener('click', () => {
  if (tour) { stopTour(); return; }
  tour = { i: 0, timer: 0 }; $('#tourbar').hidden = false; $('#tourBtn').setAttribute('aria-pressed', 'true'); tourStep();
});
$('#tourStop').addEventListener('click', stopTour);

/* picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downXY = null;
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = []; V.forEach(vp => { if (vp.fig && vp.fig.visible) targets.push(vp.fig); if (vp.plinth.visible) targets.push(vp.drum); });
  if (skinMesh && skinMesh.visible) targets.push(skinMesh);
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return;
  let i = V.findIndex(vp => vp.fig === hit.object || vp.drum === hit.object);
  if (i < 0 && hit.object === skinMesh) { let best = 1e9; V.forEach((vp, k) => { const d = Math.abs(vp.x - hit.point.x); if (d < best) { best = d; i = k; } }); }
  if (i >= 0) select(i, { fly: false });
});

/* resize */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

/* loop */
const clock = new THREE.Clock();
const dust = hall.getObjectByName('dust');
const LIM = { x: [-22.8, 22.8], y: [0.4, 25], z: [-8.2, 8.2] };
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  runTweens(performance.now());
  controls.update();
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, LIM.x[0], LIM.x[1]);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, LIM.y[0], LIM.y[1]);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, LIM.z[0], LIM.z[1]);
  if (!reduceMotion) {
    floaters.forEach(f => { f.m.position.y = f.y0 + Math.sin(t * 0.5 + f.ph) * 0.25; });
    if (dust) dust.rotation.y = t * 0.01;
  }
  water.material.uniforms.time.value = t;
  updateShards(dt);
  // sound-reactive ring in the colour view
  const lvl = Sound.on ? Sound.level() : 0;
  V.forEach((vp, i) => {
    if (!vp.colorGroup.visible) return;
    const active = Sound.on && i === S.sel;
    const k = active ? 1 + lvl * 5 : 1 + Math.sin(t * 1.4 + i) * 0.04;
    vp.soundRing.scale.set(k, k, k); vp.soundRing.material.opacity = active ? 0.9 : 0.35;
  });
  const wave = document.getElementById('wave'); if (wave) Sound.drawWave(wave);
  if (Atlas.isOpen || Group.isOpen) return;
  updateLabels();
  composer.render();
}

/* boot */
(async function boot() {
  setLoading('正在载入图谱模型…');
  renderBars(null);
  frame();
  Group.init();
  const main = await Group.bootMain(STUDIO ? 3500 : 2500);
  try {
    if (main) await Group.applyItemDay(main, { animate: false, source: '小组默认序列 · ' });
    else {
      const day = mergeDay(parseRules(SAMPLE_DAYS.group));
      await applyDay(day, { animate: false, source: BOOT_SOURCE, fresh: true });
      $('#textStatus').innerHTML = `示例：<b>${day.map(d => CLASS[d.cls].zh).join(' → ')}</b>。改写日记后点“生成姿势序列”。`;
    }
  } catch (e) { console.error(e); toast('初始化出错：' + e.message, 6000); }
  renderGestures();
})();
/* DEBUG */
window.__vr = { classifyPose, poseToK, buildPose, CANON, parseRules, mergeDay, SRC: SDF_WORKER_SRC, composer, bloom, renderer, hall, THREE, V, S, scene, camera, controls, get skin() { return skinMesh; }, flyToPosition, setView, applyDay, Geo };
window.__vr.showWorks = async (ids) => {
  S.day = ids.map(id => ({ cls: REC[id].cls || 'standing', g: null, label: '#' + id, time: null, hours: 1 }));
  S.pos = ids.map((id, k) => ({ orig: null, act: S.day[k], work: id, status: 'keep' }));
  ensurePositions(ids.length, false);
  await Promise.all(S.pos.map(p => meshOf(p.work)));
  S.pos.forEach((p, i) => setFigure(i, p, false));
};
window.__vr.Atlas = Atlas; window.__vr.Group = Group; window.__vr.REC = REC; window.__vr.meshOf = meshOf; window.__vr.ceramic = ceramic;
