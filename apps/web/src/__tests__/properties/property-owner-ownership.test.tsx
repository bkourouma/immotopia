import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';

/**
 * BUG-2026-09-30-030 : l'assistant enregistrait toujours `ownershipType=TENANT`,
 * même avec un propriétaire choisi. Un propriétaire tiers fait un bien CLIENT ;
 * un compte « détenu en propre » (pack Patrimoine seul) n'a pas ce champ et
 * garde un bien d'agence.
 */

const getTemplate = vi.fn();
const createProperty = vi.fn();
const updateProperty = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  createProperty: (...a: unknown[]) => createProperty(...a),
  updateProperty: (...a: unknown[]) => updateProperty(...a),
  uploadMedia: vi.fn()
}));

vi.mock('../../services/crm-service', () => ({
  __esModule: true,
  listContacts: vi.fn(async () => ({
    success: true,
    contacts: [
      {
        id: 'c1',
        firstName: 'Mamadou',
        lastName: 'Bamba',
        legalName: 'Boutique Ivoire SARL',
        contactType: 'COMPANY',
        email: 'boutique@example.com',
        roles: [{ active: true }]
      }
    ]
  }))
}));

const getMenuEntitlements = vi.fn();
vi.mock('../../services/entitlements-service', () => ({
  __esModule: true,
  getMenuEntitlements: (...a: unknown[]) => getMenuEntitlements(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' }, user: { email: 'a@b.c' } })
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xl', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(async () => ({ data: { success: true, data: [] } })), post: vi.fn() }
}));
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: ({ onChange }: { onChange: (location: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ country: 'CI', countryId: 'ci', region: 'A', regionId: 'a', commune: 'Cocody', communeId: 'cocody' })
      }
    >
      choisir-localisation
    </button>
  )
}));
vi.mock('../../components/properties/PropertyMediaUpload', () => ({
  PropertyMediaUpload: () => <div data-testid="envoi-medias" />
}));
vi.mock('../../components/properties/PropertyMediaGallery', () => ({
  PropertyMediaGallery: () => <div data-testid="galerie-medias" />
}));

async function jusquauxMedias(user: ReturnType<typeof userEvent.setup>, choisirProprietaire: boolean) {
  render(
    <AntApp>
      <MemoryRouter>
        <PropertyFormWizard tenantId="agence-1" />
      </MemoryRouter>
    </AntApp>
  );

  await user.click(screen.getByText('Appartement'));
  await user.type(screen.getByPlaceholderText('Ex: Appartement 3 pièces à Cocody'), 'Bel appartement');

  if (choisirProprietaire) {
    await user.click(screen.getByLabelText('Un client'));
    // Le nom affiché est la raison sociale de l'entreprise, jamais son représentant.
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Boutique Ivoire SARL'));
  }

  await user.click(screen.getByText('Suivant'));
  await user.click(screen.getByText('choisir-localisation'));
  await user.click(screen.getByText('Suivant'));
  await user.click(screen.getByText('Suivant'));
  await user.click(screen.getByText('Location'));
  await user.click(screen.getByText('Suivant'));
  await user.click(screen.getByText('Suivant'));
}

beforeEach(() => {
  getTemplate.mockReset().mockResolvedValue({ sections: [], fieldDefinitions: [] });
  createProperty.mockReset().mockResolvedValue({ id: 'bien-1', propertyType: 'APPARTEMENT', title: 'Bel appartement' });
  updateProperty.mockReset().mockResolvedValue({ id: 'bien-1' });
  getMenuEntitlements.mockReset().mockResolvedValue({ enforcement: 'warn', ownAssetsOnly: false });
});

describe('Assistant de création — type de détention', () => {
  it('le choix « L’agence / Un client » est visible ; le texte « appartient à l’agence » disparaît dès qu’un client est choisi', async () => {
    const user = userEvent.setup();
    render(
      <AntApp>
        <MemoryRouter>
          <PropertyFormWizard tenantId="agence-1" />
        </MemoryRouter>
      </AntApp>
    );
    await user.click(screen.getByText('Appartement'));
    expect(screen.getByLabelText("L'agence")).toBeTruthy();
    expect(screen.getByText(/Ce bien appartient à l'agence/)).toBeTruthy();

    await user.click(screen.getByLabelText('Un client'));
    expect(screen.queryByText(/Ce bien appartient à l'agence/)).toBeNull();
    expect(screen.getByText(/Bien de client/)).toBeTruthy();
  });

  it('Patrimoine seul : ni choix agence/client ni champ propriétaire', async () => {
    getMenuEntitlements.mockResolvedValue({ enforcement: 'enforce', ownAssetsOnly: true });
    const user = userEvent.setup();
    render(
      <AntApp>
        <MemoryRouter>
          <PropertyFormWizard tenantId="agence-1" />
        </MemoryRouter>
      </AntApp>
    );
    await user.click(screen.getByText('Appartement'));
    await waitFor(() => expect(screen.queryByLabelText('Un client')).toBeNull());
    expect(screen.queryByText('Sélectionner un propriétaire')).toBeNull();
  });

  it('un propriétaire tiers choisi crée un bien CLIENT avec son e-mail', async () => {
    const user = userEvent.setup();
    await jusquauxMedias(user, true);

    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));
    const [, corps] = createProperty.mock.calls[0];
    expect(corps.ownershipType).toBe('CLIENT');
    expect(corps.ownerEmail).toBe('boutique@example.com');
  });

  it('sans propriétaire, le bien reste celui de l’agence (TENANT)', async () => {
    const user = userEvent.setup();
    await jusquauxMedias(user, false);

    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));
    const [, corps] = createProperty.mock.calls[0];
    expect(corps.ownershipType).toBe('TENANT');
    expect(corps.ownerEmail).toBeUndefined();
  });

  it('compte « détenu en propre » : pas de champ propriétaire, bien TENANT sans propriétaire tiers', async () => {
    getMenuEntitlements.mockResolvedValue({ enforcement: 'enforce', ownAssetsOnly: true });
    const user = userEvent.setup();
    await jusquauxMedias(user, false);

    expect(screen.queryByText('Sélectionner un propriétaire')).toBeNull();
    await waitFor(() => expect(createProperty).toHaveBeenCalledTimes(1));
    const [, corps] = createProperty.mock.calls[0];
    expect(corps.ownershipType).toBe('TENANT');
    expect(corps.ownerEmail).toBeUndefined();
    expect(corps.ownerUserId).toBeUndefined();
  });
});
