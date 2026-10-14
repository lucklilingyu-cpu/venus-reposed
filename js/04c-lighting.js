/* Daylight → a contemporary pink/blue night installation. Only lighting changes;
   geometry and the white porcelain material remain shared by both modes. */
const NightLighting = (() => {
  const PINK = 0xff72ca, BLUE = 0x70cfff;
  const clamp = x => Math.max(0, Math.min(1, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const state = { value: 0, from: 0, target: 0, elapsed: 0, moving: false };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lights = [], lines = [], env = [], beamMats = new Set();
  const portico = scene.getObjectByName('portico-light');
  const daySky = scene.background;
  const baseline = {
    fog: scene.fog.color.clone(), sky: hemi.color.clone(), ground: hemi.groundColor.clone(),
    fill: fillL.color.clone(), bounce: bounce.color.clone(), windows: M.windowGlow.color.clone(),
    glass: M.glassRoof.color.clone(), tier: M.tier.color.clone(), exposure: renderer.toneMappingExposure,
  };
  const nightColors = {
    fog: new THREE.Color(0x071126), sky: new THREE.Color(0x9db9f0), ground: new THREE.Color(0x302144),
    fill: new THREE.Color(BLUE), bounce: new THREE.Color(PINK), windows: new THREE.Color(0x16284b),
    glass: new THREE.Color(0x698dc0), tier: new THREE.Color(0x9dbbe7),
  };
  const seen = new Set();
  hall.traverse(o => {
    if (o.name === 'daylight-beam') beamMats.add(o.material);
    for (const mat of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      if (!seen.has(mat) && 'envMapIntensity' in mat) { seen.add(mat); env.push([mat, mat.envMapIntensity]); }
    }
  });
  const fixture = new THREE.Group(); fixture.name = 'night-installation'; scene.add(fixture);
  function line(points, color, radius = 0.035) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length > 2 ? 48 : 1, radius, 6, false), mat);
    fixture.add(mesh); lines.push(mat);
  }
  // Pool-edge lights and elevated gallery rails read as a modern light installation.
  for (const side of [-1, 1]) {
    const color = side < 0 ? BLUE : PINK;
    line([new THREE.Vector3(-15.4, 0.14, side * 3.73), new THREE.Vector3(15.4, 0.14, side * 3.73)], color, 0.045);
    line([new THREE.Vector3(-20.5, 8.8, side * 7.35), new THREE.Vector3(22, 8.8, side * 7.35)], color);
    for (const x of [-14.4, -4.8, 4.8, 14.4]) {
      line([new THREE.Vector3(x, 0.4, side * 8.5), new THREE.Vector3(x, 7.5, side * 8.5)], color, 0.025);
    }
  }
  for (const [i, x] of [-19.2, -9.6, 0, 9.6, 19.2].entries()) {
    const points = [];
    for (let k = 0; k <= 24; k++) {
      const a = k / 24 * Math.PI;
      points.push(new THREE.Vector3(x, HALL.wallH + Math.sin(a) * (HALL.vaultRise - 0.16), Math.cos(a) * (HALL.z - 0.16)));
    }
    line(points, i % 2 ? PINK : BLUE, 0.045);
  }
  // Four broad washes; no additional shadow maps for the detailed sculpture hall.
  for (const [i, x] of [-15, -5, 5, 15].entries()) {
    const side = i % 2 ? 1 : -1;
    const light = new THREE.SpotLight(side < 0 ? BLUE : PINK, 0, 32, 0.9, 0.85, 2);
    light.position.set(x, 9.7, side * 6.8); light.target.position.set(x + 2, 0.5, -side * 2.5);
    scene.add(light, light.target); lights.push(light);
  }
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  const blendSky = new THREE.CanvasTexture(skyCanvas); blendSky.colorSpace = THREE.SRGBColorSpace;
  const dayStops = [0xc6d8ea, 0xe4ebf1, 0xf1ece5].map(x => new THREE.Color(x));
  const nightStops = [0x040a1c, 0x0d183a, 0x302448].map(x => new THREE.Color(x));
  const skyColor = new THREE.Color();
  function apply(v) {
    const accent = clamp((v - 0.16) / 0.84);
    sun.intensity = mix(4.4, 0.055, v);
    hemi.intensity = mix(0.75, 0.16, v);
    fillL.intensity = mix(0.35, 0.62, v);
    bounce.intensity = mix(0.55, 0.55, v);
    hemi.color.copy(baseline.sky).lerp(nightColors.sky, v);
    hemi.groundColor.copy(baseline.ground).lerp(nightColors.ground, v);
    fillL.color.copy(baseline.fill).lerp(nightColors.fill, v);
    bounce.color.copy(baseline.bounce).lerp(nightColors.bounce, v);
    scene.fog.color.copy(baseline.fog).lerp(nightColors.fog, v);
    M.windowGlow.color.copy(baseline.windows).lerp(nightColors.windows, v);
    M.glassRoof.color.copy(baseline.glass).lerp(nightColors.glass, v);
    M.tier.color.copy(baseline.tier).lerp(nightColors.tier, v);
    if (portico) { portico.intensity = mix(640, 180, v); portico.color.set(0xfff0dc).lerp(nightColors.fill, v); }
    for (const [mat, original] of env) mat.envMapIntensity = original * mix(1, 0.2, v);
    ceramic.envMapIntensity = mix(0.85, 0.22, v);
    for (const mat of beamMats) mat.opacity = 0.07 * (1 - v);
    lights.forEach((light, i) => { light.intensity = 1000 * clamp((accent - i * 0.06) / 0.8); });
    lines.forEach((mat, i) => { mat.opacity = clamp((accent - (i % 5) * 0.035) / 0.8); });
    fixture.visible = v > 0;
    water.material.uniforms.night.value = v;
    renderer.toneMappingExposure = mix(baseline.exposure, 0.86, v);
    bloom.enabled = v > 0.01; bloom.strength = 0.32 * v; bloom.threshold = 0.95;
    if (v === 0) scene.background = daySky;
    else {
      const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
      dayStops.forEach((color, i) => gradient.addColorStop(i / 2, '#' + skyColor.copy(color).lerp(nightStops[i], v).getHexString()));
      skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 4, 256); blendSky.needsUpdate = true; scene.background = blendSky;
    }
    canvas.dataset.nightProgress = v.toFixed(3);
    renderer.shadowMap.needsUpdate = true;
  }
  function set(night, instant = false) {
    state.from = state.value; state.target = night ? 1 : 0; state.elapsed = 0;
    state.moving = !instant && !reduced.matches && state.from !== state.target;
    const button = document.getElementById('lightingBtn');
    button.setAttribute('aria-pressed', String(night));
    button.setAttribute('aria-label', night ? '切换到白天灯光' : '切换到夜晚灯光');
    button.title = night ? '夜晚 · 点击切换白天' : '白天 · 点击切换夜晚';
    document.getElementById('lightingLabel').textContent = night ? '白天' : '夜晚';
    button.querySelector('.lighting-symbol').textContent = night ? '☀' : '☾';
    document.documentElement.dataset.lighting = night ? 'night' : 'day';
    canvas.dataset.lightingTransition = state.moving ? 'running' : 'complete';
    try { localStorage.setItem('venus.lighting', night ? 'night' : 'day'); } catch (_) { /* session only */ }
    if (!state.moving) { state.value = state.target; apply(state.value); }
  }
  function update(dt) {
    if (!state.moving) return;
    state.elapsed += dt;
    const t = reduced.matches ? 1 : clamp(state.elapsed / 2.6);
    state.value = mix(state.from, state.target, t * t * (3 - 2 * t)); apply(state.value);
    if (t === 1) { state.moving = false; canvas.dataset.lightingTransition = 'complete'; }
  }
  function init() {
    let night = false;
    try { night = localStorage.getItem('venus.lighting') === 'night'; } catch (_) { /* storage blocked */ }
    set(night, true);
    document.getElementById('lightingBtn').addEventListener('click', () => set(!state.target));
  }
  return { init, set, update };
})();
