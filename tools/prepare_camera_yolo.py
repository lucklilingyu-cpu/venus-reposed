"""Store FP16 convolution weights with FP32 casts; browser computation stays FP32."""
import argparse
import sys
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--packages',type=Path)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'assets/camera/yolo26s-pose-camera.onnx')
args=parser.parse_args()
if args.packages: sys.path.insert(0,str(args.packages))
import numpy as np
import onnx
from onnx import numpy_helper, helper, TensorProto
model=onnx.load(str(args.source)); casts=[]; compressed=0
for initializer in model.graph.initializer:
    if initializer.data_type != TensorProto.FLOAT: continue
    array=numpy_helper.to_array(initializer)
    if array.size < 256 or not np.isfinite(array).all() or np.max(np.abs(array))>65000: continue
    original=initializer.name; name=original+'__camera_fp16'
    initializer.CopyFrom(numpy_helper.from_array(array.astype(np.float16),name=name))
    casts.append(helper.make_node('Cast',[name],[original],name=original+'__camera_restore',to=TensorProto.FLOAT))
    compressed+=1
nodes=list(model.graph.node); del model.graph.node[:]; model.graph.node.extend(casts+nodes)
model.doc_string += '\nCamera transport optimization: selected FP32 weights stored as FP16, restored by Cast to FP32 before compute. Not retrained.'
onnx.checker.check_model(model)
args.output.parent.mkdir(parents=True,exist_ok=True);onnx.save(model,str(args.output))
print(f'Prepared {compressed} compact weight tensors; {args.output.stat().st_size} bytes; FP32 graph computations.')
