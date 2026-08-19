import { buildVaseMesh } from '../src/lib/vaseMesh.js';
import { DEFAULT_SHAPE, randomVaseParams } from '../src/lib/vaseShape.js';

const check = (label, params) => {
  const { positions, indices } = buildVaseMesh(params);
  const key = (i) => `${Math.round(positions[i * 3] * 1000)},${Math.round(positions[i * 3 + 1] * 1000)},${Math.round(positions[i * 3 + 2] * 1000)}`;
  const dir = new Map();
  let volume = 0;
  let bottomDown = 0;
  let bottomUp = 0;
  let degenerate = 0;

  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    const ka = key(a), kb = key(b), kc = key(c);
    if (ka === kb || kb === kc || ka === kc) degenerate++;
    for (const [p, q] of [[ka, kb], [kb, kc], [kc, ka]]) {
      const k = p + '>' + q;
      dir.set(k, (dir.get(k) || 0) + 1);
    }
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    if (ay < 1e-3 && by < 1e-3 && cy < 1e-3) {
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny < 0) bottomDown++; else bottomUp++;
    }
  }

  let unmatched = 0;
  let dupes = 0;
  for (const [k, count] of dir) {
    if (count > 1) dupes++;
    const [p, q] = k.split('>');
    if ((dir.get(q + '>' + p) || 0) !== count) unmatched++;
  }

  console.log(label.padEnd(14), {
    tris: indices.length / 3,
    volumeCM3: +(volume / 1000).toFixed(1),
    unmatched,
    dupes,
    degenerate,
    bottomDown,
    bottomUp,
  });
};

check('default', { ...DEFAULT_SHAPE });
check('bobbels', { ...DEFAULT_SHAPE, bumpCols: 12, bumpRows: 8, bumpDepth: 12 });
check('vase 0.8', { ...DEFAULT_SHAPE, thickness: 0.8, waveCount: 24, waveAmplitude: 8 });
check('twist+sway', { ...DEFAULT_SHAPE, twistAngle: 360, swayAmount: 15, organicAmount: 20 });
check('rimwave', { ...DEFAULT_SHAPE, rimWaveCount: 8, rimWaveDepth: 12 });
for (let i = 0; i < 5; i++) check('random ' + i, randomVaseParams());
