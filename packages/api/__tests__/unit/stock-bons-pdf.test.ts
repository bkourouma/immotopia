/**
 * Bons du stock : lecture et PDF — lot 040, territoire API-4 (spec B1 critère
 * 4, B4 critères 1, 3 et 4, B4-R2, B4-R3, B4-R3 bis).
 *
 * Sans base : client Prisma doublé. Le contenu imprimé se vérifie sur le
 * MODÈLE de document (tout le texte qui part au PDF) ; le rendu `pdf-lib` se
 * vérifie à part (PDF relisible, pagination, texte arabe sans erreur).
 */

import { PDFDocument } from 'pdf-lib';

jest.mock('../../src/services/permission-service', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

const BRANDING = {
  issuer: {
    kind: 'AGENCY' as const,
    name: 'Agence Test',
    legalName: null,
    address: 'Abidjan, Cocody',
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  issuerLogo: null,
  signature: null,
  stamp: null,
  syndicate: null
};

jest.mock('../../src/lib/documents/document-branding', () => ({
  ...jest.requireActual('../../src/lib/documents/document-branding'),
  resolveDocumentBranding: jest.fn(async () => BRANDING)
}));

const db = {
  stockSlip: { findFirst: jest.fn() },
  stockMovement: { findMany: jest.fn() },
  stockCount: { findFirst: jest.fn(), findMany: jest.fn() },
  stockCountLine: { findMany: jest.fn() },
  stockAttachment: { findMany: jest.fn() },
  user: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: db }));

import {
  buildCountReportPdfModel,
  buildSlipPdfModel,
  buildStockCountReportPdf,
  buildStockSlipPdf,
  formatPdfMoney,
  formatPdfQuantity,
  getStockSlipView,
  PRE_NUMBERING_COUNT_REPORT_TITLE,
  readSlipSnapshot,
  renderStockPdf,
  type CountReportPdfInput,
  type StockPdfModel
} from '../../src/lib/finance/stock-bons-pdf';
import type { MovementView, StockCallerContext, StockSlipSnapshot } from '../../src/lib/finance/types-040-controle';

const TENANT = 'tenant-1';
const SLIP_ID = '22222222-2222-4222-8222-222222222222';
const COUNT_ID = '66666666-6666-4666-8666-666666666666';
const LOCATION_ID = '77777777-7777-4777-8777-777777777777';
const PRINTED_AT = new Date('2026-10-04T15:30:00Z');

function ctx(overrides: Partial<StockCallerContext> = {}): StockCallerContext {
  return {
    userId: 'user-1',
    valuesVisible: false,
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

const MAGASINIER = ctx();
const COMPTABLE = ctx({ valuesVisible: true });

const SNAPSHOT: StockSlipSnapshot = {
  location: 'Magasin central',
  site: 'Résidence Les Palmiers',
  taker: 'Koné Ibrahim - Équipe maçonnerie',
  requestedBy: 'Koné Ibrahim - Équipe maçonnerie',
  invoice: null,
  author: 'Awa Traoré',
  lines: [{ movementId: 'm-1', itemId: 'item-1', reference: 'CIM-35', label: 'Ciment CPJ 35', unit: 'sac' }]
};

function movement(overrides: Partial<MovementView> = {}): MovementView {
  return {
    id: 'm-1',
    type: 'ISSUE',
    itemId: 'item-1',
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45 (renommé)',
    itemUnit: 'sac',
    locationId: LOCATION_ID,
    locationLabel: 'Magasin central',
    movementDate: new Date('2026-10-03T00:00:00Z'),
    quantity: 12,
    isDecrease: true,
    unitCost: 5250,
    totalValue: 63000,
    currency: 'XOF',
    quantityAfter: 377,
    valueAfter: 1979250,
    siteId: 'site-1',
    siteLabel: 'Résidence Les Palmiers',
    costCategoryLabel: 'Matériaux',
    requestedBy: 'Koné Ibrahim - Équipe maçonnerie',
    supplierInvoiceReference: null,
    transferGroupId: null,
    createdByLabel: 'Awa Traoré',
    createdAt: new Date('2026-10-03T08:12:00Z'),
    takerId: 'taker-1',
    takerLabel: 'Koné Ibrahim - Équipe maçonnerie',
    supplierInvoiceId: null,
    stockCountId: null,
    slipId: SLIP_ID,
    slipNumber: 'BS-2026-00002',
    reasonCode: null,
    reason: null,
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'user-1',
    entryLagDays: 0,
    attachmentsCount: 0,
    ...overrides
  };
}

/** Tout le texte d'un modèle, pour y chercher montants et mots interdits. */
function allText(model: StockPdfModel): string {
  return [
    model.title,
    model.number ?? '',
    ...model.info.flatMap(entry => [entry.label, entry.value]),
    ...model.notices,
    ...model.sections.flatMap(section => [
      section.title,
      section.emptyText,
      ...section.columns.map(column => column.header),
      ...section.rows.flatMap(row => [...row.cells, row.note ?? ''])
    ]),
    ...model.totals.flatMap(total => [total.label, total.value]),
    ...model.signatures,
    model.reprintMention
  ].join('\n');
}

const FORBIDDEN_WORDS = /\b(vol|voleur|fraude|frauduleux|détournement|détourné)\b/i;

function issueModel(caller: StockCallerContext, movements = [movement()]) {
  return buildSlipPdfModel({
    slip: {
      kind: 'ISSUE',
      number: 'BS-2026-00002',
      documentDate: new Date('2026-10-03T00:00:00Z'),
      createdAt: new Date('2026-10-03T08:12:00Z'),
      snapshot: SNAPSHOT
    },
    movements,
    attachments: [],
    ctx: caller,
    printedAt: PRINTED_AT
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.stockCount.findMany.mockResolvedValue([]);
  db.stockAttachment.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

describe('Formats', () => {
  it('quantités et montants à la française', () => {
    expect(formatPdfQuantity(1250.5)).toBe('1 250,5');
    expect(formatPdfQuantity(-3)).toBe('-3');
    expect(formatPdfMoney(1250000)).toBe('1 250 000 XOF');
  });

  it('un snapshot incomplet se lit sans erreur', () => {
    expect(readSlipSnapshot(null)).toMatchObject({ location: '', lines: [], invoice: null });
    expect(readSlipSnapshot({ lines: [null, { itemId: 'i', reference: 'R', label: 'L', unit: 'u' }] }).lines).toEqual([
      { itemId: 'i', reference: 'R', label: 'L', unit: 'u' }
    ]);
  });
});

describe('Bon de sortie (B4-R2, B1 critère 4)', () => {
  it('B1-4 : le bon d’un magasinier ne porte aucun montant ni aucune quantité après mouvement', () => {
    const model = issueModel(MAGASINIER);
    const text = allText(model);
    expect(model.sections[0].columns.map(column => column.header)).toEqual([
      'Référence',
      'Désignation',
      'Unité',
      'Quantité'
    ]);
    expect(model.totals).toEqual([]);
    expect(text).not.toMatch(/XOF|5 250|63 000|Prix|Valeur/);
    expect(text).not.toContain('377'); // quantité après mouvement
    expect(model.signatures).toEqual(['Remis par (magasinier)', 'Reçu par (preneur)']);
    expect(model.info).toEqual(
      expect.arrayContaining([
        { label: 'Preneur', value: 'Koné Ibrahim - Équipe maçonnerie' },
        { label: 'Chantier', value: 'Résidence Les Palmiers' },
        { label: 'Établi par', value: 'Awa Traoré' },
        { label: 'Enregistré le', value: '03/10/2026 à 08:12' }
      ])
    );
    expect(model.number).toBe('BS-2026-00002');
    expect(model.fileName).toBe('BS-2026-00002.pdf');
    expect(model.reprintMention).toBe('Exemplaire réimprimé le 04/10/2026 à 15:30');
    expect(text).not.toMatch(FORBIDDEN_WORDS);
  });

  it('avec STOCK_VALUES_VIEW : prix, valeur et total ; toujours sans quantité après mouvement', () => {
    const model = issueModel(COMPTABLE);
    expect(model.sections[0].rows[0].cells).toEqual([
      'CIM-35',
      'Ciment CPJ 35',
      'sac',
      '12',
      '5 250 XOF',
      '63 000 XOF'
    ]);
    expect(model.totals).toEqual([{ label: 'Valeur totale', value: '63 000 XOF' }]);
    expect(allText(model)).not.toContain('377');
  });

  it('lieu en comptage : le prix d’un mouvement masqué sort en tiret', () => {
    const model = issueModel(COMPTABLE, [movement({ unitCost: null, quantityAfter: null, valueAfter: null })]);
    expect(model.sections[0].rows[0].cells[4]).toBe('-');
  });

  it('B4-4 : un article renommé après l’émission garde son ancien libellé sur le bon', () => {
    const model = issueModel(MAGASINIER);
    expect(model.sections[0].rows[0].cells.slice(0, 2)).toEqual(['CIM-35', 'Ciment CPJ 35']);
    expect(allText(model)).not.toContain('renommé');
  });

  it('bon de réception : facture et fournisseur figés, zones « Livré par » / « Reçu par (magasinier) »', () => {
    const model = buildSlipPdfModel({
      slip: {
        kind: 'RECEIPT',
        number: 'BR-2026-00042',
        documentDate: new Date('2026-10-01T00:00:00Z'),
        createdAt: new Date('2026-10-01T09:00:00Z'),
        snapshot: {
          ...SNAPSHOT,
          taker: null,
          requestedBy: null,
          invoice: { reference: 'F-118', supplierName: 'Sococim' }
        }
      },
      movements: [movement({ type: 'RECEIPT', isDecrease: false })],
      attachments: [
        {
          id: 'a-1',
          targetType: 'SLIP',
          targetId: SLIP_ID,
          purpose: 'SIGNED_SLIP',
          caption: null,
          fileName: 'bon.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          sha256: 'b'.repeat(64),
          uploadedByLabel: 'Awa Traoré',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          removed: null,
          canRemove: false,
          removableUntil: null
        }
      ],
      ctx: MAGASINIER,
      printedAt: PRINTED_AT
    });
    expect(model.title).toBe('Bon de réception');
    expect(model.info).toEqual(expect.arrayContaining([{ label: 'Facture', value: 'F-118 - Sococim' }]));
    expect(model.signatures).toEqual(['Livré par', 'Reçu par (magasinier)']);
    expect(model.notices[0]).toContain('b'.repeat(64));
  });
});

function countInput(overrides: Partial<CountReportPdfInput> = {}): CountReportPdfInput {
  return {
    number: 'PVI-2026-00007',
    kind: 'REGULAR',
    countedAt: new Date('2026-09-30T00:00:00Z'),
    validatedAt: new Date('2026-10-01T11:00:00Z'),
    location: 'Magasin central',
    site: null,
    counters: ['Awa Traoré', 'Yao Kouassi'],
    validator: 'Directeur technique',
    selfValidated: false,
    selfValidationReason: null,
    lines: [
      {
        itemId: 'i1',
        reference: 'CIM-35',
        label: 'Ciment CPJ 35',
        unit: 'sac',
        expectedQuantity: 40,
        countedQuantity: 38,
        countedBlind: true,
        setAside: false,
        setAsideReason: null,
        movementsSinceCapture: 2,
        unitCostAtValidation: 5250,
        reasonLabel: 'Motif : Casse.'
      },
      {
        itemId: 'i2',
        reference: 'FER-10',
        label: 'Fer de 10',
        unit: 'barre',
        expectedQuantity: 100,
        countedQuantity: 90,
        countedBlind: false,
        setAside: true,
        setAsideReason: 'Recompter demain',
        movementsSinceCapture: null,
        unitCostAtValidation: 4000,
        reasonLabel: null
      },
      {
        itemId: 'i3',
        reference: 'SAB-01',
        label: 'Sable',
        unit: 'm3',
        expectedQuantity: 6,
        countedQuantity: null,
        countedBlind: null,
        setAside: true,
        setAsideReason: 'Tas inaccessible',
        movementsSinceCapture: 0,
        unitCostAtValidation: null,
        reasonLabel: null
      }
    ],
    values: { countedValue: 559500, varianceValueGross: 10500, varianceValueNet: -10500, setAsideVarianceValue: 40000 },
    attachments: [],
    ctx: MAGASINIER,
    printedAt: PRINTED_AT,
    ...overrides
  };
}

describe('Procès-verbal d’inventaire (B4-R2)', () => {
  it('compteurs, validateur, rubriques écartées et non comptés, mentions et mouvements postérieurs', () => {
    const model = buildCountReportPdfModel(countInput());
    expect(model.title).toBe("Procès-verbal d'inventaire");
    expect(model.number).toBe('PVI-2026-00007');
    expect(model.info).toEqual(
      expect.arrayContaining([
        { label: 'Compté par', value: 'Awa Traoré, Yao Kouassi' },
        { label: 'Validé par', value: 'Directeur technique' }
      ])
    );
    expect(model.signatures).toEqual(['Compté par', 'Validé par']);
    const [adjusted, setAside, uncounted] = model.sections;
    expect(adjusted.rows.map(row => row.cells)).toEqual([['CIM-35', 'Ciment CPJ 35', 'sac', '40', '38', '-2', '2']]);
    expect(adjusted.rows[0].note).toBe('Motif : Casse.');
    expect(setAside.title).toContain('écartées');
    expect(setAside.rows[0].cells[setAside.rows[0].cells.length - 1]).toBe('non mesuré');
    expect(setAside.rows[0].note).toContain('Comptée par une personne qui voyait le stock.');
    expect(setAside.rows[0].note).toContain('Recompter demain');
    expect(uncounted.title).toContain('Non comptés');
    expect(uncounted.rows[0].cells.slice(3, 6)).toEqual(['6', '-', '-']);
    // Sans STOCK_VALUES_VIEW : aucun montant.
    expect(model.totals).toEqual([]);
    expect(allText(model)).not.toMatch(/XOF|5 250|559 500/);
    expect(allText(model)).not.toMatch(FORBIDDEN_WORDS);
  });

  it('avec STOCK_VALUES_VIEW : coût unitaire, écart valorisé et totaux figés', () => {
    const model = buildCountReportPdfModel(countInput({ ctx: COMPTABLE }));
    expect(model.sections[0].rows[0].cells).toEqual([
      'CIM-35',
      'Ciment CPJ 35',
      'sac',
      '40',
      '38',
      '-2',
      '5 250 XOF',
      '-10 500 XOF',
      '2'
    ]);
    expect(model.totals.map(total => total.value)).toEqual(['559 500 XOF', '10 500 XOF', '-10 500 XOF', '40 000 XOF']);
  });

  it('mention de dérogation quand le validateur a aussi compté (A1-R3)', () => {
    const model = buildCountReportPdfModel(
      countInput({ selfValidated: true, selfValidationReason: 'Seul sur le chantier ce jour-là' })
    );
    expect(model.notices[0]).toBe(
      'Validé par une personne qui a aussi compté (dérogation) - motif : Seul sur le chantier ce jour-là.'
    );
  });

  it('B4-R3 bis : un inventaire d’avant la numérotation sort sans numéro, avec son titre propre', () => {
    const model = buildCountReportPdfModel(countInput({ number: null }));
    expect(model.number).toBeNull();
    expect(model.title).toBe(PRE_NUMBERING_COUNT_REPORT_TITLE);
    expect(model.fileName).toBe('PV-inventaire-2026-09-30.pdf');
  });
});

describe('Rendu pdf-lib', () => {
  it('produit un PDF relisible, paginé, et ne lève pas sur un libellé en arabe', async () => {
    const lines = Array.from({ length: 140 }, (_, index) => ({
      ...countInput().lines[0],
      itemId: `i${index}`,
      reference: `REF-${index}`,
      label: index === 3 ? 'إسمنت بورتلاندي' : `Article numéro ${index}`
    }));
    const model = buildCountReportPdfModel(countInput({ lines, ctx: COMPTABLE }));
    const buffer = await renderStockPdf(model, BRANDING);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const loaded = await PDFDocument.load(buffer);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
    expect(loaded.getTitle()).toBe("Procès-verbal d'inventaire PVI-2026-00007");
  });
});

// ---------------------------------------------------------------------------
// Lectures en base
// ---------------------------------------------------------------------------

function slipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SLIP_ID,
    kind: 'ISSUE',
    year: 2026,
    number: 2,
    documentDate: new Date('2026-10-03T00:00:00Z'),
    createdAt: new Date('2026-10-03T08:12:00Z'),
    locationId: LOCATION_ID,
    siteId: 'site-1',
    takerId: 'taker-1',
    requestedBy: 'Koné Ibrahim - Équipe maçonnerie',
    supplierInvoiceId: null,
    stockCountId: null,
    snapshot: SNAPSHOT,
    createdBy: { fullName: 'Awa Traoré', email: null },
    location: { label: 'Magasin central (renommé)' },
    site: { name: 'Palmiers (renommé)' },
    taker: { fullName: 'Ibrahim Koné', teamOrCompany: 'Autre équipe' },
    supplierInvoice: null,
    ...overrides
  };
}

function movementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    type: 'ISSUE',
    itemId: 'item-1',
    locationId: LOCATION_ID,
    movementDate: new Date('2026-10-03T00:00:00Z'),
    quantity: 12,
    isDecrease: true,
    unitCost: 5250,
    totalValue: 63000,
    currency: 'XOF',
    quantityAfter: 377,
    valueAfter: 1979250,
    siteId: 'site-1',
    requestedBy: 'Koné Ibrahim - Équipe maçonnerie',
    supplierInvoiceId: null,
    transferGroupId: null,
    stockCountId: null,
    slipId: SLIP_ID,
    reasonCode: null,
    reason: null,
    takerId: 'taker-1',
    valuationSource: null,
    supplierCreditValue: null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-10-03T08:12:00Z'),
    item: { reference: 'CIM-45', label: 'Ciment CPJ 45 (renommé)', unit: 'sac' },
    location: { label: 'Magasin central' },
    site: { name: 'Résidence Les Palmiers' },
    costCategory: { label: 'Matériaux' },
    supplierInvoice: null,
    createdBy: { fullName: 'Awa Traoré', email: null },
    taker: { fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' },
    slip: { kind: 'ISSUE', year: 2026, number: 2 },
    _count: { attachments: 1 },
    ...overrides
  };
}

describe('GET /stock/slips/{slipId} — lecture masquée', () => {
  it('libellés du bon figés, valeurs masquées pour un magasinier, aveugle sur un lieu en comptage', async () => {
    db.stockSlip.findFirst.mockResolvedValue(slipRow());
    db.stockMovement.findMany.mockResolvedValue([movementRow()]);
    db.stockCount.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);

    const { data, meta } = await getStockSlipView(TENANT, MAGASINIER, SLIP_ID);

    expect(db.stockSlip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SLIP_ID, tenantId: TENANT } })
    );
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, slipId: SLIP_ID } })
    );
    expect(data).toMatchObject({
      number: 'BS-2026-00002',
      location: { id: LOCATION_ID, label: 'Magasin central' },
      site: { id: 'site-1', name: 'Résidence Les Palmiers' },
      taker: { id: 'taker-1', label: 'Koné Ibrahim - Équipe maçonnerie' },
      createdByLabel: 'Awa Traoré',
      totalValue: null,
      currency: 'XOF'
    });
    expect(data.movements[0]).toMatchObject({
      unitCost: null,
      totalValue: null,
      quantityAfter: null,
      valueAfter: null,
      quantity: 12,
      slipNumber: 'BS-2026-00002',
      attachmentsCount: 1,
      takerLabel: 'Koné Ibrahim - Équipe maçonnerie'
    });
    expect(meta).toEqual({ valuesVisible: false, blindLocationIds: [LOCATION_ID] });
  });

  it('un comptable hors comptage voit les valeurs et le total', async () => {
    db.stockSlip.findFirst.mockResolvedValue(slipRow());
    db.stockMovement.findMany.mockResolvedValue([movementRow()]);
    const { data, meta } = await getStockSlipView(TENANT, COMPTABLE, SLIP_ID);
    expect(data.totalValue).toBe(63000);
    expect(data.movements[0]).toMatchObject({ unitCost: 5250, quantityAfter: 377 });
    expect(meta.valuesVisible).toBe(true);
  });

  it('le bon d’une autre agence → 404', async () => {
    db.stockSlip.findFirst.mockResolvedValue(null);
    await expect(getStockSlipView(TENANT, MAGASINIER, SLIP_ID)).rejects.toMatchObject({ statusCode: 404 });
    await expect(buildStockSlipPdf(TENANT, MAGASINIER, SLIP_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('le PDF d’un bon de sortie est un PDF nommé d’après son numéro', async () => {
    db.stockSlip.findFirst.mockResolvedValue(slipRow());
    db.stockMovement.findMany.mockResolvedValue([movementRow()]);
    const file = await buildStockSlipPdf(TENANT, MAGASINIER, SLIP_ID, PRINTED_AT);
    expect(file.fileName).toBe('BS-2026-00002.pdf');
    expect((await PDFDocument.load(file.buffer)).getTitle()).toBe('Bon de sortie BS-2026-00002');
  });
});

function countRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COUNT_ID,
    kind: 'REGULAR',
    status: 'VALIDATED',
    countedAt: new Date('2026-09-30T00:00:00Z'),
    validatedAt: new Date('2026-10-01T11:00:00Z'),
    counterUserIds: [],
    selfValidated: false,
    selfValidationReason: null,
    countedValue: null,
    varianceValueGross: null,
    varianceValueNet: null,
    setAsideVarianceValue: null,
    createdBy: { fullName: 'Créateur', email: null },
    validatedBy: { fullName: 'Validateur', email: null },
    location: { label: 'Magasin central', site: null },
    slip: null,
    ...overrides
  };
}

const COUNT_LINE_ROW = {
  itemId: 'item-1',
  expectedQuantity: 40,
  countedQuantity: 38,
  countedBlind: null,
  reasonCode: null,
  reason: 'casse',
  setAsideAt: null,
  setAsideReason: null,
  unitCostAtValidation: null,
  movementsSinceCapture: null,
  item: { reference: 'CIM-35', label: 'Ciment CPJ 35', unit: 'sac' }
};

describe('GET /stock/counts/{countId}/report.pdf (B4 critère 3)', () => {
  it.each(['DRAFT', 'COUNTED', 'CANCELLED'])('inventaire %s → 409 STOCK_COUNT_WRONG_STATUS', async status => {
    db.stockCount.findFirst.mockResolvedValue(countRow({ status }));
    await expect(buildStockCountReportPdf(TENANT, MAGASINIER, COUNT_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_COUNT_WRONG_STATUS'
    });
  });

  it('inventaire validé avant le lot → 200, PDF sans numéro (créateur pour compteur)', async () => {
    db.stockCount.findFirst.mockResolvedValue(countRow());
    db.stockCountLine.findMany.mockResolvedValue([COUNT_LINE_ROW]);
    const file = await buildStockCountReportPdf(TENANT, MAGASINIER, COUNT_ID, PRINTED_AT);
    expect(file.fileName).toBe('PV-inventaire-2026-09-30.pdf');
    expect((await PDFDocument.load(file.buffer)).getTitle()).toBe(PRE_NUMBERING_COUNT_REPORT_TITLE);
    expect(db.stockCount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COUNT_ID, tenantId: TENANT } })
    );
    expect(db.stockCountLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { countId: COUNT_ID, count: { tenantId: TENANT } } })
    );
  });

  it('PVI numéroté : numéro du bon, libellés figés, et le PDF du bon y renvoie', async () => {
    const snapshot = {
      ...SNAPSHOT,
      lines: [{ itemId: 'item-1', reference: 'CIM-35', label: 'Ciment figé', unit: 'sac' }],
      counters: ['Awa Traoré'],
      validator: 'Directeur'
    };
    db.stockCount.findFirst.mockResolvedValue(
      countRow({ slip: { id: SLIP_ID, kind: 'COUNT_REPORT', year: 2026, number: 7, snapshot } })
    );
    db.stockCountLine.findMany.mockResolvedValue([COUNT_LINE_ROW]);
    const file = await buildStockCountReportPdf(TENANT, MAGASINIER, COUNT_ID, PRINTED_AT);
    expect(file.fileName).toBe('PVI-2026-00007.pdf');
    expect(db.user.findMany).not.toHaveBeenCalled();

    db.stockSlip.findFirst.mockResolvedValue(slipRow({ kind: 'COUNT_REPORT', stockCountId: COUNT_ID, number: 7 }));
    const viaSlip = await buildStockSlipPdf(TENANT, MAGASINIER, SLIP_ID, PRINTED_AT);
    expect(viaSlip.fileName).toBe('PVI-2026-00007.pdf');
  });

  it('l’inventaire d’une autre agence → 404', async () => {
    db.stockCount.findFirst.mockResolvedValue(null);
    await expect(buildStockCountReportPdf(TENANT, MAGASINIER, COUNT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
