import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const downloadDocument = vi.fn();
const downloadPropertyDocumentFile = vi.fn();
const saveBlob = vi.fn();

vi.mock('../../services/rental-service', () => ({
  downloadDocument: (...a: unknown[]) => downloadDocument(...a)
}));
vi.mock('../../services/property-service', () => ({
  downloadPropertyDocumentFile: (...a: unknown[]) => downloadPropertyDocumentFile(...a)
}));
vi.mock('../../utils/save-blob', () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { PropertyResultCard } from '../../components/copilot/PropertyResultCard';
import { LeaseResultCard } from '../../components/copilot/LeaseResultCard';
import { ActionProposalCard } from '../../components/copilot/ActionProposalCard';
import { DocumentDownloadCard } from '../../components/copilot/DocumentDownloadCard';
import { DocumentListCard } from '../../components/copilot/DocumentListCard';
import { CopilotMessageList } from '../../components/copilot/CopilotMessageList';
import type { ActionProposal, PropertyCardItem, LeaseCardItem } from '../../types/copilot';

const property: PropertyCardItem = {
  id: 'p1',
  internalReference: 'REF-1',
  title: 'Villa des Almadies',
  propertyType: 'MAISON_VILLA',
  status: 'AVAILABLE',
  locationZone: 'Dakar',
  address: 'Rue 1',
  price: 1000,
  currency: 'XOF',
  bedrooms: 3,
  surfaceArea: 120,
  thumbnailUrl: '/uploads/properties/p1/a.jpg'
};

const lease: LeaseCardItem = {
  id: 'l1',
  leaseNumber: 'BAIL-001',
  status: 'ACTIVE',
  propertyLabel: 'Villa',
  renterName: 'Awa',
  rentAmount: '500',
  currency: 'XOF',
  startDate: '2026-01-01T00:00:00Z'
};

function proposal(expiresAt: string): ActionProposal {
  return {
    proposalId: 'pr1',
    token: 'tok',
    expiresAt,
    action: 'GENERATE_RENTAL_DOCUMENT',
    documentType: 'RENT_RECEIPT',
    summary: {
      leaseId: 'l1',
      leaseNumber: 'BAIL-001',
      propertyLabel: 'Villa',
      renterName: 'Awa',
      periodLabel: 'Mars 2026',
      amount: '500',
      currency: 'XOF'
    }
  };
}

const future = () => new Date(Date.now() + 5 * 60_000).toISOString();
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('cartes de résultats', () => {
  it('lie la carte de bien à la fiche du bien, vignette via fileUrl', () => {
    wrap(<PropertyResultCard item={property} tenantId="t1" />);
    expect(screen.getByRole('link', { name: 'Villa des Almadies' })).toHaveAttribute(
      'href',
      '/tenant/t1/properties/p1'
    );
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toMatch(/^https?:\/\/.+\/uploads\/properties\/p1\/a\.jpg$/);
  });

  it('lie la carte de bail à la fiche du bail', () => {
    wrap(<LeaseResultCard item={lease} tenantId="t1" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tenant/t1/rental/leases/l1');
  });
});

describe('ActionProposalCard', () => {
  it('confirmer et annuler appellent leurs rappels', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ActionProposalCard
        proposal={proposal(future())}
        state="pending"
        tenantId="t1"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByRole('button', { name: /Confirmer et générer/ }));
    expect(onConfirm).toHaveBeenCalledWith('pr1');
    await user.click(screen.getByRole('button', { name: /Annuler/ }));
    expect(onCancel).toHaveBeenCalledWith('pr1');
  });

  it("n'offre pas de bouton « Modifier »", () => {
    wrap(
      <ActionProposalCard
        proposal={proposal(future())}
        state="pending"
        tenantId="t1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Annuler/ })).toBeInTheDocument();
  });

  it('est désactivée quand la proposition a expiré', () => {
    wrap(
      <ActionProposalCard
        proposal={proposal(new Date(Date.now() - 1000).toISOString())}
        state="pending"
        tenantId="t1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Confirmer et générer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Annuler/ })).toBeDisabled();
    expect(screen.getByTestId('copilot-proposal-status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(/a expiré/)).toBeInTheDocument();
  });

  it('se désactive quand l’échéance passe pendant l’affichage', async () => {
    vi.useFakeTimers();
    const { act } = await import('@testing-library/react');
    wrap(
      <ActionProposalCard
        proposal={proposal(new Date(Date.now() + 1000).toISOString())}
        state="pending"
        tenantId="t1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Confirmer et générer/ })).toBeEnabled();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: /Confirmer et générer/ })).toBeDisabled();
  });
});

describe('DocumentDownloadCard', () => {
  it('télécharge un document de location en blob puis l’enregistre', async () => {
    const blob = new Blob(['x']);
    downloadDocument.mockResolvedValue({ blob, filename: 'quittance.docx' });
    const user = userEvent.setup();
    wrap(<DocumentDownloadCard tenantId="t1" kind="rental" documentId="d1" filename="fallback.docx" />);
    await user.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'quittance.docx'));
    expect(downloadDocument).toHaveBeenCalledWith('t1', 'd1', 'fallback.docx');
  });

  it('télécharge une pièce de bien par la route /file', async () => {
    const blob = new Blob(['y']);
    downloadPropertyDocumentFile.mockResolvedValue({ blob, filename: 'titre.pdf' });
    const user = userEvent.setup();
    wrap(<DocumentDownloadCard tenantId="t1" kind="property" documentId="d2" propertyId="p1" filename="titre.pdf" />);
    await user.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'titre.pdf'));
    expect(downloadPropertyDocumentFile).toHaveBeenCalledWith('t1', 'p1', 'd2', 'titre.pdf');
  });

  it('affiche une erreur si le téléchargement échoue', async () => {
    downloadDocument.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    wrap(<DocumentDownloadCard tenantId="t1" kind="rental" documentId="d1" filename="a.docx" />);
    await user.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(await screen.findByText(/téléchargement a échoué/)).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

describe('CopilotMessageList', () => {
  it('rend le texte sûr et les pièces jointes', () => {
    wrap(
      <CopilotMessageList
        tenantId="t1"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        messages={[
          { id: 'm1', role: 'user', text: 'Bonjour', attachments: [] },
          {
            id: 'm2',
            role: 'assistant',
            text: '<script>x</script> **ok**',
            attachments: [
              { kind: 'properties', items: [property], total: 1 },
              { kind: 'leases', items: [lease] }
            ]
          }
        ]}
      />
    );
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-property-card')).toBeInTheDocument();
    expect(screen.getByTestId('copilot-lease-card')).toBeInTheDocument();
  });
});

describe('cartes : libellés et documents', () => {
  it('affiche les libellés de type, de statut et de bail plutôt que les valeurs brutes', () => {
    wrap(
      <>
        <PropertyResultCard item={property} tenantId="t1" />
        <LeaseResultCard item={lease} tenantId="t1" />
      </>
    );
    expect(screen.getByText('Maison / Villa')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.queryByText('MAISON_VILLA')).toBeNull();
    expect(screen.queryByText('ACTIVE')).toBeNull();
  });

  it('garde la valeur brute pour une énumération inconnue', () => {
    wrap(<PropertyResultCard item={{ ...property, propertyType: 'NOUVEAU_TYPE' }} tenantId="t1" />);
    expect(screen.getByText('NOUVEAU_TYPE')).toBeInTheDocument();
  });

  it('télécharge une pièce du bien B listée sur la fiche du bien A avec le propertyId de la pièce', async () => {
    const blob = new Blob(['x']);
    downloadPropertyDocumentFile.mockResolvedValue({ blob, filename: 'titre.pdf' });
    const user = userEvent.setup();
    wrap(
      <DocumentListCard
        scope="property"
        tenantId="t1"
        propertyId="A"
        items={[
          {
            id: 'd9',
            kind: 'property',
            label: 'titre.pdf',
            type: 'TITLE_DEED',
            status: null,
            date: null,
            downloadable: true,
            propertyId: 'B'
          }
        ]}
      />
    );
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(downloadPropertyDocumentFile).toHaveBeenCalledWith('t1', 'B', 'd9', 'titre.pdf'));
  });

  it("n'offre pas de téléchargement d'une pièce de bien sans propertyId connu", () => {
    wrap(
      <DocumentListCard
        scope="property"
        tenantId="t1"
        items={[
          {
            id: 'd9',
            kind: 'property',
            label: 'titre.pdf',
            type: 'TITLE_DEED',
            status: null,
            date: null,
            downloadable: true
          }
        ]}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
