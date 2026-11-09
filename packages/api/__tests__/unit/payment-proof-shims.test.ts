import * as syndicPhone from '../../src/lib/syndics/declared-payment/phone';
import * as syndicReference from '../../src/lib/syndics/declared-payment/reference';
import * as syndicBusinessDays from '../../src/lib/syndics/declared-payment/business-days';
import * as genericPhone from '../../src/lib/payment-proof/phone';
import * as genericReference from '../../src/lib/payment-proof/reference';
import * as genericBusinessDays from '../../src/lib/payment-proof/business-days';

describe('shims Syndic vers lib/payment-proof', () => {
  const pairs: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['phone', syndicPhone, genericPhone],
    ['reference', syndicReference, genericReference],
    ['business-days', syndicBusinessDays, genericBusinessDays]
  ];

  it.each(pairs)('%s : mêmes exports par référence', (_name, shim, generic) => {
    const keys = Object.keys(generic);
    expect(keys.length).toBeGreaterThan(0);
    expect(Object.keys(shim).sort()).toEqual(keys.sort());
    for (const key of keys) expect(shim[key]).toBe(generic[key]);
  });
});
