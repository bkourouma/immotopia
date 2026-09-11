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
