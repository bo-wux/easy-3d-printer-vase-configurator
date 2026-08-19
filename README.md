# 🏺 3D Vase Configurator - MakerLab Edition

Een moderne, volledig functionele Single Page Application (SPA) voor het ontwerpen en exporteren van 3D-printbare vazen.

## ✨ Features

- **Real-time 3D Rendering**: Direct visuele feedback met Three.js
- **4 Aanpasbare Parameters**:
  - 📏 Hoogte (50-300mm)
  - ⭕ Diameter (50-200mm)
  - 🧱 Wanddikte (0.4-4.0mm) - optimaal voor 3D printing
  - 🌀 Twist Effect (0-360°) - MakerLab signature look
- **STL Export**: Direct downloadbaar voor 3D printers
- **Interactieve 3D View**: Rotate, zoom en pan met je muis
- **Modern UI**: Clean, gradient design met responsive controls

## 🚀 Installatie & Start

### Stap 1: Installeer Dependencies

Open een terminal in deze folder en voer uit:

```powershell
npm install
```

### Stap 2: Start Development Server

```powershell
npm run dev
```

De applicatie opent automatisch in je browser op `http://localhost:3000`

### Stap 3: Begin met Ontwerpen!

- Gebruik de sliders in het linkerpaneel om je vaas vorm te geven
- Rotate de 3D view met je muis
- Zoom met je scroll wheel
- Klik op "Download .STL for 3D Printing" om te exporteren

## 📦 Build voor Productie

Om een productie-build te maken:

```powershell
npm run build
```

De geoptimaliseerde bestanden komen in de `dist` folder.

## 🛠️ Technische Details

### Tech Stack

- **React 18** - UI Framework
- **Vite** - Snelle development & build tool
- **Three.js** - 3D Rendering engine
- **@react-three/fiber** - React renderer voor Three.js
- **@react-three/drei** - Helpers (OrbitControls, Environment)

### Architectuur

```
src/
├── components/
│   ├── VaseConfigurator.jsx    # Hoofd component (state management)
│   ├── VaseControls.jsx        # UI controls (sliders)
│   ├── VaseViewer.jsx          # 3D rendering & geometrie
│   └── ExportButton.jsx        # STL export functionaliteit
├── main.jsx                    # App entry point
└── index.css                   # Global styles
```

### Geometrie Generatie

De vaas wordt gegenereerd met **LatheGeometry** principe:
- Een 2D profiel wordt geroteerd rond de Y-as
- Inner en outer surfaces voor realistische wanddikte
- Twist effect wordt toegepast via vertex manipulation
- Geometry wordt automatisch gecentreerd

### STL Export

- Gebruikt Three.js's officiële `STLExporter`
- Binary STL format voor kleinere bestanden
- Bestandsnaam bevat alle parameters voor tracering
- Direct browser download zonder server

## 🎨 Customization

### Kleuren aanpassen

In `VaseViewer.jsx`, regel 170:

```jsx
<meshStandardMaterial 
  color="#8b9dc3"  // Wijzig deze hex color
  metalness={0.3}
  roughness={0.4}
/>
```

### Parameter ranges aanpassen

In `VaseControls.jsx`, pas de `controls` array aan (regels 6-35).

### Vaas vorm aanpassen

In `VaseViewer.jsx`, functie `createVaseGeometry`, regels 27-43:
- Wijzig de `radiusFactor` berekening voor andere vormen
- Experimenteer met sine/cosine functies voor organische vormen

## 🐛 Troubleshooting

### "Cannot find module" errors
```powershell
rm -rf node_modules
npm install
```

### Port 3000 is al in gebruik
Wijzig in `vite.config.js`:
```js
server: {
  port: 3001,  // Gebruik een andere port
  open: true
}
```

### STL export werkt niet
- Check de browser console voor errors
- Zorg dat de vaas zichtbaar is in de 3D view
- Probeer een andere browser (Chrome/Edge recommended)

## 📝 Licentie

Open source - gebruik voor je MakerLab projecten! 🚀

---

**Gemaakt met ❤️ voor MakerLab - Where Makers Meet Magic**
