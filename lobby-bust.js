/* Lobby background: plaster busts of goddess sculptures, lit by a single beam on the face.
   Models: high-resolution scans (local folder "3D model", nos. 5, 9, 10, 14, 15), cropped to the upper body,
   decimated with the full-resolution surface normals baked in, and stored in bust-*.bin.gz (format BST1).
   One bust at a time sways gently; every 5 seconds the next one fades in. Rendering pauses when the lobby is closed. */
import * as THREE from 'three';

const MODELS = [
  { id: '09', name: 'Aphrodite bust',            credit: 'Three D Scans',                                         face: [0.02, 0.17, 0.25] },
  { id: '10', name: 'Esquiline Aphrodite',       credit: 'SMK – National Gallery of Denmark',                     face: [-0.13, 0.18, 0.22] },
  { id: '05', name: 'Venus de Milo',             credit: 'SMK – National Gallery of Denmark',                     face: [-0.03, 0.33, 0.32] },
  { id: '15', name: 'Venus Victorious',          credit: 'Middelheim Museum · Scan-the-World · CC BY-NC-SA 4.0',  face: [-0.13, 0.22, 0.25] },
  { id: '14', name: 'Adonis garlanded by Venus', credit: 'Scan-the-World · CC BY-NC-SA 4.0',                      face: [-0.08, 0.17, 0.15] },
];
const PERIOD = 5000, FADE = 700;
const lobby = document.getElementById('intro'), canvas = document.getElementById('lobbyBust'), credit = document.getElementById('lobbyCredit');
if (!lobby || !canvas) throw new Error('lobby not found');
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { console.warn('lobby bust: WebGL unavailable', e); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 60); const DIST = 7; camera.position.set(0, 0, DIST);

/* plaster: matte, slightly warm white */
const plaster = new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.92, metalness: 0.0 });
const holder = new THREE.Group(); scene.add(holder);
const mesh = new THREE.Mesh(new THREE.BufferGeometry(), plaster); mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh);

/* the beam on the face, a cool rim to lift the silhouette off the backdrop, and a low warm ambient */
const key = new THREE.SpotLight(0xfff0da, 200, 0, 0.34, 0.9, 2);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 30;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xe4ebf7, 0.9); rim.position.set(4.5, 2.5, -2.5); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xfff6ea, 0xb39c8e, 0.45));

/* ---------- loading ---------- */
const cache = new Map();
async function gunzip(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0x1f && u[1] === 0x8b && typeof DecompressionStream !== 'undefined')
    return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return buf; // some hosts already decode gzip
}
function parse(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x31545342) throw new Error('not a BST1 file'); // "BST1"
  const vc = dv.getUint32(4, true), ic = dv.getUint32(8, true), half = dv.getFloat32(16, true);
  let o = 44;
  const pos = new Int16Array(buf, o, vc * 3); o += vc * 6;
  const nor = new Int16Array(buf, o, vc * 3); o += vc * 6;
  const idx = new Uint32Array(buf, o, ic * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3, true));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  const bb = g.boundingBox;
  return { geo: g, half, width: (bb.max.x - bb.min.x) * half, height: (bb.max.y - bb.min.y) * half, cx: (bb.max.x + bb.min.x) / 2 * half };
}
function load(m) {
  if (!cache.has(m.id)) cache.set(m.id, fetch(`bust-${m.id}.bin.gz`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(gunzip).then(parse));
  return cache.get(m.id);
}

/* ---------- layout: the bust sits to the right on wide screens, behind the text on narrow ones ---------- */
let cur = null, S = 1, W = 1, H = 1;
function layout() {
  if (!cur) return;
  const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * DIST, aspect = W / H, vw = vh * aspect;
  const wide = aspect > 1.05;
  const ratio = cur.d.width / cur.d.height;
  S = Math.min(vh * (wide ? 1.0 : 0.62), vw * (wide ? 0.5 : 1.02) / ratio);
  mesh.scale.setScalar(S * cur.d.half);
  mesh.position.set(-cur.d.cx * S, 0, 0);
  holder.position.set(wide ? vw * 0.255 : 0, vh * 0.5 - vh * 0.035 - S * 0.5, 0);
  const f = new THREE.Vector3(...cur.m.face).multiplyScalar(S).add(new THREE.Vector3(holder.position.x, holder.position.y, 0));
  key.position.set(f.x - 1.45 * S, f.y + 1.55 * S, f.z + 3.0 * S);
  key.target.position.copy(f); key.target.updateMatrixWorld();
  canvas.style.opacity = '';
  lobby.classList.toggle('bust-narrow', !wide);
}
function resize() {
  const r = canvas.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); layout();
}
new ResizeObserver(resize).observe(canvas);

/* ---------- cycling ---------- */
let order = 0, running = false, started = false, timer = 0, raf = 0, t0 = performance.now();
async function show(i) {
  const m = MODELS[i % MODELS.length];
  let d; try { d = await load(m); } catch (e) { console.warn('lobby bust:', m.id, e); return false; }
  mesh.geometry = d.geo; cur = { m, d }; layout();
  if (credit) credit.textContent = `${m.name} · ${m.credit}`;
  return true;
}
function fade(on) { canvas.classList.toggle('on', on); if (credit) credit.classList.toggle('on', on); }
async function step() {
  if (!running) return;
  const next = (order + 1) % MODELS.length;
  load(MODELS[next]).catch(() => {});                  // fetch while the current one is still on show
  fade(false); await new Promise(r => setTimeout(r, FADE));
  if (await show(next)) order = next;
  if (running) fade(true);
}
let lastDraw = 0;
function frame(now) {
  raf = running ? requestAnimationFrame(frame) : 0;
  if (now - lastDraw < 30) return;            // ~30 fps is plenty for a slow sway and keeps the GPU free for the hall
  lastDraw = now;
  const t = (now - t0) / 1000;
  holder.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.5) * 0.3;          // a gentle turn either side of the front
  holder.rotation.x = reduceMotion ? 0 : Math.sin(t * 0.33 + 1.2) * 0.025;
  renderer.render(scene, camera);
}
async function start() {
  if (running) return; running = true;
  if (!started) {
    started = true;
    if (await show(0)) { resize(); fade(true); }
    // warm the next model once the first is on screen
    setTimeout(() => load(MODELS[1]).catch(() => {}), 1200);
  } else fade(true);
  if (!raf) raf = requestAnimationFrame(frame);
  clearInterval(timer); timer = setInterval(step, PERIOD);
}
function stop() { running = false; clearInterval(timer); if (raf) cancelAnimationFrame(raf); raf = 0; }
function sync() { (document.body.classList.contains('intro-on') && !document.hidden) ? start() : stop(); }
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', sync);
sync();
window.__lobbyBust = { get running() { return running; }, get model() { return MODELS[order].id; } };
