// Runs landmark inference off the render thread. Frames never leave this worker/browser.
let landmarker = null, fileset = null, PoseLandmarker = null, modelUrl = '', yoloModelUrl = '', timestamp = 0;
let yolo = null, yoloLoading = null, yoloModule = null, queue = Promise.resolve();
async function ensureYolo() {
  if (!yoloLoading) yoloLoading = (async () => {
    yoloModule ||= await import('./yolo-pose.mjs');
    yolo = await yoloModule.createYoloDetector(yoloModelUrl, status => self.postMessage({ type: 'status', status }));
    return yolo;
  })().catch(error => { yoloLoading = null; throw error; });
  return yoloLoading;
}
async function initialize(delegate = 'GPU') {
  if (!PoseLandmarker) {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const mod = await import(`${base}/vision_bundle.mjs`);
    PoseLandmarker = mod.PoseLandmarker;
    fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
  }
  landmarker?.close(); landmarker = null;
  const options = { baseOptions: { modelAssetPath: modelUrl, delegate }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: .45, minPosePresenceConfidence: .45, minTrackingConfidence: .45 };
  try { landmarker = await PoseLandmarker.createFromOptions(fileset, options); }
  catch (error) {
    if (delegate !== 'GPU') throw error;
    options.baseOptions.delegate = 'CPU';
    landmarker = await PoseLandmarker.createFromOptions(fileset, options);
  }
}
self.onmessage = event => { queue = queue.then(() => handleMessage(event)).catch(() => {}); };
async function handleMessage(event) {
  const { id, type, bitmap, now } = event.data;
  try {
    if (type === 'init') {
      modelUrl = event.data.modelUrl; yoloModelUrl = event.data.yoloModelUrl;
      yoloModule = await import('./yolo-pose.mjs');
      try { await initialize(); } catch (_) { await ensureYolo(); }
      self.postMessage({ id, ready: true });
    }
    else if (type === 'detect') {
      timestamp = Math.max(timestamp+1, now);
      let result;
      try { result = landmarker?.detectForVideo(bitmap, timestamp) || null; }
      catch (error) {
        if (event.data.retry === false) throw error;
        try { await initialize('CPU'); result = landmarker.detectForVideo(bitmap, timestamp+1); }
        catch (_) { result = null; }
        timestamp++;
      }
      let pose = { landmarks: result?.landmarks?.[0] || null, world: result?.worldLandmarks?.[0] || null, detector: 'mediapipe-full' };
      if (!yoloModule.detectorHasBody(pose)) {
        try {
          const alternative = await (await ensureYolo()).detect(bitmap);
          if (alternative && (yoloModule.detectorHasBody(alternative) || !pose.landmarks)) pose = alternative;
        } catch (_) {
          if (!pose.landmarks) throw new Error('增强姿势识别暂未载入，请检查网络后重试。');
        }
      }
      self.postMessage({ id, ...pose });
    }
  } catch (error) { self.postMessage({ id, error: String(error?.message || 'camera inference failed') }); }
  finally { bitmap?.close(); }
}
