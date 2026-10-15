
/* ---------------------------------------------------------------
   Surface view: one folded-plate architecture grown from the poses.

   Every goddess of the day gets a crescent of planar panels that half-encloses her. The panels follow her own
   silhouette (read from the mesh, sector by sector), so they rise where an arm is raised and sink where the body is low;
   how tall, how wide, how far they lean and how many canopy plates lean over her head depends on her pose class,
   and a raised or outstretched hand sends a triangular fin the way it points.
   Between two goddesses the wall does not stop: its end crease turns into a band that twists from upright to flat,
   climbs over whatever stands in the way and lands, twisting back, as the start crease of the next goddess's wall.
   The first and the last wall end in a rising tail. So the whole sequence is one continuous structure.

   Everything is made of planar facets: panels are built along shared creases, and each new corner is projected onto
   the plane of the facet before it, so no facet is warped. Plates are a centimetre thick, hatched with fine lines,
   and outlined like a drawing. Panels are ordered along the chain, so the structure unfolds from start to end.
---------------------------------------------------------------- */
const SURF = { group: new THREE.Group(), mesh: null, lines: null, job: 0, dirty: true, grow: null, panels: 0, cur: null, saved: [], link: null, doneSig: '', only: false, court: true };
SURF.group.name = 'surface-structure'; SURF.group.visible = false; scene.add(SURF.group);
const surfU = { uGrow: { value: 1 } };
const surfTex = (() => { // fine hatch lines: one line per tile, the tile is 3.4 cm wide on the plate
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#f3efe8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#cfc9be'; g.fillRect(0, 0, 6, 64); g.fillStyle = '#8f897f'; g.fillRect(1, 0, 3, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
})();
function surfFadePatch(sh) { // distance to the camera -> 0 at the lens, 1 from about 1.6 m
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vNear;').replace('#include <project_vertex>', '#include <project_vertex>\n  vNear = smoothstep(0.25, 1.6, length(mvPosition.xyz));');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vNear;').replace('#include <alphahash_fragment>', 'diffuseColor.a *= vNear;\n  #include <alphahash_fragment>');
}
function surfGrowPatch(sh) { // every panel unfolds from its own centre when uGrow passes its place in the chain
  sh.uniforms.uGrow = surfU.uGrow;
  sh.vertexShader = 'attribute vec3 aC; attribute float aO; uniform float uGrow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  float gs = smoothstep(aO, aO + 0.05, uGrow * 1.05); transformed = aC + (transformed - aC) * gs;');
}
function surfGlass() {
  return new THREE.MeshPhysicalMaterial({ vertexColors: true, alphaHash: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide, flatShading: true,
    transmission: 0.1, thickness: 0.16, ior: 1.38, attenuationColor: new THREE.Color(0xf4e6d8), attenuationDistance: 1.4,
    clearcoat: 0.35, clearcoatRoughness: 0.3, specularIntensity: 0.9, envMapIntensity: 0.9, iridescence: 0.15, iridescenceIOR: 1.3, iridescenceThicknessRange: [120, 320] });
}
const surfMat = surfGlass();
surfMat.onBeforeCompile = (sh) => { surfGrowPatch(sh); surfFadePatch(sh); };
const surfDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); surfDepth.onBeforeCompile = surfGrowPatch;
const surfLineMat = new THREE.LineBasicMaterial({ color: 0x38342f, transparent: true, opacity: 0.85 }); surfLineMat.onBeforeCompile = surfGrowPatch;

/* ---------- plates ---------- */
function surfBuilder() {
  const P = [], N = [], UV = [], C = [], LN = [], LC = [], vEnd = [], lEnd = [], ctr = [];
  const TH = 0.012, UVS = 1 / 0.034;
  const f3 = (p) => [p.x, p.y, p.z];
  function tri(a, b, c, n, e1, e2, color) { for (const p of [a, b, c]) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); UV.push(p.dot(e1) * UVS, p.dot(e2) * UVS); C.push(color.r, color.g, color.b); } }
  function plate(pts, color, nrms) { // 3 or 4 corners, planar (or nearly): a thin slab with outlined face
    const n = pts.length, p0 = pts[0], p1 = pts[1], p2 = pts[2];
    const nm = (n === 4 ? new THREE.Vector3().subVectors(pts[2], pts[0]).cross(new THREE.Vector3().subVectors(pts[3], pts[1])) : new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)));
    if (nm.lengthSq() < 1e-10) return false; nm.normalize();
    const e1 = new THREE.Vector3().subVectors(p1, p0).normalize(), e2 = new THREE.Vector3().crossVectors(nm, e1);
    const fr = pts.map((p, k) => p.clone().addScaledVector(nrms ? nrms[k] : nm, TH / 2)), bk = pts.map((p, k) => p.clone().addScaledVector(nrms ? nrms[k] : nm, -TH / 2));
    const nb = nm.clone().negate();
    tri(fr[0], fr[1], fr[2], nm, e1, e2, color); if (n === 4) tri(fr[0], fr[2], fr[3], nm, e1, e2, color);
    tri(bk[0], bk[2], bk[1], nb, e1, e2, color); if (n === 4) tri(bk[0], bk[3], bk[2], nb, e1, e2, color);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, sd = new THREE.Vector3().subVectors(pts[j], pts[i]).cross(nm).normalize();
      tri(fr[i], fr[j], bk[j], sd, e1, e2, color); tri(fr[i], bk[j], bk[i], sd, e1, e2, color);
      LN.push(...f3(fr[i]), ...f3(fr[j])); LC.push(0, 0, 0, 0, 0, 0);
    }
    const c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.multiplyScalar(1 / n);
    ctr.push(c); vEnd.push(P.length / 3); lEnd.push(LN.length / 3);
    return true;
  }
  function geometry() {
    const count = ctr.length, tris = P.length / 3, aC = new Float32Array(tris * 3), aO = new Float32Array(tris), aLC = new Float32Array(LN.length), aLO = new Float32Array(LN.length / 3);
    let v = 0, l = 0;
    for (let p = 0; p < count; p++) {
      const o = 0.95 * p / Math.max(1, count), c = ctr[p];
      for (; v < vEnd[p]; v++) { aC[v * 3] = c.x; aC[v * 3 + 1] = c.y; aC[v * 3 + 2] = c.z; aO[v] = o; }
      for (; l < lEnd[p]; l++) { aLC[l * 3] = c.x; aLC[l * 3 + 1] = c.y; aLC[l * 3 + 2] = c.z; aLO[l] = o; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 3)); g.setAttribute('aO', new THREE.BufferAttribute(aO, 1));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(LN, 3)); lg.setAttribute('aC', new THREE.BufferAttribute(aLC, 3)); lg.setAttribute('aO', new THREE.BufferAttribute(aLO, 1));
    return { geo: g, lines: lg, count };
  }
  return { plate, geometry, get count() { return ctr.length; } };
}
/* a strip of facets between two polylines; each corner of B is projected onto the plane of the facet before it, so every facet is flat */
function surfStrip(bd, A, B, colorAt, softLast = false) {
  const n = A.length - 1, N = [];
  for (let i = 0; i <= n; i++) { // one normal per corner row, shared by the two facets that meet there
    const t = A[Math.min(n, i + 1)].clone().sub(A[Math.max(0, i - 1)]), w = B[i].clone().sub(A[i]), nm = t.cross(w);
    N.push(nm.lengthSq() > 1e-12 ? nm.normalize() : (N[i - 1] || null));
  }
  for (let i = 0; i < n; i++) {
    const ok = N[i] && N[i + 1];
    bd.plate([A[i], A[i + 1], B[i + 1], B[i]], colorAt(i / Math.max(1, n - 1)), ok ? [N[i], N[i + 1], N[i + 1], N[i]] : undefined);
  }
}

/* ---------- reading the figure ---------- */
const silCache = new Map();
function surfSilhouette(vp, foot) { // how high the body stands in each direction (sectors of 15°), away from its axis
  const geo = vp.fig && vp.fig.geometry, K = 24;
  if (!geo) { const h = (vp.bounds ? vp.bounds.max.y : 1.6) * 0.8; return () => h; }
  const key = vp.work + '|' + geo.uuid; if (silCache.has(key)) return silCache.get(key);
  const Y = new Float32Array(K), P = geo.attributes.position.array;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], z = P[i + 2], q = Math.floor(((Math.atan2(z, x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * K) % K;
    if (Math.hypot(x, z) >= 0.3 * foot((q + 0.5) / K * 2 * Math.PI) && P[i + 1] > Y[q]) Y[q] = P[i + 1];
  }
  const o = Float32Array.from(Y); for (let q = 0; q < K; q++) Y[q] = Math.max(o[q], o[(q + 1) % K] * 0.9, o[(q + K - 1) % K] * 0.9);
  const f = (th) => { const g = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K - 0.5, q0 = (Math.floor(g) + K) % K, q1 = (q0 + 1) % K, b = g - Math.floor(g); return Y[q0] * (1 - b) + Y[q1] * b; };
  silCache.set(key, f); return f;
}
/* what each pose class asks of its pavilion */
const SURF_CLASS = {
  standing:   { hMul: 0.8, minH: 1.3, tilt: -0.10, fold: 0.07, wPan: 0.50, canopy: 3, cLen: 0.85, slope: 0 },
  walking:    { hMul: 0.78, minH: 1.3, tilt: -0.05, fold: 0.09, wPan: 0.58, canopy: 2, cLen: 0.75, slope: 0.5 },
  seated:     { hMul: 0.95, minH: 1.15, tilt: -0.17, fold: 0.07, wPan: 0.62, canopy: 3, cLen: 1.05, slope: 0 },
  crouching:  { hMul: 1.25, minH: 1.05, tilt: -0.30, fold: 0.06, wPan: 0.48, canopy: 4, cLen: 0.95, slope: 0 },
  reclining:  { hMul: 1.5, minH: 0.9, tilt: -0.22, fold: 0.08, wPan: 0.68, canopy: 4, cLen: 1.05, slope: 0 },
  horizontal: { hMul: 1.7, minH: 0.8, tilt: -0.26, fold: 0.08, wPan: 0.74, canopy: 4, cLen: 1.15, slope: 0 },
};
const surfMod = (a, m = 2 * Math.PI) => ((a % m) + m) % m;
const surfSm = (u) => u * u * (3 - 2 * u);
const sv3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* ---------- one goddess: her wall, canopy plates and fin ---------- */
function surfWall(bd, c) {
  const { vp, k, T, meshes, feet, rooms } = c, mesh = meshes[k], cls = (REC[vp.work] && REC[vp.work].cls) || 'standing', Pc = SURF_CLASS[cls] || SURF_CLASS.standing;
  const H = mesh ? mesh.bounds.max.y : (vp.bounds ? vp.bounds.max.y : 1.6), foot = feet[c.i], sil = surfSilhouette(vp, foot), seed = seedOf(vp.work);
  const base = Math.max(Pc.minH, H * Pc.hMul), color = c.col;
  // from the previous goddess round the far side to the next one: the gap faces the neighbours, where the bands come and go
  const ccw = surfMod(c.thOut - c.thIn), cwA = 2 * Math.PI - ccw;
  let dir, sweep;
  if (Math.abs(ccw - Math.PI) < 0.4) { dir = k % 2 ? -1 : 1; sweep = Math.PI; } else if (ccw > cwA) { dir = 1; sweep = ccw; } else { dir = -1; sweep = cwA; }
  sweep = THREE.MathUtils.clamp(sweep, 0.55 * Math.PI, 0.95 * Math.PI) * (0.88 + 0.24 * ((seedOf(vp.work) * 5) % 1)); // a partial wall: the rest of the circle stays open
  let rMean = 0; for (let q = 0; q < 8; q++) rMean += foot(c.thIn + dir * sweep * q / 7) + 0.2; rMean /= 8;
  const NP = THREE.MathUtils.clamp(Math.round(sweep * rMean / (Pc.wPan * 0.5)), 12, 30), ph0 = seed * 6.283;
  const Bg = [], Tp = [], th = [], hs = [];
  for (let i = 0; i <= NP; i++) {
    const u = i / NP, t = c.thIn + dir * sweep * u, ft = foot(t);
    const wave = Math.sin(6.283 * 1.4 * u + ph0), env0 = Math.sin(Math.PI * u);
    let r = ft + 0.3 + Pc.fold * (1.5 * wave * Math.pow(env0, 0.6) + 0.18 * (i % 2 ? 1 : -1));
    r = Math.max(ft + 0.1, Math.min(r, rooms(t)));
    // a low wall with one or two peaks, and a mid-height edge at both ends where the bands attach
    const gs = (x, m, w) => Math.exp(-(((x - m) / w) ** 2)), p1 = 0.22 + 0.2 * ((seed * 3) % 1), p2 = 0.62 + 0.22 * ((seed * 11) % 1), ramp = 1 + Pc.slope * (0.5 - u);
    const env = Math.max(0.2 + 0.8 * Math.max(gs(u, p1, 0.14), 0.7 * gs(u, p2, 0.12)), 0.55 * (gs(u, 0, 0.1) + gs(u, 1, 0.1)));
    const h = Math.max(base * env * ramp, 0.32);
    const out = sv3(Math.cos(t), 0, Math.sin(t)), b = sv3(c.x, 0.002, c.z).addScaledVector(out, r);
    const rTop = Math.max(Math.min(r + Pc.tilt * h + Pc.fold * 2.2 * Math.sin(6.283 * 1.1 * u + ph0 + 1.6) * env0, rooms(t)), ft + 0.12);
    const lean = 0.5 * env0 * Math.sin(6.283 * 1.25 * u + ph0) / Math.max(1, rTop), oT = sv3(Math.cos(t + dir * lean), 0, Math.sin(t + dir * lean));
    const tp = sv3(c.x + oT.x * rTop, h, c.z + oT.z * rTop);
    Bg.push(b); Tp.push(tp); th.push(t); hs.push(h);
  }
  for (let pass = 0; pass < 3; pass++) for (const L of [Bg, Tp]) { const o = L.map(p => p.clone()); for (let i = 1; i < NP; i++) { L[i].copy(o[i - 1]).add(o[i + 1]).multiplyScalar(0.25).addScaledVector(o[i], 0.5); if (L === Bg) L[i].y = 0.002; } }
  const wallFirst = bd.count;
  surfStrip(bd, Bg, Tp, () => color);
  // canopy plates: parallelograms hinged on the top edge, leaning in over the head
  const nC = Math.min(2, Pc.canopy);
  for (let q = 0; q < nC; q++) {
    const j = Math.min(NP - 3, Math.max(0, Math.round(NP * (0.22 + 0.56 * (q + 0.5) / nC)))), j2 = j + 3, A = Tp[j], B = Tp[j2];
    if (Math.min(A.y, B.y) < H * 1.05 + 0.15) continue;
    const mid = (th[j] + th[j2]) / 2, u = j / NP, Lc = 0.7 * Pc.cLen * (0.65 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (0.8 + 0.4 * ((seed * 7 + q * 0.37) % 1));
    const inward = sv3(-Math.cos(mid), 0, -Math.sin(mid)), D = inward.multiplyScalar(Lc).add(sv3(0, 0.18 + 0.22 * ((seed * 3 + q * 0.41) % 1) , 0).multiplyScalar(Lc));
    bd.plate([A.clone(), B.clone(), B.clone().add(D), A.clone().add(D)], color);
  }
  // a raised or outstretched hand sends a fin the way it points
  const limbs = gestureLimbs(mesh && mesh.skel, H);
  if (limbs.length) {
    const lb = limbs[0], tip = sv3(c.x + lb.tip.x, lb.tip.y, c.z + lb.tip.z), az = Math.atan2(lb.tip.z, lb.tip.x);
    let bi = 0, bd0 = 1e9; for (let i = 0; i < NP; i++) { const d = Math.abs(((th[i] + th[i + 1]) / 2 - az + Math.PI * 3) % (2 * Math.PI) - Math.PI); if (d < bd0) { bd0 = d; bi = i; } }
    const A = Tp[bi], B = Tp[bi + 1], tp = tip.clone().addScaledVector(sv3(lb.dir.x, lb.dir.y, lb.dir.z), 0.22); tp.y = Math.max(tp.y, Math.max(A.y, B.y) + 0.1);
    bd.plate([A.clone(), B.clone(), tp], color);
  }
  let outer = 0, top = 0; for (let i = 0; i <= NP; i++) { outer = Math.max(outer, Math.hypot(Tp[i].x - c.x, Tp[i].z - c.z), Math.hypot(Bg[i].x - c.x, Bg[i].z - c.z)); top = Math.max(top, Tp[i].y); }
  const tanAt = (i, e) => { const t = th[i]; return sv3(-Math.sin(t) * dir, 0, Math.cos(t) * dir).multiplyScalar(e); };
  return { dir, sweep, first: { B: Bg[0], T: Tp[0], tan: tanAt(0, 1) }, last: { B: Bg[NP], T: Tp[NP], tan: tanAt(NP, 1) }, outer: outer + 0.25, top: top + 0.6 + Pc.cLen * 0.3 };
}

/* ---------- the band between two creases (or a free tail) ---------- */
function surfBridge(bd, M0, t0, hl0, u0, M1, t1, hl1, u1, c0, c1, clearAt, hardEnds) {
  const Ld = M0.distanceTo(M1), n = THREE.MathUtils.clamp(Math.round(Ld / 0.3), 8, 56), tl = THREE.MathUtils.clamp(Ld * 0.85, 0.8, 4);
  let T0 = t0.clone(), T1 = t1.clone();
  if (clearAt) { // a crease that faces away from where the band has to go is turned toward it, so the band never loops back on itself
    const chord = sv3().subVectors(M1, M0).setY(0); if (chord.lengthSq() > 1e-6) { chord.normalize();
      const soften = (t) => { const h = t.clone().setY(0); if (h.lengthSq() < 1e-6) return t; h.normalize(); const d = h.dot(chord); if (d >= 0.35) return t; return h.lerp(chord, THREE.MathUtils.clamp((0.35 - d) / 1.35, 0, 1) ** 0.8).normalize(); };
      T0 = soften(T0); T1 = soften(T1); } }
  const m0 = T0.multiplyScalar(tl), m1 = T1.multiplyScalar(tl);
  const C = [], Tn = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    C.push(sv3().addScaledVector(M0, h00).addScaledVector(m0, h10).addScaledVector(M1, h01).addScaledVector(m1, h11));
    const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1, d01 = -6 * t2 + 6 * t, d11 = 3 * t2 - 2 * t;
    Tn.push(sv3().addScaledVector(M0, d00).addScaledVector(m0, d10).addScaledVector(M1, d01).addScaledVector(m1, d11).normalize());
  }
  { const calm = THREE.MathUtils.clamp((Ld - 1.5) / 3, 0, 1), side = sv3().crossVectors(sv3(0, 1, 0), sv3().subVectors(M1, M0)).normalize(), sg = ((M0.x * 7.3 + M0.z * 3.1) % 2) > 1 ? 1 : -1;
    for (let i = 1; i < n; i++) { const t = i / n; C[i].addScaledVector(side, sg * 0.09 * Ld * calm * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t)); } }
  // heights: ease between the two ends, rise over what is in the way, keep the whole band off the floor
  const hlAt = (t) => { const hmid = 0.62, e = hl0 * (1 - t) + hl1 * t; return hmid + (e - hmid) * Math.pow(1 - Math.sin(Math.PI * t), 1.4); };
  const phiAt = (t) => (0.3 + 0.45 * THREE.MathUtils.clamp((Ld - 1.5) / 3, 0, 1)) * surfSm(THREE.MathUtils.clamp((t - 0.1) / 0.28, 0, 1)) * (1 - surfSm(THREE.MathUtils.clamp((t - 0.62) / 0.28, 0, 1)));
  const clr = C.map((p, i) => (clearAt && i > 0 && i < n ? clearAt(p.x, p.z) + 0.2 : 0));
  const lift = 0.55 + 0.07 * Ld;
  const y = C.map((p, i) => { const t = i / n; return Math.max(M0.y + (M1.y - M0.y) * surfSm(t) + lift * Math.sin(Math.PI * t), clr[i], hlAt(t) * Math.abs(Math.cos(phiAt(t))) + 0.08); });
  for (let pass = 0; pass < 8; pass++) { const o = y.slice(); for (let i = 1; i < n; i++) y[i] = Math.max(clr[i], (o[i - 1] + 2 * o[i] + o[i + 1]) / 4, hlAt(i / n) * Math.abs(Math.cos(phiAt(i / n))) + 0.08); }
  const A = [], B = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = C[i]; p.y = i === 0 ? M0.y : i === n ? M1.y : y[i];
    const tg = Tn[i], vv = sv3().addScaledVector(u0, 1 - t).addScaledVector(u1, t); vv.addScaledVector(tg, -vv.dot(tg)); if (vv.lengthSq() < 1e-8) vv.set(0, 1, 0); vv.normalize();
    const pp = sv3().crossVectors(tg, sv3(0, 1, 0)); if (pp.lengthSq() < 1e-8) pp.set(1, 0, 0); pp.normalize();
    const ph = phiAt(t), roll = 0.12 * Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t) * (i > 0 && i < n ? 1 : 0);
    let u = sv3().addScaledVector(vv, Math.cos(ph)).addScaledVector(pp, Math.sin(ph)).normalize();
    if (roll) u = u.clone().multiplyScalar(Math.cos(roll)).addScaledVector(sv3().crossVectors(tg, u), Math.sin(roll));
    const hl = hlAt(t);
    A.push(p.clone().addScaledVector(u, -hl)); B.push(p.clone().addScaledVector(u, hl));
  }
  if (hardEnds) { A[0].copy(hardEnds.a0); B[0].copy(hardEnds.b0); A[n].copy(hardEnds.a1); B[n].copy(hardEnds.b1); }
  surfStrip(bd, A, B, (u) => c0.clone().lerp(c1, u), true);
}

/* ---------- the whole structure ---------- */
async function buildSurface(grow) {
  const job = ++SURF.job;
  if (!S.pos.length || !V.length) return;
  const T = (S.day.length ? S.pos.map((p, i) => i).filter(i => S.pos[i].act) : S.pos.map((p, i) => i)).filter(i => V[i] && V[i].fig);
  if (!T.length) return;
  const sig = T.map(i => S.pos[i].work + '@' + V[i].x.toFixed(2) + ',' + V[i].z.toFixed(2)).join('|');
  if (sig === SURF.doneSig) return; // this very structure was just saved or discarded
  const meshes = await Promise.all(T.map(i => meshOf(S.pos[i].work).catch(() => null)));
  if (job !== SURF.job) return;
  try {
    const feet = V.map(vp => footprintOf(vp)), bd = surfBuilder(), tint = (i) => new THREE.Color(0xf3efe8).lerp(new THREE.Color(paletteFor(i)[2]), 0.1);
    const walls = [];
    T.forEach((i, k) => {
      const vp = V[i], pv = k ? V[T[k - 1]] : null, nx = k < T.length - 1 ? V[T[k + 1]] : null, seed = seedOf(vp.work);
      const lk = SURF.link, thIn = pv ? Math.atan2(pv.z - vp.z, pv.x - vp.x) : lk ? Math.atan2((lk.B.z + lk.T.z) / 2 - vp.z, (lk.B.x + lk.T.x) / 2 - vp.x) : (nx ? Math.atan2(nx.z - vp.z, nx.x - vp.x) + Math.PI * 0.8 : seed * 6.283);
      const thOut = nx ? Math.atan2(nx.z - vp.z, nx.x - vp.x) : thIn + Math.PI * 0.9;
      const limits = [];
      V.forEach((o, j) => { if (j === i || !o.bounds) return; const d = Math.hypot(o.x - vp.x, o.z - vp.z); if (d > 5) return; limits.push({ th: Math.atan2(o.z - vp.z, o.x - vp.x), max: T.includes(j) ? d / 2 - 0.05 : d - feet[j](Math.atan2(vp.z - o.z, vp.x - o.x)) - 0.22 }); });
      const rooms = (t) => { let a = 1e9; for (const l of limits) { const cs = Math.cos(t - l.th); if (cs > 0.05) a = Math.min(a, l.max / cs); } return a; };
      walls.push({ i, k, vp, x: vp.x, z: vp.z, thIn, thOut, col: tint(i), rooms });
    });
    // obstacles for the free spans: every sculpture, and the pavilions of the day (filled in as the walls are made)
    const obst = V.map((vp, j) => { let r = 0; for (let q = 0; q < 32; q++) r = Math.max(r, feet[j](q / 32 * 2 * Math.PI)); return { j, x: vp.x, z: vp.z, r: r + 0.3, top: (vp.bounds ? vp.bounds.max.y : 1.8) + 0.3 }; });
    const clearFor = (skip) => (x, z) => { let y = 0; for (const o of obst) { if (skip.includes(o.j)) continue; if (Math.hypot(x - o.x, z - o.z) < o.r) y = Math.max(y, o.top); } return y; };
    const R = walls.map((w) => surfWall(bd, { ...w, T, meshes, feet }));
    walls.forEach((w, k) => { obst[w.i].r = R[k].outer; obst[w.i].top = R[k].top; });
    const mid = (c) => c.B.clone().add(c.T).multiplyScalar(0.5), hlOf = (c) => c.T.distanceTo(c.B) / 2, upOf = (c) => c.T.clone().sub(c.B).normalize();
    const link = SURF.link, lastW = walls.length - 1;
    // chain order: wall, band (to the saved structure or a free tail), wall, band, ... wall, tail: panels are numbered in this order so the structure unfolds along it
    const make = (withTail) => {
      const b = surfBuilder();
      walls.forEach((w, k) => {
        const r = R[k]; surfWall(b, { ...w, T, meshes, feet });
        if (k === 0) {
          if (link) { // the new structure is joined to the end of the one saved before
            surfBridge(b, mid(link), link.tan, hlOf(link), upOf(link), mid(r.first), r.first.tan, hlOf(r.first), upOf(r.first), link.col, w.col, clearFor([w.i]), { a0: link.B.clone(), b0: link.T.clone(), a1: r.first.B.clone(), b1: r.first.T.clone() });
          } else { // tail rising from the first crease
            const tg = r.first.tan, Mc = mid(r.first), hl = hlOf(r.first), away = tg.clone().negate();
            const tip = Mc.clone().addScaledVector(away, 1.5).add(sv3(0, 2.3, 0)), perp = sv3(-away.z, 0, away.x);
            surfBridge(b, tip, sv3().subVectors(Mc, tip).normalize().add(sv3(0, -0.4, 0)).normalize(), 0.03, perp, Mc, tg, hl, upOf(r.first), w.col, w.col, null, { a0: tip.clone().addScaledVector(perp, -0.03), b0: tip.clone().addScaledVector(perp, 0.03), a1: r.first.B.clone(), b1: r.first.T.clone() });
          }
        }
        if (k < lastW) { const nxt = walls[k + 1], r2 = R[k + 1];
          surfBridge(b, mid(r.last), r.last.tan, hlOf(r.last), upOf(r.last), mid(r2.first), r2.first.tan, hlOf(r2.first), upOf(r2.first), w.col, nxt.col, clearFor([w.i, nxt.i]), { a0: r.last.B.clone(), b0: r.last.T.clone(), a1: r2.first.B.clone(), b1: r2.first.T.clone() });
        } else if (withTail) { // tail rising from the last crease
          const tg = r.last.tan, Mc = mid(r.last), hl = hlOf(r.last), perp = sv3(-tg.z, 0, tg.x);
          const tip = Mc.clone().addScaledVector(tg, 1.7).add(sv3(0, 2.5, 0)).addScaledVector(perp, 0.6);
          surfBridge(b, Mc, tg, hl, upOf(r.last), tip, sv3().subVectors(tip, Mc).normalize().add(sv3(0, 0.8, 0)).normalize(), 0.03, perp, w.col, w.col, null, { a0: r.last.B.clone(), b0: r.last.T.clone(), a1: tip.clone().addScaledVector(perp, -0.03), b1: tip.clone().addScaledVector(perp, 0.03) });
        }
      });
      return b.geometry();
    };
    if (job !== SURF.job) return;
    const { geo, lines, count } = make(true);
    surfDropCurrent();
    SURF.mesh = new THREE.Mesh(geo, surfMat); SURF.mesh.castShadow = true; SURF.mesh.receiveShadow = true; SURF.mesh.customDepthMaterial = surfDepth; SURF.mesh.frustumCulled = false;
    SURF.lines = new THREE.LineSegments(lines, surfLineMat); SURF.lines.frustumCulled = false; SURF.lines.visible = false; // outlines are off: the folds read from the shading alone
    SURF.group.add(SURF.mesh, SURF.lines); SURF.panels = count; SURF.dirty = false;
    const lw = R[lastW].last; SURF.cur = { make, sig, last: { B: lw.B.clone(), T: lw.T.clone(), tan: lw.tan.clone(), col: walls[lastW].col.clone() } };
    applyView();
    if (grow && S.view === 'surface') growSurface();
  } catch (e) { console.warn('surface:', e); }
}
/* ---------- keeping, discarding, and growing the structure over several diary entries ---------- */
function surfDropCurrent() {
  if (SURF.mesh) { SURF.group.remove(SURF.mesh, SURF.lines); SURF.mesh.geometry.dispose(); SURF.lines.geometry.dispose(); SURF.mesh = SURF.lines = null; }
  surfStopTween(); SURF.cur = null;
}
const surfOne = { value: 1 };
const surfStatic = (() => { // saved parts stay fully grown, whatever the growth animation of the current structure is doing
  const patch = (sh) => { surfGrowPatch(sh); sh.uniforms.uGrow = surfOne; };
  const patchMat = (sh) => { patch(sh); surfFadePatch(sh); };
  const mat = surfGlass(); mat.onBeforeCompile = patchMat;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); depth.onBeforeCompile = patch;
  const line = new THREE.LineBasicMaterial({ color: 0x38342f, transparent: true, opacity: 0.85 }); line.onBeforeCompile = patch;
  return { mat, depth, line };
})();
function saveSurface() {
  const cur = SURF.cur; if (!cur) return;
  const { geo, lines } = cur.make(true), // each saved structure is complete on its own, with both tails
    m = new THREE.Mesh(geo, surfStatic.mat), l = new THREE.LineSegments(lines, surfStatic.line); l.visible = false;
  m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = surfStatic.depth; m.frustumCulled = false; l.frustumCulled = false;
  SURF.group.add(m, l); SURF.saved.push({ mesh: m, lines: l }); SURF.doneSig = cur.sig; // no link: the next structure starts on its own
  surfDropCurrent(); renderer.shadowMap.needsUpdate = true; applyView();
}
function discardSurface() { const cur = SURF.cur; if (!cur) return; SURF.doneSig = cur.sig; surfDropCurrent(); renderer.shadowMap.needsUpdate = true; applyView(); }
function clearSavedSurface() {
  for (const s of SURF.saved) { SURF.group.remove(s.mesh, s.lines); s.mesh.geometry.dispose(); s.lines.geometry.dispose(); }
  SURF.saved = []; SURF.link = null; SURF.doneSig = ''; renderer.shadowMap.needsUpdate = true; applyView();
  buildSurface(S.view === 'surface');
}
function surfStopTween() { if (SURF.grow) { const k = tweens.indexOf(SURF.grow); if (k >= 0) tweens.splice(k, 1); SURF.grow = null; } }
function growSurface() {
  if (!SURF.mesh) return;
  surfStopTween(); SURF.group.visible = true;
  if (reduceMotion) { surfU.uGrow.value = 1; return; }
  surfU.uGrow.value = 0;
  SURF.grow = tween(Math.min(6, 2.4 + SURF.panels * 0.012), (e) => { surfU.uGrow.value = e; }, () => { SURF.grow = null; renderer.shadowMap.needsUpdate = true; });
}
function retractSurface() {
  if (!SURF.mesh || !SURF.group.visible || reduceMotion) return;
  surfStopTween(); const from = surfU.uGrow.value;
  SURF.grow = tween(0.6, (e) => { surfU.uGrow.value = from * (1 - e); }, () => { SURF.grow = null; SURF.dirty = true; });
}

/* ---------- hooks into the existing views ---------- */
{
  let surfUI = function () {};
  const _applyView = applyView, _setView = setView, _buildSkin = buildSkin, _arrangeBoard = arrangeBoard;
  const _applyViewTo = applyViewTo;
  // "Surface only": inside the Surface view the sculptures can be hidden, leaving the folded structure alone on its plinths
  const only = () => S.view === 'surface' && SURF.only;
  applyViewTo = function (vp) { _applyViewTo(vp); if (only()) { if (vp.fig) vp.fig.visible = false; if (vp.bones) vp.bones.visible = false; } };
  applyView = function () {
    _applyView(); SURF.group.visible = S.view === 'surface' && (!!SURF.mesh || SURF.saved.length > 0); surfUI();
    surfBtn.hidden = S.view !== 'surface'; surfBtn.setAttribute('aria-pressed', String(!!SURF.only)); surfPlace();
    courtBtn.setAttribute('aria-selected', String(SURF.court)); courtBtn.setAttribute('aria-pressed', String(SURF.court));
    const scan = scene.getObjectByName('VA_Hall_Scan'); if (scan) scan.visible = SURF.court;
    const floor = scene.getObjectByName('venus-mosaic-floor'); if (floor) floor.visible = SURF.court; // the floor goes with the hall
    renderer.shadowMap.needsUpdate = true;
  };
  // "Surface only" sits right under the Surface tab
  const surfPlace = () => {
    const tab = document.querySelector('#views [data-view="surface"]'), nav = document.getElementById('views'); if (!tab || !nav) return;
    const a = tab.getBoundingClientRect(), n = nav.getBoundingClientRect(); if (!a.width) return;
    surfBtn.style.left = Math.max(8, Math.round(a.left + a.width / 2 - surfBtn.offsetWidth / 2)) + 'px'; surfBtn.style.top = Math.round(n.bottom + 8) + 'px';
  };
  window.addEventListener('resize', surfPlace); if (document.fonts && document.fonts.ready) document.fonts.ready.then(surfPlace);
  // "Cast Court" next to Surface: shows or hides the scanned V&A hall around the sculptures and floor
  const courtBtn = document.createElement('button');
  courtBtn.type = 'button'; courtBtn.id = 'courtBtn'; courtBtn.textContent = 'Cast Court'; courtBtn.setAttribute('role', 'tab');
  { const st0 = document.querySelector('#views [data-view="surface"]'); if (st0) { courtBtn.className = st0.className; st0.after(courtBtn); } }
  courtBtn.addEventListener('click', () => { SURF.court = !SURF.court; applyView(); });
  const surfBtn = document.createElement('button');
  surfBtn.id = 'surfOnly'; surfBtn.type = 'button'; surfBtn.hidden = true; surfBtn.textContent = 'Surface only'; surfBtn.setAttribute('aria-pressed', 'false');
  const st = document.createElement('style');
  st.textContent = '#surfOnly{position:fixed;left:22px;top:150px;z-index:20;border:0;border-radius:999px;padding:7px 16px;font:500 12px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;color:#4a3a45;background:linear-gradient(135deg,rgba(255,250,243,.92),rgba(246,226,222,.88));box-shadow:0 4px 18px rgba(80,50,60,.14);cursor:pointer}#surfOnly[hidden]{display:none}#surfOnly[aria-pressed=true]{color:#fff6e6;background:linear-gradient(135deg,#3a2832,#5a3a48)}';
  document.head.appendChild(st); document.body.appendChild(surfBtn);
  surfBtn.addEventListener('click', () => { SURF.only = !SURF.only; applyView(); });
  // buttons under the diary text: keep or delete the structure of the current entry; the next entry joins what was kept
  const diary = document.getElementById('journal'), row = document.createElement('div');
  row.className = 'row'; row.id = 'surfRow';
  const mk = (t, id) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.id = id; b.textContent = t; row.appendChild(b); return b; };
  const sBtn = mk('Save surface', 'surfSave'), dBtn = mk('Delete surface', 'surfDel'), cBtn = mk('Clear all', 'surfClear');
  const note = document.createElement('p'); note.className = 'small muted'; note.id = 'surfNote'; note.style.margin = '6px 2px 0';
  const anchor = diary && (diary.parentElement.querySelector('.row') || diary);
  if (anchor) { anchor.after(row); row.after(note); }
  surfUI = function () {
    const has = !!SURF.cur, n = SURF.saved.length;
    sBtn.disabled = dBtn.disabled = !has; cBtn.hidden = !n;
    note.textContent = has ? 'Save keeps this structure as it is; the next entry makes a separate one. Delete throws it away.' : n ? n + ' saved. Write another entry and generate to make another separate structure.' : 'Generate a sequence, then save its Surface structure.';
  };
  sBtn.addEventListener('click', saveSurface); dBtn.addEventListener('click', discardSurface); cBtn.addEventListener('click', clearSavedSurface);
  surfUI();
  setView = function (v) {
    if (!v) return; // the Cast Court button lives in the same tab row but is not a view
    const prev = S.view;
    // the hall and floor only change when Cast Court is clicked: switching views never hides them
    _setView(v);
    if (v === 'surface') { clearSculptureFocus(); if (SURF.dirty || !SURF.mesh) buildSurface(true); else growSurface(); surfUI(); }
  };
  buildSkin = async function () { await _buildSkin(); SURF.dirty = true; await buildSurface(S.view === 'surface'); };
  arrangeBoard = function (...a) { if (a[1]) retractSurface(); return _arrangeBoard.apply(this, a); };
}

/* ---------- the skin as gauze: slightly see-through, and a little more sway ---------- */
{
  const gauze = (sh) => {
    silkPatch(sh);
    sh.vertexShader = sh.vertexShader.replace('vRibU = aU;', `transformed += aB * (sin(6.2831853 * (aS / 3.4 - uTime * 0.11) + aL * 0.9 + 1.3) * (0.05 + 0.07 * abs(aL)) + 0.5 * sin(6.2831853 * (aS / 1.7 + uTime * 0.07) - aL * 1.4) * 0.028 * abs(aL)) * ribK;
      vRibU = aU;`);
  };
  silkMat.onBeforeCompile = gauze; silkDepth.onBeforeCompile = gauze;
  silkMat.transparent = true; silkMat.opacity = 0.66; silkMat.depthWrite = false; silkMat.sheen = 1; silkMat.roughness = 0.5; silkMat.clearcoat = 0; silkMat.envMapIntensity = 0.9;
  silkMat.needsUpdate = true; silkDepth.needsUpdate = true;
}

/* ---------- more sample diaries for "A day in my life": every one is at least eight activities, so each fills the hall with eight or more sculptures ---------- */
{
  const MORE = {
    museum: ['Sample · Museum day', '7am woke up late in bed, 8am washed my hair, walked to the station, took the tube to the museum, stood in a queue for tickets, walked through the galleries, crouched to tie my shoe, had lunch at the café, evening lying on the sofa scrolling.'],
    garden: ['Sample · Garden weekend', 'Woke at nine and stayed in bed, put on my shoes by the door, walked to the market, crouched to pick up apples, sat on a bench with coffee, cooked a big pot of soup, lay on the couch to watch a movie, went to sleep.'],
    studio: ['Sample · Studio crunch', 'Woke up at seven, brushed my teeth, went for a run, sat at my desk modelling, standing at the printer, sat in the review meeting, crouched on the floor to assemble the model, walked home, lay down on the couch, went to sleep.'],
    travel: ['Sample · Travel day', '6am woke in a hotel bed, took a shower and washed my hair, walked to the station, sat on the train for three hours, stood in a queue at customs, walked along the river, crouched to look at the shells, had dinner by the water, evening on the sofa scrolling photos, went to sleep early.'],
    dance: ['Sample · Dance rehearsal', 'Woke up stiff in bed, felt cold at the window, walked to the studio, sat to lace my boots, crouched to stretch, standing at the barre rehearsing, looked back in the mirror, sat to eat lunch, lay on the couch to rest, went to sleep.'],
    rainy: ['Sample · Rainy Sunday', 'Woke late and stayed in bed, standing at the window, walked to the bakery, sat reading by the window, crouched to pick up the dropped keys, lay on the sofa watching the rain, cooked a stew, had dinner, scrolling in bed, went to sleep.'],
  };
  const sel = document.getElementById('samples');
  for (const [k, [label, text]] of Object.entries(MORE)) {
    SAMPLE_DAYS[k] = text;
    if (sel && !sel.querySelector('option[value="' + k + '"]')) { const o = document.createElement('option'); o.value = k; o.textContent = label; sel.appendChild(o); }
  }
}

/* ---------- the surface material: see-through with a little refraction, and a cheaper see-through look when frames get slow ---------- */
{
  const mats = () => [surfMat, surfStatic.mat];
  let cheap = false;
  const setCheap = (on) => {
    if (on === cheap) return; cheap = on;
    for (const m of mats()) { m.transmission = on ? 0 : 0.1; m.needsUpdate = true; }
  };
  setInterval(() => { if (SURF.group.visible && window.__prNow) setCheap(window.__prNow() < 0.95); }, 2500);
}
