
/* ---------------------------------------------------------------
   Export for Blender and the group: skin OBJ, sequence JSON,
   Blender MCP prompt, packed into a zip; local copy of the page.
---------------------------------------------------------------- */
function sequenceData() {
  return {
    project: 'Venus, Re-posed · V&A Cast Courts × Goddess Atlas',
    created: new Date().toISOString(),
    source: S.source,
    units: 'metres, Y up; sequence runs along X; figures face +Z; plinth top at y = ' + PT,
    atlas: 'Goddess Sculpture Atlas (group research site); meshes are its display copies, scaled per pose class',
    skin: { form: 'cast-plaster ribbons', style: S.skinStyle, poseRibbons: S.own, sequenceRibbon: 'silk: one wide main ribbon + two thin strands; coils round each sculpture of the day in order, rising and falling between them', widthByDuration: true },
    positions: S.pos.map((p, i) => {
      const r = REC[p.work];
      return {
        index: i + 1, x: +(V[i] ? V[i].x : 0).toFixed(3), z: +(V[i] ? V[i].z : 0).toFixed(3), status: p.status,
        pose_class: r.cls, gesture: p.act ? p.act.g : null,
        activity: p.act ? { label: p.act.label, time: p.act.time, hours: p.act.hours } : null,
        sculpture: { atlas_id: r.id, title: recTitle(r), artist: r.a, date: r.d, museum: r.m, atlas_pose: r.pose, skeleton_source: r.sk ? r.sk.src : null, source_url: r.src },
        replaced: p.status === 'swap' ? { atlas_id: p.orig.id, title: recTitle(REC[p.orig.id]), pose_class: REC[p.orig.id].cls } : null,
        palette: paletteFor(i),
      };
    }),
  };
}
async function skinOBJ() {
  if (!skinMesh || !skinMesh.userData.ready) return null;
  const lines = ['# Venus, Re-posed — plaster ribbons around the pose sequence', '# metres, Y up; import in Blender with Forward -Z, Up Y'];
  let base = 0;
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  const add = (name, mesh) => { // one object per ribbon, in world coordinates
    const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index.array;
    mesh.updateWorldMatrix(true, false); _nm.getNormalMatrix(mesh.matrixWorld);
    lines.push('o ' + name);
    for (let i = 0; i < P.count; i++) { _p.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); lines.push(`v ${_p.x.toFixed(4)} ${_p.y.toFixed(4)} ${_p.z.toFixed(4)}`); }
    for (let i = 0; i < P.count; i++) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); lines.push(`vn ${_n.x.toFixed(3)} ${_n.y.toFixed(3)} ${_n.z.toFixed(3)}`); }
    for (let i = 0; i < I.length; i += 3) { const a = I[i] + base + 1, b = I[i + 1] + base + 1, c = I[i + 2] + base + 1; lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`); }
    base += P.count;
  };
  add('sequence_ribbon', skinMesh);
  skinMesh.children.forEach((m, k) => add('sequence_ribbon_strand_' + (k + 2), m));
  V.forEach((vp, i) => { if (vp.rib) vp.rib.children.forEach((m, k) => add(`pose_ribbon_${pad2(i + 1)}_${k + 1}_atlas${vp.work}`, m)); });
  for (let i = 0; i < S.pos.length; i++) {
    const p = S.pos[i], x = V[i] ? V[i].x : 0, z = V[i] ? V[i].z : 0;
    let mesh; try { mesh = await meshOf(p.work); } catch (e) { continue; }
    if (!mesh.skel.length) continue;
    lines.push(`o skeleton_${pad2(i + 1)}_atlas${p.work}`);
    for (const f of mesh.skel) for (let k = 0; k < f.segs.length; k += 2) {
      const A = f.segs[k], B = f.segs[k + 1];
      lines.push(`v ${(A[0] + x).toFixed(4)} ${(A[1] + PT).toFixed(4)} ${(A[2] + z).toFixed(4)}`, `v ${(B[0] + x).toFixed(4)} ${(B[1] + PT).toFixed(4)} ${(B[2] + z).toFixed(4)}`);
      lines.push(`l ${base + 1} ${base + 2}`); base += 2;
    }
  }
  return lines.join('\n') + '\n';
}
function blenderPrompt() {
  const seq = S.pos.map((p, i) => `${i + 1}. x = ${(V[i] ? V[i].x : 0).toFixed(2)} m, z = ${(V[i] ? V[i].z : 0).toFixed(2)} m · ${REC[p.work].cls}${p.act && p.act.g ? ' (' + p.act.g + ')' : ''} · ${p.act ? p.act.label + (p.act.hours ? ', ' + p.act.hours + ' h' : '') : 'no activity'} · atlas #${p.work} ${recTitle(REC[p.work])} · ${p.status}`).join('\n');
  return `In the open Blender scene, import skin.obj (Forward -Z, Up Y) and read sequence.json from the same folder.
The sequence runs along the X axis of the Cast Court model; each position names a Goddess Atlas model (atlas_id), its pose_class and a duration in hours.
For each position, import that atlas model's original OBJ from the research folder, scale it to the same height, and place it on a plinth whose top is at y = ${PT}.
skin.obj holds cast-plaster ribbons in world coordinates:
- sequence_ribbon (and its two thin strands): one continuous wide silk ribbon, smooth with few folds (think of the Dove chocolate silk adverts), that comes down from the vault, sweeps round each sculpture of the day in sequence order, and rises and falls in waves from one sculpture to the next; its width grows with the duration of each activity
- pose_ribbon_NN_k: each sculpture's own ribbons — a band wrapping the body a little off its silhouette and leaving the shoulders in a scroll, ribbons flying off raised hands, or a band settling on the plinth
Refine them as cast plaster drapery: keep the centre lines, give the ribbons 2–4 cm thickness with softened edges and deeper folds where the edges ruffle, and keep every ribbon at least 5 cm away from the sculptures and from each other.
Give the sculptures a white glazed-ceramic material and the ribbons a matt white plaster with a light tint of each pose's palette. Put the result in a new collection "Skin". Report what you created.

Current sequence:
${seq}`;
}
/* minimal zip (stored, no compression) */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
async function saveFile(filename, data) {
  const dl = await claudeUse('downloads');
  if (dl) {
    try { await dl.save({ filename, data }); toast('已保存 ' + filename); return true; }
    catch (e) { if (e && e.code === 'declined') return false; toast('没有保存：' + (e && e.code || '未知原因')); return false; }
  }
  try { // outside claude.ai (local copy)
    const blob = data instanceof Blob ? data : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
  } catch (e) { toast('这个页面不能直接下载文件。'); return false; }
}
async function exportZip() {
  const obj = await skinOBJ();
  if (!obj) { toast('表皮还在生成，稍等片刻再导出。'); return; }
  const zip = makeZip([
    { name: 'skin.obj', data: obj },
    { name: 'sequence.json', data: JSON.stringify(sequenceData(), null, 2) },
    { name: 'blender_prompt.txt', data: blenderPrompt() },
    { name: 'README.txt', data: 'Venus, Re-posed — exported from the virtual Cast Courts.\nskin.obj: the plaster ribbons — the sequence ribbon and every sculpture\'s own pose ribbons — plus the atlas skeleton candidates as polylines.\nsequence.json: positions, pose classes, activities, Goddess Atlas models, palettes.\nblender_prompt.txt: prompt for Blender MCP / Codex.\n' },
  ]);
  await saveFile('venus-reposed-skin.zip', zip);
}
async function copyPrompt() {
  const text = blenderPrompt();
  try { await navigator.clipboard.writeText(text); toast('已复制 Blender MCP 提示词'); }
  catch (e) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box"><h2>BLENDER PROMPT</h2><p class="small muted">浏览器不允许直接复制，请全选后复制。</p><textarea id="promptBox" style="min-height:260px;font-family:var(--font-mono);font-size:11.5px"></textarea><div class="row"><button class="btn primary" id="promptClose">关闭</button></div></div>`;
    $('#app').appendChild(m); const ta = $('#promptBox', m); ta.value = text; ta.select();
    $('#promptClose', m).onclick = () => m.remove();
  }
}
