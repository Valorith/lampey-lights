import test from "node:test";
import assert from "node:assert/strict";
import {defaultFixture,sample,showSchema,wirePoints} from "../lib/show.js";
import {mountedFixture} from "../lib/garden.js";
import {aimAt,beamDirection,cablePoints,defaultCable,lampOrigin,outputPoint} from "../lib/stage.js";
import {moveProp,rotateProp,scaleProp,sceneProp,updateProp} from "../lib/prop-transform.js";

test("existing props start unlocked and locks survive a saved-show round trip",()=>{
 const design=showSchema.parse(sample());
 for(const row of [design.plants[0],design.devices[0],design.fixtures.at(-1)]){
  const prop=sceneProp(design,row.id);
  assert.equal(prop.row.locked,false);
  const saved=showSchema.parse(JSON.parse(JSON.stringify(updateProp(design,prop.group,{...row,locked:true}))));
  const locked=sceneProp(saved,row.id);
  assert.equal(locked.row.locked,true);
  assert.equal(moveProp(locked,[5,1,0],[0,1,0]),locked.row);
  assert.equal(scaleProp(locked,1.5),locked.row);
  assert.equal(rotateProp(locked,15),locked.row);
 }
 assert.equal(sceneProp(design,design.fixtures[0].id),null);
});

const closeVector=(a,b,tolerance=1e-8)=>assert.ok(Math.hypot(...a.map((n,i)=>n-b[i]))<tolerance);
test("a mounted prop turns about its surface normal with cables and lenses attached",()=>{
 const design=showSchema.parse(sample());
 const base=[2,3,4],normal=[0,0,1];
 const box={...design.devices[0],point:base,normal};
 const turned=rotateProp({row:box},-270);
 assert.equal(turned.rotation,90);
 const at=outputPoint(box,3);
 closeVector(outputPoint(turned,3),[base[0]-(at[1]-base[1]),base[1]+at[0]-base[0],at[2]]);
 assert.equal(showSchema.parse({...design,devices:[turned]}).devices[0].rotation,90);
 for(const shape of ["arch","tree","wreath","star","net","matrix","icicles","cane"]){
  const f={...defaultFixture(),points:[base],normal,shape};
  const original=wirePoints(f),rotated=wirePoints(rotateProp({row:f},90));
  original.forEach(([x,y,z],i)=>closeVector(rotated[i],[base[0]-(y-base[1]),base[1]+x-base[0],z]));
 }
 const flood={points:[base],shape:"flood",normal,pitch:0,yaw:90,rotation:90};
 closeVector(beamDirection(flood),[0,1,0]);
 const target=lampOrigin(flood).map((v,i)=>v+[0,0,5][i]);
 closeVector(beamDirection(aimAt(flood,target)),[0,0,1]);
});

test("rotating a planted tree moves its branch mount and keeps the far tree anchored",()=>{
 let design=showSchema.parse(sample());
 const [a,b]=design.plants;
 const strand=mountedFixture({...defaultFixture(),plant:a.id,endPlant:b.id,dressing:"hang"},design.plants);
 design=updateProp(design,"fixtures",strand);
 const plant=rotateProp(sceneProp(design,a.id),-15);
 assert.equal(plant.rotation,345);
 assert.deepEqual(plant.point,a.point);
 assert.equal(rotateProp({row:plant},15).rotation,0);
 const result=updateProp(design,"plants",plant).fixtures.at(-1);
 assert.notDeepEqual(result.points[0],strand.points[0]);
 assert.deepEqual(result.points.at(-1),strand.points.at(-1));
});

test("tree scale preserves proportions and moving either tree moves its hanging lights",()=>{
 let design=showSchema.parse(sample());
 const [a,b]=design.plants;
 const fixture=mountedFixture({...defaultFixture(),plant:a.id,endPlant:b.id,dressing:"hang"},design.plants);
 design=updateProp(design,"fixtures",fixture);
 const scaled=scaleProp(sceneProp(design,a.id),1000);
 assert.ok(scaled.height<=22&&scaled.width<=16);
 assert.ok(Math.abs(scaled.width/scaled.height-a.width/a.height)<1e-8);
 design=updateProp(design,"plants",scaled);
 const resized=design.fixtures.at(-1);
 assert.notDeepEqual(resized.points[0],fixture.points[0]);
 assert.deepEqual(resized.points.at(-1),fixture.points.at(-1));
 design=updateProp(design,"plants",moveProp(sceneProp(design,b.id),[6,0,7]));
 assert.notDeepEqual(design.fixtures.at(-1).points.at(-1),resized.points.at(-1));
 assert.deepEqual(design.fixtures.at(-1).points[0],resized.points[0]);
});

test("equipment sockets move and scale while hand-routed cable bends keep their positions",()=>{
 let design=showSchema.parse(sample());
 const box=design.devices[0],fixture=design.fixtures.at(-1),bend=[1,2,3];
 const cord={...defaultCable("pixel"),from:"d/"+box.id,to:"f/"+fixture.id,output:2,points:[box.point,bend,fixture.points[0]]};
 design=updateProp(design,"devices",scaleProp(sceneProp(design,box.id),2));
 assert.notDeepEqual(cablePoints(cord,design)[0],outputPoint(box,2));
 design=updateProp(design,"devices",moveProp(sceneProp(design,box.id),[5,2,0],[0,0,1]));
 design=updateProp(design,"fixtures",moveProp(sceneProp(design,fixture.id),[3,0,4],[0,1,0]));
 assert.deepEqual(cablePoints(cord,design),[outputPoint(design.devices[0],2),bend,[3,0,4]]);
 assert.equal(scaleProp(sceneProp(design,fixture.id),.001).size,.1);
});
