import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CreateTenantDrawer } from '../../components/admin/CreateTenantDrawer';
import type { ProvisionTenantResult } from '../../services/tenant-service';

/**
 * `<CreateTenantDrawer>` — panneau « Nouvelle agence » (lot F, plan §F3).
 *
 * Comme `associations.test.tsx` : seul `apiClient` est simulé, au plus près de
 * la frontière réseau — `provisionTenant`/`resendInvitation` (le service
 * réel) tournent par-dessus, pour que le corps et l'en-tête vérifiés ici
 * soient ceux réellement envoyés par l'écran.
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

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const RESULT: ProvisionTenantResult = {
  tenant: { id: 'tenant-1', name: 'Agence Test', slug: 'agence-test', type: 'AGENCY', status: 'ACTIVE' },
  modules: ['MODULE_AGENCY'],
  subscription: {
    planKey: 'PRO',
    billingCycle: 'MONTHLY',
    status: 'TRIALING',
    currentPeriodEnd: '2026-10-24T00:00:00.000Z'
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
});

describe('<CreateTenantDrawer> — champs obligatoires', () => {
  it("refuse l'envoi tant que le nom, l'administrateur et son e-mail manquent", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    expect(await screen.findByText("Le nom de l'agence est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom de l'administrateur est requis")).toBeInTheDocument();
    expect(screen.getByText("L'e-mail de l'administrateur est requis")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('affiche « Pro » présélectionnée pour l’offre', () => {
    renderDrawer();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });
});

describe('<CreateTenantDrawer> — modules par défaut selon le type', () => {
  it('ne coche que « Agence » pour une agence, et les trois modules pour un opérateur', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByText("Plus d'options"));

    const agencyBox = await screen.findByRole('checkbox', { name: 'Agence' });
    const syndicBox = screen.getByRole('checkbox', { name: 'Syndic' });
    const promoterBox = screen.getByRole('checkbox', { name: 'Promoteur' });

    expect(agencyBox).toBeChecked();
    expect(syndicBox).not.toBeChecked();
    expect(promoterBox).not.toBeChecked();

    // AntD masque le vrai `<input type="radio">` (`pointer-events: none`,
    // `opacity: 0`, en dessous du bouton stylé) : dans un vrai navigateur, le
    // clic arrive sur le `<label>` visible, qui délègue nativement à l'input
    // qu'il enveloppe. `userEvent` respecte `pointer-events`, donc cliquer la
    // cible ARIA (l'input) échoue là où cliquer son libellé visible réussit —
    // exactement le geste d'un utilisateur réel.
    await user.click(screen.getByText('Opérateur'));

    expect(agencyBox).toBeChecked();
    expect(syndicBox).toBeChecked();
    expect(promoterBox).toBeChecked();
  });
});

describe('<CreateTenantDrawer> — création', () => {
  it("envoie l'en-tête Idempotency-Key et le corps attendu, puis affiche la confirmation", async () => {
    post.mockResolvedValue({ data: { success: true, data: RESULT } });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    renderDrawer(onCreated);

    await remplirChampsObligatoires(user);
    // Ouvre « Plus d'options » : un `Form.Item` sous un panneau replié ne
    // s'enregistre qu'à son montage (comportement AntD), donc `billingCycle`
    // ne porterait sa valeur par défaut que si le panneau a été ouvert au
    // moins une fois avant l'envoi.
    await user.click(screen.getByText("Plus d'options"));
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('/admin/tenants');
    expect(body).toMatchObject({
      name: 'Agence Test',
      adminFullName: 'Awa Koné',
      adminEmail: 'admin@test.ci',
      planKey: 'PRO',
      billingCycle: 'MONTHLY',
      type: 'AGENCY',
      modules: ['MODULE_AGENCY']
    });
    expect(config.headers['Idempotency-Key']).toEqual(expect.any(String));
    expect(config.headers['Idempotency-Key'].length).toBeGreaterThan(0);

    // Le titre du panneau ET le message de l'alerte affichent tous deux
    // « Agence créée » : la description, elle, est unique.
    expect(await screen.findByText(/Agence Test \(agence-test\)/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(onCreated).toHaveBeenCalledWith(RESULT);
  });

  it("copie le lien d'invitation dans le presse-papiers", async () => {
    post.mockResolvedValue({ data: { success: true, data: RESULT } });

    const user = userEvent.setup();
    renderDrawer();
    await remplirChampsObligatoires(user);
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    // `{ name: /Copier/ }`, pas le texte exact : l'icône du bouton porte son
    // propre `aria-label="copy"`, et le nom accessible du bouton concatène
    // les deux (« copy Copier »).
    const copyButton = await screen.findByRole('button', { name: /Copier/ });

    // Le presse-papiers n'est simulé qu'ICI, après le rendu de la
    // confirmation : le défini plus tôt (avant la saisie du formulaire)
    // perturbait `userEvent.type`, qui consulte `navigator.clipboard` pour
    // son propre fonctionnement interne.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(RESULT.invitation.acceptUrl);
  });

  it("affiche un message clair quand l'e-mail n'est pas parti", async () => {
    post.mockResolvedValue({ data: { success: true, data: { ...RESULT, emailSent: false } } });

    const user = userEvent.setup();
    renderDrawer();
    await remplirChampsObligatoires(user);
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    expect(
      await screen.findByText("L'e-mail n'a pas pu être envoyé — copiez le lien et transmettez-le vous-même.")
    ).toBeInTheDocument();
  });

  it('affiche le message du serveur en cas de refus', async () => {
    post.mockRejectedValue({ response: { data: { message: 'Cette agence existe déjà.' } } });

    const user = userEvent.setup();
    renderDrawer();
    await remplirChampsObligatoires(user);
    await user.click(screen.getByRole('button', { name: "Créer l'agence" }));

    expect(await screen.findByText('Cette agence existe déjà.')).toBeInTheDocument();
  });
});
