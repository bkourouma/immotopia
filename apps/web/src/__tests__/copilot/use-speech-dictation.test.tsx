import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendDictation, speechLangFor, useSpeechDictation } from '../../hooks/useSpeechDictation';

/** Faux SpeechRecognition : garde l'instance pour déclencher les événements à la main. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
}

const result = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal });
const emit = (r: FakeRecognition, results: ReturnType<typeof result>[], resultIndex = 0) =>
  r.onresult?.({ resultIndex, results });

const w = window as unknown as Record<string, unknown>;

beforeEach(() => {
  FakeRecognition.instances = [];
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});
afterEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
});

describe('speechLangFor / appendDictation', () => {
  it('associe la langue de l’interface à une locale de reconnaissance', () => {
    expect(speechLangFor('fr')).toBe('fr-FR');
    expect(speechLangFor('en')).toBe('en-US');
    expect(speechLangFor('ar')).toBe('ar');
  });

  it('insère le texte avec une espace seulement si nécessaire', () => {
    expect(appendDictation('', 'bonjour')).toBe('bonjour');
    expect(appendDictation('Salut', 'bonjour')).toBe('Salut bonjour');
    expect(appendDictation('Salut ', 'bonjour')).toBe('Salut bonjour');
  });
});

describe('useSpeechDictation', () => {
  it('est indisponible quand l’API est absente', () => {
    const { result: hook } = renderHook(() => useSpeechDictation({ language: 'fr', onFinal: vi.fn() }));
    expect(hook.current.supported).toBe(false);
    act(() => hook.current.start());
    expect(hook.current.listening).toBe(false);
  });

  it('utilise webkitSpeechRecognition et la langue active', () => {
    w.webkitSpeechRecognition = FakeRecognition;
    const { result: hook } = renderHook(() => useSpeechDictation({ language: 'en', onFinal: vi.fn() }));
    expect(hook.current.supported).toBe(true);
    act(() => hook.current.start());
    const rec = FakeRecognition.instances[0];
    expect(rec.lang).toBe('en-US');
    expect(rec.interimResults).toBe(true);
    expect(rec.start).toHaveBeenCalled();
    expect(hook.current.listening).toBe(true);
  });

  it('affiche le texte provisoire puis remet le texte définitif à onFinal', () => {
    w.SpeechRecognition = FakeRecognition;
    const onFinal = vi.fn();
    const { result: hook } = renderHook(() => useSpeechDictation({ language: 'fr', onFinal }));
    act(() => hook.current.start());
    const rec = FakeRecognition.instances[0];

    act(() => emit(rec, [result('bonj', false)]));
    expect(hook.current.interim).toBe('bonj');
    expect(onFinal).not.toHaveBeenCalled();

    act(() => emit(rec, [result('bonjour', true)]));
    expect(onFinal).toHaveBeenCalledWith('bonjour');
    expect(hook.current.interim).toBe('');
  });

  it('garde le texte provisoire restant à l’arrêt et repasse en veille', () => {
    w.SpeechRecognition = FakeRecognition;
    const onFinal = vi.fn();
    const { result: hook } = renderHook(() => useSpeechDictation({ language: 'fr', onFinal }));
    act(() => hook.current.start());
    act(() => emit(FakeRecognition.instances[0], [result('reste', false)]));
    act(() => hook.current.stop());
    expect(onFinal).toHaveBeenCalledWith('reste');
    expect(hook.current.listening).toBe(false);
  });

  it('signale un refus de permission par un message, sans lever', () => {
    w.SpeechRecognition = FakeRecognition;
    const { result: hook } = renderHook(() => useSpeechDictation({ language: 'fr', onFinal: vi.fn() }));
    act(() => hook.current.start());
    act(() => FakeRecognition.instances[0].onerror?.({ error: 'not-allowed' }));
    expect(hook.current.error).toMatch(/micro/);
  });

  it('coupe le micro au démontage sans rien insérer', () => {
    w.SpeechRecognition = FakeRecognition;
    const onFinal = vi.fn();
    const { result: hook, unmount } = renderHook(() => useSpeechDictation({ language: 'fr', onFinal }));
    act(() => hook.current.start());
    act(() => emit(FakeRecognition.instances[0], [result('x', false)]));
    unmount();
    expect(FakeRecognition.instances[0].abort).toHaveBeenCalled();
    expect(onFinal).not.toHaveBeenCalled();
  });
});
