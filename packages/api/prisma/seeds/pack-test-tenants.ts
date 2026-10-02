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

export interface PackTestTenant {
  pack: PackTestPackCode;
  tenantName: string;
  adminName: string;
  adminEmail: string;
  tenantType: 'AGENCY' | 'OPERATOR';
}

/**
 * Mot de passe commun des comptes de test. Il atterrit de toute façon dans le
 * bundle public du staging (liste de connexion rapide) : l'écrire ici est voulu.
 * Staging seulement, jamais en production.
 */
export const PACK_TEST_PASSWORD = 'PackTest@2026';

export const PACK_TEST_EMAIL_DOMAIN = 'packs.immotopia.test';

export const PACK_TEST_TENANTS: readonly PackTestTenant[] = [
  {
    pack: PACK.AGENCE,
    tenantName: 'Test — Pack Agence',
    adminName: 'Admin Test Agence',
    adminEmail: 'agence@packs.immotopia.test',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.SYNDIC,
    tenantName: 'Test — Pack Syndic',
    adminName: 'Admin Test Syndic',
    adminEmail: 'syndic@packs.immotopia.test',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.PROMOTEUR,
    tenantName: 'Test — Pack Promoteur',
    adminName: 'Admin Test Promoteur',
    adminEmail: 'promoteur@packs.immotopia.test',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.INTEGRE,
    tenantName: 'Test — Pack Opérateur intégré',
    adminName: 'Admin Test Intégré',
    adminEmail: 'integre@packs.immotopia.test',
    tenantType: 'OPERATOR'
  },
  {
    pack: PACK.PATRIMOINE_ESSENTIEL,
    tenantName: 'Test — Pack Patrimoine Essentiel',
    adminName: 'Admin Test Patrimoine Essentiel',
    adminEmail: 'patrimoine-essentiel@packs.immotopia.test',
    tenantType: 'AGENCY'
  },
  {
    pack: PACK.PATRIMOINE_PRO,
    tenantName: 'Test — Pack Patrimoine Pro',
    adminName: 'Admin Test Patrimoine Pro',
    adminEmail: 'patrimoine-pro@packs.immotopia.test',
    tenantType: 'AGENCY'
  }
];

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
