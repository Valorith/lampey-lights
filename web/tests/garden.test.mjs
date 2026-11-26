import test from "node:test";
import assert from "node:assert/strict";
import {Vector3} from "three";
import {plantCatalog,newPlant,branchTip,mountedFixture} from "../lib/garden.js";
import {defaultFixture,sample,showSchema} from "../lib/show.js";
import {plantMesh} from "../components/plant-mesh.js";

test("every catalog model supports saved, rotated branch mounts in both renderers",()=>{
 for(const kind of Object.keys(plantCatalog)){
  const plant={...newPlant(kind),point:[-3,-1,7],rotation:73};
  const fixture=mountedFixture({...defaultFixture(),plant:plant.id,dressing:"drop",branchA:3,drop:.4},[plant]);
  const saved=showSchema.parse({...sample(),plants:[plant],fixtures:[fixture]});
  assert.equal(saved.plants[0].kind,kind);
  const tip=new Vector3(...branchTip(plant,3));
  assert.ok(tip.distanceTo(new Vector3(...fixture.points[0]))<.0001);
  for(const coarse of [false,true]){
   const group=plantMesh(plant,coarse),mesh=group.children[0],geometry=mesh.geometry;
   const position=geometry.attributes.position;
   assert.equal(geometry.attributes.color.count,position.count);
   assert.ok(position.count/3<(coarse?1600:12500));
   let closest=Infinity;
   const vertex=new Vector3();
   for(let i=0;i<position.count;i++){
    vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    closest=Math.min(closest,vertex.distanceTo(tip));
   }
   assert.ok(closest<.04,kind+" branch misses its hanging mount");
   geometry.dispose();mesh.material.dispose();
  }
 }
});
