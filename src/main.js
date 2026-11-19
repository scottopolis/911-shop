import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PARTS } from './parts.js';
import { addDecals } from './decals.js';

// Porsche Chalk, a light neutral grey; darker than the real swatch because the studio
// lighting and tone mapping brighten it.
const CHALK = new THREE.Color('#7f817e');
// Guards Red seatbelts, in place of the model's green ones.
const BELT_RED = new THREE.Color('#a10d16');
// In the interior view every exterior part flies this far out along its explode
// direction and fades away, and the body shell fades to a ghost of itself.
const AWAY_DISTANCE = 3.5;
const GHOST_OPACITY = 0.1;
// Emissive tints are linear and add to every material, so keep them faint.
const HOVER_COLOR = new THREE.Color(0x3b82f6).multiplyScalar(0.015);
// The steering wheel turns up to 1.25 turns each way, about the real car's lock.
const MAX_STEER = Math.PI * 2.5;
// When a door or the front lid opens, the lights blink twice: on for FLASH_ON
// seconds, off as long, then on again.
const FLASH_ON = 0.18;
const FLASH_BLINKS = 2;
// The materials that light up in each lamp, and their color when lit.
const LAMPS = {
  headlight_l: new THREE.Color(1, 0.96, 0.9),
  headlight_r: new THREE.Color(1, 0.96, 0.9),
  taillight: new THREE.Color(1, 0.02, 0.02),
};
const LAMP_MATERIAL = /lights|pattern|grid|red_light/;

// What the side panel lists. A part id opens and closes that part's hinge;
// `flash` blinks the lights when it opens. `interior` items stay listed in the
// interior view.
const FUNCTIONS = [
  { id: 'hood', name: 'Front lid', open: 'Open', close: 'Close', flash: true },
  { id: 'door_l', name: 'Driver door', open: 'Open', close: 'Close', flash: true },
  { id: 'door_r', name: 'Passenger door', open: 'Open', close: 'Close', flash: true },
  { id: 'steering', name: 'Steering wheel', interior: true },
  { id: 'lights', name: 'Lights' },
];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const HOME = { position: new THREE.Vector3(5.6, 2.6, 6.2), target: new THREE.Vector3(0, 0.55, 0) };
// Looking down into the cabin over the right front fender.
const INTERIOR_HOME = { position: new THREE.Vector3(2.3, 2.7, 2.1), target: new THREE.Vector3(-0.1, 0.45, 0) };
camera.position.copy(HOME.position);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.49;

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
sun.shadow.radius = 6;
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x777777, 0.6));

const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// One record per part: its object, its rest pose, how far it explodes and the
// materials to tint when it is hovered.
const parts = [];
const partById = {};
const lampMaterials = [];
let explode = 0;
let explodeTarget = 0;
let hovered = null;
// The camera glides to `cameraGoal` when it is set, then hands control back.
let cameraGoal = null;
let inside = 0; // 0 = whole car, 1 = interior view
let insideTarget = 0;
let steer = 0; // steering wheel angle in radians, positive turns right
let steerTarget = 0;
let dragging = null; // the pointer's last angle around the wheel's hub while it turns the wheel
let flashStart = -Infinity;
let flashLevel = 0;

const explodeBtn = document.getElementById('explode-btn');
const explodeRange = document.getElementById('explode-range');
const functionList = document.getElementById('function-list');
const interiorBtn = document.getElementById('interior-btn');

const home = () => (insideTarget > 0.5 ? INTERIOR_HOME : HOME);
// Parts that can be clicked: in the interior view, only the interior ones.
const pickable = (part) => (insideTarget > 0.5 ? part.interior : true);
// The part a click on this one opens or closes, if any.
const opener = (part) => {
  const target = partById[PARTS[part.id].opens ?? part.id];
  return target?.hinge ? target : null;
};

function setInterior(on) {
  insideTarget = on ? 1 : 0;
  interiorBtn.textContent = on ? 'Exterior' : 'Interior';
  interiorBtn.setAttribute('aria-pressed', String(on));
  for (const li of functionList.children) li.hidden = on && !FUNCTIONS[li.dataset.index].interior;
  cameraGoal = { position: home().position.clone(), target: home().target.clone() };
}

// Fades a part's materials; 1 is its normal look. Transparency only turns on
// while the part is partly faded, so the assembled car renders as before.
function fade(part, amount) {
  if (amount === part.fade) return;
  part.fade = amount;
  part.object.visible = amount > 0.01;
  // The last bit of a fade is too faint to see, so the part turns solid early.
  const shown = amount >= 0.98 ? 1 : amount;
  for (const m of part.materials) {
    const transparent = m.transparent || shown < 1;
    if (m.material.transparent !== transparent) m.material.needsUpdate = true;
    m.material.transparent = transparent;
    m.material.opacity = m.opacity * shown;
    // A mostly solid part still writes depth, so parts drawn after it, such as
    // a wheel inside its arch, cannot paint over it.
    m.material.depthWrite = m.depthWrite && shown > 0.5;
  }
  part.object.traverse((o) => o.isMesh && (o.castShadow = amount > 0.5));
}

function setExplodeTarget(value) {
  explodeTarget = value;
  explodeBtn.textContent = value > 0.5 ? 'Assemble' : 'Explode';
}

function tint(part) {
  const color = part === hovered ? HOVER_COLOR : null;
  for (const { material, emissive } of part.materials) material.emissive.copy(color ?? emissive);
}

function toggle(part) {
  part.openTarget = part.openTarget ? 0 : 1;
  if (part.openTarget && FUNCTIONS.find((f) => f.id === part.id)?.flash) flash();
  updateFunctionList();
}

function flash() {
  flashStart = performance.now() / 1000;
}

function centerSteering() {
  steerTarget = 0;
  updateFunctionList();
}

// What each function's button does next, shown on the right of the button.
function functionState(f) {
  if (f.id === 'steering') return Math.abs(steerTarget) > 0.01 ? 'Center' : 'Drag to turn';
  if (f.id === 'lights') return 'Flash';
  return partById[f.id].openTarget ? f.close : f.open;
}

function updateFunctionList() {
  for (const li of functionList.children) {
    const f = FUNCTIONS[li.dataset.index];
    const btn = li.firstChild;
    btn.lastChild.textContent = functionState(f);
    if (partById[f.id]) btn.setAttribute('aria-pressed', String(Boolean(partById[f.id].openTarget)));
  }
}

function buildFunctionList() {
  FUNCTIONS.forEach((f, index) => {
    const li = document.createElement('li');
    li.dataset.index = index;
    const btn = document.createElement('button');
    btn.type = 'button';
    const name = document.createElement('span');
    name.textContent = f.name;
    btn.append(name, document.createElement('small'));
    if (partById[f.id]) btn.addEventListener('click', () => toggle(partById[f.id]));
    if (f.id === 'steering') btn.addEventListener('click', centerSteering);
    if (f.id === 'lights') btn.addEventListener('click', flash);
    li.append(btn);
    functionList.append(li);
  });
  updateFunctionList();
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load(
  '/models/porsche-911.glb',
  (gltf) => {
    const car = gltf.scene.getObjectByName('car');
    const box = new THREE.Box3().setFromObject(car);
    const center = box.getCenter(new THREE.Vector3());
    car.position.set(-center.x, -box.min.y, -center.z);
    scene.add(gltf.scene);
    scene.updateMatrixWorld(true);

    const vector = (v) => v && new THREE.Vector3(...v);
    for (const object of [...car.children]) {
      const id = object.name;
      const info = PARTS[id];
      if (!info) {
        console.warn(`No part info for "${id}"`);
        continue;
      }
      const materials = [];
      object.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.material = o.material.clone();
        if (o.material.name === 'body_main') o.material.color.copy(CHALK);
        if (o.material.name === 'belts') o.material.color.copy(BELT_RED);
        const { emissive, opacity, transparent, depthWrite } = o.material;
        materials.push({ material: o.material, emissive: emissive.clone(), opacity, transparent, depthWrite });
        if (LAMPS[id] && LAMP_MATERIAL.test(o.material.name)) {
          lampMaterials.push({ material: o.material, color: LAMPS[id], emissive: emissive.clone(), intensity: o.material.emissiveIntensity });
        }
        o.userData.partId = id;
      });
      const offset = new THREE.Vector3(...info.explode);
      const swing = (s) => s && { ...s, pivot: vector(s.pivot), axis: vector(s.axis).normalize() };
      const part = {
        id,
        object,
        materials,
        rest: object.position.clone(),
        restQuaternion: object.quaternion.clone(),
        hinge: swing(info.hinge),
        steer: swing(info.steer),
        openAmount: 0,
        openTarget: 0,
        offset,
        interior: Boolean(info.interior),
        away: offset.clone().normalize().multiplyScalar(AWAY_DISTANCE),
        fade: 1,
      };
      parts.push(part);
      partById[id] = part;
    }
    addDecals(car, (id) => partById[id]?.object);
    buildFunctionList();
    document.getElementById('loading').classList.add('done');
  },
  (e) => {
    if (e.total) document.getElementById('loading-text').textContent = `Loading model… ${Math.round((e.loaded / e.total) * 100)}%`;
  },
  (err) => {
    document.getElementById('loading-text').textContent = 'Could not load the model';
    console.error(err);
  },
);

// A click on a part opens or closes it; dragging the steering wheel turns it;
// any other drag orbits the camera.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

// The part under the pointer. Glass and other see-through surfaces let clicks
// through, so the steering wheel can be grabbed through a window.
function pick(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(parts.filter(pickable).map((p) => p.object), true);
  const hit = hits.find((h) => !h.object.material.transparent);
  return hit ? partById[hit.object.userData.partId] : null;
}

const isWheel = (part) => part?.id === 'steering_wheel';

// The pointer's angle around the steering wheel's hub on screen, counterclockwise.
function angleAroundHub(event) {
  const wheel = partById.steering_wheel;
  const hub = wheel.object.localToWorld(wheel.steer.pivot.clone()).project(camera);
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left - ((hub.x + 1) / 2) * rect.width;
  const y = rect.top + ((1 - hub.y) / 2) * rect.height - event.clientY;
  return Math.atan2(y, x);
}

// Runs before OrbitControls sees the press, so grabbing the wheel does not orbit.
canvas.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
  if (!isWheel(pick(e))) return;
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  dragging = angleAroundHub(e);
  canvas.style.cursor = 'grabbing';
}, { capture: true });

canvas.addEventListener('pointerup', (e) => {
  if (dragging !== null) {
    dragging = null;
    controls.enabled = true;
    updateFunctionList();
    return;
  }
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const part = pick(e);
  if (part && opener(part)) toggle(opener(part));
});

canvas.addEventListener('pointermove', (e) => {
  if (dragging !== null) {
    const angle = angleAroundHub(e);
    const delta = Math.atan2(Math.sin(angle - dragging), Math.cos(angle - dragging));
    dragging = angle;
    // Seen from the driver's seat, behind the wheel, a counterclockwise drag on
    // screen turns it left; seen from the front, the screen is mirrored.
    const wheel = partById.steering_wheel;
    const hub = wheel.object.localToWorld(wheel.steer.pivot.clone());
    const facing = Math.sign(wheel.steer.axis.dot(camera.position.clone().sub(hub))) || 1;
    steerTarget = THREE.MathUtils.clamp(steerTarget + delta * facing, -MAX_STEER, MAX_STEER);
    steer = steerTarget;
    return;
  }
  if (e.buttons) return;
  const under = pick(e);
  const part = under && (opener(under) || isWheel(under)) ? under : null;
  canvas.style.cursor = isWheel(part) ? 'grab' : part ? 'pointer' : 'default';
  if (part === hovered) return;
  const previous = hovered;
  hovered = part;
  if (previous) tint(previous);
  if (part) tint(part);
});

explodeBtn.addEventListener('click', () => {
  const exploding = explodeTarget <= 0.5;
  setExplodeTarget(exploding ? 1 : 0);
  // Pull back so the exploded parts fit in view, and come back in on assemble.
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(exploding ? 1.4 : 1 / 1.4);
  cameraGoal = { position: controls.target.clone().add(offset), target: controls.target.clone() };
});
interiorBtn.addEventListener('click', () => setInterior(insideTarget < 0.5));
explodeRange.addEventListener('input', () => setExplodeTarget(Number(explodeRange.value)));
document.getElementById('reset-btn').addEventListener('click', () => {
  setExplodeTarget(0);
  setInterior(false);
});
controls.addEventListener('start', () => (cameraGoal = null));

const timer = new THREE.Timer();

// Center the car in the space left of the side panel.
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  const panel = document.querySelector('.functions');
  const shift = panel.offsetWidth ? panel.offsetWidth + 24 : 0;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.setViewOffset(w + shift, h, shift, 0, w, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  const k = 1 - Math.exp(-dt * 6);

  explode += (explodeTarget - explode) * k;
  if (document.activeElement !== explodeRange) explodeRange.value = explode.toFixed(2);

  inside += (insideTarget - inside) * k;
  if (Math.abs(insideTarget - inside) < 0.001) inside = insideTarget;

  if (dragging === null) steer += (steerTarget - steer) * k;

  for (const part of parts) {
    part.openAmount += (part.openTarget - part.openAmount) * k;
    part.object.position.copy(part.rest);
    part.object.quaternion.copy(part.restQuaternion);
    if (part.hinge) swing(part, part.hinge, part.hinge.angle * part.openAmount);
    if (part.steer) swing(part, part.steer, part.steer.ratio * steer);
    part.object.position.addScaledVector(part.offset, explode);
    if (part.interior) continue;
    part.object.position.addScaledVector(part.away, inside);
    fade(part, part.id === 'body' ? 1 - (1 - GHOST_OPACITY) * inside : 1 - inside);
  }

  // The lamps follow the blink pattern, easing on and off over a few frames.
  const t = performance.now() / 1000 - flashStart;
  const lit = t < FLASH_ON * (2 * FLASH_BLINKS - 1) && Math.floor(t / FLASH_ON) % 2 === 0 ? 1 : 0;
  if (flashLevel !== lit) {
    flashLevel += (lit - flashLevel) * (1 - Math.exp(-dt * 40));
    if (Math.abs(lit - flashLevel) < 1e-3) flashLevel = lit;
    for (const m of lampMaterials) {
      m.material.emissive.copy(m.emissive).lerp(m.color, flashLevel);
      m.material.emissiveIntensity = m.intensity * (1 + 7 * flashLevel);
    }
  }

  if (cameraGoal) {
    camera.position.lerp(cameraGoal.position, k);
    controls.target.lerp(cameraGoal.target, k);
    const arrived = camera.position.distanceTo(cameraGoal.position) < 0.01 && controls.target.distanceTo(cameraGoal.target) < 0.01;
    if (arrived) cameraGoal = null;
  }

  controls.update();
  renderer.render(scene, camera);
});

// Rotates a part about a swing's pivot and axis by `angle`, rotating its origin
// around the pivot too.
function swing(part, { pivot, axis }, angle) {
  const turn = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  part.object.position.sub(pivot).applyQuaternion(turn).add(pivot);
  part.object.quaternion.premultiply(turn);
}

// Hooks for automated screenshots and debugging.
window.viewer = {
  setExplode: (v) => { setExplodeTarget(v); explode = v; },
  toggle: (id) => toggle(partById[id]),
  steer: (radians) => { steerTarget = radians; updateFunctionList(); },
  flash,
  interior: setInterior,
  state: () => ({ inside: +inside.toFixed(3), explode: +explode.toFixed(3), steer: +steer.toFixed(3) }),
  view: (x, y, z) => camera.position.set(x, y, z),
  target: () => controls.target.toArray().map((v) => +v.toFixed(2)),
};
