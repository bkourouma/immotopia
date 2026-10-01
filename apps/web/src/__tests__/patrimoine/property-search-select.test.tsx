import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropertySearchSelect } from '../../components/patrimoine/PropertySearchSelect';
import { PatrimoinePerformancePage } from '../../pages/patrimoine/PatrimoinePerformancePage';
import { CashPlanPage } from '../../pages/patrimoine/CashPlanPage';

/**
 * BUG-2026-10-01-001/007 : une agence de plus de 100 biens. Le mock se pose à la
 * frontière réseau (`utils/api-client`) et simule l'API : pagination + filtre `q`.
 */

const get = vi.fn();
const put = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a)
  }
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({ screens: {}, active: 'lg', isMobile: false, isTablet: false, isDesktop: true })
}));

vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({ YieldProjectionChart: () => null }));

// 102 biens : « Villa Riviera » est le rang 101, « Appartement Marcory » le rang 102.
const ALL = [
  ...Array.from({ length: 100 }, (_, i) => ({ id: `p${i + 1}`, title: `Bien ${String(i + 1).padStart(3, '0')}` })),
  { id: 'p101', title: 'Villa Riviera' },
  { id: 'p102', title: 'Appartement Marcory' }
];

function propertiesCalls(): URLSearchParams[] {
  return get.mock.calls
    .filter(call => /\/tenants\/agence-1\/properties\?/.test(String(call[0])))
    .map(call => new URLSearchParams(String(call[0]).split('?')[1]));
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (url: string) => {
    const u = String(url);
    if (/\/tenants\/agence-1\/properties\?/.test(u)) {
      const params = new URLSearchParams(u.split('?')[1]);
      const page = Number(params.get('page') ?? 1);
      const limit = Number(params.get('limit') ?? 20);
      const q = (params.get('q') ?? '').toLowerCase();
      const matching = q ? ALL.filter(p => p.title.toLowerCase().includes(q)) : ALL;
      return {
        data: {
          success: true,
          data: matching.slice((page - 1) * limit, page * limit),
          pagination: {
            page,
            limit,
            total: matching.length,
            totalPages: Math.max(1, Math.ceil(matching.length / limit))
          }
        }
      };
    }
    if (u.includes('/patrimoine/cash-plan')) {
      return {
        data: {
          success: true,
          data: {
            currency: 'XOF',
            generatedAt: '2026-10-01T08:00:00.000Z',
            startMonth: '2026-10',
            months: 12,
            openingBalanceProvided: false,
            periods: [],
            shortfall: null,
            warnings: [],
            sources: [],
            scope: { propertyCount: 102, excluded: [] },
            settings: { propertyTaxDueMonth: null, propertyTaxDueDay: null }
          }
        }
      };
    }
    return { data: { success: true, data: null } };
  });
  put.mockResolvedValue({ data: { success: true, data: {} } });
});

function Harness({ onValue }: { onValue?: (v: string | undefined) => void }) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <>
      <label htmlFor="sel">Bien</label>
      <PropertySearchSelect
        id="sel"
        tenantId="agence-1"
        pageSize={100}
        value={value}
        onChange={v => {
          setValue(v);
          onValue?.(v);
        }}
      />
    </>
  );
}

describe('PropertySearchSelect — agence de plus de 100 biens', () => {
  it('retrouve le bien du rang 101 par la recherche côté serveur', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await waitFor(() => expect(propertiesCalls().length).toBeGreaterThan(0));

    await userEvent.click(screen.getByLabelText('Bien'));
    await userEvent.type(screen.getByLabelText('Bien'), 'Villa');

    await waitFor(() => expect(propertiesCalls().some(p => p.get('q') === 'Villa')).toBe(true));
    await userEvent.click(await screen.findByText('Villa Riviera'));
    expect(onValue).toHaveBeenCalledWith('p101');
    // Le libellé reste affiché même si la liste est revenue à la page 1 (sans ce bien).
    await waitFor(() => expect(screen.getAllByTitle('Villa Riviera').length).toBeGreaterThan(0));
  });

  it('retrouve les biens au-delà du rang 100 par chargement progressif au défilement', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByLabelText('Bien'));
    await screen.findByText('Bien 001');
    expect(screen.queryByText('Villa Riviera')).toBeNull();

    const holder = document.querySelector('.ant-select-dropdown [class$="-holder"]') as HTMLElement;
    expect(holder).not.toBeNull();
    fireEvent.scroll(holder);

    await waitFor(() => expect(propertiesCalls().some(p => p.get('page') === '2')).toBe(true));
    // La liste est virtualisée : on atteint la fin par le clavier (ArrowUp boucle sur la dernière option).
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    const champ = screen.getByLabelText('Bien');
    fireEvent.keyDown(champ, { key: 'ArrowUp', keyCode: 38, which: 38 });
    fireEvent.keyDown(champ, { key: 'Enter', keyCode: 13, which: 13 });
    expect(onValue).toHaveBeenCalledWith('p102');
  });
});

function monter(ui: React.ReactElement, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AntApp>
        <MemoryRouter initialEntries={[path.replace(':tenantId', 'agence-1')]}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>
  );
}

describe('Pages Patrimoine — sélecteur de bien', () => {
  it('Performance : le bien du rang 101 est trouvable par recherche', async () => {
    monter(<PatrimoinePerformancePage />, '/tenants/:tenantId/patrimoine/performance');
    const champ = await screen.findByRole('combobox');
    await userEvent.click(champ);
    await userEvent.type(champ, 'Villa');
    await waitFor(() => expect(propertiesCalls().some(p => p.get('q') === 'Villa')).toBe(true));
    expect(await screen.findByText('Villa Riviera')).toBeInTheDocument();
  });

  it('Trésorerie : le filtre Bien trouve le rang 101 et filtre le plan dessus', async () => {
    monter(<CashPlanPage />, '/tenant/:tenantId/patrimoine/plan-tresorerie');
    const champ = await screen.findByLabelText('Bien');
    await userEvent.click(champ);
    await userEvent.type(champ, 'Marcory');
    await waitFor(() => expect(propertiesCalls().some(p => p.get('q') === 'Marcory')).toBe(true));
    await userEvent.click(await screen.findByText('Appartement Marcory'));
    await waitFor(() =>
      expect(
        get.mock.calls.some(
          c => String(c[0]).includes('/patrimoine/cash-plan') && (c[1] as any)?.params?.propertyId === 'p102'
        )
      ).toBe(true)
    );
  });
});
