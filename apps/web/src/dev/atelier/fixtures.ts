import type { Property } from '../../types/property-types';

/**
 * Données simulées de l'atelier (REFONTE_UI_UX.md §10.1, bloc « États »).
 *
 * Elles ne cherchent pas à être réalistes en moyenne, mais à être **pénibles** :
 * un titre trop long pour sa carte, un bien sans photo, un montant à sept
 * chiffres, un immeuble sans prix, une adresse vide. Un jeu de données sage ne
 * révèle aucun défaut de mise en page — c'est précisément ce qui rend les
 * captures d'écran de démonstration trompeuses.
 */

/**
 * Les valeurs sont ecrites en litteraux plutot qu en enumerations : ce fichier
 * decrit des donnees, pas du comportement, et le cast final dit assez que ce
 * n est pas de la donnee de production.
 */
function bien(id: string, overrides: Partial<Record<keyof Property, unknown>> = {}): Property {
  return {
    id,
    internalReference: `BIEN-2026-${id.padStart(4, '0')}`,
    propertyType: 'APPARTEMENT',
    ownershipType: 'TENANT',
    tenantId: 'agence-demo',
    title: `Bien ${id}`,
    description: '',
    address: 'Kipé, Ratoma',
    locationZone: 'Conakry',
    transactionModes: ['RENTAL'],
    price: 1_250_000,
    currency: 'GNF',
    surfaceArea: 85,
    rooms: 3,
    bedrooms: 2,
    status: 'AVAILABLE',
    isPublished: false,
    availability: 'AVAILABLE',
    createdAt: '2026-01-12T08:00:00.000Z',
    updatedAt: '2026-02-02T08:00:00.000Z',
    ...overrides
  } as Property;
}

export const BIENS: Property[] = [
  bien('1', {
    // Description telle que l'import l'écrit : la phrase finale nomme le vrai
    // propriétaire et porte un UUID, que la fiche ne doit pas afficher brut.
    description: [
      'Villa de standing sur 320 m², piscine, dépendance de deux pièces et jardin clos.',
      '',
      'Propriétaire : Arsène Djédjé (contact CRM 2fb9a016-ec59-4296-aa6a-bfb1398037c1).'
    ].join('\n'),
    title: 'Villa 4 chambres avec piscine et dépendance, quartier résidentiel de Kipé Centre',
    propertyType: 'MAISON_VILLA',
    price: 12_500_000,
    surfaceArea: 320,
    rooms: 7,
    bedrooms: 4,
    transactionModes: ['SALE', 'RENTAL'],
    thumbnailUrl: '/uploads/demo/villa.jpg'
  }),
  bien('2', {
    title: 'Studio meublé Matam',
    propertyType: 'STUDIO',
    price: 850_000,
    surfaceArea: 28,
    rooms: 1,
    bedrooms: 1,
    status: 'RENTED',
    thumbnailUrl: '/uploads/demo/studio.jpg'
  }),
  // Sans photo : le substitut doit tenir la même hauteur, sinon la grille saute.
  bien('3', { title: 'Bureau Almamya', propertyType: 'BUREAU', price: 3_200_000, thumbnailUrl: null }),
  // Immeuble : pas de prix affiché, mais un décompte de lots.
  bien('4', {
    title: 'Immeuble R+3, 8 appartements',
    propertyType: 'IMMEUBLE',
    price: undefined,
    status: 'UNDER_OFFER',
    _count: { containerChildren: 8 },
    containerChildrenRentedCount: 5,
    containerChildrenAvailableCount: 3,
    thumbnailUrl: null
  }),
  // Adresse vide et statut brouillon : deux absences dans la même carte.
  bien('5', { title: 'Terrain 600 m²', propertyType: 'TERRAIN', address: '', locationZone: '', status: 'DRAFT' }),
  bien('6', {
    title: 'Boutique rue du Commerce',
    propertyType: 'BOUTIQUE_COMMERCIAL',
    price: 45_000_000,
    status: 'SOLD',
    transactionModes: ['SALE'],
    thumbnailUrl: '/uploads/demo/boutique.jpg'
  })
];

/**
 * Appartements d'un immeuble, pour la fiche du bien conteneur.
 *
 * Les titres sont volontairement longs : c'est exactement ce qui cassait le
 * tableau, un mot par ligne dans la colonne « Titre ».
 */
export const APPARTEMENTS: Property[] = [
  bien('a1', {
    title: 'Appartement A1 - 3 pièces, rez-de-chaussée - Immeuble Bingerville',
    propertyType: 'APPARTEMENT',
    surfaceArea: 78,
    rooms: 3,
    bedrooms: 2,
    price: 150_000,
    currency: 'FCFA'
  }),
  bien('a2', {
    title: 'Appartement A2 - 3 pièces, premier étage - Immeuble Bingerville',
    propertyType: 'APPARTEMENT',
    surfaceArea: 78,
    rooms: 3,
    bedrooms: 2,
    price: 150_000,
    currency: 'FCFA',
    status: 'RENTED'
  }),
  bien('a3', {
    title: 'Studio B1 - deuxième étage',
    propertyType: 'STUDIO',
    surfaceArea: 32,
    rooms: 1,
    bedrooms: 1,
    price: 90_000,
    currency: 'FCFA',
    status: 'RESERVED'
  }),
  // Sans prix ni surface : deux absences dans la même ligne.
  bien('a4', {
    title: 'Appartement C1 - lot non finalisé',
    propertyType: 'APPARTEMENT',
    surfaceArea: undefined,
    rooms: undefined,
    price: undefined,
    currency: 'FCFA',
    status: 'DRAFT'
  })
];

export const COMMUNES = [
  { communeId: 'c1', commune: 'Ratoma', region: 'Conakry' },
  { communeId: 'c2', commune: 'Matam', region: 'Conakry' },
  { communeId: 'c3', commune: 'Dixinn', region: 'Conakry' },
  { communeId: 'c4', commune: 'Kaloum', region: 'Conakry' }
];

/**
 * Échéances — six mois, tous les états du cycle d'encaissement.
 *
 * Deux cas y sont volontairement pénibles : une échéance partiellement payée
 * (le reste dû n'est ni le montant, ni zéro) et une en retard avec pénalités
 * (le montant dû dépasse le loyer). Ce sont les deux lignes où une colonne
 * « Reste à payer » mal calculée ne se verrait pas sur un jeu de données sage.
 */
export type EcheanceSimulee = {
  id: string;
  tenant_id: string;
  lease_id: string;
  period_year: number;
  period_month: number;
  due_date: string;
  status: string;
  currency: string;
  amount_rent: number;
  amount_service: number;
  amount_other_fees: number;
  penalty_amount: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
};

function echeance(mois: number, overrides: Partial<EcheanceSimulee> = {}): EcheanceSimulee {
  return {
    id: `ech-${mois}`,
    tenant_id: 'agence-demo',
    lease_id: 'bail-demo',
    period_year: 2026,
    period_month: mois,
    due_date: `2026-${String(mois).padStart(2, '0')}-05T00:00:00.000Z`,
    status: 'PAID',
    currency: 'GNF',
    amount_rent: 1_250_000,
    amount_service: 75_000,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 1_325_000,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

export const ECHEANCES: EcheanceSimulee[] = [
  echeance(1),
  echeance(2),
  // Partiel : le reste dû n'est ni le montant total, ni zéro.
  echeance(3, { status: 'PARTIAL', amount_paid: 500_000 }),
  // En retard AVEC pénalités : le montant dû dépasse le loyer + charges.
  echeance(4, { status: 'OVERDUE', amount_paid: 0, penalty_amount: 132_500 }),
  echeance(5, { status: 'DUE', amount_paid: 0 }),
  echeance(6, { status: 'DUE', amount_paid: 0, amount_other_fees: 45_000 })
];

/**
 * Pénalités — quatre cas qui couvrent les formes du champ « raison ».
 *
 * Ce champ est un texte libre où la raison d'ajustement et le justificatif sont
 * sérialisés en JSON, sauf pour les lignes écrites avant que ce format
 * n'existe : elles portent du texte brut. Les deux lectures doivent survivre,
 * et l'atelier les montre côte à côte.
 */
export const PENALITES = [
  // Ni ajustement, ni justificatif : le cas le plus courant.
  {
    id: 'pen-1',
    tenant_id: 'agence-demo',
    installment_id: 'ech-4',
    amount: 132_500,
    currency: 'GNF',
    days_late: 10,
    calculated_at: '2026-04-15T00:00:00.000Z',
    adjusted_amount: null,
    adjustment_reason: null,
    created_at: '',
    updated_at: ''
  },
  // Ajustée, raison en JSON, avec justificatif.
  {
    id: 'pen-2',
    tenant_id: 'agence-demo',
    installment_id: 'ech-3',
    amount: 66_250,
    currency: 'GNF',
    days_late: 5,
    calculated_at: '2026-03-10T00:00:00.000Z',
    adjusted_amount: 30_000,
    adjustment_reason: JSON.stringify({
      reason: 'Geste commercial : premier retard du locataire en deux ans.',
      justification: { fileUrl: '/uploads/demo/accord.pdf', fileName: 'accord-amiable.pdf' }
    }),
    created_at: '',
    updated_at: ''
  },
  // Raison en texte brut, format antérieur : ne doit pas casser la lecture.
  {
    id: 'pen-3',
    tenant_id: 'agence-demo',
    installment_id: 'ech-2',
    amount: 26_500,
    currency: 'GNF',
    days_late: 2,
    calculated_at: '2026-02-08T00:00:00.000Z',
    adjusted_amount: 0,
    adjustment_reason: 'Annulée, erreur de date de valeur',
    created_at: '',
    updated_at: ''
  },
  // Retard long : le libellé doit rester lisible.
  {
    id: 'pen-4',
    tenant_id: 'agence-demo',
    installment_id: 'ech-1',
    amount: 1_987_500,
    currency: 'GNF',
    days_late: 150,
    calculated_at: '2026-01-20T00:00:00.000Z',
    adjusted_amount: null,
    adjustment_reason: null,
    created_at: '',
    updated_at: ''
  }
];

/**
 * Paiements — quatre cas d'affectation.
 *
 * Le cas piégeux est le paiement entièrement versé au dépôt de garantie :
 * ses `allocations` sont vides, et un calcul qui ne sommerait que celles-ci le
 * ferait apparaître comme « non affecté » alors qu'il l'est intégralement.
 */
export const PAIEMENTS = [
  // Non affecté : le cas qui appelle une action.
  {
    id: 'pay-1',
    tenant_id: 'agence-demo',
    lease_id: 'bail-demo',
    amount: 1_325_000,
    currency: 'GNF',
    method: 'CASH',
    status: 'PENDING',
    initiated_at: '2026-05-06T09:30:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: ''
  },
  // Partiellement affecté.
  {
    id: 'pay-2',
    tenant_id: 'agence-demo',
    lease_id: 'bail-demo',
    amount: 1_000_000,
    currency: 'GNF',
    method: 'MOBILE_MONEY',
    status: 'SUCCESS',
    initiated_at: '2026-04-06T11:00:00.000Z',
    allocations: [{ id: 'a1', amount: 400_000 }],
    depositMovements: [],
    created_at: '',
    updated_at: ''
  },
  // ENTIEREMENT verse au depot : aucune allocation, et pourtant rien a affecter.
  {
    id: 'pay-3',
    tenant_id: 'agence-demo',
    lease_id: 'bail-demo',
    amount: 2_500_000,
    currency: 'GNF',
    method: 'BANK_TRANSFER',
    status: 'SUCCESS',
    initiated_at: '2026-01-05T08:00:00.000Z',
    allocations: [],
    depositMovements: [{ id: 'd1', amount: 2_500_000 }],
    created_at: '',
    updated_at: ''
  },
  // Echoue : ni affecte, ni affectable en pratique.
  {
    id: 'pay-4',
    tenant_id: 'agence-demo',
    lease_id: 'bail-demo',
    amount: 500_000,
    currency: 'GNF',
    method: 'CHECK',
    status: 'FAILED',
    initiated_at: '2026-03-06T14:20:00.000Z',
    allocations: [],
    depositMovements: [],
    created_at: '',
    updated_at: ''
  }
];

/**
 * Documents — cinq cas, dont trois qui éprouvent la mise en page.
 *
 * Un document sans titre (le titre est facultatif et souvent absent), un titre
 * très long, et un document annulé. Le numéro de document reste l'identifiant
 * fiable : c'est lui qui porte la colonne, le titre l'accompagne quand il
 * existe.
 */
/**
 * Modèles de documents d'une agence.
 *
 * Trois cas que la liste doit encaisser sans casser sous 375 px : un modèle par
 * défaut, un modèle inactif, et un nom long accompagné de onze variables — la
 * carte affiche leur compte, le tableau les trois premières.
 */
export const MODELES_DOCUMENTS = [
  {
    id: 'tpl-1',
    doc_type: 'LEASE_HABITATION',
    name: 'Bail Habitation Standard',
    status: 'ACTIVE',
    is_default: true,
    original_filename: 'bail-habitation-2026.docx',
    placeholders: ['AGENCE_NOM', 'BAIL_LOYER_MENSUEL', 'LOCATAIRE_NOM', 'BIEN_ADRESSE'],
    created_at: '2026-01-12T00:00:00.000Z'
  },
  {
    id: 'tpl-2',
    doc_type: 'LEASE_COMMERCIAL',
    name: 'Bail commercial — locaux de bureau, version longue revue par le conseil juridique',
    status: 'ACTIVE',
    is_default: false,
    original_filename: 'bail-commercial-v3-revision-juridique-fevrier.docx',
    placeholders: [
      'AGENCE_NOM',
      'AGENCE_RCCM',
      'BAIL_LOYER_MENSUEL',
      'BAIL_DEPOT_GARANTIE',
      'BAIL_DATE_DEBUT',
      'BAIL_DATE_FIN',
      'LOCATAIRE_NOM',
      'LOCATAIRE_RCCM',
      'BIEN_ADRESSE',
      'BIEN_SURFACE',
      'BIEN_USAGE'
    ],
    created_at: '2026-02-02T00:00:00.000Z'
  },
  {
    id: 'tpl-3',
    doc_type: 'RENT_RECEIPT',
    name: 'Reçu de loyer',
    status: 'INACTIVE',
    is_default: false,
    original_filename: 'recu-loyer.docx',
    placeholders: ['LOCATAIRE_NOM', 'BAIL_LOYER_MENSUEL'],
    created_at: '2026-02-20T00:00:00.000Z'
  },
  // Sans variable : le modèle est valide, la carte ne doit pas afficher un vide.
  {
    id: 'tpl-4',
    doc_type: 'RENT_STATEMENT',
    name: 'Relevé de compte annuel',
    status: 'ACTIVE',
    is_default: false,
    original_filename: 'releve-compte.docx',
    placeholders: [],
    created_at: '2026-03-01T00:00:00.000Z'
  }
];

export const DOCUMENTS = [
  {
    id: 'doc-1',
    tenant_id: 'agence-demo',
    type: 'LEASE_CONTRACT',
    status: 'FINAL',
    lease_id: 'bail-demo',
    document_number: 'DOC-2026-0001',
    title: 'Contrat de bail — Villa Kipé',
    issued_at: '2026-01-05T00:00:00.000Z',
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: ''
  },
  // Sans titre : la colonne ne doit pas se vider de sens.
  {
    id: 'doc-2',
    tenant_id: 'agence-demo',
    type: 'RENT_QUITTANCE',
    status: 'FINAL',
    lease_id: 'bail-demo',
    document_number: 'DOC-2026-0002',
    title: null,
    issued_at: '2026-02-06T00:00:00.000Z',
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: ''
  },
  // Titre long : il doit rester sous le numero sans repousser les actions.
  {
    id: 'doc-3',
    tenant_id: 'agence-demo',
    type: 'LEASE_ADDENDUM',
    status: 'DRAFT',
    lease_id: 'bail-demo',
    document_number: 'DOC-2026-0003',
    title: "Avenant n°2 portant revalorisation du loyer et modification de la date d'echeance mensuelle",
    issued_at: '2026-03-01T00:00:00.000Z',
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: ''
  },
  {
    id: 'doc-4',
    tenant_id: 'agence-demo',
    type: 'DEPOSIT_RECEIPT',
    status: 'VOID',
    lease_id: 'bail-demo',
    document_number: 'DOC-2026-0004',
    title: 'Reçu de dépôt — annulé',
    issued_at: '2026-01-06T00:00:00.000Z',
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: ''
  },
  {
    id: 'doc-5',
    tenant_id: 'agence-demo',
    type: 'STATEMENT',
    status: 'FINAL',
    lease_id: 'bail-demo',
    document_number: 'DOC-2026-0005',
    title: 'Relevé de gestion — 1er trimestre',
    issued_at: '2026-04-02T00:00:00.000Z',
    created_by_user_id: 'u1',
    created_at: '',
    updated_at: ''
  }
];

/**
 * Événements d'agenda — relatifs à aujourd'hui, volontairement.
 *
 * Les intitulés « Aujourd'hui » et « Demain » de la vue agenda ne sont corrects
 * que si le regroupement se fait sur le jour **local** et non sur la date UTC.
 * Des dates fixes ne le montreraient jamais ; des dates relatives au jour de
 * consultation, si.
 */
function dansNJours(n: number, heures: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(heures, 30, 0, 0);
  return d.toISOString();
}

export const EVENEMENTS = [
  {
    eventId: 'ev-1',
    eventType: 'FOLLOWUP',
    title: 'Rappeler pour le dossier de location',
    start: dansNJours(0, 9),
    end: dansNJours(0, 9),
    contactId: 'c1',
    contactName: 'Aissatou Diallo',
    dealId: 'd1',
    dealLabel: 'Location Villa Kipé',
    status: 'PENDING',
    badges: ['Urgent'],
    canEdit: true,
    canDrag: true,
    nextActionType: 'CALL',
    location: null,
    assignedToUserId: 'u1',
    createdByUserId: 'u1',
    propertyId: null
  },
  {
    eventId: 'ev-2',
    eventType: 'PROPERTY_VISIT',
    title: 'Visite — Studio Matam',
    start: dansNJours(0, 15),
    end: dansNJours(0, 16),
    contactId: 'c2',
    contactName: 'Mamadou Bah',
    dealId: null,
    dealLabel: null,
    status: 'CONFIRMED',
    badges: [],
    canEdit: true,
    canDrag: false,
    nextActionType: null,
    location: 'Matam, Conakry',
    assignedToUserId: 'u2',
    createdByUserId: 'u1',
    propertyId: 'prop-2'
  },
  {
    eventId: 'ev-3',
    eventType: 'FOLLOWUP',
    title: 'Envoyer le projet de bail',
    start: dansNJours(1, 11),
    end: dansNJours(1, 11),
    contactId: 'c3',
    contactName: 'Fatoumata Camara',
    dealId: 'd2',
    dealLabel: 'Vente Boutique',
    status: 'DONE',
    badges: ['Terminé'],
    canEdit: true,
    canDrag: true,
    nextActionType: 'EMAIL',
    location: null,
    assignedToUserId: 'u1',
    createdByUserId: 'u1',
    propertyId: null
  },
  // Titre long et créneau de deux heures : éprouve la carte comme la grille.
  {
    eventId: 'ev-4',
    eventType: 'PROPERTY_VISIT',
    title: 'Visite — Immeuble R+3, huit appartements à faire visiter dans la matinée',
    start: dansNJours(4, 10),
    end: dansNJours(4, 12),
    contactId: 'c4',
    contactName: 'SCI Kaloum',
    dealId: null,
    dealLabel: null,
    status: 'SCHEDULED',
    badges: ['Groupe'],
    canEdit: true,
    canDrag: false,
    nextActionType: null,
    location: 'Kaloum, Conakry',
    assignedToUserId: 'u2',
    createdByUserId: 'u2',
    propertyId: 'prop-4'
  }
];

/** Agrégat patrimoine : des valeurs plausibles pour une agence de Conakry. */
export const APERCU_PATRIMOINE = {
  totalProperties: 57,
  occupiedProperties: 49,
  occupancyRate: 0.86,
  totalEstimatedValue: 4_820_000_000,
  totalLoanBalance: 1_150_000_000,
  totalExpensesThisYear: 96_400_000,
  totalAnnualRent: 412_000_000
};

/**
 * Programmes de travaux de l'agence, tels que l'endpoint agrégé les rend :
 * avec le bien joint. Un titre très long et un coût nul éprouvent les cas que
 * des données moyennes ne montreraient pas.
 */
export const TRAVAUX = [
  {
    id: 'tr-1',
    propertyId: 'prop-1',
    tenantId: 'agence-demo',
    title: 'Réfection de la toiture',
    estimatedCost: 18_500_000,
    currency: 'GNF',
    plannedDate: '2026-06-15T00:00:00.000Z',
    status: 'PLANNED',
    isCapitalized: true,
    property: { id: 'prop-1', title: 'Villa Kipé', internalReference: 'BIEN-2026-0001' }
  },
  {
    id: 'tr-2',
    propertyId: 'prop-2',
    tenantId: 'agence-demo',
    title: 'Remise aux normes électriques',
    estimatedCost: 7_200_000,
    currency: 'GNF',
    plannedDate: '2026-04-02T00:00:00.000Z',
    status: 'IN_PROGRESS',
    isCapitalized: false,
    property: { id: 'prop-2', title: 'Studio Matam', internalReference: 'BIEN-2026-0002' }
  },
  {
    id: 'tr-3',
    propertyId: 'prop-4',
    tenantId: 'agence-demo',
    title: 'Peinture des parties communes de l’immeuble, cages d’escalier comprises',
    estimatedCost: 0,
    currency: 'GNF',
    plannedDate: '2026-02-10T00:00:00.000Z',
    status: 'COMPLETED',
    isCapitalized: false,
    property: { id: 'prop-4', title: 'Immeuble R+3', internalReference: 'BIEN-2026-0004' }
  },
  {
    id: 'tr-4',
    propertyId: 'prop-3',
    tenantId: 'agence-demo',
    title: 'Étanchéité terrasse',
    estimatedCost: 4_100_000,
    currency: 'GNF',
    plannedDate: '2026-09-01T00:00:00.000Z',
    status: 'CANCELLED',
    isCapitalized: false,
    property: { id: 'prop-3', title: 'Bureau Almamya', internalReference: 'BIEN-2026-0003' }
  }
];

/**
 * Tableau de bord d'accueil — un mois de septembre pénible.
 *
 * Le jeu est construit pour montrer ce qu'une capture sage cacherait : un mois
 * en cours à peine entamé (l'encaissé plonge sur le dernier point de la
 * courbe), un écart qui se creuse entre l'attendu et l'encaissé, huit types de
 * bien dont trois à une ou deux unités, un entonnoir où « Visite » pèse plus
 * que « Qualifiée », et un titre de tâche volontairement trop long.
 */
const AGENCE_DEMO = '/tenant/agence-demo';

export const TABLEAU_DE_BORD = {
  properties: {
    total: 57,
    published: 41,
    occupancyRate: 71.9,
    byStatus: [
      { key: 'RENTED', count: 38, href: `${AGENCE_DEMO}/properties?status=RENTED` },
      { key: 'AVAILABLE', count: 11, href: `${AGENCE_DEMO}/properties?status=AVAILABLE` },
      { key: 'UNDER_OFFER', count: 4, href: `${AGENCE_DEMO}/properties?status=UNDER_OFFER` },
      { key: 'SOLD', count: 3, href: `${AGENCE_DEMO}/properties?status=SOLD` },
      { key: 'DRAFT', count: 1, href: `${AGENCE_DEMO}/properties?status=DRAFT` }
    ],
    byType: [
      { key: 'APPARTEMENT', count: 22, href: `${AGENCE_DEMO}/properties?propertyType=APPARTEMENT` },
      { key: 'MAISON_VILLA', count: 14, href: `${AGENCE_DEMO}/properties?propertyType=MAISON_VILLA` },
      { key: 'STUDIO', count: 9, href: `${AGENCE_DEMO}/properties?propertyType=STUDIO` },
      { key: 'DUPLEX_TRIPLEX', count: 5, href: `${AGENCE_DEMO}/properties?propertyType=DUPLEX_TRIPLEX` },
      { key: 'BOUTIQUE_COMMERCIAL', count: 3, href: `${AGENCE_DEMO}/properties?propertyType=BOUTIQUE_COMMERCIAL` },
      { key: 'ENTREPOT_INDUSTRIEL', count: 2, href: `${AGENCE_DEMO}/properties?propertyType=ENTREPOT_INDUSTRIEL` },
      { key: 'TERRAIN', count: 1, href: `${AGENCE_DEMO}/properties?propertyType=TERRAIN` },
      { key: 'PARKING_BOX', count: 1, href: `${AGENCE_DEMO}/properties?propertyType=PARKING_BOX` }
    ]
  },
  clients: {
    total: 214,
    byStatus: [
      { key: 'LEAD', count: 128, href: `${AGENCE_DEMO}/crm/contacts` },
      { key: 'ACTIVE_CLIENT', count: 74, href: `${AGENCE_DEMO}/crm/contacts` },
      { key: 'ARCHIVED', count: 12, href: `${AGENCE_DEMO}/crm/contacts` }
    ]
  },
  monthlyRevenue: {
    amount: 12_400_000,
    previousAmount: 15_900_000,
    expected: 21_300_000,
    currency: 'GNF',
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-10-01T00:00:00.000Z'
  },
  transactions: { total: 163, deals: 138, leases: 25 },
  revenueSeries: [
    { month: '2025-10-01T00:00:00.000Z', encaisse: 14_100_000, attendu: 15_000_000 },
    { month: '2025-11-01T00:00:00.000Z', encaisse: 14_800_000, attendu: 15_600_000 },
    { month: '2025-12-01T00:00:00.000Z', encaisse: 16_200_000, attendu: 16_400_000 },
    { month: '2026-01-01T00:00:00.000Z', encaisse: 15_050_000, attendu: 17_100_000 },
    { month: '2026-02-01T00:00:00.000Z', encaisse: 16_900_000, attendu: 17_900_000 },
    { month: '2026-03-01T00:00:00.000Z', encaisse: 17_400_000, attendu: 18_600_000 },
    { month: '2026-04-01T00:00:00.000Z', encaisse: 18_050_000, attendu: 19_200_000 },
    { month: '2026-05-01T00:00:00.000Z', encaisse: 17_200_000, attendu: 19_800_000 },
    { month: '2026-06-01T00:00:00.000Z', encaisse: 18_900_000, attendu: 20_400_000 },
    { month: '2026-07-01T00:00:00.000Z', encaisse: 16_400_000, attendu: 20_900_000 },
    { month: '2026-08-01T00:00:00.000Z', encaisse: 15_900_000, attendu: 21_100_000 },
    { month: '2026-09-01T00:00:00.000Z', encaisse: 12_400_000, attendu: 21_300_000 }
  ],
  rental: {
    activeLeases: 25,
    leasesByStatus: [
      { key: 'ACTIVE', count: 25, amount: 19_400_000, href: `${AGENCE_DEMO}/rental/leases?status=ACTIVE` },
      { key: 'DRAFT', count: 3, amount: 2_100_000, href: `${AGENCE_DEMO}/rental/leases?status=DRAFT` },
      { key: 'ENDED', count: 8, amount: 5_600_000, href: `${AGENCE_DEMO}/rental/leases?status=ENDED` }
    ],
    installmentsByStatus: [
      { key: 'OVERDUE', count: 11, amount: 8_900_000, href: `${AGENCE_DEMO}/rental/installments?status=OVERDUE` },
      { key: 'PARTIAL', count: 4, amount: 1_450_000, href: `${AGENCE_DEMO}/rental/installments?status=PARTIAL` },
      { key: 'DUE', count: 19, amount: 12_300_000, href: `${AGENCE_DEMO}/rental/installments?status=DUE` },
      { key: 'PAID', count: 186, amount: 0, href: `${AGENCE_DEMO}/rental/installments?status=PAID` }
    ],
    paymentsByMethod: [
      { key: 'MOBILE_MONEY', count: 142, amount: 118_400_000, href: `${AGENCE_DEMO}/rental/payments` },
      { key: 'CASH', count: 54, amount: 44_200_000, href: `${AGENCE_DEMO}/rental/payments` },
      { key: 'BANK_TRANSFER', count: 21, amount: 29_800_000, href: `${AGENCE_DEMO}/rental/payments` },
      { key: 'CHECK', count: 3, amount: 4_100_000, href: `${AGENCE_DEMO}/rental/payments` }
    ],
    overdue: { count: 11, amount: 8_900_000 },
    dueThisWeek: { count: 7, amount: 4_350_000 },
    pendingDeclarations: 3
  },
  pipeline: [
    { key: 'NEW', count: 46, amount: 0, href: `${AGENCE_DEMO}/crm/deals` },
    { key: 'QUALIFIED', count: 18, amount: 240_000_000, href: `${AGENCE_DEMO}/crm/deals` },
    { key: 'VISIT', count: 21, amount: 310_000_000, href: `${AGENCE_DEMO}/crm/deals` },
    { key: 'NEGOTIATION', count: 9, amount: 155_000_000, href: `${AGENCE_DEMO}/crm/deals` },
    { key: 'WON', count: 6, amount: 98_000_000, href: `${AGENCE_DEMO}/crm/deals` },
    { key: 'LOST', count: 38, amount: 0, href: `${AGENCE_DEMO}/crm/deals` }
  ],
  maintenance: {
    open: 9,
    byStatus: [
      { key: 'DECLARED', count: 4, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'IN_PROGRESS', count: 3, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'ASSIGNED', count: 2, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'RESOLVED', count: 51, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'CANCELED', count: 6, href: `${AGENCE_DEMO}/admin/maintenance/tickets` }
    ],
    byPriority: [
      { key: 'URGENT', count: 2, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'HIGH', count: 3, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'MEDIUM', count: 3, href: `${AGENCE_DEMO}/admin/maintenance/tickets` },
      { key: 'LOW', count: 1, href: `${AGENCE_DEMO}/admin/maintenance/tickets` }
    ]
  },
  syndic: {
    syndicates: 3,
    lots: 128,
    chargeCallsByStatus: [
      { key: 'PAID', count: 96, amount: 48_000_000, href: `${AGENCE_DEMO}/syndics` },
      { key: 'PENDING', count: 24, amount: 12_000_000, href: `${AGENCE_DEMO}/syndics` },
      { key: 'OVERDUE', count: 14, amount: 7_400_000, href: `${AGENCE_DEMO}/syndics` },
      { key: 'PARTIAL', count: 6, amount: 2_100_000, href: `${AGENCE_DEMO}/syndics` }
    ],
    recoveryRate: 68.9
  },
  patrimoine: {
    workProgramsByStatus: [
      { key: 'PLANNED', count: 5, amount: 34_000_000, href: `${AGENCE_DEMO}/patrimoine/work-programs?status=PLANNED` },
      {
        key: 'IN_PROGRESS',
        count: 2,
        amount: 18_500_000,
        href: `${AGENCE_DEMO}/patrimoine/work-programs?status=IN_PROGRESS`
      },
      {
        key: 'COMPLETED',
        count: 7,
        amount: 51_200_000,
        href: `${AGENCE_DEMO}/patrimoine/work-programs?status=COMPLETED`
      },
      {
        key: 'CANCELLED',
        count: 1,
        amount: 3_000_000,
        href: `${AGENCE_DEMO}/patrimoine/work-programs?status=CANCELLED`
      }
    ],
    plannedCost: 52_500_000
  },
  workQueue: [
    {
      id: 'installment:e-1',
      kind: 'OVERDUE_INSTALLMENT',
      title: 'BAIL-2026-0184 · Villa 4 chambres avec piscine, quartier de Kipé Centre',
      description: '2 450 000 GNF · 42 j de retard',
      amount: 2_450_000,
      currency: 'GNF',
      occurredAt: '2026-08-05T00:00:00.000Z',
      severity: 'danger',
      href: `${AGENCE_DEMO}/rental/installments/e-1`
    },
    {
      id: 'installment:e-2',
      kind: 'OVERDUE_INSTALLMENT',
      title: 'BAIL-2026-0177 · Studio Ratoma',
      description: '650 000 GNF · 12 j de retard',
      amount: 650_000,
      currency: 'GNF',
      occurredAt: '2026-09-03T00:00:00.000Z',
      severity: 'danger',
      href: `${AGENCE_DEMO}/rental/installments/e-2`
    },
    {
      id: 'declaration:d-1',
      kind: 'PENDING_DECLARATION',
      title: 'Déclaration à valider · BAIL-2026-0161',
      description: '1 200 000 GNF · Mobile Money',
      amount: 1_200_000,
      currency: 'GNF',
      occurredAt: '2026-09-12T00:00:00.000Z',
      severity: 'warning',
      href: `${AGENCE_DEMO}/rental/payments?onglet=declarations`
    },
    {
      id: 'ticket:t-1',
      kind: 'URGENT_TICKET',
      title: 'Fuite au plafond du 3e étage',
      description: 'Immeuble Kaloum, 12 logements',
      amount: null,
      currency: null,
      occurredAt: '2026-09-13T08:30:00.000Z',
      severity: 'danger',
      href: `${AGENCE_DEMO}/admin/maintenance/tickets/t-1`
    }
  ],
  recentActivity: [
    {
      id: 'payment:p-1',
      type: 'PAYMENT_SUCCEEDED',
      title: 'Paiement encaissé',
      description: '1 250 000 GNF - bail BAIL-2026-0183',
      occurredAt: '2026-09-14T14:02:00.000Z',
      href: `${AGENCE_DEMO}/rental/payments/p-1`
    },
    {
      id: 'property:b-1',
      type: 'PROPERTY_CREATED',
      title: 'Nouvelle propriété ajoutée',
      description: 'Villa Kipé - Kipé, Ratoma',
      occurredAt: '2026-09-14T11:20:00.000Z',
      href: `${AGENCE_DEMO}/properties/b-1`
    },
    {
      id: 'contact:c-1',
      type: 'CONTACT_CREATED',
      title: 'Nouveau client enregistré',
      description: 'Aissatou Barry - aissatou@example.com',
      occurredAt: '2026-09-13T16:45:00.000Z',
      href: `${AGENCE_DEMO}/crm/contacts/c-1`
    }
  ]
};
