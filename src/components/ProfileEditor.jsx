import React, { useRef } from 'react';
import { PRINTER_LIMITS, profileRadiusAt, MIN_NODE_GAP } from '../lib/vaseShape';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SAMPLES = 80;
const GUIDES = [0.25, 0.5, 0.75];

/**
 * Silhouet-editor: sleep de controlepunten, dubbelklik voor een punt erbij.
 * Tekent de vaas als doorsnede in millimeters; het SVG-assenstelsel staat op
 * z'n kop gezet zodat y in de code gewoon "hoogte boven de plaat" is.
 * Shift = vastklikken op het raster, pijltjes = fijn bijstellen, Delete = wissen.
 */
const ProfileEditor = ({ profile, height, selected, pen = false, onSelect, onMove, onAdd, onRemove }) => {
  const planeRef = useRef(null);
  const dragRef = useRef(null);

  const maxD = Math.max(...profile.map((p) => p.d), 40);
  const halfWidth = (maxD / 2) * 1.18;
  const pad = Math.max(6, maxD * 0.08);

  const toModel = (event) => {
    const ctm = planeRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = planeRef.current.ownerSVGElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(ctm.inverse());
    let d = clamp(Math.abs(local.x) * 2, PRINTER_LIMITS.minDiameter, PRINTER_LIMITS.maxDiameter);
    let t = clamp(local.y / height, 0, 1);
    if (event.shiftKey) {
      d = Math.round(d / 5) * 5;
      t = Math.round(t * 20) / 20;
    }
    return { d, t };
  };

  // eindpunten blijven op de bodem/opening; tussenpunten houden afstand
  const place = (index, next) => {
    const isEnd = index === 0 || index === profile.length - 1;
    const t = isEnd
      ? profile[index].t
      : clamp(next.t, profile[index - 1].t + MIN_NODE_GAP, profile[index + 1].t - MIN_NODE_GAP);
    onMove(index, { t, d: Math.round(next.d) });
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
    if (next) place(index, next);
  };

  const handleUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudge = (event) => {
    const node = profile[selected];
    if (!node) return;
    const dd = event.shiftKey ? 5 : 1;
    const dt = (event.shiftKey ? 5 : 1) / 100;
    if (event.key === 'ArrowLeft') place(selected, { t: node.t, d: node.d - dd });
    else if (event.key === 'ArrowRight') place(selected, { t: node.t, d: node.d + dd });
    else if (event.key === 'ArrowUp') place(selected, { t: node.t + dt, d: node.d });
    else if (event.key === 'ArrowDown') place(selected, { t: node.t - dt, d: node.d });
    else if (event.key === 'Delete' || event.key === 'Backspace') onRemove?.();
    else return;
    event.preventDefault();
  };

  const silhouette = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    silhouette.push({ x: profileRadiusAt(profile, t), y: t * height });
  }
  const right = silhouette.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L');
  const left = [...silhouette].reverse().map((p) => `${(-p.x).toFixed(2)},${p.y.toFixed(2)}`).join(' L');
  const outline = `M${right} L${left} Z`;

  return (
    <svg
      className={`profile-editor${pen ? ' pen' : ''}`}
      viewBox={`${-halfWidth - pad} 0 ${(halfWidth + pad) * 2} ${height + pad * 2}`}
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
      <g ref={planeRef} transform={`translate(0, ${height + pad}) scale(1, -1)`}>
        {GUIDES.map((g) => (
          <line
            key={g}
            x1={-halfWidth}
            y1={g * height}
            x2={halfWidth}
            y2={g * height}
            className="profile-grid"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={-halfWidth} y1={0} x2={halfWidth} y2={0} className="profile-bed" vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={0} x2={0} y2={height} className="profile-axis" vectorEffect="non-scaling-stroke" />
        <path d={outline} className="profile-shape" vectorEffect="non-scaling-stroke" />

        {profile.map((point, index) => (
          <circle
            key={index}
            cx={point.d / 2}
            cy={point.t * height}
            r={pad * 0.62}
            className={`profile-node${index === selected ? ' active' : ''}`}
            vectorEffect="non-scaling-stroke"
            onPointerDown={handleDown(index)}
            onPointerMove={handleMove(index)}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
        ))}
      </g>
    </svg>
  );
};

export default ProfileEditor;
