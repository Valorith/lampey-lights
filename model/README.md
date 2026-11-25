# Lampey property model

[Open the Blender scene](Lampey%20Lights.blend) or [load the standalone web model](Lampey%20Property.glb). The scene includes cameras for the [front](Front%20and%20driveway.png), [rear overview](Rear%20pool.png), [pool from the upper porch](Pool%20from%20upper%20porch.png) and [back stairs](Back%20stairs.png).

## Scale and coverage

The front porch deck footprint is 34 ft wide and 6 ft deep. The owner supplied a screenshot reporting these dimensions from an assessor sketch. The fascia overhang and corner posts have their own geometry. All other dimensions are estimates pending field measurements.

The main elevations were modeled from photographs. A local reference archive can add the front and driveway point cloud to the Blender scene for alignment checks.

The owner confirmed a rectangular pool. The four water corners visible in IMG_5177, IMG_5335 and IMG_5337 support an approximate 2:1 waterline. The model has narrow walks along the yard edge and cover-reel end, with more room for seating on the house and driveway sides. The blue liner, curved pool entry steps, handrails and roll-up cover are modeled separately from the water. IMG_5638 shows the white lattice below the covered porch. IMG_5678 and IMG_6026 show the charcoal stair treads and landing, white risers and posts, dark balusters and the white gate into the pool area. The stair run, landing footprint, pool size, elevation and house offsets are photo-based estimates. The chairs and sectional are grouped for easy seasonal removal.

IMG_5259 shows the driveway-side eave returning from the outside porch post to the house. The pool-facing views in IMG_4010 and IMG_5638 show the shallow covered-deck slope meeting the steeper gable over the windowed room. The lower roof is one continuous mesh with a white fascia across both sections. Its pitches and overhangs are estimated from the photographs.

The sliding glass door opens from the covered deck into the projecting back room. IMG_5259 shows its white frame and center rail along the stair approach. The opening width and its offset along the wall are photo estimates. Select **Back stairs** in the planner to face the doorway.

The lawn, retaining wall, driveway and evergreens provide context for placement. Detached structures and distant trees are outside this model.

## Web integration

The GLB uses meters and the standard glTF Y-up coordinate system. The origin is at the center of the main front wall at the front porch floor elevation. The front of the house faces positive Z in the GLB. The source Blender scene uses Z up.

Sixteen empty nodes have a stable `extras.mount_id` and a flat `extras.path_local_gltf_xyz` array. The `rear.addition.fascia` path follows the rear roof from the driveway corner over the gable to the far eave. Four paths follow the two handrails on each back stair flight. The driveway-side pool fence path starts at the gatepost so a light run can clear the opening. Read each successive triple as a local point in meters and transform it with the node's world transform. In Three.js, the extras are exposed in `Object3D.userData`. Save light runs against their mount IDs to keep seasonal designs independent of the property asset. The water mesh and movable furniture have `extras.placement_surface = false` so the editor can exclude them when picking mounting surfaces.

## Rebuilding

[build_property.py](build_property.py) generates the scene and the GLB using Blender 5.0.1. To include a locally held alignment ZIP, pass `-- --with-alignment`. Geometry inputs near the top set the porch dimensions and house proportions. Pass `-- --preview` to the script invocation to regenerate all four views. The saved scene uses CPU rendering with one render thread.
