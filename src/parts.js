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
// cockpit parts are seen from the seats. A nonzero y sets how high the camera
// looks from instead of the default.
//
// A part with a `hinge` opens and closes when it is clicked. `opens` makes a
// click on this part work another one instead, such as the frunk opening the
// front lid over it. A hinge is a pivot point and axis in car space, and how
// far it opens in radians.
//
// `steer` turns a part with the steering wheel: about an axis through a pivot,
// by `ratio` radians per radian the wheel turns.

// The front wheels and brakes turn about a vertical axis through the hub, at
// about 1/15 of the steering wheel's angle; turning right yaws them toward +z.
const frontSteer = (side) => ({ pivot: [-1.04, 0.19, 0.78 * side], axis: [0, 1, 0], ratio: -1 / 15 });

const wheel = (front, side) => ({
  name: `${front ? 'Front' : 'Rear'} ${side === 1 ? 'right' : 'left'} wheel & tire`,
  bullets: front
    ? ['20-inch Turbo S alloy rim', '255/35 ZR 20 performance tire', 'Center-lock style hub with Porsche crest']
    : ['21-inch staggered alloy rim', '315/30 ZR 21 performance tire', 'Wider rear track for traction'],
  explode: [0, 0, 0.95 * side],
  steer: front ? frontSteer(side) : undefined,
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
  steer: front ? frontSteer(side) : undefined,
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
    hinge: { pivot: [-1.52, 0.73, 0], axis: [0, 0, 1], angle: 1.05 },
    shop: { query: 'Porsche 992 Turbo S front hood', match: /hood|bonnet|front lid/i },
  },
  frunk: {
    opens: 'hood',
    view: [1, 0.9, 0.35],
    name: 'Front trunk (frunk)',
    bullets: ['128-liter luggage compartment under the front lid', 'Carpeted tub between the front wheel arches', 'Warning triangle stowed on the rear wall'],
    explode: [0, -0.6, 0],
    shop: { query: 'Porsche 992 front trunk liner', match: /trunk|frunk|luggage|cargo/i },
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
    hinge: { pivot: [-1.627, 0, -0.831], axis: [0, -1, 0], angle: 1.0 },
    shop: { query: 'Porsche 992 carbon door', match: /\bdoors?\b/i, exclude: /sill|trim|armrest|strap|mats?\b/i },
  },
  door_r: {
    name: 'Right door',
    bullets: ['Aluminum door skin', 'Frameless side window', 'Includes exterior mirror and door card'],
    explode: [0, 0.15, 1.1],
    hinge: { pivot: [-1.627, 0, 0.831], axis: [0, 1, 0], angle: 1.0 },
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
    name: 'Dashboard',
    bullets: ['Leather-wrapped upper dash with a full-width trim strip', '10.9-inch PCM touchscreen built into the center', 'Outer air vents at each end'],
    explode: [0.5, 1.1, 0],
    shop: { query: 'Porsche 992 dashboard interior trim', match: /dash/i },
  },
  instrument_cluster: {
    interior: true,
    view: [-1, 0, 0.1],
    name: 'Instrument cluster',
    bullets: ['Analog center tachometer, a 911 tradition', 'Two 7-inch displays for maps, g-meter and car data', 'Hooded to cut glare'],
    explode: [-0.7, 0.8, 0],
    shop: { query: 'Porsche 992 instrument cluster', match: /cluster|gauge|tach/i },
  },
  sport_chrono: {
    interior: true,
    view: [-1, 0, 0.2],
    name: 'Sport Chrono clock',
    bullets: ['Dash-top stopwatch from the Sport Chrono Package', 'Times laps and shows the drive mode', 'Standard on the Turbo S'],
    explode: [-0.3, 1, 0],
    shop: { query: 'Porsche 992 sport chrono clock', match: /chrono|clock/i, exclude: /\bstl\b|wall clock|digital file/i },
  },
  center_stack: {
    interior: true,
    view: [-1, 0, 0.2],
    name: 'Climate & vents',
    bullets: ['Center air vents', 'Two-zone climate switches', 'Hazard and drive-assist buttons'],
    explode: [-0.8, 0.5, 0],
    shop: { query: 'Porsche 992 dashboard center air vent', match: /vent|climate/i, exclude: /bumper|hose|breather|side air|exterior|hood|fender/i },
  },
  glovebox: {
    interior: true,
    view: [-1, 0, -0.3],
    name: 'Glovebox',
    bullets: ['Leather-trimmed lid', 'Lockable storage on the passenger side', 'Sits under the dash trim strip'],
    explode: [-0.8, 0.3, 0],
    shop: { query: 'Porsche 911 992 glovebox', match: /glove/i, exclude: /mount|holder|phone/i },
  },
  overhead_console: {
    interior: true,
    view: [-1, 0, 0.2],
    name: 'Overhead console',
    bullets: ['Interior and map lights', 'Emergency call button', 'Garage door opener (HomeLink)'],
    explode: [0, 0.8, 0],
    shop: { query: 'Porsche 992 interior LED light', match: /interior|overhead|dome|map light|reading light/i, exclude: /tail|head|fog|marker|puddle|door|footwell|ambient|strip/i },
  },
  steering_wheel: {
    interior: true,
    view: [-1, 0, 0.35],
    name: 'Steering wheel',
    bullets: ['GT sport steering wheel', 'Paddle shifters for the 8-speed PDK', 'Drive mode switch'],
    explode: [0.3, 1.35, 0],
    // Matches STEERING_HUB and STEERING_AXIS in scripts/build-model.mjs.
    steer: { pivot: [-2.058, 0.626, -0.34], axis: [0.968, -0.25, 0], ratio: 1 },
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
