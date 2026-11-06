import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Recette gestion locative du 04/11/2026 : formulaire « Générer un document »
 * (BUG-027 période du relevé, 028/029 types sans générateur, 030 titre) et
 * onglet Documents d'un bail (BUG-031 paramètres d'adresse préfixés).
 */

const post = vi.fn();
const get = vi.fn();
vi.mock('../../utils/api-client', () => ({
  FILE_DOWNLOAD_TIMEOUT_MS: 120_000,
  default: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a)
  }
}));

import { DocumentForm } from '../../components/rental/DocumentForm';
import { generateDocument, listDocuments } from '../../services/rental-service';
import { Documents } from '../../pages/rental/Documents';

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [] } });
  post.mockResolvedValue({ data: { success: true, data: { id: 'd' }, message: 'ok' } });
});

describe('generateDocument (service)', () => {
  it('envoie titre, description et période du relevé', async () => {
    await generateDocument('a1', {
      type: 'STATEMENT' as never,
      leaseId: 'bail-1',
      title: 'Mon titre',
      description: 'Ma description',
      startDate: '2026-01-01',
      endDate: '2026-03-31'
    });
    expect(post).toHaveBeenCalledWith(
      '/tenants/a1/documents/generate',
      expect.objectContaining({
        docType: 'RENT_STATEMENT',
        title: 'Mon titre',
        description: 'Ma description',
        startDate: '2026-01-01',
        endDate: '2026-03-31'
      }),
      // Génération et conversion PDF : délai long (BUG-2026-11-04-042).
      expect.objectContaining({ timeout: 120_000 })
    );
  });

  it('ne ramène plus un type sans générateur à un reçu de loyer', async () => {
    for (const type of ['LEASE_ADDENDUM', 'RENT_QUITTANCE', 'DEPOSIT_RECEIPT', 'OTHER']) {
      post.mockClear();
      await generateDocument('a1', { type: type as never, leaseId: 'bail-1' });
      expect(post.mock.calls[0][1].docType).toBe(type);
    }
  });
});

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AntApp>
      <DocumentForm tenantId="a1" leaseId="bail-1" onSubmit={onSubmit} />
    </AntApp>
  );
  return onSubmit;
}

describe('DocumentForm', () => {
  it('ne propose plus les types sans générateur', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('combobox', { name: /type de document/i }));
    await screen.findByTitle('Relevé');
    const labels = Array.from(document.querySelectorAll('.ant-select-item-option')).map(o => o.getAttribute('title'));
    expect(labels).toEqual(expect.arrayContaining(['Contrat de bail', 'Reçu de loyer', 'Relevé']));
    for (const absent of ['Avenant', 'Quittance de loyer', 'Reçu de dépôt', 'Autre']) {
      expect(labels).not.toContain(absent);
    }
  });

  it('demande une période pour le relevé, avec fin >= début', async () => {
    const onSubmit = renderForm();
    expect(screen.queryByLabelText('Début de la période')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: /type de document/i }));
    await userEvent.click(await screen.findByTitle('Relevé'));

    const debut = await screen.findByLabelText('Début de la période');
    const fin = screen.getByLabelText('Fin de la période');

    // Dates absentes : refus.
    await userEvent.click(screen.getByRole('button', { name: 'Générer le document' }));
    expect(await screen.findByText('La date de début est requise')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Fin avant début : refus.
    await userEvent.type(debut, '2026-03-01');
    await userEvent.type(fin, '2026-02-01');
    await userEvent.click(screen.getByRole('button', { name: 'Générer le document' }));
    expect(
      await screen.findByText('La date de fin doit être postérieure ou égale à la date de début')
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Période valide : envoyée.
    await userEvent.clear(fin);
    await userEvent.type(fin, '2026-03-31');
    await userEvent.click(screen.getByRole('button', { name: 'Générer le document' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: 'STATEMENT',
      startDate: '2026-03-01',
      endDate: '2026-03-31'
    });
  });
});

describe('Documents en onglet de bail — paramètres d’adresse', () => {
  it('lit ses filtres sous le préfixe doc_ et ignore le statut des échéances', async () => {
    const lister = vi.fn().mockResolvedValue({ data: [], pagination: { total: 0 } });
    // L'écran appelle `listDocuments` via le service réel : on observe la requête réseau.
    get.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      lister(url, config?.params);
      return { data: { success: true, data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } } };
    });
    void listDocuments;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <MemoryRouter initialEntries={['/tenant/a1/rental/leases/bail-1?status=OVERDUE&doc_status=FINAL']}>
            <Routes>
              <Route path="/tenant/:tenantId/rental/leases/:leaseId" element={<Documents leaseId="bail-1" />} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </QueryClientProvider>
    );
    await waitFor(() => expect(lister).toHaveBeenCalled());
    const appel = lister.mock.calls.find(c => String(c[0]).includes('documents'));
    expect(JSON.stringify(appel)).toContain('FINAL');
    expect(JSON.stringify(appel)).not.toContain('OVERDUE');
  });
});
