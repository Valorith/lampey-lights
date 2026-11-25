import {profile} from "../lib/show";
import {useState} from "react";
import {hardware,protocols,fixtures,sources,address,isSerial,feet,length} from "../lib/show";
import {patchText} from "../lib/patch";
import historical from "../lib/history.json";
export function saveFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function exportPatch(show){
 const rows=[["Fixture","Area","Type","Box / output / address","Quantity","Pixel offset","Status","Previous patch","Notes","Modeled strand length (ft)"],...show.fixtures.map(f=>[f.name,f.zone,fixtures[f.type],patchText(f,show),f.count,f.offset,f.state||"Planned",f.reference,f.notes,f.shape==="run"?(length(f)/.3048).toFixed(1):""])];
 const escape=v=>{let s=String(v??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 saveFile(show.name+" patch.csv","\uFEFF"+rows.map(r=>r.map(escape).join(",")).join("\r\n"),"text/csv;charset=utf-8");
}
export function Issues({issues,open}){return <details className="registry"><summary>{issues.length?issues.length+" patch checks":"Patch checks passed"}</summary>{issues.map(i=><button className="issue" key={i.id+i.message} onClick={()=>open(i.id)}><b>{i.name}</b><span>{i.message}</span></button>)}</details>}
export function Network({design,issues,editNet,editBox,locate,open}){
 return <div className="ledger"><div className="sectionHead"><div><h1>Network</h1></div><button className="primary" onClick={()=>editNet()}>＋ Network</button></div>
 <div className="metrics"><div><b>{design.networks.length}</b> Networks</div><div><b>{design.devices.length}</b> Boxes</div><div><b>{design.fixtures.filter(f=>f.device).length}</b> Patched fixtures</div></div>
 {design.networks.map(net=>{const boxes=design.devices.filter(d=>d.net===net.id);return <article className="bus" key={net.id}><header><div><span className="socket">⌁</span><button className="plain strong" onClick={()=>editNet(net)}>{net.name}</button><small>{protocols[net.protocol]}</small></div><button onClick={()=>editBox(null,net.id)}>＋ Box</button></header><div className="source">↳ {net.bridge?(design.devices.find(d=>d.id===net.bridge)?.name||"Missing bridge")+" / output "+net.output:net.source} {isSerial(net)&&" · "+net.speed/1000+" kbps"}</div>
 {boxes.map(d=>{const parent=design.devices.find(p=>p.id===d.parent);const m=hardware[d.model];const connector=d.model==="rx"?"RF "+d.rf:d.model==="edge"?"Long range "+d.branch:net.protocol==="sacn"?"Ethernet":net.protocol==="dmx"?"DMX":"RS485";
 return <div className="node" key={d.id}><span className="socket">▦</span><button className="nodeName" onClick={()=>editBox(d)}><strong>{d.name}</strong><small>{m.name}{isSerial(net)&&m.ports>0?" · ID "+d.unit:""}</small></button><span className="connection">{parent?.name||net.name} → {connector}</span><button onClick={()=>locate(d)}>{d.point?"Move pin":"Pin on model"}</button></div>})}</article>})}
 {!design.networks.length&&<p>Add a network to connect your first controller.</p>}<Issues issues={issues} open={open}/><details className="registry"><summary>Light-O-Rama manuals</summary>{sources.map(([name,url])=><a className="manual" key={name} href={url} target="_blank" rel="noreferrer">{name} ↗</a>)}</details></div>
}
export function Patch({design,issues,edit,historyAdd,open}){
 const [tab,setTab]=useState("Current patch"),[q,setQ]=useState(""),[box,setBox]=useState("all");
 const test=(...s)=>s.join(" ").toLowerCase().includes(q.trim().toLowerCase());
 const rows=design.fixtures.filter(f=>(box==="all"||f.device===box)&&test(f.name,f.zone,f.state,f.reference,patchText(f,design)));
 const previous=historical.filter(r=>test(...r));const d=design.devices.find(x=>x.id===box),m=d&&profile(d);
 const used=new Set();for(const f of design.fixtures.filter(f=>f.device===box)){if(m?.kind==="dc"&&f.type==="rgb"){const first=(f.port-1)*3+1;[first,first+1,first+2].forEach(p=>used.add(p))}else used.add(f.port)}
 return <div className="ledger"><div className="sectionHead"><div><h1>Patch book</h1></div><div className="actions"><button onClick={()=>window.print()}>Print labels</button><button onClick={()=>exportPatch(design)}>Export CSV</button></div></div>
 <div className="tabs">{["Current patch","Historical setup"].map(t=><button className={t===tab?"active":""} key={t} onClick={()=>{setTab(t);setQ("")}}>{t}</button>)}</div>
 <div className="filters"><input aria-label="Search patch" placeholder="Search fixtures or channels" value={q} onChange={e=>setQ(e.target.value)}/>{tab==="Current patch"&&<select aria-label="Filter by box" value={box} onChange={e=>setBox(e.target.value)}><option value="all">All boxes</option><option value="">Unpatched</option>{design.devices.filter(d=>hardware[d.model].ports).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}</div>
 {tab==="Historical setup"?<><p>{previous.length} historical entries</p><div className="tableWrap"><table><thead><tr><th>Previous address</th><th>Fixture</th><th>Notes</th><th></th></tr></thead><tbody>{previous.map((r,i)=><tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td><button onClick={()=>historyAdd(r)}>Plan fixture</button></td></tr>)}</tbody></table></div></>:<>
 {d&&m?.ports>0&&<details className="registry"><summary>{Math.max(0,m.ports-used.size)} free outputs on {d.name}</summary><p>{Array.from({length:m.ports},(_,i)=>i+1).filter(i=>!used.has(i)).join(", ")||"All outputs assigned"}</p></details>}
 <div className="tableWrap"><table><thead><tr><th>Fixture</th><th>Box / output / address</th><th>Quantity</th><th>Installation</th></tr></thead><tbody>{rows.map(f=><tr key={f.id}><td><button className="plain strong" onClick={()=>edit(f)}><i style={{background:f.color}}/>{f.name}</button><small>{f.zone}</small></td><td>{patchText(f,design)}</td><td>{f.count}</td><td>{f.state||"Planned"}</td></tr>)}</tbody></table>{!rows.length&&<p>No matching fixtures.</p>}</div><Issues issues={issues} open={open}/></>}</div>
}

