# Retests complémentaires finance — 5 novembre 2026

Version de départ `7e38ae0f` avec correctifs locaux de la balance âgée et du filtre de biens. Base dédiée, Chrome réel via Playwright, compte COMPTABLE_A. Contrôles API exclusivement GET ; les filtres sont actionnés par l'interface. Scripts et JSON de preuve locaux : `outils/pw/codex-lead/` sous le dossier d'orchestration.

## BUG-2026-11-04-036 — balance âgée

Avant correction : Prisca Yao, solde comptable 767 750 FCFA, total âgé 582 750, différence +185 000. L'échéance du 05/11/2026 était encore DRAFT, mais déjà facturée au grand livre par les données historiques. Les vrais brouillons non facturés doivent rester exclus.

Après correction, trois chargements de contrôle, dont le dernier après les ajustements de borne :

- Solde comptable = total âgé = **767 750 FCFA**, différence 0.
- Tranche 0–30 : 185 000 ; trois autres tranches de 194 250 chacune.
- Seuls les deux écarts REC-GL historiques restent : +3 200 et +2 000, données orphelines déjà documentées.
- Le statut de l'échéance en base reste DRAFT : aucune modification de données n'a été nécessaire pour le retest.

La suite financière finale passe 56/56 tests ; typage API et lint ciblés sans erreur. Relecture de sécurité : aucune observation ouverte après correction de la borne de fin. Le début de période n'exclut pas une créance d'ouverture encore due. Bus à passé.

## BUG-2026-11-05-004 — options du filtre Bien

Avant correction, reproduit sur les deux balances : données de balance 200, liste complète de biens 403 et filtre vide pour le comptable.

Après correction locale :

| Contrôle                                 | Observé                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Lookup financier                         | 200, 104 options, chaque objet contient exactement `id` et `title`                   |
| Balance âgée                             | 200 ; choix du premier bien dans le Select ; requête filtrée par son ID, réponse 200 |
| Balance clients                          | 200 ; même sélection par l'interface ; requête filtrée, réponse 200                  |
| Agence B depuis la session A             | GET du lookup de B refusé en 403                                                     |
| Dépendance à la liste complète des biens | Aucun appel interdit à `/properties?page=1&limit=200` durant les deux parcours       |

Les 401 de vérification de session avant connexion sont attendus et distincts des refus pendant une consultation authentifiée. Des avertissements de dépréciation Ant Design subsistent. Aucun droit de lecture des fiches de biens n'a été ajouté au comptable.

Tests du lookup, inventaire de routes et contrôles de typage : résultats finaux consignés dans le bilan de reprise après intégration.
