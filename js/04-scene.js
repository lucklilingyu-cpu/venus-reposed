
/* ---------------------------------------------------------------
   Renderer, camera, the hall (V&A West Cast Court, re-imagined
   through the concept sketch: rose walls, glass vault, water)
---------------------------------------------------------------- */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const isSmall = () => window.innerWidth < 760;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
const HOME = { pos: new THREE.Vector3(9.4, 3.7, 7.0), target: new THREE.Vector3(-2.8, 1.5, -0.5) };
const HOME_M = { pos: new THREE.Vector3(12.5, 6.2, 8.4), target: new THREE.Vector3(-2, 1.4, -0.4) };
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
scene.environmentIntensity = 0.4;

/* sky behind the glass vault */
(function sky() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ecebea'); gr.addColorStop(0.55, '#f6f4f1'); gr.addColorStop(1, '#efebe6');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
})();
scene.fog = new THREE.Fog(0xf1eee9, 34, 110);

const hemi = new THREE.HemisphereLight(0xffffff, 0xc9bfb2, 0.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e8, 3.1);
sun.position.set(-7, 15, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 9, bottom: -9, near: 4, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
const fillL = new THREE.DirectionalLight(0xeef2f8, 0.55); fillL.position.set(-10, 8, 12); scene.add(fillL);


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
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(90,40,50,${a * 0.6})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const M = {
  plaster: new THREE.MeshStandardMaterial({ color: 0xd2c7ba, roughness: 0.95, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, '#f4eee8', 0.035, 2000), [6, 4]) }),
  plasterDeep: new THREE.MeshStandardMaterial({ color: 0xc4b8aa, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xe9e3da, roughness: 0.82, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, '#f6eee4', 0.05, 1800), [3, 3]) }),
  floor: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.0, map: tex(512, 512, (g, w, h) => {
    g.fillStyle = '#efe7e1'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#ebe6df' : '#f3f0eb'; g.fillRect(x * 64, y * 64, 64, 64);
      g.strokeStyle = 'rgba(120,110,100,.14)'; g.strokeRect(x * 64 + .5, y * 64 + .5, 63, 63);
    }
  }, [12, 4]) }),
  iron: new THREE.MeshStandardMaterial({ color: 0x77707c, roughness: 0.45, metalness: 0.6 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9ad74, roughness: 0.32, metalness: 1.0 }),
  glassRoof: new THREE.MeshPhysicalMaterial({ color: 0xe9f3f8, roughness: 0.08, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  windowGlow: new THREE.MeshBasicMaterial({ color: 0xfbf8f4 }),
  tier: new THREE.MeshPhysicalMaterial({ color: 0xe9f0ef, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3, clearcoat: 1 }),
  drum: new THREE.MeshPhysicalMaterial({ color: 0xe0d9cf, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
  marble: new THREE.MeshPhysicalMaterial({ color: 0xece4da, roughness: 0.5, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55, sheen: 0.35, sheenColor: new THREE.Color(0xfff0e6), sheenRoughness: 0.8 }),
  poolFloor: new THREE.MeshStandardMaterial({ color: 0xb9d3d1, roughness: 0.6 }),
};
const hall = new THREE.Group(); scene.add(hall);
const HALL = { x0: -24, x1: 24, z: 9, wallH: 18, vaultR: 9, galleryY: 8 };

function addMesh(geo, mat, parent = hall, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
  parent.add(m); return m;
}
/* floor, pool and water */
(function floorAndPool() {
  const W = HALL.x1 - HALL.x0, D = HALL.z * 2;
  const shape = new THREE.Shape();
  shape.moveTo(HALL.x0, -HALL.z); shape.lineTo(HALL.x1, -HALL.z); shape.lineTo(HALL.x1, HALL.z); shape.lineTo(HALL.x0, HALL.z); shape.lineTo(HALL.x0, -HALL.z);
  const hole = new THREE.Path(); hole.moveTo(-15.5, -3.6); hole.lineTo(-15.5, 3.6); hole.lineTo(15.5, 3.6); hole.lineTo(15.5, -3.6); hole.lineTo(-15.5, -3.6);
  shape.holes.push(hole);
  const fg = new THREE.ShapeGeometry(shape); fg.rotateX(-Math.PI / 2);
  // ShapeGeometry uvs are in world units; scale for the tile map
  const uv = fg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / W, uv.getY(i) / D);
  addMesh(fg, M.floor);
  // coping and pool walls
  const cope = new THREE.MeshStandardMaterial({ color: 0xf4ece4, roughness: 0.55 });
  for (const [x, z, w, d] of [[0, -3.75, 31.6, 0.3], [0, 3.75, 31.6, 0.3], [-15.65, 0, 0.3, 7.8], [15.65, 0, 0.3, 7.8]]) {
    addMesh(new THREE.BoxGeometry(w, 0.16, d), cope).position.set(x, 0.02, z);
  }
  const pf = new THREE.PlaneGeometry(31, 7.2); pf.rotateX(-Math.PI / 2);
  addMesh(pf, M.poolFloor).position.y = -0.55;
  // cascade steps at the west end of the pool (sketch)
  for (let i = 0; i < 3; i++) {
    const s = addMesh(new THREE.BoxGeometry(1.2, 0.5 + i * 0.45, 7.2), M.stone, hall, { cast: true });
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
      vec3 water = vec3(0.62,0.76,0.76);
      vec3 c = mix(base.rgb*0.9, water, 0.38) + vec3(0.05)*pow(max(n,0.0),3.0);
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

/* long walls with a two-storey arcade, gallery and balustrade */
(function walls() {
  const lowFrames = [], upFrames = [], backs = [], glows = [], slabs = [], ball = [];
  const bayW = 4.8, nBays = 10;
  const archFrame = (w, h, openW, spring) => {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    const r = openW / 2, p = new THREE.Path();
    p.moveTo(-r, 0.001); p.lineTo(-r, spring); p.absarc(0, spring, r, Math.PI, 0, true); p.lineTo(r, 0.001); p.lineTo(-r, 0.001);
    s.holes.push(p);
    return new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false, curveSegments: 16 });
  };
  for (const side of [-1, 1]) {
    const z = side * HALL.z;
    // plaster back wall
    const wall = new THREE.BoxGeometry(HALL.x1 - HALL.x0, HALL.wallH, 0.4);
    wall.translate(0, HALL.wallH / 2, z + side * 0.2);
    backs.push(wall);
    for (let b = 0; b < nBays; b++) {
      const x = HALL.x0 + bayW / 2 + b * bayW;
      const f = archFrame(bayW, HALL.galleryY, 3.3, 4.6);
      if (side > 0) f.rotateY(Math.PI);
      f.translate(x, 0, z);
      lowFrames.push(f);
      for (const u of [-1, 1]) {
        const g = archFrame(bayW / 2, HALL.wallH - HALL.galleryY - 1.6, 1.25, 3.6);
        if (side > 0) g.rotateY(Math.PI);
        g.translate(x + u * bayW / 4, HALL.galleryY + 0.25, z);
        upFrames.push(g);
        const gl = new THREE.PlaneGeometry(1.2, 4.1);
        if (side > 0) gl.rotateY(Math.PI);
        gl.translate(x + u * bayW / 4, HALL.galleryY + 0.25 + 2.3, z - side * 0.02);
        glows.push(gl);
      }
    }
    // gallery slab, parapet rail and balusters
    const slab = new THREE.BoxGeometry(HALL.x1 - HALL.x0, 0.35, 1.7); slab.translate(0, HALL.galleryY, z - side * 1.25); slabs.push(slab);
    const rail = new THREE.BoxGeometry(HALL.x1 - HALL.x0, 0.12, 0.22); rail.translate(0, HALL.galleryY + 1.05, z - side * 2.0); slabs.push(rail);
    for (let x = HALL.x0 + 0.3; x < HALL.x1; x += 0.36) ball.push([x, HALL.galleryY + 0.6, z - side * 2.0]);
    const corn = new THREE.BoxGeometry(HALL.x1 - HALL.x0, 0.6, 1.0); corn.translate(0, HALL.wallH - 0.3, z - side * 0.3); slabs.push(corn);
    const dent = new THREE.BoxGeometry(HALL.x1 - HALL.x0, 0.22, 0.7); dent.translate(0, HALL.wallH - 0.75, z - side * 0.2); slabs.push(dent);
  }
  addMesh(mergeGeometries(backs), M.plaster);
  addMesh(mergeGeometries(lowFrames), M.stone, hall, { cast: true });
  addMesh(mergeGeometries(upFrames), M.stone);
  addMesh(mergeGeometries(glows), M.windowGlow, hall, { receive: false });
  addMesh(mergeGeometries(slabs), M.stone, hall, { cast: true });
  const bg = new THREE.CylinderGeometry(0.07, 0.09, 0.85, 8);
  const bal = new THREE.InstancedMesh(bg, M.stone, ball.length);
  const m4 = new THREE.Matrix4();
  ball.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); bal.setMatrixAt(i, m4); });
  hall.add(bal);
  // east end wall with lunette
  const east = new THREE.BoxGeometry(0.4, HALL.wallH, HALL.z * 2); east.translate(HALL.x1 + 0.2, HALL.wallH / 2, 0);
  addMesh(east, M.plaster);
  const lun = new THREE.CircleGeometry(HALL.vaultR - 0.6, 48, 0, Math.PI); lun.rotateY(-Math.PI / 2); lun.translate(HALL.x1 - 0.05, HALL.wallH, 0);
  addMesh(lun, new THREE.MeshBasicMaterial({ color: 0xfff4ec, side: THREE.DoubleSide }), hall, { receive: false });
  const westTop = new THREE.CircleGeometry(HALL.vaultR, 48, 0, Math.PI); westTop.rotateY(Math.PI / 2); westTop.translate(HALL.x0 - 0.05, HALL.wallH, 0);
  addMesh(westTop, M.plaster);
  const west = new THREE.BoxGeometry(0.4, HALL.wallH, HALL.z * 2); west.translate(HALL.x0 - 0.2, HALL.wallH / 2, 0);
  addMesh(west, M.plaster);
})();

/* glass barrel vault with iron ribs */
(function vault() {
  const g = new THREE.CylinderGeometry(HALL.vaultR, HALL.vaultR, HALL.x1 - HALL.x0, 48, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2); g.translate(0, HALL.wallH, 0);
  addMesh(g, M.glassRoof, hall, { receive: false });
  const rg = new THREE.TorusGeometry(HALL.vaultR - 0.05, 0.09, 6, 48, Math.PI);
  rg.rotateY(Math.PI / 2);
  const n = 17, ribs = new THREE.InstancedMesh(rg, M.iron, n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m4.makeTranslation(HALL.x0 + i * 3, HALL.wallH, 0); ribs.setMatrixAt(i, m4); }
  hall.add(ribs);
  const purl = [];
  for (let a = 1; a < 8; a++) {
    const th = a / 8 * Math.PI;
    const b = new THREE.BoxGeometry(HALL.x1 - HALL.x0, 0.07, 0.07);
    b.translate(0, HALL.wallH + Math.sin(th) * (HALL.vaultR - 0.05), Math.cos(th) * (HALL.vaultR - 0.05));
    purl.push(b);
  }
  addMesh(mergeGeometries(purl), M.iron, hall, { receive: false });
  // light shafts
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 256;
  const sg = sc.getContext('2d'); const gr = sg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,248,236,0.0)'); gr.addColorStop(0.15, 'rgba(255,246,232,0.9)'); gr.addColorStop(1, 'rgba(255,240,230,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 64, 256);
  const hg = sg.createLinearGradient(0, 0, 64, 0); hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.5, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,1)');
  sg.globalCompositeOperation = 'destination-out'; sg.fillStyle = hg; sg.fillRect(0, 0, 64, 256);
  const st = new THREE.CanvasTexture(sc);
  const sm = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (const [x, z, rot, w] of [[-12, -6.4, 0.25, 2.6], [-4, 6.6, 0.2, 2.2], [3.5, -6.6, 0.28, 2.8], [10, 6.4, 0.22, 2.4], [16, -6.2, 0.26, 2.4]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 26), sm);
    p.position.set(x, 12, z); p.rotation.set(0, 0.6, rot);
    hall.add(p);
  }
})();

/* Trajan's Column cast: two halves on pedestals at the east end */
(function trajan() {
  const band = tex(512, 1024, (g, w, h) => {
    noiseFill(g, w, h, '#ece2d6', 0.07, 5000);
    const N = 9;
    for (let n = -1; n <= N; n++) {
      g.strokeStyle = 'rgba(120,92,80,.55)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, h - (n / N) * h); g.lineTo(w, h - ((n + 1) / N) * h); g.stroke();
      for (let i = 0; i < 70; i++) { // soldiers, ships, walls
        const u = Math.random(), x = u * w, base = h - ((n + u) / N) * h;
        const hh = 18 + Math.random() * 30;
        g.strokeStyle = `rgba(110,80,70,${0.25 + Math.random() * 0.3})`; g.lineWidth = 2 + Math.random() * 2;
        g.beginPath(); g.moveTo(x, base - 6); g.lineTo(x + (Math.random() - .5) * 8, base - 6 - hh); g.stroke();
        g.beginPath(); g.arc(x, base - 10 - hh, 3, 0, 7); g.stroke();
      }
    }
  });
  for (const z of [-3.4, 3.4]) {
    const ped = addMesh(new THREE.BoxGeometry(3.6, 3.8, 3.6), M.stone, hall, { cast: true });
    ped.position.set(19, 1.9, z);
    const shaft = addMesh(new THREE.CylinderGeometry(1.74, 1.84, 12.8, 48, 1), new THREE.MeshStandardMaterial({ map: band, bumpMap: band, bumpScale: 2.5, roughness: 0.85 }), hall, { cast: true });
    shaft.position.set(19, 3.8 + 6.4, z);
    const ring = addMesh(new THREE.CylinderGeometry(2.0, 2.0, 0.35, 48), M.stone); ring.position.set(19, 3.97, z);
    if (z > 0) {
      const cap = addMesh(new THREE.CylinderGeometry(2.3, 1.75, 0.6, 48), M.stone); cap.position.set(19, 16.9, z);
      const ab = addMesh(new THREE.BoxGeometry(4.4, 0.45, 4.4), M.stone); ab.position.set(19, 17.4, z);
    }
  }
})();

/* Pórtico de la Gloria cast on the west wall */
const portico = new THREE.Group(); hall.add(portico);
(function porticoBuild() {
  const xw = HALL.x0 + 0.4;
  const shape = new THREE.Shape(); shape.moveTo(-8.25, 0); shape.lineTo(8.25, 0); shape.lineTo(8.25, 12.5); shape.lineTo(-8.25, 12.5); shape.lineTo(-8.25, 0);
  const arches = [[0, 3.1, 5.4], [-5.4, 1.6, 4.3], [5.4, 1.6, 4.3]];
  for (const [zc, r, spring] of arches) { const p = new THREE.Path(); p.moveTo(zc - r, 0.01); p.lineTo(zc - r, spring); p.absarc(zc, spring, r, Math.PI, 0, true); p.lineTo(zc + r, 0.01); p.lineTo(zc - r, 0.01); shape.holes.push(p); }
  const fg = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 24 });
  fg.rotateY(Math.PI / 2); fg.translate(xw - 0.2, 0, 0);
  addMesh(fg, M.stone, portico, { cast: true });
  const recess = new THREE.PlaneGeometry(16.5, 12.5); recess.rotateY(Math.PI / 2); recess.translate(xw - 0.25, 6.25, 0);
  addMesh(recess, M.plasterDeep, portico);
  const rings = [];
  for (const [zc, r, spring] of arches) {
    for (let i = 0; i < (r > 2 ? 4 : 3); i++) {
      const t = new THREE.TorusGeometry(r + 0.18 + i * 0.36, 0.15, 8, 40, Math.PI);
      t.rotateY(Math.PI / 2); t.translate(xw + 0.75, spring, zc);
      rings.push(t);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const c = new THREE.CylinderGeometry(0.16, 0.18, spring, 12); c.translate(xw + 0.75, spring / 2, zc + s * (r + 0.3 + i * 0.36));
      rings.push(c);
    }
  }
  addMesh(mergeGeometries(rings.map(g => g.index ? g.toNonIndexed() : g)), M.stone, portico, { cast: true });
  // the 24 elders: small seated figures along the main archivolt
  const eg = new THREE.CapsuleGeometry(0.12, 0.26, 4, 8);
  const elders = new THREE.InstancedMesh(eg, M.stone, 24);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 24; i++) {
    const a = Math.PI * (i + 0.5) / 24, R = 3.1 + 0.18 + 0.36 * 1.5;
    q.setFromAxisAngle(_X, a - Math.PI / 2);
    m4.compose(new THREE.Vector3(xw + 1.0, 5.4 + Math.sin(a) * R, Math.cos(a) * R), q, new THREE.Vector3(1, 1, 1));
    elders.setMatrixAt(i, m4);
  }
  portico.add(elders);
  const tym = new THREE.CircleGeometry(3.1, 40, 0, Math.PI); tym.rotateY(Math.PI / 2); tym.translate(xw + 0.3, 5.4, 0);
  addMesh(tym, M.stone, portico);
  const tr = new THREE.CylinderGeometry(0.28, 0.32, 5.4, 16); tr.translate(xw + 0.6, 2.7, 0);
  addMesh(tr, M.stone, portico, { cast: true });
})();

/* the concept sketch, hung like the court's painted copies */
const sketchImg = new Image();
const sketchTex = new THREE.Texture(sketchImg);
sketchTex.colorSpace = THREE.SRGBColorSpace;
sketchImg.onload = () => { sketchTex.needsUpdate = true; };
sketchImg.src = SKETCH_SRC;
(function painting() {
  const w = 10.4, h = w * 941 / 1672, y = 12.4, z = -HALL.z + 0.62;
  const p = addMesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: sketchTex, toneMapped: false, color: 0xf4f0ee }), hall, { receive: false });
  p.position.set(0, y, z);
  const fr = [];
  for (const [fx, fy, fw, fh] of [[0, h / 2 + 0.15, w + 0.6, 0.3], [0, -h / 2 - 0.15, w + 0.6, 0.3], [-w / 2 - 0.15, 0, 0.3, h], [w / 2 + 0.15, 0, 0.3, h]]) {
    const b = new THREE.BoxGeometry(fw, fh, 0.18); b.translate(fx, y + fy, z - 0.02); fr.push(b);
  }
  addMesh(mergeGeometries(fr), M.gold);
  const lab = tex(1024, 96, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#232323'; g.font = '600 40px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.fillText('VENUS, RE-POSED', W / 2, 46);
    g.fillStyle = '#6f6f6f'; g.font = '26px "Noto Sans SC", sans-serif'; g.fillText('概念草图 · 组内绘制 · 以“画作复制品”的方式挂在北墙', W / 2, 82);
  });
  const lp = addMesh(new THREE.PlaneGeometry(3.6, 0.34), new THREE.MeshBasicMaterial({ map: lab }), hall, { receive: false });
  lp.position.set(0, y - h / 2 - 0.36, z + 0.02);
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
function reliefTexture(cls) {
  return tex(256, 400, (g, w, h) => {
    noiseFill(g, w, h, '#e3b3b4', 0.07, 2200);
    g.strokeStyle = 'rgba(255,240,236,.65)'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
    g.strokeStyle = 'rgba(140,70,80,.35)'; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48);
    drawPoseIcon(g, cls, w / 2 + 4, h / 2 + 6, 170, { color: 'rgba(120,60,70,.45)', width: 20 });
    drawPoseIcon(g, cls, w / 2, h / 2, 170, { color: '#f7e9e4', width: 18 });
    g.fillStyle = 'rgba(120,60,70,.6)'; g.font = '600 22px Cinzel, Georgia, serif'; g.textAlign = 'center';
    g.fillText(CLASS[cls].en.toUpperCase(), w / 2, h - 40);
  });
}


/* bougainvillea clusters */


/* soft additive light for beams */
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

