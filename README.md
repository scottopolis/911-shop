# 911 Shop

An interactive 3D parts explorer for the Porsche 911 Turbo S (992) in Chalk: orbit the car, explode its major parts, and click a part to see its name and details on a 3D callout. The Interior button moves the exterior out of the way so you can pick cabin parts such as the steering wheel, PDK selector, dashboard and seats.

```sh
npm install
npm run dev          # start the viewer
npm run build:model  # regenerate public/models/porsche-911.glb from source-models/
npm run shop:links   # refresh src/shop-links.json from Shopify's Global Catalog
```

Part names, descriptions and explode directions live in `src/parts.js`. How the source model is split into parts is in `scripts/build-model.mjs`.

Each part's label lists up to three listings for it, or an aftermarket equivalent, from any Shopify store. `scripts/find-shop-links.mjs` finds them with the Shopify Global Catalog's `search_catalog` tool, using each part's `shop` query in `src/parts.js`.
