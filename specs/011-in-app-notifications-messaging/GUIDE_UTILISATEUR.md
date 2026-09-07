# Guide utilisateur – Notifications in-app et Messagerie (spec 011)

**Module** : 011-in-app-notifications-messaging  
**Objectif** : Tester pas à pas les notifications in-app et la messagerie interne.  
Pour chaque action : **scénario** et **résultat attendu**.

---

## Prérequis

- Backend API démarré (`packages/api`), frontend démarré (`apps/web`).
- Utilisateur connecté avec un JWT valide et accès à au moins un **tenant**.
- Migrations Prisma exécutées (tables `in_app_notifications`, `conversations`, `conversation_participants`, `messages`, `message_read_receipts`).

**Accès** : une fois connecté, sélectionnez un tenant (ou accédez à une URL du type `/tenant/:tenantId/...`).

---

## Où se configurent les événements métier ? (Communication vs Notifications email)

Il existe **deux menus** liés aux notifications. Voici à quoi sert chacun :

| Menu | URL | Rôle |
|------|-----|------|
| **Communication** (Templates + Règles) | `/tenant/:tenantId/communication/templates` et `/tenant/:tenantId/communication/rules` | **C’est ici** que se configurent les **événements métier** qui envoient des messages. Les **Règles** associent un événement (ex. Paiement reçu, Ticket créé, Bail activé) à des **Templates** (email, WhatsApp) et aux types de destinataires. C’est ce moteur qui crée aussi les **notifications in-app**. Pour qu’une action (ex. enregistrer un paiement) génère une notification in-app, il faut une **règle active** dans Communication → Règles (et les templates associés si vous voulez email/WhatsApp). |
| **Gérer les notifications email** | `/tenant/:tenantId/email-notifications` | Liste **prédéfinie** de types d’emails (ex. « Paiement alloué au locataire », « Ticket créé – agence »). Permet d’**activer/désactiver** chaque type et de **personnaliser** le sujet et le corps de l’email. Ce menu **ne pilote pas** les notifications in-app ni les règles du module Communication ; il concerne uniquement certains envois d’emails gérés ailleurs dans l’application (paiements alloués, déclarations, dépôts, maintenance, etc.). |

**En résumé** :
- Pour **notifications in-app** + envoi email/WhatsApp déclenchés par un **événement** (paiement reçu, ticket créé, bail activé, rappels, deal, publication) → configuration dans **Communication → Règles** (et **Templates** pour le contenu).
- Pour **activer/désactiver** ou **personnaliser** certains emails précis (ex. « Paiement alloué locataire », « Ticket créé agence ») → configuration dans **Notifications email**.

---

# Partie 1 – Notifications in-app

## 1.1 Voir le badge de notifications dans l’en-tête

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Être connecté et avoir un tenant actif (URL contenant `/tenant/:tenantId/`). | L’en-tête de l’application affiche une **icône cloche** (🔔). |
| 2 | Regarder l’icône cloche. | Si vous avez des notifications **non lues**, un **badge** affiche le nombre (ex. `3`). Au-delà d’un certain seuil, l’affichage peut être du type `99+`. |
| 3 | Si vous n’avez aucune notification non lue. | Le badge peut être absent ou afficher `0`. |

**Scénario de test** : Déclencher un événement métier (ex. rappel d’échéance, ticket créé, paiement reçu) qui génère une notification pour votre utilisateur, puis rafraîchir la page ou attendre le prochain chargement du header : le badge doit afficher au moins 1.

---

## 1.2 Ouvrir l’aperçu des notifications (dropdown)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Cliquer sur l’**icône cloche** dans l’en-tête. | Un **menu déroulant** s’ouvre sous l’icône. |
| 2 | Regarder le contenu du menu. | Un titre « Notifications » et un lien « Voir tout » en haut ; en dessous, une **liste** des dernières notifications (ex. 5 plus récentes). |
| 3 | S’il n’y a aucune notification. | Message du type « Aucune notification » ou liste vide. |

---

## 1.3 Aller sur la page « Mes notifications »

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Depuis le dropdown des notifications, cliquer sur **« Voir tout »**. | Navigation vers la page **Mes notifications** : `/tenant/:tenantId/notifications`. |
| 2 | Ou : dans le **menu latéral** (sidebar), cliquer sur **« Mes notifications »**. | Même page : liste complète des notifications avec filtres et pagination. |
| 3 | Observer la page. | Titre « Notifications », bouton « Retour », filtres : **Toutes** / **Non lues** / **Lues** / **Archivées**, et un filtre par **priorité** (Toutes priorités, Basse, Normale, Haute, Urgente). |

---

## 1.4 Filtrer les notifications

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Cliquer sur **« Non lues »**. | La liste n’affiche que les notifications dont le statut est **UNREAD**. |
| 2 | Cliquer sur **« Lues »**. | La liste n’affiche que les notifications **READ**. |
| 3 | Cliquer sur **« Archivées »**. | La liste n’affiche que les notifications **ARCHIVED**. |
| 4 | Cliquer sur **« Toutes »**. | Toutes les notifications (sauf archivées selon l’implémentation) sont affichées. |
| 5 | Changer le filtre **Priorité** (ex. « Haute »). | La liste est restreinte aux notifications de priorité sélectionnée. |

---

## 1.5 Marquer une notification comme lue (une seule)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Avoir au moins une notification **non lue** dans la liste (ou dans le dropdown). | La notification s’affiche avec un style « non lu » (ex. fond légèrement bleuté). |
| 2 | **Cliquer** sur cette notification (sur la carte). | La notification est **marquée comme lue** côté API ; l’interface se met à jour (statut « Lu », style normal). |
| 3 | Si la notification a un **lien** (actionUrl) vers une ressource (bail, ticket, etc.). | En plus du marquage lu, la navigation peut ouvrir la page de la ressource liée. |
| 4 | Regarder le **badge** dans l’en-tête. | Le nombre de non lus **diminue de 1** (ex. 3 → 2). |

---

## 1.6 Marquer plusieurs notifications comme lues (sélection)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Sur la page **Mes notifications**, cocher les **cases** à gauche de une ou plusieurs notifications (ou cliquer sur « Tout sélectionner »). | Une barre d’actions apparaît : « X sélectionnée(s) », avec les boutons **Marquer comme lu**, **Archiver**, **Annuler**. |
| 2 | Cliquer sur **« Marquer comme lu »**. | Les notifications sélectionnées passent en statut **READ** ; la barre de sélection disparaît ; le badge dans l’en-tête diminue en conséquence. |

---

## 1.7 Archiver une ou plusieurs notifications

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Sélectionner une ou plusieurs notifications (cases à cocher). | Barre d’actions visible. |
| 2 | Cliquer sur **« Archiver »**. | Les notifications sélectionnées passent en statut **ARCHIVED** et **disparaissent** de la liste courante (si le filtre actif est Toutes / Non lues / Lues). |
| 3 | Changer le filtre en **« Archivées »**. | Les notifications archivées réapparaissent dans la liste. |

---

## 1.8 Priorité et lien vers la ressource

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Avoir des notifications de **priorité haute** ou **urgente**. | Affichage visuel distinct : bordure colorée (ex. orange pour haute, rouge pour urgente), éventuellement icône (⚠ ou ❗). |
| 2 | Une notification avec **lien** (ex. vers un bail, un ticket). | Au clic sur la carte : marquage comme lu (si non lu) + navigation vers la page correspondante (ex. détail du bail ou du ticket). |

---

# Partie 2 – Messagerie (conversations et messages)

## 2.1 Accéder à la messagerie

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Dans le **menu latéral**, cliquer sur **« Conversations »**. | Navigation vers `/tenant/:tenantId/messages`. |
| 2 | Observer la page. | Titre « Messagerie », bouton « Retour », bouton **« Nouveau message »**, onglets **Actives** / **Archivées**, et la **liste des conversations** (ou message « Aucune conversation » si vide). |

---

## 2.2 Démarrer une conversation directe (1 à 1)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Cliquer sur **« Nouveau message »**. | Une **modale** s’ouvre pour créer une conversation. |
| 2 | Choisir le type **« Direct »** (ou laisser par défaut). | Un seul destinataire est attendu. |
| 3 | Dans la liste déroulante, sélectionner un **destinataire** : collaborateur agence, locataire, propriétaire ou contact CRM du tenant. | Le destinataire est sélectionné. |
| 4 | Valider (ex. bouton « Créer » ou « Envoyer »). | La modale se ferme ; vous êtes **redirigé** vers la page de la conversation : `/tenant/:tenantId/messages/:conversationId`. La conversation s’affiche (vide ou avec messages existants si la conversation existait déjà). |

**Scénario** : En tant qu’utilisateur agence, choisir un locataire (ou un propriétaire) et créer la conversation. Résultat : une conversation directe avec 2 participants (vous + le destinataire).

---

## 2.3 Envoyer un message dans une conversation

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Être sur la page d’une **conversation** (liste des messages visible). | Un champ de saisie (zone de texte) et un bouton d’envoi (ex. « Envoyer ») sont affichés. |
| 2 | Saisir du **texte** dans le champ (ex. « Bonjour, nous vous confirmons la réception de votre dossier. »). | Le texte apparaît dans le champ. |
| 3 | Cliquer sur **Envoyer** (ou équivalent). | Le message est **enregistré** ; il apparaît **immédiatement** dans le fil de la conversation (côté expéditeur), avec votre nom/avatar et l’heure. |
| 4 | Vérifier côté **destinataire**. | En se connectant avec le compte du destinataire et en ouvrant la même conversation, le message est visible ; le destinataire peut répondre. |

---

## 2.4 Consulter l’historique et répondre

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | En tant que **destinataire**, ouvrir la messagerie et cliquer sur la conversation dans la liste. | La page de détail de la conversation s’ouvre avec l’**historique des messages** en ordre chronologique. |
| 2 | Lire les messages. | Les messages s’affichent avec expéditeur, contenu et date/heure. |
| 3 | Saisir une **réponse** et l’envoyer. | Le nouveau message apparaît dans le fil ; l’expéditeur initial peut le voir en ouvrant la conversation. |

---

## 2.5 Accusé de lecture (marquer comme lu)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | **Destinataire** : ouvrir la conversation et afficher les messages. | L’application envoie un appel « marquer comme lu » (ex. avec l’ID du dernier message vu). |
| 2 | Côté **expéditeur** : consulter la même conversation (ou la liste des conversations). | Si l’interface l’affiche : indication que le(s) message(s) ont été **lus** (ex. « Lu » ou double check). |

---

## 2.6 Liste des conversations : aperçu et indicateur

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Sur la page **Conversations** (`/tenant/:tenantId/messages`), regarder une ligne de conversation. | Pour chaque conversation : **autre(s) participant(s)** (ou titre de groupe), **aperçu du dernier message** et **date/heure** du dernier message. |
| 2 | S’il y a des **messages non lus** dans une conversation. | Un indicateur (ex. point ou compteur) peut signaler les conversations avec messages non lus. |

---

## 2.7 Créer une conversation de groupe (si implémenté)

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Cliquer sur **« Nouveau message »** et choisir le type **« Groupe »**. | Le formulaire demande un **titre** (optionnel) et la **sélection de plusieurs destinataires**. |
| 2 | Saisir un titre (ex. « Dossier Appartement Rue X »), sélectionner **plusieurs** participants (agence, propriétaire, locataire, contacts). | Les participants sont ajoutés. |
| 3 | Valider la création. | Une conversation de **groupe** est créée ; tous les participants la voient dans leur liste ; les messages envoyés sont visibles par tous. |
| 4 | Ouvrir la conversation. | La liste des **participants** est affichée (ex. sous le titre) ; chaque message affiche l’expéditeur. |

---

## 2.8 Archiver une conversation

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Être sur la **page de détail** d’une conversation (pas la liste). | Un bouton **« Archiver »** est visible (souvent en haut à droite). |
| 2 | Cliquer sur **« Archiver »**. | Un message de succès (ex. « Conversation archivée ») ; vous êtes **redirigé** vers la liste des conversations (`/tenant/:tenantId/messages`). |
| 3 | Par défaut, l’onglet **« Actives »** est affiché. | La conversation archivée **n’apparaît plus** dans la liste des actives. |
| 4 | Cliquer sur l’onglet **« Archivées »**. | La conversation archivée **réapparaît** ; en cliquant dessus, l’historique des messages reste accessible. |

---

# Partie 3 – Intégration avec les événements métier (optionnel)

**Important** :
- La **configuration** des événements qui génèrent des **notifications in-app** (et les emails/WhatsApp associés) se fait dans le menu **Communication → Règles** (et **Templates**). La page **« Gérer les notifications email »** ne pilote pas les notifications in-app (voir la section « Où se configurent les événements métier ? » en début de guide).
- Pour qu’une **notification in-app** apparaisse, il faut : (1) une **règle active** dans Communication → Règles pour cet événement, et (2) réaliser l’**action** correspondante dans l’app (enregistrer un paiement, créer un ticket, activer un bail, etc.), comme indiqué ci-dessous.

## 3.1 Où déclencher les événements (pour tester les notifications in-app)

| Événement métier | Où le déclencher dans l’app | Page / URL typique |
|------------------|-----------------------------|---------------------|
| **Paiement reçu** | Enregistrer un paiement (loyer, acompte, etc.) | Module Loyers / Paiements du tenant (ex. `/tenant/:tenantId/rental/payments` ou équivalent) |
| **Ticket créé** | Créer un nouveau ticket de maintenance | Maintenance → Créer un ticket (ex. `/tenant/:tenantId/maintenance` ou liste des tickets) |
| **Bail activé** | Activer un bail (changer le statut du bail) | Détail d’un bail → action « Activer » (ex. `/tenant/:tenantId/rental/leases`) |
| **Rappel d’échéance** | Déclenché **automatiquement** par un job planifié (ex. tous les jours) pour les échéances à venir | Aucune page : attendre l’exécution du job ou déclencher un test côté backend |
| **Deal créé / stage changé** | Créer un deal CRM ou changer l’étape d’un deal | CRM → Deals (ex. `/tenant/:tenantId/crm/deals`) |
| **Propriété publiée** | Publier une propriété | Fiche propriété → publication |

## 3.2 Notification créée automatiquement à partir d’un événement

| Étape | Action | Résultat attendu |
|-------|--------|-------------------|
| 1 | Déclencher un **événement** en faisant l’action correspondante (voir tableau ci-dessus) : ex. enregistrer un **paiement**, créer un **ticket**, activer un **bail**. | Côté backend : une entrée est créée dans `in_app_notifications` pour le destinataire concerné (et éventuellement liée à `communication_id`). |
| 2 | Se connecter en tant que **destinataire** (ex. locataire ou propriétaire selon l’événement). | Le **badge** des notifications dans l’en-tête s’incrémente (ou affiche au moins 1). |
| 3 | Ouvrir **Mes notifications**. | Une **nouvelle notification** apparaît avec un titre et un message cohérents avec l’événement (ex. « Paiement reçu », « Ticket créé »). |
| 4 | Cliquer sur la notification (si un lien est défini). | Navigation vers la ressource liée (ex. détail du paiement ou du ticket). |

---

# Récapitulatif des URLs et menus

| Fonctionnalité | Accès menu | URL |
|----------------|------------|-----|
| Badge + aperçu notifications | Icône cloche (header) | — |
| Mes notifications (in-app) | « Mes notifications » (sidebar) | `/tenant/:tenantId/notifications` |
| Gérer les notifications email *(préférences uniquement, ne déclenche pas d’événements)* | « Gérer les notifications email » (sidebar) | `/tenant/:tenantId/email-notifications` |
| Conversations | « Conversations » (sidebar) | `/tenant/:tenantId/messages` |
| Détail conversation | Clic sur une conversation | `/tenant/:tenantId/messages/:conversationId` |

---

# Dépannage rapide

- **Badge à 0 alors qu’il devrait y avoir des notifications** : Vérifier que l’utilisateur connecté est bien le **destinataire** des notifications (même tenant, même type destinataire : agence / locataire / propriétaire / contact). Rafraîchir la page ou attendre le prochain polling.
- **« Impossible de charger la liste des destinataires »** (nouveau message) : Vérifier que le tenant a des **membres**, **clients** (locataires/propriétaires) ou **contacts CRM** ; et que l’utilisateur a les droits d’accès à ces données.
- **Conversation non visible** : Vérifier que l’utilisateur est bien **participant** de la conversation et que le filtre (Actives / Archivées) correspond au statut de la conversation.
- **Notifications expirées** : Les notifications avec `expires_at` dans le passé sont exclues de la liste par défaut et peuvent être purgées par le job quotidien (ex. 3h UTC).

---

*Ce guide est aligné sur la spec 011 et l’implémentation décrite dans `docs/communication/IMPLEMENTATION_MODULE_COMMUNICATION.md` et le quickstart `specs/011-in-app-notifications-messaging/quickstart.md`.*
