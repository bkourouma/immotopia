/**
 * Jeu de données de présentation — onglets annexes de la fiche d'un bien.
 *
 * Suite de `seed-demo-presentation-locative.ts` : une fois les biens `PRES-NNN`
 * et leurs baux en place, ce script remplit ce qui restait vide sur la fiche :
 *
 *   Maintenance · Mandat de gestion · Documents · Patrimoine (valorisations,
 *   dépenses, crédits, travaux) · Assurances et sinistres · Carnet d'entretien ·
 *   Visites.
 *
 * Mêmes partis pris que le script des baux :
 *   - ce qui a un service (mandat, polices, sinistres, carnet, valorisations…)
 *     passe par le service ; seuls les tickets de maintenance, les visites et les
 *     documents sont écrits en base, comme le fait déjà `seed-demo-maintenance.ts`
 *     (le service de ticket envoie des notifications) ;
 *   - aucun envoi sortant (SMTP et SMS neutralisés avant tout import) ;
 *   - idempotent : chaque élément est retrouvé par sa clé naturelle avant d'être
 *     créé, on peut relancer sans rien dupliquer ;
 *   - une étape qui échoue n'arrête pas les autres : elle est signalée au bilan.
 *
 * Les PDF des documents sont GÉNÉRÉS (une page, mention « document fictif ») : ce
 * ne sont pas de vrais titres fonciers.
 *
 * Usage : npm run db:seed:presentation-annexes -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  PrismaClient,
  PropertyOwnershipType,
  MaintenanceTicketCategory as Categorie,
  MaintenanceTicketPriority as Priorite,
  MaintenanceTicketStatus as Statut,
  MaintenanceTicketCommentAuthorType as Auteur
} from '@prisma/client';

import { updateProperty } from '../../src/services/property-service';
import { createMandate } from '../../src/services/property-mandate-service';
import { getOrCreateTenantClientFromContact } from '../../src/services/tenant-service';
import { createPolicy } from '../../src/lib/patrimoine/insurance/policy-service';
import { createClaim, transitionClaim } from '../../src/lib/patrimoine/insurance/claim-service';
import { createMaintenanceLogEntry } from '../../src/lib/patrimoine/insurance/maintenance-log-service';
import {
  createPropertyValuation,
  createPropertyExpense,
  createPropertyLoan,
  createPropertyWorkProgram
} from '../../src/lib/patrimoine/queries';
import { getUploadsRoot } from '../../src/utils/project-root';

const prisma = new PrismaClient({ log: [] });

const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const MAINTENANT = new Date();

/** Date à J-n (ou J+n si n est négatif), à midi. */
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
    const ok = await fn();
    bilan.push({ etape: nom, ok, echecs: [] });
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
  leaseId: string | null;
  renterContactId: string | null;
}

const biens = new Map<string, Bien>();
let acteur = '';

async function chargerBiens(): Promise<void> {
  const lignes = await prisma.property.findMany({
    where: { tenantId: TENANT_ID, internalReference: { startsWith: 'PRES-' } },
    select: {
      id: true,
      internalReference: true,
      title: true,
      address: true,
      rentalLeases: {
        orderBy: { created_at: 'desc' },
        take: 1,
        select: { id: true, primaryRenter: { select: { user: { select: { email: true } } } } }
      }
    }
  });
  for (const l of lignes) {
    const ref = l.internalReference.replace('PRES-', '');
    const bail = l.rentalLeases[0];
    const email = bail?.primaryRenter?.user?.email;
    const contact = email
      ? await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } })
      : null;
    biens.set(ref, {
      id: l.id,
      ref,
      titre: l.title,
      adresse: l.address,
      leaseId: bail?.id ?? null,
      renterContactId: contact?.id ?? null
    });
  }
}

function bien(ref: string): Bien {
  const b = biens.get(ref);
  if (!b) throw new Error(`Bien PRES-${ref} introuvable : lancer d'abord db:seed:presentation-locative`);
  return b;
}

// ─────────────────────────────────────────────────────── prestataires

const PRESTATAIRES = [
  {
    nom: 'Plomberie Express CI',
    tel: '+225 07 08 11 22 33',
    email: 'contact@plomberie-express.exemple.test',
    adresse: 'Zone 4, Marcory — Abidjan',
    specialites: ['plumbing', 'water_heater']
  },
  {
    nom: 'Ivoire Électricité Services',
    tel: '+225 05 06 44 55 66',
    email: 'depannage@ivoire-elec.exemple.test',
    adresse: 'Adjamé Liberté — Abidjan',
    specialites: ['electricity', 'generator']
  },
  {
    nom: 'Froid & Clim Abidjan',
    tel: '+225 01 02 77 88 99',
    email: 'interventions@froidclim.exemple.test',
    adresse: 'Cocody Deux-Plateaux — Abidjan',
    specialites: ['ac', 'ventilation']
  },
  {
    nom: 'BTP Rénovation Baoulé',
    tel: '+225 07 09 33 44 55',
    email: 'chantiers@btp-baoule.exemple.test',
    adresse: 'Yopougon Zone Industrielle — Abidjan',
    specialites: ['masonry', 'painting', 'roofing']
  },
  {
    nom: 'Couleurs & Peinture Plateau',
    tel: '+225 05 01 20 30 40',
    email: 'devis@couleurs-peinture.exemple.test',
    adresse: 'Plateau — Abidjan',
    specialites: ['painting']
  }
];

const vendeurs = new Map<string, string>();

async function seedPrestataires(): Promise<number> {
  let n = 0;
  for (const p of PRESTATAIRES) {
    let v = await prisma.maintenanceVendor.findFirst({ where: { tenant_id: TENANT_ID, name: p.nom } });
    if (!v) {
      v = await prisma.maintenanceVendor.create({
        data: {
          tenant_id: TENANT_ID,
          name: p.nom,
          phone: p.tel,
          email: p.email,
          address: p.adresse,
          specialties: p.specialites,
          is_active: true
        }
      });
      console.log(`  + prestataire ${p.nom}`);
      n++;
    }
    vendeurs.set(p.nom, v.id);
  }
  return n;
}

// ───────────────────────────────────────────────────────────── tickets

interface Echange {
  auteur: Auteur;
  texte: string;
  jours: number;
}

interface PlanTicket {
  ref: string;
  titre: string;
  categorie: Categorie;
  priorite: Priorite;
  description: string;
  localisation?: string;
  statut: Statut;
  prestataire?: string;
  declareIlYA: number;
  resolution?: string;
  echanges: Echange[];
}

const TICKETS: PlanTicket[] = [
  {
    ref: '001',
    titre: 'Fuite sous l’évier de la cuisine',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.HIGH,
    description: 'De l’eau s’écoule du siphon depuis hier soir. Le placard commence à gonfler.',
    localisation: 'Cuisine, placard sous l’évier',
    statut: Statut.RESOLVED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 34,
    resolution: 'Siphon et joint remplacés. Fond de placard séché et traité.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'La fuite s’aggrave, l’eau atteint le carrelage.', jours: 34 },
      { auteur: Auteur.MANAGER, texte: 'Bien reçu. Plomberie Express passe demain matin entre 8h et 10h.', jours: 33 },
      { auteur: Auteur.TENANT, texte: 'Le plombier est passé, tout est sec. Merci.', jours: 31 }
    ]
  },
  {
    ref: '001',
    titre: 'Climatiseur du salon qui ne refroidit plus',
    categorie: Categorie.AC,
    priorite: Priorite.MEDIUM,
    description: 'L’appareil souffle de l’air tiède depuis une semaine, sans code d’erreur.',
    localisation: 'Salon, unité murale',
    statut: Statut.ASSIGNED,
    prestataire: 'Froid & Clim Abidjan',
    declareIlYA: 6,
    echanges: [
      {
        auteur: Auteur.MANAGER,
        texte: 'Intervention programmée jeudi après-midi. Merci de laisser l’accès.',
        jours: 4
      },
      { auteur: Auteur.TENANT, texte: 'Je serai présent jeudi à partir de 14h.', jours: 4 }
    ]
  },
  {
    ref: '002',
    titre: 'Ampoule grillée dans la cage d’escalier',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.LOW,
    description: 'L’éclairage du palier ne fonctionne plus. C’est sombre le soir.',
    localisation: 'Palier du 2e étage',
    statut: Statut.DECLARED,
    declareIlYA: 1,
    echanges: []
  },
  {
    ref: '003',
    titre: 'Chasse d’eau qui fuit en continu',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.MEDIUM,
    description: 'Le réservoir se remplit sans arrêt. La facture d’eau va s’en ressentir.',
    localisation: 'Salle de bain',
    statut: Statut.ASSIGNED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 4,
    echanges: [{ auteur: Auteur.MANAGER, texte: 'Passage prévu vendredi matin.', jours: 3 }]
  },
  {
    ref: '006',
    titre: 'Prise électrique du salon qui ne fonctionne plus',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.MEDIUM,
    description: 'La prise près de la fenêtre a cessé de fonctionner. Les autres sont normales.',
    localisation: 'Salon, mur côté fenêtre',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 3,
    echanges: [
      {
        auteur: Auteur.MANAGER,
        texte: 'Vérification du tableau prévue. Ne rien brancher sur cette prise d’ici là.',
        jours: 2
      }
    ]
  },
  {
    ref: '007',
    titre: 'Interphone de l’entrée hors service',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.MEDIUM,
    description: 'Le combiné ne sonne plus et la gâche ne s’ouvre plus à distance.',
    localisation: 'Hall d’entrée et séjour',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 7,
    echanges: [{ auteur: Auteur.MANAGER, texte: 'Un électricien passe lundi pour changer le combiné.', jours: 6 }]
  },
  {
    ref: '010',
    titre: 'Chauffe-eau sans eau chaude',
    categorie: Categorie.PLUMBING,
    priorite: Priorite.HIGH,
    description: 'Plus d’eau chaude depuis deux jours dans toute la villa.',
    localisation: 'Buanderie',
    statut: Statut.RESOLVED,
    prestataire: 'Plomberie Express CI',
    declareIlYA: 12,
    resolution: 'Résistance et thermostat remplacés. Cuve détartrée.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Deux jours sans eau chaude avec deux enfants, c’est compliqué.', jours: 12 },
      { auteur: Auteur.MANAGER, texte: 'Nous comprenons. Intervention demandée en priorité.', jours: 12 }
    ]
  },
  {
    ref: '010',
    titre: 'Portail d’entrée difficile à manœuvrer',
    categorie: Categorie.OTHER,
    priorite: Priorite.LOW,
    description: 'Le portail frotte au sol et demande beaucoup d’effort.',
    localisation: 'Entrée de la cour',
    statut: Statut.DECLARED,
    declareIlYA: 5,
    echanges: []
  },
  {
    ref: '013',
    titre: 'Bruit de ventilation dans le studio',
    categorie: Categorie.AC,
    priorite: Priorite.LOW,
    description: 'La ventilation fait un bruit de vibration, surtout la nuit.',
    localisation: 'Pièce principale',
    statut: Statut.CANCELED,
    declareIlYA: 16,
    echanges: [{ auteur: Auteur.TENANT, texte: 'Le bruit a cessé de lui-même, je retire ma demande.', jours: 14 }]
  },
  {
    ref: '016',
    titre: 'Infiltration en toiture de la terrasse',
    categorie: Categorie.OTHER,
    priorite: Priorite.HIGH,
    description: 'Des traces d’humidité apparaissent au plafond de la chambre parentale après chaque pluie.',
    localisation: 'Chambre parentale, plafond',
    statut: Statut.ASSIGNED,
    prestataire: 'BTP Rénovation Baoulé',
    declareIlYA: 9,
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Photos jointes après la pluie de mardi.', jours: 9 },
      { auteur: Auteur.MANAGER, texte: 'Devis reçu, intervention validée pour la semaine prochaine.', jours: 5 }
    ]
  },
  {
    ref: '018',
    titre: 'Climatisation du plateau insuffisante en après-midi',
    categorie: Categorie.AC,
    priorite: Priorite.MEDIUM,
    description: 'Les bureaux côté ouest deviennent difficilement tenables après 14h.',
    localisation: 'Open space ouest',
    statut: Statut.RESOLVED,
    prestataire: 'Froid & Clim Abidjan',
    declareIlYA: 45,
    resolution: 'Recharge en fluide et nettoyage des filtres des quatre splits.',
    echanges: [
      { auteur: Auteur.MANAGER, texte: 'Entretien annuel avancé. Intervention la semaine prochaine.', jours: 43 }
    ]
  },
  {
    ref: '019',
    titre: 'Serrure de la porte d’entrée bloquée',
    categorie: Categorie.OTHER,
    priorite: Priorite.URGENT,
    description: 'La clé ne tourne plus : impossible de fermer les bureaux le soir.',
    localisation: 'Porte d’entrée principale',
    statut: Statut.RESOLVED,
    prestataire: 'BTP Rénovation Baoulé',
    declareIlYA: 21,
    resolution: 'Cylindre remplacé, trois clés remises au locataire.',
    echanges: [
      { auteur: Auteur.TENANT, texte: 'Je ne peux pas fermer ce soir, c’est un vrai problème de sécurité.', jours: 21 },
      { auteur: Auteur.MANAGER, texte: 'Prestataire dépêché en urgence dans la soirée.', jours: 21 },
      { auteur: Auteur.TENANT, texte: 'Réparé, merci pour la réactivité.', jours: 20 }
    ]
  },
  {
    ref: '021',
    titre: 'Panne du groupe électrogène de l’immeuble',
    categorie: Categorie.ELECTRICITY,
    priorite: Priorite.URGENT,
    description:
      'Le groupe ne prend plus le relais lors des coupures. Les ascenseurs sont restés à l’arrêt deux heures.',
    localisation: 'Local technique, sous-sol',
    statut: Statut.IN_PROGRESS,
    declareIlYA: 2,
    echanges: [
      {
        auteur: Auteur.TENANT,
        texte: 'Deux heures d’arrêt ce matin. Il nous faut une solution aujourd’hui.',
        jours: 2
      },
      {
        auteur: Auteur.MANAGER,
        texte: 'Technicien sur place cet après-midi. Un groupe de secours est mobilisable si besoin.',
        jours: 2
      }
    ]
  },
  {
    ref: '022',
    titre: 'Rideau métallique du quai de chargement bloqué',
    categorie: Categorie.OTHER,
    priorite: Priorite.HIGH,
    description: 'Le rideau ne descend plus complètement : l’entrepôt ne peut pas être fermé le soir.',
    localisation: 'Quai de chargement',
    statut: Statut.RESOLVED,
    prestataire: 'BTP Rénovation Baoulé',
    declareIlYA: 18,
    resolution: 'Ressort de rappel remplacé, rails nettoyés et graissés.',
    echanges: [{ auteur: Auteur.MANAGER, texte: 'Prestataire dépêché en urgence dans la soirée.', jours: 18 }]
  }
];

async function seedTickets(): Promise<number> {
  let crees = 0;
  for (const t of TICKETS) {
    const b = bien(t.ref);
    const existe = await prisma.maintenanceTicket.findFirst({
      where: { tenant_id: TENANT_ID, property_id: b.id, title: t.titre },
      select: { id: true }
    });
    if (existe) continue;

    const declare = ilYA(t.declareIlYA, 9);
    const prisEnCharge = t.statut !== Statut.DECLARED ? ilYA(t.declareIlYA - 1, 10) : null;
    const assigne = t.prestataire ? ilYA(Math.max(t.declareIlYA - 2, 0), 11) : null;
    const resolu = t.statut === Statut.RESOLVED ? ilYA(Math.max(t.declareIlYA - 3, 0), 16) : null;
    const annule = t.statut === Statut.CANCELED ? ilYA(Math.max(t.declareIlYA - 2, 0), 12) : null;

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        tenant_id: TENANT_ID,
        property_id: b.id,
        lease_id: b.leaseId,
        tenant_contact_id: b.renterContactId,
        created_by_contact_id: b.renterContactId,
        title: t.titre,
        category: t.categorie,
        priority: t.priorite,
        description: t.description,
        location_details: t.localisation ?? null,
        status: t.statut,
        assigned_vendor_id: t.prestataire ? (vendeurs.get(t.prestataire) ?? null) : null,
        assigned_to_user_id: t.statut === Statut.DECLARED ? null : acteur,
        resolution_notes: t.resolution ?? null,
        declared_at: declare,
        in_progress_at: prisEnCharge,
        assigned_at: assigne,
        resolved_at: resolu,
        canceled_at: annule
      }
    });

    const parcours: { de: Statut | null; vers: Statut; quand: Date; note: string }[] = [
      { de: null, vers: Statut.DECLARED, quand: declare, note: 'Signalé depuis le portail locataire.' }
    ];
    if (prisEnCharge) {
      parcours.push({
        de: Statut.DECLARED,
        vers: Statut.IN_PROGRESS,
        quand: prisEnCharge,
        note: 'Pris en charge par l’agence.'
      });
    }
    if (assigne) {
      parcours.push({
        de: Statut.IN_PROGRESS,
        vers: Statut.ASSIGNED,
        quand: assigne,
        note: `Confié à ${t.prestataire}.`
      });
    }
    if (resolu) {
      parcours.push({
        de: assigne ? Statut.ASSIGNED : Statut.IN_PROGRESS,
        vers: Statut.RESOLVED,
        quand: resolu,
        note: t.resolution ?? 'Intervention terminée.'
      });
    }
    if (annule) {
      parcours.push({
        de: Statut.IN_PROGRESS,
        vers: Statut.CANCELED,
        quand: annule,
        note: 'Annulé à la demande du locataire.'
      });
    }
    for (const e of parcours) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: TENANT_ID,
          ticket_id: ticket.id,
          from_status: e.de,
          to_status: e.vers,
          note: e.note,
          changed_by_user_id: e.de === null ? null : acteur,
          changed_at: e.quand
        }
      });
    }
    for (const c of t.echanges) {
      await prisma.maintenanceTicketComment.create({
        data: {
          tenant_id: TENANT_ID,
          ticket_id: ticket.id,
          author_type: c.auteur,
          content: c.texte,
          author_user_id: c.auteur === Auteur.MANAGER ? acteur : null,
          author_contact_id: c.auteur === Auteur.TENANT ? b.renterContactId : null,
          created_at: ilYA(c.jours, 15)
        }
      });
    }
    console.log(`  + [${String(t.statut).padEnd(11)}] PRES-${t.ref} ${t.titre.slice(0, 48)}`);
    crees++;
  }
  return crees;
}

// ──────────────────────────────────────── propriétaires et mandats

const PROPRIETAIRES = [
  { cle: 'henri.bakayoko', prenom: 'Henri', nom: 'Bakayoko', profession: 'Chirurgien', tel: '0707220001' },
  { cle: 'odile.yeo', prenom: 'Odile', nom: 'Yéo', profession: 'Cadre à Paris (diaspora)', tel: '0707220002' },
  { cle: 'salif.konate', prenom: 'Salif', nom: 'Konaté', profession: 'Chef d’entreprise', tel: '0707220003' }
];

/** Bien confié → propriétaire, ancienneté du mandat (mois) et état de signature. */
const MANDATS: { ref: string; proprietaire: string; depuisMois: number; signe: boolean; note: string }[] = [
  {
    ref: '002',
    proprietaire: 'henri.bakayoko',
    depuisMois: 11,
    signe: true,
    note: 'Mandat de gestion locative complète.'
  },
  {
    ref: '004',
    proprietaire: 'henri.bakayoko',
    depuisMois: 8,
    signe: true,
    note: 'Gestion locative et entretien courant.'
  },
  {
    ref: '007',
    proprietaire: 'odile.yeo',
    depuisMois: 5,
    signe: true,
    note: 'Propriétaire à l’étranger : gestion déléguée.'
  },
  {
    ref: '010',
    proprietaire: 'odile.yeo',
    depuisMois: 13,
    signe: true,
    note: 'Villa louée à un expatrié, mandat de trois ans.'
  },
  {
    ref: '011',
    proprietaire: 'salif.konate',
    depuisMois: 10,
    signe: true,
    note: 'Mandat de gestion locative complète.'
  },
  {
    ref: '017',
    proprietaire: 'salif.konate',
    depuisMois: 6,
    signe: false,
    note: 'Mandat créé, en attente de signature du propriétaire.'
  },
  {
    ref: '018',
    proprietaire: 'salif.konate',
    depuisMois: 12,
    signe: false,
    note: 'Mandat créé, en attente de signature du propriétaire.'
  },
  {
    ref: '012',
    proprietaire: 'henri.bakayoko',
    depuisMois: 1,
    signe: false,
    note: 'Villa vacante : mandat pour trouver un locataire.'
  }
];

async function seedMandats(): Promise<number> {
  const contacts = new Map<string, string>();
  for (const p of PROPRIETAIRES) {
    const email = `${p.cle}.proprio.pres@exemple.test`;
    let c = await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } });
    if (!c) {
      c = await prisma.crmContact.create({
        data: {
          tenantId: TENANT_ID,
          contactType: 'PERSON',
          firstName: p.prenom,
          lastName: p.nom,
          email,
          phonePrimary: p.tel,
          whatsappNumber: p.tel,
          profession: p.profession,
          country: "Côte d'Ivoire",
          city: 'Abidjan',
          preferredLanguage: 'fr',
          source: 'Démonstration gestion locative'
        },
        select: { id: true }
      });
      console.log(`  + propriétaire ${p.prenom} ${p.nom}`);
    }
    const role = await prisma.crmContactRole.findFirst({
      where: { tenantId: TENANT_ID, contactId: c.id, role: 'PROPRIETAIRE' },
      select: { id: true }
    });
    if (!role) {
      await prisma.crmContactRole.create({
        data: { tenantId: TENANT_ID, contactId: c.id, role: 'PROPRIETAIRE', active: true, startedAt: ilYA(400) }
      });
    }
    // Le mandat exige que le propriétaire soit un CLIENT de l'agence (`TenantClient`) :
    // « confier » un bien ne le crée pas, c'est le rôle de cette fonction, que le produit
    // appelle aussi quand un bail désigne un propriétaire par son contact.
    await getOrCreateTenantClientFromContact(TENANT_ID, c.id, 'OWNER', { notify: false });
    contacts.set(p.cle, email);
  }

  let n = 0;
  for (const m of MANDATS) {
    const b = bien(m.ref);
    const actuel = await prisma.propertyMandate.findFirst({
      where: { propertyId: b.id, tenantId: TENANT_ID, isActive: true },
      select: { id: true }
    });
    if (actuel) continue;

    const email = contacts.get(m.proprietaire)!;
    const ok = await essaie(`PRES-${m.ref} confié à ${m.proprietaire} + mandat`, async () => {
      await updateProperty(
        b.id,
        { ownershipType: PropertyOwnershipType.CLIENT, ownerEmail: email } as never,
        TENANT_ID,
        null,
        acteur
      );
      const debut = new Date(MAINTENANT);
      debut.setMonth(debut.getMonth() - m.depuisMois);
      debut.setDate(1);
      const fin = new Date(debut);
      fin.setFullYear(fin.getFullYear() + 3);
      const mandat = await createMandate(
        TENANT_ID,
        { propertyId: b.id, startDate: debut, endDate: fin, notes: m.note } as never,
        acteur
      );
      if (m.signe) {
        await prisma.propertyMandate.update({
          where: { id: mandat.id },
          data: { signedAt: new Date(debut.getTime() + 3 * 24 * 3600 * 1000) }
        });
      }
      // Le bail reprend le propriétaire du bien : c'est lui qui servira aux reversements.
      if (b.leaseId) {
        const client = await prisma.tenantClient.findFirst({
          where: { tenantId: TENANT_ID, user: { email } },
          select: { id: true }
        });
        if (client) {
          await prisma.rentalLease.update({
            where: { id: b.leaseId },
            data: { owner_client_id: client.id }
          });
        }
      }
    });
    if (ok) n++;
  }
  return n;
}

// ──────────────────────────────────────────────────── documents (PDF)

async function genererPdf(titre: string, lignes: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(titre, { x: 56, y: 760, size: 20, font: gras, color: rgb(0.1, 0.2, 0.5) });
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

type TypeDoc = 'TITLE_DEED' | 'INSURANCE' | 'TECHNICAL_DIAGNOSIS' | 'TAX_DOCUMENT';

const LIBELLES_DOC: Record<TypeDoc, string> = {
  TITLE_DEED: 'Titre foncier',
  INSURANCE: 'Attestation d’assurance',
  TECHNICAL_DIAGNOSIS: 'Diagnostic technique',
  TAX_DOCUMENT: 'Avis de taxe foncière'
};

/** Dépose un PDF généré dans le dossier du bien et l'enregistre, comme le fait le service d'envoi. */
async function deposerDocument(b: Bien, type: TypeDoc, expire?: Date): Promise<string> {
  const nomFichier = `${LIBELLES_DOC[type].replace(/[’' ]/g, '-')}-PRES-${b.ref}.pdf`;
  const existant = await prisma.propertyDocument.findFirst({
    where: { propertyId: b.id, documentType: type, fileName: nomFichier },
    select: { id: true }
  });
  if (existant) return existant.id;

  const contenu = await genererPdf(LIBELLES_DOC[type], [
    `Bien : ${b.titre}`,
    `Référence : PRES-${b.ref}`,
    `Adresse : ${b.adresse}`,
    `Établi le : ${ilYA(120).toLocaleDateString('fr-FR')}`,
    expire ? `Valable jusqu’au : ${expire.toLocaleDateString('fr-FR')}` : 'Sans date d’expiration.'
  ]);
  const dossier = path.join(getUploadsRoot(process.env.UPLOADS_DIR), 'properties', b.id, 'documents');
  await fs.mkdir(dossier, { recursive: true });
  const fichier = `${type}-${randomUUID()}.pdf`;
  await fs.writeFile(path.join(dossier, fichier), contenu);

  const doc = await prisma.propertyDocument.create({
    data: {
      propertyId: b.id,
      tenantId: TENANT_ID,
      documentType: type,
      filePath: path.join(dossier, fichier),
      fileUrl: `/uploads/properties/${b.id}/documents/${fichier}`,
      fileName: nomFichier,
      fileSize: contenu.length,
      mimeType: 'application/pdf',
      expirationDate: expire ?? null,
      isRequired: type === 'TITLE_DEED',
      isValid: expire ? expire > MAINTENANT : true
    },
    select: { id: true }
  });
  return doc.id;
}

const documentsDeAssurance = new Map<string, string>();

async function seedDocuments(): Promise<number> {
  let n = 0;
  const refs = [...biens.keys()].sort();
  for (const ref of refs) {
    const b = bien(ref);
    await deposerDocument(b, 'TITLE_DEED');
    n++;
    if (b.leaseId) {
      const docAssurance = await deposerDocument(b, 'INSURANCE', ilYA(-120));
      documentsDeAssurance.set(ref, docAssurance);
      n++;
    }
    if (Number(ref) % 3 === 0) {
      await deposerDocument(b, 'TECHNICAL_DIAGNOSIS', ilYA(-700));
      n++;
    }
    if (['010', '011', '021', '022', '016'].includes(ref)) {
      await deposerDocument(b, 'TAX_DOCUMENT');
      n++;
    }
  }
  console.log(`  ${n} document(s) vérifiés ou déposés sur ${refs.length} biens`);
  return n;
}

// ───────────────────────────────────────────────── assurances, sinistres

interface PlanPolice {
  ref: string;
  assureur: string;
  couverture: 'MULTIRISK_HOME' | 'MULTIRISK_BUILDING' | 'OWNER_LIABILITY' | 'OTHER';
  /** Début et fin, en jours avant aujourd'hui (une fin négative est dans le futur). */
  debutIlYA: number;
  finIlYA: number;
  prime: number;
}

const ACTIVE = { debutIlYA: 240, finIlYA: -125 };
const POLICES: PlanPolice[] = [
  { ref: '001', assureur: 'NSIA Assurances', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 85000 },
  { ref: '002', assureur: 'NSIA Assurances', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 98000 },
  {
    ref: '003',
    assureur: 'SUNU Assurances CI',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: 347,
    finIlYA: -18,
    prime: 52000
  },
  { ref: '004', assureur: 'SUNU Assurances CI', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 64000 },
  { ref: '005', assureur: 'Saham Assurance CI', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 48000 },
  { ref: '006', assureur: 'Saham Assurance CI', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 42000 },
  { ref: '007', assureur: 'NSIA Assurances', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 165000 },
  {
    ref: '008',
    assureur: 'SUNU Assurances CI',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: 386,
    finIlYA: 21,
    prime: 58000
  },
  {
    ref: '009',
    assureur: 'NSIA Assurances',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: -10,
    finIlYA: -375,
    prime: 55000
  },
  { ref: '010', assureur: 'Allianz Côte d’Ivoire', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 240000 },
  { ref: '011', assureur: 'Allianz Côte d’Ivoire', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 150000 },
  {
    ref: '012',
    assureur: 'NSIA Assurances',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: -20,
    finIlYA: -385,
    prime: 120000
  },
  {
    ref: '013',
    assureur: 'Saham Assurance CI',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: 425,
    finIlYA: 60,
    prime: 30000
  },
  { ref: '014', assureur: 'Saham Assurance CI', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 28000 },
  {
    ref: '016',
    assureur: 'Allianz Côte d’Ivoire',
    couverture: 'MULTIRISK_HOME',
    debutIlYA: 340,
    finIlYA: -25,
    prime: 190000
  },
  { ref: '017', assureur: 'SUNU Assurances CI', couverture: 'MULTIRISK_HOME', ...ACTIVE, prime: 72000 },
  { ref: '018', assureur: 'NSIA Assurances', couverture: 'OWNER_LIABILITY', ...ACTIVE, prime: 210000 },
  {
    ref: '019',
    assureur: 'SUNU Assurances CI',
    couverture: 'OWNER_LIABILITY',
    debutIlYA: 356,
    finIlYA: -9,
    prime: 95000
  },
  { ref: '021', assureur: 'Allianz Côte d’Ivoire', couverture: 'MULTIRISK_BUILDING', ...ACTIVE, prime: 1450000 },
  { ref: '022', assureur: 'NSIA Assurances', couverture: 'OWNER_LIABILITY', ...ACTIVE, prime: 480000 }
];

const polices = new Map<string, string>();

async function seedPolices(): Promise<number> {
  let n = 0;
  for (const p of POLICES) {
    const b = bien(p.ref);
    const numero = `PRES-POL-${p.ref}-${new Date().getFullYear()}`;
    const existe = await prisma.insurancePolicy.findFirst({
      where: { tenantId: TENANT_ID, propertyId: b.id, policyNumber: numero },
      select: { id: true }
    });
    if (existe) {
      polices.set(p.ref, existe.id);
      continue;
    }
    const ok = await essaie(`police PRES-${p.ref} (${p.assureur})`, async () => {
      const cree = await createPolicy(
        TENANT_ID,
        {
          propertyId: b.id,
          insurer: p.assureur,
          policyNumber: numero,
          coverageType: p.couverture,
          startDate: ilYA(p.debutIlYA),
          endDate: ilYA(p.finIlYA),
          annualPremium: p.prime,
          currency: 'XOF',
          notes: 'Police de démonstration.',
          documentId: documentsDeAssurance.get(p.ref)
        } as never,
        acteur
      );
      polices.set(p.ref, cree.id);
    });
    if (ok) n++;
  }
  return n;
}

interface PlanSinistre {
  ref: string;
  cause: 'WATER_DAMAGE' | 'FIRE' | 'THEFT' | 'STRUCTURAL' | 'STORM' | 'OTHER';
  description: string;
  joursDepuis: number;
  reclame: number;
  ticket?: string;
  /** Statuts successifs ; le dernier est l'état actuel. */
  parcours: ('INSURER_NOTIFIED' | 'EXPERTISE' | 'SETTLED' | 'REJECTED' | 'CLOSED')[];
  indemnise?: number;
  franchise?: number;
  motif?: string;
}

const SINISTRES: PlanSinistre[] = [
  {
    ref: '001',
    cause: 'WATER_DAMAGE',
    description: 'Dégât des eaux consécutif à la fuite sous l’évier : placard et carrelage de la cuisine.',
    joursDepuis: 34,
    reclame: 450000,
    ticket: 'Fuite sous l’évier de la cuisine',
    parcours: ['INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'CLOSED'],
    indemnise: 380000,
    franchise: 70000
  },
  {
    ref: '018',
    cause: 'FIRE',
    description: 'Court-circuit : début d’incendie maîtrisé dans le local technique, câblage à refaire.',
    joursDepuis: 70,
    reclame: 1500000,
    parcours: ['INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'CLOSED'],
    indemnise: 1300000,
    franchise: 200000
  },
  {
    ref: '016',
    cause: 'THEFT',
    description: 'Vol du groupe extérieur de climatisation sur la terrasse.',
    joursDepuis: 40,
    reclame: 1200000,
    parcours: ['INSURER_NOTIFIED', 'EXPERTISE', 'REJECTED'],
    motif: 'Absence d’effraction constatée : le vol n’entre pas dans les garanties de la police.'
  },
  {
    ref: '021',
    cause: 'STORM',
    description: 'Tempête : arrachement de bardage en façade nord de l’immeuble.',
    joursDepuis: 15,
    reclame: 8500000,
    parcours: ['INSURER_NOTIFIED', 'EXPERTISE']
  },
  {
    ref: '022',
    cause: 'STORM',
    description: 'Infiltrations en toiture de l’entrepôt après un violent orage.',
    joursDepuis: 8,
    reclame: 3200000,
    parcours: ['INSURER_NOTIFIED']
  },
  {
    ref: '010',
    cause: 'WATER_DAMAGE',
    description: 'Rupture de canalisation dans la buanderie : sol et murs endommagés.',
    joursDepuis: 3,
    reclame: 900000,
    parcours: []
  }
];

async function seedSinistres(): Promise<number> {
  let n = 0;
  for (const s of SINISTRES) {
    const b = bien(s.ref);
    const policyId = polices.get(s.ref);
    if (!policyId) {
      console.log(`  ⨯ PRES-${s.ref} : pas de police, sinistre ignoré`);
      continue;
    }
    const existe = await prisma.insuranceClaim.findFirst({
      where: { tenantId: TENANT_ID, propertyId: b.id, description: s.description },
      select: { id: true }
    });
    if (existe) continue;

    const ticket = s.ticket
      ? await prisma.maintenanceTicket.findFirst({
          where: { tenant_id: TENANT_ID, property_id: b.id, title: s.ticket },
          select: { id: true }
        })
      : null;

    const ok = await essaie(`sinistre PRES-${s.ref} (${s.cause}) → ${s.parcours.at(-1) ?? 'DECLARED'}`, async () => {
      const claim = await createClaim(
        TENANT_ID,
        {
          propertyId: b.id,
          policyId,
          occurredAt: ilYA(s.joursDepuis),
          cause: s.cause,
          description: s.description,
          claimedAmount: s.reclame,
          ...(ticket ? { ticketId: ticket.id } : {})
        } as never,
        acteur
      );
      for (const vers of s.parcours) {
        await transitionClaim(
          TENANT_ID,
          claim.id,
          {
            toStatus: vers,
            ...(vers === 'SETTLED' ? { indemnifiedAmount: s.indemnise, deductible: s.franchise } : {}),
            ...(vers === 'REJECTED' ? { rejectionReason: s.motif } : {})
          } as never,
          acteur
        );
      }
    });
    if (ok) n++;
  }
  return n;
}

// ──────────────────────────────────────────────── carnet d'entretien

type CategorieCarnet =
  'PLUMBING' | 'ELECTRICAL' | 'AIR_CONDITIONING' | 'GENERATOR' | 'ROOF_WATERPROOFING' | 'PAINTING' | 'OTHER';

interface PlanCarnet {
  ref: string;
  categorie: CategorieCarnet;
  ilYA: number;
  description: string;
  prestataire?: string;
  cout?: number;
  /** Prochaine intervention, en jours à partir d'aujourd'hui (négatif = en retard). */
  prochaineDans?: number;
  /** Garantie, en mois à partir de l'intervention. */
  garantieMois?: number;
}

const PLOMB = 'Plomberie Express CI';
const ELEC = 'Ivoire Électricité Services';
const CLIM = 'Froid & Clim Abidjan';
const BTP = 'BTP Rénovation Baoulé';
const PEINT = 'Couleurs & Peinture Plateau';

const CARNET: PlanCarnet[] = [
  {
    ref: '001',
    categorie: 'PLUMBING',
    ilYA: 31,
    description: 'Remplacement du siphon et du joint sous l’évier',
    prestataire: PLOMB,
    cout: 38000,
    garantieMois: 12
  },
  {
    ref: '001',
    categorie: 'PAINTING',
    ilYA: 400,
    description: 'Peinture complète avant la remise des clés',
    prestataire: PEINT,
    cout: 420000,
    prochaineDans: 330
  },
  {
    ref: '002',
    categorie: 'AIR_CONDITIONING',
    ilYA: 150,
    description: 'Entretien annuel des deux climatiseurs',
    prestataire: CLIM,
    cout: 60000,
    prochaineDans: 215
  },
  {
    ref: '003',
    categorie: 'PLUMBING',
    ilYA: 95,
    description: 'Détartrage du chauffe-eau',
    prestataire: PLOMB,
    cout: 25000,
    prochaineDans: 270
  },
  {
    ref: '004',
    categorie: 'ELECTRICAL',
    ilYA: 210,
    description: 'Vérification du tableau et remplacement de trois disjoncteurs',
    prestataire: ELEC,
    cout: 85000,
    garantieMois: 24
  },
  {
    ref: '005',
    categorie: 'PAINTING',
    ilYA: 180,
    description: 'Remise en peinture du salon et du couloir',
    prestataire: PEINT,
    cout: 160000
  },
  {
    ref: '006',
    categorie: 'AIR_CONDITIONING',
    ilYA: 330,
    description: 'Entretien annuel du split de la chambre',
    prestataire: CLIM,
    cout: 30000,
    prochaineDans: -20
  },
  {
    ref: '007',
    categorie: 'ELECTRICAL',
    ilYA: 120,
    description: 'Installation d’un parafoudre sur le tableau général',
    prestataire: ELEC,
    cout: 145000,
    garantieMois: 24
  },
  {
    ref: '007',
    categorie: 'AIR_CONDITIONING',
    ilYA: 60,
    description: 'Pose de deux climatiseurs dans les chambres',
    prestataire: CLIM,
    cout: 620000,
    garantieMois: 36,
    prochaineDans: 305
  },
  {
    ref: '008',
    categorie: 'PLUMBING',
    ilYA: 240,
    description: 'Réfection de la colonne d’évacuation de la salle de bain',
    prestataire: PLOMB,
    cout: 90000
  },
  {
    ref: '010',
    categorie: 'PLUMBING',
    ilYA: 10,
    description: 'Remplacement de la résistance et du thermostat du chauffe-eau',
    prestataire: PLOMB,
    cout: 72000,
    garantieMois: 12
  },
  {
    ref: '010',
    categorie: 'AIR_CONDITIONING',
    ilYA: 200,
    description: 'Entretien annuel des quatre climatiseurs',
    prestataire: CLIM,
    cout: 140000,
    prochaineDans: 165
  },
  {
    ref: '010',
    categorie: 'OTHER',
    ilYA: 90,
    description: 'Entretien du jardin et traitement de la piscine',
    cout: 120000,
    prochaineDans: 5
  },
  {
    ref: '011',
    categorie: 'ROOF_WATERPROOFING',
    ilYA: 300,
    description: 'Reprise de l’étanchéité de la terrasse couverte',
    prestataire: BTP,
    cout: 380000,
    garantieMois: 60
  },
  {
    ref: '013',
    categorie: 'ELECTRICAL',
    ilYA: 270,
    description: 'Remplacement de la prise et de l’interrupteur de la mezzanine',
    prestataire: ELEC,
    cout: 18000
  },
  {
    ref: '014',
    categorie: 'PAINTING',
    ilYA: 100,
    description: 'Rafraîchissement de la peinture avant l’entrée du locataire',
    prestataire: PEINT,
    cout: 95000
  },
  {
    ref: '016',
    categorie: 'ROOF_WATERPROOFING',
    ilYA: 380,
    description: 'Étanchéité de la terrasse de 40 m²',
    prestataire: BTP,
    cout: 650000,
    garantieMois: 60
  },
  {
    ref: '016',
    categorie: 'GENERATOR',
    ilYA: 160,
    description: 'Révision du groupe électrogène de secours',
    prestataire: ELEC,
    cout: 110000,
    prochaineDans: 20
  },
  {
    ref: '017',
    categorie: 'PLUMBING',
    ilYA: 130,
    description: 'Reprise de l’arrivée d’eau de la cuisine',
    prestataire: PLOMB,
    cout: 45000
  },
  {
    ref: '018',
    categorie: 'AIR_CONDITIONING',
    ilYA: 40,
    description: 'Recharge en fluide et nettoyage des filtres des quatre splits',
    prestataire: CLIM,
    cout: 220000,
    prochaineDans: 325,
    garantieMois: 6
  },
  {
    ref: '018',
    categorie: 'ELECTRICAL',
    ilYA: 65,
    description: 'Remise aux normes du câblage du local technique après incident',
    prestataire: ELEC,
    cout: 480000,
    garantieMois: 24
  },
  {
    ref: '019',
    categorie: 'OTHER',
    ilYA: 19,
    description: 'Remplacement du cylindre de la porte d’entrée',
    prestataire: BTP,
    cout: 55000,
    garantieMois: 12
  },
  {
    ref: '021',
    categorie: 'GENERATOR',
    ilYA: 240,
    description: 'Révision complète du groupe électrogène de l’immeuble',
    prestataire: ELEC,
    cout: 380000,
    prochaineDans: -55
  },
  {
    ref: '021',
    categorie: 'ROOF_WATERPROOFING',
    ilYA: 420,
    description: 'Reprise de l’étanchéité du toit-terrasse',
    prestataire: BTP,
    cout: 2400000,
    garantieMois: 120
  },
  {
    ref: '021',
    categorie: 'AIR_CONDITIONING',
    ilYA: 110,
    description: 'Maintenance de la climatisation centralisée',
    prestataire: CLIM,
    cout: 540000,
    prochaineDans: 70
  },
  {
    ref: '022',
    categorie: 'OTHER',
    ilYA: 15,
    description: 'Remplacement du ressort et graissage du rideau du quai',
    prestataire: BTP,
    cout: 130000,
    garantieMois: 12
  },
  {
    ref: '022',
    categorie: 'ROOF_WATERPROOFING',
    ilYA: 500,
    description: 'Traitement anticorrosion de la toiture en tôle',
    prestataire: BTP,
    cout: 1800000,
    garantieMois: 36
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
    const prochaine = c.prochaineDans !== undefined ? ilYA(-c.prochaineDans) : undefined;

    const ok = await essaie(`carnet PRES-${c.ref} ${c.categorie} — ${c.description.slice(0, 40)}`, () =>
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
          nextDueDate: prochaine,
          warrantyEndDate: garantie
        } as never,
        acteur
      )
    );
    if (ok) n++;
  }
  return n;
}

// ─────────────────────────────────────────────────────────── patrimoine

const VALEUR_ACQUISITION: Record<string, number> = {
  '001': 32000000,
  '002': 42000000,
  '004': 24000000,
  '007': 78000000,
  '010': 145000000,
  '011': 78000000,
  '016': 92000000,
  '018': 160000000,
  '021': 780000000,
  '022': 220000000,
  '003': 17000000,
  '005': 14000000,
  '008': 18000000,
  '017': 30000000
};

async function seedPatrimoine(): Promise<number> {
  let n = 0;
  for (const [ref, acquisition] of Object.entries(VALEUR_ACQUISITION)) {
    const b = bien(ref);

    const valorisations = await prisma.assetValuation.count({ where: { tenantId: TENANT_ID, propertyId: b.id } });
    if (valorisations === 0) {
      const dateAcquisition = ilYA(900);
      const ok1 = await essaie(`valorisation PRES-${ref} (acquisition)`, () =>
        createPropertyValuation(TENANT_ID, b.id, {
          valuatedAt: dateAcquisition,
          estimatedValue: acquisition,
          currency: 'XOF',
          acquisitionCost: Math.round(acquisition * 0.96),
          acquisitionDate: dateAcquisition,
          method: 'MANUAL',
          notes: 'Valeur à l’acquisition.'
        })
      );
      const ok2 = await essaie(`valorisation PRES-${ref} (expertise)`, () =>
        createPropertyValuation(TENANT_ID, b.id, {
          valuatedAt: ilYA(60),
          estimatedValue: Math.round(acquisition * 1.14),
          currency: 'XOF',
          method: 'EXPERT_APPRAISAL',
          notes: 'Expertise annuelle du cabinet.'
        })
      );
      if (ok1) n++;
      if (ok2) n++;
    }

    const depenses: {
      label: string;
      categorie: 'PROPERTY_TAX' | 'INSURANCE' | 'ROUTINE_MAINTENANCE' | 'MANAGEMENT_FEES';
      montant: number;
      jours: number;
    }[] = [
      { label: 'Taxe foncière', categorie: 'PROPERTY_TAX', montant: Math.round(acquisition * 0.004), jours: 200 },
      {
        label: 'Prime d’assurance annuelle',
        categorie: 'INSURANCE',
        montant: Math.round(acquisition * 0.003),
        jours: 120
      },
      {
        label: 'Entretien courant',
        categorie: 'ROUTINE_MAINTENANCE',
        montant: Math.round(acquisition * 0.002),
        jours: 45
      }
    ];
    for (const d of depenses) {
      const label = `${d.label} — PRES-${ref}`;
      const existe = await prisma.propertyExpense.findFirst({
        where: { tenantId: TENANT_ID, propertyId: b.id, label },
        select: { id: true }
      });
      if (existe) continue;
      const ok = await essaie(`dépense « ${label} »`, () =>
        createPropertyExpense(TENANT_ID, b.id, {
          category: d.categorie,
          label,
          amount: d.montant,
          currency: 'XOF',
          paidAt: ilYA(d.jours),
          isCapitalized: false,
          paymentMethod: 'BANK_TRANSFER'
        })
      );
      if (ok) n++;
    }
  }

  // Deux biens financés à crédit.
  for (const [ref, preteur, capital, restant, taux, mensualite] of [
    ['007', 'Société Générale CI', 55000000, 41000000, 7.5, 560000],
    ['010', 'Ecobank CI', 100000000, 78000000, 8.2, 980000]
  ] as const) {
    const b = bien(ref);
    if ((await prisma.propertyLoan.count({ where: { tenantId: TENANT_ID, propertyId: b.id } })) > 0) continue;
    const debut = ilYA(900);
    const fin = new Date(debut);
    fin.setFullYear(fin.getFullYear() + 15);
    const ok = await essaie(`crédit PRES-${ref} (${preteur})`, () =>
      createPropertyLoan(TENANT_ID, b.id, {
        lender: preteur,
        capitalAmount: capital,
        remainingCapital: restant,
        interestRate: taux,
        monthlyPayment: mensualite,
        currency: 'XOF',
        startDate: debut,
        endDate: fin
      })
    );
    if (ok) n++;
  }

  // Quatre programmes de travaux, à des stades différents.
  const travaux: { ref: string; titre: string; cout: number; dans: number; statut?: 'IN_PROGRESS' | 'COMPLETED' }[] = [
    { ref: '004', titre: 'Ravalement et peinture de la façade', cout: 3200000, dans: 40 },
    { ref: '011', titre: 'Construction d’un abri voiture', cout: 4500000, dans: -20, statut: 'IN_PROGRESS' },
    { ref: '021', titre: 'Remplacement des ascenseurs', cout: 38000000, dans: 120 },
    { ref: '018', titre: 'Remise aux normes électriques du plateau', cout: 1900000, dans: -70, statut: 'COMPLETED' }
  ];
  for (const t of travaux) {
    const b = bien(t.ref);
    const existe = await prisma.workProgram.findFirst({
      where: { tenantId: TENANT_ID, propertyId: b.id, title: t.titre },
      select: { id: true }
    });
    if (existe) continue;
    const ok = await essaie(`travaux PRES-${t.ref} « ${t.titre} »`, async () => {
      const cree = await createPropertyWorkProgram(TENANT_ID, b.id, {
        title: t.titre,
        description: 'Programme de travaux suivi depuis la fiche du bien.',
        estimatedCost: t.cout,
        currency: 'XOF',
        plannedDate: ilYA(-t.dans),
        isCapitalized: t.statut === 'COMPLETED'
      });
      if (t.statut) {
        await prisma.workProgram.update({
          where: { id: cree.id },
          data: {
            status: t.statut,
            ...(t.statut === 'COMPLETED' ? { completedDate: ilYA(-t.dans), actualCost: Math.round(t.cout * 1.06) } : {})
          }
        });
      }
    });
    if (ok) n++;
  }
  return n;
}

// ────────────────────────────────────────────────────────────── visites

const PROSPECTS = [
  { cle: 'prospect.sandrine', prenom: 'Sandrine', nom: 'Yapi', tel: '0707330001' },
  { cle: 'prospect.hamed', prenom: 'Hamed', nom: 'Diallo', tel: '0707330002' },
  { cle: 'prospect.carole', prenom: 'Carole', nom: 'Aman', tel: '0707330003' },
  { cle: 'prospect.landry', prenom: 'Landry', nom: 'Bédié', tel: '0707330004' }
];

async function seedVisites(): Promise<number> {
  const ids: string[] = [];
  for (const p of PROSPECTS) {
    const email = `${p.cle}.pres@exemple.test`;
    let c = await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } });
    if (!c) {
      c = await prisma.crmContact.create({
        data: {
          tenantId: TENANT_ID,
          contactType: 'PERSON',
          firstName: p.prenom,
          lastName: p.nom,
          email,
          phonePrimary: p.tel,
          whatsappNumber: p.tel,
          country: "Côte d'Ivoire",
          city: 'Abidjan',
          preferredLanguage: 'fr',
          source: 'Démonstration gestion locative'
        },
        select: { id: true }
      });
    }
    ids.push(c.id);
  }

  let n = 0;
  let i = 0;
  for (const ref of ['009', '012', '015', '020', '023']) {
    const b = bien(ref);
    if ((await prisma.propertyVisit.count({ where: { tenantId: TENANT_ID, propertyId: b.id } })) > 0) continue;
    const passee = new Date(ilYA(6 + i * 2, 10));
    const future = new Date(ilYA(-(3 + i), 15));
    await prisma.propertyVisit.createMany({
      data: [
        {
          propertyId: b.id,
          tenantId: TENANT_ID,
          contactId: ids[i % ids.length],
          visitType: 'VISIT',
          goal: 'CONTACT_TAKING',
          scheduledAt: passee,
          duration: 45,
          location: b.adresse,
          status: 'DONE',
          assignedToUserId: acteur,
          notes: 'Visite effectuée, le prospect est intéressé et doit revenir avec son conjoint.'
        },
        {
          propertyId: b.id,
          tenantId: TENANT_ID,
          contactId: ids[(i + 1) % ids.length],
          visitType: 'VISIT',
          goal: 'NEGOTIATION',
          scheduledAt: future,
          duration: 30,
          location: b.adresse,
          status: 'CONFIRMED',
          assignedToUserId: acteur,
          notes: 'Visite confirmée par téléphone.'
        }
      ]
    });
    console.log(`  + 2 visites sur PRES-${ref}`);
    n += 2;
    i++;
  }
  return n;
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

  await chargerBiens();
  if (biens.size === 0) throw new Error('Aucun bien PRES-NNN : lancer d’abord db:seed:presentation-locative');
  console.log(`${biens.size} biens de la présentation trouvés.`);

  await etape('Prestataires de maintenance', seedPrestataires);
  await etape('Tickets de maintenance', seedTickets);
  await etape('Propriétaires et mandats de gestion', seedMandats);
  await etape('Documents des biens (PDF générés)', seedDocuments);
  await etape('Polices d’assurance', seedPolices);
  await etape('Sinistres', seedSinistres);
  await etape('Carnet d’entretien', seedCarnet);
  await etape('Patrimoine : valorisations, dépenses, crédits, travaux', seedPatrimoine);
  await etape('Visites', seedVisites);

  console.log('\n──────────── BILAN ────────────');
  for (const b of bilan) {
    console.log(
      `${b.etape.padEnd(58)} ${String(b.ok).padStart(4)} créés${b.echecs.length ? '   ⨯ ' + b.echecs[0] : ''}`
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
