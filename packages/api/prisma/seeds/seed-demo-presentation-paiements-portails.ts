/**
 * Jeu de données de présentation — paiements, passerelle en ligne, déclarations,
 * pénalités et portail locataire.
 *
 * Suite de `seed-demo-presentation-locative.ts` : une fois les baux `BAIL-2026-00NN`
 * en place, ce script fait vivre l'encaissement sur QUATRE baux (0009, 0016, 0024,
 * 0026), plus la déclaration de 0020 (rejet) et les pénalités de 0021, puis ouvre le
 * portail locataire de deux locataires.
 *
 *   BAIL-2026-0009  Armand Koffi        loyer de novembre payé EN LIGNE, ancienne déclaration
 *                                       rejetée (doublon), déclaration en attente conservée
 *   BAIL-2026-0016  Marie-Laure N'Guessan paiement Mobile Money refusé, paiement en ligne
 *                                       annulé, espèces partiellement affectées (reliquat),
 *                                       liens de paiement révoqué et actif
 *   BAIL-2026-0020  (studio)            sa déclaration en attente est REJETÉE avec motif
 *   BAIL-2026-0021  Kouadio Fofana      pénalité remise à la main + justificatif PDF
 *   BAIL-2026-0024  Christelle Aké      chèque impayé (paiement ANNULÉ), paiement en ligne
 *                                       EXPIRÉ, déclaration APPROUVÉE (acompte), solde réglé
 *                                       par un lien de paiement (lien « utilisé »)
 *   BAIL-2026-0026  Blandine Zadi       paiement en ligne ÉCHOUÉ, déclaration APPROUVÉE,
 *                                       paiement en ligne réussi sur le trimestre suivant
 *
 * Partis pris, hérités des autres scripts de présentation :
 *
 *   1. **Tout passe par les services de l'application** : paiements, affectations,
 *      déclarations, pénalités, réglages de la passerelle, caisse, lien de paiement,
 *      checkout du simulateur PaySecureHub puis rapprochement par `reconcileCheckout`.
 *      Seules quelques DATES sont recalées en base après coup (paiement refusé, ancienne
 *      déclaration, paiement expiré) parce que les services datent tout « maintenant ».
 *
 *   2. **Aucun envoi sortant, aucun appel à une vraie passerelle.** SMTP, SendGrid, Twilio,
 *      WaSender et SMS sont coupés avant tout import. Le mode de la passerelle est
 *      SIMULATOR, jamais LIVE : le « paiement » est un clic simulé, rapproché par les mêmes
 *      fonctions que l'IPN. Les « Error sending email » du journal sont donc normales : ce
 *      sont des lignes FAILED du journal des notifications.
 *
 *   3. **Idempotent.** Chaque élément est retrouvé par sa clé naturelle (clé d'idempotence
 *      du paiement, référence de la déclaration, statut du checkout, état des liens…) avant
 *      d'être créé ; une deuxième exécution ne crée rien.
 *
 *   4. **Une étape qui échoue n'arrête pas les autres.** Le bilan donne, par table et par
 *      statut, ce que CETTE exécution a créé.
 *
 * Écrit UNIQUEMENT sur l'agence cible, et pour les paiements, affectations, déclarations,
 * pénalités et liens de paiement, UNIQUEMENT sur les baux listés ci-dessus.
 *
 * Usage : npm run db:seed:presentation-paiements -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi. Vides plutôt que
// supprimées : `dotenv` ne recharge pas une clé déjà présente, il reposerait sinon la vraie valeur.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
for (const cle of [
  'SENDGRID_API_KEY',
  'EMAIL_SERVICE_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'WASENDER_API_KEY',
  'ORANGE_SMS_CLIENT_ID',
  'ORANGE_SMS_CLIENT_SECRET'
]) {
  process.env[cle] = '';
}
process.env.SMS_PROVIDER = 'disabled';

import { promises as fs } from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaClient, RentalPaymentMethod, RentalPaymentStatus } from '@prisma/client';

import {
  createPayment,
  allocatePayment,
  updatePaymentStatus,
  updatePaymentStatusTx
} from '../../src/services/rental-payment-service';
import {
  approvePaymentDeclaration,
  rejectPaymentDeclaration
} from '../../src/services/rental-payment-declaration-service';
import { updatePenalty, uploadPenaltyJustification } from '../../src/services/rental-penalty-service';
import { TenantPortalService } from '../../src/services/tenant-portal-service';
import { flushAuditEvents } from '../../src/services/audit-service';
import {
  getPaymentGatewaySettings,
  testPaymentGatewayConnection,
  updatePaymentGatewaySettings,
  updatePaymentGatewaySettingsSchema
} from '../../src/lib/payment-gateway/settings';
import { paymentGatewaySimulatorAvailable } from '../../src/lib/payment-gateway/config';
import { reconcileCheckoutByCode, recordSimulatedOutcome, startCheckout } from '../../src/lib/payment-gateway/checkout';
import {
  createInstallmentPaymentLink,
  getInstallmentPaymentByToken,
  listInstallmentPaymentLinks,
  revokeInstallmentPaymentLink,
  startInstallmentPaymentByToken
} from '../../src/lib/payment-gateway/installment-payment-link';
import { sendInstallmentPaymentLink } from '../../src/lib/payment-gateway/installment-payment-link-send';
import { DENOMINATIONS, closeSession, getCurrentSession, openSession } from '../../src/lib/cash-sessions/service';
import {
  getAgencyFinanceSettings,
  updateAgencyFinanceSettings,
  updateFinanceSettingsSchema
} from '../../src/lib/settings/finance-settings';
import { isDirectLeaseTx, syncDirectRentPaymentEntryTx } from '../../src/lib/finance/rental-direct-ledger';
import { requireTenantPortalAccess } from '../../src/middleware/tenant-portal-access';
import { comparePassword, hashPassword } from '../../src/utils/password-utils';
import { getProjectRoot } from '../../src/utils/project-root';
import { runWithTenantContext } from '../../src/utils/tenant-context';
import { PACK_TEST_PASSWORD } from './pack-test-tenants';

const prisma = new PrismaClient({ log: [] });

const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const AUJOURDHUI = new Date();
AUJOURDHUI.setHours(0, 0, 0, 0);

/** Jour `AAAA-MM-JJ` à J-n (UTC, comme `resolvePaymentDate`). */
function jour(ilYA: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ilYA);
  return d.toISOString().slice(0, 10);
}

/** Instant à J-n à l'heure donnée (heure locale). */
function ilYA(jours: number, heure = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  d.setHours(heure, minute, 0, 0);
  return d;
}

/** Reste dû d'une échéance : `total_due` n'existe pas en colonne, c'est un calcul. */
function montantDu(e: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}): number {
  return (
    Number(e.amount_rent) +
    Number(e.amount_service) +
    Number(e.amount_other_fees) +
    Number(e.penalty_amount) -
    Number(e.amount_paid)
  );
}

// ───────────────────────────────────────────────────────────── étapes et bilan

const bilan: { etape: string; ok: number; echecs: string[] }[] = [];
const echecsGlobaux: string[] = [];
let compteurEtape = 0;

function messageDe(e: unknown): string {
  return e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
}

/** Une étape qui échoue est notée au bilan ; les autres continuent. */
async function etape(nom: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n── ${nom}`);
  compteurEtape = 0;
  try {
    // Dans le contexte d'agence d'une requête (comme `requireTenantAccess`) : sans lui, les e-mails
    // métier ne sont pas écrits au journal des notifications et le garde-fou Prisma ne voit rien.
    await runWithTenantContext({ tenantId: TENANT_ID, userId: acteur, isSuperAdmin: false }, fn);
    bilan.push({ etape: nom, ok: compteurEtape, echecs: [] });
  } catch (e) {
    const message = messageDe(e);
    console.log(`  ⨯ étape interrompue : ${message}`);
    bilan.push({ etape: nom, ok: compteurEtape, echecs: [message] });
    echecsGlobaux.push(`${nom} : ${message}`);
  }
}

/** Tente une écriture. `false` renvoyé par `fn` = déjà en place. Journalise, ne lève jamais. */
async function essaie(libelle: string, fn: () => Promise<boolean | void>): Promise<boolean> {
  try {
    const cree = (await fn()) !== false;
    console.log(`  ${cree ? '+' : '='} ${libelle}${cree ? '' : ' (déjà en place)'}`);
    if (cree) compteurEtape++;
    return cree;
  } catch (e) {
    const message = messageDe(e);
    console.log(`  ⨯ ${libelle} — ${message}`);
    echecsGlobaux.push(`${libelle} : ${message}`);
    return false;
  }
}

// ─────────────────────────────────────────────────────────── baux et échéances

let acteur = '';

interface Bail {
  id: string;
  numero: string;
  bien: string;
  clientId: string;
  userId: string | null;
  email: string;
  nom: string;
  telephone: string;
}

/** Le bail par son numéro, en vérifiant le bien : on n'écrit jamais sur un autre jeu de données. */
async function charger(numero: string, refBien: string): Promise<Bail> {
  const l = await prisma.rentalLease.findFirst({
    where: { tenant_id: TENANT_ID, lease_number: numero },
    select: {
      id: true,
      lease_number: true,
      primary_renter_client_id: true,
      property: { select: { internalReference: true } },
      primaryRenter: { select: { userId: true, user: { select: { email: true, fullName: true } } } }
    }
  });
  if (!l) throw new Error(`${numero} introuvable : lancer d'abord db:seed:presentation-locative`);
  if (l.property.internalReference !== refBien) {
    throw new Error(`${numero} porte ${l.property.internalReference} et non ${refBien} : bail ignoré`);
  }
  const email = l.primaryRenter?.user?.email ?? '';
  const contact = email
    ? await prisma.crmContact.findFirst({
        where: { tenantId: TENANT_ID, email: { equals: email, mode: 'insensitive' } },
        select: { phonePrimary: true },
        orderBy: { createdAt: 'asc' }
      })
    : null;
  return {
    id: l.id,
    numero: l.lease_number,
    bien: refBien,
    clientId: l.primary_renter_client_id,
    userId: l.primaryRenter?.userId ?? null,
    email,
    nom: l.primaryRenter?.user?.fullName ?? email,
    telephone: contact?.phonePrimary ?? '0707000000'
  };
}

interface Echeance {
  id: string;
  annee: number;
  mois: number;
  statut: string;
  du: number;
}

const SELECTION_ECHEANCE = {
  id: true,
  period_year: true,
  period_month: true,
  status: true,
  amount_rent: true,
  amount_service: true,
  amount_other_fees: true,
  penalty_amount: true,
  amount_paid: true
} as const;

function enEcheance(r: {
  id: string;
  period_year: number;
  period_month: number;
  status: string;
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}): Echeance {
  return { id: r.id, annee: r.period_year, mois: r.period_month, statut: r.status, du: montantDu(r) };
}

/** La `rang`-ième échéance échue en partant de la plus récente (0 = la dernière échue). Indépendant du statut. */
async function echue(leaseId: string, rang = 0): Promise<Echeance> {
  const r = await prisma.rentalInstallment.findFirst({
    where: { tenant_id: TENANT_ID, lease_id: leaseId, status: { not: 'CANCELED' }, due_date: { lt: AUJOURDHUI } },
    orderBy: { due_date: 'desc' },
    skip: rang,
    select: SELECTION_ECHEANCE
  });
  if (!r) throw new Error(`Aucune échéance échue (rang ${rang}) sur le bail ${leaseId}`);
  return enEcheance(r);
}

/** Les `n` prochaines échéances à venir, de la plus proche à la plus lointaine. Indépendant du statut. */
async function aVenir(leaseId: string, n: number): Promise<Echeance[]> {
  const rows = await prisma.rentalInstallment.findMany({
    where: { tenant_id: TENANT_ID, lease_id: leaseId, status: { not: 'CANCELED' }, due_date: { gte: AUJOURDHUI } },
    orderBy: { due_date: 'asc' },
    take: n,
    select: SELECTION_ECHEANCE
  });
  if (rows.length < n) throw new Error(`Moins de ${n} échéances à venir sur le bail ${leaseId}`);
  return rows.map(enEcheance);
}

async function echeanceParId(id: string): Promise<Echeance> {
  const r = await prisma.rentalInstallment.findFirstOrThrow({
    where: { id, tenant_id: TENANT_ID },
    select: SELECTION_ECHEANCE
  });
  return enEcheance(r);
}

// ─────────────────────────────────────────────────────────────── PDF fictifs

async function genererPdf(titre: string, lignes: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(titre, { x: 56, y: 760, size: 18, font: gras, color: rgb(0.1, 0.2, 0.5) });
  let y = 715;
  for (const l of lignes) {
    page.drawText(l, { x: 56, y, size: 11, font: normal, color: rgb(0.15, 0.15, 0.15) });
    y -= 22;
  }
  page.drawText('Document fictif — jeu de données de démonstration ImmoTopia.', {
    x: 56,
    y: 60,
    size: 9,
    font: normal,
    color: rgb(0.5, 0.5, 0.5)
  });
  return Buffer.from(await pdf.save());
}

/** Un fichier téléversé, tel que le service le reçoit de multer (il n'en lit que `buffer` et `originalname`). */
function fichierTeleverse(buffer: Buffer, nom: string): Express.Multer.File {
  return {
    buffer,
    originalname: nom,
    mimetype: 'application/pdf',
    size: buffer.length,
    fieldname: 'proof',
    encoding: '7bit'
  } as unknown as Express.Multer.File;
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`;

/**
 * Joint une capture PDF fictive à une déclaration qui n'en a pas (celles créées par le script des baux),
 * au même endroit et sous le même nom que le portail (`uploads/portal/payments/<agence>/`, jamais servi
 * en statique : l'agence la lit par la route authentifiée « preuve »).
 */
async function completerPreuve(declarationId: string, numeroBail: string): Promise<boolean> {
  const d = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: TENANT_ID },
    select: { proof_file_url: true, amount: true, reference: true, payment_date: true, mobile_operator: true }
  });
  if (!d || d.proof_file_url) return false;
  const operateur = d.mobile_operator ? ` ${d.mobile_operator === 'ORANGE' ? 'Orange Money' : d.mobile_operator}` : '';
  const pdf = await genererPdf(`Reçu de transfert${operateur}`, [
    `Bénéficiaire : agence — ${numeroBail}`,
    `Montant : ${fmt(Number(d.amount))}`,
    `Date : ${d.payment_date.toISOString().slice(0, 10)}`,
    `Référence : ${d.reference ?? '—'}`
  ]);
  const dossier = path.join(getProjectRoot(), 'uploads', 'portal', 'payments', TENANT_ID);
  await fs.mkdir(dossier, { recursive: true });
  const fichier = `payment-proof-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;
  await fs.writeFile(path.join(dossier, fichier), pdf);
  await prisma.rentalPaymentDeclaration.update({
    where: { id: declarationId },
    data: { proof_file_url: `/uploads/portal/payments/${TENANT_ID}/${fichier}` }
  });
  return true;
}

// ───────────────────────────────────────────────────────── paiement en ligne

type Issue = 'SUCCESS' | 'FAILED' | 'CANCELED';

/**
 * Un paiement en ligne par le portail locataire, de bout en bout dans le simulateur :
 * création du checkout (`startCheckout`), choix de l'issue sur la page du simulateur
 * (`recordSimulatedOutcome`), puis rapprochement serveur-à-serveur (`reconcileCheckoutByCode`),
 * exactement le chemin de l'IPN. Renvoie faux si ce paiement existe déjà.
 */
async function enLigne(b: Bail, installmentIds: string[], issue: Issue, message?: string): Promise<boolean> {
  const deja = await prisma.onlinePaymentCheckout.findFirst({
    where: {
      tenantId: TENANT_ID,
      leaseId: b.id,
      secureLinkId: null,
      installmentIds: { equals: installmentIds },
      status: issue
    },
    select: { id: true }
  });
  if (deja) return false;

  const dto = await startCheckout(TENANT_ID, b.clientId, b.id, installmentIds, b.userId ?? undefined);
  const ligne = await prisma.onlinePaymentCheckout.findFirstOrThrow({ where: { id: dto.id, tenantId: TENANT_ID } });
  await recordSimulatedOutcome(ligne, issue);
  const fin = await reconcileCheckoutByCode(TENANT_ID, ligne.codePaiement);
  if (fin.status !== issue) throw new Error(`le checkout est ${fin.status} au lieu de ${issue}`);
  if (message) {
    // Le simulateur ne dit pas pourquoi : on renseigne le message que l'agrégateur renverrait.
    await prisma.onlinePaymentCheckout.update({ where: { id: fin.id }, data: { failureMessage: message } });
  }
  return true;
}

/**
 * Un paiement en ligne que le locataire n'a jamais terminé : EXPIRÉ au bout de 48 h.
 * `expireCheckout` n'est pas exportée par l'application ; on rejoue ici sa transaction à
 * l'identique (checkout PENDING -> EXPIRED, paiement -> CANCELED) après la dernière
 * vérification que fait la tâche planifiée. Le checkout est vieilli de 50 h pour que l'écran
 * montre une date d'ouverture crédible.
 */
async function enLigneExpire(b: Bail, installmentIds: string[]): Promise<boolean> {
  const deja = await prisma.onlinePaymentCheckout.findFirst({
    where: {
      tenantId: TENANT_ID,
      leaseId: b.id,
      secureLinkId: null,
      installmentIds: { equals: installmentIds },
      status: 'EXPIRED'
    },
    select: { id: true }
  });
  if (deja) return false;

  const dto = await startCheckout(TENANT_ID, b.clientId, b.id, installmentIds, b.userId ?? undefined);
  const vieux = new Date(Date.now() - 50 * 3600 * 1000);
  await prisma.onlinePaymentCheckout.update({ where: { id: dto.id }, data: { createdAt: vieux } });
  await prisma.rentalPayment.update({ where: { id: dto.paymentId }, data: { initiated_at: vieux, created_at: vieux } });
  await reconcileCheckoutByCode(TENANT_ID, dto.codePaiement); // dernière vérification : toujours en attente
  await prisma.$transaction(async tx => {
    const claim = await tx.onlinePaymentCheckout.updateMany({
      where: { id: dto.id, tenantId: TENANT_ID, status: 'PENDING' },
      data: { status: 'EXPIRED', failureMessage: "Le locataire n'a pas terminé le paiement dans les 48 h." }
    });
    if (claim.count === 1) await updatePaymentStatusTx(tx, TENANT_ID, dto.paymentId, RentalPaymentStatus.CANCELED);
  });
  return true;
}

// ───────────────────────────────────────────────────────────── déclarations

const portail = new TenantPortalService();

/** Déclare un paiement exactement comme le fait le locataire depuis son portail (avec une capture PDF). */
async function declarer(
  b: Bail,
  e: Echeance,
  d: {
    reference: string;
    montant: number;
    ilYAJours: number;
    methode: string;
    operateur?: string;
    notes: string;
    preuve: { titre: string; lignes: string[]; nom: string };
  }
) {
  const pdf = await genererPdf(d.preuve.titre, d.preuve.lignes);
  return portail.declarePayment(
    b.clientId,
    b.id,
    TENANT_ID,
    {
      amount: d.montant,
      paymentDate: jour(d.ilYAJours),
      paymentMethod: d.methode,
      mobileOperator: d.operateur,
      transactionPhone: b.telephone,
      reference: d.reference,
      installmentId: e.id,
      notes: d.notes
    },
    fichierTeleverse(pdf, d.preuve.nom)
  );
}

// ═════════════════════════════════════════════════════════════════════ ÉTAPES

/** 1. Passerelle de l'agence : PaySecureHub, simulateur, active, compte Mobile Money. */
async function seedPasserelle(): Promise<void> {
  console.log(`  Simulateur disponible sur ce serveur : ${paymentGatewaySimulatorAvailable ? 'oui' : 'NON'}`);
  if (!paymentGatewaySimulatorAvailable) {
    throw new Error(
      "Le mode simulateur est fermé sur ce serveur (production sans PAYMENT_GATEWAY_SIMULATOR=1) : à ajouter dans l'environnement"
    );
  }
  const compte = await prisma.treasuryAccount.findFirst({
    where: { tenantId: TENANT_ID, kind: 'MOBILE_MONEY', mmOperator: 'WAVE', isActive: true },
    select: { id: true, label: true, accountNumber: true }
  });
  if (!compte) throw new Error('Compte de trésorerie Mobile Money (Wave) introuvable');

  const actuel = await getPaymentGatewaySettings(TENANT_ID);
  await essaie(
    `passerelle PAYSECUREHUB · SIMULATEUR · active · compte ${compte.accountNumber} ${compte.label}`,
    async () => {
      if (actuel.mode === 'SIMULATOR' && actuel.isActive && actuel.treasuryAccountId === compte.id) return false;
      await updatePaymentGatewaySettings(
        TENANT_ID,
        updatePaymentGatewaySettingsSchema.parse({
          mode: 'SIMULATOR',
          isActive: true,
          treasuryAccountId: compte.id,
          feesPaidBy: 'CLIENT'
        })
      );
    }
  );
  await essaie('test de connexion de la passerelle (affiché dans les paramètres)', async () => {
    if (actuel.lastTest?.ok) return false;
    await testPaymentGatewayConnection(TENANT_ID);
  });
}

/** 7a. Réglages financiers de l'agence : on complète ce qui est vide, sans toucher aux honoraires. */
async function seedReglagesFinanciers(): Promise<void> {
  const s = await getAgencyFinanceSettings(TENANT_ID);
  const manque = {
    taxpayerNumber: s.taxpayerNumber ?? '2026-4817 B',
    ownerFundsAccountNumber: s.ownerFundsAccountNumber ?? '4731',
    managementFeeAccountNumber: s.managementFeeAccountNumber ?? '70611',
    vatCollectedAccountNumber: s.vatCollectedAccountNumber ?? '4432',
    cashShortageAccountNumber: s.cashShortageAccountNumber ?? '6588',
    cashSurplusAccountNumber: s.cashSurplusAccountNumber ?? '7588',
    withholdingAccountNumber: s.withholdingAccountNumber ?? '4478'
  };
  const vides = (Object.keys(manque) as (keyof typeof manque)[]).filter(k => s[k] === null);
  console.log(
    `  TVA ${s.vatRegistered ? `assujettie à ${s.vatRate} %` : 'non assujettie'} · honoraires ${
      s.managementFeeRate === null ? 'NON PARAMÉTRÉS (taux vide)' : `${s.managementFeeRate} % (${s.managementFeeMode})`
    } · pénalités reversées à : ${s.penaltyBeneficiary} · retenue à la source ${s.withholdingEnabled ? 'active' : 'inactive'}`
  );
  await essaie(`réglages financiers : ${vides.length} champ(s) vide(s) complété(s)`, async () => {
    if (vides.length === 0) return false;
    await updateAgencyFinanceSettings(TENANT_ID, updateFinanceSettingsSchema.parse({ ...s, ...manque }), acteur);
  });

  const regle = await prisma.rentalPenaltyRule.findFirst({ where: { tenant_id: TENANT_ID, is_active: true } });
  if (!regle) throw new Error("Aucune règle de pénalité active pour l'agence");
  console.log(
    `  Règle de pénalité : ${regle.mode} · taux ${Number(regle.rate)} · délai de grâce ${regle.grace_days} j · ` +
      `plafond ${regle.cap_amount === null ? 'aucun' : fmt(Number(regle.cap_amount))} · solde minimum ${
        regle.min_balance_to_apply === null ? 'aucun' : fmt(Number(regle.min_balance_to_apply))
      } -> complète`
  );
}

/**
 * Locataires dont le portail est ouvert : Armand Koffi (0009, à jour) et
 * Mamadou Diabaté (0011, deux mois de retard). Pas Kouadio Fofana (0021) : son
 * bail est suspendu, et le portail refuse tout locataire sans bail actif.
 */
const COMPTES_PORTAIL: [string, string][] = [
  ['BAIL-2026-0009', 'PRES-001'],
  ['BAIL-2026-0011', 'PRES-003']
];

/** 6. Comptes de connexion du portail locataire. */
async function seedComptesPortail(): Promise<void> {
  for (const [numero, ref] of COMPTES_PORTAIL) {
    const b = await charger(numero, ref);
    await essaie(`compte portail ${b.nom} <${b.email}>`, async () => {
      if (!b.userId) throw new Error('Le locataire principal n’a pas de compte utilisateur');
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: b.userId },
        select: { passwordHash: true, isActive: true, emailVerified: true }
      });
      const mdpOk = u.passwordHash ? await comparePassword(PACK_TEST_PASSWORD, u.passwordHash) : false;
      const client = await prisma.tenantClient.findUniqueOrThrow({
        where: { id: b.clientId },
        select: { ownerPortalEnabled: true }
      });
      if (mdpOk && u.isActive && u.emailVerified && client.ownerPortalEnabled) return false;
      await prisma.user.update({
        where: { id: b.userId },
        data: {
          ...(mdpOk ? {} : { passwordHash: await hashPassword(PACK_TEST_PASSWORD) }),
          isActive: true,
          emailVerified: true
        }
      });
      // « Portail activé » : le même témoin que pose `pack-history` sur les locataires ouverts.
      await prisma.tenantClient.update({ where: { id: b.clientId }, data: { ownerPortalEnabled: true } });
    });
  }
}

/** 0009 — Armand Koffi : à jour. Novembre payé en ligne, ancienne déclaration rejetée, une en attente. */
async function seedArmand(): Promise<void> {
  const b = await charger('BAIL-2026-0009', 'PRES-001');
  const [nov, dec] = await aVenir(b.id, 2);

  await essaie(`${b.numero} · loyer ${nov.mois}/${nov.annee} payé EN LIGNE (simulateur, succès)`, async () => {
    const soldee = (await echeanceParId(nov.id)).statut === 'PAID';
    const deja = await prisma.onlinePaymentCheckout.findFirst({
      where: { tenantId: TENANT_ID, leaseId: b.id, installmentIds: { has: nov.id }, status: 'SUCCESS' },
      select: { id: true }
    });
    if (deja || soldee) return false;
    return enLigne(b, [nov.id], 'SUCCESS');
  });

  // Ancienne déclaration, rejetée : un second envoi du même loyer de septembre.
  const sept = await echue(b.id, 1);
  const refDoublon = `OM-PRES-${b.id.slice(0, 8)}-DOUBLON`;
  await essaie(`${b.numero} · ancienne déclaration REJETÉE (doublon, loyer ${sept.mois}/${sept.annee})`, async () => {
    const existe = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, reference: refDoublon },
      select: { id: true }
    });
    if (existe) return false;
    const ligne = await prisma.rentalInstallment.findFirstOrThrow({
      where: { id: sept.id, tenant_id: TENANT_ID },
      select: { amount_rent: true, amount_service: true }
    });
    const montant = Number(ligne.amount_rent) + Number(ligne.amount_service);
    const d = await declarer(b, sept, {
      reference: refDoublon,
      montant,
      ilYAJours: 50,
      methode: 'MOBILE_MONEY',
      operateur: 'ORANGE',
      notes: 'Je renvoie la capture de mon transfert Orange Money pour le loyer de septembre.',
      preuve: {
        titre: 'Reçu de transfert Orange Money',
        lignes: [`Bénéficiaire : agence — ${b.numero}`, `Montant : ${fmt(montant)}`, `Référence : ${refDoublon}`],
        nom: 'recu-orange-money-septembre.pdf'
      }
    });
    await rejectPaymentDeclaration(
      TENANT_ID,
      d.id,
      acteur,
      `Doublon : le loyer de septembre a déjà été encaissé (virement du 05/${String(sept.mois).padStart(2, '0')}). ` +
        "Aucune somme supplémentaire n'a été reçue sur le compte de l'agence."
    );
    // Les services datent tout « maintenant » : on recale la saisie et le rejet sur l'époque du loyer.
    await prisma.rentalPaymentDeclaration.update({
      where: { id: d.id },
      data: { created_at: ilYA(49, 9, 14), reviewed_at: ilYA(48, 11, 40) }
    });
  });

  // La déclaration en attente est conservée ; novembre étant payé en ligne, elle porte sur décembre.
  // (la preuve est jointe plus bas)
  await essaie(`${b.numero} · déclaration EN ATTENTE conservée (loyer ${dec.mois}/${dec.annee})`, async () => {
    const attente = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'PENDING' },
      select: { id: true, installment_id: true }
    });
    if (!attente) {
      await declarer(b, dec, {
        reference: `OM-PRES-${b.id.slice(0, 8)}-DEC`,
        montant: dec.du,
        ilYAJours: 2,
        methode: 'MOBILE_MONEY',
        operateur: 'ORANGE',
        notes: "Je règle décembre d'avance par Orange Money, capture jointe.",
        preuve: {
          titre: 'Reçu de transfert Orange Money',
          lignes: [`Bénéficiaire : agence — ${b.numero}`, `Montant : ${fmt(dec.du)}`],
          nom: 'recu-orange-money-decembre.pdf'
        }
      });
      return true;
    }
    const novSoldee = (await echeanceParId(nov.id)).statut === 'PAID';
    if (attente.installment_id === nov.id && novSoldee) {
      await prisma.rentalPaymentDeclaration.update({
        where: { id: attente.id },
        data: { installment_id: dec.id, notes: "Je règle décembre d'avance par Orange Money, capture jointe." }
      });
      return true;
    }
    return false;
  });

  await essaie(`${b.numero} · capture jointe à la déclaration en attente`, async () => {
    const attente = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'PENDING' },
      select: { id: true }
    });
    return attente ? completerPreuve(attente.id, b.numero) : false;
  });
}

/** 0016 — Marie-Laure N'Guessan : un mois en retard. Paiement refusé, paiement annulé, espèces partielles. */
async function seedMarieLaure(): Promise<void> {
  const b = await charger('BAIL-2026-0016', 'PRES-008');
  const oct = await echue(b.id);

  await essaie(`${b.numero} · paiement Mobile Money REFUSÉ (échec)`, async () => {
    const cle = `pres-e-mm-refuse-${b.id.slice(0, 8)}`;
    let p = await prisma.rentalPayment.findFirst({
      where: { tenant_id: TENANT_ID, idempotency_key: cle },
      select: { id: true, status: true }
    });
    if (!p) {
      const cree = await createPayment(
        TENANT_ID,
        {
          leaseId: b.id,
          renterClientId: b.clientId,
          method: RentalPaymentMethod.MOBILE_MONEY,
          amount: oct.du,
          currency: 'XOF',
          mmOperator: 'ORANGE',
          mmPhone: b.telephone,
          pspName: 'Orange Money',
          pspTransactionId: `TXN-REFUSE-${b.id.slice(0, 8)}`,
          pspReference: `REF-REFUSE-${b.id.slice(0, 8)}`,
          idempotencyKey: cle,
          paidAt: jour(4)
        },
        acteur
      );
      p = { id: cree.id, status: cree.status };
    }
    if (p.status !== RentalPaymentStatus.SUCCESS) return false;
    await updatePaymentStatus(TENANT_ID, p.id, RentalPaymentStatus.FAILED, acteur);
    const date = ilYA(4, 10, 12);
    await prisma.rentalPayment.update({
      where: { id: p.id },
      data: {
        succeeded_at: null,
        initiated_at: date,
        failed_at: date,
        raw_event_payload: {
          code: 'INSUFFICIENT_FUNDS',
          message: "Transaction refusée par l'opérateur : solde Orange Money insuffisant."
        }
      }
    });
  });

  await essaie(`${b.numero} · paiement en ligne ANNULÉ par le locataire (simulateur)`, () =>
    enLigne(b, [oct.id], 'CANCELED', "Paiement abandonné par le locataire sur la page de l'opérateur.")
  );
}

/** 0026 — Blandine Zadi : paiement en ligne échoué, déclaration approuvée, puis paiement en ligne réussi. */
async function seedBlandine(): Promise<void> {
  const b = await charger('BAIL-2026-0026', 'PRES-022');
  const [janvier, avril] = await aVenir(b.id, 2);

  await essaie(
    `${b.numero} · paiement en ligne ÉCHOUÉ (trimestre ${janvier.mois}/${janvier.annee}, simulateur)`,
    async () => {
      if ((await echeanceParId(janvier.id)).statut === 'PAID') return false;
      return enLigne(b, [janvier.id], 'FAILED', 'Paiement refusé : plafond journalier Mobile Money dépassé.');
    }
  );

  await essaie(
    `${b.numero} · déclaration APPROUVÉE par le service (crée le paiement, trimestre ${janvier.mois}/${janvier.annee})`,
    async () => {
      const attente = await prisma.rentalPaymentDeclaration.findFirst({
        where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'PENDING' },
        select: { id: true }
      });
      if (!attente) return false;
      await approvePaymentDeclaration(
        TENANT_ID,
        attente.id,
        acteur,
        "Transfert retrouvé sur le relevé Orange Money de l'agence : montant et référence conformes."
      );
    }
  );

  await essaie(`${b.numero} · capture jointe à la déclaration approuvée`, async () => {
    const approuvee = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'APPROVED', proof_file_url: null },
      select: { id: true }
    });
    return approuvee ? completerPreuve(approuvee.id, b.numero) : false;
  });

  await essaie(
    `${b.numero} · paiement en ligne RÉUSSI (trimestre ${avril.mois}/${avril.annee}, payé d'avance)`,
    async () => {
      if ((await echeanceParId(avril.id)).statut === 'PAID') return false;
      return enLigne(b, [avril.id], 'SUCCESS');
    }
  );
}

/** 0024 — Christelle Aké : un trimestre en retard. Chèque impayé, paiement expiré, acompte, lien de paiement. */
async function seedChristelle(): Promise<void> {
  const b = await charger('BAIL-2026-0024', 'PRES-019');
  const aout = await echue(b.id);

  // Chèque : encaissé et affecté, puis retourné impayé par la banque -> paiement ANNULÉ, échéance rouverte.
  await essaie(`${b.numero} · chèque IMPAYÉ : paiement ANNULÉ avec motif`, async () => {
    const cle = `pres-e-cheque-${b.id.slice(0, 8)}`;
    let p = await prisma.rentalPayment.findFirst({
      where: { tenant_id: TENANT_ID, idempotency_key: cle },
      select: { id: true, status: true, allocations: { select: { id: true } } }
    });
    if (!p) {
      const cree = await createPayment(
        TENANT_ID,
        {
          leaseId: b.id,
          renterClientId: b.clientId,
          method: RentalPaymentMethod.CHECK,
          amount: aout.du,
          currency: 'XOF',
          pspName: 'Banque Atlantique CI',
          pspReference: `CHQ-0048213-${b.id.slice(0, 4).toUpperCase()}`,
          idempotencyKey: cle,
          paidAt: jour(8)
        },
        acteur
      );
      p = { id: cree.id, status: cree.status, allocations: [] };
    }
    if (p.status !== RentalPaymentStatus.SUCCESS) return false;
    if (p.allocations.length === 0) await allocatePayment(TENANT_ID, p.id, { installmentIds: [aout.id] }, acteur);
    await updatePaymentStatus(TENANT_ID, p.id, RentalPaymentStatus.CANCELED, acteur);
    // Aucun champ « motif d'annulation » dans l'application : il est gardé avec la charge brute du paiement.
    await prisma.rentalPayment.update({
      where: { id: p.id },
      data: {
        raw_event_payload: {
          motifAnnulation: 'Chèque n° 0048213 rejeté par la banque du locataire : provision insuffisante.',
          rejeteLe: jour(0)
        }
      }
    });
  });

  await essaie(`${b.numero} · paiement en ligne EXPIRÉ (48 h sans suite)`, async () => {
    if ((await echeanceParId(aout.id)).statut === 'PAID') return false;
    return enLigneExpire(b, [aout.id]);
  });

  // Acompte déclaré par le locataire, approuvé : l'échéance passe en « Partiel ».
  const refAcompte = `OM-PRES-${b.id.slice(0, 8)}-ACOMPTE`;
  await essaie(
    `${b.numero} · déclaration APPROUVÉE (acompte ${fmt(400000)}, échéance ${aout.mois}/${aout.annee} -> partielle)`,
    async () => {
      let decl = await prisma.rentalPaymentDeclaration.findFirst({
        where: { tenant_id: TENANT_ID, lease_id: b.id, reference: refAcompte },
        select: { id: true, status: true }
      });
      if (!decl) {
        const d = await declarer(b, aout, {
          reference: refAcompte,
          montant: 400000,
          ilYAJours: 3,
          methode: 'MOBILE_MONEY',
          operateur: 'ORANGE',
          notes: 'Acompte sur le loyer du trimestre en attendant le solde de mon client.',
          preuve: {
            titre: 'Reçu de transfert Orange Money',
            lignes: [`Bénéficiaire : agence — ${b.numero}`, `Montant : ${fmt(400000)}`, `Référence : ${refAcompte}`],
            nom: 'recu-orange-money-acompte.pdf'
          }
        });
        decl = { id: d.id, status: 'PENDING' };
      }
      if (decl.status !== 'PENDING') return false;
      await approvePaymentDeclaration(
        TENANT_ID,
        decl.id,
        acteur,
        `Acompte retrouvé sur le relevé Orange Money. Solde de ${fmt(aout.du - 400000)} à régler par lien de paiement.`
      );
    }
  );

  // Le solde est réglé par un lien de paiement : ouvert par le locataire, payé, donc « utilisé ».
  await essaie(`${b.numero} · lien de paiement UTILISÉ (solde réglé en ligne par le lien)`, async () => {
    const liens = await listInstallmentPaymentLinks(TENANT_ID, aout.id);
    if (liens.some(l => l.payment.status === 'SUCCESS')) return false;
    const { link } = await createInstallmentPaymentLink(TENANT_ID, aout.id, acteur);
    const ctx = { ip: '41.66.12.84', userAgent: 'seed-demo-presentation-paiements (simulateur)' };
    await getInstallmentPaymentByToken(link.token, ctx); // le locataire ouvre le lien
    await startInstallmentPaymentByToken(link.token, ctx); // puis clique sur « Payer »
    const ligne = await prisma.onlinePaymentCheckout.findFirstOrThrow({
      where: { tenantId: TENANT_ID, secureLinkId: link.id }
    });
    await recordSimulatedOutcome(ligne, 'SUCCESS');
    const fin = await reconcileCheckoutByCode(TENANT_ID, ligne.codePaiement);
    if (fin.status !== 'SUCCESS') throw new Error(`le paiement par lien est ${fin.status} au lieu de SUCCESS`);
  });
}

/** 0020 — studio : sa déclaration en attente est REJETÉE avec motif (le bail sera résilié par ailleurs). */
async function seedRejetStudio(): Promise<void> {
  const b = await charger('BAIL-2026-0020', 'PRES-014');
  const bail = await prisma.rentalLease.findFirstOrThrow({
    where: { id: b.id, tenant_id: TENANT_ID },
    select: { status: true }
  });
  const resilie = bail.status !== 'ACTIVE';
  const motifReleve =
    "Le transfert déclaré n'apparaît pas sur le relevé Orange Money de l'agence. " +
    'Merci de joindre une capture lisible, avec la référence de la transaction, et de déclarer à nouveau.';
  const motifResilie =
    "Bail résilié : l'échéance de novembre est annulée et aucun loyer n'est plus dû sur ce bail. " +
    'Si un transfert a bien été effectué, il sera restitué après vérification.';
  // Le bail est résilié par ailleurs : le motif naturel est alors la résiliation, pas le relevé.
  const motif = resilie ? motifResilie : motifReleve;

  await essaie(`${b.numero} · déclaration REJETÉE avec motif`, async () => {
    const attente = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'PENDING' },
      select: { id: true }
    });
    if (!attente) return false;
    await rejectPaymentDeclaration(TENANT_ID, attente.id, acteur, motif);
  });
  await essaie(`${b.numero} · motif de rejet aligné sur la résiliation du bail`, async () => {
    if (!resilie) return false;
    const rejetee = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, status: 'REJECTED', review_notes: motifReleve },
      select: { id: true }
    });
    if (!rejetee) return false;
    await prisma.rentalPaymentDeclaration.update({ where: { id: rejetee.id }, data: { review_notes: motifResilie } });
  });
}

/** 0021 — Kouadio Fofana : une pénalité remise à la main, avec justificatif PDF joint. */
async function seedPenalites(): Promise<void> {
  const b = await charger('BAIL-2026-0021', 'PRES-016');
  const penalites = await prisma.rentalPenalty.findMany({
    where: { tenant_id: TENANT_ID, installment: { lease_id: b.id } },
    orderBy: { installment: { due_date: 'asc' } },
    select: {
      id: true,
      amount: true,
      is_manual_override: true,
      override_reason: true,
      installment: { select: { period_month: true, period_year: true } }
    }
  });
  if (penalites.length === 0)
    throw new Error(`Aucune pénalité sur ${b.numero} : lancer d'abord db:seed:presentation-locative`);
  const cible = penalites[penalites.length - 1]; // la plus récente
  const periode = `${cible.installment.period_month}/${cible.installment.period_year}`;
  const calcule = Number(cible.amount);
  const remise = 20000;

  await essaie(`${b.numero} · pénalité ${periode} MODIFIÉE à la main : ${fmt(calcule)} -> ${fmt(remise)}`, async () => {
    if (cible.is_manual_override) return false;
    await updatePenalty(
      TENANT_ID,
      cible.id,
      remise,
      `Remise commerciale accordée après engagement écrit du locataire de régulariser l'arriéré sous trente jours.`,
      acteur
    );
  });

  await essaie(`${b.numero} · justificatif PDF joint à la pénalité ${periode}`, async () => {
    const actuelle = await prisma.rentalPenalty.findFirstOrThrow({
      where: { id: cible.id, tenant_id: TENANT_ID },
      select: { override_reason: true }
    });
    let deja = false;
    try {
      deja = Boolean(JSON.parse(actuelle.override_reason ?? '{}')?.justification);
    } catch {
      deja = false;
    }
    if (deja) return false;
    const pdf = await genererPdf('Justificatif de remise de pénalité', [
      `Bail : ${b.numero} — ${b.nom}`,
      `Échéance concernée : ${periode}`,
      `Pénalité calculée : ${fmt(calcule)}`,
      `Pénalité retenue après remise : ${fmt(remise)}`,
      'Motif : engagement écrit du locataire de régulariser son arriéré sous 30 jours.',
      'Accord de la direction de l’agence — pièce jointe au dossier du locataire.'
    ]);
    await uploadPenaltyJustification(
      TENANT_ID,
      cible.id,
      fichierTeleverse(pdf, 'justificatif-remise-penalite.pdf'),
      acteur
    );
  });
}

/** 0016 — liens de paiement de l'échéance en retard : un révoqué, un actif (l'envoi est neutralisé). */
async function seedLiensMarieLaure(): Promise<void> {
  const b = await charger('BAIL-2026-0016', 'PRES-008');
  const oct = await echue(b.id);

  let liens = await listInstallmentPaymentLinks(TENANT_ID, oct.id);
  if (liens.length === 0) {
    // La relance habituelle de l'agence : envoyer le lien. L'envoi est neutralisé, il échoue, et
    // l'application révoque alors elle-même le lien qu'elle venait de créer.
    await essaie(
      `${b.numero} · relance par lien de paiement (envoi neutralisé -> lien révoqué par le service)`,
      async () => {
        const r = await sendInstallmentPaymentLink(TENANT_ID, oct.id, acteur);
        console.log(`      résultat de l'envoi : ${r.sent ? 'envoyé' : `non envoyé (${r.reason})`}`);
        return r.sent; // rien n'est créé quand aucun canal n'est éligible
      }
    );
    liens = await listInstallmentPaymentLinks(TENANT_ID, oct.id);
  }
  await essaie(`${b.numero} · lien de paiement RÉVOQUÉ (échéance ${oct.mois}/${oct.annee})`, async () => {
    if (liens.some(l => l.status === 'REVOKED')) return false;
    const { link } = await createInstallmentPaymentLink(TENANT_ID, oct.id, acteur);
    await revokeInstallmentPaymentLink(TENANT_ID, oct.id, link.id, acteur);
  });
  await essaie(`${b.numero} · lien de paiement ACTIF (échéance ${oct.mois}/${oct.annee})`, async () => {
    liens = await listInstallmentPaymentLinks(TENANT_ID, oct.id);
    if (liens.some(l => l.status === 'ACTIVE')) return false;
    await createInstallmentPaymentLink(TENANT_ID, oct.id, acteur);
  });
}

/** 0016 — le locataire déclare avoir payé le solde de l'échéance par Wave : déclaration EN ATTENTE. */
async function seedDeclarationMarieLaure(): Promise<void> {
  const b = await charger('BAIL-2026-0016', 'PRES-008');
  const oct = await echue(b.id);
  const reference = `WAVE-PRES-${b.id.slice(0, 8)}-SOLDE`;
  await essaie(`${b.numero} · déclaration EN ATTENTE (solde ${fmt(oct.du)} payé par Wave)`, async () => {
    const existe = await prisma.rentalPaymentDeclaration.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: b.id, reference },
      select: { id: true }
    });
    if (existe || oct.du <= 0) return false;
    await declarer(b, oct, {
      reference,
      montant: oct.du,
      ilYAJours: 1,
      methode: 'MOBILE_MONEY',
      operateur: 'WAVE',
      notes: 'Je viens de régler le solde du loyer par Wave, capture jointe.',
      preuve: {
        titre: 'Reçu de paiement Wave',
        lignes: [`Bénéficiaire : agence — ${b.numero}`, `Montant : ${fmt(oct.du)}`, `Référence : ${reference}`],
        nom: 'recu-wave-solde.pdf'
      }
    });
  });
}

/** Billetage glouton d'un montant : { "10000": 19, "5000": 1, … }. */
function billetage(montant: number): Record<string, number> {
  const out: Record<string, number> = {};
  let reste = montant;
  for (const valeur of DENOMINATIONS) {
    const n = Math.floor(reste / valeur);
    if (n > 0) {
      out[String(valeur)] = n;
      reste -= n * valeur;
    }
  }
  if (reste !== 0) throw new Error(`Montant ${montant} impossible à rendre en billetage`);
  return out;
}

/** 7b. Session de caisse : ouverte, un encaissement en espèces, puis clôturée avec un petit écart justifié. */
async function seedCaisse(): Promise<void> {
  const note = 'Caisse de démonstration — encaissements espèces du jour';
  const b = await charger('BAIL-2026-0016', 'PRES-008');
  const oct = await echue(b.id);

  let session = await prisma.cashSession.findFirst({
    where: { tenantId: TENANT_ID, openingNote: note },
    select: { id: true, status: true }
  });
  if (!session) {
    await essaie('session de caisse ouverte (fond de caisse 50 000 FCFA)', async () => {
      const ouverte = await openSession(TENANT_ID, acteur, { openingFloat: 50000, openingNote: note });
      session = { id: ouverte.id, status: 'OPEN' };
    });
  } else {
    console.log(`  = session de caisse déjà présente (${session.status})`);
  }
  if (!session || session.status !== 'OPEN') return;

  // L'encaissement doit naître PENDANT la session : le montant attendu ne retient que les
  // espèces créées entre l'ouverture et la clôture.
  await essaie(
    `${b.numero} · 150 000 FCFA en espèces, 100 000 affectés à ${oct.mois}/${oct.annee}, 50 000 non affectés`,
    async () => {
      const cle = `pres-e-especes-${b.id.slice(0, 8)}`;
      let p = await prisma.rentalPayment.findFirst({
        where: { tenant_id: TENANT_ID, idempotency_key: cle },
        select: { id: true, allocations: { select: { id: true } } }
      });
      if (!p) {
        const cree = await createPayment(
          TENANT_ID,
          {
            leaseId: b.id,
            renterClientId: b.clientId,
            method: RentalPaymentMethod.CASH,
            amount: 150000,
            currency: 'XOF',
            pspReference: `RECU-CAISSE-${b.id.slice(0, 6).toUpperCase()}`,
            idempotencyKey: cle,
            paidAt: jour(0)
          },
          acteur
        );
        p = { id: cree.id, allocations: [] };
      }
      if (p.allocations.length > 0) return false;
      await allocatePayment(TENANT_ID, p.id, { installmentIds: [oct.id], amounts: { [oct.id]: 100000 } }, acteur);
    }
  );

  await essaie('session de caisse clôturée (billetage, écart de 500 FCFA justifié)', async () => {
    const courante = await getCurrentSession(TENANT_ID, acteur);
    const sessionId = session?.id;
    if (!courante || !sessionId || courante.id !== sessionId)
      throw new Error('La caisse ouverte du collaborateur n’est pas celle de la démonstration');
    const attendu = courante.expected.amount;
    const compte = attendu >= 500 ? attendu - 500 : attendu;
    await closeSession(TENANT_ID, acteur, sessionId, {
      denominations: billetage(compte),
      differenceReason:
        compte === attendu ? undefined : 'Une pièce de 500 FCFA rendue en trop à un locataire lors d’un encaissement.'
    });
  });
}

/** 7c. Cohérence finance : comptes de trésorerie, écritures de trésorerie, comptes de tiers. */
async function verifierFinance(): Promise<void> {
  const comptes = await prisma.treasuryAccount.findMany({
    where: { tenantId: TENANT_ID },
    select: { kind: true, accountNumber: true, label: true, isActive: true },
    orderBy: { accountNumber: 'asc' }
  });
  console.log(`  Comptes de trésorerie : ${comptes.length} (${comptes.filter(c => c.isActive).length} actifs)`);
  for (const c of comptes) console.log(`      ${c.accountNumber.padEnd(5)} ${c.kind.padEnd(14)} ${c.label}`);

  const paiements = await prisma.rentalPayment.findMany({
    where: { tenant_id: TENANT_ID, status: 'SUCCESS' },
    select: { id: true, lease_id: true, allocations: { select: { id: true } } }
  });
  const sources = paiements.flatMap(p => [p.id, ...p.allocations.map(a => a.id)]);
  const mouvements = new Set(
    (
      await prisma.thirdPartyMovement.findMany({
        where: {
          tenantId: TENANT_ID,
          sourceId: { in: sources },
          sourceType: { in: ['RENTAL_PAYMENT', 'RENTAL_PAYMENT_ALLOCATION'] }
        },
        select: { sourceId: true }
      })
    ).map(m => m.sourceId)
  );
  const sansTiers = paiements.filter(p => !mouvements.has(p.id) && !p.allocations.some(a => mouvements.has(a.id)));

  const ecritures = await prisma.journalEntry.findMany({
    where: { tenantId: TENANT_ID, documentType: 'RENTAL_RECEIPT' as never },
    select: { documentId: true }
  });
  const avecEcriture = new Set(ecritures.map(e => (e.documentId ?? '').split(':')[0]));
  const sansEcriture = paiements.filter(p => !avecEcriture.has(p.id));
  const aReprendre: string[] = [];
  let sousMandat = 0;
  for (const p of sansEcriture) {
    if (p.lease_id && (await isDirectLeaseTx(prisma, TENANT_ID, p.lease_id))) aReprendre.push(p.id);
    else sousMandat++;
  }
  console.log(
    `  Paiements encaissés : ${paiements.length} · sans mouvement de compte de tiers : ${sansTiers.length} · ` +
      `sans écriture de trésorerie : ${sansEcriture.length} (dont ${sousMandat} sur des biens sous mandat, comptabilisés par le compte propriétaire, et ${aReprendre.length} à rattraper)`
  );

  await essaie(`écritures de trésorerie rattrapées par l'application (${aReprendre.length})`, async () => {
    if (aReprendre.length === 0) return false;
    for (const id of aReprendre) await prisma.$transaction(tx => syncDirectRentPaymentEntryTx(tx, TENANT_ID, id));
  });
  if (sansTiers.length > 0) {
    echecsGlobaux.push(
      `${sansTiers.length} paiement(s) sans mouvement de compte de tiers : lancer packages/api/scripts/finance-backfill-tenant-accounts.ts`
    );
  }
}

/** 8. Notifications : l'application n'a pas de relance de loyer ; on lit ce que les flux ont journalisé. */
async function resumeNotifications(): Promise<void> {
  console.log(
    "  L'application n'a PAS de fonction de relance des loyers en retard ni de rappel d'échéance (seuls existent le calcul\n" +
      "  des pénalités et le passage en retard, qui touchent toute l'agence et ne sont donc pas lancés ici)."
  );
  const lignes = await prisma.userNotification.groupBy({
    by: ['key', 'status'],
    where: {
      tenantId: TENANT_ID,
      OR: [{ key: { startsWith: 'PAYMENT_' } }, { key: { startsWith: 'RENTER_PAYMENT' } }]
    },
    _count: true,
    orderBy: { key: 'asc' }
  });
  if (lignes.length === 0) console.log('  Journal des notifications : aucune ligne de paiement.');
  for (const l of lignes) console.log(`      ${l.key.padEnd(30)} ${String(l.status).padEnd(9)} ${l._count}`);
}

// ──────────────────────────────────────────────────── portail : ce qu'il renvoie

type Acces =
  | { ok: true; ctx: { leaseId: string; tenantClientId: string; tenantId: string } }
  | { ok: false; code: number; message: string };

/** Passe le middleware `requireTenantPortalAccess` de l'application avec un faux couple requête/réponse. */
function ouvrirPortail(userId: string): Promise<Acces> {
  return new Promise(resolve => {
    let code = 0;
    const res: Record<string, unknown> = {
      status(c: number) {
        code = c;
        return res;
      },
      json(corps: { message?: string }) {
        resolve({ ok: false, code, message: String(corps?.message ?? '') });
        return res;
      }
    };
    const req: Record<string, unknown> = { user: { userId }, headers: {} };
    void requireTenantPortalAccess(req as never, res as never, () =>
      resolve({ ok: true, ctx: req.tenantPortal as never })
    );
  });
}

/** Résumé court d'une réponse de service : tableaux -> longueur, nombres et textes courts conservés. */
function forme(o: unknown): string {
  if (!o || typeof o !== 'object') return String(o);
  return Object.entries(o as Record<string, unknown>)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}[${v.length}]`;
      if (v instanceof Date) return `${k}=${v.toISOString().slice(0, 10)}`;
      if (typeof v === 'number' || typeof v === 'boolean') return `${k}=${v}`;
      if (typeof v === 'string') return `${k}="${v.slice(0, 28)}"`;
      return v && typeof v === 'object' ? `${k}{…}` : `${k}=${v}`;
    })
    .join(' · ');
}

async function resumePortail(): Promise<void> {
  for (const [numero, ref] of COMPTES_PORTAIL) {
    const b = await charger(numero, ref);
    const bailBase = await prisma.rentalLease.findFirstOrThrow({
      where: { id: b.id, tenant_id: TENANT_ID },
      select: { status: true }
    });
    console.log(`\n  ── Portail de ${b.nom} <${b.email}> — ${b.numero} (bail ${bailBase.status})`);
    const user = b.userId
      ? await prisma.user.findUnique({
          where: { id: b.userId },
          select: { passwordHash: true, isActive: true, emailVerified: true }
        })
      : null;
    const mdp = user?.passwordHash ? await comparePassword(PACK_TEST_PASSWORD, user.passwordHash) : false;
    console.log(
      `     connexion : mot de passe de test ${mdp ? 'valide' : 'INVALIDE'} · compte ${user?.isActive ? 'actif' : 'INACTIF'} · e-mail ${user?.emailVerified ? 'vérifié' : 'NON vérifié'}`
    );

    const acces = b.userId
      ? await ouvrirPortail(b.userId)
      : ({ ok: false, code: 0, message: 'pas de compte' } as Acces);
    if (acces.ok) {
      console.log(`     middleware requireTenantPortalAccess : accès accordé (bail ${acces.ctx.leaseId.slice(0, 8)})`);
    } else {
      console.log(
        `     middleware requireTenantPortalAccess : REFUSÉ ${acces.code} « ${acces.message} » — résumé ci-dessous lu directement dans les services`
      );
    }

    const [client, bail, tenant] = [b.clientId, b.id, TENANT_ID];
    const lire = async (nom: string, fn: () => Promise<unknown>, detail?: (r: any) => string) => {
      try {
        const r = await fn();
        console.log(`     ${nom.padEnd(12)} ${detail ? detail(r) : forme(r)}`);
      } catch (e) {
        console.log(`     ${nom.padEnd(12)} ⨯ ${messageDe(e)}`);
      }
    };
    await lire(
      'tableau',
      () => portail.getDashboard(client, bail, tenant),
      r =>
        `solde ${fmt(r.currentBalance)} · ${r.overdueInstallmentsCount} échéance(s) en retard · prochaine ${
          r.nextInstallment
            ? `${r.nextInstallment.period} ${r.nextInstallment.status} reste ${fmt(r.nextInstallment.amount)}`
            : 'aucune'
        } · loyer ${fmt(r.lease.monthlyRent)}+${fmt(r.lease.serviceCharges)} · incidents ${r.maintenanceTickets.total}`
    );
    await lire('bail', () => portail.getLeaseDetails(client, bail, tenant));
    await lire(
      'échéances',
      () => portail.getInstallments(client, bail, tenant, undefined, { limit: 100 }),
      r => {
        const liste: { status: string }[] = r.installments ?? r.data ?? [];
        const par: Record<string, number> = {};
        for (const i of liste) par[i.status] = (par[i.status] ?? 0) + 1;
        return `${liste.length} échéance(s) ${JSON.stringify(par)} · ${forme(r.summary ?? {})}`;
      }
    );
    await lire(
      'paiements',
      () => portail.getPaymentHistory(client, bail, tenant, undefined, { limit: 100 }),
      r => {
        const par: Record<string, number> = {};
        for (const p of r.payments as { isDeclaration?: boolean; declarationStatus?: string; status?: string }[]) {
          const cle = p.isDeclaration ? `déclaration ${p.declarationStatus}` : String(p.status);
          par[cle] = (par[cle] ?? 0) + 1;
        }
        return `${r.pagination.total} ligne(s) ${JSON.stringify(par)} · total payé ${fmt(r.totalPaid)}`;
      }
    );
    await lire('dépôt', () => portail.getDepositInfo(client, bail, tenant));
    await lire('incidents', () => portail.getMaintenanceTickets(client, bail, tenant, undefined, { limit: 100 }));
    await lire('documents', () => portail.getDocuments(client, bail, tenant));
  }
}

// ─────────────────────────────────────────────────────────────── instantané

/** Compte, par table et par statut, ce qui concerne NOS baux : la différence avant/après est le bilan. */
async function instantane(leaseIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ajoute = (cle: string, n: number) => {
    out[cle] = n;
  };
  for (const g of await prisma.rentalPayment.groupBy({
    by: ['status'],
    where: { tenant_id: TENANT_ID, lease_id: { in: leaseIds } },
    _count: true
  })) {
    ajoute(`rental_payments · ${g.status}`, g._count);
  }
  ajoute(
    'rental_payment_allocations',
    await prisma.rentalPaymentAllocation.count({
      where: { tenant_id: TENANT_ID, payment: { lease_id: { in: leaseIds } } }
    })
  );
  for (const g of await prisma.rentalPaymentDeclaration.groupBy({
    by: ['status'],
    where: { tenant_id: TENANT_ID, lease_id: { in: leaseIds } },
    _count: true
  })) {
    ajoute(`rental_payment_declarations · ${g.status}`, g._count);
  }
  for (const g of await prisma.onlinePaymentCheckout.groupBy({
    by: ['status'],
    where: { tenantId: TENANT_ID, leaseId: { in: leaseIds } },
    _count: true
  })) {
    ajoute(`online_payment_checkouts · ${g.status}`, g._count);
  }
  ajoute(
    'online_payment_checkouts · via lien de paiement',
    await prisma.onlinePaymentCheckout.count({
      where: { tenantId: TENANT_ID, leaseId: { in: leaseIds }, secureLinkId: { not: null } }
    })
  );
  ajoute(
    'secure_links (liens de paiement) · total',
    await prisma.secureLink.count({ where: { tenantId: TENANT_ID, scope: 'INSTALLMENT_PAYMENT' } })
  );
  ajoute(
    'secure_links (liens de paiement) · révoqués',
    await prisma.secureLink.count({
      where: { tenantId: TENANT_ID, scope: 'INSTALLMENT_PAYMENT', revokedAt: { not: null } }
    })
  );
  ajoute(
    'rental_penalties · ajustées à la main',
    await prisma.rentalPenalty.count({
      where: { tenant_id: TENANT_ID, is_manual_override: true, installment: { lease_id: { in: leaseIds } } }
    })
  );
  for (const g of await prisma.cashSession.groupBy({ by: ['status'], where: { tenantId: TENANT_ID }, _count: true })) {
    ajoute(`cash_sessions · ${g.status}`, g._count);
  }
  ajoute('payment_gateway_configs', await prisma.paymentGatewayConfig.count({ where: { tenantId: TENANT_ID } }));
  ajoute(
    'user_notifications (paiements, journal)',
    await prisma.userNotification.count({
      where: {
        tenantId: TENANT_ID,
        OR: [{ key: { startsWith: 'PAYMENT_' } }, { key: { startsWith: 'RENTER_PAYMENT' } }]
      }
    })
  );
  return out;
}

// ──────────────────────────────────────────────────────────────────── main

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence : il en faut un comme auteur des écritures');
  acteur = membre.userId;
  console.log(`Agence : ${tenant.name}\nAuteur des écritures : ${membre.user?.email}`);

  const baux = await prisma.rentalLease.findMany({
    where: {
      tenant_id: TENANT_ID,
      lease_number: {
        in: ['BAIL-2026-0009', 'BAIL-2026-0016', 'BAIL-2026-0020', 'BAIL-2026-0021', 'BAIL-2026-0024', 'BAIL-2026-0026']
      }
    },
    select: { id: true }
  });
  if (baux.length === 0)
    throw new Error("Aucun bail de la présentation : lancer d'abord db:seed:presentation-locative");
  const avant = await instantane(baux.map(l => l.id));

  await etape('1. Passerelle de paiement en ligne (PaySecureHub, simulateur)', seedPasserelle);
  await etape('7a. Réglages financiers et règle de pénalité', seedReglagesFinanciers);
  await etape('6a. Comptes de connexion du portail locataire', seedComptesPortail);
  await etape('0009 — Armand Koffi (à jour)', seedArmand);
  await etape('0016 — Marie-Laure N’Guessan (paiements refusé, annulé)', seedMarieLaure);
  await etape('0026 — Blandine Zadi (échec en ligne, déclaration, succès en ligne)', seedBlandine);
  await etape('0024 — Christelle Aké (chèque impayé, expiré, acompte, lien utilisé)', seedChristelle);
  await etape('0020 — rejet de la déclaration du studio', seedRejetStudio);
  await etape('5. Pénalités du 0021 (remise manuelle + justificatif)', seedPenalites);
  await etape('7b. Session de caisse (espèces du 0016)', seedCaisse);
  await etape('2. Liens de paiement du 0016 (révoqué, actif)', seedLiensMarieLaure);
  await etape('0016 — déclaration en attente du solde', seedDeclarationMarieLaure);
  await etape('7c. Cohérence finance (trésorerie, écritures, comptes de tiers)', verifierFinance);
  await etape('8. Relances et notifications', resumeNotifications);
  await etape('6b. Ce que renvoie le portail locataire', resumePortail);

  await flushAuditEvents();

  const apres = await instantane(baux.map(l => l.id));
  console.log('\n──────────── BILAN ────────────');
  for (const b of bilan) {
    console.log(
      `${b.etape.padEnd(74)} ${String(b.ok).padStart(3)} créé(s)${b.echecs.length ? '   ⨯ ' + b.echecs[0] : ''}`
    );
  }
  console.log('\nCréé par CETTE exécution, par table et par statut (différence avant/après, nos baux) :');
  let rien = true;
  for (const cle of Object.keys(apres).sort()) {
    const delta = apres[cle] - (avant[cle] ?? 0);
    if (delta !== 0) {
      rien = false;
      console.log(`  ${delta > 0 ? '+' : ''}${delta}  ${cle}  (total ${apres[cle]})`);
    }
  }
  if (rien) console.log('  (rien : tout était déjà en place)');
  console.log('\nÉtat final (nos baux) :');
  for (const cle of Object.keys(apres).sort()) console.log(`  ${String(apres[cle]).padStart(4)}  ${cle}`);
  if (echecsGlobaux.length) {
    console.log(`\n${echecsGlobaux.length} échec(s) :`);
    for (const e of echecsGlobaux) console.log(`  ⨯ ${e}`);
  }
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Sortie explicite : `utils/database` enregistre un gestionnaire `beforeExit`
    // asynchrone qui redéclenche l'événement sans fin.
    process.exit(process.exitCode ?? 0);
  });
