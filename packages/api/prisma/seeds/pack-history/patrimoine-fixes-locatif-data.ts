/**
 * PATRIMOINE (correctifs) : scénarios locatifs. Chaque « histoire » est un bail avec son
 * locataire, ses loyers, ses retards et ses impayés ; `patrimoine-fixes-locatif.ts` les écrit.
 *
 * Décalages en mois AVANT maintenant (`end`) : 0 = mois en cours, 1 = mois dernier, -1 = mois
 * prochain. Le jour d'échéance varie pour que des échéances soient réellement « à échoir ».
 */

export type StoryStatus = 'ACTIVE' | 'ENDED' | 'SUSPENDED' | 'DRAFT' | 'CANCELED';

export interface LeaseStory {
  /** Numéro de bail : PAT-BAIL-1NN (stable : clé d'idempotence). */
  no: number;
  /** Référence du bien (sans le préfixe PAT-). */
  prop: string;
  renter: string;
  /** Logement ou local loué dans un immeuble. */
  unit?: string;
  status: StoryStatus;
  /** Premier mois facturé (mois avant maintenant). */
  start: number;
  /** Dernier mois facturé ; null = bail en cours. */
  last: number | null;
  /** Loyer initial. */
  rent: number;
  dueDay: number;
  /** Révisions : à partir de ce décalage de mois (inclus), le loyer devient `rent`. */
  revisions?: Array<{ from: number; rent: number }>;
  /** Mois laissés impayés / payés partiellement / réglés en retard (décalages). */
  unpaid?: number[];
  partial?: number[];
  late?: number[];
  commercial?: boolean;
  /** Bail signé mais pas encore commencé (brouillon) : mois avant le début, négatif. */
  note?: string;
}

/** Agence Pro : les quinze biens ajoutés, plus quelques lots d'immeuble. */
export const PRO_STORIES: readonly LeaseStory[] = [
  {
    no: 1,
    prop: 'APP-RIV3',
    renter: 'Cédric Amani',
    status: 'ACTIVE',
    start: 30,
    last: null,
    rent: 480_000,
    dueDay: 5,
    revisions: [
      { from: 18, rent: 520_000 },
      { from: 6, rent: 560_000 }
    ],
    unpaid: [0],
    late: [9]
  },
  {
    no: 2,
    prop: 'APP-ZONE4',
    renter: 'Nadège Kassi',
    status: 'ACTIVE',
    start: 24,
    last: null,
    rent: 320_000,
    dueDay: 10,
    revisions: [{ from: 12, rent: 345_000 }],
    late: [5, 3]
  },
  {
    no: 3,
    prop: 'STU-BIETRY',
    renter: 'Habib Diomandé',
    status: 'ACTIVE',
    start: 14,
    last: null,
    rent: 150_000,
    dueDay: 1,
    unpaid: [1, 0]
  },
  {
    no: 4,
    prop: 'VIL-ANGRE',
    renter: 'Famille Zoungrana',
    status: 'ACTIVE',
    start: 36,
    last: null,
    rent: 1_150_000,
    dueDay: 5,
    revisions: [{ from: 12, rent: 1_250_000 }],
    partial: [2]
  },
  {
    no: 5,
    prop: 'BOU-DANGA',
    renter: 'Boutique Chez Marie',
    status: 'ACTIVE',
    start: 20,
    last: null,
    rent: 400_000,
    dueDay: 5,
    commercial: true,
    unpaid: [4, 3]
  },
  {
    no: 6,
    prop: 'BUR-MARCORY',
    renter: 'Cabinet Delta Conseil',
    status: 'ENDED',
    start: 36,
    last: 9,
    rent: 800_000,
    dueDay: 5,
    commercial: true
  },
  {
    no: 7,
    prop: 'BUR-MARCORY',
    renter: 'Orion Logistics SARL',
    status: 'ACTIVE',
    start: 6,
    last: null,
    rent: 870_000,
    dueDay: 15,
    commercial: true
  },
  { no: 8, prop: 'APP-BASSAM', renter: 'Paul Mensah', status: 'ENDED', start: 36, last: 4, rent: 330_000, dueDay: 5 },
  { no: 9, prop: 'VIL-BASSAM', renter: 'Ronald Ehui', status: 'ENDED', start: 36, last: 14, rent: 900_000, dueDay: 5 },
  {
    no: 10,
    prop: 'IMM-ABOBO',
    unit: 'Appartement 1',
    renter: 'Rokia Sylla',
    status: 'ACTIVE',
    start: 28,
    last: null,
    rent: 160_000,
    dueDay: 5
  },
  {
    no: 11,
    prop: 'IMM-ABOBO',
    unit: 'Appartement 2',
    renter: 'Gilbert Atta',
    status: 'ACTIVE',
    start: 12,
    last: null,
    rent: 175_000,
    dueDay: 10,
    unpaid: [3]
  },
  {
    no: 12,
    prop: 'IMM-ABOBO',
    unit: 'Appartement 3',
    renter: 'Ama Kouamé',
    status: 'SUSPENDED',
    start: 16,
    last: 2,
    rent: 165_000,
    dueDay: 5,
    unpaid: [2]
  },
  {
    no: 13,
    prop: 'IMM-ABOBO',
    unit: 'Local commercial du rez-de-chaussée',
    renter: 'Boulangerie Le Fournil',
    status: 'ACTIVE',
    start: 24,
    last: null,
    rent: 300_000,
    dueDay: 25,
    commercial: true
  },
  {
    no: 14,
    prop: 'APP-PLATEAU',
    renter: 'Famille Duval',
    status: 'ENDED',
    start: 30,
    last: 3,
    rent: 650_000,
    dueDay: 5
  },
  {
    no: 15,
    prop: 'APP-PLATEAU',
    renter: 'Claire Boyer',
    status: 'DRAFT',
    start: -1,
    last: null,
    rent: 700_000,
    dueDay: 5
  },
  {
    no: 16,
    prop: 'ENT-YOP',
    renter: 'Ivoire Packaging SA',
    status: 'SUSPENDED',
    start: 20,
    last: 1,
    rent: 700_000,
    dueDay: 5,
    commercial: true,
    unpaid: [1]
  },
  {
    no: 17,
    prop: 'MAI-SONGON',
    renter: 'Jean-Baptiste Tano',
    status: 'ENDED',
    start: 36,
    last: 5,
    rent: 250_000,
    dueDay: 5
  },
  {
    no: 18,
    prop: 'DUP-2PLAT',
    renter: 'Éliane Bocoum',
    status: 'CANCELED',
    start: 3,
    last: null,
    rent: 750_000,
    dueDay: 5
  }
];

/** Agence Essentiel : plafonnée à dix biens, tout se joue dans les lots de l'immeuble de Yopougon. */
export const ESS_STORIES: readonly LeaseStory[] = [
  {
    no: 1,
    prop: 'IMM-YOP',
    unit: 'Appartement 1A',
    renter: 'Awa Sanogo',
    status: 'ACTIVE',
    start: 14,
    last: null,
    rent: 260_000,
    dueDay: 5,
    unpaid: [2, 1, 0]
  },
  {
    no: 2,
    prop: 'IMM-YOP',
    unit: 'Studio 2B',
    renter: 'Moussa Fofana',
    status: 'ENDED',
    start: 22,
    last: 6,
    rent: 190_000,
    dueDay: 10,
    unpaid: [8, 7, 6]
  },
  {
    no: 3,
    prop: 'IMM-YOP',
    unit: 'Appartement 3C',
    renter: 'Clarisse Aka',
    status: 'ACTIVE',
    start: 9,
    last: null,
    rent: 320_000,
    dueDay: 10,
    partial: [1]
  },
  {
    no: 4,
    prop: 'IMM-YOP',
    unit: 'Studio 1D',
    renter: 'Ibrahim Touré',
    status: 'ACTIVE',
    start: 6,
    last: null,
    rent: 150_000,
    dueDay: 15,
    revisions: [{ from: 2, rent: 165_000 }]
  },
  {
    no: 5,
    prop: 'IMM-YOP',
    unit: 'Appartement 2A',
    renter: 'Léa Bamba',
    status: 'SUSPENDED',
    start: 18,
    last: 3,
    rent: 280_000,
    dueDay: 5,
    unpaid: [3]
  },
  {
    no: 6,
    prop: 'IMM-YOP',
    unit: 'Studio 2B',
    renter: 'Salimata Cissé',
    status: 'DRAFT',
    start: -1,
    last: null,
    rent: 125_000,
    dueDay: 10
  },
  {
    no: 7,
    prop: 'IMM-YOP',
    unit: 'Appartement 3A',
    renter: 'Kader Soro',
    status: 'CANCELED',
    start: 5,
    last: null,
    rent: 195_000,
    dueDay: 5
  },
  {
    no: 8,
    prop: 'TER-BASSAM',
    unit: 'Base-vie de chantier',
    renter: 'SOGEA Travaux Publics CI',
    status: 'ENDED',
    start: 11,
    last: 3,
    rent: 650_000,
    dueDay: 5,
    commercial: true,
    late: [8]
  }
];
