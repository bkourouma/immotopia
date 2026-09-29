import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';

/**
 * Newsletter — recette OI G.13 à G.16 (fiches BUG-2026-09-29-013 à 018).
 *
 * Seul `apiClient` est simulé : les vrais services et écrans tournent par-dessus.
 */

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));
// L'éditeur de code (Prism) n'apporte rien à ces scénarios : un champ texte suffit.
vi.mock('../../components/HtmlCodeEditor', () => ({
  HtmlCodeEditor: ({ value, onChange }: { value?: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="Corps HTML" value={value ?? ''} onChange={e => onChange?.(e.target.value)} />
  )
}));
vi.mock('../../components/crm/AdvancedContactSearch', () => ({
  AdvancedContactSearch: () => <div>recherche CRM</div>
}));

import apiClient from '../../utils/api-client';
import { NewsletterTemplatesPage } from '../../pages/newsletter/NewsletterTemplatesPage';
import { NewsletterCampaignsPage } from '../../pages/newsletter/NewsletterCampaignsPage';
import { NewsletterListsPage } from '../../pages/newsletter/NewsletterListsPage';
import { ConfirmPage } from '../../pages/newsletter/ConfirmPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

const apiError = (status: number, message: string) => ({
  message: `Request failed with status code ${status}`,
  response: { status, data: { success: false, message } }
});

function renderAt(path: string, pattern: string, element: React.ReactElement) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const NOW = '2026-09-29T04:27:48.000Z';
const campaign = (over: Record<string, unknown> = {}) => ({
  id: 'camp-1',
  listId: 'list-1',
  listName: 'Newsletter OI',
  templateId: null,
  subject: 'Test envoi immédiat OI',
  bodyHtml: '<p>Bonjour {{prenom}} <a href="{{lien_desinscription}}">Se désabonner</a></p>',
  status: 'DRAFT',
  scheduledAt: null,
  sentAt: null,
  sentCount: 0,
  failedCount: 0,
  openCount: 0,
  createdAt: NOW,
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Modèles — suppression refusée (BUG-015)', () => {
  it('affiche le message français de l’API, pas « Request failed with status code 400 »', async () => {
    get.mockResolvedValue({
      data: [{ id: 'tpl-1', name: 'Modèle OI', html: '<p>{{contenu}}</p>', createdAt: NOW, updatedAt: NOW }]
    });
    del.mockRejectedValue(apiError(400, 'Ce template est utilisé par une campagne planifiée.'));
    const user = userEvent.setup();

    renderAt('/tenant/t1/newsletter/templates', '/tenant/:tenantId/newsletter/templates', <NewsletterTemplatesPage />);

    await user.click(await screen.findByRole('button', { name: /Supprimer/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByText('Ce template est utilisé par une campagne planifiée.')).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });
});

describe('Campagnes', () => {
  beforeEach(() => {
    get.mockImplementation((url: string) => {
      if (url.includes('/campaigns/sent-1/recipients')) {
        return Promise.resolve({
          data: {
            recipients: [
              {
                id: 'r1',
                email: 'mariam.oi@recette.test',
                status: 'SENT',
                sentAt: NOW,
                openedAt: null,
                failureReason: null
              },
              {
                id: 'r2',
                email: 'ko@recette.test',
                status: 'FAILED',
                sentAt: null,
                openedAt: null,
                failureReason: 'Boîte pleine'
              }
            ],
            pagination: { total: 2, page: 1, limit: 50, totalPages: 1 }
          }
        });
      }
      if (url.includes('/newsletter/campaigns')) {
        return Promise.resolve({
          data: {
            campaigns: [
              campaign({ id: 'sent-1', status: 'SENT', sentCount: 1, sentAt: NOW }),
              campaign({ id: 'draft-1', subject: 'Brouillon vide', status: 'DRAFT' })
            ],
            pagination: { total: 2, page: 1, limit: 20, totalPages: 1 }
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('propose « Destinataires » sur une campagne envoyée et liste statut, date et motif (BUG-017)', async () => {
    const user = userEvent.setup();

    renderAt('/tenant/t1/newsletter/campaigns', '/tenant/:tenantId/newsletter/campaigns', <NewsletterCampaignsPage />);

    await user.click(await screen.findByRole('button', { name: /Destinataires/ }));

    expect(await screen.findByText('mariam.oi@recette.test')).toBeInTheDocument();
    expect(screen.getByText('ko@recette.test')).toBeInTheDocument();
    expect(screen.getByText('Boîte pleine')).toBeInTheDocument();
  });

  it('n’annonce pas « Campagne envoyée » quand l’API répond une campagne en échec (BUG-018)', async () => {
    post.mockResolvedValue({ data: campaign({ id: 'draft-1', status: 'FAILED', sentCount: 0, failedCount: 0 }) });
    const user = userEvent.setup();

    renderAt('/tenant/t1/newsletter/campaigns', '/tenant/:tenantId/newsletter/campaigns', <NewsletterCampaignsPage />);

    await user.click(await screen.findByRole('button', { name: /Envoyer$/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(await screen.findByText(/n'a pas pu être envoyée/)).toBeInTheDocument();
    expect(screen.queryByText('Campagne envoyée')).not.toBeInTheDocument();
  });

  it('affiche le refus de l’API (liste vide) au lieu du message technique', async () => {
    post.mockRejectedValue(apiError(400, "La liste ne contient aucun abonné actif : la campagne n'a pas été envoyée."));
    const user = userEvent.setup();

    renderAt('/tenant/t1/newsletter/campaigns', '/tenant/:tenantId/newsletter/campaigns', <NewsletterCampaignsPage />);

    await user.click(await screen.findByRole('button', { name: /Envoyer$/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText(/aucun abonné actif/)).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });
});

describe('Listes — ajout manuel d’un abonné (BUG-014)', () => {
  it('ajoute une adresse saisie à une liste manuelle', async () => {
    get.mockImplementation((url: string) => {
      if (url.endsWith('/newsletter/lists')) {
        return Promise.resolve({
          data: [
            {
              id: 'list-1',
              tenantId: 't1',
              name: 'Newsletter OI',
              type: 'MANUAL',
              doubleOptIn: false,
              publicSubscribeToken: 'lst_abc',
              totalCount: 0,
              activeCount: 0,
              unsubscribedCount: 0,
              createdAt: NOW,
              updatedAt: NOW
            }
          ]
        });
      }
      return Promise.resolve({
        data: { subscribers: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }
      });
    });
    post.mockResolvedValue({ data: { id: 'sub-1', email: 'nouveau@recette.test' } });
    const user = userEvent.setup();

    renderAt('/tenant/t1/newsletter/lists', '/tenant/:tenantId/newsletter/lists', <NewsletterListsPage />);

    await user.click(await screen.findByText('Newsletter OI'));
    await user.click(await screen.findByRole('button', { name: /Ajouter un abonné/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Adresse e-mail'), 'nouveau@recette.test');
    await user.type(within(dialog).getByLabelText('Nom (facultatif)'), 'Awa Traoré');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/tenants/t1/newsletter/lists/list-1/subscribers', {
        email: 'nouveau@recette.test',
        name: 'Awa Traoré'
      })
    );
    expect(await screen.findByText('Abonné ajouté')).toBeInTheDocument();
  });
});

describe('Page de confirmation d’inscription (BUG-013)', () => {
  it('ne confirme qu’une seule fois même quand React rejoue l’effet (StrictMode)', async () => {
    get.mockResolvedValue({ data: { success: true, message: 'Votre inscription a été confirmée.' } });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/newsletter/confirm?token=abc']}>
          <Routes>
            <Route path="/newsletter/confirm" element={<ConfirmPage />} />
          </Routes>
        </MemoryRouter>
      </React.StrictMode>
    );

    expect(await screen.findByText('Inscription confirmée')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('affiche l’état « déjà inscrit » sans passer par l’erreur', async () => {
    get.mockResolvedValue({ data: { success: true, message: 'Vous êtes déjà inscrit à cette newsletter.' } });

    render(
      <MemoryRouter initialEntries={['/newsletter/confirm?token=abc']}>
        <Routes>
          <Route path="/newsletter/confirm" element={<ConfirmPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Vous êtes déjà inscrit à cette newsletter.')).toBeInTheDocument();
    expect(screen.queryByText('Erreur')).not.toBeInTheDocument();
  });
});
