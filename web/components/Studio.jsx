"use client";
import "../app/stage.css";
import {useEffect,useMemo,useRef,useState} from "react";
import {useProjects} from "../hooks/use-projects";
import {id,sample,showSchema,defaultNet,defaultDevice,defaultFixture,fixtures,hardware,feet} from "../lib/show";
import {review,patchText} from "../lib/patch";
import {Modal,Field,FixtureForm,NetworkForm,DeviceForm} from "./forms";
import {Toolbox,PlantForm,DressForm,CableForm} from "./toolbox";
import {editRoutePoint} from "../lib/route-edit.js";
import {sceneProp,scaleProp,rotateProp,updateProp} from "../lib/prop-transform";
import {Controller} from "./controller";
import {ChannelMatrix} from "./channel-matrix";
import {applyPatch,planPatch} from "../lib/matrix";
import {newPlant,mountedFixture,species} from "../lib/garden";
import {defaultCable,sceneCables,cablePoints,cableKinds,measuredLength,cordLabel,endpoints,aimAt,detachCables} from "../lib/stage";
import {Network,Patch,saveFile,exportPatch} from "./records";
import {I,Tool,Kbd,Toaster,useToasts,usePref} from "./ui-kit";
import {SceneList} from "./scene-list";
import {CommandPalette,Shortcuts} from "./command-palette";
import {DrawBar,PropBar,strandPresets,presetSpacing,toolKeys} from "./draw-bar";
import {drawTools,toolDefaults,lightCount,seriesName,wallYaw} from "../lib/draw-tools";

const tabs=[["Layout","layout"],["Network","network"],["Patch","patch"],["Matrix","matrix"]];
const views=["Street","Street trees","Front","Driveway","Back stairs","Pool","Rear elevation","Overhead"];
const saveKind=s=>s==="Saved"?"ok":/Saving|Opening/.test(s)?"busy":s==="Saved on device"?"local":"warn";
const Bulbs=()=><span className="bulbs" aria-hidden="true"><i/><i/><i/><i/><i/></span>;

function Viewport({state,events,engine}){const host=useRef(null),handlers=useRef(events),latest=useRef(state);handlers.current=events;latest.current=state;
 useEffect(()=>{let cancel=false,instance;import("./scene-engine").then(({createScene})=>{if(cancel)return;instance=createScene(host.current,Object.fromEntries(["pick","editPoint","place","anchor","ready","fail","propPreview","propDrop","propTransform","shape","finish"].map(k=>[k,(...args)=>handlers.current[k](...args)])));engine.current=instance;instance.update(latest.current)}).catch(()=>handlers.current.fail("Could not start 3D view."));return()=>{cancel=true;instance?.dispose();engine.current=null}},[]);
 useEffect(()=>{engine.current?.update(state)},[state,engine]);return <div className="sceneHost" ref={host}/>
}

export default function Studio(){
 const store=useProjects(),design=store.design;
 const [tab,setTab]=useState("Layout"),[dialog,dlg]=useState(null),[sel,pick]=useState(""),[hover,setHover]=useState(""),[search,filter]=useState(""),[play,setPlay]=useState(false),[view,setView]=useState("Street"),[mode,setMode]=useState("select"),[draft,setDraft]=useState([]),[pending,setPending]=useState(null),[ready,setReady]=useState(false),[mobile,setMobile]=useState(false),[projectName,setProjectName]=useState(""),[full,setFull]=useState(false);
 const [night,setNight]=usePref("night",true),[labels,setLabels]=usePref("labels",false),[wiring,setWiring]=usePref("wiring",false),[panel,setPanel]=usePref("panel",true);
 const [dragPreview,setDragPreview]=useState(null);
 const [routes,setRoutes]=useState(null);
 const sceneDesign=useMemo(()=>dragPreview&&dragPreview.base===design?updateProp(design,dragPreview.prop.group,dragPreview.row):design,[design,dragPreview]);
 // Strand drawing: the active tool and its options persist; series keeps the tool live for one strand after another.
 const [tool,setTool]=usePref("tool","path"),[toolOpts,setToolOpts]=usePref("toolOpts",toolDefaults),[spacing,setSpacing]=usePref("spacing",3),[preset,setPresetName]=usePref("preset","Pixel strand");
 const [series,setSeries]=useState(false),[turn,setTurn]=useState(null),[repeat,setRepeat]=useState(false);
 const [lift,setLift]=useState(0);const draftNormals=useRef([]);const viewport=useRef(null),searchBox=useRef(null),keys=useRef(null);
 const {toasts,toast,dismiss,settle}=useToasts();
 const engine=useRef(null),file=useRef(null);const issues=useMemo(()=>design?review(design):[],[design]);
 const f=design?.fixtures.find(v=>v.id===sel);
 const d=design?.devices.find(row=>row.id===sel),p=design?.plants?.find(row=>row.id===sel),c=useMemo(()=>design?(routes?.cables(design)??sceneCables(design)).find(row=>row.id===sel):null,[design,sel,routes]);
 const cableDraft=useMemo(()=>{if(mode!=="cable"||!pending||!design)return draft;const ends=endpoints(design);return [ends.find(e=>e.id===pending.from)?.point,...draft,ends.find(e=>e.id===pending.to)?.point].filter(Boolean)},[mode,pending,design,draft]);
 const ghost=useMemo(()=>!pending?null:mode==="draw"?{color:pending.color,count:pending.count,spacing:series?spacing:0}:mode==="prop"?{...pending,yaw:turn??pending.yaw,autoYaw:turn===null&&pending.shape!=="flood"}:mode==="plant"?pending:null,[pending,mode,series,spacing,turn]);
 const sceneState=useMemo(()=>({active:tab==="Layout",lift,design:sceneDesign,savedDesign:design,sel,hover,night,play,labels,wiring,mode,tool:drawTools[tool]?tool:"path",toolOpts,ghost,draft:cableDraft,routeStyle:mode==="cable"?pending?.style:null,routeSag:pending?.sag,routeColor:pending?.color}),[tab,lift,sceneDesign,design,sel,hover,night,play,labels,wiring,mode,tool,toolOpts,ghost,cableDraft,pending]);
 const reset=()=>{setDragPreview(null);setMode("select");setDraft([]);setPending(null);setSeries(false);setRepeat(false);setTurn(null)};
 useEffect(()=>{pick("");reset();dlg(null);setPlay(false);filter("")},[store.id]);
 useEffect(()=>{if(tab!=="Layout"){setPlay(false);reset()}},[tab]);
 useEffect(()=>{const fn=e=>keys.current?.(e);window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[]);
 useEffect(()=>{const fn=()=>setFull(!!document.fullscreenElement);document.addEventListener("fullscreenchange",fn);return()=>document.removeEventListener("fullscreenchange",fn)},[]);
 if(!design)return <main className="opening"><img src="/favicon.svg" width="52" height="52" alt=""/><Bulbs/><span>{store.status==="Could not open project"?store.status:"Opening Lampey Lights"}</span></main>;
 const setError=message=>toast(message,{kind:"error"});
 const removed=v=>toast("Removed "+v.name,{action:{label:"Undo",run:()=>store.undo()}});
 const close=()=>dlg(null);
 function upsert(group,row){if(group==="cables"&&row.inferred){const {inferred,...custom}=row;row=custom}const old=group==="fixtures"&&design.fixtures.find(f=>f.id===row.id);store.change(old&&(old.port!==row.port||old.device!==row.device)?applyPatch(design,row):updateProp(design,group,row))}
 const activeProp=sceneProp(design,sel);
 function toggleLock(){if(activeProp)upsert(activeProp.group,{...activeProp.row,locked:!activeProp.row.locked})}
 function propTransform(prop,operation,amount){
  store.change(current=>{
   const live=sceneProp(current,prop.row.id);
   if(!live)return current;
   const row=operation==="rotate"?rotateProp(live,amount):scaleProp(live,amount);
   return row===live.row?current:updateProp(current,live.group,row);
  },operation+"/"+prop.row.id);
 }
 function propDrop(prop,row){
  store.change(current=>sceneProp(current,prop.row.id)?.row===prop.row?updateProp(current,prop.group,row):current);
 }
 const lockButton=activeProp&&<button type="button" className="propLock" aria-label={activeProp.row.locked?"Unlock prop":"Lock prop"} title={activeProp.row.locked?"Unlock prop transforms":"Lock prop transforms"} onClick={toggleLock}><I n={activeProp.row.locked?"lock":"unlock"} size={15}/>{activeProp.row.locked?"Unlock":"Lock"}</button>;
 function edit(row,over={}){dlg({kind:"fixture",v:row||{...defaultFixture(),name:"New strand",state:"Planned",...over},existing:!!row})}
 function net(n){dlg({kind:"network",v:n||defaultNet(),existing:!!n})}
 function box(d,netId){dlg({kind:"device",v:d||defaultDevice(netId||design.networks[0]?.id),existing:!!d})}
 function openRecord(v){const fx=design.fixtures.find(x=>x.id===v),d=design.devices.find(x=>x.id===v),n=design.networks.find(x=>x.id===v);if(fx)edit(fx);else if(d)box(d);else if(n)net(n)}
 function cableForm(v,existing=false){setWiring(true);dlg({kind:"cable",v:routes?.editableCable(v,design)??v,existing})}
 function plantLights(plant,fixture){dlg({kind:"dress",v:fixture||{...defaultFixture(),name:plant.name+" lights",zone:"Front yard",plant:plant.id,endPlant:plant.id,dressing:["deciduous","birch","winterberry"].includes(plant.kind)?"pendant":"wrap",branchA:0,branchB:4,drop:.8,turns:5,count:60,mount:"",points:[]}})}
 function placeEquipment(model){
  const m=hardware[model],protocol=m.net.includes("sacn")&&(!m.ports||m.net.length===1)?"sacn":m.net.includes("elor")?"elor":m.net[0];
  const n=design.networks.find(n=>n.protocol===protocol)||{...defaultNet(),protocol,name:protocol==="sacn"?"Show LAN":protocol==="lor"?"Regular":"Enhanced LOR",speed:protocol==="sacn"?0:protocol==="lor"?57600:500000,source:protocol==="sacn"?"Ethernet interface":"USB485-HS"};
  setWiring(true);begin({...defaultDevice(n.id),model,name:m.name,newNetwork:n},"box")
 }
 function routeOutput(fx){const kind=fx.type==="ac"||fx.type==="relay"?"power":fx.type==="pixel"||fx.type==="rgbw"?"pixel":"dc";const cable={...defaultCable(kind),name:(d.name+" · "+fx.name).slice(0,160),from:"d/"+d.id,to:"f/"+fx.id,output:fx.port};setWiring(true);begin(cable,"cable")}
 function anchor(x,y,z){const el=viewport.current?.querySelector(".boxPopover");if(!el)return;const area=viewport.current;el.style.left=Math.max(8,Math.min(area.clientWidth-el.offsetWidth-8,x+18))+"px";el.style.top=Math.max(8,Math.min(area.clientHeight-el.offsetHeight-8,y-el.offsetHeight*.65))+"px";el.style.setProperty("--pin-y",Math.max(10,Math.min(el.offsetHeight-10,y-el.offsetTop))+"px");el.style.visibility=z>1||z< -1?"hidden":"visible"}
 function placePlant(plant,point,repeatPlant=false){
  if(design.plants.length>=150&&!design.plants.some(row=>row.id===plant.id)){setError("This show already has 150 plantings.");return}
  upsert("plants",{...plant,point});pick(plant.id);setMobile(false);close();
  if(repeatPlant)setPending({...plant,id:id(),name:seriesName(plant.name,[...design.plants.map(p=>p.name),plant.name])});else reset()
 }
 function place(v,normal,meta={}){if(mode==="aim"){upsert("fixtures",aimAt(pending,v));reset();return}
 if(mode==="plant"){placePlant(pending,v,meta.shift);return}
 if(mode==="cable"){if(cableDraft.length<160){draftNormals.current.push(lift?null:normal);setDraft(a=>[...a,[v[0],v[1]+lift,v[2]]])}return}
 if(mode==="draw"){if(meta.close){addStrand([...draft,draft[0]],[...draftNormals.current,draftNormals.current[0]]);return}if(draft.length<160){draftNormals.current.push(normal);setDraft(a=>[...a,v])}return}
 if(mode==="prop"&&pending){
  // Flat props turn to face out of the wall they land on unless the turn was set by hand.
  const yaw=pending.shape==="flood"?pending.yaw:turn??wallYaw(normal)??pending.yaw??0,row={...pending,mount:"",normal,points:[v],yaw};
  upsert("fixtures",row);pick(row.id);
  if(repeat||meta.shift)setPending({...pending,id:id(),name:seriesName(pending.name,design.fixtures.map(f=>f.name).concat(row.name))});else reset();return}
 if(mode==="box"){const {newNetwork,...row}=pending;if(newNetwork&&!design.networks.some(n=>n.id===newNetwork.id))store.change({...design,networks:[...design.networks,newNetwork],devices:[...design.devices,{...row,point:v,normal}]});else upsert("devices",{...row,point:v,normal});setWiring(true)}else if(pending){upsert("fixtures",{...pending,mount:"",normal,points:[v]});pick(pending.id)}reset()}
 function begin(row,method){if(sceneProp(design,row.id)?.row.locked){setError("Unlock this prop to move it.");return}close();setTab("Layout");setMobile(false);setSeries(false);setRepeat(false);setTurn(null);setPending(row);setDraft([]);setLift(0);draftNormals.current=[];setMode(method);setPlay(false);pick(row.id)}
 // Save a drawn strand. In a series the tool stays live with a fresh strand ready for the next one.
 function addStrand(points,normals,mount){
  if(!pending)return;
  if(design.fixtures.length>=300&&!design.fixtures.some(f=>f.id===pending.id)){setError("This show already has 300 fixtures.");return}
  // A double-click lands two clicks on one spot; keep one of them.
  const keep=points.map((p,i)=>!i||Math.hypot(...p.map((n,k)=>n-points[i-1][k]))>.01),pts=points.filter((_,i)=>keep[i]);
  if(pts.length<2)return;
  if(pts.length>160){setError("A strand can have up to 160 points. Remove a point before closing the loop.");return}
  const row={...pending,mount:mount||"",points:pts,normal:undefined,normals:mount?undefined:normals?.filter((_,i)=>keep[i]),plant:undefined,endPlant:undefined,dressing:undefined};
  const path=checkedPath("fixtures",row);
  if(!path)return;
  if(series&&spacing)row.count=lightCount(measuredLength(path),spacing);
  upsert("fixtures",row);pick(row.id);setDraft([]);draftNormals.current=[];
  if(!series){reset();return}
  toast("Added "+row.name+" · "+row.count+" lights",{kind:"success",id:"strand",action:{label:"Undo",run:()=>store.undo()}});
  setPending({...pending,id:id(),name:seriesName(preset,[...design.fixtures.map(f=>f.name),row.name])});
 }
 function finish(){
  if(mode==="draw"){addStrand(draft,[...draftNormals.current]);return}
  if(!pending||cableDraft.length<2)return;
  const row={...pending,points:cableDraft,normals:[...(pending.from?[null]:[]),...draftNormals.current,...(pending.to?[null]:[])]};
  if(!checkedPath("cables",row))return;
  upsert("cables",row);pick(row.id);reset()
 }
 function strandFor(name){const p=strandPresets.find(v=>v[0]===name)||strandPresets[0];return {name:seriesName(p[0],design.fixtures.map(f=>f.name)),type:p[2],count:p[3],color:p[4]}}
 function choosePreset(name){setPresetName(name);setSpacing(presetSpacing[name]??spacing);if(pending)setPending({...pending,...strandFor(name)})}
 function checkedPath(group,row){
  if(!routes){setError("Wait for the property to load before editing a route.");return null}
  const path=group==="cables"?routes.cable(row,design):routes.fixture(row);
  if(path.obstructed){setError("Route blocked. Add a waypoint on the outside corner.");return null}
  return path;
 }
 function editPoint(action,index,point,normal){
  const cable=mode==="cableEdit",target=cable&&c?routes?.editableCable(c,design):f;
  if(!target)return;
  const row=editRoutePoint(target,action,index,point,normal,lift);
  const group=cable?"cables":"fixtures";
  if(row&&checkedPath(group,row))upsert(group,row);
 }
 function saveCable(row,redraw){
  if(redraw){begin(row,"cable");return}
  const {inferred,...saved}=row;
  if(checkedPath("cables",saved)){upsert("cables",saved);pick(saved.id);close()}
 }
 function saveFixture(row,method){
  if(method){begin(row,method);return}
  if(row.shape==="run"&&row.points.length&&!checkedPath("fixtures",row))return;
  upsert("fixtures",row);pick(row.id);close();
 }
 const strandMeters=f?.shape==="run"?measuredLength(routes?.fixture(f)):null;
 function remove(group,v){dlg({kind:"confirm",title:"Remove "+v.name+"?",detail:group==="networks"?"Boxes on this network will also be removed. Their fixtures will be kept as unpatched.":group==="devices"?"Fixtures assigned to this box will be kept as unpatched.":group==="plants"?"Mounted lights will stay at their current positions.":"Remove this item from the design?",action:()=>{
 if(group==="cables"&&v.inferred){const fx=design.fixtures.find(f=>"f/"+f.id===v.to);if(fx)upsert("fixtures",{...fx,autoCord:false});pick("");close();removed(v);return}
 let updated={...design,[group]:design[group].filter(x=>x.id!==v.id)};
 if(group==="devices"||group==="networks"){const removed=new Set(group==="networks"?design.devices.filter(d=>d.net===v.id).map(d=>d.id):[v.id]);
 updated.devices=updated.devices.filter(d=>!removed.has(d.id)).map(d=>removed.has(d.parent)?{...d,parent:""}:d);updated.networks=updated.networks.map(n=>removed.has(n.bridge)?{...n,bridge:""}:n);updated.fixtures=updated.fixtures.map(f=>removed.has(f.device)?{...f,device:""}:f)}
 if(group==="plants")updated.fixtures=updated.fixtures.map(f=>f.plant===v.id||f.endPlant===v.id?{...f,plant:undefined,endPlant:undefined,dressing:undefined}:f);if(group==="cables")updated.fixtures=updated.fixtures.map(f=>[v.from,v.to].includes("f/"+f.id)&&[v.from,v.to].includes("d/"+f.device)?{...f,autoCord:false}:f);updated.cables=detachCables(design,updated);
 store.change(updated);pick("");close();removed(v)}})}
 function chooseProject(){setProjectName(design.name);dlg({kind:"project"})}
 function importFile(e){const item=e.target.files[0];e.target.value="";if(!item)return;if(item.size>900000){setError("Project exceeds 900 KB.");return}item.text().then(t=>{const data=showSchema.parse(JSON.parse(t));store.create({...data,name:data.name.slice(0,145)+" (imported)"});close();toast("Imported "+data.name,{kind:"success"})}).catch(()=>setError("Could not import this file. Choose a Lampey Lights project JSON."))}
 // Centre of an item in model space, used to frame it with the camera.
 function centre(key){
  const fx=design.fixtures.find(x=>x.id===key),box=design.devices.find(x=>x.id===key),plant=design.plants?.find(x=>x.id===key),cord=sceneCables(design).find(x=>x.id===key);
  const pts=fx?fx.points:box?.point?[box.point]:plant?[[plant.point[0],plant.point[1]+plant.height/2,plant.point[2]]]:cord?cablePoints(cord,design):[];
  return pts.length?[0,1,2].map(k=>pts.reduce((n,q)=>n+q[k],0)/pts.length):null;
 }
 function frame(key=sel){const point=key&&centre(key);if(point)engine.current?.focus(point)}
 function select(key,group){reset();pick(key);setMobile(false);if(group==="devices"||group==="cables")setWiring(true)}
 function setVisible(group,rows,on){const ids=new Set(rows.map(r=>r.id));store.change({...design,[group]:design[group].map(v=>ids.has(v.id)?{...v,visible:on}:v)})}
 function duplicate(){
  if(f&&!f.plant){const copy={...f,locked:false,id:id(),name:(f.name+" copy").slice(0,160),device:"",autoCord:undefined};
   if(f.shape==="run"||!f.points.length)edit(null,{...copy,points:[],mount:f.mount||"porch.fascia",normal:undefined,normals:undefined});else begin(copy,"prop")}
  else if(p)begin({...p,locked:false,id:id(),name:(p.name+" copy").slice(0,160)},"plant");
 }
 function editSelection(){if(f)edit(f);else if(d)box(d);else if(p)dlg({kind:"plant",v:p});else if(c)cableForm(c,true)}
 function removeSelection(){if(f)remove("fixtures",f);else if(d)remove("devices",d);else if(p)remove("plants",p);else if(c)remove("cables",c)}
 function toggleSelection(){if(f)setVisible("fixtures",[f],!f.visible);else if(p)setVisible("plants",[p],!p.visible);else if(c&&!c.inferred)setVisible("cables",[c],!c.visible)}
 function goView(name){setView(name);engine.current?.preset(name)}
 function back(){if(!draft.length)return;draftNormals.current.pop();setDraft(a=>a.slice(0,-1))}
 function chooseTool(next){if(next!==tool){setTool(next);setDraft([]);draftNormals.current=[]}}
 function drawStrand(name=preset){
  if(name!==preset){setPresetName(name);setSpacing(presetSpacing[name]??spacing)}
  begin({...defaultFixture(),zone:"Front yard",mount:"",points:[],...strandFor(name)},"draw");setSeries(true);
 }
 function toggleFull(){if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{})}
 function openPanel(){if(window.matchMedia("(max-width:720px)").matches)setMobile(true);else setPanel(true)}
 function findInScene(){openPanel();setTimeout(()=>searchBox.current?.focus(),60)}
 const undo=()=>{if(store.canUndo){store.undo();settle()}},redo=()=>{if(store.canRedo)store.redo()};
 const exportProject=()=>{saveFile(design.name+".json",JSON.stringify(design,null,2),"application/json");toast("Exported "+design.name,{kind:"success"})};

 keys.current=e=>{
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==="k"){e.preventDefault();if(dialog?.kind==="palette")close();else if(!dialog)dlg({kind:"palette"});return}
  if(dialog||e.target.closest?.("input,textarea,select,[contenteditable=true]"))return;
  if(e.key==="Escape"){reset();pick("");setMobile(false);return}
  if(mod){if(k==="z"){e.preventDefault();e.shiftKey?redo():undo()}else if(k==="y"){e.preventDefault();redo()}else if(k==="d"&&tab==="Layout"&&mode==="select"&&(f||p)){e.preventDefault();duplicate()}return}
  if(e.altKey)return;
  if(["1","2","3","4"].includes(e.key)&&!(tab==="Layout"&&mode==="draw")){setTab(tabs[e.key-1][0]);return}
  if(e.key==="?"){dlg({kind:"shortcuts"});return}
  if(tab!=="Layout")return;
  const onControl=e.target.closest?.("button,a,summary");
  if(mode==="draw"&&/^[1-8]$/.test(e.key)){chooseTool(toolKeys[e.key-1]);return}
  if(mode==="prop"&&pending&&pending.shape!=="flood"&&"[],.".includes(e.key)){e.preventDefault();
   if(e.key==="["||e.key==="]")setPending({...pending,size:Number(Math.max(.1,Math.min(20,pending.size*(e.key==="]"?1.1:1/1.1))).toFixed(2))});
   else setTurn(t=>{const next=(t??pending.yaw??0)+(e.key==="."?15:-15);return next>180?next-360:next< -180?next+360:next});return}
  if(mode==="draw"||mode==="cable"){if(e.key==="Enter"&&!onControl){e.preventDefault();finish()}else if(e.key==="Backspace"){e.preventDefault();back()}return}
  if(mode!=="select")return;
  if(e.key===" "){if(!onControl){e.preventDefault();setPlay(v=>!v)}return}
  if(e.key==="Enter"){if(!onControl&&sel)editSelection();return}
  if(e.key==="Delete"||e.key==="Backspace"){if(sel){e.preventDefault();removeSelection()}return}
  const run={n:()=>setNight(v=>!v),l:()=>setLabels(v=>!v),w:()=>setWiring(v=>!v),t:()=>dlg({kind:"tools",tab:"Lights"}),d:()=>drawStrand(),f:()=>frame(),r:()=>goView("Street"),e:editSelection,h:toggleSelection,"[":()=>setPanel(v=>!v),"/":findInScene,"+":()=>engine.current?.zoom(.8),"=":()=>engine.current?.zoom(.8),"-":()=>engine.current?.zoom(1.25)}[k];
  if(run){e.preventDefault();run()}
 };

 const controllerProps=d&&{box:d,routes,design,issues,lockButton,save:v=>upsert("devices",{...d,name:v.name,model:v.model,unit:v.unit,net:v.net,ip:v.ip,portCount:v.portCount}),close:()=>{close();pick("")},edit:()=>box(d),move:()=>begin(d,"box"),details:()=>dlg({kind:"controller"}),route:routeOutput,editCable:c=>cableForm(c,true),assign:(id,port)=>{const result=planPatch(design,id,d.id,port);if(result.error)setError(result.error);else store.change(applyPatch(design,result.fixture))},toggle:port=>{const ports=d.offPorts||[];upsert("devices",{...d,offPorts:ports.includes(port)?ports.filter(n=>n!==port):[...ports,port]})}};
 const historyAdd=r=>edit(null,{name:r[1]||r[0],reference:r[0],zone:/porch|driveway/i.test(r[2])?r[2]:"Unsorted",notes:r[2],state:/bad|unknown|something plugged/i.test(r.join(" "))?"Needs check":"Planned",type:/pixie/i.test(r.join(" "))?"pixel":/floo[d t]|Box 28/i.test(r.join(" "))?"dc":"ac",shape:/floo[d t]|Box 28/i.test(r.join(" "))?"flood":/pixie arch/i.test(r.join(" "))?"arch":"run",points:[],color:/blue/i.test(r[1])?"#88bbff":/red/i.test(r[1])?"#ff7773":"#ffd394"});
 const modeText={draw:"Click along the surface to draw the strand",box:"Click a surface to place the equipment",plant:"Click the ground to place the planting",aim:"Click where the beam should land",cable:"Click to add bends along the route",cableEdit:"Drag a point to move it · drag a midpoint to add one · double-click to remove",edit:"Drag a point to move it · drag a midpoint to add one · double-click to remove",prop:"Click a surface to place the fixture"}[mode]||"Click a surface";
 const points=mode==="draw"?draft.length:mode==="cable"?cableDraft.length:null;
 const status=saveKind(store.status);
 // Shared trailing tools for the selection bar.
 const tail=(row,group,canCopy)=><><span className="divider"/>{lockButton}<Tool n="target" label="Frame in view" tip="Frame · F" action={()=>frame()}/>{canCopy&&<Tool n="copy" label="Duplicate" tip="Duplicate · Ctrl D" action={duplicate}/>}{group&&<Tool n={row.visible?"eye":"eyeOff"} label={row.visible?"Hide":"Show"} tip={(row.visible?"Hide":"Show")+" · H"} action={toggleSelection}/>}<Tool n="trash" label="Remove" tip="Remove · Del" className="dangerTool" action={removeSelection}/><Tool n="x" label="Deselect" tip="Deselect · Esc" action={()=>pick("")}/></>;

 const palette=()=>{
  const layout=fn=>()=>{setTab("Layout");fn()};
  return [
   {group:"Actions",label:"Open toolbox",icon:"plus",keys:"T",run:()=>dlg({kind:"tools",tab:"Lights"})},
   {group:"Actions",label:"Draw strand",icon:"draw",keys:"D",run:()=>drawStrand()},
   {group:"Actions",label:"Add planting",icon:"tree",run:layout(()=>dlg({kind:"tools",tab:"Garden"}))},
   {group:"Actions",label:"Route cable",icon:"cable",run:()=>dlg({kind:"tools",tab:"Cables"})},
   {group:"Actions",label:"Add equipment",icon:"box",run:()=>dlg({kind:"tools",tab:"Equipment"})},
   {group:"Actions",label:play?"Stop preview":"Preview show",icon:play?"pause":"play",keys:"Space",run:layout(()=>setPlay(v=>!v))},
   {group:"Actions",label:"Undo",icon:"undo",keys:"Ctrl Z",run:undo},{group:"Actions",label:"Redo",icon:"redo",keys:"Ctrl Shift Z",run:redo},
   {group:"Actions",label:"Projects",icon:"folder",run:chooseProject},
   {group:"Actions",label:"Export project",icon:"download",run:exportProject},
   {group:"Actions",label:"Import project",icon:"upload",run:()=>file.current.click()},
   {group:"Actions",label:"Export patch CSV",icon:"download",run:()=>routes?exportPatch(design,routes):setError("The property is still loading.")},
   {group:"Actions",label:"Print labels",icon:"printer",run:()=>window.print()},
   {group:"Actions",label:"Keyboard shortcuts",icon:"keyboard",keys:"?",run:()=>dlg({kind:"shortcuts"})},
   ...tabs.map(([t,icon],i)=>({group:"Go to",label:t,icon,keys:String(i+1),run:()=>setTab(t)})),
   {group:"View",label:night?"Switch to daylight":"Switch to night",icon:night?"sun":"moon",keys:"N",run:layout(()=>setNight(v=>!v))},
   {group:"View",label:labels?"Hide labels":"Show labels",icon:"tag",keys:"L",run:layout(()=>setLabels(v=>!v))},
   {group:"View",label:wiring?"Hide wiring":"Show wiring",icon:"network",keys:"W",run:layout(()=>setWiring(v=>!v))},
   {group:"View",label:full?"Exit full screen":"Full screen",icon:full?"shrink":"expand",run:toggleFull},
   ...(tab==="Layout"?views.map(v=>({group:"Camera",label:v+" view",icon:"camera",run:()=>goView(v)})):[]),
   ...design.fixtures.map(x=>({group:"Scene",label:x.name,hint:x.zone,color:x.color,run:layout(()=>{select(x.id,"fixtures");setTimeout(()=>frame(x.id),60)})})),
   ...design.devices.map(x=>({group:"Scene",label:x.name,hint:hardware[x.model].name,icon:"box",run:layout(()=>{select(x.id,"devices");setTimeout(()=>frame(x.id),60)})})),
   ...(design.plants||[]).map(x=>({group:"Scene",label:x.name,hint:species[x.kind],icon:"tree",run:layout(()=>{select(x.id,"plants");setTimeout(()=>frame(x.id),60)})})),
   ...(design.cables||[]).map(x=>({group:"Scene",label:x.name,hint:cableKinds[x.kind].name,icon:"cable",run:layout(()=>{select(x.id,"cables");setTimeout(()=>frame(x.id),60)})})),
   ...design.networks.map(x=>({group:"Scene",label:x.name,hint:"Network",icon:"network",run:()=>{setTab("Network");net(x)}}))
  ];
 };

 return <><div className="appShell" data-tab={tab}>
 <header className="top">
  <div className="brand"><img src="/favicon.svg" alt=""/><b>Lampey Lights</b></div>
  <nav aria-label="Workspace" style={{"--i":tabs.findIndex(t=>t[0]===tab)}}>{tabs.map(([t,n])=><button key={t} className={t===tab?"active":""} aria-current={t===tab?"page":undefined} onClick={()=>setTab(t)}><I n={n}/><span>{t}</span></button>)}</nav>
  <div className="rightTop">
   <button className="paletteBtn" aria-label="Open command palette" onClick={()=>dlg({kind:"palette"})}><I n="search" size={15}/><span>Search</span><Kbd>Ctrl K</Kbd></button>
   <div className="history"><Tool n="undo" label="Undo" tip="Undo · Ctrl Z" pos="down" action={undo} disabled={!store.canUndo}/><Tool n="redo" label="Redo" tip="Redo · Ctrl Shift Z" pos="down" action={redo} disabled={!store.canRedo}/></div>
   <button className={"saveStatus "+status} onClick={store.conflict?chooseProject:store.retry}><i/><span>{store.status}</span></button>
   <button className="projectBtn" aria-label={"Projects, current: "+design.name} onClick={chooseProject}><I n="folder"/><span>{design.name}</span><I n="down" size={14}/></button>
   <Tool n="keyboard" label="Keyboard shortcuts" tip="Shortcuts · ?" pos="down-end" className="helpBtn" action={()=>dlg({kind:"shortcuts"})}/>
  </div>
 </header>
 <div style={tab==="Layout"?undefined:{display:"none"}} className={"workspace"+(panel?"":" collapsed")}>
  <SceneList design={design} sel={sel} search={search} setSearch={filter} searchRef={searchBox} issues={issues} select={select} frame={key=>{select(key);setTimeout(()=>frame(key),30)}} setVisible={setVisible} hover={setHover} openToolbox={()=>dlg({kind:"tools",tab:"Lights"})} collapse={()=>setPanel(false)} closeMobile={()=>setMobile(false)} open={mobile}/>
  {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
  <main className="editor"><h1 className="srOnly">Property layout</h1>
  <section ref={viewport} data-mode={mode} className={"viewport "+(night?"night":"day")+(play?" playing":"")}>
   <div className="sky" aria-hidden="true"><i className="skyNight"/><i className="skyDay"/><i className="stars"/></div>
   <Viewport state={sceneState} engine={engine} events={{propTransform,propDrop,propPreview:target=>setDragPreview(target?{...target,base:design}:null),pick(v){pick(v)},anchor,ready:geometry=>{setRoutes(geometry);setReady(true)},fail:setError,place,finish,shape:({points,normals,mount})=>addStrand(points,normals,mount),editPoint}}/>
   <div className="viewBar">
    <div className="barGroup">
     <Tool n="sidebar" label="Show scene panel" tip="Scene panel · [" pos="down-start" className="glassBtn panelBtn" action={openPanel}/>
     <label className="camera"><I n="camera" size={15}/><select disabled={!ready} aria-label="Camera view" value={view} onChange={e=>goView(e.target.value)}>{views.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    </div>
    <div className="barGroup end">
     <div className="glass"><Tool n={night?"moon":"sun"} label={night?"Switch to daylight":"Switch to night"} tip={(night?"Night":"Daylight")+" · N"} pos="down" active={night} action={()=>setNight(!night)}/><Tool n="tag" label="Show labels" tip="Labels · L" pos="down" active={labels} action={()=>setLabels(!labels)}/><Tool n="network" label="Show wiring" tip="Wiring · W" pos="down" active={wiring} action={()=>setWiring(!wiring)}/></div>
     <div className="glass zoomTools"><Tool n="zoomOut" label="Zoom out" tip="Zoom out · −" pos="down" action={()=>engine.current?.zoom(1.25)}/><Tool n="zoomIn" label="Zoom in" tip="Zoom in · +" pos="down" action={()=>engine.current?.zoom(.8)}/><Tool n="home" label="Reset camera" tip="Reset camera · R" pos="down" action={()=>goView("Street")}/><Tool n={full?"shrink":"expand"} label={full?"Exit full screen":"Full screen"} pos="down-end" action={toggleFull}/></div>
     <button className={"preview "+(play?"playing":"")} aria-pressed={play} data-tip="Space" data-tip-pos="down-end" onClick={()=>setPlay(!play)}><I n={play?"pause":"play"} size={14}/><span>{play?"Stop":"Preview"}</span>{play&&<span className="eq" aria-hidden="true"><i/><i/><i/></span>}</button>
    </div>
   </div>
   {!ready&&<div className="loading" role="status"><Bulbs/>Loading property</div>}
   {mode==="select"&&d&&<Controller key={d.id} {...controllerProps}/>}
   <div className="stageBottom">
    {f&&mode==="select"&&<div className="selection" key={f.id}><i className="lamp big" style={{"--c":f.color}}/><div className="selText"><strong>{f.name}</strong><small>{patchText(f,design)} · {f.count} lights{f.shape==="run"&&f.points.length>1?" · "+(strandMeters===null?"Unmeasured":feet(strandMeters)):""}</small></div><button onClick={()=>edit(f)}><I n="edit" size={15}/>Edit</button>{f.shape==="flood"&&f.points.length>0&&<button onClick={()=>begin(f,"aim")}><I n="target" size={15}/>Aim</button>}{f.plant&&<button onClick={()=>plantLights(null,f)}>Mounting</button>}{f.points.length>0&&!f.plant?<button disabled={f.locked} onClick={()=>setMode("edit")}><I n="move" size={15}/>Move points</button>:!f.points.length&&<button className="primary" onClick={()=>begin(f,f.shape==="run"?"draw":"prop")}><I n="pin" size={15}/>Place</button>}{tail(f,"fixtures",!f.plant)}</div>}
    {mode==="select"&&p&&<div className="selection" key={p.id}><span className="selIcon"><I n="tree"/></span><div className="selText"><strong>{p.name}</strong><small>{species[p.kind]} · {feet(p.height)}</small></div><button onClick={()=>plantLights(p)}><I n="strand" size={15}/>Mount lights</button><button onClick={()=>dlg({kind:"plant",v:p})}><I n="edit" size={15}/>Edit</button><button disabled={p.locked} onClick={()=>begin(p,"plant")}><I n="move" size={15}/>Move</button>{tail(p,"plants",true)}</div>}
    {mode==="select"&&c&&<div className="selection" key={c.id}><i className="wire big" style={{"--c":c.color}}/><div className="selText"><strong>{c.name}</strong><small>{c.inferred?"Estimated · ":""}{cordLabel(c,routes?.cable(c,design))} · {cableKinds[c.kind].name}</small></div><button onClick={()=>cableForm(c,true)}><I n="edit" size={15}/>Edit</button><button onClick={()=>{setLift(0);setMode("cableEdit")}}><I n="move" size={15}/>Move points</button>{tail(c,c.inferred?null:"cables",false)}</div>}
    {mode==="draw"&&pending?<DrawBar tool={sceneState.tool} setTool={chooseTool} opts={toolOpts} setOpts={setToolOpts} fixture={pending} setFixture={setPending} preset={preset} setPreset={choosePreset} spacing={spacing} setSpacing={setSpacing} series={series} points={draft.length} back={back} finish={finish} done={reset}/>:
    mode==="prop"&&pending?<PropBar fixture={pending} setFixture={setPending} turn={turn} setTurn={setTurn} repeat={repeat} setRepeat={setRepeat} cancel={reset}/>:
    <div className={"dock"+(mode==="select"?"":" busy")} key={mode==="select"?"idle":"busy"}>{mode==="select"?<>
     <Tool n="cursor" label="Select" tip="Select · Esc" action={()=>pick("")} active/>
     <button data-tip="Draw strand · D" onClick={()=>drawStrand()}><I n="draw"/><span>Draw strand</span></button>
     <button data-tip="Toolbox · T" onClick={()=>dlg({kind:"tools",tab:"Lights"})}><I n="bulb"/><span>Lights</span></button>
     <button onClick={()=>dlg({kind:"tools",tab:"Garden"})}><I n="tree"/><span>Garden</span></button>
     <button onClick={()=>dlg({kind:"tools",tab:"Equipment"})}><I n="box"/><span>Equipment</span></button>
     <button onClick={()=>dlg({kind:"tools",tab:"Cables"})}><I n="cable"/><span>Cable</span></button>
    </>:<>
     <span className="modeText"><i className="pulse"/>{modeText}{points!==null&&<b>{points}</b>}</span>
     {["cable","cableEdit"].includes(mode)&&<label className="lift">Lift (m)<input type="number" step=".1" min="-15" max="30" value={lift} onChange={e=>setLift(Math.max(-15,Math.min(30,Number(e.target.value))))}/></label>}
     {(mode==="draw"||mode==="cable")&&<><button disabled={!draft.length} data-tip="Backspace" onClick={back}><I n="undo" size={15}/>Back</button><button disabled={cableDraft.length<2} className="primary" data-tip="Enter" onClick={finish}><I n="check" size={15}/>Finish</button></>}
     <button data-tip="Esc" onClick={reset}>{mode==="edit"||mode==="cableEdit"?"Done":"Cancel"}</button>
    </>}</div>}
   </div>
   <div className="hint">{mode==="select"&&activeProp&&!activeProp.row.locked?"Drag to move · Ctrl + wheel to scale · Alt + wheel to rotate":"Drag to orbit · Scroll to zoom · Right-drag to pan"}</div>
  </section></main></div>
 {tab==="Layout"?null:tab==="Matrix"?<ChannelMatrix key={store.id} design={design} issues={issues} change={store.change} editBox={box} editFixture={edit} addBox={()=>design.networks.length?box():net()} notify={(message,error,undoable)=>toast(message,{kind:error?"error":"success",id:"matrix-patch",action:undoable?{label:"Undo",run:undo}:null})}/>:tab==="Network"?<Network design={design} issues={issues} editNet={net} editBox={box} open={openRecord} locate={d=>{setWiring(true);begin(d,"box")}}/>:<Patch routes={routes} design={design} issues={issues} edit={edit} open={openRecord} setState={(fx,state)=>upsert("fixtures",{...fx,state})} historyAdd={historyAdd}/>}
 <input type="file" hidden ref={file} accept=".json,application/json" onChange={importFile}/>
 {dialog?.kind==="palette"&&<CommandPalette items={palette()} close={close}/>}
 {dialog?.kind==="shortcuts"&&<Shortcuts close={close}/>}
 {dialog?.kind==="tools"&&<Toolbox engine={engine} dropPlant={placePlant} openLayout={()=>setTab("Layout")} initial={dialog.tab} close={close} equipment={placeEquipment} cable={k=>cableForm(defaultCable(k))} plant={k=>begin(newPlant(k),"plant")} light={([name,shape,type,count,color])=>{const v={...defaultFixture(),name,zone:"Front yard",shape,type,count,color,mount:"porch.fascia",points:[]};if(shape==="run"){close();drawStrand(name)}else begin(v,"prop")}}/>}
 {dialog?.kind==="cable"&&<CableForm initial={dialog.v} existing={dialog.existing} design={design} close={close} remove={()=>remove("cables",dialog.v)} commit={saveCable}/>}
 {dialog?.kind==="plant"&&<PlantForm initial={dialog.v} close={close} remove={()=>remove("plants",dialog.v)} commit={v=>{upsert("plants",v);close()}}/>}
 {dialog?.kind==="dress"&&<DressForm initial={dialog.v} design={design} close={close} commit={v=>{const fx=mountedFixture(v,design.plants);upsert("fixtures",fx);pick(fx.id);close()}}/>}
 {dialog?.kind==="controller"&&d&&<Controller key={d.id} full {...controllerProps} close={close}/>}
 {dialog?.kind==="fixture"&&<FixtureForm initial={dialog.v} existing={dialog.existing} design={design} close={close} remove={()=>remove("fixtures",dialog.v)} commit={saveFixture}/>}
 {dialog?.kind==="network"&&<NetworkForm initial={dialog.v} existing={dialog.existing} design={design} close={close} remove={()=>remove("networks",dialog.v)} commit={v=>{upsert("networks",v);close()}}/>}
 {dialog?.kind==="device"&&<DeviceForm initial={dialog.v} existing={dialog.existing} design={design} close={close} remove={()=>remove("devices",dialog.v)} commit={v=>{upsert("devices",v);close()}}/>}
 {dialog?.kind==="confirm"&&<Modal title={dialog.title} close={close} className="confirm"><p>{dialog.detail}</p><footer><button data-focus onClick={close}>Cancel</button><button className="danger solid" onClick={dialog.action}><I n="trash" size={15}/>Remove</button></footer></Modal>}
 {dialog?.kind==="project"&&<Modal title="Projects" close={close}>
  <div className="projectList">{store.projects().map(p=><button key={p.id} className={p.id===store.id?"current":""} onClick={()=>{store.open(p.id);close()}}><I n="folder"/><span>{p.name}</span>{p.id===store.id&&<I n="check"/>}</button>)}</div>
  <Field label="Project name"><div className="inline"><input value={projectName} maxLength={140} onChange={e=>setProjectName(e.target.value)}/><button disabled={!projectName.trim()||projectName.trim()===design.name} onClick={()=>{store.change({...design,name:projectName.trim()});close();toast("Renamed project",{kind:"success"})}}>Rename</button></div></Field>
  <div className="buttonGrid"><button disabled={!projectName.trim()} onClick={()=>store.create({...design,name:projectName.trim()+" (copy)"})}><I n="copy" size={15}/>Save a copy</button><button onClick={()=>store.create({version:1,name:"Untitled show",fixtures:[],devices:[],networks:[]})}><I n="plus" size={15}/>New blank show</button><button onClick={()=>store.create(sample())}><I n="bulb" size={15}/>New sample show</button><button onClick={exportProject}><I n="download" size={15}/>Export project</button><button onClick={()=>file.current.click()}><I n="upload" size={15}/>Import project</button></div>
  {store.conflict&&<button className="conflictBtn" onClick={()=>{store.open(store.id,true);close()}}>Reopen server version</button>}
 </Modal>}
 <Toaster toasts={toasts} dismiss={dismiss}/>
 </div><div className="printSheet">{design.fixtures.map(f=><div key={f.id}><strong>{f.name}</strong><b>{patchText(f,design)}</b><span>{f.zone} · {f.count} {fixtures[f.type]}</span>{f.reference&&<small>Previous: {f.reference}</small>}</div>)}</div></>
}
