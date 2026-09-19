/**
 * Salaires — lot 4, troisième sous-lot (`types-lot4-salaries.ts`).
 *
 * Implémente les neuf fonctions du contrat gelé : l'employé et son compte de
 * tiers, la note de salaire (brouillon puis validée) et son imputation à un
 * chantier, le règlement (brouillon puis validé).
 *
 * Style suivi, comme demandé par l'en-tête du contrat : `suppliers.ts` (lot 2)
 * pour le cycle brouillon → validation et la mise à jour conditionnelle qui
 * ferme la fenêtre de concurrence, `land-leases.ts` (lot 4, premier sous-lot)
 * pour la façon de résoudre les comptes opérationnels et de produire une
 * imputation RÉELLE qui fait monter le coût d'un chantier.
 *
 * ---------------------------------------------------------------------------
 * Aucun calcul social — voir l'en-tête du contrat
 * ---------------------------------------------------------------------------
 *
 * Ce fichier ne calcule ni cotisation, ni retenue, ni net à payer. Le montant
 * saisi sur la note est le montant qui, validé, devient une dette envers
 * l'employé, et rien d'autre n'en dérive.
 *
 * ---------------------------------------------------------------------------
 * Deux écarts entre le contrat gelé (types-lot4-salaries.ts) et les DEUX
 * AUTRES contrats gelés dont ce fichier dépend (types.ts, types-lot2.ts) —
 * documentés ici plutôt que silencieux, aucun des trois fichiers n'étant
 * modifiable par cet agent
 * ---------------------------------------------------------------------------
 *
 * Le schéma Prisma (`schema.prisma`) et son client généré sont, eux,
 * COMPLETS pour ce sous-lot : `SALARY_NOTE` et `SALARY_PAYMENT` existent déjà
 * dans `CostAllocationSourceType` ET dans `SourceType` (vérifié sur
 * `node_modules/.prisma/client/index.d.ts`, pas seulement sur `schema.prisma`
 * — c'est précisément la vérification que le sous-lot précédent avait omise
 * et qui avait laissé passer un schéma gelé à moitié). Aucune migration
 * manquante ici, contrairement au premier sous-lot (baux de terrain).
 *
 * Les DEUX UNIONS TYPESCRIPT qui portent ces mêmes natures à la frontière des
 * deux autres contrats gelés — `FinanceSourceType` (`types.ts`) et
 * `PostDocumentEntryParams.documentType` (`types-lot2.ts`) — ne les
 * connaissaient pas non plus, et ce fichier a d'abord transtypé pour compiler,
 * comme `land-leases.ts` l'avait fait avant lui.
 *
 * **Les deux unions ont été élargies à l'intégration**, et les transtypages
 * ont disparu : les natures s'écrivent en clair. C'est la troisième fois que
 * le même écart se produit — un contrat gelé avant ses voisins les laisse
 * derrière lui — et il est consigné comme tel dans le rapport du lot.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import { assertSiteOpenTx } from './site-closing';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof } from './money';
import { toAmountOrZero } from './types';
import type {
  CreateEmployeeTx,
  CreateSalaryNoteTx,
  CreateSalaryPaymentTx,
  EmployeeRecord,
  GetEmployee,
  ListEmployees,
  ListSalaryNotes,
  ListSalaryPayments,
  SalaryNoteRecord,
  SalaryPaymentRecord,
  ValidateSalaryNoteTx,
  ValidateSalaryPaymentTx
} from './types-lot4-salaries';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  /** 661 — Charges de personnel : la charge, à la validation d'une note. */
  personnelExpenseAccountId: string;
  /** 422 — Personnel, rémunérations dues : la dette envers l'employé. */
  personnelPayableAccountId: string;
  /** 571 — Caisse : la même trésorerie que partout ailleurs dans le module. */
  cashAccountId: string;
}

/**
 * Résout le journal et les comptes dont une pièce de salaire a besoin.
 * Délègue entièrement à `accounting.ts`, comme `suppliers.ts` et
 * `land-leases.ts` : ce fichier ne porte aucune copie du plan de comptes.
 */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getUTCFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
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
    personnelExpenseAccountId: exiger('661'),
    personnelPayableAccountId: exiger('422'),
    cashAccountId: exiger('571')
  };
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toEmployeeRecord(row: any): EmployeeRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fullName: row.fullName,
    role: row.role ?? null,
    thirdPartyAccountId: row.thirdPartyAccountId,
    isActive: row.isActive,
    accountBalance: roundMoneyXof(toAmountOrZero(row.thirdPartyAccount?.balance)),
    currency: row.thirdPartyAccount?.currency ?? DEFAULT_CURRENCY
  };
}

function toCreatedByLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function toSalaryNoteRecord(row: any): SalaryNoteRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeLabel: row.employee?.fullName ?? 'Employé inconnu',
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    siteId: row.siteId ?? null,
    // Nul quand la note ne porte aucun chantier — jamais une chaîne vide
    // (voir `SalaryNoteRecord.siteLabel`, contrat).
    siteLabel: row.site?.name ?? null,
    costCategoryId: row.costCategoryId ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    status: row.status,
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

function toSalaryPaymentRecord(row: any): SalaryPaymentRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeLabel: row.employee?.fullName ?? 'Employé inconnu',
    paymentDate: row.paymentDate,
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency,
    status: row.status,
    createdByLabel: toCreatedByLabel(row.createdBy),
    validatedAt: row.validatedAt ?? null
  };
}

// ---------------------------------------------------------------------------
// A. L'employé et son compte de tiers
// ---------------------------------------------------------------------------

/** Voir `CreateEmployeeTx` dans `./types-lot4-salaries.ts`. */
export const createEmployeeTx: CreateEmployeeTx = async (tx, tenantId, params) => {
  if (!params.fullName?.trim()) {
    throw badRequest("Le nom complet de l'employé est obligatoire");
  }

  // Le compte naît avec l'employé, dans la même transaction : un employé sans
  // compte ne pourrait rien devoir, et la première note de salaire le
  // trouverait manquant (même raison qu'au fournisseur du lot 2 et au
  // bailleur du lot 4, premier sous-lot).
  const account = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'EMPLOYEE' as any,
      label: params.fullName,
      balance: 0,
      currency: DEFAULT_CURRENCY
    }
  });

  const employee = await tx.employee.create({
    data: {
      tenantId,
      fullName: params.fullName,
      role: params.role ?? null,
      thirdPartyAccountId: account.id
    }
  });

  return toEmployeeRecord({ ...employee, thirdPartyAccount: account });
};

/** Voir `ListEmployees` dans `./types-lot4-salaries.ts`. */
export const listEmployees: ListEmployees = async (tenantId, filters) => {
  const rows = await prisma.employee.findMany({
    where: { tenantId, ...(filters?.onlyActive ? { isActive: true } : {}) },
    include: { thirdPartyAccount: true },
    orderBy: { fullName: 'asc' }
  });

  return rows.map(row => toEmployeeRecord(row));
};

/** Voir `GetEmployee` dans `./types-lot4-salaries.ts`. */
export const getEmployee: GetEmployee = async (tenantId, employeeId) => {
  const row = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    include: { thirdPartyAccount: true }
  });
  if (!row) {
    throw notFound('Employé introuvable');
  }
  return toEmployeeRecord(row);
};

// ---------------------------------------------------------------------------
// B. Note de salaire — saisie en brouillon
// ---------------------------------------------------------------------------

/** Voir `CreateSalaryNoteTx` dans `./types-lot4-salaries.ts`. */
export const createSalaryNoteTx: CreateSalaryNoteTx = async (tx, tenantId, params) => {
  const employee = await tx.employee.findFirst({
    where: { id: params.employeeId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!employee) {
    throw notFound('Employé introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant de la note de salaire doit être strictement positif');
  }
  if (!Number.isInteger(params.periodMonth) || params.periodMonth < 1 || params.periodMonth > 12) {
    throw badRequest('Le mois de période doit être compris entre 1 et 12');
  }

  const siteId = params.siteId ?? null;
  const costCategoryId = params.costCategoryId ?? null;

  // Le poste est EXIGÉ dès qu'un chantier est renseigné, et REFUSÉ sans
  // chantier — jamais deviné depuis un libellé (voir l'en-tête du contrat,
  // « le poste de dépense, exigé et jamais deviné »). Un champ accepté qui ne
  // servirait à rien laisserait croire qu'il a servi.
  if (siteId && !costCategoryId) {
    throw badRequest("Le poste de dépense est obligatoire dès qu'un chantier est renseigné");
  }
  if (!siteId && costCategoryId) {
    throw badRequest("Le poste de dépense n'est accepté que si un chantier est renseigné");
  }

  let site: { id: string; name: string } | null = null;
  if (siteId) {
    site = await tx.constructionSite.findFirst({ where: { id: siteId, tenantId }, select: { id: true, name: true } });
    if (!site) {
      throw notFound('Chantier introuvable');
    }
  }

  let costCategory: { id: string; label: string; isActive: boolean } | null = null;
  if (costCategoryId) {
    costCategory = await tx.costCategory.findFirst({
      where: { id: costCategoryId, tenantId },
      select: { id: true, label: true, isActive: true }
    });
    if (!costCategory) {
      throw notFound('Poste de dépense introuvable');
    }
    if (!costCategory.isActive) {
      // Refus délibéré, pas un repli sur un autre poste : un poste désactivé
      // est un geste de paramétrage voulu par la gestionnaire (même règle
      // qu'au bail de terrain, `land-leases.ts`, `createLandLeaseTx`).
      throw conflict('Ce poste de dépense est désactivé');
    }
  }

  // UNE NOTE PAR EMPLOYÉ ET PAR MOIS — vérifiée AVANT toute écriture : en
  // PostgreSQL une commande en échec condamne toute la transaction, donc
  // « tenter puis rattraper la violation d'unicité » ne marche pas ici (même
  // raisonnement qu'à la constatation de bail de terrain, `land-leases.ts`).
  // La contrainte `@@unique([employeeId, periodYear, periodMonth])` en base
  // reste le filet pour une collision réellement concurrente ; ce n'est pas
  // elle qui porte la discipline de rejeu, et son message brut ne doit jamais
  // remonter tel quel — d'où ce contrôle préalable, traduit en 409 métier.
  const existing = await tx.salaryNote.findUnique({
    where: {
      employeeId_periodYear_periodMonth: {
        employeeId: params.employeeId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth
      }
    }
  });
  if (existing) {
    throw conflict('Une note de salaire existe déjà pour cet employé sur cette période');
  }

  // BROUILLON. Aucune écriture, aucun mouvement, aucune imputation validée :
  // une note saisie n'a encore rien constaté. Tout naît à la validation
  // (`validateSalaryNoteTx`), comme toute pièce depuis le lot 2.
  const note = await tx.salaryNote.create({
    data: {
      tenantId,
      employeeId: params.employeeId,
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      amount,
      currency: DEFAULT_CURRENCY,
      siteId,
      costCategoryId,
      status: 'DRAFT' as any,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toSalaryNoteRecord({ ...note, employee, site, costCategory });
};

// ---------------------------------------------------------------------------
// C. Note de salaire — validation (écriture + mouvement + imputation)
// ---------------------------------------------------------------------------

/** Voir `ValidateSalaryNoteTx` dans `./types-lot4-salaries.ts`. */
export const validateSalaryNoteTx: ValidateSalaryNoteTx = async (tx, tenantId, salaryNoteId, validatedByUserId) => {
  const note = await tx.salaryNote.findFirst({ where: { id: salaryNoteId, tenantId } });
  if (!note) {
    throw notFound('Note de salaire introuvable');
  }
  if (note.status !== 'DRAFT') {
    // Ce qui est validé ne bouge plus (principe P-6) : une seconde validation
    // n'est pas une mise à jour, c'est un refus.
    throw conflict('Cette note de salaire a déjà été validée ou annulée — une pièce validée ne se modifie plus');
  }

  const employee = await tx.employee.findFirst({
    where: { id: note.employeeId, tenantId },
    select: { id: true, fullName: true, thirdPartyAccountId: true }
  });
  if (!employee) {
    throw notFound('Employé introuvable pour cette note de salaire');
  }

  const amount = roundMoneyXof(toAmountOrZero(note.amount));

  // Date d'écriture et de mouvement : le premier jour du mois de la période,
  // faute d'une date de pièce saisie par quelqu'un — même convention que la
  // constatation mensuelle de bail de terrain (`land-leases.ts`).
  const entryDate = new Date(Date.UTC(note.periodYear, note.periodMonth - 1, 1));
  const accounts = await resolveOperationalAccounts(tx, tenantId, entryDate);

  // Journal : débit des charges de personnel (661), crédit des rémunérations
  // dues (422) — la charge naît, la dette envers l'employé aussi.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate,
    reference: `SAL-${note.id}`,
    description: `Note de salaire — ${employee.fullName} — ${note.periodYear}/${String(note.periodMonth).padStart(2, '0')}`,
    documentType: 'SALARY_NOTE',
    documentId: note.id,
    lines: [
      {
        accountId: accounts.personnelExpenseAccountId,
        debit: amount,
        label: `Charge de personnel — ${employee.fullName}`
      },
      {
        accountId: accounts.personnelPayableAccountId,
        credit: amount,
        label: `Salaire dû — ${employee.fullName}`
      }
    ]
  });

  // Compte de tiers : l'employé nous est dû davantage — `billed`, qui
  // augmente le solde du compte de tiers (« positif quand nous lui devons »,
  // voir `EmployeeRecord.accountBalance`, contrat). Même fonction que pour le
  // fournisseur du lot 2, seule l'interprétation du signe est symétrique.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: employee.thirdPartyAccountId,
    tenantId,
    type: 'INSTALLMENT',
    billed: amount,
    label: `Salaire ${note.periodYear}/${String(note.periodMonth).padStart(2, '0')}`,
    sourceType: 'SALARY_NOTE',
    sourceId: note.id,
    movementDate: entryDate
  });
  if (!movement) {
    throw notFound('Compte de tiers de l’employé introuvable');
  }

  // Quand la note porte un chantier, elle produit une imputation RÉELLE,
  // exactement comme une facture fournisseur ou une constatation de bail :
  // `sourceType: 'SALARY_NOTE'`, `validatedAt` renseigné, `voidedAt` nul.
  // C'est ce filtre précis que `sumSiteActualCost` (`site-cost.ts`) lit pour
  // le coût réel du chantier — sans cette persistance, le salaire n'entrerait
  // JAMAIS dans ce coût (besoin P9 du PRD).
  if (note.siteId && note.costCategoryId) {
    // Lot 4, sous-lot 6 : un chantier clos n'accepte plus aucune depense.
    //
    // C'est LA garde qui rend `finalCost` vrai. Sans elle, une piece validee le
    // lendemain d'une cloture ferait diverger le cout fige du cout reel, et les
    // deux chiffres se contrediraient sans que rien ne le signale.
    await assertSiteOpenTx(tx, tenantId, note.siteId);

    await tx.costAllocation.create({
      data: {
        tenantId,
        siteId: note.siteId,
        costCategoryId: note.costCategoryId,
        sourceType: 'SALARY_NOTE',
        sourceId: note.id,
        amount,
        validatedAt: new Date(),
        voidedAt: null
      }
    });

    // Le coût réel du chantier vient de changer : tout programme de travaux
    // qui lui est rattaché doit suivre, DANS CETTE transaction — même geste
    // qu'à la validation d'une facture fournisseur ou d'une constatation de
    // bail de terrain.
    await syncWorkProgramCostTx(tx, tenantId, note.siteId);
  }

  // Mise à jour conditionnelle, même discipline qu'au règlement fournisseur
  // et au paiement de bail de terrain : si une autre transaction a validé
  // cette même note entre notre lecture et cet instant, `count` vaut 0 et on
  // abandonne — l'écriture, le mouvement et l'imputation créés ici repartent
  // avec le rollback, rien ne subsiste en double.
  const updateResult = await tx.salaryNote.updateMany({
    where: { id: note.id, tenantId, status: 'DRAFT' as any },
    data: { status: 'VALIDATED' as any, validatedByUserId, validatedAt: new Date(), journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Cette note de salaire vient d'être validée par ailleurs");
  }

  // Relu avec ses libellés (chantier, poste) en une seule requête, plutôt que
  // de recomposer la réponse à partir des variables locales de cette
  // fonction : `toSalaryNoteRecord` lit toujours la même forme, qu'elle
  // vienne d'une création, d'une validation ou d'une liste.
  const updated = await tx.salaryNote.findFirst({
    where: { id: note.id, tenantId },
    include: {
      employee: { select: { fullName: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } },
      createdBy: { select: { fullName: true, email: true } }
    }
  });

  return toSalaryNoteRecord(updated);
};

// ---------------------------------------------------------------------------
// D. Notes de salaire — liste filtrée
//
// « Libellés résolus par requête PAR LOT, jamais une par ligne » : `include`
// traduit en UNE seule requête (jointure ou requête de lot Prisma), jamais en
// N requêtes pour N notes — même principe qu'à `listLandLeaseAccruals`.
// ---------------------------------------------------------------------------

/** Voir `ListSalaryNotes` dans `./types-lot4-salaries.ts`. */
export const listSalaryNotes: ListSalaryNotes = async (tenantId, filters) => {
  const rows = await prisma.salaryNote.findMany({
    where: {
      tenantId,
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.siteId ? { siteId: filters.siteId } : {}),
      ...(filters.periodYear !== undefined ? { periodYear: filters.periodYear } : {}),
      ...(filters.periodMonth !== undefined ? { periodMonth: filters.periodMonth } : {})
    },
    include: {
      employee: { select: { fullName: true } },
      site: { select: { name: true } },
      costCategory: { select: { label: true } },
      createdBy: { select: { fullName: true, email: true } }
    },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }]
  });

  return rows.map(row => toSalaryNoteRecord(row));
};

// ---------------------------------------------------------------------------
// E. Règlement de salaire — saisie en brouillon
// ---------------------------------------------------------------------------

/** Voir `CreateSalaryPaymentTx` dans `./types-lot4-salaries.ts`. */
export const createSalaryPaymentTx: CreateSalaryPaymentTx = async (tx, tenantId, params) => {
  const employee = await tx.employee.findFirst({
    where: { id: params.employeeId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!employee) {
    throw notFound('Employé introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant du règlement doit être strictement positif');
  }

  // BROUILLON. Ni écriture, ni mouvement de compte : un règlement saisi n'a
  // encore rien réglé. Tout naît à la validation (`validateSalaryPaymentTx`),
  // comme toute pièce depuis le lot 2. Sans affectation à des notes précises,
  // contrairement au règlement fournisseur du lot 2 — voir l'en-tête du
  // contrat, `CreateSalaryPaymentTx`.
  const payment = await tx.salaryPayment.create({
    data: {
      tenantId,
      employeeId: params.employeeId,
      paymentDate: params.paymentDate,
      amount,
      currency: DEFAULT_CURRENCY,
      status: 'DRAFT' as any,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toSalaryPaymentRecord({ ...payment, employee });
};

// ---------------------------------------------------------------------------
// F. Règlement de salaire — validation (écriture + mouvement)
// ---------------------------------------------------------------------------

/** Voir `ValidateSalaryPaymentTx` dans `./types-lot4-salaries.ts`. */
export const validateSalaryPaymentTx: ValidateSalaryPaymentTx = async (
  tx,
  tenantId,
  salaryPaymentId,
  validatedByUserId
) => {
  const payment = await tx.salaryPayment.findFirst({ where: { id: salaryPaymentId, tenantId } });
  if (!payment) {
    throw notFound('Règlement de salaire introuvable');
  }
  if (payment.status !== 'DRAFT') {
    throw conflict('Ce règlement de salaire a déjà été validé ou annulé — une pièce validée ne se modifie plus');
  }

  const employee = await tx.employee.findFirst({
    where: { id: payment.employeeId, tenantId },
    select: { id: true, fullName: true, thirdPartyAccountId: true }
  });
  if (!employee) {
    throw notFound('Employé introuvable pour ce règlement');
  }

  const amount = roundMoneyXof(toAmountOrZero(payment.amount));
  const accounts = await resolveOperationalAccounts(tx, tenantId, payment.paymentDate);

  // Journal : débit des rémunérations dues (422), crédit de la caisse (571) —
  // la dette envers l'employé s'éteint, la trésorerie sort.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: payment.paymentDate,
    reference: `SAL-REG-${payment.id}`,
    description: `Règlement de salaire — ${employee.fullName}`,
    documentType: 'SALARY_PAYMENT',
    documentId: payment.id,
    lines: [
      { accountId: accounts.personnelPayableAccountId, debit: amount, label: `Règlement — ${employee.fullName}` },
      { accountId: accounts.cashAccountId, credit: amount, label: `Règlement — ${employee.fullName}` }
    ]
  });

  // Compte de tiers : ce qu'on doit à l'employé diminue d'autant — `settled`.
  //
  // AUCUNE VÉRIFICATION du solde avant d'écrire, et c'est délibéré (voir le
  // contrat, `ValidateSalaryPaymentTx`) : une avance sur salaire est
  // courante, et un règlement supérieur au solde dû est ACCEPTÉ. Le compte
  // devient alors débiteur (solde négatif), exactement symétrique de
  // l'acompte versé à un fournisseur au lot 2 — `appendThirdPartyMovementTx`
  // ne compare jamais `settled` au solde courant, il se contente de
  // soustraire.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: employee.thirdPartyAccountId,
    tenantId,
    type: 'PAYMENT',
    settled: amount,
    label: `Règlement de salaire — ${employee.fullName}`,
    sourceType: 'SALARY_PAYMENT',
    sourceId: payment.id,
    movementDate: payment.paymentDate
  });
  if (!movement) {
    throw notFound('Compte de tiers de l’employé introuvable');
  }

  // Mise à jour conditionnelle — même discipline qu'au règlement fournisseur
  // et au paiement de bail de terrain.
  const updateResult = await tx.salaryPayment.updateMany({
    where: { id: payment.id, tenantId, status: 'DRAFT' as any },
    data: { status: 'VALIDATED' as any, validatedByUserId, validatedAt: new Date(), journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Ce règlement de salaire vient d'être validé par ailleurs");
  }

  const updated = await tx.salaryPayment.findFirst({
    where: { id: payment.id, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } }
  });

  return toSalaryPaymentRecord({ ...updated, employee });
};

// ---------------------------------------------------------------------------
// G. Règlements de salaire — liste
// ---------------------------------------------------------------------------

/** Voir `ListSalaryPayments` dans `./types-lot4-salaries.ts`. */
export const listSalaryPayments: ListSalaryPayments = async (tenantId, employeeId) => {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true, fullName: true }
  });
  if (!employee) {
    throw notFound('Employé introuvable');
  }

  const rows = await prisma.salaryPayment.findMany({
    where: { employeeId, tenantId },
    include: { createdBy: { select: { fullName: true, email: true } } },
    orderBy: { paymentDate: 'desc' }
  });

  return rows.map(row => toSalaryPaymentRecord({ ...row, employee }));
};
