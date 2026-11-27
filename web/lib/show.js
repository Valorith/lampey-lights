import {propertyPlants,species,dressings} from "./garden.js";
import {z} from "zod";
import {beamDefaults,cableKinds,floodScale,mountRotation,propPattern} from "./stage.js";
import {windowOutlines,windowNames} from "./window-mounts.js";
import houseMounts from "./mounts.json" with {type:"json"};
export const mounts={...houseMounts,...windowOutlines};
export const id=()=>crypto.randomUUID();
export const mountNames={...windowNames,"rear.addition.fascia":"Rear deck and gable fascia","front.upper-eave":"Upper roofline","porch.fascia":"Porch fascia","porch.rail.left":"Left porch rail","porch.rail.right":"Right porch rail","dormer.left":"Left dormer","dormer.right":"Right dormer","garage.1":"Garage door 1","garage.2":"Garage door 2","pool.fence.back":"Rear pool fence","pool.fence.chimney-side":"Chimney-side fence","pool.fence.driveway-side":"Driveway-side fence","stairs.upper.a":"Upper stair rail A","stairs.upper.b":"Upper stair rail B","stairs.driveway.a":"Driveway stair rail A","stairs.driveway.b":"Driveway stair rail B"};
export const protocols={lor:"LOR Regular",elor:"Enhanced LOR",sacn:"Ethernet · E1.31",dmx:"DMX512",pixlink:"PixieLink serial"};
export const fixtures={pixel:"Smart RGB pixels",rgbw:"Smart RGBW pixels",ac:"AC light string",dc:"Single-color DC",rgb:"Dumb RGB",relay:"On/off prop"};
export const shapes={run:"Light strand",tree:"Spiral tree",arch:"Arch",star:"Star",wreath:"Wreath",flood:"Floodlight",icicles:"Icicles",net:"Net",matrix:"Pixel matrix",cane:"Candy cane"};
export const effects={steady:"Steady",twinkle:"Twinkle",chase:"Chase",fade:"Pulse",alternate:"Alternating colors",cycle:"RGB color cycle"};
export const palette=["#ffd394","#ff7773","#70e8b0","#88bbff","#bf9aff","#f9fcff","#ffb34d","#43dce6"];
export const hardware={
 computer:{name:"Show computer",ports:0,net:Object.keys(protocols)},
 adapter:{name:"USB–RS485 adapter",ports:0,net:["lor","elor"]},
 outlet:{name:"Power outlet",ports:0,net:Object.keys(protocols)},
 supply:{name:"DC power supply",ports:0,net:Object.keys(protocols)},
 ac16:{name:"CTB16PC · Gen 3",ports:16,kind:"ac",net:["lor","elor","dmx"]},
 ac8:{name:"CTB08D · Gen 3",ports:8,kind:"ac",net:["lor","elor","dmx"]},
 cmb:{name:"CMB24D",ports:24,kind:"dc",net:["lor","elor","dmx"]},
 cmb16:{name:"CMB16D",ports:16,kind:"dc",net:["lor","dmx"]},
 cf50:{name:"CF50D · 50 W RGB flood",ports:5,kind:"flood",net:["lor","elor","dmx"]},
 ...Object.fromEntries([2,4,8,16].map(n=>["pixie"+n,{name:"Pixie"+n,ports:n,kind:"pixel",net:["lor","elor","pixlink"],max:340}])),
 pixcon:{name:"PixCon16",ports:16,kind:"pixel",net:["elor","sacn"],max:340},
 aurora:{name:"Aurora Core",ports:16,kind:"pixel",net:["sacn"]},
 edge:{name:"Aurora Edge receiver",ports:4,kind:"pixel",net:["sacn"]},
 generic:{name:"Generic sACN pixel controller",ports:16,kind:"pixel",net:["sacn"]},
 dmx:{name:"DMX fixture / decoder",ports:512,kind:"dmx",net:["dmx","sacn"]},
 switch:{name:"Ethernet switch",ports:0,net:["sacn"]},
 bridge:{name:"PixieLink bridge",ports:0,net:["sacn"]},
 tx:{name:"Easy Light Linker · transmitter",ports:0,net:["lor"]},
 rx:{name:"Easy Light Linker · receiver",ports:0,net:["lor"]},
 repeater:{name:"RS485 repeater",ports:0,net:["lor","elor"]}
};
export const profile=d=>d.model==="generic"&&d.portCount?{...hardware.generic,ports:d.portCount}:hardware[d.model];
const str=z.string().max(160), key=z.string().min(1).max(80);
const pt=z.tuple([z.number().finite().min(-250).max(250),z.number().finite().min(-250).max(250),z.number().finite().min(-250).max(250)]);
const num=(a,b)=>z.number().int().min(a).max(b);
const choice=o=>z.string().refine(v=>Object.hasOwn(o,v));
const net=z.object({id:key,name:str.min(1),protocol:choice(protocols),source:str,speed:num(0,17000000),bridge:str,output:num(1,6),slots:z.union([z.literal(510),z.literal(512)]),notes:str});
const rotation=z.number().min(-360).max(360).default(0);
const device=z.object({rotation,locked:z.boolean().default(false),scale:z.number().min(.25).max(4).default(1),id:key,name:str.min(1),model:choice(hardware),net:key,normal:pt.nullish(),portCount:num(1,128).optional(),offPorts:z.array(num(1,512)).max(512).default([]),parent:str,unit:z.string().regex(/^[0-9A-F]{2}$/),ip:str,rf:num(0,31),branch:num(1,6),universe:num(1,63999),pixelLimit:num(1,2048),splitEvenly:z.boolean().default(false),notes:str,point:pt.nullable()});
const normal=z.tuple([z.number().min(-1.001).max(1.001),z.number().min(-1.001).max(1.001),z.number().min(-1.001).max(1.001)]);
const light=z.object({locked:z.boolean().default(false),id:key,name:str.min(1),zone:str.min(1),type:choice(fixtures),shape:choice(shapes),mount:str,points:z.array(pt).min(1).max(160),color:z.string().regex(/^#[a-f0-9]{6}$/i),color2:z.string().regex(/^#[a-f0-9]{6}$/i),effect:choice(effects),count:num(1,2048),size:z.number().min(.1).max(20),brightness:num(1,100),device:str,port:num(1,512),offset:num(1,2048),universe:num(1,63999),slot:num(1,512),visible:z.boolean(),order:z.enum(["RGB","RBG","GRB","GBR","BRG","BGR","RGBW","GRBW"]),notes:z.string().max(800)});
const plant=z.object({locked:z.boolean().default(false),id:key,name:str.min(1),kind:choice(species),point:pt,height:z.number().min(.2).max(22),width:z.number().min(.2).max(16),rotation:z.number().min(-360).max(360),visible:z.boolean()});
const plannedLight=light.extend({rotation,normal:normal.nullish(),normals:z.array(normal.nullable()).max(160).optional(),autoCord:z.boolean().optional(),plant:str.optional(),endPlant:str.optional(),dressing:choice(dressings).optional(),branchA:num(0,7).optional(),branchB:num(0,7).optional(),turns:num(1,12).optional(),drop:z.number().min(0).max(8).optional(),points:z.array(pt).max(160),reference:str.default(""),state:z.enum(["Planned","Installed","Needs check","Spare"]).default("Planned"),yaw:z.number().min(-180).max(180).default(0),pitch:z.number().min(-90).max(90).default(beamDefaults.pitch),spread:z.number().min(6).max(110).default(beamDefaults.spread),reach:z.number().min(.5).max(35).default(beamDefaults.reach)});
const cable=z.object({detachedLead:z.boolean().optional(),slackFt:z.number().min(0).max(1000).optional(),id:key,name:str.min(1),kind:choice(cableKinds),output:num(1,512).optional(),normals:z.array(normal.nullable()).max(160).optional(),attachment:z.enum(["surface","free"]).default("surface"),color:z.string().regex(/^#[a-f0-9]{6}$/i),from:str,to:str,points:z.array(pt).min(2).max(160),style:z.enum(["corners","smooth","hanging"]),sag:z.number().min(0).max(8),width:z.number().min(.01).max(.18),visible:z.boolean(),notes:z.string().max(800)});
export const showSchema=z.object({version:z.literal(1),name:str.trim().min(1),fixtures:z.array(plannedLight).max(300),devices:z.array(device).max(200),networks:z.array(net).max(80),plants:z.array(plant).max(150).default(propertyPlants),cables:z.array(cable).max(300).default([])}).superRefine((d,c)=>{
 const ids=[...d.fixtures,...d.devices,...d.networks,...d.plants,...d.cables].map(x=>x.id);
 if(new Set(ids).size!==ids.length)c.addIssue({code:"custom",message:"Duplicate record ID"});
 for(const f of d.fixtures) if(f.shape==="run"&&f.points.length===1)c.addIssue({code:"custom",message:"A strand needs two points"});
});
export const defaultNet=()=>({id:id(),name:"Regular",protocol:"elor",source:"USB485-HS",speed:500000,bridge:"",output:1,slots:510,notes:""});
export const defaultDevice=(net)=>({id:id(),name:"Pixel controller",model:"pixie16",net,parent:"",unit:"01",ip:"",rf:16,branch:1,universe:1,pixelLimit:170,notes:"",point:null});
export const defaultFixture=()=>({id:id(),name:"Porch fascia",zone:"Front porch",type:"pixel",shape:"run",mount:"porch.fascia",points:mounts["porch.fascia"],color:palette[0],color2:palette[1],effect:"steady",count:75,size:1.8,brightness:85,device:"",port:1,offset:1,universe:1,slot:1,visible:true,order:"RGB",notes:""});
export function sample(){
 const n={...defaultNet(),id:"show-bus",name:"Regular"}, d={...defaultDevice(n.id),id:"porch-box",name:"Porch Pixie16",point:[4.3,-.9,2.6]};
 const list=["front.upper-eave","dormer.left","dormer.right","porch.fascia","porch.rail.left","porch.rail.right"].map((m,i)=>({...defaultFixture(),id:"strand-"+i,name:mountNames[m],mount:m,points:mounts[m],zone:i<3?"Roofline":"Front porch",color:palette[[0,1,1,0,2,2][i]],count:[90,32,32,80,32,32][i],port:i+1,device:d.id}));
 for(const [i,x] of [-2.15,2.6].entries())list.push({...defaultFixture(),id:"tree-"+i,name:i?"East spiral tree":"West spiral tree",zone:"Front yard",shape:"tree",effect:i?"twinkle":"fade",size:2.0,count:82,points:[[x,-1.21,5.2]],mount:"",color:palette[i?1:2],port:7+i,device:d.id});
 return {version:1,name:"Winter showcase · sample",fixtures:list,devices:[d],networks:[n]};
}
export const hex=n=>n.toString(16).toUpperCase().padStart(2,"0");
export const isPixel=f=>["pixel","rgbw"].includes(f.type);
export const channels=f=>isPixel(f)?f.count*(f.type==="rgbw"?4:3):f.type==="rgb"?3:1;
export const isSerial=n=>["lor","elor","pixlink"].includes(n?.protocol);
export function wirePoints(f){
 if(!f.points.length)return [];
 if(f.shape==="run")return f.points;
 const points=fixturePattern(f);
 if(!f.rotation||f.shape==="flood")return points;
 const base=f.points[0],turn=mountRotation(f.normal,f.rotation);
 return points.map(p=>turn(p.map((v,i)=>v-base[i])).map((v,i)=>v+base[i]));
}
function fixturePattern(f){
 if(["matrix","icicles","net","cane"].includes(f.shape))return propPattern(f);
 const [x,y,z]=f.points[0], h=f.size, pts=[];
 if(f.shape==="flood"){
  const normal=f.normal||[0,1,0];
  return [.12,.16].map(offset=>f.points[0].map((v,i)=>v+normal[i]*offset*floodScale(f)));
 }
 const steps=f.shape==="star"?10:96;
 // Flat props turn about their anchor so they can sit against any wall.
 const yaw=(f.yaw||0)*Math.PI/180,turn=(dx,height)=>[x+dx*Math.cos(yaw),height,z-dx*Math.sin(yaw)];
 for(let i=0;i<=steps;i++){
  const t=i/steps, a=t*Math.PI*2;
  if(f.shape==="tree")pts.push([x+Math.cos(a*6)*h*.31*(1-t),y+.05+h*t,z+Math.sin(a*6)*h*.31*(1-t)]);
  else if(f.shape==="arch")pts.push(turn(-Math.cos(Math.PI*t)*h,y+.05+Math.sin(Math.PI*t)*h));
  else {const r=h*.5*(f.shape==="star"&&i%2?.45:1);pts.push(turn(Math.sin(a)*r,y+h*.5+Math.cos(a)*r));}
 }return pts;
}
export function length(f){const pts=wirePoints(f);return pts.slice(1).reduce((a,p,i)=>a+Math.hypot(...p.map((v,k)=>v-pts[i][k])),0)}
export const feet=m=>(m/.3048).toFixed(1)+" ft";
export const doubleID=d=>d.model.startsWith("pixie")&&d.pixelLimit>170;
export function serialPixel(f,d,offset=f.offset){
 const split=doubleID(d)?(d.splitEvenly?Math.ceil(d.pixelLimit/2):170):Infinity;
 const second=offset>split,relative=(f.port-1)*(doubleID(d)?2:1)+Number(second);
 return {relative,channel:((second?offset-split:offset)-1)*(f.type==="rgbw"?4:3)+1,split};
}
export function address(f,d,n){
 if(!d||!n)return "Unpatched";
 if(!isSerial(n))return "U"+f.universe+" · ch "+f.slot;
 const p=hardware[d.model].kind==="pixel";
 const pixel=p?serialPixel(f,d):null;
 const uid=parseInt(d.unit,16)+(pixel?.relative||0);
 const start=p?pixel.channel:hardware[d.model].kind==="dc"&&f.type==="rgb"?(f.port-1)*3+1:f.port;
 return hex(uid)+" · ch "+start;
}
export const sources=[
 ["Pixie double Unit ID and split modes","https://store.lightorama.com/pages/pixie-double-unit-id-mode"],
 ["CF50D RGB flood and strobe channels","https://www1.lightorama.com/PDF/CF50D_UF50D_UserMan_Web.pdf"],
 ["Network capacity and controller compatibility","https://store.lightorama.com/pages/how-many-lights-can-i-connect"],
 ["Pixie series and pixel addressing","https://www1.lightorama.com/help/light-o-rama-pixie-series-cont.htm"],
 ["Unit IDs and DIP switches","https://store.lightorama.com/pages/dip-switch-and-unit-ids"],
 ["Easy Light Linker radio setup","https://www1.lightorama.com/help/light-o-rama_wireless_devices.htm"],
 ["PixieLink universe mapping","https://www.lightorama.com/help/light-o-rama-pixielink-sacn-ad.htm"],
 ["Aurora Core and long-range receivers","https://www1.lightorama.com/PDF/Aurora%20Core%20-%20Users%20Manual%202024.pdf"],
 ["PixCon16 network modes","https://www.lightorama.com/downloads/6.2.4/help/pixcon16_configuration.htm"],
 ["Controller and adapter manuals","https://store.lightorama.com/pages/manuals"]];

