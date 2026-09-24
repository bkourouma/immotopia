# Plan — agences étanches et création d'agence en un clic

Rédigé le 24 septembre 2026, à la suite de l'audit multi-tenant du même jour.
« Tenant » désigne ici une **agence** cliente de la plateforme (modèle `Tenant`),
jamais un locataire.

## Objectif

1. Le super-admin crée une agence prête à l'emploi **en un clic** : agence
   active, modules, abonnement, paramètres, comptabilité de base et
   administrateur invité, le tout dans une seule opération.
2. **Aucune donnée ne traverse d'une agence à l'autre** : ni en lecture, ni en
   écriture, ni par une référence glissée dans un formulaire. L'étanchéité ne
   repose plus sur la seule discipline de chaque service : elle est vérifiée par
   un garde-fou actif et par des tests qui échouent si une route ou un modèle
   échappe à la règle.

## Constats de départ

| # | Gravité | Constat | Lieu |
|---|---|---|---|
| 1 | Critique | `GET /api/tenants/:tenantId` et `GET /api/tenants/slug/:slug` sont publics et renvoient des `User` complets, `passwordHash` compris | `routes/tenant-routes.ts:37,53`, `services/tenant-service.ts:35-79` |
| 2 | Critique | `getPropertyById` ne vérifie l'agence que pour les biens `TENANT` : un bien `CLIENT` d'une autre agence se lit, se modifie et se supprime | `services/property-service.ts:298` |
| 3 | Élevée | Le garde-fou Prisma est inerte : `withTenantContext` n'est monté nulle part, 47 modèles sur 122 listés, accès par id ignorés, `TENANT_GUARD_MODE` absent de `env.ts` | `utils/prisma-tenant-guard-extension.ts` |
| 4 | Élevée | Une agence suspendue reste accessible : la suspension révoque les sessions, mais `requireTenantAccess` ne lit pas `Tenant.status`, donc une reconnexion suffit | `middleware/tenant-middleware.ts` |
| 5 | Moyenne | `RentalDocument.document_number` unique sur toute la plateforme | `prisma/schema.prisma:2169` |
| 6 | Moyenne | Facture fournisseur : `siteId` et `costCategoryId` des imputations non vérifiés ; `assertSiteOpenTx` se tait si le chantier est d'une autre agence | `lib/finance/suppliers.ts:377` |
| 7 | Mineure | `managerId` d'un chantier non vérifié ; portail propriétaire sans filtre d'agence à la source ; `calculateQualityScore` non filtré ; `data.tenantId` lu du corps dans `property-controller` ; `GET /api/roles/menu-access/me` accepte un `tenantId` non vérifié | `lib/finance/sites.ts:313`, `middleware/owner-portal-access.ts:50`, `property-quality-service.ts:31`, `property-controller.ts:31,487`, `role-controller.ts:300` |
| 8 | Mineure | `tests/integration/isolation.test.ts` n'est jamais exécuté (hors des `roots` de Jest) | `jest.config.*` |
| 9 | Fonctionnel | La création d'agence n'écrit qu'une ligne `Tenant` au statut `PENDING` : ni module, ni abonnement, ni administrateur | `services/tenant-service.ts:89` |
| 10 | Fonctionnel | Abonnement, factures SaaS, logo et couleur existent côté API sans écran ; pas de sélecteur d'agence pour un utilisateur rattaché à plusieurs agences | `apps/web/src/pages/admin/*`, `context/AuthContext.tsx` |
| 11 | Architecture | Un seul expéditeur e-mail (« ImmoTopia ») et un seul numéro WhatsApp pour toutes les agences | `services/email-service.ts`, `services/providers/whatsapp.provider.ts` |

Zones auditées par sondage seulement (à couvrir au lot B) : CRM hors affaires,
communications, génération de documents, newsletter, abonnements, adhésions,
statistiques.

Diagnostic base de démonstration (24/09) : 4 agences, 0 bien et 0 visite sans
`tenant_id`, 0 bien `CLIENT`, 105 documents numérotés. Rendre les `tenantId`
obligatoires est donc possible sans reprise de données.

---

## Lot A — Failles critiques (à livrer en premier, seul)

**A1. Routes publiques d'agence.**
- `GET /api/tenants/:tenantId` : `authenticate` + `requireTenantAccess`, et un
  `select` explicite dans `getTenantById` (aucun `include: { user: true }` nu).
- `GET /api/tenants/slug/:slug` et `GET /api/tenants` : restent publiques
  (vitrine, inscription client) mais ne renvoient que `id, name, slug, type,
  logoUrl, brandingPrimaryColor, city, country`.
- Règle générale ajoutée à `AGENTS.md` : aucun `include: { user: true }` —
  toujours un `select` sur `User`.

**A2. Biens.** `getPropertyById` exige un `tenantId` (paramètre obligatoire) et
refuse tout bien dont `tenantId` diffère, quel que soit `ownershipType`, sauf
mandat actif de l'agence (même règle que `property-ownership-middleware.ts`).
`updateProperty`, `deleteProperty` et les sous-biens en héritent.

**A3. Agence suspendue.** `requireTenantAccess` et `userHasTenantAccess`
refusent l'accès (403 « Agence suspendue ») quand `Tenant.status = SUSPENDED`,
super-admin excepté. Les portails locataire et propriétaire aussi.

**A4. Tests** de non-régression pour A1 à A3.

## Lot B — Références entre agences

Toute référence reçue dans un corps de requête (`siteId`, `propertyId`,
`contactId`, `leaseId`, `supplierId`, `managerId`, `costCategoryId`…) est
vérifiée comme appartenant à l'agence avant écriture.

- B1. `suppliers.ts` : vérifier `siteId` et `costCategoryId` de chaque
  imputation ; `assertSiteOpenTx` lève `NotFoundError` quand le chantier est
  introuvable pour l'agence (vérifier ses autres appelants).
- B2. `sites.ts` : `managerId` doit être membre actif de l'agence.
- B3. Portails : `owner-portal-access` filtre les biens par `tenantId` ; les
  portails résolvent le `TenantClient` de façon déterministe et, pour un client
  de plusieurs agences, selon l'agence choisie (voir lot F3).
- B4. `property-quality-service` filtre par agence lui-même.
- B5. Supprimer `data.tenantId = req.body.tenantId` dans `property-controller` ;
  `GET /api/roles/menu-access/me` passe par `requireTenantAccess`.
- B6. Passe complète sur les zones non auditées (liste ci-dessus), avec
  correction au fil de l'eau.
- B7. Un utilitaire commun `assertBelongsToTenant(tx, model, id, tenantId)`
  remplace les `findFirst` recopiés, sur le modèle de `property-tenant-guard.ts`.

## Lot C — Schéma

- C1. `RentalDocument` : `@@unique([tenant_id, document_number])` à la place du
  `@unique` global (migration sans perte).
- C2. `tenantId` rendu obligatoire là où il est facultatif sans raison métier
  (`Property`, `PropertyVisit` et les autres `String?` des lignes 1335-1520).
  Restent facultatifs, par conception : `UserRole.tenantId` (rôle plateforme) et
  `AuditLog.tenantId` (action plateforme).
- C3. Cohérence croisée non exprimable en Prisma (`LotOwnerProfile` ↔ contact,
  `StockCountLine` ↔ article) : contrôle applicatif + test.

## Lot D — Garde-fou Prisma actif

- D1. Le contexte d'agence est posé **dans** `requireTenantAccess` et dans les
  deux middlewares de portail (`runWithTenantContext` autour de `next()`) : plus
  de middleware séparé à oublier.
- D2. La liste des modèles cloisonnés est **déduite du schéma** (`Prisma.dmmf` :
  tout modèle portant `tenantId` ou `tenant_id`) au lieu d'une liste à la main.
  Un nouveau modèle est couvert dès sa création.
- D3. Couverture étendue : `findUnique`, `update`, `delete`, `upsert` exigent
  aussi le champ d'agence dans leur `where` (Prisma 5 accepte des filtres non
  uniques dans un `WhereUnique`). En lecture, contrôle du résultat : une ligne
  d'une autre agence est rejetée.
- D4. Modèles enfants sans `tenantId` (syndic, lignes de factures…) : liste
  d'exemptions explicite dans le code, avec le parent qui les rattache.
- D5. `TENANT_GUARD_MODE` passe par `config/env.ts` et est documenté dans
  `env.example`. Séquence : `warn` en développement → corriger toutes les
  alertes (lancer les scénarios E2E existants) → `enforce` en test puis en
  production.
- D6. Tâches planifiées et routes super-admin : contexte explicite, par agence
  pour les tâches (`runWithTenantContext` à chaque itération), « plateforme »
  déclaré pour les routes `/api/admin` qui lisent volontairement toutes les
  agences.

## Lot E — Tests d'étanchéité automatisés

- E1. Brancher `tests/integration` dans Jest (base de test dédiée) et réécrire
  `isolation.test.ts` : deux agences A et B ; pour chaque ressource, B crée,
  A tente `GET`, `PATCH`, `DELETE` → 404 ; les listes de A ne contiennent rien
  de B ; une création de A qui référence un objet de B → 404.
- E2. Test d'inventaire des routes : parcourt la pile Express et échoue si une
  route n'a ni `requireTenantAccess`, ni middleware de portail, ni permission
  plateforme, hors liste blanche des routes publiques.
- E3. Test du schéma : chaque modèle a un champ d'agence, figure dans la liste
  des enfants rattachés (D4) ou dans la liste des modèles globaux (`User`,
  `Role`, `Country`…).
- E4. Test : aucune réponse d'API ne contient la clé `passwordHash`.

## Lot F — Création d'agence en un clic

**F1. Service `provisionTenant`** (une transaction, tout ou rien) :
1. `Tenant` au statut `ACTIVE`, slug généré et rendu unique (suffixe `-2`,
   `-3`…).
2. `TenantModule` selon le type et l'offre (défauts ci-dessous).
3. `Subscription` : offre choisie, période d'essai de 30 jours par défaut.
4. `AgencyFinanceSettings` par défaut.
5. Socle comptable : plan de comptes, journaux, compte de trésorerie par
   défaut, paramètres de stock — en appelant les `ensure*Tx` existants
   (`accounting.ts`, `treasury/accounts.ts`, `stock-referentiel.ts`,
   `owner-account/accounts.ts`), aujourd'hui créés à la première utilisation.
6. Administrateur : `User` créé s'il n'existe pas (réutilisé sinon, il sera
   alors membre de plusieurs agences), `Membership` + rôle `TENANT_ADMIN`,
   `Invitation` avec jeton.
7. Journal d'audit `TENANT_CREATED` + `TENANT_PROVISIONED`.

Après validation de la transaction : envoi de l'e-mail d'invitation. Un échec
d'envoi n'annule pas la création ; le lien reste affiché et renvoyable.

Clé d'idempotence (en-tête `Idempotency-Key`) : un double clic ne crée pas deux
agences.

**F2. Endpoint** `POST /api/admin/tenants` (remplace l'actuel), permission
`PLATFORM_TENANTS_CREATE`. `POST /api/tenants` (alias) est supprimé.

**F3. Écrans.**
- Liste des agences : bouton « Nouvelle agence » → panneau latéral, quatre
  champs obligatoires (nom de l'agence, nom et e-mail de l'administrateur,
  offre), le reste replié sous « Plus d'options » (type, modules, pays, ville,
  téléphone, logo, couleur). Un bouton « Créer l'agence ».
- Écran de confirmation : ce qui a été créé, lien d'invitation à copier, état
  de l'e-mail, boutons « Renvoyer l'invitation » et « Ouvrir la fiche ».
- Sélecteur d'agence dans l'en-tête pour tout utilisateur rattaché à plusieurs
  agences ; changer d'agence vide les caches de données du front.

## Lot G — Administration complète des agences

- G1. Onglet Abonnement : changer d'offre, de cycle, résilier, réactiver.
- G2. Onglet Factures SaaS : liste, création, marquer payée (API existante).
- G3. Fiche agence : logo, couleur, site, e-mail de contact, statut éditables
  (admin) ; logo et couleur aussi dans les paramètres de l'agence.
- G4. Onglet Activité (endpoint `/activity` existant, jamais affiché).
- G5. Suspension : bandeau explicite côté agence suspendue, au lieu d'un 403 nu.

## Lot H — Identité d'envoi par agence

- H1. E-mails : nom d'expéditeur = nom de l'agence, `Reply-To` = e-mail de
  contact de l'agence, sur le compte SMTP de la plateforme.
- H2. (Hors plan, à décider) compte SMTP ou numéro WhatsApp propre à chaque
  agence, et routage des messages WhatsApp entrants vers la bonne agence.

## Hors périmètre, à décider plus tard

Suppression et export des données d'une agence, inscription d'agence en
libre-service, connexion « en tant que », quotas par offre, rôles propres à une
agence, devise et langue par agence.

---

## Ordre et dépendances

```text
A ──► B ──► C ──► D ──► E
 └──────► F ──► G ──► H
```

- A seul d'abord : il ferme les deux fuites exploitables aujourd'hui.
- B et C avant D : le garde-fou en `enforce` casserait sinon les chemins encore
  non filtrés.
- E en dernier sur la branche sécurité : il verrouille l'acquis.
- F dépend seulement de A (A3 fixe le sens de `status`). F, G et H peuvent
  avancer en parallèle de B à E, sur des fichiers distincts.

## Décisions retenues par défaut [D]

| Sujet | Défaut |
|---|---|
| Mot de passe de l'administrateur | [D] Invitation : il choisit son mot de passe via le lien. Le super-admin ne voit jamais de mot de passe. |
| Offre et essai | [D] Offre choisie dans le formulaire, `PRO` présélectionnée, 30 jours d'essai. |
| Modules par défaut | [D] `AGENCY` → Agence ; `OPERATOR` → Agence + Syndic + Promoteur. Modifiables dans le formulaire. |
| Statut à la création | [D] `ACTIVE` immédiatement ; l'agence est utilisable dès l'acceptation de l'invitation. |
| Garde-fou en production | [D] `enforce` une fois les alertes corrigées et les tests E verts. |
| Identité d'envoi | [D] H1 seulement (nom + Reply-To de l'agence) ; comptes propres par agence reportés. |

## Définition de « terminé »

- Les tests E1 à E4 passent et tournent dans `npm test`.
- `TENANT_GUARD_MODE=enforce` en test, aucune alerte pendant les scénarios E2E.
- Un super-admin crée une agence depuis la liste ; l'administrateur invité
  accepte, se connecte et trouve une agence vide, fonctionnelle (bien, bail,
  quittance, facture fournisseur) sans aucune donnée d'une autre agence.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:web` verts ;
  aucune nouvelle erreur TypeScript dans les fichiers propres.

---

## Bilan d'exécution (24 septembre 2026)

Branche `feat/multi-tenant-etanche`. Tous les lots A à H sont livrés.

| Lot | Livré |
|---|---|
| A | Routes publiques d'agence restreintes, filtre global des secrets dans les réponses, biens `CLIENT` cloisonnés, agence suspendue bloquée (API, fichiers, portails). |
| B | Références vérifiées dans finance, biens, patrimoine, syndic, locatif, ventes, maintenance, CRM, newsletter, documents ; `assertBelongsToTenant` ; utilisateur désigné = membre actif. Fuites supplémentaires trouvées et fermées : mandats et historique de statut d'un bien d'une autre agence, visites d'un bien en co-mandat. |
| C | `RentalDocument` : `@@unique([tenant_id, document_number])` (migration `20260926090000_document_number_par_agence`, appliquée). Aucun `tenantId` rendu obligatoire : un bien `PUBLIC` de particulier n'a pas d'agence, ses enfants héritent de ce choix. |
| D | Garde-fou déduit du schéma (122 modèles), id compris, résultat contrôlé ; contexte posé par `requireTenantAccess`, les portails et les jobs ; `TENANT_GUARD_MODE` dans `env.ts`. Mode par défaut : `warn`. |
| E | `routes-inventory`, `schema-tenant-coverage`, `no-secret-in-responses` dans `npm test` ; `npm run test:isolation` sur la base `immotopia_isolation_test` (16 scénarios). |
| F | `provisionTenant` (une transaction, ~2 s, idempotent), panneau « Nouvelle agence » et écran de confirmation, sélecteur d'agence, en-tête `X-Portal-Tenant-Id`. |
| G | Onglets Abonnement, Factures, Activité ; logo et couleur (admin et agence) ; bandeau d'agence suspendue. |
| H | Expéditeur « <Agence> via ImmoTopia » et `Reply-To` de l'agence. |

### Reste à faire

- **Passer `TENANT_GUARD_MODE` à `enforce`.** D'abord faire tourner l'application
  en `warn` sur les scénarios E2E et corriger chaque alerte. Cas connu à traiter
  avant : un bien `CLIENT` sous mandat porte le `tenantId` de son agence
  d'origine, pas celui de l'agence mandataire — le contrôle du résultat le
  signalera comme une fuite alors que l'accès est légitime.
- `npm run test:isolation` couvre contact, bien et ticket ; ajouter bail,
  échéance, copropriété, fournisseur, chantier, mandat de vente, document
  (une ligne par ressource dans le tableau `RESOURCES`).
- Écran des gabarits de documents : afficher aussi les gabarits globaux, en
  lecture seule (le serveur refuse désormais de les modifier depuis une agence).
- `services/subscription-service.ts` et `statistics-service.ts` (web) appellent
  de mauvaises routes ; les nouveaux écrans ne s'en servent pas. À corriger ou
  supprimer.
- Hors plan, à décider : SMTP ou numéro WhatsApp propre à chaque agence,
  suppression et export d'une agence, inscription en libre-service, quotas par
  offre, rôles propres à une agence, devise par agence.
