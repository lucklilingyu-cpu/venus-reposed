import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../js/05-seq.js', import.meta.url), 'utf8');
const queueCode = source.slice(source.indexOf('let detailLoads'), source.indexOf('async function fetchDetailMesh'));
const slot = vm.runInNewContext(queueCode + '\nwithDetailSlot', { Set, Promise });
let running = 0, peak = 0;
await Promise.allSettled(Array.from({ length: 12 }, (_, i) => slot(async () => {
  running++; peak = Math.max(peak, running);
  await new Promise(resolve => setTimeout(resolve, 5));
  running--;
  if (i === 2) throw new Error('simulated network failure');
})));
assert.equal(peak, 3); assert.equal(running, 0);
assert.equal(await slot(async () => 'recovered'), 'recovered');

let resolveMesh, updates = 0;
const figures = [{ work: '3', fig: { geometry: 'preview', userData: {} } }];
const renderer = { shadowMap: { needsUpdate: false } };
const context = { renderer, V: figures, detailedMeshOf: () => new Promise(resolve => { resolveMesh = resolve; }), updateHallQuality: () => { updates++; } };
const refine = vm.runInNewContext(source.slice(source.indexOf('async function refineFigure'), source.indexOf('/* ---------- materials')) + '; refineFigure', context);
// No selected-position dependency: every sculpture upgrades, even if its plinth moves.
let task = refine(0, { work: '3' }); figures.unshift({ work: '7', fig: {} });
resolveMesh({ detail: true, geo: 'detail', bounds: {} }); await task;
assert.equal(figures[1].fig.geometry, 'detail'); assert.equal(updates, 1);
assert.equal(renderer.shadowMap.needsUpdate, true);
// A superseded download must never replace a newer sculpture.
task = refine(1, { work: '3' }); figures[1].work = '9'; figures[1].fig = { geometry: 'new-preview' };
resolveMesh({ detail: true, geo: 'obsolete-detail' }); await task;
assert.equal(figures[1].fig.geometry, 'new-preview');
console.log('✓ Hall detail: three concurrent loads, recovery, unselected/moving plinths and superseded model requests');
