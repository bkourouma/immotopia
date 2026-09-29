/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `ensureReceiptPdf` — journalisation d'une génération de PDF lente
 * (lot « anomalies-recette », besoin 4).
 *
 * Un logo, une signature ou un cachet proche de la taille maximale (3000 x
 * 3000 px) rend `pdf-lib` coûteux à générer (mesuré à plusieurs secondes,
 * décodage/réencodage en pur JS). Plutôt que d'attendre une vraie image
 * lourde (lent et non déterministe), le test contrôle `Date.now()` pour
 * simuler une génération de 4 s puis une de 1 s.
 */

const mockUploadsDir = require('path').join(
  require('os').tmpdir(),
  `immotopia-slow-render-${process.pid}-${Date.now()}`
);
jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  return { ...actual, env: { ...actual.env, UPLOADS_DIR: mockUploadsDir }, isTest: true };
});

const mockUpdateMany = jest.fn(async (..._args: any[]) => ({ count: 1 }));
jest.mock('../../src/utils/database', () => ({
  prisma: { syndicChargeReceipt: { updateMany: (...args: any[]) => mockUpdateMany(...args) } }
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }));

const mockRender = jest.fn(async (..._args: any[]) => Buffer.from('%PDF-fake'));
jest.mock('../../src/lib/syndics/charge-receipt-pdf', () => {
  const actual = jest.requireActual('../../src/lib/syndics/charge-receipt-pdf');
  return { ...actual, renderChargeReceiptPdf: (...args: any[]) => mockRender(...args) };
});

import * as fs from 'fs';
import {
  ensureReceiptPdf,
  type SyndicateRenderContext,
  type StoredReceipt
} from '../../src/lib/syndics/charge-receipt-delivery';
import type { ChargeReceiptSnapshot } from '../../src/lib/syndics/charge-receipt-snapshot';

const context: SyndicateRenderContext = {
  issuerKey: 'AGENCY',
  branding: {
    issuer: {
      kind: 'AGENCY',
      name: 'Cabinet Syndic',
      legalName: null,
      address: null,
      phone: null,
      email: null,
      rccm: null,
      taxId: null
    },
    issuerLogo: null,
    signature: null,
    stamp: null,
    syndicate: null,
    source: { issuerKey: 'AGENCY', logoKey: null, signatureKey: null, stampKey: null }
  }
};

const snapshot: ChargeReceiptSnapshot = {
  version: 1,
  kind: 'RECEIPT',
  number: 'REC-2026-000123',
  issuedAt: '2026-09-28T10:00:00.000Z',
  currency: 'FCFA',
  amount: 50_000,
  issuer: {
    key: 'AGENCY',
    kind: 'AGENCY',
    name: 'Cabinet Syndic',
    legalName: null,
    address: null,
    phone: null,
    email: null,
    rccm: null,
    taxId: null
  },
  syndicate: { name: 'Résidence Test', address: null, registrationNo: null, cadastralReference: null },
  lot: { number: 'A-1', type: 'APARTMENT', label: null },
  coowner: { name: 'Copropriétaire Test', address: null },
  call: null,
  settlements: [],
  settledAt: null,
  payment: { id: 'pay-1', amount: 50_000, paidAt: '2026-09-28T10:00:00.000Z', method: null, reference: null },
  allocations: [],
  outstandingAfter: 0,
  advance: 0,
  backfilled: false
} as unknown as ChargeReceiptSnapshot;

function receiptOf(id: string): StoredReceipt {
  return {
    id,
    tenantId: 'tenant-a',
    syndicateId: 'syndic-1',
    lotId: 'lot-1',
    contactId: null,
    kind: 'RECEIPT',
    number: snapshot.number,
    snapshot,
    filePath: null,
    emailedAt: null
  };
}

afterAll(() => {
  fs.rmSync(mockUploadsDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockLogger.warn.mockClear();
  mockRender.mockClear();
  mockUpdateMany.mockClear();
});

describe('ensureReceiptPdf — génération lente journalisée', () => {
  it('logger.warn avec receiptId et durée au-delà de 3 s', async () => {
    const receipt = receiptOf('receipt-lent');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(5_200);

    await ensureReceiptPdf(receipt, context);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Charge receipt PDF generation was slow',
      expect.objectContaining({ receiptId: 'receipt-lent', renderDurationMs: 4_200 })
    );
    dateSpy.mockRestore();
  });

  it('ne journalise rien en dessous de 3 s', async () => {
    const receipt = receiptOf('receipt-rapide');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_800);

    await ensureReceiptPdf(receipt, context);

    expect(mockLogger.warn).not.toHaveBeenCalled();
    dateSpy.mockRestore();
  });

  it('aucune donnée personnelle dans le journal (que receiptId et une durée)', async () => {
    const receipt = receiptOf('receipt-lent-2');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(10_000);

    await ensureReceiptPdf(receipt, context);

    const [, payload] = mockLogger.warn.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['receiptId', 'renderDurationMs']);
    dateSpy.mockRestore();
  });
});
