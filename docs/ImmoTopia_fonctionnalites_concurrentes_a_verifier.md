# ImmoTopia — Fonctionnalités concurrentes absentes ou à vérifier

> **Mise à jour du 23 septembre 2026.** La branche `feat/gestion-locative-lot-1`
> (pas encore sur `main`) a livré depuis la version 2.0 de ce document les
> honoraires de gestion, le compte courant et les reversements aux
> propriétaires, l'indivision, la vie du bail et les états des lieux, les
> sessions de caisse avec billetage, la conformité SYSCOHADA (comptes
> mandants 4731, trésorerie 5711x/5211x/552x, retenue à la source 4478), ainsi
> qu'un module de finance opérationnelle et chantiers (fournisseurs, bons de
> commande, stock, chantiers, budgets, baux de terrain). Le détail vérifié
> dans le code figure dans `docs/FONCTIONNALITES.md` (mise à jour du 23
> septembre 2026). Chaque tableau ci-dessous porte désormais une colonne
> « Statut au 23/09 » ; l'analyse d'origine du 22 septembre n'est pas modifiée.

Date : 22 septembre 2026

Périmètre : agences de gestion locative à Abidjan. Comparaison indépendante des packages commerciaux d’ImmoTopia.

## Comment lire cette liste

Cette comparaison repose sur le document `FONCTIONNALITES.md` d’ImmoTopia, version 2.0 du 22 septembre 2026, et sur les publications officielles des concurrents consultées à cette date.

- **Absence confirmée** : le document d’ImmoTopia indique explicitement que la fonctionnalité manque.
- **Non documentée ou à préciser** : les informations disponibles ne permettent pas d’établir sa présence ou sa profondeur. Une vérification dans l’application ou le code est nécessaire avant de conclure qu’elle manque.
- **Fonctionnalité concurrente annoncée** : elle est décrite par l’éditeur ; son fonctionnement n’a pas été testé dans le cadre de cette comparaison. Sa disponibilité peut dépendre du forfait ou d’une intégration spécifique.

Le document d’ImmoTopia précise que les fonctions avancées de finance et de chantiers se trouvent sur une branche distincte. Leur présence dans ce document ne prouve pas leur disponibilité dans la version déployée.

## 1. Absence explicitement confirmée

| Fonctionnalité manquante                                                                                                     | Concurrent qui la propose                                                   | Situation d’ImmoTopia                                                                                     | Statut au 23/09                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Gestion des ventes immobilières : offres, compromis et contrats de vente**, au-delà du suivi d’une opportunité commerciale | ChezvousBO annonce offres, compromis et commissions dans son offre Premium. | Le document signale l’absence de contrat de vente et de la chaîne de traitement après une affaire gagnée. | Toujours absent. En cours (lot 9), pas encore présent dans le code de cette branche. |

Source concurrente : [offres ChezvousBO](https://onboarding.chez-vous.ci/tarifs).

Cette comparaison n’établit pas que ChezvousBO couvre également l’échéancier acquéreur ou le transfert de propriété : ces points restent à vérifier séparément.

## 2. Commissions et comptes propriétaires : fonctions non établies chez ImmoTopia

| Fonctionnalité                                           | Ce que le concurrent propose                                       | Situation d’ImmoTopia                                                   | Statut au 23/09                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Calcul automatique des commissions de gestion**        | ChezvousBO : taux par contrat et calcul mensuel.                   | Aucun moteur de commissions décrit.                                     | Désormais livré. Honoraires calculés à chaque encaissement, barème bail > propriétaire > agence (`ManagementFee`, `ecc79de`).              |
| **Partage des commissions agence/agent**                 | ChezvousBO : répartition des commissions.                          | Non documenté.                                                          | Désormais livré. Part du collaborateur gestionnaire sur les honoraires (`AgentCommissionRate`, `ecc79de`).                                 |
| **Calcul automatique du net à reverser au propriétaire** | Logestimmo : loyers encaissés moins commissions, charges et taxes. | Relevés propriétaires présents ; calcul détaillé non précisé.           | Désormais livré. Relevé mensuel figé : encaissé − honoraires − TVA − dépenses (`OwnerStatement`, `c69e6c5`).                               |
| **Suivi des reversements aux propriétaires**             | WIMMO : reversements effectués, en attente et avances.             | Parcours de reversement non décrit.                                     | Désormais livré. Reversements numérotés REV-AAAA-NNNN, solde du compte courant propriétaire (`OwnerPayout`, `fc78a2a`).                    |
| **Compte rendu par indivisaire**                         | Logestimmo : répartition par quote-part et document individuel.    | Associations présentes, mais lien avec les revenus locatifs non établi. | Désormais livré. Quotes-parts d'un bien réparties dans les comptes et relevés de chaque indivisaire (`PropertyOwnershipShare`, `7826e57`). |

Sources : [commissions ChezvousBO](https://onboarding.chez-vous.ci/fonctionnalites/commissions), [comptes rendus Logestimmo](https://logestimmo.com/fonctionnalites/compte-rendu-gerance), [fiche technique WIMMO](https://www.wimmo-ci.com/_webSiteAssets/assets/documents/WIMMO%20v2.2.5%20-%20Fiche%20Technique%20-%20Logiciel%20de%20Gestion%20Immobiliere.pdf).

## 3. Paiements et contrôle financier : fonctions non établies chez ImmoTopia

| Fonctionnalité                                                              | Ce que le concurrent propose                                                                                      | Situation d’ImmoTopia                                                            | Statut au 23/09                                                                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paiement Mobile Money intégré avec rapprochement automatique**            | ChezvousBO : intégration via CinetPay. Logestimmo : intégration Wave sur demande, avec les accès API de l’agence. | Saisie et déclaration de paiement présentes ; intégration opérateur non établie. | Toujours absent. Aucune intégration d'opérateur dans le code.                                                                               |
| **Clôture physique de caisse par caissier**                                 | Logestimmo : montant attendu, montant compté, écart et validation du responsable.                                 | Pièces de caisse présentes ; sessions et comptage non décrits.                   | Désormais livré. Sessions de caisse, billetage, écart et validation (`CashSession`, `7ba61a9`).                                             |
| **Comptabilité locative avec exports SYSCOHADA**                            | Logestimmo : écritures automatiques et exports comptables.                                                        | Partie double décrite pour le syndic ; couverture locative non établie.          | Désormais livré. Comptes mandants 4731, trésorerie 5711x/5211x/552x, retenue à la source 4478 (`65ad2cd`).                                  |
| **Séparation comptable des fonds propriétaires et des revenus de l’agence** | Logestimmo : fonds de tiers distincts des honoraires.                                                             | Non explicitée.                                                                  | Désormais livré. Un sous-compte 4731 par mandant, distinct des comptes d'honoraires et de TVA de l'agence (`ThirdPartyAccount`, `65ad2cd`). |

Sources : [paiements ChezvousBO](https://onboarding.chez-vous.ci/fonctionnalites/paiements), [encaissements et intégration Wave de Logestimmo](https://logestimmo.com/fonctionnalites/encaissement-paiements), [gestion de caisse Logestimmo](https://logestimmo.com/fonctionnalites/gestion-de-caisse), [comptabilité Logestimmo](https://logestimmo.com/fonctionnalites/comptabilite-ohada).

**Distinction à conserver :** enregistrer un règlement Mobile Money, recevoir sa confirmation depuis l’opérateur et l’affecter automatiquement au bon dossier sont trois capacités différentes. La présence de la première ne démontre pas les deux autres.

## 4. Contrats, communication et exploitation : fonctions non établies chez ImmoTopia

| Fonctionnalité                                                                     | Concurrent qui la décrit                                    | Situation d’ImmoTopia                                                    | Statut au 23/09                                                                                                   |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **États des lieux d’entrée et de sortie**                                          | ChezvousBO ; archivage chez WIMMO.                          | Module dédié non documenté.                                              | Désormais livré. État des lieux d'entrée et de sortie par pièce, photos, retenues (`LeaseInspection`, `38cc322`). |
| **Révision des loyers avec historique**                                            | ChezvousBO décrit la révision ; WIMMO précise l’historique. | Non documentée.                                                          | Désormais livré. Historique des révisions, loyer et charges avant/après (`LeaseEvent`, `38cc322`).                |
| **Renouvellement, avenant et résiliation du bail**                                 | Logestimmo.                                                 | Création et modification présentes ; ces parcours ne sont pas détaillés. | Désormais livré. Renouvellement, avenant, résiliation tracés (`LeaseEvent`, `38cc322`).                           |
| **SMS automatiques de rappel et de notification**                                  | WIMMO.                                                      | E-mail et WhatsApp présents ; SMS non documentés.                        | Toujours absent.                                                                                                  |
| **Site vitrine fourni à l’agence et diffusion sur un portail d’annonces existant** | ChezvousBO.                                                 | API de publication présente ; service équivalent non établi.             | Inchangé.                                                                                                         |
| **Fonctionnement sans Internet sur installation locale**                           | WIMMO.                                                      | Non documenté.                                                           | Toujours absent.                                                                                                  |
| **Assistant IA interrogeant les données de gestion**                               | Logestimmo, avec LIMA.                                      | Non documenté.                                                           | Toujours absent.                                                                                                  |

Sources : [contrats ChezvousBO](https://onboarding.chez-vous.ci/fonctionnalites/contrats), [baux Logestimmo](https://logestimmo.com/fonctionnalites/baux-contrats), [WIMMO](https://www.wimmo-ci.com/), [services ChezvousBO](https://onboarding.chez-vous.ci/), [LIMA et offres Logestimmo](https://logestimmo.com/).

## 5. Ordre de vérification recommandé

Pour la cible « agences de gestion locative », vérifier en premier les cinq capacités suivantes :

1. **Commissions** : calcul automatique selon le contrat, avec traitement des paiements partiels.
2. **Net propriétaire** : détail des encaissements, honoraires, charges et sommes à reverser.
3. **Reversements** : suivi de ce qui est payé au propriétaire et de ce qui reste dû.
4. **Rapprochement Mobile Money** : confirmation opérateur et affectation au bon dossier.
5. **Clôture de caisse** : comparaison entre espèces attendues et comptées, explication des écarts et validation.

Cet ordre est une recommandation fondée sur les opérations quotidiennes d’une agence. Il ne constitue pas une conclusion sur l’absence effective de ces fonctions dans le code d’ImmoTopia.
