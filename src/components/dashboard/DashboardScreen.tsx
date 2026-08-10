import React, { useState } from 'react';
import type { KeyboardLayout } from '../../types/kle';
import type { SessionData, UnanalyzedSessionData } from '../../types/session';
import { ScoreSummary } from './ScoreSummary';
import { HabitAnalyzer } from './HabitAnalyzer';
import { KeyboardHeatmap } from './KeyboardHeatmap';
import { PlantTreeCanvas } from '../tree/PlantTreeCanvas';
import { AnalysisPhase } from './AnalysisPhase';
import { getVideoFileExtension } from '../../utils/mediaRecording';
import '../../styles/dashboard.css';

interface DashboardScreenProps {
  layout: KeyboardLayout;
  initialUnanalyzedData?: UnanalyzedSessionData | null;
  initialAnalyzedData?: SessionData | null;
  initialRecordingBlob?: Blob | null;
  onAnalysisComplete: (data: SessionData) => void;
  onSessionLoaded: (data: SessionData) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  layout,
  initialUnanalyzedData,
  initialAnalyzedData,
  initialRecordingBlob,
  onAnalysisComplete,
  onSessionLoaded,
}) => {
  const [error, setError] = useState<string | null>(null);
  const sessionData = initialAnalyzedData || null;
  const unanalyzedData = initialUnanalyzedData || null;
  const recordingBlob = initialRecordingBlob || initialUnanalyzedData?.blob || null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json) as SessionData;
        
        if (!data.keystrokes || !data.frames) {
          throw new Error('Invalid session file format');
        }
        
        setError(null);
        onSessionLoaded(data);
      } catch (err) {
        console.error('Failed to parse session data:', err);
        setError('Failed to load session file. Ensure it is a valid spartan-session JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleExportJSON = () => {
    if (!sessionData) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(sessionData, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `spartan-session-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportRecording = () => {
    if (!recordingBlob) return;
    const url = URL.createObjectURL(recordingBlob);
    const extension = getVideoFileExtension(recordingBlob.type);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `spartan-recording-${Date.now()}.${extension}`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Session Analysis Dashboard</h2>
        <div className="upload-section">
          {sessionData && (
            <button 
              onClick={handleExportJSON}
              className="upload-btn upload-btn-export-json"
            >
              Export Session JSON
            </button>
          )}
          {recordingBlob && (
            <button
              onClick={handleExportRecording}
              className="upload-btn upload-btn-export-recording"
            >
              Export Recording Video
            </button>
          )}
          <label className="upload-btn">
            Load Session JSON
            <input 
              type="file" 
              accept=".json" 
              onChange={handleFileUpload} 
              className="visually-hidden-input"
            />
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!sessionData && !unanalyzedData && !error && (
        <div className="empty-state">
          <p>Upload a recorded spartan-session JSON file to view your typing analysis.</p>
        </div>
      )}

      {!sessionData && unanalyzedData && !error && (
        <AnalysisPhase
          unanalyzedData={unanalyzedData}
          layout={layout}
          onAnalysisComplete={onAnalysisComplete}
        />
      )}

      {sessionData && (
        <div className="dashboard-content">
          <div className="dashboard-main-grid">
            {/* Left side: scores and habits */}
            <div className="dashboard-summary-column">
              <ScoreSummary keystrokes={sessionData.keystrokes} />
              <HabitAnalyzer keystrokes={sessionData.keystrokes} />
            </div>
            
            {/* Right side: generated tree */}
            <div className="dashboard-tree-column">
              <PlantTreeCanvas 
                correctCount={sessionData.keystrokes.filter(k => k.isCorrectFinger).length}
                incorrectCount={sessionData.keystrokes.filter(k => !k.isCorrectFinger).length}
                lastPressedKey={sessionData.keystrokes.length > 0 ? sessionData.keystrokes[sessionData.keystrokes.length - 1].key : null}
                width={320}
                height={380}
              />
            </div>
          </div>

          <div className="heatmap-section">
            <h3>Error Heatmap</h3>
            <p className="subtitle">Keys colored red indicate a higher frequency of incorrect finger usage.</p>
            <div className="heatmap-scroll">
              <KeyboardHeatmap layout={layout} keystrokes={sessionData.keystrokes} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
