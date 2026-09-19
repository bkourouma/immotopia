/**
 * Chantiers, postes de dépense et détail des imputations — lot 2, volet chantiers.
 *
 * Implémente `CreateConstructionSite`, `ListConstructionSites`, `GetSiteDetail`
 * et `ListCostCategories` du contrat gelé (`./types-lot2.ts`). Deux principes
 * du PRD y sont directement engagés :
 *
 *   - **P-4 : un coût n'est jamais saisi, il est dérivé.** `ConstructionSite`
 *     n'a pas de colonne `actualCost` (voir `data-model.md` §3.5) : ce fichier
 *     ne l'écrit jamais, il le calcule par agrégation SQL (`getSiteActualCost`)
 *     à chaque lecture, jamais en mémoire.
 *   - **Un libellé lisible, jamais un identifiant.** `getSiteDetail` résout le
 *     nom de la pièce d'origine de chaque imputation (facture ou bon de
 *     caisse) par deux requêtes *par lot* (une par nature de pièce), jamais
 *     ligne à ligne : c'est exactement le défaut que le lot 1 avait livré puis
 *     dû corriger dans son compte rendu de campagne (voir l'en-tête de
 *     `BillingRunSummary` dans `./types.ts`).
 *
 * Deux écarts entre le contrat gelé et le schéma gelé, tous deux documentés en
 * ligne où ils apparaissent : `ConstructionSiteRecord.currency` n'a pas de
 * colonne (la devise est fixée `XOF` pour tout ce lot, `data-model.md`
 * Overview) ; `CostCategoryRecord.position` n'a pas de colonne (`CostCategory`
 * n'a que `label`/`isActive`) — elle est dérivée de l'ordre de création, seule
 * source d'ordre disponible sans toucher au schéma.
 *
 * `createCostCategory` et `setCostCategoryActive` ne sont PAS dans le contrat
 * gelé (`types-lot2.ts` n'expose que `ListCostCategories`) : elles existent
 * pour honorer la lettre de la mission confiée à cet agent (« librement
 * enrichi », « désactivé, jamais supprimé »), en attendant qu'un futur lot leur
 * donne une route. Aucune fonction de suppression n'est exposée, nulle part :
 * c'est ce qui rend la règle « jamais supprimé » vraie par construction.
 */

import { prisma } from '../../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../../middleware/error-middleware';
import { toAmount, toAmountOrZero } from './types';
import { roundMoney } from './money';
import { formatCashVoucherNumber } from './cash';
import { sumSiteActualCost, sumSiteActualCostByIds } from './site-cost';
import type {
  ConstructionSiteRecord,
  CostCategoryRecord,
  CreateConstructionSite,
  GetSiteDetail,
  ListConstructionSites,
  ListCostCategories,
  SiteAllocationLine,
  SiteDetail
} from './types-lot2';

/** Devise unique de ce lot (`data-model.md`, Overview) : jamais stockée par chantier. */
const CURRENCY = 'XOF';

/**
 * Jeu de postes par défaut, posé au premier appel de `listCostCategories`
 * d'un tenant (US9, scénario 2). Consigné dans l'ordre où il doit s'afficher :
 * c'est cet ordre, et lui seul, qui fixe `position` faute de colonne dédiée.
 */
const DEFAULT_COST_CATEGORY_LABELS = [
  'Gros œuvre',
  'Toiture',
  'Plomberie',
  'Électricité',
  "Main-d'œuvre",
  'Matériaux',
  'Divers'
];

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function toSiteRecord(row: Record<string, any>, actualCost: number): ConstructionSiteRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    zone: row.zone ?? null,
    propertyId: row.propertyId ?? null,
    managerId: row.managerId ?? null,
    landLeaseId: row.landLeaseId ?? null,
    status: row.status,
    startDate: row.startDate ?? null,
    plannedEndDate: row.plannedEndDate ?? null,
    progressPercent: row.progressPercent ?? 0,
    closedAt: row.closedAt ?? null,
    finalCost: toAmount(row.finalCost),
    actualCost,
    currency: CURRENCY
  };
}

function toCategoryRecord(row: Record<string, any>, position: number): CostCategoryRecord {
  const compte = row.chartOfAccount;
  return {
    id: row.id,
    tenantId: row.tenantId,
    label: row.label,
    position,
    isActive: row.isActive,
    chartOfAccountId: row.chartOfAccountId ?? null,
    // Le NUMERO et le NOM, jamais l'identifiant seul : « 605 — Charges de
    // chantier » se lit, « a3f1... » non. Resolu par la meme jointure que la
    // ligne, jamais par une requete de plus.
    chartOfAccountLabel: compte ? `${compte.accountNumber} — ${compte.accountName}` : null
  };
}

/** Jointure commune a toutes les lectures de postes : le compte, s'il y en a un. */
const COST_CATEGORY_INCLUDE = {
  chartOfAccount: { select: { id: true, accountNumber: true, accountName: true } }
} as const;

/**
 * Rattache un poste de depense a un compte de charge, ou l'en detache.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi cette fonction existe
 * ---------------------------------------------------------------------------
 *
 * C'est la dette consignee au lot 2, promise au lot 3 par son rapport, et
 * oubliee de la specification du lot 3 : sans elle, toute depense de chantier
 * frappe le meme compte de charge, et l'imputation analytique ne rencontre
 * jamais l'imputation comptable.
 *
 * Le compte doit appartenir a la meme agence et a la portee operationnelle :
 * un poste d'agence ne peut pas designer un compte de copropriete, sans quoi
 * la generalisation du lot 2 aurait ouvert une porte qu'elle voulait fermer.
 * Ici on LEVE, contrairement au moteur d'ecriture qui retombe sur le defaut :
 * c'est un geste de parametrage, delibere, et une erreur de parametrage doit
 * se dire au moment ou on la commet, pas six mois plus tard dans un grand
 * livre faux.
 *
 * `chartOfAccountId` a `null` detache le poste : il retombe alors sur le
 * compte par defaut.
 */
export async function setCostCategoryAccount(
  tenantId: string,
  costCategoryId: string,
  chartOfAccountId: string | null
): Promise<CostCategoryRecord> {
  const poste = await prisma.costCategory.findFirst({ where: { id: costCategoryId, tenantId } });
  if (!poste) {
    throw new NotFoundError('Poste de dépense introuvable.');
  }

  if (chartOfAccountId !== null) {
    const compte = await prisma.chartOfAccount.findFirst({
      where: { id: chartOfAccountId, tenantId },
      select: { id: true, scope: true, isActive: true }
    });
    if (!compte) {
      throw new NotFoundError('Compte comptable introuvable pour cette agence.');
    }
    if (compte.scope !== 'OPERATIONS') {
      throw new ConflictError(
        'Ce compte appartient à la comptabilité de copropriété : un poste de dépense de chantier ne peut pas le désigner.'
      );
    }
    if (!compte.isActive) {
      throw new ConflictError("Ce compte est désactivé : il n'accepte plus de nouveaux mouvements.");
    }
  }

  await prisma.costCategory.update({ where: { id: costCategoryId }, data: { chartOfAccountId } });

  // On relit la liste ordonnee pour rendre le poste avec sa POSITION juste :
  // elle se deduit de l'ordre de creation et n'a pas de colonne.
  const postes = await fetchOrderedCostCategories(tenantId);
  const relu = postes.find(p => p.id === costCategoryId);
  if (!relu) {
    throw new NotFoundError('Poste de dépense introuvable.');
  }
  return relu;
}

// ---------------------------------------------------------------------------
// Coût réel — jamais stocké (principe P-4 du PRD)
// ---------------------------------------------------------------------------

/**
 * Somme des imputations validées et non annulées d'un chantier.
 *
 * Agrégation SQL (`aggregate`), jamais en mémoire, même discipline que
 * `GetTrialBalance` (`accounting.ts`) et la balance clients du lot 1.
 */
async function getSiteActualCost(tenantId: string, siteId: string): Promise<number> {
  // La definition du realise vit desormais dans `site-cost.ts`, une seule
  // fois pour tout le module : elle etait recopiee a cinq endroits a la fin du
  // lot 3, et cinq copies finissent par diverger.
  return sumSiteActualCost(prisma, tenantId, siteId);
}

// ---------------------------------------------------------------------------
// Postes de dépense
// ---------------------------------------------------------------------------

/**
 * Sème le jeu de postes par défaut si le tenant n'en a encore aucun.
 *
 * `createMany` + `skipDuplicates` reste sûr sous concurrence sans verrou : ce
 * n'est pas un « tenter l'insertion puis relire l'échec » au sens du piège de
 * `ledger.ts` (qui concerne une transaction à commandes multiples) — c'est un
 * unique appel Postgres, dont `ON CONFLICT DO NOTHING` ne fait jamais échouer
 * l'instruction ni la connexion qui la porte. Deux premiers appels concurrents
 * produisent donc le même jeu final, sans doublon ni erreur.
 *
 * `createdAt` est fixé explicitement (et non laissé au défaut de colonne) :
 * un `createMany` évalue `now()` une seule fois pour toutes les lignes du lot,
 * ce qui figerait sept lignes à la même seconde et rendrait `position`
 * indéterminée entre elles. Des millisecondes croissantes gardent l'ordre
 * voulu, seule trace disponible faute de colonne `position` — décalées une
 * seconde dans le passé pour qu'un poste personnalisé créé juste après (même
 * dans la même milliseconde réelle) se range toujours après elles.
 */
async function ensureDefaultCostCategories(tenantId: string): Promise<void> {
  const existing = await prisma.costCategory.count({ where: { tenantId } });
  if (existing > 0) {
    return;
  }

  const base = Date.now() - 1000;
  await prisma.costCategory.createMany({
    data: DEFAULT_COST_CATEGORY_LABELS.map((label, index) => ({
      tenantId,
      label,
      createdAt: new Date(base + index)
    })),
    skipDuplicates: true
  });
}

/** Les postes d'un tenant, dans l'ordre d'affichage (création croissante), en semant le jeu par défaut au besoin. */
async function fetchOrderedCostCategories(tenantId: string): Promise<CostCategoryRecord[]> {
  await ensureDefaultCostCategories(tenantId);
  const rows = await prisma.costCategory.findMany({
    where: { tenantId },
    include: COST_CATEGORY_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  return rows.map((row, index) => toCategoryRecord(row, index + 1));
}

/** Voir `ListCostCategories` dans `./types-lot2.ts`. */
export const listCostCategories: ListCostCategories = async tenantId => {
  return fetchOrderedCostCategories(tenantId);
};

/**
 * Crée un poste de dépense supplémentaire, au-delà du jeu par défaut.
 *
 * Hors contrat gelé (voir l'en-tête du fichier) : ajoutée pour honorer « puis
 * librement enrichi ». L'unicité `(tenantId, label)` est celle du schéma ; sa
 * violation devient un 409 métier plutôt que l'erreur Prisma brute.
 */
export async function createCostCategory(tenantId: string, params: { label: string }): Promise<CostCategoryRecord> {
  const label = params.label?.trim();
  if (!label) {
    throw new BadRequestError('Le libellé du poste de dépense est obligatoire.');
  }

  try {
    const row = await prisma.costCategory.create({ data: { tenantId, label } });
    const ordered = await fetchOrderedCostCategories(tenantId);
    return ordered.find(c => c.id === row.id) ?? toCategoryRecord(row, ordered.length);
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002') {
      throw new ConflictError('Un poste de dépense porte déjà ce libellé.');
    }
    throw error;
  }
}

/**
 * Active ou désactive un poste de dépense. Jamais de suppression : aucune
 * fonction de ce fichier n'expose de `delete` sur `CostCategory`, ce qui rend
 * la règle « désactivé, jamais supprimé » vraie par construction plutôt que
 * par discipline de code.
 */
export async function setCostCategoryActive(
  tenantId: string,
  costCategoryId: string,
  isActive: boolean
): Promise<CostCategoryRecord> {
  const existing = await prisma.costCategory.findFirst({ where: { id: costCategoryId, tenantId } });
  if (!existing) {
    throw new NotFoundError('Poste de dépense introuvable.');
  }
  const updated = await prisma.costCategory.update({ where: { id: costCategoryId }, data: { isActive } });
  const ordered = await fetchOrderedCostCategories(tenantId);
  return ordered.find(c => c.id === updated.id) ?? toCategoryRecord(updated, ordered.length);
}

// ---------------------------------------------------------------------------
// Chantiers
// ---------------------------------------------------------------------------

/** Voir `CreateConstructionSite` dans `./types-lot2.ts`. */
export const createConstructionSite: CreateConstructionSite = async (tenantId, params) => {
  const name = params.name?.trim();
  if (!name) {
    throw new BadRequestError('Le nom du chantier est obligatoire.');
  }

  if (params.propertyId) {
    const property = await prisma.property.findFirst({ where: { id: params.propertyId, tenantId } });
    if (!property) {
      throw new NotFoundError('Bien introuvable pour ce tenant.');
    }
  }

  if (params.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: params.managerId } });
    if (!manager) {
      throw new NotFoundError('Responsable introuvable.');
    }
  }

  // `zone` et `startDate` sont obligatoires en base (`data-model.md` §3.5) mais
  // facultatifs au contrat (un chantier sur terrain loué doit pouvoir s'inscrire
  // avant que ces détails soient connus) : on comble par une valeur neutre
  // plutôt que de rejeter une création par ailleurs valide. Hypothèse prise
  // faute d'arbitrage disponible sur ce point précis — voir le rapport de fin
  // de tâche.
  const row = await prisma.constructionSite.create({
    data: {
      tenantId,
      name,
      zone: params.zone?.trim() || '',
      propertyId: params.propertyId ?? null,
      managerId: params.managerId ?? null,
      startDate: params.startDate ?? new Date(),
      plannedEndDate: params.plannedEndDate ?? null
    }
  });

  // Un chantier qui vient de naître n'a encore aucune imputation : inutile
  // d'agréger, son coût réel est zéro par construction.
  return toSiteRecord(row, 0);
};

/** Voir `ListConstructionSites` dans `./types-lot2.ts`. */
export const listConstructionSites: ListConstructionSites = async (tenantId, filters) => {
  const where = {
    tenantId,
    ...(filters?.status ? { status: filters.status } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.constructionSite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: filters?.skip,
      take: filters?.take
    }),
    prisma.constructionSite.count({ where })
  ]);

  const siteIds = rows.map((row: Record<string, any>) => row.id);

  // Une seule agrégation groupée pour toute la page, jamais une par ligne
  // (même discipline que `GetTrialBalance`) : le banc de charge du lot 0 a
  // mesuré un facteur trente entre les deux approches sur la balance clients.
  const sumBySite = await sumSiteActualCostByIds(prisma, tenantId, siteIds);

  return {
    sites: rows.map((row: Record<string, any>) => toSiteRecord(row, sumBySite.get(row.id) ?? 0)),
    total
  };
};

// ---------------------------------------------------------------------------
// Détail d'un chantier
// ---------------------------------------------------------------------------

/** Ce que la résolution en lot doit produire pour une imputation, avant tri. */
interface ResolvedSource {
  date: Date;
  label: string;
}

/**
 * Résout la date et le libellé lisible de la pièce d'origine de chaque
 * imputation, par lot — une requête par nature de pièce (au plus deux ici),
 * jamais une requête par ligne. `CostAllocation` désigne sa pièce par
 * `(sourceType, sourceId)`, jamais par relation Prisma déclarée (même parti
 * pris que `ThirdPartyMovement.sourceId` au lot 1), donc cette résolution ne
 * peut pas passer par un simple `include`.
 */
async function resolveAllocationSources(
  tenantId: string,
  allocations: Array<{ sourceType: string; sourceId: string; createdAt: Date }>
): Promise<Map<string, ResolvedSource>> {
  const invoiceIds = allocations.filter(a => a.sourceType === 'SUPPLIER_INVOICE').map(a => a.sourceId);
  const voucherIds = allocations.filter(a => a.sourceType === 'CASH_VOUCHER').map(a => a.sourceId);

  const [invoices, vouchers] = await Promise.all([
    invoiceIds.length
      ? prisma.supplierInvoice.findMany({
          where: { id: { in: invoiceIds }, tenantId },
          include: { supplier: { select: { name: true } } }
        })
      : Promise.resolve([] as Array<Record<string, any>>),
    voucherIds.length
      ? prisma.cashVoucher.findMany({ where: { id: { in: voucherIds }, tenantId } })
      : Promise.resolve([] as Array<Record<string, any>>)
  ]);

  const resolved = new Map<string, ResolvedSource>();

  for (const invoice of invoices as Array<Record<string, any>>) {
    resolved.set(invoice.id, {
      date: invoice.invoiceDate,
      label: `Facture ${invoice.reference} — ${invoice.supplier?.name ?? 'fournisseur'}`
    });
  }

  for (const voucher of vouchers as Array<Record<string, any>>) {
    resolved.set(voucher.id, {
      date: voucher.voucherDate,
      // Une imputation ne nait qu'a la validation : la piece qui la porte a
      // donc toujours un numero ici. Le repli reste ecrit au cas ou une
      // donnee anterieure a la regle du 19 septembre 2026 traine en base.
      label: `Bon de caisse ${formatCashVoucherNumber(voucher.voucherYear, voucher.voucherNumber) ?? 'sans numéro'} — ${voucher.beneficiaryName}`
    });
  }

  return resolved;
}

/** Voir `GetSiteDetail` dans `./types-lot2.ts`. */
export const getSiteDetail: GetSiteDetail = async (tenantId, siteId) => {
  const siteRow = await prisma.constructionSite.findFirst({ where: { id: siteId, tenantId } });
  if (!siteRow) {
    throw new NotFoundError('Chantier introuvable.');
  }

  // Les imputations annulées n'ont plus leur place dans le détail affiché,
  // seulement dans l'historique de leur pièce d'origine : montrer une ligne
  // annulée sans le dire ferait croire à une double dépense.
  const allocations = await prisma.costAllocation.findMany({
    where: { tenantId, siteId, voidedAt: null },
    include: { costCategory: { select: { id: true, label: true } } },
    orderBy: [{ createdAt: 'asc' }]
  });

  const sources = await resolveAllocationSources(tenantId, allocations);

  const lines: SiteAllocationLine[] = allocations
    .map((allocation: Record<string, any>) => {
      const source = sources.get(allocation.sourceId);
      return {
        id: allocation.id,
        allocationDate: source?.date ?? allocation.createdAt,
        costCategoryId: allocation.costCategoryId,
        costCategoryLabel: allocation.costCategory?.label ?? 'Poste inconnu',
        sourceType: allocation.sourceType,
        sourceId: allocation.sourceId,
        sourceLabel: source?.label ?? `Pièce ${String(allocation.sourceId).slice(0, 8)}`,
        amount: toAmountOrZero(allocation.amount)
      };
    })
    .sort((a, b) => a.allocationDate.getTime() - b.allocationDate.getTime());

  // Sous-totaux par poste, dans l'ordre d'affichage des postes eux-mêmes
  // (`position`), pas dans l'ordre de première apparition dans les
  // imputations : un poste sans imputation ce mois-ci garde sa place logique
  // s'il en gagne une plus tard.
  const totalsByCategory = new Map<string, number>();
  for (const line of lines) {
    totalsByCategory.set(
      line.costCategoryId,
      roundMoney((totalsByCategory.get(line.costCategoryId) ?? 0) + line.amount)
    );
  }

  const orderedCategories = await fetchOrderedCostCategories(tenantId);
  const byCostCategory = orderedCategories
    .filter(category => totalsByCategory.has(category.id))
    .map(category => ({
      costCategoryId: category.id,
      label: category.label,
      amount: totalsByCategory.get(category.id) as number
    }));

  const actualCost = await getSiteActualCost(tenantId, siteId);

  const detail: SiteDetail = {
    site: toSiteRecord(siteRow, actualCost),
    allocations: lines,
    byCostCategory
  };
  return detail;
};
