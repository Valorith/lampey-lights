import {useEffect,useRef,useState} from "react";
import {newPlant,plantCatalog} from "../lib/garden";
import {I} from "./ui-kit";

export function GardenCatalog({tabs,search,setSearch,close,engine,place,drop}){
 const gesture=useRef(null),suppressClick=useRef(false),panel=useRef(null);
 const [dragging,setDragging]=useState(false);
 const entries=Object.entries(plantCatalog).filter(([kind,p])=>(p.name+" "+kind).toLowerCase().includes(search.trim().toLowerCase()));

 function cancel(){
  const active=gesture.current;
  gesture.current=null;
  if(active?.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);
  engine.current?.clearPlantPreview();setDragging(false);
 }
 useEffect(()=>{
  const opener=document.activeElement,container=panel.current;
  container.querySelector("button[aria-label='Close catalog']")?.focus({preventScroll:true});
  const outside=e=>{if(!gesture.current&&!panel.current?.contains(e.target))close()};
  const escape=e=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();if(gesture.current)cancel();else close()}};
  document.addEventListener("pointerdown",outside);
  window.addEventListener("keydown",escape,true);window.addEventListener("blur",cancel);
  return ()=>{
   document.removeEventListener("pointerdown",outside);window.removeEventListener("keydown",escape,true);window.removeEventListener("blur",cancel);
   engine.current?.clearPlantPreview();
   if(document.activeElement===document.body||container.contains(document.activeElement))opener?.focus?.({preventScroll:true});
  };
 },[engine]); // close just dismisses the toolbox.
 function start(e,kind){
  if(!e.isPrimary||e.button!==0||gesture.current)return;
  suppressClick.current=false;
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,kind,target:e.currentTarget};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  if(!g.plant){
   if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<6)return;
   g.plant=newPlant(g.kind);suppressClick.current=true;setDragging(true);
  }
  engine.current?.previewPlant(g.plant,e);
 }
 function finish(e){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  const point=g.plant&&engine.current?.lawnAt(e);
  cancel();
  if(point)drop(g.plant,point);
 }
 return <section ref={panel} role="dialog" aria-label="Plant catalog" className={"gardenCatalog"+(dragging?" dragging":"")}>
  <header><h2>Plant catalog</h2><button type="button" className="tool" aria-label="Close catalog" onClick={close}><I n="x"/></button></header>
  {tabs}
  <label className="search kitFilter"><I n="search" size={15}/><input aria-label="Find plants" placeholder="Find plants" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <div className="plantGrid">{entries.map(([kind,p])=><button type="button" key={kind} className="plantCard" aria-label={p.name}
   onPointerDown={e=>start(e,kind)} onPointerMove={move} onPointerUp={finish}
   onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)cancel()}} onPointerCancel={cancel}
   onClick={e=>{if(e.detail&&suppressClick.current){suppressClick.current=false;return}place(kind)}}>
   <img src={"/plants/"+kind+".webp"} alt="" draggable={false}/><span>{p.name}</span><small title="Height × canopy width">{p.height} × {p.width} m</small>
  </button>)}</div>
  {!entries.length&&<p className="kitNone">No matching plants</p>}
 </section>
}
