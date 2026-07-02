import { TrainerScreen } from './components/trainer/TrainerScreen';
import { CalibrationScreen } from './components/calibration/CalibrationScreen';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import { PhoneCameraPage } from './components/camera/PhoneCameraPage';
import { useAppSession } from './hooks/useAppSession';
import './App.css';

function App() {
  // スマホがQRから開く専用ページ。?camera=phone のときは通常UIではなくカメラ送信ページを表示する。
  if (new URLSearchParams(window.location.search).get('camera') === 'phone') {
    return <PhoneCameraPage />;
  }
  return <MainApp />;
}

function MainApp() {
  const {
    mode,
    layout,
    homography,
    calibrationCameraSize,
    unanalyzedData,
    analyzedData,
    recordingBlob,
    customLayoutData,
    customLayoutIsSplit,
    actions,
  } = useAppSession();

  return (
    <div className="app-shell">
      {/* Navigation Bar */}
      <nav className="app-navbar">
        <h1 className="app-logo">SpartanType Web</h1>
        <div className="app-nav-tabs">
          <button
            id="nav-calibration"
            className={`app-nav-tab${mode === 'calibration' ? ' is-active' : ''}`}
            onClick={actions.showCalibration}
          >
            Calibration
          </button>
          <button
            id="nav-trainer"
            className={`app-nav-tab${mode === 'trainer' ? ' is-active' : ''}`}
            onClick={actions.showTrainer}
            disabled={!homography}
          >
            Trainer
          </button>
          <button
            id="nav-dashboard"
            className={`app-nav-tab${mode === 'dashboard' ? ' is-active' : ''}`}
            onClick={actions.showDashboard}
          >
            Dashboard
          </button>
        </div>
      </nav>

      <div className="app-content">
        {mode === 'calibration' && (
          <CalibrationScreen
            onComplete={actions.handleCalibrationComplete}
            initialCustomLayoutData={customLayoutData}
            initialCustomLayoutIsSplit={customLayoutIsSplit}
          />
        )}

        {mode === 'trainer' && homography && (
          <TrainerScreen
            layout={layout}
            homography={homography}
            calibrationCameraSize={calibrationCameraSize}
            onSessionComplete={actions.handleSessionComplete}
          />
        )}

        {mode === 'dashboard' && (
          <DashboardScreen
            layout={layout}
            initialUnanalyzedData={unanalyzedData}
            initialAnalyzedData={analyzedData}
            initialRecordingBlob={recordingBlob}
            onAnalysisComplete={actions.handleAnalysisComplete}
            onSessionLoaded={actions.handleSessionLoaded}
          />
        )}
      </div>
    </div>
  );
}

export default App;
