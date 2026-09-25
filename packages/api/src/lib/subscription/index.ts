/**
 * Abonnements par packs — point d'entree de la bibliotheque.
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md.
 *
 * `catalog`, `features`, `entitlements` et `pricing` sont PURS (aucun acces
 * base, aucune configuration). `guards` et `enforcement` lisent la
 * configuration (SUBSCRIPTION_ENFORCEMENT) et levent les erreurs typees.
 */
export * from './catalog';
export * from './features';
export * from './entitlements';
export * from './pricing';
export * from './guards';
export * from './enforcement';
