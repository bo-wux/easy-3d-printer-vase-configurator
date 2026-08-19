import { createVaseShape } from './vaseShape.js';

const TAU = Math.PI * 2;

/**
 * Watertight vaas-mesh als platte arrays (positions/uvs/indices).
 *
 * De buitenwand loopt van de plaat tot de bovenrand; de binnenwand begint pas
 * op bodemdikte, zodat de bodem massief is en geen twee vlakken door elkaar
 * lopen. Alle driehoeken wijzen naar buiten: dat is wat een slicer nodig heeft.
 */
export function buildVaseMesh(params) {
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

  addGrid(0, 0);
  const innerStart = ring * (hs + 1);
  addGrid(-wall, floorT);

  const O = (i, j) => i * ring + j;
  const I = (i, j) => innerStart + i * ring + j;

  for (let i = 0; i < hs; i++) {
    for (let j = 0; j < rs; j++) {
      // buitenwand
      indices.push(O(i, j), O(i + 1, j), O(i, j + 1));
      indices.push(O(i, j + 1), O(i + 1, j), O(i + 1, j + 1));
      // binnenwand (omgekeerde winding)
      indices.push(I(i, j), I(i, j + 1), I(i + 1, j));
      indices.push(I(i, j + 1), I(i + 1, j + 1), I(i + 1, j));
    }
  }

  // bovenrand verbindt buiten- en binnenwand
  for (let j = 0; j < rs; j++) {
    indices.push(O(hs, j), I(hs, j), O(hs, j + 1));
    indices.push(O(hs, j + 1), I(hs, j), I(hs, j + 1));
  }

  // Waaier vanaf één middelpunt; up = normaal omhoog.
  const addFan = (y, center, at, up) => {
    const c = positions.length / 3;
    positions.push(center.x, y, center.z);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < rs; j++) {
      if (up) indices.push(c, at(j + 1), at(j));
      else indices.push(c, at(j), at(j + 1));
    }
  };

  addFan(0, shape.centerAt(0), (j) => O(0, j), false);
  addFan(floorT * shape.height, shape.centerAt(floorT), (j) => I(0, j), true);

  return { positions, uvs, indices, shape };
}
