import * as T from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import {branchTip} from "../lib/garden.js";
export function plantMesh(p){
 const group=new T.Group(),parts=new Map(),base=new T.Vector3(...p.point),up=new T.Vector3(0,1,0);
 function append(g,color){if(!parts.has(color))parts.set(color,[]);parts.get(color).push(g)}
 function limb(a,b,r,s){const delta=b.clone().sub(a);const g=new T.CylinderGeometry(s,r,delta.length(),6);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(up,delta.normalize()));const m=a.clone().lerp(b,.5);append(g.translate(m.x,m.y,m.z),"#625448")}
 const h=p.height,w=p.width;
 if(p.kind==="deciduous"){
  const local=(x,y,z)=>new T.Vector3(x,y,z);
  const joint=local(0,h*.40,0);limb(local(0,0,0),joint,w*.036,w*.028);
  limb(joint,local(.025*w,h,0),w*.030,w*.004);
  for(let i=0;i<8;i++){
   const tip=new T.Vector3(...branchTip(p,i)).sub(base),k=local(tip.x*.39,h*(.54+i%2*.04),tip.z*.39);
   limb(joint,k,w*.025,w*.018);limb(k,tip,w*.018,w*.003);
   for(let j=0;j<3;j++){const t=(j+1)/4,b=k.clone().lerp(tip,t),v=b.clone().add(local(tip.x*.14+tip.z*(j%2?.18:-.16),h*(.10+.04*j),tip.z*.14-tip.x*(j%2?.18:-.16)));
    limb(b,v,w*.009,w*.002);const a=b.clone().lerp(v,.55);limb(a,v.clone().add(local(-tip.z*.1,h*.045,tip.x*.1)),w*.004,w*.001)}
  }
 }else if(p.kind==="evergreen"){
  limb(new T.Vector3(),new T.Vector3(0,h*.8,0),w*.035,w*.016);
  for(let i=0;i<4;i++){const t=i*.18,g=new T.ConeGeometry(w*.51*(1-t),h*(.55-t*.2),11);g.rotateY(i*.62);append(g.translate(0,h*(t+.27-t*.10),0),["#314e40","#3a5c49","#43664d","#506f54"][i])}
 }else{
  for(let i=0;i<6;i++){const a=i*2.4,g=new T.IcosahedronGeometry(1,1),r=i===5?0:w*.23;
   g.rotateY(a);g.scale(w*(i===5?.36:.28),h*(i===5?.53:.39),w*(i===5?.36:.28));
   append(g.translate(Math.cos(a)*r,h*(i===5?.48:.38),Math.sin(a)*r),i%2?"#566b48":"#496346")}
 }
 for(const [color,geos] of parts){const geometry=mergeGeometries(geos);geos.forEach(g=>g.dispose());group.add(new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:1,flatShading:true})))}
 group.position.copy(base);group.userData.entity=p.id;group.updateMatrixWorld(true);return group;
}

