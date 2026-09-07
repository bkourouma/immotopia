# Research: Notifications In-App et Messagerie

**Feature**: 011-in-app-notifications-messaging  
**Date**: 2025-02-09

## 1. Rafraîchissement du badge et des notifications (polling vs temps réel)

**Decision**: Utiliser le **polling** pour la première version : le frontend appelle périodiquement (ex. toutes les 30 secondes) l’endpoint des statistiques (unread count) et la liste des notifications. Pas de WebSocket ni Server-Sent Events en v1.

**Rationale**: La spec autorise explicitement le polling ; cela évite d’ajouter Socket.io ou un autre canal temps réel dans la stack et simplifie le déploiement et les tests. L’expérience reste acceptable (mise à jour sous 30 s).

**Alternatives considered**:
- **WebSocket / Socket.io** : mise à jour immédiate du badge et des listes ; rejeté pour v1 car « desirable but not mandatory » dans la spec et complexité accrue.
- **Server-Sent Events (SSE)** : unidirectionnel, suffisant pour « push » de nouvelles notifications ; retenu comme option pour une évolution ultérieure si besoin.

---

## 2. Accusés de lecture (read receipts)

**Decision**: Stocker par conversation un **dernier message lu** par participant (`last_read_message_id` + `last_read_at` sur `ConversationParticipant`). En complément, une table **MessageReadReceipt** (message_id, reader, read_at) pour un historique explicite « qui a lu quel message », permettant d’afficher « lu par X à telle date » si besoin.

**Rationale**: La spec exige que « the system records read state so that the sender can see (or infer) that messages were read ». Un seul « last read » par participant suffit pour déduire qu’un message est lu si son id est antérieur ou égal au last_read_message_id. Les read receipts explicites permettent une UI plus riche (indicateurs « lu » par destinataire) sans surcharge en v1 (on peut remplir les receipts lors du « mark as read » par batch).

**Alternatives considered**:
- Uniquement last_read sans table MessageReadReceipt : plus simple mais moins flexible pour afficher « lu par » par message.
- Uniquement receipts sans last_read : plus de lignes en base et requêtes plus lourdes pour « dernier message lu » ; on garde les deux pour clarté et évolutivité.

---

## 3. Pièces jointes (messages)

**Decision**: Stocker les pièces jointes comme **JSON** dans le champ `attachments` du message (tableau d’objets `{ name, url, type, size }`). Les fichiers sont uploadés via un endpoint dédié (ex. multipart/form-data), stockés sur le disque ou un stockage objet avec une URL signée ou protégée par auth ; l’URL enregistrée dans le message pointe vers un endpoint de téléchargement contrôlé par le backend (vérification participant + tenant).

**Rationale**: La spec impose des « configurable constraints on type and size » et « restrict access to attachments to participants only ». Un champ JSON permet de garder plusieurs métadonnées sans multiplier les tables ; les contraintes (types MIME autorisés, taille max) sont appliquées côté API à l’upload.

**Alternatives considered**:
- Table dédiée `MessageAttachment` : normalisation plus propre mais plus de jointures et de code ; retenu comme évolution si le nombre de pièces ou les métadonnées augmentent.
- Stockage externe (S3) dès v1 : cohérent avec une future évolution ; en v1 on peut rester sur un stockage local ou existant (dossier uploads par tenant) pour réduire la surface de changement.

---

## 4. Intégration avec le moteur de notifications (module 010)

**Decision**: Dans le **notification-engine** (ou équivalent) qui émet déjà les communications (email/WhatsApp) lors des événements métier, ajouter un appel systématique au **InAppNotificationService** pour créer une notification in-app pour chaque destinataire concerné, avec le même titre/message (ou une version tronquée), type, priorité dérivée de l’événement, et lien vers l’entité (action_url). Optionnellement lier la notification in-app à la `Communication` via `communication_id` pour traçabilité.

**Rationale**: La spec indique que « this feature adds an in-app copy and/or in-app-only notifications using the same event triggers and recipient model ». Un seul point d’entrée (trigger event) garantit la cohérence entre canaux externes et in-app.

**Alternatives considered**:
- Service séparé qui écoute les mêmes événements : duplication de la logique de résolution des destinataires et des règles ; rejeté.
- Créer les in-app notifications uniquement pour certains événements : la spec demande « every notification intended for a user » en in-app ; on crée pour tous les envois déclenchés par les règles, comme pour l’email/WhatsApp.

---

## 5. Résolution du destinataire courant (notifications in-app)

**Decision**: Pour les routes « mes notifications » et « stats badge », le backend détermine le **recipientType** et **recipientId** à partir de l’utilisateur authentifié et du `tenantId` : d’abord vérifier un membership actif (→ AGENCY_USER + user_id), sinon TenantClient pour ce tenant (→ RENTER + tenant_client_id), sinon CrmContact lié au user pour ce tenant (→ OWNER/CONTACT + contact_id). Une seule identité par (user, tenant) est assumée (pas de multi-profils simultanés).

**Rationale**: La spec exige que « a user MUST see only notifications intended for them » ; le même utilisateur peut être « agence » dans un tenant et « contact » dans un autre, d’où la résolution par (user, tenant).

**Alternatives considered**:
- Le client envoie recipientType/recipientId : risque de manipulation ; rejeté. Le serveur doit dériver l’identité du JWT + tenant.

---

## 6. Conversations directes existantes (get-or-create)

**Decision**: Pour une conversation **directe**, avant d’en créer une nouvelle, rechercher une conversation de type DIRECT dont les deux participants sont exactement les deux acteurs concernés (et statut non DELETED). Si trouvée, la retourner ; sinon créer une nouvelle conversation avec deux participants.

**Rationale**: Évite de multiplier les fils pour la même paire (user A, user B) et correspond au comportement attendu (« réouvrir si elle existe déjà »).

**Alternatives considered**:
- Toujours créer une nouvelle conversation : rejeté car mauvaise UX (plusieurs fils identiques).

---

## 7. Nettoyage des notifications expirées

**Decision**: Job planifié (cron) exécuté une fois par jour (ex. 02:00 UTC) qui supprime en base les notifications dont `expires_at < now()`. Les notifications sans `expires_at` ne sont jamais supprimées par ce job.

**Rationale**: La spec indique que les notifications expirées « MAY be purged periodically » ; un job quotidien limite la charge et garde les données récentes lisibles.

**Alternatives considered**:
- Purge à la volée à chaque lecture de la liste : coût inutile et risque de latence ; rejeté.
- Ne pas purger : acceptable en v1 si la politique de rétention le permet ; le job reste recommandé pour éviter une table qui grossit indéfiniment.
