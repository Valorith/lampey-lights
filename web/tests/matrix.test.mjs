import test from "node:test";
import assert from "node:assert/strict";
import {sample,showSchema,address} from "../lib/show.js";
import {applyPatch,channelRange,planPatch,matrixGroups} from "../lib/matrix.js";
import {defaultCable,controllerCords,cablePoints,outputPoint} from "../lib/stage.js";
import {review} from "../lib/patch.js";

const design=()=>showSchema.parse(sample());
test("The matrix labels both ends of a pixel strand across Unit IDs and universes",()=>{
 const s=design(),box=s.devices[0],f={...s.fixtures[0],offset:169,count:4};
 box.pixelLimit=340;
 assert.equal(channelRange(f,box,s.networks[0]),"01 · ch 505–02 · ch 6");
 s.networks[0].protocol="sacn";f.slot=508;
 assert.equal(channelRange(f,box,s.networks[0]),"U1 · ch 508–U2 · ch 9");
});
test("Shared pixel port picks a contiguous gap, keeps existing strands and respects capacity",()=>{
 const s=design(),[a,b]=s.fixtures,box=s.devices[0];
 const plan=planPatch(s,b.id,box.id,1);
 assert.equal(plan.fixture.offset,91);
 const next=applyPatch(s,plan.fixture);
 assert.deepEqual(review(next),[]);
 assert.deepEqual(matrixGroups(next).groups[0].outputs.get(1).map(f=>f.id),[a.id,b.id]);
 assert.equal(s.fixtures[1].port,2);
 box.pixelLimit=100;
 assert.match(planPatch(s,b.id,box.id,1).error,/no free run/);
});
test("Resizing, readdressing and changing hardware derives the matrix from the saved box",()=>{
 const s=design(),box=s.devices[0];
 box.model="pixie4";box.unit="A0";
 assert.deepEqual(matrixGroups(s).groups[0].overflow.map(f=>f.port),[5,6,7,8]);
 assert.equal(address(s.fixtures[2],box,s.networks[0]),"A2 · ch 1");
 box.model="generic";box.portCount=2;
 assert.equal(matrixGroups(s).groups[0].model.ports,2);
 box.model="switch";
 assert.equal(matrixGroups(s).loose.length,8);
});
test("AC, dumb RGB and DMX respect circuit occupancy, grouping and type",()=>{
 const s=design(),box=s.devices[0],[a,b]=s.fixtures;s.fixtures=[a,b];
 box.model="cmb";Object.assign(a,{type:"rgb",port:2});Object.assign(b,{type:"dc",port:1});
 assert.deepEqual([...matrixGroups(s).groups[0].outputs.keys()],[4,5,6,1]);
 assert.match(planPatch(s,b.id,box.id,6).error,/already used/);
 assert.match(planPatch(s,a.id,box.id,2).error,/RGB groups/);
 assert.equal(planPatch(s,a.id,box.id,7).fixture.port,3);
 box.model="ac8";assert.match(planPatch(s,a.id,box.id,1).error,/light type/);
 box.model="dmx";s.networks[0].protocol="dmx";a.slot=7;
 assert.equal(planPatch(s,b.id,box.id,300).fixture.slot,300);
 assert.match(planPatch(s,a.id,box.id,512).error,/consecutive/);
});
test("sACN pixel moves choose free network slots across universe boundaries and boxes",()=>{
 const s=design(),box=s.devices[0],[a,b]=s.fixtures;s.fixtures=[a,b];
 box.model="generic";s.networks[0].protocol="sacn";
 const box2={...box,id:"second"};s.devices.push(box2);
 Object.assign(a,{slot:1,count:170});
 const next=applyPatch(s,planPatch(s,b.id,box2.id,4).fixture);
 assert.equal(next.fixtures[1].universe,2);assert.equal(next.fixtures[1].slot,1);
 assert.deepEqual(review(next),[]);
});
test("Repatching preserves hand-drawn leads, including reverse endpoints, through save and unpatch",()=>{
 const s=design(),a=s.fixtures[0],box=s.devices[0],box2={...box,id:"other",unit:"30",point:[2,1,3]};
 s.devices.push(box2);
 s.cables=[{...defaultCable("pixel"),from:"f/"+a.id,to:"d/"+box.id,output:1,slackFt:4,points:[a.points[0],[4,4,4],box.point]}];
 const loose=showSchema.parse(applyPatch(s,planPatch(s,a.id,"",0).fixture));
 assert.equal(loose.cables[0].to,"");assert.ok(loose.cables[0].detachedLead);
 const next=applyPatch(loose,planPatch(loose,a.id,box2.id,5).fixture);
 assert.equal(next.cables[0].output,5);assert.equal(next.cables[0].slackFt,4);
 assert.deepEqual(cablePoints(next.cables[0],next).at(-1),outputPoint(box2,5));
 assert.deepEqual(next.cables[0].points[1],[4,4,4]);
 assert.equal(controllerCords(next,box2.id).length,1);
 assert.equal(controllerCords(next,box.id).some(c=>c.fx.id===a.id),false);
});
