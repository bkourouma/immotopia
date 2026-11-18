/**
 * Jeu de données de présentation — module Gestion locative.
 *
 * Alimente UNE agence de test déjà existante (par défaut « Test — Pack Agence ·
 * 6 mois ») avec de quoi dérouler la gestion locative en démonstration :
 * 23 biens aux photos réelles, 20 locataires, 18 baux, échéances, dépôts de
 * garantie, encaissements, retards, pénalités et déclarations de paiement.
 *
 * Trois partis pris, hérités de `seed-demo-locative.ts`.
 *
 *   1. **Tout passe par les services de l'application** pour les baux, les
 *      échéances, les paiements et les pénalités : le jeu reste cohérent avec ce
 *      que le produit sait produire.
 *
 *   2. **Aucun envoi sortant.** Les variables SMTP et SMS sont neutralisées avant
 *      tout import de service : créer un bail ou un compte portail ne fait rien
 *      partir.
 *
 *   3. **Idempotent.** Un bien (`PRES-NNN`), un contact (e-mail) ou un bail déjà
 *      présent est ignoré ; on peut relancer le script sans rien dupliquer.
 *
 * Les photos ne sont pas téléchargées : ce sont de vraies photographies déjà
 * déposées dans `uploads/` pour d'autres biens de la base. Elles sont COPIÉES
 * (jamais partagées) dans le dossier du nouveau bien, selon la convention du
 * service des médias (`uploads/properties/<bienId>/<fichier>`), pour que la
 * suppression d'un bien n'abîme pas les autres.
 *
 * Usage : npm run db:seed:presentation-locative -w @immotopia/api
 */

// ⚠ Avant tout import : les services lisent ces variables au premier envoi.
process.env.EMAIL_SMTP_HOST = '127.0.0.1';
process.env.EMAIL_SMTP_PORT = '1';
process.env.EMAIL_SMTP_USER = '';
process.env.EMAIL_SMTP_PASS = '';
delete process.env.SENDGRID_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  PrismaClient,
  PropertyType,
  RentalBillingFrequency,
  RentalPenaltyMode,
  RentalPaymentMethod,
  RentalDepositMovementType,
  PaymentDeclarationStatus
} from '@prisma/client';

import { createLease, deleteLease } from '../../src/services/rental-lease-service';
import { generateInstallments, recalculateInstallmentStatuses } from '../../src/services/rental-installment-service';
import { createPayment, allocatePayment } from '../../src/services/rental-payment-service';
import { createDeposit, createDepositMovement } from '../../src/services/rental-deposit-service';
import { calculatePenaltiesForOverdueInstallments } from '../../src/services/rental-penalty-service';
import { ensureOperationalJournalTx } from '../../src/lib/finance/accounting';
import { getUploadsRoot } from '../../src/utils/project-root';

const prisma = new PrismaClient();

const TENANT_ID = process.env.DEMO_TENANT_ID || 'de9ee249-d2dd-45c7-a5c2-f55b15a03969';

const AUJOURDHUI = new Date();
AUJOURDHUI.setHours(0, 0, 0, 0);

function ilYAMois(n: number): Date {
  const d = new Date(AUJOURDHUI);
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d;
}

function dansMois(depuis: Date, n: number): Date {
  const d = new Date(depuis);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** Jour `AAAA-MM-JJ`, en UTC (le fuseau d'Abidjan), format attendu par `createPayment`. */
function jourISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Décalage stable tiré d'un identifiant : relancer le script redonne la même date. */
function decalage(id: string, ampleur: number): number {
  return parseInt(id.replace(/-/g, '').slice(0, 6), 16) % ampleur;
}

/** Ramène une date future à aujourd'hui : `createPayment` refuse un règlement daté du futur. */
function auPlusTard(d: Date): Date {
  const maintenant = new Date();
  return d > maintenant ? maintenant : d;
}

/**
 * Date réaliste du règlement d'une échéance : de 3 jours avant à 4 jours après
 * l'échéance. Sans date, `createPayment` date le règlement du jour où le script
 * tourne, et tout l'encaissé tombe sur un seul mois (tableau de bord, relevés
 * propriétaires et journal faussés).
 */
function dateReglement(echeance: { id: string; due_date: Date }): Date {
  const d = new Date(echeance.due_date);
  d.setUTCDate(d.getUTCDate() + decalage(echeance.id, 8) - 3);
  d.setUTCHours(12, 0, 0, 0);
  return auPlusTard(d);
}

/** Le dépôt de garantie est versé un à cinq jours avant l'entrée dans les lieux. */
function dateCaution(bail: { id: string; start_date: Date }): Date {
  const d = new Date(bail.start_date);
  d.setUTCDate(d.getUTCDate() - 1 - decalage(bail.id, 5));
  d.setUTCHours(12, 0, 0, 0);
  return auPlusTard(d);
}

// ───────────────────────────────────────────────────────────────── le plan

type Scenario = 'a_jour' | 'retard' | 'partiel' | 'declaration';

interface Zone {
  nom: string;
  lat: number;
  lng: number;
}

const ZONES: Record<string, Zone> = {
  riviera: { nom: 'Cocody Riviera', lat: 5.3601, lng: -3.9694 },
  angre: { nom: 'Cocody Angré', lat: 5.4012, lng: -3.9871 },
  deuxPlateaux: { nom: 'Cocody Deux-Plateaux', lat: 5.3752, lng: -4.0005 },
  plateau: { nom: 'Plateau', lat: 5.3236, lng: -4.0213 },
  marcory: { nom: 'Marcory Zone 4', lat: 5.3011, lng: -3.9802 },
  treichville: { nom: 'Treichville', lat: 5.2915, lng: -4.0034 },
  yopougon: { nom: 'Yopougon Siporex', lat: 5.3412, lng: -4.0791 },
  koumassi: { nom: 'Koumassi', lat: 5.2934, lng: -3.9412 },
  portBouet: { nom: 'Port-Bouët', lat: 5.2517, lng: -3.9289 },
  bingerville: { nom: 'Bingerville', lat: 5.3553, lng: -3.8904 },
  abobo: { nom: 'Abobo Baoulé', lat: 5.4189, lng: -4.0214 },
  adjame: { nom: 'Adjamé Liberté', lat: 5.3601, lng: -4.0312 }
};

interface PlanBien {
  /** Suffixe de la référence interne : `PRES-<ref>`. */
  ref: string;
  titre: string;
  type: PropertyType;
  zone: keyof typeof ZONES;
  adresse: string;
  description: string;
  surface: number;
  pieces: number;
  chambres: number;
  sdb: number;
  meuble?: boolean;
  /** Nombre de photos voulues (la première est la photo principale). */
  photos: number;
  /** Bail prévu ; absent = bien vacant, proposé à la location. */
  bail?: {
    locataire: string;
    frequence: RentalBillingFrequency;
    depuisMois: number;
    dureeMois: number;
    loyer: number;
    charges: number;
    jourEcheance: number;
    scenario: Scenario;
    impayees?: number;
    note: string;
  };
}

const M = RentalBillingFrequency.MONTHLY;
const T = RentalBillingFrequency.QUARTERLY;

const PLAN: PlanBien[] = [
  // — Appartements
  {
    ref: '001',
    titre: 'Appartement 3 pièces — Riviera Palmeraie',
    type: PropertyType.APPARTEMENT,
    zone: 'riviera',
    adresse: 'Rue des Jasmins, Riviera Palmeraie, Cocody',
    description: 'Appartement lumineux au 2e étage, séjour double, cuisine équipée, deux chambres climatisées.',
    surface: 92,
    pieces: 3,
    chambres: 2,
    sdb: 2,
    photos: 3,
    bail: {
      locataire: 'koffi.armand',
      frequence: M,
      depuisMois: 14,
      dureeMois: 24,
      loyer: 250000,
      charges: 25000,
      jourEcheance: 5,
      scenario: 'declaration',
      note: 'Bail habitation — locataire à jour, une déclaration de paiement à valider.'
    }
  },
  {
    ref: '002',
    titre: 'Appartement 4 pièces — Angré 8e tranche',
    type: PropertyType.APPARTEMENT,
    zone: 'angre',
    adresse: 'Boulevard Latrille, Angré 8e tranche, Cocody',
    description: 'Quatre pièces traversant, balcon, parking en sous-sol, résidence gardée 24 h sur 24.',
    surface: 118,
    pieces: 4,
    chambres: 3,
    sdb: 2,
    photos: 3,
    bail: {
      locataire: 'aya.konan',
      frequence: M,
      depuisMois: 11,
      dureeMois: 24,
      loyer: 320000,
      charges: 30000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation à jour.'
    }
  },
  {
    ref: '003',
    titre: 'Appartement 2 pièces — Marcory Zone 4',
    type: PropertyType.APPARTEMENT,
    zone: 'marcory',
    adresse: 'Rue Pierre et Marie Curie, Marcory Zone 4',
    description: 'Deux pièces rénové, proche des commerces et des transports.',
    surface: 58,
    pieces: 2,
    chambres: 1,
    sdb: 1,
    photos: 3,
    bail: {
      locataire: 'mamadou.diabate',
      frequence: M,
      depuisMois: 9,
      dureeMois: 12,
      loyer: 135000,
      charges: 12000,
      jourEcheance: 5,
      scenario: 'retard',
      impayees: 2,
      note: 'Deux mois impayés — relances en cours.'
    }
  },
  {
    ref: '004',
    titre: 'Appartement 3 pièces — Treichville Arras',
    type: PropertyType.APPARTEMENT,
    zone: 'treichville',
    adresse: 'Avenue 16, Treichville Arras',
    description: 'Trois pièces au 4e étage avec ascenseur, vue dégagée sur la lagune.',
    surface: 84,
    pieces: 3,
    chambres: 2,
    sdb: 1,
    photos: 3,
    bail: {
      locataire: 'fatou.coulibaly',
      frequence: M,
      depuisMois: 8,
      dureeMois: 24,
      loyer: 180000,
      charges: 18000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation à jour.'
    }
  },
  {
    ref: '005',
    titre: 'Appartement 3 pièces — Yopougon Niangon',
    type: PropertyType.APPARTEMENT,
    zone: 'yopougon',
    adresse: 'Niangon Sud, Yopougon',
    description: 'Appartement en rez-de-jardin avec petite cour privative.',
    surface: 76,
    pieces: 3,
    chambres: 2,
    sdb: 1,
    photos: 3,
    bail: {
      locataire: 'yao.kouassi',
      frequence: M,
      depuisMois: 7,
      dureeMois: 12,
      loyer: 110000,
      charges: 10000,
      jourEcheance: 5,
      scenario: 'partiel',
      note: 'Dernière échéance réglée à moitié — statut partiel.'
    }
  },
  {
    ref: '006',
    titre: 'Appartement 2 pièces — Koumassi Remblais',
    type: PropertyType.APPARTEMENT,
    zone: 'koumassi',
    adresse: 'Rue du Remblais, Koumassi',
    description: 'Deux pièces en bon état, eau et électricité individuelles.',
    surface: 52,
    pieces: 2,
    chambres: 1,
    sdb: 1,
    photos: 3,
    bail: {
      locataire: 'adjoua.brou',
      frequence: M,
      depuisMois: 6,
      dureeMois: 12,
      loyer: 95000,
      charges: 8000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation à jour.'
    }
  },
  {
    ref: '007',
    titre: 'Appartement 5 pièces — Deux-Plateaux Vallon',
    type: PropertyType.APPARTEMENT,
    zone: 'deuxPlateaux',
    adresse: 'Rue des Jardins, Deux-Plateaux Vallon, Cocody',
    description: 'Grand appartement familial de standing, deux salons, buanderie, deux places de parking.',
    surface: 165,
    pieces: 5,
    chambres: 4,
    sdb: 3,
    photos: 3,
    bail: {
      locataire: 'ibrahim.traore',
      frequence: M,
      depuisMois: 5,
      dureeMois: 24,
      loyer: 520000,
      charges: 45000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation de standing, à jour.'
    }
  },
  {
    ref: '008',
    titre: 'Appartement 3 pièces — Bingerville Cité',
    type: PropertyType.APPARTEMENT,
    zone: 'bingerville',
    adresse: 'Cité des Cadres, Bingerville',
    description: 'Appartement calme à quinze minutes d’Abidjan, résidence récente.',
    surface: 80,
    pieces: 3,
    chambres: 2,
    sdb: 1,
    photos: 3,
    bail: {
      locataire: 'marie.nguessan',
      frequence: M,
      depuisMois: 4,
      dureeMois: 24,
      loyer: 150000,
      charges: 15000,
      jourEcheance: 5,
      scenario: 'retard',
      impayees: 1,
      note: 'Un mois impayé.'
    }
  },
  {
    ref: '009',
    titre: 'Appartement 3 pièces — Plateau Dokui',
    type: PropertyType.APPARTEMENT,
    zone: 'plateau',
    adresse: 'Rue Lecoeur, Plateau Dokui',
    description: 'Vacant, entièrement repeint, proposé à la location.',
    surface: 78,
    pieces: 3,
    chambres: 2,
    sdb: 1,
    photos: 3
  },

  // — Villas
  {
    ref: '010',
    titre: 'Villa 5 pièces — Riviera Golf',
    type: PropertyType.MAISON_VILLA,
    zone: 'riviera',
    adresse: 'Allée des Flamboyants, Riviera Golf, Cocody',
    description: 'Villa moderne sur deux niveaux, jardin clos, piscine, logement de gardien.',
    surface: 280,
    pieces: 5,
    chambres: 4,
    sdb: 3,
    photos: 2,
    bail: {
      locataire: 'serge.ouattara',
      frequence: M,
      depuisMois: 13,
      dureeMois: 36,
      loyer: 850000,
      charges: 60000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Villa de standing — locataire expatrié, bail de trois ans.'
    }
  },
  {
    ref: '011',
    titre: 'Villa 4 pièces — Bingerville Bassam Road',
    type: PropertyType.MAISON_VILLA,
    zone: 'bingerville',
    adresse: 'Route de Bassam, Bingerville',
    description: 'Villa de plain-pied dans un lotissement sécurisé, grande terrasse couverte.',
    surface: 190,
    pieces: 4,
    chambres: 3,
    sdb: 2,
    photos: 2,
    bail: {
      locataire: 'awa.sangare',
      frequence: M,
      depuisMois: 10,
      dureeMois: 24,
      loyer: 450000,
      charges: 35000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation à jour.'
    }
  },
  {
    ref: '012',
    titre: 'Villa jumelée 4 pièces — Angré Djibi',
    type: PropertyType.MAISON_VILLA,
    zone: 'angre',
    adresse: 'Angré Djibi, Cocody',
    description: 'Villa jumelée avec cour et garage, vacante, proposée à la location.',
    surface: 170,
    pieces: 4,
    chambres: 3,
    sdb: 2,
    photos: 1
  },

  // — Studios
  {
    ref: '013',
    titre: 'Studio meublé — Cocody Danga',
    type: PropertyType.STUDIO,
    zone: 'deuxPlateaux',
    adresse: 'Danga Nord, Cocody',
    description: 'Studio meublé avec mezzanine, idéal pour un jeune actif ou un étudiant.',
    surface: 32,
    pieces: 1,
    chambres: 1,
    sdb: 1,
    meuble: true,
    photos: 2,
    bail: {
      locataire: 'jeanmarc.tanoh',
      frequence: M,
      depuisMois: 5,
      dureeMois: 12,
      loyer: 95000,
      charges: 8000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Studio meublé — bail de un an.'
    }
  },
  {
    ref: '014',
    titre: 'Studio meublé — Marcory Résidentiel',
    type: PropertyType.STUDIO,
    zone: 'marcory',
    adresse: 'Marcory Résidentiel',
    description: 'Studio fonctionnel avec coin bureau, internet fibre inclus.',
    surface: 28,
    pieces: 1,
    chambres: 1,
    sdb: 1,
    meuble: true,
    photos: 2,
    bail: {
      locataire: 'nadia.bamba',
      frequence: M,
      depuisMois: 3,
      dureeMois: 12,
      loyer: 85000,
      charges: 7000,
      jourEcheance: 5,
      scenario: 'declaration',
      note: 'Locataire à jour, une déclaration de paiement à valider.'
    }
  },
  {
    ref: '015',
    titre: 'Studio — Adjamé Liberté',
    type: PropertyType.STUDIO,
    zone: 'adjame',
    adresse: 'Adjamé Liberté',
    description: 'Studio non meublé, vacant, proposé à la location.',
    surface: 26,
    pieces: 1,
    chambres: 1,
    sdb: 1,
    photos: 1
  },

  // — Duplex
  {
    ref: '016',
    titre: 'Duplex 5 pièces avec terrasse — Riviera Bonoumin',
    type: PropertyType.DUPLEX_TRIPLEX,
    zone: 'riviera',
    adresse: 'Riviera Bonoumin, Cocody',
    description: 'Duplex avec grande terrasse, cuisine américaine et suite parentale.',
    surface: 190,
    pieces: 5,
    chambres: 4,
    sdb: 3,
    photos: 1,
    bail: {
      locataire: 'kouadio.fofana',
      frequence: M,
      depuisMois: 8,
      dureeMois: 24,
      loyer: 700000,
      charges: 55000,
      jourEcheance: 5,
      scenario: 'retard',
      impayees: 3,
      note: 'Trois mois impayés — le dossier de recouvrement de la démonstration.'
    }
  },
  {
    ref: '017',
    titre: 'Duplex 4 pièces — Abobo Baoulé',
    type: PropertyType.DUPLEX_TRIPLEX,
    zone: 'abobo',
    adresse: 'Abobo Baoulé',
    description: 'Duplex familial avec cour intérieure.',
    surface: 130,
    pieces: 4,
    chambres: 3,
    sdb: 2,
    photos: 1,
    bail: {
      locataire: 'estelle.gbane',
      frequence: M,
      depuisMois: 6,
      dureeMois: 24,
      loyer: 210000,
      charges: 20000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail habitation à jour.'
    }
  },

  // — Bureaux
  {
    ref: '018',
    titre: 'Plateau de bureaux 180 m² — Plateau Centre',
    type: PropertyType.BUREAU,
    zone: 'plateau',
    adresse: 'Avenue Franchet d’Esperey, Plateau',
    description: 'Plateau cloisonné vitré, climatisation centralisée, deux places de parking.',
    surface: 180,
    pieces: 6,
    chambres: 0,
    sdb: 2,
    photos: 2,
    bail: {
      locataire: 'lassina.doumbia',
      frequence: T,
      depuisMois: 12,
      dureeMois: 36,
      loyer: 1400000,
      charges: 150000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bureaux — facturation trimestrielle.'
    }
  },
  {
    ref: '019',
    titre: 'Bureaux 90 m² — Marcory Zone 4C',
    type: PropertyType.BUREAU,
    zone: 'marcory',
    adresse: 'Boulevard de Marseille, Marcory Zone 4C',
    description: 'Bureaux en R+1, accès indépendant, local archives.',
    surface: 90,
    pieces: 4,
    chambres: 0,
    sdb: 1,
    photos: 2,
    bail: {
      locataire: 'christelle.ake',
      frequence: T,
      depuisMois: 9,
      dureeMois: 36,
      loyer: 750000,
      charges: 80000,
      jourEcheance: 10,
      scenario: 'retard',
      impayees: 1,
      note: 'Bureaux — un trimestre impayé.'
    }
  },
  {
    ref: '020',
    titre: 'Bureaux 60 m² — Cocody Angré',
    type: PropertyType.BUREAU,
    zone: 'angre',
    adresse: 'Angré Château, Cocody',
    description: 'Petit plateau de bureaux vacant, proposé à la location.',
    surface: 60,
    pieces: 3,
    chambres: 0,
    sdb: 1,
    photos: 1
  },

  // — Immeuble, entrepôt, parking
  {
    ref: '021',
    titre: 'Immeuble de rapport R+4 — Treichville',
    type: PropertyType.IMMEUBLE,
    zone: 'treichville',
    adresse: 'Boulevard de Marseille, Treichville',
    description: 'Immeuble de bureaux et commerces loué en bloc à une société de services.',
    surface: 900,
    pieces: 20,
    chambres: 0,
    sdb: 8,
    photos: 5,
    bail: {
      locataire: 'moussa.cisse',
      frequence: T,
      depuisMois: 14,
      dureeMois: 48,
      loyer: 4800000,
      charges: 400000,
      jourEcheance: 5,
      scenario: 'a_jour',
      note: 'Bail commercial en bloc — le plus gros loyer du portefeuille.'
    }
  },
  {
    ref: '022',
    titre: 'Entrepôt 600 m² — Zone industrielle Yopougon',
    type: PropertyType.ENTREPOT_INDUSTRIEL,
    zone: 'yopougon',
    adresse: 'Zone industrielle, Yopougon',
    description: 'Entrepôt avec quai de chargement, bureau d’accueil et cour de manœuvre.',
    surface: 600,
    pieces: 3,
    chambres: 0,
    sdb: 2,
    photos: 2,
    bail: {
      locataire: 'blandine.zadi',
      frequence: T,
      depuisMois: 10,
      dureeMois: 36,
      loyer: 1800000,
      charges: 120000,
      jourEcheance: 5,
      scenario: 'declaration',
      note: 'Entrepôt — facturation trimestrielle, une déclaration à valider.'
    }
  },
  {
    ref: '023',
    titre: 'Box de parking sécurisé — Plateau',
    type: PropertyType.PARKING_BOX,
    zone: 'plateau',
    adresse: 'Parking Sorbonne, Plateau',
    description: 'Box fermé dans un parking gardé, badge d’accès fourni.',
    surface: 15,
    pieces: 1,
    chambres: 0,
    sdb: 0,
    photos: 2
  }
];

/** Locataires : un e-mail neutre par personne, jamais partagé avec une autre agence. */
const LOCATAIRES: Record<string, { prenom: string; nom: string; profession: string; tel: string }> = {
  'koffi.armand': { prenom: 'Armand', nom: 'Koffi', profession: 'Ingénieur télécom', tel: '0707110001' },
  'aya.konan': { prenom: 'Aya', nom: 'Konan', profession: 'Médecin', tel: '0707110002' },
  'mamadou.diabate': { prenom: 'Mamadou', nom: 'Diabaté', profession: 'Enseignant', tel: '0707110003' },
  'fatou.coulibaly': { prenom: 'Fatou', nom: 'Coulibaly', profession: 'Commerçante', tel: '0707110004' },
  'yao.kouassi': { prenom: 'Yao', nom: 'Kouassi', profession: 'Comptable', tel: '0707110005' },
  'adjoua.brou': { prenom: 'Adjoua', nom: 'Brou', profession: 'Infirmière', tel: '0707110006' },
  'ibrahim.traore': { prenom: 'Ibrahim', nom: 'Traoré', profession: 'Directeur commercial', tel: '0707110007' },
  'marie.nguessan': { prenom: 'Marie-Laure', nom: "N'Guessan", profession: 'Pharmacienne', tel: '0707110008' },
  'serge.ouattara': { prenom: 'Serge', nom: 'Ouattara', profession: 'Cadre bancaire', tel: '0707110009' },
  'awa.sangare': { prenom: 'Awa', nom: 'Sangaré', profession: 'Avocate', tel: '0707110010' },
  'jeanmarc.tanoh': { prenom: 'Jean-Marc', nom: 'Tanoh', profession: 'Développeur', tel: '0707110011' },
  'nadia.bamba': { prenom: 'Nadia', nom: 'Bamba', profession: 'Étudiante en master', tel: '0707110012' },
  'kouadio.fofana': { prenom: 'Kouadio', nom: 'Fofana', profession: 'Entrepreneur', tel: '0707110013' },
  'estelle.gbane': { prenom: 'Estelle', nom: 'Gbané', profession: 'Cheffe de projet', tel: '0707110014' },
  'lassina.doumbia': { prenom: 'Lassina', nom: 'Doumbia', profession: 'Gérant de cabinet', tel: '0707110015' },
  'christelle.ake': { prenom: 'Christelle', nom: 'Aké', profession: 'Architecte', tel: '0707110016' },
  'moussa.cisse': { prenom: 'Moussa', nom: 'Cissé', profession: 'Directeur de société', tel: '0707110017' },
  'blandine.zadi': { prenom: 'Blandine', nom: 'Zadi', profession: 'Logisticienne', tel: '0707110018' }
};

const emailDe = (cle: string) => `${cle}.pres@exemple.test`;

const OPERATEURS = ['ORANGE', 'MTN', 'MOOV', 'WAVE'];
const METHODES: RentalPaymentMethod[] = [
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.MOBILE_MONEY,
  RentalPaymentMethod.BANK_TRANSFER,
  RentalPaymentMethod.BANK_TRANSFER,
  RentalPaymentMethod.CASH,
  RentalPaymentMethod.CHECK
];

/** Suite déterministe : deux exécutions produisent le même jeu. */
let graine = 20261102;
function alea(max: number): number {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return Math.floor((graine / 2147483648) * max);
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

// ───────────────────────────────────────────────────────────────── photos

interface Photo {
  fichier: string;
  type: string;
}

/**
 * Vraies photographies déjà présentes sur le disque, dédoublonnées par contenu
 * et rangées par type du bien d'origine. Ce rangement garantit qu'une villa
 * reçoit une photo de villa et pas celle d'une salle de bain.
 */
async function reserveDePhotos(): Promise<Map<string, Photo[]>> {
  const racine = getUploadsRoot(process.env.UPLOADS_DIR);
  const medias = await prisma.propertyMedia.findMany({
    where: {
      mediaType: 'PHOTO',
      fileUrl: { startsWith: '/uploads/properties/' },
      // Les biens de la présentation ne se copient pas eux-mêmes.
      property: { internalReference: { not: { startsWith: 'PRES-' } } }
    },
    select: { fileUrl: true, isPrimary: true, property: { select: { propertyType: true } } },
    orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }]
  });

  const vus = new Set<string>();
  const parType = new Map<string, Photo[]>();
  for (const m of medias) {
    if (!m.fileUrl) continue;
    const fichier = path.join(racine, m.fileUrl.replace('/uploads/', ''));
    if (!/\.jpe?g$/i.test(fichier)) continue;
    let contenu: Buffer;
    try {
      const stat = await fs.stat(fichier);
      if (stat.size < 120_000) continue; // écarte les vignettes et les dessins
      contenu = await fs.readFile(fichier);
    } catch {
      continue; // enregistrée en base mais absente de ce disque
    }
    const empreinte = createHash('md5').update(contenu).digest('hex');
    if (vus.has(empreinte)) continue;
    vus.add(empreinte);
    const type = m.property.propertyType;
    if (!parType.has(type)) parType.set(type, []);
    parType.get(type)!.push({ fichier, type });
  }
  return parType;
}

/** Nombre de photos par type, pour répartir la réserve entre les biens du même type. */
function demandeParType(): Map<PropertyType, number> {
  const demande = new Map<PropertyType, number>();
  for (const p of PLAN) demande.set(p.type, (demande.get(p.type) ?? 0) + p.photos);
  return demande;
}

/** Les photos des gabarits sans réserve propre (aucun) se rabattent sur les intérieurs d'appartement. */
const REPLI: Partial<Record<PropertyType, PropertyType>> = {};

async function attacherPhotos(
  propertyId: string,
  type: PropertyType,
  voulues: number,
  reserve: Map<string, Photo[]>,
  curseurs: Map<string, number>
): Promise<number> {
  const source = reserve.get(type) ?? reserve.get(REPLI[type] ?? PropertyType.APPARTEMENT) ?? [];
  if (source.length === 0) return 0;

  const racine = getUploadsRoot(process.env.UPLOADS_DIR);
  const dossier = path.join(racine, 'properties', propertyId);
  await fs.mkdir(dossier, { recursive: true });

  const curseur = curseurs.get(type) ?? 0;
  let crees = 0;
  for (let i = 0; i < voulues; i++) {
    const photo = source[(curseur + i) % source.length];
    const nom = `photo-${i + 1}.jpg`;
    const cible = path.join(dossier, nom);
    await fs.copyFile(photo.fichier, cible);
    const stat = await fs.stat(cible);
    await prisma.propertyMedia.create({
      data: {
        propertyId,
        tenantId: TENANT_ID,
        mediaType: 'PHOTO',
        filePath: cible,
        fileUrl: `/uploads/properties/${propertyId}/${nom}`,
        fileName: nom,
        fileSize: stat.size,
        mimeType: 'image/jpeg',
        displayOrder: i,
        isPrimary: i === 0
      }
    });
    crees++;
  }
  curseurs.set(type, curseur + voulues);
  return crees;
}

// ──────────────────────────────────────────────── dates des règlements

/**
 * Re-date les règlements posés par une version antérieure de ce script, qui
 * ne passait pas `paidAt` : ils portaient tous la date d'exécution. On réécrit,
 * pour chaque règlement, ce qui dérive de sa date — règlement, affectations,
 * mouvement de dépôt, pièce de recette du journal (et sa contre-passation),
 * mouvements du compte du locataire — puis on recalcule les soldes progressifs
 * des comptes touchés dans l'ordre chronologique. Les montants ne changent pas.
 *
 * Re-synchroniser par le service ne convient pas : `settlePieceTx` contre-passe
 * toute pièce dont la date change, ce qui laisserait une contre-passation datée
 * d'aujourd'hui par règlement. Sans effet si les dates sont déjà bonnes.
 */
async function redaterReglements(): Promise<number> {
  const paiements = await prisma.rentalPayment.findMany({
    where: {
      tenant_id: TENANT_ID,
      OR: [{ idempotency_key: { startsWith: 'reglement-' } }, { idempotency_key: { startsWith: 'caution-' } }],
      lease: { property: { internalReference: { startsWith: 'PRES-' } } }
    },
    select: {
      id: true,
      idempotency_key: true,
      succeeded_at: true,
      lease: { select: { id: true, start_date: true } },
      allocations: { select: { id: true } }
    }
  });
  const echeances = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: TENANT_ID,
      id: {
        in: paiements
          .filter(p => p.idempotency_key?.startsWith('reglement-'))
          .map(p => p.idempotency_key!.slice('reglement-'.length))
      }
    },
    select: { id: true, due_date: true }
  });
  const echeanceParId = new Map(echeances.map(e => [e.id, e]));

  const comptes = new Set<string>();
  let redates = 0;
  for (const p of paiements) {
    const cle = p.idempotency_key!;
    const echeance = cle.startsWith('reglement-') ? echeanceParId.get(cle.slice('reglement-'.length)) : undefined;
    let cible: Date;
    if (echeance) cible = dateReglement(echeance);
    else if (p.lease) cible = dateCaution(p.lease);
    else continue;
    if (p.succeeded_at && jourISO(p.succeeded_at) === jourISO(cible)) continue;

    await prisma.$transaction(async tx => {
      await tx.rentalPayment.update({
        where: { id: p.id },
        data: { succeeded_at: cible, initiated_at: cible, created_at: cible }
      });
      await tx.rentalPaymentAllocation.updateMany({ where: { payment_id: p.id }, data: { created_at: cible } });
      await tx.rentalDepositMovement.updateMany({
        where: { tenant_id: TENANT_ID, payment_id: p.id, type: RentalDepositMovementType.COLLECT },
        data: { created_at: cible }
      });

      // Pièce de recette (et ses reprises `:rN`), puis les contre-passations qui
      // les annulent : même jour, journal de l'exercice de ce jour.
      const pieces = await tx.journalEntry.findMany({
        where: {
          tenantId: TENANT_ID,
          documentType: 'RENTAL_RECEIPT',
          OR: [{ documentId: p.id }, { documentId: { startsWith: `${p.id}:r` } }]
        },
        select: { id: true, voidedByEntryId: true, journal: { select: { journalType: true } } }
      });
      const annulations = await tx.journalEntry.findMany({
        where: { tenantId: TENANT_ID, id: { in: pieces.map(x => x.voidedByEntryId).filter((x): x is string => !!x) } },
        select: { id: true, journal: { select: { journalType: true } } }
      });
      for (const piece of [...pieces, ...annulations]) {
        const journalId = await ensureOperationalJournalTx(
          tx,
          TENANT_ID,
          cible.getUTCFullYear(),
          piece.journal.journalType as 'GENERAL' | 'BANK' | 'CASH' | 'CHARGES'
        );
        await tx.journalEntry.update({ where: { id: piece.id }, data: { entryDate: cible, journalId } });
      }

      const mouvements = await tx.thirdPartyMovement.findMany({
        where: {
          tenantId: TENANT_ID,
          OR: [
            { sourceType: 'RENTAL_PAYMENT', sourceId: p.id },
            { sourceType: 'RENTAL_PAYMENT_ALLOCATION', sourceId: { in: p.allocations.map(a => a.id) } }
          ]
        },
        select: { id: true, accountId: true }
      });
      for (const m of mouvements) comptes.add(m.accountId);
      await tx.thirdPartyMovement.updateMany({
        where: { id: { in: mouvements.map(m => m.id) } },
        data: { movementDate: cible }
      });
    });
    redates++;
  }

  // Une échéance soldée l'est au jour de son dernier règlement.
  await prisma.$executeRaw`
    UPDATE rental_installments i SET paid_at = d.dernier
    FROM (
      SELECT a.installment_id, MAX(p.succeeded_at) AS dernier
      FROM rental_payment_allocations a JOIN rental_payments p ON p.id = a.payment_id
      WHERE p.tenant_id = ${TENANT_ID} AND p.status = 'SUCCESS'
      GROUP BY a.installment_id
    ) d
    WHERE i.id = d.installment_id AND i.status = 'PAID' AND i.paid_at IS DISTINCT FROM d.dernier`;

  // Soldes progressifs recalculés dans l'ordre où le relevé les présente. Le
  // solde final ne bouge pas (somme inchangée) : s'il diffère, le compte a un
  // historique que ce calcul ignore, et on n'y touche pas.
  for (const accountId of comptes) {
    const [compte, lignes] = await Promise.all([
      prisma.thirdPartyAccount.findUnique({ where: { id: accountId }, select: { balance: true } }),
      prisma.thirdPartyMovement.findMany({
        where: { accountId, tenantId: TENANT_ID },
        orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, debit: true, credit: true, balanceAfter: true }
      })
    ]);
    const soldes: number[] = [];
    let solde = 0;
    for (const l of lignes) {
      solde = Math.round((solde + Number(l.debit ?? 0) - Number(l.credit ?? 0)) * 100) / 100;
      soldes.push(solde);
    }
    if (solde !== Number(compte?.balance ?? 0)) {
      console.log(
        `  ⨯ compte de tiers ${accountId.slice(0, 8)} : solde final ${solde} ≠ ${compte?.balance}, laissé tel quel`
      );
      continue;
    }
    for (let i = 0; i < lignes.length; i++) {
      if (Number(lignes[i].balanceAfter) !== soldes[i]) {
        await prisma.thirdPartyMovement.update({ where: { id: lignes[i].id }, data: { balanceAfter: soldes[i] } });
      }
    }
  }
  return redates;
}

// ─────────────────────────────────────────────────────────────────── main

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { name: true } });
  if (!tenant) throw new Error(`Agence ${TENANT_ID} introuvable`);

  const membre = await prisma.membership.findFirst({
    where: { tenantId: TENANT_ID },
    select: { userId: true, user: { select: { email: true } } }
  });
  if (!membre) throw new Error('Aucun collaborateur sur cette agence : il en faut un comme auteur des écritures');
  const acteur = membre.userId;

  console.log(`Agence : ${tenant.name}`);
  console.log(`Auteur des écritures : ${membre.user?.email}\n`);

  // Règle de pénalité : sans règle active, le service en crée une à 2 % sans délai de grâce.
  const regle = await prisma.rentalPenaltyRule.findFirst({ where: { tenant_id: TENANT_ID, is_active: true } });
  if (!regle) {
    await prisma.rentalPenaltyRule.create({
      data: {
        tenant_id: TENANT_ID,
        is_active: true,
        grace_days: 5,
        mode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        fixed_amount: 0,
        rate: 5, // points de pourcentage : le service applique `solde x (taux / 100)`
        cap_amount: 250000,
        min_balance_to_apply: 5000
      }
    });
    console.log('Règle de pénalité créée : 5 jours de grâce, 5 % du solde, plafond 250 000.');
  }

  // Reprise après un arrêt en cours de route : un bail de CE plan sans aucun
  // paiement est à moitié construit. On le supprime, il sera refait. Le filtre
  // sur le bien prévu et la note du plan épargne les baux brouillons ou annulés
  // que les autres scripts de la présentation posent, eux aussi sans paiement.
  const notesDuPlan = new Map(PLAN.filter(p => p.bail).map(p => [`PRES-${p.ref}`, p.bail!.note]));
  const candidats = await prisma.rentalLease.findMany({
    where: {
      tenant_id: TENANT_ID,
      status: 'ACTIVE',
      property: { internalReference: { in: [...notesDuPlan.keys()] } },
      payments: { none: {} }
    },
    select: { id: true, lease_number: true, notes: true, property: { select: { internalReference: true } } }
  });
  const incomplets = candidats.filter(c => c.notes === notesDuPlan.get(c.property.internalReference));
  for (const incomplet of incomplets) {
    await deleteLease(TENANT_ID, incomplet.id, acteur);
    console.log(`Bail incomplet ${incomplet.lease_number} supprimé, il sera recréé.`);
  }

  // ------------------------------------------------------------- photos
  const reserve = await reserveDePhotos();
  const demande = demandeParType();
  console.log('Photos réelles disponibles (uniques) / demandées :');
  for (const [type, voulues] of demande) {
    console.log(`  ${type.padEnd(22)} ${String(reserve.get(type)?.length ?? 0).padStart(3)} / ${voulues}`);
  }
  console.log('');

  // ------------------------------------------------------------- contacts
  const contacts = new Map<string, string>();
  let contactsCrees = 0;
  for (const [cle, l] of Object.entries(LOCATAIRES)) {
    const email = emailDe(cle);
    const existant = await prisma.crmContact.findFirst({ where: { tenantId: TENANT_ID, email }, select: { id: true } });
    if (existant) {
      contacts.set(cle, existant.id);
      continue;
    }
    const cree = await prisma.crmContact.create({
      data: {
        tenantId: TENANT_ID,
        contactType: 'PERSON',
        firstName: l.prenom,
        lastName: l.nom,
        email,
        phonePrimary: l.tel,
        whatsappNumber: l.tel,
        profession: l.profession,
        country: "Côte d'Ivoire",
        city: 'Abidjan',
        preferredLanguage: 'fr',
        source: 'Démonstration gestion locative'
      },
      select: { id: true }
    });
    contacts.set(cle, cree.id);
    contactsCrees++;
  }
  console.log(
    `Contacts locataires : ${contactsCrees} créés, ${Object.keys(LOCATAIRES).length - contactsCrees} déjà présents.\n`
  );

  // ----------------------------------------------------- biens et baux
  const curseurs = new Map<string, number>();
  const bauxCrees: { id: string; scenario: Scenario; renterClientId: string }[] = [];
  let biensCrees = 0;
  let photosCrees = 0;
  let echeancesCreees = 0;
  let paiementsCrees = 0;

  for (const plan of PLAN) {
    const reference = `PRES-${plan.ref}`;
    const zone = ZONES[plan.zone];
    const loue = Boolean(plan.bail);

    let bien = await prisma.property.findFirst({
      where: { tenantId: TENANT_ID, internalReference: reference },
      select: { id: true, title: true }
    });

    if (!bien) {
      const jitter = () => (alea(2000) - 1000) / 100000; // ~ ±1 km, pour ne pas empiler les repères
      bien = await prisma.property.create({
        data: {
          internalReference: reference,
          propertyType: plan.type,
          ownershipType: 'TENANT',
          tenantId: TENANT_ID,
          title: plan.titre,
          description: plan.description,
          address: plan.adresse,
          locationZone: zone.nom,
          latitude: zone.lat + jitter(),
          longitude: zone.lng + jitter(),
          transactionModes: ['RENTAL'],
          price: plan.bail ? plan.bail.loyer : loyerIndicatif(plan),
          fees: plan.bail ? plan.bail.charges : null,
          currency: 'XOF',
          surfaceArea: plan.surface,
          surfaceUseful: Math.round(plan.surface * 0.9),
          rooms: plan.pieces,
          bedrooms: plan.chambres,
          bathrooms: plan.sdb,
          furnishingStatus: plan.meuble ? 'FURNISHED' : 'UNFURNISHED',
          status: 'AVAILABLE',
          availability: 'AVAILABLE',
          isPublished: !loue,
          publishedAt: loue ? null : new Date(),
          qualityScore: 70 + alea(26)
        },
        select: { id: true, title: true }
      });
      biensCrees++;
      photosCrees += await attacherPhotos(bien.id, plan.type, plan.photos, reserve, curseurs);
    }

    if (!plan.bail) {
      console.log(`  ○ ${bien.title.slice(0, 58).padEnd(58)} vacant, proposé à la location`);
      continue;
    }

    const dejaLoue = await prisma.rentalLease.findFirst({ where: { tenant_id: TENANT_ID, property_id: bien.id } });
    if (dejaLoue) {
      console.log(`  = ${bien.title.slice(0, 58).padEnd(58)} porte déjà ${dejaLoue.lease_number}`);
      continue;
    }

    const b = plan.bail;
    const contactId = contacts.get(b.locataire)!;
    const debut = ilYAMois(b.depuisMois);
    const caution = b.loyer * 2;

    const bail = await createLease(
      TENANT_ID,
      {
        propertyId: bien.id,
        primaryRenterContactId: contactId,
        startDate: debut,
        endDate: dansMois(debut, b.dureeMois),
        billingFrequency: b.frequence,
        dueDayOfMonth: b.jourEcheance,
        currency: 'XOF',
        rentAmount: b.loyer,
        serviceChargeAmount: b.charges,
        securityDepositAmount: caution,
        penaltyGraceDays: 5,
        penaltyMode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        penaltyRate: 5,
        penaltyCapAmount: 250000,
        moveInDate: debut,
        notes: b.note
      },
      acteur
    );

    // `psp_transaction_id` est unique dans TOUTE la base, pas par agence : le numéro
    // de bail (`BAIL-2026-0011`) existe dans d'autres agences et ferait collision.
    const cle = `PRES-${bail.id.slice(0, 8)}`;

    const echeances = await generateInstallments(TENANT_ID, bail.id, acteur);
    echeancesCreees += echeances.length;
    const clientId = (bail as unknown as { primary_renter_client_id: string }).primary_renter_client_id;
    bauxCrees.push({ id: bail.id, scenario: b.scenario, renterClientId: clientId });

    console.log(
      `  + ${bail.lease_number}  ${bien.title.slice(0, 50).padEnd(50)} ${String(b.frequence).padEnd(9)} ${echeances.length} échéances`
    );

    // ------------------------------------------------------------ caution
    const depot = await createDeposit(TENANT_ID, bail.id, acteur);
    const paiementCaution = await createPayment(
      TENANT_ID,
      {
        paidAt: jourISO(dateCaution({ id: bail.id, start_date: debut })),
        leaseId: bail.id,
        renterClientId: clientId,
        method: RentalPaymentMethod.MOBILE_MONEY,
        amount: caution,
        currency: 'XOF',
        mmOperator: OPERATEURS[alea(OPERATEURS.length)],
        mmPhone: `07${String(10000000 + alea(89999999)).slice(0, 8)}`,
        pspName: 'CinetPay',
        pspTransactionId: `TXN-CAUTION-${cle}`,
        pspReference: `REF-CAUTION-${cle}`,
        idempotencyKey: `caution-${bail.id}`
      },
      acteur
    );
    await createDepositMovement(
      TENANT_ID,
      depot.id,
      RentalDepositMovementType.COLLECT,
      caution,
      paiementCaution.id,
      undefined,
      "Dépôt de garantie encaissé à l'entrée dans les lieux",
      acteur
    );
    paiementsCrees++;

    // -------------------------------------------------------- règlements
    const echues = echeances
      .filter(e => new Date(e.due_date) <= AUJOURDHUI)
      .sort((x, y) => new Date(x.due_date).getTime() - new Date(y.due_date).getTime());
    const impayees = b.scenario === 'retard' ? (b.impayees ?? 1) : 0;
    const aRegler = echues.slice(0, Math.max(0, echues.length - impayees));

    for (let i = 0; i < aRegler.length; i++) {
      const ech = aRegler[i];
      const derniere = i === aRegler.length - 1;
      const total = montantDu(ech);
      const montant = b.scenario === 'partiel' && derniere ? Math.round(total / 2) : total;
      const methode = METHODES[alea(METHODES.length)];
      const estMM = methode === RentalPaymentMethod.MOBILE_MONEY;

      const paiement = await createPayment(
        TENANT_ID,
        {
          paidAt: jourISO(dateReglement(ech)),
          leaseId: bail.id,
          renterClientId: clientId,
          method: methode,
          amount: montant,
          currency: 'XOF',
          mmOperator: estMM ? OPERATEURS[alea(OPERATEURS.length)] : undefined,
          mmPhone: estMM ? `07${String(10000000 + alea(89999999)).slice(0, 8)}` : undefined,
          pspName: estMM ? 'CinetPay' : undefined,
          pspTransactionId: estMM ? `TXN-${cle}-${i + 1}` : undefined,
          pspReference: `REF-${cle}-${i + 1}`,
          idempotencyKey: `reglement-${ech.id}`
        },
        acteur
      );
      await allocatePayment(TENANT_ID, paiement.id, { installmentIds: [ech.id] }, acteur);
      paiementsCrees++;
    }
    await recalculateInstallmentStatuses(TENANT_ID, bail.id);
  }

  // ------------------------------------------------- dates des règlements
  const redates = await redaterReglements();
  console.log(`\n${redates} règlement(s) re-daté(s) à leur date réelle.`);

  // ------------------------------------------------------------- pénalités
  console.log('\nCalcul des pénalités sur les échéances en retard…');
  const penalites = await calculatePenaltiesForOverdueInstallments(TENANT_ID, acteur);
  console.log(`  ${Array.isArray(penalites) ? penalites.length : 0} pénalité(s) calculée(s).`);

  // --------------------------------------------------------- déclarations
  // Relu en base plutôt que tiré de `bauxCrees` : une reprise après arrêt doit aussi
  // rattraper les baux créés par l'exécution précédente.
  let declarations = 0;
  const aDeclarer = PLAN.filter(p => p.bail?.scenario === 'declaration').map(p => `PRES-${p.ref}`);
  const bauxADeclarer = await prisma.rentalLease.findMany({
    where: { tenant_id: TENANT_ID, property: { internalReference: { in: aDeclarer } } },
    select: { id: true, primary_renter_client_id: true }
  });
  for (const { id, primary_renter_client_id: renterClientId } of bauxADeclarer) {
    // La prochaine échéance est encore « brouillon » tant que sa date n'est pas proche :
    // le locataire peut très bien payer d'avance, c'est ce que la file de validation montre.
    const prochaine = await prisma.rentalInstallment.findFirst({
      where: { tenant_id: TENANT_ID, lease_id: id, status: { in: ['DUE', 'OVERDUE', 'PARTIAL', 'DRAFT'] } },
      orderBy: { due_date: 'asc' }
    });
    if (!prochaine) continue;
    // Toute déclaration déjà posée par ce script compte, quel que soit son statut :
    // une déclaration validée ou rejetée depuis ne doit pas renaître en attente.
    const dejaLa = await prisma.rentalPaymentDeclaration.findFirst({
      where: {
        tenant_id: TENANT_ID,
        lease_id: id,
        notes: 'Transfert effectué depuis mon compte Orange Money, capture jointe.'
      }
    });
    if (dejaLa) continue;

    await prisma.rentalPaymentDeclaration.create({
      data: {
        tenant_id: TENANT_ID,
        lease_id: id,
        installment_id: prochaine.id,
        declared_by: renterClientId,
        amount: montantDu(prochaine),
        payment_date: new Date(AUJOURDHUI.getTime() - 2 * 24 * 3600 * 1000),
        payment_method: RentalPaymentMethod.MOBILE_MONEY,
        mobile_operator: 'ORANGE',
        transaction_phone: '0707081234',
        reference: `OM${String(200000000 + alea(99999999))}`,
        notes: 'Transfert effectué depuis mon compte Orange Money, capture jointe.',
        status: PaymentDeclarationStatus.PENDING
      }
    });
    declarations++;
  }
  console.log(`${declarations} déclaration(s) de paiement en attente de validation.`);

  // ----------------------------------------------------------------- bilan
  const [nbBiens, nbBaux, nbEch, nbPay, nbPen, nbDecl] = await Promise.all([
    prisma.property.count({ where: { tenantId: TENANT_ID } }),
    prisma.rentalLease.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalInstallment.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPayment.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPenalty.count({ where: { tenant_id: TENANT_ID } }),
    prisma.rentalPaymentDeclaration.count({ where: { tenant_id: TENANT_ID } })
  ]);
  const parStatut = await prisma.rentalInstallment.groupBy({
    by: ['status'],
    where: { tenant_id: TENANT_ID },
    _count: true
  });

  console.log('\n──────────── BILAN ────────────');
  console.log(`Créés dans cette exécution : ${biensCrees} biens, ${photosCrees} photos, ${bauxCrees.length} baux,`);
  console.log(`                             ${echeancesCreees} échéances, ${paiementsCrees} paiements`);
  console.log('');
  console.log(`Total biens           : ${nbBiens}`);
  console.log(`Total baux            : ${nbBaux}`);
  console.log(`Total échéances       : ${nbEch}  (${parStatut.map(s => `${s.status}=${s._count}`).join(' ')})`);
  console.log(`Total paiements       : ${nbPay}`);
  console.log(`Total pénalités       : ${nbPen}`);
  console.log(`Déclarations          : ${nbDecl}`);
}

/** Loyer affiché d'un bien vacant, selon son type et sa surface. */
function loyerIndicatif(plan: PlanBien): number {
  const parM2: Partial<Record<PropertyType, number>> = {
    APPARTEMENT: 2200,
    MAISON_VILLA: 2500,
    STUDIO: 3000,
    BUREAU: 7000,
    PARKING_BOX: 1700
  };
  const prix = Math.round(((parM2[plan.type] ?? 2000) * plan.surface) / 5000) * 5000;
  return Math.max(prix, 25000);
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
