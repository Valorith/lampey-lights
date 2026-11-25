import frames from "./window-frames.json" with {type:"json"};
// Distance from the outermost trim. Coordinates and tolerances here are in meters.
const clearance=.035;
export const windowFrames=frames;
const plane=frame=>(frame.sign===1?frame.max:frame.min)[frame.axis];
function outline(frame){
 const axis=frame.axis,u=axis===2?0:2,z=plane(frame)+frame.sign*clearance;
 const a=frame.paneMin[u]-.033,b=frame.paneMax[u]+.033,base=frame.paneMin[1]-.034,top=frame.paneMax[1]+.034;
 return [[a,base],[a,top],[b,top],[b,base],[a,base]].map(([v,y])=>axis===2?[v,y,z]:[z,y,v]);
}
export const windowOutlines=Object.fromEntries(frames.map(f=>[f.id,outline(f)]));
export function guideNormal(mount){
 const frame=frames.find(f=>f.id===mount);if(frame){const normal=[0,0,0];normal[frame.axis]=frame.sign;return normal}
 if(/^(porch[.]|front[.]|dormer[.])/.test(mount))return [0,0,1];
 if(/^(garage[.]|pool[.]fence[.]driveway)/.test(mount))return [1,0,0];
 if(/^(rear[.]|pool[.]fence[.]back)/.test(mount))return [0,0,-1];
 if(mount==="pool.fence.chimney-side")return [-1,0,0];return null;
}
export const windowNames=Object.fromEntries(frames.map(f=>[f.id,f.name]));
// Only adjust bulbs in the shallow volume occupied by this opening. Free-space
// spans, plant-mounted strings and genuinely occluding walls remain independent.
export function clearWindowTrim(point){
 for(const f of frames){
  const axis=f.axis,u=2-axis,outside=(point[axis]-plane(f))*f.sign;
  if(point[u]<f.min[u]-.035||point[u]>f.max[u]+.035||point[1]<f.min[1]-.035||point[1]>f.max[1]+.035||outside>=clearance||outside<-.18)continue;
  const next=[...point];next[axis]=plane(f)+f.sign*clearance;return next;
 }return point;
}

