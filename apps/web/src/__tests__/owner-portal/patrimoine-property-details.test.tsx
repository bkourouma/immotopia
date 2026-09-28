import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import PatrimoinePropertyDetails from '../../pages/OwnerPortal/PatrimoinePropertyDetails';
import type { PatrimoinePropertyDetails as Details } from '../../services/owner-portal-patrimoine-service';

/**
 * Détail d'un bien — portail propriétaire, lot P5.
 *
 * Emprunts masqués (`sections.loans` faux) : ni bloc « Emprunts », ni
 * rendement net-net (le contrat les exclut ensemble, il révèlerait les
 * mensualités). Le téléchargement appelle le service avec le `downloadPath`
 * de la réponse, jamais une URL statique construite côté écran.
 */

const getPropertyDetails = vi.fn();
const downloadDocument = vi.fn();

vi.mock('../../services/owner-portal-patrimoine-service', async () => {
  const actual = await vi.importActual<typeof import('../../services/owner-portal-patrimoine-service')>(
    '../../services/owner-portal-patrimoine-service'
  );
  return {
    ...actual,
    ownerPortalPatrimoineService: {
      ...actual.ownerPortalPatrimoineService,
      getPropertyDetails: (...a: unknown[]) => getPropertyDetails(...a),
      downloadDocument: (...a: unknown[]) => downloadDocument(...a)
    }
  };
});

// jsdom ne fournit ni createObjectURL ni revokeObjectURL.
beforeEach(() => {
  vi.clearAllMocks();
  (window.URL as any).createObjectURL = vi.fn(() => 'blob:mock');
  (window.URL as any).revokeObjectURL = vi.fn();
});

function details(overrides: Partial<Details> = {}): Details {
  return {
    sections: { valuation: true, yield: true, loans: true, works: true, documents: true },
    property: {
      id: 'prop-1',
      title: 'Villa Cocody',
      address: 'Rue des Jardins',
      city: 'Abidjan',
      ownerSharePercent: null
    },
    valuation: { estimatedValue: 45_000_000, valuatedAt: '2026-01-10', acquisitionCost: 40_000_000, currency: 'XOF' },
    valuations: [],
    latentCapitalGain: 5_000_000,
    yield: { grossYield: 6.5, netYield: 5.1, netNetYield: 4.2, annualRent: 3_000_000, annualExpenses: 500_000 },
    loans: [
      {
        id: 'loan-1',
        lender: 'Banque Atlantique',
        capitalAmount: 20_000_000,
        remainingCapital: 12_000_000,
        interestRate: 6.5,
        monthlyPayment: 250_000,
        currency: 'XOF',
        startDate: '2023-01-01',
        endDate: null,
        status: 'ACTIVE'
      }
    ],
    works: [],
    documents: [
      {
        id: 'doc-1',
        documentType: 'TITLE_DEED',
        fileName: 'titre-propriete.pdf',
        fileSize: 12_345,
        mimeType: 'application/pdf',
        expirationDate: null,
        createdAt: '2026-01-05',
        downloadPath: '/portal/owner/patrimoine/properties/prop-1/documents/doc-1/file'
      }
    ],
    ...overrides
  };
}

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/owner/patrimoine/prop-1']}>
        <Routes>
          <Route path="/owner/patrimoine/:propertyId" element={<PatrimoinePropertyDetails />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

describe('Détail du patrimoine — emprunts masqués', () => {
  it('ne rend ni le bloc « Emprunts » ni le rendement net-net quand la rubrique est masquée', async () => {
    getPropertyDetails.mockResolvedValue(
      details({
        sections: { valuation: true, yield: true, loans: false, works: true, documents: true },
        loans: undefined,
        yield: { grossYield: 6.5, netYield: 5.1, annualRent: 3_000_000, annualExpenses: 500_000 }
      })
    );

    mount();

    expect(await screen.findByText('Villa Cocody', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('Emprunts')).not.toBeInTheDocument();
    expect(screen.queryByText('Net-Net')).not.toBeInTheDocument();
  });

  it('affiche le bloc « Emprunts » quand la rubrique est ouverte', async () => {
    getPropertyDetails.mockResolvedValue(details());

    mount();

    expect(await screen.findByText('Banque Atlantique', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText('Net-Net')).toBeInTheDocument();
  });
});

describe('Détail du patrimoine — téléchargement de document', () => {
  it('appelle le service avec le downloadPath du document', async () => {
    getPropertyDetails.mockResolvedValue(details());
    downloadDocument.mockResolvedValue(new Blob(['contenu']));

    mount();

    const bouton = await screen.findByText('Télécharger', {}, { timeout: 8000 });
    await userEvent.click(bouton);

    expect(downloadDocument).toHaveBeenCalledWith('/portal/owner/patrimoine/properties/prop-1/documents/doc-1/file');
  });
});
