import React, { useMemo, useState } from 'react';
import {
  applySilhouette,
  randomVaseParams,
  randomSeed,
  normalizeProfile,
  profilePoints,
  profileRadiusAt,
  maxProfileDiameter,
  normalizeSection,
  sectionSignature,
  describeSection,
  foldSection,
  expandSection,
  sectorSpan,
  foldAngle,
  SECTION_PRESETS,
  SECTION_FAMILIES,
  SECTION_SYMMETRIES,
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
import { SectionThumb, ProfileThumb } from './PresetThumb';

const TABS = [
  { id: 'vorm', label: '🏺 Vorm' },
  { id: 'doorsnede', label: '⬡ Doorsnede' },
  { id: 'patroon', label: '≣ Patroon' },
  { id: 'textuur', label: '⣿ Textuur' },
  { id: 'organisch', label: '🌿 Organisch' },
  { id: 'print', label: '🖨️ Print' },
];

const decimalsOf = (step) => {
  const dot = String(step).indexOf('.');
  return dot < 0 ? 0 : String(step).length - dot - 1;
};

/** Waarde naast de schuif: ook zelf in te typen. */
const NumberField = ({ value, min, max, step, unit, onCommit }) => {
  const [draft, setDraft] = useState(null);

  const commit = (raw) => {
    setDraft(null);
    const n = parseFloat(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) return;
    const snapped = Math.round((n - min) / step) * step + min;
    onCommit(parseFloat(Math.min(max, Math.max(min, snapped)).toFixed(decimalsOf(step))));
  };

  return (
    <span className="control-value">
      <input
        type="text"
        inputMode="decimal"
        className="value-input"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(e.currentTarget.value); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
        }}
      />
      {unit}
    </span>
  );
};

const Slider = ({ id, label, min, max, step, unit = '', value, hint, onChange, full = false }) => (
  <div className={`control${full ? ' full' : ''}`}>
    <div className="control-head">
      <label className="control-label" htmlFor={id}>{label}</label>
      <NumberField value={value} min={min} max={max} step={step} unit={unit}
        onCommit={(v) => onChange(id, v)} />
    </div>
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

const Chips = ({ options, value, onSelect, compare, thumb }) => (
  <div className={`full chip-row${thumb ? ' thumbs' : ''}`}>
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        className={`chip${(compare ? compare(o) : value === o.id) ? ' active' : ''}${thumb ? ' has-thumb' : ''}`}
        onClick={() => onSelect(o)}
      >
        {thumb && thumb(o)}
        <span>{thumb ? o.label.replace(/^\S+\s+/, '') : o.label}</span>
      </button>
    ))}
  </div>
);

// `shape` komt van de configurator: die rekent hem één keer uit (op een licht
// vertraagde parameterset) en deelt hem met de 3D-weergave, zodat het slepen
// aan een schuif niet op dezelfde dure berekening hoeft te wachten.
const VaseControls = ({ params, shape, onParamChange, onParamsChange, onUndo, onRedo, canUndo, canRedo }) => {
  const [tab, setTab] = useState('vorm');
  const [node, setNode] = useState(1);
  const [pen, setPen] = useState({ profile: false, section: false });
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
  const kind = useMemo(() => describeSection(params.section), [params.section]);
  const family = kind.family ? SECTION_FAMILIES[kind.family] : null;
  const sym = Math.max(1, Math.round(params.sectionSym || 1));
  const mirror = !!params.sectionMirror;
  const span = sectorSpan(sym, mirror);
  const sectored = sym > 1 || mirror;
  const [corner, setCorner] = useState(0);
  // bij symmetrie bewerk je maar één sector; de rest wordt gekopieerd
  const nodes = useMemo(() => foldSection(params.section, sym, mirror) || [], [params.section, sym, mirror]);
  const cornerIndex = nodes.length ? Math.min(corner, nodes.length - 1) : 0;
  const cornerNode = nodes[cornerIndex];
  const wrap = (v) => ((v % 1) + 1) % 1;

  // hoek terugvouwen naar de sector waarin je tekent
  const foldTo = (a) => foldAngle(a, sym, mirror);

  const setSection = (next, keepAngle = null) => {
    const full = expandSection(next, sym, mirror);
    onParamChange('section', full);
    if (full && keepAngle !== null) {
      const back = foldSection(full, sym, mirror) || [];
      const at = back.findIndex((pt) => Math.abs(pt.a - keepAngle) < 1e-4);
      setCorner(at < 0 ? 0 : at);
    }
  };

  // hoek blijft tussen de buren: zo houdt de volgorde — en dus de selectie — stand
  const moveCorner = (index, patch) => {
    const n = nodes.length;
    const cur = nodes[index];
    if (!cur) return;
    let a = cur.a;
    if (patch.a !== undefined) {
      if (sectored) {
        const lo = index > 0 ? nodes[index - 1].a + MIN_SECTION_GAP : 0;
        const hi = index < n - 1 ? nodes[index + 1].a - MIN_SECTION_GAP : span;
        a = hi >= lo ? Math.min(hi, Math.max(lo, foldTo(patch.a))) : cur.a;
      } else if (n > 2) {
        const prev = nodes[(index - 1 + n) % n].a;
        const room = wrap(nodes[(index + 1) % n].a - prev) - MIN_SECTION_GAP;
        a = room > MIN_SECTION_GAP
          ? wrap(prev + Math.min(room, Math.max(MIN_SECTION_GAP, wrap(patch.a - prev))))
          : cur.a;
      }
    }
    setSection(nodes.map((pt, i) => (i === index ? { ...pt, ...patch, a } : pt)), a);
  };

  const addCorner = (at) => {
    const base = nodes.length
      ? nodes
      : (foldSection(SECTION_PRESETS.find((s) => s.id === 'vrij').make(), sym, mirror) || []);
    const a = foldTo(at.a);
    setSection([...base, { a, r: at.r, sharp: false }], a);
  };

  const restAfterRemove = nodes.filter((_, i) => i !== cornerIndex);
  const canRemoveCorner = nodes.length > 1 && !!expandSection(restAfterRemove, sym, mirror);

  const removeCorner = () => {
    if (!canRemoveCorner) return;
    setSection(restAfterRemove, nodes[(cornerIndex + 1) % nodes.length].a);
  };

  const toggleCorner = (index) => {
    const pt = nodes[index];
    if (!pt) return;
    setSection(nodes.map((p, i) => (i === index ? { ...p, sharp: !p.sharp } : p)), pt.a);
  };

  // symmetrie wisselen: de bestaande vorm wordt naar de nieuwe sector gevouwen
  const setSymmetry = (nextSym, nextMirror) => {
    const master = foldSection(params.section, nextSym, nextMirror);
    onParamsChange({
      sectionSym: nextSym,
      sectionMirror: nextMirror,
      section: master ? expandSection(master, nextSym, nextMirror) : params.section,
    });
    setCorner(0);
  };

  const setSides = (n) => {
    const sides = Number(n);
    onParamsChange({
      section: normalizeSection(SECTION_FAMILIES[kind.family].make(sides)),
      sectionSym: kind.family === 'vrij' ? sym : sides,
      sectionMirror: kind.family === 'vrij' ? mirror : false,
    });
    setCorner(0);
  };

  const selectPreset = (preset) => {
    onParamsChange({
      section: normalizeSection(preset.make()),
      sectionSym: preset.family && preset.family !== 'vrij' ? preset.sides : (preset.id === 'ovaal' ? 2 : 1),
      sectionMirror: preset.id === 'ovaal',
    });
    setCorner(0);
  };

  const sectionThumbs = useMemo(
    () => Object.fromEntries(SECTION_PRESETS.map((p) => [p.id, <SectionThumb points={p.make()} />])),
    [],
  );
  const silhouetteThumbs = useMemo(
    () => Object.fromEntries(SILHOUETTES.map((s) => [
      s.id, <ProfileThumb profile={applySilhouette(s, maxDiameter, params.height).profile} />,
    ])),
    [maxDiameter, params.height],
  );

  const layers = Math.ceil(params.height / params.layerHeight);
  const matches = (values) => Object.entries(values).every(([k, v]) => params[k] === v);

  // Elk versieringsblok heeft een "aan"-voorwaarde. Staat die op nul, dan doen
  // de schuifjes eronder zichtbaar niets — dat is precies wat verwarrend was na
  // het kiezen van een Stijl, want die zet alle andere versiering uit.
  const patternOn = params.waveCount > 0 && params.waveAmplitude > 0;
  const textureOn = (params.textureType || 'geen') !== 'geen' && params.textureDepth > 0;
  const facetOn = params.facetCount >= 3 && params.facetStrength > 0;
  const ringsOn = params.ringCount > 0 && params.ringAmount > 0;
  const bumpsOn = params.bumpCols > 0 && params.bumpDepth !== 0;
  const rimOn = params.rimWaveCount >= 2 && params.rimWaveDepth > 0;
  const organicOn = params.organicAmount > 0;
  const swayOn = params.swayAmount > 0;
  // Twist draait het patroon en de doorsnede mee omhoog. Is er niets
  // hoekafhankelijks, dan is een gedraaide vaas niet van een rechte te
  // onderscheiden. Ringen tellen niet mee: die lopen horizontaal rond.
  const twistHasEffect = patternOn || facetOn || bumpsOn || textureOn || organicOn || !!params.section;
  const twistOn = params.twistAngle !== 0 && twistHasEffect;
  // De seed voedt alleen het toevalspatroon van de organische vervorming en de
  // scheefheid; staan die op 0, dan verandert een andere seed helemaal niets.
  const seedMatters = organicOn || swayOn;

  // Een vorm kiezen terwijl het blok uit staat, zet het meteen aan met een
  // zichtbare waarde — anders klik je op iets en gebeurt er niets.
  const pickPattern = (s) => {
    if (patternOn) { onParamChange('patternShape', s.id); return; }
    onParamsChange({
      patternShape: s.id,
      waveCount: params.waveCount > 0 ? params.waveCount : (s.id === 'paneel' ? 6 : 16),
      waveAmplitude: params.waveAmplitude > 0 ? params.waveAmplitude : 6,
    });
  };

  const pickTexture = (t) => {
    if (t.id === 'geen' || params.textureDepth > 0) { onParamChange('textureType', t.id); return; }
    onParamsChange({ textureType: t.id, textureDepth: 4 });
  };

  // Stijlblok per tabblad. Een stijl vervangt altijd alle versiering, maar door
  // alleen de stijlen te tonen die dít tabblad daarna bedienen, staat 'organisch'
  // niet langer onder Patroon en zoek je een aanpassing waar je hem verwacht.
  // Bewust een gewone functie en geen component: een component die binnen
  // VaseControls wordt gedefinieerd is bij elke render een nieuw type, waardoor
  // React de hele chip-rij telkens opnieuw opbouwt.
  const stylePresets = (group) => (
    <>
      <h3 className="section-title full">Stijl</h3>
      <p className="control-hint full">
        Eén klik zet een complete versiering — en wist wat er op de andere
        versieringstabbladen aan stond.
      </p>
      <Chips
        options={DECOR_PRESETS.filter((p) => p.group === group || p.group === 'alle')}
        onSelect={(preset) => onParamsChange(preset.values)}
        compare={(preset) => matches(preset.values)}
      />
    </>
  );
  // dieper dan dit loopt het bobbelraster in zichzelf, dus houdt de slider ook op
  const bumpMax = Math.max(1, shape.bumpMaxPercent);
  const bumpDepth = Math.min(bumpMax, Math.max(-bumpMax, params.bumpDepth));

  return (
    <div className="controls">
      <div className="action-row">
        <button type="button" className="action-button primary" onClick={() => onParamsChange(randomVaseParams())}>
          🎲 Verras me
        </button>
        {/* "Andere seed" stond hier, maar werkt alleen op de organische
            vervorming — hij staat nu op het tabblad Organisch, bij de schuifjes
            die hij daadwerkelijk beïnvloedt. */}
        <button type="button" className="action-button icon" onClick={onUndo} disabled={!canUndo}
          title="Ongedaan maken (Ctrl+Z)">↶</button>
        <button type="button" className="action-button icon" onClick={onRedo} disabled={!canRedo}
          title="Opnieuw (Ctrl+Shift+Z)">↷</button>
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
                thumb={(s) => silhouetteThumbs[s.id]}
              />
              <Slider id="height" label="Hoogte" min={60} max={PRINTER_LIMITS.maxHeight} step={1} unit="mm"
                value={params.height} onChange={onParamChange} />
              <Slider id="thickness" label="Wanddikte" min={0.8} max={2.4} step={0.2} unit="mm"
                value={params.thickness} onChange={onParamChange}
                hint="0.8 = vase mode · 1.2 = 3 lijnen" />

              <h3 className="section-title full">Controlepunten</h3>
              <div className="full profile-panel">
                <div className="editor-tools">
                  <button type="button" className={`tool${pen.profile ? ' active' : ''}`}
                    onClick={() => setPen((p) => ({ ...p, profile: !p.profile }))}
                    title="Pen: klik in de tekening om punten te zetten">✎ Pen</button>
                  <button type="button" className="tool" onClick={addNode} title="Punt erbij">＋</button>
                  <button type="button" className="tool" onClick={removeNode}
                    disabled={isEnd || profile.length <= 2} title="Geselecteerd punt wissen">−</button>
                  <span className="tool-hint">{pen.profile ? 'klik = punt erbij' : 'dubbelklik = punt erbij'}</span>
                </div>
                <ProfileEditor
                  profile={profile}
                  height={params.height}
                  selected={active}
                  pen={pen.profile}
                  onSelect={setNode}
                  onMove={moveNode}
                  onAdd={addNodeAt}
                  onRemove={removeNode}
                />
                <p className="control-hint">Sleep · Shift = vastklikken · pijltjes = fijn bijstellen · Delete = wissen</p>
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
                onSelect={selectPreset}
                compare={(preset) => (preset.family
                  ? kind.family === preset.family && (!preset.exact || kind.sides === preset.sides)
                  : sectionSignature(preset.make()) === sectionSignature(params.section))}
                thumb={(preset) => sectionThumbs[preset.id]}
              />
              {family && (
                <Slider id="sectionSides" label={`Aantal ${family.unit}`} min={family.min} max={family.max} step={1}
                  value={kind.sides} onChange={(_, v) => setSides(v)} full />
              )}

              <h3 className="section-title full">Symmetrie</h3>
              <Chips
                options={[...new Set([...SECTION_SYMMETRIES, sym])].sort((a, b) => a - b)
                  .map((n) => ({ id: n, label: n === 1 ? 'Vrij' : `${n}×` }))}
                value={sym}
                onSelect={(o) => setSymmetry(o.id, mirror)}
              />
              <Toggle label="Spiegelen in de sector" checked={mirror}
                onChange={(v) => setSymmetry(sym, v)} full />

              <div className="full profile-panel">
                <div className="editor-tools">
                  <button type="button" className={`tool${pen.section ? ' active' : ''}`}
                    onClick={() => setPen((p) => ({ ...p, section: !p.section }))}
                    title="Pen: klik in de tekening om punten te zetten">✎ Pen</button>
                  <button type="button" className="tool" onClick={() => toggleCorner(cornerIndex)}
                    disabled={!cornerNode} title="Rond of hoekig (rechtermuis op een punt)">⬡</button>
                  <button type="button" className="tool" onClick={removeCorner}
                    disabled={!canRemoveCorner} title="Geselecteerd punt wissen">−</button>
                  <span className="tool-hint">
                    {sectored ? `je tekent ${Math.round(span * 360)}° · rest wordt gekopieerd` : 'hele rondte vrij'}
                  </span>
                </div>
                <SectionEditor
                  section={section}
                  nodes={nodes}
                  sym={sym}
                  mirror={mirror}
                  selected={cornerIndex}
                  pen={pen.section}
                  onSelect={setCorner}
                  onMove={moveCorner}
                  onAdd={addCorner}
                  onToggle={toggleCorner}
                  onRemove={removeCorner}
                />
                <p className="control-hint">
                  {section
                    ? 'Sleep · rechtermuis = rond/hoekig · Shift = vastklikken · pijltjes = fijn bijstellen'
                    : 'Rond. Kies een vorm of dubbelklik om zelf te tekenen.'}
                </p>
              </div>
              {cornerNode && (
                <>
                  <Slider id="cornerAngle" label={`Punt ${cornerIndex + 1} van ${nodes.length}`}
                    min={0} max={Math.round(span * 360)} step={1} unit="°"
                    value={Math.round(cornerNode.a * 360)}
                    onChange={(_, v) => moveCorner(cornerIndex, { a: Number(v) / 360 })} />
                  <Slider id="cornerRadius" label="Straal" min={25} max={100} step={1} unit="%"
                    value={Math.round(cornerNode.r * 100)}
                    onChange={(_, v) => moveCorner(cornerIndex, { r: Number(v) / 100 })} />
                  <Toggle label="Hoekig (rechte zijden)" checked={!!cornerNode.sharp}
                    onChange={() => toggleCorner(cornerIndex)} full />
                  <div className="full chip-row">
                    <button type="button" className="chip"
                      onClick={() => setSection(nodes.map((pt) => ({ ...pt, sharp: true })), cornerNode.a)}>
                      Alles hoekig
                    </button>
                    <button type="button" className="chip"
                      onClick={() => setSection(nodes.map((pt) => ({ ...pt, sharp: false })), cornerNode.a)}>
                      Alles rond
                    </button>
                    <button type="button" className="chip" onClick={removeCorner} disabled={!canRemoveCorner}>
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
              {stylePresets('patroon')}

              <h3 className={`section-title full${patternOn ? '' : ' off'}`}>
                Profiel {!patternOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Chips
                options={PATTERN_SHAPES}
                value={patternOn ? params.patternShape : null}
                onSelect={pickPattern}
              />
              <Slider id="waveCount" label="Herhalingen" min={0} max={48} step={1}
                value={params.waveCount} onChange={onParamChange} />
              <Slider id="waveAmplitude" label="Diepte" min={0} max={25} step={1} unit="%"
                value={params.waveAmplitude} onChange={onParamChange} />
              {!patternOn && (
                <p className="control-hint full">
                  Herhalingen of Diepte staat op 0, dus je ziet nog niets. Klik een profiel
                  hierboven om het patroon aan te zetten.
                </p>
              )}

              <h3 className={`section-title full${twistOn ? '' : ' off'}`}>
                Twist {!twistOn && <span className="off-tag">staat uit</span>}
              </h3>
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
              {params.twistAngle !== 0 && !twistHasEffect && (
                <p className="control-hint full">
                  Twist draait de versiering mee omhoog, maar er is nog niets om te draaien:
                  een gladde ronde vaas ziet er gedraaid precies hetzelfde uit. Zet een
                  patroon, textuur of doorsnede aan.
                </p>
              )}

              <h3 className={`section-title full${facetOn ? '' : ' off'}`}>
                Facetten {!facetOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="facetCount" label="Facetten" min={0} max={16} step={1}
                value={params.facetCount} onChange={onParamChange} hint="0 = rond, 3+ = veelhoek" />
              <Slider id="facetStrength" label="Facet sterkte" min={0} max={100} step={5} unit="%"
                value={params.facetStrength} onChange={onParamChange} />
              {facetOn && params.section && (
                <p className="control-hint full">
                  Let op: je hebt óók een doorsnede ingesteld. Facetten vermenigvuldigen daarmee,
                  wat een onrustige vorm geeft — kies bij voorkeur één van beide.
                </p>
              )}

              <h3 className={`section-title full${ringsOn ? '' : ' off'}`}>
                Ringen {!ringsOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="ringCount" label="Ringen" min={0} max={40} step={1}
                value={params.ringCount} onChange={onParamChange} hint="horizontale banden" />
              <Slider id="ringAmount" label="Ring diepte" min={0} max={12} step={1} unit="%"
                value={params.ringAmount} onChange={onParamChange} />
            </>
          )}

          {tab === 'textuur' && (
            <>
              {stylePresets('textuur')}

              <h3 className={`section-title full${textureOn ? '' : ' off'}`}>
                Oppervlaktetextuur {!textureOn && <span className="off-tag">staat uit</span>}
              </h3>
              <p className="control-hint full">
                Fijn reliëf bovenop het patroon van het tabblad Patroon — die twee stapelen
                op elkaar. Wordt het onrustig, zet er dan één op 0.
              </p>
              <Chips
                options={TEXTURES}
                value={params.textureType || 'geen'}
                onSelect={pickTexture}
              />
              {params.textureType !== 'geen' && (
                <>
                  <Slider id="textureScale" label="Fijnheid" min={8} max={64} step={1}
                    value={params.textureScale} onChange={onParamChange} hint="herhalingen rondom" />
                  <Slider id="textureDepth" label="Diepte" min={0} max={10} step={1} unit="%"
                    value={params.textureDepth} onChange={onParamChange} hint="wordt veilig begrensd" />
                </>
              )}

              <h3 className={`section-title full${bumpsOn ? '' : ' off'}`}>
                Bobbels {!bumpsOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="bumpCols" label="Rondom" min={0} max={24} step={1}
                value={params.bumpCols} onChange={onParamChange} hint="0 = uit" />
              <Slider id="bumpRows" label="Rijen" min={1} max={30} step={1}
                value={params.bumpRows} onChange={onParamChange} hint="meer rijen = kleinere bobbels" />
              <Slider id="bumpDepth" label="Hoogte" min={-bumpMax} max={bumpMax} step={1} unit="%"
                value={bumpDepth} onChange={onParamChange} hint="negatief = deuken" />
              <Toggle label="Versprongen rijen" checked={params.bumpStagger !== false}
                onChange={(v) => onParamChange('bumpStagger', v)} />

              <h3 className={`section-title full${rimOn ? '' : ' off'}`}>
                Golvende rand {!rimOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="rimWaveCount" label="Golven" min={0} max={24} step={1}
                value={params.rimWaveCount} onChange={onParamChange} hint="0 of 1 = rechte rand" />
              <Slider id="rimWaveDepth" label="Diepte" min={0} max={20} step={1} unit="%"
                value={params.rimWaveDepth} onChange={onParamChange} hint="van de hoogte" />
            </>
          )}

          {tab === 'organisch' && (
            <>
              {stylePresets('organisch')}

              <h3 className={`section-title full${organicOn ? '' : ' off'}`}>
                Vrije vervorming {!organicOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="organicAmount" label="Vervorming" min={0} max={40} step={1} unit="%"
                value={params.organicAmount} onChange={onParamChange} hint="afwijking van rond" />
              <Slider id="organicDetail" label="Detail" min={1} max={10} step={1}
                value={params.organicDetail} onChange={onParamChange} hint="grote bulten ↔ kleine" />
              <Slider id="organicFlow" label="Verloop" min={0} max={200} step={5} unit="%"
                value={params.organicFlow} onChange={onParamChange} hint="0 = kolom, hoog = kronkelt" />

              <h3 className={`section-title full${swayOn ? '' : ' off'}`}>
                Scheefheid {!swayOn && <span className="off-tag">staat uit</span>}
              </h3>
              <Slider id="swayAmount" label="Scheefheid" min={0} max={40} step={1} unit="%"
                value={params.swayAmount} onChange={onParamChange} hint="hartlijn wijkt af" />
              <Slider id="swayTurns" label="Scheef draai" min={0} max={3} step={0.25} unit="×"
                value={params.swayTurns} onChange={onParamChange} hint="0 = leunt recht, >0 = krult" />

              {/* De seed hoort hier: hij bepaalt alleen het toevalspatroon van de
                  vervorming en de scheefheid hierboven, nergens anders. */}
              <h3 className="section-title full">Toeval</h3>
              <Slider id="seed" label="Seed" min={1} max={99999} step={1}
                value={params.seed} onChange={onParamChange} hint="ander getal = andere vorm" />
              <div className="full chip-row">
                <button
                  type="button"
                  className="chip"
                  onClick={() => onParamChange('seed', randomSeed())}
                  disabled={!seedMatters}
                  title={seedMatters
                    ? 'Zelfde instellingen, ander toevalspatroon'
                    : 'Doet niets zolang Vervorming en Scheefheid op 0 staan'}
                >
                  🌱 Andere seed
                </button>
              </div>
              {!seedMatters && (
                <p className="control-hint full">
                  De seed doet pas iets zodra Vervorming of Scheefheid boven 0 staat —
                  alleen die twee gebruiken toeval.
                </p>
              )}
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
                Een golvende rand blijft in vase mode vlak: één spiraal kan geen losse tongen printen.
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
        {/* Een eventuele "kan niet printen"-melding staat als badge over de 3D-preview,
            zodat hij niet 2x hetzelfde zegt en ongeacht het tabblad zichtbaar blijft. */}
      </div>
    </div>
  );
};

export default VaseControls;
