import {readFileSync,writeFileSync} from "node:fs";
import {Box3} from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
const asset=new URL("../public/property.glb",import.meta.url);
const bytes=readFileSync(asset);
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
scene.updateMatrixWorld(true);
const frames=[];
scene.traverse(obj=>{
 if(!/^(Upper_front_window_\d+|Porch_window_\d+|(Left|Right|Rear)_window_\d+|Dormer_sash_(left|right)|Rear_room_(side|garden)_sash_\d+)$/.test(obj.name))return;
 const glass=obj.children.find(m=>m.material?.name==="Blue grey glazing");
 if(!glass)throw Error("Missing glazing for "+obj.name);
 const bounds=new Box3().setFromObject(obj),pane=new Box3().setFromObject(glass);
 const side=/^(Left|Right)|Rear_room_side/.test(obj.name),axis=side?0:2;
 const sign=/^(Left|Rear)/.test(obj.name)?-1:1;
 const v=vec=>vec.toArray().map(n=>Number(n.toFixed(5)));
 frames.push({id:"window."+obj.name.toLowerCase().replaceAll("_","."),name:obj.name.replaceAll("_"," "),axis,sign,min:v(bounds.min),max:v(bounds.max),paneMin:v(pane.min),paneMax:v(pane.max)});
});
if(!frames.length)throw Error("No window frames in property asset");
const contents=JSON.stringify(frames,null,1)+"\n",url=new URL("../lib/window-frames.json",import.meta.url);
if(process.argv.includes("--check")){if(readFileSync(url,"utf8").replaceAll("\r\n","\n")!==contents)throw Error("Window mount data differs from property GLB")}else writeFileSync(url,contents);
console.log(frames.length+" measured window mounts");

