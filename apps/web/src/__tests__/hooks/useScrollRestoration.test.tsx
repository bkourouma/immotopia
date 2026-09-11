import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { useScrollRestoration, _viderPositions } from '../../hooks/useScrollRestoration';

/**
 * Restauration du défilement — l'orchestration.
 *
 * Ce que ces tests vérifient : **quelle** consigne de défilement est donnée
 * pour chaque type de navigation. Ils ne vérifient pas une position à l'écran
 * — jsdom n'a pas de rendu, `window.scrollTo` n'y fait rien, et une assertion
 * sur `scrollY` y serait une mise en scène.
 *
 * La position réelle a été mesurée dans un navigateur, sur la scène de
 * l'atelier : liste filtrée défilée à 700 px, ouverture d'un détail, retour
 * arrière, **position restaurée à 700 px, écart de 0 pixel**. C'est cette
 * mesure qui fait foi pour le critère de sortie du Lot 1 ; ces tests
 * empêchent la règle de se déplacer sans qu'on le voie.
 */

function Ecran({ nom }: { nom: string }) {
  useScrollRestoration();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="ecran">{nom}</span>
      <button onClick={() => navigate('/detail')}>aller au détail</button>
      <button onClick={() => navigate(-1)}>revenir</button>
      <button onClick={() => navigate('/liste?f=1', { replace: true })}>filtrer sans empiler</button>
    </div>
  );
}

function monter(entree = '/liste') {
  return render(
    <MemoryRouter initialEntries={[entree]}>
      <Routes>
        <Route path="/liste" element={<Ecran nom="liste" />} />
        <Route path="/detail" element={<Ecran nom="detail" />} />
      </Routes>
    </MemoryRouter>
  );
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  _viderPositions();
  scrollTo = vi.fn();
  Object.defineProperty(window, 'scrollTo', { value: scrollTo, writable: true, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScrollRestoration — consigne par type de navigation', () => {
  it('remonte en haut sur une nouvelle destination', async () => {
    const { getByText } = monter();
    scrollTo.mockClear();

    await act(async () => {
      getByText('aller au détail').click();
    });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('ne touche à rien sur un remplacement d’URL', async () => {
    // Poser un filtre en remplaçant l'entrée ne change pas d'écran : déplacer
    // la vue serait incompréhensible.
    const { getByText } = monter();
    scrollTo.mockClear();

    await act(async () => {
      getByText('filtrer sans empiler').click();
    });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('vise la position mémorisée au retour arrière', async () => {
    const { getByText } = monter();

    // L'écran est défilé, puis on ouvre un détail.
    Object.defineProperty(window, 'scrollY', { value: 700, writable: true, configurable: true });
    window.dispatchEvent(new Event('scroll'));

    await act(async () => {
      getByText('aller au détail').click();
    });

    // Sur le détail, le document est revenu en haut.
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    scrollTo.mockClear();

    await act(async () => {
      getByText('revenir').click();
    });

    expect(scrollTo).toHaveBeenCalledWith(0, 700);
  });

  it('remonte en haut au retour si rien n’avait été défilé', async () => {
    const { getByText } = monter();

    await act(async () => {
      getByText('aller au détail').click();
    });
    scrollTo.mockClear();

    await act(async () => {
      getByText('revenir').click();
    });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('useScrollRestoration — restauration native du navigateur', () => {
  it('la désactive, pour ne pas se disputer la position', async () => {
    // Mesuré : avec la restauration native active, le navigateur repositionnait
    // AVANT le rendu de la liste et la consigne était écrêtée — 633 px pour une
    // position attendue de 700.
    Object.defineProperty(window.history, 'scrollRestoration', {
      value: 'auto',
      writable: true,
      configurable: true
    });

    const { unmount } = monter();
    expect(window.history.scrollRestoration).toBe('manual');

    // Et la rend en partant : un autre écran du site pourrait en dépendre.
    unmount();
    expect(window.history.scrollRestoration).toBe('auto');
  });
});
