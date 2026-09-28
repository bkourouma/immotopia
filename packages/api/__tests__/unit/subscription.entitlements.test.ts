/**
 * Abonnements par packs — droits (lib/subscription/entitlements.ts,
 * features.ts, catalog.ts, guards.ts). Pur, sauf guards (configuration).
 */

import {
  DEFAULT_CATALOG,
  EntitlementItem,
  EntitlementOverride,
  MODULE_FEATURES,
  ModuleRow,
  PACK,
  TenantEntitlements,
  assertModuleAccess,
  assertSubscriptionWritable,
  assertThirdPartyManagementAllowed,
  buildEntitlements,
  checkQuota,
  computeCapacityLimits,
  effectiveItems,
  evaluateQuota,
  featuresForModules,
  isItemEffective,
  isOwnAssetsOnly,
  modulesForFeature,
  packModules,
  packsForModules,
  resolveModuleAccess,
  resolveSubscriptionPhase,
  validateExclusivity
} from '../../src/lib/subscription';

const NOW = new Date('2026-09-25T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

function item(code: string, overrides: Partial<EntitlementItem> = {}): EntitlementItem {
  const def = DEFAULT_CATALOG.find(d => d.code === code)!;
  return {
    code,
    kind: def.kind,
    quantity: 1,
    status: 'ACTIVE',
    startsAt: days(-10),
    endsAt: null,
    modules: def.modules,
    exclusiveGroup: def.exclusiveGroup,
    tierGroup: def.rules?.tierGroup ?? null,
    capacities: def.capacities,
    ...overrides
  };
}

function override(
  o: Partial<EntitlementOverride> & Pick<EntitlementOverride, 'capacityKey' | 'delta'>
): EntitlementOverride {
  return { startsAt: days(-1), expiresAt: null, revokedAt: null, ...o };
}

describe('Fonctionnalites par module', () => {
  it('table de verite : CORE pour tous ; CRM/SALES Agence+Promoteur ; RENTAL Agence+Patrimoine ; PATRIMOINE Agence+Promoteur+Patrimoine ; SYNDIC ; CONSTRUCTION', () => {
    expect(modulesForFeature('CORE').sort()).toEqual([
      'MODULE_AGENCY',
      'MODULE_PATRIMOINE',
      'MODULE_PROMOTER',
      'MODULE_SYNDIC'
    ]);
    expect(modulesForFeature('CRM').sort()).toEqual(['MODULE_AGENCY', 'MODULE_PROMOTER']);
    expect(modulesForFeature('SALES').sort()).toEqual(['MODULE_AGENCY', 'MODULE_PROMOTER']);
    expect(modulesForFeature('RENTAL').sort()).toEqual(['MODULE_AGENCY', 'MODULE_PATRIMOINE']);
    expect(modulesForFeature('PATRIMOINE').sort()).toEqual(['MODULE_AGENCY', 'MODULE_PATRIMOINE', 'MODULE_PROMOTER']);
    expect(modulesForFeature('SYNDIC')).toEqual(['MODULE_SYNDIC']);
    expect(modulesForFeature('CONSTRUCTION')).toEqual(['MODULE_PROMOTER']);
    expect(Object.keys(MODULE_FEATURES).sort()).toEqual([
      'MODULE_AGENCY',
      'MODULE_PATRIMOINE',
      'MODULE_PROMOTER',
      'MODULE_SYNDIC'
    ]);
  });

  it('union des fonctionnalites, sans doublon', () => {
    expect(featuresForModules(['MODULE_SYNDIC'])).toEqual(['CORE', 'SYNDIC']);
    expect(featuresForModules(['MODULE_SYNDIC', 'MODULE_PROMOTER'])).toEqual([
      'CORE',
      'CRM',
      'SALES',
      'PATRIMOINE',
      'SYNDIC',
      'CONSTRUCTION'
    ]);
    expect(featuresForModules([])).toEqual([]);
  });
});

describe('Reprise : packs deduits des modules', () => {
  it.each([
    [['MODULE_AGENCY'], ['AGENCE'], false],
    [['MODULE_SYNDIC'], ['SYNDIC'], false],
    [['MODULE_PROMOTER'], ['PROMOTEUR'], false],
    [['MODULE_SYNDIC', 'MODULE_AGENCY'], ['AGENCE', 'SYNDIC'], false],
    [['MODULE_PROMOTER', 'MODULE_AGENCY'], ['AGENCE', 'PROMOTEUR'], false],
    [['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER'], ['INTEGRE'], false],
    [[], ['AGENCE'], true]
  ])('%j -> %j (a revoir : %s)', (modules, packs, toReview) => {
    expect(packsForModules(modules)).toEqual({ packs, toReview });
  });
});

describe('Modules et exclusivite', () => {
  it('modules = union des packs en vigueur', () => {
    expect(packModules([item(PACK.AGENCE), item(PACK.SYNDIC), item('EXT_LOTS_10')])).toEqual([
      'MODULE_AGENCY',
      'MODULE_SYNDIC'
    ]);
    expect(packModules([item(PACK.INTEGRE)])).toEqual(['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER']);
  });

  it("l'Integre exclut Agence, Syndic et Promoteur ; les trois se combinent librement", () => {
    expect(validateExclusivity([item(PACK.AGENCE), item(PACK.SYNDIC), item(PACK.PROMOTEUR)]).ok).toBe(true);
    const clash = validateExclusivity([item(PACK.INTEGRE), item(PACK.AGENCE), item('EXT_LOTS_10')]);
    expect(clash.ok).toBe(false);
    expect(clash.conflicts).toEqual([['INTEGRE', 'AGENCE']]);
    expect(validateExclusivity([item(PACK.AGENCE), item(PACK.INTEGRE)]).conflicts).toEqual([['INTEGRE', 'AGENCE']]);
    expect(validateExclusivity([item(PACK.INTEGRE), item('EXT_CHANTIER')]).ok).toBe(true);
  });

  it('un meme pack deux fois est refuse', () => {
    const r = validateExclusivity([item(PACK.AGENCE), item(PACK.AGENCE)]);
    expect(r.ok).toBe(false);
    expect(r.duplicates).toEqual(['AGENCE']);
  });

  it('Patrimoine Essentiel et Pro (meme tierGroup) ne se cumulent pas ; se combinent librement avec Agence et Promoteur', () => {
    const clash = validateExclusivity([item(PACK.PATRIMOINE_ESSENTIEL), item(PACK.PATRIMOINE_PRO)]);
    expect(clash.ok).toBe(false);
    expect(clash.conflicts).toEqual([[PACK.PATRIMOINE_ESSENTIEL, PACK.PATRIMOINE_PRO]]);
    expect(validateExclusivity([item(PACK.AGENCE), item(PACK.PATRIMOINE_ESSENTIEL)]).ok).toBe(true);
    expect(validateExclusivity([item(PACK.PROMOTEUR), item(PACK.PATRIMOINE_ESSENTIEL)]).ok).toBe(true);
    expect(validateExclusivity([item(PACK.PROMOTEUR), item(PACK.PATRIMOINE_PRO)]).ok).toBe(true);
  });

  it('elements en vigueur : SCHEDULED a partir de startsAt, fin a endsAt, ENDED jamais', () => {
    expect(isItemEffective(item(PACK.AGENCE), NOW)).toBe(true);
    expect(isItemEffective(item(PACK.AGENCE, { status: 'ENDED' }), NOW)).toBe(false);
    expect(isItemEffective(item(PACK.AGENCE, { endsAt: days(5) }), NOW)).toBe(true);
    expect(isItemEffective(item(PACK.AGENCE, { endsAt: days(-1) }), NOW)).toBe(false);
    expect(isItemEffective(item(PACK.SYNDIC, { status: 'SCHEDULED', startsAt: days(3) }), NOW)).toBe(false);
    expect(isItemEffective(item(PACK.SYNDIC, { status: 'SCHEDULED', startsAt: days(-1) }), NOW)).toBe(true);
  });
});

describe('Capacites : reserve unique (D3)', () => {
  it('somme des packs et extensions', () => {
    const limits = computeCapacityLimits(
      [item(PACK.AGENCE), item(PACK.SYNDIC), item('EXT_LOTS_10', { quantity: 4 }), item('EXT_COPRO', { quantity: 2 })],
      [],
      NOW
    );
    expect(limits.LOTS).toEqual({ included: 200, extensions: 40, overrides: 0, limit: 240 });
    expect(limits.COPROPRIETES).toEqual({ included: 2, extensions: 2, overrides: 0, limit: 4 });
    expect(limits.CHANTIERS.limit).toBe(0);
  });

  it('derogations actives seulement (ni expirees, ni revoquees, ni futures)', () => {
    const limits = computeCapacityLimits(
      [item(PACK.AGENCE)],
      [
        override({ capacityKey: 'LOTS', delta: 30, expiresAt: days(90) }),
        override({ capacityKey: 'LOTS', delta: 500, expiresAt: days(-1) }),
        override({ capacityKey: 'LOTS', delta: 500, revokedAt: days(-2) }),
        override({ capacityKey: 'LOTS', delta: 500, startsAt: days(2) })
      ],
      NOW
    );
    expect(limits.LOTS).toEqual({ included: 100, extensions: 0, overrides: 30, limit: 130 });
  });

  it('un plafond ne descend jamais sous zero', () => {
    expect(computeCapacityLimits([], [override({ capacityKey: 'LOTS', delta: -20 })], NOW).LOTS.limit).toBe(0);
  });
});

describe('Acces par module (D11)', () => {
  const row = (moduleKey: string, patch: Partial<ModuleRow>): ModuleRow => ({
    moduleKey,
    enabled: true,
    source: 'PACK',
    expiresAt: null,
    disabledAt: null,
    ...patch
  });

  it('pack -> FULL ; retire (disabledAt) -> READ_ONLY ; jamais detenu -> NONE', () => {
    const r = resolveModuleAccess(
      ['MODULE_AGENCY'],
      [row('MODULE_SYNDIC', { enabled: false, disabledAt: days(-3) })],
      NOW
    );
    expect(r.access).toEqual({
      MODULE_AGENCY: 'FULL',
      MODULE_SYNDIC: 'READ_ONLY',
      MODULE_PROMOTER: 'NONE',
      MODULE_PATRIMOINE: 'NONE'
    });
    expect(r.modules).toEqual(['MODULE_AGENCY']);
  });

  it('OVERRIDE en vigueur l’emporte sur les packs ; expire, il ne compte plus', () => {
    const r = resolveModuleAccess(
      ['MODULE_AGENCY'],
      [
        row('MODULE_PROMOTER', { source: 'OVERRIDE', enabled: true, expiresAt: days(10) }),
        row('MODULE_AGENCY', { source: 'OVERRIDE', enabled: false, disabledAt: days(-1) }),
        row('MODULE_SYNDIC', { source: 'OVERRIDE', enabled: true, expiresAt: days(-1) })
      ],
      NOW
    );
    expect(r.access).toEqual({
      MODULE_AGENCY: 'READ_ONLY',
      MODULE_SYNDIC: 'NONE',
      MODULE_PROMOTER: 'FULL',
      MODULE_PATRIMOINE: 'NONE'
    });
  });
});

describe('Phase de l’abonnement (D8)', () => {
  const base = {
    status: 'ACTIVE' as const,
    trialEndsAt: null,
    pastDueAt: null,
    currentPeriodEnd: days(10),
    cancelAt: null,
    canceledAt: null,
    graceDays: 7,
    manualReadOnlyAt: null
  };

  it('sans abonnement : lecture seule', () => {
    expect(resolveSubscriptionPhase(null, NOW)).toMatchObject({
      phase: 'NONE',
      readOnly: true,
      reason: 'NO_SUBSCRIPTION'
    });
  });

  it('essai en cours, puis 7 jours de grace, puis lecture seule', () => {
    const trial = { ...base, status: 'TRIALING' as const, trialEndsAt: days(5) };
    expect(resolveSubscriptionPhase(trial, NOW)).toMatchObject({ phase: 'TRIAL', readOnly: false });
    expect(resolveSubscriptionPhase({ ...trial, trialEndsAt: days(-3) }, NOW)).toMatchObject({
      phase: 'GRACE',
      readOnly: false,
      reason: 'TRIAL_EXPIRED'
    });
    expect(resolveSubscriptionPhase({ ...trial, trialEndsAt: days(-8) }, NOW)).toMatchObject({
      phase: 'READ_ONLY',
      readOnly: true,
      reason: 'TRIAL_EXPIRED'
    });
  });

  it('PAST_DUE : grace de graceDays jours depuis pastDueAt', () => {
    expect(resolveSubscriptionPhase({ ...base, status: 'PAST_DUE', pastDueAt: days(-6) }, NOW)).toMatchObject({
      phase: 'GRACE',
      readOnly: false
    });
    expect(resolveSubscriptionPhase({ ...base, status: 'PAST_DUE', pastDueAt: days(-7) }, NOW)).toMatchObject({
      phase: 'READ_ONLY',
      readOnly: true,
      reason: 'PAST_DUE'
    });
    expect(
      resolveSubscriptionPhase({ ...base, status: 'PAST_DUE', pastDueAt: days(-10), graceDays: 14 }, NOW).readOnly
    ).toBe(false);
  });

  it('ACTIVE : periode echue non renouvelee -> grace puis lecture seule', () => {
    expect(resolveSubscriptionPhase(base, NOW)).toMatchObject({ phase: 'ACTIVE', readOnly: false });
    expect(resolveSubscriptionPhase({ ...base, currentPeriodEnd: days(-2) }, NOW).readOnly).toBe(false);
    expect(resolveSubscriptionPhase({ ...base, currentPeriodEnd: days(-9) }, NOW)).toMatchObject({
      phase: 'READ_ONLY',
      reason: 'PERIOD_EXPIRED'
    });
  });

  it('CANCELED : actif jusqu’a la date de resiliation ; SUSPENDED : lecture seule', () => {
    expect(resolveSubscriptionPhase({ ...base, status: 'CANCELED', cancelAt: days(3) }, NOW).readOnly).toBe(false);
    expect(resolveSubscriptionPhase({ ...base, status: 'CANCELED', cancelAt: days(-1) }, NOW).readOnly).toBe(true);
    expect(resolveSubscriptionPhase({ ...base, status: 'SUSPENDED' }, NOW)).toMatchObject({
      readOnly: true,
      reason: 'SUSPENDED'
    });
  });

  it('lecture seule manuelle : prend le pas sur un abonnement ACTIVE ou en essai, jamais de grace', () => {
    expect(resolveSubscriptionPhase({ ...base, manualReadOnlyAt: days(-1) }, NOW)).toMatchObject({
      phase: 'READ_ONLY',
      readOnly: true,
      reason: 'MANUAL',
      graceEndsAt: null
    });
    const trial = { ...base, status: 'TRIALING' as const, trialEndsAt: days(5), manualReadOnlyAt: days(-1) };
    expect(resolveSubscriptionPhase(trial, NOW)).toMatchObject({
      phase: 'READ_ONLY',
      readOnly: true,
      reason: 'MANUAL'
    });
  });

  it('lecture seule manuelle future (pas encore effective) : ignoree', () => {
    expect(resolveSubscriptionPhase({ ...base, manualReadOnlyAt: days(1) }, NOW)).toMatchObject({
      phase: 'ACTIVE',
      readOnly: false
    });
  });
});

describe('Quota (D4)', () => {
  const cap = { limit: 100, used: 100 };
  it('dans le plafond : ALLOW, quel que soit le mode', () => {
    expect(evaluateQuota({ limit: 100, used: 99 }, 1, 'BLOCK', 'enforce').decision).toBe('ALLOW');
  });
  it('au-dela : off -> ALLOW, warn -> WARN, enforce -> politique', () => {
    expect(evaluateQuota(cap, 1, 'BLOCK', 'off').decision).toBe('ALLOW');
    expect(evaluateQuota(cap, 1, 'BLOCK', 'warn').decision).toBe('WARN');
    expect(evaluateQuota(cap, 1, 'BLOCK', 'enforce').decision).toBe('BLOCK');
    expect(evaluateQuota(cap, 1, 'BILL_OVERAGE', 'enforce')).toMatchObject({
      decision: 'BILL',
      overBy: 1,
      usedAfter: 101
    });
    expect(evaluateQuota(cap, 3, 'WARN_ONLY', 'enforce')).toMatchObject({ decision: 'WARN', overBy: 3 });
  });
});

describe('Synthese des droits', () => {
  function build(patch: Partial<Parameters<typeof buildEntitlements>[0]> = {}): TenantEntitlements {
    return buildEntitlements({
      tenantId: 't-1',
      subscription: {
        id: 's-1',
        status: 'ACTIVE',
        trialEndsAt: null,
        pastDueAt: null,
        currentPeriodStart: days(-10),
        currentPeriodEnd: days(20),
        cancelAt: null,
        canceledAt: null,
        graceDays: 7,
        billingCycle: 'MONTHLY',
        quotaPolicy: 'BILL_OVERAGE',
        manualReadOnlyAt: null,
        manualReadOnlyReason: null
      },
      items: [
        item(PACK.AGENCE),
        item(PACK.SYNDIC, { endsAt: days(20) }),
        item('EXT_LOTS_10', { quantity: 2 }),
        item(PACK.PROMOTEUR, { status: 'SCHEDULED', startsAt: days(20) }),
        item(PACK.INTEGRE, { status: 'ENDED' })
      ],
      overrides: [override({ capacityKey: 'LOTS', delta: 30, expiresAt: days(60) })],
      moduleRows: [],
      usage: { LOTS: 260, COPROPRIETES: 1 },
      enforcement: 'enforce',
      featuresFor: featuresForModules,
      now: NOW,
      ...patch
    });
  }

  it('assemble statut, modules, fonctionnalites et capacites {limit, used}', () => {
    const e = build();
    expect(e).toMatchObject({ status: 'ACTIVE', phase: 'ACTIVE', readOnly: false, packs: ['AGENCE', 'SYNDIC'] });
    expect(e.modules).toEqual(['MODULE_AGENCY', 'MODULE_SYNDIC']);
    expect(e.features).toEqual(['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE', 'SYNDIC']);
    expect(e.capacities.LOTS).toEqual({
      included: 200,
      extensions: 20,
      overrides: 30,
      limit: 250,
      used: 260,
      remaining: 0,
      overBy: 10
    });
    expect(e.capacities.COPROPRIETES).toMatchObject({ limit: 2, used: 1, remaining: 1, overBy: 0 });
    expect(e.capacities.CHANTIERS).toMatchObject({ limit: 0, used: 0 });
  });

  it('gardes : module absent -> MODULE_NOT_INCLUDED (enforce) ; warn laisse passer', () => {
    const e = build();
    expect(() => assertModuleAccess(e, 'MODULE_PROMOTER', { write: false })).toThrow(
      expect.objectContaining({ code: 'MODULE_NOT_INCLUDED', statusCode: 403 })
    );
    expect(() => assertModuleAccess(e, 'MODULE_AGENCY', { write: true })).not.toThrow();
    expect(() => assertModuleAccess({ ...e, enforcement: 'warn' }, 'MODULE_PROMOTER', { write: true })).not.toThrow();
    expect(() => assertModuleAccess({ ...e, enforcement: 'off' }, 'MODULE_PROMOTER', { write: true })).not.toThrow();
  });

  it('gardes : module retire -> lecture permise, ecriture MODULE_READ_ONLY', () => {
    const e = build({
      moduleRows: [
        { moduleKey: 'MODULE_PROMOTER', enabled: false, source: 'PACK', expiresAt: null, disabledAt: days(-5) }
      ]
    });
    expect(e.moduleAccess.MODULE_PROMOTER).toBe('READ_ONLY');
    expect(() => assertModuleAccess(e, 'MODULE_PROMOTER', { write: false })).not.toThrow();
    expect(() => assertModuleAccess(e, 'MODULE_PROMOTER', { write: true })).toThrow(
      expect.objectContaining({ code: 'MODULE_READ_ONLY' })
    );
  });

  it('gardes : abonnement en lecture seule -> SUBSCRIPTION_READ_ONLY', () => {
    const e = build({ subscription: null });
    expect(e.readOnly).toBe(true);
    expect(() => assertSubscriptionWritable(e)).toThrow(expect.objectContaining({ code: 'SUBSCRIPTION_READ_ONLY' }));
    expect(() => assertSubscriptionWritable(build())).not.toThrow();
  });

  it('gardes : quota BLOCK -> QUOTA_EXCEEDED (409) ; BILL_OVERAGE autorise et signale', () => {
    const e = build();
    expect(checkQuota(e, 'LOTS', 1).decision).toBe('BILL');
    expect(() => checkQuota({ ...e, quotaPolicy: 'BLOCK' }, 'LOTS', 1)).toThrow(
      expect.objectContaining({ code: 'QUOTA_EXCEEDED', statusCode: 409 })
    );
    expect(checkQuota({ ...e, quotaPolicy: 'BLOCK' }, 'COPROPRIETES', 1).decision).toBe('ALLOW');
  });

  it('effectiveItems ecarte ENDED et SCHEDULED futurs', () => {
    expect(
      effectiveItems(
        [
          item(PACK.AGENCE),
          item(PACK.INTEGRE, { status: 'ENDED' }),
          item(PACK.SYNDIC, { status: 'SCHEDULED', startsAt: days(1) })
        ],
        NOW
      ).map(i => i.code)
    ).toEqual(['AGENCE']);
  });

  it('ownAssetsOnly (barriere « detenu en propre ») : vrai pour Patrimoine seul, faux avec Agence, faux sans module', () => {
    expect(isOwnAssetsOnly(['MODULE_PATRIMOINE'])).toBe(true);
    expect(isOwnAssetsOnly(['MODULE_AGENCY', 'MODULE_PATRIMOINE'])).toBe(false);
    expect(isOwnAssetsOnly([])).toBe(false);

    const patrimoineOnly = build({ items: [item(PACK.PATRIMOINE_ESSENTIEL)] });
    expect(patrimoineOnly.ownAssetsOnly).toBe(true);
    const patrimoineAndAgence = build({ items: [item(PACK.AGENCE), item(PACK.PATRIMOINE_ESSENTIEL)] });
    expect(patrimoineAndAgence.ownAssetsOnly).toBe(false);
    expect(build().ownAssetsOnly).toBe(false);
  });

  it('gardes : assertThirdPartyManagementAllowed refuse mandat/tiers en enforce, off/warn laissent passer', () => {
    const patrimoineOnly = build({ items: [item(PACK.PATRIMOINE_ESSENTIEL)] });
    expect(patrimoineOnly.ownAssetsOnly).toBe(true);
    expect(() => assertThirdPartyManagementAllowed(patrimoineOnly, 'MANDATE')).toThrow(
      expect.objectContaining({ code: 'OWN_ASSETS_ONLY', statusCode: 403, data: { action: 'MANDATE' } })
    );
    expect(() => assertThirdPartyManagementAllowed(patrimoineOnly, 'THIRD_PARTY_OWNER')).toThrow(
      expect.objectContaining({ code: 'OWN_ASSETS_ONLY', statusCode: 403, data: { action: 'THIRD_PARTY_OWNER' } })
    );
    expect(() =>
      assertThirdPartyManagementAllowed({ ...patrimoineOnly, enforcement: 'warn' }, 'MANDATE')
    ).not.toThrow();
    expect(() => assertThirdPartyManagementAllowed({ ...patrimoineOnly, enforcement: 'off' }, 'MANDATE')).not.toThrow();

    const patrimoineAndAgence = build({ items: [item(PACK.AGENCE), item(PACK.PATRIMOINE_ESSENTIEL)] });
    expect(() => assertThirdPartyManagementAllowed(patrimoineAndAgence, 'MANDATE')).not.toThrow();
    expect(() => assertThirdPartyManagementAllowed(build(), 'THIRD_PARTY_OWNER')).not.toThrow();
  });

  it('Promoteur + Patrimoine Essentiel : modules, fonctionnalites et capacites des deux packs se cumulent (BIENS_DETENUS ajoutee, non ecrasee par Promoteur)', () => {
    const e = build({ items: [item(PACK.PROMOTEUR), item(PACK.PATRIMOINE_ESSENTIEL)], overrides: [] });
    expect(e.packs).toEqual(['PROMOTEUR', 'PATRIMOINE_ESSENTIEL']);
    expect(e.modules).toEqual(['MODULE_PROMOTER', 'MODULE_PATRIMOINE']);
    expect(e.features).toEqual(['CORE', 'CRM', 'SALES', 'RENTAL', 'PATRIMOINE', 'CONSTRUCTION']);
    expect(e.capacities.CHANTIERS).toMatchObject({ included: 2, limit: 2 });
    expect(e.capacities.LOTS).toMatchObject({ included: 150, limit: 150 });
    expect(e.capacities.BIENS_DETENUS).toMatchObject({ included: 10, limit: 10 });
    expect(e.ownAssetsOnly).toBe(false);
  });
});
