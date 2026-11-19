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
// The wheel's hub and the axis it turns about, pointing forward down the
// column; src/parts.js turns the wheel about the same axis.
const STEERING_HUB = [-2.058, 0.626, -0.34];
const STEERING_AXIS = [0.968, -0.25, 0];

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

  // The small black backings behind the dash screens and vents are cabin trim,
  // not body; as body they vanish with it in the interior view and leave holes.
  if (/invisible_all/.test(node) && max < 0.4 && x > -2.2 && x < -1.2 && y > 0.4 && az < 0.75) node = 'plastic_all';

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

  // The rear spoiler: the body-colored blade across the tail and the third
  // brake light on it.
  if (x < -4.15 && y > 0.74 && y < 0.82 && s[0] < 0.35 && s[2] > 0.4 && (isBody || /^reflectors/.test(node))) return 'spoiler';
  // The pedestal the blade stands on, which rises out of the tail, and the
  // black arms that lift it.
  if (isBody && x < -4.15 && y > 0.65 && y < 0.75 && s[0] < 0.4 && s[1] < 0.2 && s[2] > 1.2) return 'spoiler';
  if (/bl_pl_M_ext/.test(node) && x < -4.14 && y > 0.65 && y < 0.75 && max < 0.35) return 'spoiler';
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

  if (INTERIOR.test(node) && Math.hypot(x - STEERING[0], y - STEERING[1], z - STEERING[2]) < 0.22 && max < 0.45) {
    // The rim, spokes and paddles sit within 8 cm of the hub along the column;
    // the column shroud and stalks behind them stay put when the wheel turns.
    const along = [0, 1, 2].reduce((sum, k) => sum + (c[k] - STEERING_HUB[k]) * STEERING_AXIS[k], 0);
    return along < 0.08 ? 'steering_wheel' : 'dashboard';
  }
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

// The source has no luggage compartment under the front lid, only an empty
// space between the bumper, the wheel arch liners and the firewall. This builds
// a carpeted tub there, its rim just under the lid, with the warning-triangle
// case on its rear wall.
function addFrunk() {
  const FRONT = -0.44; // rim, just behind the bumper
  const REAR = -1.36; // rim, in front of the firewall
  const FLOOR = 0.12;
  // Height of the lid's underside along the car's center line.
  const LID = [[-0.3, 0.5], [-0.4, 0.55], [-0.5, 0.58], [-0.6, 0.62], [-0.7, 0.64], [-0.8, 0.67], [-0.9, 0.69], [-1.0, 0.71], [-1.1, 0.73], [-1.2, 0.74], [-1.4, 0.74]];
  const lid = (x) => {
    for (let i = 1; i < LID.length; i++) {
      const [x0, y0] = LID[i - 1];
      const [x1, y1] = LID[i];
      if (x >= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
    return LID[LID.length - 1][1];
  };
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // The rim narrows at the front, between the headlights.
  const halfWidth = (x) => 0.53 - 0.15 * smooth(-0.7, FRONT, x);
  const cx = (FRONT + REAR) / 2;
  const a = (FRONT - REAR) / 2;

  // A squarish rim loop, then rings that step down to the floor, shrinking
  // near the bottom so the walls round into the floor like a molded tub. The
  // first ring is a flange that tucks under the lid's edges.
  const N = 64;
  const RINGS = [-1, 0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 0.93, 1];
  const pos = [];
  const uv = [];
  const add = (x, y, z) => { pos.push(x, y, z); uv.push(z * 2, (x + y) * 2); };
  for (const t of RINGS) {
    const scale = t < 0 ? 1.06 : 1 - 0.14 * t ** 3;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      // Superellipse: flat sides with rounded corners.
      const x = cx + a * Math.sign(c) * Math.abs(c) ** (1 / 3);
      const z = halfWidth(x) * Math.sign(s) * Math.abs(s) ** (1 / 3);
      const rimY = lid(x) - 0.035 - 0.04 * (z / 0.53) ** 2;
      const y = t <= 0 ? rimY : rimY + (FLOOR - rimY) * t;
      add(cx + (x - cx) * scale, y, z * scale);
    }
  }
  const idx = [];
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let i = 0; i < N; i++) {
      const p = r * N + i;
      const q = r * N + ((i + 1) % N);
      idx.push(p, p + N, q, q, p + N, q + N);
    }
  }
  const center = pos.length / 3;
  add(cx, FLOOR, 0);
  const last = (RINGS.length - 1) * N;
  for (let i = 0; i < N; i++) idx.push(last + i, center, last + ((i + 1) % N));

  const rug = root.listMaterials().find((m) => m.getName() === 'rug_interior');
  const carpet = rug.clone().setName('frunk_carpet').setDoubleSided(true);
  partMesh('frunk').addPrimitive(primitive(pos, uv, idx, carpet));

  // A black surround closes the gap between the tub's flange and the edge of
  // the lid opening, then drops a skirt behind the fenders and bumper. The
  // opening's outline is the lid's own outline, seen from above: in each
  // direction from the tub's center, the lid's farthest point and how low its
  // edge comes there.
  const BINS = 180;
  const reach = new Float32Array(BINS);
  const edgeY = new Float32Array(BINS).fill(Infinity);
  const bin = (x, z) => Math.floor(((Math.atan2(z, x - cx) / (Math.PI * 2) + 1) % 1) * BINS);
  for (const prim of partNodes.get('hood').getMesh().listPrimitives()) {
    const p = prim.getAttribute('POSITION');
    for (let i = 0; i < p.getCount(); i++) {
      const [x, y, z] = p.getElement(i, []);
      const b = bin(x, z);
      const d = Math.hypot(x - cx, z);
      if (d > reach[b] + 0.01) edgeY[b] = y;
      else if (d > reach[b] - 0.01) edgeY[b] = Math.min(edgeY[b], y);
      reach[b] = Math.max(reach[b], d);
    }
  }
  const SKIRT = 0.12;
  const lp = [];
  const lu = [];
  const li = [];
  for (let i = 0; i < N; i++) {
    const [fx, fy, fz] = pos.slice(3 * i, 3 * i + 3); // flange ring
    const b = bin(fx, fz);
    const d = Math.hypot(fx - cx, fz);
    // Stop just inside the lid's edge, so the closed lid hides the seam.
    const r = Math.max(d, reach[b] - 0.015) / d;
    const ox = cx + (fx - cx) * r;
    const oz = fz * r;
    const oy = Math.min(fy, edgeY[b] - 0.012);
    for (const [x, y, z] of [[fx, fy, fz], [ox, oy, oz], [ox, oy - SKIRT, oz]]) {
      lp.push(x, y, z);
      lu.push(z * 2, x * 2);
    }
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (let k = 0; k < 2; k++) {
      const p = 3 * i + k;
      const q = 3 * j + k;
      li.push(p, p + 1, q, q, p + 1, q + 1);
    }
  }
  const plastic = doc.createMaterial('frunk_liner').setBaseColorFactor([0.02, 0.02, 0.022, 1]).setRoughnessFactor(0.7).setMetallicFactor(0).setDoubleSided(true);
  partMesh('frunk').addPrimitive(primitive(lp, lu, li, plastic));

  // Warning-triangle case, clipped to the rear wall.
  const black = doc.createMaterial('warning_case').setBaseColorFactor([0.02, 0.02, 0.022, 1]).setRoughnessFactor(0.45).setMetallicFactor(0).setDoubleSided(true);
  const [bx, by, bz] = [-1.3, 0.4, 0];
  const [hx, hy, hz] = [0.025, 0.025, 0.2];
  const bp = [];
  const bu = [];
  const bi = [];
  // Each face: its normal axis k and sign, as four corners.
  for (const [k, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const [u, v] = [0, 1, 2].filter((j) => j !== k);
    const base = bp.length / 3;
    for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[k] = sgn;
      p[u] = du;
      p[v] = dv * sgn;
      bp.push(bx + p[0] * hx, by + p[1] * hy, bz + p[2] * hz);
      bu.push(du, dv);
    }
    bi.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  partMesh('frunk').addPrimitive(primitive(bp, bu, bi, black));
}

// The source models the spoiler raised: the blade stands on a pedestal that
// rises out of the tail. The car shows it stowed, flush on the tail with its
// trailing edge just above the light bar. Squash every point toward the tail's
// surface, keeping STOWED_HEIGHT of its height above it, then fold it into the
// engine lid. That surface starts at the light bar's top edge, which sweeps
// forward toward the car's sides, and rises forward along the engine lid.
const LIGHT_BAR_TOP = 0.64;
const DECK_SLOPE = 0.38; // rise per meter forward of the light bar
const STOWED_HEIGHT = 0.25;
function stowSpoiler() {
  // The light bar's top edge, measured at |z| = 0 to 0.7.
  const edgeX = (z) => -4.44 + 0.24 * (Math.abs(z) / 0.7) ** 3;
  const floorAt = (x, z) => LIGHT_BAR_TOP + DECK_SLOPE * (x - edgeX(z));
  const spoiler = partNodes.get('spoiler');
  for (const prim of spoiler.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    for (let i = 0; i < pos.getCount(); i++) {
      const [x, y, z] = pos.getElement(i, []);
      const floor = floorAt(x, z);
      if (y > floor) pos.setElement(i, [x, floor + (y - floor) * STOWED_HEIGHT, z]);
    }
    partMesh('decklid').addPrimitive(prim);
  }
  spoiler.dispose();
  partNodes.delete('spoiler');
}

// A triangle primitive from flat arrays, with smooth normals.
function primitive(pos, uv, idx, material) {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => pos.slice(3 * i, 3 * i + 3));
    const e1 = [0, 1, 2].map((k) => b[k] - a[k]);
    const e2 = [0, 1, 2].map((k) => c[k] - a[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const i of [idx[t], idx[t + 1], idx[t + 2]]) for (let k = 0; k < 3; k++) nrm[3 * i + k] += n[k];
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
    for (let k = 0; k < 3; k++) nrm[i + k] /= l;
  }
  const acc = (type, array) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(array);
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv)))
    .setIndices(acc('SCALAR', new Uint32Array(idx)))
    .setMaterial(material);
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

addFrunk();
stowSpoiler();

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
