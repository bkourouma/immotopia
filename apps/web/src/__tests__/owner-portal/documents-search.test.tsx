import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Documents from '../../pages/OwnerPortal/Documents';

/**
 * Documents du portail propriétaire : liste paginée par le serveur, pilotée par
 * la barre de recherche. Le type de document est désormais filtré par le serveur.
 */

const getDocuments = vi.hoisted(() => vi.fn());
const getProperties = vi.hoisted(() => vi.fn());
const downloadDocument = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/ownerPortalService', () => ({
  ownerPortalService: {
    getDocuments: (...args: unknown[]) => getDocuments(...args),
    getProperties: (...args: unknown[]) => getProperties(...args),
    downloadDocument: (...args: unknown[]) => downloadDocument(...args)
  }
}));

const DOCUMENT = {
  id: 'doc12345678',
  type: 'RENT_RECEIPT',
  document_number: 'QUI-2026-001',
  title: 'Quittance octobre 2026',
  downloadPath: '/portal/owner/documents/doc12345678/download',
  issued_at: '2026-10-05T00:00:00.000Z',
  status: 'FINAL',
  lease: { property: { address: 'Villa Angré' } }
};

const reponse = (documents: unknown[]) => ({
  data: {
    success: true,
    data: {
      documents,
      groupedByType: {},
      pagination: { page: 1, limit: 20, total: documents.length, totalPages: 1 }
    }
  }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/owner/documents') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/owner/documents" element={<Documents />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  getDocuments.mockReset();
  getProperties.mockReset();
  downloadDocument.mockReset();
  getDocuments.mockResolvedValue(reponse([DOCUMENT]));
  getProperties.mockResolvedValue({
    data: { success: true, data: { properties: [{ id: 'p1', address: 'Villa Angré' }] } }
  });
});

describe('Documents propriétaire : recherche multicritères', () => {
  it('charge la première page sans critère et ne demande les biens qu’une fois', async () => {
    renderPage();
    expect(await screen.findByText('Quittance octobre 2026', undefined, T)).toBeInTheDocument();
    expect(getDocuments).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(getProperties).toHaveBeenCalledTimes(1);
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Quittance octobre 2026', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'QUI-2026');
    await vi.waitFor(
      () => expect(getDocuments).toHaveBeenLastCalledWith({ search: 'QUI-2026', page: 1, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=QUI-2026');
  });

  it('applique le type d’une URL partagée côté serveur', async () => {
    renderPage('/owner/documents?documentType=RENT_RECEIPT,LEASE_CONTRACT');
    await screen.findByText('Quittance octobre 2026', undefined, T);
    expect(getDocuments).toHaveBeenCalledWith({
      documentType: 'RENT_RECEIPT,LEASE_CONTRACT',
      page: 1,
      limit: 20
    });
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    getDocuments.mockImplementation(async (params: Record<string, unknown>) =>
      reponse(params.search ? [] : [DOCUMENT])
    );
    renderPage('/owner/documents?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('Quittance octobre 2026', undefined, T)).toBeInTheDocument();
    expect(getDocuments).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
