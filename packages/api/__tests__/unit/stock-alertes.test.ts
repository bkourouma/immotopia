/**
 * Alertes de stock — lecture, textes, traitement, file « À traiter » — et
 * réglages de contrôle (lot 040 : spec B7-R3, B7-R4, B7-R5, B6, A9-R1,
 * contrat `AlertView`, `ControlsSettings`).
 *
 * Aucune base : le client Prisma est une doublure en mémoire qui applique les
 * filtres que le code envoie (agence, statut, nature, curseur). Ce qui est
 * prouvé ici : titres et messages par une table exhaustive, aucun montant sans
 * STOCK_VALUES_VIEW, aucun mot interdit, pagination par curseur, traitement
 * conditionnel (404 d'une autre agence, 409 déjà traitée), réglages lus sans
 * création de ligne et modifiés avec audit critique et postes vérifiés.
 */

import { Prisma, StockAlertKind } from '@prisma/client';

type Row = Record<string, any>;

const store = {
  alerts: [] as Row[],
  slips: [] as Row[],
  counts: [] as Row[],
  movements: [] as Row[],
  invoices: [] as Row[],
  vouchers: [] as Row[],
  settings: [] as Row[],
  items: [] as Row[],
  categories: [] as Row[],
  users: [] as Row[]
};

const logAuditEvent = jest.fn();
const recordAuditEvent = jest.fn();
const getUserPermissions = jest.fn();

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => logAuditEvent(...args),
  recordAuditEvent: (...args: any[]) => recordAuditEvent(...args)
}));
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...args: any[]) => getUserPermissions(...args)
}));
jest.mock('../../src/lib/finance/cash', () => ({
  formatCashVoucherNumber: (year: number | null, number: number | null) =>
    year == null || number == null ? null : `${year}-${String(number).padStart(4, '0')}`
}));

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;
    if (key === 'AND') {
      if (!(condition as Row[]).every(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(condition as Row[]).some(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    const value = row[key];
    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date) &&
      !Array.isArray(condition)
    ) {
      const c = condition as Row;
      if ('in' in c && !c.in.includes(value)) return false;
      if ('not' in c && (c.not === null ? value === null || value === undefined : value === c.not)) return false;
      if ('lt' in c && !(value < c.lt)) return false;
      if ('gte' in c && !(value >= c.gte)) return false;
      if ('lte' in c && !(value <= c.lte)) return false;
      continue;
    }
    if (condition instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== condition.getTime()) return false;
      continue;
    }
    if (value !== condition) return false;
  }
  return true;
}

function alertWithRelations(row: Row): Row {
  const site = row.siteId ? { id: row.siteId, name: row.siteName ?? 'Chantier' } : null;
  const location = row.locationId ? { id: row.locationId, label: row.locationLabel ?? 'Magasin' } : null;
  const user = store.users.find(u => u.id === row.acknowledgedByUserId) ?? null;
  return {
    ...row,
    site,
    location,
    acknowledgedBy: user ? { fullName: user.fullName, email: user.email } : null
  };
}

function sortAlerts(rows: Row[], orderBy: Row[] | Row | undefined): Row[] {
  const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, dir] = Object.entries(order)[0] as [string, 'asc' | 'desc'];
      const av = a[field] instanceof Date ? a[field].getTime() : a[field];
      const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

const db: Row = {
  stockAlert: {
    findMany: jest.fn(async ({ where, orderBy, take }: Row) => {
      const rows = sortAlerts(
        store.alerts.filter(row => matchesWhere(row, where)),
        orderBy
      ).map(alertWithRelations);
      return typeof take === 'number' ? rows.slice(0, take) : rows;
    }),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.alerts.find(r => matchesWhere(r, where));
      return row ? alertWithRelations(row) : null;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.alerts.filter(row => matchesWhere(row, where));
      rows.forEach(row => Object.assign(row, data));
      return { count: rows.length };
    }),
    createMany: jest.fn(async () => ({ count: 1 }))
  },
  stockSlip: {
    findMany: jest.fn(async ({ where }: Row) => store.slips.filter(row => matchesWhere(row, where)))
  },
  stockCount: {
    findMany: jest.fn(async ({ where }: Row) => store.counts.filter(row => matchesWhere(row, where)))
  },
  stockMovement: {
    findMany: jest.fn(async ({ where }: Row) => store.movements.filter(row => matchesWhere(row, where)))
  },
  supplierInvoice: {
    findMany: jest.fn(async ({ where }: Row) => store.invoices.filter(row => matchesWhere(row, where)))
  },
  cashVoucher: {
    findMany: jest.fn(async ({ where }: Row) => store.vouchers.filter(row => matchesWhere(row, where)))
  },
  stockSettings: {
    findUnique: jest.fn(async ({ where }: Row) => store.settings.find(row => row.tenantId === where.tenantId) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = {
        id: `settings-${store.settings.length + 1}`,
        valuationMethod: 'WEIGHTED_AVERAGE',
        decidedAt: new Date(),
        decisionNote: null,
        backdatingLimitDays: 7,
        requireTaker: false,
        issueAlertAmount: new Prisma.Decimal(500000),
        countVarianceAlertAmount: new Prisma.Decimal(100000),
        countVarianceAlertPercent: new Prisma.Decimal(5),
        cashMaterialAlertAmount: new Prisma.Decimal(100000),
        materialCostCategoryIds: [],
        controlsUpdatedAt: null,
        controlsUpdatedByUserId: null,
        ...data
      };
      store.settings.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.settings.find(r => r.tenantId === where.tenantId);
      if (!row) throw new Error('not found');
      for (const [key, value] of Object.entries(data)) {
        row[key] = typeof value === 'number' && key !== 'backdatingLimitDays' ? new Prisma.Decimal(value) : value;
      }
      return row;
    })
  },
  stockItem: {
    findMany: jest.fn(async ({ where }: Row) => store.items.filter(row => matchesWhere(row, where)))
  },
  costCategory: {
    findFirst: jest.fn(async ({ where }: Row) => store.categories.find(row => matchesWhere(row, where)) ?? null)
  },
  user: {
    findUnique: jest.fn(async ({ where }: Row) => store.users.find(u => u.id === where.id) ?? null)
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop: string) => (db as any)[prop] })
}));

import {
  ALERT_TEXTS,
  acknowledgeStockAlertTx,
  buildAlertMessage,
  buildAlertTitle,
  decodeAlertCursor,
  encodeAlertCursor,
  listOpenStockAlertsForWorkQueue,
  listStockAlerts,
  logStockAlertAcknowledged,
  stockAlertHref
} from '../../src/lib/finance/stock-alertes-lecture';
import { getStockControls, updateStockControlsTx } from '../../src/lib/finance/stock-reglages';
import { raiseStockAlertTx, alertKeys } from '../../src/lib/finance/stock-alertes';
import type { StockCallerContext } from '../../src/lib/finance/types-040-controle';
import { updateStockControlsSchema } from '../../src/lib/finance/schemas-stock-pilotage';

const TENANT = 'tenant-1';
const OTHER_TENANT = 'tenant-2';
const ADMIN = 'user-admin';

/** Les natures du schéma : la table des textes doit les couvrir toutes. */
const ALL_KINDS = Object.values(StockAlertKind) as string[];

const FORBIDDEN = /\b(vols?|voleurs?|fraudes?|frauduleux|frauduleuse|détournements?|détourné(e|s)?)\b/i;

function ctx(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: ADMIN,
    valuesVisible: true,
    canValidateCount: true,
    canReceive: true,
    canIssue: true,
    canTransfer: true,
    canCount: true,
    canDispose: true,
    canManageTakers: true,
    canViewAlerts: true,
    canManageSettings: true,
    ...overrides
  };
}

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

function seedAlert(overrides: Row = {}): Row {
  const alert = {
    id: uuid(),
    tenantId: TENANT,
    kind: 'LARGE_ISSUE',
    severity: 'WARNING',
    status: 'OPEN',
    dedupeKey: `K-${seq}`,
    amount: new Prisma.Decimal(600000),
    threshold: new Prisma.Decimal(500000),
    currency: 'XOF',
    siteId: null,
    locationId: 'loc-1',
    locationLabel: 'Magasin central',
    subjectType: 'StockSlip',
    subjectId: 'slip-1',
    details: null,
    raisedAt: new Date('2026-09-30T10:00:00.000Z'),
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    acknowledgeNote: null,
    ...overrides
  };
  store.alerts.push(alert);
  return alert;
}

beforeEach(() => {
  jest.clearAllMocks();
  seq = 0;
  store.alerts = [];
  store.slips = [{ id: 'slip-1', tenantId: TENANT, kind: 'ISSUE', year: 2026, number: 42 }];
  store.counts = [
    {
      id: 'count-1',
      tenantId: TENANT,
      countedAt: new Date('2026-09-30T00:00:00.000Z'),
      location: { label: 'Magasin central' }
    }
  ];
  store.movements = [];
  store.invoices = [];
  store.vouchers = [];
  store.settings = [];
  store.items = [];
  store.categories = [];
  store.users = [{ id: ADMIN, fullName: 'Awa Traoré', email: 'awa@example.ci' }];
  getUserPermissions.mockResolvedValue([]);
  recordAuditEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Textes (B7-R3)
// ---------------------------------------------------------------------------

describe('titres et messages (B7-R3)', () => {
  const parts = (valued: boolean, mode: 'SINGLE' | 'MONTHLY_CUMUL' | null = null) => ({
    subject: 'BS-2026-00042',
    place: 'Magasin central',
    amount: valued ? '600 000 FCFA' : null,
    threshold: valued ? '500 000 FCFA' : null,
    mode,
    details: {}
  });

  it('la table des textes couvre exactement les natures du schéma', () => {
    expect(ALL_KINDS.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(ALERT_TEXTS).sort()).toEqual([...ALL_KINDS].sort());
  });

  it('les titres du spec, neutres', () => {
    expect(buildAlertTitle('COUNT_VARIANCE')).toBe("Écart d'inventaire à justifier au-dessus du seuil");
    expect(buildAlertTitle('COUNT_LINE_SET_ASIDE')).toBe("Lignes d'inventaire écartées");
    expect(buildAlertTitle('COUNT_CANCELLED')).toBe('Inventaire abandonné');
    expect(buildAlertTitle('LARGE_ISSUE')).toBe('Sortie importante');
    expect(buildAlertTitle('LARGE_SCRAP')).toBe('Rebut important');
    expect(buildAlertTitle('RECEIPT_REPEATED')).toBe('Facture déjà réceptionnée');
    expect(buildAlertTitle('RECEIPT_OVER_INVOICE')).toBe('Valeur reçue supérieure à la facture');
    expect(buildAlertTitle('RECEIPT_UNVALUED')).toBe('Réception sans prix connu');
    expect(buildAlertTitle('CASH_MATERIAL_PURCHASE')).toBe('Achat de matériaux en espèces');
    expect(buildAlertTitle('COUNT_SELF_VALIDATED')).toBe('Inventaire validé par son compteur');
  });

  it.each(ALL_KINDS)('%s : aucun chiffre de montant sans valeurs, aucun mot interdit', kind => {
    for (const mode of ['SINGLE', 'MONTHLY_CUMUL', null] as const) {
      const masked = buildAlertMessage(kind as any, parts(false, mode));
      expect(masked).not.toMatch(/FCFA|600|500/);
      const valued = buildAlertMessage(kind as any, parts(true, mode));
      for (const text of [buildAlertTitle(kind as any), masked, valued]) {
        expect(text).not.toMatch(FORBIDDEN);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('un message valorisé cite montant et seuil', () => {
    expect(buildAlertMessage('LARGE_ISSUE', parts(true))).toBe(
      'Bon de sortie BS-2026-00042 (Magasin central) : 600 000 FCFA (seuil 500 000 FCFA).'
    );
    expect(buildAlertMessage('LARGE_SCRAP', parts(true, 'MONTHLY_CUMUL'))).toContain('Cumul du mois');
  });
});

// ---------------------------------------------------------------------------
// Liste (GET /stock/alerts)
// ---------------------------------------------------------------------------

describe('listStockAlerts', () => {
  it('rend une vue complète, libellé de bon, plus récentes d’abord, bornée à l’agence', async () => {
    seedAlert({ raisedAt: new Date('2026-09-01T10:00:00.000Z') });
    seedAlert({ raisedAt: new Date('2026-09-02T10:00:00.000Z') });
    seedAlert({ tenantId: OTHER_TENANT });

    const { data, meta } = await listStockAlerts(TENANT, ctx(), { limit: 50 });

    expect(data).toHaveLength(2);
    expect(data[0].raisedAt.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(data[0]).toMatchObject({
      kind: 'LARGE_ISSUE',
      title: 'Sortie importante',
      amount: 600000,
      threshold: 500000,
      subjectLabel: 'BS-2026-00042',
      location: { id: 'loc-1', label: 'Magasin central' },
      acknowledgedByLabel: null
    });
    expect(data[0].message).toContain('600');
    expect(meta).toEqual({ valuesVisible: true, blindLocationIds: [], nextCursor: null });
  });

  it('sans STOCK_VALUES_VIEW : montant et seuil nuls, message sans montant', async () => {
    seedAlert();
    const { data, meta } = await listStockAlerts(TENANT, ctx({ valuesVisible: false, canValidateCount: true }), {
      limit: 50
    });
    expect(data[0].amount).toBeNull();
    expect(data[0].threshold).toBeNull();
    expect(data[0].message).not.toMatch(/FCFA|600/);
    expect(meta.valuesVisible).toBe(false);
  });

  it('pagine par curseur sans doublon ni trou', async () => {
    for (let i = 0; i < 5; i += 1) {
      seedAlert({ raisedAt: new Date(Date.UTC(2026, 8, 1 + i)) });
    }
    const first = await listStockAlerts(TENANT, ctx(), { limit: 2 });
    expect(first.data).toHaveLength(2);
    expect(first.meta.nextCursor).toBeTruthy();
    const second = await listStockAlerts(TENANT, ctx(), { limit: 2, cursor: first.meta.nextCursor as string });
    const third = await listStockAlerts(TENANT, ctx(), { limit: 2, cursor: second.meta.nextCursor as string });
    const ids = [...first.data, ...second.data, ...third.data].map(a => a.id);
    expect(new Set(ids).size).toBe(5);
    expect(third.meta.nextCursor).toBeNull();
  });

  it('filtre par statut : une alerte traitée reste lisible sous ACKNOWLEDGED (B7-2)', async () => {
    seedAlert({ status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedByUserId: ADMIN });
    seedAlert();
    const acknowledged = await listStockAlerts(TENANT, ctx(), { limit: 50, status: 'ACKNOWLEDGED' });
    expect(acknowledged.data).toHaveLength(1);
    expect(acknowledged.data[0].acknowledgedByLabel).toBe('Awa Traoré');
    const open = await listStockAlerts(TENANT, ctx(), { limit: 50, status: 'OPEN' });
    expect(open.data).toHaveLength(1);
  });

  it('curseur illisible : 400', () => {
    expect(() => decodeAlertCursor('pas-un-curseur')).toThrow(/curseur/);
    const cursor = encodeAlertCursor(new Date('2026-09-01T00:00:00.000Z'), 'abc');
    expect(decodeAlertCursor(cursor)).toEqual({ raisedAt: new Date('2026-09-01T00:00:00.000Z'), id: 'abc' });
  });

  it('libellé d’un inventaire : lieu et date ; d’une pièce de caisse : son numéro', async () => {
    seedAlert({ kind: 'COUNT_VARIANCE', subjectType: 'StockCount', subjectId: 'count-1' });
    store.vouchers.push({ id: 'cv-1', tenantId: TENANT, voucherYear: 2026, voucherNumber: 7 });
    seedAlert({
      kind: 'CASH_MATERIAL_PURCHASE',
      subjectType: 'CashVoucher',
      subjectId: 'cv-1',
      locationId: null,
      siteId: 'site-1',
      siteName: 'Chantier Kaporo',
      details: { mode: 'MONTHLY_CUMUL' }
    });
    const { data } = await listStockAlerts(TENANT, ctx(), { limit: 50 });
    const count = data.find(a => a.kind === 'COUNT_VARIANCE');
    const cash = data.find(a => a.kind === 'CASH_MATERIAL_PURCHASE');
    expect(count?.subjectLabel).toBe('Magasin central — 30/09/2026');
    expect(cash?.subjectLabel).toBe('2026-0007');
    expect(cash?.mode).toBe('MONTHLY_CUMUL');
    expect(cash?.message).toContain('Chantier Kaporo');
  });
});

// ---------------------------------------------------------------------------
// Traitement (B7-R4)
// ---------------------------------------------------------------------------

describe('acknowledgeStockAlertTx', () => {
  it('marque l’alerte traitée avec sa note, puis la trace non critique', async () => {
    const alert = seedAlert();
    const view = await acknowledgeStockAlertTx(
      db as any,
      TENANT,
      alert.id,
      ctx(),
      '  Vérifié avec le chef de chantier '
    );
    expect(view.status).toBe('ACKNOWLEDGED');
    expect(view.acknowledgeNote).toBe('Vérifié avec le chef de chantier');
    expect(view.acknowledgedByLabel).toBe('Awa Traoré');
    expect(store.alerts[0].status).toBe('ACKNOWLEDGED');

    logStockAlertAcknowledged(TENANT, ADMIN, view);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'STOCK_ALERT_ACKNOWLEDGED', entityType: 'StockAlert', entityId: alert.id })
    );
  });

  it('une alerte d’une autre agence : 404, comme une alerte inexistante', async () => {
    const alert = seedAlert({ tenantId: OTHER_TENANT });
    await expect(acknowledgeStockAlertTx(db as any, TENANT, alert.id, ctx(), null)).rejects.toMatchObject({
      statusCode: 404
    });
    expect(store.alerts[0].status).toBe('OPEN');
  });

  it('déjà traitée : 409 STOCK_ALERT_ALREADY_ACKNOWLEDGED', async () => {
    const alert = seedAlert({ status: 'ACKNOWLEDGED' });
    await expect(acknowledgeStockAlertTx(db as any, TENANT, alert.id, ctx(), null)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_ALERT_ALREADY_ACKNOWLEDGED'
    });
  });
});

// ---------------------------------------------------------------------------
// File « À traiter » (B7-R5)
// ---------------------------------------------------------------------------

describe('listOpenStockAlertsForWorkQueue', () => {
  it('« À regarder » d’abord, alertes traitées exclues, lien vers Contrôle', async () => {
    seedAlert({ severity: 'INFO', kind: 'RECEIPT_UNVALUED', raisedAt: new Date('2026-09-01T00:00:00.000Z') });
    const warning = seedAlert({ raisedAt: new Date('2026-09-05T00:00:00.000Z') });
    seedAlert({ status: 'ACKNOWLEDGED' });

    const items = await listOpenStockAlertsForWorkQueue(TENANT, 4);

    expect(items.map(item => item.severity)).toEqual(['warning', 'info']);
    expect(items[0]).toMatchObject({
      alertId: warning.id,
      title: 'Sortie importante',
      place: 'Magasin central',
      amount: 600000
    });
    expect(stockAlertHref(TENANT, warning.id)).toBe(`/tenant/${TENANT}/finance/stock/controle?alerte=${warning.id}`);
  });
});

// ---------------------------------------------------------------------------
// Naissance : jamais un create simple (B7-R2, B7-5)
// ---------------------------------------------------------------------------

describe('naissance d’une alerte de cumul déjà levée (B7-5)', () => {
  it('passe par createMany skipDuplicates : aucun P2002 possible', async () => {
    const tx: Row = { stockAlert: { createMany: jest.fn(async () => ({ count: 0 })) } };
    const input = {
      tenantId: TENANT,
      kind: 'CASH_MATERIAL_PURCHASE' as const,
      severity: 'WARNING' as const,
      dedupeKey: alertKeys.cashMaterialCumul('site-1', '2026-10'),
      subjectType: 'CashVoucher' as const,
      subjectId: 'cv-1'
    };
    await raiseStockAlertTx(tx as any, input);
    await expect(raiseStockAlertTx(tx as any, input)).resolves.toBeUndefined();
    expect(tx.stockAlert.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });
});

// ---------------------------------------------------------------------------
// Réglages de contrôle
// ---------------------------------------------------------------------------

describe('réglages de contrôle', () => {
  it('lecture sans ligne : défauts, aucune ligne créée, postes déduits des articles actifs (A9-R1)', async () => {
    store.items.push(
      { id: 'i1', tenantId: TENANT, isActive: true, defaultCostCategoryId: 'cat-ciment' },
      { id: 'i2', tenantId: TENANT, isActive: false, defaultCostCategoryId: 'cat-fer' },
      { id: 'i3', tenantId: OTHER_TENANT, isActive: true, defaultCostCategoryId: 'cat-autre' }
    );
    const settings = await getStockControls(TENANT);
    expect(settings).toMatchObject({
      backdatingLimitDays: 7,
      requireTaker: false,
      issueAlertAmount: 500000,
      countVarianceAlertAmount: 100000,
      countVarianceAlertPercent: 5,
      cashMaterialAlertAmount: 100000,
      materialCostCategoryIds: [],
      effectiveMaterialCostCategoryIds: ['cat-ciment'],
      updatedAt: null,
      updatedByLabel: null
    });
    expect(db.stockSettings.create).not.toHaveBeenCalled();
  });

  it('modification : champs présents seulement, null désactive, audit critique avec changes', async () => {
    store.categories.push({ id: 'cat-ciment', tenantId: TENANT });
    const result = await updateStockControlsTx(db as any, TENANT, ADMIN, {
      issueAlertAmount: null,
      backdatingLimitDays: 30,
      materialCostCategoryIds: ['cat-ciment']
    });
    expect(result).toMatchObject({
      issueAlertAmount: null,
      backdatingLimitDays: 30,
      countVarianceAlertAmount: 100000,
      materialCostCategoryIds: ['cat-ciment'],
      effectiveMaterialCostCategoryIds: ['cat-ciment'],
      updatedByLabel: 'Awa Traoré'
    });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    const entry = (recordAuditEvent.mock.calls[0] as any[])[1];
    expect(entry).toMatchObject({ actionKey: 'STOCK_CONTROLS_UPDATED', entityType: 'StockSettings' });
    expect(entry.changes).toEqual({
      backdatingLimitDays: { before: 7, after: 30 },
      issueAlertAmount: { before: 500000, after: null },
      materialCostCategoryIds: { before: [], after: ['cat-ciment'] }
    });
  });

  it('un poste d’une autre agence : 404, rien n’est écrit', async () => {
    store.categories.push({ id: 'cat-b', tenantId: OTHER_TENANT });
    await expect(
      updateStockControlsTx(db as any, TENANT, ADMIN, { materialCostCategoryIds: ['cat-b'] })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.stockSettings.update).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('rien ne change réellement : aucune trace', async () => {
    await updateStockControlsTx(db as any, TENANT, ADMIN, { requireTaker: false });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('réglages de contrôle — validation des seuils (B7-R3)', () => {
  it('un seuil à 0 ou négatif est refusé ; null désactive ; un seuil positif passe', () => {
    for (const key of [
      'issueAlertAmount',
      'countVarianceAlertAmount',
      'cashMaterialAlertAmount',
      'countVarianceAlertPercent'
    ]) {
      for (const value of [0, -1]) {
        const result = updateStockControlsSchema.safeParse({ [key]: value });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]).toMatchObject({
            path: [key],
            message: "Un seuil d'alerte doit être supérieur à zéro. Laissez-le vide pour désactiver l'alerte."
          });
        }
      }
      expect(updateStockControlsSchema.safeParse({ [key]: null }).success).toBe(true);
      expect(updateStockControlsSchema.safeParse({ [key]: 0.5 }).success).toBe(true);
    }
    expect(updateStockControlsSchema.safeParse({ countVarianceAlertPercent: 101 }).success).toBe(false);
  });
});
