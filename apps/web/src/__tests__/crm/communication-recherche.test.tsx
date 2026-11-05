import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { EmailNotificationsUnifiedPage } from '../../pages/communication/EmailNotificationsUnifiedPage';
import { WhatsAppNotificationsPage } from '../../pages/communication/WhatsAppNotificationsPage';

/**
 * Notifications e-mail et WhatsApp — recherche multicritères (lot DIV-A).
 * Catalogues d'événements reçus en entier (57 e-mails, 32 WhatsApp) : champ libre
 * et critères en local, 20 lignes par page, état dans l'URL.
 */

const listEmail = vi.fn();
const listWhatsapp = vi.fn();

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
vi.mock('../../services/whatsapp-notification-config-service', () => ({
  whatsappNotificationConfigService: {
    list: (...a: unknown[]) => listWhatsapp(...a),
    update: vi.fn(),
    reset: vi.fn()
  }
}));

function email(key: string, label: string, recipientLabel: string, enabled = true) {
  return {
    key,
    label,
    description: `Description de ${label}`,
    recipientLabel,
    enabled,
    subjectOverride: null,
    bodyHtmlOverride: null,
    configId: null,
    tenantId: 'agence-1',
    defaultSubject: '',
    defaultBodyHtml: '',
    createdAt: null,
    updatedAt: null
  };
}

function whatsapp(key: string, label: string, recipientLabel: string, enabled = true) {
  return {
    key,
    label,
    description: `Description de ${label}`,
    recipientLabel,
    enabled,
    bodyOverride: null,
    contentSid: null,
    contentVariablesJson: null,
    configId: null,
    tenantId: 'agence-1',
    defaultBody: '',
    createdAt: null,
    updatedAt: null
  };
}

function Url() {
  return <div data-testid="url">{useLocation().search}</div>;
}

function mount(element: React.ReactElement, initial: string) {
  return render(
    <AntApp>
      <MemoryRouter initialEntries={[initial]}>
        <Url />
        <Routes>
          <Route path="/tenant/:tenantId/notifications" element={element} />
        </Routes>
      </MemoryRouter>
    </AntApp>
  );
}

const T = { timeout: 8000 };

// Le catalogue est le seul tableau de la page ; l'éditeur de modèle au-dessus porte aussi des libellés d'événements.
const tableau = () => within(screen.getByRole('table'));
const tableauPret = async () => within(await screen.findByRole('table', undefined, T));
const URL_BASE = '/tenant/agence-1/notifications';

beforeEach(() => {
  vi.clearAllMocks();
  // 25 événements e-mail : plus d'une page de 20.
  listEmail.mockResolvedValue([
    email('PAYMENT_RECEIVED_OWNER', 'Paiement reçu', 'Propriétaire'),
    email('LEASE_EXPIRING_AGENCY', 'Bail bientôt échu', 'Agence', false),
    ...Array.from({ length: 23 }, (_, i) => email(`EVENT_${i}_AGENCY`, `Événement générique ${i}`, 'Agence'))
  ]);
  listWhatsapp.mockResolvedValue([
    whatsapp('RENT_REMINDER_TENANT', 'Rappel de loyer', 'Locataire'),
    whatsapp('VISIT_BOOKED_AGENCY', 'Visite réservée', 'Agence', false)
  ]);
});

describe('Notifications e-mail — recherche multicritères', () => {
  it('pagine en local (20 par page) et affiche le nombre total de résultats', async () => {
    mount(<EmailNotificationsUnifiedPage />, URL_BASE);
    expect(await (await tableauPret()).findByText('Paiement reçu', undefined, T)).toBeInTheDocument();
    expect(screen.getByText('25 résultats')).toBeInTheDocument();
    expect(tableau().queryByText('Événement générique 22')).not.toBeInTheDocument();
  });

  it('le champ libre cherche dans l’événement, la description et le destinataire, et se retrouve dans l’URL', async () => {
    const user = userEvent.setup();
    mount(<EmailNotificationsUnifiedPage />, URL_BASE);
    await tableau().findByText('Paiement reçu', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'propriétaire');

    expect(await screen.findByText('1 résultat', undefined, T)).toBeInTheDocument();
    expect(tableau().getByText('Paiement reçu')).toBeInTheDocument();
    expect(tableau().queryByText('Bail bientôt échu')).not.toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('q=');
  });

  it('relit le critère « Activer » de l’URL', async () => {
    mount(<EmailNotificationsUnifiedPage />, `${URL_BASE}?enabled=0`);
    expect(await (await tableauPret()).findByText('Bail bientôt échu', undefined, T)).toBeInTheDocument();
    expect(tableau().queryByText('Paiement reçu')).not.toBeInTheDocument();
    expect(screen.getByText('1 résultat')).toBeInTheDocument();
  });
});

describe('Notifications WhatsApp — recherche multicritères', () => {
  it('le champ libre filtre la liste en local', async () => {
    const user = userEvent.setup();
    mount(<WhatsAppNotificationsPage />, URL_BASE);
    await tableau().findByText('Rappel de loyer', undefined, T);

    await user.type(within(screen.getByRole('search')).getByRole('textbox'), 'visite');

    expect(await screen.findByText('1 résultat', undefined, T)).toBeInTheDocument();
    expect(tableau().queryByText('Rappel de loyer')).not.toBeInTheDocument();
    expect(tableau().getByText('Visite réservée')).toBeInTheDocument();
  });

  it('relit le critère « Destinataire » de l’URL', async () => {
    mount(<WhatsAppNotificationsPage />, `${URL_BASE}?recipient=Locataire`);
    expect(await (await tableauPret()).findByText('Rappel de loyer', undefined, T)).toBeInTheDocument();
    expect(tableau().queryByText('Visite réservée')).not.toBeInTheDocument();
  });
});
