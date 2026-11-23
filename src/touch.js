// On-screen controls for touch screens: steering under the left thumb, the
// pedals and handbrake under the right. Each button holds down the same
// driving key as the keyboard for as long as a finger stays on it, and a
// finger slid from one steering button to the other steers the other way.
// The stylesheet shows them only on touch screens.
const BUTTONS = [
  { side: 'steer', key: 'left', label: '◀', name: 'Steer left' },
  { side: 'steer', key: 'right', label: '▶', name: 'Steer right' },
  { side: 'pedals', key: 'fire', label: 'Fire', name: 'Shoot' },
  { side: 'pedals', key: 'brake', label: 'Hand\nbrake', name: 'Handbrake' },
  { side: 'pedals', key: 'down', label: 'Brake', name: 'Brake, then reverse' },
  { side: 'pedals', key: 'up', label: 'Gas', name: 'Accelerate' },
];

// Adds the controls to the page. `keys` is the set of driving keys held down;
// `onPress` runs when a finger first touches a control.
export function addTouchControls(keys, onPress) {
  const sides = {};
  const held = new Map(); // finger (pointer id) -> the key it holds
  for (const side of ['steer', 'pedals']) {
    sides[side] = document.createElement('div');
    sides[side].className = `touch touch-${side}`;
    document.body.append(sides[side]);
  }
  for (const b of BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-${b.key}`;
    button.dataset.key = b.key;
    button.textContent = b.label;
    button.setAttribute('aria-label', b.name);
    sides[b.side].append(button);
  }

  // The key under a finger, for sliding between the steering buttons.
  const keyAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('.touch button')?.dataset.key;
  const refresh = () => {
    for (const b of BUTTONS) keys.delete(b.key);
    for (const key of held.values()) keys.add(key);
    for (const button of document.querySelectorAll('.touch button')) {
      button.classList.toggle('held', [...held.values()].includes(button.dataset.key));
    }
  };

  for (const side of Object.values(sides)) {
    side.addEventListener('pointerdown', (e) => {
      const key = e.target.closest('button')?.dataset.key;
      if (!key) return;
      e.preventDefault();
      side.setPointerCapture(e.pointerId);
      held.set(e.pointerId, key);
      refresh();
      onPress();
    });
    side.addEventListener('pointermove', (e) => {
      if (!held.has(e.pointerId) || side !== sides.steer) return;
      const key = keyAt(e);
      if ((key === 'left' || key === 'right') && key !== held.get(e.pointerId)) {
        held.set(e.pointerId, key);
        refresh();
      }
    });
    const release = (e) => {
      if (held.delete(e.pointerId)) refresh();
    };
    side.addEventListener('pointerup', release);
    side.addEventListener('pointercancel', release);
    side.addEventListener('lostpointercapture', release);
    side.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
