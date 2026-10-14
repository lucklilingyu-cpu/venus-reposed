// Camera-only matching. Video reference labels are geometry candidates, not a retrained detector.
export const JOINTS = ['nose', 'lsh', 'rsh', 'lel', 'rel', 'lwr', 'rwr', 'lhip', 'rhip', 'lkn', 'rkn', 'lank', 'rank'];
export const CLASSES = ['standing', 'walking', 'seated', 'crouching', 'reclining', 'horizontal'];
const finite = Number.isFinite;

export function featuresFrom(K, P2, width, height) {
  if (!K || !P2 || !(width > 0 && height > 0)) return null;
  const points = JOINTS.map(key => {
    const p = P2[key], v = K[key]?.v ?? 0;
    return p && finite(p[0]) && finite(p[1]) && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1 && v >= .5
      ? [p[0]*width, p[1]*height, v] : null;
  });
  if ([1, 2, 7, 8].some(i => !points[i])) return null;
  const hip = [(points[7][0]+points[8][0])/2, (points[7][1]+points[8][1])/2];
  const shoulder = [(points[1][0]+points[2][0])/2, (points[1][1]+points[2][1])/2];
  const scale = Math.hypot(hip[0]-shoulder[0], hip[1]-shoulder[1]);
  if (scale < height*.035 || scale > height*.65) return null;
  const f = [], v = [];
  for (const point of points) {
    f.push(...(point ? [(point[0]-hip[0])/scale, (hip[1]-point[1])/scale] : [0, 0]));
    v.push(point ? point[2] : 0);
  }
  return { f, v, visible: points.slice(1).filter(Boolean).length,
    legs: [9, 10, 11, 12].filter(i => points[i]).length };
}

export function poseDistance(a, b, mirrored = false) {
  if(!a||!b||!!a.partial!==!!b.partial)return Infinity;
  let sum = 0, weight = 0, visible = 0;
  const swap = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11];
  // Ignore the nose for body matching; it is not an identity or face-recognition feature.
  for (let i = 1; i < JOINTS.length; i++) {
    const j = mirrored ? swap[i] : i;
    const w = Math.min(a.v[i] || 0, b.v[j] || 0);
    if (w < .5) continue;
    const dx = a.f[i*2] - (mirrored ? -b.f[j*2] : b.f[j*2]);
    const dy = a.f[i*2+1]-b.f[j*2+1];
    sum += w*(Math.min(9, dx*dx)+Math.min(9, dy*dy)); weight += w; visible++;
  }
  return visible >= (a.partial?4:8) && weight > 0 ? Math.sqrt(sum/weight) : Infinity;
}

function upperFeature(feature) {
  if(!feature?.v[1]||!feature.v[2])return null;
  const {f,v}=feature,cx=(f[2]+f[4])/2,cy=(f[3]+f[5])/2;
  const scale=Math.hypot(f[2]-f[4],f[3]-f[5]);if(scale<.08)return null;
  return {f:f.map((x,i)=>(x-(i%2?cy:cx))/scale),v:[...v],partial:true,
    visible:v.slice(1,7).filter(x=>x>=.5).length,legs:0};
}

export function upperFeaturesFrom(K,P2,width,height) {
  if(!K||!P2||!(width>0&&height>0))return null;
  const points=JOINTS.map((key,i)=>{
    const p=P2[key],v=K[key]?.v??0;
    return i<7&&p&&p.every(finite)&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1&&v>=.5
      ?[p[0]*width,-p[1]*height,v]:null;
  });
  if(!points[1]||!points[2]||points.slice(3,7).filter(Boolean).length<2)return null;
  const span=Math.hypot(points[1][0]-points[2][0],points[1][1]-points[2][1]);
  if(span<height*.045||span>width*.8)return null;
  const cx=(points[1][0]+points[2][0])/2,cy=(points[1][1]+points[2][1])/2;
  return {f:points.flatMap(p=>p?[(p[0]-cx)/span,(p[1]-cy)/span]:[0,0]),
    v:points.map(p=>p?p[2]:0),partial:true,visible:points.slice(1).filter(Boolean).length,legs:0};
}

function gestureOf(feature, base, K) {
  const { f, v } = feature;
  if (v[0] >= .5 && v[5] >= .5 && v[6] >= .5 && f[11] > f[1]-.18 && f[13] > f[1]-.18) return 'hair';
  if(feature.partial){
    if(v[5]>=.5&&v[6]>=.5&&Math.hypot(f[10],f[11]+.6)<.85&&Math.hypot(f[12],f[13]+.6)<.85)return 'cover';
    return null;
  }
  if (feature.legs === 4 && Math.abs(f[23]-f[25]) > .55 && base.top === 'standing' && base.kMean > 125) return 'oneleg';
  if (v[5] >= .5 && v[6] >= .5) {
    const chest = [Math.hypot(f[10], f[11]-.65), Math.hypot(f[12], f[13]-.65)];
    const hip = [Math.hypot(f[10], f[11]-.05), Math.hypot(f[12], f[13]-.05)];
    if ((chest[0] < .5 && (chest[1] < .5 || hip[1] < .5)) || (chest[1] < .5 && hip[0] < .5)) return 'cover';
  }
  return base.g === 'lookback' && (K.nose?.v ?? 0) >= .65 ? 'lookback' : null;
}

export class CameraReferenceMatcher {
  constructor(library = null) {
    const valid = library?.format === 'camera-pose-library-v1' && Array.isArray(library.templates);
    this.templates = valid ? library.templates.filter(p => CLASSES.includes(p.cls) && p.f?.length === 26 && p.v?.length === 13 && p.f.every(finite) && p.v.every(finite)).slice(0, 2400) : [];
    this.upperTemplates=this.templates.map(p=>({...p,...upperFeature(p)})).filter(p=>p.partial);
    this.probabilities = null;
    this.lastTime = 0;
  }
  reset() { this.probabilities = null; this.lastTime = 0; }
  classify(K, P2, width, height, base, now,postureHint='auto') {
    const body=featuresFrom(K,P2,width,height),hint=CLASSES.includes(postureHint)?postureHint:null;
    const feature=body&&body.visible>=8&&body.legs>=2?body:upperFeaturesFrom(K,P2,width,height);
    if (!feature) {
      this.reset();
      return { ...base, ready: false, feature, reason: '请让双肩和更多手臂进入画面，保持光线清楚。坐着也可以识别。' };
    }
    if(feature.partial&&!hint){
      this.reset();
      return {...base,ready:false,feature,partial:true,reason:'已识别上半身。请选择下方的“坐姿辅助”或“站姿辅助”；自动区分站、坐时，请再让髋部和膝盖入镜，不要求脚踝入镜。'};
    }
    const nearest = [];
    for (const template of feature.partial?this.upperTemplates:this.templates) {
      const distance = Math.min(poseDistance(feature, template), poseDistance(feature, template, true));
      if (distance > .42) continue;
      const item = { distance, template };
      let position = nearest.findIndex(p => p.distance > distance);
      if (position < 0) position = nearest.length;
      if (position < 7) { nearest.splice(position, 0, item); nearest.length = Math.min(nearest.length, 7); }
    }
    const P = Object.fromEntries(CLASSES.map(c => [c, Math.max(0, base.P[c] || 0)]));
    const votes = Object.fromEntries(CLASSES.map(c => [c, 0]));
    let total = 0;
    for (const item of nearest) {
      const weight = Math.exp(-item.distance*item.distance/.035);
      votes[item.template.cls] += weight; total += weight;
    }
    if (total > 0 && base.top !== 'walking'&&!hint) {
      const top = CLASSES.reduce((a, b) => votes[a] >= votes[b] ? a : b);
      // Automatically labelled references never overrule a strong incompatible world-space pose.
      const sources = new Set(nearest.filter(x => x.template.cls === top).map(x => x.template.source));
      const compatible = top === base.top || (P[base.top] < .5 && votes[top]/total > .75 && sources.size >= 2 && nearest[0].distance < .18);
      if(feature.legs===2&&votes[top]/total>.6&&sources.size>=2){
        for(const cls of CLASSES)P[cls]=votes[cls]/total;
      }else if (compatible) for (const cls of CLASSES) P[cls] = .72*P[cls]+.28*votes[cls]/total;
    }
    if(hint)for(const cls of CLASSES)P[cls]=cls===hint ? .95 : .01;
    const sum = CLASSES.reduce((s, c) => s+P[c], 0) || 1;
    for (const cls of CLASSES) P[cls] /= sum;
    if (this.probabilities && now-this.lastTime < 1500&&!hint) {
      for (const cls of CLASSES) P[cls] = .15*this.probabilities[cls]+.85*P[cls];
    }
    this.probabilities = { ...P }; this.lastTime = now;
    const top = CLASSES.reduce((a, b) => P[a] >= P[b] ? a : b);
    let g = gestureOf(feature, { ...base, top }, K);
    if ((g === 'hair' && !['standing', 'crouching'].includes(top)) || (g && g !== 'hair' && top !== 'standing')) g = null;
    return { ...base, P, top, g, feature, ready: true, partial:!!feature.partial,hinted:!!hint,matchedSamples: nearest.length, reason: '' };
  }
}

export class CameraPoseHold {
  // Kept under its existing API name; this is now an immediate, deduplicated
  // trigger. There is no hold duration or minimum number of frames.
  constructor() { this.reset(); }
  reset() { this.candidate = null; this.lastAccepted = null; this.started = 0; this.lastFrame = null; this.missingSince = null; this.frames = 0; }
  same(a,b,tolerance=.3) {
    return !!(a&&b&&a.top===b.top&&(a.g||null)===(b.g||null)&&poseDistance(a.feature,b.feature)<tolerance);
  }
  update(result, now) {
    if (!result?.ready || !(result.P[result.top] > .5)) {
      this.candidate = null; this.started = now; this.frames = 0;
      this.missingSince ??= now;
      if (now-this.missingSince > 1000) this.lastAccepted = null;
      return { progress: 0, accept: false };
    }
    this.missingSince = null;
    if (!this.same(result, this.candidate, .24)) {
      this.candidate = result; this.started = now; this.frames = 1;
    } else this.frames++;
    this.lastFrame = now;
    const accept = !this.same(result, this.lastAccepted);
    if (accept) this.lastAccepted = result;
    return { progress: 1, accept };
  }
}
