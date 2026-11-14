import { useCallback, useEffect, useRef, useState } from 'react';

function splitSpeech(text: string): string[] {
  return text.match(/.{1,180}(?:[.!?؟](?=\s|$)|\s|$)|.{1,180}/gu) ?? [];
}

export function useCopilotSpeech(language: string, tenantId: string) {
  const [activeId, setActiveId] = useState<string>();
  const current = useRef<SpeechSynthesisUtterance>();
  const supported =
    typeof window !== 'undefined' && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';

  const cancel = useCallback(() => {
    if (!current.current) return;
    current.current = undefined;
    window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    cancel();
    setActiveId(undefined);
  }, [cancel]);

  useEffect(() => {
    stop();
    return cancel;
  }, [cancel, stop, tenantId, language]);

  function read(messageId: string, text: string, onError: () => void) {
    if (!supported) return;
    stop();
    const chunks = splitSpeech(text.replace(/\s+/g, ' ').trim());
    function speakNext() {
      const chunk = chunks.shift();
      if (!chunk) {
        stop();
        return;
      }
      const utterance = new window.SpeechSynthesisUtterance(chunk.trim());
      utterance.lang = language;
      utterance.onend = () => {
        if (current.current !== utterance) return;
        current.current = undefined;
        speakNext();
      };
      const fail = () => {
        if (current.current !== utterance) return;
        stop();
        onError();
      };
      utterance.onerror = fail;
      current.current = utterance;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        fail();
      }
    }
    setActiveId(messageId);
    speakNext();
  }

  return { supported, activeId, read, stop };
}
