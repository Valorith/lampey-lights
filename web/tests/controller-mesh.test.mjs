import test from "node:test";
import assert from "node:assert/strict";
import {Vector3} from "three";
import {cabinetGeometry} from "../components/controller-mesh.js";
import {cabinets,cabinetLead} from "../lib/controller-layout.js";
import {cablePoints,devicePoint,outputPoint} from "../lib/stage.js";

test("each rendered connector meets its routed lead on ground and wall mounts",()=>{
 for(const [model,spec] of Object.entries(cabinets))for(const wall of [false,true]){
  const geo=cabinetGeometry(spec,wall),pos=geo.attributes.position;
  const d={model,point:[2,1,4],normal:wall?[1,0,0]:[0,1,0],rotation:35,scale:1.5};
  geo.computeBoundingBox();
  assert.ok(wall?geo.boundingBox.min.z>=-.006:geo.boundingBox.min.y>=-.014,model);
  const probe=new Vector3();
  for(let i=0;i<spec.outputs;i++){
   const {end}=cabinetLead(spec,i,wall);
   assert.deepEqual(outputPoint(d,1+i*spec.channelsPerLead),devicePoint(d,...end));
   const anchor=new Vector3(...end);
   let distance=Infinity;
   for(let j=0;j<pos.count;j++)distance=Math.min(distance,probe.fromBufferAttribute(pos,j).distanceToSquared(anchor));
   assert.ok(distance<.006**2,model+" connector "+(i+1));
  }
  geo.dispose();
 }
});

test("CMB24D RGB port 8 and single-channel outputs 22 through 24 meet the eighth dangle",()=>{
 const d={id:"box",model:"cmb",point:[0,0,0]},f={id:"flood",type:"rgb",points:[[3,2,1]]};
 const design={devices:[d],fixtures:[f]},end=outputPoint(d,24);
 assert.deepEqual(outputPoint(d,22),end);
 assert.notDeepEqual(outputPoint(d,21),end);
 for(const reverse of [false,true]){
  const ends=reverse?["f/flood","d/box"]:["d/box","f/flood"];
  const path=cablePoints({from:ends[0],to:ends[1],output:8,points:[[0,0,0],[1,0,1],[0,0,0]]},design);
  assert.deepEqual(path[reverse?2:0],end);
 }
});
