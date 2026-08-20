/**
 * Printbaarheidscontrole op de échte STL-export.
 *
 * Bouwt per testgeval exact dezelfde bytes als de downloadknop (float32,
 * Z-up, bodem op 0), leest die terug en controleert:
 *  - bestandsopbouw, NaN, ontaarde driehoeken
 *  - watertight + consistente winding (elke rand precies 1x per richting)
 *  - volume > 0 (naar buiten gerichte normalen), bodem op Z=0 en naar beneden
 *  - bouwvolume van de printer
 *  - virtueel slicen: per laag gesloten contouren, geen zelfdoorsnijdingen en
 *    de wanddikte in het slice-vlak (dat is wat de slicer echt moet extruderen)
 *
 * node scripts/check-stl.mjs [--layers=9] [--filter=tekst]
 */
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { buildVaseMesh } from '../src/lib/vaseMesh.js';
import {
  DEFAULT_SHAPE,
  SECTION_PRESETS,
  SILHOUETTES,
  DECOR_PRESETS,
  applySilhouette,
  randomVaseParams,
  PRINTER_LIMITS,
  TEXTURES,
  PATTERN_SHAPES,
} from '../src/lib/vaseShape.js';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const LAYERS = Number(args.get('layers') || 9);
const FILTER = args.get('filter') || '';
const NOZZLE = PRINTER_LIMITS.nozzle;

/** Zelfde stappen als ExportButton: mesh -> float32 -> Z-up -> bodem op 0 -> binaire STL. */
function exportStl(params, vaseMode) {
  const { positions, indices } = buildVaseMesh(params, { solid: vaseMode });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  geometry.computeBoundingBox();
  geometry.translate(0, 0, -geometry.boundingBox.min.z);
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const view = new STLExporter().parse(mesh, { binary: true });
  return view.buffer;
}

function parseStl(buffer) {
  const dv = new DataView(buffer);
  const count = dv.getUint32(80, true);
  const sizeOk = buffer.byteLength === 84 + count * 50;
  const P = new Float64Array(count * 9);
  const N = new Float64Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50;
    for (let k = 0; k < 3; k++) N[i * 3 + k] = dv.getFloat32(o + k * 4, true);
    for (let k = 0; k < 9; k++) P[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
  }
  return { count, P, N, sizeOk };
}

/** Vertexsleutel op de exacte float32-waarde: zo weldt de slicer ook. */
const vkey = (P, o) => `${P[o]},${P[o + 1]},${P[o + 2]}`;

function checkTopology(P, count) {
  const dir = new Map();
  let nan = 0;
  let degenerate = 0;
  let volume = 0;
  let bottomDown = 0;
  let bottomUp = 0;
  let minEdge = Infinity;
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (let i = 0; i < count; i++) {
    const o = i * 9;
    for (let k = 0; k < 9; k++) {
      const v = P[o + k];
      if (!Number.isFinite(v)) nan++;
      const axis = k % 3;
      if (v < box.min[axis]) box.min[axis] = v;
      if (v > box.max[axis]) box.max[axis] = v;
    }
    const ax = P[o], ay = P[o + 1], az = P[o + 2];
    const bx = P[o + 3], by = P[o + 4], bz = P[o + 5];
    const cx = P[o + 6], cy = P[o + 7], cz = P[o + 8];

    const ka = vkey(P, o), kb = vkey(P, o + 3), kc = vkey(P, o + 6);
    if (ka === kb || kb === kc || ka === kc) degenerate++;
    for (const [p, q] of [[ka, kb], [kb, kc], [kc, ka]]) {
      const k = p + '>' + q;
      dir.set(k, (dir.get(k) || 0) + 1);
    }
    minEdge = Math.min(
      minEdge,
      Math.hypot(bx - ax, by - ay, bz - az),
      Math.hypot(cx - bx, cy - by, cz - bz),
      Math.hypot(ax - cx, ay - cy, az - cz)
    );

    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    if (az < 1e-4 && bz < 1e-4 && cz < 1e-4) {
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (nz < 0) bottomDown++; else bottomUp++;
    }
  }

  let unmatched = 0;
  let doubled = 0;
  for (const [k, n] of dir) {
    if (n > 1) doubled++;
    const [p, q] = k.split('>');
    if ((dir.get(q + '>' + p) || 0) !== n) unmatched++;
  }

  return { nan, degenerate, unmatched, doubled, volume, bottomDown, bottomUp, minEdge, box };
}

/** Doorsnede van de mesh op hoogte z, als losse segmenten. */
function sliceSegments(P, count, z) {
  const segs = [];
  let odd = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 9;
    const zs = [P[o + 2], P[o + 5], P[o + 8]];
    if ((zs[0] > z && zs[1] > z && zs[2] > z) || (zs[0] < z && zs[1] < z && zs[2] < z)) continue;
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = o + e * 3;
      const b = o + ((e + 1) % 3) * 3;
      const za = P[a + 2] - z;
      const zb = P[b + 2] - z;
      if ((za < 0 && zb > 0) || (za > 0 && zb < 0)) {
        const f = za / (za - zb);
        pts.push([P[a] + (P[b] - P[a]) * f, P[a + 1] + (P[b + 1] - P[a + 1]) * f]);
      }
    }
    if (pts.length === 2) segs.push([pts[0], pts[1]]);
    else if (pts.length === 1) odd++;
  }
  return { segs, odd };
}

const pkey = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

/** Segmenten aan elkaar knopen tot gesloten contouren. */
function buildLoops(segs) {
  const nodes = new Map();
  const add = (k, p) => {
    let n = nodes.get(k);
    if (!n) { n = { p, links: [] }; nodes.set(k, n); }
    return n;
  };
  segs.forEach(([a, b], i) => {
    const ka = pkey(a), kb = pkey(b);
    if (ka === kb) return;
    add(ka, a).links.push([kb, i]);
    add(kb, b).links.push([ka, i]);
  });

  let openEnds = 0;
  let branches = 0;
  for (const n of nodes.values()) {
    if (n.links.length < 2) openEnds++;
    else if (n.links.length > 2) branches++;
  }

  const used = new Set();
  const loops = [];
  for (const [start, node] of nodes) {
    if (used.has(start) || node.links.length !== 2) continue;
    const loop = [];
    let key = start;
    let prev = null;
    while (key && !used.has(key)) {
      used.add(key);
      const cur = nodes.get(key);
      loop.push(cur.p);
      const next = cur.links.find(([k]) => k !== prev) || cur.links[0];
      prev = key;
      key = next ? next[0] : null;
      if (key === start) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return { loops, openEnds, branches };
}

const loopArea = (loop) => {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

const segCross = (a, b, c, d) => {
  const d1 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d2 = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
  const d3 = (d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0]);
  const d4 = (d[0] - c[0]) * (b[1] - c[1]) - (d[1] - c[1]) * (b[0] - c[0]);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};

/** Snijdt een contour zichzelf? Rasterversnelling, buren worden overgeslagen. */
function selfIntersections(loop) {
  const n = loop.length;
  if (n < 4) return 0;
  const cell = 4;
  const grid = new Map();
  const at = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const bucket = (k, i) => {
    let list = grid.get(k);
    if (!list) { list = []; grid.set(k, list); }
    list.push(i);
  };
  for (let i = 0; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    for (let x = Math.floor(x0 / cell); x <= Math.floor(x1 / cell); x++) {
      for (let y = Math.floor(y0 / cell); y <= Math.floor(y1 / cell); y++) bucket(`${x},${y}`, i);
    }
  }
  let hits = 0;
  const seen = new Set();
  for (const list of grid.values()) {
    for (let u = 0; u < list.length; u++) {
      for (let v = u + 1; v < list.length; v++) {
        const i = list[u], j = list[v];
        if (i === j || (i + 1) % n === j || (j + 1) % n === i) continue;
        const pair = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        if (segCross(loop[i], loop[(i + 1) % n], loop[j], loop[(j + 1) % n])) hits++;
      }
    }
  }
  return hits;
}

const pointSegDist = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const len = vx * vx + vy * vy;
  const t = len > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0;
  return Math.hypot(wx - vx * t, wy - vy * t);
};

/** Snijden twee losse contouren elkaar? Dan loopt de wand door zichzelf heen. */
function crossings(a, b) {
  let hits = 0;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i], a1 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segCross(a0, a1, b[j], b[(j + 1) % b.length])) hits++;
    }
  }
  return hits;
}

/**
 * Wanddikte in het slice-vlak: afstand van elk punt van de binnencontour tot de
 * buitencontour. Dat is precies wat de slicer moet extruderen.
 */
function wallProfile(inner, outer) {
  const d = [];
  for (const p of inner) {
    let min = Infinity;
    for (let i = 0; i < outer.length; i++) {
      const v = pointSegDist(p, outer[i], outer[(i + 1) % outer.length]);
      if (v < min) min = v;
    }
    d.push(min);
  }
  d.sort((x, y) => x - y);
  return { min: d[0], thin: d.filter((v) => v < NOZZLE).length / d.length };
}

function checkLayers(P, count, height, vaseMode) {
  const issues = [];
  let minWall = Infinity;
  let maxThin = 0;
  let maxLoops = 0;
  for (let i = 0; i < LAYERS; i++) {
    // schuine offset: nooit precies op een vertexhoogte uitkomen
    const z = height * ((i + 0.5137) / LAYERS) * 0.985 + 0.12;
    const { segs, odd } = sliceSegments(P, count, z);
    if (!segs.length) { issues.push(`laag ${z.toFixed(1)}mm leeg`); continue; }
    if (odd) issues.push(`laag ${z.toFixed(1)}mm: ${odd} halve sneden`);
    const { loops, openEnds, branches } = buildLoops(segs);
    if (openEnds) issues.push(`laag ${z.toFixed(1)}mm: ${openEnds} open contour-einden`);
    if (branches) issues.push(`laag ${z.toFixed(1)}mm: ${branches} vertakkingen`);
    maxLoops = Math.max(maxLoops, loops.length);
    for (const loop of loops) {
      const hits = selfIntersections(loop);
      if (hits) issues.push(`laag ${z.toFixed(1)}mm: contour snijdt zichzelf (${hits}x)`);
    }
    if (vaseMode && loops.length !== 1) {
      issues.push(`laag ${z.toFixed(1)}mm: ${loops.length} contouren (vase mode wil er 1)`);
    }
    for (let a = 0; a < loops.length; a++) {
      for (let b = a + 1; b < loops.length; b++) {
        const hits = crossings(loops[a], loops[b]);
        if (hits) issues.push(`laag ${z.toFixed(1)}mm: contouren snijden elkaar (${hits}x)`);
      }
    }
    if (loops.length === 2) {
      const [outer, inner] = [...loops].sort((x, y) => Math.abs(loopArea(y)) - Math.abs(loopArea(x)));
      const wall = wallProfile(inner, outer);
      if (wall.min < minWall) minWall = wall.min;
      if (wall.thin > maxThin) maxThin = wall.thin;
    }
  }
  return { issues, minWall, maxThin, maxLoops };
}

function run(label, params, vaseMode) {
  const t0 = Date.now();
  const buffer = exportStl(params, vaseMode);
  const { count, P, sizeOk } = parseStl(buffer);
  const topo = checkTopology(P, count);
  const height = topo.box.max[2] - topo.box.min[2];
  const width = Math.max(topo.box.max[0] - topo.box.min[0], topo.box.max[1] - topo.box.min[1]);
  const layers = checkLayers(P, count, height, vaseMode);

  const fails = [];
  if (!sizeOk) fails.push('bestandslengte klopt niet');
  if (topo.nan) fails.push(`${topo.nan} NaN/Inf`);
  if (topo.degenerate) fails.push(`${topo.degenerate} ontaarde driehoeken`);
  if (topo.unmatched) fails.push(`${topo.unmatched} losse randen (niet watertight)`);
  if (topo.doubled) fails.push(`${topo.doubled} dubbele randen`);
  if (topo.volume <= 0) fails.push('normalen naar binnen (volume <= 0)');
  if (Math.abs(topo.box.min[2]) > 1e-4) fails.push(`bodem niet op Z=0 (${topo.box.min[2].toFixed(4)})`);
  if (topo.bottomUp) fails.push(`${topo.bottomUp} bodemdriehoeken wijzen omhoog`);
  if (!topo.bottomDown) fails.push('geen vlakke bodem gevonden');
  if (height > PRINTER_LIMITS.maxHeight + 0.01) fails.push(`te hoog: ${height.toFixed(1)}mm`);
  if (width > PRINTER_LIMITS.bedSize) fails.push(`te breed: ${width.toFixed(1)}mm`);
  // losse dunne plekjes (een scherpe groef) print een slicer met een smalle lijn;
  // pas als een groot deel van de wand te dun is ontstaan er echte gaten
  if (!vaseMode && layers.maxThin > 0.05) {
    fails.push(`${(layers.maxThin * 100).toFixed(0)}% van de wand dunner dan ${NOZZLE}mm`);
  }
  fails.push(...layers.issues);

  const ok = fails.length === 0;
  const wall = Number.isFinite(layers.minWall) ? `${layers.minWall.toFixed(2)}mm` : 'n.v.t.';
  const thin = `${(layers.maxThin * 100).toFixed(0)}%`;
  console.log(
    `${ok ? 'OK  ' : 'FOUT'} ${label.padEnd(26)} tris ${String(count).padStart(7)}  ` +
    `${width.toFixed(0)}x${height.toFixed(0)}mm  vol ${(topo.volume / 1000).toFixed(1)}cm3  ` +
    `wand ${wall} (${thin} dun)  contouren ${layers.maxLoops}  ${((Date.now() - t0) / 1000).toFixed(1)}s`
  );
  if (!ok) fails.forEach((f) => console.log(`     - ${f}`));
  return { ok, minWall: layers.minWall, maxThin: layers.maxThin };
}

const base = { ...DEFAULT_SHAPE };
const cases = [];
const add = (label, params, vaseMode = false) =>
  cases.push({ label, params: { ...params, vaseMode }, vaseMode });

for (const s of SILHOUETTES) add(`silhouet ${s.id}`, { ...base, ...applySilhouette(s, 120, 200) });
for (const p of SECTION_PRESETS) add(`doorsnede ${p.id}`, { ...base, section: p.make() });
for (const d of DECOR_PRESETS) add(`decor ${d.id}`, { ...base, ...d.values });

add('wand 0.8', { ...base, thickness: 0.8 });
add('wand 2.4', { ...base, thickness: 2.4 });
add('klein', { ...base, height: 60, profile: [{ t: 0, d: 20 }, { t: 1, d: 28 }] });
add('groot', {
  ...base,
  height: 250,
  profile: [{ t: 0, d: 120 }, { t: 0.4, d: 220 }, { t: 1, d: 160 }],
});
add('twist 720', { ...base, twistAngle: 720, waveCount: 20, waveAmplitude: 12 });
add('twist heen', { ...base, twistAngle: -720, twistMode: 'heen', twistWaves: 4, waveCount: 12, waveAmplitude: 14 });
add('golf max', { ...base, patternShape: 'ster', waveCount: 48, waveAmplitude: 25 });
add('facet max', { ...base, facetCount: 16, facetStrength: 100 });
add('ringen max', { ...base, ringCount: 40, ringAmount: 12 });
add('bobbels max', { ...base, bumpCols: 24, bumpRows: 30, bumpDepth: 40 });
add('deuken max', { ...base, bumpCols: 24, bumpRows: 30, bumpDepth: -40 });
add('rand max', { ...base, rimWaveCount: 24, rimWaveDepth: 20 });
for (const t of TEXTURES.filter((x) => x.id !== 'geen')) {
  add(`textuur ${t.id}`, { ...base, textureType: t.id, textureScale: 64, textureDepth: 10 });
}
// elke patroonvorm op zijn diepste stand: hier loopt de binnenwand het snelst
// in zichzelf als een profiel te scherpe flanken heeft
for (const s of PATTERN_SHAPES) {
  add(`patroon ${s.id}`, { ...base, patternShape: s.id, waveCount: 24, waveAmplitude: 25 });
}
add('organisch max', {
  ...base, organicAmount: 40, organicDetail: 10, organicFlow: 200, swayAmount: 40, swayTurns: 3, seed: 7,
});
const everything = {
  ...base,
  height: 250,
  thickness: 0.8,
  section: SECTION_PRESETS[7].make(),
  patternShape: 'kabel',
  waveCount: 24,
  waveAmplitude: 20,
  twistAngle: 540,
  facetCount: 8,
  facetStrength: 80,
  ringCount: 20,
  ringAmount: 10,
  bumpCols: 16,
  bumpRows: 20,
  bumpDepth: 25,
  textureType: 'ruit',
  textureScale: 48,
  textureDepth: 8,
  rimWaveCount: 16,
  rimWaveDepth: 15,
  organicAmount: 30,
  organicDetail: 8,
  organicFlow: 150,
  swayAmount: 25,
  swayTurns: 2,
  seed: 42,
};
add('alles tegelijk', everything);
add('alles zonder limiet', { ...everything, autoLimit: false, maxOverhang: 60 });

let seed = 12345;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let i = 0; i < 8; i++) add(`random ${i}`, randomVaseParams(rnd));

// vase mode: massief model, slicer maakt de wand -> per laag precies 1 contour
add('vase mode standaard', { ...base }, true);
add('vase mode ster', { ...base, section: SECTION_PRESETS[7].make() }, true);
add('vase mode bloem', { ...base, section: SECTION_PRESETS[8].make() }, true);
add('vase mode rand', { ...base, rimWaveCount: 24, rimWaveDepth: 20 }, true);
add('vase mode organisch', { ...base, organicAmount: 40, organicDetail: 10, organicFlow: 200, swayAmount: 40, swayTurns: 3, seed: 7 }, true);
add('vase mode alles', everything, true);
for (let i = 0; i < 4; i++) add(`vase mode random ${i}`, randomVaseParams(rnd), true);

const list = FILTER ? cases.filter((c) => c.label.includes(FILTER)) : cases;
let failed = 0;
let worstWall = Infinity;
let worstThin = 0;
for (const c of list) {
  const res = run(c.label, c.params, c.vaseMode);
  if (!res.ok) failed++;
  if (!c.vaseMode && Number.isFinite(res.minWall)) worstWall = Math.min(worstWall, res.minWall);
  if (!c.vaseMode) worstThin = Math.max(worstThin, res.maxThin);
}
console.log(
  `\n${list.length - failed}/${list.length} geslaagd · dunste plek ${worstWall.toFixed(2)}mm · ` +
  `hoogstens ${(worstThin * 100).toFixed(0)}% van een contour onder de nozzle (${NOZZLE}mm)`
);
process.exit(failed ? 1 : 0);
