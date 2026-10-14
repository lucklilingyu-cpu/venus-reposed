
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
$('#poseGallery').addEventListener('click', (e) => { const b = e.target.closest('[data-pose-gallery]'); if (b) analyzeGalleryImage(b.dataset.poseGallery, b); });
loadPoseGallery();
$('#layoutSel').addEventListener('change', (e) => {
  S.layout = e.target.value; relayout();
  toast(S.layout === 's' ? '雕塑沿 S 形轨迹排在棋盘格上' : '雕塑沿第一个动作的骨架排在棋盘格上');
});
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
  menu.hidden = true; setRibbonStyle(b.dataset.skin);
  if (S.view === 'color') setView('both');
  toast('表皮：' + RIBBON_STYLES[S.skinStyle].zh);
}));
$('#ownBtn').addEventListener('click', () => { S.own = !S.own; applyView(); menu.hidden = true; toast(S.own ? '显示每件雕塑自己的姿态丝带' : '隐藏雕塑自己的丝带，只看序列丝带'); if (S.view === 'color') setView('sculpture'); });
$('#bonesBtn').addEventListener('click', () => { S.bones = !S.bones; applyView(); menu.hidden = true; toast(S.bones ? '显示骨架火柴人' : '隐藏骨架'); });
const CAMS = {
  vault: [[-8, 14.2, 5.4], [6, 15.2, -2.2]],
  portico: [[-10.5, 3.6, 5.2], [-24, 4.5, -0.6]],
  trajan: [[3.5, 6.2, 3.0], [19.6, 7.4, -0.5]],
  axis: [[-20.4, 3.4, 0.6], [8, 2.6, -0.4]],
};
$$('#moreMenu [data-cam]').forEach(b => b.addEventListener('click', () => {
  menu.hidden = true; const k = b.dataset.cam; Walk.exit();
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
  if (e.target.closest && e.target.closest('textarea,input,select')) return; // keys sent to the document itself have no closest()
  if (e.key === 'Escape') { clearSculptureFocus(); $('#about').hidden = true; menu.hidden = true; stopTour(); if (Group.formOpen) { Group.closeModals(); return; } if (Atlas.isOpen) Atlas.close(); if (Group.isOpen) Group.close(); }
  if (e.key === 'ArrowRight') select(Math.min(S.pos.length - 1, S.sel + 1), { fly: true });
  if (e.key === 'ArrowLeft') select(Math.max(0, S.sel - 1), { fly: true });
});

/* tour along the axis */
let tour = null;
function stopTour(opts = {}) { if (!tour) return; clearTimeout(tour.timer); tour = null; $('#tourbar').hidden = true; $('#tourBtn').setAttribute('aria-pressed', 'false'); if (!opts.stay) flyHome(); }
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
  Walk.exit();
  tour = { i: 0, timer: 0 }; $('#tourbar').hidden = false; $('#tourBtn').setAttribute('aria-pressed', 'true'); tourStep();
});
$('#tourStop').addEventListener('click', stopTour);

/* picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downXY = null, lastTouchPick = null;
canvas.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointercancel', () => { downXY = lastTouchPick = null; });
function pickSculpture(e) {
  if (Walk.active) { if (!Walk.locked) return -1; ndc.set(0, 0); } // walking: pick what the crosshair points at
  else { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  ray.setFromCamera(ndc, camera);
  const targets = []; V.forEach(vp => { if (vp.fig && vp.fig.visible) targets.push(vp.fig); if (vp.plinth.visible) targets.push(vp.drum); if (vp.rib && vp.rib.visible) targets.push(...vp.rib.children); });
  if (skinMesh && skinMesh.visible) targets.push(skinMesh);
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) return -1;
  let i = V.findIndex(vp => vp.fig === hit.object || vp.drum === hit.object || (vp.rib && hit.object.parent === vp.rib));
  if (i < 0 && hit.object === skinMesh) { let best = 1e9; V.forEach((vp, k) => { const d = Math.hypot(vp.x - hit.point.x, vp.z - hit.point.z); if (d < best) { best = d; i = k; } }); }
  return i;
}
canvas.addEventListener('pointerup', (e) => {
  const start = downXY; downXY = null;
  if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) { lastTouchPick = null; return; }
  const i = pickSculpture(e);
  if (i < 0) { lastTouchPick = null; clearSculptureFocus(); return; }
  select(i, { fly: false });
  if (e.pointerType === 'touch') {
    const now = performance.now();
    if (lastTouchPick && lastTouchPick.vp === V[i] && now - lastTouchPick.time < 350 && Math.hypot(e.clientX - lastTouchPick.x, e.clientY - lastTouchPick.y) < 24) {
      lastTouchPick = null; focusSculpture(i);
    } else lastTouchPick = { vp: V[i], time: now, x: e.clientX, y: e.clientY };
  }
});
canvas.addEventListener('dblclick', (e) => {
  e.preventDefault(); const i = pickSculpture(e);
  if (i >= 0) focusSculpture(i); else clearSculptureFocus();
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
NightLighting.init();
const dust = hall.getObjectByName('dust');
let shadowTick = 0; // the hall is static: shadows are redrawn while something moves, and twice a second otherwise
const LIM = { x: [-21.4, 22.6], y: [0.4, 21.5], z: [-7.1, 7.1] }; // stay inside the colonnade and under the vault
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), dt = Math.min(0.05, raw), t = clock.elapsedTime;
  runTweens(performance.now());
  NightLighting.update(dt);
  renderer.shadowMap.needsUpdate = tweens.length > 0 || shadowTick === 0;
  shadowTick = (shadowTick + 1) % 30;
  if (Walk.active) Walk.update(Math.min(0.1, raw)); // walking keeps its pace on slower devices
  else {
    controls.update();
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, LIM.x[0], LIM.x[1]);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, LIM.y[0], LIM.y[1]);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, LIM.z[0], LIM.z[1]);
  }
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
  setLoading(null);
  renderGestures();
})();
(() => {
  $('#poseAnnotateBtn').addEventListener('click', openGalleryAnnotator);
  $('#poseAnnotatorClose').addEventListener('click', () => { $('#poseAnnotator').hidden = true; });
  $('#poseJointSelect').addEventListener('change', setGalleryEditorPoint);
  $('#poseAnnotatorCanvas').addEventListener('click', (e) => {
    const canvas = e.currentTarget, rect = canvas.getBoundingClientRect(), key = $('#poseJointSelect').value;
    if (!key || !rect.width || !rect.height) return;
    galleryEditPoints[key] = { x: THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1), y: THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1) };
    galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseJointSkip').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; if (!key) return;
    delete galleryEditPoints[key]; if (!galleryEditSkipped.includes(key)) galleryEditSkipped.push(key); setGalleryEditorPoint();
  });
  $('#poseJointClear').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; delete galleryEditPoints[key]; galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseAnnotationSave').addEventListener('click', async () => {
    const item = poseGalleryItems?.find(x => x.id === gallerySelectedId); if (!item) return;
    const missing = GALLERY_JOINTS.find(([key]) => !galleryEditPoints[key] && !galleryEditSkipped.includes(key));
    if (missing) { $('#poseJointSelect').value = missing[0]; setGalleryEditorPoint(); $('#poseAnnotatorStatus').textContent = '请标记或明确跳过「' + missing[1] + '」，再保存。'; return; }
    const cls = $('#poseClassSelect').value, g = $('#poseGestureSelect').value || null;
    galleryAnnotations[item.id] = { cls, g, points: { ...galleryEditPoints }, skipped: [...galleryEditSkipped] };
    if (!saveGalleryAnnotations()) return;
    const preview = $('#frames canvas'); if (preview) drawGalleryPoints(preview, galleryEditPoints);
    await updateHallFromGalleryAnnotation(item, galleryAnnotations[item.id]);
    $('#poseAnnotatorStatus').textContent = '已保存 ' + item.id + ' 的 ' + CLASS[cls].zh + ' 姿势；展厅已按校正类别更新。';
    $('#poseGalleryStatus').textContent = item.title + '：已使用人工校正姿势更新展厅。';
  });
  $('#poseExportBtn').addEventListener('click', exportGalleryAnnotations);
  $('#poseImportFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importGalleryAnnotations(f); e.target.value = ''; });
  $('#poseGallery').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-pose-gallery]'); if (!button) return;
    const id = button.dataset.poseGallery; gallerySelectedId = id; $('#poseAnnotateBtn').disabled = false;
    const saved = galleryAnnotations[id]; if (!saved) return;
    e.stopImmediatePropagation(); if (Vid.busy) return; Vid.busy = true;
    const status = $('#poseGalleryStatus'), box = $('#frames');
    $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
    try {
      const item = poseGalleryItems.find(x => x.id === id), img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.file; });
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); drawGalleryPoints(canvas, saved.points || {});
      box.replaceChildren(); const fig = document.createElement('figure'), cap = document.createElement('figcaption'); cap.textContent = item.title; fig.append(canvas, cap); box.appendChild(fig);
      await updateHallFromGalleryAnnotation(item, saved); status.textContent = '已使用人工校正：' + CLASS[saved.cls].zh + '；展厅已更新。';
    } catch (_) { status.textContent = '图片载入失败，请稍后再试。'; }
    finally { Vid.busy = false; $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = false; }); }
  }, true);
  (function waitForPoseGallery() {
    if (poseGalleryItems) {
      galleryAnnotationCount(); const jointSelect = $('#poseJointSelect');
      if (!jointSelect.options.length) jointSelect.innerHTML = GALLERY_JOINTS.map(([key, name]) => '<option value="' + key + '">' + name + '</option>').join('');
      $('#poseAnnotateBtn').disabled = !poseGalleryItems.length; return;
    }
    setTimeout(waitForPoseGallery, 100);
  })();
})();
/* DEBUG */
window.__vr = { classifyPose, poseToK, buildPose, CANON, parseRules, mergeDay, composer, bloom, renderer, hall, THREE, V, S, scene, camera, controls, get skin() { return skinMesh; }, flyToPosition, setView, applyDay, poseRecipe, sweepRibbon, skinOBJ };
window.__vr.showWorks = async (ids) => {
  S.day = ids.map(id => ({ cls: REC[id].cls || 'standing', g: null, label: '#' + id, time: null, hours: 1 }));
  S.pos = ids.map((id, k) => ({ orig: null, act: S.day[k], work: id, status: 'keep' }));
  arrangeBoard(S.pos, false);
  await Promise.all(S.pos.map(p => meshOf(p.work)));
  S.pos.forEach((p, i) => setFigure(i, p, false));
};
window.__vr.Walk = Walk; window.__vr.Atlas = Atlas; window.__vr.FIGS = FIGS; Object.defineProperty(window.__vr, 'moves', { get: () => lastMoves }); window.__vr.EXISTING = EXISTING; window.__vr.computeSequence = computeSequence; window.__vr.Group = Group; window.__vr.REC = REC; window.__vr.meshOf = meshOf; window.__vr.ceramic = ceramic;

// Manual image annotation controls and gallery integration.
$('#poseAnnotateBtn').addEventListener('click', openGalleryAnnotator);
$('#poseAnnotatorClose').addEventListener('click', () => { $('#poseAnnotator').hidden = true; });
(() => {
  $('#poseAnnotateBtn').addEventListener('click', openGalleryAnnotator);
  $('#poseAnnotatorClose').addEventListener('click', () => { $('#poseAnnotator').hidden = true; });
  $('#poseJointSelect').addEventListener('change', setGalleryEditorPoint);
  $('#poseAnnotatorCanvas').addEventListener('click', (e) => {
    const canvas = e.currentTarget, rect = canvas.getBoundingClientRect(), key = $('#poseJointSelect').value;
    if (!key || !rect.width || !rect.height) return;
    galleryEditPoints[key] = { x: THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1), y: THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1) };
    galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseJointSkip').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; if (!key) return;
    delete galleryEditPoints[key]; if (!galleryEditSkipped.includes(key)) galleryEditSkipped.push(key); setGalleryEditorPoint();
  });
  $('#poseJointClear').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; delete galleryEditPoints[key]; galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseAnnotationSave').addEventListener('click', async () => {
    const item = poseGalleryItems?.find(x => x.id === gallerySelectedId); if (!item) return;
    const missing = GALLERY_JOINTS.find(([key]) => !galleryEditPoints[key] && !galleryEditSkipped.includes(key));
    if (missing) { $('#poseJointSelect').value = missing[0]; setGalleryEditorPoint(); $('#poseAnnotatorStatus').textContent = '请标记或明确跳过「' + missing[1] + '」，再保存。'; return; }
    const cls = $('#poseClassSelect').value, g = $('#poseGestureSelect').value || null;
    galleryAnnotations[item.id] = { cls, g, points: { ...galleryEditPoints }, skipped: [...galleryEditSkipped] };
    if (!saveGalleryAnnotations()) return;
    const preview = $('#frames canvas'); if (preview) drawGalleryPoints(preview, galleryEditPoints);
    await updateHallFromGalleryAnnotation(item, galleryAnnotations[item.id]);
    $('#poseAnnotatorStatus').textContent = '已保存 ' + item.id + ' 的 ' + CLASS[cls].zh + ' 姿势；展厅已按校正类别更新。';
    $('#poseGalleryStatus').textContent = item.title + '：已使用人工校正姿势更新展厅。';
  });
  $('#poseExportBtn').addEventListener('click', exportGalleryAnnotations);
  $('#poseImportFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importGalleryAnnotations(f); e.target.value = ''; });
  $('#poseGallery').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-pose-gallery]'); if (!button) return;
    const id = button.dataset.poseGallery; gallerySelectedId = id; $('#poseAnnotateBtn').disabled = false;
    const saved = galleryAnnotations[id]; if (!saved) return;
    e.stopImmediatePropagation(); if (Vid.busy) return; Vid.busy = true;
    const status = $('#poseGalleryStatus'), box = $('#frames');
    $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
    try {
      const item = poseGalleryItems.find(x => x.id === id), img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.file; });
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); drawGalleryPoints(canvas, saved.points || {});
      box.replaceChildren(); const fig = document.createElement('figure'), cap = document.createElement('figcaption'); cap.textContent = item.title; fig.append(canvas, cap); box.appendChild(fig);
      await updateHallFromGalleryAnnotation(item, saved); status.textContent = '已使用人工校正：' + CLASS[saved.cls].zh + '；展厅已更新。';
    } catch (_) { status.textContent = '图片载入失败，请稍后再试。'; }
    finally { Vid.busy = false; $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = false; }); }
  }, true);
  (function waitForPoseGallery() {
    if (poseGalleryItems) {
      galleryAnnotationCount(); const jointSelect = $('#poseJointSelect');
      if (!jointSelect.options.length) jointSelect.innerHTML = GALLERY_JOINTS.map(([key, name]) => '<option value="' + key + '">' + name + '</option>').join('');
      $('#poseAnnotateBtn').disabled = !poseGalleryItems.length; return;
    }
    setTimeout(waitForPoseGallery, 100);
  })();
})();

(() => {
  $('#poseAnnotateBtn').addEventListener('click', openGalleryAnnotator);
  $('#poseAnnotatorClose').addEventListener('click', () => { $('#poseAnnotator').hidden = true; });
  $('#poseJointSelect').addEventListener('change', setGalleryEditorPoint);
  $('#poseAnnotatorCanvas').addEventListener('click', (e) => {
    const canvas = e.currentTarget, rect = canvas.getBoundingClientRect(), key = $('#poseJointSelect').value;
    if (!key || !rect.width || !rect.height) return;
    galleryEditPoints[key] = { x: THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1), y: THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1) };
    galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseJointSkip').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; if (!key) return;
    delete galleryEditPoints[key]; if (!galleryEditSkipped.includes(key)) galleryEditSkipped.push(key); setGalleryEditorPoint();
  });
  $('#poseJointClear').addEventListener('click', () => {
    const key = $('#poseJointSelect').value; delete galleryEditPoints[key]; galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
  });
  $('#poseAnnotationSave').addEventListener('click', async () => {
    const item = poseGalleryItems?.find(x => x.id === gallerySelectedId); if (!item) return;
    const missing = GALLERY_JOINTS.find(([key]) => !galleryEditPoints[key] && !galleryEditSkipped.includes(key));
    if (missing) { $('#poseJointSelect').value = missing[0]; setGalleryEditorPoint(); $('#poseAnnotatorStatus').textContent = '请标记或明确跳过「' + missing[1] + '」，再保存。'; return; }
    const cls = $('#poseClassSelect').value, g = $('#poseGestureSelect').value || null;
    galleryAnnotations[item.id] = { cls, g, points: { ...galleryEditPoints }, skipped: [...galleryEditSkipped] };
    if (!saveGalleryAnnotations()) return;
    const preview = $('#frames canvas'); if (preview) drawGalleryPoints(preview, galleryEditPoints);
    await updateHallFromGalleryAnnotation(item, galleryAnnotations[item.id]);
    $('#poseAnnotatorStatus').textContent = '已保存 ' + item.id + ' 的 ' + CLASS[cls].zh + ' 姿势；展厅已按校正类别更新。';
    $('#poseGalleryStatus').textContent = item.title + '：已使用人工校正姿势更新展厅。';
  });
  $('#poseExportBtn').addEventListener('click', exportGalleryAnnotations);
  $('#poseImportFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importGalleryAnnotations(f); e.target.value = ''; });
  $('#poseGallery').addEventListener('click', async (e) => {
    const button = e.target.closest('[data-pose-gallery]'); if (!button) return;
    const id = button.dataset.poseGallery; gallerySelectedId = id; $('#poseAnnotateBtn').disabled = false;
    const saved = galleryAnnotations[id]; if (!saved) return;
    e.stopImmediatePropagation(); if (Vid.busy) return; Vid.busy = true;
    const status = $('#poseGalleryStatus'), box = $('#frames');
    $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
    try {
      const item = poseGalleryItems.find(x => x.id === id), img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.file; });
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); drawGalleryPoints(canvas, saved.points || {});
      box.replaceChildren(); const fig = document.createElement('figure'), cap = document.createElement('figcaption'); cap.textContent = item.title; fig.append(canvas, cap); box.appendChild(fig);
      await updateHallFromGalleryAnnotation(item, saved); status.textContent = '已使用人工校正：' + CLASS[saved.cls].zh + '；展厅已更新。';
    } catch (_) { status.textContent = '图片载入失败，请稍后再试。'; }
    finally { Vid.busy = false; $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = false; }); }
  }, true);
  (function waitForPoseGallery() {
    if (poseGalleryItems) {
      galleryAnnotationCount(); const jointSelect = $('#poseJointSelect');
      if (!jointSelect.options.length) jointSelect.innerHTML = GALLERY_JOINTS.map(([key, name]) => '<option value="' + key + '">' + name + '</option>').join('');
      $('#poseAnnotateBtn').disabled = !poseGalleryItems.length; return;
    }
    setTimeout(waitForPoseGallery, 100);
  })();
})();
$('#poseJointSelect').addEventListener('change', setGalleryEditorPoint);
$('#poseAnnotatorCanvas').addEventListener('click', (e) => {
  const canvas = e.currentTarget, rect = canvas.getBoundingClientRect(), key = $('#poseJointSelect').value;
  if (!key || !rect.width || !rect.height) return;
  galleryEditPoints[key] = { x: THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1), y: THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1) };
  galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
});
$('#poseJointSkip').addEventListener('click', () => {
  const key = $('#poseJointSelect').value; if (!key) return;
  delete galleryEditPoints[key]; if (!galleryEditSkipped.includes(key)) galleryEditSkipped.push(key); setGalleryEditorPoint();
});
$('#poseJointClear').addEventListener('click', () => {
  const key = $('#poseJointSelect').value; delete galleryEditPoints[key]; galleryEditSkipped = galleryEditSkipped.filter(k => k !== key); setGalleryEditorPoint();
});
$('#poseAnnotationSave').addEventListener('click', async () => {
  const item = poseGalleryItems?.find(x => x.id === gallerySelectedId); if (!item) return;
  const missing = GALLERY_JOINTS.find(([key]) => !galleryEditPoints[key] && !galleryEditSkipped.includes(key));
  if (missing) { $('#poseJointSelect').value = missing[0]; setGalleryEditorPoint(); $('#poseAnnotatorStatus').textContent = '请标记或明确跳过「' + missing[1] + '」，再保存。'; return; }
  const cls = $('#poseClassSelect').value, g = $('#poseGestureSelect').value || null;
  galleryAnnotations[item.id] = { cls, g, points: { ...galleryEditPoints }, skipped: [...galleryEditSkipped] };
  if (!saveGalleryAnnotations()) return;
  const preview = $('#frames canvas'); if (preview) drawGalleryPoints(preview, galleryEditPoints);
  await updateHallFromGalleryAnnotation(item, galleryAnnotations[item.id]);
  $('#poseAnnotatorStatus').textContent = '已保存 ' + item.id + ' 的 ' + CLASS[cls].zh + ' 姿势；展厅已按校正类别更新。';
  $('#poseGalleryStatus').textContent = item.title + '：已使用人工校正姿势更新展厅。';
});
$('#poseExportBtn').addEventListener('click', exportGalleryAnnotations);
$('#poseImportFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importGalleryAnnotations(f); e.target.value = ''; });
$('#poseGallery').addEventListener('click', async (e) => {
  const button = e.target.closest('[data-pose-gallery]'); if (!button) return;
  const id = button.dataset.poseGallery; gallerySelectedId = id; $('#poseAnnotateBtn').disabled = false;
  const saved = galleryAnnotations[id]; if (!saved) return;
  e.stopImmediatePropagation(); if (Vid.busy) return; Vid.busy = true;
  const status = $('#poseGalleryStatus'), box = $('#frames');
  $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = true; b.setAttribute('aria-pressed', String(b === button)); });
  try {
    const item = poseGalleryItems.find(x => x.id === id), img = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.file; });
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); drawGalleryPoints(canvas, saved.points || {});
    box.replaceChildren(); const fig = document.createElement('figure'), cap = document.createElement('figcaption'); cap.textContent = item.title; fig.append(canvas, cap); box.appendChild(fig);
    await updateHallFromGalleryAnnotation(item, saved); status.textContent = '已使用人工校正：' + CLASS[saved.cls].zh + '；展厅已更新。';
  } catch (_) { status.textContent = '图片载入失败，请稍后再试。'; }
  finally { Vid.busy = false; $$('#poseGallery [data-pose-gallery]').forEach(b => { b.disabled = false; }); }
}, true);
(function waitForPoseGallery() {
  if (poseGalleryItems) {
    galleryAnnotationCount(); const jointSelect = $('#poseJointSelect');
    if (!jointSelect.options.length) jointSelect.innerHTML = GALLERY_JOINTS.map(([key, name]) => '<option value="' + key + '">' + name + '</option>').join('');
    $('#poseAnnotateBtn').disabled = !poseGalleryItems.length; return;
  }
  setTimeout(waitForPoseGallery, 100);
})();

window.__vr.Architecture = Architecture; window.__vr.NightLighting = NightLighting;
