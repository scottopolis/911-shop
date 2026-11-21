import { audio, load, output } from './sound.js';

// The sounds of driving: tires squealing through a slide, from a recording of
// real tires (public/sounds/squeal.wav), and wind and road roar that rise with
// speed, shaped from noise the way real wind and tire roar sound.
//
// The squeal starts at SQUEAL_FROM radians of slide and is full by SQUEAL_FULL.
const SQUEAL_FROM = 0.06;
const SQUEAL_FULL = 0.35;
// Wind is WIND loud at WIND_SPEED m/s, rising with the square of the speed;
// road roar is ROAD loud at ROAD_SPEED, rising in step with the speed.
const WIND = 0.3;
const WIND_SPEED = 70;
const ROAD = 0.22;
const ROAD_SPEED = 45;
const EASE = 0.06; // seconds the volumes take to follow

export function createDriveSound() {
  let squeal = null;
  let wind = null;
  let road = null;

  function start() {
    const context = audio();
    wind = noiseThrough(context, false, new BiquadFilterNode(context, { type: 'bandpass', frequency: 700, Q: 0.6 }));
    road = noiseThrough(context, true, new BiquadFilterNode(context, { type: 'lowpass', frequency: 160, Q: 0.7 }));
    squeal = { gain: new GainNode(context, { gain: 0 }), source: null };
    squeal.gain.connect(output());
    load('squeal.wav').then((buffer) => {
      squeal.source = new AudioBufferSourceNode(context, { buffer, loop: true });
      squeal.source.connect(squeal.gain);
      squeal.source.start();
    });
  }

  // `speed` in m/s, and `slide`, how far in radians the car travels off the
  // way its tires point.
  function update({ speed, slide }) {
    if (!wind) start();
    const now = audio().currentTime;
    const squealing = smoothstep(SQUEAL_FROM, SQUEAL_FULL, slide) * Math.min(1, speed / 6);
    squeal.gain.gain.setTargetAtTime(0.8 * squealing, now, EASE);
    // A harder slide squeals a little higher.
    squeal.source?.playbackRate.setTargetAtTime(0.92 + 0.15 * Math.min(1, slide / 0.6), now, EASE);
    wind.gain.gain.setTargetAtTime(WIND * Math.min(1.5, (speed / WIND_SPEED) ** 2), now, EASE);
    wind.filter.frequency.setTargetAtTime(500 + speed * 12, now, EASE);
    road.gain.gain.setTargetAtTime(ROAD * Math.min(1.3, speed / ROAD_SPEED), now, EASE);
    road.filter.frequency.setTargetAtTime(120 + speed * 4, now, EASE);
  }

  return { update };
}

// Endless noise, white or brown (white summed, which rumbles), through `filter`
// into a silent gain node.
function noiseThrough(context, brown, filter) {
  const buffer = new AudioBuffer({ length: context.sampleRate * 4, sampleRate: context.sampleRate });
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = brown ? (last + 0.02 * white) / 1.02 : white;
    data[i] = brown ? last * 3.5 : white;
  }
  const source = new AudioBufferSourceNode(context, { buffer, loop: true });
  const gain = new GainNode(context, { gain: 0 });
  source.connect(filter).connect(gain).connect(output());
  source.start();
  return { filter, gain };
}

const smoothstep = (from, to, x) => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
