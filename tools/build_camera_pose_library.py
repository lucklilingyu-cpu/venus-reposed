"""Build a compact camera reference library from validated local pose CSVs.

This extracts quality-filtered reference poses; it does not retrain detector weights.
Video labels are conservative geometry estimates, not human annotations.
"""
import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

NAMES = ['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
         'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee',
         'right_knee', 'left_ankle', 'right_ankle']


def angle(a, b, c):
    u = (a[0]-b[0], a[1]-b[1]); v = (c[0]-b[0], c[1]-b[1])
    norm = math.hypot(*u)*math.hypot(*v)
    return math.degrees(math.acos(max(-1, min(1, (u[0]*v[0]+u[1]*v[1])/norm)))) if norm > 1e-8 else 0


def reference(points, width, height):
    if any(points[i] is None or points[i][2] < .65 for i in [1, 2, 7, 8]):
        return None
    if sum(p is not None and p[2] >= .65 for p in points[1:]) < 10:
        return None
    sh = [(points[1][i]+points[2][i])/2 for i in [0, 1]]
    hp = [(points[7][i]+points[8][i])/2 for i in [0, 1]]
    scale = math.dist(sh, hp)
    if not height*.055 < scale < height*.6:
        return None
    for a, b in [(1, 3), (3, 5), (2, 4), (4, 6), (7, 9), (9, 11), (8, 10), (10, 12)]:
        if points[a] and points[b] and min(points[a][2], points[b][2]) >= .65:
            if not .08 < math.dist(points[a][:2], points[b][:2])/scale < 2.8:
                return None
    if not all(points[i] and points[i][2] >= .65 for i in [9, 10, 11, 12]):
        return None
    torso = math.degrees(math.acos(max(-1, min(1, (hp[1]-sh[1])/scale))))
    knees = [angle(points[a], points[b], points[c]) for a, b, c in [(7, 9, 11), (8, 10, 12)]]
    lowest = max(points[11][1], points[12][1])
    ratio = (lowest-hp[1])/max(1, lowest-sh[1])
    if torso > 77:
        cls = 'horizontal'
    elif 36 < torso < 65 and min(knees) > 110:
        cls = 'reclining'
    elif torso < 28 and min(knees) > 151:
        cls = 'standing'
    elif torso < 36 and 75 < min(knees) and max(knees) < 132 and ratio > .3:
        cls = 'seated'
    elif torso < 54 and min(knees) < 70 and ratio < .47:
        cls = 'crouching'
    elif torso < 30 and max(knees) > 160 and abs(points[11][1]-points[12][1])/scale > .55:
        cls = 'standing'
    else:
        return None
    features = []
    confidence = []
    for p in points:
        visible = p is not None and p[2] >= .65 and 0 <= p[0] < width and 0 <= p[1] < height
        features += [round((p[0]-hp[0])/scale, 4), round((hp[1]-p[1])/scale, 4)] if visible else [0, 0]
        confidence.append(round(p[2], 3) if visible else 0)
    gesture = None
    if cls in {'standing', 'crouching'} and all(confidence[i] for i in [0, 5, 6]):
        if features[11] > features[1]-.18 and features[13] > features[1]-.18:
            gesture = 'hair'
    if not gesture and cls == 'standing' and max(knees) > 160 and abs(points[11][1]-points[12][1])/scale > .55:
        gesture = 'oneleg'
    if not gesture and cls == 'standing' and all(confidence[i] for i in [5, 6]):
        wrist = [features[10:12], features[12:14]]
        near_chest = [math.dist(p, [0, .65]) < .5 for p in wrist]
        near_hip = [math.dist(p, [0, .05]) < .5 for p in wrist]
        if (near_chest[0] and (near_chest[1] or near_hip[1])) or (near_chest[1] and near_hip[0]):
            gesture = 'cover'
    return dict(cls=cls, g=gesture, f=features, v=confidence)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--analysis-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'data/camera-pose-library.json')
    args = parser.parse_args()
    inputs = {}
    for path in sorted(args.analysis_root.rglob('analysis_summary.json')):
        validation = path.parent/'validation.json'
        if not validation.is_file() or not (path.parent/'keypoints.csv').is_file():
            continue
        summary = json.loads(path.read_text(encoding='utf-8-sig'))
        check = json.loads(validation.read_text(encoding='utf-8-sig'))
        if not check.get('ok') or summary.get('start_seconds') != 0:
            continue
        key = summary['video'].casefold()
        if key not in inputs or path.stat().st_mtime > inputs[key][0].stat().st_mtime:
            inputs[key] = (path, summary)
    selected = {}; sources = []; accepted = Counter(); examined = 0
    for source_index, (path, summary) in enumerate(inputs.values()):
        filename = Path(summary['video']).name
        sources.append(dict(id=source_index, title=filename, detector=summary.get('model', ''),
                            frames=summary['frames_processed'], fps=summary['fps'], accepted=0))
        step = max(1, round(summary['fps']*.75))
        current = None; points = [None]*len(NAMES); sample_frame = 0

        def store_pose():
            nonlocal examined
            if current is None:
                return
            examined += 1
            item = reference(points, summary['width'], summary['height'])
            if item is None:
                return
            sources[-1]['accepted'] += 1; accepted[item['cls']] += 1
            item.update(source=source_index, frame=sample_frame)
            # Quantized shape cells remove near-duplicate neighbouring video frames.
            key = (item['cls'], item['g'], tuple(round(x*5) for x in item['f'][2:]))
            previous = selected.get(key)
            if previous is None or sum(item['v']) > sum(previous['v']):
                selected[key] = item

        with (path.parent/'keypoints.csv').open(encoding='utf-8-sig', buffering=1024*1024) as handle:
            header = handle.readline().strip().split(','); indices = {name: i for i, name in enumerate(header)}
            name_index = indices['landmark_name']; frame_index = indices['frame']; pose_index = indices['pose_index']
            for line in handle:
                # Exports contain numeric fields and fixed ASCII landmark names, never quoted commas.
                frame_text = line.partition(',')[0]
                if int(frame_text) % step:
                    continue
                row = line.rstrip('\r\n').split(',')
                pair = (row[frame_index], row[pose_index])
                if pair != current:
                    store_pose(); current = pair; sample_frame = int(frame_text); points = [None]*len(NAMES)
                name = row[name_index]
                if name not in NAMES:
                    continue
                conf = row[indices['confidence']] if 'confidence' in indices else ''
                if not conf:
                    conf = row[indices['visibility']] if 'visibility' in indices else '0'
                score = float(conf or 0)
                if 'presence' in indices and row[indices['presence']]:
                    score = min(score, float(row[indices['presence']]))
                x, y = float(row[indices['x_pixels']]), float(row[indices['y_pixels']])
                if not (0 <= x < summary['width'] and 0 <= y < summary['height']) or (x == 0 and y == 0):
                    score = 0
                points[NAMES.index(name)] = [x, y, score]
            store_pose()
        print(f'{source_index+1}/{len(inputs)}: accepted {sources[-1]["accepted"]} candidate poses', flush=True)
    # Balance classes and video sources, and keep the in-browser nearest-neighbour search bounded.
    templates = []
    for cls in ['standing', 'walking', 'seated', 'crouching', 'reclining', 'horizontal']:
        candidates = sorted((p for p in selected.values() if p['cls'] == cls),
                            key=lambda p: (hashlib.sha256(str((p['source'],p['frame'],p['f'])).encode()).hexdigest()))
        counts = Counter()
        for candidate in candidates:
            if counts[candidate['source']] >= 32:
                continue
            templates.append(candidate); counts[candidate['source']] += 1
            if sum(counts.values()) >= 400:
                break
    record = dict(format='camera-pose-library-v1', joints=NAMES, coordinate_system='image-plane, hip-centred, torso-normalized, y-up',
                  labels='conservative automatic geometry candidates; not human-labelled training ground truth',
                  detector_retrained=False, sources=sources, sampled_pose_instances=examined,
                  accepted_before_dedup=dict(accepted), template_counts=dict(Counter(p['cls'] for p in templates)), templates=templates)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    print(json.dumps(dict(videos=len(sources), templates=len(templates), classes=record['template_counts'], bytes=args.output.stat().st_size)), flush=True)


if __name__ == '__main__':
    main()
