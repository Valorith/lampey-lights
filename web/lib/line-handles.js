// Grab dots for reshaping a wire or strand in the scene.
// "point" dots sit on stored waypoints and move them; "insert" dots sit on the
// fitted route between two waypoints and add a bend there when dragged.
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

function project(point,path,cum,from){
 let best={s:cum[from]??0,d:Infinity,seg:from};
 for(let i=Math.max(1,from);i<path.length;i++){
  const a=path[i-1],b=path[i],ab=b.map((v,k)=>v-a[k]),l=ab[0]**2+ab[1]**2+ab[2]**2;
  const t=l?Math.max(0,Math.min(1,((point[0]-a[0])*ab[0]+(point[1]-a[1])*ab[1]+(point[2]-a[2])*ab[2])/l)):0;
  const q=a.map((v,k)=>v+ab[k]*t),d=dist(point,q);
  if(d<best.d-1e-9)best={s:cum[i-1]+(cum[i]-cum[i-1])*t,d,seg:i};
 }
 return best;
}

export function pointAt(path,cum,s){
 if(path.length<2)return path[0];
 let i=1;while(i<path.length-1&&cum[i]<s)i++;
 const span=cum[i]-cum[i-1]||1,t=Math.max(0,Math.min(1,(s-cum[i-1])/span));
 return path[i-1].map((v,k)=>v+(path[i][k]-v)*t);
}

/**
 * @param waypoints stored route points, in order
 * @param path fitted route the scene draws (falls back to the waypoints)
 * @param fixed indices that cannot move, such as ends plugged into equipment
 * @param insertable whether new bends may be added
 */
export function lineHandles(waypoints,path,{fixed=[],insertable=true,spacing=1.1,maxPerSpan=10,limit=160}={}){
 const handles=waypoints.map((point,index)=>({kind:"point",index,point,fixed:fixed.includes(index)}));
 if(!insertable||waypoints.length<2||waypoints.length>=limit)return handles;
 const route=path?.length>1&&!path.obstructed?path:waypoints;
 const cum=[0];for(let i=1;i<route.length;i++)cum.push(cum[i-1]+dist(route[i],route[i-1]));
 // Walk forward so a route that doubles back still maps each waypoint to its own stretch.
 let seg=1;const along=waypoints.map(p=>{const hit=project(p,route,cum,seg);seg=hit.seg;return hit.s});
 for(let i=1;i<waypoints.length;i++){
  const a=along[i-1],b=along[i],length=b-a;
  if(length<.12){if(dist(waypoints[i-1],waypoints[i])>.12)handles.push({kind:"insert",index:i,point:waypoints[i-1].map((v,k)=>(v+waypoints[i][k])/2)});continue}
  const n=Math.max(1,Math.min(maxPerSpan,Math.floor(length/spacing)));
  for(let k=1;k<=n;k++)handles.push({kind:"insert",index:i,point:pointAt(route,cum,a+length*k/(n+1))});
 }
 return handles;
}
