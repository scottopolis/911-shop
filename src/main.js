import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { PARTS } from './parts.js';
import { addDecals } from './decals.js';
import { createContactShadow, createGround, createSkidMarks } from './ground.js';
import { createGauge } from './gauge.js';
import { createDamage } from './damage.js';
import { createCluster } from './cluster.js';
import { mute, play } from './sound.js';
import { createDriveSound } from './drive-sound.js';
import { createLamps } from './lamps.js';
import { addTouchControls } from './touch.js';

// Porsche paints offered on the start card, as their swatches look. The car is
// painted darker, by PAINT_SHADE, because the studio lighting and tone mapping
// brighten it. Its base layer reflects only PAINT_SPECULAR, leaving the gloss to
// the clear coat, so the bright environment does not wash colors out to pastel.
const PAINTS = [
  ['Chalk', '#bdbfba'],
  ['Guards Red', '#c4161c'],
  ['Racing Yellow', '#f2c80f'],
  ['Python Green', '#4f9d3a'],
  ['Gentian Blue', '#1f3b8a'],
  ['GT Silver', '#a3a6aa'],
  ['Carrara White', '#eceeea'],
  ['Jet Black', '#17191c'],
];
const PAINT_SHADE = 0.3;
const PAINT_SPECULAR = 0.25;
const paintColor = (swatch) => new THREE.Color(swatch).multiplyScalar(PAINT_SHADE);
let paint = PAINTS.find(([name]) => name === localStorage.getItem('paint')) ?? PAINTS[0];
const bodyMaterials = []; // every clone of the painted body material
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
// Night: the sun becomes a faint blue moon, the sky and haze go dark and the
// studio reflections dim, so the car's own lamps light the track.
const DAY = { sun: 1.6, sky: 0.6, environment: 1, haze: new THREE.Color(0xd3dae0) };
const NIGHT = { sun: 0.12, sky: 0.06, environment: 0.12, haze: new THREE.Color(0x0a0f1a) };

// Driving. The car turns about its rear axle like a bicycle, its front wheels
// at the steering wheel's angle over STEER_RATIO (the ratio in src/parts.js).
// Lengths are in meters, speeds in m/s, rates per second.
const WHEELBASE = 2.45;
// Where the track sits so the car starts at the origin in the pit lane, in
// front of the garages, facing down the main straight.
const TRACK_OFFSET = new THREE.Vector3(-40, -1.3, 12);
// The car rides over anything up to STEP above its tires, such as kerbs, and
// bumps into anything taller, such as walls and tire barriers.
const STEP = 0.6;
const REAR_AXLE_X = -3.49; // in car space
const WHEEL_RADIUS = 0.336;
const STEER_RATIO = 15;
// The 992 Turbo S: 478 kW pulling 1640 kg. Off the line its four driven tires
// put down LAUNCH; past that it is power limited, POWER (watts per kg at the
// wheels) over speed. Air drag (AIR times speed squared) and ROLLING
// resistance hold it back, which gives 0-100 km/h in 2.6 s, 0-200 in 8 s and
// a 332 km/h top speed, against Porsche's 2.7 s, 8.9 s and 330 km/h.
const LAUNCH = 11;
const POWER = 250;
const AIR = 0.0003;
const ROLLING = 0.15;
const BRAKE = 22; // about 2.2 g, stronger than the real car's 1.3 g
// Space is a handbrake: it brakes more gently and leaves the tires only
// HANDBRAKE_GRIP of their grip, so steering while holding it starts a drift.
const HANDBRAKE = 10;
const HANDBRAKE_GRIP = 0.35;
const COAST = 2.5; // engine braking
const MAX_REVERSE = 8;
// The tires hold at most GRIP of sideways acceleration (about 3.5 g, arcade
// grip well past a road car's, so the car still turns hard at speed); past it
// the car slides and SCRUB slows it. At speed the front wheels turn only as far
// as the tires can use, times a margin: LOCK_MARGIN up to DRIFT_FROM, rising to
// DRIFT_MARGIN by DRIFT_FULL. So full lock swings the tail out a little when
// slow and drifts further when fast, rather than spinning the car.
const GRIP = 34;
const LOCK_MARGIN = 1.15;
const DRIFT_MARGIN = 1.4;
const DRIFT_FROM = 20; // m/s, about 72 km/h
const DRIFT_FULL = 50; // m/s, about 180 km/h
const SCRUB = 3;
const SKID_SLIP = 0.1; // radians of slide that leave skid marks
// The four tires' contact patches, in car space.
const TIRES = [-1.04, -3.49].flatMap((x) => [-0.76, 0.76].map((z) => new THREE.Vector3(x, -0.14, z)));
// The keys turn the front wheels at most KEY_LOCK, about the real car's turning
// circle, at STEER_IN a second, so full lock takes a third of a second, and
// straighten them at STEER_OUT. At speed the lock is a few degrees, so the
// car still answers the keys at once.
const KEY_LOCK = THREE.MathUtils.degToRad(22);
const STEER_IN = THREE.MathUtils.degToRad(70);
const STEER_OUT = THREE.MathUtils.degToRad(180);
const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'brake',
};
// The driver's eyes, in car space, behind the steering wheel.
const DRIVER_EYE = new THREE.Vector3(-2.62, 0.93, -0.34);
const ORBIT_FOV = 35;
const DRIVER_FOV = 62;
// The chase camera, behind and above the car, in meters.
const CHASE_BACK = 6.5;
const CHASE_UP = 2.3;
const CHASE_FOV = 50;
// At speed the chase camera widens by up to SPEED_FOV degrees, reached at
// FOV_SPEED m/s, and closes in halfway, so the car shrinks only a little: the
// roadside streams past faster, as in racing games.
const SPEED_FOV = 28;
const FOV_SPEED = 55;

// What the side panel lists. A part id opens and closes that part's hinge;
// `flash` blinks the lights when it opens. `interior` items stay listed in the
// interior view.
const FUNCTIONS = [
  { id: 'hood', name: 'Front lid', open: 'Open', close: 'Close', flash: true },
  { id: 'door_l', name: 'Driver door', open: 'Open', close: 'Close', flash: true },
  { id: 'door_r', name: 'Passenger door', open: 'Open', close: 'Close', flash: true },
  { id: 'steering', name: 'Steering wheel', interior: true },
  { id: 'lights', name: 'Lights' },
  { id: 'drive', name: 'Drive', interior: true },
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

const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, 0.05, 700);
// The circuit fades into a hazy sky of the same color at the horizon.
scene.fog = new THREE.Fog(0xd3dae0, 60, 450);
scene.background = scene.fog.color;
// Over the car's left side, from the pit lane: the garages are on its right.
const HOME = { position: new THREE.Vector3(5.6, 2.6, -6.2), target: new THREE.Vector3(0, 0.55, 0) };
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
const sky = new THREE.HemisphereLight(0xffffff, 0x777777, DAY.sky);
scene.add(sun, sun.target, sky);
const lamps = createLamps();
const driveSound = createDriveSound();

const ground = createGround(renderer);
const skids = createSkidMarks();
scene.add(ground.mesh, skids.mesh);

// The track's solid surfaces, which the car drives on and bumps into.
const solid = [];
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;

// One record per part: its object, its rest pose, how far it explodes and the
// materials to tint when it is hovered.
const parts = [];
const partById = {};
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
let braking = false; // the brakes or the handbrake are slowing the car
let slide = 0; // how far, in radians, the car travels off the way its tires point
let night = false;
// The car drives by moving `rig`, the loaded scene that holds it. HOME and
// INTERIOR_HOME are in rig space, so they follow the car.
let rig = null;
let car = null;
let rearLocal = new THREE.Vector3(); // the rear axle's center, in rig space
const rearAxle = new THREE.Vector3(); // ... in world space
let heading = 0; // radians, counterclockwise seen from above
let speed = 0; // forward, in m/s
const velocity = new THREE.Vector3(); // which way the car travels, in world space
let roll = 0; // how far the wheels have turned, in radians
const keys = new Set();
let driver = false; // the camera sits in the driver's seat
let chase = false; // the camera follows behind the car
let chaseYaw = 0; // which way the chase camera looks, like heading
let pitch = 0; // the car's nose up the slope under it, in radians
let lookYaw = 0; // where the driver looks: right of straight ahead,
let lookPitch = -0.1; // and above level
let lookDrag = null; // the pointer's last position while it turns the driver's head
let cluster = null; // the moving gauges on the dashboard

const functionList = document.getElementById('function-list');
const help = document.getElementById('help');
const driverBtn = document.getElementById('driver-btn');
const chaseBtn = document.getElementById('chase-btn');
const nightBtn = document.getElementById('night-btn');
const gauge = createGauge();
document.body.append(gauge.element);
const wreckedCard = document.getElementById('wrecked');
// When the damage meter fills, the car explodes and can no longer drive.
const soundBtn = document.getElementById('sound-btn');
let muted = false;
function setMuted(on) {
  muted = on;
  mute(on);
  soundBtn.textContent = on ? 'Sound off' : 'Sound on';
  soundBtn.setAttribute('aria-pressed', String(!on));
}
soundBtn.addEventListener('click', () => setMuted(!muted));
const damage = createDamage(scene, {
  onWreck: () => {
    velocity.set(0, 0, 0);
    speed = 0;
    keys.clear();
    skids.lift();
    // Let the explosion play out before offering a reset.
    setTimeout(() => (wreckedCard.hidden = !damage.wrecked), 3000);
  },
});
document.body.append(damage.element);

// Where the camera rests for the current view, following the car.
function home() {
  const { position, target } = insideTarget > 0.5 ? INTERIOR_HOME : HOME;
  return rig
    ? { position: rig.localToWorld(position.clone()), target: rig.localToWorld(target.clone()) }
    : { position: position.clone(), target: target.clone() };
}
// Parts that can be clicked: in the interior view, only the interior ones.
const pickable = (part) => (insideTarget > 0.5 ? part.interior : true);
// The part a click on this one opens or closes, if any.
const opener = (part) => {
  const target = partById[PARTS[part.id].opens ?? part.id];
  return target?.hinge ? target : null;
};

function setInterior(on) {
  insideTarget = on ? 1 : 0;
  for (const li of functionList.children) li.hidden = on && !FUNCTIONS[li.dataset.index].interior;
  cameraGoal = home();
}

// Puts the camera in the driver's seat, the car whole and assembled, or back
// outside on the orbit camera.
function setDriver(on) {
  if (on) {
    if (chase) setChase(false);
    setExplodeTarget(0);
    setInterior(false);
    cameraGoal = null;
    lookYaw = 0;
    lookPitch = -0.1;
  }
  driver = on;
  controls.enabled = !on;
  driverBtn.textContent = on ? 'Exit seat' : 'Driver';
  driverBtn.setAttribute('aria-pressed', String(on));
  camera.fov = on ? DRIVER_FOV : ORBIT_FOV;
  camera.updateProjectionMatrix();
  if (!on) {
    // Step out to the side of the car, then glide to the usual view.
    const { target } = home();
    camera.position.copy(target).add(camera.position.clone().sub(target).setY(0).setLength(4)).setY(1.6);
    controls.target.copy(target);
    cameraGoal = home();
  }
}

// Puts the camera behind and above the car, like a driving game, or back on
// the orbit camera.
function setChase(on) {
  if (on) {
    if (driver) setDriver(false);
    setExplodeTarget(0);
    setInterior(false);
    chaseYaw = heading;
  }
  chase = on;
  gauge.element.hidden = !on;
  controls.enabled = !on;
  chaseBtn.textContent = on ? 'Orbit' : 'Chase cam';
  chaseBtn.setAttribute('aria-pressed', String(on));
  camera.fov = on ? CHASE_FOV : ORBIT_FOV;
  camera.updateProjectionMatrix();
  cameraGoal = on ? null : home();
}

// Brings the car back to its pit box, stopped.
function park() {
  damage.reset();
  wreckedCard.hidden = true;
  speed = 0;
  velocity.set(0, 0, 0);
  skids.clear();
  heading = 0;
  if (!rig) return;
  pitch = 0;
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld();
  rearAxle.copy(rearLocal);
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
}

function tint(part) {
  const color = part === hovered ? HOVER_COLOR : null;
  for (const { material, emissive } of part.materials) material.emissive.copy(color ?? emissive);
}

function toggle(part) {
  part.openTarget = part.openTarget ? 0 : 1;
  const f = FUNCTIONS.find((f) => f.id === part.id);
  if (part.openTarget && f?.flash) flash();
  // A door or the lid unlatches as it opens and shuts once it swings closed.
  if (f?.flash) {
    if (part.openTarget) play('door-open.mp3', 0.8, part.id === 'hood' ? 1.15 : 1);
    part.shutting = !part.openTarget;
  }
  updateFunctionList();
}

function flash() {
  lamps.flash();
}

function setNight(on) {
  night = on;
  const look = on ? NIGHT : DAY;
  sun.intensity = look.sun;
  sky.intensity = look.sky;
  scene.environmentIntensity = look.environment;
  scene.fog.color.copy(look.haze);
  document.body.classList.toggle('night', on);
  nightBtn.setAttribute('aria-pressed', String(on));
}

const moveToward = (value, target, step) => (value < target ? Math.min(target, value + step) : Math.max(target, value - step));

// Moves the car for one frame from the keys held down.
function drive(dt) {
  const throttle = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
  const turn = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  // A turn key steers to full lock: the wheel's own lock when slow, and at
  // speed the angle whose turn the tires can hold. Let go and it recenters.
  const margin = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(Math.abs(speed), DRIFT_FROM, DRIFT_FULL), DRIFT_FROM, DRIFT_FULL, LOCK_MARGIN, DRIFT_MARGIN);
  const grip = Math.atan((WHEELBASE * GRIP * margin) / Math.max(speed * speed, 1e-6)) * STEER_RATIO;
  if (turn) steerTarget = turn * Math.min(KEY_LOCK * STEER_RATIO, grip);
  else if (Math.abs(speed) > 0.5 && dragging === null) steerTarget = 0;
  const rate = Math.abs(steerTarget) > Math.abs(steer) ? STEER_IN : STEER_OUT;
  if (dragging === null) steer = moveToward(steer, steerTarget, rate * STEER_RATIO * dt);

  // Throttle and brakes act along the way the car points.
  let forward = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  speed = velocity.dot(forward);
  let next = speed;
  const resist = AIR * speed * speed + ROLLING;
  if (keys.has('brake')) next = moveToward(speed, 0, HANDBRAKE * dt);
  // Off the gas, engine braking, air drag and rolling resistance slow the car.
  else if (!throttle) next = moveToward(speed, 0, (COAST + resist) * dt);
  // Pressing against the direction of travel brakes first, then reverses.
  else if (throttle * speed < 0) next = speed + throttle * BRAKE * dt;
  else next = speed + throttle * (Math.min(LAUNCH, POWER / Math.max(Math.abs(speed), 1)) - resist) * dt;
  next = Math.max(next, -MAX_REVERSE);
  velocity.addScaledVector(forward, next - speed);
  const moving = velocity.length();
  braking = moving > 0.3 && (keys.has('brake') || throttle * speed < 0);
  slide = 0;
  if (moving < 0.01 && !throttle) {
    velocity.set(0, 0, 0);
    speed = 0;
    skids.lift();
    return;
  }

  // The front wheels turn the car (right, positive, is clockwise from above).
  heading += -(speed / WHEELBASE) * Math.tan(steer / STEER_RATIO) * dt;
  forward = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));

  // The tires swing the car's travel round to where it points, with at most
  // GRIP of sideways force. Past that the car slides, scrubbing off speed.
  const aim = velocity.dot(forward) < 0 ? forward.clone().negate() : forward;
  const slip = Math.atan2(velocity.clone().cross(aim).y, velocity.dot(aim));
  const hold = (keys.has('brake') ? GRIP * HANDBRAKE_GRIP : GRIP) * dt / moving;
  const turned = THREE.MathUtils.clamp(slip, -hold, hold);
  velocity.applyAxisAngle(THREE.Object3D.DEFAULT_UP, turned);
  const sliding = Math.abs(slip - turned);
  slide = sliding;
  if (sliding > 0.01) velocity.multiplyScalar(Math.max(0, 1 - SCRUB * Math.sin(Math.min(sliding, 1)) * dt / moving));
  speed = velocity.dot(forward);

  // Walls and barriers stop the car: it glances off them, losing speed. The
  // car reaches further ahead and behind than to its sides.
  const travel = velocity.clone().normalize();
  ray.set(rig.position.clone().setY(rig.position.y + STEP + 0.2), travel);
  ray.far = moving * dt + 1 + 1.3 * Math.abs(travel.dot(forward));
  const wall = ray.intersectObjects(solid, false)[0];
  const normal = wall?.face.normal.clone().transformDirection(wall.object.matrixWorld);
  if (normal && Math.abs(normal.y) < 0.7) {
    normal.setY(0).normalize();
    const into = velocity.dot(normal);
    if (into < 0) {
      damage.hit(wall.point, normal, -into);
      velocity.addScaledVector(normal, -1.3 * into).multiplyScalar(0.7);
    }
  }

  // The car follows the track's rises and dips, nose up or down with the
  // slope between its axles.
  rearAxle.addScaledVector(velocity, dt);
  rearAxle.y = groundAt(rearAxle);
  const frontY = groundAt(rearAxle.clone().addScaledVector(forward, WHEELBASE));
  pitch += (Math.atan2(frontY - rearAxle.y, WHEELBASE) - pitch) * Math.min(1, dt * 10);
  rig.rotation.set(0, heading, pitch, 'YZX');
  rig.position.copy(rearAxle).sub(rearLocal.clone().applyEuler(rig.rotation));
  // Rolling forward along +x turns a wheel clockwise about +z.
  roll -= (speed * dt) / WHEEL_RADIUS;

  // A sliding car lays rubber from all four tires.
  rig.updateMatrixWorld(true);
  if (sliding > SKID_SLIP && moving > 3) skids.lay(TIRES.map((p) => car.localToWorld(p.clone())));
  else skids.lift();
}

// The height of the track's surface under a point, found from STEP above it,
// or the point's own height off the edge of the track.
function groundAt(p) {
  ray.set(new THREE.Vector3(p.x, p.y + STEP, p.z), DOWN);
  ray.far = STEP + 3;
  return ray.intersectObjects(solid, false)[0]?.point.y ?? p.y;
}
const DOWN = new THREE.Vector3(0, -1, 0);

function centerSteering() {
  steerTarget = 0;
  updateFunctionList();
}

// What each function's button does next, shown on the right of the button.
function functionState(f) {
  if (f.id === 'steering') return Math.abs(steerTarget) > 0.01 ? 'Center' : 'Drag to turn';
  if (f.id === 'lights') return 'Flash';
  if (f.id === 'drive') return Math.abs(speed) > 0.3 ? `${Math.round(Math.abs(speed) * 3.6)} km/h · Stop` : 'W A S D';
  return partById[f.id].openTarget ? f.close : f.open;
}

function updateFunctionList() {
  for (const li of functionList.children) {
    const f = FUNCTIONS[li.dataset.index];
    const btn = li.firstChild;
    const state = functionState(f);
    if (btn.lastChild.textContent !== state) btn.lastChild.textContent = state;
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
    if (f.id === 'drive') btn.addEventListener('click', () => velocity.set(0, 0, 0));
    li.append(btn);
    functionList.append(li);
  });
  updateFunctionList();
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.load('/models/track.glb', (gltf) => {
  const track = gltf.scene;
  track.position.copy(TRACK_OFFSET);
  track.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    // Decals and grass tufts are see-through: the car drives over and through them.
    if (o.material.transparent) return;
    o.geometry.boundsTree = new MeshBVH(o.geometry);
    o.raycast = acceleratedRaycast;
    solid.push(o);
  });
  scene.add(track);
});
loader.load(
  '/models/porsche-911.glb',
  (gltf) => {
    rig = gltf.scene;
    car = rig.getObjectByName('car');
    const box = new THREE.Box3().setFromObject(car);
    const center = box.getCenter(new THREE.Vector3());
    car.position.set(-center.x, -box.min.y, -center.z);
    rig.add(createContactShadow(box.max.x - box.min.x + 0.6, box.max.z - box.min.z + 0.4));
    scene.add(rig);
    scene.updateMatrixWorld(true);
    rearLocal = car.position.clone().add(new THREE.Vector3(REAR_AXLE_X, 0, 0)).setY(0);
    rearAxle.copy(rearLocal);
    setChase(true);

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
        if (o.material.name === 'body_main') {
          o.material.color.copy(paintColor(paint[1]));
          o.material.specularIntensity = PAINT_SPECULAR;
          bodyMaterials.push(o.material);
        }
        if (o.material.name === 'belts') o.material.color.copy(BELT_RED);
        const { emissive, opacity, transparent, depthWrite } = o.material;
        materials.push({ material: o.material, emissive: emissive.clone(), opacity, transparent, depthWrite });
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
        hub: info.hub && { pivot: vector(info.hub), axis: new THREE.Vector3(0, 0, 1) },
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
    cluster = createCluster(car, addDecals(car, (id) => partById[id]?.object));
    damage.setCar({ rig, car, parts });
    lamps.setCar(car, parts);
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
// any other drag orbits the camera, or in the driver's seat turns the driver's head.
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
  if (!isWheel(pick(e))) {
    if (driver) {
      lookDrag = [e.clientX, e.clientY];
      canvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
  dragging = angleAroundHub(e);
  canvas.style.cursor = 'grabbing';
}, { capture: true });

canvas.addEventListener('pointerup', (e) => {
  lookDrag = null;
  if (dragging !== null) {
    dragging = null;
    controls.enabled = !driver && !chase;
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
  if (lookDrag) {
    lookYaw = THREE.MathUtils.clamp(lookYaw + (e.clientX - lookDrag[0]) * 0.005, -2.2, 2.2);
    lookPitch = THREE.MathUtils.clamp(lookPitch - (e.clientY - lookDrag[1]) * 0.005, -0.9, 0.6);
    lookDrag = [e.clientX, e.clientY];
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

driverBtn.addEventListener('click', () => setDriver(!driver));
chaseBtn.addEventListener('click', () => setChase(!chase));
nightBtn.addEventListener('click', () => setNight(!night));
addTouchControls(keys, () => (help.hidden = true));
// The controls card shows until the first driving key or its button.
document.getElementById('wreck-reset').addEventListener('click', () => document.getElementById('reset-btn').click());
document.getElementById('help-close').addEventListener('click', () => (help.hidden = true));

// Paint swatches on the start card; the choice is kept for the next visit.
const paintName = document.getElementById('paint-name');
const swatches = PAINTS.map(([name, swatch]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.title = name;
  button.setAttribute('aria-label', name);
  button.style.background = swatch;
  button.addEventListener('click', () => setPaint(PAINTS.find((p) => p[0] === name)));
  document.getElementById('paints').append(button);
  return button;
});
function setPaint(next) {
  paint = next;
  localStorage.setItem('paint', paint[0]);
  paintName.textContent = paint[0];
  swatches.forEach((b, i) => b.setAttribute('aria-pressed', String(PAINTS[i] === paint)));
  damage.repaint(bodyMaterials, paintColor(paint[1]));
}
setPaint(paint);
document.getElementById('help-btn').addEventListener('click', () => (help.hidden = !help.hidden));
// Back to how the page starts: parked in the pits, seen from the chase camera.
document.getElementById('reset-btn').addEventListener('click', () => {
  park();
  setChase(true);
});

// The keys drive the car.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC' && !e.repeat) setChase(!chase);
  if (e.code === 'KeyR' && !e.repeat) document.getElementById('reset-btn').click();
  if (e.code === 'KeyM' && !e.repeat) setMuted(!muted);
  if (e.code === 'KeyN' && !e.repeat) setNight(!night);
  if (!KEYS[e.code]) return;
  e.preventDefault();
  help.hidden = true;
  keys.add(KEYS[e.code]);
});
window.addEventListener('keyup', (e) => keys.delete(KEYS[e.code]));
window.addEventListener('blur', () => keys.clear());
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

  inside += (insideTarget - inside) * k;
  if (Math.abs(insideTarget - inside) < 0.001) inside = insideTarget;

  // The orbit camera keeps its angle and travels along with the car.
  const before = rig ? rig.position.clone() : null;
  if (rig && !damage.wrecked) drive(dt);
  if (before) {
    const moved = rig.position.clone().sub(before);
    camera.position.add(moved);
    controls.target.add(moved);
    cameraGoal?.position.add(moved);
    cameraGoal?.target.add(moved);
    ground.follow(rig.position);
    sun.target.position.copy(rig.position);
    sun.position.copy(rig.position).add(new THREE.Vector3(3, 8, 4));
  }
  updateFunctionList();
  if (chase) gauge.set(velocity.length() * 2.237);
  cluster?.update(dt, { speed, throttle: keys.has('up'), running: !damage.wrecked });
  lamps.update(dt, { night, braking: braking && !damage.wrecked, running: !damage.wrecked });
  driveSound.update({ speed: damage.wrecked ? 0 : velocity.length(), slide: damage.wrecked ? 0 : slide });


  for (const part of parts) {
    if (part.flung) continue; // thrown clear by the explosion
    part.openAmount += (part.openTarget - part.openAmount) * k;
    if (part.shutting && part.openAmount < 0.04) {
      part.shutting = false;
      play('door-close.mp3', 0.9, part.id === 'hood' ? 1.1 : 1);
    }
    part.object.position.copy(part.rest);
    part.object.quaternion.copy(part.restQuaternion);
    if (part.hinge) swing(part, part.hinge, part.hinge.angle * part.openAmount);
    if (part.hub) swing(part, part.hub, roll);
    if (part.steer) swing(part, part.steer, part.steer.ratio * steer);
    part.object.position.addScaledVector(part.offset, explode);
    if (part.interior) continue;
    part.object.position.addScaledVector(part.away, inside);
    fade(part, part.id === 'body' ? 1 - (1 - GHOST_OPACITY) * inside : 1 - inside);
  }

  if (cameraGoal) {
    camera.position.lerp(cameraGoal.position, k);
    controls.target.lerp(cameraGoal.target, k);
    const arrived = camera.position.distanceTo(cameraGoal.position) < 0.01 && controls.target.distanceTo(cameraGoal.target) < 0.01;
    if (arrived) cameraGoal = null;
  }

  if (driver && car) {
    // Look out from the driver's eyes, turned by lookYaw and lookPitch.
    car.updateMatrixWorld(true);
    const look = new THREE.Vector3(
      Math.cos(lookPitch) * Math.cos(lookYaw),
      Math.sin(lookPitch),
      Math.cos(lookPitch) * Math.sin(lookYaw),
    );
    camera.position.copy(car.localToWorld(DRIVER_EYE.clone()));
    camera.lookAt(car.localToWorld(DRIVER_EYE.clone().add(look)));
  } else if (chase && rig) {
    // Swing round behind the way the car travels, so a slide shows the car
    // sideways; reversing or barely moving, behind the way it points.
    const aim = speed > 3 ? Math.atan2(-velocity.z, velocity.x) : heading;
    chaseYaw += Math.atan2(Math.sin(aim - chaseYaw), Math.cos(aim - chaseYaw)) * (1 - Math.exp(-dt * 3));
    const back = new THREE.Vector3(-Math.cos(chaseYaw), 0, Math.sin(chaseYaw));
    camera.fov = CHASE_FOV + SPEED_FOV * Math.min(1, velocity.length() / FOV_SPEED);
    camera.updateProjectionMatrix();
    const zoom = Math.tan(THREE.MathUtils.degToRad(CHASE_FOV / 2)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.copy(rig.position).addScaledVector(back, CHASE_BACK * (0.5 + 0.5 * zoom)).add(new THREE.Vector3(0, CHASE_UP, 0));
    controls.target.copy(rig.position).addScaledVector(back, -3).add(new THREE.Vector3(0, 0.8, 0));
    camera.lookAt(controls.target);
  } else {
    controls.update();
  }
  damage.update(dt, camera);
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
  night: setNight,
  interior: setInterior,
  driver: setDriver,
  chase: setChase,
  state: () => ({ inside: +inside.toFixed(3), explode: +explode.toFixed(3), steer: +steer.toFixed(3), speed: +speed.toFixed(2), heading: +heading.toFixed(3), at: rig?.position.toArray().map((v) => +v.toFixed(2)) }),
  view: (x, y, z) => camera.position.set(x, y, z),
  target: () => controls.target.toArray().map((v) => +v.toFixed(2)),
};
