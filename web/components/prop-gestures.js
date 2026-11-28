// Capture prop gestures before OrbitControls sees the same pointer or wheel event.
export function bindPropGestures(surface,viewport,actions){
 let drag=null,frame=0,latest=null;
 function consume(event){event.preventDefault();event.stopImmediatePropagation()}
 function clear(){
  const previous=drag;drag=null;latest=null;
  cancelAnimationFrame(frame);frame=0;
  if(previous&&surface.hasPointerCapture(previous.pointer))surface.releasePointerCapture(previous.pointer);
  delete viewport.dataset.propDrag;
  if(previous?.moving)actions.preview(null);
 }
 function down(event){
  if(drag){clear();return}
  // Ctrl (Cmd on a Mac) + drag moves a prop; a plain drag always orbits. Touch has no
  // modifier, so a finger drags the prop that is already selected.
  const held=event.ctrlKey||event.metaKey,touch=event.pointerType==="touch";
  if(!event.isPrimary||event.button!==0||event.shiftKey||event.altKey||(!held&&!touch))return;
  const target=actions.grab(event);
  if(!target||target.prop.row.locked)return;
  if(!held&&actions.selected()?.row.id!==target.prop.row.id)return;
  consume(event);
  drag={...target,pointer:event.pointerId,x:event.clientX,y:event.clientY,moving:false};
  surface.setPointerCapture(event.pointerId);
  actions.select(target.prop.row.id);
 }
 function move(event){
  if(!drag||drag.pointer!==event.pointerId)return;
  consume(event);
  if(!drag.moving&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4)return;
  drag.moving=true;viewport.dataset.propDrag="moving";latest=event;
  if(!frame)frame=requestAnimationFrame(()=>{
   frame=0;if(!drag)return;
   const rows=actions.place(drag,latest);
   viewport.dataset.propDrag=rows?"moving":"invalid";
   actions.preview(rows?{prop:drag.prop,rows}:null);
  });
 }
 function up(event){
  if(!drag||drag.pointer!==event.pointerId)return;
  consume(event);
  const prop=drag.prop,row=drag.moving?actions.place(drag,event):null;
  clear();
  if(row)actions.commit(prop,row);
 }
 function cancel(event){if(drag&&event.pointerId===drag.pointer)clear()}
 function key(event){if(drag&&event.key==="Escape"){consume(event);clear()}}
 function wheel(event){
  if(!(event.ctrlKey||event.altKey)||event.target!==surface||!event.cancelable)return;
  const prop=actions.selected();if(!prop)return;
  // Reserve the wheel before the browser's page zoom or the camera's dolly handler.
  consume(event);
  if(prop.row.locked||drag||!event.deltaY||(event.ctrlKey&&event.altKey))return;
  const units=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
  const step=Math.max(-.24,Math.min(.24,event.deltaY*units/800));
  if(event.altKey)actions.rotate(prop,-step*100);
  else actions.scale(prop,Math.exp(-step));
 }
 const abort=new AbortController(),options={signal:abort.signal,capture:true,passive:false};
 surface.addEventListener("pointerdown",down,options);surface.addEventListener("pointermove",move,options);
 surface.addEventListener("pointerup",up,options);surface.addEventListener("pointercancel",cancel,options);
 surface.addEventListener("lostpointercapture",cancel,options);viewport.addEventListener("wheel",wheel,options);
 window.addEventListener("keydown",key,options);window.addEventListener("blur",clear,options);
 return ()=>{abort.abort();clear()};
}
