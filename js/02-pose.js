
/* ---------------------------------------------------------------
   Pose library. Each work is approximated by a skeleton posed with
   joint angles (degrees). Body frame: y up, figure faces +z, her
   left is +x. root = list of world rotations applied afterwards.
---------------------------------------------------------------- */
const POSES = {
  knidia:     { pelvis: { tilt: -6, yaw: -4 }, chest: { bend: 5, twist: 5, lean: 2 }, head: { yaw: 30, pitch: 12, roll: -4 },
                L: { arm: { flex: 8, abd: 14, elbow: 26 }, leg: { flex: 14, abd: -7, knee: 24 } },
                R: { arm: { flex: 26, abd: -2, twist: 58, elbow: 34 }, leg: {} }, props: ['hydria'] },
  medici:     { pelvis: { tilt: 6 }, chest: { bend: -5, lean: 7 }, head: { yaw: 38, pitch: 12 },
                R: { arm: { flex: 34, abd: 2, twist: 78, elbow: 112 }, leg: { flex: 15, abd: -7, knee: 26 } },
                L: { arm: { flex: 24, abd: 0, twist: 55, elbow: 32 }, leg: {} }, props: ['dolphin'] },
  capitoline: { pelvis: { tilt: -5 }, chest: { bend: 4, lean: 6 }, head: { yaw: 28, pitch: 10 },
                L: { arm: { flex: 24, abd: 0, twist: 55, elbow: 34 }, leg: { flex: 14, abd: -6, knee: 24 } },
                R: { arm: { flex: 34, abd: 2, twist: 78, elbow: 114 }, leg: {} }, props: ['vase'] },
  milo:       { pelvis: { tilt: -7, yaw: 8 }, chest: { bend: 6, twist: -10, lean: -3 }, head: { yaw: -22, pitch: 6 },
                R: { arm: { flex: 12, abd: 10, len: 0.3 }, leg: {} },
                L: { arm: { flex: 30, abd: 34, len: 0.22 }, leg: { flex: 24, abd: -4, knee: 32 } }, drape: 'skirt' },
  kore:       { head: { pitch: 2 }, R: { arm: { flex: 2, abd: 5, elbow: 6 }, leg: { abd: 2 } },
                L: { arm: { flex: 6, abd: 6, elbow: 86, twist: 12 }, leg: { flex: 5, abd: 2, knee: 6 } }, drape: 'long' },
  caryatid:   { pelvis: { tilt: -4 }, chest: { bend: 3 }, R: { arm: { flex: 2, abd: 7, elbow: 6 }, leg: {} },
                L: { arm: { flex: 2, abd: 7, elbow: 10 }, leg: { flex: 12, abd: -2, knee: 20 } }, drape: 'long', props: ['capital'] },
  goujon:     { pelvis: { tilt: 5, yaw: -8 }, chest: { twist: 14, bend: -6 }, head: { yaw: -28, pitch: 8 },
                L: { arm: { flex: 165, abd: 22, elbow: 138 }, leg: {} },
                R: { arm: { flex: 10, abd: 8, elbow: 24, twist: 24 }, leg: { flex: 18, abd: -8, knee: 28 } }, drape: 'hip', props: ['urnShoulder'] },
  pilon:      { head: { pitch: -6 }, L: { arm: { flex: 168, abd: 16, elbow: 42 }, leg: { flex: 8, knee: 12 } },
                R: { arm: { flex: 168, abd: 16, elbow: 42 }, leg: {} }, drape: 'long', props: ['urnTop'] },
  cyrene:     { pelvis: { tilt: -6 }, chest: { bend: 6 }, head: { pitch: 18, roll: 12 },
                L: { arm: { flex: 138, abd: 42, elbow: 124 }, leg: { flex: 14, abd: -5, knee: 22 } },
                R: { arm: { flex: 138, abd: 42, elbow: 124 }, leg: {} }, props: ['stump'] },
  titian:     { pelvis: { tilt: 7 }, chest: { bend: -7, twist: 8 }, head: { pitch: 14, roll: -14, yaw: 10 },
                L: { arm: { flex: 135, abd: 40, elbow: 120 }, leg: {} },
                R: { arm: { flex: 125, abd: 46, elbow: 128 }, leg: { flex: 16, abd: -6, knee: 26 } } },
  sandal:     { pelvis: { tilt: -8, lean: 10 }, chest: { lean: 14, bend: -8, twist: -10 }, head: { pitch: 26, yaw: 22 },
                R: { arm: { flex: 55, abd: 62, elbow: 40 }, leg: {} },
                L: { arm: { flex: 12, abd: 12, twist: 34, elbow: 88 }, leg: { flex: 30, abd: -12, knee: 118 } } },
  pompeii:    { pelvis: { tilt: -8, lean: 6 }, chest: { lean: 8, bend: -6 }, head: { pitch: 20, yaw: 25 },
                R: { arm: { flex: 20, abd: 40, elbow: 50 }, leg: {} },
                L: { arm: { flex: 10, abd: 14, twist: 30, elbow: 70 }, leg: { flex: 26, abd: -10, knee: 112 } }, props: ['pillar'] },
  kallipygos: { pelvis: { tilt: 6 }, chest: { twist: -26, bend: -4 }, head: { yaw: -78, pitch: 26 },
                R: { arm: { flex: 72, abd: 58, elbow: 78 }, leg: { flex: 16, abd: -6, knee: 24 } },
                L: { arm: { flex: 110, abd: 40, elbow: 72 }, leg: {} }, drape: 'mantle' },
  david:      { male: true, pelvis: { tilt: -6 }, chest: { bend: 5 }, head: { yaw: 36, pitch: 2 },
                L: { arm: { flex: 52, abd: 36, elbow: 142, twist: 22 }, leg: { flex: 16, abd: -9, knee: 22 } },
                R: { arm: { flex: 4, abd: 6, elbow: 14 }, leg: {} }, props: ['stump'] },
  diana:      { pelvis: { yaw: -10, lean: 4 }, chest: { twist: 22, lean: 4 }, head: { yaw: 36, pitch: 2 },
                L: { arm: { flex: 28, abd: 12, elbow: 12 }, leg: { flex: 30, abd: 3, knee: 8 } },
                R: { arm: { flex: 150, abd: 22, elbow: 135 }, leg: { flex: -22, abd: 3, knee: 30 } }, drape: 'hip' },
  nike:       { noHead: true, pelvis: { lean: 6 }, chest: { lean: 16, twist: -6 },
                L: { arm: { flex: 40, abd: 30, len: 0.18 }, leg: { flex: 22, abd: 2, knee: 18 } },
                R: { arm: { flex: 40, abd: 30, len: 0.18 }, leg: { flex: -16, abd: 3, knee: 16 } }, drape: 'skirt', props: ['wings'] },
  demeter:    { chest: { lean: -4 }, head: { pitch: 6 },
                L: { arm: { flex: 22, abd: 8, elbow: 62, twist: 10 }, leg: { flex: 82, abd: 9, knee: 86 } },
                R: { arm: { flex: 46, abd: 22, elbow: 100 }, leg: { flex: 80, abd: 7, knee: 96 } }, drape: 'lap', props: ['throne'] },
  vaseated:   { scale: 0.8, chest: { lean: 6 }, head: { pitch: 12 },
                L: { arm: { flex: 22, abd: 6, elbow: 70, twist: 24 }, leg: { flex: 88, abd: 6, knee: 88 } },
                R: { arm: { flex: 28, abd: 6, elbow: 84, twist: 36 }, leg: { flex: 88, abd: 6, knee: 88 } }, drape: 'lap', props: ['seat'] },
  crouching:  { pelvis: { lean: 24 }, chest: { lean: 12, twist: -24, bend: 8 }, head: { yaw: -46, pitch: 12 },
                R: { arm: { flex: 72, abd: 0, twist: 84, elbow: 124 }, leg: { flex: 98, abd: 12, knee: 152 } },
                L: { arm: { flex: 42, abd: 16, elbow: 36 }, leg: { flex: 118, abd: 22, knee: 138 } } },
  rhodes:     { pelvis: { lean: 20 }, chest: { lean: 6, bend: 6 }, head: { pitch: 18, roll: 12 },
                R: { arm: { flex: 142, abd: 38, elbow: 126 }, leg: { flex: 100, abd: 12, knee: 150 } },
                L: { arm: { flex: 142, abd: 38, elbow: 126 }, leg: { flex: 118, abd: 20, knee: 136 } } },
  paolina:    { root: [['z', 52]], chest: { twist: 12 }, head: { roll: -30, yaw: 18 },
                R: { arm: { flex: 40, abd: 55, elbow: 118 }, leg: { flex: 6, abd: -42, knee: 6 } },
                L: { arm: { flex: 16, abd: 18, twist: 30, elbow: 38 }, leg: { flex: 14, abd: 36, knee: 30 } }, props: ['couch'] },
  cellini:    { root: [['z', -56]], chest: { twist: -10 }, head: { roll: 28, yaw: -18 },
                L: { arm: { flex: 30, abd: 52, elbow: 70 }, leg: { flex: 6, abd: -44, knee: 8 } },
                R: { arm: { flex: 120, abd: 40, elbow: 40 }, leg: { flex: 34, abd: 30, knee: 56 } }, props: ['couch'] },
  pediment:   { root: [['z', -50]], chest: { twist: -8 }, head: { roll: 26, yaw: -12, pitch: 8 },
                L: { arm: { flex: 20, abd: 55, elbow: 80 }, leg: { flex: 8, abd: -40, knee: 10 } },
                R: { arm: { flex: 20, abd: 10, twist: 30, elbow: 40 }, leg: { flex: 22, abd: 36, knee: 34 } }, drape: 'skirt', props: ['couch'] },
  effigy:     { root: [['x', -90], ['y', 90]], head: { pitch: 0 },
                L: { arm: { flex: 34, abd: 0, twist: 72, elbow: 104 }, leg: { abd: 1 } },
                R: { arm: { flex: 34, abd: 0, twist: 72, elbow: 104 }, leg: { abd: 1 } }, drape: 'long', props: ['tomb'] },
  sleeping:   { root: [['x', -90], ['y', 90], ['x', 24]], head: { yaw: 22, roll: 8 },
                R: { arm: { flex: 160, abd: 30, elbow: 128 }, leg: { flex: 4, abd: 2 } },
                L: { arm: { flex: 28, abd: 2, twist: 46, elbow: 30 }, leg: { flex: 10, abd: -8, knee: 16 } }, props: ['bed'] },
};
/* canonical poses used for class icons, the camera demo and the pose alphabet */
const CANON = { standing: 'knidia', walking: 'diana', seated: 'demeter', crouching: 'crouching', reclining: 'paolina', horizontal: 'effigy' };

const D2R = Math.PI / 180;
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);
function qE(x, y, z) { return new THREE.Quaternion().setFromEuler(new THREE.Euler((x || 0) * D2R, (y || 0) * D2R, (z || 0) * D2R, 'YXZ')); }
function limbDir(flex, abd, side) {
  const d = new THREE.Vector3(0, -1, 0).applyAxisAngle(_X, -(flex || 0) * D2R);
  return d.applyAxisAngle(_Z, side * (abd || 0) * D2R);
}
function hingeFor(abd, side) { return _X.clone().applyAxisAngle(_Z, side * (abd || 0) * D2R); }

/* returns { prims:[...], bones:[[a,b],...], joints, height } in plinth-local coordinates */
function buildPose(id) {
  const s = POSES[id] || POSES.knidia;
  const female = !s.male;
  const sc = s.scale || 1;
  const P = s.pelvis || {}, C = s.chest || {}, H = s.head || {};
  const Qp = qE(P.lean, P.yaw, P.tilt);
  const Qc = Qp.clone().multiply(qE(C.lean, C.twist, C.bend));
  const Qh = Qc.clone().multiply(qE(H.pitch, H.yaw, H.roll));
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const O = v(0, 0, 0);
  const J = {};
  J.pelvis = O.clone();
  J.hipL = v(0.09, -0.06, 0).applyQuaternion(Qp);
  J.hipR = v(-0.09, -0.06, 0).applyQuaternion(Qp);
  J.chestLow = v(0, 0.16, 0).applyQuaternion(Qp);
  J.neck = J.chestLow.clone().add(v(0, 0.3, 0).applyQuaternion(Qc));
  J.shL = J.chestLow.clone().add(v(0.17, 0.26, -0.01).applyQuaternion(Qc));
  J.shR = J.chestLow.clone().add(v(-0.17, 0.26, -0.01).applyQuaternion(Qc));
  J.headBase = J.neck.clone().add(v(0, 0.07, 0.01).applyQuaternion(Qc));
  J.head = J.headBase.clone().add(v(0, 0.11, 0.012).applyQuaternion(Qh));
  // legs
  for (const [k, side] of [['L', 1], ['R', -1]]) {
    const leg = (s[k] && s[k].leg) || {};
    const t = limbDir(leg.flex, leg.abd, side);
    const hinge = hingeFor(leg.abd, side);
    const sh = t.clone().applyAxisAngle(hinge, (leg.knee || 0) * D2R);
    const ft = sh.clone().applyAxisAngle(hinge, -90 * D2R);
    t.applyQuaternion(Qp); sh.applyQuaternion(Qp); ft.applyQuaternion(Qp);
    const hip = J['hip' + k];
    J['knee' + k] = hip.clone().addScaledVector(t, 0.43);
    J['ankle' + k] = J['knee' + k].clone().addScaledVector(sh, 0.42);
    J['toe' + k] = J['ankle' + k].clone().addScaledVector(ft, 0.13);
  }
  // arms
  const armLen = {};
  for (const [k, side] of [['L', 1], ['R', -1]]) {
    const arm = (s[k] && s[k].arm) || {};
    const u = limbDir(arm.flex, arm.abd, side);
    const hinge = hingeFor(arm.abd, side);
    const f = u.clone().applyAxisAngle(hinge, -(arm.elbow || 0) * D2R).applyAxisAngle(u, side * (arm.twist || 0) * D2R);
    u.applyQuaternion(Qc); f.applyQuaternion(Qc);
    const sh = J['sh' + k];
    armLen[k] = arm.len || 1;
    J['elbow' + k] = sh.clone().addScaledVector(u, 0.28 * Math.min(1, armLen[k]));
    J['wrist' + k] = J['elbow' + k].clone().addScaledVector(f, 0.25);
    J['hand' + k] = J['wrist' + k].clone().addScaledVector(f, 0.09);
  }
  // prims
  const prims = [];
  const cap = (a, b, ra, rb, tag) => prims.push({ t: 'c', a: a.clone(), b: b.clone(), ra, rb: rb == null ? ra : rb, tag });
  const sph = (c, r, tag) => cap(c, c, r, r, tag);
  const box = (c, h, r, tag) => prims.push({ t: 'b', c: c.clone(), h: h.slice(), r, tag });
  const hipW = female ? 0.125 : 0.11;
  cap(J.hipL, J.hipR, hipW);
  cap(J.pelvis.clone().add(v(0, -0.02, 0.0).applyQuaternion(Qp)), J.pelvis.clone().add(v(0, -0.07, -0.05).applyQuaternion(Qp)), female ? 0.13 : 0.11);
  cap(J.pelvis.clone().add(v(0, 0.05, 0).applyQuaternion(Qp)), J.chestLow, female ? 0.108 : 0.115, female ? 0.1 : 0.115);
  const chestTop = J.chestLow.clone().add(v(0, 0.2, -0.005).applyQuaternion(Qc));
  cap(J.chestLow.clone().add(v(0, 0.04, 0).applyQuaternion(Qc)), chestTop, female ? 0.122 : 0.138, female ? 0.112 : 0.13);
  cap(J.shL, J.shR, female ? 0.058 : 0.068);
  if (female) { for (const sx of [1, -1]) sph(J.chestLow.clone().add(v(sx * 0.075, 0.135, 0.095).applyQuaternion(Qc)), 0.056); }
  if (!s.noHead) {
    cap(J.neck, J.headBase.clone().add(v(0, 0.03, 0).applyQuaternion(Qc)), 0.05, 0.047);
    cap(J.head.clone().add(v(0, -0.035, 0.02).applyQuaternion(Qh)), J.head.clone().add(v(0, 0.035, -0.008).applyQuaternion(Qh)), 0.093, 0.097);
    if (female) sph(J.head.clone().add(v(0, 0.03, -0.1).applyQuaternion(Qh)), 0.055);
    else sph(J.head.clone().add(v(0, 0.035, -0.012).applyQuaternion(Qh)), 0.098);
  } else {
    cap(J.neck, J.neck.clone().add(v(0, 0.03, 0).applyQuaternion(Qc)), 0.055);
  }
  for (const k of ['L', 'R']) {
    const tR = female ? 0.092 : 0.088;
    cap(J['hip' + k], J['knee' + k], tR, 0.056);
    cap(J['knee' + k], J['ankle' + k], 0.054, 0.036);
    cap(J['ankle' + k], J['toe' + k], 0.036, 0.026);
    if (armLen[k] >= 1) {
      cap(J['sh' + k], J['elbow' + k], 0.048, 0.038);
      cap(J['elbow' + k], J['wrist' + k], 0.037, 0.027);
      cap(J['wrist' + k], J['hand' + k], 0.03, 0.02);
    } else {
      cap(J['sh' + k], J['elbow' + k], 0.05, 0.046);
    }
  }
  const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  const ankM = mid(J.ankleL, J.ankleR), kneeM = mid(J.kneeL, J.kneeR);
  if (s.drape === 'skirt' || s.drape === 'long') {
    const top = J.pelvis.clone().add(v(0, -0.02, 0).applyQuaternion(Qp));
    const end = s.drape === 'long' ? ankM.clone().lerp(top, 0.04) : ankM.clone().lerp(top, 0.12);
    cap(top, end, 0.15, s.drape === 'long' ? 0.17 : 0.21, 'drape');
  } else if (s.drape === 'hip') {
    cap(J.pelvis, kneeM.clone().lerp(J.pelvis, 0.15), 0.145, 0.16, 'drape');
  } else if (s.drape === 'lap') {
    cap(J.pelvis.clone().add(v(0, -0.02, 0.03).applyQuaternion(Qp)), kneeM, 0.15, 0.15, 'drape');
    cap(kneeM, ankM.clone().lerp(kneeM, 0.08), 0.135, 0.18, 'drape');
  } else if (s.drape === 'mantle') {
    cap(J.shR.clone().add(v(0, -0.05, -0.08).applyQuaternion(Qc)), J.kneeR.clone().add(v(0, 0, -0.12).applyQuaternion(Qp)), 0.05, 0.1, 'drape');
    cap(J.handR, J.handL, 0.035, 0.035, 'drape');
  }
  // props (sculptural supports and furniture)
  const props = s.props || [];
  const feetY = Math.min(J.ankleL.y, J.ankleR.y);
  for (const p of props) {
    if (p === 'hydria') { const c = v(0.36, feetY + 0.12, -0.04); sph(c, 0.15, 'prop'); cap(c, c.clone().add(v(0, 0.28, 0)), 0.1, 0.06, 'prop'); cap(J.handL, c.clone().add(v(0, 0.3, 0)), 0.03, 0.06, 'drape'); }
    if (p === 'vase') { const c = v(-0.34, feetY + 0.14, -0.06); sph(c, 0.16, 'prop'); cap(c, c.clone().add(v(0, 0.32, 0)), 0.11, 0.07, 'prop'); }
    if (p === 'dolphin') { const c = v(0.3, feetY + 0.1, 0.02); cap(c, c.clone().add(v(0.02, 0.5, -0.06)), 0.11, 0.05, 'prop'); }
    if (p === 'stump') { const c = v(-0.28, feetY - 0.02, -0.12); cap(c, c.clone().add(v(0.02, 0.62, 0)), 0.11, 0.08, 'prop'); }
    if (p === 'pillar') { const c = v(0.42, feetY - 0.02, -0.05); cap(c, c.clone().add(v(0, 0.95, 0)), 0.07, 0.07, 'prop'); cap(c.clone().add(v(0, 0.95, 0)), J.elbowL, 0.05, 0.04, 'prop'); }
    if (p === 'capital') { box(J.head.clone().add(v(0, 0.17, 0)), [0.2, 0.06, 0.2], 0.03, 'prop'); }
    if (p === 'urnTop') { const c = mid(J.handL, J.handR).add(v(0, 0.12, 0)); sph(c, 0.15, 'prop'); cap(c, c.clone().add(v(0, 0.22, 0)), 0.1, 0.07, 'prop'); }
    if (p === 'urnShoulder') { const c = J.handL.clone().add(v(-0.05, 0.06, -0.05)); sph(c, 0.13, 'prop'); }
    if (p === 'wings') {
      for (const sx of [1, -1]) {
        const b0 = J.chestLow.clone().add(v(sx * 0.1, 0.2, -0.12).applyQuaternion(Qc));
        const b1 = b0.clone().add(v(sx * 0.28, 0.32, -0.32).applyQuaternion(Qc));
        const b2 = b1.clone().add(v(sx * 0.12, 0.18, -0.35).applyQuaternion(Qc));
        cap(b0, b1, 0.09, 0.07, 'prop'); cap(b1, b2, 0.07, 0.03, 'prop');
        cap(b0.clone().add(v(0, -0.15, 0)), b1.clone().add(v(sx * 0.02, -0.2, -0.05)), 0.06, 0.05, 'prop');
      }
    }
  }
  // world/root rotation
  const Qr = new THREE.Quaternion();
  for (const [ax, deg] of (s.root || [])) {
    const q = new THREE.Quaternion().setFromAxisAngle(ax === 'x' ? _X : ax === 'y' ? _Y : _Z, deg * D2R);
    Qr.premultiply(q);
  }
  const all = [];
  for (const k in J) { J[k].applyQuaternion(Qr).multiplyScalar(sc); }
  for (const p of prims) {
    if (p.t === 'c') { p.a.applyQuaternion(Qr).multiplyScalar(sc); p.b.applyQuaternion(Qr).multiplyScalar(sc); p.ra *= sc; p.rb *= sc; all.push(p); }
    else { p.c.applyQuaternion(Qr).multiplyScalar(sc); all.push(p); }
  }
  // furniture that sits under the body after rotation
  const bb = primBounds(prims);
  const addBox = (cx, cy, cz, hx, hy, hz, r) => prims.push({ t: 'b', c: v(cx, cy, cz), h: [hx, hy, hz], r, tag: 'prop' });
  for (const p of props) {
    if (p === 'couch' || p === 'tomb' || p === 'bed') {
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const hx = (bb.max.x - bb.min.x) / 2 + 0.08;
      const top = bb.min.y + (p === 'couch' ? 0.07 : 0.05);
      const hgt = p === 'tomb' ? 0.62 : p === 'couch' ? 0.38 : 0.18;
      addBox(cx, top - hgt / 2, cz - 0.02, hx, hgt / 2, p === 'tomb' ? 0.34 : 0.3, 0.05);
      if (p === 'couch') { // raised end under the head
        const headEnd = J.head.x < cx ? bb.min.x + 0.22 : bb.max.x - 0.22;
        addBox(headEnd, top + 0.12, cz - 0.08, 0.2, 0.16, 0.24, 0.1);
      }
      if (p === 'tomb') { const he = J.head.x < cx ? bb.min.x + 0.12 : bb.max.x - 0.12; addBox(he, top + 0.06, cz, 0.12, 0.06, 0.16, 0.05); }
    }
    if (p === 'throne' || p === 'seat') {
      const seatTop = J.pelvis.y - 0.11 * sc;
      const sz = p === 'throne' ? 0.27 : 0.23;
      addBox(J.pelvis.x, seatTop - 0.5 * (seatTop - Math.min(J.ankleL.y, J.ankleR.y) + 0.05), J.pelvis.z - 0.06, sz, 0.5 * (seatTop - Math.min(J.ankleL.y, J.ankleR.y) + 0.05), sz, 0.03);
      if (p === 'throne') addBox(J.pelvis.x, seatTop + 0.4, J.pelvis.z - 0.3, sz, 0.42, 0.05, 0.03);
    }
  }
  // place on plinth: lowest point at y = 0, centred in x/z
  const b2 = primBounds(prims);
  const off = v(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2 + 0.02);
  for (const p of prims) { if (p.t === 'c') { p.a.add(off); p.b.add(off); } else p.c.add(off); }
  for (const k in J) J[k].add(off);
  const bones = [['head', 'neck'], ['neck', 'shL'], ['neck', 'shR'], ['shL', 'elbowL'], ['elbowL', 'wristL'], ['shR', 'elbowR'], ['elbowR', 'wristR'],
    ['neck', 'chestLow'], ['chestLow', 'pelvis'], ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['hipR', 'kneeR'], ['kneeR', 'ankleR']];
  const b3 = primBounds(prims);
  return { id, prims, joints: J, bones, bounds: b3, height: b3.max.y, armLen };
}
function primBounds(prims) {
  const min = new THREE.Vector3(1e9, 1e9, 1e9), max = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (const p of prims) {
    if (p.t === 'c') {
      for (const q of [p.a, p.b]) { const r = q === p.a ? p.ra : p.rb; min.min(q.clone().subScalar(r)); max.max(q.clone().addScalar(r)); }
    } else {
      const h = new THREE.Vector3(p.h[0] + p.r, p.h[1] + p.r, p.h[2] + p.r);
      min.min(p.c.clone().sub(h)); max.max(p.c.clone().add(h));
    }
  }
  return { min, max };
}
function packPrims(prims, dx = 0, dy = 0, dz = 0) {
  const out = new Float32Array(prims.length * 10);
  prims.forEach((p, i) => {
    const o = i * 10;
    if (p.t === 'c') { out.set([0, p.a.x + dx, p.a.y + dy, p.a.z + dz, p.b.x + dx, p.b.y + dy, p.b.z + dz, p.ra, p.rb, 0], o); }
    else { out.set([1, p.c.x + dx, p.c.y + dy, p.c.z + dz, p.h[0], p.h[1], p.h[2], p.r, 0, 0], o); }
  });
  return out;
}
