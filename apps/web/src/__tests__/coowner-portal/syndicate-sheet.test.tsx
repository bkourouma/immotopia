import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CoOwnerSyndicateSheet from '../../pages/CoOwnerPortal/Syndicate';
import type { CoOwnerSyndicateSheet as Sheet } from '../../services/coowner-portal-service';

const listMyLots = vi.fn();
const getCoOwnerSyndicate = vi.fn();

vi.mock('../../services/coowner-portal-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/coowner-portal-service')>(
    '../../services/coowner-portal-service'
  );
  return {
    ...actual,
    listMyLots: (...a: unknown[]) => listMyLots(...a),
    getCoOwnerSyndicate: (...a: unknown[]) => getCoOwnerSyndicate(...a)
  };
});

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const WAIT = { timeout: 8000 };
const FALLBACK_NOTE = "Aucun gestionnaire n'est désigné : votre interlocuteur est l'émetteur des documents.";

function sheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: 's1',
    name: 'Résidence Les Acacias',
    address: 'Plateau',
    registrationNo: null,
    cadastralReference: null,
    lotCount: 4,
    myLots: [],
    issuer: { kind: 'MANDANT', name: 'Mandant SA', address: null, phone: null, email: null },
    syndicContact: null,
    hasLogo: false,
    logoDownloadPath: null,
    hasIssuerLogo: false,
    issuerLogoDownloadPath: null,
    ...overrides
  };
}

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CoOwnerSyndicateSheet />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Ma copropriété : coordonnées', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMyLots.mockResolvedValue([
      {
        id: 'l1',
        lotNumber: '1',
        lotType: 'APARTMENT',
        syndicate: { id: 's1', name: 'Résidence Les Acacias', address: 'Plateau' }
      }
    ]);
  });

  it("sans gestionnaire : l'émetteur est l'interlocuteur (nom, e-mail, téléphone)", async () => {
    getCoOwnerSyndicate.mockResolvedValue(
      sheet({
        issuer: { kind: 'AGENCY', name: 'Agence Test', address: null, phone: '+225 01 02 03', email: 'agence@test.ci' }
      })
    );
    mount();
    expect(await screen.findByText(FALLBACK_NOTE, {}, WAIT)).toBeTruthy();
    expect(screen.queryByText("Aucun gestionnaire n'est désigné pour l'instant.")).toBeNull();
    // Présents dans la carte émetteur ET dans la carte interlocuteur.
    expect(screen.getAllByText('Agence Test')).toHaveLength(2);
    expect(screen.getAllByText('agence@test.ci')).toHaveLength(2);
    expect(screen.getAllByText('+225 01 02 03')).toHaveLength(2);
  });

  it('émetteur sans téléphone ni e-mail : aucune ligne vide ni « — »', async () => {
    getCoOwnerSyndicate.mockResolvedValue(sheet());
    mount();
    await screen.findByText(FALLBACK_NOTE, {}, WAIT);
    expect(screen.queryByText('Téléphone')).toBeNull();
    expect(screen.queryByText('E-mail')).toBeNull();
    // Seuls « Immatriculation » et « Référence cadastrale » (carte copropriété) restent à « — ».
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getAllByText('Mandant SA').length).toBeGreaterThan(0);
  });

  it('avec gestionnaire : son nom et son e-mail', async () => {
    getCoOwnerSyndicate.mockResolvedValue(sheet({ syndicContact: { name: 'Awa Koné', email: 'awa@agence.ci' } }));
    mount();
    expect(await screen.findByText('Awa Koné', {}, WAIT)).toBeTruthy();
    expect(screen.getByText('awa@agence.ci')).toBeTruthy();
    expect(screen.queryByText(/Aucun gestionnaire/)).toBeNull();
  });
});
