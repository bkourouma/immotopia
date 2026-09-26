/**
 * Recette Syndic (26/09, ecart front #2 / API) — deux POST .../properties
 * concurrents (double clic front, cf. property-form-wizard.test.tsx) pour une
 * agence deja au quota LOTS : le premier doit repondre 409 QUOTA_EXCEEDED,
 * le second AUSSI — jamais 500 INTERNAL.
 *
 * `createProperty` (services/property-service.ts) serialise les deux appels
 * sur `lockTenantLotsTx` (verrou d'agence). Sous contention, Prisma peut
 * rapporter la seconde transaction comme un conflit d'ecriture/interblocage
 * (`PrismaClientKnownRequestError` P2034 — « Transaction failed due to a
 * write conflict or a deadlock. Please retry your transaction », documente
 * par Prisma comme reessayable) plutot que de la laisser revoir le quota a
 * jour. Avant correctif, cette erreur Prisma brute remontait telle quelle :
 * `middleware/error-middleware.ts` classe tout `PrismaClientKnownRequestError`
 * non reconnu (ni P2002, ni P2025, ni P2003) en 500 INTERNAL. Apres
 * correctif, `createProperty` la traite comme la collision de reference
 * (P2002 sur `internal_reference`) : reessai, et le second essai voit alors
 * le quota a jour et leve `QuotaExceededError` (409).
 *
 * Modele de mock : `__tests__/api/quota-exceeded-409.test.ts` (simuler les
 * collaborateurs de `property-service.ts`, pas une vraie base — la
 * contention Postgres elle-meme n'est pas reproductible ici).
 */

const transactionMock = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (...args: any[]) => transactionMock(...args)
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

const generatePropertyReference = jest.fn();
jest.mock('../../src/utils/property-reference-generator', () => ({
  generatePropertyReference: (...args: any[]) => generatePropertyReference(...args)
}));

jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));

jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn()
}));

import { createProperty } from '../../src/services/property-service';
import { QuotaExceededError } from '../../src/middleware/error-middleware';
import { PropertyOwnershipType, PropertyType, PropertyTransactionMode } from '@prisma/client';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const QUOTA_DETAIL = { capacityKey: 'LOTS', limit: 50, used: 50, requested: 1 };

/** Imite `PrismaClientKnownRequestError` sans importer la vraie classe (le moteur Prisma n'est pas requis en test). */
class FakePrismaKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  constructor(code: string, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}

const baseData = () => ({
  propertyType: PropertyType.APPARTEMENT,
  ownershipType: PropertyOwnershipType.TENANT,
  title: 'Bel appartement',
  description: '',
  address: '',
  transactionModes: [PropertyTransactionMode.RENTAL],
  currency: 'EUR'
});

beforeEach(() => {
  jest.clearAllMocks();
  // `clearAllMocks` ne vide pas la file `mockRejectedValueOnce`/`mockResolvedValueOnce` :
  // sans ce reset explicite, une reponse "once" non consommee par un test (ex. le
  // second essai jamais atteint avant correctif) fuit vers le test suivant.
  transactionMock.mockReset();
  generatePropertyReference.mockResolvedValue('PROP-20260926-1111-0001');
});

describe('property-service.createProperty — second appel concurrent sous quota BLOCK', () => {
  it(
    'un conflit de transaction Prisma (P2034) pendant le controle de quota concurrent ' +
      "se reessaie et retombe sur QuotaExceededError (409), jamais sur l'erreur Prisma brute (500)",
    async () => {
      // 1er essai : la transaction echoue avec un conflit d'ecriture/interblocage,
      // typique de deux creations concurrentes serialisees sur le verrou d'agence.
      transactionMock.mockRejectedValueOnce(
        new FakePrismaKnownRequestError(
          'P2034',
          'Transaction failed due to a write conflict or a deadlock. Please retry your transaction.'
        )
      );
      // 2e essai (reessai) : le quota est maintenant vu a jour, la transaction
      // annule tout et leve l'erreur typee attendue.
      transactionMock.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

      await expect(createProperty(TENANT_ID, null, baseData() as any)).rejects.toBeInstanceOf(QuotaExceededError);

      expect(transactionMock).toHaveBeenCalledTimes(2);
    }
  );

  it('une QuotaExceededError levee des le premier essai ne declenche aucun reessai (pas de latence inutile)', async () => {
    transactionMock.mockRejectedValueOnce(new QuotaExceededError(QUOTA_DETAIL));

    await expect(createProperty(TENANT_ID, null, baseData() as any)).rejects.toBeInstanceOf(QuotaExceededError);

    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('une collision de reference (P2002 internal_reference) continue de se reessayer normalement', async () => {
    transactionMock.mockRejectedValueOnce(
      new FakePrismaKnownRequestError('P2002', 'Unique constraint failed', { target: ['internal_reference'] })
    );
    transactionMock.mockResolvedValueOnce({ id: 'prop-1', internalReference: 'PROP-20260926-1111-0002' });

    const result = await createProperty(TENANT_ID, null, baseData() as any);

    expect(result).toMatchObject({ id: 'prop-1' });
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });
});
