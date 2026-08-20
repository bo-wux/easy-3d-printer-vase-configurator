# Easy 3D Printer Vase Configurator

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/Three.js-170-FFFFFF?logo=three.js&logoColor=black" alt="Three.js" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/STL-Export-4CAF50" alt="STL export" />
</p>

A deep, browser-based vase designer for FDM 3D printing. Shape the silhouette
with Bézier handles, stack decoration from fifteen pattern profiles, eight
textures and seeded organic deformation, and export a watertight STL — all
without leaving the page.

Everything runs client-side: no account, no server, no upload. The interface is
in Dutch.

<div align="center">
  <img src="screenshots/app-overview.png" alt="3D vase configurator overview" width="1100" />
</div>

## What makes it different

Most parametric vase generators give you a handful of sliders and leave
printability to you. This one is built the other way around: **every shape it
can produce is a shape a slicer can handle**, and it tells you when it can't.

- The geometry is a single radius function `r(angle, height)`, so every printed
  layer is a closed, non-self-intersecting loop *by construction* — the failure
  mode where a vase slices into confetti simply cannot occur.
- The inner wall is a true erosion of the outer contour, not a radial offset, so
  deep relief can never push the inside through the outside.
- An automatic limiter scales decoration back until the steepest wall stays
  within your overhang budget, and a badge over the preview warns you when the
  silhouette itself is too steep or the vase no longer fits the build plate.
- A Node test suite rebuilds the actual exported bytes for 100+ configurations
  and virtually slices them, so regressions get caught before a printer does.

## The design surface

### Shape — silhouette with pen-tool curves

Fourteen silhouette presets (urn, tulip, jug, hourglass, bud, column, cone,
tapered, bottle, amphora, sphere, trumpet, carafe, gourd) are starting points,
not limits. Underneath sits a full profile editor:

- Drag control points, add them with a double-click or the pen tool, delete with
  `Delete`. Hold `Shift` to snap, use the arrow keys to nudge by 1 mm or 1 %.
- **Each point carries in/out curve handles, like the pen tool in a drawing
  program.** Drag a handle away from its point and the bend becomes fuller; drag
  it closer and the transition sharpens. Double-click resets it.
- The default handle position sits a third along each segment, horizontally —
  the exact configuration where the cubic Bézier reduces to the smoothstep the
  editor used before it had handles, so designs made without touching a handle
  keep precisely the shape they always had.
- The two handles in a segment are scaled back if they would overlap, which
  keeps height monotonic: one height can never map to two diameters.

### Cross-section — the shape seen from above

Fourteen presets, from round and oval through polygons (3–24 sides) to star,
flower, lobed, gear, scalloped and egg, plus free-hand drawing. The side count
is a slider, so a hexagon becomes a 24-gon without leaving the preset.

Drawing is symmetry-aware: pick 1× (free), 2×, 3×, 4×, 5×, 6×, 8× or 12× and you
only draw one sector while the rest is mirrored or copied around. Right-click a
point to switch it between rounded and hard-cornered. The largest radius always
normalises to the silhouette diameter, so changing the cross-section never
changes how wide the vase actually is.

### Pattern — large repeating relief

Fifteen profiles, each a different way of going around the vase:

| | |
|---|---|
| **Golf** | plain sine wave |
| **Ribbel** / **Groef** | rounded ribs / hollow flutes |
| **Ster** | triangle wave, sharp points |
| **Paneel** | flat panels with soft transitions |
| **Zaag** | sawtooth: steep flank, gentle slope |
| **Punt** / **Kerf** | narrow raised ridges / narrow deep notches |
| **Kabel** | rope-like double lobe per repeat |
| **Trap** | stepped terraces |
| **Schelp** | asymmetric shell wave |
| **Bol** | full, rounded lobes |
| **Vlecht** | two counter-rotating strands, the upper one crossing over |
| **Diamant** | the same two strands multiplied into diamond facets |
| **Visgraat** | a slope that tilts back and forth, herringbone-style |

The last three vary with height as well as angle — that is what makes a real
braid possible, since something has to run clockwise *and* counter-clockwise.
Their vertical repeat is deliberately stretched to long diagonals rather than
square cells: square cells climb so fast that the auto-limiter clamps the relief
to a quarter of what you asked for.

On top of the profile: **repeat count** and **depth**, a **twist** (continuous or
back-and-forth with 1–4 turning points), **facets** for a polygonal body, and
horizontal **rings**.

### Texture — fine surface relief

Eight textures — fine lines, diamond crosshatch, studs, scales, woven, rough,
diagonal and hammered — with adjustable fineness and depth. Texture stacks *on
top of* the pattern rather than replacing it, which the panel says out loud so
the combination is a choice and not a surprise.

Also here: a **bump grid** (columns × rows, staggered or aligned, positive for
knobs and negative for dimples) and a **wavy rim** that dips the opening in a
scallop.

### Organic — irregular, hand-pinched forms

Seeded harmonic deformation for shapes that don't look computed:

- **Vervorming** — how far the wall strays from round
- **Detail** — few large bulges or many small ones
- **Verloop** — how much the deformation drifts as it climbs
- **Scheefheid** and **Scheef draai** — the centre line itself wanders, so the
  vase leans or spirals while its foot stays flat and stable
- **Seed** — the same seed always gives the same vase; a new one reshuffles it

### Style presets

Thirty-two one-click looks. Each preset declares which tab it drives and only
appears there, so an organic style is not hiding under Pattern and adjusting a
texture style means looking exactly where you picked it. Every preset replaces
all decoration — the panel says so — and *Glad* clears everything.

### Surprise me

🎲 generates a complete design: silhouette, proportions, cross-section, one
coherent decoration style, filament colour and finish. Height is drawn first and
the belly derived from it, so sizes actually spread across 90–250 mm instead of
piling up against the printer's limit. If a draw comes out too steep, it is made
more slender before its diameters are flattened — flattening turns a
characterful shape into a cylinder.

## Printing and export

- **Binary STL**, rotated Z-up with a flat first layer at Z = 0, named
  `vaas_H<height>_D<diameter>_W<wall>.stl`
- **Vase mode export** produces a solid body with no inner wall, for the
  spiral/vase mode of your slicer. A wavy rim stays flat in this mode: a single
  continuous spiral cannot print separate tongues.
- **Wall thickness** 0.8–2.4 mm — 0.8 mm is one nozzle line, 1.2 mm is three
  lines on a 0.4 mm nozzle
- **Auto printbaar houden** scales decoration until the steepest wall respects
  your maximum overhang (15–60°). The status bar reports how far it scaled back.
- **Warnings** appear as a badge over the preview when the overhang exceeds the
  limit, the vase outgrows the build volume, or the safety limiter is switched
  off — the same conditions that make Bambu Studio complain about floating
  regions.
- 18 filament colours and matte / basic / silk finishes, for preview only:
  colour is not part of an STL, and on a single-nozzle printer the filament in
  the machine decides the colour.
- Defaults target a **Bambu Lab P1S**: 256 mm bed, 250 mm maximum height, 220 mm
  maximum diameter, 0.4 mm nozzle.

## Workflow

- **Design library** in `localStorage`: save, update, rename, duplicate, delete.
  Saving needs no name — one click stores it under a generated one like
  “Schubben 88×180”. Designs are never silently evicted; if browser storage
  fills up, older previews are dropped before any design is.
- The header shows whether you are editing a saved design (📌) and whether it has
  unsaved changes (✏️). Saving a modified design asks whether to overwrite or
  store it as a new one rather than guessing.
- **Draft autosave**, so a refresh never loses work in progress.
- **Undo/redo** with `Ctrl+Z` / `Ctrl+Shift+Z`, coalescing rapid slider drags
  into single steps.

## Performance

A heavily decorated vase costs hundreds of milliseconds to evaluate, and three
places need it at once (control panel, warning badge, mesh builder). A keyed
cache gives them one shared build, so changing filament or finish costs nothing.
The viewer and readouts run from a `useDeferredValue` snapshot, which keeps
slider dragging smooth and shows a “Bezig met bijwerken” indicator while the
preview catches up.

## Screenshots

<div align="center">
  <img src="screenshots/app-overview.png" alt="Main configurator overview" width="980" />
  <br /><br />
  <img src="screenshots/viewer-detail.png" alt="Detailed 3D vase viewer" width="980" />
</div>

## Getting started

```bash
git clone https://github.com/bo-wux/easy-3d-printer-vase-configurator.git
cd easy-3d-printer-vase-configurator
npm install
npm run dev          # http://localhost:3000
npm run build        # production build in dist/
```

> Serving the folder through Apache/nginx directly will show a blank page: this
> is a Vite project, and `index.html` references `/src/main.jsx`, which needs the
> dev server or a build.

## How it works

Every vase is a radius function `r(angle, height)` around an optionally
displaced centre line, evaluated in a fixed order:

```text
silhouette (Bézier profile)
  → cross-section field
    → pattern + facets + rings
      → bump grid + texture
        → organic harmonics
          → sway of the centre line
```

Because the result is single-valued in angle for every height, each layer is a
closed loop that a slicer can fill. The first few millimetres fade decoration in
from zero so the base sits flat on the plate, and the fade length grows with the
depth of the relief so the transition itself never exceeds the overhang limit.

The inner wall is computed by eroding the outer contour against the actual mesh
segments — not by subtracting a radius — which is what keeps sharp or steep
decoration from punching through to the inside.

## Quality checks

Two Node scripts rebuild the exact export geometry and validate it:

```bash
# Full printability suite: watertightness, consistent winding, positive volume,
# flat bottom at Z=0, build-volume limits, and virtual slicing per layer
# (closed contours, no self-intersections, wall thickness vs. nozzle width,
# exactly one contour in vase mode)
node scripts/check-stl.mjs --layers=9

# Only cases matching a name
node scripts/check-stl.mjs --filter=vlecht

# Lighter mesh-only topology check
node scripts/check-mesh.mjs
```

The suite covers every silhouette, cross-section, pattern profile, texture and
style preset, plus hand-tuned curve extremes and randomised designs — 118 cases.
It exits with code 1 on failure. One case fails by design: *alles zonder limiet*
deliberately switches off the safety limiter to prove it is doing something.

## Project structure

```text
src/
├── components/
│   ├── DesignLibrary.jsx    saved designs (localStorage)
│   ├── ExportButton.jsx     binary STL export
│   ├── PresetThumb.jsx      preset preview icons
│   ├── PrintPreview.jsx     extrusion-line preview
│   ├── ProfileEditor.jsx    silhouette control points + curve handles
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

## Tech stack

React 18 · Vite 5 · Three.js · @react-three/fiber · @react-three/drei

## License

Open source, intended for maker and 3D-print workflows.
