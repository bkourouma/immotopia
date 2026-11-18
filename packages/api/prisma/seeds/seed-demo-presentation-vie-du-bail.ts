/**
 * Jeu de données de présentation — « Vie du bail », « Dépôt de garantie »,
 * statuts de bail et colocataires.
 *
 * Suite de `seed-demo-presentation-locative.ts` et de
 * `seed-demo-presentation-etats-des-lieux.ts` : les 18 baux `PRES-NNN` sont tous
 * ACTIVE, sans historique ni colocataire. Ce script déroule le cycle de vie de
 * ceux qui lui sont attribués :
 *
 *   BAIL-2026-0013  préavis puis résiliation (ENDED), retenue sur le dépôt
 *                   (HOLD) et remboursement du solde (REFUND)
 *   BAIL-2026-0020  idem, avec retenue provisoire puis libération (RELEASE)
 *   BAIL-2026-0017  révision de loyer appliquée + révision planifiée, conjointe
 *                   colocataire, avenant
 *   BAIL-2026-0025  renouvellement, avenant d'extension, révision planifiée,
 *                   deux associés colocataires, ajustement du dépôt
 *   BAIL-2026-0019  préavis du locataire : résiliation planifiée (bail encore ACTIVE)
 *   BAIL-2026-0021  bail SUSPENDU (dossier de recouvrement), avenant d'apurement
 *   + 3 nouveaux baux : deux brouillons (PRES-012, PRES-009) et un bail annulé
 *     (PRES-020), sur des biens qui restent disponibles.
 *
 * Mêmes partis pris que les autres scripts de présentation.
 *
 *   1. **Tout passe par les services de l'application** : `reviseRent`,
 *      `renewLease`, `recordAmendment`, `terminateLease`, `updateLeaseStatus`,
 *      `addCoRenter`, `createLease`, `createDepositMovement`. Écrits en base
 *      faute de service : le statut DRAFT d'un bail (aucune transition n'y mène),
 *      la date de création des événements et des mouvements (les services
 *      datent du jour de l'appel), la cible du dépôt après un ajustement.
 *
 *   2. **Aucun envoi sortant** : SMTP, SMS et WhatsApp sont neutralisés avant
 *      tout import. Les « Error sending email » sont normaux.
 *
 *   3. **Idempotent** : chaque élément est retrouvé par sa clé naturelle (résumé
 *      de l'événement, type de mouvement, e-mail du contact, bien) avant d'être
 *      créé ; on peut relancer sans rien dupliquer.
 *
 *   4. **Une étape qui échoue n'arrête pas les autres** : elle est signalée au bilan.
 *
 * Les résiliations de 0013 et 0020 sont jouées en dernier : un autre script
 * génère leurs contrats en parallèle.
 *
 * Usage : npm run db:seed:presentation-vie-du-bail -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.WASENDER_API_KEY;

import {
  PrismaClient,
  LeaseEventType,
  PropertyStatus,
  RentalDepositMovementType as Mouvement,
  RentalLeaseStatus
} from '@prisma/client';

import { prisma as appPrisma } from '../../src/utils/database';
import { createLease, updateLease, updateLeaseStatus, addCoRenter } from '../../src/services/rental-lease-service';
import { createDepositMovement } from '../../src/services/rental-deposit-service';
import { getOrCreateTenantClientFromContact } from '../../src/services/tenant-service';
import { updatePropertyStatus } from '../../src/services/property-status-service';
import { syncLotActivationsTx } from '../../src/services/lot-registry-service';
import {
  reviseRent,
  renewLease,
  recordAmendment,
  terminateLease,
  getFinalSettlement
} from '../../src/lib/lease-lifecycle/service';

const prisma = new PrismaClient({ log: [] });
const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const NOW = new Date();
let acteur = '';

// ───────────────────────────────────────────────────────────────── dates

/** `base` décalée de `jours`, à l'heure UTC donnée (les dates de la base sont en UTC). */
function auJour(base: Date, jours: number, heure = 10, minute = 0): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + jours, heure, minute));
}

/** Midi UTC du premier jour du mois de `base`, décalé de `mois`. */
function premierDuMois(base: Date, mois = 0): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + mois, 1, 12));
}

/** Midi UTC du dernier jour du mois de `base`. */
function finDuMois(base: Date): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 12));
}

/** `AAAA-MM-JJ`, format attendu par les services du cycle de vie. */
const jour = (d: Date) => d.toISOString().slice(0, 10);
const mois = (d: Date) => d.toISOString().slice(0, 7);
const fr = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const fcfa = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ───────────────────────────────────────────────────────── étapes et bilan

const crees = {
  contacts: 0,
  colocataires: 0,
  baux: 0,
  evenements: {} as Record<string, number>,
  mouvements: {} as Record<string, number>
};
const bilan: { etape: string; echecs: string[] }[] = [];
let courant: { etape: string; echecs: string[] } | null = null;

function compter(table: Record<string, number>, cle: string) {
  table[cle] = (table[cle] ?? 0) + 1;
}

function messageDe(e: unknown): string {
  return e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
}

/** Une étape qui échoue est notée au bilan ; les autres continuent. */
async function etape(nom: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n── ${nom}`);
  courant = { etape: nom, echecs: [] };
  bilan.push(courant);
  try {
    await fn();
  } catch (e) {
    console.log(`  ⨯ étape interrompue : ${messageDe(e)}`);
    courant.echecs.push(messageDe(e));
  }
}

/**
 * Tente une écriture ; renvoie vrai si elle est passée, journalise sinon.
 * `silencieux` : pas de « + » en cas de succès (l'appelant sait mieux ce qu'il a fait).
 */
async function essaie(libelle: string, fn: () => Promise<unknown>, silencieux = false): Promise<boolean> {
  try {
    await fn();
    if (!silencieux) console.log(`  + ${libelle}`);
    return true;
  } catch (e) {
    console.log(`  ⨯ ${libelle} — ${messageDe(e)}`);
    courant?.echecs.push(`${libelle} — ${messageDe(e)}`);
    return false;
  }
}

// ───────────────────────────────────────────────────────────── contacts

interface Contact {
  cle: string;
  prenom: string;
  nom: string;
  profession: string;
  tel: string;
}

const CONTACTS: Record<string, Contact> = {
  mariam: {
    cle: 'mariam.ouattara',
    prenom: 'Mariam',
    nom: 'Ouattara',
    profession: 'Consultante en gestion',
    tel: '0707110031'
  },
  aissata: {
    cle: 'aissata.konate',
    prenom: 'Aïssata',
    nom: 'Konaté',
    profession: 'Directrice financière',
    tel: '0707110032'
  },
  desire: {
    cle: 'desire.gnagne',
    prenom: 'Désiré',
    nom: 'Gnagne',
    profession: 'Directeur technique',
    tel: '0707110033'
  },
  yannick: { cle: 'yannick.brou', prenom: 'Yannick', nom: 'Brou', profession: 'Ingénieur BTP', tel: '0707110034' },
  boubacar: {
    cle: 'boubacar.sylla',
    prenom: 'Boubacar',
    nom: 'Sylla',
    profession: 'Gérant de cabinet de conseil',
    tel: '0707110035'
  },
  rosine: { cle: 'rosine.aka', prenom: 'Rosine', nom: 'Aka', profession: 'Cadre de banque', tel: '0707110036' }
};

const emailDe = (cle: string) => `${cle}.pres@exemple.test`;

async function contactId(c: Contact): Promise<string> {
  const email = emailDe(c.cle);
  const existant = await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } });
  if (existant) return existant.id;
  const cree = await prisma.crmContact.create({
    data: {
      tenantId: TENANT_ID,
      contactType: 'PERSON',
      firstName: c.prenom,
      lastName: c.nom,
      email,
      phonePrimary: c.tel,
      whatsappNumber: c.tel,
      profession: c.profession,
      country: "Côte d'Ivoire",
      city: 'Abidjan',
      preferredLanguage: 'fr',
      source: 'Démonstration gestion locative'
    },
    select: { id: true }
  });
  crees.contacts++;
  console.log(`  + contact ${c.prenom} ${c.nom} (${email})`);
  return cree.id;
}

// ──────────────────────────────────────────────────────────── lectures

async function bail(numero: string) {
  const l = await prisma.rentalLease.findFirst({
    where: { tenant_id: TENANT_ID, lease_number: numero },
    select: {
      id: true,
      lease_number: true,
      status: true,
      property_id: true,
      start_date: true,
      end_date: true,
      notes: true,
      rent_amount: true,
      security_deposit_amount: true,
      owner_client_id: true
    }
  });
  if (!l) throw new Error(`${numero} introuvable : lancer d'abord db:seed:presentation-locative`);
  return l;
}

async function sortieFinalisee(leaseId: string) {
  const s = await prisma.leaseInspection.findFirst({
    where: { tenantId: TENANT_ID, leaseId, type: 'EXIT', status: 'FINALIZED' },
    select: { inspectionDate: true, deductions: true }
  });
  if (!s) throw new Error("état des lieux de sortie finalisé introuvable : lancer d'abord db:seed:presentation-edl");
  const retenues = (Array.isArray(s.deductions) ? s.deductions : []) as unknown as { label: string; amount: number }[];
  return {
    date: s.inspectionDate,
    retenues,
    total: retenues.reduce((somme, r) => somme + Number(r.amount || 0), 0)
  };
}

// ─────────────────────────────────────────── événements de la vie du bail

/**
 * Crée l'événement par le service s'il n'existe pas (clé : type + résumé), puis
 * le date. Les services datent un événement du jour de l'appel : la date de
 * création est ramenée au moment où le gestionnaire l'aurait saisi, pour que
 * l'historique (« Par …, le … ») se lise comme une vraie histoire.
 */
async function evenement(
  numero: string,
  libelle: string,
  type: LeaseEventType,
  resume: string,
  saisiLe: Date,
  creer: (leaseId: string) => Promise<{ id: string }>
): Promise<void> {
  const l = await bail(numero);
  const trouve = await prisma.leaseEvent.findFirst({
    where: { tenantId: TENANT_ID, leaseId: l.id, type, summary: resume },
    select: { id: true, createdAt: true }
  });
  const ligne: { v: { id: string; createdAt: Date } | null } = { v: trouve };
  if (!ligne.v) {
    const ok = await essaie(`${numero} — ${libelle}`, async () => {
      const dto = await creer(l.id);
      compter(crees.evenements, type);
      ligne.v = { id: dto.id, createdAt: new Date() };
    });
    if (!ok) return;
  } else {
    console.log(`  = ${numero} — ${libelle} (déjà présent)`);
  }
  if (ligne.v && Math.abs(ligne.v.createdAt.getTime() - saisiLe.getTime()) > 60_000) {
    await prisma.leaseEvent.update({ where: { id: ligne.v.id }, data: { createdAt: saisiLe } });
  }
}

// ───────────────────────────────────────────────── mouvements de dépôt

/**
 * Un mouvement de dépôt par type et par dépôt (clé : dépôt + type), créé par le
 * service, puis daté. `createDepositMovement` n'accepte pas de date : la date du
 * mouvement — et celle de l'écriture comptable d'un remboursement ou d'une
 * confiscation, calée sur elle — est ramenée au jour réel de l'opération.
 */
async function mouvementDepot(numero: string, type: Mouvement, montant: number, note: string, le: Date): Promise<void> {
  const l = await bail(numero);
  const depot = await prisma.rentalSecurityDeposit.findUnique({ where: { lease_id: l.id }, select: { id: true } });
  if (!depot) {
    console.log(`  ⨯ ${numero} — pas de dépôt de garantie`);
    return;
  }
  const trouve = await prisma.rentalDepositMovement.findFirst({
    where: { tenant_id: TENANT_ID, deposit_id: depot.id, type },
    select: { id: true, created_at: true }
  });
  const ligne: { v: { id: string; created_at: Date } | null } = { v: trouve };
  if (!ligne.v) {
    const ok = await essaie(`${numero} — dépôt : ${type} ${fcfa(montant)} FCFA`, async () => {
      const m = await createDepositMovement(TENANT_ID, depot.id, type, montant, undefined, undefined, note, acteur);
      compter(crees.mouvements, type);
      ligne.v = { id: m.id, created_at: m.created_at };
    });
    if (!ok) return;
  } else {
    console.log(`  = ${numero} — dépôt : ${type} (déjà présent)`);
  }
  const mouvement = ligne.v;
  if (!mouvement) return;
  if (Math.abs(mouvement.created_at.getTime() - le.getTime()) > 60_000) {
    await prisma.rentalDepositMovement.update({ where: { id: mouvement.id }, data: { created_at: le } });
  }
  if (type === Mouvement.REFUND || type === Mouvement.FORFEIT) {
    await prisma.journalEntry.updateMany({
      where: {
        tenantId: TENANT_ID,
        documentType: 'RENTAL_DEPOSIT_MOVEMENT',
        OR: [{ documentId: mouvement.id }, { documentId: { startsWith: `${mouvement.id}:r` } }]
      },
      data: { entryDate: le }
    });
  }
}

// ─────────────────────────────────────────────────────────── colocataires

async function colocataire(numero: string, c: Contact): Promise<void> {
  const l = await bail(numero);
  const idContact = await contactId(c);
  const { tenantClient } = await getOrCreateTenantClientFromContact(TENANT_ID, idContact, 'RENTER', { notify: false });
  const existant = await prisma.rentalLeaseCoRenter.findFirst({
    where: { tenant_id: TENANT_ID, lease_id: l.id, renter_client_id: tenantClient.id },
    select: { id: true }
  });
  if (existant) {
    console.log(`  = ${numero} — colocataire ${c.prenom} ${c.nom} (déjà présent)`);
    return;
  }
  const ok = await essaie(`${numero} — colocataire ${c.prenom} ${c.nom}`, () =>
    addCoRenter(TENANT_ID, l.id, tenantClient.id, acteur)
  );
  if (ok) crees.colocataires++;
}

// ─────────────────────────────────────────────────────── révisions de loyer

/** Premier mois dont aucune échéance n'est réglée : la révision refuse un mois déjà payé, même en partie. */
async function premierMoisRevisable(leaseId: string): Promise<Date> {
  const derniere = await prisma.rentalInstallment.findFirst({
    where: {
      lease_id: leaseId,
      status: { not: 'CANCELED' },
      OR: [{ amount_paid: { gt: 0 } }, { status: { in: ['PAID', 'PARTIAL'] } }]
    },
    orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    select: { period_year: true, period_month: true }
  });
  if (!derniere) return premierDuMois(NOW);
  return new Date(Date.UTC(derniere.period_year, derniere.period_month, 1, 12));
}

// ─────────────────────────────────────────────────────────── BAIL 0017

async function bail0017() {
  const n = 'BAIL-2026-0017';
  const l = await bail(n);
  if (!l.owner_client_id) console.log(`  ! ${n} sans propriétaire (rattaché par le script des propriétaires)`);

  await colocataire(n, CONTACTS.mariam);
  const resumeConjointe =
    'Avenant n°1 : Mme Mariam Ouattara, conjointe du locataire, devient colocataire et solidaire du paiement du loyer et des charges.';
  await evenement(
    n,
    'avenant : ajout de la conjointe',
    LeaseEventType.AMENDMENT,
    resumeConjointe,
    auJour(premierDuMois(NOW, -8), 2, 10),
    id =>
      recordAmendment(TENANT_ID, id, { effectiveDate: jour(premierDuMois(NOW, -8)), summary: resumeConjointe }, acteur)
  );

  // Révision appliquée. Le service refuse un mois déjà réglé, même en partie : tous
  // les loyers échus de ce bail sont payés, la première révision possible est donc
  // celle du mois qui suit le dernier loyer payé, et non une révision rétroactive.
  const resume1 =
    "Indexation annuelle de +3 % sur l'indice de référence des loyers, notifiée au locataire par lettre recommandée du 15 juillet.";
  await evenement(n, 'révision +3 % appliquée', LeaseEventType.REVISION, resume1, auJour(NOW, -110, 9), async id => {
    const mois1 = await premierMoisRevisable(id);
    console.log(`    ↳ prise d'effet le ${fr(mois1)} (premier mois sans échéance réglée)`);
    return reviseRent(
      TENANT_ID,
      id,
      { effectiveMonth: mois(mois1), newRent: 875500, newCharges: 60000, revisionRate: 3, summary: resume1 },
      acteur
    );
  });

  // Révision planifiée : date d'effet future, le loyer du bail ne change qu'à cette date.
  const resume2 =
    "Palier conventionnel du bail : loyer porté à 900 000 FCFA au 1er janvier, après l'installation d'un groupe électrogène par le bailleur.";
  const mois2 = premierDuMois(NOW, 2);
  await evenement(n, `révision planifiée au ${fr(mois2)}`, LeaseEventType.REVISION, resume2, auJour(NOW, -20, 15), id =>
    reviseRent(
      TENANT_ID,
      id,
      { effectiveMonth: mois(mois2), newRent: 900000, newCharges: 60000, revisionRate: 2.8, summary: resume2 },
      acteur
    )
  );
}

// ─────────────────────────────────────────────────────────── BAIL 0025

async function bail0025() {
  const n = 'BAIL-2026-0025';
  const l = await bail(n);

  await colocataire(n, CONTACTS.aissata);
  await colocataire(n, CONTACTS.desire);
  const resumeAssocies =
    'Avenant n°2 : Mme Aïssata Konaté et M. Désiré Gnagne, associés de la société, deviennent colocataires solidaires du bail.';
  await evenement(
    n,
    'avenant : deux associés colocataires',
    LeaseEventType.AMENDMENT,
    resumeAssocies,
    auJour(premierDuMois(NOW, -9), 3, 11),
    id =>
      recordAmendment(TENANT_ID, id, { effectiveDate: jour(premierDuMois(NOW, -9)), summary: resumeAssocies }, acteur)
  );

  // Renouvellement AVANT la révision : les échéances qu'il crée sont repassées au
  // loyer effectif par la révision qui suit. Dans l'ordre inverse, elles naîtraient
  // au loyer d'aujourd'hui (le service n'y applique pas les révisions planifiées).
  const resumeRenouvellement =
    "Prolongation anticipée d'un an à la demande du locataire, en contrepartie de l'extension de surface (avenant n°1).";
  await evenement(n, 'renouvellement', LeaseEventType.RENEWAL, resumeRenouvellement, auJour(NOW, -27, 10), async id => {
    const actuelle = await bail(n);
    if (!actuelle.end_date) throw new Error('bail sans date de fin');
    const nouvelleFin = new Date(
      Date.UTC(
        actuelle.end_date.getUTCFullYear() + 1,
        actuelle.end_date.getUTCMonth(),
        actuelle.end_date.getUTCDate(),
        12
      )
    );
    const { renewal } = await renewLease(
      TENANT_ID,
      id,
      { newEndDate: jour(nouvelleFin), summary: resumeRenouvellement },
      acteur
    );
    return renewal;
  });

  const prise = premierDuMois(NOW, 1);
  const resumeExtension =
    'Avenant n°1 : extension de surface — intégration du local commercial du rez-de-chaussée (+120 m²) et de 10 places de stationnement supplémentaires.';
  await evenement(
    n,
    'avenant : extension de surface',
    LeaseEventType.AMENDMENT,
    resumeExtension,
    auJour(NOW, -20, 10),
    id => recordAmendment(TENANT_ID, id, { effectiveDate: jour(prise), summary: resumeExtension }, acteur)
  );

  const resumeRevision =
    "Majoration de 5 % consécutive à l'avenant n°1 (extension de surface et de stationnement) : loyer 5 040 000, charges 420 000 par trimestre.";
  await evenement(
    n,
    `révision planifiée +5 % au ${fr(prise)}`,
    LeaseEventType.REVISION,
    resumeRevision,
    auJour(NOW, -20, 11),
    id =>
      reviseRent(
        TENANT_ID,
        id,
        { effectiveMonth: mois(prise), newRent: 5040000, newCharges: 420000, revisionRate: 5, summary: resumeRevision },
        acteur
      )
  );

  // Dépôt : deux mois du nouveau loyer. L'ajustement est un mouvement de dépôt ;
  // ni lui ni le bail ne mettent la cible du dépôt à jour, d'où l'écriture directe.
  const nouvelleCaution = 10080000;
  await mouvementDepot(
    n,
    Mouvement.ADJUSTMENT,
    nouvelleCaution - 9600000,
    "Ajustement du dépôt à deux mois du nouveau loyer (5 040 000), à la signature de l'avenant n°1.",
    auJour(NOW, -18, 11)
  );
  if (Number(l.security_deposit_amount) !== nouvelleCaution) {
    await essaie(`${n} — dépôt prévu au bail : ${fcfa(nouvelleCaution)} FCFA`, () =>
      updateLease(TENANT_ID, l.id, { securityDepositAmount: nouvelleCaution }, acteur)
    );
  }
  const depot = await prisma.rentalSecurityDeposit.findUnique({
    where: { lease_id: l.id },
    select: { id: true, target_amount: true }
  });
  if (depot && Number(depot.target_amount) !== nouvelleCaution) {
    await prisma.rentalSecurityDeposit.update({ where: { id: depot.id }, data: { target_amount: nouvelleCaution } });
    console.log(`  + ${n} — montant cible du dépôt porté à ${fcfa(nouvelleCaution)} FCFA`);
  }
}

// ─────────────────────────────────────────────────────────── BAIL 0021

async function bail0021() {
  const n = 'BAIL-2026-0021';
  const resume =
    "Avenant n°1 : protocole d'apurement des loyers impayés (échéancier en six mensualités à compter du 15 septembre), signé par le locataire.";
  const effet = auJour(NOW, -48, 12);
  await evenement(n, "avenant : protocole d'apurement", LeaseEventType.AMENDMENT, resume, auJour(effet, 0, 10), id =>
    recordAmendment(TENANT_ID, id, { effectiveDate: jour(effet), summary: resume }, acteur)
  );

  const l = await bail(n);
  if (l.status === RentalLeaseStatus.ACTIVE) {
    await essaie(`${n} — bail suspendu (dossier de recouvrement)`, () =>
      updateLeaseStatus(TENANT_ID, l.id, RentalLeaseStatus.SUSPENDED, acteur)
    );
  } else {
    console.log(`  = ${n} — statut ${l.status} (déjà changé)`);
  }

  // `updateLeaseStatus` ne garde pas de motif : il va dans les notes du bail.
  const motif = `Bail suspendu le ${fr(NOW)} : trois loyers impayés (août à octobre), protocole d'apurement non respecté, mise en demeure du ${fr(auJour(NOW, -11))} restée sans réponse. Dossier transmis au recouvrement.`;
  if (!(l.notes ?? '').includes('Bail suspendu le')) {
    await essaie(`${n} — motif de la suspension dans les notes`, () =>
      updateLease(TENANT_ID, l.id, { notes: [l.notes, motif].filter(Boolean).join('\n') }, acteur)
    );
  }
}

// ─────────────────────────────────────────────────────────── BAIL 0019

async function bail0019() {
  const n = 'BAIL-2026-0019';
  const preavis = auJour(NOW, -19, 12);
  const fin = finDuMois(NOW);
  const resume =
    "Congé donné par le locataire (nouveau poste à Dakar), préavis d'un mois pour un meublé ; remise des clés à la fin du mois.";
  await evenement(
    n,
    `préavis du locataire, fin du bail le ${fr(fin)}`,
    LeaseEventType.TERMINATION,
    resume,
    auJour(preavis, 1, 10),
    id =>
      terminateLease(
        TENANT_ID,
        id,
        {
          noticeDate: jour(preavis),
          effectiveDate: jour(fin),
          initiatedBy: 'TENANT',
          moveOutDate: jour(fin),
          summary: resume
        },
        acteur
      )
  );
}

// ─────────────────────────────────────────────────────── nouveaux baux

interface NouveauBail {
  ref: string;
  candidat: Contact;
  loyer: number;
  charges: number;
  jour: number;
  debut: Date;
  dureeMois: number;
  statut: 'DRAFT' | 'CANCELED';
  notes: string;
  proprietaire?: string;
}

async function nouveauBail(p: NouveauBail): Promise<void> {
  const reference = `PRES-${p.ref}`;
  const bien = await prisma.property.findFirst({
    where: { tenantId: TENANT_ID, internalReference: reference },
    select: { id: true, status: true }
  });
  if (!bien) throw new Error(`${reference} introuvable`);
  const existant = await prisma.rentalLease.findFirst({
    where: { tenant_id: TENANT_ID, property_id: bien.id },
    select: { id: true, lease_number: true, status: true, notes: true }
  });
  // Reprise : un bail encore ACTIVE qui porte nos notes est un bail dont la fin de
  // l'étape (brouillon, annulation) a été interrompue ; tout autre bail est laissé tel quel.
  const aReprendre = existant && existant.status === RentalLeaseStatus.ACTIVE && existant.notes === p.notes;
  if (existant && !aReprendre) {
    console.log(`  = ${reference} porte déjà ${existant.lease_number} (${existant.status})`);
    return;
  }

  let cree: { id: string; lease_number: string };
  if (aReprendre && existant) {
    cree = existant;
    console.log(`  ~ ${existant.lease_number} ${reference} : fin de l'étape reprise`);
  } else {
    const idCandidat = await contactId(p.candidat);
    const idProprietaire = p.proprietaire
      ? (
          await prisma.crmContact.findFirst({
            where: { tenantId: TENANT_ID, email: p.proprietaire },
            select: { id: true }
          })
        )?.id
      : undefined;
    if (p.proprietaire && !idProprietaire) throw new Error(`contact propriétaire ${p.proprietaire} introuvable`);

    const fin = new Date(
      Date.UTC(p.debut.getUTCFullYear(), p.debut.getUTCMonth() + p.dureeMois, p.debut.getUTCDate() - 1)
    );
    cree = await createLease(
      TENANT_ID,
      {
        propertyId: bien.id,
        primaryRenterContactId: idCandidat,
        ownerContactId: idProprietaire,
        startDate: p.debut,
        endDate: fin,
        billingFrequency: 'MONTHLY',
        dueDayOfMonth: p.jour,
        currency: 'XOF',
        rentAmount: p.loyer,
        serviceChargeAmount: p.charges,
        securityDepositAmount: p.loyer * 2,
        penaltyGraceDays: 5,
        penaltyMode: 'PERCENT_OF_BALANCE',
        penaltyRate: 5,
        penaltyCapAmount: 250000,
        notes: p.notes
      },
      acteur
    );
    crees.baux++;
    console.log(
      `  + ${cree.lease_number}  ${reference}  ${p.statut === 'DRAFT' ? 'brouillon' : 'annulé'}  (${p.candidat.prenom} ${p.candidat.nom})`
    );
  }

  if (p.statut === 'CANCELED') {
    // Le service remet lui-même le bien à « Disponible » (aucun autre bail actif).
    await updateLeaseStatus(TENANT_ID, cree.id, RentalLeaseStatus.CANCELED, acteur);
  } else {
    // Aucune transition ne mène à DRAFT : la création est toujours ACTIVE. Le brouillon
    // s'écrit donc en base, puis le décompte des lots et le statut du bien suivent.
    await prisma.rentalLease.update({ where: { id: cree.id }, data: { status: RentalLeaseStatus.DRAFT } });
    await appPrisma.$transaction(tx =>
      syncLotActivationsTx(tx, TENANT_ID, { propertyIds: [bien.id] }, { actorUserId: acteur, reason: 'LEASE_DRAFT' })
    );
  }
  await remettreBienDisponible(
    bien.id,
    `Bail ${cree.lease_number} sans effet (${p.statut === 'DRAFT' ? 'brouillon' : 'annulé'})`
  );
}

/** Le bien repasse « Disponible » par son service s'il n'a plus de bail actif. */
async function remettreBienDisponible(propertyId: string, motif: string): Promise<void> {
  const actifs = await prisma.rentalLease.count({
    where: { tenant_id: TENANT_ID, property_id: propertyId, status: RentalLeaseStatus.ACTIVE }
  });
  const bien = await prisma.property.findFirst({
    where: { id: propertyId, tenantId: TENANT_ID },
    select: { status: true }
  });
  if (actifs > 0 || !bien || bien.status === PropertyStatus.AVAILABLE) return;
  await updatePropertyStatus(propertyId, PropertyStatus.AVAILABLE, TENANT_ID, undefined, acteur, motif);
  console.log(`    ↳ bien remis à « Disponible » (${motif})`);
}

// ───────────────────────────────────────── sorties : 0013 et 0020

interface Sortie {
  numero: string;
  initiePar: 'TENANT' | 'MUTUAL';
  preavisJours: number;
  resume: string;
  avenant: { apresMois: number; resume: string };
  /** Retenue provisoire arrondie au 50 000 supérieur, puis libération de l'excédent. */
  provisoire: boolean;
}

const SORTIES: Sortie[] = [
  {
    numero: 'BAIL-2026-0013',
    initiePar: 'TENANT',
    preavisJours: 85,
    resume: 'Congé donné par le locataire (mutation professionnelle à Bouaké), préavis de trois mois respecté.',
    avenant: {
      apresMois: 2,
      resume:
        'Avenant n°1 : le locataire peut cultiver la cour privative et y installer un abri de stockage démontable, à ses frais.'
    },
    provisoire: false
  },
  {
    numero: 'BAIL-2026-0020',
    initiePar: 'MUTUAL',
    preavisJours: 56,
    resume: "Résiliation amiable : fin du stage de la locataire, préavis réduit à deux mois d'un commun accord.",
    avenant: {
      apresMois: 1,
      resume:
        "Avenant n°1 : l'abonnement internet fibre est inclus dans les charges forfaitaires, sans changement du loyer."
    },
    provisoire: true
  }
];

async function sortie(s: Sortie): Promise<void> {
  const n = s.numero;
  const l = await bail(n);
  const edl = await sortieFinalisee(l.id);

  const effetAvenant = premierDuMois(l.start_date, s.avenant.apresMois);
  await evenement(n, 'avenant', LeaseEventType.AMENDMENT, s.avenant.resume, auJour(effetAvenant, 2, 10), id =>
    recordAmendment(TENANT_ID, id, { effectiveDate: jour(effetAvenant), summary: s.avenant.resume }, acteur)
  );

  // Préavis, puis fin le dernier jour du mois de l'état des lieux de sortie : la date
  // de fin est passée, le service passe donc le bail à ENDED.
  const preavis = auJour(edl.date, -s.preavisJours, 12);
  const fin = finDuMois(edl.date);
  await evenement(
    n,
    `résiliation au ${fr(fin)} (préavis du ${fr(preavis)}, sortie le ${fr(edl.date)})`,
    LeaseEventType.TERMINATION,
    s.resume,
    auJour(preavis, 1, 10),
    id =>
      terminateLease(
        TENANT_ID,
        id,
        {
          noticeDate: jour(preavis),
          effectiveDate: jour(fin),
          initiatedBy: s.initiePar,
          moveOutDate: jour(edl.date),
          summary: s.resume
        },
        acteur
      )
  );

  // `terminateLease` met le bail à ENDED sans toucher au bien (contrairement à
  // `updateLeaseStatus`) : le bien est libéré ici, par son service.
  const apres = await bail(n);
  if (apres.status === RentalLeaseStatus.ENDED) {
    await essaie(`${n} — bien libéré`, () => remettreBienDisponible(apres.property_id, `Fin du bail ${n}`), true);
  }
  if (
    !(await prisma.leaseEvent.count({
      where: { tenantId: TENANT_ID, leaseId: l.id, type: LeaseEventType.TERMINATION }
    }))
  ) {
    return; // pas de résiliation : pas de solde à établir
  }
  await regleDepot(s, edl);
}

/**
 * Dépôt de garantie : retenue du montant des dégradations (HOLD), éventuellement
 * ramenée au montant exact par une libération (RELEASE), puis remboursement du
 * solde calculé par le service du solde de tout compte (REFUND).
 *
 * Pas de FORFEIT : le solde de tout compte retranche déjà les retenues de l'état
 * des lieux du dépôt détenu ; une confiscation les retrancherait une seconde fois.
 */
async function regleDepot(
  s: Sortie,
  edl: { date: Date; retenues: { label: string; amount: number }[]; total: number }
) {
  const n = s.numero;
  if (edl.total <= 0) return;
  const detail = edl.retenues.map(r => `${r.label} ${fcfa(Number(r.amount))}`).join(' ; ');

  const retenueInitiale = s.provisoire ? Math.ceil(edl.total / 50000) * 50000 : edl.total;
  const motifRetenue = s.provisoire
    ? `Retenue provisoire à la remise des clés, dans l'attente des devis de remise en état (état des lieux de sortie du ${fr(edl.date)}).`
    : `Retenue pour les dégradations constatées à l'état des lieux de sortie du ${fr(edl.date)} : ${detail}.`;
  await mouvementDepot(n, Mouvement.HOLD, retenueInitiale, motifRetenue, auJour(edl.date, 0, 11));

  if (retenueInitiale > edl.total) {
    await mouvementDepot(
      n,
      Mouvement.RELEASE,
      retenueInitiale - edl.total,
      `Devis définitifs reçus : retenue ramenée à ${fcfa(edl.total)} FCFA (${detail}).`,
      auJour(edl.date, 2, 9)
    );
  }

  const l = await bail(n);
  const solde = await getFinalSettlement(TENANT_ID, l.id);
  const deja = await prisma.rentalDepositMovement.count({
    where: { tenant_id: TENANT_ID, type: Mouvement.REFUND, deposit: { lease_id: l.id } }
  });
  if (deja === 0 && solde.balanceToRefund > 0) {
    const impayes = solde.arrears > 0 ? ` et de l'impayé de ${fcfa(solde.arrears)} FCFA` : '';
    await mouvementDepot(
      n,
      Mouvement.REFUND,
      solde.balanceToRefund,
      `Solde du dépôt restitué au locataire après imputation des retenues (${fcfa(solde.deductionsTotal)} FCFA)${impayes}.`,
      auJour(edl.date, 2, 15)
    );
  } else if (deja === 0) {
    console.log(`  ! ${n} — rien à restituer (solde ${fcfa(solde.balanceToRefund)} FCFA)`);
  }
}

// ──────────────────────────────────────────────────────── vérifications

async function verifications(): Promise<void> {
  for (const n of ['BAIL-2026-0013', 'BAIL-2026-0019', 'BAIL-2026-0020']) {
    const l = await bail(n);
    const s = await getFinalSettlement(TENANT_ID, l.id);
    console.log(
      `  ${n} (${l.status}) solde de tout compte : détenu ${fcfa(s.depositHeld)}, impayés ${fcfa(s.arrears)}, retenues ${fcfa(s.deductionsTotal)} → ${fcfa(s.balanceToRefund)} à restituer (sortie : ${s.exitInspectionStatus})`
    );
  }
  for (const [n, periodes] of [
    ['BAIL-2026-0017', ['2026-11', '2026-12', '2027-01', '2028-10']],
    ['BAIL-2026-0025', ['2026-12', '2029-09', '2029-12', '2030-09']]
  ] as const) {
    const l = await bail(n);
    const echeances = await prisma.rentalInstallment.findMany({
      where: { lease_id: l.id },
      select: { period_year: true, period_month: true, status: true, amount_rent: true, amount_service: true }
    });
    const lignes = periodes.map(p => {
      const e = echeances.find(x => `${x.period_year}-${String(x.period_month).padStart(2, '0')}` === p);
      return e ? `${p} ${fcfa(Number(e.amount_rent))}+${fcfa(Number(e.amount_service))} (${e.status})` : `${p} —`;
    });
    console.log(
      `  ${n} loyer en vigueur ${fcfa(Number(l.rent_amount))}, ${echeances.length} échéances : ${lignes.join(' | ')}`
    );
  }
  const biens = await prisma.property.findMany({
    where: {
      tenantId: TENANT_ID,
      internalReference: { in: ['PRES-005', 'PRES-009', 'PRES-012', 'PRES-014', 'PRES-020'] }
    },
    orderBy: { internalReference: 'asc' },
    select: { internalReference: true, status: true, availability: true }
  });
  console.log(`  biens : ${biens.map(b => `${b.internalReference} ${b.status}/${b.availability}`).join(', ')}`);
}

// ──────────────────────────────────────────────────────────────── main

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence : il en faut un comme auteur des écritures');
  acteur = membre.userId;
  console.log(`Agence : ${tenant.name}`);
  console.log(`Auteur des écritures : ${membre.user?.email}`);

  await etape('BAIL-2026-0017 — révision appliquée, révision planifiée, colocataire', bail0017);
  await etape('BAIL-2026-0025 — renouvellement, avenants, révision planifiée, colocataires, dépôt', bail0025);
  await etape('BAIL-2026-0021 — suspension (recouvrement)', bail0021);
  await etape('BAIL-2026-0019 — préavis du locataire, résiliation planifiée', bail0019);

  await etape('Nouveaux baux — brouillons et bail annulé', async () => {
    await essaie(
      'PRES-012 (brouillon, propriétaire Henri Bakayoko)',
      () =>
        nouveauBail({
          ref: '012',
          candidat: CONTACTS.yannick,
          loyer: 425000,
          charges: 30000,
          jour: 5,
          debut: premierDuMois(NOW, 1),
          dureeMois: 24,
          statut: 'DRAFT',
          notes:
            'Projet de bail en cours de rédaction : en attente de la signature du mandat de gestion par le propriétaire.',
          proprietaire: 'henri.bakayoko.proprio.pres@exemple.test'
        }),
      true
    );
    await essaie(
      'PRES-009 (brouillon)',
      () =>
        nouveauBail({
          ref: '009',
          candidat: CONTACTS.rosine,
          loyer: 170000,
          charges: 15000,
          jour: 5,
          debut: auJour(premierDuMois(NOW, 1), 14, 0),
          dureeMois: 24,
          statut: 'DRAFT',
          notes: "Bail rédigé, dossier du candidat en cours d'instruction (justificatifs de revenus attendus)."
        }),
      true
    );
    await essaie(
      'PRES-020 (bail annulé)',
      () =>
        nouveauBail({
          ref: '020',
          candidat: CONTACTS.boubacar,
          loyer: 420000,
          charges: 35000,
          jour: 5,
          debut: auJour(NOW, -18, 0),
          dureeMois: 36,
          statut: 'CANCELED',
          notes: "Candidature annulée : le preneur s'est désisté avant la signature (financement refusé par sa banque)."
        }),
      true
    );
  });

  // En dernier : un autre script génère en parallèle les contrats de 0013 et 0020.
  for (const s of SORTIES) {
    await etape(`${s.numero} — avenant, résiliation, dépôt de garantie`, () => sortie(s));
  }

  await etape('Vérifications', verifications);

  // ----------------------------------------------------------------- bilan
  const [evenements, mouvements, colocs, statuts] = await Promise.all([
    prisma.leaseEvent.groupBy({ by: ['type'], where: { tenantId: TENANT_ID }, _count: true }),
    prisma.rentalDepositMovement.groupBy({ by: ['type'], where: { tenant_id: TENANT_ID }, _count: true }),
    prisma.rentalLeaseCoRenter.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalLease.groupBy({ by: ['status'], where: { tenant_id: TENANT_ID }, _count: true })
  ]);
  const liste = (lignes: Array<{ _count: number } & Record<string, unknown>>, cle: string) =>
    lignes.map(x => `${x[cle]}=${x._count}`).join(' ');
  const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

  console.log('\n──────────── BILAN ────────────');
  console.log(
    `Créés dans cette exécution : ${crees.contacts} contacts, ${crees.baux} baux, ${crees.colocataires} colocataires,`
  );
  console.log(
    `                             ${total(crees.evenements)} événements ${JSON.stringify(crees.evenements)}, ${total(crees.mouvements)} mouvements de dépôt ${JSON.stringify(crees.mouvements)}`
  );
  console.log(`Événements de bail (agence) : ${liste(evenements, 'type')}`);
  console.log(`Mouvements de dépôt (agence) : ${liste(mouvements, 'type')}`);
  console.log(`Colocataires (agence) : ${colocs}`);
  console.log(`Baux par statut : ${liste(statuts, 'status')}`);
  const echecs = bilan.flatMap(b => b.echecs.map(e => `${b.etape} : ${e}`));
  if (echecs.length) {
    console.log(`\n${echecs.length} échec(s) :`);
    for (const e of echecs) console.log(`  ⨯ ${e}`);
    process.exitCode = 1;
  } else {
    console.log('\nAucun échec.');
  }
}

main()
  .catch(e => {
    console.error('ÉCHEC :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Les traces d'audit des services partent en arrière-plan : on leur laisse le temps.
    await new Promise(resolve => setTimeout(resolve, 1500));
    await prisma.$disconnect();
    // Sortie explicite : `utils/database` enregistre un gestionnaire `beforeExit`
    // asynchrone qui redéclenche l'événement sans fin.
    process.exit(process.exitCode ?? 0);
  });
