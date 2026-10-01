/**
 * Lot C5 (spec 039) — lib/payment-gateway/installment-payment-link.
 *
 * `lib/secure-links` est mocké à sa frontière publique, Prisma à
 * `utils/database`, le démarrage/rapprochement du checkout à `checkout`
 * (sauf `resteDuEcheance`, réel : le montant est TOUJOURS recalculé).
 */

import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';
import { getTenantContext } from '../../src/utils/tenant-context';
import { logger } from '../../src/utils/logger';

const TENANT_A = 'tenant-a';
const TOKEN = 'TOKEN_SECRET_VALUE_0123456789';
const CODE = 'IMT-abcdefghij0123456789';

const installmentFindFirst = jest.fn();
const checkoutFindFirst = jest.fn();
const checkoutFindMany = jest.fn();
const checkoutUpdateMany = jest.fn();
const secureLinkFindFirst = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalInstallment: { findFirst: (...a: any[]) => installmentFindFirst(...a) },
    onlinePaymentCheckout: {
      findFirst: (...a: any[]) => checkoutFindFirst(...a),
      findMany: (...a: any[]) => checkoutFindMany(...a),
      updateMany: (...a: any[]) => checkoutUpdateMany(...a)
    },
    secureLink: { findFirst: (...a: any[]) => secureLinkFindFirst(...a) }
  }
}));

const verifySecureLink = jest.fn();
const recordSecureLinkView = jest.fn();
const createSecureLink = jest.fn();
const listSecureLinks = jest.fn();
const revokeSecureLink = jest.fn();
jest.mock('../../src/lib/secure-links', () => {
  const { NotFoundError: NF } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    verifySecureLink: (...a: any[]) => verifySecureLink(...a),
    recordSecureLinkView: (...a: any[]) => recordSecureLinkView(...a),
    createSecureLink: (...a: any[]) => createSecureLink(...a),
    listSecureLinks: (...a: any[]) => listSecureLinks(...a),
    revokeSecureLink: (...a: any[]) => revokeSecureLink(...a),
    invalidSecureLinkError: () => new NF('Lien invalide ou expiré.')
  };
});

const loadConfig = jest.fn();
jest.mock('../../src/lib/payment-gateway/config', () => ({
  loadConfig: (...a: any[]) => loadConfig(...a),
  isConfigUsable: (config: any) => Boolean(config && config.isActive)
}));

// Dépendances lourdes du vrai `checkout.ts` (on n'en garde que `resteDuEcheance`).
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(),
  allocatePaymentTx: jest.fn()
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureChartAccountTx: jest.fn() }));

const startCheckoutForInstallments = jest.fn();
const reconcileCheckout = jest.fn();
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  ...jest.requireActual('../../src/lib/payment-gateway/checkout'),
  startCheckoutForInstallments: (...a: any[]) => startCheckoutForInstallments(...a),
  reconcileCheckout: (...a: any[]) => reconcileCheckout(...a)
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => logAuditEvent(...a)
}));

import {
  createInstallmentPaymentLink,
  getInstallmentPaymentByToken,
  getInstallmentPaymentStatusByCode,
  listInstallmentPaymentLinks,
  revokeInstallmentPaymentLink,
  startInstallmentPaymentByToken
} from '../../src/lib/payment-gateway/installment-payment-link';

const link = {
  id: 'link-1',
  tenantId: TENANT_A,
  scope: 'INSTALLMENT_PAYMENT',
  objectType: 'RentalInstallment',
  objectId: 'inst-1',
  expiresAt: new Date('2026-10-20T10:00:00.000Z')
};

function installment(overrides: Record<string, any> = {}): any {
  return {
    id: 'inst-1',
    lease_id: 'lease-1',
    period_year: 2026,
    period_month: 10,
    due_date: new Date('2026-10-05T00:00:00.000Z'),
    status: 'DUE',
    currency: 'XOF',
    amount_rent: '150000.00',
    amount_service: '10000.00',
    amount_other_fees: '0',
    penalty_amount: '5000.00',
    amount_paid: '60000.00',
    payments: [],
    lease: { status: 'ACTIVE', primary_renter_client_id: 'renter-secret-id' },
    tenant: { name: 'Agence Alpha' },
    ...overrides
  };
}

const usableConfig = { isActive: true, mode: 'SIMULATOR' };
const invalid = () => new NotFoundError('Lien invalide ou expiré.');

function checkoutDto(overrides: Record<string, any> = {}) {
  return {
    id: 'checkout-1',
    amount: 105000,
    checkoutUrl: 'https://pay.provider.example/hosted/xyz',
    ...overrides
  };
}

function everythingLogged(): string {
  const calls = [
    ...(logger.info as jest.Mock).mock.calls,
    ...(logger.warn as jest.Mock).mock.calls,
    ...(logger.error as jest.Mock).mock.calls,
    ...(logger.debug as jest.Mock).mock.calls,
    ...logAuditEvent.mock.calls
  ];
  return JSON.stringify(calls);
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(logger, 'info').mockImplementation(() => logger);
  jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  jest.spyOn(logger, 'error').mockImplementation(() => logger);
  jest.spyOn(logger, 'debug').mockImplementation(() => logger);
  loadConfig.mockResolvedValue(usableConfig);
  checkoutFindFirst.mockResolvedValue(null);
  checkoutFindMany.mockResolvedValue([]);
});

describe('getInstallmentPaymentByToken', () => {
  it('renvoie un DTO sans coordonnées ni identifiant technique, montant recalculé côté serveur', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    let seenContext: string | undefined;
    installmentFindFirst.mockImplementationOnce(async (args: any) => {
      seenContext = getTenantContext()?.tenantId;
      expect(args.where).toEqual({ id: 'inst-1', tenant_id: TENANT_A });
      return installment();
    });

    const dto = await getInstallmentPaymentByToken(TOKEN, { ip: '1.2.3.4', userAgent: 'UA' });

    expect(verifySecureLink).toHaveBeenCalledWith(TOKEN, 'INSTALLMENT_PAYMENT');
    expect(seenContext).toBe(TENANT_A);
    expect(dto).toEqual({
      agencyName: 'Agence Alpha',
      periodYear: 2026,
      periodMonth: 10,
      dueDate: '2026-10-05T00:00:00.000Z',
      // 150000 + 10000 + 5000 - 60000
      amountDue: 105000,
      currency: 'FCFA',
      expiresAt: '2026-10-20T10:00:00.000Z',
      paymentMethods: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
      simulated: true,
      paymentInProgress: false,
      reviewPending: false
    });
    const serialised = JSON.stringify(dto);
    for (const forbidden of ['renter-secret-id', 'lease-1', 'inst-1', 'tenant-a', 'link-1', 'email', 'phone']) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(recordSecureLinkView).toHaveBeenCalledWith(link, { ip: '1.2.3.4', userAgent: 'UA' });
  });

  it('paymentInProgress (PENDING seul) : lecture bornée par tenant, bail et échéance', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    installmentFindFirst.mockResolvedValueOnce(installment());
    checkoutFindMany.mockResolvedValueOnce([{ status: 'PENDING' }]);

    const dto = await getInstallmentPaymentByToken(TOKEN, {});

    expect(dto.paymentInProgress).toBe(true);
    expect(dto.reviewPending).toBe(false);
    const where = checkoutFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT_A, leaseId: 'lease-1', installmentIds: { has: 'inst-1' } });
    expect(where.OR).toEqual([{ status: 'PENDING', createdAt: { gte: expect.any(Date) } }, { status: 'REVIEW' }]);
  });

  it('un checkout REVIEW (sans limite d’âge) donne reviewPending, pas paymentInProgress', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    installmentFindFirst.mockResolvedValueOnce(installment());
    checkoutFindMany.mockResolvedValueOnce([{ status: 'REVIEW' }]);

    const dto = await getInstallmentPaymentByToken(TOKEN, {});

    expect(dto.reviewPending).toBe(true);
    expect(dto.paymentInProgress).toBe(false);
  });

  it('tout refus est le même 404 « Lien invalide ou expiré. », sans consultation enregistrée', async () => {
    const errors: any[] = [];
    const attempt = async () => {
      try {
        await getInstallmentPaymentByToken(TOKEN, {});
        errors.push(null);
      } catch (error) {
        errors.push(error);
      }
    };

    // Jeton inconnu / expiré / révoqué / mauvaise portée / agence suspendue : verifySecureLink refuse.
    for (let i = 0; i < 5; i++) {
      verifySecureLink.mockRejectedValueOnce(invalid());
      await attempt();
    }
    // Mauvais type d'objet.
    verifySecureLink.mockResolvedValueOnce({ ...link, objectType: 'OwnerStatement' });
    await attempt();
    // Échéance disparue, bail terminé, échéance annulée, soldée, config inutilisable.
    const scenarios: Array<[any, any]> = [
      [null, usableConfig],
      [installment({ lease: { status: 'ENDED', primary_renter_client_id: 'r' } }), usableConfig],
      [installment({ status: 'CANCELED' }), usableConfig],
      [installment({ amount_paid: '165000.00' }), usableConfig],
      [installment(), { isActive: false, mode: 'SIMULATOR' }],
      [installment(), null]
    ];
    for (const [inst, config] of scenarios) {
      verifySecureLink.mockResolvedValueOnce(link);
      installmentFindFirst.mockResolvedValueOnce(inst);
      loadConfig.mockResolvedValue(config);
      await attempt();
    }

    expect(errors).toHaveLength(12);
    for (const error of errors) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Lien invalide ou expiré.');
    }
    expect(recordSecureLinkView).not.toHaveBeenCalled();
  });

  it('un paiement confirmé (reste dû 0) rend le lien inopérant', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    installmentFindFirst.mockResolvedValueOnce(
      installment({ payments: [{ amount: '105000', payment: { status: 'SUCCESS' } }], amount_paid: '60000' })
    );
    // 60000 déjà payés ; l'affectation SUCCESS de 105000 < … : reste dû = 165000 - max(105000, 60000) = 60000 > 0.
    await expect(getInstallmentPaymentByToken(TOKEN, {})).resolves.toMatchObject({ amountDue: 60000 });

    verifySecureLink.mockResolvedValueOnce(link);
    installmentFindFirst.mockResolvedValueOnce(
      installment({ payments: [{ amount: '165000', payment: { status: 'SUCCESS' } }] })
    );
    await expect(getInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({
      statusCode: 404,
      message: 'Lien invalide ou expiré.'
    });
  });

  it('un échec d’enregistrement de la consultation ne casse pas la lecture, sans jeton dans les journaux', async () => {
    verifySecureLink.mockResolvedValueOnce(link);
    installmentFindFirst.mockResolvedValueOnce(installment());
    recordSecureLinkView.mockRejectedValueOnce(new Error(`boom ${TOKEN}`));

    await expect(getInstallmentPaymentByToken(TOKEN, {})).resolves.toMatchObject({ amountDue: 105000 });
    expect(everythingLogged()).not.toContain(TOKEN);
  });
});

describe('startInstallmentPaymentByToken', () => {
  beforeEach(() => {
    verifySecureLink.mockResolvedValue(link);
    installmentFindFirst.mockResolvedValue(installment());
    secureLinkFindFirst.mockResolvedValue({ createdByUserId: 'user-agent' });
    startCheckoutForInstallments.mockResolvedValue({ checkout: checkoutDto(), reused: false, mode: 'SIMULATOR' });
  });

  it('démarre le checkout de CETTE échéance, sans montant fourni, et renvoie l’URL du fournisseur', async () => {
    const result = await startInstallmentPaymentByToken(TOKEN, { ip: '1.2.3.4', userAgent: 'UA' });

    expect(result).toEqual({ checkoutUrl: 'https://pay.provider.example/hosted/xyz', reused: false });
    const args = startCheckoutForInstallments.mock.calls[0][0];
    expect(args).toEqual({
      tenantId: TENANT_A,
      leaseId: 'lease-1',
      renterClientId: 'renter-secret-id',
      installmentIds: ['inst-1'],
      actorUserId: 'user-agent',
      secureLinkId: 'link-1'
    });
    expect(args).not.toHaveProperty('amount');
    expect(secureLinkFindFirst.mock.calls[0][0].where).toEqual({ id: 'link-1', tenantId: TENANT_A });
  });

  it('journalise SECURE_LINK_PAYMENT_STARTED sans jeton ni URL', async () => {
    startCheckoutForInstallments.mockResolvedValueOnce({ checkout: checkoutDto(), reused: true, mode: 'SIMULATOR' });

    const result = await startInstallmentPaymentByToken(TOKEN, { ip: '1.2.3.4', userAgent: 'UA' });

    expect(result.reused).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_A,
      actionKey: 'SECURE_LINK_PAYMENT_STARTED',
      entityType: 'SecureLink',
      entityId: 'link-1',
      ipAddress: '1.2.3.4',
      userAgent: 'UA',
      payload: { linkId: 'link-1', installmentId: 'inst-1', checkoutId: 'checkout-1', amount: 105000, reused: true }
    });
    const logged = everythingLogged();
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('pay.provider.example');
  });

  it('refus uniforme : échéance soldée, bail terminé, config inutilisable, mauvaise portée', async () => {
    const errors: any[] = [];
    const attempt = async () => {
      try {
        await startInstallmentPaymentByToken(TOKEN, {});
        errors.push(null);
      } catch (error) {
        errors.push(error);
      }
    };
    installmentFindFirst.mockResolvedValueOnce(installment({ amount_paid: '165000' }));
    await attempt();
    installmentFindFirst.mockResolvedValueOnce(
      installment({ lease: { status: 'ENDED', primary_renter_client_id: 'r' } })
    );
    await attempt();
    loadConfig.mockResolvedValueOnce(null);
    await attempt();
    verifySecureLink.mockRejectedValueOnce(invalid());
    await attempt();
    verifySecureLink.mockResolvedValueOnce({ ...link, objectType: 'Other' });
    await attempt();

    for (const error of errors) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Lien invalide ou expiré.');
    }
    expect(startCheckoutForInstallments).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('409 (autre paiement en cours) et 502 (agrégateur) sont relayés tels quels ; BadRequest => refus uniforme', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    startCheckoutForInstallments.mockRejectedValueOnce(
      new AppError('Un paiement en ligne est déjà en cours pour cette échéance.', 409)
    );
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 409 });

    startCheckoutForInstallments.mockRejectedValueOnce(new AppError("l'agrégateur n'a pas répondu.", 502));
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 502 });

    startCheckoutForInstallments.mockRejectedValueOnce(
      new BadRequestError('Une échéance sélectionnée est déjà soldée.')
    );
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({
      statusCode: 404,
      message: 'Lien invalide ou expiré.'
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('pas de redirection ouverte : sans checkoutUrl fournisseur, refus uniforme (rien n’est construit)', async () => {
    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: null }),
      reused: false,
      mode: 'SIMULATOR'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it('URL fournisseur : http refusée en mode LIVE (502, sans l’URL dans le journal), https acceptée', async () => {
    const httpUrl = 'http://pay.provider.example/hosted/insecure';
    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: httpUrl }),
      reused: false,
      mode: 'LIVE'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 502 });
    expect(everythingLogged()).not.toContain('insecure');
    expect(logAuditEvent).not.toHaveBeenCalled();

    // Même règle à la reprise d'un checkout existant.
    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: httpUrl }),
      reused: true,
      mode: 'LIVE'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 502 });

    startCheckoutForInstallments.mockResolvedValueOnce({ checkout: checkoutDto(), reused: false, mode: 'LIVE' });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).resolves.toMatchObject({ reused: false });
  });

  it('URL fournisseur : refus des formes douteuses (schéma, identifiants, espaces, http distant même en simulateur)', async () => {
    const bad = [
      'javascript:alert(1)',
      'not a url',
      'ftp://x.example/p',
      'https://user:secret@pay.provider.example/p',
      ' https://pay.provider.example/p',
      'https://pay.provider.example/p ',
      'http://pay.provider.example/p'
    ];
    for (const checkoutUrl of bad) {
      startCheckoutForInstallments.mockResolvedValueOnce({
        checkout: checkoutDto({ checkoutUrl }),
        reused: false,
        mode: 'SIMULATOR'
      });
      await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 502 });
    }
    expect(everythingLogged()).not.toContain('secret');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('URL fournisseur : http local toléré en simulateur seulement, forme normalisée renvoyée', async () => {
    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: 'http://localhost:8001/api/payment-gateway/simulator/IMT-x' }),
      reused: false,
      mode: 'SIMULATOR'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).resolves.toEqual({
      checkoutUrl: 'http://localhost:8001/api/payment-gateway/simulator/IMT-x',
      reused: false
    });

    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: 'http://localhost:8001/p' }),
      reused: false,
      mode: 'LIVE'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).rejects.toMatchObject({ statusCode: 502 });

    startCheckoutForInstallments.mockResolvedValueOnce({
      checkout: checkoutDto({ checkoutUrl: 'HTTPS://Pay.Provider.Example' }),
      reused: false,
      mode: 'LIVE'
    });
    await expect(startInstallmentPaymentByToken(TOKEN, {})).resolves.toMatchObject({
      checkoutUrl: 'https://pay.provider.example/'
    });
  });
});

describe('côté agence', () => {
  it('création : échéance d’un autre tenant => NotFoundError identique à l’inexistant', async () => {
    installmentFindFirst.mockResolvedValueOnce(null);
    const foreign = await createInstallmentPaymentLink(TENANT_A, 'inst-of-tenant-b', 'user-1').catch(e => e);
    installmentFindFirst.mockResolvedValueOnce(null);
    const missing = await createInstallmentPaymentLink(TENANT_A, 'does-not-exist', 'user-1').catch(e => e);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(foreign.message).toBe(missing.message);
    expect(foreign.statusCode).toBe(missing.statusCode);
    expect(installmentFindFirst.mock.calls[0][0].where).toEqual({ id: 'inst-of-tenant-b', tenant_id: TENANT_A });
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('création : 400 si bail non actif, échéance annulée, soldée ou paiement en ligne indisponible', async () => {
    const cases: Array<[any, any]> = [
      [installment({ lease: { status: 'ENDED', primary_renter_client_id: 'r' } }), usableConfig],
      [installment({ status: 'CANCELED' }), usableConfig],
      [installment({ amount_paid: '165000' }), usableConfig],
      [installment(), null]
    ];
    for (const [inst, config] of cases) {
      installmentFindFirst.mockResolvedValueOnce(inst);
      loadConfig.mockResolvedValue(config);
      await expect(createInstallmentPaymentLink(TENANT_A, 'inst-1', 'user-1')).rejects.toBeInstanceOf(BadRequestError);
    }
    expect(createSecureLink).not.toHaveBeenCalled();
  });

  it('création : lien INSTALLMENT_PAYMENT sur RentalInstallment, contexte avec montant recalculé', async () => {
    installmentFindFirst.mockResolvedValueOnce(installment());
    const created = { id: 'link-9', token: TOKEN, expiresAt: new Date(), url: `https://app.example/payer#${TOKEN}` };
    createSecureLink.mockResolvedValueOnce(created);

    const result = await createInstallmentPaymentLink(TENANT_A, 'inst-1', 'user-1', { ttlDays: 3 });

    expect(createSecureLink).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      scope: 'INSTALLMENT_PAYMENT',
      objectType: 'RentalInstallment',
      objectId: 'inst-1',
      createdByUserId: 'user-1',
      ttlDays: 3
    });
    expect(result.link).toBe(created);
    expect(result.context).toMatchObject({
      installmentId: 'inst-1',
      leaseId: 'lease-1',
      amountDue: 105000,
      currency: 'FCFA',
      renterClientId: 'renter-secret-id',
      agencyName: 'Agence Alpha'
    });
  });

  it('liste : vérifie l’échéance par tenant, renvoie le dernier checkout de chaque lien, jamais le jeton', async () => {
    installmentFindFirst.mockResolvedValueOnce({ id: 'inst-1' });
    const base = {
      scope: 'INSTALLMENT_PAYMENT',
      objectType: 'RentalInstallment',
      objectId: 'inst-1',
      revokedAt: null,
      createdByUserId: 'user-1',
      viewCount: 2,
      lastViewedAt: new Date('2026-10-02T08:00:00.000Z'),
      status: 'ACTIVE'
    };
    listSecureLinks.mockResolvedValueOnce([
      {
        ...base,
        id: 'l1',
        createdAt: new Date('2026-10-01T08:00:00.000Z'),
        expiresAt: new Date('2026-10-08T08:00:00.000Z')
      },
      {
        ...base,
        id: 'l2',
        lastViewedAt: null,
        createdAt: new Date('2026-09-20T08:00:00.000Z'),
        expiresAt: new Date('2026-09-27T08:00:00.000Z'),
        status: 'EXPIRED'
      }
    ]);
    checkoutFindMany.mockResolvedValueOnce([
      { secureLinkId: 'l1', status: 'SUCCESS', amount: '105000', updatedAt: new Date('2026-10-03T08:00:00.000Z') },
      { secureLinkId: 'l1', status: 'FAILED', amount: '105000', updatedAt: new Date('2026-10-02T09:00:00.000Z') }
    ]);

    const list = await listInstallmentPaymentLinks(TENANT_A, 'inst-1');

    expect(listSecureLinks).toHaveBeenCalledWith(TENANT_A, {
      scope: 'INSTALLMENT_PAYMENT',
      objectType: 'RentalInstallment',
      objectId: 'inst-1'
    });
    expect(checkoutFindMany.mock.calls[0][0].where).toEqual({ tenantId: TENANT_A, secureLinkId: { in: ['l1', 'l2'] } });
    expect(list[0].payment).toEqual({ status: 'SUCCESS', amount: 105000, updatedAt: '2026-10-03T08:00:00.000Z' });
    expect(list[1].payment).toEqual({ status: 'NONE', amount: null, updatedAt: null });
    expect(list[1].status).toBe('EXPIRED');
    for (const forbidden of ['token', 'Hash', 'url']) {
      expect(JSON.stringify(list)).not.toContain(forbidden);
    }
  });

  it('liste / révocation : échéance d’un autre tenant => NotFoundError ; révocation bornée à l’objet', async () => {
    installmentFindFirst.mockResolvedValueOnce(null);
    await expect(listInstallmentPaymentLinks(TENANT_A, 'foreign')).rejects.toBeInstanceOf(NotFoundError);
    installmentFindFirst.mockResolvedValueOnce(null);
    await expect(revokeInstallmentPaymentLink(TENANT_A, 'foreign', 'l1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(revokeSecureLink).not.toHaveBeenCalled();

    installmentFindFirst.mockResolvedValueOnce({ id: 'inst-1' });
    await revokeInstallmentPaymentLink(TENANT_A, 'inst-1', 'l1', 'user-1');
    expect(revokeSecureLink).toHaveBeenCalledWith(TENANT_A, 'l1', 'user-1', {
      objectType: 'RentalInstallment',
      objectId: 'inst-1'
    });
  });
});

describe('getInstallmentPaymentStatusByCode', () => {
  const checkoutRow = (overrides: Record<string, any> = {}) => ({
    id: 'checkout-1',
    status: 'SUCCESS',
    amount: '105000',
    currency: 'FCFA',
    installmentIds: ['inst-1'],
    lastCheckedAt: new Date(),
    tenant: { name: 'Agence Alpha' },
    ...overrides
  });

  function seed(row: any) {
    checkoutFindFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 'checkout-1', tenantId: TENANT_A })
      .mockResolvedValueOnce(row);
    installmentFindFirst.mockResolvedValue({ period_year: 2026, period_month: 10 });
  }

  it('ne sert que les checkouts issus d’un lien, d’une agence active ; sinon 404 uniforme', async () => {
    checkoutFindFirst.mockReset().mockResolvedValue(null);

    // Code inconnu, checkout du portail (secureLinkId nul), agence suspendue : le filtre ne trouve rien.
    await expect(getInstallmentPaymentStatusByCode(CODE)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Lien invalide ou expiré.'
    });
    expect(checkoutFindFirst.mock.calls[0][0].where).toEqual({
      codePaiement: CODE,
      secureLinkId: { not: null },
      tenant: { isActive: true, status: { not: 'SUSPENDED' } }
    });

    // Forme invalide : refus avant toute lecture.
    checkoutFindFirst.mockClear();
    for (const bad of ['', 'IMT-short', 'x'.repeat(40), "IMT-abcdefghij0123456789'--"]) {
      await expect(getInstallmentPaymentStatusByCode(bad)).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(checkoutFindFirst).not.toHaveBeenCalled();
  });

  it('renvoie un DTO minimal sans fuite sur le locataire', async () => {
    seed(checkoutRow());

    const dto = await getInstallmentPaymentStatusByCode(CODE);

    expect(dto).toEqual({
      status: 'SUCCESS',
      amount: 105000,
      currency: 'FCFA',
      agencyName: 'Agence Alpha',
      periodYear: 2026,
      periodMonth: 10
    });
    expect(reconcileCheckout).not.toHaveBeenCalled();
  });

  it('REVIEW => PENDING et EXPIRED => CANCELED pour le public', async () => {
    seed(checkoutRow({ status: 'REVIEW' }));
    await expect(getInstallmentPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'PENDING' });
    seed(checkoutRow({ status: 'EXPIRED' }));
    await expect(getInstallmentPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'CANCELED' });
    seed(checkoutRow({ status: 'FAILED' }));
    await expect(getInstallmentPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'FAILED' });
  });

  it('PENDING : réservation atomique puis réconciliation dans le contexte de l’agence', async () => {
    seed(checkoutRow({ status: 'PENDING', lastCheckedAt: new Date(Date.now() - 30_000) }));
    checkoutUpdateMany.mockResolvedValueOnce({ count: 1 });
    let seenContext: string | undefined;
    reconcileCheckout.mockImplementationOnce(async () => {
      seenContext = getTenantContext()?.tenantId;
      return { status: 'SUCCESS' };
    });

    const dto = await getInstallmentPaymentStatusByCode(CODE);

    const claim = checkoutUpdateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: 'checkout-1', tenantId: TENANT_A, status: 'PENDING' });
    expect(claim.where.OR).toEqual([{ lastCheckedAt: null }, { lastCheckedAt: { lt: expect.any(Date) } }]);
    // La réservation ne touche que lastCheckedAt (jamais le statut) : reconcileCheckout fonctionne ensuite.
    expect(Object.keys(claim.data)).toEqual(['lastCheckedAt']);
    expect(reconcileCheckout).toHaveBeenCalledWith(TENANT_A, 'checkout-1');
    expect(seenContext).toBe(TENANT_A);
    expect(dto.status).toBe('SUCCESS');
  });

  it('requête concurrente (réservation perdue, count 0) : pas de réconciliation, état stocké', async () => {
    seed(checkoutRow({ status: 'PENDING', lastCheckedAt: new Date(Date.now() - 2_000) }));
    checkoutUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(getInstallmentPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'PENDING' });
    expect(reconcileCheckout).not.toHaveBeenCalled();
  });

  it('un statut déjà conclu ne tente aucune réservation', async () => {
    seed(checkoutRow({ status: 'SUCCESS' }));
    await getInstallmentPaymentStatusByCode(CODE);
    expect(checkoutUpdateMany).not.toHaveBeenCalled();
  });

  it('fournisseur injoignable : l’erreur est avalée, l’état stocké est renvoyé, rien de sensible journalisé', async () => {
    seed(checkoutRow({ status: 'PENDING', lastCheckedAt: null }));
    checkoutUpdateMany.mockResolvedValueOnce({ count: 1 });
    reconcileCheckout.mockRejectedValueOnce(new Error(`timeout ${CODE}`));

    await expect(getInstallmentPaymentStatusByCode(CODE)).resolves.toMatchObject({ status: 'PENDING' });
    expect(everythingLogged()).not.toContain(CODE);
  });
});
