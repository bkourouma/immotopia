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
