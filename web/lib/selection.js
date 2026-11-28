import {mountedFixture} from "./garden.js";
import {detachCables} from "./stage.js";
import {seriesName,wallYaw} from "./draw-tools.js";
import {updateProp} from "./prop-transform.js";

// Multi-item editing: copy, paste, move, and remove scene items as a group.
// Groups that can be selected in the scene. Cables follow their endpoints.
export const selectableGroups=["fixtures","plants","devices"];
const limits={fixtures:300,plants:150,devices:200};
const add=(p,d)=>p.map((v,i)=>v+d[i]);

export function findRow(design,id){
 for(const group of selectableGroups){const row=design?.[group]?.find(r=>r.id===id);if(row)return {group,row}}
 return null;
}

// The point a row is placed by: a prop's base, or the middle of a strand.
export function rowAnchor(group,row){
 if(group==="fixtures"){if(!row.points.length)return null;if(row.shape!=="run")return row.points[0];return [0,1,2].map(k=>row.points.reduce((n,p)=>n+p[k],0)/row.points.length)}
 return row.point||null;
}

export function selectionCentre(design,ids){
 const pts=ids.map(id=>{const hit=findRow(design,id);return hit&&rowAnchor(hit.group,hit.row)}).filter(Boolean);
 return pts.length?[0,1,2].map(k=>pts.reduce((n,p)=>n+p[k],0)/pts.length):null;
}

// Translate a row in world space. `ground` re-seats plants on the terrain below.
export function translateRow(group,row,delta,ground){
 if(row.locked)return row;
 if(group==="plants"){const point=add(row.point,delta);return {...row,point:ground?.(point)||point}}
 if(group==="devices")return row.point?{...row,point:add(row.point,delta)}:row;
 if(!row.points.length||row.plant)return row;
 return {...row,points:row.points.map(p=>add(p,delta)),mount:""};
}

// Apply a list of {group,row} replacements, keeping plant-mounted strands attached.
export function applyRows(design,rows){return rows.reduce((d,{group,row})=>updateProp(d,group,row),design)}

export function moveRows(design,ids,delta,ground){
 const rows=ids.map(id=>findRow(design,id)).filter(Boolean).map(({group,row})=>({group,row:translateRow(group,row,delta,ground)})).filter(({row})=>row!==findRow(design,row.id)?.row);
 return rows.length?applyRows(design,rows):design;
}

// Snapshot the selection. Plant-mounted strands come along only with their plant.
export function copyRows(design,ids){
 const wanted=new Set(ids),items=[];
 for(const id of ids){
  const hit=findRow(design,id);if(!hit)continue;
  const {group,row}=hit;
  if(group==="fixtures"&&row.plant&&!wanted.has(row.plant))continue;
  if(group!=="plants"&&!rowAnchor(group,row))continue;
  items.push({group,row:structuredClone(row)});
 }
 // A copied plant brings the lights mounted on it, even when only the plant was picked.
 for(const f of design.fixtures)if(f.plant&&wanted.has(f.plant)&&!items.some(i=>i.row.id===f.id)&&(!f.endPlant||wanted.has(f.endPlant)||f.endPlant===f.plant))items.push({group:"fixtures",row:structuredClone(f)});
 if(!items.length)return null;
 const anchors=items.filter(i=>!i.row.plant).map(i=>rowAnchor(i.group,i.row)).filter(Boolean);
 const anchor=[0,1,2].map(k=>anchors.reduce((n,p)=>n+p[k],0)/anchors.length);
 return {items,anchor};
}

// "Porch bush 2" continues as "Porch bush 5" rather than "Porch bush 2 2".
export function nextName(name,used){
 const m=/^(.*\S) (\d+)$/.exec(name);if(!m)return seriesName(name,used);
 const taken=new Set(used);
 for(let n=Number(m[2])+1;;n++){const suffix=" "+n,next=m[1].slice(0,160-suffix.length)+suffix;if(!taken.has(next))return next}
}
const hex=n=>n.toString(16).toUpperCase().padStart(2,"0");

/**
 * Paste a clipboard snapshot as new rows. Either `to` (a point in the scene, with
 * an optional surface `normal`) or `offset` positions the copies.
 * Returns {design, ids} or {error}.
 */
export function pasteRows(design,clip,{to,normal,offset,ground,makeId=()=>crypto.randomUUID()}={}){
 if(!clip?.items.length)return {error:"Nothing to paste."};
 const delta=to?to.map((v,i)=>v-clip.anchor[i]):offset||[0,0,0];
 const counts={fixtures:design.fixtures.length,plants:(design.plants||[]).length,devices:design.devices.length};
 const network=design.networks[0]?.id;
 const items=clip.items.filter(i=>i.group!=="devices"||network);
 for(const group of selectableGroups){const n=items.filter(i=>i.group===group).length;if(n&&counts[group]+n>limits[group])return {error:"This show allows up to "+limits[group]+" "+group+"."}}
 if(!items.length)return {error:"Add a network before pasting equipment."};
 const ids=new Map(items.map(i=>[i.row.id,makeId()]));
 const names=Object.fromEntries(selectableGroups.map(g=>[g,(design[g]||[]).map(r=>r.name)]));
 // One prop pasted at the cursor takes the surface under it, just like placing it.
 const single=items.length===1&&to&&normal?items[0]:null,units=[];
 const rows=items.map(({group,row})=>{
  const name=nextName(row.name,names[group]);names[group].push(name);
  let next={...structuredClone(row),id:ids.get(row.id),name,locked:false};
  if(single&&group!=="plants"&&!(group==="fixtures"&&row.shape==="run")){
   if(group==="devices")next={...next,point:to,normal};
   else next={...next,points:[to],normal,mount:"",normals:undefined,yaw:row.shape==="flood"?row.yaw:wallYaw(normal)??row.yaw};
  }else if(!(group==="fixtures"&&row.plant))next=translateRow(group,next,delta,ground);
  if(group==="fixtures"){next={...next,device:"",autoCord:undefined};if(row.plant)next={...next,plant:ids.get(row.plant),endPlant:ids.get(row.endPlant)||ids.get(row.plant)}}
  if(group==="devices"){
   // A copied box gets its own address so it does not collide with the original.
   const net=design.networks.some(n=>n.id===row.net)?row.net:network,used=new Set([...design.devices,...units].filter(d=>d.net===net).map(d=>d.unit));
   let unit=parseInt(row.unit,16)||0;for(let i=0;i<256&&used.has(hex(unit));i++)unit=(unit+1)%256;
   next={...next,parent:"",net,unit:hex(unit),ip:""};units.push(next);
  }
  return {group,row:next};
 });
 let next={...design};
 for(const group of selectableGroups){const added=rows.filter(r=>r.group===group).map(r=>r.row);if(added.length)next[group]=[...(design[group]||[]),...added]}
 // Mounted lights follow their new plant.
 const plants=new Set(rows.filter(r=>r.group==="plants").map(r=>r.row.id));
 if(plants.size)next.fixtures=next.fixtures.map(f=>plants.has(f.plant)?mountedFixture(f,next.plants):f);
 return {design:next,ids:rows.map(r=>r.row.id)};
}

// Remove rows as the single-item remove does: detach dependants rather than deleting them.
export function removeRows(design,items){
 let updated={...design};
 for(const {group,row:v} of items){
  if(group==="cables"&&v.inferred){updated.fixtures=updated.fixtures.map(f=>"f/"+f.id===v.to?{...f,autoCord:false}:f);continue}
  updated={...updated,[group]:(updated[group]||[]).filter(x=>x.id!==v.id)};
  if(group==="devices"||group==="networks"){
   const removed=new Set(group==="networks"?updated.devices.filter(d=>d.net===v.id).map(d=>d.id):[v.id]);
   updated.devices=updated.devices.filter(d=>!removed.has(d.id)).map(d=>removed.has(d.parent)?{...d,parent:""}:d);
   updated.networks=updated.networks.map(n=>removed.has(n.bridge)?{...n,bridge:""}:n);
   updated.fixtures=updated.fixtures.map(f=>removed.has(f.device)?{...f,device:""}:f);
  }
  if(group==="plants")updated.fixtures=updated.fixtures.map(f=>f.plant===v.id||f.endPlant===v.id?{...f,plant:undefined,endPlant:undefined,dressing:undefined}:f);
  if(group==="cables")updated.fixtures=updated.fixtures.map(f=>[v.from,v.to].includes("f/"+f.id)&&[v.from,v.to].includes("d/"+f.device)?{...f,autoCord:false}:f);
 }
 updated.cables=detachCables(design,updated);
 return updated;
}
