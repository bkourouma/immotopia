import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useListParams } from '../../hooks/useListParams';

/**
 * `useListParams` — l'état d'une liste vit dans l'URL (§10.1).
 *
 * Le critère de sortie est vérifiable : « l'écran est restaurable par son URL
 * seule ». Ces tests portent donc sur l'URL produite et sur l'état lu, pas sur
 * un état interne — il n'y en a pas, et c'est le point.
 */

type F = { q: string; status: string };
const FILTER_KEYS = ['q', 'status'] as const;

/** Sonde : affiche l'état lu et l'URL écrite, et expose les actions. */
function Probe({ defaultPageSize = 20 }: { defaultPageSize?: number }) {
  const list = useListParams<F>({ filterKeys: FILTER_KEYS, defaultPageSize });
  const location = useLocation();

  return (
    <div>
      <span data-testid="url">{location.search || '(vide)'}</span>
      <span data-testid="page">{list.page}</span>
      <span data-testid="size">{list.pageSize}</span>
      <span data-testid="sort">{list.sort ? `${list.sort.field}:${list.sort.order}` : '(aucun)'}</span>
      <span data-testid="q">{list.filters.q ?? '(aucun)'}</span>
      <span data-testid="filtered">{String(list.isFiltered)}</span>
      <span data-testid="query">{JSON.stringify(list.queryParams)}</span>

      <button onClick={() => list.setPage(3)}>page 3</button>
      <button onClick={() => list.setFilters({ q: 'villa' })}>filtrer villa</button>
      <button onClick={() => list.setFilters({ q: '' })}>vider q</button>
      <button onClick={() => list.setSort({ field: 'price', order: 'desc' })}>trier prix</button>
      <button onClick={() => list.setPageSize(50)}>50 par page</button>
      <button onClick={list.clearFilters}>tout effacer</button>
    </div>
  );
}

const at = (search: string, ui: React.ReactElement = <Probe />) =>
  render(<MemoryRouter initialEntries={[`/liste${search}`]}>{ui}</MemoryRouter>);

describe('useListParams — lecture de l’URL', () => {
  it('restitue filtres, page et tri depuis l’URL seule', () => {
    at('?q=villa&status=AVAILABLE&page=4&limit=50&sort=price:desc');

    expect(screen.getByTestId('q')).toHaveTextContent('villa');
    expect(screen.getByTestId('page')).toHaveTextContent('4');
    expect(screen.getByTestId('size')).toHaveTextContent('50');
    expect(screen.getByTestId('sort')).toHaveTextContent('price:desc');
    expect(screen.getByTestId('filtered')).toHaveTextContent('true');
  });

  it('traite un paramètre présent mais vide comme absent', () => {
    // `?q=` arrive quand l'utilisateur vide le champ. Le lire comme un filtre
    // sur la chaîne vide ne renverrait aucun résultat.
    at('?q=');
    expect(screen.getByTestId('q')).toHaveTextContent('(aucun)');
    expect(screen.getByTestId('filtered')).toHaveTextContent('false');
  });

  it('ignore une page absurde plutôt que de la propager', () => {
    at('?page=-2');
    expect(screen.getByTestId('page')).toHaveTextContent('1');
  });

  it('compose les paramètres envoyés à l’API', () => {
    at('?q=villa&page=2');
    expect(JSON.parse(screen.getByTestId('query').textContent as string)).toEqual({
      q: 'villa',
      page: 2,
      limit: 20
    });
  });
});

describe('useListParams — écriture dans l’URL', () => {
  it('n’écrit que ce qui s’écarte du défaut', async () => {
    const user = userEvent.setup();
    at('');
    expect(screen.getByTestId('url')).toHaveTextContent('(vide)');

    await user.click(screen.getByText('page 3'));
    expect(screen.getByTestId('url')).toHaveTextContent('?page=3');

    // Revenir au défaut retire le paramètre au lieu d'écrire `page=1`.
    await user.click(screen.getByText('filtrer villa'));
    expect(screen.getByTestId('url').textContent).not.toContain('page=');
  });

  it('remet la page à 1 quand un filtre change', async () => {
    // Le défaut qu'on cherche : filtrer depuis la page 7 et atterrir sur une
    // liste vide alors que des résultats existent. L'utilisateur en conclut
    // que le filtre ne fonctionne pas.
    const user = userEvent.setup();
    at('?page=7');

    await user.click(screen.getByText('filtrer villa'));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('q')).toHaveTextContent('villa');
  });

  it('remet la page à 1 quand le tri change', async () => {
    const user = userEvent.setup();
    at('?page=5');
    await user.click(screen.getByText('trier prix'));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('sort')).toHaveTextContent('price:desc');
  });

  it('remet la page à 1 quand la taille de page change', async () => {
    // La page 5 de pages de 20 n'a pas d'équivalent en pages de 50.
    const user = userEvent.setup();
    at('?page=5');
    await user.click(screen.getByText('50 par page'));
    expect(screen.getByTestId('page')).toHaveTextContent('1');
    expect(screen.getByTestId('size')).toHaveTextContent('50');
  });

  it('vider un filtre le retire de l’URL', async () => {
    const user = userEvent.setup();
    at('?q=villa');
    await user.click(screen.getByText('vider q'));
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
    expect(screen.getByTestId('filtered')).toHaveTextContent('false');
  });

  it('effacer les filtres ne touche pas aux paramètres étrangers', async () => {
    // Un écran ne doit pas supprimer un paramètre qu'il ne comprend pas :
    // jeton de suivi, ancre, paramètre d'un autre composant de la page.
    const user = userEvent.setup();
    at('?q=villa&status=RENTED&utm_source=whatsapp');

    await user.click(screen.getByText('tout effacer'));
    const url = screen.getByTestId('url').textContent as string;
    expect(url).toContain('utm_source=whatsapp');
    expect(url).not.toContain('q=');
    expect(url).not.toContain('status=');
  });
});
