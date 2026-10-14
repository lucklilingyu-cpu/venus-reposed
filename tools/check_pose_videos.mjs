import assert from 'node:assert/strict';
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const git=process.env.VENUS_GIT_EXE||'git',base=process.argv[2]||'origin/main';
const normal=text=>text.replace(/\r\n/g,'\n');
const baseline=file=>execFileSync(git,['show',base+':'+file],{cwd:root,encoding:'utf8'});
const stripHTML=text=>normal(text).replace(/        <!-- POSE VIDEO COLLECTION START -->\n[\s\S]*?        <!-- POSE VIDEO COLLECTION END -->\n/g,'').replace("'07b-pose-video-gallery.js', ",'');
const stripCSS=text=>normal(text).replace(/\/\* POSE VIDEO COLLECTION START \*\/\n[\s\S]*?\/\* POSE VIDEO COLLECTION END \*\/\n?/g,'').trimEnd();
assert.equal(stripHTML(readFileSync(join(root,'index.html'),'utf8')),stripHTML(baseline('index.html')),'all existing markup and loader behavior must remain unchanged');
const markup=readFileSync(join(root,'index.html'),'utf8');
assert(markup.indexOf('id="poseVideoCollection"')>markup.indexOf('id="poseAnnotatorStatus"'),'video collection must follow the photos and annotation tools');
assert.equal(stripCSS(readFileSync(join(root,'style.css'),'utf8')),stripCSS(baseline('style.css')),'existing styles must remain unchanged');
for(const file of ['js/07-inputs.js','js/10-main.js','js/05-seq.js','js/05b-ribbons.js','data/pose-gallery.json'])
  assert.equal(normal(readFileSync(join(root,file),'utf8')),normal(baseline(file)),file+' must remain unchanged');
execFileSync(git,['diff','--exit-code',base,'--','img/pose-gallery'],{cwd:root,stdio:'pipe'});
const data=JSON.parse(readFileSync(join(root,'data/pose-video-gallery.json'),'utf8'));
assert.equal(data.format,'pose-video-gallery-v1');assert.equal(data.videos.length,10);
const count=data.videos.length;
assert.equal(new Set(data.videos.map(item=>item.file)).size,count);
const existingVideos=JSON.parse(baseline('data/pose-video-gallery.json')).videos;
for(const item of existingVideos)assert.deepEqual(data.videos.find(entry=>entry.id===item.id),item,'previous video records and media hashes must remain unchanged');
let bytes=0;
for(const [i,item] of data.videos.entries()){
  assert.equal(item.id,String(i+1).padStart(3,'0'));
  const goddess=i<7?'Venus / Aphrodite':i<9?'Medusa':'Venus / Nephthys';
  assert.equal(item.goddess,goddess);
  assert.equal(item.title,`${String(i+1).padStart(2,'0')}_${goddess.replaceAll(' / ','_')}_${item.group.replaceAll(' ','_')}_${item.song.replaceAll(' ','_')}`);
  assert(/^[\x20-\x7e]+$/.test(item.title),'all names must be English/ASCII');
  assert.equal(item.downloadName,item.title+'.mp4');assert.equal(item.skeletonOverlay,true);
  assert(!('version' in item),'no version field requested');
  if(i>=7&&i<9){assert.equal(item.group,'KISS OF LIFE');assert.equal(item.song,'Midas Touch');assert.equal(new URL(item.sourceUrl).searchParams.get('v'),['oKVYm8mIUdo','nH6MOYPEvfY'][i-7]);}
  if(i===9){assert.equal(item.group,'Dreamcatcher');assert.equal(item.song,'OOTD');assert.equal(new URL(item.sourceUrl).searchParams.get('v'),'puJyRHpbWug');}
  assert(item.duration>100&&item.width<=1280&&item.height<=720);
  assert(/^https:\/\/www.youtube.com\/watch\?v=[\w-]{11}$/.test(item.sourceUrl));
  const content=readFileSync(join(root,item.file));bytes+=content.length;
  assert.equal(content.length,item.bytes);assert(content.length<90*1024*1024);
  assert.equal(createHash('sha256').update(content).digest('hex'),item.sha256);
  let position=0,moov=-1,mdat=-1;
  while(position+8<=content.length){let size=content.readUInt32BE(position);const type=content.toString('ascii',position+4,position+8);
    if(size===1)size=Number(content.readBigUInt64BE(position+8));if(!size)size=content.length-position;
    assert(size>=8);if(type==='moov')moov=position;if(type==='mdat')mdat=position;position+=size;}
  assert(moov>=0&&mdat>moov,'web video index must be before media bytes');
  assert(statSync(join(root,item.poster)).size>1000);
}
assert.equal(readdirSync(join(root,'video/pose-gallery')).filter(name=>name.endsWith('.mp4')).length,count);
assert(markup.includes(`id="poseVideoCount">${count} videos</span>`));
assert(!/[A-Z]:\\|Users\\/.test(JSON.stringify(data)),'no private local paths in public catalogue');
const source=readFileSync(join(root,'js/07b-pose-video-gallery.js'),'utf8');
assert(!/analyzeGalleryImage\(|loadMedia\(|computeSequence\(|setFigure\(/.test(source),'use existing diary animation rather than duplicating or replacing it');
assert(source.includes('await applyDay(day,{source,fresh:true,'),'video must use the same applyDay entry point as the diary');
const inputs=readFileSync(join(root,'js/07-inputs.js'),'utf8');
const classifier=inputs.slice(inputs.indexOf('const sig ='),inputs.indexOf('/* canonical skeleton'));
const mergeFunction=inputs.slice(inputs.indexOf('function mergeDay('),inputs.indexOf('async function parseWithClaude('));
const constants=readFileSync(join(root,'js/01-data.js'),'utf8');
const definitions=constants.slice(constants.indexOf('const CLS ='),constants.indexOf('/* default palettes'));
const analysis=JSON.parse(readFileSync(join(root,'data/pose-video-sequences.json'),'utf8'));
assert.equal(analysis.format,'pose-video-sequences-v1');assert.equal(analysis.videos.length,count);
assert.equal(analysis.classifierSha256,createHash('sha256').update(normal(classifier)).digest('hex'));
assert(!/[A-Z]:\\|Users\\/.test(JSON.stringify(analysis)),'no local analysis paths in public data');
for(const item of data.videos){
  const record=analysis.videos.find(p=>p.id===item.id);assert(record);
  assert.equal(record.videoSha256,item.sha256);assert(record.source.keypointsSha256.match(/^[a-f0-9]{64}$/));
  assert(record.sampledFrames>0&&record.stableFrames>0&&record.sequence.length>0&&record.sequence.length<=10);
  for(const sample of record.sequence){assert(Number.isInteger(sample.frame)&&sample.frame<record.source.frameCount);assert(sample.time>=sample.start-.02&&sample.time<=sample.end+.02);}
}
// Exercise the existing sculpture matcher against these actual video sequences.
const atlas=JSON.parse(readFileSync(join(root,'data/atlas.json'),'utf8'));
const extra=JSON.parse(readFileSync(join(root,'data/atlas-extra.json'),'utf8'));
const REC=Object.fromEntries(atlas.records.map(record=>[record.id,{...record,...extra.fix?.[record.id]}]));
for(const record of extra.records||[])if(!REC[record.id])REC[record.id]=record;
const FIGS=Object.values(REC).filter(record=>record.kind==='figure'&&record.cls);
const originalIds=vm.runInNewContext(constants.match(/const EXISTING = (\[[^;]+?\])\s*\.filter/)[1]);
const EXISTING=originalIds.filter(id=>REC[id]?.cls).map(id=>({id}));
const fitsCls=(record,cls)=>record.cls===cls||(record.alt||[]).includes(cls);
const matching={REC,FIGS,EXISTING,MAX_POS:28,fitsCls,S:{override:{}}};
const sculptureCode=readFileSync(join(root,'js/05-seq.js'),'utf8');
const matchAPI=vm.runInNewContext(sculptureCode.slice(sculptureCode.indexOf('const KIN'),sculptureCode.indexOf('let applySeq'))+';({computeSequence})',matching);
let previous=[];
for(const record of analysis.videos){
  const day=record.sequence.map(sample=>({cls:sample.cls,g:sample.g}));
  const next=matchAPI.computeSequence(day,previous,true);
  assert.equal(next.filter(p=>p.act).length,day.length);
  assert(next.filter(p=>p.act).every(p=>fitsCls(REC[p.work],p.act.cls)),'the original diary matcher must find sculptures matching all video classes');
  assert.equal(new Set(next.map(p=>p.work)).size,next.length,'video sequences must preserve the original no-duplicate sculpture policy');
  previous=next;
}
const elements=new Map(),buttons=[],calls=[];let fetches=0,pauses=0,plays=0,homes=0,failAnalysis=false,visualCallbacks=null,holdApply=null;
const S={posPal:{},sel:0,source:'',day:[],merge:true},Vid={busy:false,frames:[]};
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},dataset:{},hidden:false,textContent:'',listeners:{},
  addEventListener(event,fn){this.listeners[event]=fn;},contains:node=>buttons.includes(node)});return elements.get(id);}
const gallery=element('#poseVideoGallery');
Object.defineProperty(gallery,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;buttons.length=0;
  for(const match of html.matchAll(/data-pose-video="(\d+)"/g))buttons.push({dataset:{poseVideo:match[1]},attributes:{},setAttribute(key,value){this.attributes[key]=value;}});}});
const player=element('#poseCollectionPlayer');Object.assign(player,{pause(){pauses++;},load(){},play(){plays++;return Promise.resolve();}});
const document={hidden:false,listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const context=vm.createContext({URL,document,$:element,$$:selector=>selector.includes('poseVideoGallery')?buttons:[],esc:escape,S,Vid,
  Walk:{exit(){}},stopTour(){},stopPoseSlideshow(){},clearSculptureFocus(){},flyHome(){homes++;},clearTimeout(){},galleryOverviewTimer:0,
  applyDay:async(day,options)=>{S.day=JSON.parse(JSON.stringify(day));S.source=options.source;calls.push({day:S.day,options});
    const waiting=holdApply;holdApply=null;if(waiting)await waiting;
    if(visualCallbacks)visualCallbacks.push(options.onVisualComplete);else options.onVisualComplete?.();},
  fetch:async url=>{fetches++;if(url.includes('sequences')&&failAnalysis)throw new Error('analysis unavailable');return {ok:true,json:async()=>url.includes('sequences')?analysis:data};}});
vm.runInContext(definitions+'\n'+classifier+'\n'+mergeFunction+'\n'+source+'\nglobalThis.testVideoAPI={PoseVideoCollection,loadPoseVideoCollection,selectPoseVideo,poseVideoSafeItem,poseVideoDay,cancelPoseVideoAnalysis,mergeDay};',context);
await context.testVideoAPI.loadPoseVideoCollection();
assert.equal(fetches,1);assert.equal(buttons.length,count);assert.equal(player.src,undefined,'no videos fetched before selection');
for(const item of data.videos){
  assert(context.testVideoAPI.selectPoseVideo(item.id));
  await context.testVideoAPI.PoseVideoCollection.pending;
  assert.equal(player.src,item.file);assert.equal(player.poster,item.poster);
  assert.equal(element('#poseVideoTitle').textContent,item.title);
  assert.equal(element('#poseVideoDownload').download,item.title+'.mp4');
  assert.equal(buttons.filter(button=>button.attributes['aria-pressed']==='true').length,1);
  const record=analysis.videos.find(p=>p.id===item.id);
  const expected=context.testVideoAPI.mergeDay(context.testVideoAPI.poseVideoDay(item,record));
  assert.equal(JSON.stringify(S.day.map(p=>[p.cls,p.g])),JSON.stringify(expected.map(p=>[p.cls,p.g])));
  assert(S.day.every(p=>p.label&&Number.isFinite(p.hours)));assert.equal(calls.at(-1).options.fresh,true);
  assert.equal(element('#poseVideoCollection').dataset.analysisState,'ready');
}
assert.equal(fetches,2,'only one shared analysis file, no media-model downloads per selection');
assert.equal(calls.length,count);assert.equal(homes,count);assert.equal(Vid.busy,false);
assert.equal(plays,count);assert.equal(pauses,count);
assert.equal(context.testVideoAPI.selectPoseVideo('missing'),false);
assert(!context.testVideoAPI.poseVideoSafeItem({...data.videos[0],file:'https://example.com/video.mp4'}));
assert(!context.testVideoAPI.poseVideoSafeItem({...data.videos[0],file:'../other.mp4'}));
document.hidden=true;document.listeners.visibilitychange();assert.equal(pauses,count+1);
element('#modeTabs').listeners.click({target:{closest:()=>({dataset:{mode:'camera'}})}});assert.equal(pauses,count+2);
S.merge=false;context.testVideoAPI.selectPoseVideo('006');await context.testVideoAPI.PoseVideoCollection.pending;
assert.equal(S.day.length,analysis.videos[5].sequence.length,'respect the existing diary merge option');S.merge=true;
const beforeRace=calls.length;
context.testVideoAPI.selectPoseVideo('001');const first=context.testVideoAPI.PoseVideoCollection.pending;
context.testVideoAPI.selectPoseVideo('002');await Promise.all([first,context.testVideoAPI.PoseVideoCollection.pending]);
assert.equal(calls.length,beforeRace+1);assert(S.source.includes(data.videos[1].title));
visualCallbacks=[];
context.testVideoAPI.selectPoseVideo('001');await context.testVideoAPI.PoseVideoCollection.pending;
context.testVideoAPI.selectPoseVideo('003');await context.testVideoAPI.PoseVideoCollection.pending;
visualCallbacks[0]();assert.equal(element('#poseVideoCollection').dataset.analysisState,'animating','old completion must not overwrite a newer selection');
visualCallbacks[1]();assert.equal(element('#poseVideoCollection').dataset.analysisState,'ready');visualCallbacks=null;
context.testVideoAPI.selectPoseVideo('004');const cancelled=context.testVideoAPI.PoseVideoCollection.pending;
document.listeners.click({target:{closest:()=>({id:'parseBtn'})}});await cancelled;
assert(S.source.includes(data.videos[2].title),'switching to diary cancels pending video application');
Vid.busy=true;assert.equal(context.testVideoAPI.selectPoseVideo('005'),false);Vid.busy=false;
assert.throws(()=>context.testVideoAPI.poseVideoDay(data.videos[0],{...analysis.videos[0],videoSha256:'wrong'}));
assert.throws(()=>context.testVideoAPI.poseVideoDay(data.videos[0],{...analysis.videos[0],sequence:[{...analysis.videos[0].sequence[0],cls:'invented'}]}));
context.testVideoAPI.PoseVideoCollection.analysisLoading=null;failAnalysis=true;
context.testVideoAPI.selectPoseVideo('006');await context.testVideoAPI.PoseVideoCollection.pending;
assert.equal(element('#poseVideoCollection').dataset.analysisState,'error');assert.equal(Vid.busy,false);
failAnalysis=false;context.testVideoAPI.selectPoseVideo('006');await context.testVideoAPI.PoseVideoCollection.pending;
assert.equal(element('#poseVideoCollection').dataset.analysisState,'ready');
let releaseApply;holdApply=new Promise(resolve=>{releaseApply=resolve;});
context.testVideoAPI.selectPoseVideo('007');const slow=context.testVideoAPI.PoseVideoCollection.pending;
for(let i=0;i<5;i++)await Promise.resolve();assert.equal(Vid.busy,true);
context.testVideoAPI.selectPoseVideo('008');await context.testVideoAPI.PoseVideoCollection.pending;
releaseApply();await slow;assert(S.source.includes(data.videos[7].title));assert.equal(Vid.busy,false);
holdApply=new Promise(resolve=>{releaseApply=resolve;});
context.testVideoAPI.selectPoseVideo('009');const interrupted=context.testVideoAPI.PoseVideoCollection.pending;
for(let i=0;i<5;i++)await Promise.resolve();
document.listeners.click({target:{closest:()=>({id:'poseGallery'})}});Vid.busy=true;
releaseApply();await interrupted;assert.equal(Vid.busy,true,'a cancelled video must not unlock a new photo analysis');Vid.busy=false;
console.log(JSON.stringify({ok:true,videos:count,totalBytes:bytes,previousVideosUnchanged:true,englishNamesWithoutVersions:true,photoGalleryUnchanged:true,videosAfterPhotos:true,cameraAndSculptureCodeUnchanged:true,diaryAnimationReused:true,actualJointsClassified:true,latestSelectionWins:true,overviewOnSelection:true,analysisFailureRetry:true,playbackSelectionAndDownloads:true}));
