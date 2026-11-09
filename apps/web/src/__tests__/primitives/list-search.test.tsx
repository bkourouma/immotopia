import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListSearch, type ListSearchProps } from '../../components/primitives/ListSearch';
import type { SearchCriterion, SearchValues } from '../../utils/list-search/types';

/**
 * `<ListSearch>` au-dessus de 992 px : champ libre, critères en ligne,
 * « Plus de critères », puces, effacement et compteur.
 *
 * La barre ne reçoit que des props : ici des valeurs statiques et des
 * `vi.fn()`, jamais un hook d'URL.
 */

const isDesktop = vi.hoisted(() => ({ value: true }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: isDesktop.value ? 'lg' : 'xs',
    isMobile: !isDesktop.value,
    isTablet: false,
    isDesktop: isDesktop.value
  })
}));

const CRITERIA: SearchCriterion[] = [
  { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Nom, e-mail, téléphone…' },
  {
    key: 'status',
    type: 'multiSelect',
    label: 'Statut',
    primary: true,
    options: [
      { value: 'ACTIVE', label: 'Actif' },
      { value: 'DISABLED', label: 'Désactivé' }
    ]
  },
  {
    key: 'kind',
    type: 'select',
    label: 'Type de bien',
    primary: true,
    options: [
      { value: 'VILLA', label: 'Villa' },
      { value: 'STUDIO', label: 'Studio' }
    ]
  },
  { key: 'period', type: 'dateRange', label: 'Période' },
  { key: 'amount', type: 'numberRange', label: 'Montant', unit: 'FCFA' },
  { key: 'late', type: 'boolean', label: 'En retard' }
];

function setup(overrides: Partial<ListSearchProps> = {}) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  const props: ListSearchProps = {
    criteria: CRITERIA,
    values: {},
    onChange,
    onClear,
    activeCount: 0,
    ...overrides
  };
  const utils = render(<ListSearch {...props} />);
  const rerender = (next: Partial<ListSearchProps>) => utils.rerender(<ListSearch {...props} {...next} />);
  return { ...utils, onChange, onClear, rerender };
}

beforeEach(() => {
  isDesktop.value = true;
});

describe('ListSearch — structure', () => {
  it('rend une région de recherche nommée « Rechercher » par défaut', () => {
    setup();
    expect(screen.getByRole('search', { name: 'Rechercher' })).toBeInTheDocument();
  });

  it("accepte un nom accessible propre à l'écran", () => {
    setup({ 'aria-label': 'Rechercher un locataire' });
    expect(screen.getByRole('search', { name: 'Rechercher un locataire' })).toBeInTheDocument();
  });

  it('place le champ libre en premier, avec un nom accessible', () => {
    setup();
    const search = screen.getByRole('search');
    const first = within(search).getAllByRole('textbox')[0];
    expect(first).toBe(screen.getByRole('textbox', { name: 'Recherche' }));
    expect(first).toHaveAttribute('placeholder', 'Nom, e-mail, téléphone…');
  });

  it('affiche les critères primaires en ligne et range les autres sous « Plus de critères »', async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.getByRole('combobox', { name: 'Statut' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Type de bien' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Montant minimum' })).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: /Plus de critères/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveAttribute('aria-controls', screen.getByRole('group', { name: 'Plus de critères' }).id);
    expect(screen.getByRole('spinbutton', { name: 'Montant minimum' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Montant maximum' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'En retard' })).toBeInTheDocument();
  });

  it('respecte maxInline : les primaires en trop passent sous « Plus de critères »', async () => {
    const user = userEvent.setup();
    setup({ maxInline: 1 });
    expect(screen.getByRole('combobox', { name: 'Statut' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Type de bien' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Plus de critères/ }));
    expect(screen.getByRole('combobox', { name: 'Type de bien' })).toBeInTheDocument();
  });

  it('indique le nombre de critères secondaires actifs sur le bouton', () => {
    setup({
      values: { amount: { min: 10 }, late: true },
      activeCount: 2
    });
    expect(screen.getByRole('button', { name: 'Plus de critères (2)' })).toBeInTheDocument();
  });

  it("n'affiche pas « Plus de critères » quand tout tient en ligne", () => {
    setup({ criteria: CRITERIA.slice(0, 3) });
    expect(screen.queryByRole('button', { name: /Plus de critères/ })).not.toBeInTheDocument();
  });

  it('replie le panneau avec Échap et rend le focus au bouton', async () => {
    const user = userEvent.setup();
    setup();
    const more = screen.getByRole('button', { name: /Plus de critères/ });
    await user.click(more);
    await user.click(screen.getByRole('spinbutton', { name: 'Montant minimum' }));
    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
    expect(screen.queryByRole('spinbutton', { name: 'Montant minimum' })).not.toBeInTheDocument();
  });

  it('loge le contenu `extra` dans la ligne principale', () => {
    setup({ extra: <button type="button">Exporter</button> });
    expect(within(screen.getByRole('search')).getByRole('button', { name: 'Exporter' })).toBeInTheDocument();
  });
});

describe('ListSearch — champ libre', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("n'applique la frappe qu'une fois, 300 ms après la dernière touche, en remplaçant l'historique", () => {
    vi.useFakeTimers();
    const { onChange } = setup();
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    // Une frappe lettre à lettre : chaque lettre relance le délai.
    for (const value of ['v', 'vi', 'vil', 'vill', 'villa']) {
      fireEvent.change(input, { target: { value } });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: 'villa' }, { replace: true });
  });

  it('applique tout de suite sur Entrée, sans second appel après le délai', () => {
    vi.useFakeTimers();
    const { onChange } = setup();
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    fireEvent.change(input, { target: { value: 'villa' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: 'villa' }, { replace: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('vide le champ sur Échap et applique le vide immédiatement', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ values: { q: 'villa' }, activeCount: 1 });
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    expect(input).toHaveValue('villa');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ q: undefined }, { replace: true });
  });

  it("se resynchronise quand la valeur change de l'extérieur", () => {
    const { rerender } = setup({ values: { q: 'villa' }, activeCount: 1 });
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    expect(input).toHaveValue('villa');
    rerender({ values: {}, activeCount: 0 });
    expect(input).toHaveValue('');
    rerender({ values: { q: 'studio' }, activeCount: 1 });
    expect(input).toHaveValue('studio');
  });

  it("n'écrase pas une frappe en cours quand le parent renvoie une valeur déjà connue", async () => {
    const user = userEvent.setup();
    const { rerender } = setup();
    const input = screen.getByRole('textbox', { name: 'Recherche' });
    await user.type(input, 'abc');
    rerender({ values: {}, activeCount: 0 });
    expect(input).toHaveValue('abc');
  });

  it('ne crée pas de puce pour le champ libre (déjà visible dans son champ)', () => {
    setup({ values: { q: 'villa' }, activeCount: 1 });
    expect(screen.queryByRole('button', { name: /Retirer le critère Recherche/ })).not.toBeInTheDocument();
  });
});

describe('ListSearch — puces, effacement et compteur', () => {
  const VALUES: SearchValues = {
    q: 'villa',
    status: ['ACTIVE', 'DISABLED'],
    kind: 'VILLA',
    period: { from: '2026-01-01', to: '2026-01-31' },
    amount: { min: 10000, max: 50000 },
    late: true
  };

  it('écrit des puces lisibles pour chaque type de critère actif', () => {
    setup({ values: VALUES, activeCount: 6 });
    const search = screen.getByRole('search');
    expect(within(search).getByText('Statut : Actif, Désactivé')).toBeInTheDocument();
    expect(within(search).getByText('Type de bien : Villa')).toBeInTheDocument();
    expect(within(search).getByTitle('Période : du 01/01/2026 au 31/01/2026')).toBeInTheDocument();
    expect(within(search).getByTitle(/^Montant : 10\s000\s–\s50\s000\sFCFA$/)).toBeInTheDocument();
    // Dates et nombres sont isolés pour ne pas se retourner en arabe.
    expect(search.querySelectorAll('bdi').length).toBe(2);
    expect(within(search).getByText('En retard')).toBeInTheDocument();
  });

  it('écrit les bornes ouvertes des dates et des nombres', () => {
    setup({
      values: { period: { from: '2026-02-01' }, amount: { max: 900 } },
      activeCount: 2
    });
    expect(screen.getByTitle('Période : à partir du 01/02/2026')).toBeInTheDocument();
    expect(screen.getByTitle(/^Montant : ≤ 900 FCFA$/)).toBeInTheDocument();
    setup({ values: { period: { to: '2026-02-28' }, amount: { min: 5 } }, activeCount: 2 });
    expect(screen.getByTitle("Période : jusqu'au 28/02/2026")).toBeInTheDocument();
    expect(screen.getByTitle(/^Montant : ≥ 5 FCFA$/)).toBeInTheDocument();
  });

  it('écrit « En retard : Non » pour un booléen à trois états défini sur faux', () => {
    setup({
      criteria: [{ key: 'late', type: 'boolean', label: 'En retard', tristate: true }],
      values: { late: false },
      activeCount: 1
    });
    expect(screen.getByText('En retard : Non')).toBeInTheDocument();
  });

  it('retire un critère avec sa puce', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ values: VALUES, activeCount: 6 });
    await user.click(screen.getByRole('button', { name: 'Retirer le critère Statut' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ status: undefined });
  });

  it('efface tous les critères', async () => {
    const user = userEvent.setup();
    const { onClear } = setup({ values: VALUES, activeCount: 6 });
    await user.click(screen.getByRole('button', { name: 'Effacer les critères' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("n'affiche ni puces, ni « Effacer », ni compteur quand rien n'est actif et que le total est inconnu", () => {
    const { container } = setup();
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Effacer les critères' })).not.toBeInTheDocument();
    expect(screen.queryByText(/résultat/)).not.toBeInTheDocument();
  });

  it('annonce le compteur poliment : aucun, un, plusieurs', () => {
    const { rerender } = setup({ resultCount: 0 });
    const counter = screen.getByText('0 résultat');
    expect(counter).toHaveAttribute('aria-live', 'polite');
    rerender({ resultCount: 1 });
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
    rerender({ resultCount: 12 });
    expect(screen.getByText('12 résultats')).toBeInTheDocument();
    rerender({ resultCount: 1234 });
    expect(screen.getByText(/^1\s234 résultats$/)).toBeInTheDocument();
  });

  it('applique un critère en ligne immédiatement', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('combobox', { name: 'Statut' }));
    await user.click(await screen.findByText('Actif', { selector: '.ant-select-item-option-content' }));
    expect(onChange).toHaveBeenCalledWith({ status: ['ACTIVE'] });
  });

  it('applique la case à cocher du panneau immédiatement', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Plus de critères/ }));
    await user.click(screen.getByRole('checkbox', { name: 'En retard' }));
    expect(onChange).toHaveBeenCalledWith({ late: true });
  });

  it("n'applique un intervalle de nombres qu'à la perte de focus", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Plus de critères/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Montant minimum' }), '500');
    expect(onChange).not.toHaveBeenCalled();
    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ amount: { min: 500 } });
  });
});

describe('ListSearch — select distant', () => {
  it('charge la page suivante au défilement et repart à la première page après une recherche', async () => {
    const user = userEvent.setup();
    const loadOptionsPage = vi.fn(async (term: string, page: number) => {
      if (term) return { items: [{ value: 'match', label: 'Résultat distant' }], total: 1 };
      return page === 1
        ? { items: [{ value: 'p1', label: 'Premier fournisseur' }], total: 2 }
        : { items: [{ value: 'p2', label: 'Second fournisseur' }], total: 2 };
    });
    setup({ criteria: [{ key: 'supplier', type: 'select', label: 'Fournisseur', primary: true, loadOptionsPage }] });
    const combo = screen.getByRole('combobox', { name: 'Fournisseur' });
    await user.click(combo);
    await waitFor(() => expect(loadOptionsPage).toHaveBeenCalledWith('', 1));
    expect(
      await screen.findByText('Premier fournisseur', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    const holder = document.querySelector('.ant-select-dropdown [class$="-holder"]') as HTMLElement;
    expect(holder).not.toBeNull();
    fireEvent.scroll(holder);
    await waitFor(() => expect(loadOptionsPage).toHaveBeenCalledWith('', 2));
    expect(
      await screen.findByText('Second fournisseur', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();

    await user.type(combo, 'dist');
    await waitFor(() => expect(loadOptionsPage).toHaveBeenCalledWith('dist', 1), { timeout: 2000 });
    expect(
      await screen.findByText('Résultat distant', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Second fournisseur', { selector: '.ant-select-item-option-content' })
    ).not.toBeInTheDocument();
  });

  it('ignore une ancienne réponse arrivée après le nouveau terme', async () => {
    const user = userEvent.setup();
    let finishOld: ((result: { items: { value: string; label: string }[]; total: number }) => void) | undefined;
    const loadOptionsPage = vi.fn((term: string) =>
      term === ''
        ? new Promise<{ items: { value: string; label: string }[]; total: number }>(resolve => {
            finishOld = resolve;
          })
        : Promise.resolve({ items: [{ value: 'new', label: 'Résultat récent' }], total: 1 })
    );
    setup({ criteria: [{ key: 'supplier', type: 'select', label: 'Fournisseur', primary: true, loadOptionsPage }] });
    const combo = screen.getByRole('combobox', { name: 'Fournisseur' });
    await user.click(combo);
    await waitFor(() => expect(loadOptionsPage).toHaveBeenCalledWith('', 1));
    await user.type(combo, 'récent');
    await waitFor(() => expect(loadOptionsPage).toHaveBeenCalledWith('récent', 1), { timeout: 2000 });
    expect(
      await screen.findByText('Résultat récent', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    await act(async () => finishOld?.({ items: [{ value: 'old', label: 'Résultat ancien' }], total: 1 }));
    expect(
      screen.queryByText('Résultat ancien', { selector: '.ant-select-item-option-content' })
    ).not.toBeInTheDocument();
  });

  it("charge les options à l'ouverture, retrouve le libellé de la valeur de l'URL et le garde dans la puce", async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn(async (search: string) =>
      [
        { value: 'p1', label: 'Villa Angré' },
        { value: 'p2', label: 'Studio Marcory' }
      ].filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    );
    const resolveLabel = vi.fn(async (value: string) => (value === 'p9' ? 'Résidence Cocody' : undefined));
    const { onChange } = setup({
      criteria: [{ key: 'property', type: 'select', label: 'Bien', primary: true, loadOptions, resolveLabel }],
      values: { property: 'p9' },
      activeCount: 1
    });

    // La valeur de l'URL est absente des options : la puce attend le libellé résolu.
    expect(await screen.findByText('Bien : Résidence Cocody')).toBeInTheDocument();
    expect(resolveLabel).toHaveBeenCalledTimes(1);
    expect(resolveLabel).toHaveBeenCalledWith('p9');

    await user.click(screen.getByRole('combobox', { name: 'Bien' }));
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith(''));
    await user.click(await screen.findByText('Studio Marcory', { selector: '.ant-select-item-option-content' }));
    expect(onChange).toHaveBeenCalledWith({ property: 'p2' });
  });

  it('interroge le serveur à la frappe, sans filtrage local', async () => {
    const user = userEvent.setup();
    const loadOptions = vi.fn(async () => [{ value: 'p1', label: 'Villa Angré' }]);
    setup({
      criteria: [{ key: 'property', type: 'select', label: 'Bien', primary: true, loadOptions }]
    });
    const combobox = screen.getByRole('combobox', { name: 'Bien' });
    await user.click(combobox);
    await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(1));
    await user.type(combobox, 'zzz');
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith('zzz'), { timeout: 2000 });
    // Le serveur a répondu : l'option reste visible même si elle ne contient pas « zzz ».
    expect(await screen.findByText('Villa Angré', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
  });
});

describe('ListSearch — corrections UX', () => {
  it('nomme chaque critère en ligne même avec une valeur choisie (préfixe)', () => {
    setup({ values: { kind: 'VILLA' }, activeCount: 1 });
    const inline = screen.getByRole('combobox', { name: 'Type de bien' }).closest('.ant-select') as HTMLElement;
    expect(within(inline).getByText('Type de bien')).toBeInTheDocument();
  });

  it('un intervalle compte pour deux emplacements (maxInline 3)', () => {
    setup({
      criteria: [
        { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Chercher' },
        { key: 'period', type: 'dateRange', label: 'Période', primary: true },
        { key: 'amount', type: 'numberRange', label: 'Montant', primary: true },
        { key: 'late', type: 'boolean', label: 'En retard', primary: true }
      ]
    });
    expect(screen.getByRole('group', { name: 'Période' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Montant' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'En retard' })).toBeInTheDocument();
  });

  it('place les puces dans une liste nommée', () => {
    setup({ values: { late: true, kind: 'VILLA' }, activeCount: 2 });
    const list = screen.getByRole('list', { name: 'Critères actifs' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it("garde le focus dans la barre après le retrait d'une puce : suivante, sinon précédente", async () => {
    const user = userEvent.setup();
    setup({ values: { kind: 'VILLA', late: true, status: ['ACTIVE'] }, activeCount: 3 });
    const bar = screen.getByRole('search');
    await user.click(screen.getByRole('button', { name: 'Retirer le critère Statut' }));
    expect(bar.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    // Dernière puce de la liste : le focus recule sur la précédente.
    const last = screen.getAllByRole('button', { name: /Retirer le critère/ }).at(-1) as HTMLElement;
    await user.click(last);
    expect(bar.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it('rend le focus au champ libre quand la dernière puce est retirée, et après « Effacer les critères »', async () => {
    const user = userEvent.setup();
    setup({ values: { late: true }, activeCount: 1 });
    await user.click(screen.getByRole('button', { name: 'Retirer le critère En retard' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Recherche' }));
    (document.activeElement as HTMLElement).blur();
    await user.click(screen.getByRole('button', { name: 'Effacer les critères' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Recherche' }));
  });

  it('Échap dans un calendrier ouvert ne replie pas le panneau', async () => {
    const user = userEvent.setup();
    setup();
    const more = screen.getByRole('button', { name: /Plus de critères/ });
    await user.click(more);
    const panel = screen.getByRole('group', { name: 'Plus de critères' });
    await user.click(within(panel).getAllByRole('textbox')[0]);
    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('propose de réessayer quand loadOptions échoue, sans dire « aucun résultat »', async () => {
    const user = userEvent.setup();
    const loadOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([{ value: 'p1', label: 'Villa Angré' }]);
    setup({ criteria: [{ key: 'property', type: 'select', label: 'Bien', primary: true, loadOptions }] });
    await user.click(screen.getByRole('combobox', { name: 'Bien' }));
    expect(await screen.findByText(/Impossible de charger les choix/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Villa Angré', { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    expect(loadOptions).toHaveBeenCalledTimes(2);
  });

  it('propose un clavier numérique (décimal) et applique en nombre', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole('button', { name: /Plus de critères/ }));
    const min = screen.getByRole('spinbutton', { name: 'Montant minimum' });
    expect(min).toHaveAttribute('inputmode', 'decimal');
    await user.type(min, '12000');
    await user.tab();
    expect(onChange).toHaveBeenCalledWith({ amount: { min: 12000 } });
  });
});

describe('ListSearch — noms accessibles des intervalles', () => {
  it('donne un nom à chacun des deux champs de date', () => {
    setup({
      criteria: [{ key: 'period', type: 'dateRange', label: 'Période', primary: true }]
    });
    expect(screen.getByRole('textbox', { name: 'Période, date de début' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Période, date de fin' })).toBeInTheDocument();
  });

  it('donne un nom à chacun des deux champs numériques', () => {
    setup({
      criteria: [{ key: 'amount', type: 'numberRange', label: 'Montant', primary: true }]
    });
    expect(screen.getByRole('spinbutton', { name: 'Montant minimum' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Montant maximum' })).toBeInTheDocument();
  });
});
