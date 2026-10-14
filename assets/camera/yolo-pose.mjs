// Decode the exact 32x57 end-to-end YOLO26s output used by local video analysis.
export const YOLO_JOINTS = { nose:0,lsh:5,rsh:6,lel:7,rel:8,lwr:9,rwr:10,lhip:11,rhip:12,lkn:13,rkn:14,lank:15,rank:16 };
export function decodeYolo(data,width,height,ratio,padX,padY) {
  let best=null,bestScore=-1;
  for(let offset=0;offset+57<=data.length;offset+=57){
    const confidence=data[offset+4];
    if(!(confidence>=.35)||data[offset+5]!==0)continue;
    const box=[(data[offset]-padX)/ratio,(data[offset+1]-padY)/ratio,(data[offset+2]-padX)/ratio,(data[offset+3]-padY)/ratio];
    const area=Math.max(0,Math.min(width,box[2])-Math.max(0,box[0]))*Math.max(0,Math.min(height,box[3])-Math.max(0,box[1]));
    const centre=Math.hypot((box[0]+box[2])/2/width-.5,(box[1]+box[3])/2/height-.5);
    const score=confidence*Math.sqrt(area/(width*height))*(1-.5*Math.min(1,centre));
    if(score<=bestScore)continue;
    const landmarks=[];
    for(let i=0;i<17;i++){
      const x=(data[offset+6+i*3]-padX)/ratio,y=(data[offset+7+i*3]-padY)/ratio;
      const inside=x>=0&&x<width&&y>=0&&y<height;
      landmarks.push({x:x/width,y:y/height,z:0,visibility:inside?data[offset+8+i*3]:0});
    }
    best={landmarks,world:null,width,height,coordinateSystem:'image-plane',detector:'yolo26s-pose'};bestScore=score;
  }
  return best;
}

export function detectorHasBody(result) {
  const L=result?.landmarks;if(!L)return false;
  const ids=L.length===17?YOLO_JOINTS:{nose:0,lsh:11,rsh:12,lel:13,rel:14,lwr:15,rwr:16,lhip:23,rhip:24,lkn:25,rkn:26,lank:27,rank:28};
  const visible=key=>L[ids[key]]&&(L[ids[key]].visibility??0)>=.5&&(L[ids[key]].presence??1)>=.5;
  return ['lsh','rsh','lhip','rhip'].every(visible)&&['lkn','rkn','lank','rank'].filter(visible).length>=3;
}

export async function createYoloDetector(modelUrl,notify=()=>{}) {
  notify('正在准备增强识别，请稍等；首次加载需要更多时间。');
  const base='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
  const ort=await import(base+'ort.wasm.min.mjs');
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=base;
  const session=await ort.InferenceSession.create(modelUrl,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(640,480):Object.assign(document.createElement('canvas'),{width:640,height:480});
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const pixels=new Float32Array(3*480*640),plane=480*640;
  return {async detect(source){
    const width=source.width||source.videoWidth||source.naturalWidth,height=source.height||source.videoHeight||source.naturalHeight;
    const ratio=Math.min(640/width,480/height),scaledWidth=Math.round(width*ratio),scaledHeight=Math.round(height*ratio);
    const padX=Math.round((640-scaledWidth)/2-.1),padY=Math.round((480-scaledHeight)/2-.1);
    context.fillStyle='rgb(114,114,114)';context.fillRect(0,0,640,480);
    context.drawImage(source,padX,padY,scaledWidth,scaledHeight);
    const rgba=context.getImageData(0,0,640,480).data;
    for(let i=0,j=0;i<plane;i++,j+=4){pixels[i]=rgba[j]/255;pixels[plane+i]=rgba[j+1]/255;pixels[2*plane+i]=rgba[j+2]/255;}
    const tensor=new ort.Tensor('float32',pixels,[1,3,480,640]);
    let outputs;
    try {
      outputs=await session.run({[session.inputNames[0]]:tensor});
      return decodeYolo(outputs[session.outputNames[0]].data,width,height,ratio,padX,padY);
    } finally { tensor.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose(); }
  },async close(){await session.release();}};
}
