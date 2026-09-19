/**
 * Pièce de caisse — lot 2, volet chantiers.
 *
 * Implémente `CreateCashVoucherTx` et `ValidateCashVoucherTx` du contrat gelé
 * (`./types-lot2.ts`). Une seule caisse par tenant (décision actée le 18
 * septembre 2026) : la gestionnaire émet, le dirigeant valide, sans entité
 * `CashRegister` ni solde modélisé (`spec.md`, « Décision actée : la caisse »).
 *
 * ---------------------------------------------------------------------------
 * Numérotation séquentielle sous concurrence (FR-022) — le point délicat.
 * ---------------------------------------------------------------------------
 *
 * `CashVoucher.voucherNumber` n'est pas un `@default(autoincrement())` : la
 * séquence voulue est par tenant et par année, ce qu'un auto-incrément
 * Postgres (global à la table) ne sait pas faire. `data-model.md` §3.8 prévoit
 * une table de compteur dédiée (`finance_sequence_counters`) verrouillée par
 * `SELECT ... FOR UPDATE` — mais cette table n'existe pas dans le schéma gelé
 * remis à cet agent, et créer un modèle Prisma est hors de son territoire (pas
 * de fichier de schéma dans la liste de fichiers autorisés).
 *
 * À la place, `lockTenantFinanceSequenceTx` pose un verrou consultatif Postgres
 * scopé à la transaction (`pg_advisory_xact_lock`), clé par tenant. Il joue
 * exactement le rôle d'un `SELECT ... FOR UPDATE` sur une ligne de compteur, à
 * une différence près qui compte ici : il n'a pas besoin qu'une ligne existe
 * déjà pour se poser. Un `SELECT ... FOR UPDATE` sur `cash_vouchers` ne
 * verrouillerait rien pour le tout premier bon de l'année d'un tenant (zéro
 * ligne à verrouiller), rouvrant exactement la fenêtre de concurrence qu'on
 * veut fermer. Le verrou consultatif, lui, se pose sur une clé, pas sur une
 * ligne, et protège donc aussi ce cas.
 *
 * Il est relâché automatiquement à la fin de la transaction (commit ou
 * rollback) : c'est le sens de son suffixe `_xact_`, et c'est pour cela que
 * `validateCashVoucherTx` peut le poser sans jamais avoir à le relâcher.
 *
 * ---------------------------------------------------------------------------
 * Quand le numéro est attribué : à la validation.
 * ---------------------------------------------------------------------------
 *
 * Une pièce en brouillon n'a **pas** de numéro : `voucherNumber` et
 * `voucherYear` sont nuls jusqu'à sa validation, et `number` vaut alors `null`.
 *
 * La première version numérotait dès la saisie. Un brouillon abandonné
 * consommait donc son numéro, et le carnet gardait un trou que personne ne
 * pouvait plus expliquer — ce qu'un contrôle comptable relève, et ce qu'un
 * carnet à souches ne fait pas. La cliente a tranché le 19 septembre 2026, au
 * vu du §6 du rapport du lot 2.
 *
 * Conséquence assumée : on ne peut pas remettre un numéro au bénéficiaire
 * avant que le validateur ne soit passé. Le bon imprimé d'un brouillon le dit
 * explicitement plutôt que d'afficher un tiret qui se lirait comme un numéro.
 *
 * L'année de la séquence suit la **date de la pièce**, jamais celle du jour de
 * validation : une pièce datée du 31 décembre validée le 2 janvier appartient
 * à l'exercice de sa date, comme l'écriture comptable qui la porte.
 *
 * **Ce que ce choix ne fait pas** : il ne rejoue pas le motif « tenter
 * l'écriture puis relire la violation » que `ledger.ts` a dû abandonner. Ce
 * motif suppose une contrainte d'unicité déjà posée en base pour intercepter
 * la collision ; ici, le verrou empêche la collision de se produire du tout,
 * en série toute validation d'un même tenant. C'est plus conservateur qu'un
 * verrouillage par tenant *et* par année (deux années différentes du même
 * tenant s'attendent inutilement), mais correct, simple à raisonner, et sans
 * coût réel pour une caisse qui, par construction, n'a qu'un seul dirigeant
 * validateur. La saisie, elle, ne prend plus aucun verrou : sans numéro à
 * tirer, elle n'a plus de séquence à protéger.
 *
 * Le test de concurrence (`finance.cash.test.ts`) simule ce verrou par un
 * mutex asynchrone par clé côté magasin en mémoire, qui reproduit la même
 * sémantique (exclusion mutuelle, relâchée à la fin de la transaction) sans
 * nécessiter une vraie base PostgreSQL : il prouve que N validations
 * concurrentes du même tenant reçoivent N numéros séquentiels distincts, sans
 * trou ni collision.
 */

import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaTransactionClient } from '../../utils/database';
import { NotFoundError, BadRequestError, ConflictError } from '../../middleware/error-middleware';
import { toAmountOrZero } from './types';
import { roundMoney } from './money';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { syncWorkProgramCostTx } from './cost-allocation';
import type { CashVoucherRecord, CreateCashVoucherTx, ValidateCashVoucherTx } from './types-lot2';

// ---------------------------------------------------------------------------
// Numéro affiché — pas de colonne dédiée, seulement `voucherYear`/`voucherNumber`
// ---------------------------------------------------------------------------

/**
 * Numéro affiché d'un bon de caisse : `AAAA-NNNN`, année puis rang dans
 * l'année. Réexportée pour `sites.ts` (détail de chantier) et
 * `validation-queue.ts` (file de validation), qui en ont besoin pour un
 * libellé lisible, jamais pour recalculer quoi que ce soit.
 */
export function formatCashVoucherNumber(
  voucherYear: number | null | undefined,
  voucherNumber: number | null | undefined
): string | null {
  // Un brouillon n'a pas encore de numero, et n'en montre donc aucun. Renvoyer
  // une chaine de remplacement (« — », « sans numero ») serait pire : elle se
  // lirait comme un numero et finirait recopiee sur une piece papier.
  //
  // Comparaison lache (`== null`) a dessein : elle attrape `null` comme
  // `undefined`. Une projection Prisma qui n'a pas demande la colonne rend
  // `undefined`, et un `=== null` laissait alors passer la valeur absente
  // jusqu'a produire la chaine « undefined-undefined » — qui se serait
  // imprimee telle quelle sur un bon de caisse.
  if (voucherYear == null || voucherNumber == null) {
    return null;
  }
  return `${voucherYear}-${String(voucherNumber).padStart(4, '0')}`;
}

function toVoucherRecord(row: Record<string, any>): CashVoucherRecord {
  return {
    id: row.id,
    number: formatCashVoucherNumber(row.voucherYear, row.voucherNumber),
    tenantId: row.tenantId,
    siteId: row.siteId,
    costCategoryId: row.costCategoryId,
    beneficiary: row.beneficiaryName,
    amount: toAmountOrZero(row.amount),
    currency: row.currency ?? 'XOF',
    voucherDate: row.voucherDate,
    reason: row.reason,
    status: row.validatedAt ? 'VALIDATED' : 'DRAFT',
    createdByUserId: row.createdByUserId,
    validatedByUserId: row.validatedByUserId ?? null,
    validatedAt: row.validatedAt ?? null
  };
}

// ---------------------------------------------------------------------------
// Verrou consultatif — voir l'en-tête du fichier
// ---------------------------------------------------------------------------

async function lockTenantFinanceSequenceTx(tx: PrismaTransactionClient, tenantId: string): Promise<void> {
  // `$executeRaw` et non `$queryRaw`. `pg_advisory_xact_lock` renvoie `void`,
  // un type que le désérialiseur de `$queryRaw` ne sait pas lire : il levait
  // « Failed to deserialize column of type 'void' » à *chaque* création de
  // pièce de caisse, donc sur le tout premier appel de production. Les tests
  // unitaires du lot 2 remplacent Prisma par une doublure et ne pouvaient pas
  // le voir ; le parcours de bout en bout
  // (`scripts/finance-e2e-lot2.ts`) l'a trouvé au premier essai.
  //
  // `$executeRaw` n'attend aucune colonne en retour, seulement un nombre de
  // lignes affectées : c'est la forme juste pour une instruction qui ne
  // rapporte rien. Le verrou reste bien posé, et reste scopé à la
  // transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
}

async function nextVoucherNumberTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  voucherYear: number
): Promise<number> {
  const last = await tx.cashVoucher.aggregate({
    where: { tenantId, voucherYear },
    _max: { voucherNumber: true }
  });
  return (last._max.voucherNumber ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------
//
// `postDocumentEntryTx` prend un `journalId` et des lignes portant chacune un
// `accountId` réel : il ne les invente pas. Ce fichier portait sa propre copie
// du plan de comptes, écrite faute d'accès à celle du moteur pendant le
// développement en parallèle. Elle est retirée : `accounting.ts` fait foi.
//
// Les copies avaient déjà divergé. Les charges de chantier étaient ici le
// compte 604, et le 605 chez le moteur ; la même dépense aurait atterri sur
// l'un ou l'autre selon le chemin emprunté.
//
// `CostCategory` ne porte pas de compte associé : toute dépense de chantier
// impute donc le même compte de charge, quel que soit le poste. C'est une
// limite connue, consignée pour le lot 3 — elle relève du plan analytique, pas
// du suivi de chantier.

async function ensureOperationalAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  fiscalYear: number
): Promise<{ journalId: string; cashAccountId: string; expenseAccountId: string }> {
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, fiscalYear, 'CASH'),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
  ]);

  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte operationnel ${numero} absent apres amorcage du plan de comptes.`);
    }
    return id;
  };

  return { journalId, cashAccountId: exiger('571'), expenseAccountId: exiger('605') };
}

// ---------------------------------------------------------------------------
// Émission — brouillon, n'écrit rien d'autre que la pièce elle-même
// ---------------------------------------------------------------------------

/** Voir `CreateCashVoucherTx` dans `./types-lot2.ts`. */
export const createCashVoucherTx: CreateCashVoucherTx = async (tx, tenantId, params) => {
  const beneficiary = params.beneficiary?.trim();
  const reason = params.reason?.trim();
  if (!beneficiary) {
    throw new BadRequestError('Le bénéficiaire est obligatoire.');
  }
  if (!reason) {
    throw new BadRequestError('Le motif est obligatoire.');
  }
  const amount = roundMoney(params.amount);
  if (!(amount > 0)) {
    throw new BadRequestError('Le montant doit être strictement positif.');
  }

  const site = await tx.constructionSite.findFirst({ where: { id: params.siteId, tenantId } });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }

  const category = await tx.costCategory.findFirst({ where: { id: params.costCategoryId, tenantId } });
  if (!category) {
    throw new NotFoundError('Poste de dépense introuvable.');
  }
  if (!category.isActive) {
    throw new ConflictError('Ce poste de dépense est désactivé.');
  }

  // Aucun numero ici, et c'est le point de la regle : il est attribue a la
  // validation (`validateCashVoucherTx`). Un brouillon abandonne ne consomme
  // donc rien, et le carnet reste continu. Pas de verrou non plus a prendre :
  // sans numero a tirer, il n'y a plus de sequence a proteger a la saisie.
  const created = await tx.cashVoucher.create({
    data: {
      tenantId,
      siteId: params.siteId,
      costCategoryId: params.costCategoryId,
      beneficiaryName: beneficiary,
      amount: new Decimal(amount),
      reason,
      voucherDate: params.voucherDate,
      createdByUserId: params.createdByUserId
    }
  });

  return toVoucherRecord(created);
};

// ---------------------------------------------------------------------------
// Validation — écriture, imputation, dans la même transaction
// ---------------------------------------------------------------------------

/** Voir `ValidateCashVoucherTx` dans `./types-lot2.ts`. */
export const validateCashVoucherTx: ValidateCashVoucherTx = async (tx, tenantId, voucherId, validatedByUserId) => {
  const voucher = await tx.cashVoucher.findFirst({ where: { id: voucherId, tenantId } });
  if (!voucher) {
    throw new NotFoundError('Pièce de caisse introuvable.');
  }
  if (voucher.validatedAt) {
    // Ce qui est validé ne bouge plus (principe P-6) : une seconde validation
    // n'est pas une mise à jour, c'est un refus.
    throw new ConflictError('Cette pièce de caisse est déjà validée.');
  }

  const [site, category] = await Promise.all([
    tx.constructionSite.findFirst({ where: { id: voucher.siteId, tenantId } }),
    tx.costCategory.findFirst({ where: { id: voucher.costCategoryId, tenantId } })
  ]);
  if (!site || !category) {
    throw new NotFoundError('Chantier ou poste de dépense introuvable pour cette pièce.');
  }

  // L'annee de la sequence suit la DATE DE LA PIECE, jamais celle du jour de
  // validation : une piece datee du 31 decembre validee le 2 janvier appartient
  // a l'exercice de sa date, comme son ecriture comptable, postee ci-dessous
  // avec cette meme date.
  const voucherYear = voucher.voucherDate.getFullYear();

  // Le verrou ferme la fenetre de concurrence sur la sequence, y compris pour
  // la toute premiere piece de l'annee — un verrou de ligne ne verrouillerait
  // rien, faute de ligne a verrouiller. Il est pris AVANT la lecture du dernier
  // numero, et tient jusqu'a la fin de la transaction.
  await lockTenantFinanceSequenceTx(tx, tenantId);
  const voucherNumber = await nextVoucherNumberTx(tx, tenantId, voucherYear);

  const { journalId, cashAccountId, expenseAccountId } = await ensureOperationalAccountsTx(tx, tenantId, voucherYear);

  const amount = toAmountOrZero(voucher.amount);
  // Le numero vient d'etre tire : il est forcement present ici.
  const number = formatCashVoucherNumber(voucherYear, voucherNumber) as string;

  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId,
    entryDate: voucher.voucherDate,
    reference: `BC-${number}`,
    description: `Bon de caisse ${number} — ${voucher.beneficiaryName} — ${site.name}`,
    documentType: 'CASH_VOUCHER',
    documentId: voucher.id,
    lines: [
      { accountId: expenseAccountId, debit: amount, label: `Dépense de chantier — ${site.name} — ${category.label}` },
      { accountId: cashAccountId, credit: amount, label: `Sortie de caisse — bon ${number}` }
    ]
  });

  // L'imputation naît ici, jamais avant : une pièce de caisse brouillon n'a
  // encore imputé aucun montant à personne (invariant transverse §6).
  await tx.costAllocation.create({
    data: {
      tenantId,
      siteId: voucher.siteId,
      costCategoryId: voucher.costCategoryId,
      sourceType: 'CASH_VOUCHER',
      sourceId: voucher.id,
      amount: voucher.amount,
      validatedAt: new Date()
    }
  });

  // Meme raison qu'a la validation d'une facture : le cout du chantier vient
  // de bouger, les programmes de travaux rattaches doivent suivre ici.
  await syncWorkProgramCostTx(tx, tenantId, voucher.siteId);

  // Mise à jour conditionnelle plutôt qu'inconditionnelle : si une autre
  // transaction a validé cette même pièce entre notre lecture initiale et cet
  // instant, `count` vaut 0 et on abandonne — l'écriture et l'imputation qu'on
  // vient de créer dans cette transaction repartent avec elle au rollback,
  // rien ne subsiste en double.
  // Le numero est ecrit ICI, dans la meme mise a jour conditionnelle que la
  // validation elle-meme : ou les deux passent, ou aucun des deux. Si une autre
  // transaction a valide cette piece entre-temps, `count` vaut 0, on abandonne,
  // et le numero qu'on avait tire repart avec le rollback sans etre consomme.
  const updateResult = await tx.cashVoucher.updateMany({
    where: { id: voucher.id, tenantId, validatedAt: null },
    data: {
      voucherNumber,
      voucherYear,
      validatedAt: new Date(),
      validatedByUserId,
      journalEntryId: entry.entryId
    }
  });
  if (updateResult.count !== 1) {
    throw new ConflictError('Cette pièce de caisse vient d’être validée par ailleurs.');
  }

  const updated = await tx.cashVoucher.findFirst({ where: { id: voucher.id, tenantId } });
  return toVoucherRecord(updated as Record<string, any>);
};
