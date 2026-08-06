import { describe, expect, it, vi } from 'vitest';
import {
  getVideoFileExtension,
  selectSupportedRecordingMimeType,
} from '../mediaRecording';

describe('selectSupportedRecordingMimeType', () => {
  it('prefers WebM when the browser supports it', () => {
    const isTypeSupported = vi.fn((type: string) => (
      type === 'video/webm;codecs=vp8' || type === 'video/mp4'
    ));

    expect(selectSupportedRecordingMimeType(isTypeSupported)).toBe('video/webm;codecs=vp8');
  });

  it('falls back to MP4 when WebM recording is unsupported', () => {
    const isTypeSupported = vi.fn((type: string) => type === 'video/mp4');

    expect(selectSupportedRecordingMimeType(isTypeSupported)).toBe('video/mp4');
  });

  it('lets the browser choose when none of the preferred types is supported', () => {
    expect(selectSupportedRecordingMimeType(() => false)).toBeUndefined();
  });
});

describe('getVideoFileExtension', () => {
  it.each([
    ['video/webm;codecs=vp8', 'webm'],
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/quicktime', 'mov'],
  ])('maps %s to .%s', (mimeType, extension) => {
    expect(getVideoFileExtension(mimeType)).toBe(extension);
  });
});
