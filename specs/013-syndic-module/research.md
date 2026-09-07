# Research: Module de gestion des syndics de copropriété ImmoTopia

**Feature**: 013-syndic-module  
**Date**: 2026-03-04  
**Status**: Complete

Ce document synthétise les décisions techniques clés pour le module syndic, leur justification et les alternatives considérées.  
Le feature spec ne contenait pas de marqueurs explicites `[NEEDS CLARIFICATION]`; les choix ci-dessous s’appuient donc sur la stack ImmoTopia et les modules existants.

---

## 1. Modélisation des copropriétés et des lots

**Decision**: Utiliser les modèles Prisma `Syndicate`, `SyndicateLot`, `GeneralMeeting`, `GMResolution`, `GMVote`, `GMProxy`, `ServiceProvider`, `MaintenanceContract`, `CommonAreaAsset`, `SyndicateDocument`, `SyndicateFund`, `ChargeCall`, `ChargePayment` tels que définis dans le prompt, avec ajout systématique de la colonne `organizationId` partout où nécessaire pour l’isolation multi-tenant (via lien à `Organization` ou transitivement par `syndicateId`).  
**Rationale**: La structure proposée couvre bien les concepts métier (copropriété, lots, AG, contrats, documents, fonds) et est cohérente avec les patterns Prisma actuels (UUID, timestamps, relations explicites). L’isolation par organisation reste le point central de la sécurité multi-tenant.  
**Alternatives considered**:
- Regrouper certains concepts (AG, résolutions, votes) dans un modèle « Event » générique → rejeté car rend l’API beaucoup moins lisible et éloigne du vocabulaire juridique des syndics.  
- Ajouter un modèle intermédiaire « SyndicateBuilding » dès la première version → conservé comme possibilité d’évolution; pour la V1, `totalBuildings` sur `Syndicate` suffit.

---

## 2. Stratégie d’API et de validation

**Decision**: Exposer le module via des routes API Next.js sous `api/syndics/*` (App Router), en suivant la structure fournie (liste/détail syndic, lots, charges, AG, prestataires, documents, finances) et en validant toutes les entrées avec des schémas Zod centralisés dans `lib/syndics/schemas.ts`.  
**Rationale**: Le reste de l’application exploite déjà les API routes Next.js, Prisma et Zod pour les validations; réutiliser ce pattern réduit le coût de mise en œuvre et la courbe d’apprentissage. Les schémas Zod dédiés rendent la validation explicite et réutilisable côté frontend si nécessaire.  
**Alternatives considered**:
- Introduire un backend séparé (Express/Nest) pour le module syndic → rejeté car contraire à l’architecture actuelle basée sur les API routes Next.js.  
- Valider les payloads uniquement via Prisma (constraints DB) → rejeté au profit de Zod, qui permet des messages d’erreur plus précis et une validation côté bordure API.

---

## 3. Gestion des appels de charges et des paiements

**Decision**: Implémenter `ChargeCall` au niveau du lot (une ligne par lot et par période), avec calcul applicatif des montants en fonction des tantièmes et des paramètres de la copropriété; utiliser `ChargePayment` pour enregistrer chaque règlement et mettre à jour le statut de l’appel (`PENDING`, `PARTIAL`, `PAID`, `OVERDUE`) via des transactions Prisma.  
**Rationale**: Une ligne par lot simplifie le suivi des impayés, la génération des relevés par copropriétaire et la compatibilité avec les relances automatisées. Les transactions garantissent que la mise à jour des soldes et des statuts reste atomique.  
**Alternatives considered**:
- Stocker l’appel au niveau global de la copropriété avec un champ JSON par lot → rejeté pour éviter la complexité des requêtes, des index et des mises à jour partielles.  
- Dépendre d’un module comptable externe pour la gestion des soldes → rejeté pour cette V1 afin de garder un flux de facturation simple et auto‑contenu.

---

## 4. Assemblées Générales, résolutions et votes

**Decision**: Utiliser `GeneralMeeting` + `GMResolution` + `GMVote` + `GMProxy` pour modéliser les AG, en stockant les règles de majorité au niveau de la résolution (champ `majorityRule` libre) et en calculant les résultats (quorum, voix, tantièmes) dans des services applicatifs dédiés, en s’appuyant sur les tantièmes des `SyndicateLot`.  
**Rationale**: Les règles légales de majorité peuvent être complexes et évolutives; les garder sous forme de texte métier dans `majorityRule` permet de commencer simplement tout en laissant la porte ouverte à un moteur de règles plus formalisé plus tard. Les calculs dynamiques (votesFor, votesAgainst, sharesFor, quorum) peuvent être mis à jour après saisie des votes.  
**Alternatives considered**:
- Encoder toutes les règles de majorité dans un enum fortement typé avec logique embarquée → jugé prématuré; le texte libre + documentation suffisent pour la première version, avec possibilité d’extension ultérieure.  
- Autoriser des votes proportionnels à plusieurs lots pour un même propriétaire sans passer par les `SyndicateLot` → rejeté pour garder une granularité au niveau du lot (source de vérité pour les tantièmes).

---

## 5. Notifications (WhatsApp / Email)

**Decision**: Réutiliser le système `NotificationTemplate` / `NotificationLog` et étendre l’enum `NotificationEvent` avec les événements syndic (`CHARGE_CALL_ISSUED`, `CHARGE_CALL_REMINDER`, `GENERAL_MEETING_CONVOCATION`, `GENERAL_MEETING_MINUTES`, `CONTRACT_RENEWAL_ALERT`, `COMMON_AREA_INCIDENT`). Implémenter des helpers dans `lib/syndics/notifications.ts` pour produire les événements à partir des IDs métier (chargeCallId, meetingId, etc.), en respectant les préférences de contact (WhatsApp/email) et les consentements.  
**Rationale**: Centraliser toutes les notifications dans le module existant évite la duplication de logique (logging, retries, gabarits) et simplifie le suivi auditable des envois. Les helpers spécifiques au syndic encapsulent la récupération de contexte (lots, propriétaires, montants, dates) sans exposer la mécanique interne de notifications au reste du code.  
**Alternatives considered**:
- Créer un système de notifications dédié au module syndic → rejeté car redondant et contraire au principe de service unique de notification.  
- Déclencher les envois uniquement par des jobs planifiés → conservé comme extension possible pour les relances, mais les premiers envois (émission appel, convocation AG) sont déclenchés à l’événement.

---

## 6. UI et UX pour les gestionnaires

**Decision**: Implémenter les pages dans `app/(dashboard)/syndics/*` en suivant l’arborescence proposée, et créer des composants réutilisables dans `components/syndics/*` (`SyndicateCard`, `LotTable`, `ChargeCallTable`, `MeetingAgenda`, `VoteBoard`, `ContractList`, `SyndicateFundWidget`, `DocumentVault`). Tous les textes visibles seront en français, et les listes seront paginées/filtrables côté API.  
**Rationale**: L’App Router Next.js permet de regrouper les sous‑vues (lots, charges, AG, prestataires, documents, finances) sous une même hiérarchie d’URL, ce qui colle bien au modèle mental d’une « fiche copropriété ». Les composants dédiés favorisent la réutilisation et gardent les pages focalisées sur la composition et la navigation.  
**Alternatives considered**:
- Centraliser toute la logique dans une seule page « SyndicDetail » avec onglets gérés côté client uniquement → rejeté pour limiter la complexité et profiter du découpage par routes.  
- Mélanger logique métier métier (calculs) dans les composants → rejeté au profit de services/queries côté serveur ou hooks dédiés.

---

## 7. Tests et qualité

**Decision**:  
- Côté backend : tests unitaires des services de calcul (répartition des charges, statut des appels, quorum et résultats de résolutions), tests d’API pour les principaux endpoints (`/api/syndics`, `/api/syndics/[id]/lots`, `/api/syndics/[id]/charges`, `/api/syndics/[id]/assemblees`, etc.), en visant ≥80 % de couverture sur ces services.  
- Côté frontend : tests de rendu et d’interactions clés (création copropriété, ajout de lot, émission d’un appel de charges, création d’AG et saisie de votes) avec React Testing Library.  
**Rationale**: Les flux financiers et de vote ont une forte sensibilité métier; la couverture de tests élevée est essentielle pour éviter les régressions. S’appuyer sur les patterns de test existants limite les nouveaux choix outillage.  
**Alternatives considered**:
- Tester principalement via des scénarios end‑to‑end uniquement → rejeté car trop coûteux, et moins précis pour cerner les erreurs de domain logic.  
- Ne tester que le backend → rejeté, les écrans syndic doivent aussi être robustes (UX et messages en français corrects).

---

## 8. Conclusion

Toutes les décisions ci‑dessus sont compatibles avec la Constitution ImmoTopia (français obligatoire en UI, stack imposée, multi‑tenant, qualité).  
Elles servent de base pour la définition détaillée du modèle de données (`data-model.md`), des contrats d’API (`contracts/openapi.yaml`) et du guide d’implémentation (`quickstart.md`) pour le module syndic.

