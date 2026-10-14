import { CameraReferenceMatcher, CameraPoseHold } from './pose-reference.mjs?v=20261015-3';
import { YOLO_JOINTS, detectorHasTorso, createYoloDetector } from './yolo-pose.mjs?v=20261015-3';
const INDICES = { nose: 0, lsh: 11, rsh: 12, lel: 13, rel: 14, lwr: 15, rwr: 16, lhip: 23, rhip: 24, lkn: 25, rkn: 26, lank: 27, rank: 28 };

export function cameraJoints(result) {
  if (!result?.landmarks) return null;
  if (result.coordinateSystem === 'image-plane') {
    const L = result.landmarks;
    const hip = [(L[11].x+L[12].x)/2, (L[11].y+L[12].y)/2];
    const sh = [(L[5].x+L[6].x)/2, (L[5].y+L[6].y)/2];
    const width=result.width||1,height=result.height||1;
    const scale=Math.hypot((hip[0]-sh[0])*width,(hip[1]-sh[1])*height)||1;
    const K={},P2={};
    for(const [name,i] of Object.entries(YOLO_JOINTS)) {
      const l=L[i];if(!l||![l.x,l.y,l.visibility].every(Number.isFinite))return null;
      // Unit-scaled image geometry, explicitly not estimated 3D/world coordinates.
      K[name]={x:(l.x-hip[0])*width/scale*.45,y:(hip[1]-l.y)*height/scale*.45,z:0,v:l.visibility};
      P2[name]=l.visibility>=.5?[l.x,l.y]:null;
    }
    return {K,P2,coordinateSystem:'image-plane',detector:result.detector};
  }
  const L = result.landmarks, W = result.world || L;
  const K = {}, P2 = {};
  for (const [name, i] of Object.entries(INDICES)) {
    const l = L[i], w = W[i];
    if (!l || !w || ![w.x, w.y, w.z, l.x, l.y].every(Number.isFinite)) return null;
    const visibility = l.x>=0&&l.x<=1&&l.y>=0&&l.y<=1?Math.min(l.visibility ?? 0, l.presence ?? 1):0;
    K[name] = { x: w.x, y: -w.y, z: -w.z, v: visibility };
    P2[name] = visibility >= .5 ? [l.x, l.y] : null;
  }
  return { K, P2, coordinateSystem: 'world', detector: result.detector || 'mediapipe-full' };
}

async function mainThreadDetector(modelUrl,yoloModelUrl,notify) {
  const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const options = { baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: .45, minPosePresenceConfidence: .45, minTrackingConfidence: .45 };
  let lm, yolo, yoloLoading, closed=false, preferYoloUntil=0;
  try {
    const mod = await import(`${base}/vision_bundle.mjs`);
    const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
    try { lm = await mod.PoseLandmarker.createFromOptions(fileset, options); }
    catch (_) { options.baseOptions.delegate = 'GPU'; lm = await mod.PoseLandmarker.createFromOptions(fileset, options); }
  } catch (_) {}
  const ensureYolo=()=>yoloLoading ||= createYoloDetector(yoloModelUrl,notify).then(value=>{
    if(closed){value.close();throw new Error('camera closed');}return yolo=value;
  }).catch(error=>{yoloLoading=null;throw error;});
  if(!lm)await ensureYolo();
  let timestamp = 0;
  return { strategy: 'main-thread-fallback', async detect(source, now) {
    if(closed)throw new Error('camera closed');
    if(yolo&&now<preferYoloUntil)return cameraJoints(await yolo.detect(source));
    timestamp = Math.max(timestamp+1, now);
    let result;try{result=lm?.detectForVideo(source, timestamp);}catch(_){}
    let pose={landmarks:result?.landmarks?.[0],world:result?.worldLandmarks?.[0]};
    if(!detectorHasTorso(pose)) {
      try {const alternative=await(await ensureYolo()).detect(source);if(alternative&&(detectorHasTorso(alternative)||!pose.landmarks)){pose=alternative;preferYoloUntil=now+5000;}}
      catch(error){if(!pose.landmarks)throw error;}
    }
    return cameraJoints(pose);
  }, close() { closed=true;lm?.close(); yolo?.close(); } };
}

async function workerDetector(modelUrl,yoloModelUrl,notify) {
  // Classic workers allow this MediaPipe version's WASM loader to use importScripts.
  // Dynamic import of the vision module remains supported inside the classic worker.
  const worker = new Worker(new URL('./camera-worker.mjs?v=20261015-3', import.meta.url));
  const pending = new Map(); let serial = 0, closed = false;
  function fail(error) {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  }
  worker.onmessage = event => {
    if(event.data.type==='status'){notify(event.data.status);return;}
    const message = event.data, item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    if (message.error) item.reject(new Error(message.error)); else item.resolve(message);
  };
  worker.onerror = () => fail(new Error('摄像头后台识别器加载失败'));
  function request(data, transfer = [], timeout = 25000) {
    if (closed) return Promise.reject(new Error('camera closed'));
    return new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('摄像头识别器响应超时')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ ...data, id }, transfer); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  try { await request({ type: 'init', modelUrl, yoloModelUrl }, [], 45000); }
  catch (error) { closed = true; worker.terminate(); fail(error); throw error; }
  return { strategy: 'worker', async detect(source, now) {
    const bitmap = await createImageBitmap(source);
    try { return cameraJoints(await request({ type: 'detect', bitmap, now }, [bitmap], 60000)); }
    catch (error) { bitmap.close(); throw error; }
  }, close() { closed = true; worker.terminate(); fail(new Error('camera closed')); } };
}

export async function createCameraEngine(baseUrl,notify=()=>{}) {
  const modelUrl = new URL('assets/camera/pose_landmarker_full.task', baseUrl).href;
  const yoloModelUrl = new URL('assets/camera/yolo26s-pose-camera.onnx', baseUrl).href;
  const libraryUrl = new URL('data/camera-pose-library.json', baseUrl).href;
  const libraryPromise = fetch(libraryUrl, { cache: 'no-cache' })
    .then(response => response.ok ? response.json() : null).catch(() => null);
  let detector;
  if (typeof Worker === 'function' && typeof createImageBitmap === 'function') {
    try { detector = await workerDetector(modelUrl,yoloModelUrl,notify); }
    catch (_) { detector = await mainThreadDetector(modelUrl,yoloModelUrl,notify); }
  } else detector = await mainThreadDetector(modelUrl,yoloModelUrl,notify);
  const library = await libraryPromise;
  return { detect: detector.detect, close: detector.close, strategy: detector.strategy,
    matcher: new CameraReferenceMatcher(library), hold: new CameraPoseHold(), libraryLoaded: !!library?.templates?.length };
}
