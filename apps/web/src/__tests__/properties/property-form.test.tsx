import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyForm } from '../../components/properties/PropertyForm';
import { PropertyOwnershipType, PropertyType, Property } from '../../types/property-types';
import { FeedbackBridge } from '../../lib/feedback';

/**
 * Deux défauts relevés en recette sur la fiche d'un bien, tous deux corrigés
 * ensemble ici :
 *
 * 1. Le sélecteur « Propriétaire » ne filtrait pas à la saisie (aucun
 *    `showSearch`/`optionFilterProp`) : sur une agence à vingt clients, il
 *    fallait faire défiler la liste entière pour retrouver un nom.
 * 2. Cliquer « Mettre à jour » avec un champ obligatoire vide ne produisait
 *    rien de visible : l'erreur s'affichait hors écran, en haut d'un long
 *    formulaire, sans qu'aucun message n'avertisse l'utilisateur.
 */

const getTemplate = vi.fn();
const getTenantClients = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  getTemplates: vi.fn(async () => [])
}));

vi.mock('../../services/tenant-service', () => ({
  __esModule: true,
  getTenantClients: (...a: unknown[]) => getTenantClients(...a)
}));

vi.mock('../../services/geographic-service', () => ({
  __esModule: true,
  getLocationByCommuneId: vi.fn(async () => null),
  searchLocations: vi.fn(async () => [])
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' }, user: { email: 'a@b.c' } })
}));

// Composants lourds, hors sujet des deux défauts testés ici.
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div data-testid="selecteur-localisation" />
}));
vi.mock('../../components/ui/address-autocomplete', () => ({
  AddressAutocomplete: () => <div data-testid="autocompletion-adresse" />
}));

const PROPRIETAIRES = [
  { id: 'c1', userId: 'u1', user: { id: 'u1', email: 'alice@example.com', fullName: 'Alice Dupont' } },
  { id: 'c2', userId: 'u2', user: { id: 'u2', email: 'bertrand@example.com', fullName: 'Bertrand Martin' } }
];

/** Bien en édition, appartenant à un client (propriétaire obligatoire). */
const BIEN_PRIVE: Property = {
  id: 'bien-1',
  internalReference: 'REF-001',
  propertyType: PropertyType.APPARTEMENT,
  ownershipType: PropertyOwnershipType.PUBLIC,
  ownerUserId: 'u1',
  title: 'Appartement Cocody',
  description: 'Bel appartement',
  address: 'Cocody',
  locationZone: 'Cocody',
  latitude: 0,
  longitude: 0,
  surfaceArea: 80,
  currency: 'CFA',
  transactionModes: ['SALE'],
  status: 'AVAILABLE',
  availability: 'AVAILABLE'
} as unknown as Property;

function monter(property: Property) {
  return render(
    <AntApp>
      <FeedbackBridge />
      <PropertyForm tenantId="agence-1" property={property} onSubmit={vi.fn()} />
    </AntApp>
  );
}

beforeEach(() => {
  getTemplate.mockReset();
  getTenantClients.mockReset();
  getTemplate.mockResolvedValue({ sections: [], fieldDefinitions: [] });
  getTenantClients.mockResolvedValue({ success: true, data: PROPRIETAIRES });
});

describe('Fiche d’un bien — le sélecteur « Propriétaire » se filtre à la saisie', () => {
  it('ne montre plus qu’une correspondance une fois le nom tapé', async () => {
    const user = userEvent.setup();
    monter(BIEN_PRIVE);

    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    const optionsVisibles = () =>
      Array.from(document.querySelectorAll('.ant-select-item-option-content')).map(el => el.textContent);

    const champ = await screen.findByLabelText('Propriétaire');
    await user.click(champ);
    // Les deux propriétaires sont proposés avant toute frappe.
    await waitFor(() => {
      expect(optionsVisibles()).toEqual(expect.arrayContaining(['Alice Dupont', 'Bertrand Martin']));
    });

    await user.type(champ, 'Bertrand');

    await waitFor(() => {
      expect(optionsVisibles()).toEqual(['Bertrand Martin']);
    });
  });
});

describe('Fiche d’un bien — un échec de validation se voit', () => {
  it('défile jusqu’au premier champ en erreur et avertit par un message', async () => {
    const user = userEvent.setup();
    monter(BIEN_PRIVE);

    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    // Le titre est obligatoire : on le vide avant de soumettre.
    const titre = await screen.findByLabelText('Titre du bien');
    await user.clear(titre);

    await user.click(screen.getByRole('button', { name: /Mettre à jour/i }));

    // Le message d'échec, sans quoi rien ne signale que l'envoi a été refusé.
    await waitFor(() => {
      expect(screen.getByText('Le formulaire contient des erreurs — voir les champs en rouge.')).toBeInTheDocument();
    });
    // Et le champ fautif porte bien la marque d'erreur d'AntD (celui vers
    // lequel `onAntFormValidationFailed` fait défiler la page).
    expect(titre.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });
});

describe('Fiche d’un bien — le propriétaire n’est requis que hors « propriété de l’agence »', () => {
  it('reste obligatoire pour une propriété privée', async () => {
    monter(BIEN_PRIVE);
    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    // Avant toute soumission, ni erreur ni mention d'aide « agence » : ce
    // bien est privé, le propriétaire lui reste simplement requis.
    expect(screen.queryByText('Le propriétaire est requis')).toBeNull();
    expect(screen.queryByText("Ce bien appartient à l'agence : il n'a pas de propriétaire distinct.")).toBeNull();
  });

  it('n’est plus exigé pour un bien propriété de l’agence, et l’explique', async () => {
    const bienAgence: Property = { ...BIEN_PRIVE, ownershipType: PropertyOwnershipType.TENANT, ownerUserId: undefined };
    monter(bienAgence);
    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    expect(
      await screen.findByText("Ce bien appartient à l'agence : il n'a pas de propriétaire distinct.")
    ).toBeInTheDocument();
  });
});
