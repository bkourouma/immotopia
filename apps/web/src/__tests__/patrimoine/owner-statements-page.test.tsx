import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { OwnerStatementsPage } from '../../pages/patrimoine/statements/OwnerStatementsPage';

/**
 * Historique des relevés de gérance : recherche multicritères paginée par le
 * serveur. On vérifie les paramètres envoyés à l'API, l'URL, l'effacement et
 * l'alerte « ancien calcul », qui suit le compteur du serveur (toute l'agence).
 */

const listOwnerStatementsPage = vi.hoisted(() => vi.fn());
const listEligibleOwnerStatementProperties = vi.hoisted(() => vi.fn());
const createOwnerStatement = vi.hoisted(() => vi.fn());
const recomputeOwnerStatement = vi.hoisted(() => vi.fn());
const sendOwnerStatement = vi.hoisted(() => vi.fn());
const listContacts = vi.hoisted(() => vi.fn());
const getContact = vi.hoisted(() => vi.fn());
const listProperties = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useOwnAssetsOnly: () => false
}));
vi.mock('../../services/patrimoine-service', () => ({
  listOwnerStatementsPage: (...a: unknown[]) => listOwnerStatementsPage(...a),
  listEligibleOwnerStatementProperties: (...a: unknown[]) => listEligibleOwnerStatementProperties(...a),
  createOwnerStatement: (...a: unknown[]) => createOwnerStatement(...a),
  recomputeOwnerStatement: (...a: unknown[]) => recomputeOwnerStatement(...a),
  sendOwnerStatement: (...a: unknown[]) => sendOwnerStatement(...a)
}));
vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: (...a: unknown[]) => getContact(...a)
}));
vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

const RELEVE = {
  id: 'rel-1',
  tenantId: 'agence-1',
  ownerContactId: 'c1',
  owner: { id: 'c1', firstName: 'Awa', lastName: 'Koné', email: 'awa@example.com' },
  period: '2026-09',
  totalRevenue: 500000,
  totalExpenses: 0,
  netAmount: 450000,
  totalRentDue: 500000,
  totalArrears: 0,
  totalManagementFees: 50000,
  totalManagementFeesVat: 0,
  managementFeeRate: 10,
  managementFeeBase: 'RENT_ONLY',
  vatRate: null,
  propertyIds: ['p1'],
  computationVersion: 3,
  currency: 'XOF',
  status: 'SENT',
  items: []
};

const page = (items: unknown[], legacyUnpaidCount = 0) => ({ items, total: items.length, legacyUnpaidCount });

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/tenant/agence-1/patrimoine/statements') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/statements" element={<OwnerStatementsPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  listOwnerStatementsPage.mockResolvedValue(page([RELEVE]));
  listContacts.mockResolvedValue({ contacts: [], pagination: {} });
  listProperties.mockResolvedValue({ properties: [], pagination: {} });
  listEligibleOwnerStatementProperties.mockResolvedValue([]);
  getContact.mockResolvedValue({ data: { id: 'c1', firstName: 'Awa', lastName: 'Koné' } });
});

describe('Génération de relevé : biens du propriétaire', () => {
  it('ne propose que les biens éligibles et vide une sélection au changement de propriétaire', async () => {
    listContacts.mockResolvedValue({
      contacts: [
        { id: 'c1', firstName: 'Awa', lastName: 'Koné', roles: [{ role: 'PROPRIETAIRE', active: true }] },
        { id: 'c2', firstName: 'Bakary', lastName: 'Diallo', roles: [{ role: 'PROPRIETAIRE', active: true }] }
      ],
      pagination: {}
    });
    listEligibleOwnerStatementProperties.mockImplementation(async (_tenant: string, ownerId: string) =>
      ownerId === 'c1'
        ? [{ id: 'p1', title: 'Villa', internalReference: 'A-1', address: 'Cocody' }]
        : [{ id: 'p2', title: 'Villa', internalReference: 'B-2', address: 'Plateau' }]
    );
    const user = userEvent.setup({ delay: null });
    renderPage();

    const owner = screen.getByRole('combobox', { name: 'Propriétaire' });
    const properties = screen.getByRole('combobox', { name: 'Biens concernés' });
    const selectedProperties = properties.closest('.ant-select') as HTMLElement;
    expect(properties).toBeDisabled();

    await user.click(owner);
    await user.click(await screen.findByText('Awa Koné', { selector: '.ant-select-item-option-content' }, T));
    await vi.waitFor(() => expect(listEligibleOwnerStatementProperties).toHaveBeenCalledWith('agence-1', 'c1'), T);
    await vi.waitFor(() => expect(properties).not.toBeDisabled(), T);
    await user.click(properties);
    await user.click(
      await screen.findByText('Villa — A-1 · Cocody', { selector: '.ant-select-item-option-content' }, T)
    );
    expect(within(selectedProperties).getByText('Villa — A-1 · Cocody')).toBeInTheDocument();

    await user.click(owner);
    await user.click(await screen.findByText('Bakary Diallo', { selector: '.ant-select-item-option-content' }, T));
    await vi.waitFor(() => expect(listEligibleOwnerStatementProperties).toHaveBeenCalledWith('agence-1', 'c2'), T);
    await vi.waitFor(() => expect(properties).not.toBeDisabled(), T);
    expect(within(selectedProperties).queryByText('Villa — A-1 · Cocody')).not.toBeInTheDocument();
    await user.click(properties);
    expect(
      await screen.findByText('Villa — B-2 · Plateau', { selector: '.ant-select-item-option-content' }, T)
    ).toBeInTheDocument();
    const visibleOptions = document.querySelector(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
    ) as HTMLElement;
    expect(within(visibleOptions).queryByText('Villa — A-1 · Cocody')).not.toBeInTheDocument();
    expect(listProperties).not.toHaveBeenCalled();

    const clearOwner = owner.closest('.ant-select')?.querySelector<HTMLElement>('.ant-select-clear');
    expect(clearOwner).toBeTruthy();
    await user.click(clearOwner as HTMLElement);
    expect(properties).toBeDisabled();
    expect(within(selectedProperties).queryByText('Villa — B-2 · Plateau')).not.toBeInTheDocument();
  });
});

describe('Relevés de gérance : recherche multicritères', () => {
  it('charge la première page, 20 par page, sans critère', async () => {
    renderPage();

    expect(await screen.findByText('Awa Koné', undefined, T)).toBeInTheDocument();
    expect(listOwnerStatementsPage).toHaveBeenCalledWith('agence-1', { page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('envoie la saisie au serveur après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Awa Koné', undefined, T);

    await user.type(within(screen.getByRole('search')).getByPlaceholderText('Propriétaire, période, bien…'), 'kone');

    await vi.waitFor(
      () =>
        expect(listOwnerStatementsPage).toHaveBeenLastCalledWith('agence-1', { search: 'kone', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=kone');
  });

  it('applique les critères d’une URL partagée (période ramenée au mois)', async () => {
    renderPage(
      '/tenant/agence-1/patrimoine/statements?status=SENT,PAID&periodFrom=2026-01-01&periodTo=2026-03-15&ownerContactId=c1&legacy=1'
    );

    await screen.findByText('Awa Koné', undefined, T);
    expect(listOwnerStatementsPage).toHaveBeenCalledWith('agence-1', {
      status: 'SENT,PAID',
      periodFrom: '2026-01',
      periodTo: '2026-03',
      ownerContactId: 'c1',
      legacy: 'true',
      page: 1,
      limit: 20
    });
    // La puce du propriétaire retrouve son nom à partir de l'identifiant de l'URL.
    await vi.waitFor(() => expect(getContact).toHaveBeenCalledWith('agence-1', 'c1'), T);
  });

  it('critère Propriétaire : sans propriétaire parmi les contacts trouvés, invite à préciser le nom', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Awa Koné', undefined, T);

    await user.click(within(screen.getByRole('search')).getByRole('button', { name: /Plus de critères/ }));
    const panneau = await screen.findByRole('group', { name: 'Plus de critères' }, T);
    await user.click(within(panneau).getByRole('combobox'));

    expect(
      await screen.findByText('Aucun propriétaire parmi les contacts trouvés : précisez le nom.', undefined, T)
    ).toBeInTheDocument();
    expect(listContacts).toHaveBeenCalledWith('agence-1', { search: undefined, limit: 20 });

    // L'option est inerte : la cliquer n'envoie aucun ownerContactId.
    const appelsAvant = listOwnerStatementsPage.mock.calls.length;
    await user.click(screen.getByText('Aucun propriétaire parmi les contacts trouvés : précisez le nom.'));
    expect(listOwnerStatementsPage.mock.calls.length).toBe(appelsAvant);
    for (const appel of listOwnerStatementsPage.mock.calls) {
      expect(appel[1]).not.toHaveProperty('ownerContactId');
    }
    expect(screen.getByTestId('url').textContent).not.toContain('ownerContactId');
  });

  it('plafonne à 100 la taille de page envoyée, sans erreur, pour un lien limit=500', async () => {
    renderPage('/tenant/agence-1/patrimoine/statements?limit=500');

    await screen.findByText('Awa Koné', undefined, T);
    expect(listOwnerStatementsPage.mock.calls[0][1]).toMatchObject({ limit: 100 });
    expect(screen.queryByText(/Impossible de charger|Erreur/i)).not.toBeInTheDocument();
  });

  it('distingue « aucun résultat » d’« aucun relevé » et efface les critères', async () => {
    const user = userEvent.setup();
    listOwnerStatementsPage.mockImplementation(async (_tenant: string, params: Record<string, unknown>) =>
      params.search ? page([]) : page([RELEVE])
    );
    renderPage('/tenant/agence-1/patrimoine/statements?q=zzz');

    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    expect(screen.queryByText('Aucun relevé de gérance pour le moment.')).not.toBeInTheDocument();

    // Deux boutons du même nom : la barre et le bloc d'état.
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Awa Koné', undefined, T)).toBeInTheDocument();
    expect(listOwnerStatementsPage).toHaveBeenLastCalledWith('agence-1', { page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('sans aucun relevé : l’état vide, pas le bloc de critères', async () => {
    listOwnerStatementsPage.mockResolvedValue(page([]));
    renderPage();

    expect(await screen.findByText('Aucun relevé de gérance pour le moment.', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Aucun élément ne correspond aux filtres appliqués.')).not.toBeInTheDocument();
  });

  it('l’alerte « ancien calcul » suit le compteur du serveur, même sous critères', async () => {
    listOwnerStatementsPage.mockResolvedValue(page([], 2));
    renderPage('/tenant/agence-1/patrimoine/statements?q=zzz');

    expect(
      await screen.findByText(/2 relevé\(s\) calculé\(s\) selon l’ancienne méthode/, undefined, T)
    ).toBeInTheDocument();
  });

  it('pas d’alerte quand le serveur ne compte aucun relevé de l’ancien calcul', async () => {
    renderPage();

    await screen.findByText('Awa Koné', undefined, T);
    expect(screen.queryByText(/selon l’ancienne méthode/)).not.toBeInTheDocument();
  });
});
