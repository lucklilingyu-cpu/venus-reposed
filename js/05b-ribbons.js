
/* ---------------------------------------------------------------
   The skin as cast-plaster ribbons ("表皮")

   Pose ribbons — every sculpture gets its own. A band wraps the body a few
   centimetres off its silhouette (read from the mesh, height by height, all
   round) and leaves it at the shoulders in a rising scroll. Gesture ribbons
   fly off raised or extended hands (atlas skeleton candidates). Without such a
   hand, a second band winds down the body and settles on the plinth. Lying
   figures get bands that drape over the body in waves and rise at the head.

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

/* ctrl: [{ p, w, roll, amp, col (THREE.Color), up? }] → BufferGeometry (or null) */
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
  const pos = new Float32Array(half * 6), col = new Float32Array(half * 6);
  const P = rv3(), Pp = rv3(), T = rv3(), A = rv3(), Au = rv3(), Ap = rv3(), R = rv3(), B = rv3(), X = rv3(), Uc = rv3(), c = new THREE.Color();
  let hasPrev = false, s = 0;
  for (let k = 0; k < N; k++) {
    const t = curve.getUtoTmapping(k / (N - 1));
    curve.getPoint(t, P); curve.getTangent(t, T).normalize();
    if (k) s += P.distanceTo(Pp); Pp.copy(P);
    const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f)), a = f - i, c0 = ctrl[i], c1 = ctrl[i + 1];
    const w = (c0.w + (c1.w - c0.w) * a) * (1 + 0.07 * Math.sin(s * 2.3 + ph) + 0.035 * Math.sin(s * 5.3 + 2 * ph));
    const roll = c0.roll + (c1.roll - c0.roll) * a, amp = (c0.amp + (c1.amp - c0.amp) * a) * st.ruffle;
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
    for (let j = 0; j < C; j++) {
      const v = -1 + 2 * j / M, av = Math.abs(v);
      const d = amp * (Math.sin(6.283 * freq * s + 2.2 * v + ph) * (0.3 + 0.7 * Math.pow(av, 1.6)) + 0.45 * Math.sin(6.283 * freq * 1.83 * s - 1.4 * v + 2 * ph) * v * v);
      const off = cup * w * (v * v - 0.33) + d, lat = v * w / 2;
      const shade = 0.9 + 0.1 * (amp > 1e-5 ? Math.max(-1, Math.min(1, d / amp)) : 0) - 0.06 * Math.pow(av, 6);
      for (let side = 0; side < 2; side++) {
        const q = (side * half + k * C + j) * 3, nn = off + (side ? -0.5 : 0.5) * th;
        pos[q] = P.x + R.x * lat + B.x * nn; pos[q + 1] = P.y + R.y * lat + B.y * nn; pos[q + 2] = P.z + R.z * lat + B.z * nn;
        col[q] = c.r * shade; col[q + 1] = c.g * shade; col[q + 2] = c.b * shade;
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
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.grow = { cap0, seg, segs: N - 1, total: m };
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
/* the giant ribbon's centre line through the day's sculptures, with a second strand */
function sequencePath(T, meshes) {
  const main = [], second = [], tint = (i, k) => RIBBON_WHITE.clone().lerp(new THREE.Color(paletteFor(i)[2]), 0.24 + 0.04 * (k % 2));
  const coils = T.map((i, k) => {
    const vp = V[i], mesh = meshes[k], bb = mesh ? mesh.bounds : { min: rv3(-0.4, 0, -0.3), max: rv3(0.4, 1.6, 0.3) };
    const H = bb.max.y, p = S.pos[i], hours = p.act ? (p.act.hours || CLASS[p.act.cls].dur) : 1;
    // the coil hugs the figure (its own pose ribbons give way to it) and keeps clear of the neighbouring sculptures
    let room = 9;
    V.forEach((o) => { if (o === vp || !o.bounds) return; const r = Math.max(o.bounds.max.x - o.bounds.min.x, o.bounds.max.z - o.bounds.min.z) / 2; room = Math.min(room, Math.hypot(o.x - vp.x, o.z - vp.z) - r - 0.32); });
    const rx = Math.max((bb.max.x - bb.min.x) / 2 + 0.2, vp.scaleX + 0.1), rz = Math.max((bb.max.z - bb.min.z) / 2 + 0.2, vp.scaleZ + 0.1);
    const out = THREE.MathUtils.clamp(room - Math.max(rx, rz) - 0.15, 0.16, 0.36);
    return { i, x: vp.x, z: vp.z, H, s: k % 2 ? -1 : 1, w: THREE.MathUtils.clamp(0.26 + 0.08 * Math.log2(1 + hours), 0.26, 0.5), rx, rz, out, top: PT + H + 0.3, bot: PT + 0.24, col: tint(i, k) };
  });
  const tallest = (ax, az, bx, bz, skip) => { // the highest sculpture (with its pose ribbons) under the line a → b
    let y = 0; const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    V.forEach((vp, j) => {
      if (skip.includes(j) || !vp.fig) return;
      const t = Math.max(0, Math.min(1, ((vp.x - ax) * dx + (vp.z - az) * dz) / l2)), d = Math.hypot(ax + dx * t - vp.x, az + dz * t - vp.z);
      if (d < Math.max(vp.scaleX, vp.scaleZ) + 1.0) y = Math.max(y, PT + Math.max(vp.bounds ? vp.bounds.max.y : 1.8, vp.ribTop || 0) + 0.5);
    });
    return y;
  };
  let roll = 0;
  const push = (p, w, rl, amp, col, coil, kind) => {
    main.push({ p, w, roll: rl, amp, col });
    // second strand: just outside the coil, or below and beside the arc
    let q;
    if (coil) { const d = rv3(p.x - coil.x, 0, p.z - coil.z).normalize(); q = p.clone().addScaledVector(d, coil.out * 0.45).add(rv3(0, -0.12, 0)); }
    else q = p.clone().add(rv3(0, kind === 'tail' ? -0.4 : -0.55, 0));
    second.push({ p: q, w: w * 0.38, roll: rl + 0.7, amp: amp * 1.4, col });
  };
  const ang = (c, x, z) => Math.atan2(z - c.z, x - c.x);
  coils.forEach((c, k) => {
    const prev = coils[k - 1], next = coils[k + 1];
    const thIn = prev ? ang(c, prev.x, prev.z) : ang(c, c.x + 0.6, c.z + 2), thOut = next ? ang(c, next.x, next.z) : thIn + Math.PI;
    const at = (th, y, rr) => rv3(c.x + (c.rx + rr) * Math.cos(th), y, c.z + (c.rz + rr) * Math.sin(th));
    if (!prev) { // the ribbon comes down from the vault
      const o = rv3(Math.cos(thIn), 0, Math.sin(thIn)), I = at(thIn, c.top, 0);
      push(I.clone().addScaledVector(o, 2.6).setY(7.4), 0.04, -1.8, 0.05, c.col, null, 'tail');
      push(I.clone().addScaledVector(o, 2.1).add(rv3(0.4 * c.s, 0, 0)).setY(5.9), c.w * 0.7, -1.2, 0.06, c.col, null, 'tail');
      push(I.clone().addScaledVector(o, 1.1).setY(c.top + 1.3), c.w, -0.5, 0.05, c.col, null, 'tail');
      roll = 0;
    }
    // coil down (inner), turn at the bottom, coil up (outer) and leave towards the next sculpture
    const nd = c.H > 1.3 ? 1.25 : 1, nD = Math.round(14 * nd);
    for (let j = 0; j <= nD; j++) { const u = j / nD; push(at(thIn + c.s * 2 * Math.PI * nd * u, c.top - (c.top - c.bot) * u, 0), c.w, roll + 0.22 * Math.sin(u * 7), 0.022, c.col, c, 'coil'); }
    const thB = thIn + c.s * 2 * Math.PI * nd, d = ((c.s * (thOut - thB)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), sweep = d < Math.PI ? d + 2 * Math.PI : d, nU = Math.max(10, Math.round(14 * sweep / (2 * Math.PI)));
    for (let j = 1; j <= nU; j++) { const u = j / nU, ramp = THREE.MathUtils.smoothstep(u, 0, 0.22); push(at(thB + c.s * sweep * u, c.bot + (c.top + 0.1 - c.bot) * u, c.out * ramp), c.w * 0.92, roll - 0.2 * Math.sin(u * 6), 0.022, c.col, c, 'coil'); }
    const E = main[main.length - 1].p, oE = rv3(Math.cos(thOut), 0, Math.sin(thOut));
    if (next) { // a high arc over the board, a half twist on the way
      const I = rv3(next.x + (next.rx) * Math.cos(ang(next, c.x, c.z)), next.top, next.z + (next.rz) * Math.sin(ang(next, c.x, c.z)));
      const yA = Math.max(c.top, next.top) + 0.55 + 0.38 * (k % 3), yB = Math.max(yA, tallest(c.x, c.z, next.x, next.z, [c.i, next.i]));
      const perp = rv3(-(I.z - E.z), 0, I.x - E.x).normalize().multiplyScalar(0.55 * c.s), dist = Math.hypot(I.x - E.x, I.z - E.z);
      const wB = (c.w + next.w) * 0.58, colM = c.col.clone().lerp(next.col, 0.5), oI = rv3(Math.cos(ang(next, c.x, c.z)), 0, Math.sin(ang(next, c.x, c.z)));
      push(E.clone().addScaledVector(oE, 0.6).setY(E.y + 0.5), c.w * 1.05, roll + Math.PI * 0.15, 0.035, c.col, null, 'arc');
      const mids = dist > 9 ? [0.3, 0.5, 0.7] : [0.36, 0.64];
      mids.forEach((t, j) => push(E.clone().lerp(I, t).add(perp.clone().multiplyScalar(Math.sin(Math.PI * t))).setY(yB + 0.25 * Math.sin(Math.PI * t) + (j % 2 ? -0.12 : 0.12)), wB, roll + Math.PI * (0.25 + 0.5 * t), 0.045, colM, null, 'arc'));
      push(I.clone().addScaledVector(oI, 0.6).setY(I.y + 0.5), next.w * 1.05, roll + Math.PI * 0.85, 0.035, next.col, null, 'arc');
      roll += Math.PI;
    } else { // and rises away towards the vault
      push(E.clone().addScaledVector(oE, 1.0).setY(E.y + 1.0), c.w, roll + 0.4, 0.03, c.col, null, 'tail');
      push(E.clone().addScaledVector(oE, 1.9).add(rv3(0, 0, 0.5 * c.s)).setY(E.y + 2.4), c.w * 0.8, roll + 0.9, 0.03, c.col, null, 'tail');
      push(E.clone().addScaledVector(oE, 2.3).add(rv3(0.3 * c.s, 0, 1.0 * c.s)).setY(E.y + 3.7), c.w * 0.5, roll + 1.4, 0.025, c.col, null, 'tail');
      push(E.clone().addScaledVector(oE, 1.8).add(rv3(0.5 * c.s, 0, 1.4 * c.s)).setY(E.y + 4.4), 0.03, roll + 1.8, 0.02, c.col, null, 'tail');
    }
  });
  main[0].w = second[0].w = 0.02;
  return { main, second };
}
async function buildSkin() {
  const job = ++skinJob;
  if (!S.pos.length || !V.length) return;
  const T = (S.day.length ? S.pos.map((p, i) => i).filter(i => S.pos[i].act) : S.pos.map((p, i) => i)).filter(i => V[i]);
  if (!T.length) return;
  const meshes = await Promise.all(T.map(i => meshOf(S.pos[i].work).catch(() => null)));
  if (job !== skinJob) return;
  const { main, second } = sequencePath(T, meshes), st = ribbonStyle();
  const g1 = sweepRibbon(main, { thick: 0.03, perMetre: st.flat ? 8 : 17, maxN: 3600, freq: 0.75, cup: 0.18, phase: 0.4 });
  const g2 = sweepRibbon(second, { M: Math.max(3, st.M - 3), thick: 0.018, perMetre: st.flat ? 8 : 14, maxN: 3000, freq: 1.1, cup: 0.1, phase: 2.2 });
  if (!g1) return;
  if (skinGrow) { const k = tweens.indexOf(skinGrow); if (k >= 0) tweens.splice(k, 1); skinGrow = null; }
  if (skinMesh) { scene.remove(skinMesh); skinMesh.geometry.dispose(); skinMesh.children.forEach(m => m.geometry.dispose()); }
  skinMesh = ribbonMesh(g1);
  if (g2) skinMesh.add(ribbonMesh(g2));
  skinMesh.userData.ready = true;
  scene.add(skinMesh);
  applyView();
  if (S.view === 'skin' || S.view === 'both') skinGrow = growGroup(skinMesh, 3.6);
}
