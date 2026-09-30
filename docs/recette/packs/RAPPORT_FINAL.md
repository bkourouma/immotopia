# Rapport final — recette de bout en bout des packs (2026-09-30)

Branche `fix/recette-packs-e2e`. Contrat et règles : [CADRE_COMMUN.md](CADRE_COMMUN.md).
Scénarios et journaux : `SCENARIO_PACK_*.md`. Anomalies : [ANOMALIES.md](ANOMALIES.md).

## Méthode

- Six instances isolées (une API, un web, une base `immotopia_rec_*` par pack), en local
  uniquement : aucune base partagée ni de production. Abonnement en mode
  `SUBSCRIPTION_ENFORCEMENT=enforce`, paiement plateforme simulé, e-mails captés par un
  récepteur local, IA factice.
- Un testeur (Sonnet) par pack : écriture du scénario, exécution dans un navigateur réel,
  journal étape par étape (passé / échoué / bloqué / noté), matrice de couverture
  modules × pack.
- Chaque anomalie est consignée dans le bus `.agent-bus/bugs`, reproduite, puis corrigée
  par un agent correcteur sur un territoire de fichiers disjoint, déployée sur les
  instances et rejouée.
- Deux audits transverses (sécurité, données/comptabilité) ont suivi ; leurs constats
  ont été corrigés (dont une fuite de données sur l'annonce publique d'un bien).

## Résultats

| Pack                 | Modules couverts                          | Scénario                                |
| -------------------- | ----------------------------------------- | --------------------------------------- |
| Agence               | CRM, Ventes, Location, Patrimoine, Biens  | `SCENARIO_PACK_AGENCE.md`               |
| Syndic               | Syndic (copropriétés, appels, AG, fonds)  | `SCENARIO_PACK_SYNDIC.md`               |
| Promoteur            | CRM, Ventes, Patrimoine, Chantiers        | `SCENARIO_PACK_PROMOTEUR.md`            |
| Opérateur intégré    | tous les modules, portails                | `SCENARIO_PACK_INTEGRE.md`              |
| Patrimoine Essentiel | patrimoine (10 biens détenus en propre)   | `SCENARIO_PACK_PATRIMOINE_ESSENTIEL.md` |
| Patrimoine Pro       | patrimoine (100 biens) et gestion directe | `SCENARIO_PACK_PATRIMOINE_PRO.md`       |

101 anomalies consignées : 85 corrigées et rejouées, 8 corrigées en attente de rejeu, 8 ouvertes
(voir `ANOMALIES.md`). Priorités : 4 bloquantes, 44 importantes, 53 mineures.

Familles corrigées : menus/écrans/tableau de bord d'un module non souscrit ; quotas et
extensions ; isolation entre agences et messages d'erreur ; machine d'états des échéances
de loyer et écritures comptables de la gestion directe ; génération de documents ; Syndic
(unicité des lots, permissions, écritures) ; patrimoine (rendements, valorisation) ;
traductions anglais/arabe ; pagination.

## Vérifications après correction

- `typecheck` web : 0 erreur ; API : 44 erreurs, toutes préexistantes (base ~48).
- `lint` : 0 erreur ; `check:architecture` : aucune violation ; `wiki:check` : à jour (710).
- Jest API et Vitest web : verts (web : 179 fichiers, 1704 tests).
- Les tests qui encodaient un comportement volontairement changé ont été adaptés, avec
  l'isolation par agence et la garde `TENANT_SETTINGS_EDIT` de la signature et du cachet
  vérifiées intactes.

## Non vérifié / limites

- Les correctifs tardifs (migrations `20261006140000` et `…150000`, rattrapages modifiés) n'ont
  pas fait l'objet d'un nouveau passage complet dans le navigateur : les instances sont arrêtées.
- Aucun test contre un fournisseur réel (paiement PaySecureHub en mode réel, SMS, e-mail externe).
- Les traductions anglaises et arabes n'ont pas été relues par une personne.
- Pas d'essai sur une base de production ni de données réelles.

## Points ouverts et décisions à prendre

- Anomalies ouvertes : 074 (modèles de contrat de vente du pack Promoteur), 091 (modèles de
  documents du Syndic), 095, 067, 093, 097, 098, 100 (textes non traduits, libellé du verrou
  manuel).
- Anomalies corrigées à rejouer : 008, 016, 030, 034, 058, 060, 089, 099.
- À valider par le métier : consolidation et export du patrimoine limités aux biens détenus en
  propre ; comptes 165/758 pour le dépôt de garantie, 411/7083 en gestion directe ; écriture
  d'émission d'appel (450) ; libellé juridique de la clause de pénalité.
- Déploiement : appliquer les migrations avant ou avec le code ; les scripts de rattrapage sont
  en simulation par défaut (`--apply`, `--allow-production`).
- Le limiteur du renvoi de convocation est en mémoire (par processus).
- Les anciennes anomalies des 28 et 29 septembre ne sont corrigées que sur la branche non
  fusionnée `origin/test/recette-operateur-integre`.
