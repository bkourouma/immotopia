/**
 * Lot D — exécution confirmée d'un document (lib/ai/actions/execute-rental-document.ts).
 * Le jeton réel (proposal-token.ts) est utilisé ; `generateDocument`, les
 * permissions, l'audit et Prisma sont remplacés.
 */
const callOrder: string[] = [];

const mockPrisma = {
  rentalLease: { findFirst: jest.fn() },
  rentalPayment: { findFirst: jest.fn() },
  rentalInstallment: { findFirst: jest.fn() },
  rentalPaymentAllocation: { findFirst: jest.fn() },
  rentalDocument: { findFirst: jest.fn() },
  auditLog: { findFirst: jest.fn(), create: jest.fn() }
};
const mockGenerateDocument = jest.fn();
const mockHasPermission = jest.fn();
const mockLogAudit = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => mockLoggerError(...a), debug: jest.fn() }
}));
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: (...a: unknown[]) => mockGenerateDocument(...a)
}));
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: (...a: unknown[]) => mockHasPermission(...a)
}));
// Services des outils du registre (chargé par le test d'isolation en bas de fichier).
for (const path of [
  '../../src/services/property-service',
  '../../src/services/rental-lease-service',
  '../../src/services/rental-document-service',
  '../../src/services/property-document-service',
  '../../src/services/document-template-service',
  '../../src/utils/property-tenant-guard'
]) {
  jest.mock(path, () => ({}));
}
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAudit(...a) }));

import { env } from '../../src/config/env';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../src/middleware/error-middleware';
import type { GenerateRentalDocumentArgs } from '../../src/lib/ai/contracts';
import { executeRentalDocument } from '../../src/lib/ai/actions/execute-rental-document';
import { ALL_TOOLS } from '../../src/lib/ai/tools/registry';
import { ProposalError, resetProposalUsageForTests, signProposal } from '../../src/lib/ai/proposal-token';

const TENANT = 'tenant-a';
const USER = 'user-1';
const LEASE_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
const INSTALLMENT_ID = '33333333-3333-4333-8333-333333333333';

const RECEIPT: GenerateRentalDocumentArgs = {
  docType: 'RENT_RECEIPT',
  leaseId: LEASE_ID,
  paymentId: PAYMENT_ID,
  installmentId: INSTALLMENT_ID
};
const STATEMENT: GenerateRentalDocumentArgs = {
  docType: 'RENT_STATEMENT',
  leaseId: LEASE_ID,
  startDate: '2026-01-01',
  endDate: '2026-06-30'
};

const issue = (args: GenerateRentalDocumentArgs, userId = USER, tenantId = TENANT) =>
  signProposal({ userId, tenantId, args });

const run = (token: string, userId = USER, tenantId = TENANT) => executeRentalDocument({ token, userId, tenantId });

const rejectedReasons = () =>
  mockLogAudit.mock.calls.filter(([e]) => e.actionKey === 'AI_ACTION_REJECTED').map(([e]) => e.payload.reason);

const generated = {
  id: 'doc-new',
  document_number: 'RCU-202609-0001',
  type: 'RENT_RECEIPT',
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  file_path: '/var/data/private/rcu.docx'
};

beforeEach(() => {
  jest.clearAllMocks();
  callOrder.length = 0;
  resetProposalUsageForTests();

  mockHasPermission.mockImplementation(async () => {
    callOrder.push('hasPermission');
    return true;
  });
  mockPrisma.auditLog.findFirst.mockResolvedValue(null);
  mockPrisma.auditLog.create.mockImplementation(async () => {
    callOrder.push('redeem');
    return { id: 'audit-1' };
  });
  mockPrisma.rentalLease.findFirst.mockImplementation(async () => {
    callOrder.push('revalidate');
    return {
      id: LEASE_ID,
      lease_number: 'L-00012',
      currency: 'FCFA',
      property: { internalReference: 'BIEN-1', title: 'Appartement' },
      primaryRenter: { user: { fullName: 'Awa Koné' } }
    };
  });
  mockPrisma.rentalPayment.findFirst.mockResolvedValue({ id: PAYMENT_ID, lease_id: LEASE_ID, status: 'SUCCESS' });
  mockPrisma.rentalInstallment.findFirst.mockResolvedValue({ id: INSTALLMENT_ID });
  mockPrisma.rentalPaymentAllocation.findFirst.mockResolvedValue({ id: 'alloc-1' });
  mockPrisma.rentalDocument.findFirst.mockResolvedValue(null);
  mockGenerateDocument.mockImplementation(async () => {
    callOrder.push('generateDocument');
    return generated;
  });
});

describe('exécution d’une quittance confirmée', () => {
  it('suit l’ordre du plan puis renvoie le document (201)', async () => {
    const { token, claims } = issue(RECEIPT);
    const result = await run(token);

    expect(callOrder).toEqual(['hasPermission', 'redeem', 'revalidate', 'generateDocument']);
    expect(mockHasPermission).toHaveBeenCalledWith(USER, 'RENTAL_DOCUMENTS_GENERATE', TENANT);
    expect(mockGenerateDocument).toHaveBeenCalledWith(
      TENANT,
      'RENT_RECEIPT',
      PAYMENT_ID,
      undefined,
      { installmentId: INSTALLMENT_ID },
      USER
    );
    expect(result.payload.alreadyExisted).toBe(false);
    expect(result.payload).toEqual({
      proposalId: claims.jti,
      alreadyExisted: false,
      document: {
        id: 'doc-new',
        documentNumber: 'RCU-202609-0001',
        type: 'RENT_RECEIPT',
        mimeType: generated.mime_type,
        filename: 'RCU-202609-0001.docx',
        downloadPath: `/tenants/${TENANT}/documents/doc-new/download`
      }
    });
    expect(JSON.stringify(result)).not.toContain('file_path');
    expect(JSON.stringify(result)).not.toContain('/var/data');
  });

  it('audite AI_ACTION_EXECUTED', async () => {
    const { token, claims } = issue(RECEIPT);
    await run(token);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER,
        tenantId: TENANT,
        actionKey: 'AI_ACTION_EXECUTED',
        entityId: 'doc-new',
        payload: expect.objectContaining({ proposalId: claims.jti, alreadyExisted: false })
      })
    );
    expect(rejectedReasons()).toEqual([]);
  });

  it('le rejeu du même jeton répond 409 et ne génère qu’un seul document', async () => {
    const { token } = issue(RECEIPT);
    await run(token);
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
    expect(mockGenerateDocument).toHaveBeenCalledTimes(1);
    expect(rejectedReasons()).toEqual(['ALREADY_USED']);
  });

  it('un double clic simultané ne génère qu’un seul document', async () => {
    const { token } = issue(RECEIPT);
    const results = await Promise.allSettled([run(token), run(token)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(mockGenerateDocument).toHaveBeenCalledTimes(1);
  });

  it('quittance FINAL déjà existante : renvoyée sans appeler generateDocument (200)', async () => {
    mockPrisma.rentalDocument.findFirst.mockResolvedValue({
      id: 'doc-old',
      document_number: 'RCU-202608-0007',
      type: 'RENT_RECEIPT',
      mime_type: null
    });
    const { token } = issue(RECEIPT);
    const result = await run(token);

    expect(mockGenerateDocument).not.toHaveBeenCalled();
    expect(mockPrisma.rentalDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT, status: 'FINAL', payment_id: PAYMENT_ID })
      })
    );
    expect(result.payload.alreadyExisted).toBe(true);
    expect(result.payload.document).toMatchObject({
      id: 'doc-old',
      downloadPath: `/tenants/${TENANT}/documents/doc-old/download`
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'AI_ACTION_EXECUTED',
        entityId: 'doc-old',
        payload: expect.objectContaining({ alreadyExisted: true })
      })
    );
  });
});

describe('vérifications avant exécution', () => {
  it('permission retirée entre la proposition et la confirmation : 403, rien réclamé ni généré', async () => {
    const { token } = issue(RECEIPT);
    mockHasPermission.mockResolvedValue(false);
    await expect(run(token)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(mockGenerateDocument).not.toHaveBeenCalled();
    expect(rejectedReasons()).toEqual(['PERMISSION_REVOKED']);
  });

  it('autre utilisateur : PROPOSAL_INVALID avant tout contrôle de permission', async () => {
    const { token } = issue(RECEIPT);
    await expect(run(token, 'user-2')).rejects.toMatchObject({ code: 'PROPOSAL_INVALID', statusCode: 400 });
    expect(mockHasPermission).not.toHaveBeenCalled();
    expect(mockGenerateDocument).not.toHaveBeenCalled();
    expect(rejectedReasons()).toEqual(['WRONG_USER']);
  });

  it('jeton de l’agence A présenté sur l’agence B : PROPOSAL_INVALID, motif distinct dans l’audit', async () => {
    const { token } = issue(RECEIPT);
    await expect(run(token, USER, 'tenant-b')).rejects.toMatchObject({ code: 'PROPOSAL_INVALID' });
    expect(rejectedReasons()).toEqual(['WRONG_TENANT']);
    expect(mockLogAudit.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-b' });
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('signature invalide : PROPOSAL_INVALID, audit AI_ACTION_REJECTED', async () => {
    const { token } = issue(RECEIPT);
    await expect(run(`${token.slice(0, -3)}AAA`)).rejects.toBeInstanceOf(ProposalError);
    expect(rejectedReasons()).toEqual(['BAD_SIGNATURE']);
    expect(mockHasPermission).not.toHaveBeenCalled();
  });

  it('jeton expiré : PROPOSAL_EXPIRED avant la permission', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T10:00:00Z'));
    try {
      const { token } = issue(RECEIPT);
      jest.advanceTimersByTime((env.AI_PROPOSAL_TTL_SECONDS + 1) * 1000);
      await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED' });
      expect(mockHasPermission).not.toHaveBeenCalled();
      expect(rejectedReasons()).toEqual(['EXPIRED']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('revalidation de l’appartenance après réclamation', () => {
  it('paiement devenu étranger au bail : NotFoundError, aucune génération', async () => {
    mockPrisma.rentalPayment.findFirst.mockResolvedValue({ id: PAYMENT_ID, lease_id: 'autre-bail', status: 'SUCCESS' });
    const { token } = issue(RECEIPT);
    await expect(run(token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
    expect(mockPrisma.rentalPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PAYMENT_ID, tenant_id: TENANT } })
    );
    expect(rejectedReasons()).toEqual(['NOT_FOUND']);
  });

  it('paiement d’une autre agence (introuvable pour cette agence) : NotFoundError', async () => {
    mockPrisma.rentalPayment.findFirst.mockResolvedValue(null);
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('bail d’une autre agence : NotFoundError', async () => {
    mockPrisma.rentalLease.findFirst.mockResolvedValue(null);
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.rentalLease.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LEASE_ID, tenant_id: TENANT } })
    );
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('échéance étrangère au bail : NotFoundError', async () => {
    mockPrisma.rentalInstallment.findFirst.mockResolvedValue(null);
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockPrisma.rentalInstallment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INSTALLMENT_ID, tenant_id: TENANT, lease_id: LEASE_ID } })
    );
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('paiement non alloué à cette échéance : NotFoundError', async () => {
    mockPrisma.rentalPaymentAllocation.findFirst.mockResolvedValue(null);
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('paiement remboursé depuis la proposition : BadRequestError', async () => {
    mockPrisma.rentalPayment.findFirst.mockResolvedValue({ id: PAYMENT_ID, lease_id: LEASE_ID, status: 'REFUNDED' });
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(BadRequestError);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });

  it('le jeton reste consommé après un échec de revalidation', async () => {
    mockPrisma.rentalPayment.findFirst.mockResolvedValueOnce(null);
    const { token } = issue(RECEIPT);
    await expect(run(token)).rejects.toBeInstanceOf(NotFoundError);
    await expect(run(token)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED' });
  });
});

describe('relevé de compte', () => {
  it('génère le relevé sur la période demandée', async () => {
    mockGenerateDocument.mockResolvedValue({
      ...generated,
      id: 'doc-stmt',
      document_number: 'RLV-202609-0001',
      type: 'STATEMENT'
    });
    const result = await run(issue(STATEMENT).token);
    expect(mockGenerateDocument).toHaveBeenCalledWith(
      TENANT,
      'RENT_STATEMENT',
      LEASE_ID,
      undefined,
      { startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: new Date('2026-06-30T23:59:59.999Z') },
      USER
    );
    expect(result.payload.alreadyExisted).toBe(false);
    expect(result.payload.document.type).toBe('STATEMENT');
    expect(result.payload.document.filename).toBe('RLV-202609-0001.docx');
    expect(mockPrisma.rentalPayment.findFirst).not.toHaveBeenCalled();
  });

  it('bail d’une autre agence : NotFoundError', async () => {
    mockPrisma.rentalLease.findFirst.mockResolvedValue(null);
    await expect(run(issue(STATEMENT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockGenerateDocument).not.toHaveBeenCalled();
  });
});

describe('erreurs de génération', () => {
  it('toute erreur non typée devient le message générique, détail journalisé seulement', async () => {
    mockGenerateDocument.mockRejectedValue(new Error('Champs critiques manquants: LOCATAIRE_NOM (tenant-a)'));
    const { token, claims } = issue(RECEIPT);

    const error = await run(token).catch(e => e);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('La génération du document a échoué.');
    expect(error.message).not.toContain('LOCATAIRE_NOM');
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ proposalId: claims.jti, error: expect.any(Error) })
    );
    expect(rejectedReasons()).toEqual(['GENERATION_FAILED']);
  });

  it('une erreur typée du service est conservée', async () => {
    mockGenerateDocument.mockRejectedValue(new NotFoundError('Modèle introuvable.'));
    await expect(run(issue(RECEIPT).token)).rejects.toBeInstanceOf(NotFoundError);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});

describe('isolation du registre', () => {
  it('l’exécution n’est joignable par aucun outil du registre LLM', () => {
    expect(ALL_TOOLS.some(tool => /execute/i.test(tool.name))).toBe(false);
    expect(ALL_TOOLS.every(tool => tool.kind === 'read' || tool.kind === 'proposal')).toBe(true);
  });
});
