// Camera regressions: confidence, mirroring, body shape changes, hold continuity and unchanged UI/animations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import { CameraReferenceMatcher, CameraPoseHold, featuresFrom, poseDistance, JOINTS, CLASSES } from '../assets/camera/pose-reference.mjs';
import {decodeYolo,detectorHasBody,detectorHasTorso,YOLO_JOINTS} from '../assets/camera/yolo-pose.mjs';
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
const originalIndex=normalize(execFileSync(gitExecutable,['show',baseRef+':index.html'],{cwd:root,encoding:'utf8'}));
const expectedIndex=originalIndex
  .replace('在镜头前做一个动作，保持 2 秒加入序列','在镜头前做动作，实时识别并加入序列')
  .replace('按六类规则算出百分比，保持 2 秒加入序列。','按六类规则分析姿态，识别到可靠动作即加入序列。');
assert.equal(normalize(readFileSync(join(root,'index.html'),'utf8')),expectedIndex,'only the two camera instruction strings may change in HTML');
for (const file of ['style.css', 'js/05b-ribbons.js', 'js/10-main.js']) {
  assert(normalize(readFileSync(join(root,file),'utf8')) === normalize(execFileSync(gitExecutable,['show',baseRef+':'+file],{cwd:root,encoding:'utf8'})), file+' changed outside camera scope');
}
const originalSequence=normalize(execFileSync(gitExecutable,['show',baseRef+':js/05-seq.js'],{cwd:root,encoding:'utf8'}));
const sequenceSource=normalize(readFileSync(join(root,'js/05-seq.js'),'utf8'));
const expectedSequence=originalSequence.includes('variedIndex = null')?originalSequence:originalSequence
  .replace('focusIndex = null) {','focusIndex = null, variedIndex = null) {')
  .replace('    let work, status;','    const vary = varied || i === variedIndex;\n    let work, status;')
  .replace("    else if (!act) { work = orig.id; status = 'beyond'; }", "    else if (!act) { work = orig.id; status = 'beyond'; }\n    else if (variedIndex != null && i !== variedIndex && prev[i] && REC[prev[i].work] && fitsCls(REC[prev[i].work], act.cls) &&\n      (!act.g || REC[prev[i].work].g === act.g) && !used.has(prev[i].work)) { work = prev[i].work; status = prev[i].status; }")
  .replace('else if (!varied && orig','else if (!vary && orig')
  .replace('const reuse = !varied && pr','const reuse = !vary && pr')
  .replace('pv ? pv.work : null, varied);','pv ? pv.work : null, vary);')
  .replace('!!opts.varied, opts.focusIndex);','!!opts.varied, opts.focusIndex, opts.variedIndex);');
assert.equal(sequenceSource,expectedSequence,'only the optional camera replacement index may extend sculpture selection; animations stay unchanged');
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
const upper=structuredClone(K);for(const key of ['lhip','rhip','lkn','rkn','lank','rank'])upper[key].v=.1;
const upperPose=new CameraReferenceMatcher(library).classify(upper,image(upper),640,480,context.classifier(upper,[]),1000,'seated');
assert(upperPose.ready&&upperPose.partial&&upperPose.hinted);assert.equal(upperPose.top,'seated','upper body may use explicit seated context');checks++;
const noAnkles=structuredClone(K);noAnkles.lank.v=noAnkles.rank.v=.1;
assert(new CameraReferenceMatcher(library).classify(noAnkles,image(noAnkles),640,480,context.classifier(noAnkles,[]),1000).ready,'knees and hips should suffice without ankles');checks++;
const head=structuredClone(upper);for(const key of ['lel','rel','lwr','rwr'])head[key].v=.1;
assert.equal(new CameraReferenceMatcher(library).classify(head,image(head),640,480,context.classifier(head,[]),1000,'seated').ready,false,'face alone cannot count as a body');checks++;
const invalid=image(K);invalid.lhip=[NaN,.5];assert.equal(featuresFrom(K,invalid,640,480),null);checks++;
const matcher=new CameraReferenceMatcher(library);
const standing=matcher.classify(K,P2,640,480,base,1000);
const hold=new CameraPoseHold();let accepted=0;
assert.equal(hold.update(standing,0).accept,true,'first reliable sample confirms immediately');accepted++;checks++;
for(let t=100;t<=4000;t+=100)accepted+=Number(hold.update(standing,t).accept);
assert.equal(accepted,1,'unchanged pose must not repeat');checks++;
const changed=structuredClone(K);changed.lwr.x+=.8;changed.lel.x+=.3;
const newPose=new CameraReferenceMatcher(library).classify(changed,image(changed),640,480,context.classifier(changed,[]),5000);
assert.equal(newPose.top,standing.top);assert.notEqual(poseDistance(newPose.feature,standing.feature),0);
assert.equal(hold.update(newPose,4100).accept,true,'changed shape confirms on its first reliable sample');accepted++;
for(let t=4200;t<=7200;t+=100)accepted+=Number(hold.update(newPose,t).accept);
assert.equal(accepted,2,'different shapes in the same class confirm once');checks++;
const hair=structuredClone(K);hair.lwr.y=1.85;hair.rwr.y=1.85;
const hairPose=new CameraReferenceMatcher(library).classify(hair,image(hair),640,480,context.classifier(hair,[]),8000);
assert.equal(hairPose.g,'hair');checks++;
const shaky=new CameraPoseHold();assert(shaky.update(standing,0).accept);
const jitter=structuredClone(standing);jitter.feature.f=jitter.feature.f.map((value,i)=>value+(i%2?.015:-.015));
for(let t=100;t<4000;t+=100)assert.equal(shaky.update(t%300===0?jitter:standing,t).accept,false,'small joint jitter must not duplicate');
assert(shaky.update(hairPose,4000).accept,'new gesture confirms without waiting');checks++;
const uncertain={...standing,P:{...standing.P,standing:.4}};const rejected=new CameraPoseHold();for(let t=0;t<4000;t+=100)assert.equal(rejected.update(uncertain,t).accept,false);checks++;
hold.update(null,8000);hold.update(null,9200);for(let t=9400;t<=11500;t+=100)accepted+=Number(hold.update(newPose,t).accept);
assert.equal(accepted,3,'new presence after loss can confirm the same pose again');checks++;
const slow=new CameraPoseHold();
assert.equal(slow.update(standing,0).accept,true);
assert.equal(slow.update(standing,1100).accept,false);
assert.equal(slow.update(standing,2200).accept,false,'slow CPU detection does not add a separate hold or duplicate');checks++;
const interrupted=new CameraPoseHold();interrupted.update(standing,0);
assert.equal(interrupted.update(standing,2400).accept,false,'frame gap alone must not duplicate');
interrupted.update(null,2500);assert.equal(interrupted.update(standing,2600).progress,1,'return does not start a hold countdown');checks++;
const seatedK=fixture('seated'),seatedNow=matcher.classify(seatedK,image(seatedK),640,480,context.classifier(seatedK,[]),1100);
assert.equal(seatedNow.top,'seated','clear class change must not wait for old smoothed probabilities');checks++;
const raw=new Float32Array(32*57);
raw.set([150,80,490,460,.9,0]);
for(const [key,i] of Object.entries(YOLO_JOINTS))raw.set([P2[key][0]*640,P2[key][1]*480,.95],6+i*3);
const decoded=decodeYolo(raw,640,480,1,0,0);assert(detectorHasBody(decoded));
const unified=cameraJoints(decoded);assert.equal(unified.coordinateSystem,'image-plane');
assert(poseDistance(featuresFrom(unified.K,unified.P2,640,480),a)<1e-6,'17 point YOLO mapping preserves normalized shape');checks++;
const empty=decodeYolo(new Float32Array(32*57),640,480,1,0,0);assert.equal(empty,null);
raw[6+YOLO_JOINTS.lank*3]=-20;raw[6+YOLO_JOINTS.rank*3]=-20;
assert.equal(detectorHasBody(decodeYolo(raw,640,480,1,0,0)),false,'out-of-image joints cannot produce a body');checks++;
assert(detectorHasTorso(decodeYolo(raw,640,480,1,0,0)),'a usable torso avoids a second detector when ankles are absent');checks++;
function sequenceFixture(code){
  const records=CLASSES.flatMap((cls,i)=>[0,1,2].map(j=>({id:cls+j,cls,t:cls,y:1900+i*10+j})));
  const REC=Object.fromEntries(records.map(r=>[r.id,r]));
  const c=vm.createContext({Math,MAX_POS:3,EXISTING:['standing0','seated0','horizontal0'].map(id=>({id})),
    FIGS:records,REC,S:{override:{}},fitsCls:(r,cls)=>r.cls===cls||(r.alt||[]).includes(cls)});
  const fragment=code.slice(code.indexOf('const KIN ='),code.indexOf('let applySeq ='));
  vm.runInContext(fragment+'\nglobalThis.sequence=computeSequence;',c);return c;
}
const oldChooser=sequenceFixture(originalSequence),newChooser=sequenceFixture(sequenceSource);
const clean=value=>JSON.parse(JSON.stringify(value));
for(const cls of CLASSES){const day=[{cls,g:null}];assert.deepEqual(clean(newChooser.sequence(day)),clean(oldChooser.sequence(day)),'non-camera selection unchanged for '+cls);}checks++;
const standingDay=[{cls:'standing',g:null}],initial=newChooser.sequence(standingDay);
const replaced=newChooser.sequence(standingDay,initial,false,null,0);
assert.notEqual(replaced[0].work,initial[0].work,'camera must visibly replace a sculpture even for the same class');
assert.equal(replaced[1].work,initial[1].work);checks++;
const extended=newChooser.sequence([...standingDay,{cls:'seated',g:null}],replaced,false,null,1);
assert.equal(extended[0].work,replaced[0].work,'adding the next camera pose must preserve earlier camera sculptures');checks++;
const start=performance.now();for(let i=0;i<80;i++)matcher.classify(K,P2,640,480,base,1000+i*80);
const average=(performance.now()-start)/80;assert(average<80,'reference matcher must not consume the camera frame budget');
// A cancelled initialization must never overwrite a newer camera session.
const elements = new Map();const pendingEngines=[];const stoppedTracks=[];
const fakeCanvas={width:100,height:100,getContext:()=>({clearRect(){}})};
function element(id){if(!elements.has(id))elements.set(id,id==='#camCanvas'?fakeCanvas:{style:{},textContent:'',innerHTML:'',play:async()=>{}});return elements.get(id);}
let streamId=0;
const lifecycle=vm.createContext({URL, document:{baseURI:'http://localhost/venus-reposed/'},navigator:{mediaDevices:{getUserMedia:async()=>{const id=++streamId;return {getTracks:()=>[{stop:()=>stoppedTracks.push(id)}]};}}},
  S:{source:'摄像头'},$ :element,applyDay(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  withTimeout:p=>p,setTimeout:()=>1,clearTimeout(){},fakeModule:Promise.resolve({createCameraEngine:()=>new Promise(resolve=>pendingEngines.push(resolve))})});
const lifecycleCode=source.slice(source.indexOf(before),source.indexOf('function startDemo('))
  .replace(/import\(new URL\('assets\/camera\/camera-engine\.mjs[^']*', document.baseURI\).href\)/,'fakeModule');
vm.runInContext(lifecycleCode+'\nglobalThis.cameraAPI={Cam,startCamera,stopCamera};',lifecycle);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const first=lifecycle.cameraAPI.startCamera();await tick();assert.equal(pendingEngines.length,1);
lifecycle.cameraAPI.stopCamera();
const second=lifecycle.cameraAPI.startCamera();await tick();assert.equal(pendingEngines.length,2);
const fakeEngine=()=>({closed:false,close(){this.closed=true;},matcher:{reset(){}},hold:{reset(){}}});
const fresh=fakeEngine(),stale=fakeEngine();pendingEngines[1](fresh);await second;pendingEngines[0](stale);await first;
assert.equal(lifecycle.cameraAPI.Cam.engine,fresh,'stale model must not overwrite restarted camera');assert(stale.closed);assert(!fresh.closed);checks++;
lifecycle.cameraAPI.stopCamera();assert(fresh.closed);assert.equal(lifecycle.cameraAPI.Cam.last,null);assert.equal(element('#camAdd').disabled,true);checks++;
// Exercise the real camera frame -> countdown -> applyDay -> visual callback path.
let cameraTime=0,pendingVisual=null;const uiElements=new Map(),posture={value:'auto'},calledOptions=[];
const uiCanvas={width:600,height:450,getBoundingClientRect:()=>({width:300,height:225}),getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){}})};
function uiElement(id){if(!uiElements.has(id))uiElements.set(id,id==='#camCanvas'?uiCanvas:id==='#camVideo'?{videoWidth:640,videoHeight:480}:{style:{},innerHTML:''});return uiElements.get(id);}
const cameraState={source:'摄像头',day:[],pos:[],override:{},sel:0};newChooser.S=cameraState;
const cameraUI=vm.createContext({Math,Date,Object,S:cameraState,$:uiElement,document:{getElementById:()=>posture},
  performance:{now:()=>cameraTime},CLS:CLASSES,CLASS:Object.fromEntries(CLASSES.map(c=>[c,{zh:c,dur:1}])),
  GESTURES:{hair:{cls:['standing','crouching']},oneleg:{cls:['standing']},cover:{cls:['standing']},lookback:{cls:['standing']}},
  REC:newChooser.REC,recTitle:r=>r.t,esc:x=>String(x),pad2:x=>String(x).padStart(2,'0'),toast(){},renderBars(){},
  setTimeout:()=>1,clearTimeout(){},flyToPosition(){},
  applyDay:(day,opts)=>{calledOptions.push(opts);cameraState.day=day;
    cameraState.pos=newChooser.sequence(day,cameraState.pos,!!opts.fresh||!!opts.varied,opts.focusIndex,opts.variedIndex);
    pendingVisual=()=>opts.onVisualComplete?.(cameraState.pos);return Promise.resolve();}});
const drawing=source.slice(source.indexOf('const K_EDGES ='),source.indexOf('/* ---------- MediaPipe'));
vm.runInContext(classes+'\n'+drawing+'\n'+source.slice(source.indexOf(before),source.indexOf(after))+'\nglobalThis.api={Cam,camFrame,addCamPose};',cameraUI);
cameraUI.api.Cam.engine={matcher:new CameraReferenceMatcher(library),hold:new CameraPoseHold(),libraryLoaded:true};
cameraUI.api.camFrame(K,P2,true);
assert.equal(cameraState.day.length,1,'first reliable camera frame adds immediately');
assert(!uiElement('#camStatus').innerHTML.includes('2.0'));checks++;
cameraTime=100;cameraUI.api.camFrame(K,P2,true);assert.equal(cameraState.day.length,1);checks++;
assert.equal(calledOptions[0].variedIndex,0);
await cameraUI.api.addCamPose(cameraUI.api.Cam.last,{automatic:true});assert.equal(cameraState.day.length,1,'automatic detection must not stack transitions');
assert.equal(uiElement('#camAdd').disabled,false,'recognized pose remains manually clickable during animation');
await cameraUI.api.addCamPose(cameraUI.api.Cam.last);assert(cameraUI.api.Cam.queued);assert.equal(cameraState.day.length,1);
assert(uiElement('#camAdd').disabled,'one pending manual snapshot prevents duplicate queuing');
await cameraUI.api.addCamPose(cameraUI.api.Cam.last);assert.equal(cameraState.day.length,1);checks++;
pendingVisual();assert.equal(cameraState.day.length,2,'manual snapshot is applied after the previous animation');assert.equal(cameraUI.api.Cam.queued,null);
pendingVisual();cameraTime=200;cameraUI.api.camFrame(K,P2,true);assert.equal(uiElement('#camAdd').disabled,false);checks++;
const firstCameraWork=cameraState.pos[0].work;await cameraUI.api.addCamPose(cameraUI.api.Cam.last);
assert.equal(cameraState.day.length,3);assert.equal(cameraState.pos[0].work,firstCameraWork);assert.equal(calledOptions[2].variedIndex,2);pendingVisual();checks++;
cameraTime=300;cameraUI.api.camFrame(upper,image(upper),true);assert(cameraUI.api.Cam.last.feature);assert.equal(uiElement('#camAdd').disabled,false);
await cameraUI.api.addCamPose(cameraUI.api.Cam.last);assert.equal(cameraState.day.length,3);assert(uiElement('#camStatus').innerHTML.includes('请选择'));checks++;
// Here test explicit context and manual override without an unrelated auto-add.
posture.value='seated';cameraTime=400;cameraUI.api.Cam.applying=true;cameraUI.api.Cam.activePose=cameraUI.api.Cam.last;
cameraUI.api.camFrame(upper,image(upper),true);
assert.equal(cameraUI.api.Cam.last.top,'seated');assert.equal(uiElement('#camAdd').disabled,false);checks++;
cameraUI.api.Cam.applying=false;cameraUI.api.Cam.queued=null;
const weak={...cameraUI.api.Cam.last,P:{...cameraUI.api.Cam.last.P,seated:.4}};
await cameraUI.api.addCamPose(weak,{automatic:true});assert.equal(cameraState.day.length,3);
newChooser.MAX_POS=6;await cameraUI.api.addCamPose(weak);assert.equal(cameraState.day.length,4,'manual confirmation does not require automatic confidence threshold');pendingVisual();checks++;
newChooser.MAX_POS=8;posture.value='auto';cameraTime=500;
cameraUI.api.Cam.engine.matcher.reset();cameraUI.api.camFrame(K,P2,true);
assert.equal(cameraState.day.length,5,'a clear class change adds on the next result');
cameraTime=600;cameraUI.api.camFrame(changed,image(changed),true);
assert(cameraUI.api.Cam.queued?.automatic,'new action is detected while the sculpture is switching');
cameraTime=700;cameraUI.api.camFrame(hair,image(hair),true);
assert.equal(cameraUI.api.Cam.queued.pose.g,'hair','automatic pending pose keeps only the latest action');
assert.equal(uiElement('#camAdd').disabled,false,'automatic pending action does not lock the manual button');checks++;
cameraTime=800;cameraUI.api.camFrame(K,P2,true);
assert.equal(cameraUI.api.Cam.queued,null,'returning to the active pose cancels an obsolete pending action');checks++;
cameraTime=900;cameraUI.api.camFrame(changed,image(changed),true);assert(cameraUI.api.Cam.queued?.automatic);
cameraTime=1000;cameraUI.api.camFrame(null,null,true);
assert.equal(cameraUI.api.Cam.queued,null,'loss of body clears an unconfirmed automatic pending action');checks++;
cameraTime=1050;cameraUI.api.camFrame(changed,image(changed),true);
assert(cameraUI.api.Cam.queued?.automatic,'a canceled pending pose may return immediately after a short occlusion');checks++;
cameraTime=1100;cameraUI.api.camFrame(K,P2,true);await cameraUI.api.addCamPose(cameraUI.api.Cam.last);
const manualPending=cameraUI.api.Cam.queued;assert.equal(manualPending.automatic,false);
cameraTime=1200;cameraUI.api.camFrame(hair,image(hair),true);
assert.equal(cameraUI.api.Cam.queued,manualPending,'automatic live changes preserve explicit manual intent');
cameraTime=1300;cameraUI.api.camFrame(null,null,true);assert.equal(cameraUI.api.Cam.queued,manualPending);
pendingVisual();assert.equal(cameraState.day.length,6);pendingVisual();assert.equal(cameraUI.api.Cam.applying,false);checks++;
console.log(JSON.stringify({ok:true,checks,templates:library.templates.length,sourceVideos:library.sources.length,matcherMilliseconds:Number(average.toFixed(2)),nonCameraBehaviorUnchanged:true,sculptureAnimationsUnchanged:true,joinedModuleParses:true}));
