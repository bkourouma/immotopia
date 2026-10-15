/**
 * Droits d'accès à la signature selon le TYPE de document (spec 043) : permission
 * RBAC et fonctionnalité d'abonnement déclarées par la source du type, lues sur le
 * corps (création), sur la demande en base (détail, fichiers, annulation, relance)
 * ou sur le paramètre `:kind`. La liste est filtrée aux types lisibles.
 */
type Row = Record<string, any>;

const requestsInDb: Row = {};
const prismaMock: Row = {
  signatureRequest: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const request = requestsInDb[where.id];
      return request && request.tenantId === where.tenantId ? { kind: request.kind } : null;
    })
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

const hasPermission = jest.fn();
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: (...args: unknown[]) => hasPermission(...args)
}));

const featureGate = jest.fn((_req: any, _res: any, next: any) => next());
const requireFeature = jest.fn((_feature: string) => featureGate);
jest.mock('../../src/middleware/subscription-feature-middleware', () => ({
  requireFeature: (feature: string) => requireFeature(feature)
}));

import { ForbiddenError } from '../../src/middleware/error-middleware';
import { permittedSignatureKinds, requireSignatureKindAccess } from '../../src/middleware/signature-access-middleware';
import {
  registerSignatureSource,
  resetSignatureSourcesForTests,
  type SignatureDocumentSource
} from '../../src/lib/signature/sources';
import { leaseContractSource } from '../../src/lib/signature/sources/lease-contract';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_REQUEST = '22222222-2222-4222-8222-222222222222';

const saleSource: SignatureDocumentSource = {
  kind: 'SALE_AGREEMENT',
  targetType: 'SaleAgreement',
  viewPermission: 'CRM_DEALS_VIEW',
  editPermission: 'CRM_DEALS_EDIT',
  feature: 'SALES',
  assertTarget: async () => undefined,
  loadSource: async () => ({ pdf: Buffer.from('%PDF'), title: 'Compromis' }),
  isSourceIntact: async () => true,
  onSealed: async () => undefined
};

function run(mode: 'view' | 'edit', origin: 'body' | 'request' | 'param', req: Row): Promise<unknown[]> {
  const calls: unknown[] = [];
  const full = { user: { userId: 'u1' }, tenantContext: { tenantId: 't1' }, body: {}, params: {}, ...req };
  return requireSignatureKindAccess(mode, origin)(
    full as never,
    {} as never,
    ((error?: unknown) => calls.push(error)) as never
  ).then(() => calls);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSignatureSourcesForTests();
  registerSignatureSource(leaseContractSource);
  registerSignatureSource(saleSource);
  requestsInDb[REQUEST_ID] = { tenantId: 't1', kind: 'SALE_AGREEMENT' };
  requestsInDb[OTHER_TENANT_REQUEST] = { tenantId: 't-autre', kind: 'LEASE_CONTRACT' };
  hasPermission.mockImplementation(
    async (_user: string, key: string) => key === 'RENTAL_LEASES_EDIT' || key === 'RENTAL_LEASES_VIEW'
  );
});

afterAll(() => {
  resetSignatureSourcesForTests();
  registerSignatureSource(leaseContractSource);
});

describe('création : permission du type du corps', () => {
  it("autorise le bail avec la permission de la gestion locative et pose l'abonnement RENTAL", async () => {
    await run('edit', 'body', { body: { kind: 'LEASE_CONTRACT' } });
    expect(hasPermission).toHaveBeenCalledWith('u1', 'RENTAL_LEASES_EDIT', 't1');
    expect(requireFeature).toHaveBeenCalledWith('RENTAL');
    expect(featureGate).toHaveBeenCalledTimes(1);
  });

  it('refuse (403) un compromis à qui n’a que les droits de gestion locative, sans passer à la suite', async () => {
    const calls = await run('edit', 'body', { body: { kind: 'SALE_AGREEMENT' } });
    expect(hasPermission).toHaveBeenCalledWith('u1', 'CRM_DEALS_EDIT', 't1');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeInstanceOf(ForbiddenError);
    expect(featureGate).not.toHaveBeenCalled();
  });

  it('un type absent, inconnu ou sans source ne donne aucun accès : la suite répond 400', async () => {
    for (const body of [{}, { kind: 'PIGEON' }, { kind: 'SALE_MANDATE' }]) {
      expect(await run('edit', 'body', { body })).toEqual([undefined]);
    }
    expect(hasPermission).not.toHaveBeenCalled();
    expect(featureGate).not.toHaveBeenCalled();
  });
});

describe('demande existante : permission du type de CETTE demande', () => {
  it("refuse l'accès à une demande de compromis sans CRM_DEALS_VIEW, même avec les droits du bail", async () => {
    const calls = await run('view', 'request', { params: { id: REQUEST_ID } });
    expect(hasPermission).toHaveBeenCalledWith('u1', 'CRM_DEALS_VIEW', 't1');
    expect(calls[0]).toBeInstanceOf(ForbiddenError);
  });

  it('autorise avec la permission du type de la demande', async () => {
    hasPermission.mockResolvedValue(true);
    expect(await run('edit', 'request', { params: { id: REQUEST_ID } })).toEqual([undefined]);
    expect(hasPermission).toHaveBeenCalledWith('u1', 'CRM_DEALS_EDIT', 't1');
    expect(requireFeature).toHaveBeenCalledWith('SALES');
  });

  it("une demande d'une autre agence, un identifiant invalide ou inconnu : aucun accès accordé, la suite répond 404", async () => {
    for (const id of [OTHER_TENANT_REQUEST, 'pas-un-uuid', '33333333-3333-4333-8333-333333333333']) {
      expect(await run('view', 'request', { params: { id } })).toEqual([undefined]);
    }
    expect(hasPermission).not.toHaveBeenCalled();
    expect(prismaMock.signatureRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_TENANT_REQUEST, tenantId: 't1' } })
    );
  });

  it('sans utilisateur authentifié : refus', async () => {
    const calls = await run('view', 'request', { params: { id: REQUEST_ID }, user: undefined });
    expect(calls[0]).toBeInstanceOf(ForbiddenError);
  });
});

describe('contexte d’une cible : permission d’écriture du type du paramètre', () => {
  it('lit le type dans :kind', async () => {
    await run('edit', 'param', { params: { kind: 'LEASE_CONTRACT' } });
    expect(hasPermission).toHaveBeenCalledWith('u1', 'RENTAL_LEASES_EDIT', 't1');
    const denied = await run('edit', 'param', { params: { kind: 'SALE_AGREEMENT' } });
    expect(denied[0]).toBeInstanceOf(ForbiddenError);
  });
});

describe('liste : types lisibles', () => {
  it('ne rend que les types dont l’utilisateur a la permission de lecture', async () => {
    expect(await permittedSignatureKinds('u1', 't1')).toEqual(['LEASE_CONTRACT']);
    hasPermission.mockResolvedValue(true);
    expect((await permittedSignatureKinds('u1', 't1')).sort()).toEqual(['LEASE_CONTRACT', 'SALE_AGREEMENT']);
    hasPermission.mockResolvedValue(false);
    expect(await permittedSignatureKinds('u1', 't1')).toEqual([]);
  });
});
