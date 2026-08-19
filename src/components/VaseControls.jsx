import React, { useMemo } from 'react';
import {
  createVaseShape,
  applySilhouette,
  randomVaseParams,
  randomSeed,
  SILHOUETTES,
  DECOR_PRESETS,
  PATTERN_SHAPES,
  PRINTER_LIMITS,
} from '../lib/vaseShape';

const Slider = ({ id, label, min, max, step, unit = '', value, hint, onChange, full = false }) => (
  <div className={`control-group${full ? ' full' : ''}`}>
    <label htmlFor={id}>
      {label}
      <span className="control-value">{value}{unit}</span>
    </label>
    <input
      type="range"
      id={id}
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(id, e.target.value)}
    />
    {hint && <span className="control-hint">{hint}</span>}
  </div>
);

const Toggle = ({ label, checked, onChange }) => (
  <div className="control-group">
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  </div>
);

const VaseControls = ({ params, onParamChange, onParamsChange }) => {
  const shapeInfo = useMemo(() => createVaseShape(params), [params]);

  const overhang = Math.round(shapeInfo.maxOverhangDeg);
  const overhangLimit = params.maxOverhang;
  const overhangClass = overhang <= overhangLimit ? 'ok' : overhang <= overhangLimit + 10 ? 'warn' : 'bad';

  const maxDiameter = Math.max(
    params.diameterBottom,
    params.diameterTop,
    params.useLow !== false ? params.diameterLow : 0,
    params.useHigh !== false ? params.diameterHigh : 0
  );
  const bellyDiameter = maxDiameter;
  const fitsBed = maxDiameter <= PRINTER_LIMITS.maxDiameter && params.height <= PRINTER_LIMITS.maxHeight;
  const layers = Math.ceil(params.height / params.layerHeight);

  const matches = (values) => Object.entries(values).every(([k, v]) => params[k] === v);

  return (
    <div className="controls">
      <div className="controls-grid">
        <div className="full action-row">
          <button type="button" className="action-button primary" onClick={() => onParamsChange(randomVaseParams())}>
            🎲 Verras me
          </button>
          <button type="button" className="action-button" onClick={() => onParamsChange({ seed: randomSeed() })}>
            🌱 Andere seed
          </button>
        </div>

        <h3 className="section-title">🏺 Silhouet</h3>
        <div className="full chip-row">
          {SILHOUETTES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              onClick={() => onParamsChange(applySilhouette(s, bellyDiameter, params.height))}
            >
              {s.label}
            </button>
          ))}
        </div>

        <Slider id="height" label="Hoogte" min={60} max={PRINTER_LIMITS.maxHeight} step={5} unit="mm"
          value={params.height} onChange={onParamChange} />
        <Slider id="thickness" label="Wanddikte" min={0.4} max={2.4} step={0.1} unit="mm"
          value={params.thickness} onChange={onParamChange} />

        <Slider id="diameterBottom" label="Ø Bodem" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
          value={params.diameterBottom} onChange={onParamChange} />
        <Slider id="diameterTop" label="Ø Opening" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
          value={params.diameterTop} onChange={onParamChange} />

        <Toggle label="Buik gebruiken" checked={params.useLow !== false}
          onChange={(v) => onParamChange('useLow', v)} />
        <Toggle label="Schouder gebruiken" checked={params.useHigh !== false}
          onChange={(v) => onParamChange('useHigh', v)} />

        {params.useLow !== false && (
          <>
            <Slider id="diameterLow" label="Ø Buik" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
              value={params.diameterLow} onChange={onParamChange} />
            <Slider id="positionLow" label="↕ Pos buik" min={5} max={95} step={1} unit="%"
              value={params.positionLow} onChange={onParamChange} />
          </>
        )}
        {params.useHigh !== false && (
          <>
            <Slider id="diameterHigh" label="Ø Schouder" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
              value={params.diameterHigh} onChange={onParamChange} />
            <Slider id="positionHigh" label="↕ Pos schouder" min={5} max={95} step={1} unit="%"
              value={params.positionHigh} onChange={onParamChange} />
          </>
        )}

        <h3 className="section-title">🎨 Stijl</h3>
        <div className="full chip-row">
          {DECOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`chip${matches(preset.values) ? ' active' : ''}`}
              onClick={() => onParamsChange(preset.values)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <h3 className="section-title">≣ Patroon (symmetrisch)</h3>
        <div className="full chip-row">
          {PATTERN_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip${params.patternShape === s.id ? ' active' : ''}`}
              onClick={() => onParamChange('patternShape', s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Slider id="waveCount" label="Herhalingen" min={0} max={48} step={1}
          value={params.waveCount} onChange={onParamChange} />
        <Slider id="waveAmplitude" label="Diepte" min={0} max={25} step={1} unit="%"
          value={params.waveAmplitude} onChange={onParamChange} />
        <Slider id="twistAngle" label="Twist" min={-720} max={720} step={15} unit="°"
          value={params.twistAngle} onChange={onParamChange} hint="draait het hele patroon over de hoogte" />
        <Slider id="facetCount" label="Facetten" min={0} max={16} step={1}
          value={params.facetCount} onChange={onParamChange} hint="0 = rond, 3+ = veelhoek" />
        <Slider id="facetStrength" label="Facet sterkte" min={0} max={100} step={5} unit="%"
          value={params.facetStrength} onChange={onParamChange} />
        <Slider id="ringCount" label="Ringen" min={0} max={40} step={1}
          value={params.ringCount} onChange={onParamChange} hint="horizontale banden" />
        <Slider id="ringAmount" label="Ring diepte" min={0} max={12} step={1} unit="%"
          value={params.ringAmount} onChange={onParamChange} />

        <h3 className="section-title">🌿 Organisch (asymmetrisch)</h3>
        <Slider id="organicAmount" label="Vervorming" min={0} max={40} step={1} unit="%"
          value={params.organicAmount} onChange={onParamChange} hint="afwijking van rond" />
        <Slider id="organicDetail" label="Detail" min={1} max={10} step={1}
          value={params.organicDetail} onChange={onParamChange} hint="grote bulten ↔ kleine" />
        <Slider id="organicFlow" label="Verloop" min={0} max={200} step={5} unit="%"
          value={params.organicFlow} onChange={onParamChange} hint="0 = kolom, hoog = kronkelt" />
        <Slider id="seed" label="Seed" min={1} max={999} step={1}
          value={params.seed} onChange={onParamChange} hint="ander getal = andere vorm" />
        <Slider id="swayAmount" label="Scheefheid" min={0} max={40} step={1} unit="%"
          value={params.swayAmount} onChange={onParamChange} hint="hartlijn wijkt af" />
        <Slider id="swayTurns" label="Scheef draai" min={0} max={3} step={0.25} unit="×"
          value={params.swayTurns} onChange={onParamChange} hint="0 = leunt recht, >0 = krult" />

        <h3 className="section-title">🖨️ Printbaarheid</h3>
        <Toggle label="Automatisch printbaar houden" checked={params.autoLimit !== false}
          onChange={(v) => onParamChange('autoLimit', v)} />
        <Slider id="maxOverhang" label="Max. overhang" min={15} max={60} step={1} unit="°"
          value={params.maxOverhang} onChange={onParamChange} />

        <div className="full info-box">
          <p>
            Steilste wand: <strong className={overhangClass}>{overhang}°</strong> t.o.v. verticaal
            {' · '}Ø max {maxDiameter}mm × {params.height}mm
          </p>
          {shapeInfo.limited && (
            <p className="muted">
              Decoratie automatisch teruggeschaald naar {Math.round(shapeInfo.detailScale * 100)}% om printbaar te blijven.
            </p>
          )}
          {shapeInfo.baseOverhangDeg > overhangLimit && (
            <p className="bad">⚠️ Het silhouet zelf is al te steil ({Math.round(shapeInfo.baseOverhangDeg)}°) — pas de diameters aan.</p>
          )}
          {!fitsBed && (
            <p className="bad">⚠️ Past niet op de P1S ({PRINTER_LIMITS.maxDiameter}mm Ø × {PRINTER_LIMITS.maxHeight}mm).</p>
          )}
          <p className="muted">
            ≈ {layers} lagen van {params.layerHeight}mm · wanddikte {params.thickness}mm
            {params.thickness > 1.3 ? ' (vase mode print 1 wand: 0.8–1.2mm werkt het best)' : ''}
          </p>
        </div>

        <h3 className="section-title">👁️ Weergave</h3>
        <Toggle label="Toon grid/plaat" checked={params.showGrid !== false}
          onChange={(v) => onParamChange('showGrid', v)} />
        <Toggle label="Toon printlijnen" checked={params.showPrintLines || false}
          onChange={(v) => onParamChange('showPrintLines', v)} />
        <Slider id="materialBrightness" label="Materiaal tint" min={0.15} max={0.9} step={0.05}
          value={params.materialBrightness} onChange={onParamChange} />

        {params.showPrintLines && (
          <>
            <Toggle label="Vase mode (spiraal)" checked={params.spiralMode || false}
              onChange={(v) => onParamChange('spiralMode', v)} />
            <Slider id="layerHeight" label="Laaghoogte" min={0.08} max={0.32} step={0.02} unit="mm"
              value={params.layerHeight} onChange={onParamChange} />
            <Slider id="lineWidth" label="Lijnbreedte" min={0.4} max={0.8} step={0.02} unit="mm"
              value={params.lineWidth} onChange={onParamChange} hint="0.4mm nozzle" />
            <div className="full info-box">
              <p className="muted">
                Preview toont de laagstructuur proportioneel; bij {layers} lagen worden er minder ringen getekend
                zodat het vloeiend blijft.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VaseControls;
