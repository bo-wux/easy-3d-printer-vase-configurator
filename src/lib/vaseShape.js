/**
 * Gedeelde vaasvorm-wiskunde.
 * Zowel de mesh-viewer (STL export) als de print preview gebruiken dit,
 * zodat wat je ziet exact is wat je print.
 *
 * De vorm is altijd r(hoek, hoogte) rond een (eventueel verplaatste) hartlijn.
 * Elke laag is daardoor per definitie een gesloten, niet-zelfsnijdende lus:
 * geschikt voor vase/spiral mode op een FDM printer.
 *
 * Lagen van de vorm:
 *   1. Basisprofiel  - diameter per hoogte (silhouet)
 *   2. Patroon       - symmetrisch: golf / ribbel / groef / ster / paneel
 *   3. Facetten      - polygonale doorsnede
 *   4. Ringen        - horizontale banden over de hoogte
 *   5. Organic       - som van harmonischen met random fases -> asymmetrisch
 *   6. Sway          - de hartlijn zelf verplaatst zich -> scheve vaas
 */

import { FILAMENTS } from './filaments.js';

const TAU = Math.PI * 2;
const smoothstep = (x) => x * x * (3 - 2 * x);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Bambu Lab P1S: 256×256×256 bouwvolume, met marge tot de rand van de plaat
export const PRINTER_LIMITS = {
  bedSize: 256,
  maxHeight: 250,
  maxDiameter: 220,
  minDiameter: 20,
  nozzle: 0.4,
};

// Deterministische PRNG: dezelfde seed geeft altijd exact dezelfde vaas
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHarmonics(seed, count, maxOrder) {
  const rnd = mulberry32(Math.imul(seed, 2654435761) ^ 0x5f356495);
  const harmonics = [];
  let norm = 0;
  for (let i = 0; i < count; i++) {
    const order = 1 + Math.floor(rnd() * maxOrder);
    // 1/sqrt(order): lage ordes domineren -> vloeiende blobs i.p.v. ruis
    const amp = (0.4 + rnd() * 0.6) / Math.sqrt(order);
    harmonics.push({
      order,
      amp,
      phase: rnd() * TAU,
      drift: rnd() * 2 - 1, // hoe snel dit patroon meedraait met de hoogte
      modFreq: 0.4 + rnd() * 2.2, // verticale amplitude-modulatie
      modPhase: rnd() * TAU,
    });
    norm += amp;
  }
  return { harmonics, norm: norm || 1 };
}

export const PATTERN_SHAPES = [
  { id: 'golf', label: 'Golf' },
  { id: 'ribbel', label: 'Ribbel' },
  { id: 'groef', label: 'Groef' },
  { id: 'ster', label: 'Ster' },
  { id: 'paneel', label: 'Paneel' },
  { id: 'zaag', label: 'Zaag' },
  { id: 'punt', label: 'Punt' },
  { id: 'kabel', label: 'Kabel' },
  { id: 'kerf', label: 'Kerf' },
  { id: 'trap', label: 'Trap' },
  { id: 'schelp', label: 'Schelp' },
  { id: 'bol', label: 'Bol' },
];

// Fijne oppervlaktetexturen (bovenop het patroon)
export const TEXTURES = [
  { id: 'geen', label: '— Geen' },
  { id: 'lijnen', label: '⋮ Fijne lijnen' },
  { id: 'ruit', label: '◆ Ruit' },
  { id: 'noppen', label: '⣿ Noppen' },
  { id: 'schub', label: '🐟 Schubben' },
  { id: 'geweven', label: '▦ Geweven' },
  { id: 'grof', label: '▨ Ruw' },
  { id: 'diagonaal', label: '⁄ Diagonaal' },
  { id: 'hamerslag', label: '⬢ Hamerslag' },
];

// Alle profielen leveren een waarde in [-1, 1]
function patternProfile(shape, phase) {
  const s = Math.sin(phase);
  switch (shape) {
    case 'ribbel': // bolle ribben met vlakke tussenruimte
      return 2 * Math.pow(Math.abs(Math.sin(phase / 2)), 0.6) - 1;
    case 'groef': // holle cannelures
      return 1 - 2 * Math.pow(Math.abs(Math.sin(phase / 2)), 0.6);
    case 'ster': // driehoeksgolf -> scherpe punten
      return (2 / Math.PI) * Math.asin(clamp(s, -1, 1));
    case 'paneel': // vlakke panelen met zachte overgang
      return Math.tanh(3 * s) / Math.tanh(3);
    case 'zaag': // zaagtand: steile flank, zachte helling
      return 2 * ((((phase / TAU) % 1) + 1) % 1) - 1;
    case 'punt': // smalle scherpe richels
      return 2 * Math.pow(Math.abs(Math.sin(phase / 2)), 4) - 1;
    case 'kabel': // touw/kabel: dubbele lob per herhaling
      return clamp(0.78 * s + 0.28 * Math.sin(2 * phase + 1.2), -1, 1);
    case 'kerf': // smalle diepe inkepingen: spiegelbeeld van 'punt'
      return 1 - 2 * Math.pow(Math.abs(Math.sin(phase / 2)), 4);
    case 'trap': // getrapte terrassen; vaste stappen i.p.v. een vloeiende golf
      return Math.round(s * 2.5) / 2.5;
    case 'schelp': // asymmetrische golf: bolle rug, ingetrokken flank
      return clamp((s + 0.35 * Math.sin(2 * phase)) / 1.18, -1, 1);
    case 'bol': // brede volle lobben, net iets voller dan een zuivere sinus
      return Math.sign(s) * Math.pow(Math.abs(s), 0.55);
    case 'golf':
    default:
      return s;
  }
}

// Ronde bult in een raster-cel; u en v lopen van -1..1 rond het midden
const blob = (u, v, sharp) => Math.pow(Math.max(0, u), sharp) * Math.pow(Math.max(0, v), sharp);

/**
 * Max. relatieve amplitude voor een patroon met n herhalingen.
 * Voorkomt dat de binnenwand (radiale offset) zichzelf doorsnijdt -> kapotte STL.
 * Grens 1: features mogen elkaar niet raken. Grens 2: de holle kromtestraal moet
 * groter blijven dan de wanddikte.
 */
function safeAmplitudeFraction(n, radius, wall) {
  if (n < 1) return 1;
  const spacing = (0.8 * Math.PI) / n;
  const curvature = radius / (n * n * Math.max(0.2, wall));
  return Math.max(0.01, Math.min(spacing, curvature));
}

/** Minimale afstand tussen twee controlepunten, zodat er geen knik ontstaat. */
export const MIN_NODE_GAP = 0.03;

/**
 * Controlepunten opschonen: op volgorde, binnen de printergrenzen, en het
 * eerste en laatste punt liggen altijd exact op de bodem en de opening.
 */
/** Handgreep opschonen; ontbreekt hij of klopt hij niet, dan geldt de standaard. */
const cleanHandle = (h) => {
  if (!h || !Number.isFinite(h.dt) || !Number.isFinite(h.dd)) return null;
  return {
    dt: clamp(h.dt, 0, 1),
    dd: clamp(h.dd, -PRINTER_LIMITS.maxDiameter, PRINTER_LIMITS.maxDiameter),
  };
};

export function normalizeProfile(points) {
  const list = (points || [])
    .filter((pt) => pt && Number.isFinite(pt.t) && Number.isFinite(pt.d))
    .map((pt) => {
      const node = {
        t: clamp(pt.t, 0, 1),
        d: clamp(Math.round(pt.d), PRINTER_LIMITS.minDiameter, PRINTER_LIMITS.maxDiameter),
      };
      const hIn = cleanHandle(pt.hIn);
      const hOut = cleanHandle(pt.hOut);
      if (hIn) node.hIn = hIn;
      if (hOut) node.hOut = hOut;
      return node;
    })
    .sort((a, b) => a.t - b.t);
  if (list.length < 2) return DEFAULT_SHAPE.profile.map((pt) => ({ ...pt }));
  list[0].t = 0;
  list[list.length - 1].t = 1;
  // punten die tegen elkaar aan liggen geven een knik, dus die vallen af
  const kept = [list[0]];
  for (let i = 1; i < list.length - 1; i++) {
    if (list[i].t - kept[kept.length - 1].t >= MIN_NODE_GAP && 1 - list[i].t >= MIN_NODE_GAP) {
      kept.push(list[i]);
    }
  }
  kept.push(list[list.length - 1]);
  return kept;
}

/** Controlepunten van een ontwerp; ontwerpen van voor de profiel-editor worden omgezet. */
export function profilePoints(p) {
  if (Array.isArray(p.profile) && p.profile.length >= 2) return normalizeProfile(p.profile);
  return normalizeProfile([
    { t: 0, d: p.diameterBottom },
    ...(p.useLow !== false ? [{ t: (p.positionLow ?? 33) / 100, d: p.diameterLow }] : []),
    ...(p.useHigh !== false ? [{ t: (p.positionHigh ?? 67) / 100, d: p.diameterHigh }] : []),
    { t: 1, d: p.diameterTop },
  ]);
}

const cubic = (p0, p1, p2, p3, u) => {
  const v = 1 - u;
  return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3;
};

/**
 * Handgrepen van het segment a→b, zoals de pen-tool ze tekent.
 *
 * Zonder eigen handgrepen liggen ze op een derde van het segment, horizontaal.
 * Dat is niet zomaar een keuze: met die stand is de t-component van de bézier
 * exact gelijk aan u, en de d-component exact 3u²−2u³ — precies de smoothstep
 * die hier eerder stond. Ontwerpen zonder handgrepen houden dus letterlijk
 * dezelfde vorm.
 *
 * `dt` is de lengte langs de hoogte (in t), `dd` de uitwijking in diameter.
 * Samen mogen de twee dt's het segment niet overschrijden: anders loopt t niet
 * meer monotoon op en zou één hoogte twee diameters krijgen.
 */
export function profileSegment(a, b) {
  const span = b.t - a.t;
  const third = span / 3;
  let outDt = a.hOut ? clamp(a.hOut.dt, 0, span) : third;
  let inDt = b.hIn ? clamp(b.hIn.dt, 0, span) : third;
  const total = outDt + inDt;
  if (total > span && total > 0) {
    const k = span / total;
    outDt *= k;
    inDt *= k;
  }
  return {
    span,
    auto: !a.hOut && !b.hIn,
    outDt,
    inDt,
    outDd: a.hOut ? a.hOut.dd : 0,
    inDd: b.hIn ? b.hIn.dd : 0,
  };
}

/** De handgrepen van één controlepunt, met de standaardwaarden al ingevuld. */
export function profileHandles(points, index) {
  const node = points[index];
  const prev = index > 0 ? points[index - 1] : null;
  const next = index < points.length - 1 ? points[index + 1] : null;
  const out = next ? profileSegment(node, next) : null;
  const inc = prev ? profileSegment(prev, node) : null;
  return {
    out: out ? { dt: out.outDt, dd: out.outDd, custom: !!node.hOut } : null,
    in: inc ? { dt: inc.inDt, dd: inc.inDd, custom: !!node.hIn } : null,
  };
}

/** u zoeken waarvoor de hoogte-component van de bézier op t uitkomt. */
function solveU(t0, t1, t2, t3, t) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(t0, t1, t2, t3, mid) < t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Straal op relatieve hoogte t, met vloeiende overgangen tussen de punten. */
export function profileRadiusAt(points, t) {
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t || i === points.length - 1) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.t - a.t;
      if (span <= 1e-6) return b.d / 2;
      const local = clamp((t - a.t) / span, 0, 1);
      const seg = profileSegment(a, b);
      // Standaard handgrepen: de bézier is dan bewijsbaar gelijk aan smoothstep,
      // dus die rekenen we rechtstreeks uit. Dat scheelt de iteratieve zoektocht
      // hieronder, en deze functie draait per mesh-punt.
      if (seg.auto) return (a.d + (b.d - a.d) * smoothstep(local)) / 2;
      const t1 = a.t + seg.outDt;
      const t2 = b.t - seg.inDt;
      const u = solveU(a.t, t1, t2, b.t, a.t + local * span);
      return cubic(a.d, a.d + seg.outDd, b.d - seg.inDd, b.d, u) / 2;
    }
  }
  return points[0].d / 2;
}

export const maxProfileDiameter = (p) => profilePoints(p).reduce((m, pt) => Math.max(m, pt.d), 0);

/** Minimale hoekafstand tussen twee punten van de doorsnede (fractie van een rondje). */
export const MIN_SECTION_GAP = 0.02;
const SECTION_BINS = 720;

/**
 * Doorsnede opschonen: op hoek gesorteerd, minimale tussenruimte, en de
 * grootste straal is altijd 1 zodat de diameters uit het silhouet blijven kloppen.
 * Minder dan 3 punten = gewoon rond.
 */
export function normalizeSection(points) {
  if (!Array.isArray(points)) return null;
  const list = points
    .filter((pt) => pt && Number.isFinite(pt.a) && Number.isFinite(pt.r))
    .map((pt) => ({ a: ((pt.a % 1) + 1) % 1, r: clamp(pt.r, 0.25, 1), sharp: !!pt.sharp }))
    .sort((x, y) => x.a - y.a);
  const kept = [];
  list.forEach((pt) => {
    if (!kept.length) { kept.push(pt); return; }
    if (pt.a - kept[kept.length - 1].a >= MIN_SECTION_GAP && 1 - pt.a + kept[0].a >= MIN_SECTION_GAP) {
      kept.push(pt);
    }
  });
  if (kept.length < 3) return null;
  const max = kept.reduce((m, pt) => Math.max(m, pt.r), 0);
  return kept.map((pt) => ({ ...pt, r: pt.r / max }));
}

/**
 * Straal per hoek voor de doorsnede, als vloeiende gesloten curve door de
 * punten (Catmull-Rom). Bij een punt dat als hoek is gemarkeerd loopt de
 * raaklijn langs de koorde, waardoor er een echte hoek en een rechte zijde
 * ontstaat — zo wordt vier hoekpunten precies een vierkant.
 * Geeft null terug voor rond.
 */
export function buildSectionField(points) {
  const pts = normalizeSection(points);
  if (!pts) return null;
  const n = pts.length;
  const P = pts.map((pt) => ({ x: Math.cos(pt.a * TAU) * pt.r, y: Math.sin(pt.a * TAU) * pt.r }));
  const tangent = (i, forward) => {
    const cur = P[i];
    const prev = P[(i - 1 + n) % n];
    const next = P[(i + 1) % n];
    const from = pts[i].sharp ? (forward ? cur : prev) : prev;
    const to = pts[i].sharp ? (forward ? next : cur) : next;
    return { x: (to.x - from.x) * 0.5, y: (to.y - from.y) * 0.5 };
  };

  const table = new Float64Array(SECTION_BINS).fill(-1);
  const steps = Math.ceil((SECTION_BINS * 2) / n);
  for (let i = 0; i < n; i++) {
    const p0 = P[i];
    const p1 = P[(i + 1) % n];
    const m0 = tangent(i, true);
    const m1 = tangent((i + 1) % n, false);
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const x = h00 * p0.x + h10 * m0.x + h01 * p1.x + h11 * m1.x;
      const y = h00 * p0.y + h10 * m0.y + h01 * p1.y + h11 * m1.y;
      const bin = ((Math.round((Math.atan2(y, x) / TAU) * SECTION_BINS) % SECTION_BINS) + SECTION_BINS) % SECTION_BINS;
      table[bin] = Math.hypot(x, y);
    }
  }

  // gaten opvullen tussen de bemonsterde hoeken; we lopen één rondje vanaf de
  // eerste gevulde bin, zodat elke lege bin tussen zijn buren wordt ingevuld
  let start = -1;
  for (let i = 0; i < SECTION_BINS && start < 0; i++) if (table[i] >= 0) start = i;
  if (start < 0) return null;
  for (let k = 1; k <= SECTION_BINS; k++) {
    const i = (start + k) % SECTION_BINS;
    if (table[i] >= 0) continue;
    let next = (i + 1) % SECTION_BINS;
    let gap = 1;
    while (table[next] < 0 && gap < SECTION_BINS) { next = (next + 1) % SECTION_BINS; gap++; }
    const a = table[(i - 1 + SECTION_BINS) % SECTION_BINS];
    const b = table[next];
    table[i] = a + (b - a) / (gap + 1);
  }

  const at = (angle) => {
    const x = (angle / TAU) * SECTION_BINS;
    const i = Math.floor(x);
    const f = x - i;
    const lo = table[((i % SECTION_BINS) + SECTION_BINS) % SECTION_BINS];
    const hi = table[(((i + 1) % SECTION_BINS) + SECTION_BINS) % SECTION_BINS];
    // ondergrens: een doorschietende curve mag de vaas nooit binnenstebuiten keren
    return Math.max(0.05, lo + (hi - lo) * f);
  };

  return { at, points: pts, hasCorners: pts.some((pt) => pt.sharp) };
}

const polySection = (n, sharp = true, inner = 1) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ a: i / n, r: 1, sharp });
    if (inner < 1) out.push({ a: (i + 0.5) / n, r: inner, sharp });
  }
  return out;
};

/**
 * Doorsnedes met een instelbaar aantal punten. Het maximum houdt rekening met
 * MIN_SECTION_GAP: families met een tussenpunt gebruiken 2× zoveel punten.
 */
export const SECTION_FAMILIES = {
  veelhoek: { unit: 'hoeken', min: 3, max: 24, make: (n) => polySection(n) },
  ster: { unit: 'punten', min: 3, max: 16, make: (n) => polySection(n, true, 0.55) },
  bloem: { unit: 'blaadjes', min: 3, max: 16, make: (n) => polySection(n, false, 0.72) },
  lob: { unit: 'lobben', min: 3, max: 16, make: (n) => polySection(n, false, 0.62) },
  tand: { unit: 'tanden', min: 4, max: 20, make: (n) => polySection(n, true, 0.84) },
  golfrand: { unit: 'golven', min: 4, max: 20, make: (n) => polySection(n, false, 0.88) },
  vrij: { unit: 'punten', min: 3, max: 24, make: (n) => polySection(n, false) },
};

const familyPreset = (id, label, key, sides, exact = false) => ({
  id,
  label,
  family: key,
  sides,
  exact,
  make: (n = sides) => SECTION_FAMILIES[key].make(
    clamp(Math.round(n), SECTION_FAMILIES[key].min, SECTION_FAMILIES[key].max),
  ),
});

export const SECTION_PRESETS = [
  { id: 'rond', label: '○ Rond', make: () => null },
  { id: 'ovaal', label: '⬭ Ovaal', make: () => [
    { a: 0, r: 1 }, { a: 0.25, r: 0.68 }, { a: 0.5, r: 1 }, { a: 0.75, r: 0.68 },
  ] },
  familyPreset('driehoek', '△ Driehoek', 'veelhoek', 3, true),
  familyPreset('vierkant', '◻ Vierkant', 'veelhoek', 4, true),
  familyPreset('vijfhoek', '⬠ Vijfhoek', 'veelhoek', 5, true),
  familyPreset('zeshoek', '⬡ Zeshoek', 'veelhoek', 6, true),
  familyPreset('achthoek', '⯃ Achthoek', 'veelhoek', 8, true),
  familyPreset('ster', '✦ Ster', 'ster', 6),
  familyPreset('bloem', '❀ Bloem', 'bloem', 6),
  familyPreset('lob', '❍ Lobben', 'lob', 3),
  familyPreset('tandwiel', '⚙ Tandwiel', 'tand', 10),
  familyPreset('golfrand', '〜 Golfrand', 'golfrand', 12),
  { id: 'ei', label: '🥚 Ei', make: () => [
    { a: 0, r: 1 }, { a: 0.25, r: 0.78 }, { a: 0.5, r: 0.86 }, { a: 0.75, r: 0.78 },
  ] },
  familyPreset('vrij', '✎ Vrij tekenen', 'vrij', 8),
];

/** Vingerafdruk van een doorsnede, om te zien welke preset actief is. */
export const sectionSignature = (list) => {
  const clean = normalizeSection(list);
  if (!clean) return 'rond';
  return clean.map((pt) => `${pt.a.toFixed(3)}:${pt.r.toFixed(3)}:${pt.sharp ? 1 : 0}`).join('|');
};

/**
 * Herkent uit welke familie een doorsnede komt en met hoeveel punten, zodat de
 * schuif voor het aantal punten meebeweegt. Zelf versleepte vormen horen bij
 * geen familie meer.
 */
export function describeSection(list) {
  const clean = normalizeSection(list);
  if (!clean) return { family: null, sides: 0 };
  const sig = sectionSignature(clean);
  for (const [key, fam] of Object.entries(SECTION_FAMILIES)) {
    for (let n = fam.min; n <= fam.max; n++) {
      if (sectionSignature(fam.make(n)) === sig) return { family: key, sides: n };
    }
  }
  return { family: null, sides: clean.length };
}

/** Keuzes voor de symmetrie van de doorsnede-editor; 1 = vrij tekenen. */
export const SECTION_SYMMETRIES = [1, 2, 3, 4, 5, 6, 8, 12];

const wrap1 = (v) => ((v % 1) + 1) % 1;

// modulo met een marge, zodat 2/6 % (1/6) netjes 0 wordt en niet bijna 1/6
const modStep = (v, step) => {
  const x = wrap1(v) % step;
  return x < 1e-6 || x > step - 1e-6 ? 0 : x;
};

/** Grootte van het stuk dat je zelf tekent; de rest wordt gekopieerd. */
export const sectorSpan = (sym = 1, mirror = false) => (mirror ? 0.5 : 1) / Math.max(1, sym);

/** Een hoek terugvouwen naar de sector waarin je tekent. */
export function foldAngle(a, sym = 1, mirror = false) {
  const step = 1 / Math.max(1, sym);
  const x = modStep(a, step);
  return mirror && x > step / 2 ? step - x : x;
}

/**
 * De punten van één sector: dat is het stuk dat je in de editor bewerkt.
 * Punten buiten de sector vervallen — die worden immers gekopieerd. Ligt er
 * niets in de sector, dan vouwen we alles alsnog terug.
 */
export function foldSection(points, sym = 1, mirror = false) {
  const list = normalizeSection(points);
  if (!list) return null;
  if (sym <= 1 && !mirror) return list;
  const span = sectorSpan(sym, mirror);
  // spiegelen: het punt precies op de spiegelas hoort er nog bij; zonder
  // spiegeling is het eindpunt van de sector al de kopie van het beginpunt
  const inSector = list.filter((pt) => (mirror ? pt.a <= span + 1e-6 : pt.a < span - 1e-6));
  const source = inSector.length ? inSector : list;
  const folded = [];
  source.forEach((pt) => {
    const a = inSector.length ? pt.a : foldAngle(pt.a, sym, mirror);
    if (!folded.some((f) => Math.abs(f.a - a) < MIN_SECTION_GAP / 2)) folded.push({ ...pt, a });
  });
  return folded.sort((x, y) => x.a - y.a);
}

/** Eén sector rondkopiëren (en eventueel spiegelen) tot een hele doorsnede. */
export function expandSection(master, sym = 1, mirror = false) {
  if (!Array.isArray(master) || !master.length) return null;
  if (sym <= 1 && !mirror) return normalizeSection(master);
  const step = 1 / Math.max(1, sym);
  const out = [];
  for (let s = 0; s < Math.max(1, sym); s++) {
    master.forEach((pt) => {
      const a = modStep(pt.a, step);
      out.push({ ...pt, a: wrap1(s * step + a) });
      if (mirror) out.push({ ...pt, a: wrap1(s * step - a) });
    });
  }
  return normalizeSection(out);
}

/** Doorsnede van een ontwerp, of null als hij rond is. */
export const sectionOf = (p) => normalizeSection(p?.section);

export const DEFAULT_SHAPE = {
  // silhouet: controlepunten van bodem (t 0) naar opening (t 1)
  height: 180,
  profile: [
    { t: 0, d: 55 },
    { t: 0.32, d: 88 },
    { t: 0.7, d: 78 },
    { t: 1, d: 62 },
  ],
  // dwarsdoorsnede: null = rond, anders punten {a, r, sharp}
  section: null,
  // symmetrie tijdens het tekenen van de doorsnede (1 = vrij)
  sectionSym: 1,
  sectionMirror: false,
  // 1.2mm = 3 lijnen van 0.4mm: stevig en waterdicht, ook zonder vase mode
  thickness: 1.2,
  // symmetrisch patroon
  patternShape: 'ribbel',
  waveCount: 16,
  waveAmplitude: 4,
  twistAngle: 0,
  twistMode: 'lineair',
  twistWaves: 1,
  facetCount: 0,
  facetStrength: 60,
  ringCount: 0,
  ringAmount: 4,
  // bobbels (symmetrisch raster)
  bumpCols: 0,
  bumpRows: 8,
  bumpDepth: 6,
  bumpStagger: true,
  // fijne textuur
  textureType: 'geen',
  textureScale: 24,
  textureDepth: 3,
  // golvende rand
  rimWaveCount: 0,
  rimWaveDepth: 6,
  // organisch
  seed: 1,
  organicAmount: 0,
  organicDetail: 4,
  organicFlow: 60,
  swayAmount: 0,
  swayTurns: 0.5,
  // printbaarheid
  autoLimit: true,
  maxOverhang: 40,
};

// De vorm wordt per wijziging op drie plekken opgevraagd (bedieningspaneel,
// printbaarheids-badge en de mesh-bouwer). Voor een zwaar versierde vaas kost
// dat elk honderden milliseconden, dus delen ze hier één berekening. Alleen
// parameters die de geometrie bepalen tellen mee in de sleutel: van filament
// wisselen hoeft niets opnieuw te berekenen.
const GEOMETRY_KEYS = [
  ...Object.keys(DEFAULT_SHAPE).filter((k) => k !== 'sectionSym' && k !== 'sectionMirror'),
  'layerHeight',
  'vaseMode',
].sort();

const SHAPE_CACHE_SIZE = 8;
const shapeCache = new Map();

const shapeCacheKey = (params) => {
  const p = { ...DEFAULT_SHAPE, ...params };
  let key = '';
  for (const k of GEOMETRY_KEYS) {
    const v = p[k];
    key += `${k}:${v !== null && typeof v === 'object' ? JSON.stringify(v) : v}|`;
  }
  return key;
};

export function createVaseShape(params) {
  const key = shapeCacheKey(params);
  const cached = shapeCache.get(key);
  if (cached) return cached;
  const shape = buildVaseShape(params);
  shapeCache.set(key, shape);
  // oudste eruit; een Map bewaart de invoegvolgorde
  if (shapeCache.size > SHAPE_CACHE_SIZE) shapeCache.delete(shapeCache.keys().next().value);
  return shape;
}

function buildVaseShape(params) {
  const p = { ...DEFAULT_SHAPE, ...params };
  const height = p.height;
  const wall = p.thickness;

  const nodes = profilePoints(p);
  const baseRadiusAt = (t) => profileRadiusAt(nodes, t);
  const section = buildSectionField(p.section);

  const refRadius = baseRadiusAt(0.5);
  const twistRad = (p.twistAngle / 180) * Math.PI;
  const twistWaves = clamp(p.twistWaves ?? 1, 0.25, 4);
  // 'heen' draait omhoog en weer terug -> torsie die zichzelf opheft
  const rotAt = (t) => (p.twistMode === 'heen'
    ? twistRad * Math.sin(Math.PI * twistWaves * t)
    : twistRad * t);

  // Patroon: n-tallige rotatiesymmetrie
  const waveCount = Math.round(p.waveCount);
  const waveAmp = waveCount > 0 && p.waveAmplitude > 0
    ? Math.min(p.waveAmplitude / 100, safeAmplitudeFraction(waveCount, refRadius, wall))
    : 0;

  // Facetten: veelhoek-doorsnede, genormaliseerd rond straal 1
  const facetCount = Math.round(p.facetCount);
  const facetStrength = facetCount >= 3 ? clamp(p.facetStrength / 100, 0, 1) : 0;
  const facetInner = facetCount >= 3 ? Math.cos(Math.PI / facetCount) : 1;
  const facetMean = (1 + facetInner) / 2;

  // Horizontale ringen over de hoogte
  const ringCount = Math.round(p.ringCount);
  const ringAmount = ringCount > 0 ? Math.max(0, p.ringAmount) / 100 : 0;

  // Bobbels: raster van symmetrische bollen (negatieve diepte = deuken)
  const bumpCols = Math.round(p.bumpCols ?? 0);
  const bumpRows = clamp(Math.round(p.bumpRows ?? 1), 1, 40);
  const bumpDepth = p.bumpDepth ?? 0;
  // Een bult mag nooit hoger worden dan zijn eigen rastercel: anders lopen de
  // bollen in elkaar en snijdt de binnenwand zichzelf. Tweede grens: de holle
  // overgang tussen twee bulten moet ruimer blijven dan de wanddikte.
  const bumpCell = bumpCols >= 1 ? Math.min((TAU * refRadius) / bumpCols, height / bumpRows) : 0;
  const bumpMaxFraction = bumpCell > 0
    ? Math.min(0.4 * bumpCell, (bumpCell * bumpCell) / (8 * wall)) / refRadius
    : 0;
  const bumpAmp = bumpCols >= 1 && bumpDepth !== 0
    ? Math.sign(bumpDepth) * Math.min(Math.abs(bumpDepth) / 100, bumpMaxFraction)
    : 0;

  // Fijne oppervlaktetextuur
  const textureType = p.textureType ?? 'geen';
  const textureCols = clamp(Math.round(p.textureScale ?? 24), 4, 64);
  // verticale herhaling zo gekozen dat de cellen ongeveer vierkant blijven
  const textureRows = clamp(Math.round((textureCols * height) / (TAU * refRadius)), 1, 90);
  const textureAmp = textureType !== 'geen' && p.textureDepth > 0
    ? Math.min(p.textureDepth / 100, safeAmplitudeFraction(textureCols, refRadius, wall))
    : 0;

  // Organisch (asymmetrisch)
  const detail = clamp(Math.round(p.organicDetail), 1, 10);
  const maxOrder = 1 + detail;
  const organicAmount = p.organicAmount > 0
    ? Math.min(p.organicAmount / 100, safeAmplitudeFraction(maxOrder, refRadius, wall))
    : 0;
  const flow = Math.max(0, p.organicFlow) / 100;
  const seed = Math.round(p.seed);
  const { harmonics, norm } = organicAmount > 0
    ? buildHarmonics(seed, 2 + detail, maxOrder)
    : { harmonics: [], norm: 1 };

  const swayAmount = Math.max(0, p.swayAmount) / 100;
  const swayTurns = p.swayTurns;
  const swayPhase = mulberry32(Math.imul(seed, 0x9e3779b9) >>> 0)() * TAU;

  // Golvende rand: de bovenrand zakt plaatselijk weg, totale hoogte blijft gelijk
  const rimCount = Math.round(p.rimWaveCount ?? 0);
  // In vase mode print de slicer één doorlopende spiraal: een golvende rand
  // valt dan in losse tongen uiteen en is niet te printen, dus die blijft vlak.
  const rimAmp = rimCount >= 2 && !p.vaseMode ? clamp((p.rimWaveDepth ?? 0) / 100, 0, 0.2) * height : 0;

  // Genormaliseerd naar [-1, 1]
  const organicField = (angle, t) => {
    if (!harmonics.length) return 0;
    const rot = rotAt(t);
    let sum = 0;
    for (let i = 0; i < harmonics.length; i++) {
      const h = harmonics[i];
      const drift = h.drift * flow * t * TAU;
      const mod = 0.55 + 0.45 * Math.sin(t * TAU * h.modFreq * flow + h.modPhase);
      sum += h.amp * mod * Math.sin(h.order * (angle - rot) + h.phase + drift);
    }
    return sum / norm;
  };

  const facetField = (angle) => {
    if (facetCount < 3) return 1;
    const seg = TAU / facetCount;
    const a = (((angle % seg) + seg) % seg) - seg / 2;
    return (facetInner / Math.cos(a)) / facetMean;
  };

  // Bobbelraster, waarde in [0, 1]
  const bumpField = (a, t) => {
    if (bumpCols < 1) return 0;
    const row = t * bumpRows;
    const ri = Math.floor(row);
    if (ri >= bumpRows) return 0;
    const off = p.bumpStagger !== false && ri % 2 ? Math.PI / bumpCols : 0;
    return blob(Math.cos(bumpCols * (a - off)), Math.sin(Math.PI * (row - ri)), 1.6);
  };

  // Fijne textuur, waarde in [-1, 1]. Alle hoekfrequenties zijn heel getal,
  // anders ontstaat er een naad bij hoek 0.
  const textureField = (a, t) => {
    const n = textureCols;
    const m = textureRows;
    switch (textureType) {
      case 'lijnen':
        return Math.sin(n * a);
      case 'ruit':
        return Math.sin(n * a + m * t * TAU) * Math.sin(n * a - m * t * TAU);
      case 'noppen': {
        const row = t * m;
        const ri = Math.floor(row);
        const off = ri % 2 ? Math.PI / n : 0;
        return blob(Math.cos(n * (a - off)), Math.sin(Math.PI * (row - ri)), 1.5) * 2 - 1;
      }
      case 'schub': {
        const row = t * m;
        const ri = Math.floor(row);
        const off = ri % 2 ? Math.PI / n : 0;
        const u = Math.max(0, Math.cos(n * (a - off)));
        return Math.pow(u, 0.7) * (1 - (row - ri)) * 2 - 1;
      }
      case 'geweven': {
        const s = Math.sin(n * a) * Math.cos(m * t * TAU);
        return Math.tanh(2.5 * s) / Math.tanh(2.5);
      }
      case 'grof': {
        const n2 = Math.max(1, Math.round(n * 2.3));
        const s = Math.sin(n * a) * Math.sin(m * t * TAU + 1.1)
          + 0.6 * Math.sin(n2 * a + 0.7) * Math.sin(1.7 * m * t * TAU + 2.3);
        return s / 1.6;
      }
      case 'diagonaal': // schuine ribbels: één richting, i.p.v. het kruis van 'ruit'
        return Math.sin(n * a + m * t * TAU);
      case 'hamerslag': {
        // ondiepe overlappende deuken, als geslagen metaal: twee versprongen
        // rasters over elkaar heen
        const row = t * m;
        const ri = Math.floor(row);
        const off = ri % 2 ? Math.PI / n : 0;
        const big = blob(Math.cos(n * (a - off)), Math.sin(Math.PI * (row - ri)), 1.2);
        const n2 = Math.max(1, Math.round(n * 1.7));
        const row2 = t * m * 1.7 + 0.5;
        const ri2 = Math.floor(row2);
        const small = blob(Math.cos(n2 * a), Math.sin(Math.PI * (row2 - ri2)), 1.4);
        return (big * 0.65 + small * 0.35) * 2 - 1;
      }
      default:
        return 0;
    }
  };

  // De eerste lagen liggen vlak op de plaat: decoratie loopt pas daarboven in.
  // flatSpan wordt hieronder ingevuld zodra de decoratiediepte bekend is.
  let flatSpan = 0;
  const groundFade = (t) => (flatSpan <= 0 ? 1 : smoothstep(clamp(t / flatSpan, 0, 1)));

  // scale schaalt alleen de decoratie, nooit het basisprofiel
  const radiusRaw = (angle, t, scale, fade = true) => {
    const a = angle - rotAt(t); // twist draait het hele patroon mee omhoog
    // de doorsnede draait mee met de twist, anders staat de vorm los van het patroon
    const base = baseRadiusAt(t) * (section ? section.at(a) : 1);
    if (fade) scale *= groundFade(t);
    // Zonder decoratie-schaal vallen alle termen hieronder toch weg; dit scheelt
    // de dure velden (textuur, organic, bobbels) bij het meten van het kale
    // silhouet en onderaan de vaas, waar de fade naar 0 loopt.
    if (scale <= 0) return base;

    let factor = 1;
    if (facetStrength > 0) factor *= 1 + (facetField(a) - 1) * facetStrength * scale;
    if (ringAmount > 0) factor *= 1 + Math.sin(t * TAU * ringCount) * ringAmount * scale;

    let r = base * factor;
    if (waveAmp > 0) r += patternProfile(p.patternShape, a * waveCount) * waveAmp * base * scale;
    if (bumpAmp !== 0) r += bumpField(a, t) * bumpAmp * base * scale;
    if (textureAmp > 0) r += textureField(a, t) * textureAmp * base * scale;
    if (organicAmount > 0) r += organicField(angle, t) * organicAmount * base * scale;

    return Math.max(base * 0.2, r);
  };

  // Aanloophoogte volgt de diepte van de decoratie: hoe dieper het reliëf, hoe
  // langer de fade, zodat de overgang zelf nooit steiler wordt dan toegestaan.
  {
    let deepest = 0;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const base = baseRadiusAt(t);
      for (let j = 0; j < 24; j++) {
        deepest = Math.max(deepest, Math.abs(radiusRaw((j / 24) * TAU, t, 1, false) - base));
      }
    }
    const layer = p.layerHeight > 0 ? p.layerHeight : 0.2;
    const tanLimit = Math.tan((clamp(p.maxOverhang, 20, 70) * Math.PI) / 180);
    flatSpan = clamp(Math.max(layer * 2, (1.5 * deepest) / tanLimit) / height, 0, 0.25);
  }

  // De rand golft naar beneden weg; de twist blijft er bewust buiten zodat
  // de hoogte altijd monotoon blijft oplopen (anders vouwt de mesh).
  const heightAt = (angle, t, scale = 1) => {
    const y = t * height;
    if (rimAmp <= 0 || scale <= 0) return y;
    const w = clamp((t - 0.55) / 0.45, 0, 1);
    return y - smoothstep(w) * rimAmp * scale * (1 - Math.sin(angle * rimCount)) * 0.5;
  };

  const centerRaw = (t, scale) => {
    if (swayAmount <= 0 || scale <= 0) return { x: 0, z: 0 };
    // smoothstep: de bodem blijft gecentreerd -> stabiele, vlakke voet
    const amt = swayAmount * refRadius * smoothstep(clamp(t, 0, 1)) * scale;
    const a = swayPhase + t * TAU * swayTurns;
    return { x: Math.cos(a) * amt, z: Math.sin(a) * amt };
  };

  // Hoogste hoekfrequentie in de versiering en hoe snel het patroon meedraait.
  // Samen bepalen ze hoe fijn we moeten meten en hoeveel rijen de mesh nodig
  // heeft: draait het patroon sneller dan we bemonsteren, dan vouwt de wand.
  const patternFreq = Math.max(
    1,
    waveAmp > 0 ? waveCount : 0,
    facetStrength > 0 ? facetCount : 0,
    bumpAmp !== 0 ? bumpCols : 0,
    textureAmp > 0 ? textureCols : 0,
    organicAmount > 0 ? maxOrder : 0,
    rimAmp > 0 ? rimCount : 0,
    section ? section.points.length : 0
  );
  const rotRate = Math.abs(p.twistMode === 'heen' ? twistRad * Math.PI * twistWaves : twistRad);
  const twistRows = (2 * rotRate * patternFreq) / TAU;

  // Overhang = hoek van de wand t.o.v. verticaal; te steil = zakt door in vase mode
  const measureOverhang = (scale) => {
    const steps = clamp(Math.round(60 + twistRows), 60, 800);
    // minstens vier monsters per patroonperiode, anders meet je steeds dezelfde
    // fase en mis je precies de steile flanken
    const angles = clamp(Math.round(patternFreq * 4), 24, 192);
    const dt = 1 / steps;
    let max = 0;
    for (let i = 0; i < steps; i++) {
      const t0 = i * dt;
      const t1 = t0 + dt;
      const c0 = centerRaw(t0, scale);
      const c1 = centerRaw(t1, scale);
      for (let j = 0; j < angles; j++) {
        const a = (j / angles) * TAU;
        const r0 = radiusRaw(a, t0, scale);
        const r1 = radiusRaw(a, t1, scale);
        const dx = c1.x + Math.cos(a) * r1 - (c0.x + Math.cos(a) * r0);
        const dz = c1.z + Math.sin(a) * r1 - (c0.z + Math.sin(a) * r0);
        const dy = Math.max(1e-4, heightAt(a, t1, scale) - heightAt(a, t0, scale));
        const deg = (Math.atan2(Math.hypot(dx, dz), dy) * 180) / Math.PI;
        if (deg > max) max = deg;
      }
    }
    return max;
  };

  const limit = p.maxOverhang;
  const baseOverhang = measureOverhang(0);
  const hasDetail = organicAmount > 0 || waveAmp > 0 || swayAmount > 0 || ringAmount > 0
    || facetStrength > 0 || bumpAmp !== 0 || textureAmp > 0 || rimAmp > 0;

  let detailScale = 1;
  // Grootste schaal waarbij `bad` niet meer geldt. Elke stap kost een volledige
  // overhang-meting, dus 8 halveringen: dat is 0.4% nauwkeurig op iets dat je
  // met het oog toch niet ziet, en scheelt een derde van de rekentijd.
  const shrinkUntil = (bad, start) => {
    let lo = 0;
    let hi = start;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (bad(mid)) hi = mid;
      else lo = mid;
    }
    return lo;
  };

  // De versiering mag de wand nooit steiler maken dan het silhouet zelf al is.
  // Is het silhouet al te steil, dan valt daar met schalen niets aan te doen
  // (de gebruiker moet de diameters aanpassen), maar de versiering mag er dan
  // ook niets bovenop doen.
  const steepTarget = Math.max(limit, baseOverhang);
  const tooSteep = (scale) => measureOverhang(scale) > steepTarget;
  if (p.autoLimit && hasDetail && tooSteep(1)) detailScale = shrinkUntil(tooSteep, 1);

  // Vouwgrens: voorbij ~90° klapt het oppervlak over zichzelf heen en is het
  // model geen gesloten lichaam meer. Die grens geldt ook met de veilige
  // limieten uit, anders exporteer je een STL die geen slicer kan vullen.
  const folds = (scale) => measureOverhang(scale) > 88;
  if (hasDetail && folds(detailScale)) detailScale = shrinkUntil(folds, detailScale);

  const radiusAt = (angle, t) => radiusRaw(angle, t, detailScale);
  const centerAt = (t) => centerRaw(t, detailScale);

  /** Punt op het oppervlak. radialOffset < 0 = naar binnen (binnenwand). */
  const pointAt = (angle, t, radialOffset = 0) => {
    const r = Math.max(0.3, radiusAt(angle, t) + radialOffset);
    const c = centerAt(t);
    return {
      x: c.x + Math.cos(angle) * r,
      y: heightAt(angle, t, detailScale),
      z: c.z + Math.sin(angle) * r,
    };
  };

  // Genoeg segmenten om alle detail glad weer te geven
  const radialSegments = clamp(
    Math.max(
      128,
      waveAmp > 0 ? waveCount * 24 : 0,
      facetStrength > 0 ? facetCount * 48 : 0,
      organicAmount > 0 ? maxOrder * 40 : 0,
      bumpAmp !== 0 ? bumpCols * 28 : 0,
      textureAmp > 0 ? textureCols * 8 : 0,
      // scherpe hoeken in de doorsnede hebben veel segmenten nodig om hoek te blijven
      section ? (section.hasCorners ? 512 : 256) : 0
    ),
    128,
    512
  );
  const heightSegments = clamp(
    Math.round(
      80 + flow * detail * 12 + swayTurns * 30 + ringCount * 8 + twistRows * detailScale
        + (bumpAmp !== 0 ? bumpRows * 12 : 0)
        + (textureAmp > 0 ? textureRows * 6 : 0)
        + (rimAmp > 0 ? 40 : 0)
    ),
    80,
    360
  );

  /**
   * Binnenwand van één ring. De binnencontour is de buitencontour geërodeerd
   * met de wanddikte, niet een simpele radiale offset: bij een scherpe of
   * steile versiering zou die door de buitenkant heen steken en snijdt het
   * model zichzelf. We eroderen tegen de daadwerkelijke mesh-lijnstukken (niet
   * alleen de hoekpunten), want dat is de vorm die de slicer te zien krijgt.
   */
  const innerRing = (t) => {
    const n = radialSegments;
    const step = TAU / n;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const rOut = new Float64Array(n);
    let rMin = Infinity;
    for (let j = 0; j < n; j++) {
      const a = j * step;
      const r = radiusAt(a, t);
      rOut[j] = r;
      px[j] = Math.cos(a) * r;
      py[j] = Math.sin(a) * r;
      if (r < rMin) rMin = r;
    }
    // buiten deze hoek kan geen enkel stuk contour nog binnen de wanddikte liggen
    const span = Math.min(0.8, 2 * Math.asin(clamp(wall / Math.max(wall, rMin), 0, 1)) + step);
    const k = Math.min(64, Math.ceil(span / step));
    const c = centerAt(t);
    const pts = new Array(n);
    for (let j = 0; j < n; j++) {
      const a = j * step;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let ri = rOut[j] - wall;
      for (let d = -k; d <= k; d++) {
        const i0 = (((j + d) % n) + n) % n;
        const i1 = (((j + d + 1) % n) + n) % n;
        const ax = px[i0];
        const ay = py[i0];
        // hoekpunt: straal waarop de straal de cirkel met radius wall raakt
        const ua = ux * ax + uy * ay;
        const disc = ua * ua - (ax * ax + ay * ay) + wall * wall;
        if (disc > 0) {
          const rho = ua - Math.sqrt(disc);
          if (rho > 0 && rho < ri) ri = rho;
        }
        // lijnstuk: straal waarop hij op wall van de flank tussen twee punten ligt
        const ex = px[i1] - ax;
        const ey = py[i1] - ay;
        const len = Math.hypot(ex, ey);
        if (len < 1e-9) continue;
        const nx = -ey / len;
        const ny = ex / len;
        const un = ux * nx + uy * ny;
        if (Math.abs(un) < 1e-9) continue;
        const an = ax * nx + ay * ny;
        for (let s = -1; s <= 1; s += 2) {
          const rho = (an + s * wall) / un;
          if (rho <= 0 || rho >= ri) continue;
          const proj = ((rho * ux - ax) * ex + (rho * uy - ay) * ey) / len;
          if (proj >= 0 && proj <= len) ri = rho;
        }
      }
      ri = Math.max(0.3, ri);
      pts[j] = {
        x: c.x + Math.cos(a) * ri,
        y: heightAt(a, t, detailScale),
        z: c.z + Math.sin(a) * ri,
      };
    }
    return pts;
  };

  return {
    height,
    wall,
    baseRadiusAt,
    radiusAt,
    centerAt,
    heightAt,
    pointAt,
    innerRing,
    radialSegments,
    heightSegments,
    // grootste bobbelhoogte die bij dit raster nog veilig is, in % van de straal
    bumpMaxPercent: Math.round(bumpMaxFraction * 100),
    // printbaarheids-info voor de UI
    maxOverhangDeg: measureOverhang(detailScale),
    baseOverhangDeg: baseOverhang,
    detailScale,
    limited: detailScale < 0.999,
  };
}

/** Silhouetten: diameters als verhouding t.o.v. de buikdiameter. */
export const SILHOUETTES = [
  { id: 'urn', label: '🏺 Urn', bottom: 0.55, low: 1.0, lowPos: 30, high: 0.8, highPos: 70, top: 0.62 },
  { id: 'tulp', label: '🌷 Tulp', bottom: 0.45, low: 0.62, lowPos: 25, high: 0.9, highPos: 70, top: 1.0 },
  { id: 'kruik', label: '🍶 Kruik', bottom: 0.78, low: 1.0, lowPos: 32, high: 0.46, highPos: 72, top: 0.38 },
  { id: 'zandloper', label: '⧗ Zandloper', bottom: 0.88, low: 0.55, lowPos: 38, high: 0.85, highPos: 75, top: 0.72 },
  { id: 'knop', label: '🌰 Knop', bottom: 0.52, low: 1.0, lowPos: 28, high: 0.58, highPos: 62, top: 0.44 },
  { id: 'zuil', label: '▮ Zuil', bottom: 0.96, top: 0.92, useLow: false, useHigh: false },
  { id: 'kegel', label: '△ Kegel', bottom: 0.5, top: 1.0, useLow: false, useHigh: false },
  { id: 'taps', label: '▽ Taps', bottom: 1.0, top: 0.6, useLow: false, useHigh: false },
  { id: 'fles', label: '🍾 Fles', bottom: 0.72, low: 0.95, lowPos: 22, high: 0.42, highPos: 58, top: 0.34 },
  { id: 'amfora', label: '⚱️ Amfora', bottom: 0.4, low: 0.92, lowPos: 38, high: 0.6, highPos: 78, top: 0.68 },
  { id: 'bol', label: '⚪ Bol', bottom: 0.42, low: 0.98, lowPos: 42, high: 0.72, highPos: 78, top: 0.5 },
  { id: 'trompet', label: '🎺 Trompet', bottom: 0.42, low: 0.5, lowPos: 30, high: 0.72, highPos: 72, top: 1.0 },
  { id: 'karaf', label: '🫙 Karaf', bottom: 0.85, low: 0.92, lowPos: 45, high: 0.72, highPos: 80, top: 0.86 },
  // buik, taille, en dan weer breder: het enige silhouet dat twee keer bolt
  { id: 'kalebas', label: '🎃 Kalebas', bottom: 0.5, low: 1.0, lowPos: 30, high: 0.55, highPos: 64, top: 0.82 },
];

/** Alle decoratie uit; elke preset zet hierop alleen aan wat hij nodig heeft. */
const NO_DECOR = {
  patternShape: 'golf',
  waveCount: 0,
  waveAmplitude: 0,
  twistAngle: 0,
  twistMode: 'lineair',
  twistWaves: 1,
  facetCount: 0,
  facetStrength: 60,
  ringCount: 0,
  ringAmount: 4,
  bumpCols: 0,
  bumpRows: 8,
  bumpDepth: 6,
  textureType: 'geen',
  textureScale: 24,
  textureDepth: 3,
  rimWaveCount: 0,
  rimWaveDepth: 6,
  organicAmount: 0,
  swayAmount: 0,
};

const decor = (values) => ({ ...NO_DECOR, ...values });

/**
 * Decoratie-stijlen: zetten in één klik alle patroon-/textuur-/organic-waarden.
 *
 * `group` bepaalt op welk tabblad een stijl te zien is. Een stijl vervangt
 * altijd álle versiering — hij hoort dus nergens echt "thuis" — maar door hem
 * te tonen bij de schuifjes die hij daarna beheerst, blijft duidelijk waar je
 * verder moet zoeken als je hem wilt bijstellen. 'glad' wist alles en staat
 * daarom overal.
 */
export const DECOR_PRESETS = [
  { id: 'glad', label: '○ Glad', group: 'alle', values: decor({}) },

  // groep patroon: grote, regelmatige vormen rondom de vaas
  { id: 'ribbels', label: '≣ Ribbels', group: 'patroon', values: decor({ patternShape: 'ribbel', waveCount: 20, waveAmplitude: 6 }) },
  { id: 'cannelure', label: '⌇ Cannelure', group: 'patroon', values: decor({ patternShape: 'groef', waveCount: 14, waveAmplitude: 7 }) },
  { id: 'twist', label: '🌀 Twist', group: 'patroon', values: decor({ patternShape: 'ribbel', waveCount: 12, waveAmplitude: 8, twistAngle: 180 }) },
  { id: 'vlecht', label: '🪢 Vlecht', group: 'patroon', values: decor({ patternShape: 'kabel', waveCount: 10, waveAmplitude: 9, twistAngle: 220, twistMode: 'heen', twistWaves: 2 }) },
  { id: 'facet', label: '⬡ Facet', group: 'patroon', values: decor({ facetCount: 8, facetStrength: 80 }) },
  { id: 'kristal', label: '💎 Kristal', group: 'patroon', values: decor({ facetCount: 6, facetStrength: 100, twistAngle: 90 }) },
  { id: 'ster', label: '✦ Ster', group: 'patroon', values: decor({ patternShape: 'ster', waveCount: 8, waveAmplitude: 12 }) },
  { id: 'zaagtand', label: '⩘ Zaagtand', group: 'patroon', values: decor({ patternShape: 'zaag', waveCount: 18, waveAmplitude: 6, twistAngle: 120 }) },
  { id: 'ringen', label: '☰ Ringen', group: 'patroon', values: decor({ ringCount: 14, ringAmount: 5 }) },
  { id: 'paneel', label: '▤ Paneel', group: 'patroon', values: decor({ patternShape: 'paneel', waveCount: 6, waveAmplitude: 9 }) },
  { id: 'terras', label: '◱ Terras', group: 'patroon', values: decor({ patternShape: 'trap', waveCount: 14, waveAmplitude: 7 }) },
  { id: 'kerven', label: '⑃ Kerven', group: 'patroon', values: decor({ patternShape: 'kerf', waveCount: 22, waveAmplitude: 6 }) },
  { id: 'schelp', label: '🐚 Schelp', group: 'patroon', values: decor({ patternShape: 'schelp', waveCount: 16, waveAmplitude: 8, twistAngle: 90 }) },
  { id: 'kussen', label: '⬮ Kussen', group: 'patroon', values: decor({ patternShape: 'bol', waveCount: 8, waveAmplitude: 11 }) },

  // groep textuur: fijn oppervlaktereliëf, bobbels en de rand
  { id: 'bobbels', label: '⬤ Bobbels', group: 'textuur', values: decor({ bumpCols: 10, bumpRows: 10, bumpDepth: 8 }) },
  { id: 'deuken', label: '◌ Deuken', group: 'textuur', values: decor({ bumpCols: 8, bumpRows: 8, bumpDepth: -7 }) },
  { id: 'schubben', label: '🐟 Schubben', group: 'textuur', values: decor({ textureType: 'schub', textureScale: 28, textureDepth: 4 }) },
  { id: 'geweven', label: '▦ Geweven', group: 'textuur', values: decor({ textureType: 'geweven', textureScale: 26, textureDepth: 4 }) },
  { id: 'ruit', label: '◆ Ruit', group: 'textuur', values: decor({ textureType: 'ruit', textureScale: 30, textureDepth: 4 }) },
  { id: 'diagonaal', label: '⁄ Diagonaal', group: 'textuur', values: decor({ textureType: 'diagonaal', textureScale: 28, textureDepth: 4 }) },
  { id: 'hamerslag', label: '⬢ Hamerslag', group: 'textuur', values: decor({ textureType: 'hamerslag', textureScale: 22, textureDepth: 5 }) },
  { id: 'kartelrand', label: '⌣ Kartelrand', group: 'textuur', values: decor({ patternShape: 'groef', waveCount: 12, waveAmplitude: 5, rimWaveCount: 12, rimWaveDepth: 8 }) },

  // groep organisch: onregelmatig, asymmetrisch, met de hand geknepen
  { id: 'zacht', label: '◍ Zacht', group: 'organisch', values: decor({ organicAmount: 8, organicDetail: 3, organicFlow: 35, swayAmount: 5, swayTurns: 0.25 }) },
  { id: 'organisch', label: '🌿 Organisch', group: 'organisch', values: decor({ organicAmount: 16, organicDetail: 5, organicFlow: 80, swayAmount: 10, swayTurns: 0.5 }) },
  { id: 'wild', label: '🔥 Wild', group: 'organisch', values: decor({ organicAmount: 28, organicDetail: 8, organicFlow: 150, swayAmount: 18, swayTurns: 1 }) },
  { id: 'deining', label: '〰 Deining', group: 'organisch', values: decor({ organicAmount: 12, organicDetail: 2, organicFlow: 140, swayAmount: 0, swayTurns: 0 }) },
  { id: 'knoest', label: '🪵 Knoest', group: 'organisch', values: decor({ organicAmount: 20, organicDetail: 10, organicFlow: 25, swayAmount: 4, swayTurns: 0.25 }) },
  { id: 'leunend', label: '🍃 Leunend', group: 'organisch', values: decor({ organicAmount: 5, organicDetail: 3, organicFlow: 20, swayAmount: 26, swayTurns: 0.5 }) },
];

export const randomSeed = () => Math.floor(Math.random() * 100000) + 1;

/** Silhouet-verhoudingen omzetten naar echte controlepunten. */
export function applySilhouette(silhouette, bellyDiameter, height) {
  const d = (f) => clamp(Math.round(bellyDiameter * f), PRINTER_LIMITS.minDiameter, PRINTER_LIMITS.maxDiameter);
  const points = [{ t: 0, d: Math.max(28, d(silhouette.bottom)) }];
  if (silhouette.useLow !== false) points.push({ t: silhouette.lowPos / 100, d: d(silhouette.low) });
  if (silhouette.useHigh !== false) points.push({ t: silhouette.highPos / 100, d: d(silhouette.high) });
  points.push({ t: 1, d: d(silhouette.top) });
  return {
    height: clamp(Math.round(height), 60, PRINTER_LIMITS.maxHeight),
    profile: normalizeProfile(points),
  };
}

/**
 * Snelle, iets grovere schatting van baseOverhangDeg — alleen het silhouet en de
 * (getwiste) doorsnede, zonder de rest van createVaseShape (golven, textuur,
 * organic, de eigen auto-limit bisectie...) mee te bouwen. Voor de randomizer
 * hieronder, die dit tientallen keren per klik moet kunnen doorrekenen zonder
 * de UI te blokkeren; de exacte, volledige meting (createVaseShape) blijft de
 * uiteindelijke check.
 */
function estimateBaseOverhang(p) {
  const nodes = profilePoints(p);
  const baseRadiusAt = (t) => profileRadiusAt(nodes, t);
  const section = buildSectionField(p.section);
  const twistRad = (p.twistAngle / 180) * Math.PI;
  const twistWaves = clamp(p.twistWaves ?? 1, 0.25, 4);
  const rotAt = (t) => (p.twistMode === 'heen'
    ? twistRad * Math.sin(Math.PI * twistWaves * t)
    : twistRad * t);
  const radiusAt = (a, t) => baseRadiusAt(t) * (section ? section.at(a - rotAt(t)) : 1);

  const steps = 72;
  const angles = 64;
  let max = 0;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const dy = (p.height / steps);
    for (let j = 0; j < angles; j++) {
      const a = (j / angles) * TAU;
      const dr = Math.abs(radiusAt(a, t1) - radiusAt(a, t0));
      const deg = (Math.atan2(dr, dy) * 180) / Math.PI;
      if (deg > max) max = deg;
    }
  }
  return max;
}

/**
 * Genereer een complete, bewust "mooie" vaas.
 * Regels: harmonieuze hoogte/breedte-verhouding, één duidelijke decoratie-stijl,
 * amplitude gekoppeld aan het aantal herhalingen, en een silhouet dat binnen de
 * overhang-limiet blijft.
 */
export function randomVaseParams(rnd = Math.random) {
  const range = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (pct) => rnd() < pct;
  const snap = (v, s) => Math.round(v / s) * s;

  const silhouette = pick(SILHOUETTES);
  // Eerst de hoogte kiezen, dan pas de buikdiameter daarvan afleiden. Andersom
  // (buik × slankheid) loopt bijna altijd over de 250mm-limiet en wordt dan
  // afgekapt, waardoor vrijwel elke vaas even groot uitvalt.
  const height = snap(range(90, 235), 5);
  const slenderness = range(1.5, 2.9); // hoogte t.o.v. buikdiameter
  const belly = clamp(Math.round(height / slenderness), 45, PRINTER_LIMITS.maxDiameter);
  const base = applySilhouette(silhouette, belly, height);

  // Tussenpunten variëren: soms eentje weg voor een rustige lijn die in één
  // vloeiende beweging doorloopt, soms juist eentje erbij voor meer karakter.
  let points = base.profile.map((pt) => ({ ...pt }));
  const inner = () => points.slice(1, -1);
  if (inner().length > 1 && chance(0.2)) {
    const drop = 1 + Math.floor(rnd() * inner().length);
    points = points.filter((_, i) => i !== drop);
  }
  points = points.map((pt, i) => (i === 0 || i === points.length - 1
    ? pt
    : { ...pt, t: clamp(pt.t + range(-0.06, 0.06), 0.1, 0.9) }));
  if (chance(0.3)) {
    // extra punt midden in het langste stuk: geeft een dubbele buik of taille
    let gap = 0;
    let at = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].t - points[i - 1].t > gap) { gap = points[i].t - points[i - 1].t; at = i; }
    }
    const t = (points[at].t + points[at - 1].t) / 2;
    const d = ((points[at].d + points[at - 1].d) / 2) * range(0.82, 1.18);
    points.splice(at, 0, { t, d });
  }
  base.profile = normalizeProfile(points);

  const out = {
    ...base,
    thickness: pick([0.8, 1.2, 1.2, 1.6]),
    filament: pick(FILAMENTS).id,
    finish: pick(['mat', 'basic', 'basic', 'silk']),
    maxOverhang: 40,
    autoLimit: true,
    seed: randomSeed(),
    // alles uit; de gekozen stijl zet hieronder aan wat nodig is
    ...NO_DECOR,
    section: null,
    sectionSym: 1,
    sectionMirror: false,
    facetStrength: 0,
    ringAmount: 0,
    bumpDepth: 0,
    textureDepth: 0,
    organicDetail: 4,
    organicFlow: 60,
    swayTurns: 0.5,
  };

  // Doorsnede: vaak rond, anders een veelhoek, ster, lob, tandwiel of golfrand.
  // De 'inner' bepaalt het karakter: 1 = zuivere veelhoek, laag = uitgesproken
  // ster, tussenin = zachte lobben of een fijne golfrand.
  if (chance(0.4)) {
    const kind = pick(['veelhoek', 'veelhoek', 'ster', 'lob', 'bloem', 'tand', 'golfrand']);
    const sides = kind === 'tand' || kind === 'golfrand'
      ? Math.round(range(6, 18))
      : pick([3, 4, 4, 5, 6, 6, 8, 10, 12]);
    const inner = {
      veelhoek: 1,
      ster: range(0.5, 0.7),
      lob: range(0.58, 0.7),
      bloem: range(0.68, 0.8),
      tand: range(0.8, 0.9),
      golfrand: range(0.86, 0.93),
    }[kind];
    const sharp = kind === 'veelhoek' ? chance(0.6) : kind === 'ster' || kind === 'tand';
    out.section = normalizeSection(polySection(sides, sharp, inner));
    out.sectionSym = sides;
  }

  const refRadius = createVaseShape(out).baseRadiusAt(0.5);
  // Amplitude in % van de straal, begrensd op wat veilig te printen is
  const safePct = (n) => Math.floor(safeAmplitudeFraction(n, refRadius, out.thickness) * 100);

  const style = pick([
    'patroon', 'patroon', 'patroon', 'facet', 'facet', 'ster', 'ringen',
    'bobbels', 'bobbels', 'textuur', 'organisch', 'organisch', 'combi',
  ]);

  // Twist: soms doorlopend, soms heen-en-weer zodat de vorm zichzelf sluit
  const addTwist = (max) => {
    out.twistAngle = snap(range(-max, max), 30);
    if (chance(0.35)) {
      out.twistMode = 'heen';
      out.twistWaves = pick([1, 1, 2, 3]);
      out.twistAngle = snap(range(120, max), 30) * pick([1, -1]);
    }
  };

  if (style === 'patroon' || style === 'combi') {
    out.patternShape = pick([
      'golf', 'ribbel', 'ribbel', 'groef', 'paneel', 'zaag', 'punt', 'kabel',
      'kerf', 'trap', 'schelp', 'bol',
    ]);
    out.waveCount = out.patternShape === 'paneel' ? Math.round(range(4, 9)) : Math.round(range(8, 34));
    out.waveAmplitude = Math.max(2, Math.round(range(0.45, 0.95) * safePct(out.waveCount)));
    if (chance(0.55)) addTwist(300);
  }
  if (style === 'ster') {
    out.patternShape = 'ster';
    out.waveCount = Math.round(range(5, 12));
    out.waveAmplitude = Math.max(4, Math.round(range(0.5, 0.9) * safePct(out.waveCount)));
    if (chance(0.4)) addTwist(180);
  }
  if (style === 'facet') {
    out.facetCount = Math.round(range(5, 12));
    out.facetStrength = snap(range(50, 100), 5);
    if (chance(0.5)) addTwist(240);
  }
  if (style === 'ringen') {
    out.ringCount = Math.round(range(6, 26));
    out.ringAmount = Math.round(range(3, 7));
  }
  if (style === 'bobbels') {
    out.bumpCols = Math.round(range(6, 16));
    out.bumpRows = Math.round(range(5, 16));
    out.bumpStagger = chance(0.7);
    const maxDepth = Math.max(4, safePct(Math.max(out.bumpCols, out.bumpRows)));
    out.bumpDepth = Math.round(range(0.5, 1) * maxDepth) * (chance(0.25) ? -1 : 1);
    if (chance(0.3)) addTwist(180);
  }
  if (style === 'textuur') {
    out.textureType = pick(['lijnen', 'ruit', 'noppen', 'schub', 'geweven', 'grof', 'diagonaal', 'hamerslag']);
    out.textureScale = Math.round(range(14, 46));
    out.textureDepth = Math.max(2, Math.round(range(0.6, 1) * safePct(out.textureScale)));
  }
  if (style === 'organisch' || style === 'combi') {
    out.organicDetail = Math.round(range(3, 8));
    out.organicAmount = Math.round(
      (style === 'combi' ? range(0.2, 0.4) : range(0.5, 0.95)) * safePct(1 + out.organicDetail)
    );
    out.organicFlow = snap(range(20, 150), 5);
    out.swayAmount = chance(0.6) ? Math.round(range(4, 20)) : 0;
    out.swayTurns = pick([0, 0.25, 0.5, 0.75, 1]);
  }

  // Extra's die over elke stijl heen kunnen
  if (style !== 'textuur' && chance(0.25)) {
    out.textureType = pick(['lijnen', 'ruit', 'noppen', 'geweven', 'grof', 'diagonaal', 'hamerslag']);
    out.textureScale = Math.round(range(18, 46));
    out.textureDepth = Math.max(1, Math.round(range(0.4, 0.8) * safePct(out.textureScale)));
  }
  if (chance(0.15)) {
    out.rimWaveCount = pick([6, 8, 10, 12, 16]);
    out.rimWaveDepth = Math.round(range(4, 12));
  }

  // Silhouet bijsturen tot het niet te steil overhangt: trek elk profielpunt
  // naar de gemiddelde diameter toe én dempen we de twist. Dit staat bewust na
  // de doorsnede-keuze en de twist hierboven: een ster/veelhoek-doorsnede die
  // ronddraait met de hoogte (twist) overhangt ook bij een perfect cilindrisch
  // profiel — alleen diameters middelen lost dat niet op, dus corrigeren vóór
  // die keuzes zou voor niets zijn geweest. Gebruikt de goedkope schatter
  // (estimateBaseOverhang) tijdens het itereren: de volle createVaseShape
  // rekent ook meteen alle decoratie en zijn eigen auto-limit-bisectie door,
  // en dat tientallen keren per klik zou "Verras me" merkbaar laten haperen.
  {
    // Stap 1: de vaas slanker maken. Overhang is de hoek van de wand, dus
    // dezelfde diameters over meer hoogte uitsmeren maakt hem vanzelf minder
    // steil — en houdt het silhouet volledig intact. Dit gaat bewust vóór het
    // afvlakken hieronder: dat laatste maakt van een mooie buik een cilinder.
    // Hoogstens de helft erbij: anders wordt elke te steile vaas een slanke
    // toren van 250mm en lijkt alles weer op elkaar.
    const maxTall = Math.min(PRINTER_LIMITS.maxHeight, Math.round(out.height * 1.5));
    for (let i = 0; i < 5; i++) {
      if (estimateBaseOverhang(out) <= out.maxOverhang) break;
      const taller = Math.min(maxTall, Math.round(out.height * 1.15));
      if (taller <= out.height) break; // zo hoog mag hij niet meer worden
      out.height = taller;
    }

    // Stap 2: pas als slanker maken niet meer kan, de diameters en de twist
    // afvlakken richting het gemiddelde.
    const mean = out.profile.reduce((s, pt) => s + pt.d, 0) / out.profile.length;
    for (let i = 0; i < 12; i++) {
      if (estimateBaseOverhang(out) <= out.maxOverhang) break;
      out.profile = out.profile.map((pt) => {
        const dev = pt.d - mean;
        const shrunk = Math.sign(dev) * Math.floor(Math.abs(dev) * 0.7);
        return { ...pt, d: Math.round(mean + shrunk) };
      });
      out.twistAngle = Math.sign(out.twistAngle) * Math.floor(Math.abs(out.twistAngle) * 0.7);
    }
    // Vangnet: de schatter is bewust wat grover dan de exacte meting; die
    // exacte meting (createVaseShape) is de uiteindelijke, harde garantie.
    // Blijft die alsnog te steil (bv. een heel scherpe ster-doorsnede), val
    // dan terug op een rechte cilinder zonder twist — die overhangt per
    // definitie nooit.
    if (createVaseShape(out).baseOverhangDeg > out.maxOverhang) {
      out.twistAngle = 0;
      out.twistMode = 'lineair';
      out.profile = out.profile.map((pt) => ({ ...pt, d: Math.round(mean) }));
    }
  }

  return out;
}
