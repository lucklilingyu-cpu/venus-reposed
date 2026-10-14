/* Central rectangle cleaned V&A scan; separate from interactive V and Architecture. */
const VAHallScan = (() => {
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
      const response = await fetch(new URL('assets/va-hall/alignment.json', document.baseURI));
      if (!response.ok) throw new Error('展厅对齐文件：HTTP ' + response.status);
      config = await response.json();
      const decoder = new DRACOLoader();
      decoder.setDecoderPath(new URL('assets/vendor/draco/', document.baseURI).href);
      decoder.setWorkerLimit(2);
      const loader = new GLTFLoader().setDRACOLoader(decoder);
      try {
        const policyResponse = await fetch(new URL('assets/va-hall/material-regions.json',document.baseURI));
        if (!policyResponse.ok) throw new Error('扫描材质分区文件：HTTP ' + policyResponse.status);
        const policy = await policyResponse.json();
        const modelURL = new URL(config.model,document.baseURI);
        // Transport-only segmentation: concatenate the exact original GLB bytes.
        // Face-region classification and the model SHA256 are unchanged.
        const paths = Array.isArray(config.modelParts) && config.modelParts.length ? config.modelParts : [config.model];
        if (!paths.every(path => typeof path === 'string' && /^assets\/va-hall\/[a-zA-Z0-9._-]+$/.test(path))) throw new Error('扫描模型分段路径无效');
        const buffers = await Promise.all(paths.map(async path => {
          const response = await fetch(new URL(path,document.baseURI));
          if (!response.ok) throw new Error('扫描模型：HTTP ' + response.status);
          return response.arrayBuffer();
        }));
        const joined = new Uint8Array(buffers.reduce((size,buffer)=>size+buffer.byteLength,0));
        let offset = 0; for (const buffer of buffers) { joined.set(new Uint8Array(buffer),offset); offset += buffer.byteLength; }
        const bytes = joined.buffer;
        const digest = await sha256(bytes);
        if (policy.version === 1 && policy.model === config.model && policy.modelSHA256 === digest) materialRegions = policy;
        else canvas.dataset.scanClassificationError = 'model-signature-mismatch';
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
  return { group, parameters, load, applyTransform, applyMaterials, get config() { return config; }, get error() { return error; } };
})();
// Start once, independently of diary generation, reset and day/night transitions.
VAHallScan.load().catch(() => {});
