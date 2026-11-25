import {useEffect,useRef,useState} from "react";
import {id,sample,showSchema} from "../lib/show";
const key="lampey.studio.v1";
const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{}}catch{return {}}};
async function remote(path,opts){const r=await fetch("/api/projects"+path,opts);if(!r.ok)throw Object.assign(Error(r.statusText),{status:r.status});return r.json()}
export function useProjects(){
 const [view,render]=useState(0),[list,setList]=useState([]),[message,setMessage]=useState("Opening…");
 const current=useRef(null),records=useRef(new Map()),sequence=useRef(0),past=useRef([]),future=useRef([]),active=useRef(true);
 const bump=()=>{if(active.current)render(v=>v+1)};
 function persist(r){try{const data=read();data[r.id]={id:r.id,revision:r.revision,design:r.design,dirty:r.dirty,conflict:r.conflict};localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}}
 function refresh(){return remote("").then(rows=>{if(active.current)setList(rows)}).catch(()=>{})}
 function select(r){if(!r.design.plants||!r.design.cables)r.design=showSchema.parse(r.design);current.current=r;records.current.set(r.id,r);past.current=[];future.current=[];try{localStorage.setItem(key+".last",r.id)}catch{}setMessage(r.conflict?"Save a copy to keep edits":r.dirty?"Saved on device":"Saved");bump();if(r.dirty&&!r.conflict)schedule(r)}
 function schedule(r){clearTimeout(r.timer);r.timer=setTimeout(()=>flush(r),850)}
 async function flush(r){if(!r||!r.dirty||r.busy||r.conflict)return; r.busy=true;const design=r.design;
  if(current.current===r&&active.current)setMessage("Saving…");
  try{const result=await remote("",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:r.id,revision:r.revision,design})});
   r.revision=result.revision;r.dirty=r.design!==design;persist(r);if(current.current===r&&active.current)setMessage(r.dirty?"Saving…":"Saved");if(r.dirty)schedule(r);else refresh()
  }catch(e){r.conflict=e.status===409;const local=persist(r);if(current.current===r&&active.current)setMessage(r.conflict?"Conflict · save a copy":local?"On device · retry save":"Unsaved · export backup")}finally{r.busy=false;bump()}}
 async function open(projectId,force=false){const ticket=++sequence.current;const local=records.current.get(projectId)||read()[projectId];
  if(local?.dirty&&!force){select(local);return}
  try{const data=await remote("?id="+encodeURIComponent(projectId));if(ticket===sequence.current&&active.current){const r={id:projectId,...data,dirty:false};persist(r);select(r)}}
  catch{if(ticket===sequence.current&&active.current){if(local)select(local);else setMessage("Could not open project")}}}
 function create(design){sequence.current++;const r={id:id(),revision:0,design:showSchema.parse(design),dirty:true};persist(r);select(r)}
 useEffect(()=>{active.current=true;let cancelled=false;
  (async()=>{const cached=localStorage.getItem(key+".last");if(cached&&read()[cached]?.dirty){if(!cancelled)await open(cached);refresh();return}
   let rows=[];try{rows=await remote("")}catch{}if(cancelled)return;setList(rows);
   if(cached&&(read()[cached]||rows.some(r=>r.id===cached)))await open(cached);else if(rows[0])await open(rows[0].id);else create(sample())})();
  const retry=()=>flush(current.current);window.addEventListener("online",retry);return()=>{cancelled=true;active.current=false;window.removeEventListener("online",retry)}
 },[]);
 function replace(next){const r=current.current;r.design=next;r.dirty=true;const local=persist(r);setMessage(r.conflict?"Conflict · save a copy":local?"Saved on device":"Saving…");schedule(r);bump()}
 function change(next){past.current=[...past.current.slice(-39),current.current.design];future.current=[];replace(next)}
 function undo(){if(!past.current.length)return;future.current.push(current.current.design);replace(past.current.pop())}
 function redo(){if(!future.current.length)return;past.current.push(current.current.design);replace(future.current.pop())}
 const projects=()=>Array.from(new Map([...Object.values(read()).map(r=>({id:r.id,name:r.design.name})),...list].map(r=>[r.id,r])).values());
 return {design:current.current?.design,id:current.current?.id,conflict:current.current?.conflict,status:message,change,open,create,projects,undo,redo,canUndo:past.current.length>0,canRedo:future.current.length>0,retry:()=>flush(current.current)};
}

