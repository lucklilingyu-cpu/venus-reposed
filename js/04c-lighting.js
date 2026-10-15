/* Daylight → a contemporary pink/blue night installation. Only lighting changes;
   geometry and the white porcelain material remain shared by both modes. */
const NightLighting = (() => {
  const PINK = 0xff72ca, BLUE = 0x70cfff;
  const clamp = x => Math.max(0, Math.min(1, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const state = { value: 0, from: 0, target: 0, elapsed: 0, moving: false };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const lights = [];
  const portico = scene.getObjectByName('portico-light');
  const baseline = {
    sky: hemi.color.clone(), ground: hemi.groundColor.clone(),
    fill: fillL.color.clone(), bounce: bounce.color.clone(),
    tier: M.tier.color.clone(), exposure: renderer.toneMappingExposure,
    sunIntensity: sun.intensity, hemiIntensity: hemi.intensity, fillIntensity: fillL.intensity, bounceIntensity: bounce.intensity,
  };
  const nightColors = {
    sky: new THREE.Color(0x9db9f0), ground: new THREE.Color(0x302144),
    fill: new THREE.Color(BLUE), bounce: new THREE.Color(PINK),
    tier: new THREE.Color(0x9dbbe7),
  };
  // Four broad washes; no additional shadow maps for the detailed sculpture hall.
  for (const [i, x] of [-15, -5, 5, 15].entries()) {
    const side = i % 2 ? 1 : -1;
    const light = new THREE.SpotLight(side < 0 ? BLUE : PINK, 0, 32, 0.9, 0.85, 2);
    light.position.set(x, 9.7, side * 6.8); light.target.position.set(x + 2, 0.5, -side * 2.5);
    scene.add(light, light.target); lights.push(light);
  }
  function apply(v) {
    const accent = clamp((v - 0.16) / 0.84);
    sun.intensity = mix(baseline.sunIntensity, 0.055, v);
    hemi.intensity = mix(baseline.hemiIntensity, 0.16, v);
    fillL.intensity = mix(baseline.fillIntensity, 0.62, v);
    bounce.intensity = mix(baseline.bounceIntensity, 0.55, v);
    hemi.color.copy(baseline.sky).lerp(nightColors.sky, v);
    hemi.groundColor.copy(baseline.ground).lerp(nightColors.ground, v);
    fillL.color.copy(baseline.fill).lerp(nightColors.fill, v);
    bounce.color.copy(baseline.bounce).lerp(nightColors.bounce, v);
    M.tier.color.copy(baseline.tier).lerp(nightColors.tier, v);
    if (portico) { portico.intensity = mix(640, 180, v); portico.color.set(0xfff0dc).lerp(nightColors.fill, v); }
    ceramic.envMapIntensity = mix(0.85, 0.22, v);
    contextPlaster.envMapIntensity = ceramic.envMapIntensity;
    lights.forEach((light, i) => { light.intensity = 1000 * clamp((accent - i * 0.06) / 0.8); });
    renderer.toneMappingExposure = mix(baseline.exposure, 0.86, v);
    bloom.enabled = v > 0.01; bloom.strength = 0.32 * v; bloom.threshold = 0.95;
    scene.background = null; scene.fog = null;
    canvas.dataset.nightProgress = v.toFixed(3);
    Architecture.apply(); // keep the enclosure background and scan material policy in sync
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
