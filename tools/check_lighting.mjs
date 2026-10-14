import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../js/04c-lighting.js', import.meta.url), 'utf8');
const state = { value: 0, target: 0, from: 0, elapsed: 0, moving: false };
const canvas = { dataset: {} }, root = { dataset: {} }, attributes = {};
const icon = {}, label = {};
const button = { setAttribute: (k, v) => { attributes[k] = v; }, querySelector: () => icon, addEventListener: () => {} };
const reduced = { matches: false }, samples = [];
const context = {
  state, canvas, reduced,
  document: { documentElement: root, getElementById: id => id === 'lightingBtn' ? button : label },
  localStorage: { setItem: () => { throw new Error('storage blocked'); }, getItem: () => 'night' },
  apply: v => { samples.push(v); },
  clamp: x => Math.max(0, Math.min(1, x)), mix: (a, b, t) => a + (b - a) * t,
};
const api = vm.runInNewContext(source.slice(source.indexOf('  function set('), source.indexOf('  return { init,')) + '; ({set, update, init})', context);
api.set(true); assert.equal(state.value, 0); assert.equal(canvas.dataset.lightingTransition, 'running');
api.update(1.3); assert.equal(state.value, 0.5);
api.set(false); assert.equal(state.from, 0.5); // Reversal starts at the displayed light level.
api.update(1.3); assert.equal(state.value, 0.25);
api.update(1.3); assert.equal(state.value, 0); assert.equal(state.moving, false);
assert.equal(root.dataset.lighting, 'day'); assert.equal(attributes['aria-pressed'], 'false');
api.set(true); reduced.matches = true; api.update(0.01);
assert.equal(state.value, 1); assert.equal(canvas.dataset.lightingTransition, 'complete');
api.set(false); assert.equal(state.value, 0); // Reduced motion switches without animation.
api.init(); assert.equal(state.value, 1); // Saved preference restores immediately.
const count = samples.length; api.update(100); assert.equal(samples.length, count); // No idle frame work.
assert(samples.every(v => v >= 0 && v <= 1));
console.log('✓ Lighting: smooth fade, mid-transition reversal, reduced motion, blocked storage, saved night and idle frames');
