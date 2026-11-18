/**
 * Jeu de données de présentation — compléments de la gestion locative.
 *
 * Dernier script de la série `seed-demo-presentation-*`, à lancer après les
 * autres. Il comble ce que l'inventaire écran par écran a trouvé encore vide :
 *
 *   - coordonnées de l'agence (raison sociale, adresse, contact) : sans elles,
 *     les documents générés affichent « — » en en-tête ;
 *   - fiches de bien : un ticket de maintenance, deux valorisations, une police,
 *     une entrée de carnet et des visites sur chaque bien `PRES-NNN` qui n'en
 *     avait pas (le script annexes n'en dotait qu'une partie) ;
 *   - vie du bail : un avenant ou la révision anniversaire planifiée sur chaque
 *     bail actif resté sans événement ;
 *   - modèles de documents propres à l'agence (Paramétrage > Documents), copiés
 *     des modèles globaux par défaut ;
 *   - virements internes mensuels des encaissements Mobile Money et espèces
 *     vers la banque (sans eux, la Banque principale finit à découvert) ;
 *   - campagne de facturation du mois en cours (Finance > Facturation du mois) :
 *     elle émet les échéances du mois, encore en Brouillon, et son compte rendu
 *     motive chaque bail exclu (suspendu, terminé, brouillon, annulé). Elle doit
 *     donc tourner APRÈS `db:seed:presentation-vie-du-bail`, qui pose ces statuts ;
 *   - deux loyers du mois réglés d'avance sur des biens confiés, pour que les
 *     écrans ouverts sur le mois en cours (Commissions des agents) aient des données.
 *
 * Mêmes partis pris que les autres scripts : services de l'application dès qu'il
 * en existe un, aucun envoi sortant, idempotent (clé naturelle), une étape qui
 * échoue n'arrête pas les autres.
 *
 * Usage : npm run db:seed:presentation-divers -w @immotopia/api
 *         (option `--sans-facturation` pour ne pas lancer la campagne du mois)
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { promises as fs } from 'fs';
import * as path from 'path';
import {
  PrismaClient,
  RentalPaymentMethod,
  MaintenanceTicketCategory as Categorie,
  MaintenanceTicketPriority as Priorite,
  MaintenanceTicketStatus as Statut
} from '@prisma/client';

import { createPolicy } from '../../src/lib/patrimoine/insurance/policy-service';
import { createMaintenanceLogEntry } from '../../src/lib/patrimoine/insurance/maintenance-log-service';
import { createPropertyValuation } from '../../src/lib/patrimoine/queries';
import { runRentBilling } from '../../src/lib/finance/billing-run';
import { uploadTemplate } from '../../src/services/document-template-service';
import { createTransfer, voidTransfer } from '../../src/lib/treasury/service';
import { updateTenant } from '../../src/services/tenant-service';
import { recordAmendment, reviseRent } from '../../src/lib/lease-lifecycle/service';
import { createPayment, allocatePayment } from '../../src/services/rental-payment-service';
import { getShippedTemplatesDir, getTemplatesWriteDir } from '../../src/utils/assets-paths';

const prisma = new PrismaClient({ log: [] });

const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';
const MAINTENANT = new Date();

/** Date à J-n (ou J+n si n est négatif), à l'heure donnée. */
function ilYA(jours: number, heure = 12): Date {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  d.setHours(heure, 0, 0, 0);
  return d;
}

const bilan: { etape: string; ok: number; echecs: string[] }[] = [];

/** Une étape qui échoue est notée au bilan ; les autres continuent. */
async function etape(nom: string, fn: () => Promise<number>): Promise<void> {
  console.log(`\n── ${nom}`);
  try {
    bilan.push({ etape: nom, ok: await fn(), echecs: [] });
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
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
    const message = e instanceof Error ? e.message.split('\n').filter(Boolean).slice(-1)[0] : String(e);
    console.log(`  ⨯ ${libelle} — ${message}`);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────── contexte

interface Bien {
  id: string;
  ref: string;
  titre: string;
  adresse: string;
  type: string;
  surface: number;
  /** Bail le plus récent encore en cours ou terminé (pas brouillon, pas annulé). */
  bail: { id: string; debut: Date; renterContactId: string | null } | null;
}

const biens = new Map<string, Bien>();
const vendeurs = new Map<string, string>();
let acteur = '';

async function chargerContexte(): Promise<void> {
  const lignes = await prisma.property.findMany({
    where: { tenantId: TENANT_ID, internalReference: { startsWith: 'PRES-' } },
    select: {
      id: true,
      internalReference: true,
      title: true,
      address: true,
      propertyType: true,
      surfaceArea: true,
      rentalLeases: {
        where: { status: { in: ['ACTIVE', 'SUSPENDED', 'ENDED'] } },
        orderBy: { start_date: 'desc' },
        take: 1,
        select: { id: true, start_date: true, primaryRenter: { select: { user: { select: { email: true } } } } }
      }
    }
  });
  for (const l of lignes) {
    const bail = l.rentalLeases[0];
    const email = bail?.primaryRenter?.user?.email;
    const contact = email
      ? await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } })
      : null;
    biens.set(l.internalReference.replace('PRES-', ''), {
      id: l.id,
      ref: l.internalReference.replace('PRES-', ''),
      titre: l.title,
      adresse: l.address,
      type: l.propertyType,
      surface: Number(l.surfaceArea ?? 50),
      bail: bail ? { id: bail.id, debut: bail.start_date, renterContactId: contact?.id ?? null } : null
    });
  }
  const v = await prisma.maintenanceVendor.findMany({
    where: { tenant_id: TENANT_ID },
    select: { id: true, name: true }
  });
  for (const x of v) vendeurs.set(x.name, x.id);
}

function bien(ref: string): Bien {
  const b = biens.get(ref);
  if (!b) throw new Error(`Bien PRES-${ref} introuvable : lancer d'abord db:seed:presentation-locative`);
  return b;
}

// ───────────────────────────────────────── coordonnées de l'agence

/**
 * Sans coordonnées, chaque document généré (contrat, reçu, relevé) affiche
 * « — » en en-tête et au « Fait à ». Seuls les champs encore vides sont
 * remplis : une valeur saisie dans l'écran de l'agence n'est jamais écrasée.
 */
async function seedCoordonnees(): Promise<number> {
  const agence = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: {
      legalName: true,
      contactEmail: true,
      contactPhone: true,
      address: true,
      city: true,
      country: true,
      website: true
    }
  });
  const voulu = {
    legalName: 'Pack Agence Gestion SARL',
    contactEmail: 'contact@pack-agence.exemple.test',
    contactPhone: '+225 27 22 41 18 00',
    address: 'Immeuble Les Palmiers, 2e étage, boulevard Latrille, Cocody Deux-Plateaux',
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    website: 'https://pack-agence.exemple.test'
  };
  const manquants = Object.fromEntries(Object.entries(voulu).filter(([cle]) => !agence?.[cle as keyof typeof voulu]));
  if (Object.keys(manquants).length === 0) return 0;
  await updateTenant(TENANT_ID, manquants, acteur);
  console.log(`  + ${Object.keys(manquants).join(', ')}`);
  return Object.keys(manquants).length;
}

// ─────────────────────────────────────────── tickets de maintenance

const PLOMBIER = 'Plomberie Express CI';
const ELEC = 'Ivoire Électricité Services';
const CLIM = 'Froid & Clim Abidjan';
const BTP = 'BTP Rénovation Baoulé';
const PEINTRE = 'Couleurs & Peinture Plateau';

interface PlanTicket {
  ref: string;
  titre: string;
  categorie: Categorie;
  priorite: Priorite;
  description: string;
  statut: Statut;
  prestataire?: string;
  declareIlYA: number;
  resolution?: string;
  /** Vrai : signalé par l'agence (bien vacant ou après le départ du locataire). */
  parAgence?: boolean;
}

/** Un ticket pour chaque bien qui n'en avait aucun, à des stades différents. */
const TICKETS: PlanTicket[] = [
  {
    ref: '004',
    titre: 'Robinet de la douche qui goutte',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.LOW,
    description: 'Le mitigeur de la douche goutte en continu, même fermé à fond.',
    statut: Statut.RESOLVED,
    prestataire: PLOMBIER,
    declareIlYA: 52,
    resolution: 'Cartouche du mitigeur remplacée.'
  },
  {
    ref: '005',
    titre: 'Remise en état après le départ du locataire',
    categorie: Categorie.OTHER,
    priorite: Priorite.MEDIUM,
    description:
      'Reprise des dégradations relevées à l’état des lieux de sortie : peinture du séjour, porte de placard, carreau cassé.',
    statut: Statut.ASSIGNED,
    prestataire: BTP,
    declareIlYA: 9,
    parAgence: true
  },
  {
    ref: '008',
    titre: 'Disjoncteur qui saute le soir',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.HIGH,
    description: 'Le disjoncteur général saute quand le climatiseur et le chauffe-eau tournent ensemble.',
    statut: Statut.IN_PROGRESS,
    prestataire: ELEC,
    declareIlYA: 5
  },
  {
    ref: '009',
    titre: 'Contrôle de l’installation électrique avant relocation',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.MEDIUM,
    description: 'Vérification du tableau et des prises avant la mise en location.',
    statut: Statut.RESOLVED,
    prestataire: ELEC,
    declareIlYA: 40,
    resolution: 'Deux prises remplacées, tableau conforme.',
    parAgence: true
  },
  {
    ref: '011',
    titre: 'Climatiseur de la chambre parentale bruyant',
    categorie: Categorie.AC,
    priorite: Priorite.MEDIUM,
    description: 'Le split de la chambre vibre fortement au démarrage.',
    statut: Statut.ASSIGNED,
    prestataire: CLIM,
    declareIlYA: 3
  },
  {
    ref: '012',
    titre: 'Débroussaillage de la cour avant les visites',
    categorie: Categorie.OTHER,
    priorite: Priorite.LOW,
    description: 'La cour et l’allée du garage sont envahies par les herbes depuis le départ de l’ancien occupant.',
    statut: Statut.RESOLVED,
    prestataire: BTP,
    declareIlYA: 25,
    resolution: 'Cour débroussaillée, allée nettoyée.',
    parAgence: true
  },
  {
    ref: '014',
    titre: 'Remplacement du matelas et du store après la sortie',
    categorie: Categorie.OTHER,
    priorite: Priorite.MEDIUM,
    description: 'Matelas taché et store de la fenêtre arraché, constatés à l’état des lieux de sortie.',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 6,
    parAgence: true
  },
  {
    ref: '015',
    titre: 'Peinture du studio avant relocation',
    categorie: Categorie.OTHER,
    priorite: Priorite.LOW,
    description: 'Rafraîchissement complet des murs et plafonds.',
    statut: Statut.DECLARED,
    declareIlYA: 2,
    parAgence: true
  },
  {
    ref: '017',
    titre: 'Fuite sur la colonne d’évacuation',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.URGENT,
    description: 'Écoulement d’eaux usées dans la cour intérieure depuis ce matin.',
    statut: Statut.DECLARED,
    declareIlYA: 0
  },
  {
    ref: '020',
    titre: 'Store électrique bloqué en position basse',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.LOW,
    description: 'Le store de la façade ne remonte plus, le moteur ne répond pas.',
    statut: Statut.CANCELED,
    declareIlYA: 30,
    parAgence: true
  },
  {
    ref: '023',
    titre: 'Badge d’accès au parking défectueux',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.MEDIUM,
    description: 'Le lecteur de badge de l’entrée ne reconnaît plus le badge du box.',
    statut: Statut.RESOLVED,
    prestataire: ELEC,
    declareIlYA: 18,
    resolution: 'Lecteur reprogrammé et badge réencodé.',
    parAgence: true
  }
];

/** Historique des statuts, du signalement à l'état courant. */
function parcoursDuTicket(t: PlanTicket): { de: Statut | null; vers: Statut; quand: Date; note: string }[] {
  const declare = ilYA(t.declareIlYA, 9);
  const etapes: { de: Statut | null; vers: Statut; quand: Date; note: string }[] = [
    {
      de: null,
      vers: Statut.DECLARED,
      quand: declare,
      note: t.parAgence ? 'Signalé par l’agence.' : 'Signalé depuis le portail locataire.'
    }
  ];
  if (t.statut === Statut.DECLARED) return etapes;
  if (t.statut === Statut.CANCELED) {
    etapes.push({
      de: Statut.DECLARED,
      vers: Statut.CANCELED,
      quand: ilYA(t.declareIlYA - 2, 11),
      note: 'Annulé : le store a été remplacé avec les travaux de façade.'
    });
    return etapes;
  }
  etapes.push({
    de: Statut.DECLARED,
    vers: Statut.IN_PROGRESS,
    quand: ilYA(Math.max(t.declareIlYA - 1, 0), 10),
    note: 'Pris en charge par l’agence.'
  });
  if (t.prestataire && t.statut !== Statut.IN_PROGRESS) {
    etapes.push({
      de: Statut.IN_PROGRESS,
      vers: Statut.ASSIGNED,
      quand: ilYA(Math.max(t.declareIlYA - 2, 0), 11),
      note: `Confié à ${t.prestataire}.`
    });
  }
  if (t.statut === Statut.RESOLVED) {
    const de = t.prestataire ? Statut.ASSIGNED : Statut.IN_PROGRESS;
    etapes.push({
      de,
      vers: Statut.RESOLVED,
      quand: ilYA(Math.max(t.declareIlYA - 4, 0), 16),
      note: t.resolution ?? 'Intervention terminée.'
    });
  }
  return etapes;
}

async function seedTickets(): Promise<number> {
  let n = 0;
  for (const t of TICKETS) {
    const b = bien(t.ref);
    const existe = await prisma.maintenanceTicket.findFirst({
      where: { tenant_id: TENANT_ID, property_id: b.id, title: t.titre },
      select: { id: true }
    });
    if (existe) continue;
    const parcours = parcoursDuTicket(t);
    const quand = (s: Statut) => parcours.find(e => e.vers === s)?.quand ?? null;
    const contact = t.parAgence ? null : (b.bail?.renterContactId ?? null);
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        tenant_id: TENANT_ID,
        property_id: b.id,
        lease_id: t.parAgence ? null : (b.bail?.id ?? null),
        tenant_contact_id: contact,
        created_by_contact_id: contact,
        created_by_user_id: t.parAgence ? acteur : null,
        title: t.titre,
        category: t.categorie,
        priority: t.priorite,
        description: t.description,
        status: t.statut,
        assigned_vendor_id: t.prestataire ? (vendeurs.get(t.prestataire) ?? null) : null,
        assigned_to_user_id: t.statut === Statut.DECLARED ? null : acteur,
        resolution_notes: t.resolution ?? null,
        declared_at: quand(Statut.DECLARED)!,
        in_progress_at: quand(Statut.IN_PROGRESS),
        assigned_at: quand(Statut.ASSIGNED),
        resolved_at: quand(Statut.RESOLVED),
        canceled_at: quand(Statut.CANCELED)
      }
    });
    for (const e of parcours) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: TENANT_ID,
          ticket_id: ticket.id,
          from_status: e.de,
          to_status: e.vers,
          note: e.note,
          changed_by_user_id: e.de === null && !t.parAgence ? null : acteur,
          changed_at: e.quand
        }
      });
    }
    console.log(`  + [${String(t.statut).padEnd(11)}] PRES-${t.ref} ${t.titre.slice(0, 50)}`);
    n++;
  }
  return n;
}

// ─────────────────────────────────────────────── valorisations

/** Prix au m² indicatif (FCFA) par type de bien, pour une valeur vraisemblable. */
const PRIX_M2: Record<string, number> = {
  APPARTEMENT: 380000,
  MAISON_VILLA: 520000,
  STUDIO: 450000,
  BUREAU: 650000,
  DUPLEX_TRIPLEX: 480000,
  PARKING_BOX: 600000
};

async function seedValorisations(): Promise<number> {
  let n = 0;
  for (const b of [...biens.values()].sort((x, y) => x.ref.localeCompare(y.ref))) {
    const deja = await prisma.assetValuation.count({ where: { tenantId: TENANT_ID, propertyId: b.id } });
    if (deja > 0) continue;
    const acquisition = Math.round(((PRIX_M2[b.type] ?? 400000) * b.surface) / 500000) * 500000;
    const dateAcquisition = ilYA(1100 - Number(b.ref) * 20);
    const ok1 = await essaie(`valorisation PRES-${b.ref} (acquisition ${acquisition.toLocaleString('fr-FR')})`, () =>
      createPropertyValuation(TENANT_ID, b.id, {
        valuatedAt: dateAcquisition,
        estimatedValue: acquisition,
        currency: 'XOF',
        acquisitionCost: Math.round(acquisition * 0.95),
        acquisitionDate: dateAcquisition,
        method: 'MANUAL',
        notes: 'Valeur à l’acquisition.'
      } as never)
    );
    const ok2 = await essaie(`valorisation PRES-${b.ref} (estimation de marché)`, () =>
      createPropertyValuation(TENANT_ID, b.id, {
        valuatedAt: ilYA(45),
        estimatedValue: Math.round((acquisition * 1.11) / 100000) * 100000,
        currency: 'XOF',
        method: 'MARKET_ESTIMATE',
        notes: 'Estimation sur trois ventes comparables du quartier.'
      } as never)
    );
    n += Number(ok1) + Number(ok2);
  }
  return n;
}

// ───────────────────────────────────────── polices, carnet, visites

/** Biens vacants sans police : une responsabilité civile du propriétaire non occupant. */
const POLICES_PNO: { ref: string; assureur: string; prime: number }[] = [
  { ref: '015', assureur: 'Saham Assurance CI', prime: 24000 },
  { ref: '020', assureur: 'SUNU Assurances CI', prime: 68000 },
  { ref: '023', assureur: 'NSIA Assurances', prime: 15000 }
];

async function seedPolices(): Promise<number> {
  let n = 0;
  for (const p of POLICES_PNO) {
    const b = bien(p.ref);
    const numero = `PRES-PNO-${p.ref}-${MAINTENANT.getFullYear()}`;
    const existe = await prisma.insurancePolicy.findFirst({
      where: { tenantId: TENANT_ID, propertyId: b.id, policyNumber: numero },
      select: { id: true }
    });
    if (existe) continue;
    const ok = await essaie(`police PNO PRES-${p.ref} (${p.assureur})`, () =>
      createPolicy(
        TENANT_ID,
        {
          propertyId: b.id,
          insurer: p.assureur,
          policyNumber: numero,
          coverageType: 'OWNER_LIABILITY',
          startDate: ilYA(150),
          endDate: ilYA(-215),
          annualPremium: p.prime,
          currency: 'XOF',
          notes: 'Propriétaire non occupant : bien vacant entre deux locations.'
        } as never,
        acteur
      )
    );
    if (ok) n++;
  }
  return n;
}

const CARNET: {
  ref: string;
  categorie: string;
  ilYA: number;
  description: string;
  prestataire?: string;
  cout: number;
  garantieMois?: number;
}[] = [
  {
    ref: '009',
    categorie: 'PAINTING',
    ilYA: 38,
    description: 'Peinture complète avant remise en location',
    prestataire: PEINTRE,
    cout: 420000,
    garantieMois: 12
  },
  {
    ref: '012',
    categorie: 'PLUMBING',
    ilYA: 28,
    description: 'Révision du surpresseur et des robinets d’arrêt',
    prestataire: PLOMBIER,
    cout: 95000,
    garantieMois: 6
  },
  {
    ref: '015',
    categorie: 'ELECTRICAL',
    ilYA: 60,
    description: 'Mise aux normes du tableau électrique',
    prestataire: ELEC,
    cout: 180000,
    garantieMois: 24
  },
  {
    ref: '020',
    categorie: 'AIR_CONDITIONING',
    ilYA: 75,
    description: 'Nettoyage et recharge des trois splits',
    prestataire: CLIM,
    cout: 135000
  },
  {
    ref: '023',
    categorie: 'OTHER',
    ilYA: 18,
    description: 'Reprogrammation du lecteur de badge du parking',
    prestataire: ELEC,
    cout: 25000,
    garantieMois: 3
  }
];

async function seedCarnet(): Promise<number> {
  let n = 0;
  for (const c of CARNET) {
    const b = bien(c.ref);
    const existe = await prisma.maintenanceLogEntry.findFirst({
      where: { tenantId: TENANT_ID, propertyId: b.id, description: c.description },
      select: { id: true }
    });
    if (existe) continue;
    const effectue = ilYA(c.ilYA);
    const garantie = c.garantieMois
      ? new Date(new Date(effectue).setMonth(effectue.getMonth() + c.garantieMois))
      : undefined;
    const ok = await essaie(`carnet PRES-${c.ref} — ${c.description.slice(0, 45)}`, () =>
      createMaintenanceLogEntry(
        TENANT_ID,
        {
          propertyId: b.id,
          category: c.categorie,
          performedAt: effectue,
          description: c.description,
          vendorId: c.prestataire ? vendeurs.get(c.prestataire) : undefined,
          cost: c.cout,
          currency: 'XOF',
          warrantyEndDate: garantie
        } as never,
        acteur
      )
    );
    if (ok) n++;
  }
  return n;
}

/**
 * Biens loués sans visite : la visite du futur locataire avant la signature
 * (réalisée), et sur un bien sur trois une visite de contrôle à venir.
 */
async function seedVisites(): Promise<number> {
  let n = 0;
  let i = 0;
  for (const b of [...biens.values()].sort((x, y) => x.ref.localeCompare(y.ref))) {
    if (!b.bail?.renterContactId) continue;
    if ((await prisma.propertyVisit.count({ where: { tenantId: TENANT_ID, propertyId: b.id } })) > 0) continue;
    const avant = new Date(b.bail.debut);
    avant.setDate(avant.getDate() - 12);
    avant.setHours(10, 0, 0, 0);
    const visites = [
      {
        propertyId: b.id,
        tenantId: TENANT_ID,
        contactId: b.bail.renterContactId,
        visitType: 'VISIT' as const,
        goal: 'CONTACT_TAKING' as const,
        scheduledAt: avant,
        duration: 45,
        location: b.adresse,
        status: 'DONE' as const,
        assignedToUserId: acteur,
        notes: 'Visite avant signature : le candidat a retenu le bien et déposé son dossier.'
      }
    ];
    if (i % 3 === 0) {
      visites.push({
        ...visites[0],
        visitType: 'APPOINTMENT' as never,
        goal: 'FOLLOW_UP' as never,
        scheduledAt: ilYA(-(4 + i), 15),
        duration: 30,
        status: 'CONFIRMED' as never,
        notes: 'Visite de contrôle annuelle avec le locataire.'
      });
    }
    await prisma.propertyVisit.createMany({ data: visites });
    console.log(`  + ${visites.length} visite(s) sur PRES-${b.ref}`);
    n += visites.length;
    i++;
  }
  return n;
}

// ───────────────────────────────────────────── vie du bail (compléments)

/**
 * Le script vie-du-bail joue les scénarios forts (résiliations, renouvellement,
 * révisions) sur six baux. Les autres baux actifs reçoivent ici un avenant sans
 * incidence financière, ou leur révision annuelle planifiée à la date
 * anniversaire, pour que l'historique « Vie du bail » ne soit vide nulle part.
 */
const EVENEMENTS: {
  bail: string;
  avenant?: { effet: string; texte: string };
  revision?: { mois: string; loyer: number; taux: number };
}[] = [
  {
    bail: 'BAIL-2026-0009',
    avenant: {
      effet: '2026-03-01',
      texte: 'Avenant n°1 : mise à disposition de la place de parking couverte n°12, incluse dans les charges.'
    }
  },
  { bail: 'BAIL-2026-0010', revision: { mois: '2026-12', loyer: 329600, taux: 3 } },
  {
    bail: 'BAIL-2026-0011',
    avenant: {
      effet: '2026-10-20',
      texte:
        'Avenant n°1 : échéancier d’apurement de l’arriéré de septembre et d’octobre en trois versements, de novembre à janvier.'
    }
  },
  {
    bail: 'BAIL-2026-0012',
    avenant: {
      effet: '2026-06-15',
      texte:
        'Avenant n°1 : le locataire installe à ses frais un climatiseur dans la seconde chambre, laissé en place en fin de bail.'
    }
  },
  {
    bail: 'BAIL-2026-0014',
    avenant: {
      effet: '2026-08-01',
      texte: 'Avenant n°1 : mise à disposition d’un local de rangement au rez-de-chaussée, sans supplément de loyer.'
    }
  },
  {
    bail: 'BAIL-2026-0015',
    avenant: {
      effet: '2026-09-01',
      texte: 'Avenant n°1 : l’entretien du jardin commun est confié au bailleur, sans modification des charges.'
    }
  },
  {
    bail: 'BAIL-2026-0016',
    avenant: {
      effet: '2026-10-10',
      texte: 'Avenant n°1 : délai accordé pour le loyer d’octobre, réglé en deux versements.'
    }
  },
  { bail: 'BAIL-2026-0018', revision: { mois: '2027-01', loyer: 463500, taux: 3 } },
  {
    bail: 'BAIL-2026-0022',
    avenant: {
      effet: '2026-07-01',
      texte: 'Avenant n°1 : installation par le bailleur d’une citerne de 1 000 litres, sans modification du loyer.'
    }
  },
  { bail: 'BAIL-2026-0023', revision: { mois: '2027-02', loyer: 1442000, taux: 3 } },
  {
    bail: 'BAIL-2026-0024',
    avenant: {
      effet: '2026-08-20',
      texte: 'Avenant n°1 : le preneur est autorisé à poser une enseigne lumineuse en façade, à ses frais.'
    }
  },
  {
    bail: 'BAIL-2026-0026',
    avenant: {
      effet: '2026-04-01',
      texte: 'Avenant n°1 : accès au quai de chargement étendu de 6 h à 22 h, sept jours sur sept.'
    }
  }
];

async function seedEvenements(): Promise<number> {
  let n = 0;
  for (const e of EVENEMENTS) {
    const bail = await prisma.rentalLease.findFirst({
      where: { tenant_id: TENANT_ID, lease_number: e.bail, status: 'ACTIVE' },
      select: { id: true, rent_amount: true }
    });
    if (!bail) continue;
    if (e.avenant) {
      const { effet, texte } = e.avenant;
      if (await prisma.leaseEvent.count({ where: { tenantId: TENANT_ID, leaseId: bail.id, summary: texte } })) continue;
      const ok = await essaie(`${e.bail} avenant au ${effet}`, async () => {
        const cree = await recordAmendment(TENANT_ID, bail.id, { effectiveDate: effet, summary: texte }, acteur);
        // Saisi trois jours avant sa prise d'effet, comme en agence.
        const saisie = new Date(`${effet}T10:00:00Z`);
        saisie.setUTCDate(saisie.getUTCDate() - 3);
        await prisma.leaseEvent.update({ where: { id: (cree as { id: string }).id }, data: { createdAt: saisie } });
      });
      if (ok) n++;
    }
    if (e.revision) {
      const { mois, loyer, taux } = e.revision;
      const deja = await prisma.leaseEvent.count({
        where: { tenantId: TENANT_ID, leaseId: bail.id, type: 'REVISION' }
      });
      if (deja) continue;
      const ok = await essaie(`${e.bail} révision planifiée au ${mois} (+${taux} %)`, () =>
        reviseRent(
          TENANT_ID,
          bail.id,
          {
            effectiveMonth: mois,
            newRent: loyer,
            revisionRate: taux,
            summary: 'Révision annuelle à la date anniversaire du bail, notifiée au locataire un mois à l’avance.'
          },
          acteur
        )
      );
      if (ok) n++;
    }
  }
  return n;
}

// ───────────────────────────────────────── loyers du mois payés d'avance

/**
 * Deux locataires de biens confiés paient le loyer du mois dès son émission :
 * le mois en cours n'est plus vide dans les écrans qui s'ouvrent dessus
 * (Commissions des agents, encaissé du mois, compte du propriétaire).
 */
const AVANCES: { bail: string; methode: RentalPaymentMethod; operateur?: string }[] = [
  { bail: 'BAIL-2026-0015', methode: RentalPaymentMethod.MOBILE_MONEY, operateur: 'WAVE' },
  { bail: 'BAIL-2026-0022', methode: RentalPaymentMethod.BANK_TRANSFER },
  // Bail à gestionnaire désigné : la commission du collaborateur apparaît sur le mois.
  { bail: 'BAIL-2026-0018', methode: RentalPaymentMethod.MOBILE_MONEY, operateur: 'ORANGE' }
];

async function seedAvances(): Promise<number> {
  let n = 0;
  for (const a of AVANCES) {
    const bail = await prisma.rentalLease.findFirst({
      where: { tenant_id: TENANT_ID, lease_number: a.bail, status: 'ACTIVE' },
      select: { id: true, primary_renter_client_id: true }
    });
    if (!bail) continue;
    const echeance = await prisma.rentalInstallment.findFirst({
      where: {
        tenant_id: TENANT_ID,
        lease_id: bail.id,
        period_year: MAINTENANT.getFullYear(),
        period_month: MAINTENANT.getMonth() + 1
      },
      select: {
        id: true,
        status: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true
      }
    });
    if (!echeance || echeance.status === 'PAID') continue;
    const cle = `avance-${echeance.id}`;
    if (await prisma.rentalPayment.count({ where: { tenant_id: TENANT_ID, idempotency_key: cle } })) continue;
    const montant =
      Number(echeance.amount_rent) +
      Number(echeance.amount_service) +
      Number(echeance.amount_other_fees) +
      Number(echeance.penalty_amount) -
      Number(echeance.amount_paid);
    const ok = await essaie(
      `${a.bail} loyer du mois réglé d'avance : ${montant.toLocaleString('fr-FR')} FCFA`,
      async () => {
        const paiement = await createPayment(
          TENANT_ID,
          {
            paidAt: MAINTENANT.toISOString().slice(0, 10),
            leaseId: bail.id,
            renterClientId: bail.primary_renter_client_id,
            method: a.methode,
            amount: montant,
            currency: 'XOF',
            mmOperator: a.operateur,
            mmPhone: a.operateur ? '0707114477' : undefined,
            pspName: a.operateur ? 'CinetPay' : undefined,
            pspTransactionId: a.operateur
              ? `PRES-AV-${bail.id.slice(0, 8)}-${MAINTENANT.toISOString().slice(0, 7)}`
              : undefined,
            pspReference: `AV-${bail.id.slice(0, 8)}-${MAINTENANT.toISOString().slice(0, 7)}`,
            idempotencyKey: cle
          },
          acteur
        );
        await allocatePayment(TENANT_ID, paiement.id, { installmentIds: [echeance.id] }, acteur);
      }
    );
    if (ok) n++;
  }
  return n;
}

// ─────────────────────────────────────── modèles de documents de l'agence

/**
 * L'écran Paramétrage > Documents ne liste que les modèles de l'agence : les
 * modèles globaux par défaut n'y figurent pas. On dépose une copie de chacun,
 * comme le ferait l'agence en téléversant son propre fichier Word.
 */
async function seedModeles(): Promise<number> {
  const NOMS: Record<string, string> = {
    LEASE_HABITATION: 'Contrat de bail d’habitation — modèle de l’agence',
    LEASE_COMMERCIAL: 'Contrat de bail commercial — modèle de l’agence',
    RENT_RECEIPT: 'Reçu et quittance de loyer — modèle de l’agence',
    RENT_STATEMENT: 'Relevé de compte locatif — modèle de l’agence'
  };
  const globaux = await prisma.documentTemplate.findMany({
    where: { tenant_id: null, status: 'ACTIVE', is_default: true },
    select: { doc_type: true, storage_path: true, stored_filename: true, original_filename: true }
  });
  // Même repli que le moteur de rendu (`docx-renderer.ts`) : le chemin stocké
  // peut venir d'une autre machine, le fichier livré est sous `default/`.
  const fichierDe = async (g: (typeof globaux)[number]): Promise<Buffer> => {
    for (const chemin of [
      g.storage_path,
      path.join(getTemplatesWriteDir(), 'default', g.stored_filename),
      path.join(getShippedTemplatesDir(), 'default', g.stored_filename)
    ]) {
      try {
        return await fs.readFile(chemin);
      } catch {
        // chemin suivant
      }
    }
    throw new Error(`fichier du modèle ${g.stored_filename} introuvable`);
  };
  let n = 0;
  for (const g of globaux) {
    const nom = NOMS[g.doc_type];
    if (!nom) continue;
    const existe = await prisma.documentTemplate.findFirst({
      where: { tenant_id: TENANT_ID, doc_type: g.doc_type, name: nom, status: { not: 'DELETED' } },
      select: { id: true }
    });
    if (existe) continue;
    const ok = await essaie(`modèle ${g.doc_type}`, async () => {
      const contenu = await fichierDe(g);
      await uploadTemplate(TENANT_ID, g.doc_type, contenu, g.original_filename, nom, acteur);
    });
    if (ok) n++;
  }
  return n;
}

// ─────────────────────────────────────────── virements de trésorerie

/**
 * Les loyers arrivent surtout en Mobile Money et en espèces, alors que la
 * banque paie les dépenses et les reversements aux propriétaires : sans
 * virement interne, la Banque principale finit à découvert. Chaque mois,
 * l'agence verse à la banque une part de ses encaissements (Trésorerie >
 * Virements internes). Un virement saisi en double est ensuite annulé.
 */
async function seedVirements(): Promise<number> {
  const comptes = await prisma.treasuryAccount.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, kind: true, accountNumber: true, label: true }
  });
  const banque = comptes.find(c => c.accountNumber === '5211');
  if (!banque) throw new Error('compte « Banque principale » (5211) introuvable');
  const sources = comptes.filter(c => c.kind === 'MOBILE_MONEY' || c.kind === 'CASH');

  let n = 0;
  for (const mois of [8, 9, 10]) {
    const jour = new Date(Date.UTC(MAINTENANT.getFullYear(), mois - 1, 14, 10));
    for (const source of sources) {
      const reference = `VERS-${jour.toISOString().slice(0, 7)}-${source.accountNumber}`;
      const deja = await prisma.treasuryTransfer.findFirst({
        where: { tenantId: TENANT_ID, reference },
        select: { id: true }
      });
      if (deja) continue;
      const solde = await soldeTresorerie(source.id);
      const montant = Math.floor((solde * 0.2) / 100000) * 100000;
      if (montant <= 0) continue;
      const ok = await essaie(`${reference} : ${montant.toLocaleString('fr-FR')} FCFA ${source.label} → banque`, () =>
        createTransfer(TENANT_ID, acteur, {
          fromTreasuryAccountId: source.id,
          toTreasuryAccountId: banque.id,
          amount: montant,
          transferredAt: jour,
          reference,
          notes:
            source.kind === 'CASH'
              ? 'Dépôt des espèces encaissées à la banque.'
              : 'Versement mensuel du solde Mobile Money à la banque.'
        })
      );
      if (ok) n++;
    }
  }

  // Un virement saisi deux fois par erreur, puis annulé avec son motif.
  const caisse = sources.find(c => c.kind === 'CASH');
  const reference = 'VERS-DOUBLON-5711';
  if (
    caisse &&
    !(await prisma.treasuryTransfer.findFirst({ where: { tenantId: TENANT_ID, reference }, select: { id: true } }))
  ) {
    const ok = await essaie('virement en double puis annulé', async () => {
      const v = await createTransfer(TENANT_ID, acteur, {
        fromTreasuryAccountId: caisse.id,
        toTreasuryAccountId: banque.id,
        amount: 250000,
        transferredAt: new Date(Date.UTC(MAINTENANT.getFullYear(), 9, 15, 10)),
        reference,
        notes: 'Dépôt d’espèces du 15 octobre.'
      });
      await voidTransfer(TENANT_ID, acteur, (v as { id: string }).id, {
        reason: 'Saisi en double : ce dépôt figure déjà dans le versement du 14 octobre.'
      });
    });
    if (ok) n++;
  }
  return n;
}

/** Solde d'un compte de trésorerie : débits moins crédits de son compte comptable. */
async function soldeTresorerie(treasuryAccountId: string): Promise<number> {
  const compte = await prisma.treasuryAccount.findUnique({
    where: { id: treasuryAccountId },
    select: { chartOfAccountId: true }
  });
  const somme = await prisma.journalEntryLine.aggregate({
    where: { accountId: compte!.chartOfAccountId, entry: { tenantId: TENANT_ID } },
    _sum: { debit: true, credit: true }
  });
  return Number(somme._sum.debit ?? 0) - Number(somme._sum.credit ?? 0);
}

// ───────────────────────────────────────── campagne de facturation

/**
 * Campagne du mois en cours, lancée une seule fois : la relancer remettrait la
 * même campagne en cours et son compte rendu ne montrerait plus que des
 * échéances « déjà émises ».
 */
async function seedCampagneFacturation(): Promise<number> {
  const annee = MAINTENANT.getFullYear();
  const mois = MAINTENANT.getMonth() + 1;
  const deja = await prisma.rentBillingRun.findFirst({
    where: { tenantId: TENANT_ID, periodYear: annee, periodMonth: mois },
    select: { id: true, status: true }
  });
  if (deja) {
    console.log(`  = campagne ${mois}/${annee} déjà lancée (${deja.status})`);
    return 0;
  }
  const libelle = `Loyers de ${MAINTENANT.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  const run = await runRentBilling(TENANT_ID, { periodYear: annee, periodMonth: mois, label: libelle }, acteur);
  const resume = (run as unknown as { summary?: { billed?: unknown[]; excluded?: unknown[] } }).summary;
  console.log(`  + ${libelle} : ${resume?.billed?.length ?? '?'} facturés, ${resume?.excluded?.length ?? '?'} exclus`);
  return 1;
}

// ───────────────────────────────────────────────────────────────── main

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);
  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence');
  acteur = membre.userId;
  console.log(`Agence : ${tenant.name}\nAuteur des écritures : ${membre.user?.email}`);

  await chargerContexte();
  if (biens.size === 0) throw new Error('Aucun bien PRES-NNN : lancer d’abord db:seed:presentation-locative');

  await etape('Coordonnées de l’agence', seedCoordonnees);
  await etape('Fiches de bien : tickets de maintenance', seedTickets);
  await etape('Fiches de bien : valorisations', seedValorisations);
  await etape('Fiches de bien : polices des biens vacants', seedPolices);
  await etape('Fiches de bien : carnet d’entretien', seedCarnet);
  await etape('Fiches de bien : visites', seedVisites);
  await etape('Vie du bail : avenants et révisions anniversaires', seedEvenements);
  await etape('Modèles de documents de l’agence', seedModeles);
  await etape('Virements internes vers la banque', seedVirements);
  if (!process.argv.includes('--sans-facturation')) {
    await etape('Campagne de facturation du mois', seedCampagneFacturation);
  }
  await etape('Loyers du mois réglés d’avance (biens confiés)', seedAvances);

  console.log('\n──────────── BILAN ────────────');
  for (const b of bilan) {
    console.log(
      `${b.etape.padEnd(50)} ${String(b.ok).padStart(4)} créés${b.echecs.length ? '   ⨯ ' + b.echecs[0] : ''}`
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
    // Sortie explicite : `utils/database` enregistre un gestionnaire `beforeExit`
    // asynchrone qui redéclenche l'événement sans fin.
    process.exit(process.exitCode ?? 0);
  });
