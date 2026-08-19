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

## Features

- Real-time 3D preview of the vase while editing
- Adjustable body shape and silhouette controls
- Pattern and twist options for decorative surfaces
- Organic deformation tools for more sculptural forms
- Printability-aware settings to reduce steep overhangs and support issues
- STL export for direct use with Bambu Studio, Cura, PrusaSlicer, and similar slicers

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

The configurator builds a parametric vase profile, adds surface features and organic variation, and validates the result against printability constraints before export. This keeps the form expressive while helping maintain practical 3D-printing stability.

## Project structure

```text
src/
├── components/
│   ├── ExportButton.jsx
│   ├── PrintPreview.jsx
│   ├── VaseConfigurator.jsx
│   ├── VaseControls.jsx
│   └── VaseViewer.jsx
├── lib/
│   └── vaseShape.js
├── index.css
├── main.jsx
└── ...
```

## License

This project is open source and intended for maker and 3D-print workflows.

## Credits

Built for fast visual iteration in the design of custom 3D-printable vases.
