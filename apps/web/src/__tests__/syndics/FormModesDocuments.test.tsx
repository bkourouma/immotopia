import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App } from 'antd';
import { SyndicDocuments } from '../../pages/syndics/SyndicDocuments';

/** Formulaires paramétrables : « Ajouter un document » (formKey syndic.document), hook mocké. */

const modes = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock('../../hooks/useFormFieldModes', () => ({
  useFormFieldModes: () => ({
    loading: false,
    mode: (key: string, fallback = 'OPTIONAL') => modes.current[key] ?? fallback,
    isVisible: (key: string) => modes.current[key] !== 'HIDDEN',
    isRequired: (key: string, fallback: boolean) => (modes.current[key] ? modes.current[key] === 'REQUIRED' : fallback)
  })
}));

const service = vi.hoisted(() => ({
  listSyndicDocuments: vi.fn(),
  createSyndicDocument: vi.fn(),
  updateSyndicDocument: vi.fn(),
  downloadSyndicDocument: vi.fn()
}));
vi.mock('../../services/syndic-service', () => service);
vi.mock('../../lib/feedback', () => ({
  feedback: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));
vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../hooks/useMenuAccess', () => ({
  useMyMenuAccess: () => ({ permissions: null, ready: true, disabled: new Set(), enabled: new Set() })
}));
vi.mock('../../pages/syndics/useSyndicRouteContext', () => ({
  useSyndicRouteContext: () => ({ tenantId: 'tenant-1', syndicId: 'syndic-1' })
}));

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

async function openModal() {
  fireEvent.click((await screen.findAllByText('Ajouter un document'))[0]);
  return screen.findByRole('dialog');
}

async function fillRequired(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Titre/ }), { target: { value: 'Mon document' } });
  fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[0]);
  const options = await screen.findAllByText('Autre');
  fireEvent.click(options[options.length - 1]);
  const file = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' });
  fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

describe('Ajouter un document : modes de champs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modes.current = {};
    service.listSyndicDocuments.mockResolvedValue([]);
  });

  it('la case masquée disparaît et visibleToCoOwners n’est pas envoyé', async () => {
    modes.current = { visibleToCoOwners: 'HIDDEN' };
    service.createSyndicDocument.mockResolvedValue({ id: 'd1' });
    renderPage();
    const dialog = await openModal();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();

    await fillRequired(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter le document' }));
    await waitFor(() => expect(service.createSyndicDocument).toHaveBeenCalled());
    expect(service.createSyndicDocument.mock.calls[0][2].visibleToCoOwners).toBeUndefined();
  });

  it('la date d’expiration obligatoire bloque l’envoi avec un message', async () => {
    modes.current = { expiresAt: 'REQUIRED' };
    renderPage();
    const dialog = await openModal();
    await fillRequired(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ajouter le document' }));

    expect(await screen.findByText('Ce champ est obligatoire')).toBeTruthy();
    expect(service.createSyndicDocument).not.toHaveBeenCalled();
  });
});
