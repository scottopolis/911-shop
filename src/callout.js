import * as THREE from 'three';

// A part label drawn on a plane in the 3D scene: a title, an underline and bullet
// points, joined to a point on the part by a leader line. The plane stays fixed
// in the car's frame, so it turns with the car as you orbit, and it flips to its
// other face when the camera moves behind it so the text never reads mirrored.
const WIDTH = 1.5; // meters
const PX = 1024; // canvas width in pixels
const PAD = 12;
const TITLE_SIZE = 72;
const BULLET_SIZE = 40;
const LINE_GAP = 14;
const SHOP_HEAD = 30;
const SHOP_ROW = 92; // height of one listing row, in pixels
const ACCENT = '#1d4ed8';

const money = (amount, currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

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

// Returns the label texture, its size in meters, and the listing rows as canvas
// pixel ranges so a click on the plane can find the listing under it.
function drawLabel({ name, bullets }, listings) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = (size, weight) => `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const bulletIndent = 52;

  ctx.font = font(BULLET_SIZE, 400);
  const wrapped = bullets.map((b) => wrap(ctx, b, PX - PAD * 2 - bulletIndent));
  const underlineY = TITLE_SIZE + 26;
  const bulletsEnd = underlineY + 34 + wrapped.reduce((h, lines) => h + lines.length * (BULLET_SIZE + 8) + LINE_GAP, 0);
  const shopTop = bulletsEnd + 20;
  const height = listings.length ? shopTop + SHOP_HEAD + 24 + listings.length * SHOP_ROW : bulletsEnd;

  canvas.width = PX;
  canvas.height = Math.ceil(height);
  // A soft light halo keeps the text readable where it crosses the car.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(245, 245, 245, 0.7)';
  const halo = (text, x, y, width) => {
    ctx.lineWidth = width;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  };
  ctx.fillStyle = '#111';
  ctx.font = font(TITLE_SIZE, 600);
  ctx.textBaseline = 'alphabetic';
  halo(name, PAD, TITLE_SIZE, 14);
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
      halo(line, PAD + bulletIndent, y, 10);
      y += BULLET_SIZE + 8;
    }
    y += LINE_GAP;
  }

  const rows = [];
  if (listings.length) {
    ctx.fillStyle = '#555';
    ctx.font = font(SHOP_HEAD, 600);
    halo('WHERE TO BUY', PAD, shopTop + SHOP_HEAD, 8);
    let top = shopTop + SHOP_HEAD + 24;
    for (const { title, seller, price, currency } of listings) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(0, top, PX, SHOP_ROW - 10);
      ctx.fillStyle = ACCENT;
      ctx.fillRect(0, top, 6, SHOP_ROW - 10);
      ctx.font = font(32, 600);
      ctx.fillStyle = '#111';
      const priceText = money(price, currency);
      const priceWidth = ctx.measureText(priceText).width;
      ctx.fillText(priceText, PX - PAD - priceWidth, top + 38);
      ctx.fillText(fit(ctx, title, PX - PAD * 3 - 20 - priceWidth), PAD + 14, top + 38);
      ctx.font = font(26, 400);
      ctx.fillStyle = ACCENT;
      ctx.fillText(`${seller}  ↗`, PAD + 14, top + 72);
      rows.push([top, top + SHOP_ROW - 10]);
      top += SHOP_ROW;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const scale = WIDTH / PX;
  return { texture, height: canvas.height * scale, underlineY: (underlineY + 1.5) * scale, rows, pixelHeight: canvas.height };
}

const overlay = (material) => Object.assign(material, { depthTest: false, depthWrite: false, toneMapped: false });

export class Callout {
  // part: the part's Object3D. localAnchor: the point on the part, in its local
  // space, that the line points at. outward: horizontal unit vector, in world
  // space, that the label faces and is pushed toward. The label's bottom edge
  // floats at least `minY` high, above the car, and its text runs along `textDir` (horizontal,
  // perpendicular to `outward`) from whichever side it is read.
  constructor(info, part, localAnchor, { outward, textDir, minY, listings = [] }) {
    this.part = part;
    this.localAnchor = localAnchor.clone();
    this.outward = outward.clone();
    this.textDir = textDir.clone();
    this.minY = minY;
    this.group = new THREE.Group();

    const { texture, height, underlineY, rows, pixelHeight } = drawLabel(info, listings);
    this.texture = texture;
    this.listings = listings;
    this.rows = rows;
    this.pixelHeight = pixelHeight;
    // The pivot sits where the leader line meets the left end of the underline.
    this.pivot = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, height),
      overlay(new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide })),
    );
    // The underline's left end sits on the pivot; the title above it, the rest below.
    plane.position.set(WIDTH / 2, underlineY - height / 2, 0);
    this.height = height;
    this.underlineY = underlineY;
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

    // The label's bottom edge floats 0.5 m above the anchor and at least at minY.
    const p = this.pivot.position.copy(this.anchor).addScaledVector(this.outward, 0.7);
    p.y = Math.max(p.y + 0.5, this.minY) + this.height - this.underlineY;

    const toCamera = camera.position.clone().sub(p);
    const facing = toCamera.dot(this.outward) >= 0 ? this.outward : this.outward.clone().negate();
    this.pivot.lookAt(p.clone().add(facing));

    // Hang the text off the end of the underline that lies along textDir.
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.pivot.quaternion);
    this.plane.position.x = localX.dot(this.textDir) >= 0 ? WIDTH / 2 : -WIDTH / 2;

    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, this.anchor.x, this.anchor.y, this.anchor.z);
    pos.setXYZ(1, p.x, p.y, p.z);
    pos.needsUpdate = true;
  }

  // The listing under the ray, if it hits one of the label's "where to buy" rows.
  listingAt(raycaster) {
    const hit = raycaster.intersectObject(this.plane)[0];
    if (!hit) return null;
    const y = (1 - hit.uv.y) * this.pixelHeight;
    const row = this.rows.findIndex(([top, bottom]) => y >= top && y <= bottom);
    return this.listings[row] ?? null;
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
