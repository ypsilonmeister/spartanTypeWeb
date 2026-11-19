import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageContext } from '../../../i18n/languageContext';
import { TrainerControls } from '../TrainerControls';

type TrainerControlsProps = Parameters<typeof TrainerControls>[0];

function renderControls(overrides: Partial<TrainerControlsProps> = {}) {
  const props: TrainerControlsProps = {
    hasCalibration: true,
    isRecording: false,
    isStartingRecording: false,
    cameraSource: 'local',
    remoteStatus: 'idle',
    offer: null,
    onCameraSourceChange: vi.fn(),
    onSubmitAnswer: vi.fn(),
    onRestartRemote: vi.fn(),
    practiceCategory: 'plant',
    practiceCategoryLabels: {
      plant: 'Plant',
      programmer: 'Programmer',
      beginner: 'Beginner',
    },
    onPracticeCategoryChange: vi.fn(),
    analysisMode: 'offline',
    onAnalysisModeChange: vi.fn(),
    isWorkerReady: true,
    recordingCapability: { available: true, mimeType: 'video/webm' },
    onToggleRecording: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(
    <LanguageContext.Provider value={{ lang: 'en', setLang: vi.fn(), t: (key) => key }}>
      <TrainerControls {...props} />
    </LanguageContext.Provider>
  );
}

describe('TrainerControls', () => {
  it('allows switching analysis mode and starting when idle', () => {
    const html = renderControls({ isRecording: false, isStartingRecording: false });
    expect(html).toContain('<button class="trainer-mode-btn is-active">trainer.modeOffline</button>');
    expect(html).toContain('<button class="trainer-mode-btn">trainer.modeRealtime</button>');
    expect(html).toContain('<button class="trainer-record-btn">trainer.startBtn</button>');
  });

  it('disables analysis mode switching, category switching, camera selector, and start button while starting recording', () => {
    const html = renderControls({ isRecording: false, isStartingRecording: true });
    expect(html).toContain('<button disabled="" class="trainer-mode-btn is-active">trainer.modeOffline</button>');
    expect(html).toContain('<button disabled="" class="trainer-mode-btn">trainer.modeRealtime</button>');
    expect(html).toContain('<button disabled="" class="trainer-category-btn is-active">Plant</button>');
    expect(html).toContain('<button disabled="" class="trainer-record-btn">trainer.startBtn</button>');
    expect(html).not.toContain('cam-source');
  });
});
