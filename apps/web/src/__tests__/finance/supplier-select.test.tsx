import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const suppliers = vi.hoisted(() => ({ listPage: vi.fn(), get: vi.fn() }));
vi.mock('../../services/finance-lot2-service', () => ({
  listSuppliersPage: suppliers.listPage,
  getSupplier: suppliers.get
}));

import { SupplierSelect } from '../../components/finance/SupplierSelect';

describe('SupplierSelect', () => {
  it('conserve le choix hors page et charge au plus vingt fournisseurs par requête', async () => {
    const user = userEvent.setup();
    suppliers.listPage.mockImplementation(
      async (_tenant: string, filters: { search: string; page: number; limit: number }) => {
        if (filters.search) return { items: [{ id: 'found', name: 'Fournisseur trouvé' }], total: 1 };
        return filters.page === 1
          ? { items: [{ id: 'first', name: 'Premier fournisseur' }], total: 2 }
          : { items: [{ id: 'second', name: 'Second fournisseur' }], total: 2 };
      }
    );
    suppliers.get.mockResolvedValue({ id: 'selected', name: 'Fournisseur présélectionné' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SupplierSelect
          tenantId="agence-1"
          id="supplier-test"
          value="selected"
          onChange={() => {}}
          placeholder="Choisir un fournisseur"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Fournisseur présélectionné')).toBeInTheDocument();
    expect(suppliers.get).toHaveBeenCalledWith('agence-1', 'selected');
    const combo = screen.getByRole('combobox');
    await user.click(combo);
    await waitFor(() =>
      expect(suppliers.listPage).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 1, limit: 20 }))
    );
    expect(
      await screen.findByText('Premier fournisseur', { selector: '.ant-select-item-option-content' })
    ).toBeInTheDocument();
    const holder = document.querySelector('.ant-select-dropdown [class$="-holder"]') as HTMLElement;
    expect(holder).not.toBeNull();
    fireEvent.scroll(holder);
    await waitFor(() =>
      expect(suppliers.listPage).toHaveBeenCalledWith('agence-1', expect.objectContaining({ page: 2, limit: 20 }))
    );

    await user.type(combo, 'trouvé');
    await waitFor(
      () =>
        expect(suppliers.listPage).toHaveBeenCalledWith(
          'agence-1',
          expect.objectContaining({ search: 'trouvé', page: 1, limit: 20 })
        ),
      { timeout: 2000 }
    );
    expect(combo.closest('.ant-select-content')).toHaveTextContent('Fournisseur présélectionné');
  });
});
