import { deriveChargeCallStatus } from '../../src/lib/syndics/finance-utils';

describe('deriveChargeCallStatus', () => {
  const now = new Date('2026-06-15T00:00:00.000Z');

  it('keeps PENDING when the due date is not yet passed', () => {
    expect(deriveChargeCallStatus('PENDING', new Date('2026-06-20T00:00:00.000Z'), now)).toBe('PENDING');
  });

  it('derives OVERDUE for a PENDING charge whose due date has passed', () => {
    expect(deriveChargeCallStatus('PENDING', new Date('2026-06-01T00:00:00.000Z'), now)).toBe('OVERDUE');
  });

  it('derives OVERDUE for a PARTIAL charge whose due date has passed', () => {
    expect(deriveChargeCallStatus('PARTIAL', new Date('2026-01-10T00:00:00.000Z'), now)).toBe('OVERDUE');
  });

  it('never derives OVERDUE for a PAID charge, even long past due', () => {
    expect(deriveChargeCallStatus('PAID', new Date('2020-01-01T00:00:00.000Z'), now)).toBe('PAID');
  });

  it('keeps PARTIAL when the due date is still in the future', () => {
    expect(deriveChargeCallStatus('PARTIAL', new Date('2026-07-01T00:00:00.000Z'), now)).toBe('PARTIAL');
  });

  it('accepts a due date given as an ISO string', () => {
    expect(deriveChargeCallStatus('PENDING', '2026-01-01T00:00:00.000Z', now)).toBe('OVERDUE');
  });
});
