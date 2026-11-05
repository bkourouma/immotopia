import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentTemplates } from '../../pages/documents/DocumentTemplates';

/**
 * Modèles de documents — recherche multicritères (lot DIV-A). L'API rend la
 * collection entière (sans filtre) : recherche, type, statut et « par défaut »
 * se font en local, l'état vit dans l'URL.
 */

const get = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/entitlements-service', () => ({
  getMenuEntitlements: vi.fn(async () => ({ enforcement: 'warn' }))
}));

function modele(id: string, name: string, docType: string, status = 'ACTIVE', isDefault = false) {
  return {
    id,
    doc_type: docType,
    name,
    status,
    is_default: isDefault,
    original_filename: `${name}.docx`,
    placeholders: ['AGENCE_NOM'],
    created_at: '2026-10-01T00:00:00.000Z'
  };
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/tenant/agence-1/documents/templates') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AntApp>
        <MemoryRouter initialEntries={[initial]}>
          <Url />
          <Routes>
            <Route path="/tenant/:tenantId/documents/templates" element={<DocumentTemplates />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({
    data: {
      success: true,
      data: [
        modele('m1', 'Bail standard', 'LEASE_HABITATION', 'ACTIVE', true),
        modele('m2', 'Reçu mensuel', 'RENT_RECEIPT'),
        modele('m3', 'Relevé trimestriel', 'RENT_STATEMENT', 'INACTIVE')
      ]
    }
  });
});

describe('Modèles de documents — recherche multicritères', () => {
  it('charge la collection entière une fois, sans filtre envoyé au serveur', async () => {
    mount();
    expect(await screen.findByText('Bail standard', undefined, T)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/tenants/agence-1/documents/templates');
    expect(screen.getByText('3 résultats')).toBeInTheDocument();
  });

  it('le champ libre filtre en local (nom, fichier, type) et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Bail standard', undefined, T);
    get.mockClear();

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'reçu');

    expect(await screen.findByText('1 résultat', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('Reçu mensuel')).toBeInTheDocument();
    expect(screen.queryByText('Bail standard')).not.toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=');
    // Rien ne repart vers le serveur : la recherche est locale.
    expect(get).not.toHaveBeenCalled();
  });

  it('relit les critères de l’URL : type et statut', async () => {
    mount('/tenant/agence-1/documents/templates?docType=RENT_STATEMENT,RENT_RECEIPT&status=INACTIVE');
    expect(await screen.findByText('Relevé trimestriel', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Reçu mensuel')).not.toBeInTheDocument();
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });

  it('« par défaut » ne garde que le modèle par défaut', async () => {
    mount('/tenant/agence-1/documents/templates?isDefault=1');
    expect(await screen.findByText('Bail standard', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Reçu mensuel')).not.toBeInTheDocument();
  });
});
