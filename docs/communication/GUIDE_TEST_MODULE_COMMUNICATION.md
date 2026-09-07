# Guide de test – Module de Communication ImmoTopia

Ce guide vous permet de **tester toutes les fonctionnalités** du module Communication après implémentation : templates, règles, historique, annonces, préférences, analytics et notifications automatiques.

---

## 1. Prérequis

### 1.1 Base de données et migrations

- PostgreSQL doit être démarré et accessible.
- Appliquer les migrations Prisma :
  ```bash
  cd packages/api
  npx prisma migrate deploy
  npx prisma generate
  ```
- Vérifier qu’au moins **un tenant actif** existe (ex. via l’admin ou les seeds).

### 1.2 Variables d’environnement (API)

Dans `packages/api/.env`, vérifier ou ajouter (voir `.env.example`) :

- `DATABASE_URL` – connexion PostgreSQL
- **Communication** (optionnel pour envoi réel) :
  - `COMMUNICATION_QUEUE_ENABLED=true` (ou `false` pour désactiver la file)
  - `EMAIL_PROVIDER=sendgrid` ou `nodemailer`
  - `SENDGRID_API_KEY=...` (si SendGrid)
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (si WhatsApp)

Sans clés email/WhatsApp, les messages sont créés et mis en file mais l’envoi peut échouer (visible dans l’historique en « Échec »).

### 1.3 Seed optionnel (template + règle par défaut)

Pour avoir un template et une règle « Paiement reçu » prêts à l’emploi :

> **Obsolete** : les tables `communication_templates` et `notification_rules` ont ete supprimees
> par la migration `20260210120000_remove_communication_messaging_tables`. Les notifications sont
> desormais pilotees par les constantes `src/constants/email-notification-*` et
> `src/constants/whatsapp-notification-*`, surchargeables par tenant via les ecrans
> "Notifications email" / "Notifications WhatsApp". Le seed `db:seed:communication` et le script
> `script:list-rules` ont ete retires.

---

## 2. Démarrer l’application

### 2.1 Backend

```bash
cd packages/api
npm run dev
```

- Vérifier : **GET** `http://localhost:8001/health` → `{ "status": "ok", ... }`.
- Les jobs (file, rappels, statuts) démarrent automatiquement (sauf si `NODE_ENV=test`).

### 2.2 Frontend

```bash
cd apps/web
npm run dev
```

- Ouvrir l’application (ex. `http://localhost:3000`).
- Se connecter avec un utilisateur ayant accès à un **tenant** (agence).

---

## 3. Accéder au module Communication

1. **Connexion** : identifiez-vous avec un compte lié à un tenant.
2. **Sélection du tenant** : si l’app propose un sélecteur de tenant/agence, choisir celui à tester.
3. **Menu** : dans la sidebar, ouvrir la section **Communication**.
4. Sous-menu attendu :
   - **Templates**
   - **Règles**
   - **Historique**
   - **Annonces**
   - **Préférences**
   - **Analytics**

Si le menu Communication n’apparaît pas, vérifier les permissions (rôle avec accès communication / tenant admin).

---

## 4. Tester les fonctionnalités (ordre recommandé)

### 4.1 Templates

**URL** : `/tenant/:tenantId/communication/templates`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Liste** | Ouvrir la page Templates | Liste des templates (vide si aucun, ou template seed « Confirmation de paiement reçu »). |
| **Créer** | Cliquer sur « Créer » / « Nouveau template », remplir : nom, type (Annonce / Alerte / Notification), canal (Email ou WhatsApp), sujet (pour email), corps (texte ou HTML). Optionnel : variables (ex. `amount`, `contactName`). | Template créé, redirection ou mise à jour de la liste. |
| **Modifier** | Cliquer sur un template existant, modifier nom/corps/sujet, enregistrer | Modifications sauvegardées. |
| **Variables** | Dans le corps, utiliser `{{variableName}}` (ex. `{{amount}}`, `{{contactName}}`). | Les variables sont remplacées à l’envoi selon le contexte de l’événement. |

**Exemple de corps email** :  
`Bonjour {{contactName}}, votre paiement de {{amount}} a bien été reçu.`

---

### 4.2 Règles de notification

**URL** : `/tenant/:tenantId/communication/rules`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Liste** | Ouvrir la page Règles | Liste des règles (éventuellement « Notification paiement reçu » si seed exécuté). |
| **Créer** | « Nouvelle règle » : nom, **événement** (ex. Paiement reçu, Ticket créé, Bail activé), **types de destinataires** (Locataire, Propriétaire, Contact, etc.), **template email** et/ou **template WhatsApp** (sélection parmi les templates). | Règle créée. |
| **Modifier** | Éditer une règle (événement, destinataires, templates). | Modifications enregistrées. |
| **Activer / Désactiver** | Utiliser le bouton ou interrupteur « Activer / Désactiver » sur une règle. | Seules les règles actives déclenchent des envois. |

**Scénario utile** : une règle « Paiement reçu » → destinataire **Locataire** → template email « Confirmation de paiement ». En enregistrant un paiement (voir 4.7), une communication doit apparaître dans l’historique.

---

### 4.3 Historique des communications

**URL** : `/tenant/:tenantId/communication/history`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Liste** | Ouvrir la page Historique | Liste paginée des communications (type, canal, destinataire, sujet, statut, date). |
| **Filtres** | Filtrer par **Statut** (En attente, Envoyé, Échec, Annulé) et/ou **Canal** (Email, WhatsApp). | Liste mise à jour selon les filtres. |
| **Réessayer** | Sur une ligne en statut **Échec**, cliquer sur « Réessayer ». | Une nouvelle tentative d’envoi est lancée (statut peut passer à Envoyé ou rester Échec selon la config). |
| **Annuler** | Sur une ligne en statut **En attente** ou **En file**, cliquer sur « Annuler ». | Le statut passe à **Annulé**, le message n’est pas envoyé. |
| **Détail** | Si l’UI affiche un détail (raison d’échec, date planifiée), vérifier les infos. | Raison d’échec lisible pour les messages en échec ; date de planification visible pour les messages planifiés. |

---

### 4.4 Annonces (envoi manuel)

**URL** : `/tenant/:tenantId/communication/announcements`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Composer** | Remplir **Sujet**, **Corps**, choisir **Canaux** (Email et/ou WhatsApp), **Destinataires** (liste d’IDs ou sélection : type + ID, ex. RENTER + id du locataire). | Formulaire validé. |
| **Envoyer** | Cliquer sur « Envoyer » (envoi immédiat). | Les messages sont créés et envoyés (ou mis en file) ; ils apparaissent dans l’**Historique**. |
| **Préférences** | Envoyer une annonce à un destinataire qui a une **préférence** avec seulement Email (sans WhatsApp). Choisir les deux canaux dans l’annonce. | Seul l’email est envoyé pour ce destinataire (les canaux sont filtrés selon les préférences). |

Les destinataires sont en général saisis au format `recipientType:recipientId` (ex. `RENTER:uuid-du-client`). Vérifier le libellé ou l’aide à l’écran pour le format exact.

---

### 4.5 Préférences des destinataires

**URL** : `/tenant/:tenantId/communication/preferences`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Rechercher** | Saisir un type de destinataire + ID (ou recherche par nom si l’UI le permet). | Fiche de préférence du destinataire ou formulaire de création. |
| **Créer / Modifier** | Définir **Canaux autorisés** (Email, WhatsApp), **Types de messages** (Annonce, Alerte, Notification), **Triggers désactivés** (événements pour lesquels ne pas envoyer), **Quiet hours** (début/fin, ex. 22:00 – 08:00). | Préférences enregistrées. |
| **Quiet hours** | Définir une plage (ex. 22:00 – 08:00), puis déclencher une notification automatique pendant cette plage. | La communication est créée avec une **date d’envoi planifiée** après la fin des quiet hours ; elle n’est envoyée qu’à ce moment (job « queue processor » toutes les minutes). |

---

### 4.6 Analytics

**URL** : `/tenant/:tenantId/communication/analytics`

| Action | Comment tester | Résultat attendu |
|--------|----------------|------------------|
| **Tableau de bord** | Ouvrir la page Analytics. | Affichage du **taux de livraison**, des **volumes par canal** (Email, WhatsApp), **par type** (Annonce, Alerte, Notification). |
| **Période** | Si l’UI propose des filtres de date (depuis / jusqu’à), les modifier. | Les chiffres se mettent à jour pour la période choisie. |

Les données reposent sur l’historique des communications du tenant ; envoyer quelques messages (annonces ou automatiques) puis rafraîchir la page pour voir les indicateurs évoluer.

---

### 4.7 Notifications automatiques (déclencher des événements)

Les notifications sont déclenchées par les **autres modules** lorsque des événements se produisent. Pour les tester :

| Événement | Comment le déclencher | Où vérifier |
|-----------|------------------------|------------|
| **Paiement reçu** | Enregistrer un **paiement** pour un loyer (module Locatif / Paiements). | Historique Communication : une ligne « Paiement reçu » vers le locataire (si règle + template configurés). |
| **Ticket créé** | Créer un **ticket de maintenance** (module Maintenance). | Historique : notification « Ticket créé » si une règle existe pour cet événement et le type de destinataire (ex. Contact). |
| **Statut ticket** | Changer le statut d’un ticket (ex. En cours → Résolu). | Historique : notification « Statut ticket modifié » si règle configurée. |
| **Bail activé** | Créer ou activer un **bail** (module Locatif). | Historique : notification « Bail activé » si règle configurée. |
| **Deal créé / stade modifié** | Créer un **deal** CRM ou changer son stade. | Historique : notifications CRM si règles configurées. |
| **Propriété publiée** | Publier une **propriété**. | Historique : notification « Propriété publiée » si règle configurée. |

Pour chaque test : avoir au moins **une règle active** pour l’événement et le type de destinataire concerné, et un **template** (email ou WhatsApp) associé. Les destinataires sont résolus automatiquement (ex. locataire du bail, contact du deal).

---

## 5. Tester les jobs (optionnel)

- **Queue processor** (toutes les minutes) : crée des communications avec `scheduled_at` (ex. quiet hours) ; après l’heure due, elles passent en file puis sont envoyées. Vérifier en base ou dans l’historique que le statut passe de « En attente » à « Envoyé » après l’heure planifiée.
- **Reminder scheduler** (tous les jours à 6h UTC) : envoie les rappels d’échéance (loyer dans 1–3 jours) et « Fin de bail prochaine » (baux se terminant dans 30 jours). Nécessite des données locatives (échéances, baux avec date de fin).
- **Status updater** (toutes les 5 min) : pour l’instant prévu pour mettre à jour les statuts (délivré, lu) ; selon les fournisseurs, peut rester sans effet visible sans webhooks.

---

## 6. Tester l’API directement (optionnel)

Avec un outil type **Postman** ou **curl**, en utilisant un **token d’authentification** et un **tenantId** valides :

- **Base** : `http://localhost:8001/api/tenants/:tenantId/communication`
- **Exemples** :
  - **GET** `/templates` – liste des templates
  - **POST** `/templates` – créer un template (body JSON : name, type, channel, body, subject optionnel)
  - **GET** `/rules` – liste des règles
  - **GET** `/messages/history?page=1&limit=20` – historique
  - **GET** `/analytics` – analytics
  - **POST** `/messages/bulk` – envoi groupé (body : type, channels[], recipientIds[], subject, body)

Toutes les routes nécessitent une **authentification** et un **accès au tenant** (et la permission communication selon la config).

---

## 7. Dépannage rapide

| Problème | Piste de résolution |
|----------|---------------------|
| Menu Communication absent | Vérifier le rôle / les permissions du compte et l’accès au tenant. |
| « 403 » ou « Accès refusé » sur les routes | Vérifier le token et que l’utilisateur a bien accès au `tenantId` utilisé. |
| Aucune communication dans l’historique après un événement | Vérifier qu’une **règle active** existe pour cet événement et ce type de destinataire, qu’un **template** est lié, et que le destinataire est bien résolu (ex. locataire du bail, contact du ticket). |
| Messages en « Échec » | Vérifier les variables d’env (SendGrid, Twilio), les adresses email / numéros, et les logs du backend. |
| Quiet hours sans effet | Vérifier que le job **communication-queue-processor** tourne (backend démarré, `NODE_ENV` ≠ `test`) et que la préférence du destinataire a bien `quiet_hours_start` et `quiet_hours_end` renseignés. |

---

## 8. Récapitulatif des URLs frontend

Pour un tenant d’ID `TENANT_ID` (à remplacer par l’ID réel) :

- Templates : `http://localhost:3000/tenant/TENANT_ID/communication/templates`
- Règles : `http://localhost:3000/tenant/TENANT_ID/communication/rules`
- Historique : `http://localhost:3000/tenant/TENANT_ID/communication/history`
- Annonces : `http://localhost:3000/tenant/TENANT_ID/communication/announcements`
- Préférences : `http://localhost:3000/tenant/TENANT_ID/communication/preferences`
- Analytics : `http://localhost:3000/tenant/TENANT_ID/communication/analytics`

L’ID du tenant est en général visible dans l’URL une fois un tenant sélectionné dans l’application.

---

**Documentation complémentaire**  
- Architecture et API : `docs/communication/COMMUNICATION_MODULE.md`  
- Variables des templates : `docs/communication/TEMPLATE_VARIABLES.md`  
- Checklist de validation : `specs/010-communication-module/checklists/validation-checklist.md`
