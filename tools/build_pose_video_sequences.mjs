// Classify real CSV joints with the site's existing classifier; no preset class order.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const [input,output='data/pose-video-sequences.json']=process.argv.slice(2);
assert(input,'Pass the private sampled-joint JSON path');
const catalogue=JSON.parse(readFileSync('data/pose-video-gallery.json','utf8'));
const source=readFileSync('js/07-inputs.js','utf8');
const classifier=source.slice(source.indexOf('const sig ='),source.indexOf('/* canonical skeleton'));
assert(classifier.includes('function classifyPose('));
const classes=['standing','walking','seated','crouching','reclining','horizontal'];
const joints=['nose','lsh','rsh','lel','rel','lwr','rwr','lhip','rhip','lkn','rkn','lank','rank'];
const gestures={hair:{cls:['standing','crouching']},oneleg:{cls:['standing']},cover:{cls:['standing']},lookback:{cls:['standing']}};
const context=vm.createContext({CLS:classes,GESTURES:gestures});
vm.runInContext(classifier+'\nglobalThis.classify=classifyPose;',context);
const videos=[];
for(const record of JSON.parse(readFileSync(input,'utf8')).videos){
  const item=catalogue.videos.find(v=>v.id===record.id);assert(item);
  let history=[];
  const frames=record.samples.map(sample=>{
    if(!sample.continuous)history=[];
    history=history.filter(p=>sample.time-p.time<=1.6);
    history.push({time:sample.time,value:sample.pose[11][0]-sample.pose[12][0]});
    const K=Object.fromEntries(joints.map((key,i)=>[key,{x:sample.pose[i][0],y:sample.pose[i][1],z:0,v:sample.pose[i][2]}]));
    const values=history.map(p=>p.value),result=context.classify(K,values);
    let g=result.g;
    if((g==='hair'&&[0,5,6].some(i=>sample.pose[i][2]<.6))||
       (g==='cover'&&[5,6].some(i=>sample.pose[i][2]<.6)))g=null;
    const confidence=result.P[result.top];
    return {...sample,cls:result.top,g,confidence,history:values,
      valid:confidence>=.55};
  });
  const stable=frames.filter((frame,i)=>{
    if(!frame.valid)return false;
    const neighbors=frames.slice(Math.max(0,i-3),i+4).filter(p=>Math.abs(p.time-frame.time)<=.42&&p.valid);
    return neighbors.filter(p=>p.cls===frame.cls).length>=Math.max(3,Math.ceil(neighbors.length*.6));
  });
  const runs=[];
  for(const frame of stable){
    let run=runs.at(-1);
    if(!run||run.cls!==frame.cls||frame.time-run.frames.at(-1).time>.5){run={cls:frame.cls,frames:[]};runs.push(run);}
    run.frames.push(frame);
  }
  const candidates=runs.filter(run=>run.frames.length>=4&&run.frames.at(-1).time-run.frames[0].time>=.38).map(run=>{
    const first=run.frames[0],last=run.frames.at(-1),mid=(first.time+last.time)/2;
    const representative=run.frames.slice().sort((a,b)=>
      (b.confidence-.002*Math.abs(b.time-mid))-(a.confidence-.002*Math.abs(a.time-mid)))[0];
    return {...run,start:first.time,end:last.time+1/8,representative,
      score:run.frames.reduce((sum,p)=>sum+p.confidence,0)/run.frames.length};
  });
  assert(candidates.length,'No stable classified segments for '+item.id);
  // Retain genuine observed classes, then fill temporal gaps across the whole clip.
  const chosen=new Set();
  for(const cls of classes){
    const best=candidates.filter(p=>p.cls===cls).sort((a,b)=>(b.end-b.start)*b.score-(a.end-a.start)*a.score)[0];
    if(best)chosen.add(best);
  }
  while(chosen.size<10&&chosen.size<candidates.length){
    const best=candidates.filter(p=>!chosen.has(p)).sort((a,b)=>{
      const gap=p=>Math.min(...[...chosen].map(q=>Math.abs(p.representative.time-q.representative.time)));
      return gap(b)*b.score-gap(a)*a.score;
    })[0];
    chosen.add(best);
  }
  const sequence=[...chosen].sort((a,b)=>a.start-b.start).map(run=>{
    const p=run.representative;
    return {cls:p.cls,g:p.g,start:Math.round(run.start*100)/100,end:Math.min(item.duration,Math.round(run.end*100)/100),
      frame:p.frame,time:p.time,confidence:Math.round(p.confidence*10000)/10000,
      pose:p.pose,history:p.history};
  });
  const counts=Object.fromEntries(classes.map(cls=>[cls,stable.filter(p=>p.cls===cls).length]));
  videos.push({id:item.id,videoSha256:item.sha256,duration:item.duration,source:record.source,
    sampledFrames:frames.length,stableFrames:stable.length,classCounts:counts,sequence});
  console.log(item.id+': '+sequence.map(p=>p.cls).join(' → '));
}
assert.equal(videos.length,catalogue.videos.length);
const data={format:'pose-video-sequences-v1',method:'Validated YOLO CSV joints classified with the existing site classifyPose function; temporal stability and representative chronological segments; automatic 2D estimates, not manual labels.',
  classifierSha256:createHash('sha256').update(classifier.replace(/\r\n/g,'\n')).digest('hex'),joints,videos};
writeFileSync(output,JSON.stringify(data)+'\n');
console.log(JSON.stringify({videos:videos.length,bytes:Buffer.byteLength(JSON.stringify(data)),classifierUnchanged:true}));
