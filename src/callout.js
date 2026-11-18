import * as THREE from 'three';

// A part label drawn on a plane in the 3D scene: a title, an underline and bullet
// points, joined to a point on the part by a leader line. The plane stays fixed
// in the car's frame, so it turns with the car as you orbit, and it flips to its
// other face when the camera moves behind it so the text never reads mirrored.
const WIDTH = 1.5; // meters
const PX = 1024; // canvas width in pixels
const PAD = 8;
const TITLE_SIZE = 72;
const BULLET_SIZE = 40;
const LINE_GAP = 14;

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  return lines;
}

function drawLabel({ name, bullets }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = (size, weight) => `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const bulletIndent = 52;

  ctx.font = font(BULLET_SIZE, 400);
  const wrapped = bullets.map((b) => wrap(ctx, b, PX - PAD * 2 - bulletIndent));
  const underlineY = TITLE_SIZE + 26;
  const height = underlineY + 34 + wrapped.reduce((h, lines) => h + lines.length * (BULLET_SIZE + 8) + LINE_GAP, 0);

  canvas.width = PX;
  canvas.height = Math.ceil(height);
  ctx.fillStyle = '#111';
  ctx.font = font(TITLE_SIZE, 600);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, PAD, TITLE_SIZE);
  ctx.fillRect(0, underlineY, PX, 3);

  let y = underlineY + 34 + BULLET_SIZE;
  ctx.font = font(BULLET_SIZE, 400);
  ctx.fillStyle = '#333';
  for (const lines of wrapped) {
    ctx.beginPath();
    const ty = y - BULLET_SIZE * 0.34;
    ctx.moveTo(PAD + 10, ty - 10);
    ctx.lineTo(PAD + 28, ty);
    ctx.lineTo(PAD + 10, ty + 10);
    ctx.fill();
    for (const line of lines) {
      ctx.fillText(line, PAD + bulletIndent, y);
      y += BULLET_SIZE + 8;
    }
    y += LINE_GAP;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const scale = WIDTH / PX;
  return { texture, height: canvas.height * scale, underlineY: (underlineY + 1.5) * scale };
}

const overlay = (material) => Object.assign(material, { depthTest: false, depthWrite: false, toneMapped: false });

export class Callout {
  // part: the part's Object3D. localAnchor: the point on the part, in its local
  // space, that the line points at. outward: horizontal unit vector, in world
  // space, that the label faces and is pushed toward. The label floats at least
  // `minY` high, above the car, and its text runs away from `center`.
  constructor(info, part, localAnchor, { outward, center, minY }) {
    this.part = part;
    this.localAnchor = localAnchor.clone();
    this.outward = outward.clone();
    this.center = center.clone();
    this.minY = minY;
    this.group = new THREE.Group();

    const { texture, height, underlineY } = drawLabel(info);
    this.texture = texture;
    // The pivot sits where the leader line meets the left end of the underline.
    this.pivot = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, height),
      overlay(new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide })),
    );
    plane.position.set(WIDTH / 2, height / 2 - underlineY, 0);
    plane.renderOrder = 10;
    this.plane = plane;
    this.pivot.add(plane);

    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      overlay(new THREE.LineBasicMaterial({ color: 0x111111 })),
    );
    this.line.renderOrder = 10;
    this.line.frustumCulled = false;

    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), overlay(new THREE.MeshBasicMaterial({ color: 0x111111 })));
    this.dot.renderOrder = 11;

    this.group.add(this.pivot, this.line, this.dot);
    this.anchor = new THREE.Vector3();
  }

  update(camera) {
    this.part.updateWorldMatrix(true, false);
    this.anchor.copy(this.localAnchor).applyMatrix4(this.part.matrixWorld);
    this.dot.position.copy(this.anchor);

    const p = this.pivot.position.copy(this.anchor).addScaledVector(this.outward, 0.7);
    p.y = Math.max(p.y + 0.5, this.minY);

    const toCamera = camera.position.clone().sub(p);
    const facing = toCamera.dot(this.outward) >= 0 ? this.outward : this.outward.clone().negate();
    this.pivot.lookAt(p.clone().add(facing));

    // Hang the text off whichever end of the underline keeps it clear of the car.
    const textDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.pivot.quaternion);
    const away = textDir.dot(p.clone().sub(this.center)) >= 0;
    this.plane.position.x = away ? WIDTH / 2 : -WIDTH / 2;

    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, this.anchor.x, this.anchor.y, this.anchor.z);
    pos.setXYZ(1, p.x, p.y, p.z);
    pos.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.texture.dispose();
  }
}
