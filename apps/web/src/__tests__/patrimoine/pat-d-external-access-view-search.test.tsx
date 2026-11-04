import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ExternalAccessViewPage } from '../../pages/public/ExternalAccessViewPage';
import apiClient from '../../utils/api-client';

/**
 * Page publique d'accès partagé : recherche et pagination LOCALES des biens,
 * rubriques en onglets, impression complète. Le mock se pose à la frontière
 * réseau : on compte les POST pour prouver qu'aucun appel ne s'ajoute.
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

// La barre choisit sa mise en page selon la largeur de la fenêtre : bureau.
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

// Délai large : la suite complète tourne en parallèle et peut être lente.
const T = { timeout: 8000 };

const SEARCH_PLACEHOLDER = 'Référence, titre, adresse, ville…';

/** 7 biens (2 pages de 5) ; le 7e est un bureau à Bouaké, les autres des appartements à Abidjan. */
function manyProperties() {
  return Array.from({ length: 7 }, (_, index) => {
    const n = index + 1;
    return {
      reference: `BIEN-${String(n).padStart(3, '0')}`,
      title: `Résidence ${n}`,
      address: `Rue ${n}`,
      city: n === 7 ? 'Bouaké' : 'Abidjan',
      sharePercent: null,
      loans: [
        {
          lender: `Banque ${n}`,
          capitalAmount: 50000000,
          remainingCapital: 30000000,
          interestRate: 7,
          monthlyPayment: 600000,
          currency: 'XOF',
          startDate: '2022-01-01T00:00:00.000Z',
          endDate: null,
          status: 'ACTIVE'
        }
      ],
      titles: {
        propertyType: n === 7 ? 'BUREAU' : 'APPARTEMENT',
        surface: null,
        holdings: [],
        ownerSharePercent: null
      }
    };
  });
}

function manyView() {
  return {
    agencyName: 'Agence Soleil',
    grantType: 'NOTARY',
    recipientName: 'Maître Koné',
    ownerName: 'Awa Konan',
    linkExpiresAt: '2026-10-15T10:00:00.000Z',
    accessExpiresAt: null,
    currency: 'XOF',
    sections: ['LOANS', 'TITLES_OWNERSHIP'],
    summary: { propertyCount: 7, totalRemainingLoanCapital: 210000000 },
    properties: manyProperties()
  };
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `/acces-partage${hash}`);
}

function renderPage() {
  return render(
    <BrowserRouter>
      <ExternalAccessViewPage />
    </BrowserRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('ExternalAccessViewPage : recherche et pagination des biens', () => {
  it('pagine les biens par 5 et filtre localement, sans appel réseau supplémentaire', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    renderPage();

    expect(await screen.findByText('BIEN-001 — Résidence 1', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('BIEN-005 — Résidence 5')).toBeInTheDocument();
    expect(screen.queryByText('BIEN-006 — Résidence 6')).not.toBeInTheDocument();
    // La synthèse (calculée par le serveur) reste au-dessus.
    expect(screen.getByText('Biens concernés')).toBeInTheDocument();

    await user.click(screen.getByTitle('2'));
    expect(await screen.findByText('BIEN-006 — Résidence 6', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('BIEN-007 — Résidence 7')).toBeInTheDocument();
    expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument();

    // Recherche libre : ville, sans accent ni casse.
    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), 'BOUAKE');
    await vi.waitFor(() => expect(screen.queryByText('BIEN-006 — Résidence 6')).not.toBeInTheDocument(), T);
    expect(screen.getByText('BIEN-007 — Résidence 7')).toBeInTheDocument();
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
    // La synthèse ne dépend pas du filtre.
    expect(screen.getByText('Biens concernés')).toBeInTheDocument();

    // Rien de plus n'est parti au serveur : la lecture reste unique.
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('filtre par type de bien depuis l’adresse et propose d’effacer quand rien ne correspond', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/acces-partage?type=BUREAU#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    renderPage();

    expect(await screen.findByText('BIEN-007 — Résidence 7', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), 'introuvable');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('BIEN-001 — Résidence 1', undefined, T)).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('change de rubrique dans la carte sans appel réseau, chaque carte gardant son onglet', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);

    const first = screen.getByText('BIEN-001 — Résidence 1').closest('.ant-card') as HTMLElement;
    const second = screen.getByText('BIEN-002 — Résidence 2').closest('.ant-card') as HTMLElement;
    expect(within(first).queryByText('Banque 1')).not.toBeInTheDocument();

    await userEvent.click(within(first).getByRole('tab', { name: 'Emprunts' }));
    expect(await within(first).findByText('Banque 1')).toBeInTheDocument();
    expect(within(second).queryByText('Banque 2')).not.toBeInTheDocument();

    await userEvent.click(within(first).getByRole('tab', { name: 'Aperçu' }));
    await waitFor(() => expect(within(first).queryByText('Banque 1')).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('consomme le jeton avant d’écrire les critères dans l’adresse : il n’y revient jamais', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    const writes: string[] = [];
    const push = window.history.pushState.bind(window.history);
    const replace = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, url) => {
      writes.push(String(url));
      push(data, unused, url);
    });
    vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
      writes.push(String(url));
      replace(data, unused, url);
    });
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    const { container } = renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);
    expect(window.location.hash).toBe('');

    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), 'Résidence 3');
    await vi.waitFor(() => expect(window.location.search).toContain('q='), T);

    expect(window.location.href).not.toContain('jeton-abc');
    expect(window.location.hash).toBe('');
    // Aucune écriture d'adresse, avant ou après la saisie, ne porte le jeton.
    expect(writes.length).toBeGreaterThan(0);
    for (const written of writes) expect(written).not.toContain('jeton-abc');
    expect(container.innerHTML).not.toContain('jeton-abc');
    // Seul le critère saisi voyage dans l'adresse, avec le chemin de la page.
    expect(window.location.pathname).toBe('/acces-partage');
    expect(Array.from(new URLSearchParams(window.location.search).keys()).join(',')).toBe('q');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][1]).toEqual({ token: 'jeton-abc' });
  });

  it('imprime TOUS les biens et toutes les rubriques, puis revient à l’affichage paginé', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    let snapshot = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      snapshot = document.body.textContent ?? '';
    });
    renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);
    // Un filtre est posé : l'impression l'ignore.
    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), 'Résidence 2');
    await vi.waitFor(() => expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument(), T);

    await user.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));

    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1), T);
    for (let n = 1; n <= 7; n += 1) {
      expect(snapshot).toContain(`BIEN-00${n} — Résidence ${n}`);
      // Rubriques empilées : le prêteur de chaque bien est dans le DOM sans cliquer d'onglet.
      expect(snapshot).toContain(`Banque ${n}`);
    }
    expect(snapshot).toContain('Titres et propriété');
    expect(mockPost).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    // Retour au mode normal : la barre et le filtre posé sont revenus.
    expect(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument();
    expect(screen.getByText('BIEN-002 — Résidence 2')).toBeInTheDocument();
  });
});

describe('ExternalAccessViewPage : impression sans coupure des tableaux', () => {
  /** Un bien avec 25 emprunts et 25 dépenses : bien plus que les 10 lignes d'une page de tableau. */
  function longView() {
    return {
      ...manyView(),
      sections: ['LOANS', 'EXPENSES'],
      summary: { propertyCount: 1 },
      properties: [
        {
          reference: 'BIEN-001',
          title: 'Résidence 1',
          address: 'Rue 1',
          city: 'Abidjan',
          sharePercent: null,
          loans: Array.from({ length: 25 }, (_, index) => ({
            lender: `Prêteur ${index + 1}`,
            capitalAmount: 1000,
            remainingCapital: 500,
            interestRate: 5,
            monthlyPayment: 10,
            currency: 'XOF',
            startDate: '2022-01-01T00:00:00.000Z',
            endDate: null,
            status: 'ACTIVE'
          })),
          expenses: {
            totalLast12Months: 25000,
            items: Array.from({ length: 25 }, (_, index) => ({
              date: '2026-03-01T00:00:00.000Z',
              category: 'PROPERTY_TAX',
              amount: 1000 + index
            }))
          }
        }
      ]
    };
  }

  it('rend toutes les lignes de chaque rubrique avant window.print', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: longView() } });
    let snapshot = '';
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      snapshot = document.body.textContent ?? '';
    });
    renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);

    await user.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));

    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1), T);
    // Emprunts : la 25e ligne est là (à l'écran la page 1 s'arrête à la 10e).
    expect(snapshot).toContain('Prêteur 1');
    expect(snapshot).toContain('Prêteur 25');
    // Dépenses : 25 lignes de montants distincts, la dernière comprise.
    expect(document.body.querySelectorAll('.ant-pagination').length).toBe(0);
    const expenseRows = Array.from(document.body.querySelectorAll('tbody tr')).filter(row =>
      /Taxe foncière/.test(row.textContent ?? '')
    );
    expect(expenseRows).toHaveLength(25);
  });

  it('Ctrl+P (beforeprint) passe en impression complète, afterprint rend page, filtre et onglet', async () => {
    const user = userEvent.setup();
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);
    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), 'Résidence 2');
    await vi.waitFor(() => expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument(), T);
    await user.click(screen.getByRole('tab', { name: 'Emprunts' }));
    expect(await screen.findByText('Banque 2', undefined, T)).toBeInTheDocument();

    // Rendu synchrone : le DOM est complet dès le retour de dispatchEvent.
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    for (let n = 1; n <= 7; n += 1) {
      expect(document.body.textContent).toContain(`BIEN-00${n} — Résidence ${n}`);
      expect(document.body.textContent).toContain(`Banque ${n}`);
    }
    expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER)).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER, undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('BIEN-001 — Résidence 1')).not.toBeInTheDocument();
    expect(screen.getByText('BIEN-002 — Résidence 2')).toBeInTheDocument();
    // L'onglet ouvert avant l'impression est conservé.
    expect(screen.getByRole('tab', { name: 'Emprunts' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Banque 2')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('retire les écouteurs d’impression au démontage', async () => {
    setHash('#jeton-abc');
    mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderPage();
    await screen.findByText('BIEN-001 — Résidence 1', undefined, T);
    unmount();
    const removed = remove.mock.calls.map(call => call[0]);
    expect(removed).toContain('beforeprint');
    expect(removed).toContain('afterprint');
  });

  /** matchMedia factice : capture l'écouteur « change » de la requête print (absent de jsdom). */
  function mockPrintMedia() {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    let listener: ((event: { matches: boolean }) => void) | null = null;
    const removeEventListener = vi.fn((_type: string, cb: unknown) => {
      if (cb === listener) listener = null;
    });
    const list = {
      matches: false,
      media: 'print',
      addEventListener: vi.fn((_type: string, cb: (event: { matches: boolean }) => void) => {
        listener = cb;
      }),
      removeEventListener
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) =>
        query === 'print'
          ? list
          : {
              matches: false,
              media: query,
              addListener: vi.fn(),
              removeListener: vi.fn(),
              addEventListener: vi.fn(),
              removeEventListener: vi.fn()
            }
      )
    });
    return {
      fire: (matches: boolean) => listener?.({ matches }),
      hasListener: () => listener !== null,
      removeEventListener,
      restore: () => {
        if (original) Object.defineProperty(window, 'matchMedia', original);
        else delete (window as unknown as { matchMedia?: unknown }).matchMedia;
      }
    };
  }

  it('matchMedia(print) : sortie du mode impression sans afterprint (Safari), écouteur retiré au démontage', async () => {
    const media = mockPrintMedia();
    try {
      setHash('#jeton-abc');
      mockPost.mockResolvedValue({ status: 200, data: { success: true, data: manyView() } });
      const { unmount } = renderPage();
      await screen.findByText('BIEN-001 — Résidence 1', undefined, T);
      expect(media.hasListener()).toBe(true);

      act(() => {
        window.dispatchEvent(new Event('beforeprint'));
      });
      expect(screen.queryByPlaceholderText(SEARCH_PLACEHOLDER)).not.toBeInTheDocument();

      act(() => {
        media.fire(false);
      });
      expect(await screen.findByPlaceholderText(SEARCH_PLACEHOLDER, undefined, T)).toBeInTheDocument();
      expect(document.body.querySelectorAll('.ant-pagination').length).toBeGreaterThan(0);

      unmount();
      expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(media.hasListener()).toBe(false);
    } finally {
      media.restore();
    }
  });
});
