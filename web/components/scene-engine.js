import {fitCord} from "../lib/cord-route.js";
import {propertySurface} from "../lib/surface-fit.js";
import {clearWindowTrim,guideNormal} from "../lib/window-mounts.js";
import {depthAtPoints} from "../lib/software-depth.js";
import * as T from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {wirePoints,mounts,mountNames} from "../lib/show";
import {stageRenderer} from "./stage-renderer";
import {routeLength,sceneCables,beamDirection,lampOrigin,cablePoints,routedPoints} from "../lib/stage";

const vec=p=>new T.Vector3(...p);
const views={"Street trees":[[-6.7,3.4,23],[-6.6,2.4,8.5]],Street:[[12.4,6.8,22.1],[0,2,-2.4]],Front:[[0,3.6,24],[0,2.5,-1]],Driveway:[[23,5.1,5.5],[2,1,-4]],"Back stairs":[[7.25,1.48,-8.68],[.94,.98,-9.42]],Pool:[[13.5,10,-29.5],[0,1,-10]],"Rear elevation":[[.7,2.3,-33],[.4,2.05,-9.8]],Overhead:[[0,35,-3],[0,0,-3]]};
export const viewNames=Object.keys(views);
const onBuilding=f=>f?.shape==="run"&&!f.plant;
const mountPoint=(f,p)=>onBuilding(f)?clearWindowTrim(p):p;
function samples(f,path){
 const pts=path.map(vec);if(pts.length<=1)return pts;
 if(f.shape==="flood")return [vec(lampOrigin(f)).addScaledVector(vec(beamDirection(f)),.09)];
 const dist=[0];for(let i=1;i<pts.length;i++)dist.push(dist[i-1]+pts[i].distanceTo(pts[i-1]));
 const count=f.shape==="flood"?1:Math.min(f.count,240);let s=1;
 return Array.from({length:count},(_,i)=>{const t=dist.at(-1)*i/Math.max(1,count-1);while(s<pts.length-1&&dist[s]<t)s++;const p=pts[s-1].clone().lerp(pts[s],(t-dist[s-1])/(dist[s]-dist[s-1]||1));return onBuilding(f)?vec(clearWindowTrim(p.toArray())):p})
}
function frameColor(f,i,time,playing){
 const alternate=f.shape==="flood"?(playing&&Math.floor(time)%2):i%2;
 const c=new T.Color(f.effect==="alternate"&&alternate?f.color2:f.color);
 if(f.effect==="cycle"&&playing)c.setHSL((time*.12+(f.shape==="flood"?0:i*.009))%1,.92,.55);
 let a=f.brightness/100;if(playing){if(f.effect==="chase")a*=.14+.86*Math.pow((1+Math.cos(i*.38-time*4))/2,4);
 if(f.effect==="twinkle")a*=.27+.73*Math.pow((1+Math.sin(i*107+time*(2+i%5)))/2,2);if(f.effect==="fade")a*=.2+.8*(1+Math.cos(time*2))/2}
 return c.multiplyScalar(a);
}
export function createScene(host,events){
 const scene=new T.Scene(),cam=new T.PerspectiveCamera(42,1,.08,200);
 const base=new T.Group();scene.add(base);
 const canvas=document.createElement("canvas");canvas.className="sceneCanvas";canvas.tabIndex=0;canvas.setAttribute("aria-label","Interactive 3D property");host.append(canvas);
 let gl;try{gl=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"low-power"});gl.setPixelRatio(Math.min(devicePixelRatio,1.65));gl.setClearColor(0,0)}catch{}
 const cpuCanvas=gl?null:document.createElement("canvas");if(cpuCanvas){cpuCanvas.className="sceneCanvas";host.append(cpuCanvas);canvas.hidden=true}
 const surface=cpuCanvas||canvas,ctx=cpuCanvas?.getContext("2d");
 const overlay=document.createElement("canvas");overlay.className="overlayCanvas";host.append(overlay);const ink=overlay.getContext("2d");
 const controls=new OrbitControls(cam,surface);controls.minDistance=2;controls.maxDistance=87;controls.maxPolarAngle=Math.PI*.49;controls.enableDamping=false;
 const ambient=new T.HemisphereLight(0xb7ceff,0x707969,2);scene.add(ambient);
 const key=new T.DirectionalLight(0xffebca,2);key.position.set(-5,11,9);scene.add(key);
 const grid=new T.GridHelper(100,80,0x30464c,0x30464c);grid.position.y=-3.17;grid.material.transparent=true;grid.material.opacity=.22;scene.add(grid);
 let depthCache=null,depthKey="",wires=[],state={},runs=[],triangles=[],labels=[],pickMeshes=[],model,disposed=false,raf=0,last=0,w=1,h=1,down=null,drag=-1,bulbs,mat,coords,colors,projection=[];
 const ray=new T.Raycaster();
 let lastWarning="";const blockedRoutes=new Set();
 let fitted=null,cacheDesign=null,cache=new Map(),lastInput=null,posed=null,previewPath=[];
 function placeBodies(design){if(!fitted||!design)return design;if(lastInput===design)return posed;lastInput=design;
  const devices=design.devices.map(d=>{if(!d.point)return d;const normal=d.normal||fitted.support(d.point);if(!normal)return d;
   return {...d,normal,point:fitted.footprint(d.point,normal,.41,Math.abs(normal[1])<.55?.38:.3,Math.abs(normal[1])<.55?.29:0)}});
  const fixtures=design.fixtures.map(f=>{if(f.shape==="run"||!f.points.length||f.plant)return f;
   const normal=f.normal||fitted.support(f.points[0]);if(!normal)return f;const points=f.shape==="flood"?[fitted.footprint(f.points[0],normal,.22,.22)]:f.points;
   return {...f,normal,points}});
  posed={...design,devices,fixtures};return posed;
 }
 function cached(key,design,build){if(design!==cacheDesign){cacheDesign=design;cache.clear()}if(!cache.has(key))cache.set(key,build());return cache.get(key)}
 function fixturePath(f){return cached("f/"+f.id,state.design,()=>{
  const raw=wirePoints(f);if(!fitted||f.plant||!raw.length)return raw;
  if(f.shape==="run"){const normal=guideNormal(f.mount);const path=fitted.route(raw,{normals:normal?raw.map(()=>normal):f.normals,window:true});if(path.obstructed){blockedRoutes.add(f.name);return []}return path}
  if(!f.normal||f.shape==="flood")return raw;
  const n=vec(f.normal),anchor=vec(f.points[0]),min=Math.min(...raw.map(p=>vec(p).sub(anchor).dot(n)));
  return raw.map(v=>fitted.seat(vec(v).addScaledVector(n,Math.max(0,.026-min)),n,0).toArray());
 })}
 function terminals(c,design){const raw=cablePoints(c,design);let targetNormal=null;
  for(const [key,index] of [[c.from,0],[c.to,raw.length-1]]){if(!key?.startsWith("f/"))continue;
   const f=design.fixtures.find(f=>"f/"+f.id===key);if(!f?.points.length)continue;
   const first=fixturePath(f)[0];if(first){raw[index]=first;targetNormal=guideNormal(f.mount)||f.normal||f.normals?.[0]}}
  return {raw,targetNormal};
 }
 function cordPath(c,design){return cached("c/"+c.id,design,()=>{const {raw,targetNormal}=terminals(c,design);
  const ordinary=routedPoints(raw,c.style,c.sag);
  if(!fitted||c.attachment==="free")return ordinary;
  const path=fitCord(fitted,raw,c,targetNormal);if(path.obstructed){if(!c.inferred)blockedRoutes.add(c.name);return []}
  if(c.style==="hanging"){const drape=[];for(let i=1;i<path.length;i++){
   const run=routedPoints([path[i-1],path[i]],"hanging",c.sag);
   for(let j=i===1?0:1;j<run.length;j++){const t=j/(run.length-1),straight=path[i-1][1]*(1-t)+path[i][1]*t;
    drape.push(fitted.seat(vec(run[j]),new T.Vector3(0,1,0),c.width/2,Math.max(.08,straight-run[j][1]+.10),.08).toArray())}
  }return drape}
  if(c.style!=="smooth")return path;
  const curve=routedPoints(path,"smooth"),r=c.width/2+.012;
  for(let i=1;i<curve.length;i++){
   const a=vec(curve[i-1]),b=vec(curve[i]),v=b.clone().sub(a),length=v.length();
   if(length>.0001&&(fitted.cast(a,v.divideScalar(length),length)||fitted.nearest(b,r)))return path;
  }return curve;
 })}
 const stage=stageRenderer(scene,cordPath);
 function screen(p){const v=p.clone().project(cam);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,z:v.z}}
 function resolveHit(ev){
  const rect=surface.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
  ray.setFromCamera({x:2*x/w-1,y:1-2*y/h},cam);
  const hit=ray.intersectObjects(state.mode==="plant"?pickMeshes:[...pickMeshes,...stage.surfaces()],false).find(v=>v.object.userData.placement_surface!==false);
  let normal=null,point=hit?.point.clone();if(point&&hit.face){const norm=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(norm.dot(ray.ray.direction)>0)norm.negate();normal=norm.toArray();point.addScaledVector(norm,.045)}
  return {x,y,normal,point:point&&["draw","edit"].includes(state.mode)?clearWindowTrim(point.toArray()):point?.toArray(),distance:hit?.distance??Infinity,surfaceName:hit?.object.name}
 }
 function invalidate(){if(!raf&&!disposed)raf=requestAnimationFrame(draw)}
 function preset(name){
  const [p,t]=views[name]||views.Street;const target=vec(t);cam.position.copy(vec(p).sub(target).multiplyScalar(Math.max(1,1.12/(w/h))).add(target));controls.target.copy(target);controls.update();invalidate()
 }
 function resize(){w=Math.max(1,host.clientWidth);h=Math.max(1,host.clientHeight);cam.aspect=w/h;cam.updateProjectionMatrix();gl?.setSize(w,h,false);
  for(const c of [overlay,cpuCanvas].filter(Boolean)){c.width=w;c.height=h}invalidate()}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();preset("Street");controls.addEventListener("change",invalidate);
 new GLTFLoader().load("/property.glb?rev=rear-room-slider-4",asset=>{
  if(disposed){asset.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});return}
  model=asset.scene;base.add(model);model.updateMatrixWorld(true);
  model.traverse(obj=>{if(!obj.isMesh)return;for(let a=obj;a;a=a.parent){if(/Evergreens.and.foundation.shrubs/i.test(a.name)){obj.visible=false;return}}pickMeshes.push(obj);
   if(!ctx)return;const geo=obj.geometry,attr=geo.attributes.position,ix=geo.index,materials=Array.isArray(obj.material)?obj.material:[obj.material];
   const vs=Array.from({length:attr.count},(_,i)=>new T.Vector3().fromBufferAttribute(attr,i).applyMatrix4(obj.matrixWorld));
   for(const g of geo.groups.length?geo.groups:[{start:0,count:ix?.count||attr.count,materialIndex:0}]){
    const m=materials[g.materialIndex]||materials[0];
    for(let j=g.start;j<g.start+g.count;j+=3){const [a,b,c]=[0,1,2].map(k=>vs[ix?ix.getX(j+k):j+k]);const n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();const lum=.55+.45*Math.max(0,n.dot(new T.Vector3(-.4,.8,.45)));
     const color=m.color.clone().multiplyScalar(lum);triangles.push({a,b,c,n,day:"#"+color.getHexString(),night:"#"+color.multiply(new T.Color(.26,.34,.48)).getHexString()})}
   }
  });fitted=propertySurface(pickMeshes);cache.clear();depthCache=null;if(state.design){state={...state,design:placeBodies(state.design)};rebuild()}events.ready();invalidate()
 },undefined,()=>events.fail("The property could not load. Reload to retry."));
 function rebuild(){
  depthCache=null;if(cacheDesign!==state.design)blockedRoutes.clear();
  wires=state.design?sceneCables(state.design):[];
  if(state.design)stage.sync(state.design,pickMeshes,!!ctx);
  if(bulbs){scene.remove(bulbs);bulbs.geometry.dispose();mat.dispose()}
  runs=(state.design?.fixtures||[]).filter(f=>f.visible&&f.points.length).map(f=>({f,pts:samples(f,fixturePath(f)),off:state.design.devices.find(d=>d.id===f.device)?.offPorts?.includes(f.port)}));
  const total=runs.reduce((n,r)=>n+r.pts.length,0);coords=new Float32Array(total*3);colors=new Float32Array(total*3);
  let k=0;for(const r of runs)for(const p of r.pts){p.toArray(coords,k);k+=3}
  const geo=new T.BufferGeometry();geo.setAttribute("position",new T.BufferAttribute(coords,3));geo.setAttribute("color",new T.BufferAttribute(colors,3));
  mat=new T.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{night:{value:state.night?1:0}},vertexShader:"varying vec3 v; uniform float night; void main(){v=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp((night>.5?200.:120.)/max(1.,-p.z),3.,18.);gl_Position=projectionMatrix*p;}",fragmentShader:"varying vec3 v;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.||max(v.r,max(v.g,v.b))<.0001)discard;float glow=exp(-4.*r*r);gl_FragColor=vec4(mix(v,vec3(1.),.42*exp(-28.*r*r)),glow);}"});
  bulbs=new T.Points(geo,mat);bulbs.frustumCulled=false;scene.add(bulbs);const warning=[...blockedRoutes].join(", ");if(warning&&lastWarning!==warning)events.fail("Add a waypoint around the obstruction: "+warning);lastWarning=warning;invalidate()
 }
 function draw(now){
  raf=0;if(disposed)return;if((state.play||stage.animated())&&now-last<(gl?50:130)&&document.hasFocus()){invalidate();return}last=now;
  ambient.intensity=state.night?.82:2;ambient.color.set(state.night?0xaac6ff:0xe9f2ff);key.intensity=state.night?.64:2.15;key.color.set(state.night?0xbdd1ff:0xffedcd);
  cam.updateMatrixWorld();ink.clearRect(0,0,w,h);
  let k=0;projection=[];const time=now/1000;
  const off=(f)=>state.design?.devices.find(d=>d.id===f.device)?.offPorts?.includes(f.port);stage.update(state,(f,...args)=>off(f)?new T.Color(0):frameColor(f,...args),time);
  for(const r of runs){r.pts.forEach((p,i)=>{const col=r.off?new T.Color(0):frameColor(r.f,i,time,state.play);col.toArray(colors,k);k+=3;projection.push({...screen(p),id:r.f.id,c:"#"+col.getHexString()})})}
  if(bulbs)bulbs.geometry.attributes.color.needsUpdate=true;
  if(gl)gl.render(scene,cam);else if(ctx){
   ctx.clearRect(0,0,w,h);const faces=[];
   for(const tri of triangles){if(tri.n.dot(cam.position.clone().sub(tri.a))<=0)continue;const a=screen(tri.a),b=screen(tri.b),c=screen(tri.c);
    if(a.z>1||a.z< -1||Math.abs((a.x-b.x)*(c.y-b.y)-(c.x-b.x)*(a.y-b.y))<.52)continue;
    faces.push({z:(a.z+b.z+c.z)/3,a,b,c,fill:state.night?tri.night:tri.day})}
   stage.software(faces,screen,state.wiring);
   const key=[...cam.matrixWorld.elements,w,h,state.sel,state.wiring].join(",");
   if(!depthCache||key!==depthKey){depthKey=key;depthCache=depthAtPoints(faces,w,h)}
   faces.sort((a,b)=>b.z-a.z);for(const f of faces){ctx.globalAlpha=f.alpha??1;if(f.a){ctx.fillStyle=f.fill;ctx.beginPath();ctx.moveTo(f.a.x,f.a.y);ctx.lineTo(f.b.x,f.b.y);ctx.lineTo(f.c.x,f.c.y);ctx.closePath();ctx.fill()}}ctx.globalAlpha=1;
   for(const p of [...projection,...faces.filter(f=>!f.a)]){if(!depthCache(p)||p.c==="#000000")continue;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill()}
  }
  function line(points,color,dash=[]){if(!points.length)return;ink.strokeStyle=color;ink.lineWidth=1.6;ink.setLineDash(dash);ink.beginPath();points.forEach((p,i)=>{const v=screen(vec(p));if(i)ink.lineTo(v.x,v.y);else ink.moveTo(v.x,v.y)});ink.stroke();ink.setLineDash([])}
  function dot(p,color,r){const v=screen(vec(p));ink.beginPath();ink.fillStyle=color;ink.arc(v.x,v.y,r,0,Math.PI*2);ink.fill()}
  labels=[];
  function tag(p,text,color,id){const s=screen(vec(p));if(s.z>1||s.z< -1)return;ink.font="600 12px system-ui";const tw=ink.measureText(text).width+20;let y=s.y-30;for(let n=0;n<4&&labels.some(l=>Math.abs(l.y-y)<21&&Math.abs(l.x-s.x)<(tw+l.w)/2);n++)y-=22;const x=s.x-tw/2;ink.fillStyle="#101b24ed";ink.beginPath();ink.roundRect(x,y,tw,21,5);ink.fill();ink.fillStyle=color;ink.fillRect(x+4,y+5,2,11);ink.fillStyle="#f3f5ed";ink.fillText(text,x+10,y+14.5);labels.push({x:s.x,y,w:tw,id})}
  for(const r of runs){if(r.pts.length&&(state.labels||r.f.id===state.sel))tag(r.pts[Math.floor(r.pts.length/2)].toArray(),r.f.name,r.f.color,r.f.id);
   if(state.mode==="edit"&&r.f.id===state.sel){const anchors=r.f.points.map(p=>mountPoint(r.f,p));line(anchors,"#ffce80");anchors.forEach(p=>dot(p,"#ffce80",5))}}
  const box=state.design?.devices.find(d=>d.id===state.sel&&d.point);
  if(box){const s=screen(vec(box.point));events.anchor(s.x,s.y,s.z);const el=host.parentElement.querySelector(".boxPopover");if(el&&s.z<1){const x=s.x<el.offsetLeft?el.offsetLeft:s.x>el.offsetLeft+el.offsetWidth?el.offsetLeft+el.offsetWidth:Math.max(el.offsetLeft,Math.min(s.x,el.offsetLeft+el.offsetWidth));const y=Math.max(el.offsetTop+8,Math.min(s.y,el.offsetTop+el.offsetHeight-8));ink.strokeStyle="#b3ebc8";ink.lineWidth=1.4;ink.beginPath();ink.moveTo(s.x,s.y);ink.lineTo(x,y);ink.stroke();dot(box.point,"#b3ebc8",3)}for(const f of state.design.fixtures.filter(f=>f.device===box.id&&f.points.length&&f.visible)){
    const end=f.points[0],c=wires.find(c=>[c.from,c.to].includes("d/"+box.id)&&[c.from,c.to].includes("f/"+f.id));
    if(c?.visible&&!stage.animated())dot(cablePoints(c,state.design)[0],c.color,3);

    dot(end,f.color,5);if(!state.labels)tag(end,"Ch "+f.port+" · "+f.name,f.color,f.id);
   }}
  for(const p of state.design?.plants||[])if(p.visible&&(p.id===state.sel||state.labels))tag([p.point[0],p.point[1]+p.height*.7,p.point[2]],p.name,"#8db88e",p.id);
  if((state.wiring||box)&&state.design){
   for(const d of state.design.devices.filter(d=>d.point)){const parent=state.design.devices.find(p=>p.id===d.parent&&p.point);if(parent&&(state.wiring||box?.id===d.id||box?.id===parent.id)&&!wires.some(c=>[c.from,c.to].includes("d/"+d.id)&&[c.from,c.to].includes("d/"+parent.id)))line([parent.point,d.point],d.model==="rx"?"#bfa8e7":"#83acc3",[2,6]);if(state.labels||d.id===state.sel)tag(d.point,d.name,"#79dccc",d.id)}
   for(const c of wires){if(!c.visible||(c.inferred&&c.id!==state.sel))continue;const pts=cablePoints(c,state.design);if(state.labels||c.id===state.sel)tag(pts[Math.floor(pts.length/2)],c.name,c.color,c.id);
    if(c.id===state.sel&&state.mode==="cableEdit")pts.forEach(p=>dot(p,"#ffce80",5))}
  }
  if(state.draft?.length){line(previewPath,state.routeColor||"#ffe097",[4,3]);state.draft.forEach(p=>dot(p,"#ffe097",4))}
  if((state.play||stage.animated())&&!document.hidden&&document.hasFocus())invalidate()
 }
 function pointerDown(e){down=[e.clientX,e.clientY];drag=-1;
  if(state.mode==="edit"||state.mode==="cableEdit"){const c=state.mode==="cableEdit"&&wires.find(c=>c.id===state.sel);
   const pts=c?cablePoints(c,state.design):state.design.fixtures.find(f=>f.id===state.sel)?.points.map(p=>mountPoint(state.design.fixtures.find(f=>f.id===state.sel),p));const {x,y}=resolveHit(e);
   drag=pts?.findIndex((p,i)=>{if(c&&((!i&&c.from)||(i===pts.length-1&&c.to)))return false;const q=screen(vec(p));return Math.hypot(x-q.x,y-q.y)<17})??-1;if(drag>=0){controls.enabled=false;surface.setPointerCapture(e.pointerId)}}}
 function pointerUp(e){const before=down;down=null;if(!before)return;const hit=resolveHit(e);
  if(drag>=0){const index=drag;drag=-1;controls.enabled=true;if(hit.point)events.move(index,hit.point,hit.normal);return}
  if(Math.hypot(e.clientX-before[0],e.clientY-before[1])>6||e.button!==0)return;
  if(["draw","prop","box","relocate","aim","cable","plant"].includes(state.mode)){if(hit.point)events.place(hit.point,hit.normal);return}
  if(state.mode==="edit"||state.mode==="cableEdit")return;
  const label=labels.find(l=>Math.abs(l.x-hit.x)<l.w/2&&hit.y>=l.y&&hit.y<=l.y+21);
  const point=projection.filter(p=>Math.hypot(p.x-hit.x,p.y-hit.y)<10).sort((a,b)=>a.z-b.z)[0];
  const object=stage.pick(ray);
  if(label)events.pick(label.id);else if(point&&object&&state.design?.plants?.some(p=>p.id===object.id))events.pick(point.id);else if(object&&object.distance<=hit.distance+.08)events.pick(object.id);else if(point)events.pick(point.id)
 }
 surface.addEventListener("pointerdown",pointerDown,true);surface.addEventListener("pointerup",pointerUp);const cancel=()=>{down=null;drag=-1;controls.enabled=true};surface.addEventListener("pointercancel",cancel);
 const visibility=()=>{if(!document.hidden)invalidate()};document.addEventListener("visibilitychange",visibility);window.addEventListener("focus",visibility);
 return {canRoute(row,group){if(!fitted||!state.design)return true;if(group==="fixtures"&&row.shape==="run"&&!row.plant&&row.points.length>1){const n=guideNormal(row.mount);return !fitted.route(row.points,{normals:n?row.points.map(()=>n):row.normals,window:true}).obstructed}if(group==="cables"&&row.attachment!=="free")return !fitted.route(terminals(row,state.design).raw,{radius:row.width/2,normals:row.normals}).obstructed;return true},length(id){const p=cache.get("c/"+id)||cache.get("f/"+id);return p?routeLength(p):null},update(s){const design=placeBodies(s.design),refresh=design!==state.design||s.night!==state.night;const preview=s.draft!==state.draft||refresh;state={...s,design};if(preview){const pts=s.draft||[];previewPath=pts.length>=2&&fitted&&s.routeStyle!=="hanging"?fitted.route(pts,{radius:s.mode==="cable"?.02:0,window:s.mode==="draw"}):routedPoints(pts,s.routeStyle||"corners",s.routeSag)}if(refresh)rebuild();else invalidate()},preset,zoom(f){cam.position.sub(controls.target).multiplyScalar(f).add(controls.target);controls.update();invalidate()},
 dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();stage.dispose();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("focus",visibility);scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose()});gl?.dispose();host.replaceChildren()}}
}

