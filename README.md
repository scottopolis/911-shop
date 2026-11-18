# 911 Shop

An interactive 3D parts explorer for the Porsche 911 (992): orbit the car, explode its major parts, and click a part to see its name and details on a 3D callout.

```sh
npm install
npm run dev          # start the viewer
npm run build:model  # regenerate public/models/porsche-911.glb from source-models/
```

Part names, descriptions and explode directions live in `src/parts.js`. How the source model is split into parts is in `scripts/build-model.mjs`.
