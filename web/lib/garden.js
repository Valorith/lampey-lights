export const species={deciduous:"Branching tree",evergreen:"Evergreen",shrub:"Bush"};
export const dressings={pendant:"Hanging snowflake",drop:"Vertical drop",hang:"Branch-to-branch strand",wrap:"Canopy spiral",net:"Canopy net",trunk:"Trunk wrap"};
export const branches=["Front","Front right","Right","Back right","Back","Back left","Left","Front left"];
const tau=2*Math.PI;
const round=p=>p.map(n=>Number(n.toFixed(4)));
export function newPlant(kind="deciduous"){return {id:crypto.randomUUID(),name:species[kind],kind,point:[0,0,0],height:kind==="shrub"?1:4,width:kind==="shrub"?1.6:3,rotation:0,visible:true}}
export function propertyPlants(){
 const scale=34*.3048/11.16,clamp=t=>Math.min(1,Math.max(0,t));
 const positions=[[-4.54,-2.96,.76,1.22],[-2.67,-2.94,.65,1.16],[2.75,-2.96,.68,1.06],[4.44,-2.98,.83,1.25],[-6.67,1.65,.75,2.25],[-6.77,5.45,.81,2.44],[11.15,-3.10,.98,3.75],[11.60,-.90,1.04,4.05],[11.39,1.32,1,3.95]];
 const planted=positions.map(([x,y,r,h],i)=>{
  const front=-1.28-.31*clamp((-y-4)/10),main=front+(-2.57-front)*clamp((y+.8)/10.8);
  const drive=-1.6-1.44*clamp((y+13)/13)+.44*clamp((y-8.7)/3.5);
  return {id:"property-plant-"+i,kind:i<4?"shrub":"evergreen",name:i<4?"Porch bush "+(i+1):i<6?"Chimney-side evergreen "+(i-3):"Driveway evergreen "+(i-5),point:round([x*scale,(main+(drive-main)*clamp((x-3)/2.55)-.035)*scale,-y*scale]),height:h*scale,width:2*r*scale,rotation:i*14,visible:true}
 });
 return [...planted,...[[-8.65,-1.46,9.9,7.6,5.1],[-6.45,-1.47,11.22,6.9,4.6]].map(([x,y,z,height,width],i)=>({id:"street-left-"+(i+1),name:"Left street tree "+(i+1),kind:"deciduous",point:[x,y,z],height,width,rotation:i*33,visible:true}))];
}
export function branchTip(p,index){
 const a=(index/8+(p.rotation||0)/360)*tau;
 const radius=p.width*.5*(index%2?.87:1),level=p.kind==="shrub"?.65:p.kind==="evergreen"?.49:.64;
 return [p.point[0]+Math.sin(a)*radius,p.point[1]+p.height*(level+(index%3)*.085),p.point[2]+Math.cos(a)*radius];
}
export function mountedFixture(f,plants){
 const p=plants.find(p=>p.id===f.plant);if(!p||!f.dressing)return f;
 const end=plants.find(p=>p.id===f.endPlant)||p,points=[];
 if(f.dressing==="pendant"||f.dressing==="drop"){
  const a=branchTip(p,f.branchA??0),center=[a[0],a[1]-(f.drop??.7),a[2]];
  points.push(round(a),round(center));
  if(f.dressing==="pendant"){const r=f.size*.24;for(let arm=0;arm<6;arm++){
   const angle=arm*tau/6,tip=[center[0]+Math.sin(angle)*r,center[1]+Math.cos(angle)*r,center[2]];
   points.push(round(tip),round(center))}}
 }else if(f.dressing==="hang"){
  const a=branchTip(p,f.branchA??0),b=branchTip(end,f.branchB??4);
  for(let i=0;i<=32;i++){const t=i/32,v=a.map((n,k)=>n+(b[k]-n)*t);v[1]-=4*t*(1-t)*(f.drop??.4);points.push(round(v))}
 }else{
  const turns=f.turns??5,isTrunk=f.dressing==="trunk",isNet=f.dressing==="net";
  const steps=isNet?140:Math.min(156,Math.max(48,turns*14));
  for(let i=0;i<=steps;i++){
   const t=i/steps,a=t*tau*turns+(p.rotation||0)*tau/360;
   const level=isTrunk?.04+t*(p.kind==="deciduous"?.41:.30):isNet?.14+.78*(.5-.5*Math.cos(t*tau*turns*2)):.12+.81*t;
   const radius=isTrunk?p.width*(.032-.012*t):p.width*.51*(p.kind==="evergreen"?1-level*.93:p.kind==="shrub"?Math.sqrt(Math.max(.02,1-((level-.5)/.54)**2)):Math.sin(Math.PI*(.10+.80*t))*.86);
   points.push(round([p.point[0]+Math.sin(a)*radius,p.point[1]+level*p.height,p.point[2]+Math.cos(a)*radius]));
  }
 }
 return {...f,mount:"",shape:"run",points};
}

