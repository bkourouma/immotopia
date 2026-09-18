import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepRail } from '../../components/primitives/StepRail';

/**
 * `<StepRail>` remplace le `<Steps>` d'Ant Design dans l'assistant de creation
 * d'une propriete. Trois choses sont verifiees ici, parce que ce sont les trois
 * qui etaient fausses avant :
 *
 *  1. le rail n'ouvre pas une etape non atteinte — l'ancien `onChange` de
 *     `Steps` laissait sauter de l'etape 1 a l'etape 6 en ne validant que
 *     l'etape 1 ;
 *  2. le titre de l'etape courante est toujours lisible, quel que soit le
 *     palier — c'est le defaut visuel d'origine (« Caracte / ristique / s ») ;
 *  3. sous 992 px, le rail ne repete pas le titre de l'etape courante : il est
 *     deja l'en-tete du panneau, juste en dessous.
 */

const palier = vi.hoisted(() => ({ xl: true, desktop: true }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: palier.xl ? { xs: true, sm: true, md: true, lg: true, xl: true } : { xs: true },
    active: palier.desktop ? 'lg' : 'xs',
    isMobile: !palier.desktop,
    isTablet: false,
    isDesktop: palier.desktop
  })
}));

const ITEMS = [
  { title: 'Type et identification' },
  { title: 'Localisation' },
  { title: 'Caractéristiques générales', shortTitle: 'Caractéristiques' },
  { title: 'Prix & Conditions', shortTitle: 'Prix et conditions' },
  { title: 'Caractéristiques spécifiques', shortTitle: 'Spécificités' },
  { title: 'Médias' }
];

const large = () => {
  palier.xl = true;
  palier.desktop = true;
};

const etroit = () => {
  palier.xl = false;
  palier.desktop = false;
};

describe('StepRail — rail large (>= 1200 px)', () => {
  beforeEach(large);

  it('rend une etape par element de liste, titre compris', () => {
    render(<StepRail items={ITEMS} current={0} />);

    const etapes = screen.getAllByRole('listitem');
    expect(etapes).toHaveLength(6);
    ITEMS.forEach(item => expect(screen.getByText(item.title)).toBeInTheDocument());
  });

  it('marque l etape courante, et elle seule', () => {
    render(<StepRail items={ITEMS} current={2} />);

    const courantes = screen.getAllByRole('listitem').filter(li => li.getAttribute('aria-current') === 'step');
    expect(courantes).toHaveLength(1);
    expect(within(courantes[0]).getByText('Caractéristiques générales')).toBeInTheDocument();
  });

  it('n ouvre que les etapes deja atteintes', async () => {
    const onChange = vi.fn();
    render(<StepRail items={ITEMS} current={1} furthest={2} onChange={onChange} />);

    // Atteintes et non courantes : l etape 1 et l etape 3. L etape courante
    // n est pas un bouton — on ne navigue pas vers la ou l on est deja.
    const boutons = screen.getAllByRole('button');
    expect(boutons).toHaveLength(2);

    await userEvent.click(boutons[0]);
    expect(onChange).toHaveBeenCalledWith(0);

    // Les trois suivantes restent inertes.
    expect(screen.getByText('Médias').closest('button')).toBeNull();
  });

  it('reste en lecture seule sans onChange', () => {
    render(<StepRail items={ITEMS} current={3} furthest={5} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('StepRail — rail intermediaire (992-1199 px)', () => {
  beforeEach(() => {
    palier.xl = false;
    palier.desktop = true;
  });

  it('n affiche que le titre de l etape courante, les autres restant annonces', () => {
    render(<StepRail items={ITEMS} current={1} />);

    // Le titre courant est visible ; les autres ne sont plus qu un texte
    // destine aux lecteurs d ecran, donc toujours dans le document.
    expect(screen.getByText('Localisation')).toBeInTheDocument();
    expect(screen.getByText('Caractéristiques générales')).toHaveClass('sr-only');
  });

  it('prefere le titre abrege pour l etape courante', () => {
    render(<StepRail items={ITEMS} current={4} />);
    expect(screen.getByText('Spécificités')).toBeInTheDocument();
  });
});

describe('StepRail — repli (< 992 px)', () => {
  beforeEach(etroit);

  it('rend une barre de progression situee, sans pastille', () => {
    render(<StepRail items={ITEMS} current={1} />);

    const barre = screen.getByRole('progressbar');
    expect(barre).toHaveAttribute('aria-valuenow', '2');
    expect(barre).toHaveAttribute('aria-valuemax', '6');
    expect(barre).toHaveAttribute('aria-valuetext', 'Étape 2 sur 6');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('annonce l etape suivante sans repeter le titre courant', () => {
    render(<StepRail items={ITEMS} current={2} />);

    expect(screen.getByText('Étape 3 sur 6')).toBeInTheDocument();
    expect(screen.getByText('Puis : Prix et conditions')).toBeInTheDocument();
    expect(screen.queryByText('Caractéristiques générales')).toBeNull();
  });

  it('omet l etape suivante sur la derniere', () => {
    render(<StepRail items={ITEMS} current={5} />);

    expect(screen.getByText('Étape 6 sur 6')).toBeInTheDocument();
    expect(screen.queryByText(/^Puis : /)).toBeNull();
  });
});
