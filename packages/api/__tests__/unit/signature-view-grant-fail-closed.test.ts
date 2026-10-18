/**
 * `sourceGateOf` est fermé par défaut pour les mandats de prélèvement (spec 042 §10.5) : si la source d'un de ces
 * types est introuvable, le code reste exigé avant consultation. Un type ordinaire sans source reste ouvert.
 */
jest.mock('../../src/lib/signature/sources', () => ({ findSignatureSource: () => undefined }));

import { sourceGateOf } from '../../src/lib/signature/view-grant';

describe('sourceGateOf, source introuvable', () => {
  it.each(['DIRECT_DEBIT_MANDATE', 'SYNDIC_DIRECT_DEBIT_MANDATE'])('%s : code avant consultation exigé', kind => {
    expect(sourceGateOf(kind)).toMatchObject({
      codeBeforeView: true,
      externalGateway: false,
      allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP']
    });
  });

  it('un type ordinaire reste ouvert (comportement existant)', () => {
    expect(sourceGateOf('RENTAL_LEASE')).toEqual({
      codeBeforeView: false,
      externalGateway: false,
      allowedChannels: undefined
    });
  });
});
