/** L'objet annonce par S3 depasse `LIVEKIT_RECORDING_MAX_BYTES` : rien n'est telecharge. */
export class RecordingTooLargeError extends Error {
  constructor() {
    super('Recording object is too large');
    this.name = 'RecordingTooLargeError';
  }
}
