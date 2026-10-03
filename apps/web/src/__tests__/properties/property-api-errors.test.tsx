import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { PropertyForm } from '../../components/properties/PropertyForm';
import { PropertyPublicationControls } from '../../components/properties/PropertyPublicationControls';
import { apiErrorText, apiFieldErrors } from '../../components/properties/property-api-errors';
import { PropertyOwnershipType, PropertyType, Property } from '../../types/property-types';
import { FeedbackBridge } from '../../lib/feedback';

/**
 * BUG-2026-09-28-013 : un 400 de validation n'affichait que « Erreur lors de
 * l'enregistrement », sans désigner le champ fautif.
 * BUG-2026-09-28-009 : la liste des conditions de publication vient de
 * `errors[]` de la réponse (400), plus d'un message anglais à découper.
 * BUG-2026-09-28-008 : le formulaire ne montre jamais l'identifiant brut d'un
 * propriétaire absent de la liste.
 */

const getTemplate = vi.fn();
const getTenantClients = vi.fn();
const publishProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  getTemplates: vi.fn(async () => []),
  publishProperty: (...a: unknown[]) => publishProperty(...a),
  unpublishProperty: vi.fn()
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

vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: () => <div data-testid="selecteur-localisation" />
}));
vi.mock('../../components/ui/address-autocomplete', () => ({
  AddressAutocomplete: () => <div data-testid="autocompletion-adresse" />
}));

const erreurApi = (
  errors: Array<{ field: string; message: string }>,
  message = 'Les données fournies sont invalides.'
) => ({
  response: { status: 400, data: { success: false, message, code: 'VALIDATION_ERROR', errors } }
});

const APPARTEMENT: Property = {
  id: 'bien-1',
  internalReference: 'REF-001',
  propertyType: PropertyType.APPARTEMENT,
  ownershipType: PropertyOwnershipType.TENANT,
  ownerUserId: undefined,
  title: 'Palmiers A1',
  description: 'Bel appartement',
  address: 'Cocody',
  locationZone: 'Cocody',
  latitude: 0,
  longitude: 0,
  surfaceArea: 75,
  currency: 'CFA',
  furnishingStatus: null,
  transactionModes: ['SALE'],
  status: 'AVAILABLE',
  availability: 'AVAILABLE'
} as unknown as Property;

beforeEach(() => {
  getTemplate.mockReset();
  getTenantClients.mockReset();
  publishProperty.mockReset();
  getTemplate.mockResolvedValue({ sections: [], fieldDefinitions: [] });
  getTenantClients.mockResolvedValue({ success: true, data: [] });
});

describe('property-api-errors', () => {
  it('nomme le champ fautif par son libellé visible', () => {
    const erreur = erreurApi([{ field: 'furnishingStatus', message: 'Type invalide' }]);
    expect(apiFieldErrors(erreur)).toEqual([{ field: 'furnishingStatus', message: 'Type invalide' }]);
    expect(apiErrorText(erreur, 'repli')).toBe('Meublé : Type invalide');
  });

  it('retombe sur le message de l’API, puis sur le repli', () => {
    expect(apiErrorText({ response: { data: { message: 'Refusé' } } }, 'repli')).toBe('Refusé');
    expect(apiErrorText(new Error('réseau'), 'repli')).toBe('repli');
  });
});

describe('Formulaire du bien — refus de validation de l’API', () => {
  it('désigne le champ fautif dans le bandeau et sur le formulaire', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(erreurApi([{ field: 'furnishingStatus', message: 'Valeur inattendue' }]));
    render(
      <AntApp>
        <FeedbackBridge />
        <PropertyForm tenantId="agence-1" property={APPARTEMENT} onSubmit={onSubmit} />
      </AntApp>
    );
    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /Mettre à jour/i }));

    expect(await screen.findByText(/Meublé : Valeur inattendue/)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // `null` (bien créé sans « Meublé ») n'est pas renvoyé tel quel.
    expect(onSubmit.mock.calls[0][0].furnishingStatus).not.toBeNull();
  });
});

describe('Formulaire du bien — propriétaire hors liste', () => {
  it('montre le nom du propriétaire enregistré, jamais son identifiant brut', async () => {
    const bien = {
      ...APPARTEMENT,
      ownerUserId: 'b260bc68-6a8d-4654-b56d-0c999d678a56',
      owner: { id: 'b260bc68-6a8d-4654-b56d-0c999d678a56', email: 'awa@oi.test', fullName: 'Awa Konaté OI' }
    } as unknown as Property;
    render(
      <AntApp>
        <PropertyForm tenantId="agence-1" property={bien} onSubmit={vi.fn()} />
      </AntApp>
    );
    await waitFor(() => expect(getTenantClients).toHaveBeenCalled());

    expect(await screen.findByText('Awa Konaté OI')).toBeInTheDocument();
    expect(screen.queryByText('b260bc68-6a8d-4654-b56d-0c999d678a56')).toBeNull();
  });
});

describe('Publication — conditions manquantes', () => {
  it('liste chaque condition renvoyée par l’API (400)', async () => {
    const user = userEvent.setup();
    publishProperty.mockRejectedValue(
      erreurApi(
        [
          { field: 'publication', message: 'La description est obligatoire' },
          { field: 'publication', message: 'La géolocalisation (latitude/longitude) est obligatoire' }
        ],
        'Les conditions de publication ne sont pas remplies : …'
      )
    );
    render(
      <AntApp>
        <PropertyPublicationControls tenantId="agence-1" property={APPARTEMENT} />
      </AntApp>
    );

    await user.click(screen.getByRole('button', { name: /Publier sur le portail public/i }));

    expect(await screen.findByText('Conditions de publication non remplies')).toBeInTheDocument();
    expect(screen.getByText('La description est obligatoire')).toBeInTheDocument();
    expect(screen.getByText('La géolocalisation (latitude/longitude) est obligatoire')).toBeInTheDocument();
  });
});
