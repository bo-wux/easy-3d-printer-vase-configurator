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

const TAU = Math.PI * 2;
const smoothstep = (x) => x * x * (3 - 2 * x);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Bambu Lab P1S: 256×256×256 bouwvolume, met marge tot de rand van de plaat
export const PRINTER_LIMITS = {
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
    case 'golf':
    default:
      return s;
  }
}

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

export const DEFAULT_SHAPE = {
  // silhouet
  height: 180,
  thickness: 0.8,
  diameterBottom: 55,
  useLow: true,
  diameterLow: 88,
  positionLow: 32,
  useHigh: true,
  diameterHigh: 78,
  positionHigh: 70,
  diameterTop: 62,
  // symmetrisch patroon
  patternShape: 'ribbel',
  waveCount: 16,
  waveAmplitude: 4,
  twistAngle: 0,
  facetCount: 0,
  facetStrength: 60,
  ringCount: 0,
  ringAmount: 4,
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

export function createVaseShape(params) {
  const p = { ...DEFAULT_SHAPE, ...params };
  const height = p.height;
  const wall = p.thickness;

  // Silhouet als reeks controlepunten; buik en schouder zijn optioneel,
  // uit = de vorm loopt in één vloeiende lijn van bodem naar opening.
  const nodes = [{ t: 0, r: p.diameterBottom / 2 }];
  if (p.useLow !== false) nodes.push({ t: clamp(p.positionLow / 100, 0.02, 0.98), r: p.diameterLow / 2 });
  if (p.useHigh !== false) nodes.push({ t: clamp(p.positionHigh / 100, 0.02, 0.98), r: p.diameterHigh / 2 });
  nodes.push({ t: 1, r: p.diameterTop / 2 });
  nodes.sort((a, b) => a.t - b.t);

  const baseRadiusAt = (t) => {
    for (let i = 1; i < nodes.length; i++) {
      if (t <= nodes[i].t || i === nodes.length - 1) {
        const a = nodes[i - 1];
        const b = nodes[i];
        const span = b.t - a.t;
        const local = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 1;
        return a.r + (b.r - a.r) * smoothstep(local);
      }
    }
    return nodes[0].r;
  };

  const refRadius = baseRadiusAt(0.5);
  const twistRad = (p.twistAngle / 180) * Math.PI;

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

  // Genormaliseerd naar [-1, 1]
  const organicField = (angle, t) => {
    if (!harmonics.length) return 0;
    const rot = t * twistRad;
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

  // scale schaalt alleen de decoratie, nooit het basisprofiel
  const radiusRaw = (angle, t, scale) => {
    const base = baseRadiusAt(t);
    const a = angle - t * twistRad; // twist draait het hele patroon mee omhoog

    let factor = 1;
    if (facetStrength > 0) factor *= 1 + (facetField(a) - 1) * facetStrength * scale;
    if (ringAmount > 0) factor *= 1 + Math.sin(t * TAU * ringCount) * ringAmount * scale;

    let r = base * factor;
    if (waveAmp > 0) r += patternProfile(p.patternShape, a * waveCount) * waveAmp * base * scale;
    if (organicAmount > 0) r += organicField(angle, t) * organicAmount * base * scale;

    return Math.max(base * 0.2, r);
  };

  const centerRaw = (t, scale) => {
    if (swayAmount <= 0 || scale <= 0) return { x: 0, z: 0 };
    // smoothstep: de bodem blijft gecentreerd -> stabiele, vlakke voet
    const amt = swayAmount * refRadius * smoothstep(clamp(t, 0, 1)) * scale;
    const a = swayPhase + t * TAU * swayTurns;
    return { x: Math.cos(a) * amt, z: Math.sin(a) * amt };
  };

  // Overhang = hoek van de wand t.o.v. verticaal; te steil = zakt door in vase mode
  const measureOverhang = (scale) => {
    const steps = 60;
    const angles = 24;
    const dt = 1 / steps;
    const dy = dt * height;
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
        const deg = (Math.atan2(Math.hypot(dx, dz), dy) * 180) / Math.PI;
        if (deg > max) max = deg;
      }
    }
    return max;
  };

  const limit = p.maxOverhang;
  const baseOverhang = measureOverhang(0);
  const hasDetail = organicAmount > 0 || waveAmp > 0 || swayAmount > 0 || ringAmount > 0 || facetStrength > 0;

  let detailScale = 1;
  // Als het silhouet zelf al te steil is valt er niets te redden met schalen:
  // dan alleen waarschuwen, de gebruiker moet de diameters aanpassen.
  if (p.autoLimit && hasDetail && baseOverhang < limit && measureOverhang(1) > limit) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (measureOverhang(mid) > limit) hi = mid;
      else lo = mid;
    }
    detailScale = lo;
  }

  const radiusAt = (angle, t) => radiusRaw(angle, t, detailScale);
  const centerAt = (t) => centerRaw(t, detailScale);

  /** Punt op het oppervlak. radialOffset < 0 = naar binnen (binnenwand). */
  const pointAt = (angle, t, radialOffset = 0) => {
    const r = Math.max(0.3, radiusAt(angle, t) + radialOffset);
    const c = centerAt(t);
    return {
      x: c.x + Math.cos(angle) * r,
      y: t * height,
      z: c.z + Math.sin(angle) * r,
    };
  };

  // Genoeg segmenten om alle detail glad weer te geven
  const radialSegments = clamp(
    Math.max(
      128,
      waveAmp > 0 ? waveCount * 24 : 0,
      facetStrength > 0 ? facetCount * 48 : 0,
      organicAmount > 0 ? maxOrder * 40 : 0
    ),
    128,
    512
  );
  const heightSegments = clamp(
    Math.round(80 + flow * detail * 12 + swayTurns * 30 + ringCount * 8 + Math.abs(p.twistAngle) / 12),
    80,
    240
  );

  return {
    height,
    wall,
    baseRadiusAt,
    radiusAt,
    centerAt,
    pointAt,
    radialSegments,
    heightSegments,
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
];

/** Decoratie-stijlen: zetten alleen de patroon-/organic-parameters. */
export const DECOR_PRESETS = [
  { id: 'glad', label: '○ Glad', values: { waveAmplitude: 0, waveCount: 0, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'ribbels', label: '≣ Ribbels', values: { patternShape: 'ribbel', waveCount: 20, waveAmplitude: 6, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'cannelure', label: '⌇ Cannelure', values: { patternShape: 'groef', waveCount: 14, waveAmplitude: 7, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'twist', label: '🌀 Twist', values: { patternShape: 'ribbel', waveCount: 12, waveAmplitude: 8, twistAngle: 180, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0 } },
  { id: 'facet', label: '⬡ Facet', values: { facetCount: 8, facetStrength: 80, waveAmplitude: 0, waveCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'kristal', label: '💎 Kristal', values: { facetCount: 6, facetStrength: 100, twistAngle: 90, waveAmplitude: 0, waveCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0 } },
  { id: 'ster', label: '✦ Ster', values: { patternShape: 'ster', waveCount: 8, waveAmplitude: 12, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'ringen', label: '☰ Ringen', values: { ringCount: 14, ringAmount: 5, waveAmplitude: 0, waveCount: 0, facetCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'paneel', label: '▤ Paneel', values: { patternShape: 'paneel', waveCount: 6, waveAmplitude: 9, facetCount: 0, ringCount: 0, organicAmount: 0, swayAmount: 0, twistAngle: 0 } },
  { id: 'zacht', label: '◍ Zacht', values: { organicAmount: 8, organicDetail: 3, organicFlow: 35, swayAmount: 5, swayTurns: 0.25, waveAmplitude: 0, facetCount: 0, ringCount: 0 } },
  { id: 'organisch', label: '🌿 Organisch', values: { organicAmount: 16, organicDetail: 5, organicFlow: 80, swayAmount: 10, swayTurns: 0.5, waveAmplitude: 0, facetCount: 0, ringCount: 0 } },
  { id: 'wild', label: '🔥 Wild', values: { organicAmount: 28, organicDetail: 8, organicFlow: 150, swayAmount: 18, swayTurns: 1, waveAmplitude: 0, facetCount: 0, ringCount: 0 } },
];

export const randomSeed = () => Math.floor(Math.random() * 100000) + 1;

/** Silhouet-verhoudingen omzetten naar echte diameters. */
export function applySilhouette(silhouette, bellyDiameter, height) {
  const d = (f) => clamp(Math.round(bellyDiameter * f), PRINTER_LIMITS.minDiameter, PRINTER_LIMITS.maxDiameter);
  const useLow = silhouette.useLow !== false;
  const useHigh = silhouette.useHigh !== false;
  return {
    height: clamp(Math.round(height), 60, PRINTER_LIMITS.maxHeight),
    diameterBottom: Math.max(28, d(silhouette.bottom)),
    useLow,
    diameterLow: d(useLow ? silhouette.low : silhouette.bottom),
    positionLow: useLow ? silhouette.lowPos : 33,
    useHigh,
    diameterHigh: d(useHigh ? silhouette.high : silhouette.top),
    positionHigh: useHigh ? silhouette.highPos : 67,
    diameterTop: d(silhouette.top),
  };
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
  const belly = snap(range(70, 150), 5);
  const slenderness = range(1.5, 2.9); // hoogte t.o.v. buikdiameter
  const base = applySilhouette(silhouette, belly, belly * slenderness);

  // Buik/schouder soms weglaten -> rustige vorm die in één lijn doorloopt.
  // Als ze wel meedoen: posities licht variëren, maar met een minimale
  // tussenafstand zodat er geen rare knik of dubbele knik ontstaat.
  if (base.useLow && chance(0.15)) base.useLow = false;
  if (base.useHigh && chance(0.2)) base.useHigh = false;
  if (base.useLow) base.positionLow = clamp(Math.round(base.positionLow + range(-6, 6)), 15, 55);
  if (base.useHigh) {
    const floor = base.useLow ? base.positionLow + 20 : 30;
    base.positionHigh = clamp(Math.round(base.positionHigh + range(-6, 6)), floor, 85);
  }
  if (!base.useLow) base.diameterLow = base.diameterBottom;
  if (!base.useHigh) base.diameterHigh = base.diameterTop;

  const out = {
    ...base,
    thickness: pick([0.8, 0.8, 1.0, 1.2]),
    maxOverhang: 40,
    autoLimit: true,
    seed: randomSeed(),
    // alles uit; de gekozen stijl zet hieronder aan wat nodig is
    patternShape: 'golf',
    waveCount: 0,
    waveAmplitude: 0,
    twistAngle: 0,
    facetCount: 0,
    facetStrength: 0,
    ringCount: 0,
    ringAmount: 0,
    organicAmount: 0,
    organicDetail: 4,
    organicFlow: 60,
    swayAmount: 0,
    swayTurns: 0.5,
  };

  // Silhouet bijsturen tot het niet te steil overhangt
  const keys = ['diameterBottom', 'diameterLow', 'diameterHigh', 'diameterTop'];
  for (let i = 0; i < 8; i++) {
    if (createVaseShape(out).baseOverhangDeg <= out.maxOverhang) break;
    const mean = keys.reduce((s, k) => s + out[k], 0) / keys.length;
    keys.forEach((k) => { out[k] = Math.round(mean + (out[k] - mean) * 0.85); });
  }

  const refRadius = createVaseShape(out).baseRadiusAt(0.5);
  // Amplitude in % van de straal, begrensd op wat veilig te printen is
  const safePct = (n) => Math.floor(safeAmplitudeFraction(n, refRadius, out.thickness) * 100);

  const style = pick(['patroon', 'patroon', 'patroon', 'facet', 'facet', 'ster', 'ringen', 'organisch', 'organisch', 'combi']);

  if (style === 'patroon' || style === 'combi') {
    out.patternShape = pick(['golf', 'ribbel', 'ribbel', 'groef', 'paneel']);
    out.waveCount = out.patternShape === 'paneel' ? Math.round(range(4, 9)) : Math.round(range(8, 34));
    out.waveAmplitude = Math.max(2, Math.round(range(0.45, 0.95) * safePct(out.waveCount)));
    if (chance(0.55)) out.twistAngle = snap(range(-300, 300), 30);
  }
  if (style === 'ster') {
    out.patternShape = 'ster';
    out.waveCount = Math.round(range(5, 12));
    out.waveAmplitude = Math.max(4, Math.round(range(0.5, 0.9) * safePct(out.waveCount)));
    if (chance(0.4)) out.twistAngle = snap(range(-180, 180), 30);
  }
  if (style === 'facet') {
    out.facetCount = Math.round(range(5, 12));
    out.facetStrength = snap(range(50, 100), 5);
    if (chance(0.5)) out.twistAngle = snap(range(-240, 240), 30);
  }
  if (style === 'ringen') {
    out.ringCount = Math.round(range(6, 26));
    out.ringAmount = Math.round(range(3, 7));
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

  return out;
}
