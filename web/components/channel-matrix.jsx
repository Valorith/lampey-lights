import {useEffect,useMemo,useState} from "react";
import {address,fixtures,isSerial,protocols} from "../lib/show";
import {circuitSpan} from "../lib/patch";
import {applyPatch,channelRange,matrixGroups,planPatch} from "../lib/matrix";
import {I,Empty} from "./ui-kit";
import {Modal} from "./forms";
import "../app/matrix.css";

const dragType="application/x-lampey-fixture";
const bankSize=32;
const number=n=>String(n).padStart(2,"0");
const outputName=(group,n)=>(group.model.kind==="pixel"?"Port ":"Channel ")+n;

function FixtureTile({f,detail,active,issues,choose,start,end,landed}){
 const problems=issues.get(f.id)||[];
 return <button type="button" draggable onDragStart={e=>start(e,f)} onDragEnd={end}
  onClick={()=>choose(f)} aria-pressed={active===f.id} aria-label={"Move "+f.name}
  title={[f.name,detail,...problems].filter(Boolean).join(" · ")}
  className={"mxFixture"+(landed===f.id?" landed":"")} style={{"--fixture":f.color}}>
  <i aria-hidden="true"/><span><strong>{f.name}</strong>{detail&&<small>{detail}</small>}</span>
  {problems.length>0&&<I n="alert" size={14}/>}
 </button>;
}

function ControllerBank({group,network,search,filter,selection,hover,issues,tiles,editBox,target,over,leave,drop}){
 const [bank,setBank]=useState(0);
 const {box,model,outputs,overflow}=group;
 const boxDetail=[model.name,network?.name,isSerial(network)?"ID "+box.unit:network&&protocols[network.protocol]].filter(Boolean).join(" · ");
 const matchBox=(box.name+" "+boxDetail).toLowerCase().includes(search);
 const all=Array.from({length:model.ports},(_,i)=>i+1);
 const matches=f=>(f.name+" "+f.zone+" "+address(f,box,network)).toLowerCase().includes(search);
 const matchesOutput=n=>{
  const rows=outputs.get(n)||[];
  if(filter==="Used"&&!rows.length || filter==="Free"&&rows.length || filter==="Issues"&&!rows.some(f=>issues.has(f.id)))return false;
  return !search||matchBox||outputName(group,n).toLowerCase().includes(search)||rows.some(matches);
 };
 const numbers=all.filter(matchesOutput);
 const displaced=filter==="Free"?[]:overflow.filter(f=>matchBox||matches(f));
 if(!numbers.length&&!displaced.length&&!(filter==="Issues"&&issues.has(box.id)))return null;
 const pages=Math.ceil(numbers.length/bankSize),page=Math.min(bank,Math.max(0,pages-1));
 return <section className="mxBank" aria-label={box.name}>
  <header className="mxHead"><span className="mxBoxIcon"><I n="box" size={22}/></span>
   <div className="mxIdentity"><h2>{box.name}</h2><small>{boxDetail}</small></div>
   <div className="mxCapacity"><span>{outputs.size} / {model.ports} used</span><meter min="0" max={model.ports} value={outputs.size}/></div>
   <button className="mxSettings" aria-label={"Settings for "+box.name} onClick={()=>editBox(box)}><I n="settings" size={16}/><span>Settings</span></button>
  </header>
  {issues.has(box.id)&&<p className="mxProblem"><I n="alert" size={15}/>{issues.get(box.id).join(" · ")}</p>}
  {displaced.length>0&&<div className="mxOverflow"><b>Unavailable outputs</b><div>{displaced.map(f=>tiles(f,outputName(group,circuitSpan(f,model.kind)[0])))}</div></div>}
  {numbers.length>0&&<div className="mxGrid">{numbers.slice(page*bankSize,(page+1)*bankSize).map(n=>{
   const rows=outputs.get(n)||[],key=box.id+"/"+n,off=box.offPorts?.includes(n);
   const state=hover?.key===key?(hover.error?" blocked":" over"):"";
   return <div key={n} className={"mxOutput"+(rows.length?" occupied":" vacant")+(off?" off":"")+state}
    onDragEnter={e=>over(e,box.id,n)} onDragOver={e=>over(e,box.id,n)} onDragLeave={leave} onDrop={e=>drop(e,box.id,n)}>
    <button className="mxContact" aria-label={outputName(group,n)+" on "+box.name}
     onClick={()=>target(group,n)} title={(hover?.key===key&&hover.error)||outputName(group,n)}>
     <span><i/>{model.kind==="pixel"?"P":"CH"} {number(n)}</span>
     {off?<small>Off</small>:<I n="plus" size={14}/>}
    </button>
    {rows.length?rows.map(f=>{
     const span=model.kind==="pixel"?"px "+f.offset+"–"+(f.offset+f.count-1):"";
     return tiles(f,[channelRange(f,box,network),span].filter(Boolean).join(" · "));
    }):<button className="mxEmpty" aria-label={"Assign a fixture to "+outputName(group,n)+" on "+box.name}
      onClick={()=>target(group,n)}>{selection?"Place here":"Open"}</button>}
   </div>;
  })}</div>}
  {pages>1&&<footer className="mxPages"><label>Outputs <select aria-label={"Output range on "+box.name} value={page} onChange={e=>setBank(+e.target.value)}>
   {Array.from({length:pages},(_,p)=><option key={p} value={p}>{numbers[p*bankSize]}–{numbers[Math.min((p+1)*bankSize,numbers.length)-1]}</option>)}</select></label></footer>}
 </section>;
}

function FixturePicker({design,group,n,move,close}){
 const [q,setQ]=useState("");
 const choices=useMemo(()=>design.fixtures.map(f=>({f,error:planPatch(design,f.id,group.box.id,n).error}))
  .sort((a,b)=>Number(!!a.error)-Number(!!b.error)||Number(!!a.f.device)-Number(!!b.f.device)||a.f.name.localeCompare(b.f.name)),[design,group,n]);
 const rows=choices.filter(({f})=>(f.name+" "+f.zone).toLowerCase().includes(q.trim().toLowerCase()));
 return <Modal title={group.box.name+" · "+outputName(group,n)} close={close}>
  <label className="search mxFind"><I n="search"/><input aria-label="Find fixture to assign" placeholder="Find a fixture" value={q} onChange={e=>setQ(e.target.value)}/></label>
  <div className="mxChoices">{rows.map(({f,error})=><button key={f.id} disabled={!!error} onClick={()=>move(f.id,group.box.id,n)}>
   <i className="lamp" style={{"--c":f.color}}/><span>{f.name}<small>{error||[f.zone,fixtures[f.type]].join(" · ")}</small></span><I n="plus" size={15}/></button>)}
   {!rows.length&&<Empty icon="search" title="No matching fixtures"/>}</div></Modal>;
}

export function ChannelMatrix({design,issues,change,editBox,editFixture,addBox,notify}){
 const [query,search]=useState(""),[filter,setFilter]=useState("All"),[boxId,onlyBox]=useState("");
 const [picked,pick]=useState(""),[dragging,drag]=useState(""),[hover,setHover]=useState(null),[picker,setPicker]=useState(null),[landed,land]=useState("");
 const {groups,loose}=useMemo(()=>matrixGroups(design),[design]);
 const faults=useMemo(()=>{const map=new Map();for(const i of issues.filter(i=>i.level==="error")){
  if(!map.has(i.id))map.set(i.id,[]);map.get(i.id).push(i.message);
 }return map},[issues]);
 const selected=design.fixtures.find(f=>f.id===(dragging||picked));
 useEffect(()=>{if(!landed)return;const id=setTimeout(()=>land(""),700);return()=>clearTimeout(id)},[landed]);
 useEffect(()=>{const escape=e=>{if(e.key==="Escape"){pick("");drag("");setHover(null)}};
  window.addEventListener("keydown",escape);return()=>window.removeEventListener("keydown",escape)},[]);
 const needle=selected?"":query.trim().toLowerCase(),showFilter=selected?"All":filter;
 const filterBox=groups.some(g=>g.box.id===boxId)?boxId:"";
 const visibleGroups=groups.filter(g=>!filterBox||g.box.id===filterBox);
 const available=loose.filter(f=>(f.name+" "+f.zone).toLowerCase().includes(needle));
 function move(id,destination,n){
  const result=planPatch(design,id,destination,n);
  if(result.error){notify(result.error,true);return}
  const next=applyPatch(design,result.fixture);
  if(next!==design){change(next);land(id);
   const group=groups.find(g=>g.box.id===destination);
   notify(group?result.fixture.name+" · "+group.box.name+" / "+outputName(group,n):result.fixture.name+" unpatched");
  }
  pick("");drag("");setHover(null);setPicker(null);
 }
 function start(e,f){e.dataTransfer.setData(dragType,f.id);e.dataTransfer.effectAllowed="move";drag(f.id);pick("")}
 function end(){drag("");setHover(null)}
 function over(e,destination,n){
  if(!dragging||!e.dataTransfer.types.includes(dragType))return;
  e.preventDefault();
  const key=destination+"/"+n;
  const error=hover?.key===key?hover.error:planPatch(design,dragging,destination,n).error;
  if(hover?.key!==key)setHover({key,error});
  e.dataTransfer.dropEffect=error?"none":"move";
 }
 function drop(e,destination,n){
  if(!dragging||e.dataTransfer.getData(dragType)!==dragging)return;
  e.preventDefault();move(dragging,destination,n);end();
 }
 const leave=e=>{if(!e.currentTarget.contains(e.relatedTarget))setHover(null)};
 const target=(group,n)=>selected?move(selected.id,group.box.id,n):setPicker({id:group.box.id,n});
 const tiles=(f,detail)=><FixtureTile key={f.id} f={f} detail={detail} issues={faults} active={selected?.id} landed={landed}
  choose={f=>pick(picked===f.id?"":f.id)} start={start} end={end}/>;
 const pickerGroup=picker&&groups.find(g=>g.box.id===picker.id);
 return <div className="ledger mxLedger"><main className={"page mxPage"+(dragging?" mxDragging":"")}>
  <div className="sectionHead"><h1>Channel matrix</h1><button onClick={addBox}><I n="plus" size={16}/>Add box</button></div>
  <div className="mxControls"><label className="search"><I n="search" size={16}/><input aria-label="Search matrix" placeholder="Find a fixture, box or channel" value={query} onChange={e=>search(e.target.value)}/></label>
   <select aria-label="Matrix controller" value={filterBox} onChange={e=>onlyBox(e.target.value)}><option value="">All boxes</option>{groups.map(g=><option value={g.box.id} key={g.box.id}>{g.box.name}</option>)}</select>
   <div className="mxFilters" role="group" aria-label="Show outputs">{["All","Used","Free","Issues"].map(v=><button key={v} aria-pressed={showFilter===v} onClick={()=>{pick("");setFilter(v)}}>{v}</button>)}</div>
  </div>
  {selected&&<div className="mxSelection" role="region" aria-label="Selected fixture">
   <i className="lamp" style={{"--c":selected.color}}/><strong>{selected.name}</strong><span>{hover?.error||"Choose an output"}</span>
   {!dragging&&<button onClick={()=>editFixture(selected)}><I n="edit" size={14}/>Edit</button>}
   <button className={"mxUnpatch"+(hover?.key==="/0"?" over":"")} disabled={!selected.device}
    onDragOver={e=>over(e,"",0)} onDrop={e=>drop(e,"",0)} onClick={()=>move(selected.id,"",0)}>Unpatch</button>
   <button aria-label="Cancel fixture move" onClick={()=>{pick("");end()}}><I n="x" size={14}/></button>
  </div>}
  <section className={"mxLoose"+(hover?.key==="/0"?" over":"")} aria-label="Unpatched fixtures"
   onDragEnter={e=>over(e,"",0)} onDragOver={e=>over(e,"",0)} onDragLeave={leave} onDrop={e=>drop(e,"",0)}>
   <header><I n="cable" size={17}/><h2>Unpatched</h2><span>{loose.length}</span></header>
   {!!available.length&&<div className="mxTray">{available.map(f=>tiles(f,f.zone+" · "+fixtures[f.type]))}</div>}
  </section>
  <div className="mxBanks">{visibleGroups.map(group=><ControllerBank key={group.box.id} group={group} network={design.networks.find(n=>n.id===group.box.net)}
   search={needle} filter={showFilter} selection={selected} hover={hover} issues={faults} tiles={tiles} editBox={editBox} target={target} over={over} leave={leave} drop={drop}/>)}
   <div className="mxNoMatch"><Empty icon={groups.length?"search":"box"} title={groups.length?"No matching outputs":"No controller boxes yet"}/></div>
  </div>
  {pickerGroup&&<FixturePicker design={design} group={pickerGroup} n={picker.n} move={move} close={()=>setPicker(null)}/>}
 </main></div>;
}
