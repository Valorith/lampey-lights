import test from "node:test";
import assert from "node:assert/strict";
import {sample,showSchema,defaultFixture} from "../lib/show.js";
import {defaultCable,cablePoints,controllerCords,routedPoints,routeLength,detachCables,aimAt,beamDirection,lampOrigin} from "../lib/stage.js";
import {mountedFixture,branchTip,dressings} from "../lib/garden.js";
test("legacy projects receive editable landscaping, including two trees near the street",()=>{
 const d=showSchema.parse(sample());assert.equal(d.plants.length,11);assert.equal(d.cables.length,0);
 assert.ok(d.plants.slice(-2).every(p=>p.point[0]<0&&p.point[2]>8));assert.deepEqual(showSchema.parse({...d,plants:[]}).plants,[]);
});
test("each plant mounting persists and follows the actual branch after resizing and moving",()=>{
 const d=showSchema.parse(sample()),[a,b]=d.plants.slice(-2);
 for(const dressing of Object.keys(dressings)){
  const f=mountedFixture({...defaultFixture(),dressing,plant:a.id,endPlant:b.id,branchA:0,branchB:4,drop:.8,turns:6},d.plants);
  assert.ok(f.points.length>=2);showSchema.parse({...d,fixtures:[f]});
  const updated=mountedFixture(f,d.plants.map(p=>p.id===a.id?{...p,point:[1,0,0],height:8,width:5}:p));assert.notDeepEqual(f.points,updated.points);
  if(dressing==="hang"){assert.ok(f.points.at(-1).every((n,i)=>Math.abs(n-branchTip(b,4)[i])<1e-4));assert.ok(f.points[16][1]<(f.points[0][1]+f.points.at(-1)[1])/2)}
 }
});
test("a flood aimed at a clicked target projects on the same axis",()=>{
 const f={points:[[0,1,3]]},p=[2,6,-4],dir=beamDirection(aimAt(f,p)),o=lampOrigin(f),delta=p.map((v,i)=>v-o[i]),d=Math.hypot(...delta);
 assert.ok(dir.reduce((n,v,i)=>n+v*delta[i]/d,0)>.9998);
});
test("controller flow follows only connected power or pixel outputs, switches off without erasing cord",()=>{
 const d=showSchema.parse(sample()),box=d.devices[0],f=d.fixtures[0];d.fixtures=[f];const c={...defaultCable("pixel"),from:"d/"+box.id,to:"f/"+f.id,output:f.port,points:[[0,0,0],[3,4,1],[5,6,7]],style:"hanging",sag:.65};d.cables=[c,{...c,id:"lan",kind:"ethernet"}];showSchema.parse(d);
 const [r]=controllerCords(d,box.id);assert.equal(controllerCords(d,box.id).length,1);assert.ok(r.active);assert.ok(r.points.length>3);assert.deepEqual(r.points.at(-1),f.points[0]);assert.deepEqual(controllerCords(d,"unplaced"),[]);
 box.offPorts=[f.port];assert.equal(controllerCords(d,box.id)[0].active,false);assert.deepEqual(controllerCords(d,box.id)[0].points,r.points);
 const moved={...d,devices:[{...box,point:[7,2,3]}]};assert.notDeepEqual(cablePoints(c,moved)[0],r.points[0]);
 const removed={...d,devices:[]};const kept=detachCables(d,removed)[0];assert.equal(kept.from,"");assert.deepEqual(kept.points[0],r.points[0]);assert.deepEqual(kept.points.at(-1),f.points[0]);
});
test("a placed, patched pixel output gets one estimated cord until explicitly traced; unused ports get none",()=>{
 const d=showSchema.parse(sample()),box=d.devices[0];d.fixtures=d.fixtures.slice(0,1);
 let [r]=controllerCords(d,box.id);assert.ok(r.c.inferred);assert.equal(r.port,1);assert.equal(controllerCords(d,box.id).length,1);
 d.fixtures[0].autoCord=false;assert.equal(controllerCords(d,box.id).length,0);
 delete d.fixtures[0].autoCord;d.cables=[{...r.c,id:"surveyed",inferred:undefined,style:"corners"}];assert.equal(controllerCords(d,box.id)[0].c.id,"surveyed");
 d.devices[0].offPorts=[1];assert.equal(controllerCords(d,box.id)[0].active,false);
});
test("rounded and draped curves retain both terminals and differ in physical length",()=>{
 const p=[[0,2,0],[2,2,2],[2,3,4]];const a=routedPoints(p,"smooth"),b=routedPoints(p,"hanging",1);
 assert.deepEqual(a[0],p[0]);assert.deepEqual(b.at(-1),p.at(-1));assert.ok(routeLength(a)<routeLength(p));assert.ok(routeLength(b)>routeLength(p));
});

