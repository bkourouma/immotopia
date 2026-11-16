import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import PinnedAnalyses from '../../components/home/PinnedAnalyses';
import { copilotService } from '../../services/copilot-service';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'recipient' } }) }));
vi.mock('../../hooks/useCopilotStatus', () => ({ useCopilotStatus: () => ({ enabled: true }) }));
vi.mock('../../services/copilot-service', () => ({
  copilotService: {
    listAnalysisPins: vi.fn(),
    getSharedAnalysis: vi.fn(),
    listSavedAnalysisPins: vi.fn(),
    getSavedAnalysisPin: vi.fn()
  }
}));

it('affiche seulement les analyses autorisées et retire la vignette après révocation', async () => {
  vi.mocked(copilotService.listAnalysisPins).mockResolvedValue([{ id: 'authorized' }, { id: 'unavailable' }]);
  const privatePin = { conversationId: 'thread', artifactId: 'own' };
  vi.mocked(copilotService.listSavedAnalysisPins).mockResolvedValue([privatePin]);
  vi.mocked(copilotService.getSavedAnalysisPin).mockResolvedValue({
    kind: 'markdown',
    id: 'own',
    title: 'Bilan privé',
    content: 'Mon bilan'
  });
  vi.mocked(copilotService.getSharedAnalysis).mockImplementation(async (_tenant, id) => {
    if (id !== 'authorized') throw new Error('404');
    return {
      kind: 'table',
      id: 'table',
      title: 'Encaissements du mois',
      columns: [{ key: 'amount', label: 'Montant' }],
      rows: [{ amount: 45 }]
    };
  });
  render(
    <MemoryRouter>
      <PinnedAnalyses tenantId="agency" />
    </MemoryRouter>
  );
  expect(await screen.findByText('Encaissements du mois')).toBeInTheDocument();
  await screen.findByText('Bilan privé');
  expect(screen.getAllByRole('link', { name: 'Ouvrir' }).map(link => link.getAttribute('href'))).toEqual([
    '/tenant/agency/assistant?partage=authorized',
    '/tenant/agency/assistant?fil=thread&analyse=own'
  ]);
  vi.mocked(copilotService.getSharedAnalysis).mockRejectedValue(new Error('404'));
  fireEvent.focus(window);
  await waitFor(() => expect(copilotService.getSharedAnalysis).toHaveBeenCalledTimes(4));
  expect(screen.queryByText('Encaissements du mois')).not.toBeInTheDocument();
  expect(await screen.findByText('Bilan privé')).toBeInTheDocument();
});
