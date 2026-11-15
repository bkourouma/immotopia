import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import AuthContext from '../../context/AuthContext';
import type { AuthContextType } from '../../types/auth-types';
import { BudgetAlertThreshold } from '../../components/finance/BudgetAlertThreshold';
import { getSiteBudgetThreshold, updateSiteBudgetThreshold } from '../../services/finance-lot3-service';

vi.mock('../../services/finance-lot3-service', () => ({
  getSiteBudgetThreshold: vi.fn(),
  updateSiteBudgetThreshold: vi.fn()
}));

it('ouvre le seuil prérempli puis attend le clic pour enregistrer', async () => {
  vi.mocked(getSiteBudgetThreshold).mockResolvedValue({
    name: 'Atrium',
    status: 'IN_PROGRESS',
    budgetThresholdPercent: 90
  });
  vi.mocked(updateSiteBudgetThreshold).mockResolvedValue(undefined);
  const auth = { hasPermission: () => true } as unknown as AuthContextType;
  render(
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/tenant/t1/finance/chantiers/site-1/budget?alerte-budget=80']}>
          <BudgetAlertThreshold tenantId="t1" siteId="site-1" />
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
  expect(await screen.findByText('Atrium')).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Seuil du budget révisé (%)' })).toHaveValue('80');
  expect(updateSiteBudgetThreshold).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(updateSiteBudgetThreshold).toHaveBeenCalledWith('t1', 'site-1', 80, 90));
});
