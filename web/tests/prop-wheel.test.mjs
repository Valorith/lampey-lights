import test from "node:test";
import assert from "node:assert/strict";
import {bindPropGestures} from "../components/prop-gestures.js";

test("only a Ctrl-wheel over the scene can resize, and it consumes the entire event",()=>{
 const surface=new EventTarget(),viewport=new EventTarget();
 viewport.dataset={};
 let selected={row:{locked:false}},downstream=0;
 const factors=[];
 globalThis.window=new EventTarget();
 globalThis.cancelAnimationFrame=()=>{};
 let wheelListener,options;
 const original=viewport.addEventListener.bind(viewport);
 viewport.addEventListener=(name,listener,opts)=>{
  if(name==="wheel"){wheelListener=listener;options=opts}
  original(name,listener,opts);
 };
 const dispose=bindPropGestures(surface,viewport,{selected:()=>selected,scale:(_,factor)=>factors.push(factor)});
 try{
  assert.equal(options.capture,true);
  assert.equal(options.passive,false);
  const scroll=(over,ctrlKey,deltaY,cancelable=true)=>{
   const event=new Event("wheel",{cancelable});
   Object.defineProperties(event,{target:{value:over},ctrlKey:{value:ctrlKey},deltaY:{value:deltaY},deltaMode:{value:0}});
   let stopped=false;
   event.stopImmediatePropagation=()=>{stopped=true};
   wheelListener(event);
   if(!stopped)downstream++;
   return event.defaultPrevented;
  };
  assert.ok(scroll(surface,true,-120));
  assert.ok(scroll(surface,true,120));
  assert.ok(factors[0]>1&&factors[1]<1);
  selected.row.locked=true;
  assert.ok(scroll(surface,true,-120));
  assert.equal(downstream,0);
  assert.equal(scroll(surface,false,120),false);
  assert.equal(scroll(viewport,true,-120),false);
  selected.row.locked=false;
  assert.equal(scroll(surface,true,-120,false),false);
  selected=null;
  assert.equal(scroll(surface,true,-120),false);
  assert.equal(factors.length,2);
  assert.equal(downstream,4);
 }finally{dispose();delete globalThis.window;delete globalThis.cancelAnimationFrame}
});
