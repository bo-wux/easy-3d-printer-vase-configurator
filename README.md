# Easy 3D Printer Vase Configurator

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Three.js-170-FFFFFF?logo=three.js&logoColor=black" alt="Three.js" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/STL-Export-4CAF50" alt="STL export" />
</p>

A polished web app for designing custom 3D printable vase shapes directly in the browser. Adjust the silhouette, surface pattern, twist, organic flow, and printability limits, then export the final model as an STL file ready for your 3D printer.

<div align="center">
  <img src="screenshots/app-overview.png" alt="3D vase configurator overview" width="1100" />
</div>

## Why this project

This project was created to make custom vase design faster, more visual, and more approachable. Instead of jumping between CAD tools and print preparation workflows, you can iterate on shape, density, pattern, and stability in one place and export the final file without leaving the browser.

## What you can do

- Shape the vase with profile controls for height, opening, belly, shoulders, and wall thickness
- Generate pattern styles like ribs, grooves, rings, facets, waves, and twist-based design
- Apply organic deformation for more natural and artistic silhouettes
- Tune printability constraints to reduce steep overhangs and improve stability
- Preview the object in real time in a 3D viewer
- Export the finished design as STL directly from the app

## Screenshots

<div align="center">
  <img src="screenshots/app-overview.png" alt="Main configurator overview" width="980" />
  <br /><br />
  <img src="screenshots/viewer-detail.png" alt="Detailed 3D vase viewer" width="980" />
</div>

## Features

- Real-time 3D preview of the vase while editing
- Multiple silhouette presets and custom control points
- Symmetrical pattern generation for ribs, waves, grooves, stars, and rings
- Organic styling with asymmetry, flow, and seed-based variation
- Material and finish settings for a more realistic look
- Browser-based STL export for maker workflows and quick production iterations

## Tech stack

- React 18
- Vite
- Three.js
- @react-three/fiber
- @react-three/drei

## Installation

1. Clone the repository:

```bash
git clone https://github.com/bo-wux/easy-3d-printer-vase-configurator.git
cd easy-3d-printer-vase-configurator
```

2. Install dependencies:

```bash
npm install
```

3. Start the app in development mode:

```bash
npm run dev
```

4. Open the app in your browser:

```text
http://localhost:3000
```

## Production build

```bash
npm run build
```

The build output is placed in the `dist` directory.

## How to use it

- Use the left-side controls to define the vase profile and proportions
- Switch between silhouette presets to quickly explore different shapes
- Fine-tune pattern, twist, and organic controls for a more unique design
- Use printability settings to keep the structure more stable and printable
- Rotate and zoom the model in the 3D viewer to inspect it from every angle
- Click the export button to download the generated STL file

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
├── App.jsx
└── ...
```

## Design notes

The geometry is generated with a parametric model tailored for 3D-printable vase forms. This means the vessel is built from a consistent profile, then refined with patterning and organic deformation while staying compatible with typical FDM printing constraints.

It is especially useful for:

- decorative home objects
- custom one-off gifts
- small maker lab experiments
- rapid exploration of printable bottle and vase forms

## License

This project is open source and intended for maker and 3D-print workflows.

## Credits

Built for fast, visual iteration in the creation of elegant and functional custom 3D-printable vases.
