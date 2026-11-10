# Recette navigateur — module Gestion locative

Scénario de recette exhaustif du module **Gestion locative** d'ImmoTopia :
paramétrage, baux, vie du bail, dépôts, états des lieux, documents, signature,
échéances, paiements, pénalités, prélèvement bancaire, tableaux de bord et
exports, propriétaires (relevés, reversements), portails locataire et
propriétaire, droits, isolation entre agences, langues, mobile et robustesse.

Il se joue **par l'interface**, dans un navigateur réel (navigateur intégré de
Claude Code ou Playwright piloté par un agent), selon le processus
[DEMO_DEBUG_PROCESS.md](../../workflows/DEMO_DEBUG_PROCESS.md). Les cas sont
écrits d'après le code (libellés, URL, règles de validation) et l'inventaire
[docs/fonctionnalites](../../fonctionnalites/README.md) ; chaque fichier se
termine par une table de couverture qui relie chaque sous-fonctionnalité de
l'inventaire à ses cas.

## Fichiers et ordre de passage

| Ordre | Fichier                                                                                | Bloc                                                                       |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1     | [01-parametrage.md](01-parametrage.md)                                                 | Paramètres financiers, honoraires, commissions, préalables (bien, contact) |
| 2     | [02-baux.md](02-baux.md)                                                               | Création, liste, détail, modification, statuts, suppression, colocataires  |
| 3     | [03-vie-du-bail-depot.md](03-vie-du-bail-depot.md)                                     | Révision, renouvellement, avenant, résiliation, solde, dépôt de garantie   |
| 4     | [04-etats-des-lieux-documents-signature.md](04-etats-des-lieux-documents-signature.md) | États des lieux, documents, signature électronique                         |
| 5     | [05-echeances.md](05-echeances.md)                                                     | Échéances, liens de paiement                                               |
| 6     | [06-paiements.md](06-paiements.md)                                                     | Paiements, allocations, déclarations du portail                            |
| 7     | [07-penalites.md](07-penalites.md)                                                     | Pénalités de retard                                                        |
| 8     | [08-prelevement-bancaire.md](08-prelevement-bancaire.md)                               | Créanciers, mandats, remises, retours banque                               |
| 9     | [09-caisse-tableaux-de-bord-exports.md](09-caisse-tableaux-de-bord-exports.md)         | Tableaux de bord, balance âgée, caisse, écritures, exports                 |
| 10    | [10-proprietaires-releves-reversements.md](10-proprietaires-releves-reversements.md)   | Relevés, comptes propriétaires, reversements, commissions                  |
| 11    | [11-portail-locataire.md](11-portail-locataire.md)                                     | Espace locataire                                                           |
| 12    | [12-portail-proprietaire.md](12-portail-proprietaire.md)                               | Espace propriétaire                                                        |
| 13    | [13-roles-permissions-isolation.md](13-roles-permissions-isolation.md)                 | Matrice des droits, isolation entre agences                                |
| 14    | [14-transverse-i18n-mobile-robustesse.md](14-transverse-i18n-mobile-robustesse.md)     | Langues et RTL, mobile, erreurs réseau, injections, valeurs limites        |

Les cas GL-10-001 à GL-10-007 (honoraires par propriétaire et gestionnaire du
bail) se jouent **avant** les paiements du fichier 06 : les honoraires sont
figés au moment de l'encaissement.

Le produit n'a pas de rôle « lecture seule » strict : quand un cas des fichiers
01 à 09 demande LECTEUR_A pour vérifier qu'un bouton d'écriture est masqué,
le jouer avec COMPTABLE_A (lecture locative) ; LECTEUR_A (`TENANT_AGENT`) doit,
lui, être refusé partout dans la gestion locative.

Les cas se nomment `GL-<fichier>-<numéro>` (ex. `GL-06-017`). Un fichier liste
en tête les cas d'autres fichiers dont il dépend.

## Environnement

Jamais sur la production ni sur le staging : uniquement une base **dédiée**.

| Élément       | Valeur utilisée pour la recette du 2026-11-03                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Code          | branche `orch/2026-11-03-recette-locatif` (partie de `main` @ `6be7f91a`)                                                                    |
| Base          | `immotopia_recette_locatif` (Postgres local, créée pour la recette)                                                                          |
| API / web     | `http://localhost:8820` / `http://localhost:3320`                                                                                            |
| E-mails       | puits SMTP local `127.0.0.1:2525` : aucun message ne sort, chaque e-mail est écrit dans un fichier `.eml` (liens d'invitation, de signature) |
| WhatsApp, SMS | neutralisés (`SMS_PROVIDER=log` : le code SMS apparaît dans le journal de l'API)                                                             |
| Paiement      | PaySecureHub en mode simulateur                                                                                                              |
| Abonnements   | `SUBSCRIPTION_ENFORCEMENT=enforce` (comme le staging)                                                                                        |

Amorçage d'une base vierge (dans `packages/api`, avec `DATABASE_URL` pointant
sur la base dédiée) : `prisma migrate deploy`, puis les seeds `rbac-seed`,
`property-templates-seed`, `geographic-seed`, `catalog-seed`,
`document-templates-seed`, `create-platform-super-admin`, et enfin
`ALLOW_PACK_TEST_TENANTS=1 ts-node -T prisma/seeds/seed-pack-test-tenants.ts`
qui crée les agences de test par pack (mot de passe public de test, base
locale ou staging seulement).

## Comptes

Les cas utilisent des rôles symboliques ; la table ci-dessous les associe à des
comptes de la base de recette.

Mot de passe de tous ces comptes : `<mot de passe local>`, mot de passe **public de
test** des agences par pack (`prisma/seeds/pack-test-tenants.ts`), valable
seulement sur une base locale ou le staging.

| Rôle symbolique        | Compte                                    | Agence / rôle                                                                     |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| ADMIN_A                | `agence-3ans@packs.immotopia.test`        | A = « Test — Pack Agence · 3 ans », `TENANT_ADMIN`                                |
| AGENT_A                | `gestionnaire-rec@packs.immotopia.test`   | A, `TENANT_MANAGER` (gestionnaire)                                                |
| LECTEUR_A              | `lecteur-rec@packs.immotopia.test`        | A, `TENANT_AGENT` : aucun droit locatif ni financier (il ne voit pas les baux)    |
| COMPTABLE_A            | `comptable-rec@packs.immotopia.test`      | A, `TENANT_ACCOUNTANT` : lecture seule locative (crée toutefois des reversements) |
| ADMIN_B                | `agence@packs.immotopia.test`             | B = « Test — Pack Agence · 6 mois », `TENANT_ADMIN`                               |
| LOCATAIRE_PORTAIL      | `affoue.loukou@packs.immotopia.test`      | locataire de A (portail locataire)                                                |
| LOCATAIRE_PORTAIL_2    | `bakary.gogoua@packs.immotopia.test`      | autre locataire de A                                                              |
| PROPRIETAIRE_PORTAIL   | `sandrine.coulibaly@packs.immotopia.test` | propriétaire de A (portail propriétaire)                                          |
| PROPRIETAIRE_PORTAIL_2 | `moussa.kone@packs.immotopia.test`        | autre propriétaire de A                                                           |

Autres comptes de portail de A : locataires `aboubacar.diabate`,
`kouadio.kouassi`, `fabrice.nguessan`, `rodrigue.gnahore`, `awa.boni`,
`seydou.fofana`, `lassina.boni`, `rodrigue.digbeu` ; propriétaires
`amenan.bamba`, `aminata.gogoua`, `carine.konan`, `adjoua.kouassi` (tous
`@packs.immotopia.test`). L'agence A porte 3 ans d'historique (60 biens,
40 baux, ~1 000 échéances, ~750 encaissements, relevés, reversements,
états des lieux, documents) : les listes, la pagination, les exports et les
rapports s'y vérifient sur un volume réaliste. Les comptes AGENT_A,
LECTEUR_A et COMPTABLE_A ne sont pas créés par le seed ; pour une base neuve, les inviter
depuis Collaborateurs avec ces rôles.

Pour un nouveau compte de portail créé pendant la recette, le mot de passe se
définit par le lien de l'e-mail d'invitation, lu dans le puits SMTP.

## Gravité et traitement des anomalies

| Gravité    | Définition                                                                                                                                                                                          | Traitement                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bloquant   | Empêche de poursuivre, erreur 500 ou écran blanc sur un parcours nominal, montant ou solde faux, perte de données, fuite entre agences ou entre clients, accès non autorisé, script injecté exécuté | Anomalie `bloquant` dans le bus ; le testeur **prévient le superviseur immédiatement** (fin de bloc anticipée si le parcours ne peut plus avancer) |
| Majeur     | Fonction secondaire cassée, avec contournement                                                                                                                                                      | Anomalie `important`, le testeur **note et continue**                                                                                              |
| Mineur     | Validation, message, ergonomie                                                                                                                                                                      | Anomalie `mineur`, note et continue                                                                                                                |
| Cosmétique | Affichage, traduction                                                                                                                                                                               | Anomalie `mineur`, note et continue                                                                                                                |

Chaque anomalie est créée par
`npm run agent-bus -- new-bug --title "…" --priority <bloquant|important|mineur> --scenario GL-xx-yyy --branch <branche> --sha <sha> --url <url>`
au format [BUG_REPORT_TEMPLATE.md](../../workflows/BUG_REPORT_TEMPLATE.md) :
étapes, attendu, observé, preuve (texte de la page, requête et code HTTP,
message de console), fréquence. Jamais de mot de passe ni de jeton dans un
rapport. Une anomalie n'est créée qu'après une seconde reproduction.

Le résultat de chaque cas est `passé`, `échoué` (avec l'identifiant de
l'anomalie) ou `bloqué` (avec la cause : prérequis échoué, fonction absente,
action impossible dans le navigateur). Le bilan consolidé est dans
[RESULTATS.md](RESULTATS.md).

## Règles pour le testeur

- Naviguer réellement : cliquer, saisir, vérifier l'état affiché après chaque
  action. Pas d'appel direct à l'API pour remplacer un parcours ; l'API ne sert
  qu'aux contrôles (onglet réseau, codes HTTP, absence de données d'une autre
  agence).
- Préférer la lecture de la page (arbre d'accessibilité, texte) aux captures,
  surtout si le panneau du navigateur est masqué ; cliquer par référence
  d'élément.
- Noter, sur chaque écran, les erreurs rouges de la console et les réponses
  HTTP 4xx/5xx inattendues.
- Préfixer toute donnée créée par `REC-GL` ; ne jamais supprimer une donnée qui
  ne porte pas ce préfixe, sauf si le cas le demande explicitement.
- Ne modifier aucun fichier du dépôt. Ne pas lancer de commande git qui modifie
  l'arbre ou l'index.

## Prompt de lancement

Pour rejouer toute la recette en autonomie dans une session Claude Code ouverte
à la racine du dépôt :

```text
/chef-orchestre Joue la recette navigateur du module Gestion locative décrite
dans docs/recette/gestion-locative/ (README.md puis les fichiers 01 à 14 dans
l'ordre), sans moi. Prépare une base locale DÉDIÉE (jamais la base de dev,
jamais le staging ni la production) et lance API, web et puits SMTP sur des
ports libres depuis une copie de travail à jour de main, en neutralisant tous
les envois sortants. Fais jouer chaque fichier par un agent ui-tester (modèle
sonnet) dans le navigateur intégré, un bloc à la fois. Chaque anomalie va dans
le bus (npm run agent-bus -- new-bug) avec étapes, attendu, observé et preuve ;
les non bloquantes sont notées et le testeur continue ; une bloquante te
revient immédiatement. Fais corriger les anomalies par des agents de
développement (sonnet), sur des fichiers disjoints, avec tests ; vérifie
toi-même chaque correction, commite, puis fais rejouer les cas échoués et
leurs voisins jusqu'à réussite ou blocage documenté. Mets à jour
docs/recette/gestion-locative/RESULTATS.md, le classeur des fonctionnalités si
une fonctionnalité visible change, et HANDOFF.md ; pousse et ouvre une PR vers
main. Un seul rapport à la fin : PR, cas passés/échoués/bloqués, anomalies
corrigées et restantes, ce qui n'a pas été vérifié.
```
