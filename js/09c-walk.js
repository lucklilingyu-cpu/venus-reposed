
/* ---------------------------------------------------------------
   Walk mode: first person, like a game.
   W A S D (or the arrow keys, once walking) walk, Shift runs.
   Click the hall to steer with the mouse (Esc releases it); dragging
   also looks around, on touch screens too, where a direction pad
   appears. The view stays level; nearby models fade instead of blocking movement.
---------------------------------------------------------------- */
const Walk = (() => {
  const EYE = 1.62, R = 0.3, SPEED = 2.4, RUN = 5.0;
  const st = { active: false, locked: false, run: false, yaw: 0, pitch: 0, vx: 0, vz: 0, keys: new Set(), pad: { f: 0, r: 0 }, drag: null, step: 0 };
  const btn = document.getElementById('walkBtn'), bar = document.getElementById('walkbar'), barText = document.getElementById('walkText');
  const cross = document.getElementById('walkCross'), pad = document.getElementById('walkPad');
  const MOVE = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const fadeStates = new Map(), scanCells = new Map();
  const CELL = 0.75, nearBox = new THREE.Box3(), meshBox = new THREE.Box3();
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let scanIndexed = false, proximityTime = 0;
  function nearestFree(x, z) {
    const b = WALK.bounds;
    return [THREE.MathUtils.clamp(x, b.x0 + R, b.x1 - R), THREE.MathUtils.clamp(z, b.z0 + R, b.z1 - R)];
  }
  // Index only scan triangles crossing the walking body band, once after loading.
  // A mesh-wide box would incorrectly fade the entire hall whenever we entered it.
  function indexScan() {
    if (scanIndexed || canvas.dataset.vaHallScan !== 'ready') return;
    VAHallScan.group.updateWorldMatrix(true, true);
    VAHallScan.group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry, positions = geometry.attributes.position, index = geometry.index;
      const count = index ? index.count : positions.count, bounds = WALK.bounds;
      for (let i = 0; i < count; i += 3) {
        for (let j = 0; j < 3; j++) points[j].fromBufferAttribute(positions, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld);
        const [a, b, c] = points;
        if (Math.max(a.y, b.y, c.y) < EYE - 0.8 || Math.min(a.y, b.y, c.y) > EYE + 0.7) continue;
        const x0 = Math.max(bounds.x0, Math.min(a.x, b.x, c.x)), x1 = Math.min(bounds.x1, Math.max(a.x, b.x, c.x));
        const z0 = Math.max(bounds.z0, Math.min(a.z, b.z, c.z)), z1 = Math.min(bounds.z1, Math.max(a.z, b.z, c.z));
        for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
          const key = x + ':' + z;
          if (!scanCells.has(key)) scanCells.set(key, new Set());
          scanCells.get(key).add(mesh);
        }
      }
    });
    scanIndexed = true;
  }
  function fade(mesh) {
    if (fadeStates.has(mesh)) return;
    const original = mesh.material, sources = Array.isArray(original) ? original : [original];
    const copies = sources.map(source => {
      const copy = source.clone(); delete copy.userData.scanRole;
      copy.transparent = true; copy.depthWrite = false; copy.opacity = 0.12; copy.needsUpdate = true;
      return copy;
    });
    fadeStates.set(mesh, { original, sources, copies, faded: Array.isArray(original) ? copies : copies[0],
      castShadow: mesh.castShadow, base: sources.map(m => ({ opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite })) });
    mesh.material = fadeStates.get(mesh).faded; mesh.castShadow = false;
    renderer.shadowMap.needsUpdate = true;
  }
  function restore(mesh, state) {
    if (mesh.material === state.faded) {
      mesh.material = state.original; mesh.castShadow = state.castShadow;
      state.sources.forEach((m, i) => { Object.assign(m, state.base[i]); m.needsUpdate = true; });
    }
    state.copies.forEach(m => m.dispose()); fadeStates.delete(mesh);
    renderer.shadowMap.needsUpdate = true;
  }
  function updateTransparency(dt) {
    proximityTime -= dt;
    if (proximityTime <= 0) {
      proximityTime = 0.12; indexScan();
      const nearby = new Set(), p = camera.position;
      for (let x = Math.floor((p.x - 0.45) / CELL); x <= Math.floor((p.x + 0.45) / CELL); x++) for (let z = Math.floor((p.z - 0.45) / CELL); z <= Math.floor((p.z + 0.45) / CELL); z++) {
        const meshes = scanCells.get(x + ':' + z); if (meshes) for (const mesh of meshes) nearby.add(mesh);
      }
      nearBox.min.set(p.x - 0.55, EYE - 0.8, p.z - 0.55); nearBox.max.set(p.x + 0.55, EYE + 0.7, p.z + 0.55);
      for (const vp of V) {
        if (!vp.g.parent || !vp.g.visible) continue;
        meshBox.setFromObject(vp.g);
        if (meshBox.intersectsBox(nearBox)) vp.g.traverse(mesh => { if (mesh.isMesh) nearby.add(mesh); });
      }
      for (const [mesh, state] of fadeStates) if (!nearby.has(mesh) || !mesh.parent) restore(mesh, state);
      for (const mesh of nearby) fade(mesh);
    }
    // Keep cloned illumination in sync without changing the shared originals.
    for (const state of fadeStates.values()) state.copies.forEach((m, i) => {
      const source = state.sources[i]; if (m.color && source.color) m.color.copy(source.color);
      m.envMapIntensity = source.envMapIntensity;
    });
    canvas.dataset.walkFadedMeshes = String(fadeStates.size);
  }
  function label() {
    barText.textContent = matchMedia('(pointer: coarse)').matches ? '拖动画面左右环顾，用右下角的方向键行走'
      : st.locked ? (isSmall() ? 'W A S D 行走 · 移动鼠标左右环顾 · Esc 松开' : 'W A S D 行走 · Shift 跑 · 移动鼠标左右环顾 · 单击选中准星对着的雕塑 · Esc 松开鼠标')
      : (isSmall() ? 'W A S D 行走 · 拖动左右环顾 · Esc 退出' : 'W A S D 行走 · Shift 跑 · 拖动画面左右环顾，单击画面用鼠标转向 · Esc 退出步行');
  }
  const apply = () => { st.pitch = 0; camera.up.set(0, 1, 0); camera.rotation.set(0, st.yaw, 0, 'YXZ'); };
  function enter() {
    if (st.active) return;
    stopTour({ stay: true });
    if (camTween) { const k = tweens.indexOf(camTween); if (k >= 0) tweens.splice(k, 1); camTween = null; }
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    st.yaw = Math.atan2(-dir.x, -dir.z); st.pitch = 0; st.vx = st.vz = 0;
    const [x, z] = nearestFree(camera.position.x, camera.position.z);
    camera.position.set(x, EYE, z); apply();
    controls.enabled = false; st.active = true; proximityTime = 0; updateTransparency(0);
    document.body.classList.add('walking'); btn.setAttribute('aria-pressed', 'true'); bar.hidden = false; label();
  }
  function exit() {
    if (!st.active) return;
    st.active = false; for (const [mesh, state] of fadeStates) restore(mesh, state); canvas.dataset.walkFadedMeshes = '0'; st.keys.clear(); st.pad.f = st.pad.r = 0; st.drag = null;
    if (document.pointerLockElement) document.exitPointerLock();
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    controls.target.copy(camera.position).addScaledVector(fwd, 4);
    controls.enabled = true; controls.update();
    document.body.classList.remove('walking'); btn.setAttribute('aria-pressed', 'false'); bar.hidden = true; cross.hidden = true;
  }
  function look(dx, dy, k) { st.yaw -= dx * k; apply(); }
  function update(dt) {
    const k = st.keys;
    const f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + st.pad.f, r = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + st.pad.r;
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), sp = st.run ? RUN : SPEED;
    let tx = -sy * f + cy * r, tz = -cy * f - sy * r; const l = Math.hypot(tx, tz); if (l > 1) { tx /= l; tz /= l; }
    const a = 1 - Math.exp(-dt * 10);
    st.vx += (tx * sp - st.vx) * a; st.vz += (tz * sp - st.vz) * a;
    const p = camera.position;
    const b = WALK.bounds;
    p.x = THREE.MathUtils.clamp(p.x + st.vx * dt, b.x0 + R, b.x1 - R);
    p.z = THREE.MathUtils.clamp(p.z + st.vz * dt, b.z0 + R, b.z1 - R);
    p.y = EYE;
    updateTransparency(dt);
    apply();
  }

  // keyboard: W A S D start walking from anywhere in the hall
  const typing = (e) => e.target.closest && e.target.closest('textarea,input,select,[contenteditable]');
  const overlayOpen = () => Atlas.isOpen || Group.isOpen || Group.formOpen || !document.getElementById('about').hidden;
  document.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    st.run = e.shiftKey;
    const m = MOVE[e.code];
    if (m) {
      if (!st.active) { if (overlayOpen() || !e.code.startsWith('Key')) return; enter(); }
      st.keys.add(m); e.preventDefault(); e.stopImmediatePropagation(); // arrows walk instead of stepping through the sequence
    } else if (e.key === 'Escape' && st.active && !st.locked) exit();
  });
  document.addEventListener('keyup', (e) => { st.run = e.shiftKey; const m = MOVE[e.code]; if (m) st.keys.delete(m); });
  window.addEventListener('blur', () => { st.keys.clear(); st.run = false; });

  // mouse and touch: drag to look; a plain click captures the mouse
  canvas.addEventListener('pointerdown', (e) => {
    if (!st.active || st.locked) return;
    st.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId, type: e.pointerType };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    const d = st.drag; if (!st.active || !d || d.id !== e.pointerId) return;
    look(e.clientX - d.x, e.clientY - d.y, d.type === 'touch' ? 0.006 : 0.0045);
    d.x = e.clientX; d.y = e.clientY;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
  });
  const endDrag = (e) => {
    const d = st.drag; if (!d || d.id !== e.pointerId) return;
    st.drag = null;
    if (e.type === 'pointerup' && !d.moved && d.type === 'mouse' && st.active && !st.locked) {
      try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) {}
    }
  };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  document.addEventListener('mousemove', (e) => { if (st.locked) look(e.movementX || 0, e.movementY || 0, 0.0022); });
  document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === canvas; cross.hidden = !st.locked; if (st.active) label(); });

  // on-screen direction pad (touch screens)
  for (const b of pad.querySelectorAll('[data-pad]')) {
    const k = b.dataset.pad, set = (on) => {
      if (k === 'f' || k === 'b') st.pad.f = on ? (k === 'f' ? 1 : -1) : 0; else st.pad.r = on ? (k === 'r' ? 1 : -1) : 0;
      b.classList.toggle('on', on);
    };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  }
  btn.addEventListener('click', () => (st.active ? exit() : enter()));
  document.getElementById('walkExit').addEventListener('click', exit);

  return { enter, exit, update, get active() { return st.active; }, get locked() { return st.locked; } };
})();
