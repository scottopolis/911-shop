import * as THREE from 'three';

// The car's lamps. Their lenses glow, and at night two spotlights throw the
// headlight beams down the track and the brake lights tint the ground red.
//
//   headlights  daytime running lights by day (DRL of full), full at night
//   rear bar    off by day, TAIL at night, full while braking
//
// When a door or the front lid opens, every lamp blinks twice: on for
// FLASH_ON seconds, off as long, then on again.
const LENS_COLORS = {
  headlight_l: new THREE.Color(1, 0.96, 0.9),
  headlight_r: new THREE.Color(1, 0.96, 0.9),
  taillight: new THREE.Color(1, 0.02, 0.02),
};
const LENS_MATERIAL = /lights|pattern|grid|red_light/;
const DRL = 0.3;
const TAIL = 0.12;
const FLASH_ON = 0.18;
const FLASH_BLINKS = 2;
const GLOW = 7; // how many times brighter than its own emissive a lens is when fully lit
// The beams, in candela, reach far down the track; the brake glow is a short
// red light just behind the bumper.
const BEAM = 900;
const BRAKE_GLOW = 4;
const AIM = new THREE.Vector3(18, -0.75, 0); // where a beam points, from its lamp, in car space (+x is forward)

export function createLamps() {
  const lenses = []; // { material, emissive, intensity, color, rear }
  const beams = [0, 1].map(() => {
    const light = new THREE.SpotLight(0xfff1dc, 0, 80, 0.42, 0.55, 1.6);
    light.castShadow = false;
    return light;
  });
  const glow = new THREE.PointLight(0xff1010, 0, 5, 1.2);
  let flashStart = -Infinity;
  let front = 0; // how lit each set of lamps is, from 0 to 1
  let rear = 0;

  // Finds the lenses on the car's lamp parts and mounts the lights on the car.
  function setCar(car, parts) {
    car.updateMatrixWorld(true);
    const centerOf = (object) => car.worldToLocal(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()));
    for (const part of parts) {
      const color = LENS_COLORS[part.id];
      if (!color) continue;
      part.object.traverse((o) => {
        if (!o.isMesh || !LENS_MATERIAL.test(o.material.name)) return;
        lenses.push({ material: o.material, emissive: o.material.emissive.clone(), intensity: o.material.emissiveIntensity, color, rear: part.id === 'taillight' });
      });
      if (part.id === 'taillight') {
        glow.position.copy(centerOf(part.object)).add(new THREE.Vector3(-1.2, -0.35, 0));
        car.add(glow);
      }
    }
    ['headlight_l', 'headlight_r'].forEach((id, i) => {
      const part = parts.find((p) => p.id === id);
      beams[i].position.copy(centerOf(part.object));
      beams[i].target.position.copy(beams[i].position).add(AIM);
      car.add(beams[i], beams[i].target);
    });
  }

  function flash() {
    flashStart = performance.now() / 1000;
  }

  // `night` turns the headlights and tail lights on, `braking` the brake
  // lights; a wrecked car (`running` false) only blinks.
  function update(dt, { night, braking, running }) {
    const t = performance.now() / 1000 - flashStart;
    const blink = t < FLASH_ON * (2 * FLASH_BLINKS - 1) && Math.floor(t / FLASH_ON) % 2 === 0 ? 1 : 0;
    const frontGoal = Math.max(blink, running ? (night ? 1 : DRL) : 0);
    const rearGoal = Math.max(blink, running ? (braking ? 1 : night ? TAIL : 0) : 0);
    // LEDs switch fast: a few frames to ease on or off.
    const k = 1 - Math.exp(-dt * 40);
    front = settle(front + (frontGoal - front) * k, frontGoal);
    rear = settle(rear + (rearGoal - rear) * k, rearGoal);
    for (const lens of lenses) {
      const level = lens.rear ? rear : front;
      lens.material.emissive.copy(lens.emissive).lerp(lens.color, level);
      lens.material.emissiveIntensity = lens.intensity * (1 + GLOW * level);
    }
    // The beams and the brake glow only show in the dark, so stay off by day.
    for (const beam of beams) beam.intensity = night && running ? BEAM * front : 0;
    glow.intensity = night ? BRAKE_GLOW * rear : 0;
  }

  return { setCar, flash, update };
}

const settle = (value, goal) => (Math.abs(goal - value) < 1e-3 ? goal : value);
