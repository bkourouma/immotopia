import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { EmailNotificationsUnifiedPage } from '../../pages/communication/EmailNotificationsUnifiedPage';

/** Notifications e-mail : l'écriture exige TENANT_SETTINGS_EDIT (audit N4), la lecture reste ouverte. */

const listEmail = vi.fn();
const getMyMenuAccess = vi.fn();

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));
vi.mock('../../components/HtmlCodeEditor', () => ({ HtmlCodeEditor: () => null }));
vi.mock('../../services/email-notification-config-service', () => ({
  emailNotificationConfigService: {
    list: (...a: unknown[]) => listEmail(...a),
    update: vi.fn(),
    reset: vi.fn()
  }
}));
vi.mock('../../services/role-menu-service', () => ({
  getMyMenuAccess: (...a: unknown[]) => getMyMenuAccess(...a)
}));

const item = {
  key: 'PAYMENT_RECEIVED_OWNER',
  label: 'Paiement reçu',
  description: 'Description',
  recipientLabel: 'Propriétaire',
  enabled: true,
  subjectOverride: null,
  bodyHtmlOverride: null,
  configId: null,
  tenantId: 'agence-1',
  defaultSubject: '',
  defaultBodyHtml: '',
  createdAt: null,
  updatedAt: null
};

function mount() {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={['/tenant/agence-1/notifications']}>
        <Routes>
          <Route path="/tenant/:tenantId/notifications" element={<EmailNotificationsUnifiedPage />} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const T = { timeout: 8000 };

beforeEach(() => {
  vi.clearAllMocks();
  listEmail.mockResolvedValue([item]);
});

describe('Notifications e-mail — droit d’écriture', () => {
  it('désactive la bascule et affiche « Lecture seule » sans TENANT_SETTINGS_EDIT', async () => {
    getMyMenuAccess.mockResolvedValue({
      disabledMenuKeys: [],
      enabledMenuKeys: [],
      permissionKeys: ['TENANT_SETTINGS_VIEW']
    });
    mount();
    expect(await screen.findByText(/Lecture seule/, undefined, T)).toBeInTheDocument();
    expect(await screen.findByRole('switch', undefined, T)).toBeDisabled();
  });

  it('laisse la bascule active avec TENANT_SETTINGS_EDIT', async () => {
    getMyMenuAccess.mockResolvedValue({
      disabledMenuKeys: [],
      enabledMenuKeys: [],
      permissionKeys: ['TENANT_SETTINGS_VIEW', 'TENANT_SETTINGS_EDIT']
    });
    mount();
    const sw = await screen.findByRole('switch', undefined, T);
    await waitFor(() => expect(getMyMenuAccess).toHaveBeenCalled());
    expect(sw).not.toBeDisabled();
    expect(screen.queryByText(/Lecture seule/)).not.toBeInTheDocument();
  });

  it('ne restreint pas un administrateur (permissionKeys nul)', async () => {
    getMyMenuAccess.mockResolvedValue({ disabledMenuKeys: [], enabledMenuKeys: [], permissionKeys: null });
    mount();
    expect(await screen.findByRole('switch', undefined, T)).not.toBeDisabled();
    expect(screen.queryByText(/Lecture seule/)).not.toBeInTheDocument();
  });
});
