import {Vector3} from "three";
import {routeLength} from "./stage.js";
// Stored routes always use their own waypoints. Estimated controller leads may
// try an approach from the yard when a direct path meets the porch or roof.
export function fitCord(surface,raw,c,targetNormal){
 const options={radius:c.width/2,normals:c.normals};
 const original=surface.route(raw,options);if(!c.inferred||!original.obstructed)return original;
 const a=raw[0],b=raw.at(-1),out=targetNormal||surface.support(b)||[0,0,1],n=new Vector3(...out);n.y=0;
 if(n.lengthSq()<.01)n.set(0,0,1);n.normalize();
 const perpendicular=new Vector3(-n.z,0,n.x),candidates=[];
 for(const offset of [.4,1.4,2.8,4.2])for(const lateral of [0,.55,-.55]){
  const outside=new Vector3(...b).addScaledVector(n,offset).addScaledVector(perpendicular,lateral);
  const approach=new Vector3(...a).addScaledVector(n,offset);
  const outer=outside.toArray(),near=[outer[0],Math.max(a[1],-.9),outer[2]];
  candidates.push([a,approach.toArray(),near,outer,b]);
 }
 candidates.push([a,b]);
 let best=null,bestLength=Infinity;
 for(const candidate of candidates){if(routeLength(candidate)>=bestLength)continue;const path=surface.route(candidate,{radius:options.radius});if(path.obstructed)continue;
  const length=routeLength(path);if(length<bestLength){best=path;best.waypoints=candidate;bestLength=length}
 }return best||original;
}

