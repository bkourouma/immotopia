import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import AuthContext from '../../context/AuthContext';
import { AuthContextType } from '../../types/auth-types';
import { SyndicReceipts } from '../../pages/syndics/SyndicReceipts';

/**
 * Lot S3 (besoin 1) : écran « Quittances ». Mock sur les services dédiés
 * (frontière logique de ce module, comme `LotPaymentModal.test.tsx`) : liste
 * filtrable, renvoi par e-mail (avec son 422), rattrapage.
 */

// 992 px et plus : la barre de recherche s'affiche en ligne.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const listSyndicateLots = vi.fn();

vi.mock('../../services/syndic-service', () => ({
  listSyndicateLots: (...args: unknown[]) => listSyndicateLots(...args)
}));

const listSyndicateReceipts = vi.fn();
const resendReceiptEmail = vi.fn();
const backfillMissingReceipts = vi.fn();
const downloadReceiptFile = vi.fn();
const downloadReceiptWordFile = vi.fn();
const printReceipts = vi.fn();

vi.mock('../../services/syndic-receipt-service', () => ({
  listSyndicateReceipts: (...args: unknown[]) => listSyndicateReceipts(...args),
  resendReceiptEmail: (...args: unknown[]) => resendReceiptEmail(...args),
  backfillMissingReceipts: (...args: unknown[]) => backfillMissingReceipts(...args),
  downloadReceiptFile: (...args: unknown[]) => downloadReceiptFile(...args),
  downloadReceiptWordFile: (...args: unknown[]) => downloadReceiptWordFile(...args),
  printReceipts: (...args: unknown[]) => printReceipts(...args)
}));

vi.mock('../../utils/save-blob', () => ({
  saveBlob: vi.fn(),
  filenameFromDisposition: vi.fn((_disposition: unknown, fallback: string) => fallback)
}));

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <AntApp>
          <MemoryRouter initialEntries={[`/tenant/tenant-1/syndics/syndic-1/quittances${search}`]}>
            <Url />
            <Routes>
              <Route path="/tenant/:tenantId/syndics/:syndicId/quittances" element={<SyndicReceipts />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const RECEIPT = {
  id: 'receipt-1',
  kind: 'QUITTANCE' as const,
  number: 'Q-2026-000001',
  lotId: 'lot-1',
  lotNumber: 'A-01',
  contactId: 'contact-1',
  coownerName: 'Awa Diop',
  chargeCallId: 'call-1',
  chargePaymentId: 'payment-1',
  periodLabel: 'Septembre 2026',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  amount: 50000,
  currency: 'XOF',
  issuedAt: '2026-09-05T10:00:00.000Z',
  emailedAt: null,
  emailError: null,
  emailErrorCode: null,
  backfilled: false
};

describe('SyndicReceipts (lot S3, besoin 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSyndicateLots.mockResolvedValue([]);
  });

  it('affiche la liste et envoie les filtres au service', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });

    renderWithRoute();

    await waitFor(() =>
      expect(listSyndicateReceipts).toHaveBeenCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 })
    );

    expect(await screen.findByText('Q-2026-000001')).toBeTruthy();
    expect(screen.getByText('Awa Diop')).toBeTruthy();
    expect(screen.getByText('Non envoyé')).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('envoie la saisie de recherche au service après le debounce et la met dans l’URL', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    const user = userEvent.setup();
    renderWithRoute();
    await screen.findByText('Q-2026-000001', undefined, T);
    await user.type(
      within(screen.getByRole('search')).getByPlaceholderText('Numéro, lot, copropriétaire, e-mail…'),
      'diop'
    );

    await waitFor(
      () =>
        expect(listSyndicateReceipts).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          search: 'diop',
          page: 1,
          limit: 20
        }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=diop');
  });

  it('applique les critères d’une URL partagée (type, lot, copropriétaire, période, rattrapé)', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    listSyndicateLots.mockResolvedValue([
      { id: 'lot-1', syndicateId: 'syndic-1', lotNumber: 'A-01', lotType: 'APARTMENT', ownerContactId: 'contact-1' }
    ]);
    renderWithRoute('?type=QUITTANCE&lot=lot-1&owner=contact-1&periodFrom=2026-09-01&periodTo=2026-09-30&backfilled=0');
    await screen.findByText('Q-2026-000001', undefined, T);

    await waitFor(
      () =>
        expect(listSyndicateReceipts).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', {
          kind: 'QUITTANCE',
          lotId: 'lot-1',
          contactId: 'contact-1',
          from: '2026-09-01',
          to: '2026-09-30',
          backfilled: false,
          page: 1,
          limit: 20
        }),
      T
    );
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listSyndicateReceipts.mockImplementation(async (_t: string, _s: string, params: Record<string, unknown>) => ({
      items: params.search ? [] : [RECEIPT],
      pagination: { page: 1, limit: 20, total: params.search ? 0 : 1, totalPages: 1 }
    }));
    renderWithRoute('?q=zzz');
    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)).toBeTruthy();
    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);

    expect(await screen.findByText('Q-2026-000001', undefined, T)).toBeTruthy();
    expect(listSyndicateReceipts).toHaveBeenLastCalledWith('tenant-1', 'syndic-1', { page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });

  it('télécharge la quittance en Word depuis le bouton « Télécharger (Word) »', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    downloadReceiptWordFile.mockResolvedValue({ blob: new Blob(['PK']), filename: 'quittance-Q-2026-000001.docx' });
    const user = userEvent.setup();

    renderWithRoute();
    await screen.findByText('Q-2026-000001');
    await user.click(screen.getByRole('button', { name: /Télécharger \(Word\)/ }));

    await waitFor(() =>
      expect(downloadReceiptWordFile).toHaveBeenCalledWith(
        'tenant-1',
        'syndic-1',
        RECEIPT.id,
        expect.stringMatching(/\.docx$/)
      )
    );
    expect(downloadReceiptFile).not.toHaveBeenCalled();
  });

  it('affiche l’erreur 422 quand le copropriétaire n’a pas d’e-mail', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    resendReceiptEmail.mockRejectedValue({
      response: {
        status: 422,
        data: { success: false, error: "Le copropriétaire de ce lot n'a pas d'adresse e-mail." }
      }
    });

    renderWithRoute();
    await screen.findByText('Q-2026-000001');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Renvoyer/ }));

    await waitFor(() => expect(resendReceiptEmail).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'receipt-1'));
    expect(await screen.findByText("Le copropriétaire de ce lot n'a pas d'adresse e-mail.")).toBeTruthy();
  });

  it('affiche un message clair sur un 429 « EMAIL_RECENTLY_SENT »', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [RECEIPT],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });
    resendReceiptEmail.mockRejectedValue({
      response: {
        status: 429,
        data: { success: false, message: "Ce document vient d'être envoyé", code: 'EMAIL_RECENTLY_SENT' }
      }
    });

    renderWithRoute();
    await screen.findByText('Q-2026-000001');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Renvoyer/ }));

    expect(
      await screen.findByText("Ce document vient d'être envoyé : patientez deux minutes avant de le renvoyer.")
    ).toBeTruthy();
  });

  it('traduit le code d’erreur d’envoi plutôt que d’afficher le message brut de l’API', async () => {
    listSyndicateReceipts.mockResolvedValue({
      items: [
        { ...RECEIPT, emailError: 'Le serveur de messagerie a refusé l’e-mail.', emailErrorCode: 'SMTP_REJECTED' }
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    });

    renderWithRoute();

    expect(await screen.findByText("Erreur : Le serveur de messagerie a refusé l'e-mail.")).toBeTruthy();
  });

  it('génère les quittances manquantes, en relançant automatiquement tant que « remaining » n’est pas à zéro', async () => {
    listSyndicateReceipts.mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    backfillMissingReceipts
      .mockResolvedValueOnce({ created: 500, skipped: 0, remaining: 20 })
      .mockResolvedValueOnce({ created: 20, skipped: 7, remaining: 0 });

    renderWithRoute();
    await waitFor(() => expect(listSyndicateReceipts).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Générer les quittances manquantes/ }));

    const confirmButton = await screen.findByRole('button', { name: 'Générer' });
    await user.click(confirmButton);

    await waitFor(() => expect(backfillMissingReceipts).toHaveBeenCalledTimes(2));
    expect(backfillMissingReceipts).toHaveBeenNthCalledWith(1, 'tenant-1', 'syndic-1');
    expect(backfillMissingReceipts).toHaveBeenNthCalledWith(2, 'tenant-1', 'syndic-1');
  });
});
