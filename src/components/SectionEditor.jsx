import React, { useMemo, useRef } from 'react';
import { buildSectionField, sectorSpan } from '../lib/vaseShape';

const TAU = Math.PI * 2;
const SAMPLES = 240;
const RINGS = [0.25, 0.5, 0.75];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (v) => ((v % 1) + 1) % 1;

/**
 * Doorsnede van bovenaf. Je bewerkt altijd één sector; bij symmetrie worden de
 * kopieën als lichte stippen getoond. Sleep = verplaatsen, Shift = vastklikken
 * op het raster, rechtermuis of dubbelklik op een punt = rond/hoekig,
 * pijltjes = fijn bijstellen.
 */
const SectionEditor = ({
  section, nodes, sym = 1, mirror = false, selected, pen = false,
  onSelect, onMove, onAdd, onToggle, onRemove,
}) => {
  const planeRef = useRef(null);
  const dragRef = useRef(null);
  const field = useMemo(() => buildSectionField(section), [section]);
  const span = sectorSpan(sym, mirror);
  const sectored = sym > 1 || mirror;
  const spokes = mirror ? sym * 2 : sym;

  const ghosts = useMemo(() => (
    sectored && Array.isArray(section)
      ? section.filter((pt) => !nodes.some((m) => Math.abs(wrap(pt.a - m.a + 0.5) - 0.5) < 1e-6))
      : []
  ), [section, nodes, sectored]);

  const toModel = (event) => {
    const ctm = planeRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = planeRef.current.ownerSVGElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    let a = wrap(Math.atan2(local.y, local.x) / TAU);
    let r = clamp(Math.hypot(local.x, local.y), 0.25, 1);
    if (event.shiftKey) {
      a = Math.round(a * 48) / 48;
      r = Math.round(r * 20) / 20;
    }
    return { a, r };
  };

  const handleDown = (index) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = index;
    onSelect(index);
    planeRef.current?.ownerSVGElement?.focus();
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

  const nudge = (event) => {
    const node = nodes[selected];
    if (!node) return;
    const da = (event.shiftKey ? 5 : 1) / 360;
    const dr = event.shiftKey ? 0.05 : 0.01;
    if (event.key === 'ArrowLeft') onMove(selected, { a: node.a - da, r: node.r });
    else if (event.key === 'ArrowRight') onMove(selected, { a: node.a + da, r: node.r });
    else if (event.key === 'ArrowUp') onMove(selected, { a: node.a, r: clamp(node.r + dr, 0.25, 1) });
    else if (event.key === 'ArrowDown') onMove(selected, { a: node.a, r: clamp(node.r - dr, 0.25, 1) });
    else if (event.key === 'Delete' || event.key === 'Backspace') onRemove?.();
    else if (event.key === ' ' || event.key === 'Enter') onToggle?.(selected);
    else return;
    event.preventDefault();
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

  const wedge = sectored
    ? `M0,0 L1.16,0 A1.16,1.16 0 ${span > 0.5 ? 1 : 0},1 ${(Math.cos(span * TAU) * 1.16).toFixed(3)},${(Math.sin(span * TAU) * 1.16).toFixed(3)} Z`
    : null;

  return (
    <svg
      className={`section-editor${pen ? ' pen' : ''}`}
      viewBox="-1.2 -1.2 2.4 2.4"
      preserveAspectRatio="xMidYMid meet"
      tabIndex={0}
      onKeyDown={nudge}
      onClick={(event) => {
        if (!pen) return;
        const at = toModel(event);
        if (at) onAdd(at);
      }}
      onDoubleClick={(event) => {
        if (pen) return;
        const at = toModel(event);
        if (at) onAdd(at);
      }}
    >
      <g ref={planeRef}>
        {wedge && <path d={wedge} className="section-sector" />}
        {RINGS.map((r) => (
          <circle key={r} cx={0} cy={0} r={r} className="section-ring" vectorEffect="non-scaling-stroke" />
        ))}
        {sectored && Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * TAU;
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={Math.cos(a) * 1.16}
              y2={Math.sin(a) * 1.16}
              className="section-spoke"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <circle cx={0} cy={0} r={1} className="section-guide" vectorEffect="non-scaling-stroke" />
        {field
          ? <path d={outline} className="section-shape" vectorEffect="non-scaling-stroke" />
          : <circle cx={0} cy={0} r={1} className="section-shape" vectorEffect="non-scaling-stroke" />}
        {ghosts.map((pt, i) => (
          <circle
            key={`g${i}`}
            cx={Math.cos(pt.a * TAU) * pt.r}
            cy={Math.sin(pt.a * TAU) * pt.r}
            r={0.035}
            className="section-ghost"
          />
        ))}
        {nodes.map((pt, index) => {
          const x = Math.cos(pt.a * TAU) * pt.r;
          const y = Math.sin(pt.a * TAU) * pt.r;
          const cls = `section-node${index === selected ? ' active' : ''}${pt.sharp ? ' sharp' : ''}`;
          const handlers = {
            onPointerDown: handleDown(index),
            onPointerMove: handleMove(index),
            onPointerUp: handleUp,
            onPointerCancel: handleUp,
            onClick: (event) => event.stopPropagation(),
            onDoubleClick: (event) => { event.stopPropagation(); onToggle?.(index); },
            onContextMenu: (event) => { event.preventDefault(); onToggle?.(index); },
          };
          return pt.sharp ? (
            <rect
              key={index}
              x={x - 0.07}
              y={y - 0.07}
              width={0.14}
              height={0.14}
              className={cls}
              vectorEffect="non-scaling-stroke"
              {...handlers}
            />
          ) : (
            <circle key={index} cx={x} cy={y} r={0.075} className={cls} vectorEffect="non-scaling-stroke" {...handlers} />
          );
        })}
      </g>
    </svg>
  );
};

export default SectionEditor;
