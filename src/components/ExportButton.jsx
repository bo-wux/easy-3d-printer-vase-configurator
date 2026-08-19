import React from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { buildVaseMesh } from '../lib/vaseMesh';
import { maxProfileDiameter } from '../lib/vaseShape';

const ExportButton = ({ meshRef, params }) => {
  const vaseMode = !!params.vaseMode;

  const handleExport = () => {
    if (!meshRef) {
      alert('Geen vaas beschikbaar om te exporteren!');
      return;
    }

    try {
      const exporter = new STLExporter();

      // Bouw de mesh opnieuw uit de parameters: de export is zo onafhankelijk
      // van wat er in de viewer staat (en kan massief voor vase mode).
      const { positions, indices } = buildVaseMesh(params, { solid: vaseMode });
      const exportGeometry = new THREE.BufferGeometry();
      exportGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      exportGeometry.setIndex(indices);
      exportGeometry.computeVertexNormals();

      // Roteer geometrie: Y-up (Three.js) → Z-up (STL standaard)
      // Draai +90 graden om X-as zodat Y → Z (opening boven!)
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.makeRotationX(Math.PI / 2);
      exportGeometry.applyMatrix4(rotationMatrix);
      
      // Verschuif geometrie zodat bodem op Z=0 ligt
      exportGeometry.computeBoundingBox();
      const minZ = exportGeometry.boundingBox.min.z;
      exportGeometry.translate(0, 0, -minZ);
      
      // Maak tijdelijke mesh voor export
      const exportMesh = new THREE.Mesh(exportGeometry);
      exportMesh.position.set(0, 0, 0);
      exportMesh.updateMatrix();
      exportMesh.updateMatrixWorld(true);
      
      // Export as binary STL
      const stlBinary = exporter.parse(exportMesh, { binary: true });
      
      // Create blob and download
      const blob = new Blob([stlBinary], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      
      // Filename with parameters
      const maxDiameter = maxProfileDiameter(params);
      const filename = `vaas_H${params.height}_D${Math.round(maxDiameter)}_W${params.thickness}${vaseMode ? '_vasemode' : ''}.stl`;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      URL.revokeObjectURL(link.href);
      exportGeometry.dispose();
      
      console.log('✅ STL exported:', filename);
      console.log(`📏 Afmetingen: ${params.height}mm (H) × ${Math.round(maxDiameter)}mm (Ø)`);
      console.log('🔄 Oriëntatie: Z-up (opening boven, bodem op buildplate)');
    } catch (error) {
      console.error('❌ Export error:', error);
      alert('Er is een fout opgetreden bij het exporteren. Zie console voor details.');
    }
  };

  return (
    <div>
      <button 
        className="export-button"
        onClick={handleExport}
        disabled={!meshRef}
      >
        ⬇ Download .STL
      </button>
      <span className="export-hint">
        {vaseMode
          ? 'Massief model — zet spiral/vase mode aan in de slicer'
          : 'Z-up · opening boven · bodem op de plaat'}
      </span>
    </div>
  );
};

export default ExportButton;
