/* Complete visible V&A scan; separate from Architecture and interactive V. */
const VAHallScan = (() => {
  const group = new THREE.Group();
  group.name = 'VA_Hall_Scan';
  group.userData.isVAHallScan = true;
  scene.add(group);
  let pending = null, model = null, config = null, error = null;
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
        const gltf = await loader.loadAsync(new URL(config.model, document.baseURI).href);
        model = gltf.scene;
        model.name = 'VA_Hall_Scan_Content';
        model.traverse(object => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = true;
          object.userData.isVAHallScan = true;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            material.envMapIntensity = 0.3;
          }
        });
        group.add(model);
        group.userData.alignment = config.courtA;
        applyTransform(config.transform);
        canvas.dataset.vaHallScan = 'ready';
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
  return { group, parameters, load, applyTransform, get config() { return config; }, get error() { return error; } };
})();
// Start once, independently of diary generation, reset and day/night transitions.
VAHallScan.load().catch(() => {});
