import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopilotStatus } from '../../types/copilot';

vi.mock('../../services/copilot-service', () => {
  const service = { getStatus: vi.fn(), streamChat: vi.fn(), executeProposal: vi.fn() };
  return { default: service, copilotService: service };
});

import copilotService from '../../services/copilot-service';
import { useCopilotStatus } from '../../hooks/useCopilotStatus';

const getStatus = vi.mocked(copilotService.getStatus);
const ENABLED: CopilotStatus = {
  enabled: true,
  provider: 'fake',
  tools: [],
  limits: { maxMessages: 20, maxMessageChars: 2000 }
};

const Probe: React.FC<{ id: string; tenantId: string }> = ({ id, tenantId }) => {
  const status = useCopilotStatus(tenantId);
  return <span data-testid={id}>{status === null ? 'inconnu' : status.enabled ? 'actif' : 'inactif'}</span>;
};

beforeEach(() => getStatus.mockReset());

describe('useCopilotStatus — requête partagée', () => {
  it('une seule requête pour plusieurs instances montées ensemble', async () => {
    getStatus.mockResolvedValue(ENABLED);
    render(
      <>
        <Probe id="a" tenantId="t1" />
        <Probe id="b" tenantId="t1" />
        <Probe id="c" tenantId="t1" />
      </>
    );
    await waitFor(() => expect(screen.getByTestId('c')).toHaveTextContent('actif'));
    expect(screen.getByTestId('a')).toHaveTextContent('actif');
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it('une autre agence déclenche sa propre requête', async () => {
    getStatus.mockResolvedValueOnce(ENABLED).mockResolvedValueOnce({ ...ENABLED, enabled: false });
    const { rerender } = render(<Probe id="a" tenantId="t1" />);
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('actif'));
    rerender(<Probe id="a" tenantId="t2" />);
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('inactif'));
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("une erreur inattendue laisse l'assistant masqué sans bloquer les montages suivants", async () => {
    getStatus.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ENABLED);
    const first = render(<Probe id="a" tenantId="t1" />);
    await waitFor(() => expect(screen.getByTestId('a')).toHaveTextContent('inconnu'));
    await Promise.resolve();
    first.unmount();
    render(<Probe id="b" tenantId="t1" />);
    await waitFor(() => expect(screen.getByTestId('b')).toHaveTextContent('actif'));
  });
});
