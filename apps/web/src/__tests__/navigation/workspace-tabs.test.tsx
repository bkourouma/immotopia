import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceTabs } from '../../components/navigation/WorkspaceTabs';
import type { WorkspaceTabItem } from '../../components/navigation/WorkspaceTabs';

/**
 * `<WorkspaceTabs>` relie des ROUTES existantes, pas des panneaux locaux :
 * chaque onglet est un `<a href>` réel, l'onglet actif se déduit du chemin
 * courant (préfixe le plus long, même règle que la sidebar) et le focus se
 * déplace aux flèches sans jamais naviguer tout seul.
 */

const ITEMS: WorkspaceTabItem[] = [
  { key: 'fiche', label: 'Fiche', href: '/tenant/t1/syndics/s1' },
  { key: 'lots', label: 'Lots', href: '/tenant/t1/syndics/s1/lots' },
  { key: 'prestataires', label: 'Prestataires', href: '/tenant/t1/syndics/s1/prestataires' }
];

function renderTabs(path: string, items: WorkspaceTabItem[] = ITEMS) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceTabs items={items} ariaLabel="Sections de la copropriété" />
    </MemoryRouter>
  );
}

describe('WorkspaceTabs', () => {
  it('rend un tablist avec un onglet — lien réel — par entrée', () => {
    renderTabs('/tenant/t1/syndics/s1');

    const tablist = screen.getByRole('tablist', { name: 'Sections de la copropriété' });
    expect(tablist).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.textContent)).toEqual(['Fiche', 'Lots', 'Prestataires']);
    // Chaque onglet est un <a href> : clic milieu, nouvel onglet, etc.
    expect(tabs[1].tagName).toBe('A');
    expect(tabs[1]).toHaveAttribute('href', '/tenant/t1/syndics/s1/lots');
  });

  it('marque actif l’onglet dont l’URL est un préfixe du chemin courant', () => {
    renderTabs('/tenant/t1/syndics/s1/lots');

    expect(screen.getByRole('tab', { name: 'Fiche' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Lots' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Prestataires' })).toHaveAttribute('aria-selected', 'false');
  });

  it('rattache une sous-route à l’onglet dont elle prolonge le chemin', () => {
    // /lots/:lotId/compte n'a pas son propre onglet : il reste sous « Lots ».
    renderTabs('/tenant/t1/syndics/s1/lots/lot-42/compte');

    expect(screen.getByRole('tab', { name: 'Lots' })).toHaveAttribute('aria-selected', 'true');
  });

  it('allume un onglet sur un chemin déclaré dans son `activeFor`', () => {
    // La facture d'un fournisseur vit hors de /fournisseurs mais relève de
    // cet onglet.
    renderTabs('/tenant/t1/finance/factures-fournisseurs', [
      {
        key: 'fournisseurs',
        label: 'Fournisseurs',
        href: '/tenant/t1/finance/fournisseurs',
        activeFor: ['/tenant/t1/finance/factures-fournisseurs']
      },
      { key: 'balance', label: 'Balance fournisseurs', href: '/tenant/t1/finance/fournisseurs/balance' }
    ]);

    expect(screen.getByRole('tab', { name: 'Fournisseurs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Balance fournisseurs' })).toHaveAttribute('aria-selected', 'false');
  });

  it('ne garde qu’un seul onglet dans l’ordre de tabulation (roving tabindex)', () => {
    renderTabs('/tenant/t1/syndics/s1/prestataires');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });

  it('déplace le focus aux flèches sans naviguer', async () => {
    const user = userEvent.setup();
    renderTabs('/tenant/t1/syndics/s1');

    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    expect(tabs[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(tabs[2]).toHaveFocus();

    // La liste boucle : après le dernier onglet, Flèche droite revient au premier.
    await user.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(tabs[2]).toHaveFocus();

    await user.keyboard('{End}');
    expect(tabs[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveFocus();

    // L'URL affichée par MemoryRouter n'a pas bougé : les flèches déplacent le
    // focus, elles n'activent pas le lien.
    expect(screen.getByRole('tab', { name: 'Fiche' })).toHaveAttribute('aria-selected', 'true');
  });

  it('inverse le sens des flèches en RTL', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/tenant/t1/syndics/s1']}>
        <div dir="rtl">
          <WorkspaceTabs items={ITEMS} ariaLabel="Sections de la copropriété" />
        </div>
      </MemoryRouter>
    );

    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    // En RTL, la flèche gauche avance visuellement vers la droite : elle doit
    // déplacer le focus vers l'onglet SUIVANT, pas le précédent.
    await user.keyboard('{ArrowLeft}');
    expect(tabs[1]).toHaveFocus();
  });

  it("n'affiche rien quand la liste d'onglets est vide", () => {
    const { container } = renderTabs('/tenant/t1/syndics/s1', []);
    expect(container).toBeEmptyDOMElement();
  });
});
