import * as T from "three";

// Meshes that receive and block flood light: the property and garden plants.
export const LIGHT_LAYER=1;
const SIZE=1024;

const depthMaterial=()=>new T.MeshBasicMaterial({colorWrite:false,side:T.DoubleSide});

// Per-pixel flood footprint: each flood renders a depth map from its lens, then the
// lit surfaces are drawn again with an additive pass that tests against that map.
function projectorMaterial(){
 return new T.ShaderMaterial({
  uniforms:{tint:{value:new T.Color()},gain:{value:1},origin:{value:new T.Vector3()},axis:{value:new T.Vector3()},width:{value:.4},reach:{value:9},
   cosOuter:{value:.9},lightMatrix:{value:new T.Matrix4()},depthMap:{value:null},near:{value:.1},far:{value:9},texel:{value:1/SIZE}},
  side:T.DoubleSide,transparent:true,depthWrite:false,depthFunc:T.LessEqualDepth,blending:T.AdditiveBlending,
  polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,
  vertexShader:`varying vec3 wpos;varying vec3 wnormal;
void main(){vec4 w=modelMatrix*vec4(position,1.);wpos=w.xyz;wnormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`#include <packing>
uniform vec3 tint,origin,axis;uniform float gain,width,reach,cosOuter,near,far,texel;uniform mat4 lightMatrix;uniform sampler2D depthMap;
varying vec3 wpos;varying vec3 wnormal;
float lit(vec3 p){vec4 lp=lightMatrix*vec4(p,1.);vec2 uv=lp.xy/lp.w*.5+.5;float sum=0.;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float stored=-perspectiveDepthToViewZ(texture2D(depthMap,uv+vec2(x,y)*texel).r,near,far);sum+=step(lp.w,stored+.012+lp.w*.002);}
 return sum/9.;}
void main(){
 vec3 d=wpos-origin;float dist=length(d);vec3 dir=d/dist;float c=dot(dir,axis);
 if(c<cosOuter||dist>reach||dist<.085)discard;
 vec3 n=normalize(wnormal);if(!gl_FrontFacing)n=-n;float facing=smoothstep(0.,.18,dot(n,-dir));
 if(facing<=0.)discard;
 float r=clamp(sqrt(max(0.,1.-c*c))/c/width,0.,1.);
 float weight=pow(1.-r*r,.85)*min(1.,(reach-dist)/max(.35,reach*.28))*.9;
 float shade=lit(wpos+n*(.012+dist*.003));
 if(shade<=0.)discard;
 gl_FragColor=vec4(tint,weight*facing*shade*gain);
 #include <colorspace_fragment>
}`
 });
}

export function floodProjector(){
 const entries=new Map(),depth=depthMaterial(),lightCam=new T.PerspectiveCamera(),viewCam=new T.PerspectiveCamera();
 lightCam.layers.set(LIGHT_LAYER);viewCam.layers.set(LIGHT_LAYER);
 let active=[];
 // floods: [{key,origin,axis,spread,reach}]; reuses depth maps whose key is unchanged.
 function sync(floods){
  const next=new Map();active=[];
  for(const f of floods){
   let e=entries.get(f.key);
   if(!e){e={target:new T.WebGLRenderTarget(SIZE,SIZE,{depthTexture:new T.DepthTexture(SIZE,SIZE),depthBuffer:true}),material:projectorMaterial(),matrix:new T.Matrix4(),dirty:true};
    e.target.depthTexture.minFilter=e.target.depthTexture.magFilter=T.NearestFilter}
   const half=T.MathUtils.degToRad(f.spread/2),u=e.material.uniforms;
   u.origin.value.copy(f.origin);u.axis.value.copy(f.axis);u.width.value=Math.tan(half);u.reach.value=f.reach;u.cosOuter.value=Math.cos(half);
   u.near.value=.06;u.far.value=f.reach+.5;u.depthMap.value=e.target.depthTexture;
   e.fov=Math.min(170,f.spread+6);
   next.set(f.key,e);active.push(e);
  }
  for(const [key,e] of entries)if(!next.has(key)){e.target.dispose();e.material.dispose()}
  entries.clear();for(const [k,e] of next)entries.set(k,e);
 }
 function invalidate(){for(const e of entries.values())e.dirty=true}
 function shadows(gl,scene){
  const dirty=active.filter(e=>e.dirty);if(!dirty.length)return;
  const prior=gl.getRenderTarget(),override=scene.overrideMaterial,bg=scene.background;scene.overrideMaterial=depth;scene.background=null;
  for(const e of dirty){const u=e.material.uniforms,axis=u.axis.value;
   lightCam.fov=e.fov;lightCam.aspect=1;lightCam.near=u.near.value;lightCam.far=u.far.value;lightCam.position.copy(u.origin.value);
   lightCam.up.set(0,1,0);if(Math.abs(axis.y)>.98)lightCam.up.set(0,0,1);
   lightCam.lookAt(u.origin.value.clone().add(axis));lightCam.updateProjectionMatrix();lightCam.updateMatrixWorld();
   u.lightMatrix.value.multiplyMatrices(lightCam.projectionMatrix,lightCam.matrixWorldInverse);
   u.texel.value=1/SIZE;
   gl.setRenderTarget(e.target);gl.clear();gl.render(scene,lightCam);e.dirty=false}
  scene.overrideMaterial=override;scene.background=bg;gl.setRenderTarget(prior);
 }
 // Call after the main render so the overlay depth-tests against the drawn scene.
 function overlay(gl,scene,cam){
  if(!active.length)return;
  viewCam.copy(cam);viewCam.layers.set(LIGHT_LAYER);
  const auto=gl.autoClear,override=scene.overrideMaterial,bg=scene.background;gl.autoClear=false;scene.background=null;
  for(const e of active){const u=e.material.uniforms;if(u.gain.value<=0||u.tint.value.getHex()===0)continue;scene.overrideMaterial=e.material;gl.render(scene,viewCam)}
  scene.overrideMaterial=override;scene.background=bg;gl.autoClear=auto;
 }
 function dispose(){for(const e of entries.values()){e.target.dispose();e.material.dispose()}entries.clear();active=[];depth.dispose()}
 return {sync,invalidate,shadows,overlay,entry:key=>entries.get(key),dispose};
}
