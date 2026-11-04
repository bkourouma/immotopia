import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Documents } from '../../pages/rental/Documents';

/** Documents : recherche multicritères (mode serveur, préfixe `doc` en onglet de bail). */

const listDocuments = vi.hoisted(() => vi.fn());

vi.mock('../../services/rental-service', () => ({
  listDocuments: (...a: unknown[]) => listDocuments(...a),
  generateDocument: vi.fn(),
  regenerateDocument: vi.fn(),
  downloadDocument: vi.fn()
}));

vi.mock('../../components/rental/DocumentForm', () => ({ DocumentForm: () => <div>formulaire de génération</div> }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const DOC = {
  id: 'doc-1',
  tenant_id: 'agence-1',
  type: 'LEASE_CONTRACT',
  status: 'FINAL',
  lease_id: 'bail-1',
  document_number: 'DOC-2026-0001',
  title: 'Contrat de bail',
  issued_at: '2026-01-05T00:00:00.000Z',
  created_by_user_id: 'u1',
  created_at: '',
  updated_at: ''
};

const reponse = (documents: unknown[]) => ({
  success: true,
  data: documents,
  pagination: { page: 1, limit: 50, total: documents.length, totalPages: 1 }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function renderPage(initial = '/tenant/agence-1/rental/documents', leaseId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/rental/documents" element={<Documents leaseId={leaseId} />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  listDocuments.mockReset();
  listDocuments.mockResolvedValue(reponse([DOC]));
});

describe('Documents : recherche multicritères', () => {
  it('charge la première page (50) sans critère', async () => {
    renderPage();
    expect(await screen.findByText('DOC-2026-0001', undefined, T)).toBeInTheDocument();
    expect(listDocuments).toHaveBeenCalledWith('agence-1', { page: 1, limit: 50 });
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('envoie la saisie au service après le debounce et la met dans l’URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('DOC-2026-0001', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'BAIL-12');
    await vi.waitFor(
      () => expect(listDocuments).toHaveBeenLastCalledWith('agence-1', { search: 'BAIL-12', page: 1, limit: 50 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=BAIL-12');
  });

  it('applique le type, le statut et la période d’une URL partagée', async () => {
    renderPage(
      '/tenant/agence-1/rental/documents?type=RENT_QUITTANCE&status=FINAL&emisFrom=2026-01-01&emisTo=2026-01-31'
    );
    await screen.findByText('DOC-2026-0001', undefined, T);
    expect(listDocuments).toHaveBeenCalledWith('agence-1', {
      type: 'RENT_QUITTANCE',
      status: 'FINAL',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 1,
      limit: 50
    });
  });

  it('ignore une valeur de type inconnue dans l’URL', async () => {
    renderPage('/tenant/agence-1/rental/documents?type=BOGUS');
    await screen.findByText('DOC-2026-0001', undefined, T);
    expect(listDocuments).toHaveBeenCalledWith('agence-1', { page: 1, limit: 50 });
  });

  it('en onglet de bail : filtre par bail, préfixe doc et zone de recherche nommée', async () => {
    renderPage('/tenant/agence-1/rental/documents?doc.q=abc', 'bail-9');
    await screen.findByText('DOC-2026-0001', undefined, T);
    expect(listDocuments).toHaveBeenCalledWith('agence-1', { leaseId: 'bail-9', search: 'abc', page: 1, limit: 50 });
    expect(screen.getByRole('search', { name: 'Rechercher dans les documents' })).toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    listDocuments.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [DOC])
    );
    renderPage('/tenant/agence-1/rental/documents?q=zzz');
    expect(
      await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', undefined, T)
    ).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);
    expect(await screen.findByText('DOC-2026-0001', undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).not.toContain('q=');
  });
});
