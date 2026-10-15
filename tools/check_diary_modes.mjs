import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const source = read('js/05-seq.js');
const ceramic = { opacity: 1, transparent: false, depthWrite: true };
const contextPlaster = { opacity: 0.4, transparent: true, depthWrite: false };
const V = Array.from({ length: 4 }, (_, i) => ({ work: String(i), g: {}, fig: { geometry: { id: i } }, tag: { classList: { add() {} } }, rib: {}, bones: {} }));
const S = { diaryDisplay: 'deluxe', view: 'ribbons', day: [{}, {}], pos: [{ act: {} }, { act: null }, { act: {} }, { act: null }], own: true, bones: true };
const original = V.map(v => v.fig.geometry), originalPositions = S.pos;
const attributes = [], hint = {}, canvas = { dataset: {} }, renderer = { shadowMap: {} };
const buttons = ['basic', 'deluxe'].map(mode => ({ dataset: { diaryDisplay: mode }, setAttribute(k, v) { attributes.push([mode, k, v]); } }));
const ctx = { S, V, ceramic, contextPlaster, canvas, renderer, skinMesh: null, focusedSculpture: null,
  clearSculptureFocus() { ctx.focusedSculpture = null; },
  document: { querySelectorAll: () => buttons, getElementById: id => id === 'diaryDisplayHint' ? hint : null },
  localStorage: { setItem() { throw new Error('blocked'); } } };
const api = vm.runInNewContext(source.slice(source.indexOf('function applyViewTo'), source.indexOf('function setView(')) + '; ({setDiaryDisplay, applyView})', ctx);
api.setDiaryDisplay('basic');
assert.deepEqual(V.map(v => v.g.visible), [true, false, true, false]);
assert.equal(V[0].fig.material, ceramic); assert.equal(V[1].fig.material, contextPlaster);
assert.equal(V[1].fig.castShadow, false, 'Transparent context must not cast an opaque shadow');
assert.equal(canvas.dataset.diaryDisplay, 'basic');
api.setDiaryDisplay('deluxe'); assert(V.every(v => v.g.visible));
assert.equal(V[1].fig.material.opacity, 0.4, '60% transparency = 40% opacity');
assert.equal(ceramic.opacity, 1, 'Shared specimen plaster remains opaque');
assert.deepEqual(V.map(v => v.fig.geometry), original); assert.equal(S.pos, originalPositions, 'Mode switching cannot reroll the sequence');
const rise = {}; V[1].riseMaterial = rise; V[1].fig.material = rise;
api.setDiaryDisplay('deluxe'); assert.equal(rise.opacity, 0.4);
S.pos[1].act = {}; api.applyView(); assert.equal(rise.opacity, 1); assert.equal(rise.transparent, false); assert.equal(rise.depthWrite, true);
ctx.focusedSculpture = V[3]; api.setDiaryDisplay('basic'); assert.equal(ctx.focusedSculpture, null);
S.pos = []; S.day = []; api.applyView(); assert(V.every(v => !v.g.visible), 'Empty basic diary shows no unrelated figures');
api.setDiaryDisplay('invalid'); assert.equal(S.diaryDisplay, 'deluxe');
const css = read('style.css');
const caption = css.match(/\.diary-pose-caption\{([^}]+)\}/)[1];
assert(caption.includes('background:transparent')); assert(caption.includes('color:#000')); assert(caption.includes('box-shadow:none')); assert(caption.includes('font-family:var(--font-display)'));
console.log('✓ Diary modes: story-only basic, 60% transparent deluxe, stable sequence/models, rise materials, focus/empty state, blocked storage and plain black captions');
