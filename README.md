# Easy 3D Printer Vase Configurator

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Three.js-170-FFFFFF?logo=three.js&logoColor=black" alt="Three.js" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/STL-Export-4CAF50" alt="STL export" />
</p>

A browser-based tool for designing custom, printable vase forms. Adjust the silhouette, generate decorative patterns, tune organic shapes, and export the final STL directly from the app.

<div align="center">
  <img src="screenshots/app-overview.png" alt="3D vase configurator overview" width="1100" />
</div>

## Overview

This project turns vase design into a fast, visual workflow. Instead of moving between CAD tools and slicer setup, you can iterate on proportions, surface details, decorative patterns, and printability directly in the browser before exporting a model for 3D printing.

The interface is in Dutch. Everything runs client-side: no account, no server, no upload.

## Features

### Shape

- Real-time 3D preview while editing, with turntable and print-bed grid
- 8 silhouette presets (urn, tulip, jug, hourglass, bud, column, cone, tapered) plus a drag-and-drop profile editor: add, move and delete control points, snap with Shift, nudge with the arrow keys
- Cross-section editor with 11 presets (round, oval, triangle … star, flower, lobed, free-form), adjustable side count, 1×–12× rotational symmetry and mirroring inside the sector

### Decoration

- 20 decor presets and 8 pattern profiles (wave, rib, flute, star, panel, saw, spike, cable) with repeat count and depth
- Twist (continuous or back-and-forth), facets and horizontal rings
- 6 surface textures, bump grids with staggered rows, and a wavy rim
- Organic mode: seeded harmonic deformation with detail, flow and sway controls for asymmetric, sculptural forms
- 🎲 Surprise me generates a complete random design, including a random filament colour and finish

### Print and export

- Binary STL export straight from the browser, rotated Z-up with the bottom flat on the build plate, named `vaas_H..._D..._W....stl`
- Vase mode export: a single-wall solid for the spiral/vase mode of your slicer
- Wall thickness 0.8–2.4 mm (0.8 mm = one nozzle line, 1.2 mm = three lines on a 0.4 mm nozzle)
- "Keep printable" scales decoration back automatically until the steepest wall stays within your maximum overhang, with a live status bar showing overhang, layer count and fit on the build plate
- Filament colour and finish preview (matte, basic, silk)
- Bambu Lab P1S defaults: 256 mm bed, max 250 mm height, max 220 mm diameter, 0.4 mm nozzle

### Workflow

- Design library: save, update, rename, duplicate and delete designs with thumbnails, stored in `localStorage`
- Automatic draft autosave, so a refresh never loses your work
- Undo/redo with `Ctrl+Z` / `Ctrl+Shift+Z`

## Screenshots

<div align="center">
  <img src="screenshots/app-overview.png" alt="Main configurator overview" width="980" />
  <br /><br />
  <img src="screenshots/viewer-detail.png" alt="Detailed 3D vase viewer" width="980" />
</div>

## Why this project

The goal is to make custom vase design accessible, fast, and flexible for makers. It is ideal for:

- decorative home objects
- custom gifts and one-off pieces
- maker-lab experiments
- rapid prototyping of printable vase forms

## Tech stack

- React 18
- Vite
- Three.js
- @react-three/fiber
- @react-three/drei

## Getting started

### 1) Clone the repository

```bash
git clone https://github.com/bo-wux/easy-3d-printer-vase-configurator.git
cd easy-3d-printer-vase-configurator
```

### 2) Install dependencies

```bash
npm install
```

### 3) Run locally

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

### 4) Build for production

```bash
npm run build
```

The build output is generated in the `dist` folder.

## How it works

Every vase is a single radius function `r(angle, height)` around an optionally displaced centre line. Because of that, each layer is a closed, non-self-intersecting loop by definition, which is exactly what an FDM slicer needs. The layers of the shape are stacked in order: silhouette → pattern → facets → rings → organic harmonics → sway.

The inner wall is not a simple radial offset but a true erosion of the outer contour, so decoration can never push the inside through the outside. The exported mesh is watertight, has a flat first layer at Z=0 and keeps at least one nozzle width of material everywhere.

## Quality checks

Two Node scripts rebuild the exact export geometry and validate it, so no slicer surprises:

```bash
# Full printability suite: watertightness, volume, bed limits and
# virtual slicing per layer (closed contours, no self-intersections,
# wall thickness vs. nozzle width, single contour in vase mode)
node scripts/check-stl.mjs --layers=9

# Optional: only run cases matching a name
node scripts/check-stl.mjs --filter=twist

# Lighter mesh-only topology check
node scripts/check-mesh.mjs
```

`check-stl.mjs` exits with code 1 when a case fails.

## Project structure

```text
src/
├── components/
│   ├── DesignLibrary.jsx    saved designs (localStorage)
│   ├── ExportButton.jsx     binary STL export
│   ├── PresetThumb.jsx      preset preview icons
│   ├── ProfileEditor.jsx    silhouette control points
│   ├── SectionEditor.jsx    cross-section editor
│   ├── VaseConfigurator.jsx app state, undo/redo, autosave
│   ├── VaseControls.jsx     all control panels
│   └── VaseViewer.jsx       three.js viewer
├── lib/
│   ├── designStore.js       localStorage persistence
│   ├── filaments.js         filament colours and finishes
│   ├── vaseMesh.js          shape -> three.js geometry
│   └── vaseShape.js         parametric shape maths and presets
├── index.css
└── main.jsx

scripts/
├── check-mesh.mjs           mesh topology check
└── check-stl.mjs            printability suite
```

## License

This project is open source and intended for maker and 3D-print workflows.

## Credits

Built for fast visual iteration in the design of custom 3D-printable vases.
