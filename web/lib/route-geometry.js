import {Vector3} from "three";
import {cabinets} from "./controller-layout.js";
import {fitCord} from "./cord-route.js";
import {guideNormal} from "./window-mounts.js";
import {wirePoints} from "./show.js";
import {cablePoints, floodScale, routedPoints, sceneCables} from "./stage.js";

const vec = point => new Vector3(...point);

export function createRouteGeometry(fitted) {
 const poses = new WeakMap();
 const strandFits = new WeakMap();
 const cordFits = new WeakMap();
 const wireLists = new WeakMap();
 const recentCords = new Map();

 function placeBodies(design) {
  if (!fitted || !design) return design;
  if (poses.has(design)) return poses.get(design);
  const devices=design.devices.map(d=>{if(!d.point)return d;const normal=d.normal||fitted.support(d.point);if(!normal)return d;
   const scale=d.scale??1,wall=Math.abs(normal[1])<.55;
   const spec=cabinets[d.model];
   if(spec){
    const span=wall?(spec.height+spec.drop)/2:spec.depth*.62;
    const center=wall?(spec.style==="mini"?1:-1)*spec.drop/2:-spec.depth/2;
    return {...d,normal,point:fitted.footprint(d.point,normal,spec.width*.90*scale,span*scale,center*scale,d.rotation)};
   }
   return {...d,normal,point:fitted.footprint(d.point,normal,.41*scale,(wall?.38:.3)*scale,wall?.29*scale:0,d.rotation)}});
  const fixtures=design.fixtures.map(f=>{if(f.shape==="run"||!f.points.length||f.plant)return f;
   const normal=f.normal||fitted.support(f.points[0]);if(!normal)return f;const points=f.shape==="flood"?[fitted.footprint(f.points[0],normal,.22*floodScale(f),.22*floodScale(f),0,f.rotation)]:f.points;
   return {...f,normal,points}});
  const posed = {...design, devices, fixtures};
  poses.set(design, posed);
  poses.set(posed, posed);
  return posed;
 }
 function cables(design) {
  const posed = placeBodies(design);
  if (!wireLists.has(posed)) {
   const wires = sceneCables(posed);
   const ids = new Set(wires.map(c => c.id));
   for (const id of recentCords.keys()) if (!ids.has(id)) recentCords.delete(id);
   wireLists.set(posed,wires);
  }
  return wireLists.get(posed);
 }
 function fixture(f) {
  if (strandFits.has(f)) return strandFits.get(f);
  const raw = wirePoints(f);
  let path = raw;
  if (fitted && raw.length && !f.plant) {
   if (f.shape === "run") {
    const normal = guideNormal(f.mount);
    path = fitted.route(raw, {normals: normal ? raw.map(() => normal) : f.normals, window:true});
   } else if (f.normal && f.shape !== "flood") {
    const n = vec(f.normal), anchor = vec(f.points[0]);
    const min = Math.min(...raw.map(p => vec(p).sub(anchor).dot(n)));
    path = raw.map(p => fitted.seat(vec(p).addScaledVector(n, Math.max(0,.026-min)), n, 0).toArray());
   }
  }
  strandFits.set(f, path);
  return path;
 }

 function cable(c, design) {
  const posed = placeBodies(design);
  if (!cordFits.has(posed)) cordFits.set(posed, new WeakMap());
  const cache = cordFits.get(posed);
  if (cache.has(c)) return cache.get(c);
  const raw = cablePoints(c, posed);
  let targetNormal = null;
  for (const [key,index] of [[c.from,0],[c.to,raw.length-1]]) {
   if (!key?.startsWith("f/") || !raw.length) continue;
   const f = posed.fixtures.find(f => "f/"+f.id === key);
   if (!f?.points.length) continue;
   const path = fixture(f);
   if (!path.obstructed && path.length) {
    raw[index] = path[0];
    targetNormal = guideNormal(f.mount) || f.normal || f.normals?.[0];
   }
  }
  const key = JSON.stringify([raw,targetNormal,c.attachment,c.style,c.sag,c.width,c.normals,!!c.inferred]);
  const previous = recentCords.get(c.id);
  if (previous?.key === key) {
   cache.set(c,previous.path);
   return previous.path;
  }
  let path;
  if (!fitted || c.attachment === "free") {
   path = routedPoints(raw,c.style,c.sag);
  } else {
   const fittedPath = fitCord(fitted,raw,c,targetNormal);
   path = fittedPath.obstructed ? fittedPath : styleWire(c,fittedPath);
   if (c.inferred) path.waypoints = fittedPath.waypoints || raw;
  }
  recentCords.set(c.id,{key,path});
  cache.set(c, path);
  return path;
 }
 function clearSegments(points) {
  for (let i=1; i<points.length; i++) {
   const a=vec(points[i-1]), delta=vec(points[i]).sub(a), distance=delta.length();
   if (distance > .003 && fitted.cast(a,delta.divideScalar(distance),distance-.001,false)) return false;
  }
  return true;
 }
 function styleWire(c,path){
  if(c.style==="hanging"){const drape=[];for(let i=1;i<path.length;i++){
   const run=routedPoints([path[i-1],path[i]],"hanging",c.sag);
   for(let j=i===1?0:1;j<run.length;j++){const t=j/(run.length-1),straight=path[i-1][1]*(1-t)+path[i][1]*t;
    drape.push(fitted.seat(vec(run[j]),new Vector3(0,1,0),c.width/2,Math.max(.08,straight-run[j][1]+.10),.08).toArray())}
  }
   // A hanging curve can enter trim even when its straight supports clear it.
   return clearSegments(drape) ? drape : path;
  }
  if(c.style!=="smooth")return path;
  const curve=routedPoints(path,"smooth"),r=c.width/2+.012;
  for(let i=1;i<curve.length;i++){
   const a=vec(curve[i-1]),b=vec(curve[i]),v=b.clone().sub(a),length=v.length();
   if(length>.0001&&(fitted.cast(a,v.divideScalar(length),length)||fitted.nearest(b,r)))return path;
  }return curve;
 }
 function editableCable(c,design) {
  if (!c.inferred) return c;
  const {inferred,...saved} = c;
  return {...saved,points:cable(c,design).waypoints || c.points};
 }
 return {placeBodies, fixture, cable, cables, editableCable};
}
