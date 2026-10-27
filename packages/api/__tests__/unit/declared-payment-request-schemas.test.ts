/**
 * Spec 047, contrats §0 : `paidAt` est un horodatage ISO 8601 AVEC décalage horaire.
 */
import {
  approveDeclarationBodySchema,
  coOwnerDeclarationPayloadSchema,
  managerDeclarationPayloadSchema
} from '../../src/lib/syndics/declared-payment/request-schemas';

const UUID = 'a0a0a0a0-0000-4000-8000-000000000000';
const payload = (paidAt: string) => ({
  syndicId: UUID,
  receivingNumberId: UUID,
  payerPhone: '0707070707',
  amount: 1000,
  paidAt,
  transactionReference: 'MP261017.ABC',
  lines: [{ lotId: UUID, amount: 1000, chargeCallIds: [] }]
});

describe('paidAt des déclarations', () => {
  it.each(['2026-10-17T10:00:00Z', '2026-10-17T10:00:00+00:00', '2026-10-17T10:00:00.123+01:00'])(
    'accepte %s',
    value => {
      expect(coOwnerDeclarationPayloadSchema.safeParse(payload(value)).success).toBe(true);
    }
  );

  it.each(['2026-10-17', '2026-10-17T10:00:00', '17/10/2026 10:00', 'hier', '2026-13-45T10:00:00Z'])(
    'refuse %s',
    value => {
      expect(coOwnerDeclarationPayloadSchema.safeParse(payload(value)).success).toBe(false);
      const { syndicId: _syndicId, ...manager } = payload(value);
      expect(managerDeclarationPayloadSchema.safeParse(manager).success).toBe(false);
    }
  );

  it('la correction de validation exige aussi un décalage', () => {
    expect(approveDeclarationBodySchema.safeParse({ correction: { paidAt: '2026-10-17T10:00:00Z' } }).success).toBe(
      true
    );
    expect(approveDeclarationBodySchema.safeParse({ correction: { paidAt: '2026-10-17' } }).success).toBe(false);
  });
});
