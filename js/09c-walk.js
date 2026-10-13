
/* ---------------------------------------------------------------
   Walk mode: first person, like a game.
   W A S D (or the arrow keys, once walking) walk, Shift runs.
   Click the hall to steer with the mouse (Esc releases it); dragging
   also looks around, on touch screens too, where a direction pad
   appears. Look up to see the glass vault.
   Collisions use the floor plan WALK from js/04b-casts.js.
---------------------------------------------------------------- */
const Walk = (() => {
  const EYE = 1.62, R = 0.3, SPEED = 2.4, RUN = 5.0;
  const st = { active: false, locked: false, run: false, yaw: 0, pitch: 0, vx: 0, vz: 0, keys: new Set(), pad: { f: 0, r: 0 }, drag: null, step: 0 };
  const btn = document.getElementById('walkBtn'), bar = document.getElementById('walkbar'), barText = document.getElementById('walkText');
  const cross = document.getElementById('walkCross'), pad = document.getElementById('walkPad');
  const MOVE = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  const free = (x, z) => {
    const b = WALK.bounds;
    if (x < b.x0 + R || x > b.x1 - R || z < b.z0 + R || z > b.z1 - R) return false;
    for (const [x0, z0, x1, z1] of WALK.rects) if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) return false;
    return true;
  };
  function nearestFree(x, z) {
    const b = WALK.bounds;
    x = THREE.MathUtils.clamp(x, b.x0 + R + 0.01, b.x1 - R - 0.01); z = THREE.MathUtils.clamp(z, b.z0 + R + 0.01, b.z1 - R - 0.01);
    if (free(x, z)) return [x, z];
    for (let r = 0.25; r < 40; r += 0.25) for (let a = 0; a < 24; a++) {
      const t = a / 24 * Math.PI * 2, nx = x + Math.cos(t) * r, nz = z + Math.sin(t) * r;
      if (free(nx, nz)) return [nx, nz];
    }
    return [0, 6];
  }
  function label() {
    barText.textContent = isSmall() || matchMedia('(pointer: coarse)').matches ? '拖动画面环顾，用右下角的方向键行走'
      : st.locked ? 'W A S D 行走 · Shift 跑 · 移动鼠标环顾 · 单击选中准星对着的雕塑 · Esc 松开鼠标'
      : 'W A S D 行走 · Shift 跑 · 拖动画面环顾，单击画面用鼠标转向 · Esc 退出步行';
  }
  const apply = () => camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
  function enter() {
    if (st.active) return;
    stopTour({ stay: true });
    if (camTween) { const k = tweens.indexOf(camTween); if (k >= 0) tweens.splice(k, 1); camTween = null; }
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    st.yaw = Math.atan2(-dir.x, -dir.z); st.pitch = 0; st.vx = st.vz = 0;
    const [x, z] = nearestFree(camera.position.x, camera.position.z);
    camera.position.set(x, EYE, z); apply();
    controls.enabled = false; st.active = true;
    document.body.classList.add('walking'); btn.setAttribute('aria-pressed', 'true'); bar.hidden = false; label();
  }
  function exit() {
    if (!st.active) return;
    st.active = false; st.keys.clear(); st.pad.f = st.pad.r = 0; st.drag = null;
    if (document.pointerLockElement) document.exitPointerLock();
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    controls.target.copy(camera.position).addScaledVector(fwd, 4);
    controls.enabled = true; controls.update();
    document.body.classList.remove('walking'); btn.setAttribute('aria-pressed', 'false'); bar.hidden = true; cross.hidden = true;
  }
  function look(dx, dy, k) { st.yaw -= dx * k; st.pitch = THREE.MathUtils.clamp(st.pitch - dy * k, -1.5, 1.5); apply(); }
  function update(dt) {
    const k = st.keys;
    const f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + st.pad.f, r = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + st.pad.r;
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw), sp = st.run ? RUN : SPEED;
    let tx = -sy * f + cy * r, tz = -cy * f - sy * r; const l = Math.hypot(tx, tz); if (l > 1) { tx /= l; tz /= l; }
    const a = 1 - Math.exp(-dt * 10);
    st.vx += (tx * sp - st.vx) * a; st.vz += (tz * sp - st.vz) * a;
    const p = camera.position;
    const nx = p.x + st.vx * dt; if (free(nx, p.z)) p.x = nx; else st.vx = 0; // slide along walls and plinths
    const nz = p.z + st.vz * dt; if (free(p.x, nz)) p.z = nz; else st.vz = 0;
    const v = Math.hypot(st.vx, st.vz); st.step += v * dt;
    p.y = EYE + (reduceMotion ? 0 : Math.sin(st.step * 2.3) * 0.022 * Math.min(1, v / SPEED));
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
