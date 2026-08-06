export const PREFERRED_RECORDING_MIME_TYPES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm',
  'video/mp4',
] as const;

export function selectSupportedRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string | undefined {
  return PREFERRED_RECORDING_MIME_TYPES.find(isTypeSupported);
}

export function getVideoFileExtension(mimeType: string): 'webm' | 'mp4' | 'mov' {
  const normalizedType = mimeType.toLowerCase();
  if (normalizedType.includes('mp4')) return 'mp4';
  if (normalizedType.includes('quicktime')) return 'mov';
  return 'webm';
}
