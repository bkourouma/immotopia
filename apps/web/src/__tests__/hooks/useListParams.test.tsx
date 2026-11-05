import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
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

describe('useListParams — préfixe et remplacement', () => {
  function Prefixed({ prefix, label }: { prefix: string; label: string }) {
    const list = useListParams<F>({ filterKeys: FILTER_KEYS, paramPrefix: prefix, defaultPageSize: 10 });
    return (
      <div>
        <span data-testid={`${label}-q`}>{list.filters.q ?? '(aucun)'}</span>
        <span data-testid={`${label}-page`}>{list.page}</span>
        <span data-testid={`${label}-size`}>{list.pageSize}</span>
        <span data-testid={`${label}-sort`}>{list.sort ? `${list.sort.field}:${list.sort.order}` : '(aucun)'}</span>
        <span data-testid={`${label}-query`}>{JSON.stringify(list.queryParams)}</span>
        <button onClick={() => list.setFilters({ q: 'villa' })}>{`${label} filtrer`}</button>
        <button onClick={() => list.setPage(1)}>{`${label} page 1`}</button>
        <button onClick={() => list.setPage(2)}>{`${label} page 2`}</button>
        <button onClick={() => list.setPageSize(10)}>{`${label} taille défaut`}</button>
        <button onClick={() => list.setSort({ field: 'price', order: 'asc' })}>{`${label} trier`}</button>
        <button onClick={list.clearFilters}>{`${label} effacer`}</button>
      </div>
    );
  }

  const Two = () => (
    <>
      <span data-testid="url2">{useLocation().search || '(vide)'}</span>
      <Prefixed prefix="a" label="a" />
      <Prefixed prefix="b" label="b" />
    </>
  );

  it('lit les clés préfixées et expose filtres et queryParams non préfixés', () => {
    at('?a.q=villa&a.page=3&a.limit=5&a.sort=price:desc&q=autre', <Two />);
    expect(screen.getByTestId('a-q')).toHaveTextContent('villa');
    expect(screen.getByTestId('a-page')).toHaveTextContent('3');
    expect(screen.getByTestId('a-size')).toHaveTextContent('5');
    expect(screen.getByTestId('a-sort')).toHaveTextContent('price:desc');
    expect(JSON.parse(screen.getByTestId('a-query').textContent as string)).toEqual({
      q: 'villa',
      page: 3,
      limit: 5,
      sort: 'price:desc'
    });
    // L'autre instance ne voit rien de ce qui est préfixé « a. ».
    expect(screen.getByTestId('b-q')).toHaveTextContent('(aucun)');
  });

  it('écrit en clés préfixées sans écraser l’autre instance', async () => {
    const user = userEvent.setup();
    at('', <Two />);
    await user.click(screen.getByText('a filtrer'));
    await user.click(screen.getByText('b page 2'));
    const url = screen.getByTestId('url2').textContent as string;
    expect(url).toContain('a.q=villa');
    expect(url).toContain('b.page=2');
    expect(screen.getByTestId('a-page')).toHaveTextContent('1');
    expect(screen.getByTestId('b-page')).toHaveTextContent('2');
  });

  it('retire les valeurs par défaut des clés préfixées', async () => {
    const user = userEvent.setup();
    at('?a.page=2&a.limit=5', <Two />);
    await user.click(screen.getByText('a page 1'));
    expect(screen.getByTestId('url2').textContent).not.toContain('a.page');
    await user.click(screen.getByText('a taille défaut'));
    expect(screen.getByTestId('url2').textContent).not.toContain('a.limit');
  });

  it('clearFilters n’efface que les clés de son instance', async () => {
    const user = userEvent.setup();
    at('?a.q=x&b.q=y&utm=1', <Two />);
    await user.click(screen.getByText('a effacer'));
    const url = screen.getByTestId('url2').textContent as string;
    expect(url).not.toContain('a.q');
    expect(url).toContain('b.q=y');
    expect(url).toContain('utm=1');
  });

  it('setFilters(…, { replace: true }) remplace l’entrée d’historique', async () => {
    function Replace() {
      const list = useListParams<F>({ filterKeys: FILTER_KEYS });
      const navType = useNavigationType();
      return (
        <div>
          <span data-testid="nav">{navType}</span>
          <button onClick={() => list.setFilters({ q: 'a' }, { replace: true })}>remplacer</button>
          <button onClick={() => list.setFilters({ q: 'b' })}>empiler</button>
        </div>
      );
    }
    const user = userEvent.setup();
    at('', <Replace />);
    await user.click(screen.getByText('remplacer'));
    expect(screen.getByTestId('nav')).toHaveTextContent('REPLACE');
    await user.click(screen.getByText('empiler'));
    expect(screen.getByTestId('nav')).toHaveTextContent('PUSH');
  });
});

describe('useListParams — setPage avec replace', () => {
  function Replacer() {
    const list = useListParams<F>({ filterKeys: FILTER_KEYS });
    const navType = useNavigationType();
    return (
      <div>
        <span data-testid="nav">{navType}</span>
        <span data-testid="url">{useLocation().search || '(vide)'}</span>
        <button onClick={() => list.setPage(2, { replace: true })}>page 2 remplace</button>
      </div>
    );
  }

  it('setPage(page, { replace: true }) ne crée pas d’entrée d’historique', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/l?page=9']}>
        <Replacer />
      </MemoryRouter>
    );
    await user.click(screen.getByText('page 2 remplace'));
    expect(screen.getByTestId('url')).toHaveTextContent('?page=2');
    expect(screen.getByTestId('nav')).toHaveTextContent('REPLACE');
  });
});
