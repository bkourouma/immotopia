import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp, Form } from 'antd';
import { AmendmentModal } from '../../components/rental/lifecycle/AmendmentModal';
import { RevisionModal } from '../../components/rental/lifecycle/RevisionModal';
import { DepositMovementForm } from '../../components/rental/DepositMovementForm';
import { FeeTermsFields } from '../../components/settings/FeeTermsFields';

/**
 * Recette locatif : le texte d'aide d'un champ ne doit pas masquer son message
 * de validation (BUG-2026-11-03-029 et -034), un champ numérique ne recadre pas
 * en silence (BUG-2026-11-03-026 et -031).
 */

vi.mock('../../services/rental-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/rental-service')>();
  return { ...actual, listPayments: vi.fn().mockResolvedValue({ success: true, data: [] }) };
});
vi.mock('../../components/finance/TreasuryAccountSelector', () => ({
  TreasuryAccountSelector: () => <div>compte</div>
}));

const OPTS = { timeout: 8000 };

beforeEach(() => vi.clearAllMocks());

describe('AmendmentModal — objet vide (029)', () => {
  it('affiche « L’objet de l’avenant est requis » et pas seulement l’aide', async () => {
    const onSubmit = vi.fn();
    render(
      <AntApp>
        <AmendmentModal open onCancel={vi.fn()} onSubmit={onSubmit} />
      </AntApp>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText("L'objet de l'avenant est requis", {}, OPTS)).toBeInTheDocument();
    // L'aide reste visible en même temps.
    expect(screen.getByText("Déposez l'avenant signé dans l'onglet Documents.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('RevisionModal — charges négatives (031)', () => {
  it('refuse -5 avec un message, sans recadrer à 0 ni envoyer', async () => {
    const onSubmit = vi.fn();
    render(
      <AntApp>
        <RevisionModal open currentRent={155000} currentCharges={10000} onCancel={vi.fn()} onSubmit={onSubmit} />
      </AntApp>
    );
    const charges = await screen.findByLabelText('Nouvelles charges');
    await userEvent.clear(charges);
    await userEvent.type(charges, '-5');
    await userEvent.tab();
    expect(charges).toHaveValue('-5');

    await userEvent.click(screen.getByRole('button', { name: 'Réviser' }));

    expect(await screen.findByText('Les charges ne peuvent pas être négatives', {}, OPTS)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('DepositMovementForm — collecte sans paiement (034)', () => {
  it('affiche « Le paiement est requis pour une collecte »', async () => {
    const onSubmit = vi.fn();
    render(
      <AntApp>
        <DepositMovementForm
          tenantId="agence-1"
          leaseId="bail-1"
          deposit={{ id: 'd1', target_amount: 800000 } as never}
          onSubmit={onSubmit}
        />
      </AntApp>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Le paiement est requis pour une collecte', {}, OPTS)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('FeeTermsFields — forfait 0 (026)', () => {
  it('garde 0 dans le champ et affiche « Le forfait doit être supérieur à 0 »', async () => {
    const onFinish = vi.fn();
    render(
      <Form initialValues={{ managementFeeMode: 'FIXED' }} onFinish={onFinish}>
        <FeeTermsFields />
        <button type="submit">Valider</button>
      </Form>
    );
    const champ = await screen.findByLabelText('Forfait par échéance (FCFA)');
    await userEvent.type(champ, '0');
    await userEvent.tab();
    expect(champ).toHaveValue('0');

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText('Le forfait doit être supérieur à 0', {}, OPTS)).toBeInTheDocument();
    await waitFor(() => expect(onFinish).not.toHaveBeenCalled());
  });
});
