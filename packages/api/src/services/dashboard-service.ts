import { prisma } from '../utils/database';
import { getUserPermissions } from './permission-service';
import { getEntitlements } from './subscription-v2-service';
import { evaluateFeatureAccess } from '../lib/subscription/feature-access';
import type { Feature } from '../lib/subscription/features';
import { logger } from '../utils/logger';
import {
  CrmDealStage,
  MaintenanceTicketPriority,
  MaintenanceTicketStatus,
  PaymentDeclarationStatus,
  RentalInstallmentStatus,
  RentalLeaseStatus,
  RentalPaymentStatus
} from '@prisma/client';

/**
 * Agrégats du tableau de bord d'accueil (`/dashboard`).
 *
 * L'écran servait quatre compteurs et une liste d'activités : un rapport
 * passif, sans lecture d'ensemble et sans issue vers le détail. Il devient le
 * poste de travail du collaborateur (REFONTE_UI_UX.md §6.2, §6.14) et la seule
 * vue qui traverse les six modules — biens, CRM, location, maintenance,
 * copropriété, patrimoine.
 *
 * Trois règles tiennent toute la conception de ce service :
 *
 * 1. **Une section vaut `null` quand le module est hors de portée du
 *    collaborateur.** L'écran rend alors un tiret, jamais un zéro : « 0 client »
 *    et « vous n'avez pas accès au CRM » ne se disent pas de la même façon.
 *    C'était déjà la règle des quatre compteurs, elle est étendue à tout.
 * 2. **Un point de donnée porte son lien.** Chaque tranche de camembert, chaque
 *    barre et chaque ligne de la file de travail expose le chemin de la liste
 *    filtrée correspondante (`href`), construit ici. Le front ne recompose
 *    aucune URL — même contrat que la recherche globale (§4.4).
 * 3. **Un seul appel HTTP.** Le §10.1 plafonne un écran à trois requêtes au
 *    montage ; ce tableau de bord en fait une. Le coût est reporté côté
 *    serveur, où il est payé en `groupBy` indexés lancés en parallèle plutôt
 *    qu'en allers-retours réseau sur une 3G.
 */

/** Une tranche : un code métier, son volume, et où aller pour le voir. */
export interface DashboardBucket {
  /** Code de l'énumération. Le libellé français est posé côté front. */
  key: string;
  count: number;
  /** Montant associé quand la tranche en porte un (valeur, reste dû, coût). */
  amount?: number;
  /** Liste filtrée correspondante. Absent quand aucun écran ne la sert. */
  href?: string;
}

export interface DashboardSeriesPoint {
  /** Premier jour du mois, en ISO. L'axe est formaté côté front. */
  month: string;
  /** Encaissé : paiements aboutis dans le mois. */
  encaisse: number;
  /** Attendu : échéances dont la date tombe dans le mois. */
  attendu: number;
}

export interface DashboardTask {
  id: string;
  kind: 'OVERDUE_INSTALLMENT' | 'PENDING_DECLARATION' | 'URGENT_TICKET';
  title: string;
  /**
   * Le complément non monétaire de la ligne : le retard, le moyen de paiement,
   * le bien. Le montant n'y figure pas — il voyage dans `amount`, et c'est
   * l'affichage qui l'écrit, avec la devise du produit.
   */
  description: string;
  /** Montant brut, sans devise. `null` quand la ligne n'en porte pas. */
  amount: number | null;
  /** Date qui justifie l'urgence : échéance dépassée, déclaration, ouverture. */
  occurredAt: string;
  severity: 'danger' | 'warning' | 'info';
  href: string;
}

export interface DashboardActivity {
  id: string;
  type: 'PROPERTY_CREATED' | 'CONTACT_CREATED' | 'PAYMENT_SUCCEEDED';
  title: string;
  description: string;
  /** Montant brut, sans devise. `null` pour les événements non monétaires. */
  amount: number | null;
  occurredAt: string;
  /** Fiche concernée, pour que le fil mène quelque part. */
  href?: string;
}

export interface TenantDashboard {
  properties: {
    total: number;
    published: number;
    /** Part du parc effectivement occupée : loué ou vendu sur le total. */
    occupancyRate: number | null;
    byStatus: DashboardBucket[];
    byType: DashboardBucket[];
  } | null;
  clients: { total: number; byStatus: DashboardBucket[] } | null;
  monthlyRevenue: {
    amount: number;
    /** Mois précédent : la base de la variation affichée sous le montant. */
    previousAmount: number;
    /** Échéances du mois, tous statuts : le dénominateur du taux d'encaissement. */
    expected: number;
    currency: string;
    periodStart: string;
    periodEnd: string;
  } | null;
  transactions: { total: number; deals: number | null; leases: number | null } | null;
  /** Douze mois glissants, encaissé contre attendu. `null` sans accès aux paiements. */
  revenueSeries: DashboardSeriesPoint[] | null;
  rental: {
    activeLeases: number | null;
    leasesByStatus: DashboardBucket[] | null;
    installmentsByStatus: DashboardBucket[] | null;
    paymentsByMethod: DashboardBucket[] | null;
    overdue: { count: number; amount: number } | null;
    dueThisWeek: { count: number; amount: number } | null;
    pendingDeclarations: number | null;
  } | null;
  /** Entonnoir des affaires CRM, du plus large au plus étroit. */
  pipeline: DashboardBucket[] | null;
  maintenance: { open: number; byStatus: DashboardBucket[]; byPriority: DashboardBucket[] } | null;
  syndic: {
    syndicates: number;
    lots: number;
    chargeCallsByStatus: DashboardBucket[];
    /** Part des appels de charges soldés, sur le montant appelé. */
    recoveryRate: number | null;
  } | null;
  patrimoine: { workProgramsByStatus: DashboardBucket[]; plannedCost: number } | null;
  workQueue: DashboardTask[];
  recentActivity: DashboardActivity[];
}

const RECENT_ACTIVITY_LIMIT = 8;
/** Ce que chaque source apporte avant que la file fusionnée soit tronquée. */
const RECENT_ACTIVITY_PER_SOURCE = RECENT_ACTIVITY_LIMIT;
/** Longueur de la file « à traiter ». Au-delà, l'écran renvoie vers la liste. */
const WORK_QUEUE_LIMIT = 8;
const WORK_QUEUE_PER_SOURCE = 4;
/** Profondeur de la courbe. Douze mois : une saison complète de loyers. */
const SERIES_MONTHS = 12;

/**
 * Ordre canonique des tranches.
 *
 * Un `groupBy` rend ce que la base contient, dans un ordre qui varie. Un
 * entonnoir dont les étapes changent de place d'un chargement à l'autre ne se
 * lit pas, et une étape absente de la base ferait croire qu'elle n'existe pas.
 * Ces listes fixent l'ordre et comblent les trous par des zéros.
 */
const DEAL_STAGE_ORDER: string[] = [
  CrmDealStage.NEW,
  CrmDealStage.QUALIFIED,
  CrmDealStage.VISIT,
  CrmDealStage.NEGOTIATION,
  CrmDealStage.WON,
  CrmDealStage.LOST
];

const INSTALLMENT_STATUS_ORDER: string[] = [
  RentalInstallmentStatus.OVERDUE,
  RentalInstallmentStatus.PARTIAL,
  RentalInstallmentStatus.DUE,
  RentalInstallmentStatus.PAID
];

const LEASE_STATUS_ORDER: string[] = [
  RentalLeaseStatus.ACTIVE,
  RentalLeaseStatus.DRAFT,
  RentalLeaseStatus.SUSPENDED,
  RentalLeaseStatus.ENDED,
  RentalLeaseStatus.CANCELED
];

const TICKET_STATUS_ORDER: string[] = [
  MaintenanceTicketStatus.DECLARED,
  MaintenanceTicketStatus.IN_PROGRESS,
  MaintenanceTicketStatus.ASSIGNED,
  MaintenanceTicketStatus.RESOLVED,
  MaintenanceTicketStatus.CANCELED
];

const TICKET_PRIORITY_ORDER: string[] = [
  MaintenanceTicketPriority.URGENT,
  MaintenanceTicketPriority.HIGH,
  MaintenanceTicketPriority.MEDIUM,
  MaintenanceTicketPriority.LOW
];

const WORK_PROGRAM_STATUS_ORDER: string[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/** Statuts de ticket qui comptent comme « ouvert » : ni résolu, ni annulé. */
const OPEN_TICKET_STATUSES: MaintenanceTicketStatus[] = [
  MaintenanceTicketStatus.DECLARED,
  MaintenanceTicketStatus.IN_PROGRESS,
  MaintenanceTicketStatus.ASSIGNED
];

/** Premier instant du mois courant, en heure locale du serveur. */
function startOfCurrentMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Premier instant du mois suivant, borne haute exclusive. */
function startOfNextMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toNumber(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

/*
 * Aucune mise en forme monétaire ici — volontairement.
 *
 * Ce service a longtemps composé « 105 000 XOF » en recopiant le code devise
 * STOCKÉ (`XOF` pour les baux du jeu de démonstration, `FCFA` pour ceux nés du
 * défaut de schéma). La même liste affichait donc deux notations. La règle du
 * produit est celle des écrans Biens et Stock : la devise stockée est `XOF`,
 * la devise affichée est « FCFA », et c'est l'affichage seul qui l'écrit
 * (`formatMoney` / `<MoneyValue>`). Les montants partent donc bruts.
 */

/** Arrondi à une décimale d'un pourcentage, `null` si le dénominateur est nul. */
function part(numerateur: number, denominateur: number): number | null {
  return denominateur > 0 ? Math.round((numerateur / denominateur) * 1000) / 10 : null;
}

/**
 * Complète un `groupBy` avec les clés attendues et les remet dans l'ordre.
 * Les clés absentes de l'ordre canonique sont conservées, à la suite : une
 * valeur d'énumération ajoutée sans toucher à ce fichier reste visible.
 */
function orderBuckets(
  buckets: DashboardBucket[],
  order: readonly string[],
  hrefDe: (key: string) => string | undefined
): DashboardBucket[] {
  const parCle = new Map(buckets.map(bucket => [bucket.key, bucket]));
  const attendus = order.map(key => parCle.get(key) ?? { key, count: 0, amount: 0, href: hrefDe(key) });
  const surplus = buckets.filter(bucket => !order.includes(bucket.key));
  return [...attendus, ...surplus];
}

/**
 * Fonctionnalités ouvertes par le pack de l'agence. En mode `enforce`
 * seulement (`warn` et `off` ne masquent rien, comme les gardes de routes) ;
 * une panne du calcul des droits laisse tout passer.
 */
async function loadFeatureGate(tenantId: string): Promise<(feature: Feature) => boolean> {
  try {
    const entitlements = await getEntitlements(tenantId);
    if (entitlements.enforcement !== 'enforce') return () => true;
    return feature => evaluateFeatureAccess(entitlements, feature, false).allowed;
  } catch (error) {
    logger.error('Dashboard: entitlements unavailable, sections not filtered', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return () => true;
  }
}

/**
 * Construit les agrégats d'une agence.
 *
 * @param tenantId - Agence concernée
 * @param userId - Appelant, qui décide des sections visibles
 */
export async function getTenantDashboard(tenantId: string, userId: string): Promise<TenantDashboard> {
  // Une seule lecture : `getUserPermissions` est mis en cache par couple
  // (utilisateur, agence), et l'interroger dix fois répéterait le même travail.
  const [permissions, hasFeature] = await Promise.all([
    getUserPermissions(userId, tenantId),
    loadFeatureGate(tenantId)
  ]);
  const canViewProperties = permissions.includes('PROPERTIES_VIEW');
  const canViewContacts = permissions.includes('CRM_CONTACTS_VIEW');
  // Une section que le pack ne possède pas n'est ni calculée ni livrée (null) :
  // location (RENTAL), affaires CRM (CRM), copropriété (SYNDIC), patrimoine
  // (PATRIMOINE). `hasFeature` vaut toujours vrai hors mode `enforce`.
  const hasRental = hasFeature('RENTAL');
  const canViewPayments = hasRental && permissions.includes('RENTAL_PAYMENTS_VIEW');
  const canViewDeals = hasFeature('CRM') && permissions.includes('CRM_DEALS_VIEW');
  const canViewLeases = hasRental && permissions.includes('RENTAL_LEASES_VIEW');
  const canViewInstallments = hasRental && permissions.includes('RENTAL_INSTALLMENTS_VIEW');
  // Le module de maintenance n'expose qu'une permission de gestionnaire, et
  // c'est bien la vue agence que sert ce tableau de bord, pas celle du
  // demandeur (`MAINTENANCE_TENANT`).
  const canViewMaintenance = permissions.includes('MAINTENANCE_ADMIN');
  // Copropriété : permission propre `SYNDIC_VIEW` (`routes/syndic-routes.ts`),
  // qu'un Agent ne détient pas. Patrimoine : routes gardées par
  // `PROPERTIES_VIEW` (`routes/patrimoine-routes.ts`). Le tableau de bord
  // applique la même règle que la route, sans quoi il afficherait un chiffre
  // menant vers un écran interdit.
  const canViewSyndic = permissions.includes('SYNDIC_VIEW') && hasFeature('SYNDIC');
  const canViewPatrimoine = canViewProperties && hasFeature('PATRIMOINE');

  const now = new Date();
  const periodStart = startOfCurrentMonth(now);
  const periodEnd = startOfNextMonth(now);
  const previousStart = addMonths(periodStart, -1);
  const seriesStart = addMonths(periodStart, -(SERIES_MONTHS - 1));
  const base = `/tenant/${tenantId}`;

  const [
    properties,
    clients,
    monthlyRevenue,
    transactions,
    revenueSeries,
    rental,
    pipeline,
    maintenance,
    syndic,
    patrimoine,
    workQueue,
    recentActivity
  ] = await Promise.all([
    canViewProperties ? getProperties(tenantId, base) : null,
    canViewContacts ? getClients(tenantId, base) : null,
    canViewPayments
      ? getMonthlyRevenue(tenantId, { periodStart, periodEnd, previousStart, canViewInstallments })
      : null,
    getTransactions(tenantId, { canViewDeals, canViewLeases }),
    canViewPayments ? getRevenueSeries(tenantId, { seriesStart, periodEnd, canViewInstallments }) : null,
    hasRental
      ? getRental(tenantId, base, now, { canViewLeases, canViewInstallments, canViewPayments, seriesStart })
      : null,
    canViewDeals ? getPipeline(tenantId, base) : null,
    canViewMaintenance ? getMaintenance(tenantId, base) : null,
    canViewSyndic ? getSyndic(tenantId, base) : null,
    canViewPatrimoine ? getPatrimoine(tenantId, base) : null,
    getWorkQueue(tenantId, base, now, { canViewInstallments, canViewPayments, canViewMaintenance }),
    getRecentActivity(tenantId, base, { canViewProperties, canViewContacts, canViewPayments })
  ]);

  return {
    properties,
    clients,
    monthlyRevenue,
    transactions,
    revenueSeries,
    rental,
    pipeline,
    maintenance,
    syndic,
    patrimoine,
    workQueue,
    recentActivity
  };
}

/** Parc immobilier : volume, publication, répartition par statut et par type. */
async function getProperties(tenantId: string, base: string): Promise<TenantDashboard['properties']> {
  const [total, published, statusGroups, typeGroups] = await Promise.all([
    prisma.property.count({ where: { tenantId } }),
    prisma.property.count({ where: { tenantId, isPublished: true } }),
    prisma.property.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.property.groupBy({ by: ['propertyType'], where: { tenantId }, _count: { _all: true } })
  ]);

  const byStatus = statusGroups
    .map(group => ({
      key: group.status as string,
      count: group._count._all,
      href: `${base}/properties?status=${group.status}`
    }))
    .sort((a, b) => b.count - a.count);

  const byType = typeGroups
    .map(group => ({
      key: group.propertyType as string,
      count: group._count._all,
      href: `${base}/properties?propertyType=${group.propertyType}`
    }))
    .sort((a, b) => b.count - a.count);

  // Taux d'occupation : ce qui est loué ou vendu, rapporté au parc entier. Les
  // brouillons comptent au dénominateur — un bien saisi et jamais publié est du
  // parc immobilisé, et c'est précisément ce que le chiffre doit dire.
  const occupe = byStatus
    .filter(bucket => bucket.key === 'RENTED' || bucket.key === 'SOLD')
    .reduce((somme, bucket) => somme + bucket.count, 0);

  return { total, published, occupancyRate: part(occupe, total), byStatus, byType };
}

/** Portefeuille de contacts, réparti entre prospects, clients et archives. */
async function getClients(tenantId: string, base: string): Promise<TenantDashboard['clients']> {
  const [total, statusGroups] = await Promise.all([
    prisma.crmContact.count({ where: { tenantId } }),
    prisma.crmContact.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } })
  ]);

  return {
    total,
    byStatus: statusGroups
      .map(group => ({
        key: group.status as string,
        count: group._count._all,
        // Sans paramètre de filtre : l'écran des contacts garde encore son
        // état en mémoire et ignorerait un `?status=`. Promettre un filtre qui
        // ne s'applique pas serait pire que de renvoyer à la liste entière
        // (P6). Le paramètre reviendra avec la migration de cet écran.
        href: `${base}/crm/contacts`
      }))
      .sort((a, b) => b.count - a.count)
  };
}

/** Recette du mois, celle du mois précédent, et ce qui était attendu. */
async function getMonthlyRevenue(
  tenantId: string,
  options: { periodStart: Date; periodEnd: Date; previousStart: Date; canViewInstallments: boolean }
): Promise<TenantDashboard['monthlyRevenue']> {
  const { periodStart, periodEnd, previousStart, canViewInstallments } = options;

  const [current, previous, expected] = await Promise.all([
    prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        // `succeeded_at` est la date où l'argent est arrivé ; `created_at` est
        // celle de la saisie, qui peut tomber un autre mois.
        succeeded_at: { gte: periodStart, lt: periodEnd }
      },
      _sum: { amount: true }
    }),
    prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        succeeded_at: { gte: previousStart, lt: periodStart }
      },
      _sum: { amount: true }
    }),
    canViewInstallments
      ? prisma.rentalInstallment.aggregate({
          where: {
            tenant_id: tenantId,
            status: { not: RentalInstallmentStatus.CANCELED },
            due_date: { gte: periodStart, lt: periodEnd }
          },
          _sum: { amount_rent: true, amount_service: true, amount_other_fees: true, penalty_amount: true }
        })
      : null
  ]);

  return {
    amount: toNumber(current._sum.amount),
    previousAmount: toNumber(previous._sum.amount),
    expected: expected
      ? toNumber(expected._sum.amount_rent) +
        toNumber(expected._sum.amount_service) +
        toNumber(expected._sum.amount_other_fees) +
        toNumber(expected._sum.penalty_amount)
      : 0,
    currency: 'FCFA',
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString()
  };
}

/**
 * « Transactions » au sens de la page du même nom : les affaires CRM pour la
 * vente, les baux pour la location.
 */
async function getTransactions(
  tenantId: string,
  access: { canViewDeals: boolean; canViewLeases: boolean }
): Promise<TenantDashboard['transactions']> {
  const [deals, leases] = await Promise.all([
    access.canViewDeals ? prisma.crmDeal.count({ where: { tenantId } }) : null,
    access.canViewLeases ? prisma.rentalLease.count({ where: { tenant_id: tenantId } }) : null
  ]);

  if (deals === null && leases === null) return null;
  return { total: (deals ?? 0) + (leases ?? 0), deals, leases };
}

/**
 * Douze mois d'encaissements et d'échéances.
 *
 * L'agrégation par mois se fait en mémoire, sur deux requêtes bornées à la
 * fenêtre qui ne rapportent que les colonnes nécessaires : `groupBy` ne sait
 * pas grouper par mois, et une agrégation par mois ferait vingt-quatre
 * requêtes là où deux suffisent.
 */
async function getRevenueSeries(
  tenantId: string,
  options: { seriesStart: Date; periodEnd: Date; canViewInstallments: boolean }
): Promise<DashboardSeriesPoint[]> {
  const { seriesStart, periodEnd, canViewInstallments } = options;

  const [payments, installments] = await Promise.all([
    prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        succeeded_at: { gte: seriesStart, lt: periodEnd }
      },
      select: { amount: true, succeeded_at: true }
    }),
    canViewInstallments
      ? prisma.rentalInstallment.findMany({
          where: {
            tenant_id: tenantId,
            status: { not: RentalInstallmentStatus.CANCELED },
            due_date: { gte: seriesStart, lt: periodEnd }
          },
          select: {
            due_date: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            penalty_amount: true
          }
        })
      : []
  ]);

  const points: DashboardSeriesPoint[] = [];
  const index = new Map<string, DashboardSeriesPoint>();

  for (let decalage = 0; decalage < SERIES_MONTHS; decalage += 1) {
    const mois = addMonths(seriesStart, decalage);
    const point: DashboardSeriesPoint = { month: mois.toISOString(), encaisse: 0, attendu: 0 };
    points.push(point);
    index.set(cleDeMois(mois), point);
  }

  for (const payment of payments) {
    const point = payment.succeeded_at ? index.get(cleDeMois(payment.succeeded_at)) : undefined;
    if (point) point.encaisse += toNumber(payment.amount);
  }

  for (const installment of installments) {
    const point = index.get(cleDeMois(installment.due_date));
    if (!point) continue;
    point.attendu +=
      toNumber(installment.amount_rent) +
      toNumber(installment.amount_service) +
      toNumber(installment.amount_other_fees) +
      toNumber(installment.penalty_amount);
  }

  return points;
}

/** Clé de regroupement mensuel, en heure locale comme les bornes de la fenêtre. */
function cleDeMois(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

type EcheanceGroup = {
  status: string;
  _count: { _all: number };
  _sum: {
    amount_rent: unknown;
    amount_service: unknown;
    amount_other_fees: unknown;
    penalty_amount: unknown;
    amount_paid: unknown;
  };
};

/**
 * Statut EFFECTIF des échéances (`computeInstallmentStatus`) : les Brouillon et
 * « À payer » échus passent de leur tranche stockée à « En retard », pour que
 * « Impayés » ne dépende pas de l'exécution du job quotidien.
 */
export function reclasserEcheancesEchues(groups: EcheanceGroup[], stale: EcheanceGroup[] | null): EcheanceGroup[] {
  if (!stale || stale.length === 0) return groups;
  const cles = ['amount_rent', 'amount_service', 'amount_other_fees', 'penalty_amount', 'amount_paid'] as const;
  const map = new Map<string, { count: number; sums: Record<string, number> }>();
  const ajouter = (status: string, group: EcheanceGroup, signe: 1 | -1) => {
    const entry = map.get(status) ?? { count: 0, sums: Object.fromEntries(cles.map(k => [k, 0])) };
    entry.count += signe * group._count._all;
    for (const k of cles) entry.sums[k] += signe * toNumber(group._sum[k]);
    map.set(status, entry);
  };
  for (const g of groups) ajouter(g.status, g, 1);
  for (const g of stale) {
    ajouter(g.status, g, -1);
    ajouter(RentalInstallmentStatus.OVERDUE, g, 1);
  }
  return [...map.entries()]
    .filter(([, e]) => e.count > 0)
    .map(([status, e]) => ({
      status,
      _count: { _all: e.count },
      _sum: {
        amount_rent: e.sums.amount_rent,
        amount_service: e.sums.amount_service,
        amount_other_fees: e.sums.amount_other_fees,
        penalty_amount: e.sums.penalty_amount,
        amount_paid: e.sums.amount_paid
      }
    }));
}

/** Gestion locative : baux, échéances, moyens de paiement, retards. */
async function getRental(
  tenantId: string,
  base: string,
  now: Date,
  access: { canViewLeases: boolean; canViewInstallments: boolean; canViewPayments: boolean; seriesStart: Date }
): Promise<TenantDashboard['rental']> {
  const { canViewLeases, canViewInstallments, canViewPayments, seriesStart } = access;
  if (!canViewLeases && !canViewInstallments && !canViewPayments) return null;

  const debutSemaine = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const finSemaine = new Date(debutSemaine);
  finSemaine.setDate(finSemaine.getDate() + 7);

  const hrefBail = (key: string) => `${base}/rental/leases?status=${key}`;
  const hrefEcheance = (key: string) => `${base}/rental/installments?status=${key}`;

  const [leaseGroups, installmentGroups, dueThisWeek, methodGroups, pendingDeclarations, staleGroups] =
    await Promise.all([
      canViewLeases
        ? prisma.rentalLease.groupBy({
            by: ['status'],
            where: { tenant_id: tenantId },
            _count: { _all: true },
            _sum: { rent_amount: true }
          })
        : null,
      canViewInstallments
        ? prisma.rentalInstallment.groupBy({
            by: ['status'],
            where: { tenant_id: tenantId, status: { not: RentalInstallmentStatus.CANCELED } },
            _count: { _all: true },
            _sum: {
              amount_rent: true,
              amount_service: true,
              amount_other_fees: true,
              penalty_amount: true,
              amount_paid: true
            }
          })
        : null,
      canViewInstallments
        ? prisma.rentalInstallment.aggregate({
            where: {
              tenant_id: tenantId,
              status: { in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.PARTIAL] },
              due_date: { gte: debutSemaine, lt: finSemaine }
            },
            _count: { _all: true },
            _sum: {
              amount_rent: true,
              amount_service: true,
              amount_other_fees: true,
              penalty_amount: true,
              amount_paid: true
            }
          })
        : null,
      canViewPayments
        ? prisma.rentalPayment.groupBy({
            by: ['method'],
            where: { tenant_id: tenantId, status: RentalPaymentStatus.SUCCESS, succeeded_at: { gte: seriesStart } },
            _count: { _all: true },
            _sum: { amount: true }
          })
        : null,
      canViewPayments
        ? prisma.rentalPaymentDeclaration.count({
            where: { tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING }
          })
        : null,
      // Échues et non basculées : comptées En retard sans attendre le job.
      canViewInstallments
        ? prisma.rentalInstallment.groupBy({
            by: ['status'],
            where: {
              tenant_id: tenantId,
              status: { in: [RentalInstallmentStatus.DRAFT, RentalInstallmentStatus.DUE] },
              due_date: { lt: debutSemaine }
            },
            _count: { _all: true },
            _sum: {
              amount_rent: true,
              amount_service: true,
              amount_other_fees: true,
              penalty_amount: true,
              amount_paid: true
            }
          })
        : null
    ]);

  const leasesByStatus = leaseGroups
    ? orderBuckets(
        leaseGroups.map(group => ({
          key: group.status as string,
          count: group._count._all,
          amount: toNumber(group._sum.rent_amount),
          href: hrefBail(group.status)
        })),
        LEASE_STATUS_ORDER,
        hrefBail
      )
    : null;

  // Le montant porté par une tranche d'échéances est le RESTE DÛ, pas le
  // montant appelé : c'est le seul des deux sur lequel on agit encore.
  const installmentsByStatus = installmentGroups
    ? orderBuckets(
        reclasserEcheancesEchues(installmentGroups, staleGroups).map(group => ({
          key: group.status as string,
          count: group._count._all,
          amount: Math.max(
            0,
            toNumber(group._sum.amount_rent) +
              toNumber(group._sum.amount_service) +
              toNumber(group._sum.amount_other_fees) +
              toNumber(group._sum.penalty_amount) -
              toNumber(group._sum.amount_paid)
          ),
          href: hrefEcheance(group.status)
        })),
        INSTALLMENT_STATUS_ORDER,
        hrefEcheance
      )
    : null;

  const retard = installmentsByStatus?.find(bucket => bucket.key === RentalInstallmentStatus.OVERDUE);

  return {
    activeLeases: leaseGroups
      ? (leaseGroups.find(group => group.status === RentalLeaseStatus.ACTIVE)?._count._all ?? 0)
      : null,
    leasesByStatus,
    installmentsByStatus,
    paymentsByMethod: methodGroups
      ? methodGroups
          .map(group => ({
            key: group.method as string,
            count: group._count._all,
            amount: toNumber(group._sum.amount),
            href: `${base}/rental/payments`
          }))
          .sort((a, b) => b.amount - a.amount)
      : null,
    overdue: retard ? { count: retard.count, amount: retard.amount ?? 0 } : null,
    dueThisWeek: dueThisWeek
      ? {
          count: dueThisWeek._count._all,
          amount: Math.max(
            0,
            toNumber(dueThisWeek._sum.amount_rent) +
              toNumber(dueThisWeek._sum.amount_service) +
              toNumber(dueThisWeek._sum.amount_other_fees) +
              toNumber(dueThisWeek._sum.penalty_amount) -
              toNumber(dueThisWeek._sum.amount_paid)
          )
        }
      : null,
    pendingDeclarations
  };
}

/** Entonnoir des affaires : volume et valeur espérée par étape. */
async function getPipeline(tenantId: string, base: string): Promise<DashboardBucket[]> {
  const groups = await prisma.crmDeal.groupBy({
    by: ['stage'],
    where: { tenantId },
    _count: { _all: true },
    _sum: { expectedValue: true }
  });

  // Même raison que pour les contacts : la liste des affaires ne lit pas encore
  // ses filtres dans l'URL, un `?stage=` y serait ignoré.
  const href = () => `${base}/crm/deals`;

  return orderBuckets(
    groups.map(group => ({
      key: group.stage as string,
      count: group._count._all,
      amount: toNumber(group._sum.expectedValue),
      href: href()
    })),
    DEAL_STAGE_ORDER,
    href
  );
}

/** Tickets de maintenance, par statut et par priorité. */
async function getMaintenance(tenantId: string, base: string): Promise<TenantDashboard['maintenance']> {
  const [statusGroups, priorityGroups] = await Promise.all([
    prisma.maintenanceTicket.groupBy({
      by: ['status'],
      where: { tenant_id: tenantId },
      _count: { _all: true }
    }),
    prisma.maintenanceTicket.groupBy({
      by: ['priority'],
      where: { tenant_id: tenantId, status: { in: OPEN_TICKET_STATUSES } },
      _count: { _all: true }
    })
  ]);

  // La liste des tickets de l'agence ne lit pas encore de filtre d'URL : le
  // lien mène à la liste entière plutôt qu'à un filtre qui serait ignoré (P6).
  const href = () => `${base}/admin/maintenance/tickets`;

  const byStatus = orderBuckets(
    statusGroups.map(group => ({
      key: group.status as string,
      count: group._count._all,
      href: href()
    })),
    TICKET_STATUS_ORDER,
    href
  );

  return {
    open: byStatus
      .filter(bucket => OPEN_TICKET_STATUSES.includes(bucket.key as MaintenanceTicketStatus))
      .reduce((somme, bucket) => somme + bucket.count, 0),
    byStatus,
    byPriority: orderBuckets(
      priorityGroups.map(group => ({
        key: group.priority as string,
        count: group._count._all,
        href: href()
      })),
      TICKET_PRIORITY_ORDER,
      href
    )
  };
}

/**
 * Copropriétés : volume, lots, et recouvrement des appels de charges.
 *
 * `SyndicateLot` et `ChargeCall` ne portent pas de `tenant_id` : ils sont
 * rattachés à une copropriété, qui elle en porte un. Le filtre passe donc par
 * la relation — l'oublier ferait fuir les chiffres d'une agence vers l'autre.
 */
async function getSyndic(tenantId: string, base: string): Promise<TenantDashboard['syndic']> {
  const [syndicates, lots, chargeGroups] = await Promise.all([
    prisma.syndicate.count({ where: { tenantId } }),
    prisma.syndicateLot.count({ where: { syndicate: { tenantId } } }),
    prisma.chargeCall.groupBy({
      by: ['status'],
      where: { syndicate: { tenantId } },
      _count: { _all: true },
      _sum: { amount: true }
    })
  ]);

  const chargeCallsByStatus = chargeGroups
    .map(group => ({
      key: group.status as string,
      count: group._count._all,
      amount: toNumber(group._sum.amount),
      href: `${base}/syndics`
    }))
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  const appele = chargeCallsByStatus.reduce((somme, bucket) => somme + (bucket.amount ?? 0), 0);
  const solde = chargeCallsByStatus
    .filter(bucket => bucket.key === 'PAID')
    .reduce((somme, bucket) => somme + (bucket.amount ?? 0), 0);

  return { syndicates, lots, chargeCallsByStatus, recoveryRate: part(solde, appele) };
}

/** Patrimoine : programmes de travaux et enveloppe engagée. */
async function getPatrimoine(tenantId: string, base: string): Promise<TenantDashboard['patrimoine']> {
  const groups = await prisma.workProgram.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { _all: true },
    _sum: { estimatedCost: true }
  });

  const href = (key: string) => `${base}/patrimoine/work-programs?status=${key}`;

  const workProgramsByStatus = orderBuckets(
    groups.map(group => ({
      key: group.status as string,
      count: group._count._all,
      amount: toNumber(group._sum.estimatedCost),
      href: href(group.status)
    })),
    WORK_PROGRAM_STATUS_ORDER,
    href
  );

  return {
    workProgramsByStatus,
    // Ce qui reste à dépenser : planifié et en cours. Le terminé est de
    // l'histoire, l'annulé n'a jamais été engagé.
    plannedCost: workProgramsByStatus
      .filter(bucket => bucket.key === 'PLANNED' || bucket.key === 'IN_PROGRESS')
      .reduce((somme, bucket) => somme + (bucket.amount ?? 0), 0)
  };
}

/**
 * La file « à traiter aujourd'hui ».
 *
 * Trois sources, dans l'ordre où elles coûtent de l'argent à l'agence : un
 * loyer en retard, une déclaration de paiement qui attend sa validation, un
 * ticket urgent. Chaque ligne porte son lien — l'écran n'est pas un rapport,
 * c'est un point de départ (§6.14).
 */
async function getWorkQueue(
  tenantId: string,
  base: string,
  now: Date,
  access: { canViewInstallments: boolean; canViewPayments: boolean; canViewMaintenance: boolean }
): Promise<DashboardTask[]> {
  const [overdue, declarations, tickets] = await Promise.all([
    access.canViewInstallments
      ? prisma.rentalInstallment.findMany({
          where: {
            tenant_id: tenantId,
            OR: [
              { status: RentalInstallmentStatus.OVERDUE },
              {
                status: { in: [RentalInstallmentStatus.DRAFT, RentalInstallmentStatus.DUE] },
                due_date: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
              }
            ]
          },
          select: {
            id: true,
            due_date: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            penalty_amount: true,
            amount_paid: true,
            lease: {
              select: { lease_number: true, property: { select: { title: true, address: true } } }
            }
          },
          orderBy: { due_date: 'asc' },
          take: WORK_QUEUE_PER_SOURCE
        })
      : [],
    access.canViewPayments
      ? prisma.rentalPaymentDeclaration.findMany({
          where: { tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING },
          select: {
            id: true,
            amount: true,
            payment_date: true,
            payment_method: true,
            lease: { select: { lease_number: true } }
          },
          orderBy: { payment_date: 'asc' },
          take: WORK_QUEUE_PER_SOURCE
        })
      : [],
    access.canViewMaintenance
      ? prisma.maintenanceTicket.findMany({
          where: {
            tenant_id: tenantId,
            status: { in: OPEN_TICKET_STATUSES },
            priority: { in: [MaintenanceTicketPriority.URGENT, MaintenanceTicketPriority.HIGH] }
          },
          select: {
            id: true,
            title: true,
            priority: true,
            declared_at: true,
            property: { select: { title: true, address: true } }
          },
          orderBy: { declared_at: 'asc' },
          take: WORK_QUEUE_PER_SOURCE
        })
      : []
  ]);

  const joursDeRetard = (due: Date): number => Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));

  const taches: DashboardTask[] = [
    ...overdue.map(echeance => {
      const reste = Math.max(
        0,
        toNumber(echeance.amount_rent) +
          toNumber(echeance.amount_service) +
          toNumber(echeance.amount_other_fees) +
          toNumber(echeance.penalty_amount) -
          toNumber(echeance.amount_paid)
      );
      const bien = echeance.lease?.property?.title || echeance.lease?.property?.address || null;
      const retard = joursDeRetard(echeance.due_date);

      return {
        id: `installment:${echeance.id}`,
        kind: 'OVERDUE_INSTALLMENT' as const,
        title: [echeance.lease?.lease_number, bien].filter(Boolean).join(' · ') || 'Échéance en retard',
        description: `${retard} j de retard`,
        amount: reste,
        occurredAt: echeance.due_date.toISOString(),
        severity: 'danger' as const,
        href: `${base}/rental/installments/${echeance.id}`
      };
    }),
    ...declarations.map(declaration => ({
      id: `declaration:${declaration.id}`,
      kind: 'PENDING_DECLARATION' as const,
      title: declaration.lease?.lease_number
        ? `Déclaration à valider · ${declaration.lease.lease_number}`
        : 'Déclaration à valider',
      description: declaration.payment_method,
      amount: toNumber(declaration.amount),
      occurredAt: declaration.payment_date.toISOString(),
      severity: 'warning' as const,
      // L'onglet vit dans l'URL de l'écran des paiements : le lien ouvre
      // directement la liste des déclarations en attente.
      href: `${base}/rental/payments?onglet=declarations`
    })),
    ...tickets.map(ticket => ({
      id: `ticket:${ticket.id}`,
      kind: 'URGENT_TICKET' as const,
      title: ticket.title,
      description: ticket.property?.title || ticket.property?.address || 'Bien non renseigné',
      amount: null,
      occurredAt: ticket.declared_at.toISOString(),
      severity: ticket.priority === MaintenanceTicketPriority.URGENT ? ('danger' as const) : ('warning' as const),
      href: `${base}/admin/maintenance/tickets/${ticket.id}`
    }))
  ];

  // Le plus urgent d'abord : la gravité prime, puis l'ancienneté.
  const poids: Record<DashboardTask['severity'], number> = { danger: 0, warning: 1, info: 2 };
  return taches
    .sort((a, b) => poids[a.severity] - poids[b.severity] || a.occurredAt.localeCompare(b.occurredAt))
    .slice(0, WORK_QUEUE_LIMIT);
}

/** Fusionne les dernières lignes de chaque source lisible en un seul fil. */
async function getRecentActivity(
  tenantId: string,
  base: string,
  access: { canViewProperties: boolean; canViewContacts: boolean; canViewPayments: boolean }
): Promise<DashboardActivity[]> {
  const [properties, contacts, payments] = await Promise.all([
    access.canViewProperties
      ? prisma.property.findMany({
          where: { tenantId },
          select: { id: true, title: true, address: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: RECENT_ACTIVITY_PER_SOURCE
        })
      : [],
    access.canViewContacts
      ? prisma.crmContact.findMany({
          where: { tenantId },
          select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: RECENT_ACTIVITY_PER_SOURCE
        })
      : [],
    access.canViewPayments
      ? prisma.rentalPayment.findMany({
          where: {
            tenant_id: tenantId,
            status: RentalPaymentStatus.SUCCESS,
            succeeded_at: { not: null }
          },
          select: {
            id: true,
            amount: true,
            succeeded_at: true,
            lease: { select: { lease_number: true } }
          },
          orderBy: { succeeded_at: 'desc' },
          take: RECENT_ACTIVITY_PER_SOURCE
        })
      : []
  ]);

  const activities: DashboardActivity[] = [
    ...properties.map(property => ({
      id: `property:${property.id}`,
      type: 'PROPERTY_CREATED' as const,
      title: 'Nouvelle propriété ajoutée',
      description: [property.title, property.address].filter(Boolean).join(' - '),
      amount: null,
      occurredAt: property.createdAt.toISOString(),
      href: `${base}/properties/${property.id}`
    })),
    ...contacts.map(contact => ({
      id: `contact:${contact.id}`,
      type: 'CONTACT_CREATED' as const,
      title: 'Nouveau client enregistré',
      description: [`${contact.firstName} ${contact.lastName}`.trim(), contact.email].filter(Boolean).join(' - '),
      amount: null,
      occurredAt: contact.createdAt.toISOString(),
      href: `${base}/crm/contacts/${contact.id}`
    })),
    ...payments.map(payment => ({
      id: `payment:${payment.id}`,
      type: 'PAYMENT_SUCCEEDED' as const,
      title: 'Paiement encaissé',
      description: payment.lease?.lease_number ? `bail ${payment.lease.lease_number}` : '',
      amount: toNumber(payment.amount),
      // `succeeded_at` est filtré non nul ci-dessus.
      occurredAt: (payment.succeeded_at as Date).toISOString(),
      href: `${base}/rental/payments/${payment.id}`
    }))
  ];

  return activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, RECENT_ACTIVITY_LIMIT);
}
