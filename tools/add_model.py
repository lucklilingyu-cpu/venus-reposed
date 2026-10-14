"""Add a newly acquired sculpture scan to the hall's atlas.

    python tools/add_model.py <scan.stl|scan.obj> <id> [--up z] [--front -y] [--tris 16000]

Writes m/<id>.js (display mesh, simplified to about --tris triangles, centred, max extent 1)
and t/<id>.webp (a simple shaded thumbnail), then prints a record to paste into
data/atlas-extra.json under "records" — fill in the title, artist, date, museum, pose class,
licence and credit from the acquisition files. Only add scans whose licence allows public display.

--up    the scan's up axis (x, y, z, -x, -y, -z; default z for most museum scans)
--front the direction the sculpture faces in the scan (default -y when up is z, else z)
Needs numpy and Pillow (pip install numpy pillow).
"""
import json, os, struct, sys, base64
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load(path):
    if path.lower().endswith('.obj'):
        V, F = [], []
        for line in open(path, encoding='utf-8', errors='ignore'):
            if line.startswith('v '): V.append([float(t) for t in line.split()[1:4]])
            elif line.startswith('f '):
                ix = [int(t.split('/')[0]) for t in line.split()[1:]]
                ix = [i - 1 if i > 0 else len(V) + i for i in ix]
                F += [[ix[0], ix[k], ix[k + 1]] for k in range(1, len(ix) - 1)]
        return np.array(V, float), np.array(F, np.int64)
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[80:84])[0]
    if len(b) == 84 + n * 50:  # binary STL
        a = np.frombuffer(b[84:84 + n * 50], dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]))
        P = a['v'].reshape(-1, 3).astype(float)
    else:  # ASCII STL
        P = np.array([[float(t) for t in l.split()[1:4]] for l in b.decode('utf-8', 'ignore').splitlines() if l.strip().startswith('vertex')])
    U, inv = np.unique(P.round(6), axis=0, return_inverse=True)
    return U, inv.reshape(-1, 3)

def cluster(V, F, cell):
    """quadric-based vertex clustering: one vertex per grid cell, placed where the surface planes meet"""
    mn = V.min(0); key = np.floor((V - mn) / cell).astype(np.int64); B = 1_000_003
    ck, cid = np.unique(key[:, 0] * B * B + key[:, 1] * B + key[:, 2], return_inverse=True); nc = len(ck)
    p0, p1, p2 = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    nrm = np.cross(p1 - p0, p2 - p0); area = np.linalg.norm(nrm, axis=1) + 1e-20; n = nrm / area[:, None]
    pl = np.concatenate([n, -(n * p0).sum(1)[:, None]], 1)
    Q = pl[:, :, None] * pl[:, None, :] * area[:, None, None]
    QC = np.zeros((nc, 4, 4))
    for j in range(3): np.add.at(QC, cid[F[:, j]], Q)
    cnt = np.bincount(cid, minlength=nc); mean = np.stack([np.bincount(cid, weights=V[:, a], minlength=nc) for a in range(3)], 1) / np.maximum(cnt, 1)[:, None]
    tr = np.trace(QC[:, :3, :3], axis1=1, axis2=2)
    pos = np.linalg.solve(QC[:, :3, :3] + np.eye(3)[None] * 1e-6 * tr[:, None, None], (-QC[:, :3, 3] + 1e-6 * tr[:, None] * mean)[:, :, None])[:, :, 0]
    lo = mn + np.stack([ck // (B * B), (ck // B) % B, ck % B], 1) * cell
    bad = np.any((pos < lo - cell * 0.5) | (pos > lo + cell * 1.5), axis=1) | ~np.isfinite(pos).all(1); pos[bad] = mean[bad]
    G = cid[F]; keep = (G[:, 0] != G[:, 1]) & (G[:, 1] != G[:, 2]) & (G[:, 0] != G[:, 2]); G = G[keep].copy(); n0 = n[keep]
    q0, q1, q2 = pos[G[:, 0]], pos[G[:, 1]], pos[G[:, 2]]
    flip = (np.cross(q1 - q0, q2 - q0) * n0).sum(1) < 0; G[flip] = G[flip][:, [0, 2, 1]]
    _, u = np.unique(np.sort(G, 1), axis=0, return_index=True); G = G[np.sort(u)]
    used = np.unique(G); remap = -np.ones(nc, np.int64); remap[used] = np.arange(len(used))
    return pos[used], remap[G]

def simplify(V, F, target):
    if len(F) <= target: return V, F
    ext = (V.max(0) - V.min(0)).max(); lo, hi = ext / 3000, ext / 15; best = None
    for _ in range(20):
        cell = np.sqrt(lo * hi); P, G = cluster(V, F, cell)
        if best is None or abs(len(G) - target) < abs(len(best[1]) - target): best = (P, G)
        if len(G) > target: lo = cell
        else: hi = cell
        if abs(len(G) - target) < target * 0.03: break
    return best

AX = {'x': [1, 0, 0], 'y': [0, 1, 0], 'z': [0, 0, 1]}
def axis(s): return np.array(AX[s[-1]], float) * (-1 if s.startswith('-') else 1)
def rotation(up, front):
    """rows of the matrix that turns the scan so up -> +Y and front -> +Z (the hall's convention)"""
    u, f = axis(up), axis(front)
    if abs(u @ f) > 0.5: sys.exit('--up and --front must be different axes')
    return np.stack([np.cross(u, f), u, f]).astype(int).tolist()

def thumbnail(P, G, R, path, W=360, H=400):
    X = P @ np.array(R, float).T
    c, s = np.cos(0.45), np.sin(0.45)  # a three-quarter view
    X = X @ np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]]).T
    mn, mx = X.min(0), X.max(0); k = min((W - 70) / (mx[0] - mn[0]), (H - 70) / (mx[1] - mn[1]))
    xy = np.stack([(X[:, 0] - (mn[0] + mx[0]) / 2) * k + W / 2, H / 2 - (X[:, 1] - (mn[1] + mx[1]) / 2) * k], 1)
    T = X[G]; nr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); nr /= np.linalg.norm(nr, axis=1, keepdims=True) + 1e-12
    L = np.array([0.45, 0.65, 0.62]); L /= np.linalg.norm(L)
    lum = np.clip(0.15 + 0.85 * np.abs(nr @ L), 0, 1) ** 1.3
    im = Image.new('RGB', (W * 2, H * 2), 'white'); d = ImageDraw.Draw(im)
    for t in np.argsort(T[:, :, 2].mean(1)):
        v = int(118 + 128 * lum[t]); d.polygon([tuple(xy[i] * 2) for i in G[t]], fill=(v, v - 2, v - 5))
    im.resize((W, H), Image.LANCZOS).save(path, quality=82)

if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 2: sys.exit(__doc__)
    opt = {'--up': 'z', '--front': None, '--tris': '16000'}
    for k in list(opt):
        if k in args: i = args.index(k); opt[k] = args[i + 1]; del args[i:i + 2]
    src, id = args[0], args[1]
    up = opt['--up']; front = opt['--front'] or ('-y' if up.endswith('z') else 'z')
    V, F = load(src); print(f'{src}: {len(V)} vertices, {len(F)} triangles')
    P, G = simplify(V, F, int(opt['--tris'])); print(f'simplified to {len(P)} vertices, {len(G)} triangles')
    P = P - (P.min(0) + P.max(0)) / 2; P /= (P.max(0) - P.min(0)).max()
    buf = struct.pack('<III', 0x31504747, len(P), G.size) + P.astype('<f4').tobytes() + G.astype('<u4').tobytes()
    open(os.path.join(ROOT, 'm', f'{id}.js'), 'w').write(f'window.__atlasMeshLoaded&&window.__atlasMeshLoaded("{id}","{base64.b64encode(buf).decode()}");')
    R = rotation(up, front)
    thumbnail(P, G, R, os.path.join(ROOT, 't', f'{id}.webp'))
    rec = {'id': id, 't': '', 'a': '', 'd': '', 'm': '', 'y': None, 'pose': ['seated'], 'cls': 'seated', 'kind': 'figure', 'g': None,
           'gest': [], 'cloth': [], 'attr': [], 'desc': '', 'poseRaw': '', 'conf': None, 'src': '', 'rot': R, 'license': '', 'credit': '', 'skNote': ''}
    print(f'wrote m/{id}.js and t/{id}.webp; add this to "records" in data/atlas-extra.json and fill it in:')
    print(json.dumps(rec, ensure_ascii=False, indent=2))
