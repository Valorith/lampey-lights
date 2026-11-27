import test from "node:test";
import assert from "node:assert/strict";
import {sample,showSchema,address} from "../lib/show.js";
import {applyPatch,channelRange,planPatch,planSwap,matrixGroups,portLoad,labelOutput,outputLabel,fixtureLocation,fillLabels,locationSuggestions} from "../lib/matrix.js";
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
test("Dropping on an occupied output swaps the two fixtures or bumps the occupant",()=>{
 const s=design(),box=s.devices[0],[a,b]=s.fixtures;s.fixtures=[a,b];
 box.model="ac16";Object.assign(a,{type:"ac",port:1});Object.assign(b,{type:"ac",port:2});
 assert.match(planPatch(s,a.id,box.id,2).error,/already used/);
 const swap=planSwap(s,a.id,box.id,2);
 assert.equal(swap.other.id,b.id);assert.equal(swap.replaced,false);
 assert.deepEqual(swap.show.fixtures.map(f=>f.port),[2,1]);
 assert.deepEqual(review(swap.show).filter(i=>i.level==="error"),[]);
 s.fixtures[0]={...a,device:""};
 const bump=planSwap(s,a.id,box.id,2);
 assert.equal(bump.replaced,true);
 assert.deepEqual(bump.show.fixtures.map(f=>[f.device,f.port]),[[box.id,2],["",2]]);
 assert.equal(planSwap(s,a.id,box.id,5),null);
});
test("Pixel port load sums strands against the port's pixel limit",()=>{
 const s=design(),[a,b]=s.fixtures;
 const next=applyPatch(s,planPatch(s,b.id,s.devices[0].id,1).fixture);
 const load=portLoad(matrixGroups(next).groups[0],1,next.networks[0]);
 assert.equal(load.limit,170);assert.equal(load.used,a.count+b.count);
 assert.deepEqual(load.segments.map(x=>[x.f.id,x.start,x.end]),[[a.id,1,90],[b.id,91,122]]);
});
test("Output location labels stay on the channel, survive a save and reach the patch export",()=>{
 const s=design(),box=s.devices[0],f=s.fixtures[0];
 assert.deepEqual(box.labels,{});
 let next=labelOutput(s,box.id,1,"  Front eave  ");
 assert.equal(outputLabel(next.devices[0],1),"Front eave");
 assert.equal(labelOutput(next,box.id,1,"Front eave"),next);
 next=showSchema.parse(JSON.parse(JSON.stringify(next)));
 assert.equal(fixtureLocation(next.fixtures[0],next),"Front eave");
 const moved=applyPatch(next,planPatch(next,f.id,box.id,9).fixture);
 assert.equal(outputLabel(moved.devices[0],1),"Front eave");
 assert.equal(fixtureLocation(moved.fixtures[0],moved),"");
 assert.deepEqual(labelOutput(next,box.id,1,"").devices[0].labels,{});
});
test("Filling labels names only unlabeled outputs after their fixtures",()=>{
 const s=labelOutput(design(),"porch-box",2,"Dormer feed");
 const {show,count}=fillLabels(s);
 assert.equal(count,7);
 assert.equal(outputLabel(show.devices[0],2),"Dormer feed");
 assert.equal(outputLabel(show.devices[0],1),"Upper roofline");
 assert.equal(fillLabels(show).count,0);
 assert.deepEqual(locationSuggestions(show,["Mine","Dormer feed"]).slice(0,2),["Mine","Dormer feed"]);
});
test("The build sheet shows every output, chains shared pixel ports and escapes names",async()=>{
 const {matrixDocument}=await import("../lib/matrix-print.js");
 const s=design(),box=s.devices[0],[a,b]=s.fixtures;
 let next=applyPatch(s,planPatch(s,b.id,box.id,1).fixture);
 next=labelOutput(next,box.id,1,"Front <eave>");
 next.fixtures=next.fixtures.map(f=>f.id===a.id?{...f,name:"Roof & \"gutter\""}:f);
 next.devices[0]={...next.devices[0],offPorts:[16]};
 const html=matrixDocument(next,{generated:new Date(2026,10,27)});
 assert.match(html,/Roof &amp; &quot;gutter&quot;/);
 assert.match(html,/Front &lt;eave&gt;/);
 assert.doesNotMatch(html,/Front <eave>/);
 assert.match(html,/>P01</);assert.match(html,/>P16</);
 assert.match(html,/class="chain"/);
 assert.match(html,/Switched off/);
 // Untouched free outputs collapse into one row; the switched-off output stays on its own.
 assert.match(html,/>P09–15</);
 // Overview, matrix, one wiring page and the lid cards.
 assert.equal((html.match(/class="page"/g)||[]).length,4);
 assert.match(html,/class="lid"/);
});
test("Build sheet notes wrap on word boundaries inside the controller faceplate",async()=>{
 const {matrixDocument}=await import("../lib/matrix-print.js");
 const s=design();s.devices[0]={...s.devices[0],notes:"Mounted inside garage on the left wall behind the shelving"};
 const html=matrixDocument(s);
 assert.match(html,/<tspan x="34" dy="0">Mounted inside garage on<\/tspan><tspan x="34" dy="15">the left wall behind the<\/tspan>/);
});
