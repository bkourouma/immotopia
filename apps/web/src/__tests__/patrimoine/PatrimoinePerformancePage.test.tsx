import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PatrimoinePerformancePage } from '../../pages/patrimoine/PatrimoinePerformancePage';
import * as patrimoineService from '../../services/patrimoine-service';
import * as propertyService from '../../services/property-service';

vi.mock('../../services/patrimoine-service', () => ({
  getPatrimoinePerformance: vi.fn(),
  getYieldAssumptions: vi.fn(),
  saveYieldAssumptions: vi.fn()
}));

vi.mock('../../services/property-service', () => ({
  listProperties: vi.fn()
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ tenantMembership: { tenantId: 'agence-1' } })
}));

// Select natif : on teste la page, pas la liste déroulante d'Ant Design.
vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  const NativeSelect = ({
    options,
    value,
    onChange
  }: {
    options: Array<{ value: string; label: string }>;
    value?: string;
    onChange: (v: string) => void;
  }) => (
    <select aria-label="bien" value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select: NativeSelect };
});

vi.mock('../../components/patrimoine/YieldProjectionChart', () => ({
  YieldProjectionChart: () => null
}));

vi.mock('../../components/patrimoine/YieldCalculator', () => ({
  YieldCalculator: ({
    assumptions,
    onRecalculate
  }: {
    assumptions?: { years: number };
    onRecalculate?: (a: Record<string, number>) => void;
  }) => (
    <div>
      <span data-testid="years">{assumptions?.years}</span>
      <button
        type="button"
        onClick={() =>
          onRecalculate?.({
            years: 3,
            valueGrowthRate: 0.01,
            rentGrowthRate: 0.01,
            expenseGrowthRate: 0.01,
            vacancyRate: 0.01
          })
        }
      >
        recalc
      </button>
    </div>
  )
}));

const hyp = (years: number) => ({
  years,
  valueGrowthRate: 0.03,
  rentGrowthRate: 0.02,
  expenseGrowthRate: 0.025,
  vacancyRate: 0.05
});
const etat = (years: number) => ({ assumptions: hyp(years), saved: true, updatedAt: '2026-10-01T00:00:00.000Z' });
const recalcul = { years: 3, valueGrowthRate: 0.01, rentGrowthRate: 0.01, expenseGrowthRate: 0.01, vacancyRate: 0.01 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const perfMock = vi.mocked(patrimoineService.getPatrimoinePerformance);
const getMock = vi.mocked(patrimoineService.getYieldAssumptions);
const saveMock = vi.mocked(patrimoineService.saveYieldAssumptions);

function mount() {
  return render(
    <MemoryRouter initialEntries={['/tenants/agence-1/patrimoine/performance']}>
      <Routes>
        <Route path="/tenants/:tenantId/patrimoine/performance" element={<PatrimoinePerformancePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  vi.mocked(propertyService.listProperties).mockResolvedValue({
    properties: [
      { id: 'A', title: 'Bien A' },
      { id: 'B', title: 'Bien B' }
    ]
  } as never);
  perfMock.mockResolvedValue({ grossYield: 1, netYield: 1, netNetYield: 1, latentCapitalGain: 1, projection: [] });
});

async function choisir(id: string) {
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'bien' }), id);
}

describe('PatrimoinePerformancePage — hypothèses par bien', () => {
  it('changement de bien A -> B : aucune requête de B avec les hypothèses de A', async () => {
    const gb = deferred<ReturnType<typeof etat>>();
    getMock.mockImplementation((_t, p) => (p === 'A' ? Promise.resolve(etat(7)) : gb.promise));
    mount();
    await screen.findByRole('option', { name: 'Bien B' });

    await choisir('A');
    await waitFor(() => expect(perfMock).toHaveBeenCalledWith('agence-1', 'A', hyp(7)));

    await choisir('B'); // les hypothèses de B sont encore en vol
    await act(async () => {});
    expect(perfMock.mock.calls.filter(c => c[1] === 'B')).toHaveLength(0);

    await act(async () => {
      gb.resolve(etat(15));
    });
    await waitFor(() => expect(perfMock).toHaveBeenCalledWith('agence-1', 'B', hyp(15)));
    expect(perfMock.mock.calls.filter(c => c[1] === 'B').every(c => (c[2] as { years: number }).years === 15)).toBe(
      true
    );
  });

  it('recalcul : un seul enregistrement, puis calcul avec les hypothèses saisies', async () => {
    getMock.mockResolvedValue(etat(7));
    saveMock.mockResolvedValue(etat(3));
    mount();
    await screen.findByRole('option', { name: 'Bien A' });
    await choisir('A');
    await waitFor(() => expect(perfMock).toHaveBeenCalledWith('agence-1', 'A', hyp(7)));

    await userEvent.click(screen.getByRole('button', { name: 'recalc' }));

    await waitFor(() => expect(perfMock).toHaveBeenLastCalledWith('agence-1', 'A', recalcul));
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('agence-1', 'A', recalcul);
  });

  it('ignore le résultat de l’enregistrement si le bien a changé pendant ce temps', async () => {
    const save = deferred<ReturnType<typeof etat>>();
    getMock.mockImplementation((_t, p) => Promise.resolve(etat(p === 'A' ? 7 : 15)));
    saveMock.mockReturnValue(save.promise);
    mount();
    await screen.findByRole('option', { name: 'Bien B' });
    await choisir('A');
    await waitFor(() => expect(perfMock).toHaveBeenCalledWith('agence-1', 'A', hyp(7)));

    await userEvent.click(screen.getByRole('button', { name: 'recalc' }));
    await choisir('B');
    await waitFor(() => expect(perfMock).toHaveBeenCalledWith('agence-1', 'B', hyp(15)));
    perfMock.mockClear();

    await act(async () => {
      save.resolve(etat(3));
    });

    expect(perfMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('years')).toHaveTextContent('15');
  });
});
