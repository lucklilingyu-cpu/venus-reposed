
/* ---------------------------------------------------------------
   Renderer, camera and model illumination. Visible geometry comes from
   the independent VA_Hall_Scan and interactive sequence groups only.
   Former procedural architecture, pool and cast meshes are not created.
---------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
const isSmall = () => window.innerWidth < 760;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
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

/* ---------- light: sky, a low red bounce from the floor, and the sun through the vault ---------- */
const hemi = new THREE.HemisphereLight(0xf6f3ee, 0x9a6a5e, 0.75);
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
const bounce = new THREE.DirectionalLight(0xffe6d8, 0.55); bounce.position.set(-4, 5, -12); scene.add(bounce); // sunlit north side bouncing onto the shaded south wall


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
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a253, roughness: 0.3, metalness: 1.0, envMapIntensity: 0.7 }),
  tier: new THREE.MeshPhysicalMaterial({ color: 0x6f897c, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.5, clearcoat: 0.8, envMapIntensity: 0.5 }),
  drum: new THREE.MeshPhysicalMaterial({ color: 0xd8cfc1, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
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

