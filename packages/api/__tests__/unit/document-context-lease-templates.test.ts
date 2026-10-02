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
  'DEVISE',
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
  'CLAUSE_PENALITE',
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
    .replace(/&apos;/g, "'")
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
    // Sans devise : le modele pose `{{DEVISE}}`.
    expect(context.DEVISE).toBe('FCFA');
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
    expect(text).toContain('solde impayé');
    expect(text).not.toContain('par jour de retard');
    expect(text).not.toContain('faire valider');
    expect(text).not.toContain('DEVISE');
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

  it('devise du bail : DEVISE suit la devise du bail (XOF -> FCFA, autre devise telle quelle), rendue par le modele', async () => {
    rentalLeaseFindFirst.mockResolvedValue({ ...fullLease(), currency: 'XOF' });
    expect((await buildLeaseHabitationContext('agency-1', 'lease-1')).DEVISE).toBe('FCFA');

    rentalLeaseFindFirst.mockResolvedValue({ ...fullLease(), currency: 'EUR' });
    const context = await buildLeaseHabitationContext('agency-1', 'lease-1');
    expect(context.DEVISE).toBe('EUR');
    const text = await renderModelText(HABITATION, context);
    expect(text).toContain('120 000 EUR');
    expect(text).toContain('240 000 EUR');
    expect(text).not.toContain('FCFA');
  });

  it('devise absente : FCFA par defaut', async () => {
    rentalLeaseFindFirst.mockResolvedValue({ ...fullLease(), currency: null });
    expect((await buildLeaseHabitationContext('agency-1', 'lease-1')).DEVISE).toBe('FCFA');
  });

  it('un bail introuvable leve une erreur', async () => {
    rentalLeaseFindFirst.mockResolvedValue(null);
    await expect(buildLeaseHabitationContext('agency-1', 'nope')).rejects.toThrow('Bail introuvable');
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
    expect(text).toContain('solde impayé');
    expect(text).not.toContain('par jour de retard');
    expect(text).not.toContain('faire valider');
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
    (lease.property as any).ownershipType = 'CLIENT';
    (lease.property as any).owner = { id: 'u9', email: 'proprio@test.ci', fullName: 'Fatou Diallo' };
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-3');
    expect(context.BAILLEUR_NOM).toBe("Fatou Diallo, représenté par l'agence Agence Test (mandataire)");
    expect(context.BAILLEUR_EMAIL).toBe('proprio@test.ci');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(context.BAILLEUR_ADRESSE).toBe('—');
    await renderModelText(COMMERCIAL, context);
  });
});

describe('bailleur : propriete reelle du bien (BUG-2026-09-30-032)', () => {
  const entityContact = {
    ...ownerContact,
    id: 'contact-entity',
    tenantId: 'agency-1',
    email: 'sci@test.ci',
    phonePrimary: '+225 01 02 03 04',
    address: 'Riviera, lot 5',
    city: 'Abidjan',
    representativeName: 'Ali Bamba',
    representativeRole: 'Gérant'
  };
  const holding = (overrides: Record<string, any> = {}, entityOverrides: Record<string, any> = {}) => ({
    tenantId: 'agency-1',
    sharePercent: 100,
    entity: {
      tenantId: 'agency-1',
      isActive: true,
      name: 'SCI Les Palmiers',
      legalForm: 'SCI',
      contact: entityContact,
      ...entityOverrides
    },
    ...overrides
  });
  /** Bien cree par un utilisateur de l'agence : `owner` n'est que son createur. */
  const creator = { id: 'u-creator', email: 'admin@agence.test', fullName: 'Aïcha Créatrice' };
  const ownedByAgency = (): any => ({
    ...bareLease(),
    property: { ...bareLease().property, ownershipType: 'TENANT', owner: creator, holdings: [] },
    tenant: { ...agency, legalName: 'Agence Test SARL' }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockContacts();
  });

  it("bien detenu en propre : l'agence est le bailleur, jamais le createur du bien", async () => {
    rentalLeaseFindFirst.mockResolvedValue(ownedByAgency());

    const context = await buildLeaseHabitationContext('agency-1', 'lease-a');
    expect(context.BAILLEUR_NOM).toBe('Agence Test SARL');
    expect(context.BAILLEUR_ADRESSE).toBe('Cocody, rue 12, Abidjan');
    expect(context.BAILLEUR_TELEPHONE).toBe('+225 27 00 00 00');
    expect(context.BAILLEUR_EMAIL).toBe('contact@agence.test');
    expect(JSON.stringify(context)).not.toContain('Aïcha Créatrice');
    expect(JSON.stringify(context)).not.toContain('admin@agence.test');
    const text = await renderModelText(HABITATION, context);
    expect(text).toContain('Agence Test SARL');
  });

  it('agence sans coordonnees : la generation continue avec « — »', async () => {
    const lease = ownedByAgency();
    lease.tenant = { ...lease.tenant, address: null, city: null, contactPhone: null, contactEmail: null };
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-b');
    expect(context.BAILLEUR_NOM).toBe('Agence Test SARL');
    expect(context.BAILLEUR_ADRESSE).toBe('—');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(context.BAILLEUR_EMAIL).toBe('—');
    expect(context.BAILLEUR_REPRESENTANT).toBe('—');
    await renderModelText(COMMERCIAL, context);
  });

  it("entite detentrice : denomination, forme juridique, coordonnees et representant de l'entite", async () => {
    const lease = ownedByAgency();
    lease.property.holdings = [holding()];
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-c');
    expect(context.BAILLEUR_NOM).toBe('SCI Les Palmiers');
    expect(context.BAILLEUR_FORME_JURIDIQUE).toBe('SCI');
    expect(context.BAILLEUR_ADRESSE).toBe('Riviera, lot 5, Abidjan');
    expect(context.BAILLEUR_TELEPHONE).toBe('+225 01 02 03 04');
    expect(context.BAILLEUR_EMAIL).toBe('sci@test.ci');
    expect(context.BAILLEUR_REPRESENTANT).toBe('Ali Bamba (Gérant)');
    expect(JSON.stringify(context)).not.toContain('Aïcha Créatrice');
    const text = await renderModelText(COMMERCIAL, context);
    expect(text).toContain('SCI Les Palmiers');
  });

  it("entite : la plus forte part l'emporte sur l'entite detentrice minoritaire", async () => {
    const lease = ownedByAgency();
    lease.property.holdings = [
      holding({ sharePercent: 20 }, { name: 'Holding B' }),
      holding({ sharePercent: 80 }, { name: 'SCI Majoritaire' })
    ];
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseHabitationContext('agency-1', 'lease-d');
    expect(context.BAILLEUR_NOM).toBe('SCI Majoritaire');
  });

  it('entite prioritaire sur le proprietaire client', async () => {
    const lease: any = { ...fullLease(), tenant: agency };
    lease.property = { ...lease.property, holdings: [holding()] };
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseHabitationContext('agency-1', 'lease-e');
    expect(context.BAILLEUR_NOM).toBe('SCI Les Palmiers');
  });

  it('entite sans fiche de contact : denomination seule, « — » ailleurs, sans blocage', async () => {
    const lease = ownedByAgency();
    lease.property.holdings = [holding({}, { contact: null, legalForm: 'INDIVIDUAL' })];
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-f');
    expect(context.BAILLEUR_NOM).toBe('SCI Les Palmiers');
    expect(context.BAILLEUR_FORME_JURIDIQUE).toBe('Personne physique');
    expect(context.BAILLEUR_ADRESSE).toBe('—');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(context.BAILLEUR_EMAIL).toBe('—');
    await renderModelText(COMMERCIAL, context);
  });

  it("isolation : une entite ou une fiche d'une autre agence n'entre jamais dans le contexte", async () => {
    const lease = ownedByAgency();
    lease.property.holdings = [
      holding({ tenantId: 'other-agency' }, { tenantId: 'other-agency', name: 'SCI Etrangere' }),
      holding({}, { tenantId: 'other-agency', name: 'SCI Autre' }),
      holding({}, { name: 'SCI Inactive', isActive: false }),
      holding({ sharePercent: 10 }, { name: 'SCI Locale', contact: { ...entityContact, tenantId: 'other-agency' } })
    ];
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseCommercialContext('agency-1', 'lease-g');
    expect(context.BAILLEUR_NOM).toBe('SCI Locale');
    // La fiche de contact d'une autre agence est ignoree.
    expect(context.BAILLEUR_EMAIL).toBe('—');
    expect(context.BAILLEUR_TELEPHONE).toBe('—');
    expect(JSON.stringify(context)).not.toMatch(/Etrangere|SCI Autre|SCI Inactive|sci@test\.ci/);
  });

  it("proprietaire client : ses coordonnees, et l'agence designee comme mandataire", async () => {
    rentalLeaseFindFirst.mockResolvedValue({
      ...fullLease(),
      property: { ...fullLease().property, ownershipType: 'CLIENT', owner: creator, holdings: [] }
    });

    const context = await buildLeaseHabitationContext('agency-1', 'lease-h');
    expect(context.BAILLEUR_NOM).toBe("Moussa Traoré, représenté par l'agence Agence Test (mandataire)");
    expect(context.BAILLEUR_TELEPHONE).toBe('+225 05 44 55 66');
    expect(context.BAILLEUR_ADRESSE).toBe('Plateau, avenue 8, Abidjan');
    expect(JSON.stringify(context)).not.toContain('Aïcha Créatrice');
  });

  it("createur d'un bien TENANT sans autre proprietaire : jamais bailleur", async () => {
    const lease = ownedByAgency();
    lease.tenant = { ...agency };
    rentalLeaseFindFirst.mockResolvedValue(lease);

    const context = await buildLeaseHabitationContext('agency-1', 'lease-i');
    expect(context.BAILLEUR_NOM).toBe('Agence Test');
  });
});

describe('clause de penalite de retard (BUG-2026-09-30-056)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockContacts();
  });

  const cases: Array<[string, Record<string, any>, string]> = [
    [
      'PERCENT_OF_BALANCE',
      { penalty_mode: 'PERCENT_OF_BALANCE', penalty_rate: 2 },
      "l'application d'une pénalité de 2 % du solde impayé de l'échéance en retard, appliquée une seule fois par échéance"
    ],
    [
      'PERCENT_OF_RENT',
      { penalty_mode: 'PERCENT_OF_RENT', penalty_rate: 5 },
      "l'application d'une pénalité de 5 % du loyer de l'échéance en retard, appliquée une seule fois par échéance"
    ],
    [
      'FIXED_AMOUNT avec plafond',
      { penalty_mode: 'FIXED_AMOUNT', penalty_fixed_amount: 5000, penalty_cap_amount: 20000 },
      'une pénalité forfaitaire de 5'
    ],
    [
      'taux nul : repli neutre',
      { penalty_mode: 'PERCENT_OF_BALANCE', penalty_rate: 0 },
      "l'application de pénalités selon les conditions convenues entre les parties"
    ],
    [
      'forfait nul : repli neutre',
      { penalty_mode: 'FIXED_AMOUNT', penalty_fixed_amount: 0 },
      "l'application de pénalités selon les conditions convenues entre les parties"
    ]
  ];

  it.each(cases)('%s', async (_name, overrides, expected) => {
    rentalLeaseFindFirst.mockResolvedValue({ ...fullLease(), ...overrides });

    const habitation = await buildLeaseHabitationContext('agency-1', 'lease-p');
    expect(habitation.CLAUSE_PENALITE).toContain(expected);
    const text = await renderModelText(HABITATION, habitation);
    expect(text).toContain(expected);
    expect(text).not.toContain('par jour de retard');

    const commercial = await buildLeaseCommercialContext('agency-1', 'lease-p');
    expect(await renderModelText(COMMERCIAL, commercial)).toContain(expected);
  });

  it('plafond : la limite figure avec sa devise', async () => {
    rentalLeaseFindFirst.mockResolvedValue({
      ...fullLease(),
      penalty_mode: 'PERCENT_OF_RENT',
      penalty_rate: 5,
      penalty_cap_amount: 20000
    });
    const context = await buildLeaseHabitationContext('agency-1', 'lease-p');
    expect(context.CLAUSE_PENALITE).toMatch(/, dans la limite de 20[\s\u00a0\u202f]000 FCFA$/);
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
