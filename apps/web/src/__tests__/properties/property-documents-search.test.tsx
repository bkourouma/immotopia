import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { PropertyDocumentsTab } from '../../components/properties/PropertyDocumentsTab';

/**
 * Onglet « Documents » de la fiche d'un bien : barre de recherche locale,
 * préfixe d'URL `pdoc` (`doc` est pris par l'onglet patrimoine de la même fiche).
 */

const listPropertyDocuments = vi.fn();

vi.mock('../../services/property-service', () => ({
  __esModule: true,
  listPropertyDocuments: (...a: unknown[]) => listPropertyDocuments(...a),
  deletePropertyDocument: vi.fn(),
  downloadPropertyDocumentFile: vi.fn()
}));
vi.mock('../../components/properties/PropertyDocumentUpload', () => ({
  PropertyDocumentUpload: () => null
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'xl', isMobile: false, isTablet: false, isDesktop: true })
}));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

const doc = (id: string, fileName: string, documentType: string) => ({
  id,
  propertyId: 'p1',
  documentType,
  fileName,
  isRequired: false,
  isValid: true,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z'
});

beforeEach(() => {
  listPropertyDocuments
    .mockReset()
    .mockResolvedValue([doc('1', 'titre-foncier-riviera.pdf', 'TITLE_DEED'), doc('2', 'plan-masse.pdf', 'PLAN')]);
});

function monter() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/fiche']}>
        <Url />
        <PropertyDocumentsTab tenantId="t1" propertyId="p1" />
      </MemoryRouter>
    </AntApp>
  );
}

describe('Documents d’un bien : recherche locale', () => {
  it('affiche la barre de recherche', async () => {
    monter();
    await screen.findByText('titre-foncier-riviera.pdf', undefined, T);
    expect(screen.getByRole('search', { name: 'Rechercher dans les documents' })).toBeInTheDocument();
  });

  it('filtre par nom de fichier et écrit pdoc.q dans l’URL', async () => {
    const user = userEvent.setup();
    monter();
    await screen.findByText('titre-foncier-riviera.pdf', undefined, T);

    await user.type(
      within(screen.getByRole('search', { name: 'Rechercher dans les documents' })).getByRole('textbox'),
      'MASSE'
    );
    await waitFor(() => expect(screen.queryByText('titre-foncier-riviera.pdf')).toBeNull(), T);
    expect(screen.getByText('plan-masse.pdf')).toBeInTheDocument();
    const url = screen.getByTestId('url').textContent ?? '';
    expect(url).toContain('pdoc.q=MASSE');
    expect(url).not.toMatch(/[?&]doc\.q=/);
  });
});
