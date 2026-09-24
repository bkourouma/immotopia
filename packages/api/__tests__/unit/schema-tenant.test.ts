/**
 * Lot C (multi-tenant) - C1.
 *
 * `RentalDocument.document_number` etait unique sur toute la plateforme
 * (docs/architecture/PLAN-MULTI-TENANT.md, constat 5, migration
 * 20260926090000_document_number_par_agence) : une agence B pouvait bloquer
 * la numerotation d'une agence A avec le meme numero. Deux verifications :
 *
 *   1. Statique - le schema declare bien une unicite composite
 *      (tenant_id, document_number) et plus une unicite globale sur la
 *      seule colonne. Un retour en arriere sur le schema fait echouer ce
 *      test avant d'atteindre la base.
 *   2. Comportementale - `generateDocumentNumber` compte les documents
 *      existants par agence (tenant_id), jamais toutes agences confondues :
 *      deux agences peuvent produire le meme numero "2026-001" sans se
 *      gener.
 */

import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalDocument: { count: jest.fn() }
  }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateDocumentNumber } = require('../../src/services/rental-document-service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedDb = require('../../src/utils/database');
const mockPrisma = mockedDb.prisma;

describe('Schema - RentalDocument.document_number scope par agence (lot C1)', () => {
  const schemaPath = path.join(__dirname, '../../prisma/schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  function extractModelBlock(modelName: string): string {
    const start = schema.indexOf(`model ${modelName} {`);
    expect(start).toBeGreaterThan(-1);
    const end = schema.indexOf('\n}', start);
    return schema.slice(start, end);
  }

  it('ne declare plus document_number comme unique global', () => {
    const block = extractModelBlock('RentalDocument');
    const fieldLine = block
      .split('\n')
      .find(line => line.trim().startsWith('document_number'));

    expect(fieldLine).toBeDefined();
    expect(fieldLine).not.toMatch(/@unique\b/);
  });

  it('declare une unicite composite (tenant_id, document_number)', () => {
    const block = extractModelBlock('RentalDocument');
    expect(block).toMatch(/@@unique\(\[tenant_id,\s*document_number\]\)/);
  });

  it('ne touche pas Invoice.invoiceNumber (facturation SaaS de la plateforme, reste globale)', () => {
    const block = extractModelBlock('Invoice');
    const fieldLine = block
      .split('\n')
      .find(line => line.trim().startsWith('invoiceNumber'));

    expect(fieldLine).toMatch(/@unique\b/);
  });
});

describe('generateDocumentNumber - numerotation isolee par agence', () => {
  beforeEach(() => {
    mockPrisma.rentalDocument.count.mockReset();
  });

  it('compte uniquement les documents de l\'agence demandee', async () => {
    mockPrisma.rentalDocument.count.mockResolvedValue(4);

    const result = await generateDocumentNumber('tenant-a', 2026);

    expect(mockPrisma.rentalDocument.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: 'tenant-a' })
      })
    );
    expect(result).toBe('2026-005');
  });

  it('deux agences differentes peuvent produire le meme numero', async () => {
    mockPrisma.rentalDocument.count.mockResolvedValue(0);

    const numberForTenantA = await generateDocumentNumber('tenant-a', 2026);
    const numberForTenantB = await generateDocumentNumber('tenant-b', 2026);

    expect(numberForTenantA).toBe('2026-001');
    expect(numberForTenantB).toBe('2026-001');
  });
});
