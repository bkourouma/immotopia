# Feature Specification: Espace particulier en libre-service et palier gratuit

**Feature Branch**: `[026-particuliers-libre-service]`
**Created**: 2026-09-29
**Status**: Draft
**Décision d'architecture**: [ADR-005](../../docs/architecture/adr/ADR-005-patrimoine-multi-actifs.md) (décision 10, lot 4)
**Précédents**: [023](../023-patrimoine-multi-actifs/spec.md), [024](../024-patrimoine-valorisation-par-classe/spec.md), [025](../025-patrimoine-projections-simulations/spec.md)
**Input**: « Mon objectif c'est de pouvoir toucher beaucoup de personnes […] ImmoTopia n'a
actuellement pas de client donc je veux ratisser large. » Un particulier de l'UEMOA s'inscrit seul,
obtient son espace de patrimoine, démarre gratuitement, et paie un palier supérieur par mobile money.

## Décisions du propriétaire du produit (2026-09-29)

| Sujet            | Décision                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Seuil gratuit    | **10 actifs de tout type**, non archivés ; un actif immobilier lié à un bien compte une fois                          |
| Nature du palier | **Gratuit durable** ; au-delà du seuil, l'**ajout** d'un actif est refusé, la lecture reste possible                  |
| Application      | **Garde propre au palier gratuit** ; `SUBSCRIPTION_ENFORCEMENT` global et les agences en production restent inchangés |
| Palier payant    | **Nouveau pack particulier moins cher** ; prix et plafond provisoires, ajustables sans migration (voir plan)          |
| Paiement         | Mobile money via PaySecureHub (déjà présent) ; validation réelle impossible sans identifiants de production           |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Créer mon espace de patrimoine seul (Priority: P1)

Un visiteur s'inscrit avec e-mail et mot de passe, vérifie son e-mail, se connecte, puis crée son espace
personnel en quelques champs. Il arrive directement sur son patrimoine, sans intervention d'un administrateur.

**Independent Test**: parcourir inscription, vérification, connexion, création d'espace et vérifier
l'espace créé (type, modules, abonnement gratuit, rôle, accès).

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté à l'e-mail vérifié sans espace, **When** il crée son espace, **Then**
   un espace de type particulier est créé avec le seul module Patrimoine, un abonnement gratuit actif,
   lui-même administrateur, et il est redirigé vers son patrimoine.
2. **Given** un utilisateur dont l'e-mail n'est pas vérifié, **When** il tente de créer un espace, **Then**
   c'est refusé avec un message clair.
3. **Given** un utilisateur qui a déjà un espace particulier, **When** il tente d'en créer un second,
   **Then** c'est refusé (un espace personnel par personne) sans créer de doublon, même en cas de double clic.
4. **Given** deux requêtes de création simultanées du même utilisateur, **When** elles s'exécutent,
   **Then** un seul espace est créé.
5. **Given** un utilisateur rattaché à une agence, **When** il consulte son compte, **Then** rien ne change
   pour lui ; la création d'espace personnel reste possible s'il n'en a pas.

---

### User Story 2 - Démarrer gratuitement, limité à 10 actifs (Priority: P1)

Le particulier ajoute jusqu'à 10 actifs gratuitement. Au 11e, l'ajout est refusé avec l'invitation à passer
au palier payant ; il peut toujours consulter, modifier, archiver ses actifs et projeter.

**Acceptance Scenarios**:

1. **Given** un espace gratuit avec 9 actifs non archivés, **When** il en crée un 10e, **Then** c'est accepté.
2. **Given** 10 actifs non archivés, **When** il en crée un 11e, **Then** c'est refusé (409, code
   `FREE_TIER_LIMIT`, avec limite 10 et usage 10) et rien n'est créé.
3. **Given** 10 actifs dont 1 archivé, **When** il en crée un nouveau, **Then** c'est accepté (les archivés
   ne comptent pas).
4. **Given** 10 actifs, **When** il modifie, archive, valorise ou projette, **Then** tout reste possible.
5. **Given** un actif immobilier lié à un bien, **When** le compteur est calculé, **Then** il compte pour un
   seul actif (jamais le bien et l'actif).
6. **Given** un actif immobilier qui serait créé automatiquement à la première valorisation d'un
   bien (lot 1) alors que la limite est atteinte, **When** la valorisation est saisie, **Then** elle reste
   enregistrée, l'actif n'est pas créé, et la limite est rappelée par le bandeau d'usage et à la prochaine
   création d'actif.
7. **Given** une agence existante (pack Agence, Syndic, Promoteur ou Patrimoine), **When** elle crée des
   actifs, **Then** sa limite reste celle du lot 1 (500), inchangée.

---

### User Story 3 - Passer au palier payant et payer par mobile money (Priority: P2)

Le particulier choisit le palier payant, obtient une facture, et paie via PaySecureHub (Orange Money, Wave,
MTN, Moov, carte). Son espace passe au palier payant dès la confirmation du paiement.

**Acceptance Scenarios**:

1. **Given** un espace gratuit, **When** l'utilisateur demande le palier payant, **Then** une facture est
   créée pour le prix du palier (TVA comprise) et un paiement PaySecureHub est démarré.
2. **Given** un paiement confirmé par la réconciliation serveur, **When** elle s'exécute, **Then**
   l'abonnement passe au palier payant, le plafond monte, et l'utilisateur peut ajouter des actifs.
3. **Given** un paiement annulé ou échoué, **When** la réconciliation s'exécute, **Then** l'espace reste
   gratuit et l'utilisateur peut réessayer.
4. **Given** le mode simulateur (aucune clé réelle), **When** le paiement est simulé, **Then** le parcours
   complet est testable.
5. **Given** une notification de paiement dont le corps affirme un succès, **When** elle arrive, **Then**
   rien n'est cru sur parole : le statut est redemandé au fournisseur (mécanisme existant).

---

### User Story 4 - Ne pas être exposé à des fonctions sans objet (Priority: P2)

Le particulier ne voit que ce qui lui sert : patrimoine, valeur nette, projections, ses biens et ses baux
s'il loue. Il ne voit ni copropriété, ni chantiers, ni ventes, ni gestion de mandats.

**Acceptance Scenarios**:

1. **Given** un espace particulier, **When** il ouvre le menu, **Then** seuls les groupes utiles sont
   présents, **même quand** `SUBSCRIPTION_ENFORCEMENT` vaut `warn`.
2. **Given** un espace particulier, **When** il ouvre son tableau de bord, **Then** il voit son patrimoine
   (valeur nette) et non des indicateurs d'agence vides.
3. **Given** un espace particulier, **When** il appelle une route d'un module qu'il n'a pas (Syndic,
   Chantiers), **Then** c'est refusé.

---

### User Story 5 - Limiter les abus d'inscription (Priority: P2)

L'inscription libre ne doit pas permettre de créer des milliers d'espaces jetables ni de sonder les comptes.

**Acceptance Scenarios**:

1. **Given** plus de 3 inscriptions par heure depuis la même adresse IP, **When** une nouvelle arrive,
   **Then** elle est refusée (429).
2. **Given** l'inscription avec une adresse déjà utilisée, **When** elle est soumise, **Then** la réponse
   ne permet pas de savoir si l'adresse existe (même message de succès).
3. **Given** une instance sans serveur d'e-mails, **When** un utilisateur s'inscrit, **Then** la création
   d'espace personnel reste refusée tant que l'e-mail n'est pas réellement vérifié.

---

## Edge Cases

- Un espace gratuit qui dépasse déjà le seuil (données importées, seuil abaissé) : lecture et modification
  permises, ajout refusé.
- Rétrogradation d'un espace payant vers le gratuit : hors périmètre (voir plan) ; aucune donnée n'est
  supprimée automatiquement.
- Le téléphone (nécessaire au paiement mobile money) est demandé à la création de l'espace et validé au
  format international UEMOA ; il peut être complété avant de payer.
- Un utilisateur connecté à plusieurs espaces choisit son espace courant comme aujourd'hui.
- Suppression de l'espace ou du compte : hors périmètre (décision produit ouverte : conservation des
  données) ; la spec ne promet aucune suppression.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Le système MUST proposer une création d'espace personnel authentifiée et idempotente,
  réservée aux utilisateurs à e-mail vérifié, créant en une transaction : espace de type particulier,
  module Patrimoine seul, abonnement gratuit actif, appartenance active, rôle administrateur.
- **FR-002**: Un utilisateur MUST avoir au plus un espace personnel ; la garde MUST tenir sous concurrence.
- **FR-003**: Le pack gratuit MUST avoir un prix nul, une capacité de 10 actifs et ne MUST NOT émettre de
  facture périodique à zéro.
- **FR-004**: La création d'actif MUST être refusée (409, `FREE_TIER_LIMIT`, avec limite et usage) au-delà
  de la limite du palier gratuit, quel que soit `SUBSCRIPTION_ENFORCEMENT`, uniquement pour les espaces
  dont le pack porte cette capacité ; les autres espaces gardent le plafond du lot 1.
- **FR-005**: Le compteur MUST compter les actifs non archivés une fois chacun, y compris les actifs
  immobiliers créés automatiquement.
- **FR-006**: Un pack payant particulier MUST exister (prix et plafond provisoires, modifiables dans le
  catalogue) ; le passage gratuit vers payant MUST relever la limite dès la confirmation du paiement.
- **FR-007**: Le passage au palier payant MUST créer une facture puis un paiement PaySecureHub depuis une
  route de l'espace (permission `TENANT_SETTINGS_EDIT`), sans intervention d'un super-administrateur.
- **FR-008**: La navigation d'un espace particulier MUST masquer les modules absents indépendamment du
  mode global d'application des quotas.
- **FR-009**: L'inscription MUST être limitée par IP avec un magasin résistant au redémarrage, et MUST NOT
  révéler l'existence d'une adresse.
- **FR-010**: Tous les libellés MUST passer par `t()` (fr, en, ar), toute marge par une propriété
  logique ; les routes MUST passer `routes-inventory` ; l'étanchéité entre espaces MUST être testée ; le
  wiki des fonctionnalités MUST être mis à jour ; le budget d'entrée web MUST rester tenu.

### Key Entities

- **Tenant** (`TenantType` gagne `PARTICULIER`), **Subscription** et **SubscriptionItem** existants.
- **CatalogItem** : deux nouveaux packs (gratuit, payant particulier) et une nouvelle capacité d'actifs.
- **Membership** et rôle existants ; aucun nouveau rôle au lot 4 (voir plan).

## Assumptions & Dependencies

- Dépend des lots 1 à 3 (actifs, valeur nette, projections) et de l'infrastructure d'abonnement et de
  paiement existante.
- Le prix et le plafond du pack payant particulier sont **provisoires** : le produit les fixe.
- Le paiement réel n'est pas testable sans identifiants PaySecureHub ; tout le reste passe par le
  simulateur existant.
- La suppression de compte, l'export libre-service, les consentements et la conservation des données sont
  des décisions produit et juridiques ouvertes : le lot 4 ne les promet pas et les liste dans le plan.

## Success Criteria _(mandatory)_

- **SC-001**: un visiteur atteint son patrimoine vide en moins de 3 minutes sans aide.
- **SC-002**: 100 % des créations concurrentes d'un même utilisateur produisent au plus un espace.
- **SC-003**: le 11e actif d'un espace gratuit est refusé dans 100 % des cas, en mode global `warn`.
- **SC-004**: aucune agence existante ne change de comportement (suites de non-régression vertes).
- **SC-005**: le parcours de paiement complet passe en mode simulateur.
