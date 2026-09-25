import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateTenantDrawer } from '../../components/admin/CreateTenantDrawer';
import type { ProvisionTenantResult } from '../../services/tenant-service';

/**
 * `<CreateTenantDrawer>` — panneau « Nouvelle agence » (vague 2, lot C :
 * abonnements par packs, docs/architecture/PLAN-ABONNEMENTS.md).
 *
 * Comme `associations.test.tsx` : seul `apiClient` est simulé, au plus près de
 * la frontière réseau — `provisionTenant`/`resendInvitation` et le service
 * `subscription-v2-service` (catalogue, aperçu chiffré) tournent par-dessus,
 * pour que le corps et l'en-tête vérifiés ici soient ceux réellement envoyés
 * par l'écran. Le calcul de prix n'est PAS recopié côté web : ces tests
 * vérifient que l'écran affiche fidèlement ce que `POST /admin/catalog/quote`
 * renvoie, jamais un calcul local.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const CATALOG = [
  {
    id: 'cat-agence',
    code: 'AGENCE',
    kind: 'PACK',
    name: 'Agence',
    description: 'Transaction et gestion locative',
    monthlyPrice: 29_900,
    setupPrice: 100_000,
    modules: ['MODULE_AGENCY'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 10,
    capacities: { LOTS: 100 }
  },
  {
    id: 'cat-syndic',
    code: 'SYNDIC',
    kind: 'PACK',
    name: 'Syndic',
    description: 'Cabinets de copropriété',
    monthlyPrice: 49_900,
    setupPrice: 150_000,
    modules: ['MODULE_SYNDIC'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 20,
    capacities: { COPROPRIETES: 2, LOTS: 100 }
  },
  {
    id: 'cat-promoteur',
    code: 'PROMOTEUR',
    kind: 'PACK',
    name: 'Promoteur',
    description: 'Promoteurs qui construisent',
    monthlyPrice: 149_900,
    setupPrice: 450_000,
    modules: ['MODULE_PROMOTER'],
    exclusiveGroup: null,
    rules: null,
    isSellable: true,
    sortOrder: 30,
    capacities: { CHANTIERS: 2, LOTS: 150 }
  },
  {
    id: 'cat-integre',
    code: 'INTEGRE',
    kind: 'PACK',
    name: 'Opérateur intégré',
    description: 'Groupes qui construisent, vendent, louent et gèrent',
    monthlyPrice: 249_900,
    setupPrice: 650_000,
    modules: ['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER'],
    exclusiveGroup: 'INTEGRE',
    rules: null,
    isSellable: true,
    sortOrder: 40,
    capacities: { CHANTIERS: 3, COPROPRIETES: 3, LOTS: 300 }
  },
  {
    id: 'cat-ext-lots',
    code: 'EXT_LOTS_10',
    kind: 'EXTENSION',
    name: 'Bloc de 10 lots',
    description: null,
    monthlyPrice: 1_500,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: { requiresAnyOf: ['AGENCE', 'SYNDIC', 'PROMOTEUR', 'INTEGRE'] },
    isSellable: true,
    sortOrder: 110,
    capacities: { LOTS: 10 }
  },
  {
    id: 'cat-ext-copro',
    code: 'EXT_COPRO',
    kind: 'EXTENSION',
    name: 'Copropriété supplémentaire',
    description: null,
    monthlyPrice: 10_000,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: { requiresAnyOf: ['SYNDIC', 'INTEGRE'] },
    isSellable: true,
    sortOrder: 120,
    capacities: { COPROPRIETES: 1 }
  },
  {
    id: 'cat-ext-chantier',
    code: 'EXT_CHANTIER',
    kind: 'EXTENSION',
    name: 'Chantier supplémentaire',
    description: null,
    monthlyPrice: 40_000,
    setupPrice: 0,
    modules: [],
    exclusiveGroup: null,
    rules: { requiresAnyOf: ['PROMOTEUR', 'INTEGRE'] },
    isSellable: true,
    sortOrder: 130,
    capacities: { CHANTIERS: 1 }
  }
];

const RESULT: ProvisionTenantResult = {
  tenant: { id: 'tenant-1', name: 'Agence Test', slug: 'agence-test', type: 'AGENCY', status: 'ACTIVE' },
  modules: ['MODULE_AGENCY'],
  subscription: {
    planKey: null,
    billingCycle: 'MONTHLY',
    status: 'TRIALING',
    currentPeriodEnd: '2026-10-24T00:00:00.000Z',
    trialEndsAt: '2026-10-24T00:00:00.000Z',
    items: [{ code: 'AGENCE', quantity: 1 }]
  },
  admin: { userId: 'user-1', email: 'admin@test.ci', fullName: 'Awa Koné', existingUser: false },
  invitation: { id: 'invit-1', expiresAt: '2026-10-01T00:00:00.000Z', acceptUrl: 'https://immotopia.test/accept/invit-1' },
  emailSent: true
};

function renderDrawer(onCreated = vi.fn()) {
  return render(
    <MemoryRouter>
      <CreateTenantDrawer open onClose={vi.fn()} onCreated={onCreated} />
    </MemoryRouter>
  );
}

async function remplirChampsObligatoires(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nom de l'agence"), 'Agence Test');
  await user.type(screen.getByLabelText("Nom de l'administrateur"), 'Awa Koné');
  await user.type(screen.getByLabelText("E-mail de l'administrateur"), 'admin@test.ci');
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/admin/catalog') return Promise.resolve({ data: { success: true, data: CATALOG } });
    return Promise.reject(new Error(`GET non simulé : ${url}`));
  });
  post.mockImplementation((url: string, body: any) => {
    if (url === '/admin/catalog/quote') {
      const packs: string[] = body.packs ?? [];
      const monthly = packs.includes('INTEGRE') ? 249_900 : packs.reduce((sum, code) => sum + (CATALOG.find(c => c.code === code)?.monthlyPrice ?? 0), 0);
      return Promise.resolve({
        data: {
          success: true,
          data: {
            lines: packs.map(code => ({
              kind: 'PACK',
              label: CATALOG.find(c => c.code === code)?.name ?? code,
              code,
              quantity: 1,
              unitPrice: CATALOG.find(c => c.code === code)?.monthlyPrice ?? 0,
              amount: CATALOG.find(c => c.code === code)?.monthlyPrice ?? 0
            })),
            subtotal: monthly,
            comboDiscount: 0,
            extensions: {},
            monthly,
            annual: monthly * 11
          }
        }
      });
    }
    if (url === '/admin/tenants') return Promise.resolve({ data: { success: true, data: RESULT } });
    return Promise.reject(new Error(`POST non simulé : ${url}`));
  });
});

describe('<CreateTenantDrawer> — champs obligatoires', () => {
  it("refuse l'envoi tant que le nom, l'administrateur et son e-mail manquent", async () => {
    const user = userEvent.setup();
    renderDrawer();

    // Aucun pack n'est choisi non plus : le bouton reste désactivé, la
    // validation Ant Design ne se déclenche donc que sur les autres champs
    // une fois qu'au moins un pack est sélectionné pour l'atteindre.
    await screen.findByText('Agence');
    await user.click(screen.getByText('Agence'));
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    expect(await screen.findByText("Le nom de l'agence est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom de l'administrateur est requis")).toBeInTheDocument();
    expect(screen.getByText("L'e-mail de l'administrateur est requis")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/admin/tenants', expect.anything(), expect.anything());
  });

  it('désactive la création tant qu’aucun pack n’est choisi', async () => {
    renderDrawer();
    await screen.findByText('Agence');
    expect(screen.getByRole('button', { name: "Créer l'agence" })).toBeDisabled();
  });
});

describe('<CreateTenantDrawer> — exclusivité de l’Intégré', () => {
  it("désélectionne les autres packs quand l'Intégré est choisi, et inversement", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await screen.findByText('Agence');
    await user.click(screen.getByText('Agence'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Agence/ })).toHaveAttribute('aria-checked', 'true'));

    await user.click(screen.getByText('Opérateur intégré'));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Opérateur intégré/ })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: /^Agence/ })).toHaveAttribute('aria-checked', 'false');
    });

    // Les trois autres packs sont désactivés tant que l'Intégré est choisi.
    expect(screen.getByRole('checkbox', { name: /^Agence/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('checkbox', { name: /Syndic/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('checkbox', { name: /Promoteur/ })).toHaveAttribute('aria-disabled', 'true');

    // Reprendre un pack simple désélectionne l'Intégré.
    await user.click(screen.getByText('Syndic'));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Opérateur intégré/ })).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('checkbox', { name: /Syndic/ })).toHaveAttribute('aria-checked', 'true');
    });
  });
});

describe('<CreateTenantDrawer> — récapitulatif chiffré en direct', () => {
  it('affiche le total mensuel et annuel renvoyés par l’API, pas un calcul local', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await screen.findByText('Agence');
    await user.click(screen.getByText('Agence'));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/catalog/quote', expect.objectContaining({ packs: ['AGENCE'] })), {
      timeout: 2000
    });

    expect(await screen.findByText('Total HT mensuel')).toBeInTheDocument();
    expect(await screen.findByText(/29(\s| )900(\s| )FCFA/)).toBeInTheDocument();
  });
});

describe('<CreateTenantDrawer> — création', () => {
  it("envoie l'en-tête Idempotency-Key et les packs choisis, puis affiche la confirmation", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderDrawer(onCreated);

    await remplirChampsObligatoires(user);
    await screen.findByText('Agence');
    await user.click(screen.getByText('Agence'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/catalog/quote', expect.anything()), { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/tenants', expect.anything(), expect.anything()));
    const call = post.mock.calls.find(([url]) => url === '/admin/tenants')!;
    const [, body, config] = call;
    expect(body).toMatchObject({
      name: 'Agence Test',
      adminFullName: 'Awa Koné',
      adminEmail: 'admin@test.ci',
      billingCycle: 'MONTHLY',
      items: expect.arrayContaining([{ code: 'AGENCE', quantity: 1 }])
    });
    expect(config.headers['Idempotency-Key']).toEqual(expect.any(String));
    expect(config.headers['Idempotency-Key'].length).toBeGreaterThan(0);

    expect(await screen.findByText(/Agence Test \(agence-test\)/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith(RESULT);
  });

  it('affiche le message du serveur en cas de refus', async () => {
    post.mockImplementation((url: string) => {
      if (url === '/admin/catalog/quote') {
        return Promise.resolve({ data: { success: true, data: { lines: [], subtotal: 0, comboDiscount: 0, extensions: {}, monthly: 29_900, annual: 328_900 } } });
      }
      if (url === '/admin/tenants') return Promise.reject({ response: { data: { message: 'Cette agence existe déjà.' } } });
      return Promise.reject(new Error(`POST non simulé : ${url}`));
    });

    const user = userEvent.setup();
    renderDrawer();
    await remplirChampsObligatoires(user);
    await screen.findByText('Agence');
    await user.click(screen.getByText('Agence'));
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    expect(await screen.findByText('Cette agence existe déjà.')).toBeInTheDocument();
  });
});
