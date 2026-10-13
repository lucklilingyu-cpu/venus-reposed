
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
    skin: { style: S.skinStyle, cutFront: S.cut, clearance_m: 0.26, blend: 'smooth union, k = 0.7', stretchByDuration: true },
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
  const g = skinMesh.geometry, P = g.attributes.position, N = g.attributes.normal;
  const lines = ['# Venus, Re-posed — skin generated around the pose sequence', '# metres, Y up; import in Blender with Forward -Z, Up Y', 'o skin'];
  for (let i = 0; i < P.count; i++) lines.push(`v ${P.getX(i).toFixed(4)} ${P.getY(i).toFixed(4)} ${P.getZ(i).toFixed(4)}`);
  for (let i = 0; i < P.count; i++) lines.push(`vn ${N.getX(i).toFixed(3)} ${N.getY(i).toFixed(3)} ${N.getZ(i).toFixed(3)}`);
  const keep = (k) => !S.cut || P.getZ(k) <= 0.12;
  const tri = (a, b, c) => { if (keep(a) && keep(b) && keep(c)) lines.push(`f ${a + 1}//${a + 1} ${b + 1}//${b + 1} ${c + 1}//${c + 1}`); };
  if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i += 3) tri(I[i], I[i + 1], I[i + 2]); }
  else for (let i = 0; i < P.count; i += 3) tri(i, i + 1, i + 2);
  let base = P.count;
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
Use skin.obj as the starting surface. Refine it so each part accommodates its pose:
- standing: a vertical folded wall behind the figure, height = 1.3 x figure height, folds shifted toward the weight-bearing leg
- seated: a shell that supports the hips and curves up behind the back, seat height = hip height
- crouching: a low dome around the figure, radius = bounding sphere + 0.3 m
- reclining: a horizontal curved surface following the spine and legs
- horizontal: a flat slab under the body plus a low canopy above it
- walking: a long ribbon along the walking direction
Keep every surface at least 0.3 m away from the body. Loft consecutive surfaces into one continuous skin; the length of each transition is proportional to its duration.
Give sculptures and skin a white glazed-ceramic material; colour each skin part lightly with its palette. Put the result in a new collection "Skin". Report what you created.

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
    { name: 'README.txt', data: 'Venus, Re-posed — exported from the virtual Cast Courts.\nskin.obj: blended skin around the pose sequence (front cut ' + (S.cut ? 'on' : 'off') + ') plus the atlas skeleton candidates as polylines.\nsequence.json: positions, pose classes, activities, Goddess Atlas models, palettes.\nblender_prompt.txt: prompt for Blender MCP / Codex.\n' },
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
