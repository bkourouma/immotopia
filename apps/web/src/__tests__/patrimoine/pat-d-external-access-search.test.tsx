import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalAccessPage } from '../../pages/patrimoine/external-access/ExternalAccessPage';

/**
 * Écran « Accès partagés » : recherche locale de la liste (type, statut,
 * expiration, texte libre) et barre locale du journal d'un accès.
 */

vi.setConfig({ testTimeout: 60_000 });

const listExternalAccessGrants = vi.fn();
const getExternalAccessScopeOptions = vi.fn();
const listExternalAccessPropertyDocuments = vi.fn();
const createExternalAccessGrant = vi.fn();
const getExternalAccessGrant = vi.fn();
const updateExternalAccessGrant = vi.fn();
const revokeExternalAccessGrant = vi.fn();
const sendExternalAccessLink = vi.fn();
const listExternalAccessLog = vi.fn();

// Le mock couvre TOUS les exports du service utilisés par l'écran et ses modales.
vi.mock('../../services/external-access-service', () => ({
  listExternalAccessGrants: (...a: unknown[]) => listExternalAccessGrants(...a),
  listExternalAccessGrantsPage: async (tenantId: string, filters: Record<string, unknown>) => {
    const all = await listExternalAccessGrants(tenantId, filters);
    const text = String(filters.search ?? '').toLocaleLowerCase();
    const filtered = all.filter(
      (grant: Record<string, unknown>) =>
        (!text ||
          [grant.recipientName, grant.recipientEmail, grant.ownerName].some(value =>
            String(value ?? '')
              .toLocaleLowerCase()
              .includes(text)
          )) &&
        (!filters.types || String(filters.types).split(',').includes(String(grant.type))) &&
        (!filters.statuses || String(filters.statuses).split(',').includes(String(grant.status))) &&
        (!filters.expirationFrom || (!!grant.expiresAt && String(grant.expiresAt) >= String(filters.expirationFrom))) &&
        (!filters.expirationTo ||
          (!!grant.expiresAt && String(grant.expiresAt).slice(0, 10) <= String(filters.expirationTo)))
    );
    const page = Number(filters.page);
    const limit = Number(filters.limit);
    return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit };
  },
  getExternalAccessScopeOptions: (...a: unknown[]) => getExternalAccessScopeOptions(...a),
  listExternalAccessPropertyDocuments: (...a: unknown[]) => listExternalAccessPropertyDocuments(...a),
  createExternalAccessGrant: (...a: unknown[]) => createExternalAccessGrant(...a),
  getExternalAccessGrant: (...a: unknown[]) => getExternalAccessGrant(...a),
  updateExternalAccessGrant: (...a: unknown[]) => updateExternalAccessGrant(...a),
  revokeExternalAccessGrant: (...a: unknown[]) => revokeExternalAccessGrant(...a),
  sendExternalAccessLink: (...a: unknown[]) => sendExternalAccessLink(...a),
  listExternalAccessLog: (...a: unknown[]) => listExternalAccessLog(...a),
  listExternalAccessLogPage: async (tenantId: string, grantId: string, filters: Record<string, unknown>) => {
    const all = await listExternalAccessLog(tenantId, grantId, filters);
    const text = String(filters.search ?? '').toLocaleLowerCase();
    const filtered = all.filter(
      (entry: Record<string, unknown>) =>
        (!text ||
          [entry.documentName, entry.ipAddress].some(value =>
            String(value ?? '')
              .toLocaleLowerCase()
              .includes(text)
          )) &&
        (!filters.actions || String(filters.actions).split(',').includes(String(entry.action)))
    );
    const page = Number(filters.page);
    const limit = Number(filters.limit);
    return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit };
  }
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

const GRANT_PLACEHOLDER = 'Bénéficiaire, e-mail, propriétaire…';
const LOG_PLACEHOLDER = 'Document ou adresse IP…';

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    type: 'NOTARY',
    recipientName: 'Maître Koné',
    recipientEmail: 'kone@etude.test',
    ownerClientId: null,
    ownerName: null,
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    expiresAt: '2030-12-31T00:00:00.000Z',
    permanent: false,
    revokedAt: null,
    status: 'ACTIVE',
    propertyCount: 2,
    entityCount: 0,
    documentCount: 1,
    viewCount: 3,
    lastViewedAt: '2026-09-30T10:00:00.000Z',
    lastLinkSentAt: null,
    activeLinkCount: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides
  };
}

const options = {
  sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP'],
  defaultsByType: { NOTARY: [], ACCOUNTANT: [], BANKER: [] },
  maxLinkTtlDays: 30,
  owners: [],
  properties: [],
  entities: []
};

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function monter(initial = '/tenant/agence-1/patrimoine/external-access') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/external-access" element={<ExternalAccessPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listExternalAccessGrants.mockResolvedValue([
    grant(),
    grant({
      id: 'g2',
      recipientName: 'Cabinet Diallo',
      recipientEmail: 'diallo@compta.test',
      ownerName: 'Awa Konan',
      type: 'ACCOUNTANT',
      status: 'EXPIRING',
      expiresAt: '2026-11-20T12:00:00.000Z'
    }),
    grant({
      id: 'g3',
      recipientName: 'Banque Nord',
      type: 'BANKER',
      status: 'REVOKED',
      revokedAt: '2026-09-15T00:00:00.000Z'
    }),
    grant({ id: 'g4', recipientName: 'Étude Sylla', status: 'EXPIRED', expiresAt: '2026-08-01T12:00:00.000Z' })
  ]);
  getExternalAccessScopeOptions.mockResolvedValue(options);
  listExternalAccessLog.mockResolvedValue([]);
});

describe('<ExternalAccessPage> : recherche des accès', () => {
  it('charge la liste en entier une seule fois et affiche la barre avec son compteur', async () => {
    monter();
    expect(await screen.findByText('Maître Koné', undefined, T)).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Rechercher dans les accès partagés' })).toBeInTheDocument();
    expect(screen.getByText('4 résultats')).toBeInTheDocument();
    expect(listExternalAccessGrants).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1 }));
  });

  it('envoie le texte libre au serveur pour filtrer le nom, l’e-mail ou le propriétaire', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('Maître Koné', undefined, T);

    await user.type(screen.getByPlaceholderText(GRANT_PLACEHOLDER), 'ÉTUDE SYLLA');
    await vi.waitFor(() => expect(screen.queryByText('Maître Koné')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Étude Sylla')).toBeInTheDocument();
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=');
    expect(listExternalAccessGrants).toHaveBeenCalledWith(
      'agence-1',
      expect.objectContaining({ search: 'ÉTUDE SYLLA' })
    );

    // Un propriétaire se trouve aussi.
    await user.clear(screen.getByPlaceholderText(GRANT_PLACEHOLDER));
    await user.type(screen.getByPlaceholderText(GRANT_PLACEHOLDER), 'konan');
    await vi.waitFor(() => expect(screen.queryByText('Étude Sylla')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Cabinet Diallo')).toBeInTheDocument();
    expect(screen.queryByText('Maître Koné')).not.toBeInTheDocument();
    expect(listExternalAccessGrants).toHaveBeenCalledWith('agence-1', expect.objectContaining({ search: 'konan' }));
  });

  it('applique le type et le statut d’une adresse partagée', async () => {
    monter('/tenant/agence-1/patrimoine/external-access?type=BANKER,ACCOUNTANT&statut=EXPIRING,REVOKED');
    expect(await screen.findByText('Cabinet Diallo', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Banque Nord')).toBeInTheDocument();
    expect(screen.queryByText('Maître Koné')).not.toBeInTheDocument();
    expect(screen.queryByText('Étude Sylla')).not.toBeInTheDocument();
    expect(screen.getByText('2 résultats')).toBeInTheDocument();
  });

  it('filtre par statut', async () => {
    monter('/tenant/agence-1/patrimoine/external-access?statut=REVOKED');
    expect(await screen.findByText('Banque Nord', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Cabinet Diallo')).not.toBeInTheDocument();
    expect(screen.queryByText('Maître Koné')).not.toBeInTheDocument();
  });

  it('filtre par période d’expiration (les accès sans date en sont exclus)', async () => {
    monter('/tenant/agence-1/patrimoine/external-access?expirationFrom=2026-08-01&expirationTo=2026-12-31');
    expect(await screen.findByText('Cabinet Diallo', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Étude Sylla')).toBeInTheDocument();
    expect(screen.queryByText('Maître Koné')).not.toBeInTheDocument();
  });

  it('distingue « aucun résultat » de « aucun accès » et efface les critères', async () => {
    const user = userEvent.setup();
    monter('/tenant/agence-1/patrimoine/external-access?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun accès partagé pour le moment.')).not.toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Maître Koné', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});

describe('<ExternalAccessLogModal> : recherche dans le journal', () => {
  const LOG = [
    {
      id: 'a1',
      at: '2026-09-30T10:00:00.000Z',
      action: 'VIEWED',
      ipAddress: '203.0.113.9',
      userAgent: 'test',
      sections: ['VALUATIONS']
    },
    {
      id: 'a2',
      at: '2026-10-05T10:05:00.000Z',
      action: 'DOCUMENT_DOWNLOADED',
      ipAddress: null,
      userAgent: null,
      documentName: 'acte-vente.pdf'
    },
    { id: 'a3', at: '2026-10-06T08:00:00.000Z', action: 'LINK_SENT', ipAddress: null, userAgent: null }
  ];

  it('filtre le journal localement et efface ses clés d’adresse à la fermeture', async () => {
    const user = userEvent.setup();
    listExternalAccessLog.mockResolvedValue(LOG);
    monter();
    await screen.findByText('Maître Koné', undefined, T);

    await user.click(screen.getByRole('button', { name: 'Journal de Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Consultation', undefined, T)).toBeInTheDocument();
    expect(within(dialog).getByRole('search', { name: 'Rechercher dans le journal' })).toBeInTheDocument();
    expect(within(dialog).getByText('3 résultats')).toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText(LOG_PLACEHOLDER), 'ACTE');
    await vi.waitFor(() => expect(within(dialog).queryByText('Consultation')).not.toBeInTheDocument(), T);
    expect(within(dialog).getByText('acte-vente.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('1 résultat')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('jrn.q=ACTE');
    expect(listExternalAccessLog).toHaveBeenCalledWith('agence-1', 'g1', expect.objectContaining({ search: 'ACTE' }));

    await user.click(within(dialog).getByRole('button', { name: /Close|Fermer/ }));
    // La fermeture efface les clés du journal de l'adresse (l'animation de sortie de la modale ne se termine pas sous jsdom).
    await waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('jrn.'), T);
  });

  it('filtre le journal par événement', async () => {
    listExternalAccessLog.mockResolvedValue(LOG);
    monter('/tenant/agence-1/patrimoine/external-access?jrn.evenement=LINK_SENT');
    await screen.findByText('Maître Koné', undefined, T);
    await userEvent.click(screen.getByRole('button', { name: 'Journal de Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Lien envoyé', undefined, T)).toBeInTheDocument();
    expect(within(dialog).queryByText('Consultation')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Document téléchargé')).not.toBeInTheDocument();
  });
});

describe('<ExternalAccessPage> : pagination serveur', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => grant({ id: `g${index}`, recipientName: `Bénéficiaire ${index}` }));

  it('affiche le total de 501 accès et demande une page bornée', async () => {
    listExternalAccessGrants.mockResolvedValue(many(501));
    monter();
    expect(await screen.findByText('501 résultats', undefined, T)).toBeInTheDocument();
    expect(listExternalAccessGrants).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1, limit: 25 }));
  });
});

describe('<ExternalAccessLogModal> : portée de la recherche', () => {
  it('affiche le journal paginé sans limite de 100 événements', async () => {
    listExternalAccessLog.mockResolvedValue([
      { id: 'a1', at: '2026-09-30T10:00:00.000Z', action: 'VIEWED', ipAddress: null, userAgent: null }
    ]);
    monter();
    await screen.findByText('Maître Koné', undefined, T);
    await userEvent.click(screen.getByRole('button', { name: 'Journal de Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Consultation', undefined, T)).toBeInTheDocument();
    expect(listExternalAccessLog).toHaveBeenCalledWith('agence-1', 'g1', expect.objectContaining({ page: 1 }));
  });
});
