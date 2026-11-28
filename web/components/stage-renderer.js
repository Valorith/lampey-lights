import {hardware} from "../lib/show";
import {plantMesh} from "./plant-mesh.js";
import {cabinetGeometry} from "./controller-mesh.js";
import {cabinets} from "../lib/controller-layout.js";
import {connected,controllerCords,sceneCables,deviceBasis,wallMount} from "../lib/stage.js";
import * as T from "three";
import {beamDefaults,beamDirection,floodScale,lampOrigin,cablePoints,routedPoints} from "../lib/stage.js";
import {floodProjector,LIGHT_LAYER} from "./flood-projector.js";

const up=new T.Vector3(0,1,0);
const vector=p=>new T.Vector3(...p);
function mesh(group,geometry,material,pos){const m=new T.Mesh(geometry,material);m.position.set(...pos);group.add(m);return m}
const finish=(color,metalness=.1)=>new T.MeshStandardMaterial({color,metalness,roughness:.55});
function box(group,dimensions,position,mat){return mesh(group,new T.BoxGeometry(...dimensions),mat,position)}
function equipment(d,cabinetCache,cabinetMaterial){
 const group=new T.Group(),basis=deviceBasis(d);group.position.copy(vector(basis.origin));group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(vector(basis.x),vector(basis.y),vector(basis.z)));
 group.scale.setScalar(d.scale??1);group.userData.entity=d.id;
 if(cabinets[d.model]){
  const wall=wallMount(d),key=d.model+(wall?"-wall":"-ground");
  if(!cabinetCache.has(key))cabinetCache.set(key,cabinetGeometry(cabinets[d.model],wall));
  const body=new T.Mesh(cabinetCache.get(key),cabinetMaterial);
  body.userData.sharedCabinet=true;
  group.add(body);
  return group;
 }
 const shell=finish("#34454a"),edge=finish("#77898c"),dark=finish("#142326"),signal=new T.MeshBasicMaterial({color:"#84e4bd"}),power=finish("#e6af65");
 if(d.model==="computer"){
  box(group,[.78,.04,.52],[0,.03,0],edge);box(group,[.6,.015,.23],[0,.058,.01],dark);
  const lid=new T.Group();lid.position.set(0,.035,-.23);lid.rotation.x=-.13;group.add(lid);
  box(lid,[.78,.49,.042],[0,.24,0],shell);box(lid,[.70,.40,.016],[0,.24,.028],new T.MeshBasicMaterial({color:"#3a9293"}));
  for(let i=0;i<3;i++)box(lid,[.38-i*.055,.015,.005],[-.10,.34-i*.055,.042],signal);
 }else if(d.model==="bridge"){
  const black=finish("#29292b");
  box(group,[.154,.042,.10],[0,.021,0],black);
  box(group,[.144,.033,.002],[0,.021,.05],dark);
  box(group,[.016,.014,.003],[-.045,.020,.05],edge);
  box(group,[.013,.011,.004],[-.045,.020,.052],black);
  box(group,[.009,.004,.004],[-.01,.014,.051],edge);
  box(group,[.009,.009,.003],[.045,.018,.051],dark);
  for(let i=0;i<6;i++)box(group,[.016,.013,.003],[(i-2.5)*.021,.019,-.05],dark);
 }else if(["tx","rx"].includes(d.model)){
  const black=finish("#242528");
  box(group,[.083,.008,.045],[0,.006,0],dark);
  box(group,[.070,.092,.042],[0,.054,0],black);
  mesh(group,new T.CylinderGeometry(.004,.006,.14,8),black,[0,.176,0]);
  mesh(group,new T.CylinderGeometry(.007,.007,.012,8),edge,[0,.104,0]);
  for(const x of [-.014,.014])box(group,[.016,.013,.004],[x,.022,.022],dark);
 }else if(d.model==="cf50"){
  const black=finish("#26282a"),reflector=finish("#c7cdcc",.33);
  box(group,[.28,.009,.060],[0,.005,0],black);
  for(const side of [-1,1])box(group,[.006,.139,.021],[side*.136,.074,0],black);
  box(group,[.276,.218,.104],[0,.145,.006],black);
  for(let i=0;i<11;i++)box(group,[.008,.165,.020],[(i-5)*.022,.145,-.055],black);
  box(group,[.249,.19,.008],[0,.145,.061],reflector);
  box(group,[.175,.122,.004],[0,.145,.066],edge);
  box(group,[.044,.044,.003],[0,.145,.069],finish("#ede2b5"));
  for(const x of [-.127,.127])for(const y of [.049,.241])
   box(group,[.006,.006,.004],[x,y,.059],edge);
 }else if(["switch","adapter","repeater"].includes(d.model)){
  const w=d.model==="adapter"?.35:.77;box(group,[w,.20,.42],[0,.1,0],shell);
  box(group,[w-.04,.12,.018],[0,.10,.22],edge);
  const count=d.model==="adapter"?1:6;for(let i=0;i<count;i++){const x=(i-(count-1)/2)*.10;box(group,[.075,.066,.018],[x,.09,.238],dark);box(group,[.021,.013,.018],[x,.157,.229],signal)}
 }else{
  const energy=["outlet","supply"].includes(d.model),w=.50,h=.61;
  box(group,[w,h,.28],[0,h/2,0],shell);box(group,[w-.045,h-.055,.034],[0,h/2,.151],edge);
  box(group,[w-.11,.11,.018],[0,h*.74,.178],dark);box(group,[.055,.018,.008],[-w*.18,h*.74,.190],energy?power:signal);
  const outputs=Math.min(16,hardware[d.model]?.ports||0);
  if(outputs){for(let i=0;i<outputs;i++){const x=(i%4-1.5)*.083,y=.095+Math.floor(i/4)*.043;box(group,[.057,.027,.020],[x,y,.178],dark)}}
  else for(let i=0;i<2;i++)box(group,[.068,.07,.035],[(i-.5)*.12,.11,.18],dark);
 }
 return group;
}
function floodHousing(f,dir){
 const group=new T.Group();group.position.copy(vector(lampOrigin(f)));group.scale.setScalar(floodScale(f));group.userData.entity=f.id;
 const normal=vector(f.normal||[0,1,0]).normalize();
 group.quaternion.setFromUnitVectors(up,normal);
 group.rotateY(T.MathUtils.degToRad(f.rotation||0));
 const shell=finish("#324043"),metal=finish("#64787b");box(group,[.33,.032,.23],[0,-.206,0],metal);
 for(const sign of [-1,1])box(group,[.028,.17,.035],[sign*.156,-.119,0],metal);
 const head=new T.Group();head.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),dir.clone().applyQuaternion(group.quaternion.clone().invert()));group.add(head);
 box(head,[.32,.24,.12],[0,0,0],shell);box(head,[.28,.20,.018],[0,0,.069],metal);
 const lens=new T.MeshBasicMaterial({color:f.color});box(head,[.24,.16,.012],[0,0,.083],lens);
 return {group,lens};
}
// Clip the beam against the same property triangles used by the editor. The software
// renderer also gets a coarse footprint; WebGL draws the footprint with the projector.
function beamGeometry(f,candidates,footprint){
 const origin=vector(lampOrigin(f)),axis=vector(beamDirection(f)),reach=f.reach??beamDefaults.reach;
 const width=Math.tan(T.MathUtils.degToRad((f.spread??beamDefaults.spread)/2));
 const right=new T.Vector3().crossVectors(axis,Math.abs(axis.y)>.98?new T.Vector3(0,0,1):up).normalize(),vertical=right.clone().cross(axis);
 const ray=new T.Raycaster();ray.near=.085;ray.far=reach;
 const rings=[],segments=28,levels=6;
 for(let j=0;j<=levels;j++){
  const row=[],radius=j/levels;
  for(let i=0;i<(j===0?1:segments);i++){
   const a=i*2*Math.PI/segments;const dir=axis.clone().addScaledVector(right,width*radius*Math.cos(a)).addScaledVector(vertical,width*radius*Math.sin(a)).normalize();
   ray.set(origin,dir);const hit=ray.intersectObjects(candidates,false)[0];
   const distance=hit?.distance??reach;
   const point=origin.clone().addScaledVector(dir,Math.max(.06,distance-.027));
   row.push({point,hit:!!hit,distance,weight:Math.pow(1-radius*radius,.85)*Math.min(1,(reach-distance)/Math.max(.35,reach*.28))});
  }rings.push(row);
 }
 const vertices=[],weights=[];
 function tri(a,b,c,wa,wb,wc){for(const p of [a,b,c])vertices.push(p.x,p.y,p.z);weights.push(wa,wb,wc)}
 function patch(a,b,c){if(!a.hit||!b.hit||!c.hit)return;
  const near=Math.min(a.distance,b.distance,c.distance),far=Math.max(a.distance,b.distance,c.distance);
  if(far-near>Math.max(.36,near*width*.85))return;
  tri(a.point,b.point,c.point,a.weight*.9,b.weight*.9,c.weight*.9)
 }
 if(footprint)for(let j=1;j<=levels;j++){const prev=rings[j-1],row=rings[j];
  for(let i=0;i<segments;i++){const k=(i+1)%segments,a=prev[j===1?0:i],b=prev[j===1?0:k];patch(a,row[i],row[k]);if(j>1)patch(a,row[k],b)}}
 const ring=rings.at(-1);for(let i=0;i<segments;i++){const next=ring[(i+1)%segments];tri(origin,ring[i].point,next.point,.15,.022,.022)}
 const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(vertices,3));geo.setAttribute("strength",new T.Float32BufferAttribute(weights,1));
 return geo;
}
function beamMaterial(color){return new T.ShaderMaterial({uniforms:{tint:{value:new T.Color(color)},gain:{value:1}},side:T.DoubleSide,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
 vertexShader:"attribute float strength; varying float glow; void main(){glow=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
 fragmentShader:"uniform vec3 tint;uniform float gain;varying float glow;void main(){gl_FragColor=vec4(tint,glow*gain);\n#include <colorspace_fragment>\n}"})}
function cableObject(c,design,pathFor){
 const points=pathFor(c,design).map(vector);if(points.length<2)return null;

 // Sample each span independently so even a short, sharp elbow stays at its control point.
 const group=new T.Group(),material=new T.MeshBasicMaterial({color:c.color});group.userData.entity=c.id;
 const positions=[],indices=[],sides=6,r=c.width/2;let normal=null;
 for(let i=0;i<points.length;i++){const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();if(tangent.lengthSq()<.001)tangent.set(0,1,0);
  if(!normal||Math.abs(normal.dot(tangent))>.98)normal=new T.Vector3().crossVectors(tangent,Math.abs(tangent.y)>.9?new T.Vector3(1,0,0):up).normalize();
  const v=tangent.clone().cross(normal).normalize();normal=v.clone().cross(tangent).normalize();
  for(let j=0;j<sides;j++){const a=2*Math.PI*j/sides;const p=points[i].clone().addScaledVector(normal,r*Math.cos(a)).addScaledVector(v,r*Math.sin(a));positions.push(p.x,p.y,p.z);
   if(i){const a=(i-1)*sides+j,b=(i-1)*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides)}}}
 const geo=new T.BufferGeometry();geo.setAttribute("position",new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);material.side=T.DoubleSide;
 mesh(group,geo,material,[0,0,0]);return group;
}
function disposeGroup(group){const materials=new Set();group.traverse(o=>{if(o.userData.sharedCabinet)return;o.geometry?.dispose();if(o.material)materials.add(o.material)});materials.forEach(m=>m.dispose());group.clear()}
export function stageRenderer(scene,pathFor){
 const props=new T.Group(),wires=new T.Group(),garden=new T.Group();scene.add(props,wires,garden);let wireRecords=new Map(),emitters=[],faces=[],cached=new Map(),lastDesign=null,lastModel=null;
 const projector=floodProjector();
 const plantObjects=new Map();
 const cabinetCache=new Map(),cabinetMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.75});
 let visibilityKey=null,visibilitySel=null,visibilityWiring=null,pulseKey=null,selected=null,paths=[],pulseCount=0;
 const pulseGeo=new T.BufferGeometry(),pulseMat=new T.PointsMaterial({color:"#fff1ac",size:.095,sizeAttenuation:true,transparent:true,opacity:.94,depthWrite:false});
 const pulseMesh=new T.Points(pulseGeo,pulseMat);pulseMesh.frustumCulled=false;scene.add(pulseMesh);
 function energy(state,time){
  if(pulseKey!==state.design||selected!==state.sel){pulseKey=state.design;selected=state.sel;
   paths=(state.design&&selected?controllerCords(state.design,selected,pathFor):[]).filter(r=>r.active&&r.points.length>=2).map(({points})=>{
    const vertices=points.map(vector),distance=[0];for(let i=1;i<vertices.length;i++)distance.push(distance[i-1]+vertices[i].distanceTo(vertices[i-1]));
    const length=distance.at(-1);return {vertices,distance,length,count:Math.min(18,Math.max(1,Math.ceil(length/2.8)))}
   }).filter(p=>p.length>.001);
   pulseCount=paths.reduce((s,p)=>s+p.count,0);pulseGeo.dispose();pulseGeo.setAttribute("position",new T.BufferAttribute(new Float32Array(pulseCount*3),3))
  }
  const attr=pulseGeo.attributes.position;if(!attr)return;
  let idx=0;for(const p of paths){for(let i=0;i<p.count;i++){
   const t=(time*1.35+p.length*i/p.count)%p.length;let lo=0,hi=p.distance.length-1;
   while(hi-lo>1){const mid=(lo+hi)>>1;if(p.distance[mid]<=t)lo=mid;else hi=mid}
   const pos=p.vertices[lo].clone().lerp(p.vertices[hi],(t-p.distance[lo])/(p.distance[hi]-p.distance[lo]||1));attr.setXYZ(idx++,pos.x,pos.y,pos.z)
  }}if(idx)attr.needsUpdate=true;pulseMesh.visible=!!idx
 }
 function sync(design,targets,fallback){
  if(design===lastDesign&&targets.length===lastModel)return;lastDesign=design;lastModel=targets.length;
  disposeGroup(props);disposeGroup(wires);emitters=[];faces=[];
  const visible=new Set();
  for(const p of design.plants||[])if(p.visible){
   visible.add(p.id);
   let group=plantObjects.get(p.id);
   if(group?.userData.kind!==p.kind){
    if(group){garden.remove(group);disposeGroup(group)}
    group=plantMesh(p,fallback);group.userData.kind=p.kind;group.traverse(o=>{if(o.isMesh)o.layers.enable(LIGHT_LAYER)});plantObjects.set(p.id,group);garden.add(group);
   }
   group.position.fromArray(p.point);group.scale.set(p.width,p.height,p.width);
   group.rotation.y=T.MathUtils.degToRad(p.rotation);group.updateMatrixWorld(true);
  }
  for(const [id,group] of plantObjects)if(!visible.has(id)){garden.remove(group);disposeGroup(group);plantObjects.delete(id)}
  const gardenKey=JSON.stringify(design.plants);const surfaces=[...targets,...garden.children.flatMap(g=>g.children)];
  const retained=new Map(),lit=[];
  for(const f of design.fixtures.filter(f=>f.shape==="flood"&&f.visible&&f.points.length)){
   const {group,lens}=floodHousing(f,vector(beamDirection(f)));props.add(group);
   const key=JSON.stringify([lampOrigin(f),beamDirection(f),f.spread,f.reach,targets.length,gardenKey]);
   let data=cached.get(key);
   if(!data){const origin=vector(lampOrigin(f)),r=f.reach??9;
    const near=surfaces.filter(m=>{if(!m.geometry.boundingSphere)m.geometry.computeBoundingSphere();const s=m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);return s.center.distanceTo(origin)<=r+s.radius});
    const geo=beamGeometry(f,near,fallback);data={position:geo.attributes.position,strength:geo.attributes.strength};geo.dispose()}
   retained.set(key,data);const geo=new T.BufferGeometry();geo.setAttribute("position",data.position);geo.setAttribute("strength",data.strength);
   const mat=beamMaterial(f.color);const beam=mesh(props,geo,mat,[0,0,0]);beam.renderOrder=2;beam.userData.flood=f.id;
   const light=f.id+key;if(!fallback)lit.push({key:light,origin:vector(lampOrigin(f)),axis:vector(beamDirection(f)).normalize(),spread:f.spread??beamDefaults.spread,reach:f.reach??beamDefaults.reach});
   emitters.push({f,mat,lens,light})
  }cached=retained;projector.sync(lit);
  for(const d of design.devices)if(d.point)props.add(equipment(d,cabinetCache,cabinetMaterial));
  pulseKey=null;visibilityKey=null;wireRecords=new Map(sceneCables(design).map(c=>[c.id,c]));
  for(const c of wireRecords.values())if(c.visible){const o=cableObject(c,design,pathFor);if(o)wires.add(o)}
  if(fallback){for(const root of [props,wires,garden]){root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,a=g.attributes.position,ix=g.index,glow=g.attributes.strength;
   const p=Array.from({length:a.count},(_,i)=>new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld));
   for(let i=0;i<(ix?.count||a.count);i+=3){const [j,k,l]=[i,i+1,i+2].map(x=>ix?ix.getX(x):x);
    const leaf=g.attributes.color;
    const tint=leaf?new T.Color().fromBufferAttribute(leaf,j):null;
    faces.push({a:p[j],b:p[k],c:p[l],day:tint?.getHexString(),night:tint?.multiplyScalar(.42).getHexString(),material:o.material,object:o,wiring:root===wires,glow:glow?(glow.getX(j)+glow.getX(k)+glow.getX(l))/3:null})}
  })}}
 }
 function update(state,color,time){energy(state,time);wires.visible=state.wiring||!!state.design?.devices.some(d=>d.id===state.sel);
  if(visibilityKey!==state.design||visibilitySel!==state.sel||visibilityWiring!==state.wiring){visibilityKey=state.design;visibilitySel=state.sel;visibilityWiring=state.wiring;
  for(const g of wires.children){const c=wireRecords.get(g.userData.entity);if(!c)continue;const hasBox=state.design.devices.some(d=>d.id===state.sel);const focus=c.id===state.sel||connected(c,state.sel,state.design);g.visible=(state.wiring&&!c.inferred)||focus;const mat=g.children[0].material;mat.color.set(c.color).multiplyScalar(hasBox&&!focus?.26:focus?1.55:1)}}
  for(const {f,mat,lens,light} of emitters){const c=color(f,0,time,state.play);mat.uniforms.tint.value.copy(c);mat.uniforms.gain.value=state.night?1:.62;lens.color.copy(c);
   const u=projector.entry(light)?.material.uniforms;if(u){u.tint.value.copy(c);u.gain.value=mat.uniforms.gain.value}}
 }
 function software(out,screen,night){if(pulseMesh.visible){const attr=pulseGeo.attributes.position;for(let i=0;i<attr.count;i++){const p=screen(new T.Vector3().fromBufferAttribute(attr,i));out.push({...p,z:p.z-.00001,c:"#fff1ac"})}}for(const f of faces){if(f.wiring&&(!wires.visible||!f.object.parent.visible))continue;const a=screen(f.a),b=screen(f.b),c=screen(f.c);if(a.z< -1||a.z>1)continue;
  const mat=f.material,fill=(night?f.night:f.day)??(mat.color||mat.uniforms.tint.value).getHexString();out.push({a,b,c,z:(a.z+b.z+c.z)/3,fill:"#"+fill,alpha:f.glow===null?1:f.glow*mat.uniforms.gain.value})}}
 function pick(ray){const hits=ray.intersectObjects(wires.visible?[props,wires,garden]:[props,garden],true);
  for(const hit of hits){if(!hit.object.visible||!hit.object.parent.visible)continue;for(let o=hit.object;o;o=o.parent){if(o.userData.entity)return {id:o.userData.entity,distance:hit.distance}}}return null}
 return {sync,update,software,pick,shadows:projector.shadows,overlay:projector.overlay,animated:()=>pulseMesh.visible,surfaces:()=>garden.children.flatMap(g=>g.children),dispose(){disposeGroup(props);disposeGroup(wires);disposeGroup(garden);for(const geo of cabinetCache.values())geo.dispose();cabinetCache.clear();cabinetMaterial.dispose();projector.dispose();pulseGeo.dispose();pulseMat.dispose();scene.remove(pulseMesh);cached.clear();scene.remove(props,wires,garden)}};
}

