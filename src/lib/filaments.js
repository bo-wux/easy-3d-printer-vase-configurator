/** Filamentkleuren zoals je ze in de winkel koopt, met een realistische render-look. */
export const FILAMENTS = [
  { id: 'jadewit', label: 'Jade White', color: '#f4f5f2' },
  { id: 'ivoor', label: 'Ivoor', color: '#ecdfc4' },
  { id: 'beige', label: 'Zandsteen', color: '#cbb49a' },
  { id: 'grijs', label: 'Grijs', color: '#8b9099' },
  { id: 'antraciet', label: 'Antraciet', color: '#3a3f47' },
  { id: 'zwart', label: 'Zwart', color: '#1b1c1f' },
  { id: 'rood', label: 'Rood', color: '#c8102e' },
  { id: 'terracotta', label: 'Terracotta', color: '#b35a3a' },
  { id: 'oranje', label: 'Oranje', color: '#f26522' },
  { id: 'geel', label: 'Geel', color: '#f5c518' },
  { id: 'groen', label: 'Bambu Green', color: '#00ae42' },
  { id: 'mint', label: 'Mint', color: '#8ed6b6' },
  { id: 'cyaan', label: 'Cyaan', color: '#2fb4c6' },
  { id: 'blauw', label: 'Blauw', color: '#1554c0' },
  { id: 'paars', label: 'Paars', color: '#7a4bd0' },
  { id: 'roze', label: 'Roze', color: '#ef8fb5' },
  { id: 'zilver', label: 'Zilver', color: '#c6cbd2' },
  { id: 'goud', label: 'Goud', color: '#c9a227' },
];

/** Afwerking bepaalt hoe het licht op het materiaal reageert. */
export const FINISHES = [
  { id: 'mat', label: 'Mat PLA', roughness: 0.95, metalness: 0.0, clearcoat: 0.0, sheen: 0.35 },
  { id: 'basic', label: 'Basic PLA', roughness: 0.55, metalness: 0.04, clearcoat: 0.15, sheen: 0.1 },
  { id: 'silk', label: 'Silk', roughness: 0.16, metalness: 0.7, clearcoat: 0.7, sheen: 0.0 },
];

export const getFilament = (id) => FILAMENTS.find((f) => f.id === id) || FILAMENTS[0];
export const getFinish = (id) => FINISHES.find((f) => f.id === id) || FINISHES[1];
