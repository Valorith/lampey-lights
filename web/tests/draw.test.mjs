import test from "node:test";
import assert from "node:assert/strict";
import {shapePath,planeBasis,wallYaw,lightCount,along,simplify,nearestOnPath,pathLength,seriesName,describe} from "../lib/draw-tools.js";
import {defaultFixture,showSchema,sample,wirePoints} from "../lib/show.js";
const near=(a,b,eps=1e-3)=>a.every((n,i)=>Math.abs(n-b[i])<eps);
const wall=[0,0,1],ground=[0,1,0];
test("shapes drawn on a wall stay on the wall and close where they should",()=>{
 const a=[1,2,3],b=[3,3.5,3];
 const rect=shapePath("rect",a,b,wall);assert.equal(rect.length,5);assert.deepEqual(rect[0],rect[4]);assert.ok(rect.every(p=>p[2]===3));
 assert.ok(near(rect[2],b));assert.ok(Math.abs(pathLength(rect)-7)<1e-3);
 const square=shapePath("rect",a,b,wall,{square:true});assert.ok(near(square[2],[3,4,3]));
 const circle=shapePath("circle",a,[1,3,3],wall);assert.ok(near(circle[0],circle.at(-1)));assert.ok(near(circle[0],[1,3,3]));
 for(const p of circle){assert.ok(Math.abs(Math.hypot(p[0]-1,p[1]-2)-1)<1e-3);assert.equal(p[2],3)}
 assert.deepEqual(shapePath("rect",a,a,wall),[]);assert.deepEqual(shapePath("circle",a,a,wall),[]);
});
test("an arch bows upward between its ends and a swag hangs below them",()=>{
 const a=[0,2,3],b=[2,2,3];
 const arch=shapePath("arc",a,b,wall,{rise:.5});assert.ok(near(arch[0],a));assert.ok(near(arch.at(-1),b));
 assert.ok(Math.abs(Math.max(...arch.map(p=>p[1]))-3)<1e-3);
 assert.ok(near(shapePath("arc",b,a,wall,{rise:.5})[10],arch[10].map((n,i)=>i?n:2-n),.02));
 const swag=shapePath("swag",a,b,wall,{drapes:4,sag:.25});assert.ok(near(swag[0],a));assert.ok(near(swag.at(-1),b));
 assert.ok(Math.abs(Math.min(...swag.map(p=>p[1]))-1.75)<1e-3);
 assert.equal(swag.filter(p=>Math.abs(p[1]-2)<1e-4).length,5);
 assert.ok(shapePath("swag",a,b,wall,{drapes:24}).length<=160);
});
test("shapes on level ground follow the viewer's right and stay level",()=>{
 const basis=planeBasis(ground,[0,0,-1]);assert.ok(near(basis.u,[0,0,-1]));assert.ok(near(basis.n,ground));
 const circle=shapePath("circle",[0,0,0],[2,0,0],ground,{right:[1,0,0]});assert.ok(circle.every(p=>Math.abs(p[1])<1e-6));
 const roof=planeBasis([0,.7071,.7071]);assert.ok(near(roof.u,[1,0,0]));assert.ok(roof.v[1]>0);
});
test("every shape saves as a strand the planner accepts",()=>{
 const d=showSchema.parse(sample());
 for(const tool of ["line","rect","circle","arc","swag"]){
  const points=shapePath(tool,[0,2,3],[1.6,3,3],wall,{drapes:6});assert.ok(points.length>=2&&points.length<=160,tool);
  showSchema.parse({...d,fixtures:[{...defaultFixture(),mount:"",points,normals:points.map(()=>wall),count:lightCount(pathLength(points),4)}]});
 }
});
test("spacing sets the lamp count and previews space lamps evenly",()=>{
 assert.equal(lightCount(3.048,12),11);assert.equal(lightCount(.01,24),2);assert.equal(lightCount(1e5,1),2048);assert.equal(lightCount(5,0),null);
 const dots=along([[0,0,0],[1,0,0],[1,1,0]],5);assert.equal(dots.length,5);assert.ok(near(dots[2],[1,0,0]));assert.ok(near(dots[4],[1,1,0]));
});
test("freehand sketches thin to their corners and snapping finds the nearest edge",()=>{
 const sketch=[];for(let i=0;i<=40;i++)sketch.push([i*.05,0,0]);for(let i=1;i<=40;i++)sketch.push([2,i*.05,.001*(i%2)]);
 const kept=simplify(sketch);assert.deepEqual(kept,[0,40,80]);
 const wavy=Array.from({length:600},(_,i)=>[i*.02,Math.sin(i*.3),0]);assert.ok(simplify(wavy,.001).length<=120);
 const hit=nearestOnPath([1,.4,0],[[0,0,0],[2,0,0],[2,2,0]]);assert.ok(near(hit.point,[1,0,0]));assert.ok(Math.abs(hit.distance-.4)<1e-9);assert.equal(hit.index,0);
});
test("names, readouts and wall-facing props",()=>{
 assert.equal(seriesName("Pixel strand",[]),"Pixel strand");assert.equal(seriesName("Pixel strand",["Pixel strand","Pixel strand 2"]),"Pixel strand 3");
 const longest="a".repeat(160);assert.equal(seriesName(longest,[longest]),longest.slice(0,158)+" 2");
 assert.equal(describe("rect",[[0,0,0],[1,1,0]],[0,0,0],[3.048,1.524,0],wall),"10.0 × 5.0 ft");
 assert.equal(wallYaw([1,0,0]),90);assert.equal(wallYaw([0,0,1]),0);assert.equal(wallYaw(ground),null);
 const wreath={...defaultFixture(),shape:"wreath",size:1,points:[[5,2,0]]};
 assert.ok(wirePoints(wreath).every(p=>p[2]===0));
 const turned=wirePoints({...wreath,yaw:90});assert.ok(turned.every(p=>Math.abs(p[0]-5)<1e-9));assert.ok(Math.max(...turned.map(p=>Math.abs(p[2])))>.49);
});
