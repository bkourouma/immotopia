/**
 * Tests de l'analyseur d'arguments et du routage de `scripts/provision-subscription.ts`.
 * Le service metier a ses propres tests (subscription-provisioning-service.test.ts) :
 * ici on teste l'analyse de la ligne de commande (aucun acces base), et le
 * routage de `run()` avec le service simule.
 *
 * `export {}` : sans import/export au sommet, TypeScript traite ce fichier
 * comme un script global plutot qu'un module -- son `type Row` local
 * entrerait alors en collision avec celui, identique mais distinct, de
 * `subscription-provisioning-service.test.ts` (meme probleme, meme correctif).
 */
export {};

type Row = Record<string, any>;

const FAKE_ENTITLEMENTS_NOW: Row = {
  status: 'NONE',
  phase: 'NONE',
  modules: [],
  capacities: {},
  quotaPolicy: 'BILL_OVERAGE'
};

const provisionSubscriptionMock = jest.fn();
const suspendTenantActionMock = jest.fn();
const listTenantsMock = jest.fn(async (..._args: unknown[]) => []);

jest.mock('../../src/services/subscription-provisioning-service', () => {
  const actual = jest.requireActual('../../src/services/subscription-provisioning-service');
  return {
    ...actual,
    provisionSubscription: (...args: unknown[]) => provisionSubscriptionMock(...args),
    suspendTenantAction: (...args: unknown[]) => suspendTenantActionMock(...args),
    listTenants: (...args: unknown[]) => listTenantsMock(...args)
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseArgs, run, CliUsageError } = require('../../src/scripts/provision-subscription');

beforeEach(() => {
  provisionSubscriptionMock.mockReset();
  suspendTenantActionMock.mockReset();
  listTenantsMock.mockClear();
});

describe('parseArgs', () => {
  it('accepte --cle=valeur', () => {
    const { options } = parseArgs(['--a=b']);
    expect(options.a).toBe('b');
  });

  it('accepte --cle valeur', () => {
    const { options } = parseArgs(['--a', 'b']);
    expect(options.a).toBe('b');
  });

  it('accepte --items AGENCE,SYNDIC,EXT_COPRO:2', () => {
    const { options } = parseArgs(['--items', 'AGENCE,SYNDIC,EXT_COPRO:2']);
    expect(options.items).toBe('AGENCE,SYNDIC,EXT_COPRO:2');
  });

  it('traite un drapeau sans valeur comme booleen', () => {
    const { options } = parseArgs(['--dry-run']);
    expect(options['dry-run']).toBe(true);
  });

  it('garde les positionnels dans l’ordre', () => {
    const { positional, options } = parseArgs(['provision', '--tenant', 'abc', '--dry-run']);
    expect(positional).toEqual(['provision']);
    expect(options.tenant).toBe('abc');
    expect(options['dry-run']).toBe(true);
  });

  it('ne consomme pas un token --suivant comme valeur (drapeau puis option)', () => {
    const { options } = parseArgs(['--setup-waived', '--tenant', 'abc']);
    expect(options['setup-waived']).toBe(true);
    expect(options.tenant).toBe('abc');
  });

  it('--dry-run, --setup-waived, --help ne consomment jamais le token suivant, meme s’il ne commence pas par --', () => {
    const { options: a } = parseArgs(['--dry-run', 'provision']);
    expect(a['dry-run']).toBe(true);
    const { options: b } = parseArgs(['--setup-waived', 'AGENCE']);
    expect(b['setup-waived']).toBe(true);
    const { options: c } = parseArgs(['--help', 'provision']);
    expect(c.help).toBe(true);
  });

  it('accepte --dry-run=true et --setup-waived=true', () => {
    expect(parseArgs(['--dry-run=true']).options['dry-run']).toBe(true);
    expect(parseArgs(['--setup-waived=true']).options['setup-waived']).toBe(true);
  });

  it('refuse --dry-run=<valeur> et --setup-waived=<valeur> sauf =true', () => {
    expect(() => parseArgs(['--dry-run=false'])).toThrow(CliUsageError);
    expect(() => parseArgs(['--setup-waived=false'])).toThrow(CliUsageError);
    expect(() => parseArgs(['--dry-run=1'])).toThrow(CliUsageError);
  });

  it('refuse une option a valeur sans valeur', () => {
    expect(() => parseArgs(['--tenant'])).toThrow(CliUsageError);
    expect(() => parseArgs(['--tenant', '--dry-run'])).toThrow(CliUsageError);
  });

  it('refuse une option repetee', () => {
    expect(() => parseArgs(['--tenant', 'a', '--tenant', 'b'])).toThrow(CliUsageError);
    expect(() => parseArgs(['--dry-run', '--dry-run'])).toThrow(CliUsageError);
  });
});

describe('run — routage et codes de sortie', () => {
  it('refuse un argument positionnel en trop apres l’action', async () => {
    await expect(run(['provision', 'extra', '--tenant', 'a', '--items', 'AGENCE'])).rejects.toThrow(CliUsageError);
  });

  it('provision --dry-run : code 0 si wouldDo !== refused, 2 si refused (ex. agence SUSPENDUE)', async () => {
    provisionSubscriptionMock.mockResolvedValueOnce({
      outcome: 'dry-run',
      wouldDo: 'create',
      tenant: { id: 't1', slug: 't1', name: 'T1', status: 'ACTIVE' },
      plannedItems: [],
      quotaPolicy: 'BILL_OVERAGE',
      billingCycle: 'MONTHLY',
      trialEndsAt: new Date('2026-10-28T00:00:00.000Z'),
      setupWaived: false,
      subscriptionStatus: 'TRIALING',
      now: new Date('2026-09-28T09:00:00.000Z'),
      before: {
        subscription: null,
        entitlementsNow: FAKE_ENTITLEMENTS_NOW,
        lotRegistry: { qualifying: 0, openActivations: 0 }
      },
      refusalReasons: [],
      reconciliationPreview: null,
      after: null,
      warnings: []
    } as Row);
    const okCode = await run(['provision', '--tenant', 't1', '--items', 'AGENCE', '--dry-run']);
    expect(okCode).toBe(0);

    provisionSubscriptionMock.mockResolvedValueOnce({
      outcome: 'dry-run',
      wouldDo: 'refused',
      tenant: { id: 't2', slug: 't2', name: 'T2', status: 'SUSPENDED' },
      plannedItems: [],
      quotaPolicy: 'BILL_OVERAGE',
      billingCycle: 'MONTHLY',
      trialEndsAt: new Date('2026-10-28T00:00:00.000Z'),
      setupWaived: false,
      subscriptionStatus: 'TRIALING',
      now: new Date('2026-09-28T09:00:00.000Z'),
      before: {
        subscription: null,
        entitlementsNow: FAKE_ENTITLEMENTS_NOW,
        lotRegistry: { qualifying: 0, openActivations: 0 }
      },
      refusalReasons: ['Agence SUSPENDUE : le provisionnement est refusé.'],
      reconciliationPreview: null,
      after: null,
      warnings: []
    } as Row);
    const refusedCode = await run(['provision', '--tenant', 't2', '--items', 'AGENCE', '--dry-run']);
    expect(refusedCode).toBe(2);
  });

  it('suspend --dry-run : code 0', async () => {
    suspendTenantActionMock.mockResolvedValueOnce({
      outcome: 'dry-run',
      tenant: { id: 't1', slug: 't1', name: 'T1', status: 'ACTIVE' },
      before: { status: 'ACTIVE', isActive: true, activeMemberCount: 0, subscriptionStatus: null },
      wouldDo: 'suspend',
      warnings: []
    } as Row);
    const code = await run(['suspend', '--tenant', 't1', '--dry-run']);
    expect(code).toBe(0);
  });
});
