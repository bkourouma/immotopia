import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import apiClient from '../../utils/api-client';
import { ProviderInvoicesTab } from '../../components/syndics/ProviderInvoicesTab';

/**
 * Lot S6 — onglet « Factures » (liste, création, 409, paiement avec
 * avertissement de fonds négatif, annulation).
 *
 * Mock antd complet et dédié à ce fichier (plus large que le mock minimal de
 * `ProvidersDocumentsFinancesPages.test.tsx`, qui couvre délibérément moins :
 * ce composant utilise `Drawer`, `Descriptions`, `Tag`, `Upload`, quand les
 * pages Prestataires/Documents n'en avaient pas besoin).
 */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('@ant-design/icons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ant-design/icons');
  const Icon = () => <span />;
  return Object.fromEntries(Object.keys(actual).map(name => [name, Icon]));
});

// `vi.mock` est hoisté au sommet du fichier : les espions doivent l'être
// aussi (`vi.hoisted`), sinon la factory les lit avant leur déclaration.
const { messageError, messageWarning, messageSuccess } = vi.hoisted(() => ({
  messageError: vi.fn(),
  messageWarning: vi.fn(),
  messageSuccess: vi.fn()
}));

// Le bouton « Exporter » des tableaux a ses propres tests (primitives/export-menu) : ici il est neutralisé.
vi.mock('../../components/primitives/ExportMenu', () => ({ ExportMenu: () => null }));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  // Chaque `Form.useForm()` reçoit sa propre instance espionnable, dans
  // l'ORDRE DE MONTAGE : `createForm` (ProviderInvoicesTab) puis `payForm`
  // (ProviderInvoiceDrawer, toujours monté, même fermé). On s'appuie sur
  // `useState` : son initialiseur ne s'exécute qu'UNE fois par instance de
  // composant, quel que soit le nombre de re-rendus.
  let formInstances: any[] = [];
  const Form: any = passthrough('form');
  Form.useForm = () => {
    const [instance] = React.useState(() => {
      const created = {
        resetFields: () => {},
        setFieldsValue: () => {},
        getFieldValue: () => undefined,
        validateFields: async () => ({})
      };
      formInstances.push(created);
      return created;
    });
    return [instance];
  };
  Form.Item = ({ children, label }: any) => (
    <div>
      {label}
      {typeof children === 'function' ? null : children}
    </div>
  );

  const Modal: any = ({ children, open, onOk, okText, onCancel, cancelText, title }: any) =>
    open ? (
      <div>
        <div>{title}</div>
        {children}
        <button onClick={onOk}>{okText || 'OK'}</button>
        <button onClick={onCancel}>{cancelText || 'Cancel'}</button>
      </div>
    ) : null;

  const Drawer: any = ({ children, open, onClose, title }: any) =>
    open ? (
      <div>
        <div>{title}</div>
        <button onClick={onClose}>Fermer</button>
        {children}
      </div>
    ) : null;

  const Descriptions: any = ({ children }: any) => <dl>{children}</dl>;
  Descriptions.Item = ({ label, children }: any) => (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );

  // Capture chaque `<Upload>` monté (props `beforeUpload`/`accept`) : le test
  // de sécurité vérifie, sans dépendre du rendu DOM du vrai composant AntD,
  // que `beforeUpload` retourne bien `false` — sinon rc-upload lance EN PLUS
  // son propre POST du fichier vers `action` (voir le correctif de ce tour).
  let uploadRegistrations: Array<{ beforeUpload?: (file: unknown) => unknown; accept?: string }> = [];
  const Upload: any = ({ children, beforeUpload, accept }: any) => {
    uploadRegistrations.push({ beforeUpload, accept });
    return <div data-accept={accept}>{children}</div>;
  };
  Upload.Dragger = passthrough();

  const message = { success: messageSuccess, error: messageError, warning: messageWarning, info() {} };
  const appApi = {
    message,
    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return {
    ...actual,
    Descriptions,
    Drawer,
    Form,
    Modal,
    Upload,
    message,
    App: { useApp: () => appApi },
    __mocks: {
      get formInstances() {
        return formInstances;
      },
      get uploadRegistrations() {
        return uploadRegistrations;
      },
      resetForms() {
        formInstances = [];
        uploadRegistrations = [];
      }
    }
  };
});

const { __mocks } = (await import('antd')) as unknown as {
  __mocks: {
    formInstances: any[];
    uploadRegistrations: Array<{ beforeUpload?: (file: unknown) => unknown; accept?: string }>;
    resetForms: () => void;
  };
};

const mockApiClient = apiClient as any;

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

const ok = (data: unknown) => ({ data: { success: true, data } });
const EMPTY_LIST = { items: [], total: 0, page: 1, limit: 20 };

/** Réponses du faux serveur : la liste et le détail sont ceux que le test pose. */
const server: { list: any; detail: any } = { list: EMPTY_LIST, detail: null };

/** Route chaque GET par son URL (l'ordre des appels ne compte plus). */
function installServer() {
  server.list = EMPTY_LIST;
  server.detail = null;
  mockApiClient.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/incidents')) return ok([]);
    if (url.endsWith('/fonds')) {
      return ok([{ id: 'fund-1', name: 'Compte courant', balance: 1000, currency: 'XOF' }]);
    }
    if (url.endsWith('/budgets')) return ok([]);
    if (url.endsWith('/prestataires/soldes')) return ok([]);
    if (url.endsWith('/factures-prestataires')) return ok(server.list);
    if (/\/factures-prestataires\/[^/]+$/.test(url)) return ok(server.detail);
    throw new Error(`GET inattendu : ${url}`);
  });
}

function renderTab(props: Partial<React.ComponentProps<typeof ProviderInvoicesTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProviderInvoicesTab tenantId="tenant-1" syndicId="syndic-1" providers={[]} contracts={[]} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const INVOICE = {
  id: 'inv-1',
  provider: { id: 'p1', name: 'Ascenseurs Pro' },
  number: 'F-2026-001',
  label: 'Entretien ascenseur',
  invoiceDate: '2026-01-05T00:00:00.000Z',
  amountTTC: 118000,
  amountPaid: 0,
  amountDue: 118000,
  currency: 'XOF',
  hasFile: false,
  status: 'RECORDED'
};

const DETAIL = {
  id: 'inv-1',
  number: 'F-2026-001',
  label: 'Entretien ascenseur',
  invoiceDate: '2026-01-05T00:00:00.000Z',
  dueDate: null,
  amountHT: 100000,
  vatAmount: 18000,
  amountTTC: 118000,
  amountPaid: 0,
  amountDue: 118000,
  currency: 'XOF',
  hasFile: false,
  status: 'RECORDED',
  provider: { id: 'p1', name: 'Ascenseurs Pro' },
  contract: null,
  incident: null,
  budgetLine: null,
  fund: null,
  payments: []
};

describe('ProviderInvoicesTab', () => {
  beforeEach(() => {
    // `resetAllMocks` (et non `clearAllMocks`) : on repart d'un faux serveur propre.
    vi.resetAllMocks();
    __mocks.resetForms();
    installServer();
  });

  it('affiche la liste des factures', async () => {
    server.list = { items: [INVOICE], total: 1, page: 1, limit: 20 };

    renderTab();

    expect(await screen.findByText('F-2026-001')).toBeTruthy();
    expect(await screen.findByText('Ascenseurs Pro')).toBeTruthy();
  });

  it('signale un numéro de facture déjà utilisé (409) à la création', async () => {
    renderTab({ providers: [{ id: 'p1', tenantId: 't1', name: 'Ascenseurs Pro' }] });

    fireEvent.click(await screen.findByText('Enregistrer une facture'));

    __mocks.formInstances[0].validateFields = async () => ({
      providerId: 'p1',
      number: 'F-2026-001',
      label: 'Entretien ascenseur',
      invoiceDate: { toISOString: () => '2026-01-05T00:00:00.000Z' },
      amountHT: 100000,
      vatAmount: 18000,
      expenseKind: 'CURRENT',
      currency: 'XOF'
    });

    mockApiClient.post.mockRejectedValueOnce({
      response: {
        data: { success: false, error: 'Une facture de ce prestataire porte deja ce numero pour cette copropriete' }
      }
    });

    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(messageError).toHaveBeenCalledWith(
        'Une facture de ce prestataire porte deja ce numero pour cette copropriete'
      );
    });
  });

  it('avertit quand le paiement laisse le solde du fonds négatif', async () => {
    server.list = { items: [INVOICE], total: 1, page: 1, limit: 20 };
    server.detail = DETAIL;

    renderTab();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Enregistrer un paiement'));

    __mocks.formInstances[1].validateFields = async () => ({
      amount: 118000,
      paidAt: { toISOString: () => '2026-01-10T00:00:00.000Z' },
      method: 'BANK_TRANSFER'
    });

    mockApiClient.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          payment: { id: 'pay-1', invoiceId: 'inv-1', amount: 118000, method: 'BANK_TRANSFER', fund: null },
          invoice: { id: 'inv-1', status: 'PAID', amountDue: 0 },
          fund: { id: 'fund-1', name: 'Compte courant', balance: -5000, currency: 'XOF' },
          fundBalanceNegative: true
        }
      }
    });

    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(messageWarning).toHaveBeenCalledWith('Le solde du fonds débité est désormais négatif.');
    });
  });

  it('annule une facture avec un motif obligatoire', async () => {
    server.list = { items: [INVOICE], total: 1, page: 1, limit: 20 };
    server.detail = DETAIL;

    const { container } = renderTab();

    fireEvent.click(await screen.findByText('Ouvrir'));
    fireEvent.click(await screen.findByText('Annuler la facture'));

    // Le motif est obligatoire : sans texte, l'annulation n'est pas envoyée.
    fireEvent.click(screen.getByText('Confirmer l’annulation'));
    expect(mockApiClient.post).not.toHaveBeenCalled();

    // Le motif d'annulation est le seul `<textarea>` du DOM.
    const textarea = container.ownerDocument.querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea!, { target: { value: 'Erreur de saisie' } });

    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'inv-1', status: 'CANCELLED' } } });

    fireEvent.click(screen.getByText('Confirmer l’annulation'));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/factures-prestataires/inv-1/annulation',
        { reason: 'Erreur de saisie' }
      );
    });
  });

  it('les pièces jointes (création et remplacement) empêchent rc-upload de poster le fichier lui-même', async () => {
    // `beforeUpload` DOIT renvoyer `false` : sinon rc-upload lance EN PLUS son
    // propre POST du fichier vers `action` (l'URL de la page), en clair, sans
    // passer par le service authentifié. Régression corrigée sur signalement
    // de l'audit sécurité — ce test la fige.
    const withFile = { ...INVOICE, hasFile: true, fileName: 'facture.pdf' };
    server.list = { items: [withFile], total: 1, page: 1, limit: 20 };
    server.detail = { ...DETAIL, hasFile: true, fileName: 'facture.pdf' };

    renderTab();

    // Le formulaire « Enregistrer une facture » monte son propre `<Upload>`.
    fireEvent.click(await screen.findByText('Enregistrer une facture'));

    // Le tiroir d'une facture déjà pourvue d'une pièce monte le `<Upload>` de
    // « Remplacer » (et non celui d'« Ajouter »).
    fireEvent.click(await screen.findByText('Ouvrir'));
    await screen.findByText('Remplacer');

    expect(__mocks.uploadRegistrations.length).toBeGreaterThanOrEqual(2);
    // Copie figée : appeler `beforeUpload` déclenche un re-rendu, qui remonte
    // le même `<Upload>` et repousse une NOUVELLE entrée dans le tableau.
    const registrations = [...__mocks.uploadRegistrations];
    for (const registration of registrations) {
      expect(registration.accept).toBe('.pdf,.png,.jpg,.jpeg');
      expect(typeof registration.beforeUpload).toBe('function');
      const fakeFile = new File(['contenu'], 'facture.pdf', { type: 'application/pdf' });
      let returned: unknown;
      act(() => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        returned = registration.beforeUpload!(fakeFile);
      });
      expect(returned).toBe(false);
    }
  });
});
