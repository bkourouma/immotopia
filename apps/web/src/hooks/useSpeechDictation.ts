import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n/t';

/**
 * Typage minimal de la Web Speech API : `lib.dom` ne la décrit pas. Seul ce
 * que le hook utilise est déclaré.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** Langue de reconnaissance (BCP-47) pour une langue d'interface. */
const SPEECH_LANGS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ar: 'ar' };

export function speechLangFor(language: string): string {
  return SPEECH_LANGS[language] ?? 'fr-FR';
}

/** Lu à chaque appel (pas au chargement du module) : le navigateur peut changer, les tests stubent `window`. */
function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function errorMessage(code: string): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return t("L'accès au micro est refusé. Autorisez-le dans votre navigateur pour dicter.");
    case 'audio-capture':
      return t('Aucun micro détecté.');
    case 'no-speech':
      return t('Aucune voix détectée. Réessayez.');
    case 'network':
      return t('Le service de dictée est injoignable.');
    default:
      return t('La dictée a échoué. Réessayez.');
  }
}

export interface UseSpeechDictationOptions {
  /** Code de langue de l'interface (`fr`, `en`, `ar`). */
  language: string;
  /** Texte définitif reconnu : à ajouter à la zone de saisie. Jamais d'envoi automatique. */
  onFinal(text: string): void;
}

export interface UseSpeechDictationResult {
  /** Faux si le navigateur n'a pas la Web Speech API : le bouton est alors masqué. */
  supported: boolean;
  listening: boolean;
  /** Texte provisoire en cours de reconnaissance, à afficher à la suite de la saisie. */
  interim: string;
  /** Message lisible de la dernière erreur, ou `null`. */
  error: string | null;
  start(): void;
  stop(): void;
  toggle(): void;
}

/**
 * Dictée vocale par la Web Speech API du navigateur. Aucune donnée audio ne
 * passe par notre serveur (le navigateur peut toutefois utiliser son propre
 * service de reconnaissance).
 */
export function useSpeechDictation({ language, onFinal }: UseSpeechDictationOptions): UseSpeechDictationResult {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const interimRef = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const supported = getRecognitionCtor() !== null;

  const setInterimText = (value: string) => {
    interimRef.current = value;
    setInterim(value);
  };

  const detach = useCallback((recognition: SpeechRecognitionLike | null) => {
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    setError(null);
    const recognition = new Ctor();
    recognition.lang = speechLangFor(language);
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = event => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText.trim()) onFinalRef.current(finalText.trim());
      setInterimText(interimText.trim());
    };
    recognition.onerror = event => {
      const message = errorMessage(event.error);
      if (message) setError(message);
    };
    recognition.onend = () => {
      // Texte provisoire non finalisé à l'arrêt : on le garde plutôt que de le perdre.
      if (interimRef.current) onFinalRef.current(interimRef.current);
      setInterimText('');
      detach(recognition);
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      detach(recognition);
      recognitionRef.current = null;
      setError(t('La dictée a échoué. Réessayez.'));
    }
  }, [language, detach]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  // Changer de langue en pleine dictée : la reconnaissance garde l'ancienne langue, on l'arrête.
  useEffect(() => {
    recognitionRef.current?.stop();
  }, [language]);

  // Démontage : coupe le micro sans rien insérer.
  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      detach(recognition);
      recognition.abort();
      recognitionRef.current = null;
    },
    [detach]
  );

  return { supported, listening, interim, error, start, stop, toggle };
}

/** Insère un texte dicté à la suite de la saisie, avec une espace si besoin. */
export function appendDictation(draft: string, text: string): string {
  if (!text) return draft;
  if (!draft || /\s$/.test(draft)) return `${draft}${text}`;
  return `${draft} ${text}`;
}
