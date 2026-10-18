/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T032 : `lib/syndics/declared-payment/portal.ts` (contrats §2.1, 2.4, 2.5, 2.6).
 * Le moteur (création, annulation, requêtes) est simulé ; on vérifie le périmètre
 * du portail, le choix du déclarant et l'ordre des effets.
 */

const events: string[] = [];

const createDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-create', () => ({
  createDeclaration: (...a: any[]) => createDeclaration(...a)
}));
const cancelDeclaration = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-cancel', () => ({
  cancelDeclaration: (...a: any[]) => cancelDeclaration(...a)
}));
const getCoOwnerDeclaration = jest.fn();
const listQuery = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/declaration-queries', () => ({
  getCoOwnerDeclaration: (...a: any[]) => getCoOwnerDeclaration(...a),
  listCoOwnerDeclarations: (...a: any[]) => listQuery(...a)
}));
const getAvailability = jest.fn();
jest.mock('../../src/lib/syndics/declared-payment/settings', () => ({
  getDeclaredPaymentAvailability: (...a: any[]) => getAvailability(...a)
}));
jest.mock('../../src/lib/syndics/declared-payment/notifications', () => ({
  notifyDeclarationReceived: (...a: any[]) => events.push(`received:${a[0]}:${a[1]}`)
}));

import {
  cancelCoOwnerDeclaration,
  createCoOwnerDeclaration,
  getCoOwnerDeclaredAvailability,
  listCoOwnerDeclarations
} from '../../src/lib/syndics/declared-payment/portal';

const SYNDIC = 'syndic-1';
const OTHER_SYNDIC = 'syndic-2';

const scope: any = {
  tenantId: 'tenant-A',
  contactIds: ['contact-1', 'contact-2'],
  lots: [
    { lotId: 'lot-1', syndicateId: SYNDIC, contactId: 'contact-1' },
    { lotId: 'lot-2', syndicateId: SYNDIC, contactId: 'contact-2' },
    { lotId: 'lot-3', syndicateId: OTHER_SYNDIC, contactId: 'contact-1' }
  ],
  lotIds: ['lot-1', 'lot-2', 'lot-3'],
  syndicateIds: [SYNDIC, OTHER_SYNDIC]
};

const body = (lotIds: string[]): any => ({
  syndicId: SYNDIC,
  receivingNumberId: 'num-1',
  payerPhone: '0707070707',
  amount: 20000,
  paidAt: '2026-10-17T14:32:00+00:00',
  transactionReference: 'MP261017',
  lines: lotIds.map(lotId => ({ lotId, amount: 10000, chargeCallIds: [] }))
});

beforeEach(() => {
  jest.clearAllMocks();
  events.length = 0;
});

describe('getCoOwnerDeclaredAvailability', () => {
  const numbers = [{ id: 'num-1', operator: 'ORANGE', phoneNumber: '+2250707070707' }];
  const settings = { payerInstructions: 'Indiquez le lot', proofRequired: true };

  it('répond 404 pour une copropriété hors du périmètre, sans rien lire', async () => {
    await expect(getCoOwnerDeclaredAvailability(scope, 'syndic-9')).rejects.toMatchObject({ statusCode: 404 });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('livre numéros actifs, consigne et plafond quand le paiement déclaré est disponible', async () => {
    getAvailability.mockResolvedValue({ available: true, settings, receivingNumbers: numbers });
    await expect(getCoOwnerDeclaredAvailability(scope, SYNDIC)).resolves.toEqual({
      syndicateId: SYNDIC,
      available: true,
      receivingNumbers: numbers,
      payerInstructions: 'Indiquez le lot',
      proofRequired: true,
      aiPrefillAvailable: false,
      maxAmount: 5_000_000
    });
    expect(getAvailability).toHaveBeenCalledWith('tenant-A', SYNDIC);
  });

  it('ne livre ni numéro ni consigne quand la copropriété n’accepte pas les déclarations', async () => {
    getAvailability.mockResolvedValue({ available: false, settings, receivingNumbers: numbers });
    const result = await getCoOwnerDeclaredAvailability(scope, SYNDIC);
    expect(result.available).toBe(false);
    expect(result.receivingNumbers).toEqual([]);
    expect(result.payerInstructions).toBeNull();
  });
});

describe('createCoOwnerDeclaration', () => {
  it('déclare au nom du contact du premier lot, retire syndicId du moteur et accuse réception', async () => {
    createDeclaration.mockResolvedValue({ declarationId: 'decl-1' });
    getCoOwnerDeclaration.mockResolvedValue({ id: 'decl-1', status: 'PENDING' });
    const proof = { buffer: Buffer.from('x'), originalname: 'c.png', mimetype: 'image/png' };

    const result = await createCoOwnerDeclaration(scope, body(['lot-2', 'lot-1']), proof);

    expect(result).toEqual({ id: 'decl-1', status: 'PENDING' });
    const call = createDeclaration.mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-A');
    expect(call.syndicateId).toBe(SYNDIC);
    expect(call.actor).toEqual({ type: 'COOWNER', scope, contactId: 'contact-2' });
    expect(call.input.syndicId).toBeUndefined();
    expect(call.proof).toBe(proof);
    expect(events).toEqual(['received:tenant-A:decl-1']);
    expect(getCoOwnerDeclaration).toHaveBeenCalledWith(scope, 'decl-1');
  });

  it('répond 404 pour une copropriété ou un premier lot hors périmètre, sans rien écrire', async () => {
    await expect(createCoOwnerDeclaration(scope, { ...body(['lot-1']), syndicId: 'syndic-9' })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(createCoOwnerDeclaration(scope, body(['lot-x']))).rejects.toMatchObject({ statusCode: 404 });
    // Un lot du périmètre, mais d'une AUTRE copropriété que celle déclarée.
    await expect(createCoOwnerDeclaration(scope, body(['lot-3']))).rejects.toMatchObject({ statusCode: 404 });
    expect(createDeclaration).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('n’accuse pas réception quand le moteur refuse', async () => {
    createDeclaration.mockRejectedValue(Object.assign(new Error('déjà'), { statusCode: 409 }));
    await expect(createCoOwnerDeclaration(scope, body(['lot-1']))).rejects.toMatchObject({ statusCode: 409 });
    expect(events).toEqual([]);
  });
});

describe('listCoOwnerDeclarations et cancelCoOwnerDeclaration', () => {
  it('traduit le statut ALL en « aucun filtre »', async () => {
    listQuery.mockResolvedValue({ items: [], pagination: {} });
    await listCoOwnerDeclarations(scope, { status: 'ALL', page: 2, limit: 10 });
    expect(listQuery).toHaveBeenCalledWith(scope, { status: undefined, page: 2, limit: 10 });
    await listCoOwnerDeclarations(scope, { status: 'PENDING' });
    expect(listQuery).toHaveBeenLastCalledWith(scope, { status: 'PENDING', page: undefined, limit: undefined });
  });

  it('annule puis relit la déclaration annulée', async () => {
    cancelDeclaration.mockResolvedValue({ declarationId: 'decl-1' });
    getCoOwnerDeclaration.mockResolvedValue({ id: 'decl-1', status: 'CANCELED' });
    await expect(cancelCoOwnerDeclaration(scope, 'decl-1')).resolves.toEqual({ id: 'decl-1', status: 'CANCELED' });
    expect(cancelDeclaration).toHaveBeenCalledWith({ scope, declarationId: 'decl-1' });
  });

  it('ne relit rien quand l’annulation échoue', async () => {
    cancelDeclaration.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 409 }));
    await expect(cancelCoOwnerDeclaration(scope, 'decl-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(getCoOwnerDeclaration).not.toHaveBeenCalled();
  });
});
