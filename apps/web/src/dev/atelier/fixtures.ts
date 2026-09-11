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
