import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockChantier } from '../../pages/finance/StockChantier';
import type {
  SiteStockReconciliation,
  SiteStockReconciliationLine,
  SiteStockStatus
} from '../../types/finance-stock-rapprochement-types';

/**
 * Le stock d'un chantier — bascule et rapprochement acheté / consommé /
 * restant. Lot 5, quatrième et dernier sous-lot (PRD E9, besoin S7,
 * principe P-7 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-rapprochement.ts`).
 *
 * Comme `cloture-chantier.test.tsx`, ce fichier monte l'écran par-dessus un
 * `apiClient` simulé — **jamais le service doublé**. Les garanties d'adresse et
 * de corps valent donc pour ce que l'écran envoie réellement, et non pour ce
 * qu'un mock du service aurait laissé passer sans le voir.
 *
 * Les cinq garanties qui comptent plus que les autres :
 *
 * 1. **La bascule est irréversible, et la confirmation le dit sans détour** —
 *    le mot « irréversible » ET ce qui change sont sous les yeux AVANT que le
 *    serveur soit appelé.
 * 2. **Aucune date ne part.** Le corps est vide, et le schéma serveur refuse
 *    `enabledAt` en 400 : une date choisie laisserait antidater la bascule.
 * 3. **Les deux entrées ne se mélangent pas.** Un chantier alimenté uniquement
 *    par transferts affiche un écart NUL, pas un écart négatif — le défaut que
 *    la correction du contrat a supprimé, et le cas le plus courant en agence.
 * 4. **L'écart est montré, jamais jugé** : aucun mot ne le qualifie de perte,
 *    de vol, d'anomalie ni de manquant, et les deux lectures possibles sont
 *    présentées sans qu'aucune soit choisie.
 * 5. **Un chantier non basculé montre quand même son consommé.** Seuls le
 *    facturé et l'écart y valent zéro.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`) et un `<DataView>` en tableau, comme dans
 * `cloture-chantier.test.tsx`.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
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
const SITE = 'chantier-1';

// ---------------------------------------------------------------------------
// Jeux d'essai
// ---------------------------------------------------------------------------

function ligne(
  partielle: Partial<SiteStockReconciliationLine> &
    Pick<SiteStockReconciliationLine, 'itemId' | 'itemReference' | 'itemLabel' | 'itemUnit'>
): SiteStockReconciliationLine {
  return {
    receivedQuantity: 0,
    transferredInQuantity: 0,
    issuedQuantity: 0,
    remainingQuantity: 0,
    receivedValue: 0,
    transferredInValue: 0,
    issuedValue: 0,
    remainingValue: 0,
    currency: 'XOF',
    ...partielle
  };
}

/**
 * Un chantier PASSÉ au stock, avec un écart positif.
 *
 * Les chiffres sont volontairement INCOHÉRENTS avec toute formule que l'écran
 * pourrait tenter : 12 000 000 − 11 100 000 ne fait pas 850 000. Un écran qui
 * recalculerait au lieu d'afficher ce que le serveur envoie tomberait ici.
 */
function rapprochement(overrides: Partial<SiteStockReconciliation> = {}): SiteStockReconciliation {
  return {
    siteId: SITE,
    siteLabel: 'Immeuble de Kaloum',
    stockEnabledAt: '2026-06-01T08:00:00.000Z',
    invoicedAmount: 12_000_000,
    receivedValue: 11_100_000,
    transferredInValue: 2_400_000,
    unreconciledAmount: 850_000,
    issuedValue: 9_800_000,
    remainingValue: 3_700_000,
    currency: 'XOF',
    lines: [
      ligne({
        itemId: 'article-ciment-01',
        itemReference: 'CIM-42',
        itemLabel: 'Ciment CPJ 42,5',
        itemUnit: 'sac',
        receivedQuantity: 800,
        receivedValue: 8_000_000,
        transferredInQuantity: 120,
        transferredInValue: 1_200_000,
        issuedQuantity: 700,
        issuedValue: 7_000_000,
        remainingQuantity: 220,
        remainingValue: 2_200_000
      }),
      // Un quart de mètre cube : la précision du stock est de QUATRE
      // décimales, et le formateur monétaire afficherait « 0 ».
      ligne({
        itemId: 'article-sable-03',
        itemReference: 'SAB-00',
        itemLabel: 'Sable lavé',
        itemUnit: 'm³',
        receivedQuantity: 18.5,
        receivedValue: 500_000,
        issuedQuantity: 18.25,
        issuedValue: 40_000,
        remainingQuantity: 0.25,
        remainingValue: 460_000
      })
    ],
    ...overrides
  };
}

/** Le cas le plus courant : alimenté UNIQUEMENT depuis un magasin central. */
function rapprochementTransferts(): SiteStockReconciliation {
  return rapprochement({
    siteLabel: 'Villa de Nongo',
    invoicedAmount: 0,
    receivedValue: 0,
    transferredInValue: 8_250_000,
    // ZÉRO, et surtout pas −8 250 000 : une livraison interne n'est pas un
    // achat, et rien n'a été facturé à ce chantier.
    unreconciledAmount: 0,
    issuedValue: 5_400_000,
    remainingValue: 2_850_000,
    lines: [
      ligne({
        itemId: 'article-ciment-01',
        itemReference: 'CIM-42',
        itemLabel: 'Ciment CPJ 42,5',
        itemUnit: 'sac',
        transferredInQuantity: 600,
        transferredInValue: 8_250_000,
        issuedQuantity: 420,
        issuedValue: 5_400_000,
        remainingQuantity: 180,
        remainingValue: 2_850_000
      })
    ]
  });
}

/**
 * Un chantier qui n'est PAS passé au stock, et qui a pourtant consommé.
 *
 * Un magasin central lui a sorti de la marchandise : ces sorties ont imputé
 * son coût. Seuls le facturé et l'écart valent zéro.
 */
function rapprochementNonBasculeConsomme(): SiteStockReconciliation {
  return rapprochement({
    siteLabel: 'Résidence de Ratoma',
    stockEnabledAt: null,
    invoicedAmount: 0,
    receivedValue: 0,
    transferredInValue: 0,
    unreconciledAmount: 0,
    issuedValue: 3_150_000,
    remainingValue: 0,
    lines: [
      ligne({
        itemId: 'article-ciment-01',
        itemReference: 'CIM-42',
        itemLabel: 'Ciment CPJ 42,5',
        itemUnit: 'sac',
        issuedQuantity: 240,
        issuedValue: 3_150_000
      })
    ]
  });
}

function rapprochementNonBascule(): SiteStockReconciliation {
  return rapprochement({
    siteLabel: 'Villa de Kipé',
    stockEnabledAt: null,
    invoicedAmount: 0,
    receivedValue: 0,
    transferredInValue: 0,
    unreconciledAmount: 0,
    issuedValue: 0,
    remainingValue: 0,
    lines: []
  });
}

function statut(overrides: Partial<SiteStockStatus> = {}): SiteStockStatus {
  return {
    siteId: SITE,
    siteLabel: 'Immeuble de Kaloum',
    stockEnabledAt: '2026-06-01T08:00:00.000Z',
    stockLocationId: 'lieu-kaloum-11',
    stockLocationLabel: 'Chantier Immeuble de Kaloum',
    ...overrides
  };
}

function statutNonBascule(overrides: Partial<SiteStockStatus> = {}): SiteStockStatus {
  return statut({ stockEnabledAt: null, stockLocationId: null, stockLocationLabel: null, ...overrides });
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * La carte d'indicateur qui porte ce libellé, pour lire SA valeur et rien
 * d'autre.
 *
 * Passe par les cartes plutôt que par `screen.getByText` : plusieurs libellés
 * de cet écran — « Entré depuis une facture », « Venu d'un autre lieu »,
 * « Consommé » — sont à la fois un indicateur ET une colonne du tableau, et
 * c'est précisément ce qu'on veut : la même chose s'appelle du même nom aux
 * deux endroits.
 */
function carte(label: string): HTMLElement {
  const cartes = Array.from(document.querySelectorAll('.ant-card')) as HTMLElement[];
  const trouvee = cartes.find(candidate =>
    Array.from(candidate.querySelectorAll('div')).some(
      noeud => noeud.children.length === 0 && noeud.textContent === label
    )
  );
  if (!trouvee) throw new Error(`Aucune carte ne porte le libellé « ${label} »`);
  return trouvee;
}

function configurerGet(
  options: { rapprochement?: SiteStockReconciliation; statut?: SiteStockStatus; statutEnPanne?: boolean } = {}
) {
  const unRapprochement = options.rapprochement ?? rapprochement();
  const unStatut = options.statut ?? statut({ stockEnabledAt: unRapprochement.stockEnabledAt });

  get.mockImplementation(async (url: string) => {
    if (/\/stock\/reconciliation$/.test(url)) {
      return { data: { data: unRapprochement } };
    }
    if (/\/stock\/status$/.test(url)) {
      if (options.statutEnPanne) throw new Error('panne');
      return { data: { data: unStatut } };
    }
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: statut() } });
});

function monter(url = `/tenant/${TENANT}/finance/chantiers/${SITE}/stock`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/chantiers/:siteId/stock" element={<StockChantier />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------

describe("L'état du chantier : passé au stock, depuis quand, et où", () => {
  it('dit la date de la bascule et le lieu où atterrissent les réceptions', async () => {
    monter();

    expect(await screen.findByText(/est passé au stock le 01\/06\/2026/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Chantier Immeuble de Kaloum/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Passé au stock')).toBeInTheDocument();
  });

  it("dit qu'un chantier n'est pas passé au stock, et ce que la bascule changerait", async () => {
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    expect(await screen.findByText(/n'est pas passé au stock\./i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/directement dans son coût/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sortie de magasin/i).length).toBeGreaterThanOrEqual(1);
  });

  it("n'offre plus la bascule sur un chantier déjà passé au stock : elle ne se rejoue pas", async () => {
    monter();

    await screen.findByText(/est passé au stock le/i, {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Faire passer ce chantier au stock' })).not.toBeInTheDocument();
  });

  it("n'offre AUCUN retour en arrière : aucune route n'en propose", async () => {
    monter();

    await screen.findByText(/est passé au stock le/i, {}, { timeout: 8000 });
    const texte = normaliser(document.body.textContent ?? '');
    expect(texte).not.toMatch(/annuler la bascule/);
    expect(texte).not.toMatch(/retirer du stock/);
    expect(screen.queryByRole('button', { name: /annuler/i })).not.toBeInTheDocument();
  });

  it('continue de montrer les chiffres quand le lieu de stockage ne peut pas être lu', async () => {
    configurerGet({ statutEnPanne: true });
    monter();

    expect(
      await screen.findByText(/Impossible de lire le lieu de stockage/i, {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // Les chiffres du rapprochement, eux, sont là : une lecture en panne n'en
    // masque pas une autre.
    expect(screen.getByText('Facturé au chantier')).toBeInTheDocument();
  });
});

describe('La bascule est IRRÉVERSIBLE, et la confirmation le dit sans détour', () => {
  it("l'annonce sur la page, AVANT même qu'on approche du bouton", async () => {
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    expect(await screen.findByText(/Ce geste est irréversible\./i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(/pas même pour un administrateur/i)).toBeInTheDocument();
    expect(screen.getByText(/ne plus s'en servir/i)).toBeInTheDocument();
  });

  it("dit « irréversible » ET ce qui change dans la confirmation, avant d'appeler le serveur", async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    await user.click(
      await screen.findByRole('button', { name: 'Faire passer ce chantier au stock' }, { timeout: 8000 })
    );

    const bouton = await screen.findByRole('button', { name: 'Confirmer le passage au stock' });
    const confirmation = bouton.closest('.ant-popover') as HTMLElement;
    expect(confirmation).toBeTruthy();

    // Le mot, et l'explication. Pas l'un sans l'autre : « irréversible » seul
    // ne dit pas ce qu'on perd.
    expect(within(confirmation).getByText(/irréversible/i)).toBeInTheDocument();
    const texte =
      within(confirmation)
        .getByText(/irréversible/i)
        .closest('span')?.textContent ?? '';
    expect(texte).toMatch(/n'entreront plus dans son coût/i);
    expect(texte).toMatch(/sortie de magasin/i);
    expect(texte).toMatch(/ne plus s'en servir/i);

    // Rien n'est parti tant que la confirmation n'a pas été validée.
    expect(post).not.toHaveBeenCalled();
  }, 15000);

  it('bascule après confirmation, sur le chemin du chantier', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    await user.click(
      await screen.findByRole('button', { name: 'Faire passer ce chantier au stock' }, { timeout: 8000 })
    );
    await user.click(await screen.findByRole('button', { name: 'Confirmer le passage au stock' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [adresse] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    expect(adresse).toBe(`/tenants/${TENANT}/finance/sites/${SITE}/stock/enable`);
  }, 15000);
});

describe('Aucune date ne part : le corps de la bascule est VIDE', () => {
  it('envoie un corps strictement vide, sans `enabledAt`', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    await user.click(
      await screen.findByRole('button', { name: 'Faire passer ce chantier au stock' }, { timeout: 8000 })
    );
    await user.click(await screen.findByRole('button', { name: 'Confirmer le passage au stock' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/stock/enable`, {}));
    const [, corps] = post.mock.calls[post.mock.calls.length - 1] as [string, Record<string, unknown>];
    // `z.object({}).strict()` côté serveur : la moindre clé est un 400. Une
    // date choisie par l'appelant permettrait d'antidater la bascule et de
    // reclasser après coup des factures déjà imputées.
    expect(Object.keys(corps)).toEqual([]);
    expect(corps).not.toHaveProperty('enabledAt');
    expect(corps).not.toHaveProperty('stockEnabledAt');
    expect(corps).not.toHaveProperty('siteId');
    expect(corps).not.toHaveProperty('tenantId');
  }, 15000);

  it("n'offre aucun sélecteur de date, et le dit", async () => {
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    await screen.findByRole('button', { name: 'Faire passer ce chantier au stock' }, { timeout: 8000 });
    expect(document.querySelector('.ant-picker')).toBeNull();
    expect(screen.getByText(/Il n'y a pas de date à choisir/i)).toBeInTheDocument();
  });
});

describe('Les deux entrées ne se mélangent pas — le cœur de l’écran', () => {
  it('présente « entré depuis une facture » et « venu d’un autre lieu » comme deux colonnes distinctes', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const entetes = Array.from(document.querySelectorAll('th')).map(noeud => noeud.textContent);
    expect(entetes).toContain('Entré depuis une facture');
    expect(entetes).toContain("Venu d'un autre lieu");
    // Deux indicateurs distincts, eux aussi.
    expect(screen.getAllByText('Entré depuis une facture').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Venu d'un autre lieu").length).toBeGreaterThanOrEqual(2);
  });

  it('un chantier alimenté UNIQUEMENT par transferts affiche un écart NUL, jamais négatif', async () => {
    configurerGet({ rapprochement: rapprochementTransferts() });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });

    // L'écart vaut zéro : rien n'a été facturé à ce chantier, donc il n'y a
    // rien à confronter. L'ancien calcul affichait ici l'opposé de tout ce
    // qu'on lui avait livré.
    expect(within(carte('Écart entre le facturé et le reçu')).getByText('0 FCFA')).toBeInTheDocument();
    // La valeur livrée est bien là, mais ailleurs : dans son indicateur à elle.
    expect(within(carte("Venu d'un autre lieu")).getByText(/8\s250\s000\sFCFA/)).toBeInTheDocument();
    // Et nulle part un écart négatif de ce montant.
    const texte = document.body.textContent ?? '';
    expect(texte).not.toMatch(/-\s?8\s250\s000/);
    expect(texte).not.toMatch(/−8\s?250\s000/);
  });

  it('dit explicitement que les livraisons internes n’entrent pas dans l’écart', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(screen.getByText(/n'entrent pas dans ce calcul/i)).toBeInTheDocument();
    expect(screen.getAllByText(/payé(e|es)? ailleurs, ou ne l'(a|ont) jamais été/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe('L’écart est montré, jamais jugé', () => {
  it("n'emploie aucun mot qui qualifierait l'écart, sur un chantier qui en a un", async () => {
    configurerGet({ rapprochement: rapprochement() });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    const texte = normaliser(document.body.textContent ?? '');

    // Un vol et des frais de transport se ressemblent dans une soustraction :
    // trancher à la place d'un humain serait mettre quelqu'un en cause sur un
    // chiffre.
    expect(texte).not.toMatch(/\bpertes?\b/);
    expect(texte).not.toMatch(/\bvols?\b/);
    expect(texte).not.toMatch(/\banomalies?\b/);
    expect(texte).not.toMatch(/manquant/);
    expect(texte).not.toMatch(/injustifi/);
    expect(texte).not.toMatch(/non justifi/);
    expect(texte).not.toMatch(/\bfraude/);
    expect(texte).not.toMatch(/detournement/);
    expect(texte).not.toMatch(/\bsuspect/);
  });

  it('expose les DEUX lectures possibles, et n’en choisit aucune', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    // Une lecture innocente…
    expect(screen.getByText(/transport, manutention/i)).toBeInTheDocument();
    // … et l'autre, sans qu'aucune soit désignée.
    expect(screen.getByText(/jamais arrivée sur place/i)).toBeInTheDocument();
    expect(screen.getByText(/c'est à vous de dire lequel des deux cas/i)).toBeInTheDocument();
  });

  it("affiche l'écart tel que le serveur l'envoie, sans le recalculer", async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    // 12 000 000 − 11 100 000 ne fait pas 850 000 : ce chiffre ne peut venir
    // que du serveur.
    expect(within(carte('Écart entre le facturé et le reçu')).getByText(/850\s000\sFCFA/)).toBeInTheDocument();
    expect(within(carte('Facturé au chantier')).getByText(/12\s000\s000\sFCFA/)).toBeInTheDocument();
    expect(within(carte('Entré depuis une facture')).getByText(/11\s100\s000\sFCFA/)).toBeInTheDocument();
  });
});

describe('Un chantier non basculé montre quand même son consommé', () => {
  it('affiche le consommé réel, et ne met à zéro que le facturé et l’écart', async () => {
    configurerGet({ rapprochement: rapprochementNonBasculeConsomme(), statut: statutNonBascule() });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });

    // Ces sorties d'un magasin central ont bel et bien imputé son coût : les
    // afficher à zéro ferait mentir l'écran sur un chiffre qui existe.
    expect(within(carte('Consommé')).getByText(/3\s150\s000\sFCFA/)).toBeInTheDocument();
    expect(within(carte('Facturé au chantier')).getByText('0 FCFA')).toBeInTheDocument();
    expect(within(carte('Écart entre le facturé et le reçu')).getByText('0 FCFA')).toBeInTheDocument();
  });

  it('explique POURQUOI ces deux chiffres valent zéro, plutôt que de laisser lire un rapprochement réussi', async () => {
    configurerGet({ rapprochement: rapprochementNonBasculeConsomme(), statut: statutNonBascule() });
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(
      within(carte('Écart entre le facturé et le reçu')).getByText(
        /ce zéro ne dit pas que les deux chiffres concordent/i
      )
    ).toBeInTheDocument();
    expect(within(carte('Facturé au chantier')).getByText(/il n'y a pas de période à confronter/i)).toBeInTheDocument();
  });

  it('montre les quantités consommées article par article, même sans bascule', async () => {
    configurerGet({ rapprochement: rapprochementNonBasculeConsomme(), statut: statutNonBascule() });
    monter();

    const rangee = (await screen.findByText('CIM-42', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    expect(within(rangee).getByText('240 sac')).toBeInTheDocument();
  });
});

describe('Les quantités ne sont pas des montants', () => {
  it('affiche un quart de mètre cube comme 0,25, jamais comme « 0 »', async () => {
    monter();

    const rangee = (await screen.findByText('SAB-00', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    // Le formateur monétaire arrondit à l'unité : il afficherait « 0 ».
    expect(within(rangee).getByText('0,25 m³')).toBeInTheDocument();
    expect(within(rangee).getByText('18,25 m³')).toBeInTheDocument();
    expect(within(rangee).getByText('18,5 m³')).toBeInTheDocument();
  });

  it('exprime chaque quantité dans l’unité de son article', async () => {
    monter();

    const rangee = (await screen.findByText('CIM-42', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    expect(within(rangee).getByText('800 sac')).toBeInTheDocument();
    expect(within(rangee).getByText('120 sac')).toBeInTheDocument();
    expect(within(rangee).getByText('700 sac')).toBeInTheDocument();
    expect(within(rangee).getByText('220 sac')).toBeInTheDocument();
  });
});

describe('Navigation et états', () => {
  it('lit `tenantId` et `siteId` dans le CHEMIN, pas en paramètre de requête', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/stock/reconciliation`);
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/sites/${SITE}/stock/status`);
  });

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    monter();

    expect(
      await screen.findByText('Impossible de charger le stock de ce chantier.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('un chantier sans aucun mouvement ne ressemble pas à une panne', async () => {
    configurerGet({ rapprochement: rapprochementNonBascule(), statut: statutNonBascule() });
    monter();

    expect(
      await screen.findByText('Aucun mouvement de stock ne concerne encore ce chantier.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Faire passer ce chantier au stock' })).toBeInTheDocument();
  });

  it('ne montre jamais les identifiants, seulement les libellés', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(screen.queryByText('article-ciment-01')).not.toBeInTheDocument();
    expect(screen.queryByText('lieu-kaloum-11')).not.toBeInTheDocument();
  });
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('n’affiche jamais « débit » ni « crédit », chantier passé au stock', async () => {
    monter();

    await screen.findByText('CIM-42', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('n’affiche jamais « débit » ni « crédit », chantier non basculé et confirmation ouverte', async () => {
    const user = userEvent.setup({ delay: null });
    configurerGet({ rapprochement: rapprochementNonBasculeConsomme(), statut: statutNonBascule() });
    monter();

    await user.click(
      await screen.findByRole('button', { name: 'Faire passer ce chantier au stock' }, { timeout: 8000 })
    );
    await screen.findByRole('button', { name: 'Confirmer le passage au stock' });

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  }, 15000);
});
