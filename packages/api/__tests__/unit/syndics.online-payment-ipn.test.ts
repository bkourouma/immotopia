/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2 — aiguillage « IMS- » de l'IPN, du simulateur (page, boutons,
 * `getStatus`) et des codes de paiement, sans casser « IMT- » ni « IMP- » ;
 * garde-fou d'architecture (le moteur Syndic ne lit jamais le compte de l'agence).
 */

import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { env } from '../../src/config/env';

const mockPrisma = {
  syndicOnlineCheckout: { findFirst: jest.fn() },
  onlinePaymentCheckout: { findFirst: jest.fn() },
  platformPaymentCheckout: { findFirst: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(),
  allocatePaymentTx: jest.fn()
}));
jest.mock('../../src/lib/treasury/accounts', () => ({ ensureChartAccountTx: jest.fn() }));
jest.mock('../../src/services/platform-payment-service', () => ({
  findPlatformSimulatorCheckout: jest.fn(),
  reconcilePlatformCheckoutPublic: jest.fn(),
  recordPlatformSimulatedOutcome: jest.fn()
}));
jest.mock('../../src/lib/payment-gateway/platform-account', () => ({ platformReturnUrl: jest.fn() }));

const reconcileCheckoutPublic = jest.fn();
const findSimulatorCheckout = jest.fn();
const recordSimulatedOutcome = jest.fn();
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  ...jest.requireActual('../../src/lib/payment-gateway/checkout'),
  reconcileCheckoutPublic: (...a: any[]) => reconcileCheckoutPublic(...a),
  findSimulatorCheckout: (...a: any[]) => findSimulatorCheckout(...a),
  recordSimulatedOutcome: (...a: any[]) => recordSimulatedOutcome(...a)
}));

const reconcileSyndicCheckoutPublic = jest.fn();
const findSyndicSimulatorCheckout = jest.fn();
const recordSyndicSimulatedOutcome = jest.fn();
jest.mock('../../src/lib/syndics/online-payment/checkout-reconcile', () => ({
  reconcileSyndicCheckoutPublic: (...a: any[]) => reconcileSyndicCheckoutPublic(...a),
  findSyndicSimulatorCheckout: (...a: any[]) => findSyndicSimulatorCheckout(...a),
  recordSyndicSimulatedOutcome: (...a: any[]) => recordSyndicSimulatedOutcome(...a)
}));

import {
  paysecurehubIpnHandler,
  simulatorActionHandler,
  simulatorPageHandler
} from '../../src/controllers/payment-gateway-public-controller';
import { simulatorClient } from '../../src/lib/payment-gateway/paysecurehub/simulator-client';
import {
  PLATFORM_CODE_PREFIX,
  RENTAL_CODE_PREFIX,
  SYNDIC_CODE_PREFIX,
  generateSyndicCodePaiement,
  isPlatformCodePaiement,
  isSyndicCodePaiement
} from '../../src/lib/payment-gateway/codes';

const SYNDIC = 'IMS-abcdefghij0123456789';
const RENTAL = 'IMT-abcdefghij0123456789';
const PLATFORM = 'IMP-abcdefghij0123456789';
const base = env.FRONTEND_URL.replace(/\/$/, '');

function run(
  handler: any,
  req: Partial<Request>
): Promise<{ status?: number; url?: string; body?: any; html?: string }> {
  return new Promise((resolve, reject) => {
    const out: any = {};
    const res: any = {
      status: (code: number) => {
        out.status = code;
        return res;
      },
      json: (body: unknown) => {
        out.body = body;
        resolve(out);
      },
      redirect: (status: number, url: string) => resolve({ status, url }),
      setHeader: jest.fn(),
      type: () => res,
      send: (html: string) => {
        out.html = html;
        resolve(out);
      }
    };
    handler({ params: {}, body: {}, ...req } as Request, res as Response, (error?: unknown) =>
      error ? reject(error) : undefined
    );
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  reconcileCheckoutPublic.mockResolvedValue(null);
  reconcileSyndicCheckoutPublic.mockResolvedValue(null);
  recordSyndicSimulatedOutcome.mockResolvedValue(undefined);
  recordSimulatedOutcome.mockResolvedValue(undefined);
});

describe('IPN PaySecureHub : aiguillage par préfixe', () => {
  it('« IMS- » va au moteur Syndic, jamais à celui des loyers', async () => {
    const result = await run(paysecurehubIpnHandler, { body: { codePaiement: SYNDIC } });

    expect(result).toMatchObject({ status: 200, body: { received: true } });
    expect(reconcileSyndicCheckoutPublic).toHaveBeenCalledWith(SYNDIC);
    expect(reconcileCheckoutPublic).not.toHaveBeenCalled();
  });

  it('« IMT- » reste aux loyers, sans toucher au moteur Syndic (non-régression)', async () => {
    await run(paysecurehubIpnHandler, { body: { codePaiement: RENTAL } });

    expect(reconcileCheckoutPublic).toHaveBeenCalledWith(RENTAL);
    expect(reconcileSyndicCheckoutPublic).not.toHaveBeenCalled();
  });

  it('un code inconnu ou mal formé ne va pas au moteur Syndic', async () => {
    await run(paysecurehubIpnHandler, { body: { codePaiement: 'IMS-trop-court' } });
    expect(reconcileSyndicCheckoutPublic).not.toHaveBeenCalled();
  });

  it('répond toujours 200 : un échec du moteur (fournisseur injoignable) ne remonte pas', async () => {
    reconcileSyndicCheckoutPublic.mockRejectedValue(new Error('timeout'));

    await expect(run(paysecurehubIpnHandler, { body: { codePaiement: SYNDIC } })).resolves.toMatchObject({
      status: 200,
      body: { received: true }
    });
  });

  it('le corps de l’IPN n’est jamais cru : seul le code est lu', async () => {
    await run(paysecurehubIpnHandler, { body: { codePaiement: SYNDIC, state: 'SUCCESSFUL', montant: 1 } });
    expect(reconcileSyndicCheckoutPublic).toHaveBeenCalledTimes(1);
    expect(reconcileSyndicCheckoutPublic.mock.calls[0]).toEqual([SYNDIC]);
  });
});

describe('simulateur : codes « IMS- »', () => {
  it('la page affiche le montant et le code de la tentative Syndic', async () => {
    findSyndicSimulatorCheckout.mockResolvedValue({
      codePaiement: SYNDIC,
      amount: 45000,
      tenantId: 't1',
      origin: 'PORTAL'
    });

    const { html } = await run(simulatorPageHandler, { params: { codePaiement: SYNDIC } as any });

    expect(html).toContain(SYNDIC);
    expect(html).toContain('FCFA');
    expect(findSimulatorCheckout).not.toHaveBeenCalled();
  });

  it('code Syndic inconnu (ou copropriété en LIVE) : 404, comme un code quelconque', async () => {
    findSyndicSimulatorCheckout.mockResolvedValue(null);
    await expect(run(simulatorPageHandler, { params: { codePaiement: SYNDIC } as any })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      run(simulatorActionHandler, { params: { codePaiement: SYNDIC, outcome: 'success' } as any })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(recordSyndicSimulatedOutcome).not.toHaveBeenCalled();
  });

  it('bouton « Payer » du portail : enregistre l’issue, rapproche, redirige vers le portail', async () => {
    findSyndicSimulatorCheckout.mockResolvedValue({ codePaiement: SYNDIC, tenantId: 't1', origin: 'PORTAL' });

    const result = await run(simulatorActionHandler, { params: { codePaiement: SYNDIC, outcome: 'success' } as any });

    expect(result).toEqual({ status: 303, url: `${base}/copropriete/appels?paiement=${SYNDIC}` });
    expect(recordSyndicSimulatedOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ codePaiement: SYNDIC }),
      'SUCCESS'
    );
    expect(reconcileSyndicCheckoutPublic).toHaveBeenCalledWith(SYNDIC);
    expect(reconcileCheckoutPublic).not.toHaveBeenCalled();
  });

  it('tentative issue d’un lien : retour sur la page publique de statut, sans jeton', async () => {
    findSyndicSimulatorCheckout.mockResolvedValue({ codePaiement: SYNDIC, tenantId: 't1', origin: 'SECURE_LINK' });

    const result = await run(simulatorActionHandler, { params: { codePaiement: SYNDIC, outcome: 'canceled' } as any });

    expect(result).toEqual({ status: 303, url: `${base}/payer-charges/statut?paiement=${SYNDIC}` });
    expect(result.url).not.toContain('#');
    expect(recordSyndicSimulatedOutcome).toHaveBeenCalledWith(expect.anything(), 'CANCELED');
  });

  it('un échec du rapprochement n’empêche pas la redirection', async () => {
    findSyndicSimulatorCheckout.mockResolvedValue({ codePaiement: SYNDIC, tenantId: 't1', origin: 'PORTAL' });
    reconcileSyndicCheckoutPublic.mockRejectedValue(new Error('réseau'));

    await expect(
      run(simulatorActionHandler, { params: { codePaiement: SYNDIC, outcome: 'failed' } as any })
    ).resolves.toMatchObject({ status: 303 });
  });

  it('« IMT- » : toujours le chemin des loyers (non-régression)', async () => {
    findSimulatorCheckout.mockResolvedValue({ codePaiement: RENTAL, tenantId: 't1', secureLinkId: null });

    const result = await run(simulatorActionHandler, { params: { codePaiement: RENTAL, outcome: 'success' } as any });

    expect(result.url).toBe(`${base}/tenant/payments?paiement=${RENTAL}`);
    expect(findSyndicSimulatorCheckout).not.toHaveBeenCalled();
    expect(recordSyndicSimulatedOutcome).not.toHaveBeenCalled();
  });
});

describe('simulateur : getStatus', () => {
  const credentials = { tenantId: 'tenant-1', merchantId: '', apiKey: '', baseUrl: 'x', timeoutMs: 1 };

  it('« IMS- » lit la tentative Syndic de l’agence des identifiants et suit l’issue choisie', async () => {
    mockPrisma.syndicOnlineCheckout.findFirst.mockResolvedValue({ simulatedOutcome: 'SUCCESS', amount: 45000 });

    const status = await simulatorClient.getStatus(credentials, SYNDIC);

    expect(mockPrisma.syndicOnlineCheckout.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codePaiement: SYNDIC, tenantId: 'tenant-1' } })
    );
    expect(status).toMatchObject({ mappedState: 'SUCCESS', amount: 45000, transactionId: `SIM-${SYNDIC}` });
    expect(mockPrisma.onlinePaymentCheckout.findFirst).not.toHaveBeenCalled();
  });

  it('sans choix du payeur : en attente', async () => {
    mockPrisma.syndicOnlineCheckout.findFirst.mockResolvedValue({ simulatedOutcome: null, amount: 45000 });
    await expect(simulatorClient.getStatus(credentials, SYNDIC)).resolves.toMatchObject({ mappedState: 'PENDING' });
  });

  it('un code d’une autre agence est introuvable : montant et transaction absents', async () => {
    mockPrisma.syndicOnlineCheckout.findFirst.mockResolvedValue(null);
    await expect(simulatorClient.getStatus(credentials, SYNDIC)).resolves.toMatchObject({
      amount: null,
      transactionId: null
    });
  });

  it('« IMT- » et « IMP- » gardent leurs tables (non-régression)', async () => {
    mockPrisma.onlinePaymentCheckout.findFirst.mockResolvedValue({ simulatedOutcome: 'FAILED', amount: 1 });
    mockPrisma.platformPaymentCheckout.findFirst.mockResolvedValue({ simulatedOutcome: 'CANCELED', amount: 2 });

    await expect(simulatorClient.getStatus(credentials, RENTAL)).resolves.toMatchObject({ mappedState: 'FAILED' });
    await expect(simulatorClient.getStatus(credentials, PLATFORM)).resolves.toMatchObject({ mappedState: 'CANCELED' });
    expect(mockPrisma.syndicOnlineCheckout.findFirst).not.toHaveBeenCalled();
  });
});

describe('codes de paiement', () => {
  it('« IMS- » + 20 caractères, imprévisible et distinct des autres préfixes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateSyndicCodePaiement()));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^IMS-[A-Za-z0-9]{20}$/);
      expect(isSyndicCodePaiement(code)).toBe(true);
      expect(isPlatformCodePaiement(code)).toBe(false);
    }
    expect(SYNDIC_CODE_PREFIX).toBe('IMS-');
    expect(new Set([SYNDIC_CODE_PREFIX, RENTAL_CODE_PREFIX, PLATFORM_CODE_PREFIX]).size).toBe(3);
  });

  it('l’aiguillage est strict', () => {
    expect(isSyndicCodePaiement(RENTAL)).toBe(false);
    expect(isSyndicCodePaiement(PLATFORM)).toBe(false);
    expect(isSyndicCodePaiement('IMS-court')).toBe(false);
    expect(isSyndicCodePaiement('IMS-abcdefghij0123456789X')).toBe(false);
    expect(isSyndicCodePaiement('IMS-abcdefghij012345678!')).toBe(false);
    expect(isSyndicCodePaiement('xIMS-abcdefghij0123456789')).toBe(false);
    expect(isSyndicCodePaiement(null)).toBe(false);
    expect(isSyndicCodePaiement(undefined)).toBe(false);
    expect(isSyndicCodePaiement('')).toBe(false);
  });
});

/** Les commentaires expliquent l'interdit : on ne contrôle que le code. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('architecture : le moteur Syndic ne lit jamais le compte marchand de l’agence (R4)', () => {
  const dir = path.join(__dirname, '../../src/lib/syndics/online-payment');
  const extra = [
    path.join(__dirname, '../../src/controllers/payment-gateway-public-controller.ts'),
    path.join(__dirname, '../../src/jobs/online-payment-reconciliation-job.ts')
  ];
  const files = fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.ts'))
    .map(name => path.join(dir, name));

  it('le dossier du moteur existe et contient les modules attendus', () => {
    const names = files.map(file => path.basename(file));
    for (const expected of [
      'types.ts',
      'gateway-config.ts',
      'feature-gate.ts',
      'checkout-start.ts',
      'checkout-reconcile.ts',
      'checkout-settle.ts',
      'checkout-review.ts',
      'checkout-queries.ts'
    ]) {
      expect(names).toContain(expected);
    }
  });

  it.each(files.map(file => [path.basename(file), file]))(
    '%s : ni loadConfig, ni isConfigUsable, ni credentialsFrom de l’agence',
    (_n, file) => {
      const source = withoutComments(fs.readFileSync(file as string, 'utf8'));
      expect(source).not.toMatch(/\bloadConfig\b/);
      expect(source).not.toMatch(/\bisConfigUsable\b/);
      expect(source).not.toMatch(/\bcredentialsFrom\b/);
      expect(source).not.toMatch(/\bensureCollectionAccountTx\b/);
      expect(source).not.toMatch(/prisma\.paymentGatewayConfig\.findUnique/);
      expect(source).not.toMatch(/include:\s*\{\s*user:\s*true/);
    }
  );

  it('seule la lecture de feesPaidBy touche la configuration de l’agence', () => {
    const offenders = files.filter(file =>
      /paymentGatewayConfig\./.test(withoutComments(fs.readFileSync(file, 'utf8')))
    );
    expect(offenders.map(file => path.basename(file))).toEqual(['gateway-config.ts']);
    const source = fs.readFileSync(path.join(dir, 'gateway-config.ts'), 'utf8');
    expect(source).toMatch(/paymentGatewayConfig\.findFirst\([\s\S]*?select:\s*\{\s*feesPaidBy:\s*true/);
  });

  it('aucune clé ni charge utile brute dans une charge utile d’audit ou un DTO', () => {
    for (const file of [...files, ...extra]) {
      const source = fs.readFileSync(file, 'utf8');
      const audits = source.match(/logAuditEvent\(\{[\s\S]*?\n\s*\}\);/g) ?? [];
      for (const call of audits) {
        expect(call).not.toMatch(
          /\bapiKey\b|apiKeyEncrypted|apiKeyLast4|providerToken|lastProviderPayload|checkoutUrl/
        );
      }
    }
    const queries = fs.readFileSync(path.join(dir, 'checkout-queries.ts'), 'utf8');
    expect(queries).not.toMatch(/apiKey|providerToken|lastProviderPayload/);
  });
});
