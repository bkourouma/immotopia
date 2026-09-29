/**
 * Numérotation des documents de bail : un bail peut avoir plusieurs contrats.
 * Le premier porte le numéro du bail (« BAIL-2026-0012 »), les suivants « -A2 »,
 * « -A3 »… « Régénérer » garde le numéro. La quittance reçoit son numéro RCU-…
 * avant le rendu (« N° Reçu » du modèle).
 *
 * Prisma est simulé (une petite table en mémoire) ; la concurrence réelle est
 * prouvée sur PostgreSQL dans `integration/document-lease-contract-concurrency`.
 */
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../src/utils/logger', () => ({ logger }));

interface Row {
  id: string;
  tenant_id: string;
  document_number: string | null;
  revision: number;
  lease_id: string | null;
  payment_id: string | null;
  installment_id: string | null;
  template: { doc_type: string } | null;
  template_id: string | null;
}
let rows: Row[] = [];

const rentalLeaseFindFirst = jest.fn();
const rentalDocumentCreate = jest.fn(async ({ data }: any) => {
  const row = { id: `doc-${rows.length + 1}`, revision: 1, template: null, ...data } as Row;
  rows.push(row);
  return row;
});
const rentalDocumentUpdate = jest.fn(async ({ where, data }: any) => {
  const row = rows.find(r => r.id === where.id)!;
  Object.assign(row, data);
  return row;
});
const documentCounterUpsert = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: (...a: unknown[]) => rentalLeaseFindFirst(...a) },
    rentalDocument: {
      findMany: async ({ where }: any) => {
        const startsWith = where.OR[1].document_number.startsWith as string;
        return rows
          .filter(
            r =>
              r.tenant_id === where.tenant_id &&
              (r.document_number === where.OR[0].document_number || r.document_number?.startsWith(startsWith))
          )
          .map(r => ({ document_number: r.document_number }));
      },
      findFirst: async ({ where }: any) => rows.find(r => r.id === where.id && r.tenant_id === where.tenant_id) ?? null,
      create: (...a: unknown[]) => (rentalDocumentCreate as any)(...a),
      update: (...a: unknown[]) => (rentalDocumentUpdate as any)(...a)
    },
    rentalPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    documentCounter: { upsert: (...a: unknown[]) => documentCounterUpsert(...a) }
  }
}));
// Le verrou PostgreSQL est éprouvé sur base réelle : ici, on exécute simplement la section.
jest.mock('../../src/services/document-number-lock', () => ({
  withDocumentNumberLock: (_key: string, fn: () => Promise<unknown>) => fn()
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/document-template-service', () => ({
  resolveTemplate: jest.fn().mockResolvedValue({ id: 'tpl-1', name: 'Modèle', placeholders: [], file_hash_sha256: 'h' })
}));
const buildDocumentContext = jest.fn();
jest.mock('../../src/services/document-context-builder', () => ({
  buildDocumentContext: (...a: unknown[]) => buildDocumentContext(...a),
  validateContext: jest.fn().mockReturnValue({ missing: [], warnings: [] })
}));
const renderDocx = jest.fn().mockResolvedValue(Buffer.from('docx'));
const saveGeneratedDocument = jest.fn().mockResolvedValue('/tmp/x.docx');
jest.mock('../../src/services/docx-renderer', () => ({
  renderDocx: (...a: unknown[]) => renderDocx(...a),
  calculateHash: jest.fn().mockReturnValue('hash'),
  saveGeneratedDocument: (...a: unknown[]) => saveGeneratedDocument(...a)
}));

import { DocumentType } from '@prisma/client';
import {
  generateDocument,
  nextLeaseContractNumber,
  regenerateDocument
} from '../../src/services/document-generation-service';

const LEASE_ID = '11111111-1111-4111-8111-111111111111';

function row(document_number: string | null, tenant_id = 'tenant-1'): Row {
  return {
    id: `r-${Math.random()}`,
    tenant_id,
    document_number,
    revision: 1,
    lease_id: LEASE_ID,
    payment_id: null,
    installment_id: null,
    template: null,
    template_id: null
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  rentalLeaseFindFirst.mockResolvedValue({ lease_number: 'BAIL-2026-0012' });
  buildDocumentContext.mockResolvedValue({ RECU_NUMERO: 'PROVISOIRE' });
  renderDocx.mockResolvedValue(Buffer.from('docx'));
});

describe('nextLeaseContractNumber', () => {
  it('aucun contrat : le numéro du bail', async () => {
    await expect(nextLeaseContractNumber('tenant-1', 'BAIL-2026-0012')).resolves.toBe('BAIL-2026-0012');
  });

  it('un contrat au numéro du bail : -A2, puis -A3', async () => {
    rows.push(row('BAIL-2026-0012'));
    await expect(nextLeaseContractNumber('tenant-1', 'BAIL-2026-0012')).resolves.toBe('BAIL-2026-0012-A2');
    rows.push(row('BAIL-2026-0012-A2'));
    await expect(nextLeaseContractNumber('tenant-1', 'BAIL-2026-0012')).resolves.toBe('BAIL-2026-0012-A3');
  });

  it("prend le plus grand suffixe existant (trou laissé par une suppression) et ignore les numéros d'autres baux ou agences", async () => {
    rows.push(
      row('BAIL-2026-0012'),
      row('BAIL-2026-0012-A5'),
      row('BAIL-2026-0012-A2'),
      row('BAIL-2026-00120'), // autre bail : préfixe commun, pas de tiret
      row('BAIL-2026-0012-Bis'), // suffixe non numérique
      row('BAIL-2026-0012-A9', 'tenant-2') // autre agence
    );
    await expect(nextLeaseContractNumber('tenant-1', 'BAIL-2026-0012')).resolves.toBe('BAIL-2026-0012-A6');
  });

  it('un numéro de bail avec des caractères spéciaux est traité littéralement', async () => {
    rows.push(row('L.2026+1'));
    await expect(nextLeaseContractNumber('tenant-1', 'L.2026+1')).resolves.toBe('L.2026+1-A2');
    await expect(nextLeaseContractNumber('tenant-1', 'LX2026+1')).resolves.toBe('LX2026+1');
  });
});

describe('generateDocument — plusieurs contrats par bail', () => {
  const gen = (type: DocumentType = DocumentType.LEASE_HABITATION) =>
    generateDocument('tenant-1', type, LEASE_ID, undefined, undefined, 'user-1');

  it('deux contrats sur un bail : X puis X-A2 (le second est créé, pas refusé)', async () => {
    const first = await gen();
    const second = await gen();
    const third = await gen(DocumentType.LEASE_COMMERCIAL);

    expect(first.document_number).toBe('BAIL-2026-0012');
    expect(second.document_number).toBe('BAIL-2026-0012-A2');
    expect(third.document_number).toBe('BAIL-2026-0012-A3');
    expect(saveGeneratedDocument.mock.calls.map(c => c[2])).toEqual([
      'BAIL-2026-0012',
      'BAIL-2026-0012-A2',
      'BAIL-2026-0012-A3'
    ]);
  });

  it("bail sans numéro : compteur de l'agence, comme avant", async () => {
    rentalLeaseFindFirst.mockResolvedValue({ lease_number: null });
    documentCounterUpsert.mockResolvedValue({ last_number: 7 });

    const doc = await gen();

    expect(doc.document_number).toMatch(/^BAIL-\d{4}-0007$/);
  });
});

describe('generateDocument — quittance', () => {
  it('« N° Reçu » du modèle reçoit le numéro RCU-… du document enregistré, avant le rendu', async () => {
    documentCounterUpsert.mockResolvedValue({ last_number: 42 });

    const doc = await generateDocument(
      'tenant-1',
      DocumentType.RENT_RECEIPT,
      'pay-1',
      undefined,
      { installmentId: 'inst-1' },
      'user-1'
    );

    expect(doc.document_number).toMatch(/^RCU-\d{6}-0042$/);
    expect(renderDocx).toHaveBeenCalledTimes(1);
    expect(renderDocx.mock.calls[0][1].RECU_NUMERO).toBe(doc.document_number);
    // Un seul numéro consommé : le compteur n'est pas incrémenté une seconde fois après le rendu.
    expect(documentCounterUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('regenerateDocument', () => {
  it('« Régénérer » garde le numéro du contrat, y compris -A2', async () => {
    const existing = {
      ...row('BAIL-2026-0012-A2'),
      id: 'doc-a2',
      template_id: 'tpl-1',
      template: { doc_type: DocumentType.LEASE_HABITATION }
    };
    rows.push(existing);

    const updated = await regenerateDocument('tenant-1', 'doc-a2', undefined, 'user-1');

    expect(updated.document_number).toBe('BAIL-2026-0012-A2');
    expect(updated.revision).toBe(2);
    expect(saveGeneratedDocument.mock.calls[0][2]).toBe('BAIL-2026-0012-A2');
    expect(rentalLeaseFindFirst).not.toHaveBeenCalled();
  });
});
