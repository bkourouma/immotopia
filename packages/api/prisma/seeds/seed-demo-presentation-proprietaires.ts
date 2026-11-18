/**
 * Jeu de données de présentation — côté propriétaires.
 *
 * Suite de `seed-demo-presentation-annexes.ts` (qui a créé Henri Bakayoko,
 * Odile Yéo et Salif Konaté, leurs mandats et leurs baux) : ce script remplit
 * tout ce qui touche à l'argent du propriétaire et à son accès.
 *
 *   1. Honoraires de gestion : conditions par propriétaire, dérogations par bail
 *      (avec gestionnaire désigné), part de commission du collaborateur.
 *   2. Statut fiscal des propriétaires et retenue à la source sur loyers.
 *   3. Comptes courants propriétaires (synchronisation de l'application).
 *   4. Relevés de gérance des six derniers mois : les plus anciens PAYÉS, le
 *      précédent ENVOYÉ, le dernier en BROUILLON — puis leurs reversements, dont
 *      un reversement ANNULÉ avec son motif.
 *   5. Liens sécurisés du rapport mensuel (un actif, un révoqué) et accès
 *      partagés en lecture seule (notaire, expert-comptable d'Odile Yéo).
 *   6. Réglages du portail propriétaire et accès au portail d'Odile et d'Henri.
 *   7. Lecture du portail par les services de l'application, pour vérifier ce
 *      que ces deux propriétaires y voient.
 *
 * Partis pris, hérités des autres scripts de présentation :
 *   - tout ce qui a un service passe par le service (conditions d'honoraires,
 *     comptes propriétaires, relevés, reversements, liens, accès partagés,
 *     réglages) ; seuls les comptes de connexion, les dates de transition des
 *     relevés et la date d'effet des conditions d'honoraires sont écrits en base ;
 *   - aucun envoi sortant : SMTP, SendGrid, Twilio et WhatsApp sont neutralisés
 *     avant tout import (les « Error sending email » éventuels sont normaux) ;
 *   - idempotent : chaque élément est retrouvé par sa clé naturelle avant d'être
 *     créé. Seuls les relevés encore en BROUILLON sont recalculés à chaque passage
 *     (relancer le script après les autres chantiers suffit à les remettre à jour) ;
 *   - une étape qui échoue n'arrête pas les autres : elle est signalée au bilan.
 *
 * Date d'effet des conditions d'honoraires : l'application n'applique un taux
 * qu'aux encaissements enregistrés APRÈS son enregistrement (un changement de
 * taux ne réécrit jamais l'histoire). Les loyers de la démonstration datent de
 * plusieurs mois ; les conditions sont donc enregistrées par le service puis
 * antidatées au début de la gestion (`DEBUT_GESTION`), comme si elles avaient
 * été convenues à la signature des mandats.
 *
 * Mot de passe des comptes portail : celui des agences de démonstration
 * (`PACK_TEST_PASSWORD`). Il n'est jamais affiché.
 *
 * Usage : npm run db:seed:presentation-proprietaires -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
// Chaînes vides plutôt que `delete` : dotenv ne remplace pas une variable déjà
// définie, alors qu'il réinjecterait celle d'un `.env` supprimée ici.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
process.env.SENDGRID_API_KEY = '';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_WHATSAPP_FROM = '';
process.env.WASENDER_API_KEY = '';
// Un fournisseur inconnu = « non configuré » ; une valeur vide laisserait le mode automatique.
process.env.WHATSAPP_PROVIDER = 'aucun';
process.env.WHATSAPP_INVENTORY_TRANSPORT = 'disabled';
process.env.SMS_PROVIDER = 'disabled';

// En développement, les services tracent chaque requête SQL et chaque requête sans filtre d'agence
// (garde-fou tenant, mode « warn ») : des centaines de lignes qui noient le récit du script. On
// écarte les premières et on COMPTE les secondes pour les rappeler au bilan.
const avertissementsGarde = new Map<string, number>();
const ecrireSortie = process.stdout.write.bind(process.stdout) as (...args: unknown[]) => boolean;
process.stdout.write = ((chunk: string | Uint8Array, ...reste: unknown[]) => {
  const texte = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  if (/^prisma:query/.test(texte) || texte.includes('Tenant guard: modèles dérivés')) return true;
  const garde = /Tenant guard — requête ([A-Za-z]+\.[A-Za-z]+) sans filtre/.exec(texte);
  if (garde) {
    avertissementsGarde.set(garde[1], (avertissementsGarde.get(garde[1]) ?? 0) + 1);
    return true;
  }
  return ecrireSortie(chunk, ...reste);
}) as typeof process.stdout.write;

import { Prisma, PrismaClient } from '@prisma/client';

import { assertNotProduction } from './assert-not-production';
import { PACK_TEST_PASSWORD } from './pack-test-tenants';
import { runWithTenantContext } from '../../src/utils/tenant-context';
import { comparePassword, hashPassword } from '../../src/utils/password-utils';
import {
  getLeaseManagementTerms,
  listAgentCommissionRates,
  setAgentCommissionRate,
  setLeaseManagementTerms,
  setOwnerFeeTerms
} from '../../src/lib/rental-fees/terms-service';
import { getAgentCommissions } from '../../src/lib/rental-fees/commissions';
import {
  getAgencyFinanceSettings,
  updateAgencyFinanceSettings,
  updateFinanceSettingsSchema
} from '../../src/lib/settings/finance-settings';
import { getOwnerPortalSettings, updateOwnerPortalSettings } from '../../src/lib/settings/owner-portal-settings';
import { OWNER_SOURCE, syncOwnerAccount } from '../../src/lib/owner-account/sync';
import { createOwnerPayout, getOwnerAccount, voidOwnerPayout } from '../../src/lib/owner-account/service';
import { generateOwnerStatement, listOwnerStatements, updateOwnerStatement } from '../../src/lib/patrimoine/queries';
import { createSecureLink, listSecureLinks, revokeSecureLink } from '../../src/lib/secure-links';
import { getOwnerMonthlyReportByToken } from '../../src/lib/patrimoine/owner-monthly-report';
import {
  createExternalAccessGrant,
  createGrantSchema,
  getExternalAccessViewByToken,
  listPropertyDocumentsForSharing
} from '../../src/lib/external-access';
import { OwnerPortalService } from '../../src/services/owner-portal-service';
import { resolveOwnerPortalPropertyIds } from '../../src/lib/owner-portal-scope';
import { getOwnerPortalPatrimoine } from '../../src/lib/patrimoine/owner-portal-view';
import { flushAuditEvents } from '../../src/services/audit-service';

const prisma = new PrismaClient({ log: [] });

const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const MAINTENANT = new Date();

/** Début de la gestion pour compte : date d'effet des conditions d'honoraires. */
const DEBUT_GESTION = new Date('2025-09-01T00:00:00.000Z');

const bilan: { etape: string; ok: number; echecs: string[] }[] = [];

/** Une étape qui échoue est notée au bilan ; les autres continuent. */
async function etape(nom: string, fn: () => Promise<number>): Promise<void> {
  console.log(`\n── ${nom}`);
  try {
    const ok = await fn();
    bilan.push({ etape: nom, ok, echecs: [] });
  } catch (e) {
    const message = dernierMessage(e);
    console.log(`  ⨯ étape interrompue : ${message}`);
    bilan.push({ etape: nom, ok: 0, echecs: [message] });
  }
}

/** Tente une écriture ; renvoie vrai si elle est passée, journalise sinon. */
async function essaie(libelle: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    console.log(`  + ${libelle}`);
    return true;
  } catch (e) {
    console.log(`  ⨯ ${libelle} — ${dernierMessage(e)}`);
    return false;
  }
}

function dernierMessage(e: unknown): string {
  return e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, ' ')} F`;

// ──────────────────────────────────────────────────────────────── le plan

interface PlanProprietaire {
  cle: string;
  nom: string;
  initiales: string;
  conditions: { mode: 'PERCENT' | 'FIXED'; taux?: number; forfait?: number; base: 'RENT_ONLY' | 'ALL_COLLECTED' };
  statutFiscal: 'INDIVIDUAL' | 'COMPANY' | 'EXEMPT';
  /** Portail propriétaire ouvert (compte de connexion utilisable). */
  portail: boolean;
  /** Mode de règlement habituel des reversements. */
  reversement: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'ALTERNE';
}

const PROPRIETAIRES: PlanProprietaire[] = [
  {
    cle: 'henri.bakayoko',
    nom: 'Henri Bakayoko',
    initiales: 'HB',
    conditions: { mode: 'PERCENT', taux: 8, base: 'RENT_ONLY' },
    statutFiscal: 'INDIVIDUAL',
    portail: true,
    reversement: 'BANK_TRANSFER'
  },
  {
    cle: 'odile.yeo',
    nom: 'Odile Yéo',
    initiales: 'OY',
    conditions: { mode: 'PERCENT', taux: 10, base: 'ALL_COLLECTED' },
    statutFiscal: 'EXEMPT',
    portail: true,
    reversement: 'BANK_TRANSFER'
  },
  {
    cle: 'salif.konate',
    nom: 'Salif Konaté',
    initiales: 'SK',
    conditions: { mode: 'FIXED', forfait: 40000, base: 'RENT_ONLY' },
    statutFiscal: 'COMPANY',
    portail: false,
    reversement: 'ALTERNE'
  }
];

/** Baux (désignés par leur bien) qui dérogent aux conditions de leur propriétaire. */
const DEROGATIONS = [
  { bien: 'PRES-002', taux: 7, base: 'RENT_ONLY' as const },
  { bien: 'PRES-010', taux: 6, base: 'ALL_COLLECTED' as const },
  { bien: 'PRES-018', taux: 5, base: 'RENT_ONLY' as const }
];
/** Baux gérés par le collaborateur sans condition dérogatoire. */
const GESTIONNAIRE_SEUL = ['PRES-011'];

/** Part des honoraires HT reversée au collaborateur gestionnaire. */
const PART_COLLABORATEUR = 35;

/** Date de début de la retenue à la source : celle du premier relevé produit. */
const RETENUE_DEPUIS = (() => {
  const d = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() - 6, 1));
  return d.toISOString().slice(0, 10);
})();

/** Les six derniers mois pleins, du plus ancien au plus récent. */
const PERIODES: { periode: string; cible: 'PAID' | 'SENT' | 'DRAFT' }[] = [6, 5, 4, 3, 2, 1].map((recul, i) => {
  const d = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() - recul, 1));
  const periode = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { periode, cible: i < 4 ? 'PAID' : i === 4 ? 'SENT' : 'DRAFT' };
});

// ─────────────────────────────────────────────────────────────── contexte

interface Proprio extends PlanProprietaire {
  clientId: string;
  userId: string;
  contactId: string;
  email: string;
}

let acteur = '';
const proprios: Proprio[] = [];

async function chargerContexte(): Promise<void> {
  const membres = await prisma.membership.findMany({
    where: { tenantId: TENANT_ID, status: 'ACTIVE' },
    select: { userId: true, user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' }
  });
  const membre = membres.find(m => m.user?.email === 'agence@packs.immotopia.test') ?? membres[0];
  if (!membre) throw new Error('Aucun collaborateur actif sur cette agence');
  acteur = membre.userId;
  console.log(`Auteur des écritures : ${membre.user?.email}`);

  for (const plan of PROPRIETAIRES) {
    const email = `${plan.cle}.proprio.pres@exemple.test`;
    const client = await prisma.tenantClient.findFirst({
      where: { tenantId: TENANT_ID, clientType: 'OWNER', user: { email } },
      select: { id: true, userId: true, details: true }
    });
    const contactId = (client?.details as { crmContactId?: string } | null)?.crmContactId;
    if (!client || !contactId) {
      throw new Error(`Propriétaire ${plan.nom} introuvable : lancer d'abord db:seed:presentation-annexes`);
    }
    proprios.push({ ...plan, clientId: client.id, userId: client.userId, contactId, email });
  }
  console.log(`${proprios.length} propriétaires de la présentation trouvés.`);
}

function proprio(cle: string): Proprio {
  const p = proprios.find(x => x.cle === cle);
  if (!p) throw new Error(`Propriétaire ${cle} introuvable`);
  return p;
}

/** Bail d'un bien de la présentation (le plus récent qui porte un propriétaire). */
async function bailDuBien(ref: string): Promise<{ id: string; numero: string; ownerClientId: string | null } | null> {
  const bail = await prisma.rentalLease.findFirst({
    where: { tenant_id: TENANT_ID, property: { internalReference: ref }, owner_client_id: { not: null } },
    orderBy: { created_at: 'desc' },
    select: { id: true, lease_number: true, owner_client_id: true }
  });
  return bail ? { id: bail.id, numero: bail.lease_number, ownerClientId: bail.owner_client_id } : null;
}

/** Biens loués du propriétaire (ceux dont un bail le désigne), dans l'ordre des références. */
async function biensDuProprietaire(p: Proprio): Promise<string[]> {
  const baux = await prisma.rentalLease.findMany({
    where: { tenant_id: TENANT_ID, owner_client_id: p.clientId },
    select: { property_id: true, property: { select: { internalReference: true } } }
  });
  const parBien = new Map(baux.map(b => [b.property_id, b.property.internalReference]));
  return [...parBien.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id]) => id);
}

// ──────────────────────────────────────────────────────────── 1. honoraires

/** Antidate l'enregistrement d'une condition d'honoraires (voir l'en-tête du fichier). */
async function antidater(table: 'owner_management_terms' | 'lease_management_terms', id: string): Promise<void> {
  const nom = Prisma.raw(table);
  await prisma.$executeRaw`UPDATE ${nom} SET updated_at = ${DEBUT_GESTION}, created_at = ${DEBUT_GESTION} WHERE id = ${id}::uuid AND tenant_id = ${TENANT_ID}`;
}

const memeNombre = (a: unknown, b: unknown) => (a == null && b == null) || Number(a) === Number(b);

async function etapeHonoraires(): Promise<number> {
  let n = 0;

  // 1. Part de commission du collaborateur. D'abord : elle est figée dans les honoraires
  //    au moment où ils sont calculés.
  const part = (await listAgentCommissionRates(TENANT_ID)).find(a => a.userId === acteur);
  if (!part || part.sharePercent !== PART_COLLABORATEUR) {
    if (
      await essaie(`part du collaborateur : ${PART_COLLABORATEUR} % des honoraires HT`, () =>
        setAgentCommissionRate(TENANT_ID, acteur, { sharePercent: PART_COLLABORATEUR })
      )
    )
      n++;
  }

  // 2. Baux : dérogation + gestionnaire, puis gestionnaire seul. Avant les conditions des
  //    propriétaires, pour que les honoraires figés à chaque enregistrement portent déjà
  //    le gestionnaire.
  const plansBaux: { bien: string; taux?: number; base?: 'RENT_ONLY' | 'ALL_COLLECTED' }[] = [
    ...DEROGATIONS,
    ...GESTIONNAIRE_SEUL.map(bien => ({ bien }))
  ];
  for (const plan of plansBaux) {
    const bail = await bailDuBien(plan.bien);
    if (!bail) {
      console.log(`  ⨯ ${plan.bien} : aucun bail avec propriétaire`);
      continue;
    }
    const actuel = await getLeaseManagementTerms(TENANT_ID, bail.id);
    const dejaBon =
      actuel.agentUserId === acteur &&
      (plan.taux === undefined
        ? actuel.override === null
        : actuel.override?.managementFeeMode === 'PERCENT' &&
          memeNombre(actuel.override.managementFeeRate, plan.taux) &&
          actuel.override.managementFeeBase === plan.base);
    if (dejaBon) continue;
    const libelle =
      plan.taux === undefined
        ? `${plan.bien} (${bail.numero}) : gestionnaire désigné, conditions du propriétaire`
        : `${plan.bien} (${bail.numero}) : dérogation ${plan.taux} % (${plan.base === 'ALL_COLLECTED' ? 'tout l’encaissé' : 'loyers'}) + gestionnaire`;
    const ok = await essaie(libelle, async () => {
      await setLeaseManagementTerms(
        TENANT_ID,
        bail.id,
        {
          override:
            plan.taux === undefined
              ? null
              : { managementFeeMode: 'PERCENT', managementFeeRate: plan.taux, managementFeeBase: plan.base },
          agentUserId: acteur
        },
        acteur
      );
      await antidater(
        'lease_management_terms',
        (
          await prisma.leaseManagementTerms.findFirstOrThrow({
            where: { tenantId: TENANT_ID, leaseId: bail.id },
            select: { id: true }
          })
        ).id
      );
    });
    if (ok) n++;
  }

  // 3. Propriétaires : conditions + statut fiscal (le service enregistre les deux).
  for (const p of proprios) {
    const ligne = await prisma.ownerManagementTerms.findFirst({
      where: { tenantId: TENANT_ID, ownerClientId: p.clientId }
    });
    const client = await prisma.tenantClient.findFirst({
      where: { id: p.clientId, tenantId: TENANT_ID },
      select: { ownerTaxStatus: true }
    });
    const c = p.conditions;
    const dejaBon =
      ligne !== null &&
      ligne.managementFeeMode === c.mode &&
      memeNombre(ligne.managementFeeRate, c.taux ?? null) &&
      memeNombre(ligne.managementFeeFixedAmount, c.forfait ?? null) &&
      ligne.managementFeeBase === c.base &&
      client?.ownerTaxStatus === p.statutFiscal;
    if (dejaBon) continue;
    const forme =
      c.mode === 'FIXED'
        ? `forfait ${fcfa(c.forfait ?? 0)} par échéance`
        : `${c.taux} % ${c.base === 'ALL_COLLECTED' ? 'de tout l’encaissé' : 'des loyers encaissés'}`;
    const ok = await essaie(`${p.nom} : honoraires ${forme}, statut fiscal ${p.statutFiscal}`, async () => {
      await setOwnerFeeTerms(
        TENANT_ID,
        p.clientId,
        {
          managementFeeMode: c.mode,
          managementFeeRate: c.mode === 'PERCENT' ? c.taux : undefined,
          managementFeeFixedAmount: c.mode === 'FIXED' ? c.forfait : undefined,
          managementFeeBase: c.base,
          ownerTaxStatus: p.statutFiscal
        },
        acteur
      );
      await antidater(
        'owner_management_terms',
        (
          await prisma.ownerManagementTerms.findFirstOrThrow({
            where: { tenantId: TENANT_ID, ownerClientId: p.clientId },
            select: { id: true }
          })
        ).id
      );
    });
    if (ok) n++;
  }
  return n;
}

// ───────────────────────────────────────────── 2. retenue à la source

async function etapeRetenue(): Promise<number> {
  const actuel = await getAgencyFinanceSettings(TENANT_ID);
  if (actuel.withholdingEnabled && actuel.withholdingStartsOn && actuel.withholdingStartsOn <= RETENUE_DEPUIS) {
    console.log(`  retenue déjà active depuis le ${actuel.withholdingStartsOn}`);
    return 0;
  }
  // Les réglages se saisissent en bloc : on repart de ceux de l'agence et on n'y change que la retenue.
  const saisie = updateFinanceSettingsSchema.parse({
    ...actuel,
    withholdingEnabled: true,
    withholdingStartsOn: RETENUE_DEPUIS
  });
  await updateAgencyFinanceSettings(TENANT_ID, saisie, acteur);
  console.log(`  + retenue à la source activée à partir du ${RETENUE_DEPUIS} (12 % particulier, 15 % société)`);
  return 1;
}

// ────────────────────────────────────────────── 3. comptes propriétaires

interface EtatCompte {
  mouvements: number;
  loyers: number;
  honoraires: number;
  retenues: number;
  montantRetenues: number;
}

async function etatCompte(p: Proprio): Promise<EtatCompte> {
  const compte = await prisma.thirdPartyAccount.findFirst({
    where: { tenantId: TENANT_ID, kind: 'OWNER', tenantClientId: p.clientId },
    select: { id: true }
  });
  const [mouvements, loyers, honoraires, retenues] = await Promise.all([
    compte ? prisma.thirdPartyMovement.count({ where: { accountId: compte.id } }) : 0,
    compte ? prisma.thirdPartyMovement.count({ where: { accountId: compte.id, sourceType: OWNER_SOURCE.RENT } }) : 0,
    prisma.managementFee.count({ where: { tenantId: TENANT_ID, ownerClientId: p.clientId } }),
    prisma.rentWithholding.aggregate({
      where: { tenantId: TENANT_ID, ownerClientId: p.clientId },
      _count: true,
      _sum: { amount: true }
    })
  ]);
  return {
    mouvements,
    loyers,
    honoraires,
    retenues: retenues._count,
    montantRetenues: Number(retenues._sum.amount ?? 0)
  };
}

async function etapeComptes(): Promise<number> {
  let n = 0;
  for (const p of proprios) {
    const avant = await etatCompte(p);
    // Écrit les honoraires, les retenues à la source et les mouvements du compte à partir des
    // encaissements des baux du propriétaire : c'est le rattrapage de l'application.
    const ok = await essaie(`compte courant de ${p.nom} synchronisé`, () => syncOwnerAccount(TENANT_ID, p.clientId));
    const apres = await etatCompte(p);
    console.log(
      `    mouvements ${avant.mouvements} → ${apres.mouvements} · honoraires ${avant.honoraires} → ${apres.honoraires} · ` +
        `retenues ${avant.retenues} → ${apres.retenues} (${fcfa(apres.montantRetenues)})`
    );
    if (ok && apres.mouvements > avant.mouvements) n++;
  }
  return n;
}

// ─────────────────────────────────────── 4. relevés et reversements

/** Premier jour du mois suivant la période, à l'heure donnée (UTC). */
function moisSuivant(periode: string, jour: number, heure: number): Date {
  const [a, m] = periode.split('-').map(Number);
  return new Date(Date.UTC(a, m, jour, heure));
}

const jourIso = (d: Date) => d.toISOString().slice(0, 10);

/** Encaissements récents datés du jour de leur création alors que leur échéance est ancienne. */
async function encaissementsMalDates(): Promise<number> {
  const hier = new Date(MAINTENANT.getTime() - 24 * 3600 * 1000);
  const ilYaUneSemaine = new Date(MAINTENANT.getTime() - 7 * 24 * 3600 * 1000);
  return prisma.rentalPaymentAllocation.count({
    where: {
      tenant_id: TENANT_ID,
      payment: { status: 'SUCCESS', succeeded_at: { gte: hier }, directDebitLine: { is: null } },
      installment: {
        due_date: { lt: ilYaUneSemaine },
        lease: { owner_client_id: { in: proprios.map(p => p.clientId) } }
      }
    }
  });
}

interface LigneReleve {
  periode: string;
  statut: string;
  net: number;
  encaisse: number;
  honoraires: number;
}

/** Compte de trésorerie actif et son solde courant (débit − crédit de son compte du plan). */
async function compteTresorerie(numero: string): Promise<{ id: string; solde: number } | null> {
  const compte = await prisma.treasuryAccount.findFirst({
    where: { tenantId: TENANT_ID, accountNumber: numero, isActive: true },
    select: { id: true, chartOfAccountId: true }
  });
  if (!compte) return null;
  const somme = await prisma.journalEntryLine.aggregate({
    where: { accountId: compte.chartOfAccountId },
    _sum: { debit: true, credit: true }
  });
  return { id: compte.id, solde: Number(somme._sum.debit ?? 0) - Number(somme._sum.credit ?? 0) };
}

async function reglerReleve(
  p: Proprio,
  releve: { id: string; period: string; net: number },
  options: { methode: 'BANK_TRANSFER' | 'MOBILE_MONEY'; paiement: Date; suffixe?: string; notes?: string }
) {
  // Le service de reversement ne contrôle pas le solde du compte de trésorerie débité : on ne
  // décaisse par la banque que si elle peut couvrir le virement, sinon le reversement part en Mobile Money.
  let methode = options.methode;
  let tresorerie = await compteTresorerie(methode === 'MOBILE_MONEY' ? '5521' : '5211');
  if (methode === 'BANK_TRANSFER' && tresorerie && tresorerie.solde < releve.net) {
    console.log(`    banque insuffisante (${fcfa(tresorerie.solde)}) : reversement basculé en Mobile Money`);
    methode = 'MOBILE_MONEY';
    tresorerie = await compteTresorerie('5521');
  }
  const compact = releve.period.replace('-', '');
  return createOwnerPayout(
    TENANT_ID,
    p.clientId,
    {
      amount: releve.net,
      paidAt: jourIso(options.paiement),
      method: methode,
      treasuryAccountId: tresorerie?.id ?? null,
      reference: `${methode === 'MOBILE_MONEY' ? 'MM' : 'VIR'}-${compact}-${p.initiales}${options.suffixe ?? ''}`,
      notes: options.notes ?? `Reversement du relevé de gérance ${releve.period}.`,
      statementId: releve.id
    },
    acteur
  );
}

function methodeDuMois(p: Proprio, indice: number): 'BANK_TRANSFER' | 'MOBILE_MONEY' {
  if (p.reversement === 'ALTERNE') return indice % 2 === 0 ? 'MOBILE_MONEY' : 'BANK_TRANSFER';
  return p.reversement;
}

/**
 * Reprise : les relevés de gérance commencent en mai 2026, mais les baux les plus
 * anciens encaissent depuis l'automne 2025. Sans reversement de ces loyers, le
 * compte du propriétaire afficherait des mois de loyers « dus » jamais réglés.
 * Un reversement unique, hors relevé, solde ce que l'agence devait au 30 avril.
 */
async function etapeReprise(): Promise<number> {
  const banque = await compteTresorerie('5211');
  let n = 0;
  for (const p of proprios) {
    const reference = `REP-202604-${p.initiales}`;
    if (await prisma.ownerPayout.count({ where: { tenantId: TENANT_ID, reference } })) continue;
    const compte = await prisma.thirdPartyAccount.findFirst({
      where: { tenantId: TENANT_ID, kind: 'OWNER', tenantClientId: p.clientId },
      select: { id: true }
    });
    if (!compte) continue;
    const dernier = await prisma.thirdPartyMovement.findFirst({
      where: { tenantId: TENANT_ID, accountId: compte.id, movementDate: { lt: new Date('2026-05-01T00:00:00Z') } },
      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
      select: { balanceAfter: true }
    });
    // Solde négatif : l'agence doit au propriétaire.
    const du = -Number(dernier?.balanceAfter ?? 0);
    if (du <= 0) continue;
    const ok = await essaie(`${p.nom} · reprise au 30/04/2026 : ${fcfa(du)}`, () =>
      createOwnerPayout(
        TENANT_ID,
        p.clientId,
        {
          amount: du,
          paidAt: '2026-05-06',
          method: 'BANK_TRANSFER',
          treasuryAccountId: banque?.id ?? null,
          reference,
          notes:
            'Reprise : loyers encaissés avant la tenue des relevés de gérance dans ImmoTopia (jusqu’au 30 avril 2026).'
        },
        acteur
      )
    );
    if (ok) n++;
  }
  return n;
}

async function releveExistant(p: Proprio, periode: string) {
  return prisma.ownerStatement.findUnique({
    where: { tenantId_ownerContactId_period: { tenantId: TENANT_ID, ownerContactId: p.contactId, period: periode } },
    select: { id: true, status: true, netAmount: true, totalRevenue: true, totalManagementFees: true }
  });
}

async function etapeReleves(): Promise<number> {
  const malDates = await encaissementsMalDates();
  if (malDates > 5) {
    throw new Error(
      `${malDates} encaissement(s) de ces baux sont datés d'aujourd'hui alors que leur échéance est ancienne : ` +
        'relevés non générés (un relevé réglé ne se recalcule plus). Redater les paiements puis relancer.'
    );
  }

  let n = 0;
  for (const p of proprios) {
    const biens = await biensDuProprietaire(p);
    if (biens.length === 0) {
      console.log(`  ⨯ ${p.nom} : aucun bien loué`);
      continue;
    }
    const lignes: LigneReleve[] = [];
    for (const [indice, plan] of PERIODES.entries()) {
      const { periode, cible } = plan;
      let releve = await releveExistant(p, periode);

      // Brouillon (ou absent) : on (re)calcule par le service de l'application.
      if (!releve || releve.status === 'DRAFT') {
        const etaitAbsent = !releve;
        const ok = await essaie(`${p.nom} · ${periode} ${etaitAbsent ? 'généré' : 'brouillon recalculé'}`, () =>
          generateOwnerStatement(TENANT_ID, { ownerContactId: p.contactId, period: periode, propertyIds: biens })
        );
        if (!ok) continue;
        if (etaitAbsent) n++;
        releve = await releveExistant(p, periode);
        if (!releve) continue;
      }

      const net = Number(releve.netAmount);
      // Envoyé : le relevé quitte le brouillon. L'envoi réel (e-mail, WhatsApp) est neutralisé,
      // on pose donc le statut comme le fait l'envoi, avec sa date.
      if (cible !== 'DRAFT' && releve.status === 'DRAFT') {
        const ok = await essaie(`${p.nom} · ${periode} envoyé`, async () => {
          await updateOwnerStatement(TENANT_ID, releve!.id, { status: 'SENT' });
          await prisma.ownerStatement.updateMany({
            where: { id: releve!.id, tenantId: TENANT_ID },
            data: { sentAt: moisSuivant(periode, 2, 10), createdAt: moisSuivant(periode, 1, 9) }
          });
        });
        if (!ok) continue;
        releve = await releveExistant(p, periode);
        if (!releve) continue;
      }

      // Payé : par le reversement, qui solde le relevé. Sans rien à reverser, on le marque réglé.
      if (cible === 'PAID' && releve.status === 'SENT') {
        const paiement = moisSuivant(periode, 8, 12);
        const deja = await prisma.ownerPayout.count({
          where: { tenantId: TENANT_ID, statementId: releve.id, status: 'VALIDATED' }
        });
        if (deja === 0) {
          const releveService = { id: releve.id, period: periode, net };
          if (net <= 0) {
            // Un relevé réglé sans reversement serait incohérent avec le compte du propriétaire :
            // il reste ENVOYÉ (les dépenses du mois dépassent les loyers encaissés).
            console.log(`  ! ${p.nom} · ${periode} : net ${fcfa(net)}, rien à reverser, le relevé reste ENVOYÉ`);
          } else if (await scenarioAnnulation(p, releveService, indice)) {
            n += 2;
          } else {
            const ok = await essaie(`${p.nom} · ${periode} reversement de ${fcfa(net)}`, () =>
              reglerReleve(p, releveService, { methode: methodeDuMois(p, indice), paiement })
            );
            if (ok) n++;
          }
        }
      }

      const final = await releveExistant(p, periode);
      lignes.push({
        periode,
        statut: final?.status ?? '?',
        net: Number(final?.netAmount ?? 0),
        encaisse: Number(final?.totalRevenue ?? 0),
        honoraires: Number(final?.totalManagementFees ?? 0)
      });
    }
    for (const l of lignes) {
      console.log(
        `    ${p.initiales} ${l.periode} ${l.statut.padEnd(5)} encaissé ${fcfa(l.encaisse).padStart(14)}  honoraires ${fcfa(l.honoraires).padStart(11)}  net ${fcfa(l.net).padStart(14)}`
      );
    }
  }
  return n;
}

/**
 * Un reversement annulé avec son motif : le virement du relevé d'août de Salif Konaté est
 * rejeté par sa banque, l'agence l'annule (le relevé redevient dû) puis le règle de nouveau
 * en Mobile Money. Joué une seule fois : tant qu'un reversement annulé existe, on ne rejoue pas.
 */
async function scenarioAnnulation(
  p: Proprio,
  releve: { id: string; period: string; net: number },
  indice: number
): Promise<boolean> {
  if (p.cle !== 'salif.konate' || indice !== PERIODES.length - 3) return false;
  const annules = await prisma.ownerPayout.count({
    where: { tenantId: TENANT_ID, ownerClientId: p.clientId, status: 'VOIDED' }
  });
  if (annules > 0) return false;

  const paiement = moisSuivant(releve.period, 8, 12);
  let premier: { id: string } | null = null;
  const ok1 = await essaie(`${p.nom} · ${releve.period} reversement de ${fcfa(releve.net)} par virement`, async () => {
    premier = await reglerReleve(p, releve, { methode: 'BANK_TRANSFER', paiement });
  });
  if (!ok1 || !premier) return true;
  const ok2 = await essaie(`${p.nom} · ${releve.period} reversement annulé (virement rejeté)`, () =>
    voidOwnerPayout(
      TENANT_ID,
      p.clientId,
      (premier as { id: string }).id,
      { reason: 'Virement rejeté par la banque du bénéficiaire : IBAN erroné, à corriger avant tout nouvel envoi.' },
      acteur
    )
  );
  if (!ok2) return true;
  await essaie(`${p.nom} · ${releve.period} réémis en Mobile Money (Wave) après rejet`, () =>
    reglerReleve(p, releve, {
      methode: 'MOBILE_MONEY',
      paiement: new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth(), MAINTENANT.getUTCDate(), 12)),
      suffixe: '-R',
      notes: `Reversement du relevé ${releve.period} réémis en Mobile Money après le rejet du virement.`
    })
  );
  return true;
}

// ───────────────────────────────── 5. liens sécurisés, accès partagés

async function etapeLiens(): Promise<number> {
  let n = 0;
  for (const p of proprios) {
    const plan = PERIODES.find(x => x.cible === 'SENT');
    if (!plan) continue;
    const releve = await releveExistant(p, plan.periode);
    if (!releve || releve.status === 'DRAFT') {
      console.log(`  ${p.nom} · ${plan.periode} : relevé absent ou brouillon, pas de lien`);
      continue;
    }
    const filtre = { scope: 'OWNER_MONTHLY_REPORT' as const, objectType: 'OwnerStatement', objectId: releve.id };
    const liens = await listSecureLinks(TENANT_ID, filtre);
    const actifs = liens.filter(l => l.status === 'ACTIVE').length;
    const revoques = liens.filter(l => l.status === 'REVOKED').length;
    // Odile Yéo : un lien actif et un lien révoqué ; les autres : un lien actif.
    const veutRevoque = p.cle === 'odile.yeo';

    if (actifs === 0) {
      await essaie(`${p.nom} · rapport mensuel ${plan.periode} : lien actif`, async () => {
        const lien = await createSecureLink({
          tenantId: TENANT_ID,
          scope: 'OWNER_MONTHLY_REPORT',
          objectType: 'OwnerStatement',
          objectId: releve.id,
          createdByUserId: acteur,
          ttlDays: 30
        });
        n++;
        // Une lecture par le chemin public de l'application : vérifie le lien et le rapport.
        const rapport = await getOwnerMonthlyReportByToken(lien.token, {
          userAgent: 'Démonstration — contrôle du lien'
        });
        console.log(
          `      rapport lu : net ${fcfa(rapport.totals.netAmount)} (relevé : ${fcfa(Number(releve.netAmount))})`
        );
        console.log(`      lien (jeton affiché cette seule fois) : ${lien.url}`);
      });
    }
    if (veutRevoque && revoques === 0) {
      await essaie(`${p.nom} · rapport mensuel ${plan.periode} : lien envoyé puis révoqué`, async () => {
        const lien = await createSecureLink({
          tenantId: TENANT_ID,
          scope: 'OWNER_MONTHLY_REPORT',
          objectType: 'OwnerStatement',
          objectId: releve.id,
          createdByUserId: acteur,
          ttlDays: 14
        });
        await revokeSecureLink(TENANT_ID, lien.id, acteur, { objectType: 'OwnerStatement', objectId: releve.id });
        n++;
      });
    }
  }
  return n;
}

const ACCES_PARTAGES = [
  {
    type: 'NOTARY' as const,
    nom: 'Me Aïssatou Cissé — Étude Cissé & Associés',
    email: 'etude.cisse@exemple.test',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS'] as const,
    joursValidite: 90,
    avecTitres: true,
    consultation: true
  },
  {
    type: 'ACCOUNTANT' as const,
    nom: 'Cabinet Ouattara Expertise Comptable',
    email: 'compta.ouattara@exemple.test',
    sections: ['EXPENSES', 'RENTS', 'YIELD_RATIOS'] as const,
    joursValidite: 6,
    avecTitres: false,
    consultation: false
  }
];

async function etapeAccesPartages(): Promise<number> {
  const odile = proprio('odile.yeo');
  // Biens sous mandat : « client » (sans agence) ou portant l'agence, on les retrouve par référence et propriétaire.
  const ids = (
    await prisma.property.findMany({
      where: { internalReference: { in: ['PRES-007', 'PRES-010'] }, ownerUserId: odile.userId },
      select: { id: true }
    })
  ).map(b => b.id);
  if (ids.length === 0) throw new Error('Biens PRES-007 / PRES-010 introuvables');

  let n = 0;
  for (const plan of ACCES_PARTAGES) {
    const deja = await prisma.externalAccessGrant.findFirst({
      where: { tenantId: TENANT_ID, recipientEmail: plan.email },
      select: { id: true }
    });
    if (deja) continue;

    await essaie(`accès partagé ${plan.type} d'Odile Yéo : ${plan.nom}`, async () => {
      const documentIds: string[] = [];
      if (plan.avecTitres) {
        for (const id of ids) {
          const docs = (await listPropertyDocumentsForSharing(TENANT_ID, id)).items;
          documentIds.push(...docs.filter(d => d.documentType === 'TITLE_DEED').map(d => d.id));
        }
      }
      const saisie = createGrantSchema.parse({
        type: plan.type,
        recipientName: plan.nom,
        recipientEmail: plan.email,
        ownerClientId: odile.clientId,
        propertyIds: ids,
        sections: [...plan.sections],
        documentIds,
        expiresAt: new Date(MAINTENANT.getTime() + plan.joursValidite * 24 * 3600 * 1000).toISOString(),
        linkTtlDays: 30,
        sendEmail: false
      });
      const resultat = await createExternalAccessGrant(TENANT_ID, acteur, saisie);
      n++;
      console.log(
        `      ${documentIds.length} document(s) partagé(s), statut ${(resultat.grant as { status?: string }).status ?? '?'}`
      );
      if (plan.consultation) {
        // Le notaire ouvre son lien : c'est l'application qui écrit la consultation dans le journal.
        const token = resultat.link.url.split('#')[1] ?? '';
        const vue = await getExternalAccessViewByToken(token, { userAgent: 'Démonstration — première consultation' });
        console.log(
          `      consultation enregistrée par l'application (${(vue as { properties?: unknown[] }).properties?.length ?? '?'} bien(s) lus)`
        );
      }
    });
  }
  return n;
}

// ─────────────────────────────────────────── 6. portail propriétaire

const REGLAGES_PORTAIL = {
  patrimonyEnabled: true,
  patrimonyShowValuation: true,
  patrimonyShowYield: true,
  patrimonyShowLoans: false,
  patrimonyShowWorks: true,
  patrimonyShowDocuments: true
};

async function etapeReglagesPortail(): Promise<number> {
  const ligne = await prisma.ownerPortalSettings.findUnique({ where: { tenantId: TENANT_ID }, select: { id: true } });
  const actuel = await getOwnerPortalSettings(TENANT_ID);
  const identiques = (Object.keys(REGLAGES_PORTAIL) as (keyof typeof REGLAGES_PORTAIL)[]).every(
    cle => actuel[cle] === REGLAGES_PORTAIL[cle]
  );
  if (ligne && identiques) return 0;
  await updateOwnerPortalSettings(TENANT_ID, REGLAGES_PORTAIL, acteur);
  console.log('  + réglages du portail : patrimoine visible, emprunts masqués');
  return 1;
}

async function etapeAccesPortail(): Promise<number> {
  let n = 0;
  for (const p of proprios.filter(x => x.portail)) {
    const utilisateur = await prisma.user.findUnique({
      where: { id: p.userId },
      select: { passwordHash: true, emailVerified: true, isActive: true }
    });
    const client = await prisma.tenantClient.findFirst({
      where: { id: p.clientId, tenantId: TENANT_ID },
      select: { ownerPortalEnabled: true }
    });
    if (!utilisateur) continue;
    const motDePasseBon = utilisateur.passwordHash
      ? await comparePassword(PACK_TEST_PASSWORD, utilisateur.passwordHash)
      : false;
    if (motDePasseBon && utilisateur.emailVerified && utilisateur.isActive && client?.ownerPortalEnabled) continue;

    await prisma.user.update({
      where: { id: p.userId },
      data: {
        ...(motDePasseBon ? {} : { passwordHash: await hashPassword(PACK_TEST_PASSWORD) }),
        emailVerified: true,
        isActive: true
      },
      select: { id: true }
    });
    await prisma.tenantClient.updateMany({
      where: { id: p.clientId, tenantId: TENANT_ID },
      data: { ownerPortalEnabled: true }
    });
    console.log(`  + accès portail ouvert pour ${p.nom} (${p.email})`);
    n++;
  }
  return n;
}

// ───────────────────────────────────────── 7. ce que voit le portail

const taille = (v: unknown): string => (Array.isArray(v) ? String(v.length) : '?');

async function resumePortail(p: Proprio): Promise<void> {
  await runWithTenantContext({ tenantId: TENANT_ID, userId: p.userId, isSuperAdmin: false }, async () => {
    const ids = await resolveOwnerPortalPropertyIds({
      userId: p.userId,
      tenantClientId: p.clientId,
      tenantId: TENANT_ID
    });
    const service = new OwnerPortalService();
    console.log(`\n  Portail de ${p.nom} (${p.email})`);
    console.log(`    périmètre : ${ids.length} bien(s)`);

    const lire = async (libelle: string, fn: () => Promise<string>) => {
      try {
        console.log(`    ${libelle} : ${await fn()}`);
      } catch (e) {
        console.log(`    ${libelle} : ⨯ ${dernierMessage(e)}`);
      }
    };
    await lire('tableau de bord', async () => {
      const d = (await service.getDashboard(ids, TENANT_ID)) as any;
      const s = d.portfolioSummary;
      return `${s.total} biens (${s.rented} loués, ${s.available} vacants), taux d'occupation ${d.occupancyRate} %, revenus du mois ${fcfa(d.revenueMetrics.currentMonth)}, de l'année ${fcfa(d.revenueMetrics.currentYear)}`;
    });
    await lire(
      'biens',
      async () => `${taille(((await service.getProperties(ids, TENANT_ID)) as any).properties)} fiche(s)`
    );
    await lire('baux', async () => {
      const r = (await service.getLeases(ids, TENANT_ID)) as any;
      return `${taille(r.leases)} bail(aux) ${JSON.stringify(r.summary)}`;
    });
    await lire('revenus', async () => {
      const r = (await service.getRevenueSummary(ids, TENANT_ID)) as any;
      return `mois ${fcfa(r.currentMonth)}, mois précédent ${fcfa(r.lastMonth)}, année ${fcfa(r.currentYear)}, total ${fcfa(r.allTime)}`;
    });
    await lire(
      'paiements',
      async () => `${taille(((await service.getPayments(ids, TENANT_ID)) as any).payments)} règlement(s)`
    );
    await lire(
      'documents',
      async () => `${taille(((await service.getDocuments(ids, TENANT_ID)) as any).documents)} pièce(s)`
    );
    await lire('incidents', async () => {
      const r = (await service.getMaintenanceTickets(ids, TENANT_ID)) as any;
      return `${taille(r.tickets)} ticket(s) ${JSON.stringify(r.summary)}`;
    });
    await lire('compte courant et reversements', async () => {
      const c = (await getOwnerAccount(TENANT_ID, p.clientId)) as any;
      const payouts = c.payouts as { status: string }[];
      return `solde dû ${fcfa(c.balance)}, loyers ${fcfa(c.totals.rentCollected)}, honoraires ${fcfa(c.totals.fees)}, reversements ${fcfa(c.totals.payouts)} (${payouts.length} dont ${payouts.filter(x => x.status === 'VOIDED').length} annulé(s)), ${taille(c.movements)} mouvement(s)`;
    });
    await lire('relevés (consultés par lien sécurisé)', async () => {
      const r = await listOwnerStatements(TENANT_ID, { ownerContactId: p.contactId });
      const parStatut = r.reduce<Record<string, number>>(
        (acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }),
        {}
      );
      return `${r.length} ${JSON.stringify(parStatut)}`;
    });
    await lire('patrimoine', async () => {
      const r = (await getOwnerPortalPatrimoine(TENANT_ID, p.clientId, ids)) as any;
      return `${taille(r.properties)} bien(s), sections ${JSON.stringify(r.sections ?? {})}`;
    });
  });
}

async function etapePortail(): Promise<number> {
  let n = 0;
  for (const p of proprios.filter(x => x.portail)) {
    await resumePortail(p);
    n++;
  }
  return n;
}

// ───────────────────────────────────────────────────── contrôles et bilan

/** Compteurs des tables touchées : la différence entre deux passages dit ce que le script a créé. */
async function instantane(): Promise<Record<string, number>> {
  const idsProprios = proprios.map(p => p.clientId);
  const comptes = await prisma.thirdPartyAccount.findMany({
    where: { tenantId: TENANT_ID, kind: 'OWNER', tenantClientId: { in: idsProprios } },
    select: { id: true }
  });
  const [terms, leaseTerms, rates, fees, withholdings, statements, payouts, links, grants, settings, movements] =
    await Promise.all([
      prisma.ownerManagementTerms.count({ where: { tenantId: TENANT_ID, ownerClientId: { in: idsProprios } } }),
      prisma.leaseManagementTerms.count({ where: { tenantId: TENANT_ID } }),
      prisma.agentCommissionRate.count({ where: { tenantId: TENANT_ID } }),
      prisma.managementFee.count({ where: { tenantId: TENANT_ID, ownerClientId: { in: idsProprios } } }),
      prisma.rentWithholding.count({ where: { tenantId: TENANT_ID, ownerClientId: { in: idsProprios } } }),
      prisma.ownerStatement.groupBy({
        by: ['status'],
        where: { tenantId: TENANT_ID, ownerContactId: { in: proprios.map(p => p.contactId) } },
        _count: true
      }),
      prisma.ownerPayout.groupBy({
        by: ['status'],
        where: { tenantId: TENANT_ID, ownerClientId: { in: idsProprios } },
        _count: true
      }),
      prisma.secureLink.count({
        where: { tenantId: TENANT_ID, scope: { in: ['OWNER_MONTHLY_REPORT', 'EXTERNAL_ACCESS_GRANT'] } }
      }),
      prisma.externalAccessGrant.count({ where: { tenantId: TENANT_ID, ownerClientId: { in: idsProprios } } }),
      prisma.ownerPortalSettings.count({ where: { tenantId: TENANT_ID } }),
      prisma.thirdPartyMovement.count({ where: { accountId: { in: comptes.map(c => c.id) } } })
    ]);
  const etat: Record<string, number> = {
    owner_management_terms: terms,
    lease_management_terms: leaseTerms,
    agent_commission_rates: rates,
    management_fees: fees,
    rent_withholdings: withholdings,
    secure_links: links,
    external_access_grants: grants,
    owner_portal_settings: settings,
    'comptes propriétaires (mouvements)': movements
  };
  for (const s of statements) etat[`owner_statements ${s.status}`] = s._count;
  for (const s of payouts) etat[`owner_payouts ${s.status}`] = s._count;
  return etat;
}

function afficherDifferences(avant: Record<string, number>, apres: Record<string, number>): void {
  console.log('\n──────────── CE QUE CE PASSAGE A CRÉÉ ────────────');
  const cles = [...new Set([...Object.keys(avant), ...Object.keys(apres)])].sort();
  let changements = 0;
  for (const cle of cles) {
    const a = avant[cle] ?? 0;
    const b = apres[cle] ?? 0;
    if (a === b) continue;
    changements++;
    console.log(`${cle.padEnd(40)} ${String(a).padStart(5)} → ${String(b).padStart(5)}`);
  }
  if (changements === 0)
    console.log('Rien de créé : tout était déjà en place (les brouillons ont seulement été recalculés).');
  console.log('\nÉtat final :');
  for (const cle of cles) console.log(`  ${cle.padEnd(40)} ${String(apres[cle] ?? 0).padStart(5)}`);
}

async function etapeControles(): Promise<number> {
  // État des commissions des collaborateurs, mois par mois.
  for (const { periode } of PERIODES) {
    const c = await getAgentCommissions(TENANT_ID, periode);
    const gestionnaires = c.agents
      .map(a => `${a.agentName} ${a.feeCount} honoraire(s) ${fcfa(a.feesAmount)} → part ${fcfa(a.shareAmount)}`)
      .join(' · ');
    console.log(
      `  commissions ${periode} : honoraires ${fcfa(c.totals.feesAmount)}, parts ${fcfa(c.totals.shareAmount)}${gestionnaires ? ` — ${gestionnaires}` : ''}`
    );
  }
  // Cohérence : le net des relevés réglés + le solde du compte = loyers - honoraires - retenues - dépenses - reversements.
  for (const p of proprios) {
    const compte = (await getOwnerAccount(TENANT_ID, p.clientId)) as any;
    const releves = await prisma.ownerStatement.findMany({
      where: { tenantId: TENANT_ID, ownerContactId: p.contactId },
      select: { status: true, netAmount: true }
    });
    const reverses = compte.payouts
      .filter((x: any) => x.status === 'VALIDATED')
      .reduce((s: number, x: any) => s + x.amount, 0);
    const nets = releves.filter(r => r.status === 'PAID').reduce((s, r) => s + Number(r.netAmount), 0);
    console.log(
      `  ${p.initiales} : solde dû ${fcfa(compte.balance)} · reversements valides ${fcfa(reverses)} pour ${fcfa(nets)} de relevés réglés` +
        (Math.abs(reverses - nets) > 1 ? '  ⚠ écart' : '')
    );
  }
  return 0;
}

async function main() {
  assertNotProduction('seed-demo-presentation-proprietaires.ts');
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  console.log(`Agence : ${tenant.name}`);

  await chargerContexte();
  const avant = await instantane();

  await runWithTenantContext({ tenantId: TENANT_ID, userId: acteur, isSuperAdmin: false }, async () => {
    await etape(
      'Honoraires : part du collaborateur, dérogations par bail, conditions des propriétaires',
      etapeHonoraires
    );
    await etape('Retenue à la source sur loyers', etapeRetenue);
    await etape('Réglages du portail propriétaire', etapeReglagesPortail);
    await etape('Accès au portail (comptes de connexion)', etapeAccesPortail);
    await etape('Comptes courants propriétaires (synchronisation)', etapeComptes);
    await etape('Relevés de gérance et reversements', etapeReleves);
    await etape('Reversement de reprise (loyers antérieurs aux relevés)', etapeReprise);
    await etape('Liens sécurisés du rapport mensuel', etapeLiens);
    await etape('Accès partagés en lecture seule', etapeAccesPartages);
    await etape('Contrôles : commissions et cohérence des comptes', etapeControles);
    await etape('Ce que voit le portail propriétaire', etapePortail);
  });

  await flushAuditEvents().catch(() => 0);
  afficherDifferences(avant, await instantane());

  console.log('\n──────────── BILAN ────────────');
  for (const b of bilan) {
    console.log(`${b.etape.padEnd(86)} ${String(b.ok).padStart(4)}${b.echecs.length ? '   ⨯ ' + b.echecs[0] : ''}`);
  }
  if (avertissementsGarde.size > 0) {
    const detail = [...avertissementsGarde.entries()].sort((a, b) => b[1] - a[1]).map(([cle, nb]) => `${cle} ×${nb}`);
    console.log(
      `\nGarde-fou tenant (requêtes de l'application sans filtre d'agence, écartées de l'affichage) : ${detail.join(', ')}`
    );
  }
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
