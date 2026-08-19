import { createVaseShape } from './vaseShape.js';

const TAU = Math.PI * 2;

/**
 * Watertight vaas-mesh als platte arrays (positions/uvs/indices).
 *
 * Normaal: buitenwand van de plaat tot de bovenrand, binnenwand die pas op
 * bodemdikte begint (massieve bodem, geen vlakken die door elkaar lopen).
 * solid = true: één dicht lichaam zonder binnenwand, voor spiral/vase mode in
 * de slicer — die maakt de wand dan zelf.
 * Alle driehoeken wijzen naar buiten; dat is wat een slicer nodig heeft.
 */
export function buildVaseMesh(params, { solid = false } = {}) {
  const shape = createVaseShape(params);
  const wall = shape.wall;
  const rs = shape.radialSegments;
  const hs = shape.heightSegments;
  const ring = rs + 1;
  const floorT = Math.min(0.4, wall / shape.height);

  const positions = [];
  const uvs = [];
  const indices = [];

  const addGrid = (offset, tStart) => {
    for (let i = 0; i <= hs; i++) {
      const t = tStart + (1 - tStart) * (i / hs);
      for (let j = 0; j <= rs; j++) {
        const angle = (j / rs) * TAU;
        const p = shape.pointAt(angle, t, offset);
        positions.push(p.x, p.y, p.z);
        uvs.push(j / rs, t);
      }
    }
  };

  const O = (i, j) => i * ring + j;
  let innerStart = 0;
  const I = (i, j) => innerStart + i * ring + j;

  const addWall = (at, flip) => {
    for (let i = 0; i < hs; i++) {
      for (let j = 0; j < rs; j++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i, j + 1);
        const d = at(i + 1, j + 1);
        if (flip) indices.push(a, c, b, c, d, b);
        else indices.push(a, b, c, c, b, d);
      }
    }
  };

  // Waaier vanaf één middelpunt; up = normaal omhoog.
  const addFan = (y, center, at, up) => {
    const c = positions.length / 3;
    positions.push(center.x, y, center.z);
    uvs.push(0.5, up ? 1 : 0);
    for (let j = 0; j < rs; j++) {
      if (up) indices.push(c, at(j + 1), at(j));
      else indices.push(c, at(j), at(j + 1));
    }
  };

  addGrid(0, 0);
  addWall(O, false);

  if (solid) {
    addFan(0, shape.centerAt(0), (j) => O(0, j), false);
    // dicht deksel op de gemiddelde randhoogte, zodat een golvende rand heel blijft
    let sum = 0;
    for (let j = 0; j < rs; j++) sum += positions[O(hs, j) * 3 + 1];
    addFan(sum / rs, shape.centerAt(1), (j) => O(hs, j), true);
    return { positions, uvs, indices, shape };
  }

  innerStart = positions.length / 3;
  addGrid(-wall, floorT);
  addWall(I, true);

  // bovenrand verbindt buiten- en binnenwand
  for (let j = 0; j < rs; j++) {
    indices.push(O(hs, j), I(hs, j), O(hs, j + 1));
    indices.push(O(hs, j + 1), I(hs, j), I(hs, j + 1));
  }

  addFan(0, shape.centerAt(0), (j) => O(0, j), false);
  addFan(floorT * shape.height, shape.centerAt(floorT), (j) => I(0, j), true);

  return { positions, uvs, indices, shape };
}
