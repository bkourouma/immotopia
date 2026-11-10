/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SUR-04 : un fichier déposé n'entre que si son CONTENU correspond au type
 * déclaré, et l'extension stockée vient du type réel, jamais de `originalname`.
 * Quatre dépôts : documents d'un bien, pièces jointes de maintenance, documents
 * de copropriété (contrôleur) et logo d'agence. Disque et base sont simulés.
 */

const mockWriteFile = jest.fn(async () => undefined);
const mockMkdir = jest.fn(async () => undefined);

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  writeFile: (...a: unknown[]) => (mockWriteFile as any)(...a),
  mkdir: (...a: unknown[]) => (mockMkdir as any)(...a)
}));

const mockPrisma: Record<string, any> = {
  maintenanceTicket: { findFirst: jest.fn(async () => ({ id: 'ticket-1', tenant_id: 'tenant-a' })) },
  maintenanceTicketAttachment: {
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: any) => ({ id: 'att-1', ...data }))
  },
  propertyDocument: { create: jest.fn(async ({ data }: any) => ({ id: 'doc-1', ...data })) },
  tenant: {
    findUnique: jest.fn(async () => ({ id: 'tenant-a' })),
    update: jest.fn(async () => ({}))
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: jest.fn(),
  flushAuditQueue: jest.fn()
}));
jest.mock('../../src/middleware/session-invalidation', () => ({ revokeTenantSessions: jest.fn() }));
jest.mock('../../src/utils/property-tenant-guard', () => ({
  getPropertyForTenant: jest.fn(async (id: string, tenantId: string) => ({ id, tenantId }))
}));

const mockCreateDocumentForSyndicate = jest.fn(async (_tenantId: string, data: any) => ({ id: 'sd-1', ...data }));
jest.mock('../../src/lib/syndics/queries', () => ({
  ...jest.requireActual('../../src/lib/syndics/queries'),
  createDocumentForSyndicate: (...a: unknown[]) => (mockCreateDocumentForSyndicate as any)(...a)
}));

import { uploadDocument } from '../../src/services/property-document-service';
import { uploadAttachment } from '../../src/services/maintenance-attachment-service';
import { uploadTenantLogo } from '../../src/services/tenant-service';
import { createDocumentHandler } from '../../src/controllers/syndic-controller';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.4 contenu de test');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

function file(buffer: Buffer, mimetype: string, originalname: string): any {
  return { buffer, mimetype, originalname, size: buffer.length };
}

function writtenNames(): string[] {
  return (mockWriteFile.mock.calls as any[][]).map(c => String(c[0]));
}

beforeEach(() => {
  mockWriteFile.mockClear();
  mockMkdir.mockClear();
  mockCreateDocumentForSyndicate.mockClear();
});

describe("documents d'un bien : uploadDocument", () => {
  const upload = (f: any, type: any = 'INSURANCE') => uploadDocument('prop-1', 'tenant-a', f, type);

  it('refuse un HTML déclaré application/pdf (400) sans rien écrire', async () => {
    await expect(upload(file(HTML, 'application/pdf', 'x.pdf'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuse un type déclaré différent du type réel (PNG déclaré PDF)', async () => {
    await expect(upload(file(PNG, 'application/pdf', 'x.pdf'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('accepte un vrai PDF : extension du type réel même si originalname vaut x.html', async () => {
    await upload(file(PDF, 'application/pdf', 'x.html'));
    expect(writtenNames()).toHaveLength(1);
    expect(writtenNames()[0]).toMatch(/\.pdf$/);
    expect(writtenNames()[0]).not.toMatch(/html/);
  });
});

describe('pièces jointes de maintenance : uploadAttachment', () => {
  const upload = (f: any) => uploadAttachment('tenant-a', 'ticket-1', f);

  it('refuse un HTML déclaré image/png (400 typé) sans rien écrire', async () => {
    await expect(upload(file(HTML, 'image/png', 'photo.png'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuse un type non autorisé : 400 et non 500', async () => {
    await expect(upload(file(PNG, 'text/html', 'a.html'))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuse un type déclaré différent du type réel (PDF déclaré image/png)', async () => {
    await expect(upload(file(PDF, 'image/png', 'a.png'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("accepte un vrai PNG : extension .png même si originalname vaut x.html, nom d'origine gardé pour file_name", async () => {
    const created = await upload(file(PNG, 'image/png', 'x.html'));
    expect(writtenNames()[0]).toMatch(/\.png$/);
    expect(created.file_name).toBe('x.html');
  });
});

describe('documents de copropriété : createDocumentHandler', () => {
  async function post(f: any) {
    const req: any = {
      params: { tenantId: 'tenant-a', syndicId: '11111111-1111-4111-8111-111111111111' },
      body: { title: 'Carnet', type: 'OTHER' },
      file: f,
      user: { userId: 'u1' }
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    let error: any;
    await (createDocumentHandler as any)(req, res, (e: unknown) => {
      error = e;
    });
    return { res, error };
  }

  it('refuse un HTML déclaré application/pdf (400) sans rien écrire', async () => {
    const { error } = await post(file(HTML, 'application/pdf', 'carnet.pdf'));
    expect(error).toMatchObject({ statusCode: 400 });
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockCreateDocumentForSyndicate).not.toHaveBeenCalled();
  });

  it('refuse un type déclaré différent du type réel', async () => {
    const { error } = await post(file(JPEG, 'application/pdf', 'carnet.pdf'));
    expect(error).toMatchObject({ statusCode: 400 });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('accepte un vrai PDF : extension .pdf même si originalname vaut x.html', async () => {
    const { res, error } = await post(file(PDF, 'application/pdf', 'x.html'));
    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(writtenNames()[0]).toMatch(/\.pdf$/);
    expect(writtenNames()[0]).not.toMatch(/html/);
  });
});

describe("logo d'agence : uploadTenantLogo", () => {
  const upload = (f: any) => uploadTenantLogo('tenant-a', f);

  it('refuse un HTML déclaré image/png (400) sans rien écrire', async () => {
    await expect(upload(file(HTML, 'image/png', 'logo.png'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('refuse un type déclaré différent du type réel (JPEG déclaré PNG)', async () => {
    await expect(upload(file(JPEG, 'image/png', 'logo.png'))).rejects.toMatchObject({ statusCode: 400 });
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('accepte un vrai JPEG : extension .jpg même si originalname vaut x.html', async () => {
    const { logoUrl } = await upload(file(JPEG, 'image/jpeg', 'x.html'));
    expect(logoUrl).toMatch(/\.jpg$/);
    expect(writtenNames()[0]).toMatch(/\.jpg$/);
  });
});
