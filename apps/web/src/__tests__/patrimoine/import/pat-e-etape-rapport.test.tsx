import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { EtapeRapport } from '../../../pages/patrimoine/import/EtapeImportRapport';
import type { LigneRapport } from '../../../lib/importation/rapport';

/** Étape « Rapport » de l'import : recherche locale dans le tableau des lignes à expliquer. */

vi.mock('../../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function ligne(numero: number, statut: LigneRapport['statut'], motif: string, nom = ''): LigneRapport {
  return { numero, statut, motif, detail: null, textes: nom ? { title: nom } : {} };
}

const LIGNES: LigneRapport[] = [
  ligne(2, 'importee', 'Créée.', 'Villa Importée'),
  ligne(3, 'refusee_serveur', 'Quota dépassé côté serveur', 'Villa Refusée'),
  ligne(4, 'partielle', 'Valorisation à ajouter', 'Villa Partielle'),
  ligne(5, 'non_traitee', 'Import arrêté', 'Villa Oubliée')
];

function monter(initial = '/tenant/t1/patrimoine/importation', lignes = LIGNES) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <EtapeRapport
          lignes={lignes}
          compteRendu={null}
          nbARelancer={0}
          onTelecharger={vi.fn()}
          onRelancer={vi.fn()}
          onRevenir={vi.fn()}
          onRecommencer={vi.fn()}
        />
      </MemoryRouter>
    </AntApp>
  );
}

describe('<EtapeRapport> — recherche dans les lignes à expliquer', () => {
  it('filtre par texte (nom, motif) sans toucher aux compteurs', async () => {
    const user = userEvent.setup();
    monter();

    await screen.findByText('Quota dépassé côté serveur', undefined, T);
    expect(screen.getByText('Valorisation à ajouter')).toBeInTheDocument();
    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans le rapport' })).getByPlaceholderText(/N° de ligne/),
      'oubliee'
    );

    await waitFor(() => expect(screen.queryByText('Quota dépassé côté serveur')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Import arrêté')).toBeInTheDocument();
    // Les compteurs restent calculés sur TOUTES les lignes (1 importée, 1 refusée, 1 partielle, 1 non traitée).
    expect(screen.getByText('Importées').closest('tr')).toHaveTextContent('1');
    expect(screen.getByText('Refusées par le serveur').closest('tr')).toHaveTextContent('1');
  });

  it('filtre par statut depuis l’URL partagée (préfixe rap)', async () => {
    monter('/tenant/t1/patrimoine/importation?rap.statut=partielle');

    expect(await screen.findByText('Valorisation à ajouter', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Quota dépassé côté serveur')).not.toBeInTheDocument();
    expect(screen.queryByText('Import arrêté')).not.toBeInTheDocument();
  });

  it('distingue « aucun résultat » du rapport vide et propose d’effacer quand rien ne correspond', async () => {
    const user = userEvent.setup();
    monter('/tenant/t1/patrimoine/importation?rap.q=zzzz');

    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Quota dépassé côté serveur', undefined, T)).toBeInTheDocument();
  });
});
