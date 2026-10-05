import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StockWhatsapp } from '../../pages/finance/StockWhatsapp';
import type {
  ConversationMessage,
  RegistrationView,
  RegistrationWithCode,
  WhatsappOverview
} from '../../types/finance-stock-whatsapp-types';

/**
 * W-E1 — Onglet « WhatsApp » de Gestion du stock (lot 041, ecrans §5 et §8).
 *
 * L'écran est monté par-dessus un `apiClient` simulé, service réel : les
 * adresses et les corps vérifiés ici sont ceux que l'écran envoie vraiment.
 */

vi.mock('../../utils/api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

import apiClient from '../../utils/api-client';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const TENANT = 'agence-1';
const CHANTIER = 'chantier-riviera';

function abilities(canManageSettings: boolean) {
  return {
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canValidateCount: true,
    canDispose: true,
    canManageTakers: true,
    valuesVisible: true,
    canViewAlerts: true,
    canManageSettings
  };
}

function fieldContext(canManageSettings: boolean) {
  return {
    data: {
      success: true,
      data: {
        locations: [],
        sites: [],
        costCategories: [],
        items: [],
        takers: [],
        receivableInvoices: [],
        reasonCodes: { count: [], scrap: [], supplierReturn: [], transfer: [] },
        settings: { requireTaker: false, backdatingLimitDays: 7 },
        abilities: abilities(canManageSettings),
        people: []
      },
      meta: { valuesVisible: true, blindLocationIds: [] }
    }
  };
}

function overview(simulatorAvailable: boolean): WhatsappOverview {
  return {
    transport: simulatorAvailable ? 'log' : 'meta',
    gatewayReady: true,
    botNumber: '+225 01 00 00 00 00',
    simulatorAvailable,
    vision: { provider: 'fake', model: 'fake-1' },
    quota: { month: '2026-10', used: 10, limit: 500, source: 'OPTION', blocks: 1 },
    measures: {}
  };
}

const KOFFI: RegistrationView = {
  id: 'inscription-koffi',
  userId: 'user-koffi',
  userLabel: 'Koffi Yao',
  phoneE164: '+2250700000001',
  phoneMasked: '+225 07 •• •• •• 01',
  status: 'ACTIVE',
  access: { ok: true },
  sites: [{ siteId: CHANTIER, name: 'Villa de la Riviera', eligible: true }],
  createdAt: '2026-09-27T16:00:00.000Z'
};

const CREATED: RegistrationWithCode = {
  ...KOFFI,
  id: 'inscription-ibrahim',
  userId: 'user-ibrahim',
  userLabel: 'Ibrahim Ouattara',
  status: 'PENDING_ACTIVATION',
  activationExpiresAt: '2026-10-07T10:00:00.000Z',
  activationCode: '482913',
  botNumber: '+225 01 00 00 00 00'
};

const BOT_MESSAGES: ConversationMessage[] = [
  {
    id: 'm1',
    direction: 'OUTBOUND',
    kind: 'BUTTONS',
    text: 'Ciment : je compte 60 sacs. Est-ce correct ?',
    interactive: [
      { id: 'confirm:yes', title: 'Oui' },
      { id: 'confirm:fix', title: 'Corriger' }
    ],
    createdAt: '2026-10-04T09:39:35.000Z'
  }
];

interface Options {
  canManageSettings?: boolean;
  simulatorAvailable?: boolean;
  registrations?: RegistrationView[];
  conversation?: ConversationMessage[];
}

function routerGet(options: Options) {
  const {
    canManageSettings = true,
    simulatorAvailable = false,
    registrations = [KOFFI],
    conversation = BOT_MESSAGES
  } = options;
  get.mockImplementation(async (url: string) => {
    if (url.endsWith('/stock/field-context')) return fieldContext(canManageSettings);
    if (url.includes('/stock/whatsapp/overview'))
      return { data: { success: true, data: overview(simulatorAvailable) } };
    if (url.includes('/stock/whatsapp/registrations')) return { data: { success: true, data: registrations } };
    if (url.includes('/stock/whatsapp/eligible-members')) {
      return {
        data: {
          success: true,
          data: [
            { userId: 'user-koffi', label: 'Koffi Yao', registered: true },
            { userId: 'user-ibrahim', label: 'Ibrahim Ouattara', registered: false }
          ]
        }
      };
    }
    if (url.includes('/stock/whatsapp/eligible-sites')) {
      return { data: { success: true, data: [{ siteId: CHANTIER, name: 'Villa de la Riviera', eligible: true }] } };
    }
    if (url.includes('/stock/whatsapp/simulator/conversation')) {
      return { data: { success: true, data: { session: null, messages: conversation } } };
    }
    throw new Error(`GET inattendu : ${url}`);
  });
}

function monter(url = `/tenant/${TENANT}/finance/stock/whatsapp`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/tenant/:tenantId/finance/stock/whatsapp" element={<StockWhatsapp />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

function champ(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Champ « ${id} » introuvable.`);
  return element;
}

async function choisirOption(id: string, texte: string | RegExp): Promise<void> {
  fireEvent.mouseDown(champ(id));
  const menu = await waitFor(() => {
    const liste = document.getElementById(`${id}_list`);
    const menuDuChamp = liste?.closest('.ant-select-dropdown');
    if (!menuDuChamp) throw new Error(`Menu du sélecteur « ${id} » introuvable.`);
    return menuDuChamp as HTMLElement;
  });
  const candidats = await within(menu).findAllByText(texte);
  const option = candidats.find(element => element.closest('.ant-select-item'));
  if (!option) throw new Error(`Option « ${String(texte)} » absente du menu « ${id} ».`);
  fireEvent.click(option);
}

function apiError(status: number, code: string, message: string, data?: unknown) {
  return Object.assign(new Error(message), { response: { status, data: { success: false, code, message, data } } });
}

async function ouvrirInscription() {
  fireEvent.click(await screen.findByRole('button', { name: /Inscrire un chef de chantier/ }));
  await waitFor(() => champ('stock-whatsapp-registration_userId'));
  await choisirOption('stock-whatsapp-registration_userId', 'Ibrahim Ouattara');
  fireEvent.change(champ('stock-whatsapp-registration_phone'), { target: { value: '07 12 34 56 78' } });
  await choisirOption('stock-whatsapp-registration_siteIds', 'Villa de la Riviera');
}

function boutonInscrire(): HTMLElement {
  const dialog = screen.getByRole('dialog', { name: 'Inscrire un chef de chantier' });
  return within(dialog).getByRole('button', { name: 'Inscrire' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Onglet WhatsApp — refus', () => {
  it('sans canManageSettings, affiche le refus et n’appelle aucune route WhatsApp', async () => {
    routerGet({ canManageSettings: false });
    monter();
    expect(await screen.findByText('Réservé aux administrateurs du stock')).toBeInTheDocument();
    expect(
      screen.getByText('L’inscription des chefs de chantier demande le droit de paramétrer la finance.')
    ).toBeInTheDocument();
    const urls = get.mock.calls.map(call => String(call[0]));
    expect(urls.some(url => url.includes('/stock/whatsapp'))).toBe(false);
  });
});

describe('Onglet WhatsApp — inscriptions', () => {
  it('affiche le numéro masqué, jamais le numéro en clair', async () => {
    routerGet({});
    monter();
    expect(await screen.findByText('+225 07 •• •• •• 01')).toBeInTheDocument();
    expect(screen.queryByText('+2250700000001')).not.toBeInTheDocument();
  });

  it('pose l’erreur de numéro sur le champ numéro', async () => {
    routerGet({});
    post.mockRejectedValueOnce(apiError(400, 'STOCK_WHATSAPP_PHONE_INVALID', 'Numéro invalide.'));
    monter();
    await ouvrirInscription();
    fireEvent.click(boutonInscrire());
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, corps] = post.mock.calls[0];
    expect(url).toBe(`/tenants/${TENANT}/finance/stock/whatsapp/registrations`);
    expect(corps).toEqual({ userId: 'user-ibrahim', phone: '07 12 34 56 78', siteIds: [CHANTIER] });
    const item = champ('stock-whatsapp-registration_phone').closest('.ant-form-item') as HTMLElement;
    expect(await within(item).findByText('Numéro invalide.')).toBeInTheDocument();
  });

  it('pose les chantiers refusés sur le champ chantiers, et le membre refusé sur le champ chef', async () => {
    routerGet({});
    post.mockRejectedValueOnce(
      apiError(409, 'STOCK_WHATSAPP_SITE_NOT_ELIGIBLE', 'Chantier non éligible.', { siteIds: [CHANTIER] })
    );
    monter();
    await ouvrirInscription();
    fireEvent.click(boutonInscrire());
    const sites = () => champ('stock-whatsapp-registration_siteIds').closest('.ant-form-item') as HTMLElement;
    expect(await within(sites()).findByText('Chantiers non éligibles : Villa de la Riviera')).toBeInTheDocument();

    const appelsMembres = () => get.mock.calls.filter(call => String(call[0]).includes('/eligible-members')).length;
    const avant = appelsMembres();
    post.mockRejectedValueOnce(apiError(409, 'STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE', 'Ce membre n’est plus éligible.'));
    fireEvent.click(boutonInscrire());
    const chef = champ('stock-whatsapp-registration_userId').closest('.ant-form-item') as HTMLElement;
    expect(await within(chef).findByText('Ce membre n’est plus éligible.')).toBeInTheDocument();
    await waitFor(() => expect(appelsMembres()).toBeGreaterThan(avant));
  });

  it('montre le code une fois, puis plus jamais après fermeture', async () => {
    routerGet({});
    post.mockResolvedValueOnce({ data: { success: true, data: CREATED } });
    monter();
    await ouvrirInscription();
    fireEvent.click(boutonInscrire());
    const code = await screen.findByTestId('activation-code');
    expect(code).toHaveTextContent('482 913');
    expect(
      screen.getByText('Ce code ne sera plus affiché. Notez-le ou régénérez-en un plus tard.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ouvrez WhatsApp, écrivez au +225 01 00 00 00 00 et envoyez ce code : 482913.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByTestId('activation-code')).not.toBeInTheDocument());
    expect(document.body.textContent ?? '').not.toContain('482 913');
    expect(document.body.textContent ?? '').not.toContain('482913');
  });

  it('révoque avec le motif saisi, sans autre champ dans le corps', async () => {
    routerGet({});
    post.mockResolvedValueOnce({ data: { success: true, data: { ...KOFFI, status: 'REVOKED' } } });
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Actions de Koffi Yao' }));
    fireEvent.click(await screen.findByText('Révoquer'));
    const dialog = await screen.findByRole('dialog', { name: 'Révoquer l’accès' });
    expect(
      within(dialog).getByText(
        'Révoquer l’accès de Koffi Yao ? Le bot refusera ses prochains messages. Une photo en attente de réponse sera abandonnée.'
      )
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fin de mission' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][0]).toBe(`/tenants/${TENANT}/finance/stock/whatsapp/registrations/${KOFFI.id}/revoke`);
    expect(post.mock.calls[0][1]).toEqual({ reason: 'Fin de mission' });
  });
});

describe('Onglet WhatsApp — modifier les chantiers (rec041-01)', () => {
  it('première ouverture, chantiers chargés en différé : les chantiers affectés sont cochés', async () => {
    routerGet({});
    const routeur = get.getMockImplementation() as (url: string) => Promise<unknown>;
    let livrer: () => void = () => undefined;
    const chantiersDifferes = new Promise<void>(resolve => {
      livrer = resolve;
    });
    get.mockImplementation(async (url: string) => {
      if (url.includes('/stock/whatsapp/eligible-sites')) {
        await chantiersDifferes;
        return {
          data: {
            success: true,
            data: [
              { siteId: CHANTIER, name: 'Villa de la Riviera', eligible: true },
              { siteId: 'chantier-cocody', name: 'Résidence Cocody', eligible: true }
            ]
          }
        };
      }
      return routeur(url);
    });
    monter();
    fireEvent.click(await screen.findByRole('button', { name: 'Actions de Koffi Yao' }));
    fireEvent.click(await screen.findByText('Modifier les chantiers'));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier les chantiers' });
    // Tant que les chantiers actuels ne sont pas posés, « Enregistrer » reste fermé.
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    livrer();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).not.toBeDisabled());
    const choisis = await waitFor(() => {
      const items = Array.from(dialog.querySelectorAll('.ant-select-selection-item')).map(item => item.textContent);
      if (items.length === 0) throw new Error('aucun chantier coché');
      return items;
    });
    expect(choisis).toEqual(['Villa de la Riviera']);
  });
});

describe('Onglet WhatsApp — simulateur', () => {
  it('est absent quand le serveur ne le déclare pas disponible', async () => {
    routerGet({ simulatorAvailable: false });
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    expect(await screen.findByRole('tab', { name: 'Chefs de chantier' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Simulateur' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Simulateur de recette : les messages ne partent pas sur WhatsApp.')
    ).not.toBeInTheDocument();
  });

  it('rend les boutons du bot cliquables : un clic envoie la réponse', async () => {
    routerGet({ simulatorAvailable: true });
    post.mockResolvedValue({ data: { success: true, data: { metaMessageId: 'sim-1' } } });
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    expect(
      await screen.findByText('Simulateur de recette : les messages ne partent pas sur WhatsApp.')
    ).toBeInTheDocument();
    const oui = await screen.findByRole('button', { name: 'Oui' });
    fireEvent.click(oui);
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [url, corps] = post.mock.calls[0];
    expect(url).toBe(`/tenants/${TENANT}/finance/stock/whatsapp/simulator/messages`);
    expect(corps).toEqual({ registrationId: KOFFI.id, replyId: 'confirm:yes', replyTitle: 'Oui' });
  });

  it('propose une inscription révoquée, en fin de liste, et affiche le refus M06 de son fil', async () => {
    const AWA: RegistrationView = {
      ...KOFFI,
      id: 'inscription-awa',
      userId: 'user-awa',
      userLabel: 'Awa Diallo',
      status: 'REVOKED'
    };
    const M06: ConversationMessage = {
      id: 'm06',
      direction: 'OUTBOUND',
      kind: 'TEXT',
      text: 'Votre accès à l’inventaire par WhatsApp a été retiré.',
      createdAt: '2026-10-04T10:00:00.000Z'
    };
    routerGet({ simulatorAvailable: true, registrations: [AWA, KOFFI], conversation: [M06] });
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    // L'inscription active est choisie d'abord ; la révoquée reste sélectionnable.
    await screen.findByText('Koffi Yao · +225 07 •• •• •• 01 — Actif');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Expéditeur' }));
    const options = await waitFor(() => {
      const items = Array.from(document.querySelectorAll('.ant-select-item-option')).map(item => item.textContent);
      if (items.length < 3) throw new Error('menu incomplet');
      return items;
    });
    expect(options).toEqual([
      'Koffi Yao · +225 07 •• •• •• 01 — Actif',
      'Awa Diallo · +225 07 •• •• •• 01 — Révoqué',
      'Numéro inconnu'
    ]);
    const awa = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
      item => item.textContent === 'Awa Diallo · +225 07 •• •• •• 01 — Révoqué'
    );
    fireEvent.click(awa as Element);
    expect(
      await screen.findByText('Inscription révoquée : le bot doit répondre que l’accès est retiré.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        get.mock.calls.some(
          call =>
            String(call[0]).includes('/simulator/conversation') && JSON.stringify(call).includes('inscription-awa')
        )
      ).toBe(true)
    );
    expect(await screen.findByText('Votre accès à l’inventaire par WhatsApp a été retiré.')).toBeInTheDocument();
  });

  it('distingue deux inscriptions d’un même chef par le numéro masqué et le statut de chacune', async () => {
    const ANCIENNE: RegistrationView = {
      ...KOFFI,
      id: 'inscription-koffi-ancienne',
      phoneE164: '+2250500000009',
      phoneMasked: '+225 05 •• •• •• 09',
      status: 'REVOKED'
    };
    routerGet({ simulatorAvailable: true, registrations: [ANCIENNE, KOFFI], conversation: [] });
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    await screen.findByText('Koffi Yao · +225 07 •• •• •• 01 — Actif');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Expéditeur' }));
    const options = await waitFor(() => {
      const items = Array.from(document.querySelectorAll('.ant-select-item-option')).map(item => item.textContent);
      if (items.length < 3) throw new Error('menu incomplet');
      return items;
    });
    expect(options).toEqual([
      'Koffi Yao · +225 07 •• •• •• 01 — Actif',
      'Koffi Yao · +225 05 •• •• •• 09 — Révoqué',
      'Numéro inconnu'
    ]);
    expect(document.body.textContent ?? '').not.toContain('+2250700000001');
    expect(document.body.textContent ?? '').not.toContain('+2250500000009');
  });

  it('relit la vue d’ensemble (quota du mois) après un envoi', async () => {
    routerGet({ simulatorAvailable: true });
    post.mockResolvedValue({ data: { success: true, data: { metaMessageId: 'sim-1' } } });
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    const saisie = await screen.findByRole('textbox', { name: 'Écrire un message' });
    const lecturesVue = () =>
      get.mock.calls.filter(call => String(call[0]).includes('/stock/whatsapp/overview')).length;
    await waitFor(() => expect(lecturesVue()).toBeGreaterThan(0));
    const avant = lecturesVue();
    fireEvent.change(saisie, { target: { value: 'AIDE' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer$/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(lecturesVue()).toBeGreaterThan(avant));
  });

  it('affiche sous l’expéditeur le refus du serveur pour une inscription révoquée', async () => {
    const AWA: RegistrationView = { ...KOFFI, id: 'inscription-awa', userLabel: 'Awa Diallo', status: 'REVOKED' };
    routerGet({ simulatorAvailable: true, registrations: [AWA], conversation: [] });
    post.mockRejectedValueOnce(
      apiError(400, 'VALIDATION_ERROR', 'Ce numéro est inscrit : choisissez son inscription, ou un autre numéro libre.')
    );
    monter(`/tenant/${TENANT}/finance/stock/whatsapp?onglet=simulateur`);
    const saisie = await screen.findByRole('textbox', { name: 'Écrire un message' });
    fireEvent.change(saisie, { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer$/ }));
    expect(await screen.findByText('Message refusé par le serveur')).toBeInTheDocument();
    expect(
      screen.getByText('Ce numéro est inscrit : choisissez son inscription, ou un autre numéro libre.')
    ).toBeInTheDocument();
    expect(post.mock.calls[0][1]).toEqual({ registrationId: 'inscription-awa', text: 'Bonjour' });
  });
});
