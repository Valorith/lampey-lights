import test from "node:test";
import assert from "node:assert/strict";
import {sample,showSchema,address,defaultDevice,defaultNet} from "../lib/show.js";
import {review} from "../lib/patch.js";
test("All mounted sample fixtures fit unique Pixie addresses",()=>{
 const s=showSchema.parse(sample());assert.deepEqual(review(s),[]);assert.equal(address(s.fixtures[1],s.devices[0],s.networks[0]),"02 · ch 1");
});
test("Double Unit ID port and split settings advance hex addresses",()=>{
 const s=sample(),d={...s.devices[0],unit:"1D",pixelLimit:200},n=s.networks[0],f={...s.fixtures[0],port:2,offset:171};
 assert.equal(address(f,d,n),"20 · ch 1");assert.equal(address({...f,offset:101},{...d,splitEvenly:true},n),"20 · ch 1");
 s.devices=[d,{...d,id:"collision",unit:"30"}];assert.ok(review(s).some(i=>i.message.includes("Unit 30 also used")));
});
test("Detect overlapping pixel offsets and all three analog RGB circuits",()=>{
 const s=sample();s.fixtures[1].port=1;assert.ok(review(s).some(i=>i.message.includes("Pixel range overlaps")));
 s.devices[0].model="cmb";s.fixtures=s.fixtures.slice(0,2);
 Object.assign(s.fixtures[0],{type:"rgb",port:2});Object.assign(s.fixtures[1],{type:"dc",port:5});
 assert.ok(review(s).some(i=>i.message.includes("Output circuit overlaps")));
});
test("Shared sACN universe detects a collision crossing the channel boundary",()=>{
 const s=sample();s.networks[0].protocol="sacn";s.devices[0].model="generic";s.fixtures=s.fixtures.slice(0,2);
 Object.assign(s.fixtures[0],{slot:508,count:3});Object.assign(s.fixtures[1],{universe:2,slot:1,count:1});
 assert.ok(review(s).some(i=>i.message.includes("Universe channels overlaps")));
});
test("Wireless pairing and network loops are checked independently",()=>{
 const n={...defaultNet(),protocol:"lor",speed:57600},tx={...defaultDevice(n.id),model:"tx"},rx={...defaultDevice(n.id),model:"rx",parent:tx.id,rf:0};
 const s={fixtures:[],networks:[n],devices:[tx,rx]};assert.ok(review(s).some(i=>i.message.includes("same RF channel")));
 rx.rf=tx.rf;assert.deepEqual(review(s),[]);tx.parent=rx.id;assert.ok(review(s).some(i=>i.message.includes("loop")));
});
test("An unplaced historical fixture preserves its prior patch",()=>{
 const s=sample();Object.assign(s.fixtures[0],{points:[],device:"",reference:"Box 1 Ch 1",state:"Needs check"});
 const design=showSchema.parse(s);assert.equal(design.fixtures[0].reference,"Box 1 Ch 1");assert.equal(review(design).filter(i=>i.id===s.fixtures[0].id).length,3);
});

