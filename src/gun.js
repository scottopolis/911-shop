import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { play } from './sound.js';

// The driver's left arm (public/models/pistol.glb, first-person arms holding
// a pistol) holding the pistol out of the driver's window. The arm turns at
// the shoulder to aim, and each shot plays the model's recoil, flashes at the
// muzzle and draws a tracer.
//
// The model is in centimeters with the pistol in its right hand, so it is
// mirrored, and its other arm is folded away.
const CM = 0.01;
// In car space (+x forward, +y up, +z right): the driver's left shoulder, and
// the way the pistol points with nothing to aim at (out of the window, ahead).
const SHOULDER = new THREE.Vector3(-2.6, 0.86, -0.5);
const REST_AIM = new THREE.Vector3(0.7, -0.12, -1).normalize();
// Out of the window the pistol reaches only so far toward the car's right
// (lateral, the most of +z its aim may have) and up or down (pitch).
const MAX_LATERAL = -0.2;
const MAX_PITCH = 0.45;
const RECOIL = 0.45; // seconds of the model's clip that a shot plays
const COOLDOWN = 0.28;
const MUZZLE = new THREE.Vector3(0, 7.5, 22); // in the pistol's own space, cm

export function createGun(scene, loader, car) {
  const shoulder = new THREE.Object3D();
  shoulder.position.copy(SHOULDER);
  shoulder.quaternion.copy(aimRotation(REST_AIM));
  car.add(shoulder);
  let gunArm = null;
  let pistol = null;
  let recoilTime = RECOIL;
  let cooldown = 0;

  const flash = new THREE.PointLight(0xffb060, 0, 8, 2);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flare.scale.setScalar(0.35);
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false }),
  );
  tracer.frustumCulled = false;
  scene.add(flash, flare, tracer);

  loader.load('/models/pistol.glb', (gltf) => {
    gunArm = arms(gltf, shoulder, 'L_arm_02');
    pistol = gunArm.root.getObjectByName('talon');
    anchor(gunArm.root, shoulder, gunArm.root.getObjectByName('R_arm_025'));
  });

  // The rotation that points +z along `direction`, upright.
  function aimRotation(direction) {
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP));
  }

  // The car-space direction from the shoulder to world `point`, kept to what
  // an arm out of the window can reach, and whether it had to be bent.
  function reach(point) {
    const direction = car.worldToLocal(point.clone()).sub(SHOULDER).normalize();
    const bent = direction.z > MAX_LATERAL || Math.abs(direction.y) > MAX_PITCH;
    direction.z = Math.min(direction.z, MAX_LATERAL);
    direction.y = THREE.MathUtils.clamp(direction.y, -MAX_PITCH, MAX_PITCH);
    return { direction: direction.normalize(), bent };
  }

  const canAim = (point) => !reach(point).bent;

  // Each frame: swing the arm toward world `target` (or back to rest), play
  // out recoil and fade the flash.
  function update(dt, { target }) {
    const direction = target ? reach(target).direction : REST_AIM;
    shoulder.quaternion.slerp(aimRotation(direction), 1 - Math.exp(-dt * 10));

    cooldown -= dt;
    recoilTime = Math.min(RECOIL, recoilTime + dt);
    gunArm?.mixer.setTime(recoilTime);
    flash.intensity *= Math.exp(-dt * 40);
    flare.material.opacity = Math.min(1, flash.intensity / 20);
    tracer.material.opacity *= Math.exp(-dt * 25);
  }

  // Fires at world `target`, or where the pistol points without one, if the
  // pistol is ready: snaps the aim to the target and returns the bullet's
  // path, { origin, direction }.
  function fire(target) {
    if (!pistol || cooldown > 0) return null;
    cooldown = COOLDOWN;
    recoilTime = 0;
    const { direction, bent } = target ? reach(target) : { direction: null, bent: true };
    if (direction) shoulder.quaternion.copy(aimRotation(direction));
    gunArm.mixer.setTime(0);
    car.updateMatrixWorld(true);
    const origin = pistol.localToWorld(MUZZLE.clone());
    const path = bent
      ? new THREE.Vector3(0, 0, 1).transformDirection(pistol.matrixWorld)
      : target.clone().sub(origin).normalize();
    flash.position.copy(origin);
    flash.intensity = 60;
    flare.position.copy(origin).addScaledVector(path, 0.12);
    play('gunshot.mp3', 0.9, 0.95 + Math.random() * 0.1);
    return { origin, direction: path };
  }

  // Draws the last bullet's tracer from the muzzle to where it struck.
  function streak(origin, end) {
    tracer.geometry.attributes.position.setXYZ(0, origin.x, origin.y, origin.z);
    tracer.geometry.attributes.position.setXYZ(1, end.x, end.y, end.z);
    tracer.geometry.attributes.position.needsUpdate = true;
    tracer.material.opacity = 0.9;
  }

  return { update, fire, streak, canAim };
}

// A mirrored copy of the arms under `parent`, one arm (`fold`) shrunk away.
function arms(gltf, parent, fold) {
  const root = clone(gltf.scene);
  root.scale.set(-CM, CM, CM);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
  });
  root.getObjectByName(fold).scale.setScalar(0);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(gltf.animations[0]).play();
  mixer.setTime(0);
  parent.add(root);
  return { root, mixer };
}

// Moves `root` so that `joint` sits on `parent`'s origin.
function anchor(root, parent, joint) {
  root.position.set(0, 0, 0);
  parent.updateMatrixWorld(true);
  root.position.copy(parent.worldToLocal(joint.getWorldPosition(new THREE.Vector3()))).negate();
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,200,120,0.8)');
  gradient.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
