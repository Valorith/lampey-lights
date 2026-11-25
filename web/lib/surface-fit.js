import {Box3,Ray,Triangle,Vector3} from "three";
import {clearWindowTrim} from "./window-mounts.js";
const vec=a=>new Vector3(...a),up=new Vector3(0,1,0);
const gap=.028;
const build=tris=>{
 const box=new Box3();for(const t of tris)box.union(t.box);
 if(tris.length<14)return {box,tris};
 const size=box.getSize(new Vector3()),axis=size.x>=size.y&&size.x>=size.z?"x":size.y>=size.z?"y":"z";
 tris.sort((a,b)=>a.center[axis]-b.center[axis]);const mid=tris.length>>1;
 return {box,left:build(tris.slice(0,mid)),right:build(tris.slice(mid))};
};
export function propertySurface(meshes){
 const triangles=[],q=new Vector3(),hit=new Vector3();
 for(const mesh of meshes){
  if(!mesh.visible||mesh.userData.placement_surface===false)continue;
  const g=mesh.geometry,pos=g.attributes.position,index=g.index;
  const verts=Array.from({length:pos.count},(_,i)=>new Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld));
  for(let i=0;i<(index?.count||pos.count);i+=3){const [a,b,c]=[i,i+1,i+2].map(j=>verts[index?index.getX(j):j]);
   const tri=new Triangle(a,b,c),n=tri.getNormal(new Vector3());if(n.lengthSq()<.9)continue;
   triangles.push({tri,n,owner:mesh,box:new Box3().setFromPoints([a,b,c]),center:tri.getMidpoint(new Vector3())})
  }
 }
 const root=build(triangles);
 function nearby(p,r,fn,node=root){if(node.box.distanceToPoint(p)>r)return;
  if(node.tris){for(const t of node.tris)if(t.box.distanceToPoint(p)<=r)fn(t)}else{nearby(p,r,fn,node.left);nearby(p,r,fn,node.right)}}
 function nearest(p,r=.21){
  let best=null,score=r;nearby(p,r,t=>{const surface=t.tri.closestPointToPoint(p,new Vector3()),delta=p.clone().sub(surface);
   const distance=delta.length(),cost=distance+(delta.dot(t.n)<-.003?.07:0);
   if(cost<score){score=cost;best={normal:t.n,point:surface,distance}}
  });return best;
 }
 function cast(p,dir,far,front=true){
  const ray=new Ray(p,dir),result={distance:far,point:null,normal:null};
  function visit(node){if(!node.box.containsPoint(p)&&(!ray.intersectBox(node.box,q)||q.distanceToSquared(p)>result.distance**2))return;
   if(node.tris){for(const t of node.tris){if(front&&t.n.dot(dir)>-.025)continue;
    if(ray.intersectTriangle(t.tri.a,t.tri.b,t.tri.c,false,hit)){const d=hit.distanceTo(p);if(d<result.distance){result.distance=d;result.point=hit.clone();result.normal=t.n;result.owner=t.owner}}}
   }else{visit(node.left);visit(node.right)}
  }visit(root);return result.point?result:null;
 }
 function seat(p,normal,radius,reach=.32,capture=.15){
  const n=normal.clone().normalize(),start=p.clone().addScaledVector(n,reach);
  const h=cast(start,n.clone().negate(),reach+capture);if(!h)return p.clone();
  // Keep the entire circular cord outside even at an oblique crossing.
  const clearance=(gap+radius)/Math.max(.25,h.normal.dot(n));
  const rise=reach-h.distance+clearance;
  return p.clone().addScaledVector(n,Math.max(0,rise));
 }
 function footprint(point,normal,width,depth,verticalOffset=0){
  const p=vec(point),n=vec(normal).normalize(),wall=Math.abs(n.y)<.55;
  const u=wall?up.clone().cross(n).normalize():n.clone().cross(new Vector3(0,0,1)).normalize(),v=n.clone().cross(u).normalize();
  const center=p.clone().addScaledVector(v,verticalOffset);let top=0;
  function clip(poly,axis,limit){const result=[];for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],da=a.clone().sub(center).dot(axis)-limit,db=b.clone().sub(center).dot(axis)-limit;
   if(da<=0)result.push(a);if((da<0&&db>0)||(da>0&&db<0))result.push(a.clone().lerp(b,da/(da-db)))
  }return result}
  nearby(center,Math.hypot(width,depth,.37),t=>{
   if(t.n.dot(n)<.12)return;let poly=[t.tri.a,t.tri.b,t.tri.c];
   for(const [axis,r] of [[u,width],[u.clone().negate(),width],[v,depth],[v.clone().negate(),depth],[n,.37]])poly=clip(poly,axis,r);
   for(const q of poly)top=Math.max(top,q.clone().sub(p).dot(n)+gap)
  });return p.addScaledVector(n,top).toArray();
 }
 function support(point){const p=vec(point),found=nearest(p);return found?.normal.toArray()||null}
 function corner(a,b,na,nb){
  const cos=na.dot(nb);if(Math.abs(cos)>.96)return null;
  const mid=a.clone().lerp(b,.5),da=a.clone().sub(mid).dot(na),db=b.clone().sub(mid).dot(nb);
  return mid.addScaledVector(na,(da-db*cos)/(1-cos*cos)).addScaledVector(nb,(db-da*cos)/(1-cos*cos));
 }
 // Intersect a plane through the span with the actual triangles. Each interval
 // follows the outer envelope, including trim narrower than a regularly sampled path.
 function section(a,b,n,radius){
  const delta=b.clone().sub(a),tangent=delta.clone().addScaledVector(n,-delta.dot(n)),length=tangent.length();
  if(length<.03)return null;tangent.divideScalar(length);
  const sideways=new Vector3().crossVectors(tangent,n).normalize(),margin=gap+radius;
  const crossed=cast(a,delta.clone().normalize(),delta.length());
  const headroom=crossed?Math.max(.42,Math.min(12,delta.length()+.35)):.40;
  const box=new Box3().setFromPoints([a,b,a.clone().addScaledVector(n,headroom),b.clone().addScaledVector(n,headroom),a.clone().addScaledVector(n,-.18),b.clone().addScaledVector(n,-.18)]).expandByScalar(margin);
  const spans=[],stops=new Set([0,1]);
  function visit(node){
   if(!node.box.intersectsBox(box))return;if(!node.tris){visit(node.left);visit(node.right);return}
   for(const v of node.tris){const facing=v.n.dot(n);if(facing<.12||!box.intersectsBox(v.box))continue;
    const tri=v.tri,verts=[tri.a,tri.b,tri.c],ds=verts.map(p=>p.clone().sub(a).dot(sideways)),hits=[];
    for(let i=0;i<3;i++){const j=(i+1)%3;if(Math.abs(ds[i])<1e-7)hits.push(verts[i]);
     if(ds[i]*ds[j]<-1e-14)hits.push(verts[i].clone().lerp(verts[j],ds[i]/(ds[i]-ds[j])))}
    if(hits.length<2)continue;
    const samples=hits.map(p=>{const q=p.clone().sub(a),t=q.dot(tangent)/length;return {t,h:q.dot(n)-delta.dot(n)*t}}).sort((p,q)=>p.t-q.t);
    const first=samples[0],last=samples.at(-1),dt=last.t-first.t;if(dt<1e-8)continue;
    if(Math.min(first.h,last.h)>.40&&v.owner!==crossed?.owner)continue;
    if(Math.min(first.h,last.h)>headroom||Math.max(first.h,last.h)<-.18)continue;
    const lo=Math.max(0,first.t-margin/length),hi=Math.min(1,last.t+margin/length);if(hi<=lo)continue;
    const top=t=>first.h+(last.h-first.h)*Math.max(0,Math.min(1,(t-first.t)/dt))+margin/facing;
    spans.push({lo,hi,top});stops.add(lo);stops.add(hi);
    if(first.t>0&&first.t<1)stops.add(first.t);if(last.t>0&&last.t<1)stops.add(last.t);
   }
  }visit(root);
  const ts=[...stops].sort((u,v)=>u-v),out=[];
  for(let i=1;i<ts.length;i++){const l=ts[i-1],r=ts[i],mid=(l+r)/2;if(r-l<1e-9)continue;
   const covers=spans.filter(s=>s.lo<=mid&&s.hi>=mid);
   for(const t of [l,r]){let h=0;for(const s of covers)h=Math.max(h,s.top(t));out.push(a.clone().lerp(b,t).addScaledVector(n,h))}
  }return out;
 }
 function route(raw,{radius=0,normals=[],snap=true,window=false}={}){
  const points=raw.map(p=>vec(window?clearWindowTrim(p):p));if(points.length<2)return points.map(p=>p.toArray());
  const anchors=points.map((p,i)=>normals[i]?vec(normals[i]).normalize():nearest(p)?.normal||null);
  const out=[];
  function add(p){if(!out.length||out.at(-1).distanceToSquared(p)>1e-10)out.push(p)}
  function span(a,b,n,m){
   const dist=a.distanceTo(b);if(dist<.0001){add(a);return}
   if(n&&m&&n.dot(m)>.97){const contour=section(a,b,n,radius);if(contour){let best=contour;const length=pts=>pts.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(pts[i]),0);let cost=length(best);if(cost>dist+.75){const side=b.clone().sub(a).cross(n).normalize();for(const dir of [side,side.clone().negate()]){const alt=section(a,b,dir,radius);if(!alt||!alt.length)continue;const len=length(alt);if(len>=cost)continue;const safe=alt.every((p,i)=>{if(!i)return true;const delta=p.clone().sub(alt[i-1]),span=delta.length();return span<.0001||!cast(alt[i-1],delta.divideScalar(span),span)});if(safe){best=alt;cost=len}}}best.forEach(add);return}}
   const steps=Math.min(900,Math.max(1,Math.ceil(dist/.055)));
   for(let j=0;j<=steps;j++){const t=j/steps,p=a.clone().lerp(b,t);
    const near=nearest(p,.17+radius),dir=n&&m?n.clone().lerp(m,t).normalize():near?.normal||null;
    add(dir?seat(p,dir,radius):p)
   }
  }
  function join(a,b,n,m){
   if(!snap){add(a);add(b);return}
   if(n&&m&&n.dot(m)<.92){
    const mid=corner(a,b,n,m);
    if(mid&&mid.distanceTo(a)+mid.distanceTo(b)<a.distanceTo(b)*2.3+.2){
     const outward=n.clone().add(m).normalize();
     const edge=seat(mid,outward,radius,.4,.22);
     span(a,edge,n,n);span(edge,b,m,m);return;
    }
    if(n.dot(m)<-.92&&a.distanceTo(b)>1){
     const side=Math.abs(n.y)<.8?new Vector3().crossVectors(up,n).normalize():new Vector3(1,0,0);
     const center=a.clone().lerp(b,.5),choices=[side,side.clone().negate(),up].filter(v=>Math.abs(v.dot(n))<.8);
     let best=null;for(const direction of choices){
      const hit=cast(center.clone().addScaledVector(direction,65),direction.clone().negate(),65);
      if(!hit)continue;const face=hit.point.clone().addScaledVector(direction,radius+gap);
      const x=corner(a,face,n,direction),y=corner(b,face,m,direction);if(!x||!y)continue;
      const cost=a.distanceTo(x)+x.distanceTo(y)+y.distanceTo(b);
      if(!best||cost<best.cost)best={x,y,direction,cost}
     }if(best){span(a,best.x,n,n);span(best.x,best.y,best.direction,best.direction);span(best.y,b,m,m);return}
    }
   }
   span(a,b,n,m);
  }
  for(let i=1;i<points.length;i++)join(points[i-1],points[i],anchors[i-1],anchors[i]);
  // Remove collinear samples before making geometry. Corners and changes of grade stay.
  const clean=[];for(const p of out){
   if(clean.length>1){const a=clean.at(-2),b=clean.at(-1),ab=b.clone().sub(a),bp=p.clone().sub(b);
    if(ab.dot(bp)>=0&&ab.clone().cross(bp).length()<1e-6*(ab.length()+bp.length()))clean.pop()}
   clean.push(p)
  }
  function crosses(a,b){const delta=b.clone().sub(a),length=delta.length();if(length<.004)return null;
   delta.divideScalar(length);return cast(a.clone().addScaledVector(delta,.0015),delta,length-.003,false)}
  let obstructed=false;const verified=clean.length?[clean[0]]:[];
  for(let i=1;i<clean.length;i++){
   const a=clean[i-1],b=clean[i],hit=crosses(a,b);let detour=null,cost=Infinity;
   if(hit&&snap){const along=b.clone().sub(a).normalize(),side=along.clone().cross(up);
    const directions=[hit.normal,up,new Vector3(0,-1,0),side,side.clone().negate(),new Vector3(1,0,0),new Vector3(-1,0,0),new Vector3(0,0,1),new Vector3(0,0,-1)];
    for(const dir of directions){if(dir.lengthSq()<.01||Math.abs(along.dot(dir.clone().normalize()))>.97)continue;
     const candidate=section(a,b,dir.clone().normalize(),radius);if(!candidate?.length)continue;
     const pts=[a,...candidate,b];let length=0,good=true;
     for(let j=1;j<pts.length;j++){length+=pts[j].distanceTo(pts[j-1]);if(length>=cost||crosses(pts[j-1],pts[j])){good=false;break}}
     if(good){cost=length;detour=candidate}
    }
   }
   if(hit&&snap&&!detour)obstructed=true;
   if(detour)for(const p of detour)if(p.distanceToSquared(verified.at(-1))>1e-10)verified.push(p);
   if(b.distanceToSquared(verified.at(-1))>1e-10)verified.push(b);
  }
  const result=verified.map(p=>p.toArray());if(obstructed)result.obstructed=true;return result;
 }
 return {support,nearest,route,cast,seat,footprint};
}

