import { DECOR_PRESETS, PATTERN_SHAPES, maxProfileDiameter } from './vaseShape';

const KEY = 'evc.designs.v1';
const DRAFT_KEY = 'evc.draft.v1';
const ACTIVE_KEY = 'evc.active.v1';
// aantal ontwerpen dat zijn preview mag houden als de opslag vol raakt
const KEEP_THUMBS = 8;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const maxDiameterOf = (p) => maxProfileDiameter(p);

export const loadDesigns = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((d) => d && typeof d === 'object' && d.params && typeof d.params === 'object')
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return [];
  }
};

const persist = (list) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return list;
  } catch {
    // opslag vol: previews van oudere ontwerpen opofferen, de data zelf blijft
    const trimmed = list.map((d, i) => (i < KEEP_THUMBS ? d : { ...d, thumb: null }));
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      throw new Error('De opslag van je browser is vol. Verwijder een paar ontwerpen.');
    }
  }
};

const uniqueName = (name, list) => {
  if (!list.some((d) => d.name === name)) return name;
  let n = 2;
  while (list.some((d) => d.name === `${name} ${n}`)) n += 1;
  return `${name} ${n}`;
};

export const saveDesign = (name, params, thumb) => {
  const existing = loadDesigns();
  const design = {
    id: newId(),
    name: uniqueName((name || '').trim() || suggestName(params), existing),
    params: { ...params },
    thumb: thumb || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const list = persist([design, ...existing]);
  return { list, design: list.find((d) => d.id === design.id) || design };
};

export const updateDesign = (id, patch) => {
  const list = loadDesigns().map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d));
  return persist(list.sort((a, b) => b.updatedAt - a.updatedAt));
};

export const duplicateDesign = (id) => {
  const src = loadDesigns().find((d) => d.id === id);
  if (!src) return loadDesigns();
  const copy = { ...src, id: newId(), name: `${src.name} (kopie)`, createdAt: Date.now(), updatedAt: Date.now() };
  return persist([copy, ...loadDesigns()]);
};

export const deleteDesign = (id) => persist(loadDesigns().filter((d) => d.id !== id));

/** Naam op basis van de stijl en de maten, bv. "Schubben 88×180". */
export const suggestName = (params) => {
  const preset = DECOR_PRESETS.find(
    (p) => p.id !== 'glad' && Object.entries(p.values).every(([k, v]) => params[k] === v)
  );
  const pattern = PATTERN_SHAPES.find((s) => s.id === params.patternShape);
  const style = preset ? preset.label : params.waveAmplitude > 0 && pattern ? pattern.label : 'Vaas';
  const clean = style.replace(/^[^\p{L}]+/u, '').trim();
  return `${clean} ${Math.round(maxDiameterOf(params))}×${Math.round(params.height)}`;
};

export const saveDraft = (params) => {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(params));
  } catch {
    /* geen ruimte: het concept overleeft dan gewoon geen refresh */
  }
};

export const loadDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
};

export const saveActiveId = (id) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* niet kritiek */
  }
};

export const loadActiveId = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
