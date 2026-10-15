import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../js/05-seq.js', import.meta.url), 'utf8');
let timer, group, disposed = 0;
class Group { constructor() { this.children = []; } add(...nodes) { this.children.push(...nodes); } traverse(fn) { this.children.forEach(fn); } clear() { this.children.length = 0; } }
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  copy(v) { Object.assign(this, v); return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  addScaledVector(v, n) { this.x += v.x * n; this.y += v.y * n; this.z += v.z * n; return this; }
  normalize() { return this; }
}
class Geometry { dispose() { disposed++; } setDrawRange(start, count) { this.drawCount = count; } }
class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new Vector3(); this.quaternion = { setFromUnitVectors() {} }; } }
class Curve {
  constructor(v0, v1, v2) { Object.assign(this, { v0, v1, v2 }); }
  getLength() { return 1; }
  getPoint(t, target = new Vector3()) { target.x = t; return target; }
}
const seq = [{ work: '1', act: { cls: 'standing' } }, { work: '2', act: null }, { work: '3', act: { cls: 'seated' } }];
const figures = seq.map(p => ({ work: p.work, fig: {}, x: 0, z: 0, poseTag: { classList: { add() {} } } }));
const canvas = { dataset: {} }, S = { pos: seq };
const context = { S, V: figures, canvas, reduceMotion: false, scene: { add(g) { group = g; } }, clearTimeout() { timer = null; }, setTimeout(fn) { timer = fn; return 1; },
  THREE: { Group, Vector3, Mesh, MeshBasicMaterial: class {}, QuadraticBezierCurve3: Curve, TubeGeometry: Geometry, ConeGeometry: Geometry } };
const guide = vm.runInNewContext(source.slice(source.indexOf('const SequenceGuide ='), source.indexOf('/* ---------- the board:')) + '; SequenceGuide', context);
guide.schedule(seq, 100); guide.update(0); assert.equal(guide.active, false);
timer(); figures[0].riseTween = {}; guide.update(1000); assert.equal(guide.active, false, 'Wait for model rise');
figures[0].riseTween = null; guide.update(2000);
assert.equal(guide.active, true); assert.equal(group.children.length, 2, 'Only link the two diary participants');
assert.equal(canvas.dataset.sequenceGuideCount, '2');
assert.equal(group.children[0].material.opacity, 0, 'Route fades in from zero opacity');
guide.update(2110); assert(guide.routeOpacity(2110) > 0 && guide.routeOpacity(2110) < 1);
guide.update(2500); const firstArrowPosition = group.children[1].position.x;
guide.update(3000); assert(group.children[1].position.x > firstArrowPosition, 'One arrow travels forward along the action route');
assert(group.children[0].geometry.drawCount > 0, 'The line reveals behind the arrow');
guide.update(3700); assert(guide.routeOpacity(3700) > 0 && guide.routeOpacity(3700) < 1, 'Route gradually fades before its 2s deadline');
guide.update(3999); assert.equal(guide.showOrder(3999), true); assert.equal(group.visible, true);
guide.update(4000);
assert.equal(guide.showOrder(4000), false, 'Ordinal badges expire after exactly 2000 ms');
assert.equal(canvas.dataset.sequenceOrder, 'hidden'); assert.equal(guide.active, true, 'Pose names remain after the transient guide');
assert.equal(canvas.dataset.sequenceGuide, 'hidden'); assert.equal(group.visible, false); assert.equal(group.children.length, 0, 'Ground line and arrows are removed after 2 seconds');
assert.equal(guide.captionOpacity(7000), 1, 'Pose text holds for five seconds');
assert(guide.captionOpacity(7500) > 0 && guide.captionOpacity(7500) < 1, 'Pose text fades during the following second');
assert.equal(guide.captionOpacity(8000), 0, 'Pose text disappears after the fade');
guide.clear(); assert.equal(disposed, 2); assert.equal(group.children.length, 0);
guide.schedule(seq, 100); const obsolete = timer; const newer = [{ work: '4', act: { cls: 'standing' } }];
S.pos = newer; obsolete(); guide.update(5000); assert.equal(guide.active, false, 'Obsolete sequences cannot display');
guide.schedule(newer, 0); figures[0].work = '4'; timer(); guide.update(6000); assert.equal(group.children.length, 0, 'Single pose has no connecting segment');
guide.schedule([], 0); assert.equal(guide.active, false); assert.equal(canvas.dataset.sequenceGuide, 'hidden');
S.pos = seq; figures[0].work = '1';
for (const mode of ['basic', 'deluxe']) for (const view of ['sculpture', 'skin', 'both', 'ribbons', 'surface']) {
  S.diaryDisplay = mode; S.view = view; guide.schedule(seq, 0); timer(); guide.update(10000);
  assert.equal(group.visible, true); assert.equal(group.children.length, 2);
  guide.update(11999); assert.equal(group.visible, true);
  guide.update(12000); assert.equal(group.visible, false); assert.equal(group.children.length, 0);
  assert.equal(guide.active, true, 'Pose names remain in every mode/view');
  assert.equal(guide.captionOpacity(15000), 1); assert.equal(guide.captionOpacity(16000), 0);
}
context.reduceMotion = true; guide.schedule(seq, 0); timer(); guide.update(20000);
const restingArrow = group.children[1].position.x; guide.update(20500); assert.equal(group.children[1].position.x, restingArrow, 'Reduced-motion preference disables spatial arrow travel');
guide.update(22000); assert.equal(group.children.length, 0); assert.equal(guide.captionOpacity(26000), 0);
context.reduceMotion = false; seq[1].act = { cls: 'walking' }; guide.schedule(seq, 0); timer(); guide.update(30000);
assert.equal(group.children.length, 3, 'Two connected path segments share exactly one moving arrow');
guide.update(31000);
assert.equal(group.children[0].geometry.drawCount, 64 * 36, 'First segment completes before the second');
assert(group.children[1].geometry.drawCount > 0 && group.children[1].geometry.drawCount < 64 * 36);
guide.update(32000); assert.equal(group.children.length, 0);
console.log('✓ Diary guide: moving arrow, gradual route reveal/fade within 2s, pose text holds 5s then fades for 1s, all modes/views, cancellation and reduced motion');
