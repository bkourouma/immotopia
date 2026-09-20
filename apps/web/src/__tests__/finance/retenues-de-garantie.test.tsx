import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { RetenuesDeGarantie } from '../../pages/finance/RetenuesDeGarantie';
import type { RetentionGuarantee, RetentionSummary } from '../../types/finance-retentions-types';

/**
 * Retenues de garantie — lot 4, cinquième sous-lot (PRD E6, besoin P15 ;
 * contrat gelé `packages/api/src/lib/finance/types-lot4-retentions.ts`).
 *
 * Comme `associations.test.tsx`, ce fichier monte l'écran **par-dessus un
 * `apiClient` simulé**, jamais par-dessus un service doublé : la garantie de
 * corps de requête vaut alors pour ce que l'écran envoie réellement, geste par
 * geste, et non pour ce qu'un mock du service aurait laissé passer sans le
 * voir. `__tests__/finance/corps-des-requetes.test.ts` épingle les mêmes
 * corps au niveau du service seul.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier surveille en priorité
 * ---------------------------------------------------------------------------
 *
 * 1. **Libérer n'est pas payer.** Le geste ne s'appelle jamais « Payer », et ni
 *    « payer » ni « règlement » n'apparaissent autour de lui : l'utilisateur
 *    croirait avoir versé l'argent alors que rien n'est sorti de la caisse.
 * 2. **Le montant retenu est dérivé du taux.** Le formulaire n'offre aucun
 *    champ de montant, et le corps envoyé n'en porte aucun.
 * 3. **La date de libération prévue est une prévision.** L'écran le dit.
 * 4. **Une retenue ne fait pas baisser le coût d'un chantier.** L'écran le dit
 *    aussi, en toutes lettres et en tête.
 * 5. **Les refus du serveur sont relayés tels quels**, pas remplacés par une
 *    phrase générique.
 * 6. **Jamais « débit » ni « crédit »** (P-1 du PRD) — le balayage attrape
 *    « débiteur » au passage, et c'est voulu.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`), comme dans `__tests__/finance/associations.test.tsx`.
 *
 * **Les dates des jeux d'essai sont relatives à aujourd'hui.** « En retard »
 * se décide par comparaison à la date du jour : des dates écrites en dur
 * auraient rendu ce fichier vert ou rouge selon le mois où on le lance.
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

/** Dans six mois : la retenue tranquille. */
const DATE_A_VENIR = dayjs().add(6, 'month');
/** Il y a trois mois : la retenue en retard. */
const DATE_PASSEE = dayjs().subtract(3, 'month');

/** Nettoie casse et accents, pour un balayage insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function corpsDuDocument(): string {
  return normaliser(document.body.textContent ?? '');
}

/** Détenue, dans les temps, sur une facture fournisseur. */
function retenueDetenue(overrides: Partial<RetentionGuarantee> = {}): RetentionGuarantee {
  return {
    id: 'ret-detenue',
    tenantId: TENANT,
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: 'facture-014',
    sourceLabel: 'Facture F-2026-014',
    thirdPartyLabel: 'Quincaillerie du Niger',
    thirdPartyAccountId: 'compte-quincaillerie',
    siteId: 'chantier-1',
    siteLabel: 'Villa de la Riviera',
    baseAmount: 12_000_000,
    ratePercent: 5,
    amount: 600_000,
    currency: 'XOF',
    plannedReleaseDate: DATE_A_VENIR.toISOString(),
    status: 'HELD',
    releasedAt: null,
    createdAt: '2026-09-10T09:15:00.000Z',
    ...overrides
  };
}

/** Détenue, échéance dépassée, sur une situation de tâcheron. */
function retenueEnRetard(overrides: Partial<RetentionGuarantee> = {}): RetentionGuarantee {
  return retenueDetenue({
    id: 'ret-retard',
    sourceType: 'PROGRESS_STATEMENT',
    sourceId: 'situation-03',
    sourceLabel: 'Situation n°3 — marché MAÇ-2026-07',
    thirdPartyLabel: 'Sékou Kouadio',
    thirdPartyAccountId: 'compte-kouadio',
    siteId: 'chantier-2',
    siteLabel: 'Résidence Angré',
    baseAmount: 7_500_000,
    ratePercent: 10,
    amount: 750_000,
    plannedReleaseDate: DATE_PASSEE.toISOString(),
    ...overrides
  });
}

/** Déjà libérée : l'argent est redevenu exigible, rien n'est sorti. */
function retenueLiberee(overrides: Partial<RetentionGuarantee> = {}): RetentionGuarantee {
  return retenueDetenue({
    id: 'ret-liberee',
    sourceType: 'PROGRESS_STATEMENT',
    sourceId: 'situation-02',
    sourceLabel: 'Situation n°2 — marché CHA-2025-11',
    thirdPartyLabel: 'Mamadou Koffi',
    baseAmount: 4_000_000,
    ratePercent: 7.5,
    amount: 300_000,
    plannedReleaseDate: DATE_PASSEE.toISOString(),
    status: 'RELEASED',
    releasedAt: DATE_PASSEE.add(2, 'day').toISOString(),
    ...overrides
  });
}

/**
 * Le résumé, et ses chiffres **volontairement différents** de toute somme des
 * lignes affichées.
 *
 * Il porte sur l'ensemble des retenues de l'agence, pas sur la page à
 * l'écran : un jeu d'essai où les deux coïncideraient laisserait passer un
 * écran qui additionnerait lui-même la liste — c'est précisément ce que ces
 * trois champs existent pour démentir.
 */
function resume(overrides: Partial<RetentionSummary> = {}): RetentionSummary {
  return {
    totalHeld: 1_350_000,
    totalReleased: 325_000,
    overdueHeld: 905_000,
    overdueCount: 2,
    currency: 'XOF',
    ...overrides
  };
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(
  options: {
    retenues?: RetentionGuarantee[];
    resume?: RetentionSummary | null;
  } = {}
) {
  const liste = options.retenues ?? [retenueDetenue(), retenueEnRetard(), retenueLiberee()];
  const leResume = options.resume === undefined ? resume() : options.resume;

  get.mockImplementation(async (url: string) => {
    // Le résumé AVANT le détail : `/retentions/summary` correspond aussi au
    // motif `/retentions/{id}`. Même piège que côté routeur Express.
    if (/\/finance\/retentions\/summary/.test(url)) {
      return { data: { data: leResume } };
    }
    if (/\/finance\/retentions(\?|$)/.test(url)) {
      return { data: { data: liste } };
    }
    if (/\/finance\/sites(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            { id: 'chantier-1', name: 'Villa de la Riviera' },
            { id: 'chantier-2', name: 'Résidence Angré' }
          ]
        }
      };
    }
    // Le fournisseur et la facture du FORMULAIRE portent volontairement des
    // noms absents de la liste : sans cela, le clic sur une option du menu
    // déroulant serait ambigu avec la cellule du tableau qui porte le même
    // texte, et le test ne prouverait plus rien.
    if (/\/finance\/suppliers\/[^/]+\/invoices/.test(url)) {
      return {
        data: {
          data: [
            {
              id: 'facture-201',
              supplierId: 'frs-1',
              supplierLabel: 'Menuiserie Touré',
              siteId: 'chantier-1',
              siteLabel: 'Villa de la Riviera',
              invoiceDate: '2026-09-01',
              reference: 'F-2026-201',
              amount: 12_000_000,
              currency: 'XOF',
              status: 'VALIDATED',
              validatedAt: '2026-09-02T10:00:00.000Z'
            },
            // Brouillon : le serveur la refuserait, l'écran ne doit pas la
            // proposer.
            {
              id: 'facture-brouillon',
              supplierId: 'frs-1',
              supplierLabel: 'Menuiserie Touré',
              siteId: null,
              siteLabel: null,
              invoiceDate: '2026-09-15',
              reference: 'F-2026-099',
              amount: 400_000,
              currency: 'XOF',
              status: 'DRAFT',
              validatedAt: null
            }
          ]
        }
      };
    }
    if (/\/finance\/suppliers(\?|$)/.test(url)) {
      return {
        data: {
          data: [
            {
              id: 'frs-1',
              name: 'Menuiserie Touré',
              kind: 'GOODS',
              contactName: null,
              phone: null,
              email: null,
              maintenanceVendorId: null,
              thirdPartyAccountId: 'compte-menuiserie'
            }
          ]
        }
      };
    }
    if (/\/finance\/contractor-contracts\/[^/]+\/statements/.test(url)) {
      return { data: { data: [] } };
    }
    if (/\/finance\/contractor-contracts(\?|$)/.test(url)) {
      return { data: { data: [] } };
    }
    return { data: { data: [] } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: retenueDetenue() } });
});

function monter(url = `/tenant/${TENANT}/finance/retenues`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/retenues" element={<RetenuesDeGarantie />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** La ligne d'une retenue, retrouvée par le libellé de sa pièce. */
async function ligne(libellePiece: string): Promise<HTMLElement> {
  const cellule = await screen.findByText(libellePiece, {}, { timeout: 8000 });
  return cellule.closest('tr') as HTMLElement;
}

// ---------------------------------------------------------------------------

describe('Résumé — ce qui est détenu, ce qui a été rendu, ce qui traîne', () => {
  it('affiche les trois chiffres du contrat, tels que le serveur les émet', async () => {
    monter();

    expect(await screen.findByText("Détenu aujourd'hui", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Déjà libéré')).toBeInTheDocument();
    // « En retard » est à la fois le libellé de la carte et l'étiquette d'une
    // ligne dépassée : les deux sont attendus.
    expect(screen.getAllByText('En retard').length).toBeGreaterThanOrEqual(2);

    // Les trois montants viennent du résumé, pas de la liste : aucun n'est
    // égal à une somme des lignes affichées, et un écran qui les recalculerait
    // se verrait ici.
    expect(screen.getByText(/1\s350\s000/)).toBeInTheDocument();
    expect(screen.getByText(/325\s000/)).toBeInTheDocument();
    expect(screen.getByText(/905\s000/)).toBeInTheDocument();
  });

  it('nomme le nombre de retenues en retard, le seul chiffre qui appelle une action', async () => {
    monter();

    expect(
      await screen.findByText(/2 retenues au-delà de la date convenue/, {}, { timeout: 8000 })
    ).toBeInTheDocument();
  });

  it('ne présente rien comme anormal quand aucune retenue n’est en retard', async () => {
    configurerGet({ resume: resume({ overdueCount: 0, overdueHeld: 0 }) });
    monter();

    expect(
      await screen.findByText('Aucune retenue au-delà de la date convenue.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // Rien à cliquer : une carte à zéro ne mène nulle part.
    expect(screen.queryByRole('link', { name: /En retard/ })).not.toBeInTheDocument();
  });

  it('la carte « en retard » pose les deux filtres correspondants, visiblement', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await user.click(await screen.findByRole('link', { name: /En retard/ }, { timeout: 8000 }));

    // Le filtre d'échéance est une comparaison de DATES côté serveur : l'écran
    // envoie `dueBefore`, il ne trie pas la liste lui-même.
    await waitFor(() =>
      expect(
        get.mock.calls.some((appel: unknown[]) => /retentions\?.*status=HELD.*dueBefore=/.test(String(appel[0])))
      ).toBe(true)
    );
  }, 15000);
});

describe('La liste — une retenue ne fait pas baisser le coût du chantier', () => {
  it('dit en tête que le coût du chantier ne bouge pas', async () => {
    monter();

    expect(
      await screen.findByText('Une retenue ne diminue pas le coût du chantier', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/reste imputée pour son montant entier/i)).toBeInTheDocument();
  });

  it('nomme le montant de la pièce comme tel, jamais comme un coût de chantier', async () => {
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    // L'en-tête de colonne et la carte portent le même libellé : deux
    // occurrences attendues.
    expect(screen.getAllByText('Montant de la pièce').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/12\s000\s000/)).toBeInTheDocument();
    expect(screen.getByText(/600\s000/)).toBeInTheDocument();
  });

  it('marque « En retard » une retenue détenue dont la date est passée, et elle seule', async () => {
    monter();

    const ligneRetard = await ligne('Situation n°3 — marché MAÇ-2026-07');
    expect(within(ligneRetard).getByText('En retard')).toBeInTheDocument();

    const ligneTranquille = await ligne('Facture F-2026-014');
    expect(within(ligneTranquille).queryByText('En retard')).not.toBeInTheDocument();

    // Libérée, échéance passée : rien à réclamer, donc pas d'alerte.
    const ligneRendue = await ligne('Situation n°2 — marché CHA-2025-11');
    expect(within(ligneRendue).queryByText('En retard')).not.toBeInTheDocument();
  }, 15000);

  it('écrit « Hors chantier » plutôt que de laisser la case vide', async () => {
    configurerGet({ retenues: [retenueDetenue({ siteId: null, siteLabel: null })] });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    expect(screen.getAllByText('Hors chantier').length).toBeGreaterThanOrEqual(1);
  });

  it('montre les noms des pièces et des tiers, jamais leurs identifiants', async () => {
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    expect(screen.getByText('Quincaillerie du Niger')).toBeInTheDocument();
    expect(screen.queryByText('ret-detenue')).not.toBeInTheDocument();
    expect(screen.queryByText('facture-014')).not.toBeInTheDocument();
    expect(screen.queryByText('compte-quincaillerie')).not.toBeInTheDocument();
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    monter();

    expect(
      await screen.findByText('Impossible de charger les retenues de garantie.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});

describe('Libérer n’est pas payer', () => {
  it('le geste s’appelle « Libérer » — aucun bouton ne propose de payer', async () => {
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    const ligneDetenue = await ligne('Facture F-2026-014');
    expect(within(ligneDetenue).getByRole('button', { name: 'Libérer' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /payer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /régler/i })).not.toBeInTheDocument();
  }, 15000);

  it('ni « payer » ni « règlement » n’apparaissent autour de ce geste', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    const ligneDetenue = await ligne('Facture F-2026-014');
    await user.click(within(ligneDetenue).getByRole('button', { name: 'Libérer' }));
    // « exigible » paraît aussi sur la carte « Déjà libéré » du résumé : c'est
    // le même mot pour la même idée, et les deux occurrences sont normales.
    await screen.findAllByText(/exigible/i, {}, { timeout: 8000 });

    // Le mot ferait croire à l'utilisateur qu'il vient de verser l'argent.
    // Aucune sortie de caisse ne naît de ce geste.
    const texte = corpsDuDocument();
    expect(texte).not.toMatch(/payer/);
    expect(texte).not.toMatch(/paiement/);
    expect(texte).not.toMatch(/reglement/);
    expect(texte).not.toMatch(/\bregler\b/);
  }, 15000);

  it('dit, avant de confirmer, que l’argent redevient seulement exigible', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    const ligneDetenue = await ligne('Facture F-2026-014');
    await user.click(within(ligneDetenue).getByRole('button', { name: 'Libérer' }));

    expect(await screen.findByText(/ne verse rien/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/redevient exigible/i)).toBeInTheDocument();
    expect(screen.getByText(/redevient créancier/i)).toBeInTheDocument();
    // Rien n'est parti tant que la confirmation n'a pas été donnée.
    expect(post).not.toHaveBeenCalled();
  }, 15000);

  it('libère après confirmation, avec un corps VIDE sur le chemin de la retenue', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockResolvedValue({ data: { data: retenueDetenue({ status: 'RELEASED' }) } });
    monter();

    const ligneDetenue = await ligne('Facture F-2026-014');
    await user.click(within(ligneDetenue).getByRole('button', { name: 'Libérer' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la libération' }, { timeout: 8000 }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/retentions/ret-detenue/release`, {})
    );
  }, 15000);

  it('ne propose plus le geste sur une retenue déjà libérée', async () => {
    monter();

    const ligneRendue = await ligne('Situation n°2 — marché CHA-2025-11');
    expect(within(ligneRendue).queryByRole('button', { name: 'Libérer' })).not.toBeInTheDocument();
    expect(within(ligneRendue).getByText(/Libérée le/)).toBeInTheDocument();
  }, 15000);
});

describe('Le montant retenu est dérivé du taux, jamais saisi', () => {
  it('le formulaire demande un taux et n’offre aucun champ de montant', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    expect(await screen.findByLabelText('Taux de retenue (%)', {}, { timeout: 8000 })).toBeInTheDocument();
    // Aucun champ de saisie de montant, sous aucun des noms possibles.
    expect(screen.queryByLabelText(/^Montant/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Montant retenu/i)).not.toBeInTheDocument();
  }, 15000);

  it('affiche l’aperçu du montant en le nommant « aperçu », et dit qui le calcule', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    const selectFournisseur = await screen.findByLabelText('Fournisseur', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFournisseur);
    fireEvent.click(await screen.findByText('Menuiserie Touré', {}, { timeout: 8000 }));

    const selectFacture = await screen.findByLabelText('Facture validée', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFacture);
    fireEvent.click(await screen.findByText(/F-2026-201/, {}, { timeout: 8000 }));

    await user.type(screen.getByLabelText('Taux de retenue (%)'), '5');

    expect(await screen.findByText(/Aperçu\s*:/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/Aperçu indicatif seulement/i)).toBeInTheDocument();
    expect(screen.getByText(/n'envoie que le taux/i)).toBeInTheDocument();
  }, 20000);

  it('ne propose que des pièces validées : le serveur refuse les autres', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    const selectFournisseur = await screen.findByLabelText('Fournisseur', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFournisseur);
    fireEvent.click(await screen.findByText('Menuiserie Touré', {}, { timeout: 8000 }));

    const selectFacture = await screen.findByLabelText('Facture validée', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFacture);

    await screen.findByText(/F-2026-201/, {}, { timeout: 8000 });
    // La facture en brouillon n'est pas proposée.
    expect(screen.queryByText(/F-2026-099/)).not.toBeInTheDocument();
  }, 20000);

  it('pose une retenue : le corps porte le taux, la pièce et la date — jamais un montant', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    const selectFournisseur = await screen.findByLabelText('Fournisseur', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFournisseur);
    fireEvent.click(await screen.findByText('Menuiserie Touré', {}, { timeout: 8000 }));

    const selectFacture = await screen.findByLabelText('Facture validée', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFacture);
    fireEvent.click(await screen.findByText(/F-2026-201/, {}, { timeout: 8000 }));

    await user.type(screen.getByLabelText('Taux de retenue (%)'), '5');

    // AntD `DatePicker` n'a pas de placeholder stable d'un environnement à
    // l'autre : on cible l'entrée réelle par l'`id` que l'écran lui donne,
    // comme dans `baux-de-terrain.test.tsx`.
    const champDate = document.getElementById('retenue-date-liberation') as HTMLInputElement;
    fireEvent.change(champDate, { target: { value: '31/03/2027' } });
    fireEvent.keyDown(champDate, { key: 'Enter', code: 'Enter' });

    await user.click(screen.getByRole('button', { name: 'Poser la retenue' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/retentions`, {
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: 'facture-201',
        ratePercent: 5,
        plannedReleaseDate: '2027-03-31'
      })
    );

    const corps = post.mock.calls[post.mock.calls.length - 1][1] as Record<string, unknown>;
    expect(corps).not.toHaveProperty('amount');
    expect(corps).not.toHaveProperty('baseAmount');
  }, 30000);
});

describe('La date de libération prévue est une prévision', () => {
  it('dit que rien ne se libère tout seul à cette date', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    expect(await screen.findByText(/rien ne se libère tout seul/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/pas une échéance automatique/i)).toBeInTheDocument();
  }, 15000);
});

describe('Les refus du serveur restent lisibles', () => {
  it('relaie le message du serveur quand la pose est refusée, sans le remplacer', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { data: { message: 'Une retenue de garantie a déjà été posée sur cette pièce' } }
    });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);

    const selectFournisseur = await screen.findByLabelText('Fournisseur', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFournisseur);
    fireEvent.click(await screen.findByText('Menuiserie Touré', {}, { timeout: 8000 }));

    const selectFacture = await screen.findByLabelText('Facture validée', {}, { timeout: 8000 });
    fireEvent.mouseDown(selectFacture);
    fireEvent.click(await screen.findByText(/F-2026-201/, {}, { timeout: 8000 }));

    await user.type(screen.getByLabelText('Taux de retenue (%)'), '5');
    const champDate = document.getElementById('retenue-date-liberation') as HTMLInputElement;
    fireEvent.change(champDate, { target: { value: '31/03/2027' } });
    fireEvent.keyDown(champDate, { key: 'Enter', code: 'Enter' });

    await user.click(screen.getByRole('button', { name: 'Poser la retenue' }));

    // Le serveur seul sait lequel des cinq refus s'est produit : une phrase
    // générique perdrait cette information.
    //
    // Le motif paraît DEUX fois depuis le 20 septembre 2026 : dans la
    // notification, et dans la fenêtre elle-même. Un refus de formulaire se
    // lit là où l'on vient de saisir — la fenêtre reste ouverte après un
    // échec, et rien n'y disait pourquoi.
    await waitFor(
      () => expect(screen.getAllByText('Une retenue de garantie a déjà été posée sur cette pièce').length).toBe(2),
      { timeout: 8000 }
    );
    expect(await screen.findByText('La retenue a été refusée', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('relaie le message du serveur quand la libération est refusée', async () => {
    const user = userEvent.setup({ delay: null });
    post.mockRejectedValue({
      response: { data: { message: 'Cette retenue de garantie a déjà été libérée' } }
    });
    monter();

    const ligneDetenue = await ligne('Facture F-2026-014');
    await user.click(within(ligneDetenue).getByRole('button', { name: 'Libérer' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmer la libération' }, { timeout: 8000 }));

    expect(
      await screen.findByText('Cette retenue de garantie a déjà été libérée', {}, { timeout: 8000 })
    ).toBeInTheDocument();
  }, 20000);
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('n’affiche jamais « débit » ni « crédit » — « débiteur » compris', async () => {
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    // Le balayage est volontairement large : « débiteur » contient « débit »,
    // et il n'a pas plus sa place à l'écran que le mot nu.
    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);
  });

  it('n’affiche pas davantage ces mots dans le formulaire de pose', async () => {
    const user = userEvent.setup({ delay: null });
    monter();

    await screen.findByText('Facture F-2026-014', {}, { timeout: 8000 });
    await user.click(screen.getAllByRole('button', { name: /Poser une retenue/ })[0]);
    await screen.findByLabelText('Taux de retenue (%)', {}, { timeout: 8000 });

    expect(corpsDuDocument()).not.toMatch(/\bdebit/);
    expect(corpsDuDocument()).not.toMatch(/\bcredit/);
  }, 15000);
});
