// Recorded sounds from public/sounds, built by scripts/build-sounds.sh, through
// one audio context and one master volume that mute() silences. Browsers keep
// audio off until the player presses a key or clicks, so the context starts
// suspended and resumes on the first sound played after that.
let context = null;
let master = null;
const buffers = {};

export function audio() {
  if (!context) {
    context = new AudioContext();
    master = new GainNode(context);
    master.connect(context.destination);
  }
  return context;
}

// Where sounds are connected to be heard.
export function output() {
  audio();
  return master;
}

// A sound's decoded audio, by its file name in public/sounds, such as "crash.mp3".
export function load(file) {
  buffers[file] ??= fetch(`/sounds/${file}`)
    .then((response) => response.arrayBuffer())
    .then((data) => audio().decodeAudioData(data));
  return buffers[file];
}

// Plays a sound once, at `gain` volume and `rate` times its speed and pitch.
export function play(file, gain, rate = 1) {
  load(file).then((buffer) => {
    audio().resume();
    const source = new AudioBufferSourceNode(context, { buffer, playbackRate: rate });
    source.connect(new GainNode(context, { gain })).connect(master);
    source.start();
  });
}

// Looping sounds play without a click or key of their own, so the first
// gesture anywhere wakes the context. iOS counts only some events as gestures.
for (const type of ['keydown', 'pointerup', 'touchend', 'click']) {
  window.addEventListener(type, () => audio().resume(), { capture: true });
}

export function mute(muted) {
  output().gain.value = muted ? 0 : 1;
}
