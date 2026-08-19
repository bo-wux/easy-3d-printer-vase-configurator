import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { createVaseShape, PRINTER_LIMITS } from '../lib/vaseShape';
import { getFilament, getFinish } from '../lib/filaments';

const TAU = Math.PI * 2;
const BED = PRINTER_LIMITS.bedSize;

/**
 * Watertight vaas-mesh. Buiten- en binnenwand zijn hetzelfde raster met een
 * radiale offset, verbonden door de bovenrand en een massieve bodem.
 */
const createVaseGeometry = (params) => {
  const shape = createVaseShape(params);
  const wall = shape.wall;
  const rs = shape.radialSegments;
  const hs = shape.heightSegments;
  const ring = rs + 1;

  const positions = [];
  const uvs = [];
  const indices = [];

  const addGrid = (offset) => {
    for (let i = 0; i <= hs; i++) {
      const t = i / hs;
      for (let j = 0; j <= rs; j++) {
        const angle = (j / rs) * TAU;
        const p = shape.pointAt(angle, t, offset);
        positions.push(p.x, p.y, p.z);
        uvs.push(j / rs, t);
      }
    }
  };

  addGrid(0);
  const innerStart = ring * (hs + 1);
  addGrid(-wall);

  const O = (i, j) => i * ring + j;
  const I = (i, j) => innerStart + i * ring + j;

  for (let i = 0; i < hs; i++) {
    for (let j = 0; j < rs; j++) {
      // buitenwand
      indices.push(O(i, j), O(i + 1, j), O(i, j + 1));
      indices.push(O(i, j + 1), O(i + 1, j), O(i + 1, j + 1));
      // binnenwand (omgekeerde winding)
      indices.push(I(i, j), I(i, j + 1), I(i + 1, j));
      indices.push(I(i, j + 1), I(i + 1, j + 1), I(i + 1, j));
    }
  }

  // Bovenrand: buiten- en binnenwand verbinden
  for (let j = 0; j < rs; j++) {
    indices.push(O(hs, j), I(hs, j), O(hs, j + 1));
    indices.push(O(hs, j + 1), I(hs, j), I(hs, j + 1));
  }

  // Massieve bodem: onderzijde + opstaande rand + bovenvlak op y = wall
  const bottomTop = positions.length / 3;
  for (let j = 0; j <= rs; j++) {
    const p = shape.pointAt((j / rs) * TAU, 0, -wall);
    positions.push(p.x, wall, p.z);
    uvs.push(j / rs, 0);
  }
  const centerBottom = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0);
  const centerTop = positions.length / 3;
  positions.push(0, wall, 0);
  uvs.push(0.5, 0);

  for (let j = 0; j < rs; j++) {
    indices.push(O(0, j), O(0, j + 1), I(0, j));
    indices.push(O(0, j + 1), I(0, j + 1), I(0, j));

    indices.push(centerBottom, I(0, j + 1), I(0, j));

    indices.push(I(0, j), I(0, j + 1), bottomTop + j);
    indices.push(I(0, j + 1), bottomTop + j + 1, bottomTop + j);

    indices.push(centerTop, bottomTop + j, bottomTop + j + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** Normal map met horizontale ribbels: geeft de render de look van printlagen. */
const createLayerNormalMap = () => {
  const w = 4;
  const h = 32;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const slope = Math.cos(Math.PI * v) * 0.8;
    const len = Math.hypot(slope, 1);
    const ny = Math.round(((-slope / len) * 0.5 + 0.5) * 255);
    const nz = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = 128;
      data[i + 1] = ny;
      data[i + 2] = nz;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
};

const VaseMesh = ({ params, onMeshCreated }) => {
  const meshRef = useRef();

  const geometry = useMemo(() => createVaseGeometry(params), [
    params.height, params.thickness,
    params.diameterBottom, params.diameterLow, params.diameterHigh, params.diameterTop,
    params.positionLow, params.positionHigh, params.useLow, params.useHigh,
    params.patternShape, params.waveCount, params.waveAmplitude,
    params.twistAngle, params.twistMode, params.twistWaves,
    params.facetCount, params.facetStrength, params.ringCount, params.ringAmount,
    params.bumpCols, params.bumpRows, params.bumpDepth, params.bumpStagger,
    params.textureType, params.textureScale, params.textureDepth,
    params.rimWaveCount, params.rimWaveDepth,
    params.seed, params.organicAmount, params.organicDetail, params.organicFlow,
    params.swayAmount, params.swayTurns, params.autoLimit, params.maxOverhang,
  ]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    if (meshRef.current && onMeshCreated) onMeshCreated(meshRef.current);
  }, [onMeshCreated, geometry]);

  const filament = getFilament(params.filament);
  const finish = getFinish(params.finish);

  const layerMap = useMemo(() => {
    const tex = createLayerNormalMap();
    // meer lagen dan dit wordt op het scherm toch één grijze waas
    tex.repeat.set(1, Math.min(300, Math.round(params.height / (params.layerHeight || 0.2))));
    return tex;
  }, [params.height, params.layerHeight]);

  useEffect(() => () => layerMap.dispose(), [layerMap]);

  const layerStrength = finish.id === 'silk' ? 0.14 : 0.28;

  return (
    <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={filament.color}
        roughness={finish.roughness}
        metalness={finish.metalness}
        clearcoat={finish.clearcoat}
        clearcoatRoughness={0.35}
        normalMap={layerMap}
        normalScale={new THREE.Vector2(layerStrength, layerStrength)}
        side={THREE.DoubleSide}
        envMapIntensity={0.85}
      />
    </mesh>
  );
};

/** Houdt de kijkafstand kloppend als de vaas van formaat verandert; de kijkhoek blijft van de gebruiker. */
const CameraRig = ({ frame, targetY }) => {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    const target = controls?.target || new THREE.Vector3(0, targetY, 0);
    const dir = camera.position.clone().sub(target);
    if (dir.lengthSq() < 1e-6) dir.set(0.58, 0.38, 0.72);
    camera.position.copy(target).add(dir.setLength(frame));
    camera.updateProjectionMatrix();
    if (controls) controls.update();
  }, [frame, camera, controls]);

  return null;
};

/** Klein JPEG-plaatje van de huidige weergave, voor de ontwerpbibliotheek. */
const captureThumbnail = (gl, scene, camera, maxWidth = 340) => {
  gl.render(scene, camera);
  const src = gl.domElement;
  if (!src.width || !src.height) return null;
  const scale = Math.min(1, maxWidth / src.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#11141c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
};

const VaseViewer = ({ params, onMeshCreated, onCaptureReady }) => {
  const maxDiameter = Math.max(
    params.diameterBottom,
    params.diameterTop,
    params.useLow !== false ? params.diameterLow : 0,
    params.useHigh !== false ? params.diameterHigh : 0
  );
  // afstand zo dat de vaas met marge in beeld staat bij fov 40
  const frame = Math.max(params.height * 1.9, maxDiameter * 3.6);

  return (
    <Canvas
      camera={{
        position: [frame * 0.58, params.height * 0.45 + frame * 0.38, frame * 0.72],
        fov: 40,
        near: 1,
        far: 4000,
      }}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ gl, scene, camera }) => {
        if (onCaptureReady) onCaptureReady(() => captureThumbnail(gl, scene, camera));
      }}
    >
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#ffffff', '#1a1e27', 0.35]} />
      <directionalLight
        position={[maxDiameter * 1.6, params.height * 1.8, maxDiameter * 1.4]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={params.height * 6}
        shadow-camera-left={-maxDiameter * 2}
        shadow-camera-right={maxDiameter * 2}
        shadow-camera-top={params.height * 2}
        shadow-camera-bottom={-params.height}
        shadow-bias={-0.0005}
      />
      {/* tegenlicht maakt de contouren los van de achtergrond */}
      <directionalLight position={[-maxDiameter * 2, params.height * 1.2, -maxDiameter * 2]} intensity={0.5} color="#cfd8ff" />

      <VaseMesh params={params} onMeshCreated={onMeshCreated} />

      <ContactShadows
        position={[0, 0.05, 0]}
        scale={Math.max(maxDiameter * 3.5, 200)}
        opacity={0.75}
        blur={2}
        far={params.height * 0.4}
        resolution={1024}
        color="#000000"
      />

      {params.showGrid !== false && (
        <>
          {/* Bambu Lab P1S buildplate: 256 × 256mm, raster van 16mm.
              Basic material: de plaat blijft zo egaal donker, ongeacht de studio-belichting. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
            <planeGeometry args={[BED, BED]} />
            <meshBasicMaterial color="#151b28" />
          </mesh>
          <gridHelper args={[BED, BED / 16, '#3f4a61', '#28303e']} position={[0, -0.3, 0]} />
        </>
      )}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.08}
        autoRotate={!!params.autoRotate}
        autoRotateSpeed={1.1}
        minDistance={maxDiameter * 0.8}
        maxDistance={params.height * 6}
        target={[0, params.height * 0.45, 0]}
      />

      <CameraRig frame={frame} targetY={params.height * 0.45} />

      <Environment preset="studio" />
    </Canvas>
  );
};

export default VaseViewer;
