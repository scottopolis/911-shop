// Turns the source Sketchfab arms-and-pistol GLB into a web-ready one: smaller
// WebP textures and meshopt-compressed geometry, its animation kept.
//
//   node scripts/build-pistol.mjs <source.glb> <output.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, reorder, quantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: build-pistol.mjs <source.glb> <output.glb>');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
await doc.transform(
  prune(),
  dedup(),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(out, doc);
