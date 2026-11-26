// Run from web/ after changing the planting geometry or its default proportions.
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import * as T from "three";
import sharp from "sharp";
import {plantCatalog} from "../lib/garden.js";
import {plantMesh} from "../components/plant-mesh.js";

const output=new URL("../public/plants/",import.meta.url);
await mkdir(output,{recursive:true});
const right=new T.Vector3(.91,0,-.42).normalize();
const direction=new T.Vector3(.42,.22,.91).normalize();
const up=new T.Vector3().crossVectors(direction,right).normalize();
const sun=new T.Vector3(-.5,.8,.55).normalize();
for(const [kind,preset] of Object.entries(plantCatalog)){
 const group=plantMesh({...preset,kind,id:kind,point:[0,0,0],rotation:0});
 const mesh=group.children[0],{position,color}=mesh.geometry.attributes;
 const points=Array.from({length:position.count},(_,i)=>new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));
 const plane=points.map(p=>[p.dot(right),-p.dot(up),p.dot(direction)]);
 const box=new T.Box3().setFromPoints(plane.map(p=>new T.Vector3(...p)));
 const size=box.getSize(new T.Vector3()),scale=Math.min(192/size.x,144/size.y);
 const xy=([x,y])=>[(110+(x-(box.min.x+box.max.x)/2)*scale).toFixed(2),(155+(y-box.max.y)*scale).toFixed(2)].join(",");
 const faces=[];
 for(let i=0;i<points.length;i+=3){
  const normal=new T.Vector3().subVectors(points[i+1],points[i]).cross(new T.Vector3().subVectors(points[i+2],points[i])).normalize();
  if(normal.dot(direction)<0)normal.negate();
  const fill=new T.Color().fromBufferAttribute(color,i).multiplyScalar(.89+.92*Math.max(0,normal.dot(sun))).getHexString();
  const tri=plane.slice(i,i+3);
  faces.push({depth:tri.reduce((sum,p)=>sum+p[2],0),path:'<polygon points="'+tri.map(xy).join(" ")+'" fill="#'+fill+'"/>'});
 }
 faces.sort((a,b)=>a.depth-b.depth);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="220" height="166">'+faces.map(f=>f.path).join("")+'</svg>';
 await sharp(Buffer.from(svg),{density:144}).resize(330,249).webp({quality:92,alphaQuality:95}).toFile(fileURLToPath(new URL(kind+".webp",output)));
}
