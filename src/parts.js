// Major parts of the Porsche 911 Turbo S (992). Keys match the node names that
// scripts/build-model.mjs writes into public/models/porsche-911.glb.
//
// `shop` is how scripts/find-shop-links.mjs searches Shopify's Global Catalog
// for listings of the part: a search query, a pattern listing titles must match,
// and optionally one they must not.
//
// `explode` is how far the part travels, in meters, when the car is fully exploded,
// in car space: +x toward the front, +y up, +z toward the car's right side.
//
// `interior` parts stay in place and stay selectable in the interior view, which
// moves every other part out of the way. `view` is the horizontal direction the
// camera looks at a part from, when the default (the way it explodes) is wrong:
// cockpit parts are seen from the seats.
const wheel = (front, side) => ({
  name: `${front ? 'Front' : 'Rear'} ${side === 1 ? 'right' : 'left'} wheel & tire`,
  bullets: front
    ? ['20-inch Turbo S alloy rim', '255/35 ZR 20 performance tire', 'Center-lock style hub with Porsche crest']
    : ['21-inch staggered alloy rim', '315/30 ZR 21 performance tire', 'Wider rear track for traction'],
  explode: [0, 0, 0.95 * side],
  shop: {
    query: `Porsche 992 Turbo S ${front ? 'front 20 inch' : 'rear 21 inch'} centerlock wheel`,
    match: front ? /wheel.*(front|20x)|(front|20x).*wheel/i : /wheel.*(rear|21x)|(rear|21x).*wheel/i,
    exclude: front ? /rear/i : /front/i,
  },
});
const brake = (front, side) => ({
  name: `${front ? 'Front' : 'Rear'} ${side === 1 ? 'right' : 'left'} brake`,
  bullets: front
    ? ['Porsche Ceramic Composite Brake (PCCB), standard on Turbo S', '10-piston monobloc caliper', '420 mm carbon-ceramic disc']
    : ['Porsche Ceramic Composite Brake (PCCB)', 'Four-piston monobloc caliper', '390 mm carbon-ceramic disc'],
  explode: [0, 0, 0.5 * side],
  shop: {
    query: `Porsche 992 Turbo S ${front ? 'front' : 'rear'} PCCB brake rotor`,
    match: /rotor|disc|brake|caliper/i,
    exclude: front ? /\brear\b/i : /\bfront\b/i,
  },
});

export const PARTS = {
  body: {
    name: 'Body shell',
    bullets: ['Aluminum-intensive steel and aluminum structure', 'Wide Turbo body with intercooler intakes behind the doors', 'Carries the 3.7 L twin-turbo flat-six and all-wheel drive'],
    explode: [0, 0, 0],
  },
  hood: {
    name: 'Front lid',
    bullets: ['Lightweight aluminum panel', 'Covers the front luggage compartment', 'Recessed center section echoing early 911s'],
    explode: [0.6, 0.9, 0],
    shop: { query: 'Porsche 992 Turbo S front hood', match: /hood|bonnet|front lid/i },
  },
  roof: {
    name: 'Roof panel',
    bullets: ['Aluminum roof skin', 'Low, sloping 911 roofline', 'Bonded to the body structure'],
    explode: [0, 2.0, 0],
    shop: { query: 'Porsche 992 carbon roof panel', match: /roof panel/i, exclude: /fin|rails?/i },
  },
  decklid: {
    name: 'Engine lid & rear wing',
    bullets: ['Vertical-slat air intake grille', 'Adaptive rear wing that extends and tilts with speed', 'Access to the 640 hp twin-turbo flat-six'],
    explode: [-0.7, 0.9, 0],
    shop: { query: 'Porsche 992 Turbo S rear wing engine lid', match: /engine lid|deck ?lid|wing|spoiler/i },
  },
  windshield: {
    name: 'Windshield',
    bullets: ['Laminated safety glass', 'Acoustic interlayer for a quieter cabin', 'Rain and light sensor mount'],
    explode: [0.3, 1.5, 0],
    shop: { query: 'Porsche 992 windshield glass', match: /windshield|windscreen/i },
  },
  rear_window: {
    name: 'Rear window',
    bullets: ['Heated tempered glass', 'Steeply raked fastback profile'],
    explode: [-0.3, 1.5, 0],
    shop: { query: 'Porsche 992 rear window glass', match: /rear window|rear glass|back glass/i, exclude: /extension/i },
  },
  door_l: {
    name: 'Left door',
    bullets: ['Aluminum door skin', 'Frameless side window', 'Includes exterior mirror and door card'],
    explode: [0, 0.15, -1.1],
    shop: { query: 'Porsche 992 carbon door', match: /\bdoors?\b/i, exclude: /sill|trim|armrest|strap|mats?\b/i },
  },
  door_r: {
    name: 'Right door',
    bullets: ['Aluminum door skin', 'Frameless side window', 'Includes exterior mirror and door card'],
    explode: [0, 0.15, 1.1],
    shop: { query: 'Porsche 992 carbon door', match: /\bdoors?\b/i, exclude: /sill|trim|armrest|strap|mats?\b/i },
  },
  fender_l: {
    name: 'Left front fender',
    bullets: ['Aluminum panel', 'Sculpted arch over the 20-inch front wheel'],
    explode: [0.3, 0.3, -0.85],
    shop: { query: 'Porsche 992 Turbo S front fender', match: /fenders?\b/i },
  },
  fender_r: {
    name: 'Right front fender',
    bullets: ['Aluminum panel', 'Sculpted arch over the 20-inch front wheel'],
    explode: [0.3, 0.3, 0.85],
    shop: { query: 'Porsche 992 Turbo S front fender', match: /fenders?\b/i },
  },
  front_bumper: {
    name: 'Front bumper',
    bullets: ['Large cooling intakes for the front radiators', 'Pneumatically deployed adaptive front spoiler lip', 'Active cooling-air flaps'],
    explode: [1.2, 0, 0],
    shop: { query: 'Porsche 992 Turbo S front bumper', match: /front bumper|front lip|splitter/i },
  },
  rear_bumper: {
    name: 'Rear bumper & diffuser',
    bullets: ['Rear diffuser and reflectors', 'Cutouts for the exhaust tailpipes', 'License plate mount'],
    explode: [-1.2, -0.05, 0],
    shop: { query: 'Porsche 992 Turbo S rear bumper diffuser', match: /rear bumper|diffuser/i },
  },
  headlight_l: {
    name: 'Left headlight',
    bullets: ['LED matrix main beam', 'PDLS Plus, standard on Turbo S', 'Signature four-point daytime running lights'],
    explode: [0.8, 0.45, -0.45],
    shop: { query: 'Porsche 992 Turbo LED matrix headlight', match: /headlights?|headlamps?/i, exclude: /\b(991|996|997)\b|style|upgrade/i },
  },
  headlight_r: {
    name: 'Right headlight',
    bullets: ['LED matrix main beam', 'PDLS Plus, standard on Turbo S', 'Signature four-point daytime running lights'],
    explode: [0.8, 0.45, 0.45],
    shop: { query: 'Porsche 992 Turbo LED matrix headlight', match: /headlights?|headlamps?/i, exclude: /\b(991|996|997)\b|style|upgrade/i },
  },
  taillight: {
    name: 'Rear light bar',
    bullets: ['Full-width LED light strip', 'Integrated brake lights and indicators', 'Illuminated PORSCHE lettering'],
    explode: [-1.0, 0.5, 0],
    shop: { query: 'Porsche 992 rear center taillight light bar', match: /tail ?lights?|light bar|tail lamp|heckleuchte|achterlicht/i },
  },
  exhaust: {
    name: 'Exhaust tailpipes',
    bullets: ['Twin pairs of rectangular Turbo tailpipes', 'Fed by the 3.7 L twin-turbo flat-six', 'Optional sports exhaust with valve control'],
    explode: [-1.5, -0.1, 0],
    shop: { query: 'Porsche 992 Turbo S exhaust tips', match: /tips?\b|tailpipes?|exhaust/i },
  },
  dashboard: {
    interior: true,
    view: [-1, 0, 0.35],
    name: 'Dashboard & center console',
    bullets: ['Analog center tachometer flanked by 7-inch displays', '10.9-inch PCM touchscreen', 'Short PDK selector lever'],
    explode: [0.5, 1.1, 0],
    shop: { query: 'Porsche 992 dashboard interior trim', match: /dash|console/i },
  },
  steering_wheel: {
    interior: true,
    view: [-1, 0, 0.35],
    name: 'Steering wheel',
    bullets: ['GT sport steering wheel', 'Paddle shifters for the 8-speed PDK', 'Drive mode switch'],
    explode: [0.3, 1.35, 0],
    shop: { query: 'Porsche 992 steering wheel', match: /steering wheel/i },
  },
  seat_l: {
    interior: true,
    name: 'Driver seat',
    bullets: ['18-way Adaptive Sports Seats Plus', 'Memory and heated settings', 'Perforated leather center panels'],
    explode: [0, 1.0, -0.35],
    shop: { query: 'Porsche 992 sports seat', match: /\bseats?\b/i, exclude: /extinguisher|base|bracket|insert|adjuster|protector|cushion/i },
  },
  seat_r: {
    interior: true,
    name: 'Passenger seat',
    bullets: ['18-way Adaptive Sports Seats Plus', 'Heated, power adjustable', 'Perforated leather center panels'],
    explode: [0, 1.0, 0.35],
    shop: { query: 'Porsche 992 sports seat', match: /\bseats?\b/i, exclude: /extinguisher|base|bracket|insert|adjuster|protector|cushion/i },
  },
  rear_seats: {
    interior: true,
    name: 'Rear seats',
    bullets: ['2+2 occasional seating', 'Fold-down backrests for extra storage'],
    explode: [-0.4, 1.05, 0],
    shop: { query: 'Porsche 992 rear seat', match: /rear seats?|seat delete/i },
  },
  shifter: {
    interior: true,
    view: [-1, 0, 0.35],
    name: 'PDK gear selector',
    bullets: ['Compact shift-by-wire selector', 'Controls the 8-speed PDK transmission', 'P, R, N and D on a short toggle'],
    explode: [0.15, 1.3, 0],
    shop: { query: 'Porsche 992 PDK gear selector shifter', match: /shift|selector|gear/i },
  },
  center_console: {
    interior: true,
    view: [-1, 0, 0.35],
    name: 'Center console & armrest',
    bullets: ['Leather-trimmed armrest with storage', 'Cup holders and USB-C ports', 'Runs between the front seats'],
    explode: [-0.2, 1.2, 0],
    shop: { query: 'Porsche 992 center console armrest', match: /console|armrest/i },
  },
  carpet: {
    interior: true,
    name: 'Carpet & floor mats',
    bullets: ['Velour floor carpet', 'Fitted floor mats with Porsche lettering', 'Covers the front and rear footwells'],
    explode: [0, -0.4, 0],
    shop: { query: 'Porsche 992 floor mats', match: /floor mats?|carpet/i },
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
