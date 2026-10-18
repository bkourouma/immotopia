const info = jest.fn();
jest.mock('../../src/utils/logger', () => ({ logger: { info: (...a: unknown[]) => info(...a) } }));

import {
  notifyDeclarationApproved,
  notifyDeclarationReceived,
  notifyDeclarationRejected
} from '../../src/lib/syndics/declared-payment/notifications';

describe('notifications du paiement déclaré (sans effet)', () => {
  beforeEach(() => info.mockReset());

  it('journalisent seulement des identifiants', () => {
    notifyDeclarationReceived('t1', 'd1');
    notifyDeclarationApproved('t1', 'd1', [{ id: 'doc1', kind: 'RECEIPT', number: 'Q-1' } as never]);
    notifyDeclarationRejected('t1', 'd1');
    expect(info).toHaveBeenCalledTimes(3);
    const meta = JSON.stringify(info.mock.calls.map(c => c[1]));
    expect(meta).toContain('doc1');
    expect(meta).not.toContain('Q-1');
  });

  it('ne lèvent jamais, même si le journal échoue', () => {
    info.mockImplementation(() => {
      throw new Error('journal HS');
    });
    expect(() => notifyDeclarationReceived('t1', 'd1')).not.toThrow();
    expect(() => notifyDeclarationApproved('t1', 'd1', [])).not.toThrow();
    expect(() => notifyDeclarationRejected('t1', 'd1')).not.toThrow();
  });

  it('tolèrent des documents absents', () => {
    expect(() => notifyDeclarationApproved('t1', 'd1', undefined as never)).not.toThrow();
  });
});
