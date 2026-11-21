import * as THREE from 'three';

// The instrument cluster comes alive: the center tach's needle follows a
// simulated seven-speed gearbox, and the two side screens show the speed and
// boost. `screens(readings)` redraws the side screens (from addDecals).
//
// Each gear tops out at GEAR_TOP km/h at REDLINE rpm. The gearbox shifts up
// near the top of a gear and down once the speed falls well into the one below.
const GEAR_TOP = [62, 100, 140, 185, 235, 285, 335];
const IDLE = 900;
const REDLINE = 7200;
const LAUNCH_RPM = 3200; // held in first under throttle, like launch control
// The tach reads 0 to 8 (x1000 rpm), 30 degrees apart, turning clockwise.
const DIAL_PER_RPM = -THREE.MathUtils.degToRad(30) / 1000;
// The dial faces the driver; its face normal, in car space.
const DIAL_NORMAL = new THREE.Vector3(-0.9946, 0.1042, 0);
const START_MILES = 8412;
const REDRAW_EVERY = 0.1; // seconds between screen redraws

export function createCluster(car, screens) {
  car.updateMatrixWorld(true);
  const needle = car.getObjectByName('instrument_cluster_5');
  const hub = car.getObjectByName('instrument_cluster_4');
  // The needle turns about the hub's center, on the dial's normal, both taken
  // into the needle's parent space, which moves with the cluster.
  const parent = needle.parent;
  const toParent = parent.matrixWorld.clone().invert();
  const pivot = new THREE.Box3().setFromObject(hub).getCenter(new THREE.Vector3()).applyMatrix4(toParent);
  const axis = DIAL_NORMAL.clone().transformDirection(car.matrixWorld).transformDirection(toParent);
  const restPosition = needle.position.clone();
  const restQuaternion = needle.quaternion.clone();
  const turn = new THREE.Quaternion();

  let gear = 0;
  let rpm = 0;
  let boost = 0;
  let miles = 0;
  let redrawIn = 0;

  // `speed` in m/s, `throttle` whether the gas is down, `running` false once
  // the car is wrecked.
  function update(dt, { speed, throttle, running }) {
    const kmh = Math.abs(speed) * 3.6;
    if (speed < 0) gear = 0;
    while (gear < GEAR_TOP.length - 1 && kmh > GEAR_TOP[gear] * 0.97) gear++;
    while (gear > 0 && kmh < GEAR_TOP[gear - 1] * 0.55) gear--;
    let target = Math.max(IDLE, 1000 + (kmh / GEAR_TOP[gear]) * (REDLINE - 1000));
    if (throttle && gear === 0) target = Math.max(target, LAUNCH_RPM);
    if (!running) target = 0;
    rpm += (Math.min(target, REDLINE) - rpm) * (1 - Math.exp(-dt * 10));
    const boostTarget = running && throttle ? 0.3 + 1.2 * THREE.MathUtils.clamp((rpm - 2000) / 3000, 0, 1) : 0;
    boost += (boostTarget - boost) * (1 - Math.exp(-dt * 4));
    miles += (Math.abs(speed) * dt) / 1609.34;

    turn.setFromAxisAngle(axis, rpm * DIAL_PER_RPM);
    needle.position.copy(restPosition).sub(pivot).applyQuaternion(turn).add(pivot);
    needle.quaternion.copy(turn).multiply(restQuaternion);

    redrawIn -= dt;
    if (redrawIn > 0) return;
    redrawIn = REDRAW_EVERY;
    screens({ mph: kmh / 1.609, boost, miles: START_MILES + miles, gear: speed < -0.1 ? 'R' : String(gear + 1) });
  }

  return { update };
}
