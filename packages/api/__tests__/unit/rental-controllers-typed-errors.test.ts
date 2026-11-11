/**
 * BUG-2026-11-03-015 : un bail, une échéance, une pénalité ou une déclaration
 * introuvable (ou d'une autre agence) répond 404, jamais 400. Handlers réels,
 * vrai `errorHandler`, services mockés à la frontière : l'erreur typée lancée
 * par le service doit sortir avec SON statut, et une référence d'une autre
 * agence doit répondre comme un identifiant inexistant (même statut, même corps).
 */
const mockInstallment = {
  generateInstallments: jest.fn(),
  listInstallments: jest.fn(),
  getInstallmentById: jest.fn(),
  recalculateInstallmentStatuses: jest.fn(),
  deleteAllInstallments: jest.fn()
};
jest.mock('../../src/services/rental-installment-service', () => ({
  generateInstallments: (...a: any[]) => mockInstallment.generateInstallments(...a),
  listInstallments: (...a: any[]) => mockInstallment.listInstallments(...a),
  getInstallmentById: (...a: any[]) => mockInstallment.getInstallmentById(...a),
  recalculateInstallmentStatuses: (...a: any[]) => mockInstallment.recalculateInstallmentStatuses(...a),
  deleteAllInstallments: (...a: any[]) => mockInstallment.deleteAllInstallments(...a)
}));

const mockPenalty = {
  calculatePenalty: jest.fn(),
  updatePenalty: jest.fn(),
  getPenaltyById: jest.fn(),
  listPenalties: jest.fn(),
  deletePenalty: jest.fn(),
  uploadPenaltyJustification: jest.fn()
};
jest.mock('../../src/services/rental-penalty-service', () => ({
  calculatePenalty: (...a: any[]) => mockPenalty.calculatePenalty(...a),
  updatePenalty: (...a: any[]) => mockPenalty.updatePenalty(...a),
  getPenaltyById: (...a: any[]) => mockPenalty.getPenaltyById(...a),
  listPenalties: (...a: any[]) => mockPenalty.listPenalties(...a),
  deletePenalty: (...a: any[]) => mockPenalty.deletePenalty(...a),
  uploadPenaltyJustification: (...a: any[]) => mockPenalty.uploadPenaltyJustification(...a)
}));
jest.mock('../../src/jobs/penalty-calculation-job', () => ({ triggerPenaltyCalculation: jest.fn() }));

const mockDecl = {
  approvePaymentDeclaration: jest.fn(),
  rejectPaymentDeclaration: jest.fn(),
  getPaymentDeclarations: jest.fn(),
  getPaymentDeclarationById: jest.fn()
};
jest.mock('../../src/services/rental-payment-declaration-service', () => ({
  approvePaymentDeclaration: (...a: any[]) => mockDecl.approvePaymentDeclaration(...a),
  rejectPaymentDeclaration: (...a: any[]) => mockDecl.rejectPaymentDeclaration(...a),
  getPaymentDeclarations: (...a: any[]) => mockDecl.getPaymentDeclarations(...a),
  getPaymentDeclarationById: (...a: any[]) => mockDecl.getPaymentDeclarationById(...a)
}));

import express from 'express';
import request from 'supertest';
import {
  generateInstallmentsHandler,
  getInstallmentHandler,
  recalculateInstallmentStatusesHandler,
  deleteAllInstallmentsHandler
} from '../../src/controllers/rental-installment-controller';
import {
  calculatePenaltiesHandler,
  updatePenaltyHandler,
  getPenaltyHandler,
  deletePenaltyHandler
} from '../../src/controllers/rental-penalty-controller';
import {
  approvePaymentDeclarationHandler,
  rejectPaymentDeclarationHandler,
  getPaymentDeclarationHandler
} from '../../src/controllers/rental-payment-declaration-controller';
import { AppError, ConflictError, ErrorCode, NotFoundError, errorHandler } from '../../src/middleware/error-middleware';

const P = '/tenants/T/rental';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantContext = { tenantId: 'tenant-b' };
    (req as any).user = { userId: 'user-1' };
    next();
  });
  app.post(`${P}/leases/:leaseId/installments`, generateInstallmentsHandler);
  app.post(`${P}/leases/:leaseId/installments/recalculate`, recalculateInstallmentStatusesHandler);
  app.delete(`${P}/leases/:leaseId/installments`, deleteAllInstallmentsHandler);
  app.get(`${P}/installments/:installmentId`, getInstallmentHandler);
  app.post(`${P}/penalties/calculate`, calculatePenaltiesHandler);
  app.patch(`${P}/penalties/:penaltyId`, updatePenaltyHandler);
  app.get(`${P}/penalties/:penaltyId`, getPenaltyHandler);
  app.delete(`${P}/penalties/:penaltyId`, deletePenaltyHandler);
  app.post(`${P}/payment-declarations/:declarationId/approve`, approvePaymentDeclarationHandler);
  app.post(`${P}/payment-declarations/:declarationId/reject`, rejectPaymentDeclarationHandler);
  app.get(`${P}/payment-declarations/:declarationId`, getPaymentDeclarationHandler);
  app.use(errorHandler);
  return app;
}

beforeEach(() => jest.clearAllMocks());

const notFound = (msg: string) => () => Promise.reject(new NotFoundError(msg));

describe('introuvable : 404 sur les écritures bail / échéance', () => {
  it.each([
    ['POST installments', 'post', `${P}/leases/x/installments`, mockInstallment.generateInstallments],
    [
      'POST recalculate',
      'post',
      `${P}/leases/x/installments/recalculate`,
      mockInstallment.recalculateInstallmentStatuses
    ],
    ['DELETE installments', 'delete', `${P}/leases/x/installments`, mockInstallment.deleteAllInstallments]
  ] as const)('%s', async (_n, method, url, svc) => {
    svc.mockImplementation(notFound('Bail introuvable'));
    const res = await (request(buildApp()) as any)[method](url).send({});
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Bail introuvable' });
  });

  it('GET échéance absente : 404', async () => {
    mockInstallment.getInstallmentById.mockResolvedValue(null);
    const res = await request(buildApp()).get(`${P}/installments/x`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('conflit : 409 et non 400', async () => {
    mockInstallment.generateInstallments.mockRejectedValue(new ConflictError('Des échéances existent déjà'));
    const res = await request(buildApp()).post(`${P}/leases/x/installments`).send({});
    expect(res.status).toBe(409);
  });
});

describe('introuvable : 404 sur les pénalités', () => {
  it.each([
    ['PATCH', 'patch', `${P}/penalties/x`, mockPenalty.updatePenalty, { amount: 1, reason: 'r' }],
    ['DELETE', 'delete', `${P}/penalties/x`, mockPenalty.deletePenalty, {}]
  ] as const)('%s', async (_n, method, url, svc, body) => {
    svc.mockImplementation(notFound('Pénalité introuvable'));
    const res = await (request(buildApp()) as any)[method](url).send(body);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, message: 'Pénalité introuvable' });
  });

  it('calcul sur une échéance introuvable : 404', async () => {
    mockPenalty.calculatePenalty.mockImplementation(notFound('Échéance introuvable'));
    const res = await request(buildApp()).post(`${P}/penalties/calculate?installmentId=x`).send({});
    expect(res.status).toBe(404);
  });

  it('corps invalide : 400 avec le détail par champ', async () => {
    const res = await request(buildApp()).patch(`${P}/penalties/x`).send({ amount: -1 });
    expect(res.status).toBe(400);
    expect(res.body.errors?.length).toBeGreaterThan(0);
    expect(mockPenalty.updatePenalty).not.toHaveBeenCalled();
  });

  it('GET absente : 404', async () => {
    mockPenalty.getPenaltyById.mockResolvedValue(null);
    expect((await request(buildApp()).get(`${P}/penalties/x`)).status).toBe(404);
  });
});

describe('déclarations de paiement', () => {
  it('approbation introuvable : 404', async () => {
    mockDecl.approvePaymentDeclaration.mockImplementation(notFound('Déclaration non trouvée ou déjà traitée'));
    const res = await request(buildApp()).post(`${P}/payment-declarations/x/approve`).send({});
    expect(res.status).toBe(404);
  });

  it('rejet : notes requises en 400, introuvable en 404', async () => {
    // Le contrôleur accepte un corps vide : la note obligatoire (motif « Autre »)
    // est contrôlée par le service, dont le mock reproduit l'erreur typée.
    mockDecl.rejectPaymentDeclaration.mockImplementation(
      (_tenantId: string, _id: string, _actor: string, note?: string) =>
        note?.trim()
          ? Promise.reject(new NotFoundError('Déclaration non trouvée ou déjà traitée'))
          : Promise.reject(
              new AppError(
                'Une note est obligatoire pour le motif « Autre ».',
                400,
                ErrorCode.RENTAL_DECLARATION_REJECT_NOTE_REQUIRED
              )
            )
    );
    const sansNote = await request(buildApp()).post(`${P}/payment-declarations/x/reject`).send({});
    expect(sansNote.status).toBe(400);
    expect(sansNote.body.code ?? sansNote.body.errorCode).toBe('RENTAL_DECLARATION_REJECT_NOTE_REQUIRED');
    mockDecl.rejectPaymentDeclaration.mockImplementation(notFound('Déclaration non trouvée ou déjà traitée'));
    const res = await request(buildApp()).post(`${P}/payment-declarations/x/reject`).send({ reviewNotes: 'non' });
    expect(res.status).toBe(404);
  });

  it('lecture introuvable : 404', async () => {
    mockDecl.getPaymentDeclarationById.mockImplementation(notFound('Déclaration non trouvée'));
    expect((await request(buildApp()).get(`${P}/payment-declarations/x`)).status).toBe(404);
  });
});

describe('même réponse pour une référence d’une autre agence et un id inexistant', () => {
  it('corps identiques', async () => {
    mockPenalty.deletePenalty.mockImplementation(notFound('Pénalité introuvable'));
    const autreAgence = await request(buildApp()).delete(`${P}/penalties/de-lagence-a`);
    const inexistant = await request(buildApp()).delete(`${P}/penalties/inventee`);
    expect(autreAgence.status).toBe(inexistant.status);
    expect(autreAgence.body).toEqual(inexistant.body);
  });
});
