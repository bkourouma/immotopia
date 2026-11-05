import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { SyndicDocuments } from '../../pages/syndics/SyndicDocuments';

/**
 * Coffre documentaire : la liste arrive en entier (bornée par la copropriété) et n'est plus
 * filtrée par le serveur par type : recherche et pagination LOCALES (URL sans préfixe).
 */

const listSyndicDocuments = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/syndic-service', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../../services/syndic-service')),
  listSyndicDocuments: (...args: unknown[]) => listSyndicDocuments(...args)
}));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ permissions: null, ready: true, disabled: new Set(), enabled: new Set() })
}));

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

const T = { timeout: 8000 };

const DOCS = [
  {
    id: 'd1',
    syndicateId: 'syndic-1',
    title: 'Règlement 2026',
    type: 'REGULATION',
    fileUrl: '/uploads/syndics/syndic-1/documents/reglement-copro.pdf',
    visibleToCoOwners: true,
    createdAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'd2',
    syndicateId: 'syndic-1',
    title: 'Contrat assurance immeuble',
    type: 'INSURANCE',
    fileUrl: '/uploads/syndics/syndic-1/documents/axa-police.pdf',
    expiresAt: '2026-12-31T00:00:00.000Z',
    visibleToCoOwners: false,
    createdAt: '2026-03-15T00:00:00.000Z'
  }
];

function Url() {
  return <div data-testid="url">{decodeURIComponent(useLocation().search)}</div>;
}

function mount(search = '') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[`/documents${search}`]}>
        <Url />
        <Routes>
          <Route path="/documents" element={<SyndicDocuments />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const bar = () => screen.getByRole('search', { name: 'Rechercher dans les documents' });

beforeEach(() => {
  vi.clearAllMocks();
  listSyndicDocuments.mockResolvedValue(DOCS);
});

describe('SyndicDocuments : recherche du coffre', () => {
  it('charge la liste une seule fois, sans filtre de type côté serveur', async () => {
    mount();
    await screen.findByText('Règlement 2026', undefined, T);
    expect(listSyndicDocuments).toHaveBeenCalledTimes(1);
    expect(listSyndicDocuments).toHaveBeenCalledWith('tenant-1', 'syndic-1');
  });

  it('la saisie filtre en local sur le titre, sans nouvel appel serveur', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Règlement 2026', undefined, T);

    await user.type(within(bar()).getByRole('textbox'), 'ASSURANCE');
    await vi.waitFor(() => expect(screen.queryByText('Règlement 2026')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Contrat assurance immeuble')).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=ASSURANCE');
    expect(listSyndicDocuments).toHaveBeenCalledTimes(1);
  });

  it('la saisie trouve aussi un document par le nom de son fichier', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Règlement 2026', undefined, T);

    await user.type(within(bar()).getByRole('textbox'), 'axa-police');
    await vi.waitFor(() => expect(screen.queryByText('Règlement 2026')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Contrat assurance immeuble')).toBeInTheDocument();
  });

  it('le type de l’URL filtre en local', async () => {
    mount('?type=REGULATION');
    await screen.findByText('Règlement 2026', undefined, T);
    expect(screen.queryByText('Contrat assurance immeuble')).not.toBeInTheDocument();
    expect(listSyndicDocuments).toHaveBeenCalledTimes(1);
  });

  it('la visibilité « Interne » de l’URL garde les documents non visibles du portail', async () => {
    mount('?portal=0');
    await screen.findByText('Contrat assurance immeuble', undefined, T);
    expect(screen.queryByText('Règlement 2026')).not.toBeInTheDocument();
  });

  it('la date d’ajout « du… au… » de l’URL filtre les documents', async () => {
    mount('?addedFrom=2026-03-01&addedTo=2026-03-31');
    await screen.findByText('Contrat assurance immeuble', undefined, T);
    expect(screen.queryByText('Règlement 2026')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    mount('?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    await vi.waitFor(() => expect(screen.getByTestId('url').textContent).not.toContain('q=zzz'), T);
    expect(await screen.findByText('Règlement 2026', undefined, T)).toBeInTheDocument();
  });
});
