import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AssetFormDrawer } from '../../components/patrimoine/actifs/AssetFormDrawer';
import {
  assetClassFields,
  assetClassLabel,
  buildAssetDetails,
  detailKeyLabel,
  validateAssetDetails
} from '../../components/patrimoine/actifs/asset-classes';

/**
 * `<AssetFormDrawer>` — formulaire dynamique par classe d'actif, validations
 * côté client alignées sur le serveur, erreurs serveur reportées sur les champs.
 */

const createAsset = vi.fn();
const updateAsset = vi.fn();
const listProperties = vi.fn();

vi.mock('../../services/patrimoine-assets-service', () => ({
  createAsset: (...a: unknown[]) => createAsset(...a),
  updateAsset: (...a: unknown[]) => updateAsset(...a)
}));

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

function monter(onSaved = vi.fn()) {
  render(
    <MemoryRouter>
      <AssetFormDrawer open tenantId="agence-1" onClose={vi.fn()} onSaved={onSaved} />
    </MemoryRouter>
  );
  return onSaved;
}

async function choisirClasse(user: ReturnType<typeof userEvent.setup>, classe: string) {
  await user.click(screen.getByLabelText("Classe d'actif"));
  await user.click(await screen.findByTitle(classe));
}

beforeEach(() => {
  vi.clearAllMocks();
  listProperties.mockResolvedValue({
    properties: [{ id: 'p1', internalReference: 'BIEN-001', title: 'Villa Cocody' }],
    pagination: {}
  });
});

describe('devise en modification', () => {
  const actif = {
    id: 'a1',
    name: 'Compte',
    assetClass: 'CASH',
    currency: 'EUR',
    exchangeRateToXof: 655,
    details: {},
    currentValue: { amount: 10, currency: 'EUR', valuatedAt: '2026-09-01T00:00:00.000Z', valueXof: 6550 },
    outstandingDebtXof: 0
  };

  it('verrouille la devise et le taux quand une valeur existe', () => {
    render(
      <MemoryRouter>
        <AssetFormDrawer open tenantId="agence-1" asset={actif as never} onClose={vi.fn()} onSaved={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Devise')).toBeDisabled();
    expect(screen.getByLabelText('Taux de change vers XOF')).toBeDisabled();
  });

  it('laisse la devise modifiable sans valeur ni dette', () => {
    render(
      <MemoryRouter>
        <AssetFormDrawer
          open
          tenantId="agence-1"
          asset={{ ...actif, currentValue: null } as never}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Devise')).toBeEnabled();
  });
});

describe('description des champs par classe', () => {
  it('garde les libellés français exacts', () => {
    expect(assetClassLabel('BUSINESS_EQUITY')).toBe('Entreprises et parts de sociétés');
    expect(assetClassLabel('CASH')).toBe('Comptes et mobile money');
    expect(assetClassLabel('SAVINGS_INVESTMENT')).toBe('Épargne et placements');
  });

  it('refuse un pourcentage hors 0..100 et un numéro de compte qui n’a pas 4 chiffres', () => {
    expect(
      validateAssetDetails('BUSINESS_EQUITY', {
        companyName: 'X',
        legalForm: 'SARL',
        country: 'CI',
        ownershipPercent: 101
      })
    ).toHaveProperty('ownershipPercent');
    expect(
      validateAssetDetails('CASH', { institution: 'Wave', cashKind: 'MOBILE_MONEY', accountLast4: '12345678' })
    ).toHaveProperty('accountLast4');
    expect(
      validateAssetDetails('CASH', { institution: 'Wave', cashKind: 'MOBILE_MONEY', accountLast4: '1234' })
    ).toEqual({});
  });

  it('construit des details sans champ vide et avec des nombres typés', () => {
    expect(
      buildAssetDetails('INVENTORY', {
        designation: ' Riz ',
        quantity: '12',
        unit: 'sacs',
        unitCost: 15000,
        extra: 'x'
      })
    ).toEqual({
      designation: 'Riz',
      quantity: 12,
      unit: 'sacs',
      unitCost: 15000
    });
    expect(assetClassFields('REAL_ESTATE').map(spec => spec.name)).toEqual(['legalStatus']);
  });
});

describe('champs du lot 2', () => {
  it('refuse une durée d’utilité hors 1..50 et un multiple nul, sans rendre les champs obligatoires', () => {
    const base = { kind: 'Pick-up' };
    expect(validateAssetDetails('VEHICLE_EQUIPMENT', base)).toEqual({});
    expect(validateAssetDetails('VEHICLE_EQUIPMENT', { ...base, usefulLifeYears: 51 })).toHaveProperty(
      'usefulLifeYears'
    );
    expect(validateAssetDetails('VEHICLE_EQUIPMENT', { ...base, residualValuePercent: 101 })).toHaveProperty(
      'residualValuePercent'
    );
    const equity = { companyName: 'X', legalForm: 'SARL', country: 'CI', ownershipPercent: 50 };
    expect(validateAssetDetails('BUSINESS_EQUITY', { ...equity, earningsMultiple: 0 })).toHaveProperty(
      'earningsMultiple'
    );
    expect(validateAssetDetails('BUSINESS_EQUITY', { ...equity, earningsMultiple: 100 })).toEqual({});
  });

  it('n’envoie aucun champ vide (pas de null) pour les champs du lot 2', () => {
    expect(
      buildAssetDetails('VEHICLE_EQUIPMENT', { kind: 'Pick-up', usefulLifeYears: '5', residualValuePercent: null })
    ).toEqual({
      kind: 'Pick-up',
      usefulLifeYears: 5
    });
    expect(buildAssetDetails('REAL_ESTATE', { legalStatus: 'TITRE_FONCIER' })).toEqual({
      legalStatus: 'TITRE_FONCIER'
    });
    expect(buildAssetDetails('REAL_ESTATE', { legalStatus: undefined })).toEqual({});
  });

  it('libelle les clés de détail connues et laisse les inconnues telles quelles', () => {
    expect(detailKeyLabel('usefulLifeYears')).toBe("Durée d'utilité");
    expect(detailKeyLabel('details.companyValue')).toBe("Valeur de l'entreprise");
    expect(detailKeyLabel('cléInconnue')).toBe('cléInconnue');
  });
});

describe('<AssetFormDrawer>', () => {
  it('propose la durée d’utilité pour un véhicule et envoie un nombre', async () => {
    const user = userEvent.setup();
    createAsset.mockResolvedValue({ id: 'a1' });
    monter();

    await choisirClasse(user, 'Véhicules et équipements');
    await user.type(await screen.findByLabelText("Nom de l'actif"), 'Hilux');
    await user.type(screen.getByLabelText('Type'), 'Pick-up');
    await user.type(screen.getByLabelText("Durée d'utilité"), '5');
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    await waitFor(() =>
      expect(createAsset).toHaveBeenCalledWith(
        'agence-1',
        expect.objectContaining({ details: { kind: 'Pick-up', usefulLifeYears: 5 } })
      )
    );
  });

  it('avertit qu’un statut juridique fragile plafonne la fiabilité, mais pas un titre foncier', async () => {
    const user = userEvent.setup();
    monter();

    await choisirClasse(user, 'Immobilier');
    await user.click(await screen.findByLabelText('Statut juridique'));
    await user.click(await screen.findByTitle('Titre foncier'));
    expect(
      screen.queryByText('Statut juridique fragile : la fiabilité de la valeur est plafonnée.')
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Statut juridique'));
    await user.click(await screen.findByTitle("Lettre d'attribution"));
    expect(
      await screen.findByText('Statut juridique fragile : la fiabilité de la valeur est plafonnée.')
    ).toBeInTheDocument();
  });

  it('génère les champs de la classe choisie', async () => {
    const user = userEvent.setup();
    monter();

    await choisirClasse(user, 'Entreprises et parts de sociétés');

    expect(await screen.findByLabelText('Raison sociale')).toBeInTheDocument();
    expect(screen.getByLabelText('Pourcentage détenu')).toBeInTheDocument();
    expect(screen.queryByLabelText('Immatriculation ou numéro de série')).not.toBeInTheDocument();
  });

  it('refuse un pourcentage détenu supérieur à 100', async () => {
    const user = userEvent.setup();
    monter();

    await choisirClasse(user, 'Entreprises et parts de sociétés');
    await user.type(await screen.findByLabelText("Nom de l'actif"), 'Ma société');
    await user.type(screen.getByLabelText('Raison sociale'), 'Ma société SARL');
    await user.type(screen.getByLabelText('Pays'), 'CI');
    await user.type(screen.getByLabelText('Pourcentage détenu'), '150');
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    expect(await screen.findByText('La valeur doit être comprise entre 0 et 100')).toBeInTheDocument();
    expect(createAsset).not.toHaveBeenCalled();
  });

  it('exige le taux de change en devise étrangère', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Compte en euros');
    await user.type(await screen.findByLabelText('Libellé'), 'Compte');
    expect(screen.queryByLabelText('Taux de change vers XOF')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Devise'));
    await user.click(await screen.findByTitle('EUR'));
    expect(await screen.findByLabelText('Taux de change vers XOF')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));
    expect(await screen.findByText('Le taux de change est obligatoire hors XOF')).toBeInTheDocument();
    expect(createAsset).not.toHaveBeenCalled();
  });

  it('envoie la création et reporte l’erreur du serveur sur le champ', async () => {
    const user = userEvent.setup();
    createAsset.mockRejectedValueOnce({
      response: { data: { errors: [{ path: 'details.label', message: 'Champ obligatoire côté serveur' }] } }
    });
    monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Objet');
    await user.type(await screen.findByLabelText('Libellé'), 'Objet rare');
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    await waitFor(() =>
      expect(createAsset).toHaveBeenCalledWith(
        'agence-1',
        expect.objectContaining({
          name: 'Objet',
          assetClass: 'OTHER',
          currency: 'XOF',
          details: { label: 'Objet rare' }
        })
      )
    );
    expect(await screen.findByText('Champ obligatoire côté serveur')).toBeInTheDocument();
  });

  it('propose les biens existants pour un actif immobilier, sans création de bien', async () => {
    const user = userEvent.setup();
    monter();

    await choisirClasse(user, 'Immobilier');

    expect(await screen.findByLabelText('Bien immobilier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le module Biens' })).toHaveAttribute(
      'href',
      '/tenant/agence-1/properties'
    );
    await waitFor(() => expect(listProperties).toHaveBeenCalledWith('agence-1', { limit: 100 }));
  });

  it('exige une source pour une première valorisation en expertise et reporte l’erreur serveur', async () => {
    const user = userEvent.setup();
    createAsset.mockRejectedValueOnce({
      response: { data: { errors: [{ path: 'initialValuation.source', message: 'Source refusée par le serveur' }] } }
    });
    monter();

    await user.type(screen.getByLabelText("Nom de l'actif"), 'Objet');
    await user.type(await screen.findByLabelText('Libellé'), 'Objet rare');
    await user.type(screen.getByLabelText('Valeur estimée'), '1000000');
    await user.click(screen.getAllByLabelText('Méthode')[0]);
    await user.click(await screen.findByTitle('Expertise'));
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    expect(
      await screen.findByText("Indiquez l'expert ou le document (source) pour une expertise.")
    ).toBeInTheDocument();
    expect(createAsset).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Source'), 'Cabinet Kouassi');
    await user.click(screen.getByRole('button', { name: "Créer l'actif" }));

    expect(await screen.findByText('Source refusée par le serveur')).toBeInTheDocument();
  });
});
