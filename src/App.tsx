import { useMemo, useState } from 'react';
import { parseKLE } from './utils/kleParser';
import { TrainerScreen } from './components/trainer/TrainerScreen';
import { CalibrationScreen } from './components/calibration/CalibrationScreen';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import type { UnanalyzedSessionData } from './utils/TypingEngine';
import { loadCalibration, saveCalibration } from './utils/calibrationStorage';
import type { CalibrationHomography } from './utils/calibrationStorage';
import { LAYOUT_PRESETS } from './assets/layoutTemplates';
import type { LayoutPresetId } from './assets/layoutTemplates';

function App() {
  const savedConfig = useMemo(() => loadCalibration(), []);
  const [layoutPresetId, setLayoutPresetId] = useState<LayoutPresetId>(savedConfig ? savedConfig.layoutPresetId as LayoutPresetId : 'us-standard');
  const [homography, setHomography] = useState<CalibrationHomography | null>(savedConfig ? savedConfig.homography : null);
  const [mode, setMode] = useState<'calibration' | 'trainer' | 'dashboard'>(savedConfig ? 'trainer' : 'calibration');
  const [unanalyzedData, setUnanalyzedData] = useState<UnanalyzedSessionData | null>(null);

  const layout = useMemo(() => {
    const preset = LAYOUT_PRESETS[layoutPresetId as keyof typeof LAYOUT_PRESETS];
    return parseKLE(preset.data, preset.isSplit);
  }, [layoutPresetId]);

  const handleCalibrationComplete = (presetId: string, calibration: CalibrationHomography) => {
    saveCalibration({ layoutPresetId: presetId, homography: calibration });
    setLayoutPresetId(presetId as LayoutPresetId);
    setHomography(calibration);
    setMode('trainer');
  };

  const handleSessionComplete = (data: UnanalyzedSessionData) => {
    setUnanalyzedData(data);
    setMode('dashboard');
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'flex-start', 
      minHeight: '100vh', 
      background: '#111116', 
      color: '#fff', 
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontWeight: 300, letterSpacing: '2px', fontSize: '1.5rem' }}>SpartanType Web</h1>
        <div style={{ display: 'flex', gap: '0.5rem', background: '#222', padding: '0.25rem', borderRadius: '8px' }}>
          <button 
            onClick={() => setMode('calibration')}
            style={{ 
              padding: '0.5rem 1.5rem', 
              background: mode === 'calibration' ? '#00adb5' : 'transparent', 
              color: mode === 'calibration' ? '#fff' : '#888', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontWeight: mode === 'calibration' ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            Calibration
          </button>
          <button 
            onClick={() => { if(homography) setMode('trainer') }}
            disabled={!homography}
            style={{ 
              padding: '0.5rem 1.5rem', 
              background: mode === 'trainer' ? '#00adb5' : 'transparent', 
              color: mode === 'trainer' ? '#fff' : (homography ? '#888' : '#444'), 
              border: 'none', 
              borderRadius: '6px', 
              cursor: homography ? 'pointer' : 'not-allowed',
              fontWeight: mode === 'trainer' ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            Trainer
          </button>
          <button 
            onClick={() => setMode('dashboard')}
            style={{ 
              padding: '0.5rem 1.5rem', 
              background: mode === 'dashboard' ? '#00adb5' : 'transparent', 
              color: mode === 'dashboard' ? '#fff' : '#888', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontWeight: mode === 'dashboard' ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            Dashboard
          </button>
        </div>
      </div>
      
      {mode === 'calibration' && (
        <CalibrationScreen 
          onComplete={handleCalibrationComplete} 
        />
      )}
      
      {mode === 'trainer' && homography && (
        <TrainerScreen 
          layout={layout} 
          homography={homography} 
          onSessionComplete={handleSessionComplete}
        />
      )}

      {mode === 'dashboard' && (
        <DashboardScreen layout={layout} initialUnanalyzedData={unanalyzedData} />
      )}
    </div>
  );
}

export default App;
