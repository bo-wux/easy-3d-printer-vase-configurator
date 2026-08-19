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
export function normalizeProfile(points) {
  const list = (points || [])
    .filter((pt) => pt && Number.isFinite(pt.t) && Number.isFinite(pt.d))
    .map((pt) => ({
      t: clamp(pt.t, 0, 1),
      d: clamp(Math.round(pt.d), PRINTER_LIMITS.minDiameter, PRINTER_LIMITS.maxDiameter),
    }))
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

/** Straal op relatieve hoogte t, met vloeiende overgangen tussen de punten. */
export function profileRadiusAt(points, t) {
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t || i === points.length - 1) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.t - a.t;
      const local = span > 1e-6 ? clamp((t - a.t) / span, 0, 1) : 1;
      return (a.d + (b.d - a.d) * smoothstep(local)) / 2;
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

export function createVaseShape(params) {
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
  const rimAmp = rimCount >= 2 ? clamp((p.rimWaveDepth ?? 0) / 100, 0, 0.2) * height : 0;

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

  // Overhang = hoek van de wand t.o.v. verticaal; te steil = zakt door in vase mode
  const measureOverhang = (scale) => {
    const steps = 60;
    const angles = 24;
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
      80 + flow * detail * 12 + swayTurns * 30 + ringCount * 8 + Math.abs(p.twistAngle) / 12
        + (bumpAmp !== 0 ? bumpRows * 12 : 0)
        + (textureAmp > 0 ? textureRows * 6 : 0)
        + (rimAmp > 0 ? 40 : 0)
    ),
    80,
    280
  );

  return {
    height,
    wall,
    baseRadiusAt,
    radiusAt,
    centerAt,
    heightAt,
    pointAt,
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

/** Decoratie-stijlen: zetten alleen de patroon-/textuur-/organic-parameters. */
export const DECOR_PRESETS = [
  { id: 'glad', label: '○ Glad', values: decor({}) },
  { id: 'ribbels', label: '≣ Ribbels', values: decor({ patternShape: 'ribbel', waveCount: 20, waveAmplitude: 6 }) },
  { id: 'cannelure', label: '⌇ Cannelure', values: decor({ patternShape: 'groef', waveCount: 14, waveAmplitude: 7 }) },
  { id: 'twist', label: '🌀 Twist', values: decor({ patternShape: 'ribbel', waveCount: 12, waveAmplitude: 8, twistAngle: 180 }) },
  { id: 'vlecht', label: '🪢 Vlecht', values: decor({ patternShape: 'kabel', waveCount: 10, waveAmplitude: 9, twistAngle: 220, twistMode: 'heen', twistWaves: 2 }) },
  { id: 'facet', label: '⬡ Facet', values: decor({ facetCount: 8, facetStrength: 80 }) },
  { id: 'kristal', label: '💎 Kristal', values: decor({ facetCount: 6, facetStrength: 100, twistAngle: 90 }) },
  { id: 'ster', label: '✦ Ster', values: decor({ patternShape: 'ster', waveCount: 8, waveAmplitude: 12 }) },
  { id: 'zaagtand', label: '⩘ Zaagtand', values: decor({ patternShape: 'zaag', waveCount: 18, waveAmplitude: 6, twistAngle: 120 }) },
  { id: 'ringen', label: '☰ Ringen', values: decor({ ringCount: 14, ringAmount: 5 }) },
  { id: 'paneel', label: '▤ Paneel', values: decor({ patternShape: 'paneel', waveCount: 6, waveAmplitude: 9 }) },
  { id: 'bobbels', label: '⬤ Bobbels', values: decor({ bumpCols: 10, bumpRows: 10, bumpDepth: 8 }) },
  { id: 'deuken', label: '◌ Deuken', values: decor({ bumpCols: 8, bumpRows: 8, bumpDepth: -7 }) },
  { id: 'schubben', label: '🐟 Schubben', values: decor({ textureType: 'schub', textureScale: 28, textureDepth: 4 }) },
  { id: 'geweven', label: '▦ Geweven', values: decor({ textureType: 'geweven', textureScale: 26, textureDepth: 4 }) },
  { id: 'ruit', label: '◆ Ruit', values: decor({ textureType: 'ruit', textureScale: 30, textureDepth: 4 }) },
  { id: 'kartelrand', label: '⌣ Kartelrand', values: decor({ patternShape: 'groef', waveCount: 12, waveAmplitude: 5, rimWaveCount: 12, rimWaveDepth: 8 }) },
  { id: 'zacht', label: '◍ Zacht', values: decor({ organicAmount: 8, organicDetail: 3, organicFlow: 35, swayAmount: 5, swayTurns: 0.25 }) },
  { id: 'organisch', label: '🌿 Organisch', values: decor({ organicAmount: 16, organicDetail: 5, organicFlow: 80, swayAmount: 10, swayTurns: 0.5 }) },
  { id: 'wild', label: '🔥 Wild', values: decor({ organicAmount: 28, organicDetail: 8, organicFlow: 150, swayAmount: 18, swayTurns: 1 }) },
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

  // Silhouet bijsturen tot het niet te steil overhangt
  for (let i = 0; i < 8; i++) {
    if (createVaseShape(out).baseOverhangDeg <= out.maxOverhang) break;
    const mean = out.profile.reduce((s, pt) => s + pt.d, 0) / out.profile.length;
    out.profile = out.profile.map((pt) => ({ ...pt, d: Math.round(mean + (pt.d - mean) * 0.85) }));
  }

  // Doorsnede: meestal rond, soms een veelhoek of lobben voor een strakker karakter
  if (chance(0.28)) {
    const sides = pick([3, 4, 4, 5, 6, 6, 8]);
    const sharp = chance(0.6);
    const inner = chance(0.35) ? range(0.55, 0.8) : 1;
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
    out.patternShape = pick(['golf', 'ribbel', 'ribbel', 'groef', 'paneel', 'zaag', 'punt', 'kabel']);
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
    out.textureType = pick(['lijnen', 'ruit', 'noppen', 'schub', 'geweven', 'grof']);
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
    out.textureType = pick(['lijnen', 'ruit', 'noppen', 'geweven', 'grof']);
    out.textureScale = Math.round(range(18, 46));
    out.textureDepth = Math.max(1, Math.round(range(0.4, 0.8) * safePct(out.textureScale)));
  }
  if (chance(0.15)) {
    out.rimWaveCount = pick([6, 8, 10, 12, 16]);
    out.rimWaveDepth = Math.round(range(4, 12));
  }

  return out;
}
