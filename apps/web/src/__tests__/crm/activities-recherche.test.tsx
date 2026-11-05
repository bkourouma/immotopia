import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { Activities } from '../../pages/crm/Activities';

/**
 * Activités — recherche multicritères (lot DIV-A). Liste paginée par le serveur
 * (50 par page) : le champ libre et les critères partent à l'API ; le contact
 * est un critère à recherche distante (20 résultats au plus, jamais `limit: 100`).
 */

const listActivities = vi.fn();
const listContacts = vi.fn();
const getContact = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../services/membership-service', () => ({
  listAssignableMembers: vi.fn(async () => ({
    success: true,
    data: { members: [{ user: { id: 'u1', fullName: 'Awa Koné', email: 'awa@agence.ci' } }] }
  }))
}));
vi.mock('../../services/crm-service', () => ({
  listActivities: (...a: unknown[]) => listActivities(...a),
  createActivity: vi.fn(),
  listContacts: (...a: unknown[]) => listContacts(...a),
  getContact: (...a: unknown[]) => getContact(...a)
}));
vi.mock('../../components/crm/ActivityForm', () => ({ ActivityForm: () => null }));
vi.mock('../../components/crm/ActivityTimeline', () => ({
  ActivityTimeline: ({ activities }: { activities: { id: string; subject: string }[] }) => (
    <ul>
      {activities.map(a => (
        <li key={a.id}>{a.subject}</li>
      ))}
    </ul>
  )
}));

const ACTIVITE = { id: 'a1', subject: 'Appel de suivi' };

const reponse = (activities: unknown[], total = activities.length) => ({
  success: true,
  activities,
  pagination: { page: 1, limit: 50, total, totalPages: Math.max(1, Math.ceil(total / 50)) }
});

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(initial = '/tenant/agence-1/crm/activities') {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/crm/activities" element={<Activities />} />
          <Route path="/tenant/:tenantId/crm/contacts/:contactId/activities" element={<Activities />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  listActivities.mockResolvedValue(reponse([ACTIVITE]));
  listContacts.mockResolvedValue({ success: true, contacts: [], pagination: { page: 1, limit: 20, total: 0 } });
  getContact.mockResolvedValue({
    success: true,
    data: { id: 'c1', firstName: 'Fanta', lastName: 'Kone', email: 'fanta@example.com' }
  });
});

describe('Activités — recherche multicritères', () => {
  it('charge 50 activités sans critère, et ne charge aucune liste de contacts', async () => {
    mount();
    expect(await screen.findByText('Appel de suivi', undefined, T)).toBeInTheDocument();
    expect(listActivities).toHaveBeenCalledWith('agence-1', { page: 1, limit: 50 });
    expect(listContacts).not.toHaveBeenCalled();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('la saisie part à l’API après la pause et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('Appel de suivi', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'devis');

    await vi.waitFor(
      () => expect(listActivities).toHaveBeenLastCalledWith('agence-1', { search: 'devis', page: 1, limit: 50 }),
      T
    );
    expect(screen.getByTestId('url').textContent).toContain('q=devis');
  });

  it('relit les critères de l’URL (types, contact, collaborateur, période, direction)', async () => {
    mount(
      '/tenant/agence-1/crm/activities?type=CALL,EMAIL&contactId=c1&createdBy=u1&periodFrom=2026-10-01&periodTo=2026-10-31&direction=IN'
    );
    await screen.findByText('Appel de suivi', undefined, T);
    expect(listActivities).toHaveBeenCalledWith('agence-1', {
      type: 'CALL,EMAIL',
      contactId: 'c1',
      createdBy: 'u1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      direction: 'IN',
      page: 1,
      limit: 50
    });
  });

  it('sur la page des activités d’un contact, la route pose le périmètre de départ', async () => {
    mount('/tenant/agence-1/crm/contacts/c9/activities');
    await screen.findByText('Appel de suivi', undefined, T);
    expect(listActivities).toHaveBeenCalledWith('agence-1', { contactId: 'c9', page: 1, limit: 50 });
  });

  it('sous critère sans résultat : « Aucun résultat » et « Effacer les critères »', async () => {
    const user = userEvent.setup();
    listActivities.mockImplementation(async (_t: string, params: Record<string, unknown>) =>
      reponse(params.search ? [] : [ACTIVITE])
    );
    mount('/tenant/agence-1/crm/activities?q=zzz');
    expect(await screen.findByText('Aucun résultat', undefined, T)).toBeInTheDocument();
    expect(screen.queryByText('Commencez par créer votre première activité.')).not.toBeInTheDocument();

    const boutons = screen.getAllByRole('button', { name: 'Effacer les critères' });
    await user.click(boutons[boutons.length - 1]);

    expect(await screen.findByText('Appel de suivi', undefined, T)).toBeInTheDocument();
    expect(listActivities).toHaveBeenLastCalledWith('agence-1', { page: 1, limit: 50 });
  });
});
