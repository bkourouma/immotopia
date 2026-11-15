import { useEffect, useRef, useState } from 'react';
import { t as applicationTranslation } from '../i18n/t';

const audioTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

export function useRecordedDictation(
  transcribe: ((audio: Blob, signal: AbortSignal, durationSeconds: number) => Promise<string>) | undefined,
  onFinal: (text: string) => void,
  t: (text: string) => string = applicationTranslation
) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'processing'>('idle');
  const [error, setError] = useState('');
  const active = useRef<{
    abort: AbortController;
    stream?: MediaStream;
    recorder?: MediaRecorder;
    timer?: ReturnType<typeof setTimeout>;
  }>();
  const final = useRef(onFinal);
  final.current = onFinal;

  useEffect(
    () => () => {
      const session = active.current;
      active.current = undefined;
      session?.abort.abort();
      clearTimeout(session?.timer);
      if (session?.recorder?.state === 'recording') session.recorder.stop();
      session?.stream?.getTracks().forEach(track => track.stop());
    },
    []
  );

  const mime =
    transcribe && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'
      ? audioTypes.find(type => MediaRecorder.isTypeSupported(type))
      : undefined;

  async function toggle() {
    if (!mime || !transcribe) return;
    if (active.current?.recorder?.state === 'recording') {
      active.current.recorder.stop();
      return;
    }
    if (active.current) return;
    active.current = { abort: new AbortController() };
    const session = active.current;
    setError('');
    setPhase('starting');
    function finish() {
      clearTimeout(session.timer);
      session.stream?.getTracks().forEach(track => track.stop());
      if (active.current === session) {
        active.current = undefined;
        setPhase('idle');
      }
    }
    function fail() {
      if (active.current === session) setError(t('Impossible de transcrire cet enregistrement.'));
      finish();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      session.stream = stream;
      if (active.current !== session) {
        finish();
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
      session.recorder = recorder;
      const parts: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) parts.push(event.data);
      };
      recorder.onerror = fail;
      const started = performance.now();
      recorder.onstop = async () => {
        clearTimeout(session.timer);
        stream.getTracks().forEach(track => track.stop());
        if (active.current !== session) return;
        setPhase('processing');
        try {
          const audio = new Blob(parts, { type: recorder.mimeType.split(';')[0] || mime.split(';')[0] });
          const durationSeconds = Math.min(3600, (performance.now() - started) / 1000);
          const text = await transcribe(audio, session.abort.signal, durationSeconds);
          if (active.current === session) {
            if (text) final.current(text);
            else setError(t('Aucune parole reconnue.'));
          }
          finish();
        } catch {
          fail();
        }
      };
      recorder.start();
      setPhase('recording');
      session.timer = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 60_000);
    } catch {
      fail();
    }
  }
  return { supported: !!mime, phase, error, toggle };
}
