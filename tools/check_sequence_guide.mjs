import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../js/05-seq.js', import.meta.url), 'utf8');
let timer, group, disposed = 0;
class Group { constructor() { this.children = []; } add(...nodes) { this.children.push(...nodes); } traverse(fn) { this.children.forEach(fn); } clear() { this.children.length = 0; } }
class Vector3 { normalize() { return this; } }
class Geometry { dispose() { disposed++; } }
class Mesh { constructor(geometry) { this.geometry = geometry; this.position = { copy() {} }; this.quaternion = { setFromUnitVectors() {} }; } }
class Curve { getPoint() { return new Vector3(); } getTangent() { return new Vector3(); } }
const seq = [{ work: '1', act: { cls: 'standing' } }, { work: '2', act: null }, { work: '3', act: { cls: 'seated' } }];
const figures = seq.map(p => ({ work: p.work, fig: {}, x: 0, z: 0, poseTag: { classList: { add() {} } } }));
const canvas = { dataset: {} }, S = { pos: seq };
const context = { S, V: figures, canvas, scene: { add(g) { group = g; } }, clearTimeout() { timer = null; }, setTimeout(fn) { timer = fn; return 1; },
  THREE: { Group, Vector3, Mesh, MeshBasicMaterial: class {}, QuadraticBezierCurve3: Curve, TubeGeometry: Geometry, ConeGeometry: Geometry } };
const guide = vm.runInNewContext(source.slice(source.indexOf('const SequenceGuide ='), source.indexOf('/* ---------- the board:')) + '; SequenceGuide', context);
guide.schedule(seq, 100); guide.update(0); assert.equal(guide.active, false);
timer(); figures[0].riseTween = {}; guide.update(1000); assert.equal(guide.active, false, 'Wait for model rise');
figures[0].riseTween = null; guide.update(2000);
assert.equal(guide.active, true); assert.equal(group.children.length, 2, 'Only link the two diary participants');
assert.equal(canvas.dataset.sequenceGuideCount, '2');
guide.update(3999); assert.equal(guide.showOrder(3999), true); assert.equal(group.visible, true);
guide.update(4000);
assert.equal(guide.showOrder(4000), false, 'Ordinal badges expire after exactly 2000 ms');
assert.equal(canvas.dataset.sequenceOrder, 'hidden'); assert.equal(guide.active, true, 'Pose names remain after the transient guide');
assert.equal(canvas.dataset.sequenceGuide, 'hidden'); assert.equal(group.visible, false); assert.equal(group.children.length, 0, 'Ground line and arrows are removed after 2 seconds');
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
}
console.log('✓ Diary guide: arrival/rise wait, story-only links, exact 2s ground route/arrows/ordinals in all modes/views, persistent pose names and cleanup');
