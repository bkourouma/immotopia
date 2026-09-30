import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Contacts } from '../../pages/crm/Contacts';

/**
 * ANO-22, recette du 20 septembre 2026 (« Du chantier à la location »,
 * étape D.1) — MAJEUR, revérifié bloquant.
 *
 * La modale « Créer un nouveau contact » ne se démontait jamais entre deux
 * ouvertures : `ContactForm` restait monté sous elle, invisible, en gardant
 * son état — l'onglet actif et les valeurs déjà tapées. Rouvrir la modale
 * pour un DEUXIÈME contact affichait donc encore le PREMIER, y compris après
 * « Annuler ». Avec huit contacts à créer à la suite (D.1), ce défaut
 * bloquait toute la suite du parcours : D.2 (huit baux), E (encaissements),
 * F et G en dépendent tous.
 *
 * La modale d'édition n'a jamais eu ce défaut : elle ne rend `ContactForm`
 * que lorsqu'un contact est en cours d'édition, ce qui le démonte déjà à la
 * fermeture. Seule celle de création manquait `destroyOnHidden`.
 */

const listContacts = vi.fn();
const createContact = vi.fn();
const updateContact = vi.fn();
const listTags = vi.fn();
const deleteContact = vi.fn();

vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({ success: true, data: [] }))
}));
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: vi.fn(async () => ({ enforcement: 'warn' }))
}));

vi.mock('../../services/crm-service', () => ({
  listContacts: (...a: unknown[]) => listContacts(...a),
  createContact: (...a: unknown[]) => createContact(...a),
  updateContact: (...a: unknown[]) => updateContact(...a),
  createActivity: vi.fn(),
  listTags: (...a: unknown[]) => listTags(...a),
  deleteContact: (...a: unknown[]) => deleteContact(...a)
}));

// Sélecteur de commune réduit à un bouton : la recherche géographique n'est
// pas le sujet ici, seule compte la valeur `communeId` qu'il pose dans le formulaire.
vi.mock('../../components/ui/location-selector', () => ({
  LocationSelector: ({ onChange }: { onChange?: (loc: { communeId: string }) => void }) => (
    <button type="button" onClick={() => onChange?.({ communeId: 'commune-cocody' })}>
      Choisir Cocody
    </button>
  )
}));
vi.mock('../../services/geographic-service', () => ({
  getLocationByCommuneId: vi.fn(async () => null),
  searchLocations: vi.fn(async () => [])
}));

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/crm/contacts']}>
          <Routes>
            <Route path="/tenant/:tenantId/crm/contacts" element={<Contacts />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/**
 * Force la fin de l'animation de fermeture d'une `<Modal>` Ant Design.
 *
 * `destroyOnHidden` ne démonte le contenu qu'UNE FOIS l'animation de sortie
 * terminée — `rc-motion` attend un véritable événement `transitionend`, que
 * jsdom ne déclenche jamais tout seul. Sans ce geste, la modale resterait
 * pour toujours dans les classes `ant-zoom-leave-active`, et un test qui
 * attendrait sa disparition échouerait même sur le code CORRIGÉ — un faux
 * négatif qui aurait masqué le vrai résultat plutôt que de le montrer.
 */
async function terminerLAnimationDeFermeture() {
  // Un battement : React doit d'abord re-rendre avec `open=false` et poser
  // les classes `ant-zoom-leave*` avant qu'un `transitionend` signifie quoi
  // que ce soit pour `rc-motion`. Sans lui, l'événement arrive sur la modale
  // encore dans son état ouvert, et ne fait rien.
  await new Promise(resolve => setTimeout(resolve, 50));
  const modaleEnCoursDeFermeture = document.querySelector('.ant-modal-wrap .ant-modal');
  if (modaleEnCoursDeFermeture) {
    fireEvent.transitionEnd(modaleEnCoursDeFermeture);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  listContacts.mockResolvedValue({
    success: true,
    contacts: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }
  });
  listTags.mockResolvedValue({ success: true, data: [] });
});

describe('Contacts — la modale de création se réinitialise entre deux ouvertures', { timeout: 150_000 }, () => {
  it('REPART VIERGE au deuxième « Nouveau contact », même après avoir tapé un premier et cliqué « Annuler »', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByRole('button', { name: /Nouveau contact/i }, { timeout: 8000 });

    // Premier contact : on ouvre, on tape un prénom, on clique « Annuler » —
    // exactement le geste rapporté en recette.
    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    const prenom = await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });
    await user.type(prenom, 'Aminata');
    expect(prenom).toHaveValue('Aminata');

    await user.click(screen.getByRole('button', { name: /^Annuler$/i }));
    await terminerLAnimationDeFermeture();
    await waitFor(() => expect(screen.queryByLabelText(/Prénom/i)).not.toBeInTheDocument(), { timeout: 8000 });

    // Deuxième contact : la modale ne doit porter AUCUNE trace du premier.
    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    const prenomDeuxieme = await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });

    expect(prenomDeuxieme).toHaveValue('');
  });

  it("REPART SUR LE PREMIER ONGLET, même si le contact précédent a changé d'onglet", async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByRole('button', { name: /Nouveau contact/i }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });

    // On change d'onglet — n'importe lequel autre que le premier suffit à
    // reproduire le symptôme rapporté (« rouvre sur l'onglet Professionnel »).
    const onglets = screen.getAllByRole('tab');
    expect(onglets.length).toBeGreaterThan(1);
    await user.click(onglets[1]);
    await waitFor(() => expect(onglets[1]).toHaveAttribute('aria-selected', 'true'));

    await user.click(screen.getByRole('button', { name: /^Annuler$/i }));
    await terminerLAnimationDeFermeture();
    await waitFor(() => expect(screen.queryByLabelText(/Prénom/i)).not.toBeInTheDocument(), { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });

    const ongletsApres = screen.getAllByRole('tab');
    expect(ongletsApres[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('REPART VIERGE après une CRÉATION réussie, pas seulement après « Annuler »', async () => {
    createContact.mockResolvedValue({ success: true, data: { id: 'contact-1' } });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByRole('button', { name: /Nouveau contact/i }, { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    const prenom = await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });
    await user.type(prenom, 'Yao');
    await user.type(await screen.findByLabelText(/^Nom$/i), 'Bernard');
    await user.type(await screen.findByLabelText(/Email personnel/i), 'yao.bernard@example.ci');
    await user.click(screen.getByRole('tab', { name: 'Contact' }));
    await user.click(await screen.findByRole('button', { name: 'Choisir Cocody' }));

    await user.click(screen.getByRole('button', { name: /Créer le contact|Enregistrer/i }));
    await waitFor(() => expect(createContact).toHaveBeenCalledTimes(1), { timeout: 8000 });
    await terminerLAnimationDeFermeture();
    await waitFor(() => expect(screen.queryByLabelText(/Prénom/i)).not.toBeInTheDocument(), { timeout: 8000 });

    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    const prenomSuivant = await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 });
    expect(prenomSuivant).toHaveValue('');
  });

  /**
   * BUG-2026-09-30-015 : Ant Design Tabs ne monte que l'onglet ouvert, donc la
   * règle « commune requise » (onglet Contact) ne s'exécutait jamais si cet
   * onglet n'avait pas été ouvert : le contact se créait sans commune.
   */
  it('REFUSE un contact sans commune, même si l’onglet « Contact » n’a jamais été ouvert', async () => {
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByRole('button', { name: /Nouveau contact/i }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    await user.type(await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 }), 'Awa');
    await user.type(await screen.findByLabelText(/^Nom$/i), 'Konan');
    await user.type(await screen.findByLabelText(/Email personnel/i), 'awa.konan@example.ci');

    await user.click(screen.getByRole('button', { name: /Créer le contact|Enregistrer/i }));

    expect(await screen.findByText('La commune est requise', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(createContact).not.toHaveBeenCalled();
    // Le formulaire ouvre l'onglet fautif pour que l'erreur soit visible.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Contact' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('AFFICHE sur le champ e-mail le refus 409 d’un doublon, et ouvre l’onglet du champ', async () => {
    createContact.mockRejectedValue({
      response: {
        status: 409,
        data: { errors: [{ field: 'email', message: 'Un contact avec cet e-mail existe déjà' }] }
      }
    });
    const user = userEvent.setup({ delay: null });
    mount();

    await screen.findByRole('button', { name: /Nouveau contact/i }, { timeout: 8000 });
    await user.click(screen.getByRole('button', { name: /Nouveau contact/i }));
    await user.type(await screen.findByLabelText(/Prénom/i, {}, { timeout: 8000 }), 'Awa');
    await user.type(await screen.findByLabelText(/^Nom$/i), 'Konan');
    await user.type(await screen.findByLabelText(/Email personnel/i), 'awa@example.ci');
    await user.click(screen.getByRole('tab', { name: 'Contact' }));
    await user.click(await screen.findByRole('button', { name: 'Choisir Cocody' }));
    await user.click(screen.getByRole('button', { name: /Créer le contact|Enregistrer/i }));

    await waitFor(() => expect(createContact).toHaveBeenCalledTimes(1), { timeout: 8000 });
    expect((await screen.findAllByText('Un contact avec cet e-mail existe déjà')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Basique' })).toHaveAttribute('aria-selected', 'true'));
  });
});
