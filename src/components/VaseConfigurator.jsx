import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VaseControls from './VaseControls';
import VaseViewer from './VaseViewer';
import ExportButton from './ExportButton';
import DesignLibrary from './DesignLibrary';
import { DEFAULT_SHAPE, profilePoints, createVaseShape, maxProfileDiameter, PRINTER_LIMITS } from '../lib/vaseShape';
import {
  loadDesigns, saveDesign, updateDesign, duplicateDesign, deleteDesign,
  suggestName, saveDraft, loadDraft, saveActiveId, loadActiveId,
} from '../lib/designStore';

// Defaults afgestemd op een Bambu Lab P1S met 0.4mm nozzle
const BASE_PARAMS = {
  ...DEFAULT_SHAPE,
  filament: 'jadewit',
  finish: 'basic',
  showGrid: true,
  autoRotate: false,
  layerHeight: 0.2,
  vaseMode: false,
};

const LEGACY_KEYS = [
  'diameterBottom', 'diameterLow', 'diameterHigh', 'diameterTop',
  'positionLow', 'positionHigh', 'useLow', 'useHigh',
];

// Ontwerpen van vóór de vrije controlepunten omzetten naar een profiel
const withProfile = (saved) => {
  const params = { ...BASE_PARAMS, ...saved, profile: profilePoints({ ...BASE_PARAMS, ...saved }) };
  LEGACY_KEYS.forEach((k) => delete params[k]);
  return params;
};

const VaseConfigurator = () => {
  const [vaseParams, setVaseParams] = useState(() => withProfile(loadDraft() || {}));
  const [meshRef, setMeshRef] = useState(null);
  const [designs, setDesigns] = useState(() => loadDesigns());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState(null);

  const captureRef = useRef(null);
  const savedSnapshot = useRef(null);

  // undo/redo over alle parameters; snel achter elkaar dezelfde schuif
  // verslepen wordt tot één stap samengevoegd
  const history = useRef({ past: [], future: [], key: null, at: 0 });
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const sync = () => setSteps({ undo: history.current.past.length, redo: history.current.future.length });

  const record = (prev, key = null) => {
    const h = history.current;
    const now = Date.now();
    if (!(key && h.key === key && now - h.at < 700)) h.past = [...h.past, prev].slice(-80);
    h.key = key;
    h.at = now;
    h.future = [];
    sync();
  };

  const updateParam = (param, value) => {
    record(vaseParams, param);
    setVaseParams({
      ...vaseParams,
      [param]: typeof value === 'boolean' || typeof value === 'number'
        ? value
        : (isNaN(parseFloat(value)) ? value : parseFloat(value)),
    });
  };

  // Meerdere parameters tegelijk (presets, randomizer)
  const updateParams = (values) => {
    record(vaseParams);
    setVaseParams({ ...vaseParams, ...values });
  };

  const undo = () => {
    const h = history.current;
    if (!h.past.length) return;
    h.future = [vaseParams, ...h.future];
    setVaseParams(h.past[h.past.length - 1]);
    h.past = h.past.slice(0, -1);
    h.key = null;
    sync();
  };

  const redo = () => {
    const h = history.current;
    if (!h.future.length) return;
    h.past = [...h.past, vaseParams];
    setVaseParams(h.future[0]);
    h.future = h.future.slice(1);
    h.key = null;
    sync();
  };

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' && event.target.type === 'text') return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vaseParams]);

  // concept bewaren zodat een refresh je werk niet weggooit
  useEffect(() => {
    const id = setTimeout(() => saveDraft(vaseParams), 400);
    return () => clearTimeout(id);
  }, [vaseParams]);

  // na een refresh weer aan hetzelfde opgeslagen ontwerp gekoppeld blijven
  useEffect(() => {
    const id = loadActiveId();
    const design = id ? designs.find((d) => d.id === id) : null;
    if (design) {
      savedSnapshot.current = JSON.stringify(design.params);
      setActive({ id: design.id, name: design.name });
    }
  }, []);

  useEffect(() => { saveActiveId(active ? active.id : null); }, [active]);

  const dirty = useMemo(
    () => !!active && JSON.stringify(vaseParams) !== savedSnapshot.current,
    [vaseParams, active]
  );

  // Eén centrale plek voor "print dit niet zonder problemen" — als badge over
  // de 3D-preview, zodat je het altijd ziet (ongeacht welk tabblad open staat)
  // zonder dat dezelfde melding ook nog in de zijbalk en boven de exportknop
  // staat.
  const printIssues = useMemo(() => {
    const shape = createVaseShape(vaseParams);
    const maxDiameter = maxProfileDiameter(vaseParams);
    const fitsBed = maxDiameter <= PRINTER_LIMITS.maxDiameter && vaseParams.height <= PRINTER_LIMITS.maxHeight;
    const tooSteep = shape.maxOverhangDeg > vaseParams.maxOverhang + 0.5;
    return [
      tooSteep && `Overhang van ${Math.round(shape.maxOverhangDeg)}° (limiet ${vaseParams.maxOverhang}°) — kan drijvende gebieden geven zonder supports. Verhoog "Max. overhang" of pas de vorm aan.`,
      !fitsBed && `Past niet op het bouwvolume (Ø${PRINTER_LIMITS.maxDiameter}mm × ${PRINTER_LIMITS.maxHeight}mm hoog).`,
      vaseParams.autoLimit === false && 'Auto printbaar staat uit — bij diep reliëf kan de wand door zichzelf heen lopen en slicet de STL niet schoon.',
    ].filter(Boolean);
  }, [vaseParams]);

  const flash = (message, tone = 'ok') => setToast({ message, tone, id: Date.now() });

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const markSaved = (design) => {
    savedSnapshot.current = JSON.stringify(design.params);
    setActive({ id: design.id, name: design.name });
  };

  const handleSave = (name) => {
    try {
      const thumb = captureRef.current ? captureRef.current() : null;
      const { list, design } = saveDesign(name, vaseParams, thumb);
      setDesigns(list);
      markSaved(design);
      flash(`Opgeslagen als “${design.name}”`);
    } catch (err) {
      flash(err.message, 'bad');
    }
  };

  const handleUpdate = () => {
    if (!active) return;
    try {
      const thumb = captureRef.current ? captureRef.current() : null;
      const list = updateDesign(active.id, {
        params: { ...vaseParams },
        ...(thumb ? { thumb } : {}),
      });
      setDesigns(list);
      const design = list.find((d) => d.id === active.id);
      if (design) markSaved(design);
      flash('Ontwerp bijgewerkt');
    } catch (err) {
      flash(err.message, 'bad');
    }
  };

  const handleLoad = (design) => {
    const params = withProfile(design.params);
    record(vaseParams);
    setVaseParams(params);
    savedSnapshot.current = JSON.stringify(params);
    setActive({ id: design.id, name: design.name });
    setLibraryOpen(false);
    flash(`“${design.name}” geladen`);
  };

  const handleRename = (id, name) => {
    setDesigns(updateDesign(id, { name }));
    setActive((prev) => (prev && prev.id === id ? { ...prev, name } : prev));
  };

  const handleDelete = (id) => {
    setDesigns(deleteDesign(id));
    setActive((prev) => (prev && prev.id === id ? null : prev));
  };

  const handleCaptureReady = useCallback((fn) => { captureRef.current = fn; }, []);

  // Opslaan: geen naam nodig, het gaat om hoe de vaas eruit ziet.
  // - Nog geen ontwerp geladen/opgeslagen: gewoon direct opslaan, met een
  //   automatisch gegenereerde naam (die later aangepast kan worden).
  // - Wel een geladen ontwerp, maar niets gewijzigd: niets te doen.
  // - Wel een geladen ontwerp mét wijzigingen: nooit stilzwijgend kiezen —
  //   open de bibliotheek, waar "↻ Bijwerken" (overschrijven) en
  //   "💾 Opslaan als nieuw" naast elkaar staan, zodat je zelf kiest.
  const handleQuickSave = () => {
    if (!active) { handleSave(''); return; }
    if (!dirty) { flash('Geen wijzigingen om op te slaan'); return; }
    setLibraryOpen(true);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">🏺</span>
          <div>
            <h1>Easy 3D printer vase configurator</h1>
            <p>Ontwerp een vaas en download de STL — klaar voor je Bambu Lab P1S</p>
          </div>
        </div>

        <div className="header-actions">
          {active && (
            <span className={`active-design${dirty ? ' dirty' : ''}`} title="Je bewerkt dit opgeslagen ontwerp">
              {dirty ? '✏️' : '📌'} {active.name}{dirty ? ' • gewijzigd' : ''}
            </span>
          )}
          <button
            type="button"
            className="header-button"
            onClick={handleQuickSave}
            title={
              !active
                ? 'Opslaan als nieuw ontwerp, met een automatisch gegenereerde naam'
                : dirty
                  ? 'Wijzigingen gevonden — kies overschrijven of als nieuw opslaan'
                  : 'Geen wijzigingen sinds het laatste opslaan'
            }
          >
            💾 Opslaan
          </button>
          <button type="button" className="header-button" onClick={() => setLibraryOpen(true)}>
            📚 Mijn ontwerpen{designs.length > 0 && <span className="count">{designs.length}</span>}
          </button>
          <ExportButton meshRef={meshRef} params={vaseParams} />
        </div>
      </header>

      <div className="main-content">
        <aside className="controls-panel">
          <VaseControls
            params={vaseParams}
            onParamChange={updateParam}
            onParamsChange={updateParams}
            onUndo={undo}
            onRedo={redo}
            canUndo={steps.undo > 0}
            canRedo={steps.redo > 0}
          />
        </aside>

        <div className="viewer-container">
          <VaseViewer params={vaseParams} onMeshCreated={setMeshRef} onCaptureReady={handleCaptureReady} />
          {printIssues.length > 0 && (
            <div className="print-warning-badge" role="alert" title={printIssues.join(' ')}>
              <strong>⚠️ Waarschuwing</strong>
              {printIssues.map((issue) => <p key={issue}>{issue}</p>)}
            </div>
          )}
          <div className="viewer-info">
            <span>🖱️ slepen = draaien</span>
            <span>⇕ scrollen = zoomen</span>
          </div>
        </div>
      </div>

      <DesignLibrary
        open={libraryOpen}
        designs={designs}
        activeId={active ? active.id : null}
        activeName={active ? active.name : ''}
        dirty={dirty}
        suggestedName={suggestName(vaseParams)}
        onClose={() => setLibraryOpen(false)}
        onSave={handleSave}
        onUpdate={handleUpdate}
        onLoad={handleLoad}
        onRename={handleRename}
        onDuplicate={(id) => setDesigns(duplicateDesign(id))}
        onDelete={handleDelete}
      />

      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </div>
  );
};

export default VaseConfigurator;
