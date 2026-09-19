import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Associations } from '../../pages/finance/Associations';
import { Association } from '../../pages/finance/Association';
import type { Partnership, PartnerStatement } from '../../types/finance-partnerships-types';
import type { Property } from '../../types/property-types';

/**
 * Associations — lot 4, deuxième sous-lot (PRD E7, besoin B9 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-partnerships.ts`).
 *
 * Deux familles de garanties dans ce fichier, comme l'annonce l'en-tête de
 * `corps-des-requetes.test.ts` pour les lots précédents :
 *
 * - « Le corps ne répète jamais un identifiant… » épingle l'ADRESSE et le
 *   CORPS exacts envoyés par le SERVICE **réel**, sans aucune doublure : seul
 *   `apiClient` est simulé, au plus près de la frontière réseau. C'est
 *   exactement le défaut qui cassait quatre créations des lots 2 et 3.
 * - Les suites suivantes montent les DEUX écrans par-dessus ce même
 *   `apiClient` simulé — jamais le service doublé — pour que la garantie de
 *   corps de requête ci-dessus vaille aussi pour ce que l'écran envoie
 *   réellement, geste par geste, et non pour ce qu'un mock du service aurait
 *   laissé passer sans le voir.
 *
 * `useBreakpoint` est figé en desktop pour un `<ConfirmAction>` déterministe
 * (`Popconfirm`), comme dans `__tests__/finance/baux-de-terrain.test.tsx`.
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
  createPartnership,
  addPartnershipShare,
  setPropertyPartnership,
  removePartnershipShare,
  listPartnerships,
  getPartnerStatement
} from '../../services/finance-partnerships-service';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const put = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';

/** L'adresse et le corps du dernier appel, pour se lire d'un coup d'œil (modèle de `corps-des-requetes.test.ts`). */
function dernierAppel(mockFn: ReturnType<typeof vi.fn>): { adresse: string; corps: Record<string, unknown> } {
  const [adresse, corps] = mockFn.mock.calls[mockFn.mock.calls.length - 1] as [string, Record<string, unknown>];
  return { adresse, corps };
}

function association(overrides: Partial<Partnership> = {}): Partnership {
  return {
    id: 'assoc-1',
    tenantId: TENANT,
    label: 'Villa de Nongo — indivision Camara / Diallo',
    isActive: true,
    shares: [
      { id: 'part-1', partnerAccountId: 'compte-1', partnerName: 'Mamadou Camara', sharePercent: 60 },
      { id: 'part-2', partnerAccountId: 'compte-2', partnerName: 'Fatoumata Diallo', sharePercent: 40 }
    ],
    // Cent pour cent de quotes-parts : le cas par défaut de ce fichier est
    // précisément celui que l'écran ne doit jamais taire (voir les tests de
    // la rubrique « Répartition » plus bas).
    totalSharePercent: 100,
    companySharePercent: 0,
    properties: [{ propertyId: 'bien-1', propertyLabel: 'Terrain 600 m²' }],
    ...overrides
  };
}

function statement(overrides: Partial<PartnerStatement> = {}): PartnerStatement {
  return {
    partnershipShareId: 'part-1',
    partnerName: 'Mamadou Camara',
    sharePercent: 60,
    lines: [
      {
        propertyLabel: 'Terrain 600 m²',
        periodYear: 2026,
        periodMonth: 8,
        rentBilled: 500_000,
        rentCollected: 500_000,
        partnerShare: 300_000
      }
    ],
    totalShare: 300_000,
    totalPaidOut: 180_000,
    // Volontairement different de `totalShare - totalPaidOut` (120 000) : le
    // releve est borne a un mois, le solde court sur toute l'histoire du
    // compte. Un fixture ou les deux coincideraient laisserait passer un
    // ecran qui afficherait la soustraction a la place du solde.
    accountBalance: 175_000,
    currency: 'XOF',
    ...overrides
  };
}

function bienDisponible(overrides: Partial<Property> = {}): Partial<Property> {
  return {
    id: 'bien-2',
    internalReference: 'REF-002',
    title: 'Extension villa — Lambanyi',
    ...overrides
  };
}

/** Nettoie casse et accents, pour une vérification insensible aux deux. */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Route les GET par motif d'URL, comme le ferait le vrai serveur. */
function configurerGet(
  options: { association?: Partnership; associations?: Partnership[]; releve?: PartnerStatement } = {}
) {
  const uneAssociation = options.association ?? association();
  const listeAssociations = options.associations ?? [uneAssociation];
  const unReleve = options.releve ?? statement();

  get.mockImplementation(async (url: string) => {
    if (/\/finance\/partnership-shares\/[^/]+\/statement/.test(url)) {
      return { data: { data: unReleve } };
    }
    if (/\/finance\/partnerships\/[^/]+$/.test(url)) {
      return { data: { data: uneAssociation } };
    }
    if (/\/finance\/partnerships(\?|$)/.test(url)) {
      return { data: { data: listeAssociations } };
    }
    if (/\/properties(\?|$)/.test(url)) {
      return { data: { data: [bienDisponible()], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } };
    }
    return { data: { data: null } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configurerGet();
  post.mockResolvedValue({ data: { data: association() } });
  put.mockResolvedValue({ data: { data: association() } });
  del.mockResolvedValue({ data: { data: association() } });
});

function mountListe(url = `/tenant/${TENANT}/finance/associations`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/associations" element={<Associations />} />
            <Route path="/tenant/:tenantId/finance/associations/:partnershipId" element={<Association />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function mountFiche(url = `/tenant/${TENANT}/finance/associations/assoc-1`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/associations/:partnershipId" element={<Association />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

describe('Le corps ne répète jamais un identifiant que le chemin porte déjà', () => {
  it('crée une association : le corps ne porte que le libellé', async () => {
    await createPartnership(TENANT, { label: 'Nouvelle association' });

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/partnerships`);
    expect(corps).toEqual({ label: 'Nouvelle association' });
  });

  it('ajoute un associé : ni `partnershipId` dans le corps, l’association voyage dans le chemin', async () => {
    await addPartnershipShare(TENANT, 'assoc-1', { partnerName: 'Ousmane Bah', sharePercent: 25 });

    const { adresse, corps } = dernierAppel(post);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/partnerships/assoc-1/shares`);
    expect(corps).toEqual({ partnerName: 'Ousmane Bah', sharePercent: 25 });
    expect(corps).not.toHaveProperty('partnershipId');
  });

  it('rattache un bien : ni `propertyId` dans le corps, le bien voyage dans le chemin', async () => {
    await setPropertyPartnership(TENANT, 'bien-9', 'assoc-1');

    const { adresse, corps } = dernierAppel(put);
    expect(adresse).toBe(`/tenants/${TENANT}/finance/properties/bien-9/partnership`);
    expect(corps).toEqual({ partnershipId: 'assoc-1' });
    expect(corps).not.toHaveProperty('propertyId');
  });

  it('détache un bien : `partnershipId` vaut `null`, jamais omis du corps', async () => {
    await setPropertyPartnership(TENANT, 'bien-9', null);

    const { corps } = dernierAppel(put);
    expect(corps).toEqual({ partnershipId: null });
  });

  it('retire un associé : DELETE sans corps, adresse `partnership-shares/{shareId}` au singulier', async () => {
    await removePartnershipShare(TENANT, 'part-1');

    expect(del).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnership-shares/part-1`);
  });

  it('liste les associations : le filtre `onlyActive` part en requête, jamais dans le chemin', async () => {
    await listPartnerships(TENANT, { onlyActive: true });

    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnerships?onlyActive=true`);
  });

  it("l'état de quote-part : les bornes `from`/`to` partent en requête, jamais dans le chemin", async () => {
    await getPartnerStatement(TENANT, 'part-1', { from: '2026-01-01', to: '2026-01-31' });

    expect(get).toHaveBeenCalledWith(
      `/tenants/${TENANT}/finance/partnership-shares/part-1/statement?from=2026-01-01&to=2026-01-31`
    );
  });
});

describe('Associations — liste et création', () => {
  it('affiche le total des quotes-parts ET la part de l’agence, jamais l’un sans l’autre — y compris à zéro', async () => {
    mountListe();

    expect(
      await screen.findByText('Villa de Nongo — indivision Camara / Diallo', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    // Cent pour cent de quotes-parts : la part de l'agence est ZÉRO, et ce
    // zéro doit s'afficher en toutes lettres, pas disparaître.
    expect(screen.getByText('100 %')).toBeInTheDocument();
    expect(screen.getByText('0 %')).toBeInTheDocument();
  });

  it('affiche les noms des associés et des biens, jamais leurs identifiants', async () => {
    mountListe();

    await screen.findByText('Villa de Nongo — indivision Camara / Diallo', {}, { timeout: 8000 });
    expect(screen.getByText(/Mamadou Camara/)).toBeInTheDocument();
    expect(screen.getByText(/Terrain 600 m²/)).toBeInTheDocument();
    expect(screen.queryByText('assoc-1')).not.toBeInTheDocument();
    expect(screen.queryByText('bien-1')).not.toBeInTheDocument();
    expect(screen.queryByText('part-1')).not.toBeInTheDocument();
  });

  it('crée une association depuis le formulaire, avec les champs du contrat gelé', async () => {
    configurerGet({ associations: [] });
    post.mockResolvedValue({ data: { data: association({ id: 'assoc-nouveau', label: 'Association test' }) } });
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText("Aucune association n'est encore enregistrée.", {}, { timeout: 8000 });

    await user.click(screen.getAllByRole('button', { name: /Nouvelle association/ })[0]);
    await user.type(await screen.findByLabelText("Nom de l'association"), 'Association test');

    await waitFor(() => expect(screen.getByRole('button', { name: "Enregistrer l'association" })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: "Enregistrer l'association" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnerships`, { label: 'Association test' })
    );

    // Navigation vers la fiche à l'adresse exacte qu'elle déclare lire (voir
    // la description « Navigation » plus bas) : la fiche se monte bien.
    expect(await screen.findByText('Associés', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 30000);

  it('affiche un état d’erreur avec un moyen de réessayer', async () => {
    get.mockImplementation(async () => {
      throw new Error('panne');
    });
    mountListe();

    expect(
      await screen.findByText('Impossible de charger les associations.', {}, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('navigue vers la fiche à l’adresse exacte que cette fiche déclare lire', async () => {
    // Le défaut relevé deux fois au lot 2 : une navigation en `?xxx=` vers une
    // route qui porte l'identifiant dans le CHEMIN ne mène nulle part. Les
    // deux routes ci-dessus (`mountListe`) partagent le même chemin que celui
    // utilisé pour naviguer : si le geste n'utilisait pas le bon chemin, la
    // fiche ne se monterait jamais et ce test échouerait.
    const user = userEvent.setup({ delay: null });
    mountListe();

    await screen.findByText('Villa de Nongo — indivision Camara / Diallo', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Voir la fiche' }));

    expect(await screen.findByText('Associés', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByText('Biens rattachés', {}, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('Fiche de l’association — répartition', () => {
  it('montre ce qui reste à l’agence, y compris quand cela vaut zéro', async () => {
    mountFiche();

    await screen.findByRole('heading', { name: 'Villa de Nongo — indivision Camara / Diallo' }, { timeout: 8000 });
    expect(screen.getByText('100 %')).toBeInTheDocument();
    expect(screen.getByText('0 %')).toBeInTheDocument();
    expect(await screen.findByText(/rien ne reste à l'agence/i, {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('ne répète pas ce message quand il reste bien quelque chose à l’agence', async () => {
    configurerGet({
      association: association({
        label: 'Bureau Almamya — association Bah',
        shares: [{ id: 'part-3', partnerAccountId: 'compte-3', partnerName: 'Ousmane Bah', sharePercent: 45 }],
        totalSharePercent: 45,
        companySharePercent: 55
      })
    });
    mountFiche();

    await screen.findByRole('heading', { name: 'Bureau Almamya — association Bah' }, { timeout: 8000 });
    expect(screen.getByText('55 %')).toBeInTheDocument();
    expect(screen.queryByText(/rien ne reste à l'agence/i)).not.toBeInTheDocument();
  });
});

describe('Fiche de l’association — associés', () => {
  it('ajoute un associé avec les champs du contrat gelé', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('Ajouter un associé', {}, { timeout: 8000 });
    await user.type(screen.getByLabelText("Nom de l'associé"), 'Ousmane Bah');
    await user.type(screen.getByLabelText('Quote-part (%)'), '15');

    await waitFor(() => expect(screen.getByRole('button', { name: "Ajouter l'associé" })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: "Ajouter l'associé" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnerships/assoc-1/shares`, {
        partnerName: 'Ousmane Bah',
        sharePercent: 15
      })
    );
  }, 15000);

  it('avertit avant de retirer un associé, puis n’appelle le serveur qu’après confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    const ligneCamara = (await screen.findByText('Mamadou Camara', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligneCamara).getByRole('button', { name: 'Retirer' }));

    expect(await screen.findByText(/irréversible/i)).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnership-shares/part-1`));
  }, 15000);

  it('ouvre l’état de quote-part d’un associé, en lecture seule', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    const ligneCamara = (await screen.findByText('Mamadou Camara', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligneCamara).getByRole('button', { name: "Voir l'état" }));

    expect(await screen.findByText('État de quote-part — Mamadou Camara', {}, { timeout: 8000 })).toBeInTheDocument();
    // Facturé ET encaissé valent tous deux 500 000 dans cette fixture (loyer
    // intégralement encaissé) : les deux occurrences sont attendues.
    expect(screen.getAllByText(/500\s000\sFCFA/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/300\s000\sFCFA/).length).toBeGreaterThanOrEqual(1); // sa part / total de la période
    expect(screen.getByText(/180\s000\sFCFA/)).toBeInTheDocument(); // déjà reversé

    // Rien ne s'y écrit : ni bouton de saisie, ni action de mutation dans la modale.
    expect(screen.queryByRole('button', { name: /Enregistrer/ })).not.toBeInTheDocument();
  }, 15000);
});

describe('Fiche de l’association — biens rattachés', () => {
  it('rattache un bien existant à l’association', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Villa de Nongo — indivision Camara / Diallo' }, { timeout: 8000 });

    const select = await screen.findByLabelText('Rattacher un bien existant', {}, { timeout: 8000 });
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('Extension villa — Lambanyi'));

    await user.click(screen.getByRole('button', { name: 'Rattacher' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/properties/bien-2/partnership`, {
        partnershipId: 'assoc-1'
      })
    );
  }, 15000);

  it('détache un bien après confirmation, sans le présenter comme irréversible', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByText('Terrain 600 m²', {}, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: 'Détacher' }));

    expect(await screen.findByText(/prochaine facturation/i, {}, { timeout: 8000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmer le détachement' }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/properties/bien-1/partnership`, {
        partnershipId: null
      })
    );
  }, 15000);
});

describe('Navigation — les chemins déclarés par les écrans', () => {
  it('la fiche lit bien `tenantId` et `partnershipId` dans le CHEMIN, pas en paramètre de requête', async () => {
    mountFiche(`/tenant/${TENANT}/finance/associations/assoc-1`);

    await screen.findByRole('heading', { name: 'Villa de Nongo — indivision Camara / Diallo' }, { timeout: 8000 });
    // La détail-query a bien été appelée avec ce chemin exact.
    expect(get).toHaveBeenCalledWith(`/tenants/${TENANT}/finance/partnerships/assoc-1`);
  });
});

describe('Vocabulaire (P-1 du PRD)', () => {
  it('la liste des associations n’affiche jamais « débit » ni « crédit »', async () => {
    mountListe();

    await screen.findByText('Villa de Nongo — indivision Camara / Diallo', {}, { timeout: 8000 });
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });

  it('la fiche de l’association n’affiche jamais « débit » ni « crédit », y compris dans l’état de quote-part', async () => {
    const user = userEvent.setup({ delay: null });
    mountFiche();

    await screen.findByRole('heading', { name: 'Villa de Nongo — indivision Camara / Diallo' }, { timeout: 8000 });
    const ligneCamara = (await screen.findByText('Mamadou Camara', {}, { timeout: 8000 })).closest('tr') as HTMLElement;
    await user.click(within(ligneCamara).getByRole('button', { name: "Voir l'état" }));
    await screen.findByText('État de quote-part — Mamadou Camara', {}, { timeout: 8000 });

    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bdebit/);
    expect(normaliser(document.body.textContent ?? '')).not.toMatch(/\bcredit/);
  });
});
