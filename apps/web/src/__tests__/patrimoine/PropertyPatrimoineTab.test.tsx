import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import userEvent from '@testing-library/user-event';
import { PropertyPatrimoineTab } from '../../components/patrimoine/PropertyPatrimoineTab';
import * as patrimoineService from '../../services/patrimoine-service';

jest.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: require('@jest/globals').jest.fn(),
    post: require('@jest/globals').jest.fn(),
    patch: require('@jest/globals').jest.fn(),
    delete: require('@jest/globals').jest.fn()
  }
}));

jest.mock('antd', () => {
  const React = require('react');
  const jestObject = require('@jest/globals').jest;
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
  const InputComp: any = passthrough('input');
  InputComp.TextArea = passthrough('textarea');
  const Modal = ({ open, children }: any) => (open ? <div>{children}</div> : null);
  const Table = ({ dataSource }: any) => <div>{JSON.stringify(dataSource || [])}</div>;

  return {
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
    Typography: {
      Text: passthrough('span')
    },
    message: {
      success: jestObject.fn(),
      error: jestObject.fn()
    }
  };
});

jest.mock('../../components/patrimoine/ValuationHistory', () => ({
  ValuationHistory: ({ valuations }: { valuations: Array<{ id: string }> }) => (
    <div data-testid="valuation-history">{valuations.length}</div>
  )
}));

jest.mock('../../components/patrimoine/ExpenseTracker', () => ({
  ExpenseTracker: ({ expenses }: { expenses: Array<{ id: string }> }) => (
    <div data-testid="expense-tracker">{expenses.length}</div>
  )
}));

jest.mock('../../components/patrimoine/LoanWidget', () => ({
  LoanWidget: ({ loans }: { loans: Array<{ id: string }> }) => <div data-testid="loan-widget">{loans.length}</div>
}));

jest.mock('../../components/patrimoine/YieldProjectionChart', () => ({
  YieldProjectionChart: ({ data }: { data: Array<{ year: number }> }) => (
    <div data-testid="yield-projection">{data.length}</div>
  )
}));

jest.mock('../../components/patrimoine/WorkProgramTimeline', () => ({
  WorkProgramTimeline: ({ items }: { items: Array<{ id: string }> }) => (
    <div data-testid="work-program-timeline">{items.length}</div>
  )
}));

jest.mock('../../components/patrimoine/YieldCalculator', () => ({
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

jest.mock('../../components/patrimoine/DocumentVault', () => ({
  DocumentVault: ({
    documents,
    onDelete
  }: {
    documents: Array<{ id: string }>;
    onDelete?: (id: string) => void;
  }) => (
    <button type="button" onClick={() => documents[0] && onDelete?.(documents[0].id)}>
      delete-first-doc
    </button>
  )
}));

describe('PropertyPatrimoineTab', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('loads patrimoine data on mount and triggers recalculate + document delete actions', async () => {
    const listValuationsSpy = jest.spyOn(patrimoineService, 'listValuations').mockResolvedValue([
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
    const listExpensesSpy = jest.spyOn(patrimoineService, 'listExpenses').mockResolvedValue([
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
    const listLoansSpy = jest.spyOn(patrimoineService, 'listLoans').mockResolvedValue([
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
    const listWorkProgramsSpy = jest.spyOn(patrimoineService, 'listWorkPrograms').mockResolvedValue([]);
    const listDocumentsSpy = jest.spyOn(patrimoineService, 'listDocuments').mockResolvedValue([
      {
        id: 'doc-1',
        propertyId: 'property-1',
        title: 'Doc',
        type: 'OTHER',
        fileUrl: 'https://example.com/doc.pdf'
      }
    ]);
    const getPropertyYieldSpy = jest
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
    const deleteDocumentSpy = jest.spyOn(patrimoineService, 'deleteDocument').mockResolvedValue();

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
