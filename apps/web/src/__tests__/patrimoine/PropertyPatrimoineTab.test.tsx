import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import * as patrimoineService from '../../services/patrimoine-service';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

// The tab loads owners from the CRM in the same Promise.all as the patrimoine
// data. Left unmocked it hits the mocked apiClient, the whole load rejects, and
// none of the fetched state (documents included) is ever applied.
vi.mock('../../services/crm-service', () => ({
  __esModule: true,
  listContacts: vi.fn(async () => ({ contacts: [], pagination: { total: 0 } }))
}));

vi.mock('antd', async () => {
  // Vitest runs test files as ESM: `require` is not available here.
  const React = await vi.importActual<typeof import('react')>('react');
  const jestObject = vi;
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);
  const FormComp: any = ({ children }: any) => <form>{children}</form>;
  FormComp.Item = passthrough();
  FormComp.useForm = () => [
    {
      validateFields: jestObject.fn(),
      resetFields: jestObject.fn(),
      setFieldsValue: jestObject.fn()
    }
  ];
  // Le composant surveille paymentMethod/agencyIsBuyer de la dépense via
  // Form.useWatch (lot 10) : le mock antd doit couvrir cet export comme les
  // autres, sous peine d'un TypeError au montage.
  FormComp.useWatch = () => undefined;
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  const Modal = ({ open, children }: any) => (open ? <div>{children}</div> : null);
  const Table = ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>;

  const antdMock: Record<string, unknown> = {
    Alert: passthrough(),
    Button: passthrough('button'),
    Card: passthrough(),
    Col: passthrough(),
    Form: FormComp,
    Input: InputComp,
    InputNumber: passthrough('input'),
    Modal,
    Popconfirm: ({ children }: any) => <>{children}</>,
    Row: passthrough(),
    Select: passthrough('select'),
    Space: passthrough(),
    Spin: passthrough(),
    Switch: passthrough('input'),
    Table,
    Tag: passthrough('span'),
    // Vitest errors on any import the mock does not provide (Jest silently
    // returned undefined), so the mock must cover every antd export the
    // component imports.
    Upload: Object.assign(passthrough(), { Dragger: passthrough() }),
    Typography: {
      Text: passthrough('span')
    },
    message: {
      success: jestObject.fn(),
      error: jestObject.fn()
    }
  };
  const appApi = {
    message: antdMock.message ?? { success() {}, error() {}, warning() {}, info() {}, loading() {} },
    modal: { confirm() {}, info() {}, warning() {}, error() {}, success() {} },
    notification: { open() {}, success() {}, error() {}, warning() {}, info() {} }
  };
  return {
    ...antdMock,
    App: { useApp: () => appApi },
    // Aucun palier actif : le rendu par defaut des tests est le mobile.
    Grid: { useBreakpoint: () => ({}) }
  };
});

vi.mock('../../components/patrimoine/ValuationHistory', () => ({
  ValuationHistory: ({ valuations }: { valuations: Array<{ id: string }> }) => (
    <div data-testid="valuation-history">{valuations.length}</div>
  )
}));

vi.mock('../../components/patrimoine/ExpenseTracker', () => ({
  ExpenseTracker: ({ expenses }: { expenses: Array<{ id: string }> }) => (
    <div data-testid="expense-tracker">{expenses.length}</div>
  )
}));

vi.mock('../../components/patrimoine/LoanWidget', () => ({
  LoanWidget: ({ loans }: { loans: Array<{ id: string }> }) => <div data-testid="loan-widget">{loans.length}</div>
}));

vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({
  YieldProjectionChart: ({ data }: { data: Array<{ year: number }> }) => (
    <div data-testid="yield-projection">{data.length}</div>
  )
}));

vi.mock('../../components/patrimoine/WorkProgramTimeline', () => ({
  WorkProgramTimeline: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="work-program-timeline">{items.length}</div>
  )
}));

vi.mock('../../components/patrimoine/YieldCalculator', () => ({
  YieldCalculator: ({
    onRecalculate
  }: {
    onRecalculate?: (a: {
      years: number;
      valueGrowthRate: number;
      rentGrowthRate: number;
      expenseGrowthRate: number;
      vacancyRate: number;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onRecalculate?.({
          years: 5,
          valueGrowthRate: 0.03,
          rentGrowthRate: 0.02,
          expenseGrowthRate: 0.02,
          vacancyRate: 0.04
        })
      }
    >
      recalc-yield
    </button>
  )
}));

vi.mock('../../components/patrimoine/DocumentVault', () => ({
  DocumentVault: ({ documents, onDelete }: { documents: Array<{ id: string }>; onDelete?: (id: string) => void }) => (
    <button type="button" onClick={() => documents[0] && onDelete?.(documents[0].id)}>
      delete-first-doc
    </button>
  )
}));

describe('PropertyPatrimoineTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads patrimoine data on mount and triggers recalculate + document delete actions', async () => {
    const listValuationsSpy = vi.spyOn(patrimoineService, 'listValuations').mockResolvedValue([
      {
        id: 'valuation-1',
        propertyId: 'property-1',
        tenantId: 'tenant-1',
        valuatedAt: new Date().toISOString(),
        estimatedValue: 100,
        currency: 'XOF',
        method: 'MANUAL'
      }
    ]);
    const listExpensesSpy = vi.spyOn(patrimoineService, 'listExpenses').mockResolvedValue([
      {
        id: 'expense-1',
        propertyId: 'property-1',
        tenantId: 'tenant-1',
        category: 'OTHER',
        label: 'Test',
        amount: 10,
        currency: 'XOF',
        paidAt: new Date().toISOString(),
        isCapitalized: false
      }
    ]);
    const listLoansSpy = vi.spyOn(patrimoineService, 'listLoans').mockResolvedValue([
      {
        id: 'loan-1',
        propertyId: 'property-1',
        tenantId: 'tenant-1',
        lender: 'Bank',
        capitalAmount: 100,
        remainingCapital: 90,
        interestRate: 5,
        monthlyPayment: 2,
        currency: 'XOF',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        status: 'ACTIVE'
      }
    ]);
    const listWorkProgramsSpy = vi.spyOn(patrimoineService, 'listWorkPrograms').mockResolvedValue([]);
    const listDocumentsSpy = vi.spyOn(patrimoineService, 'listDocuments').mockResolvedValue([
      {
        id: 'doc-1',
        propertyId: 'property-1',
        title: 'Doc',
        type: 'OTHER',
        fileUrl: 'https://example.com/doc.pdf'
      }
    ]);
    const getPropertyYieldSpy = vi
      .spyOn(patrimoineService, 'getPropertyYield')
      .mockResolvedValueOnce({
        grossYield: 10,
        netYield: 9,
        netNetYield: 8,
        latentCapitalGain: 1000,
        projection: []
      })
      .mockResolvedValueOnce({
        grossYield: 11,
        netYield: 10,
        netNetYield: 9,
        latentCapitalGain: 1200,
        projection: [{ year: 1, estimatedValue: 1, cumulativeRent: 1, cumulativeExpenses: 1, netResult: 1 }]
      });
    const deleteDocumentSpy = vi.spyOn(patrimoineService, 'deleteDocument').mockResolvedValue();

    render(<PropertyPatrimoineTab tenantId="tenant-1" propertyId="property-1" />);

    await waitFor(() => {
      expect(listValuationsSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(listExpensesSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(listLoansSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(listWorkProgramsSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(listDocumentsSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
      expect(getPropertyYieldSpy).toHaveBeenCalledWith('tenant-1', 'property-1');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'recalc-yield' })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole('button', { name: 'recalc-yield' }));
    await waitFor(() => {
      expect(getPropertyYieldSpy).toHaveBeenLastCalledWith('tenant-1', 'property-1', {
        years: 5,
        valueGrowthRate: 0.03,
        rentGrowthRate: 0.02,
        expenseGrowthRate: 0.02,
        vacancyRate: 0.04
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'delete-first-doc' }));
    await waitFor(() => {
      expect(deleteDocumentSpy).toHaveBeenCalledWith('tenant-1', 'property-1', 'doc-1');
    });
  });
});
