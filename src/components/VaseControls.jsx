import React, { useMemo, useState } from 'react';
import {
  createVaseShape,
  applySilhouette,
  randomVaseParams,
  randomSeed,
  SILHOUETTES,
  DECOR_PRESETS,
  PATTERN_SHAPES,
  TEXTURES,
  PRINTER_LIMITS,
} from '../lib/vaseShape';
import { FILAMENTS, FINISHES } from '../lib/filaments';

const TABS = [
  { id: 'vorm', label: '🏺 Vorm' },
  { id: 'patroon', label: '≣ Patroon' },
  { id: 'textuur', label: '⣿ Textuur' },
  { id: 'organisch', label: '🌿 Organisch' },
  { id: 'print', label: '🖨️ Print' },
];

const Slider = ({ id, label, min, max, step, unit = '', value, hint, onChange, full = false }) => (
  <div className={`control${full ? ' full' : ''}`}>
    <label htmlFor={id}>
      <span className="control-label">{label}</span>
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

const Toggle = ({ label, checked, onChange, full = false }) => (
  <label className={`toggle${full ? ' full' : ''}`}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="toggle-track"><span className="toggle-knob" /></span>
    <span>{label}</span>
  </label>
);

const Chips = ({ options, value, onSelect, compare }) => (
  <div className="full chip-row">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        className={`chip${(compare ? compare(o) : value === o.id) ? ' active' : ''}`}
        onClick={() => onSelect(o)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const VaseControls = ({ params, onParamChange, onParamsChange }) => {
  const [tab, setTab] = useState('vorm');
  const shape = useMemo(() => createVaseShape(params), [params]);

  const overhang = Math.round(shape.maxOverhangDeg);
  const overhangLimit = params.maxOverhang;
  const overhangClass = overhang <= overhangLimit ? 'ok' : overhang <= overhangLimit + 10 ? 'warn' : 'bad';

  const maxDiameter = Math.max(
    params.diameterBottom,
    params.diameterTop,
    params.useLow !== false ? params.diameterLow : 0,
    params.useHigh !== false ? params.diameterHigh : 0
  );
  const fitsBed = maxDiameter <= PRINTER_LIMITS.maxDiameter && params.height <= PRINTER_LIMITS.maxHeight;
  const layers = Math.ceil(params.height / params.layerHeight);
  const matches = (values) => Object.entries(values).every(([k, v]) => params[k] === v);
  // dieper dan dit loopt het bobbelraster in zichzelf, dus houdt de slider ook op
  const bumpMax = Math.max(1, shape.bumpMaxPercent);
  const bumpDepth = Math.min(bumpMax, Math.max(-bumpMax, params.bumpDepth));

  return (
    <div className="controls">
      <div className="action-row">
        <button type="button" className="action-button primary" onClick={() => onParamsChange(randomVaseParams())}>
          🎲 Verras me
        </button>
        <button type="button" className="action-button" onClick={() => onParamsChange({ seed: randomSeed() })}>
          🌱 Andere seed
        </button>
      </div>

      <div className="tab-row">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-body">
        <div className="grid">
          {tab === 'vorm' && (
            <>
              <h3 className="section-title full">Silhouet</h3>
              <Chips
                options={SILHOUETTES}
                onSelect={(s) => onParamsChange(applySilhouette(s, maxDiameter, params.height))}
                compare={() => false}
              />
              <Slider id="height" label="Hoogte" min={60} max={PRINTER_LIMITS.maxHeight} step={1} unit="mm"
                value={params.height} onChange={onParamChange} />
              <Slider id="thickness" label="Wanddikte" min={0.4} max={2.4} step={0.2} unit="mm"
                value={params.thickness} onChange={onParamChange}
                hint="0.8 = vase mode · 1.2 = 3 lijnen" />
              <Slider id="diameterBottom" label="Ø Bodem" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
                value={params.diameterBottom} onChange={onParamChange} />
              <Slider id="diameterTop" label="Ø Opening" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
                value={params.diameterTop} onChange={onParamChange} />

              <h3 className="section-title full">Controlepunten</h3>
              <Toggle label="Buik" checked={params.useLow !== false} onChange={(v) => onParamChange('useLow', v)} />
              <Toggle label="Schouder" checked={params.useHigh !== false} onChange={(v) => onParamChange('useHigh', v)} />
              {params.useLow !== false && (
                <>
                  <Slider id="diameterLow" label="Ø Buik" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
                    value={params.diameterLow} onChange={onParamChange} />
                  <Slider id="positionLow" label="Hoogte buik" min={5} max={95} step={1} unit="%"
                    value={params.positionLow} onChange={onParamChange} />
                </>
              )}
              {params.useHigh !== false && (
                <>
                  <Slider id="diameterHigh" label="Ø Schouder" min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
                    value={params.diameterHigh} onChange={onParamChange} />
                  <Slider id="positionHigh" label="Hoogte schouder" min={5} max={95} step={1} unit="%"
                    value={params.positionHigh} onChange={onParamChange} />
                </>
              )}
            </>
          )}

          {tab === 'patroon' && (
            <>
              <h3 className="section-title full">Stijl</h3>
              <Chips
                options={DECOR_PRESETS}
                onSelect={(preset) => onParamsChange(preset.values)}
                compare={(preset) => matches(preset.values)}
              />

              <h3 className="section-title full">Profiel</h3>
              <Chips
                options={PATTERN_SHAPES}
                value={params.patternShape}
                onSelect={(s) => onParamChange('patternShape', s.id)}
              />
              <Slider id="waveCount" label="Herhalingen" min={0} max={48} step={1}
                value={params.waveCount} onChange={onParamChange} />
              <Slider id="waveAmplitude" label="Diepte" min={0} max={25} step={1} unit="%"
                value={params.waveAmplitude} onChange={onParamChange} />

              <h3 className="section-title full">Twist</h3>
              <Chips
                options={[{ id: 'lineair', label: '↗ Doorlopend' }, { id: 'heen', label: '↺ Heen en terug' }]}
                value={params.twistMode || 'lineair'}
                onSelect={(m) => onParamChange('twistMode', m.id)}
              />
              <Slider id="twistAngle" label="Draaihoek" min={-720} max={720} step={15} unit="°"
                value={params.twistAngle} onChange={onParamChange} />
              {params.twistMode === 'heen' && (
                <Slider id="twistWaves" label="Keerpunten" min={1} max={4} step={1} unit="×"
                  value={params.twistWaves ?? 1} onChange={onParamChange}
                  hint="draait op en weer terug" />
              )}

              <h3 className="section-title full">Facetten & ringen</h3>
              <Slider id="facetCount" label="Facetten" min={0} max={16} step={1}
                value={params.facetCount} onChange={onParamChange} hint="0 = rond, 3+ = veelhoek" />
              <Slider id="facetStrength" label="Facet sterkte" min={0} max={100} step={5} unit="%"
                value={params.facetStrength} onChange={onParamChange} />
              <Slider id="ringCount" label="Ringen" min={0} max={40} step={1}
                value={params.ringCount} onChange={onParamChange} hint="horizontale banden" />
              <Slider id="ringAmount" label="Ring diepte" min={0} max={12} step={1} unit="%"
                value={params.ringAmount} onChange={onParamChange} />
            </>
          )}

          {tab === 'textuur' && (
            <>
              <h3 className="section-title full">Oppervlaktetextuur</h3>
              <Chips
                options={TEXTURES}
                value={params.textureType || 'geen'}
                onSelect={(t) => onParamChange('textureType', t.id)}
              />
              {params.textureType !== 'geen' && (
                <>
                  <Slider id="textureScale" label="Fijnheid" min={8} max={64} step={1}
                    value={params.textureScale} onChange={onParamChange} hint="herhalingen rondom" />
                  <Slider id="textureDepth" label="Diepte" min={0} max={10} step={1} unit="%"
                    value={params.textureDepth} onChange={onParamChange} hint="wordt veilig begrensd" />
                </>
              )}

              <h3 className="section-title full">Bobbels</h3>
              <Slider id="bumpCols" label="Rondom" min={0} max={24} step={1}
                value={params.bumpCols} onChange={onParamChange} hint="0 = uit" />
              <Slider id="bumpRows" label="Rijen" min={1} max={30} step={1}
                value={params.bumpRows} onChange={onParamChange} hint="meer rijen = kleinere bobbels" />
              <Slider id="bumpDepth" label="Hoogte" min={-bumpMax} max={bumpMax} step={1} unit="%"
                value={bumpDepth} onChange={onParamChange} hint="negatief = deuken" />
              <Toggle label="Versprongen rijen" checked={params.bumpStagger !== false}
                onChange={(v) => onParamChange('bumpStagger', v)} />

              <h3 className="section-title full">Golvende rand</h3>
              <Slider id="rimWaveCount" label="Golven" min={0} max={24} step={1}
                value={params.rimWaveCount} onChange={onParamChange} hint="0 of 1 = rechte rand" />
              <Slider id="rimWaveDepth" label="Diepte" min={0} max={20} step={1} unit="%"
                value={params.rimWaveDepth} onChange={onParamChange} hint="van de hoogte" />
            </>
          )}

          {tab === 'organisch' && (
            <>
              <h3 className="section-title full">Vrije vervorming</h3>
              <Slider id="organicAmount" label="Vervorming" min={0} max={40} step={1} unit="%"
                value={params.organicAmount} onChange={onParamChange} hint="afwijking van rond" />
              <Slider id="organicDetail" label="Detail" min={1} max={10} step={1}
                value={params.organicDetail} onChange={onParamChange} hint="grote bulten ↔ kleine" />
              <Slider id="organicFlow" label="Verloop" min={0} max={200} step={5} unit="%"
                value={params.organicFlow} onChange={onParamChange} hint="0 = kolom, hoog = kronkelt" />
              <Slider id="seed" label="Seed" min={1} max={99999} step={1}
                value={params.seed} onChange={onParamChange} hint="ander getal = andere vorm" />
              <Slider id="swayAmount" label="Scheefheid" min={0} max={40} step={1} unit="%"
                value={params.swayAmount} onChange={onParamChange} hint="hartlijn wijkt af" />
              <Slider id="swayTurns" label="Scheef draai" min={0} max={3} step={0.25} unit="×"
                value={params.swayTurns} onChange={onParamChange} hint="0 = leunt recht, >0 = krult" />
            </>
          )}

          {tab === 'print' && (
            <>
              <h3 className="section-title full">Filament</h3>
              <div className="full swatch-row">
                {FILAMENTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    title={f.label}
                    className={`swatch${params.filament === f.id ? ' active' : ''}`}
                    style={{ background: f.color }}
                    onClick={() => onParamChange('filament', f.id)}
                  />
                ))}
              </div>
              <Chips
                options={FINISHES}
                value={params.finish || 'basic'}
                onSelect={(f) => onParamChange('finish', f.id)}
              />

              <h3 className="section-title full">Printbaarheid</h3>
              <Toggle label="Auto printbaar houden" checked={params.autoLimit !== false}
                onChange={(v) => onParamChange('autoLimit', v)} />
              <Toggle label="Draaitafel" checked={!!params.autoRotate}
                onChange={(v) => onParamChange('autoRotate', v)} />
              <Slider id="maxOverhang" label="Max. overhang" min={15} max={60} step={1} unit="°"
                value={params.maxOverhang} onChange={onParamChange} />
              <Slider id="layerHeight" label="Laaghoogte" min={0.08} max={0.32} step={0.02} unit="mm"
                value={params.layerHeight} onChange={onParamChange} />
              <Toggle label="Toon printbed" checked={params.showGrid !== false}
                onChange={(v) => onParamChange('showGrid', v)} full />
            </>
          )}
        </div>
      </div>

      <div className="status-bar">
        <div className="status-row">
          <span>Ø {Math.round(maxDiameter)} × {params.height}mm</span>
          <span>{layers} lagen · {params.thickness}mm wand</span>
          <span className={overhangClass}>Steilste wand {overhang}°</span>
        </div>
        {shape.limited && (
          <p className="muted">
            Decoratie teruggeschaald naar {Math.round(shape.detailScale * 100)}% om printbaar te blijven —
            dieper instellen helpt niet, verhoog eerst de max. overhang.
          </p>
        )}
        {shape.baseOverhangDeg > overhangLimit && (
          <p className="bad">⚠️ Het silhouet zelf is te steil ({Math.round(shape.baseOverhangDeg)}°) — pas de diameters aan.</p>
        )}
        {!fitsBed && (
          <p className="bad">⚠️ Past niet op de P1S ({PRINTER_LIMITS.maxDiameter}mm Ø × {PRINTER_LIMITS.maxHeight}mm).</p>
        )}
      </div>
    </div>
  );
};

export default VaseControls;
