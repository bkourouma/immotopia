/**
 * Renvoi de la convocation d'AG : 1 envoi par assemblée toutes les 10 minutes.
 */
jest.mock('../../src/utils/database', () => ({ prisma: {} }));

import {
  reserveConvocationResend,
  resetConvocationResendLimiter,
  CONVOCATION_RESEND_INTERVAL_MS
} from '../../src/controllers/syndic-controller';

describe('limiteur de renvoi de convocation', () => {
  beforeEach(() => resetConvocationResendLimiter());

  it('le premier renvoi passe, le second dans les 10 minutes est refusé avec le délai', () => {
    const t0 = 1_000_000;
    expect(reserveConvocationResend('t1', 'm1', t0)).toBe(0);
    const wait = reserveConvocationResend('t1', 'm1', t0 + 60_000);
    expect(wait).toBe(Math.ceil((CONVOCATION_RESEND_INTERVAL_MS - 60_000) / 1000));
  });

  it('une autre assemblée, ou une autre agence, n’est pas bloquée', () => {
    expect(reserveConvocationResend('t1', 'm1', 0)).toBe(0);
    expect(reserveConvocationResend('t1', 'm2', 1)).toBe(0);
    expect(reserveConvocationResend('t2', 'm1', 2)).toBe(0);
  });

  it('le créneau se libère après 10 minutes', () => {
    expect(reserveConvocationResend('t1', 'm1', 0)).toBe(0);
    expect(reserveConvocationResend('t1', 'm1', CONVOCATION_RESEND_INTERVAL_MS)).toBe(0);
  });
});
