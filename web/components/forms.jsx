import {useEffect,useRef,useState} from "react";
import {beamDefaults} from "../lib/stage";
import {fixtures,shapes,hardware,protocols,mounts,mountNames,palette,effects,isPixel,isSerial} from "../lib/show";
export function Modal({title,close,children}){
 const ref=useRef(null);useEffect(()=>{const dlg=ref.current;dlg.showModal();return()=>dlg.close()},[]);
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===ref.current)close()}}><section className="modal"><header><h2>{title}</h2><button className="icon" aria-label="Close dialog" onClick={close}>×</button></header>{children}</section></dialog>
}
export function Field({label,children,wide}){return <label className={wide?"field wide":"field"}><span>{label}</span>{children}</label>}
export const options=obj=>Object.entries(obj).map(([v,n])=><option key={v} value={v}>{typeof n==="string"?n:n.name}</option>);
function useFields(initial){const [v,set]=useState(initial);const update=(k,val)=>set(o=>({...o,[k]:val}));const field=(label,k,choices=null,config={})=><Field key={k} label={label} wide={config.wide}>{choices?<select value={v[k]??""} onChange={e=>update(k,e.target.value)}>{options(choices)}</select>:<input type="text" maxLength={160} {...config.input} value={v[k]??""} onChange={e=>update(k,config.input?.type==="number"?Number(e.target.value):e.target.value)}/>}</Field>;
 const number=(label,k,max,min=1,step=1)=>field(label,k,null,{input:{type:"number",required:true,min,max,step}});
 return {v,set,update,field,number}
}
const deviceOptions=(ds,empty)=>Object.fromEntries([["",empty],...ds.map(d=>[d.id,d.name])]);
export function FixtureForm({initial,design,commit,close,remove,existing}){
 const {v,set,update,field,number}=useFields({...beamDefaults,...initial});
 const [placement,setPlacement]=useState(existing?"keep":initial.reference?"later":"mount");
 const device=design.devices.find(d=>d.id===v.device),bus=design.networks.find(n=>n.id===device?.net);
 const pickMode=v.shape==="run"?"draw":"prop";
 function submit(e){e.preventDefault();let f={...v,name:v.name.trim(),zone:v.zone.trim(),state:v.state||"Planned",reference:v.reference||""};
  if(!f.name||!f.zone)return;
  if(placement!=="keep"||f.shape!=="run"){delete f.plant;delete f.dressing;delete f.endPlant}
  if(placement==="mount"){const points=mounts[f.mount]||Object.values(mounts)[0];f.points=f.shape==="run"?points:[points[0]]}
  if(placement==="later"||placement==="pick"){f.points=[];f.mount=""}
  if(f.shape!=="run"&&f.points.length>1)f.points=[f.points[0]];
  if(f.shape==="run"&&f.points.length===1){f.points=[];f.mount=""}
  commit(f,placement==="pick"?pickMode:null)}
 return <Modal title={existing?"Edit fixture":"Add lights"} close={close}><form onSubmit={submit}><div className="fields">
 {field("Fixture name","name",null,{input:{required:true,autoFocus:true}})}{field("Area","zone",null,{input:{required:true,list:"zoneList"}})}
 <datalist id="zoneList">{[...new Set(design.fixtures.map(f=>f.zone))].map(z=><option key={z}>{z}</option>)}</datalist>
 {field("Light type","type",fixtures)}{field("Shape","shape",shapes)}
 <Field label="Placement"><select value={placement} onChange={e=>{setPlacement(e.target.value);if(e.target.value==="mount"&&!v.mount)update("mount","porch.fascia")}}>{existing&&<option value="keep">Keep position</option>}<option value="mount">Use house feature</option><option value="pick">{v.shape==="run"?"Draw on model":"Place on model"}</option><option value="later">Place later</option></select></Field>
 {placement==="mount"?field("House feature","mount",mountNames):field("Installation","state",{"Planned":"Planned","Installed":"Installed","Needs check":"Needs check","Spare":"Spare"})}
 {v.shape==="flood"&&<>{number("Aim left / right (°)","yaw",180,-180)}{number("Aim elevation (°)","pitch",90,-90)}{number("Beam angle (°)","spread",110,6)}{number("Throw (m)","reach",35,.5,.1)}</>}
 {number(isPixel(v)?"Pixels":"Lamps","count",2048)}{v.shape==="run"?number("Brightness (%)","brightness",100):number("Prop height (m)","size",20,.1,.1)}
 </div><h3>Appearance</h3><div className="fields">{field("Effect","effect",effects)}{v.shape!=="run"&&number("Brightness (%)","brightness",100)}{isPixel(v)&&field("Color order","order",Object.fromEntries(["RGB","RBG","GRB","GBR","BRG","BGR","RGBW","GRBW"].map(x=>[x,x])))}
 <Field label="Light color" wide><div className="swatches">{palette.map(c=><button type="button" aria-label={"Choose "+c} aria-pressed={v.color===c} key={c} style={{background:c}} onClick={()=>update("color",c)}/>)}<input aria-label="Custom light color" type="color" value={v.color} onChange={e=>update("color",e.target.value)}/></div></Field>
 {v.effect==="alternate"&&field("Second color","color2",null,{input:{type:"color"}})}</div>
 <h3>Controller patch</h3><div className="fields">{field("Controller","device",deviceOptions(design.devices.filter(d=>hardware[d.model].ports),"Unpatched"))}
 {device&&number(hardware[device.model].kind==="dc"&&v.type==="rgb"?"RGB group":"Output / port","port",512)}
 {device&&isPixel(v)&&number("First pixel on port","offset",2048)}
 {bus&&!isSerial(bus)&&<>{number("Start universe","universe",63999)}{number("Start channel","slot",512)}</>}
 {placement==="mount"&&field("Installation","state",Object.fromEntries(["Planned","Installed","Needs check","Spare"].map(x=>[x,x])))}
 {field("Previous patch","reference")}{field("Setup notes","notes",null,{wide:true,input:{maxLength:800}})}</div>
 <footer>{existing&&<button type="button" className="danger" onClick={remove}>Remove</button>}<button type="button" onClick={close}>Cancel</button><button className="primary">{placement==="pick"?"Continue on model":existing?"Save fixture":"Add fixture"}</button></footer></form></Modal>
}
export function NetworkForm({initial,design,commit,remove,close,existing}){
 const {v,set,update,field,number}=useFields(initial);const serial=isSerial(v);
 return <Modal title={existing?"Edit network":"Add network"} close={close}><form onSubmit={e=>{e.preventDefault();commit(v)}}><div className="fields">
 {field("Network name","name",null,{input:{required:true,autoFocus:true}})}{<Field label="Protocol"><select value={v.protocol} onChange={e=>{const p=e.target.value;set(o=>({...o,protocol:p,speed:p==="lor"?57600:p==="pixlink"?8500000:p==="elor"?500000:0,source:p==="sacn"?"Ethernet interface":p==="dmx"?"USB DMX":p==="pixlink"?"Bridge output":"USB485-HS",bridge:p==="sacn"?"":o.bridge}))}}>{options(protocols)}</select></Field>}
 {field("Source / adapter","source",Object.fromEntries(["USB485-HS","USB485","USB485B","Director","Ethernet interface","USB DMX","Bridge output"].map(x=>[x,x])))}
 {serial&&<Field label="Link speed"><select value={v.speed} onChange={e=>update("speed",Number(e.target.value))}>{(v.protocol==="pixlink"?[4250000,8500000,17000000]:[19200,57600,115200,500000,1000000]).map(s=><option key={s} value={s}>{s/1000} kbps</option>)}</select></Field>}
 {v.protocol==="sacn"?<Field label="Channels per universe"><select value={v.slots} onChange={e=>update("slots",Number(e.target.value))}><option>510</option><option>512</option></select></Field>:field("Upstream bridge","bridge",deviceOptions(design.devices.filter(d=>["aurora","bridge"].includes(d.model)),"Direct connection"))}
 {v.bridge&&number("Bridge output","output",6)}{field("Setup notes","notes",null,{wide:true})}</div><footer>{existing&&<button type="button" className="danger" onClick={remove}>Remove</button>}<button type="button" onClick={close}>Cancel</button><button className="primary">Save network</button></footer></form></Modal>
}
export function DeviceForm({initial,design,commit,close,existing,remove}){
 const {v,update,field,number}=useFields(initial);const n=design.networks.find(x=>x.id===v.net),m=hardware[v.model];
 return <Modal title={existing?"Edit box":"Add a box"} close={close}><form onSubmit={e=>{e.preventDefault();commit({...v,unit:v.unit.toUpperCase()})}}><div className="fields">
 {field("Box label","name",null,{input:{required:true,autoFocus:true}})}{field("Hardware","model",hardware)}
 {field("Network","net",Object.fromEntries(design.networks.map(n=>[n.id,n.name])))}{field(v.model==="rx"?"Paired transmitter":"Connected from","parent",deviceOptions(design.devices.filter(d=>d.id!==v.id&&(d.net===v.net||d.model==="computer")),"Network source"))}
 {m.ports>0&&isSerial(n)&&field("Base Unit ID (hex)","unit",null,{input:{required:true,pattern:"[A-Fa-f0-9]{2}",maxLength:2}})}
 {v.model==="generic"&&<Field label="Physical output count"><input type="number" min="1" max="128" required value={v.portCount??16} onChange={e=>update("portCount",Number(e.target.value))}/></Field>}{m.kind==="pixel"&&number("Configured pixels / port","pixelLimit",2048)}
 {v.model.startsWith("pixie")&&v.pixelLimit>170&&<Field label="Double Unit ID split"><select value={v.splitEvenly?"even":"carry"} onChange={e=>update("splitEvenly",e.target.value==="even")}><option value="carry">First 170, then carry over</option><option value="even">Split evenly</option></select></Field>}{n?.protocol==="sacn"&&field("IP address","ip",null,{input:{placeholder:"Optional"}})}{n?.bridge&&number("First mapped universe","universe",63999)}
 {["tx","rx"].includes(v.model)&&number("RF channel","rf",31,0)}{v.model==="edge"&&number("Core long-range output","branch",2)}
 {field("Setup notes","notes",null,{wide:true})}</div><footer>{existing&&<button type="button" className="danger" onClick={remove}>Remove</button>}<button type="button" onClick={close}>Cancel</button><button className="primary">Save box</button></footer></form></Modal>
}

