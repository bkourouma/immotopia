import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { LeaseFormWizard } from '../../components/rental/LeaseFormWizard';

/**
 * Assistant de bail — BUG-2026-11-04-056 (H40 : une saisie n'est jamais
 * transformée en silence) et -058 (refus du serveur visible à l'étape Notes).
 */

vi.mock('../../services/rental-service', () => ({
  RentalBillingFrequency: { MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', SEMIANNUAL: 'SEMIANNUAL', ANNUAL: 'ANNUAL' }
}));
vi.mock('../../services/property-service', () => ({
  listProperties: () => Promise.resolve({ properties: [] }),
  getProperty: vi.fn()
}));
vi.mock('../../services/crm-service', () => ({
  listContacts: () => Promise.resolve({ success: true, contacts: [] })
}));
vi.mock('../../hooks/useMenuAccess', () => ({ useOwnAssetsOnly: () => false }));

const bail: any = {
  id: 'bail-1',
  property_id: 'bien-1',
  primary_renter_client_id: 'client-1',
  owner_client_id: null,
  start_date: '2026-01-01T00:00:00.000Z',
  end_date: '2027-12-31T00:00:00.000Z',
  billing_frequency: 'MONTHLY',
  due_day_of_month: 5,
  currency: 'FCFA',
  rent_amount: 75000,
  service_charge_amount: 0,
  security_deposit_amount: 0,
  penalty_grace_days: 0,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 0,
  penalty_fixed_amount: 0
};

function monter(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AntApp>
      <MemoryRouter>
        <LeaseFormWizard lease={bail} tenantId="agence-1" onSubmit={onSubmit} />
      </MemoryRouter>
    </AntApp>
  );
  return onSubmit;
}

const OPTIONS = { timeout: 8000 };
const sansEspaces = (texte: string) => texte.replace(/\s/g, '');

async function suivant(user: ReturnType<typeof userEvent.setup>, fois: number) {
  for (let i = 0; i < fois; i += 1) {
    const bouton = await screen.findByRole('button', { name: 'Suivant' });
    await waitFor(() => expect((bouton as HTMLButtonElement).disabled).toBe(false), OPTIONS);
    await user.click(bouton);
  }
}

async function champs(user: ReturnType<typeof userEvent.setup>, etapes: number) {
  monter();
  await suivant(user, etapes);
  return screen.findAllByRole('spinbutton', undefined, OPTIONS) as Promise<HTMLInputElement[]>;
}

describe("Assistant de bail — étape financière : aucune saisie n'est transformée", () => {
  it('−5000 dans le loyer reste −5000 et reçoit un message', async () => {
    const user = userEvent.setup({ delay: null });
    const [, loyer] = await champs(user, 2);
    await user.clear(loyer);
    await user.type(loyer, '-5000');

    expect(sansEspaces(loyer.value)).toBe('-5000');
    expect(await screen.findByText('Le montant du loyer doit être supérieur à 0')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('−10000 dans les charges et −100 dans le dépôt reçoivent un message', async () => {
    const user = userEvent.setup({ delay: null });
    const [, , charges, depot] = await champs(user, 2);
    await user.clear(charges);
    await user.type(charges, '-10000');
    await user.clear(depot);
    await user.type(depot, '-100');

    expect(sansEspaces(charges.value)).toBe('-10000');
    expect(sansEspaces(depot.value)).toBe('-100');
    expect((await screen.findAllByText('Le montant doit être positif')).length).toBe(2);
  });

  it('5,5 comme jour d’échéance reste 5,5 et demande un entier', async () => {
    const user = userEvent.setup({ delay: null });
    const [jour] = await champs(user, 2);
    await user.clear(jour);
    await user.type(jour, '5,5');

    expect(jour.value).toBe('5,5');
    expect(await screen.findByText('Saisissez un nombre entier')).toBeTruthy();
  });

  it('1500,5 est accepté tel quel', async () => {
    const user = userEvent.setup({ delay: null });
    const [, loyer] = await champs(user, 2);
    await user.clear(loyer);
    await user.type(loyer, '1500,5');

    expect(sansEspaces(loyer.value)).toBe('1500,5');
    // Le message de l'effacement du champ disparaît avec son animation : on vérifie le bouton, pas le DOM sortant.
    await waitFor(
      () => expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(false),
      OPTIONS
    );
  });

  it('un loyer au-dessus du plafond reçoit un message', async () => {
    const user = userEvent.setup({ delay: null });
    const [, loyer] = await champs(user, 2);
    await user.clear(loyer);
    await user.type(loyer, '99999999999');

    expect(await screen.findByText('Le montant dépasse le maximum autorisé (9 999 999 999,99).')).toBeTruthy();
  });
});

describe('Assistant de bail — étape des pénalités', () => {
  it('2,5 jours de grâce restent 2,5 et demandent un entier', async () => {
    const user = userEvent.setup({ delay: null });
    const [grace] = await champs(user, 3);
    await user.clear(grace);
    await user.type(grace, '2,5');

    expect(grace.value).toBe('2,5');
    expect(await screen.findByText('Saisissez un nombre entier')).toBeTruthy();
  });

  it('un taux de 0,0001 est conservé, sans message', async () => {
    const user = userEvent.setup({ delay: null });
    const [, taux] = await champs(user, 3);
    await user.clear(taux);
    await user.type(taux, '0,0001');

    expect(taux.value).toBe('0,0001');
    expect(screen.queryByText('Le taux doit être positif ou nul')).toBeNull();
    expect((screen.getByRole('button', { name: 'Suivant' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Assistant de bail — refus du serveur à l’étape Notes (BUG-058)', () => {
  it('affiche le message de l’API sans changer d’étape', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockRejectedValue({
      response: { data: { message: "L'opération n'a pas pu être enregistrée. Réessayez." } }
    });
    monter(onSubmit);
    await suivant(user, 4);

    await user.click(await screen.findByRole('button', { name: 'Créer le bail' }));

    expect(
      await screen.findByText("L'opération n'a pas pu être enregistrée. Réessayez.", undefined, OPTIONS)
    ).toBeTruthy();
    // Toujours à l'étape Notes.
    expect(screen.getByPlaceholderText('Ajoutez des notes ou commentaires concernant ce bail...')).toBeTruthy();
  });

  it('une erreur de champ d’une étape précédente propose d’y revenir', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockRejectedValue({
      response: {
        data: {
          message: 'Données invalides.',
          errors: [{ field: 'rentAmount', message: 'Le montant dépasse le maximum autorisé (9 999 999 999,99).' }]
        }
      }
    });
    monter(onSubmit);
    await suivant(user, 4);
    await user.click(await screen.findByRole('button', { name: 'Créer le bail' }));

    const retour = await screen.findByRole('button', { name: "Revenir à l'étape" }, OPTIONS);
    // (les options de recherche viennent en second, celles d'attente en troisième)
    await user.click(retour);
    expect((await screen.findAllByRole('spinbutton')).length).toBeGreaterThan(2);
  });
});
