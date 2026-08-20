import React, { useEffect, useRef, useState } from 'react';
import { maxDiameterOf } from '../lib/designStore';
import { getFilament } from '../lib/filaments';

const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const day = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
};

const DesignCard = ({ design, active, onLoad, onRename, onDuplicate, onDelete }) => {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(design.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const filament = getFilament(design.params.filament);

  const commit = () => {
    setRenaming(false);
    const next = draftName.trim();
    if (next && next !== design.name) onRename(design.id, next);
    else setDraftName(design.name);
  };

  return (
    <div className={`design-card${active ? ' active' : ''}`}>
      <button type="button" className="design-thumb" onClick={() => onLoad(design)} title="Klik om te laden">
        {design.thumb ? <img src={design.thumb} alt={design.name} /> : <span className="design-thumb-fallback">🏺</span>}
        <span className="design-load">↧ Laden</span>
        {active && <span className="design-badge">In bewerking</span>}
      </button>

      <div className="design-body">
        {renaming ? (
          <input
            className="design-rename"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraftName(design.name); setRenaming(false); }
            }}
          />
        ) : (
          <span className="design-name" title={design.name}>{design.name}</span>
        )}
        <span className="design-meta">
          <i className="design-dot" style={{ background: filament.color }} />
          Ø{Math.round(maxDiameterOf(design.params))} × {Math.round(design.params.height)}mm · {formatDate(design.updatedAt)}
        </span>
        <div className="design-actions">
          <button type="button" onClick={() => setRenaming(true)}>Naam</button>
          <button type="button" onClick={() => onDuplicate(design.id)}>Kopie</button>
          <button
            type="button"
            className={confirmDelete ? 'danger' : ''}
            onClick={() => (confirmDelete ? onDelete(design.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Zeker?' : 'Wis'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DesignLibrary = ({
  open, designs, activeId, activeName, dirty, suggestedName,
  onClose, onSave, onUpdate, onLoad, onRename, onDuplicate, onDelete,
}) => {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  // via een ref, zodat een wijziging in de vaas het typen in het naamveld niet overschrijft
  const seedRef = useRef('');
  seedRef.current = suggestedName;

  useEffect(() => {
    if (!open) return;
    setName(seedRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => onSave(name);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Mijn ontwerpen">
        <div className="modal-head">
          <div>
            <h2>Mijn ontwerpen</h2>
            <p>{designs.length === 0 ? 'Nog niets opgeslagen' : `${designs.length} opgeslagen in deze browser`}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Sluiten">✕</button>
        </div>

        <div className="save-row">
          <input
            ref={inputRef}
            className="save-input"
            value={name}
            placeholder="Naam (optioneel)"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {activeId && (
            <button
              type="button"
              className="action-button"
              onClick={onUpdate}
              disabled={!dirty}
              title={`“${activeName}” overschrijven met de huidige vaas`}
            >
              ↻ Bijwerken
            </button>
          )}
          <button type="button" className="action-button primary" onClick={submit}>
            💾 {activeId ? 'Opslaan als nieuw' : 'Opslaan'}
          </button>
        </div>

        {designs.length === 0 ? (
          <div className="design-empty">
            <span>🏺</span>
            <p>Bewaar je favoriete instellingen hier en laad ze later met één klik terug.</p>
          </div>
        ) : (
          <div className="design-grid">
            {designs.map((d) => (
              <DesignCard
                key={d.id}
                design={d}
                active={d.id === activeId}
                onLoad={onLoad}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DesignLibrary;
