/**
 * Données et garde du seed des agences de test par pack (staging uniquement).
 *
 * Module PUR : aucun effet de bord à l'import (ni base, ni lecture d'environnement),
 * donc testable seul. Le seed qui s'en sert est seed-pack-test-tenants.ts.
 *
 * Choix du type d'agence : OPERATOR pour INTEGRE, AGENCY pour les cinq autres.
 * `DEFAULT_MODULES_BY_TYPE` (services/tenant-provisioning-service.ts) associe
 * OPERATOR à agence + syndic + promoteur, c'est-à-dire exactement le pack
 * INTEGRE ; AGENCY ne porte que MODULE_AGENCY. Les packs SYNDIC, PROMOTEUR et
 * PATRIMOINE_* sont mono-module et se souscrivent chez une agence ordinaire :
 * le seed passe de toute façon les packs en `items`, qui font foi pour les
 * modules, et le type ne sert qu'à refléter la nature de l'agence.
 */
import { PACK } from '../../src/lib/subscription/catalog';

export type PackTestPackCode = (typeof PACK)[keyof typeof PACK];

export type PackTestProfile = '6m' | '3y';

export interface PackTestTenant {
  pack: PackTestPackCode;
  tenantName: string;
  /** Ancien nom de l'agence (avant les profils d'historique) : renommée si elle existe encore. */
  legacyTenantName?: string;
  adminName: string;
  adminEmail: string;
  tenantType: 'AGENCY' | 'OPERATOR';
  /** Historique à reconstituer : 6 mois ou 3 ans de gestion. */
  profile: PackTestProfile;
}

/**
 * Mot de passe commun des comptes de test. Il atterrit de toute façon dans le
 * bundle public du staging (liste de connexion rapide) : l'écrire ici est voulu.
 * Staging seulement, jamais en production.
 */
export const PACK_TEST_PASSWORD = 'PackTest@2026';

export const PACK_TEST_EMAIL_DOMAIN = 'packs.immotopia.test';

/** Libellés des deux profils d'historique, repris dans le nom des agences. */
export const PACK_TEST_PROFILE_LABEL: Record<PackTestProfile, string> = { '6m': '6 mois', '3y': '3 ans' };

interface PackTestBase {
  pack: PackTestPackCode;
  /** Nom d'origine « Test — Pack X » (devient legacyTenantName du profil 6 mois). */
  baseName: string;
  adminName: string;
  /** Partie locale de l'e-mail du profil 6 mois (inchangée depuis la première version). */
  emailLocalPart: string;
  tenantType: 'AGENCY' | 'OPERATOR';
}

const PACK_TEST_BASES: readonly PackTestBase[] = [
  {
    pack: PACK.AGENCE,
    baseName: 'Test — Pack Agence',
    adminName: 'Admin Test Agence',
    emailLocalPart: 'agence',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.SYNDIC,
    baseName: 'Test — Pack Syndic',
    adminName: 'Admin Test Syndic',
    emailLocalPart: 'syndic',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.PROMOTEUR,
    baseName: 'Test — Pack Promoteur',
    adminName: 'Admin Test Promoteur',
    emailLocalPart: 'promoteur',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.INTEGRE,
    baseName: 'Test — Pack Opérateur intégré',
    adminName: 'Admin Test Intégré',
    emailLocalPart: 'integre',
    tenantType: 'OPERATOR'
  },
  {
    pack: PACK.PATRIMOINE_ESSENTIEL,
    baseName: 'Test — Pack Patrimoine Essentiel',
    adminName: 'Admin Test Patrimoine Essentiel',
    emailLocalPart: 'patrimoine-essentiel',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.PATRIMOINE_PRO,
    baseName: 'Test — Pack Patrimoine Pro',
    adminName: 'Admin Test Patrimoine Pro',
    emailLocalPart: 'patrimoine-pro',
    tenantType: 'AGENCY'
  }
];

/**
 * Deux agences par pack : « 6 mois » (reprend l'agence et l'e-mail d'origine) et
 * « 3 ans » (e-mail suffixé `-3ans`).
 */
export const PACK_TEST_TENANTS: readonly PackTestTenant[] = PACK_TEST_BASES.flatMap(base => [
  {
    pack: base.pack,
    tenantName: `${base.baseName} · ${PACK_TEST_PROFILE_LABEL['6m']}`,
    legacyTenantName: base.baseName,
    adminName: `${base.adminName} (6 mois)`,
    adminEmail: `${base.emailLocalPart}@${PACK_TEST_EMAIL_DOMAIN}`,
    tenantType: base.tenantType,
    profile: '6m' as const
  },
  {
    pack: base.pack,
    tenantName: `${base.baseName} · ${PACK_TEST_PROFILE_LABEL['3y']}`,
    adminName: `${base.adminName} (3 ans)`,
    adminEmail: `${base.emailLocalPart}-3ans@${PACK_TEST_EMAIL_DOMAIN}`,
    tenantType: base.tenantType,
    profile: '3y' as const
  }
]);

/** Seule origine publique autorisée en production : le staging. */
export const STAGING_ORIGIN = 'https://app.immotopia.cloud';
const PRODUCTION_HOST_MARKER = 'clients.immotopia.cloud';

export interface PackTestGuardInput {
  /** Valeur de ALLOW_PACK_TEST_TENANTS. */
  allowFlag: string | undefined;
  nodeEnv: string | undefined;
  /** FRONTEND_URL et CLIENT_URL (l'alias, prioritaire côté API) ; les valeurs vides sont ignorées. */
  origins: ReadonlyArray<string | undefined>;
}

export interface PackTestGuardResult {
  ok: boolean;
  /** Raison du refus, en français. */
  reason?: string;
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Garde du seed, appelée avant toute requête base. `assertNotProduction` ne
 * convient pas : le staging tourne lui aussi avec NODE_ENV=production.
 *  - le drapeau ALLOW_PACK_TEST_TENANTS=1 est toujours exigé ;
 *  - une origine contenant clients.immotopia.cloud (la production) est toujours refusée ;
 *  - en NODE_ENV=production, l'origine publique doit être exactement celle du staging ;
 *  - hors production, le drapeau seul suffit.
 */
export function checkPackTestTenantsGuard(input: PackTestGuardInput): PackTestGuardResult {
  if (input.allowFlag !== '1') {
    return {
      ok: false,
      reason:
        'Refus : ALLOW_PACK_TEST_TENANTS=1 est obligatoire. Ces comptes de test ont un mot de passe public ; ' +
        'ils ne se créent que volontairement, sur le staging (./infra/scripts/seed-pack-tests.sh staging).'
    };
  }

  const origins = input.origins
    .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    .map(normalizeOrigin);

  if (origins.some(o => o.toLowerCase().includes(PRODUCTION_HOST_MARKER))) {
    return {
      ok: false,
      reason: `Refus : l'origine publique vise la production (${PRODUCTION_HOST_MARKER}). Ces comptes de test à mot de passe public n'y sont jamais créés.`
    };
  }

  if (input.nodeEnv === 'production') {
    if (origins.length === 0 || origins.some(o => o !== STAGING_ORIGIN)) {
      return {
        ok: false,
        reason:
          `Refus : en production (NODE_ENV=production), l'origine publique doit être exactement ${STAGING_ORIGIN} ` +
          `(FRONTEND_URL/CLIENT_URL reçus : ${origins.length ? origins.join(', ') : 'aucun'}).`
      };
    }
  }

  return { ok: true };
}
