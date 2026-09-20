import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Salaires } from '../../pages/finance/Salaires';
import { Salarie } from '../../pages/finance/Salarie';
import type { Employee, SalaryNote, SalaryPayment } from '../../types/finance-salaries-types';
import type { ConstructionSite, CostCategory } from '../../types/finance-lot2-types';

/**
 * Salaires — lot 4, troisième sous-lot (PRD E8, besoins B11 et P9 ; contrat
 * gelé `packages/api/src/lib/finance/types-lot4-salaries.ts`).
 *
 * Même dispositif qu'aux associations (`associations.test.tsx`), et pour la
 * même raison :
 *
 * - « Le corps ne répète jamais un identifiant… » épingle l'ADRESSE et le
 *   CORPS exacts envoyés par le SERVICE **réel**, sans aucune doublure : seul
 *   `apiClient` est simulé, au plus près de la frontière réseau. C'est
 *   exactement le défaut qui cassait quatre créations des lots 2 et 3, et les
 *   trois créations de ce sous-lot y sont exposées de la même façon (schémas
 *   Zod `.strict()` : un champ en trop est un 400, pas un champ ignoré).
 * - Les suites suivantes montent les DEUX écrans par-dessus ce même
 *   `apiClient` simulé — jamais le service doublé — pour que cette garantie
 *   vaille aussi pour ce que l'écran envoie réellement, geste par geste.
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
import {
  createEmployee,
  createSalaryNote,
  createSalaryPayment,
  listEmployees,
  listSalaryNotes,
  validateSalaryNote,
  validateSalaryPayment
} from '../../services/finance-salaries-service';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const SALARIE = 'emp-1';

/** L'adresse et le corps du dernier appel, pour se lire d'un coup d'œil. */
function dernierAppel(mockFn: ReturnType<typeof vi.fn>): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = mockFn.mock.calls[mockFn.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

function salarie(overrides: Partial<Employee> = {}): Employee {
  return {
    id: SALARIE,
    tenantId: TENANT,
    fullName: 'Ibrahima Koffi',
    role: 'Maçon',
    thirdPartyAccountId: 'compte-koffi',
    isActive: true,
    // On lui doit. Volontairement DIFFÉRENT de la somme des notes moins celle
    // des règlements ci-dessous : le solde court sur toute l'histoire du
    // compte, pas sur ce que l'écran a chargé. Un jeu d'essai où les deux
    // coïncideraient laisserait passer un écran qui recalculerait le solde.
    accountBalance: 275_000,
    currency: 'XOF',
    ...overrides
  };
}

function note(overrides: Partial<SalaryNote> = {}): SalaryNote {
  return {
    id: 'note-1',
    employeeId: SALARIE,
    employeeLabel: 'Ibrahima Koffi',
    periodYear: 2026,
    periodMonth: 8,
    amount: 450_000,
    currency: 'XOF',
    siteId: 'chantier-1',
    siteLabel: 'Villa de la Riviera — gros œuvre',
    costCategoryId: 'poste-mo',
    costCategoryLabel: "Main-d'œuvre",
    status: 'VALIDATED',
    createdByLabel: 'Aminata Konan',
    validatedAt: '2026-08-31T16:20:00.000Z',
    ...overrides
  };
}

function reglement(overrides: Partial<SalaryPayment> = {}): SalaryPayment {
  return {
    id: 'regl-1',
    employeeId: SALARIE,
    employeeLabel: 'Ibrahima Koffi',
    paymentDate: '2026-09-03T00:00:00.000Z',
    amount: 450_000,
    currency: 'XOF',
    status: 'DRAFT',
    createdByLabel: 'Aminata Konan',
    validatedAt: null,
    ...overrides
  };
}

const CHANTIERS: Partial<ConstructionSite>[] = [
  { id: 'chantier-1', name: 'Villa de la Riviera — gros œuvre' },
  { id: 'chantier-2', name: 'Extension Bingerville' }
];

/**
 * Le poste « main-d'œuvre » est délibérément écrit SANS apostrophe typographique
 * et en majuscules, comme une gestionnaire peut l'avoir renommé : c'est
 * exactement ce que le contrat gelé interdit de résoudre par le texte côté
 * domaine, et ce que l'écran n'a le droit que de PROPOSER.
 */
const POSTES: CostCategory[] = [
  { id: 'poste-divers', label: 'Divers', position: 1, isActive: true },
  { id: 'poste-mo', label: "MAIN D'OEUVRE", position: 2, isActive: true },
  { id: 'poste-materiaux', label: 'Matériaux', position: 3, isActive: true }
];

/**
 * Choisit une option dans un `<Select>` d'Ant Design, **en restant dans sa
 * liste déroulante**.
 *
 * Un `findByText` global ne suffit pas ici : le nom d'un chantier apparaît à
 * la fois dans la liste des notes déjà saisies et dans les options du
 * sélecteur. Chercher hors du menu trouverait la cellule du tableau, cliquerait
 * dessus, et le test passerait sans rien avoir sélectionné.
 */
async function choisirDansSelect(labelText: string, optionText: string): Promise<void> {
  fireEvent.mouseDown(screen.getByLabelText(labelText));
  const option = await waitFor(
    () => {
      for (const menu of Array.from(document.querySelectorAll('.ant-select-dropdown'))) {
        const trouve = within(menu as HTMLElement).queryAllByTitle(optionText)[0];
        if (trouve) return trouve;
      }
      throw new Error(`Option « ${optionText} » introuvable dans une liste déroulante ouverte.`);
    },
    { timeout: 8000 }
  );
  fireEvent.click(option);
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(
  options: {
    employe?: Employee;
    employes?: Employee[];
    notes?: SalaryNote[];
    reglements?: SalaryPayment[];
  } = {}
) {
  const unEmploye = options.employe ?? salarie();
  const liste = options.employes ?? [unEmploye];
  const lesNotes = options.notes ?? [note()];
  const lesReglements = options.reglements ?? [reglement()];

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/employees\/[^/?]+\/salary-payments/.test(url)) {
      return { data: { data: lesReglements } };
    }
    if (/\/finance\/salary-notes(\?|$)/.test(url)) {
      return { data: { data: lesNotes } };
    }
    if (/\/finance\/employees\/[^/?]+$/.test(url)) {
      return { data: { data: unEmploye } };
    }
    if (/\/finance\/employees(\?|$)/.test(url)) {
      return { data: { data: liste } };
    }
    if (/\/finance\/sites(\?|$)/.test(url)) {
      return { data: { data: CHANTIERS } };
    }
    if (/\/finance\/cost-categories(\?|$)/.test(url)) {
      return { data: { data: POSTES } };
    }
    return { data: { data: [] } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: salarie() } });
});

function mountListe(url = `/tenant/${TENANT}/finance/salaires`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/salaires" element={<Salaires />} />
            <Route path="/tenant/:tenantId/finance/salaires/:employeeId" element={<Salarie />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountFiche(url = `/tenant/${TENANT}/finance/salaires/${SALARIE}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/salaires/:employeeId" element={<Salarie />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------

describe('Le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  it('enregistre un salarié : le corps ne porte que le nom, et le rôle s’il est donné', async () => {
    await createEmployee(TENANT, { fullName: 'Ibrahima Koffi', role: 'Maçon' });

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees`);
    expect(corps).toEqual({ fullName: 'Ibrahima Koffi', role: 'Maçon' });
    expect(corps).not.toHaveProperty('tenantId');
  });

  it('enregistre un salarié sans rôle : le champ est omis, jamais envoyé vide', async () => {
    // Le schéma serveur refuse `role: ''` (`z.string().min(1)`) : l'envoyer
    // provoquerait un 400 pour un champ que l'utilisateur a simplement laissé
    // de côté.
    await createEmployee(TENANT, { fullName: 'Aïssatou Bamba' });

    const { corps } = dernierAppel(post);
    expect(corps).toEqual({ fullName: 'Aïssatou Bamba' });
    expect(corps).not.toHaveProperty('role');
  });

  it('saisit une note : ni `employeeId` dans le corps, le salarié voyage dans le chemin', async () => {
    await createSalaryNote(TENANT, SALARIE, {
      periodYear: 2026,
      periodMonth: 9,
      amount: 450_000,
      siteId: 'chantier-1',
      costCategoryId: 'poste-mo'
    });

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${SALARIE}/salary-notes`);
    expect(corps).not.toHaveProperty('employeeId');
    expect(Object.keys(corps).sort()).toEqual(['amount', 'costCategoryId', 'periodMonth', 'periodYear', 'siteId']);
  });

  it('saisit une note sans chantier : ni `siteId` ni `costCategoryId` dans le corps', async () => {
    // Le serveur refuse `costCategoryId` SANS chantier, et l'exige AVEC : les
    // deux champs partent ensemble ou pas du tout.
    await createSalaryNote(TENANT, SALARIE, { periodYear: 2026, periodMonth: 9, amount: 180_000 });

    const { corps } = dernierAppel(post);
    expect(Object.keys(corps).sort()).toEqual(['amount', 'periodMonth', 'periodYear']);
  });

  it('enregistre un règlement : ni `employeeId` ni `allocations` dans le corps', async () => {
    // On règle un salarié, pas une note : contrairement au règlement
    // fournisseur du lot 2, il n'y a aucune affectation.
    await createSalaryPayment(TENANT, SALARIE, { paymentDate: '2026-09-18', amount: 175_000 });

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${SALARIE}/salary-payments`);
    expect(corps).toEqual({ paymentDate: '2026-09-18', amount: 175_000 });
    expect(corps).not.toHaveProperty('employeeId');
    expect(corps).not.toHaveProperty('allocations');
  });

  it('valide une note : corps vide, la note est identifiée par le seul chemin', async () => {
    await validateSalaryNote(TENANT, 'note-1');

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/salary-notes/note-1/validate`);
    expect(corps).toEqual({});
  });

  it('valide un règlement : corps vide, même raison', async () => {
    await validateSalaryPayment(TENANT, 'regl-1');

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/salary-payments/regl-1/validate`);
    expect(corps).toEqual({});
  });

  it('liste les salariés : le filtre `onlyActive` part en requête, jamais dans le chemin', async () => {
    await listEmployees(TENANT, { onlyActive: true });

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees?onlyActive=true`);
  });

  it('liste les notes : `employeeId` part en REQUÊTE — la route est transversale', async () => {
    // Le contrat ne pose PAS `employees/{id}/salary-notes` en lecture : la
    // route est `GET finance/salary-notes`, filtrée en requête.
    await listSalaryNotes(TENANT, { employeeId: SALARIE, periodYear: 2026 });

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/salary-notes?employeeId=${SALARIE}&periodYear=2026`);
  });
});

// ---------------------------------------------------------------------------

describe('Salaires — liste et enregistrement', () => {
  it('affiche le salarié, son rôle et ce qu’on lui doit', async () => {
    mountListe();

    expect(await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Maçon')).toBeInTheDocument();
    expect(screen.getByText(/275\s000/)).toBeInTheDocument();
  });

  it('ne montre jamais un identifiant à la place d’un nom', async () => {
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    expect(screen.queryByText(SALARIE)).not.toBeInTheDocument();
    expect(screen.queryByText('compte-koffi')).not.toBeInTheDocument();
  });

  it('distingue un salarié soldé d’un salarié à qui l’on doit', async () => {
    configurerGet({ employes: [salarie({ accountBalance: 0 })] });
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    // Un zéro nu ne se lit pas : l'écran dit ce que le solde signifie.
    expect(screen.getAllByText(/Rien à lui verser/).length).toBeGreaterThanOrEqual(1);
  });

  it('lit une avance sur salaire comme une avance, pas comme une dette de l’agence', async () => {
    // `accountBalance` négatif : c'est le salarié qui doit, après un règlement
    // supérieur au solde — accepté par le serveur, et voulu.
    configurerGet({ employes: [salarie({ accountBalance: -180_000 })] });
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    expect(screen.getAllByText(/Avance de/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/180\s000/).length).toBeGreaterThanOrEqual(1);
    // Jamais le nombre signé brut.
    expect(screen.queryByText(/-180\s000/)).not.toBeInTheDocument();
  });

  it('filtre sur les actifs seulement, et le filtre part en requête', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    // Posé par défaut : la question courante est « qui dois-je payer ».
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees?onlyActive=true`));

    await user.click(screen.getByRole('switch', { name: 'Actifs seulement' }));

    await waitFor(() => expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees?onlyActive=false`));
  }, 15000);

  it('enregistre un salarié depuis le formulaire, avec les champs du contrat gelé', async () => {
    configurerGet({ employes: [] });
    post.mockResolvedValue({ data: { data: salarie({ id: 'emp-nouveau', fullName: 'Aïssatou Bamba' }) } });
    const user = userEvent.setup({ delay: null });
    mountListe();

    // Le filtre « actifs seulement » est posé par défaut : une liste vide sous
    // filtre affiche « aucun résultat », pas « aucun salarié ». C'est la
    // distinction que `<DataView>` fait, et l'écran la laisse faire.
    await screen.findByText(/Aucun résultat/i, {}, { timeout: 8000 });

    await user.click(screen.getAllByRole('button', { name: /Nouveau salarié/ })[0]);
    await user.type(await screen.findByLabelText('Nom du salarié'), 'Aïssatou Bamba');
    await user.type(screen.getByLabelText('Rôle (facultatif)'), 'Gardienne');

    await user.click(screen.getByRole('button', { name: 'Enregistrer le salarié' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees`, {
        fullName: 'Aïssatou Bamba',
        role: 'Gardienne'
      })
    );
  }, 30000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    mountListe();

    expect(await screen.findByText('Impossible de charger les salariés.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('navigue vers la fiche à l’adresse exacte que cette fiche déclare lire', async () => {
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Voir la fiche' }));

    expect(await screen.findByText('Notes de salaire', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText('Règlements', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);
});

// ---------------------------------------------------------------------------

describe('Navigation — les chemins déclarés par les écrans', () => {
  it('la fiche lit `tenantId` et `employeeId` dans le CHEMIN, pas en paramètre de requête', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees/${SALARIE}`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/employees/${SALARIE}/salary-payments`);
  });
});

// ---------------------------------------------------------------------------

describe('Fiche du salarié — ce qu’elle montre', () => {
  it('montre le solde tel que le serveur l’émet, sans le recomposer depuis les pièces affichées', async () => {
    // Note de 450 000, règlement de 450 000 : une fiche qui recalculerait
    // afficherait zéro. Le serveur dit 275 000, et c'est ce qui doit s'afficher.
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    expect(screen.getByText(/275\s000/)).toBeInTheDocument();
    expect(screen.getByText(/toutes périodes confondues/i)).toBeInTheDocument();
  });

  it('dit « aucun chantier » plutôt que de laisser un blanc', async () => {
    configurerGet({
      notes: [
        note({ id: 'note-structure', siteId: null, siteLabel: null, costCategoryId: null, costCategoryLabel: null })
      ]
    });
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    // Dans la LIGNE de la note, pas n'importe où : « Aucun chantier » est
    // aussi l'invite du sélecteur du formulaire plus bas.
    const ligne = (await screen.findByText('Août 2026', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    expect(within(ligne).getByText('Aucun chantier')).toBeInTheDocument();
  });

  it('montre le NOM du poste imputé, jamais son identifiant', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    expect(await screen.findByText("Main-d'œuvre", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('poste-mo')).not.toBeInTheDocument();
    expect(screen.queryByText('chantier-1')).not.toBeInTheDocument();
  });

  it('n’offre le geste « Valider » que sur les brouillons', async () => {
    configurerGet({
      notes: [note({ id: 'note-validee', status: 'VALIDATED' })],
      reglements: [reglement({ id: 'regl-valide', status: 'VALIDATED', validatedAt: '2026-09-03T11:05:00.000Z' })]
    });
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    await screen.findByText('Villa de la Riviera — gros œuvre', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe('Fiche du salarié — saisir une note', () => {
  it('n’affiche le poste de dépense QUE lorsqu’un chantier est choisi', async () => {
    mountFiche();

    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });
    // Sans chantier, le serveur REFUSE le poste : le champ n'existe pas.
    expect(screen.queryByLabelText('Poste de dépense')).not.toBeInTheDocument();

    await choisirDansSelect('Chantier (facultatif)', 'Villa de la Riviera — gros œuvre');

    expect(await screen.findByLabelText('Poste de dépense', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);

  it('propose le poste « main-d’œuvre » sans le choisir en silence : la proposition est écrite', async () => {
    // Le poste s'appelle « MAIN D'OEUVRE » dans ce jeu d'essai — casse et
    // ponctuation différentes du PRD. La pré-sélection doit être VISIBLE et
    // annoncée comme telle, jamais un choix fait à la place de l'utilisateur.
    mountFiche();

    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });
    await choisirDansSelect('Chantier (facultatif)', 'Villa de la Riviera — gros œuvre');

    await screen.findByLabelText('Poste de dépense', {}, { timeout: 8000 });
    expect(await screen.findByText(/Poste proposé d'après son nom/i, {}, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);

  it('refuse d’envoyer une note avec un chantier et sans poste — avant l’appel, pas après', async () => {
    // Aucun poste ne ressemble à « main-d'œuvre » ici : rien n'est
    // pré-sélectionné, et le formulaire doit dire la règle du serveur AVANT
    // d'envoyer quoi que ce soit.
    get.mockImplementation(async (url: string) => {
      if (/\/finance\/employees\/[^/?]+\/salary-payments/.test(url)) return { data: { data: [] } };
      if (/\/finance\/salary-notes(\?|$)/.test(url)) return { data: { data: [] } };
      if (/\/finance\/employees\/[^/?]+$/.test(url)) return { data: { data: salarie() } };
      if (/\/finance\/sites(\?|$)/.test(url)) return { data: { data: CHANTIERS } };
      if (/\/finance\/cost-categories(\?|$)/.test(url)) {
        return { data: { data: [{ id: 'poste-divers', label: 'Divers', position: 1, isActive: true }] } };
      }
      return { data: { data: [] } };
    });
    mountFiche();

    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });
    await choisirDansSelect('Chantier (facultatif)', 'Extension Bingerville');

    expect(
      await screen.findByText(
        /Le poste de dépense est obligatoire dès qu'un chantier est renseigné/i,
        {},
        {
          timeout: 8000
        }
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saisir la note' })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  }, 15000);

  it('saisit une note sans chantier : le corps ne porte ni chantier ni poste', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: note({ siteId: null, siteLabel: null }) } });
    mountFiche();

    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });
    const montant = screen.getByLabelText('Montant à verser');
    await user.clear(montant);
    await user.type(montant, '180000');

    await user.click(screen.getByRole('button', { name: 'Saisir la note' }));

    await waitFor(() => {
      const { adresse, corps } = dernierAppel(post);
      expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${SALARIE}/salary-notes`);
      expect(corps).not.toHaveProperty('siteId');
      expect(corps).not.toHaveProperty('costCategoryId');
      expect(corps.amount).toBe(180_000);
    });
  }, 20000);

  it('relaie le message du serveur quand une note existe déjà pour ce mois (409)', async () => {
    const user = userEvent.setup({ delay: null });
    // Le message VIENT DU SERVEUR : il dit précisément ce qui s'est passé, et
    // l'écran ne le remplace pas par une phrase inventée.
    post.mockRejectedValue({
      response: { status: 409, data: { message: 'Une note de salaire existe déjà pour ce salarié sur août 2026.' } }
    });
    mountFiche();

    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });
    const montant = screen.getByLabelText('Montant à verser');
    await user.clear(montant);
    await user.type(montant, '450000');
    await user.click(screen.getByRole('button', { name: 'Saisir la note' }));

    expect(
      await screen.findByText('Une note de salaire existe déjà pour ce salarié sur août 2026.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 20000);

  it('avertit avant de valider une note, puis n’appelle le serveur qu’après confirmation', async () => {
    configurerGet({ notes: [note({ id: 'note-brouillon', status: 'DRAFT', validatedAt: null })] });
    const user = userEvent.setup({ delay: null });
    mountFiche();

    const ligne = (await screen.findByText('Août 2026', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/salary-notes/note-brouillon/validate`, {})
    );
  }, 20000);
});

// ---------------------------------------------------------------------------

describe('Fiche du salarié — régler', () => {
  it('enregistre un règlement : ni employé ni affectation dans le corps', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: reglement() } });
    mountFiche();

    await screen.findByText('Enregistrer un règlement', {}, { timeout: 8000 });
    const montant = screen.getByLabelText('Montant versé');
    await user.clear(montant);
    await user.type(montant, '275000');

    await user.click(screen.getByRole('button', { name: 'Enregistrer le règlement' }));

    await waitFor(() => {
      const { adresse, corps } = dernierAppel(post);
      expect(adresse).toBe(`/tenants/${TENANT}/finance/employees/${SALARIE}/salary-payments`);
      expect(Object.keys(corps).sort()).toEqual(['amount', 'paymentDate']);
      expect(corps.amount).toBe(275_000);
    });
  }, 20000);

  it('avertit qu’un règlement supérieur au solde est une avance — SANS jamais le bloquer', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: reglement({ amount: 900_000 }) } });
    mountFiche();

    await screen.findByText('Enregistrer un règlement', {}, { timeout: 8000 });
    const montant = screen.getByLabelText('Montant versé');
    await user.clear(montant);
    // 900 000 dépasse largement les 275 000 dus.
    await user.type(montant, '900000');

    expect(await screen.findByText(/avance sur salaire/i, {}, { timeout: 8000 })).toBeInTheDocument();
    // Le garde-fou que le serveur n'a pas, l'écran ne l'invente pas : le
    // bouton reste actif et la requête part.
    const bouton = screen.getByRole('button', { name: 'Enregistrer le règlement' });
    expect(bouton).not.toBeDisabled();

    await user.click(bouton);
    await waitFor(() => {
      const { corps } = dernierAppel(post);
      expect(corps.amount).toBe(900_000);
    });
  }, 20000);

  it('avertit avant de valider un règlement, puis n’appelle le serveur qu’après confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('Règlements', {}, { timeout: 8000 });
    const ligne = (await screen.findByText('03/09/2026', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligne).getByRole('button', { name: 'Valider' }));

    expect(await screen.findByText(/avance sur salaire/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer la validation' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/salary-payments/regl-1/validate`, {})
    );
  }, 20000);
});

// ---------------------------------------------------------------------------

describe('Aucune cotisation n’est calculée (PRD E8)', () => {
  it('la fiche ne parle ni de brut, ni de net, ni de cotisation à saisir', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    const texte = normaliser(document.body.textContent ?? '');
    // Un seul montant, celui qui sera versé : pas de champ « brut » ni « net ».
    expect(texte).not.toMatch(/salaire brut/);
    expect(texte).not.toMatch(/net a payer/);
    // Et l'écran le dit, plutôt que de laisser chercher le champ manquant.
    expect(texte).toMatch(/aucune cotisation n'est calculee/);
  });
});

// ---------------------------------------------------------------------------

describe('Vocabulaire (P-1 du PRD)', () => {
  it('la liste des salariés n’affiche jamais « débit » ni « crédit »', async () => {
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la liste ne parle pas davantage de « débit » sur un solde négatif', async () => {
    configurerGet({ employes: [salarie({ accountBalance: -180_000 })] });
    mountListe();

    await screen.findByText('Ibrahima Koffi', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la fiche n’affiche jamais « débit » ni « crédit », y compris dans ses formulaires', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    await screen.findByText('Saisir une note de salaire', {}, { timeout: 8000 });

    // Le formulaire complet, poste de dépense compris.
    await choisirDansSelect('Chantier (facultatif)', 'Villa de la Riviera — gros œuvre');
    await screen.findByLabelText('Poste de dépense', {}, { timeout: 8000 });

    // Et l'avertissement d'avance sur salaire.
    const montant = screen.getByLabelText('Montant versé');
    await user.clear(montant);
    await user.type(montant, '900000');
    await screen.findByText(/avance sur salaire/i, {}, { timeout: 8000 });

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 20000);

  it('la fiche d’un salarié débiteur d’une avance ne le dit pas « débiteur »', async () => {
    configurerGet({ employe: salarie({ accountBalance: -180_000 }) });
    mountFiche();

    await screen.findByRole('heading', { name: 'Ibrahima Koffi' }, { timeout: 8000 });
    expect(await screen.findByText('Avance à retenir', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });
});
