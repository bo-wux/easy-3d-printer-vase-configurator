import React, { useMemo, useRef } from 'react';
import { buildSectionField } from '../lib/vaseShape';

const TAU = Math.PI * 2;
const SAMPLES = 240;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Doorsnede van bovenaf: sleep de punten naar buiten of naar binnen, dubbelklik
 * voor een punt erbij. Een punt kan rond of hoekig zijn; hoekige punten geven
 * rechte zijden, dus vier hoeken worden precies een vierkant.
 */
const SectionEditor = ({ section, selected, onSelect, onMove, onAdd }) => {
  const planeRef = useRef(null);
  const dragRef = useRef(null);
  const field = useMemo(() => buildSectionField(section), [section]);
  const points = field ? field.points : [];

  const toModel = (event) => {
    const ctm = planeRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = planeRef.current.ownerSVGElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    return {
      a: ((Math.atan2(local.y, local.x) / TAU) % 1 + 1) % 1,
      r: clamp(Math.hypot(local.x, local.y), 0.25, 1),
    };
  };

  const handleDown = (index) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = index;
    onSelect(index);
  };

  const handleMove = (index) => (event) => {
    if (dragRef.current !== index) return;
    const next = toModel(event);
    if (next) onMove(index, next);
  };

  const handleUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  let outline = 'M1,0';
  if (field) {
    const pts = [];
    for (let i = 0; i < SAMPLES; i++) {
      const angle = (i / SAMPLES) * TAU;
      const r = field.at(angle);
      pts.push(`${(Math.cos(angle) * r).toFixed(4)},${(Math.sin(angle) * r).toFixed(4)}`);
    }
    outline = `M${pts.join(' L')} Z`;
  }

  return (
    <svg
      className="section-editor"
      viewBox="-1.2 -1.2 2.4 2.4"
      preserveAspectRatio="xMidYMid meet"
      onDoubleClick={(event) => {
        const at = toModel(event);
        if (at) onAdd(at);
      }}
    >
      <g ref={planeRef}>
        <circle cx={0} cy={0} r={1} className="section-guide" vectorEffect="non-scaling-stroke" />
        {field
          ? <path d={outline} className="section-shape" vectorEffect="non-scaling-stroke" />
          : <circle cx={0} cy={0} r={1} className="section-shape" vectorEffect="non-scaling-stroke" />}
        {points.map((pt, index) => {
          const x = Math.cos(pt.a * TAU) * pt.r;
          const y = Math.sin(pt.a * TAU) * pt.r;
          const cls = `section-node${index === selected ? ' active' : ''}${pt.sharp ? ' sharp' : ''}`;
          return pt.sharp ? (
            <rect
              key={index}
              x={x - 0.07}
              y={y - 0.07}
              width={0.14}
              height={0.14}
              className={cls}
              vectorEffect="non-scaling-stroke"
              onPointerDown={handleDown(index)}
              onPointerMove={handleMove(index)}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
            />
          ) : (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={0.075}
              className={cls}
              vectorEffect="non-scaling-stroke"
              onPointerDown={handleDown(index)}
              onPointerMove={handleMove(index)}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
            />
          );
        })}
      </g>
    </svg>
  );
};

export default SectionEditor;
