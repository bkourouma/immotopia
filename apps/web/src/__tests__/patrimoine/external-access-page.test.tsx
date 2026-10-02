import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalAccessPage } from '../../pages/patrimoine/external-access/ExternalAccessPage';

/**
 * Écran « Accès partagés » : liste, création guidée, révocation, renvoi d'un
 * lien (URL affichée une seule fois) et journal.
 */

// L'assistant en quatre étapes enchaîne des dizaines de clics : sur un poste lent, plus que les 40 s par défaut.
vi.setConfig({ testTimeout: 120_000 });

const listExternalAccessGrants = vi.fn();
const getExternalAccessScopeOptions = vi.fn();
const listExternalAccessPropertyDocuments = vi.fn();
const createExternalAccessGrant = vi.fn();
const getExternalAccessGrant = vi.fn();
const updateExternalAccessGrant = vi.fn();
const revokeExternalAccessGrant = vi.fn();
const sendExternalAccessLink = vi.fn();
const listExternalAccessLog = vi.fn();

vi.mock('../../services/external-access-service', () => ({
  listExternalAccessGrants: (...a: unknown[]) => listExternalAccessGrants(...a),
  getExternalAccessScopeOptions: (...a: unknown[]) => getExternalAccessScopeOptions(...a),
  listExternalAccessPropertyDocuments: (...a: unknown[]) => listExternalAccessPropertyDocuments(...a),
  createExternalAccessGrant: (...a: unknown[]) => createExternalAccessGrant(...a),
  getExternalAccessGrant: (...a: unknown[]) => getExternalAccessGrant(...a),
  updateExternalAccessGrant: (...a: unknown[]) => updateExternalAccessGrant(...a),
  revokeExternalAccessGrant: (...a: unknown[]) => revokeExternalAccessGrant(...a),
  sendExternalAccessLink: (...a: unknown[]) => sendExternalAccessLink(...a),
  listExternalAccessLog: (...a: unknown[]) => listExternalAccessLog(...a)
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const SECRET_URL = 'https://app.example.test/acces-partage#jeton-secret-123';

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1',
    type: 'NOTARY',
    recipientName: 'Maître Koné',
    recipientEmail: 'kone@etude.test',
    ownerClientId: null,
    ownerName: null,
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    expiresAt: '2030-12-31T00:00:00.000Z',
    permanent: false,
    revokedAt: null,
    status: 'ACTIVE',
    propertyCount: 2,
    entityCount: 0,
    documentCount: 1,
    viewCount: 3,
    lastViewedAt: '2026-09-30T10:00:00.000Z',
    lastLinkSentAt: null,
    activeLinkCount: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides
  };
}

const options = {
  sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP'],
  defaultsByType: {
    NOTARY: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'],
    ACCOUNTANT: ['EXPENSES', 'RENTS', 'LOANS'],
    BANKER: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS']
  },
  maxLinkTtlDays: 30,
  owners: [{ id: 'o1', name: 'Awa Konan' }],
  properties: [
    { id: 'p1', title: 'Villa des Palmiers', reference: 'BIEN-001', ownerClientId: 'o1' },
    { id: 'p2', title: 'Immeuble Plateau', reference: 'BIEN-002', ownerClientId: null }
  ],
  entities: [{ id: 'e1', name: 'SCI Les Palmiers' }]
};

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={['/tenant/agence-1/patrimoine/external-access']}>
          <Routes>
            <Route path="/tenant/:tenantId/patrimoine/external-access" element={<ExternalAccessPage />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listExternalAccessGrants.mockResolvedValue([
    grant(),
    grant({ id: 'g2', recipientName: 'Cabinet Diallo', type: 'ACCOUNTANT', status: 'EXPIRING' }),
    grant({
      id: 'g3',
      recipientName: 'Banque Nord',
      type: 'BANKER',
      status: 'REVOKED',
      revokedAt: '2026-09-15T00:00:00.000Z'
    }),
    grant({ id: 'g4', recipientName: 'Étude Sylla', status: 'EXPIRED' })
  ]);
  getExternalAccessScopeOptions.mockResolvedValue(options);
  listExternalAccessPropertyDocuments.mockResolvedValue([
    {
      id: 'doc-1',
      fileName: 'acte-vente.pdf',
      documentType: 'NOTARIAL_DEED',
      fileSize: 1000,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]);
  listExternalAccessLog.mockResolvedValue([]);
});

describe('<ExternalAccessPage> — liste', () => {
  it('affiche les accès avec leur statut, type et rubriques', async () => {
    monter();

    expect(await screen.findByText('Maître Koné')).toBeInTheDocument();
    expect(listExternalAccessGrants).toHaveBeenCalledWith('agence-1');
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Expire bientôt')).toBeInTheDocument();
    expect(screen.getByText('Révoqué')).toBeInTheDocument();
    expect(screen.getByText('Expiré')).toBeInTheDocument();
    expect(screen.getAllByText('Notaire').length).toBeGreaterThan(0);
    expect(screen.getByText('Expert-comptable')).toBeInTheDocument();
    expect(screen.getByText('Banquier')).toBeInTheDocument();
    expect(screen.getAllByText('Titres et propriété').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Documents partageables').length).toBeGreaterThan(0);
  });

  it('épingle la colonne Actions au bord du tableau (visible sans défilement horizontal)', async () => {
    const { container } = monter();
    await screen.findByText('Maître Koné');
    const header = Array.from(container.querySelectorAll('th')).find(th => th.textContent === 'Actions');
    expect(header).toBeTruthy();
    expect(header!.className).toContain('ant-table-cell-fix-end');
  });

  it('n’offre ni modification ni révocation sur un accès déjà révoqué', async () => {
    monter();
    await screen.findByText('Banque Nord');
    // 4 accès, dont 1 révoqué : 3 « Révoquer » et 3 « Modifier ».
    expect(screen.getAllByRole('button', { name: /^Révoquer / })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Modifier / })).toHaveLength(3);
    // « Renvoyer un lien » seulement sur les accès actifs ou expirant bientôt.
    expect(screen.getAllByRole('button', { name: /^Renvoyer un lien à / })).toHaveLength(2);
  });

  it('affiche un état vide', async () => {
    listExternalAccessGrants.mockResolvedValue([]);
    monter();
    expect(await screen.findByText('Aucun accès partagé pour le moment.')).toBeInTheDocument();
  });

  it('affiche une erreur avec un bouton Réessayer', async () => {
    listExternalAccessGrants.mockRejectedValueOnce(new Error('boom'));
    monter();
    expect(await screen.findByText('Impossible de charger les accès partagés.')).toBeInTheDocument();
    listExternalAccessGrants.mockResolvedValueOnce([grant()]);
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Maître Koné')).toBeInTheDocument();
  });
});

describe('<ExternalAccessPage> — création guidée', () => {
  it('crée un accès en quatre étapes puis affiche l’URL', async () => {
    createExternalAccessGrant.mockResolvedValue({
      grant: grant({ id: 'g9', recipientName: 'Maître Traoré' }),
      link: { id: 'l1', url: SECRET_URL, expiresAt: '2026-10-08T00:00:00.000Z' },
      email: { sent: true }
    });
    monter();
    await screen.findByText('Maître Koné');
    await waitFor(() => expect(getExternalAccessScopeOptions).toHaveBeenCalled());

    await userEvent.click(screen.getAllByRole('button', { name: /Nouvel accès/ })[0]);
    const dialog = await screen.findByRole('dialog');

    // Étape 1 : « Suivant » bloqué tant que le bénéficiaire est incomplet.
    expect(within(dialog).getByRole('button', { name: 'Suivant' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Nom du bénéficiaire'), 'Maître Traoré');
    await userEvent.type(within(dialog).getByLabelText('Adresse e-mail du bénéficiaire'), 'traore@etude.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));

    // Étape 2 : au moins un bien.
    expect(within(dialog).getByRole('button', { name: 'Suivant' })).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText('BIEN-001 — Villa des Palmiers'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));

    // Étape 3 : défauts du notaire cochés ; les documents du bien sont proposés.
    expect(within(dialog).getByRole('checkbox', { name: /Titres et propriété/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Valorisations/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Emprunts/ })).not.toBeChecked();
    await userEvent.click(await within(dialog).findByLabelText('acte-vente.pdf'));
    expect(listExternalAccessPropertyDocuments).toHaveBeenCalledWith('agence-1', 'p1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));

    // Étape 4 : durée, puis création.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer l’accès' }));

    await waitFor(() => expect(createExternalAccessGrant).toHaveBeenCalledTimes(1));
    const [agence, payload] = createExternalAccessGrant.mock.calls[0];
    expect(agence).toBe('agence-1');
    expect(payload).toMatchObject({
      type: 'NOTARY',
      recipientName: 'Maître Traoré',
      recipientEmail: 'traore@etude.test',
      ownerClientId: null,
      propertyIds: ['p1'],
      entityIds: [],
      documentIds: ['doc-1'],
      sendEmail: true
    });
    expect([...payload.sections].sort()).toEqual(['DOCUMENTS', 'TITLES_OWNERSHIP', 'VALUATIONS']);
    expect(typeof payload.expiresAt).toBe('string');

    expect(await screen.findByTestId('external-access-url')).toHaveTextContent(SECRET_URL);
    expect(screen.getByRole('button', { name: /Copier le lien/ })).toBeInTheDocument();
  });

  it('change les rubriques proposées selon le type choisi', async () => {
    monter();
    await screen.findByText('Maître Koné');
    await waitFor(() => expect(getExternalAccessScopeOptions).toHaveBeenCalled());
    await userEvent.click(screen.getAllByRole('button', { name: /Nouvel accès/ })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByLabelText('Type de bénéficiaire'));
    await userEvent.click(await screen.findByTitle('Banquier'));
    await userEvent.type(within(dialog).getByLabelText('Nom du bénéficiaire'), 'Banque Sud');
    await userEvent.type(within(dialog).getByLabelText('Adresse e-mail du bénéficiaire'), 'credit@banque.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByLabelText('BIEN-002 — Immeuble Plateau'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));

    expect(within(dialog).getByRole('checkbox', { name: /Rendement et ratios/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Emprunts/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Titres et propriété/ })).not.toBeChecked();
  });
});

describe('<ExternalAccessPage> — révocation, renvoi, journal', () => {
  it('révoque un accès après confirmation', async () => {
    revokeExternalAccessGrant.mockResolvedValue(grant({ status: 'REVOKED' }));
    monter();
    await screen.findByText('Maître Koné');

    await userEvent.click(screen.getByRole('button', { name: 'Révoquer Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Révoquer l’accès de Maître Koné ?')).toBeInTheDocument();
    expect(revokeExternalAccessGrant).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(revokeExternalAccessGrant).toHaveBeenCalledWith('agence-1', 'g1'));
  });

  it('ne révoque rien quand on annule', async () => {
    monter();
    await screen.findByText('Maître Koné');
    await userEvent.click(screen.getByRole('button', { name: 'Révoquer Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(revokeExternalAccessGrant).not.toHaveBeenCalled();
  });

  it('renvoie un lien dont l’URL n’est affichée qu’une fois', async () => {
    sendExternalAccessLink.mockResolvedValue({
      link: { id: 'l2', url: SECRET_URL, expiresAt: '2026-10-08T00:00:00.000Z' },
      email: { sent: false, reason: 'EVENT_DISABLED' }
    });
    monter();
    await screen.findByText('Maître Koné');

    await userEvent.click(screen.getByRole('button', { name: 'Renvoyer un lien à Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Générer le lien' }));

    await waitFor(() =>
      expect(sendExternalAccessLink).toHaveBeenCalledWith('agence-1', 'g1', {
        linkTtlDays: 7,
        revokePreviousLinks: false,
        sendEmail: true
      })
    );
    expect(await screen.findByTestId('external-access-url')).toHaveTextContent(SECRET_URL);
    expect(
      screen.getByText('L’envoi de ce message est désactivé pour votre agence : transmettez le lien vous-même.')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /J’ai copié le lien, fermer/ }));
    await waitFor(() => expect(screen.queryByTestId('external-access-url')).not.toBeInTheDocument());
    // Rien dans la liste ne porte l'URL.
    expect(document.body.innerHTML).not.toContain('jeton-secret-123');
  });

  it('ouvre le journal des consultations d’un accès', async () => {
    listExternalAccessLog.mockResolvedValue([
      {
        id: 'a1',
        at: '2026-09-30T10:00:00.000Z',
        action: 'VIEWED',
        ipAddress: '203.0.113.9',
        userAgent: 'test',
        sections: ['VALUATIONS']
      },
      {
        id: 'a2',
        at: '2026-09-30T10:05:00.000Z',
        action: 'DOCUMENT_DOWNLOADED',
        ipAddress: null,
        userAgent: null,
        documentName: 'acte-vente.pdf'
      }
    ]);
    monter();
    await screen.findByText('Maître Koné');

    await userEvent.click(screen.getByRole('button', { name: 'Journal de Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Consultation')).toBeInTheDocument();
    expect(within(dialog).getByText('Document téléchargé')).toBeInTheDocument();
    expect(within(dialog).getByText('acte-vente.pdf')).toBeInTheDocument();
    expect(within(dialog).getByText('203.0.113.9')).toBeInTheDocument();
    expect(listExternalAccessLog).toHaveBeenCalledWith('agence-1', 'g1');
  });

  it('modifie un accès : charge le détail puis enregistre', async () => {
    getExternalAccessGrant.mockResolvedValue({
      ...grant(),
      properties: [{ id: 'p1', title: 'Villa des Palmiers', reference: 'BIEN-001' }],
      entities: [],
      documents: [{ id: 'doc-1', propertyId: 'p1', fileName: 'acte-vente.pdf' }]
    });
    updateExternalAccessGrant.mockResolvedValue(grant());
    monter();
    await screen.findByText('Maître Koné');

    await userEvent.click(screen.getByRole('button', { name: 'Modifier Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    expect(getExternalAccessGrant).toHaveBeenCalledWith('agence-1', 'g1');
    expect(within(dialog).getByLabelText('Nom du bénéficiaire')).toHaveValue('Maître Koné');
    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    }
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateExternalAccessGrant).toHaveBeenCalledTimes(1));
    const [agence, id, payload] = updateExternalAccessGrant.mock.calls[0];
    expect([agence, id]).toEqual(['agence-1', 'g1']);
    // Rien n'a changé : aucun champ n'est renvoyé.
    expect(payload).toEqual({});
  });

  it('en modification, n’envoie que le champ changé et fige le propriétaire', async () => {
    getExternalAccessGrant.mockResolvedValue({
      ...grant({ ownerClientId: 'o1', ownerName: 'Awa Konan' }),
      properties: [{ id: 'p1', title: 'Villa des Palmiers', reference: 'BIEN-001' }],
      entities: [],
      documents: [{ id: 'doc-1', propertyId: 'p1', fileName: 'acte-vente.pdf' }]
    });
    updateExternalAccessGrant.mockResolvedValue(grant());
    monter();
    await screen.findByText('Maître Koné');

    await userEvent.click(screen.getByRole('button', { name: 'Modifier Maître Koné' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Nom du bénéficiaire');
    await userEvent.clear(name);
    await userEvent.type(name, 'Maître Koné Junior');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    expect(within(dialog).getByLabelText('Propriétaire concerné (facultatif)')).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateExternalAccessGrant).toHaveBeenCalledTimes(1));
    expect(updateExternalAccessGrant.mock.calls[0][2]).toEqual({ recipientName: 'Maître Koné Junior' });
  });

  it('n’envoie pas les documents d’un bien décoché', async () => {
    // Seul BIEN-001 porte un document.
    listExternalAccessPropertyDocuments.mockImplementation(async (_agence: string, propertyId: string) =>
      propertyId === 'p1'
        ? [
            {
              id: 'doc-1',
              fileName: 'acte-vente.pdf',
              documentType: 'NOTARIAL_DEED',
              fileSize: 1000,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        : []
    );
    createExternalAccessGrant.mockResolvedValue({
      grant: grant({ id: 'g9' }),
      link: { id: 'l1', url: SECRET_URL, expiresAt: '2026-10-08T00:00:00.000Z' },
      email: { sent: true }
    });
    monter();
    await screen.findByText('Maître Koné');
    await waitFor(() => expect(getExternalAccessScopeOptions).toHaveBeenCalled());
    await userEvent.click(screen.getAllByRole('button', { name: /Nouvel accès/ })[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText('Nom du bénéficiaire'), 'Maître Traoré');
    await userEvent.type(within(dialog).getByLabelText('Adresse e-mail du bénéficiaire'), 'traore@etude.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByLabelText('BIEN-001 — Villa des Palmiers'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(await within(dialog).findByLabelText('acte-vente.pdf'));
    // Retour au périmètre : on remplace BIEN-001 par BIEN-002.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retour' }));
    await userEvent.click(within(dialog).getByLabelText('BIEN-001 — Villa des Palmiers'));
    await userEvent.click(within(dialog).getByLabelText('BIEN-002 — Immeuble Plateau'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suivant' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer l’accès' }));

    await waitFor(() => expect(createExternalAccessGrant).toHaveBeenCalledTimes(1));
    const payload = createExternalAccessGrant.mock.calls[0][1];
    expect(payload.propertyIds).toEqual(['p2']);
    expect(payload.documentIds).toEqual([]);
  });
});
