import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PARTS } from './parts.js';
import { Callout } from './callout.js';
import SHOP_LINKS from './shop-links.json';

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
let visibleAspect = 1; // aspect of the canvas area not covered by the parts panel

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
  if (!part) {
    // Put the orbit pivot back on the car and pull out to the whole-car distance,
    // keeping the current viewing angle.
    if (previous) {
      const home = HOME.position.distanceTo(HOME.target) * (explodeTarget > 0.5 ? 1.4 : 1);
      const dir = camera.position.clone().sub(controls.target).normalize();
      cameraGoal = { position: HOME.target.clone().addScaledVector(dir, home), target: HOME.target.clone() };
    }
    return;
  }
  tint(part);

  // Where the part comes to rest once its explode and pop-out animations finish.
  const box = part.box.clone().translate(part.offset.clone().multiplyScalar(explodeTarget).add(part.pop));
  const partCenter = box.getCenter(new THREE.Vector3());

  // Look at the part from the side it slides out toward, turned a little toward
  // where the camera already is so the view keeps some depth. Parts that slide
  // straight up (roof, seats) are seen from the side the camera is on.
  const camSide = camera.position.clone().sub(controls.target).setY(0).normalize();
  const slide = part.offset.lengthSq() > 0 ? part.offset.clone() : partCenter.clone();
  slide.setY(0);
  const side = (slide.length() > 0.2 ? slide.normalize() : camSide.clone()).addScaledVector(camSide, 0.35).normalize();

  // The label faces that side, snapped to the car's axes so it reads like a page
  // pinned to the car.
  const outward = Math.abs(side.x) > Math.abs(side.z)
    ? new THREE.Vector3(Math.sign(side.x), 0, 0)
    : new THREE.Vector3(0, 0, Math.sign(side.z));
  // A low eye line keeps the label, which floats over the roofline, against the
  // background instead of over the car.
  const direction = side.clone().setY(0.22).normalize();

  // The label text runs away from the car's center (the origin) when the part is
  // off to one side, otherwise toward the right of the screen.
  const textDir = new THREE.Vector3(0, 1, 0).cross(outward);
  const lateral = textDir.dot(partCenter);
  const screenRight = direction.clone().negate().cross(new THREE.Vector3(0, 1, 0));
  if (Math.abs(lateral) > 0.3 ? lateral < 0 : textDir.dot(screenRight) < 0) textDir.negate();

  callout = new Callout(PARTS[part.id], part.object, localAnchor ?? part.center, {
    outward,
    textDir,
    minY: carTop + 0.35,
    listings: SHOP_LINKS[part.id] ?? [],
  });
  scene.add(callout.group);

  // Frame the part together with its label: Callout puts the label's bottom edge
  // 0.7 m out and above the part (at least over the roofline), with the label
  // running 1.5 m along textDir and callout.height up from there.
  const labelAt = partCenter.clone().addScaledVector(outward, 0.7);
  labelAt.y = Math.max(labelAt.y + 0.5, carTop + 0.35);
  box.expandByPoint(labelAt)
    .expandByPoint(labelAt.clone().addScaledVector(textDir, 1.5).setY(labelAt.y + callout.height));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const fov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const fovX = Math.atan(Math.tan(fov) * visibleAspect);
  const distance = THREE.MathUtils.clamp(
    (sphere.radius / Math.sin(Math.min(fov, fovX))) * 1.05,
    controls.minDistance,
    controls.maxDistance,
  );
  cameraGoal = {
    position: sphere.center.clone().addScaledVector(direction, distance),
    target: sphere.center.clone(),
  };
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
      const box = new THREE.Box3().setFromObject(object); // world space, assembled
      const local = box.getCenter(new THREE.Vector3());
      const offset = new THREE.Vector3(...PARTS[id].explode);
      const pop = offset.lengthSq() > 0 ? offset.clone().normalize() : new THREE.Vector3(0, 1, 0);
      parts.push({
        id,
        object,
        box,
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
// A listing row on the selected part's label, under the pointer.
function pickListing(event) {
  if (!callout) return null;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return callout.listingAt(raycaster);
}

canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const listing = pickListing(e);
  if (listing) {
    window.open(listing.url, '_blank', 'noopener');
    return;
  }
  const hit = pick(e);
  if (!hit) select(null);
  else if (hit.part === selected) select(null);
  else select(hit.part, hit.point);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  const onListing = Boolean(pickListing(e));
  const part = onListing ? null : pick(e)?.part ?? null;
  canvas.style.cursor = onListing || part ? 'pointer' : 'default';
  if (part === hovered) return;
  const previous = hovered;
  hovered = part;
  if (previous) tint(previous);
  if (part) tint(part);
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
  visibleAspect = (w - shift) / h;
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
    const arrived = camera.position.distanceTo(cameraGoal.position) < 0.01 && controls.target.distanceTo(cameraGoal.target) < 0.01;
    if (arrived) cameraGoal = null;
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
  target: () => controls.target.toArray().map((v) => +v.toFixed(2)),
};
