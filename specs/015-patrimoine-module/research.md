# Research: Module Gestion du Patrimoine

**Feature**: 015-patrimoine-module  
**Date**: 2026-03-10  
**Status**: Complete

## 1. Perimetre metier du module

**Decision**: Le module Patrimoine enrichit uniquement les biens existants et n'introduit aucun flux de creation/modification de donnees maitre du bien.

**Rationale**: Le besoin impose une separation stricte entre referentiel des biens et gestion patrimoniale pour eviter incoherences et duplications.

**Alternatives considered**:
- Ajouter une creation rapide de bien dans Patrimoine: rejete (violation de perimetre).
- Dupliquer certaines infos du bien dans les tables patrimoine: rejete (risque de derive et maintenance).

## 2. Modele de securite multi-tenant

**Decision**: Toute operation patrimoine passe par une verification systematique d'appartenance du bien a l'organisation active avant lecture/ecriture.

**Rationale**: Le module manipule des donnees financieres sensibles; la verification prealable est indispensable pour l'isolation tenant.

**Alternatives considered**:
- Filtrage uniquement au niveau des requetes enfants: rejete (risque de fuite via IDs valides).
- Controle uniquement middleware global: rejete (insuffisant sans verification de la ressource cible).

## 3. Strategie de calcul de rendement

**Decision**: Les calculs de rendement sont implementes en fonctions pures recevant des donnees deja chargees, sans acces base direct.

**Rationale**: Cette separation facilite testabilite, reutilisation dans API/UI et reduction des effets de bord.

**Alternatives considered**:
- Calculs directement dans les handlers API: rejete (couplage fort et tests plus fragiles).
- Calculs SQL agreges uniquement: rejete (moins portable et plus complexe a maintenir).

## 4. Generation de releves proprietaires

**Decision**: Creation du releve et de ses lignes en transaction atomique, puis envoi asynchrone via systeme de notification existant.

**Rationale**: Evite les releves partiels en cas d'erreur et maintient la coherence comptable du document transmis.

**Alternatives considered**:
- Creation entete puis lignes hors transaction: rejete (risque d'incoherence).
- Envoi inline avant persistence definitive: rejete (risque d'envoi d'un releve incomplet).

## 5. Notifications patrimoine

**Decision**: Reutiliser les templates/logs de notification existants pour les evenements `OWNER_STATEMENT_SENT`, `LOAN_MATURITY_ALERT`, `DOCUMENT_EXPIRY_ALERT`, `WORK_PROGRAM_REMINDER`.

**Rationale**: Standardise audit, canaux et politique de consentement sans creer une pile parallele.

**Alternatives considered**:
- Nouveau service de notification dedie patrimoine: rejete (duplication technique).
- Alertes non journalisees: rejete (non conforme aux besoins de tracabilite).

## 6. Contrats API et orchestration des routes

**Decision**: Exposer des endpoints REST dedies par bien (`/api/properties/{id}/...`) et portefeuille (`/api/patrimoine/...`) plus workflow releves (`/api/owner-statements/...`).

**Rationale**: Clarifie les responsabilites fonctionnelles et suit l'organisation demandee par les parcours metiers.

**Alternatives considered**:
- Endpoint unique aggregateur avec actions multiplexees: rejete (lisibilite et securisation plus difficiles).
- Endpoints par type d'entite sans contexte bien: rejete (friction pour l'usage quotidien par bien).

## 7. UI patrimoine dans l'existant

**Decision**: Integrer un onglet Patrimoine dans la fiche d'un bien existant et une section portefeuille dediee sans ecran de creation de bien.

**Rationale**: Respecte le parcours metier actuel et la contrainte absolue de non-creation de biens dans ce module.

**Alternatives considered**:
- Nouveau module autonome avec liste de biens propre: rejete (risque de duplication UX et confusion).
- Pages patrimoine uniquement globales sans vue par bien: rejete (insuffisant pour la gestion operationnelle).
