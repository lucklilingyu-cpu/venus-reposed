
/* ---------------------------------------------------------------
   Renderer, camera and model illumination. Visible geometry comes from
   the independent VA_Hall_Scan, perimeter enclosure and sequence groups.
   Former procedural architecture, pool and cast meshes are not created.
---------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
const isSmall = () => window.innerWidth < 760;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // see frame() in 10-main.js
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
const HOME = { pos: new THREE.Vector3(15.2, 7.6, 6.9), target: new THREE.Vector3(-2.5, 0.4, -0.8) }; // high enough to read the chessboard of plinths
const HOME_M = { pos: new THREE.Vector3(17.5, 10.5, 6.9), target: new THREE.Vector3(-2, 0.3, -0.8) };
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

// Transparent canvas; environment above remains for material lighting only.
scene.background = null; scene.fog = null;
renderer.setClearColor(0xffffff, 0);

/* hall dimensions (metres). The long walls run along x at z = ±HALL.z. */
const HALL = { x0: -24, x1: 24, z: 9, wallH: 18, galleryY: 8.4, vaultR: 9, vaultRise: 6.4 };
/* An independent enclosure around the scan, added at the group's request.
   It does not reintroduce or alter the removed procedural museum or scan geometry. */
const ExhibitionEnvelope = (() => {
  const bounds = { x0: HALL.x0 - 2, x1: HALL.x1 + 2, z0: -13, z1: 13, height: HALL.wallH + HALL.vaultRise };
  const group = new THREE.Group(); group.name = 'venus-exhibition-envelope';
  group.userData.bounds = bounds;
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.3 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x4d595b, roughness: 0.8, metalness: 0.15, envMapIntensity: 0.2 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb8cbd0, roughness: 0.25, metalness: 0,
    transparent: true, opacity: 0.28, transmission: 0.35, thickness: 0.14, ior: 1.45,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.18 });
  function box(name, width, height, depth, x, y, z, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = shadow;
    group.add(mesh); return mesh;
  }
  const width = bounds.x1 - bounds.x0, depth = bounds.z1 - bounds.z0, height = bounds.height;
  // A continuous vertical colour blend, without wall textures, seams or roof-grid shadows.
  const lowerWallColor = new THREE.Color(0x89938a), whiteWallColor = new THREE.Color(0xffffff);
  function wall(name, w, d, x, z) {
    const geometry = new THREE.BoxGeometry(w, height, d, 1, 48, 1);
    const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i) + height / 2;
      const blend = THREE.MathUtils.smoothstep(y, 4, 14);
      color.copy(lowerWallColor).lerp(whiteWallColor, blend).toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.name = name; mesh.position.set(x, height / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = false;
    group.add(mesh);
  }
  for (const z of [bounds.z0, bounds.z1]) wall('perimeter-long-wall', width + 0.38, 0.38, 0, z);
  for (const x of [bounds.x0, bounds.x1]) wall('perimeter-end-wall', 0.38, depth, x, 0);
  box('glass-roof', width, 0.14, depth, 0, height + 0.07, 0, glassMaterial, false);
  for (const z of [bounds.z0, bounds.z1]) box('roof-edge-frame', width, 0.16, 0.12, 0, height + 0.16, z, frameMaterial);
  for (const x of [bounds.x0, bounds.x1]) box('roof-edge-frame', 0.12, 0.16, depth, x, height + 0.16, 0, frameMaterial);
  for (let x = bounds.x0 + 4; x < bounds.x1; x += 4) box('roof-glazing-bar', 0.07, 0.12, depth, x, height + 0.15, 0, frameMaterial);
  box('roof-central-bar', width, 0.12, 0.07, 0, height + 0.15, 0, frameMaterial);
  const day = new THREE.Color(0xb4bec2), night = new THREE.Color(0x111b2b), background = day.clone();
  function setNight(value) { background.copy(day).lerp(night, value); }
  scene.add(group); scene.background = background; renderer.setClearColor(background, 1);
  canvas.dataset.enclosureHeight = String(height);
  return { group, bounds, background, setNight };
})();

/* ---------- Venus mosaic: a quiet, hand-laid floor for the sculpture court ----------
   Warm limestone, faded terracotta and sage inlay echo the hall's existing palette.
   The low-contrast rosettes recall antique floor mosaics without competing with the casts. */
function makeVenusMosaic() {
  const canvas = document.createElement('canvas');
  canvas.width = 1536; canvas.height = 432;
  const ctx = canvas.getContext('2d');
  const cols = 32, rows = 9, cw = canvas.width / cols, ch = canvas.height / rows;
  const stone = ['#c6a38c', '#b98d78', '#cfb69a', '#a8ad97'];
  ctx.fillStyle = '#927365'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = col * cw, y = row * ch;
    ctx.fillStyle = stone[(col * 7 + row * 3) % stone.length];
    ctx.fillRect(x + 2.5, y + 2.5, cw - 5, ch - 5);
    // Small four-petal rosettes repeat at measured intervals through the stone grid.
    if (col % 4 === 2 && row % 3 === 1) {
      ctx.save(); ctx.translate(x + cw / 2, y + ch / 2);
      for (let petal = 0; petal < 4; petal++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(4.4, -9.5); ctx.lineTo(0, -15);
        ctx.lineTo(-4.4, -9.5); ctx.closePath();
        ctx.fillStyle = petal % 2 ? '#875b50' : '#5e7162'; ctx.globalAlpha = 0.86; ctx.fill();
      }
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#a27a42';
      ctx.beginPath(); ctx.moveTo(0, -3.2); ctx.lineTo(3.2, 0); ctx.lineTo(0, 3.2); ctx.lineTo(-3.2, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  // Double inlaid border: faded rose stone framed by deep sage.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#5e7162'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.strokeStyle = '#986956'; ctx.lineWidth = 5; ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const group = new THREE.Group(); group.name = 'venus-mosaic-floor';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(33.4, 9.6), new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.035, 0);
  floor.receiveShadow = true;
  group.add(floor); scene.add(group);
  return group;
}
const venusMosaicFloor = makeVenusMosaic();

/* ---------- light: sky, a low red bounce from the floor, and the sun through the vault ---------- */
const hemi = new THREE.HemisphereLight(0xf6f3ee, 0x9a6a5e, 0.45);
scene.add(hemi);
const SUN_DIR = new THREE.Vector3(-0.32, 0.86, 0.4).normalize(); // points towards the sun: high (about 60°), from the south-west, so the light falls on the north wall and the water axis
const sun = new THREE.DirectionalLight(0xffefd6, 1.8);
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
  for (const x of [ExhibitionEnvelope.bounds.x0 - 1, ExhibitionEnvelope.bounds.x1 + 1]) for (const y of [-0.8, ExhibitionEnvelope.bounds.height + 0.6]) for (const z of [ExhibitionEnvelope.bounds.z0 - 1, ExhibitionEnvelope.bounds.z1 + 1]) {
    p.set(x, y, z).applyMatrix4(inv); lo.min(p); hi.max(p);
  }
  Object.assign(cam, { left: lo.x, right: hi.x, bottom: lo.y, top: hi.y, near: Math.max(0.5, -hi.z - 1), far: -lo.z + 1 });
  cam.updateProjectionMatrix();
})();
scene.add(sun);
const fillL = new THREE.DirectionalLight(0xe9eef6, 0.22); fillL.position.set(10, 8, 12); scene.add(fillL);
const bounce = new THREE.DirectionalLight(0xffe6d8, 0.2); bounce.position.set(-4, 5, -12); scene.add(bounce); // gentle reflected floor light


/* composer */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.5, 0.96);
bloom.enabled = false;
// Add bloom RGB without making empty transparent pixels opaque at night.
bloom.blendMaterial.blending = THREE.CustomBlending;
bloom.blendMaterial.blendEquation = THREE.AddEquation;
bloom.blendMaterial.blendSrc = THREE.OneFactor;
bloom.blendMaterial.blendDst = THREE.OneFactor;
bloom.blendMaterial.blendEquationAlpha = THREE.AddEquation;
bloom.blendMaterial.blendSrcAlpha = THREE.ZeroFactor;
bloom.blendMaterial.blendDstAlpha = THREE.OneFactor;
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* Only shared interactive-plinth materials remain. No procedural space geometry. */
const M = {
  tier: new THREE.MeshPhysicalMaterial({ color: 0x6f897c, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.5, clearcoat: 0.8, envMapIntensity: 0.5 }),
};
// Retained debug/lifecycle handle, deliberately detached and empty.
const hall = new THREE.Group(); hall.name = 'removed-procedural-space';
hall.userData.source = 'website-procedural-space';
const Architecture = createArchitectureDisplay(hall, renderer);
Architecture.apply();
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

