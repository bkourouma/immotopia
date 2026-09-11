import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Documents } from '../../pages/rental/Documents';

/**
 * Documents — les garanties de l'écran.
 *
 * Le défaut central ne se voyait qu'en lisant le code : le téléchargement
 * contournait `apiClient` avec trente lignes de `fetch` brut écrites à même le
 * gestionnaire de clic. Aucun délai maximal, aucun rafraîchissement de session
 * sur 401, aucune nouvelle tentative. Ces tests vérifient que le téléchargement
 * passe désormais par le service — donc par l'intercepteur — et que le nom du
 * fichier vient du serveur.
 */

const listDocuments = vi.fn();
const generateDocument = vi.fn();
const regenerateDocument = vi.fn();
const downloadDocument = vi.fn();

vi.mock('../../services/rental-service', () => ({
  listDocuments: (...a: unknown[]) => listDocuments(...a),
  generateDocument: (...a: unknown[]) => generateDocument(...a),
  regenerateDocument: (...a: unknown[]) => regenerateDocument(...a),
  downloadDocument: (...a: unknown[]) => downloadDocument(...a),
  RentalDocumentType: {},
  RentalDocumentStatus: {}
}));

vi.mock('../../components/rental/DocumentForm', () => ({ DocumentForm: () => <div>formulaire de génération</div> }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

function doc(overrides: Record<string, unknown> = {}) {
  return {
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
    updated_at: '',
    ...overrides
  };
}

function mount(documents: unknown[], url = '/tenant/agence-1/rental/documents') {
  listDocuments.mockResolvedValue({
    success: true,
    data: documents,
    pagination: { page: 1, limit: 50, total: documents.length, totalPages: 1 }
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/rental/documents" element={<Documents />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

/** Le lien de téléchargement réellement créé par l'écran. */
let lienCree: HTMLAnchorElement | null = null;
const creerElementOrigine = document.createElement.bind(document);

beforeEach(() => {
  vi.clearAllMocks();
  lienCree = null;

  // jsdom n'implémente ni `createObjectURL` ni `revokeObjectURL`.
  (window.URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:atelier/1');
  (window.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

  // On intercepte la création du lien pour lire le nom de fichier demandé :
  // c'est la seule trace observable du téléchargement.
  vi.spyOn(document, 'createElement').mockImplementation(((balise: string) => {
    const element = creerElementOrigine(balise);
    if (balise === 'a') {
      lienCree = element as HTMLAnchorElement;
      element.click = vi.fn();
    }
    return element;
  }) as typeof document.createElement);

  downloadDocument.mockResolvedValue({ blob: new Blob(['x']), filename: 'contrat-de-bail.pdf' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Documents — téléchargement', () => {
  it('passe par le service, et non par un `fetch` brut', async () => {
    // Le service utilise `apiClient` : délai maximal, rafraîchissement de
    // session sur 401 et nouvelles tentatives s'appliquent. Un `fetch` brut
    // n'en bénéficie d'aucun, et une session expirée donnait
    // « Failed to download document: 401 Unauthorized ».
    const user = userEvent.setup({ delay: null });
    mount([doc()]);

    await user.click(await screen.findByRole('button', { name: /Télécharger/ }, { timeout: 8000 }));

    await waitFor(() => expect(downloadDocument).toHaveBeenCalled());
    expect(downloadDocument.mock.calls[0].slice(0, 2)).toEqual(['agence-1', 'doc-1']);
  });

  it('utilise le nom de fichier rendu par le serveur', async () => {
    // L'ancienne version forçait `.docx` pour tous les documents, y compris
    // ceux rendus en PDF : le fichier arrivait avec une extension qui ne
    // correspondait pas à son contenu et ne s'ouvrait pas.
    const user = userEvent.setup({ delay: null });
    mount([doc()]);

    await user.click(await screen.findByRole('button', { name: /Télécharger/ }, { timeout: 8000 }));
    await waitFor(() => expect(lienCree?.download).toBe('contrat-de-bail.pdf'));
  });

  it('retombe sur le numéro de document quand le serveur ne nomme rien', async () => {
    const user = userEvent.setup({ delay: null });
    mount([doc()]);

    await user.click(await screen.findByRole('button', { name: /Télécharger/ }, { timeout: 8000 }));
    await waitFor(() => expect(downloadDocument).toHaveBeenCalled());
    // Le nom de repli est transmis au service, qui s'en sert si l'en-tête
    // `Content-Disposition` est absent.
    expect(downloadDocument.mock.calls[0][2]).toBe('DOC-2026-0001');
  });
});

describe('Documents — accessibilité des actions', () => {
  it('donne un nom au menu de chaque ligne', async () => {
    // Les deux actions étaient des icônes seules avec un `title` HTML natif :
    // invisibles au clavier, muettes au lecteur d'écran, et indistinguables
    // les unes des autres d'une ligne à l'autre.
    mount([doc(), doc({ id: 'doc-2', document_number: 'DOC-2026-0002' })]);

    expect(
      await screen.findByRole('button', { name: 'Autres actions pour DOC-2026-0001' }, { timeout: 8000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autres actions pour DOC-2026-0002' })).toBeInTheDocument();
  });
});

describe('Documents — statuts', () => {
  it('affiche un document annulé en français', async () => {
    // « VOID » s'affichait en clair : le code manquait à la table de
    // `<StatusTag>`. Un test de couverture des statuts empêche désormais le
    // cas de se reproduire pour un autre code.
    mount([doc({ status: 'VOID' })]);
    expect(await screen.findByText('Annulé', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText('VOID')).not.toBeInTheDocument();
  });
});

describe('Documents — état dans l’URL', () => {
  it('restaure type et statut depuis l’adresse', async () => {
    mount([doc()], '/tenant/agence-1/rental/documents?type=RENT_QUITTANCE&status=FINAL');
    await waitFor(() => expect(listDocuments).toHaveBeenCalled());
    expect(listDocuments.mock.calls[0][1]).toMatchObject({
      type: 'RENT_QUITTANCE',
      status: 'FINAL',
      leaseId: undefined
    });
  });
});
