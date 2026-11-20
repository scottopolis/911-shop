// A speedometer drawn like the 992's centre dial: a black face with white
// numerals round a 270 degree sweep, a red needle, and the speed in digits
// below the hub.
const MAX_MPH = 220;
const START = 135; // degrees clockwise from 3 o'clock, at 0 mph
const SWEEP = 270;
const SVG = 'http://www.w3.org/2000/svg';

const angle = (mph) => START + (SWEEP * Math.min(mph, MAX_MPH)) / MAX_MPH;
const at = (degrees, r) => {
  const a = (degrees * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)].map((v) => v.toFixed(2));
};

export function createGauge() {
  let marks = '';
  for (let mph = 0; mph <= MAX_MPH; mph += 10) {
    const major = mph % 20 === 0;
    const [x1, y1] = at(angle(mph), major ? 70 : 76);
    const [x2, y2] = at(angle(mph), 84);
    marks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 2.6 : 1.4}" />`;
    if (major) {
      const [x, y] = at(angle(mph), 60);
      marks += `<text x="${x}" y="${y}">${mph}</text>`;
    }
  }
  const element = document.createElement('div');
  element.className = 'gauge';
  element.hidden = true;
  element.innerHTML = `
    <svg xmlns="${SVG}" viewBox="-100 -100 200 200" role="img" aria-label="Speed">
      <circle r="97" fill="#2a2b2d" />
      <circle r="93" fill="#0b0b0c" stroke="#5c5e61" stroke-width="1.5" />
      <g class="marks" stroke="#f2f2f2" fill="#f2f2f2">${marks}</g>
      <g class="needle">
        <polygon points="-14,-2.4 82,-0.8 82,0.8 -14,2.4" fill="#d5001c" />
      </g>
      <circle r="11" fill="#1b1c1e" stroke="#3a3b3e" stroke-width="1.5" />
      <text class="speed" y="44">0</text>
      <text class="unit" y="60">mph</text>
    </svg>`;
  const needle = element.querySelector('.needle');
  const readout = element.querySelector('.speed');
  return {
    element,
    set(mph) {
      needle.setAttribute('transform', `rotate(${angle(mph).toFixed(2)})`);
      readout.textContent = Math.round(mph);
    },
  };
}
