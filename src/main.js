import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PARTS } from './parts.js';
import { Callout } from './callout.js';

const POP_DISTANCE = 0.35; // how far a selected part slides out, in meters
// Emissive tints are linear and add to every material, so keep them faint.
const HOVER_COLOR = new THREE.Color(0x3b82f6).multiplyScalar(0.015);
const SELECT_COLOR = new THREE.Color(0x3b82f6).multiplyScalar(0.03);

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
camera.position.copy(HOME.position);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.minDistance = 2.5;
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

// One record per part: its object, its rest position, how far it explodes and
// the materials to tint when it is hovered or selected.
const parts = [];
let explode = 0;
let explodeTarget = 0;
let hovered = null;
let selected = null;
let callout = null;
let carTop = 1.3;

const explodeBtn = document.getElementById('explode-btn');
const explodeRange = document.getElementById('explode-range');
const partList = document.getElementById('part-list');

function setExplodeTarget(value) {
  explodeTarget = value;
  explodeBtn.textContent = value > 0.5 ? 'Assemble' : 'Explode';
}

function tint(part) {
  const color = part === selected ? SELECT_COLOR : part === hovered ? HOVER_COLOR : null;
  for (const { material, emissive } of part.materials) material.emissive.copy(color ?? emissive);
}

function select(part, localAnchor) {
  const previous = selected;
  selected = part;
  if (previous) tint(previous);
  callout?.dispose();
  callout = null;
  for (const btn of partList.children) btn.firstChild.setAttribute('aria-pressed', String(btn.dataset.id === part?.id));
  if (!part) return;
  tint(part);

  // Face the label toward whichever side of the car the camera is on, snapped to
  // the car's axes so it reads like a page pinned to the car.
  const view = camera.position.clone().sub(controls.target).setY(0);
  const outward = Math.abs(view.x) > Math.abs(view.z)
    ? new THREE.Vector3(Math.sign(view.x), 0, 0)
    : new THREE.Vector3(0, 0, Math.sign(view.z));
  callout = new Callout(PARTS[part.id], part.object, localAnchor ?? part.center, {
    outward,
    center: new THREE.Vector3(0, 0, 0), // the car is centered on the origin at load
    minY: carTop + 0.35,
  });
  scene.add(callout.group);
}

function buildPartList() {
  for (const part of parts) {
    if (part.id === 'body') continue;
    const li = document.createElement('li');
    li.dataset.id = part.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = PARTS[part.id].name;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => select(selected === part ? null : part));
    li.append(btn);
    partList.append(li);
  }
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load(
  '/models/porsche-911.glb',
  (gltf) => {
    const car = gltf.scene.getObjectByName('car');
    const box = new THREE.Box3().setFromObject(car);
    const center = box.getCenter(new THREE.Vector3());
    car.position.set(-center.x, -box.min.y, -center.z);
    carTop = box.max.y - box.min.y;
    scene.add(gltf.scene);
    scene.updateMatrixWorld(true);

    for (const object of [...car.children]) {
      const id = object.name;
      if (!PARTS[id]) {
        console.warn(`No part info for "${id}"`);
        continue;
      }
      const materials = [];
      object.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.material = o.material.clone();
        materials.push({ material: o.material, emissive: o.material.emissive.clone() });
        o.userData.partId = id;
      });
      const local = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      const offset = new THREE.Vector3(...PARTS[id].explode);
      const pop = offset.lengthSq() > 0 ? offset.clone().normalize() : new THREE.Vector3(0, 1, 0);
      parts.push({
        id,
        object,
        materials,
        center: object.worldToLocal(local),
        rest: object.position.clone(),
        offset,
        pop: pop.multiplyScalar(id === 'body' ? 0 : POP_DISTANCE),
        popAmount: 0,
      });
    }
    parts.sort((a, b) => PARTS[a.id].name.localeCompare(PARTS[b.id].name));
    buildPartList();
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

// Picking: a click selects the part under the pointer; a drag only orbits.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function pick(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(parts.map((p) => p.object), true)[0];
  if (!hit) return null;
  const part = parts.find((p) => p.id === hit.object.userData.partId);
  return { part, point: part.object.worldToLocal(hit.point.clone()) };
}

canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const hit = pick(e);
  if (!hit) select(null);
  else if (hit.part === selected) select(null);
  else select(hit.part, hit.point);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  const part = pick(e)?.part ?? null;
  if (part === hovered) return;
  const previous = hovered;
  hovered = part;
  if (previous) tint(previous);
  if (part) tint(part);
  canvas.style.cursor = part ? 'pointer' : 'default';
});

// The camera glides to `cameraGoal` when it is set, then hands control back.
let cameraGoal = null;

explodeBtn.addEventListener('click', () => {
  const exploding = explodeTarget <= 0.5;
  setExplodeTarget(exploding ? 1 : 0);
  // Pull back so the exploded parts fit in view, and come back in on assemble.
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(exploding ? 1.4 : 1 / 1.4);
  cameraGoal = { position: controls.target.clone().add(offset), target: controls.target.clone() };
});
explodeRange.addEventListener('input', () => setExplodeTarget(Number(explodeRange.value)));
document.getElementById('reset-btn').addEventListener('click', () => {
  select(null);
  setExplodeTarget(0);
  cameraGoal = { position: HOME.position.clone(), target: HOME.target.clone() };
});
controls.addEventListener('start', () => (cameraGoal = null));
window.addEventListener('keydown', (e) => e.key === 'Escape' && select(null));

const timer = new THREE.Timer();

// Center the car in the space left of the parts panel.
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  const panel = document.querySelector('.parts');
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

  for (const part of parts) {
    part.popAmount += ((part === selected ? 1 : 0) - part.popAmount) * k;
    part.object.position.copy(part.rest).addScaledVector(part.offset, explode).addScaledVector(part.pop, part.popAmount);
  }

  if (cameraGoal) {
    camera.position.lerp(cameraGoal.position, k);
    controls.target.lerp(cameraGoal.target, k);
    if (camera.position.distanceTo(cameraGoal.position) < 0.01) cameraGoal = null;
  }

  controls.update();
  callout?.update(camera);
  renderer.render(scene, camera);
});

// Hooks for automated screenshots and debugging.
window.viewer = {
  setExplode: (v) => { setExplodeTarget(v); explode = v; },
  select: (id) => select(parts.find((p) => p.id === id) ?? null),
  view: (x, y, z) => camera.position.set(x, y, z),
};
