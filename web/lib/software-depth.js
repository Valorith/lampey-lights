// Index projected, opaque triangles by screen tile. Normalized device depth is
// affine in screen space. A centroid depth can misorder bulbs on a sloping face.
export function depthAtPoints(faces,width,height){
 const tile=32,cols=Math.max(1,Math.ceil(width/tile)),rows=Math.max(1,Math.ceil(height/tile));
 const bins=new Array(cols*rows);
 for(const f of faces){if(!f.a||(f.alpha??1)<.99)continue;
  const {a,b,c}=f,det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<.01)continue;
  const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x)/tile)),x1=Math.min(cols-1,Math.floor(Math.max(a.x,b.x,c.x)/tile));
  const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y)/tile)),y1=Math.min(rows-1,Math.floor(Math.max(a.y,b.y,c.y)/tile));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=y*cols+x;(bins[k]??=[]).push(f)}
 }
 return p=>{
  if(p.x<0||p.y<0||p.x>=width||p.y>=height||p.z< -1||p.z>1)return false;
  for(const {a,b,c} of bins[Math.floor(p.y/tile)*cols+Math.floor(p.x/tile)]||[]){
   const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
   const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/det;
   const v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/det,t=1-u-v;
   if(u>=0&&v>=0&&t>=0&&u*a.z+v*b.z+t*c.z<p.z-.000002)return false;
  }return true;
 };
}

