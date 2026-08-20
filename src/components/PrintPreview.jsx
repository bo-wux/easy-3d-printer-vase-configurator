import React, { useMemo } from 'react';
import * as THREE from 'three';
import { createVaseShape } from '../lib/vaseShape';

/**
 * Print Preview Component
 * Visualiseert 3D beton print lijnen door de vaas te "slicen" in lagen
 * en elke laag als een dikke tube te renderen
 */

// Creëer een custom tube geometry met de vorm van een extrusielijn
// Stadium shape: platte bovenkant/onderkant met halve cirkels als zijkanten
const createExtrusionTube = (path, segments, lineWidth, lineHeight, rectangular = false, cornerRadius = 0) => {
  const geometry = new THREE.BufferGeometry();
  
  const vertices = [];
  const indices = [];
  
  const crossSection = [];
  let radialSegments;
  
  if (rectangular) {
    // Rechthoekige Cross-sectie met optionele ronde hoeken
    const halfWidth = lineWidth / 2;
    const halfHeight = lineHeight / 2;
    
    // Bereken effectieve hoek radius (als percentage van lijn hoogte)
    const effectiveRadius = halfHeight * cornerRadius;
    
    if (effectiveRadius > 0.01) {
      // Afgeronde hoeken - maak een afgeronde rechthoek
      const segmentsPerCorner = 3; // Aantal segments per hoek
      const straightWidth = halfWidth - effectiveRadius;
      const straightHeight = halfHeight - effectiveRadius;
      
      // Rechts boven hoek (0° tot 90°)
      for (let i = 0; i <= segmentsPerCorner; i++) {
        const angle = (i / segmentsPerCorner) * (Math.PI / 2);
        const x = straightWidth + Math.cos(angle) * effectiveRadius;
        const y = straightHeight + Math.sin(angle) * effectiveRadius;
        crossSection.push({ x, y });
      }
      
      // Links boven hoek (90° tot 180°)
      for (let i = 0; i <= segmentsPerCorner; i++) {
        const angle = Math.PI / 2 + (i / segmentsPerCorner) * (Math.PI / 2);
        const x = -straightWidth + Math.cos(angle) * effectiveRadius;
        const y = straightHeight + Math.sin(angle) * effectiveRadius;
        crossSection.push({ x, y });
      }
      
      // Links onder hoek (180° tot 270°)
      for (let i = 0; i <= segmentsPerCorner; i++) {
        const angle = Math.PI + (i / segmentsPerCorner) * (Math.PI / 2);
        const x = -straightWidth + Math.cos(angle) * effectiveRadius;
        const y = -straightHeight + Math.sin(angle) * effectiveRadius;
        crossSection.push({ x, y });
      }
      
      // Rechts onder hoek (270° tot 360°)
      for (let i = 0; i <= segmentsPerCorner; i++) {
        const angle = 3 * Math.PI / 2 + (i / segmentsPerCorner) * (Math.PI / 2);
        const x = straightWidth + Math.cos(angle) * effectiveRadius;
        const y = -straightHeight + Math.sin(angle) * effectiveRadius;
        crossSection.push({ x, y });
      }
      
      radialSegments = (segmentsPerCorner + 1) * 4;
    } else {
      // Scherpe hoeken - gewone rechthoek (zelfde tegen-de-klok-in volgorde als
      // de afgeronde en ovale doorsnede hierboven/hieronder, anders klopt de
      // winding — en dus de normaalrichting — niet)
      crossSection.push({ x: halfWidth, y: halfHeight });    // rechts boven
      crossSection.push({ x: -halfWidth, y: halfHeight });   // links boven
      crossSection.push({ x: -halfWidth, y: -halfHeight });  // links onder
      crossSection.push({ x: halfWidth, y: -halfHeight });   // rechts onder
      
      radialSegments = 4;
    }
  } else {
    // Ovale Cross-sectie:
    // Gewoon een cirkel met verschillende breedte en hoogte
    radialSegments = 20;
    
    for (let i = 0; i < radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle) * (lineWidth / 2);   // horizontale straal
      const y = Math.sin(angle) * (lineHeight / 2);  // verticale straal
      crossSection.push({ x, y });
    }
  }
  
  // Genereer vertices langs het pad
  const pathPoints = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    pathPoints.push(path.getPointAt(t));
  }
  
  for (let i = 0; i <= segments; i++) {
    const pos = pathPoints[i];
    
    // Voor elke positie op het pad, plaats we de cross-sectie
    for (let j = 0; j < radialSegments; j++) {
      const cs = crossSection[j];
      
      // Cross-sectie transformatie:
      // cs.y gaat naar de world Y-as (verticaal) - dit is de laag hoogte
      // cs.x wordt radiaal geplaatst rond het pad (horizontaal)
      
      // Bereken de hoek van dit punt op het pad (voor rotatie rond Y-as)
      const pathAngle = Math.atan2(pos.z, pos.x);
      
      // Plaats cs.x radiaal rond het centrum, cs.y blijft verticaal
      const x = pos.x + cs.x * Math.cos(pathAngle);
      const z = pos.z + cs.x * Math.sin(pathAngle);
      const y = pos.y + cs.y; // Verticale offset (direct world Y)
      
      vertices.push(x, y, z);
    }
  }
  
  // Genereer indices (triangles)
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      const d = (i + 1) * radialSegments + j;
      
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  return geometry;
};

const PrintPreview = ({ params, printSettings }) => {
  const { layerHeight = 0.2, lineWidth = 0.42, showLayers = true, spiralMode = true, rectangularLine = true, cornerRadius = 1.0, matteFinish = 0.85, materialBrightness = 0.55 } = printSettings;
  
  const totalHeight = params.height;
  const realLayers = Math.max(1, Math.ceil(totalHeight / layerHeight));
  // Bij 0.2mm lagen zijn het er al snel >1000: te veel om als losse tubes te tekenen.
  // De preview toont dan minder, proportioneel dikkere ringen (zelfde look, wel vloeiend).
  const previewLayers = Math.min(realLayers, 150);
  const actualLayerHeight = totalHeight / previewLayers;
  const previewScale = actualLayerHeight / layerHeight;
  const previewLineWidth = lineWidth * previewScale;
  
  const materialColor = useMemo(() => {
    const brightness = Math.floor(materialBrightness * 255);
    return new THREE.Color(`rgb(${brightness}, ${brightness}, ${Math.floor(brightness * 0.97)})`);
  }, [materialBrightness]);
  
  // Genereer print lijnen geometrie
  const printLines = useMemo(() => {
    if (!showLayers) return [];
    const shape = createVaseShape(params);
    const height = shape.height;
    
    const lines = [];
    
    // BODEM PLAAT - Gevulde schijf met de exacte vorm van de onderste ring
    const pointsPerCircle = shape.radialSegments;
    
    // Maak een gevulde schijf door concentrische ringen
    const numRings = 20; // Aantal ringen van centrum naar rand
    const bottomVertices = [];
    const bottomIndices = [];
    
    for (let ring = 0; ring <= numRings; ring++) {
      const ringT = ring / numRings;
      
      for (let i = 0; i < pointsPerCircle; i++) {
        const angle = (i / pointsPerCircle) * Math.PI * 2;
        
        // Schaal de contour van de eerste laag naar het midden toe
        const radius = shape.radiusAt(angle, 0) * ringT;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        // Voeg vertices toe voor onder (y=0) en boven (y=actualLayerHeight/2 - centrum eerste laag)
        bottomVertices.push(x, 0, z);
        bottomVertices.push(x, actualLayerHeight / 2, z);
      }
    }
    
    // Genereer indices voor de schijf (onder en boven vlak + zijkanten)
    for (let ring = 0; ring < numRings; ring++) {
      for (let i = 0; i < pointsPerCircle; i++) {
        const current = (ring * pointsPerCircle + i) * 2;
        const next = (ring * pointsPerCircle + ((i + 1) % pointsPerCircle)) * 2;
        const currentOuter = ((ring + 1) * pointsPerCircle + i) * 2;
        const nextOuter = ((ring + 1) * pointsPerCircle + ((i + 1) % pointsPerCircle)) * 2;
        
        // Onder vlak
        bottomIndices.push(current, nextOuter, next);
        bottomIndices.push(current, currentOuter, nextOuter);
        
        // Boven vlak
        bottomIndices.push(current + 1, next + 1, nextOuter + 1);
        bottomIndices.push(current + 1, nextOuter + 1, currentOuter + 1);
      }
    }
    
    // Zijkant (alleen de buitenste ring)
    const outerRing = numRings;
    for (let i = 0; i < pointsPerCircle; i++) {
      const current = (outerRing * pointsPerCircle + i) * 2;
      const next = (outerRing * pointsPerCircle + ((i + 1) % pointsPerCircle)) * 2;
      
      bottomIndices.push(current, current + 1, next + 1);
      bottomIndices.push(current, next + 1, next);
    }
    
    const bottomPlateGeometry = new THREE.BufferGeometry();
    bottomPlateGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomVertices, 3));
    bottomPlateGeometry.setIndex(bottomIndices);
    bottomPlateGeometry.computeVertexNormals();
    
    lines.push({
      geometry: bottomPlateGeometry,
      position: [0, 0, 0],
      layer: -1,
      isBottomPlate: true
    });
    
    // WAND - SPIRAAL OF LAGEN MODE
    // Start op actualLayerHeight (onderkant eerste lijn op y=0, centrum lijn op actualLayerHeight/2)
    const startY = actualLayerHeight / 2;
    
    if (spiralMode) {
      // SPIRAAL MODE: Eén doorlopende lijn van bodem tot top zonder stoppen
      // Meer punten voor waves voor smooth curves, en extra voor grote objecten
      const pointsPerRotation = Math.round(shape.radialSegments / 2);
      const totalRotations = previewLayers;
      const totalPoints = pointsPerRotation * totalRotations;
      const spiralPoints = [];
      
      for (let i = 0; i <= totalPoints; i++) {
        // Hoogte stijgt lineair - van startY tot height + startY
        const y = startY + (i / totalPoints) * height;
        const t = (y - startY) / height;

        if (t > 1) break;

        // Angle draait rond (meerdere omwentelingen)
        const angle = (i / pointsPerRotation) * Math.PI * 2;

        // p.y (i.p.v. de lineaire y hierboven) volgt de échte oppervlaktehoogte,
        // inclusief een eventuele golvende rand — anders toont de preview altijd
        // een vlakke rand, ook als de vaas er zelf één heeft.
        const p = shape.pointAt(angle, t);

        spiralPoints.push(new THREE.Vector3(p.x, p.y + startY, p.z));
      }
      
      // Maak ONE continuous tube voor de hele spiraal met beton vorm
      if (spiralPoints.length > 1) {
        const spiralCurve = new THREE.CatmullRomCurve3(spiralPoints);
        spiralCurve.closed = false; // NIET gesloten - continue lijn van start tot eind
        
        const spiralGeometry = createExtrusionTube(
          spiralCurve,
          spiralPoints.length * 2, // veel segments voor smooth curve
          previewLineWidth,
          actualLayerHeight,
          rectangularLine,
          cornerRadius
        );
        
        lines.push({
          geometry: spiralGeometry,
          position: [0, 0, 0],
          layer: 'spiral' // marker voor continue spiraal
        });
      }
    } else {
      // LAGEN MODE: Gestapelde horizontale ringen - PERFECT AANSLUITEND
      for (let layer = 0; layer < previewLayers; layer++) {
        const y = startY + layer * actualLayerHeight;
        const t = (y - startY) / height;
        
        if (t > 1) continue;
        
        // Aantal punten per laag (meer punten voor smooth waves/organisch detail)
        const pointsPerLayer = Math.round(shape.radialSegments / 2);
        const points = [];

        // i < pointsPerLayer (geen `<=`): curve.closed hieronder sluit de lus
        // zelf van het laatste naar het eerste punt. Zowel expliciet een
        // afsluitend punt op hoek 2π toevoegen als closed=true zetten geeft een
        // dubbel, ontaard segment op de naad.
        for (let i = 0; i < pointsPerLayer; i++) {
          const angle = (i / pointsPerLayer) * Math.PI * 2;
          // p.y (i.p.v. de lineaire y hierboven) volgt de échte oppervlaktehoogte,
          // inclusief een eventuele golvende rand.
          const p = shape.pointAt(angle, t);

          points.push(new THREE.Vector3(p.x, p.y + startY, p.z));
        }

        // Maak een tube geometry voor deze laag
        const curve = new THREE.CatmullRomCurve3(points);
        curve.closed = true; // Sluit de cirkel
        
        const layerGeometry = createExtrusionTube(
          curve,
          pointsPerLayer, // segments
          previewLineWidth,
          actualLayerHeight,
          rectangularLine,
          cornerRadius
        );
        
        lines.push({
          geometry: layerGeometry,
          position: [0, 0, 0],
          layer: layer
        });
      }
    }
    
    return lines;
  }, [params, previewLineWidth, spiralMode, rectangularLine, cornerRadius, actualLayerHeight, previewLayers, showLayers]);

  if (!showLayers) return null;

  return (
    <group>
      {printLines.map((line, index) => (
        <mesh key={index} geometry={line.geometry} position={line.position}>
          <meshStandardMaterial 
            color={materialColor}
            roughness={matteFinish}
            metalness={Math.max(0, 0.1 - (matteFinish - 0.5) * 0.2)}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

export default PrintPreview;
