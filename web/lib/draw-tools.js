// Geometry for the strand drawing tools. Points are [x, y, z] in metres; nothing here touches the renderer.
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const size=a=>Math.hypot(a[0],a[1],a[2]);
const unit=a=>{const l=size(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};
const move=(p,...terms)=>{const out=[...p];for(let i=0;i<terms.length;i+=2)for(let k=0;k<3;k++)out[k]+=terms[i][k]*terms[i+1];return out};
const round=p=>p.map(n=>Number(n.toFixed(4)));

export const drawTools={
 feature:{name:"Trace feature",hint:"Click a roofline, window or rail to trace it"},
 path:{name:"Path",hint:"Click to add points · double-click or Enter to finish"},
 line:{name:"Line",hint:"Click two points, or drag"},
 rect:{name:"Rectangle",hint:"Click two corners, or drag · Shift for a square"},
 circle:{name:"Circle",hint:"Click the centre then the edge, or drag"},
 arc:{name:"Arch",hint:"Click both ends of the arch, or drag"},
 swag:{name:"Swag",hint:"Click both ends of the swag, or drag"},
 free:{name:"Freehand",hint:"Drag to sketch along the surface"}
};
export const dragTools=["line","rect","circle","arc","swag","free"];
export const toolDefaults={drapes:3,sag:.3,rise:.5,snap:true};
export const spacings=[0,1,2,3,4,6,8,12,18,24];

// Axes of the surface under the cursor: u runs level along it, v runs up it, n points out of it.
export function planeBasis(normal,right=[1,0,0]){
 const n=unit(normal);let u=cross([0,1,0],n);
 if(size(u)<.15){u=sub(right,n.map(c=>c*dot(right,n)));if(size(u)<.01)u=[1,0,0]}
 u=unit(u);return {u,v:unit(cross(n,u)),n};
}
// Compass angle that turns a flat prop to face out of a wall; null on the ground or a roof.
export function wallYaw(normal){
 if(!normal||Math.abs(normal[1])>=.55)return null;
 return Math.round(Math.atan2(normal[0],normal[2])*180/Math.PI);
}
export const pathLength=p=>p.slice(1).reduce((total,v,i)=>total+size(sub(v,p[i])),0);
// Lamps needed to cover a run at a spacing given in inches.
export function lightCount(length,inches){
 if(!inches)return null;
 return Math.max(2,Math.min(2048,Math.round(length/(inches*.0254))+1));
}
// Evenly spaced positions along a polyline.
export function along(points,count){
 if(points.length<2||count<1)return points.slice(0,1);
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+size(sub(points[i],points[i-1])));
 const total=lengths.at(-1),out=[];let s=1;
 for(let i=0;i<count;i++){const t=total*i/Math.max(1,count-1);while(s<points.length-1&&lengths[s]<t)s++;
  const span=lengths[s]-lengths[s-1]||1,k=(t-lengths[s-1])/span;out.push(points[s-1].map((v,j)=>v+(points[s][j]-v)*k))}
 return out;
}
export function nearestOnPath(point,points){
 let best={distance:Infinity,point:points[0],index:0};
 for(let i=1;i<points.length;i++){const a=points[i-1],ab=sub(points[i],a),l=dot(ab,ab);
  const t=l?Math.max(0,Math.min(1,dot(sub(point,a),ab)/l)):0,q=move(a,ab,t),distance=size(sub(point,q));
  if(distance<best.distance)best={distance,point:q,index:i-1}}
 return best;
}
// Indices kept by Ramer–Douglas–Peucker, so a matching list of normals can be thinned the same way.
export function simplify(points,tolerance=.035,limit=120){
 if(points.length<3)return points.map((_,i)=>i);
 const keep=new Set([0,points.length-1]);
 (function split(lo,hi){
  let worst=0,index=-1;const a=points[lo],ab=sub(points[hi],a),l=size(ab);
  for(let i=lo+1;i<hi;i++){const d=l?size(cross(sub(points[i],a),ab))/l:size(sub(points[i],a));if(d>worst){worst=d;index=i}}
  if(worst>tolerance){keep.add(index);split(lo,index);split(index,hi)}
 })(0,points.length-1);
 const kept=[...keep].sort((a,b)=>a-b);
 return kept.length>limit?simplify(points,tolerance*1.6,limit):kept;
}
// Where the second click lands relative to the first, measured on the first click's surface.
export function measure(a,b,normal,right){
 const basis=planeBasis(normal,right),d=sub(b,a),du=dot(d,basis.u),dv=dot(d,basis.v);
 return {basis,du,dv,flat:move(a,basis.u,du,basis.v,dv)};
}
// The strand a two-click tool lays between its first point a and the cursor b.
export function shapePath(tool,a,b,normal,opts={}){
 const {basis,du,dv,flat}=measure(a,b,normal,opts.right),{u,v,n}=basis;
 if(tool==="line")return [round(a),round(b)];
 if(tool==="rect"){
  let w=du,h=dv;if(opts.square){const side=Math.max(Math.abs(w),Math.abs(h));w=Math.sign(w||1)*side;h=Math.sign(h||1)*side}
  if(Math.abs(w)<.01||Math.abs(h)<.01)return [];
  return [a,move(a,u,w),move(a,u,w,v,h),move(a,v,h),a].map(round);
 }
 if(tool==="circle"){
  const r=Math.hypot(du,dv);if(r<.02)return [];
  const steps=Math.max(16,Math.min(48,Math.round(2*Math.PI*r/.2)));
  return Array.from({length:steps+1},(_,i)=>{const t=Math.PI/2-2*Math.PI*i/steps;return round(move(a,u,r*Math.cos(t),v,r*Math.sin(t)))});
 }
 const chord=sub(flat,a),span=size(chord);if(span<.02)return [];
 const along=unit(chord);let out=cross(n,along);
 // Bow an arch upward and let a swag hang; on level ground "up" is away from the viewer's right.
 const lift=dot(out,v);if(Math.abs(lift)>.02?lift<0:dot(out,u)<0)out=out.map(c=>-c);
 if(tool==="arc"){
  const rise=Math.max(.02,(opts.rise??toolDefaults.rise)*span),radius=(span*span/4+rise*rise)/(2*rise),half=2*Math.atan(2*rise/span);
  const centre=move(a,chord,.5,out,rise-radius),steps=2*Math.max(6,Math.min(20,Math.round(radius*half/.15)));
  return Array.from({length:steps+1},(_,i)=>{const t=-half+2*half*i/steps;return round(move(centre,along,radius*Math.sin(t),out,radius*Math.cos(t)))});
 }
 if(tool==="swag"){
  const drapes=Math.max(1,Math.min(24,Math.round(opts.drapes??toolDefaults.drapes))),sag=opts.sag??toolDefaults.sag;
  const steps=Math.max(4,Math.min(12,Math.floor(156/drapes))),points=[round(a)];
  for(let d=0;d<drapes;d++)for(let i=1;i<=steps;i++){const t=i/steps,k=(d+t)/drapes;points.push(round(move(a,chord,k,out,-4*t*(1-t)*sag)))}
  return points;
 }
 return [];
}
// Readout for the live preview, in the same feet the rest of the planner uses.
export function describe(tool,points,a,b,normal,right){
 const feet=m=>(m/.3048).toFixed(1);
 if(points.length<2)return "";
 if(tool==="rect"&&a&&b){const {du,dv}=measure(a,b,normal,right);return feet(Math.abs(du))+" × "+feet(Math.abs(dv))+" ft"}
 if(tool==="circle"&&a&&b){const {du,dv}=measure(a,b,normal,right);return "⌀ "+feet(2*Math.hypot(du,dv))+" ft"}
 return feet(pathLength(points))+" ft";
}
// Next free name in a series: "Pixel strand", "Pixel strand 2", …
export function seriesName(base,names){
 const used=new Set(names);if(!used.has(base))return base;
 for(let n=2;;n++){
  const suffix=" "+n,next=base.slice(0,160-suffix.length)+suffix;
  if(!used.has(next))return next;
 }
}
