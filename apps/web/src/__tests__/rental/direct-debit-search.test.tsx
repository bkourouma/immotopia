import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectDebitMandates } from '../../pages/rental/DirectDebitMandates';
import { DirectDebitRemittanceDetail } from '../../pages/rental/DirectDebitRemittanceDetail';
import { ReturnImportsHistory } from '../../components/rental/direct-debit/ReturnImportsHistory';
import { creditor, makeLine, makeRemittance, REMITTANCE_ID, TENANT_ID } from './direct-debit-remittances-fixtures';

/**
 * Prélèvements : recherche multicritères des mandats (serveur), des lignes d'une
 * remise (locale, préfixe `lig`) et de l'historique des retours (serveur, préfixe `ret`).
 */

const listMandates = vi.fn();
const listCreditors = vi.fn();
const getRemittance = vi.fn();
const listReturnImports = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/direct-debit-service', () => ({
  listMandates: (...a: unknown[]) => listMandates(...a),
  listCreditors: (...a: unknown[]) => listCreditors(...a),
  getRemittance: (...a: unknown[]) => getRemittance(...a),
  refreshRemittance: vi.fn(),
  validateRemittance: vi.fn(),
  resendPrenotifications: vi.fn(),
  exportRemittance: vi.fn(),
  submitRemittance: vi.fn(),
  cancelRemittance: vi.fn(),
  cancelRemittanceLine: vi.fn(),
  listReturnImports: (...a: unknown[]) => listReturnImports(...a)
}));

configure({ asyncUtilTimeout: 8000 });
const T = { timeout: 8000 };

const Url: React.FC = () => <div data-testid="url">{useLocation().search}</div>;

function mount(path: string, element: React.ReactElement, initial: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path={path} element={element} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const MANDATE = {
  id: 'm-1',
  reference: 'MDT-2026-0001',
  scope: 'RENTAL_LEASE',
  status: 'ACTIVE',
  creditor: { id: 'c-1', label: 'Compte loyers', creditorIdentifier: 'CI123456' },
  debtor: { id: 'client-1', displayName: 'Awa Traoré', kind: 'CLIENT' },
  lease: { id: 'bail-1', leaseNumber: 'BAIL-001', status: 'ACTIVE' },
  syndicate: null,
  lot: null,
  ibanMasked: 'CI•• 5678',
  bankCode: 'CI010',
  holderName: 'Awa Traoré',
  maxAmount: null,
  collectionDay: null,
  effectiveCollectionDay: 5,
  signedAt: '2026-01-10T00:00:00.000Z',
  consecutiveRejects: 0
};

beforeEach(() => {
  vi.clearAllMocks();
  listCreditors.mockResolvedValue([creditor]);
  listMandates.mockResolvedValue({ items: [MANDATE], total: 1, page: 1, pageSize: 20 });
  listReturnImports.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
});

describe('DirectDebitMandates : recherche multicritères', () => {
  const path = '/tenant/:tenantId/rental/direct-debit';
  const start = `/tenant/${TENANT_ID}/rental/direct-debit`;

  it('charge sans critère puis envoie la saisie (search) et la met dans l’URL', async () => {
    const user = userEvent.setup();
    mount(path, <DirectDebitMandates />, start);
    expect(await screen.findByText('MDT-2026-0001')).toBeInTheDocument();
    expect(listMandates).toHaveBeenLastCalledWith(TENANT_ID, { page: 1, pageSize: 20 });

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'traore');
    await waitFor(
      () => expect(listMandates).toHaveBeenLastCalledWith(TENANT_ID, { search: 'traore', page: 1, pageSize: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=traore');
  });

  it('applique statut, créancier et période de signature d’une URL partagée', async () => {
    mount(
      path,
      <DirectDebitMandates />,
      `${start}?status=ACTIVE&creditorId=c-1&signedFrom=2026-01-01&signedTo=2026-01-31`
    );
    await screen.findByText('MDT-2026-0001');
    await waitFor(
      () =>
        expect(listMandates).toHaveBeenLastCalledWith(TENANT_ID, {
          status: 'ACTIVE',
          creditorId: 'c-1',
          signedFrom: '2026-01-01',
          signedTo: '2026-01-31',
          page: 1,
          pageSize: 20
        }),
      T
    );
  });

  it('ignore un statut inconnu de l’URL', async () => {
    mount(path, <DirectDebitMandates />, `${start}?status=BOGUS`);
    await screen.findByText('MDT-2026-0001');
    expect(listMandates).toHaveBeenLastCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listMandates.mockImplementation(async (_t: string, p: Record<string, unknown>) =>
      p.search ? { items: [], total: 0, page: 1, pageSize: 20 } : { items: [MANDATE], total: 1, page: 1, pageSize: 20 }
    );
    mount(path, <DirectDebitMandates />, `${start}?q=zzz`);
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('MDT-2026-0001')).toBeInTheDocument();
  });
});

describe('RemittanceDetailView : recherche locale dans les lignes', () => {
  const path = '/tenant/:tenantId/rental/direct-debit/remittances/:remittanceId';
  const start = `/tenant/${TENANT_ID}/rental/direct-debit/remittances/${REMITTANCE_ID}`;

  beforeEach(() => {
    getRemittance.mockResolvedValue(makeRemittance());
  });

  it('filtre les lignes sans accent ni casse (préfixe lig) sans rappeler l’API', async () => {
    const user = userEvent.setup();
    mount(path, <DirectDebitRemittanceDetail />, start);
    expect(await screen.findByText('PRL-2026-0001-002')).toBeInTheDocument();
    expect(screen.getByText('PRL-2026-0001-001')).toBeInTheDocument();

    const bar = screen.getByRole('search', { name: 'Rechercher dans les lignes de la remise' });
    await user.type(within(bar).getByRole('textbox'), 'DIALLO');
    await waitFor(() => expect(screen.queryByText('PRL-2026-0001-001')).not.toBeInTheDocument(), T);
    expect(screen.getByText('PRL-2026-0001-002')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('lig.q=DIALLO');
    expect(getRemittance).toHaveBeenCalledTimes(1);
  });

  it('applique un statut de ligne d’une URL partagée et propose d’effacer', async () => {
    const user = userEvent.setup();
    getRemittance.mockResolvedValue(
      makeRemittance({
        lines: [makeLine(), makeLine({ id: 'l-2', reference: 'PRL-2026-0001-002', status: 'CANCELED' })]
      })
    );
    mount(path, <DirectDebitRemittanceDetail />, `${start}?lig.statut=CANCELED`);
    expect(await screen.findByText('PRL-2026-0001-002')).toBeInTheDocument();
    expect(screen.queryByText('PRL-2026-0001-001')).not.toBeInTheDocument();

    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('PRL-2026-0001-001')).toBeInTheDocument();
  });
});

describe('ReturnImportsHistory : recherche paginée serveur', () => {
  const IMPORT = {
    id: 'i-1',
    scope: 'RENTAL_LEASE',
    format: 'GENERIC_CSV',
    fileName: 'retour-mars.csv',
    recordCount: 3,
    settledCount: 2,
    rejectedCount: 1,
    skippedCount: 0,
    errorCount: 0,
    importedBy: { id: 'u1', fullName: 'Kouamé Yao' },
    createdAt: '2026-03-02T10:00:00.000Z'
  };

  it('envoie nom de fichier et période (from/to) avec le préfixe ret', async () => {
    const user = userEvent.setup();
    listReturnImports.mockResolvedValue({ items: [IMPORT], total: 1, page: 1, pageSize: 10 });
    mount('/h', <ReturnImportsHistory tenantId={TENANT_ID} />, '/h');
    expect(await screen.findByText('retour-mars.csv')).toBeInTheDocument();
    expect(listReturnImports).toHaveBeenLastCalledWith(TENANT_ID, { page: 1, pageSize: 10 });

    await user.type(screen.getByPlaceholderText('Nom du fichier…'), 'mars');
    await waitFor(
      () => expect(listReturnImports).toHaveBeenLastCalledWith(TENANT_ID, { search: 'mars', page: 1, pageSize: 10 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('ret.q=mars');
  });

  it('lit la période d’import dans l’URL', async () => {
    listReturnImports.mockResolvedValue({ items: [IMPORT], total: 1, page: 1, pageSize: 10 });
    mount(
      '/h',
      <ReturnImportsHistory tenantId={TENANT_ID} />,
      '/h?ret.importedFrom=2026-03-01&ret.importedTo=2026-03-31'
    );
    await screen.findByText('retour-mars.csv');
    expect(listReturnImports).toHaveBeenLastCalledWith(TENANT_ID, {
      from: '2026-03-01',
      to: '2026-03-31',
      page: 1,
      pageSize: 10
    });
  });
});
