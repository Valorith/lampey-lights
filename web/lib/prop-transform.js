import {mountedFixture} from "./garden.js";

// Strands and cables have individually mounted route points. Rigid props have one base.
export function sceneProp(design,id){
 if(!design||!id)return null;
 for(const group of ["plants","devices","fixtures"]){
  const row=design[group]?.find(r=>r.id===id);
  if(!row)continue;
  const point=group==="fixtures"?row.points[0]:row.point;
  if(!point||row.visible===false||(group==="fixtures"&&(row.shape==="run"||row.plant)))return null;
  return {group,row,point};
 }
 return null;
}

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function scaleProp({group,row},factor){
 if(row.locked||!Number.isFinite(factor)||factor<=0)return row;
 if(group==="plants"){
  const ratio=clamp(factor,Math.max(.2/row.height,.2/row.width),Math.min(22/row.height,16/row.width));
  return ratio===1?row:{...row,height:clamp(row.height*ratio,.2,22),width:clamp(row.width*ratio,.2,16)};
 }
 const device=group==="devices",key=device?"scale":"size",current=row[key]??1;
 const value=clamp(current*factor,device ? 0.25 : 0.1,device ? 4 : 20);
 return value===current?row:{...row,[key]:value};
}

export function moveProp({group,row},point,normal){
 if(row.locked)return row;
 if(group==="plants")return {...row,point};
 if(group==="devices")return {...row,point,normal};
 return {...row,points:[point],normal,mount:"",normals:undefined};
}

export function rotateProp({row},degrees){
 if(row.locked||!Number.isFinite(degrees)||degrees%360===0)return row;
 const rotation=((row.rotation??0)+degrees)%360;
 return {...row,rotation:rotation<0?rotation+360:rotation};
}

export function updateProp(design,group,row){
 const rows=design[group]||[],old=rows.find(r=>r.id===row.id);
 const next={...design,[group]:old?rows.map(r=>r===old?row:r):[...rows,row]};
 if(group==="plants"&&(!old||["point","height","width","rotation","kind"].some(key=>old[key]!==row[key]))){
  next.fixtures=design.fixtures.map(f=>f.plant===row.id||f.endPlant===row.id?mountedFixture(f,next.plants):f);
 }
 return next;
}
