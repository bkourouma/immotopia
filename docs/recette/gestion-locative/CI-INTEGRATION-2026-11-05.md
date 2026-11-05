# Corrections après la CI d'intégration — 05/11/2026

Exécution de référence : [41992153460](https://github.com/bkourouma/immotopia/actions/runs/41992153460), source `483df0407b6d6c10acd3dff3a149fb45bdc5e7fc`, après intégration de main/#195.

## Résultat initial complet

- Infrastructure et typage/lint/build web réussis.
- Isolation : 339 tests réussis sur base dédiée, lanceur séquentiel bloquant.
- API générale : 12 312 réussites, 9 échecs, 361 ignorés ; 724 suites réussies, 3 échouées, 26 ignorées.
- Web : 5 277 réussites, 15 échecs sur 5 292 ; 510 fichiers réussis et 7 échoués. Les 11 tests Signatures passent.

## Corrections et portée

| Écart                                                          | Correction                                                                                                                                                                           | Vérification ciblée                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Tests propriétaires attendent encore un filtre scalaire        | Attentes alignées sur les listes d'identifiants ; les cas hors périmètre vérifient un retour vide et l'absence d'appel Prisma. L'identifiant de bail étranger est un UUID valide.    | 30 tests de filtres et 10 tests recherche/périmètre passent.         |
| Recherche de bail sur espaces seuls                            | Nettoyage de la recherche rétabli avant construction de la clause, conservation du `AND` et du périmètre de #195.                                                                    | Rejeu recherche/périmètre inclus ci-dessus.                          |
| Déclarations de paiement montées sans routeur                  | `MemoryRouter` ajouté aux tests d'export et de montants, désormais nécessaires au hook de recherche.                                                                                 | Les deux fichiers passent.                                           |
| Anciens liens de documents ignorés                             | Lecture de `doc_status` et `doc_page` en repli des nouvelles clés pointées ; migration des clés à l'action suivante, priorité au format actuel.                                      | Tests du hook et de génération documentaire passent.                 |
| Statuts remboursés perdus dans les critères                    | Remboursé et Partiellement remboursé rétablis dans les options de recherche.                                                                                                         | Tests des paiements passent.                                         |
| Paramètres financiers bloqués au chargement dans les tests     | Mock explicite de la lecture des permissions, avec VIEW/EDIT pour l'administrateur ; assertions conservées.                                                                          | Fichier paramètres financiers passe.                                 |
| Refus de lecture des relevés remplacé par un message générique | Message API traduit conservé ; tableau masqué sur refus, sans faux état vide. Test aligné sur l'appel paginé réel.                                                                   | Test de refus passe.                                                 |
| Test Syndic intermittent                                       | Cas passé localement en 3,8 s ; préconditions du formulaire prérempli vérifiées avant soumission. Délai d'attente de l'écriture conservé à 15 s, aucune modification produit Syndic. | Suite locale passée ; rejeu ciblé des préconditions avant livraison. |

## Blocage ancien levé : biens du relevé propriétaire

BUG-2026-11-03-028 était bloqué parce qu'il demandait une route absente, hors de l'ancien périmètre. La reprise autorise cette correction : lookup minimal sous `OWNER_STATEMENTS_EDIT`, contact et biens limités à l'agence, même éligibilité que la génération, sélection effacée au changement de propriétaire et réponses périmées ignorées.

Le test réel a révélé deux requêtes intermédiaires `Property` sans `tenantId`. L'option interne `restrictToTenantProperties` borne désormais ces lectures pour le lookup ; le portail historique conserve son traitement des biens CLIENT sous mandat. Relecture code/sécurité : aucun constat restant. Tests et retests détaillés dans le rapport dédié aux relevés propriétaires.

Le classeur et son miroir comptent 1 158 sous-fonctionnalités, le catalogue IA 787 routes. Les nouvelles exécutions de CI et le déploiement se consultent dans la PR #193. Les tests ignorés et les limites manuelles ne sont pas assimilés à des réussites.
