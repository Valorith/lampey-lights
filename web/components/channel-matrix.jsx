import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {fixtures,isSerial,protocols} from "../lib/show";
import {circuitSpan} from "../lib/patch";
import {applyPatch,channelRange,fillLabels,labelOutput,locationSuggestions,matrixGroups,outputLabel,planPatch,planSwap,portLoad} from "../lib/matrix";
import {I,Empty,usePref} from "./ui-kit";
import {Modal} from "./forms";
import "../app/matrix.css";

const pageCols=32,BIN="bin",filters=["All","Used","Free","Issues"];
const pad=n=>String(n).padStart(2,"0");
const portWord=g=>g.model.kind==="pixel"?"Port":g.model.kind==="dmx"?"Slot":"Channel";
const outputName=(g,n)=>portWord(g)+" "+n;
const short=g=>g.model.kind==="pixel"?"P":g.model.kind==="dmx"?"S":"CH";
const keyOf=(boxId,n)=>boxId+"/"+n;
const parseKey=key=>{if(!key||key===BIN)return ["",0];const i=key.lastIndexOf("/");return [key.slice(0,i),Number(key.slice(i+1))]};
const moving=()=>typeof window!=="undefined"&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease="cubic-bezier(.2,.8,.2,1)";
const range=(a,b)=>Array.from({length:Math.max(0,b-a+1)},(_,i)=>a+i);

// What dropping fixture `f` on `key` would do: stay put, patch, swap, or fail.
function judge(design,f,key){
 const [boxId,n]=parseKey(key);
 if(!boxId)return f.device?{ok:true,unpatch:true,fixture:{...f,device:""}}:{home:true};
 const plan=planPatch(design,f.id,boxId,n);
 if(!plan.error)return plan.fixture===f?{home:true}:{ok:true,fixture:plan.fixture};
 const swap=planSwap(design,f.id,boxId,n);
 return swap?{ok:true,swap}:{error:plan.error};
}

// Pointer drag that works the same for mouse, pen and touch (long-press).
// It lives outside React; the component rebinds its callbacks after every render.
function createDragEngine(){
 let g=null,raf=0,env={},quiet=false;
 const pos={x:0,y:0,ox:0,oy:0,tilt:0};
 const paint=()=>{const el=env.ghost?.();if(el&&!el.classList.contains("returning"))el.style.transform=`translate3d(${pos.x-pos.ox}px,${pos.y-pos.oy}px,0) rotate(${pos.tilt.toFixed(2)}deg)`};
 const probe=()=>{
  const el=document.elementFromPoint(pos.x,pos.y),drop=el?.closest?.("[data-drop]");
  let key=drop?.dataset.drop||"";
  const span=Number(drop?.dataset.span||1);
  if(span>1){
   // A fixture spanning several channels is one cell; pick the channel under the pointer.
   const r=drop.getBoundingClientRect(),i=Math.max(0,Math.min(span-1,Math.floor((pos.x-r.left)/(r.width/span))));
   const [box,n]=parseKey(key);key=keyOf(box,n+i);
  }
  const spring=el?.closest?.("[data-spring]")?.dataset.spring||"";
  if(key!==g.key){g.key=key;env.aim(key)}
  if(spring!==g.spring){g.spring=spring;clearTimeout(g.springTimer);if(spring)g.springTimer=setTimeout(()=>env.spring(spring),420)}
 };
 const tick=()=>{
  if(!g?.started)return;
  let scrolled=false;
  for(const box of env.scrollers()){
   if(!box)continue;
   const r=box.getBoundingClientRect(),edge=56;
   if(pos.x<r.left||pos.x>r.right||pos.y<r.top||pos.y>r.bottom)continue;
   const top=Math.max(r.top,0),bottom=Math.min(r.bottom,window.innerHeight),left=r.left+(env.stickyLeft?.(box)||0),right=r.right;
   const dy=pos.y<top+edge?pos.y-top-edge:pos.y>bottom-edge?pos.y-bottom+edge:0;
   const dx=pos.x<left+edge&&box.scrollLeft>0?pos.x-left-edge:pos.x>right-edge?pos.x-right+edge:0;
   const y=box.scrollTop,x=box.scrollLeft;
   if(dy)box.scrollTop+=Math.sign(dy)*Math.min(22,Math.abs(dy)*.4);
   if(dx)box.scrollLeft+=Math.sign(dx)*Math.min(22,Math.abs(dx)*.4);
   scrolled||=box.scrollTop!==y||box.scrollLeft!==x;
  }
  pos.tilt*=.88;paint();
  if(scrolled)probe();
  raf=requestAnimationFrame(tick);
 };
 const begin=()=>{
  const r=g.rect,w=Math.max(210,Math.min(290,r.width));
  g.started=true;
  Object.assign(pos,{x:g.lx,y:g.ly,ox:Math.max(14,Math.min(g.sx-r.left,w-24)),oy:Math.max(12,Math.min(g.sy-r.top,28)),tilt:0});
  env.start({id:g.id,w,origin:{left:r.left,top:r.top}});
  document.documentElement.classList.add("mxGrabbing");
  if(g.touch)navigator.vibrate?.(8);
  raf=requestAnimationFrame(tick);
  probe();
 };
 const stop=()=>{
  clearTimeout(g?.timer);clearTimeout(g?.springTimer);cancelAnimationFrame(raf);
  window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);
  window.removeEventListener("pointercancel",cancel);window.removeEventListener("touchmove",block);
  document.documentElement.classList.remove("mxGrabbing");
  const was=g;g=null;return was;
 };
 const move=e=>{
  if(!g||e.pointerId!==g.pointerId)return;
  g.lx=e.clientX;g.ly=e.clientY;
  if(!g.started){
   const d=Math.hypot(e.clientX-g.sx,e.clientY-g.sy);
   if(g.touch){if(d>8)stop()}else if(d>4)begin();
   return;
  }
  pos.tilt=Math.max(-6,Math.min(6,pos.tilt*.6+(e.clientX-pos.x)*.45));pos.x=e.clientX;pos.y=e.clientY;
  paint();probe();
 };
 const up=e=>{
  if(!g||e.pointerId!==g.pointerId)return;
  const was=stop();
  if(!was.started)return;
  quiet=true;setTimeout(()=>{quiet=false},0);
  env.finish(was.key,false);
 };
 const cancel=()=>{const was=stop();if(was?.started)env.finish("",true)};
 const block=e=>{if(g?.started)e.preventDefault()};
 return {
  pos,paint,cancel,
  bind(next){env=next},
  dragging:()=>!!g?.started,
  quiet:()=>quiet,
  dispose:()=>{stop()},
  grab(e,id){
   if(e.button!==0||g)return;
   g={id,pointerId:e.pointerId,sx:e.clientX,sy:e.clientY,lx:e.clientX,ly:e.clientY,rect:e.currentTarget.getBoundingClientRect(),touch:e.pointerType!=="mouse",started:false,key:"",spring:""};
   if(g.touch)g.timer=setTimeout(()=>{if(g&&!g.started)begin()},240);
   window.addEventListener("pointermove",move);window.addEventListener("pointerup",up);
   window.addEventListener("pointercancel",cancel);window.addEventListener("touchmove",block,{passive:false});
  }
 };
}

function Chip({f,detail,cont,state,faults,engine,press,link}){
 const problems=faults.get(f.id)||[];
 return <button type="button" data-tile={cont?undefined:f.id} className={"mxChip"+(cont?" cont":"")+(state?" "+state:"")} style={{"--fixture":f.color}}
  aria-pressed={state==="picked"} aria-label={f.name+(detail?", "+detail:"")} title={[f.name,detail,...problems].filter(Boolean).join(" · ")}
  onPointerDown={e=>engine.grab(e,f.id)} onClick={e=>press(e,f)} onContextMenu={e=>e.preventDefault()}
  onPointerEnter={()=>link(f.id)} onPointerLeave={()=>link("")}>
  <i className="mxLamp" aria-hidden="true"/>
  <span className="mxChipText"><strong>{cont?"↳ "+f.name:f.name}</strong>{detail&&<small>{detail}</small>}</span>
  {problems.length>0&&<I n="alert" size={13}/>}
 </button>;
}

function Load({load}){
 return <div className={"mxLoad"+(load.used>load.limit?" over":"")} title={load.used+" of "+load.limit+" pixels"}>
  {load.segments.map(s=><i key={s.f.id} style={{"--fixture":s.f.color,left:Math.min(100,(s.start-1)/load.limit*100)+"%",width:Math.min(100,(s.end-s.start+1)/load.limit*100)+"%"}}/>)}
 </div>;
}

// Inline location label. Enter or Tab saves and moves to the next output; Shift goes back.
function LabelEditor({initial,name,save,cancel}){
 const [text,setText]=useState(initial),ref=useRef(null),settled=useRef(false);
 useEffect(()=>{ref.current?.focus();ref.current?.select()},[]);
 const finish=step=>{if(settled.current)return;settled.current=true;save(text,step)};
 return <span className="mxTagEdit" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
  <I n="pin" size={12}/>
  <input ref={ref} value={text} list="mx-locations" maxLength={48} placeholder="Location" aria-label={"Location for "+name}
   onChange={e=>setText(e.target.value)} onBlur={()=>finish(0)}
   onKeyDown={e=>{
    if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();finish(e.shiftKey?-1:1)}
    else if(e.key==="Escape"){e.preventDefault();settled.current=true;cancel()}
   }}/>
 </span>;
}

function FixturePicker({design,group,n,place,close}){
 const [q,setQ]=useState("");
 const key=keyOf(group.box.id,n);
 const choices=useMemo(()=>design.fixtures.map(f=>({f,v:judge(design,f,key)}))
  .sort((a,b)=>Number(!!a.v.error)-Number(!!b.v.error)||Number(!!a.f.device)-Number(!!b.f.device)||a.f.name.localeCompare(b.f.name)),[design,key]);
 const rows=choices.filter(({f})=>(f.name+" "+f.zone).toLowerCase().includes(q.trim().toLowerCase()));
 return <Modal title={group.box.name+" · "+outputName(group,n)} close={close}>
  <label className="search mxFind"><I n="search"/><input aria-label="Find fixture to assign" placeholder="Find a fixture" value={q} onChange={e=>setQ(e.target.value)}/></label>
  <div className="mxChoices">{rows.map(({f,v})=><button type="button" key={f.id} disabled={!!v.error||v.home} onClick={()=>place(f.id,key)}>
   <i className="mxLamp" style={{"--fixture":f.color}}/><span>{f.name}<small>{v.error||(v.home?"Already here":v.swap?(v.swap.replaced?"Replaces ":"Swaps with ")+v.swap.other.name:[f.zone,fixtures[f.type]].join(" · "))}</small></span>
   {f.device&&!v.error&&!v.home&&<em>Moves</em>}</button>)}
   {!rows.length&&<Empty icon="search" title="No matching fixtures"/>}</div>
 </Modal>;
}

export function ChannelMatrix({design,issues,change,editBox,editFixture,addBox,notify}){
 const [query,setQuery]=useState(""),[filter,setFilter]=useState("All");
 const [density,setDensity]=usePref("matrix.density","detailed"),[bin,setBin]=usePref("matrix.bin",true);
 const [colPage,setColPage]=useState(0);
 const [picked,pick]=useState(""),[drag,setDrag]=useState(null),[aim,setAim]=useState("");
 const [linked,link]=useState(""),[hover,setHover]=useState(null),[landed,setLanded]=useState(""),[picker,setPicker]=useState(null),[focus,setFocus]=useState(null),[editing,setEditing]=useState("");
 const rootRef=useRef(null),mainRef=useRef(null),binRef=useRef(null),ghostRef=useRef(null),flight=useRef(null);
 const [engine]=useState(createDragEngine);

 const {groups,loose}=useMemo(()=>matrixGroups(design),[design]);
 const faults=useMemo(()=>{const map=new Map();for(const i of issues.filter(i=>i.level==="error")){
  if(!map.has(i.id))map.set(i.id,[]);map.get(i.id).push(i.message);
 }return map},[issues]);
 const active=design.fixtures.find(f=>f.id===(drag?.id||picked));
 const judgeAt=useMemo(()=>{
  if(!active)return null;
  const cache=new Map();
  return key=>{if(!cache.has(key))cache.set(key,judge(design,active,key));return cache.get(key)};
 },[active,design]);
 const needle=query.trim().toLowerCase();
 const boxOf=id=>groups.find(g=>g.box.id===id);
 const startOf=f=>{const g=boxOf(f.device);return g?circuitSpan(f,g.model.kind)[0]:0};
 const spot=f=>{const g=boxOf(f.device);return g?outputLabel(g.box,startOf(f)):""};
 const where=f=>{const g=boxOf(f.device);return g?[g.box.name+" · "+short(g)+pad(startOf(f)),spot(f)!==f.name&&spot(f)].filter(Boolean).join(" · "):""};
 const fill=useMemo(()=>fillLabels(design),[design]);
 const labeled=groups.reduce((s,g)=>s+Object.keys(g.box.labels||{}).filter(n=>n<=g.model.ports).length,0);
 const maxPorts=Math.max(0,...groups.map(g=>g.model.ports));
 const pages=Math.max(1,Math.ceil(maxPorts/pageCols)),page=Math.min(colPage,pages-1);
 const cols=range(page*pageCols+1,Math.min(maxPorts,(page+1)*pageCols));
 const cross=drag?(aim&&aim!==BIN?{row:parseKey(aim)[0],col:parseKey(aim)[1]}:null):hover;

 useEffect(()=>{if(!landed)return;const id=setTimeout(()=>setLanded(""),900);return()=>clearTimeout(id)},[landed]);

 // Fly the fixture from where it was released into its new cell.
 useLayoutEffect(()=>{
  const trip=flight.current;flight.current=null;
  if(!trip?.rect||!moving())return;
  const id=CSS.escape(trip.id);
  const el=rootRef.current?.querySelector(`.mxMain [data-tile="${id}"]`)||rootRef.current?.querySelector(`[data-item="${id}"]`);
  if(!el)return;
  const r=el.getBoundingClientRect(),dx=trip.rect.left-r.left,dy=trip.rect.top-r.top;
  if(Math.hypot(dx,dy)<2)return;
  el.animate([{transform:`translate(${dx}px,${dy}px) scale(1.04)`,boxShadow:"0 18px 40px #000a",zIndex:3},{transform:"none",boxShadow:"0 0 0 transparent"}],{duration:460,easing:ease});
 },[design]);

 // Bring an output into view and flash it.
 useEffect(()=>{
  if(!focus)return;
  const el=rootRef.current?.querySelector(`[data-port="${CSS.escape(focus)}"]`);
  if(!el)return;
  el.scrollIntoView({block:"nearest",inline:"center",behavior:moving()?"smooth":"auto"});
  el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash");
 },[focus]);

 function reveal(f){
  const g=boxOf(f.device);if(!g)return;
  const n=Math.max(1,Math.min(startOf(f),g.model.ports));
  setColPage(Math.floor((n-1)/pageCols));
  setFocus(null);requestAnimationFrame(()=>setFocus(keyOf(g.box.id,n)));
 }

 function place(id,key,rect){
  const f=design.fixtures.find(x=>x.id===id);
  if(!f)return;
  const v=judge(design,f,key);
  setPicker(null);
  if(v.home){pick("");return}
  if(v.error){notify(v.error,true);return}
  const [boxId,n]=parseKey(key),g=boxOf(boxId),sel=CSS.escape(id);
  flight.current={id,rect:rect||rootRef.current?.querySelector(`.mxMain [data-tile="${sel}"],[data-item="${sel}"]`)?.getBoundingClientRect()};
  if(v.swap){
   change(v.swap.show);
   notify(v.swap.replaced?f.name+" replaced "+v.swap.other.name:"Swapped "+f.name+" and "+v.swap.other.name,false,true);
  }else{
   change(applyPatch(design,v.fixture));
   notify(g?f.name+" → "+g.box.name+" · "+outputName(g,n):f.name+" unpatched",false,true);
  }
  setLanded(id);pick("");
 }

 // Outputs one fixture spans share a cell; its label sits on the first of them.
 function cellAt(g,n){
  const rows=g.outputs.get(n)||[];
  return g.model.kind!=="pixel"&&rows.length===1?circuitSpan(rows[0],g.model.kind):[n,n];
 }
 function saveLabel(key,text,step){
  const [boxId,n]=parseKey(key),g=boxOf(boxId);
  const next=labelOutput(design,boxId,n,text);
  if(next!==design)change(next);
  const m=!g||!step?0:step>0?cellAt(g,n)[1]+1:cellAt(g,n-1)[0];
  if(m<1||m>g.model.ports){setEditing("");return}
  setColPage(Math.floor((m-1)/pageCols));setEditing(keyOf(boxId,m));
 }

 function clickCell(group,n){
  if(active)place(active.id,keyOf(group.box.id,n));
  else setPicker({id:group.box.id,n});
 }

 function press(e,f){
  if(engine.quiet())return;
  e.stopPropagation();
  const cell=e.currentTarget.closest("[data-port]");
  if(active&&active.id!==f.id&&cell){
   const [box,n]=parseKey(cell.dataset.port),span=Number(cell.dataset.span||1),r=cell.getBoundingClientRect();
   place(active.id,keyOf(box,n+Math.max(0,Math.min(span-1,Math.floor((e.clientX-r.left)/(r.width/span))))));
   return;
  }
  pick(picked===f.id?"":f.id);
 }

 function finish(key,cancelled){
  const ghost=ghostRef.current,rect=ghost?.getBoundingClientRect(),f=active;
  const v=!cancelled&&key&&f?judge(design,f,key):null;
  const done=()=>{setDrag(null);setAim("")};
  if(v?.ok){place(f.id,key,rect);done();return}
  if(v?.error)notify(v.error,true);
  const home=drag?.origin;
  if(!ghost||!home||!moving()){done();return}
  ghost.classList.add("returning");
  ghost.animate([{transform:ghost.style.transform},{transform:`translate3d(${home.left}px,${home.top}px,0) scale(.96)`,opacity:.15}],{duration:280,easing:ease,fill:"forwards"}).onfinish=done;
 }

 // Rebind after every render so window listeners see current state.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useLayoutEffect(()=>{engine.bind({
  ghost:()=>ghostRef.current,
  scrollers:()=>[mainRef.current,binRef.current,rootRef.current],
  stickyLeft:box=>box===mainRef.current?mainRef.current.querySelector(".mxCorner")?.offsetWidth||0:0,
  start:d=>{setDrag(d);pick("")},
  aim:setAim,
  spring:s=>{const [kind,p]=s.split(":");if(kind==="page")setColPage(Number(p))},
  finish
 })});
 useLayoutEffect(()=>{if(drag)engine.paint()},[drag,engine]);
 useEffect(()=>()=>engine.dispose(),[engine]);
 useEffect(()=>{const key=e=>{if(e.key!=="Escape")return;if(engine.dragging())engine.cancel();else{pick("");setPicker(null);setEditing("")}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[engine]);

 const chipState=f=>drag?.id===f.id?"source":picked===f.id?"picked":linked===f.id?"linked":"";
 const chip=(f,detail,cont)=><Chip key={f.id} f={f} detail={detail} cont={cont} state={chipState(f)} faults={faults} engine={engine} press={press} link={link}/>;
 const fxHit=f=>(f.name+" "+f.zone).toLowerCase().includes(needle);

 function row(g){
  const {box,model,outputs,overflow}=g,kind=model.kind,pixel=kind==="pixel";
  const network=design.networks.find(n=>n.id===box.net);
  const detail=[model.name,network?network.name:"No network",isSerial(network)?"ID "+box.unit:network&&protocols[network.protocol]].filter(Boolean);
  const nameHit=!needle||(box.name+" "+detail.join(" ")).toLowerCase().includes(needle);
  const shows=n=>{
   const rows=outputs.get(n)||[];
   if(filter==="Used"&&!rows.length||filter==="Free"&&(rows.length||box.offPorts?.includes(n))||filter==="Issues"&&!rows.some(f=>faults.has(f.id)))return false;
   return nameHit||outputName(g,n).toLowerCase().includes(needle)||outputLabel(box,n).toLowerCase().includes(needle)||rows.some(fxHit);
  };
  if(needle&&!nameHit&&![...outputs.values()].flat().some(fxHit)&&!overflow.some(fxHit)&&!Object.values(box.labels||{}).some(t=>t.toLowerCase().includes(needle)))return null;
  const onRow=cross?.row===box.id,problem=faults.get(box.id);
  // Walk the visible columns, merging channels that one fixture occupies into a single cell.
  const runs=[],last=cols.at(-1)||0;
  for(let at=cols[0]||1;at<=last;){
   if(at>model.ports){runs.push({n:at,span:last-at+1,void:true});break}
   const rows=outputs.get(at)||[];
   let span=1,cont=false;
   if(!pixel&&rows.length===1){const [a,b]=circuitSpan(rows[0],kind);span=Math.min(b,last,model.ports)-at+1;cont=a<at}
   runs.push({n:at,span,cont,rows});
   at+=span;
  }
  const cells=runs.map(({n,span,cont,rows,void:none})=>{
   if(none)return <div key="void" className="mxCell void" style={{gridColumn:"span "+span}} aria-hidden="true"/>;
   const key=keyOf(box.id,n);
   const covered=range(n,n+span-1),off=covered.every(c=>box.offPorts?.includes(c));
   const v=judgeAt?.(key);
   const state=!v?"":v.home?" home":v.error?" invalid":v.swap?" swap":" valid";
   const aimed=drag&&parseKey(aim)[0]===box.id&&covered.includes(parseKey(aim)[1]);
   const cls="mxCell"+(rows.length?" used":" free")+(outputLabel(box,n)?" labeled":"")+(off?" off":"")+state+(aimed?" aim":"")+(covered.some(shows)?"":" faded")+
    (cross?.col!=null&&covered.includes(cross.col)?" xcol":"")+(onRow?" xrow":"")+(rows.some(f=>f.id===landed)?" landed":"")+
    (rows.some(f=>f.id===linked)?" linked":"")+(rows.some(f=>faults.has(f.id))?" fault":"");
   const name=outputName(g,n)+(span>1?"–"+(n+span-1):"")+" on "+box.name,tag=outputLabel(box,n);
   return <div key={n} className={cls} data-port={key} data-drop={active?key:undefined} data-span={span>1?span:undefined}
    style={{gridColumn:span>1?"span "+span:undefined,"--fixture":rows[0]?.color}} title={tag||undefined}
    onPointerEnter={()=>setHover({row:box.id,col:n})} onClick={e=>{if(!e.target.closest(".mxChip"))clickCell(g,n)}}
    onDoubleClick={e=>{if(!active){e.preventDefault();setPicker(null);setEditing(key)}}}>
    {editing===key?<LabelEditor initial={tag} name={name} save={(t,step)=>saveLabel(key,t,step)} cancel={()=>setEditing("")}/>:
     tag?<button type="button" className="mxTag" title={tag} aria-label={"Location "+tag+", "+name+". Edit"} onClick={e=>{e.stopPropagation();if(!active)setEditing(key)}}><I n="pin" size={11}/><span>{tag}</span></button>:
     !active&&<button type="button" className="mxTagAdd" aria-label={"Label "+name} data-tip="Label location" data-tip-pos="down" onClick={e=>{e.stopPropagation();setEditing(key)}}><I n="pin" size={12}/></button>}
    {rows.length?<div className={"mxStack"+(rows.length>1?" multi":"")}>
     {rows.slice(0,rows.length>2?1:2).map(f=>chip(f,[channelRange(f,box,network),pixel&&f.offset>1&&"px "+f.offset].filter(Boolean).join(" · "),cont))}
     {rows.length>2&&<button type="button" className="mxMore" onClick={e=>{e.stopPropagation();setPicker({id:box.id,n})}}>+{rows.length-1} more</button>}
    </div>:<button type="button" className="mxSlot" aria-label={(active?"Place on ":"Assign to ")+name} onClick={e=>{e.stopPropagation();clickCell(g,n)}}>
     {off?<em>Off</em>:<I n="plus" size={14}/>}</button>}
    {rows.length>0&&off&&<em className="mxOffTag">Off</em>}
    {v?.swap&&<span className="mxHint"><I n="swap" size={12}/></span>}
    {pixel&&rows.length>0&&<Load load={portLoad(g,n,network)}/>}
   </div>;
  });
  return [
   <div key={box.id} className={"mxRowHead"+(onRow?" xrow":"")+(problem?" fault":"")} title={problem?.join(" · ")}>
    <span className="mxRowIcon"><I n={problem?"alert":"box"} size={16}/></span>
    <div className="mxRowName"><strong>{box.name}</strong><small>{detail.join(" · ")}</small></div>
    <div className="mxRowUse" title={outputs.size+" of "+model.ports+" outputs used"}>
     <span><b>{outputs.size}</b>/{model.ports}</span><i style={{"--p":outputs.size/model.ports}}/>
    </div>
    {overflow.length>0&&<button type="button" className="mxOut" data-tip={overflow.map(f=>f.name).join(", ")} data-tip-pos="down" onClick={()=>pick(overflow[0].id)}>
     <I n="alert" size={12}/>{overflow.length}</button>}
    <button type="button" className="tool mxRowEdit" aria-label={"Settings for "+box.name} data-tip="Box settings" data-tip-pos="down" onClick={()=>editBox(box)}><I n="settings" size={15}/></button>
   </div>,
   ...cells
  ];
 }

 const patched=design.fixtures.filter(f=>boxOf(f.device)).sort((a,b)=>{
  const ga=groups.indexOf(boxOf(a.device)),gb=groups.indexOf(boxOf(b.device));
  return ga-gb||startOf(a)-startOf(b);
 });
 const binHit=f=>!needle||(f.name+" "+f.zone+" "+where(f)).toLowerCase().includes(needle);
 const totalPorts=groups.reduce((s,g)=>s+g.model.ports,0),usedPorts=groups.reduce((s,g)=>s+g.outputs.size,0);
 const ghostFx=drag&&design.fixtures.find(f=>f.id===drag.id);
 const verdict=drag&&aim?judgeAt?.(aim):null;
 const aimGroup=aim&&aim!==BIN?boxOf(parseKey(aim)[0]):null;
 // row() builds JSX only; the refs it reaches are read inside event handlers.
 // eslint-disable-next-line react-hooks/refs
 const rows=groups.map(row).filter(Boolean);
 const binItem=f=><button type="button" key={f.id} data-item={f.id}
  className={"mxItem"+(drag?.id===f.id?" source":picked===f.id?" picked":linked===f.id?" linked":"")} aria-pressed={picked===f.id}
  onPointerDown={e=>engine.grab(e,f.id)} onClick={e=>{if(engine.quiet())return;e.stopPropagation();if(picked!==f.id)reveal(f);pick(picked===f.id?"":f.id)}}
  onPointerEnter={()=>link(f.id)} onPointerLeave={()=>link("")} onContextMenu={e=>e.preventDefault()}>
  <i className="mxLamp" aria-hidden="true" style={{"--fixture":f.color}}/>
  <span><strong>{f.name}</strong><small>{boxOf(f.device)?where(f):f.zone+" · "+fixtures[f.type]}</small></span>
  {faults.has(f.id)&&<I n="alert" size={14}/>}
 </button>;
 const shownLoose=loose.filter(binHit),shownPatched=patched.filter(binHit);
 const pickerGroup=picker&&boxOf(picker.id);

 return <div ref={rootRef} className={"mxShell "+density+(bin?"":" binless")+(drag?" dragging":"")+(active?" choosing":"")+(drag&&active?.device?" unpatching":"")+(aim===BIN?" aimBin":"")}
  onClick={e=>{if(picked&&!e.target.closest("button,input,select,label,.mxCell,dialog"))pick("")}}>
  <aside ref={binRef} className="mxBin" data-drop={drag&&active?.device?BIN:undefined} aria-label="Fixtures">
   <header className="mxBinHead"><h2>Fixtures</h2><span><b>{patched.length}</b>/{design.fixtures.length} patched</span></header>
   <h3>Unpatched <span>{loose.length}</span></h3>
   {shownLoose.length?<div className="mxItems">{shownLoose.map(binItem)}</div>:
    <p className="mxAllSet">{loose.length?"No matches":<><I n="check" size={15}/>Everything is patched</>}</p>}
   {patched.length>0&&<><h3>Patched <span>{patched.length}</span></h3>
    {shownPatched.length?<div className="mxItems">{shownPatched.map(binItem)}</div>:<p className="mxAllSet">No matches</p>}</>}
  </aside>
  <div className="mxBinDrop" aria-hidden="true"><I n="cable" size={20}/>Drop to unpatch</div>

  <main ref={mainRef} className="mxMain">
   <header className="mxBar">
    <div className="mxTitle"><h1>Channel matrix</h1>
     <p><span><b>{usedPorts}</b>/{totalPorts} outputs</span><span><b>{groups.length}</b> {groups.length===1?"box":"boxes"}</span><span><b>{labeled}</b> labeled</span>
      {faults.size>0&&<button type="button" className="mxIssues" aria-pressed={filter==="Issues"} onClick={()=>setFilter(f=>f==="Issues"?"All":"Issues")}><I n="alert" size={13}/>{faults.size} {faults.size===1?"issue":"issues"}</button>}</p>
    </div>
    <div className="mxTools">
     <label className="search"><I n="search" size={16}/><input aria-label="Search matrix" placeholder="Find fixture, box or port" value={query} onChange={e=>setQuery(e.target.value)}/>
      {query&&<button type="button" className="clear plain" aria-label="Clear search" onClick={()=>setQuery("")}><I n="x" size={13}/></button>}</label>
     <div className="mxSeg" role="group" aria-label="Show outputs" style={{"--i":filters.indexOf(filter),"--count":filters.length}}>
      {filters.map(v=><button type="button" key={v} aria-pressed={filter===v} onClick={()=>setFilter(v)}>{v}</button>)}</div>
     <div className="mxSeg icons" role="group" aria-label="Cell size" style={{"--i":density==="compact"?0:1,"--count":2}}>
      <button type="button" aria-pressed={density==="compact"} aria-label="Compact cells" data-tip="Compact" data-tip-pos="down" onClick={()=>setDensity("compact")}><I n="zoomOut" size={15}/></button>
      <button type="button" aria-pressed={density!=="compact"} aria-label="Detailed cells" data-tip="Detailed" data-tip-pos="down" onClick={()=>setDensity("detailed")}><I n="zoomIn" size={15}/></button></div>
     {fill.count>0&&<button type="button" className="mxFill" data-tip="Name unlabeled outputs after their fixtures" data-tip-pos="down" onClick={()=>{change(fill.show);notify("Labeled "+fill.count+(fill.count===1?" output":" outputs"),false,true)}}><I n="pin" size={15}/>Fill labels</button>}
     <button type="button" className={"tool mxBinToggle"+(bin?" on":"")} aria-pressed={bin} aria-label="Fixture list" data-tip={bin?"Hide fixtures":"Show fixtures"} data-tip-pos="down" onClick={()=>setBin(b=>!b)}><I n="sidebar" size={16}/></button>
     <button type="button" className="mxAdd" onClick={addBox}><I n="plus" size={15}/>Add box</button>
    </div>
   </header>

   {pages>1&&<nav className="mxPages" aria-label="Output columns">{Array.from({length:pages},(_,p)=>{
    const a=p*pageCols+1,b=Math.min((p+1)*pageCols,maxPorts),busy=groups.some(g=>range(a,b).some(n=>g.outputs.has(n)));
    return <button type="button" key={p} aria-pressed={p===page} className={busy?"busy":""} data-spring={drag&&p!==page?"page:"+p:undefined} onClick={()=>setColPage(p)}>{a}–{b}</button>;
   })}</nav>}

   {rows.length?<div className="mxGridWrap"><div className="mxGrid" role="grid" aria-label="Controller outputs" style={{"--cols":cols.length}} onPointerLeave={()=>setHover(null)}>
    <div className="mxCorner"><span>Controller</span><span>Output</span></div>
    {cols.map(n=><div key={n} className={"mxColHead"+(cross?.col===n?" on":"")}>{pad(n)}</div>)}
    {rows}
   </div></div>:
   <div className="mxNone">{groups.length?<Empty icon="search" title="No matching outputs"/>:
    <Empty icon="box" title="No controllers yet"><button type="button" className="primary" onClick={addBox}><I n="plus" size={15}/>Add box</button></Empty>}</div>}
  </main>

  {active&&!drag&&<div className="mxDock" role="status">
   <i className="mxLamp" style={{"--fixture":active.color}}/>
   <span className="mxDockText"><strong>{active.name}</strong><small>{where(active)||"Unpatched"}</small></span>
   <span className="mxDockHint">Choose an output</span>
   <button type="button" onClick={()=>editFixture(active)}><I n="edit" size={14}/>Edit</button>
   {active.device&&<button type="button" onClick={()=>place(active.id,BIN)}><I n="cable" size={14}/>Unpatch</button>}
   <button type="button" className="tool" aria-label="Cancel" onClick={()=>pick("")}><I n="x" size={15}/></button>
  </div>}

  {drag&&active?.device&&<div className={"mxTrash"+(aim===BIN?" aim":"")} data-drop={BIN}><I n="cable" size={16}/>Unpatch</div>}

  {ghostFx&&<div ref={ghostRef} className="mxGhost" aria-hidden="true" style={{width:drag.w,"--fixture":ghostFx.color}}>
   <div className="mxGhostCard"><i className="mxLamp"/><span><strong>{ghostFx.name}</strong><small>{where(ghostFx)||ghostFx.zone}</small></span><I n="grip" size={16}/></div>
   {verdict&&!verdict.home&&<div className={"mxVerdict"+(verdict.error?" bad":verdict.swap?" swap":"")}>
    <I n={verdict.error?"alert":verdict.swap?"swap":verdict.unpatch?"cable":"check"} size={13}/>
    <span>{verdict.error||(verdict.unpatch?"Unpatch":verdict.swap?(verdict.swap.replaced?"Replace ":"Swap with ")+verdict.swap.other.name:aimGroup&&[aimGroup.box.name+" · "+outputName(aimGroup,parseKey(aim)[1]),outputLabel(aimGroup.box,parseKey(aim)[1])].filter(Boolean).join(" · "))}</span>
   </div>}
  </div>}

  {editing&&<datalist id="mx-locations">{locationSuggestions(design,(boxOf(parseKey(editing)[0])?.outputs.get(parseKey(editing)[1])||[]).flatMap(f=>[f.name,f.zone])).map(t=><option key={t} value={t}/>)}</datalist>}
  {pickerGroup&&<FixturePicker design={design} group={pickerGroup} n={picker.n} place={place} close={()=>setPicker(null)}/>}
 </div>;
}
