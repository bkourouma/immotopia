import { t } from '../../../i18n/t';

/**
 * Ancre d'extraction des libellés des natures d'import.
 *
 * Les descripteurs de `lib/importation/natures-patrimoine.ts` déclarent leurs
 * textes dans des objets de données (`libelle`, `aide`, `description`,
 * `doublonImpossible`), que `npm run i18n:extract` ne sait pas relire : sans
 * cette liste, leurs traductions partiraient dans `patrimoine.orphans.json` à
 * chaque extraction. Cette fonction n'est JAMAIS appelée (l'écran traduit au
 * rendu, par `t(champ.libelle)`) : elle ne sert qu'à recenser les clés.
 */
export function libellesDesNaturesAExtraire(): string[] {
  return [
    t(
      'Ajoute des valorisations à des biens existants, rattachés par leur référence ou leur titre exact ; plusieurs valorisations par bien sont permises.'
    ),
    t(
      'Appartement, Maison / Villa, Studio, Duplex / Triplex, Bureau, Boutique / Commercial, Entrepôt / Industriel, Terrain, Immeuble, Parking / Box.'
    ),
    t('Bien (référence ou titre)'),
    t(
      'Crée des biens détenus par l’agence, un par ligne, avec leur valeur d’acquisition facultative. Les baux et les locataires ne s’importent pas ici.'
    ),
    t('Date d’acquisition'),
    t('Date de la valorisation'),
    t('Estimation indicative : le serveur reste l’autorité.'),
    t('La référence attribuée par ImmoTopia, ou le titre exact du bien.'),
    t(
      'Les valorisations déjà enregistrées ne se lisent que bien par bien : seuls les doublons à l’intérieur du fichier sont signalés.'
    ),
    t('Manuelle (par défaut), Estimation de marché ou Expertise.'),
    t('Nom exact d’une commune du référentiel géographique ; le nom de la région peut aider : Cocody Abidjan.'),
    t('Quartier / zone'),
    t('Valorisations'),
    t('Vente, Location ou Location courte durée.'),
    t('Ville / commune')
  ];
}
