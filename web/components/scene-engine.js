import {bindPropGestures} from "./prop-gestures.js";
import {sceneProp,moveProp} from "../lib/prop-transform.js";
import {createRouteGeometry} from "../lib/route-geometry.js";
import {editRoutePoint} from "../lib/route-edit.js";
import {propertySurface} from "../lib/surface-fit.js";
import {clearWindowTrim,guideNormal} from "../lib/window-mounts.js";
import {depthAtPoints} from "../lib/software-depth.js";
import {lineHandles} from "../lib/line-handles.js";
import {findRow,rowAnchor,translateRow} from "../lib/selection.js";
import * as T from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {TransformControls} from "three/addons/controls/TransformControls.js";
import {wirePoints,mounts,mountNames} from "../lib/show";
import {stageRenderer} from "./stage-renderer";
import {LIGHT_LAYER} from "./flood-projector.js";
import {plantMesh} from "./plant-mesh.js";
import {routeLength,beamDirection,floodScale,lampOrigin,cablePoints,routedPoints,connected,measuredLength} from "../lib/stage";
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
 let gl;try{gl=new T.WebGLRenderer({canvas,antialias:true,alpha:true,stencil:true,powerPreference:"low-power"});gl.setPixelRatio(Math.min(devicePixelRatio,1.65));gl.setClearColor(0,0)}catch{}
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
 let fitted=null, routes=createRouteGeometry(null), previewPath=[];
 function visibleRoute(row,path){
  if(!path.obstructed)return path;
  if(!row.inferred)blockedRoutes.add(row.name);
  return [];
 }
 const fixturePath=f=>visibleRoute(f,routes.fixture(f));
 const cordPath=(c,design)=>visibleRoute(c,routes.cable(c,design));
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
 function invalidate(){if(!raf&&!disposed&&state.active!==false)raf=requestAnimationFrame(draw)}
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
 function resize(){if(!host.clientWidth||!host.clientHeight)return;w=Math.max(1,host.clientWidth);h=Math.max(1,host.clientHeight);cam.aspect=w/h;cam.updateProjectionMatrix();gl?.setSize(w,h,false);
  for(const c of [overlay,cpuCanvas].filter(Boolean)){c.width=w;c.height=h}invalidate()}
 const observer=new ResizeObserver(resize);observer.observe(host);resize();preset("Street",true);controls.addEventListener("change",invalidate);controls.addEventListener("start",()=>{tween=null});
 new GLTFLoader().load("/property.glb?rev=rear-room-slider-4",asset=>{
  if(disposed){asset.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});return}
  model=asset.scene;base.add(model);model.updateMatrixWorld(true);
  model.traverse(obj=>{if(!obj.isMesh)return;for(let a=obj;a;a=a.parent){if(/Evergreens.and.foundation.shrubs/i.test(a.name)){obj.visible=false;return}}pickMeshes.push(obj);obj.layers.enable(LIGHT_LAYER);
   if(!ctx)return;const geo=obj.geometry,attr=geo.attributes.position,ix=geo.index,materials=Array.isArray(obj.material)?obj.material:[obj.material];
   const vs=Array.from({length:attr.count},(_,i)=>new T.Vector3().fromBufferAttribute(attr,i).applyMatrix4(obj.matrixWorld));
   for(const g of geo.groups.length?geo.groups:[{start:0,count:ix?.count||attr.count,materialIndex:0}]){
    const m=materials[g.materialIndex]||materials[0];
    for(let j=g.start;j<g.start+g.count;j+=3){const [a,b,c]=[0,1,2].map(k=>vs[ix?ix.getX(j+k):j+k]);const n=b.clone().sub(a).cross(c.clone().sub(a)).normalize();const lum=.55+.45*Math.max(0,n.dot(new T.Vector3(-.4,.8,.45)));
     const color=m.color.clone().multiplyScalar(lum);triangles.push({a,b,c,n,day:"#"+color.getHexString(),night:"#"+color.multiply(new T.Color(.26,.34,.48)).getHexString()})}
   }
  });fitted=propertySurface(pickMeshes);routes=createRouteGeometry(fitted);depthCache=null;if(state.design){state={...state,design:routes.placeBodies(state.design)};rebuild()}events.ready(routes);invalidate()
 },undefined,()=>events.fail("The property could not load. Reload to retry."));
 function rebuild(){
  depthCache=null;blockedRoutes.clear();
  wires=state.design?routes.cables(state.design):[];
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
  raf=0;if(disposed||state.active===false)return;if(!tween&&(state.play||stage.animated())&&now-last<(gl?50:130)&&document.hasFocus()){invalidate();return}last=now;if(tween)stepTween(now);
  ambient.intensity=state.night?.82:2;ambient.color.set(state.night?0xaac6ff:0xe9f2ff);key.intensity=state.night?.64:2.15;key.color.set(state.night?0xbdd1ff:0xffedcd);
  cam.updateMatrixWorld();ink.clearRect(0,0,w,h);
  let k=0;projection=[];const time=now/1000;
  const off=(f)=>state.design?.devices.find(d=>d.id===f.device)?.offPorts?.includes(f.port);stage.update(state,(f,...args)=>off(f)?new T.Color(0):frameColor(f,...args),time);
  for(const r of runs){r.pts.forEach((p,i)=>{const col=r.off?new T.Color(0):frameColor(r.f,i,time,state.play);col.toArray(colors,k);k+=3;projection.push({...screen(p),id:r.f.id,c:"#"+col.getHexString()})})}
  if(bulbs)bulbs.geometry.attributes.color.needsUpdate=true;
  if(gl){stage.shadows(gl,scene);gl.render(scene,cam);stage.overlay(gl,scene,cam)}else if(ctx){
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
  const chosen=new Set(state.multi||[]);
  if(state.mode==="select"&&chosen.size>1)for(const id of chosen){
   const prop=sceneProp(state.design,id);
   if(prop){const s=screen(vec(prop.point));if(s.z>=-1&&s.z<=1){ink.beginPath();ink.arc(s.x,s.y,7,0,Math.PI*2);ink.strokeStyle=prop.row.locked?"#ffffff88":"#ffe097";ink.lineWidth=2;ink.stroke()}continue}
   const f=state.design?.fixtures.find(x=>x.id===id);if(f?.visible&&f.points.length>1)line(fixturePath(f),"#ffe097b0",[3,4]);
  }
  const selectedProp=state.mode==="select"&&chosen.size<2&&sceneProp(state.design,state.sel);
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
  for(const r of runs){if(r.pts.length&&(state.labels||r.f.id===state.sel||r.f.id===state.hover||chosen.has(r.f.id)))tag(r.pts[Math.floor(r.pts.length/2)].toArray(),r.f.name,r.f.color,r.f.id);
   if(state.mode==="edit"&&r.f.id===state.sel){const anchors=r.f.points.map(p=>mountPoint(r.f,p));line(fixturePath(r.f),"#ffce80");anchors.forEach(p=>dot(p,"#ffce80",5))}}
  const box=state.design?.devices.find(d=>d.id===state.sel&&d.point);
  if(box){const s=screen(vec(box.point));events.anchor(s.x,s.y,s.z);const el=host.parentElement.querySelector(".boxPopover");if(el&&s.z<1){const x=s.x<el.offsetLeft?el.offsetLeft:s.x>el.offsetLeft+el.offsetWidth?el.offsetLeft+el.offsetWidth:Math.max(el.offsetLeft,Math.min(s.x,el.offsetLeft+el.offsetWidth));const y=Math.max(el.offsetTop+8,Math.min(s.y,el.offsetTop+el.offsetHeight-8));ink.strokeStyle="#b3ebc8";ink.lineWidth=1.4;ink.beginPath();ink.moveTo(s.x,s.y);ink.lineTo(x,y);ink.stroke();dot(box.point,"#b3ebc8",3)}for(const f of state.design.fixtures.filter(f=>f.device===box.id&&f.points.length&&f.visible)){
    const end=f.points[0],c=wires.find(c=>[c.from,c.to].includes("d/"+box.id)&&[c.from,c.to].includes("f/"+f.id));
    if(c?.visible&&!stage.animated())dot(cablePoints(c,state.design)[0],c.color,3);

    dot(end,f.color,5);if(!state.labels)tag(end,"Ch "+f.port+" · "+f.name,f.color,f.id);
   }}
  for(const p of state.design?.plants||[])if(p.visible&&(p.id===state.sel||p.id===state.hover||state.labels||chosen.has(p.id)))tag([p.point[0],p.point[1]+p.height*.7,p.point[2]],p.name,"#8db88e",p.id);
  const hovered=!(state.wiring||box)&&state.design?.devices.find(d=>d.id===state.hover&&d.point);if(hovered)tag(hovered.point,hovered.name,"#79dccc",hovered.id);
  if((state.wiring||box)&&state.design){
   for(const d of state.design.devices.filter(d=>d.point)){const parent=state.design.devices.find(p=>p.id===d.parent&&p.point);if(parent&&(state.wiring||box?.id===d.id||box?.id===parent.id)&&!wires.some(c=>[c.from,c.to].includes("d/"+d.id)&&[c.from,c.to].includes("d/"+parent.id)))line([parent.point,d.point],d.model==="rx"?"#bfa8e7":"#83acc3",[2,6]);if(state.labels||d.id===state.sel||d.id===state.hover)tag(d.point,d.name,"#79dccc",d.id)}
   for(const c of wires){if(!c.visible||(c.inferred&&c.id!==state.sel))continue;const pts=cablePoints(c,state.design);if(state.labels||c.id===state.sel||c.id===state.hover)tag(pts[Math.floor(pts.length/2)],c.name,c.color,c.id);
    if(c.id===state.sel&&state.mode==="cableEdit")editTarget().pts.forEach(p=>dot(p,"#ffce80",5))}
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
 function editTarget(){const selected=state.mode==="cableEdit"&&wires.find(c=>c.id===state.sel),c=selected&&routes.editableCable(selected,state.design),f=!c&&state.design?.fixtures.find(f=>f.id===state.sel);
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
  if(drag>=0){
   const raw=resolveHit(e),{c,f}=editTarget();
   const row=raw.point && (c||f) && editRoutePoint(c||f,inserting?"insert":"move",inserting?drag+1:drag,raw.point,raw.normal,state.lift);
   const path=row && (c?routes.cable(row,state.design):routes.fixture(row));
   dragHit=path?{...raw,path}:null;
   invalidate();return;
  }
  if(state.mode==="select"&&ctrlHeld&&!lineDrag&&!marquee)ctrlHover(e);
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
  shownHandles=[];
  if(state.mode==="select"&&(ctrlHeld||lineDrag)&&state.design){
   const taken=[];
   for(const l of editableLines()){
    if(lineDrag&&lineDrag.line.id!==l.id)continue;
    // Points first so a bend is never hidden behind an in-between dot.
    for(const hd of [...l.handles].sort((a,b)=>(a.kind==="point"?0:1)-(b.kind==="point"?0:1))){
     const s=screen(vec(hd.point));if(s.z<-1||s.z>1||s.x<-12||s.y<-12||s.x>w+12||s.y>h+12)continue;
     if(hd.kind==="insert"&&taken.some(o=>Math.hypot(o.x-s.x,o.y-s.y)<18))continue;
     taken.push(s);shownHandles.push({line:l,handle:hd,x:s.x,y:s.y});
    }
   }
   for(const {line:l,handle:hd,x,y} of shownHandles){
    if(lineDrag?.moving&&lineDrag.handle===hd)continue;
    const hot=hoverHandle===l.id+":"+hd.kind+":"+hd.index;ink.setLineDash([]);
    if(hd.fixed){ink.fillStyle="#ffffff70";ink.fillRect(x-2.5,y-2.5,5,5);continue}
    if(hd.kind==="point"){
     if(hot){ink.beginPath();ink.arc(x,y,10,0,Math.PI*2);ink.strokeStyle="#ffffffcc";ink.lineWidth=1.5;ink.stroke()}
     ink.beginPath();ink.arc(x,y,hot?6.5:5,0,Math.PI*2);ink.fillStyle=l.color;ink.fill();ink.strokeStyle="#0a101d";ink.lineWidth=2;ink.stroke();
    }else{
     ink.beginPath();ink.arc(x,y,hot?5.5:3.5,0,Math.PI*2);ink.fillStyle=hot?l.color:"#0a101dcc";ink.fill();ink.strokeStyle=l.color;ink.lineWidth=1.6;ink.stroke();
    }
   }
  }
  if(lineDrag?.moving){
   const pv=lineDrag.preview;
   if(pv){
    const fit=pv.path,blocked=fit.obstructed,s=screen(vec(pv.t.point));
    path(fit,"#000000aa",4.5);path(fit,blocked?"#ffffff99":"#79edbf",2,[5,4]);
    for(const span of fit.blockedSegments||[])path(span,"#ff626e",4);
    if(pv.t.kind==="vertex"||pv.t.kind==="edge"||pv.t.kind==="bundle"){ink.strokeStyle="#ffc46b";ink.lineWidth=2;ink.strokeRect(s.x-6,s.y-6,12,12)}
    if(pv.t.kind==="base"){ink.strokeStyle="#ffc46b";ink.lineWidth=2;ink.beginPath();ink.moveTo(s.x-9,s.y+5);ink.lineTo(s.x+9,s.y+5);ink.moveTo(s.x-9,s.y+5);ink.lineTo(s.x-9,s.y-7);ink.stroke()}
    disc(pv.t.point,blocked?"#ff626e":"#79edbf",5);
    const length=measuredLength(fit),hint={level:"level",plumb:"plumb",vertex:"corner",edge:"edge",bundle:"join wire",base:"wall base"}[pv.t.kind];
    note(s.x,s.y,blocked?"Blocked · add a bend outside":[length===null?null:feet(length),hint].filter(Boolean).join(" · ")||"Move");
   }
  }
  if(axisDrag){
   const s=screen(pivot.position),d=pivot.position.clone().sub(axisDrag.start),sign=v=>(v<0?"−":"+")+Math.abs(v/.3048).toFixed(1)+" ft";
   const parts=[["X",d.x],["Height",d.y],["Z",d.z]].filter(([,v])=>Math.abs(v)>.003).map(([k,v])=>k+" "+sign(v));
   note(s.x,s.y,parts.join(" · ")||"Drag along an arrow");
  }
  if(marquee?.moving){
   const x=Math.min(marquee.x0,marquee.x1),y=Math.min(marquee.y0,marquee.y1),bw=Math.abs(marquee.x1-marquee.x0),bh=Math.abs(marquee.y1-marquee.y0);
   ink.fillStyle="#ffe0971c";ink.fillRect(x,y,bw,bh);ink.strokeStyle="#ffe097";ink.lineWidth=1.2;ink.setLineDash([5,4]);ink.strokeRect(x+.5,y+.5,bw,bh);ink.setLineDash([]);
  }
  if(state.mode==="edit"||state.mode==="cableEdit"){const {pts,insertable}=editTarget();if(pts){
   if(insertable&&pts.length<160&&drag<0)for(let i=1;i<pts.length;i++)ring(pts[i].map((v,k)=>(v+pts[i-1][k])/2),3.5,"#ffce80");
   if(drag>=0&&dragHit){
    const fit=dragHit.path, blocked=fit.obstructed;
    path(fit,blocked?"#ffffff99":"#79edbf",2,[5,4]);
    for(const span of fit.blockedSegments||[])path(span,"#ff626e",4);
    disc(dragHit.point,blocked?"#ff626e":"#79edbf",5);
    if(blocked)note(dragHit.x,dragHit.y,"Blocked · add an outside waypoint");
   }}}
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
  if(state.mode==="edit"||state.mode==="cableEdit"){if(e.button!==0)return;const {c,pts,insertable}=editTarget(),{x,y}=resolveHit(e);
   const over=(p,r)=>{const q=screen(vec(p));return Math.hypot(x-q.x,y-q.y)<r};
   drag=pts?.findIndex((p,i)=>!(c&&((!i&&c.from)||(i===pts.length-1&&c.to)))&&over(p,17))??-1;
   if(drag<0&&insertable&&pts&&pts.length<160){drag=pts.findIndex((p,i)=>i<pts.length-1&&over(p.map((v,k)=>(v+pts[i+1][k])/2),11));inserting=drag>=0}
   if(drag>=0){controls.enabled=false;surface.setPointerCapture(e.pointerId)}return}
  if(state.mode==="draw"&&dragTools.includes(state.tool)&&e.button===0&&!anchor){const start=aim(e);
   if(start.point){dragDraw={start,moved:false};controls.enabled=false;surface.setPointerCapture(e.pointerId);if(state.tool==="free")stroke={points:[start.point],normals:[start.normal||null]}}}
 }
 function pointerUp(e){const before=down;down=null;if(!before)return;const hit=resolveHit(e),moved=Math.hypot(e.clientX-before[0],e.clientY-before[1]);
  if(drag>=0){const index=drag,insert=inserting;drag=-1;inserting=false;dragHit=null;controls.enabled=true;
   if(hit.point&&(moved>3||insert)){events.editPoint(insert?"insert":"move",insert?index+1:index,hit.point,hit.normal)}invalidate();return}
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
 // ---- Move arrows: drag one axis (or plane) to move the selected prop or selection exactly.
 const gizmo=gl?new TransformControls(cam,surface):null,pivot=new T.Object3D();scene.add(pivot);
 let axisDrag=null,gizmoArmed=false,axisFrame=0;
 if(gizmo){
  gizmo.setMode("translate");gizmo.setSpace("world");gizmo.setSize(.68);scene.add(gizmo.getHelper());
  gizmo.addEventListener("change",invalidate);
  gizmo.addEventListener("dragging-changed",e=>{controls.enabled=!e.value;if(e.value)startAxis();else endAxis(true)});
  gizmo.addEventListener("objectChange",()=>{if(axisDrag&&!axisFrame)axisFrame=requestAnimationFrame(()=>{axisFrame=0;previewAxis()})});
 }
 function axisItems(){
  if(!gizmo||state.mode!=="select"||state.gizmo===false||!state.savedDesign||state.active===false)return null;
  const ids=state.multi?.length>1?state.multi:state.sel?[state.sel]:[];
  // A lone strand reshapes with its dots instead.
  if(ids.length===1&&!sceneProp(state.savedDesign,ids[0]))return null;
  const items=ids.map(id=>findRow(state.savedDesign,id)).filter(o=>o&&!o.row.locked&&rowAnchor(o.group,o.row));
  return items.length?items:null;
 }
 function syncGizmo(){
  if(!gizmo||axisDrag)return;
  const items=axisItems();
  if(!items){if(gizmo.object)gizmo.detach();return}
  const anchors=items.map(o=>{const shown=findRow(state.design,o.row.id)||o;return rowAnchor(shown.group,shown.row)||rowAnchor(o.group,o.row)});
  pivot.position.fromArray([0,1,2].map(k=>anchors.reduce((n,p)=>n+p[k],0)/anchors.length));
  // Plants stay on the ground, so they only slide.
  gizmo.showY=!items.every(o=>o.group==="plants");
  const hidden=ctrlHeld||!!lineDrag||!!marquee;gizmo.enabled=!hidden;gizmo.getHelper().visible=!hidden;
  if(gizmo.object!==pivot)gizmo.attach(pivot);
 }
 function overGizmo(e){
  if(!gizmo?.object||!gizmo.enabled)return false;
  const {x,y}=local(e);gizmo.pointerHover({x:x/w*2-1,y:-y/h*2+1,button:e.button});
  return gizmo.axis!==null;
 }
 function axisRows(){
  const delta=pivot.position.clone().sub(axisDrag.start).toArray();
  return axisDrag.items.map(o=>({group:o.group,row:translateRow(o.group,o.row,delta,o.group==="plants"?groundAt:null),from:o.row}));
 }
 function startAxis(){const items=axisItems();if(!items)return;tween=null;axisDrag={items,start:pivot.position.clone(),axis:gizmo.axis}}
 function previewAxis(){if(!axisDrag)return;axisDrag.rows=axisRows();const [first]=axisDrag.items;events.propPreview({prop:first,rows:axisDrag.rows});invalidate()}
 function endAxis(commit){
  cancelAnimationFrame(axisFrame);axisFrame=0;gizmoArmed=false;const d=axisDrag;
  if(d){const rows=axisRows(),moved=pivot.position.distanceTo(d.start)>1e-4;axisDrag=null;events.propPreview(null);if(commit&&moved)events.propDrop(d.items[0],rows)}
  syncGizmo();invalidate();
 }
 // ---- Ctrl editing: grab dots on wires and strands, plus box selection.
 // Registered before the prop gestures so a dot on a wire wins over the prop behind it.
 const viewportEl=host.parentElement;
 let ctrlHeld=false,ctrlTimer=0,lineDrag=null,marquee=null,hoverHandle=null,shownHandles=[],lineFrame=0,handleKey=null,handleLines=[];
 const consume=e=>{e.preventDefault();e.stopImmediatePropagation()};
 function setCtrl(on){
  clearTimeout(ctrlTimer);if(on===ctrlHeld)return;ctrlHeld=on;
  if(on)viewportEl.dataset.ctrl="on";else{delete viewportEl.dataset.ctrl;hoverHandle=null;if(!lineDrag)surface.style.cursor=""}
  if(!axisDrag)syncGizmo();invalidate();
 }
 function groundAt(p){if(!fitted)return null;const hit=fitted.cast(vec([p[0],p[1]+.6,p[2]]),new T.Vector3(0,-1,0),3);return hit?hit.point.toArray():null}
 function cableShown(c){
  const d=state.design,box=d.devices.some(x=>x.id===state.sel);
  return c.visible&&(state.wiring||box)&&((state.wiring&&!c.inferred)||c.id===state.sel||connected(c,state.sel,d));
 }
 // Wires on screen, plus any selected strand, with their grab dots.
 function editableLines(){
  const k=handleKey;if(k&&k.design===state.design&&k.sel===state.sel&&k.wiring===state.wiring&&k.multi===state.multi&&k.wires===wires)return handleLines;
  const lines=[];
  if(state.design){
   for(const c of wires){if(!cableShown(c))continue;const edit=routes.editableCable(c,state.design),pts=cablePoints(edit,state.design);if(pts.length<2)continue;
    const fixed=[];if(edit.from)fixed.push(0);if(edit.to)fixed.push(pts.length-1);
    lines.push({id:c.id,group:"cables",color:c.color,pts,handles:lineHandles(pts,cordPath(c,state.design),{fixed})})}
   const picked=new Set([state.sel,...(state.multi||[])]);
   for(const f of state.design.fixtures){if(!picked.has(f.id)||f.shape!=="run"||f.plant||f.locked||!f.visible||f.points.length<2)continue;
    const pts=f.points.map(p=>mountPoint(f,p));lines.push({id:f.id,group:"fixtures",color:f.color,pts,handles:lineHandles(pts,fixturePath(f))})}
  }
  handleKey={design:state.design,sel:state.sel,wiring:state.wiring,multi:state.multi,wires};handleLines=lines;return lines;
 }
 function local(e){const rect=surface.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}}
 function handleAt(e){
  const {x,y}=local(e);let best=null;
  for(const s of shownHandles){if(s.handle.fixed)continue;const point=s.handle.kind==="point",d=Math.hypot(s.x-x,s.y-y)+(point?0:3);if(d<(point?13:11)&&(!best||d<best.d))best={...s,d}}
  return best;
 }
 function lineTarget(line){
  if(line.group==="cables"){const c=wires.find(c=>c.id===line.id);return c&&routes.editableCable(c,state.design)}
  return state.design.fixtures.find(f=>f.id===line.id);
 }
 // Snap a dragged dot: house corners, other wires' bends, house edges, then the foot of a wall.
 function snapLine(raw,e,line,handle){
  let t={...raw,kind:null};
  const neighbours=[line.pts[handle.index-1],line.pts[handle.kind==="insert"?handle.index:handle.index+1]].filter(Boolean);
  if(!e.altKey&&state.toolOpts?.snap!==false){
   let best=null;const at=vec(raw.point);
   const near=(p,kind,normal)=>{const q=vec(p);if(q.distanceTo(at)>.8)return;const s=screen(q),d=Math.hypot(s.x-raw.x,s.y-raw.y);if(d<14&&(!best||d<best.d))best={d,point:[...p],normal:normal||raw.normal,kind}};
   for(const c of snapSets.vertices)near(c.p,"vertex",c.normal);
   for(const other of editableLines())if(other.id!==line.id)other.pts.forEach((p,i)=>{if(other.group!=="cables"||(i&&i<other.pts.length-1))near(p,"bundle")});
   if(!best)for(const l of snapSets.lines){const n=nearestOnPath(raw.point,l.pts);if(n.distance<.11&&(!best||n.distance<best.d))best={d:n.distance,point:n.point,normal:l.normal||raw.normal,kind:"edge"}}
   if(best)t={...raw,...best};
   else if(fitted&&raw.normal&&line.group==="cables"){const c=fitted.crease(raw.point,raw.normal,.32);if(c)t={...raw,point:c.point,normal:c.normal,kind:"base"}}
  }
  if(e.shiftKey||(!e.altKey&&!t.kind))for(const n of neighbours){const a=aligned(n,t,e.shiftKey);if(a.kind==="level"||a.kind==="plumb"){t=a;break}}
  return t;
 }
 function updateLine(e){
  if(!lineDrag)return;
  const {line,handle}=lineDrag,raw=resolveHit(e),target=raw.point&&lineTarget(line);
  if(!target){lineDrag.preview=null;invalidate();return}
  const t=snapLine(raw,e,line,handle),insert=handle.kind==="insert";
  const row=editRoutePoint(target,insert?"insert":"move",handle.index,t.point,t.normal,0);
  const path=row&&(line.group==="cables"?routes.cable(row,state.design):routes.fixture(row));
  lineDrag.preview=path?{t,row,path}:null;viewportEl.dataset.propDrag=path&&!path.obstructed?"moving":"invalid";invalidate();
 }
 function endLine(){
  const d=lineDrag;lineDrag=null;cancelAnimationFrame(lineFrame);lineFrame=0;controls.enabled=true;delete viewportEl.dataset.propDrag;
  if(d&&surface.hasPointerCapture?.(d.pointer))surface.releasePointerCapture(d.pointer);surface.style.cursor="";invalidate();
 }
 function endMarquee(){
  const m=marquee;marquee=null;controls.enabled=true;
  if(m&&surface.hasPointerCapture?.(m.pointer))surface.releasePointerCapture(m.pointer);invalidate();
 }
 function boxed(m){
  const x0=Math.min(m.x0,m.x1),x1=Math.max(m.x0,m.x1),y0=Math.min(m.y0,m.y1),y1=Math.max(m.y0,m.y1);
  const inside=p=>{const s=screen(p.isVector3?p:vec(p));return s.z>=-1&&s.z<=1&&s.x>=x0&&s.x<=x1&&s.y>=y0&&s.y<=y1};
  const d=state.design,ids=[];
  // Strands count when most of their bulbs are inside; props by their base.
  for(const r of runs)if(r.f.shape==="run"||r.f.plant){const n=r.pts.filter(inside).length;if(n&&n>=r.pts.length/2)ids.push(r.f.id)}
  for(const f of d.fixtures)if(f.visible&&f.points.length&&f.shape!=="run"&&!f.plant&&inside(f.points[0]))ids.push(f.id);
  for(const p of d.plants||[])if(p.visible&&(inside(p.point)||inside([p.point[0],p.point[1]+p.height*.45,p.point[2]])))ids.push(p.id);
  for(const x of d.devices)if(x.point&&inside(x.point))ids.push(x.id);
  return [...new Set(ids)];
 }
 function editDown(e){
  if(state.mode!=="select"||!e.isPrimary||e.button!==0||!model)return;
  const held=e.ctrlKey||e.metaKey;if(e.pointerType!=="touch")setCtrl(held);
  if(held&&!e.shiftKey&&!e.altKey){
   const hit=handleAt(e);if(!hit)return;
   consume(e);tween=null;controls.enabled=false;surface.setPointerCapture(e.pointerId);surface.style.cursor="grabbing";
   lineDrag={line:hit.line,handle:hit.handle,pointer:e.pointerId,x:e.clientX,y:e.clientY,moving:false,preview:null};invalidate();return;
  }
  if(overGizmo(e)){gizmoArmed=true;controls.enabled=false;return}
  if(!held&&!e.altKey&&(e.shiftKey||state.boxSelect)){
   consume(e);tween=null;controls.enabled=false;surface.setPointerCapture(e.pointerId);
   const {x,y}=local(e);marquee={pointer:e.pointerId,x0:x,y0:y,x1:x,y1:y,add:e.shiftKey,moving:false};
  }
 }
 function editMove(e){
  if(e.pointerType==="mouse"&&!lineDrag)setCtrl(e.ctrlKey||e.metaKey);
  if(lineDrag&&e.pointerId===lineDrag.pointer){
   consume(e);if(!lineDrag.moving&&Math.hypot(e.clientX-lineDrag.x,e.clientY-lineDrag.y)<3)return;
   lineDrag.moving=true;lineDrag.last=e;
   if(!lineFrame)lineFrame=requestAnimationFrame(()=>{lineFrame=0;if(lineDrag?.last)updateLine(lineDrag.last)});return;
  }
  if(marquee&&e.pointerId===marquee.pointer){
   consume(e);const {x,y}=local(e);marquee.x1=x;marquee.y1=y;if(Math.hypot(x-marquee.x0,y-marquee.y0)>5)marquee.moving=true;invalidate();
  }
 }
 function editUp(e){
  if(gizmoArmed){gizmoArmed=false;if(!gizmo.dragging)controls.enabled=true}
  if(lineDrag&&e.pointerId===lineDrag.pointer){
   consume(e);const d=lineDrag;if(d.moving)updateLine(e);const p=d.preview;endLine();
   // A click on a dot keeps the current selection, so a double-click can remove a bend in context.
   if(!d.moving)return;
   if(p)events.editLine({id:d.line.id,group:d.line.group,action:d.handle.kind==="insert"?"insert":"move",index:d.handle.index,point:p.t.point,normal:p.t.normal});
   return;
  }
  if(marquee&&e.pointerId===marquee.pointer){
   consume(e);const m=marquee;endMarquee();
   if(m.moving){events.selectMany(boxed(m),m.add);return}
   const id=pickedId(resolveHit(e));if(id)events.pick(id,{toggle:m.add});else if(!m.add)events.pick("");
  }
 }
 function editCancel(e){if(lineDrag&&e.pointerId===lineDrag.pointer)endLine();if(marquee&&e.pointerId===marquee.pointer)endMarquee()}
 function editKey(e){
  if(e.key==="Shift")gizmo?.setTranslationSnap(e.type==="keydown"?.1524:null);
  if(e.type==="keyup"){if(e.key==="Control"||e.key==="Meta")setCtrl(false);return}
  if((lineDrag||marquee)&&e.key==="Escape"){consume(e);endLine();endMarquee();return}
  if(axisDrag&&e.key==="Escape"){consume(e);axisDrag=null;events.propPreview(null);invalidate();return}
  if(e.key==="Control"||e.key==="Meta"){if(!ctrlHeld&&!e.repeat){clearTimeout(ctrlTimer);ctrlTimer=setTimeout(()=>setCtrl(true),140)}return}
  // A shortcut such as Ctrl C should not flash the dots.
  if(e.ctrlKey||e.metaKey){clearTimeout(ctrlTimer);if(!lineDrag)setCtrl(false)}
 }
 // While Ctrl is held, show what a drag would grab.
 function ctrlHover(e){
  const hit=handleAt(e),key=hit?hit.line.id+":"+hit.handle.kind+":"+hit.handle.index:null;
  if(key!==hoverHandle){hoverHandle=key;invalidate()}
  let cursor=hit?"grab":"";
  if(!hit&&model){const id=pickedId(resolveHit(e)),prop=sceneProp(state.savedDesign,id);if(prop&&!prop.row.locked)cursor="move"}
  surface.style.cursor=cursor;
 }
 const editAbort=new AbortController(),editOpts={signal:editAbort.signal,capture:true,passive:false};
 surface.addEventListener("pointerdown",editDown,editOpts);surface.addEventListener("pointermove",editMove,editOpts);
 surface.addEventListener("pointerup",editUp,editOpts);surface.addEventListener("pointercancel",editCancel,editOpts);
 window.addEventListener("keydown",editKey,editOpts);window.addEventListener("keyup",editKey,editOpts);
 window.addEventListener("blur",()=>{setCtrl(false);endLine();endMarquee()},editOpts);
 const gestures=bindPropGestures(surface,host.parentElement,{
  selected:()=>state.mode==="select"?sceneProp(state.savedDesign,state.sel):null,
  grab(ev){
   if(!model||state.mode!=="select"||gizmoArmed)return null;
   const hit=resolveHit(ev),id=pickedId(hit),prop=sceneProp(state.savedDesign,id);
   if(!prop||prop.row.locked)return null;
   const shown=sceneProp(state.design,id),base=screen(vec(shown.point));
   // Dragging one item of a multi-selection carries the rest along by the same offset.
   const others=state.multi?.length>1&&state.multi.includes(id)?state.multi.filter(x=>x!==id).map(x=>findRow(state.savedDesign,x)).filter(o=>o&&!o.row.locked):[];
   tween=null;return {prop,offset:{x:base.x-hit.x,y:base.y-hit.y},others};
  },
  select:id=>{if(!state.multi?.includes(id))events.pick(id)},
  place({prop,offset,others},ev){
   if(state.mode!=="select"||sceneProp(state.savedDesign,prop.row.id)?.row!==prop.row)return null;
   const hit=propertyHit(ev,offset);if(!hit)return null;
   let row;
   if(prop.group==="plants"){if(!isLawn(hit))return null;row=moveProp(prop,hit.point.toArray())}
   else{
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if(normal.dot(ray.ray.direction)>0)normal.negate();
    row=moveProp(prop,hit.point.clone().addScaledVector(normal,.045).toArray(),normal.toArray());
   }
   const to=rowAnchor(prop.group,row),delta=to.map((v,i)=>v-prop.point[i]);
   return [{group:prop.group,row,from:prop.row},...others.map(o=>({group:o.group,row:translateRow(o.group,o.row,delta,groundAt),from:o.row}))];
  },
  preview:target=>events.propPreview(target),
  commit:(prop,rows)=>events.propDrop(prop,rows),
  scale:(prop,factor)=>events.propTransform(prop,"scale",factor),
  rotate:(prop,degrees)=>events.propTransform(prop,"rotate",degrees)
 });
 function doubleClick(e){
  if(state.mode==="draw"&&state.tool==="path"){events.finish();return}
  if(state.mode==="select"&&(e.ctrlKey||e.metaKey)){const hit=handleAt(e);if(hit?.handle.kind==="point")events.editLine({id:hit.line.id,group:hit.line.group,action:"remove",index:hit.handle.index});return}
  if(state.mode!=="edit"&&state.mode!=="cableEdit")return;
  const {c,pts}=editTarget(),{x,y}=resolveHit(e);if(!pts||pts.length<3)return;
  const index=pts.findIndex((p,i)=>{if(c&&((!i&&c.from)||(i===pts.length-1&&c.to)))return false;const q=screen(vec(p));return Math.hypot(x-q.x,y-q.y)<17});
  if(index>=0)events.editPoint("remove",index);
 }
 const plantImages=new Map();
 const pointerMove=e=>{lastMove=e;if(!moveRaf)moveRaf=requestAnimationFrame(()=>{moveRaf=0;if(disposed||!lastMove)return;
  if(state.mode==="plant"){if(state.ghost&&!down&&lastMove.pointerType!=="touch")previewPlant(state.ghost,lastMove)}else hover(lastMove)})};
 const pointerLeave=()=>{lastMove=null;if(state.mode==="plant")clearPlantPreview();if(cursor&&!dragDraw){cursor=null;shapePreview=null;feature=null;invalidate()}};
 const cancel=()=>{down=null;drag=-1;dragDraw=null;stroke=null;dragHit=null;controls.enabled=true;invalidate()};
 surface.addEventListener("pointerdown",pointerDown,true);surface.addEventListener("pointerup",pointerUp);surface.addEventListener("pointermove",pointerMove);surface.addEventListener("pointerleave",pointerLeave);surface.addEventListener("dblclick",doubleClick);surface.addEventListener("pointercancel",cancel);
 const visibility=()=>{if(!document.hidden)invalidate()};document.addEventListener("visibilitychange",visibility);window.addEventListener("focus",visibility);
 // Where the pointer rests on the property, for pasting at the cursor.
 function pointerPoint(){if(!lastMove||!model||state.mode!=="select")return null;const hit=resolveHit(lastMove);return hit.point?{point:hit.point,normal:hit.normal}:null}
 function camAxes(){const right=new T.Vector3().setFromMatrixColumn(cam.matrixWorld,0).setY(0).normalize(),forward=new T.Vector3().setFromMatrixColumn(cam.matrixWorld,2).negate().setY(0).normalize();return {right:right.toArray(),forward:forward.toArray()}}
 return {previewPlant,clearPlantPreview,lawnAt,pointerPoint,camAxes,groundAt,update(s){if(state.mode==="plant"&&s.mode!=="plant")clearPlantPreview();const design=routes.placeBodies(s.design),refresh=design!==state.design||s.night!==state.night;const preview=s.draft!==state.draft||refresh;
  // A new tool starts clean; while a drag tool is active the right button orbits instead of panning.
  if(s.mode!==state.mode||s.tool!==state.tool||s.active!==state.active){cancel();endLine();endMarquee();anchor=null;stroke=null;dragDraw=null;shapePreview=null;feature=null;controls.enabled=true;controls.mouseButtons.RIGHT=s.mode==="draw"&&dragTools.includes(s.tool)?T.MOUSE.ROTATE:T.MOUSE.PAN}
  state={...s,design};refreshPreview();if(preview){const pts=s.draft||[];previewPath=pts.length>=2&&fitted&&s.routeStyle!=="hanging"?fitted.route(pts,{radius:s.mode==="cable"?.02:0,window:s.mode==="draw"}):routedPoints(pts,s.routeStyle||"corners",s.routeSag)}if(refresh)rebuild();else invalidate();syncGizmo()},preset,focus,zoom(f){const offset=cam.position.clone().sub(controls.target);offset.setLength(Math.min(controls.maxDistance,Math.max(controls.minDistance,offset.length()*f)));fly(controls.target.clone().add(offset),controls.target.clone(),220)},
 dispose(){disposed=true;gestures();editAbort.abort();clearTimeout(ctrlTimer);cancelAnimationFrame(axisFrame);gizmo?.detach();gizmo?.dispose();cancelAnimationFrame(raf);cancelAnimationFrame(moveRaf);observer.disconnect();controls.dispose();stage.dispose();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("focus",visibility);scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose()});gl?.dispose();host.replaceChildren()}}
}

