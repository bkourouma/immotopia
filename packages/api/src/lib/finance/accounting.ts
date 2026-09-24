/**
 * Moteur comptable operationnel — lot 2.
 *
 * Le contrat honore par ce fichier est dans `./types-lot2.ts`, et il ne bouge
 * plus : cinq agents codent contre lui. Trois fonctions le composent —
 * `postDocumentEntryTx`, `voidDocumentTx`, `getTrialBalance` — auxquelles
 * s'ajoutent le plan de comptes operationnel et ses gardes d'isolation.
 *
 * Quatre regles tiennent ce fichier, et chacune repare un defaut constate.
 *
 * 1. **Toute ecriture nait dans la transaction de sa piece.** Les deux
 *    fonctions d'ecriture prennent un `tx`, jamais le client global : la
 *    piece, l'ecriture et ses lignes naissent ensemble ou pas du tout. Le
 *    client `prisma` du module n'est utilise que par la lecture
 *    (`getTrialBalance`).
 *
 * 2. **L'equilibre se verifie sur les montants qui seront stockes.** Chaque
 *    ligne est arrondie *avant* le controle, jamais apres (defaut n°1).
 *
 * 3. **Le verrou est pose dans la meme transaction que l'ecriture, et il est
 *    lu.** Le drapeau `isLocked` ne protegeait rien : personne ne le
 *    consultait, et l'immuabilite tenait a l'absence de route d'ecriture
 *    (defaut n°2). Ici il est pose a la creation et relu a chaque tentative
 *    d'ecrire une seconde fois sur la meme piece.
 *
 * 4. **On lit avant d'ecrire, jamais l'inverse.** En PostgreSQL, une commande
 *    qui echoue annule toute la transaction : chaque commande suivante est
 *    refusee avec l'erreur 25P02 jusqu'au rollback. Le motif « tenter
 *    l'insertion puis rattraper la violation d'unicite » est donc inutilisable
 *    ici, et les tests unitaires ne le verraient pas puisqu'ils simulent Prisma
 *    par un magasin en memoire. Le lot 1 s'y est casse les dents : voir
 *    l'en-tete de `appendThirdPartyMovementTx` dans `./ledger.ts`.
 *
 * Vocabulaire (principe P-1 du PRD) : « debit » et « credit » ne sortent pas
 * d'ici. `JournalLineInput` est le seul type qui les porte, et il ne franchit
 * jamais la frontiere de l'API ; la restitution parle « facture », « regle »,
 * « solde ».
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { conflict, notFound, unprocessableEntity } from '../errors';
import { roundMoney, roundMoneyXof } from './money';
import type {
  AccountingScope,
  GetTrialBalance,
  JournalLineInput,
  PostDocumentEntryTx,
  TrialBalanceLine,
  VoidDocumentTx,
  VoidableDocumentType
} from './types-lot2';
import type { PeriodRange } from './types';
import { syncWorkProgramCostTx } from './cost-allocation';
import { appendThirdPartyMovementTx } from './ledger';

/** Devise unique du module financier (decision D9 du plan). */
const DEFAULT_CURRENCY = 'XOF';

/** Portee des ecritures de ce lot. La copropriete garde la sienne, `SYNDICATE`. */
const OPERATIONS: AccountingScope = 'OPERATIONS' as AccountingScope;

/**
 * Traduction `documentType` -> `sourceType`.
 *
 * `sourceType` existe depuis la copropriete et reste renseigne pour que les
 * lectures generiques continuent de fonctionner ; `documentType`/`documentId`
 * sont la designation precise du lot 2.
 */
const SOURCE_TYPE_BY_DOCUMENT: Record<string, string> = {
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  SUPPLIER_PAYMENT: 'SUPPLIER_PAYMENT',
  CASH_VOUCHER: 'CASH_VOUCHER',
  VOID: 'VOID',
  // Lot 4. Sans ces deux entrees, chaque ecriture de bail de terrain portait
  // `MANUAL` et le grand livre general perdait une distinction qu'il a pour
  // toutes les autres pieces du module. Releve par l'agent du service dans sa
  // rubrique d'hypotheses, alors que la table ne lui appartenait pas.
  LAND_LEASE_PAYMENT: 'LAND_LEASE_PAYMENT',
  LAND_LEASE_ACCRUAL: 'LAND_LEASE_ACCRUAL',
  // Sous-lots 3, 4 et 5 du lot 4. Meme raison qu'au-dessus, et la meme
  // vigilance : ce que cette table ne connait pas retombe sur `MANUAL`, en
  // silence. C'est un defaut qui ne casse aucun test — le grand livre reste
  // equilibre, il devient seulement illisible.
  SALARY_NOTE: 'SALARY_NOTE',
  SALARY_PAYMENT: 'SALARY_PAYMENT',
  PROGRESS_STATEMENT: 'PROGRESS_STATEMENT',
  CONTRACTOR_PAYMENT: 'CONTRACTOR_PAYMENT',
  RETENTION_HELD: 'RETENTION_HELD',
  RETENTION_RELEASED: 'RETENTION_RELEASED',
  // Lot 5 : le stock. Quatrieme fois que cette table est oubliee par un lot,
  // et quatrieme fois qu'un agent le signale depuis un fichier qui ne lui
  // appartient pas. Ce qu'elle ne connait pas retombe sur `MANUAL`, en
  // silence : le grand livre reste equilibre et devient illisible.
  STOCK_RECEIPT: 'STOCK_RECEIPT',
  STOCK_ISSUE: 'STOCK_ISSUE',
  STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT',
  // Gestion locative, lot 3. La contre-passation d'un mouvement du compte
  // proprietaire porte la nature VOID, comme toute annulation du module.
  OWNER_RENT_COLLECTED: 'OWNER_RENT_COLLECTED',
  OWNER_MANAGEMENT_FEE: 'OWNER_MANAGEMENT_FEE',
  OWNER_EXPENSE: 'OWNER_EXPENSE',
  OWNER_PAYOUT: 'OWNER_PAYOUT',
  OWNER_VOID: 'VOID',
  CASH_SESSION_DIFFERENCE: 'CASH_SESSION_DIFFERENCE',
  OWNER_UNALLOCATED: 'OWNER_UNALLOCATED',
  OWNER_AUX_REALLOC: 'OWNER_AUX_REALLOC',
  OWNER_WITHHOLDING: 'OWNER_WITHHOLDING',
  OWNER_DEPOSIT: 'OWNER_DEPOSIT',
  TREASURY_TRANSFER: 'TREASURY_TRANSFER',
  TAX_REMITTANCE: 'TAX_REMITTANCE',
  // Lot 9 : ventes immobilieres.
  SALE_COMMISSION_PAYMENT: 'SALE_COMMISSION_PAYMENT'
};

/**
 * Pieces dont l'annulation doit aussi annuler les imputations de chantier.
 *
 * Un reglement fournisseur ne s'impute pas a un chantier : c'est la facture
 * qui l'a fait.
 *
 * La constatation de loyer, elle, produit bien des imputations depuis le
 * lot 4 — mais elle n'est pas annulable : `VoidableDocumentType` ne la connait
 * pas, et personne ne l'a demande. Une constatation erronee se corrige en
 * corrigeant le bail, puis en rejouant le mois. Consigne ici pour qu'on le
 * sache, plutot que de laisser croire a un oubli.
 */
const ALLOCATION_SOURCE_BY_DOCUMENT: Partial<Record<VoidableDocumentType, string>> = {
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  CASH_VOUCHER: 'CASH_VOUCHER'
};

// ---------------------------------------------------------------------------
// A. Equilibre — defaut n°1
// ---------------------------------------------------------------------------

export interface BalancedEntryLine {
  accountId: string;
  debit: number;
  credit: number;
  label: string;
  thirdPartyAccountId: string | null;
  fundsNature: 'CURRENT' | 'DEPOSIT' | 'UNALLOCATED' | null;
}

export interface BalancedEntry {
  lines: BalancedEntryLine[];
  totalDebit: number;
  totalCredit: number;
}

/**
 * Arrondit chaque ligne, puis verifie l'equilibre sur ces valeurs arrondies.
 *
 * **C'est l'ordre qui compte, et c'est tout le defaut n°1.** Le chemin
 * copropriete sommait les valeurs brutes, arrondissait les deux totaux et
 * comparait — alors que l'insertion, elle, arrondit ligne a ligne. Deux
 * demi-centimes au debit contre un centime au credit passaient le controle
 * (0,005 + 0,005 = 0,01) et se stockaient desequilibres (0,01 + 0,01 = 0,02).
 * L'ecriture etait acceptee, la balance devenait fausse, et rien ne le disait.
 *
 * Ici l'arrondi precede le controle, et c'est le meme arrondi que celui qui
 * sera stocke : `roundMoneyXof`, a l'unite, parce que le franc CFA n'a pas de
 * subdivision (defaut n°4). Ce qui est accepte est donc equilibre en base.
 */
export function buildBalancedEntryLines(lines: JournalLineInput[]): BalancedEntry {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw unprocessableEntity('Une ecriture comptable demande au moins deux lignes');
  }

  const rounded: BalancedEntryLine[] = lines.map((line, index) => {
    const debit = roundMoneyXof(Number(line.debit ?? 0));
    const credit = roundMoneyXof(Number(line.credit ?? 0));

    if (debit < 0 || credit < 0) {
      throw unprocessableEntity(`Ligne ${index + 1} : un montant negatif n'est pas recevable`);
    }

    // Une ligne ne porte qu'un sens. Une ligne qui porterait les deux serait
    // une compensation deguisee, invisible dans la balance.
    if (debit > 0 && credit > 0) {
      throw unprocessableEntity(`Ligne ${index + 1} : une ligne ne peut pas porter les deux sens a la fois`);
    }

    if (!line.accountId) {
      throw unprocessableEntity(`Ligne ${index + 1} : le compte comptable est obligatoire`);
    }

    return {
      accountId: line.accountId,
      debit,
      credit,
      label: line.label,
      thirdPartyAccountId: line.thirdPartyAccountId ?? null,
      fundsNature: line.fundsNature ?? null
    };
  });

  const totalDebit = roundMoneyXof(rounded.reduce((somme, line) => somme + line.debit, 0));
  const totalCredit = roundMoneyXof(rounded.reduce((somme, line) => somme + line.credit, 0));

  if (totalDebit !== totalCredit) {
    throw unprocessableEntity(
      `Ecriture non equilibree : ${totalDebit} ${DEFAULT_CURRENCY} d'un cote contre ${totalCredit} de l'autre`
    );
  }

  return { lines: rounded, totalDebit, totalCredit };
}

// ---------------------------------------------------------------------------
// B. Gardes d'isolation du chemin operationnel
//
// `assertSyndicateTenantOwnership` verifie l'appartenance par une jointure vers
// la copropriete. Le chemin operationnel n'a pas de copropriete a nommer : il
// filtre sur la colonne `tenantId`, desormais portee par le plan de comptes,
// le journal et l'ecriture. Aucune jointure vers `Syndicate`.
// ---------------------------------------------------------------------------

/**
 * Verifie qu'un journal operationnel appartient bien a ce tenant.
 *
 * Renvoie son identifiant, pour que l'appelant n'ait pas a le relire.
 */
export async function assertOperationalJournalTenantOwnership(
  tx: PrismaTransactionClient,
  tenantId: string,
  journalId: string
): Promise<string> {
  const journal = await tx.accountingJournal.findFirst({
    where: { id: journalId, tenantId, scope: OPERATIONS },
    select: { id: true }
  });

  if (!journal) {
    throw notFound('Journal comptable operationnel introuvable pour cette agence');
  }

  return journal.id;
}

/** Verifie que tous les comptes cites appartiennent au plan operationnel du tenant. */
export async function assertOperationalAccountsTenantOwnership(
  tx: PrismaTransactionClient,
  tenantId: string,
  accountIds: string[]
): Promise<void> {
  const uniques = Array.from(new Set(accountIds));

  const connus = await tx.chartOfAccount.count({
    where: { tenantId, scope: OPERATIONS, id: { in: uniques } }
  });

  if (connus !== uniques.length) {
    throw unprocessableEntity('Au moins un compte comptable est inconnu du plan operationnel de cette agence');
  }
}

// ---------------------------------------------------------------------------
// C. Plan de comptes operationnel
// ---------------------------------------------------------------------------

export interface OperationalAccountSeed {
  accountNumber: string;
  accountName: string;
  accountClass: number;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
}

/**
 * Le jeu minimal pose a la premiere piece d'une agence.
 *
 * Minimal, et enrichissable : ce sont les cinq comptes sans lesquels aucune
 * piece de ce lot ne peut s'ecrire — ce qu'on doit aux fournisseurs, ce que
 * nous doivent les clients, ce qui sort de la caisse, ce qu'on achete, ce que
 * coute un chantier. Toute agence en ajoutera d'autres ; aucune n'en a moins.
 *
 * Numerotation SYSCOHADA, celle que la copropriete utilise deja.
 */
export const OPERATIONAL_ACCOUNT_SEEDS: OperationalAccountSeed[] = [
  { accountNumber: '401', accountName: 'Fournisseurs', accountClass: 4, accountType: 'LIABILITY' },
  { accountNumber: '411', accountName: 'Clients', accountClass: 4, accountType: 'ASSET' },
  // Lot 10 : la caisse (571) ne se seme plus ici. La tresorerie operationnelle
  // (caisses, banques, Mobile Money) se resout desormais par
  // `treasury/accounts.ts::ensureDefaultTreasuryAccountTx`, qui reprend un 571
  // deja porteur d'ecritures ou pose 5711 pour une agence neuve. Plus aucun
  // fichier de ce dossier n'appelle `comptes.get('571')` (verifie le
  // 23 septembre 2026, lot 10) : retirer cette entree ne prive aucun appelant.
  { accountNumber: '601', accountName: 'Achats', accountClass: 6, accountType: 'EXPENSE' },
  { accountNumber: '605', accountName: 'Charges de chantier', accountClass: 6, accountType: 'EXPENSE' },
  // Lot 4, baux de terrain. Un loyer paye d'avance n'est pas une charge le
  // jour ou on le paie : c'est une creance de jouissance, qui se consomme mois
  // apres mois. Le 476 la porte (corrige le 23 septembre 2026 : ce n'etait pas
  // 486, absent du plan SYSCOHADA — voir consolidation, point 6), le 613
  // recoit la consommation. Sans ces deux comptes, un chantier sur terrain
  // loue porterait la totalite du loyer le mois du paiement et rien les onze
  // suivants — son cout deviendrait illisible, ce que le PRD demande
  // precisement d'eviter.
  {
    accountNumber: '476',
    accountName: "Charges constatees d'avance",
    accountClass: 4,
    accountType: 'ASSET'
  },
  { accountNumber: '613', accountName: 'Locations', accountClass: 6, accountType: 'EXPENSE' },
  // Lot 4, sous-lot 3 : les salaires. Le 661 recoit la charge, le 422 la
  // dette envers le salarie — un salaire constate n'est pas un salaire paye,
  // et l'un des deux doit pouvoir exister sans l'autre.
  { accountNumber: '422', accountName: 'Personnel, remunerations dues', accountClass: 4, accountType: 'LIABILITY' },
  { accountNumber: '661', accountName: 'Charges de personnel', accountClass: 6, accountType: 'EXPENSE' },
  // Lot 4, sous-lot 4 : les tacherons. Distinct du 401 des fournisseurs, sans
  // quoi la balance generale melerait deux populations qui ne se lisent pas
  // de la meme façon — un fournisseur facture, un tacheron presente des
  // situations sur un marche.
  { accountNumber: '402', accountName: 'Tacherons', accountClass: 4, accountType: 'LIABILITY' },
  // Lot 4, sous-lot 5 : les retenues de garantie. Ce qu'on retient reste du,
  // mais n'est plus exigible : le laisser sur le 401 ou le 402 ferait croire a
  // une campagne de reglement qu'il faut le payer maintenant. Un compte
  // distinct est la seule facon de dire « du, mais pas encore ».
  {
    accountNumber: '4047',
    accountName: 'Fournisseurs et tacherons, retenues de garantie',
    accountClass: 4,
    accountType: 'LIABILITY'
  },
  // Lot 5 : le stock. Un materiau achete et pas encore consomme n'est pas une
  // charge, c'est un actif : il est toujours la, on peut le compter. Le 311
  // le porte de la reception a la sortie, et c'est la sortie qui le fait
  // devenir une charge (principe P-7).
  {
    accountNumber: '311',
    accountName: 'Stocks de matieres et fournitures',
    accountClass: 3,
    accountType: 'ASSET'
  },
  // Lot 5, inventaire. Un ecart d'inventaire n'est ni un achat ni une vente :
  // c'est une variation de stock, et le 603 va dans les deux sens — debite
  // quand on trouve moins que prevu, credite quand on trouve plus. Un compte
  // de charge seul ne saurait pas dire le second cas.
  {
    accountNumber: '603',
    accountName: 'Variations des stocks de biens achetes',
    accountClass: 6,
    accountType: 'EXPENSE'
  }
];

/**
 * Pose, si besoin, le plan de comptes operationnel de l'agence et renvoie
 * l'index numero -> identifiant.
 *
 * **Lecture d'abord, creation ensuite** : on lit ce qui existe, on ne cree que
 * ce qui manque. Tenter la creation pour rattraper un `P2002` condamnerait la
 * transaction entiere, puisque PostgreSQL l'annule des la premiere commande en
 * echec (regle 4 de l'en-tete).
 *
 * Appelable a chaque piece sans cout notable : au regime de croisiere, la
 * fonction ne fait qu'une lecture et ne cree rien.
 */
/**
 * Le compte de charge a frapper pour chaque poste de depense.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi cette fonction existe
 * ---------------------------------------------------------------------------
 *
 * Jusqu'au 19 septembre 2026, toute depense de chantier frappait le MEME
 * compte, quel que soit son poste : le grand livre ne distinguait pas le ciment
 * de la main-d'oeuvre. L'imputation analytique (`CostAllocation` vers un poste)
 * et l'imputation comptable (l'ecriture) etaient deux mondes separes. La limite
 * etait consignee au lot 2, promise au lot 3 par son rapport, et oubliee de la
 * specification du lot 3.
 *
 * Un poste peut desormais porter son compte (`CostCategory.chartOfAccountId`).
 * Quand il en porte un, l'ecriture le frappe. Quand il n'en porte pas, elle
 * retombe sur le compte par defaut — celui-la meme qu'avant, si bien qu'aucune
 * donnee existante ne change de comportement.
 *
 * ---------------------------------------------------------------------------
 * Deux gardes qui comptent
 * ---------------------------------------------------------------------------
 *
 * Le compte designe doit appartenir a la MEME agence et a la portee
 * operationnelle : sans cela, une ecriture d'agence pourrait frapper un compte
 * de copropriete, et la generalisation du lot 2 aurait ouvert une porte qu'elle
 * voulait fermer.
 *
 * Il doit aussi etre ACTIF. Un compte desactive porte deja des mouvements —
 * c'est pour cela qu'on le desactive au lieu de le supprimer — mais il n'en
 * accepte plus de nouveaux.
 *
 * Dans les deux cas on retombe sur le defaut plutot que de lever : une facture
 * qui a bien eu lieu doit pouvoir s'enregistrer, meme si le parametrage d'un
 * poste est douteux. C'est le meme parti pris que pour l'alerte de depassement,
 * qui informe sans interdire.
 *
 * Une seule requete par lot, jamais une par poste.
 */
export async function resolveExpenseAccountsByCostCategoryTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  costCategoryIds: string[],
  compteParDefaut: string
): Promise<Map<string, string>> {
  const resultat = new Map<string, string>();
  const uniques = [...new Set(costCategoryIds)];
  if (uniques.length === 0) {
    return resultat;
  }

  const postes = await tx.costCategory.findMany({
    where: { id: { in: uniques }, tenantId },
    select: {
      id: true,
      chartOfAccountId: true,
      chartOfAccount: { select: { id: true, tenantId: true, scope: true, isActive: true } }
    }
  });

  for (const poste of postes as Array<Record<string, any>>) {
    const compte = poste.chartOfAccount;
    const utilisable =
      compte && compte.tenantId === tenantId && compte.scope === OPERATIONS && compte.isActive === true;
    resultat.set(poste.id, utilisable ? (compte.id as string) : compteParDefaut);
  }

  // Un poste introuvable — donc d'une autre agence — retombe aussi sur le
  // defaut : l'appelant a deja verifie l'appartenance de ses imputations, et ce
  // n'est pas a cette fonction de lever une seconde fois.
  for (const id of uniques) {
    if (!resultat.has(id)) {
      resultat.set(id, compteParDefaut);
    }
  }

  return resultat;
}

export async function ensureOperationalChartOfAccountsTx(
  tx: PrismaTransactionClient,
  tenantId: string
): Promise<Map<string, string>> {
  const attendus = OPERATIONAL_ACCOUNT_SEEDS.map(seed => seed.accountNumber);

  const existants = await tx.chartOfAccount.findMany({
    where: { tenantId, scope: OPERATIONS, accountNumber: { in: attendus } },
    select: { id: true, accountNumber: true }
  });

  const index = new Map<string, string>(existants.map(compte => [compte.accountNumber, compte.id]));

  for (const seed of OPERATIONAL_ACCOUNT_SEEDS) {
    if (index.has(seed.accountNumber)) {
      continue;
    }

    const cree = await tx.chartOfAccount.create({
      data: {
        tenantId,
        // Un plan operationnel n'appartient a aucune copropriete : la colonne
        // reste vide, et c'est `scope` qui porte la distinction.
        syndicateId: null,
        scope: OPERATIONS,
        accountNumber: seed.accountNumber,
        accountName: seed.accountName,
        accountClass: seed.accountClass,
        accountType: seed.accountType as any
      },
      select: { id: true, accountNumber: true }
    });

    index.set(cree.accountNumber, cree.id);
  }

  return index;
}

/**
 * Ajoute un compte au plan operationnel de l'agence.
 *
 * Le numero deja pris ressort en 409 avec un message metier, jamais en 400 avec
 * le message de Prisma (defaut n°5). Et comme cette fonction ecrit dans une
 * transaction, le doublon est detecte **par une lecture prealable**, pas par le
 * rattrapage d'un `P2002` qui aurait deja condamne la transaction.
 */
export async function createOperationalAccountTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  seed: OperationalAccountSeed & { isAuxiliary?: boolean; parentAccountId?: string | null }
) {
  const doublon = await tx.chartOfAccount.findFirst({
    where: { tenantId, scope: OPERATIONS, accountNumber: seed.accountNumber },
    select: { id: true }
  });

  if (doublon) {
    throw conflict(`Le numero de compte ${seed.accountNumber} existe deja pour ce plan operationnel`);
  }

  if (seed.parentAccountId) {
    await assertOperationalAccountsTenantOwnership(tx, tenantId, [seed.parentAccountId]);
  }

  return tx.chartOfAccount.create({
    data: {
      tenantId,
      syndicateId: null,
      scope: OPERATIONS,
      accountNumber: seed.accountNumber,
      accountName: seed.accountName,
      accountClass: seed.accountClass,
      accountType: seed.accountType as any,
      isAuxiliary: seed.isAuxiliary ?? false,
      parentAccountId: seed.parentAccountId ?? undefined
    }
  });
}

/**
 * Desactive un compte operationnel.
 *
 * **Un compte qui porte un mouvement se desactive, il ne se supprime pas.** Le
 * supprimer emporterait ses lignes d'ecriture (`onDelete: Cascade`) et
 * trouerait des ecritures deja verrouillees. Aucune fonction de suppression
 * n'existe donc dans ce fichier, et ce n'est pas un oubli.
 */
export async function deactivateOperationalAccountTx(tx: PrismaTransactionClient, tenantId: string, accountId: string) {
  await assertOperationalAccountsTenantOwnership(tx, tenantId, [accountId]);

  return tx.chartOfAccount.update({
    where: { id: accountId },
    data: { isActive: false }
  });
}

/**
 * Pose, si besoin, le journal operationnel de l'exercice et renvoie son id.
 *
 * Meme discipline que le plan de comptes : lecture, puis creation de ce qui
 * manque.
 */
export async function ensureOperationalJournalTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  fiscalYear: number,
  journalType: 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES' = 'GENERAL'
): Promise<string> {
  const code = `OP-${journalType}`;

  const existant = await tx.accountingJournal.findFirst({
    where: { tenantId, scope: OPERATIONS, code, fiscalYear },
    select: { id: true }
  });

  if (existant) {
    return existant.id;
  }

  const cree = await tx.accountingJournal.create({
    data: {
      tenantId,
      syndicateId: null,
      scope: OPERATIONS,
      journalType: journalType as any,
      label: `Journal operationnel ${journalType} ${fiscalYear}`,
      code,
      fiscalYear
    },
    select: { id: true }
  });

  return cree.id;
}

// ---------------------------------------------------------------------------
// D. postDocumentEntryTx — l'ecriture d'une piece validee
// ---------------------------------------------------------------------------

/** Voir `PostDocumentEntryTx` dans `./types-lot2.ts`. */
export const postDocumentEntryTx: PostDocumentEntryTx = async (tx, params) => {
  const { tenantId, journalId, documentType, documentId } = params;

  if (!documentId) {
    // Principe P-2 : la piece precede l'ecriture. Aucune ecriture libre.
    throw unprocessableEntity("Une ecriture comptable nait d'une piece, jamais d'elle-meme");
  }

  await assertOperationalJournalTenantOwnership(tx, tenantId, journalId);

  // Lecture avant ecriture (regle 4) : une piece ne porte qu'une ecriture.
  const deja = await tx.journalEntry.findFirst({
    where: { tenantId, documentType, documentId },
    select: { id: true, isLocked: true, reference: true }
  });

  if (deja) {
    // **Le drapeau de verrouillage est lu ici, et c'est le changement voulu.**
    // Jusqu'ici il n'etait consulte nulle part ailleurs que dans la fonction
    // qui le posait : l'immuabilite ne tenait qu'a l'absence de route
    // d'ecriture. Elle tient maintenant a un controle.
    if (deja.isLocked) {
      throw conflict(
        `La piece ${documentType} porte deja une ecriture verrouillee (${deja.reference}) : ` +
          "corrigez-la par une piece d'annulation, elle ne se reecrit pas"
      );
    }

    throw conflict(`La piece ${documentType} porte deja une ecriture (${deja.reference})`);
  }

  // Equilibre sur les montants arrondis, ceux qui seront stockes (defaut n°1).
  const { lines, totalDebit, totalCredit } = buildBalancedEntryLines(params.lines);

  await assertOperationalAccountsTenantOwnership(
    tx,
    tenantId,
    lines.map(line => line.accountId)
  );

  // **Verrouillee des sa naissance, dans la transaction de sa piece.** Pas un
  // appel separe qu'on pourrait oublier ou qui pourrait echouer seul : le
  // verrou fait partie de l'ecriture.
  const entry = await tx.journalEntry.create({
    data: {
      journalId,
      tenantId,
      entryDate: params.entryDate,
      reference: params.reference,
      description: params.description,
      sourceType: (SOURCE_TYPE_BY_DOCUMENT[documentType] ?? 'MANUAL') as any,
      sourceId: documentId,
      documentType,
      documentId,
      isLocked: true
    },
    select: { id: true }
  });

  await tx.journalEntryLine.createMany({
    data: lines.map(line => ({
      entryId: entry.id,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      label: line.label,
      thirdPartyAccountId: line.thirdPartyAccountId,
      fundsNature: line.fundsNature
    }))
  });

  return { entryId: entry.id, totalDebit, totalCredit };
};

// ---------------------------------------------------------------------------
// E. voidDocumentTx — la piece d'annulation
// ---------------------------------------------------------------------------

/**
 * Voir `VoidDocumentTx` dans `./types-lot2.ts`.
 *
 * **Rien de la piece d'origine ni de son ecriture n'est touche.** On cree une
 * piece d'annulation, une ecriture inverse — les memes lignes, les deux sens
 * echanges — et on les relie. Le releve montre alors les deux mouvements, ce
 * qui est la seule facon honnete de corriger : une ecriture qu'on reecrit est
 * une ecriture dont on ne saura jamais ce qu'elle disait.
 *
 * **Sur le lien entre les deux ecritures.** `JournalEntry.voidedByEntryId` est
 * renseigne sur l'ecriture *inverse*, ou il designe l'ecriture qu'elle annule ;
 * l'ecriture d'origine se lit alors par la relation inverse (`voidsEntries`)
 * sans qu'une seule de ses colonnes n'ait bouge. Le renseigner sur l'ecriture
 * d'origine aurait donne une lecture plus naturelle du nom de la colonne, mais
 * au prix d'un `UPDATE` sur une ecriture verrouillee — exactement ce que le
 * principe P-6 interdit, et ce qui viderait de son sens le verrou pose par
 * `postDocumentEntryTx`. Le lien porte donc de l'annulation vers l'annulee.
 */
/**
 * Les mouvements de compte de tiers qu'une piece a produits.
 *
 * Une facture en produit un seul, sous son propre identifiant. Un reglement en
 * produit un par affectation — chacun sous l'identifiant de l'affectation, pas
 * du reglement — plus un pour le reliquat verse en acompte, celui-la sous
 * l'identifiant du reglement. Une piece de caisse n'en produit aucun : elle ne
 * met en jeu aucun tiers.
 *
 * Cette fonction existe pour que `voidDocumentTx` puisse les retrouver tous
 * sans connaitre la forme de chaque nature de piece.
 */
async function mouvementsDeLaPiece(
  tx: PrismaTransactionClient,
  documentType: string,
  documentId: string
): Promise<Array<{ sourceType: string; sourceId: string }>> {
  if (documentType === 'SUPPLIER_INVOICE') {
    return [{ sourceType: 'SUPPLIER_INVOICE', sourceId: documentId }];
  }

  if (documentType === 'SUPPLIER_PAYMENT') {
    const affectations = await tx.supplierPaymentAllocation.findMany({
      where: { paymentId: documentId },
      select: { id: true }
    });
    return [
      { sourceType: 'SUPPLIER_PAYMENT', sourceId: documentId },
      ...affectations.map((a: { id: string }) => ({
        sourceType: 'SUPPLIER_PAYMENT_ALLOCATION',
        sourceId: a.id
      }))
    ];
  }

  // CASH_VOUCHER : une sortie de caisse imputee a un chantier ne passe par
  // aucun compte de tiers.
  return [];
}

/**
 * Remet le compte de tiers dans l'etat ou il etait avant la piece annulee.
 *
 * **Pourquoi ceci existe.** `voidDocumentTx` inversait l'ecriture comptable et
 * annulait les imputations de chantier, mais ne touchait pas au compte de
 * tiers : annuler une facture laissait donc le fournisseur creancier de son
 * montant, et annuler un reglement laissait la dette eteinte. Le solde, qui est
 * la raison d'etre de ce module, restait faux apres toute annulation. Le defaut
 * n'avait jamais ete vu parce que l'annulation n'etait exposee que pour la
 * facture, et qu'aucun test ne relisait le solde ensuite. Trouve par le
 * parcours de bout en bout le 19 septembre 2026.
 *
 * **Comment.** Un mouvement d'inversion par mouvement d'origine, de sens
 * oppose : ce qui etait porte au debit revient au credit, et reciproquement.
 * On n'efface rien — le releve montre les deux lignes, comme il montre les deux
 * ecritures.
 *
 * La cle d'idempotence du grand livre est le triplet
 * `(sourceType, sourceId, type)`. L'inversion prend donc `VOID` pour
 * `sourceType` et **l'identifiant du mouvement d'origine** pour `sourceId` :
 * unique par construction, y compris quand un meme reglement inverse plusieurs
 * affectations du meme type. Rejouer l'annulation ne double donc rien.
 */
async function inverserMouvementsDeTiersTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  documentType: string,
  documentId: string,
  motif: string
): Promise<void> {
  const sources = await mouvementsDeLaPiece(tx, documentType, documentId);
  if (sources.length === 0) {
    return;
  }

  const mouvements = await tx.thirdPartyMovement.findMany({
    where: {
      tenantId,
      OR: sources.map(s => ({ sourceType: s.sourceType, sourceId: s.sourceId }))
    }
  });

  for (const mouvement of mouvements) {
    const porteAuDebit = roundMoneyXof(Number(mouvement.debit ?? 0));
    const porteAuCredit = roundMoneyXof(Number(mouvement.credit ?? 0));

    await appendThirdPartyMovementTx(tx, {
      accountId: mouvement.accountId,
      tenantId,
      type: mouvement.type as any,
      // Les deux sens echanges : c'est toute l'inversion.
      billed: porteAuCredit > 0 ? porteAuCredit : undefined,
      settled: porteAuDebit > 0 ? porteAuDebit : undefined,
      label: `Annulation : ${mouvement.label} (${motif})`,
      sourceType: 'VOID',
      sourceId: mouvement.id,
      // LA DATE DU MOUVEMENT ANNULE, jamais celle du jour.
      //
      // Une contrepassation appartient a la date de la piece qu'elle annule.
      // Datee du jour, elle se classait en fin de releve, apres des
      // reglements posterieurs a la piece annulee — et le releve devenait
      // faux, pas seulement mal trie : `balanceAfter` est un solde progressif
      // CALCULE A L'INSERTION, et l'afficher dans un autre ordre que celui
      // ou il a ete calcule produit des sauts impossibles. Sur le compte d'un
      // fournisseur, le solde de cloture affichait ainsi +6 000 000 quand la
      // balance en montrait −2 000 000. Trouve par le test de bout en bout du
      // 20 septembre 2026.
      movementDate: mouvement.movementDate
    });
  }
}

export const voidDocumentTx: VoidDocumentTx = async (tx, params) => {
  const { tenantId, documentType, documentId, reason, voidedByUserId } = params;

  // Lecture avant ecriture (regle 4) : une seule annulation par piece.
  const dejaAnnulee = await tx.voidDocument.findFirst({
    where: { tenantId, documentType: documentType as any, documentId },
    select: { id: true }
  });

  if (dejaAnnulee) {
    throw conflict("Cette piece a deja ete annulee : ce lot ne modelise pas l'annulation d'une annulation");
  }

  const origine = await tx.journalEntry.findFirst({
    where: { tenantId, documentType, documentId },
    select: {
      id: true,
      journalId: true,
      reference: true,
      isLocked: true,
      lines: {
        select: {
          accountId: true,
          debit: true,
          credit: true,
          label: true,
          thirdPartyAccountId: true,
          fundsNature: true
        }
      }
    }
  });

  if (!origine) {
    throw notFound("Aucune ecriture n'est rattachee a cette piece pour cette agence");
  }

  // Seconde lecture du drapeau (defaut n°2) : une ecriture non verrouillee
  // n'est pas passee par ce moteur, et on refuse de l'inverser a l'aveugle.
  if (!origine.isLocked) {
    throw conflict("L'ecriture de cette piece n'a pas ete emise par le moteur operationnel");
  }

  // La piece d'annulation nait avant son ecriture (principe P-2), puis recoit
  // le lien vers elle.
  const voidDocument = await tx.voidDocument.create({
    data: {
      tenantId,
      documentType: documentType as any,
      documentId,
      reason,
      voidedByUserId
    },
    select: { id: true }
  });

  const reversing = await tx.journalEntry.create({
    data: {
      journalId: origine.journalId,
      tenantId,
      entryDate: new Date(),
      reference: `ANN-${origine.reference}`,
      description: `Annulation de ${origine.reference} : ${reason}`,
      sourceType: 'VOID' as any,
      sourceId: voidDocument.id,
      documentType: 'VOID',
      documentId: voidDocument.id,
      // Le lien porte de l'annulation vers l'annulee : voir l'en-tete.
      voidedByEntryId: origine.id,
      isLocked: true
    },
    select: { id: true }
  });

  // L'inverse ligne a ligne : les deux sens echanges, les memes comptes, les
  // memes montants — deja arrondis puisqu'ils sortent de la base.
  await tx.journalEntryLine.createMany({
    data: origine.lines.map(line => ({
      entryId: reversing.id,
      accountId: line.accountId,
      debit: roundMoneyXof(Number(line.credit ?? 0)),
      credit: roundMoneyXof(Number(line.debit ?? 0)),
      label: `Annulation : ${line.label}`,
      thirdPartyAccountId: line.thirdPartyAccountId,
      fundsNature: line.fundsNature
    }))
  });

  await tx.voidDocument.update({
    where: { id: voidDocument.id },
    data: { reversingEntryId: reversing.id }
  });

  // Les imputations de chantier tombent avec la piece : un chantier ne doit
  // plus porter le cout d'une facture annulee. On les marque, on ne les
  // supprime pas — `ConstructionSite.actualCost` les ecarte par `voidedAt`,
  // et l'historique reste lisible.
  const sourceType = ALLOCATION_SOURCE_BY_DOCUMENT[documentType];

  if (sourceType) {
    // Les chantiers concernes sont lus AVANT de marquer les imputations :
    // apres le `updateMany`, elles portent toutes `voidedAt` et on ne saurait
    // plus lesquelles viennent d'etre annulees par cette operation.
    const imputations = await tx.costAllocation.findMany({
      where: { tenantId, sourceType: sourceType as any, sourceId: documentId, voidedAt: null },
      select: { siteId: true }
    });

    await tx.costAllocation.updateMany({
      where: { tenantId, sourceType: sourceType as any, sourceId: documentId, voidedAt: null },
      data: { voidedAt: new Date() }
    });

    // Le cout des chantiers vient de baisser : les programmes de travaux
    // rattaches doivent suivre dans cette transaction. Sans cela, annuler une
    // facture laisserait le programme afficher un cout qu'il n'a plus.
    for (const siteId of new Set(imputations.map(i => i.siteId))) {
      await syncWorkProgramCostTx(tx, tenantId, siteId);
    }
  }

  // La PIECE ELLE-MEME passe a l'etat annule.
  //
  // Sans cela, tout le reste etait juste — ecriture inversee, imputations
  // tombees, solde du tiers revenu en place — mais la facture continuait
  // d'afficher « Validee ». Consequences vues au test de bout en bout du
  // 20 septembre 2026 : l'action « Annuler » restait offerte sur une facture
  // deja annulee, et cette facture restait proposee a la carte « Factures a
  // regler », ou l'on pouvait donc regler ce qui n'existait plus.
  //
  // Seule la facture porte une colonne `status` en base. Le reglement et la
  // piece de caisse n'en ont pas : leur etat se deduit de `validatedAt` et de
  // la presence d'une piece d'annulation (`toPaymentRecord`, `suppliers.ts`),
  // et ils affichaient donc « Annule » correctement des le premier jour. C'est
  // la facture, seule a stocker son etat, qui l'oubliait.
  if (documentType === 'SUPPLIER_INVOICE') {
    await tx.supplierInvoice.update({
      where: { id: documentId },
      data: { status: 'VOIDED' as any }
    });
  }

  // Le compte de tiers revient a son etat anterieur. Sans cela, l'ecriture
  // serait inversee mais le solde resterait celui d'avant l'annulation — et
  // c'est le solde que la gestionnaire regarde.
  await inverserMouvementsDeTiersTx(tx, tenantId, documentType, documentId, reason);

  return { voidDocumentId: voidDocument.id, reversingEntryId: reversing.id };
};

// ---------------------------------------------------------------------------
// F. getTrialBalance — la balance generale d'une portee
// ---------------------------------------------------------------------------

/** Filtre de dates d'ecriture, ou rien si la periode est ouverte des deux cotes. */
function buildEntryDateFilter(range?: PeriodRange): { gte?: Date; lte?: Date } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }

  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {})
  };
}

/**
 * Voir `GetTrialBalance` dans `./types-lot2.ts`.
 *
 * **Agregee en SQL, jamais en memoire.** Le banc de charge du lot 0 mesure un
 * facteur trente entre les deux approches ; `getTrialBalanceBySyndicate`, qui
 * charge toutes les lignes pour les sommer en JavaScript, reste le chemin de la
 * copropriete et n'est pas modifiee. Celle-ci agrege par `groupBy` et ne
 * ramene qu'une ligne par compte.
 *
 * L'isolation passe par la colonne `tenantId` de l'ecriture et du compte : pas
 * une jointure vers la copropriete, qu'une ecriture operationnelle n'a pas.
 */
export const getTrialBalance: GetTrialBalance = async (tenantId, scope, range) => {
  const entryDate = buildEntryDateFilter(range);

  const grouped = await prisma.journalEntryLine.groupBy({
    by: ['accountId'],
    where: {
      account: { tenantId, scope },
      entry: { tenantId, ...(entryDate ? { entryDate } : {}) }
    },
    _sum: { debit: true, credit: true }
  });

  const accountIds = grouped.map(row => row.accountId);

  const comptes = await prisma.chartOfAccount.findMany({
    where: { tenantId, scope, id: { in: accountIds } },
    select: { id: true, accountNumber: true, accountName: true }
  });

  const parId = new Map(comptes.map(compte => [compte.id, compte]));

  const lines: TrialBalanceLine[] = grouped
    .map(row => {
      const compte = parId.get(row.accountId);
      const totalBilled = roundMoney(Number(row._sum.debit ?? 0));
      const totalSettled = roundMoney(Number(row._sum.credit ?? 0));

      return {
        accountId: row.accountId,
        accountNumber: compte?.accountNumber ?? '',
        accountName: compte?.accountName ?? '',
        totalBilled,
        totalSettled,
        balance: roundMoney(totalBilled - totalSettled)
      };
    })
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  const totalBilled = roundMoney(lines.reduce((somme, line) => somme + line.totalBilled, 0));
  const totalSettled = roundMoney(lines.reduce((somme, line) => somme + line.totalSettled, 0));

  return {
    lines,
    totalBilled,
    totalSettled,
    // Une balance desequilibree signale une ecriture qui n'est pas passee par
    // ce moteur : avec `buildBalancedEntryLines`, le cas ne peut plus naitre.
    isBalanced: totalBilled === totalSettled
  };
};
