import { useMemo, useState } from 'react';
import { TrainerScreen } from './components/trainer/TrainerScreen';
import { CalibrationScreen } from './components/calibration/CalibrationScreen';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import type { UnanalyzedSessionData, SessionData } from './utils/TypingEngine';
import { loadCalibration, saveCalibration } from './utils/calibrationStorage';
import type { CalibrationHomography } from './utils/calibrationStorage';
import type { LayoutPresetId } from './assets/layoutTemplates';
import { useKeyboardLayout } from './hooks/useKeyboardLayout';
import './App.css';

function App() {
  const savedConfig = useMemo(() => loadCalibration(), []);

  const [layoutPresetId, setLayoutPresetId] = useState<LayoutPresetId | 'custom'>(
    savedConfig ? (savedConfig.layoutPresetId as LayoutPresetId | 'custom') : 'us-standard'
  );
  const [homography, setHomography] = useState<CalibrationHomography | null>(
    savedConfig ? savedConfig.homography : null
  );
  const [mode, setMode] = useState<'calibration' | 'trainer' | 'dashboard'>(
    savedConfig ? 'trainer' : 'calibration'
  );
  const [unanalyzedData, setUnanalyzedData] = useState<UnanalyzedSessionData | null>(null);
  const [analyzedData, setAnalyzedData] = useState<SessionData | null>(null);
  const [customLayoutData, setCustomLayoutData] = useState<unknown | null>(
    savedConfig?.customLayoutData || null
  );
  const [customLayoutIsSplit, setCustomLayoutIsSplit] = useState<boolean>(
    savedConfig?.customLayoutIsSplit || false
  );

  // useKeyboardLayout フックでパース重複を解消
  const layout = useKeyboardLayout(layoutPresetId, customLayoutData, customLayoutIsSplit);

  // キャリブレーションが使う標準 US レイアウト（検出フェーズ用）は
  // CalibrationScreen 内で管理するためここでは不要

  const handleCalibrationComplete = (
    presetId: string,
    calibration: CalibrationHomography,
    customData?: unknown,
    customIsSplit?: boolean
  ) => {
    saveCalibration({
      layoutPresetId: presetId,
      homography: calibration,
      customLayoutData: customData,
      customLayoutIsSplit: customIsSplit,
    });
    setLayoutPresetId(presetId as LayoutPresetId | 'custom');
    if (customData !== undefined) setCustomLayoutData(customData);
    if (customIsSplit !== undefined) setCustomLayoutIsSplit(customIsSplit);
    setHomography(calibration);
    setUnanalyzedData(null);
    setAnalyzedData(null);
    setMode('trainer');
  };

  const handleSessionComplete = (data: UnanalyzedSessionData | SessionData) => {
    if ('frames' in data) {
      setAnalyzedData(data);
      setUnanalyzedData(null);
    } else {
      setUnanalyzedData(data);
      setAnalyzedData(null);
    }
    setMode('dashboard');
  };

  return (
    <div className="app-shell">
      {/* Navigation Bar */}
      <nav className="app-navbar">
        <h1 className="app-logo">SpartanType Web</h1>
        <div className="app-nav-tabs">
          <button
            id="nav-calibration"
            className={`app-nav-tab${mode === 'calibration' ? ' is-active' : ''}`}
            onClick={() => {
              setUnanalyzedData(null);
              setAnalyzedData(null);
              setMode('calibration');
            }}
          >
            Calibration
          </button>
          <button
            id="nav-trainer"
            className={`app-nav-tab${mode === 'trainer' ? ' is-active' : ''}`}
            onClick={() => {
              if (homography) {
                setUnanalyzedData(null);
                setAnalyzedData(null);
                setMode('trainer');
              }
            }}
            disabled={!homography}
          >
            Trainer
          </button>
          <button
            id="nav-dashboard"
            className={`app-nav-tab${mode === 'dashboard' ? ' is-active' : ''}`}
            onClick={() => setMode('dashboard')}
          >
            Dashboard
          </button>
        </div>
      </nav>

      <div className="app-content">
        {mode === 'calibration' && (
          <CalibrationScreen
            onComplete={handleCalibrationComplete}
            initialCustomLayoutData={customLayoutData}
            initialCustomLayoutIsSplit={customLayoutIsSplit}
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
          <DashboardScreen
            key={`dashboard-${unanalyzedData?.keystrokes.length ?? 0}-${analyzedData?.keystrokes.length ?? 0}`}
            layout={layout}
            initialUnanalyzedData={unanalyzedData}
            initialAnalyzedData={analyzedData}
          />
        )}
      </div>
    </div>
  );
}

export default App;
