import { PropertyTransactionMode, PropertyType } from '../../types/property-types';

/**
 * Les listes FERMÉES de l'import du patrimoine.
 *
 * Statiques : elles ne coûtent aucun appel réseau et fonctionnent avec un
 * référentiel vide. Les libellés voyagent en français (clé de traduction) ;
 * c'est l'écran qui les passe par `t()`.
 *
 * `TYPES_DE_BIEN` reprend les types ouverts à la création d'un bien, c'est-à-dire
 * tous les `PropertyType` sauf `TYPES_MASQUES` de `PropertyTypeSelector.tsx`. Un
 * test (`natures-patrimoine.test.ts`) garde les deux listes alignées : la liste
 * n'importe pas le composant pour ne pas tirer React dans le moteur.
 */

export interface ElementDeListe<Code extends string = string> {
  /** La valeur envoyée au serveur. */
  code: Code;
  /** Libellé français. */
  libelle: string;
  /** Autres écritures usuelles, rapprochées par égalité normalisée. */
  alias: string[];
}

export const TYPES_DE_BIEN: ElementDeListe<PropertyType>[] = [
  { code: PropertyType.APPARTEMENT, libelle: 'Appartement', alias: ['appart', 'appartement meuble', 'flat'] },
  { code: PropertyType.MAISON_VILLA, libelle: 'Maison / Villa', alias: ['maison', 'villa', 'maison individuelle'] },
  { code: PropertyType.STUDIO, libelle: 'Studio', alias: ['studio meuble'] },
  { code: PropertyType.DUPLEX_TRIPLEX, libelle: 'Duplex / Triplex', alias: ['duplex', 'triplex'] },
  { code: PropertyType.BUREAU, libelle: 'Bureau', alias: ['bureaux', 'local professionnel', 'plateau de bureaux'] },
  {
    code: PropertyType.BOUTIQUE_COMMERCIAL,
    libelle: 'Boutique / Commercial',
    alias: ['boutique', 'commercial', 'local commercial', 'magasin', 'commerce']
  },
  {
    code: PropertyType.ENTREPOT_INDUSTRIEL,
    libelle: 'Entrepôt / Industriel',
    alias: ['entrepot', 'entrepôt', 'industriel', 'hangar', 'local industriel']
  },
  { code: PropertyType.TERRAIN, libelle: 'Terrain', alias: ['lot de terrain', 'parcelle', 'terrain nu'] },
  { code: PropertyType.IMMEUBLE, libelle: 'Immeuble', alias: ['immeuble de rapport', 'building'] },
  { code: PropertyType.PARKING_BOX, libelle: 'Parking / Box', alias: ['parking', 'box', 'garage', 'place de parking'] }
];

export const MODES_DE_TRANSACTION: ElementDeListe<PropertyTransactionMode>[] = [
  { code: PropertyTransactionMode.SALE, libelle: 'Vente', alias: ['à vendre', 'a vendre', 'vendre', 'vente'] },
  {
    code: PropertyTransactionMode.RENTAL,
    libelle: 'Location',
    alias: ['à louer', 'a louer', 'louer', 'bail', 'location longue durée']
  },
  {
    code: PropertyTransactionMode.SHORT_TERM,
    libelle: 'Location courte durée',
    alias: ['saisonnière', 'saisonniere', 'location saisonnière', 'courte durée', 'courte duree']
  }
];

export type MethodeDeValorisation = 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';

export const METHODES_DE_VALORISATION: ElementDeListe<MethodeDeValorisation>[] = [
  { code: 'MANUAL', libelle: 'Manuelle', alias: ['manuel', 'saisie manuelle', 'saisie'] },
  {
    code: 'MARKET_ESTIMATE',
    libelle: 'Estimation de marché',
    alias: ['estimation', 'estimation marché', 'marché', 'marche']
  },
  { code: 'EXPERT_APPRAISAL', libelle: 'Expertise', alias: ['expert', 'expertise', 'évaluation', 'evaluation'] }
];
