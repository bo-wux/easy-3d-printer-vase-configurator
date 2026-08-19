# Easy 3D Printer Vase Configurator

A browser-based design tool for creating custom, printable vase shapes for 3D printers. It lets you adjust the silhouette, surface pattern, printability constraints, and export the final model as an STL file directly from the app.

<div align="center">
  <img src="screenshots/app-overview.png" alt="3D vase configurator overview" width="1000" />
</div>

## Why this project exists

This project was built to make vase design faster and more visual for makers who want to iterate on shape, proportions, and printability without leaving the browser. Instead of manually editing geometry in CAD software, you can tweak parameters, preview the model in 3D, and export a ready-to-print result in a few clicks.

## Highlights

- Real-time 3D preview of the vase as you edit it
- Adjustable shape controls for height, base, opening, wall thickness, and more
- Multiple style presets and pattern generations for unique results
- Printability-aware settings to reduce overhang and improve stability
- STL export directly from the browser for desktop or Bambu Lab workflows
- Responsive UI for quick experimentation and iteration

## Screenshots

<div align="center">
  <img src="screenshots/app-overview.png" alt="Main configurator view" width="900" />
  <br /><br />
  <img src="screenshots/viewer-detail.png" alt="3D viewer detail" width="900" />
</div>

## Features

- Custom vase profiles with variable proportions
- Symmetrical pattern controls for ribs, grooves, rings, and twist effects
- Organic deformation options for more natural-looking shapes
- Visual print preview and material styling controls
- Browser-based STL export without a backend
- Optimized for maker workflows and small-batch 3D printing

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

3. Start the development server:

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

The optimized build output is generated in the `dist` folder.

## How to use it

- Adjust the basic silhouette using the sliders on the left
- Switch between different vase types and design styles
- Tune the pattern and organic deformation controls for a more custom look
- Review the model in the 3D viewport and inspect it from multiple angles
- Click the export button to download the generated STL for printing

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

## Design and printing notes

The app is designed to help generate functional vase geometry with a strong focus on printability. Profile parameters, overhang limits, and material styling are all visible in the interface, so the model can be adjusted quickly before export.

This makes it useful for:

- decorative vase concepts
- quick iteration on proportions
- custom gifts and one-off pieces
- maker lab experimentation with printable geometry

## License

This project is open source and intended for maker and 3D-print workflows.

## Credits

Built for fast, visual iteration in the design of custom 3D-printable vases.
