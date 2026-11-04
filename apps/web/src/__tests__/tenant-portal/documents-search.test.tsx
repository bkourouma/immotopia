import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import TenantDocuments from '../../pages/TenantPortal/Documents';

/** Portail locataire — documents : liste reçue en entier, recherche locale. */

const getDocuments = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../services/tenantPortalService', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenantPortalService')>();
  return {
    tenantPortalService: {
      ...actual.tenantPortalService,
      getDocuments: (...a: unknown[]) => getDocuments(...a)
    }
  };
});

const T = { timeout: 8000 };

function Adresse() {
  const location = useLocation();
  return <span data-testid="adresse">{`${location.pathname}${location.search}`}</span>;
}

function mount(url = '/tenant/documents') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[url]}>
        <Adresse />
        <Routes>
          <Route path="/tenant/documents" element={<TenantDocuments />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const adresse = () => decodeURIComponent(screen.getByTestId('adresse').textContent ?? '');

const BAIL = {
  id: 'd1',
  type: 'LEASE_CONTRACT',
  document_number: 'BAI-001',
  title: 'Contrat de bail Villa',
  downloadPath: '/x',
  issued_at: '2026-01-01T00:00:00.000Z',
  status: 'FINAL'
};
const QUITTANCE = {
  id: 'd2',
  type: 'RENT_RECEIPT',
  document_number: 'QUI-002',
  title: 'Quittance de mai',
  downloadPath: '/y',
  issued_at: '2026-05-31T00:00:00.000Z',
  status: 'FINAL'
};

beforeEach(() => {
  vi.clearAllMocks();
  getDocuments.mockResolvedValue({
    data: {
      success: true,
      data: {
        documents: [BAIL, QUITTANCE],
        groupedByType: { LEASE_CONTRACT: [BAIL], RENT_RECEIPT: [QUITTANCE] }
      }
    }
  });
});

describe('Portail locataire — recherche des documents', () => {
  it('filtre en local sur le nom, sans accent ni casse, et met la saisie dans l’adresse', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Contrat de bail Villa', {}, T);
    expect(screen.getByText('Quittance de mai')).toBeInTheDocument();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'QUITTANCE');

    await vi.waitFor(() => expect(screen.queryByText('Contrat de bail Villa')).not.toBeInTheDocument(), T);
    expect(screen.getByText('Quittance de mai')).toBeInTheDocument();
    expect(adresse()).toContain('q=QUITTANCE');
    expect(getDocuments).toHaveBeenCalledTimes(1);
  });

  it('cherche aussi par numéro', async () => {
    mount('/tenant/documents?q=BAI-001');
    await screen.findByText('Contrat de bail Villa', {}, T);
    expect(screen.queryByText('Quittance de mai')).not.toBeInTheDocument();
  });

  it('applique le type d’une adresse partagée', async () => {
    mount('/tenant/documents?type=RENT_RECEIPT');
    await screen.findByText('Quittance de mai', {}, T);
    expect(screen.queryByText('Contrat de bail Villa')).not.toBeInTheDocument();
  });

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup();
    mount('/tenant/documents?q=zzz');

    expect(await screen.findByText('Aucun élément ne correspond aux filtres appliqués.', {}, T)).toBeInTheDocument();
    const effacer = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(effacer[effacer.length - 1]);

    expect(await screen.findByText('Contrat de bail Villa', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Quittance de mai')).toBeInTheDocument();
    expect(adresse()).not.toContain('q=');
  });
});
