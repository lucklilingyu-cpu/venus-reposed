
/* ---------------------------------------------------------------
   Signed distance fields + surface nets. These functions are
   self-contained so they can be stringified into a Web Worker.
---------------------------------------------------------------- */
function sdSmin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function sdPrimSet(P, x, y, z, k) {
  let d = 1e9;
  for (let o = 0; o < P.length; o += 10) {
    let e;
    if (P[o] === 0) {
      const ax = P[o + 1], ay = P[o + 2], az = P[o + 3];
      const bx = P[o + 4] - ax, by = P[o + 5] - ay, bz = P[o + 6] - az;
      const px = x - ax, py = y - ay, pz = z - az;
      const bb = bx * bx + by * by + bz * bz;
      let h = bb > 1e-9 ? (px * bx + py * by + pz * bz) / bb : 0;
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const qx = px - bx * h, qy = py - by * h, qz = pz - bz * h;
      e = Math.sqrt(qx * qx + qy * qy + qz * qz) - (P[o + 7] + (P[o + 8] - P[o + 7]) * h);
    } else {
      const qx = Math.abs(x - P[o + 1]) - P[o + 4], qy = Math.abs(y - P[o + 2]) - P[o + 5], qz = Math.abs(z - P[o + 3]) - P[o + 6];
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
      e = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - P[o + 7];
    }
    d = d === 1e9 ? e : sdSmin(d, e, k);
  }
  return d;
}
function sdPrimBounds(P) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let o = 0; o < P.length; o += 10) {
    if (P[o] === 0) {
      for (let s = 0; s < 2; s++) {
        const r = P[o + 7 + s];
        for (let a = 0; a < 3; a++) { const c = P[o + 1 + s * 3 + a]; if (c - r < mn[a]) mn[a] = c - r; if (c + r > mx[a]) mx[a] = c + r; }
      }
    } else {
      for (let a = 0; a < 3; a++) { const c = P[o + 1 + a], h = P[o + 4 + a] + P[o + 7]; if (c - h < mn[a]) mn[a] = c - h; if (c + h > mx[a]) mx[a] = c + h; }
    }
  }
  return { mn, mx };
}
/* naive surface nets on a sampled grid; returns indexed mesh with smooth normals */
function sdSurfaceNets(F, nx, ny, nz, ox, oy, oz, cs) {
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const at = (i, j, k) => F[i + nx * (j + ny * k)];
  const cellId = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [], nor = [];
  const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const ED = [];
  for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) ED.push([a, a | bit]);
  const v = new Float64Array(8);
  const grad = (i, j, k, out) => {
    const i0 = i > 0 ? i - 1 : i, i1 = i < cx ? i + 1 : i;
    const j0 = j > 0 ? j - 1 : j, j1 = j < cy ? j + 1 : j;
    const k0 = k > 0 ? k - 1 : k, k1 = k < cz ? k + 1 : k;
    out[0] += (at(i1, j, k) - at(i0, j, k)) / (i1 - i0 || 1);
    out[1] += (at(i, j1, k) - at(i, j0, k)) / (j1 - j0 || 1);
    out[2] += (at(i, j, k1) - at(i, j, k0)) / (k1 - k0 || 1);
  };
  const g = [0, 0, 0];
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = at(i + CO[c][0], j + CO[c][1], k + CO[c][2]); if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of ED) {
      const va = v[a], vb = v[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += CO[a][0] + (CO[b][0] - CO[a][0]) * t;
      sy += CO[a][1] + (CO[b][1] - CO[a][1]) * t;
      sz += CO[a][2] + (CO[b][2] - CO[a][2]) * t;
      n++;
    }
    cellId[i + cx * (j + cy * k)] = pos.length / 3;
    pos.push(ox + (i + sx / n) * cs, oy + (j + sy / n) * cs, oz + (k + sz / n) * cs);
    g[0] = g[1] = g[2] = 0;
    for (let c = 0; c < 8; c++) grad(i + CO[c][0], j + CO[c][1], k + CO[c][2], g);
    const L = Math.hypot(g[0], g[1], g[2]) || 1;
    nor.push(g[0] / L, g[1] / L, g[2] / L);
  }
  const idx = [];
  const cid = (i, j, k) => cellId[i + cx * (j + cy * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // keep winding consistent with the field gradient
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    const nx_ = nor[a * 3] + nor[c * 3], ny_ = nor[a * 3 + 1] + nor[c * 3 + 1], nz_ = nor[a * 3 + 2] + nor[c * 3 + 2];
    if (fx * nx_ + fy * ny_ + fz * nz_ < 0) { const t = b; b = d; d = t; }
    idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = at(i, j, k);
    if (i < cx && j > 0 && k > 0 && j < cy + 0 && k < cz + 0) {
      const v1 = at(i + 1, j, k);
      if ((v0 < 0) !== (v1 < 0)) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), v0 < 0);
    }
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz) {
      const v1 = at(i, j + 1, k);
      if ((v0 < 0) !== (v1 < 0)) quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), v0 < 0);
    }
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy) {
      const v1 = at(i, j, k + 1);
      if ((v0 < 0) !== (v1 < 0)) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), v0 < 0);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}
function sdBuildFigure(msg) {
  const P = msg.prims, cs = msg.cell, k = msg.k || 0.035, pad = cs * 2.5;
  const b = sdPrimBounds(P);
  const ox = b.mn[0] - pad, oy = Math.max(b.mn[1] - pad, -cs * 0.5), oz = b.mn[2] - pad;
  const nx = Math.ceil((b.mx[0] + pad - ox) / cs) + 1, ny = Math.ceil((b.mx[1] + pad - oy) / cs) + 1, nz = Math.ceil((b.mx[2] + pad - oz) / cs) + 1;
  const F = new Float32Array(nx * ny * nz);
  let n = 0;
  for (let kk = 0; kk < nz; kk++) { const z = oz + kk * cs; for (let j = 0; j < ny; j++) { const y = oy + j * cs; for (let i = 0; i < nx; i++) {
    let d = sdPrimSet(P, ox + i * cs, y, z, k);
    if (y < 0) d = Math.max(d, -y); // flat base on the plinth
    F[n++] = d;
  } } }
  return sdSurfaceNets(F, nx, ny, nz, ox, oy, oz, cs);
}
/* point-sample distance (atlas meshes): dense bucket grid around each figure */
function sdPtsPrep(g) {
  const P = g.pts, R = 0.5;
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { if (P[i + a] < mn[a]) mn[a] = P[i + a]; if (P[i + a] > mx[a]) mx[a] = P[i + a]; }
  const o = [mn[0] - R, mn[1] - R, mn[2] - R];
  const n = [Math.ceil((mx[0] - mn[0] + 2 * R) / R) + 1, Math.ceil((mx[1] - mn[1] + 2 * R) / R) + 1, Math.ceil((mx[2] - mn[2] + 2 * R) / R) + 1];
  const B = new Array(n[0] * n[1] * n[2]);
  for (let i = 0; i < P.length; i += 3) {
    const ix = Math.floor((P[i] - o[0]) / R), iy = Math.floor((P[i + 1] - o[1]) / R), iz = Math.floor((P[i + 2] - o[2]) / R);
    const k = ix + n[0] * (iy + n[1] * iz); (B[k] || (B[k] = [])).push(P[i], P[i + 1], P[i + 2]);
  }
  g._pp = { R, o, n, B, mn, mx };
}
function sdPtsDist(g, x, y, z) {
  const q = g._pp, R = q.R;
  const dx = Math.max(q.mn[0] - x, 0, x - q.mx[0]), dy = Math.max(q.mn[1] - y, 0, y - q.mx[1]), dz = Math.max(q.mn[2] - z, 0, z - q.mx[2]);
  const db = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (db >= R) return db - g.r;
  const ix = Math.floor((x - q.o[0]) / R), iy = Math.floor((y - q.o[1]) / R), iz = Math.floor((z - q.o[2]) / R);
  let best = R * R;
  for (let c = iz - 1; c <= iz + 1; c++) { if (c < 0 || c >= q.n[2]) continue;
    for (let b = iy - 1; b <= iy + 1; b++) { if (b < 0 || b >= q.n[1]) continue;
      for (let a = ix - 1; a <= ix + 1; a++) { if (a < 0 || a >= q.n[0]) continue;
        const arr = q.B[a + q.n[0] * (b + q.n[1] * c)]; if (!arr) continue;
        for (let i = 0; i < arr.length; i += 3) { const ex = arr[i] - x, ey = arr[i + 1] - y, ez = arr[i + 2] - z; const d2 = ex * ex + ey * ey + ez * ez; if (d2 < best) best = d2; }
      } } }
  return Math.sqrt(best) - g.r;
}
/* skin: smooth union of every pose's offset envelope along the sequence */
function sdBuildSkin(msg) {
  const figs = msg.figs, cs = msg.cell, kS = msg.kSeq, kB = msg.kBody;
  for (const g of figs) if (g.pts && g.pts.length) sdPtsPrep(g);
  const [x0, y0, z0] = msg.min, [x1, y1, z1] = msg.max;
  const nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1, nz = Math.ceil((z1 - z0) / cs) + 1;
  const F = new Float32Array(nx * ny * nz);
  const field = (x, y, z, out) => {
    let D = 1e9, first = true;
    for (let f = 0; f < figs.length; f++) {
      const g = figs[f];
      if (x < g.xmin || x > g.xmax) { if (out) out[f] = 1e9; continue; }
      const xs = (x - g.cx) / g.s + g.cx;
      let d = g.prims && g.prims.length ? sdPrimSet(g.prims, xs, y, z, kB) : 1e9;
      if (g._pp) { const dp = sdPtsDist(g, xs, y, z); d = d === 1e9 ? dp : sdSmin(d, dp, kB); }
      d -= g.c;
      if (out) out[f] = d;
      D = first ? d : sdSmin(D, d, kS); first = false;
    }
    return D;
  };
  let n = 0;
  for (let k = 0; k < nz; k++) { const z = z0 + k * cs; for (let j = 0; j < ny; j++) { const y = y0 + j * cs; for (let i = 0; i < nx; i++) {
    F[n++] = field(x0 + i * cs, y, z, null);
  } } }
  const m = sdSurfaceNets(F, nx, ny, nz, x0, y0, z0, cs);
  const nv = m.pos.length / 3, col = new Float32Array(nv * 3), w = new Float64Array(figs.length);
  for (let i = 0; i < nv; i++) {
    field(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], w);
    let sw = 0, r = 0, gg = 0, bb = 0;
    for (let f = 0; f < figs.length; f++) {
      if (w[f] > 1e8) continue;
      const q = Math.exp(-Math.max(w[f], 0) / 0.32);
      sw += q; r += q * figs[f].color[0]; gg += q * figs[f].color[1]; bb += q * figs[f].color[2];
    }
    sw = sw || 1;
    col[i * 3] = r / sw; col[i * 3 + 1] = gg / sw; col[i * 3 + 2] = bb / sw;
  }
  m.col = col;
  return m;
}
const SDF_WORKER_SRC = [sdSmin, sdPrimSet, sdPrimBounds, sdSurfaceNets, sdBuildFigure, sdPtsPrep, sdPtsDist, sdBuildSkin].map(f => f.toString()).join('\n') + `
self.onmessage = (e) => {
  const m = e.data;
  try {
    const r = m.type === 'skin' ? sdBuildSkin(m) : sdBuildFigure(m);
    const tr = [r.pos.buffer, r.nor.buffer, r.idx.buffer];
    if (r.col) tr.push(r.col.buffer);
    self.postMessage({ id: m.id, ok: true, r }, tr);
  } catch (err) { self.postMessage({ id: m.id, ok: false, err: String(err) }); }
};`;

/* worker pool with a main-thread fallback */
const Geo = (() => {
  let workers = [], rr = 0, seq = 0, broken = false, alive = false;
  const pending = new Map();
  const local = (msg) => msg.type === 'skin' ? sdBuildSkin(msg) : sdBuildFigure(msg);
  const reroute = () => { broken = true; for (const [id, p] of pending) { pending.delete(id); setTimeout(() => { try { p.res(local(p.msg)); } catch (e) { p.rej(e); } }, 0); } };
  try {
    const url = URL.createObjectURL(new Blob([SDF_WORKER_SRC], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = (e) => { alive = true; const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); clearTimeout(p.timer); e.data.ok ? p.res(e.data.r) : p.rej(new Error(e.data.err)); };
      w.onerror = () => { if (!alive) reroute(); };
      workers.push(w);
    }
    // health check: a tiny job must come back quickly, otherwise compute on the main thread
    const ping = ++seq;
    pending.set(ping, { res: () => {}, rej: () => {}, msg: { type: 'fig', prims: new Float32Array([0, 0, 0, 0, 0, 0.1, 0, 0.05, 0.05, 0]), cell: 0.05 } });
    workers[0].postMessage({ id: ping, type: 'fig', prims: new Float32Array([0, 0, 0, 0, 0, 0.1, 0, 0.05, 0.05, 0]), cell: 0.05 });
    setTimeout(() => { if (!alive) reroute(); }, 12000);
  } catch (e) { workers = []; broken = true; }
  const run = (msg) => new Promise((res, rej) => {
    if (broken || !workers.length) { setTimeout(() => { try { res(local(msg)); } catch (e) { rej(e); } }, 0); return; }
    const id = ++seq; msg.id = id;
    const entry = { res, rej, msg };
    entry.timer = setTimeout(() => { if (pending.has(id) && !alive) reroute(); }, 15000);
    pending.set(id, entry);
    const w = msg.type === 'skin' ? workers[0] : workers[(rr++) % workers.length];
    w.postMessage(msg);
  });
  return { run, get count() { return broken ? 0 : workers.length; } };
})();
