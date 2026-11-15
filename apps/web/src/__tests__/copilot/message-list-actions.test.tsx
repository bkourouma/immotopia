import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopilotMessageList } from '../../components/copilot/CopilotMessageList';

describe('CopilotMessageList voice and clipboard actions', () => {
  const props = { tenantId: 'agency', onConfirm: vi.fn(), onCancel: vi.fn() };
  const answer = { id: 'reply', role: 'assistant' as const, text: 'Votre analyse est prête.', attachments: [] };

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ends speech when the response disappears and ignores the previous utterance callback', () => {
    class Utterance {
      lang = '';
      onend?: () => void;
      constructor(readonly text: string) {}
    }
    const speak = vi.fn<(utterance: Utterance) => void>();
    const cancel = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', { speak, cancel });
    const { rerender } = render(<CopilotMessageList {...props} messages={[answer]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire à voix haute' }));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: answer.text, lang: 'fr-FR' }));
    expect(screen.getByRole('button', { name: 'Arrêter la lecture' })).toBeVisible();

    rerender(<CopilotMessageList {...props} messages={[{ ...answer, id: 'other' }]} />);
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Lire à voix haute' }));
    act(() => speak.mock.calls[0][0].onend?.());
    expect(screen.getByRole('button', { name: 'Arrêter la lecture' })).toBeVisible();
    act(() => speak.mock.calls[1][0].onend?.());
    expect(screen.getByRole('button', { name: 'Lire à voix haute' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Lire à voix haute' }));
    rerender(<CopilotMessageList {...props} messages={[{ ...answer, id: 'other' }]} visible={false} />);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('copies the complete response and hides the action during streaming', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const { rerender } = render(<CopilotMessageList {...props} messages={[answer]} streaming />);
      expect(screen.queryByRole('button', { name: 'Copier la réponse' })).toBeNull();
      rerender(<CopilotMessageList {...props} messages={[answer]} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copier la réponse' }));
      });
      expect(writeText).toHaveBeenCalledWith(answer.text);
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
