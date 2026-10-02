/**
 * L'importation de fichiers Excel, côté navigateur.
 *
 * Une seule porte d'entrée pour l'écran `pages/finance/Importation.tsx`, et
 * pour les tests : le détail de la découpe interne — descripteurs, lecture du
 * classeur, rapprochement, exécution — peut bouger sans qu'aucun import ne
 * change ailleurs.
 */

export type {
  BesoinChantier,
  CelluleEvaluee,
  ChampDocument,
  CleReferentiel,
  ContexteImportation,
  DescripteurNature,
  EntreeReferentiel,
  LigneEvaluee,
  Referentiel,
  TypeChamp,
  ValeursLigne
} from './types';
export { REFERENTIEL_VIDE } from './types';

export { DESCRIPTEURS, trouverDescripteur } from './natures';

export { chargerReferentiel, entreesReferentiel, libelleEntree } from './referentiel';

export {
  champsObligatoiresManquants,
  evaluerLigne,
  marquerDoublons,
  proposerRapprochement,
  scoreEntete,
  valeursDeLaLigne
} from './rapprochement';

export {
  decouperPeriode,
  nettoyerEntier,
  nettoyerMontant,
  normaliserTexte,
  rapprocherLibelle,
  versDateISO,
  versPeriodeISO
} from './valeurs';

export type { FeuilleLue } from './classeur';
export { lireClasseur, texteDeCellule } from './classeur';

export type { CompteRenduImport, OptionsExecution, ResultatLigne } from './execution';
export { executerImport, motifDeLErreur } from './execution';

// Les natures du patrimoine (spec 038), la lecture de fichier, les gabarits et le
// rapport ne passent PAS par ce fichier : la page finance l'importe, et elle ne
// doit pas embarquer ces modules. La page patrimoine les importe en direct.
export type { BienExistant } from './types';
