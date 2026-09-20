import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Tacherons } from '../../pages/finance/Tacherons';
import { Tacheron } from '../../pages/finance/Tacheron';
import type {
  Contractor,
  ContractorContract,
  ContractorPayment,
  ProgressStatement
} from '../../types/finance-contractors-types';

/**
 * Tâcherons — lot 4, quatrième sous-lot (PRD E8, besoin P10 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-contractors.ts`).
 *
 * Comme pour les associations, les deux écrans sont montés par-dessus un
 * `apiClient` simulé — **jamais un service doublé** — pour que ce qui est
 * vérifié ici soit ce que l'écran envoie réellement sur le fil, et non ce
 * qu'un mock de service aurait laissé passer sans le voir. Les corps de
 * requête sont épinglés une seconde fois, au plus près de la frontière
 * réseau, dans `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier garantit avant tout
 * ---------------------------------------------------------------------------
 *
 * 1. **Les deux soldes ne se confondent jamais.** Le cas central est celui d'un
 *    tâcheron dont le marché est intégralement exécuté (`remainingAmount` à
 *    zéro) mais qui n'a rien reçu (`accountBalance` à 725 000). Les deux
 *    chiffres doivent s'afficher, sous deux libellés distincts, et ne jamais
 *    se retrouver l'un à la place de l'autre.
 * 2. **Un dépassement s'affiche et ne bloque pas** : une situation qui excède
 *    le marché restant part quand même au serveur.
 * 3. **Un règlement supérieur à ce qu'on doit est accepté** : averti, jamais
 *    bloqué.
 * 4. **La description d'une situation est obligatoire**, et c'est dit avant
 *    l'envoi, pas après un 400.
 * 5. **Jamais « débit » ni « crédit » à l'écran** (principe P-1 du PRD).
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`), comme dans `__tests__/finance/associations.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const TACHERON = 'tacheron-1';

/** L'adresse et le corps du dernier appel, pour se lire d'un coup d'œil. */
function dernierAppel(mockFn: ReturnType<typeof vi.fn>): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = mockFn.mock.calls[mockFn.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

/**
 * Le cas central : son marché est intégralement exécuté, et il reste pourtant
 * créancier de 725 000. Ce nombre n'apparaît nulle part ailleurs dans le jeu
 * d'essai, pour qu'un écran qui intervertirait les deux soldes soit pris.
 */
function tacheron(overrides: Partial<Contractor> = {}): Contractor {
  return {
    id: TACHERON,
    tenantId: TENANT,
    fullName: 'Mamadou Koffi',
    trade: 'Plomberie',
    thirdPartyAccountId: 'compte-tiers-1',
    isActive: true,
    accountBalance: 725_000,
    currency: 'XOF',
    ...overrides
  };
}

function marcheExecute(overrides: Partial<ContractorContract> = {}): ContractorContract {
  return {
    id: 'marche-1',
    contractorId: TACHERON,
    contractorLabel: 'Mamadou Koffi',
    siteId: 'chantier-1',
    siteLabel: 'Villa de la Riviera',
    costCategoryId: 'poste-1',
    costCategoryLabel: 'Second œuvre',
    reference: 'MAR-2026-007',
    agreedAmount: 900_000,
    currency: 'XOF',
    signedDate: '2026-02-11',
    isActive: true,
    // Tout exécuté et validé : le marché restant vaut ZÉRO. Rien n'a été
    // réglé pour autant — voir `accountBalance` ci-dessus.
    statementedAmount: 900_000,
    remainingAmount: 0,
    isOverrun: false,
    ...overrides
  };
}

function marcheDepasse(overrides: Partial<ContractorContract> = {}): ContractorContract {
  return marcheExecute({
    id: 'marche-2',
    reference: 'MAR-2026-012',
    agreedAmount: 3_000_000,
    statementedAmount: 3_400_000,
    remainingAmount: -400_000,
    isOverrun: true,
    ...overrides
  });
}

function situation(overrides: Partial<ProgressStatement> = {}): ProgressStatement {
  return {
    id: 'situation-1',
    contractId: 'marche-1',
    contractReference: 'MAR-2026-007',
    contractorLabel: 'Mamadou Koffi',
    statementDate: '2026-04-30',
    amount: 900_000,
    currency: 'XOF',
    description: 'Pose complète du réseau sanitaire',
    status: 'VALIDATED',
    createdByLabel: 'Fatoumata Kouassi',
    validatedAt: '2026-05-02T08:05:00.000Z',
    ...overrides
  };
}

function reglement(overrides: Partial<ContractorPayment> = {}): ContractorPayment {
  return {
    id: 'reglement-1',
    contractorId: TACHERON,
    contractorLabel: 'Mamadou Koffi',
    paymentDate: '2026-05-10',
    amount: 175_000,
    currency: 'XOF',
    status: 'VALIDATED',
    createdByLabel: 'Fatoumata Kouassi',
    validatedAt: '2026-05-10T09:00:00.000Z',
    ...overrides
  };
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(
  options: {
    tacherons?: Contractor[];
    marches?: ContractorContract[];
    situations?: ProgressStatement[];
    reglements?: ContractorPayment[];
  } = {}
) {
  const listeTacherons = options.tacherons ?? [tacheron()];
  const listeMarches = options.marches ?? [marcheExecute()];
  const listeSituations = options.situations ?? [situation()];
  const listeReglements = options.reglements ?? [reglement()];

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/contractor-contracts\/[^/?]+\/statements/.test(url)) {
      return { data: { data: listeSituations } };
    }
    if (/\/finance\/contractor-contracts(\?|$)/.test(url)) {
      return { data: { data: listeMarches } };
    }
    if (/\/finance\/contractor-contracts\/[^/?]+$/.test(url)) {
      return { data: { data: listeMarches[0] } };
    }
    if (/\/finance\/contractors\/[^/?]+\/payments/.test(url)) {
      return { data: { data: listeReglements } };
    }
    if (/\/finance\/contractors(\?|$)/.test(url)) {
      return { data: { data: listeTacherons } };
    }
    if (/\/finance\/sites(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            {
              id: 'chantier-1',
              name: 'Villa de la Riviera',
              zone: null,
              propertyId: null,
              propertyLabel: null,
              managerLabel: null,
              landLeaseId: null,
              status: 'IN_PROGRESS',
              startDate: null,
              plannedEndDate: null,
              progressPercent: 40,
              closedAt: null,
              finalCost: null,
              actualCost: 0,
              currency: 'XOF'
            }
          ]
        }
      };
    }
    if (/\/finance\/cost-categories(\?|$)/.test(url)) {
      return { data: { data: [{ id: 'poste-1', label: 'Second œuvre', position: 1, isActive: true }] } };
    }
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: tacheron() } });
});

function mountListe(url = `/tenant/${TENANT}/finance/tacherons`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/tacherons" element={<Tacherons />} />
            <Route path="/tenant/:tenantId/finance/tacherons/:contractorId" element={<Tacheron />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountFiche(url = `/tenant/${TENANT}/finance/tacherons/${TACHERON}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/tacherons/:contractorId" element={<Tacheron />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

describe('Tâcherons — liste', () => {
  it('affiche le corps de métier et ce qu’on lui doit, jamais un « solde » anonyme', async () => {
    mountListe();

    expect(await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Plomberie')).toBeInTheDocument();
    expect(screen.getAllByText(/725\s000/).length).toBeGreaterThanOrEqual(1);
    // Le libellé est dit en toutes lettres, et le mot « solde » seul
    // n'apparaît nulle part : c'est ce qui l'empêche d'être confondu avec le
    // marché restant.
    expect(screen.getAllByText("Ce qu'on lui doit").length).toBeGreaterThanOrEqual(1);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bsolde\b/);
  });

  it('dit en clair qu’une avance a déjà été versée quand le compte est négatif', async () => {
    configurerGet({ tacherons: [tacheron({ accountBalance: -500_000, fullName: 'Aïssatou Konan' })] });
    mountListe();

    await screen.findByText('Aïssatou Konan', {}, { timeout: 8000 });
    expect(screen.getByText(/Avance déjà versée/i)).toBeInTheDocument();
  });

  it('n’affiche jamais les identifiants, seulement les noms', async () => {
    mountListe();

    await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 });
    expect(screen.queryByText(TACHERON)).not.toBeInTheDocument();
    expect(screen.queryByText('compte-tiers-1')).not.toBeInTheDocument();
  });

  it('filtre « actifs uniquement » : le filtre part en requête, jamais dans le chemin', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 });
    // Sans le filtre, aucun paramètre de requête.
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractors`);

    await user.click(screen.getByRole('checkbox', { name: /Tâcherons actifs uniquement/ }));

    await waitFor(() => expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractors?onlyActive=true`));
  }, 15000);

  it('enregistre un tâcheron avec les champs du contrat gelé, puis ouvre sa fiche', async () => {
    post.mockResolvedValue({ data: { data: tacheron({ id: TACHERON, fullName: 'Sékou Kouadio' }) } });
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouveau tâcheron/ })[0]);

    await user.type(await screen.findByLabelText('Nom du tâcheron'), 'Sékou Kouadio');
    await user.type(screen.getByLabelText('Corps de métier (facultatif)'), 'Maçonnerie');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le tâcheron' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractors`, {
        fullName: 'Sékou Kouadio',
        trade: 'Maçonnerie'
      })
    );

    // La navigation utilise le chemin exact que la fiche déclare lire : si ce
    // n'était pas le cas, la fiche ne se monterait jamais.
    expect(await screen.findByText('Marchés', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('n’envoie pas `trade` en chaîne vide quand le corps de métier est laissé vide', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Nouveau tâcheron/ })[0]);
    await user.type(await screen.findByLabelText('Nom du tâcheron'), 'Sékou Kouadio');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le tâcheron' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { corps } = dernierAppel(post);
    // Le schéma serveur refuse `trade: ''` (`.min(1)`) : la clé est retirée.
    expect(corps).toEqual({ fullName: 'Sékou Kouadio' });
    expect(corps).not.toHaveProperty('trade');
  }, 20000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    mountListe();

    expect(await screen.findByText('Impossible de charger les tâcherons.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Les deux soldes ne se confondent jamais', () => {
  it('marché intégralement exécuté et tâcheron non payé : les deux chiffres, sous deux libellés distincts', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });

    // --- Ce qu'on lui doit : 725 000, et ce nombre n'apparaît NULLE PART
    // ailleurs — ni dans le marché, ni dans les situations, ni dans les
    // règlements.
    expect(screen.getAllByText(/725\s000/)).toHaveLength(1);
    expect(screen.getByText(/ce qui reste à payer, tous marchés confondus/i)).toBeInTheDocument();

    // --- Marché restant : ZÉRO, sur la ligne du marché, et cette ligne ne
    // porte jamais ce qu'on lui doit.
    const ligneMarche = (await screen.findByText('MAR-2026-007', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    expect(within(ligneMarche).getByText(/^0$/)).toBeInTheDocument();
    expect(within(ligneMarche).queryByText(/725\s000/)).not.toBeInTheDocument();

    // --- Les deux libellés coexistent, en toutes lettres, et « solde » seul
    // n'est écrit nulle part.
    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).toContain('marche restant');
    expect(texte).toContain("ce qu'on lui doit");
    expect(texte).not.toMatch(/\bsolde\b/);
  }, 20000);

  it('explique la différence en toutes lettres : exécuter d’un côté, payer de l’autre', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });
    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).toContain('ce qui reste a executer');
    expect(texte).toContain('ce qui reste a payer');
  }, 15000);

  it('un tâcheron qui n’a rien exécuté peut avoir déjà reçu une avance', async () => {
    configurerGet({
      tacherons: [tacheron({ accountBalance: -500_000 })],
      marches: [marcheExecute({ agreedAmount: 2_000_000, statementedAmount: 0, remainingAmount: 2_000_000 })],
      situations: []
    });
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });
    // Le marché est intact, et le compte est pourtant en avance : les deux
    // grandeurs sont indépendantes.
    expect(screen.getAllByText(/2\s000\s000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/-500\s000/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Avance déjà versée/i)).toBeInTheDocument();
  }, 15000);
});

describe('Un dépassement de marché s’affiche, il ne s’interdit pas', () => {
  it('signale le dépassement sur la ligne du marché, comme une information', async () => {
    configurerGet({ marches: [marcheDepasse()] });
    mountFiche();

    await screen.findByText('MAR-2026-012', {}, { timeout: 8000 });
    expect(screen.getAllByText('Dépassement').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/-400\s000/).length).toBeGreaterThanOrEqual(1);
    // Ce n'est pas une erreur : rien n'est présenté comme tel.
    expect(screen.queryByText(/interdit/i)).not.toBeInTheDocument();
  }, 15000);

  it('laisse saisir une situation qui dépasse le marché restant, en avertissant', async () => {
    configurerGet({ marches: [marcheDepasse()], situations: [] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('MAR-2026-012', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant de la situation'), '500000');
    await user.type(screen.getByLabelText('Description des travaux'), 'Reprise du mur de clôture effondré');

    // Averti, jamais bloqué.
    expect(await screen.findByText(/apparaîtra en dépassement/i, {}, { timeout: 8000 })).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: 'Saisir la situation' });
    expect(bouton).not.toBeDisabled();

    await user.click(bouton);

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        `/tenants/${TENANT}/finance/contractor-contracts/marche-2/statements`,
        expect.objectContaining({ amount: 500_000, description: 'Reprise du mur de clôture effondré' })
      )
    );
  }, 30000);
});

describe('La description d’une situation est obligatoire, et c’est dit avant l’envoi', () => {
  it('ne laisse pas envoyer une situation sans description', async () => {
    configurerGet({ situations: [] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('MAR-2026-007', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant de la situation'), '250000');

    // L'exigence est affichée AVANT tout envoi, et la raison avec elle.
    expect(screen.getByText(/La description est obligatoire/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saisir la situation' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  }, 20000);

  it('envoie la situation une fois la description saisie, sans répéter l’identifiant du marché', async () => {
    configurerGet({ situations: [] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('MAR-2026-007', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText('Montant de la situation'), '250000');
    await user.type(screen.getByLabelText('Description des travaux'), 'Raccordement des sanitaires');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saisir la situation' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Saisir la situation' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractor-contracts/marche-1/statements`);
    expect(Object.keys(corps).sort()).toEqual(['amount', 'description', 'statementDate']);
    expect(corps).not.toHaveProperty('contractId');
  }, 30000);
});

describe('Les gestes de la fiche', () => {
  it('convient d’un marché : le poste de dépense est exigé, et le tâcheron reste dans le chemin', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText("Convenir d'un marché", {}, { timeout: 8000 });

    fireEvent.mouseDown(screen.getByLabelText('Chantier'));
    fireEvent.click(await screen.findByText('Villa de la Riviera', { selector: '.ant-select-item-option-content' }));

    fireEvent.mouseDown(screen.getByLabelText('Poste de dépense'));
    fireEvent.click(await screen.findByText('Second œuvre', { selector: '.ant-select-item-option-content' }));

    await user.type(screen.getByLabelText('Référence du marché'), 'MAR-2026-030');
    await user.type(screen.getByLabelText('Montant convenu'), '4500000');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Convenir le marché' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Convenir le marché' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors/${TACHERON}/contracts`);
    expect(Object.keys(corps).sort()).toEqual(['agreedAmount', 'costCategoryId', 'reference', 'signedDate', 'siteId']);
    // Le poste est bien celui qui a été choisi, jamais deviné.
    expect(corps.costCategoryId).toBe('poste-1');
    expect(corps).not.toHaveProperty('contractorId');
  }, 30000);

  it('valide une situation après avoir averti que c’est irréversible', async () => {
    configurerGet({ situations: [situation({ id: 'situation-brouillon', status: 'DRAFT', validatedAt: null })] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    const ligne = (await screen.findByText('Pose complète du réseau sanitaire', {}, { timeout: 8000 })).closest(
      'tr'
    ) as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/irréversible/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        `/tenants/${TENANT}/finance/progress-statements/situation-brouillon/validate`,
        {}
      )
    );
  }, 30000);

  it('enregistre un règlement supérieur à ce qu’on doit : averti, jamais bloqué', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });
    // 900 000 dépasse les 725 000 qu'on lui doit : c'est un acompte, que le
    // contrat prévoit explicitement.
    await user.type(screen.getByLabelText('Montant du règlement'), '900000');

    expect(await screen.findByText(/enregistré comme une avance/i, {}, { timeout: 8000 })).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: 'Enregistrer le règlement' });
    expect(bouton).not.toBeDisabled();

    await user.click(bouton);

    await waitFor(() => expect(post).toHaveBeenCalled());
    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/contractors/${TACHERON}/payments`);
    expect(Object.keys(corps).sort()).toEqual(['amount', 'paymentDate']);
    expect(corps.amount).toBe(900_000);
    expect(corps).not.toHaveProperty('contractorId');
  }, 30000);
});

describe('Navigation — les chemins déclarés par les écrans', () => {
  it('la fiche lit `tenantId` et `contractorId` dans le CHEMIN, pas en paramètre de requête', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });
    // Les marchés du tâcheron sont demandés avec son identifiant en FILTRE de
    // requête (la route des marchés est transversale, contrat gelé), et ses
    // règlements avec son identifiant dans le CHEMIN.
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractor-contracts?contractorId=${TACHERON}`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/contractors/${TACHERON}/payments`);
  }, 15000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('la liste des tâcherons n’affiche jamais « débit » ni « crédit »', async () => {
    mountListe();

    await screen.findByText('Mamadou Koffi', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la fiche du tâcheron n’affiche jamais « débit » ni « crédit », dépassement compris', async () => {
    configurerGet({ marches: [marcheExecute(), marcheDepasse()] });
    mountFiche();

    await screen.findByRole('heading', { name: 'Mamadou Koffi' }, { timeout: 8000 });
    await screen.findByText('MAR-2026-012', {}, { timeout: 8000 });

    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).not.toMatch(/\bdebit/);
    expect(texte).not.toMatch(/\bcredit/);
  }, 20000);
});
