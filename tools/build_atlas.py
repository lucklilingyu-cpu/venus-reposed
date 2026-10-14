"""Regenerate the atlas data from the Goddess Sculpture Atlas website build.

    python tools/build_atlas.py "D:/新建文件夹/3D analysis/goddess_web/goddess_web/dist"

Reads <dist>/data/*.json, <dist>/gallery/meshes/<n>.bin and <dist>/gallery/thumbs/<n>.webp and writes
data/atlas.json, m/<n>.js (each mesh wrapped as base64 in a small script) and t/<n>.webp in the site folder.
Needs numpy (pip install numpy). Commit the changed files afterwards; there is no build step.
"""
import json, re, os, shutil, math, sys, base64
import numpy as np
if len(sys.argv) < 2:
    sys.exit(__doc__)
SRC = os.path.join(sys.argv[1], '')
PUBLIC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the site folder (repository root)
OUT = os.path.join(PUBLIC, 'data')
catalog = SRC+'data/collection-records.json'
ds=json.load(open(catalog if os.path.exists(catalog) else SRC+'data/goddess_dataset_web.json', encoding='utf-8'))['records']
gm=json.load(open(SRC+'data/gallery-map.json', encoding='utf-8'))['models']
ps=json.load(open(SRC+'data/person-skeletons.json', encoding='utf-8'))
new_ps = SRC+'data/acquisition-person-skeletons.json'
if os.path.exists(new_ps):
    ps['subjects'] += json.load(open(new_ps, encoding='utf-8'))['subjects']
ur=json.load(open(SRC+'data/unirig-candidates.json', encoding='utf-8'))
mv=json.load(open(SRC+'data/goddess_movement_dataset.json', encoding='utf-8'))

REL = re.compile(r'relief|frieze|mosaic|mosaico|temple|gate|agora|nymphaeum|sanctuary|sarcophag|column|slab|pillar|altar|throne|\bbust\b|face of|monument|parthenon|architect|reconstruct', re.I)
def kind(r):
    if r.get('acquisition'): return 'figure'
    txt = ' '.join([r['title'], r.get('pose_raw',''), r.get('description','')])
    if 'relief_setting' in r['surroundings'] or 'architectural_setting' in r['surroundings']: return 'relief'
    if REL.search(r['title']) or REL.search(r.get('pose_raw','')): return 'relief'
    if r['pose'] == ['undetermined']: return 'relief'
    return 'figure'
STRIDE = re.compile(r'leg forward and (the other|right leg|left leg)? ?(leg )?back|one leg forward|strid|walking|mid-?step|advancing', re.I)
LYING = re.compile(r'lying|\blies\b|supine|prone|asleep|sleep|recumbent|extended along', re.I)
def cls_of(r):
    p = r['pose']; raw = r.get('pose_raw','') + ' ' + r.get('description','')
    if not p: return None
    if p[0] in ('standing','upright_unspecified'):
        return 'walking' if STRIDE.search(r.get('pose_raw','')) else 'standing'
    if p[0] == 'seated': return 'seated'
    if p[0] in ('crouching','kneeling'): return 'crouching'
    if p[0] == 'reclining': return 'horizontal' if LYING.search(raw) or 'sleep' in r['title'].lower() else 'reclining'
    return None
def gesture_of(r, c):
    g = set(r['gesture']); raw = r.get('pose_raw','')
    if c in ('standing','crouching') and 'hand_at_head' in g: return 'hair'
    if c == 'standing' and re.search(r'foot (raised|lifted)|on one leg|leg raised|lifted leg|balanc', raw, re.I): return 'oneleg'
    if c == 'standing' and re.search(r'looking back|over (her|the|its) shoulder|turned back|looks back', raw, re.I): return 'lookback'
    if c == 'standing' and ('arms_crossed' in g or ('hand_at_torso' in g and 'hand_at_hip_or_thigh' in g)): return 'cover'
    return None
def year_of(s):
    if not s: return None
    t = s.lower()
    bce = 'bce' in t or ' bc' in t or 'b.c' in t
    m = re.search(r'(\d{3,4})', t)
    if m and 'century' not in t[:m.start()+12]:
        y = int(m.group(1)); return -y if bce and re.search(r'\d{3,4}[^a-z]*bce', t) else y
    m = re.search(r'(\d{1,2})(st|nd|rd|th)[–-]?(\d{1,2})?(st|nd|rd|th)? century', t)
    if m:
        c = int(m.group(1)); y = c*100 - 50
        return -y if bce else y
    for k, v in [('new kingdom', -1250), ('late hellenistic', -100), ('hellenistic', -200), ('roman imperial', 100), ('roman period', 50), ('augustan', 0), ('trajanic', 110), ('late roman', 350), ('classical', -420)]:
        if k in t: return v
    return None
def rot_of(cam):
    d = np.array(cam['direction'], float); u = np.array(cam['up'], float)
    f = d / np.linalg.norm(d); u = u - f * (u @ f); u /= np.linalg.norm(u)
    r = np.cross(u, f)
    return [[round(x, 6) for x in r], [round(x, 6) for x in u], [round(x, 6) for x in f]]
# skeletons
person = {}
for s in ps['subjects']:
    if s.get('accepted_for_visualization') is False: continue
    J = s['joints']; segs = []
    for b in s['bones']:
        a, c = J.get(b['parent']), J.get(b['child'])
        if a and c and a.get('position_web') and c.get('position_web'):
            segs += [round(v, 4) for v in a['position_web'] + c['position_web']]
    pts = [round(v, 4) for k, j in J.items() if j and j.get('position_web') for v in j['position_web']]
    if segs: person.setdefault(s['sculpture_id'], []).append({'label': s.get('label', ''), 'segs': segs, 'pts': pts})
uni = {}
for sid, m in ur['models'].items():
    if not m.get('accepted_for_visualization'): continue
    J = m['joints']; P = m['parents']; hide = set(m.get('flagged_indices') or [])
    segs = []
    for i, p in enumerate(P):
        if p is None or p < 0 or i in hide or p in hide: continue
        segs += [round(v, 4) for v in J[p] + J[i]]
    pts = [round(v, 4) for i, j in enumerate(J) if i not in hide for v in j]
    if segs: uni[sid] = {'segs': segs, 'pts': pts, 'note': (m.get('quality_note') or '')[:180]}
manual = {}
recs = mv['records'] if isinstance(mv['records'], list) else list(mv['records'].values())
for r in recs:
    J = {j['id']: j['position'] for j in r['joints'] if j.get('position')}
    if len(J) < 6: continue
    segs = []
    for b in r['bones']:
        if J.get(b['start']) and J.get(b['end']): segs += [round(v, 4) for v in J[b['start']] + J[b['end']]]
    manual[r['sculpture_id']] = {'segs': segs, 'pts': [round(v, 4) for p in J.values() for v in p]}
out = []
for r in ds:
    sid = r['id']; c = cls_of(r); k = kind(r)
    OV = {'11': ('relief', None), '87': ('relief', None), '93': ('relief', None), '100': ('relief', None),
          '55': ('figure', 'reclining'), '32': ('figure', 'reclining'), '99': ('figure', 'reclining'),
          '17': ('figure', 'standing'), '26': ('figure', 'standing')}
    if sid in OV: k, c = OV[sid]
    if k != 'figure': c_fig = None
    else: c_fig = c
    sk = None
    if sid in manual: sk = {'src': 'manual', 'figs': [manual[sid]]}
    elif sid in person: sk = {'src': 'person', 'figs': person[sid]}
    elif sid in uni: sk = {'src': 'unirig', 'figs': [{'segs': uni[sid]['segs'], 'pts': uni[sid]['pts']}], 'note': uni[sid]['note']}
    note = (ur['outcomes'].get(sid, {}) or {}).get('reason', '')
    cam = gm[sid]['camera']
    out.append({
        'id': sid, 't': r['title'], 'a': r['artist'], 'd': r['date_period'], 'm': r['museum'], 'y': year_of(r.get('original_date') or r['date_period']),
        'pose': r['pose'], 'cls': c_fig, 'kind': k, 'g': gesture_of(r, c_fig) if c_fig else None,
        'gest': r['gesture'], 'cloth': r['clothing'], 'attr': r['attributes'],
        'desc': (r['description'] or '')[:260], 'poseRaw': (r.get('pose_raw') or '')[:200], 'conf': r['confidence'], 'src': r['source_url'],
        'rot': rot_of(cam), 'bytes': gm[sid]['bytes'], 'sk': sk, 'skNote': note[:220],
        **({'license': r.get('license_label', '') + ' (' + r.get('license_url', '') + ')',
            'credit': r.get('attribution', ''), 'skNote': '新增扫描；骨骼为局部候选，解剖对应尚未确认。' if sk else '暂无经过确认的骨骼数据。'} if r.get('acquisition') else {}),
    })
json.dump({'source': 'Goddess Sculpture Atlas (goddess-sculpture-atlas.silkykoala4.chatgpt.site)', 'count': len(out), 'records': out}, open(os.path.join(OUT, 'atlas.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(Counter((x['kind'], x['cls']) for x in out))
print('skeletons', Counter(x['sk']['src'] if x['sk'] else None for x in out))
print('gestures', Counter(x['g'] for x in out))
print('years', [(x['id'], x['d'][:20], x['y']) for x in out if x['d']][:40])
print(os.path.getsize(os.path.join(OUT, 'atlas.json')))
# copy assets: meshes as base64 script wrappers (src/05-seq.js fetchMesh reads them), thumbnails as-is
for sub in ('m', 't'):
    os.makedirs(os.path.join(PUBLIC, sub), exist_ok=True)
for r in out:
    i = r['id']
    with open(SRC + f'gallery/meshes/{i}.bin', 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    with open(os.path.join(PUBLIC, 'm', f'{i}.js'), 'w', encoding='utf-8') as f:
        f.write(f'window.__atlasMeshLoaded&&window.__atlasMeshLoaded("{i}","{b64}");')
    shutil.copy(SRC + f'gallery/thumbs/{i}.webp', os.path.join(PUBLIC, 't', f'{i}.webp'))
print('wrote', len(out), 'records to', PUBLIC)
# Keep detail resources local: the hall continues to work if the source Site changes.
# These GGP2 files include the source's crease-preserving vertex normals.
detail_dir = os.path.join(PUBLIC, 'md')
os.makedirs(detail_dir, exist_ok=True)
models = {}
for r in out:
    sid = r['id']; detail = gm[sid].get('detail', {})
    if detail.get('status') != 'available': continue
    path = os.path.join(SRC, detail['url'])
    if not os.path.exists(path): raise FileNotFoundError(path)
    name = sid + '.bin.gz'
    shutil.copy(path, os.path.join(detail_dir, name))
    models[sid] = {k: detail[k] for k in ('triangles', 'vertices', 'sha256', 'source_sha256', 'compressed_sha256') if k in detail}
    models[sid]['url'] = 'md/' + name
json.dump({'source': 'https://goddess-sculpture-atlas.silkykoala4.chatgpt.site/', 'models': models},
          open(os.path.join(OUT, 'atlas-models.json'), 'w', encoding='utf-8'), separators=(',', ':'))
print('wrote', len(models), 'detail meshes')
