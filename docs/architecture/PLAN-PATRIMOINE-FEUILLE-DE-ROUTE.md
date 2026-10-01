# Plan — feuille de route « gestion du patrimoine » (vague 2)

Statut : **en exécution** — décidé le 2026-10-01 à partir d'une proposition de
fonctionnalités fournie par l'utilisateur (14 capacités) et d'un audit du code.
Processus : [DEV_PROCESS.md](../workflows/DEV_PROCESS.md), piloté par
[LEAD_PROCESS.md](../workflows/LEAD_PROCESS.md). Numéros de spec réservés : 029 à 040.

## 1. Constat de l'audit (état au 2026-10-01)

| #   | Capacité                                   | Sur `main` | Remarque structurante                                                                             |
| --- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------- |
| 1   | Vue Groupe / associés                      | PARTIEL    | consolidation par entité seulement ; aucun modèle d'associé                                       |
| 2   | Import en masse (biens, baux, locataires…) | PARTIEL    | moteur Excel navigateur existant (finance) à étendre par descripteurs de nature                   |
| 3   | Hypothèses de projection côté serveur      | PARTIEL    | `localStorage` seulement ; l'API est déjà paramétrable                                            |
| 4   | Suivi d'avancement foncier (ACD, titre)    | ABSENT     | seulement un type de document et un champ « type de titre »                                       |
| 5   | Démembrement (nue-propriété / usufruit)    | ABSENT     | indivision et quotes-parts existent ; fort rayon d'impact (comptes, relevés, fiscalité)           |
| 6   | Export fiscal DGI (e-Impôts CI / Mali)     | PARTIEL    | moteur fiscal prêt, 36 paramètres dont 35 `A_VALIDER` ; aucun formulaire officiel                 |
| 7   | Plan de trésorerie prévisionnel            | PARTIEL    | briques dispersées (échéances, emprunts, travaux, charges) ; aucun plan agrégé                    |
| 8   | Ratios bancaires (DSCR, TRI, LTV)          | PARTIEL    | brut/net/net-net existent ; DSCR, TRI, LTV, cash-on-cash absents                                  |
| 9   | Fiche / dossier bancaire                   | PARTIEL    | exports PDF/Excel existants ; pas de dossier                                                      |
| 10  | WhatsApp / SMS / lien sécurisé             | PARTIEL    | WhatsApp câblé sur un seul événement ; SMS absent de `main` ; aucune infrastructure de lien signé |
| 11  | Multi-devises d'affichage                  | PARTIEL    | champ `currency` partout, aucune conversion ; « XOF » et « FCFA » coexistent                      |
| 12  | Paiement Mobile Money par lien             | PARTIEL    | paiement en ligne depuis le portail locataire connecté ; aucun lien initié par l'agence           |
| 13  | Sinistres, assurances, carnet d'entretien  | ABSENT     | briques : document `INSURANCE`, tickets de maintenance, programmes de travaux                     |
| 14  | Accès « tiers de confiance » (notaire…)    | ABSENT     | trois portails connectés ; aucun rôle invité, aucune expiration d'accès                           |

**Chantier en vol hors `main`** : le multi-actifs (specs 023 à 026, ADR-005 : modèle `Asset`,
projections, scénarios, espace particulier, export de la valeur nette), porté par les PR
ouvertes #52, #67, #69, #70, #74 empilées sur `feat/patrimoine-lot5-exports` (~34 000 lignes), et
la branche SMS (`feat/sms-lot-1`, spec 020). Il réécrit `consolidation-service.ts`, `export/*`
et la projection. **Les capacités 1, 8 (export), 9 et 11 touchent ces fichiers : elles attendent
la fusion de ces PR (décision de l'utilisateur) et se planifient ensuite.**

## 2. Principes d'exécution

- **Vagues de 3 lots au plus en parallèle** : le poste est lent (deux Jest lourds en parallèle
  font tomber tout en délai) et le disque presque plein (3 `node_modules` propres ≈ 3,6 Go).
- **Un lot = une branche `feat/patrimoine-<sujet>` depuis `origin/main`**, un worktree dédié
  `.claude/worktrees/pat-<sujet>`, une PR. Un lot qui change le schéma Prisma a ses **propres**
  dépendances (`npm ci`, pas de jonction), sinon le client Prisma généré est partagé et se
  désynchronise.
- **Spec d'abord** (`specs/<n>-<sujet>/spec.md` + `plan.md`, format de `specs/015-…`), puis
  implémentation par territoire de fichiers, jamais deux agents sur le même fichier.
- **Définition de fini d'un lot** : tests ciblés verts, `typecheck` sans nouvelle erreur, lint,
  `check:architecture`, `test:isolation` si modèle ou route à identifiant de tenant, relecture
  `code-reviewer` + `security-auditor` pour tout lien public, jeton, accès tiers ou paiement, mise à
  jour du wiki des fonctionnalités + `npm run wiki:export`, `i18n:extract` (fr clé, en, ar),
  migration additive à horodatage > `20261006150000`, `DATA_MODELS.md`.
- **Recette** : après chaque vague fusionnée, scénarios navigateur par le processus démo/debug
  (`demo-orchestrator` / `ui-tester`) sur une instance dédiée.
- **Le Pilote** commite, pousse et ouvre les PR ; les agents d'un lot n'exécutent aucune commande
  git qui modifie l'arbre ou l'index. **La fusion reste à l'utilisateur.**
- Le classeur du wiki est binaire : en cas de conflit à la fusion, reprendre la version de `main`
  et réappliquer les lignes du lot (voir `docs/fonctionnalites/README.md`).

## 3. Lots

### Vague A — isolables, sur `main`, lancés en premier

**Lot A1 — spec 029 · Hypothèses de projection serveur + ratios bancaires** (capacités 3 et 8)

- Modèle `PropertyYieldAssumption` (par bien, 5 hypothèses) ; routes `GET/PUT /properties/:id/yield/assumptions` ;
  le front lit le serveur et **migre une seule fois** le contenu du `localStorage`.
- Ratios dans `lib/patrimoine/yield.ts` : **DSCR** = (loyers − charges d'exploitation) / mensualités
  d'emprunt annualisées ; **LTV** = capital restant dû / valeur estimée ; **cash-on-cash** = cash-flow net
  annuel / fonds propres investis ; **TRI** sur l'horizon projeté avec valeur terminale = valeur projetée.
  Affichés sur l'onglet Patrimoine du bien et la performance. Pas d'export ici (attend la vague C).
- Territoire : `lib/patrimoine/{yield,schemas}.ts`, contrôleur et routes de rendement, `PropertyPatrimoineTab`,
  `yield-assumptions-storage.ts`, schéma + migration, tests.

**Lot A2 — spec 030 · Plan de trésorerie prévisionnel** (capacité 7)

- Fonction pure `lib/patrimoine/cash-plan.ts` : par mois sur 12 ou 24 mois, loyers attendus (échéances),
  mensualités d'emprunt (amortissement calculé), travaux planifiés, charges récurrentes, taxe foncière estimée.
- `PropertyExpense` gagne une **périodicité** (ponctuelle, mensuelle, trimestrielle, annuelle) ;
  la date d'exigibilité de la taxe foncière est un **paramètre d'agence sans valeur par défaut inventée** :
  tant qu'elle n'est pas renseignée, la taxe n'entre pas dans le plan et l'écran le dit.
- `GET /patrimoine/cash-plan?months=` ; page « Trésorerie prévisionnelle » (graphique + alerte de creux :
  mois où le cumul prévisionnel devient négatif, solde de départ saisi).
- Territoire : `lib/patrimoine/cash-plan.ts`, nouvelle route/contrôleur, `PropertyExpense` + migration, page web.

**Lot A3 — spec 031 · Canaux WhatsApp patrimoine + liens sécurisés** (capacité 10, sans SMS)

- Nouvelles clés d'événement WhatsApp et e-mail : échéance de bail, document à renouveler, rapport mensuel
  propriétaire ; branchement dans `lib/patrimoine/notifications.ts` sur le patron de `sendOwnerStatement`
  (consentement WhatsApp et téléphone vérifiés, canal préféré du contact).
- **Infrastructure de lien sécurisé** `lib/secure-links` (réutilisée ensuite par les lots paiement et tiers de
  confiance) : jeton aléatoire, **haché en base**, expiration (7 jours par défaut), portée (rapport d'un
  propriétaire), révocation, lecture seule, route publique avec limiteur de débit, inscrite à la liste
  blanche de `routes-inventory.test.ts` avec sa justification, chaque consultation journalisée.
- Rapport mensuel propriétaire envoyé par WhatsApp/e-mail avec ce lien.
- **Hors lot** : SMS (attend la fusion de `feat/sms-lot-1`) ; `WHATSAPP_PROVIDER` doit passer par
  `config/env.ts` pour tout code neuf (dérive existante signalée, non corrigée ici).
- Territoire : `lib/secure-links/*`, `lib/patrimoine/notifications.ts`, catalogues de notification et
  `notification-key-features.ts`, route publique, schéma + migration, tests.

### Vague B — après la vague A

**Lot B1 — spec 032 · Sinistres, assurances, carnet d'entretien** (capacité 13) : `InsurancePolicy`,
`InsuranceClaim` (liée à un ticket de maintenance, statuts déclaré → assureur prévenu → expertise →
indemnisé / refusé → clos, montants réclamé et indemnisé, dépense associée), journal d'entretien par bien ;
alerte d'échéance de police réutilisant `notifications.ts`.

**Lot B2 — spec 033 · Suivi d'avancement foncier** (capacité 4) : `LandRegularization` + étapes
(filière ACD de Côte d'Ivoire : attestation villageoise → dossier technique du géomètre → bornage
contradictoire → demande d'ACD → ACD → titre foncier ; filière paramétrable), pièces rattachées à
`PropertyDocument`, coûts rattachés au coût de revient, alertes de relance. **Les filières par pays sont à
faire valider par un juriste local** ; à coordonner avec le `legalStatus` du chantier multi-actifs.

**Lot B3 — spec 034 · Accès « tiers de confiance »** (capacité 14) : `ExternalAccessGrant` (notaire,
expert-comptable, banquier ; portée par bien ou entité ; permanent ou expirant ; révocable), middleware
`requireGuestAccess` calqué sur `owner-portal-access.ts`, lecture seule réutilisant la vue patrimoine
du portail propriétaire, chaque consultation journalisée. Dépend du lot A3 (jetons).

### Vague C — après la fusion des PR multi-actifs (décision de l'utilisateur)

- **C1 — spec 035 · Vue Groupe et associés** (capacité 1) : `HoldingEntityMember`, `consolidateGroup()`
  par produit de quotes-parts (attention au double comptage mère/fille).
- **C2 — spec 036 · Multi-devises d'affichage** (capacité 11) : unifier « XOF »/« FCFA », parité fixe
  EUR/XOF 655,957, taux USD/CAD saisis par le super-administrateur (aucun appel à un service externe),
  préférence d'affichage consommée par `MoneyValue`.
- **C3 — spec 037 · Dossier bancaire et déclaration fiscale pré-remplie** (capacités 9 et 6) :
  `export/bank-file.ts` (synthèse, ratios, index des pièces) et récapitulatif pour la déclaration DGI —
  **récapitulatif « prêt à saisir », pas un fichier au format officiel** (le gabarit officiel n'est pas
  disponible) et toujours marqué « indicatif, à valider par un conseil fiscal ».
- **C4 — spec 038 · Import en masse** (capacité 2) : descripteurs de nature « biens » et « valorisations »
  dans le moteur existant, gabarit Excel téléchargeable ; baux et locataires à part (ils déclenchent
  échéances, invitations et e-mails).
- **C5 — spec 039 · Lien de paiement Mobile Money** (capacité 12) : variante de `startCheckout` initiée par
  l'agence, lien partageable et page publique (réutilise `lib/secure-links`), envoi par WhatsApp.
- **C6 — spec 040 · Démembrement** (capacité 5) : type de droit (pleine propriété, nue-propriété, usufruit)
  et fin d'usufruit sur `PropertyOwnershipShare` et `PropertyHolding` ; **spec et décision de conception
  d'abord** (comptes propriétaires, relevés, fiscalité : qui est redevable ?).

## 4. Décisions prises par défaut (réversibles, à confirmer)

- Vagues de 3 lots, pas les 14 d'un coup : contrainte technique (poste, disque, conflits de fichiers).
- Aucune valeur fiscale, foncière ou de date d'exigibilité inventée : paramètres vides ou `A_VALIDER`.
- Aucun appel à un service externe payant ou de taux de change ; aucun envoi réel en dehors du dépôt
  pendant le développement (les fournisseurs restent en mode simulateur/journal).
- La borne UTC+0 de la période financière vaut pour toute la vague.

## 5. Risques

- Conflits de fusion avec le chantier multi-actifs (`consolidation-service.ts`, `export/*`, projection).
- Migrations d'horodatage proche entre lots parallèles : un horodatage distinct par lot, jamais d'édition
  d'une migration existante.
- Fichiers très partagés : `schema.prisma`, `app.ts`, `route-features.ts`, `routes-inventory.test.ts`,
  `menu-catalog.ts`, catalogues i18n, wiki : intégrer lot par lot, jamais en parallèle sur le même fichier.
- Disque : 22 Go libres au 2026-10-01.
