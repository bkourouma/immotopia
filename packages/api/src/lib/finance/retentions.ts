/**
 * Retenue de garantie — lot 4, cinquième sous-lot (`types-lot4-retentions.ts`).
 *
 * Implémente les cinq fonctions du contrat gelé : la pose d'une retenue sur une
 * pièce déjà validée, sa libération, la liste, le détail, et le résumé de ce
 * qui est détenu.
 *
 * Style suivi : `salaries.ts` (sous-lot 3) pour la résolution des comptes
 * opérationnels, la lecture avant écriture, la mise à jour conditionnelle et la
 * relecture finale ; `suppliers.ts` (lot 2) pour le vocabulaire des refus.
 *
 * ---------------------------------------------------------------------------
 * Ce fichier n'écrit AUCUNE imputation de chantier, et c'est le point entier
 * ---------------------------------------------------------------------------
 *
 * Le mot `costAllocation` n'apparaît nulle part ici, ni en création, ni en
 * modification, ni en annulation. L'ouvrage a coûté son prix entier ; ce qui
 * change, c'est ce qu'on doit **maintenant**. Une retenue qui ferait baisser le
 * coût d'un chantier serait un mensonge comptable doublé d'un mensonge de
 * pilotage — le chantier paraîtrait moins cher parce qu'on n'a pas fini de
 * payer.
 *
 * C'est vérifié, et pas seulement affirmé : le test unitaire monte une facture
 * de chantier validée, lit `sumSiteActualCost` (la vraie fonction de
 * `site-cost.ts`), pose la retenue, relit, et exige le même chiffre au franc
 * près.
 *
 * ---------------------------------------------------------------------------
 * Un reclassement, et deux natures pour le porter
 * ---------------------------------------------------------------------------
 *
 *   à la pose        : débit du tiers (401 fournisseurs / 402 tâcherons),
 *                      crédit du 4047 « retenues de garantie »
 *   à la libération  : l'inverse, exactement
 *
 * Les deux écritures portent le MÊME identifiant de retenue. Or
 * `postDocumentEntryTx` refuse une seconde écriture pour un même couple
 * (nature, pièce) : avec une seule nature, la libération serait rejetée comme
 * doublon de la pose. D'où deux natures, `RETENTION_HELD` et
 * `RETENTION_RELEASED`, déclarées dans `FinanceSourceType` (types.ts), dans
 * `PostDocumentEntryParams.documentType` (types-lot2.ts) et dans
 * `SOURCE_TYPE_BY_DOCUMENT` (accounting.ts). Aucun transtypage n'est nécessaire
 * ici, contrairement aux sous-lots 1, 3 et 4 : les trois unions ont été
 * élargies avant que ce fichier ne soit écrit.
 *
 * Le mouvement de compte de tiers suit la même paire de natures. Son unicité
 * est `(sourceType, sourceId, type)` : deux natures distinctes la rendent sûre
 * quel que soit le sens du mouvement, et le `type` reste `ADJUSTMENT` dans les
 * deux cas — un reclassement n'est ni une facturation ni un règlement, et lui
 * donner `PAYMENT` laisserait croire que de l'argent est sorti.
 *
 * ---------------------------------------------------------------------------
 * Libérer n'est pas payer
 * ---------------------------------------------------------------------------
 *
 * `releaseRetentionTx` n'écrit aucun règlement, ne touche à aucune caisse,
 * n'appelle rien de `cash.ts`. Après libération, le tiers est créancier du
 * montant retenu et se règle par le chemin ordinaire du lot 2 (règlement
 * fournisseur) ou du sous-lot 4 (règlement de tâcheron).
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { appendThirdPartyMovementTx } from './ledger';
import { roundMoneyXof, roundPercent } from './money';
import { toAmountOrZero } from './types';
import type {
  CreateRetentionTx,
  GetRetention,
  GetRetentionSummary,
  ListRetentions,
  ReleaseRetentionTx,
  RetentionGuaranteeRecord,
  RetentionSourceType,
  RetentionSummaryRecord
} from './types-lot4-retentions';

/** Devise unique du lot (décision D9 du plan, déjà actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/**
 * Un client Prisma, global ou de transaction — même parti pris que
 * `site-cost.ts` : le type de la transaction est le plus étroit des deux, et le
 * client global le satisfait.
 */
type RetentionReadClient = PrismaTransactionClient;

// ---------------------------------------------------------------------------
// Comptes et journal opérationnels
// ---------------------------------------------------------------------------

interface RetentionAccounts {
  journalId: string;
  /** 401 ou 402, selon la nature du tiers. Ce qu'on lui doit, exigible. */
  payableAccountId: string;
  /** 4047 — Fournisseurs et tâcherons, retenues de garantie. Dû, pas exigible. */
  retentionAccountId: string;
}

/**
 * Résout le journal et les deux comptes dont un reclassement a besoin.
 *
 * Délègue entièrement à `accounting.ts`, comme `suppliers.ts` et `salaries.ts` :
 * ce fichier ne porte aucune copie du plan de comptes. Les deux copies
 * divergentes du lot 2 (571 contre 521) ont déjà coûté assez cher.
 */
async function resolveRetentionAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date,
  payableAccountNumber: '401' | '402'
): Promise<RetentionAccounts> {
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
    payableAccountId: exiger(payableAccountNumber),
    retentionAccountId: exiger('4047')
  };
}

// ---------------------------------------------------------------------------
// Libellés — résolus PAR LOT, jamais une requête par ligne
//
// `RetentionGuarantee` ne porte ni le libellé de sa pièce source, ni le nom de
// son chantier : elle n'a de relation Prisma ni vers l'une ni vers l'autre
// (`sourceId` désigne deux tables différentes selon `sourceType`, et `siteId`
// est recopié sans clé étrangère — voir le commentaire du modèle). Les deux
// se rattrapent donc par des lectures groupées, une par table, quelle que soit
// la taille de la page.
// ---------------------------------------------------------------------------

interface ResolvedLabels {
  /** sourceId -> libellé de la pièce, en clair. */
  sources: Map<string, string>;
  /** siteId -> nom du chantier. */
  sites: Map<string, string>;
}

const EMPTY_LABELS: ResolvedLabels = { sources: new Map(), sites: new Map() };

/** `15/03/2026`. En UTC, pour que le libellé ne change pas selon le serveur. */
function formatDateFr(value: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const jour = String(date.getUTCDate()).padStart(2, '0');
  const mois = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${date.getUTCFullYear()}`;
}

function invoiceSourceLabel(row: { reference: string }): string {
  return `Facture ${row.reference}`;
}

/**
 * « Situation du 15/03/2026 — marché MAÇ-07 ».
 *
 * Le contrat donne pour exemple « Situation n°3 — marché MAÇ-07 », mais
 * `ProgressStatement` ne porte aucun numéro d'ordre : le numéroter ici
 * supposerait de compter les situations antérieures du marché, donc une lecture
 * de plus par ligne — exactement ce que la règle « par lot » interdit. La date
 * identifie la situation tout aussi bien pour un lecteur humain.
 */
function statementSourceLabel(row: { statementDate: Date; contract?: { reference?: string | null } | null }): string {
  const marche = row.contract?.reference;
  const base = `Situation du ${formatDateFr(row.statementDate)}`;
  return marche ? `${base} — marché ${marche}` : base;
}

async function resolveLabels(
  client: RetentionReadClient,
  tenantId: string,
  rows: Array<{ sourceType: RetentionSourceType; sourceId: string; siteId: string | null }>
): Promise<ResolvedLabels> {
  if (rows.length === 0) {
    return EMPTY_LABELS;
  }

  const invoiceIds = [...new Set(rows.filter(r => r.sourceType === 'SUPPLIER_INVOICE').map(r => r.sourceId))];
  const statementIds = [...new Set(rows.filter(r => r.sourceType === 'PROGRESS_STATEMENT').map(r => r.sourceId))];
  const siteIds = [...new Set(rows.map(r => r.siteId).filter((value): value is string => Boolean(value)))];

  const sources = new Map<string, string>();
  const sites = new Map<string, string>();

  if (invoiceIds.length > 0) {
    const invoices = await client.supplierInvoice.findMany({
      where: { tenantId, id: { in: invoiceIds } },
      select: { id: true, reference: true }
    });
    for (const invoice of invoices as Array<Record<string, any>>) {
      sources.set(invoice.id, invoiceSourceLabel(invoice as { reference: string }));
    }
  }

  if (statementIds.length > 0) {
    // Lecture DIRECTE du modèle Prisma, jamais un import de `contractors.ts` :
    // les situations d'avancement sont écrites par le sous-lot 4, en parallèle
    // de celui-ci. Dépendre de son code ferait tenir ce fichier à un chantier
    // qui n'est pas le sien ; dépendre du schéma, déjà gelé et généré, ne coûte
    // rien.
    const statements = await client.progressStatement.findMany({
      where: { tenantId, id: { in: statementIds } },
      select: { id: true, statementDate: true, contract: { select: { reference: true } } }
    });
    for (const statement of statements as Array<Record<string, any>>) {
      sources.set(statement.id, statementSourceLabel(statement as any));
    }
  }

  if (siteIds.length > 0) {
    const constructionSites = await client.constructionSite.findMany({
      where: { tenantId, id: { in: siteIds } },
      select: { id: true, name: true }
    });
    for (const site of constructionSites as Array<Record<string, any>>) {
      sites.set(site.id, site.name);
    }
  }

  return { sources, sites };
}

// ---------------------------------------------------------------------------
// Conversion Prisma -> contrat
// ---------------------------------------------------------------------------

function toRetentionRecord(row: any, labels: ResolvedLabels): RetentionGuaranteeRecord {
  const siteId: string | null = row.siteId ?? null;

  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    // L'écran ne montre jamais un identifiant (contrat, `sourceLabel`). Quand
    // la pièce a disparu, on le dit en clair plutôt que de retomber sur son
    // UUID — un UUID affiché est un défaut, pas un repli.
    sourceLabel: labels.sources.get(row.sourceId) ?? 'Pièce source introuvable',
    thirdPartyLabel: row.thirdPartyAccount?.label ?? 'Tiers inconnu',
    thirdPartyAccountId: row.thirdPartyAccountId,
    siteId,
    siteLabel: siteId ? (labels.sites.get(siteId) ?? null) : null,
    baseAmount: roundMoneyXof(toAmountOrZero(row.baseAmount)),
    // UN POURCENTAGE N'EST PAS UN MONTANT. `roundPercent` (deux décimales),
    // jamais `roundMoneyXof` (unité) : « 4,5 % » arrondi comme un franc CFA
    // deviendrait « 5 % », et la retenue stockée ne correspondrait plus au taux
    // affiché. Le défaut a déjà été commis une fois dans ce module, sur la part
    // de budget consommée.
    ratePercent: roundPercent(toAmountOrZero(row.ratePercent)),
    amount: roundMoneyXof(toAmountOrZero(row.amount)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    plannedReleaseDate: row.plannedReleaseDate,
    status: row.status,
    releasedAt: row.releasedAt ?? null,
    createdAt: row.createdAt
  };
}

/** Relit une retenue avec son compte de tiers et ses libellés, puis la rend. */
async function readRetentionRecord(
  client: RetentionReadClient,
  tenantId: string,
  retentionId: string
): Promise<RetentionGuaranteeRecord> {
  const row = await client.retentionGuarantee.findFirst({
    where: { id: retentionId, tenantId },
    include: { thirdPartyAccount: { select: { label: true } } }
  });
  if (!row) {
    throw notFound('Retenue de garantie introuvable');
  }

  const labels = await resolveLabels(client, tenantId, [row as any]);
  return toRetentionRecord(row, labels);
}

// ---------------------------------------------------------------------------
// La pièce source — lue, jamais modifiée
// ---------------------------------------------------------------------------

interface ResolvedSource {
  thirdPartyLabel: string;
  thirdPartyAccountId: string;
  siteId: string | null;
  baseAmount: number;
  currency: string;
  /** 401 pour un fournisseur, 402 pour un tâcheron. */
  payableAccountNumber: '401' | '402';
  /** Date de la pièce source : l'écriture de pose reste dans sa période. */
  entryDate: Date;
  /** Pour les libellés d'écriture et de mouvement. */
  sourceLabel: string;
  /**
   * Ce qui reste à payer sur la pièce, quand on sait le calculer.
   *
   * Seule la facture fournisseur le sait : ses règlements lui sont affectés
   * pièce par pièce. Les règlements d'un tâcheron ne visent aucune situation
   * en particulier — on règle un tâcheron, pas une situation — et le reste dû
   * d'une situation n'a donc pas de sens. `undefined` veut dire « incalculable
   * ici », et le contrôle est alors omis plutôt que deviné.
   */
  remainingPayable?: number;
}

async function resolveSupplierInvoiceSource(
  tx: PrismaTransactionClient,
  tenantId: string,
  invoiceId: string
): Promise<ResolvedSource> {
  const invoice: any = await tx.supplierInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: {
      supplier: { select: { name: true, thirdPartyAccountId: true } },
      site: { select: { id: true, name: true } }
    }
  });
  if (!invoice) {
    throw notFound('Facture fournisseur introuvable');
  }

  // « On ne retient pas sur une promesse » : une facture en brouillon n'a
  // constaté ni charge, ni dette. Reclasser une part d'un solde qui n'existe
  // pas encore rendrait le compte du fournisseur faux jusqu'à la validation.
  if (invoice.status !== 'VALIDATED') {
    throw conflict("Cette facture n'est pas validée — une retenue ne se pose que sur une pièce validée");
  }

  if (!invoice.supplier?.thirdPartyAccountId) {
    throw notFound('Fournisseur introuvable pour cette facture');
  }

  // CE QUI RESTE À PAYER SUR LA FACTURE, et c'est la seule limite qui compte.
  //
  // La garde d'origine refusait la retenue dès qu'un règlement TOUCHAIT la
  // facture, si peu que ce soit. Elle visait juste — on ne retient pas sur un
  // solde éteint — mais frappait trop large : une facture de 18 000 000 réglée
  // à 16 200 000 laisse 1 800 000 à payer, et une retenue de 1 800 000 s'y
  // pose parfaitement. Le refus était d'autant plus difficile à justifier que
  // la situation de tâcheron, elle, l'acceptait dans le même cas.
  //
  // Seuls les règlements VALIDÉS et non annulés éteignent une dette : un
  // brouillon n'a rien payé, et une annulation a rendu ce qu'elle avait pris.
  const affectations = await tx.supplierPaymentAllocation.findMany({
    where: { invoiceId, payment: { validatedAt: { not: null } } },
    select: { amount: true, paymentId: true }
  });

  const annulations = affectations.length
    ? await tx.voidDocument.findMany({
        where: {
          tenantId,
          documentType: 'SUPPLIER_PAYMENT' as any,
          documentId: { in: [...new Set(affectations.map(a => a.paymentId))] }
        },
        select: { documentId: true }
      })
    : [];
  const reglementsAnnules = new Set(annulations.map(a => a.documentId));

  const dejaRegle = roundMoneyXof(
    affectations
      .filter(a => !reglementsAnnules.has(a.paymentId))
      .reduce((somme, a) => somme + toAmountOrZero(a.amount), 0)
  );

  const montantFacture = roundMoneyXof(toAmountOrZero(invoice.amount));

  return {
    remainingPayable: roundMoneyXof(montantFacture - dejaRegle),
    thirdPartyLabel: invoice.supplier.name,
    thirdPartyAccountId: invoice.supplier.thirdPartyAccountId,
    siteId: invoice.siteId ?? null,
    baseAmount: roundMoneyXof(toAmountOrZero(invoice.amount)),
    currency: invoice.currency ?? DEFAULT_CURRENCY,
    payableAccountNumber: '401',
    entryDate: invoice.invoiceDate,
    sourceLabel: invoiceSourceLabel(invoice)
  };
}

async function resolveProgressStatementSource(
  tx: PrismaTransactionClient,
  tenantId: string,
  statementId: string
): Promise<ResolvedSource> {
  // Lecture directe du modèle, sans passer par `contractors.ts` : voir
  // `resolveLabels`. Le chantier d'une situation se trouve par son marché, le
  // tiers par le tâcheron de ce marché.
  const statement: any = await tx.progressStatement.findFirst({
    where: { id: statementId, tenantId },
    include: {
      contract: {
        select: {
          reference: true,
          siteId: true,
          contractor: { select: { fullName: true, thirdPartyAccountId: true } }
        }
      }
    }
  });
  if (!statement) {
    throw notFound("Situation d'avancement introuvable");
  }

  if (statement.status !== 'VALIDATED') {
    throw conflict("Cette situation n'est pas validée — une retenue ne se pose que sur une pièce validée");
  }

  if (!statement.contract?.contractor?.thirdPartyAccountId) {
    throw notFound('Tâcheron introuvable pour cette situation');
  }

  // AUCUNE garde de règlement ici, et ce n'est pas un oubli : les règlements de
  // tâcheron ne sont affectés à aucune situation (`ContractorPayment` n'a pas
  // de table d'affectation), il n'y a donc rien à lire pour savoir si celle-ci
  // a déjà été réglée. Le contrat le dit franchement plutôt que de le masquer :
  // l'écran pose la retenue dans la foulée de la validation, et c'est la seule
  // garantie de ce côté.

  return {
    thirdPartyLabel: statement.contract.contractor.fullName,
    thirdPartyAccountId: statement.contract.contractor.thirdPartyAccountId,
    siteId: statement.contract.siteId ?? null,
    baseAmount: roundMoneyXof(toAmountOrZero(statement.amount)),
    currency: statement.currency ?? DEFAULT_CURRENCY,
    payableAccountNumber: '402',
    entryDate: statement.statementDate,
    sourceLabel: statementSourceLabel(statement)
  };
}

async function resolveSource(
  tx: PrismaTransactionClient,
  tenantId: string,
  sourceType: RetentionSourceType,
  sourceId: string
): Promise<ResolvedSource> {
  if (sourceType === 'SUPPLIER_INVOICE') {
    return resolveSupplierInvoiceSource(tx, tenantId, sourceId);
  }
  if (sourceType === 'PROGRESS_STATEMENT') {
    return resolveProgressStatementSource(tx, tenantId, sourceId);
  }
  // Inatteignable tant que `RetentionSourceType` ne porte que ces deux valeurs.
  // Une troisième nature ajoutée au schéma sans passer ici doit crier, pas
  // écrire une retenue sans tiers.
  throw badRequest('Nature de pièce inconnue pour une retenue de garantie');
}

// ---------------------------------------------------------------------------
// A. Poser une retenue
// ---------------------------------------------------------------------------

/** Voir `CreateRetentionTx` dans `./types-lot4-retentions.ts`. */
export const createRetentionTx: CreateRetentionTx = async (tx, tenantId, params) => {
  // LE TAUX D'ABORD, avant toute lecture de pièce : un taux absurde se refuse
  // sans aller interroger la base.
  //
  // Arrondi à DEUX DÉCIMALES (`roundPercent`), parce que c'est un pourcentage.
  // Le contrôle porte sur la valeur arrondie, celle qui sera stockée et
  // réaffichée : un taux de 0,004 % arrondi à 0,00 % produirait une retenue
  // dont le taux affiché serait nul.
  const ratePercent = roundPercent(params.ratePercent);
  if (!(ratePercent > 0) || !(ratePercent < 100)) {
    // Cent pour cent n'est pas une garantie, c'est un non-paiement ; zéro n'est
    // pas une retenue. Les deux bornes sont exclues.
    throw badRequest('Le taux de retenue doit être strictement compris entre 0 et 100');
  }

  if (!params.plannedReleaseDate || Number.isNaN(new Date(params.plannedReleaseDate).getTime())) {
    // Une retenue sans échéance prévue est une retenue qu'on oublie, et c'est
    // précisément ce que la cliente veut éviter (contrat).
    throw badRequest('La date de libération prévue est obligatoire');
  }

  const source = await resolveSource(tx, tenantId, params.sourceType, params.sourceId);

  // UNE SEULE RETENUE PAR PIÈCE — vérifiée AVANT toute écriture. En PostgreSQL
  // une commande en échec condamne toute la transaction : « tenter la création
  // puis rattraper le P2002 » interrogerait une transaction morte (voir
  // l'en-tête de `appendThirdPartyMovementTx`, où le défaut a réellement eu
  // lieu). La contrainte `@@unique([sourceType, sourceId])` reste le filet pour
  // une collision réellement concurrente ; ce n'est pas elle qui porte la
  // discipline, et son message brut ne doit jamais remonter tel quel.
  //
  // Lue avec `tenantId` plutôt que par la clé unique composite : l'unicité en
  // base est globale, mais une lecture sans filtre de tenant est précisément ce
  // que la garde multi-tenant surveille. Les `sourceId` étant des UUID, une
  // collision inter-tenant n'existe pas en pratique.
  const existing = await tx.retentionGuarantee.findFirst({
    where: { tenantId, sourceType: params.sourceType, sourceId: params.sourceId },
    select: { id: true }
  });
  if (existing) {
    throw conflict('Une retenue de garantie a déjà été posée sur cette pièce');
  }

  // LE MONTANT EST DÉRIVÉ, JAMAIS SAISI (principe P-4). Le contrat n'accepte
  // aucun montant en entrée, et le schéma Zod est `.strict()` : un corps qui en
  // enverrait un est refusé, pas silencieusement ignoré.
  const baseAmount = source.baseAmount;
  const amount = roundMoneyXof((baseAmount * ratePercent) / 100);
  if (amount <= 0) {
    // Une retenue de zéro franc n'est pas une retenue, et la laisser passer
    // créerait une écriture vide que `postDocumentEntryTx` accepterait sans
    // rien dire.
    throw badRequest('Le montant retenu est nul après arrondi — la retenue ne serait pas une retenue');
  }

  // On ne retient jamais plus qu'il ne reste à payer : au-delà, la retenue ne
  // garantit plus rien, elle réclame. Le contrôle ne s'applique qu'aux pièces
  // dont le reste dû est calculable — voir `ResolvedSource.remainingPayable`.
  if (source.remainingPayable !== undefined && amount > source.remainingPayable) {
    throw conflict(
      `La retenue de ${amount} dépasse ce qui reste à payer sur cette pièce (${source.remainingPayable}) — elle ne garantirait plus rien`
    );
  }

  const accounts = await resolveRetentionAccounts(tx, tenantId, source.entryDate, source.payableAccountNumber);

  const retention: any = await tx.retentionGuarantee.create({
    data: {
      tenantId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      thirdPartyAccountId: source.thirdPartyAccountId,
      // Recopié depuis la pièce source plutôt que rejoint (voir le modèle) :
      // une lecture « les retenues de ce chantier » n'a pas à connaître les
      // deux chemins, celui de la facture et celui du marché.
      siteId: source.siteId,
      baseAmount,
      ratePercent,
      amount,
      currency: source.currency,
      plannedReleaseDate: params.plannedReleaseDate,
      status: 'HELD',
      createdByUserId: params.createdByUserId
    }
  });

  // RECLASSEMENT : ce qu'on doit au tiers (401/402) diminue, ce qu'on détient
  // en garantie (4047) augmente. Aucune ligne de charge, aucun compte de
  // trésorerie : ni le coût ni la caisse ne bougent.
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: source.entryDate,
    reference: `RET-${retention.id}`,
    description: `Retenue de garantie — ${source.sourceLabel} — ${source.thirdPartyLabel}`,
    documentType: 'RETENTION_HELD',
    documentId: retention.id,
    lines: [
      {
        accountId: accounts.payableAccountId,
        debit: amount,
        label: `Retenue de garantie — ${source.thirdPartyLabel}`
      },
      {
        accountId: accounts.retentionAccountId,
        credit: amount,
        label: `Retenue de garantie — ${source.sourceLabel}`
      }
    ]
  });

  // Compte de tiers : ce qu'on lui doit MAINTENANT diminue d'autant —
  // `settled`, qui soustrait du solde. La somme ne lui est pas retirée, elle
  // est détenue : elle remontera à la libération.
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: source.thirdPartyAccountId,
    tenantId,
    // `ADJUSTMENT` et non `PAYMENT` : rien n'a été réglé. Un `PAYMENT` ferait
    // lire ce mouvement comme une sortie d'argent dans tout relevé de tiers.
    type: 'ADJUSTMENT',
    settled: amount,
    label: `Retenue de garantie — ${source.sourceLabel}`,
    sourceType: 'RETENTION_HELD',
    sourceId: retention.id,
    movementDate: source.entryDate
  });
  if (!movement) {
    throw notFound('Compte de tiers introuvable pour cette retenue');
  }

  await tx.retentionGuarantee.update({
    where: { id: retention.id },
    data: { heldJournalEntryId: entry.entryId }
  });

  // AUCUNE `costAllocation` n'a été écrite, modifiée ni annulée par cette
  // fonction. Le coût du chantier est exactement celui d'avant.

  return readRetentionRecord(tx, tenantId, retention.id);
};

// ---------------------------------------------------------------------------
// B. Libérer une retenue
// ---------------------------------------------------------------------------

/** Voir `ReleaseRetentionTx` dans `./types-lot4-retentions.ts`. */
export const releaseRetentionTx: ReleaseRetentionTx = async (tx, tenantId, retentionId, releasedByUserId) => {
  const retention: any = await tx.retentionGuarantee.findFirst({ where: { id: retentionId, tenantId } });
  if (!retention) {
    throw notFound('Retenue de garantie introuvable');
  }
  if (retention.status !== 'HELD') {
    throw conflict('Cette retenue de garantie a déjà été libérée');
  }

  // PAS DE CONTRÔLE DE DATE, et c'est délibéré (contrat) : rien n'interdit de
  // rendre l'argent plus tôt que prévu, et bloquer obligerait à mentir sur la
  // date prévue pour contourner.
  const releasedAt = new Date();

  const source = await resolveSource(tx, tenantId, retention.sourceType, retention.sourceId);
  const accounts = await resolveRetentionAccounts(tx, tenantId, releasedAt, source.payableAccountNumber);
  const amount = roundMoneyXof(toAmountOrZero(retention.amount));

  // L'ÉCRITURE INVERSE, à l'identique et dans l'autre sens. Nature
  // `RETENTION_RELEASED` : la pose porte déjà `RETENTION_HELD` sur le même
  // identifiant de pièce, et `postDocumentEntryTx` refuse deux écritures pour
  // un même couple (nature, pièce).
  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: releasedAt,
    reference: `RET-LIB-${retention.id}`,
    description: `Libération de retenue de garantie — ${source.sourceLabel} — ${source.thirdPartyLabel}`,
    documentType: 'RETENTION_RELEASED',
    documentId: retention.id,
    lines: [
      {
        accountId: accounts.retentionAccountId,
        debit: amount,
        label: `Libération de retenue — ${source.sourceLabel}`
      },
      {
        accountId: accounts.payableAccountId,
        credit: amount,
        label: `Libération de retenue — ${source.thirdPartyLabel}`
      }
    ]
  });

  // Ce qu'on doit au tiers remonte exactement d'où il était descendu.
  //
  // AUCUN RÈGLEMENT N'EST CRÉÉ ICI : libérer n'est pas payer. Le tiers devient
  // créancier, et il se paie ensuite par le chemin ordinaire — règlement
  // fournisseur (lot 2) ou règlement de tâcheron (sous-lot 4).
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: retention.thirdPartyAccountId,
    tenantId,
    type: 'ADJUSTMENT',
    billed: amount,
    label: `Libération de retenue — ${source.sourceLabel}`,
    sourceType: 'RETENTION_RELEASED',
    sourceId: retention.id,
    movementDate: releasedAt
  });
  if (!movement) {
    throw notFound('Compte de tiers introuvable pour cette retenue');
  }

  // Mise à jour CONDITIONNELLE, même discipline qu'à toute validation depuis le
  // lot 2 : si une autre transaction a libéré cette même retenue entre notre
  // lecture et cet instant, `count` vaut 0 et on abandonne — l'écriture et le
  // mouvement créés ici repartent avec le rollback, rien ne subsiste en double.
  const updateResult = await tx.retentionGuarantee.updateMany({
    where: { id: retention.id, tenantId, status: 'HELD' },
    data: {
      status: 'RELEASED',
      releasedAt,
      releasedByUserId,
      releasedJournalEntryId: entry.entryId
    }
  });
  if (updateResult.count !== 1) {
    throw conflict("Cette retenue de garantie vient d'être libérée par ailleurs");
  }

  return readRetentionRecord(tx, tenantId, retention.id);
};

// ---------------------------------------------------------------------------
// C. Liste
// ---------------------------------------------------------------------------

/** Voir `ListRetentions` dans `./types-lot4-retentions.ts`. */
export const listRetentions: ListRetentions = async (tenantId, filters) => {
  const rows = await prisma.retentionGuarantee.findMany({
    where: {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.siteId ? { siteId: filters.siteId } : {}),
      ...(filters.thirdPartyAccountId ? { thirdPartyAccountId: filters.thirdPartyAccountId } : {}),
      // « Ne garde que les retenues dont la date prévue est passée » (contrat).
      // Strictement antérieure : une retenue dont l'échéance tombe exactement à
      // la borne n'est pas encore en retard.
      ...(filters.dueBefore ? { plannedReleaseDate: { lt: filters.dueBefore } } : {})
    },
    include: { thirdPartyAccount: { select: { label: true } } },
    // La plus ancienne échéance d'abord : c'est l'ordre de la liste d'actions,
    // celui du tiers qui attend depuis le plus longtemps.
    orderBy: [{ plannedReleaseDate: 'asc' }, { createdAt: 'asc' }]
  });

  const labels = await resolveLabels(prisma as unknown as RetentionReadClient, tenantId, rows as any);
  return (rows as Array<Record<string, any>>).map(row => toRetentionRecord(row, labels));
};

// ---------------------------------------------------------------------------
// D. Détail
// ---------------------------------------------------------------------------

/** Voir `GetRetention` dans `./types-lot4-retentions.ts`. */
export const getRetention: GetRetention = async (tenantId, retentionId) =>
  readRetentionRecord(prisma as unknown as RetentionReadClient, tenantId, retentionId);

// ---------------------------------------------------------------------------
// E. Ce qui est détenu, en un coup d'œil
// ---------------------------------------------------------------------------

/**
 * Voir `GetRetentionSummary` dans `./types-lot4-retentions.ts`.
 *
 * Trois agrégations SQL, jamais une somme en mémoire sur une liste chargée —
 * principe déjà posé par `sumSiteActualCost` et la balance clients du lot 1, où
 * le banc de charge avait mesuré un facteur trente entre les deux approches.
 */
export const getRetentionSummary: GetRetentionSummary = async (tenantId, filters) => {
  const base = {
    tenantId,
    ...(filters?.siteId ? { siteId: filters.siteId } : {})
  };
  const maintenant = new Date();

  const [held, released, overdue] = await Promise.all([
    prisma.retentionGuarantee.aggregate({ where: { ...base, status: 'HELD' }, _sum: { amount: true } }),
    prisma.retentionGuarantee.aggregate({ where: { ...base, status: 'RELEASED' }, _sum: { amount: true } }),
    // LE SEUL CHIFFRE QUI APPELLE UNE ACTION (contrat) : détenues dont la date
    // prévue est dépassée. Un tiers qui attend son argent au-delà de la date
    // convenue finit par le réclamer, et mieux vaut l'avoir vu avant lui.
    prisma.retentionGuarantee.aggregate({
      where: { ...base, status: 'HELD', plannedReleaseDate: { lt: maintenant } },
      _sum: { amount: true },
      _count: { _all: true }
    })
  ]);

  const summary: RetentionSummaryRecord = {
    totalHeld: roundMoneyXof(toAmountOrZero(held._sum?.amount)),
    totalReleased: roundMoneyXof(toAmountOrZero(released._sum?.amount)),
    overdueHeld: roundMoneyXof(toAmountOrZero(overdue._sum?.amount)),
    overdueCount: (overdue as any)._count?._all ?? 0,
    currency: DEFAULT_CURRENCY
  };

  return summary;
};
