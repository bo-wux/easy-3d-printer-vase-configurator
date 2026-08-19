import React, { useMemo } from 'react';
import { buildSectionField, profileRadiusAt } from '../lib/vaseShape';

const TAU = Math.PI * 2;

/** Klein bovenaanzicht van een doorsnede, voor de keuzeknoppen. */
export const SectionThumb = ({ points }) => {
  const d = useMemo(() => {
    const field = buildSectionField(points);
    if (!field) return null;
    const steps = 72;
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const r = field.at(a);
      pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
    }
    return `M${pts.join(' L')} Z`;
  }, [points]);

  return (
    <svg className="thumb" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true">
      {d
        ? <path d={d} vectorEffect="non-scaling-stroke" />
        : <circle cx={0} cy={0} r={1} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};

/** Klein zijaanzicht van een silhouet, op breedte genormaliseerd. */
export const ProfileThumb = ({ profile }) => {
  const d = useMemo(() => {
    const steps = 40;
    const half = Math.max(...profile.map((p) => p.d), 1) / 2;
    const right = [];
    const left = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (profileRadiusAt(profile, t) / half) * 0.5;
      const y = 1 - t;
      right.push(`${x.toFixed(3)},${y.toFixed(3)}`);
      left.unshift(`${(-x).toFixed(3)},${y.toFixed(3)}`);
    }
    return `M${right.join(' L')} L${left.join(' L')} Z`;
  }, [profile]);

  return (
    <svg className="thumb" viewBox="-0.62 -0.06 1.24 1.12" aria-hidden="true">
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};
