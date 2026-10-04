/**
 * Lots, coût de revient par lot et clôture de chantier — lot 4, sixième et
 * dernier sous-lot (`types-lot4-closing.ts`, PRD E6, besoins P16 et P17).
 *
 * Implémente les onze fonctions du contrat gelé. Style suivi :
 * `lib/finance/salaries.ts` (sous-lot précédent) pour la forme générale,
 * `lib/finance/partnerships.ts` pour la répartition proportionnelle et le
 * reliquat d'arrondi.
 *
 * ---------------------------------------------------------------------------
 * `assertSiteOpenTx` : le cœur du sous-lot, et QUI l'appelle
 * ---------------------------------------------------------------------------
 *
 * C'est elle qui rend `finalCost` vrai (voir l'en-tête du contrat). Elle est
 * écrite et testée ICI, mais elle doit être appelée depuis les CINQ points
 * d'écriture d'imputation qui appartiennent à d'autres sous-lots :
 *
 *   1. `suppliers.ts`      — validation d'une facture fournisseur ;
 *   2. `cash.ts`           — validation d'une pièce de caisse ;
 *   3. `salaries.ts`       — validation d'une note de salaire portant un chantier ;
 *   4. `contractors.ts`    — validation d'une situation d'avancement ;
 *   5. `land-leases.ts`    — constatation de loyer de terrain imputée à un chantier.
 *
 * **Ces cinq appels ne sont PAS posés par ce fichier** : ils touchent cinq
 * fichiers hors de son territoire. C'est le superviseur qui les pose à
 * l'intégration. Tant qu'ils manquent, la première moitié de la garde décrite
 * par le contrat est absente et `finalCost` peut diverger du coût réel — c'est
 * la dette la plus importante laissée par ce sous-lot, signalée telle quelle
 * dans son rapport.
 *
 * ---------------------------------------------------------------------------
 * Un chantier est clos quand `closedAt` est renseigné — un seul critère
 * ---------------------------------------------------------------------------
 *
 * Pas « `status === 'CLOSED'` OU `closedAt` renseigné » : deux critères
 * finissent par se contredire, et c'est exactement le genre d'écart qui fait
 * qu'une garde laisse passer ce qu'une autre refuse. `closeSiteTx` écrit les
 * deux ensemble, `reopenSiteTx` les efface ensemble, et aucun autre chemin du
 * module n'écrit `status` sur un chantier (vérifié : `sites.ts` ne le touche
 * jamais). Le critère retenu est `closedAt`, parce que c'est lui qui va de
 * pair avec `finalCost`, le chiffre qu'il s'agit de protéger.
 *
 * ---------------------------------------------------------------------------
 * Le coût par lot est DÉRIVÉ (principe P-4)
 * ---------------------------------------------------------------------------
 *
 * Aucune colonne ne le porte. Il se recalcule à chaque lecture, à partir du
 * coût du chantier (figé s'il est clos, `sumSiteActualCost` sinon — la SEULE
 * définition du coût réel, `site-cost.ts`) et de la clé de répartition.
 *
 * ---------------------------------------------------------------------------
 * Deux grandeurs distinctes, et deux arrondis distincts
 * ---------------------------------------------------------------------------
 *
 * - `sharePercent` est un POURCENTAGE : `roundPercent`, deux décimales.
 * - `costPrice` est un MONTANT en francs CFA : `roundMoneyXof`, entier.
 *
 * Et surtout : le coût n'est PAS calculé depuis le pourcentage arrondi, sauf
 * en `MANUAL` où le pourcentage arrondi EST la donnée saisie. En `EQUAL` et en
 * `SURFACE`, la répartition part du rapport exact (1/n, surface/surface
 * totale) : passer par « 33,33 % » ferait perdre cent francs sur un million
 * avant même le reliquat d'arrondi.
 */

import { PropertyOwnershipType, PropertyType, SiteLotAllocationMethod } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import { lockStockSiteTx } from './stock-controles';
import { assertCapacityTx, syncLotActivationsTx } from '../../services/lot-registry-service';
import { roundMoneyXof, roundPercent } from './money';
import type { FinanceReadClient } from './site-cost';
import { sumSiteActualCost } from './site-cost';
import { toAmount, toAmountOrZero } from './types';
import { storedPropertyReliability } from '../patrimoine/property-asset';
import type {
  AssertSiteOpenTx,
  CapitalizeSiteLotTx,
  CapitalizedLotRecord,
  CloseSiteTx,
  CreateSiteLotTx,
  DeleteSiteLotTx,
  GetSiteClosureBlockers,
  GetSiteCostBreakdown,
  ListSiteLots,
  ReopenSiteTx,
  SetLotAllocationMethodTx,
  SiteClosureBlocker,
  SiteClosureRecord,
  SiteCostBreakdownRecord,
  SiteLotRecord,
  UpdateSiteLotTx
} from './types-lot4-closing';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Formes lues
// ---------------------------------------------------------------------------

/**
 * Un montant tel que Prisma le rend : `Decimal` en base, `number` dans un
 * magasin de test. Les deux passent par `toAmount`/`toAmountOrZero`.
 */
type DecimalLike = Prisma.Decimal | number | null | undefined;

interface SiteShape {
  id: string;
  name: string;
  closedAt: Date | null;
  finalCost: DecimalLike;
  lotAllocationMethod: SiteLotAllocationMethod | null;
  closedByUserId?: string | null;
  closedBy?: { fullName?: string | null; email?: string | null } | null;
}

interface LotShape {
  id: string;
  siteId: string;
  name: string;
  surfaceArea: DecimalLike;
  manualSharePercent: DecimalLike;
  propertyId: string | null;
  property?: { title?: string | null } | null;
}

/**
 * L'ordre de création, et rien d'autre.
 *
 * Il détermine QUI reçoit le reliquat d'arrondi — « le premier lot, par ordre
 * de création » (contrat). `id` ne sert que de départage déterministe quand
 * deux lots partagent la même horodate, ce qui arrive dans un test et jamais
 * en base.
 */
const LOT_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

const LOT_SELECT = {
  id: true,
  siteId: true,
  name: true,
  surfaceArea: true,
  manualSharePercent: true,
  propertyId: true,
  property: { select: { title: true } }
} as const;

const SITE_SELECT = {
  id: true,
  name: true,
  closedAt: true,
  finalCost: true,
  lotAllocationMethod: true,
  closedByUserId: true
} as const;

function isClosed(site: { closedAt: Date | null }): boolean {
  return site.closedAt !== null && site.closedAt !== undefined;
}

function toUserLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

// ---------------------------------------------------------------------------
// La répartition — poids exacts, puis reliquat au premier lot
// ---------------------------------------------------------------------------

/**
 * Les POIDS de la répartition, en fraction de l'unité.
 *
 * Renvoie `null` quand la clé ne s'applique pas — pas de clé du tout, surface
 * totale nulle, quotes-parts manuelles toutes absentes. Dans ce cas, aucun
 * coût n'est réparti et RIEN n'est versé au premier lot : lui donner le coût
 * entier au titre du reliquat serait un chiffre faux qui a l'air juste, et
 * c'est précisément ce que `unallocatedCost` existe pour montrer à l'écran.
 *
 * `EQUAL` et `SURFACE` partent du rapport EXACT. `MANUAL` part des
 * quotes-parts ARRONDIES — celles qui sont stockées, et sur lesquelles la
 * somme des cent pour cent est vérifiée (défaut n°1 du moteur comptable).
 */
function computeWeights(method: SiteLotAllocationMethod | null, lots: LotShape[]): number[] | null {
  if (!method || lots.length === 0) {
    return null;
  }

  if (method === 'EQUAL') {
    return lots.map(() => 1 / lots.length);
  }

  if (method === 'SURFACE') {
    const surfaces = lots.map(lot => Math.max(0, toAmountOrZero(lot.surfaceArea)));
    const total = surfaces.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return null;
    }
    return surfaces.map(surface => surface / total);
  }

  // MANUAL
  const shares = lots.map(lot => roundPercent(toAmountOrZero(lot.manualSharePercent)));
  if (shares.reduce((sum, value) => sum + value, 0) <= 0) {
    return null;
  }
  return shares.map(share => share / 100);
}

/**
 * Les pourcentages AFFICHÉS, à deux décimales.
 *
 * Volontairement non normalisés : trois lots en parts égales affichent 33,33 %
 * chacun, pas 33,34 / 33,33 / 33,33. C'est le COÛT qui doit tomber juste au
 * franc près, pas le pourcentage — et le forcer à cent ferait mentir la
 * quote-part manuelle saisie par la gestionnaire, qui est une donnée et non un
 * résultat.
 */
function computeSharePercents(method: SiteLotAllocationMethod | null, lots: LotShape[]): number[] {
  const weights = computeWeights(method, lots);
  if (!weights) {
    return lots.map(() => 0);
  }
  return weights.map(weight => roundPercent(weight * 100));
}

/**
 * Répartit `totalCost` entre les lots, exhaustivement.
 *
 * **La somme des coûts rendus vaut exactement `totalCost`** dès qu'une clé
 * s'applique. Le reliquat d'arrondi — positif ou négatif selon le sens des
 * arrondis individuels — va au PREMIER lot, par ordre de création. Même règle
 * qu'à la ventilation entre associés (`partnerships.ts`,
 * `splitAmountAcrossShares`), et pour la même raison : sans elle, la somme des
 * coûts de revient ne vaudrait pas le coût du chantier, et personne ne
 * saurait où sont passés les cent francs manquants.
 */
function splitCostAcrossLots(totalCost: number, method: SiteLotAllocationMethod | null, lots: LotShape[]): number[] {
  const weights = computeWeights(method, lots);
  if (!weights) {
    return lots.map(() => 0);
  }

  const raw = weights.map(weight => roundMoneyXof(totalCost * weight));
  const sum = raw.reduce((accumulator, value) => accumulator + value, 0);
  raw[0] = roundMoneyXof(raw[0] + (totalCost - sum));
  return raw;
}

function toSiteLotRecords(
  lots: LotShape[],
  method: SiteLotAllocationMethod | null,
  totalCost: number
): SiteLotRecord[] {
  const shares = computeSharePercents(method, lots);
  const costs = splitCostAcrossLots(totalCost, method, lots);

  return lots.map((lot, index) => ({
    id: lot.id,
    siteId: lot.siteId,
    name: lot.name,
    surfaceArea: toAmount(lot.surfaceArea),
    manualSharePercent:
      lot.manualSharePercent === null || lot.manualSharePercent === undefined
        ? null
        : roundPercent(toAmountOrZero(lot.manualSharePercent)),
    sharePercent: shares[index],
    costPrice: costs[index],
    currency: DEFAULT_CURRENCY,
    propertyId: lot.propertyId ?? null,
    propertyLabel: lot.property?.title ?? null
  }));
}

// ---------------------------------------------------------------------------
// Lectures partagées
// ---------------------------------------------------------------------------

async function loadSiteOrThrow(client: FinanceReadClient, tenantId: string, siteId: string): Promise<SiteShape> {
  const site = await client.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: SITE_SELECT });
  if (!site) {
    throw notFound('Chantier introuvable');
  }
  return site as unknown as SiteShape;
}

async function loadLots(client: FinanceReadClient, tenantId: string, siteId: string): Promise<LotShape[]> {
  const rows = await client.siteLot.findMany({
    where: { tenantId, siteId },
    select: LOT_SELECT,
    orderBy: LOT_ORDER
  });
  return rows as unknown as LotShape[];
}

/**
 * Le coût qui sert de base à la répartition : le coût FIGÉ si le chantier est
 * clos, le coût réel courant sinon.
 *
 * `sumSiteActualCost` est la seule définition du coût réel du module
 * (`site-cost.ts`) : ce fichier n'en écrit pas une sixième copie.
 */
async function resolveSiteTotalCost(client: FinanceReadClient, tenantId: string, site: SiteShape): Promise<number> {
  if (isClosed(site)) {
    const frozen = toAmount(site.finalCost);
    if (frozen !== null) {
      return roundMoneyXof(frozen);
    }
  }
  return roundMoneyXof(await sumSiteActualCost(client, tenantId, site.id));
}

// ---------------------------------------------------------------------------
// A. La garde transverse
// ---------------------------------------------------------------------------

/**
 * Voir `AssertSiteOpenTx` dans `./types-lot4-closing.ts`, et l'en-tête de ce
 * fichier pour la liste des cinq appelants que le superviseur doit brancher.
 *
 * **Lève aussi quand le chantier n'existe pas pour cette agence**, depuis
 * l'audit multi-tenant du 24 septembre 2026 (lot B1) : un `siteId` d'une
 * autre agence, glissé dans une imputation, ne doit produire ni silence ni
 * confirmation — la même `NotFoundError` qu'un chantier réellement
 * inexistant (voir `types-lot4-closing.ts` pour le détail de la faille
 * corrigée et la liste des appelants déjà à l'abri).
 */
export const assertSiteOpenTx: AssertSiteOpenTx = async (tx, tenantId, siteId) => {
  const site = await tx.constructionSite.findFirst({
    where: { id: siteId, tenantId },
    select: { id: true, name: true, closedAt: true }
  });

  if (!site) {
    throw notFound('Chantier introuvable');
  }

  if (isClosed(site)) {
    throw conflict(
      `Le chantier « ${site.name} » est clôturé : son coût est figé et n'accepte plus de nouvelle dépense. Rouvrez-le d'abord.`
    );
  }
};

// ---------------------------------------------------------------------------
// B. Les lots
// ---------------------------------------------------------------------------

function normalizeLotName(value: string | undefined): string {
  const name = (value ?? '').trim();
  if (!name) {
    throw badRequest('Le nom du lot est obligatoire');
  }
  return name;
}

function normalizeSurfaceArea(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw badRequest('La surface du lot doit être strictement positive');
  }
  return Number(value);
}

function normalizeManualShare(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const share = roundPercent(value);
  if (share <= 0) {
    throw badRequest('La quote-part du lot doit être strictement positive');
  }
  if (share > 100) {
    throw badRequest('La quote-part du lot ne peut pas dépasser cent pour cent');
  }
  return share;
}

/**
 * Deux lots du même chantier ne portent pas le même nom.
 *
 * **Lecture AVANT écriture.** En PostgreSQL une commande en échec condamne
 * toute la transaction : « tenter puis rattraper le P2002 » ne marche pas ici
 * (même raisonnement qu'à la note de salaire, `salaries.ts`). La contrainte
 * `@@unique([siteId, name])` reste le filet d'une collision réellement
 * concurrente ; son message brut ne doit jamais remonter tel quel, d'où ce
 * contrôle préalable traduit en 409 métier.
 */
async function assertLotNameFreeTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  name: string,
  exceptLotId?: string
): Promise<void> {
  const existing = await tx.siteLot.findFirst({
    where: { tenantId, siteId, name, ...(exceptLotId ? { NOT: { id: exceptLotId } } : {}) },
    select: { id: true }
  });
  if (existing) {
    throw conflict(`Un lot nommé « ${name} » existe déjà sur ce chantier`);
  }
}

/**
 * La somme des quotes-parts manuelles ne dépasse jamais cent, **sommée sur les
 * valeurs ARRONDIES** — celles qui sont stockées.
 *
 * C'est le défaut n°1 du moteur comptable, et il se rejoue partout où l'on
 * somme des parts. Même geste qu'à `addPartnershipShareTx`
 * (`partnerships.ts`).
 *
 * Le dépassement est refusé, le sous-total toléré : exiger cent à chaque
 * saisie rendrait toute reconfiguration impossible — on ne pourrait jamais
 * descendre deux lots de 50 à 33,33 pour en ajouter un troisième sans passer
 * par un état transitoire à 66,66. C'est `setLotAllocationMethodTx` qui exige
 * les cent pour cent exacts, au moment où la clé est arrêtée.
 */
async function assertManualSharesWithinHundredTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  candidateShare: number,
  exceptLotId?: string
): Promise<void> {
  const siblings = await tx.siteLot.findMany({
    where: { tenantId, siteId, ...(exceptLotId ? { NOT: { id: exceptLotId } } : {}) },
    select: { manualSharePercent: true }
  });

  const currentTotal = roundPercent(
    siblings.reduce((sum: number, lot: any) => sum + roundPercent(toAmountOrZero(lot.manualSharePercent)), 0)
  );
  const projectedTotal = roundPercent(currentTotal + candidateShare);

  if (projectedTotal > 100) {
    throw conflict(
      `La somme des quotes-parts dépasserait cent pour cent (${currentTotal} % déjà répartis, ${candidateShare} % demandés)`
    );
  }
}

/**
 * Refuse de rejouer la répartition d'un chantier dont un lot a déjà basculé.
 *
 * Ajouter, corriger ou supprimer un lot, ou changer la clé, change le coût de
 * revient de TOUS les lots — y compris ceux qui ont déjà produit un bien
 * portant ce coût pour valeur d'acquisition. Le bien existe désormais, et
 * rien ici ne le recalculera. Même raison que le refus de réouverture (voir
 * `ReopenSiteTx`, contrat).
 */
async function assertNoCapitalizedLotTx(tx: PrismaTransactionClient, tenantId: string, siteId: string): Promise<void> {
  const capitalized = await tx.siteLot.count({ where: { tenantId, siteId, propertyId: { not: null } } });
  if (capitalized > 0) {
    throw conflict(
      'Au moins un lot de ce chantier a déjà basculé au patrimoine : sa répartition ne peut plus être modifiée'
    );
  }
}

async function readLotRecordTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  siteId: string,
  lotId: string
): Promise<SiteLotRecord> {
  const site = await loadSiteOrThrow(tx, tenantId, siteId);
  const lots = await loadLots(tx, tenantId, siteId);
  const totalCost = await resolveSiteTotalCost(tx, tenantId, site);
  const records = toSiteLotRecords(lots, site.lotAllocationMethod, totalCost);

  const record = records.find(candidate => candidate.id === lotId);
  if (!record) {
    throw notFound('Lot introuvable');
  }
  return record;
}

/** Voir `CreateSiteLotTx` dans `./types-lot4-closing.ts`. */
export const createSiteLotTx: CreateSiteLotTx = async (tx, tenantId, params) => {
  const site = await loadSiteOrThrow(tx, tenantId, params.siteId);

  // Refus sur un chantier clos : découper après coup ce qu'on a déclaré fini
  // rouvrirait la question du coût de revient de lots qui ont déjà basculé
  // (contrat).
  if (isClosed(site)) {
    throw conflict('Ce chantier est clôturé : on ne peut plus y ajouter de lot');
  }

  const name = normalizeLotName(params.name);
  const surfaceArea = normalizeSurfaceArea(params.surfaceArea);
  const manualSharePercent = normalizeManualShare(params.manualSharePercent);

  // La clé déjà en vigueur doit rester applicable : un lot sans surface sur un
  // chantier réparti à la surface recevrait zéro franc sans que rien ne le
  // dise, et la gestionnaire ne s'en apercevrait qu'en vendant au mauvais
  // prix (même raison que le refus de `setLotAllocationMethodTx`).
  if (site.lotAllocationMethod === 'SURFACE' && surfaceArea === null) {
    throw badRequest('Ce chantier répartit son coût à la surface : la surface du lot est obligatoire');
  }
  if (site.lotAllocationMethod === 'MANUAL' && manualSharePercent === null) {
    throw badRequest('Ce chantier répartit son coût par quotes-parts saisies : la quote-part du lot est obligatoire');
  }

  await assertLotNameFreeTx(tx, tenantId, params.siteId, name);
  if (manualSharePercent !== null) {
    await assertManualSharesWithinHundredTx(tx, tenantId, params.siteId, manualSharePercent);
  }

  const created = await tx.siteLot.create({
    data: { tenantId, siteId: params.siteId, name, surfaceArea, manualSharePercent },
    select: { id: true }
  });
  // Lot d'un chantier ouvert : compte dans la reserve de lots (PL:<id>).
  await syncLotActivationsTx(tx, tenantId, { siteLotIds: [created.id] });

  return readLotRecordTx(tx, tenantId, params.siteId, created.id);
};

/** Voir `UpdateSiteLotTx` dans `./types-lot4-closing.ts`. */
export const updateSiteLotTx: UpdateSiteLotTx = async (tx, tenantId, lotId, params) => {
  const lot = await tx.siteLot.findFirst({
    where: { id: lotId, tenantId },
    select: { id: true, siteId: true, name: true, propertyId: true }
  });
  if (!lot) {
    throw notFound('Lot introuvable');
  }

  // Refus dès que le lot a basculé : le bien créé porte déjà le coût calculé,
  // et le recalculer ici le laisserait mentir (contrat).
  if (lot.propertyId) {
    throw conflict('Ce lot a déjà basculé au patrimoine : il ne peut plus être corrigé');
  }
  // Et refus dès qu'un LOT VOISIN a basculé : corriger celui-ci change le coût
  // de revient de tous les autres, dont celui qui a déjà produit un bien.
  await assertNoCapitalizedLotTx(tx, tenantId, lot.siteId);

  const data: Record<string, unknown> = {};

  if (params.name !== undefined) {
    const name = normalizeLotName(params.name);
    if (name !== lot.name) {
      await assertLotNameFreeTx(tx, tenantId, lot.siteId, name, lotId);
    }
    data.name = name;
  }

  if ('surfaceArea' in params) {
    data.surfaceArea = normalizeSurfaceArea(params.surfaceArea);
  }

  if ('manualSharePercent' in params) {
    const manualSharePercent = normalizeManualShare(params.manualSharePercent);
    if (manualSharePercent !== null) {
      await assertManualSharesWithinHundredTx(tx, tenantId, lot.siteId, manualSharePercent, lotId);
    }
    data.manualSharePercent = manualSharePercent;
  }

  if (Object.keys(data).length > 0) {
    await tx.siteLot.updateMany({ where: { id: lotId, tenantId }, data });
  }

  return readLotRecordTx(tx, tenantId, lot.siteId, lotId);
};

/** Voir `DeleteSiteLotTx` dans `./types-lot4-closing.ts`. */
export const deleteSiteLotTx: DeleteSiteLotTx = async (tx, tenantId, lotId) => {
  const lot = await tx.siteLot.findFirst({
    where: { id: lotId, tenantId },
    select: { id: true, siteId: true, propertyId: true }
  });
  if (!lot) {
    throw notFound('Lot introuvable');
  }

  // Refus s'il a basculé : le bien existe, et un lot supprimé le laisserait
  // orphelin de toute explication sur d'où vient sa valeur (contrat).
  if (lot.propertyId) {
    throw conflict('Ce lot a déjà basculé au patrimoine : il ne peut plus être supprimé');
  }
  await assertNoCapitalizedLotTx(tx, tenantId, lot.siteId);

  await tx.siteLot.deleteMany({ where: { id: lotId, tenantId } });
  await syncLotActivationsTx(tx, tenantId, { siteLotIds: [lotId] }, { reason: 'SITE_LOT_DELETED' });
};

/** Voir `SetLotAllocationMethodTx` dans `./types-lot4-closing.ts`. */
export const setLotAllocationMethodTx: SetLotAllocationMethodTx = async (tx, tenantId, siteId, method) => {
  if (!Object.prototype.hasOwnProperty.call(SiteLotAllocationMethod, method)) {
    throw badRequest('Clé de répartition inconnue');
  }

  const site = await loadSiteOrThrow(tx, tenantId, siteId);
  await assertNoCapitalizedLotTx(tx, tenantId, siteId);

  const lots = await loadLots(tx, tenantId, siteId);

  // « Refuse plutôt que de répartir à moitié » (contrat) : une clé qui ne
  // s'applique pas produirait des coûts de revient faux sans le dire.
  if (method === 'SURFACE') {
    const sansSurface = lots.filter(lot => toAmountOrZero(lot.surfaceArea) <= 0);
    if (sansSurface.length > 0) {
      throw badRequest(
        `Répartition à la surface impossible : ${sansSurface.length} lot(s) n'ont pas de surface (${sansSurface
          .map(lot => lot.name)
          .join(', ')})`
      );
    }
  }

  if (method === 'MANUAL') {
    // Sommée sur les valeurs ARRONDIES, celles qui sont stockées. Défaut n°1
    // du moteur comptable : sommer les valeurs brutes laisserait passer
    // 33,333 + 33,333 + 33,334 = 100 alors que les valeurs stockées font
    // 99,99, et le franc manquant réapparaîtrait plus tard sans explication.
    const total = roundPercent(
      lots.reduce((sum, lot) => sum + roundPercent(toAmountOrZero(lot.manualSharePercent)), 0)
    );
    if (lots.length === 0 || total !== 100) {
      throw badRequest(
        `Répartition par quotes-parts impossible : la somme des quotes-parts vaut ${total} % au lieu de cent`
      );
    }
  }

  await tx.constructionSite.updateMany({ where: { id: siteId, tenantId }, data: { lotAllocationMethod: method } });

  const totalCost = await resolveSiteTotalCost(tx, tenantId, site);
  return toSiteLotRecords(lots, method, totalCost);
};

/** Voir `ListSiteLots` dans `./types-lot4-closing.ts`. */
export const listSiteLots: ListSiteLots = async (tenantId, siteId) => {
  const site = await loadSiteOrThrow(prisma, tenantId, siteId);
  const lots = await loadLots(prisma, tenantId, siteId);
  const totalCost = await resolveSiteTotalCost(prisma, tenantId, site);
  return toSiteLotRecords(lots, site.lotAllocationMethod, totalCost);
};

// ---------------------------------------------------------------------------
// C. Le coût de revient, vu du chantier
// ---------------------------------------------------------------------------

/** Voir `GetSiteCostBreakdown` dans `./types-lot4-closing.ts`. */
export const getSiteCostBreakdown: GetSiteCostBreakdown = async (tenantId, siteId) => {
  const site = await loadSiteOrThrow(prisma, tenantId, siteId);
  const lots = await loadLots(prisma, tenantId, siteId);
  const totalCost = await resolveSiteTotalCost(prisma, tenantId, site);
  const records = toSiteLotRecords(lots, site.lotAllocationMethod, totalCost);

  // Ce qui n'est réparti sur aucun lot. Nul dès qu'une clé s'applique — la
  // répartition est exhaustive par construction, reliquat d'arrondi compris.
  // Vaut `totalCost` quand le chantier n'a pas de lot, ET quand il en a mais
  // qu'aucune clé n'a encore été choisie : dans ce cas les quotes-parts valent
  // zéro (contrat, `SiteLotRecord.sharePercent`), les coûts aussi, et le total
  // doit bien apparaître quelque part plutôt que de disparaître de l'écran.
  const allocated = records.reduce((sum, record) => sum + record.costPrice, 0);

  const breakdown: SiteCostBreakdownRecord = {
    siteId: site.id,
    siteLabel: site.name,
    isClosed: isClosed(site),
    totalCost,
    allocationMethod: site.lotAllocationMethod ?? null,
    lots: records,
    unallocatedCost: roundMoneyXof(totalCost - allocated),
    currency: DEFAULT_CURRENCY
  };

  return breakdown;
};

// ---------------------------------------------------------------------------
// D. La clôture
// ---------------------------------------------------------------------------

function blockerMessage(count: number, singulier: string, pluriel: string): string {
  return count === 1
    ? `Une ${singulier} en brouillon vise encore ce chantier : validez-la ou supprimez-la avant de clôturer.`
    : `${count} ${pluriel} en brouillon visent encore ce chantier : validez-les ou supprimez-les avant de clôturer.`;
}

/**
 * Les bloqueurs, calculés UNE SEULE FOIS pour deux appelants.
 *
 * `getSiteClosureBlockers` les liste avec le client global,
 * `closeSiteTx` les applique avec le client de sa transaction. **La même
 * fonction, donc exactement les mêmes refus** : ce serait cruel de lister des
 * bloqueurs puis d'en appliquer d'autres (contrat), et deux implémentations
 * parallèles auraient fini par diverger — c'est le défaut que `site-cost.ts`
 * vient de corriger sur cinq copies du coût réel.
 *
 * Les quatre pièces regardées sont celles qui, une fois validées, produisent
 * une imputation RÉELLE sur le chantier. Un budget en brouillon et un bon de
 * commande en brouillon portent bien un statut `DRAFT` et un chantier, mais
 * aucun des deux ne devient une dépense : l'un est une prévision, l'autre un
 * engagement. Les faire bloquer la clôture interdirait de clore un chantier
 * dont le budget prévisionnel n'a jamais été validé, ce qui est courant.
 *
 * La situation d'avancement est lue **par le client Prisma**, via son contrat
 * (`ProgressStatement.contract.siteId`) : elle n'a pas de `siteId` à elle, et
 * ce fichier n'importe rien de `contractors.ts`.
 */
async function collectClosureBlockers(
  client: FinanceReadClient,
  tenantId: string,
  siteId: string
): Promise<SiteClosureBlocker[]> {
  const [draftInvoices, vouchers, salaryNotes, statements] = await Promise.all([
    // Les références sont listées pour que le message nomme les pièces à
    // traiter (BUG-2026-09-30-042) : un brouillon orphelin doit se retrouver.
    client.supplierInvoice.findMany({
      where: { tenantId, siteId, status: 'DRAFT' },
      select: { id: true, reference: true },
      orderBy: { reference: 'asc' }
    }),
    // La pièce de caisse n'a pas de colonne `status` : son brouillon se lit à
    // `validatedAt` nul, exactement comme `cash.ts` le fait pour l'afficher.
    client.cashVoucher.count({ where: { tenantId, siteId, validatedAt: null } }),
    client.salaryNote.count({ where: { tenantId, siteId, status: 'DRAFT' } }),
    client.progressStatement.count({ where: { tenantId, status: 'DRAFT', contract: { siteId } } })
  ]);

  const blockers: SiteClosureBlocker[] = [];
  const invoices = draftInvoices.length;

  if (invoices > 0) {
    // Une facture en brouillon se valide ou s'ANNULE (l'annulation d'un
    // brouillon est permise : elle le sort de la clôture sans écriture).
    const references = (draftInvoices as Array<{ reference: string }>).map(row => row.reference).join(', ');
    blockers.push({
      message: `${blockerMessage(invoices, 'facture fournisseur', 'factures fournisseur').replace(
        /supprimez-(la|les)/,
        'annulez-$1'
      )} Pièces concernées : ${references}.`,
      count: invoices,
      references: (draftInvoices as Array<{ reference: string }>).map(row => row.reference),
      documentIds: (draftInvoices as Array<{ id: string }>).map(row => row.id),
      documentType: 'SUPPLIER_INVOICE'
    });
  }
  if (vouchers > 0) {
    blockers.push({ message: blockerMessage(vouchers, 'pièce de caisse', 'pièces de caisse'), count: vouchers });
  }
  if (salaryNotes > 0) {
    blockers.push({
      message: blockerMessage(salaryNotes, 'note de salaire', 'notes de salaire'),
      count: salaryNotes
    });
  }
  if (statements > 0) {
    blockers.push({
      message: blockerMessage(statements, "situation d'avancement", "situations d'avancement"),
      count: statements
    });
  }

  blockers.push(...(await collectStockClosureBlockers(client, tenantId, siteId)));

  return blockers;
}

/**
 * Les trois bloqueurs de stock (lot 040, spec A7-R3), pour un chantier qui a
 * un lieu de stockage. Après la clôture, plus rien n'est imputable au
 * chantier : le reste qui dormirait sur son lieu deviendrait la matière la plus
 * facile à faire disparaître sans trace. D'où le parcours attendu —
 * inventaire de clôture (qui ajuste au réel), transfert du reste vers un
 * magasin, puis clôture.
 *
 * 1. `STOCK_COUNT` : un inventaire DRAFT ou COUNTED sur le lieu ;
 * 2. `STOCK_RESIDUAL` : au moins un solde de quantité > 0 sur le lieu ;
 * 3. `STOCK_CLOSING_COUNT_MISSING` : le lieu a reçu au moins une entrée
 *    (réception, transfert entrant, ajustement en hausse) et aucun inventaire
 *    CLOSING n'a été validé depuis la dernière. Les ajustements écrits par cet
 *    inventaire de clôture lui-même ne comptent pas comme une entrée
 *    postérieure.
 */
async function collectStockClosureBlockers(
  client: FinanceReadClient,
  tenantId: string,
  siteId: string
): Promise<SiteClosureBlocker[]> {
  const location = await client.stockLocation.findFirst({ where: { tenantId, siteId }, select: { id: true } });
  if (!location) {
    return [];
  }

  const [openCount, residualItems, lastClosing] = await Promise.all([
    client.stockCount.findFirst({
      where: { tenantId, locationId: location.id, status: { in: ['DRAFT', 'COUNTED'] } },
      select: { id: true }
    }),
    client.stockBalance.count({ where: { tenantId, locationId: location.id, quantity: { gt: 0 } } }),
    client.stockCount.findFirst({
      where: { tenantId, locationId: location.id, kind: 'CLOSING', status: 'VALIDATED' },
      orderBy: { validatedAt: 'desc' },
      select: { id: true, validatedAt: true }
    })
  ]);
  const lastIncoming = await client.stockMovement.findFirst({
    where: {
      tenantId,
      locationId: location.id,
      isDecrease: false,
      type: { in: ['RECEIPT', 'TRANSFER', 'ADJUSTMENT'] },
      // `not` seul écarterait aussi les mouvements sans inventaire (NULL).
      ...(lastClosing ? { OR: [{ stockCountId: null }, { stockCountId: { not: lastClosing.id } }] } : {})
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });

  const blockers: SiteClosureBlocker[] = [];
  if (openCount) {
    blockers.push({
      message: 'Un inventaire est en cours sur le lieu de stockage du chantier : terminez-le avant de clôturer.',
      count: 1,
      documentIds: [openCount.id],
      documentType: 'STOCK_COUNT'
    });
  }
  if (residualItems > 0) {
    blockers.push({
      message:
        "Le lieu de stockage du chantier porte encore du stock : faites l'inventaire de clôture, puis transférez le reste vers un magasin.",
      count: residualItems,
      documentIds: [location.id],
      documentType: 'STOCK_RESIDUAL'
    });
  }
  const closingValidatedAt = lastClosing?.validatedAt ?? null;
  if (lastIncoming && (!closingValidatedAt || closingValidatedAt.getTime() < lastIncoming.createdAt.getTime())) {
    blockers.push({
      message:
        "Le lieu de stockage du chantier n'a pas d'inventaire de clôture validé depuis sa dernière entrée de marchandise.",
      count: 1,
      documentIds: [location.id],
      documentType: 'STOCK_CLOSING_COUNT_MISSING'
    });
  }
  return blockers;
}

/** Voir `GetSiteClosureBlockers` dans `./types-lot4-closing.ts`. */
export const getSiteClosureBlockers: GetSiteClosureBlockers = async (tenantId, siteId) => {
  await loadSiteOrThrow(prisma, tenantId, siteId);
  return collectClosureBlockers(prisma, tenantId, siteId);
};

async function buildClosureRecord(
  client: FinanceReadClient,
  tenantId: string,
  siteId: string,
  closure: { closedAt: Date; closedByLabel: string; finalCost: number }
): Promise<SiteClosureRecord> {
  const site = await loadSiteOrThrow(client, tenantId, siteId);
  const lots = await loadLots(client, tenantId, siteId);

  return {
    siteId: site.id,
    siteLabel: site.name,
    closedAt: closure.closedAt,
    closedByLabel: closure.closedByLabel,
    finalCost: closure.finalCost,
    currency: DEFAULT_CURRENCY,
    lots: toSiteLotRecords(lots, site.lotAllocationMethod, closure.finalCost)
  };
}

/** Voir `CloseSiteTx` dans `./types-lot4-closing.ts`. */
export const closeSiteTx: CloseSiteTx = async (tx, tenantId, siteId, params) => {
  // Lot 040 (A7-R3 bis) : le verrou de chantier `stock-site` AVANT de vérifier
  // que le chantier est ouvert et avant `collectClosureBlockers`. Une réception
  // ou un transfert vers le lieu du chantier prend le même verrou : une entrée
  // et une clôture simultanées ne passent jamais toutes les deux. Pris avant la
  // lecture du chantier, pour que l'état lu soit celui d'après l'attente.
  await lockStockSiteTx(tx, siteId);
  const site = await loadSiteOrThrow(tx, tenantId, siteId);

  if (isClosed(site)) {
    // Re-figer un coût écraserait silencieusement le premier figeage, et les
    // lots déjà basculés porteraient une valeur qui ne correspondrait plus à
    // rien (contrat).
    throw conflict('Ce chantier est déjà clôturé');
  }

  const blockers = await collectClosureBlockers(tx, tenantId, siteId);
  if (blockers.length > 0) {
    // `AppError` et non `conflict(message, details)` : les détails de
    // `lib/errors` ne parviennent pas au client (spec 040 §8.3).
    throw new AppError(blockers.map(blocker => blocker.message).join(' '), 409, ErrorCode.CONFLICT, undefined, {
      blockers
    });
  }

  // `finalCost` reçoit le coût réel à CET instant, et rien d'autre.
  const finalCost = roundMoneyXof(await sumSiteActualCost(tx, tenantId, siteId));
  const closedAt = new Date();

  // Mise à jour conditionnelle sur `closedAt: null`, même discipline qu'aux
  // validations des sous-lots précédents : si une autre transaction a clôturé
  // ce chantier entre notre lecture et cet instant, `count` vaut 0 et on
  // abandonne plutôt que d'écraser son `finalCost`.
  const updated = await tx.constructionSite.updateMany({
    where: { id: siteId, tenantId, closedAt: null },
    data: { status: 'CLOSED', closedAt, finalCost, closedByUserId: params.closedByUserId }
  });
  if (updated.count !== 1) {
    throw conflict("Ce chantier vient d'être clôturé par ailleurs");
  }
  // Chantier CLOSED : ses lots de programme sortent de la reserve (D14).
  await syncLotActivationsTx(
    tx,
    tenantId,
    { siteIds: [siteId] },
    {
      actorUserId: params.closedByUserId,
      reason: 'SITE_CLOSED'
    }
  );

  const closedBy = await tx.user.findFirst({
    where: { id: params.closedByUserId },
    select: { fullName: true, email: true }
  });

  return buildClosureRecord(tx, tenantId, siteId, {
    closedAt,
    closedByLabel: toUserLabel(closedBy),
    finalCost
  });
};

/** Voir `ReopenSiteTx` dans `./types-lot4-closing.ts`. */
export const reopenSiteTx: ReopenSiteTx = async (tx, tenantId, siteId) => {
  const site = await loadSiteOrThrow(tx, tenantId, siteId);

  if (!isClosed(site)) {
    throw conflict("Ce chantier n'est pas clôturé");
  }

  // Refusé dès qu'un lot a basculé : un bien existe désormais, avec une valeur
  // d'acquisition tirée d'un coût qu'on s'apprêterait à faire bouger. Défaire
  // la bascule voudrait dire supprimer un bien qui vit peut-être déjà sa vie —
  // loué, publié, rattaché à un bail. On ne le propose pas (contrat).
  const capitalized = await tx.siteLot.count({ where: { tenantId, siteId, propertyId: { not: null } } });
  if (capitalized > 0) {
    throw conflict(
      `Réouverture impossible : ${capitalized} lot(s) ont déjà basculé au patrimoine, avec une valeur d'acquisition tirée du coût figé`
    );
  }

  // Les valeurs LIBÉRÉES, relues avant l'effacement : ce sont elles que
  // `SiteClosureRecord` décrit — la clôture qu'on vient de défaire. Le
  // chantier, lui, n'a plus ni date ni coût figé.
  const previousClosedAt = site.closedAt as Date;
  const previousFinalCost = roundMoneyXof(toAmountOrZero(site.finalCost));
  const previousClosedBy = site.closedByUserId
    ? await tx.user.findFirst({ where: { id: site.closedByUserId }, select: { fullName: true, email: true } })
    : null;

  // Rouvert, le chantier redevient actif (D14) : capacite CHANTIERS controlee
  // sous le verrou d'agence, puis ses lots recomptes.
  await assertCapacityTx(tx, tenantId, 'CHANTIERS');
  const updated = await tx.constructionSite.updateMany({
    where: { id: siteId, tenantId, closedAt: { not: null } },
    data: { status: 'IN_PROGRESS', closedAt: null, finalCost: null, closedByUserId: null }
  });
  if (updated.count !== 1) {
    throw conflict("Ce chantier vient d'être rouvert par ailleurs");
  }
  await syncLotActivationsTx(tx, tenantId, { siteIds: [siteId] }, { reason: 'SITE_REOPENED' });

  return buildClosureRecord(tx, tenantId, siteId, {
    closedAt: previousClosedAt,
    closedByLabel: toUserLabel(previousClosedBy),
    finalCost: previousFinalCost
  });
};

// ---------------------------------------------------------------------------
// E. La bascule au patrimoine
// ---------------------------------------------------------------------------

/**
 * `Property.propertyType` et `Property.ownershipType` sont des ENUMS Prisma ;
 * le contrat les type en `string` pour ne pas imposer un import d'enum dans
 * une signature gelée.
 *
 * La validation de forme est faite par le schéma Zod
 * (`schemas-site-closing.ts`) sur les vraies valeurs de l'énumération. Ce
 * contrôle-ci est le filet du domaine, appelé directement par les tests
 * unitaires et par tout futur appelant interne : mieux vaut un 400 lisible
 * qu'une erreur Prisma brute sur une valeur d'énumération inconnue.
 */
function assertKnownEnumValue<T extends Record<string, string>>(enumeration: T, value: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(enumeration, value)) {
    throw badRequest(`${label} inconnu : « ${value} ». Valeurs acceptées : ${Object.keys(enumeration).join(', ')}.`);
  }
  return value;
}

/** Voir `CapitalizeSiteLotTx` dans `./types-lot4-closing.ts`. */
export const capitalizeSiteLotTx: CapitalizeSiteLotTx = async (tx, tenantId, lotId, params) => {
  const lot = await tx.siteLot.findFirst({
    where: { id: lotId, tenantId },
    select: { id: true, siteId: true, name: true, propertyId: true }
  });
  if (!lot) {
    throw notFound('Lot introuvable');
  }
  if (lot.propertyId) {
    throw conflict('Ce lot a déjà basculé au patrimoine');
  }

  const site = await loadSiteOrThrow(tx, tenantId, lot.siteId);
  if (!isClosed(site)) {
    // Le coût de revient n'est pas encore définitif, et un bien créé sur une
    // estimation porterait une valeur fausse que plus rien ne corrigerait
    // (contrat).
    throw conflict("Ce chantier n'est pas clôturé : le coût de revient du lot n'est pas encore définitif");
  }

  const propertyType = assertKnownEnumValue(PropertyType, params.propertyType, 'Type de bien');
  const ownershipType = assertKnownEnumValue(PropertyOwnershipType, params.ownershipType, 'Mode de détention');

  const internalReference = (params.internalReference ?? '').trim();
  if (!internalReference) {
    throw badRequest('La référence interne du bien est obligatoire');
  }
  const title = (params.title ?? '').trim();
  if (!title) {
    throw badRequest('Le titre du bien est obligatoire');
  }
  const address = (params.address ?? '').trim();
  if (!address) {
    throw badRequest("L'adresse du bien est obligatoire");
  }
  if (!(params.acquisitionDate instanceof Date) || Number.isNaN(params.acquisitionDate.getTime())) {
    throw badRequest("La date d'acquisition du bien est invalide");
  }

  // Lecture avant écriture, même raison qu'au nom du lot : `@@unique([tenantId,
  // internalReference])` en base est le filet, pas la discipline.
  const duplicate = await tx.property.findFirst({
    where: { tenantId, internalReference },
    select: { id: true }
  });
  if (duplicate) {
    throw conflict(`Un bien portant la référence interne « ${internalReference} » existe déjà`);
  }

  const lots = await loadLots(tx, tenantId, lot.siteId);
  const totalCost = await resolveSiteTotalCost(tx, tenantId, site);
  const records = toSiteLotRecords(lots, site.lotAllocationMethod, totalCost);
  const record = records.find(candidate => candidate.id === lotId);
  if (!record) {
    throw notFound('Lot introuvable');
  }

  // Les champs du bien viennent TOUS de l'appelant. Rien n'est deviné depuis
  // le chantier : un chantier a une zone, pas une adresse postale, et une
  // villa n'est pas un terrain nu (contrat). `tenantId` et la référence au lot
  // sont les seules choses que ce code ajoute.
  const property = await tx.property.create({
    data: {
      tenantId,
      internalReference,
      propertyType: propertyType as any,
      ownershipType: ownershipType as any,
      title,
      description: params.description ?? '',
      address
    },
    select: { id: true, internalReference: true }
  });

  // L'évaluation qui porte la valeur d'acquisition. Le module patrimoine range
  // déjà la valeur d'acquisition là : rien de neuf n'est inventé (contrat).
  // `estimatedValue` est obligatoire en base et reçoit le même coût de
  // revient — au jour de la bascule, la valeur estimée du lot EST ce qu'il a
  // coûté ; toute autre valeur serait inventée.
  const reliability = await storedPropertyReliability(tx, tenantId, property.id, {
    method: 'MANUAL',
    valuatedAt: params.acquisitionDate,
    source: null
  });
  await tx.assetValuation.create({
    data: {
      tenantId,
      propertyId: property.id,
      valuatedAt: params.acquisitionDate,
      estimatedValue: record.costPrice,
      currency: DEFAULT_CURRENCY,
      acquisitionCost: record.costPrice,
      acquisitionDate: params.acquisitionDate,
      method: 'MANUAL',
      ...reliability
    }
  });

  // Rattachement, conditionné à `propertyId: null` : une seconde bascule
  // concurrente trouverait `count === 0` et repartirait avec le rollback,
  // plutôt que de créer deux biens portant chacun le coût entier.
  const attached = await tx.siteLot.updateMany({
    where: { id: lotId, tenantId, propertyId: null },
    data: { propertyId: property.id }
  });
  if (attached.count !== 1) {
    throw conflict("Ce lot vient d'être basculé au patrimoine par ailleurs");
  }
  // Bascule = transfert : PL:<lot> ferme, P:<bien> ouvert s'il compte encore
  // (chantier ouvert, ou bien propose a la location), meme transaction.
  await syncLotActivationsTx(
    tx,
    tenantId,
    { siteLotIds: [lotId], propertyIds: [property.id] },
    {
      reason: 'TRANSFERRED_TO_PROPERTY'
    }
  );

  const capitalized: CapitalizedLotRecord = {
    lotId: lot.id,
    lotName: lot.name,
    propertyId: property.id,
    propertyInternalReference: property.internalReference,
    acquisitionCost: record.costPrice,
    acquisitionDate: params.acquisitionDate,
    currency: DEFAULT_CURRENCY
  };

  return capitalized;
};
