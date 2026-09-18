import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataView } from '../../components/primitives/DataView';
import { DataCard } from '../../components/primitives/DataCard';

/**
 * `<DataView>` — les deux représentations et les états (§5.1, §10.1).
 *
 * Deux propriétés sont vérifiées ici parce qu'elles sont invisibles autrement :
 *
 * 1. **« Aucune donnée » et « aucun résultat » sont deux écrans.** Le dépôt
 *    affichait le même `<Empty>` dans les deux cas, ce qui laissait croire à un
 *    portefeuille vide alors qu'un filtre était resté posé.
 * 2. **La pagination vient du serveur.** `total` n'est jamais `items.length`.
 *    C'est le défaut nommé au §8.4 : la liste et son compteur se
 *    contredisaient.
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

type Bien = { id: string; titre: string; prix: number };

const BIENS: Bien[] = [
  { id: '1', titre: 'Villa Kipe', prix: 450_000 },
  { id: '2', titre: 'Studio Matam', prix: 120_000 }
];

const COLUMNS = [
  { title: 'Titre', dataIndex: 'titre', key: 'titre' },
  { title: 'Prix', dataIndex: 'prix', key: 'prix' }
];

/**
 * Les propriétés surchargées sont nommées une à une : `DataViewProps` est une
 * union discriminée sur `layout`, et un `Partial<>` de cette union perdrait
 * justement la contrainte que le composant existe pour poser.
 */
type Overrides = {
  items?: Bien[];
  total?: number;
  loading?: boolean;
  isReloading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isFiltered?: boolean;
  onClearFilters?: () => void;
  emptyAction?: { label: string; onClick: () => void };
  onPageChange?: (page: number, pageSize: number) => void;
  paginated?: boolean;
};

function view(props: Overrides = {}) {
  return render(
    <MemoryRouter>
      <DataView<Bien>
        items={BIENS}
        total={57}
        page={1}
        pageSize={20}
        onPageChange={() => {}}
        columns={COLUMNS}
        rowKey={b => b.id}
        renderCard={b => <DataCard title={b.titre} subtitle={`${b.prix} FCFA`} />}
        aria-label="Biens"
        {...props}
      />
    </MemoryRouter>
  );
}

function grid(props: Overrides = {}) {
  return render(
    <MemoryRouter>
      <DataView<Bien>
        layout="grid"
        items={BIENS}
        total={57}
        page={1}
        pageSize={20}
        onPageChange={() => {}}
        rowKey={b => b.id}
        renderCard={b => <DataCard title={b.titre} subtitle={`${b.prix} FCFA`} />}
        aria-label="Biens"
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  isDesktop.value = true;
});

describe('DataView — représentation selon le palier', () => {
  it('rend un tableau au-dessus de 992 px', () => {
    view();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Villa Kipe')).toBeInTheDocument();
  });

  it('rend une liste de cartes en dessous, et aucun tableau', () => {
    // Le point de la primitive : sous 992 px il n'y a pas de tableau du tout,
    // donc pas de défilement horizontal à découvrir.
    isDesktop.value = false;
    view();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Biens' });
    // La recherche est bornée à la liste : la pagination d'Ant Design rend
    // elle aussi des `listitem`, et les compter fausserait le test.
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('en grille, rend des cartes meme au-dessus de 992 px', () => {
    // Un portefeuille de biens se regarde autant qu'il se lit : la photo fait
    // partie de l'information, un tableau la perdrait.
    isDesktop.value = true;
    grid();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Biens' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('en grille, le squelette est fait de cartes et non de lignes', () => {
    isDesktop.value = true;
    grid({ items: [], loading: true });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});

describe('DataView — les états sont distingués', () => {
  it('sans donnée ET sans filtre, propose de créer', () => {
    view({ items: [], total: 0, isFiltered: false, emptyAction: { label: 'Ajouter un bien', onClick: () => {} } });
    expect(screen.getByText('Ajouter un bien')).toBeInTheDocument();
    expect(screen.queryByText('Effacer les filtres')).not.toBeInTheDocument();
  });

  it('sans résultat MAIS avec un filtre, propose d’élargir', () => {
    // Le cas que le dépôt confondait avec le précédent.
    view({ items: [], total: 0, isFiltered: true, onClearFilters: () => {} });
    expect(screen.getByText('Effacer les filtres')).toBeInTheDocument();
    expect(screen.queryByText('Ajouter un bien')).not.toBeInTheDocument();
  });

  it('affiche l’erreur et un moyen de réessayer', async () => {
    const onRetry = vi.fn();
    view({ error: 'Le serveur n’a pas répondu.', onRetry });
    expect(screen.getByText('Le serveur n’a pas répondu.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Réessayer'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('montre un squelette au premier chargement seulement', () => {
    view({ items: [], loading: true });
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('garde la liste à l’écran pendant un rechargement', () => {
    // Repasser par le squelette fait sauter la mise en page et perdre le fil
    // de lecture : la donnée reste, l'indicateur dit qu'elle bouge.
    view({ isReloading: true });
    expect(screen.getByText('Villa Kipe')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('DataView — pagination serveur', () => {
  it('pagine sur le total du serveur, pas sur la page reçue', () => {
    // 2 éléments à l'écran, 57 au total : la pagination doit refléter 57.
    view();
    expect(screen.getByText(/sur 57/)).toBeInTheDocument();
  });

  it('affiche le compteur même quand tout tient sur une page', () => {
    // La barre ne sert pas qu'à tourner les pages : elle porte le compteur et
    // le choix du nombre par page. La masquer sur une liste courte privait de
    // la seule réponse à « combien y en a-t-il ? ».
    //
    // L'ancienne version de ce test affirmait l'inverse — et ne vérifiait rien :
    // elle cherchait un `role="navigation"` que la pagination d'Ant Design ne
    // porte pas, donc elle passait quel que soit le comportement.
    view({ total: 2 });
    expect(screen.getByText(/sur 2/)).toBeInTheDocument();
  });

  it('n’affiche aucune pagination quand la liste ne se pagine pas', () => {
    // Certaines API renvoient tout d'un bloc. L'écran le déclare, au lieu de
    // le faire deviner en posant `pageSize` égal au total.
    view({ total: 2, paginated: false });
    expect(screen.queryByText(/sur 2/)).not.toBeInTheDocument();
  });

  it('n’affiche aucune pagination sur une liste vide', () => {
    // Le bloc d'état vide parle déjà ; un « 0–0 sur 0 » en dessous n'ajoute
    // rien et encombre.
    view({ items: [], total: 0 });
    expect(screen.queryByText(/sur 0/)).not.toBeInTheDocument();
  });

  it('remonte le changement de page à l’appelant', async () => {
    const onPageChange = vi.fn();
    view({ onPageChange });
    await userEvent.click(screen.getByTitle('2'));
    expect(onPageChange).toHaveBeenCalledWith(2, 20);
  });
});

describe('DataCard', () => {
  it('expose une action par carte, le reste derrière « ⋮ »', () => {
    render(
      <DataCard
        title="Villa Kipe"
        primaryAction={{ label: 'Encaisser', onClick: () => {} }}
        secondaryActions={[{ key: 'edit', label: 'Modifier' }]}
      />
    );
    expect(screen.getByText('Encaisser')).toBeInTheDocument();
    // L'icône seule porte un nom accessible : « ⋮ » ne se prononce pas.
    expect(screen.getByRole('button', { name: 'Autres actions' })).toBeInTheDocument();
  });

  it('rend la carte entière actionnable au clavier', async () => {
    const onOpen = vi.fn();
    render(<DataCard title="Villa Kipe" onOpen={onOpen} aria-label="Villa Kipe" />);
    const card = screen.getByRole('link', { name: 'Villa Kipe' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('n’ouvre pas le détail quand on actionne un bouton de la carte', async () => {
    // Sans arrêt de propagation, « Encaisser » ouvrirait aussi la fiche.
    const onOpen = vi.fn();
    const onPay = vi.fn();
    render(<DataCard title="Villa Kipe" onOpen={onOpen} primaryAction={{ label: 'Encaisser', onClick: onPay }} />);
    await userEvent.click(screen.getByText('Encaisser'));
    expect(onPay).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
