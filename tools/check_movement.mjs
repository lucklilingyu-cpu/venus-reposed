import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const source = read('js/05-seq.js');
const records = JSON.parse(read('data/atlas.json')).records;
const extra = JSON.parse(read('data/atlas-extra.json'));
const REC = Object.fromEntries(records.map(r => [r.id, { ...r, ...extra.fix[r.id] }]));
const FIGS = Object.values(REC).filter(r => r.kind === 'figure' && r.cls);
const ids = vm.runInNewContext(read('js/01-data.js').match(/const EXISTING = (\[[^;]+?\])\s*\.filter/)[1]);
const EXISTING = ids.filter(id => REC[id]?.cls).map(id => ({ id }));
function position(x = 0, y = 0, z = 0) { return { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }; }
const context = {
  S: { layout: 's', day: [], override: {} }, V: [], REC, FIGS, EXISTING, CANON: {},
  fitsCls: (r, cls) => r.cls === cls || (r.alt || []).includes(cls),
  canvas: { dataset: {} }, tweens: [], reduceMotion: false,
  THREE: { MathUtils: { clamp: (x, a, b) => Math.max(a, Math.min(b, x)) } },
  clearTimeout: () => {}, setTimeout: () => 1, scene: { remove: () => {} },
  tween: () => ({}), pulseRing: () => {}, disposeFigure: vp => { vp.fig = null; },
  makePosition: () => ({ g: { position: position(), scale: { x: 1, setScalar(v) { this.x = v; } } }, tag: { remove() {} }, moveHalo: { material: { opacity: 0 }, scale: { set() {} } }, work: null, fig: null, fresh: false }),
};
const code = source.slice(source.indexOf('const TARGET'), source.indexOf('const meshCache')) + source.slice(source.indexOf('const GREEN_BOUNDS'), source.indexOf('function relayout')) +
  source.slice(source.indexOf('const KIN'), source.indexOf('let applySeq')) +
  '; ({computeSequence, planLayout, arrangeBoard, boardMotion, figureScale, CELLS, GREEN_BOUNDS, get moves() {return lastMoves;}})';
const api = vm.runInNewContext(code, context);
const day = ['horizontal', 'standing', 'seated', 'crouching', 'walking', 'reclining'].map(cls => ({ cls, g: null }));
context.S.day = day;
let seq = api.computeSequence(day, [], false);
api.arrangeBoard(seq, false);
function install(seq) { context.V.forEach((vp, i) => { vp.work = seq[i].work; vp.fig = {}; }); }
install(seq);
for (let run = 0; run < 50; run++) {
  const next = api.computeSequence(day, seq, true);
  assert.equal(new Set(next.map(p => p.work)).size, next.length, 'No duplicate sculptures');
  day.forEach((act, i) => {
    assert(context.fitsCls(REC[next[i].work], act.cls), 'Same pose class retained');
    assert.notEqual(next[i].work, seq[i].work, 'Use another sculpture where alternatives exist');
  });
  api.arrangeBoard(next, true, 0, true);
  assert.equal(api.moves.filter(m => m.background).length, next.length - day.length, 'Every background sculpture moves');
  const plan = api.planLayout(next.length);
  day.forEach((_, i) => { assert.equal(context.V[i].x, plan.day[i].x); assert.equal(context.V[i].z, plan.day[i].z); });
  context.V.forEach(vp => vp.g.position.set(vp.x, 0, vp.z)); install(next); seq = next;
}
context.S.override = { 0: '7' };
assert.equal(api.computeSequence(day, seq, true)[0].work, '7', 'Manual placement preserved');
const p = position(), b = api.GREEN_BOUNDS, margin = 2.3;
for (const ext of [[1, 1, 1], [100, 1, 20], [1, 0.01, 100], [1, 10, 1]]) {
  const scale = api.figureScale(ext, 'standing');
  assert(ext[0] * scale <= 2.1 + 1e-9 && ext[2] * scale <= 2.1 + 1e-9);
  const ringX = Math.max(0.66, ext[0] * scale / 2 + 0.26) * 1.42 * 1.18 * 1.035;
  const ringZ = Math.max(0.6, ext[2] * scale / 2 + 0.24) * 1.42 * 1.18 * 1.035;
  assert(ringX < margin && ringZ < margin, 'Even the pulsing landing ring fits the margin');
}
for (const from of api.CELLS) for (const to of api.CELLS) for (const xFirst of [false, true]) for (let k = 0; k <= 50; k++) {
  api.boardMotion(p, from, to, xFirst, from.x === to.x || from.z === to.z, k / 50);
  assert(p.x - margin >= b.x0 - 1e-9 && p.x + margin <= b.x1 + 1e-9);
  assert(p.z - margin >= b.z0 - 1e-9 && p.z + margin <= b.z1 + 1e-9);
}
console.log('✓ Movement: 50 varied sequences, all background sculptures move, story/manual placement retained, every rook path and 2.3 m footprint inside green tiles');
