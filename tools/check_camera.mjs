// Camera regressions: confidence, mirroring, body shape changes, hold continuity and unchanged UI/animations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import { CameraReferenceMatcher, CameraPoseHold, featuresFrom, poseDistance, JOINTS, CLASSES } from '../assets/camera/pose-reference.mjs';
import {decodeYolo,detectorHasBody,YOLO_JOINTS} from '../assets/camera/yolo-pose.mjs';
import {cameraJoints} from '../assets/camera/camera-engine.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gitExecutable = process.env.VENUS_GIT_EXE || 'git';
const normalize = text => text.replace(/\r\n/g, '\n');
const source = normalize(readFileSync(join(root, 'js/07-inputs.js'), 'utf8'));
const baseRef = process.argv[2] || 'origin/main';
const baseline = normalize(execFileSync(gitExecutable, ['show', baseRef+':js/07-inputs.js'], {cwd:root, encoding:'utf8'}));
const before = '/* ---------- camera mode ---------- */', after = '/* ---------- video / photos ---------- */';
assert.equal(source.slice(0, source.indexOf(before)), baseline.slice(0, baseline.indexOf(before)), 'shared detector, text and existing classifier must stay unchanged');
assert.equal(source.slice(source.indexOf(after)), baseline.slice(baseline.indexOf(after)), 'video, photo and gallery code must stay unchanged');
assert.equal(source.slice(source.indexOf('function addCamPose('), source.indexOf(after)),
  baseline.slice(baseline.indexOf('function addCamPose('), baseline.indexOf(after)), 'existing sculpture switch call must stay unchanged');
for (const file of ['index.html', 'style.css', 'js/05-seq.js', 'js/05b-ribbons.js', 'js/10-main.js']) {
  assert(normalize(readFileSync(join(root,file),'utf8')) === normalize(execFileSync(gitExecutable,['show',baseRef+':'+file],{cwd:root,encoding:'utf8'})), file+' changed outside camera scope');
}
const html=readFileSync(join(root,'index.html'),'utf8');
const parts=[...html.match(/const PARTS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+\.js)'/g)].map(x=>x[1]);
const temporary=join(root, '.check-camera-joined.tmp.mjs');
writeFileSync(temporary,parts.map(p=>readFileSync(join(root,'js',p),'utf8')).join('\n'));
try { execFileSync(process.execPath,['--check',temporary],{stdio:'pipe'}); } finally { unlinkSync(temporary); }
const classes = source.slice(source.indexOf('const sig ='),source.indexOf('/* canonical skeleton'));
const context=vm.createContext({Math, CLS:CLASSES, GESTURES:{hair:{cls:['standing','crouching']},oneleg:{cls:['standing']},cover:{cls:['standing']},lookback:{cls:['standing']}}});
vm.runInContext(classes+'\nglobalThis.classifier=classifyPose;',context);
const library=JSON.parse(readFileSync(join(root,'data/camera-pose-library.json'),'utf8'));
assert.equal(library.detector_retrained,false);
assert(library.templates.length>0 && library.templates.length<=2400);
assert(library.sources.every(s=>!/[A-Za-z]:\\/.test(s.title)), 'no local user paths in public dataset');
for(const [file,hash] of [
  ['pose_landmarker_full.task','4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad'],
  ['yolo26s-pose-camera.onnx','b3936aca5ba58edea5a504903f1b28280367e8fea25bf9fedf34874de5be26a7']
]) assert.equal(createHash('sha256').update(readFileSync(join(root,'assets/camera',file))).digest('hex'),hash,'model bytes must remain unchanged, including across Git checkout');

function fixture(kind='standing') {
  const p=(x,y,z=0)=>({x,y,z,v:1});
  const K={nose:p(0,1.6,.05),lsh:p(.18,1.4),rsh:p(-.18,1.4),lel:p(.25,1.1),rel:p(-.25,1.1),lwr:p(.25,.8),rwr:p(-.25,.8),lhip:p(.12,.95),rhip:p(-.12,.95),lkn:p(.12,.5),rkn:p(-.12,.5),lank:p(.12,.05),rank:p(-.12,.05)};
  if(kind==='seated'||kind==='crouching') {
    const delta=kind==='seated'?.3:.67;
    for(const key of ['nose','lsh','rsh','lel','rel','lwr','rwr','lhip','rhip']) K[key].y-=delta;
    for(const side of ['l','r']) {
      K[side+'kn'].y=kind==='seated'?.65:.34;K[side+'kn'].z=kind==='seated'?.4:.35;
      K[side+'ank'].y=kind==='seated'?.2:0;K[side+'ank'].z=kind==='seated'?.4:0;
    }
  }
  if(kind==='reclining'||kind==='horizontal') {
    const angle=(kind==='reclining'?52:90)*Math.PI/180;
    for(const joint of Object.values(K)){const x=joint.x,y=joint.y;joint.x=x*Math.cos(angle)-y*Math.sin(angle);joint.y=x*Math.sin(angle)+y*Math.cos(angle);}
  }
  return K;
}
function image(K,width=640,height=480,scale=150,shiftX=0,shiftY=0){return Object.fromEntries(JOINTS.map(k=>[k,[.5+(K[k].x*scale+shiftX)/width,.65-(K[k].y*scale+shiftY)/height]]));}
let checks=0;
for(const cls of CLASSES){
  const K=fixture(cls),P2=image(K);const hist=cls==='walking'?Array.from({length:20},(_,i)=>i%2?.22:-.22):[];
  const base=context.classifier(K,hist);assert.equal(base.top,cls, 'base fixture '+cls);
  const result=new CameraReferenceMatcher(library).classify(K,P2,640,480,base,1000);
  assert(result.ready,cls+' should be ready');assert.equal(result.top,cls,'reference matching must preserve clear '+cls);checks++;
}
const K=fixture(),P2=image(K),base=context.classifier(K,[]);
const a=featuresFrom(K,P2,640,480),b=featuresFrom(K,image(K,1280,720,210,35,-20),1280,720);
assert(poseDistance(a,b)<1e-8,'camera distance and aspect ratio invariance');checks++;
const mirror={f:[],v:[]},swap=[0,2,1,4,3,6,5,8,7,10,9,12,11];
for(let i=0;i<13;i++){const j=swap[i];mirror.f.push(-a.f[2*j],a.f[2*j+1]);mirror.v.push(a.v[j]);}
assert(poseDistance(a,mirror,true)<1e-8,'left/right mirrored pose support');checks++;
const cropped=structuredClone(K);for(const key of ['lkn','rkn','lank','rank'])cropped[key].v=.1;
assert.equal(new CameraReferenceMatcher(library).classify(cropped,image(cropped),640,480,context.classifier(cropped,[]),1000).ready,false,'cropped legs must not be invented');checks++;
const invalid=image(K);invalid.lhip=[NaN,.5];assert.equal(featuresFrom(K,invalid,640,480),null);checks++;
const matcher=new CameraReferenceMatcher(library);
const standing=matcher.classify(K,P2,640,480,base,1000);
const hold=new CameraPoseHold();let accepted=0;
for(let t=0;t<=4000;t+=100)accepted+=Number(hold.update(standing,t).accept);
assert.equal(accepted,1,'steady pose confirms once after two seconds');checks++;
const changed=structuredClone(K);changed.lwr.x+=.8;changed.lel.x+=.3;
const newPose=new CameraReferenceMatcher(library).classify(changed,image(changed),640,480,context.classifier(changed,[]),5000);
assert.equal(newPose.top,standing.top);assert.notEqual(poseDistance(newPose.feature,standing.feature),0);
for(let t=5000;t<=7200;t+=100)accepted+=Number(hold.update(newPose,t).accept);
assert.equal(accepted,2,'different shapes in the same class can confirm');checks++;
const hair=structuredClone(K);hair.lwr.y=1.85;hair.rwr.y=1.85;
const hairPose=new CameraReferenceMatcher(library).classify(hair,image(hair),640,480,context.classifier(hair,[]),8000);
assert.equal(hairPose.g,'hair');checks++;
const shaky=new CameraPoseHold();for(let t=0;t<4000;t+=100){const result=t%300===0?hairPose:standing;assert.equal(shaky.update(result,t).accept,false); }checks++;
const uncertain={...standing,P:{...standing.P,standing:.4}};const rejected=new CameraPoseHold();for(let t=0;t<4000;t+=100)assert.equal(rejected.update(uncertain,t).accept,false);checks++;
hold.update(null,8000);hold.update(null,9200);for(let t=9400;t<=11500;t+=100)accepted+=Number(hold.update(newPose,t).accept);
assert.equal(accepted,3,'new presence after loss can confirm the same pose again');checks++;
const slow=new CameraPoseHold();
assert.equal(slow.update(standing,0).accept,false);
assert.equal(slow.update(standing,1100).accept,false);
assert.equal(slow.update(standing,2200).accept,true,'reliable CPU samples over two seconds must confirm');checks++;
const interrupted=new CameraPoseHold();interrupted.update(standing,0);
assert.equal(interrupted.update(standing,2400).accept,false,'unobserved long gap cannot confirm');
interrupted.update(null,2500);assert.equal(interrupted.update(standing,2600).progress,0,'missing body resets even with slow detector');checks++;
const raw=new Float32Array(32*57);
raw.set([150,80,490,460,.9,0]);
for(const [key,i] of Object.entries(YOLO_JOINTS))raw.set([P2[key][0]*640,P2[key][1]*480,.95],6+i*3);
const decoded=decodeYolo(raw,640,480,1,0,0);assert(detectorHasBody(decoded));
const unified=cameraJoints(decoded);assert.equal(unified.coordinateSystem,'image-plane');
assert(poseDistance(featuresFrom(unified.K,unified.P2,640,480),a)<1e-6,'17 point YOLO mapping preserves normalized shape');checks++;
const empty=decodeYolo(new Float32Array(32*57),640,480,1,0,0);assert.equal(empty,null);
raw[6+YOLO_JOINTS.lank*3]=-20;raw[6+YOLO_JOINTS.rank*3]=-20;
assert.equal(detectorHasBody(decodeYolo(raw,640,480,1,0,0)),false,'out-of-image joints cannot produce a body');checks++;
const start=performance.now();for(let i=0;i<80;i++)matcher.classify(K,P2,640,480,base,1000+i*80);
const average=(performance.now()-start)/80;assert(average<80,'reference matcher must not consume the camera frame budget');
// A cancelled initialization must never overwrite a newer camera session.
const elements = new Map();const pendingEngines=[];const stoppedTracks=[];
const fakeCanvas={width:100,height:100,getContext:()=>({clearRect(){}})};
function element(id){if(!elements.has(id))elements.set(id,id==='#camCanvas'?fakeCanvas:{style:{},textContent:'',innerHTML:'',play:async()=>{}});return elements.get(id);}
let streamId=0;
const lifecycle=vm.createContext({URL, document:{baseURI:'http://localhost/venus-reposed/'},navigator:{mediaDevices:{getUserMedia:async()=>{const id=++streamId;return {getTracks:()=>[{stop:()=>stoppedTracks.push(id)}]};}}},
  S:{source:'摄像头'},$ :element,applyDay(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  withTimeout:p=>p,fakeModule:Promise.resolve({createCameraEngine:()=>new Promise(resolve=>pendingEngines.push(resolve))})});
const lifecycleCode=source.slice(source.indexOf(before),source.indexOf('function startDemo('))
  .replace("import(new URL('assets/camera/camera-engine.mjs', document.baseURI).href)",'fakeModule');
vm.runInContext(lifecycleCode+'\nglobalThis.cameraAPI={Cam,startCamera,stopCamera};',lifecycle);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const first=lifecycle.cameraAPI.startCamera();await tick();assert.equal(pendingEngines.length,1);
lifecycle.cameraAPI.stopCamera();
const second=lifecycle.cameraAPI.startCamera();await tick();assert.equal(pendingEngines.length,2);
const fakeEngine=()=>({closed:false,close(){this.closed=true;},matcher:{reset(){}},hold:{reset(){}}});
const fresh=fakeEngine(),stale=fakeEngine();pendingEngines[1](fresh);await second;pendingEngines[0](stale);await first;
assert.equal(lifecycle.cameraAPI.Cam.engine,fresh,'stale model must not overwrite restarted camera');assert(stale.closed);assert(!fresh.closed);checks++;
lifecycle.cameraAPI.stopCamera();assert(fresh.closed);assert.equal(lifecycle.cameraAPI.Cam.last,null);assert.equal(element('#camAdd').disabled,true);checks++;
console.log(JSON.stringify({ok:true,checks,templates:library.templates.length,sourceVideos:library.sources.length,matcherMilliseconds:Number(average.toFixed(2)),uiAndSculptureCodeUnchanged:true,joinedModuleParses:true}));
