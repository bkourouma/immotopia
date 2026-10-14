/**
 * Données et gabarits du volet commercial du PROMOTEUR (3 ans) : programmes,
 * typologies de lots, grille de prix, annuaire professionnel, textes des
 * affaires, tickets de garantie et prestataires.
 *
 * Module sans accès base : constantes et fonctions pures.
 */
import type { PrismaClient } from '@prisma/client';
import type { HistoryContext } from './types';

export type ProgCode = 'COC' | 'ORC' | 'ANG' | 'VAL';

/** Contexte partagé des blocs du volet commercial promoteur. */
export interface PEnv {
  ctx: HistoryContext;
  prisma: PrismaClient;
  tenantId: string;
  adminUserId: string;
  /** Collaborateurs actifs (l'administrateur en tête). */
  staff: string[];
  rng: () => number;
  log: (message: string) => void;
  /** Fragment du tenant : garde les e-mails uniques d'une agence de test à l'autre. */
  tag: string;
}

export interface ProgramSpec {
  code: ProgCode;
  brand: string;
  place: string;
  zone: string;
  lat: number;
  lng: number;
  /** Prix de vente moyen au m², en F CFA. */
  pricePerM2: number;
  spvName: string;
  spvSlug: string;
  /** Typologie des grands lots. */
  largeType: 'MAISON_VILLA' | 'DUPLEX_TRIPLEX';
  highlights: string;
}

export const PROGRAMS: Record<ProgCode, ProgramSpec> = {
  COC: {
    code: 'COC',
    brand: 'Résidence Les Cocotiers',
    place: 'Grand-Bassam',
    zone: 'Grand-Bassam',
    lat: 5.2111,
    lng: -3.7389,
    pricePerM2: 450_000,
    spvName: 'SCCV Les Cocotiers',
    spvSlug: 'sccv-cocotiers',
    largeType: 'MAISON_VILLA',
    highlights: 'à deux pas du quartier France et de la plage, résidence sécurisée avec piscine et espaces verts'
  },
  ORC: {
    code: 'ORC',
    brand: 'Résidence Les Orchidées',
    place: 'Marcory',
    zone: 'Marcory Zone 4',
    lat: 5.2851,
    lng: -3.9724,
    pricePerM2: 560_000,
    spvName: 'SCI Les Orchidées Marcory',
    spvSlug: 'sci-orchidees',
    largeType: 'DUPLEX_TRIPLEX',
    highlights: 'à proximité du Boulevard de Marseille et du pôle commercial de la Zone 4, parking sécurisé en sous-sol'
  },
  ANG: {
    code: 'ANG',
    brand: "Les Jardins d'Angré",
    place: 'Cocody Angré',
    zone: 'Cocody Angré',
    lat: 5.3989,
    lng: -3.9882,
    pricePerM2: 620_000,
    spvName: "SCI Les Jardins d'Angré",
    spvSlug: 'sci-jardins-angre',
    largeType: 'DUPLEX_TRIPLEX',
    highlights: 'au cœur de la 8e tranche d’Angré, proche des écoles, des commerces et du boulevard Mitterrand'
  },
  VAL: {
    code: 'VAL',
    brand: 'Domaine des Vallons',
    place: 'Bingerville',
    zone: 'Bingerville',
    lat: 5.3546,
    lng: -3.9064,
    pricePerM2: 680_000,
    spvName: 'SCI Domaine des Vallons',
    spvSlug: 'sci-vallons',
    largeType: 'MAISON_VILLA',
    highlights: 'dans un cadre verdoyant à Bingerville, domaine fermé avec aire de jeux et club-house'
  }
};

export type LotPropertyType = 'APPARTEMENT' | 'MAISON_VILLA' | 'DUPLEX_TRIPLEX' | 'BOUTIQUE_COMMERCIAL';

export interface LotSpec {
  type: LotPropertyType;
  label: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  /** Majoration de prix liée au type et à l'étage. */
  premium: number;
}

/** Typologie d'un lot selon sa surface, son programme et sa position dans le bâtiment. */
export function lotSpec(prog: ProgCode, surface: number, commercial: boolean, floor: number): LotSpec {
  if (commercial) {
    return {
      type: 'BOUTIQUE_COMMERCIAL',
      label: 'Boutique en rez-de-chaussée',
      rooms: 2,
      bedrooms: 0,
      bathrooms: 1,
      premium: 1.15
    };
  }
  const villaFrom = prog === 'VAL' ? 85 : prog === 'COC' ? 118 : 200;
  const duplexFrom = prog === 'VAL' ? 70 : prog === 'ANG' ? 112 : prog === 'ORC' ? 114 : 200;
  if (surface >= villaFrom) {
    const rooms = surface >= 118 ? 6 : 5;
    return {
      type: 'MAISON_VILLA',
      label: `Villa F${rooms - 1}`,
      rooms,
      bedrooms: rooms - 2,
      bathrooms: 3,
      premium: 1.12
    };
  }
  if (surface >= duplexFrom) {
    const rooms = surface >= 118 ? 5 : 4;
    return {
      type: 'DUPLEX_TRIPLEX',
      label: `Duplex F${rooms}`,
      rooms,
      bedrooms: rooms - 1,
      bathrooms: 2,
      premium: 1.06
    };
  }
  const floorPremium = 1 + Math.min(floor, 5) * 0.012;
  if (surface <= 66)
    return { type: 'APPARTEMENT', label: 'Appartement F2', rooms: 2, bedrooms: 1, bathrooms: 1, premium: floorPremium };
  if (surface <= 88)
    return { type: 'APPARTEMENT', label: 'Appartement F3', rooms: 3, bedrooms: 2, bathrooms: 1, premium: floorPremium };
  return { type: 'APPARTEMENT', label: 'Appartement F4', rooms: 4, bedrooms: 3, bathrooms: 2, premium: floorPremium };
}

export const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

export function floorLabel(floor: number): string {
  return floor === 0 ? 'rez-de-chaussée' : floor === 1 ? '1er étage' : `${floor}e étage`;
}

// ───────────────────────────────────────────────────────── annuaire professionnel

export interface ProContact {
  first: string;
  last: string;
  kind: 'NOTARY' | 'BANKER' | 'PARTNER';
  profession: string;
  employer: string;
  phone: string;
  note: string;
}

export const PRO_CONTACTS: readonly ProContact[] = [
  {
    first: 'Aya',
    last: 'Kouamé',
    kind: 'NOTARY',
    profession: 'Notaire',
    employer: 'Étude de Maître Kouamé Aya, Plateau',
    phone: '+225 27 20 21 22 01',
    note: 'Étude de référence pour les actes de vente en l’état futur d’achèvement des programmes.'
  },
  {
    first: 'Fanta',
    last: 'Coulibaly',
    kind: 'NOTARY',
    profession: 'Notaire',
    employer: 'Étude de Maître Coulibaly Fanta, Cocody Danga',
    phone: '+225 27 22 44 55 02',
    note: 'Prépare les actes des acquéreurs de la diaspora, signature à distance possible par procuration.'
  },
  {
    first: 'Lassina',
    last: 'Ouattara',
    kind: 'NOTARY',
    profession: 'Notaire',
    employer: 'Étude de Maître Ouattara Lassina, Marcory',
    phone: '+225 27 21 26 27 03',
    note: 'Instruit les dossiers de la Résidence Les Orchidées.'
  },
  {
    first: 'Tiémoko',
    last: 'Bamba',
    kind: 'NOTARY',
    profession: 'Notaire',
    employer: 'Étude de Maître Bamba Tiémoko, Plateau',
    phone: '+225 27 20 32 33 04',
    note: 'Dépositaire des titres fonciers mères des programmes de Bingerville.'
  },
  {
    first: 'Marie-Laure',
    last: 'N’Dri',
    kind: 'NOTARY',
    profession: 'Notaire',
    employer: 'Étude de Maître N’Dri Marie-Laure, Riviera',
    phone: '+225 27 22 48 49 05',
    note: 'Étude choisie par les acquéreurs d’Angré.'
  },
  {
    first: 'Théodore',
    last: 'Kouamé',
    kind: 'BANKER',
    profession: 'Chargé d’affaires immobilier',
    employer: 'Société Générale Côte d’Ivoire',
    phone: '+225 27 20 20 10 11',
    note: 'Interlocuteur des prêts acquéreurs et de la garantie financière d’achèvement.'
  },
  {
    first: 'Nadège',
    last: 'Gnagne',
    kind: 'BANKER',
    profession: 'Conseillère clientèle patrimoniale',
    employer: 'Ecobank Côte d’Ivoire',
    phone: '+225 27 20 31 90 12',
    note: 'Convention de financement acquéreurs : taux préférentiel pour les réservataires du programme.'
  },
  {
    first: 'Cheick',
    last: 'Diarrassouba',
    kind: 'BANKER',
    profession: 'Responsable crédits immobiliers',
    employer: 'Bank of Africa Côte d’Ivoire',
    phone: '+225 27 20 30 70 13',
    note: 'Traite les demandes de prêt des fonctionnaires et cadres du secteur public.'
  },
  {
    first: 'Estelle',
    last: 'Kacou',
    kind: 'BANKER',
    profession: 'Chargée de clientèle diaspora',
    employer: 'NSIA Banque',
    phone: '+225 27 20 31 11 14',
    note: 'Spécialisée dans le financement des acquéreurs résidant à l’étranger.'
  },
  {
    first: 'Jean-Marc',
    last: 'Assoumou',
    kind: 'PARTNER',
    profession: 'Architecte DPLG',
    employer: 'Atelier Lagune Architectes',
    phone: '+225 07 07 11 21 31',
    note: 'Maître d’œuvre des programmes ; présent aux visites techniques à la demande des acquéreurs.'
  },
  {
    first: 'Adama',
    last: 'Soro',
    kind: 'PARTNER',
    profession: 'Géomètre-expert',
    employer: 'Cabinet Kouamé & Associés, géomètres-experts',
    phone: '+225 05 05 22 33 44',
    note: 'Bornage des parcelles et plans de division des lots.'
  },
  {
    first: 'Sylvie',
    last: 'Tanoh',
    kind: 'PARTNER',
    profession: 'Courtière en crédit immobilier',
    employer: 'Habitat Finance CI',
    phone: '+225 01 01 55 66 77',
    note: 'Apporteuse d’affaires : monte les dossiers de prêt des acquéreurs, commission sur les ventes conclues.'
  },
  {
    first: 'Ibrahim',
    last: 'Sylla',
    kind: 'PARTNER',
    profession: 'Responsable régie publicitaire',
    employer: 'Régie Panneaux Abidjan',
    phone: '+225 07 48 59 60 71',
    note: 'Panneaux 4x3 et affichage chantier des programmes.'
  },
  {
    first: 'Patricia',
    last: 'Zadi',
    kind: 'PARTNER',
    profession: 'Conseillère en investissement',
    employer: 'Diaspora Invest Paris',
    phone: '+33 6 12 34 56 78',
    note: 'Relais commercial en France : présentations du programme aux investisseurs de la diaspora.'
  }
];

export const DIASPORA_CITIES: readonly { city: string; country: string; prefix: string }[] = [
  { city: 'Paris', country: 'France', prefix: '+33 6' },
  { city: 'Lyon', country: 'France', prefix: '+33 7' },
  { city: 'Bruxelles', country: 'Belgique', prefix: '+32 4' },
  { city: 'Montréal', country: 'Canada', prefix: '+1 514' },
  { city: 'New York', country: 'États-Unis', prefix: '+1 917' },
  { city: 'Genève', country: 'Suisse', prefix: '+41 79' }
];

export const SOURCES: readonly {
  label: string;
  enum: 'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL';
}[] = [
  { label: 'Site du programme', enum: 'WEBSITE' },
  { label: 'Réseaux sociaux', enum: 'SOCIAL_MEDIA' },
  { label: 'Recommandation d’un acquéreur', enum: 'REFERRAL' },
  { label: 'Salon de l’immobilier', enum: 'AGENCY' },
  { label: 'Passage au bureau de vente', enum: 'WALK_IN' },
  { label: 'Panneau chantier', enum: 'PHONE_CALL' },
  { label: 'Apporteur d’affaires', enum: 'REFERRAL' }
];

export const TAG_DEFS_PROMOTEUR: readonly { name: string; color: string }[] = [
  { name: 'Investisseur', color: '#1d4ed8' },
  { name: 'Primo-accédant', color: '#0f766e' },
  { name: 'Diaspora', color: '#7c3aed' },
  { name: 'VIP', color: '#b45309' },
  { name: 'Financement validé', color: '#059669' },
  { name: 'À relancer', color: '#dc2626' },
  { name: 'Acquéreur Les Cocotiers', color: '#0369a1' },
  { name: 'Acquéreur Les Orchidées', color: '#be185d' },
  { name: 'Acquéreur Les Jardins d’Angré', color: '#15803d' },
  { name: 'Réservataire Domaine des Vallons', color: '#9333ea' },
  { name: 'Notaire', color: '#475569' },
  { name: 'Banquier', color: '#0e7490' },
  { name: 'Partenaire', color: '#a16207' },
  { name: 'Apporteur d’affaires', color: '#c2410c' }
];

// ───────────────────────────────────────────────────────── textes des affaires

export const LOST_REASONS_PROMOTEUR = [
  'Financement refusé par la banque',
  'Budget insuffisant pour la typologie recherchée',
  'A choisi un programme concurrent mieux situé',
  'Report du projet d’achat',
  'Lot souhaité déjà réservé'
] as const;

export interface TraceTemplate {
  subject: string;
  content: string;
  type: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'VISIT';
}

export function buyTraces(program: string, lot: string): TraceTemplate[] {
  return [
    {
      subject: 'Première prise de contact',
      content: `Demande d’informations sur ${program} : typologies disponibles, prix au m² et calendrier de livraison.`,
      type: 'CALL'
    },
    {
      subject: 'Envoi de la brochure et des plans',
      content: `Brochure, plans du lot ${lot} et grille de prix envoyés par WhatsApp avec le plan de financement type.`,
      type: 'WHATSAPP'
    },
    {
      subject: 'Visite du programme',
      content: `Visite de l’appartement témoin et du chantier avec le commercial ; le client a repéré le lot ${lot}.`,
      type: 'VISIT'
    },
    {
      subject: 'Simulation de financement',
      content:
        'Échéancier d’appels de fonds présenté ; le client dépose son dossier auprès de sa banque, accord de principe attendu sous trois semaines.',
      type: 'EMAIL'
    },
    {
      subject: 'Négociation et offre',
      content: `Offre d’achat remise pour le lot ${lot} ; contre-proposition étudiée avec la direction commerciale.`,
      type: 'MEETING'
    }
  ];
}

export const FOLLOW_UPS_PROMOTEUR: readonly {
  type: string;
  subject: string;
  content: string;
  kind: 'TASK' | 'MEETING';
}[] = [
  {
    type: 'Relance téléphonique',
    subject: 'Relance après la visite sur plan',
    content:
      'Rappeler le client pour recueillir son retour sur la visite du programme et proposer le lot qui correspond à son budget.',
    kind: 'TASK'
  },
  {
    type: 'Envoi de sélection',
    subject: 'Envoi de la grille de prix actualisée',
    content: 'Envoyer par WhatsApp la grille de prix à jour avec les lots encore disponibles et les plans.',
    kind: 'TASK'
  },
  {
    type: 'Rendez-vous bureau de vente',
    subject: 'Rendez-vous de signature du contrat de réservation',
    content:
      'Recevoir l’acquéreur au bureau de vente pour la signature du contrat de réservation et la remise du chèque d’acompte.',
    kind: 'MEETING'
  },
  {
    type: 'Relance dossier',
    subject: 'Pièces manquantes au dossier de réservation',
    content:
      'Relancer pour l’attestation de revenus, la copie de la pièce d’identité et le justificatif d’origine des fonds.',
    kind: 'TASK'
  },
  {
    type: 'Appel de fonds',
    subject: 'Notification de l’appel de fonds à l’avancement',
    content:
      'Notifier à l’acquéreur l’appel de fonds consécutif à l’achèvement de l’étape et joindre le justificatif de l’architecte.',
    kind: 'TASK'
  },
  {
    type: 'Rendez-vous notaire',
    subject: 'Signature de l’acte chez le notaire',
    content: 'Confirmer la date de signature de l’acte avec l’étude notariale et prévenir les deux parties.',
    kind: 'MEETING'
  },
  {
    type: 'Rappel financement',
    subject: 'Suivi de l’accord de prêt de la banque',
    content:
      'Contacter le chargé d’affaires de la banque pour obtenir l’accord de prêt avant l’échéance de la condition suspensive.',
    kind: 'TASK'
  },
  {
    type: 'Visite de chantier',
    subject: 'Visite de chantier avec l’acquéreur',
    content: 'Organiser avec le conducteur de travaux une visite de l’avancement pour les réservataires.',
    kind: 'MEETING'
  }
];

export const CONTACT_NOTES_PROMOTEUR: readonly string[] = [
  'Acquéreur sérieux, projet bien cadré : résidence principale pour sa famille, livraison souhaitée avant la rentrée scolaire.',
  'Vit à l’étranger : privilégier les échanges par WhatsApp le soir et les visites virtuelles ; signature par procuration envisagée.',
  'Investisseur : cherche deux lots pour la location meublée, sensible au rendement et à la fiscalité des revenus fonciers.',
  'Dossier de financement en cours auprès de sa banque, accord de principe attendu avant la fin du mois.',
  'Hésite entre un F3 et un F4 ; le conjoint participe à la décision, prévoir une seconde visite à deux.',
  'Demande de remise commerciale en cas de paiement comptant : à étudier avec la direction.',
  'Recommandé par un acquéreur de la Résidence Les Cocotiers : à traiter en priorité.',
  'Souhaite être informé en avant-première de l’ouverture de la tranche suivante.',
  'A demandé le plan de masse et le calendrier détaillé des appels de fonds avant de se positionner.',
  'Primo-accédant : accompagner dans le montage du dossier de prêt et l’épargne logement.',
  'Cadre de la fonction publique : financement par le Compte de Mobilisation pour l’Habitat à vérifier.',
  'Très réactif sur WhatsApp, a déjà visité deux programmes concurrents.'
];

export const DEAL_NOTES_PROMOTEUR: readonly string[] = [
  'Le client a visité l’appartement témoin deux fois, il revient avec son épouse samedi.',
  'Contre-proposition transmise : remise de 3 % si le contrat de réservation est signé avant la fin du mois.',
  'Financement : accord de la banque obtenu, reste l’assurance emprunteur.',
  'Le client souhaite un étage élevé et une orientation vers le jardin.',
  'Pièces d’identité et attestation de revenus reçues, dossier complet.',
  'Le client demande une clause suspensive d’obtention de prêt à 45 jours.',
  'Choix des finitions à arrêter avec l’architecte avant la signature de l’acte.'
];

export const PROPERTY_NOTES_PROMOTEUR: readonly string[] = [
  'Lot en tête de plan : forte demande, ne pas descendre sous le prix plancher.',
  'Photos du lot témoin refaites après la pose des carrelages, fiche republiée.',
  'Vue dégagée côté jardin : argument commercial à mettre en avant.',
  'Réserve d’une option expirée le mois dernier, relancer le prospect concerné.'
];

export const SAVED_SEARCHES_PROMOTEUR: readonly {
  name: string;
  description: string;
  scope: 'PERSONAL' | 'TEAM' | 'TENANT';
  filters: Record<string, unknown>;
  uses: number;
}[] = [
  {
    name: 'Prospects chauds à relancer',
    description: 'Prospects à fort potentiel sans échange depuis plus de deux semaines.',
    scope: 'TEAM',
    filters: { statuses: ['LEAD'], maturityLevels: ['HOT'], scoreMin: 60 },
    uses: 41
  },
  {
    name: 'Acquéreurs avec financement validé',
    description: 'Contacts dont la capacité d’emprunt est confirmée : à prioriser pour les derniers lots.',
    scope: 'TEAM',
    filters: { dealTypes: ['ACHAT'], borrowingCapacities: ['YES'], budgetMin: 30_000_000 },
    uses: 27
  },
  {
    name: 'Acquéreurs de la diaspora',
    description: 'Investisseurs résidant à l’étranger, cible des présentations en ligne.',
    scope: 'TENANT',
    filters: { tagIds: ['__TAG_DIASPORA__'], hasAnyTag: true },
    uses: 19
  },
  {
    name: 'Acquéreurs livrés (garantie en cours)',
    description: 'Propriétaires des programmes livrés, utiles pour le suivi de la garantie de parfait achèvement.',
    scope: 'TENANT',
    filters: { roles: ['ACQUEREUR'], statuses: ['ACTIVE_CLIENT'] },
    uses: 33
  },
  {
    name: 'Nouveaux contacts du mois',
    description: 'Contacts créés au cours des trente derniers jours.',
    scope: 'PERSONAL',
    filters: { createdAfter: '__DAYS_30__' },
    uses: 52
  },
  {
    name: 'Budget supérieur à 60 M F CFA',
    description: 'Acquéreurs haut de gamme à orienter vers les villas et les duplex.',
    scope: 'PERSONAL',
    filters: { dealTypes: ['ACHAT'], budgetMin: 60_000_000 },
    uses: 14
  },
  {
    name: 'Contacts sans activité depuis 90 jours',
    description: 'À requalifier ou archiver lors de la revue trimestrielle.',
    scope: 'TEAM',
    filters: { lastInteractionBefore: '__DAYS_90__', statuses: ['LEAD'] },
    uses: 8
  }
];

// ───────────────────────────────────────────────────────── ventes

export const CONDITION_LABELS_PROMOTEUR = [
  'Obtention du prêt bancaire par l’acquéreur',
  'Justification de l’origine des fonds et de l’apport personnel',
  'Remise de l’attestation de garantie financière d’achèvement',
  'Purge du délai de rétractation de l’acquéreur'
] as const;

export const OFFER_CONDITIONS_PROMOTEUR = [
  'Offre ferme sous réserve d’obtention du financement bancaire.',
  'Offre avec paiement par appels de fonds selon l’échéancier du programme.',
  'Offre au comptant : réservation immédiate contre une remise commerciale.',
  'Financement mixte : apport personnel de 30 % et prêt sur 15 ans.',
  'Offre valable 15 jours, visite technique du lot demandée avant signature.'
] as const;

export const REJECT_REASONS_PROMOTEUR = [
  'Offre trop éloignée du prix plancher fixé par la direction commerciale.',
  'Un autre acquéreur a versé l’acompte de réservation avant l’échéance de l’offre.',
  'Remise demandée supérieure à la marge autorisée sur ce lot.'
] as const;

export const WITHDRAW_REASONS_PROMOTEUR = [
  'L’acquéreur a obtenu un lot plus grand dans le même programme.',
  'Le financement bancaire n’a pas été accordé à l’acquéreur.',
  'L’acquéreur reporte son projet d’achat.'
] as const;

export const MANDATE_NOTES_PROMOTEUR = [
  'Mandat interne de commercialisation confié à l’équipe de vente du promoteur pour ce lot du programme.',
  'Mandat exclusif accordé au bureau de vente, avec campagne d’affichage et diffusion renforcée sur le site du programme.',
  'Lot proposé en priorité aux acquéreurs de la diaspora, présentations en ligne planifiées avec le relais en France.',
  'Mandat simple : le lot peut aussi être présenté par les apporteurs d’affaires partenaires.'
] as const;

export interface MilestoneDef {
  label: string;
  share: number;
  /** Avancement du chantier (en %) qui déclenche l’appel de fonds. */
  threshold: number;
}

export const MILESTONES: readonly MilestoneDef[] = [
  { label: 'Acompte à la réservation', share: 0.1, threshold: 0 },
  { label: 'Appel de fonds — fondations achevées', share: 0.15, threshold: 20 },
  { label: 'Appel de fonds — gros œuvre terminé', share: 0.25, threshold: 50 },
  { label: 'Appel de fonds — hors d’eau et hors d’air', share: 0.2, threshold: 70 },
  { label: 'Appel de fonds — cloisons, revêtements et équipements', share: 0.2, threshold: 90 },
  { label: 'Solde à la livraison et remise des clés', share: 0.1, threshold: 100 }
];

// ───────────────────────────────────────────────────────── maintenance (garantie)

export interface WarrantyTicket {
  category: 'PLUMBING' | 'ELECTRICITY' | 'AC' | 'OTHER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  title: string;
  description: string;
  location: string;
  resolution: string;
  managerReply: string;
  /** Spécialité du prestataire attendu. */
  specialty: string;
}

export const WARRANTY_TICKETS: readonly WarrantyTicket[] = [
  {
    category: 'OTHER',
    priority: 'MEDIUM',
    title: 'Fissures sur la cloison du salon',
    description:
      'Des fissures fines sont apparues sur la cloison du salon, près de la fenêtre, quelques mois après la livraison.',
    location: 'Salon',
    resolution: 'Reprise de l’enduit, pose d’une bande armée et peinture refaite sur la cloison.',
    managerReply:
      'Désordre pris en charge au titre de la garantie de parfait achèvement, un technicien passera cette semaine.',
    specialty: 'painting'
  },
  {
    category: 'OTHER',
    priority: 'HIGH',
    title: 'Infiltration d’eau au plafond de la chambre',
    description:
      'Après les dernières pluies, une tache d’humidité s’agrandit au plafond de la chambre principale (dernier étage).',
    location: 'Chambre principale',
    resolution: 'Étanchéité de la toiture-terrasse reprise sur la zone concernée et plafond remis en peinture.',
    managerReply: 'Visite de l’entreprise d’étanchéité programmée en urgence, nous prévenons le conducteur de travaux.',
    specialty: 'masonry'
  },
  {
    category: 'OTHER',
    priority: 'LOW',
    title: 'Fenêtre coulissante qui ferme mal',
    description: 'La baie coulissante du séjour accroche sur le rail et ne ferme plus complètement.',
    location: 'Séjour',
    resolution: 'Galets remplacés et rail nettoyé, réglage de la fermeture.',
    managerReply: 'Le menuisier aluminium passera lors de sa prochaine intervention sur la résidence.',
    specialty: 'carpentry'
  },
  {
    category: 'OTHER',
    priority: 'MEDIUM',
    title: 'Porte d’entrée qui frotte',
    description: 'La porte palière frotte au sol et la serrure ne se verrouille plus qu’avec effort.',
    location: 'Entrée',
    resolution: 'Porte rabotée et gâche réglée, serrure graissée.',
    managerReply: 'Pris en compte, intervention du menuisier sous huit jours.',
    specialty: 'carpentry'
  },
  {
    category: 'OTHER',
    priority: 'MEDIUM',
    title: 'Carrelage qui se décolle dans la cuisine',
    description: 'Trois carreaux se soulèvent devant l’évier et sonnent creux.',
    location: 'Cuisine',
    resolution: 'Carreaux déposés et reposés avec une colle adaptée, joints refaits.',
    managerReply: 'Le carreleur de l’entreprise de finition sera mandaté au titre de la garantie.',
    specialty: 'tiling'
  },
  {
    category: 'PLUMBING',
    priority: 'HIGH',
    title: 'Fuite sur l’alimentation du lavabo',
    description: 'Le flexible sous le lavabo de la salle de bain goutte en continu, le meuble est humide.',
    location: 'Salle de bain',
    resolution: 'Flexible et joint remplacés, aucune fuite constatée après mise en pression.',
    managerReply: 'Un plombier de la résidence passera demain matin, merci de laisser l’accès libre.',
    specialty: 'plumbing'
  },
  {
    category: 'PLUMBING',
    priority: 'MEDIUM',
    title: 'Pression d’eau faible au dernier étage',
    description: 'La pression est insuffisante aux heures de pointe, la douche coule à peine.',
    location: 'Salle de bain',
    resolution: 'Surpresseur de la résidence réglé et clapet anti-retour remplacé.',
    managerReply: 'Vérification du surpresseur planifiée avec le plombier du programme.',
    specialty: 'plumbing'
  },
  {
    category: 'PLUMBING',
    priority: 'LOW',
    title: 'Robinet de baignoire qui goutte',
    description: 'Le mitigeur de la baignoire goutte même fermé.',
    location: 'Salle de bain',
    resolution: 'Cartouche du mitigeur remplacée.',
    managerReply: 'Intervention programmée lors du prochain passage du plombier.',
    specialty: 'plumbing'
  },
  {
    category: 'PLUMBING',
    priority: 'MEDIUM',
    title: 'Évacuation de douche trop lente',
    description: 'L’eau stagne dans le receveur de douche après chaque utilisation.',
    location: 'Salle d’eau',
    resolution: 'Siphon débouché et colonne d’évacuation curée.',
    managerReply: 'Un technicien passe cette semaine pour déboucher la colonne.',
    specialty: 'plumbing'
  },
  {
    category: 'ELECTRICITY',
    priority: 'URGENT',
    title: 'Disjoncteur différentiel qui saute',
    description:
      'Le différentiel général saute plusieurs fois par jour dès que la climatisation et le four fonctionnent ensemble.',
    location: 'Tableau électrique',
    resolution: 'Disjoncteur différentiel remplacé et lignes resserrées au tableau.',
    managerReply: 'Intervention urgente planifiée ; ne rebranchez pas les gros appareils d’ici là.',
    specialty: 'electricity'
  },
  {
    category: 'ELECTRICITY',
    priority: 'LOW',
    title: 'Prise de courant sans tension',
    description: 'Deux prises de la chambre d’amis n’ont plus de courant.',
    location: 'Chambre d’amis',
    resolution: 'Connexion défectueuse reprise dans la boîte de dérivation.',
    managerReply: 'Pris en compte, l’électricien passera sous quinze jours.',
    specialty: 'electricity'
  },
  {
    category: 'ELECTRICITY',
    priority: 'MEDIUM',
    title: 'Interphone de la résidence en panne',
    description: 'L’interphone ne sonne plus dans l’appartement, les visiteurs ne peuvent pas être annoncés.',
    location: 'Entrée',
    resolution: 'Combiné remplacé et ligne vérifiée avec le gardien.',
    managerReply: 'Signalé à l’installateur de l’interphone, passage prévu cette semaine.',
    specialty: 'electricity'
  },
  {
    category: 'ELECTRICITY',
    priority: 'LOW',
    title: 'Éclairage de la cage d’escalier défaillant',
    description: 'Les minuteries du deuxième et du troisième palier ne s’allument plus.',
    location: 'Parties communes',
    resolution: 'Minuteries remplacées sur les deux paliers.',
    managerReply: 'Le syndic provisoire et l’électricien sont prévenus.',
    specialty: 'electricity'
  },
  {
    category: 'AC',
    priority: 'MEDIUM',
    title: 'Climatiseur split qui goutte',
    description: 'L’unité intérieure du salon laisse tomber de l’eau sur le sol.',
    location: 'Salon',
    resolution: 'Tuyau d’évacuation des condensats repositionné et nettoyé.',
    managerReply: 'Le frigoriste de la résidence passera lors de sa tournée.',
    specialty: 'ac'
  },
  {
    category: 'AC',
    priority: 'LOW',
    title: 'Unité extérieure de climatisation bruyante',
    description: 'L’unité extérieure vibre et fait du bruit la nuit.',
    location: 'Balcon',
    resolution: 'Supports antivibratiles remplacés et fixation resserrée.',
    managerReply: 'Passage du frigoriste programmé sous quinze jours.',
    specialty: 'ac'
  },
  {
    category: 'AC',
    priority: 'HIGH',
    title: 'Climatisation de la chambre qui ne refroidit plus',
    description: 'Le split de la chambre souffle de l’air tiède depuis quatre jours.',
    location: 'Chambre principale',
    resolution: 'Recharge en fluide frigorigène et recherche de fuite sur le raccord.',
    managerReply: 'Intervention du frigoriste demain, merci de confirmer votre présence.',
    specialty: 'ac'
  },
  {
    category: 'OTHER',
    priority: 'HIGH',
    title: 'Humidité qui remonte dans le séjour',
    description: 'Le bas du mur du séjour est humide et la peinture cloque.',
    location: 'Séjour',
    resolution: 'Drainage extérieur repris au pied du mur et enduit hydrofuge appliqué.',
    managerReply: 'Visite technique avec l’architecte prévue cette semaine.',
    specialty: 'masonry'
  },
  {
    category: 'OTHER',
    priority: 'LOW',
    title: 'Peinture qui cloque sur le balcon',
    description: 'La peinture du plafond du balcon cloque et s’écaille par plaques.',
    location: 'Balcon',
    resolution: 'Surface poncée et repeinte avec une peinture adaptée aux extérieurs.',
    managerReply: 'Intégré à la prochaine tournée du peintre de la résidence.',
    specialty: 'painting'
  }
];

export const TICKET_COMMENTS_TENANT = [
  'Merci, tout est rentré dans l’ordre.',
  'Le problème est résolu, merci pour la réactivité.',
  'Intervention correcte, je vous confirme la bonne remise en état.'
] as const;

export interface VendorDef {
  name: string;
  phone: string;
  email: string;
  address: string;
  specialties: string[];
}

export const VENDORS_PROMOTEUR: readonly VendorDef[] = [
  {
    name: 'Étanchéité et Toitures d’Abidjan',
    phone: '+225 07 12 34 50 01',
    email: 'chantier@etancheite-abidjan.example.ci',
    address: 'Zone industrielle de Yopougon — Abidjan',
    specialties: ['masonry', 'other']
  },
  {
    name: 'Menuiserie Aluminium Ivoire',
    phone: '+225 05 22 33 44 02',
    email: 'sav@alu-ivoire.example.ci',
    address: 'Koumassi Remblais — Abidjan',
    specialties: ['carpentry', 'other']
  },
  {
    name: 'Carrelage et Finitions du Golfe',
    phone: '+225 01 44 55 66 03',
    email: 'devis@finitions-golfe.example.ci',
    address: 'Marcory Zone 4 — Abidjan',
    specialties: ['tiling', 'painting']
  },
  {
    name: 'Plomberie Sanitaire Ivoire',
    phone: '+225 07 00 01 02 04',
    email: 'depannage@plomberie-ivoire.example.ci',
    address: 'Treichville — Abidjan',
    specialties: ['plumbing']
  },
  {
    name: 'Électro Bâtiment CI',
    phone: '+225 07 00 01 03 05',
    email: 'contact@electro-batiment.example.ci',
    address: 'Adjamé Liberté — Abidjan',
    specialties: ['electricity']
  },
  {
    name: 'Froid et Clim Bassam',
    phone: '+225 05 66 77 88 06',
    email: 'sav@froid-bassam.example.ci',
    address: 'Grand-Bassam — quartier Moossou',
    specialties: ['ac', 'refrigeration']
  },
  {
    name: 'Peinture et Rénovation Lagune',
    phone: '+225 07 99 88 77 07',
    email: 'devis@lagune-renov.example.ci',
    address: 'Port-Bouët — Abidjan',
    specialties: ['painting', 'other']
  },
  {
    name: 'Sécurité et Serrurerie du Plateau',
    phone: '+225 05 77 88 99 08',
    email: 'depannage@serrurerie-plateau.example.ci',
    address: 'Plateau — Abidjan',
    specialties: ['locksmith', 'other']
  }
];

export const PHONE_PREFIXES = ['01', '05', '07', '07', '05'] as const;
