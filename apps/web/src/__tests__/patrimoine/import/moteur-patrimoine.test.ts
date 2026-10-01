import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le moteur d'import, côté patrimoine : chargement des biens de l'agence,
 * exécution ligne à ligne (refus, quota, limite de débit, interruption,
 * écriture à moitié faite).
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

import { listProperties } from '../../../services/property-service';
import { getAllCommunes } from '../../../services/geographic-service';
import { chargerReferentiel, entreesReferentiel } from '../../../lib/importation/referentiel';
import { ErreurAvantEnvoi, ErreurPartielle, executerImport } from '../../../lib/importation/execution';
import { evaluerLigne } from '../../../lib/importation/rapprochement';
import { nettoyerMontant, rapprocherLibelle, versDateISO } from '../../../lib/importation/valeurs';
import { REFERENTIEL_VIDE } from '../../../lib/importation/types';
import type { DescripteurNature, LigneEvaluee } from '../../../lib/importation/types';

const TENANT = 'agence-1';

function bien(id: string, tenantId: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    id,
    internalReference: `REF-${id}`,
    title: `Titre ${id}`,
    address: `Adresse ${id}`,
    tenantId,
    typeSpecificData: undefined,
    ...extra
  };
}

describe('chargerReferentiel — biens et communes', () => {
  beforeEach(() => {
    vi.mocked(listProperties).mockReset();
    vi.mocked(getAllCommunes).mockReset();
  });

  it('parcourt toutes les pages et ne garde que les biens de l’agence', async () => {
    vi.mocked(listProperties)
      .mockResolvedValueOnce({
        properties: [bien('a', TENANT), bien('etranger', 'autre-agence'), bien('sans-agence', undefined)],
        pagination: { page: 1, limit: 1000, total: 4, totalPages: 2 }
      } as never)
      .mockResolvedValueOnce({
        properties: [bien('b', TENANT, { typeSpecificData: { referenceImport: 'IMP-7' } })],
        pagination: { page: 2, limit: 1000, total: 4, totalPages: 2 }
      } as never);

    const referentiel = await chargerReferentiel(TENANT, ['biens']);

    expect(listProperties).toHaveBeenCalledTimes(2);
    expect(listProperties).toHaveBeenNthCalledWith(1, TENANT, { limit: 1000, page: 1, ownershipType: 'TENANT' });
    expect(listProperties).toHaveBeenNthCalledWith(2, TENANT, { limit: 1000, page: 2, ownershipType: 'TENANT' });
    expect(referentiel.biens.map(b => b.id)).toEqual(['a', 'b']);
    expect(referentiel.biens[0]).toEqual({
      id: 'a',
      internalReference: 'REF-a',
      title: 'Titre a',
      address: 'Adresse a',
      tenantId: TENANT,
      referenceExterne: null
    });
    expect(referentiel.biens[1].referenceExterne).toBe('IMP-7');
    expect(getAllCommunes).not.toHaveBeenCalled();
  });

  it('lève une erreur claire au garde-fou de 100 pages au lieu de tronquer', async () => {
    vi.mocked(listProperties).mockResolvedValue({
      properties: [bien('x', TENANT)],
      pagination: { page: 1, limit: 1000, total: 99999, totalPages: 999 }
    } as never);

    await expect(chargerReferentiel(TENANT, ['biens'])).rejects.toThrow('Trop de biens pour un import');
    expect(listProperties).toHaveBeenCalledTimes(100);
  });

  it('s’arrête après une seule page quand la pagination est absente', async () => {
    vi.mocked(listProperties).mockResolvedValue({ properties: [bien('a', TENANT)] } as never);
    const referentiel = await chargerReferentiel(TENANT, ['biens']);
    expect(listProperties).toHaveBeenCalledTimes(1);
    expect(referentiel.biens).toHaveLength(1);
  });

  it('charge les communes sans toucher aux biens', async () => {
    vi.mocked(getAllCommunes).mockResolvedValue([
      {
        id: 'l1',
        country: 'Côte d’Ivoire',
        countryId: 'ci',
        region: 'Abidjan',
        regionId: 'r1',
        commune: 'Cocody',
        communeId: 'c1',
        displayName: 'Cocody, Abidjan',
        searchText: ''
      }
    ]);

    const referentiel = await chargerReferentiel(TENANT, ['communes', 'typesBien']);

    expect(referentiel.communes).toHaveLength(1);
    expect(listProperties).not.toHaveBeenCalled();
    expect(entreesReferentiel('communes', referentiel)[0]).toEqual({
      id: 'c1',
      libelle: 'Cocody',
      alias: ['Cocody, Abidjan', 'Cocody Abidjan', 'Cocody Côte d’Ivoire']
    });
  });

  it('entrées des biens : référence en libellé, titre et référence d’import en alias', () => {
    const entrees = entreesReferentiel('biens', {
      ...REFERENTIEL_VIDE,
      biens: [
        { id: '1', internalReference: 'R1', title: 'T1', address: '', tenantId: TENANT, referenceExterne: 'X' },
        { id: '2', internalReference: 'R2', title: 'T2', address: '', tenantId: TENANT, referenceExterne: null }
      ]
    });
    expect(entrees).toEqual([
      { id: '1', libelle: 'R1 — T1', alias: ['R1', 'T1', 'X'] },
      { id: '2', libelle: 'R2 — T2', alias: ['R2', 'T2'] }
    ]);
  });
});

// ---------------------------------------------------------------------------
// executerImport
// ---------------------------------------------------------------------------

function ligne(numero: number, surcharges: Partial<LigneEvaluee> = {}): LigneEvaluee {
  return {
    numero,
    selectionnee: true,
    cellules: { n: { texte: String(numero), valeur: numero } },
    erreurs: [],
    doublon: null,
    ...surcharges
  };
}

function descripteur(enregistrer: DescripteurNature['enregistrer']): DescripteurNature {
  return {
    cle: 'essai',
    libelle: 'Essai',
    description: '',
    chantier: 'sans',
    referentiels: [],
    champs: [],
    enregistrer
  };
}

const contexte = { tenantId: TENANT, siteId: null, dateParDefaut: '2026-10-01', referentiel: REFERENTIEL_VIDE };

function refus(status: number, message: string, code?: string) {
  return { response: { status, data: { message, ...(code ? { code } : {}) } } };
}

describe('executerImport — patrimoine', () => {
  it('une ligne en erreur ne bloque pas les autres', async () => {
    const enregistrer = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(refus(400, 'Surface invalide.'))
      .mockResolvedValueOnce(undefined);

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3), ligne(4)],
      contexte
    });

    expect(rendu.creees).toBe(2);
    expect(rendu.echouees).toEqual([{ numero: 3, motif: 'Surface invalide.' }]);
    expect(rendu.nonTraitees).toEqual([]);
    expect(rendu.interrompue).toBeNull();
    expect(enregistrer).toHaveBeenCalledTimes(3);
  });

  it('un 4xx isolé n’empêche pas le succès suivant', async () => {
    const enregistrer = vi.fn().mockRejectedValueOnce(refus(422, 'Titre refusé.')).mockResolvedValueOnce('BIEN-2');

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });

    expect(rendu.echouees).toEqual([{ numero: 2, motif: 'Titre refusé.' }]);
    expect(rendu.lignesCreees).toEqual([{ numero: 3, detail: 'BIEN-2' }]);
  });

  it('conserve le code d’un 409 QUOTA_EXCEEDED sans casser les lignes suivantes', async () => {
    const enregistrer = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(refus(409, 'Quota de biens atteint.', 'QUOTA_EXCEEDED'))
      .mockRejectedValueOnce(refus(409, 'Quota de biens atteint.', 'QUOTA_EXCEEDED'))
      .mockResolvedValueOnce(undefined);

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3), ligne(4), ligne(5)],
      contexte
    });

    expect(rendu.creees).toBe(2);
    expect(rendu.echouees).toEqual([
      { numero: 3, motif: 'Quota de biens atteint.', code: 'QUOTA_EXCEEDED' },
      { numero: 4, motif: 'Quota de biens atteint.', code: 'QUOTA_EXCEEDED' }
    ]);
    expect(rendu.interrompue).toBeNull();
    expect(enregistrer).toHaveBeenCalledTimes(4);
  });

  it('un 429 arrête tout : la ligne échoue, relançable, le reste est non traité', async () => {
    const enregistrer = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce({ response: { status: 429, data: {} } });

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3), ligne(4), ligne(5), ligne(6, { selectionnee: false })],
      contexte
    });

    expect(enregistrer).toHaveBeenCalledTimes(2);
    expect(rendu.creees).toBe(1);
    expect(rendu.interrompue).toBe('limite');
    expect(rendu.echouees).toHaveLength(1);
    expect(rendu.echouees[0]).toMatchObject({ numero: 3, code: 'RATE_LIMITED', relancable: true });
    expect(rendu.echouees[0].motif).toContain('Trop de requêtes');
    expect(rendu.nonTraitees).toEqual([4, 5]);
    expect(rendu.decochees).toBe(1);
  });

  it('un 429 garde le motif du serveur quand il en donne un', async () => {
    const enregistrer = vi.fn().mockRejectedValue(refus(429, 'Ralentissez.'));
    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });
    expect(rendu.echouees[0]).toMatchObject({ numero: 2, motif: 'Ralentissez.', code: 'RATE_LIMITED' });
    expect(rendu.nonTraitees).toEqual([3]);
  });

  it('interrompre() est testé avant chaque ligne', async () => {
    const enregistrer = vi.fn().mockResolvedValue(undefined);
    let appels = 0;

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3), ligne(4), ligne(5)],
      contexte,
      interrompre: () => {
        appels += 1;
        return appels > 2;
      }
    });

    expect(enregistrer).toHaveBeenCalledTimes(2);
    expect(rendu.creees).toBe(2);
    expect(rendu.interrompue).toBe('utilisateur');
    expect(rendu.nonTraitees).toEqual([4, 5]);
  });

  it('lignesCreees porte la référence rendue par enregistrer', async () => {
    const enregistrer = vi.fn().mockResolvedValueOnce('BIEN-010').mockResolvedValueOnce(undefined);

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });

    expect(rendu.lignesCreees).toEqual([
      { numero: 2, detail: 'BIEN-010' },
      { numero: 3, detail: null }
    ]);
  });

  it('une ErreurPartielle n’est pas relançable et ne stoppe pas la suite', async () => {
    const enregistrer = vi
      .fn()
      .mockRejectedValueOnce(new ErreurPartielle('Bien créé (réf. BIEN-9) ; valorisation refusée.', 'OWN_ASSETS_ONLY'))
      .mockResolvedValueOnce(undefined);

    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });

    expect(rendu.echouees).toEqual([
      {
        numero: 2,
        motif: 'Bien créé (réf. BIEN-9) ; valorisation refusée.',
        code: 'OWN_ASSETS_ONLY',
        relancable: false
      }
    ]);
    expect(rendu.creees).toBe(1);
  });

  it('n’ajoute ni code ni relancable à un refus ordinaire sans code', async () => {
    const enregistrer = vi.fn().mockRejectedValue(refus(400, 'Boum'));
    const rendu = await executerImport({ descripteur: descripteur(enregistrer), lignes: [ligne(2)], contexte });
    expect(rendu.echouees).toEqual([{ numero: 2, motif: 'Boum' }]);
    expect(Object.keys(rendu.echouees[0])).toEqual(['numero', 'motif']);
  });

  it('une erreur locale levée avant l’envoi reste un refus ordinaire relançable', async () => {
    const enregistrer = vi.fn().mockRejectedValue(new ErreurAvantEnvoi('Commune disparue.'));
    const rendu = await executerImport({ descripteur: descripteur(enregistrer), lignes: [ligne(2)], contexte });
    expect(rendu.echouees).toEqual([{ numero: 2, motif: 'Commune disparue.' }]);
  });

  it('une erreur sans réponse (délai, réseau) est incertaine et jamais relançable', async () => {
    const enregistrer = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))
      .mockResolvedValueOnce(undefined);
    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });
    expect(rendu.echouees).toEqual([
      {
        numero: 2,
        motif: 'La réponse du serveur n’est pas parvenue : vérifiez la liste des biens avant de relancer cette ligne.',
        code: 'REPONSE_INCERTAINE',
        relancable: false
      }
    ]);
    expect(rendu.creees).toBe(1);
    expect(rendu.interrompue).toBeNull();
  });

  it.each([502, 503, 504])('un HTTP %i sur une écriture est incertain', async statut => {
    const enregistrer = vi.fn().mockRejectedValue(refus(statut, 'Bad gateway'));
    const rendu = await executerImport({ descripteur: descripteur(enregistrer), lignes: [ligne(2)], contexte });
    expect(rendu.echouees[0]).toMatchObject({ code: 'REPONSE_INCERTAINE', relancable: false });
  });

  it('un HTTP 500 reste un refus ordinaire avec le motif du serveur', async () => {
    const enregistrer = vi.fn().mockRejectedValue(refus(500, 'Erreur interne.'));
    const rendu = await executerImport({ descripteur: descripteur(enregistrer), lignes: [ligne(2)], contexte });
    expect(rendu.echouees).toEqual([{ numero: 2, motif: 'Erreur interne.' }]);
  });

  it('un 429 sur la valorisation d’un bien interrompt l’import et garde la référence', async () => {
    const enregistrer = vi
      .fn()
      .mockRejectedValueOnce(new ErreurPartielle('Bien créé (réf. BIEN-9).', undefined, 'BIEN-9', 429))
      .mockResolvedValue(undefined);
    const rendu = await executerImport({
      descripteur: descripteur(enregistrer),
      lignes: [ligne(2), ligne(3)],
      contexte
    });
    expect(rendu.interrompue).toBe('limite');
    expect(rendu.nonTraitees).toEqual([3]);
    expect(rendu.echouees[0]).toMatchObject({ numero: 2, relancable: false, reference: 'BIEN-9' });
  });

  it('une ErreurPartielle copie sa référence dans le résultat de la ligne', async () => {
    const enregistrer = vi.fn().mockRejectedValue(new ErreurPartielle('À moitié.', 'OWN_ASSETS_ONLY', 'IMM-0007'));
    const rendu = await executerImport({ descripteur: descripteur(enregistrer), lignes: [ligne(2)], contexte });
    expect(rendu.echouees).toEqual([
      { numero: 2, motif: 'À moitié.', code: 'OWN_ASSETS_ONLY', relancable: false, reference: 'IMM-0007' }
    ]);
  });
});

describe('valeurs — durcissement', () => {
  it('refuse un signe resté à l’intérieur du montant', () => {
    expect(nettoyerMontant('1-2-3')).toBeNull();
    expect(nettoyerMontant('5+5')).toBeNull();
    expect(nettoyerMontant('-1 250,50')).toBe(-1250.5);
    expect(nettoyerMontant('+12 000')).toBe(12000);
  });

  it('refuse un montant de plus de 40 caractères', () => {
    expect(nettoyerMontant('1'.repeat(41))).toBeNull();
    expect(nettoyerMontant('1'.repeat(15))).toBe(Number('1'.repeat(15)));
  });

  it('refuse une année antérieure à 1900', () => {
    expect(versDateISO('01/01/1899')).toBeNull();
    expect(versDateISO('0026-03-12')).toBeNull();
    expect(versDateISO(new Date(1850, 0, 1))).toBeNull();
    expect(versDateISO('01/01/1900')).toBe('1900-01-01');
    expect(versDateISO('12/03/2026')).toBe('2026-03-12');
  });
});

describe('evaluerLigne — formules et performance', () => {
  const champs: DescripteurNature['champs'] = [
    { cle: 'montant', libelle: 'Montant', obligatoire: false, type: 'montant', entetes: [] },
    { cle: 'jour', libelle: 'Jour', obligatoire: false, type: 'date', entetes: [] },
    { cle: 'nb', libelle: 'Nombre', obligatoire: false, type: 'entier', entetes: [] },
    { cle: 'bien', libelle: 'Bien', obligatoire: false, type: 'reference', referentiel: 'biens', entetes: [] },
    { cle: 'note', libelle: 'Note', obligatoire: false, type: 'texte', entetes: [] }
  ];
  const desc: DescripteurNature = { ...descripteur(vi.fn()), champs };

  it('refuse « = » et « @ » en tête pour TOUS les types de champ', () => {
    for (const cle of ['montant', 'jour', 'nb', 'bien', 'note']) {
      for (const valeur of ['=A1+5000', '@SOMME(A1)']) {
        const ligne = evaluerLigne(desc, 2, { [cle]: valeur }, contexte);
        expect(ligne.cellules[cle].erreur, cle + ' ' + valeur).toContain('formule refusée');
        expect(ligne.cellules[cle].valeur).toBeNull();
      }
    }
  });

  it('réévalue 1 000 lignes sur 1 000 biens en moins de 1,5 s, sans changer le résultat', () => {
    const biens = Array.from({ length: 1000 }, (_, i) => ({
      id: 'b' + i,
      internalReference: 'IMM-' + String(i).padStart(4, '0'),
      title: 'Résidence ' + i,
      address: '',
      tenantId: TENANT,
      referenceExterne: null
    }));
    const ctx = { ...contexte, referentiel: { ...REFERENTIEL_VIDE, biens } };
    const debut = performance.now();
    let derniere = evaluerLigne(desc, 2, { bien: 'IMM-0000' }, ctx);
    for (let i = 0; i < 1000; i++) {
      derniere = evaluerLigne(desc, i + 2, { bien: 'IMM-' + String(i).padStart(4, '0') }, ctx);
    }
    expect(performance.now() - debut).toBeLessThan(1500);
    expect(derniere.cellules.bien).toMatchObject({ valeur: 'b999', libelleResolu: 'IMM-0999 — Résidence 999' });
    // Le titre résout aussi le bien, de façon exacte.
    expect(evaluerLigne(desc, 2, { bien: 'Résidence 12' }, ctx).cellules.bien.valeur).toBe('b12');
  });

  it('rapprocherLibelle garde son comportement (exacte, partielle, ambiguë)', () => {
    const entrees = [
      { id: '1', libelle: 'Gros œuvre' },
      { id: '2', libelle: 'Peinture murale' },
      { id: '3', libelle: 'Peinture sol' }
    ];
    expect(rapprocherLibelle(entrees, 'GROS-OEUVRE')).toEqual({ trouve: true, entree: entrees[0] });
    expect(rapprocherLibelle(entrees, 'peinture')).toEqual({ trouve: false, motif: 'ambigu' });
    expect(rapprocherLibelle(entrees, 'murale', { exacte: true })).toEqual({ trouve: false, motif: 'introuvable' });
    expect(rapprocherLibelle(entrees, 'Peinture sol et plafond')).toEqual({ trouve: true, entree: entrees[2] });
  });
});
