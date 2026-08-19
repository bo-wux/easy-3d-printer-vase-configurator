# Easy 3D Printer Vase Configurator

Een moderne webapp voor het ontwerpen, aanpassen en exporteren van 3D-printbare vazen. De configurator draait volledig in de browser en genereert een printable STL-directie voor je 3D-printer.

<div align="center">
  <img src="screenshots/app-overview.png" alt="3D vase configurator overview" width="1000" />
</div>

## Highlights

- Real-time 3D preview van de vaasvorm
- Aanpasbare parameters zoals hoogte, diameter, wanddikte en twist
- Print preview en visuele controle van de geometrie
- STL export voor 3D-printen direct vanuit de browser
- Responsive interface voor snel itereren op ontwerpkeuzes

## Screenshots

<div align="center">
  <img src="screenshots/app-overview.png" alt="Main configurator view" width="900" />
  <br /><br />
  <img src="screenshots/viewer-detail.png" alt="3D viewer detail" width="900" />
</div>

## Features

- Hoek- en vorminstellingen voor unieke vaasprofielen
- Regelbare wall thickness en print parameters
- Realistische 3D rendering met React Three Fiber
- Directe STL-download zonder server-side exporttool
- Geschikt voor MakerLab- of Bambu Lab workflows

## Tech Stack

- React 18
- Vite
- Three.js
- @react-three/fiber
- @react-three/drei

## Installatie

1. Clone de repository:

```bash
git clone https://github.com/bo-wux/easy-3d-printer-vase-configurator.git
cd easy-3d-printer-vase-configurator
```

2. Installeer dependencies:

```bash
npm install
```

3. Start de development server:

```bash
npm run dev
```

4. Open de app in je browser op:

```text
http://localhost:3000
```

## Build voor productie

```bash
npm run build
```

De build wordt gegenereerd in de `dist` map.

## Gebruik

- Pas de vorm aan met de sliders in het linkerpaneel
- Bekijk de vaas direct in 3D
- Zoom en draai in de viewer om verschillende hoeken te inspecteren
- Klik op de exportknop om een STL-bestand te downloaden

## Projectstructuur

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

## Licentie

Dit project is open source en bedoeld voor MakerLab- en 3D-printprojecten.

## Credits

Gemaakt voor een snelle en visuele workflow voor het ontwerpen van unieke 3D-printbare vazen.
