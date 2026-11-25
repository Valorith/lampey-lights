# Lampey Lights

Lampey Lights is a Christmas light show planner built around a 3D model of a house and yard. Place fixtures on the property, assign them to Light-O-Rama controller outputs, and trace the cables between them.

![Front of the property and driveway](model/Front%20and%20driveway.png)

## The planner

- Draw strands along siding, window frames and rooflines, or aim an RGB flood at a surface.
- Place and resize trees and bushes, wrap their canopies, and hang lights between branches.
- Configure show computers, controllers and network connections. Select a controller to inspect its outputs and follow the cords through the scene.
- Save multiple designs, review channel assignments and export the patch list.

The [web application](web/) uses React, Three.js, Vinext and a D1 database. The [Blender sources](model/) include the editable scene, its generator, and rendered views. The public app includes sample historical channel assignments.

## Run locally

From the repository root, use Node.js 22.13 or newer and npm.

```sh
cd web
npm ci
node --test
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_flatman.sql
npm start -- --port 4173
```

Open `http://127.0.0.1:4173`. Run the database initialization once per fresh local database. For live editing, use `npm run dev`. The [web README](web/README.md) covers the development runtime and storage.

## Model changes

Edit [the Blender scene](model/Lampey%20Lights.blend) or regenerate it with [build_property.py](model/build_property.py). After updating the property, copy the exported GLB to `web/public/property.glb`, run `node scripts/extract-window-frames.mjs` from `web/`, and rerun the tests. The [model notes](model/README.md) describe scale, camera views and mounting paths.

## GitHub and ChatGPT Sites

This repository is the development source. The existing ChatGPT Sites app uses a separate publishing checkout. To release a reviewed change, apply its app diff from `web/` to the Sites checkout, preserve the site's hosting configuration and installation-specific patch data, and publish through Sites. A GitHub push on its own does not deploy a release.
