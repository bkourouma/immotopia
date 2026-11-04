import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ListSearch } from '../../components/primitives/ListSearch';
import { useListSearch } from '../../hooks/useListSearch';
import type { SearchCriterion } from '../../utils/list-search/types';

/**
 * Non-régression de PERFORMANCE : on compte des rendus, jamais des durées.
 *
 * Un rendu de la barre qui ne change ni critères, ni valeurs, ni libellés ne
 * doit pas re-rendre les contrôles antd (Select, RangePicker, InputNumber).
 */

const renders = vi.hoisted(() => ({ select: 0, range: 0, number: 0 }));

vi.mock('../../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    screens: {},
    active: 'lg',
    isMobile: false,
    isTablet: false,
    isDesktop: true
  })
}));

vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  // Les statiques (Option, OptGroup…) sont repris, mais pas les champs internes d'un forwardRef.
  const statics = (source: object) =>
    Object.fromEntries(Object.entries(source).filter(([key]) => !['$$typeof', 'render', 'displayName'].includes(key)));
  const ActualSelect = actual.Select as unknown as React.ComponentType<Record<string, unknown>>;
  const CountedSelect = Object.assign(function CountedSelect(props: Record<string, unknown>) {
    renders.select += 1;
    return <ActualSelect {...props} />;
  }, statics(actual.Select));
  const ActualRange = actual.DatePicker.RangePicker as unknown as React.ComponentType<Record<string, unknown>>;
  const CountedRange = function CountedRange(props: Record<string, unknown>) {
    renders.range += 1;
    return <ActualRange {...props} />;
  };
  const ActualNumber = actual.InputNumber as unknown as React.ComponentType<Record<string, unknown>>;
  const CountedNumber = Object.assign(function CountedNumber(props: Record<string, unknown>) {
    renders.number += 1;
    return <ActualNumber {...props} />;
  }, statics(actual.InputNumber));
  return {
    ...actual,
    Select: CountedSelect,
    InputNumber: CountedNumber,
    DatePicker: Object.assign(Object.create(actual.DatePicker), { RangePicker: CountedRange })
  };
});

// Redéclarés à chaque rendu, comme le fait un écran (options et libellés neufs).
const declare = (): SearchCriterion[] => [
  { key: 'q', type: 'text', label: 'Recherche', placeholder: 'Nom…' },
  {
    key: 'kind',
    type: 'select',
    label: 'Type de bien',
    primary: true,
    options: [
      { value: 'VILLA', label: 'Villa' },
      { value: 'STUDIO', label: 'Studio' }
    ]
  },
  { key: 'period', type: 'dateRange', label: 'Période', primary: true },
  { key: 'amount', type: 'numberRange', label: 'Montant', unit: 'FCFA' },
  { key: 'late', type: 'boolean', label: 'En retard' }
];

let lastApiParams: Record<string, unknown> = {};

function Host() {
  const [tick, setTick] = React.useState(0);
  const search = useListSearch({ criteria: declare() });
  lastApiParams = search.apiParams;
  return (
    <>
      <button type="button" onClick={() => setTick(n => n + 1)}>
        rerender-{tick}
      </button>
      <ListSearch {...search.searchProps} resultCount={3} extra={<span>x</span>} />
    </>
  );
}

function mount() {
  return render(
    <MemoryRouter>
      <Host />
    </MemoryRouter>
  );
}

describe('ListSearch — nombre de rendus des contrôles', () => {
  beforeEach(() => {
    renders.select = 0;
    renders.range = 0;
    renders.number = 0;
    lastApiParams = {};
  });

  it("ne re-rend pas les contrôles quand l'hôte se re-rend sans rien changer", async () => {
    const user = userEvent.setup();
    mount();
    const select = renders.select;
    const range = renders.range;
    expect(select).toBeGreaterThan(0);
    expect(range).toBeGreaterThan(0);

    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole('button', { name: /^rerender-/ }));
    }

    expect(screen.getByRole('button', { name: 'rerender-5' })).toBeInTheDocument();
    expect(renders.select).toBe(select);
    expect(renders.range).toBe(range);
  });

  it("ne re-rend que le contrôle concerné quand une valeur change (et l'écrit dans l'URL)", async () => {
    const user = userEvent.setup();
    mount();
    // Ouvre « Plus de critères » pour monter aussi les nombres et le booléen.
    await user.click(screen.getByRole('button', { name: 'Plus de critères' }));
    const range = renders.range;
    const number = renders.number;
    expect(number).toBeGreaterThan(0);

    await user.click(screen.getByRole('combobox', { name: 'Type de bien' }));
    await user.click(await screen.findByText('Villa', { selector: '.ant-select-item-option-content' }));

    await waitFor(() => expect(lastApiParams.kind).toBe('VILLA'));
    // Les autres contrôles n'ont pas été re-rendus par le changement du select.
    expect(renders.range).toBe(range);
    expect(renders.number).toBe(number);
  });

  it('applique toujours le texte du champ libre après 300 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount();
      const input = screen.getByRole('textbox', { name: 'Recherche' });
      fireEvent.change(input, { target: { value: 'villa' } });
      expect(lastApiParams.search).toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      expect(lastApiParams.search).toBe('villa');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useListSearch — identité de searchProps', () => {
  const STABLE: SearchCriterion[] = declare();
  const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

  it('garde la même identité quand criteria garde la même référence', () => {
    const { result, rerender } = renderHook(() => useListSearch({ criteria: STABLE }), { wrapper });
    const first = result.current.searchProps;
    rerender();
    rerender();
    expect(result.current.searchProps).toBe(first);
    expect(result.current.apiParams).toBe(result.current.apiParams);
  });

  it('garde la même identité quand criteria est redéclaré à chaque rendu', () => {
    const { result, rerender } = renderHook(() => useListSearch({ criteria: declare() }), { wrapper });
    const first = result.current.searchProps;
    const params = result.current.apiParams;
    rerender();
    rerender();
    expect(result.current.searchProps).toBe(first);
    expect(result.current.apiParams).toBe(params);
  });
});
