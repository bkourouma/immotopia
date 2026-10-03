import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopilotArtifact, CopilotSseEvent } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';
import { useCopilotChat } from '../../hooks/useCopilotChat';

const streamChat = vi.mocked(copilotService.streamChat);

const table = (id: string, title = 'Loyers'): CopilotArtifact => ({
  kind: 'table',
  id,
  title,
  columns: [{ key: 'a', label: 'A' }],
  rows: [{ a: 1 }]
});

function script(events: CopilotSseEvent[]) {
  streamChat.mockImplementation(async (_t, _r, opts) => {
    events.forEach(e => opts.onEvent(e));
    opts.onEvent({ type: 'done', reason: 'end_turn' });
  });
}

beforeEach(() => vi.clearAllMocks());

describe('useCopilotChat — artefacts', () => {
  it('conserve les artefacts, sélectionne le dernier et référence l’artefact dans le message', async () => {
    script([
      { type: 'artifact', artifact: table('a1', 'Premier') },
      { type: 'artifact', artifact: { kind: 'markdown', id: 'a2', title: 'Note', content: 'x' } }
    ]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('tableau', {});
    });
    expect(result.current.artifacts.map(a => a.id)).toEqual(['a1', 'a2']);
    expect(result.current.selectedArtifactId).toBe('a2');
    expect(result.current.messages[1].attachments).toEqual([
      { kind: 'artifact', artifactId: 'a1', title: 'Premier', artifactKind: 'table' },
      { kind: 'artifact', artifactId: 'a2', title: 'Note', artifactKind: 'markdown' }
    ]);
  });

  it('remplace un artefact de même id sans doublon et ignore les artefacts mal formés', async () => {
    script([
      { type: 'artifact', artifact: table('a1', 'V1') },
      { type: 'artifact', artifact: table('a1', 'V2') },
      { type: 'artifact', artifact: { kind: 'table', id: 'x' } as unknown as CopilotArtifact }
    ]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('tableau', {});
    });
    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.artifacts[0].title).toBe('V2');
    expect(result.current.messages[1].attachments).toHaveLength(1);
  });

  it('selectArtifact change la sélection et ignore un id inconnu', async () => {
    script([
      { type: 'artifact', artifact: table('a1') },
      { type: 'artifact', artifact: table('a2') }
    ]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('tableau', {});
    });
    act(() => result.current.selectArtifact('a1'));
    expect(result.current.selectedArtifactId).toBe('a1');
    act(() => result.current.selectArtifact('inconnu'));
    expect(result.current.selectedArtifactId).toBe('a1');
  });

  it('reset vide les artefacts', async () => {
    script([{ type: 'artifact', artifact: table('a1') }]);
    const { result } = renderHook(() => useCopilotChat('t1'));
    await act(async () => {
      await result.current.send('tableau', {});
    });
    act(() => result.current.reset());
    expect(result.current.artifacts).toEqual([]);
    expect(result.current.selectedArtifactId).toBeUndefined();
  });
});
