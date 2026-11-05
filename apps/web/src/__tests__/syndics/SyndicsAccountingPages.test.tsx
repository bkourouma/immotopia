import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicAccounting } from '../../pages/syndics/SyndicAccounting';
import * as syndicService from '../../services/syndic-service';

const { confirmSpy } = vi.hoisted(() => ({ confirmSpy: vi.fn() }));

// Le mock du module couvre CHAQUE export utilisé par l'écran et ses onglets.
vi.mock('../../services/syndic-service', () => ({
  createAccountingEntry: vi.fn(),
  createAccountingJournal: vi.fn(),
  createChartOfAccount: vi.fn(),
  getAccountLedger: vi.fn(),
  getTrialBalance: vi.fn(),
  listAccountingEntries: vi.fn(),
  listAccountingJournals: vi.fn(),
  listChartOfAccounts: vi.fn(),
  loadSyndicChartTemplate: vi.fn(),
  lockAccountingEntry: vi.fn()
}));

// Le bouton « Exporter » des tableaux a ses propres tests (primitives/export-menu) : ici il est neutralisé.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

// 992 px et plus : la barre de recherche s'affiche en ligne.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// Seul `App.useApp` est remplacé : la confirmation « Charger le plan » est capturée par `confirmSpy`.
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const appApi = {
    message: { success() {}, error() {}, warning() {}, info() {}, loading() {} },
    modal: { confirm: confirmSpy, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return { ...actual, App: Object.assign((() => null) as unknown as typeof actual.App, { useApp: () => appApi }) };
});

const svc = syndicService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const authValue: AuthContextType = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    globalRole: 'USER',
    emailVerified: true,
    preferredLanguage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  isAuthenticated: true,
  isLoading: false,
  error: null,
  tenantMembership: {
    id: 'membership-1',
    tenantId: 'tenant-1',
    tenant: { id: 'tenant-1', name: 'Tenant Demo', slug: 'tenant-demo' },
    status: 'ACTIVE'
  },
  tenantClient: null,
  isLoadingMembership: false,
  login: async () => undefined,
  logout: async () => undefined,
  register: async () => undefined,
  refreshToken: async () => undefined,
  clearError: vi.fn(),
  refreshMembership: async () => undefined,
  availableTenants: [],
  activeTenantId: null,
  switchTenant: () => undefined
};

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

const T = { timeout: 8000 };

function renderWithRoute(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/comptabilite${search}`]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/syndics/:syndicId/comptabilite" element={<SyndicAccounting />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const plan = [
  {
    id: 'acc-1',
    accountNumber: '401',
    accountName: 'Fournisseurs',
    accountClass: 4,
    accountType: 'LIABILITY',
    isActive: true
  },
  {
    id: 'acc-2',
    accountNumber: '411',
    accountName: 'Copropriétaires',
    accountClass: 4,
    accountType: 'ASSET',
    isActive: true
  }
];

const pagination = (total = 1) => ({ page: 1, limit: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) });

describe('Syndics accounting page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.listChartOfAccounts.mockResolvedValue(plan);
    svc.listAccountingJournals.mockResolvedValue([
      {
        id: 'journal-1',
        code: 'JG',
        label: 'Journal general',
        fiscalYear: 2026,
        journalType: 'GENERAL',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    svc.listAccountingEntries.mockResolvedValue({
      items: [
        {
          id: 'entry-1',
          journalId: 'journal-1',
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-001',
          description: 'Ecriture test',
          sourceType: 'MANUAL',
          isLocked: false,
          journal: { code: 'JG' },
          lines: [{ id: 'l1', label: 'Ligne détail secrète', debit: 10, credit: 0 }]
        }
      ],
      pagination: pagination(45)
    });
    svc.getTrialBalance.mockResolvedValue({
      items: [
        {
          accountId: 'acc-1',
          accountNumber: '401',
          accountName: 'Fournisseurs',
          accountClass: 4,
          totalDebit: 10000,
          totalCredit: 10000,
          balance: 0
        }
      ],
      totals: { totalDebit: 10000, totalCredit: 10000, isBalanced: true },
      filteredTotals: { totalDebit: 10000, totalCredit: 10000 }
    });
    svc.getAccountLedger.mockResolvedValue({
      account: {
        id: 'acc-1',
        accountNumber: '401',
        accountName: 'Fournisseurs',
        accountClass: 4,
        accountType: 'LIABILITY'
      },
      summary: {
        openingBalance: 111000,
        periodDebit: 222000,
        periodCredit: 333000,
        closingBalance: 444000,
        lineCount: 1
      },
      items: [
        {
          id: 'line-1',
          entryId: 'entry-1',
          entryDate: '2026-03-01T00:00:00.000Z',
          reference: 'JE-001',
          description: 'Ecriture test',
          journalCode: 'JG',
          label: 'Libellé grand livre',
          lotId: null,
          lotNumber: 'A1',
          debit: 10000,
          credit: 0,
          runningBalance: 555000
        }
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });
  });

  it("affiche l'onglet Écritures par défaut sans charger la balance ni le grand livre", async () => {
    renderWithRoute();
    expect(await screen.findByText('Comptabilité syndic', undefined, T)).toBeTruthy();
    expect(await screen.findByText('JE-001', undefined, T)).toBeTruthy();

    // Aucun critère actif : ni période ni recherche envoyées (tout l'historique, comme avant la phase 1).
    expect(svc.listAccountingEntries).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 });
    expect(svc.getTrialBalance).not.toHaveBeenCalled();
    expect(svc.getAccountLedger).not.toHaveBeenCalled();
    // Lignes d'écriture repliées par défaut : le détail n'est pas rendu.
    expect(screen.queryByText('Ligne détail secrète')).toBeNull();
    expect(screen.getByRole('search', { name: 'Rechercher dans les écritures' })).toBeTruthy();
  });

  it('locks an entry', async () => {
    svc.lockAccountingEntry.mockResolvedValue({ id: 'entry-1', isLocked: true });

    renderWithRoute();
    fireEvent.click(await screen.findByText('Verrouiller', undefined, T));

    await waitFor(() => {
      expect(svc.lockAccountingEntry).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'entry-1');
    }, T);
  });

  it('demande la page suivante au serveur et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    await user.click(screen.getByTitle('2'));

    await waitFor(
      () => expect(svc.listAccountingEntries).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { page: 2, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ecr.page=2');
  });

  it('envoie la saisie de recherche des écritures au serveur après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    await user.type(screen.getByPlaceholderText('Référence, description, libellé de ligne…'), 'loyer');

    await waitFor(
      () =>
        expect(svc.listAccountingEntries).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'loyer',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ecr.q=loyer');
  });

  it("applique les critères d'une URL partagée aux écritures (journal, compte, statut, période)", async () => {
    renderWithRoute(
      '?ecr.journal=journal-1&ecr.account=acc-2&ecr.status=locked&ecr.periodFrom=2026-01-01&ecr.periodTo=2026-03-31'
    );
    await screen.findByText('JE-001', undefined, T);

    await waitFor(
      () =>
        expect(svc.listAccountingEntries).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          journalId: 'journal-1',
          accountId: 'acc-2',
          status: 'locked',
          from: '2026-01-01',
          to: '2026-03-31',
          page: 1,
          limit: 20
        }),
      T
    );
    // Le libellé du compte venu de l'URL est retrouvé dans le plan : pas d'identifiant brut dans les puces.
    expect(await screen.findAllByText(/411 - Copropriétaires/, undefined, T)).not.toHaveLength(0);
  });

  it('efface les critères des écritures et revient à la liste complète', async () => {
    const user = userEvent.setup();
    svc.listAccountingEntries.mockImplementation(async (_t: string, _s: string, params: Record<string, unknown>) =>
      params.search
        ? { items: [], pagination: pagination(0) }
        : {
            items: [
              {
                id: 'entry-1',
                journalId: 'journal-1',
                entryDate: '2026-03-01T00:00:00.000Z',
                reference: 'JE-001',
                description: 'Ecriture test',
                sourceType: 'MANUAL',
                isLocked: false,
                journal: { code: 'JG' },
                lines: []
              }
            ],
            pagination: pagination(1)
          }
    );
    renderWithRoute('?ecr.q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)).toBeTruthy();
    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);

    expect(await screen.findByText('JE-001', undefined, T)).toBeTruthy();
    expect(svc.listAccountingEntries).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('ecr.q');
  });

  it('invite à choisir un compte dans le grand livre, sans requête', async () => {
    const user = userEvent.setup();
    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    await user.click(screen.getByRole('tab', { name: 'Grand livre' }));

    expect(await screen.findByText('Choisissez un compte pour afficher son grand livre.', undefined, T)).toBeTruthy();
    expect(svc.getAccountLedger).not.toHaveBeenCalled();
    // L'URL repart propre : seul l'onglet est nommé.
    expect(screen.getByTestId('url').textContent).toBe('?tab=grand-livre');
  });

  it("charge le grand livre du compte de l'URL avec sa synthèse et le solde progressif", async () => {
    renderWithRoute('?tab=grand-livre&accountId=acc-1');

    expect(await screen.findByText('Libellé grand livre', undefined, T)).toBeTruthy();
    expect(svc.getAccountLedger).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
      accountId: 'acc-1',
      page: 1,
      limit: 50
    });
    expect(screen.getByText("Solde d'ouverture")).toBeTruthy();
    expect(screen.getByText(/111\D*000/)).toBeTruthy();
    expect(screen.getByText(/444\D*000/)).toBeTruthy();
    expect(screen.getByText(/555\D*000/)).toBeTruthy();
    expect(svc.listAccountingEntries).not.toHaveBeenCalled();
  });

  it('envoie la recherche du grand livre au serveur avec le compte choisi', async () => {
    const user = userEvent.setup();
    renderWithRoute('?tab=grand-livre&accountId=acc-1');
    await screen.findByText('Libellé grand livre', undefined, T);
    await user.type(screen.getByPlaceholderText('Pièce, description, libellé de ligne…'), 'JE-001');

    await waitFor(
      () =>
        expect(svc.getAccountLedger).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          accountId: 'acc-1',
          search: 'JE-001',
          page: 1,
          limit: 50
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('gl.q=JE-001');
    expect(screen.getByTestId('url').textContent).toContain('accountId=acc-1');
  });

  it('ouvre le grand livre depuis une ligne de la balance en reportant la période', async () => {
    const user = userEvent.setup();
    renderWithRoute('?tab=balance&bal.periodFrom=2026-01-01&bal.periodTo=2026-06-30');

    expect(await screen.findByText('401 - Fournisseurs', undefined, T)).toBeTruthy();
    expect(screen.getByText('Balance équilibrée')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Grand livre' }));

    await waitFor(
      () =>
        expect(svc.getAccountLedger).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
          accountId: 'acc-1',
          from: '2026-01-01',
          to: '2026-06-30',
          page: 1,
          limit: 50
        }),
      T
    );
    expect(await screen.findByText('Libellé grand livre', undefined, T)).toBeTruthy();
  });

  it('envoie les classes de la balance au serveur (liste séparée par des virgules) sans page ni limite', async () => {
    renderWithRoute('?tab=balance&bal.class=4,5&bal.hideZero=1');
    await screen.findByText('401 - Fournisseurs', undefined, T);

    expect(svc.getTrialBalance).toHaveBeenCalledWith('tenant-1', 'syndic-1', {
      accountClass: '4,5',
      hideZero: 'true'
    });
    // Les puces portent le critère : « Classe 4 » et « Classe 5 ».
    const barre = screen.getByRole('search', { name: 'Rechercher dans la balance' });
    expect((await within(barre).findAllByText(/Classe 4/, undefined, T)).length).toBeGreaterThan(0);
  });

  it('envoie la recherche de la balance au serveur', async () => {
    const user = userEvent.setup();
    renderWithRoute('?tab=balance');
    await screen.findByText('401 - Fournisseurs', undefined, T);
    await user.type(screen.getByPlaceholderText('Numéro ou intitulé du compte…'), 'four');

    await waitFor(
      () => expect(svc.getTrialBalance).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { search: 'four' }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('bal.q=four');
  });

  it('filtre le plan comptable en local, sans requête et sans tenir compte des accents', async () => {
    const user = userEvent.setup();
    renderWithRoute('?tab=plan');
    expect(await screen.findByText('Fournisseurs', undefined, T)).toBeTruthy();
    expect(screen.getByText('Copropriétaires')).toBeTruthy();
    const appelsAvant = svc.listChartOfAccounts.mock.calls.length;

    await user.type(screen.getByPlaceholderText('Numéro ou intitulé du compte…'), 'COPROPRIETAIRES');
    await waitFor(() => expect(screen.queryByText('Fournisseurs')).toBeNull(), T);
    expect(screen.getByText('Copropriétaires')).toBeTruthy();
    expect(screen.getByTestId('url').textContent).toContain('plan.q=COPROPRIETAIRES');
    expect(svc.listChartOfAccounts.mock.calls.length).toBe(appelsAvant);
  });

  it('filtre le plan comptable par classe depuis l’URL', async () => {
    renderWithRoute('?tab=plan&plan.classe=1');
    // Aucun compte de classe 1 dans le plan de test : « Aucun résultat » et compteur à zéro.
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)).toBeTruthy();
    expect(screen.queryByText('Fournisseurs')).toBeNull();
  });

  it('filtre les journaux en local par code', async () => {
    const user = userEvent.setup();
    svc.listAccountingJournals.mockResolvedValue([
      {
        id: 'j1',
        code: 'JG',
        label: 'Journal général',
        fiscalYear: 2026,
        journalType: 'GENERAL',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'j2',
        code: 'BQ',
        label: 'Banque principale',
        fiscalYear: 2026,
        journalType: 'BANK',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    renderWithRoute('?tab=journaux');
    expect(await screen.findByText('Banque principale', undefined, T)).toBeTruthy();

    await user.type(screen.getByPlaceholderText('Code ou libellé du journal…'), 'bq');
    await waitFor(() => expect(screen.queryByText('Journal général')).toBeNull(), T);
    expect(screen.getByText('Banque principale')).toBeTruthy();
  });

  it('loads the SYSCOHADA chart directly when the chart is empty', async () => {
    let loaded = false;
    svc.listChartOfAccounts.mockImplementation(() =>
      Promise.resolve(
        loaded
          ? [
              {
                id: 'a',
                accountNumber: '101',
                accountName: 'Capital',
                accountClass: 1,
                accountType: 'EQUITY',
                isActive: true
              }
            ]
          : []
      )
    );
    svc.loadSyndicChartTemplate.mockImplementation(() => {
      loaded = true;
      return Promise.resolve({ created: 12, skipped: 0, total: 12 });
    });

    renderWithRoute('?tab=plan');
    expect(await screen.findByText(/plan comptable de cette copropriété est vide/, undefined, T)).toBeTruthy();
    fireEvent.click(await screen.findByText('Charger le plan SYSCOHADA'));

    await waitFor(() => expect(svc.loadSyndicChartTemplate).toHaveBeenCalledWith('tenant-1', 'syndic-1'), T);
    await waitFor(() => expect(screen.queryByText(/plan comptable de cette copropriété est vide/)).toBeNull(), T);
    // Chargement initial + rechargement après invalidation : aucune requête de recherche en plus.
    const planCalls = svc.listChartOfAccounts.mock.calls.filter(call => !call[2]);
    expect(planCalls.length).toBe(2);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks for confirmation before loading the chart when it is not empty', async () => {
    svc.loadSyndicChartTemplate.mockResolvedValue({ created: 3, skipped: 9, total: 12 });
    confirmSpy.mockImplementation((opts: any) => opts.onOk);

    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    fireEvent.click(await screen.findByText('Charger le plan SYSCOHADA', undefined, T));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(svc.loadSyndicChartTemplate).not.toHaveBeenCalled();

    await confirmSpy.mock.calls[0][0].onOk();
    expect(svc.loadSyndicChartTemplate).toHaveBeenCalledWith('tenant-1', 'syndic-1');
  });

  it('renders account types through t()', async () => {
    renderWithRoute('?tab=plan');
    expect((await screen.findAllByText('Passif', undefined, T)).length).toBeGreaterThan(0);
  });

  it('lit le plan complet (comptes inactifs compris) dans l’onglet Plan comptable seulement', async () => {
    svc.listChartOfAccounts.mockImplementation((_t: string, _s: string, query?: { onlyActive?: boolean }) =>
      Promise.resolve(
        query?.onlyActive === false
          ? [
              ...plan,
              {
                id: 'acc-9',
                accountNumber: '999',
                accountName: 'Ancien compte',
                accountClass: 9,
                accountType: 'EXPENSE',
                isActive: false
              }
            ]
          : plan
      )
    );
    renderWithRoute('?tab=plan');
    expect(await screen.findByText('Ancien compte', undefined, T)).toBeTruthy();
    expect(screen.getByText('Inactif')).toBeTruthy();
    expect(svc.listChartOfAccounts).toHaveBeenCalledWith('tenant-1', 'syndic-1', { onlyActive: false });
  });

  it('ne lit pas le plan complet hors de l’onglet Plan comptable', async () => {
    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    expect(svc.listChartOfAccounts).not.toHaveBeenCalledWith('tenant-1', 'syndic-1', { onlyActive: false });
  });

  it('affiche des libellés lisibles pour le statut des écritures et le type de journal', async () => {
    renderWithRoute();
    await screen.findByText('JE-001', undefined, T);
    expect(screen.getByText('Ouverte')).toBeTruthy();
    expect(screen.queryByText('OUVERTE')).toBeNull();
  });
});
