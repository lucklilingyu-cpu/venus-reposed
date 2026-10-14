/* Central rectangle cleaned V&A scan; separate from interactive V and Architecture. */
const VA_SCAN_RELEASE = Object.freeze({"config":"assets/va-hall/alignment-6ed40ccb5690df83.json","configSHA256":"6ed40ccb5690df836c3b96f27f021ed3588cb312943b3c0a5d0d8c4304bc8052","policy":"assets/va-hall/material-regions-7c4ca40e32482721.json","policySHA256":"7c4ca40e3248272141d1e6f190f4cc904b12672021f7de0f1ebbf4196a967a1f","model":"assets/va-hall/va-hall-central-clean-3bf5c5f8b89e8675.glb.gz","modelSHA256":"90bc384bf1fd23d092cf2b0497c8a02d8a3128a52570679e971f1ff13a7a8359","transportSHA256":"3bf5c5f8b89e867525576691e11f6f5c7ac56c4cc081bb6b7f55e0d4fe9ba94d"});
const VAHallScan = (() => {
  if (scene.userData.vaHallScanController) return scene.userData.vaHallScanController;
  const group = new THREE.Group();
  group.name = 'VA_Hall_Scan';
  group.userData.isVAHallScan = true;
  scene.add(group);
  let pending = null, model = null, config = null, error = null;
  const scanMaterials = new Map();
  let materialRegions = null;
  // Materials are per semantic face slot, never selected by texture colour.
  function scanMaterial(source, role) {
    let roles = scanMaterials.get(source);
    if (!roles) { roles = new Map(); scanMaterials.set(source, roles); }
    if (roles.has(role)) return roles.get(role);
    const material = source.clone();
    material.name = source.name + '-' + role;
    // Unknown faces retain their preceding preview state, never the sculpture policy.
    material.opacity = role === 'background-wall' ? 1 : role === 'confirmed-sculpture' ? 0.6 : 0.7;
    material.transparent = material.opacity < 1; material.depthWrite = !material.transparent;
    material.depthTest = true; material.side = THREE.DoubleSide;
    material.forceSinglePass = true; material.envMapIntensity = 0.3;
    material.userData.scanRole = role; material.needsUpdate = true;
    roles.set(role, material); return material;
  }
  async function partitionScanFaces(object) {
    const geometry = object.geometry.clone();
    const position = geometry.attributes.position, index = geometry.index;
    const count = index ? index.count : position.count;
    const original = Array.isArray(object.material) ? object.material : [object.material];
    const sourceGroups = geometry.groups.length ? geometry.groups.slice() : [{ start: 0, count, materialIndex: 0 }];
    // The export explicitly names this independently separated architecture.
    // Other HallScan objects contain merged walls, exhibits and floor: no
    // colour, planar-fit or height heuristic is reliable enough to alter them.
    const confirmedWall = object.userData.sourceObject === 'HallScan_03_V6_FarEnd_Architecture_Working'
      || /^HallScan_03_V6_FarEnd_Architecture_Working(?:\.?001)?$/.test(object.name);
    const floorOnly = /Infill_Floor/.test(object.name);
    const candidates = new Map();
    if (confirmedWall) for (let i=0;i<count;i+=3) candidates.set(i,'background-wall');
    const sourceName = object.userData.sourceObject || object.name.replace(/\.?001$/, '');
    const selection = materialRegions?.meshes?.[sourceName];
    let selectionVerified = false;
    if (selection) {
      const normalized = new Uint32Array(count);
      for (let i=0;i<count;i++) normalized[i] = index ? index.getX(i) : i;
      const signature = await sha256(normalized.buffer);
      if (selection.vertexCount === position.count && selection.indexCount === count && signature === selection.indexSHA256) {
        const used = new Set();
        const assignments = [['background-wall',selection.wallFaces], ['confirmed-sculpture',selection.sculptureFaces]];
        const valid = assignments.every(([,faces]) => Array.isArray(faces) && faces.every(face => {
          if (!Number.isInteger(face) || face<0 || face>=count/3 || used.has(face)) return false;
          used.add(face); return true;
        }));
        if (valid) {
          for (const [role,faces] of assignments) for (const face of faces) candidates.set(face*3,role);
          selectionVerified = true;
        }
      }
      if (!selectionVerified) canvas.dataset.scanClassificationError = 'region-signature-mismatch';
    }
    const indices = [], materials = [], slots = new Map();
    geometry.clearGroups();
    let wallFaces = 0, sculptureFaces = 0, retainedFaces = 0;
    for (const sourceGroup of sourceGroups) for (const role of ['retained-scan', 'background-wall', 'confirmed-sculpture']) {
      const from = indices.length;
      for (let i = sourceGroup.start; i < sourceGroup.start + sourceGroup.count; i += 3) {
        if ((candidates.get(i) || 'retained-scan') !== role) continue;
        for (let k=0;k<3;k++) indices.push(index ? index.getX(i+k) : i+k);
        role === 'background-wall' ? wallFaces++ : role === 'confirmed-sculpture' ? sculptureFaces++ : retainedFaces++;
      }
      if (indices.length === from) continue;
      const key = sourceGroup.materialIndex + ':' + role;
      if (!slots.has(key)) { slots.set(key, materials.length); materials.push(scanMaterial(original[sourceGroup.materialIndex],role)); }
      geometry.addGroup(from, indices.length-from, slots.get(key));
    }
    geometry.setIndex(indices); object.geometry = geometry; object.material = materials;
    object.userData.scanPartition = { wallFaces, sculptureFaces, retainedFaces, selectionVerified, ambiguousRetained: !floorOnly && !confirmedWall && retainedFaces > 0 };
    object.renderOrder = 0;
  }
  function applyMaterials() {
    for (const roles of scanMaterials.values()) for (const [role,material] of roles) {
      material.opacity = role === 'background-wall' ? 1 : role === 'confirmed-sculpture' ? 0.6 : 0.7;
      material.transparent = material.opacity < 1; material.depthWrite = !material.transparent; material.depthTest = true;
    }
  }
  async function sha256(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function pinnedJSON(path,expectedSHA) {
    const response = await fetch(new URL(path,document.baseURI),{cache:'no-cache'});
    if (!response.ok) throw new Error('扫描配置文件：HTTP ' + response.status);
    const bytes = await response.arrayBuffer();
    if (await sha256(bytes) !== expectedSHA) throw new Error('扫描配置校验失败，已阻止混用旧版本');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const parameters = { position: [0, 0, 0], yawDegrees: 0, scale: 1, heightOffset: 0 };
  function applyTransform(values = {}) {
    const next = { ...parameters, ...values };
    if (!Array.isArray(next.position) || next.position.length !== 3 || !next.position.every(Number.isFinite)
      || !Number.isFinite(next.yawDegrees) || !Number.isFinite(next.heightOffset)
      || !Number.isFinite(next.scale) || next.scale <= 0) throw new Error('展厅扫描变换参数无效');
    Object.assign(parameters, next, { position: [...next.position] });
    group.position.set(...parameters.position);
    group.position.y += parameters.heightOffset;
    group.rotation.set(0, THREE.MathUtils.degToRad(parameters.yawDegrees), 0);
    group.scale.setScalar(parameters.scale);
    group.updateMatrixWorld(true);
    renderer.shadowMap.needsUpdate = true;
    return group;
  }
  function load() {
    if (pending) return pending;
    if (model) return Promise.resolve(group);
    canvas.dataset.vaHallScan = 'loading';
    pending = (async () => {
      config = await pinnedJSON(VA_SCAN_RELEASE.config,VA_SCAN_RELEASE.configSHA256);
      if (config.model !== VA_SCAN_RELEASE.model || config.modelSHA256 !== VA_SCAN_RELEASE.modelSHA256) throw new Error('扫描配置版本不一致，已阻止旧模型加载');
      const decoder = new DRACOLoader();
      decoder.setDecoderPath(new URL('assets/vendor/draco/', document.baseURI).href);
      decoder.setWorkerLimit(2);
      const loader = new GLTFLoader().setDRACOLoader(decoder);
      try {
        const policy = await pinnedJSON(VA_SCAN_RELEASE.policy,VA_SCAN_RELEASE.policySHA256);
        const modelURL = new URL(VA_SCAN_RELEASE.model,document.baseURI);
        const response = await fetch(modelURL,{cache:'no-cache'});
        if (!response.ok) throw new Error('扫描模型：HTTP ' + response.status);
        const transport = await response.arrayBuffer(), header = new Uint8Array(transport,0,Math.min(4,transport.byteLength));
        let bytes = transport;
        if (header[0] === 0x1f && header[1] === 0x8b) {
          if (await sha256(transport) !== VA_SCAN_RELEASE.transportSHA256) throw new Error('扫描传输文件校验失败');
          if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持扫描模型解压，请更新浏览器');
          bytes = await new Response(new Blob([transport]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        const digest = await sha256(bytes);
        if (digest !== VA_SCAN_RELEASE.modelSHA256 || policy.version !== 1 || policy.model !== VA_SCAN_RELEASE.model || policy.modelSHA256 !== digest) {
          canvas.dataset.scanClassificationError = 'model-signature-mismatch';
          throw new Error('扫描模型版本校验失败，已阻止旧扫描模型进入场景');
        }
        materialRegions = policy;
        const gltf = await loader.parseAsync(bytes,new URL('.',modelURL).href);
        model = gltf.scene;
        model.name = 'VA_Hall_Scan_Content';
        group.add(model);
        applyTransform(config.transform);
        model.updateWorldMatrix(true, true);
        const meshes = []; model.traverse(object => { if (object.isMesh) meshes.push(object); });
        for (const object of meshes) {
          object.castShadow = false;
          object.receiveShadow = false;
          object.userData.isVAHallScan = true;
          await partitionScanFaces(object);
        }
        group.userData.alignment = config.courtA;
        applyTransform(config.transform);
        canvas.dataset.vaHallScan = 'ready';
        canvas.dataset.scanMaterialReview = 'partial-unresolved';
        error = null;
        return group;
      } finally { decoder.dispose(); }
    })().catch(reason => {
      error = reason;
      pending = null;
      canvas.dataset.vaHallScan = 'error';
      console.error('VA_Hall_Scan', reason);
      throw reason;
    });
    return pending;
  }
  const api = { group, parameters, load, applyTransform, applyMaterials, get config() { return config; }, get error() { return error; } };
  scene.userData.vaHallScanController = api;
  return api;
})();
// Start once, independently of diary generation, reset and day/night transitions.
VAHallScan.load().catch(() => {});
