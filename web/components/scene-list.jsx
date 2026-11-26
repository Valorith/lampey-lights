import {useEffect,useRef} from "react";
import {I,Tool,Empty} from "./ui-kit";

const extraGroups=[["Garden","plants","tree"],["Equipment","devices","box"],["Cables","cables","cable"]];

function Group({title,rows,open,toggleAll,children}){
 const visible=toggleAll&&rows.some(r=>r.visible);
 return <details open={open} className="group"><summary><I n="chevron" size={13}/><span>{title}</span><small>{rows.length}</small>
  {toggleAll&&<button type="button" className="plain groupEye" aria-label={(visible?"Hide all in ":"Show all in ")+title} data-tip={visible?"Hide all":"Show all"} data-tip-pos="down-end" onClick={e=>{e.preventDefault();toggleAll(!visible)}}><I n={visible?"eye":"eyeOff"} size={15}/></button>}
 </summary>{children}</details>
}

export function SceneList({design,sel,search,setSearch,searchRef,issues,select,frame,setVisible,hover,openToolbox,collapse,closeMobile,open}){
 const list=useRef(null),query=search.trim().toLowerCase();
 const zones=[...new Set(design.fixtures.map(x=>x.zone))];
 const shown=design.fixtures.filter(x=>(x.name+" "+x.zone).toLowerCase().includes(query));
 const flagged=new Map(issues.filter(i=>i.level==="error").map(i=>[i.id,i.message]));
 const extras=extraGroups.map(([title,group,icon])=>({title,group,icon,rows:(design[group]||[]).filter(v=>v.name.toLowerCase().includes(query))}));
 const total=shown.length+extras.reduce((n,g)=>n+g.rows.length,0);
 const lights=design.fixtures.reduce((a,x)=>a+x.count,0);
 // Keep the row for whatever was picked in the 3D view within sight.
 useEffect(()=>{if(!sel)return;const row=list.current?.querySelector(".row.selected");if(!row)return;const group=row.closest("details");if(group&&!group.open)group.open=true;row.scrollIntoView({block:"nearest"})},[sel]);
 const row=(v,group,lead)=><div key={v.id} className={"row"+(v.id===sel?" selected":"")+(v.visible===false?" off":"")} onMouseEnter={()=>hover(v.id)} onMouseLeave={()=>hover("")}>
  <button type="button" className="rowMain" onClick={()=>select(v.id,group)} onDoubleClick={()=>frame(v.id)}>{lead}<span>{v.name}</span>
   {group==="fixtures"&&!v.points.length&&<em>Unplaced</em>}
   {flagged.has(v.id)&&<b className="rowFlag" data-tip={flagged.get(v.id)} data-tip-pos="down-end"><I n="alert" size={14}/></b>}</button>
  {group!=="devices"&&<button type="button" className="plain rowEye" aria-label={(v.visible?"Hide ":"Show ")+v.name} onClick={()=>setVisible(group,[v],!v.visible)}><I n={v.visible?"eye":"eyeOff"} size={15}/></button>}
 </div>;
 return <aside className={"library"+(open?" mobileOpen":"")} aria-label="Scene">
  <div className="libHead"><h2>Scene</h2><Tool n="sidebar" label="Hide scene panel" tip="Hide panel · [" pos="down-end" className="collapseBtn" action={collapse}/><button type="button" className="mobileClose tool" aria-label="Close scene panel" onClick={closeMobile}><I n="x"/></button></div>
  <button type="button" className="primary add" onClick={openToolbox}><I n="plus"/>Toolbox<kbd>T</kbd></button>
  <label className="search"><I n="search" size={15}/><input ref={searchRef} aria-label="Find in scene" placeholder="Find in scene" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"){setSearch("");e.currentTarget.blur()}}}/>{search?<button type="button" className="plain clear" aria-label="Clear search" onClick={()=>setSearch("")}><I n="x" size={13}/></button>:<kbd>/</kbd>}</label>
  <div className="groupList" ref={list}>
   {!design.fixtures.length&&!query&&<Empty title="No lights yet"><button type="button" className="primary" onClick={openToolbox}><I n="plus" size={15}/>Add lights</button></Empty>}
   {zones.map(z=>{const rows=shown.filter(x=>x.zone===z);return rows.length>0&&<Group key={z} title={z} rows={rows} open toggleAll={on=>setVisible("fixtures",rows,on)}>{rows.map(x=>row(x,"fixtures",<i className="lamp" style={{"--c":x.color}}/>))}</Group>})}
   {extras.map(g=>g.rows.length>0&&<Group key={g.group} title={g.title} rows={g.rows} open={query?true:undefined} toggleAll={g.group!=="devices"&&(on=>setVisible(g.group,g.rows,on))}>{g.rows.map(v=>row(v,g.group,g.group==="cables"?<i className="wire" style={{"--c":v.color}}/>:<I n={g.icon} size={15}/>))}</Group>)}
   {!total&&query&&<Empty icon="search" title="Nothing found"><button type="button" onClick={()=>setSearch("")}>Clear search</button></Empty>}
  </div>
  <div className="libBottom"><I n="strand" size={15}/><span><b>{lights.toLocaleString()}</b> lights</span><span><b>{zones.length}</b> {zones.length===1?"area":"areas"}</span></div>
 </aside>
}
