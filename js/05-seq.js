
/* ---------------------------------------------------------------
   Atlas meshes on the plinths, replacement, skeletons, skin
---------------------------------------------------------------- */
const PT = 0.92; // plinth top
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clsOf = (id) => (REC[id] && REC[id].cls) || 'standing';

/* ---------- loading the atlas display meshes ---------- */
const MESH_MAGIC = 0x31504747;
function parseMeshBin(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 12 || dv.getUint32(0, true) !== MESH_MAGIC) throw new Error('不是图谱的网格文件');
  const vc = dv.getUint32(4, true), ic = dv.getUint32(8, true);
  if (buf.byteLength !== 12 + vc * 12 + ic * 4) throw new Error('网格文件长度不对');
  return { pos: new Float32Array(buf.slice(12, 12 + vc * 12)), idx: new Uint32Array(buf.slice(12 + vc * 12)) };
}
function loadMeshScript(id) { // local package: meshes wrapped as scripts so they load from disk
  return new Promise((res, rej) => {
    window.__atlasMeshWait = window.__atlasMeshWait || {};
    window.__atlasMeshLoaded = window.__atlasMeshLoaded || ((mid, b64) => { const w = window.__atlasMeshWait[mid]; if (w) { delete window.__atlasMeshWait[mid]; w(b64); } });
    window.__atlasMeshWait[id] = (b64) => { try { res(parseMeshBin(b64ToBuf(b64))); } catch (e) { rej(e); } };
    const s = document.createElement('script'); s.src = `m/${id}.js`; s.onerror = () => rej(new Error('网格无法加载')); document.head.appendChild(s);
  });
}
/* make triangle winding consistent per connected component, outward by signed volume */
function fixWinding(pos, idx) {
  const nt = idx.length / 3, edges = new Map();
  const key = (a, b) => a < b ? a * 1048576 + b : b * 1048576 + a;
  for (let t = 0; t < nt; t++) for (let e = 0; e < 3; e++) {
    const k = key(idx[t * 3 + e], idx[t * 3 + (e + 1) % 3]); const l = edges.get(k); if (l) l.push(t); else edges.set(k, [t]);
  }
  const flip = new Uint8Array(nt), seen = new Uint8Array(nt);
  const has = (t, a, b) => { for (let e = 0; e < 3; e++) if (idx[t * 3 + e] === a && idx[t * 3 + (e + 1) % 3] === b) return true; return false; };
  for (let s0 = 0; s0 < nt; s0++) {
    if (seen[s0]) continue;
    const comp = [s0], queue = [s0]; seen[s0] = 1;
    while (queue.length) {
      const t = queue.pop();
      for (let e = 0; e < 3; e++) {
        let a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3];
        if (flip[t]) { const x = a; a = b; b = x; }
        const l = edges.get(key(a, b)); if (!l || l.length !== 2) continue;
        const u = l[0] === t ? l[1] : l[0]; if (seen[u]) continue;
        flip[u] = has(u, a, b) ? 1 : 0; seen[u] = 1; queue.push(u); comp.push(u);
      }
    }
    let cx = 0, cy = 0, cz = 0;
    for (const t of comp) { const v = idx[t * 3] * 3; cx += pos[v]; cy += pos[v + 1]; cz += pos[v + 2]; }
    cx /= comp.length; cy /= comp.length; cz /= comp.length;
    let vol = 0;
    for (const t of comp) {
      let i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
      if (flip[t]) { const x = i1; i1 = i2; i2 = x; }
      const ax = pos[i0] - cx, ay = pos[i0 + 1] - cy, az = pos[i0 + 2] - cz, bx = pos[i1] - cx, by = pos[i1 + 1] - cy, bz = pos[i1 + 2] - cz, qx = pos[i2] - cx, qy = pos[i2 + 1] - cy, qz = pos[i2 + 2] - cz;
      vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
    }
    if (vol < 0) for (const t of comp) flip[t] ^= 1;
  }
  for (let t = 0; t < nt; t++) if (flip[t]) { const x = idx[t * 3 + 1]; idx[t * 3 + 1] = idx[t * 3 + 2]; idx[t * 3 + 2] = x; }
}
function b64ToBuf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
async function fetchMesh(id) {
  if (REC[id] && REC[id].member) return Group.fetchMemberMesh(REC[id].item);
  if (location.protocol === 'file:') return loadMeshScript(id);
  try {
    const r = await fetch(`m/${id}.js`); if (!r.ok) throw new Error(r.status);
    const t = await r.text(), m = t.match(/"([A-Za-z0-9+\/=]{100,})"/);
    if (!m) throw new Error('mesh text');
    return parseMeshBin(b64ToBuf(m[1]));
  } catch (e) { return loadMeshScript(id); }
}
const TARGET = { standing: ['h', 1.8], walking: ['h', 1.8], seated: ['h', 1.4], crouching: ['h', 1.12], reclining: ['l', 2.0], horizontal: ['l', 2.0] };
const meshCache = new Map();
/* returns { geo, bounds, pts (Float32Array, plinth-local), xf (web -> plinth-local), skel: [{segs, pts}] } */
/* rotate (rows of R), scale to the pose class, stand on y = 0, make the winding consistent */
function figureGeometry(pos, idx, R, cls) {
  const out = new Float32Array(pos.length);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    for (let a = 0; a < 3; a++) { const v = R[a][0] * x + R[a][1] * y + R[a][2] * z; out[i + a] = v; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  }
  const [mode, target] = TARGET[cls] || ['m', 1.6];
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const s = target / Math.max(1e-6, mode === 'h' ? ext[1] : mode === 'l' ? Math.max(ext[0], ext[2]) : Math.max(...ext));
  const t = [-(mn[0] + mx[0]) / 2 * s, -mn[1] * s, -(mn[2] + mx[2]) / 2 * s];
  for (let i = 0; i < out.length; i += 3) { out[i] = out[i] * s + t[0]; out[i + 1] = out[i + 1] * s + t[1]; out[i + 2] = out[i + 2] * s + t[2]; }
  fixWinding(out, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, out, s, t, bounds: { min: geo.boundingBox.min.clone(), max: geo.boundingBox.max.clone() } };
}
function meshOf(id) {
  if (meshCache.has(id)) return meshCache.get(id);
  const p = fetchMesh(id).then(({ pos, idx }) => {
    const r = REC[id], R = r.rot || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const { geo, out, s, t, bounds } = figureGeometry(pos, idx, R, r.cls);
    // sparse surface samples for the skin field
    const seen = new Set(), pts = [], vc = 0.075;
    for (let i = 0; i < out.length; i += 3) {
      const k = Math.round(out[i] / vc) + ',' + Math.round(out[i + 1] / vc) + ',' + Math.round(out[i + 2] / vc);
      if (seen.has(k)) continue; seen.add(k); pts.push(out[i], out[i + 1], out[i + 2]);
    }
    const xf = (v) => { const x = R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], y = R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], z = R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]; return [x * s + t[0], y * s + t[1], z * s + t[2]]; };
    const skel = r.sk ? r.sk.figs.map(f => {
      const segs = [];
      for (let i = 0; i < f.segs.length; i += 6) segs.push(xf(f.segs.slice(i, i + 3)), xf(f.segs.slice(i + 3, i + 6)));
      const jp = []; for (let i = 0; i < (f.pts || []).length; i += 3) jp.push(xf(f.pts.slice(i, i + 3)));
      return { segs, pts: jp };
    }) : [];
    return { geo, bounds, pts: new Float32Array(pts), skel, scale: s };
  });
  meshCache.set(id, p);
  p.catch(() => meshCache.delete(id));
  return p;
}

/* ---------- materials ---------- */
const ceramic = new THREE.MeshPhysicalMaterial({
  color: 0xebe7e1, roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
});
const boneMat = new THREE.MeshBasicMaterial({ color: 0x2b2a2c, depthTest: false, transparent: true, opacity: 0.88 });
const jointMat = new THREE.MeshBasicMaterial({ color: 0xc5a86c, depthTest: false, transparent: true, opacity: 0.95 });
function skeletonObject(skel, rad = 0.0075) {
  if (!skel || !skel.length) return null;
  const grp = new THREE.Group();
  const geos = [], jgeos = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const f of skel) {
    for (let i = 0; i < f.segs.length; i += 2) {
      const a = new THREE.Vector3(...f.segs[i]), b = new THREE.Vector3(...f.segs[i + 1]);
      const len = a.distanceTo(b); if (len < 1e-4) continue;
      const g = new THREE.CylinderGeometry(rad, rad, len, 6, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      geos.push(g);
    }
    const pts = f.pts.length ? f.pts : f.segs;
    const seen = new Set();
    for (const p of pts) {
      const k = p.map(v => v.toFixed(3)).join(','); if (seen.has(k)) continue; seen.add(k);
      const s = new THREE.SphereGeometry(rad * 2.6, 10, 8); s.translate(p[0], p[1], p[2]); jgeos.push(s);
    }
  }
  if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos), boneMat); m.renderOrder = 20; grp.add(m); }
  if (jgeos.length) { const m = new THREE.Mesh(mergeGeometries(jgeos), jointMat); m.renderOrder = 21; grp.add(m); }
  return grp;
}

/* state */
const S = {
  day: [], pos: [], sel: 0, view: 'sculpture', skinStyle: 'ribs', cut: true, bones: false, merge: true,
  palettes: JSON.parse(JSON.stringify(DEFAULT_PALETTES)), posPal: {}, barsMode: 'day', source: '', override: {},
};

/* ---------- tweens ---------- */
const tweens = [];
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function tween(dur, fn, done) {
  const t = { t0: performance.now(), dur: reduceMotion ? 1 : dur * 1000, fn, done };
  tweens.push(t); return t;
}
function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i]; const p = Math.min(1, (now - t.t0) / t.dur);
    t.fn(ease(p), p);
    if (p >= 1) { tweens.splice(i, 1); t.done && t.done(); }
  }
}

/* ---------- porcelain shards when a sculpture leaves ---------- */
const SHARDS = 240;
const shardMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.06), ceramic, SHARDS);
shardMesh.frustumCulled = false; scene.add(shardMesh);
const shardData = Array.from({ length: SHARDS }, () => ({ life: 0 }));
let shardCursor = 0;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
for (let i = 0; i < SHARDS; i++) { _m4.makeScale(0, 0, 0); shardMesh.setMatrixAt(i, _m4); }
function burst(worldBox, count = 40) {
  for (let k = 0; k < count; k++) {
    const d = shardData[shardCursor]; shardCursor = (shardCursor + 1) % SHARDS;
    d.p = new THREE.Vector3(THREE.MathUtils.lerp(worldBox.min.x, worldBox.max.x, Math.random()), THREE.MathUtils.lerp(worldBox.min.y, worldBox.max.y, Math.random()), THREE.MathUtils.lerp(worldBox.min.z, worldBox.max.z, Math.random()));
    d.v = new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 0.7);
    d.r = new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5);
    d.s = 0.5 + Math.random() * 1.3; d.life = 1; d.age = 0;
  }
}
function updateShards(dt) {
  let any = false;
  for (let i = 0; i < SHARDS; i++) {
    const d = shardData[i];
    if (d.life <= 0) continue;
    any = true; d.age += dt; d.life = Math.max(0, 1 - d.age / 2.4);
    d.p.addScaledVector(d.v, dt); d.v.y *= 0.99;
    _e.set(d.r.x * d.age, d.r.y * d.age, d.r.z * d.age); _q.setFromEuler(_e);
    const s = d.s * Math.min(1, d.life * 2.5);
    _m4.compose(d.p, _q, _s.set(s, s, s)); shardMesh.setMatrixAt(i, _m4);
    if (d.life <= 0) { _m4.makeScale(0, 0, 0); shardMesh.setMatrixAt(i, _m4); }
  }
  if (any) shardMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- visual positions ---------- */
const V = [];
const labelsEl = document.getElementById('labels');
const STATUS_COL = { keep: 0xb59a63, swap: 0x246d75, new: 0x6f68a0, beyond: 0xc9c4bc, manual: 0x232323 };
function makePosition() {
  const g = new THREE.Group(); scene.add(g);
  const plinth = new THREE.Group(); g.add(plinth);
  const tiers = [];
  for (let t = 0; t < 3; t++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.17, 64), M.tier);
    m.position.y = -0.1 + 0.085 + t * 0.23; m.receiveShadow = true;
    plinth.add(m); tiers.push(m);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 72), M.drum);
  drum.position.y = PT - 0.15; drum.castShadow = true; drum.receiveShadow = true; plinth.add(drum);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), M.gold); trim.rotation.x = Math.PI / 2; trim.position.y = PT; plinth.add(trim);
  const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COL.beyond, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 96), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.085; g.add(ring);
  const colorGroup = new THREE.Group(); colorGroup.visible = false; g.add(colorGroup);
  const slabs = [];
  for (let j = 0; j < 5; j++) {
    const mm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.94, emissive: 0xffffff, emissiveIntensity: 0.12, clearcoat: 1 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 0.05), mm);
    s.position.set(0, PT + 0.28 + j * 0.45, -0.05); s.castShadow = true; colorGroup.add(s); slabs.push(s);
  }
  const soundRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xb59a63, transparent: true, opacity: 0.6 }));
  soundRing.rotation.x = Math.PI / 2; soundRing.position.y = PT + 0.04; colorGroup.add(soundRing);
  const tag = document.createElement('div'); tag.className = 'tag';
  tag.innerHTML = '<span class="n"></span><span class="t"></span><span class="st"></span><span class="gw"></span>';
  tag.addEventListener('click', () => select(V.indexOf(vp), { fly: true }));
  labelsEl.appendChild(tag);
  const vp = { g, plinth, tiers, drum, trim, ring, colorGroup, slabs, soundRing, tag, fig: null, bones: null, work: null, x: 0, scaleX: 1, scaleZ: 1, bounds: null };
  return vp;
}
function layoutX(n, i) { const sp = n <= 7 ? 3.6 : Math.min(3.6, 25.5 / (n - 1)); return (i - (n - 1) / 2) * sp; }
function ensurePositions(n, animate) {
  while (V.length < n) { const vp = makePosition(); vp.g.position.x = 13; vp.g.scale.setScalar(0.001); V.push(vp); }
  while (V.length > n) { const vp = V.pop(); disposeFigure(vp, animate); scene.remove(vp.g); vp.tag.remove(); }
  V.forEach((vp, i) => {
    const x1 = layoutX(n, i), x0 = vp.g.position.x, s0 = vp.g.scale.x;
    vp.x = x1;
    if (animate) tween(1.0, (e) => { vp.g.position.x = x0 + (x1 - x0) * e; vp.g.scale.setScalar(s0 + (1 - s0) * e); });
    else { vp.g.position.x = x1; vp.g.scale.setScalar(1); }
  });
}
function disposeFigure(vp, animate) {
  const old = vp.fig;
  if (vp.bones) { vp.g.remove(vp.bones); vp.bones = null; }
  if (!old) return;
  vp.fig = null;
  if (animate) {
    old.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(old);
    burst(box, 36);
    const mat = ceramic.clone(); mat.transparent = true; old.material = mat;
    const y0 = old.position.y;
    tween(0.9, (e) => { mat.opacity = 1 - e; old.position.y = y0 - e * 0.35; }, () => { old.parent && old.parent.remove(old); mat.dispose(); });
  } else old.parent && old.parent.remove(old);
}
function plinthFit(vp, b, animate) {
  const sx = Math.max(0.66, (b.max.x - b.min.x) / 2 + 0.26), sz = Math.max(0.6, (b.max.z - b.min.z) / 2 + 0.24);
  const x0 = vp.scaleX, z0 = vp.scaleZ;
  const apply = (e) => {
    const X = x0 + (sx - x0) * e, Z = z0 + (sz - z0) * e;
    vp.drum.scale.set(X, 1, Z); vp.trim.scale.set(X, Z, 1);
    vp.tiers.forEach((t, k) => t.scale.set(X * (1.32 - k * 0.12), 1, Z * (1.32 - k * 0.12)));
    vp.ring.scale.set(X * 1.42, Z * 1.42, 1);
  };
  vp.scaleX = sx; vp.scaleZ = sz;
  animate ? tween(0.8, apply) : apply(1);
}
async function setFigure(i, p, animate) {
  const vp = V[i];
  vp.ring.material.color.setHex(STATUS_COL[p.status] || STATUS_COL.beyond);
  if (vp.work === p.work && vp.fig) { pulseRing(vp); applyViewTo(vp); return; }
  let mesh;
  try { mesh = await meshOf(p.work); } catch (e) { toast('模型 #' + p.work + ' 加载失败'); return; }
  if (S.pos[i] !== p) return; // superseded
  disposeFigure(vp, animate);
  vp.work = p.work; vp.bounds = mesh.bounds;
  const m = new THREE.Mesh(mesh.geo, ceramic); m.castShadow = true; m.receiveShadow = false;
  m.userData.pos = i;
  vp.g.add(m); vp.fig = m;
  vp.bones = skeletonObject(mesh.skel);
  if (vp.bones) { vp.bones.position.y = PT; vp.g.add(vp.bones); }
  plinthFit(vp, mesh.bounds, animate);
  if (animate) { // rise out of the plinth
    const h = mesh.bounds.max.y + 0.05;
    const mat = ceramic.clone(); mat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    m.material = mat;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 7, 32, 1, true), glowMat.clone());
    beam.material.opacity = 0; beam.position.set(0, PT + 3.5, 0); vp.g.add(beam);
    tween(1.6, (e, raw) => {
      m.position.y = PT - h * (1 - e);
      vp.g.updateWorldMatrix(true, false);
      mat.clippingPlanes[0].constant = -(vp.g.position.y + PT);
      mat.clippingPlanes[0].normal.set(0, 1, 0);
      beam.material.opacity = Math.sin(raw * Math.PI) * 0.12;
    }, () => { m.material = ceramic; mat.dispose(); vp.g.remove(beam); beam.geometry.dispose(); pulseRing(vp); });
  } else { m.position.set(0, PT, 0); }
  applyViewTo(vp);
}
function pulseRing(vp) {
  tween(1.2, (e, raw) => { const k = 1 + Math.sin(raw * Math.PI) * 0.18; vp.ring.scale.set(vp.scaleX * 1.42 * k, vp.scaleZ * 1.42 * k, 1); });
}

/* ---------- choosing replacements from the atlas ---------- */
function chooseWork(cls, g, prevYear, used) {
  let c = FIGS.filter(r => r.cls === cls);
  if (g) { const cg = c.filter(r => r.g === g); if (cg.length) c = cg; }
  const fresh = c.filter(r => !used.has(r.id)); if (fresh.length) c = fresh;
  const key = r => (r.t ? 0 : 2e5) + ((prevYear == null || r.y == null) ? 5e4 : Math.abs(r.y - prevYear));
  const best = c.slice().sort((a, b) => key(a) - key(b))[0];
  return best ? best.id : null;
}
function computeSequence(day, prev = []) {
  const n = Math.min(10, Math.max(EXISTING.length, day.length));
  const out = [], used = new Set(Object.values(S.override)); let prevYear = null;
  for (let i = 0; i < n; i++) {
    const orig = EXISTING[i] || null, act = day[i] || null;
    let work, status;
    if (S.override[i] && REC[S.override[i]]) { work = S.override[i]; status = 'manual'; }
    else if (!act) { work = orig.id; status = 'beyond'; }
    else if (orig && REC[orig.id].cls === act.cls && (!act.g || REC[orig.id].g === act.g)) { work = orig.id; status = 'keep'; }
    else {
      const pv = prev[i];
      const reuse = pv && (pv.status === 'swap' || pv.status === 'new') && REC[pv.work].cls === act.cls && (!act.g || REC[pv.work].g === act.g) && !used.has(pv.work);
      work = reuse ? pv.work : chooseWork(act.cls, act.g, prevYear, used);
      status = orig ? 'swap' : 'new';
      if (!work) { work = orig ? orig.id : FIGS[0].id; status = orig ? 'keep' : 'new'; }
    }
    used.add(work);
    if (REC[work].y != null) prevYear = REC[work].y;
    out.push({ orig, act, work, status });
  }
  return out;
}
let applySeq = 0;
async function applyDay(day, opts = {}) {
  const animate = opts.animate !== false && !reduceMotion;
  const my = ++applySeq;
  S.day = day.map(d => ({ ...d }));
  if (opts.source != null) S.source = opts.source;
  if (opts.fresh) S.override = opts.override ? { ...opts.override } : {};
  const seq = computeSequence(S.day, opts.fresh ? [] : S.pos);
  S.pos = seq;
  if (S.sel >= seq.length) S.sel = 0;
  ensurePositions(seq.length, animate);
  renderStrip(); renderData(); renderBars();
  await Promise.all(seq.map(p => meshOf(p.work).catch(() => null)));
  if (my !== applySeq) return;
  seq.forEach((p, i) => setTimeout(() => setFigure(i, p, animate), animate ? i * 240 : 0));
  scheduleSkin(animate ? 1100 : 0);
  if (Sound.on) Sound.play(seq[S.sel] ? clsOf(seq[S.sel].work) : null);
}

/* ---------- skin ---------- */
const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.12);
const skinUniforms = { uRib: { value: 1 }, uRibColor: { value: new THREE.Color(0xc5a86c) } };
const skinMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true, side: THREE.DoubleSide, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
  transparent: true, opacity: 0.97, clippingPlanes: [cutPlane], envMapIntensity: 1.0,
});
skinMat.onBeforeCompile = (sh) => {
  sh.uniforms.uRib = skinUniforms.uRib; sh.uniforms.uRibColor = skinUniforms.uRibColor;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform float uRib; uniform vec3 uRibColor;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float rl = abs(fract(vWPos.y * 6.0) - 0.5);
      float rib = (1.0 - smoothstep(0.0, 0.035, rl)) * uRib;
      diffuseColor.rgb = mix(diffuseColor.rgb, uRibColor, clamp(rib * 0.75, 0.0, 1.0));`);
};
let skinMesh = null, skinJob = 0, skinTimer = null;
function scheduleSkin(delay = 150) { clearTimeout(skinTimer); skinTimer = setTimeout(buildSkin, delay); }
function helperPrims(cls, b) {
  const H = b.max.y, out = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const cap = (a, c, r) => out.push({ t: 'c', a, b: c, ra: r, rb: r });
  if (cls === 'standing') cap(v(0, 0.2, b.min.z - 0.02), v(0, H * 1.3, b.min.z - 0.04), 0.11);
  if (cls === 'walking') { cap(v(b.min.x - 0.7, H * 0.55, b.min.z), v(b.max.x + 0.7, H * 0.55, b.min.z), 0.1); cap(v(b.min.x - 0.5, H * 0.18, b.min.z - 0.05), v(b.max.x + 0.5, H * 0.18, b.min.z - 0.05), 0.08); }
  if (cls === 'seated') cap(v(0, 0.15, b.min.z - 0.05), v(0, H + 0.1, b.min.z - 0.12), 0.12);
  if (cls === 'crouching') cap(v(0, H * 0.5, -0.05), v(0, H * 0.5, -0.05), H * 0.5);
  if (cls === 'reclining') cap(v(b.min.x, 0.12, b.min.z + 0.1), v(b.max.x, 0.12, b.min.z + 0.1), 0.16);
  if (cls === 'horizontal') cap(v(b.min.x + 0.1, H + 0.42, -0.12), v(b.max.x - 0.1, H + 0.42, -0.12), 0.07);
  return out;
}
function shiftPts(pts, dx, dy) { const o = new Float32Array(pts.length); for (let i = 0; i < pts.length; i += 3) { o[i] = pts[i] + dx; o[i + 1] = pts[i + 1] + dy; o[i + 2] = pts[i + 2]; } return o; }
async function buildSkin() {
  const job = ++skinJob;
  if (!S.pos.length) return;
  let meshes;
  try { meshes = await Promise.all(S.pos.map(p => meshOf(p.work))); } catch (e) { return; }
  if (job !== skinJob) return;
  const figs = [];
  let maxH = 0;
  S.pos.forEach((p, i) => {
    const mesh = meshes[i], b = mesh.bounds, cls = clsOf(p.work);
    const x = V[i] ? V[i].x : layoutX(S.pos.length, i);
    const prims = helperPrims(cls, b);
    prims.push({ t: 'c', a: new THREE.Vector3(0, -PT - 0.35, 0), b: new THREE.Vector3(0, -0.28, 0), ra: 0.42, rb: 0.42 });
    const hours = p.act ? (p.act.hours || CLASS[p.act.cls].dur) : 1;
    const s = p.act ? THREE.MathUtils.clamp(0.82 + 0.28 * Math.log2(1 + hours), 0.85, 1.75) : 1;
    const pal = S.posPal[i] || S.palettes[cls];
    const c = new THREE.Color(pal[2]).lerp(new THREE.Color(0xffffff), 0.35);
    const half = (b.max.x - b.min.x) / 2;
    figs.push({ cx: x, s, c: 0.26, prims: packPrims(prims, x, PT, 0), pts: shiftPts(mesh.pts, x, PT), r: 0.05, xmin: x - (half + 2.4) * s, xmax: x + (half + 2.4) * s, color: [c.r, c.g, c.b] });
    maxH = Math.max(maxH, b.max.y);
  });
  for (let i = 0; i + 1 < S.pos.length; i++) {
    const A = meshes[i].bounds, B = meshes[i + 1].bounds;
    const xa = V[i] ? V[i].x : layoutX(S.pos.length, i), xb = V[i + 1] ? V[i + 1].x : layoutX(S.pos.length, i + 1);
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    const prims = [
      { t: 'c', a: v(xa + A.max.x * 0.4, PT + A.max.y * 0.5, -0.36), b: v(xb + B.min.x * 0.4, PT + B.max.y * 0.5, -0.36), ra: 0.15, rb: 0.15 },
      { t: 'c', a: v(xa, PT * 0.42, -0.22), b: v(xb, PT * 0.42, -0.22), ra: 0.2, rb: 0.2 },
    ];
    const ca = figs[i].color, cb = figs[i + 1].color;
    figs.push({ cx: (xa + xb) / 2, s: 1, c: 0.26, prims: packPrims(prims), xmin: xa - 0.8, xmax: xb + 0.8, color: [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2] });
  }
  const x0 = layoutX(S.pos.length, 0), x1 = layoutX(S.pos.length, S.pos.length - 1);
  const cell = S.skinStyle === 'fold' ? 0.17 : 0.078;
  const msg = { type: 'skin', figs, cell, kSeq: 0.7, kBody: 0.08, min: [x0 - 2.6, -0.25, -2.0], max: [x1 + 2.6, PT + maxH * 1.3 + 0.75, 1.5] };
  setLoading('正在生成表皮…');
  let r;
  try { r = await Geo.run(msg); } catch (e) { setLoading(null); toast('表皮生成失败：' + e.message); return; }
  if (job !== skinJob) return;
  setLoading(null);
  const geo = toGeometry(r, S.skinStyle === 'fold');
  skinMat.flatShading = S.skinStyle === 'fold';
  skinUniforms.uRib.value = S.skinStyle === 'ribs' ? 1 : 0;
  skinMat.needsUpdate = true;
  if (!skinMesh) {
    skinMesh = new THREE.Mesh(geo, skinMat); skinMesh.castShadow = true; skinMesh.receiveShadow = true; scene.add(skinMesh);
  } else { skinMesh.geometry.dispose(); skinMesh.geometry = geo; }
  skinMesh.userData.ready = true;
  applyView();
  const target = S.view === 'both' ? 0.5 : 0.97;
  if (!reduceMotion && (S.view === 'skin' || S.view === 'both')) { skinMat.opacity = 0; tween(0.9, e => { skinMat.opacity = target * e; }); }
}
function toGeometry(r, flat) {
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
  if (r.col) g.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
  g.setIndex(new THREE.BufferAttribute(r.idx, 1));
  if (flat) { g = g.toNonIndexed(); g.deleteAttribute('normal'); g.computeVertexNormals(); }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/* ---------- views ---------- */
function applyViewTo(vp) {
  const v = S.view;
  const showFig = v === 'sculpture' || v === 'both';
  if (vp.fig) vp.fig.visible = showFig;
  vp.plinth.visible = v !== 'skin';
  vp.colorGroup.visible = v === 'color';
  if (vp.bones) vp.bones.visible = S.bones || v === 'skin';
}
function applyView() {
  V.forEach(applyViewTo);
  if (skinMesh) {
    skinMesh.visible = S.view === 'skin' || S.view === 'both';
    skinMat.opacity = S.view === 'both' ? 0.5 : 0.97;
    skinMat.depthWrite = S.view !== 'both';
  }
  cutPlane.constant = S.cut ? 0.12 : 50;
  updateColorView();
  const bb = document.getElementById('bonesQuick'); if (bb) bb.setAttribute('aria-pressed', String(S.bones));
}
function setView(v) {
  S.view = v;
  document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  applyView();
  if ((v === 'skin' || v === 'both') && skinMesh && !reduceMotion) { const t = skinMat.opacity; skinMat.opacity = 0; tween(0.6, e => { skinMat.opacity = t * e; }); }
}
function paletteFor(i) { const p = S.pos[i]; if (!p) return DEFAULT_PALETTES.standing; return S.posPal[i] || S.palettes[clsOf(p.work)]; }
function updateColorView() {
  V.forEach((vp, i) => {
    const pal = paletteFor(i);
    vp.slabs.forEach((s, j) => { const c = new THREE.Color(pal[j]); s.material.color.copy(c); s.material.emissive.copy(c); });
  });
}

/* ---------- camera moves ---------- */
let camTween = null;
function flyTo(pos, target, dur = 1.4) {
  if (Walk.active) return; // walk mode steers the camera itself
  if (camTween) { const k = tweens.indexOf(camTween); if (k >= 0) tweens.splice(k, 1); }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  camTween = tween(dur, (e) => { camera.position.lerpVectors(p0, pos, e); controls.target.lerpVectors(t0, target, e); });
}
function flyToPosition(i) {
  const vp = V[i]; if (!vp || !vp.bounds) return;
  const b = vp.bounds, h = b.max.y, wdt = b.max.x - b.min.x;
  const d = 1.5 + Math.max(h, wdt * 0.8) * 1.15;
  flyTo(new THREE.Vector3(vp.x + d * 0.42, PT + h * 0.62 + 0.35, d), new THREE.Vector3(vp.x, PT + h * 0.5, 0));
}
function flyHome() { const H = isSmall() ? HOME_M : HOME; flyTo(H.pos.clone(), H.target.clone(), 1.6); }
function select(i, opts = {}) {
  if (i < 0 || i >= S.pos.length) return;
  S.sel = i;
  renderStrip(true); renderData(); renderGestures();
  if (opts.fly) flyToPosition(i);
  if (Sound.on) Sound.play(clsOf(S.pos[i].work));
}
