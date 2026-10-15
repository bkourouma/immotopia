/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 043 (lot S1) — signature électronique du bail, bout en bout sur une BASE
 * RÉELLE : isolation inter-agences, parcours complet (création, jeton, signature
 * sur place, scellement, bail marqué signé), piste de preuve chaînée et
 * append-only (déclencheur SQL), index unique « une demande ouverte par bail »,
 * quota sous concurrence.
 *
 * Base : jetable, jamais celle de développement. Même garde que
 * `isolation.test.ts` : `DATABASE_URL_TEST` doit égaler `DATABASE_URL`
 * (`__tests__/helpers/run-isolation-tests.js` y veille) ; sinon la suite est
 * ignorée (`describe.skip`). Le garde-fou Prisma tourne en `enforce`. Aucun
 * envoi réel (fournisseur `log`), conversion DOCX -> PDF simulée.
 */
process.env.TENANT_GUARD_MODE = 'enforce';
process.env.SIGNATURE_PROVIDER = 'log';

import '../helpers/app-shims';
import { randomUUID } from 'crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const buildPdf = async (): Promise<Buffer> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText('Contrat de bail de test', { x: 50, y: 700, size: 14, font });
  return Buffer.from(await doc.save());
};

const convertDocxToPdf = jest.fn();
jest.mock('../../src/lib/pdf-convert', () => ({ convertDocxToPdf: (...a: any[]) => convertDocxToPdf(...a) }));
jest.mock('../../src/services/document-generation-service', () => ({
  getDocumentFile: jest.fn(async () => Buffer.from('docx-de-test'))
}));

import { prisma } from '../../src/utils/database';
import { flushAuditEvents } from '../../src/services/audit-service';
import { runWithTenantContext } from '../../src/utils/tenant-context';
import { sha256Hex } from '../../src/lib/signature/evidence';
import { listChainedEvents, verifyEventChain } from '../../src/lib/signature/events';
import { readSignatureFile, removeSignatureFolder } from '../../src/lib/signature/files';
import { releaseSignature, reserveSignature } from '../../src/lib/signature/quota';
import {
  cancelSignatureRequest,
  createSignatureRequest,
  getSignatureRequest,
  listSignatureRequests,
  sendSignatureFile
} from '../../src/services/signature-service';
import { getPublicSignature, signPublic } from '../../src/services/signature-public-service';
import {
  cleanupTenants,
  createRentalFixtureDirect,
  createTenantAdminUser,
  createTestTenant,
  TestTenant,
  TestUser
} from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log('DATABASE_URL_TEST absente (ou exécution hors base dédiée) : signature.db.test.ts est ignorée.');
}

// PNG 1x1 réel : la signature sur place doit être dessinée.
const DRAWN = {
  mode: 'DRAWN' as const,
  value:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
};
const inPerson = { role: 'LOCATAIRE', fullName: 'Awa Koné', channel: 'IN_PERSON' as const, contact: '' };

maybeDescribe('Signature électronique du bail — base réelle', () => {
  jest.setTimeout(60000);

  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let adminA: TestUser;
  let adminB: TestUser;
  let leaseA: string;
  let leaseA2: string;
  const tenantIds: string[] = [];
  const folders: Array<[string, string]> = [];

  const ctx = (tenant: TestTenant, user: TestUser) => ({ tenantId: tenant.id, userId: user.id });

  async function addContract(tenantId: string, userId: string, leaseId: string) {
    await prisma.rentalDocument.create({
      data: {
        tenant_id: tenantId,
        type: 'LEASE_CONTRACT',
        status: 'FINAL',
        lease_id: leaseId,
        document_number: `CONTRAT-${randomUUID().slice(0, 8)}`,
        file_path: 'inexistant.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        created_by_user_id: userId
      }
    });
  }

  beforeAll(async () => {
    convertDocxToPdf.mockImplementation(async () => buildPdf());
    tenantA = await createTestTenant('SigA');
    tenantB = await createTestTenant('SigB');
    tenantIds.push(tenantA.id, tenantB.id);
    adminA = await createTenantAdminUser(tenantA, 'sig-admin-a');
    adminB = await createTenantAdminUser(tenantB, 'sig-admin-b');
    const fixtureA = await createRentalFixtureDirect(tenantA.id, adminA.id, 'SIGA');
    const fixtureA2 = await createRentalFixtureDirect(tenantA.id, adminA.id, 'SIGA2');
    leaseA = fixtureA.leaseId;
    leaseA2 = fixtureA2.leaseId;
    await addContract(tenantA.id, adminA.id, leaseA);
    await addContract(tenantA.id, adminA.id, leaseA2);
  });

  afterAll(async () => {
    await flushAuditEvents();
    for (const [tenantId, requestId] of folders) await removeSignatureFolder(tenantId, requestId);
    await cleanupTenants(tenantIds);
  });

  it('parcours complet : demande, signature sur place, scellement, bail signé, preuve chaînée', async () => {
    const dto: any = await runWithTenantContext({ tenantId: tenantA.id }, () =>
      createSignatureRequest(ctx(tenantA, adminA), { kind: 'LEASE_CONTRACT', targetId: leaseA, signers: [inPerson] })
    );
    folders.push([tenantA.id, dto.id]);
    expect(dto.status).toBe('SENT');
    const token = dto.signers[0].inPersonUrlToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Seul le SHA-256 du jeton est en base.
    const row = await prisma.signatureSigner.findFirst({ where: { tenantId: tenantA.id, requestId: dto.id } });
    expect(row?.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const page = await getPublicSignature(token);
    expect(page.request.title).toContain('BAIL-');

    const signed = await signPublic(
      token,
      { consent: true, signature: DRAWN },
      { ip: '41.202.207.55', userAgent: 'jest' }
    );
    expect(signed).toEqual({ status: 'SIGNED', requestStatus: 'COMPLETED' });

    const request = await prisma.signatureRequest.findFirst({ where: { id: dto.id, tenantId: tenantA.id } });
    expect(request?.status).toBe('COMPLETED');
    expect(request?.signedHash).toMatch(/^[0-9a-f]{64}$/);
    const signedFile = await readSignatureFile(tenantA.id, dto.id, request!.signedFileKey!);
    expect(sha256Hex(signedFile.buffer)).toBe(request?.signedHash);
    expect((await PDFDocument.load(signedFile.buffer)).getPageCount()).toBe(3);

    const lease = await prisma.rentalLease.findFirst({ where: { id: leaseA, tenant_id: tenantA.id } });
    expect(lease?.signed_at).not.toBeNull();
    expect(lease?.signature_request_id).toBe(dto.id);

    const events = await listChainedEvents(tenantA.id, dto.id);
    expect(events.map(e => e.type)).toEqual(['CREATED', 'OPENED', 'SIGNED', 'SEALED']);
    expect(verifyEventChain(events)).toEqual({ ok: true });

    // Le lien d'un signataire qui a signé cesse d'agir.
    await expect(getPublicSignature(token).then(() => 'ok')).resolves.toBe('ok'); // lecture seule (confirmation)
    await expect(signPublic(token, { consent: true, signature: DRAWN }, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('la piste de preuve est append-only : suppression directe refusée, cascade admise', async () => {
    const event = await prisma.signatureEvent.findFirst({ where: { tenantId: tenantA.id } });
    await expect(prisma.signatureEvent.deleteMany({ where: { id: event!.id, tenantId: tenantA.id } })).rejects.toThrow(
      /append-only/
    );
  });

  it('la piste de preuve est append-only : toute modification est refusée par la base', async () => {
    const event = await prisma.signatureEvent.findFirst({ where: { tenantId: tenantA.id } });
    await expect(
      prisma.signatureEvent.updateMany({ where: { id: event!.id, tenantId: tenantA.id }, data: { type: 'FORGED' } })
    ).rejects.toThrow(/append-only/);
  });

  it("isolation : l'agence B ne voit, n'annule ni ne télécharge rien de la demande de A", async () => {
    const [requestA] = await prisma.signatureRequest.findMany({ where: { tenantId: tenantA.id }, take: 1 });
    const ctxB = ctx(tenantB, adminB);
    await expect(
      runWithTenantContext({ tenantId: tenantB.id }, () => getSignatureRequest(tenantB.id, requestA.id))
    ).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      runWithTenantContext({ tenantId: tenantB.id }, () => cancelSignatureRequest(ctxB, requestA.id))
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      runWithTenantContext({ tenantId: tenantB.id }, () =>
        sendSignatureFile(tenantB.id, requestA.id, 'source', {} as any)
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    const listedB = await runWithTenantContext({ tenantId: tenantB.id }, () => listSignatureRequests(tenantB.id, {}));
    expect(listedB).toEqual([]);
    const listedA = await runWithTenantContext({ tenantId: tenantA.id }, () => listSignatureRequests(tenantA.id, {}));
    expect(listedA.map(r => r.id)).toContain(requestA.id);
  });

  it("isolation : B ne peut pas créer une demande sur le bail de A (même 404 qu'un bail inexistant)", async () => {
    const before = await prisma.signatureRequest.count({ where: { tenantId: tenantB.id } });
    await expect(
      runWithTenantContext({ tenantId: tenantB.id }, () =>
        createSignatureRequest(ctx(tenantB, adminB), { kind: 'LEASE_CONTRACT', targetId: leaseA2, signers: [inPerson] })
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      runWithTenantContext({ tenantId: tenantB.id }, () =>
        createSignatureRequest(ctx(tenantB, adminB), {
          kind: 'LEASE_CONTRACT',
          targetId: randomUUID(),
          signers: [inPerson]
        })
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.signatureRequest.count({ where: { tenantId: tenantB.id } })).toBe(before);
    expect(await prisma.signatureUsage.count({ where: { tenantId: tenantB.id } })).toBe(0);
  });

  it('une seule demande ouverte par bail, même sous deux envois simultanés', async () => {
    const attempts = await Promise.allSettled(
      [0, 1].map(() =>
        runWithTenantContext({ tenantId: tenantA.id }, () =>
          createSignatureRequest(ctx(tenantA, adminA), {
            kind: 'LEASE_CONTRACT',
            targetId: leaseA2,
            signers: [inPerson]
          })
        )
      )
    );
    const ok = attempts.filter(a => a.status === 'fulfilled') as Array<PromiseFulfilledResult<any>>;
    expect(ok).toHaveLength(1);
    folders.push([tenantA.id, ok[0].value.id]);
    const open = await prisma.signatureRequest.count({
      where: { tenantId: tenantA.id, targetId: leaseA2, status: { in: ['DRAFT', 'SENT', 'PARTIALLY_SIGNED'] } }
    });
    expect(open).toBe(1);
  });

  it('quota : la réservation tient sous concurrence, et se rend', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveSignature(tenantB.id, 3)));
    expect(results.filter(r => r.ok)).toHaveLength(3);
    const month = results[0].month;
    await releaseSignature(tenantB.id, month);
    const usage = await prisma.signatureUsage.findFirst({ where: { tenantId: tenantB.id, month } });
    expect(usage?.used).toBe(2);
  });
});
