/**
 * Tests des aides transverses du contrôle du stock (lot 040, plan.md §3.3) :
 * `stock-controles.ts`, `stock-bons.ts`, `stock-alertes.ts`.
 *
 * Aucune base : le client Prisma est une doublure qui enregistre ce qu'on lui
 * demande. Ce qui est prouvé ici, ce sont les règles que tous les territoires
 * partagent — dates au jour UTC, ordre des verrous, empreinte de corps,
 * masquages, motifs, numérotation des bons, naissance des alertes.
 */

const getUserPermissions = jest.fn();

jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...args: any[]) => getUserPermissions(...args)
}));

const findFirstClientRequest = jest.fn();
const findManyCounts = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    stockClientRequest: { findFirst: (...args: any[]) => findFirstClientRequest(...args) },
    stockCount: { findMany: (...args: any[]) => findManyCounts(...args) }
  }
}));

import {
  assertMovementDateAllowed,
  assertReasonForContext,
  buildStockMeta,
  claimClientRequestTx,
  completeClientRequestTx,
  entryLagDays,
  findClientRequestReplay,
  hashRequestBody,
  isOpeningCountSuggested,
  isUniqueViolation,
  loadBlindLocationIds,
  loadItemsToRecount,
  lockStockBalancesTx,
  lockStockSiteTx,
  maskBalanceView,
  maskMovementView,
  maskValue,
  REASON_CODES_BY_CONTEXT,
  resolveStockCallerContext,
  STOCK_CONTROLS_DEFAULTS
} from '../../src/lib/finance/stock-controles';
import { createStockSlipTx, formatSlipNumber, SLIP_PREFIX } from '../../src/lib/finance/stock-bons';
import {
  alertKeys,
  raiseStockAlertTx,
  readStockAlertSettings,
  toYearMonthUtc
} from '../../src/lib/finance/stock-alertes';
import type { BalanceView, MovementView, StockCallerContext } from '../../src/lib/finance/types-040-controle';

const TENANT = 'tenant-1';

function ctx(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: 'user-1',
    valuesVisible: true,
    canValidateCount: false,
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canDispose: false,
    canManageTakers: true,
    canViewAlerts: false,
    canManageSettings: false,
    ...overrides
  };
}

function movement(overrides: Partial<MovementView> = {}): MovementView {
  return {
    id: 'm-1',
    type: 'ISSUE',
    itemId: 'item-1',
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45',
    itemUnit: 'sac',
    locationId: 'loc-1',
    locationLabel: 'Magasin central',
    movementDate: new Date('2026-10-01T00:00:00Z'),
    quantity: 10,
    isDecrease: true,
    unitCost: 5_200,
    totalValue: 52_000,
    currency: 'XOF',
    quantityAfter: 90,
    valueAfter: 468_000,
    siteId: 'site-1',
    siteLabel: 'Villa Cocody',
    costCategoryLabel: 'Gros œuvre',
    requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
    supplierInvoiceReference: null,
    transferGroupId: null,
    createdByLabel: 'Aïssatou Barry',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    takerId: 'taker-1',
    takerLabel: 'Koné Ibrahim — Équipe maçonnerie',
    supplierInvoiceId: null,
    stockCountId: null,
    slipId: 'slip-1',
    slipNumber: 'BS-2026-00001',
    reasonCode: null,
    reason: null,
    valuationSource: 'AVERAGE_COST',
    supplierCreditValue: 50_000,
    createdByUserId: 'user-1',
    entryLagDays: 0,
    attachmentsCount: 0,
    ...overrides
  };
}

function balance(overrides: Partial<BalanceView> = {}): BalanceView {
  return {
    itemId: 'item-1',
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45',
    itemUnit: 'sac',
    locationId: 'loc-1',
    locationLabel: 'Magasin central',
    quantity: 100,
    value: 520_000,
    averageUnitCost: 5_200,
    currency: 'XOF',
    ...overrides
  };
}

/** Une transaction factice qui note chaque `$executeRaw` et chaque appel de modèle. */
function fakeTx() {
  const raw: Array<{ sql: string; values: unknown[] }> = [];
  const tx: any = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      raw.push({ sql: strings.join('?'), values });
      return 1;
    }),
    stockClientRequest: { create: jest.fn(async () => ({ id: 'key-1' })) },
    stockSlip: {
      aggregate: jest.fn(async () => ({ _max: { number: 41 } })),
      create: jest.fn(async () => ({ id: 'slip-42' }))
    },
    stockAlert: { createMany: jest.fn(async () => ({ count: 1 })) },
    stockSettings: { findUnique: jest.fn(async () => null) },
    stockCount: { findMany: jest.fn(async () => []) },
    stockCountLine: { findMany: jest.fn(async () => []) }
  };
  return { tx, raw };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Dates (A5-R4, A5-R5)
// ---------------------------------------------------------------------------

describe('assertMovementDateAllowed — bornes au jour UTC', () => {
  const now = new Date('2026-10-04T23:30:00Z');

  it('accepte aujourd’hui et la borne exacte, quelle que soit l’heure', () => {
    expect(() => assertMovementDateAllowed(new Date('2026-10-04T00:00:00Z'), 7, now)).not.toThrow();
    expect(() => assertMovementDateAllowed(new Date('2026-09-27T23:59:00Z'), 7, now)).not.toThrow();
  });

  it('refuse demain en 400 STOCK_DATE_IN_FUTURE', () => {
    expect(() => assertMovementDateAllowed(new Date('2026-10-05T00:00:00Z'), 7, now)).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'STOCK_DATE_IN_FUTURE' })
    );
  });

  it('refuse huit jours en arrière avec la borne par défaut en 400 STOCK_DATE_TOO_OLD', () => {
    expect(() => assertMovementDateAllowed(new Date('2026-09-26T12:00:00Z'), 7, now)).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'STOCK_DATE_TOO_OLD' })
    );
  });

  it('avec une borne à zéro, seul le jour même passe', () => {
    expect(() => assertMovementDateAllowed(new Date('2026-10-04T01:00:00Z'), 0, now)).not.toThrow();
    expect(() => assertMovementDateAllowed(new Date('2026-10-03T23:00:00Z'), 0, now)).toThrow(
      expect.objectContaining({ code: 'STOCK_DATE_TOO_OLD' })
    );
  });
});

describe('entryLagDays', () => {
  it('compte les jours UTC entre la date déclarée et la saisie', () => {
    expect(entryLagDays(new Date('2026-10-04T08:00:00Z'), new Date('2026-09-27T00:00:00Z'))).toBe(7);
    expect(entryLagDays(new Date('2026-10-04T00:01:00Z'), new Date('2026-10-03T23:59:00Z'))).toBe(1);
  });

  it('ne rend jamais un délai négatif', () => {
    expect(entryLagDays(new Date('2026-10-01T08:00:00Z'), new Date('2026-10-04T00:00:00Z'))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Verrous (A10, A7-R3 bis)
// ---------------------------------------------------------------------------

describe('lockStockBalancesTx — ordre des verrous', () => {
  it('dédoublonne et trie les couples avant de verrouiller, un par un', async () => {
    const { tx, raw } = fakeTx();

    await lockStockBalancesTx(tx, TENANT, [
      { itemId: 'b-item', locationId: 'loc-2' },
      { itemId: 'a-item', locationId: 'loc-9' },
      { itemId: 'b-item', locationId: 'loc-2' },
      { itemId: 'a-item', locationId: 'loc-1' }
    ]);

    expect(raw.map(call => call.values[0])).toEqual([
      'tenant-1:a-item:loc-1',
      'tenant-1:a-item:loc-9',
      'tenant-1:b-item:loc-2'
    ]);
    expect(raw.every(call => call.sql.includes("pg_advisory_xact_lock(hashtext('stock-balance')"))).toBe(true);
  });

  it('deux opérations croisées prennent leurs verrous dans le même ordre', async () => {
    const aller = fakeTx();
    const retour = fakeTx();

    await lockStockBalancesTx(aller.tx, TENANT, [
      { itemId: 'ciment', locationId: 'A' },
      { itemId: 'ciment', locationId: 'B' }
    ]);
    await lockStockBalancesTx(retour.tx, TENANT, [
      { itemId: 'ciment', locationId: 'B' },
      { itemId: 'ciment', locationId: 'A' }
    ]);

    expect(aller.raw.map(call => call.values[0])).toEqual(retour.raw.map(call => call.values[0]));
  });

  it('ne fait rien sans couple', async () => {
    const { tx } = fakeTx();
    await lockStockBalancesTx(tx, TENANT, []);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('lockStockSiteTx', () => {
  it('pose le verrou de chantier à deux entiers', async () => {
    const { tx, raw } = fakeTx();
    await lockStockSiteTx(tx, 'site-1');
    expect(raw).toHaveLength(1);
    expect(raw[0].sql).toContain("pg_advisory_xact_lock(hashtext('stock-site'), hashtext(");
    expect(raw[0].values).toEqual(['site-1']);
  });
});

// ---------------------------------------------------------------------------
// Idempotence (B3-R2)
// ---------------------------------------------------------------------------

describe('hashRequestBody — empreinte du corps canonique', () => {
  it('ignore l’ordre des clés et le clientRequestId', () => {
    const a = hashRequestBody({ locationId: 'l', lines: [{ itemId: 'i', quantity: 2 }], clientRequestId: 'x' });
    const b = hashRequestBody({ lines: [{ quantity: 2, itemId: 'i' }], clientRequestId: 'y', locationId: 'l' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('change dès qu’une valeur change, et ignore les champs absents', () => {
    const base = hashRequestBody({ quantity: 2, itemId: 'i' });
    expect(hashRequestBody({ quantity: 3, itemId: 'i' })).not.toBe(base);
    expect(hashRequestBody({ quantity: 2, itemId: 'i', reason: undefined })).toBe(base);
  });

  it('rend les dates sous forme ISO', () => {
    expect(hashRequestBody({ issueDate: new Date('2026-10-04T00:00:00.000Z') })).toBe(
      hashRequestBody({ issueDate: '2026-10-04T00:00:00.000Z' })
    );
  });
});

describe('claimClientRequestTx et completeClientRequestTx', () => {
  it('écrit la clé avec l’empreinte et l’auteur, puis inscrit le résultat', async () => {
    const { tx, raw } = fakeTx();

    const keyId = await claimClientRequestTx(tx, {
      tenantId: TENANT,
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      operation: 'ISSUE',
      bodyHash: 'a'.repeat(64),
      userId: 'user-1'
    });
    expect(keyId).toBe('key-1');
    expect(tx.stockClientRequest.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        operation: 'ISSUE',
        bodyHash: 'a'.repeat(64),
        createdByUserId: 'user-1'
      },
      select: { id: true }
    });

    await completeClientRequestTx(tx, keyId, 'StockSlip', 'slip-1');
    expect(raw[0].sql).toContain('UPDATE "stock_client_requests"');
    expect(raw[0].values).toEqual(['StockSlip', 'slip-1', 'key-1']);
  });
});

describe('findClientRequestReplay', () => {
  it('rend null quand la clé n’existe pas', async () => {
    findFirstClientRequest.mockResolvedValue(null);
    await expect(findClientRequestReplay(TENANT, 'cr-1', 'user-1', 'h')).resolves.toBeNull();
    expect(findFirstClientRequest).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, clientRequestId: 'cr-1' } })
    );
  });

  it('rend le résultat d’origine pour le même utilisateur et le même corps', async () => {
    findFirstClientRequest.mockResolvedValue({
      bodyHash: 'h',
      createdByUserId: 'user-1',
      resultType: 'StockSlip',
      resultId: 'slip-1'
    });
    await expect(findClientRequestReplay(TENANT, 'cr-1', 'user-1', 'h')).resolves.toEqual({
      resultType: 'StockSlip',
      resultId: 'slip-1'
    });
  });

  it('refuse en 409 STOCK_IDEMPOTENCY_MISMATCH un autre corps ou un autre utilisateur', async () => {
    findFirstClientRequest.mockResolvedValue({
      bodyHash: 'h',
      createdByUserId: 'user-1',
      resultType: 'StockSlip',
      resultId: 'slip-1'
    });
    await expect(findClientRequestReplay(TENANT, 'cr-1', 'user-1', 'autre')).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_IDEMPOTENCY_MISMATCH'
    });
    await expect(findClientRequestReplay(TENANT, 'cr-1', 'user-2', 'h')).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_IDEMPOTENCY_MISMATCH'
    });
  });

  it('reconnaît une violation d’unicité Prisma', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isUniqueViolation(new Error('autre'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Appelant et masquages (spec §8.1, §8.2)
// ---------------------------------------------------------------------------

describe('resolveStockCallerContext', () => {
  it('traduit les permissions de l’agence en gestes', async () => {
    getUserPermissions.mockResolvedValue(['STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_COUNT', 'FINANCE_SETTINGS_MANAGE']);

    const contexte = await resolveStockCallerContext('user-9', TENANT);

    expect(getUserPermissions).toHaveBeenCalledWith('user-9', TENANT);
    expect(contexte).toEqual({
      userId: 'user-9',
      valuesVisible: false,
      canValidateCount: false,
      canReceive: true,
      canIssue: false,
      canTransfer: false,
      canCount: true,
      canDispose: false,
      canManageTakers: false,
      canViewAlerts: false,
      canManageSettings: true
    });
  });
});

describe('loadBlindLocationIds', () => {
  it('rend les lieux portant un inventaire DRAFT pour un appelant sans STOCK_COUNT_VALIDATE', async () => {
    const { tx } = fakeTx();
    tx.stockCount.findMany.mockResolvedValue([
      { locationId: 'loc-1' },
      { locationId: 'loc-1' },
      { locationId: 'loc-3' }
    ]);

    const blind = await loadBlindLocationIds(tx, TENANT, ctx());

    expect([...blind].sort()).toEqual(['loc-1', 'loc-3']);
    expect(tx.stockCount.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, status: 'DRAFT' },
      select: { locationId: true }
    });
  });

  it('ne lit rien pour un détenteur de STOCK_COUNT_VALIDATE', async () => {
    const { tx } = fakeTx();
    const blind = await loadBlindLocationIds(tx, TENANT, ctx({ canValidateCount: true }));
    expect(blind.size).toBe(0);
    expect(tx.stockCount.findMany).not.toHaveBeenCalled();
  });
});

describe('buildStockMeta et maskValue', () => {
  it('porte valuesVisible, les lieux masqués triés, et le curseur seulement s’il est donné', () => {
    expect(buildStockMeta(ctx({ valuesVisible: false }), new Set(['b', 'a']))).toEqual({
      valuesVisible: false,
      blindLocationIds: ['a', 'b']
    });
    expect(buildStockMeta(ctx(), new Set(), null)).toEqual({
      valuesVisible: true,
      blindLocationIds: [],
      nextCursor: null
    });
  });

  it('masque une valeur sans STOCK_VALUES_VIEW', () => {
    expect(maskValue(12, ctx())).toBe(12);
    expect(maskValue(12, ctx({ valuesVisible: false }))).toBeNull();
  });
});

describe('maskMovementView', () => {
  it('sans STOCK_VALUES_VIEW : toutes les valeurs et la source du prix valent null, la quantité reste', () => {
    const masque = maskMovementView(movement(), ctx({ valuesVisible: false }), new Set());
    expect(masque).toMatchObject({
      unitCost: null,
      totalValue: null,
      valueAfter: null,
      supplierCreditValue: null,
      valuationSource: null,
      quantity: 10,
      quantityAfter: 90
    });
  });

  it('lieu en comptage : reste après, valeur après et coût unitaire masqués, même pour un comptable', () => {
    const masque = maskMovementView(movement(), ctx({ valuesVisible: true }), new Set(['loc-1']));
    expect(masque).toMatchObject({ quantityAfter: null, valueAfter: null, unitCost: null, quantity: 10 });
    expect(masque.totalValue).toBe(52_000);
  });

  it('ne touche à rien pour un lieu hors comptage avec les valeurs', () => {
    const original = movement();
    expect(maskMovementView(original, ctx(), new Set(['loc-2']))).toEqual(original);
  });
});

describe('maskBalanceView', () => {
  it('sans STOCK_VALUES_VIEW : valeur et coût moyen masqués, quantité visible', () => {
    expect(maskBalanceView(balance(), ctx({ valuesVisible: false }), new Set())).toMatchObject({
      quantity: 100,
      value: null,
      averageUnitCost: null
    });
  });

  it('lieu en comptage : quantité, valeur et coût moyen masqués pour qui ne valide pas (spec A2, critère 7)', () => {
    expect(maskBalanceView(balance(), ctx({ valuesVisible: true }), new Set(['loc-1']))).toMatchObject({
      quantity: null,
      value: null,
      averageUnitCost: null
    });
  });
});

// ---------------------------------------------------------------------------
// Motifs (spec §4)
// ---------------------------------------------------------------------------

describe('assertReasonForContext', () => {
  it('accepte un motif de la colonne du contexte', () => {
    expect(() => assertReasonForContext('SCRAP', 'BREAKAGE')).not.toThrow();
    expect(() => assertReasonForContext('TRANSFER', 'SITE_EVACUATION')).not.toThrow();
    expect(() => assertReasonForContext('SUPPLIER_RETURN', 'EXCESS_DELIVERY')).not.toThrow();
    expect(() => assertReasonForContext('COUNT', 'UNEXPLAINED_DISAPPEARANCE')).not.toThrow();
  });

  it('refuse un motif d’une autre colonne en 400 STOCK_REASON_NOT_ALLOWED', () => {
    expect(() => assertReasonForContext('SCRAP', 'SITE_SUPPLY')).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'STOCK_REASON_NOT_ALLOWED' })
    );
  });

  it('ne laisse jamais choisir le stock d’ouverture, posé par le système', () => {
    expect(() => assertReasonForContext('COUNT', 'OPENING_BALANCE')).toThrow(
      expect.objectContaining({ code: 'STOCK_REASON_NOT_ALLOWED' })
    );
    expect(REASON_CODES_BY_CONTEXT.count).not.toContain('OPENING_BALANCE');
  });

  it('exige la précision pour « Autre » en 400 STOCK_REASON_REQUIRED', () => {
    expect(() => assertReasonForContext('TRANSFER', 'OTHER')).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'STOCK_REASON_REQUIRED' })
    );
    expect(() => assertReasonForContext('TRANSFER', 'OTHER', '   ')).toThrow(
      expect.objectContaining({ code: 'STOCK_REASON_REQUIRED' })
    );
    expect(() => assertReasonForContext('TRANSFER', 'OTHER', 'Prêt à un chantier voisin')).not.toThrow();
  });

  it('expose les quatre listes du contrat, chacune avec « Autre »', () => {
    expect(REASON_CODES_BY_CONTEXT.scrap).toEqual(['BREAKAGE', 'DETERIORATION', 'OTHER']);
    expect(REASON_CODES_BY_CONTEXT.supplierReturn).toEqual([
      'NON_CONFORMING',
      'DAMAGED_ON_DELIVERY',
      'EXCESS_DELIVERY',
      'OTHER'
    ]);
    expect(REASON_CODES_BY_CONTEXT.transfer).toEqual([
      'SITE_SUPPLY',
      'RETURN_TO_WAREHOUSE',
      'SITE_EVACUATION',
      'REBALANCING',
      'OTHER'
    ]);
    expect(REASON_CODES_BY_CONTEXT.count).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// Recomptage et inventaire d'ouverture
// ---------------------------------------------------------------------------

describe('loadItemsToRecount', () => {
  it('ne garde que les lignes écartées du DERNIER inventaire validé de chaque lieu', async () => {
    const { tx } = fakeTx();
    const setAsideAt = new Date('2026-09-30T10:00:00Z');
    tx.stockCount.findMany.mockResolvedValue([
      { id: 'count-recent', locationId: 'loc-1' },
      { id: 'count-ancien', locationId: 'loc-1' },
      { id: 'count-2', locationId: 'loc-2' }
    ]);
    tx.stockCountLine.findMany.mockResolvedValue([
      { countId: 'count-recent', itemId: 'ciment', setAsideAt, item: { label: 'Ciment' } },
      { countId: 'count-2', itemId: 'sable', setAsideAt, item: { label: 'Sable' } }
    ]);

    const result = await loadItemsToRecount(tx, TENANT, ['loc-1', 'loc-2', 'loc-1']);

    expect(tx.stockCountLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { countId: { in: ['count-recent', 'count-2'] }, setAsideAt: { not: null } } })
    );
    expect(result.get('loc-1')).toEqual([
      { itemId: 'ciment', itemLabel: 'Ciment', countId: 'count-recent', setAsideAt }
    ]);
    expect(result.get('loc-2')).toHaveLength(1);
  });

  it('ne lit rien sans lieu', async () => {
    const { tx } = fakeTx();
    expect((await loadItemsToRecount(tx, TENANT, [])).size).toBe(0);
    expect(tx.stockCount.findMany).not.toHaveBeenCalled();
  });
});

describe('isOpeningCountSuggested — 30 jours après la bascule', () => {
  const enabled = new Date('2026-09-01T00:00:00Z');

  it('vrai pendant 30 jours sans inventaire d’ouverture', () => {
    expect(isOpeningCountSuggested({ stockEnabledAt: enabled }, false, new Date('2026-09-15T00:00:00Z'))).toBe(true);
    expect(isOpeningCountSuggested({ stockEnabledAt: enabled }, false, new Date('2026-10-01T00:00:00Z'))).toBe(true);
  });

  it('faux à 31 jours, avec un inventaire d’ouverture vivant, ou sans bascule', () => {
    expect(isOpeningCountSuggested({ stockEnabledAt: enabled }, false, new Date('2026-10-02T00:00:00Z'))).toBe(false);
    expect(isOpeningCountSuggested({ stockEnabledAt: enabled }, true, new Date('2026-09-15T00:00:00Z'))).toBe(false);
    expect(isOpeningCountSuggested({ stockEnabledAt: null }, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bons (B4-R1)
// ---------------------------------------------------------------------------

describe('formatSlipNumber et createStockSlipTx', () => {
  it('formate le numéro sur cinq chiffres avec le préfixe de la nature', () => {
    expect(formatSlipNumber('RECEIPT', 2026, 42)).toBe('BR-2026-00042');
    expect(formatSlipNumber('ISSUE', 2026, 1)).toBe('BS-2026-00001');
    expect(formatSlipNumber('COUNT_REPORT', 2027, 12345)).toBe('PVI-2027-12345');
    expect(SLIP_PREFIX).toEqual({ RECEIPT: 'BR', ISSUE: 'BS', COUNT_REPORT: 'PVI' });
  });

  it('prend le verrou stock-slip AVANT de lire le rang, et numérote dans l’année UTC du document', async () => {
    const { tx, raw } = fakeTx();
    const order: string[] = [];
    tx.$executeRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      order.push('lock');
      raw.push({ sql: strings.join('?'), values });
      return 1;
    });
    tx.stockSlip.aggregate.mockImplementation(async () => {
      order.push('aggregate');
      return { _max: { number: 41 } };
    });

    const slip = await createStockSlipTx(tx, {
      tenantId: TENANT,
      kind: 'ISSUE',
      documentDate: new Date('2026-12-31T23:30:00Z'),
      locationId: 'loc-1',
      siteId: 'site-1',
      takerId: 'taker-1',
      requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
      createdByUserId: 'user-1',
      snapshot: {
        location: 'Magasin central',
        site: 'Villa Cocody',
        taker: 'Koné Ibrahim — Équipe maçonnerie',
        requestedBy: 'Koné Ibrahim — Équipe maçonnerie',
        invoice: null,
        author: 'Aïssatou Barry',
        lines: [{ itemId: 'item-1', reference: 'CIM-45', label: 'Ciment CPJ 45', unit: 'sac' }]
      }
    });

    expect(order).toEqual(['lock', 'aggregate']);
    expect(raw[0].sql).toContain("pg_advisory_xact_lock(hashtext('stock-slip'), hashtext(");
    expect(raw[0].values).toEqual([TENANT]);
    expect(tx.stockSlip.aggregate).toHaveBeenCalledWith({
      where: { tenantId: TENANT, kind: 'ISSUE', year: 2026 },
      _max: { number: true }
    });
    expect(tx.stockSlip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT, kind: 'ISSUE', year: 2026, number: 42, stockCountId: null })
      })
    );
    expect(slip).toEqual({ id: 'slip-42', number: 'BS-2026-00042' });
  });

  it('repart à 1 quand l’agence n’a encore aucun bon de cette nature cette année', async () => {
    const { tx } = fakeTx();
    tx.stockSlip.aggregate.mockResolvedValue({ _max: { number: null } });
    const slip = await createStockSlipTx(tx, {
      tenantId: TENANT,
      kind: 'RECEIPT',
      documentDate: new Date('2026-03-01T00:00:00Z'),
      locationId: 'loc-1',
      createdByUserId: 'user-1',
      snapshot: {
        location: 'Magasin central',
        site: null,
        taker: null,
        requestedBy: null,
        invoice: { reference: 'FAC-2026-014', supplierName: 'Cimaf' },
        author: 'Aïssatou Barry',
        lines: []
      }
    });
    expect(slip.number).toBe('BR-2026-00001');
  });
});

// ---------------------------------------------------------------------------
// Alertes (B7-R1, B7-R2)
// ---------------------------------------------------------------------------

describe('raiseStockAlertTx', () => {
  it('écrit par createMany avec skipDuplicates, jamais par create', async () => {
    const { tx } = fakeTx();
    tx.stockAlert.create = jest.fn();

    await raiseStockAlertTx(tx, {
      tenantId: TENANT,
      kind: 'LARGE_ISSUE',
      severity: 'WARNING',
      dedupeKey: alertKeys.largeIssue('slip-1'),
      amount: 600_000,
      threshold: 500_000,
      locationId: 'loc-1',
      siteId: 'site-1',
      subjectType: 'StockSlip',
      subjectId: 'slip-1',
      details: { slipNumber: 'BS-2026-00001' }
    });

    expect(tx.stockAlert.create).not.toHaveBeenCalled();
    expect(tx.stockAlert.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: TENANT,
          kind: 'LARGE_ISSUE',
          severity: 'WARNING',
          dedupeKey: 'LARGE_ISSUE:slip-1',
          amount: 600_000,
          threshold: 500_000,
          currency: 'XOF',
          siteId: 'site-1',
          locationId: 'loc-1',
          subjectType: 'StockSlip',
          subjectId: 'slip-1',
          details: { slipNumber: 'BS-2026-00001' }
        }
      ],
      skipDuplicates: true
    });
  });

  it('une alerte déjà levée (doublon) ne fait pas échouer l’opération', async () => {
    const { tx } = fakeTx();
    tx.stockAlert.createMany.mockResolvedValue({ count: 0 });
    await expect(
      raiseStockAlertTx(tx, {
        tenantId: TENANT,
        kind: 'CASH_MATERIAL_PURCHASE',
        severity: 'WARNING',
        dedupeKey: alertKeys.cashMaterialCumul('site-1', '2026-10'),
        subjectType: 'CashVoucher',
        subjectId: 'voucher-4'
      })
    ).resolves.toBeUndefined();
  });
});

describe('alertKeys et toYearMonthUtc', () => {
  it('construit les clés de spec B7-R1', () => {
    expect(alertKeys.countVariance('c')).toBe('COUNT_VARIANCE:c');
    expect(alertKeys.countLineSetAside('c')).toBe('COUNT_LINE_SET_ASIDE:c');
    expect(alertKeys.countCancelled('c')).toBe('COUNT_CANCELLED:c');
    expect(alertKeys.countSelfValidated('c')).toBe('COUNT_SELF_VALIDATED:c');
    expect(alertKeys.largeScrap('m')).toBe('LARGE_SCRAP:m');
    expect(alertKeys.scrapCumul('loc', '2026-10')).toBe('SCRAP_CUMUL:loc:2026-10');
    expect(alertKeys.receiptRepeated('s')).toBe('RECEIPT_REPEATED:s');
    expect(alertKeys.receiptOverInvoice('s')).toBe('RECEIPT_OVER_INVOICE:s');
    expect(alertKeys.receiptUnvalued('s')).toBe('RECEIPT_UNVALUED:s');
    expect(alertKeys.cashMaterial('v')).toBe('CASH_MATERIAL_PURCHASE:v');
    expect(alertKeys.cashMaterialCumul('site', '2026-10')).toBe('CASH_MATERIAL_CUMUL:site:2026-10');
  });

  it('prend le mois civil UTC', () => {
    expect(toYearMonthUtc(new Date('2026-10-31T23:59:00Z'))).toBe('2026-10');
    expect(toYearMonthUtc(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});

describe('readStockAlertSettings — défauts en mémoire, jamais de ligne créée', () => {
  it('rend les défauts quand l’agence n’a pas de ligne de réglages', async () => {
    const { tx } = fakeTx();
    tx.stockSettings.create = jest.fn();
    tx.stockSettings.upsert = jest.fn();

    const settings = await readStockAlertSettings(tx, TENANT);

    expect(tx.stockSettings.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT } }));
    expect(tx.stockSettings.create).not.toHaveBeenCalled();
    expect(tx.stockSettings.upsert).not.toHaveBeenCalled();
    expect(settings).toEqual({
      backdatingLimitDays: 7,
      requireTaker: false,
      issueAlertAmount: 500_000,
      countVarianceAlertAmount: 100_000,
      countVarianceAlertPercent: 5,
      cashMaterialAlertAmount: 100_000,
      materialCostCategoryIds: []
    });
    expect(settings.materialCostCategoryIds).not.toBe(STOCK_CONTROLS_DEFAULTS.materialCostCategoryIds);
  });

  it('convertit les décimaux et garde un seuil vide à null (nature désactivée)', async () => {
    const { tx } = fakeTx();
    tx.stockSettings.findUnique.mockResolvedValue({
      backdatingLimitDays: 30,
      requireTaker: true,
      issueAlertAmount: '750000.00',
      countVarianceAlertAmount: null,
      countVarianceAlertPercent: '2.50',
      cashMaterialAlertAmount: null,
      materialCostCategoryIds: ['poste-1']
    });

    expect(await readStockAlertSettings(tx, TENANT)).toEqual({
      backdatingLimitDays: 30,
      requireTaker: true,
      issueAlertAmount: 750_000,
      countVarianceAlertAmount: null,
      countVarianceAlertPercent: 2.5,
      cashMaterialAlertAmount: null,
      materialCostCategoryIds: ['poste-1']
    });
  });
});
