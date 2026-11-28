import test from "node:test";
import assert from "node:assert/strict";
import {BoxGeometry,Mesh} from "three";
import {defaultFixture,sample,showSchema} from "../lib/show.js";
import {mountedFixture} from "../lib/garden.js";
import {defaultCable} from "../lib/stage.js";
import {copyRows,moveRows,nextName,pasteRows,removeRows,selectionCentre} from "../lib/selection.js";
import {lineHandles} from "../lib/line-handles.js";
import {propertySurface} from "../lib/surface-fit.js";
import {bindPropGestures} from "../components/prop-gestures.js";

let n=0;const makeId=()=>"new-"+(++n);
const prop=(design,over={})=>({...defaultFixture(),id:"prop-"+(++n),name:"Star",shape:"star",mount:"",points:[[1,0,4]],normal:[0,1,0],device:design.devices[0].id,...over});

test("copy and paste at the cursor makes unpatched, unlocked copies with fresh names",()=>{
 const design=showSchema.parse(sample()),star=prop(design,{locked:true});design.fixtures.push(star);
 const clip=copyRows(design,[star.id]);
 const {design:next,ids}=pasteRows(design,clip,{to:[3,2,1],normal:[0,0,1],makeId});
 assert.equal(ids.length,1);
 const copy=next.fixtures.find(f=>f.id===ids[0]);
 assert.deepEqual(copy.points,[[3,2,1]]);assert.deepEqual(copy.normal,[0,0,1]);
 assert.equal(copy.device,"");assert.equal(copy.locked,false);assert.equal(copy.name,"Star 2");
 const box=design.devices[0],again=pasteRows(design,copyRows(design,[box.id]),{offset:[1,0,0],makeId}).design.devices.at(-1);
 assert.notEqual(again.unit,box.unit);assert.equal(again.ip,"");assert.equal(again.net,box.net);
 assert.equal(nextName("Porch bush 2",["Porch bush 1","Porch bush 2","Porch bush 3"]),"Porch bush 4");
 assert.ok(showSchema.parse(next));
 // The clipboard is a snapshot; editing the original afterwards does not change it.
 star.points[0][0]=99;assert.equal(clip.items[0].row.points[0][0],1);
});

test("a group pastes with its layout, and a copied plant brings its mounted lights",()=>{
 const design=showSchema.parse(sample()),[a]=design.plants;
 const lights=mountedFixture({...defaultFixture(),id:"wrap",plant:a.id,endPlant:a.id,dressing:"wrap",count:40},design.plants);
 design.fixtures.push(lights);
 const star=prop(design);design.fixtures.push(star);
 const clip=copyRows(design,[a.id,star.id]);
 assert.equal(clip.items.length,3);
 const offset=[2,0,0],{design:next,ids}=pasteRows(design,clip,{offset,makeId});
 assert.equal(ids.length,3);
 const plant=next.plants.find(p=>ids.includes(p.id)),copy=next.fixtures.find(f=>ids.includes(f.id)&&f.shape==="star"),wrap=next.fixtures.find(f=>ids.includes(f.id)&&f.plant);
 assert.deepEqual(plant.point,a.point.map((v,i)=>v+offset[i]));
 assert.deepEqual(copy.points[0],star.points[0].map((v,i)=>v+offset[i]));
 assert.equal(wrap.plant,plant.id);
 assert.ok(Math.abs(wrap.points[0][0]-lights.points[0][0]-2)<1e-6);
 assert.ok(showSchema.parse(next));
});

test("paste respects show limits and moving a group leaves locked items in place",()=>{
 const design=showSchema.parse(sample());
 const full={...design,plants:Array.from({length:150},(_,i)=>({...design.plants[0],id:"p"+i}))};
 assert.match(pasteRows(full,copyRows(full,["p0"]),{offset:[1,0,0]}).error,/150/);
 const a=prop(design),b=prop(design,{locked:true});design.fixtures.push(a,b);
 const moved=moveRows(design,[a.id,b.id],[0,1,0]);
 assert.deepEqual(moved.fixtures.find(f=>f.id===a.id).points[0],[1,1,4]);
 assert.equal(moved.fixtures.find(f=>f.id===b.id),b);
 assert.deepEqual(selectionCentre(design,[a.id,b.id]),[1,0,4]);
});

test("removing several items detaches cables and unpatches lights like a single remove",()=>{
 const design=showSchema.parse(sample()),box=design.devices[0],f=design.fixtures[0];
 design.cables=[{...defaultCable("pixel"),from:"d/"+box.id,to:"f/"+f.id,points:[[0,0,0],[1,0,0]]}];
 const next=removeRows(design,[{group:"devices",row:box},{group:"plants",row:design.plants[0]}]);
 assert.ok(!next.devices.some(d=>d.id===box.id));
 assert.ok(next.fixtures.filter(x=>x.device===box.id).length===0);
 assert.equal(next.cables[0].from,"");
 assert.equal(next.plants.length,design.plants.length-1);
});

test("grab dots sit on each bend, with insert dots spread along the fitted route",()=>{
 const points=[[0,0,0],[4,0,0],[4,0,.1]];
 const path=[[0,0,0],[2,1,0],[4,0,0],[4,0,.1]];
 const handles=lineHandles(points,path,{fixed:[0]});
 assert.deepEqual(handles.filter(h=>h.kind==="point").map(h=>[h.index,h.fixed]),[[0,true],[1,false],[2,false]]);
 const inserts=handles.filter(h=>h.kind==="insert");
 assert.ok(inserts.length>=3&&inserts.every(h=>h.index===1));
 // In-between dots follow the drawn route, not the straight chord.
 assert.ok(inserts.some(h=>h.point[1]>.5));
 assert.equal(lineHandles(points,path,{insertable:false}).length,3);
});

test("a dot near a wall tucks into the base of the wall",()=>{
 const ground=new Mesh(new BoxGeometry(10,.2,10));ground.position.set(0,-.1,0);ground.updateMatrixWorld();
 const wall=new Mesh(new BoxGeometry(10,3,.3));wall.position.set(0,1.5,-1);wall.updateMatrixWorld();
 const surface=propertySurface([ground,wall]);
 const onGround=surface.crease([0,.045,-.6],[0,1,0]);
 assert.ok(onGround,"finds the wall");
 assert.ok(Math.abs(onGround.point[2]-(-.85))<.06,"against the wall face");
 assert.ok(onGround.point[1]>0&&onGround.point[1]<.1,"on the ground");
 const onWall=surface.crease([2,.3,-.805],[0,0,1]);
 assert.ok(onWall&&onWall.point[1]<.1&&Math.abs(onWall.point[2]-onGround.point[2])<.01);
 assert.equal(surface.crease([0,.045,3],[0,1,0]),null);
});

test("a plain drag orbits; Ctrl + drag moves the prop",()=>{
 const surface=new EventTarget(),viewport=new EventTarget();viewport.dataset={};
 surface.setPointerCapture=()=>{};surface.hasPointerCapture=()=>false;surface.releasePointerCapture=()=>{};
 globalThis.window=new EventTarget();globalThis.cancelAnimationFrame=()=>{};
 const row={id:"a",locked:false},grabs=[];
 const dispose=bindPropGestures(surface,viewport,{selected:()=>null,grab:()=>{grabs.push(1);return {prop:{row},offset:{x:0,y:0}}},select:()=>{},place:()=>null,preview:()=>{},commit:()=>{}});
 const press=(over)=>{const e=new Event("pointerdown",{cancelable:true});Object.assign(e,{isPrimary:true,button:0,pointerId:1,clientX:0,clientY:0,pointerType:"mouse",shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,...over});surface.dispatchEvent(e);const up=new Event("pointerup");Object.assign(up,{pointerId:1});surface.dispatchEvent(up);return e.defaultPrevented};
 try{
  assert.equal(press({}),false);assert.equal(grabs.length,0);
  assert.equal(press({ctrlKey:true}),true);
  assert.equal(press({metaKey:true}),true);
  assert.equal(press({ctrlKey:true,shiftKey:true}),false);
  assert.equal(press({pointerType:"touch"}),false,"touch only drags the selected prop");
 }finally{dispose();delete globalThis.window;delete globalThis.cancelAnimationFrame}
});
