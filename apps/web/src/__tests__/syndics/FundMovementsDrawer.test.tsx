import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import apiClient from '../../utils/api-client';
import { FundMovementsDrawer } from '../../components/syndics/FundMovementsDrawer';

/** Lot S6 — historique des mouvements d'un fonds (`SyndicateFundMovement`). */

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('antd', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough =
    (Tag: keyof JSX.IntrinsicElements = 'div') =>
    ({ children, ...props }: any) =>
      React.createElement(Tag, props, children);

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

  const Drawer: any = ({ children, open, title }: any) =>
    open ? (
      <div>
        <div>{title}</div>
        {children}
      </div>
    ) : null;

  return {
    Alert: ({ message }: any) => <div role="alert">{message}</div>,
    Drawer,
    Spin: passthrough(),
    Table,
    Tag: passthrough('span'),
    Typography: { Text: passthrough('span') }
  };
});

const mockApiClient = apiClient as any;

describe('FundMovementsDrawer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("affiche l'historique paginé des mouvements d'un fonds", async () => {
    mockApiClient.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          fund: { id: 'fund-1', name: 'Compte courant', balance: -1000, currency: 'XOF' },
          items: [
            {
              id: 'mv-1',
              direction: 'DEBIT',
              amount: 118000,
              balanceAfter: -1000,
              label: 'Paiement facture F-2026-001',
              sourceType: 'PROVIDER_PAYMENT',
              sourceId: 'pay-1',
              createdById: null,
              createdAt: '2026-01-10T00:00:00.000Z'
            }
          ],
          total: 1,
          page: 1,
          limit: 20
        }
      }
    });

    render(
      <FundMovementsDrawer
        tenantId="tenant-1"
        syndicId="syndic-1"
        fund={{ id: 'fund-1', name: 'Compte courant' }}
        onClose={() => {}}
      />
    );

    expect(mockApiClient.get).toHaveBeenCalledWith('/tenants/tenant-1/syndics/syndic-1/fonds/fund-1/mouvements', {
      params: { page: 1, limit: 20 }
    });
    expect(await screen.findByText('Paiement facture F-2026-001')).toBeTruthy();
  });

  it('affiche une erreur si le chargement des mouvements échoue', async () => {
    mockApiClient.get.mockRejectedValueOnce({
      response: { data: { success: false, error: 'Fonds introuvable ou inaccessible pour cette copropriete' } }
    });

    render(
      <FundMovementsDrawer
        tenantId="tenant-1"
        syndicId="syndic-1"
        fund={{ id: 'fund-x', name: 'Fonds disparu' }}
        onClose={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('Fonds introuvable ou inaccessible pour cette copropriete');
    });
  });

  it('ne charge rien quand aucun fonds n’est sélectionné', () => {
    render(<FundMovementsDrawer tenantId="tenant-1" syndicId="syndic-1" fund={null} onClose={() => {}} />);
    expect(mockApiClient.get).not.toHaveBeenCalled();
  });
});
