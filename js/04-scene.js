
/* ---------------------------------------------------------------
   Renderer, camera and the hall: the V&A Cast Courts re-built —
   red lower walls behind a cream colonnade with gilded capitals,
   a gallery balcony on consoles, an upper arcade with green niches,
   a glazed barrel vault on iron ribs and trusses. The sun comes in
   through the vault and draws its grid on the walls and the floor.
   The water axis with the sculptures runs down the middle.
---------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const isSmall = () => window.innerWidth < 760;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
const HOME = { pos: new THREE.Vector3(9.4, 3.7, 7.0), target: new THREE.Vector3(-2.8, 1.5, -0.5) };
const HOME_M = { pos: new THREE.Vector3(13.6, 6.4, 7.0), target: new THREE.Vector3(-2, 1.4, -0.6) };
camera.position.copy(isSmall() ? HOME_M.pos : HOME.pos);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(isSmall() ? HOME_M.target : HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.53;
controls.minDistance = 1.6;
controls.maxDistance = 30;
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = 0.32; // (three r160 ignores this; the architecture sets envMapIntensity on its own materials below)

/* daylight sky seen through the glass vault */
(function sky() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#c6d8ea'); gr.addColorStop(0.5, '#e4ebf1'); gr.addColorStop(1, '#f1ece5');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
})();
scene.fog = new THREE.Fog(0xefe7de, 40, 120);

/* hall dimensions (metres). The long walls run along x at z = ±HALL.z. */
const HALL = { x0: -24, x1: 24, z: 9, wallH: 18, galleryY: 8.4, vaultR: 9, vaultRise: 6.4 };

/* ---------- light: sky, a low red bounce from the floor, and the sun through the vault ---------- */
const hemi = new THREE.HemisphereLight(0xf6f3ee, 0x8e4a3f, 0.75);
scene.add(hemi);
const SUN_DIR = new THREE.Vector3(-0.32, 0.86, 0.4).normalize(); // points towards the sun: high (about 60°), from the south-west, so the light falls on the north wall and the water axis
const sun = new THREE.DirectionalLight(0xffefd6, 4.4);
sun.target.position.set(0, 4, 0);
sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 60);
scene.add(sun.target);
sun.castShadow = true;
const SHADOW_RES = isSmall() ? 2048 : 4096; // fine enough for the iron glazing bars to draw sharp lines
sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
sun.shadow.bias = -0.00025;
sun.shadow.normalBias = 0.03;
(function fitSunShadow() { // the shadow camera covers exactly the hall, seen from the sun
  const cam = sun.shadow.camera;
  cam.position.copy(sun.position); cam.lookAt(sun.target.position); cam.updateMatrixWorld();
  const inv = cam.matrixWorld.clone().invert();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity), p = new THREE.Vector3();
  for (const x of [HALL.x0 - 1, HALL.x1 + 1]) for (const y of [-0.8, HALL.wallH + HALL.vaultRise + 0.6]) for (const z of [-HALL.z - 1, HALL.z + 1]) {
    p.set(x, y, z).applyMatrix4(inv); lo.min(p); hi.max(p);
  }
  Object.assign(cam, { left: lo.x, right: hi.x, bottom: lo.y, top: hi.y, near: Math.max(0.5, -hi.z - 1), far: -lo.z + 1 });
  cam.updateProjectionMatrix();
})();
scene.add(sun);
const fillL = new THREE.DirectionalLight(0xe9eef6, 0.35); fillL.position.set(10, 8, 12); scene.add(fillL);
const bounce = new THREE.DirectionalLight(0xffdcc8, 0.55); bounce.position.set(-4, 5, -12); scene.add(bounce); // sunlit north side bouncing onto the shaded south wall


/* composer */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.5, 0.96);
bloom.enabled = false; composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- materials ---------- */
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noiseFill(g, w, h, base, amp, n) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * amp;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,25,20,${a * 0.7})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
/* colours taken from the courts: Pompeian red walls, sage-green upper walls, cream stone, gilding, red mosaic floor */
const COL = { red: '#9b4440', green: '#6e8471', cream: '#ece1cb', dark: '#2c2523', gold: 0xc9a253, iron: 0x7d786f };
// painted stripe bands, drawn bottom-to-top as [height share, colour]
const stripes = (bands) => tex(8, 256, (g, w, h) => {
  const total = bands.reduce((s, b) => s + b[0], 0); let y = h;
  for (const [k, c] of bands) { const bh = k / total * h; g.fillStyle = c; g.fillRect(0, y - bh, w, bh); y -= bh; }
});
const M = {
  red: new THREE.MeshStandardMaterial({ roughness: 0.93, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, COL.red, 0.05, 2600), [10, 2]) }),
  green: new THREE.MeshStandardMaterial({ roughness: 0.93, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, COL.green, 0.045, 2400), [10, 2]) }),
  stone: new THREE.MeshStandardMaterial({ roughness: 0.8, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, COL.cream, 0.05, 1800), [3, 3]) }),
  dark: new THREE.MeshStandardMaterial({ color: COL.dark, roughness: 0.6 }),
  dado: new THREE.MeshStandardMaterial({ roughness: 0.7, map: stripes([[2, '#2c2523'], [1, '#c9a253'], [3, '#4f6a63'], [1, '#c9a253'], [2, '#7d302d']]) }),
  frieze: new THREE.MeshStandardMaterial({ roughness: 0.75, map: stripes([[1, '#e6d8bd'], [1, '#c9a253'], [3, '#5f7a6e'], [1, '#e6d8bd'], [2, '#7f8f7a'], [1, '#c9a253'], [1, '#e6d8bd']]) }),
  floor: new THREE.MeshStandardMaterial({ roughness: 0.74, map: (() => {
    // red chevron mosaic (the courts' zig-zag floor), one texture = 2.4 m
    const t = tex(512, 512, (g, w, h) => {
      const cols = 8, cw = w / cols, rh = cw / 2, tones = ['#a64b3e', '#a2473a', '#963f33', '#7e3229'];
      g.fillStyle = '#4f201b'; g.fillRect(0, 0, w, h);
      for (let c = 0; c < cols; c++) for (let r = -2; r < h / rh + 2; r++) {
        const up = c % 2 === 0, xl = c * cw, xr = xl + cw, y0 = r * rh;
        const yl = up ? y0 + rh : y0, yr = up ? y0 : y0 + rh;
        const base = new THREE.Color(tones[((r % 4) + 4) % 4]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.035);
        g.fillStyle = '#' + base.getHexString();
        g.beginPath(); g.moveTo(xl + 1, yl + 1.2); g.lineTo(xr - 1, yr + 1.2); g.lineTo(xr - 1, yr + rh - 1.2); g.lineTo(xl + 1, yl + rh - 1.2); g.closePath(); g.fill();
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  })() }),
  band: new THREE.MeshStandardMaterial({ roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, map: tex(64, 64, (g, w, h) => {
    noiseFill(g, w, h, '#8d948a', 0.04, 200);
  }, [1, 1]) }),
  bandLine: new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  iron: new THREE.MeshStandardMaterial({ color: COL.iron, roughness: 0.55, metalness: 0.35 }),
  gold: new THREE.MeshStandardMaterial({ color: COL.gold, roughness: 0.3, metalness: 1.0 }),
  glassRoof: new THREE.MeshPhysicalMaterial({ color: 0xe6f0f6, roughness: 0.1, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  windowGlow: new THREE.MeshBasicMaterial({ color: 0xfbf6ec }),
  tier: new THREE.MeshPhysicalMaterial({ color: 0xe9f0ef, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3, clearcoat: 1 }),
  drum: new THREE.MeshPhysicalMaterial({ color: 0xe0d9cf, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  marble: new THREE.MeshPhysicalMaterial({ color: 0xece4da, roughness: 0.5, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xfff0e6), sheenRoughness: 0.8 }),
  poolFloor: new THREE.MeshStandardMaterial({ color: 0xb4cfcd, roughness: 0.6 }),
  coping: new THREE.MeshStandardMaterial({ color: 0xe6ddcf, roughness: 0.55 }),
};
// the room environment only adds a soft fill to the architecture, so the sun and its shadows read clearly
for (const k of ['red', 'green', 'stone', 'dark', 'dado', 'frieze', 'floor', 'band', 'bandLine', 'iron', 'coping', 'poolFloor']) M[k].envMapIntensity = 0.3;
M.gold.envMapIntensity = 0.7;
M.plaster = M.red; M.plasterDeep = M.green; // older names, kept for code that still uses them
const hall = new THREE.Group(); scene.add(hall);

function addMesh(geo, mat, parent = hall, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
  parent.add(m); return m;
}
/* geometry collected per material, merged into one mesh each at the end */
const BUCKET = {};
const put = (k, g) => (BUCKET[k] || (BUCKET[k] = [])).push(g.index ? g.toNonIndexed() : g);
const INST = {}; // instanced parts: key -> world matrices
const putInst = (k, m) => (INST[k] || (INST[k] = [])).push(m);
function strut(a, b, r, segs = 5) { // a cylinder from point a to point b
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/* ---------- floor, pool and water ---------- */
(function floorAndPool() {
  const shape = new THREE.Shape();
  shape.moveTo(HALL.x0, -HALL.z); shape.lineTo(HALL.x1, -HALL.z); shape.lineTo(HALL.x1, HALL.z); shape.lineTo(HALL.x0, HALL.z); shape.lineTo(HALL.x0, -HALL.z);
  const hole = new THREE.Path(); hole.moveTo(-15.5, -3.6); hole.lineTo(-15.5, 3.6); hole.lineTo(15.5, 3.6); hole.lineTo(15.5, -3.6); hole.lineTo(-15.5, -3.6);
  shape.holes.push(hole);
  const fg = new THREE.ShapeGeometry(shape); fg.rotateX(-Math.PI / 2);
  const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.4, uv.getY(i) / 2.4); // world metres → tiles
  addMesh(fg, M.floor);
  // grey stone bands: along the walls and around the pool, each with a thin white line
  const ring = (x0, z0, x1, z1, w) => {
    const s = new THREE.Shape(); s.moveTo(x0 - w, z0 - w); s.lineTo(x1 + w, z0 - w); s.lineTo(x1 + w, z1 + w); s.lineTo(x0 - w, z1 + w); s.lineTo(x0 - w, z0 - w);
    const h = new THREE.Path(); h.moveTo(x0, z0); h.lineTo(x0, z1); h.lineTo(x1, z1); h.lineTo(x1, z0); h.lineTo(x0, z0); s.holes.push(h);
    const g = new THREE.ShapeGeometry(s); g.rotateX(-Math.PI / 2); return g; // symmetric, so the z flip does not matter
  };
  addMesh(ring(-15.8, -3.9, 15.8, 3.9, 0.9).translate(0, 0.004, 0), M.band);
  addMesh(ring(-16.7, -4.8, 16.7, 4.8, 0.06).translate(0, 0.006, 0), M.bandLine);
  addMesh(ring(HALL.x0 + 1.15, -HALL.z + 1.15, HALL.x1 - 1.15, HALL.z - 1.15, 1.15).translate(0, 0.004, 0), M.band);
  addMesh(ring(HALL.x0 + 1.3, -HALL.z + 1.3, HALL.x1 - 1.3, HALL.z - 1.3, 0.06).translate(0, 0.006, 0), M.bandLine);
  // coping and pool walls
  for (const [x, z, w, d] of [[0, -3.75, 31.6, 0.3], [0, 3.75, 31.6, 0.3], [-15.65, 0, 0.3, 7.8], [15.65, 0, 0.3, 7.8]]) {
    addMesh(new THREE.BoxGeometry(w, 0.16, d), M.coping, hall, { cast: true }).position.set(x, 0.02, z);
  }
  const pf = new THREE.PlaneGeometry(31, 7.2); pf.rotateX(-Math.PI / 2);
  addMesh(pf, M.poolFloor).position.y = -0.55;
  // cascade steps at the west end of the pool (sketch)
  for (let i = 0; i < 3; i++) {
    const s = addMesh(new THREE.BoxGeometry(1.2, 0.5 + i * 0.45, 7.2), M.coping, hall, { cast: true });
    s.position.set(-15.2 - i * 1.2, (0.5 + i * 0.45) / 2 - 0.4, 0);
  }
})();
const waterShader = {
  name: 'CastWater',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, time: { value: 0 } },
  vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vUv = textureMatrix * vec4(position,1.0); vW = (modelMatrix*vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; varying vec4 vUv; varying vec3 vW;
    #include <logdepthbuf_pars_fragment>
    void main(){
      #include <logdepthbuf_fragment>
      float n = sin(vW.x*1.7+time*0.9)*0.5 + sin(vW.z*2.3-time*1.1)*0.5 + sin((vW.x+vW.z)*3.1+time*1.7)*0.25;
      vec4 uv = vUv; uv.xy += n*0.03*uv.w;
      vec4 base = texture2DProj(tDiffuse, uv);
      vec3 water = vec3(0.5,0.68,0.7);
      vec3 c = mix(base.rgb*0.82, water, 0.46) + vec3(0.05)*pow(max(n,0.0),3.0);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
const water = new Reflector(new THREE.PlaneGeometry(31, 7.2), {
  shader: waterShader, color: 0x9fdcdc, clipBias: 0.003, multisample: 0,
  textureWidth: Math.floor(window.innerWidth * 0.5), textureHeight: Math.floor(window.innerHeight * 0.5),
});
water.rotation.x = -Math.PI / 2; water.position.y = -0.12;
scene.add(water);

/* ---------- the four walls ----------
   Each wall is built as an elevation in its own frame: u along the wall, y up, w from the wall face into the room.
   Lower storey: red wall, dark skirting, striped dado, detached columns (red lower third, cream shaft, gilded capital).
   Entablature with a painted frieze, consoles, the gallery balcony and its balustrade.
   Upper storey: cream arcade with green niches, top cornice with dentils. */
const WALLS = [
  { L: 48, bays: 10, cols: [-19.2, -14.4, -9.6, -4.8, 0, 4.8, 9.6, 14.4, 19.2], m: new THREE.Matrix4().makeTranslation(0, 0, -HALL.z), painting: true }, // north
  { L: 48, bays: 10, cols: [-19.2, -14.4, -9.6, -4.8, 0, 4.8, 9.6, 14.4, 19.2], m: new THREE.Matrix4().makeTranslation(0, 0, HALL.z).multiply(new THREE.Matrix4().makeRotationY(Math.PI)) }, // south
  { L: 18, bays: 4, cols: [-4.5, 0, 4.5], m: new THREE.Matrix4().makeTranslation(HALL.x0, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)) }, // west
  { L: 18, bays: 4, cols: [-4.5, 0, 4.5], m: new THREE.Matrix4().makeTranslation(HALL.x1, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)) }, // east
];
const G = HALL.galleryY, UP = 17.07; // gallery floor, top of the upper storey
const BAL_W = 1.85; // balustrade distance from the wall face
(function walls() {
  // shared part shapes (built once, cloned per use)
  const balusterGeo = new THREE.LatheGeometry([[0, 0], [0.085, 0], [0.085, 0.05], [0.055, 0.09], [0.05, 0.13], [0.082, 0.25], [0.092, 0.33], [0.07, 0.45], [0.044, 0.55], [0.058, 0.6], [0.08, 0.64], [0.08, 0.68], [0, 0.68]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const consoleGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0, 0.39); s.lineTo(0.8, 0.39); s.lineTo(0.8, 0.29);
    s.bezierCurveTo(0.55, 0.29, 0.4, 0.22, 0.32, 0.06); s.lineTo(0.22, 0); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false, curveSegments: 8 });
    g.rotateY(-Math.PI / 2); g.translate(0.11, 0, 0); // profile in the (w, y) plane, 0.22 thick along u
    return g;
  })();
  const archFrame = (w, h, openW, spring) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    const r = openW / 2, p = new THREE.Path();
    p.moveTo(-r, 0.001); p.lineTo(-r, spring); p.absarc(0, spring, r, Math.PI, 0, true); p.lineTo(r, 0.001); p.lineTo(-r, 0.001);
    s.holes.push(p);
    return new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: false, curveSegments: 20 });
  };
  const m4 = new THREE.Matrix4();
  for (const W of WALLS) {
    const P = (k, g) => put(k, g.applyMatrix4(W.m));
    const box = (k, sx, sy, sz, u, y, w) => P(k, new THREE.BoxGeometry(sx, sy, sz).translate(u, y, w));
    const cyl = (k, rt, rb, h, u, y, w, seg = 28) => P(k, new THREE.CylinderGeometry(rt, rb, h, seg).translate(u, y, w));
    const ring = (k, R, t, u, y, w) => P(k, new THREE.TorusGeometry(R, t, 8, 40).rotateX(Math.PI / 2).translate(u, y, w));
    const inst = (k, u, y, w) => putInst(k, W.m.clone().multiply(m4.makeTranslation(u, y, w)));
    const L = W.L, bayW = L / W.bays;
    // back walls: red below the gallery, green above (a little longer than the wall so the corners close)
    box('red', L + 0.8, G, 0.4, 0, G / 2, -0.2);
    box('green', L + 0.8, HALL.wallH - G, 0.4, 0, G + (HALL.wallH - G) / 2, -0.2);
    // skirting and painted dado
    box('dark', L, 0.55, 0.08, 0, 0.275, 0.04);
    box('dado', L, 0.28, 0.05, 0, 0.69, 0.025);
    // detached columns
    const cw = 0.56;
    for (const u of W.cols) {
      box('dark', 1.0, 0.42, 1.0, u, 0.21, cw);
      ring('gold', 0.46, 0.055, u, 0.47, cw);
      cyl('red', 0.42, 0.44, 2.05, u, 0.52 + 1.025, cw);
      ring('gold', 0.43, 0.035, u, 2.6, cw);
      cyl('stone', 0.37, 0.42, 4.1, u, 2.62 + 2.05, cw);
      ring('gold', 0.385, 0.04, u, 6.62, cw);
      cyl('gold', 0.56, 0.38, 0.2, u, 6.8, cw);
      box('gold', 1.16, 0.1, 1.16, u, 6.95, cw);
    }
    // entablature: architrave, painted frieze, consoles, gallery slab
    box('stone', L, 0.32, 1.2, 0, 7.16, 0.6);
    box('frieze', L, 0.4, 1.08, 0, 7.52, 0.54);
    for (let u = -L / 2 + 0.6; u <= L / 2 - 0.55; u += 1.2) P('stone', consoleGeo.clone().translate(u, 7.72, 1.08));
    box('stone', L, 0.3, 2.06, 0, 8.26, 1.03);
    box('gold', L, 0.035, 0.02, 0, 8.13, 2.07);
    // balustrade (stops where it meets the balustrade of the next wall)
    const bl = L / 2 - BAL_W;
    box('stone', bl * 2 + 0.36, 0.14, 0.36, 0, 8.48, BAL_W);
    box('stone', bl * 2 + 0.36, 0.12, 0.38, 0, 9.3, BAL_W);
    const posts = [-bl, bl];
    for (let b = 1; b < W.bays; b++) { const u = -L / 2 + b * bayW; if (Math.abs(u) < bl - 0.3) posts.push(u); }
    for (const u of posts) box('stone', 0.36, 0.86, 0.4, u, 8.85, BAL_W);
    for (let u = -bl + 0.3; u <= bl - 0.25; u += 0.3) if (!posts.some(q => Math.abs(q - u) < 0.3)) inst('baluster', u, 8.55, BAL_W);
    // upper arcade
    const openW = bayW * 0.6, spring = 4.9, archTop = G + spring + openW / 2;
    for (let b = 0; b < W.bays; b++) {
      const u = -L / 2 + bayW * (b + 0.5);
      if (W.painting && Math.abs(u) < bayW) continue; // the two middle bays of the north wall hold the concept sketch
      P('stone', archFrame(bayW, UP - G, openW, spring).translate(u, G, 0));
      P('stone', new THREE.TorusGeometry(openW / 2 + 0.13, 0.085, 6, 28, Math.PI).translate(u, G + spring, 0.43));
      box('stone', 0.42, 0.72, 0.24, u, archTop + 0.14, 0.5);
      for (const s of [-1, 1]) box('stone', 0.42, 0.16, 0.14, u + s * (openW / 2 + 0.22), G + spring, 0.47);
      box('stone', openW + 0.1, 0.12, 0.3, u, G + 0.06, 0.15); // sill
    }
    for (let b = 0; b <= W.bays; b++) { // pilaster strips between the bays
      const u = -L / 2 + b * bayW; if (W.painting && Math.abs(u) < bayW - 0.1) continue;
      box('stone', 0.5, UP - G, 0.12, u, G + (UP - G) / 2, 0.48);
    }
    if (W.painting) { // a plain green field with a cream moulding for the sketch
      const fw = bayW * 2 - 0.9, fh = UP - G - 1.0, fy = G + 0.5 + fh / 2;
      for (const [u, y, sx, sy] of [[0, fy + fh / 2, fw + 0.2, 0.2], [0, fy - fh / 2, fw + 0.2, 0.2], [-fw / 2, fy, 0.2, fh], [fw / 2, fy, 0.2, fh]]) box('stone', sx, sy, 0.16, u, y, 0.08);
    }
    // top cornice: frieze band, dentils, crown
    box('stone', L, 0.55, 0.5, 0, UP + 0.275, 0.25);
    for (let u = -L / 2 + 0.16; u <= L / 2 - 0.16; u += 0.32) inst('dentil', u, UP + 0.66, 0.6);
    box('stone', L, 0.34, 0.98, 0, UP + 0.93, 0.49);
  }
  // merge everything that was collected above
  const MAT = { red: M.red, green: M.green, stone: M.stone, dark: M.dark, dado: M.dado, frieze: M.frieze, gold: M.gold };
  for (const k in MAT) if (BUCKET[k]) addMesh(mergeGeometries(BUCKET[k]), MAT[k], hall, { cast: true });
  const instMesh = (geo, mat, list) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true; im.receiveShadow = true; hall.add(im); return im;
  };
  instMesh(balusterGeo, M.stone, INST.baluster);
  instMesh(new THREE.BoxGeometry(0.17, 0.2, 0.16), M.stone, INST.dentil);
})();

/* ---------- glazed barrel vault: iron ribs every 1.2 m, lattice trusses every 4.8 m, purlins every metre ---------- */
(function vault() {
  const R = HALL.vaultR, H = HALL.vaultRise, Y = HALL.wallH, Lx = HALL.x1 - HALL.x0;
  const glass = new THREE.CylinderGeometry(R, R, Lx, 96, 1, true, 0, Math.PI);
  glass.rotateZ(Math.PI / 2); glass.scale(1, H / R, 1); glass.translate(0, Y, 0);
  addMesh(glass, M.glassRoof, hall, { receive: false });
  const ell = (phi, inset) => new THREE.Vector3(0, Y + (H - inset) * Math.sin(phi), (R - inset) * Math.cos(phi));
  const arc = (x, inset, r) => new THREE.TorusGeometry(R - inset, r, 5, 80, Math.PI).rotateY(Math.PI / 2).scale(1, (H - inset) / (R - inset), 1).translate(x, Y, 0);
  const iron = [];
  for (let k = 0; k <= 40; k++) {
    const x = HALL.x0 + k * 1.2, main = k % 4 === 0;
    iron.push(arc(x, 0.08, main ? 0.12 : 0.055));
    if (main && k > 0 && k < 40) { // lattice truss under the main rib
      iron.push(arc(x, 0.8, 0.06));
      const N = 18;
      for (let j = 0; j < N; j++) {
        const a = ell(Math.PI * j / N, j % 2 ? 0.8 : 0.08), b = ell(Math.PI * (j + 1) / N, j % 2 ? 0.08 : 0.8);
        a.x = b.x = x; iron.push(strut(a, b, 0.035));
      }
    }
  }
  // purlins spaced by arc length
  const S = 2000, cum = [0];
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + ell(Math.PI * i / S, 0.1).distanceTo(ell(Math.PI * (i - 1) / S, 0.1)));
  const total = cum[S], n = Math.round(total / 1.0);
  for (let p = 1; p < n; p++) {
    const s = total * p / n; let i = 1; while (cum[i] < s) i++;
    const c = ell(Math.PI * i / S, 0.1);
    iron.push(new THREE.BoxGeometry(Lx, 0.08, 0.1).translate(0, c.y, c.z));
  }
  iron.push(new THREE.BoxGeometry(Lx, 0.16, 0.3).translate(0, Y + H - 0.05, 0)); // ridge
  addMesh(mergeGeometries(iron.map(g => g.index ? g.toNonIndexed() : g)), M.iron, hall, { cast: true, receive: false });

  // the two end lunettes: cream frame, fan window with radiating iron bars
  const a2 = R - 0.75, b2 = H - 0.75, y0 = 0.35;
  for (const side of [-1, 1]) {
    const rot = new THREE.Matrix4().makeTranslation(side > 0 ? HALL.x1 - 0.02 : HALL.x0 + 0.02, Y, 0).multiply(new THREE.Matrix4().makeRotationY(side > 0 ? -Math.PI / 2 : Math.PI / 2));
    const frame = new THREE.Shape(); frame.moveTo(R + 0.3, 0); frame.absellipse(0, 0, R + 0.3, H + 0.3, 0, Math.PI, false); frame.lineTo(R + 0.3, 0);
    const hole = new THREE.Path(); hole.moveTo(a2, y0); hole.absellipse(0, y0, a2, b2 - y0, 0, Math.PI, false); hole.lineTo(a2, y0);
    frame.holes.push(hole);
    addMesh(new THREE.ExtrudeGeometry(frame, { depth: 0.3, bevelEnabled: false, curveSegments: 40 }).applyMatrix4(rot), M.stone, hall, { cast: true });
    const glow = new THREE.Shape(); glow.moveTo(a2, y0); glow.absellipse(0, y0, a2, b2 - y0, 0, Math.PI, false); glow.lineTo(a2, y0);
    addMesh(new THREE.ShapeGeometry(glow, 40).applyMatrix4(rot), M.windowGlow, hall, { receive: false });
    const bars = [];
    const c0 = new THREE.Vector3(0, y0, 0.12);
    for (let k = 1; k < 8; k++) { const t = Math.PI * k / 8; bars.push(strut(c0, new THREE.Vector3(a2 * Math.cos(t), y0 + (b2 - y0) * Math.sin(t), 0.12), 0.06)); }
    for (const f of [0.38, 0.7]) bars.push(new THREE.TorusGeometry(a2 * f, 0.06, 5, 48, Math.PI).scale(1, (b2 - y0) / a2, 1).translate(0, y0, 0.12));
    bars.push(new THREE.BoxGeometry(a2 * 2, 0.14, 0.14).translate(0, y0, 0.12));
    addMesh(mergeGeometries(bars.map(g => (g.index ? g.toNonIndexed() : g).applyMatrix4(rot))), M.iron, hall, { cast: true });
  }
})();

/* ---------- sunbeams: faint shafts along the sun direction, striped by the glazing bars ---------- */
(function sunbeams() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fff3df'; g.fillRect(0, 0, 128, 512);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.6)'; for (let y = 10; y < 512; y += 44) g.fillRect(0, y, 128, 6);
  g.fillStyle = 'rgba(0,0,0,0.4)'; for (let x = 20; x < 128; x += 38) g.fillRect(x, 0, 4, 512);
  g.globalCompositeOperation = 'destination-in';
  const gh = g.createLinearGradient(0, 0, 128, 0);
  gh.addColorStop(0, 'rgba(0,0,0,0)'); gh.addColorStop(0.3, 'rgba(0,0,0,1)'); gh.addColorStop(0.7, 'rgba(0,0,0,1)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gh; g.fillRect(0, 0, 128, 512);
  const gv = g.createLinearGradient(0, 0, 0, 512);
  gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.18, 'rgba(0,0,0,1)'); gv.addColorStop(0.8, 'rgba(0,0,0,0.55)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gv; g.fillRect(0, 0, 128, 512);
  const st = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const y = SUN_DIR.clone(), view = new THREE.Vector3(0.55, 0, 0.83);
  const z = view.sub(y.clone().multiplyScalar(view.dot(y))).normalize(), x = new THREE.Vector3().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  const len = 21 / SUN_DIR.y;
  for (const [fx, fz, w] of [[-15, -5.4, 2.6], [-6.5, -6.2, 2.0], [2.5, -5.0, 2.8], [11, -6.0, 2.2], [18, -5.2, 2.4]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
    p.quaternion.copy(q);
    p.position.set(fx, 0, fz).addScaledVector(SUN_DIR, len / 2);
    p.renderOrder = 2;
    hall.add(p);
  }
})();

/* ---------- the concept sketch, hung like the courts' painted copies ---------- */
const sketchImg = new Image();
const sketchTex = new THREE.Texture(sketchImg);
sketchTex.colorSpace = THREE.SRGBColorSpace;
sketchImg.onload = () => { sketchTex.needsUpdate = true; };
sketchImg.src = SKETCH_SRC;
(function painting() {
  const w = 7.8, h = w * 941 / 1672, y = G + (UP - G) / 2 + 0.15, z = -HALL.z + 0.34;
  const mat = new THREE.MeshStandardMaterial({ map: sketchTex, roughness: 0.85, emissive: 0xffffff, emissiveMap: sketchTex, emissiveIntensity: 0.1 });
  const p = addMesh(new THREE.PlaneGeometry(w, h), mat);
  p.position.set(0, y, z);
  const fr = [];
  for (const [fx, fy, fw, fh] of [[0, h / 2 + 0.13, w + 0.52, 0.26], [0, -h / 2 - 0.13, w + 0.52, 0.26], [-w / 2 - 0.13, 0, 0.26, h], [w / 2 + 0.13, 0, 0.26, h]]) {
    fr.push(new THREE.BoxGeometry(fw, fh, 0.16).translate(fx, y + fy, z - 0.02));
  }
  addMesh(mergeGeometries(fr), M.gold, hall, { cast: true });
  const lab = tex(1024, 96, (g, W, H) => {
    g.fillStyle = '#f3ede2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#232323'; g.font = '600 40px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.fillText('VENUS, RE-POSED', W / 2, 46);
    g.fillStyle = '#6f6f6f'; g.font = '26px "Noto Sans SC", sans-serif'; g.fillText('概念草图 · 组内绘制 · 以“画作复制品”的方式挂在北墙', W / 2, 82);
  });
  const lp = addMesh(new THREE.PlaneGeometry(3.2, 0.3), new THREE.MeshBasicMaterial({ map: lab }), hall, { receive: false });
  lp.position.set(0, y - h / 2 - 0.42, z + 0.02);
})();

/* pose glyphs (used by the interface icons) */
const floaters = [];
function drawPoseIcon(g, cls, x, y, size, opts = {}) {
  const pose = buildPose(CANON[cls]);
  const J = pose.joints, b = pose.bounds;
  const side = cls === 'walking' || cls === 'seated' || cls === 'crouching';
  const px = (p) => side ? p.z : p.x;
  const minx = side ? b.min.z : b.min.x, maxx = side ? b.max.z : b.max.x;
  const span = Math.max(maxx - minx, b.max.y - b.min.y);
  const s = size / span;
  const cx = (minx + maxx) / 2, cy = (b.min.y + b.max.y) / 2;
  const P = (p) => [x + (px(p) - cx) * s, y - (p.y - cy) * s];
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = opts.color || '#3a2930'; g.lineWidth = opts.width || Math.max(1.5, size * 0.07);
  g.beginPath();
  for (const [a, c] of pose.bones) { const A = P(J[a]), C = P(J[c]); g.moveTo(A[0], A[1]); g.lineTo(C[0], C[1]); }
  g.stroke();
  if (!POSES[CANON[cls]].noHead) { const H = P(J.head); g.beginPath(); g.arc(H[0], H[1], size * 0.075, 0, 7); g.fillStyle = g.strokeStyle; g.fill(); }
}

/* soft additive light for beams */
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
