import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NewsletterCampaignsPage } from '../../pages/newsletter/NewsletterCampaignsPage';
import { NewsletterListsPage } from '../../pages/newsletter/NewsletterListsPage';

/**
 * Newsletter (lot DIV-C) : campagnes (serveur, le statut survit au changement de
 * page), listes de diffusion (local) et abonnés d'une liste (serveur).
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const svc = vi.hoisted(() => ({
  listCampaigns: vi.fn(),
  listLists: vi.fn(),
  listTemplates: vi.fn(),
  listSubscribers: vi.fn()
}));
vi.mock('../../services/newsletter.service', () => ({
  newsletterService: {
    listCampaigns: (...a: unknown[]) => svc.listCampaigns(...a),
    listLists: (...a: unknown[]) => svc.listLists(...a),
    listTemplates: (...a: unknown[]) => svc.listTemplates(...a),
    listSubscribers: (...a: unknown[]) => svc.listSubscribers(...a),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    sendCampaign: vi.fn(),
    scheduleCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
    previewCampaign: vi.fn(),
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    removeSubscriber: vi.fn(),
    exportSubscribers: vi.fn(),
    importSubscribers: vi.fn(),
    addSubscribersFromContacts: vi.fn()
  }
}));
vi.mock('../../components/crm/AdvancedContactSearch', () => ({ AdvancedContactSearch: () => null }));
vi.mock('../../components/newsletter/CampaignForm', () => ({ CampaignForm: () => null }));
vi.mock('../../components/newsletter/ImportCsvModal', () => ({ ImportCsvModal: () => null }));
vi.mock('../../components/newsletter/SubscriptionForm', () => ({ SubscriptionForm: () => null }));

const T = { timeout: 8000 };

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(path: string, route: string, element: React.ReactElement) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>
        <Url />
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const campagne = (i: number) => ({
  id: `c${i}`,
  subject: `Campagne ${i}`,
  status: 'DRAFT',
  listName: 'Clients',
  createdAt: '2026-10-01T10:00:00.000Z',
  sentCount: 0,
  failedCount: 0,
  openCount: 0
});

beforeEach(() => {
  Object.values(svc).forEach(fn => fn.mockReset());
  svc.listLists.mockResolvedValue([]);
  svc.listTemplates.mockResolvedValue([]);
  svc.listCampaigns.mockResolvedValue({
    campaigns: [campagne(1)],
    pagination: { total: 45, page: 1, limit: 20, totalPages: 3 }
  });
});

describe('NewsletterCampaignsPage — recherche serveur', () => {
  it('relit statut et période de l’URL et les envoie à l’API', async () => {
    mount(
      '/tenant/t1/newsletter/campaigns?status=DRAFT,SENT&createdFrom=2026-10-01',
      '/tenant/:tenantId/newsletter/campaigns',
      <NewsletterCampaignsPage />
    );
    await screen.findByText('Campagne 1', undefined, T);
    expect(svc.listCampaigns).toHaveBeenCalledWith('t1', {
      status: 'DRAFT,SENT',
      from: '2026-10-01',
      page: 1,
      limit: 20
    });
  });

  it('le changement de page garde le filtre de statut', async () => {
    mount(
      '/tenant/t1/newsletter/campaigns?status=DRAFT',
      '/tenant/:tenantId/newsletter/campaigns',
      <NewsletterCampaignsPage />
    );
    await screen.findByText('Campagne 1', undefined, T);
    fireEvent.click(screen.getByTitle('2'));
    await vi.waitFor(
      () => expect(svc.listCampaigns).toHaveBeenLastCalledWith('t1', { status: 'DRAFT', page: 2, limit: 20 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('status=DRAFT');
  });

  it('envoie la saisie libre à l’API', async () => {
    const user = userEvent.setup();
    mount('/tenant/t1/newsletter/campaigns', '/tenant/:tenantId/newsletter/campaigns', <NewsletterCampaignsPage />);
    await screen.findByText('Campagne 1', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'soldes');
    await vi.waitFor(
      () => expect(svc.listCampaigns).toHaveBeenLastCalledWith('t1', { search: 'soldes', page: 1, limit: 20 }),
      T
    );
  });
});

describe('NewsletterListsPage — listes et abonnés', () => {
  const LISTES = [
    {
      id: 'l1',
      name: 'Clients VIP',
      type: 'MANUAL',
      doubleOptIn: true,
      totalCount: 2,
      activeCount: 2,
      unsubscribedCount: 0
    },
    {
      id: 'l2',
      name: 'Propriétaires',
      type: 'FROM_OWNERS',
      doubleOptIn: false,
      totalCount: 5,
      activeCount: 5,
      unsubscribedCount: 0
    }
  ];

  it('filtre localement les listes de diffusion', async () => {
    const user = userEvent.setup();
    svc.listLists.mockResolvedValue(LISTES);
    mount('/tenant/t1/newsletter/lists', '/tenant/:tenantId/newsletter/lists', <NewsletterListsPage />);
    await screen.findByText('Clients VIP', undefined, T);
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'proprietaires');
    await vi.waitFor(() => expect(screen.queryByText('Clients VIP')).not.toBeInTheDocument(), T);
    expect(screen.getAllByText('Propriétaires').length).toBeGreaterThan(0);
  });

  it('envoie la recherche des abonnés à l’API', async () => {
    const user = userEvent.setup();
    svc.listLists.mockResolvedValue(LISTES);
    svc.listSubscribers.mockResolvedValue({
      subscribers: [
        { id: 's1', email: 'awa@ex.com', name: 'Awa', status: 'ACTIVE', subscribedAt: '2026-10-01T10:00:00.000Z' }
      ],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
    });
    mount('/tenant/t1/newsletter/lists', '/tenant/:tenantId/newsletter/lists', <NewsletterListsPage />);
    await user.click(await screen.findByText('Clients VIP', undefined, T));
    await screen.findByText('awa@ex.com', undefined, T);
    expect(svc.listSubscribers).toHaveBeenCalledWith('t1', 'l1', { page: 1, limit: 20 });
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'awa');
    await vi.waitFor(
      () =>
        expect(svc.listSubscribers).toHaveBeenLastCalledWith('t1', 'l1', {
          search: 'awa',
          page: 1,
          limit: 20
        }),
      T
    );
  });
});
