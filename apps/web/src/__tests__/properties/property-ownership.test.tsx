import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyOwnershipCard } from '../../components/properties/PropertyOwnershipCard';
import type { PropertyOwnership } from '../../services/property-ownership-service';

/**
 * Indivision d'un bien (lot 4) — quotes-parts entre plusieurs propriétaires.
 *
 * Le service `property-ownership-service` est mocké entièrement : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas explicitement (AGENTS.md),
 * et la carte n'appelle que les deux fonctions exportées.
 *
 * Le choix d'un propriétaire dans la modale suit le modèle de
 * `__tests__/finance/bons-de-commande.test.tsx` : `fireEvent.mouseDown` sur le
 * combobox, puis un clic sur l'option apparue. Ici, un deuxième combobox
 * ouvert pendant que le panneau du premier termine son animation de fermeture
 * laisse deux options « du même nom » dans le DOM un court instant : le
 * helper `choisirProprietaire` prend systématiquement la dernière trouvée,
 * celle du panneau qui vient de s'ouvrir.
 */

vi.mock('../../components/properties/PropertyMandateCard', () => ({ PropertyMandateCard: () => null }));
vi.mock('../../services/tenant-service', () => ({
  syncOwnerClients: vi.fn(async () => ({ examined: 0, created: 0 }))
}));

const getPropertyOwnership = vi.fn();
const updatePropertyOwnership = vi.fn();

vi.mock('../../services/property-ownership-service', () => ({
  getPropertyOwnership: (...a: unknown[]) => getPropertyOwnership(...a),
  updatePropertyOwnership: (...a: unknown[]) => updatePropertyOwnership(...a)
}));

/** Ouvre le combobox d'index `index` et y choisit l'option `nom`. */
async function choisirProprietaire(index: number, nom: string) {
  const comboboxes = screen.getAllByRole('combobox');
  fireEvent.mouseDown(comboboxes[index]);
  const options = await screen.findAllByRole('option', { name: nom });
  fireEvent.click(options[options.length - 1]);
}

function proprietaires() {
  return [
    { ownerClientId: 'prop-1', ownerName: 'Aïcha Koné', email: 'aicha@example.com' },
    { ownerClientId: 'prop-2', ownerName: 'Boubacar Traoré', email: null },
    { ownerClientId: 'prop-3', ownerName: 'Chantal Bamba', email: 'chantal@example.com' }
  ];
}

function indivision(over: Partial<PropertyOwnership> = {}): PropertyOwnership {
  return {
    propertyId: 'bien-1',
    leaseOwner: { ownerClientId: 'prop-1', ownerName: 'Aïcha Koné' },
    shares: [],
    owners: proprietaires(),
    ...over
  };
}

function monter() {
  return render(
    <AntApp>
      <PropertyOwnershipCard tenantId="agence-1" propertyId="bien-1" />
    </AntApp>
  );
}

beforeEach(() => {
  getPropertyOwnership.mockReset();
  updatePropertyOwnership.mockReset();
});

describe('Indivision — lecture', () => {
  it("affiche le propriétaire des baux quand il n'y a pas d'indivision", async () => {
    getPropertyOwnership.mockResolvedValue(indivision());
    monter();

    expect(await screen.findByText("Pas d'indivision : le bien appartient à Aïcha Koné")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Définir l'indivision" })).toBeInTheDocument();
  });

  it("propose le propriétaire désigné sur les baux quand aucun n'est chargé", async () => {
    getPropertyOwnership.mockResolvedValue(indivision({ leaseOwner: null }));
    monter();

    expect(
      await screen.findByText("Pas d'indivision : le bien appartient au propriétaire désigné sur les baux")
    ).toBeInTheDocument();
  });

  it('affiche la liste des indivisaires avec leur part', async () => {
    getPropertyOwnership.mockResolvedValue(
      indivision({
        shares: [
          { ownerClientId: 'prop-1', ownerName: 'Aïcha Koné', email: 'aicha@example.com', sharePercent: 50 },
          { ownerClientId: 'prop-2', ownerName: 'Boubacar Traoré', email: null, sharePercent: 50 }
        ]
      })
    );
    monter();

    expect(await screen.findByText('Aïcha Koné')).toBeInTheDocument();
    expect(screen.getByText('Boubacar Traoré')).toBeInTheDocument();
    expect(screen.getAllByText('50 %')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Supprimer l'indivision" })).toBeInTheDocument();
  });
});

describe('Indivision — répartition à parts égales', () => {
  it('répartit 100 % entre trois propriétaires avec le reste sur la dernière ligne', async () => {
    getPropertyOwnership.mockResolvedValue(indivision());
    const utilisateur = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    monter();

    await utilisateur.click(await screen.findByRole('button', { name: "Définir l'indivision" }));

    // L'indivision démarre avec le propriétaire des baux à 100 % (une ligne) :
    // on ajoute les deux autres avant de répartir.
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter un propriétaire/ }));
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter un propriétaire/ }));

    await choisirProprietaire(1, 'Boubacar Traoré');
    await choisirProprietaire(2, 'Chantal Bamba');

    await utilisateur.click(screen.getByRole('button', { name: 'Répartir à parts égales' }));

    expect(screen.getByLabelText('Part en % (ligne 1)')).toHaveValue('33,3333');
    expect(screen.getByLabelText('Part en % (ligne 2)')).toHaveValue('33,3333');
    expect(screen.getByLabelText('Part en % (ligne 3)')).toHaveValue('33,3334');
  });
});

describe('Indivision — bouton Enregistrer', () => {
  it('reste désactivé tant que le total ne vaut pas 100 %', async () => {
    getPropertyOwnership.mockResolvedValue(indivision());
    const utilisateur = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    monter();

    await utilisateur.click(await screen.findByRole('button', { name: "Définir l'indivision" }));

    // Démarre à 100 % (prop-1 seul) : le bouton est activé.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();

    const part = screen.getByLabelText('Part en % (ligne 1)');
    fireEvent.change(part, { target: { value: '50' } });
    fireEvent.blur(part);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled());
    expect(screen.getByText('50 %')).toBeInTheDocument();
  });
});

describe('Indivision — envoi', () => {
  it('envoie les identifiants des propriétaires et leurs parts', async () => {
    getPropertyOwnership.mockResolvedValue(indivision());
    updatePropertyOwnership.mockResolvedValue(
      indivision({
        shares: [
          { ownerClientId: 'prop-1', ownerName: 'Aïcha Koné', email: 'aicha@example.com', sharePercent: 60 },
          { ownerClientId: 'prop-2', ownerName: 'Boubacar Traoré', email: null, sharePercent: 40 }
        ]
      })
    );
    const utilisateur = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    monter();

    await utilisateur.click(await screen.findByRole('button', { name: "Définir l'indivision" }));
    await utilisateur.click(screen.getByRole('button', { name: /Ajouter un propriétaire/ }));
    await choisirProprietaire(1, 'Boubacar Traoré');

    const part1 = screen.getByLabelText('Part en % (ligne 1)');
    fireEvent.change(part1, { target: { value: '60' } });
    fireEvent.blur(part1);
    const part2 = screen.getByLabelText('Part en % (ligne 2)');
    fireEvent.change(part2, { target: { value: '40' } });
    fireEvent.blur(part2);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updatePropertyOwnership).toHaveBeenCalledTimes(1));
    expect(updatePropertyOwnership).toHaveBeenCalledWith('agence-1', 'bien-1', {
      shares: [
        { ownerClientId: 'prop-1', sharePercent: 60 },
        { ownerClientId: 'prop-2', sharePercent: 40 }
      ]
    });
  });
});

describe('Indivision — suppression', () => {
  it("supprime l'indivision en envoyant une liste vide de quotes-parts", async () => {
    getPropertyOwnership.mockResolvedValue(
      indivision({
        shares: [
          { ownerClientId: 'prop-1', ownerName: 'Aïcha Koné', email: 'aicha@example.com', sharePercent: 50 },
          { ownerClientId: 'prop-2', ownerName: 'Boubacar Traoré', email: null, sharePercent: 50 }
        ]
      })
    );
    updatePropertyOwnership.mockResolvedValue(indivision());
    const utilisateur = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    monter();

    await utilisateur.click(await screen.findByRole('button', { name: "Supprimer l'indivision" }));
    await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(updatePropertyOwnership).toHaveBeenCalledWith('agence-1', 'bien-1', { shares: [] }));
  });
});
