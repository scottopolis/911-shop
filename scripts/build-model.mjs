// Turns the source Sketchfab GLB (meshes grouped by material) into a web-ready GLB
// whose top-level nodes are the car's major parts, so the viewer can explode them.
//
//   node scripts/build-model.mjs <source.glb> <output.glb>
//
// Each source mesh is split into connected islands. Every island is assigned to a
// part by `classify` below from its source node, its position and its size, in the
// car's world space: +x points forward (front bumper near x = 0, rear at x ≈ -4.56),
// +y up, +z to the car's right. Islands no rule claims stay in "body".
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  compactPrimitive, transformPrimitive, dedup, prune, reorder, quantize, textureCompress,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: build-model.mjs <source.glb> <output.glb>');

const WHEEL_X = { front: -1.04, rear: -3.49 };
const HUB_Y = 0.19;
const STEERING = [-2.05, 0.64, -0.34];

const INTERIOR = /leather|plastic_all|carbon|chrome_int|monitors|steering|logo_all|glossy_plastic|dynamics|reisin|black_metal|metal_parts/;
const SEAT = /leather_all|plast_leather_all|plastic_all|carbon_all|chrome_int|logo_all/;

function corner(c) {
  return `${c[0] > -2.3 ? 'f' : 'r'}${c[2] < 0 ? 'l' : 'r'}`;
}

// c: island center, s: island size, max: largest dimension, node: source node name.
function classify({ node, door, c, s, max }) {
  const [x, y, z] = c;
  const az = Math.abs(z);
  const side = z < 0 ? 'l' : 'r';
  const isBody = node.startsWith('body_all');

  if (door) return door === 'door_2' ? 'door_l' : 'door_r';

  const hubX = x > -2.3 ? WHEEL_X.front : WHEEL_X.rear;
  const hubDist = Math.hypot(x - hubX, y - HUB_Y);
  if (/^AO_tire|^wheel_rim/.test(node)) return `wheel_${corner(c)}`;
  if (/^discs|^brakes/.test(node)) return `brake_${corner(c)}`;
  if (/logo_all|metal_parts|black_metal/.test(node) && hubDist < 0.3 && az > 0.82 && max < 0.6) return `wheel_${corner(c)}`;

  if (/^rugs/.test(node)) return 'carpet';
  if (/^pipes/.test(node)) return 'exhaust';
  if (/black_metal|metal_parts/.test(node) && x < -4.3 && y < 0.3 && az > 0.25 && az < 0.55 && max < 0.25) return 'exhaust';

  // Porsche crest on the nose of the front lid.
  if (/logo_all/.test(node) && x > -0.3 && y > 0.44 && az < 0.1) return 'hood';
  if (isBody && y > 0.5 && x > -1.6 && s[2] > 1) return 'hood';
  if (isBody && x > -1.7 && az > 0.4 && s[0] > 1) return `fender_${side}`;
  if (isBody && y > 1.0) return 'roof';

  if (!isBody && x < -3.9 && y > 0.5 && y < 0.7 && s[1] < 0.15 && /red_light|trans_covers|glossy|reflectors|lights_pattern|logo_all/.test(node)) return 'taillight';
  if (x < -3.95 && y > 0.65 && az < 0.75 && (isBody || /bl_pl_M_ext|black_metal|plastic_exterior|service_black/.test(node))) return 'decklid';
  if (x < -3.7 && y < 0.5 && !/rugs|upholstery|belts/.test(node)) return 'rear_bumper';

  if (!isBody && x > -0.85 && x < -0.35 && y > 0.4 && y < 0.75 && az > 0.45 && az < 0.95 && max < 0.45) return `headlight_${side}`;
  if (x > -0.75 && y < 0.5 && !INTERIOR.test(node)) return 'front_bumper';
  if (x > -0.75 && y < 0.5 && /glossy|black_metal|reisin|logo_all/.test(node) && max > 0.02) return 'front_bumper';

  if (/^windows_main|^window_black/.test(node)) {
    if (x > -2.3) return 'windshield';
    if (x < -3.3 && az < 0.3) return 'rear_window';
  }

  if (INTERIOR.test(node) && Math.hypot(x - STEERING[0], y - STEERING[1], z - STEERING[2]) < 0.22 && max < 0.45) return 'steering_wheel';
  // PDK selector and its trim, on the console between the seats.
  if (INTERIOR.test(node) && x > -2.13 && x < -1.94 && az < 0.1 && y > 0.36 && y < 0.5 && max < 0.25) return 'shifter';
  if (SEAT.test(node) && x > -2.95 && x < -2.05 && az > 0.12 && az < 0.6 && y > 0.05 && y < 1.0 && max < 0.75) return `seat_${side}`;
  if (INTERIOR.test(node) && x > -2.95 && x < -2.1 && az < 0.12 && y > 0.15 && y < 0.7 && max < 0.8) return 'center_console';
  if (SEAT.test(node) && x > -3.65 && x < -2.95 && az < 0.6 && y > 0.1 && y < 0.95 && max < 1.0) return 'rear_seats';
  // Pieces of the dashboard that are their own parts; the rest stays in "dashboard".
  if (INTERIOR.test(node) && x > -2.25 && x < -1.85 && y > 0.93 && az < 0.25 && max < 0.35) return 'overhead_console';
  if (INTERIOR.test(node) && x > -1.7 && x < -1.55 && y > 0.74 && az < 0.06 && max < 0.1) return 'sport_chrono';
  if (INTERIOR.test(node) && x > -1.92 && x < -1.74 && y > 0.58 && y < 0.82 && z > -0.54 && z < -0.02 && max < 0.3) return 'instrument_cluster';
  if (INTERIOR.test(node) && x > -1.96 && x < -1.72 && y > 0.38 && y < 0.58 && az < 0.14 && max < 0.3) return 'center_stack';
  if (/^plast_leather/.test(node) && x > -1.9 && x < -1.65 && y < 0.6 && z > 0.15 && max < 0.55) return 'glovebox';
  if (INTERIOR.test(node) && x > -2.15 && x < -1.25 && y > 0.35 && az < 0.75 && max < 1.6) return 'dashboard';

  return 'body';
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
const doc = await io.read(src);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];

// The source ships with the left door swung open; give it the closed pose of the right door.
const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]));
nodeByName.get('door_2').setTranslation([0, 0, 0]).setRotation(nodeByName.get('door_1').getRotation());

function doorOf(n) {
  for (let p = n; p; p = p.getParentNode()) if (/^door_\d$/.test(p.getName())) return p.getName();
  return null;
}

function xf(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

// Returns, for every triangle of the primitive, the part it belongs to.
function partsPerTriangle(prim, matrix, ctx) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices();
  const nv = pos.getCount();
  const nt = (idx ? idx.getCount() : nv) / 3;
  const vi = (k) => (idx ? idx.getScalar(k) : k);

  // Weld coincident vertices so UV/normal seams do not split islands.
  const world = [];
  const rep = new Int32Array(nv);
  const seen = new Map();
  for (let i = 0; i < nv; i++) {
    const v = xf(matrix, pos.getElement(i, []));
    world.push(v);
    const key = v.map((a) => Math.round(a * 2000)).join(',');
    if (!seen.has(key)) seen.set(key, i);
    rep[i] = seen.get(key);
  }
  const parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let t = 0; t < nt; t++) {
    const a = find(rep[vi(3 * t)]);
    for (let j = 1; j < 3; j++) {
      const b = find(rep[vi(3 * t + j)]);
      if (a !== b) parent[b] = a;
    }
  }

  const islands = new Map();
  const triIsland = new Int32Array(nt);
  for (let t = 0; t < nt; t++) {
    const r = find(rep[vi(3 * t)]);
    triIsland[t] = r;
    let b = islands.get(r);
    if (!b) islands.set(r, (b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]));
    for (let j = 0; j < 3; j++) {
      const v = world[vi(3 * t + j)];
      for (let k = 0; k < 3; k++) {
        b[k] = Math.min(b[k], v[k]);
        b[k + 3] = Math.max(b[k + 3], v[k]);
      }
    }
  }
  const islandPart = new Map();
  for (const [r, b] of islands) {
    const c = [0, 1, 2].map((k) => (b[k] + b[k + 3]) / 2);
    const s = [0, 1, 2].map((k) => b[k + 3] - b[k]);
    islandPart.set(r, classify({ ...ctx, c, s, max: Math.max(...s) }));
  }
  return Array.from(triIsland, (r) => islandPart.get(r));
}

const scene = root.listScenes()[0];
const car = doc.createNode('car');
const partNodes = new Map();
function partMesh(id) {
  if (!partNodes.has(id)) {
    const mesh = doc.createMesh(id);
    const node = doc.createNode(id).setMesh(mesh);
    car.addChild(node);
    partNodes.set(id, node);
  }
  return partNodes.get(id).getMesh();
}

const sourceNodes = root.listNodes().filter((n) => n.getMesh());
const counts = {};
for (const n of sourceNodes) {
  const matrix = n.getWorldMatrix();
  const ctx = { node: n.getName(), door: doorOf(n) };
  for (const prim of n.getMesh().listPrimitives()) {
    const triParts = partsPerTriangle(prim, matrix, ctx);
    const idx = prim.getIndices();
    const byPart = new Map();
    triParts.forEach((p, t) => {
      if (!byPart.has(p)) byPart.set(p, []);
      for (let j = 0; j < 3; j++) byPart.get(p).push(idx ? idx.getScalar(3 * t + j) : 3 * t + j);
    });
    for (const [part, list] of byPart) {
      const indices = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(list));
      const piece = prim.clone().setIndices(indices);
      compactPrimitive(piece);
      transformPrimitive(piece, matrix);
      partMesh(part).addPrimitive(piece);
      counts[part] = (counts[part] || 0) + list.length / 3;
    }
  }
}

for (const child of scene.listChildren()) scene.removeChild(child);
scene.addChild(car);
for (const n of sourceNodes) n.dispose();

await doc.transform(
  prune(),
  dedup(),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [2048, 2048] }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(out, doc);

console.table(Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])));
