import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopilotMessageList } from '../../components/copilot/CopilotMessageList';
import type { CopilotArtifact } from '../../types/copilot';

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

  it('attache une source à son passage uniquement si le résultat avec provenance figure déjà dans le fil', () => {
    const id = 'b28bbb95-9e54-48a4-9c6f-9b044f4a21b6';
    const missing = 'fd0ca857-d4e6-44e1-98be-f5445573c9f1';
    const later = '7b9fab49-f6b6-48f8-a729-f22e19be4932';
    const artifact: CopilotArtifact = {
      id,
      kind: 'table',
      title: 'Échéances',
      columns: [{ key: 'amount', label: 'Solde' }],
      rows: [{ amount: 50000 }],
      provenance: {
        source: 'Échéances locatives',
        href: '/tenant/agency/rental/installments',
        period: '2026-10',
        calculatedAt: '2026-11-15T00:00:00Z',
        rules: []
      }
    };
    const open = vi.fn();
    const { container } = render(
      <CopilotMessageList
        {...props}
        artifacts={[artifact, { ...artifact, id: later, title: 'Plus tard' }]}
        messages={[
          {
            ...answer,
            text: `Solde de 50 000. [[source:${id}:2]]\n\nSans source. [[source:${missing}]] [[source:${later}]]`,
            attachments: [{ kind: 'artifact', artifactId: id, artifactKind: 'table', title: artifact.title }]
          },
          {
            ...answer,
            id: 'later',
            attachments: [{ kind: 'artifact', artifactId: later, artifactKind: 'table', title: 'Plus tard' }]
          }
        ]}
        onOpenArtifact={open}
      />
    );
    const button = screen.getByRole('button', { name: 'Voir la source : Échéances' });
    expect(button.closest('p')).toHaveTextContent('Solde de 50 000.');
    expect(screen.queryByRole('button', { name: 'Voir la source : Plus tard' })).toBeNull();
    expect(container).not.toHaveTextContent('[[source:');
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(id, 2);
  });
});
