/**
 * Données de référence du générateur d'historique SYNDIC (staging) :
 * définitions des copropriétés, noms ivoiriens, prestataires, postes de budget.
 *
 * Aucune dépendance Prisma : ces constantes se testent sans base.
 */
import type { HistoryProfile } from './types';

export type LotKind = 'APARTMENT' | 'PARKING' | 'COMMERCIAL' | 'OFFICE' | 'CELLAR';

export interface CoproDef {
  name: string;
  registrationNo: string;
  address: string;
  cadastralReference: string;
  floors: number;
  elevator: boolean;
  /** Nombre de lots par type, dans cet ordre. */
  mix: { apartments: number; parkings: number; commercial: number; offices: number; cellars: number };
  /** Budget de fonctionnement annuel de la première année, en XOF. */
  baseAnnualBudget: number;
  /** Jours après `start` du premier jour de l'AG ordinaire annuelle. */
  agDayOffset: number;
  /** Banque domiciliataire. */
  bank: string;
  /** Part du budget versée au fonds de travaux (0..1). */
  worksFundShare: number;
}

const FLAMBOYANTS: CoproDef = {
  name: 'Résidence Les Flamboyants',
  registrationNo: 'CI-ABJ-2019-01247',
  address: 'Cocody Riviera Palmeraie, rue des Flamboyants, Abidjan',
  cadastralReference: 'CCD-4471-LOT-12',
  floors: 3,
  elevator: false,
  mix: { apartments: 10, parkings: 2, commercial: 0, offices: 0, cellars: 0 },
  baseAnnualBudget: 7_200_000,
  agDayOffset: 40,
  bank: 'SIB',
  worksFundShare: 0.12
};

const JACARANDAS: CoproDef = {
  name: 'Résidence Les Jacarandas',
  registrationNo: 'CI-ABJ-2016-00832',
  address: 'Marcory Zone 4, boulevard de Marseille, Abidjan',
  cadastralReference: 'MRC-2208-LOT-30',
  floors: 6,
  elevator: true,
  mix: { apartments: 24, parkings: 4, commercial: 2, offices: 0, cellars: 0 },
  baseAnnualBudget: 21_600_000,
  agDayOffset: 52,
  bank: 'Société Générale CI',
  worksFundShare: 0.15
};

const PLATEAU_PRESTIGE: CoproDef = {
  name: 'Immeuble Plateau Prestige',
  registrationNo: 'CI-ABJ-2012-00196',
  address: 'Plateau, avenue Noguès, Abidjan',
  cadastralReference: 'PLT-0915-LOT-50',
  floors: 9,
  elevator: true,
  mix: { apartments: 36, parkings: 6, commercial: 4, offices: 2, cellars: 2 },
  baseAnnualBudget: 46_800_000,
  agDayOffset: 61,
  bank: 'NSIA Banque',
  worksFundShare: 0.18
};

export function coprosForProfile(profile: HistoryProfile): CoproDef[] {
  return profile === '6m' ? [FLAMBOYANTS] : [FLAMBOYANTS, JACARANDAS, PLATEAU_PRESTIGE];
}

export const LAST_NAMES = [
  'Kouassi',
  'Koné',
  'Traoré',
  'Coulibaly',
  "N'Guessan",
  'Yao',
  'Bamba',
  'Ouattara',
  'Diallo',
  'Konan',
  'Kouadio',
  'Soro',
  'Fofana',
  'Sangaré',
  'Touré',
  'Aka',
  'Brou',
  'Gnagne',
  'Tanoh',
  'Diomandé',
  'Zadi',
  'Doumbia',
  'Assi',
  'Boka',
  'Cissé'
];
export const FIRST_NAMES_M = [
  'Adama',
  'Mamadou',
  'Serge',
  'Jean-Marc',
  'Ibrahim',
  'Koffi',
  'Yves',
  'Franck',
  'Ousmane',
  'Désiré',
  'Hervé',
  'Moussa'
];
export const FIRST_NAMES_F = [
  'Aminata',
  'Fatoumata',
  'Aya',
  'Marie-Laure',
  'Nathalie',
  'Mariam',
  'Estelle',
  'Affoué',
  'Rokia',
  'Christelle',
  'Salimata',
  'Awa'
];

export const PROFESSIONS = [
  'Cadre bancaire',
  'Médecin',
  'Ingénieur',
  'Enseignant',
  'Commerçant',
  'Fonctionnaire',
  'Avocat',
  'Comptable',
  'Chef d’entreprise',
  'Pharmacien'
];

export const COMPANY_OWNERS = [
  { legalName: 'SCI Les Acacias', legalForm: 'SCI', rep: 'Mme Awa Doumbia' },
  { legalName: 'Ivoire Négoce SARL', legalForm: 'SARL', rep: 'M. Serge Brou' },
  { legalName: 'Cabinet Médical Saint-Jean', legalForm: 'SARL', rep: 'Dr Mariam Fofana' },
  { legalName: 'Boutique Mode Plateau', legalForm: 'SARL', rep: 'Mme Estelle Aka' }
];

export interface SupplierDef {
  key:
    | 'gardiennage'
    | 'nettoyage'
    | 'ascenseur'
    | 'electrogene'
    | 'assurance'
    | 'espaces_verts'
    | 'plomberie'
    | 'eau'
    | 'electricite';
  names: string[];
  specialty: string;
  nature: string;
  /** Compte de charge (plan comptable de copropriété). */
  account: string;
  /** Poids dans le budget annuel (somme ≈ 0,80, le reste = eau/électricité/honoraires). */
  weight: number;
  needsElevator?: boolean;
  /** Faux pour les abonnements (eau, électricité) : pas de contrat d’entretien. */
  contract: boolean;
  /** Rythme de facturation en mois. */
  everyMonths: 1 | 3;
}

export const SUPPLIERS: SupplierDef[] = [
  {
    key: 'gardiennage',
    names: ['Sécurité Ivoire Gardiennage', 'Alpha Sûreté CI', 'Bouclier Protection'],
    specialty: 'Gardiennage et sécurité',
    nature: 'Gardiennage de jour et de nuit',
    account: '6141',
    weight: 0.25,
    contract: true,
    everyMonths: 1
  },
  {
    key: 'nettoyage',
    names: ['Propreté Plus Abidjan', 'Net Services CI'],
    specialty: 'Nettoyage des parties communes',
    nature: 'Nettoyage des parties communes',
    account: '6142',
    weight: 0.16,
    contract: true,
    everyMonths: 1
  },
  {
    key: 'ascenseur',
    names: ['Ascenseurs Afrique de l’Ouest (AAO)'],
    specialty: 'Ascenseurs',
    nature: 'Entretien et maintenance de l’ascenseur',
    account: '6143',
    weight: 0.1,
    needsElevator: true,
    contract: true,
    everyMonths: 3
  },
  {
    key: 'electrogene',
    names: ['Énergie Services CI'],
    specialty: 'Groupe électrogène',
    nature: 'Maintenance du groupe électrogène',
    account: '6144',
    weight: 0.08,
    contract: true,
    everyMonths: 3
  },
  {
    key: 'espaces_verts',
    names: ['Vert Cocody Jardins'],
    specialty: 'Espaces verts',
    nature: 'Entretien des espaces verts',
    account: '6145',
    weight: 0.05,
    contract: true,
    everyMonths: 3
  },
  {
    key: 'assurance',
    names: ['NSIA Assurances', 'Sunu Assurances CI'],
    specialty: 'Assurance multirisque immeuble',
    nature: 'Police multirisque immeuble',
    account: '616',
    weight: 0.08,
    contract: true,
    everyMonths: 3
  },
  {
    key: 'plomberie',
    names: ['Plomberie Express Abidjan'],
    specialty: 'Plomberie et dépannage',
    nature: 'Entretien et petites réparations',
    account: '615',
    weight: 0.06,
    contract: true,
    everyMonths: 3
  },
  {
    key: 'eau',
    names: ['SODECI'],
    specialty: 'Distribution d’eau',
    nature: 'Eau des parties communes',
    account: '6011',
    weight: 0.05,
    contract: false,
    everyMonths: 3
  },
  {
    key: 'electricite',
    names: ['CIE — Compagnie Ivoirienne d’Électricité'],
    specialty: 'Distribution d’électricité',
    nature: 'Électricité des parties communes',
    account: '6012',
    weight: 0.08,
    contract: false,
    everyMonths: 3
  }
];

/** Poste de budget : libellé, compte et part du budget (hors fournisseurs sous contrat). */
export const FIXED_LINES = [
  { category: 'Administration', description: 'Honoraires du syndic', account: '621', weight: 0.07 }
] as const;

export const INCIDENT_POOL: {
  type: 'BREAKDOWN' | 'LEAK' | 'VANDALISM' | 'SAFETY' | 'OTHER';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  supplier: SupplierDef['key'];
}[] = [
  {
    type: 'LEAK',
    urgency: 'HIGH',
    description: 'Infiltration d’eau au plafond du hall, sous la terrasse.',
    supplier: 'plomberie'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'CRITICAL',
    description: 'Le groupe électrogène ne démarre plus lors des coupures de courant.',
    supplier: 'electrogene'
  },
  {
    type: 'SAFETY',
    urgency: 'MEDIUM',
    description: 'Portail de la cour qui ne se verrouille plus la nuit.',
    supplier: 'gardiennage'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'HIGH',
    description: 'Ascenseur bloqué entre deux étages, panne récurrente.',
    supplier: 'ascenseur'
  },
  {
    type: 'LEAK',
    urgency: 'MEDIUM',
    description: 'Fuite sur la colonne d’eau des étages, tache d’humidité dans la cage d’escalier.',
    supplier: 'plomberie'
  },
  {
    type: 'VANDALISM',
    urgency: 'LOW',
    description: 'Boîtes aux lettres forcées dans le hall d’entrée.',
    supplier: 'gardiennage'
  },
  {
    type: 'OTHER',
    urgency: 'LOW',
    description: 'Haie non taillée qui gêne l’accès aux places de parking.',
    supplier: 'espaces_verts'
  },
  {
    type: 'BREAKDOWN',
    urgency: 'MEDIUM',
    description: 'Éclairage des parties communes en panne au 2e étage.',
    supplier: 'electrogene'
  },
  {
    type: 'SAFETY',
    urgency: 'HIGH',
    description: 'Extincteurs périmés signalés lors de la visite de l’assureur.',
    supplier: 'assurance'
  },
  {
    type: 'OTHER',
    urgency: 'LOW',
    description: 'Odeurs persistantes dans le local à poubelles.',
    supplier: 'nettoyage'
  }
];

export const COMMON_ASSETS = [
  { name: 'Ascenseur', category: 'Équipement', needsElevator: true },
  { name: 'Groupe électrogène', category: 'Énergie', needsElevator: false },
  { name: 'Portail automatique', category: 'Accès', needsElevator: false },
  { name: 'Surpresseur et bâche à eau', category: 'Plomberie', needsElevator: false },
  { name: 'Système de vidéosurveillance', category: 'Sécurité', needsElevator: false }
];
