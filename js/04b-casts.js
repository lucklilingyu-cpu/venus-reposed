
/* ---------------------------------------------------------------
   The two great casts of the V&A Cast Courts, re-made procedurally.

   Trajan's Column (east end) — as at the V&A, in two halves side by side.
   The lower half stands on the cast of the pedestal: piled Dacian arms in
   relief, eagles on the corners holding oak garlands, the dedication tablet
   held by two Victories, the door below, the laurel torus on top. The upper
   half ends in the Doric capital. A spiral frieze of soldiers, Dacians,
   horses, forts, trees and boats winds up both shafts.

   The Pórtico de la Gloria (west wall) — Master Mateo's triple portal from
   Santiago de Compostela, after Domenico Brucciani's cast of 1866
   (17.85 × 10.57 m): the central arch with Christ in Majesty, the four
   Evangelists and angels with the instruments of the Passion in the
   tympanum, the 24 Elders playing instruments on the archivolt, St James
   seated on the trumeau above the Tree of Jesse, column-statues of
   prophets and apostles on the jambs, open side arches with figured
   archivolts, and the bench of beasts at the base.

   WALK (bottom) is the floor plan used by walk mode (js/09c-walk.js).
---------------------------------------------------------------- */
function rng(seed) { // small deterministic random generator, so every visitor sees the same carving
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* a colour canvas and a height canvas painted together: map + bumpMap */
function reliefPair(w, h, draw) {
  const cc = document.createElement('canvas'), cb = document.createElement('canvas');
  cc.width = cb.width = w; cc.height = cb.height = h;
  const gc = cc.getContext('2d'), gb = cb.getContext('2d');
  draw(gc, gb, w, h);
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(cb);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, bump };
}
/* carving primitives in motif units (x along the facing, y up, feet at 0), drawn with a transform T */
const Carve = (() => {
  const path = (T, s, d) => {
    const p = new Path2D();
    if (d[0] === 'P') { d[1].forEach(([x, y], i) => { const [X, Y] = T(x, y); i ? p.lineTo(X, Y) : p.moveTo(X, Y); }); p.closePath(); }
    else if (d[0] === 'E') { const [X, Y] = T(d[1], d[2]); p.ellipse(X, Y, Math.abs(d[3] * s), Math.abs(d[4] * s), -(d[5] || 0), 0, Math.PI * 2); }
    else if (d[0] === 'L') {
      const [X0, Y0] = T(d[1], d[2]), [X1, Y1] = T(d[3], d[4]);
      const dx = X1 - X0, dy = Y1 - Y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * d[5] * s / 2, ny = dx / l * d[5] * s / 2;
      p.moveTo(X0 + nx, Y0 + ny); p.lineTo(X1 + nx, Y1 + ny); p.lineTo(X1 - nx, Y1 - ny); p.lineTo(X0 - nx, Y0 - ny); p.closePath();
    }
    return p;
  };
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  // paint one primitive: soft cast shadow, raised surface, light edge; height into the bump canvas
  function paint(gc, gb, T, s, d, tone) {
    const p = path(T, s, d), lvl = d[d.length - 1];
    gc.save(); gc.translate(2, 2.5); gc.fillStyle = 'rgba(60,45,30,0.26)'; gc.fill(p); gc.restore();
    const [r0, g0, b0] = tone[0], [r1, g1, b1] = tone[1];
    gc.fillStyle = `rgb(${lerp(r0, r1, lvl)},${lerp(g0, g1, lvl)},${lerp(b0, b1, lvl)})`; gc.fill(p);
    gc.strokeStyle = 'rgba(255,250,240,0.28)'; gc.lineWidth = 1; gc.stroke(p);
    const v = lerp(120, 250, lvl); gb.fillStyle = `rgb(${v},${v},${v})`; gb.fill(p);
  }
  function draw(gc, gb, list, T, s, tone) { for (const d of list) paint(gc, gb, T, s, d, tone); }
  // Trajan's frieze motifs (width in units of the figure height)
  const M = {
    soldier: [0.42, (R) => {
      const st = (R() - 0.5) * 0.12;
      return [['L', -0.05, 0, -0.06 + st, 0.32, 0.075, 0.5], ['L', 0.05, 0, 0.07 - st, 0.32, 0.075, 0.55],
        ['P', [[-0.15, 0.3], [0.15, 0.3], [0.12, 0.47], [-0.12, 0.47]], 0.65], ['P', [[-0.12, 0.46], [0.12, 0.46], [0.1, 0.8], [-0.1, 0.8]], 0.7],
        ['E', 0.01, 0.88, 0.075, 0.08, 0, 0.78], ['E', 0, 0.93, 0.085, 0.045, 0, 0.82],
        ['L', -0.13, 0.04, -0.17, 1.08, 0.032, 0.86], ['P', [[0.06, 0.38], [0.24, 0.4], [0.24, 0.76], [0.06, 0.74]], 0.95]];
    }],
    dacian: [0.4, (R) => [['L', -0.06, 0, -0.07, 0.34, 0.09, 0.5], ['L', 0.06, 0, 0.08, 0.34, 0.09, 0.55],
      ['P', [[-0.17, 0.26], [0.17, 0.26], [0.12, 0.8], [-0.12, 0.8]], 0.68], ['P', [[-0.2, 0.42], [-0.1, 0.8], [-0.24, 0.75]], 0.6],
      ['E', 0.02, 0.88, 0.075, 0.08, 0, 0.78], ['P', [[-0.07, 0.92], [0.08, 0.92], [0.1, 1.04]], 0.82], ['E', 0.05, 0.82, 0.045, 0.05, 0, 0.8],
      ['E', 0.18, 0.55, 0.1, 0.2, 0, 0.95], ['L', -0.16, 0.6, -0.3 - R() * 0.1, 0.9, 0.035, 0.9]]],
    horse: [0.95, (R) => [['L', -0.24, 0, -0.22, 0.34, 0.06, 0.5], ['L', -0.14, 0, -0.17, 0.34, 0.06, 0.52], ['L', 0.18, 0, 0.2, 0.34, 0.06, 0.55], ['L', 0.27, 0.02, 0.24, 0.34, 0.06, 0.57],
      ['E', 0, 0.44, 0.34, 0.13, 0, 0.7], ['P', [[0.22, 0.46], [0.32, 0.5], [0.42, 0.74], [0.34, 0.76]], 0.72], ['E', 0.43, 0.72, 0.11, 0.05, 0.6, 0.76], ['L', -0.33, 0.48, -0.42, 0.24, 0.05, 0.6],
      ['P', [[-0.08, 0.54], [0.08, 0.54], [0.06, 0.84], [-0.06, 0.84]], 0.85], ['E', 0, 0.91, 0.07, 0.075, 0, 0.9], ['L', 0.02, 0.7, 0.3, 1.0, 0.03, 0.92]]],
    tree: [0.55, (R) => [['L', 0, 0, 0.02, 0.55, 0.07, 0.5], ['E', 0, 0.72, 0.2, 0.17, 0, 0.62], ['E', -0.14, 0.62, 0.13, 0.11, 0, 0.66], ['E', 0.14, 0.64, 0.13, 0.11, 0, 0.66], ['E', 0.02, 0.86, 0.13, 0.1, 0, 0.7]]],
    wall: [1.15, (R) => {
      const o = [['P', [[-0.55, 0], [0.55, 0], [0.55, 0.62], [-0.55, 0.62]], 0.55]];
      for (let i = -5; i <= 5; i += 2) o.push(['P', [[i * 0.1 - 0.04, 0.62], [i * 0.1 + 0.04, 0.62], [i * 0.1 + 0.04, 0.72], [i * 0.1 - 0.04, 0.72]], 0.6]);
      for (let y = 0.12; y < 0.62; y += 0.12) o.push(['L', -0.55, y, 0.55, y, 0.012, 0.3]);
      o.push(['P', [[-0.08, 0], [0.08, 0], [0.08, 0.28], [-0.08, 0.28]], 0.15]);
      return o;
    }],
    boat: [1.25, (R) => [['P', [[-0.6, 0.16], [0.62, 0.16], [0.5, 0.0], [-0.48, 0.0]], 0.62], ['L', 0.55, 0.12, 0.7, 0.34, 0.05, 0.66],
      ['L', -0.3, 0.12, -0.42, -0.05, 0.025, 0.5], ['L', 0.0, 0.12, -0.12, -0.05, 0.025, 0.5], ['L', 0.3, 0.12, 0.18, -0.05, 0.025, 0.5],
      ['P', [[-0.3, 0.16], [-0.16, 0.16], [-0.18, 0.4], [-0.28, 0.4]], 0.75], ['E', -0.23, 0.46, 0.06, 0.065, 0, 0.8],
      ['P', [[0.1, 0.16], [0.24, 0.16], [0.22, 0.4], [0.12, 0.4]], 0.75], ['E', 0.17, 0.46, 0.06, 0.065, 0, 0.8], ['L', 0.0, 0.16, 0.0, 0.85, 0.03, 0.7]]],
    tent: [0.62, (R) => [['P', [[-0.3, 0], [0.3, 0], [0.02, 0.55]], 0.58], ['P', [[-0.06, 0], [0.06, 0], [0.01, 0.3]], 0.2]]],
  };
  // Dacian arms for the pedestal, in units of the item size
  const ARMS = [
    (R) => [['E', 0, 0, 0.5, 0.33, 0, 0.6], ['E', 0, 0, 0.4, 0.25, 0, 0.7], ['E', 0, 0, 0.1, 0.1, 0, 0.95]], // oval shield
    (R) => [['P', [[-0.25, -0.45], [0.25, -0.45], [0.45, 0], [0.25, 0.45], [-0.25, 0.45], [-0.45, 0]], 0.62], ['E', 0, 0, 0.09, 0.09, 0, 0.92]], // hexagonal shield
    (R) => [['E', 0, 0, 0.42, 0.42, 0, 0.6], ['E', 0, 0, 0.3, 0.3, 0, 0.72], ['E', 0, 0, 0.1, 0.1, 0, 0.95]], // round shield
    (R) => [['E', 0, 0.05, 0.26, 0.24, 0, 0.75], ['P', [[-0.26, 0.02], [-0.14, -0.3], [-0.06, 0.0]], 0.7], ['P', [[0.26, 0.02], [0.14, -0.3], [0.06, 0.0]], 0.7], ['L', 0, 0.28, 0.0, 0.5, 0.06, 0.85]], // helmet
    (R) => [['P', [[-0.28, 0.4], [0.28, 0.4], [0.24, -0.1], [0.3, -0.42], [-0.3, -0.42], [-0.24, -0.1]], 0.68], ['L', -0.2, 0.0, 0.2, 0.0, 0.03, 0.8], ['L', 0, 0.38, 0, -0.4, 0.025, 0.8]], // cuirass
    (R) => [['L', -0.8, -0.1, 0.8, 0.1, 0.05, 0.85], ['P', [[0.8, 0.1], [0.98, 0.16], [0.82, 0.03]], 0.9]], // spear
    (R) => [['L', -0.1, -0.5, 0.0, 0.2, 0.06, 0.8], ['L', 0.0, 0.2, 0.18, 0.42, 0.06, 0.82], ['L', 0.18, 0.42, 0.42, 0.46, 0.06, 0.84]], // falx
    (R) => [['L', 0, -0.6, 0, 0.5, 0.07, 0.8], ['E', 0, 0.6, 0.14, 0.11, 0, 0.88], ['P', [[0.08, 0.66], [0.24, 0.62], [0.1, 0.56]], 0.9]], // carnyx
    (R) => [['E', -0.35, 0.1, 0.14, 0.1, 0, 0.88], ['L', -0.25, 0.1, 0.0, 0.0, 0.1, 0.7], ['L', 0.0, 0.0, 0.25, 0.12, 0.09, 0.66], ['L', 0.25, 0.12, 0.5, 0.0, 0.08, 0.62]], // draco standard
  ];
  return { draw, M, ARMS, paint };
})();
const PLASTER = [[200, 189, 170], [236, 228, 214]]; // low → high relief tones of the plaster casts

/* ---------- Trajan's Column ---------- */
const TRAJAN = { x: 19.6, zLow: -3.5, zUp: 3.5 };
(function trajan() {
  const R = rng(17);
  // the spiral frieze: one texture = the full circumference × 4 turns, seamless both ways
  const frieze = reliefPair(2048, 1024, (gc, gb, W, H) => {
    const h = H / 4, fil = 14, yAt = (k, x) => H - (k + x / W) * h;
    gc.fillStyle = '#c6b9a2'; gc.fillRect(0, 0, W, H);
    gb.fillStyle = '#5c5c5c'; gb.fillRect(0, 0, W, H);
    const kinds = ['soldier', 'soldier', 'soldier', 'soldier', 'soldier', 'dacian', 'dacian', 'horse', 'tree', 'wall', 'boat', 'tent'];
    for (let k = 0; k < 4; k++) {
      let x = R() * 30;
      while (x < W - 10) {
        const kind = kinds[Math.floor(R() * kinds.length)], [mw, make] = Carve.M[kind], d = R() < 0.55 ? 1 : -1;
        const s = (h - fil - 18) * (kind === 'wall' || kind === 'tree' ? 0.92 : 0.82 + R() * 0.08), wpx = s * mw;
        const cx = x + wpx / 2, base = yAt(k, cx) - fil / 2 - 3, list = make(R);
        for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) {
          const T = (u, v) => [cx + ox + u * s * d, base + oy - v * s];
          Carve.draw(gc, gb, list, T, s, PLASTER);
        }
        x += wpx * (0.7 + R() * 0.25);
      }
    }
    for (let k = -1; k <= 4; k++) { // the raised fillet that winds between the turns, with a groove above it
      const y0 = yAt(k, 0), y1 = yAt(k, W);
      for (const [off, wdt, col, bv] of [[-fil / 2 - 2, 3, 'rgba(80,62,45,.55)', 40], [0, fil, '#e9e0cf', 245]]) {
        gc.fillStyle = col; gb.fillStyle = `rgb(${bv},${bv},${bv})`;
        for (const g of [gc, gb]) { g.beginPath(); g.moveTo(0, y0 + off - wdt / 2); g.lineTo(W, y1 + off - wdt / 2); g.lineTo(W, y1 + off + wdt / 2); g.lineTo(0, y0 + off + wdt / 2); g.closePath(); g.fill(); }
      }
    }
  });
  const TURN = 1.25; // height of one turn of the frieze (m)
  const shaftMat = (height) => {
    const map = frieze.map.clone(), bump = frieze.bump.clone();
    for (const t of [map, bump]) { t.needsUpdate = true; t.repeat.set(1, height / (4 * TURN)); }
    return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 4, roughness: 0.86, envMapIntensity: 0.3 });
  };
  const plaster = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.3, map: tex(256, 256, (g, w, h) => noiseFill(g, w, h, '#e1d7c5', 0.05, 1600), [2, 2]) });
  // laurel wreath for the torus; egg-and-dart for the capital
  const laurel = reliefPair(512, 128, (gc, gb, W, H) => {
    gc.fillStyle = '#c4b79f'; gc.fillRect(0, 0, W, H); gb.fillStyle = '#505050'; gb.fillRect(0, 0, W, H);
    for (let i = -2; i < 34; i++) for (const side of [-1, 1]) {
      const x = i * 16, y = H / 2 + side * 22;
      for (const ox of [0, W, -W]) Carve.paint(gc, gb, (u, v) => [x + ox + u, y - v], 1, ['E', 0, 0, 20, 8, side * 0.6, 0.75 + (i % 2) * 0.1], PLASTER);
    }
    for (let i = 0; i < 8; i++) for (const ox of [0, W, -W]) Carve.paint(gc, gb, (u, v) => [i * 64 + ox + u, H / 2 - v], 1, ['L', -14, -60, 14, 60, 14, 0.95], PLASTER); // crossing ribbons
  });
  const egg = reliefPair(512, 64, (gc, gb, W, H) => {
    gc.fillStyle = '#c6b9a2'; gc.fillRect(0, 0, W, H); gb.fillStyle = '#4a4a4a'; gb.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const x = i * 32 + 16;
      Carve.paint(gc, gb, (u, v) => [x + u, H / 2 - v], 1, ['E', 0, -2, 11, 20, 0, 0.85], PLASTER);
      Carve.paint(gc, gb, (u, v) => [x + 16 + u, H / 2 - v], 1, ['P', [[-3, 24], [3, 24], [0, -18]], 0.7], PLASTER);
    }
  });
  const relMat = (t, rx, ry, bs = 3) => {
    const map = t.map.clone(), bump = t.bump.clone();
    for (const x of [map, bump]) { x.needsUpdate = true; x.repeat.set(rx, ry); }
    return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: bs, roughness: 0.86, envMapIntensity: 0.3 });
  };
  // pedestal faces: piled arms; the west face has the dedication tablet, two Victories and the door
  const ARMS_W = 1024, ARMS_H = 576; // 5.4 × 3.04 m
  const armsFace = (seed, front) => reliefPair(ARMS_W, ARMS_H, (gc, gb, W, H) => {
    const r = rng(seed);
    gc.fillStyle = '#c4b7a0'; gc.fillRect(0, 0, W, H); gb.fillStyle = '#585858'; gb.fillRect(0, 0, W, H);
    const busy = (x, y) => front && ((x > W * 0.27 && x < W * 0.73 && y < H * 0.5) || (x > W * 0.4 && x < W * 0.6 && y > H * 0.48));
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y = H * 0.12 + r() * H * 0.84; if (busy(x, y)) continue;
      const s = 50 + r() * 70, a = (r() - 0.5) * 1.6, list = Carve.ARMS[Math.floor(r() * Carve.ARMS.length)](r);
      const c = Math.cos(a), sn = Math.sin(a);
      Carve.draw(gc, gb, list, (u, v) => [x + (u * c - v * sn) * s, y - (u * sn + v * c) * s], s, PLASTER);
    }
    // moulded frame
    for (const [x0, y0, x1, y1] of [[0, 0, W, 16], [0, H - 16, W, H], [0, 0, 16, H], [W - 16, 0, W, H]]) {
      gc.fillStyle = '#ddd3c1'; gc.fillRect(x0, y0, x1 - x0, y1 - y0); gb.fillStyle = '#f0f0f0'; gb.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (!front) return;
    // two winged Victories holding the tablet
    for (const sd of [-1, 1]) {
      const cx = W / 2 + sd * W * 0.2, base = H * 0.5, s = H * 0.42;
      Carve.draw(gc, gb, [['P', [[-0.12, 0], [0.14, 0], [0.1, 0.75], [-0.08, 0.75]], 0.7], ['E', 0, 0.84, 0.07, 0.08, 0, 0.8],
        ['P', [[0.02, 0.72], [-0.45, 1.0], [-0.3, 0.8], [-0.5, 0.75], [-0.05, 0.55]], 0.6], ['L', 0.05, 0.62, 0.32, 0.8, 0.06, 0.85]], (u, v) => [cx + u * s * -sd, base - v * s], s, PLASTER);
    }
    const tx0 = W * 0.31, tx1 = W * 0.69, ty0 = H * 0.08, ty1 = H * 0.46;
    gc.fillStyle = '#e6ddcb'; gc.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0); gb.fillStyle = '#e8e8e8'; gb.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    gc.strokeStyle = '#8a7c66'; gc.lineWidth = 3; gc.strokeRect(tx0 + 6, ty0 + 6, tx1 - tx0 - 12, ty1 - ty0 - 12);
    const lines = ['SENATVS·POPVLVSQVE·ROMANVS', 'IMP·CAESARI·DIVI·NERVAE·F·NERVAE', 'TRAIANO·AVG·GERM·DACICO·PONTIF', 'MAXIMO·TRIB·POT·XVII·IMP·VI·COS·VI·P·P', 'AD·DECLARANDVM·QVANTAE·ALTITVDINIS', 'MONS·ET·LOCVS·TANT[IS·OPER]IBVS·SIT·EGESTVS'];
    gc.fillStyle = '#5b4e3d'; gb.fillStyle = '#9a9a9a'; gc.textAlign = gb.textAlign = 'center';
    lines.forEach((t, i) => {
      for (const g of [gc, gb]) { g.font = `600 ${i ? 15 : 19}px "Cormorant Garamond", "Times New Roman", serif`; g.fillText(t, W / 2, ty0 + 34 + i * 30, tx1 - tx0 - 30); }
    });
    // the door
    const dx0 = W * 0.43, dx1 = W * 0.57, dy0 = H * 0.55;
    gc.fillStyle = '#d9cfbc'; gc.fillRect(dx0 - 10, dy0 - 10, dx1 - dx0 + 20, H - dy0); gb.fillStyle = '#e0e0e0'; gb.fillRect(dx0 - 10, dy0 - 10, dx1 - dx0 + 20, H - dy0);
    gc.fillStyle = '#3a322a'; gc.fillRect(dx0, dy0, dx1 - dx0, H - dy0 - 16); gb.fillStyle = '#202020'; gb.fillRect(dx0, dy0, dx1 - dx0, H - dy0 - 16);
  });
  const castParts = []; // merged plaster parts without their own texture
  const C = (g) => castParts.push(g.index ? g.toNonIndexed() : g);
  const add = (geo, mat, x, y, z) => { const m = addMesh(geo, mat, hall, { cast: true }); m.position.set(x, y, z); return m; };

  // --- lower half on the pedestal ---
  const X = TRAJAN.x, Z = TRAJAN.zLow, PW = 5.4;
  C(new THREE.BoxGeometry(PW + 0.6, 0.36, PW + 0.6).translate(X, 0.18, Z));
  C(new THREE.BoxGeometry(PW + 0.3, 0.28, PW + 0.3).translate(X, 0.5, Z));
  const side = relMat(armsFace(5, false), 1, 1), front = relMat(armsFace(9, true), 1, 1);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z — the dedication faces the hall (west, -x)
  add(new THREE.BoxGeometry(PW, 3.04, PW), [side, front, plaster, plaster, side, side], X, 0.64 + 1.52, Z);
  C(new THREE.BoxGeometry(PW + 0.1, 0.72, PW + 0.1).translate(X, 3.68 + 0.36, Z)); // frieze zone behind the garlands
  C(new THREE.BoxGeometry(PW + 0.6, 0.3, PW + 0.6).translate(X, 4.55, Z));
  C(new THREE.BoxGeometry(PW + 0.25, 0.18, PW + 0.25).translate(X, 4.79, Z));
  // eagles on the corners, holding the oak garlands
  const eagle = () => {
    const g = [];
    g.push(new THREE.SphereGeometry(0.3, 12, 10).scale(0.85, 1.15, 0.8).translate(0, 0.32, 0));
    g.push(new THREE.SphereGeometry(0.14, 10, 8).translate(0, 0.72, 0.1));
    g.push(new THREE.ConeGeometry(0.06, 0.18, 8).rotateX(Math.PI / 2).translate(0, 0.7, 0.28));
    for (const sd of [-1, 1]) g.push(new THREE.BoxGeometry(0.95, 0.55, 0.07).translate(sd * 0.5, 0.25, 0).rotateZ(sd * 0.35).rotateY(sd * 0.55).translate(0, 0.35, -0.05));
    g.push(new THREE.BoxGeometry(0.3, 0.08, 0.35).translate(0, 0.0, -0.1));
    return g;
  };
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const yaw = Math.atan2(sx, sz); // face out along the corner diagonal
    for (const g of eagle()) C(g.rotateY(yaw).translate(X + sx * (PW / 2 - 0.05), 3.95, Z + sz * (PW / 2 - 0.05)));
  }
  const oak = relMat(laurel, 10, 1, 2.5);
  const garlands = [];
  for (const [ax, az, bx, bz] of [[-1, -1, -1, 1], [1, -1, 1, 1], [-1, -1, 1, -1], [-1, 1, 1, 1]]) {
    const a = new THREE.Vector3(X + ax * (PW / 2 + 0.12), 4.1, Z + az * (PW / 2 + 0.12)), b = new THREE.Vector3(X + bx * (PW / 2 + 0.12), 4.1, Z + bz * (PW / 2 + 0.12));
    const mid = a.clone().lerp(b, 0.5); mid.y -= 1.05;
    const out = new THREE.Vector3(mid.x - X, 0, mid.z - Z).normalize().multiplyScalar(0.25); mid.add(out);
    garlands.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone().add(out.clone().multiplyScalar(0.3)), mid, b.clone().add(out.clone().multiplyScalar(0.3))), 24, 0.19, 10, false));
  }
  addMesh(mergeGeometries(garlands), oak, hall, { cast: true });
  // laurel torus and the foot of the shaft
  add(new THREE.TorusGeometry(2.08, 0.42, 18, 96).rotateX(Math.PI / 2), relMat(laurel, 14, 1, 3), X, 5.3, Z);
  C(new THREE.CylinderGeometry(1.96, 2.0, 0.26, 64).translate(X, 5.82, Z));
  const LOW_H = 13.2, low0 = 5.95;
  add(new THREE.CylinderGeometry(1.8, 1.9, LOW_H, 128, 1, true), shaftMat(LOW_H), X, low0 + LOW_H / 2, Z);
  C(new THREE.CircleGeometry(1.8, 64).rotateX(-Math.PI / 2).translate(X, low0 + LOW_H, Z)); // the cut where the cast is divided

  // --- upper half with the capital ---
  const Z2 = TRAJAN.zUp, UP_H = 13.2, up0 = 1.3;
  C(new THREE.BoxGeometry(4.3, 1.0, 4.3).translate(X, 0.5, Z2));
  C(new THREE.BoxGeometry(4.0, 0.3, 4.0).translate(X, 1.15, Z2));
  add(new THREE.CylinderGeometry(1.68, 1.8, UP_H, 128, 1, true), shaftMat(UP_H), X, up0 + UP_H / 2, Z2);
  C(new THREE.TorusGeometry(1.72, 0.09, 8, 64).rotateX(Math.PI / 2).translate(X, up0 + UP_H + 0.05, Z2));
  add(new THREE.CylinderGeometry(2.3, 1.72, 0.8, 64, 1, true), relMat(egg, 6, 1, 3), X, up0 + UP_H + 0.5, Z2); // echinus, egg-and-dart
  C(new THREE.BoxGeometry(4.7, 0.55, 4.7).translate(X, up0 + UP_H + 1.17, Z2)); // abacus
  C(new THREE.CylinderGeometry(1.25, 1.35, 1.1, 48).translate(X, up0 + UP_H + 2.0, Z2)); // drum for the (absent) statue
  addMesh(mergeGeometries(castParts), plaster, hall, { cast: true });
})();

/* ---------- the Pórtico de la Gloria ---------- */
const PORTICO = { w: 17.4, h: 10.57 };
(function portico() {
  // painted plaster: a warm grey stone with darker weathering
  const grain = reliefPair(256, 256, (gc, gb, W, H) => {
    noiseFill(gc, W, H, '#a99d88', 0.08, 3600);
    for (let i = 0; i < 26; i++) { gc.fillStyle = `rgba(80,66,52,${Math.random() * 0.09})`; gc.fillRect(Math.random() * W, Math.random() * H, 4 + Math.random() * 30, 20 + Math.random() * 60); }
    gb.fillStyle = '#808080'; gb.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 80 | 0; gb.fillStyle = `rgb(${v},${v},${v})`; gb.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  });
  const mat = (t, rx, ry, bs) => {
    const map = t.map.clone(), bump = t.bump.clone();
    for (const x of [map, bump]) { x.needsUpdate = true; x.repeat.set(rx, ry); }
    return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: bs, roughness: 0.9, envMapIntensity: 0.3 });
  };
  const stone = mat(grain, 3, 3, 0.8), figMat = mat(grain, 1, 1, 0.6);
  // carved ornament for the archivolts and capitals: leaves and beads
  const ornT = reliefPair(512, 64, (gc, gb, W, H) => {
    gc.fillStyle = '#9c907b'; gc.fillRect(0, 0, W, H); gb.fillStyle = '#404040'; gb.fillRect(0, 0, W, H);
    const tone = [[160, 148, 128], [196, 186, 166]];
    for (let i = 0; i < 16; i++) {
      const x = i * 32 + 16;
      for (const ox of [0, W, -W]) {
        Carve.paint(gc, gb, (u, v) => [x + ox + u, H / 2 - v], 1, ['E', -6, 6, 13, 7, 0.7, 0.8], tone);
        Carve.paint(gc, gb, (u, v) => [x + ox + u, H / 2 - v], 1, ['E', 6, -6, 13, 7, 0.7, 0.75], tone);
        Carve.paint(gc, gb, (u, v) => [x + 16 + ox + u, H / 2 - v], 1, ['E', 0, 0, 5, 5, 0, 0.95], tone);
      }
    }
  });
  const orn = mat(ornT, 1, 1, 3);
  // local frame: u across the façade (= -z), y up, w out from the west wall (= x + 24)
  const F = new THREE.Matrix4().makeTranslation(HALL.x0, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  const S = [], O = [], FG = [], D = [];
  const P = (g, list = S) => list.push((g.index ? g.toNonIndexed() : g).applyMatrix4(F));
  const box = (sx, sy, sz, u, y, w, list) => P(new THREE.BoxGeometry(sx, sy, sz).translate(u, y, w), list);
  const halfW = PORTICO.w / 2, H = PORTICO.h;
  // arches: [centre u, inner radius, springing height]
  const CEN = [0, 2.3, 5.3], SIDES = [[-5.9, 1.4, 5.3], [5.9, 1.4, 5.3]];
  // the façade wall with the three arches cut through, and the dark space behind them
  const face = new THREE.Shape(); face.moveTo(-halfW, 0); face.lineTo(halfW, 0); face.lineTo(halfW, H); face.lineTo(-halfW, H); face.lineTo(-halfW, 0);
  for (const [cu, r, sp] of [CEN, ...SIDES]) { const p = new THREE.Path(); p.moveTo(cu - r, 0.001); p.lineTo(cu - r, sp); p.absarc(cu, sp, r, Math.PI, 0, true); p.lineTo(cu + r, 0.001); p.lineTo(cu - r, 0.001); face.holes.push(p); }
  P(new THREE.ExtrudeGeometry(face, { depth: 0.7, bevelEnabled: false, curveSegments: 32 }));
  box(PORTICO.w, H, 0.05, 0, H / 2, 0.03, D);
  // the bench of beasts runs under the piers (not across the doorways)
  for (const [u0, u1] of [[-halfW, -7.3], [-4.5, -2.3], [2.3, 4.5], [7.3, halfW]]) {
    box(u1 - u0, 1.1, 1.05, (u0 + u1) / 2, 0.55, 1.22);
    box(u1 - u0 + 0.06, 0.16, 1.14, (u0 + u1) / 2, 1.13, 1.22, O);
    for (let u = u0 + 0.35; u < u1 - 0.2; u += 0.62) { // beasts' heads with snouts and ears
      P(new THREE.SphereGeometry(0.17, 10, 8).scale(1.15, 0.85, 0.95).translate(u, 0.58, 1.74), FG);
      P(new THREE.SphereGeometry(0.08, 8, 6).scale(1, 0.8, 1.3).translate(u, 0.52, 1.92), FG);
      for (const e of [-1, 1]) P(new THREE.ConeGeometry(0.04, 0.12, 6).translate(u + e * 0.1, 0.75, 1.7), FG);
    }
  }
  // crown: corbel table and cornice
  box(PORTICO.w + 0.4, 0.42, 0.7, 0, H - 0.21, 0.95);
  for (let u = -halfW + 0.35; u < halfW; u += 0.7) box(0.3, 0.22, 0.2, u, H - 0.53, 1.2, O);

  // --- figures, Romanesque proportions: built standing on y = 0, facing +w ---
  const seg = (h) => (h > 1 ? 24 : h > 0.5 ? 14 : 9);
  function draped(profile, h, folds, depth, sz, f0, f1) { // a lathe body with vertical folds pressed into the drapery
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * h, y * h)), seg(h));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i) / h, z = pos.getZ(i);
      if (y < f0 || y > f1) continue;
      const k = 1 + depth * Math.sin(Math.atan2(x, z) * folds) * Math.min(1, (f1 - y) * 5, (y - f0) * 8 + 0.3);
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
    g.scale(1, 1, sz); g.computeVertexNormals(); return g;
  }
  const limb = (a, b, r, h) => strut(new THREE.Vector3(...a).multiplyScalar(h), new THREE.Vector3(...b).multiplyScalar(h), r * h, h > 1 ? 8 : 5);
  const ball = (r, h, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r * h, h > 1 ? 14 : 8, h > 1 ? 10 : 6).scale(sx, sy, sz).translate(x * h, y * h, z * h);
  function head(h, o, y) {
    const g = [ball(0.068, h, 0, y, 0.01, 0.92, 1.12, 0.98), ball(0.072, h, 0, y + 0.02, -0.012, 1, 0.9, 1)]; // face and hair
    if (o.beard) g.push(new THREE.ConeGeometry(0.045 * h, 0.1 * h, 8).rotateX(Math.PI).translate(0, (y - 0.07) * h, 0.04 * h));
    if (o.crown) g.push(new THREE.CylinderGeometry(0.07 * h, 0.06 * h, 0.05 * h, 10).translate(0, (y + 0.08) * h, 0));
    if (o.halo) g.push(new THREE.CylinderGeometry(0.135 * h, 0.135 * h, 0.018 * h, 24).rotateX(Math.PI / 2).translate(0, (y + 0.01) * h, -0.07 * h));
    if (o.cross) for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0]]) g.push(new THREE.BoxGeometry((dx ? 0.05 : 0.035) * h, (dy ? 0.05 : 0.035) * h, 0.025 * h).translate(dx * 0.12 * h, (y + 0.01 + dy * 0.12) * h, -0.055 * h));
    return g;
  }
  const ROBE = [[0, 0], [0.15, 0], [0.165, 0.03], [0.14, 0.25], [0.125, 0.45], [0.14, 0.6], [0.165, 0.7], [0.16, 0.77], [0.1, 0.81], [0.045, 0.83], [0, 0.83]];
  function standing(h, o = {}) {
    const g = [draped(ROBE, h, 11, 0.07, 0.62, 0.02, 0.62), ...head(h, o, 0.89),
      ball(0.04, h, -0.05, 0.02, 0.1, 1, 0.6, 1.6), ball(0.04, h, 0.05, 0.02, 0.1, 1, 0.6, 1.6)]; // feet on the corbel
    // arms bent to hold something at the chest
    for (const sd of [-1, 1]) g.push(limb([sd * 0.15, 0.76, 0], [sd * 0.13, 0.6, 0.06], 0.035, h), limb([sd * 0.13, 0.6, 0.06], [sd * 0.05, 0.64, 0.12], 0.032, h));
    if (o.book) g.push(new THREE.BoxGeometry(0.15 * h, 0.19 * h, 0.045 * h).rotateX(-0.25).translate(0, 0.64 * h, 0.13 * h));
    if (o.scroll) g.push(new THREE.CylinderGeometry(0.022 * h, 0.022 * h, 0.42 * h, 8).rotateZ(0.7).translate(0, 0.6 * h, 0.13 * h));
    if (o.wings) for (const sd of [-1, 1]) g.push(new THREE.PlaneGeometry(0.2 * h, 0.55 * h, 1, 4).translate(0, -0.1 * h, 0).rotateZ(sd * 0.3).rotateY(sd * 0.9).translate(sd * 0.14 * h, 0.66 * h, -0.07 * h));
    if (o.attr === 'cross') g.push(new THREE.BoxGeometry(0.03 * h, 0.75 * h, 0.03 * h).translate(0.09 * h, 0.6 * h, 0.13 * h), new THREE.BoxGeometry(0.28 * h, 0.03 * h, 0.03 * h).translate(0.09 * h, 0.82 * h, 0.13 * h));
    if (o.attr === 'column') g.push(new THREE.CylinderGeometry(0.035 * h, 0.035 * h, 0.5 * h, 8).translate(0.06 * h, 0.62 * h, 0.14 * h));
    if (o.attr === 'crown') g.push(new THREE.TorusGeometry(0.06 * h, 0.018 * h, 5, 12).translate(0, 0.66 * h, 0.15 * h));
    if (o.attr === 'spear') g.push(new THREE.CylinderGeometry(0.012 * h, 0.012 * h, 0.9 * h, 6).rotateZ(0.2).translate(0.08 * h, 0.6 * h, 0.13 * h));
    return g;
  }
  function seated(h, o = {}) {
    const g = [new THREE.BoxGeometry(0.46 * h, 0.4 * h, 0.3 * h).translate(0, 0.2 * h, -0.06 * h), // throne
      draped([[0, 0], [0.15, 0], [0.135, 0.12], [0.15, 0.27], [0.15, 0.33], [0.09, 0.38], [0.04, 0.4], [0, 0.4]], h, 9, 0.06, 0.7, 0.0, 0.3).translate(0, 0.42 * h, -0.01 * h),
      ...head(h, o, 0.9)];
    for (const sd of [-1, 1]) {
      g.push(limb([sd * 0.08, 0.44, 0], [sd * 0.09, 0.46, 0.26], 0.07, h)); // thigh
      g.push(limb([sd * 0.09, 0.44, 0.27], [sd * 0.09, 0.05, 0.3], 0.055, h)); // shin
      g.push(ball(0.045, h, sd * 0.09, 0.02, 0.36, 1, 0.6, 1.6)); // foot
    }
    // drapery falling between the knees, in folds
    const pnl = new THREE.PlaneGeometry(0.28 * h, 0.42 * h, h > 1 ? 18 : 8, 2), pp = pnl.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin((pp.getX(i) / (0.28 * h) + 0.5) * Math.PI * 6) * 0.015 * h);
    pnl.computeVertexNormals(); g.push(pnl.rotateX(-0.12).translate(0, 0.25 * h, 0.35 * h));
    const pose = o.pose || 'book';
    if (pose === 'wounds') for (const sd of [-1, 1]) g.push(limb([sd * 0.15, 0.76, 0], [sd * 0.24, 0.62, 0.06], 0.04, h), limb([sd * 0.24, 0.62, 0.06], [sd * 0.27, 0.8, 0.1], 0.035, h), ball(0.04, h, sd * 0.27, 0.84, 0.11, 1, 1.3, 0.5));
    else {
      for (const sd of [-1, 1]) g.push(limb([sd * 0.15, 0.76, 0], [sd * 0.14, 0.6, 0.08], 0.035, h), limb([sd * 0.14, 0.6, 0.08], [sd * 0.05, 0.56, 0.2], 0.032, h));
      if (pose === 'book') g.push(new THREE.BoxGeometry(0.15 * h, 0.19 * h, 0.045 * h).rotateX(-0.9).translate(0, 0.55 * h, 0.22 * h));
      if (pose === 'viol') g.push(ball(0.07, h, 0.02, 0.6, 0.17, 1, 1.5, 0.45), new THREE.BoxGeometry(0.025 * h, 0.2 * h, 0.025 * h).translate(0.02 * h, 0.8 * h, 0.17 * h), limb([-0.12, 0.66, 0.2], [0.14, 0.58, 0.2], 0.008, h));
      if (pose === 'harp') g.push(new THREE.TorusGeometry(0.1 * h, 0.012 * h, 4, 14, Math.PI * 1.3).rotateZ(-0.6).translate(0.02 * h, 0.66 * h, 0.17 * h));
      if (pose === 'staff') g.push(new THREE.CylinderGeometry(0.018 * h, 0.018 * h, 1.0 * h, 8).translate(0.2 * h, 0.55 * h, 0.14 * h), new THREE.CylinderGeometry(0.022 * h, 0.022 * h, 0.3 * h, 8).rotateZ(1.2).translate(-0.04 * h, 0.58 * h, 0.2 * h));
    }
    return g;
  }
  const place = (parts, u, y, w, rot = 0) => { for (const g of parts) P(g.rotateZ(rot).translate(u, y, w), FG); };

  // --- the central portal ---
  const [cu, cr, csp] = CEN;
  // archivolts: five carved orders stepping outwards; the 24 Elders sit between the third and fourth
  for (const [r, t, w] of [[cr + 0.12, 0.13, 0.82], [cr + 0.38, 0.13, 0.98], [cr + 0.64, 0.13, 1.14], [cr + 1.36, 0.15, 1.38], [cr + 1.62, 0.18, 1.52]]) {
    const g = new THREE.TorusGeometry(r, t, 10, 64, Math.PI); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round(r * 5));
    P(g.translate(cu, csp, w), O);
  }
  P(new THREE.RingGeometry(cr + 0.74, cr + 1.24, 56, 1, 0, Math.PI).translate(cu, csp, 1.0));
  const instr = ['viol', 'harp', 'viol', 'viol', 'harp', 'viol'];
  for (let i = 0; i < 24; i++) { // the 24 Elders of the Apocalypse, crowned, seated radially in conversing pairs, playing
    const th = Math.PI * (i + 0.5) / 24, rr = cr + 0.78;
    place(seated(0.46, { pose: instr[i % 6], crown: true, beard: true }), cu + Math.cos(th) * rr, csp + Math.sin(th) * rr, 1.04, th - Math.PI / 2);
  }
  // tympanum on its lintel
  box(cr * 2 + 0.2, 0.26, 0.5, cu, csp - 0.15, 0.55, O);
  P(new THREE.CylinderGeometry(cr, cr, 0.3, 48, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).translate(cu, csp - 0.02, 0.42));
  place(seated(1.8, { pose: 'wounds', halo: true, cross: true, beard: true }), cu, csp, 0.72); // Christ in Majesty, showing his wounds
  [['book'], ['book'], ['book'], ['book']].forEach(([pose], i) => { // the four Evangelists, writing
    const [u, y, h] = [[-0.98, 0.02, 0.76], [0.98, 0.02, 0.76], [-0.84, 0.92, 0.6], [0.84, 0.92, 0.6]][i];
    place(seated(h, { pose, halo: true, beard: i % 2 === 0 }), cu + u, csp + y, 0.66);
  });
  const passion = ['cross', 'column', 'crown', 'spear', 'cross', 'column', 'crown', 'spear'];
  [[-1.6, 0.02, 0.64], [1.6, 0.02, 0.64], [-1.96, 0.02, 0.46], [1.96, 0.02, 0.46], [-1.42, 0.92, 0.48], [1.42, 0.92, 0.48], [-1.12, 1.52, 0.4], [1.12, 1.52, 0.4]]
    .forEach(([u, y, h], i) => place(standing(h, { wings: true, attr: passion[i] }), cu + u, csp + y, 0.62)); // angels with the instruments of the Passion
  for (let i = 0; i < 26; i++) { // the blessed, in rows under the arch either side of Christ's halo
    const sd = i < 13 ? -1 : 1, j = i % 13, row = j < 7 ? 0 : 1, n = row ? 6 : 7, k = row ? j - 7 : j;
    const th = Math.PI / 2 + sd * (0.34 + 0.88 * (k + 0.5) / n), rr = row ? 2.12 : 1.9, bu = cu + Math.cos(th) * rr, by = csp + Math.sin(th) * rr;
    for (const g of [...head(0.9, {}, 0.0), draped([[0, 0], [0.11, 0], [0.12, 0.08], [0.06, 0.13], [0, 0.13]], 0.9, 6, 0.05, 0.7, 0, 0.08).translate(0, -0.2 * 0.9, 0)]) P(g.translate(bu, by, 0.62), FG);
  }
  // trumeau: the Tree of Jesse column on its base of beasts, St James seated on the capital
  box(0.75, 1.1, 0.7, cu, 0.55, 0.9);
  for (const sd of [-1, 1]) P(new THREE.SphereGeometry(0.2, 10, 8).scale(1.3, 0.9, 1).translate(cu + sd * 0.26, 1.25, 1.12), FG); // lions
  P(new THREE.CylinderGeometry(0.22, 0.24, 2.3, 16).translate(cu, 1.1 + 1.15, 0.9));
  for (let k = 0; k < 22; k++) { // the vine of Jesse with its small figures
    const a = k * 0.85, y = 1.22 + k * 0.1;
    P(new THREE.SphereGeometry(k % 4 ? 0.06 : 0.085, 7, 5).translate(cu + Math.cos(a) * 0.25, y, 0.9 + Math.sin(a) * 0.25), FG);
  }
  P(new THREE.CylinderGeometry(0.4, 0.26, 0.36, 4, 1).rotateY(Math.PI / 4).translate(cu, 3.58, 0.92), O); // capital
  place(seated(1.12, { pose: 'staff', halo: true, beard: true }), cu, 3.76, 0.9); // St James, with his pilgrim's staff
  box(0.9, 0.12, 0.5, cu, 5.0, 0.95, O); // canopy
  // dark doorways either side of the trumeau, under the lintel
  for (const sd of [-1, 1]) box(cr - 0.28, csp - 0.3, 0.05, cu + sd * (0.14 + cr / 2), (csp - 0.3) / 2, 0.08, D);
  // jambs: four columns a side, prophets (north) and apostles (south) standing against them
  for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
    const u = cu + sd * (cr + 0.2 + k * 0.35), w = 0.85 + k * 0.2;
    P(new THREE.CylinderGeometry(0.13, 0.14, csp - 1.2, 14).translate(u, 1.2 + (csp - 1.2) / 2, w));
    P(new THREE.CylinderGeometry(0.25, 0.14, 0.34, 4, 1).rotateY(Math.PI / 4).translate(u, csp - 0.17, w), O); // capital
    box(0.32, 0.14, 0.3, u, 1.95, w + 0.2, O); // corbel
    place(standing(1.85, { book: k % 2 === 0, scroll: k % 2 === 1, halo: sd > 0, beard: k !== 2 }), u, 2.02, w + 0.24);
    box(0.38, 0.12, 0.34, u, 4.05, w + 0.2, O); // canopy
  }
  // --- the side arches: open, with figured archivolts ---
  for (const [su, sr, ssp] of SIDES) {
    for (const [r, t, w] of [[sr + 0.12, 0.12, 0.85], [sr + 0.38, 0.12, 1.02], [sr + 0.7, 0.14, 1.22]]) {
      const g = new THREE.TorusGeometry(r, t, 10, 48, Math.PI); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round(r * 5));
      P(g.translate(su, ssp, w), O);
    }
    for (let i = 0; i < 12; i++) { const th = Math.PI * (i + 0.5) / 12, rr = sr + 0.22; place(standing(0.32, { wings: su > 0 && i % 3 === 0 }), su + Math.cos(th) * rr, ssp + Math.sin(th) * rr, 0.95, th - Math.PI / 2); }
    box(sr * 2, ssp + sr, 0.05, su, (ssp + sr) / 2, 0.08, D);
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) {
      const u = su + sd * (sr + 0.18 + k * 0.32), w = 0.85 + k * 0.2;
      P(new THREE.CylinderGeometry(0.12, 0.13, ssp - 1.2, 14).translate(u, 1.2 + (ssp - 1.2) / 2, w));
      P(new THREE.CylinderGeometry(0.23, 0.13, 0.3, 4, 1).rotateY(Math.PI / 4).translate(u, ssp - 0.15, w), O);
    }
  }
  // column-statues on the outer piers
  for (const sd of [-1, 1]) {
    const u = sd * (halfW - 0.4);
    box(0.62, csp - 1.2, 0.5, u, 1.2 + (csp - 1.2) / 2, 1.0);
    box(0.4, 0.14, 0.32, u, 1.95, 1.4, O);
    place(standing(1.9, { book: sd < 0, scroll: sd > 0, halo: true, beard: true }), u, 2.02, 1.42);
    box(0.46, 0.12, 0.36, u, 4.1, 1.4, O);
    box(0.72, 0.3, 0.6, u, csp - 0.15, 1.05, O);
  }
  addMesh(mergeGeometries(S), stone, hall, { cast: true });
  addMesh(mergeGeometries(O), orn, hall, { cast: true });
  addMesh(mergeGeometries(FG), figMat, hall, { cast: true });
  addMesh(mergeGeometries(D), M.green, hall); // the openings show the green wall behind
  // museum light on the Pórtico: the sun comes from behind this wall, so a raking spot brings out the carving
  const spot = new THREE.SpotLight(0xfff0dc, 640, 0, 0.66, 0.7, 2);
  spot.name = 'portico-light';
  spot.position.set(HALL.x0 + 8.5, 14, 7.2); spot.target.position.set(HALL.x0 + 0.6, 5.0, -0.6);
  spot.castShadow = true; spot.shadow.mapSize.set(isSmall() ? 1024 : 2048, isSmall() ? 1024 : 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
})();

/* floor plan for walk mode: free area and obstacles [x0, z0, x1, z1] */
const WALK = {
  bounds: { x0: HALL.x0 + PORT_D - 0.1, x1: HALL.x1 - 1.35, z0: -HALL.z + 1.3, z1: HALL.z - 1.3 },
  rects: [
    [-18.25, -3.95, 15.85, 3.95], // pool, coping and cascade
    [TRAJAN.x - 3.0, TRAJAN.zLow - 3.0, TRAJAN.x + 3.0, TRAJAN.zLow + 3.0], // pedestal
    [TRAJAN.x - 2.2, TRAJAN.zUp - 2.2, TRAJAN.x + 2.2, TRAJAN.zUp + 2.2], // base of the upper half
  ],
};
