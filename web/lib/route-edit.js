import {guideNormal} from "./window-mounts.js";

// Return a new route, leaving the saved coordinates untouched until the fit succeeds.
export function editRoutePoint(row, action, index, point, normal, lift = 0) {
 const cable = "kind" in row;
 const points = row.points.slice();
 const last = points.length - 1;
 const inserting = action === "insert";
 if (row.locked || !Number.isInteger(index) || index < 0 || index > last) return null;
 if (cable && ((!index && row.from) || (index === last && row.to && !inserting))) return null;
 if (inserting && (points.length >= 160 || !index)) return null;
 const closed = !cable && row.shape === "run" && last >= 3 &&
  points[0].every((n,k) => Math.abs(n - points[last][k]) < .00001);
 if (action === "remove" && points.length <= (closed ? 4 : 2)) return null;

 const guide = !cable && guideNormal(row.mount);
 const normals = points.map((_,i) => row.normals?.[i] || guide || null);
 if (action === "remove") {
  const at = closed && index === last ? 0 : index;
  points.splice(at,1);
  normals.splice(at,1);
  if (closed && at === 0) {
   points[points.length-1] = points[0];
   normals[normals.length-1] = normals[0];
  }
 } else {
  if (!point) return null;
  const target = cable && lift ? [point[0],point[1]+lift,point[2]] : point;
  const direction = cable && lift ? null : normal || null;
  points.splice(index,inserting ? 0 : 1,target);
  normals.splice(index,inserting ? 0 : 1,direction);
  if (closed && !inserting && (index === 0 || index === last)) {
   points[0] = points[last] = target;
   normals[0] = normals[last] = direction;
  }
 }
 if (cable) {
  const {inferred, ...saved} = row;
  return {...saved,points,normals};
 }
 return {...row,points,normals,normal:row.shape === "run" ? row.normal : normal,
  mount:"",plant:undefined,endPlant:undefined,dressing:undefined};
}
