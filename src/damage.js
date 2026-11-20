import { load, play } from './sound.js';
import * as THREE from 'three';

// Crash damage. Each hard hit fills a meter, presses a crumpled dent into the
// bodywork where the car struck, throws sparks and breaks nearby glass. As the
// meter fills the car smokes, then burns; when it is full the car explodes and
// throws its panels and wheels across the track. main.js reports wall hits
// with hit(), calls update() every frame, and reset() puts the car back.
const MAX_DAMAGE = 100;
const SAFE_SPEED = 4; // m/s into a wall that leaves no mark
const DAMAGE_PER_MS = 2.4; // meter points per m/s past SAFE_SPEED
const GLASS_SPEED = 9; // m/s into a wall that breaks the glass near the hit
const SMOKE_FROM = 35; // meter points
const FIRE_FROM = 75;
// In car space: the engine under the rear lid, and the middle of the cabin.
const ENGINE = new THREE.Vector3(-4.05, 0.72, 0);
const CABIN = new THREE.Vector3(-2.3, 0.6, 0);
const CHAR = new THREE.Color(0x141210);
const UP = new THREE.Vector3(0, 1, 0);

const rand = (a, b) => a + Math.random() * (b - a);
const randomDirection = () => new THREE.Vector3(rand(-1, 1), rand(0.1, 1), rand(-1, 1)).normalize();

export function createDamage(scene, { onWreck }) {
  const particles = createParticles(scene, 400);
  const shards = createShards(scene, 500);
  const meter = createMeter();
  const light = new THREE.PointLight(0xff8a3a, 0, 80, 1.2);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  ring.visible = false;
  scene.add(light, ring);
  const raycaster = new THREE.Raycaster();

  let car = null;
  let rig = null;
  let parts = [];
  let shell = []; // painted and trim meshes that dent
  let glass = []; // panes that shatter
  const paints = new Map(); // each opaque material's own color, to char and restore
  const dents = []; // the last few hits, in car space, which smoke once the car is badly hurt
  const debris = [];
  let level = 0;
  let cooldown = 0;
  let wrecked = false;
  let shake = 0;
  let smokeDue = 0;
  let fireDue = 0;
  let burn = 0;
  let blastAge = Infinity;

  function setCar(next) {
    ({ car, rig, parts } = next);
    shell = [];
    glass = [];
    for (const part of parts) {
      if (part.interior || /^(wheel|brake)_/.test(part.id)) continue;
      part.object.traverse((o) => {
        if (!o.isMesh) return;
        // Clear and untextured is glass; textured see-through meshes are decals.
        if (!o.material.transparent) shell.push(o);
        else if (!o.material.map) glass.push(o);
      });
    }
    rig.traverse((o) => {
      if (o.isMesh && !o.material.transparent && !paints.has(o.material)) paints.set(o.material, o.material.color.clone());
    });
    for (const name of ['crash', 'glass', 'explosion']) load(`${name}.mp3`);
  }

  // A wall hit at `point`, whose surface faces the car along `normal`, at
  // `speed` m/s into the wall.
  function hit(point, normal, speed) {
    if (!car || wrecked || cooldown > 0 || speed < SAFE_SPEED) return;
    cooldown = 0.25;
    const contact = contactPoint(point, normal);
    const radius = 0.35 + speed * 0.022;
    dent(contact, normal.clone().multiplyScalar(Math.min(0.4, speed * 0.014)), radius);
    dents.push(car.worldToLocal(contact.clone()));
    if (dents.length > 4) dents.shift();
    if (speed > GLASS_SPEED) {
      const reach = radius + (speed - GLASS_SPEED) * 0.08;
      const broken = glass.filter((pane) => pane.visible && worldSphere(pane).distanceToPoint(contact) < reach);
      for (const pane of broken) shatter(pane, normal);
      if (broken.length) play('glass.mp3', 0.7, rand(0.9, 1.15));
    }
    for (let i = 0; i < 18; i++) {
      particles.emit(contact, normal.clone().multiplyScalar(2).add(randomDirection().multiplyScalar(rand(2, 6))), SPARK);
    }
    for (let i = 0; i < 6; i++) particles.emit(contact, randomDirection().multiplyScalar(0.8), DUST);
    shake = Math.max(shake, Math.min(0.5, speed / 40));
    play('crash.mp3', Math.min(1, speed / 22), rand(0.85, 1.1));
    level = Math.min(MAX_DAMAGE, level + (speed - SAFE_SPEED) * DAMAGE_PER_MS);
    meter.set(level / MAX_DAMAGE);
    if (level >= MAX_DAMAGE) explode();
  }

  // Where the car's body meets the wall: straight back from the wall, or
  // failing that, the side of the car facing it.
  function contactPoint(point, normal) {
    const origins = [point.clone().addScaledVector(normal, -0.5), car.localToWorld(CABIN.clone()).addScaledVector(normal, -6)];
    for (const origin of origins) {
      raycaster.set(origin, normal);
      raycaster.far = 8;
      const hit = raycaster.intersectObjects(shell, false)[0];
      if (hit) return hit.point;
    }
    return point.clone();
  }

  // Pushes the bodywork within `radius` of `center` along `push`, deepest at
  // the center, with a ripple so the metal crumples rather than bends.
  function dent(center, push, radius) {
    const v = new THREE.Vector3();
    for (const mesh of shell) {
      if (worldSphere(mesh).distanceToPoint(center) > radius) continue;
      const geometry = mesh.geometry;
      if (!mesh.userData.restPosition) {
        // The model's vertices are packed 16-bit numbers; dents need plain floats.
        mesh.userData.restPosition = geometry.attributes.position;
        mesh.userData.restNormal = geometry.attributes.normal;
        geometry.setAttribute('position', floatCopy(geometry.attributes.position));
        if (geometry.attributes.normal) geometry.setAttribute('normal', floatCopy(geometry.attributes.normal));
      }
      const position = geometry.attributes.position;
      const inverse = mesh.matrixWorld.clone().invert();
      const moved = [];
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        const d = v.distanceTo(center);
        if (d >= radius) continue;
        const ripple = 0.65 + 0.35 * Math.sin(v.x * 31 + v.z * 17) * Math.sin(v.y * 43);
        v.addScaledVector(push, (1 - d / radius) ** 2 * ripple).applyMatrix4(inverse);
        position.setXYZ(i, v.x, v.y, v.z);
        moved.push(i);
      }
      if (!moved.length) continue;
      position.needsUpdate = true;
      geometry.computeBoundingSphere();
      // Reshade only the dent, so the rest keeps the model's own normals.
      const normal = geometry.attributes.normal;
      if (!normal) continue;
      const fresh = new THREE.BufferGeometry().setAttribute('position', position);
      if (geometry.index) fresh.setIndex(geometry.index);
      fresh.computeVertexNormals();
      for (const i of moved) normal.setXYZ(i, fresh.attributes.normal.getX(i), fresh.attributes.normal.getY(i), fresh.attributes.normal.getZ(i));
      normal.needsUpdate = true;
    }
  }

  function shatter(pane, push) {
    if (!pane.visible) return;
    pane.visible = false;
    const position = pane.geometry.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < Math.min(45, position.count); i++) {
      p.fromBufferAttribute(position, Math.floor(Math.random() * position.count)).applyMatrix4(pane.matrixWorld);
      const velocity = push.clone().multiplyScalar(rand(1, 4)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5)));
      shards.add(p, velocity, rig.position.y + 0.01);
    }
  }

  function explode() {
    wrecked = true;
    onWreck();
    const center = car.localToWorld(CABIN.clone());
    const floor = rig.position.y;
    for (const pane of glass) shatter(pane, randomDirection());
    // Every outer panel, light and wheel flies off, spinning about its middle.
    for (const part of parts) {
      if (part.interior || part.id === 'body' || part.id === 'frunk' || part.id.startsWith('brake_')) continue;
      const pivot = new THREE.Group();
      pivot.position.copy(new THREE.Box3().setFromObject(part.object).getCenter(new THREE.Vector3()));
      scene.add(pivot);
      pivot.attach(part.object);
      part.flung = true;
      const out = pivot.position.clone().sub(center).setY(0).normalize();
      debris.push({
        part,
        pivot,
        velocity: out.multiplyScalar(rand(5, 14)).addScaledVector(UP, rand(6, 16)),
        axis: randomDirection(),
        rate: rand(3, 10),
        floor: floor + 0.25,
        rest: false,
      });
    }
    for (let i = 0; i < 50; i++) {
      const dir = randomDirection();
      particles.emit(center.clone().addScaledVector(dir, rand(0, 1.2)), dir.multiplyScalar(rand(3, 13)), { ...FIREBALL, grow: rand(5, 9) });
    }
    for (let i = 0; i < 45; i++) {
      const dir = randomDirection();
      particles.emit(center.clone().addScaledVector(dir, rand(0, 2)), dir.multiplyScalar(rand(2, 7)).addScaledVector(UP, 3), { ...BLAST_SMOKE, life: rand(3, 6) });
    }
    for (let i = 0; i < 70; i++) particles.emit(center, randomDirection().multiplyScalar(rand(8, 22)), { ...SPARK, life: rand(1, 2) });
    light.position.copy(center).addScaledVector(UP, 1);
    ring.position.copy(center).setY(floor + 0.05);
    blastAge = 0;
    shake = 1.2;
    play('explosion.mp3', 1);
    play('glass.mp3', 0.5);
  }

  function update(dt, camera) {
    cooldown -= dt;
    if (car && level >= SMOKE_FROM) {
      // Smoke from the engine and the worst dents, thicker as damage builds.
      const rate = wrecked ? 30 : 4 + (14 * (level - SMOKE_FROM)) / (MAX_DAMAGE - SMOKE_FROM);
      for (smokeDue += rate * dt; smokeDue >= 1; smokeDue--) {
        const from = !wrecked && dents.length && Math.random() < 0.4 ? dents[Math.floor(Math.random() * dents.length)] : ENGINE;
        const options = wrecked ? WRECK_SMOKE : level >= FIRE_FROM ? BLACK_SMOKE : SMOKE;
        particles.emit(car.localToWorld(from.clone()), new THREE.Vector3(rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3)), { ...options, life: rand(2.5, 4) });
      }
    }
    let glow = 0;
    if (car && level >= FIRE_FROM) {
      // Flames from the engine; once wrecked, the whole shell burns.
      for (fireDue += (wrecked ? 45 : 22) * dt; fireDue >= 1; fireDue--) {
        const from = wrecked ? new THREE.Vector3(rand(-4.3, -0.5), rand(0.3, 0.9), rand(-0.7, 0.7)) : ENGINE;
        particles.emit(car.localToWorld(from.clone()), new THREE.Vector3(rand(-0.5, 0.5), 1.5, rand(-0.5, 0.5)), wrecked ? BIG_FIRE : FIRE);
      }
      glow = (wrecked ? 25 : 8) * rand(0.7, 1);
      if (blastAge > 1) light.position.copy(car.localToWorld((wrecked ? CABIN : ENGINE).clone())).addScaledVector(UP, 0.8);
    }
    blastAge += dt;
    light.intensity = 150 * Math.exp(-blastAge * 4) + glow;
    ring.visible = blastAge < 1;
    if (ring.visible) {
      ring.scale.setScalar(1 + blastAge * 30);
      ring.material.opacity = 1 - blastAge;
    }

    const turn = new THREE.Quaternion();
    for (const d of debris) {
      if (d.rest) continue;
      d.velocity.y -= 9.8 * dt;
      d.pivot.position.addScaledVector(d.velocity, dt);
      d.pivot.quaternion.premultiply(turn.setFromAxisAngle(d.axis, d.rate * dt));
      if (d.pivot.position.y < d.floor) {
        d.pivot.position.y = d.floor;
        d.velocity.set(d.velocity.x * 0.6, -d.velocity.y * 0.35, d.velocity.z * 0.6);
        d.rate *= 0.6;
        if (d.velocity.length() < 0.6) d.rest = true;
      }
    }

    if (wrecked && burn < 0.85) {
      burn = Math.min(0.85, burn + dt * 0.4);
      for (const [material, color] of paints) material.color.copy(color).lerp(CHAR, burn);
    }

    particles.update(dt);
    shards.update(dt);
    if (shake > 0.001) {
      camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake * 0.3));
      shake *= Math.exp(-dt * 3);
    }
  }

  function reset() {
    level = 0;
    meter.set(0);
    wrecked = false;
    burn = 0;
    shake = 0;
    cooldown = 0;
    blastAge = Infinity;
    dents.length = 0;
    particles.clear();
    shards.clear();
    light.intensity = 0;
    ring.visible = false;
    for (const d of debris) {
      car.attach(d.part.object);
      scene.remove(d.pivot);
      d.part.flung = false;
    }
    debris.length = 0;
    for (const mesh of shell) {
      if (!mesh.userData.restPosition) continue;
      mesh.geometry.setAttribute('position', mesh.userData.restPosition);
      if (mesh.userData.restNormal) mesh.geometry.setAttribute('normal', mesh.userData.restNormal);
      mesh.geometry.computeBoundingSphere();
      delete mesh.userData.restPosition;
      delete mesh.userData.restNormal;
    }
    for (const pane of glass) pane.visible = true;
    for (const [material, color] of paints) material.color.copy(color);
  }

  return {
    element: meter.element,
    setCar,
    hit,
    update,
    reset,
    get wrecked() {
      return wrecked;
    },
  };
}

// Looks for particles, by kind. Sizes are in meters, from first to last.
const SPARK = { life: 0.6, size: 0.12, grow: 0.04, from: 0xffeeaa, to: 0xff4400, opacity: 1, additive: true, gravity: 9.8, drag: 0.3 };
const DUST = { life: 1.2, size: 0.3, grow: 1.2, from: 0xb8b2a8, to: 0x8a857c, opacity: 0.4, drag: 2 };
const SMOKE = { size: 0.6, grow: 3.5, from: 0x8a8a8a, to: 0x555555, opacity: 0.55, gravity: -0.6, drag: 0.5 };
const BLACK_SMOKE = { ...SMOKE, from: 0x2e2e2e, to: 0x1c1c1c, opacity: 0.8 };
const WRECK_SMOKE = { ...BLACK_SMOKE, size: 1.5, grow: 7, opacity: 0.85 };
const FIRE = { life: 0.8, size: 0.8, grow: 0.3, from: 0xffd27a, to: 0xff2a00, opacity: 0.9, additive: true, gravity: -3, drag: 1 };
const BIG_FIRE = { ...FIRE, life: 1, size: 1.6, grow: 0.5 };
const FIREBALL = { life: 1.2, size: 1.5, from: 0xffe39a, to: 0xff3a00, opacity: 0.5, additive: true, gravity: -2, drag: 2.5 };
const BLAST_SMOKE = { size: 2, grow: 10, from: 0x3a3530, to: 0x151515, opacity: 0.85, gravity: -1, drag: 1 };

function worldSphere(mesh) {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  return mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
}

function floatCopy(attribute) {
  const copy = new THREE.BufferAttribute(new Float32Array(attribute.count * 3), 3);
  for (let i = 0; i < attribute.count; i++) copy.setXYZ(i, attribute.getX(i), attribute.getY(i), attribute.getZ(i));
  return copy;
}

// A pool of soft round sprites, reused oldest first.
function createParticles(scene, count) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const pool = Array.from({ length: count }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, velocity: new THREE.Vector3(), from: new THREE.Color(), to: new THREE.Color() };
  });
  let next = 0;
  return {
    emit(position, velocity, o) {
      const p = pool[next];
      next = (next + 1) % count;
      p.sprite.position.copy(position);
      p.velocity.copy(velocity);
      p.from.set(o.from);
      p.to.set(o.to);
      Object.assign(p, { age: 0, life: o.life, size: o.size, grow: o.grow ?? o.size, opacity: o.opacity, gravity: o.gravity ?? 0, drag: o.drag ?? 0 });
      const material = p.sprite.material;
      const blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (material.blending !== blending) {
        material.blending = blending;
        material.needsUpdate = true;
      }
      material.rotation = Math.random() * Math.PI * 2;
      p.sprite.visible = true;
    },
    update(dt) {
      for (const p of pool) {
        if (!p.sprite.visible) continue;
        p.age += dt;
        const t = p.age / p.life;
        if (t >= 1) {
          p.sprite.visible = false;
          continue;
        }
        p.velocity.y -= p.gravity * dt;
        p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
        p.sprite.position.addScaledVector(p.velocity, dt);
        p.sprite.scale.setScalar(p.size + (p.grow - p.size) * t);
        p.sprite.material.color.copy(p.from).lerp(p.to, t);
        p.sprite.material.opacity = p.opacity * Math.min(1, t * 8) * (1 - t);
      }
    },
    clear() {
      for (const p of pool) p.sprite.visible = false;
    },
  };
}

// Glass shards that tumble to the ground and stay there.
function createShards(scene, count) {
  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.035, 3),
    new THREE.MeshStandardMaterial({ color: 0xe8f4f6, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    count,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const list = [];
  let next = 0;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  return {
    add(position, velocity, floor) {
      list[next] = { position: position.clone(), velocity, floor, spin: randomDirection(), angle: rand(0, 6), rate: rand(10, 30), size: rand(0.6, 1.8), rest: false };
      next = (next + 1) % count;
    },
    update(dt) {
      list.forEach((s, i) => {
        if (!s.rest) {
          s.velocity.y -= 9.8 * dt;
          s.position.addScaledVector(s.velocity, dt);
          s.angle += s.rate * dt;
          if (s.position.y < s.floor) {
            s.position.y = s.floor;
            s.velocity.set(s.velocity.x * 0.3, -s.velocity.y * 0.2, s.velocity.z * 0.3);
            if (Math.abs(s.velocity.y) < 0.5) s.rest = true;
          }
        }
        // Resting shards lie flat on the ground.
        if (s.rest) quaternion.setFromEuler(euler.set(-Math.PI / 2, 0, s.angle));
        else quaternion.setFromAxisAngle(s.spin, s.angle);
        mesh.setMatrixAt(i, matrix.compose(s.position, quaternion, new THREE.Vector3(s.size, s.size, s.size)));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() {
      list.length = 0;
      next = 0;
      mesh.count = 0;
    },
  };
}

function createMeter() {
  const element = document.createElement('div');
  element.className = 'damage';
  element.innerHTML = '<span>Damage</span><div class="damage-bar" role="meter" aria-label="Damage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><b>0%</b>';
  const bar = element.querySelector('.damage-bar');
  const fill = element.querySelector('i');
  const label = element.querySelector('b');
  return {
    element,
    set(fraction) {
      const percent = Math.round(fraction * 100);
      fill.style.width = `${percent}%`;
      fill.style.background = fraction < 0.35 ? '#3fb950' : fraction < 0.75 ? '#f0a020' : '#e5332a';
      label.textContent = `${percent}%`;
      bar.setAttribute('aria-valuenow', String(percent));
    },
  };
}
