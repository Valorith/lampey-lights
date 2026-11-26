import * as T from "three";
import {branchTip} from "../lib/garden.js";

const tau = 2 * Math.PI;
const point = (x, y, z) => new T.Vector3(x, y, z);
const polar = (angle, radius, height) => point(Math.sin(angle)*radius, height, Math.cos(angle)*radius);
const between = (a, b, t) => a.clone().lerp(b,t);

// Build one colored mesh per planting. All coordinates are relative to its canopy
// width and height, so rotation and resizing use the same frame as the light mounts.
export function plantMesh(plant, coarse = false) {
 const vertices = [], colors = [];
 let seed = 2166136261;
 for (const ch of plant.id) seed = Math.imul(seed ^ ch.charCodeAt(0),16777619);
 function random() { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; }
 const pigments = new Map();
 function facet(a,b,c,hex,light=1) {
  if (!pigments.has(hex)) pigments.set(hex,new T.Color(hex));
  const color = pigments.get(hex);
  for (const v of [a,b,c]) {
   vertices.push(v.x,v.y,v.z);
   colors.push(color.r*light,color.g*light,color.b*light);
  }
 }
 function limb(a,b,r,s,bark,sides=coarse?3:5) {
  const axis = b.clone().sub(a).normalize();
  const u = axis.clone().cross(Math.abs(axis.z)<.9?point(0,0,1):point(1,0,0)).normalize();
  const v = axis.clone().cross(u);
  const ring = Array.from({length:sides},(_,i)=>u.clone().multiplyScalar(Math.cos(i*tau/sides)).addScaledVector(v,Math.sin(i*tau/sides)));
  for (let i=0;i<sides;i++) {
   const j=(i+1)%sides, shade=.76+.22*random();
   const a0=a.clone().addScaledVector(ring[i],r), a1=a.clone().addScaledVector(ring[j],r);
   const b0=b.clone().addScaledVector(ring[i],s), b1=b.clone().addScaledVector(ring[j],s);
   facet(a0,a1,b0,bark,shade); facet(a1,b1,b0,bark,shade);
  }
 }
 // Folded sprays catch light on either side of the midrib. Serrations break up
 // the silhouette without an alpha texture, even on the software renderer.
 function spray(start,end,side,width,color,teeth) {
  const ridge=between(start,end,.43); ridge.y+=width*.30;
  for (const sign of [-1,1]) {
   let last=start;
   for (let i=1;i<=teeth;i++) {
    const t=i/(teeth+1);
    const leaf=between(start,end,t).addScaledVector(side,sign*width*Math.sin(Math.PI*t)**.7);
    leaf.y-=width*.20;
    const notch=between(start,end,t+.25/(teeth+1)).lerp(leaf,.52);
    facet(ridge,last,leaf,color,.86+.23*random()); facet(ridge,leaf,notch,color); last=notch;
   }
   facet(ridge,last,end,color);
  }
 }
 const {kind}=plant, birch=kind==="birch", berry=kind==="winterberry", cedar=kind==="cedar";
 const conifer=kind==="evergreen"||cedar;
 const bark=birch?"#d9d6be":berry?"#835b43":conifer?"#75604a":"#746152";
 const origin=point(0,0,0);
 const template={...plant,point:[0,0,0],width:1,height:1,rotation:0};
 const anchor=i=>point(...branchTip(template,i));
 function fruit(v) {
  const r=.012+random()*.009;
  const ends=[point(v.x,v.y+r*.74,v.z),point(v.x,v.y-r*.74,v.z)];
  const rim=Array.from({length:4},(_,i)=>polar(i*tau/4,r,v.y).add(point(v.x,0,v.z)));
  for(let i=0;i<4;i++){facet(ends[0],rim[i],rim[(i+1)%4],"#cf433c");facet(rim[(i+1)%4],rim[i],ends[1],"#922b32");}
 }
 if(conifer) {
  limb(origin,point(0,1,0),.031,.001,bark);
  const palette=cedar?["#426442","#577847","#64844b","#789452"]:["#385f53","#477361","#548376","#679388"];
  for(let i=0;i<8;i++){
   const tip=anchor(i),start=point(0,tip.y-(cedar?.12:.02),0),side=polar(i*tau/8+Math.PI/2,1,0);
   limb(start,tip,.012,.002,bark);
   for(let j=1;j<=4;j++){
    const base=between(start,tip,j/5),end=between(base,tip,.44);
    for(const sign of [-1,1])spray(base,end.clone().addScaledVector(side,sign*.055),side,.033,palette[i%4],coarse?1:2);
   }
  }
  const tiers=coarse?6:11, count=coarse?5:10;
  for(let j=0;j<tiers;j++) {
   const t=j/tiers, y=.10+t*.88;
   const radius=cedar?.47*Math.sqrt(Math.max(.01,1-((y-.43)/.59)**2)):.49*(1-t)**.78;
   for(let i=0;i<count;i++) {
    const angle=(i+.55*random())*tau/count+j*2.4;
    const length=radius*(.88+.12*random()), side=polar(angle+Math.PI/2,1,0);
    const start=polar(angle,length*.04,y), knee=polar(angle,length*.42,y+(cedar?.05:-.025));
    const end=polar(angle,length,y+(cedar?.13*(1-t):-.055*(1-t)));
    const color=palette[(j+i)%palette.length];
    limb(start,knee,.008*(1-t)+.002,.003,bark,3);
    spray(knee,end,side,length*.23,color,coarse?1:3);
    for(let k=1;k<=(coarse?2:4);k++) {
     const s=k/(coarse?3:5), branch=between(knee,end,s);
     for(const sign of [-1,1]){
      const tip=between(knee,end,Math.min(1,s+.21)).addScaledVector(side,sign*length*.34*(1-.7*s));
      tip.y+=cedar?.08*(1-t):-.024*(1-s);
      spray(branch,tip,side,length*.135*(1-s*.6),color,coarse?1:2);
     }
    }
   }
  }
 } else if(kind==="shrub") {
  const leaves=["#526b37","#638046","#78904c","#819b57","#46663b"];
  for(let i=0;i<8;i++) limb(origin,anchor(i),.021,.002,bark);
  const count=coarse?54:155;
  for(let i=0;i<count;i++) {
   const a=i*2.39996, y=(i+.5)/count, r=.45*Math.sqrt(Math.max(0,1-((y-.50)/.52)**2))*(.92+.08*random());
   const center=polar(a,r,.06+y*.86), span=coarse?.12:.081, crown=center.clone();crown.y+=span*.95;
   const rim=Array.from({length:6},(_,j)=>center.clone().add(polar(a+j*tau/6,span*(.76+.35*random()),(random()-.6)*span*.65)));
   for(let j=0;j<6;j++) {
    const color=leaves[(i+j%2)%leaves.length];
    facet(crown,rim[j],rim[(j+1)%6],color,.72+.28*y);
    if(!coarse&&j%2===0)spray(rim[j],rim[j].clone().add(polar(a+j,.049,.045)),polar(a+j+1.57,1,0),.018,color,1);
   }
  }
 } else {
  const stems=birch?3:berry?5:1;
  const joints=[];
  for(let i=0;i<stems;i++){
   const a=i*tau/stems+.4, start=polar(a,i?.055:0,0),h=i?(.77+random()*.17):1;
   const shoulder=polar(a,i?.145:.012,h*(berry?.25:.42)),crown=polar(a,i?.28:.035,h);
   limb(start,shoulder,berry?.012:.034,berry?.010:.024,bark); limb(shoulder,crown,berry?.010:.026,.002,bark);
   joints.push({start,shoulder,crown});
   if(birch&&!coarse)for(let j=1;j<14;j++){
    const t=j/15, c=between(start,shoulder,t),r=.034-.01*t;
    const angle=j*2.4;
    facet(c.clone().add(polar(angle,r*1.02,0)),c.clone().add(polar(angle+.9,r*1.02,.006)),c.clone().add(polar(angle+1.9,r*1.02,.002)),"#665e55");
   }
  }
  const arms=coarse?10:18;
  for(let i=0;i<arms;i++){
   const a=i*tau/8+(i>=8?.36:0);
   const end=i<8?anchor(i):polar(a,.22+random()*.18,.72+.24*random());
   const stem=joints[i%stems];
   const root=i<8?between(stem.start,stem.shoulder,.72+.28*random()):between(stem.shoulder,stem.crown,.25+.51*random());
   const bend=between(root,end,.46);
   bend.y-=.045; bend.x+=(random()-.5)*.10;
   limb(root,bend,berry?.013:.020,.011,bark); limb(bend,end,.012,.0025,bark);
   const forks=coarse?3:6;
   for(let j=0;j<forks;j++){
    const t=(j+.5)/forks, fork=between(bend,end,t), angle=a+(j%2?1:-1)*(.48+random()*.68);
    const tip=fork.clone().add(polar(angle,.06+.07*(1-t),Math.min(1-fork.y,.07+.09*random())));
    limb(fork,tip,.006*(1-t*.4),.0016,bark,coarse?3:4);
    for(let k=0;k<(coarse?1:3);k++){
     const twig=between(fork,tip,.35+k*.22), top=twig.clone().add(polar(angle+(k%2?1:-1)*.9,.038,.045));
     limb(twig,top,.003,.0007,birch?"#80756a":bark,3);
     if(berry){fruit(top);if(!coarse)fruit(between(twig,top,.45));}
    }
   }
  }
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute("position",new T.Float32BufferAttribute(vertices,3));
 geometry.setAttribute("color",new T.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals(); geometry.computeBoundingSphere();
 const group=new T.Group();
 group.add(new T.Mesh(geometry,new T.MeshStandardMaterial({vertexColors:true,side:T.DoubleSide,roughness:.92})));
 group.position.fromArray(plant.point); group.scale.set(plant.width,plant.height,plant.width);
 group.rotation.y=T.MathUtils.degToRad(plant.rotation);group.userData.entity=plant.id;
 group.updateMatrixWorld(true);
 return group;
}
