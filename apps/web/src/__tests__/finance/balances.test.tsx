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
 * Le mock de `services/finance-service` couvre les exports des deux
 * écrans (balances et lookup des biens) : Vitest
 * refuse tout import qu'un `vi.mock` ne déclare pas explicitement, là où Jest
 * renvoyait `undefined` en silence (AGENTS.md).
 */

const getClientsBalance = vi.fn();
const getClientsAgingBalance = vi.fn();
const listClientBalanceProperties = vi.fn();

vi.mock('../../services/finance-service', () => ({
  getClientsBalance: (...a: unknown[]) => getClientsBalance(...a),
  getClientsAgingBalance: (...a: unknown[]) => getClientsAgingBalance(...a),
  listClientBalanceProperties: (...a: unknown[]) => listClientBalanceProperties(...a)
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

function mountClients(url = '/tenant/agence-1/finance/balance-clients') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/balance-clients" element={<BalanceClients />} />
            <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<span>relevé du compte</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountAgee(url = '/tenant/agence-1/finance/balance-agee') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Adresse />
          <Routes>
            <Route path="/tenant/:tenantId/finance/balance-agee" element={<BalanceAgee />} />
            <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<span>relevé du compte</span>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listClientBalanceProperties.mockResolvedValue([{ id: 'bien-7', title: 'Villa 4 pièces - Cocody Angré' }]);
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
    mountClients('/tenant/agence-1/finance/balance-clients?propertyId=bien-inexistant');

    // Le bouton apparaît deux fois : dans la barre de recherche, et dans le
    // bloc « aucun résultat » de `<DataView>`. C'est sa présence qui prouve la
    // distinction avec l'état « aucun compte ».
    expect(
      (await screen.findAllByRole('button', { name: 'Effacer les critères' }, { timeout: 8000 })).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Aucun compte de locataire enregistré.')).not.toBeInTheDocument();
  });
});

describe('Balance clients — état dans l’URL', () => {
  it('relit la période et le bien depuis l’adresse au montage', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    listClientBalanceProperties.mockResolvedValue([{ id: 'bien-7', title: 'Villa 4 pièces - Cocody Angré' }]);

    mountClients('/tenant/agence-1/finance/balance-clients?from=2026-01-01&to=2026-01-31&propertyId=bien-7');

    await waitFor(() => expect(getClientsBalance).toHaveBeenCalled(), { timeout: 8000 });
    const appelFiltre = getClientsBalance.mock.calls.find(call => call[1]?.propertyId);
    expect(appelFiltre?.[1]).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      // Un IDENTIFIANT de bien, jamais son libelle : c'est ce que l'API
      // attend, et un libelle ne filtrerait rien. La liste deroulante le tire
      // du lookup financier, seule source qui porte les deux pour ce rôle.
      propertyId: 'bien-7'
    });
  });

  it('précise que le solde est celui de la fin de période quand une période est filtrée, et seulement alors', async () => {
    const note = 'Période filtrée : le solde est celui à la fin de la période.';
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });

    const { unmount } = mountClients('/tenant/agence-1/finance/balance-clients?from=2026-01-01&to=2026-01-31');
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });
    expect(screen.getByText(note)).toBeInTheDocument();
    unmount();

    mountClients();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });

  it('efface les filtres de l’adresse quand on les efface à l’écran', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });

    mountClients('/tenant/agence-1/finance/balance-clients?from=2026-01-01&to=2026-01-31');
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });
    expect(screen.getByTestId('adresse')).toHaveTextContent('from=2026-01-01');

    const effacer = await screen.findAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

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

describe('Balance âgée — écart comptable', () => {
  it('affiche la somme des tranches comme solde et signale l’écart, sans rien afficher quand il est nul', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: [
        ligneAgee({
          accountId: 'c1',
          label: 'Avec écart',
          balance: 777_000,
          agedTotal: 500_000,
          ledgerBalance: 777_000,
          gap: 277_000,
          daysOver90: 500_000
        }),
        ligneAgee({
          accountId: 'c2',
          label: 'Sans écart',
          balance: 123_000,
          agedTotal: 123_000,
          ledgerBalance: 123_000,
          gap: 0,
          days0To30: 123_000
        })
      ],
      totalBalance: 623_000,
      ledgerTotalBalance: 900_000,
      gap: 277_000,
      currency: 'XOF'
    });
    getClientsBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });

    mountAgee();
    const ligneAvecEcart = (await screen.findByText('Avec écart', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    const ligneSansEcart = screen.getByText('Sans écart').closest('tr') as HTMLElement;

    // Le solde est la somme des tranches, pas le solde comptable.
    expect(within(ligneAvecEcart).queryByText(/777\s000/)).not.toBeInTheDocument();
    expect(within(ligneAvecEcart).getAllByText(/500\s000/).length).toBeGreaterThan(0);
    expect(within(ligneAvecEcart).getByText(/Écart avec la comptabilité : 277\s000/)).toBeInTheDocument();

    expect(within(ligneSansEcart).queryByText(/Écart avec la comptabilité/)).not.toBeInTheDocument();

    // Écart global : une mention près du total de contrôle (ligne + global).
    expect(screen.getAllByText(/Écart avec la comptabilité/)).toHaveLength(2);
  });

  it('n’affiche aucun écart quand l’API n’en renvoie pas', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: [ligneAgee({ label: 'Ancien cache', balance: 600_000 })],
      totalBalance: 600_000,
      currency: 'XOF'
    });
    getClientsBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });

    mountAgee();
    await screen.findByText('Ancien cache', {}, { timeout: 8000 });
    expect(screen.queryByText(/Écart avec la comptabilité/)).not.toBeInTheDocument();
  });
});

describe('Vocabulaire — principe P-1 du PRD', () => {
  it('n’affiche jamais « débit » ni « crédit », sur aucun des deux écrans', async () => {
    const lignesNominales = [
      ligne({ accountId: 'compte-1', label: 'Mariam Diomandé', balance: 600_000 }),
      ligne({ accountId: 'compte-7', label: 'Aïssatou Brou', balance: -450_000 })
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

describe('Balances — recherche multicritères', () => {
  const choisirLeBien = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('combobox', { name: 'Bien' }));
    await user.click(
      await screen.findByText(
        'Villa 4 pièces - Cocody Angré',
        { selector: '.ant-select-item-option-content' },
        { timeout: 8000 }
      )
    );
  };

  it('balance clients : choisir un bien envoie son identifiant depuis le lookup financier', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountClients();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    await choisirLeBien(user);

    await waitFor(
      () => expect(getClientsBalance.mock.calls.some(call => call[1]?.propertyId === 'bien-7')).toBe(true),
      { timeout: 8000 }
    );
    expect(screen.getByTestId('adresse')).toHaveTextContent('propertyId=bien-7');
    expect(listClientBalanceProperties).toHaveBeenCalledWith('agence-1');
  }, 20000);

  it('balance âgée : choisir un bien envoie son identifiant', async () => {
    getClientsAgingBalance.mockResolvedValue({ lines: [ligneAgee()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountAgee();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    await choisirLeBien(user);

    await waitFor(
      () => expect(getClientsAgingBalance.mock.calls.some(call => call[1]?.propertyId === 'bien-7')).toBe(true),
      { timeout: 8000 }
    );
  }, 20000);

  it('balance clients : le texte saisi part au serveur (search) et se lit dans l’URL', async () => {
    getClientsBalance.mockResolvedValue({ lines: [ligne()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountClients();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    await user.type(within(screen.getByRole('search')).getByRole('textbox', { name: 'Rechercher' }), 'Diomandé');

    await waitFor(() => expect(getClientsBalance.mock.calls.some(call => call[1]?.search === 'Diomandé')).toBe(true), {
      timeout: 8000
    });
    expect(screen.getByTestId('adresse')).toHaveTextContent(/q=Diomand/);
  }, 20000);

  it('balance âgée : le texte saisi part au serveur (search), la période garde from et to', async () => {
    getClientsAgingBalance.mockResolvedValue({ lines: [ligneAgee()], totalBalance: 600_000, currency: 'XOF' });
    const user = userEvent.setup({ delay: null });
    mountAgee('/tenant/agence-1/finance/balance-agee?from=2026-01-01&to=2026-01-31');
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    await user.type(within(screen.getByRole('search')).getByRole('textbox', { name: 'Rechercher' }), 'Traoré');

    await waitFor(
      () =>
        expect(
          getClientsAgingBalance.mock.calls.some(
            call => call[1]?.search === 'Traoré' && call[1]?.from === '2026-01-01' && call[1]?.to === '2026-01-31'
          )
        ).toBe(true),
      { timeout: 8000 }
    );
  }, 20000);
});

describe('Balances — pagination locale', () => {
  const vingtCinq = () =>
    Array.from({ length: 25 }, (_, i) =>
      ligne({
        accountId: `compte-${i + 1}`,
        label: `Locataire ${String(i + 1).padStart(2, '0')}`,
        balance: 1000 * (i + 1)
      })
    );

  it('balance clients : 20 lignes sur 25, compteur affiché, total de contrôle du serveur intact', async () => {
    getClientsBalance.mockResolvedValue({ lines: vingtCinq(), totalBalance: 9_999_000, currency: 'XOF' });
    mountClients();

    await screen.findByText('Locataire 01', {}, { timeout: 8000 });
    expect(screen.getByText('Locataire 20')).toBeInTheDocument();
    expect(screen.queryByText('Locataire 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
    // Le total de contrôle est celui du serveur, pas la somme des 20 lignes affichées.
    expect(screen.getByText(/9\s?999\s?000/)).toBeInTheDocument();
  }, 20000);

  it('balance âgée : 20 lignes sur 25 et compteur affiché', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: vingtCinq().map(l => ({ ...l, notYetDue: 0, days0To30: 0, days30To60: 0, days60To90: 0, daysOver90: 0 })),
      totalBalance: 0,
      currency: 'XOF'
    });
    mountAgee();

    await screen.findByText('Locataire 01', {}, { timeout: 8000 });
    expect(screen.queryByText('Locataire 21')).not.toBeInTheDocument();
    expect(screen.getByText('1–20 sur 25')).toBeInTheDocument();
  }, 20000);
});
