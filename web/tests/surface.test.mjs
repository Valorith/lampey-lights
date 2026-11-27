import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {BoxGeometry,Mesh,Vector3} from "three";
import {sceneCables,cablePoints} from "../lib/stage.js";
import {fitCord} from "../lib/cord-route.js";
import {sample,showSchema,wirePoints,mounts} from "../lib/show.js";
import {windowOutlines,windowFrames,guideNormal,clearWindowTrim} from "../lib/window-mounts.js";
import {propertySurface} from "../lib/surface-fit.js";
import {depthAtPoints} from "../lib/software-depth.js";
import {createRouteGeometry} from "../lib/route-geometry.js";
import {patchCSV} from "../lib/patch-csv.js";
import {editRoutePoint} from "../lib/route-edit.js";
import {cordLabel, fixtureFootage, measuredLength, routeLength} from "../lib/stage.js";
const v=a=>new Vector3(...a);
function block(size,pos){const m=new Mesh(new BoxGeometry(...size));m.position.set(...pos);m.updateMatrixWorld();return m}
function sampled(path,fn){for(let i=1;i<path.length;i++){const a=v(path[i-1]),b=v(path[i]),num=Math.max(1,Math.ceil(a.distanceTo(b)/.017));for(let j=0;j<=num;j++)fn(a.clone().lerp(b,j/num))}}
const bytes=readFileSync(new URL("../public/property.glb",import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
scene.updateMatrixWorld(true);const meshes=[];scene.traverse(m=>{if(m.isMesh)meshes.push(m)});const actual=propertySurface(meshes);
test("editing a closed window keeps its seam and surface normals through save and reopen",()=>{
 const design=showSchema.parse(sample()), mount=windowFrames.find(f=>f.name==="Upper front window 1").id;
 const original={...design.fixtures[0],mount,points:windowOutlines[mount]};
 const point=original.points[0].map((x,i)=>i===1?x+.08:x), normal=guideNormal(mount);
 const moved=editRoutePoint(original,"move",0,point,normal);
 assert.deepEqual(moved.points.at(-1),point);
 assert.deepEqual(moved.normals,moved.points.map(()=>normal));
 assert.notDeepEqual(original.points[0],point);
 const inserted=editRoutePoint(moved,"insert",1,point.map((v,i)=>i===1?v+.1:v),normal);
 const removed=editRoutePoint(inserted,"remove",inserted.points.length-1);
 assert.deepEqual(removed.points[0],removed.points.at(-1));
 const saved=showSchema.parse(JSON.parse(JSON.stringify({...design,fixtures:[moved]})));
 const geometry=createRouteGeometry(actual), path=geometry.fixture(saved.fixtures[0]);
 assert.ok(measuredLength(path)>0);
 const frame=windowFrames.find(f=>f.id===mount);
 sampled(path,p=>assert.ok(p.z>=frame.max[2]+.026));
 assert.equal(fixtureFootage(saved.fixtures[0],saved,geometry)[0],(routeLength(path)/.3048).toFixed(1));
});
test("a blocked cord edit identifies its failing span and leaves the accepted path intact",()=>{
 const geometry=createRouteGeometry(propertySurface([block([4,4,4],[0,0,0])]));
 const design={devices:[],fixtures:[],cables:[]};
 const cord={id:"c",kind:"power",points:[[0,0,3],[1,0,3]],width:.04,style:"corners"};
 const savedLength=measuredLength(geometry.cable(cord,design));
 const candidate=editRoutePoint(cord,"move",1,[0,0,0],null);
 const path=geometry.cable(candidate,design);
 assert.ok(path.obstructed && path.blockedSegments.length);
 assert.equal(measuredLength(path),null);
 assert.equal(cordLabel(candidate,path),"Unmeasured");
 assert.equal(measuredLength(geometry.cable(cord,design)),savedLength);
 assert.equal(editRoutePoint({...cord,from:"d/box"},"move",0,[0,0,0],null),null);
});
test("curved lead footage and extra cord agree across the scene, export and saved designs",()=>{
 const design=showSchema.parse(sample()), geometry=createRouteGeometry(actual);
 const f=design.fixtures[0], estimated=geometry.cables(design).find(c=>c.to==="f/"+f.id);
 assert.equal(fixtureFootage(f,design,geometry)[4],"Estimated");
 const saved=geometry.editableCable(estimated,design);
 const next={...design,cables:[{...saved,style:"hanging",slackFt:2.5}]};
 const reopened=showSchema.parse(JSON.parse(JSON.stringify(next)));
 const cable=reopened.cables[0], path=geometry.cable(cable,reopened);
 const ft=routeLength(path)/.3048;
 assert.ok(ft>0 && !path.obstructed);
 assert.deepEqual(fixtureFootage(reopened.fixtures[0],reopened,geometry).slice(1),
  [ft.toFixed(1),"2.5",(ft+2.5).toFixed(1),"Traced"]);
 const [head,first]=patchCSV(reopened,geometry).split("\r\n");
 assert.ok(head.includes('"Lead route (ft)","Extra cord (ft)","Total lead cord (ft)"'));
 assert.ok(first.endsWith('"'+ft.toFixed(1)+'","2.5","'+(ft+2.5).toFixed(1)+'","Traced"'));
 assert.equal(cordLabel(cable,path),ft.toFixed(1)+" ft + 2.5 ft extra = "+(ft+2.5).toFixed(1)+" ft");
 assert.equal(fixtureFootage({...f,points:[],device:""},design,geometry)[0],"");
});
test("legacy glass-depth red window run clears the shipped sill from front and oblique views",()=>{
 const f=windowFrames.find(f=>f.name==="Upper front window 1"),glass=f.paneMax[2],sill=f.max[2];
 assert.ok(sill-glass>.045);
 const old=windowOutlines[f.id].map(([x,y])=>[x,y,glass+.012]);const path=actual.route(old,{window:true});
 for(const eye of [[-4,3.9,12],[-.5,3.9,9],[-9,3.9,9]])sampled(path,p=>{
  assert.ok(p.z>=sill+.027);const target=p.clone().sub(v(eye));const obstruction=actual.cast(v(eye),target.clone().normalize(),target.length()-.002);assert.equal(obstruction,null)
 });
 assert.ok(actual.cast(new Vector3(-4,4,-14),new Vector3(0,0,1),14)); // rear wall still occludes the front
 assert.equal(windowFrames.length,25);
 for(const f of windowFrames)for(const p of windowOutlines[f.id])assert.ok((p[f.axis]-(f.sign===1?f.max:f.min)[f.axis])*f.sign>.03);
 const aerial=[0,7,9];assert.deepEqual(clearWindowTrim(aerial),aerial);
});
test("a thick cord follows adjoining walls around an outside corner and around opposite walls",()=>{
 const hull=block([4,4,4],[0,0,0]),surface=propertySurface([hull]),r=.07;
 for(const [b,n] of [[[2.045,0,0],[1,0,0]],[[0,0,-2.045],[0,0,-1]]]){
  const path=surface.route([[0,0,2.045],b],{radius:r,normals:[[0,0,1],n]});
  assert.ok(path.length>=3);
  sampled(path,p=>{const ext=[Math.max(0,Math.abs(p.x)-2),Math.max(0,Math.abs(p.y)-2),Math.max(0,Math.abs(p.z)-2)];assert.ok(Math.hypot(...ext)>=r-.002,"cord penetrated corner at "+p.toArray())});
 }
});
test("narrow proud trim and an inside corner retain outside clearance",()=>{
 const wall=block([8,5,.2],[0,2,0]),trim=block([.013,4,.2],[.173,2,.18]),side=block([.2,5,3],[2,2,1.5]),surface=propertySurface([wall,trim,side]);
 const path=surface.route([[-2,2,.14],[1.5,2,.14]],{radius:.045,normals:[[0,0,1],[0,0,1]]});
 sampled(path,p=>{if(Math.abs(p.x-.173)<.0065)assert.ok(p.z>.325)});
 const bend=surface.route([[1,2,.145],[1.855,2,1]],{radius:.045,normals:[[0,0,1],[-1,0,0]]});
 sampled(bend,p=>{assert.ok(p.z>=.144);assert.ok(p.x<=1.856)});assert.ok(bend.length>=3);
 const seated=surface.footprint([0,2,.14],[0,0,1],.4,.3);assert.ok(seated[2]>.28);
});
test("a strand and full-width cord bend over the real roof ridge",()=>{
 const above=new Vector3(0,1,0),down=above.clone().negate();
 const start=actual.cast(new Vector3(0,14,-.9),down,16),end=actual.cast(new Vector3(0,14,-6.9),down,16);
 assert.ok(start.normal.dot(end.normal)<.92);
 for(const radius of [0,.09]){const points=[start,end].map(h=>h.point.clone().addScaledVector(h.normal,.045).toArray());
  const route=actual.route(points,{radius,normals:[start.normal.toArray(),end.normal.toArray()]});assert.ok(route.length>2);
  sampled(route,p=>{const roof=actual.cast(new Vector3(p.x,14,p.z),down,16);
   assert.ok(p.clone().sub(roof.point).dot(roof.normal)>=radius-.002,"ridge crossed at "+p.toArray())});
 }
});
test("both porch railing strands stay on the rails when passing tall supporting posts",()=>{
 for(const mount of ["porch.rail.left","porch.rail.right"]){
  const anchors=mounts[mount],path=actual.route(anchors,{normals:anchors.map(()=>guideNormal(mount))});
  for(const p of path){assert.ok(Math.abs(p[1]-anchors[0][1])<.09);assert.ok(Math.abs(p[2]-anchors[0][2])<.22)}
 }
});
test("every sample controller output has a collision-checked estimated lead",()=>{
 const design=showSchema.parse(sample());for(const d of design.devices){d.normal=actual.support(d.point);if(d.normal)d.point=actual.footprint(d.point,d.normal,.41,.3)}
 for(const c of sceneCables(design)){
  const f=design.fixtures.find(f=>"f/"+f.id===c.to),n=guideNormal(f.mount),raw=cablePoints(c,design);
  const path=wirePoints(f);raw[raw.length-1]=f.shape==="run"?actual.route(path,{normals:n?path.map(()=>n):[],window:true})[0]:path[0];
  const fitted=fitCord(actual,raw,c,n);assert.ok(fitted.length>=2&&!fitted.obstructed,c.name)
 }
});
test("perspective triangle depth is evaluated at the bulb pixel",()=>{
 const visible=depthAtPoints([{a:{x:0,y:0,z:.2},b:{x:100,y:0,z:.9},c:{x:0,y:100,z:.2}}],101,101);
 assert.ok(visible({x:85,y:4,z:.77}));assert.equal(visible({x:2,y:4,z:.25}),false);
});

