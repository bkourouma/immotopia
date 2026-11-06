import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentForm } from '../../components/rental/PaymentForm';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';
import { libelleMethodePaiement } from '../../lib/rental-payment-status';

/**
 * D23 — BUG-2026-11-04-033 (paiement sans bail), -034 (virgule décimale),
 * -039 (méthode en code brut).
 */

const listLeases = vi.fn();

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listLeases: (...a: unknown[]) => listLeases(...a), listInstallments: vi.fn() };
});
vi.mock('../../services/treasury-service', () => ({
  listTreasuryAccounts: vi.fn().mockResolvedValue([])
}));

const BAIL = {
  id: 'bail-9',
  lease_number: 'BAIL-2026-0109',
  currency: 'FCFA',
  property: { title: 'Villa Riviera' },
  primaryRenter: { id: 'cli-1', user: { fullName: 'Yao N’Dri' } }
};

function monter(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>{ui}</AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  listLeases.mockReset();
  listLeases.mockResolvedValue({ success: true, data: [BAIL], pagination: { total: 1 } });
});

describe('Nouveau paiement depuis la liste globale', () => {
  it('exige un bail : sans lui, rien n’est envoyé', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    monter(<PaymentForm tenantId="agence-1" onSubmit={onSubmit} />);

    await user.type(await screen.findByPlaceholderText('Ex: 150000'), '5000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    expect(await screen.findByText('Choisissez le bail concerné par ce paiement')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envoie le bail choisi avec la recherche, et lit « 1500,5 » comme 1 500,50', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    monter(<PaymentForm tenantId="agence-1" onSubmit={onSubmit} />);

    const champBail = await screen.findByRole('combobox', { name: /Bail/ });
    await user.click(champBail);
    await user.type(champBail, 'Riviera');
    await user.click(await screen.findByText(/BAIL-2026-0109 — Villa Riviera — Yao N’Dri/, {}, { timeout: 8000 }));
    await waitFor(() =>
      expect(listLeases).toHaveBeenCalledWith('agence-1', expect.objectContaining({ search: 'Riviera' }))
    );

    await user.type(screen.getByPlaceholderText('Ex: 150000'), '1500,5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le paiement' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ leaseId: 'bail-9', amount: 1500.5 });
  });

  it('n’affiche pas le sélecteur quand le bail est imposé (onglet d’un bail)', async () => {
    monter(<PaymentForm tenantId="agence-1" leaseId="bail-1" onSubmit={vi.fn()} />);
    await screen.findByPlaceholderText('Ex: 150000');
    expect(screen.queryByRole('combobox', { name: /Bail/ })).toBeNull();
  });
});

describe('Affecter un paiement sans bail (anciennes données)', () => {
  it('affiche un message au lieu de « Chargement des échéances… »', async () => {
    monter(
      <AllocatePaymentForm
        tenantId="agence-1"
        payment={{ id: 'p1', lease_id: null, amount: 5000, currency: 'FCFA', status: 'SUCCESS' } as never}
        onSubmit={vi.fn()}
      />
    );
    expect(await screen.findByText(/n'est rattaché à aucun bail/)).toBeInTheDocument();
    expect(screen.queryByText(/Chargement des échéances/)).toBeNull();
  });
});

describe('Libellé de la méthode de paiement', () => {
  it('traduit les codes au lieu de les afficher bruts', () => {
    expect(libelleMethodePaiement('BANK_TRANSFER')).toBe('Virement bancaire');
    expect(libelleMethodePaiement('CASH')).toBe('Espèces');
    expect(libelleMethodePaiement('INCONNU')).toBe('INCONNU');
  });
});
