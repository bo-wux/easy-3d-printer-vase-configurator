import React, { useRef } from 'react';
import { PRINTER_LIMITS, profileRadiusAt, profileHandles, MIN_NODE_GAP } from '../lib/vaseShape';

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

  /** Muispositie in modelruimte: x = straal in mm, y = hoogte in mm. */
  const toLocal = (event) => {
    const ctm = planeRef.current?.getScreenCTM();
    if (!ctm) return null;
    const point = planeRef.current.ownerSVGElement.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(ctm.inverse());
  };

  const toModel = (event) => {
    const local = toLocal(event);
    if (!local) return null;
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

  /**
   * Handgreep verslepen, als de pen-tool in een tekenprogramma. `dt` is de
   * lengte langs de hoogte (verder weg = flauwere bocht), `dd` de uitwijking
   * in diameter (bepaalt de richting waarin de curve het punt verlaat).
   * De 'in'-greep wijst naar beneden, de 'out'-greep naar boven; dt blijft
   * daarom altijd positief.
   */
  const placeHandle = (index, side, event) => {
    const local = toLocal(event);
    if (!local) return;
    const node = profile[index];
    const sign = side === 'out' ? 1 : -1;
    const dt = clamp(sign * (local.y / height - node.t), 0, 1);
    const dd = clamp(sign * (Math.abs(local.x) * 2 - node.d), -PRINTER_LIMITS.maxDiameter, PRINTER_LIMITS.maxDiameter);
    onMove(index, { [side === 'out' ? 'hOut' : 'hIn']: { dt, dd } });
  };

  const handleDown = (index) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = index;
    onSelect(index);
    planeRef.current?.ownerSVGElement?.focus();
  };

  const gripDown = (index, side) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = `${index}:${side}`;
    onSelect(index);
  };

  const gripMove = (index, side) => (event) => {
    if (dragRef.current !== `${index}:${side}`) return;
    placeHandle(index, side, event);
  };

  // dubbelklik = terug naar de standaardronding van dit punt
  const gripReset = (index, side) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMove(index, { [side === 'out' ? 'hOut' : 'hIn']: null });
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

  // Handgrepen van het geselecteerde punt, in modelruimte (x = straal, y = mm)
  const grips = [];
  {
    const node = profile[selected];
    if (node) {
      const h = profileHandles(profile, selected);
      const nx = node.d / 2;
      const ny = node.t * height;
      if (h.out) {
        grips.push({
          index: selected, side: 'out', nx, ny, custom: h.out.custom,
          x: (node.d + h.out.dd) / 2, y: (node.t + h.out.dt) * height,
        });
      }
      if (h.in) {
        grips.push({
          index: selected, side: 'in', nx, ny, custom: h.in.custom,
          x: (node.d - h.in.dd) / 2, y: (node.t - h.in.dt) * height,
        });
      }
    }
  }

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

        {/* Handgrepen van het geselecteerde punt: verder van het punt af = een
            flauwere, langer doorlopende bocht; dichterbij = een scherpere knik. */}
        {grips.map((g) => (
          <g key={g.side}>
            <line
              x1={g.nx}
              y1={g.ny}
              x2={g.x}
              y2={g.y}
              className="profile-grip-arm"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={g.x}
              cy={g.y}
              r={pad * 0.4}
              className={`profile-grip${g.custom ? ' custom' : ''}`}
              vectorEffect="non-scaling-stroke"
              onPointerDown={gripDown(g.index, g.side)}
              onPointerMove={gripMove(g.index, g.side)}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={gripReset(g.index, g.side)}
            >
              <title>Sleep om de ronding te sturen · dubbelklik voor standaard</title>
            </circle>
          </g>
        ))}

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
