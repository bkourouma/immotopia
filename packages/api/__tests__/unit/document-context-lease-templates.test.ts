/**
 * Contrats de bail : les contextes construits couvrent tous les champs des
 * modeles DOCX du depot (`contrat_bail_habitation.docx`,
 * `contrat_bail_commercial.docx`).
 *
 * Prisma est simule ; le contexte est le vrai, et le rendu passe par le vrai
 * `renderDocx` sur le vrai modele. Aucun `{{CHAMP}}` en clair ne doit subsister.
 */
import * as path from 'path';
import PizZip from 'pizzip';

const rentalLeaseFindFirst = jest.fn();
const crmContactFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalLease: { findFirst: (...a: any[]) => rentalLeaseFindFirst(...a) },
    crmContact: { findFirst: (...a: any[]) => crmContactFindFirst(...a) }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import {
  buildLeaseCommercialContext,
  buildLeaseHabitationContext,
  validateContext
} from '../../src/services/document-context-builder';
import {
  leaseDurationLabel,
  penaltyRateLabel,
  propertyEquipmentLabel
} from '../../src/services/document-context-helpers';
import { renderDocx } from '../../src/services/docx-renderer';

// docxtemplater signale `setData` (utilise par docx-renderer) comme obsolete : bruit sans rapport.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

const MODELS_DIR = path.resolve(__dirname, '../../../../assets/modeles_documents');
const HABITATION = 'contrat_bail_habitation.docx';
const COMMERCIAL = 'contrat_bail_commercial.docx';

/** Champs attendus par chaque modele (extraits des modeles DOCX du depot). */
const HABITATION_FIELDS = [
  'ADRESSE_BIEN',
  'BAILLEUR_ADRESSE',
  'BAILLEUR_EMAIL',
  'BAILLEUR_NOM',
  'BAILLEUR_TELEPHONE',
  'CHARGES_MENSUELLES',
  'CLAUSES_PARTICULIERES',
  'DATE_DEBUT_BAIL',
  'DATE_FIN_BAIL',
  'DATE_SIGNATURE',
  'DELAI_GRACE',
  'DEPOT_GARANTIE',
  'DESCRIPTION_BIEN',
  'DUREE_BAIL',
  'EQUIPEMENTS',
  'JOUR_ECHEANCE',
  'LIEU_SIGNATURE',
  'LOCATAIRE_ADRESSE',
  'LOCATAIRE_EMAIL',
  'LOCATAIRE_NOM',
  'LOCATAIRE_PIECE_ID',
  'LOCATAIRE_TELEPHONE',
  'LOYER_MENSUEL',
  'PREAVIS_PRENEUR',
  'SUPERFICIE',
  'TAUX_PENALITE',
  'TYPE_BIEN'
];
const COMMERCIAL_ONLY_FIELDS = [
  'ACTIVITE_COMMERCIALE',
  'BAILLEUR_FORME_JURIDIQUE',
  'BAILLEUR_REPRESENTANT',
  'DETAIL_CHARGES',
  'LOCATAIRE_FORME_JURIDIQUE',
  'LOCATAIRE_RCCM',
  'LOCATAIRE_REPRESENTANT',
  'PAS_DE_PORTE'
];

/** Rend le vrai modele avec le vrai moteur et renvoie le texte du document. */
async function renderModelText(filename: string, context: Record<string, any>): Promise<string> {
  const buffer = await renderDocx(
    { id: 'tpl-test', storage_path: path.join(MODELS_DIR, filename), stored_filename: filename } as any,
    context
  );
  const xml = new PizZip(buffer).file('word/document.xml')!.asText();
  expect(xml).not.toContain('{{');
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ');
}

/** Chaque champ du modele est fourni, non vide. */
function expectAllFields(context: Record<string, any>, fields: string[]) {
  for (const field of fields) {
    expect(typeof context[field]).toBe('string');
    expect(context[field].trim()).not.toBe('');
  }
}

const agency = {
  id: 'agency-1',
  name: 'Agence Test',
  city: 'Abidjan',
  address: 'Cocody, rue 12',
  contactPhone: '+225 27 00 00 00',
  contactEmail: 'contact@agence.test'
};

const renterContact = {
  id: 'contact-renter',
  contactType: 'COMPANY',
  firstName: 'Awa',
  lastName: 'Koné',
  email: 'awa@societe.ci',
  identityDocumentType: 'CNI',
  identityDocumentNumber: 'C0012345',
  legalName: 'Boutique Awa SARL',
  legalForm: 'SARL',
  rccm: 'CI-ABJ-2020-B-12345',
  representativeName: 'Awa Koné',
  representativeRole: 'Gérante',
  phonePrimary: '+225 07 11 22 33',
  phoneSecondary: null,
  whatsappNumber: null,
  address: 'Marcory, zone 4',
  district: null,
  city: 'Abidjan',
  sectorOfActivity: 'Commerce de détail'
};

const ownerContact = {
  id: 'contact-owner',
  contactType: 'PERSON',
  firstName: 'Moussa',
  lastName: 'Traoré',
  email: 'bailleur@test.ci',
  identityDocumentType: null,
  identityDocumentNumber: null,
  legalName: null,
  legalForm: null,
  rccm: null,
  representativeName: null,
  representativeRole: null,
  phonePrimary: '+225 05 44 55 66',
  phoneSecondary: null,
  whatsappNumber: null,
  address: 'Plateau, avenue 8',
  district: null,
  city: 'Abidjan',
  sectorOfActivity: null
};

const fullLease = () => ({
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  lease_number: 'BAIL-2026-001',
  currency: 'FCFA',
  start_date: new Date(2026, 0, 1),
  end_date: new Date(2027, 11, 31),
  created_at: new Date(2025, 11, 20),
  due_day_of_month: 5,
  rent_amount: 120000,
  service_charge_amount: 15000,
  security_deposit_amount: 240000,
  penalty_grace_days: 5,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 2,
  penalty_fixed_amount: 0,
  notes: 'Le Preneur peut sous-louer un local de rangement.',
  property: {
    address: '12 rue des Palmiers, Cocody',
    propertyType: 'BOUTIQUE_COMMERCIAL',
    title: 'Boutique Palmiers',
    description: 'Boutique de 2 pièces avec arrière-boutique.',
    surfaceArea: 45.5,
    surfaceUseful: null,
    rooms: 2,
    bedrooms: null,
    bathrooms: 1,
    furnishingStatus: 'UNFURNISHED',
    typeSpecificData: { equipments: ['Climatisation', 'Rideau métallique'] },
    owner: null
  },
  primaryRenter: {
    id: 'renter-1',
    user: { id: 'u1', email: 'locataire@test.ci', fullName: 'Awa Koné' },
    details: { crmContactId: 'contact-renter' }
  },
  ownerClient: {
    id: 'owner-1',
    user: { id: 'u2', email: 'bailleur@test.ci', fullName: 'Moussa Traoré' },
    details: { crmContactId: 'contact-owner' }
  },
  tenant: agency,
  coRenters: []
});

/** Bail sans aucune donnee optionnelle : ni fiche CRM, ni proprietaire, ni fin de bail. */
const bareLease = () => ({
  ...fullLease(),
  end_date: null,
  created_at: null,
  notes: null,
  service_charge_amount: 0,
  security_deposit_amount: 0,
  property: {
    address: '3 rue du Marché',
    propertyType: 'APPARTEMENT',
    title: '',
    description: '',
    surfaceArea: null,
    surfaceUseful: null,
    rooms: null,
    bedrooms: null,
    bathrooms: null,
    furnishingStatus: null,
    typeSpecificData: null,
    owner: null
  },
  primaryRenter: {
    id: 'renter-2',
    user: { id: 'u3', email: 'sans-fiche@test.ci', fullName: 'Kouadio Yao' },
    details: null
  },
  ownerClient: null,
  tenant: { ...agency, city: null, address: null }
});

function mockContacts() {
  crmContactFindFirst.mockImplementation(({ where }: any) =>
    Promise.resolve([renterContact, ownerContact].find(c => c.id === where.id) || null)
  );
}

describe('buildLeaseHabitationContext + contrat_bail_habitation.docx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContacts();
  });

  it('bail complet : tous les champs du modele sont fournis et rendus', async () => {
    rentalLeaseFindFirst.mockResolvedValue(fullLease());

    const context = await buildLeaseHabitationContext('agency-1', 'lease-1');

    expectAllFields(context, HABITATION_FIELDS);
    // Cles historiques conservees (modeles d'agence personnalises)
    expect(context).toEqual(
      expect.objectContaining({
        AGENCE_NOM: 'Agence Test',
        BIEN_ADRESSE: '12 rue des Palmiers, Cocody',
        BAIL_NUMERO: 'BAIL-2026-001',
        BAIL_DATE_DEBUT: '01/01/2026',
        BAIL_DATE_FIN: '31/12/2027',
        DATE_GENERATION: expect.any(String)
      })
    );
    expect(context.BAIL_LOYER_MENSUEL).toMatch(/^120\D000 FCFA$/);

    expect(context.DUREE_BAIL).toBe('24 mois');
    expect(context.DATE_DEBUT_BAIL).toBe('01/01/2026');
    expect(context.DATE_FIN_BAIL).toBe('31/12/2027');
    expect(context.DATE_SIGNATURE).toBe('20/12/2025');
    // Sans devise : le modele pose « FCFA ».
    expect(context.LOYER_MENSUEL).toMatch(/^120\D000$/);
    expect(context.CHARGES_MENSUELLES).toMatch(/^15\D000$/);
    expect(context.DEPOT_GARANTIE).toMatch(/^240\D000$/);
    expect(context.JOUR_ECHEANCE).toBe('5');
    expect(context.DELAI_GRACE).toBe('5');
    expect(context.TAUX_PENALITE).toBe('2 %');
    expect(context.TYPE_BIEN).toBe('Boutique / Local commercial');
    expect(context.SUPERFICIE).toBe('45,5');
    expect(context.EQUIPEMENTS).toBe('2 pièces, 1 salle de bain, Non meublé, Climatisation, Rideau métallique');
    expect(context.LOCATAIRE_PIECE_ID).toBe('CNI n° C0012345');
    expect(context.LOCATAIRE_ADRESSE).toBe('Marcory, zone 4, Abidjan');
    expect(context.BAILLEUR_ADRESSE).toBe('Plateau, avenue 8, Abidjan');
    expect(context.LIEU_SIGNATURE).toBe('Abidjan');
    expect(context.CLAUSES_PARTICULIERES).toBe('Le Preneur peut sous-louer un local de rangement.');

    const text = await renderModelText(HABITATION, context);
    expect(text).toContain('durée de 24 mois');
    expect(text).toContain('120 000 FCFA');
    expect(text).toContain('240 000 FCFA');
    expect(text).toContain('au-delà de 5 jours');
    expect(text).toContain('fixées à 2 %');
    expect(text).toContain('Superficie : 45,5 m²');
    expect(text).toContain('Fait à Abidjan, le 20/12/2025');
    expect(text).toContain('Moussa Traoré');
    expect(text).toContain('CNI n° C0012345');
  });

  it("journaux : aucune coordonnee personnelle (telephone, e-mail, adresse) n'est ecrite en clair", async () => {
    rentalLeaseFindFirst.mockResolvedValue(fullLease());

    await buildLeaseHabitationContext('agency-1', 'lease-1');

    const { logger } = jest.requireMock('../../src/utils/logger') as {
      logger: Record<'info' | 'warn' | 'error' | 'debug', jest.Mock>;
    };
    const logged = JSON.stringify(
      (['info', 'warn', 'error', 'debug'] as const).flatMap(level => logger[level].mock.calls)
    );
    // Valeurs de la fiche CRM, de l'agence et du bailleur fournies par la fixture
    expect(logged).not.toContain('+225 07 11 22 33');
    expect(logged).not.toContain('+225 05 44 55 66');
    expect(logged).not.toContain('+225 27 00 00 00');
    expect(logged).not.toContain('12 rue des Palmiers');
    expect(logged).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });

  it('donnees absentes : « — » lisible, jamais un champ en clair', async () => {
    rentalLeaseFindFirst.mockResolvedValue(bareLease());

    const context = await buildLeaseHabitationContext('agency-1', 'lease-2');

    expectAllFields(context, HABITATION_FIELDS);
    expect(context.DATE_FIN_BAIL).toBe('—');
    expect(context.DUREE_BAIL).toBe('—');
    expect(context.SUPERFICIE).toBe('—');
    expect(context.EQUIPEMENTS).toBe('—');
    expect(context.DESCRIPTION_BIEN).toBe('—');
    expect(context.CLAUSES_PARTICULIERES).toBe('—');
    expect(context.LOCATAIRE_ADRESSE).toBe('—');
    expect(context.LOCATAIRE_PIECE_ID).toBe('—');
    expect(context.LOCATAIRE_TELEPHONE).toBe('—');
    expect(context.LIEU_SIGNATURE).toBe('—');
    expect(context.BAILLEUR_ADRESSE).toBe('—');
    // Sans proprietaire connu, l'agence gestionnaire figure comme bailleur.
    expect(context.BAILLEUR_NOM).toBe('Agence Test');
    // Sans date de creation, la date de signature est celle du jour.
    expect(context.DATE_SIGNATURE).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    // Un montant nul reste un montant.
    expect(context.CHARGES_MENSUELLES).toBe('0');

    const text = await renderModelText(HABITATION, context);
    expect(text).toContain('Kouadio Yao');
    expect(text).toContain('Agence Test');
  });

  it('penalite a montant fixe : le montant avec sa devise, pas un pourcentage', async () => {
    rentalLeaseFindFirst.mockResolvedValue({
      ...fullLease(),
      penalty_mode: 'FIXED_AMOUNT',
      penalty_fixed_amount: 5000
    });

    const context = await buildLeaseHabitationContext('agency-1', 'lease-1');
    expect(context.TAUX_PENALITE).toMatch(/^5\D000 FCFA$/);
    await renderModelText(HABITATION, context);
  });

  it('un bail introuvable leve une erreur', async () => {
    rentalLeaseFindFirst.mockResolvedValue(null);
    await expect(buildLeaseHabitationContext('agency-1', 'nope')).rejects.toThrow('Lease not found');
  });

  it('validateContext : aucun champ critique manquant', async () => {
    rentalLeaseFindFirst.mockResolvedValue(bareLease());
    const context = await buildLeaseHabitationContext('agency-1', 'lease-2');

    const { missing } = validateContext(context, [
      ...HABITATION_FIELDS,
      'AGENCE_NOM',
      'BAIL_NUMERO',
      'BAIL_LOYER_MENSUEL'
    ]);
    expect(missing).toEqual([]);
  });
});

describe('buildLeaseCommercialContext + contrat_bail_commercial.docx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContacts();
  });

  it('bail complet : champs habitation et champs commerciaux fournis et rendus', async () => {
    rentalLeaseFindFirst.mockResolvedValue(fullLease());

    const context = await buildLeaseCommercialContext('agency-1', 'lease-1');

    expectAllFields(context, [...HABITATION_FIELDS.filter(f => f !== 'LOCATAIRE_PIECE_ID'), ...COMMERCIAL_ONLY_FIELDS]);
    expect(context.ACTIVITE_COMMERCIALE).toBe('Commerce de détail');
    expect(context.LOCATAIRE_NOM).toBe('Boutique Awa SARL');
    expect(context.LOCATAIRE_FORME_JURIDIQUE).toBe('SARL');
    expect(context.LOCATAIRE_RCCM).toBe('CI-ABJ-2020-B-12345');
    expect(context.LOCATAIRE_REPRESENTANT).toBe('Awa Koné (Gérante)');
    expect(context.BAILLEUR_FORME_JURIDIQUE).toBe('Personne physique');
    expect(context.BAILLEUR_REPRESENTANT).toBe('—');
    expect(context.DETAIL_CHARGES).toBe('les charges de service convenues au bail');
    expect(context.PAS_DE_PORTE).toBe('—');
    expect(context.PREAVIS_PRENEUR).toBe('6 mois');
    // Cles historiques conservees
    expect(context.BAIL_NUMERO).toBe('BAIL-2026-001');

    const text = await renderModelText(COMMERCIAL, context);
    expect(text).toContain('Commerce de détail');
    expect(text).toContain('Boutique Awa SARL');
    expect(text).toContain('CI-ABJ-2020-B-12345');
    expect(text).toContain('préavis de 6 mois');
    expect(text).toContain('durée de 24 mois');
    expect(text).toContain('Fait à Abidjan');
  });

  it('donnees absentes : « — » lisible pour chaque champ commercial', async () => {
    rentalLeaseFindFirst.mockResolvedValue(bareLease());

    const context = await buildLeaseCommercialContext('agency-1', 'lease-2');

    expectAllFields(context, [...HABITATION_FIELDS, ...COMMERCIAL_ONLY_FIELDS]);
    expect(context.ACTIVITE_COMMERCIALE).toBe('—');
    expect(context.LOCATAIRE_FORME_JURIDIQUE).toBe('—');
    expect(context.LOCATAIRE_RCCM).toBe('—');
    expect(context.LOCATAIRE_REPRESENTANT).toBe('—');
    expect(context.BAILLEUR_FORME_JURIDIQUE).toBe('—');
    expect(context.DETAIL_CHARGES).toBe('—');

    const text = await renderModelText(COMMERCIAL, context);
    expect(text).toContain('Kouadio Yao');
  });

  it('propriétaire du bien sans client bailleur : nom, e-mail et adresse de repli lisibles', async () => {
    const lease = bareLease();
    (lease.property as any).owner = { id: 'u9', email: 'proprio@test.ci', fullName: 'Fatou Diallo' };
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-3');
    expect(context.BAILLEUR_NOM).toBe('Fatou Diallo');
    expect(context.BAILLEUR_EMAIL).toBe('proprio@test.ci');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(context.BAILLEUR_ADRESSE).toBe('—');
    await renderModelText(COMMERCIAL, context);
  });
});

describe('aides des contrats de bail', () => {
  it('leaseDurationLabel : mois entiers, reste de jours, cas invalides', () => {
    expect(leaseDurationLabel(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe('12 mois');
    expect(leaseDurationLabel(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe('1 mois');
    expect(leaseDurationLabel(new Date(2026, 0, 15), new Date(2027, 0, 14))).toBe('12 mois');
    expect(leaseDurationLabel(new Date(2026, 0, 1), new Date(2026, 6, 10))).toBe('6 mois et 10 jours');
    expect(leaseDurationLabel(new Date(2026, 0, 1), new Date(2026, 0, 10))).toBe('10 jours');
    expect(leaseDurationLabel(new Date(2026, 0, 1), null)).toBe('—');
    expect(leaseDurationLabel(new Date(2026, 5, 1), new Date(2026, 0, 1))).toBe('—');
  });

  it('penaltyRateLabel : pourcentage ou montant fixe', () => {
    expect(penaltyRateLabel('PERCENT_OF_RENT', '2.5', 'x')).toBe('2,5 %');
    expect(penaltyRateLabel('FIXED_AMOUNT', 0, '5 000 FCFA')).toBe('5 000 FCFA');
  });

  it('propertyEquipmentLabel : « — » sans donnee', () => {
    expect(propertyEquipmentLabel({})).toBe('—');
    expect(propertyEquipmentLabel(null)).toBe('—');
    expect(propertyEquipmentLabel({ bedrooms: 3, furnishingStatus: 'FURNISHED' })).toBe('3 chambres, Meublé');
  });
});
