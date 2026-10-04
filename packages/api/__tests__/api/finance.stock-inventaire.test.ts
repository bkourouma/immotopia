import express from 'express';
import request from 'supertest';

/**
 * Tests des points d'entrée agence de l'inventaire physique — lot 5, refondus
 * par le lot 040 (contrat `contracts/openapi.yaml` 2.0.0, tag « Inventaires »).
 *
 * Les middlewares d'authentification, de tenant et de droits sont remplacés
 * par des passe-plats qui NOTENT la garde posée sur chaque route : la garde
 * attendue (STOCK_*) est épinglée ici. Le domaine
 * (`lib/finance/stock-inventaire.ts`) est simulé : ce fichier vérifie la
 * forme de la requête transmise (agence de l'URL, utilisateur du jeton,
 * identifiants de chemin, corps strict), l'enveloppe rendue (`data`, `meta`)
 * et l'idempotence de la saisie (B3-R2), sans reformuler la logique métier
 * couverte par les tests unitaires.
 */

const guardsHit: string[] = [];

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/stock-rbac-middleware', () => {
  const guard = (name: string) => (_req: any, _res: any, next: any) => {
    guardsHit.push(name);
    next();
  };
  return {
    requireStockView: guard('STOCK_VIEW'),
    requireStockCount: guard('STOCK_COUNT'),
    requireStockCountValidate: guard('STOCK_COUNT_VALIDATE'),
    requireStockCountOrValidate: guard('STOCK_COUNT|STOCK_COUNT_VALIDATE')
  };
});

const domain = {
  createStockCountTx: jest.fn(),
  setStockCountLineTx: jest.fn(),
  removeStockCountLineTx: jest.fn(),
  closeStockCountTx: jest.fn(),
  justifyStockCountLineTx: jest.fn(),
  setAsideStockCountLineTx: jest.fn(),
  setAsideUncountedStockCountLinesTx: jest.fn(),
  validateStockCountTx: jest.fn(),
  cancelStockCountTx: jest.fn(),
  getStockCountView: jest.fn(),
  getStockCountLineView: jest.fn(),
  listStockCountViews: jest.fn()
};

jest.mock('../../src/lib/finance/stock-inventaire', () =>
  Object.fromEntries(Object.keys(domain).map(name => [name, (...args: any[]) => (domain as any)[name](...args)]))
);

const controls = {
  resolveStockCallerContext: jest.fn(),
  loadBlindLocationIds: jest.fn(),
  findClientRequestReplay: jest.fn(),
  claimClientRequestTx: jest.fn(),
  completeClientRequestTx: jest.fn()
};

jest.mock('../../src/lib/finance/stock-controles', () => {
  const actual = jest.requireActual('../../src/lib/finance/stock-controles');
  return {
    buildStockMeta: actual.buildStockMeta,
    hashRequestBody: actual.hashRequestBody,
    isUniqueViolation: actual.isUniqueViolation,
    resolveStockCallerContext: (...args: any[]) => controls.resolveStockCallerContext(...args),
    loadBlindLocationIds: (...args: any[]) => controls.loadBlindLocationIds(...args),
    findClientRequestReplay: (...args: any[]) => controls.findClientRequestReplay(...args),
    claimClientRequestTx: (...args: any[]) => controls.claimClientRequestTx(...args),
    completeClientRequestTx: (...args: any[]) => controls.completeClientRequestTx(...args)
  };
});

const loggedAudit: any[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: any) => loggedAudit.push(entry),
  recordAuditEvent: jest.fn()
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { AppError, errorHandler } from '../../src/middleware/error-middleware';
import financeStockInventaireRoutes from '../../src/routes/finance-stock-inventaire-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const COUNT_A = '77777777-7777-4777-8777-777777777777';
const REQUEST_A = '99999999-9999-4999-8999-999999999999';
const BASE = `/api/tenants/${TENANT_A}/finance/stock/counts`;

const CALLER = { userId: 'user-1', valuesVisible: false, canValidateCount: false };

const app = express();
app.use(express.json());
app.use('/api', financeStockInventaireRoutes);
app.use(errorHandler);

function countView(overrides: Record<string, unknown> = {}) {
  return {
    id: COUNT_A,
    tenantId: TENANT_A,
    locationId: LOCATION_A,
    status: 'DRAFT',
    blind: true,
    lines: [],
    ...overrides
  };
}

const blindLine = {
  id: 'ligne-1',
  itemId: ITEM_A,
  countedQuantity: 92,
  expectedQuantity: null,
  variance: null,
  varianceValue: null
};

beforeEach(() => {
  jest.clearAllMocks();
  guardsHit.length = 0;
  loggedAudit.length = 0;
  controls.resolveStockCallerContext.mockResolvedValue(CALLER);
  controls.loadBlindLocationIds.mockResolvedValue(new Set([LOCATION_A]));
  controls.findClientRequestReplay.mockResolvedValue(null);
  controls.claimClientRequestTx.mockResolvedValue('cle-1');
  domain.getStockCountView.mockResolvedValue(countView());
});

const META = { valuesVisible: false, blindLocationIds: [LOCATION_A] };

// ---------------------------------------------------------------------------
// POST /stock/counts
// ---------------------------------------------------------------------------

describe('POST /stock/counts', () => {
  it('ouvre un inventaire sous STOCK_COUNT, transmet la nature, rend la vue relue et `meta`', async () => {
    domain.createStockCountTx.mockImplementation(async (_tx, _tenant, _params, options) => {
      options.deferredAudit.push({ actionKey: 'STOCK_COUNT_OPENED' });
      return { id: COUNT_A, locationId: LOCATION_A, kind: 'CLOSING', status: 'DRAFT' };
    });

    const res = await request(app)
      .post(BASE)
      .send({ locationId: LOCATION_A, countedAt: '2026-10-04', kind: 'CLOSING' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: countView(), meta: META });
    expect(guardsHit).toEqual(['STOCK_COUNT']);
    expect(domain.createStockCountTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      { locationId: LOCATION_A, countedAt: new Date('2026-10-04'), createdByUserId: 'user-1', kind: 'CLOSING' },
      expect.objectContaining({ deferredAudit: expect.any(Array) })
    );
    expect(domain.getStockCountView).toHaveBeenCalledWith(TENANT_A, COUNT_A, CALLER);
    // L'événement non critique est écrit APRÈS la transaction (B6-R5).
    expect(loggedAudit).toEqual([{ actionKey: 'STOCK_COUNT_OPENED' }]);
  });

  it('refuse un corps qui porterait des lignes, un statut, un tenantId ou une nature inconnue', async () => {
    for (const extra of [{ lines: [] }, { status: 'DRAFT' }, { tenantId: TENANT_A }, { kind: 'PARTIAL' }]) {
      const res = await request(app)
        .post(BASE)
        .send({ locationId: LOCATION_A, countedAt: '2026-10-04', ...extra });
      expect(res.status).toBe(400);
    }
    expect(domain.createStockCountTx).not.toHaveBeenCalled();
  });

  it('transmet le code et les données d’une erreur métier du domaine', async () => {
    domain.createStockCountTx.mockRejectedValue(
      new AppError(
        'Un inventaire est déjà en cours sur ce lieu de stockage.',
        409,
        'STOCK_COUNT_ALREADY_OPEN',
        undefined,
        {
          countId: COUNT_A
        }
      )
    );
    const res = await request(app).post(BASE).send({ locationId: LOCATION_A, countedAt: '2026-10-04' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'STOCK_COUNT_ALREADY_OPEN', data: { countId: COUNT_A } });
    expect(loggedAudit).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PUT /stock/counts/:countId/lines
// ---------------------------------------------------------------------------

describe('PUT /stock/counts/:countId/lines', () => {
  const URL = `${BASE}/${COUNT_A}/lines`;

  it('saisit une ligne : auteur = utilisateur du jeton, réponse limitée à la ligne (A2-R2)', async () => {
    domain.setStockCountLineTx.mockResolvedValue({ lineId: 'ligne-1', line: blindLine });

    const res = await request(app).put(URL).send({ itemId: ITEM_A, countedQuantity: 92 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: blindLine });
    expect(guardsHit).toEqual(['STOCK_COUNT']);
    expect(domain.setStockCountLineTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      COUNT_A,
      { itemId: ITEM_A, countedQuantity: 92, countedByUserId: 'user-1' },
      expect.objectContaining({ deferredAudit: expect.any(Array) })
    );
    expect(controls.claimClientRequestTx).not.toHaveBeenCalled();
  });

  it('REFUSE un motif saisi au comptage, avec le message de la spec (A2-R5)', async () => {
    const res = await request(app).put(URL).send({ itemId: ITEM_A, countedQuantity: 92, reason: 'Casse' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'reason', message: 'Le motif se saisit après la clôture du comptage.' }]);
    expect(domain.setStockCountLineTx).not.toHaveBeenCalled();
  });

  it('refuse `expectedQuantity`, `countId` répété, une quantité négative, et un chemin mal formé', async () => {
    for (const body of [
      { itemId: ITEM_A, countedQuantity: 92, expectedQuantity: 100 },
      { itemId: ITEM_A, countedQuantity: 92, countId: COUNT_A },
      { itemId: ITEM_A, countedQuantity: -1 }
    ]) {
      expect((await request(app).put(URL).send(body)).status).toBe(400);
    }
    expect(
      (await request(app).put(`${BASE}/pas-un-uuid/lines`).send({ itemId: ITEM_A, countedQuantity: 1 })).status
    ).toBe(400);
    expect(domain.setStockCountLineTx).not.toHaveBeenCalled();
  });

  it('accepte le zéro', async () => {
    domain.setStockCountLineTx.mockResolvedValue({ lineId: 'ligne-1', line: { ...blindLine, countedQuantity: 0 } });
    expect((await request(app).put(URL).send({ itemId: ITEM_A, countedQuantity: 0 })).status).toBe(200);
  });

  it('idempotence (B3-R2) : réclame la clé, inscrit le résultat, et rejoue sans réécrire', async () => {
    domain.setStockCountLineTx.mockResolvedValue({ lineId: 'ligne-1', line: blindLine });
    const body = { itemId: ITEM_A, countedQuantity: 92, clientRequestId: REQUEST_A };

    await request(app).put(URL).send(body);
    expect(controls.claimClientRequestTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_A,
        clientRequestId: REQUEST_A,
        operation: 'COUNT_LINE',
        userId: 'user-1'
      })
    );
    expect(controls.completeClientRequestTx).toHaveBeenCalledWith(
      expect.anything(),
      'cle-1',
      'StockCountLine',
      'ligne-1'
    );

    controls.findClientRequestReplay.mockResolvedValue({ resultType: 'StockCountLine', resultId: 'ligne-1' });
    domain.getStockCountLineView.mockResolvedValue(blindLine);
    domain.setStockCountLineTx.mockClear();
    const replay = await request(app).put(URL).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(blindLine);
    expect(domain.setStockCountLineTx).not.toHaveBeenCalled();
    expect(domain.getStockCountLineView).toHaveBeenCalledWith(TENANT_A, 'ligne-1', CALLER);
  });

  it('un rejeu concurrent (P2002 sur la clé) relit la clé et rend le résultat d’origine', async () => {
    domain.setStockCountLineTx.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    controls.findClientRequestReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ resultType: 'StockCountLine', resultId: 'ligne-1' });
    domain.getStockCountLineView.mockResolvedValue(blindLine);

    const res = await request(app).put(URL).send({ itemId: ITEM_A, countedQuantity: 92, clientRequestId: REQUEST_A });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(blindLine);
  });
});

// ---------------------------------------------------------------------------
// Les autres écritures
// ---------------------------------------------------------------------------

describe('écritures sur un inventaire', () => {
  it('DELETE …/lines/:itemId : STOCK_COUNT, identifiants du chemin, auteur du jeton', async () => {
    domain.removeStockCountLineTx.mockResolvedValue({ id: COUNT_A });
    const res = await request(app).delete(`${BASE}/${COUNT_A}/lines/${ITEM_A}`);
    expect(res.status).toBe(200);
    expect(guardsHit).toEqual(['STOCK_COUNT']);
    expect(domain.removeStockCountLineTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      COUNT_A,
      ITEM_A,
      'user-1',
      expect.anything()
    );
  });

  it('POST …/close : STOCK_COUNT, corps vide et strict', async () => {
    domain.closeStockCountTx.mockResolvedValue({ id: COUNT_A, status: 'COUNTED', uncountedLinesCreated: 0 });
    domain.getStockCountView.mockResolvedValue(countView({ status: 'COUNTED', blind: false }));
    const res = await request(app).post(`${BASE}/${COUNT_A}/close`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COUNTED');
    expect(guardsHit).toEqual(['STOCK_COUNT']);
    expect(domain.closeStockCountTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, 'user-1');
    expect((await request(app).post(`${BASE}/${COUNT_A}/close`).send({ force: true })).status).toBe(400);
  });

  it('PUT …/justification : STOCK_COUNT ou STOCK_COUNT_VALIDATE, rend la ligne et `meta`', async () => {
    domain.justifyStockCountLineTx.mockResolvedValue({ lineId: 'ligne-1' });
    domain.getStockCountLineView.mockResolvedValue({ ...blindLine, reasonCode: 'BREAKAGE' });
    const res = await request(app)
      .put(`${BASE}/${COUNT_A}/lines/${ITEM_A}/justification`)
      .send({ reasonCode: 'BREAKAGE', reason: 'Sacs éventrés' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { reasonCode: 'BREAKAGE' }, meta: META });
    expect(guardsHit).toEqual(['STOCK_COUNT|STOCK_COUNT_VALIDATE']);
    expect(domain.justifyStockCountLineTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      COUNT_A,
      ITEM_A,
      { reasonCode: 'BREAKAGE', reason: 'Sacs éventrés', justifiedByUserId: 'user-1' },
      expect.anything()
    );
    // Un code hors de l'énumération est refusé par la forme ; OPENING_BALANCE passe au domaine,
    // qui le refuse en STOCK_REASON_NOT_ALLOWED.
    expect(
      (await request(app).put(`${BASE}/${COUNT_A}/lines/${ITEM_A}/justification`).send({ reasonCode: 'INCONNU' }))
        .status
    ).toBe(400);
  });

  it('POST …/set-aside et …/set-aside-uncounted : STOCK_COUNT_VALIDATE, motif de 3 à 500 caractères', async () => {
    domain.setAsideStockCountLineTx.mockResolvedValue({ lineId: 'ligne-1' });
    domain.setAsideUncountedStockCountLinesTx.mockResolvedValue({ setAsideCount: 2 });

    expect(
      (await request(app).post(`${BASE}/${COUNT_A}/lines/${ITEM_A}/set-aside`).send({ reason: 'Comptage douteux' }))
        .status
    ).toBe(200);
    expect(domain.setAsideStockCountLineTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, ITEM_A, {
      reason: 'Comptage douteux',
      setAsideByUserId: 'user-1'
    });
    expect(
      (await request(app).post(`${BASE}/${COUNT_A}/set-aside-uncounted`).send({ reason: 'Inventaire tournant' })).status
    ).toBe(200);
    expect(guardsHit).toEqual(['STOCK_COUNT_VALIDATE', 'STOCK_COUNT_VALIDATE']);
    expect((await request(app).post(`${BASE}/${COUNT_A}/set-aside-uncounted`).send({ reason: 'ab' })).status).toBe(400);
  });

  it('POST …/validate : STOCK_COUNT_VALIDATE, motif de dérogation transmis, autre champ refusé', async () => {
    domain.validateStockCountTx.mockResolvedValue({ id: COUNT_A, status: 'VALIDATED' });
    domain.getStockCountView.mockResolvedValue(countView({ status: 'VALIDATED', blind: false }));

    expect((await request(app).post(`${BASE}/${COUNT_A}/validate`).send({})).status).toBe(200);
    expect(domain.validateStockCountTx).toHaveBeenLastCalledWith(expect.anything(), TENANT_A, COUNT_A, 'user-1', {
      selfValidationReason: null
    });
    await request(app).post(`${BASE}/${COUNT_A}/validate`).send({ selfValidationReason: 'Seule responsable présente' });
    expect(domain.validateStockCountTx).toHaveBeenLastCalledWith(expect.anything(), TENANT_A, COUNT_A, 'user-1', {
      selfValidationReason: 'Seule responsable présente'
    });
    expect(guardsHit).toEqual(['STOCK_COUNT_VALIDATE', 'STOCK_COUNT_VALIDATE']);
    expect((await request(app).post(`${BASE}/${COUNT_A}/validate`).send({ countId: COUNT_A })).status).toBe(400);
  });

  it('POST …/validate transmet le refus des quatre yeux (403 STOCK_COUNT_SELF_VALIDATION_FORBIDDEN)', async () => {
    domain.validateStockCountTx.mockRejectedValue(
      new AppError('Vous avez compté cet inventaire.', 403, 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN')
    );
    const res = await request(app).post(`${BASE}/${COUNT_A}/validate`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('STOCK_COUNT_SELF_VALIDATION_FORBIDDEN');
  });

  it('POST …/cancel : STOCK_COUNT_VALIDATE, motif exigé', async () => {
    domain.cancelStockCountTx.mockResolvedValue({ id: COUNT_A, status: 'CANCELLED' });
    expect((await request(app).post(`${BASE}/${COUNT_A}/cancel`).send({ reason: 'Comptage interrompu' })).status).toBe(
      200
    );
    expect(domain.cancelStockCountTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, {
      reason: 'Comptage interrompu',
      cancelledByUserId: 'user-1'
    });
    expect((await request(app).post(`${BASE}/${COUNT_A}/cancel`).send({})).status).toBe(400);
    expect(guardsHit[0]).toBe('STOCK_COUNT_VALIDATE');
  });
});

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

describe('lectures', () => {
  it('GET /stock/counts : STOCK_VIEW, sans lignes par défaut, filtres transmis, `meta`', async () => {
    domain.listStockCountViews.mockResolvedValue([countView()]);
    const res = await request(app).get(`${BASE}?locationId=${LOCATION_A}&status=COUNTED&kind=CLOSING`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [countView()], meta: META });
    expect(guardsHit).toEqual(['STOCK_VIEW']);
    expect(domain.listStockCountViews).toHaveBeenCalledWith(TENANT_A, CALLER, {
      locationId: LOCATION_A,
      status: 'COUNTED',
      kind: 'CLOSING',
      withLines: false
    });

    await request(app).get(`${BASE}?withLines=true`);
    expect(domain.listStockCountViews).toHaveBeenLastCalledWith(
      TENANT_A,
      CALLER,
      expect.objectContaining({ withLines: true })
    );
  });

  it('GET /stock/counts refuse un statut inconnu et un filtre inconnu', async () => {
    expect((await request(app).get(`${BASE}?status=OUVERT`)).status).toBe(400);
    expect((await request(app).get(`${BASE}?tenantId=autre`)).status).toBe(400);
  });

  it('GET /stock/counts/:countId : STOCK_VIEW, vue masquée pour l’appelant', async () => {
    const res = await request(app).get(`${BASE}/${COUNT_A}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: countView(), meta: META });
    expect(guardsHit).toEqual(['STOCK_VIEW']);
    expect(domain.getStockCountView).toHaveBeenCalledWith(TENANT_A, COUNT_A, CALLER);
    expect((await request(app).get(`${BASE}/pas-un-uuid`)).status).toBe(400);
  });
});
