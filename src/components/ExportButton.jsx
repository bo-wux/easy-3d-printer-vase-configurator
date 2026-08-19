import React from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';

const ExportButton = ({ meshRef, params }) => {
  const handleExport = () => {
    if (!meshRef) {
      alert('Geen vaas beschikbaar om te exporteren!');
      return;
    }

    try {
      // Create STL exporter
      const exporter = new STLExporter();
      
      // Clone de GEOMETRY (niet de mesh) voor export
      const originalGeometry = meshRef.geometry;
      const exportGeometry = originalGeometry.clone();
      
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
      const maxDiameter = Math.max(
        params.diameterBottom,
        params.diameterTop,
        params.useLow !== false ? params.diameterLow : 0,
        params.useHigh !== false ? params.diameterHigh : 0
      );
      const filename = `vaas_H${params.height}_D${Math.round(maxDiameter)}_W${params.thickness}.stl`;
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
      <span className="export-hint">Z-up · opening boven · bodem op de plaat</span>
    </div>
  );
};

export default ExportButton;
