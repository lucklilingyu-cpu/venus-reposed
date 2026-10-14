/* A separate player for the prepared skeleton videos. The photo gallery and
   its recognition/annotation handlers are intentionally not used here. */
const PoseVideoCollection={items:[],selected:null,loading:null};
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
  if(autoplay){
    const play=player.play();
    if(play?.catch)play.catch(()=>{if(PoseVideoCollection.selected===id)status.textContent='视频已就绪，点击播放器的播放按钮开始。';});
  }
  return true;
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
        `<button class="pose-video-item" type="button" data-pose-video="${esc(item.id)}" aria-pressed="false" aria-label="播放 ${esc(item.title)}"><span class="pose-video-thumb"><img src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy" decoding="async"><span class="pose-video-duration">${poseVideoTime(item.duration)}</span></span><span class="pose-video-name">${esc(item.title)}</span></button>`).join('');
      $('#poseVideoCount').textContent=`${items.length} videos`;
      $('#poseVideoStatus').textContent='选择一个视频，查看完整骨骼动作。';
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
  $('#modeTabs').addEventListener('click',event=>{const tab=event.target.closest('[data-mode]');if(tab&&tab.dataset.mode!=='video')player.pause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)player.pause();});
  loadPoseVideoCollection();
}
initPoseVideoCollection();
