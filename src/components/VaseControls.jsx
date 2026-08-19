import React, { useMemo, useState } from 'react';
import {
  createVaseShape,
  applySilhouette,
  randomVaseParams,
  randomSeed,
  normalizeProfile,
  profilePoints,
  profileRadiusAt,
  maxProfileDiameter,
  normalizeSection,
  sectionSignature,
  SECTION_PRESETS,
  MIN_NODE_GAP,
  MIN_SECTION_GAP,
  SILHOUETTES,
  DECOR_PRESETS,
  PATTERN_SHAPES,
  TEXTURES,
  PRINTER_LIMITS,
} from '../lib/vaseShape';
import { FILAMENTS, FINISHES } from '../lib/filaments';
import ProfileEditor from './ProfileEditor';
import SectionEditor from './SectionEditor';

const TABS = [
  { id: 'vorm', label: '🏺 Vorm' },
  { id: 'doorsnede', label: '⬡ Doorsnede' },
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
  const [node, setNode] = useState(1);
  const shape = useMemo(() => createVaseShape(params), [params]);
  const profile = useMemo(() => profilePoints(params), [params]);

  const overhang = Math.round(shape.maxOverhangDeg);
  const overhangLimit = params.maxOverhang;
  const overhangClass = overhang <= overhangLimit ? 'ok' : overhang <= overhangLimit + 10 ? 'warn' : 'bad';

  const maxDiameter = maxProfileDiameter(params);
  const active = Math.min(node, profile.length - 1);
  const point = profile[active];
  const isEnd = active === 0 || active === profile.length - 1;

  const setProfile = (next, keep = active) => {
    const clean = normalizeProfile(next);
    setNode(Math.min(keep, clean.length - 1));
    onParamChange('profile', clean);
  };

  const moveNode = (index, patch) => {
    setProfile(profile.map((p, i) => (i === index ? { ...p, ...patch } : p)), index);
  };

  const addNodeAt = ({ t, d }) => {
    // punt tussen twee bestaande punten inschuiven, met wat lucht ertussen
    const before = profile.filter((p) => p.t < t).length - 1;
    if (before < 0 || before >= profile.length - 1) return;
    const lo = profile[before].t + MIN_NODE_GAP;
    const hi = profile[before + 1].t - MIN_NODE_GAP;
    if (hi < lo) return;
    const at = Math.min(hi, Math.max(lo, t));
    setProfile([...profile, { t: at, d: d ?? profileRadiusAt(profile, at) * 2 }], before + 1);
  };

  const addNode = () => {
    let gap = 0;
    let at = 1;
    for (let i = 1; i < profile.length; i++) {
      if (profile[i].t - profile[i - 1].t > gap) { gap = profile[i].t - profile[i - 1].t; at = i; }
    }
    const t = (profile[at].t + profile[at - 1].t) / 2;
    addNodeAt({ t, d: profileRadiusAt(profile, t) * 2 });
  };

  const removeNode = () => {
    if (isEnd || profile.length <= 2) return;
    setProfile(profile.filter((_, i) => i !== active), Math.max(1, active - 1));
  };

  const section = useMemo(() => normalizeSection(params.section), [params.section]);
  const [corner, setCorner] = useState(0);
  const nodes = section || [];
  const cornerIndex = nodes.length ? Math.min(corner, nodes.length - 1) : 0;
  const cornerNode = nodes[cornerIndex];
  const wrap = (v) => ((v % 1) + 1) % 1;

  const setSection = (next, keepAngle = null) => {
    const clean = normalizeSection(next);
    onParamChange('section', clean);
    if (clean && keepAngle !== null) {
      const at = clean.findIndex((pt) => Math.abs(pt.a - keepAngle) < 1e-9);
      setCorner(at < 0 ? 0 : at);
    }
  };

  // hoek blijft tussen de buren: zo houdt de volgorde — en dus de selectie — stand
  const moveCorner = (index, patch) => {
    const n = nodes.length;
    const cur = nodes[index];
    let a = cur.a;
    if (patch.a !== undefined && n > 2) {
      const prev = nodes[(index - 1 + n) % n].a;
      const span = wrap(nodes[(index + 1) % n].a - prev);
      const room = span - MIN_SECTION_GAP;
      a = room > MIN_SECTION_GAP
        ? wrap(prev + Math.min(room, Math.max(MIN_SECTION_GAP, wrap(patch.a - prev))))
        : cur.a;
    }
    const next = nodes.map((pt, i) => (i === index ? { ...pt, ...patch, a } : pt));
    setSection(next, a);
  };

  const addCorner = (at) => {
    const base = nodes.length ? nodes : (SECTION_PRESETS.find((s) => s.id === 'vrij').make());
    setSection([...base, { a: at.a, r: at.r, sharp: false }], at.a);
  };

  const removeCorner = () => {
    if (nodes.length <= 3) return;
    setSection(nodes.filter((_, i) => i !== cornerIndex), nodes[(cornerIndex + 1) % nodes.length].a);
  };
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

              <h3 className="section-title full">Controlepunten</h3>
              <div className="full profile-panel">
                <ProfileEditor
                  profile={profile}
                  height={params.height}
                  selected={active}
                  onSelect={setNode}
                  onMove={moveNode}
                  onAdd={addNodeAt}
                />
                <p className="control-hint">Sleep een punt · dubbelklik in de vorm voor een punt erbij</p>
              </div>
              <div className="full chip-row">
                {profile.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chip${i === active ? ' active' : ''}`}
                    onClick={() => setNode(i)}
                  >
                    {i === 0 ? 'Bodem' : i === profile.length - 1 ? 'Opening' : `Punt ${i}`}
                  </button>
                ))}
              </div>
              <Slider id="nodeDiameter" label={`Ø ${isEnd ? (active === 0 ? 'bodem' : 'opening') : `punt ${active}`}`}
                min={20} max={PRINTER_LIMITS.maxDiameter} step={1} unit="mm"
                value={point.d} onChange={(_, v) => moveNode(active, { d: Number(v) })} />
              <Slider id="nodeHeight" label="Hoogte" min={0} max={100} step={1} unit="%"
                value={Math.round(point.t * 100)}
                onChange={(_, v) => {
                  if (isEnd) return;
                  const t = Math.min(profile[active + 1].t - MIN_NODE_GAP,
                    Math.max(profile[active - 1].t + MIN_NODE_GAP, Number(v) / 100));
                  moveNode(active, { t });
                }}
                hint={isEnd ? 'bodem en opening liggen vast' : undefined} />
              <div className="full chip-row">
                <button type="button" className="chip" onClick={addNode}>+ Punt</button>
                <button type="button" className="chip" onClick={removeNode} disabled={isEnd || profile.length <= 2}>
                  − Punt wissen
                </button>
              </div>
            </>
          )}

          {tab === 'doorsnede' && (
            <>
              <h3 className="section-title full">Vorm van bovenaf</h3>
              <Chips
                options={SECTION_PRESETS}
                onSelect={(preset) => {
                  onParamChange('section', normalizeSection(preset.make()));
                  setCorner(0);
                }}
                compare={(preset) => sectionSignature(preset.make()) === sectionSignature(params.section)}
              />
              <div className="full profile-panel">
                <SectionEditor
                  section={section}
                  selected={cornerIndex}
                  onSelect={setCorner}
                  onMove={moveCorner}
                  onAdd={addCorner}
                />
                <p className="control-hint">
                  {section
                    ? 'Sleep een punt · dubbelklik voor een punt erbij · vierkantjes zijn hoeken'
                    : 'Rond. Kies een vorm of dubbelklik om zelf te tekenen.'}
                </p>
              </div>
              {cornerNode && (
                <>
                  <Slider id="cornerAngle" label={`Punt ${cornerIndex + 1} van ${nodes.length}`} min={0} max={359} step={1} unit="°"
                    value={Math.round(cornerNode.a * 360)}
                    onChange={(_, v) => moveCorner(cornerIndex, { a: Number(v) / 360 })} />
                  <Slider id="cornerRadius" label="Straal" min={25} max={100} step={1} unit="%"
                    value={Math.round(cornerNode.r * 100)}
                    onChange={(_, v) => moveCorner(cornerIndex, { r: Number(v) / 100 })} />
                  <Toggle label="Hoekig (rechte zijden)" checked={!!cornerNode.sharp}
                    onChange={(v) => moveCorner(cornerIndex, { sharp: v })} full />
                  <div className="full chip-row">
                    <button type="button" className="chip"
                      onClick={() => setSection(nodes.map((pt) => ({ ...pt, sharp: true })))}>
                      Alles hoekig
                    </button>
                    <button type="button" className="chip"
                      onClick={() => setSection(nodes.map((pt) => ({ ...pt, sharp: false })))}>
                      Alles rond
                    </button>
                    <button type="button" className="chip" onClick={removeCorner} disabled={nodes.length <= 3}>
                      − Punt wissen
                    </button>
                  </div>
                  <p className="control-hint full">
                    De grootste straal is altijd de diameter uit het silhouet, dus de vaas blijft
                    even breed als je hem instelt.
                  </p>
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

              <h3 className="section-title full">Export</h3>
              <Toggle label="Vase mode (massief model)" checked={!!params.vaseMode}
                onChange={(v) => onParamChange('vaseMode', v)} full />
              <p className="control-hint full">
                Aan: de STL is een massief lichaam zonder binnenwand. Zet spiral/vase mode aan in de
                slicer — die print dan één doorlopende wand. Uit: normale holle vaas.
              </p>
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
