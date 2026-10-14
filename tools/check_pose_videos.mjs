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
assert.equal(data.format,'pose-video-gallery-v1');assert.equal(data.videos.length,9);
const count=data.videos.length;
assert.equal(new Set(data.videos.map(item=>item.file)).size,count);
const existingVideos=JSON.parse(baseline('data/pose-video-gallery.json')).videos;
for(const item of existingVideos)assert.deepEqual(data.videos.find(entry=>entry.id===item.id),item,'previous video records and media hashes must remain unchanged');
let bytes=0;
for(const [i,item] of data.videos.entries()){
  assert.equal(item.id,String(i+1).padStart(3,'0'));
  const goddess=i<7?'Venus / Aphrodite':'Medusa';
  assert.equal(item.goddess,goddess);
  assert.equal(item.title,`${String(i+1).padStart(2,'0')}_${goddess.replaceAll(' / ','_')}_${item.group.replaceAll(' ','_')}_${item.song.replaceAll(' ','_')}`);
  assert(/^[\x20-\x7e]+$/.test(item.title),'all names must be English/ASCII');
  assert.equal(item.downloadName,item.title+'.mp4');assert.equal(item.skeletonOverlay,true);
  assert(!('version' in item),'no version field requested');
  if(i>=7){assert.equal(item.group,'KISS OF LIFE');assert.equal(item.song,'Midas Touch');assert.equal(new URL(item.sourceUrl).searchParams.get('v'),['oKVYm8mIUdo','nH6MOYPEvfY'][i-7]);}
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
assert(!/analyzeGalleryImage\(|applyDay\(|loadMedia\(/.test(source),'collection playback must not change existing sculpture/photo behavior');
const elements=new Map(),buttons=[];let fetches=0,pauses=0,plays=0;
function element(id){if(!elements.has(id))elements.set(id,{id,style:{},hidden:false,textContent:'',listeners:{},
  addEventListener(event,fn){this.listeners[event]=fn;},contains:node=>buttons.includes(node)});return elements.get(id);}
const gallery=element('#poseVideoGallery');
Object.defineProperty(gallery,'innerHTML',{get(){return this.html||'';},set(html){this.html=html;buttons.length=0;
  for(const match of html.matchAll(/data-pose-video="(\d+)"/g))buttons.push({dataset:{poseVideo:match[1]},attributes:{},setAttribute(key,value){this.attributes[key]=value;}});}});
const player=element('#poseCollectionPlayer');Object.assign(player,{pause(){pauses++;},load(){},play(){plays++;return Promise.resolve();}});
const document={hidden:false,listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}};
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const context=vm.createContext({URL,document,$:element,$$:()=>buttons,esc:escape,
  fetch:async()=>{fetches++;return {ok:true,json:async()=>data};}});
vm.runInContext(source+'\nglobalThis.testVideoAPI={PoseVideoCollection,loadPoseVideoCollection,selectPoseVideo,poseVideoSafeItem};',context);
await context.testVideoAPI.loadPoseVideoCollection();
assert.equal(fetches,1);assert.equal(buttons.length,count);assert.equal(player.src,undefined,'no videos fetched before selection');
for(const item of data.videos){
  assert(context.testVideoAPI.selectPoseVideo(item.id));
  assert.equal(player.src,item.file);assert.equal(player.poster,item.poster);
  assert.equal(element('#poseVideoTitle').textContent,item.title);
  assert.equal(element('#poseVideoDownload').download,item.title+'.mp4');
  assert.equal(buttons.filter(button=>button.attributes['aria-pressed']==='true').length,1);
}
assert.equal(plays,count);assert.equal(pauses,count);
assert.equal(context.testVideoAPI.selectPoseVideo('missing'),false);
assert(!context.testVideoAPI.poseVideoSafeItem({...data.videos[0],file:'https://example.com/video.mp4'}));
assert(!context.testVideoAPI.poseVideoSafeItem({...data.videos[0],file:'../other.mp4'}));
document.hidden=true;document.listeners.visibilitychange();assert.equal(pauses,count+1);
element('#modeTabs').listeners.click({target:{closest:()=>({dataset:{mode:'camera'}})}});assert.equal(pauses,count+2);
console.log(JSON.stringify({ok:true,videos:count,totalBytes:bytes,previousVideosUnchanged:true,englishNamesWithoutVersions:true,photoGalleryUnchanged:true,videosAfterPhotos:true,cameraAndSculptureCodeUnchanged:true,playbackSelectionAndDownloads:true}));
