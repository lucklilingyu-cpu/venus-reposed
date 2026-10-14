/* The prepared videos use their own CSV joints, then the same applyDay and
   flyHome functions used by the existing text diary. */
const PoseVideoCollection={items:[],selected:null,loading:null,analysisLoading:null,request:0,busyOwner:0,pending:null};
const POSE_VIDEO_JOINTS=['nose','lsh','rsh','lel','rel','lwr','rwr','lhip','rhip','lkn','rkn','lank','rank'];
function poseVideoTime(seconds){
  const value=Math.max(0,Math.floor(seconds));
  return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}
function poseVideoSafeItem(item){
  if(!item||!/^\d{3}$/.test(item.id)||typeof item.title!=='string'||!/^[\x20-\x7e]+$/.test(item.title))return false;
  if(!/^video\/pose-gallery\/[A-Za-z0-9_()\-]+\.mp4$/.test(item.file)||
     !/^img\/pose-video-gallery\/\d{3}\.jpg$/.test(item.poster))return false;
  if(!['title','goddess','group','song','relation','note','downloadName'].every(key=>typeof item[key]==='string'))return false;
  if(item.downloadName!==item.title+'.mp4'||!(item.duration>0))return false;
  try{return [item.sourceUrl,item.evidenceUrl].every(value=>new URL(value).protocol==='https:');}catch(_){return false;}
}
function selectPoseVideo(id,autoplay=true){
  const item=PoseVideoCollection.items.find(entry=>entry.id===id);
  if(!item)return false;
  if(Vid.busy&&!PoseVideoCollection.busyOwner){$('#poseVideoStatus').textContent='当前图片或上传视频正在分析，完成后可选择视频集。';return false;}
  const request=++PoseVideoCollection.request;
  poseVideoOverview();
  const player=$('#poseCollectionPlayer'),status=$('#poseVideoStatus');
  player.pause();PoseVideoCollection.selected=item.id;
  $$('#poseVideoGallery [data-pose-video]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.poseVideo===id)));
  $('#poseVideoSelected').hidden=false;
  $('#poseVideoTitle').textContent=item.title;
  $('#poseVideoRelation').textContent=`${item.goddess} · ${item.group} · ${item.song} · ${item.relation}`;
  $('#poseVideoNote').textContent=item.note;
  const download=$('#poseVideoDownload');download.href=item.file;download.download=item.downloadName;
  $('#poseVideoSource').href=item.sourceUrl;$('#poseVideoEvidence').href=item.evidenceUrl;
  player.poster=item.poster;player.preload='metadata';player.src=item.file;player.load();
  status.textContent='已选择视频，可播放、暂停或拖动进度。';
  $('#poseVideoSequence').textContent='正在读取这条视频的骨骼数据…';
  $('#poseVideoCollection').dataset.analysisState='loading';
  $('#poseVideoCollection').dataset.analysisId=id;
  PoseVideoCollection.pending=analyzePoseCollectionVideo(item,request);
  if(autoplay){
    const play=player.play();
    if(play?.catch)play.catch(()=>{if(PoseVideoCollection.selected===id)status.textContent='视频已就绪，点击播放器的播放按钮开始。';});
  }
  return true;
}
function poseVideoOverview(){
  clearTimeout(galleryOverviewTimer);galleryOverviewTimer=0;
  stopPoseSlideshow();
  if(!Vid.busy)$$('#poseGallery [data-pose-gallery]').forEach(button=>{button.disabled=false;});
  stopTour({stay:true});Walk.exit();clearSculptureFocus();flyHome();
}
function cancelPoseVideoAnalysis(){
  PoseVideoCollection.request++;
  if(PoseVideoCollection.busyOwner){
    PoseVideoCollection.busyOwner=0;Vid.busy=false;$('#videoGo').disabled=!Vid.frames.length;
  }
  $('#poseVideoCollection').dataset.analysisState='idle';
}
async function loadPoseVideoAnalysis(){
  if(!PoseVideoCollection.analysisLoading){
    PoseVideoCollection.analysisLoading=(async()=>{
      const response=await fetch('data/pose-video-sequences.json',{cache:'no-cache'});
      if(!response.ok)throw new Error('视频骨骼数据暂时无法载入，请重新选择视频。');
      const data=await response.json();
      if(data.format!=='pose-video-sequences-v1'||JSON.stringify(data.joints)!==JSON.stringify(POSE_VIDEO_JOINTS)||!Array.isArray(data.videos))throw new Error('视频骨骼数据格式不正确。');
      return data;
    })().catch(error=>{PoseVideoCollection.analysisLoading=null;throw error;});
  }
  return PoseVideoCollection.analysisLoading;
}
function poseVideoSampleResult(sample){
  if(!sample||!Array.isArray(sample.pose)||sample.pose.length!==13||
     !sample.pose.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&Math.abs(p[0])<10&&Math.abs(p[1])<10&&p[2]>=0&&p[2]<=1)||
     !Array.isArray(sample.history)||sample.history.length>90||!sample.history.every(x=>Number.isFinite(x)&&Math.abs(x)<10))throw new Error('视频关节点数据不完整。');
  const K=Object.fromEntries(POSE_VIDEO_JOINTS.map((key,i)=>[key,{x:sample.pose[i][0],y:sample.pose[i][1],z:0,v:sample.pose[i][2]}]));
  const result=classifyPose(K,sample.history);
  if(result.top!==sample.cls||result.P[result.top]<.55)throw new Error('视频姿势数据与当前识别程序不一致。');
  if((result.g==='hair'&&[0,5,6].some(i=>sample.pose[i][2]<.6))||
     (result.g==='cover'&&[5,6].some(i=>sample.pose[i][2]<.6)))result.g=null;
  return result;
}
function poseVideoDay(item,record){
  if(!record||record.videoSha256!==item.sha256||record.duration!==item.duration||
     !Array.isArray(record.sequence)||!record.sequence.length||record.sequence.length>10)throw new Error('没有找到这条视频对应的完整骨骼序列。');
  let previousEnd=-1;
  const segments=record.sequence.map(sample=>{
    if(!Number.isFinite(sample.start)||!Number.isFinite(sample.end)||sample.start<previousEnd||sample.end<=sample.start||sample.end>item.duration+.1)throw new Error('视频姿势时间顺序不正确。');
    previousEnd=sample.end;
    return {sample,result:poseVideoSampleResult(sample)};
  });
  const total=segments.reduce((sum,p)=>sum+p.sample.end-p.sample.start,0);
  return segments.map(({sample,result})=>({cls:result.top,g:result.g,
    label:`${CLASS[result.top].zh} · ${poseVideoTime(sample.start)}–${poseVideoTime(sample.end)}`,
    time:poseVideoTime(sample.start),hours:Math.round((sample.end-sample.start)/total*160)/10}));
}
async function analyzePoseCollectionVideo(item,request){
  const current=()=>request===PoseVideoCollection.request&&PoseVideoCollection.selected===item.id;
  const box=$('#poseVideoCollection'),summary=$('#poseVideoSequence');
  try{
    const data=await loadPoseVideoAnalysis();if(!current())return;
    const rawDay=poseVideoDay(item,data.videos.find(record=>record.id===item.id));
    const day=S.merge?mergeDay(rawDay):rawDay;
    if(!current())return;
    PoseVideoCollection.busyOwner=request;Vid.busy=true;$('#videoGo').disabled=true;
    S.posPal={};S.sel=0;
    const source='视频骨骼分析 · '+item.title;
    summary.textContent=day.map(p=>CLASS[p.cls].zh).join(' → ');
    box.dataset.analysisState='animating';
    $('#poseVideoStatus').textContent='已识别姿势序列，正在使用文字日记相同的雕塑匹配与动画。';
    await applyDay(day,{source,fresh:true,onVisualComplete:()=>{
      if(!current()||S.source!==source)return;
      box.dataset.analysisState='ready';
      $('#poseVideoStatus').textContent='姿势序列已生成，可播放视频对照；选择另一条视频会返回展厅全景。';
    }});
  }catch(error){
    if(current()){box.dataset.analysisState='error';summary.textContent=error.message||'视频姿势分析未完成，请重新选择。';}
  }finally{
    if(PoseVideoCollection.busyOwner===request){PoseVideoCollection.busyOwner=0;Vid.busy=false;$('#videoGo').disabled=!Vid.frames.length;}
  }
}
async function loadPoseVideoCollection(){
  if(PoseVideoCollection.loading)return PoseVideoCollection.loading;
  PoseVideoCollection.loading=(async()=>{
    try{
      const response=await fetch('data/pose-video-gallery.json',{cache:'no-cache'});
      if(!response.ok)throw new Error('video list unavailable');
      const data=await response.json(),items=data.format==='pose-video-gallery-v1'&&Array.isArray(data.videos)?data.videos:[];
      if(!items.length||!items.every(poseVideoSafeItem)||new Set(items.map(item=>item.id)).size!==items.length)throw new Error('invalid video list');
      PoseVideoCollection.items=items;
      $('#poseVideoGallery').innerHTML=items.map(item=>
        `<button class="pose-video-item" type="button" data-pose-video="${esc(item.id)}" aria-pressed="false" aria-label="播放并分析 ${esc(item.title)}"><span class="pose-video-thumb"><img src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy" decoding="async"><span class="pose-video-duration">${poseVideoTime(item.duration)}</span></span><span class="pose-video-name">${esc(item.title)}</span></button>`).join('');
      $('#poseVideoCount').textContent=`${items.length} videos`;
      $('#poseVideoStatus').textContent='选择一个视频，按实际骨骼数据生成姿势序列并更新展厅雕塑。';
      return items;
    }catch(_){
      $('#poseVideoStatus').textContent='视频集暂时无法载入，请刷新后重试。';return [];
    }
  })();
  return PoseVideoCollection.loading;
}
function initPoseVideoCollection(){
  const gallery=$('#poseVideoGallery');if(!gallery)return;
  gallery.addEventListener('click',event=>{const button=event.target.closest('[data-pose-video]');if(button&&gallery.contains(button))selectPoseVideo(button.dataset.poseVideo);});
  const player=$('#poseCollectionPlayer');
  player.addEventListener('error',()=>{$('#poseVideoStatus').textContent='视频暂时无法播放，请刷新或使用下载链接查看。';});
  $('#modeTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-mode]');if(tab&&tab.dataset.mode!=='video'){player.pause();cancelPoseVideoAnalysis();}});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#parseBtn,#resetBtn,#poseGallery [data-pose-gallery],#videoGo,#camStart,#camDemo,#poseAnnotationSave')){player.pause();cancelPoseVideoAnalysis();}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)player.pause();});
  loadPoseVideoCollection();
}
initPoseVideoCollection();
