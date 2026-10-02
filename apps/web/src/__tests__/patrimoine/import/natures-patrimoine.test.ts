import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Natures « patrimoine » de l'import en masse : BIENS et VALORISATIONS.
 *
 * Les mocks sont posés à la frontière réseau : les services. Tout le reste
 * (rapprochement, évaluation, doublons) est le vrai moteur.
 */

vi.mock('../../../services/property-service', () => ({
  createProperty: vi.fn(),
  listProperties: vi.fn()
}));

vi.mock('../../../services/patrimoine-service', () => ({
  createValuation: vi.fn()
}));

vi.mock('../../../services/geographic-service', () => ({
  getAllCommunes: vi.fn()
}));

import { createProperty } from '../../../services/property-service';
import { createValuation } from '../../../services/patrimoine-service';
import { PropertyType } from '../../../types/property-types';
import { TYPES_MASQUES } from '../../../components/properties/PropertyTypeSelector';
import {
  BIENS,
  DESCRIPTEURS_PATRIMOINE,
  VALORISATIONS,
  trouverDescripteurPatrimoine
} from '../../../lib/importation/natures-patrimoine';
import { DESCRIPTEURS } from '../../../lib/importation/natures';
import { MODES_DE_TRANSACTION, TYPES_DE_BIEN } from '../../../lib/importation/listes-patrimoine';
import { entreesReferentiel } from '../../../lib/importation/referentiel';
import { evaluerLigne, marquerDoublons, proposerRapprochement } from '../../../lib/importation/rapprochement';
import { ErreurPartielle } from '../../../lib/importation/execution';
import { rapprocherLibelle } from '../../../lib/importation/valeurs';
import { REFERENTIEL_VIDE } from '../../../lib/importation/types';
import type { ContexteImportation, DescripteurNature } from '../../../lib/importation/types';
import type { GeographicLocation } from '../../../services/geographic-service';

const TENANT = 'agence-1';

const COCODY_ABIDJAN: GeographicLocation = {
  id: 'loc-1',
  country: 'Côte d’Ivoire',
  countryId: 'ci',
  region: 'Abidjan',
  regionId: 'reg-abj',
  commune: 'Cocody',
  communeId: 'com-cocody-abj',
  displayName: 'Cocody, Abidjan, Côte d’Ivoire',
  searchText: 'cocody abidjan'
};
const COCODY_BOUAKE: GeographicLocation = {
  ...COCODY_ABIDJAN,
  id: 'loc-2',
  region: 'Bouaké',
  regionId: 'reg-bke',
  communeId: 'com-cocody-bke',
  displayName: 'Cocody, Bouaké, Côte d’Ivoire'
};
const PLATEAU: GeographicLocation = {
  ...COCODY_ABIDJAN,
  id: 'loc-3',
  commune: 'Plateau',
  communeId: 'com-plateau',
  displayName: 'Plateau, Abidjan, Côte d’Ivoire'
};

function contexte(surcharges: Partial<ContexteImportation> = {}, communes = [COCODY_ABIDJAN, PLATEAU]) {
  return {
    tenantId: TENANT,
    siteId: null,
    dateParDefaut: '2026-10-01',
    referentiel: {
      ...REFERENTIEL_VIDE,
      communes,
      biens: [
        {
          id: 'bien-1',
          internalReference: 'BIEN-001',
          title: 'Villa des Lilas',
          address: 'Rue 12',
          tenantId: TENANT,
          referenceExterne: 'REF-A'
        },
        { id: 'bien-2', internalReference: 'BIEN-002', title: 'Résidence Soleil', address: '', tenantId: TENANT },
        { id: 'bien-3', internalReference: 'BIEN-003', title: 'Résidence Soleil', address: '', tenantId: TENANT }
      ]
    },
    ...surcharges
  } satisfies ContexteImportation;
}

function textesBien(surcharges: Record<string, string> = {}): Record<string, string> {
  return {
    reference: 'B-1',
    title: 'Villa des Lilas (fictive)',
    propertyType: 'Maison / Villa',
    address: 'Rue 12',
    commune: 'Cocody Abidjan',
    locationZone: 'Riviera',
    surfaceArea: '250',
    rooms: '5',
    transactionMode: 'Vente',
    acquisitionPrice: '1 250 000,50',
    acquisitionDate: '15/03/2022',
    ...surcharges
  };
}

function evaluerBien(surcharges: Record<string, string> = {}, ctx = contexte(), numero = 2) {
  return evaluerLigne(BIENS, numero, textesBien(surcharges), ctx);
}

function textesValorisation(surcharges: Record<string, string> = {}): Record<string, string> {
  return {
    bien: 'BIEN-001',
    valuatedAt: '30/06/2026',
    estimatedValue: '95 000 000',
    acquisitionCost: '',
    acquisitionDate: '',
    method: '',
    source: '',
    ...surcharges
  };
}

function evaluerValorisation(surcharges: Record<string, string> = {}, numero = 2) {
  return evaluerLigne(VALORISATIONS, numero, textesValorisation(surcharges), contexte());
}

beforeEach(() => {
  vi.mocked(createProperty).mockReset();
  vi.mocked(createValuation).mockReset();
});

describe('registre', () => {
  it('expose deux descripteurs, hors des natures finance', () => {
    expect(DESCRIPTEURS_PATRIMOINE).toEqual([BIENS, VALORISATIONS]);
    expect(BIENS.cle).toBe('patrimoine-biens');
    expect(VALORISATIONS.cle).toBe('patrimoine-valorisations');
    expect(BIENS.chantier).toBe('sans');
    expect(VALORISATIONS.chantier).toBe('sans');
    expect(trouverDescripteurPatrimoine('patrimoine-biens')).toBe(BIENS);
    expect(trouverDescripteurPatrimoine('inconnue')).toBeUndefined();
    const clesFinance = DESCRIPTEURS.map(descripteur => descripteur.cle);
    expect(clesFinance).not.toContain('patrimoine-biens');
    expect(clesFinance).not.toContain('patrimoine-valorisations');
  });

  it('chaque champ porte des en-têtes et un exemple fictif', () => {
    for (const descripteur of DESCRIPTEURS_PATRIMOINE) {
      for (const champ of descripteur.champs) {
        expect(champ.entetes.length, `${descripteur.cle}.${champ.cle}`).toBeGreaterThan(0);
        expect(champ.exemple, `${descripteur.cle}.${champ.cle}`).toBeTruthy();
      }
    }
  });
});

describe('listes fermées', () => {
  it('TYPES_DE_BIEN = tous les PropertyType sauf TYPES_MASQUES', () => {
    const attendus = Object.values(PropertyType)
      .filter(type => !TYPES_MASQUES.includes(type))
      .sort();
    expect(TYPES_DE_BIEN.map(type => type.code).sort()).toEqual(attendus);
    expect(TYPES_DE_BIEN).toHaveLength(10);
  });

  it('fonctionnent avec un référentiel vide', () => {
    expect(entreesReferentiel('typesBien', REFERENTIEL_VIDE)).toHaveLength(10);
    expect(entreesReferentiel('modesTransaction', REFERENTIEL_VIDE)).toHaveLength(MODES_DE_TRANSACTION.length);
    expect(entreesReferentiel('methodesValorisation', REFERENTIEL_VIDE).map(entree => entree.id)).toEqual([
      'MANUAL',
      'MARKET_ESTIMATE',
      'EXPERT_APPRAISAL'
    ]);
  });
});

describe('rapprocherLibelle avec exacte', () => {
  const entrees = [
    { id: 'a', libelle: 'Cocody', alias: ['Cocody Abidjan'] },
    { id: 'b', libelle: 'Cocody', alias: ['Cocody Bouaké'] },
    { id: 'c', libelle: 'Plateau' }
  ];

  it('saute l’inclusion', () => {
    expect(rapprocherLibelle(entrees, 'Plat')).toEqual({ trouve: true, entree: entrees[2] });
    expect(rapprocherLibelle(entrees, 'Plat', { exacte: true })).toEqual({ trouve: false, motif: 'introuvable' });
  });

  it('rend ambigu quand plusieurs égalités', () => {
    expect(rapprocherLibelle(entrees, 'cocody', { exacte: true })).toEqual({ trouve: false, motif: 'ambigu' });
    expect(rapprocherLibelle(entrees, 'Cocody Bouaké', { exacte: true })).toEqual({ trouve: true, entree: entrees[1] });
  });
});

describe('BIENS — validation', () => {
  it('accepte une ligne complète et la convertit', () => {
    const ligne = evaluerBien();
    expect(ligne.erreurs).toEqual([]);
    expect(ligne.cellules.propertyType.valeur).toBe(PropertyType.MAISON_VILLA);
    expect(ligne.cellules.commune.valeur).toBe('com-cocody-abj');
    expect(ligne.cellules.transactionMode.valeur).toBe('SALE');
    expect(ligne.cellules.acquisitionPrice.valeur).toBe(1250000.5);
    expect(ligne.cellules.acquisitionDate.valeur).toBe('2022-03-15');
  });

  it('accepte une ligne minimale', () => {
    const ligne = evaluerBien({
      reference: '',
      address: '',
      locationZone: '',
      surfaceArea: '',
      rooms: '',
      acquisitionPrice: '',
      acquisitionDate: ''
    });
    expect(ligne.erreurs).toEqual([]);
  });

  it('refuse les obligatoires vides', () => {
    const ligne = evaluerBien({ title: '', propertyType: '', commune: '', transactionMode: '' });
    expect(ligne.erreurs).toHaveLength(4);
  });

  it('refuse un type ou un mode inconnu', () => {
    expect(evaluerBien({ propertyType: 'Château' }).erreurs[0]).toContain('Château');
    expect(evaluerBien({ transactionMode: 'Troc' }).erreurs[0]).toContain('Troc');
  });

  it('reconnaît les alias usuels', () => {
    expect(evaluerBien({ propertyType: 'villa' }).cellules.propertyType.valeur).toBe('MAISON_VILLA');
    expect(evaluerBien({ propertyType: 'Local commercial' }).cellules.propertyType.valeur).toBe('BOUTIQUE_COMMERCIAL');
    expect(evaluerBien({ propertyType: 'box' }).cellules.propertyType.valeur).toBe('PARKING_BOX');
    expect(evaluerBien({ transactionMode: 'à louer' }).cellules.transactionMode.valeur).toBe('RENTAL');
    expect(evaluerBien({ transactionMode: 'saisonnière' }).cellules.transactionMode.valeur).toBe('SHORT_TERM');
  });

  it('commune : introuvable, ambiguë, exacte uniquement', () => {
    expect(evaluerBien({ commune: 'Yopougon' }).erreurs[0]).toContain('introuvable');
    // « Plat » est inclus dans « Plateau » : refusé, la correspondance est exacte.
    expect(evaluerBien({ commune: 'Plat' }).erreurs[0]).toContain('introuvable');

    const deuxCocody = contexte({}, [COCODY_ABIDJAN, COCODY_BOUAKE]);
    expect(evaluerBien({ commune: 'Cocody' }, deuxCocody).erreurs[0]).toContain('plusieurs');
    expect(evaluerBien({ commune: 'Cocody Bouaké' }, deuxCocody).cellules.commune.valeur).toBe('com-cocody-bke');
  });

  it('terrain : la surface est obligatoire', () => {
    const sans = evaluerBien({ propertyType: 'Terrain', surfaceArea: '' });
    expect(sans.erreurs).toEqual(['La surface est obligatoire pour un terrain.']);
    expect(evaluerBien({ propertyType: 'Terrain', surfaceArea: '400' }).erreurs).toEqual([]);
  });

  it('BUG-014 : refuse une surface aberrante (1 000 000 m²) avec un message clair', () => {
    const ligne = evaluerBien({ surfaceArea: '1000000' });
    expect(ligne.erreurs).toHaveLength(1);
    expect(ligne.erreurs[0]).toContain('maximum plausible');
    expect(evaluerBien({ surfaceArea: '500000' }).erreurs).toEqual([]);
  });

  it('BUG-014 : « Montant » n’est jamais rapproché de « Surface (m²) »', () => {
    const rapprochement = proposerRapprochement(
      ['Nom du bien', 'Categorie', 'Commune', 'Transaction', 'Montant'],
      BIENS.champs
    );
    expect(rapprochement).not.toContain('surfaceArea');
    expect(rapprochement[4]).toBeNull();
    expect(proposerRapprochement(['Surface', 'm²'], BIENS.champs)[0]).toBe('surfaceArea');
  });

  it('refuse une date d’acquisition sans prix', () => {
    const ligne = evaluerBien({ acquisitionPrice: '' });
    expect(ligne.erreurs).toEqual(['Une date d’acquisition exige un prix d’acquisition.']);
  });

  it('refuse une date d’acquisition future', () => {
    const ligne = evaluerBien({ acquisitionDate: '02/10/2026' });
    expect(ligne.erreurs[0]).toContain('futur');
    expect(evaluerBien({ acquisitionDate: '01/10/2026' }).erreurs).toEqual([]);
  });

  it('refuse un prix nul ou négatif, et des pièces négatives', () => {
    expect(evaluerBien({ acquisitionPrice: '0', acquisitionDate: '' }).erreurs[0]).toContain('nul');
    expect(evaluerBien({ acquisitionPrice: '-5' }).erreurs[0]).toContain('négatif');
    expect(evaluerBien({ rooms: '-1' }).erreurs[0]).toContain('négatif');
    expect(evaluerBien({ rooms: '2,5' }).erreurs[0]).toContain('entier');
  });

  it('refuse les formules en tête de champ texte', () => {
    for (const champ of ['title', 'address', 'reference', 'locationZone']) {
      for (const valeur of ['=1+1', '  @SOMME(A1)', '＝A1', '\t=x']) {
        const ligne = evaluerBien({ [champ]: valeur });
        expect(
          ligne.erreurs.some(erreur => erreur.includes('formule refusée')),
          `${champ} ${valeur}`
        ).toBe(true);
      }
    }
    // Un tiret ou un plus ne sont pas refusés.
    expect(evaluerBien({ title: '- Villa' }).erreurs).toEqual([]);
  });

  it('limite le titre et l’adresse', () => {
    expect(evaluerBien({ title: 'x'.repeat(201) }).erreurs[0]).toContain('200');
    expect(evaluerBien({ title: 'x'.repeat(200) }).erreurs).toEqual([]);
    expect(evaluerBien({ address: 'x'.repeat(501) }).erreurs[0]).toContain('500');
  });

  it('lit les nombres français et les dates JJ/MM/AAAA', () => {
    const ligne = evaluerBien({ acquisitionPrice: '1 250 000,50 F CFA', acquisitionDate: '05/01/2020' });
    expect(ligne.cellules.acquisitionPrice.valeur).toBe(1250000.5);
    expect(ligne.cellules.acquisitionDate.valeur).toBe('2020-01-05');
  });
});

describe('BIENS — doublons', () => {
  it('signale un doublon interne par référence', () => {
    const lignes = [
      evaluerBien({ reference: 'B-1', title: 'Un' }, contexte(), 2),
      evaluerBien({ reference: 'b 1', title: 'Deux' }, contexte(), 3)
    ];
    const rendu = marquerDoublons(BIENS, lignes, contexte(), []);
    expect(rendu[0].doublon).toBeNull();
    expect(rendu[1].doublon).toBe('Identique à la ligne 2 de ce fichier.');
  });

  it('signale un doublon interne par titre et adresse', () => {
    const lignes = [
      evaluerBien({ reference: '', title: 'Villa Rose' }, contexte(), 2),
      evaluerBien({ reference: 'AUTRE', title: 'VILLA ROSE' }, contexte(), 3)
    ];
    const rendu = marquerDoublons(BIENS, lignes, contexte(), []);
    expect(rendu[1].doublon).toBe('Identique à la ligne 2 de ce fichier.');
  });

  it('un même titre à une autre adresse n’est pas un doublon', () => {
    const lignes = [
      evaluerBien({ reference: '', title: 'Villa Rose', address: 'Rue 1' }, contexte(), 2),
      evaluerBien({ reference: '', title: 'Villa Rose', address: 'Rue 2' }, contexte(), 3)
    ];
    expect(marquerDoublons(BIENS, lignes, contexte(), []).map(ligne => ligne.doublon)).toEqual([null, null]);
  });

  it('signale un doublon en base, par référence interne puis externe, puis par titre et adresse', async () => {
    const ctx = contexte();
    const enBase = await BIENS.chargerEmpreintes!(ctx);
    const lignes = [
      evaluerBien({ reference: 'BIEN-001', title: 'Nouveau 1' }, ctx, 2),
      evaluerBien({ reference: 'ref a', title: 'Nouveau 2' }, ctx, 3),
      evaluerBien({ reference: '', title: 'villa des lilas', address: 'rue 12' }, ctx, 4),
      evaluerBien({ reference: 'NEUF', title: 'Tout neuf' }, ctx, 5)
    ];
    const rendu = marquerDoublons(BIENS, lignes, ctx, enBase);
    expect(rendu[0].doublon).toBe('Cette référence est déjà utilisée par un bien de l’agence.');
    expect(rendu[1].doublon).toBe('Cette référence est déjà utilisée par un bien de l’agence.');
    expect(rendu[2].doublon).toBe('Un bien du même titre et de la même adresse existe déjà.');
    expect(rendu[3].doublon).toBeNull();
  });

  it('ne signale pas une ligne en erreur', () => {
    const ctx = contexte();
    const lignes = [evaluerBien({ commune: 'Nulle part', reference: 'BIEN-001' }, ctx, 2)];
    expect(marquerDoublons(BIENS, lignes, ctx, ['ref:bien 001'])[0].doublon).toBeNull();
  });
});

describe('BIENS — enregistrer', () => {
  function bienCree(surcharges = {}) {
    return { id: 'nouveau-1', internalReference: 'BIEN-009', ...surcharges } as never;
  }

  it('crée un bien de l’agence avec la valorisation d’acquisition', async () => {
    vi.mocked(createProperty).mockResolvedValue(bienCree());
    vi.mocked(createValuation).mockResolvedValue({} as never);
    const ctx = contexte();
    const ligne = evaluerBien({}, ctx);

    const detail = await BIENS.enregistrer(valeurs(ligne), ctx);

    expect(detail).toBe('BIEN-009');
    expect(createProperty).toHaveBeenCalledTimes(1);
    expect(createProperty).toHaveBeenCalledWith(TENANT, {
      propertyType: 'MAISON_VILLA',
      ownershipType: 'TENANT',
      title: 'Villa des Lilas (fictive)',
      description: '',
      address: 'Rue 12',
      locationZone: 'Riviera',
      transactionModes: ['SALE'],
      currency: 'CFA',
      surfaceArea: 250,
      rooms: 5,
      typeSpecificData: {
        country: 'Côte d’Ivoire',
        countryId: 'ci',
        region: 'Abidjan',
        regionId: 'reg-abj',
        commune: 'Cocody',
        communeId: 'com-cocody-abj',
        referenceImport: 'B-1'
      }
    });
    const envoye = vi.mocked(createProperty).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(envoye).not.toHaveProperty('ownerUserId');
    expect(envoye).not.toHaveProperty('ownerEmail');
    expect(envoye).not.toHaveProperty('tenantId');

    expect(createValuation).toHaveBeenCalledWith(TENANT, 'nouveau-1', {
      valuatedAt: '2022-03-15',
      estimatedValue: 1250000.5,
      acquisitionCost: 1250000.5,
      acquisitionDate: '2022-03-15',
      method: 'MANUAL',
      notes: "Valeur d'acquisition importée"
    });
  });

  it('sans prix : aucune valorisation ; champs facultatifs absents', async () => {
    vi.mocked(createProperty).mockResolvedValue(bienCree());
    const ctx = contexte();
    const ligne = evaluerBien(
      {
        reference: '',
        address: '',
        locationZone: '',
        surfaceArea: '',
        rooms: '',
        acquisitionPrice: '',
        acquisitionDate: ''
      },
      ctx
    );

    await BIENS.enregistrer(valeurs(ligne), ctx);

    expect(createValuation).not.toHaveBeenCalled();
    const envoye = vi.mocked(createProperty).mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(envoye).not.toHaveProperty('address');
    expect(envoye).not.toHaveProperty('surfaceArea');
    expect(envoye).not.toHaveProperty('rooms');
    expect(envoye.typeSpecificData).not.toHaveProperty('referenceImport');
  });

  it('valorise à la date par défaut quand seule la valeur est connue', async () => {
    vi.mocked(createProperty).mockResolvedValue(bienCree());
    vi.mocked(createValuation).mockResolvedValue({} as never);
    const ctx = contexte();
    const ligne = evaluerBien({ acquisitionDate: '' }, ctx);
    // La règle « date sans prix » ne vise pas l'inverse : un prix seul est valide.
    expect(ligne.erreurs).toEqual([]);

    await BIENS.enregistrer(valeurs(ligne), ctx);

    const charge = vi.mocked(createValuation).mock.calls[0][2] as Record<string, unknown>;
    expect(charge.valuatedAt).toBe('2026-10-01');
    expect(charge).not.toHaveProperty('acquisitionDate');
  });

  it('terrain : land_area et surfaceTerrain', async () => {
    vi.mocked(createProperty).mockResolvedValue(bienCree());
    vi.mocked(createValuation).mockResolvedValue({} as never);
    const ctx = contexte();
    const ligne = evaluerBien({ propertyType: 'Terrain', surfaceArea: '400' }, ctx);

    await BIENS.enregistrer(valeurs(ligne), ctx);

    const envoye = vi.mocked(createProperty).mock.calls[0][1] as Record<string, any>;
    expect(envoye.propertyType).toBe('TERRAIN');
    expect(envoye.surfaceTerrain).toBe(400);
    expect(envoye.typeSpecificData.land_area).toBe(400);
  });

  it('lève ErreurPartielle quand la valorisation est refusée, bien déjà créé', async () => {
    vi.mocked(createProperty).mockResolvedValue(bienCree());
    vi.mocked(createValuation).mockRejectedValue({
      response: { status: 403, data: { message: 'Bien non détenu en propre.', code: 'OWN_ASSETS_ONLY' } }
    });
    const ctx = contexte();
    const ligne = evaluerBien({}, ctx);

    const erreur = await BIENS.enregistrer(valeurs(ligne), ctx).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ErreurPartielle);
    expect((erreur as ErreurPartielle).message).toContain('Bien créé (réf. BIEN-009)');
    expect((erreur as ErreurPartielle).message).toContain('Bien non détenu en propre.');
    expect((erreur as ErreurPartielle).message).toContain('Ne relancez pas cette ligne');
    expect((erreur as ErreurPartielle).code).toBe('OWN_ASSETS_ONLY');
    expect((erreur as ErreurPartielle).reference).toBe('BIEN-009');
    expect((erreur as ErreurPartielle).statut).toBe(403);
  });

  it('une commune disparue du référentiel donne une erreur claire, sans appel', async () => {
    const ligne = evaluerBien({}, contexte());
    const ctxSansCommune = contexte({}, []);

    await expect(BIENS.enregistrer(valeurs(ligne), ctxSansCommune)).rejects.toThrow(/commune/);
    expect(createProperty).not.toHaveBeenCalled();
  });

  it('un refus du serveur sur le bien remonte tel quel (pas d’ErreurPartielle)', async () => {
    const refus = { response: { status: 409, data: { message: 'Quota atteint.', code: 'QUOTA_EXCEEDED' } } };
    vi.mocked(createProperty).mockRejectedValue(refus);
    const ctx = contexte();

    await expect(BIENS.enregistrer(valeurs(evaluerBien({}, ctx)), ctx)).rejects.toBe(refus);
    expect(createValuation).not.toHaveBeenCalled();
  });
});

describe('VALORISATIONS — validation et rattachement', () => {
  it('accepte une ligne nominale et rattache par référence', () => {
    const ligne = evaluerValorisation();
    expect(ligne.erreurs).toEqual([]);
    expect(ligne.cellules.bien.valeur).toBe('bien-1');
    expect(ligne.cellules.valuatedAt.valeur).toBe('2026-06-30');
    expect(ligne.cellules.estimatedValue.valeur).toBe(95000000);
  });

  it('rattache par titre exact et par référence du fichier d’import', () => {
    expect(evaluerValorisation({ bien: 'villa des lilas' }).cellules.bien.valeur).toBe('bien-1');
    expect(evaluerValorisation({ bien: 'REF-A' }).cellules.bien.valeur).toBe('bien-1');
  });

  it('refuse un bien ambigu ou introuvable, sans approximation', () => {
    expect(evaluerValorisation({ bien: 'Résidence Soleil' }).erreurs[0]).toContain('plusieurs');
    expect(evaluerValorisation({ bien: 'Villa' }).erreurs[0]).toContain('introuvable');
    expect(evaluerValorisation({ bien: 'BIEN-999' }).erreurs[0]).toContain('introuvable');
  });

  it('exige la date, sans valeur par défaut, et la valeur', () => {
    const ligne = evaluerValorisation({ valuatedAt: '', estimatedValue: '' });
    expect(ligne.erreurs).toHaveLength(2);
  });

  it('refuse une date future, une valeur nulle ou négative, un coût nul', () => {
    expect(evaluerValorisation({ valuatedAt: '02/10/2026' }).erreurs[0]).toContain('futur');
    expect(evaluerValorisation({ estimatedValue: '0' }).erreurs[0]).toContain('supérieure à zéro');
    expect(evaluerValorisation({ estimatedValue: '-10' }).erreurs[0]).toContain('négatif');
    expect(evaluerValorisation({ acquisitionCost: '0' }).erreurs[0]).toContain('supérieur à zéro');
  });

  it('refuse une date d’acquisition postérieure au jour', () => {
    const ligne = evaluerValorisation({ acquisitionDate: '02/10/2026' });
    expect(ligne.erreurs[0]).toContain('date passée ou du jour');
    expect(evaluerValorisation({ acquisitionDate: '01/10/2026' }).erreurs).toHaveLength(0);
  });

  it('refuse une formule dans la source', () => {
    expect(evaluerValorisation({ source: '=HYPERLINK("x")' }).erreurs[0]).toContain('formule refusée');
    expect(evaluerValorisation({ source: '@x' }).erreurs[0]).toContain('formule refusée');
  });

  it('méthode : par libellé ou alias, vide accepté', () => {
    expect(evaluerValorisation({ method: 'expert' }).cellules.method.valeur).toBe('EXPERT_APPRAISAL');
    expect(evaluerValorisation({ method: 'estimation' }).cellules.method.valeur).toBe('MARKET_ESTIMATE');
    expect(evaluerValorisation({ method: '' }).erreurs).toEqual([]);
  });

  it('plusieurs valorisations du même bien sont permises, un doublon exact est signalé', () => {
    const lignes = [
      evaluerValorisation({ valuatedAt: '30/06/2025' }, 2),
      evaluerValorisation({ valuatedAt: '30/06/2026' }, 3),
      evaluerValorisation({ valuatedAt: '30/06/2026' }, 4)
    ];
    const rendu = marquerDoublons(VALORISATIONS, lignes, contexte(), []);
    expect(rendu.map(ligne => ligne.doublon)).toEqual([null, null, 'Identique à la ligne 3 de ce fichier.']);
    expect(rendu.every(ligne => ligne.erreurs.length === 0 && ligne.selectionnee)).toBe(true);
    expect(VALORISATIONS.doublonImpossible).toContain('à l’intérieur du fichier');
  });
});

describe('VALORISATIONS — enregistrer', () => {
  it('appelle createValuation avec le bien résolu, sans devise', async () => {
    vi.mocked(createValuation).mockResolvedValue({} as never);
    const ctx = contexte();
    const ligne = evaluerLigne(
      VALORISATIONS,
      2,
      textesValorisation({
        acquisitionCost: '80 000 000',
        acquisitionDate: '01/02/2020',
        method: 'Expertise',
        source: 'Cabinet X'
      }),
      ctx
    );

    await VALORISATIONS.enregistrer(valeurs(ligne), ctx);

    expect(createValuation).toHaveBeenCalledWith(TENANT, 'bien-1', {
      valuatedAt: '2026-06-30',
      estimatedValue: 95000000,
      acquisitionCost: 80000000,
      acquisitionDate: '2020-02-01',
      method: 'EXPERT_APPRAISAL',
      notes: 'Source : Cabinet X'
    });
    expect(vi.mocked(createValuation).mock.calls[0][2]).not.toHaveProperty('currency');
  });

  it('méthode par défaut MANUAL, aucune clé facultative vide', async () => {
    vi.mocked(createValuation).mockResolvedValue({} as never);
    const ctx = contexte();
    await VALORISATIONS.enregistrer(valeurs(evaluerValorisation()), ctx);

    expect(createValuation).toHaveBeenCalledWith(TENANT, 'bien-1', {
      valuatedAt: '2026-06-30',
      estimatedValue: 95000000,
      method: 'MANUAL'
    });
  });
});

function valeurs(ligne: ReturnType<typeof evaluerLigne>) {
  const rendu: Record<string, string | number | null> = {};
  for (const [cle, cellule] of Object.entries(ligne.cellules)) rendu[cle] = cellule.valeur;
  return rendu;
}

// Garde-fou de typage : les deux natures respectent le contrat du moteur.
const _contrat: DescripteurNature[] = [BIENS, VALORISATIONS];
void _contrat;
