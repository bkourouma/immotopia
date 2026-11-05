# Reprise de l'isolation CI — 2026-11-05

La CI de la PR #193 affichait huit jobs verts au commit `7e38ae0f`, mais son job d'isolation avait en réalité échoué. La preuve existe sur deux runs consécutifs, [41924954779](https://github.com/bkourouma/immotopia/actions/runs/41924954779) et [41977138986](https://github.com/bkourouma/immotopia/actions/runs/41977138986) : chaque journal donne **2 suites échouées, 5 réussies, 10 tests échoués, 203 réussis, 213 au total**. `continue-on-error: true` dans `.github/workflows/ci.yml` a masqué le code de sortie de `npm run test:isolation`.

## Échecs identifiés

- `isolation.test.ts:1241` : un refus d'accès au journal était tracé, mais le champ `payload.permission` manquait. L'observateur d'audit lisait l'ancien message `Permission denied: ...` ; le middleware RBAC fournit désormais un message neutre et `requiredPermission` dans la réponse structurée.
- `patrimoine.personal-permission.integration.test.ts:111,117` : neuf assertions cherchaient les clés `PATRIMOINE_PERSONAL_VIEW` ou `_EDIT` dans le texte du message 403, devenu neutre. Le statut 403 était correct.
- `cleanupTenants` échouait pour les deux agences du test d'isolation à cause de la FK `charge_calls_syndicate_id_fkey`. Trois copropriétés créées par le scénario comportaient paiements et appels de charges avec relations restrictives.

## Correctifs préparés

- Le job d'isolation devient bloquant ; son échec fera échouer la PR.
- L'observateur d'audit enregistre la clé de `requiredPermission` dans la trace, tout en préservant le message client neutre. Un test unitaire vérifie les deux propriétés.
- Les assertions patrimoine vérifient 403, la clé structurée `requiredPermission` et l'absence de cette clé dans le message ; l'écriture refusée garde son assertion d'absence d'actif créé.
- Le nettoyage supprime uniquement les paiements, appels et copropriétés dont les identifiants ont été créés dans cette suite, avant `cleanupTenants`.

`audit-access-middleware.test.ts` : 18/18 tests réussis localement. Le premier travail de correction n'avait pas de base dédiée configurée ; le pilote en a ensuite créé une neuve pour les contrôles ci-dessous. La fiche du bus est `BUG-2026-11-05-006`.

## Contrôle local supplémentaire sur base dédiée neuve

Le pilote a lancé un essai sur une base de test neuve, avec le mode `SUBSCRIPTION_ENFORCEMENT=warn` de la CI. **213/213 assertions sont passées**, mais Jest a correctement gardé la suite en échec (1 suite échouée, 6 réussies sur 7) : `afterAll` ne pouvait pas supprimer les deux agences de test, car `journal_entry_lines_account_id_fkey` interdit de supprimer les comptes comptables référencés. Ce résultat ne valide donc pas encore l'isolation complète.

Le helper de nettoyage a été complété : il supprime les lignes d'écriture dont `entry.tenantId` est celui de l'agence de test, avant `tenant.delete`. Les écritures et comptes sont alors supprimés par leurs cascades existantes. Le filtre se limite aux identifiants d'agences créés par le test ; le nettoyage reste strict et continue de faire échouer la suite en cas de nouvelle FK.

## Résultat local final

Un troisième essai sur une **nouvelle base de test dédiée** (`_0645`), avec `SUBSCRIPTION_ENFORCEMENT=warn` comme en CI, s'est terminé avec le **code 0**. Les quatre lots ont tous réussi : isolation et espaces (7 suites, 213 tests), concurrence du stock (3 suites, 14 tests), inventaire WhatsApp (2 suites, 7 tests) et intégrité de l'audit (1 suite, 14 tests). Total : **13 suites et 248 tests réussis**. Le [journal local complet](../../../../../../.orchestration/2026-11-03-recette-locatif/isolation-locale.log) est hors Git et ne contient pas d'URL de base dans ce rapport.

Les trois bases neuves utilisées pour les essais (`_0635`, `_0640`, `_0645`) sont conservées ; aucune base existante n'a été effacée. La fiche `BUG-2026-11-05-006` reste **prête au retest** jusqu'à une nouvelle CI sur le commit de correction : il faudra vérifier le journal et le statut du job d'isolation désormais bloquant.
