import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import { LeaseEventTimeline, describeLeaseEvent } from '../../components/rental/lifecycle/LeaseEventTimeline';
import { FinalSettlementCard } from '../../components/rental/lifecycle/FinalSettlementCard';
import { RevisionModal } from '../../components/rental/lifecycle/RevisionModal';
import { StartInspectionModal } from '../../components/rental/inspections/StartInspectionModal';
import { InspectionCompareModal } from '../../components/rental/inspections/InspectionCompareModal';

/** Revue lot 3 (suite) : devise du bail, arrondi de la révision, réinitialisation des modales. */

const compareInspections = vi.fn();
vi.mock('../../services/lease-inspections-service', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/lease-inspections-service')>();
  return { ...actual, compareInspections: (...a: unknown[]) => compareInspections(...a) };
});

beforeEach(() => vi.clearAllMocks());

const revision: any = {
  id: 'e1',
  type: 'REVISION',
  effectiveDate: '2026-03-01',
  previousRent: 1200.5,
  newRent: 1250.5,
  revisionRate: 4,
  details: null,
  summary: null,
  createdAt: '2026-02-01',
  createdByName: null
};

describe('devise du bail', () => {
  it('historique : loyer révisé en EUR avec décimales, sans FCFA', () => {
    const phrase = describeLeaseEvent(revision, 'EUR');
    expect(phrase).toMatch(/1\s200,50 à 1\s250,50\s*EUR/);
    expect(phrase).not.toMatch(/FCFA/);
    render(<LeaseEventTimeline events={[revision]} currency="EUR" />);
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });

  it('historique : FCFA par défaut', () => {
    expect(describeLeaseEvent({ ...revision, previousRent: 150000, newRent: 157500 }, undefined)).toMatch(/FCFA/);
  });

  it('solde de tout compte : montants en EUR', () => {
    render(
      <FinalSettlementCard
        loading={false}
        currency="EUR"
        settlement={{
          depositHeld: 1000.5,
          arrears: 100,
          deductions: [{ label: 'Peinture', amount: 50.25 }],
          deductionsTotal: 50.25,
          balanceToRefund: 850.25,
          exitInspectionStatus: 'FINALIZED'
        }}
      />
    );
    expect(screen.getByText(/1\s000,50\s*EUR/)).toBeTruthy();
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });
});

describe('révision : arrondi selon la devise', () => {
  function setup(currency: string) {
    render(
      <RevisionModal
        open
        currentRent={1000.33}
        currentCharges={0}
        currency={currency}
        onCancel={() => {}}
        onSubmit={async () => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/Taux de révision/), { target: { value: '3.3' } });
    return screen.getByLabelText('Nouveau loyer') as HTMLInputElement;
  }

  it('EUR : au centime', async () => {
    const input = setup('EUR');
    await waitFor(() => expect(input.value.replace(/\s/g, '')).toMatch(/^1033[,.]34$/));
  });

  it('FCFA : à l’unité', async () => {
    const input = setup('FCFA');
    await waitFor(() => expect(input.value.replace(/\s/g, '')).toBe('1033'));
  });
});

describe('modales d’état des lieux : réinitialisation à l’ouverture', () => {
  it('StartInspectionModal : la date revient à aujourd’hui', async () => {
    const props = { type: 'ENTRY' as const, confirmLoading: false, onCancel: () => {}, onConfirm: vi.fn() };
    const { rerender } = render(<StartInspectionModal open {...props} />);
    const input = screen.getByLabelText('Date de l’état des lieux') as HTMLInputElement;
    fireEvent.mouseDown(input);
    fireEvent.change(input, { target: { value: '01/01/2020' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    rerender(<StartInspectionModal open={false} {...props} />);
    rerender(<StartInspectionModal open {...props} />);
    const again = (await screen.findByLabelText('Date de l’état des lieux')) as HTMLInputElement;
    expect(again.value).toBe(dayjs().format('DD/MM/YYYY'));
  });

  it('InspectionCompareModal : plus d’anciennes lignes après réouverture en échec', async () => {
    compareInspections.mockResolvedValueOnce({
      data: {
        rows: [
          {
            key: 'r1',
            roomName: 'Salon',
            label: 'Mur ancien',
            kind: 'ELEMENT',
            entryCondition: 'GOOD',
            exitCondition: 'GOOD'
          }
        ],
        summary: null
      }
    });
    const ui = (open: boolean) => (
      <AntApp>
        <InspectionCompareModal open={open} tenantId="t" leaseId="l" onClose={() => {}} />
      </AntApp>
    );
    const { rerender } = render(ui(true));
    await screen.findByText('Mur ancien');
    compareInspections.mockRejectedValueOnce(new Error('boom'));
    rerender(ui(false));
    rerender(ui(true));
    await waitFor(() => expect(compareInspections).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Mur ancien')).toBeNull());
  });
});
