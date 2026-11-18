// Major parts of the Porsche 911 Carrera 4S (992). Keys match the node names that
// scripts/build-model.mjs writes into public/models/porsche-911.glb.
//
// `explode` is how far the part travels, in meters, when the car is fully exploded,
// in car space: +x toward the front, +y up, +z toward the car's right side.
const wheel = (front, side) => ({
  name: `${front ? 'Front' : 'Rear'} ${side === 1 ? 'right' : 'left'} wheel & tire`,
  bullets: front
    ? ['20-inch forged-look alloy rim', '245/35 ZR 20 performance tire', 'Center-cap Porsche crest']
    : ['21-inch staggered alloy rim', '305/30 ZR 21 performance tire', 'Wider rear track for traction'],
  explode: [0, 0, 0.95 * side],
});
const brake = (front, side) => ({
  name: `${front ? 'Front' : 'Rear'} ${side === 1 ? 'right' : 'left'} brake`,
  bullets: front
    ? ['Six-piston monobloc caliper', '350 mm internally vented, cross-drilled disc', 'Red-painted calipers on the 4S']
    : ['Four-piston monobloc caliper', '330 mm internally vented, cross-drilled disc', 'Integrated electric parking brake'],
  explode: [0, 0, 0.5 * side],
});

export const PARTS = {
  body: {
    name: 'Body shell',
    bullets: ['Aluminum-intensive steel and aluminum structure', 'Wide-body rear haunches shared by all 992 Carreras', 'Carries every other panel and the drivetrain'],
    explode: [0, 0, 0],
  },
  hood: {
    name: 'Front lid',
    bullets: ['Lightweight aluminum panel', 'Covers the front luggage compartment', 'Recessed center section echoing early 911s'],
    explode: [0.6, 0.9, 0],
  },
  roof: {
    name: 'Roof panel',
    bullets: ['Aluminum roof skin', 'Low, sloping 911 roofline', 'Bonded to the body structure'],
    explode: [0, 2.0, 0],
  },
  decklid: {
    name: 'Engine lid & rear spoiler',
    bullets: ['Vertical-slat air intake grille', 'Integrated adaptive rear spoiler', 'Access to the twin-turbo flat-six'],
    explode: [-0.7, 0.9, 0],
  },
  windshield: {
    name: 'Windshield',
    bullets: ['Laminated safety glass', 'Acoustic interlayer for a quieter cabin', 'Rain and light sensor mount'],
    explode: [0.3, 1.5, 0],
  },
  rear_window: {
    name: 'Rear window',
    bullets: ['Heated tempered glass', 'Steeply raked fastback profile'],
    explode: [-0.3, 1.5, 0],
  },
  door_l: {
    name: 'Left door',
    bullets: ['Aluminum door skin', 'Frameless side window', 'Includes exterior mirror and door card'],
    explode: [0, 0.15, -1.1],
  },
  door_r: {
    name: 'Right door',
    bullets: ['Aluminum door skin', 'Frameless side window', 'Includes exterior mirror and door card'],
    explode: [0, 0.15, 1.1],
  },
  fender_l: {
    name: 'Left front fender',
    bullets: ['Aluminum panel', 'Sculpted arch over the 20-inch front wheel'],
    explode: [0.3, 0.3, -0.85],
  },
  fender_r: {
    name: 'Right front fender',
    bullets: ['Aluminum panel', 'Sculpted arch over the 20-inch front wheel'],
    explode: [0.3, 0.3, 0.85],
  },
  front_bumper: {
    name: 'Front bumper',
    bullets: ['Cooling intakes for the front radiators', 'Active cooling-air flaps', 'Integrated LED front lights'],
    explode: [1.2, 0, 0],
  },
  rear_bumper: {
    name: 'Rear bumper & diffuser',
    bullets: ['Rear diffuser and reflectors', 'Cutouts for the exhaust tailpipes', 'License plate mount'],
    explode: [-1.2, -0.05, 0],
  },
  headlight_l: {
    name: 'Left headlight',
    bullets: ['LED main beam', 'Signature four-point daytime running lights', 'Optional PDLS Plus matrix units'],
    explode: [0.8, 0.45, -0.45],
  },
  headlight_r: {
    name: 'Right headlight',
    bullets: ['LED main beam', 'Signature four-point daytime running lights', 'Optional PDLS Plus matrix units'],
    explode: [0.8, 0.45, 0.45],
  },
  taillight: {
    name: 'Rear light bar',
    bullets: ['Full-width LED light strip', 'Integrated brake lights and indicators', 'Illuminated PORSCHE lettering'],
    explode: [-1.0, 0.5, 0],
  },
  exhaust: {
    name: 'Exhaust tailpipes',
    bullets: ['Stainless steel tailpipe trims', 'Fed by the 3.0 L twin-turbo flat-six'],
    explode: [-1.5, -0.1, 0],
  },
  dashboard: {
    name: 'Dashboard & center console',
    bullets: ['Analog center tachometer flanked by 7-inch displays', '10.9-inch PCM touchscreen', 'Short PDK selector lever'],
    explode: [0.5, 1.1, 0],
  },
  steering_wheel: {
    name: 'Steering wheel',
    bullets: ['GT sport steering wheel', 'Paddle shifters for the 8-speed PDK', 'Drive mode switch'],
    explode: [0.3, 1.35, 0],
  },
  seat_l: {
    name: 'Driver seat',
    bullets: ['Leather sports seat', 'Power adjustable with memory', 'Perforated center panels'],
    explode: [0, 1.0, -0.35],
  },
  seat_r: {
    name: 'Passenger seat',
    bullets: ['Leather sports seat', 'Power adjustable', 'Perforated center panels'],
    explode: [0, 1.0, 0.35],
  },
  rear_seats: {
    name: 'Rear seats',
    bullets: ['2+2 occasional seating', 'Fold-down backrests for extra storage'],
    explode: [-0.4, 1.05, 0],
  },
  wheel_fl: wheel(true, -1),
  wheel_fr: wheel(true, 1),
  wheel_rl: wheel(false, -1),
  wheel_rr: wheel(false, 1),
  brake_fl: brake(true, -1),
  brake_fr: brake(true, 1),
  brake_rl: brake(false, -1),
  brake_rr: brake(false, 1),
};
