import * as T from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import {cabinetBottom,cabinetInlet,cabinetLead} from "../lib/controller-layout.js";

const rubber="#292929", collar="#424343", metal="#676b69";

// Bake each assembly into one colored mesh so the individual cords, hinges and
// connector heads don't each cost a draw call. Also supplies vertex colors to Canvas.
export function cabinetGeometry(spec,wall) {
 const parts=[];
 function part(geometry,position,color) {
  const g=geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  g.translate(...position);
  const tint=new T.Color(color), rgb=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<rgb.length;i+=3)tint.toArray(rgb,i);
  g.setAttribute("color",new T.BufferAttribute(rgb,3));
  parts.push(g);
 }
 function block(x,y,z,w,h,d,color,r=0) {
  part(r ? new RoundedBoxGeometry(w,h,d,1,r) : new T.BoxGeometry(w,h,d),[x,y,z],color);
 }
 function barrel(x,y,z,r,h,color) {
  part(new T.CylinderGeometry(r,r,h,8),[x,y,z],color);
 }
 function hose(points,r,color,segments=5) {
  const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  part(new T.TubeGeometry(path,segments,r,5,false),[0,0,0],color);
 }
 const {width:w,height:h,depth:d,style,finish,drop}=spec;
 const bottom=cabinetBottom(spec,wall), cy=bottom+h/2;
 const mini=style==="mini",ac=style==="ac";
 const rim=new T.Color(finish).multiplyScalar(.69);
 if(!wall){
  block(0,cy/2,0,.032,cy,.018,metal);
  block(0,cy,.004,w*.70,h*.74,.009,"#737875");
 }
 block(0,cy,d*.36,w*.97,h*.98,d*.72,rim,.009);
 block(0,cy,d*.70,w*.98,h*.985,.005,"#4e504a",.002);
 block(0,cy,d*.845,w,h,d*.31,finish,Math.min(.014,d*.13));
 for(const sign of [-1,1]){
  const y=cy+h*.29*sign;
  if(!mini){
   barrel(-w*.487,y,d*.67,.007,h*.15,rim);
   block(w*.495,y,d*.63,.013,.031,.021,rim,.003);
   block(w*.504,y,d*.64,.006,.016,.013,metal,.002);
  }else{
   for(const side of [-1,1])block(w*.43*side,y,d+.0005,.005,.005,.001,"#333c37");
  }
 }
 if(ac){
  for(const offset of [-.022,0,.022])block(0,cy+offset*h,d,w*.91,.0016,.0018,rim);
 }else if(style==="wave"){
  for(const offset of [0,.038]){
   hose([[w*(.08+offset),cy+h*.46,d],[w*(.16+offset),cy+h*.19,d],
    [w*(.04+offset),cy-h*.22,d],[w*(.12+offset),cy-h*.46,d]],.0018,rim,14);
  }
 }else if(!mini){
  block(0,cy,d-.0003,w*.90,h*.925,.003,finish,.0014);
 }else block(0,cy+.18*h,d,w*.9,.0015,.0016,rim);

 const dir=mini?1:-1;
 for(let i=0;i<spec.outputs;i++){
  const {start,bend,end}=cabinetLead(spec,i,wall);
  const [x,y,z]=end,head=ac?.030:.026;
  const neck=[x,y-dir*head,z];
  hose([start,bend,neck],ac?.0034:.0027,rubber);
  if(ac){
   block(x,y-dir*head/2,z,.018,head,.014,rubber,.003);
   for(const side of [-1,1])block(x+side*.0035,y,z,.0016,.001,.005,"#111211");
  }else{
   barrel(x,y-dir*head/2,z,.0056,head,rubber);
   barrel(x,y-dir*.007,z,.008,.011,collar);
   barrel(x,y-dir*.0009,z,.0048,.002,"#181b1a");
  }
 }
 const [ix,iy,iz]=cabinetInlet(spec,wall);
 barrel(ix,iy+.001,iz,.009,.009,collar);
 // Bundled mains tails hang off the opposite side from the AC output bank.
 const feeds=ac?2:1, hang=mini?.048:drop*.79;
 for(let j=0;j<feeds;j++){
  const x=ix+j*.017, z=iz+.016+j*.010;
  hose([[x,bottom,z],[x-w*.05,bottom-hang*.71,z],[x-w*.17,bottom-hang,z+.011],
   [x-w*.24,bottom-hang*.52,z+.023],[x-w*.16,bottom-hang*.28,z+.027]],.0038,rubber,13);
  block(x-w*.16,bottom-hang*.28,z+.027,.016,.024,.012,rubber,.003);
 }
 const merged=mergeGeometries(parts);
 merged.computeBoundingSphere();
 return merged;
}
