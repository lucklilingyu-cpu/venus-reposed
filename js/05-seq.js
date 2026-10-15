
/* ---------------------------------------------------------------
   Atlas meshes on the plinths, replacement, skeletons, skin
---------------------------------------------------------------- */
// Sculpture meshes sit directly on the display floor; no plinth is rendered.
const DISPLAY_FLOOR_Y = 0;
const PT = DISPLAY_FLOOR_Y;
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clsOf = (id) => (REC[id] && REC[id].cls) || 'standing';

/* ---------- loading the atlas display meshes ---------- */
const MESH_MAGIC = 0x31504747;
function parseMeshBin(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 12 || buf.byteLength > 24000000) throw new Error('不是图谱的网格文件');
  const magic = dv.getUint32(0, true), detail = magic === 0x32504747;
  if (magic !== MESH_MAGIC && !detail) throw new Error('不是图谱的网格文件');
  const vc = dv.getUint32(4, true), ic = dv.getUint32(8, true);
  const offset = detail ? 16 : 12;
  if (!vc || vc > 600000 || !ic || ic > 1800000 || ic % 3 ||
      (detail && (buf.byteLength < 16 || dv.getUint32(12, true) !== 1)) ||
      buf.byteLength !== offset + vc * (detail ? 24 : 12) + ic * 4) throw new Error('网格文件长度不对');
  const pos = new Float32Array(buf.slice(offset, offset + vc * 12));
  const normal = detail ? new Float32Array(buf.slice(offset + vc * 12, offset + vc * 24)) : null;
  const idx = new Uint32Array(buf.slice(offset + vc * (detail ? 24 : 12)));
  if (pos.some(x => !Number.isFinite(x)) || idx.some(x => x >= vc)) throw new Error('网格数据无效');
  if (normal) for (let i = 0; i < normal.length; i += 3) {
    const len = Math.hypot(normal[i], normal[i + 1], normal[i + 2]);
    if (!Number.isFinite(len) || len < 0.9 || len > 1.1) throw new Error('网格法线无效');
  }
  return { pos, idx, normal };
}
function loadMeshScript(id) { // local package: meshes wrapped as scripts so they load from disk
  return new Promise((res, rej) => {
    window.__atlasMeshWait = window.__atlasMeshWait || {};
    window.__atlasMeshLoaded = window.__atlasMeshLoaded || ((mid, b64) => { const w = window.__atlasMeshWait[mid]; if (w) { delete window.__atlasMeshWait[mid]; w(b64); } });
    window.__atlasMeshWait[id] = (b64) => { try { res(parseMeshBin(b64ToBuf(b64))); } catch (e) { rej(e); } };
    const s = document.createElement('script'); s.src = `m/${id}.js` + (location.protocol === 'file:' ? '' : '?v=' + (ATLAS.revision || '')); s.onerror = () => rej(new Error('网格无法加载')); document.head.appendChild(s);
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
    const r = await fetch(`m/${id}.js?v=${ATLAS.revision || ''}`, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    const t = await r.text(), m = t.match(/"([A-Za-z0-9+\/=]{100,})"/);
    if (!m) throw new Error('mesh text');
    return parseMeshBin(b64ToBuf(m[1]));
  } catch (e) { return loadMeshScript(id); }
}
const TARGET = { standing: ['h', 1.8], walking: ['h', 1.8], seated: ['h', 1.4], crouching: ['h', 1.12], reclining: ['l', 2.0], horizontal: ['l', 2.0] };
function figureScale(ext, cls) {
  const [mode, target] = TARGET[cls] || ['m', 1.6];
  const desired = target / Math.max(1e-6, mode === 'h' ? ext[1] : mode === 'l' ? Math.max(ext[0], ext[2]) : Math.max(...ext));
  // Extra-wide uploaded models must also fit the green-tile movement footprint.
  return Math.min(desired, 2.1 / Math.max(1e-6, ext[0], ext[2]));
}
const meshCache = new Map();
const detailMeshCache = new Map();
let detailLoads = 0;
const detailWaiters = [], retiringDetails = new Set();
async function withDetailSlot(load) {
  if (detailLoads >= 3) await new Promise(resolve => detailWaiters.push(resolve));
  else detailLoads++;
  try { return await load(); }
  finally {
    const next = detailWaiters.shift();
    if (next) next(); else detailLoads--;
  }
}
async function fetchDetailMesh(id) {
  const entry = MODEL_DETAILS[id];
  if (!entry || !/^md\/[1-9]\d*\.bin\.gz$/.test(entry.url) || typeof DecompressionStream === 'undefined') return null;
  return withDetailSlot(async () => {
  const r = await fetch(entry.url + '?v=' + entry.sha256.slice(0, 12), { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('精细模型加载失败');
  let buf = await r.arrayBuffer();
  // Some hosts decode gzip themselves; GitHub Pages serves the compressed file.
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return parseMeshBin(buf);
  });
}
/* returns { geo, bounds, pts (Float32Array, plinth-local), xf (web -> plinth-local), skel: [{segs, pts}] } */
/* rotate (rows of R), scale to the pose class, stand on y = 0, make the winding consistent */
function figureGeometry(pos, idx, R, cls, normal = null) {
  const out = new Float32Array(pos.length);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    for (let a = 0; a < 3; a++) { const v = R[a][0] * x + R[a][1] * y + R[a][2] * z; out[i + a] = v; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const s = figureScale(ext, cls);
  const t = [-(mn[0] + mx[0]) / 2 * s, -mn[1] * s, -(mn[2] + mx[2]) / 2 * s];
  for (let i = 0; i < out.length; i += 3) { out[i] = out[i] * s + t[0]; out[i + 1] = out[i + 1] * s + t[1]; out[i + 2] = out[i + 2] * s + t[2]; }
  if (!normal) fixWinding(out, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (normal) {
    const n = new Float32Array(normal.length);
    for (let i = 0; i < n.length; i += 3) for (let a = 0; a < 3; a++) n[i + a] = R[a][0] * normal[i] + R[a][1] * normal[i + 1] + R[a][2] * normal[i + 2];
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  } else geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
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
function detailedMeshOf(id) {
  if (!MODEL_DETAILS[id]) return meshOf(id);
  if (detailMeshCache.has(id)) return detailMeshCache.get(id);
  const promise = Promise.all([meshOf(id), fetchDetailMesh(id)]).then(([base, data]) => {
    if (!data) return base;
    const r = REC[id];
    const { geo, bounds } = figureGeometry(data.pos, data.idx, r.rot || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], r.cls, data.normal);
    return { ...base, geo, bounds, detail: true };
  }).catch(() => { detailMeshCache.delete(id); return meshOf(id); });
  detailMeshCache.set(id, promise);
  // Bounded CPU cache. A mesh still attached to a viewer retains its geometry.
  if (detailMeshCache.size > MAX_POS + 6) {
    const oldest = detailMeshCache.keys().next().value, old = detailMeshCache.get(oldest);
    detailMeshCache.delete(oldest);
    old.then(mesh => { if (mesh.detail) releaseDetailGeometry(oldest, mesh.geo); }).catch(() => {});
  }
  return promise;
}
function releaseDetailGeometry(id, geo) {
  if (!detailMeshCache.has(id) && !retiringDetails.has(geo) && !V.some(v => v.fig && v.fig.geometry === geo) && !Atlas.usesGeometry(geo)) geo.dispose();
}
function updateHallQuality() {
  const figures = V.filter(v => v.fig);
  const cv = document.getElementById('scene');
  cv.dataset.visibleModels = String(figures.length);
  cv.dataset.detailModels = String(figures.filter(v => v.fig.userData.detail).length);
}
async function refineFigure(i, p) {
  const vp = V[i];
  if (!p || !vp || !vp.fig || vp.work !== p.work) return;
  const fig = vp.fig, mesh = await detailedMeshOf(p.work);
  // A plinth can move to another index while a network request is pending.
  if (!mesh.detail || !V.includes(vp) || vp.work !== p.work || vp.fig !== fig) return;
  fig.geometry = mesh.geo; fig.userData.detail = true; vp.bounds = mesh.bounds;
  renderer.shadowMap.needsUpdate = true;
  updateHallQuality();
}

/* ---------- materials ---------- */
const ceramic = new THREE.MeshPhysicalMaterial({
  color: 0xf5f2eb, roughness: 0.87, metalness: 0, clearcoat: 0,
  ior: 1.46, specularIntensity: 0.28, envMapIntensity: 0.32,
});
// Object-space pores need no UVs and remain attached during sculpture movement.
// Fade subpixel grains to keep the distant hall free of shimmering.
function plasterShader(shader) {
  shader.vertexShader = 'varying vec3 vPlasterPosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlasterPosition = position;');
  shader.fragmentShader = `varying vec3 vPlasterPosition;
float plasterHash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float plasterNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(plasterHash(i),plasterHash(i+vec3(1,0,0)),f.x),mix(plasterHash(i+vec3(0,1,0)),plasterHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(plasterHash(i+vec3(0,0,1)),plasterHash(i+vec3(1,0,1)),f.x),mix(plasterHash(i+vec3(0,1,1)),plasterHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
vec3 poreCoordinates = vPlasterPosition * 850.0;
float poreVisibility = 1.0 - smoothstep(0.35, 1.2, length(fwidth(poreCoordinates)));
float plasterGrain = (plasterNoise(poreCoordinates)-0.5) * poreVisibility;
roughnessFactor = clamp(roughnessFactor + plasterGrain * 0.08, 0.78, 0.96);
diffuseColor.rgb *= 1.0 + plasterGrain * 0.025;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
float poreHeight = plasterGrain * 0.00004;
vec3 plasterDx=dFdx(-vViewPosition), plasterDy=dFdy(-vViewPosition);
vec3 plasterR1=cross(plasterDy,normal), plasterR2=cross(normal,plasterDx);
float plasterDet=dot(plasterDx,plasterR1);
vec3 plasterGradient=sign(plasterDet)*(dFdx(poreHeight)*plasterR1+dFdy(poreHeight)*plasterR2);
if(abs(plasterDet)>1e-12) normal=normalize(abs(plasterDet)*normal-plasterGradient);`);
}
ceramic.onBeforeCompile = plasterShader;
ceramic.customProgramCacheKey = () => 'cast-plaster-v1';
// three.js clones do not copy onBeforeCompile; animation materials need it too.
const clonePlaster = ceramic.clone.bind(ceramic);
ceramic.clone = () => { const material = clonePlaster(); material.onBeforeCompile = plasterShader; material.customProgramCacheKey = ceramic.customProgramCacheKey; return material; };
// Shared only by background sculptures in the hall; specimen materials stay opaque.
const contextPlaster = ceramic.clone();
contextPlaster.transparent = true; contextPlaster.opacity = 0.4; contextPlaster.depthWrite = false;
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
  day: [], pos: [], sel: 0, view: 'sculpture', skinStyle: 'drape', own: true, bones: false, merge: true, layout: 'skeleton', diaryDisplay: 'deluxe',
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
// Enough slots for a collective burst without overwriting the earlier sculptures' shards.
const SHARDS = 1280;
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
let focusedSculpture = null;
// Both focus and arrival beams extend sixteen metres above the crown of the vault.
const focusBeamHeight = HALL.wallH + HALL.vaultRise + 16;
const sculptureBeamGeometry = new THREE.CylinderGeometry(0.18, 1.35, focusBeamHeight, 48, 1, true);
function makeSculptureBeam(color) {
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, strength: { value: 0 } },
    vertexShader: `varying vec2 beamUV; varying vec3 beamNormal; varying vec3 beamView;
      void main() { beamUV = uv; beamNormal = normalize(normalMatrix * normal);
        vec4 p = modelViewMatrix * vec4(position, 1.0); beamView = -p.xyz;
        gl_Position = projectionMatrix * p; }`,
    fragmentShader: `uniform vec3 tint; uniform float strength;
      varying vec2 beamUV; varying vec3 beamNormal; varying vec3 beamView;
      void main() { float face = pow(abs(dot(normalize(beamNormal), normalize(beamView))), 1.6);
        float ends = smoothstep(0.0, 0.035, beamUV.y) * (1.0 - smoothstep(0.88, 1.0, beamUV.y));
        gl_FragColor = vec4(tint, strength * face * ends * 0.04); }`,
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    depthWrite: false, toneMapped: false,
  });
  const beam = new THREE.Mesh(sculptureBeamGeometry, material);
  beam.position.y = PT + focusBeamHeight / 2; beam.visible = false;
  return beam;
}
const focusBeam = makeSculptureBeam(0xfff4e0); scene.add(focusBeam);
const focusLight = new THREE.SpotLight(0xfff4e0, 1400, focusBeamHeight + 10, Math.atan(1.35 / focusBeamHeight), 0.75, 2);
focusLight.intensity = 0; scene.add(focusLight); scene.add(focusLight.target);
let focusTween = null;
// Four real spotlights illuminate arrivals; every rising sculpture also gets its own visible beam.
// Keeping the light count fixed avoids shader recompilation during a collective arrival.
const arrivalLights = Array.from({ length: 4 }, () => {
  const light = new THREE.SpotLight(0xe1f7ff, 0, focusBeamHeight + 10, Math.atan(1.55 / focusBeamHeight), 0.8, 2);
  scene.add(light); scene.add(light.target); return { light, owner: null };
});
function stopRiseBeam(vp) {
  if (vp.beamTween) { const k = tweens.indexOf(vp.beamTween); if (k >= 0) tweens.splice(k, 1); vp.beamTween = null; }
  if (vp.riseBeam) { vp.riseBeam.visible = false; vp.riseBeam.material.uniforms.strength.value = 0; }
  for (const slot of arrivalLights) if (slot.owner === vp) { slot.light.intensity = 0; slot.owner = null; }
}
function startRiseBeam(vp) {
  stopRiseBeam(vp); // removed glass-platform arrival decoration
}
function clearSculptureFocus() {
  stopPoseSlideshow();
  if (focusedSculpture) focusedSculpture.tag.classList.add('hidden');
  if (focusTween) { const k = tweens.indexOf(focusTween); if (k >= 0) tweens.splice(k, 1); focusTween = null; }
  focusedSculpture = null; focusBeam.visible = false; focusLight.intensity = 0;
  canvas.dataset.focusWork = '';
}
function focusSculpture(i) {
  const vp = V[i]; if (!vp || !vp.fig || !vp.g.visible) return;
  clearSculptureFocus(); select(i); flyToPosition(i, true); focusedSculpture = vp;
  focusBeam.position.set(vp.x, PT + focusBeamHeight / 2, vp.z);
  focusLight.position.set(vp.x, PT + focusBeamHeight, vp.z);
  focusLight.target.position.set(vp.x, PT, vp.z);
  focusBeam.visible = true;
  focusBeam.material.uniforms.strength.value = 0;
  vp.tag.classList.remove('hidden');
  focusTween = tween(0.65, e => { focusBeam.material.uniforms.strength.value = 1.3 * e; focusLight.intensity = 1000 * e; }, () => { focusTween = null; });
  canvas.dataset.focusWork = vp.work;
}
const STATUS_COL = { keep: 0xb59a63, swap: 0x246d75, new: 0x6f68a0, beyond: 0xc9c4bc, manual: 0x232323 };
function makePosition() {
  const g = new THREE.Group(); scene.add(g);
  const ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COL.beyond, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.035, 96), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.085; ring.visible = false; // detached compatibility handle
  const moveHalo = new THREE.Mesh(new THREE.RingGeometry(0.94, 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x82d9ef, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  moveHalo.rotation.x = -Math.PI / 2; moveHalo.position.y = 0.015; moveHalo.visible = false; // detached compatibility handle
  const tag = document.createElement('div'); tag.className = 'sculpture-caption hidden';
  tag.innerHTML = '<span class="sculpture-name"></span><span class="sculpture-year"></span>';
  labelsEl.appendChild(tag);
  const poseTag = document.createElement('div'); poseTag.className = 'diary-pose-caption hidden';
  const order = document.createElement('span'); order.className = 'diary-order'; order.hidden = true;
  const name = document.createElement('span'); name.className = 'diary-pose-name';
  poseTag.append(order, name); labelsEl.appendChild(poseTag);
  const vp = { g, ring, moveHalo, tag, poseTag, fig: null, bones: null, work: null, x: 0, z: 0, scaleX: 1, scaleZ: 1, bounds: null, moveTimer: 0, moveTween: null, fresh: false };
  return vp;
}
/* Diary guidance appears after the collective move and rise have finished.
   Ground guidance animates/fades over two seconds; pose names hold five seconds, then fade. */
const SequenceGuide = (() => {
  const group = new THREE.Group(); group.name = 'diary-sequence-guide'; group.visible = false; scene.add(group);
  const material = new THREE.MeshBasicMaterial({ color: 0x246d75, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  let job = 0, sequence = null, pending = false, active = false, orderUntil = 0;
  let segments = [], traveler = null, totalLength = 0;
  const up = new THREE.Vector3(0, 1, 0), tangent = new THREE.Vector3();
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const elapsed = now => now - (orderUntil - 2000);
  const routeOpacity = now => active ? smooth(elapsed(now) / 220) * (1 - smooth((elapsed(now) - 1400) / 600)) : 0;
  const captionOpacity = now => active ? smooth(elapsed(now) / 220) * (1 - smooth((elapsed(now) - 5000) / 1000)) : 0;
  function clear() {
    clearTimeout(job); job = 0; sequence = null; pending = false; active = false; orderUntil = 0;
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); group.clear(); group.visible = false;
    segments = []; traveler = null; totalLength = 0; material.opacity = 0;
    V.forEach(vp => { if (vp.poseTag) vp.poseTag.classList.add('hidden'); });
    canvas.dataset.sequenceGuide = 'hidden'; canvas.dataset.sequenceOrder = 'hidden';
  }
  function schedule(seq, delay) {
    clear();
    if (!seq.some(p => p.act)) return;
    sequence = seq; canvas.dataset.sequenceGuide = 'waiting';
    job = setTimeout(() => { pending = true; }, Math.max(0, delay));
  }
  function update(now) {
    if (pending && S.pos === sequence) {
      const entries = sequence.map((p, i) => ({ p, vp: V[i], i })).filter(e => e.p.act);
      if (entries.some(({ p, vp }) => !vp || !vp.fig || vp.work !== p.work || vp.moveTween || vp.riseTween)) return;
      pending = false; active = true; orderUntil = now + 2000;
      const anchor = vp => {
        const b = vp.bounds;
        return b ? vp.fig.localToWorld(new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + 0.06, (b.min.z + b.max.z) / 2)) : new THREE.Vector3(vp.x, 0.06, vp.z);
      };
      for (let k = 1; k < entries.length; k++) {
        const a = anchor(entries[k - 1].vp), b = anchor(entries[k].vp);
        const curve = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.16, (a.z + b.z) / 2), b);
        const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.025, 6, false), material);
        const length = Math.max(0.0001, curve.getLength());
        segments.push({ curve, line, length, start: totalLength, deltaA: new THREE.Vector3().subVectors(curve.v1, curve.v0), deltaB: new THREE.Vector3().subVectors(curve.v2, curve.v1) });
        totalLength += length; group.add(line);
      }
      if (segments.length) { traveler = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 12), material); group.add(traveler); }
      canvas.dataset.sequenceGuide = 'visible';
      canvas.dataset.sequenceGuideCount = String(entries.length);
    }
    const transientVisible = active && now < orderUntil;
    group.visible = transientVisible;
    material.opacity = 0.9 * routeOpacity(now);
    if (transientVisible && segments.length) {
      const progress = reduceMotion ? 1 : clamp(elapsed(now) / 1500);
      const distance = totalLength * progress;
      const arrowDistance = totalLength * (reduceMotion ? 0.62 : progress);
      let current = segments[segments.length - 1];
      for (const segment of segments) {
        const local = clamp((distance - segment.start) / segment.length);
        segment.line.geometry.setDrawRange(0, Math.floor(local * 64) * 36);
        if (arrowDistance <= segment.start + segment.length && arrowDistance >= segment.start) current = segment;
      }
      const local = clamp((arrowDistance - current.start) / current.length);
      current.curve.getPoint(local, traveler.position);
      tangent.copy(current.deltaA).multiplyScalar(1 - local).addScaledVector(current.deltaB, local).normalize();
      traveler.quaternion.setFromUnitVectors(up, tangent);
    }
    if (active && !transientVisible && group.children.length) {
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); group.clear();
      segments = []; traveler = null;
    }
    if (active) canvas.dataset.sequenceGuide = transientVisible ? 'visible' : 'hidden';
    canvas.dataset.sequenceOrder = transientVisible ? 'visible' : 'hidden';
  }
  return { clear, schedule, update, routeOpacity, captionOpacity, get active() { return active; }, showOrder: now => active && now < orderUntil };
})();
/* ---------- the board: plinths stand on a staggered chessboard over the water ----------
   13 files × 5 ranks; only the "dark squares" are used, so neighbours are always offset.
   The full sculpture footprint stays inside the green perimeter. The sequence follows a track over the
   board — the skeleton of the day's first pose, or an S — and snaps to the nearest free squares.
   The day's sculptures are spread from one end of the track to the other; the sculptures outside
   the day's story fill the squares in between, so together they draw the track. */
const GREEN_BOUNDS = { x0: -16.7, x1: 16.7, z0: -4.8, z1: 4.8 };
// Leave 2.3 m around centres for the largest atlas plinth and its landing ring.
const BOARD = { x0: -13.2, dx: 2.2, cols: 13, z0: -2.5, dz: 1.25, rows: 5 };
const CELLS = [];
for (let r = 0; r < BOARD.rows; r++) for (let k = 0; k < BOARD.cols; k++) if ((k + r) % 2 === 0) CELLS.push({ k, r, x: BOARD.x0 + k * BOARD.dx, z: BOARD.z0 + r * BOARD.dz });
const MAX_POS = 28; // at most this many sculptures on the 33 squares
function skeletonSegments(act) { // the first pose as 2D bones, walked depth-first from the head
  const pose = buildPose(CANON[act.cls]);
  const J = {}; for (const k in pose.joints) J[k] = pose.joints[k].clone();
  const side = act.cls === 'walking' || act.cls === 'seated' || act.cls === 'crouching';
  for (const [k, sd] of [['L', 1], ['R', -1]]) { // gestures move the arms of the track too
    const sh = J['sh' + k], v = (x, y) => new THREE.Vector3(side ? 0 : x * sd, y, side ? x * sd : 0);
    if (act.g === 'arm_raised') { J['elbow' + k] = sh.clone().add(v(0.06, 0.27)); J['wrist' + k] = J['elbow' + k].clone().add(v(0.03, 0.25)); }
    if (act.g === 'arm_extended') { J['elbow' + k] = sh.clone().add(v(0.28, 0)); J['wrist' + k] = J['elbow' + k].clone().add(v(0.25, 0.02)); }
    if (act.g === 'hand_at_head' || act.g === 'supporting_head') { J['elbow' + k] = sh.clone().add(v(0.2, 0.12)); J['wrist' + k] = J.head.clone().add(v(0.1, 0)); }
  }
  const P = (k) => [side ? J[k].z : J[k].x, J[k].y];
  const adj = {}; for (const [a, b] of pose.bones) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); }
  const segs = [], seen = new Set(['head']);
  (function dfs(a) { for (const b of adj[a] || []) if (!seen.has(b)) { seen.add(b); segs.push([P(a), P(b)]); dfs(b); } })('head');
  return segs;
}
function trackPoints(m) {
  if (!m) return [];
  const X0 = BOARD.x0, X1 = BOARD.x0 + (BOARD.cols - 1) * BOARD.dx, ZW = -BOARD.z0;
  const first = S.day[0];
  if (S.layout === 'skeleton' && first && CANON[first.cls]) {
    const segs = skeletonSegments(first);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const sg of segs) for (const [u, v] of sg) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const tall = v1 - v0 >= u1 - u0, along = tall ? v1 - v0 : u1 - u0, across = tall ? u1 - u0 : v1 - v0;
    const sc = Math.min((X1 - X0) / Math.max(along, 1e-3), (2 * ZW) / Math.max(across, 1e-3)) * 0.94;
    const cx = (X0 + X1) / 2, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    const map = ([u, v]) => tall ? { x: cx + (v - vm) * sc, z: (u - um) * sc } : { x: cx + (u - um) * sc, z: -(v - vm) * sc }; // the head lies to the east
    const lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])), total = lens.reduce((x, y) => x + y, 0);
    const out = [];
    for (let j = 0; j < m; j++) {
      let d = m === 1 ? 0 : total * j / (m - 1), i = 0;
      while (i < segs.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
      const [a, b] = segs[i], t = lens[i] ? Math.min(1, d / lens[i]) : 0;
      out.push(map([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
    return out;
  }
  // an S across the whole pool
  return Array.from({ length: m }, (_, j) => { const t = m === 1 ? 0.5 : j / (m - 1); return { x: X0 + (X1 - X0) * t, z: ZW * 0.92 * Math.sin(Math.PI * 2 * t) }; });
}
function planLayout(n) {
  // n points along the whole track, snapped in order to the nearest free dark square
  const used = new Set(), cellOf = [];
  for (const p of trackPoints(n)) {
    let best = -1, bd = 1e9;
    CELLS.forEach((c, i) => { if (used.has(i)) return; const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2; if (d < bd) { bd = d; best = i; } });
    used.add(best); cellOf.push(CELLS[best]);
  }
  // the day's sculptures are spread from the start to the end of the track (in order); the others take the squares between
  const m = S.day.length ? Math.min(n, S.day.length) : n;
  const dayIdx = Array.from({ length: m }, (_, k) => (m === 1 ? 0 : Math.round(k * (n - 1) / (m - 1))));
  const rest = cellOf.map((_, i) => i).filter(i => !dayIdx.includes(i));
  return { day: dayIdx.map(i => cellOf[i]), rest: rest.map(i => cellOf[i]) };
}
/* minimum-cost assignment (Hungarian method): cost is rows × cols with rows <= cols; returns the column of each row */
function assignMin(cost) {
  const n = cost.length, m = n ? cost[0].length : 0, INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Float64Array(m + 1).fill(INF), done = new Uint8Array(m + 1);
    do {
      done[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!done[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (done[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}
/* pair a with b (any sizes) so the total squared distance is smallest; returns [[a, b], …] */
function pairUp(A, B, d2) {
  if (!A.length || !B.length) return [];
  if (A.length <= B.length) { const r = assignMin(A.map(a => B.map(b => d2(a, b)))); return A.map((a, k) => [a, B[r[k]]]); }
  const r = assignMin(B.map(b => A.map(a => d2(a, b)))); return B.map((b, k) => [A[r[k]], b]);
}
const PH = (t, a, b) => { const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const cancelMove = (vp) => { clearTimeout(vp.moveTimer); if (vp.beamTween) stopRiseBeam(vp); vp.moveHalo.material.opacity = 0; if (vp.moveTween) { const k = tweens.indexOf(vp.moveTween); if (k >= 0) tweens.splice(k, 1); vp.moveTween = null; } };
function boardMotion(position, from, to, xFirst, straight, raw, y0 = 0) {
  const lift = PH(raw, 0, 0.14) - PH(raw, 0.86, 1);
  const p1 = straight ? PH(raw, 0.14, 0.86) : PH(raw, 0.14, 0.52), p2 = straight ? p1 : PH(raw, 0.48, 0.86);
  position.set(from.x + (to.x - from.x) * (xFirst ? p1 : p2), y0 * (1 - raw) + lift * 0.5,
    from.z + (to.z - from.z) * (xFirst ? p2 : p1));
}
/* Put the plinths of a sequence on the board, like chess pieces.
   - A sculpture that is already on the board keeps its plinth and travels with it to its new square.
   - Sculptures outside the day randomly exchange free track squares when generating a sequence.
   - Plinths whose sculpture leaves are emptied (the sculpture shatters) and go to the nearest square that needs one;
     extra plinths sink into the water, missing ones rise out of it.
   - All plinths start together and land together after 4.5 s, including a lift for unchanged positions.
   Returns, for each position, the time (ms from now) when its plinth has landed. */
let lastMoves = [], boardFinishTimer = 0; // latest plan and completion marker
function arrangeBoard(seq, animate, delay = 0, shuffleRest = false, onMotionStart = null) {
  let motionNotified = false;
  const notifyMotion = () => { if (motionNotified) return; motionNotified = true; onMotionStart?.(); };
  clearTimeout(boardFinishTimer);
  canvas.dataset.movementState = 'complete';
  const n = seq.length, plan = planLayout(n), m = plan.day.length;
  const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const at = (vp) => ({ x: vp.g.position.x, z: vp.g.position.z });
  V.forEach(cancelMove);
  // 1. sculptures that stay on the board keep their plinths (the same place in the sequence first)
  const next = new Array(n).fill(null), taken = new Set();
  seq.forEach((p, i) => { const vp = V[i]; if (vp && vp.fig && vp.work === p.work) { next[i] = vp; taken.add(vp); } });
  seq.forEach((p, i) => { if (next[i]) return; const vp = V.find(v => !taken.has(v) && v.fig && v.work === p.work); if (vp) { next[i] = vp; taken.add(vp); } });
  // 2. squares: the day in track order; the others on the remaining track squares, nearest first
  const target = new Array(n);
  for (let i = 0; i < m; i++) target[i] = plan.day[i];
  const restPos = Array.from({ length: n - m }, (_, k) => m + k), kept = restPos.filter(i => next[i]);
  const freeCells = new Set(plan.rest);
  // A very high stationary cost makes the random assignment a derangement when possible.
  // Story targets above are never included in this assignment.
  for (const [i, c] of pairUp(kept, plan.rest, (i, c) => shuffleRest ? (d2(at(next[i]), c) < 0.01 ? 1e6 : Math.random() * 100) : d2(at(next[i]), c))) { target[i] = c; freeCells.delete(c); }
  const left = plan.rest.filter(c => freeCells.has(c));
  restPos.filter(i => !next[i]).forEach((i, k) => { target[i] = left[k]; });
  // 3. the other plinths are emptied and go to the nearest open squares
  const spare = V.filter(v => !taken.has(v)), open = [];
  for (let i = 0; i < n; i++) if (!next[i]) open.push(i);
  for (const [vp, i] of pairUp(spare, open, (vp, i) => d2(at(vp), target[i]))) { next[i] = vp; taken.add(vp); }
  // On generation, also dissolve 70% of retained sculptures, then rebuild the same work at arrival.
  // Leave a few intact so the collective movement remains visible.
  const retained = animate && shuffleRest ? V.filter(vp => {
    const i = next.indexOf(vp); return vp.fig && i >= 0 && seq[i].work === vp.work;
  }) : [];
  for (let i = retained.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [retained[i], retained[j]] = [retained[j], retained[i]];
  }
  const dissolve = new Set(retained.slice(0, Math.ceil(retained.length * 0.7)));
  let shatterCount = 0;
  V.forEach(vp => {
    const i = next.indexOf(vp);
    if (vp.fig && (i < 0 || seq[i].work !== vp.work || dissolve.has(vp))) {
      const visibleEffect = animate && (S.diaryDisplay !== 'basic' || !!seq[i]?.act);
      if (visibleEffect) shatterCount++;
      disposeFigure(vp, visibleEffect); vp.work = null;
    }
  });
  canvas.dataset.shatterCount = String(shatterCount);
  for (const vp of V) if (!taken.has(vp)) { // no square left: sink into the water
    disposeFigure(vp, animate); vp.tag.remove(); if (vp.poseTag) vp.poseTag.remove();
    if (vp.riseBeam) vp.riseBeam.material.dispose();
    if (animate) { const g = vp.g, s0 = g.scale.x, y0 = g.position.y; tween(0.9, (e) => { g.scale.setScalar(0.001 + s0 * (1 - e)); g.position.y = y0 - e * 0.7; }, () => scene.remove(g)); }
    else scene.remove(vp.g);
  }
  for (let i = 0; i < n; i++) if (!next[i]) { const vp = makePosition(), c = target[i]; vp.g.position.set(c.x, -0.7, c.z); vp.g.scale.setScalar(0.001); vp.fresh = true; next[i] = vp; }
  V.length = 0; V.push(...next);
  // 4. the moves
  const arrive = new Array(n).fill(0), moves = [];
  V.forEach((vp, i) => {
    const c = target[i], g = vp.g; vp.x = c.x; vp.z = c.z;
    if (!animate) { g.position.set(c.x, 0, c.z); g.scale.setScalar(1); groundWhitePosition(vp); vp.fresh = false; return; }
    const dist = Math.abs(c.x - g.position.x) + Math.abs(c.z - g.position.z);
    moves.push({ i, vp, from: at(vp), to: c, dist, fresh: vp.fresh, dur: 4.5 });
  });
  if (!animate) { lastMoves = []; canvas.dataset.movePlan = '[]'; return arrive; }
  // One shared start and duration: no sequence or occupied-square staggering.
  const order = moves;
  for (const mv of order) {
    const s = delay;
    mv.start = s;
    arrive[mv.i] = s + mv.dur * 1000;
    const { vp } = mv, g = vp.g, { x: x0, z: z0 } = mv.from, { x: x1, z: z1 } = mv.to, y0 = g.position.y, s0 = g.scale.x;
    if (mv.fresh) { // a new plinth rises out of the water on its square
      vp.fresh = false;
      vp.moveTimer = setTimeout(() => { vp.moveTween = tween(mv.dur, (e) => { if (e > 0) notifyMotion(); g.position.y = -0.7 * (1 - e); g.scale.setScalar(0.001 + 0.999 * e); }, () => { groundWhitePosition(vp); vp.moveTween = null; }); }, s);
      continue;
    }
    // Rook-like path along the longer line first; all pieces are moving together.
    const xFirst = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const straight = Math.abs(x1 - x0) < 0.01 || Math.abs(z1 - z0) < 0.01;
    vp.moveTimer = setTimeout(() => {
      vp.moveTween = tween(mv.dur, (e, raw) => {
        if (raw > 0) notifyMotion();
        boardMotion(g.position, mv.from, mv.to, xFirst, straight, raw, y0);
        vp.moveHalo.material.opacity = Math.sin(raw * Math.PI) * 0.65;
        const halo = 1.32 + Math.sin(raw * Math.PI) * 0.16;
        vp.moveHalo.scale.set(vp.scaleX * halo, vp.scaleZ * halo, 1);
        g.scale.setScalar(s0 + (1 - s0) * raw);
      }, () => { g.position.set(x1, 0, z1); g.scale.setScalar(1); groundWhitePosition(vp); vp.moveHalo.material.opacity = 0; vp.moveTween = null; pulseRing(vp); });
    }, s);
  }
  lastMoves = order.map(mv => ({ i: mv.i, start: Math.round(mv.start), dur: mv.dur, dist: +mv.dist.toFixed(1), fresh: mv.fresh, from: mv.from, to: { x: mv.to.x, z: mv.to.z }, background: mv.i >= m }));
  canvas.dataset.movePlan = JSON.stringify(lastMoves);
  if (order.length) {
    canvas.dataset.movementState = 'running';
    boardFinishTimer = setTimeout(() => { canvas.dataset.movementState = 'complete'; }, Math.max(...arrive) + 2200);
  }
  return arrive;
}
/* re-arrange the board without changing the sculptures (e.g. another track) */
function relayout() {
  clearSculptureFocus();
  SequenceGuide.clear();
  if (!S.pos.length) return;
  const arrive = arrangeBoard(S.pos, !reduceMotion);
  scheduleSkin(Math.max(0, ...arrive) + 300);
  SequenceGuide.schedule(S.pos, Math.max(0, ...arrive));
}
function disposeFigure(vp, animate) {
  stopRiseBeam(vp);
  removePoseRibbons(vp, animate);
  if (vp.riseTween) { const k = tweens.indexOf(vp.riseTween); if (k >= 0) tweens.splice(k, 1); vp.riseTween = null; }
  if (vp.riseMaterial) { if (vp.fig) vp.fig.material = ceramic; vp.riseMaterial.dispose(); vp.riseMaterial = null; }
  const old = vp.fig;
  if (vp.bones) { vp.g.remove(vp.bones); vp.bones = null; }
  if (!old) return;
  const oldWork = vp.work;
  if (old.userData.detail) retiringDetails.add(old.geometry);
  const release = () => {
    if (old.userData.detail) { retiringDetails.delete(old.geometry); releaseDetailGeometry(oldWork, old.geometry); }
    updateHallQuality();
  };
  vp.fig = null;
  if (animate) {
    old.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(old);
    burst(box, 36);
    const startOpacity = old.material.opacity;
    const mat = ceramic.clone(); mat.transparent = true; mat.opacity = startOpacity; old.material = mat;
    const y0 = old.position.y;
    tween(0.9, (e) => { mat.opacity = startOpacity * (1 - e); old.position.y = y0 - e * 0.35; }, () => { old.parent && old.parent.remove(old); mat.dispose(); release(); });
  } else { old.parent && old.parent.remove(old); release(); }
}
function groundWhitePosition(vp) {
  vp.g.updateWorldMatrix(true, true);
  const minimum = vp.fig ? new THREE.Box3().setFromObject(vp.fig).min.y : vp.g.position.y;
  // Translate the parent in world Y: figure, bones and pose ribbons move together.
  vp.g.position.y += DISPLAY_FLOOR_Y - minimum;
  vp.g.updateWorldMatrix(true, true);
  vp.g.userData.groundedMinimum = DISPLAY_FLOOR_Y;
}
function figureFit(vp, b, animate) {
  const sx = Math.max(0.66, (b.max.x - b.min.x) / 2 + 0.26), sz = Math.max(0.6, (b.max.z - b.min.z) / 2 + 0.24);
  const x0 = vp.scaleX, z0 = vp.scaleZ;
  const apply = (e) => {
    const X = x0 + (sx - x0) * e, Z = z0 + (sz - z0) * e;
    vp.ring.scale.set(X * 1.42, Z * 1.42, 1);
  };
  vp.scaleX = sx; vp.scaleZ = sz;
  animate ? tween(0.8, apply) : apply(1);
}
async function setFigure(i, p, animate) {
  if (S.pos[i] !== p) return; // superseded by a newer sequence
  const vp = V[i];
  vp.ring.material.color.setHex(STATUS_COL[p.status] || STATUS_COL.beyond);
  if (vp.work === p.work && vp.fig) { pulseRing(vp); applyViewTo(vp); refineFigure(i, p).catch(() => {}); return; }
  let mesh;
  try { mesh = await meshOf(p.work); } catch (e) { toast('模型 #' + p.work + ' 加载失败'); return; }
  if (S.pos[i] !== p) return; // superseded
  disposeFigure(vp, animate);
  vp.work = p.work; vp.bounds = mesh.bounds;
  const m = new THREE.Mesh(mesh.geo, ceramic); m.castShadow = true; m.receiveShadow = false;
  m.userData.pos = i;
  vp.g.add(m); vp.fig = m;
  updateHallQuality();
  refineFigure(i, p).catch(() => {});
  vp.bones = skeletonObject(mesh.skel);
  if (vp.bones) { vp.bones.position.y = PT; vp.g.add(vp.bones); }
  figureFit(vp, mesh.bounds, animate);
  buildPoseRibbons(vp, mesh, animate, 1.0); // its own plaster ribbons, grown after the figure has risen
  if (animate) { // rise out of the plinth
    const h = mesh.bounds.max.y + 0.05;
    const mat = ceramic.clone(); mat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
    m.material = mat;
    vp.riseMaterial = mat;
    startRiseBeam(vp);
    vp.riseTween = tween(1.6, (e, raw) => {
      m.position.y = PT - h * (1 - e);
      vp.g.updateWorldMatrix(true, false);
      mat.clippingPlanes[0].constant = -(vp.g.position.y + PT);
      mat.clippingPlanes[0].normal.set(0, 1, 0);
    }, () => { mat.dispose(); vp.riseTween = null; vp.riseMaterial = null; applyViewTo(vp); pulseRing(vp); });
  } else { m.position.set(0, PT, 0); }
  applyViewTo(vp);
}
function pulseRing(vp) { /* removed glass-platform ring decoration */ }

/* ---------- choosing replacements from the atlas ----------
   No sculpture should stand on the board twice. For a pose class the candidates are, in order:
   sculptures of that class (with the gesture first), sculptures that can also stand for it (alt),
   sculptures of a neighbouring class (KIN); only when all of them are on the board already does one repeat. */
const KIN = { standing: ['walking'], walking: ['standing'], seated: ['crouching', 'reclining'], crouching: ['seated'], reclining: ['horizontal', 'seated'], horizontal: ['reclining'] };
function chooseWork(cls, g, prevYear, used, count = new Map(), avoid = null, varied = false) {
  const free = (r) => !used.has(r.id);
  const key = r => (r.t ? 0 : 2e5) + ((prevYear == null || r.y == null) ? 5e4 : Math.abs(r.y - prevYear));
  const best = (c) => varied ? c[Math.floor(Math.random() * c.length)] : c.slice().sort((a, b) => key(a) - key(b))[0];
  const tiers = [
    g ? FIGS.filter(r => r.cls === cls && r.g === g && free(r)) : [],
    FIGS.filter(r => r.cls === cls && free(r)),
    FIGS.filter(r => (r.alt || []).includes(cls) && free(r)),
    FIGS.filter(r => (KIN[cls] || []).includes(r.cls) && free(r)),
  ];
  if (varied) for (const tier of tiers.slice(0, 3)) { const c = tier.filter(r => r.id !== avoid); if (c.length) return best(c).id; }
  for (const c of tiers) if (c.length) return best(c).id;
  // everything fitting is on the board: repeat the one used least
  const c = FIGS.filter(r => fitsCls(r, cls));
  const r = c.slice().sort((a, b) => ((count.get(a.id) || 0) - (count.get(b.id) || 0)) || key(a) - key(b))[0];
  return r ? r.id : null;
}
function computeSequence(day, prev = [], varied = false, focusIndex = null, variedIndex = null) {
  const n = Math.min(MAX_POS, Math.max(EXISTING.length, day.length));
  // sculptures that keep their place (outside the day, or chosen by hand) are reserved first, so a replacement never doubles them
  const used = new Set(), count = new Map(); let prevYear = null;
  for (let i = 0; i < n; i++) {
    const id = S.override[i] && REC[S.override[i]] ? S.override[i] : (!day[i] && EXISTING[i] ? EXISTING[i].id : null);
    if (id) { used.add(id); count.set(id, (count.get(id) || 0) + 1); }
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const orig = EXISTING[i] || null, act = focusIndex == null ? (day[i] || null) : (i === focusIndex ? (day[0] || null) : null);
    const vary = varied || i === variedIndex;
    let work, status;
    if (S.override[i] && REC[S.override[i]]) { work = S.override[i]; status = 'manual'; }
    else if (!act) { work = orig.id; status = 'beyond'; }
    else if (variedIndex != null && i !== variedIndex && prev[i] && REC[prev[i].work] && fitsCls(REC[prev[i].work], act.cls) &&
      (!act.g || REC[prev[i].work].g === act.g) && !used.has(prev[i].work)) { work = prev[i].work; status = prev[i].status; }
    else if (!vary && orig && REC[orig.id].cls === act.cls && (!act.g || REC[orig.id].g === act.g) && !used.has(orig.id)) { work = orig.id; status = 'keep'; }
    else {
      const pv = prev[i], pr = pv && REC[pv.work];
      const reuse = !vary && pr && (pv.status === 'swap' || pv.status === 'new') && fitsCls(pr, act.cls) && (!act.g || pr.g === act.g) && !used.has(pv.work);
      work = reuse ? pv.work : chooseWork(act.cls, act.g, prevYear, used, count, pv ? pv.work : null, vary);
      status = orig ? 'swap' : 'new';
      if (!work) { work = orig ? orig.id : FIGS[0].id; status = orig ? 'keep' : 'new'; }
    }
    if (status !== 'beyond' && status !== 'manual') { used.add(work); count.set(work, (count.get(work) || 0) + 1); }
    if (REC[work].y != null) prevYear = REC[work].y;
    out.push({ orig, act, work, status });
  }
  return out;
}
let applySeq = 0;
async function applyDay(day, opts = {}) {
  if (opts.musicTicket && !HallMusic.isCurrent(opts.musicTicket)) return;
  if (!opts.musicTicket) HallMusic.stop('sequence-reset');
  Architecture.apply(); // diary, saved works and "展厅原状" share the same shell policy
  clearSculptureFocus();
  SequenceGuide.clear();
  const animate = opts.animate !== false && !reduceMotion;
  const my = ++applySeq;
  S.day = day.map(d => ({ ...d }));
  if (opts.source != null) S.source = opts.source;
  if (opts.fresh) S.override = opts.override ? { ...opts.override } : {};
  const previous = S.pos;
  const seq = computeSequence(S.day, previous, !!opts.fresh || !!opts.varied, opts.focusIndex, opts.variedIndex);
  S.pos = seq;
  if (S.sel >= seq.length) S.sel = 0;
  // sculptures that leave shatter first; then the plinths move like chess pieces; then the new sculptures grow on them
  await Promise.all(seq.map(p => meshOf(p.work).catch(() => null)));
  if (my !== applySeq || (opts.musicTicket && !HallMusic.isCurrent(opts.musicTicket))) return;
  const arrive = arrangeBoard(seq, animate, animate ? 350 : 0, previous.length > 0 && S.day.length > 0, () => {
    if (my === applySeq) HallMusic.boardStarted(opts.musicTicket, hallMusicOutput(seq, REC));
  }), t0 = performance.now();
  applyView();
  canvas.dataset.sequenceWorks = JSON.stringify(seq.map(p => ({ work: p.work, cls: p.act ? p.act.cls : null, background: !p.act, manual: p.status === 'manual' })));
  renderStrip(); renderData(); renderBars();
  const late = performance.now() - t0;
  seq.forEach((p, i) => setTimeout(() => setFigure(i, p, animate), animate ? Math.max(0, arrive[i] + 120 - late) : 0));
  scheduleSkin(animate ? Math.max(0, ...arrive) + 1300 - late : 0);
  SequenceGuide.schedule(seq, animate ? Math.max(0, ...arrive) + 1720 - late : 0);
  if (typeof opts.onVisualComplete === 'function') {
    const finishDelay = animate ? Math.max(0, ...arrive) + 120 + 1600 : 0;
    setTimeout(() => { if (my === applySeq) opts.onVisualComplete(seq); }, finishDelay);
  }
  if (Sound.on) Sound.play(seq[S.sel] ? clsOf(seq[S.sel].work) : null);
}

/* ---------- the skin: plaster ribbons (js/05b-ribbons.js) ---------- */
let skinMesh = null, skinJob = 0, skinTimer = null, skinGrow = null;

/* ---------- views ---------- */
/* views (tabs): 雕塑序列 'sculpture' = the sculptures only, no ribbons;
   表皮序列 'skin' = sculptures wrapped by the sequence ribbon;
   叠加 'both' = the sequence ribbon plus the pose ribbons of the other sculptures;
   雕塑与丝带 'ribbons' = every sculpture with its own pose ribbons (replaced the former 色彩与声音 view). */
function applyViewTo(vp) {
  const v = S.view;
  const participant = !!S.pos[V.indexOf(vp)]?.act;
  const visible = S.diaryDisplay !== 'basic' || participant;
  vp.g.visible = visible;
  if (vp.fig) {
    const material = participant ? ceramic : contextPlaster;
    if (vp.riseMaterial) {
      vp.riseMaterial.opacity = material.opacity; vp.riseMaterial.transparent = material.transparent;
      vp.riseMaterial.depthWrite = material.depthWrite; vp.riseMaterial.needsUpdate = true;
    } else vp.fig.material = material;
    vp.fig.castShadow = participant;
  }
  if (!visible) { vp.tag.classList.add('hidden'); if (vp.poseTag) vp.poseTag.classList.add('hidden'); }
  if (vp.fig) vp.fig.visible = true;
  if (vp.riseBeam) vp.riseBeam.visible = !!vp.beamTween;
  if (vp.rib) { // in 叠加 the sequence ribbon takes over from the pose ribbons of the day's sculptures
    const p = S.pos[V.indexOf(vp)], wrapped = !S.day.length || !!(p && p.act);
    vp.rib.visible = v === 'ribbons' || (S.own && v === 'both' && !wrapped);
  }
  if (vp.bones) vp.bones.visible = S.bones;
}
function setDiaryDisplay(mode) {
  S.diaryDisplay = mode === 'basic' ? 'basic' : 'deluxe';
  if (focusedSculpture && S.diaryDisplay === 'basic' && !S.pos[V.indexOf(focusedSculpture)]?.act) clearSculptureFocus();
  document.querySelectorAll('[data-diary-display]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.diaryDisplay === S.diaryDisplay)));
  const hint = document.getElementById('diaryDisplayHint');
  if (hint) hint.textContent = S.diaryDisplay === 'basic' ? 'Only sculptures in your diary are shown.' : 'All sculptures move; sculptures outside your diary are 60% transparent.';
  canvas.dataset.diaryDisplay = S.diaryDisplay;
  try { localStorage.setItem('venus.diaryDisplay', S.diaryDisplay); } catch (_) { /* use session state */ }
  applyView(); renderer.shadowMap.needsUpdate = true;
}
function applyView() {
  V.forEach(applyViewTo);
  if (skinMesh) skinMesh.visible = S.view === 'skin' || S.view === 'both';
  const bb = document.getElementById('bonesQuick'); if (bb) bb.setAttribute('aria-pressed', String(S.bones));
}
function setView(v) {
  if (v === 'skin') clearSculptureFocus();
  const had = S.view === 'skin' || S.view === 'both', prev = S.view;
  S.view = v;
  document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  applyView();
  if ((v === 'skin' || v === 'both') && skinMesh && !reduceMotion && !had) {
    growSilk(); // the sequence ribbon unrolls from the vault, sculpture after sculpture
  }
  if ((v === 'both' || v === 'ribbons') && v !== prev && !reduceMotion) V.forEach((vp, k) => { if (vp.rib && vp.rib.visible) { if (vp.ribTween) { const q = tweens.indexOf(vp.ribTween); if (q >= 0) tweens.splice(q, 1); } vp.ribTween = growGroup(vp.rib, 1.6, 0.3 + 0.05 * k); } });
}
function paletteFor(i) { const p = S.pos[i]; if (!p) return DEFAULT_PALETTES.standing; return S.posPal[i] || S.palettes[clsOf(p.work)]; }

/* ---------- camera moves ---------- */
let camTween = null;
function flyTo(pos, target, dur = 1.4) {
  if (Walk.active) return; // walk mode steers the camera itself
  if (camTween) { const k = tweens.indexOf(camTween); if (k >= 0) tweens.splice(k, 1); }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  camTween = tween(dur, (e) => { camera.position.lerpVectors(p0, pos, e); controls.target.lerpVectors(t0, target, e); });
}
function flyToPosition(i, captionRoom = false) {
  const vp = V[i]; if (!vp || !vp.bounds) return;
  const b = vp.bounds, h = b.max.y, wdt = b.max.x - b.min.x;
  const d = 1.5 + Math.max(h, wdt * 0.8) * 1.15, dz = Math.max(0.8, Math.min(d, 6.9 - vp.z)), dx = Math.sqrt(Math.max(0.36, d * d - dz * dz));
  const lift = captionRoom ? h * 0.2 : 0;
  flyTo(new THREE.Vector3(vp.x + dx, PT + h * 0.62 + 0.35 + lift, vp.z + dz), new THREE.Vector3(vp.x, PT + h * 0.5 + lift, vp.z));
}
function flyHome() { const H = isSmall() ? HOME_M : HOME; flyTo(H.pos.clone(), H.target.clone(), 1.6); }
function select(i, opts = {}) {
  if (i < 0 || i >= S.pos.length) return;
  if (focusedSculpture && focusedSculpture !== V[i]) clearSculptureFocus();
  S.sel = i;
  renderStrip(true); renderData(); renderGestures();
  if (opts.fly) flyToPosition(i);
  if (Sound.on) Sound.play(clsOf(S.pos[i].work));
}
