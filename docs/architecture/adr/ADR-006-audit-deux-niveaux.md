# ADR-006 : Journal d'audit à deux niveaux (agence et plateforme)

## Statut

Proposé

## Date

2026-10-01

## Contexte

`AuditLog` existe depuis l'initialisation du schéma : une table sans clé
étrangère (l'historique survit à la suppression d'un utilisateur ou d'une
agence), alimentée par `logAuditEvent()` (`services/audit-service.ts`), environ
124 appels manuels et une centaine de clés (`AuditActionKey`). Une seule route
la lit, `GET /api/admin/audit`, réservée à `PLATFORM_TENANTS_VIEW`.

Limites constatées dans le code :

- **Aucune lecture côté agence** : un administrateur d'agence ne voit pas son
  propre journal.
- **Écriture non durable** : la file est en mémoire, vidée toutes les 5 s. Un
  arrêt brutal perd des événements, y compris de sécurité. À l'arrêt propre, la
  vidange (`audit-service`) et la déconnexion de la base (`utils/database`)
  s'exécutent en concurrence, chacune finissant par `process.exit(0)` : la
  base peut être fermée avant la vidange.
- **Couverture manuelle** : `tenantId` et l'acteur sont passés à la main à
  chaque appel. Un `tenantId` oublié rend l'événement invisible de l'agence et
  rien ne le détecte. Aucun événement ne porte d'avant/après.
- **Aucune garantie d'immuabilité ni de rétention.**
- **Table détournée** : `AuditLog` sert aussi de marqueur anti-doublon
  (`utils/idempotency.ts`, alertes d'échéance, lecture du payload dans
  `invitation-service`).
- `AuditLog` est dans `EXEMPT_MODELS` de l'extension Prisma de garde tenant
  (`tenantId` nullable par construction) : aucune lecture n'y est contrôlée.

## Décision

1. **Une seule table `audit_logs`, deux portées de lecture.** Le niveau
   plateforme est un sur-ensemble du niveau agence. Deux colonnes les
   séparent : `scope` (`TENANT` | `PLATFORM`) et `visibility` (`TENANT` |
   `PLATFORM_ONLY`). Invariant en base : `scope = 'PLATFORM' OR tenant_id IS
NOT NULL`.
2. **Colonnes additives** : `category`, `outcome`, `actorType`, `actorLabel`
   (instantané du nom de l'acteur, qui survit à sa suppression), `requestId`,
   `changes` (champs modifiés avant/après, rédigés), `source`. Migration
   additive : tous les appelants existants continuent de fonctionner.
3. **Catalogue des actions** (`types/audit-catalog.ts`) : chaque
   `AuditActionKey` y déclare catégorie, visibilité par défaut, champs à
   masquer et caractère critique. Un test impose une entrée par clé.
4. **Contexte automatique** : l'`AsyncLocalStorage` de requête porte
   `requestId`, acteur et agence ; `logAuditEvent` les lit. Les appelants n'ont
   plus à les passer.
5. **Deux voies d'écriture** : `recordAuditEvent(tx, entry)`, dans la
   transaction métier, pour les actions critiques ; `logAuditEvent(entry)`,
   file asynchrone, pour le reste. La file est vidée avant la déconnexion de
   la base (registre de crochets d'arrêt).
6. **Lecture agence** : un lecteur unique `getTenantAuditLogs(tenantId, …)` qui
   force `tenantId` et `visibility = TENANT`, jamais lu depuis le client.
   Permissions dédiées `TENANT_AUDIT_VIEW`, `PLATFORM_AUDIT_VIEW`,
   `PLATFORM_AUDIT_EXPORT`. Consulter ou exporter est lui-même audité.
7. **Immuabilité** : un déclencheur Postgres refuse `UPDATE` et `DELETE` sur
   `audit_logs`. La purge de rétention passe par une fonction dédiée.
8. **Détection de falsification** (phase ultérieure) : scellés quotidiens par
   agence et pour la plateforme (racine de Merkle), pas de chaînage ligne à
   ligne.

Valeurs par défaut retenues pour les points ouverts, à ajuster :

| Point                                                | Défaut                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Actions du personnel plateforme visibles de l'agence | Oui pour support et accès ; non pour facturation interne et réglages IA   |
| Rétention                                            | 24 mois côté agence, 5 ans côté plateforme                                |
| Journalisation des lectures                          | Exports, téléchargements de documents, consultations sensibles uniquement |
| Scellement cryptographique                           | Phase 5, optionnel                                                        |
| Réservé à certains packs                             | Non, pour tous                                                            |

## Conséquences positives

- Le niveau agence devient possible sans second schéma ni second pipeline.
- Un événement ne peut plus être « perdu » dans le périmètre agence par oubli
  de `tenantId` : le contexte le renseigne, la contrainte le garantit.
- Les actions critiques peuvent être écrites dans la transaction métier
  (`recordAuditEvent`) : pas de commit sans trace. La voie existe dès la phase 1 ;
  la conversion des appels des actions marquées `critical` au catalogue se fait
  en phase 3.
- Compatibilité totale avec les ~124 appels existants.
- Les 44 clés qui circulaient en chaîne libre hors de l'enum (`RENTAL_*`, `CRM_*`,
  `MAINTENANCE_*`…) entrent au catalogue ; un test échoue si une nouvelle clé
  littérale n'y figure pas. Une clé inconnue reste fermée par défaut
  (`PLATFORM_ONLY`), avec un avertissement dans les logs.

## Conséquences négatives

- La table grossit vite ; la pagination par curseur et la rétention deviennent
  nécessaires (phases 2 et 5).
- Le déclencheur d'immuabilité casse tout script qui supprime ou modifie des
  lignes d'audit. Aucun code du dépôt ne le fait aujourd'hui (le seed ne touche
  pas à `audit_logs`) ; un `TRUNCATE` n'est pas concerné par un déclencheur de
  ligne, donc la remise à zéro d'une base de recette reste possible.
- `AuditLog` reste exempt de l'extension de garde tenant : l'étanchéité de la
  lecture repose sur le lecteur unique et son test d'isolation, pas sur
  l'extension.
- Les marqueurs anti-doublon restent dans `AuditLog` jusqu'à la phase 5.

## Alternatives écartées

- **Deux tables (`tenant_audit_logs`, `platform_audit_logs`)** — duplique
  index, jobs, rétention et interface ; le niveau plateforme doit de toute
  façon lire le niveau agence.
- **Chaînage de hachage ligne à ligne** — incompatible avec l'insertion
  asynchrone par lots sans verrou d'écriture global.
- **Capture automatique de toutes les écritures Prisma** (extension) — volume
  et coût d'une lecture « avant » sur chaque `update`, `updateMany` sans
  identifiants, risque de doublon avec les événements métier existants. En
  phase 3, l'avant/après est **ciblé** : un utilitaire (`lib/audit/changes.ts`)
  que les services déjà équipés d'une ligne « avant » appellent pour remplir
  `changes` (affaires CRM, contacts, biens, baux, pénalités). L'extension reste
  possible plus tard, modèle par modèle.
- **Journal externe (SIEM, service dédié)** — hors de proportion avec l'état
  actuel ; le format reste exportable.

## Liens

- Spécification : [`specs/023-audit-deux-niveaux/spec.md`](../../../specs/023-audit-deux-niveaux/spec.md).
- Code : `packages/api/src/services/audit-service.ts`,
  `packages/api/src/types/audit-types.ts`, `packages/api/src/utils/request-context.ts`,
  `packages/api/src/utils/prisma-tenant-guard-extension.ts`.
- Dette : [`AUDIT_CODE.md`](../../../AUDIT_CODE.md) §4.8.
