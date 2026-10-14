
/* ---------------------------------------------------------------
   The skin as cast-plaster ribbons ("表皮")

   Pose ribbons — every sculpture gets its own. A band wraps the body a few
   centimetres off its silhouette (read from the mesh, height by height, all
   round) and leaves it at the shoulders in a rising scroll. Gesture ribbons
   fly off raised or extended hands (atlas skeleton candidates). Without such a
   hand, a second band winds down the body and settles on the plinth. Lying
   figures get bands that drape over the body in waves and rise at the head.

   No ribbons in 雕塑序列; 表皮序列 shows the sequence ribbon, 叠加 adds the pose ribbons of the
   sculptures outside the day, 雕塑与丝带 shows every sculpture with its own pose ribbons.

   Sequence ribbon (the "表皮序列" view) — one giant ribbon with a thinner second
   strand. It comes down from the vault onto the day's first sculpture, coils
   down around it and up again, arcs high over the board to the next sculpture of
   the day, and so on, then rises away. Coils stay outside the pose ribbons; arcs
   pass above every sculpture under them, at heights that differ from arc to arc,
   so the structure never cuts through itself or a sculpture.

   A ribbon is a swept strip: a Catmull-Rom centre line, a frame that keeps the
   band upright (so it faces the body while it wraps), roll for twists, ruffled
   edges like cast drapery, and a few centimetres of thickness. Indices are
   ordered along the length, so drawRange lets a ribbon grow.
---------------------------------------------------------------- */
const RIBBON_STYLES = {
  drape: { zh: '褶皱丝带', ruffle: 1, M: 8, flat: false },
  smooth: { zh: '平滑丝带', ruffle: 0.12, M: 6, flat: false },
  fold: { zh: '折面丝带', ruffle: 0.55, M: 3, flat: true },
};
const ribbonStyle = () => RIBBON_STYLES[S.skinStyle] || RIBBON_STYLES.drape;
const RIBBON_WHITE = new THREE.Color(0xe7e2d9); // matt plaster, a little warmer and greyer than the glazed sculptures
const ribbonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.45 });
const RIB_UP = new THREE.Vector3(0, 1, 0);
const rv3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ctrl: [{ p, w, roll, amp, col (THREE.Color), up?, free? }] → BufferGeometry (or null).
   o.silk adds the attributes the silk shader needs (aU, aS, aL, aC, aB); o.keep stores the sampled frames in userData.samples. */
function sweepRibbon(ctrl, o = {}) {
  const n = ctrl.length;
  if (n < 2) return null;
  const st = ribbonStyle(), M = o.M || st.M, th = o.thick || 0.012, freq = o.freq || 1.6, cup = o.cup == null ? 0.1 : o.cup, ph = o.phase || 0;
  const curve = new THREE.CatmullRomCurve3(ctrl.map(c => c.p), false, 'centripetal');
  curve.arcLengthDivisions = Math.max(200, n * 24);
  const L = curve.getLength();
  if (!(L > 0.02)) return null;
  const N = Math.max(10, Math.min(o.maxN || 2600, Math.round(L * (o.perMetre || 26))));
  const C = M + 1, half = N * C;
  const pos = new Float32Array(half * 6), col = new Float32Array(half * 6), wob = o.wobble == null ? 1 : o.wobble, ampK = o.ampScale == null ? st.ruffle : o.ampScale;
  const silk = !!o.silk, aU = silk ? new Float32Array(half * 2) : null, aS = silk ? new Float32Array(half * 2) : null, aL = silk ? new Float32Array(half * 2) : null;
  const aC = silk ? new Float32Array(half * 6) : null, aB = silk ? new Float32Array(half * 6) : null, samples = o.keep ? [] : null;
  const P = rv3(), Pp = rv3(), T = rv3(), A = rv3(), Au = rv3(), Ap = rv3(), R = rv3(), B = rv3(), X = rv3(), Uc = rv3(), c = new THREE.Color();
  let hasPrev = false, s = 0;
  for (let k = 0; k < N; k++) {
    const t = curve.getUtoTmapping(k / (N - 1));
    curve.getPoint(t, P); curve.getTangent(t, T).normalize();
    if (k) s += P.distanceTo(Pp); Pp.copy(P);
    const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), a = f - i, c0 = ctrl[i], c1 = ctrl[i + 1];
    const w = (c0.w + (c1.w - c0.w) * a) * (1 + wob * (0.07 * Math.sin(s * 2.3 + ph) + 0.035 * Math.sin(s * 5.3 + 2 * ph)));
    const roll = c0.roll + (c1.roll - c0.roll) * a, amp = (c0.amp + (c1.amp - c0.amp) * a) * ampK;
    c.copy(c0.col).lerp(c1.col, a);
    Uc.copy(c0.up || RIB_UP).lerp(c1.up || RIB_UP, a);
    // frame: the band's width follows the "up" vector (world up, or the limb / body axis); where the line runs along it, carry the last frame
    Au.copy(Uc).addScaledVector(T, -T.dot(Uc));
    const strength = Au.length() / Math.max(1e-6, Uc.length());
    if (hasPrev) {
      A.copy(Ap).addScaledVector(T, -T.dot(Ap)).normalize();
      if (strength > 1e-3) A.lerp(Au.normalize(), THREE.MathUtils.smoothstep(strength, 0.15, 0.45)).normalize();
    } else if (strength > 0.15) A.copy(Au).normalize();
    else A.set(1, 0, 0).addScaledVector(T, -T.x).normalize();
    Ap.copy(A); hasPrev = true;
    R.copy(A).multiplyScalar(Math.cos(roll)).addScaledVector(X.crossVectors(T, A), Math.sin(roll));
    B.crossVectors(T, R).normalize();
    if (samples) samples.push({ p: P.clone(), R: R.clone(), B: B.clone(), T: T.clone(), w, s, free: (c0.free || 0) + ((c1.free || 0) - (c0.free || 0)) * a, g: (c0.g == null ? 1 : c0.g) + ((c1.g == null ? 1 : c1.g) - (c0.g == null ? 1 : c0.g)) * a, col: c.clone() });
    for (let j = 0; j < C; j++) {
      const v = -1 + 2 * j / M, av = Math.abs(v);
      const d = amp * (Math.sin(6.283 * freq * s + 2.2 * v + ph) * (0.3 + 0.7 * Math.pow(av, 1.6)) + 0.45 * Math.sin(6.283 * freq * 1.83 * s - 1.4 * v + 2 * ph) * v * v);
      const off = cup * w * (v * v - 0.33) + d, lat = v * w / 2;
      const shade = 0.9 + 0.1 * (amp > 1e-5 ? Math.max(-1, Math.min(1, d / amp)) : 0) - 0.06 * Math.pow(av, 6);
      for (let side = 0; side < 2; side++) {
        const q = (side * half + k * C + j) * 3, nn = off + (side ? -0.5 : 0.5) * th;
        pos[q] = P.x + R.x * lat + B.x * nn; pos[q + 1] = P.y + R.y * lat + B.y * nn; pos[q + 2] = P.z + R.z * lat + B.z * nn;
        col[q] = c.r * shade; col[q + 1] = c.g * shade; col[q + 2] = c.b * shade;
        if (silk) { const r1 = q / 3; aU[r1] = k / (N - 1); aS[r1] = s; aL[r1] = v; aC[q] = P.x; aC[q + 1] = P.y; aC[q + 2] = P.z; aB[q] = B.x; aB[q + 1] = B.y; aB[q + 2] = B.z; }
      }
    }
  }
  // indices: start cap, one block per segment (top, bottom, both edges), end cap — so drawRange grows the ribbon along its length
  const idx = new Uint32Array(6 * M + (N - 1) * (12 * M + 12) + 6 * M);
  let m = 0;
  const ti = (k, j) => k * C + j, bi = (k, j) => half + k * C + j;
  const tri = (a, b, d) => { idx[m++] = a; idx[m++] = b; idx[m++] = d; };
  const quad = (a, b, d, e) => { tri(a, b, d); tri(a, d, e); };
  for (let j = 0; j < M; j++) quad(ti(0, j), ti(0, j + 1), bi(0, j + 1), bi(0, j));
  const cap0 = m;
  for (let k = 0; k < N - 1; k++) {
    for (let j = 0; j < M; j++) {
      tri(ti(k, j), ti(k + 1, j), ti(k, j + 1)); tri(ti(k, j + 1), ti(k + 1, j), ti(k + 1, j + 1));
      tri(bi(k, j), bi(k, j + 1), bi(k + 1, j)); tri(bi(k, j + 1), bi(k + 1, j + 1), bi(k + 1, j));
    }
    quad(ti(k, 0), bi(k, 0), bi(k + 1, 0), ti(k + 1, 0));
    quad(ti(k, M), ti(k + 1, M), bi(k + 1, M), bi(k, M));
  }
  const seg = (m - cap0) / (N - 1);
  for (let j = 0; j < M; j++) quad(ti(N - 1, j), bi(N - 1, j), bi(N - 1, j + 1), ti(N - 1, j + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (silk) {
    g.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1)); g.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
    g.setAttribute('aC', new THREE.BufferAttribute(aC, 3)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 3));
  }
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.grow = { cap0, seg, segs: N - 1, total: m };
  g.userData.length = L;
  if (samples) g.userData.samples = samples;
  return g;
}
function growRibbon(g, f) {
  const u = g && g.userData.grow; if (!u) return;
  g.setDrawRange(0, f >= 1 ? u.total : u.cap0 + Math.round(clamp01(f) * u.segs) * u.seg);
}
function ribbonMesh(geo) { const m = new THREE.Mesh(geo, ribbonMat); m.castShadow = true; m.receiveShadow = true; return m; }
/* grow every ribbon mesh in a group from 0 to 1 (after an optional delay) */
function growGroup(grp, dur, delay = 0) {
  const parts = grp.isMesh ? [grp, ...grp.children] : grp.children;
  if (reduceMotion) { parts.forEach(p => growRibbon(p.geometry, 1)); return null; }
  parts.forEach(p => growRibbon(p.geometry, 0));
  return tween(dur + delay, (e, raw) => { const f = clamp01((raw * (dur + delay) - delay) / dur); const k = f * f * (3 - 2 * f); parts.forEach(p => growRibbon(p.geometry, k)); });
}

/* ---------- reading the body ---------- */
/* vertical figures: centre and radius all round at each height (16 directions, 20 levels), padded so the band never dips into gaps */
function verticalProfile(pos, H) {
  const NL = 20, K = 16, cx = new Float32Array(NL), cz = new Float32Array(NL), R = Array.from({ length: NL }, () => new Float32Array(K));
  const x0 = new Float32Array(NL).fill(1e9), x1 = new Float32Array(NL).fill(-1e9), z0 = new Float32Array(NL).fill(1e9), z1 = new Float32Array(NL).fill(-1e9);
  const lev = (y) => Math.max(0, Math.min(NL - 1, Math.floor(y / H * NL)));
  for (let i = 0; i < pos.length; i += 3) { const l = lev(pos[i + 1]); x0[l] = Math.min(x0[l], pos[i]); x1[l] = Math.max(x1[l], pos[i]); z0[l] = Math.min(z0[l], pos[i + 2]); z1[l] = Math.max(z1[l], pos[i + 2]); }
  for (let l = 0; l < NL; l++) {
    if (x0[l] > x1[l]) { const m = [l - 1, l + 1].find(q => q >= 0 && q < NL && x0[q] <= x1[q]); if (m != null) { x0[l] = x0[m]; x1[l] = x1[m]; z0[l] = z0[m]; z1[l] = z1[m]; } else { x0[l] = z0[l] = -0.1; x1[l] = z1[l] = 0.1; } }
    cx[l] = (x0[l] + x1[l]) / 2; cz[l] = (z0[l] + z1[l]) / 2;
  }
  for (let i = 0; i < pos.length; i += 3) {
    const l = lev(pos[i + 1]), dx = pos[i] - cx[l], dz = pos[i + 2] - cz[l];
    const k = Math.floor(((Math.atan2(dz, dx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * K) % K;
    R[l][k] = Math.max(R[l][k], Math.hypot(dx, dz));
  }
  for (let pass = 0; pass < 2; pass++) for (let l = 0; l < NL; l++) {
    const r = R[l], o = Float32Array.from(r);
    for (let k = 0; k < K; k++) r[k] = Math.max(o[k], o[(k + 1) % K] * 0.9, o[(k + K - 1) % K] * 0.9, (l ? R[l - 1][k] : 0) * 0.86, (l < NL - 1 ? R[l + 1][k] : 0) * 0.86, 0.06);
  }
  return (y, th) => {
    const f = Math.max(0, Math.min(NL - 1, y / H * NL - 0.5)), l = Math.floor(f), a = f - l, l2 = Math.min(NL - 1, l + 1);
    const g = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K - 0.5, k0 = (Math.floor(g) + K) % K, k1 = (k0 + 1) % K, b = g - Math.floor(g);
    const r = (q) => R[q][k0] * (1 - b) + R[q][k1] * b;
    return { x: cx[l] * (1 - a) + cx[l2] * a, z: cz[l] * (1 - a) + cz[l2] * a, r: r(l) * (1 - a) + r(l2) * a };
  };
}
/* lying figures: along the longer horizontal axis, the body's side limits and top at each station */
function lyingProfile(pos, b) {
  const ax = (b.max.x - b.min.x) >= (b.max.z - b.min.z) ? 0 : 2, lat = 2 - ax, NS = 16;
  const a0 = ax ? b.min.z : b.min.x, a1 = ax ? b.max.z : b.max.x;
  const lo = new Float32Array(NS).fill(1e9), hi = new Float32Array(NS).fill(-1e9), top = new Float32Array(NS);
  for (let i = 0; i < pos.length; i += 3) {
    const s = Math.max(0, Math.min(NS - 1, Math.floor((pos[i + ax] - a0) / (a1 - a0) * NS)));
    lo[s] = Math.min(lo[s], pos[i + lat]); hi[s] = Math.max(hi[s], pos[i + lat]); top[s] = Math.max(top[s], pos[i + 1]);
  }
  for (let s = 0; s < NS; s++) if (lo[s] > hi[s]) { lo[s] = -0.15; hi[s] = 0.15; top[s] = 0.15; }
  const T = Float32Array.from(top, (v, s) => Math.max(v, (top[s - 1] || 0) * 0.9, (top[s + 1] || 0) * 0.9));
  const avg = (from, to) => { let x = 0; for (let s = from; s < to; s++) x += T[s]; return x / (to - from); };
  const at = (u) => {
    const f = Math.max(0, Math.min(NS - 1, u * NS - 0.5)), s = Math.floor(f), a = f - s, s2 = Math.min(NS - 1, s + 1);
    return { a: a0 + (a1 - a0) * u, lc: ((lo[s] + hi[s]) * (1 - a) + (lo[s2] + hi[s2]) * a) / 2, hw: Math.max(0.08, ((hi[s] - lo[s]) * (1 - a) + (hi[s2] - lo[s2]) * a) / 2), top: T[s] * (1 - a) + T[s2] * a };
  };
  return { ax, at, headAtEnd: avg(NS - 4, NS) >= avg(0, 4) };
}
/* hands that make a gesture: leaves of the skeleton candidate that are raised or held out from the body */
function gestureLimbs(skel, H) {
  if (!skel || !skel.length) return [];
  const f = skel.reduce((a, b) => (b.segs.length > a.segs.length ? b : a));
  const node = new Map(), P = [], adj = [];
  const id = (p) => { const k = p.map(v => Math.round(v * 200)).join(','); if (!node.has(k)) { node.set(k, P.length); P.push(rv3(...p)); adj.push([]); } return node.get(k); };
  for (let i = 0; i + 1 < f.segs.length; i += 2) { const a = id(f.segs[i]), b = id(f.segs[i + 1]); if (a !== b && !adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); } }
  const out = [], hs = H / 1.8;
  adj.forEach((nb, leaf) => {
    if (nb.length !== 1) return;
    const path = [leaf]; let prev = -1, cur = leaf, len = 0;
    for (;;) {
      const nx = adj[cur].filter(q => q !== prev); if (nx.length !== 1 || path.length > 6) break;
      len += P[cur].distanceTo(P[nx[0]]); prev = cur; cur = nx[0]; path.push(cur);
      if (adj[cur].length !== 2) break;
    }
    if (path.length < 3 || len < 0.2 * H) return;
    const pts = path.map(q => P[q]).reverse(), tip = pts[pts.length - 1], root = pts[0];
    const lateral = Math.hypot(tip.x, tip.z), raised = tip.y > 0.78 * H, held = lateral > 0.36 * hs && tip.y > 0.45 * H;
    const score = raised || held ? lateral + Math.max(0, tip.y - root.y) * 0.8 : 0;
    if (score > 0.3 * hs) out.push({ pts, tip, score, dir: tip.clone().sub(pts[pts.length - 2]).normalize() });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 1);
}

/* ---------- pose ribbons: one recipe per sculpture (control points in the figure's own frame, y = 0 on the plinth top) ---------- */
function seedOf(id) { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007; }
/* a scroll: rise outward from E, then curl in the vertical plane of `out` (drifting sideways so the turns never touch) */
function volute(E, out, side, rise, reach, r0, turns = 0.95) {
  const o = rv3(out.x, 0, out.z); if (o.lengthSq() < 1e-6) o.set(1, 0, 0); o.normalize();
  const sd = side.clone().normalize(), pts = [];
  pts.push(E.clone().addScaledVector(o, reach * 0.3).addScaledVector(RIB_UP, rise * 0.32).addScaledVector(sd, 0.05));
  pts.push(E.clone().addScaledVector(o, reach * 0.7).addScaledVector(RIB_UP, rise * 0.72).addScaledVector(sd, 0.1));
  const Cc = E.clone().addScaledVector(o, reach).addScaledVector(RIB_UP, rise).addScaledVector(sd, 0.12);
  const n = Math.round(12 * turns);
  for (let i = 1; i <= n; i++) {
    const t = i / n, al = Math.PI + turns * 2 * Math.PI * t, r = r0 * (1 - 0.45 * t); // start on the inner side of the curl, go up and over outwards
    pts.push(Cc.clone().addScaledVector(o, Math.cos(al) * r).addScaledVector(RIB_UP, -Math.sin(al) * r).addScaledVector(sd, 0.12 + 0.22 * t));
  }
  return pts;
}
const recipeCache = new Map();
function poseRecipe(mesh, work) {
  if (recipeCache.has(work)) return recipeCache.get(work);
  const r = REC[work] || {}, cls = r.cls || 'standing', b = mesh.bounds, H = Math.max(0.3, b.max.y), seed = seedOf(work);
  const pos = mesh.geo.attributes.position.array, hs = Math.max(0.55, Math.min(1.25, H / 1.8));
  const base = RIBBON_WHITE.clone().lerp(new THREE.Color((S.palettes[cls] || DEFAULT_PALETTES.standing)[2]), 0.12);
  const pt = (p, w, roll, amp, up) => ({ p, w, roll, amp, col: base, up });
  const ribbons = [];
  const plinthX = Math.max(0.66, (b.max.x - b.min.x) / 2 + 0.26), plinthZ = Math.max(0.6, (b.max.z - b.min.z) / 2 + 0.24);
  if (cls === 'reclining' || cls === 'horizontal') {
    const prof = lyingProfile(pos, b), axis = prof.ax ? rv3(0, 0, 1) : rv3(1, 0, 0), head = prof.headAtEnd ? 1 : -1;
    const toP = (q, latOff, y) => (prof.ax ? rv3(q.lc + latOff, y, q.a) : rv3(q.a, y, q.lc + latOff));
    for (const band of [0, 1]) {
      const ctrl = [], n = band ? 26 : 34, u0 = band ? 0.12 : 0.02, u1 = band ? 0.78 : 0.98, clr = band ? 0.15 : 0.085;
      for (let i = 0; i <= n; i++) {
        const u = i / n, uu = u0 + (u1 - u0) * u, q = prof.at(prof.headAtEnd ? uu : 1 - uu);
        const phi = Math.PI / 2 + (band ? -1.05 : 1.2) * Math.sin(2 * Math.PI * (band ? 1.05 : 1.35) * u + seed * 6.283 + band * 1.7);
        const w = (band ? 0.075 : 0.11) * Math.min(1, u * 6 + 0.15) * (band ? Math.min(1, (1 - u) * 5 + 0.2) : 1);
        ctrl.push(pt(toP(q, (q.hw + clr) * Math.cos(phi), Math.max(0.05, (q.top + clr) * Math.sin(phi))), w, 0, 0.012, axis));
      }
      if (!band) { // the head end rises into a scroll
        const E = ctrl[ctrl.length - 1].p, side = rv3(axis.z, 0, axis.x).multiplyScalar(seed < 0.5 ? 1 : -1);
        volute(E, axis.clone().multiplyScalar(head), side, 0.55 + 0.35 * hs, 0.34, 0.2).forEach((p, i, a) => ctrl.push(pt(p, 0.11 + 0.09 * Math.sin(Math.PI * Math.min(1, (i + 1) / a.length * 1.15)), (i + 1) * 0.12 * (seed < 0.5 ? 1 : -1), 0.025)));
        ctrl[ctrl.length - 1].w = 0.02;
      } else { // the second band settles on the plinth beyond the feet
        const last = ctrl[ctrl.length - 1].p, d = axis.clone().multiplyScalar(-head);
        const lim = (p) => { const e = Math.hypot(p.x / plinthX, p.z / plinthZ); if (e > 0.9) { p.x *= 0.9 / e; p.z *= 0.9 / e; } p.y = Math.max(p.y, 0.025); return p; };
        ctrl.push(pt(lim(last.clone().addScaledVector(d, 0.1).setY(Math.max(0.04, last.y * 0.4))), 0.08, Math.PI * 0.3, 0.01, axis));
        ctrl.push(pt(lim(last.clone().addScaledVector(d, 0.18).setY(0.03)), 0.06, Math.PI / 2, 0.004, axis));
        ctrl.push(pt(lim(last.clone().addScaledVector(d, 0.3).setY(0.025)), 0.01, Math.PI / 2, 0.003, axis));
      }
      ribbons.push({ ctrl, opts: { phase: seed * 9 + band * 2.1, freq: 1.8 } });
    }
  } else {
    const prof = verticalProfile(pos, H), s = seed < 0.5 ? 1 : -1, th0 = seed * 2 * Math.PI;
    const turns = { standing: 1.7, walking: 1.5, seated: 1.25, crouching: 1.1 }[cls] || 1.5;
    const y0 = 0.05 * H, y1 = (cls === 'crouching' ? 0.86 : 0.9) * H, n = 36, ctrl = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, y = y0 + (y1 - y0) * u, th = th0 + s * turns * 2 * Math.PI * u, q = prof(y, th), rr = q.r + 0.07 + 0.035 * Math.sin(Math.PI * u);
      ctrl.push(pt(rv3(q.x + rr * Math.cos(th), y, q.z + rr * Math.sin(th)), 0.11 * hs * Math.min(1, u * 7 + 0.12), 0.22 * Math.sin(u * 9 + seed * 5), 0.012));
    }
    { // leave the shoulders in a rising scroll, outwards
      const E = ctrl[n].p, q = prof(y1, th0 + s * turns * 2 * Math.PI), out = rv3(E.x - q.x, 0, E.z - q.z), side = rv3(-out.z, 0, out.x).multiplyScalar(s);
      volute(E, out, side, 0.5 * hs + 0.2, 0.3 * hs + 0.08, 0.22 * hs).forEach((p, i, a) => ctrl.push(pt(p, (0.12 + 0.1 * Math.sin(Math.PI * Math.min(1, (i + 1) / a.length * 1.2))) * hs, (i + 1) * 0.13 * s, 0.028)));
      ctrl[ctrl.length - 1].w = 0.02;
    }
    ribbons.push({ ctrl, opts: { phase: seed * 7, freq: 1.6 } });
    const limbs = gestureLimbs(mesh.skel, H);
    limbs.forEach((lb, li) => { // a ribbon wound round the forearm flies off the hand
      const c2 = [], P2 = lb.pts, m = P2.length - 1, rl = 0.075 * hs, sl = li ? -s : s;
      const a0 = P2[Math.max(0, m - 2)], dir = lb.dir, n1 = rv3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? RIB_UP : rv3(1, 0, 0)).normalize(), n2 = rv3().crossVectors(dir, n1);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, p = a0.clone().lerp(lb.tip, t), al = sl * 2 * Math.PI * 0.95 * t + seed * 3;
        c2.push(pt(p.addScaledVector(n1, Math.cos(al) * rl).addScaledVector(n2, Math.sin(al) * rl), 0.065 * hs * Math.min(1, t * 5 + 0.15), 0, 0.008, dir));
      }
      const E = lb.tip.clone().addScaledVector(dir, 0.08), out = rv3(dir.x, 0, dir.z).lengthSq() > 0.02 ? rv3(dir.x, 0, dir.z) : rv3(lb.tip.x, 0, lb.tip.z);
      c2.push(pt(E, 0.08 * hs, 0.3 * sl, 0.015));
      volute(E, out, rv3(-out.z, 0, out.x).multiplyScalar(sl), 0.35 * hs + 0.1, 0.24 * hs, 0.15 * hs, 0.85).forEach((p, i, a) => c2.push(pt(p, (0.08 + 0.07 * Math.sin(Math.PI * (i + 1) / a.length)) * hs, (i + 1) * 0.12 * sl, 0.02)));
      c2[c2.length - 1].w = 0.015;
      ribbons.push({ ctrl: c2, opts: { phase: seed * 5 + li * 3, freq: 2 } });
    });
    if (!limbs.length) { // a second band winds down the body and settles on the plinth
      const c3 = [], m3 = 26, ya = 0.64 * H, yb = 0.13 * H, ta = th0 + Math.PI;
      for (let i = 0; i <= m3; i++) {
        const u = i / m3, y = ya + (yb - ya) * u, th = ta - s * 0.95 * 2 * Math.PI * u, q = prof(y, th), rr = q.r + 0.1;
        c3.push(pt(rv3(q.x + rr * Math.cos(th), y, q.z + rr * Math.sin(th)), 0.075 * hs * Math.min(1, u * 6 + 0.1), -0.2 * Math.sin(u * 7), 0.012));
      }
      const L3 = c3[m3].p, out = rv3(L3.x, 0, L3.z).normalize();
      const lim = (p) => { const e = Math.hypot(p.x / plinthX, p.z / plinthZ); if (e > 0.88) { p.x *= 0.88 / e; p.z *= 0.88 / e; } return p; };
      c3.push(pt(lim(L3.clone().addScaledVector(out, 0.07).setY(Math.max(0.05, L3.y * 0.35))), 0.07 * hs, Math.PI * 0.25, 0.008));
      c3.push(pt(lim(L3.clone().addScaledVector(out, 0.14).setY(0.03)), 0.06 * hs, Math.PI / 2, 0.004));
      c3.push(pt(lim(L3.clone().addScaledVector(out, 0.2).setY(0.025)), 0.012, Math.PI / 2, 0.002));
      ribbons.push({ ctrl: c3, opts: { phase: seed * 3 + 1, freq: 1.7 } });
    }
  }
  // the room the ribbons take (for the sequence ribbon, which coils outside them)
  let rx = 0, rz = 0, top = H;
  for (const rb of ribbons) for (const c of rb.ctrl) { rx = Math.max(rx, Math.abs(c.p.x) + c.w * 0.6); rz = Math.max(rz, Math.abs(c.p.z) + c.w * 0.6); top = Math.max(top, c.p.y + c.w * 0.6); }
  const res = { ribbons, ext: { rx: Math.max(rx, (b.max.x - b.min.x) / 2), rz: Math.max(rz, (b.max.z - b.min.z) / 2), top } };
  recipeCache.set(work, res);
  return res;
}
function removePoseRibbons(vp, animate) {
  const old = vp.rib; if (!old) return;
  vp.rib = null;
  if (vp.ribTween) { const k = tweens.indexOf(vp.ribTween); if (k >= 0) tweens.splice(k, 1); vp.ribTween = null; }
  const done = () => { old.parent && old.parent.remove(old); old.children.forEach(m => m.geometry.dispose()); };
  if (!animate || reduceMotion) { done(); return; }
  tween(0.6, (e) => old.children.forEach(m => growRibbon(m.geometry, 1 - e)), done);
}
function buildPoseRibbons(vp, mesh, animate, delay = 0.8) {
  removePoseRibbons(vp, false);
  if (!mesh || !vp.work) return;
  const grp = new THREE.Group(); grp.position.y = PT;
  const st = ribbonStyle();
  for (const rb of poseRecipe(mesh, vp.work).ribbons) {
    const geo = sweepRibbon(rb.ctrl, { ...rb.opts, M: Math.max(3, st.M - 2), thick: 0.012, perMetre: st.flat ? 16 : 22, maxN: 180, cup: 0.12 });
    if (geo) grp.add(ribbonMesh(geo));
  }
  vp.rib = grp; vp.ribTop = poseRecipe(mesh, vp.work).ext.top; vp.g.add(grp);
  if (animate) vp.ribTween = growGroup(grp, 1.9, delay);
  applyViewTo(vp);
}
async function rebuildPoseRibbons() {
  recipeCache.clear();
  for (const vp of V) if (vp.fig && vp.work) { const mesh = await meshOf(vp.work).catch(() => null); if (mesh && vp.work) buildPoseRibbons(vp, mesh, false); }
}

/* ---------- the sequence ribbon ---------- */
function scheduleSkin(delay = 150, opts = {}) {
  clearTimeout(skinTimer);
  skinTimer = setTimeout(async () => { if (opts.own) await rebuildPoseRibbons(); buildSkin(); }, delay);
}
function setRibbonStyle(style) {
  S.skinStyle = RIBBON_STYLES[style] ? style : 'drape';
  ribbonMat.flatShading = ribbonStyle().flat; ribbonMat.needsUpdate = true;
  scheduleSkin(0, { own: true });
}
/* ---------- silk: the sequence ribbon's material ----------
   Satin-like (sheen, soft highlights) instead of matt plaster. A shader grows the ribbon: its tip narrows to a point
   and travels along the sequence (uGrow 0 → 1), and a slow wave runs down the silk while it is shown. */
const SILK_WHITE = new THREE.Color(0xf3ede4), STRAND_TONE = new THREE.Color(0xe6d8c2);
const SILK_GAP = [0.08, 0.16], SILK_FACE = [0.04, 0.08]; // the two strands: beyond the band's edges, and off its faces inside a loop
const silkU = { uGrow: { value: 1 }, uTime: { value: 0 } };
function silkPatch(sh) {
  sh.uniforms.uGrow = silkU.uGrow; sh.uniforms.uTime = silkU.uTime;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aU; attribute float aS; attribute float aL; attribute vec3 aC; attribute vec3 aB;
      uniform float uGrow; uniform float uTime; varying float vRibU;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      float ribK = clamp((uGrow - aU) / 0.035, 0.0, 1.0); ribK = ribK * ribK * (3.0 - 2.0 * ribK);
      transformed = aC + (transformed - aC) * ribK;
      transformed += aB * sin(6.2831853 * (aS / 6.0 - uTime * 0.075) + aL * 0.6) * (0.035 + 0.045 * abs(aL)) * ribK;
      vRibU = aU;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uGrow; varying float vRibU;')
    .replace('void main() {', 'void main() {\n  if (vRibU > uGrow + 0.0005) discard;');
}
const silkMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color(0xfff3e2), clearcoat: 0.2, clearcoatRoughness: 0.45, side: THREE.DoubleSide, envMapIntensity: 0.75 });
silkMat.onBeforeCompile = silkPatch;
const silkDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
silkDepth.onBeforeCompile = silkPatch;
function silkMesh(geo) { const m = new THREE.Mesh(geo, silkMat); m.customDepthMaterial = silkDepth; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; return m; }
/* unroll the sequence ribbon from the vault, sculpture after sculpture */
function growSilk(dur) {
  if (skinGrow) { const k = tweens.indexOf(skinGrow); if (k >= 0) tweens.splice(k, 1); skinGrow = null; }
  if (!skinMesh || reduceMotion) { silkU.uGrow.value = 1; return; }
  const L = skinMesh.geometry.userData.length || 60;
  silkU.uGrow.value = 0;
  skinGrow = tween(dur || THREE.MathUtils.clamp(L * 0.055, 5, 10), (e, raw) => { silkU.uGrow.value = raw < 1 ? raw * raw * (3 - 2 * raw) * 1.02 : 1.05; });
}

/* how far a figure reaches from its plinth's axis in 32 directions, at any height (cached per work and geometry) */
const footCache = new Map();
function footprintOf(vp) {
  const geo = vp.fig && vp.fig.geometry;
  if (!geo) { const r = vp.bounds ? Math.max(vp.bounds.max.x - vp.bounds.min.x, vp.bounds.max.z - vp.bounds.min.z) / 2 : 0.5; return () => r; }
  const key = vp.work + '|' + geo.uuid;
  if (footCache.has(key)) return footCache.get(key);
  const K = 32, r = new Float32Array(K), P = geo.attributes.position.array;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], z = P[i + 2], d = Math.hypot(x, z), q = Math.floor(((Math.atan2(z, x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * K) % K;
    if (d > r[q]) r[q] = d;
  }
  const o = Float32Array.from(r), step = 2 * Math.PI / K;
  for (let q = 0; q < K; q++) r[q] = Math.max(o[q], o[(q + 1) % K] * Math.cos(step), o[(q + K - 1) % K] * Math.cos(step), o[(q + 2) % K] * Math.cos(2 * step), o[(q + K - 2) % K] * Math.cos(2 * step), 0.12);
  const f = (th) => { const g = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K, q0 = Math.floor(g) % K, q1 = (q0 + 1) % K, b = g - Math.floor(g); return r[q0] * (1 - b) + r[q1] * b; };
  footCache.set(key, f);
  return f;
}
/* the sequence ribbon's centre line: for each sculpture of the day a banked loop (entering high and leaving low, or the
   other way round, alternately), and between them a ribbon that rises over sculptures and dips into the gaps */
function sequencePath(T, meshes) {
  const tint = (i) => SILK_WHITE.clone().lerp(new THREE.Color(paletteFor(i)[2]), 0.2);
  // each figure's footprint: how far it reaches in 32 directions (all heights), so a loop can hug it closely
  const feet = V.map(vp => footprintOf(vp));
  const coilOf = new Map(), K = 32, sec = (q) => q / K * 2 * Math.PI, sm = (u) => u * u * (3 - 2 * u);
  const lerpK = (arr) => (th) => { const g = (((th / (2 * Math.PI)) % 1 + 1) % 1) * K, q0 = Math.floor(g) % K, b = g - Math.floor(g); return arr[q0] * (1 - b) + arr[(q0 + 1) % K] * b; };
  const coils = T.map((i, k) => {
    const vp = V[i], mesh = meshes[k], H = mesh ? mesh.bounds.max.y : (vp.bounds ? vp.bounds.max.y : 1.6), p = S.pos[i], foot = feet[i];
    const hours = p.act ? (p.act.hours || CLASS[p.act.cls].dur) : 1;
    const w = THREE.MathUtils.clamp(0.66 + 0.1 * Math.log2(1 + hours), 0.66, 1.0); // the main ribbon, wide like a silk sash
    // it arrives from the previous sculpture, turns round this one (0.75–1.75 turns, alternating direction) and leaves towards the next
    const s = k % 2 ? -1 : 1, pv = k ? V[T[k - 1]] : null, nx = k < T.length - 1 ? V[T[k + 1]] : null;
    const thIn = pv ? Math.atan2(pv.z - vp.z, pv.x - vp.x) : (nx ? Math.atan2(nx.z - vp.z, nx.x - vp.x) + Math.PI * 0.8 : 0.5);
    const thOut = nx ? Math.atan2(nx.z - vp.z, nx.x - vp.x) : thIn + Math.PI * 0.9;
    const dd = ((s * (thOut - thIn)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), sweep = dd < 1.5 * Math.PI ? dd + 2 * Math.PI : dd, turns = sweep / (2 * Math.PI);
    // the loop keeps clear of the neighbours: of their figure, or half the way to a neighbour that has its own loop (a half-plane each)
    const limits = [];
    V.forEach((o, j) => {
      if (j === i || !o.bounds) return;
      const d = Math.hypot(o.x - vp.x, o.z - vp.z), th = Math.atan2(o.z - vp.z, o.x - vp.x);
      if (d > 6) return;
      limits.push({ th, max: T.includes(j) ? d / 2 - 0.04 : d - feet[j](th + Math.PI) - 0.26 });
    });
    // room in each direction for the silk's sideways extent (twice, as the loop runs at foot + 0.12 + e)
    const room = new Float32Array(K);
    for (let q = 0; q < K; q++) { let a = 1e9; for (const l of limits) { const cs = Math.cos(sec(q) - l.th); if (cs > 0.05) a = Math.min(a, l.max / cs); } room[q] = a - foot(sec(q)) - 0.18; }
    // half extents of the banked silk with its strands (which hug the band inside a loop): e sideways, v up;
    // the extra 0.1 covers the cupped section, the travelling wave and the strands' own width
    const W0 = w * 0.9, B0 = 0.2;
    const ext = (b, wq, g) => { const rR = wq * 0.515 + SILK_GAP[1] * g, rB = 0.05 + SILK_FACE[1] * g; return [Math.hypot(rR * Math.sin(b), rB * Math.cos(b)) + 0.1, Math.hypot(rR * Math.cos(b), rB * Math.sin(b)) + 0.1]; };
    // per direction the silk lies as flat as the room allows; where even standing up it does not fit, it narrows there
    // (but first the strands come closer, if that keeps it wide)
    const bet = new Float32Array(K), wid = new Float32Array(K);
    const fit = (g) => {
      let narrowest = W0;
      const rB = 0.05 + SILK_FACE[1] * g, rR = W0 * 0.515 + SILK_GAP[1] * g;
      for (let q = 0; q < K; q++) {
        const m = room[q] / 2 - 0.1;
        let b = m > rB ? Math.asin(Math.min(1, Math.sqrt(Math.max(0, m * m - rB * rB) / (rR * rR - rB * rB)))) : 0, wq = W0;
        if (b < B0) { b = B0; const rmax = Math.sqrt(Math.max(0, m * m - (rB * Math.cos(B0)) ** 2)) / Math.sin(B0); wq = Math.max(0.3, Math.min(W0, (rmax - SILK_GAP[1] * g) / 0.515)); }
        bet[q] = Math.min(1.05, b); wid[q] = wq; narrowest = Math.min(narrowest, wq);
      }
      return narrowest;
    };
    let gk = 1;
    for (const g of [1, 0.8, 0.6, 0.4]) { gk = g; if (fit(g) >= W0 - 1e-6) break; }
    // smooth bank and width round the loop so the silk turns and narrows gradually (min, then mean over ±2 directions:
    // never more than the room allows)
    const soften = (a) => { const er = a.map((_, q) => Math.min(...[-2, -1, 0, 1, 2].map(o => a[(q + o + K) % K]))); return er.map((_, q) => [-2, -1, 0, 1, 2].reduce((t, o) => t + er[(q + o + K) % K], 0) / 5); };
    const beta = soften(bet), width = soften(wid);
    const eK = beta.map((b, q) => ext(b, width[q], gk)[0]), vext = Math.max(...Array.from(beta, (b, q) => ext(b, width[q], gk)[1]));
    const radK = eK.map((e, q) => foot(sec(q)) + 0.12 + e);
    const lo = PT + vext + 0.08;
    // turns of the loop must not stack on each other: one turn apart they are at least 2·vext + 0.1 apart in height
    const hi = Math.max(PT + H + 0.45, turns > 1 ? lo + (2 * vext + 0.1) / sm(1 / turns) : 0);
    const c = { i, x: vp.x, z: vp.z, H, foot, s, w, wc: Math.min(...width), gk, vext, thIn, thOut, sweep, turns, hi, lo, high: k % 2 === 0, col: tint(i) };
    c.rad = lerpK(radK); c.e = lerpK(eK); c.beta = lerpK(beta); c.width = lerpK(width); c.bank = (th) => s * c.beta(th);
    c.at = (th, y, f = 1) => { const r = c.rad(th) * f; return rv3(c.x + r * Math.cos(th), y, c.z + r * Math.sin(th)); };
    c.tan = (th) => c.at(th + c.s * 0.01, 0).sub(c.at(th, 0)).setY(0).normalize();
    let outer = 0; for (let q = 0; q < K; q++) outer = Math.max(outer, radK[q] + eK[q]); c.outer = outer + 0.08;
    coilOf.set(i, c);
    return c;
  });
  // what a free stretch of ribbon must stay above: every sculpture with its pose ribbons, and the loops of the day
  const obstacles = V.map((vp, j) => {
    const c = coilOf.get(j);
    if (c) return { j, x: c.x, z: c.z, r: c.outer, top: c.hi + c.vext + 0.25 };
    const b = vp.bounds; let r = 0; for (let q = 0; q < 32; q++) r = Math.max(r, feet[j](q / 32 * 2 * Math.PI));
    return { j, x: vp.x, z: vp.z, r: Math.max(r + 0.3, Math.max(vp.scaleX, vp.scaleZ) + 0.1), top: PT + Math.max(b ? b.max.y : 1.8, vp.ribTop || 0) + 0.35 };
  });
  const reach = (w) => w / 2 + 0.48; // half the main silk plus the strands winding round it
  const plinths = V.map(vp => ({ x: vp.x, z: vp.z, r: Math.max(vp.scaleX, vp.scaleZ) * 1.32 + 0.05 })); // never skipped, not even a loop's own
  const clearance = (x, z, w, skip) => {
    let y = 0.45 + reach(w);
    for (const o of obstacles) { if (skip.includes(o.j)) continue; if (Math.hypot(x - o.x, z - o.z) < o.r + reach(w)) y = Math.max(y, o.top + reach(w)); }
    for (const o of plinths) if (Math.hypot(x - o.x, z - o.z) < o.r + reach(w)) y = Math.max(y, PT + 0.05 + reach(w));
    return y;
  };
  const ctrl = [];
  const P = (p, w, roll, col, free, skip, g = 1) => ctrl.push({ p, w, roll, amp: 0.006, col, free, skip, g });
  coils.forEach((c, k) => {
    const prev = coils[k - 1], next = coils[k + 1];
    const thIn = c.thIn, thOut = c.thOut, sweep = c.sweep, bIn = c.bank(thIn), bOut = c.bank(thOut);
    const at = c.at, tan = c.tan;
    const yIn = c.high ? c.hi : c.lo, yOut = c.high ? c.lo : c.hi;
    if (!prev) { // the silk comes down from the vault
      const away = rv3(Math.cos(thIn), 0, Math.sin(thIn)), I = at(thIn, yIn), t0 = tan(thIn);
      P(I.clone().addScaledVector(away, 3.2).addScaledVector(t0, -2.2).setY(7.6), 0.12, bIn - 1.6, c.col, 1, [c.i]);
      P(I.clone().addScaledVector(away, 2.4).addScaledVector(t0, -1.7).setY(5.6), c.w * 0.7, bIn - 1.0, c.col, 1, [c.i]);
      P(I.clone().addScaledVector(away, 1.3).addScaledVector(t0, -1.0).setY(yIn + 1.2), c.w, bIn - 0.4, c.col, 1, [c.i]);
    } else { // arrive along the loop's own direction
      P(at(thIn, yIn).addScaledVector(tan(thIn), -0.9).setY(yIn + (c.high ? 0.25 : 0.1)), c.width(thIn), bIn, c.col, 0.01, [c.i], c.gk);
    }
    // the loop: banked (flatter where there is room, standing up towards close neighbours), easing from one height to the other
    const nC = Math.max(12, Math.round(16 * c.turns));
    for (let j = 0; j <= nC; j++) { const u = j / nC, th = thIn + c.s * sweep * u; P(at(th, yIn + (yOut - yIn) * sm(u), 1 + 0.03 * Math.sin(2 * Math.PI * u)), c.width(th), c.bank(th), c.col, 0, [c.i], c.gk); }
    const E = at(thOut, yOut), tE = tan(thOut);
    if (next) { // the free stretch to the next sculpture: leave along the loop, rise over what is in the way, dip into the gaps
      const nThIn = next.thIn, nB0 = next.bank(nThIn), nYIn = next.high ? next.hi : next.lo;
      const I = next.at(nThIn, nYIn), tI = next.tan(nThIn);
      const A = E.clone().addScaledVector(tE, 0.9), Bp = I.clone().addScaledVector(tI, -0.9);
      P(A.clone().setY(yOut + (c.high ? 0.1 : 0.25)), c.width(thOut), bOut, c.col, 0.01, [c.i], c.gk);
      const dist = Math.hypot(Bp.x - A.x, Bp.z - A.z), nB = Math.max(3, Math.round(dist / 1.0)), waves = Math.max(1, Math.round(dist / 5.5));
      const perp = rv3(-(Bp.z - A.z), 0, Bp.x - A.x).normalize().multiplyScalar(0.45 * c.s), wB = (c.w + next.w) / 2;
      for (let j = 1; j <= nB; j++) {
        const t = j / (nB + 1), q = A.clone().lerp(Bp, t).addScaledVector(perp, Math.sin(Math.PI * t));
        const base = yOut + (nYIn - yOut) * sm(t) + (c.high ? -0.15 : 0.55 + 0.04 * dist) * Math.sin(Math.PI * t) + 0.32 * Math.sin(2 * Math.PI * waves * t + k);
        q.y = base;
        const fr = sm(Math.min(1, Math.min(j, nB + 1 - j) / 2)); // strands open out gradually away from the loops
        const wc0 = c.width(thOut) + (next.width(nThIn) - c.width(thOut)) * t;
        P(q, (wc0 + (wB - wc0) * fr) * (1 + 0.12 * Math.sin(Math.PI * t)), bOut + (nB0 - bOut) * sm(t) + 0.3 * Math.sin(2 * Math.PI * t), c.col.clone().lerp(next.col, t), fr, [c.i, next.i], c.gk + (next.gk - c.gk) * t + (1 - Math.max(c.gk, next.gk)) * fr);
      }
      P(Bp.clone().setY(nYIn + (next.high ? 0.25 : 0.1)), next.width(nThIn), nB0, next.col, 0.01, [next.i], next.gk);
    } else { // and rises back to the vault in a slow curl
      const away = rv3(E.x - c.x, 0, E.z - c.z).normalize();
      P(E.clone().addScaledVector(tE, 1.0).setY(yOut + 0.5), c.w, bOut + 0.3, c.col, 1, [c.i]);
      P(E.clone().addScaledVector(tE, 1.8).addScaledVector(away, 1.0).setY(yOut + 1.9), c.w * 0.95, bOut + 0.8, c.col, 1, [c.i]);
      P(E.clone().addScaledVector(tE, 1.6).addScaledVector(away, 2.4).setY(Math.max(yOut + 3.4, 4.6)), c.w * 0.7, bOut + 1.4, c.col, 1, [c.i]);
      P(E.clone().addScaledVector(tE, 0.5).addScaledVector(away, 2.9).setY(Math.max(yOut + 4.6, 6.2)), c.w * 0.35, bOut + 2.0, c.col, 1, [c.i]);
      P(E.clone().addScaledVector(tE, -0.6).addScaledVector(away, 2.4).setY(Math.max(yOut + 5.2, 7.0)), 0.1, bOut + 2.4, c.col, 1, [c.i]);
    }
  });
  // free stretches keep off the sculptures they come from and go to (sideways), and stay above whatever else is under them;
  // then the heights are smoothed into soft swells (never below the clearance)
  for (const q of ctrl) {
    if (!(q.free > 0)) continue;
    const rch = q.w / 2 + 0.24 + 0.24 * q.free; // the band and its strands, sideways
    for (const j of q.skip) {
      const vp = V[j]; if (!vp || !vp.bounds || q.p.y - rch > PT + vp.bounds.max.y) continue;
      const dx = q.p.x - vp.x, dz = q.p.z - vp.z, d = Math.hypot(dx, dz) || 1e-6, need = feet[j](Math.atan2(dz, dx)) + 0.12 + rch;
      if (d < need) { q.p.x = vp.x + dx / d * need; q.p.z = vp.z + dz / d * need; }
    }
  }
  const clr = ctrl.map(q => (q.free > 0 ? clearance(q.p.x, q.p.z, q.w, q.skip) : -1e9));
  for (let i = 0; i < ctrl.length; i++) if (clr[i] > ctrl[i].p.y) ctrl[i].p.y = clr[i];
  for (let pass = 0; pass < 4; pass++) {
    const y = ctrl.map(q => q.p.y);
    for (let i = 1; i < ctrl.length - 1; i++) if (ctrl[i].free > 0) ctrl[i].p.y = Math.max(clr[i], (y[i - 1] + 2 * y[i] + y[i + 1]) / 4);
  }
  ctrl[0].w = 0.1;
  return ctrl;
}
/* thin strands that wind round the main silk, each at its own pace: inside a loop they hug the band's faces
   (SILK_FACE off the surface, SILK_GAP beyond its edges); over the free stretches they open out into round spirals */
function silkStrands(samples) {
  const defs = [
    { gap: SILK_GAP[0], face: SILK_FACE[0], extra: 0.12, lambda: 11, dir: 1, ph: 0.3, w: 0.1 },
    { gap: SILK_GAP[1], face: SILK_FACE[1], extra: 0.22, lambda: 14, dir: -1, ph: 2.6, w: 0.07 },
  ];
  const L = samples[samples.length - 1].s;
  return defs.map((d) => {
    const ctrl = []; let last = -1e9;
    samples.forEach((q, k) => {
      if (q.s - last < 0.5 && k !== samples.length - 1) return; last = q.s;
      const rR = q.w / 2 + (d.gap + d.extra * q.free) * q.g, rB0 = 0.05 + d.face * q.g, rB = rB0 + (rR - rB0) * q.free, ph = d.ph + d.dir * 2 * Math.PI * q.s / d.lambda;
      const taper = Math.min(1, q.s / 2.5, (L - q.s) / 2.5);
      ctrl.push({ p: q.p.clone().addScaledVector(q.R, rR * Math.cos(ph)).addScaledVector(q.B, rB * Math.sin(ph)), w: Math.max(0.01, d.w * taper), roll: ph * 0.5, amp: 0, col: q.col.clone().lerp(STRAND_TONE, 0.5) });
    });
    return ctrl;
  });
}
async function buildSkin() {
  const job = ++skinJob;
  if (!S.pos.length || !V.length) return;
  const T = (S.day.length ? S.pos.map((p, i) => i).filter(i => S.pos[i].act) : S.pos.map((p, i) => i)).filter(i => V[i]);
  if (!T.length) return;
  const meshes = await Promise.all(T.map(i => meshOf(S.pos[i].work).catch(() => null)));
  if (job !== skinJob) return;
  const main = sweepRibbon(sequencePath(T, meshes), { silk: true, keep: true, M: 12, thick: 0.022, perMetre: 12, maxN: 3200, cup: 0.07, freq: 0.35, phase: 0.4, wobble: 0.25, ampScale: 1 });
  if (!main) return;
  if (skinGrow) { const k = tweens.indexOf(skinGrow); if (k >= 0) tweens.splice(k, 1); skinGrow = null; }
  if (skinMesh) { scene.remove(skinMesh); skinMesh.geometry.dispose(); skinMesh.children.forEach(m => m.geometry.dispose()); }
  skinMesh = silkMesh(main);
  for (const ctrl of silkStrands(main.userData.samples)) {
    const g = sweepRibbon(ctrl, { silk: true, M: 3, thick: 0.01, perMetre: 9, maxN: 2600, cup: 0.15, wobble: 0.2, ampScale: 0 });
    if (g) skinMesh.add(silkMesh(g));
  }
  delete main.userData.samples;
  skinMesh.onBeforeRender = () => { silkU.uTime.value = performance.now() / 1000; };
  skinMesh.userData.ready = true;
  scene.add(skinMesh);
  applyView();
  if (S.view === 'skin' || S.view === 'both') growSilk(); else silkU.uGrow.value = 1;
}
