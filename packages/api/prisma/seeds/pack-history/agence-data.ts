/**
 * Données et gabarits du générateur d'historique du module AGENCE.
 *
 * Module PUR : aucun accès base, aucun effet de bord à l'import. Les valeurs
 * sont des chaînes littérales (les enums Prisma sont des unions de chaînes), ce
 * qui permet de tester les plans sans client Prisma généré.
 */
import type { HistoryProfile } from './types';
import { between, pick } from './types';

/** Volumes visés par profil. */
export interface AgenceVolumes {
  properties: number;
  /** Baux au total (actifs + terminés + résiliés, renouvellements compris). */
  leases: number;
  /** Baux terminés à leur échéance (3 ans seulement). */
  endedLeases: number;
  /** Parmi les terminés, ceux suivis d'un bail de renouvellement sur le même bien. */
  renewals: number;
  /** Baux résiliés avant terme. */
  terminatedLeases: number;
  owners: number;
  prospects: number;
  archived: number;
  /** Affaires ouvertes (nouveau, qualifié, visite, négociation). */
  openDeals: number;
  lostDeals: number;
  /** Visites hors affaires gagnées (prospects), passées ou à venir. */
  extraVisits: number;
  tickets: number;
  vendors: number;
  /** Nombre de mois clos pour lesquels on génère un relevé propriétaire. */
  statementMonths: number;
}

export const AGENCE_VOLUMES: Record<HistoryProfile, AgenceVolumes> = {
  '6m': {
    properties: 12,
    leases: 8,
    endedLeases: 0,
    renewals: 0,
    terminatedLeases: 0,
    owners: 3,
    prospects: 4,
    archived: 0,
    openDeals: 4,
    lostDeals: 1,
    extraVisits: 3,
    tickets: 6,
    vendors: 4,
    statementMonths: 5
  },
  '3y': {
    properties: 60,
    leases: 40,
    endedLeases: 8,
    renewals: 5,
    terminatedLeases: 3,
    owners: 12,
    prospects: 60,
    archived: 12,
    openDeals: 12,
    lostDeals: 10,
    extraVisits: 20,
    tickets: 45,
    vendors: 8,
    statementMonths: 12
  }
};

// ─────────────────────────────────────────────────────────── identités

export const FIRST_NAMES = [
  'Kouadio',
  'Kouassi',
  'Koffi',
  'Yao',
  'Konan',
  'Aya',
  'Akissi',
  'Affoué',
  'Amenan',
  'Adjoua',
  'Aminata',
  'Fatoumata',
  'Mariam',
  'Salimata',
  'Awa',
  'Nadège',
  'Estelle',
  'Prisca',
  'Carine',
  'Sandrine',
  'Mamadou',
  'Seydou',
  'Ibrahim',
  'Moussa',
  'Souleymane',
  'Bakary',
  'Lassina',
  'Yacouba',
  'Hervé',
  'Landry',
  'Rodrigue',
  'Serge',
  'Olivier',
  'Patrick',
  'Éric',
  'Jean-Marc',
  'Aboubacar',
  'Drissa',
  'Kader',
  'Fabrice'
] as const;

export const LAST_NAMES = [
  'Kouassi',
  'Koné',
  'Traoré',
  'Ouattara',
  'Coulibaly',
  'Diabaté',
  'Bamba',
  'Yao',
  "N'Guessan",
  'Kouadio',
  'Konan',
  'Soro',
  'Touré',
  'Cissé',
  'Sylla',
  'Fofana',
  'Diomandé',
  'Gnahoré',
  'Dago',
  'Zoro',
  'Séri',
  'Gogoua',
  'Kacou',
  'Digbeu',
  'Loukou',
  'Tapé',
  'Amani',
  'Silué',
  'Ehouman',
  'Brou',
  'Aké',
  'Boni'
] as const;

export const COMPANY_NAMES = [
  'Ivoire Logistique',
  'Sahel Négoce',
  'Lagune Services',
  'Atlantique Distribution',
  'Cacao Export CI',
  'Baobab Conseil',
  'Abidjan Digital',
  'Eburnie Matériaux',
  'Comoé Pharma',
  'Plateau Assurances'
] as const;

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16);
}

/** Numéro ivoirien à dix chiffres, au format affiché « +225 07 12 34 56 78 ». */
export function ivorianPhone(rng: () => number): string {
  const prefix = pick(rng, ['01', '05', '07', '07', '05']);
  const pairs = Array.from({ length: 4 }, () => String(between(rng, 0, 99)).padStart(2, '0'));
  return `+225 ${prefix} ${pairs.join(' ')}`;
}

export interface PersonSpec {
  firstName: string;
  lastName: string;
}

export function randomPerson(rng: () => number): PersonSpec {
  return { firstName: pick(rng, FIRST_NAMES), lastName: pick(rng, LAST_NAMES) };
}

// ─────────────────────────────────────────────────────────────── zones

export interface ZoneSpec {
  name: string;
  lat: number;
  lng: number;
}

export const ZONES: readonly ZoneSpec[] = [
  { name: 'Cocody Riviera', lat: 5.3552, lng: -3.9861 },
  { name: 'Cocody Angré', lat: 5.3989, lng: -3.9882 },
  { name: 'Marcory Zone 4', lat: 5.2851, lng: -3.9724 },
  { name: 'Plateau', lat: 5.3215, lng: -4.0178 },
  { name: 'Yopougon Siporex', lat: 5.3412, lng: -4.0891 },
  { name: 'Treichville', lat: 5.2998, lng: -4.0108 },
  { name: 'Koumassi', lat: 5.2976, lng: -3.9463 },
  { name: 'Abobo', lat: 5.4231, lng: -4.0218 },
  { name: 'Bingerville', lat: 5.3546, lng: -3.9064 },
  { name: 'Port-Bouët', lat: 5.2563, lng: -3.9262 },
  { name: 'Adjamé Liberté', lat: 5.3562, lng: -4.0289 },
  { name: 'Deux-Plateaux', lat: 5.3704, lng: -4.0006 }
];

export const STREETS = [
  'Rue des Jardins',
  'Boulevard Latrille',
  'Rue du Canal',
  'Avenue Chardy',
  'Rue des Palmiers',
  'Boulevard de Marseille',
  'Rue des Hibiscus',
  'Avenue Franchet d’Esperey',
  'Rue Lepic',
  'Boulevard Valéry Giscard d’Estaing'
] as const;

export const RESIDENCES = [
  'Résidence Les Palmiers',
  'Résidence Soleil',
  'Résidence Les Flamboyants',
  'Immeuble Atlantique',
  'Résidence Le Baobab',
  'Résidence Les Orchidées',
  'Immeuble Horizon',
  'Résidence Perle Lagunaire'
] as const;

// ─────────────────────────────────────────────────────────────── biens

export type PropertyTypeName =
  | 'APPARTEMENT'
  | 'STUDIO'
  | 'MAISON_VILLA'
  | 'DUPLEX_TRIPLEX'
  | 'BUREAU'
  | 'BOUTIQUE_COMMERCIAL'
  | 'ENTREPOT_INDUSTRIEL'
  | 'PARKING_BOX'
  | 'IMMEUBLE'
  | 'TERRAIN';

export interface PropertyGabarit {
  type: PropertyTypeName;
  label: string;
  /** Loyer mensuel hors charges, XOF. */
  rent: readonly [number, number];
  /** Prix de vente, XOF. */
  price: readonly [number, number];
  surface: readonly [number, number];
  /** Pièces (null : sans objet). */
  rooms: readonly [number, number] | null;
  /** Se loue (sinon : vente seulement). */
  leasable: boolean;
  /** Local professionnel : facturation parfois trimestrielle, locataire société. */
  commercial: boolean;
}

export const GABARITS: Record<PropertyTypeName, PropertyGabarit> = {
  APPARTEMENT: {
    type: 'APPARTEMENT',
    label: 'Appartement',
    rent: [90_000, 260_000],
    price: [28_000_000, 85_000_000],
    surface: [55, 130],
    rooms: [2, 5],
    leasable: true,
    commercial: false
  },
  STUDIO: {
    type: 'STUDIO',
    label: 'Studio meublé',
    rent: [60_000, 110_000],
    price: [14_000_000, 32_000_000],
    surface: [22, 40],
    rooms: [1, 1],
    leasable: true,
    commercial: false
  },
  MAISON_VILLA: {
    type: 'MAISON_VILLA',
    label: 'Villa',
    rent: [350_000, 900_000],
    price: [90_000_000, 250_000_000],
    surface: [180, 420],
    rooms: [4, 7],
    leasable: true,
    commercial: false
  },
  DUPLEX_TRIPLEX: {
    type: 'DUPLEX_TRIPLEX',
    label: 'Duplex',
    rent: [450_000, 1_100_000],
    price: [75_000_000, 180_000_000],
    surface: [140, 260],
    rooms: [4, 6],
    leasable: true,
    commercial: false
  },
  BUREAU: {
    type: 'BUREAU',
    label: 'Plateau de bureaux',
    rent: [450_000, 1_800_000],
    price: [60_000_000, 190_000_000],
    surface: [80, 300],
    rooms: [3, 10],
    leasable: true,
    commercial: true
  },
  BOUTIQUE_COMMERCIAL: {
    type: 'BOUTIQUE_COMMERCIAL',
    label: 'Boutique',
    rent: [180_000, 600_000],
    price: [30_000_000, 95_000_000],
    surface: [30, 120],
    rooms: [1, 3],
    leasable: true,
    commercial: true
  },
  ENTREPOT_INDUSTRIEL: {
    type: 'ENTREPOT_INDUSTRIEL',
    label: 'Entrepôt',
    rent: [900_000, 3_000_000],
    price: [120_000_000, 400_000_000],
    surface: [400, 1500],
    rooms: null,
    leasable: true,
    commercial: true
  },
  PARKING_BOX: {
    type: 'PARKING_BOX',
    label: 'Place de parking couverte',
    rent: [25_000, 55_000],
    price: [4_000_000, 9_000_000],
    surface: [12, 20],
    rooms: null,
    leasable: true,
    commercial: false
  },
  IMMEUBLE: {
    type: 'IMMEUBLE',
    label: 'Immeuble R+3',
    rent: [0, 0],
    price: [320_000_000, 900_000_000],
    surface: [600, 1400],
    rooms: null,
    leasable: false,
    commercial: false
  },
  TERRAIN: {
    type: 'TERRAIN',
    label: 'Terrain nu',
    rent: [0, 0],
    price: [18_000_000, 120_000_000],
    surface: [300, 1200],
    rooms: null,
    leasable: false,
    commercial: false
  }
};

/**
 * Cycle des types, du plus courant au plus rare. Le bien i prend le type
 * `TYPE_CYCLE[i % 20]` : sur douze biens on obtient surtout des logements, un
 * bureau, une boutique et un terrain ; sur soixante, tout l'éventail.
 */
export const TYPE_CYCLE: readonly PropertyTypeName[] = [
  'APPARTEMENT',
  'APPARTEMENT',
  'STUDIO',
  'BOUTIQUE_COMMERCIAL',
  'APPARTEMENT',
  'MAISON_VILLA',
  'BUREAU',
  'APPARTEMENT',
  'STUDIO',
  'TERRAIN',
  'APPARTEMENT',
  'DUPLEX_TRIPLEX',
  'BOUTIQUE_COMMERCIAL',
  'APPARTEMENT',
  'IMMEUBLE',
  'BUREAU',
  'PARKING_BOX',
  'MAISON_VILLA',
  'ENTREPOT_INDUSTRIEL',
  'APPARTEMENT'
];

export interface PropertyPlan {
  index: number;
  type: PropertyTypeName;
  title: string;
  description: string;
  zone: ZoneSpec;
  address: string;
  latitude: number;
  longitude: number;
  /** Loyer mensuel hors charges (0 si le bien ne se loue pas). */
  rent: number;
  charges: number;
  price: number;
  surface: number;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  leasable: boolean;
  commercial: boolean;
  /** Proposé aussi à la vente. */
  forSale: boolean;
  /** Indice du propriétaire (dans la liste des propriétaires). */
  ownerIndex: number;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function planProperties(rng: () => number, count: number, ownerCount: number): PropertyPlan[] {
  const plans: PropertyPlan[] = [];
  for (let i = 0; i < count; i++) {
    const g = GABARITS[TYPE_CYCLE[i % TYPE_CYCLE.length]];
    const zone = ZONES[(i * 5 + between(rng, 0, 3)) % ZONES.length];
    const rooms = g.rooms ? between(rng, g.rooms[0], g.rooms[1]) : null;
    const surface = between(rng, g.surface[0], g.surface[1]);
    const rent = g.leasable ? roundTo(between(rng, g.rent[0], g.rent[1]), 5_000) : 0;
    const price = roundTo(between(rng, g.price[0], g.price[1]), 500_000);
    const detail = rooms && g.type !== 'STUDIO' && g.type !== 'BOUTIQUE_COMMERCIAL' ? ` ${rooms} pièces` : '';
    const residence = pick(rng, RESIDENCES);
    const isHousing = ['APPARTEMENT', 'DUPLEX_TRIPLEX', 'STUDIO'].includes(g.type);
    plans.push({
      index: i,
      type: g.type,
      title: `${g.label}${detail} — ${zone.name}`,
      description:
        `${g.label}${detail} de ${surface} m² situé à ${zone.name}, Abidjan.` +
        (isHousing ? ` ${residence}, gardiennage et accès sécurisé.` : '') +
        (g.commercial ? ' Emplacement fréquenté, accès facile.' : ''),
      zone,
      address: `${between(rng, 1, 120)} ${pick(rng, STREETS)}, ${zone.name}, Abidjan`,
      latitude: Number((zone.lat + (rng() - 0.5) * 0.01).toFixed(6)),
      longitude: Number((zone.lng + (rng() - 0.5) * 0.01).toFixed(6)),
      rent,
      charges: g.leasable ? roundTo(rent * (0.06 + rng() * 0.06), 1_000) : 0,
      price,
      surface,
      rooms,
      bedrooms: rooms && g.type !== 'BUREAU' && g.type !== 'BOUTIQUE_COMMERCIAL' ? Math.max(rooms - 1, 0) : null,
      bathrooms: isHousing || g.type === 'MAISON_VILLA' ? Math.max(1, Math.floor((rooms ?? 2) / 2)) : null,
      leasable: g.leasable,
      commercial: g.commercial,
      forSale: !g.leasable || rng() < 0.15,
      ownerIndex: i % Math.max(ownerCount, 1)
    });
  }
  return plans;
}

// ───────────────────────────────────────────────────────── maintenance

export const VENDOR_POOL = [
  {
    name: 'Plomberie Express CI',
    phone: '+225 07 08 11 22 33',
    email: 'contact@plomberie-express.example.ci',
    address: 'Zone 4, Marcory — Abidjan',
    specialties: ['plumbing', 'water_heater']
  },
  {
    name: 'Ivoire Électricité Services',
    phone: '+225 05 06 44 55 66',
    email: 'depannage@ivoire-elec.example.ci',
    address: 'Adjamé Liberté — Abidjan',
    specialties: ['electricity', 'generator']
  },
  {
    name: 'Froid & Clim Abidjan',
    phone: '+225 01 02 77 88 99',
    email: 'sav@froid-clim.example.ci',
    address: 'Treichville — Abidjan',
    specialties: ['ac', 'refrigeration']
  },
  {
    name: 'Multiservices Bâti Plus',
    phone: '+225 07 55 66 77 88',
    email: 'chantier@bati-plus.example.ci',
    address: 'Yopougon Siporex — Abidjan',
    specialties: ['other', 'painting', 'masonry']
  },
  {
    name: 'Aqua Services Cocody',
    phone: '+225 05 11 22 33 44',
    email: 'urgence@aqua-cocody.example.ci',
    address: 'Cocody Angré — Abidjan',
    specialties: ['plumbing']
  },
  {
    name: 'Électro Confort Koumassi',
    phone: '+225 01 44 55 66 77',
    email: 'contact@electro-confort.example.ci',
    address: 'Koumassi — Abidjan',
    specialties: ['electricity', 'ac']
  },
  {
    name: 'Peinture & Rénovation Lagune',
    phone: '+225 07 99 88 77 66',
    email: 'devis@lagune-renov.example.ci',
    address: 'Port-Bouët — Abidjan',
    specialties: ['painting', 'other']
  },
  {
    name: 'Sécurité Serrures Plateau',
    phone: '+225 05 77 88 99 00',
    email: 'depannage@serrures-plateau.example.ci',
    address: 'Plateau — Abidjan',
    specialties: ['locksmith', 'other']
  }
] as const;

export type TicketCategoryName = 'PLUMBING' | 'ELECTRICITY' | 'AC' | 'OTHER';

export interface TicketTemplate {
  category: TicketCategoryName;
  title: string;
  description: string;
  location: string;
  resolution: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  managerReply: string;
}

export const TICKET_TEMPLATES: readonly TicketTemplate[] = [
  {
    category: 'PLUMBING',
    title: 'Fuite sous l’évier de la cuisine',
    description: 'De l’eau coule sous l’évier depuis hier soir, le meuble est mouillé.',
    location: 'Cuisine',
    resolution: 'Siphon et joint remplacés, aucune fuite constatée après essai.',
    priority: 'HIGH',
    managerReply: 'Nous envoyons un plombier demain matin, merci de laisser l’accès libre.'
  },
  {
    category: 'PLUMBING',
    title: 'Chasse d’eau qui fuit en continu',
    description: 'La chasse d’eau coule sans arrêt, la facture d’eau va augmenter.',
    location: 'Toilettes',
    resolution: 'Mécanisme de chasse changé.',
    priority: 'MEDIUM',
    managerReply: 'Pris en compte, un technicien passera dans la semaine.'
  },
  {
    category: 'PLUMBING',
    title: 'Chauffe-eau en panne',
    description: 'Plus d’eau chaude depuis trois jours, le disjoncteur du chauffe-eau saute.',
    location: 'Salle de bain',
    resolution: 'Résistance du chauffe-eau remplacée.',
    priority: 'MEDIUM',
    managerReply: 'Nous demandons un devis au prestataire et revenons vers vous.'
  },
  {
    category: 'ELECTRICITY',
    title: 'Coupures de courant répétées',
    description: 'Le disjoncteur général saute plusieurs fois par jour quand la climatisation tourne.',
    location: 'Tableau électrique',
    resolution: 'Disjoncteur différentiel remplacé et lignes resserrées.',
    priority: 'URGENT',
    managerReply: 'Intervention urgente planifiée, ne rebranchez pas les gros appareils d’ici là.'
  },
  {
    category: 'ELECTRICITY',
    title: 'Prise murale qui ne fonctionne plus',
    description: 'Deux prises du salon n’ont plus de courant.',
    location: 'Salon',
    resolution: 'Prises et câblage de la ligne remplacés.',
    priority: 'LOW',
    managerReply: 'Un électricien passera cette semaine.'
  },
  {
    category: 'ELECTRICITY',
    title: 'Éclairage du couloir défaillant',
    description: 'Les lampes du couloir clignotent puis s’éteignent.',
    location: 'Couloir',
    resolution: 'Interrupteur et douilles changés.',
    priority: 'LOW',
    managerReply: 'Noté, passage prévu.'
  },
  {
    category: 'AC',
    title: 'Climatiseur qui ne refroidit plus',
    description: 'Le split de la chambre souffle de l’air tiède depuis une semaine.',
    location: 'Chambre principale',
    resolution: 'Recharge de gaz et nettoyage de l’unité intérieure.',
    priority: 'MEDIUM',
    managerReply: 'Le technicien froid passe jeudi.'
  },
  {
    category: 'AC',
    title: 'Climatiseur bruyant et qui goutte',
    description: 'L’unité fait un bruit de vibration et laisse couler de l’eau sur le mur.',
    location: 'Salon',
    resolution: 'Évacuation des condensats débouchée, support de l’unité refixé.',
    priority: 'LOW',
    managerReply: 'Merci pour le signalement, intervention programmée.'
  },
  {
    category: 'OTHER',
    title: 'Serrure de la porte d’entrée bloquée',
    description: 'La clé tourne dans le vide, je crains de rester dehors.',
    location: 'Porte d’entrée',
    resolution: 'Serrure remplacée, deux clés remises au locataire.',
    priority: 'HIGH',
    managerReply: 'Un serrurier est envoyé aujourd’hui.'
  },
  {
    category: 'OTHER',
    title: 'Infiltration d’eau au plafond',
    description: 'Une tache d’humidité grandit au plafond de la chambre après les pluies.',
    location: 'Chambre',
    resolution: 'Étanchéité de la terrasse reprise, plafond repeint.',
    priority: 'HIGH',
    managerReply: 'Nous faisons constater l’origine par un artisan.'
  },
  {
    category: 'OTHER',
    title: 'Peinture écaillée dans l’entrée',
    description: 'La peinture se détache par plaques dans l’entrée.',
    location: 'Entrée',
    resolution: 'Murs poncés et repeints.',
    priority: 'LOW',
    managerReply: 'À planifier avec le peintre de l’agence.'
  },
  {
    category: 'OTHER',
    title: 'Portail coulissant qui se bloque',
    description: 'Le portail ne s’ouvre plus qu’à moitié.',
    location: 'Cour',
    resolution: 'Rail nettoyé et galets remplacés.',
    priority: 'MEDIUM',
    managerReply: 'Prestataire contacté.'
  }
];

/** Activités types d’une affaire (objet, contenu), selon le type. */
export const DEAL_TRACES: Record<
  'LOCATION' | 'ACHAT' | 'VENTE' | 'GESTION',
  readonly { subject: string; content: string }[]
> = {
  LOCATION: [
    {
      subject: 'Première prise de contact',
      content: 'Recherche d’un bien à louer, budget et quartier précisés au téléphone.'
    },
    { subject: 'Biens proposés', content: 'Sélection de biens envoyée par WhatsApp avec photos et loyers.' },
    { subject: 'Visite organisée', content: 'Visite fixée avec le client, confirmation la veille.' },
    { subject: 'Constitution du dossier', content: 'Pièces d’identité, justificatifs de revenus et caution demandés.' }
  ],
  ACHAT: [
    { subject: 'Demande d’achat', content: 'Le client souhaite acquérir, financement en cours de montage.' },
    { subject: 'Propositions de biens', content: 'Trois biens correspondant au budget présentés.' },
    { subject: 'Visite et retour client', content: 'Retour positif sur le deuxième bien, offre à discuter.' },
    { subject: 'Négociation', content: 'Contre-proposition transmise au propriétaire.' }
  ],
  VENTE: [
    { subject: 'Estimation du bien', content: 'Visite d’estimation et avis de valeur remis au propriétaire.' },
    { subject: 'Signature du mandat', content: 'Mandat de vente discuté, durée et honoraires validés.' },
    { subject: 'Diffusion', content: 'Annonce publiée, premières demandes reçues.' }
  ],
  GESTION: [
    {
      subject: 'Rendez-vous propriétaire',
      content: 'Présentation des services de gestion locative et des honoraires.'
    },
    { subject: 'Mandat de gestion', content: 'Mandat de gestion signé, remise des clés et des documents du bien.' },
    { subject: 'Premier relevé', content: 'Explication du relevé mensuel et des reversements.' }
  ]
};

export const LOST_REASONS = [
  'Budget insuffisant',
  'Zone non disponible',
  'Le client a trouvé ailleurs',
  'Dossier incomplet',
  'Propriétaire non disponible'
] as const;
