import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Installments } from '../../pages/rental/Installments';

/**
 * Échéances — les garanties de l'écran « Encaisser ».
 *
 * Les requêtes `findBy*` portent un délai explicite de 8 s. Le défaut de
 * Testing Library est d'une seconde, ce qui suffit isolément mais pas sous la
 * charge parallèle de la suite complète : l'échec était intermittent et ne
 * signalait rien du code. Le même constat avait déjà conduit à relever
 * `testTimeout` dans `vite.config.ts` pour les suites qui montent la coquille.
 *
 * Trois défauts de l'ancienne version ont ici un test qui échoue s'ils
 * reviennent. Le premier est de loin le plus grave : il ne se voit pas à
 * l'écran, il se voit en comptabilité.
 */

const listInstallments = vi.fn();
const listLeases = vi.fn();
const createPayment = vi.fn();
const allocatePayment = vi.fn();
const recalculateInstallmentStatuses = vi.fn();
const calculatePenalties = vi.fn();
const generateInstallments = vi.fn();
const deleteAllInstallments = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listInstallments: (...a: unknown[]) => listInstallments(...a),
  listLeases: (...a: unknown[]) => listLeases(...a),
  createPayment: (...a: unknown[]) => createPayment(...a),
  allocatePayment: (...a: unknown[]) => allocatePayment(...a),
  recalculateInstallmentStatuses: (...a: unknown[]) => recalculateInstallmentStatuses(...a),
  calculatePenalties: (...a: unknown[]) => calculatePenalties(...a),
  generateInstallments: (...a: unknown[]) => generateInstallments(...a),
  deleteAllInstallments: (...a: unknown[]) => deleteAllInstallments(...a),
  RentalPaymentMethod: { CASH: 'CASH' },
  RentalInstallmentStatus: {}
}));

vi.mock('../../components/rental/PaymentForm', () => ({ PaymentForm: () => null }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function echeance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ech-1',
    tenant_id: 'agence-1',
    lease_id: 'bail-1',
    period_year: 2026,
    period_month: 4,
    due_date: '2026-04-05T00:00:00.000Z',
    status: 'OVERDUE',
    currency: 'XOF',
    amount_rent: 1_250_000,
    amount_service: 75_000,
    amount_other_fees: 0,
    penalty_amount: 132_500,
    amount_paid: 0,
    created_at: '',
    updated_at: '',
    ...overrides
  };
}

function mount(url = '/tenant/agence-1/rental/leases/bail-1/installments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/leases/:leaseId/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Ecran global « Encaisser › Echeances », hors onglet de bail. */
function mountGlobal(url = '/tenant/agence-1/rental/installments') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/installments" element={<Installments />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listLeases.mockResolvedValue({
    success: true,
    data: [
      {
        id: 'bail-1',
        lease_number: 'BAIL-2026-0001',
        primaryRenter: { id: 'cli-1', user: { fullName: 'Mariam Diomande' } }
      },
      {
        id: 'bail-2',
        lease_number: 'BAIL-2026-0002',
        primaryRenter: { id: 'cli-2', user: { fullName: 'Seydou Traore' } }
      }
    ],
    pagination: { page: 1, limit: 500, total: 2, totalPages: 1 }
  });
  listInstallments.mockResolvedValue({
    success: true,
    data: [echeance()],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
  });
  createPayment.mockResolvedValue({ success: true, data: { id: 'paiement-1' } });
  allocatePayment.mockResolvedValue({ success: true });
});

/** « Encaisser » ouvre une confirmation : on la valide pour enregistrer le paiement. */
async function confirmerEncaissement(user: ReturnType<typeof userEvent.setup>) {
  const boutons = await screen.findAllByRole('button', { name: /Confirmer l'encaissement/ }, { timeout: 8000 });
  await user.click(boutons[boutons.length - 1]);
}

describe('Échéances — confirmation avant encaissement', () => {
  it('demande confirmation (montant, locataire, mode) et n’écrit rien avant', async () => {
    const user = userEvent.setup({ delay: null });
    listInstallments.mockResolvedValue({
      success: true,
      data: [
        echeance({
          lease: {
            id: 'bail-1',
            lease_number: 'BAIL-2026-0001',
            primaryRenter: { id: 'cli-1', user: { fullName: 'Yao N’Dri' } }
          }
        })
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });
    mountGlobal();

    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));

    const dialogue = within(await screen.findByRole('dialog', {}, { timeout: 8000 }));
    expect(dialogue.getByText(/Yao N’Dri/)).toBeInTheDocument();
    expect(dialogue.getByText(/Espèces/)).toBeInTheDocument();
    expect(dialogue.getAllByText(contenu => contenu.replace(/\D/g, '') === '1457500').length).toBeGreaterThan(0);
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('n’enregistre rien quand on annule', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));
    await user.click(await screen.findByRole('button', { name: /Annuler/ }, { timeout: 8000 }));

    expect(createPayment).not.toHaveBeenCalled();
  });
});

describe('Échéances — idempotence de l’encaissement', () => {
  it('réutilise la MÊME clé quand un encaissement est retenté', async () => {
    // Le test le plus important du fichier. L'ancienne version concaténait
    // `Date.now()` a la clé : chaque tentative en produisait une nouvelle, donc
    // deux envois du même encaissement créaient DEUX paiements. Risque R6 du
    // §11.1, classé critique — l'erreur se voit en comptabilité, pas à l'écran.
    const user = userEvent.setup({ delay: null });
    createPayment.mockRejectedValueOnce(new Error('réseau coupé'));

    mount();
    const bouton = await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 });

    await user.click(bouton);
    await confirmerEncaissement(user);
    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));

    // Attendre que le bouton redevienne actionnable. Pendant l'appel, il porte
    // `loading` et Ant Design le désactive : sans délai entre les frappes, le
    // second clic devancerait le re-rendu et serait avalé.
    await waitFor(() => expect(bouton).not.toBeDisabled());

    await user.click(bouton);
    await confirmerEncaissement(user);
    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(2));

    const premiere = createPayment.mock.calls[0][1].idempotencyKey;
    const seconde = createPayment.mock.calls[1][1].idempotencyKey;
    expect(premiere).toBeTruthy();
    expect(seconde).toBe(premiere);
  });

  it('encaisse le reste dû, pénalités comprises', async () => {
    // 1 250 000 de loyer + 75 000 de charges + 132 500 de pénalités.
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));
    await confirmerEncaissement(user);

    await waitFor(() => expect(createPayment).toHaveBeenCalled());
    expect(createPayment.mock.calls[0][1]).toMatchObject({ amount: 1_457_500, method: 'CASH', currency: 'XOF' });
  });

  it('affecte le paiement à l’échéance encaissée', async () => {
    const user = userEvent.setup({ delay: null });
    mount();
    await user.click(await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 }));
    await confirmerEncaissement(user);

    await waitFor(() => expect(allocatePayment).toHaveBeenCalled());
    expect(allocatePayment.mock.calls[0][2]).toEqual({ installmentIds: ['ech-1'] });
  });

  it('n’offre pas d’encaisser une échéance soldée', async () => {
    listInstallments.mockResolvedValue({
      success: true,
      data: [echeance({ status: 'PAID', amount_paid: 1_457_500 })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });
    mount();

    expect(await screen.findByText('Payé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).not.toBeInTheDocument();
  });
});

describe('Échéances — ce qui part au montage', () => {
  it('n’écrit RIEN en base au simple affichage de l’écran', async () => {
    // L'ancienne version lançait, sans le dire, un recalcul de statuts et un
    // calcul de pénalités a chaque montage — deux écritures pour une lecture,
    // répétées a chaque aller-retour quand l'écran est monté en onglet.
    mount();
    await screen.findByText('En retard', {}, { timeout: 8000 });

    expect(recalculateInstallmentStatuses).not.toHaveBeenCalled();
    expect(calculatePenalties).not.toHaveBeenCalled();
    expect(generateInstallments).not.toHaveBeenCalled();
  });

  it('ne charge la liste qu’une seule fois', async () => {
    // Deux `useEffect` indépendants déclenchaient chacun un chargement.
    mount();
    await screen.findByText('En retard', {}, { timeout: 8000 });
    expect(listInstallments).toHaveBeenCalledTimes(1);
  });
});

describe('Échéances — filtrage serveur', () => {
  it('transmet le filtre de l’URL au service', async () => {
    mount('/tenant/agence-1/rental/leases/bail-1/installments?overdue=true&status=OVERDUE');

    await waitFor(() => expect(listInstallments).toHaveBeenCalled());
    expect(listInstallments.mock.calls[0][1]).toMatchObject({
      leaseId: 'bail-1',
      status: 'OVERDUE',
      overdue: true,
      page: 1,
      limit: 50
    });
  });

  it('n’envoie pas `overdue: false` quand le filtre est absent', async () => {
    // Envoyer `false` filtrerait sur « pas en retard » au lieu de ne pas
    // filtrer : un serveur qui distingue les deux ne renverrait pas la même
    // chose.
    mount();
    await waitFor(() => expect(listInstallments).toHaveBeenCalled());
    expect(listInstallments.mock.calls[0][1].overdue).toBeUndefined();
  });
});

describe('Échéances — filtre par locataire', () => {
  it('transmet le locataire choisi à l’API', async () => {
    // Le filtre vit dans l'URL comme les autres : un écran filtré doit être
    // partageable et rechargeable tel quel.
    mountGlobal('/tenant/agence-1/rental/installments?renterClientId=cli-2');

    await waitFor(() => expect(listInstallments).toHaveBeenCalled(), { timeout: 8000 });
    expect(listInstallments.mock.calls[0][1]).toMatchObject({ renterClientId: 'cli-2' });
  });

  it('nomme le bail comme l’écran Baux : numéro, bien et locataire', async () => {
    // Deux listes qui désignent le même bail doivent le nommer pareil. Sans
    // cette colonne, la vue portefeuille montrait une période et un montant
    // sans jamais dire d'où venait l'échéance.
    listInstallments.mockResolvedValue({
      success: true,
      data: [
        echeance({
          lease: {
            id: 'bail-2',
            lease_number: 'BAIL-2026-0002',
            property: { id: 'bien-2', title: 'Entrepôt 1 200 m² - Treichville' },
            primaryRenter: { id: 'cli-2', user: { fullName: 'Seydou Traoré' } }
          }
        })
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });

    mountGlobal();
    expect(await screen.findByText('BAIL-2026-0002', {}, { timeout: 8000 })).toBeInTheDocument();
    // Le bien sous le numéro de bail...
    expect(screen.getByText('Entrepôt 1 200 m² - Treichville')).toBeInTheDocument();
    // ...et le locataire dans sa propre colonne, puisqu'on filtre dessus.
    expect(screen.getByText('Seydou Traoré')).toBeInTheDocument();
  });

  it('retombe sur l’adresse quand le bien n’a pas de titre', async () => {
    // Même règle que sur l'écran Baux : titre, puis adresse, puis référence
    // interne. Une référence interne seule ne dit rien à personne.
    listInstallments.mockResolvedValue({
      success: true,
      data: [
        echeance({
          lease: {
            id: 'bail-3',
            lease_number: 'BAIL-2026-0003',
            property: { id: 'bien-3', title: null, address: 'Boulevard Nangui Abrogoua' },
            primaryRenter: { id: 'cli-3', user: { fullName: 'Awa Konan' } }
          }
        })
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });

    mountGlobal();
    expect(await screen.findByText('Boulevard Nangui Abrogoua', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Awa Konan')).toBeInTheDocument();
  });

  it('n’ajoute pas la colonne dans l’onglet d’un bail', async () => {
    // Le locataire y est déjà unique : la colonne répéterait la même valeur
    // sur toutes les lignes.
    listInstallments.mockResolvedValue({
      success: true,
      data: [
        echeance({
          lease: {
            id: 'bail-1',
            lease_number: 'BAIL-2026-0001',
            primaryRenter: { id: 'cli-1', user: { fullName: 'Mariam Diomandé' } }
          }
        })
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
    });

    mount();
    await screen.findByRole('button', { name: /Encaisser/ }, { timeout: 8000 });
    expect(screen.queryByText('BAIL-2026-0001')).toBeNull();
    expect(screen.queryByText(/Mariam Diomandé/)).toBeNull();
    // Et la liste des baux n'est pas chargée pour rien.
    expect(listLeases).not.toHaveBeenCalled();
  });
});
