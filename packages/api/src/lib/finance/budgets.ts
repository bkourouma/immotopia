/**
 * Budget de chantier et avenants — lot 3, premier volet
 * (`specs/018-finance-budget-pilotage/`).
 *
 * Implémente les sept fonctions « budget » du contrat gelé
 * (`./types-lot3.ts`) : création et validation d'un budget, sa lecture (le
 * validé, et la liste des brouillons), création et validation d'un avenant, et
 * sa liste. Les bons de commande, l'engagé, l'avancement, l'alerte et le
 * tableau de bord appartiennent à d'autres agents de ce lot.
 *
 * Trois règles du contrat s'appliquent ici sans exception, héritées des lots
 * précédents :
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.** Un budget se *prévoit*,
 *      un avenant *ajuste* — un test de ce fichier le vérifie sur toutes les
 *      chaînes renvoyées.
 *   2. **Toute fonction qui écrit prend le client de transaction fourni par
 *      l'appelant.** Rien n'ouvre sa propre transaction ici.
 *   3. **Ce qui se calcule ne se stocke pas** (P-4, voir l'en-tête du
 *      contrat) : `totalForecast` et `totalDelta` sont recalculés à chaque
 *      lecture, jamais lus depuis une colonne — il n'y en a pas.
 *
 * ---------------------------------------------------------------------------
 * Le point délicat : un seul budget validé par chantier
 * ---------------------------------------------------------------------------
 *
 * L'unicité est garantie en base par l'index partiel
 * `site_budgets_one_validated_per_site` (posé en SQL brut dans la migration
 * gelée, hors du territoire de cet agent — le DSL Prisma ne sait pas exprimer
 * un `WHERE` sur un index). Mais s'appuyer sur lui seul obligerait à *tenter*
 * la validation puis à relire sa violation (`P2002`) pour la traduire — motif
 * que `ledger.ts` et `accounting.ts` ont déjà abandonné au lot 2 : en
 * PostgreSQL, une commande en échec **condamne toute la transaction**, si bien
 * qu'un `catch` qui tenterait d'écrire autre chose ensuite dans la même
 * transaction échouerait à son tour, sans rapport avec son propre contenu.
 *
 * `validateSiteBudgetTx` lit donc d'abord (« ce chantier a-t-il déjà un budget
 * validé ? ») avant d'écrire quoi que ce soit. Cette lecture ferme la fenêtre
 * de concurrence dans l'immense majorité des cas, mais pas totalement : deux
 * validations vraiment simultanées sur le même chantier peuvent toutes deux
 * franchir la lecture avant que l'une ou l'autre n'ait écrit. L'index reste
 * donc posé comme filet — et sa violation est interceptée ici (même idiome
 * qu'à `sites.ts` pour l'unicité du libellé d'un poste de dépense) pour ne
 * **jamais** laisser remonter l'erreur Prisma brute : seule la lecture
 * préalable, elle, ne condamne rien.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { roundMoneyXof } from './money';
import { toAmountOrZero } from './types';
import type {
  BudgetAmendmentLineRecord,
  BudgetAmendmentRecord,
  CreateBudgetAmendmentTx,
  CreateSiteBudgetTx,
  GetValidatedSiteBudget,
  ListBudgetAmendments,
  ListSiteBudgets,
  SiteBudgetLineRecord,
  SiteBudgetRecord,
  ValidateBudgetAmendmentTx,
  ValidateSiteBudgetTx
} from './types-lot3';

/** Devise unique du lot (décision D9 du plan, actée depuis le lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/**
 * Un budget de chantier arrondit en XOF (l'unité, sans subdivision), comme le
 * reste des écritures propres au chantier depuis le lot 2 (`roundMoneyXof`,
 * `money.ts`) — factures, pièces de caisse. La colonne reste `Decimal(14,2)`
 * (décision D9), seul l'arrondi *applicatif* de ce chemin d'écriture descend à
 * l'unité, pour que la partie décimale stockée y vaille toujours `.00`. Voir
 * `money.ts` pour la raison de fond (l'arrondi au centime dérive sur un
 * flottant binaire ; celui à l'unité ne dérive pas).
 */
function round(value: number): number {
  return roundMoneyXof(value);
}

// ---------------------------------------------------------------------------
// Lecture groupée — un budget avec ses lignes ET leurs libellés de poste,
// en UNE requête (jointure Prisma), jamais une par ligne.
// ---------------------------------------------------------------------------

const BUDGET_INCLUDE = {
  lines: {
    include: { costCategory: { select: { id: true, label: true } } },
    orderBy: { createdAt: 'asc' as const }
  },
  // Résout `validatedByLabel` par la même jointure que les lignes — une seule
  // requête pour tout le budget, jamais une requête séparée pour son
  // validateur. Ajouté le 19 septembre 2026, additivement au contrat gelé :
  // `SiteBudgetRecord.validatedByLabel` nomme désormais qui a validé, comme
  // `BudgetAmendmentRecord.createdByLabel` nomme déjà qui a créé l'avenant.
  validatedBy: { select: { fullName: true, email: true } }
} as const;

type BudgetRow = Record<string, any>;
type AmendmentRow = Record<string, any>;

function toBudgetRecord(row: BudgetRow): SiteBudgetRecord {
  const lines: SiteBudgetLineRecord[] = (row.lines as BudgetRow[]).map(line => ({
    id: line.id,
    costCategoryId: line.costCategoryId,
    costCategoryLabel: line.costCategory?.label ?? 'Poste inconnu',
    label: line.label,
    amountForecast: round(toAmountOrZero(line.amountForecast))
  }));

  // Somme des lignes déjà arrondies, puis ré-arrondie : la colonne n'existe
  // pas (P-4), c'est ici et seulement ici que le total prend forme.
  const totalForecast = round(lines.reduce((sum, line) => sum + line.amountForecast, 0));

  return {
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    label: row.label,
    status: row.status,
    validatedAt: row.validatedAt ?? null,
    validatedByUserId: row.validatedByUserId ?? null,
    // Nul tant que le budget est un brouillon (pas de validateur à nommer) —
    // jamais résolu ligne à ligne : `row.validatedBy` vient de la même
    // jointure que `row.lines` (`BUDGET_INCLUDE`), une seule requête pour
    // tout le budget.
    validatedByLabel: row.validatedByUserId ? labelCreator(row.validatedBy, row.validatedByUserId) : null,
    currency: row.currency ?? DEFAULT_CURRENCY,
    lines,
    totalForecast
  };
}

async function fetchBudgetRowOrThrow(
  client: PrismaTransactionClient,
  tenantId: string,
  budgetId: string
): Promise<BudgetRow> {
  const row = await client.siteBudget.findFirst({
    where: { id: budgetId, tenantId },
    include: BUDGET_INCLUDE
  });
  if (!row) {
    throw notFound('Budget de chantier introuvable');
  }
  return row as BudgetRow;
}

/**
 * Libellé lisible d'une créatrice/d'un créateur d'avenant, avec repli sur son
 * identifiant abrégé — même convention que `validation-queue.ts` (US11).
 */
function labelCreator(user: { fullName: string | null; email: string } | null | undefined, userId: string): string {
  return user?.fullName || user?.email || `Utilisateur ${userId.slice(0, 8)}`;
}

const AMENDMENT_INCLUDE = {
  lines: {
    include: { costCategory: { select: { id: true, label: true } } },
    orderBy: { createdAt: 'asc' as const }
  },
  createdBy: { select: { fullName: true, email: true } }
} as const;

function toAmendmentRecord(row: AmendmentRow): BudgetAmendmentRecord {
  const lines: BudgetAmendmentLineRecord[] = (row.lines as BudgetRow[]).map(line => ({
    id: line.id,
    costCategoryId: line.costCategoryId,
    costCategoryLabel: line.costCategory?.label ?? 'Poste inconnu',
    // Signé : un avenant réduit parfois une enveloppe (voir le contrat).
    amountDelta: round(toAmountOrZero(line.amountDelta))
  }));

  const totalDelta = round(lines.reduce((sum, line) => sum + line.amountDelta, 0));

  return {
    id: row.id,
    budgetId: row.budgetId,
    amendmentDate: row.amendmentDate,
    reason: row.reason,
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdByLabel: labelCreator(row.createdBy, row.createdByUserId),
    validatedAt: row.validatedAt ?? null,
    lines,
    totalDelta
  };
}

async function fetchAmendmentRowOrThrow(
  client: PrismaTransactionClient,
  tenantId: string,
  amendmentId: string
): Promise<AmendmentRow> {
  const row = await client.budgetAmendment.findFirst({
    where: { id: amendmentId, tenantId },
    include: AMENDMENT_INCLUDE
  });
  if (!row) {
    throw notFound('Avenant introuvable');
  }
  return row as AmendmentRow;
}

// ---------------------------------------------------------------------------
// Validation des lignes — commune aux deux créations, avant toute écriture
// ---------------------------------------------------------------------------

/**
 * Vérifie que chaque poste de dépense référencé existe pour ce tenant, et
 * qu'il est actif. Une seule requête pour tous les postes de la pièce
 * (`findMany` avec `in`), jamais une par ligne — même discipline que la
 * résolution des libellés à la lecture.
 *
 * Renvoie la carte poste -> libellé, réutilisable par l'appelant s'il en a
 * besoin (aucun appelant n'en a besoin ici : la lecture qui suit l'écriture
 * rejoint déjà `CostCategory`, mais la vérification, elle, doit précéder
 * l'écriture — P-2 étendu aux références, pas seulement aux montants).
 */
async function ensureCostCategoriesUsableTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  entrees: Array<{ costCategoryId: string; delta?: number }>
): Promise<void> {
  const uniqueIds = [...new Set(entrees.map(e => e.costCategoryId))];
  const categories = await tx.costCategory.findMany({
    where: { id: { in: uniqueIds }, tenantId },
    select: { id: true, label: true, isActive: true }
  });
  const categoryById = new Map(categories.map((c: BudgetRow) => [c.id, c]));

  for (const entree of entrees) {
    const category = categoryById.get(entree.costCategoryId);
    if (!category) {
      throw notFound(`Poste de dépense ${entree.costCategoryId} introuvable`);
    }
    if (category.isActive) {
      continue;
    }

    // Un poste désactivé n'accepte plus de dépense — mais il faut pouvoir
    // RETIRER l'enveloppe qu'on lui avait accordée.
    //
    // Le cas est réel : un poste est désactivé parce que le périmètre a
    // changé, et son enveloppe doit alors être déplacée ailleurs par un
    // avenant qui le réduit et en augmente un autre. Refuser toute ligne sur
    // un poste désactivé, comme le faisait la première version, rendait cette
    // correction impossible et figeait une enveloppe morte dans le budget
    // révisé.
    //
    // On refuse donc d'AJOUTER sur un poste désactivé, jamais d'en retirer.
    // `delta` absent vaut ligne de budget initial, où seule l'augmentation a
    // un sens.
    const augmente = entree.delta === undefined || entree.delta > 0;
    if (augmente) {
      throw conflict(
        `Le poste de dépense « ${category.label} » est désactivé : son enveloppe ne peut plus être augmentée, seulement réduite`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// A. Création d'un budget de chantier (brouillon)
// ---------------------------------------------------------------------------

/** Voir `CreateSiteBudgetTx` dans `./types-lot3.ts`. */
export const createSiteBudgetTx: CreateSiteBudgetTx = async (tx, tenantId, params) => {
  const site = await tx.constructionSite.findFirst({ where: { id: params.siteId, tenantId }, select: { id: true } });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  const label = params.label?.trim();
  if (!label) {
    throw badRequest('Le libellé du budget est obligatoire');
  }

  // HYPOTHÈSE (voir le rapport) : le contrat ne dit pas explicitement qu'un
  // budget doit porter au moins une ligne, mais un budget sans ligne aurait un
  // total nul par construction (P-4) — ce n'est pas un budget, c'est un
  // brouillon vide. Même exigence qu'à la facture fournisseur du lot 2
  // (`createSupplierInvoiceTx`, `suppliers.ts`).
  if (params.lines.length === 0) {
    throw badRequest('Un budget doit porter au moins une ligne');
  }

  // Refuse deux lignes sur le même poste — exigé explicitement par le
  // contrat, ET vérifié AVANT toute écriture : aucune contrainte unique en
  // base ne rattrape ce cas (`SiteBudgetLine` n'en porte pas, à dessein — deux
  // brouillons différents peuvent tout à fait partager un poste).
  const seenCategoryIds = new Set<string>();
  for (const line of params.lines) {
    if (seenCategoryIds.has(line.costCategoryId)) {
      throw badRequest('Un même poste de dépense ne peut porter deux lignes dans un budget');
    }
    seenCategoryIds.add(line.costCategoryId);

    if (!line.label?.trim()) {
      throw badRequest('Le libellé de chaque ligne de budget est obligatoire');
    }
    if (!(line.amountForecast > 0)) {
      throw badRequest('Le montant prévu de chaque ligne doit être positif');
    }
  }

  await ensureCostCategoriesUsableTx(
    tx,
    tenantId,
    params.lines.map(line => ({ costCategoryId: line.costCategoryId }))
  );

  const budget = await tx.siteBudget.create({
    data: {
      tenantId,
      siteId: params.siteId,
      label,
      status: 'DRAFT',
      currency: DEFAULT_CURRENCY
    }
  });

  for (const line of params.lines) {
    await tx.siteBudgetLine.create({
      data: {
        budgetId: budget.id,
        costCategoryId: line.costCategoryId,
        label: line.label,
        amountForecast: round(line.amountForecast)
      }
    });
  }

  return toBudgetRecord(await fetchBudgetRowOrThrow(tx, tenantId, budget.id));
};

// ---------------------------------------------------------------------------
// B. Validation d'un budget — il devient le budget initial du chantier
// ---------------------------------------------------------------------------

/** Voir `ValidateSiteBudgetTx` dans `./types-lot3.ts`. */
export const validateSiteBudgetTx: ValidateSiteBudgetTx = async (tx, tenantId, budgetId, validatedByUserId) => {
  const budget = await tx.siteBudget.findFirst({ where: { id: budgetId, tenantId } });
  if (!budget) {
    throw notFound('Budget de chantier introuvable');
  }
  if (budget.status !== 'DRAFT') {
    // Ce qui est validé ne bouge plus (P-6) : une seconde validation n'est
    // pas une mise à jour, c'est un refus.
    throw conflict("Ce budget est déjà validé — un budget validé s'amende, il ne se revalide pas");
  }

  // LECTURE AVANT ÉCRITURE (voir l'en-tête du fichier) : un chantier n'a
  // qu'un seul budget validé à la fois. Vérifié ici plutôt que rattrapé après
  // coup, parce qu'un `INSERT`/`UPDATE` en échec condamnerait toute la
  // transaction — la vérification, elle, ne condamne rien si elle échoue.
  const alreadyValidated = await tx.siteBudget.findFirst({
    where: { tenantId, siteId: budget.siteId, status: 'VALIDATED' },
    select: { id: true }
  });
  if (alreadyValidated) {
    throw conflict("Ce chantier a déjà un budget validé — un budget validé s'amende, il ne se remplace pas");
  }

  try {
    // Mise à jour conditionnelle, même discipline qu'au lot 2 (`cash.ts`,
    // `suppliers.ts`) : si une autre transaction a validé CE budget entre
    // notre lecture et cet instant, `count` vaut 0 et on abandonne.
    const updateResult = await tx.siteBudget.updateMany({
      where: { id: budgetId, tenantId, status: 'DRAFT' },
      data: { status: 'VALIDATED', validatedAt: new Date(), validatedByUserId }
    });
    if (updateResult.count !== 1) {
      throw conflict("Ce budget vient d'être validé par ailleurs");
    }
  } catch (error) {
    // Filet de sécurité : si deux validations vraiment simultanées sur le
    // même chantier ont toutes deux franchi la lecture ci-dessus avant que
    // l'une n'écrive, l'index partiel `site_budgets_one_validated_per_site`
    // rejette la seconde écriture en base (violation d'unicité, code
    // `P2002`). Interceptée ici pour ne JAMAIS renvoyer l'erreur Prisma
    // brute — même idiome qu'à `sites.ts` pour l'unicité du libellé d'un
    // poste de dépense.
    if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002') {
      throw conflict("Ce chantier a déjà un budget validé — un budget validé s'amende, il ne se remplace pas");
    }
    throw error;
  }

  return toBudgetRecord(await fetchBudgetRowOrThrow(tx, tenantId, budgetId));
};

// ---------------------------------------------------------------------------
// C. Lectures — budget validé, et liste des budgets d'un chantier
// ---------------------------------------------------------------------------

/** Voir `GetValidatedSiteBudget` dans `./types-lot3.ts`. */
export const getValidatedSiteBudget: GetValidatedSiteBudget = async (tenantId, siteId) => {
  const row = await prisma.siteBudget.findFirst({
    where: { tenantId, siteId, status: 'VALIDATED' },
    include: BUDGET_INCLUDE
  });
  return row ? toBudgetRecord(row as BudgetRow) : null;
};

/** Voir `ListSiteBudgets` dans `./types-lot3.ts`. */
export const listSiteBudgets: ListSiteBudgets = async (tenantId, siteId) => {
  const rows = await prisma.siteBudget.findMany({
    where: { tenantId, siteId },
    include: BUDGET_INCLUDE,
    // Du plus récent au plus ancien, comme l'exige le contrat.
    orderBy: { createdAt: 'desc' }
  });
  return (rows as BudgetRow[]).map(toBudgetRecord);
};

// ---------------------------------------------------------------------------
// D. Création d'un avenant (brouillon) à un budget validé
// ---------------------------------------------------------------------------

/** Voir `CreateBudgetAmendmentTx` dans `./types-lot3.ts`. */
export const createBudgetAmendmentTx: CreateBudgetAmendmentTx = async (tx, tenantId, params) => {
  const budget = await tx.siteBudget.findFirst({ where: { id: params.budgetId, tenantId } });
  if (!budget) {
    throw notFound('Budget de chantier introuvable');
  }
  // On n'amende pas un brouillon, on le modifie (le contrat le dit
  // explicitement) : cette règle tient aussi sans qu'on ait à vérifier qu'un
  // budget validé le reste pour toujours — aucune fonction de ce contrat ne
  // dévalide un budget.
  if (budget.status !== 'VALIDATED') {
    throw conflict('Seul un budget validé peut être amendé — un brouillon se modifie directement');
  }

  const reason = params.reason?.trim();
  if (!reason) {
    throw badRequest("Le motif de l'avenant est obligatoire");
  }

  if (params.lines.length === 0) {
    throw badRequest('Un avenant doit porter au moins une ligne');
  }

  // HYPOTHÈSE (voir le rapport) : contrairement à `CreateSiteBudgetTx`, le
  // contrat ne demande PAS explicitement de refuser deux lignes sur le même
  // poste pour un avenant. On ne l'invente pas : deux lignes sur le même
  // poste d'un même avenant se cumulent simplement dans `totalDelta` et dans
  // l'écart par poste, sans ambiguïté nouvelle (à la différence d'un budget,
  // où deux lignes sur le même poste rendraient l'écart par poste ambigu
  // faute de savoir laquelle des deux enveloppes suivre).

  await ensureCostCategoriesUsableTx(
    tx,
    tenantId,
    params.lines.map(line => ({ costCategoryId: line.costCategoryId }))
  );

  const amendment = await tx.budgetAmendment.create({
    data: {
      tenantId,
      budgetId: params.budgetId,
      amendmentDate: params.amendmentDate,
      reason,
      status: 'DRAFT',
      createdByUserId: params.createdByUserId
    }
  });

  for (const line of params.lines) {
    await tx.budgetAmendmentLine.create({
      data: {
        amendmentId: amendment.id,
        costCategoryId: line.costCategoryId,
        amountDelta: round(line.amountDelta)
      }
    });
  }

  return toAmendmentRecord(await fetchAmendmentRowOrThrow(tx, tenantId, amendment.id));
};

// ---------------------------------------------------------------------------
// E. Validation d'un avenant — entre dans le budget révisé
// ---------------------------------------------------------------------------

/** Voir `ValidateBudgetAmendmentTx` dans `./types-lot3.ts`. */
export const validateBudgetAmendmentTx: ValidateBudgetAmendmentTx = async (
  tx,
  tenantId,
  amendmentId,
  validatedByUserId
) => {
  const amendment = await tx.budgetAmendment.findFirst({ where: { id: amendmentId, tenantId } });
  if (!amendment) {
    throw notFound('Avenant introuvable');
  }
  if (amendment.status !== 'DRAFT') {
    throw conflict('Cet avenant est déjà validé — ce qui est validé ne se revalide pas');
  }

  // Aucune unicité à protéger ici : plusieurs avenants VALIDÉS peuvent
  // coexister sur un même budget (le révisé est leur somme), à la différence
  // du budget lui-même. Une mise à jour conditionnelle suffit donc, sans
  // lecture préalable ni filet d'index partiel.
  const updateResult = await tx.budgetAmendment.updateMany({
    where: { id: amendmentId, tenantId, status: 'DRAFT' },
    data: { status: 'VALIDATED', validatedAt: new Date(), validatedByUserId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Cet avenant vient d'être validé par ailleurs");
  }

  return toAmendmentRecord(await fetchAmendmentRowOrThrow(tx, tenantId, amendmentId));
};

// ---------------------------------------------------------------------------
// F. Liste des avenants d'un budget
// ---------------------------------------------------------------------------

/** Voir `ListBudgetAmendments` dans `./types-lot3.ts`. */
export const listBudgetAmendments: ListBudgetAmendments = async (tenantId, budgetId) => {
  const rows = await prisma.budgetAmendment.findMany({
    where: { tenantId, budgetId },
    include: AMENDMENT_INCLUDE,
    // HYPOTHÈSE (voir le rapport) : le contrat ne précise pas d'ordre pour
    // cette liste (à la différence de `ListSiteBudgets`, qui l'exige
    // explicitement). Du plus récent au plus ancien par cohérence avec le
    // reste du lot — un avenant tout juste saisi doit se voir sans faire
    // défiler l'historique.
    // Du plus ANCIEN au plus récent, contrairement à la liste des budgets.
    // Les deux listes servent deux lectures différentes : on veut le dernier
    // brouillon de budget en tête, mais un historique d'avenants se lit dans
    // l'ordre où il s'est constitué — « initial 10 M, plus 2 M en mars, moins
    // 500 k en mai, donc révisé 11,5 M ». C'est aussi l'ordre dans lequel le
    // budget révisé se calcule.
    orderBy: [{ amendmentDate: 'asc' }, { createdAt: 'asc' }]
  });
  return (rows as AmendmentRow[]).map(toAmendmentRecord);
};
