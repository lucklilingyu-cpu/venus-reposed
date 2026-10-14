"""Read validated YOLO CSV exports without modifying source videos or CSVs.

The private input JSON maps catalogue IDs to analysis folders. Only normalized
body joints and source hashes are written; local paths never enter site data.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

JOINTS = ['nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
          'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee',
          'right_knee', 'left_ankle', 'right_ankle']
INDEX = {name: i for i, name in enumerate(JOINTS)}
CORE = [1, 2, 7, 8, 9, 10, 11, 12]


def candidate(points, width, height):
    visible = [p is not None and p[2] >= .6 for p in points]
    if not all(visible[i] for i in CORE) or sum(visible[1:]) < 10:
        return None
    shoulder = [(points[1][i]+points[2][i])/2 for i in [0, 1]]
    hip = [(points[7][i]+points[8][i])/2 for i in [0, 1]]
    torso = math.dist(shoulder, hip)
    if not height*.045 < torso < height*.6:
        return None
    for a, b in [(1, 3), (3, 5), (2, 4), (4, 6), (7, 9), (9, 11), (8, 10), (10, 12)]:
        if visible[a] and visible[b] and not .06 < math.dist(points[a][:2], points[b][:2])/torso < 3:
            return None
    scale = .5/torso
    pose = [[round((p[0]-hip[0])*scale, 5), round((hip[1]-p[1])*scale, 5), round(p[2], 4)]
            if visible[i] else [0, 0, 0] for i, p in enumerate(points)]
    confidence = sum(points[i][2] for i in CORE)/len(CORE)
    score = confidence*2 + min(torso/height, .4)*2 + (1-abs(hip[0]/width-.5))*.8
    return {'pose': pose, 'center': [hip[0]/width, hip[1]/height],
            'scale': torso/height, 'score': score}


def extract(item):
    folder = Path(item['folder'])
    summary = json.loads((folder/'analysis_summary.json').read_text(encoding='utf-8-sig'))
    check = json.loads((folder/'validation.json').read_text(encoding='utf-8-sig'))
    assert check.get('ok') and summary['start_seconds'] == 0
    assert summary['model_backend'] == 'onnx'
    path = folder/'keypoints.csv'
    before = path.stat()
    step = max(1, round(summary['fps']/8))
    samples = []
    pair = None
    points = [None]*13
    frame_candidates = []
    current_frame = None
    previous = None

    def store_pose():
        if pair is not None:
            value = candidate(points, summary['width'], summary['height'])
            if value:
                frame_candidates.append(value)

    def store_frame():
        nonlocal previous
        if current_frame is None or not frame_candidates:
            return
        t = current_frame/summary['fps']
        def score(c):
            continuity = 0
            if previous and t-previous['time'] < .35:
                distance = math.dist(c['center'], previous['center'])/max(.01, previous['scale'])
                continuity = max(0, 1-distance)*.4
            return c['score']+continuity
        best = max(frame_candidates, key=score)
        continuous = bool(previous and t-previous['time'] < .35 and
                          math.dist(best['center'], previous['center'])/max(.01, previous['scale']) < .7 and
                          .6 < best['scale']/previous['scale'] < 1.7)
        samples.append({'frame': current_frame, 'time': round(t, 5), 'pose': best['pose'], 'continuous': continuous})
        previous = {**best, 'time': t}

    with path.open(encoding='utf-8-sig', buffering=1024*1024) as stream:
        columns = {name: i for i, name in enumerate(stream.readline().strip().split(','))}
        for line in stream:
            frame = int(line.partition(',')[0])
            if frame % step:
                continue
            row = line.rstrip('\r\n').split(',')
            new_pair = (frame, row[columns['pose_index']])
            if new_pair != pair:
                store_pose()
                if frame != current_frame:
                    store_frame()
                    frame_candidates = []
                    current_frame = frame
                points = [None]*13
                pair = new_pair
            index = INDEX.get(row[columns['landmark_name']])
            if index is None:
                continue
            confidence = float(row[columns['confidence']] or 0)
            x, y = float(row[columns['x_pixels']]), float(row[columns['y_pixels']])
            if not (0 <= x < summary['width'] and 0 <= y < summary['height']) or x == y == 0:
                confidence = 0
            points[index] = [x, y, confidence]
        store_pose()
        store_frame()
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            digest.update(block)
    after = path.stat()
    assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns)
    assert samples, 'No reliable full-body samples for '+item['id']
    print(item['id']+': '+str(len(samples))+' reliable sampled frames', flush=True)
    return {'id': item['id'], 'duration': summary['duration_seconds'],
            'source': {'keypointsSha256': digest.hexdigest(), 'model': summary['model'],
                       'frameCount': summary['frames_processed'], 'fps': summary['fps']},
            'samples': samples}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    data = {'videos': [extract(item) for item in json.loads(args.inputs.read_text(encoding='utf8'))]}
    args.output.write_text(json.dumps(data, separators=(',', ':'))+'\n', encoding='utf8')
