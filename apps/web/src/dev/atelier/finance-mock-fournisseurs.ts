/**
 * Atelier — fausse API du volet « fournisseurs », lot 2.
 *
 * Ce fichier appartient en entier a l'agent qui construit ces ecrans : jeux
 * d'essai ET reponses. Les gestionnaires sont separes, un par volet, pour
 * qu'aucun agent n'ait a modifier le fichier d'un autre — la lecon du lot 1.
 *
 * Il renvoie `null` quand l'URL ne le concerne pas ; `mock-api.ts` passe alors
 * au gestionnaire suivant.
 */

import type { Scenario } from './mock-api';

export function repondreFournisseurs(chemin: string, scenario: Scenario): unknown | null {
  void chemin;
  void scenario;
  return null;
}
