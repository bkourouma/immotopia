import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App } from 'antd';
import { SyndicDocuments } from '../../pages/syndics/SyndicDocuments';
import { DocumentVault } from '../../components/syndics/DocumentVault';
import type { SyndicateDocument } from '../../types/syndic-types';

const service = vi.hoisted(() => ({
  listSyndicDocuments: vi.fn(),
  createSyndicDocument: vi.fn(),
  updateSyndicDocument: vi.fn(),
  downloadSyndicDocument: vi.fn()
}));
vi.mock('../../services/syndic-service', () => service);

const feedbackMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../lib/feedback', () => ({ feedback: feedbackMock }));

vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ permissions: null, ready: true, disabled: new Set(), enabled: new Set() })
}));

vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

const doc = (over: Partial<SyndicateDocument> = {}): SyndicateDocument => ({
  id: 'd1',
  syndicateId: 'syndic-1',
  title: 'Règlement 2026',
  type: 'REGULATION',
  fileUrl: '/uploads/x.pdf',
  visibleToCoOwners: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over
});

function renderPage() {
  return render(
    <App>
      <MemoryRouter initialEntries={['/documents']}>
        <Routes>
          <Route path="/documents" element={<SyndicDocuments />} />
        </Routes>
      </MemoryRouter>
    </App>
  );
}

async function openModalAndChooseType(label: string) {
  fireEvent.click((await screen.findAllByText('Ajouter un document'))[0]);
  const dialog = await screen.findByRole('dialog');
  const combo = within(dialog).getByRole('combobox');
  fireEvent.mouseDown(combo);
  const options = await screen.findAllByText(label);
  fireEvent.click(options[options.length - 1]);
  return dialog;
}

const checkbox = (dialog: HTMLElement) => within(dialog).getByRole('checkbox') as HTMLInputElement;

describe('SyndicDocuments : visibilité par document', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.listSyndicDocuments.mockResolvedValue([]);
  });

  it("la case suit le type tant qu'elle n'est pas touchée", async () => {
    renderPage();
    const dialog = await openModalAndChooseType('Règlement de copropriété');
    expect(checkbox(dialog).checked).toBe(true);

    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    const others = await screen.findAllByText('Autre');
    fireEvent.click(others[others.length - 1]);
    await waitFor(() => expect(checkbox(dialog).checked).toBe(false));
  });

  it('une fois touchée, la case ne suit plus le type', async () => {
    renderPage();
    const dialog = await openModalAndChooseType('Autre');
    expect(checkbox(dialog).checked).toBe(false);

    fireEvent.click(checkbox(dialog));
    expect(checkbox(dialog).checked).toBe(true);

    fireEvent.mouseDown(within(dialog).getByRole('combobox'));
    const diag = await screen.findAllByText('Diagnostic');
    fireEvent.click(diag[diag.length - 1]);
    await waitFor(() => expect(within(dialog).getAllByText('Diagnostic').length).toBeGreaterThan(0));
    expect(checkbox(dialog).checked).toBe(true);
  });

  it('envoie la valeur choisie à createSyndicDocument', async () => {
    service.createSyndicDocument.mockResolvedValue(doc());
    renderPage();
    const dialog = await openModalAndChooseType('Règlement de copropriété');

    fireEvent.change(within(dialog).getByRole('textbox', { name: /Titre/ }), { target: { value: 'Mon règlement' } });
    const file = new File(['pdf'], 'reglement.pdf', { type: 'application/pdf' });
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    fireEvent.click(checkbox(dialog)); // décoche : choix explicite du gestionnaire
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(service.createSyndicDocument).toHaveBeenCalled());
    expect(service.createSyndicDocument).toHaveBeenCalledWith(
      'tenant-1',
      'syndic-1',
      expect.objectContaining({ title: 'Mon règlement', type: 'REGULATION', visibleToCoOwners: false })
    );
  });
});

describe('DocumentVault : portail des copropriétaires', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche « Règlement de copropriété » et bascule la visibilité après confirmation', async () => {
    service.updateSyndicDocument.mockResolvedValue(doc({ visibleToCoOwners: false }));
    const onChanged = vi.fn();
    render(
      <App>
        <DocumentVault documents={[doc()]} tenantId="tenant-1" syndicId="syndic-1" canEdit onChanged={onChanged} />
      </App>
    );

    expect(screen.getByText('Règlement de copropriété')).toBeTruthy();
    expect(screen.getAllByText('Visible au portail').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer du portail' }));
    expect(service.updateSyndicDocument).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));

    await waitFor(() =>
      expect(service.updateSyndicDocument).toHaveBeenCalledWith('tenant-1', 'syndic-1', 'd1', {
        visibleToCoOwners: false
      })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("masque l'action de visibilité sans droit d'édition", () => {
    render(
      <App>
        <DocumentVault documents={[doc()]} tenantId="tenant-1" syndicId="syndic-1" />
      </App>
    );
    expect(screen.queryByRole('button', { name: 'Retirer du portail' })).toBeNull();
  });
});
