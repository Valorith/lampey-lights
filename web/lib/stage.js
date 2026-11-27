export const cableKinds={
 ethernet:{name:"Ethernet / LAN",color:"#58ccfa"},lor:{name:"LOR RS485",color:"#ac96ff"},
 power:{name:"AC extension",color:"#ffb35f"},dc:{name:"DC power",color:"#f47872"},
 pixel:{name:"Pixel data",color:"#69e0b4"},dmx:{name:"DMX",color:"#ed8acc"},
 usb:{name:"USB",color:"#e7da88"},differential:{name:"Long-range receiver",color:"#83aeff"}
};
export const lampPresets=[
 ["RGB flood","flood","rgb",1,"#8da7ff"],["Pixel strand","run","pixel",75,"#ffce92"],
 ["C9 roof bulbs","run","ac",32,"#ffb15f"],["Mini LED string","run","ac",100,"#ffd394"],
 ["RGB strip","run","rgb",100,"#77e0bc"],["RGBW pixels","run","rgbw",80,"#c9a8ff"],
 ["Icicle lights","icicles","ac",90,"#c4eaff"],["Net lights","net","ac",96,"#a1f3d2"],
 ["Pixel matrix","matrix","pixel",128,"#afacff"],["Candy cane","cane","pixel",40,"#ff8889"],
 ["Spiral tree","tree","pixel",100,"#7ad4a9"],["Arch","arch","pixel",50,"#9bbaff"],
 ["Wreath","wreath","ac",50,"#a7db93"],["Star","star","pixel",50,"#ffda7c"],
 ["On/off display","star","relay",1,"#fff0be"]
];
export const beamDefaults={yaw:0,pitch:26,spread:42,reach:9};
const rad=Math.PI/180;
// Rotate geometry and connectors in the same frame around the mounting surface's normal.
export function mountRotation(normal,degrees){
 if(!degrees)return vector=>vector;
 const axis=unit(normal||[0,1,0]),s=Math.sin(degrees*rad),c=Math.cos(degrees*rad);
 return vector=>{
  const tangent=cross(axis,vector),along=axis.reduce((sum,n,i)=>sum+n*vector[i],0)*(1-c);
  return vector.map((v,i)=>v*c+tangent[i]*s+axis[i]*along);
 };
}
export function beamDirection(f){
 const yaw=(f.yaw??0)*rad,pitch=(f.pitch??26)*rad;
 return mountRotation(f.normal,f.rotation)([Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)]);
}
export const floodScale=f=>(f.size??1.8)/1.8;
export function lampOrigin(f){const p=f.points[0],n=f.normal||[0,1,0];return p.map((v,i)=>v+n[i]*.24*floodScale(f))}
export function aimAt(f,point){const o=lampOrigin(f),[dx,dy,dz]=mountRotation(f.normal,-(f.rotation||0))(point.map((x,i)=>x-o[i]));
 if(Math.hypot(dx,dy,dz)<.02)return f;
 return {...f,yaw:Math.round(Math.atan2(dx,-dz)/rad),pitch:Math.round(Math.atan2(dy,Math.hypot(dx,dz))/rad)}
}
export function defaultCable(kind="ethernet"){return {id:crypto.randomUUID(),name:cableKinds[kind].name,kind,color:cableKinds[kind].color,from:"",to:"",points:[],style:"corners",sag:.3,width:.04,visible:true,notes:""}}
export function endpoints(design){
 return [...design.devices.filter(d=>d.point).map(d=>({id:"d/"+d.id,name:d.name,point:devicePoint(d,0,.15,.16),item:d})),
 ...design.fixtures.filter(f=>f.points.length).map(f=>({id:"f/"+f.id,name:f.name,point:f.points[0],item:f}))];
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/(Math.hypot(...a)||1));
export function deviceBasis(d){
 const n=unit(d.normal||[0,1,0]),wall=Math.abs(n[1])<.55;
 const x=unit(cross(wall?[0,1,0]:n,wall?n:[0,0,1])),y=wall?cross(n,x):n,z=wall?n:cross(x,y);
 const turn=mountRotation(n,d.rotation);
 return {x:turn(x),y:turn(y),z:turn(z),origin:d.point.map((v,i)=>v+(wall?.32:.014)*(d.scale??1)*n[i])};
}
export function devicePoint(d,u,v,w){const {origin,x,y,z}=deviceBasis(d);return origin.map((p,i)=>p+(x[i]*u+y[i]*v+z[i]*w)*(d.scale??1))}
export function outputPoint(d,port=1){return devicePoint(d,((port-1)%4-1.5)*.083,.095+Math.floor(((port-1)%16)/4)*.043,.19)}
export function connected(c,id,design){return [c.from,c.to].some(key=>key==="d/"+id||design.fixtures.some(f=>f.device===id&&key==="f/"+f.id))}
export function cablePoints(c,design){const ends=endpoints(design);const pts=c.points.map(p=>[...p]);
 if(pts.length){const a=ends.find(e=>e.id===c.from),b=ends.find(e=>e.id===c.to);if(a)pts[0]=a.id.startsWith("d/")&&c.output?outputPoint(a.item,c.output):a.point;if(b)pts[pts.length-1]=b.point}return pts
}
const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
export function routedPoints(points,style,sag=.3){
 const p=points.filter((v,i)=>!i||v.some((x,k)=>Math.abs(x-points[i-1][k])>.00001));
 if(p.length<2||style==="corners")return p;
 const result=[p[0]];
 if(style==="smooth"){
  for(let i=1;i<p.length-1;i++){const left=mix(p[i],p[i-1],.21),right=mix(p[i],p[i+1],.21);
   for(let j=0;j<=8;j++){const t=j/8;result.push(mix(mix(left,p[i],t),mix(p[i],right,t),t))}}
  result.push(p.at(-1));return result;
 }
 for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],drop=Math.min(sag,Math.hypot(b[0]-a[0],b[2]-a[2])*.45);
  for(let j=1;j<=16;j++){if(j===16){result.push(b);continue}const t=j/16,pt=mix(a,b,t);pt[1]-=4*t*(1-t)*drop;result.push(pt)}}
 return result;
}
export const routeLength=p=>p.slice(1).reduce((total,v,i)=>total+Math.hypot(...v.map((x,k)=>x-p[i][k])),0);
export function sceneCables(design){
 const saved=design.cables||[],rows=[...saved];
 for(const f of design.fixtures){
  const d=design.devices.find(box=>box.id===f.device);
  if(!d?.point||!f.points.length||f.autoCord===false)continue;
  const kind=/^ac(8|16)$/.test(d.model)&&["ac","relay"].includes(f.type)?"power":/^cmb/.test(d.model)&&["dc","rgb"].includes(f.type)?"dc":/^(pixie|pixcon|aurora|edge|generic)/.test(d.model)&&["pixel","rgbw"].includes(f.type)?"pixel":null;
  if(!kind)continue;const from="d/"+d.id,to="f/"+f.id;
  if(saved.some(c=>[c.from,c.to].includes(from)&&[c.from,c.to].includes(to)&&["power","dc","pixel"].includes(c.kind)))continue;
  const a=outputPoint(d,f.port),b=f.points[0],bend=[b[0],a[1],a[2]],turn=[b[0],a[1],b[2]];
  rows.push({id:"cord-"+f.id,name:f.name+" cord",kind,color:cableKinds[kind].color,from,to,output:f.port,points:[a,bend,turn,b],style:"smooth",sag:0,width:.042,visible:true,notes:"",inferred:true});
 }return rows;
}
export function controllerCords(design,id,pathFor){
 const box=design.devices.find(d=>d.id===id);if(!box?.point)return [];
 const key="d/"+id,lights=new Map(design.fixtures.map(f=>["f/"+f.id,f]));
 return sceneCables(design).flatMap(c=>{
  if(!c.visible||!["power","dc","pixel"].includes(c.kind))return [];
  const reverse=c.to===key,fx=lights.get(reverse?c.from:c.to);if((c.from!==key&&!reverse)||!fx||!fx.points.length)return [];
  const port=c.output??(fx.device===id?fx.port:null);if(!port)return [];
  const points=pathFor?[...pathFor(c,design)]:routedPoints(cablePoints(c,design),c.style,c.sag);if(reverse)points.reverse();
  return [{c,fx,port,points,active:!box.offPorts?.includes(port)}]
 });
}
export function detachCables(previous,next){
 const remaining=new Set(endpoints(next).map(e=>e.id));
 return (next.cables||[]).map(c=>{
  if((!c.from||remaining.has(c.from))&&(!c.to||remaining.has(c.to)))return c;
  return {...c,points:cablePoints(c,previous),from:remaining.has(c.from)?c.from:"",to:remaining.has(c.to)?c.to:""};
 });
}
export function propPattern(f){
 const [x,y,z]=f.points[0],h=f.size,angle=(f.yaw||0)*rad;
 const orient=(u,v,w=0)=>[x+u*Math.cos(angle)+w*Math.sin(angle),y+v,z-u*Math.sin(angle)+w*Math.cos(angle)];
 const pts=[];
 if(f.shape==="cane"){pts.push(orient(-h*.14,0));for(let i=0;i<=30;i++){const a=Math.PI-i*Math.PI/30;pts.push(orient(Math.cos(a)*h*.14,h*.85+Math.sin(a)*h*.15))}pts.push(orient(h*.14,h*.74));return pts}
 if(f.shape==="icicles"){for(let i=0;i<13;i++){const u=h*(i/6-1);pts.push(orient(u,0),orient(u,-h*(.22+(i%3)*.10)),orient(u,0))}return pts}
 const rows=f.shape==="matrix"?8:6,cols=f.shape==="matrix"?16:12;
 for(let j=0;j<rows;j++){for(let i=0;i<cols;i++){const k=j%2?cols-i-1:i;pts.push(orient(h*(k/(cols-1)-.5)*1.6,h*j/(rows-1)+(f.shape==="net"&&k%2?h*.06:0)))}}
 return pts;
}

