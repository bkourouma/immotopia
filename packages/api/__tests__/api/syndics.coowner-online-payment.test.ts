/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M3 — paiement en ligne des charges depuis le portail
 * copropriétaire, de bout en bout sur HTTP.
 *
 * La pile est la vraie (routes, contrôleur, périmètre, moteur de démarrage et
 * de rapprochement) ; seuls changent la session (`x-test-user`), la garde du
 * portail (le périmètre est choisi par `x-test-scope`) et la base, remplacée
 * par la base en mémoire du moteur (`__tests__/unit/syndics.online-payment-fixtures.ts`)
 * qui applique les filtres `where` : une fuite entre lots ou entre agences s'y
 * verrait. Pas de PostgreSQL (verrous consultatifs) ni de comptabilité.
 *
 * Jeu de données (fixtures du moteur) : agence T1, copropriété S1 configurée
 * (simulateur, frais à la charge de l'agence), S2 non configurée (l'agence a
 * pourtant un compte actif), lots L1 (deux appels C1 + C2, 50 000 FCFA), L2
 * (autre copropriétaire), L3 (S2) ; agence T2 : LB.
 *   - `awa`   (compte client-1) : L1 + L3
 *   - `bakary` (compte client-2) : L2 et L1 (indivision)
 *   - `agenceB` : LB, autre agence
 */

import { createEngineDb, IDS, CODE } from '../unit/syndics.online-payment-fixtures';
import { providerStatus } from '../unit/syndics.online-payment-fixtures';

const db = createEngineDb();
const mockDb = db;
const mockScopes: Record<string, any> = {};
const mockClients: Record<string, string> = { awa: 'client-1', bakary: 'client-2', agenceB: 'client-b' };

jest.mock('../../src/utils/database', () => ({ prisma: mockDb.prisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockDb.engine.logAuditEvent(...a)
}));
jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  sumAllocationsByCall: (...a: any[]) => (mockDb.engine.sumAllocationsByCall as any)(...a),
  assertSyndicateOfTenant: (...a: any[]) => (mockDb.engine.assertSyndicateOfTenant as any)(...a),
  recordLotPaymentTx: (...a: any[]) => (mockDb.engine.recordLotPaymentTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-receipts', () => ({
  issueReceiptsForPaymentTx: (...a: any[]) => (mockDb.engine.issueReceiptsForPaymentTx as any)(...a),
  toDocumentRefs: (docs: any[]) => docs.map(({ id, kind, number }) => ({ id, kind, number }))
}));
jest.mock('../../src/lib/syndics/charge-receipt-delivery', () => ({
  scheduleChargeDocumentDelivery: (...a: any[]) => mockDb.engine.scheduleChargeDocumentDelivery(...a)
}));
jest.mock('../../src/lib/syndics/provider-invoice-accounting', () => ({
  assertFiscalYearOpenTx: (...a: any[]) => (mockDb.engine.assertFiscalYearOpenTx as any)(...a)
}));
jest.mock('../../src/lib/syndics/charge-schedule-tenant-gate', () => ({
  evaluateSchedulingGate: (...a: any[]) => (mockDb.engine.evaluateSchedulingGate as any)(...a)
}));
jest.mock('../../src/lib/payment-gateway/crypto', () => ({
  decryptSecret: (value: string) => value.replace(/^enc:/, '')
}));
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => mockDb.engine.client
}));
jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    const userId = req.headers['x-test-user'];
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId, globalRole: 'USER' };
    next();
  }
}));
// La vraie garde est couverte par `unit/coowner-portal-access.test.ts` : ici le périmètre est imposé.
jest.mock('../../src/middleware/coowner-portal-access', () => ({
  requireCoOwnerPortalAccess: (req: any, res: any, next: any) => {
    const profile = String(req.headers['x-test-scope'] ?? '');
    if (!mockScopes[profile]) {
      res.status(403).json({ success: false, message: 'Accès portail copropriétaire refusé.' });
      return;
    }
    req.coOwnerPortal = {
      tenantClientId: mockClients[profile],
      availableTenantIds: [mockScopes[profile].tenantId],
      scope: mockScopes[profile]
    };
    next();
  }
}));

import express from 'express';
import request from 'supertest';
import coOwnerPortalRoutes from '../../src/routes/coowner-portal-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/portal/copropriete', coOwnerPortalRoutes);
app.use(errorHandler);

const BASE = '/api/portal/copropriete/paiements-en-ligne';
const OWNED_SINCE = new Date('2025-01-01T00:00:00.000Z');
let userCounter = 0;

/** Un utilisateur neuf par appel : le limiteur est par compte et ne doit pas gêner les scénarios. */
const as = (r: request.Test, profile: string) =>
  r.set('x-test-user', `user-${profile}-${++userCounter}`).set('x-test-scope', profile);

/**
 * `visibleSince` : par défaut `OWNED_SINCE` (un ancien propriétaire a précédé : l'historique d'avant est masqué) ;
 * `null` = propriétaire unique, aucune borne (tout l'historique du lot est visible).
 */
const scopeOf = (
  tenantId: string,
  lots: Array<{ lotId: string; syndicateId: string; contactId: string }>,
  visibleSince: Date | null = OWNED_SINCE
) => ({
  tenantId,
  contactIds: Array.from(new Set(lots.map(lot => lot.contactId))),
  lots: lots.map(lot => ({ ...lot, ownershipPercentage: 100, ownedSince: OWNED_SINCE, visibleSince })),
  lotIds: lots.map(lot => lot.lotId),
  syndicateIds: Array.from(new Set(lots.map(lot => lot.syndicateId)))
});

const startBody = (overrides: Record<string, unknown> = {}) => ({
  lotId: IDS.L1,
  chargeCallIds: [IDS.C1, IDS.C2],
  ...overrides
});

beforeEach(() => {
  db.reset();
  // `periodStart` absent des appels de la fixture : le périmètre filtre alors sur l'échéance.
  db.store.calls.forEach(call => {
    call.periodStart = null;
    call.status = 'PENDING';
  });
  mockScopes.awa = scopeOf(IDS.T1, [
    { lotId: IDS.L1, syndicateId: IDS.S1, contactId: IDS.AWA },
    { lotId: IDS.L3, syndicateId: IDS.S2, contactId: IDS.AWA }
  ]);
  mockScopes.bakary = scopeOf(IDS.T1, [
    { lotId: IDS.L2, syndicateId: IDS.S1, contactId: 'contact-bakary' },
    { lotId: IDS.L1, syndicateId: IDS.S1, contactId: 'contact-bakary' }
  ]);
  mockScopes.agenceB = scopeOf(IDS.T2, [{ lotId: IDS.LB, syndicateId: IDS.SB, contactId: IDS.CB }]);
  db.engine.client.buildAway.mockResolvedValue({
    url: 'http://localhost:8001/api/payment-gateway/simulator/X',
    tokens: 'tok-1',
    code: '00',
    message: null
  });
  db.engine.client.getStatus.mockResolvedValue(
    providerStatus({ rawState: 'PENDING', mappedState: 'PENDING', amount: null })
  );
});

describe('GET /paiements-en-ligne/disponibilite', () => {
  it('une entrée par copropriété du périmètre : configurée, simulée, frais de l’agence ; sinon NOT_CONFIGURED', async () => {
    const res = await as(request(app).get(`${BASE}/disponibilite`), 'awa');

    expect(res.status).toBe(200);
    expect(res.body.data.paymentMethods).toEqual(['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'CARD']);
    const bySyndicate = Object.fromEntries(res.body.data.syndicates.map((s: any) => [s.syndicateId, s]));
    expect(Object.keys(bySyndicate).sort()).toEqual([IDS.S1, IDS.S2].sort());
    expect(bySyndicate[IDS.S1]).toMatchObject({
      name: 'Résidence Les Palmiers',
      available: true,
      unavailableReason: null,
      mode: 'SIMULATOR',
      simulated: true,
      feesPaidBy: 'AGENCY'
    });
    // L'agence a un compte actif : la copropriété S2 n'en hérite jamais.
    expect(bySyndicate[IDS.S2]).toMatchObject({
      available: false,
      unavailableReason: 'NOT_CONFIGURED',
      mode: null,
      simulated: false
    });
  });

  it('abonnement sans droit SYNDIC : available:false (SUBSCRIPTION), pas d’erreur', async () => {
    db.engine.evaluateSchedulingGate.mockResolvedValue('NO_SYNDIC_FEATURE' as any);

    const res = await as(request(app).get(`${BASE}/disponibilite`), 'awa');

    expect(res.status).toBe(200);
    const s1 = res.body.data.syndicates.find((s: any) => s.syndicateId === IDS.S1);
    expect(s1).toMatchObject({ available: false, unavailableReason: 'SUBSCRIPTION' });
  });

  it('ne dit rien des copropriétés des autres : le périmètre seul, et 403 sans périmètre', async () => {
    const res = await as(request(app).get(`${BASE}/disponibilite`), 'agenceB');
    expect(res.body.data.syndicates.map((s: any) => s.syndicateId)).toEqual([IDS.SB]);

    const denied = await as(request(app).get(`${BASE}/disponibilite`), 'inconnu');
    expect(denied.status).toBe(403);
  });
});

describe('POST /paiements-en-ligne — démarrage', () => {
  it('201 : montant recalculé par le serveur, compte portail et payeur posés depuis la session', async () => {
    db.store.allocations.push({ id: 'a0', paymentId: 'p0', chargeCallId: IDS.C1, amount: 5000 });

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'PENDING',
      underReview: false,
      amount: 45000,
      currency: 'FCFA',
      chargeCallIds: [IDS.C1, IDS.C2],
      periods: ['2026-01', '2026-02'],
      reused: false,
      mode: 'SIMULATOR',
      feesPaidBy: 'AGENCY',
      lot: { id: IDS.L1, lotNumber: 'A12' },
      syndicate: { id: IDS.S1, name: 'Résidence Les Palmiers' },
      documents: []
    });
    expect(res.body.data.codePaiement).toMatch(/^IMS-[A-Za-z0-9]{20}$/);
    expect(res.body.data.checkoutUrl).toContain('/simulator/');
    const stored = db.store.checkouts[0];
    expect(stored).toMatchObject({
      tenantId: IDS.T1,
      syndicateId: IDS.S1,
      lotId: IDS.L1,
      origin: 'PORTAL',
      tenantClientId: 'client-1',
      contactId: IDS.AWA
    });
    expect(db.engine.client.buildAway).toHaveBeenCalledTimes(1);
  });

  it('rejette un corps hors contrat (montant, agence, champ inconnu, doublon, trop d’appels) : 400', async () => {
    for (const body of [
      startBody({ amount: 1 }),
      startBody({ tenantId: IDS.T2 }),
      startBody({ chargeCallIds: [] }),
      startBody({ chargeCallIds: [IDS.C1, IDS.C1] }),
      startBody({ lotId: 'pas-un-uuid' }),
      { chargeCallIds: [IDS.C1] }
    ]) {
      const res = await as(request(app).post(BASE).send(body), 'awa');
      expect(res.status).toBe(400);
    }
    expect(db.store.checkouts).toHaveLength(0);
    expect(db.engine.client.buildAway).not.toHaveBeenCalled();
  });

  it('lot d’un autre copropriétaire, lot inconnu, lot d’une autre agence : le même 404', async () => {
    const other = await as(
      request(app)
        .post(BASE)
        .send(startBody({ lotId: IDS.L2, chargeCallIds: [IDS.C3] })),
      'awa'
    );
    const unknown = await as(
      request(app)
        .post(BASE)
        .send(startBody({ lotId: '00000000-0000-4000-8000-0000000000ff' })),
      'awa'
    );
    const otherAgency = await as(
      request(app)
        .post(BASE)
        .send(startBody({ lotId: IDS.LB, chargeCallIds: [IDS.CB] })),
      'awa'
    );

    for (const res of [other, unknown, otherAgency]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(other.body.message);
    }
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('appel d’un autre lot, d’une autre agence ou antérieur à l’acquisition : 404, rien n’est créé', async () => {
    const foreignLot = await as(
      request(app)
        .post(BASE)
        .send(startBody({ chargeCallIds: [IDS.C1, IDS.C3] })),
      'awa'
    );
    const foreignAgency = await as(
      request(app)
        .post(BASE)
        .send(startBody({ chargeCallIds: [IDS.CB] })),
      'awa'
    );
    db.store.calls.find(call => call.id === IDS.C1)!.dueDate = new Date('2024-06-01T00:00:00.000Z');
    const beforeAcquisition = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(foreignLot.status).toBe(404);
    expect(foreignAgency.status).toBe(404);
    expect(beforeAcquisition.status).toBe(404);
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('propriétaire unique saisi aujourd’hui (aucune borne) : un appel antérieur à ownedSince est payable', async () => {
    // Profil créé « aujourd'hui » sur une copropriété existante : ownedSince récent, mais pas d'ancien propriétaire.
    mockScopes.awa = scopeOf(
      IDS.T1,
      [
        { lotId: IDS.L1, syndicateId: IDS.S1, contactId: IDS.AWA },
        { lotId: IDS.L3, syndicateId: IDS.S2, contactId: IDS.AWA }
      ],
      null
    );
    db.store.calls.find(call => call.id === IDS.C1)!.dueDate = new Date('2024-06-01T00:00:00.000Z');

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(201);
    expect(db.store.checkouts).toHaveLength(1);
  });

  it('sans borne, le lot reste borné au périmètre : appel d’un autre lot ou d’une autre agence introuvable', async () => {
    mockScopes.awa = scopeOf(IDS.T1, [{ lotId: IDS.L1, syndicateId: IDS.S1, contactId: IDS.AWA }], null);

    const foreignLot = await as(
      request(app)
        .post(BASE)
        .send(startBody({ chargeCallIds: [IDS.C1, IDS.C3] })),
      'awa'
    );
    const foreignAgency = await as(
      request(app)
        .post(BASE)
        .send(startBody({ chargeCallIds: [IDS.CB] })),
      'awa'
    );
    const outOfScopeLot = await as(
      request(app)
        .post(BASE)
        .send(startBody({ lotId: IDS.L2 })),
      'awa'
    );

    expect(foreignLot.status).toBe(404);
    expect(foreignAgency.status).toBe(404);
    expect(outOfScopeLot.status).toBe(404);
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('copropriété non configurée : 400 ONLINE_PAYMENT_UNAVAILABLE, jamais de repli sur le compte de l’agence', async () => {
    const res = await as(
      request(app)
        .post(BASE)
        .send({ lotId: IDS.L3, chargeCallIds: [IDS.C4] }),
      'awa'
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    expect(db.engine.client.buildAway).not.toHaveBeenCalled();
  });

  it('droit SYNDIC refusé : 403 SYNDIC_FEATURE_DENIED', async () => {
    db.engine.evaluateSchedulingGate.mockResolvedValue('TENANT_INACTIVE' as any);

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SYNDIC_FEATURE_DENIED');
    expect(db.store.checkouts).toHaveLength(0);
  });

  it('appel déjà soldé : 400 CHARGE_CALL_ALREADY_SETTLED', async () => {
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C1, amount: 30000 });

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHARGE_CALL_ALREADY_SETTLED');
  });

  it('fournisseur injoignable : 502 et tentative FAILED', async () => {
    db.engine.client.buildAway.mockRejectedValue(new Error('timeout'));

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('ONLINE_PAYMENT_PROVIDER_UNREACHABLE');
    expect(db.store.checkouts[0]).toMatchObject({ status: 'FAILED' });
  });
});

describe('POST /paiements-en-ligne — reprise et 409', () => {
  it('même compte, mêmes appels : 200 reused:true, même code, un seul appel fournisseur', async () => {
    const first = await as(request(app).post(BASE).send(startBody()), 'awa');
    const second = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.reused).toBe(true);
    expect(second.body.data.codePaiement).toBe(first.body.data.codePaiement);
    expect(second.body.data.checkoutUrl).toBe(first.body.data.checkoutUrl);
    expect(db.store.checkouts).toHaveLength(1);
    expect(db.engine.client.buildAway).toHaveBeenCalledTimes(1);
  });

  it('même compte, appels qui se chevauchent : 409 avec le code et l’URL à reprendre', async () => {
    const started = db.addCheckout({ chargeCallIds: [IDS.C1], amount: 30000, tenantClientId: 'client-1' });

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONLINE_PAYMENT_IN_PROGRESS');
    expect(res.body.data).toEqual({ codePaiement: started.codePaiement, checkoutUrl: started.checkoutUrl });
  });

  it('autre compte portail (indivision) : 409 sans code ni URL', async () => {
    db.addCheckout({ tenantClientId: 'client-1' });

    const res = await as(request(app).post(BASE).send(startBody()), 'bakary');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONLINE_PAYMENT_IN_PROGRESS');
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('simulator');
  });

  it('paiement d’un lien sécurisé en cours : 409 sans URL', async () => {
    db.addCheckout({ origin: 'SECURE_LINK', tenantClientId: null, secureLinkId: 'link-1' });

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(409);
    expect(res.body.data).toBeUndefined();
  });

  it('paiement à vérifier par le syndic (REVIEW) : 409 ONLINE_PAYMENT_UNDER_REVIEW', async () => {
    db.addCheckout({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH', tenantClientId: 'client-1' });

    const res = await as(request(app).post(BASE).send(startBody()), 'awa');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ONLINE_PAYMENT_UNDER_REVIEW');
  });
});

describe('GET /paiements-en-ligne/:codePaiement', () => {
  it('rend le paiement du compte, avec l’URL, et ne vérifie qu’une fois par fenêtre de 10 s', async () => {
    const row = db.addCheckout({ tenantClientId: 'client-1' });

    const first = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');
    const second = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      codePaiement: row.codePaiement,
      status: 'PENDING',
      reused: false,
      amount: 50000,
      periods: ['2026-01', '2026-02'],
      checkoutUrl: row.checkoutUrl
    });
    expect(second.status).toBe(200);
    expect(db.engine.client.getStatus).toHaveBeenCalledTimes(1);
  });

  it('reflète l’échec rapporté par le fournisseur (statut serveur, jamais l’URL du navigateur)', async () => {
    const row = db.addCheckout({ tenantClientId: 'client-1' });
    db.engine.client.getStatus.mockResolvedValue(
      providerStatus({ rawState: 'FAILED', mappedState: 'FAILED', amount: null, error: 'Solde insuffisant' })
    );

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'FAILED', checkoutUrl: null, underReview: false });
  });

  it('REVIEW : affiché PENDING + underReview, sans URL', async () => {
    const row = db.addCheckout({ status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH', tenantClientId: 'client-1' });

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(res.body.data).toMatchObject({ status: 'PENDING', underReview: true, checkoutUrl: null });
  });

  it('erreur fournisseur avalée : l’état stocké est renvoyé', async () => {
    const row = db.addCheckout({ tenantClientId: 'client-1' });
    db.engine.client.getStatus.mockRejectedValue(new Error('réseau'));

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('paiement d’un autre lot du même copropriétaire non lié, d’une autre agence, code inconnu ou mal formé : 404', async () => {
    const otherLot = db.addCheckout({
      lotId: IDS.L2,
      chargeCallIds: [IDS.C3],
      codePaiement: 'IMS-aaaaaaaaaaaaaaaaaaaa'
    });
    const otherAgency = db.addCheckout({
      tenantId: IDS.T2,
      syndicateId: IDS.SB,
      lotId: IDS.LB,
      chargeCallIds: [IDS.CB],
      codePaiement: 'IMS-bbbbbbbbbbbbbbbbbbbb'
    });

    for (const code of [
      otherLot.codePaiement,
      otherAgency.codePaiement,
      'IMS-zzzzzzzzzzzzzzzzzzzz',
      'IMT-abcdefghij0123456789',
      'x'
    ]) {
      const res = await as(request(app).get(`${BASE}/${code}`), 'awa');
      expect(res.status).toBe(404);
    }
    expect(db.engine.client.getStatus).not.toHaveBeenCalled();
  });

  it('paiement lancé avant l’acquisition du lot : 404 (celui de l’ancien propriétaire)', async () => {
    const row = db.addCheckout({ createdAt: new Date('2024-05-01T00:00:00.000Z'), tenantClientId: 'client-9' });

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(res.status).toBe(404);
  });

  it('paiement lancé avant l’acquisition, sans ancien propriétaire (aucune borne) : lisible', async () => {
    mockScopes.awa = scopeOf(IDS.T1, [{ lotId: IDS.L1, syndicateId: IDS.S1, contactId: IDS.AWA }], null);
    const row = db.addCheckout({ createdAt: new Date('2024-05-01T00:00:00.000Z'), tenantClientId: 'client-1' });

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'awa');

    expect(res.status).toBe(200);
  });

  it('paiement d’un autre compte sur le même lot : lisible, mais jamais son URL de paiement', async () => {
    const row = db.addCheckout({ tenantClientId: 'client-1' });

    const res = await as(request(app).get(`${BASE}/${row.codePaiement}`), 'bakary');

    expect(res.status).toBe(200);
    expect(res.body.data.checkoutUrl).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('simulator');
  });

  it('l’ordre des routes : « disponibilite » n’est pas pris pour un code de paiement', async () => {
    const res = await as(request(app).get(`${BASE}/disponibilite`), 'awa');
    expect(res.status).toBe(200);
    expect(res.body.data.syndicates).toBeDefined();
    expect(CODE).toMatch(/^IMS-/);
  });
});

describe('GET /appels — onlinePayable et onlineCheckout', () => {
  const call = (body: any, id: string) => body.data.find((c: any) => c.id === id);

  it('onlinePayable vrai si la copropriété est configurée et le reste dû > 0, faux sinon ; syndicateId rendu', async () => {
    db.store.allocations.push({ id: 'a1', paymentId: 'p0', chargeCallId: IDS.C2, amount: 20000 });

    const res = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');

    expect(res.status).toBe(200);
    expect(call(res.body, IDS.C1)).toMatchObject({
      syndicateId: IDS.S1,
      onlinePayable: true,
      onlineCheckout: 'NONE',
      onlineCheckoutCode: null
    });
    // Soldé : plus rien à payer.
    expect(call(res.body, IDS.C2)).toMatchObject({ outstanding: 0, onlinePayable: false });
    // Copropriété sans configuration active (l'agence en a une) : pas de bouton.
    expect(call(res.body, IDS.C4)).toMatchObject({ syndicateId: IDS.S2, onlinePayable: false });
  });

  it('déclaration mobile money en attente (spec 047) : pendingDeclaration renseignée et onlinePayable faux sur les seuls appels visés', async () => {
    db.prisma.syndicPaymentDeclaration.findMany.mockResolvedValueOnce([
      {
        id: 'decl-1',
        syndicateId: IDS.S1,
        createdAt: new Date('2026-10-17T10:00:00.000Z'),
        lines: [{ id: 'line-1', lotId: IDS.L1, amount: 50000, chargeCallIds: [IDS.C1] }]
      }
    ]);

    const res = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');

    expect(call(res.body, IDS.C1)).toMatchObject({
      onlinePayable: false,
      pendingDeclaration: { declarationId: 'decl-1', createdAt: '2026-10-17T10:00:00.000Z' }
    });
    expect(call(res.body, IDS.C2)).toMatchObject({ onlinePayable: true, pendingDeclaration: null });
    // Une seule lecture des déclarations en attente pour tous les appels de la liste.
    expect(db.prisma.syndicPaymentDeclaration.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.syndicPaymentDeclaration.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: IDS.T1,
      status: 'PENDING'
    });
  });

  it('droit SYNDIC refusé ou devise non FCFA : onlinePayable faux', async () => {
    db.store.calls.find(c => c.id === IDS.C2)!.currency = 'EUR';
    const eur = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');
    expect(call(eur.body, IDS.C2).onlinePayable).toBe(false);
    expect(call(eur.body, IDS.C1).onlinePayable).toBe(true);

    db.engine.evaluateSchedulingGate.mockResolvedValue('TENANT_INACTIVE' as any);
    const denied = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');
    expect(call(denied.body, IDS.C1).onlinePayable).toBe(false);
  });

  it('paiement en cours du compte : IN_PROGRESS avec son code ; d’un autre compte : IN_PROGRESS sans code ; REVIEW', async () => {
    const mine = db.addCheckout({ chargeCallIds: [IDS.C1], amount: 30000, tenantClientId: 'client-1' });
    db.addCheckout({
      chargeCallIds: [IDS.C2],
      amount: 20000,
      tenantClientId: 'client-2',
      codePaiement: 'IMS-cccccccccccccccccccc'
    });

    const res = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');
    expect(call(res.body, IDS.C1)).toMatchObject({
      onlineCheckout: 'IN_PROGRESS',
      onlineCheckoutCode: mine.codePaiement
    });
    expect(call(res.body, IDS.C2)).toMatchObject({ onlineCheckout: 'IN_PROGRESS', onlineCheckoutCode: null });

    db.store.checkouts.forEach(row => {
      row.status = 'REVIEW';
    });
    const review = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');
    expect(call(review.body, IDS.C1).onlineCheckout).toBe('REVIEW');
  });

  it('un paiement PENDING de plus de 15 minutes, échoué ou d’un autre lot ne bloque rien', async () => {
    db.addCheckout({ createdAt: new Date(Date.now() - 20 * 60 * 1000), codePaiement: 'IMS-dddddddddddddddddddd' });
    db.addCheckout({ status: 'FAILED', codePaiement: 'IMS-eeeeeeeeeeeeeeeeeeee' });
    db.addCheckout({ lotId: IDS.L2, chargeCallIds: [IDS.C3], codePaiement: 'IMS-ffffffffffffffffffff' });

    const res = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');

    expect(call(res.body, IDS.C1).onlineCheckout).toBe('NONE');
    expect(call(res.body, IDS.C2).onlineCheckout).toBe('NONE');
  });

  it('une seule requête de disponibilité et une seule de tentatives ouvertes, quel que soit le nombre d’appels', async () => {
    db.prisma.syndicPaymentGatewayConfig.findMany.mockClear();
    db.prisma.syndicOnlineCheckout.findMany.mockClear();

    const res = await as(request(app).get('/api/portal/copropriete/appels'), 'awa');

    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(db.prisma.syndicPaymentGatewayConfig.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.syndicOnlineCheckout.findMany).toHaveBeenCalledTimes(1);
  });
});
