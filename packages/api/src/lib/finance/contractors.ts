/**
 * Tâcherons — lot 4, quatrième sous-lot (`types-lot4-contractors.ts`, contrat
 * gelé).
 *
 * Implémente les onze fonctions du contrat : le tâcheron et son compte de
 * tiers, le marché (avec le poste de dépense qui recevra ses situations), la
 * situation d'avancement (brouillon puis validée, qui impute le coût réel du
 * chantier), le règlement (brouillon puis validé).
 *
 * Style suivi, comme demandé par l'en-tête du contrat : `suppliers.ts` (lot 2)
 * pour le cycle brouillon → validation, la mise à jour conditionnelle qui
 * ferme la fenêtre de concurrence, et `resolveExpenseAccountsByCostCategoryTx`
 * pour que le compte de charge suive le poste plutôt qu'un compte unique ;
 * `land-leases.ts` (lot 4, premier sous-lot) pour la résolution des comptes
 * opérationnels et la production d'une imputation RÉELLE qui fait monter le
 * coût d'un chantier ; `salaries.ts` (lot 4, troisième sous-lot) pour le
 * gabarit exact des onze fonctions (tiers + pièce à deux temps + règlement).
 *
 * ---------------------------------------------------------------------------
 * Les deux soldes, et pourquoi ce fichier ne les confond jamais
 * ---------------------------------------------------------------------------
 *
 * `ContractorContractRecord.remainingAmount` (marché convenu − situations
 * validées) et `ContractorRecord.accountBalance` (situations validées −
 * règlements, porté par le compte de tiers) sont deux calculs totalement
 * indépendants :
 *
 *   - le premier ne vit que dans `toContractorContractRecord`, dérivé de
 *     `agreedAmount` et de `statementedAmount` (une somme de
 *     `ProgressStatement`) ;
 *   - le second vit dans `ThirdPartyAccount.balance`, tenu par
 *     `appendThirdPartyMovementTx` (`ledger.ts`, non modifié ici) au fil des
 *     mouvements `billed`/`settled`.
 *
 * Rien dans ce fichier ne calcule l'un à partir de l'autre. Un tâcheron qui a
 * terminé son marché (`remainingAmount = 0`) mais qu'on n'a pas réglé reste
 * créancier (`accountBalance > 0`) : `validateProgressStatementTx` a fait
 * monter le solde du compte de tiers, `validateContractorPaymentTx` n'a
 * jamais été appelée. Symétriquement, un acompte versé avant toute situation
 * rend le compte débiteur sans toucher au marché.
 *
 * ---------------------------------------------------------------------------
 * Le dépassement de marché n'est vérifié nulle part
 * ---------------------------------------------------------------------------
 *
 * `validateProgressStatementTx` ne compare jamais le cumul des situations à
 * `agreedAmount` : ce n'est pas un oubli, c'est le contrat (en-tête,
 * « un dépassement de marché n'est pas refusé »). `remainingAmount` devient
 * négatif et `ContractorContractRecord.isOverrun` le dit, exactement comme
 * `remainingAmount`/`isOverrun` sont calculés à la lecture, jamais stockés.
 *
 * ---------------------------------------------------------------------------
 * Écarts entre ce contrat gelé et les DEUX AUTRES contrats gelés dont ce
 * fichier dépend (`types.ts`, `types-lot2.ts`) — documentés ici plutôt que
 * silencieux, aucun des trois fichiers n'étant modifiable par cet agent
 * ---------------------------------------------------------------------------
 *
 * Le schéma Prisma et son CLIENT GÉNÉRÉ sont, eux, complets pour ce sous-lot :
 * vérifié sur `node_modules/.prisma/client/index.d.ts` (pas seulement sur
 * `schema.prisma`, la vérification que le premier sous-lot — baux de terrain —
 * avait omise et qui avait laissé passer un schéma à moitié gelé). `Contractor`,
 * `ContractorContract`, `ProgressStatement`, `ContractorPayment` existent tous,
 * et `PROGRESS_STATEMENT`/`CONTRACTOR_PAYMENT` figurent déjà dans les DEUX
 * enums Postgres qui comptent : `CostAllocationSourceType` et `SourceType`
 * (celui de `JournalEntry.sourceType`). Le 402 (Tacherons) est également déjà
 * semé dans `OPERATIONAL_ACCOUNT_SEEDS` (`accounting.ts`).
 *
 * Les DEUX UNIONS TYPESCRIPT qui portent ces mêmes natures à la frontière des
 * deux autres contrats gelés — `FinanceSourceType` (`types.ts`) et
 * `PostDocumentEntryParams.documentType` (`types-lot2.ts`) — ne les
 * connaissaient pas, et ce fichier a d'abord transtypé pour compiler, comme
 * `land-leases.ts` et `salaries.ts` avant lui.
 *
 * **Les deux unions ont été élargies à l'intégration**, ainsi que
 * `SOURCE_TYPE_BY_DOCUMENT` (`accounting.ts`), qui sans cela aurait fait
 * retomber les écritures de ce sous-lot sur `MANUAL` — un défaut silencieux,
 * qui ne casse aucun test et rend seulement le grand livre illisible. Les
 * transtypages ont disparu : les natures s'écrivent en clair.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import {
  ensureOperationalChartOfAccountsTx,
  ensureOperationalJournalTx,
  postDocumentEntryTx,
  resolveExpenseAccountsByCostCategoryTx
} from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import { assertSiteOpenTx } from './site-closing';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof } from './money';
import { toAmountOrZero } from './types';
import { ensureDefaultTreasuryAccountTx } from '../treasury/accounts';
import type {
  ContractorContractRecord,
  ContractorPaymentRecord,
  ContractorRecord,
  CreateContractorContractTx,
  CreateContractorPaymentTx,
  CreateContractorTx,
  CreateProgressStatementTx,
  GetContractorContract,
  ListContractorContracts,
  ListContractorPayments,
  ListContractors,
  ListProgressStatements,
  ProgressStatementRecord,
  ValidateContractorPaymentTx,
  ValidateProgressStatementTx
} from './types-lot4-contractors';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  /** 402 — Tacherons : ce qu'on leur doit, distinct du 401 des fournisseurs. */
  contractorsAccountId: string;
  /** 605 — Charges de chantier : repli quand le poste du marché n'a pas son propre compte. */
  siteExpenseAccountId: string;
  /** Caisse : la même trésorerie que partout ailleurs, résolue par `treasury/accounts.ts`. */
  cashAccountId: string;
}

/**
 * Résout le journal et les comptes dont une pièce de tâcheron a besoin.
 * Délègue entièrement à `accounting.ts`, comme `suppliers.ts`, `land-leases.ts`
 * et `salaries.ts` : ce fichier ne porte aucune copie du plan de comptes.
 */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes, cashTreasury] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId),
    ensureDefaultTreasuryAccountTx(tx, tenantId, 'CASH')
  ]);

  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte opérationnel ${numero} absent après amorçage du plan de comptes.`);
    }
    return id;
  };

  return {
    journalId,
    contractorsAccountId: exiger('402'),
    siteExpenseAccountId: exiger('605'),
    cashAccountId: cashTreasury.chartOfAccountId
  };
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toContractorRecord(row: any): ContractorRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fullName: row.fullName,
    trade: row.trade ?? null,
    thirdPartyAccountId: row.thirdPartyAccountId,
    isActive: row.isActive,
    accountBalance: roundMoneyXof(toAmountOrZero(row.thirdPartyAccount?.balance)),
    currency: row.thirdPartyAccount?.currency ?? DEFAULT_CURRENCY
  };
}

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

/**
 * `statementedAmount` est TOUJOURS fourni par l'appelant (jamais recalculé
 * ici) : c'est le résultat d'une requête de LOT (`loadStatementedAmountsByContractIds`),
 * jamais une requête par ligne — voir la note devant cette fonction.
 */
function toContractorContractRecord(row: any, statementedAmount: number): ContractorContractRecord {
  const agreedAmount = roundMoneyXof(toAmountOrZero(row.agreedAmount));
  // `remainingAmount` peut être négatif : un dépassement est exposé, jamais
  // refusé (voir l'en-tête du fichier et celui du contrat).
  const remainingAmount = roundMoneyXof(agreedAmount - statementedAmount);
  return {
    id: row.id,
    contractorId: row.contractorId,
    contractorLabel: row.contractor?.fullName ?? 'Tâcheron inconnu',
    siteId: row.siteId,
    siteLabel: row.site?.name ?? 'Chantier inconnu',
    costCategoryId: row.costCategoryId,
    costCategoryLabel: row.costCategory?.label ?? 'Poste de dépense inconnu',
    reference: row.reference,
    agreedAmount,
    currency: row.currency,
    signedDate: row.signedDate,
    isActive: row.isActive,
    statementedAmount,
    remainingAmount,
    isOverrun: remainingAmount < 0
  };
}

function toProgressStatementRecord(
  row: any,
  contract: { id: string; reference: string; contractor?: { fullName?: string | null } | null }
): ProgressStatementRecord {
  return {
    id: row.id,
    contractId: row.contractId,
    contractReference: contract.reference,
    contractorLabel: contract.contractor?.fullName ?? 'Tâcheron inconnu',
    statementDate: row.statementDate,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    description: row.description,
    status: row.status,
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

function toContractorPaymentRecord(row: any): ContractorPaymentRecord {
  return {
    id: row.id,
    contractorId: row.contractorId,
    contractorLabel: row.contractor?.fullName ?? 'Tâcheron inconnu',
    paymentDate: row.paymentDate,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    status: row.status,
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

// ---------------------------------------------------------------------------
// Le montant statué d'un marché — requête PAR LOT, jamais une par ligne
//
// `statementedAmount` (somme des situations VALIDÉES d'un marché) est une
// notion propre à ce sous-lot : elle ne vit dans aucun fichier partagé (à la
// différence du coût réel d'un chantier, `site-cost.ts`, que cette fonction
// N'IMITE PAS et ne redéfinit pas — un marché n'est pas un chantier, deux
// marchés peuvent partager le même chantier). Une seule fonction sert à la
// fois la liste (N marchés) et le détail (1 marché) : passer un tableau à un
// seul élément n'est pas un cas particulier, c'est la même requête groupée.
// ---------------------------------------------------------------------------

async function loadStatementedAmountsByContractIds(
  client: PrismaTransactionClient,
  tenantId: string,
  contractIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniques = [...new Set(contractIds)];
  if (uniques.length === 0) {
    return map;
  }

  const rows = await client.progressStatement.groupBy({
    by: ['contractId'],
    where: { tenantId, contractId: { in: uniques }, validatedAt: { not: null } },
    _sum: { amount: true }
  });

  for (const row of rows as Array<Record<string, any>>) {
    map.set(row.contractId as string, roundMoneyXof(toAmountOrZero(row._sum?.amount)));
  }

  return map;
}

// ---------------------------------------------------------------------------
// A. Le tâcheron et son compte de tiers
// ---------------------------------------------------------------------------

/** Voir `CreateContractorTx` dans `./types-lot4-contractors.ts`. */
export const createContractorTx: CreateContractorTx = async (tx, tenantId, params) => {
  if (!params.fullName?.trim()) {
    throw badRequest('Le nom complet du tâcheron est obligatoire');
  }

  // Le compte naît avec le tâcheron, dans la même transaction : un tâcheron
  // sans compte ne pourrait rien devoir, et la première situation le
  // trouverait manquant (même raison qu'au fournisseur du lot 2, au bailleur
  // et à l'employé du lot 4).
  const account = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'CONTRACTOR' as any,
      label: params.fullName,
      balance: 0,
      currency: DEFAULT_CURRENCY
    }
  });

  const contractor = await tx.contractor.create({
    data: {
      tenantId,
      fullName: params.fullName,
      trade: params.trade ?? null,
      thirdPartyAccountId: account.id
    }
  });

  return toContractorRecord({ ...contractor, thirdPartyAccount: account });
};

/** Voir `ListContractors` dans `./types-lot4-contractors.ts`. */
export const listContractors: ListContractors = async (tenantId, filters) => {
  const rows = await prisma.contractor.findMany({
    where: { tenantId, ...(filters.onlyActive ? { isActive: true } : {}) },
    include: { thirdPartyAccount: true },
    orderBy: { fullName: 'asc' }
  });

  return rows.map((row: any) => toContractorRecord(row));
};

// ---------------------------------------------------------------------------
// B. Le marché
// ---------------------------------------------------------------------------

/** Voir `CreateContractorContractTx` dans `./types-lot4-contractors.ts`. */
export const createContractorContractTx: CreateContractorContractTx = async (tx, tenantId, params) => {
  const contractor = await tx.contractor.findFirst({
    where: { id: params.contractorId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!contractor) {
    throw notFound('Tâcheron introuvable');
  }

  const site = await tx.constructionSite.findFirst({
    where: { id: params.siteId, tenantId },
    select: { id: true, name: true }
  });
  if (!site) {
    throw notFound('Chantier introuvable');
  }

  // Le poste est EXIGÉ, jamais deviné : c'est lui qui recevra les situations
  // dans le coût du chantier (contrat, `CreateContractorContractTx`). Même
  // parti pris qu'au bail de terrain et à la note de salaire.
  const costCategory = await tx.costCategory.findFirst({
    where: { id: params.costCategoryId, tenantId },
    select: { id: true, label: true, isActive: true }
  });
  if (!costCategory) {
    throw notFound('Poste de dépense introuvable');
  }
  if (!costCategory.isActive) {
    // Refus délibéré, pas un repli sur un autre poste : un poste désactivé
    // est un geste de paramétrage voulu par la gestionnaire (même règle qu'au
    // bail de terrain et à la note de salaire).
    throw conflict('Ce poste de dépense est désactivé');
  }

  const agreedAmount = roundMoneyXof(params.agreedAmount);
  if (agreedAmount <= 0) {
    throw badRequest('Le montant convenu du marché doit être strictement positif');
  }

  if (!params.reference?.trim()) {
    throw badRequest('La référence du marché est obligatoire');
  }

  // Lecture avant écriture : `@@unique([tenantId, reference])` (schema.prisma)
  // tuerait toute la transaction si on la laissait remonter en violation —
  // en PostgreSQL une commande en échec condamne toute la transaction, donc
  // « tenter puis rattraper » ne marche pas ici (même raisonnement qu'à la
  // note de salaire, `salaries.ts`, et à la constatation de bail de terrain).
  const existing = await tx.contractorContract.findFirst({
    where: { tenantId, reference: params.reference },
    select: { id: true }
  });
  if (existing) {
    throw conflict('Un marché porte déjà cette référence');
  }

  const contract = await tx.contractorContract.create({
    data: {
      tenantId,
      contractorId: params.contractorId,
      siteId: params.siteId,
      costCategoryId: params.costCategoryId,
      reference: params.reference,
      agreedAmount,
      currency: DEFAULT_CURRENCY,
      signedDate: params.signedDate
    }
  });

  // Marché neuf : aucune situation ne lui est encore validée.
  return toContractorContractRecord({ ...contract, contractor, site, costCategory }, 0);
};

/** Voir `ListContractorContracts` dans `./types-lot4-contractors.ts`. */
export const listContractorContracts: ListContractorContracts = async (tenantId, filters) => {
  const rows = await prisma.contractorContract.findMany({
    where: {
      tenantId,
      ...(filters.contractorId ? { contractorId: filters.contractorId } : {}),
      ...(filters.siteId ? { siteId: filters.siteId } : {})
    },
    include: {
      contractor: { select: { fullName: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (rows.length === 0) {
    return [];
  }

  // Libellés ET montant statué résolus par requête PAR LOT : un `include`
  // (déjà un lot côté Prisma) pour les libellés, une seule requête groupée
  // pour le montant statué de TOUS les marchés listés — jamais N requêtes
  // pour N marchés.
  const statementedByContract = await loadStatementedAmountsByContractIds(
    prisma,
    tenantId,
    rows.map((row: any) => row.id)
  );

  return rows.map((row: any) => toContractorContractRecord(row, statementedByContract.get(row.id) ?? 0));
};

/** Voir `GetContractorContract` dans `./types-lot4-contractors.ts`. */
export const getContractorContract: GetContractorContract = async (tenantId, contractId) => {
  const row = await prisma.contractorContract.findFirst({
    where: { id: contractId, tenantId },
    include: {
      contractor: { select: { fullName: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } }
    }
  });
  if (!row) {
    throw notFound('Marché de tâcheron introuvable');
  }

  const statementedByContract = await loadStatementedAmountsByContractIds(prisma, tenantId, [contractId]);
  return toContractorContractRecord(row, statementedByContract.get(contractId) ?? 0);
};

// ---------------------------------------------------------------------------
// C. La situation d'avancement — saisie en brouillon
// ---------------------------------------------------------------------------

/** Voir `CreateProgressStatementTx` dans `./types-lot4-contractors.ts`. */
export const createProgressStatementTx: CreateProgressStatementTx = async (tx, tenantId, params) => {
  const contract = await tx.contractorContract.findFirst({
    where: { id: params.contractId, tenantId },
    include: { contractor: { select: { fullName: true } } }
  });
  if (!contract) {
    throw notFound('Marché de tâcheron introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant de la situation doit être strictement positif');
  }

  // La description est OBLIGATOIRE (contrat, en-tête) : une situation sans
  // description est un chiffre que personne ne saura justifier six mois plus
  // tard — même exigence que le motif d'un avenant au lot 3. Vérifiée ici en
  // plus du schéma Zod (`schemas-contractors.ts`) : le domaine reste la seule
  // autorité, joignable directement par les tests unitaires sans passer par
  // la route.
  if (!params.description?.trim()) {
    throw badRequest('La description de la situation est obligatoire');
  }

  // BROUILLON. Aucune écriture, aucun mouvement, aucune imputation : une
  // situation saisie n'a encore rien constaté (contrat, en-tête). Tout naît à
  // la validation (`validateProgressStatementTx`), comme toute pièce depuis
  // le lot 2.
  const statement = await tx.progressStatement.create({
    data: {
      tenantId,
      contractId: params.contractId,
      statementDate: params.statementDate,
      amount,
      currency: contract.currency,
      description: params.description,
      status: 'DRAFT' as any,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toProgressStatementRecord(statement, contract);
};

// ---------------------------------------------------------------------------
// D. La situation d'avancement — validation (écriture + mouvement + imputation)
// ---------------------------------------------------------------------------

/** Voir `ValidateProgressStatementTx` dans `./types-lot4-contractors.ts`. */
export const validateProgressStatementTx: ValidateProgressStatementTx = async (
  tx,
  tenantId,
  statementId,
  validatedByUserId
) => {
  const statement = await tx.progressStatement.findFirst({ where: { id: statementId, tenantId } });
  if (!statement) {
    throw notFound('Situation d’avancement introuvable');
  }
  if (statement.status !== 'DRAFT') {
    // Ce qui est validé ne bouge plus (principe P-6) : une seconde validation
    // n'est pas une mise à jour, c'est un refus.
    throw conflict('Cette situation a déjà été validée ou annulée — une pièce validée ne se modifie plus');
  }

  const contract = await tx.contractorContract.findFirst({
    where: { id: statement.contractId, tenantId },
    include: { contractor: { select: { id: true, fullName: true, thirdPartyAccountId: true } } }
  });
  if (!contract) {
    throw notFound('Marché de tâcheron introuvable pour cette situation');
  }

  const amount = roundMoneyXof(toAmountOrZero(statement.amount));
  const accounts = await resolveOperationalAccounts(tx, tenantId, statement.statementDate);

  // Le compte de charge suit le POSTE DU MARCHÉ, avec repli sur les charges de
  // chantier (605) — jamais un compte unique frappé pour toute dépense de
  // chantier, le défaut corrigé au lot 3 (voir `accounting.ts`,
  // `resolveExpenseAccountsByCostCategoryTx`). Un seul poste ici (celui du
  // marché), mais la fonction reste appelée par lot comme partout ailleurs :
  // aucune raison de contourner l'API commune pour un seul identifiant.
  const comptesParPoste = await resolveExpenseAccountsByCostCategoryTx(
    tx,
    tenantId,
    [contract.costCategoryId],
    accounts.siteExpenseAccountId
  );
  const compteDeCharge = comptesParPoste.get(contract.costCategoryId) ?? accounts.siteExpenseAccountId;

  // Journal : débit du compte de charge du poste (ou 605 à défaut), crédit des
  // tacherons (402) — le tâcheron devient créancier.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: statement.statementDate,
    reference: `SIT-${contract.reference}-${statement.id}`,
    description: `Situation d'avancement — ${contract.contractor.fullName} — ${contract.reference}`,
    documentType: 'PROGRESS_STATEMENT',
    documentId: statement.id,
    lines: [
      {
        accountId: compteDeCharge,
        debit: amount,
        label: `Situation d'avancement — ${contract.contractor.fullName}`
      },
      {
        accountId: accounts.contractorsAccountId,
        credit: amount,
        label: `Tâcheron — ${contract.contractor.fullName}`
      }
    ]
  });

  // Compte de tiers : le tâcheron nous est dû davantage — `billed`, qui
  // augmente le solde du compte de tiers (« positif quand nous lui devons »,
  // voir `ContractorRecord.accountBalance`, contrat). Même fonction que pour
  // le fournisseur du lot 2 et l'employé du lot 4, seule l'interprétation du
  // signe est symétrique selon le tiers.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: contract.contractor.thirdPartyAccountId,
    tenantId,
    type: 'INSTALLMENT',
    billed: amount,
    label: `Situation ${contract.reference}`,
    sourceType: 'PROGRESS_STATEMENT',
    sourceId: statement.id,
    movementDate: statement.statementDate
  });
  if (!movement) {
    throw notFound('Compte de tiers du tâcheron introuvable');
  }

  // Imputation RÉELLE, exactement comme une facture fournisseur, une
  // constatation de bail ou une note de salaire : le poste DU MARCHÉ,
  // `validatedAt` renseigné, `voidedAt` nul. C'est ce filtre précis que
  // `sumSiteActualCost` (`site-cost.ts`, non modifié ici) lit pour le coût
  // réel du chantier — sans cette persistance, le travail d'un tâcheron
  // n'entrerait JAMAIS dans ce coût.
  // Lot 4, sous-lot 6 : un chantier clos n'accepte plus aucune depense.
  //
  // C'est LA garde qui rend `finalCost` vrai. Sans elle, une piece validee le
  // lendemain d'une cloture ferait diverger le cout fige du cout reel, et les
  // deux chiffres se contrediraient sans que rien ne le signale.
  await assertSiteOpenTx(tx, tenantId, contract.siteId);

  await tx.costAllocation.create({
    data: {
      tenantId,
      siteId: contract.siteId,
      costCategoryId: contract.costCategoryId,
      sourceType: 'PROGRESS_STATEMENT',
      sourceId: statement.id,
      amount,
      validatedAt: new Date(),
      voidedAt: null
    }
  });

  // Le coût réel du chantier vient de changer : le programme de travaux
  // rattaché doit suivre, DANS CETTE transaction — même geste qu'à la
  // validation d'une facture fournisseur, d'une constatation de bail ou d'une
  // note de salaire.
  await syncWorkProgramCostTx(tx, tenantId, contract.siteId);

  // Mise à jour conditionnelle, même discipline que partout depuis le lot 2 :
  // si une autre transaction a validé cette même situation entre notre
  // lecture et cet instant, `count` vaut 0 et on abandonne — l'écriture, le
  // mouvement et l'imputation créés ici repartent avec le rollback.
  const updateResult = await tx.progressStatement.updateMany({
    where: { id: statement.id, tenantId, status: 'DRAFT' as any },
    data: { status: 'VALIDATED' as any, validatedByUserId, validatedAt: new Date(), journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Cette situation vient d'être validée par ailleurs");
  }

  const updated = await tx.progressStatement.findFirst({
    where: { id: statement.id, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toProgressStatementRecord(updated, contract);
};

// ---------------------------------------------------------------------------
// E. Situations — liste d'un marché
// ---------------------------------------------------------------------------

/** Voir `ListProgressStatements` dans `./types-lot4-contractors.ts`. */
export const listProgressStatements: ListProgressStatements = async (tenantId, contractId) => {
  const contract = await prisma.contractorContract.findFirst({
    where: { id: contractId, tenantId },
    include: { contractor: { select: { fullName: true } } }
  });
  if (!contract) {
    throw notFound('Marché de tâcheron introuvable');
  }

  const rows = await prisma.progressStatement.findMany({
    where: { contractId, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } },
    orderBy: { statementDate: 'desc' }
  });

  // `contractReference`/`contractorLabel` viennent du marché résolu UNE FOIS
  // ci-dessus, jamais d'une requête par situation.
  return rows.map((row: any) => toProgressStatementRecord(row, contract));
};

// ---------------------------------------------------------------------------
// F. Le règlement — saisie en brouillon
// ---------------------------------------------------------------------------

/** Voir `CreateContractorPaymentTx` dans `./types-lot4-contractors.ts`. */
export const createContractorPaymentTx: CreateContractorPaymentTx = async (tx, tenantId, params) => {
  const contractor = await tx.contractor.findFirst({
    where: { id: params.contractorId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!contractor) {
    throw notFound('Tâcheron introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant du règlement doit être strictement positif');
  }

  // BROUILLON. Ni écriture, ni mouvement de compte : un règlement saisi n'a
  // encore rien réglé. Tout naît à la validation (`validateContractorPaymentTx`).
  // Sans affectation à des situations précises (contrat, `CreateContractorPaymentTx`) :
  // le solde du compte du tâcheron dit ce qui lui reste dû, et c'est la seule
  // question qu'on se pose — un règlement avant toute situation est un
  // acompte, et il se déduit tout seul (contrat, en-tête).
  const payment = await tx.contractorPayment.create({
    data: {
      tenantId,
      contractorId: params.contractorId,
      paymentDate: params.paymentDate,
      amount,
      currency: DEFAULT_CURRENCY,
      status: 'DRAFT' as any,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toContractorPaymentRecord({ ...payment, contractor });
};

// ---------------------------------------------------------------------------
// G. Le règlement — validation (écriture + mouvement)
// ---------------------------------------------------------------------------

/** Voir `ValidateContractorPaymentTx` dans `./types-lot4-contractors.ts`. */
export const validateContractorPaymentTx: ValidateContractorPaymentTx = async (
  tx,
  tenantId,
  paymentId,
  validatedByUserId
) => {
  const payment = await tx.contractorPayment.findFirst({ where: { id: paymentId, tenantId } });
  if (!payment) {
    throw notFound('Règlement de tâcheron introuvable');
  }
  if (payment.status !== 'DRAFT') {
    throw conflict('Ce règlement a déjà été validé ou annulé — une pièce validée ne se modifie plus');
  }

  const contractor = await tx.contractor.findFirst({
    where: { id: payment.contractorId, tenantId },
    select: { id: true, fullName: true, thirdPartyAccountId: true }
  });
  if (!contractor) {
    throw notFound('Tâcheron introuvable pour ce règlement');
  }

  const amount = roundMoneyXof(toAmountOrZero(payment.amount));
  const accounts = await resolveOperationalAccounts(tx, tenantId, payment.paymentDate);

  // Journal : débit des tacherons (402), crédit de la caisse (571) — la dette
  // envers le tâcheron s'éteint (ou se creuse en acompte), la trésorerie sort.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: payment.paymentDate,
    reference: `TACH-REG-${payment.id}`,
    description: `Règlement tâcheron — ${contractor.fullName}`,
    documentType: 'CONTRACTOR_PAYMENT',
    documentId: payment.id,
    lines: [
      { accountId: accounts.contractorsAccountId, debit: amount, label: `Règlement — ${contractor.fullName}` },
      { accountId: accounts.cashAccountId, credit: amount, label: `Règlement — ${contractor.fullName}` }
    ]
  });

  // Compte de tiers : ce qu'on doit au tâcheron diminue d'autant — `settled`.
  //
  // AUCUNE VÉRIFICATION du solde avant d'écrire, et c'est délibéré (contrat,
  // `ValidateContractorPaymentTx`) : un acompte versé avant toute situation
  // est COURANT et ACCEPTÉ. Le compte devient alors débiteur (solde négatif),
  // exactement symétrique de l'acompte fournisseur du lot 2 —
  // `appendThirdPartyMovementTx` ne compare jamais `settled` au solde
  // courant, il se contente de soustraire.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: contractor.thirdPartyAccountId,
    tenantId,
    type: 'PAYMENT',
    settled: amount,
    label: `Règlement — ${contractor.fullName}`,
    sourceType: 'CONTRACTOR_PAYMENT',
    sourceId: payment.id,
    movementDate: payment.paymentDate
  });
  if (!movement) {
    throw notFound('Compte de tiers du tâcheron introuvable');
  }

  // Mise à jour conditionnelle — même discipline que partout depuis le lot 2.
  const updateResult = await tx.contractorPayment.updateMany({
    where: { id: payment.id, tenantId, status: 'DRAFT' as any },
    data: { status: 'VALIDATED' as any, validatedByUserId, validatedAt: new Date(), journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Ce règlement vient d'être validé par ailleurs");
  }

  const updated = await tx.contractorPayment.findFirst({
    where: { id: payment.id, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toContractorPaymentRecord({ ...updated, contractor });
};

// ---------------------------------------------------------------------------
// H. Règlements — liste d'un tâcheron
// ---------------------------------------------------------------------------

/** Voir `ListContractorPayments` dans `./types-lot4-contractors.ts`. */
export const listContractorPayments: ListContractorPayments = async (tenantId, contractorId) => {
  const contractor = await prisma.contractor.findFirst({
    where: { id: contractorId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!contractor) {
    throw notFound('Tâcheron introuvable');
  }

  const rows = await prisma.contractorPayment.findMany({
    where: { contractorId, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } },
    orderBy: { paymentDate: 'desc' }
  });

  return rows.map((row: any) => toContractorPaymentRecord({ ...row, contractor }));
};
