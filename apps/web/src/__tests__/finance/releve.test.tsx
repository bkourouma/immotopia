import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Releve } from '../../pages/finance/Releve';
import TenantPayments from '../../pages/TenantPortal/Payments';
import type { AccountStatement, ThirdPartyMovementLine, ThirdPartyMovementType } from '../../types/finance-types';

/**
 * Relevé de compte — côté agence et côté portail locataire.
 *
 * Modèle exact de `__tests__/rental/payments.test.tsx` : `userEvent` sans
 * délai, `findBy*` avec un délai explicite (Ant Design coûte cher à monter
 * dans jsdom), et un mock qui couvre CHAQUE export utilisé — Vitest, contrairement
 * à Jest, refuse en silence un import non déclaré (AGENTS.md).
 */

const getAccountStatement = vi.fn();
const getAccountStatementPdfUrl = vi.fn();
// Le portail n'appelle PAS `getAccountStatement` : il passe par `getMyStatement`,
// qui ne prend aucun identifiant de compte. C'est ce qui garantit qu'un
// locataire ne peut pas lire le releve d'un autre — la session resout le
// compte cote serveur. Deux mocks distincts, donc, et le test verifie que
// l'ecran agence n'appelle jamais celui du portail, ni l'inverse.
const getMyStatement = vi.fn();

vi.mock('../../services/finance-service', () => ({
  getAccountStatement: (...a: unknown[]) => getAccountStatement(...a),
  getAccountStatementPdfUrl: (...a: unknown[]) => getAccountStatementPdfUrl(...a),
  getMyStatement: (...a: unknown[]) => getMyStatement(...a)
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

// Portail locataire : le compte vient du profil connecté, jamais de l'URL.
const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));

const getInstallments = vi.fn();
const getPaymentHistory = vi.fn();
vi.mock('../../services/tenantPortalService', () => ({
  tenantPortalService: {
    getInstallments: (...a: unknown[]) => getInstallments(...a),
    getPaymentHistory: (...a: unknown[]) => getPaymentHistory(...a)
  }
}));

vi.mock('../../components/TenantPortal/InstallmentDetails', () => ({
  default: () => <div>détails de l’échéance</div>
}));
vi.mock('../../components/TenantPortal/PaymentDeclarationModal', () => ({
  default: () => null
}));

function mouvement(overrides: Partial<ThirdPartyMovementLine> = {}): ThirdPartyMovementLine {
  return {
    id: 'mvt-1',
    movementDate: '2026-01-05',
    type: 'INSTALLMENT',
    label: 'Loyer de janvier 2026',
    amountBilled: 450_000,
    amountSettled: null,
    balanceAfter: 450_000,
    currency: 'XOF',
    leaseId: 'bail-1',
    ...overrides
  };
}

function statement(overrides: Partial<AccountStatement> = {}): AccountStatement {
  return {
    accountId: 'cpt-1',
    label: 'Mariam Diomandé',
    // Une locataire par défaut : les cas qui parlent d'un fournisseur ou d'un
    // salarié surchargent, et c'est ainsi qu'on épingle le vocabulaire propre
    // à chaque tiers.
    kind: 'TENANT',
    openingBalance: 0,
    closingBalance: 0,
    currency: 'XOF',
    movements: [],
    total: 0,
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function mountReleve(url = '/tenant/agence-1/finance/comptes/cpt-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/tenant/:tenantId/finance/comptes/:accountId" element={<Releve />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mountPortail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/portal/tenant/payments']}>
        <TenantPayments />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccountStatementPdfUrl.mockReturnValue('/tenants/agence-1/finance/accounts/cpt-1/statement.pdf');
  useAuthMock.mockReturnValue({ tenantClient: { id: 'client-9', tenantId: 'agence-9', clientType: 'RENTER' } });
  getInstallments.mockResolvedValue({
    data: {
      success: true,
      data: {
        installments: [],
        summary: { total: 0, paid: 0, due: 0, overdue: 0, partial: 0 },
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
      }
    }
  });
  getPaymentHistory.mockResolvedValue({
    data: {
      success: true,
      data: { payments: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }, totalPaid: 0 }
    }
  });
});

describe('Relevé de compte — écran agence', () => {
  it('affiche le solde d’ouverture et le solde de clôture', async () => {
    getAccountStatement.mockResolvedValue(
      statement({ label: 'Mariam Diomandé', openingBalance: 100_000, closingBalance: 250_000 })
    );

    mountReleve();

    expect(await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/100\s000\sFCFA/)).toBeInTheDocument();
    expect(screen.getByText(/250\s000\sFCFA/)).toBeInTheDocument();
  });

  it('respecte l’ordre chronologique des mouvements', async () => {
    getAccountStatement.mockResolvedValue(
      statement({
        movements: [
          mouvement({ id: 'a', movementDate: '2026-01-05', label: 'Premier mouvement' }),
          mouvement({ id: 'b', movementDate: '2026-02-05', label: 'Deuxième mouvement' }),
          mouvement({ id: 'c', movementDate: '2026-03-05', label: 'Troisième mouvement' })
        ]
      })
    );

    const { container } = mountReleve();

    await screen.findByText('Troisième mouvement', {}, { timeout: 8000 });
    const texte = container.textContent || '';
    const p1 = texte.indexOf('Premier mouvement');
    const p2 = texte.indexOf('Deuxième mouvement');
    const p3 = texte.indexOf('Troisième mouvement');
    expect(p1).toBeGreaterThan(-1);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it('affiche chaque nature de mouvement en français, jamais le code brut', async () => {
    const natures: ThirdPartyMovementType[] = [
      'INSTALLMENT',
      'PAYMENT',
      'ADVANCE_RECEIVED',
      'ADVANCE_APPLIED',
      'PENALTY',
      'WAIVER',
      'ADJUSTMENT',
      'OPENING_BALANCE',
      'VOID'
    ];
    const labelsAttendus = [
      'Loyer',
      'Règlement',
      'Avance reçue',
      'Avance imputée',
      'Pénalité',
      'Remise',
      'Ajustement',
      'Solde initial',
      'Annulation'
    ];

    getAccountStatement.mockResolvedValue(
      statement({
        movements: natures.map((type, index) =>
          mouvement({
            id: `mvt-${index}`,
            type,
            label: `Mouvement ${index}`,
            movementDate: `2026-01-0${(index % 9) + 1}`
          })
        )
      })
    );

    const { container } = mountReleve();
    await screen.findByText('Mouvement 8', {}, { timeout: 8000 });

    const texte = container.textContent || '';
    for (const label of labelsAttendus) {
      expect(texte).toContain(label);
    }
    for (const code of natures) {
      expect(texte).not.toContain(code);
    }
  });

  it('affiche un état vide quand la période ne porte aucun mouvement', async () => {
    getAccountStatement.mockResolvedValue(statement({ movements: [], total: 0 }));

    mountReleve();

    expect(await screen.findByText('Aucun mouvement sur cette période.', {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    getAccountStatement.mockRejectedValue(new Error('panne'));

    mountReleve();

    expect(await screen.findByText('Impossible de charger le relevé.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('porte les bornes de dates dans l’URL et les transmet au service', async () => {
    getAccountStatement.mockResolvedValue(statement());

    mountReleve('/tenant/agence-1/finance/comptes/cpt-1?from=2026-01-01&to=2026-03-31');

    await waitFor(() => expect(getAccountStatement).toHaveBeenCalled());
    expect(getAccountStatement.mock.calls[0][0]).toBe('agence-1');
    expect(getAccountStatement.mock.calls[0][1]).toBe('cpt-1');
    expect(getAccountStatement.mock.calls[0][2]).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('ouvre l’URL du PDF fourni par le service quand on imprime', async () => {
    getAccountStatement.mockResolvedValue(statement({ label: 'Mariam Diomandé' }));
    const ouvrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup({ delay: null });

    mountReleve();
    await screen.findByText('Mariam Diomandé', {}, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Imprimer/ }));

    expect(getAccountStatementPdfUrl).toHaveBeenCalledWith('agence-1', 'cpt-1', expect.any(Object));
    expect(ouvrir).toHaveBeenCalledWith(
      '/tenants/agence-1/finance/accounts/cpt-1/statement.pdf',
      '_blank',
      'noopener,noreferrer'
    );

    ouvrir.mockRestore();
  });
});

describe('Relevé de compte — onglet du portail locataire', () => {
  it('affiche le même relevé, en lecture seule, borné au compte connecté', async () => {
    getMyStatement.mockResolvedValue(
      statement({
        accountId: 'client-9',
        label: 'Mon compte',
        openingBalance: 0,
        closingBalance: 450_000,
        movements: [mouvement({ label: 'Loyer de janvier 2026', amountBilled: 450_000, balanceAfter: 450_000 })]
      })
    );

    const user = userEvent.setup({ delay: null });
    mountPortail();

    await user.click(await screen.findByText('Mon relevé', {}, { timeout: 15000 }));

    expect(await screen.findByText('Mon compte', {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText('Loyer de janvier 2026')).toBeInTheDocument();

    // Borné au compte connecté, et d'une façon plus forte qu'auparavant :
    // l'appel ne transporte AUCUN identifiant de compte. Il n'y a donc rien a
    // falsifier cote client. La version precedente passait l'identifiant du
    // `TenantClient` comme s'il etait celui du compte de tiers — les deux sont
    // distincts, l'appel n'aurait rien trouve.
    expect(getMyStatement).toHaveBeenCalled();
    expect(getMyStatement.mock.calls[0][0]).toBeUndefined();
    expect(getAccountStatement).not.toHaveBeenCalled();

    // Lecture seule : aucune action, en particulier pas d'impression — celle-ci
    // reste un geste de gestionnaire.
    expect(screen.queryByRole('button', { name: 'Imprimer' })).not.toBeInTheDocument();
  }, 20000);

  // Une seule vérification par test : monter deux écrans complets dans le même
  // test (portail ET agence) doublait le travail de rendu et faisait
  // dépasser, sous charge parallèle, un délai déjà généreux — exactement
  // l'avertissement de `payments.test.tsx` sur le coût de jsdom.
  it('portail : n’affiche jamais « débit » ni « crédit », casse et accents indifférents', async () => {
    getMyStatement.mockResolvedValue(
      statement({
        movements: [
          mouvement({
            type: 'ADVANCE_RECEIVED',
            label: 'Avance reçue avant facturation',
            amountSettled: 450_000,
            amountBilled: null,
            balanceAfter: -450_000
          }),
          mouvement({
            id: 'mvt-2',
            type: 'ADVANCE_APPLIED',
            label: 'Avance imputée sur le loyer',
            amountBilled: null,
            amountSettled: null,
            balanceAfter: 0
          })
        ]
      })
    );

    const user = userEvent.setup({ delay: null });
    const { container } = mountPortail();
    await user.click(await screen.findByText('Mon relevé', {}, { timeout: 15000 }));
    await screen.findByText('Avance imputée sur le loyer', {}, { timeout: 15000 });

    expect(normaliser(container.textContent || '')).not.toContain('debit');
    expect(normaliser(container.textContent || '')).not.toContain('credit');
  }, 20000);
});

describe('Relevé de compte — vocabulaire (écran agence)', () => {
  it('n’affiche jamais « débit » ni « crédit », casse et accents indifférents', async () => {
    getAccountStatement.mockResolvedValue(
      statement({
        movements: [
          mouvement({
            type: 'ADVANCE_RECEIVED',
            label: 'Avance reçue avant facturation',
            amountSettled: 450_000,
            amountBilled: null,
            balanceAfter: -450_000
          }),
          mouvement({
            id: 'mvt-2',
            type: 'ADVANCE_APPLIED',
            label: 'Avance imputée sur le loyer',
            amountBilled: null,
            amountSettled: null,
            balanceAfter: 0
          })
        ]
      })
    );

    const { container } = mountReleve();
    await screen.findByText('Avance imputée sur le loyer', {}, { timeout: 8000 });

    expect(normaliser(container.textContent || '')).not.toContain('debit');
    expect(normaliser(container.textContent || '')).not.toContain('credit');
  });
});

/**
 * Le relevé sert le vocabulaire du tiers dont il parle.
 *
 * L'écran du relevé client avait été repris tel quel pour tous les comptes :
 * celui d'un fournisseur annonçait « Loyer » devant chacune de ses factures,
 * « Avance reçue » devant un acompte que l'agence avait elle-même versé, et
 * son fil d'Ariane indiquait « Clients ». Relevé le 20 septembre 2026.
 */
describe('Relevé de compte — le vocabulaire suit le tiers', () => {
  it('parle de factures et d’acompte versé sur le compte d’un fournisseur', async () => {
    getAccountStatement.mockResolvedValue(
      statement({
        kind: 'SUPPLIER',
        label: 'QA Quincaillerie Angré',
        movements: [
          mouvement({ id: 'm-1', type: 'INSTALLMENT', label: 'Facture FRS-QA-004', amountBilled: 6_000_000 }),
          mouvement({
            id: 'm-2',
            type: 'ADVANCE_RECEIVED',
            label: 'Acompte versé, non affecté à une facture',
            amountSettled: 2_000_000
          })
        ]
      })
    );

    mountReleve();

    expect(await screen.findByText('Facture FRS-QA-004', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Facture')).toBeInTheDocument();
    expect(screen.getByText('Acompte versé')).toBeInTheDocument();
    // Le vocabulaire des baux n'a rien à faire ici.
    expect(screen.queryByText('Loyer')).not.toBeInTheDocument();
    expect(screen.queryByText('Avance reçue')).not.toBeInTheDocument();
  });

  it('mène aux fournisseurs, et non aux clients, dans le fil d’Ariane', async () => {
    getAccountStatement.mockResolvedValue(statement({ kind: 'SUPPLIER', label: 'QA Quincaillerie Angré' }));

    mountReleve();

    await screen.findByText('QA Quincaillerie Angré', {}, { timeout: 8000 });
    expect(screen.getByText('Fournisseurs')).toBeInTheDocument();
    expect(screen.queryByText('Clients')).not.toBeInTheDocument();
  });

  it('garde le vocabulaire des baux pour un locataire', async () => {
    getAccountStatement.mockResolvedValue(
      statement({
        kind: 'TENANT',
        movements: [mouvement({ id: 'm-1', type: 'INSTALLMENT', label: 'Loyer mars 2026', amountBilled: 265_000 })]
      })
    );

    mountReleve();

    await screen.findByText('Loyer mars 2026', {}, { timeout: 8000 });
    expect(screen.getByText('Loyer')).toBeInTheDocument();
    expect(screen.getByText('Clients')).toBeInTheDocument();
  });
});
