import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

  // Chaque `Form.useForm()` reçoit sa propre instance espionnable, dans
  // l'ORDRE DE MONTAGE : `createForm` (ProviderInvoicesTab) puis `payForm`
  // (ProviderInvoiceDrawer, toujours monté, même fermé). Contrairement au
  // mock à compteur global de `ProvidersDocumentsFinancesPages.test.tsx`, on
  // s'appuie ici sur `useState` : son initialiseur ne s'exécute qu'UNE fois
  // par instance de composant, quel que soit le nombre de re-rendus qui
  // suivent — un `<Drawer>` qui se re-rend deux fois de suite dans le même
  // flush (son propre `load()` state) ne crée donc jamais de deuxième entrée.
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

  const Table: any = ({ dataSource, columns, rowKey }: any) => (
    <table>
      <tbody>
        {(dataSource || []).map((row: any, rowIndex: number) => (
          <tr key={typeof rowKey === 'function' ? rowKey(row) : (row[rowKey as string] ?? rowIndex)}>
            {(columns || []).map((column: any, columnIndex: number) => (
              <td key={column.key || column.dataIndex || columnIndex}>
                {column.render
                  ? column.render(row[column.dataIndex], row, rowIndex)
                  : String(row[column.dataIndex] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Select: any = ({ options, value, onChange, placeholder }: any) => (
    <select value={value ?? ''} onChange={event => onChange?.(event.target.value || undefined)}>
      <option value="">{placeholder || ''}</option>
      {(options || []).map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
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

  const Upload: any = passthrough();
  Upload.Dragger = passthrough();

  const DatePicker: any = passthrough('input');
  DatePicker.RangePicker = passthrough('input');

  const antdMock: Record<string, unknown> = {
    Alert: ({ message }: any) => <div role="alert">{message}</div>,
    Button: ({ children, onClick, disabled, loading, icon, danger }: any) => (
      <button onClick={onClick} disabled={disabled || loading} data-danger={danger ? 'true' : undefined}>
        {icon}
        {children}
      </button>
    ),
    Card: passthrough(),
    Col: passthrough(),
    Row: passthrough(),
    DatePicker,
    Descriptions,
    Drawer,
    Form,
    Input: Object.assign(passthrough('input'), { TextArea: passthrough('textarea') }),
    InputNumber: passthrough('input'),
    Modal,
    Select,
    Space: passthrough(),
    Spin: passthrough(),
    Table,
    Tag: passthrough('span'),
    Upload,
    message: { success: messageSuccess, error: messageError, warning: messageWarning, info() {} },
    Typography: {
      Title: passthrough('h1'),
      Paragraph: passthrough('p'),
      Text: passthrough('span'),
      Link: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>
    },
    __mocks: {
      get formInstances() {
        return formInstances;
      },
      resetForms() {
        formInstances = [];
      }
    }
  };
  const appApi = {
    message: antdMock.message,
    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return {
    ...antdMock,
    App: { useApp: () => appApi },
    Grid: { useBreakpoint: () => ({}) }
  };
});

const { __mocks } = (await import('antd')) as unknown as {
  __mocks: { formInstances: any[]; resetForms: () => void };
};

const mockApiClient = apiClient as any;

function mockReferenceData() {
  // Ordre des appels dans `loadReferenceData` (Promise.all) : incidents,
  // fonds, budgets, soldes.
  mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } }); // incidents
  mockApiClient.get.mockResolvedValueOnce({
    data: { success: true, data: [{ id: 'fund-1', name: 'Compte courant', balance: 1000, currency: 'XOF' }] }
  }); // fonds
  mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } }); // budgets
  mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } }); // soldes
}

describe('ProviderInvoicesTab', () => {
  beforeEach(() => {
    // `resetAllMocks` (et non `clearAllMocks`) : un test qui échoue en
    // laissant des `mockResolvedValueOnce` non consommés ne doit pas les
    // faire fuiter sur le test suivant.
    vi.resetAllMocks();
    __mocks.resetForms();
  });

  it('affiche la liste des factures', async () => {
    mockReferenceData();
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
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
            }
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });

    render(<ProviderInvoicesTab tenantId="tenant-1" syndicId="syndic-1" providers={[]} contracts={[]} />);

    expect(await screen.findByText('F-2026-001')).toBeTruthy();
    expect(await screen.findByText('Ascenseurs Pro')).toBeTruthy();
  });

  it('signale un numéro de facture déjà utilisé (409) à la création', async () => {
    mockReferenceData();
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { items: [], total: 0, page: 1, limit: 20 } }
    });

    render(
      <ProviderInvoicesTab
        tenantId="tenant-1"
        syndicId="syndic-1"
        providers={[{ id: 'p1', tenantId: 't1', name: 'Ascenseurs Pro' }]}
        contracts={[]}
      />
    );

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
    mockReferenceData();
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
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
            }
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });

    render(<ProviderInvoicesTab tenantId="tenant-1" syndicId="syndic-1" providers={[]} contracts={[]} />);

    // Enregistrée AVANT le clic : ouvrir le tiroir déclenche l'appel GET de
    // façon synchrone dans le même `act()` que le clic, sans await
    // intermédiaire côté test pour enregistrer la réponse après coup.
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
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
        }
      }
    });
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
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 'inv-1', status: 'PAID', payments: [], amountDue: 0, amountTTC: 118000, amountPaid: 118000 }
      }
    });
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { items: [], total: 0, page: 1, limit: 20 } }
    });
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } });

    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
      expect(messageWarning).toHaveBeenCalledWith('Le solde du fonds débité est désormais négatif.');
    });
  });

  it('annule une facture avec un motif obligatoire', async () => {
    mockReferenceData();
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
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
            }
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });

    const { container } = render(
      <ProviderInvoicesTab tenantId="tenant-1" syndicId="syndic-1" providers={[]} contracts={[]} />
    );

    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
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
        }
      }
    });
    fireEvent.click(await screen.findByText('Ouvrir'));

    fireEvent.click(await screen.findByText('Annuler la facture'));

    // Le motif est obligatoire : sans texte, l'annulation n'est pas envoyée.
    fireEvent.click(screen.getByText('Confirmer l’annulation'));
    expect(mockApiClient.post).not.toHaveBeenCalled();

    // `getByRole('textbox')` verrait aussi le `<input>` du filtre de période
    // (RangePicker) : le motif d'annulation est le seul `<textarea>` du DOM.
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea!, { target: { value: 'Erreur de saisie' } });

    mockApiClient.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'inv-1', status: 'CANCELLED' } } });
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { id: 'inv-1', status: 'CANCELLED', payments: [], amountDue: 0, amountTTC: 118000, amountPaid: 0 }
      }
    });
    mockApiClient.get.mockResolvedValueOnce({
      data: { success: true, data: { items: [], total: 0, page: 1, limit: 20 } }
    });
    mockApiClient.get.mockResolvedValueOnce({ data: { success: true, data: [] } });

    fireEvent.click(screen.getByText('Confirmer l’annulation'));

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/tenants/tenant-1/syndics/syndic-1/factures-prestataires/inv-1/annulation',
        { reason: 'Erreur de saisie' }
      );
    });
  });
});
