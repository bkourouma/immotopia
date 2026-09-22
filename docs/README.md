# Documentation ImmoTopia

## Démarrer

- [Installation et premier lancement](setup/getting-started.md)
- [Variables d'environnement](../packages/api/env.example) — chaque variable est
  commentée ; `packages/api/src/config/env.ts` est la source de vérité (le
  serveur refuse de démarrer si la configuration est invalide).

## Architecture

Ces quatre documents se recouvrent partiellement : ils ont été écrits à des
moments différents du projet. Ils sont regroupés ici en attendant une passe
éditoriale de fusion.

| Document                                                      | Contenu                                                | À lire pour                        |
| ------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| [overview.md](architecture/overview.md)                       | Vue d'ensemble technique la plus complète              | Comprendre l'ensemble du système   |
| [modules.md](architecture/modules.md)                         | Découpage par module métier                            | Situer une fonctionnalité          |
| [implementation.md](architecture/implementation.md)           | Choix d'implémentation et schéma                       | Détails techniques                 |
| [features.md](architecture/features.md)                       | Inventaire fonctionnel                                 | Savoir ce que fait l'application   |
| [functional-overview.md](architecture/functional-overview.md) | Présentation orientée prospect                         | Contexte commercial                |
| [database-schema.md](architecture/database-schema.md)         | Schéma de base **partiel et daté** (38 tables sur 112) | À régénérer depuis `schema.prisma` |

La référence à jour du schéma est `packages/api/prisma/schema.prisma`.

- [Multilingue — français, anglais, arabe](architecture/i18n.md) — le texte
  français **est** la clé de traduction ; à lire avant de toucher à un libellé.

## Intégrations

- [Connexion Google (OAuth 2.0)](integrations/google-oauth.md) — document unique,
  remplace six anciens fichiers
- [WaSender (WhatsApp)](integrations/wasender.md)
- [Twilio WhatsApp — configuration](TWILIO-WHATSAPP-SETUP.md)
- [Twilio WhatsApp — checklist de test](TEST-WHATSAPP-TWILIO-CHECKLIST.md)
- [Modèles de messages WhatsApp Business](WHATSAPP-BUSINESS-TEMPLATES-REFERENCE.md)

## Modules

- [Communication](communication/COMMUNICATION_MODULE.md) — et les guides de test
  du même dossier
- [Dépôts de garantie](modules/rental-deposits.md)
- [Rôles et disponibilité par tenant](roles-disponibilite-par-tenant.md)
- [Tenant et modules : clarification](clarification-tenant-vs-module.md)

## Exploitation

- [Dépannage des problèmes de connexion](runbooks/troubleshooting-connection.md)
- [Workflows de test de bout en bout](WORKFLOW_E2E_SIDEBAR_COMPLET.md) — voir
  aussi les workflows patrimoine et syndic du même dossier
- [Scénario de test — du chantier à la location](SCENARIO_TEST_E2E_CHANTIER_VERS_LOCATION.md) —
  chantiers, financement, biens, baux, encaissements, comptabilité locative
- [Scénario de test — les modules restants](SCENARIO_TEST_MODULES_RESTANTS.md) —
  CRM, documents, maintenance, communication, newsletter, portails,
  administration, et les écrans Finance non couverts par le parcours chantier

## Qualité du code

- [Audit technique et feuille de route](../AUDIT_CODE.md) — état du code, dette
  identifiée, ce qui a été corrigé et ce qui reste
- [Guide de contribution](../CONTRIBUTING.md)

## Archive

`archive/` contient des comptes rendus d'incidents et des notes de configuration
datés, conservés pour leur valeur historique. Ils contiennent des informations
périmées (notamment le port 8000 au lieu de 8001) et ne doivent pas servir de
référence.

## Spécifications

`specs/` (à la racine du dépôt) contient les spécifications fonctionnelles par
module. C'est la documentation la plus structurée du projet.
