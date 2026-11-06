# Intégration de la recette locative avec main — 05/11/2026

Références : branche `orch/2026-11-03-recette-locatif`, correctifs de recette `189abda4`, intégration de `origin/main` à `cf6fead9` (PR #195). Remote : `https://github.com/bkourouma/immotopia.git`. Le checkout principal, ancien et modifié par ailleurs, n'a pas été utilisé pour les changements.

Les conflits ont été répartis par fichier et résolus sans choisir globalement une branche. Sont conservés :

- les recherches, filtres, exports et lecteurs comptables de #195 ;
- le lookup minimal des biens pour le comptable, la balance âgée incluant les brouillons réellement facturés et les bornes cohérentes avec le grand livre ;
- les portails multibaux, les gardes d'appartenance, les documents privés et les filtres des déclarations avant pagination ;
- les contrôleurs `asyncHandler` et les nouveaux parseurs de recherche ;
- la CI d'isolation bloquante avec le lanceur séquentiel de #195 ; les assertions de messages neutres et le nettoyage limité aux objets de test ;
- les deux ensembles de tests des onglets du bail, avec compatibilité des préfixes d'URL historiques ;
- les traductions des deux branches, fusionnées par clé puis régénérées : aucune clé nouvelle sans traduction ;
- les modifications des deux classeurs, fusionnées par sous-fonctionnalité et par cellule : 1 157 entrées, miroir régénéré et vérifié.

Contrôle des dépendances après intégration : aucune violation des frontières frontend/API, 2 742 modules et 15 578 dépendances. Le diff Prisma de #195 ajoute des index ; aucun seed de recette n'est lancé pour l'intégration.

La relecture a identifié deux interactions, corrigées avant livraison : la recherche JSON du relevé transmet maintenant `asOf`/`asOfDate`, et la sélection globale du portail conserve un seul bail même avec une sélection hors page. Le test contrôleur passe 31/31 et le test des filtres du portail, adapté au périmètre multibaux, passe 22/22. Les contrats de recherche et leurs protections restent actifs.

Typage API et web : aucune erreur. Catalogues i18n web/API et wiki : à jour. Catalogue IA régénéré : 786 routes. Smoke Chrome local sans écriture : historique Affoué 49 résultats, virement 8, date du 04/11 14 et référence exacte 1 ; recherche maintenance 2 résultats puis zéro pour un terme absent. Pas de 4xx/5xx après connexion. Variante maintenance multibaux non couverte par ce compte à bail unique.

Les références finales de CI et déploiement se consultent dans la PR #193 et ses workflows associés. Les 852 scénarios manuels restent soumis au bilan détaillé de `RESULTATS.md` ; cette intégration ne transforme aucun cas partiel en réussite.
