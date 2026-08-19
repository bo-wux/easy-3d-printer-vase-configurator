import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import PrintPreview from './PrintPreview';
import { createVaseShape } from '../lib/vaseShape';

// Functie om vase geometrie te genereren (WATERTIGHT + CORRECT SCALE)
const createVaseGeometry = (params) => {
  const shape = createVaseShape(params);
  const h = shape.height; // mm
  const wall = shape.wall; // mm
  const radialSegments = shape.radialSegments;
  const heightSegments = shape.heightSegments;
  
  const positions = [];
  const indices = [];
  
  // OUTER SURFACE vertices
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const p = shape.pointAt(angle, t);
      positions.push(p.x, p.y, p.z);
    }
  }
  
  // INNER SURFACE vertices (met wanddikte)
  const innerStartIndex = (heightSegments + 1) * (radialSegments + 1);
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const p = shape.pointAt(angle, t, -wall);
      positions.push(p.x, p.y, p.z);
    }
  }
  
  // OUTER SURFACE indices
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      const c = a + 1;
      const d = b + 1;
      
      indices.push(a, b, c);
      indices.push(c, b, d);
    }
  }
  
  // INNER SURFACE indices (flipped normals)
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = innerStartIndex + i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      const c = a + 1;
      const d = b + 1;
      
      // Flip winding order voor inward normals
      indices.push(a, c, b);
      indices.push(c, d, b);
    }
  }
  
  // TOP RIM (verbindt outer en inner aan bovenkant)
  const topOuterStart = heightSegments * (radialSegments + 1);
  const topInnerStart = innerStartIndex + heightSegments * (radialSegments + 1);
  
  for (let j = 0; j < radialSegments; j++) {
    const outerA = topOuterStart + j;
    const outerB = topOuterStart + j + 1;
    const innerA = topInnerStart + j;
    const innerB = topInnerStart + j + 1;
    
    indices.push(outerA, innerA, outerB);
    indices.push(outerB, innerA, innerB);
  }
  
  // BOTTOM CAP - DIKKE SOLID BOTTOM (zelfde dikte als wanddikte)
  // Outer ring start op y=0, inner ring OOK op y=0, maar bodem gaat naar BOVEN (y=wall)
  const bottomOuterStart = 0;
  const bottomInnerStart = innerStartIndex;
  
  // Maak een ring op hoogte y=wall voor de bovenkant van de dikke bodem
  const bottomTopStartIndex = positions.length / 3;
  
  // Bottom top ring (inner ring maar dan op y = wall, dus BOVEN de onderkant)
  for (let j = 0; j <= radialSegments; j++) {
    const angle = (j / radialSegments) * Math.PI * 2;
    
    // Zelfde radius als inner ring op y=0, maar op y = wall (binnen de vaas)
    const p = shape.pointAt(angle, 0, -wall);
    positions.push(p.x, wall, p.z);
  }
  
  // Center points
  const bottomCenterBottomIndex = positions.length / 3;
  positions.push(0, 0, 0); // Center BOTTOM (op y=0, onderkant vaas)
  
  const bottomCenterTopIndex = positions.length / 3;
  positions.push(0, wall, 0); // Center TOP (op y=wall, bovenkant bodem)
  
  // 1. BOTTOM OUTER SURFACE (van outer ring y=0 naar inner ring y=0)
  // Dit is de onderkant buitenste ring (zie je van onder)
  for (let j = 0; j < radialSegments; j++) {
    const outerA = bottomOuterStart + j;
    const outerB = bottomOuterStart + j + 1;
    const innerA = bottomInnerStart + j;
    const innerB = bottomInnerStart + j + 1;
    
    // Gezien van onder (flip winding voor downward normal)
    indices.push(outerA, outerB, innerA);
    indices.push(outerB, innerB, innerA);
  }
  
  // 2. BOTTOM CENTER DISK (van inner ring y=0 naar center y=0)
  // Onderste vlak van de bodem
  for (let j = 0; j < radialSegments; j++) {
    const innerA = bottomInnerStart + j;
    const innerB = bottomInnerStart + j + 1;
    
    // Gezien van onder
    indices.push(bottomCenterBottomIndex, innerB, innerA);
  }
  
  // 3. SIDE WALL (van inner ring y=0 naar top ring y=wall)
  // Verticale binnenwand van de dikke bodem
  for (let j = 0; j < radialSegments; j++) {
    const innerA = bottomInnerStart + j;
    const innerB = bottomInnerStart + j + 1;
    const topA = bottomTopStartIndex + j;
    const topB = bottomTopStartIndex + j + 1;
    
    // Van binnen gezien (inward normal)
    indices.push(innerA, innerB, topA);
    indices.push(innerB, topB, topA);
  }
  
  // 4. TOP CENTER DISK (van top ring y=wall naar center y=wall)
  // Bovenste vlak van de bodem (binnen de vaas)
  for (let j = 0; j < radialSegments; j++) {
    const topA = bottomTopStartIndex + j;
    const topB = bottomTopStartIndex + j + 1;
    
    // Gezien van boven (upward normal)
    indices.push(bottomCenterTopIndex, topA, topB);
  }
  
  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  return geometry;
};

// Vase Mesh Component
const VaseMesh = ({ params, onMeshCreated, visible = true }) => {
  const meshRef = useRef();
  
  // Generate geometry based on parameters
  const geometry = useMemo(() => createVaseGeometry(params), [
    params.height, params.thickness, params.patternShape, params.waveCount, params.waveAmplitude,
    params.twistAngle, params.facetCount, params.facetStrength, params.ringCount, params.ringAmount,
    params.diameterBottom, params.diameterLow, params.diameterHigh, params.diameterTop,
    params.positionLow, params.positionHigh, params.useLow, params.useHigh,
    params.seed, params.organicAmount, params.organicDetail, params.organicFlow,
    params.swayAmount, params.swayTurns, params.autoLimit, params.maxOverhang
  ]);
  
  // Pass mesh reference to parent
  useEffect(() => {
    if (meshRef.current && onMeshCreated) {
      onMeshCreated(meshRef.current);
    }
  }, [onMeshCreated, geometry]);
  
  const brightness = Math.floor((params.materialBrightness ?? 0.55) * 255);
  const materialColor = useMemo(() => {
    return new THREE.Color(`rgb(${brightness}, ${brightness}, ${Math.floor(brightness * 0.97)})`);
  }, [brightness]);
  
  return (
    <mesh ref={meshRef} geometry={geometry} visible={visible} castShadow receiveShadow>
      <meshStandardMaterial 
        color={materialColor}
        metalness={0.05}
        roughness={0.6}
        side={THREE.DoubleSide}
        flatShading={false}
      />
    </mesh>
  );
};

// Main Viewer Component
const VaseViewer = ({ params, onMeshCreated }) => {
  // Camera positie gebaseerd op vase afmetingen
  const maxDiameter = Math.max(
    params.diameterBottom,
    params.diameterTop,
    params.useLow !== false ? params.diameterLow : 0,
    params.useHigh !== false ? params.diameterHigh : 0
  );
  const cameraDistance = Math.max(params.height, maxDiameter) * 1.5;
  
  return (
    <Canvas
      camera={{ 
        position: [cameraDistance, params.height * 0.6, cameraDistance], 
        fov: 45,
        near: 0.5,
        far: 5000
      }}
      shadows
      gl={{ antialias: true }}
    >
      {/* Lighting Setup */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[maxDiameter * 2, params.height * 2, maxDiameter]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={params.height * 5}
        shadow-camera-left={-maxDiameter * 2}
        shadow-camera-right={maxDiameter * 2}
        shadow-camera-top={params.height * 2}
        shadow-camera-bottom={-params.height}
      />
      <pointLight position={[-maxDiameter, params.height, -maxDiameter]} intensity={0.5} color="#ffffff" />
      <pointLight position={[maxDiameter, params.height * 0.5, maxDiameter]} intensity={0.3} color="#e8e8ff" />
      
      {/* Mesh blijft altijd bestaan zodat STL-export ook werkt tijdens de print preview */}
      <VaseMesh params={params} onMeshCreated={onMeshCreated} visible={!params.showPrintLines} />
      
      {/* Print Preview - alleen tonen als AAN */}
      {params.showPrintLines && (
        <PrintPreview 
          params={params} 
          printSettings={{
            layerHeight: params.layerHeight ?? 0.2,
            lineWidth: params.lineWidth ?? 0.42,
            spiralMode: params.spiralMode ?? true,
            rectangularLine: true,
            cornerRadius: params.cornerRadius ?? 1.0,
            matteFinish: params.matteFinish ?? 0.85,
            materialBrightness: params.materialBrightness ?? 0.55,
            showLayers: true
          }}
        />
      )}
      
      {/* Ground plane - alleen tonen als showGrid aan staat */}
      {params.showGrid !== false && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
            <planeGeometry args={[maxDiameter * 5, maxDiameter * 5]} />
            <meshStandardMaterial color="#e8e8f0" opacity={0.8} transparent depthWrite={false} />
          </mesh>
          
          {/* Grid Helper voor schaal referentie */}
          <gridHelper args={[maxDiameter * 4, 40, '#cccccc', '#eeeeee']} position={[0, 0.05, 0]} />
        </>
      )}
      
      {/* Controls */}
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={maxDiameter * 0.5}
        maxDistance={params.height * 6}
        target={[0, params.height / 2, 0]}
      />
      
      {/* Environment */}
      <Environment preset="studio" />
    </Canvas>
  );
};

export default VaseViewer;
