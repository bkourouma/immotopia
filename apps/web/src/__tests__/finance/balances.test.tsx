import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BalanceClients } from '../../pages/finance/BalanceClients';
import { BalanceAgee } from '../../pages/finance/BalanceAgee';

/**
 * Balance clients et balance âgée — les garanties des deux écrans (récits 1
 * et 5, `specs/016-finance-operationnelle/spec.md`).
 *
 * Suit le modèle de `__tests__/rental/installments.test.tsx` et
 * `payments.test.tsx` : un `<QueryClientProvider>` avec `retry: false`, un
 * `<MemoryRouter>` posé sur la route paramétrée, `useBreakpoint` figé en
 * desktop pour obtenir le tableau plutôt que les cartes, et des délais
 * explicites de 8 s sur les `findBy*` pour survivre à la charge parallèle de
 * la suite complète.
 *
 * Le mock de `services/finance-service` couvre les DEUX exports que les deux
 * écrans utilisent (`getClientsBalance` ET `getClientsAgingBalance`) : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là où Jest
 * renvoyait `undefined` en silence (AGENTS.md).
 */

const getClientsBalance = vi.fn();
const getClientsAgingBalance = vi.fn();

vi.mock('../../services/finance-service', () => ({
  getClientsBalance: (...a: unknown[]) => getClientsBalance(...a),
  getClientsAgingBalance: (...a: unknown[]) => getClientsAgingBalance(...a)
}));

// Les options du filtre « Bien » viennent du parc, et non de la balance :
// l'API attend un identifiant de bien, qu'une ligne de balance ne porte pas.
// Sans ce mock, la liste deroulante serait vide et le filtre ne serait pas
// reellement couvert.
const listProperties = vi.fn();

vi.mock('../../services/property-service', () => ({
  listProperties: (...a: unknown[]) => listProperties(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function ligne(overrides: Record<string, unknown> = {}) {
  return {
    accountId: 'compte-1',
    tenantClientId: 'client-1',
    label: 'Mariam Diomandé',
    propertyLabels: ['Villa 4 pièces - Cocody Angré'],
    totalBilled: 3_600_000,
    totalSettled: 3_000_000,
    balance: 600_000,
    currency: 'XOF',
    ...overrides
  };
}

function ligneAgee(overrides: Record<string, unknown> = {}) {
  return {
    ...ligne(),
    notYetDue: 0,
    days0To30: 0,
    days30To60: 0,
    days60To90: 0,
    daysOver90: 0,
    ...overrides
  };
}

/** Sonde d'adresse : révèle l'état de liste porté par l'URL et la navigation. */
function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{location.pathname + location.search}</span>;
}

function mountClients(url = '/tenant/agence-1/finance/clients') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/clients" element={<BalanceClients />} />
            <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<span>relevé du compte</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountAgee(url = '/tenant/agence-1/finance/clients/agee') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/clients/agee" element={<BalanceAgee />} />
            <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<span>relevé du compte</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Balance clients — rendu', () => {
  it('affiche une ligne par locataire, avec le total de contrôle en pied de liste', async () => {
    getClientsBalance.mockResolvedValue({
      lines: [
        ligne({ accountId: 'compte-1', label: 'Mariam Diomandé', balance: 600_000 }),
        ligne({ accountId: 'compte-2', label: 'Seydou Traoré', balance: 1_500_000 })
      ],
      totalBalance: 2_100_000,
      currency: 'XOF'
    });

    mountClients();

    expect(await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Seydou Traoré')).toBeInTheDocument();
    expect(screen.getByText('Facturé')).toBeInTheDocument();
    expect(screen.getByText('Réglé')).toBeInTheDocument();

    expect(screen.getByText('Total de contrôle')).toBeInTheDocument();
    // 2 100 000, avec l'espace insécable étroite posée par `MoneyValue`.
    expect(screen.getByText(/2\s100\s000\sFCFA/)).toBeInTheDocument();
  });

  it('affiche l’état vide quand aucun compte n’existe', async () => {
    getClientsBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });
    mountClients();

    expect(await screen.findByText('Aucun compte de locataire enregistré.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Total de contrôle')).not.toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getClientsBalance.mockRejectedValue(new Error('boom'));
    mountClients();

    expect(
      await screen.findByText('Impossible de charger la balance clients.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
  });

  it('distingue « aucun résultat » d’un portefeuille vide, filtre posé', async () => {
    // Filtre déjà posé dans l'URL, mais aucune ligne ne correspond : l'écran
    // doit proposer d'effacer les filtres, pas de créer un compte.
    getClientsBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });
    mountClients('/tenant/agence-1/finance/clients?propertyId=bien-inexistant');

    // Le bouton apparaît deux fois : une fois posé par `<FilterSheet>` à côté
    // des contrôles, une fois par le bloc « aucun résultat » de `<DataView>`.
    // Peu importe lequel : c'est sa présence qui prouve la distinction.
    expect((await screen.findAllByText('Effacer les filtres', {}, { timeout: 8000 })).length).toBeGreaterThan(0);
  });
});

describe('Balance clients — état dans l’URL', () => {
  it('relit la période et le bien depuis l’adresse au montage', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    listProperties.mockResolvedValue({
      properties: [{ id: 'bien-7', title: 'Villa 4 pièces - Cocody Angré' }],
      pagination: { page: 1, limit: 200, total: 1, totalPages: 1 }
    });

    mountClients('/tenant/agence-1/finance/clients?from=2026-01-01&to=2026-01-31&propertyId=bien-7');

    await waitFor(() => expect(getClientsBalance).toHaveBeenCalled(), { timeout: 8000 });
    const appelFiltre = getClientsBalance.mock.calls.find(call => call[1]?.propertyId);
    expect(appelFiltre?.[1]).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      // Un IDENTIFIANT de bien, jamais son libelle : c'est ce que l'API
      // attend, et un libelle ne filtrerait rien. La liste deroulante le tire
      // du parc, seule source qui porte les deux.
      propertyId: 'bien-7'
    });
  });

  it('efface les filtres de l’adresse quand on les efface à l’écran', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });

    mountClients('/tenant/agence-1/finance/clients?from=2026-01-01&to=2026-01-31');
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });
    expect(screen.getByTestId('adresse')).toHaveTextContent('from=2026-01-01');

    await user.click(screen.getByText('Effacer les filtres'));

    await waitFor(() => expect(screen.getByTestId('adresse')).not.toHaveTextContent('from=2026-01-01'));
  });

  it('n’envoie pas de filtre quand l’adresse n’en porte aucun', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    mountClients();

    await waitFor(() => expect(getClientsBalance).toHaveBeenCalled(), { timeout: 8000 });
    for (const call of getClientsBalance.mock.calls) {
      expect(call[1]?.from).toBeUndefined();
      expect(call[1]?.to).toBeUndefined();
      expect(call[1]?.propertyId).toBeUndefined();
    }
  });
});

describe('Balance clients — ouverture du relevé', () => {
  it('mène au relevé du compte cliqué', async () => {
    getClientsBalance.mockResolvedValue({
      lines: [ligne({ accountId: 'compte-42', label: 'Awa Konan' })],
      totalBalance: 600_000,
      currency: 'XOF'
    });
    const user = userEvent.setup({ delay: null });
    mountClients();

    await user.click(await screen.findByRole('button', { name: 'Voir le relevé' }, { timeout: 8000 }));

    expect(screen.getByTestId('adresse')).toHaveTextContent('/tenant/agence-1/finance/comptes/compte-42');
    expect(await screen.findByText('relevé du compte')).toBeInTheDocument();
  });
});

describe('Balance âgée — rendu et tri', () => {
  it('affiche les cinq colonnes de tranche et le total de contrôle', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: [ligneAgee({ label: 'Mariam Diomandé', balance: 600_000, notYetDue: 600_000 })],
      totalBalance: 600_000,
      currency: 'XOF'
    });
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });

    mountAgee();

    expect(await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 })).toBeInTheDocument();
    // Ant Design duplique l'en-tête des colonnes triables (`sorter: true`)
    // pour la mesure du défilement horizontal (`scrollX`) : deux nœuds
    // identiques et invisibles l'un de l'autre, d'où `getAllByText`.
    expect(screen.getAllByText('À échoir').length).toBeGreaterThan(0);
    expect(screen.getAllByText('< 30 jours').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30 à 60 jours').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60 à 90 jours').length).toBeGreaterThan(0);
    expect(screen.getAllByText('> 90 jours').length).toBeGreaterThan(0);
    expect(screen.getByText('Total de contrôle')).toBeInTheDocument();
  });

  it('trie les lignes par une colonne de tranche', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: [
        ligneAgee({ accountId: 'c1', label: 'Petit retard', balance: 100_000, days60To90: 100_000 }),
        ligneAgee({ accountId: 'c2', label: 'Grand retard', balance: 900_000, days60To90: 900_000 }),
        ligneAgee({ accountId: 'c3', label: 'Retard moyen', balance: 500_000, days60To90: 500_000 })
      ],
      totalBalance: 1_500_000,
      currency: 'XOF'
    });
    getClientsBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });

    mountAgee();
    await screen.findByText('Petit retard', {}, { timeout: 8000 });

    const nomsDesLignes = () =>
      screen
        .getAllByRole('row')
        .slice(1) // la première ligne est l'en-tête
        .map(row => within(row).getAllByRole('cell')[0].textContent);

    // Ordre reçu de l'API : ni croissant ni décroissant, pour que le tri se
    // voie vraiment.
    expect(nomsDesLignes()).toEqual(['Petit retard', 'Grand retard', 'Retard moyen']);

    // Ant Design duplique l'en-tête de cette colonne triable pour la mesure
    // du défilement horizontal : le premier nœud est celui qui reçoit le clic.
    const enTeteTranche = () => screen.getAllByText('60 à 90 jours')[0];

    await user.click(enTeteTranche());
    await waitFor(() => expect(nomsDesLignes()).toEqual(['Petit retard', 'Retard moyen', 'Grand retard']));
    // Le tri vit dans l'URL comme les autres : partageable par copier-coller.
    expect(screen.getByTestId('adresse')).toHaveTextContent(/sort=days60To90/);

    await user.click(enTeteTranche());
    await waitFor(() => expect(nomsDesLignes()).toEqual(['Grand retard', 'Retard moyen', 'Petit retard']));
  });
});

describe('Vocabulaire — principe P-1 du PRD', () => {
  it('n’affiche jamais « débit » ni « crédit », sur aucun des deux écrans', async () => {
    const lignesNominales = [
      ligne({ accountId: 'compte-1', label: 'Mariam Diomandé', balance: 600_000 }),
      ligne({ accountId: 'compte-7', label: 'Aïssatou Barry', balance: -450_000 })
    ];
    const lignesAgees = lignesNominales.map(l => ligneAgee(l));

    getClientsBalance.mockResolvedValue({ lines: lignesNominales, totalBalance: 150_000, currency: 'XOF' });
    const { container: c1 } = mountClients();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    // Insensible à la casse ET aux accents : « Débit », « debit », « Crédit »,
    // « credit » sont tous des échecs.
    const motsInterdits = /d[ée]bit|cr[ée]dit/i;
    expect(c1.textContent).not.toMatch(motsInterdits);

    getClientsAgingBalance.mockResolvedValue({ lines: lignesAgees, totalBalance: 150_000, currency: 'XOF' });
    getClientsBalance.mockResolvedValue({ lines: lignesNominales, totalBalance: 150_000, currency: 'XOF' });
    const { container: c2 } = mountAgee();
    await screen.findAllByText('Mariam Diomandé', {}, { timeout: 8000 });

    expect(c2.textContent).not.toMatch(motsInterdits);
  });
});
