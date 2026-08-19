import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VaseControls from './VaseControls';
import VaseViewer from './VaseViewer';
import ExportButton from './ExportButton';
import DesignLibrary from './DesignLibrary';
import { DEFAULT_SHAPE } from '../lib/vaseShape';
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
};

const VaseConfigurator = () => {
  const [vaseParams, setVaseParams] = useState(() => ({ ...BASE_PARAMS, ...(loadDraft() || {}) }));
  const [meshRef, setMeshRef] = useState(null);
  const [designs, setDesigns] = useState(() => loadDesigns());
  const [library, setLibrary] = useState({ open: false, focusSave: false });
  const [active, setActive] = useState(null);
  const [toast, setToast] = useState(null);

  const captureRef = useRef(null);
  const savedSnapshot = useRef(null);

  const updateParam = (param, value) => {
    setVaseParams((prev) => ({
      ...prev,
      [param]: typeof value === 'boolean' || typeof value === 'number'
        ? value
        : (isNaN(parseFloat(value)) ? value : parseFloat(value)),
    }));
  };

  // Meerdere parameters tegelijk (presets, randomizer)
  const updateParams = (values) => {
    setVaseParams((prev) => ({ ...prev, ...values }));
  };

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
      setLibrary({ open: true, focusSave: false });
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
    const params = { ...BASE_PARAMS, ...design.params };
    setVaseParams(params);
    savedSnapshot.current = JSON.stringify(params);
    setActive({ id: design.id, name: design.name });
    setLibrary({ open: false, focusSave: false });
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
            <span className={`active-design${dirty ? ' dirty' : ''}`}>
              {active.name}{dirty ? ' • gewijzigd' : ''}
            </span>
          )}
          <button type="button" className="header-button" onClick={() => setLibrary({ open: true, focusSave: true })}>
            💾 Opslaan
          </button>
          <button type="button" className="header-button" onClick={() => setLibrary({ open: true, focusSave: false })}>
            📚 Mijn ontwerpen{designs.length > 0 && <span className="count">{designs.length}</span>}
          </button>
        </div>
      </header>

      <div className="main-content">
        <aside className="controls-panel">
          <VaseControls
            params={vaseParams}
            onParamChange={updateParam}
            onParamsChange={updateParams}
          />
          <ExportButton meshRef={meshRef} params={vaseParams} />
        </aside>

        <div className="viewer-container">
          <VaseViewer params={vaseParams} onMeshCreated={setMeshRef} onCaptureReady={handleCaptureReady} />
          <div className="viewer-info">
            <span>🖱️ slepen = draaien</span>
            <span>⇕ scrollen = zoomen</span>
          </div>
        </div>
      </div>

      <DesignLibrary
        open={library.open}
        autoFocusSave={library.focusSave}
        designs={designs}
        activeId={active ? active.id : null}
        activeName={active ? active.name : ''}
        dirty={dirty}
        suggestedName={suggestName(vaseParams)}
        onClose={() => setLibrary({ open: false, focusSave: false })}
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
