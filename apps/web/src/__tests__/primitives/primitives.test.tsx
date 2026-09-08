import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  ConfirmAction,
  MoneyValue,
  PageHeader,
  StateBlock,
  StatusTag,
  formatMoney,
  statusTone
} from '../../components/primitives';

/**
 * Les primitives du Lot 0 ne sont cablees dans aucun ecran : ces tests sont
 * leur seul point d'usage. Ils verifient le contrat que les lots suivants
 * consommeront, pas le rendu pixel.
 */

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MoneyValue', () => {
  it('formate en fr-FR, sans decimale, devise suffixee', () => {
    // toLocaleString('fr-FR') pose une espace insecable etroite : on compare
    // sur les chiffres plutot que sur l'espace exact.
    expect(formatMoney(1250000).replace(/\s/g, ' ')).toBe('1 250 000 FCFA');
  });

  it('rend un tiret cadratin pour une valeur absente, jamais zero', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
  });

  it('distingue zero d une absence de donnee', () => {
    expect(formatMoney(0)).toBe('0 FCFA');
  });

  it('accepte une chaine deja espacee et omet la devise sur demande', () => {
    expect(formatMoney('1 250 000', { currency: null }).replace(/\s/g, ' ')).toBe('1 250 000');
  });

  it('aligne les chiffres en tabular-nums', () => {
    const { container } = wrap(<MoneyValue value={42} />);
    expect(container.querySelector('span')).toHaveStyle({ fontVariantNumeric: 'tabular-nums' });
  });
});

describe('StatusTag', () => {
  it('traduit un statut connu et lui attribue son intention', () => {
    wrap(<StatusTag status="OVERDUE" />);
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(statusTone('OVERDUE')).toBe('danger');
    expect(statusTone('PAID')).toBe('success');
    expect(statusTone('DRAFT')).toBe('neutral');
  });

  it('est insensible a la casse', () => {
    expect(statusTone('active')).toBe('success');
  });

  it('affiche un statut inconnu au lieu de le masquer', () => {
    wrap(<StatusTag status="STATUT_INEDIT" />);
    expect(screen.getByText('STATUT_INEDIT')).toBeInTheDocument();
    expect(statusTone('STATUT_INEDIT')).toBe('neutral');
  });
});

describe('StateBlock', () => {
  it('distingue « aucune donnee » de « aucun resultat pour ces filtres »', () => {
    const { unmount } = wrap(<StateBlock variant="empty" />);
    expect(screen.getByText('Aucune donnée')).toBeInTheDocument();
    unmount();

    wrap(<StateBlock variant="no-results" />);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  it('offre une action de sortie et annonce l erreur aux lecteurs d ecran', () => {
    const retry = vi.fn();
    wrap(
      <StateBlock
        variant="error"
        actions={[{ label: 'Réessayer', onClick: retry, primary: true }]}
        detail="Réf. HTTP-500"
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Réf. HTTP-500')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('rend un squelette, pas un spinner, pendant le chargement', () => {
    const { container } = wrap(<StateBlock variant="loading" />);
    expect(container.querySelector('.ant-skeleton')).toBeTruthy();
    expect(container.querySelector('.ant-spin')).toBeNull();
  });
});

describe('PageHeader', () => {
  it('rend le fil d Ariane dans un reperage nomme et une seule action primaire', () => {
    wrap(
      <PageHeader
        title="Baux"
        breadcrumbs={[{ label: 'Accueil', to: '/' }, { label: 'Baux' }]}
        primaryAction={{ label: 'Nouveau bail', onClick: () => undefined }}
      />
    );
    expect(screen.getByRole('navigation', { name: "Fil d'Ariane" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Baux' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('ConfirmAction', () => {
  it('ne declenche rien avant confirmation', async () => {
    const onConfirm = vi.fn();
    wrap(
      <ConfirmAction title="Supprimer le bail BAIL-2026-0184 ?" danger onConfirm={onConfirm}>
        <button type="button">Supprimer</button>
      </ConfirmAction>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).not.toHaveBeenCalled();

    // matchMedia est mocke a `matches: false` dans setupTests : le rendu est
    // celui du palier mobile, donc le bottom-sheet.
    expect(screen.getByText('Supprimer le bail BAIL-2026-0184 ?')).toBeInTheDocument();
  });
});
