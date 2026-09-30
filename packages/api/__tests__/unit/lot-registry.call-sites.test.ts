/**
 * Inventaire des points d'appel du registre des lots (vague 2, lot B).
 *
 * Chaque operation metier qui fait entrer ou sortir une unite de la reserve
 * de l'abonnement doit appeler le registre (`syncLotActivationsTx`) — ou le
 * controle de capacite (`assertCapacityTx`) pour une copropriete ou un
 * chantier qui devient actif — DANS sa transaction. Les comportements sont
 * testes ailleurs (lot-registry.sync.test.ts, finance.site-closing,
 * finance.sites, syndics.syndicate) ; ce test-ci empeche qu'un point d'appel
 * disparaisse sans bruit lors d'une refonte d'un service.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

/** Corps d'une fonction exportee : du nom jusqu'a la prochaine declaration de premier niveau. */
function bodyOf(file: string, name: string): string {
  const source = readFileSync(join(SRC, file), 'utf8');
  const start = source.search(new RegExp(`export (async function|const) ${name}\\b`));
  if (start < 0) throw new Error(`${name} introuvable dans ${file}`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(export |async function |function )/);
  return next < 0 ? rest : rest.slice(0, next);
}

const CALL_SITES: Array<[file: string, fn: string, expected: RegExp, transactional: boolean]> = [
  // Biens : creation, sortie de brouillon / statut / modes, suppression, vente.
  ['services/property-service.ts', 'createProperty', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/property-service.ts', 'updateProperty', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/property-service.ts', 'deleteProperty', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/property-status-service.ts', 'updatePropertyStatus', /syncLotActivationsTx\(\s*tx,/, true],
  ['lib/sales/property-status.ts', 'setPropertyStatusTx', /syncLotActivationsTx\(\s*tx,/, false],
  // Mandats de gestion : creation, resiliation (BUG-2026-09-30-029).
  ['services/property-mandate-service.ts', 'createMandate', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/property-mandate-service.ts', 'revokeMandate', /syncLotActivationsTx\(\s*tx,/, true],
  // Baux : creation (ACTIVE), changement de statut, renouvellement, resiliation.
  ['services/rental-lease-service.ts', 'createLease', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/rental-lease-service.ts', 'updateLeaseStatus', /syncLotActivationsTx\(\s*tx,/, true],
  ['services/rental-lease-service.ts', 'deleteLease', /syncLotActivationsTx\(\s*tx,/, true],
  ['lib/lease-lifecycle/service.ts', 'renewLease', /syncLotActivationsTx\(\s*tx,/, true],
  ['lib/lease-lifecycle/service.ts', 'terminateLease', /syncLotActivationsTx\(\s*tx,/, true],
  // Coproprietes : creation (capacite), statut, suppression, lots.
  ['lib/syndics/queries.ts', 'createSyndicateWithDefaults', /assertCapacityTx\(tx, tenantId, 'COPROPRIETES'\)/, true],
  ['lib/syndics/queries.ts', 'updateSyndicateByTenant', /syncLotActivationsTx\(tx, tenantId, \{ syndicateIds/, true],
  ['lib/syndics/queries.ts', 'deleteEmptySyndicateByTenant', /syncLotActivationsTx\(tx, tenantId, scope/, true],
  ['lib/syndics/queries.ts', 'createSyndicateLot', /syncLotActivationsTx\(tx, tenantId, \{ syndicateLotIds/, true],
  [
    'lib/syndics/queries.ts',
    'importLotsFromPropertiesBySyndicate',
    /syncLotActivationsTx\(tx, tenantId, \{ syndicateLotIds/,
    true
  ],
  ['lib/syndics/queries.ts', 'updateSyndicateLotByTenant', /syncLotActivationsTx\(tx, tenantId, \{/, true],
  // Chantiers : creation (capacite), lots, cloture, reouverture, bascule.
  ['lib/finance/sites.ts', 'createConstructionSite', /assertCapacityTx\(tx, tenantId, 'CHANTIERS'\)/, true],
  ['lib/finance/site-closing.ts', 'createSiteLotTx', /syncLotActivationsTx\(tx, tenantId, \{ siteLotIds/, false],
  ['lib/finance/site-closing.ts', 'deleteSiteLotTx', /syncLotActivationsTx\(tx, tenantId, \{ siteLotIds/, false],
  ['lib/finance/site-closing.ts', 'closeSiteTx', /syncLotActivationsTx\(tx, tenantId, \{ siteIds/, false],
  [
    'lib/finance/site-closing.ts',
    'reopenSiteTx',
    /assertCapacityTx\(tx, tenantId, 'CHANTIERS'\)[\s\S]*syncLotActivationsTx\(tx, tenantId, \{ siteIds/,
    false
  ],
  [
    'lib/finance/site-closing.ts',
    'capitalizeSiteLotTx',
    /syncLotActivationsTx\(tx, tenantId, \{ siteLotIds: \[lotId\], propertyIds/,
    false
  ]
];

describe('registre des lots branche dans chaque operation metier', () => {
  it.each(CALL_SITES)('%s › %s', (file, fn, expected, transactional) => {
    const body = bodyOf(file, fn);
    expect(body).toMatch(expected);
    // Dans la transaction de l'operation : une transaction ouverte ici, ou un `tx` recu.
    if (transactional) expect(body).toMatch(/\$transaction\(async tx =>/);
  });
});
