import * as THREE from 'three';

// Grass that reaches the horizon. The plane follows the car in whole-tile
// steps, so the grass stays put as the car drives over it and never runs out.
const TILE = 4; // meters per texture tile
const SIZE = 1200;

export function createGround(renderer) {
  const texture = new THREE.CanvasTexture(drawGrass(512));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(SIZE / TILE, SIZE / TILE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  // Below the lowest point of the track, as a backdrop past its edges.
  const follow = (p) => mesh.position.set(Math.round(p.x / TILE) * TILE, -8, Math.round(p.z / TILE) * TILE);
  follow(new THREE.Vector3());
  return { mesh, follow };
}

function drawGrass(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5b7142';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 36;
    image.data[i] += grain * 0.6;
    image.data[i + 1] += grain;
    image.data[i + 2] += grain * 0.3;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// A soft dark patch under the car, where the studio lights cannot reach, sized
// to the car's footprint in meters.
export function createContactShadow(length, width) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.005;
  return mesh;
}

// Black rubber laid on the floor by sliding tires: each tire draws a strip
// from where it was last frame to where it is now. The oldest marks give way
// to new ones once MAX_MARKS are down.
const MAX_MARKS = 3000;
export function createSkidMarks() {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x4d4c49, polygonOffset: true, polygonOffsetFactor: -2 });
  // Solid rather than see-through, so overlapping strips show no seams.
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_MARKS);
  mesh.count = 0;
  mesh.frustumCulled = false;
  let next = 0;
  let last = null; // the tires' positions last frame, while they slide
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    lay(tires) {
      if (last) {
        tires.forEach((to, i) => {
          const from = last[i];
          const length = Math.hypot(to.x - from.x, to.z - from.z);
          if (length < 1e-3) return;
          quaternion.setFromAxisAngle(up, Math.atan2(-(to.z - from.z), to.x - from.x));
          const center = new THREE.Vector3((to.x + from.x) / 2, (to.y + from.y) / 2 + 0.02, (to.z + from.z) / 2);
          mesh.setMatrixAt(next, matrix.compose(center, quaternion, new THREE.Vector3(length + 0.05, 1, 0.24)));
          next = (next + 1) % MAX_MARKS;
          mesh.count = Math.min(MAX_MARKS, mesh.count + 1);
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
      last = tires;
    },
    lift() {
      last = null;
    },
    clear() {
      last = null;
      mesh.count = 0;
      next = 0;
    },
  };
}
