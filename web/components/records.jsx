import {useState} from "react";
import {profile,hardware,protocols,sources,isSerial} from "../lib/show";
import {patchCSV} from "../lib/patch-csv";
import {patchText} from "../lib/patch";
import historical from "../lib/history.json";
import {I,Empty} from "./ui-kit";

export function saveFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function exportPatch(show,routes){
 saveFile(show.name+" patch.csv",patchCSV(show,routes),"text/csv;charset=utf-8");
}

const states=["Planned","Installed","Needs check","Spare"];
const slug=s=>s.toLowerCase().replace(/\s+/g,"-");

export function Issues({issues,open}){
 const errors=issues.filter(i=>i.level==="error").length;
 if(!issues.length)return <div className="checks passed"><I n="check"/>Patch checks passed</div>;
 return <details className="registry checks" open={errors>0||undefined}><summary><I n="chevron" size={14}/>{issues.length} patch {issues.length===1?"check":"checks"}{errors>0&&<span className="chip bad">{errors} to fix</span>}</summary>
  <div className="issueList">{issues.map(i=><button className={"issue "+i.level} key={i.id+i.message} onClick={()=>open(i.id)}><I n={i.level==="error"?"alert":"info"} size={15}/><b>{i.name}</b><span>{i.message}</span></button>)}</div></details>
}

export function Network({design,issues,editNet,editBox,locate,open}){
 const patched=design.fixtures.filter(f=>f.device).length;
 return <div className="ledger"><div className="page">
  <div className="sectionHead"><h1>Network</h1><button className="primary" onClick={()=>editNet()}><I n="plus" size={15}/>Network</button></div>
  <div className="metrics">{[[design.networks.length,"Networks","network"],[design.devices.length,"Boxes","box"],[patched,"Patched fixtures","strand"]].map(([n,label,icon],i)=><div key={label} style={{"--n":i}}><I n={icon}/><b>{n}</b><span>{label}</span></div>)}</div>
  {design.networks.map((net,i)=>{const boxes=design.devices.filter(d=>d.net===net.id);
   return <article className="bus" key={net.id} style={{"--n":i}}>
    <header><div><span className="socket"><I n="network"/></span><button className="plain strong" onClick={()=>editNet(net)}>{net.name}</button><span className="chip">{protocols[net.protocol]}</span>{isSerial(net)&&<span className="chip mono">{net.speed/1000} kbps</span>}</div><button onClick={()=>editBox(null,net.id)}><I n="plus" size={15}/>Box</button></header>
    <div className="source"><I n="route" size={15}/>{net.bridge?(design.devices.find(d=>d.id===net.bridge)?.name||"Missing bridge")+" / output "+net.output:net.source}</div>
    {boxes.map(d=>{const parent=design.devices.find(p=>p.id===d.parent),m=hardware[d.model];
     const connector=d.model==="rx"?"RF "+d.rf:d.model==="edge"?"Long range "+d.branch:net.protocol==="sacn"?"Ethernet":net.protocol==="dmx"?"DMX":"RS485";
     const flagged=issues.some(n=>n.id===d.id&&n.level==="error");
     return <div className="node" key={d.id}><span className="socket"><I n="box"/></span><button className="nodeName" onClick={()=>editBox(d)}><strong>{d.name}{flagged&&<I n="alert" size={14}/>}</strong><small>{m.name}</small></button>{isSerial(net)&&m.ports>0&&<span className="chip mono">ID {d.unit}</span>}<span className="connection">{parent?.name||net.name}<I n="chevron" size={13}/>{connector}</span><button className={d.point?"":"pending"} onClick={()=>locate(d)}><I n="pin" size={15}/>{d.point?"Move pin":"Pin on model"}</button></div>})}
    {!boxes.length&&<p className="quiet">No boxes on this network yet.</p>}
   </article>})}
  {!design.networks.length&&<Empty icon="network" title="No networks yet"><button className="primary" onClick={()=>editNet()}><I n="plus" size={15}/>Add a network</button></Empty>}
  <Issues issues={issues} open={open}/>
  <details className="registry"><summary><I n="chevron" size={14}/>Light-O-Rama manuals</summary><div className="manuals">{sources.map(([name,url])=><a className="manual" key={name} href={url} target="_blank" rel="noreferrer"><I n="book" size={15}/><span>{name}</span><I n="external" size={13}/></a>)}</div></details>
 </div></div>
}

export function Patch({design,routes,issues,edit,historyAdd,open,setState}){
 const [tab,setTab]=useState("Current patch"),[q,setQ]=useState(""),[box,setBox]=useState("all"),[only,setOnly]=useState("all"),[sort,setSort]=useState({key:"",dir:1});
 const test=(...s)=>s.join(" ").toLowerCase().includes(q.trim().toLowerCase());
 const matching=design.fixtures.filter(f=>(box==="all"||f.device===box)&&test(f.name,f.zone,f.state,f.reference,patchText(f,design)));
 const value={name:f=>f.name.toLowerCase(),patch:f=>patchText(f,design).toLowerCase(),count:f=>f.count,state:f=>states.indexOf(f.state||"Planned")};
 const rows=matching.filter(f=>only==="all"||(f.state||"Planned")===only);
 if(sort.key)rows.sort((a,b)=>{const x=value[sort.key](a),y=value[sort.key](b);return (x<y?-1:x>y?1:0)*sort.dir});
 const previous=historical.filter(r=>test(...r));const d=design.devices.find(x=>x.id===box),m=d&&profile(d);
 const used=new Set();for(const f of design.fixtures.filter(f=>f.device===box)){if(m?.kind==="dc"&&f.type==="rgb"){const first=(f.port-1)*3+1;[first,first+1,first+2].forEach(p=>used.add(p))}else used.add(f.port)}
 const flagged=new Set(issues.filter(i=>i.level==="error").map(i=>i.id));
 const head=(label,key)=><th aria-sort={sort.key===key?(sort.dir>0?"ascending":"descending"):undefined}><button className="plain sortBtn" onClick={()=>setSort(s=>s.key!==key?{key,dir:1}:s.dir>0?{key,dir:-1}:{key:"",dir:1})}>{label}{sort.key===key&&<I n={sort.dir>0?"up":"down"} size={13}/>}</button></th>;
 const tabs=["Current patch","Historical setup"];
 return <div className="ledger"><div className="page">
  <div className="sectionHead"><h1>Patch book</h1><div className="actions"><button onClick={()=>window.print()}><I n="printer" size={15}/>Print labels</button><button disabled={!routes} onClick={()=>exportPatch(design,routes)}><I n="download" size={15}/>Export CSV</button></div></div>
  <div className="tabs" style={{"--i":tabs.indexOf(tab)}}>{tabs.map(t=><button className={t===tab?"active":""} key={t} onClick={()=>{setTab(t);setQ("")}}>{t}</button>)}</div>
  <div className="filters"><label className="search"><I n="search" size={15}/><input aria-label="Search patch" placeholder="Search fixtures or channels" value={q} onChange={e=>setQ(e.target.value)}/>{q&&<button type="button" className="plain clear" aria-label="Clear search" onClick={()=>setQ("")}><I n="x" size={13}/></button>}</label>
   {tab==="Current patch"&&<select aria-label="Filter by box" value={box} onChange={e=>setBox(e.target.value)}><option value="all">All boxes</option><option value="">Unpatched</option>{design.devices.filter(d=>hardware[d.model].ports).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}
   {tab==="Current patch"&&<div className="stateFilter" role="group" aria-label="Filter by installation">{["all",...states].map(s=>{const n=s==="all"?matching.length:matching.filter(f=>(f.state||"Planned")===s).length;return (s==="all"||n>0)&&<button key={s} className={"chipBtn s-"+slug(s)} aria-pressed={only===s} onClick={()=>setOnly(s)}>{s==="all"?"All":s}<small>{n}</small></button>})}</div>}
  </div>
  {tab==="Historical setup"?<>
   <div className="tableWrap"><table className="historyTable"><thead><tr><th>Previous address</th><th>Fixture</th><th>Notes</th><th></th></tr></thead><tbody>{previous.map((r,i)=><tr key={i}><td className="mono">{r[0]}</td><td>{r[1]}</td><td className="dim">{r[2]}</td><td className="end"><button onClick={()=>historyAdd(r)}><I n="plus" size={14}/>Plan fixture</button></td></tr>)}</tbody></table>{!previous.length&&<Empty icon="search" title="No matching entries"/>}</div>
  </>:<>
   {d&&m?.ports>0&&<details className="registry"><summary><I n="chevron" size={14}/>{Math.max(0,m.ports-used.size)} free outputs on {d.name}</summary><div className="ports">{Array.from({length:m.ports},(_,i)=>i+1).map(i=><i key={i} className={used.has(i)?"used":""}>{i}</i>)}</div></details>}
   <div className="tableWrap"><table className="patchTable"><thead><tr>{head("Fixture","name")}{head("Box / output / address","patch")}{head("Quantity","count")}{head("Installation","state")}</tr></thead><tbody>{rows.map(f=>{const patch=patchText(f,design),state=f.state||"Planned";
    return <tr key={f.id}><td><button className="plain strong" onClick={()=>edit(f)}><i className="lamp" style={{"--c":f.color}}/>{f.name}{flagged.has(f.id)&&<I n="alert" size={14}/>}</button><small>{f.zone}</small></td><td className={patch==="Unpatched"?"dim":"mono"}>{patch}</td><td className="mono">{f.count}</td><td><select className={"stateChip s-"+slug(state)} aria-label={"Installation status for "+f.name} value={state} onChange={e=>setState(f,e.target.value)}>{states.map(s=><option key={s}>{s}</option>)}</select></td></tr>})}</tbody></table>
    {!rows.length&&<Empty icon="search" title={design.fixtures.length?"No matching fixtures":"No fixtures yet"}/>}</div>
   <Issues issues={issues} open={open}/>
  </>}
 </div></div>
}
