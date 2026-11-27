import {bindPropGestures} from "./prop-gestures.js";
import {sceneProp,moveProp} from "../lib/prop-transform.js";
import {fitCord} from "../lib/cord-route.js";
import {propertySurface} from "../lib/surface-fit.js";
import {clearWindowTrim,guideNormal} from "../lib/window-mounts.js";
import {depthAtPoints} from "../lib/software-depth.js";
import * as T from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {wirePoints,mounts,mountNames} from "../lib/show";
import {stageRenderer} from "./stage-renderer";
import {plantMesh} from "./plant-mesh.js";
import {routeLength,sceneCables,beamDirection,floodScale,lampOrigin,cablePoints,routedPoints} from "../lib/stage";
import {shapePath,measure,along,nearestOnPath,simplify,describe,lightCount,wallYaw,dragTools,toolDefaults} from "../lib/draw-tools.js";

const vec=p=>new T.Vector3(...p);
const views={"Street trees":[[-6.7,3.4,23],[-6.6,2.4,8.5]],Street:[[12.4,6.8,22.1],[0,2,-2.4]],Front:[[0,3.6,24],[0,2.5,-1]],Driveway:[[23,5.1,5.5],[2,1,-4]],"Back stairs":[[7.25,1.48,-8.68],[.94,.98,-9.42]],Pool:[[13.5,10,-29.5],[0,1,-10]],"Rear elevation":[[.7,2.3,-33],[.4,2.05,-9.8]],Overhead:[[0,35,-3],[0,0,-3]]};
export const viewNames=Object.keys(views);
const onBuilding=f=>f?.shape==="run"&&!f.plant;
const mountPoint=(f,p)=>onBuilding(f)?clearWindowTrim(p):p;
function samples(f,path){
 const pts=path.map(vec);if(pts.length<=1)return pts;
 if(f.shape==="flood")return [vec(lampOrigin(f)).addScaledVector(vec(beamDirection(f)),.09*floodScale(f))];
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
 const strandFits=new WeakMap(),cordFits=new Map();
 function placeBodies(design){if(!fitted||!design)return design;if(lastInput===design)return posed;lastInput=design;
  const devices=design.devices.map(d=>{if(!d.point)return d;const normal=d.normal||fitted.support(d.point);if(!normal)return d;
   const scale=d.scale??1,wall=Math.abs(normal[1])<.55;
   return {...d,normal,point:fitted.footprint(d.point,normal,.41*scale,(wall?.38:.3)*scale,wall?.29*scale:0,d.rotation)}});
  const fixtures=design.fixtures.map(f=>{if(f.shape==="run"||!f.points.length||f.plant)return f;
   const normal=f.normal||fitted.support(f.points[0]);if(!normal)return f;const points=f.shape==="flood"?[fitted.footprint(f.points[0],normal,.22*floodScale(f),.22*floodScale(f),0,f.rotation)]:f.points;
   return {...f,normal,points}});
  posed={...design,devices,fixtures};return posed;
 }
 function cached(key,design,build){if(design!==cacheDesign){cacheDesign=design;cache.clear()}if(!cache.has(key))cache.set(key,build());return cache.get(key)}
 function fixturePath(f){return cached("f/"+f.id,state.design,()=>{
  const raw=wirePoints(f);if(!fitted||f.plant||!raw.length)return raw;
  if(f.shape==="run"){
   let path=strandFits.get(f);
   if(!path){const normal=guideNormal(f.mount);path=fitted.route(raw,{normals:normal?raw.map(()=>normal):f.normals,window:true});strandFits.set(f,path)}
   if(path.obstructed){blockedRoutes.add(f.name);return []}return path
  }
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
  if(!fitted||c.attachment==="free")return routedPoints(raw,c.style,c.sag);
  const key=JSON.stringify([raw,targetNormal,c.style,c.sag,c.width,c.normals,c.inferred]);
  let entry=cordFits.get(c.id);
  if(entry?.key!==key){entry={key,path:fitWire(c,raw,targetNormal)};cordFits.set(c.id,entry)}
  if(entry.path.obstructed){if(!c.inferred)blockedRoutes.add(c.name);return []}
  return entry.path;
 })}
 function fitWire(c,raw,targetNormal){
  const path=fitCord(fitted,raw,c,targetNormal);if(path.obstructed)return path;
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
 }
 const stage=stageRenderer(scene,cordPath);
 function screen(p){const v=p.clone().project(cam);return {x:(v.x+1)*w/2,y:(1-v.y)*h/2,z:v.z}}
 let ghost=null,ghostPlant=null,ghostRoot=null;
 function clearPlantPreview(){
  if(ghost){scene.remove(ghost);for(const m of ghost.children){m.geometry.dispose();m.material.dispose()}}
  ghost=null;ghostPlant=null;ghostRoot=null;invalidate();
 }
 function propertyHit(ev,offset={x:0,y:0}){
  const rect=surface.getBoundingClientRect();
  if(!rect.width||!rect.height||!host.contains(document.elementFromPoint(ev.clientX,ev.clientY)))return null;
  const x=(ev.clientX-rect.left+offset.x)/rect.width,y=(ev.clientY-rect.top+offset.y)/rect.height;
  if(x<0||x>1||y<0||y>1)return null;
  cam.updateMatrixWorld();
  ray.setFromCamera({x:2*x-1,y:1-2*y},cam);
  return ray.intersectObjects(pickMeshes,false).find(h=>h.object.userData.placement_surface!==false);
 }
 function isLawn(hit){return hit&&(hit.object.material?.name==="Lawn"||/^graded[ _]lawn$/i.test(hit.object.name))}
 function lawnAt(ev){const hit=propertyHit(ev);return isLawn(hit)?hit.point.toArray():null}
 function previewPlant(plant,ev){
  if(ghostPlant?.id!==plant.id){clearPlantPreview();ghostPlant=plant}
  if(!gl&&!plantImages.has(plant.kind)){
   const image=new Image();image.onload=invalidate;image.src="/plants/"+plant.kind+".webp";plantImages.set(plant.kind,image);
  }
  ghostRoot=lawnAt(ev);
  if(gl&&ghostRoot&&!ghost){
   ghost=plantMesh(plant);
   for(const m of ghost.children){m.material.transparent=true;m.material.opacity=.76;m.material.depthWrite=false}
   scene.add(ghost);
  }
  if(ghost){ghost.visible=!!ghostRoot;if(ghostRoot)ghost.position.fromArray(ghostRoot)}
  invalidate();return ghostRoot;
 }
 function resolveHit(ev){
  const rect=surface.getBoundingClientRect(),x=ev.clientX-rect.left,y=ev.clientY-rect.top;
  ray.setFromCamera({x:2*x/w-1,y:1-2*y/h},cam);
  const hit=ray.intersectObjects(state.mode==="plant"?pickMeshes:[...pickMeshes,...stage.surfaces()],false).find(v=>v.object.userData.placement_surface!==false);
  let normal=null,point=hit?.point.clone();if(point&&hit.face){const norm=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(norm.dot(ray.ray.direction)>0)norm.negate();normal=norm.toArray();point.addScaledVector(norm,.045)}
  return {x,y,normal,point:point&&["draw","edit"].includes(state.mode)?clearWindowTrim(point.toArray()):point?.toArray(),distance:hit?.distance??Infinity,surfaceName:hit?.object.name}
 }
 function invalidate(){if(!raf&&!disposed)raf=requestAnimationFrame(draw)}
 // Camera moves swing around the target so a change of view orbits the house instead of cutting through it.
 let tween=null;const still=typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
 function fly(position,target,ms=720){
  if(!gl||still||ms<=0){tween=null;cam.position.copy(position);controls.target.copy(target);controls.update();invalidate();return}
  const a=new T.Spherical().setFromVector3(cam.position.clone().sub(controls.target)),b=new T.Spherical().setFromVector3(position.clone().sub(target));
  const turn=((b.theta-a.theta+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  tween={a,b,turn,from:controls.target.clone(),to:target.clone(),start:performance.now(),ms};invalidate()
 }
 function stepTween(now){
  const k=Math.min(1,Math.max(0,(now-tween.start)/tween.ms)),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2,{a,b}=tween,mix=(x,y)=>x+(y-x)*e;
  controls.target.lerpVectors(tween.from,tween.to,e);
  cam.position.setFromSpherical(new T.Spherical(mix(a.radius,b.radius),mix(a.phi,b.phi),a.theta+tween.turn*e)).add(controls.target);
  if(k>=1)tween=null;controls.update()
 }
 function preset(name,instant=false){
  const [p,t]=views[name]||views.Street;const target=vec(t);fly(vec(p).sub(target).multiplyScalar(Math.max(1,1.12/(w/h))).add(target),target,instant?0:720)
 }
 function focus(point){const target=vec(point),offset=cam.position.clone().sub(controls.target);offset.setLength(Math.min(Math.max(offset.length(),4),13));fly(target.clone().add(offset),target,560)}
 function resize(){w=Math.max(1,host.clientWidth);h=Math.max(1,host.clientHeight);cam.aspect=w/h;cam.updateProjectionMatrix();gl?.setSize(w,h,false);
  for(const c of [overlay,cpuCanvas].filter(Boolean)){c.width=w;c.height=h}invalidate()}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();preset("Street",true);controls.addEventListener("change",invalidate);controls.addEventListener("start",()=>{tween=null});
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
  const wireIds=new Set(wires.map(c=>c.id));for(const id of cordFits.keys())if(!wireIds.has(id))cordFits.delete(id);
  buildSnaps();
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
  raf=0;if(disposed)return;if(!tween&&(state.play||stage.animated())&&now-last<(gl?50:130)&&document.hasFocus()){invalidate();return}last=now;if(tween)stepTween(now);
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
   stage.software(faces,screen,state.night);
   const key=[...cam.matrixWorld.elements,w,h,state.sel,state.wiring].join(",");
   if(!depthCache||key!==depthKey){depthKey=key;depthCache=depthAtPoints(faces,w,h)}
   faces.sort((a,b)=>b.z-a.z);for(const f of faces){ctx.globalAlpha=f.alpha??1;if(f.a){ctx.fillStyle=f.fill;ctx.beginPath();ctx.moveTo(f.a.x,f.a.y);ctx.lineTo(f.b.x,f.b.y);ctx.lineTo(f.c.x,f.c.y);ctx.closePath();ctx.fill()}}ctx.globalAlpha=1;
   for(const p of [...projection,...faces.filter(f=>!f.a)]){if(!depthCache(p)||p.c==="#000000")continue;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill()}
  }
  function line(points,color,dash=[]){if(!points.length)return;ink.strokeStyle=color;ink.lineWidth=1.6;ink.setLineDash(dash);ink.beginPath();points.forEach((p,i)=>{const v=screen(vec(p));if(i)ink.lineTo(v.x,v.y);else ink.moveTo(v.x,v.y)});ink.stroke();ink.setLineDash([])}
  function dot(p,color,r){const v=screen(vec(p));ink.beginPath();ink.fillStyle=color;ink.arc(v.x,v.y,r,0,Math.PI*2);ink.fill()}
  const selectedProp=state.mode==="select"&&sceneProp(state.design,state.sel);
  if(selectedProp&&!selectedProp.row.locked){
   const base=screen(vec(selectedProp.point));
   if(base.z>=-1&&base.z<=1){ink.beginPath();ink.arc(base.x,base.y,6,0,Math.PI*2);ink.fillStyle="#13202c";ink.fill();ink.strokeStyle="#ffe097";ink.lineWidth=2;ink.stroke()}
  }
  if(ghostRoot){
   const [x,y,z]=ghostRoot,r=ghostPlant.width*.5;
   line(Array.from({length:41},(_,i)=>[x+r*Math.sin(i*Math.PI/20),y+.025,z+r*Math.cos(i*Math.PI/20)]),"#c6e4a1",[4,3]);
   if(!gl){const foot=screen(vec(ghostRoot)),top=screen(vec([x,y+ghostPlant.height,z]));
    const img=plantImages.get(ghostPlant.kind);
    if(img?.naturalWidth){const height=Math.max(4,foot.y-top.y);ink.globalAlpha=.8;ink.drawImage(img,foot.x-height*.76,top.y-height*.08,height*1.52,height*1.15);ink.globalAlpha=1}
    else line([ghostRoot,[x,y+ghostPlant.height,z]],"#c6e4a1");
   }
  }
  labels=[];
  function tag(p,text,color,id){const s=screen(vec(p));if(s.z>1||s.z< -1)return;ink.font="600 12px Figtree, system-ui, sans-serif";const tw=ink.measureText(text).width+20;let y=s.y-30;for(let n=0;n<4&&labels.some(l=>Math.abs(l.y-y)<21&&Math.abs(l.x-s.x)<(tw+l.w)/2);n++)y-=22;const x=s.x-tw/2;ink.fillStyle="#0a101dee";ink.beginPath();ink.roundRect(x,y,tw,21,6);ink.fill();ink.strokeStyle="#ffffff2e";ink.lineWidth=1;ink.stroke();ink.fillStyle=color;ink.beginPath();ink.roundRect(x+4,y+5,2.5,11,1.2);ink.fill();ink.fillStyle="#f5f0e6";ink.fillText(text,x+10,y+14.5);labels.push({x:s.x,y,w:tw,id})}
  for(const r of runs){if(r.pts.length&&(state.labels||r.f.id===state.sel||r.f.id===state.hover))tag(r.pts[Math.floor(r.pts.length/2)].toArray(),r.f.name,r.f.color,r.f.id);
   if(state.mode==="edit"&&r.f.id===state.sel){const anchors=r.f.points.map(p=>mountPoint(r.f,p));line(anchors,"#ffce80");anchors.forEach(p=>dot(p,"#ffce80",5))}}
  const box=state.design?.devices.find(d=>d.id===state.sel&&d.point);
  if(box){const s=screen(vec(box.point));events.anchor(s.x,s.y,s.z);const el=host.parentElement.querySelector(".boxPopover");if(el&&s.z<1){const x=s.x<el.offsetLeft?el.offsetLeft:s.x>el.offsetLeft+el.offsetWidth?el.offsetLeft+el.offsetWidth:Math.max(el.offsetLeft,Math.min(s.x,el.offsetLeft+el.offsetWidth));const y=Math.max(el.offsetTop+8,Math.min(s.y,el.offsetTop+el.offsetHeight-8));ink.strokeStyle="#b3ebc8";ink.lineWidth=1.4;ink.beginPath();ink.moveTo(s.x,s.y);ink.lineTo(x,y);ink.stroke();dot(box.point,"#b3ebc8",3)}for(const f of state.design.fixtures.filter(f=>f.device===box.id&&f.points.length&&f.visible)){
    const end=f.points[0],c=wires.find(c=>[c.from,c.to].includes("d/"+box.id)&&[c.from,c.to].includes("f/"+f.id));
    if(c?.visible&&!stage.animated())dot(cablePoints(c,state.design)[0],c.color,3);

    dot(end,f.color,5);if(!state.labels)tag(end,"Ch "+f.port+" · "+f.name,f.color,f.id);
   }}
  for(const p of state.design?.plants||[])if(p.visible&&(p.id===state.sel||p.id===state.hover||state.labels))tag([p.point[0],p.point[1]+p.height*.7,p.point[2]],p.name,"#8db88e",p.id);
  const hovered=!(state.wiring||box)&&state.design?.devices.find(d=>d.id===state.hover&&d.point);if(hovered)tag(hovered.point,hovered.name,"#79dccc",hovered.id);
  if((state.wiring||box)&&state.design){
   for(const d of state.design.devices.filter(d=>d.point)){const parent=state.design.devices.find(p=>p.id===d.parent&&p.point);if(parent&&(state.wiring||box?.id===d.id||box?.id===parent.id)&&!wires.some(c=>[c.from,c.to].includes("d/"+d.id)&&[c.from,c.to].includes("d/"+parent.id)))line([parent.point,d.point],d.model==="rx"?"#bfa8e7":"#83acc3",[2,6]);if(state.labels||d.id===state.sel||d.id===state.hover)tag(d.point,d.name,"#79dccc",d.id)}
   for(const c of wires){if(!c.visible||(c.inferred&&c.id!==state.sel))continue;const pts=cablePoints(c,state.design);if(state.labels||c.id===state.sel||c.id===state.hover)tag(pts[Math.floor(pts.length/2)],c.name,c.color,c.id);
    if(c.id===state.sel&&state.mode==="cableEdit")pts.forEach(p=>dot(p,"#ffce80",5))}
  }
  if(state.draft?.length){line(previewPath,state.routeColor||state.ghost?.color||"#ffe097",[4,3]);state.draft.forEach(p=>dot(p,"#ffe097",4))}
  paintTools();
  if(tween||((state.play||stage.animated())&&!document.hidden&&document.hasFocus()))invalidate()
 }
 // ---- Placement tools: hover cursor, snapping, live previews and drag-to-draw.
 let cursor=null,anchor=null,stroke=null,dragDraw=null,shapePreview=null,feature=null,dragHit=null,inserting=false,snapSets={vertices:[],lines:[]},lastMove=null,moveRaf=0;
 const placing=()=>["draw","prop","box","plant","aim","cable"].includes(state.mode);
 const camRight=()=>new T.Vector3().setFromMatrixColumn(cam.matrixWorld,0).toArray();
 const toolOptions=shift=>({...toolDefaults,...state.toolOpts,square:shift,right:camRight()});
 function buildSnaps(){
  const vertices=[],lines=[];
  for(const [key,pts] of Object.entries(mounts)){const normal=guideNormal(key);lines.push({key,pts,normal});for(const p of pts)vertices.push({p,normal})}
  for(const f of state.design?.fixtures||[])if(f.shape==="run"&&f.visible&&!f.plant&&!f.mount&&f.points.length>1){lines.push({pts:f.points});f.points.forEach((p,i)=>vertices.push({p,normal:f.normals?.[i]}))}
  snapSets={vertices,lines};
 }
 function editTarget(){const c=state.mode==="cableEdit"&&wires.find(c=>c.id===state.sel),f=!c&&state.design?.fixtures.find(f=>f.id===state.sel);
  return {c,f,pts:c?cablePoints(c,state.design):f?.points.map(p=>mountPoint(f,p)),insertable:!!c||f?.shape==="run"}}
 // Pull the cursor onto a nearby corner or edge of the house or of another strand.
 function snapped(hit,off){
  if(!hit.point||off||state.toolOpts?.snap===false||!["path","line","rect","circle","arc","swag"].includes(state.tool))return {...hit,kind:null};
  const p=vec(hit.point);let best=null;
  const first=state.tool==="path"&&state.draft?.length>2?[{p:state.draft[0],close:true}]:[];
  for(const c of [...first,...snapSets.vertices]){const q=vec(c.p);if(q.distanceTo(p)>.6)continue;const s=screen(q),d=Math.hypot(s.x-hit.x,s.y-hit.y);
   if(d<13&&(!best||d<best.d))best={d,point:[...c.p],normal:c.normal||hit.normal,kind:c.close?"close":"vertex"}}
  if(best)return {...hit,...best};
  for(const l of snapSets.lines){const near=nearestOnPath(hit.point,l.pts);if(near.distance<.11&&(!best||near.distance<best.d))best={d:near.distance,point:near.point,normal:l.normal||hit.normal,kind:"edge"}}
  return best?{...hit,...best}:{...hit,kind:null};
 }
 // Hold a segment level or plumb when the cursor is nearly there, or always with Shift.
 function aligned(prev,t,force){
  if(!prev||!t.point||(t.kind&&!force))return t;
  const {du,dv,basis}=measure(prev,t.point,t.normal||[0,0,1],camRight()),tolerance=force?Infinity:Math.max(.035,cam.position.distanceTo(vec(t.point))*.006);
  const shift=(axis,amount)=>t.point.map((v,i)=>v-axis[i]*amount);
  if(Math.abs(dv)<tolerance&&Math.abs(dv)<=Math.abs(du))return {...t,point:shift(basis.v,dv),kind:"level"};
  if(Math.abs(du)<tolerance)return {...t,point:shift(basis.u,du),kind:"plumb"};
  return t;
 }
 function aim(e){
  const raw=resolveHit(e);if(state.mode!=="draw")return {...raw,kind:null,raw:raw.point};
  let t=snapped(raw,e.altKey);const from=state.tool==="path"?state.draft?.at(-1):state.tool==="line"?(anchor||dragDraw?.start)?.point:null;
  if(from&&(e.shiftKey||(!e.altKey&&state.toolOpts?.snap!==false)))t=aligned(from,t,e.shiftKey);return {...t,raw:raw.point};
 }
 function refreshPreview(){
  shapePreview=null;feature=null;if(state.mode!=="draw"||!cursor?.point)return;const tool=state.tool;
  if(tool==="feature"){for(const l of snapSets.lines){if(!l.key)continue;const near=nearestOnPath(cursor.raw||cursor.point,l.pts);if(near.distance<.75&&(!feature||near.distance<feature.distance))feature={...near,key:l.key}}return}
  if(tool==="free"){if(stroke)shapePreview={points:stroke.points};return}
  if(tool==="path"){const last=state.draft?.at(-1);if(last)shapePreview={points:[last,cursor.point],band:true};return}
  const a=anchor||dragDraw?.start;if(a?.point)shapePreview={points:shapePath(tool,a.point,cursor.point,a.normal||cursor.normal||[0,0,1],toolOptions(cursor.shift)),from:a};
 }
 function commitShape(a,b,shift){
  const tool=state.tool,points=shapePath(tool,a.point,b.point,a.normal||b.normal||[0,0,1],toolOptions(shift));anchor=null;shapePreview=null;
  if(points.length>1&&routeLength(points)>.05)events.shape({points,normals:tool==="line"?[a.normal||null,b.normal||null]:points.map(()=>a.normal||null)});
  invalidate();
 }
 function hover(e){
  if(drag>=0){const raw=resolveHit(e);dragHit=raw.point?raw:null;invalidate();return}
  if(!placing()){if(cursor){cursor=null;invalidate()}return}
  const t=aim(e);cursor={...t,shift:e.shiftKey};
  if(dragDraw&&down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)dragDraw.moved=true;
  if(stroke&&t.point&&stroke.points.length<1500&&vec(stroke.points.at(-1)).distanceTo(vec(t.point))>.03){stroke.points.push(t.point);stroke.normals.push(t.normal||null)}
  refreshPreview();invalidate();
 }
 function paintTools(){
  const path=(points,color,width=1.6,dash=[])=>{if(points.length<2)return;ink.strokeStyle=color;ink.lineWidth=width;ink.lineJoin="round";ink.setLineDash(dash);ink.beginPath();points.forEach((p,i)=>{const v=screen(vec(p));if(i)ink.lineTo(v.x,v.y);else ink.moveTo(v.x,v.y)});ink.stroke();ink.setLineDash([])};
  const disc=(p,color,r)=>{const v=screen(vec(p));ink.beginPath();ink.fillStyle=color;ink.arc(v.x,v.y,r,0,Math.PI*2);ink.fill()};
  const ring=(p,r,color,width=1.5)=>{const v=screen(vec(p));ink.beginPath();ink.strokeStyle=color;ink.lineWidth=width;ink.arc(v.x,v.y,r,0,Math.PI*2);ink.stroke()};
  const note=(x,y,text)=>{ink.font="600 12px Figtree, system-ui, sans-serif";const tw=ink.measureText(text).width+16,left=Math.max(6,Math.min(w-tw-6,x+16)),top=Math.max(6,Math.min(h-28,y+18));
   ink.fillStyle="#0a101df2";ink.beginPath();ink.roundRect(left,top,tw,22,6);ink.fill();ink.strokeStyle="#ffffff38";ink.lineWidth=1;ink.stroke();ink.fillStyle="#f5f0e6";ink.fillText(text,left+8,top+15)};
  const ghost=state.ghost||{},color=ghost.color||state.routeColor||"#ffe097",feet=m=>(m/.3048).toFixed(1)+" ft";
  const glow=v=>{ink.globalAlpha=.28;ink.beginPath();ink.arc(v.x,v.y,5,0,Math.PI*2);ink.fill();ink.globalAlpha=1;ink.beginPath();ink.arc(v.x,v.y,2,0,Math.PI*2);ink.fill()};
  const lamps=(points,count)=>{ink.fillStyle=color;for(const q of along(points,Math.min(240,Math.max(2,count||2))))glow(screen(vec(q)))};
  const lampsFor=points=>ghost.spacing?lightCount(routeLength(points),ghost.spacing):ghost.count;
  if(state.mode==="edit"||state.mode==="cableEdit"){const {pts,insertable}=editTarget();if(pts){
   if(insertable&&pts.length<160&&drag<0)for(let i=1;i<pts.length;i++)ring(pts[i].map((v,k)=>(v+pts[i-1][k])/2),3.5,"#ffce80");
   if(drag>=0&&dragHit){path([inserting?pts[drag]:pts[drag-1],dragHit.point,pts[drag+1]].filter(Boolean),"#ffffff",1.6,[5,4]);disc(dragHit.point,"#ffffff",5)}}}
  if(!placing()||!cursor?.point)return;
  const p=cursor.point,s=screen(vec(p));
  if(state.mode==="draw"){
   if(state.tool==="feature"){
    if(feature){const pts=mounts[feature.key];path(pts,"#000000aa",6);path(pts,color,2.5);lamps(pts,lampsFor(pts));note(s.x,s.y,(mountNames[feature.key]||"House feature")+" · "+feet(routeLength(pts)))}
    else note(s.x,s.y,"Move over a roofline, window or rail");
   }else{
    const shape=shapePreview?.points||[],from=shapePreview?.from,trail=state.tool==="path"&&state.draft?.length?[...(previewPath.length?previewPath:state.draft),p]:shape;
    if(shape.length>1){path(shape,"#000000aa",4.5);path(shape,color,2,shapePreview.band?[6,4]:[])}
    if(trail.length>1)lamps(trail,lampsFor(trail));
    if(from?.point)disc(from.point,"#ffffff",4);
    if(cursor.kind==="vertex"||cursor.kind==="edge"){ink.strokeStyle="#ffc46b";ink.lineWidth=2;ink.strokeRect(s.x-6,s.y-6,12,12)}
    if(cursor.kind==="close")ring(p,9,"#74e3ab",2.5);
    let text="";
    if(state.tool==="path"&&state.draft?.length){const last=state.draft.at(-1);text=feet(vec(last).distanceTo(vec(p)))+(state.draft.length>1?" · "+feet(routeLength(trail))+" total":"")}
    else if(shape.length>1)text=describe(state.tool,shape,from?.point,p,from?.normal||cursor.normal||[0,0,1],camRight());
    if(text){const n=lampsFor(trail);if(n)text+=" · "+n+" lights";const hint={level:"level",plumb:"plumb",vertex:"corner",edge:"edge",close:"close loop"}[cursor.kind];if(hint)text+=" · "+hint;note(s.x,s.y,text)}
   }
  }else if(state.mode==="prop"&&ghost.shape&&ghost.shape!=="flood"){
   const yaw=ghost.autoYaw?wallYaw(cursor.normal)??(ghost.yaw||0):ghost.yaw||0,row={...ghost,points:[p],normal:cursor.normal,yaw,count:Math.min(ghost.count||1,160)};
   ink.fillStyle=color;for(const q of samples(row,wirePoints(row)))glow(screen(q));
   note(s.x,s.y,feet(ghost.size)+" tall");
  }
  ring(p,7,"#ffffffcc");disc(p,color,2.5);
 }
 function pointerDown(e){down=[e.clientX,e.clientY];drag=-1;inserting=false;dragHit=null;
  if(state.mode==="edit"||state.mode==="cableEdit"){const {c,pts,insertable}=editTarget(),{x,y}=resolveHit(e);
   const over=(p,r)=>{const q=screen(vec(p));return Math.hypot(x-q.x,y-q.y)<r};
   drag=pts?.findIndex((p,i)=>!(c&&((!i&&c.from)||(i===pts.length-1&&c.to)))&&over(p,17))??-1;
   if(drag<0&&insertable&&pts&&pts.length<160){drag=pts.findIndex((p,i)=>i<pts.length-1&&over(p.map((v,k)=>(v+pts[i+1][k])/2),11));inserting=drag>=0}
   if(drag>=0){controls.enabled=false;surface.setPointerCapture(e.pointerId)}return}
  if(state.mode==="draw"&&dragTools.includes(state.tool)&&e.button===0&&!anchor){const start=aim(e);
   if(start.point){dragDraw={start,moved:false};controls.enabled=false;surface.setPointerCapture(e.pointerId);if(state.tool==="free")stroke={points:[start.point],normals:[start.normal||null]}}}
 }
 function pointerUp(e){const before=down;down=null;if(!before)return;const hit=resolveHit(e),moved=Math.hypot(e.clientX-before[0],e.clientY-before[1]);
  if(drag>=0){const index=drag,insert=inserting;drag=-1;inserting=false;dragHit=null;controls.enabled=true;
   if(hit.point&&(moved>3||insert)){if(insert)events.insert(index+1,hit.point,hit.normal);else events.move(index,hit.point,hit.normal)}invalidate();return}
  if(dragDraw){const start=dragDraw.start;dragDraw=null;controls.enabled=true;
   if(state.tool==="free"){const s=stroke,end=aim(e);stroke=null;shapePreview=null;invalidate();if(s&&end.point){s.points.push(end.point);s.normals.push(end.normal||null)}if(s&&s.points.length>=2&&routeLength(s.points)>.1){const keep=simplify(s.points);events.shape({points:keep.map(i=>s.points[i]),normals:keep.map(i=>s.normals[i])})}return}
   if(moved>6){const end=aim(e);if(end.point)commitShape(start,end,e.shiftKey);else{shapePreview=null;invalidate()}return}}
  if(moved>6||e.button!==0)return;
  if(state.mode==="draw"){const t=aim(e),tool=state.tool;
   if(tool==="feature"){cursor=t;refreshPreview();if(feature)events.shape({mount:feature.key,points:mounts[feature.key]});return}
   if(!t.point||tool==="free")return;
   if(tool==="path"){events.place(t.point,t.normal,{close:t.kind==="close"});return}
   if(anchor)commitShape(anchor,t,e.shiftKey);else{anchor=t;refreshPreview();invalidate()}return}
  if(state.mode==="plant"){const point=lawnAt(e);if(point)events.place(point,[0,1,0],{shift:e.shiftKey});return}
  if(["prop","box","relocate","aim","cable"].includes(state.mode)){if(hit.point)events.place(hit.point,hit.normal,{shift:e.shiftKey});return}
  if(state.mode==="edit"||state.mode==="cableEdit")return;
  const id=pickedId(hit);if(id)events.pick(id);
 }
 function pickedId(hit){
  const selected=sceneProp(state.design,state.sel);
  if(selected){const base=screen(vec(selected.point));if(Math.hypot(hit.x-base.x,hit.y-base.y)<11)return selected.row.id}
  const label=labels.find(l=>Math.abs(l.x-hit.x)<l.w/2&&hit.y>=l.y&&hit.y<=l.y+21);
  if(label)return label.id;
  const point=projection.filter(p=>Math.hypot(p.x-hit.x,p.y-hit.y)<10&&p.z>=-1&&p.z<=1).sort((a,b)=>a.z-b.z)[0];
  const object=stage.pick(ray);
  if(point&&object&&state.design?.plants?.some(p=>p.id===object.id))return point.id;
  if(object&&object.distance<=hit.distance+.08)return object.id;
  return point?.id;
 }
 const gestures=bindPropGestures(surface,host.parentElement,{
  selected:()=>state.mode==="select"?sceneProp(state.savedDesign,state.sel):null,
  grab(ev){
   if(!model||state.mode!=="select")return null;
   const hit=resolveHit(ev),id=pickedId(hit),prop=sceneProp(state.savedDesign,id);
   if(!prop||prop.row.locked)return null;
   const shown=sceneProp(state.design,id),base=screen(vec(shown.point));
   tween=null;return {prop,offset:{x:base.x-hit.x,y:base.y-hit.y}};
  },
  select:id=>events.pick(id),
  place({prop,offset},ev){
   if(state.mode!=="select"||sceneProp(state.savedDesign,prop.row.id)?.row!==prop.row)return null;
   const hit=propertyHit(ev,offset);if(!hit)return null;
   if(prop.group==="plants")return isLawn(hit)?moveProp(prop,hit.point.toArray()):null;
   const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
   if(normal.dot(ray.ray.direction)>0)normal.negate();
   return moveProp(prop,hit.point.clone().addScaledVector(normal,.045).toArray(),normal.toArray());
  },
  preview:target=>events.propPreview(target),
  commit:(prop,row)=>events.propDrop(prop,row),
  scale:(prop,factor)=>events.propTransform(prop,"scale",factor),
  rotate:(prop,degrees)=>events.propTransform(prop,"rotate",degrees)
 });
 function doubleClick(e){
  if(state.mode==="draw"&&state.tool==="path"){events.finish();return}
  if(state.mode!=="edit"&&state.mode!=="cableEdit")return;
  const {c,pts}=editTarget(),{x,y}=resolveHit(e);if(!pts||pts.length<3)return;
  const index=pts.findIndex((p,i)=>{if(c&&((!i&&c.from)||(i===pts.length-1&&c.to)))return false;const q=screen(vec(p));return Math.hypot(x-q.x,y-q.y)<17});
  if(index>=0)events.removePoint(index);
 }
 const plantImages=new Map();
 const pointerMove=e=>{lastMove=e;if(!moveRaf)moveRaf=requestAnimationFrame(()=>{moveRaf=0;if(disposed||!lastMove)return;
  if(state.mode==="plant"){if(state.ghost&&!down&&lastMove.pointerType!=="touch")previewPlant(state.ghost,lastMove)}else hover(lastMove)})};
 const pointerLeave=()=>{lastMove=null;if(state.mode==="plant")clearPlantPreview();if(cursor&&!dragDraw){cursor=null;shapePreview=null;feature=null;invalidate()}};
 const cancel=()=>{down=null;drag=-1;dragDraw=null;stroke=null;dragHit=null;controls.enabled=true;invalidate()};
 surface.addEventListener("pointerdown",pointerDown,true);surface.addEventListener("pointerup",pointerUp);surface.addEventListener("pointermove",pointerMove);surface.addEventListener("pointerleave",pointerLeave);surface.addEventListener("dblclick",doubleClick);surface.addEventListener("pointercancel",cancel);
 const visibility=()=>{if(!document.hidden)invalidate()};document.addEventListener("visibilitychange",visibility);window.addEventListener("focus",visibility);
 return {previewPlant,clearPlantPreview,lawnAt,canRoute(row,group){if(!fitted||!state.design)return true;if(group==="fixtures"&&row.shape==="run"&&!row.plant&&row.points.length>1){const n=guideNormal(row.mount);return !fitted.route(row.points,{normals:n?row.points.map(()=>n):row.normals,window:true}).obstructed}if(group==="cables"&&row.attachment!=="free")return !fitted.route(terminals(row,state.design).raw,{radius:row.width/2,normals:row.normals}).obstructed;return true},length(id){const p=cache.get("c/"+id)||cache.get("f/"+id);return p?routeLength(p):null},update(s){if(state.mode==="plant"&&s.mode!=="plant")clearPlantPreview();const design=placeBodies(s.design),refresh=design!==state.design||s.night!==state.night;const preview=s.draft!==state.draft||refresh;
  // A new tool starts clean; while a drag tool is active the right button orbits instead of panning.
  if(s.mode!==state.mode||s.tool!==state.tool){anchor=null;stroke=null;dragDraw=null;shapePreview=null;feature=null;controls.enabled=true;controls.mouseButtons.RIGHT=s.mode==="draw"&&dragTools.includes(s.tool)?T.MOUSE.ROTATE:T.MOUSE.PAN}
  state={...s,design};refreshPreview();if(preview){const pts=s.draft||[];previewPath=pts.length>=2&&fitted&&s.routeStyle!=="hanging"?fitted.route(pts,{radius:s.mode==="cable"?.02:0,window:s.mode==="draw"}):routedPoints(pts,s.routeStyle||"corners",s.routeSag)}if(refresh)rebuild();else invalidate()},preset,focus,zoom(f){const offset=cam.position.clone().sub(controls.target);offset.setLength(Math.min(controls.maxDistance,Math.max(controls.minDistance,offset.length()*f)));fly(controls.target.clone().add(offset),controls.target.clone(),220)},
 dispose(){disposed=true;gestures();cancelAnimationFrame(raf);cancelAnimationFrame(moveRaf);observer.disconnect();controls.dispose();stage.dispose();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("focus",visibility);scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose()});gl?.dispose();host.replaceChildren()}}
}

