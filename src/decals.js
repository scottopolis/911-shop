import * as THREE from 'three';

// Flat decals mounted just in front of the car's surfaces. Frames are in car
// space, measured from the model: `center`, the direction the decal faces, and
// its width and height in meters.
//
// The model's screens are blank glass, so the PCM map and the two digital
// cluster displays are drawn on canvases. The front headrests get the Porsche
// crest pressed into the leather.
const SCREENS = [
  { part: 'dashboard', draw: drawMap, center: [-1.836, 0.651, 0.034], facing: [-1, 0.05, 0], size: [0.305, 0.108] },
  { part: 'instrument_cluster', live: true, draw: drawSpeedometer, center: [-1.8203, 0.6903, -0.4655], facing: [-0.9428, 0.0991, 0.3182], size: [0.19, 0.118] },
  { part: 'instrument_cluster', live: true, draw: drawBoost, center: [-1.8203, 0.6903, -0.2145], facing: [-0.9428, 0.0991, -0.3182], size: [0.19, 0.118] },
];
const CRESTS = [
  { part: 'seat_l', center: [-2.756, 0.86, -0.335], facing: [1, 0.05, 0], size: [0.056, 0.07] },
  { part: 'seat_r', center: [-2.756, 0.86, 0.335], facing: [1, 0.05, 0], size: [0.056, 0.07] },
];
const PX_PER_M = 3600;
const GAP = 0.004; // how far in front of the surface a decal floats

// Adds the decals to the car. `partObject(id)` returns a part's object, so a
// decal moves with its part when the part explodes or slides out. Returns a
// function that redraws the live cluster screens with new readings:
// { mph, boost, miles, gear }.
export function addDecals(car, partObject) {
  car.updateMatrixWorld(true);
  const live = [];
  for (const s of SCREENS) {
    const [w, h] = s.size;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * PX_PER_M);
    canvas.height = Math.round(h * PX_PER_M);
    s.draw(canvas.getContext('2d'), canvas.width, canvas.height, READY);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    if (s.live) live.push({ draw: s.draw, canvas, texture });
    // Unlit and not tone mapped, so the screens glow like displays.
    mount(car, partObject(s.part), s, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  }

  // The crest mask is white where the leather is pressed; it shows as a faint
  // satin sheen with a little relief, the way an embossed logo catches light.
  const mask = new THREE.TextureLoader().load('/textures/crest.png');
  mask.anisotropy = 8;
  const leather = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, roughness: 0.45, alphaMap: mask, bumpMap: mask, bumpScale: 2, transparent: true, depthWrite: false,
  });
  for (const c of CRESTS) mount(car, partObject(c.part), c, leather);

  return (readings) => {
    for (const { draw, canvas, texture } of live) {
      draw(canvas.getContext('2d'), canvas.width, canvas.height, readings);
      texture.needsUpdate = true;
    }
  };
}

// What the cluster shows parked, before the first update.
const READY = { mph: 0, boost: 0, miles: 8412, gear: '1' };

function mount(car, object, { part, center, facing, size }, material) {
  if (!object) return;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  mesh.userData.partId = part;
  // The plane faces +z; turn it to face out of the surface, upright.
  const normal = new THREE.Vector3(...facing).normalize();
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  mesh.position.set(...center).addScaledVector(normal, GAP);
  car.add(mesh);
  mesh.updateMatrixWorld(true);
  object.attach(mesh);
}

// A small deterministic random, so the map looks the same on every load.
function random(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Navigation: a city map with a route, the nav sidebar and a status bar.
function drawMap(g, w, h) {
  const rnd = random(911);
  g.fillStyle = '#e9e5f2';
  g.fillRect(0, 0, w, h);

  // City blocks between a slightly skewed street grid.
  g.save();
  g.translate(w * 0.55, h * 0.5);
  g.rotate(-0.32);
  g.translate(-w * 0.8, -h * 1.2);
  const cell = h / 7;
  for (let x = 0; x < w * 1.8; x += cell) {
    for (let y = 0; y < h * 2.6; y += cell * 0.8) {
      const r = rnd();
      g.fillStyle = r < 0.12 ? '#cfe8c6' : r < 0.55 ? '#d6cdea' : '#ddd6ee';
      g.fillRect(x + 5, y + 5, cell - 10, cell * 0.8 - 10);
    }
  }
  g.restore();

  // A river across the map.
  g.strokeStyle = '#a7d8f5';
  g.lineWidth = h * 0.11;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-20, h * 0.25);
  g.bezierCurveTo(w * 0.3, h * 0.05, w * 0.45, h * 0.75, w * 0.75, h * 0.6);
  g.bezierCurveTo(w * 0.9, h * 0.52, w, h * 0.7, w + 20, h * 0.65);
  g.stroke();

  // Main roads, yellow, over the white street grid.
  g.save();
  g.translate(w * 0.55, h * 0.5);
  g.rotate(-0.32);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  for (let i = -12; i <= 12; i++) {
    g.beginPath(); g.moveTo(i * cell - 2, -h * 2); g.lineTo(i * cell - 2, h * 2); g.stroke();
    g.beginPath(); g.moveTo(-w * 2, i * cell * 0.8 - 2); g.lineTo(w * 2, i * cell * 0.8 - 2); g.stroke();
  }
  g.strokeStyle = '#f6d36b';
  g.lineWidth = 13;
  for (const x of [-3, 2, 6]) { g.beginPath(); g.moveTo(x * cell - 2, -h * 2); g.lineTo(x * cell - 2, h * 2); g.stroke(); }
  for (const y of [-2, 2]) { g.beginPath(); g.moveTo(-w * 2, y * cell * 0.8 - 2); g.lineTo(w * 2, y * cell * 0.8 - 2); g.stroke(); }

  // The route, ending at a destination pin, from the car's arrow.
  g.strokeStyle = '#2f7cf6';
  g.lineWidth = 16;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, cell * 1.6 - 2);
  g.lineTo(2 * cell - 2, cell * 1.6 - 2);
  g.lineTo(2 * cell - 2, -cell * 1.6 - 2);
  g.lineTo(6 * cell - 2, -cell * 1.6 - 2);
  g.lineTo(6 * cell - 2, -cell * 3.2);
  g.stroke();
  g.fillStyle = '#e8453c';
  g.beginPath(); g.arc(6 * cell - 2, -cell * 3.2, 16, 0, Math.PI * 2); g.fill();
  g.restore();

  // The car's position arrow.
  g.save();
  g.translate(w * 0.55, h * 0.5);
  g.rotate(-0.32 + Math.PI / 2);
  g.fillStyle = '#1d4ed8';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, -26); g.lineTo(18, 20); g.lineTo(0, 10); g.lineTo(-18, 20); g.closePath();
  g.fill(); g.stroke();
  g.restore();

  // Nav sidebar with menu icons, top status bar, and the next-turn card.
  const bar = w * 0.07;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, bar, h);
  g.fillStyle = '#e8453c';
  g.fillRect(0, 0, bar, bar);
  g.fillStyle = '#1e293b';
  for (let i = 1; i < 6; i++) {
    g.beginPath(); g.arc(bar / 2, bar * (i + 0.5) * 1.05, bar * 0.18, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(15, 23, 42, 0.85)';
  g.fillRect(bar, 0, w - bar, h * 0.09);
  g.fillStyle = '#ffffff';
  g.font = `600 ${h * 0.055}px Helvetica, Arial, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText('10:42', bar + 20, h * 0.045);
  g.textAlign = 'right';
  g.fillText('72°F    LTE', w - 20, h * 0.045);
  g.textAlign = 'left';

  const card = [bar + 24, h * 0.66, w * 0.22, h * 0.28];
  g.fillStyle = 'rgba(15, 23, 42, 0.88)';
  g.fillRect(...card);
  g.fillStyle = '#ffffff';
  g.font = `700 ${h * 0.09}px Helvetica, Arial, sans-serif`;
  g.fillText('↱ 0.4 mi', card[0] + 20, card[1] + card[3] * 0.35);
  g.font = `500 ${h * 0.05}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#cbd5e1';
  g.fillText('Arrive 10:58 · 6.2 mi', card[0] + 20, card[1] + card[3] * 0.75);
}

// A round dial with white ticks and labels, its value arc, and a needle.
function dial(g, cx, cy, r, { max, step, value, arc }) {
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const angle = (v) => start + (v / max) * sweep;
  g.lineCap = 'round';
  g.strokeStyle = '#2a2f38';
  g.lineWidth = r * 0.06;
  g.beginPath(); g.arc(cx, cy, r, start, start + sweep); g.stroke();
  g.strokeStyle = arc;
  g.beginPath(); g.arc(cx, cy, r, start, angle(value)); g.stroke();
  g.fillStyle = '#e5e7eb';
  g.strokeStyle = '#e5e7eb';
  g.font = `500 ${r * 0.15}px Helvetica, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let v = 0; v <= max; v += step / 2) {
    const a = angle(v);
    const major = v % step === 0;
    g.lineWidth = major ? 4 : 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    g.lineTo(cx + Math.cos(a) * r * (major ? 0.74 : 0.8), cy + Math.sin(a) * r * (major ? 0.74 : 0.8));
    g.stroke();
    if (major) g.fillText(String(v), cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6);
  }
  const a = angle(value);
  g.strokeStyle = '#f97316';
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); g.stroke();
  g.fillStyle = '#111318';
  g.beginPath(); g.arc(cx, cy, r * 0.12, 0, Math.PI * 2); g.fill();
}

function displayBackground(g, w, h) {
  const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
  bg.addColorStop(0, '#1a1d24');
  bg.addColorStop(1, '#050608');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
}

// Left of the tach: the speedometer, with the digital speed and odometer.
function drawSpeedometer(g, w, h, { mph, miles, gear }) {
  displayBackground(g, w, h);
  dial(g, w * 0.6, h * 0.5, h * 0.4, { max: 200, step: 40, value: Math.min(mph, 200), arc: 'rgba(148, 163, 184, 0.7)' });
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `700 ${h * 0.12}px Helvetica, Arial, sans-serif`;
  g.fillText(String(Math.round(mph)), w * 0.6, h * 0.72);
  g.font = `500 ${h * 0.05}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#9ca3af';
  g.fillText('mph', w * 0.6, h * 0.8);
  g.textAlign = 'left';
  g.font = `500 ${h * 0.06}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#d1d5db';
  g.fillText('NORMAL', w * 0.06, h * 0.2);
  g.fillText(`${Math.floor(miles).toLocaleString('en-US').replace(',', ' ')} mi`, w * 0.06, h * 0.82);
  g.font = `700 ${h * 0.14}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#ffffff';
  g.fillText(gear, w * 0.06, h * 0.42);
  g.font = `500 ${h * 0.06}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#d1d5db';
  g.fillText('73°F', w * 0.06, h * 0.9);
}

// Right of the tach: boost pressure in orange, with range and trip data.
function drawBoost(g, w, h, { boost }) {
  displayBackground(g, w, h);
  dial(g, w * 0.4, h * 0.5, h * 0.4, { max: 2, step: 0.5, value: boost, arc: '#f97316' });
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `700 ${h * 0.1}px Helvetica, Arial, sans-serif`;
  g.fillText(boost.toFixed(1), w * 0.4, h * 0.72);
  g.font = `500 ${h * 0.05}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#9ca3af';
  g.fillText('bar', w * 0.4, h * 0.8);
  g.textAlign = 'right';
  g.font = `500 ${h * 0.06}px Helvetica, Arial, sans-serif`;
  g.fillStyle = '#d1d5db';
  g.fillText('134 mi', w * 0.94, h * 0.2);
  g.fillText('24.6 mpg', w * 0.94, h * 0.82);
  g.fillStyle = '#f97316';
  g.fillText('SPORT', w * 0.94, h * 0.9);
}
