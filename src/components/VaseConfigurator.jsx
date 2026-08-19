import React, { useState } from 'react';
import VaseControls from './VaseControls';
import VaseViewer from './VaseViewer';
import ExportButton from './ExportButton';
import { DEFAULT_SHAPE } from '../lib/vaseShape';

const VaseConfigurator = () => {
  // Defaults afgestemd op een Bambu Lab P1S met 0.4mm nozzle
  const [vaseParams, setVaseParams] = useState({
    ...DEFAULT_SHAPE,
    // Weergave
    showGrid: true,
    materialBrightness: 0.55,
    // Print preview
    showPrintLines: false,
    spiralMode: true,
    layerHeight: 0.2,
    lineWidth: 0.42,
    cornerRadius: 1.0,
    matteFinish: 0.85,
  });

  // Ref voor toegang tot de Three.js mesh
  const [meshRef, setMeshRef] = useState(null);

  const updateParam = (param, value) => {
    setVaseParams(prev => ({
      ...prev,
      [param]: typeof value === 'boolean' || typeof value === 'number'
        ? value
        : (isNaN(parseFloat(value)) ? value : parseFloat(value))
    }));
  };

  // Meerdere parameters tegelijk (presets, randomizer)
  const updateParams = (values) => {
    setVaseParams(prev => ({ ...prev, ...values }));
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🏺 3D Vase Configurator</h1>
        <p>MakerLab — vazen voor je Bambu Lab P1S</p>
      </header>
      
      <div className="main-content">
        <div className="controls-panel">
          <ExportButton meshRef={meshRef} params={vaseParams} />
          <VaseControls 
            params={vaseParams} 
            onParamChange={updateParam} 
            onParamsChange={updateParams}
          />
        </div>
        
        <div className="viewer-container">
          <VaseViewer 
            params={vaseParams} 
            onMeshCreated={setMeshRef}
          />
          
          <div className="viewer-info">
            <p>💡 <strong>Tip:</strong> Sleep met je muis om te roteren</p>
            <p>🖱️ Scroll om in/uit te zoomen</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VaseConfigurator;
