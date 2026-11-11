import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { InvitationsList } from '../../pages/tenant/InvitationsList';
import { NewsletterTemplatesPage } from '../../pages/newsletter/NewsletterTemplatesPage';

/**
 * Lot DIV-C : plus de tableau sans pagination. Invitations et modèles de
 * newsletter (locale, 20 par page).
 */

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const apiGet = vi.fn();
vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => apiGet(...a) }
}));
vi.mock('../../services/invitation-service', () => ({
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn()
}));

const listTemplates = vi.fn();
vi.mock('../../services/newsletter.service', () => ({
  newsletterService: {
    listTemplates: (...a: unknown[]) => listTemplates(...a),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn()
  }
}));
vi.mock('../../components/HtmlCodeEditor', () => ({ HtmlCodeEditor: () => null }));

function wrap(path: string, route: string, element: React.ReactElement) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvitationsList — pagination locale', () => {
  it('affiche 20 invitations par page et passe à la suivante', async () => {
    const invitations = Array.from({ length: 25 }, (_, i) => ({
      id: `i${i}`,
      email: `invite${String(i).padStart(2, '0')}@ex.com`,
      status: 'PENDING',
      invitedAt: '2026-10-01T10:00:00.000Z',
      expiresAt: '2099-10-01T10:00:00.000Z',
      roleIds: []
    }));
    apiGet.mockResolvedValue({ data: { success: true, data: invitations } });
    wrap('/tenant/t1/invitations', '/tenant/:tenantId/invitations', <InvitationsList />);

    expect(await screen.findByText('invite00@ex.com')).toBeInTheDocument();
    expect(screen.getByText('invite19@ex.com')).toBeInTheDocument();
    expect(screen.queryByText('invite20@ex.com')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('invite20@ex.com')).toBeInTheDocument();
    expect(screen.queryByText('invite00@ex.com')).not.toBeInTheDocument();
  });
});

describe('InvitationsList — recherche locale', () => {
  it('filtre sur l’e-mail sans tenir compte de la casse et propose d’effacer', async () => {
    const user = userEvent.setup();
    apiGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'a',
            email: 'Awa@Ex.com',
            status: 'PENDING',
            invitedAt: '2026-10-01T10:00:00.000Z',
            expiresAt: '2099-10-01T10:00:00.000Z',
            roleIds: []
          },
          {
            id: 'b',
            email: 'koffi@ex.com',
            status: 'ACCEPTED',
            invitedAt: '2026-10-02T10:00:00.000Z',
            expiresAt: '2099-10-01T10:00:00.000Z',
            roleIds: []
          }
        ]
      }
    });
    wrap('/tenant/t1/invitations', '/tenant/:tenantId/invitations', <InvitationsList />);
    await screen.findByText('Awa@Ex.com', undefined, { timeout: 8000 });
    await user.type(within(screen.getByRole('search')).getAllByRole('textbox')[0], 'KOFFI');
    await vi.waitFor(() => expect(screen.queryByText('Awa@Ex.com')).not.toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByText('koffi@ex.com')).toBeInTheDocument();
  });
});

describe('NewsletterTemplatesPage — pagination locale', () => {
  it('pagine 25 modèles', async () => {
    listTemplates.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({
        id: `m${i}`,
        name: `Modele ${String(i).padStart(2, '0')}`,
        html: '<p>x</p>'
      }))
    );
    wrap('/tenant/t1/newsletter/templates', '/tenant/:tenantId/newsletter/templates', <NewsletterTemplatesPage />);

    expect(await screen.findByText('Modele 00')).toBeInTheDocument();
    expect(screen.queryByText('Modele 20')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(await screen.findByText('Modele 20')).toBeInTheDocument();
  });
});

describe('NewsletterTemplatesPage — recherche locale', () => {
  it('cherche dans le nom du modèle', async () => {
    const user = userEvent.setup();
    listTemplates.mockResolvedValue([
      { id: 'm1', name: 'Promotion été', html: '<p>x</p>' },
      { id: 'm2', name: 'Voeux', html: '<p>y</p>' }
    ]);
    wrap('/tenant/t1/newsletter/templates', '/tenant/:tenantId/newsletter/templates', <NewsletterTemplatesPage />);
    await screen.findByText('Promotion été', undefined, { timeout: 8000 });
    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'promotion ete');
    await vi.waitFor(() => expect(screen.queryByText('Voeux')).not.toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByText('Promotion été')).toBeInTheDocument();
  });
});
