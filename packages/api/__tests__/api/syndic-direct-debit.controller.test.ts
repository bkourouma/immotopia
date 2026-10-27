import express from 'express';
import request from 'supertest';

/**
 * Contrôleur du prélèvement des copropriétés (spec 042, P4) : ce qu'il transmet
 * aux services (agence, périmètre, acteur, corps validé) et ce qu'il répond.
 *
 * Les services sont simulés. Les gardes sont éprouvées par
 * `syndic-direct-debit.routes.test.ts` ; ici un passe-plat pose `req.user` et
 * `req.tenantContext`.
 */

const TENANT = 'tenant-a';
const SYN = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const MANDATE = '33333333-3333-4333-8333-333333333333';
const REMITTANCE = '44444444-4444-4444-8444-444444444444';
const LINE = '55555555-5555-4555-8555-555555555555';
const CTX = { scope: 'SYNDIC_LOT', syndicateId: SYN };

/* eslint-disable @typescript-eslint/no-explicit-any */
const m: Record<string, jest.Mock> = {};
const svc = (name: string) => {
  m[name] = jest.fn();
  return (...args: unknown[]) => m[name](...args);
};

jest.mock('../../src/lib/direct-debit/syndic/creditors', () => ({
  getSyndicCreditor: svc('getSyndicCreditor'),
  upsertSyndicCreditor: svc('upsertSyndicCreditor')
}));
jest.mock('../../src/lib/direct-debit/syndic/mandates', () => ({
  createSyndicMandate: svc('createSyndicMandate'),
  listLotDebtors: svc('listLotDebtors'),
  listSyndicMandates: svc('listSyndicMandates')
}));
jest.mock('../../src/lib/direct-debit/syndic/remittances', () => ({
  createSyndicRemittance: svc('createSyndicRemittance')
}));
jest.mock('../../src/lib/direct-debit/mandates', () => ({
  activateMandate: svc('activateMandate'),
  checkIban: svc('checkIban'),
  getMandate: svc('getMandate'),
  getSignedScanFile: svc('getSignedScanFile'),
  reactivateMandate: svc('reactivateMandate'),
  revokeMandate: svc('revokeMandate'),
  suspendMandate: svc('suspendMandate'),
  updateMandate: svc('updateMandate'),
  uploadSignedScan: svc('uploadSignedScan')
}));
jest.mock('../../src/lib/direct-debit/authorization-pdf', () => ({
  generateAuthorizationPdf: svc('generateAuthorizationPdf')
}));
jest.mock('../../src/lib/direct-debit/remittances', () => ({
  cancelRemittance: svc('cancelRemittance'),
  cancelRemittanceLine: svc('cancelRemittanceLine'),
  exportRemittance: svc('exportRemittance'),
  getRemittance: svc('getRemittance'),
  listRemittances: svc('listRemittances'),
  refreshRemittance: svc('refreshRemittance'),
  resendPrenotifications: svc('resendPrenotifications'),
  submitRemittance: svc('submitRemittance'),
  validateRemittance: svc('validateRemittance')
}));
jest.mock('../../src/lib/direct-debit/returns', () => ({
  applyReturnFile: svc('applyReturnFile'),
  listReturnImports: svc('listReturnImports'),
  previewReturnFile: svc('previewReturnFile'),
  rejectRemittanceLine: svc('rejectRemittanceLine'),
  settleAllRemittanceLines: svc('settleAllRemittanceLines'),
  settleRemittanceLine: svc('settleRemittanceLine')
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import * as controller from '../../src/controllers/syndic-direct-debit-controller';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { userId: 'user-1', globalRole: 'USER' },
      tenantContext: { tenantId: TENANT, isCollaborator: true, isClient: false }
    });
    next();
  });
  const B = '/syndics/:syndicId/prelevements';
  app.get(`${B}/creancier`, controller.getCreditorHandler);
  app.put(`${B}/creancier`, controller.upsertCreditorHandler);
  app.get(`${B}/lots/:lotId/debiteurs`, controller.listLotDebtorsHandler);
  app.get(`${B}/mandats`, controller.listMandatesHandler);
  app.post(`${B}/mandats`, controller.createMandateHandler);
  app.get(`${B}/mandats/:mandateId`, controller.getMandateHandler);
  app.post(`${B}/mandats/:mandateId/activer`, controller.activateMandateHandler);
  app.post(`${B}/mandats/:mandateId/revoquer`, controller.revokeMandateHandler);
  app.get(`${B}/mandats/:mandateId/autorisation-pdf`, controller.downloadAuthorizationPdfHandler);
  app.get(`${B}/remises`, controller.listRemittancesHandler);
  app.post(`${B}/remises`, controller.createRemittanceHandler);
  app.get(`${B}/remises/:remittanceId`, controller.getRemittanceHandler);
  app.post(`${B}/remises/:remittanceId/valider`, controller.validateRemittanceHandler);
  app.post(`${B}/remises/:remittanceId/avis`, controller.resendPrenotificationsHandler);
  app.post(`${B}/remises/:remittanceId/fichier`, controller.exportRemittanceHandler);
  app.post(`${B}/remises/:remittanceId/deposer`, controller.submitRemittanceHandler);
  app.post(`${B}/remises/:remittanceId/annuler`, controller.cancelRemittanceHandler);
  app.post(`${B}/remises/:remittanceId/lignes/:lineId/retirer`, controller.cancelRemittanceLineHandler);
  app.post(`${B}/remises/:remittanceId/lignes/:lineId/regler`, controller.settleLineHandler);
  app.post(`${B}/remises/:remittanceId/lignes/:lineId/rejeter`, controller.rejectLineHandler);
  app.post(`${B}/remises/:remittanceId/tout-regler`, controller.settleAllHandler);
  app.post(`${B}/retours/apercu`, controller.previewReturnHandler);
  app.post(`${B}/retours/appliquer`, controller.applyReturnHandler);
  app.get(`${B}/retours`, controller.listReturnsHandler);
  app.use(errorHandler);
  return app;
}

const P = `/syndics/${SYN}/prelevements`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('prélèvement des copropriétés / contrôleur', () => {
  it('créancier : lecture (null si absent) et PUT strict', async () => {
    m.getSyndicCreditor.mockResolvedValue(null);
    const read = await request(buildApp()).get(`${P}/creancier`);
    expect(read.body).toEqual({ success: true, data: null });
    expect(m.getSyndicCreditor).toHaveBeenCalledWith(TENANT, SYN);

    m.upsertSyndicCreditor.mockResolvedValue({ id: 'cr-1', scope: 'SYNDIC_LOT' });
    const put = await request(buildApp())
      .put(`${P}/creancier`)
      .send({ label: ' Compte du syndicat ', bankName: 'Banque Atlantique', collectionDay: 10 });
    expect(put.status).toBe(200);
    expect(m.upsertSyndicCreditor).toHaveBeenCalledWith(
      TENANT,
      SYN,
      expect.objectContaining({ label: 'Compte du syndicat', bankName: 'Banque Atlantique', collectionDay: 10 }),
      'user-1'
    );

    const fees = await request(buildApp()).put(`${P}/creancier`).send({ label: 'A', rejectFeeAmount: 5000 });
    expect(fees.status).toBe(400);
    expect(m.upsertSyndicCreditor).toHaveBeenCalledTimes(1);
  });

  it('crée un mandat (201) avec le syndicat de la route, refuse un corps étranger au contrat', async () => {
    m.createSyndicMandate.mockResolvedValue({ mandate: { id: MANDATE }, warnings: [] });
    const body = {
      lotId: LOT,
      debtorContactId: 'ct-1',
      iban: 'CI93CI0080111301134291200589',
      holderName: 'Awa Traoré'
    };
    const created = await request(buildApp()).post(`${P}/mandats`).send(body);
    expect(created.status).toBe(201);
    expect(m.createSyndicMandate).toHaveBeenCalledWith(TENANT, SYN, expect.objectContaining(body), 'user-1');

    const withTenant = await request(buildApp())
      .post(`${P}/mandats`)
      .send({ ...body, tenantId: 'tenant-b' });
    expect(withTenant.status).toBe(400);
    const withLease = await request(buildApp())
      .post(`${P}/mandats`)
      .send({ ...body, leaseId: LOT });
    expect(withLease.status).toBe(400);
    expect(m.createSyndicMandate).toHaveBeenCalledTimes(1);
  });

  it('lit, active et révoque un mandat dans le périmètre du syndicat', async () => {
    m.getMandate.mockResolvedValue({ id: MANDATE });
    await request(buildApp()).get(`${P}/mandats/${MANDATE}`);
    expect(m.getMandate).toHaveBeenCalledWith(TENANT, MANDATE, CTX);

    m.activateMandate.mockResolvedValue({ id: MANDATE });
    expect((await request(buildApp()).post(`${P}/mandats/${MANDATE}/activer`).send({})).status).toBe(200);
    expect(m.activateMandate).toHaveBeenCalledWith(TENANT, MANDATE, {}, 'user-1', CTX);

    m.revokeMandate.mockResolvedValue({ id: MANDATE });
    await request(buildApp()).post(`${P}/mandats/${MANDATE}/revoquer`).send({ reason: 'Vente du lot' });
    expect(m.revokeMandate).toHaveBeenCalledWith(TENANT, MANDATE, { reason: 'Vente du lot' }, 'user-1', CTX);
  });

  it('sert le PDF en pièce jointe, sans cache', async () => {
    m.generateAuthorizationPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4'),
      fileName: 'Autorisation MDT-2026-0001.pdf'
    });
    const response = await request(buildApp()).get(`${P}/mandats/${MANDATE}/autorisation-pdf`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(m.generateAuthorizationPdf).toHaveBeenCalledWith(TENANT, MANDATE, 'user-1', CTX);
  });

  it('prépare une remise (201) sans créancier dans le corps, valide, renvoie les avis, dépose, annule', async () => {
    m.createSyndicRemittance.mockResolvedValue({ remittance: { id: REMITTANCE }, skipped: [] });
    const created = await request(buildApp())
      .post(`${P}/remises`)
      .send({ collectionDate: '2026-10-26', notes: ' mensuel ' });
    expect(created.status).toBe(201);
    const [tenantId, syndicateId, input, actor] = m.createSyndicRemittance.mock.calls[0];
    expect([tenantId, syndicateId, actor]).toEqual([TENANT, SYN, 'user-1']);
    expect(input.collectionDate).toEqual(new Date('2026-10-26T00:00:00Z'));
    expect(input.notes).toBe('mensuel');

    const withCreditor = await request(buildApp())
      .post(`${P}/remises`)
      .send({ collectionDate: '2026-10-26', creditorId: LOT });
    expect(withCreditor.status).toBe(400);

    m.validateRemittance.mockResolvedValue({ remittance: { id: REMITTANCE }, prenotifications: {} });
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/valider`);
    expect(m.validateRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1', undefined, CTX);

    m.resendPrenotifications.mockResolvedValue({});
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/avis`);
    expect(m.resendPrenotifications).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1', undefined, CTX);

    m.submitRemittance.mockResolvedValue({});
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/deposer`);
    expect(m.submitRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1', undefined, CTX);

    m.cancelRemittance.mockResolvedValue({});
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/annuler`).send({ reason: 'Erreur' });
    expect(m.cancelRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'Erreur', 'user-1', undefined, CTX);

    m.cancelRemittanceLine.mockResolvedValue({});
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/lignes/${LINE}/retirer`).send({ reason: 'Litige' });
    expect(m.cancelRemittanceLine).toHaveBeenCalledWith(TENANT, REMITTANCE, LINE, 'Litige', 'user-1', CTX);
  });

  it('liste et lit les remises du syndicat', async () => {
    m.listRemittances.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    expect((await request(buildApp()).get(`${P}/remises?page=10001`)).status).toBe(400);
    await request(buildApp()).get(`${P}/remises?status=DRAFT`);
    expect(m.listRemittances).toHaveBeenCalledWith(TENANT, { status: 'DRAFT', page: 1, pageSize: 20 }, CTX);

    m.getRemittance.mockResolvedValue({ id: REMITTANCE });
    await request(buildApp()).get(`${P}/remises/${REMITTANCE}`);
    expect(m.getRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, CTX);
  });

  it('sert le fichier en pièce jointe CSV, sans cache', async () => {
    m.exportRemittance.mockResolvedValue({
      buffer: Buffer.from('reference_remise;iban\r\n'),
      fileName: 'PRL-2026-0001.csv',
      contentType: 'text/csv; charset=utf-8'
    });
    const response = await request(buildApp()).post(`${P}/remises/${REMITTANCE}/fichier`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toBe('attachment; filename="PRL-2026-0001.csv"');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(m.exportRemittance).toHaveBeenCalledWith(TENANT, REMITTANCE, 'user-1', undefined, CTX);
  });

  it('transmet les constats au service de retour avec le périmètre SYNDIC_LOT et le syndicat de la route', async () => {
    m.settleRemittanceLine.mockResolvedValue({ id: REMITTANCE });
    await request(buildApp())
      .post(`${P}/remises/${REMITTANCE}/lignes/${LINE}/regler`)
      .send({ settledAt: '2026-10-26' });
    expect(m.settleRemittanceLine).toHaveBeenCalledWith(
      TENANT,
      CTX,
      REMITTANCE,
      LINE,
      { settledAt: '2026-10-26' },
      'user-1'
    );

    m.rejectRemittanceLine.mockResolvedValue({ id: REMITTANCE });
    await request(buildApp())
      .post(`${P}/remises/${REMITTANCE}/lignes/${LINE}/rejeter`)
      .send({ rejectedAt: '2026-10-27', code: 'AC04' });
    expect(m.rejectRemittanceLine).toHaveBeenCalledWith(
      TENANT,
      CTX,
      REMITTANCE,
      LINE,
      expect.objectContaining({ rejectedAt: '2026-10-27', code: 'AC04' }),
      'user-1'
    );
    expect(
      (
        await request(buildApp())
          .post(`${P}/remises/${REMITTANCE}/lignes/${LINE}/rejeter`)
          .send({ rejectedAt: '2026-10-27' })
      ).status
    ).toBe(400);

    m.settleAllRemittanceLines.mockResolvedValue({ settled: 2, failed: [] });
    await request(buildApp()).post(`${P}/remises/${REMITTANCE}/tout-regler`).send({ settledAt: '2026-10-26' });
    expect(m.settleAllRemittanceLines).toHaveBeenCalledWith(
      TENANT,
      CTX,
      REMITTANCE,
      { settledAt: '2026-10-26' },
      'user-1'
    );
  });

  it('aperçu, application et liste des retours banque dans le périmètre du syndicat', async () => {
    m.previewReturnFile.mockResolvedValue({ records: [] });
    await request(buildApp()).post(`${P}/retours/apercu`).send({});
    expect(m.previewReturnFile).toHaveBeenCalledWith(TENANT, CTX, undefined, undefined);

    m.applyReturnFile.mockResolvedValue({ importId: 'imp-1' });
    await request(buildApp()).post(`${P}/retours/appliquer`).send({ format: 'GENERIC_CSV' });
    expect(m.applyReturnFile).toHaveBeenCalledWith(TENANT, CTX, undefined, 'GENERIC_CSV', 'user-1');
    expect((await request(buildApp()).post(`${P}/retours/appliquer`).send({ format: 'INCONNU' })).status).toBe(400);

    m.listReturnImports.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await request(buildApp()).get(`${P}/retours`);
    expect(m.listReturnImports).toHaveBeenCalledWith(TENANT, CTX, { page: 1, pageSize: 20 });
  });

  it('un identifiant qui n est pas un UUID est introuvable (404), sans appeler le service', async () => {
    expect((await request(buildApp()).post(`${P}/remises/pas-un-uuid/valider`)).status).toBe(404);
    expect((await request(buildApp()).get(`/syndics/pas-un-uuid/prelevements/creancier`)).status).toBe(404);
    expect((await request(buildApp()).get(`${P}/lots/pas-un-uuid/debiteurs`)).status).toBe(404);
    expect(m.validateRemittance).not.toHaveBeenCalled();
    expect(m.getSyndicCreditor).not.toHaveBeenCalled();
    expect(m.listLotDebtors).not.toHaveBeenCalled();
  });

  it('liste les copropriétaires d un lot', async () => {
    m.listLotDebtors.mockResolvedValue([{ contactId: 'ct-1', displayName: 'Awa Traoré', hasEmail: true }]);
    const response = await request(buildApp()).get(`${P}/lots/${LOT}/debiteurs`);
    expect(response.body.data).toEqual([{ contactId: 'ct-1', displayName: 'Awa Traoré', hasEmail: true }]);
    expect(m.listLotDebtors).toHaveBeenCalledWith(TENANT, SYN, LOT);
  });
});
