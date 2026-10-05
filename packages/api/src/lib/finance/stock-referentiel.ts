/**
 * Référentiel du stock — lot 5, premier sous-lot (`types-lot5-referentiel.ts`).
 *
 * Implémente les dix fonctions du contrat gelé : l'article, le lieu de
 * stockage, et la méthode de valorisation de l'agence. **Aucun mouvement,
 * aucune quantité, aucune valeur** : tout cela appartient au sous-lot suivant
 * (`types-lot5-mouvements.ts`), qui lira ces trois tables sans les écrire.
 *
 * Style suivi : `salaries.ts` (lot 4, troisième sous-lot) pour la forme des
 * conversions Prisma → contrat et la lecture d'unicité avant écriture ;
 * `sites.ts` (lot 2) pour la façon de traiter un référentiel simple, et
 * notamment pour la seule liberté que ce fichier prend avec une lecture qui
 * écrit (voir `getStockSettings`).
 *
 * ---------------------------------------------------------------------------
 * Lire avant d'écrire, toujours — jamais « tenter puis rattraper le P2002 »
 * ---------------------------------------------------------------------------
 *
 * En PostgreSQL une commande en échec condamne la transaction entière : un
 * `create` qui viole une contrainte d'unicité ne se rattrape pas à l'intérieur
 * d'un `$transaction`, même avec un `try/catch` — tout ce qui suit échouerait
 * avec « current transaction is aborted ». Les trois unicités de ce sous-lot
 * — `(tenantId, reference)` sur l'article, `(tenantId, label)` et `siteId` sur
 * le lieu — sont donc vérifiées par une LECTURE préalable, traduite en 409
 * métier. Les contraintes en base restent le filet d'une collision réellement
 * concurrente ; ce n'est pas elles qui portent la discipline.
 *
 * ---------------------------------------------------------------------------
 * Désactiver n'est pas supprimer
 * ---------------------------------------------------------------------------
 *
 * Aucune fonction de ce fichier ne supprime un article ni un lieu, et aucune
 * route ne l'expose. Leurs mouvements racontent où la matière est passée ;
 * `isActive` les retire des écrans de saisie sans effacer ce passé.
 *
 * ---------------------------------------------------------------------------
 * Aucun libellé comptable (principe P-1)
 * ---------------------------------------------------------------------------
 *
 * Ni « débit » ni « crédit » dans un message d'erreur ou un champ renvoyé.
 * Ce sous-lot ne produit d'ailleurs aucune écriture : il ne touche ni
 * `accounting.ts`, ni le journal, ni un compte.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { ErrorCode } from '../../middleware/error-middleware';
import { badRequest, conflict, notFound } from '../errors';
import { isOpeningCountSuggested, loadItemsToRecount, stockError } from './stock-controles';
import type { LocationView, PrismaLike } from './types-040-controle';
import type {
  CreateStockItemTx,
  CreateStockLocationTx,
  EnsureStockSettingsTx,
  GetStockItem,
  GetStockSettings,
  ListStockItems,
  ListStockLocations,
  SetStockValuationMethodTx,
  StockItemRecord,
  StockLocationRecord,
  StockSettingsRecord,
  UpdateStockItemTx,
  UpdateStockLocationTx
} from './types-lot5-referentiel';

/**
 * Le défaut du PRD (besoin S5). Écrit une fois ici plutôt que répété : c'est
 * la valeur que reçoit une agence qui n'a jamais ouvert l'écran de
 * paramétrage.
 */
const DEFAULT_VALUATION_METHOD = 'WEIGHTED_AVERAGE';

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toStockItemRecord(row: any): StockItemRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    reference: row.reference,
    label: row.label,
    unit: row.unit,
    category: row.category ?? null,
    defaultCostCategoryId: row.defaultCostCategoryId ?? null,
    // Nul — jamais une chaîne vide — quand l'article ne propose aucun poste
    // (voir `StockItemRecord.defaultCostCategoryLabel`, contrat).
    defaultCostCategoryLabel: row.defaultCostCategory?.label ?? null,
    isActive: row.isActive
  };
}

function toStockLocationRecord(row: any): StockLocationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind,
    label: row.label,
    siteId: row.siteId ?? null,
    // Nul pour un magasin (contrat, `StockLocationRecord.siteLabel`).
    siteLabel: row.site?.name ?? null,
    isActive: row.isActive
  };
}

function toStockSettingsRecord(row: any): StockSettingsRecord {
  return {
    tenantId: row.tenantId,
    valuationMethod: row.valuationMethod,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote ?? null
  };
}

/**
 * Texte obligatoire : une chaîne d'espaces n'est pas une valeur. Renvoie la
 * version élaguée, qui est celle qu'on enregistre.
 */
function requireText(value: string | undefined | null, message: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw badRequest(message);
  }
  return trimmed;
}

/**
 * Résout le poste de dépense PROPOSÉ par un article.
 *
 * Le contrat est explicite : ce poste n'a **aucune autorité**, la sortie
 * exigera le sien. Mais proposer un poste qui n'existe pas, ou qui appartient
 * à une autre agence, n'est pas une proposition — c'est une donnée fausse.
 *
 * Un poste désactivé est refusé, comme à la note de salaire
 * (`salaries.ts`, `createSalaryNoteTx`) : une désactivation est un geste de
 * paramétrage voulu, et le proposer quand même le contredirait à l'écran.
 */
async function resolveDefaultCostCategoryId(
  tx: PrismaTransactionClient,
  tenantId: string,
  costCategoryId: string
): Promise<string> {
  const category = await tx.costCategory.findFirst({
    where: { id: costCategoryId, tenantId },
    select: { id: true, isActive: true }
  });
  if (!category) {
    throw notFound('Poste de dépense introuvable');
  }
  if (!category.isActive) {
    throw conflict('Ce poste de dépense est désactivé');
  }
  return category.id;
}

// ---------------------------------------------------------------------------
// A. L'article
// ---------------------------------------------------------------------------

/** Voir `CreateStockItemTx` dans `./types-lot5-referentiel.ts`. */
export const createStockItemTx: CreateStockItemTx = async (tx, tenantId, params) => {
  const reference = requireText(params.reference, "La référence de l'article est obligatoire");
  const label = requireText(params.label, "La désignation de l'article est obligatoire");
  // « Un article sans unité est une quantité qu'on ne saura pas interpréter —
  // "12" de quoi ? » (contrat). L'unité reste du TEXTE LIBRE : aucune liste
  // fermée, aucune normalisation, aucune conversion — seulement l'exigence
  // qu'elle soit renseignée.
  const unit = requireText(params.unit, "L'unité de l'article est obligatoire");

  const category = typeof params.category === 'string' ? params.category.trim() || null : null;

  const defaultCostCategoryId = params.defaultCostCategoryId
    ? await resolveDefaultCostCategoryId(tx, tenantId, params.defaultCostCategoryId)
    : null;

  // UNICITÉ DE LA RÉFÉRENCE, vérifiée AVANT d'écrire (voir l'en-tête du
  // fichier) : deux articles de même référence rendraient illisible tout bon
  // de sortie.
  const existing = await tx.stockItem.findUnique({
    where: { tenantId_reference: { tenantId, reference } },
    select: { id: true }
  });
  if (existing) {
    throw conflict('Un article porte déjà cette référence');
  }

  const created = await tx.stockItem.create({
    data: { tenantId, reference, label, unit, category, defaultCostCategoryId },
    include: { defaultCostCategory: { select: { label: true } } }
  });

  return toStockItemRecord(created);
};

/** Voir `UpdateStockItemTx` dans `./types-lot5-referentiel.ts`. */
export const updateStockItemTx: UpdateStockItemTx = async (tx, tenantId, itemId, params) => {
  const item = await tx.stockItem.findFirst({ where: { id: itemId, tenantId }, select: { id: true } });
  if (!item) {
    throw notFound('Article introuvable');
  }

  const data: Record<string, unknown> = {};

  if (params.label !== undefined) {
    data.label = requireText(params.label, "La désignation de l'article ne peut pas être vide");
  }

  // L'UNITÉ SE CORRIGE, ET C'EST UN DANGER ASSUMÉ (contrat). Passer un article
  // de « sac » à « tonne » ne reconvertit AUCUNE quantité déjà enregistrée :
  // les mouvements passés gardent leur nombre, qui voudra désormais dire autre
  // chose. Le domaine ne peut pas deviner le facteur de conversion, et
  // l'interdire empêcherait de réparer une faute de frappe au premier jour.
  // L'écran doit prévenir ; ici, on laisse faire — délibérément, et un test
  // unitaire épingle ce comportement pour que personne ne le « corrige ».
  if (params.unit !== undefined) {
    data.unit = requireText(params.unit, "L'unité de l'article ne peut pas être vide");
  }

  if (params.category !== undefined) {
    data.category = typeof params.category === 'string' ? params.category.trim() || null : null;
  }

  if (params.defaultCostCategoryId !== undefined) {
    data.defaultCostCategoryId = params.defaultCostCategoryId
      ? await resolveDefaultCostCategoryId(tx, tenantId, params.defaultCostCategoryId)
      : null;
  }

  if (params.isActive !== undefined) {
    // Désactiver n'est pas supprimer : l'article garde ses mouvements et ses
    // soldes, il cesse simplement d'être proposé.
    data.isActive = params.isActive;
  }

  // La RÉFÉRENCE ne figure pas dans le contrat de correction, et n'est donc
  // jamais modifiée ici : c'est elle qu'on lit sur les bons déjà imprimés.

  const updated = await tx.stockItem.update({
    // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
    where: { id: itemId, tenantId },
    data,
    include: { defaultCostCategory: { select: { label: true } } }
  });

  return toStockItemRecord(updated);
};

/** Voir `ListStockItems` dans `./types-lot5-referentiel.ts`. */
export const listStockItems: ListStockItems = async (tenantId, filters) => {
  const search = filters?.search?.trim();

  const rows = await prisma.stockItem.findMany({
    where: {
      tenantId,
      ...(filters?.onlyActive ? { isActive: true } : {}),
      // La recherche porte sur la référence ET la désignation : sur le
      // terrain on cherche « CIM » aussi souvent que « ciment ».
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' as const } },
              { label: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    },
    // Libellé du poste proposé résolu PAR LOT, jamais une requête par ligne —
    // même principe qu'aux listes des lots précédents.
    include: { defaultCostCategory: { select: { label: true } } },
    orderBy: { reference: 'asc' }
  });

  return rows.map(row => toStockItemRecord(row));
};

/** Voir `GetStockItem` dans `./types-lot5-referentiel.ts`. */
export const getStockItem: GetStockItem = async (tenantId, itemId) => {
  const row = await prisma.stockItem.findFirst({
    where: { id: itemId, tenantId },
    include: { defaultCostCategory: { select: { label: true } } }
  });
  if (!row) {
    throw notFound('Article introuvable');
  }
  return toStockItemRecord(row);
};

// ---------------------------------------------------------------------------
// B. Le lieu de stockage
// ---------------------------------------------------------------------------

/** Voir `CreateStockLocationTx` dans `./types-lot5-referentiel.ts`. */
export const createStockLocationTx: CreateStockLocationTx = async (tx, tenantId, params) => {
  const label = requireText(params.label, 'Le libellé du lieu de stockage est obligatoire');
  const kind = params.kind;
  const siteId = params.siteId ?? null;

  // `siteId` est EXIGÉ quand `kind` vaut SITE, et REFUSÉ sinon — refusé, pas
  // ignoré (contrat). Accepter un champ qui ne servira à rien laisserait
  // croire qu'il a servi.
  if (kind === 'SITE' && !siteId) {
    throw badRequest('Le chantier est obligatoire pour un lieu de stockage de chantier');
  }
  if (kind !== 'SITE' && siteId) {
    throw badRequest("Le chantier n'est accepté que pour un lieu de stockage de chantier");
  }

  let site: { id: string; name: string } | null = null;
  if (siteId) {
    site = await tx.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: { id: true, name: true } });
    if (!site) {
      throw notFound('Chantier introuvable');
    }

    // UN SEUL LIEU PAR CHANTIER — vérifié avant d'écrire. Deux lieux pour le
    // même chantier partageraient son stock en deux soldes dont aucun ne
    // dirait la vérité (contrat, et `@unique` sur `StockLocation.siteId`).
    const existingForSite = await tx.stockLocation.findFirst({ where: { siteId }, select: { id: true } });
    if (existingForSite) {
      throw conflict('Ce chantier dispose déjà d’un lieu de stockage');
    }
  }

  const existingLabel = await tx.stockLocation.findUnique({
    where: { tenantId_label: { tenantId, label } },
    select: { id: true }
  });
  if (existingLabel) {
    throw conflict('Un lieu de stockage porte déjà ce libellé');
  }

  const created = await tx.stockLocation.create({
    data: { tenantId, kind, label, siteId },
    include: { site: { select: { name: true } } }
  });

  return toStockLocationRecord(created);
};

/** Voir `UpdateStockLocationTx` dans `./types-lot5-referentiel.ts`. */
export const updateStockLocationTx: UpdateStockLocationTx = async (tx, tenantId, locationId, params) => {
  const location = await tx.stockLocation.findFirst({
    where: { id: locationId, tenantId },
    select: { id: true, label: true }
  });
  if (!location) {
    throw notFound('Lieu de stockage introuvable');
  }

  const data: Record<string, unknown> = {};

  if (params.label !== undefined) {
    const label = requireText(params.label, 'Le libellé du lieu de stockage ne peut pas être vide');
    if (label !== location.label) {
      const existingLabel = await tx.stockLocation.findUnique({
        where: { tenantId_label: { tenantId, label } },
        select: { id: true }
      });
      if (existingLabel) {
        throw conflict('Un lieu de stockage porte déjà ce libellé');
      }
    }
    data.label = label;
  }

  if (params.isActive !== undefined) {
    // Désactiver n'est pas supprimer : le lieu garde son stock et son
    // historique, il cesse simplement d'être proposé (contrat).
    //
    // Lot 040 (spec §9) : un lieu qui porte un inventaire en cours (DRAFT ou
    // COUNTED) ne se désactive pas — l'inventaire ne pourrait plus être clos
    // ni validé proprement.
    if (params.isActive === false) {
      const inProgress = await tx.stockCount.findFirst({
        where: { tenantId, locationId, status: { in: ['DRAFT', 'COUNTED'] } },
        select: { id: true }
      });
      if (inProgress) {
        throw stockError(
          409,
          ErrorCode.STOCK_COUNT_IN_PROGRESS,
          'Ce lieu porte un inventaire en cours : terminez-le ou abandonnez-le avant de le désactiver.',
          { countId: inProgress.id }
        );
      }
    }
    data.isActive = params.isActive;
  }

  // NI `kind` NI `siteId` ne se corrigent, et ils n'apparaissent même pas dans
  // le contrat de correction : « un magasin qui deviendrait le lieu d'un
  // chantier emporterait avec lui un stock qui n'y a jamais été ». Le schéma
  // Zod de correction est `.strict()` et les refuse en 400 dès la frontière.

  const updated = await tx.stockLocation.update({
    // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
    where: { id: locationId, tenantId },
    data,
    include: { site: { select: { name: true } } }
  });

  return toStockLocationRecord(updated);
};

/** Voir `ListStockLocations` dans `./types-lot5-referentiel.ts`. */
export const listStockLocations: ListStockLocations = async (tenantId, filters) => {
  const rows = await prisma.stockLocation.findMany({
    where: {
      tenantId,
      ...(filters?.onlyActive ? { isActive: true } : {}),
      ...(filters?.kind ? { kind: filters.kind } : {})
    },
    include: { site: { select: { name: true } } },
    orderBy: { label: 'asc' }
  });

  return rows.map(row => toStockLocationRecord(row));
};

// ---------------------------------------------------------------------------
// C. La méthode de valorisation
// ---------------------------------------------------------------------------

/** Voir `EnsureStockSettingsTx` dans `./types-lot5-referentiel.ts`. */
export const ensureStockSettingsTx: EnsureStockSettingsTx = async (tx, tenantId) => {
  // NE LÈVE JAMAIS pour cause de réglages absents (contrat). Une agence qui
  // n'a jamais ouvert l'écran de paramétrage doit pouvoir enregistrer sa
  // première réception : le coût moyen pondéré est le défaut du PRD, et
  // l'imposer en silence est plus honnête que de refuser un mouvement réel.
  const existing = await tx.stockSettings.findUnique({ where: { tenantId } });
  if (existing) {
    return toStockSettingsRecord(existing);
  }

  // Lecture d'abord, création ensuite — jamais un `create` spéculatif
  // rattrapé au P2002 (voir l'en-tête du fichier).
  const created = await tx.stockSettings.create({
    data: {
      tenantId,
      valuationMethod: DEFAULT_VALUATION_METHOD as any,
      decidedAt: new Date(),
      // Aucun motif : personne n'a encore rien décidé. C'est précisément ce
      // que `decisionNote: null` dit, et une phrase inventée le cacherait.
      decisionNote: null
    }
  });

  return toStockSettingsRecord(created);
};

/**
 * Voir `GetStockSettings` dans `./types-lot5-referentiel.ts`.
 *
 * Matérialise les réglages au défaut si l'agence n'en a jamais eu, plutôt que
 * de répondre 404 ou de fabriquer une réponse que la base ne contient pas.
 * C'est exactement ce que `listCostCategories` (`sites.ts`, lot 2) fait pour
 * le jeu de postes par défaut : une lecture qui sème le défaut au premier
 * appel. La date ainsi posée est celle du premier regard, non celle d'une
 * décision — d'où `decisionNote` nul, qui distingue sans ambiguïté un défaut
 * subi d'un choix arrêté par `setStockValuationMethodTx`.
 */
export const getStockSettings: GetStockSettings = async tenantId => {
  return prisma.$transaction(tx => ensureStockSettingsTx(tx, tenantId));
};

/** Voir `SetStockValuationMethodTx` dans `./types-lot5-referentiel.ts`. */
export const setStockValuationMethodTx: SetStockValuationMethodTx = async (tx, tenantId, params) => {
  // LE MOTIF EST EXIGÉ. Le besoin S5 dit « changement = décision documentée » ;
  // sans motif ni date, ce n'en serait pas une, et personne ne saurait six
  // mois plus tard pourquoi les chiffres ont changé de sens.
  const decisionNote = requireText(params.decisionNote, 'Le motif de la décision est obligatoire');

  // Les réglages sont d'abord matérialisés : arrêter une méthode sur une
  // agence qui n'a jamais ouvert l'écran est un cas normal, pas une erreur.
  await ensureStockSettingsTx(tx, tenantId);

  const updated = await tx.stockSettings.update({
    where: { tenantId },
    data: { valuationMethod: params.valuationMethod, decidedAt: new Date(), decisionNote }
  });

  return toStockSettingsRecord(updated);
};

// ---------------------------------------------------------------------------
// D. Lot 040 — la vue d'un lieu (`LocationView`)
// ---------------------------------------------------------------------------

/**
 * Complète des lieux du référentiel avec ce que le terrain doit savoir
 * (contrat `LocationView`) : l'inventaire en cours (DRAFT ou COUNTED), le
 * chantier clos, l'inventaire d'ouverture suggéré (A7-R1) et les articles à
 * recompter (A2-R7). Aucune quantité ni valeur : la vue ne révèle rien d'un
 * lieu en comptage.
 *
 * Quatre requêtes en tout, jamais une par lieu.
 */
export async function buildLocationViews(
  db: PrismaLike,
  tenantId: string,
  locations: StockLocationRecord[],
  now: Date = new Date()
): Promise<LocationView[]> {
  if (locations.length === 0) {
    return [];
  }
  const locationIds = locations.map(location => location.id);
  const siteIds = [...new Set(locations.map(location => location.siteId).filter((id): id is string => !!id))];

  const [counts, sites, toRecount] = await Promise.all([
    db.stockCount.findMany({
      where: { tenantId, locationId: { in: locationIds }, status: { not: 'CANCELLED' } },
      select: { id: true, locationId: true, status: true, kind: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    }),
    siteIds.length > 0
      ? db.constructionSite.findMany({
          where: { tenantId, id: { in: siteIds } },
          select: { id: true, closedAt: true, stockEnabledAt: true }
        })
      : Promise.resolve([] as Array<{ id: string; closedAt: Date | null; stockEnabledAt: Date | null }>),
    loadItemsToRecount(db, tenantId, locationIds)
  ]);

  const siteById = new Map(sites.map(site => [site.id, site]));
  const inProgressByLocation = new Map<string, (typeof counts)[number]>();
  const liveOpeningLocations = new Set<string>();
  for (const count of counts) {
    if ((count.status === 'DRAFT' || count.status === 'COUNTED') && !inProgressByLocation.has(count.locationId)) {
      inProgressByLocation.set(count.locationId, count);
    }
    if (count.kind === 'OPENING') {
      liveOpeningLocations.add(count.locationId);
    }
  }

  return locations.map(location => {
    const site = location.siteId ? siteById.get(location.siteId) : undefined;
    const siteClosed = !!site?.closedAt;
    const inProgress = inProgressByLocation.get(location.id);
    return {
      ...location,
      countInProgress: inProgress
        ? { countId: inProgress.id, status: inProgress.status as 'DRAFT' | 'COUNTED', kind: inProgress.kind }
        : null,
      siteClosed,
      openingCountSuggested:
        location.kind === 'SITE' && !!site && !siteClosed
          ? isOpeningCountSuggested(
              { stockEnabledAt: site.stockEnabledAt ?? null },
              liveOpeningLocations.has(location.id),
              now
            )
          : false,
      toRecount: toRecount.get(location.id) ?? []
    };
  });
}

/** `GET /stock/locations` (lot 040) : les lieux filtrés, en `LocationView`. */
export async function listStockLocationViews(
  tenantId: string,
  filters?: { onlyActive?: boolean; kind?: 'WAREHOUSE' | 'SITE' }
): Promise<LocationView[]> {
  const locations = await listStockLocations(tenantId, filters ?? {});
  return buildLocationViews(prisma, tenantId, locations);
}

// ---------------------------------------------------------------------------
// E. Lot 040 — écritures du référentiel avec leurs changements (audit B6)
// ---------------------------------------------------------------------------

/** Champs modifiés `{ champ: { before, after } }` (`AuditLogEntry.changes`). */
export type ReferentielChanges = Record<string, { before: unknown; after: unknown }>;

function diffRecords<T extends object>(before: T, after: T, keys: Array<keyof T>): ReferentielChanges {
  const changes: ReferentielChanges = {};
  for (const key of keys) {
    if (before[key] !== after[key]) {
      changes[String(key)] = { before: before[key], after: after[key] };
    }
  }
  return changes;
}

const ITEM_AUDITED_FIELDS: Array<keyof StockItemRecord> = [
  'label',
  'unit',
  'category',
  'defaultCostCategoryId',
  'isActive'
];

const LOCATION_AUDITED_FIELDS: Array<keyof StockLocationRecord> = ['label', 'isActive'];

/**
 * Corrige un article et rend ce qui a changé — l'unité comprise : passer de
 * « sac » à « tonne » ne reconvertit rien, l'audit doit donc le montrer
 * (B6-R1). Même règle que `updateStockItemTx`, qu'elle appelle.
 */
export async function updateStockItemWithChangesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  params: Parameters<UpdateStockItemTx>[3]
): Promise<{ item: StockItemRecord; changes: ReferentielChanges }> {
  const beforeRow = await tx.stockItem.findFirst({
    where: { id: itemId, tenantId },
    include: { defaultCostCategory: { select: { label: true } } }
  });
  if (!beforeRow) {
    throw notFound('Article introuvable');
  }
  const before = toStockItemRecord(beforeRow);
  const item = await updateStockItemTx(tx, tenantId, itemId, params);
  return { item, changes: diffRecords(before, item, ITEM_AUDITED_FIELDS) };
}

/** Corrige un lieu et rend ce qui a changé (libellé, activité). */
export async function updateStockLocationWithChangesTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  params: Parameters<UpdateStockLocationTx>[3]
): Promise<{ location: StockLocationRecord; changes: ReferentielChanges }> {
  const beforeRow = await tx.stockLocation.findFirst({
    where: { id: locationId, tenantId },
    include: { site: { select: { name: true } } }
  });
  if (!beforeRow) {
    throw notFound('Lieu de stockage introuvable');
  }
  const before = toStockLocationRecord(beforeRow);
  const location = await updateStockLocationTx(tx, tenantId, locationId, params);
  return { location, changes: diffRecords(before, location, LOCATION_AUDITED_FIELDS) };
}
