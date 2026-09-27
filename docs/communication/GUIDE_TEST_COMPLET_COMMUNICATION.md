# Guide de Test Complet – Module Communication ImmoTopia

## 📋 Table des matières

1. [Vue d'ensemble et préparation](#1-vue-densemble-et-préparation)
2. [Scénario de test complet de bout en bout](#2-scénario-de-test-complet-de-bout-en-bout)
3. [Guide détaillé par interface](#3-guide-détaillé-par-interface)
4. [Scénarios de test avancés](#4-scénarios-de-test-avancés)
5. [Vérifications et dépannage](#5-vérifications-et-dépannage)

---

## 1. Vue d'ensemble et préparation

### 1.1 Architecture du module Communication

Le module Communication d'ImmoTopia permet de :

- **Envoyer des notifications automatiques** déclenchées par des événements métier (paiements, tickets, baux, etc.)
- **Créer des templates réutilisables** avec variables dynamiques
- **Définir des règles de notification** pour automatiser les envois
- **Gérer les préférences** des destinataires (canaux, horaires, types de messages)
- **Envoyer des annonces manuelles** à des groupes de destinataires
- **Consulter l'historique** complet des communications
- **Analyser les performances** avec des indicateurs clés

### 1.2 Prérequis techniques

#### Base de données

```bash
cd packages/api
npx prisma migrate deploy
npx prisma generate
npx prisma db seed  # Pour données de test
```

#### Variables d'environnement (packages/api/.env)

```env
# Base de données
DATABASE_URL="postgresql://user:password@localhost:5432/immotopia"

# Communication
COMMUNICATION_QUEUE_ENABLED=true

# Email (choisir un provider)
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx

# Ou avec Nodemailer
EMAIL_PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

#### Seed des données de communication

> **Obsolete** : les tables `communication_templates` et `notification_rules` ont ete supprimees
> par la migration `20260210120000_remove_communication_messaging_tables`. Les notifications sont
> desormais pilotees par les constantes `src/constants/email-notification-*` et
> `src/constants/whatsapp-notification-*`, surchargeables par tenant via les ecrans
> "Notifications email" / "Notifications WhatsApp". Le seed `db:seed:communication` et le script
> `script:list-rules` ont ete retires.

Ce seed créera :

- 1 template email "Confirmation de paiement"
- 1 règle "Notification paiement reçu" (active)
- Des données de test pour historique

#### Démarrage de l'application

```bash
# Terminal 1 - Backend
cd packages/api
npm run dev
# Vérifier: http://localhost:8001/health

# Terminal 2 - Frontend
cd apps/web
npm run dev
# Ouvrir: http://localhost:3000
```

### 1.3 Données de test recommandées

Pour tester le module, vous devez avoir dans votre base :

| Donnée                   | Description                     | Comment créer                       |
| ------------------------ | ------------------------------- | ----------------------------------- |
| **Tenant (Agence)**      | Au moins 1 agence active        | Via admin ou seeds existants        |
| **Utilisateur agence**   | Compte avec accès communication | Via registration + attribution rôle |
| **Locataire (Renter)**   | Avec email et téléphone         | Module locatif                      |
| **Propriétaire (Owner)** | Avec email et téléphone         | Module propriétés                   |
| **Contact CRM**          | Pour annonces                   | Module CRM                          |
| **Bail actif**           | Pour déclencher événements      | Module locatif                      |

---

## 2. Scénario de test complet de bout en bout

### 🎯 Objectif du scénario

Tester l'ensemble du flux : création de templates → configuration de règles → déclenchement automatique → envoi manuel → consultation historique → analytics

### 📝 Durée estimée

30-45 minutes

### 🔄 Étapes du scénario

#### ÉTAPE 1 : Connexion et accès au module (5 min)

1. **Se connecter à l'application**
   - URL : `http://localhost:3000`
   - Identifiants : Compte utilisateur avec accès tenant
   - Vérifier que le tenant est bien sélectionné (dans l'en-tête ou sélecteur)

2. **Accéder au module Communication**
   - Dans la sidebar, cliquer sur **"Communication"**
   - Le sous-menu doit afficher :
     - Templates
     - Règles
     - Historique
     - Annonces
     - Préférences
     - Analytics

3. **✅ Vérification**
   - Le menu Communication est visible
   - Toutes les sections sont accessibles
   - Aucune erreur 403 ou 404

---

#### ÉTAPE 2 : Créer vos premiers templates (10 min)

##### 2.1 Template Email - Rappel de loyer

1. **Navigation**
   - Cliquer sur **"Templates"** dans le sous-menu
   - Cliquer sur **"Nouveau template"** ou **"Créer"**

2. **Remplir le formulaire**

| Champ     | Valeur d'exemple                                                  |
| --------- | ----------------------------------------------------------------- |
| **Nom**   | `Rappel échéance loyer à venir`                                   |
| **Type**  | `Notification` (liste déroulante : Annonce, Alerte, Notification) |
| **Canal** | `Email` (radio ou liste : Email, WhatsApp)                        |
| **Sujet** | `Rappel : Loyer à payer le {{dueDate}}`                           |
| **Corps** | Voir ci-dessous                                                   |

**Corps du message (avec variables) :**

```html
Bonjour {{contactName}}, Nous vous rappelons que votre loyer pour le bien situé
au {{propertyAddress}} est à payer le {{dueDate}}. Montant à régler : {{amount}}
€ Merci de procéder au paiement avant cette date pour éviter tout désagrément.
Cordialement, L'équipe {{agencyName}}
```

3. **Ajouter les variables disponibles**
   - Cliquer sur **"Variables disponibles"** (bouton ou panel)
   - Sélectionner ou copier les variables :
     - `contactName` (nom du destinataire)
     - `propertyAddress` (adresse du bien)
     - `dueDate` (date d'échéance)
     - `amount` (montant du loyer)
     - `agencyName` (nom de l'agence)

4. **Prévisualiser (optionnel)**
   - Cliquer sur **"Prévisualiser"**
   - Les variables doivent apparaître remplacées par des valeurs d'exemple

5. **Enregistrer**
   - Cliquer sur **"Enregistrer"** ou **"Créer"**
   - Retour à la liste des templates
   - Le template "Rappel échéance loyer à venir" apparaît dans la liste

##### 2.2 Template WhatsApp - Confirmation de paiement

1. **Créer un nouveau template**
   - Cliquer sur **"Nouveau template"**

2. **Remplir le formulaire**

| Champ     | Valeur d'exemple                 |
| --------- | -------------------------------- |
| **Nom**   | `Confirmation paiement WhatsApp` |
| **Type**  | `Notification`                   |
| **Canal** | `WhatsApp`                       |
| **Sujet** | _(laissez vide pour WhatsApp)_   |
| **Corps** | Voir ci-dessous                  |

**Corps du message (format court pour WhatsApp) :**

```
Bonjour {{contactName}},

Votre paiement de {{amount}}€ pour le loyer du {{propertyAddress}} a bien été reçu le {{paymentDate}}.

Merci !
{{agencyName}}
```

3. **Variables à utiliser**
   - `contactName`
   - `amount`
   - `propertyAddress`
   - `paymentDate`
   - `agencyName`

4. **Enregistrer**

##### 2.3 Template Email - Alerte ticket maintenance

1. **Créer un nouveau template**

| Champ     | Valeur d'exemple                                   |
| --------- | -------------------------------------------------- |
| **Nom**   | `Nouveau ticket de maintenance`                    |
| **Type**  | `Alerte`                                           |
| **Canal** | `Email`                                            |
| **Sujet** | `Nouveau ticket #{{ticketId}} - {{ticketSubject}}` |
| **Corps** | Voir ci-dessous                                    |

**Corps du message :**

```html
Bonjour {{contactName}}, Un nouveau ticket de maintenance a été créé pour le
bien situé au {{propertyAddress}}. Ticket #{{ticketId}} Sujet :
{{ticketSubject}} Description : {{ticketDescription}} Priorité :
{{ticketPriority}} Créé le : {{createdAt}} Nous vous tiendrons informé de son
avancement. Cordialement, Service Maintenance - {{agencyName}}
```

5. **Enregistrer**

##### ✅ Checkpoint ÉTAPE 2

- Vous avez créé 3 templates (2 email, 1 WhatsApp)
- Chaque template utilise des variables dynamiques
- Les templates apparaissent dans la liste

---

#### ÉTAPE 3 : Configurer les règles de notification (10 min)

##### 3.1 Règle - Rappel échéance loyer

1. **Navigation**
   - Cliquer sur **"Règles"** dans le sous-menu
   - Cliquer sur **"Nouvelle règle"** ou **"Créer"**

2. **Remplir le formulaire**

| Champ                      | Valeur d'exemple                                                   |
| -------------------------- | ------------------------------------------------------------------ |
| **Nom**                    | `Rappel loyer 3 jours avant échéance`                              |
| **Description**            | `Envoie un email aux locataires 3 jours avant l'échéance du loyer` |
| **Événement déclencheur**  | `INSTALLMENT_DUE_REMINDER` (liste déroulante)                      |
| **Types de destinataires** | `[✓] Locataire` (checkboxes multiples)                             |
| **Template Email**         | `Rappel échéance loyer à venir` (sélecteur)                        |
| **Template WhatsApp**      | _(laissez vide ou None)_                                           |
| **Copie à l'agence**       | `[ ] Oui` (case à cocher)                                          |
| **Délai d'envoi**          | `Immédiat` (ou 0 minutes)                                          |
| **Statut**                 | `[✓] Active` (interrupteur)                                        |

3. **Événements disponibles dans la liste déroulante**
   - `PAYMENT_RECEIVED` - Paiement reçu
   - `PAYMENT_CONFIRMED` - Paiement confirmé
   - `INSTALLMENT_DUE_REMINDER` - Rappel échéance
   - `INSTALLMENT_OVERDUE` - Échéance dépassée
   - `LEASE_ACTIVATED` - Bail activé
   - `LEASE_ENDING_SOON` - Fin de bail prochaine
   - `TICKET_CREATED` - Ticket créé
   - `TICKET_STATUS_CHANGED` - Statut ticket modifié
   - `DEAL_CREATED` - Deal CRM créé
   - `DEAL_STAGE_CHANGED` - Stade deal modifié
   - `APPOINTMENT_REMINDER` - Rappel rendez-vous
   - `PROPERTY_PUBLISHED` - Propriété publiée
   - `DOCUMENT_EXPIRING` - Document expirant

4. **Types de destinataires disponibles**
   - `[ ] Locataire` (Renter)
   - `[ ] Propriétaire` (Owner)
   - `[ ] Contact CRM` (CRM Contact)
   - `[ ] Utilisateur agence` (Agency User)

5. **Enregistrer**
   - Cliquer sur **"Créer"**
   - La règle apparaît dans la liste avec un badge "Active"

##### 3.2 Règle - Confirmation de paiement (multi-canal)

1. **Créer une nouvelle règle**

| Champ                      | Valeur d'exemple                                                             |
| -------------------------- | ---------------------------------------------------------------------------- |
| **Nom**                    | `Confirmation paiement reçu`                                                 |
| **Description**            | `Notifie le locataire et le propriétaire lors de la réception d'un paiement` |
| **Événement déclencheur**  | `PAYMENT_RECEIVED`                                                           |
| **Types de destinataires** | `[✓] Locataire` `[✓] Propriétaire`                                           |
| **Template Email**         | `Confirmation paiement WhatsApp` _(peut réutiliser le même template)_        |
| **Template WhatsApp**      | `Confirmation paiement WhatsApp`                                             |
| **Copie à l'agence**       | `[✓] Oui`                                                                    |
| **Délai d'envoi**          | `Immédiat`                                                                   |
| **Statut**                 | `[✓] Active`                                                                 |

2. **Enregistrer**

##### 3.3 Règle - Nouveau ticket maintenance

1. **Créer une nouvelle règle**

| Champ                      | Valeur d'exemple                                                        |
| -------------------------- | ----------------------------------------------------------------------- |
| **Nom**                    | `Notification création ticket`                                          |
| **Description**            | `Alerte le propriétaire lors de la création d'un ticket de maintenance` |
| **Événement déclencheur**  | `TICKET_CREATED`                                                        |
| **Types de destinataires** | `[✓] Propriétaire` `[✓] Contact CRM`                                    |
| **Template Email**         | `Nouveau ticket de maintenance`                                         |
| **Template WhatsApp**      | _(None)_                                                                |
| **Copie à l'agence**       | `[✓] Oui`                                                               |
| **Délai d'envoi**          | `Immédiat`                                                              |
| **Statut**                 | `[✓] Active`                                                            |

2. **Enregistrer**

##### ✅ Checkpoint ÉTAPE 3

- Vous avez créé 3 règles actives
- Chaque règle est liée à un événement spécifique
- Les destinataires et templates sont bien configurés
- Les règles apparaissent dans la liste avec le statut "Active"

---

#### ÉTAPE 4 : Tester les notifications automatiques (8 min)

##### 4.1 Déclencher un paiement (événement PAYMENT_RECEIVED)

1. **Aller dans le module Locatif / Paiements**
   - Menu **"Locatif"** > **"Paiements"** ou **"Baux"**

2. **Enregistrer un nouveau paiement**

| Champ                 | Valeur d'exemple                    |
| --------------------- | ----------------------------------- |
| **Bail**              | Sélectionner un bail avec locataire |
| **Montant**           | `850.00`                            |
| **Date de paiement**  | Date du jour                        |
| **Type**              | `Loyer`                             |
| **Moyen de paiement** | `Virement bancaire`                 |
| **Statut**            | `Confirmé` ou `Validé`              |

3. **Enregistrer le paiement**
   - Cliquer sur **"Enregistrer"** ou **"Valider"**

4. **✅ Vérification immédiate**
   - Le système doit déclencher la règle "Confirmation paiement reçu"
   - Une notification doit être créée et envoyée (ou mise en file)

##### 4.2 Vérifier l'historique des communications

1. **Retour au module Communication**
   - Menu **"Communication"** > **"Historique"**

2. **Rechercher la communication créée**
   - Filtrer par **Type : Notification**
   - Filtrer par **Statut : Envoyé** (ou En file d'attente)
   - Vous devriez voir 2-3 lignes (locataire + propriétaire + copie agence)

3. **Vérifier les détails**

| Colonne          | Valeur attendue                        |
| ---------------- | -------------------------------------- |
| **Type**         | Notification                           |
| **Canal**        | Email, WhatsApp (selon règle)          |
| **Destinataire** | Nom du locataire, nom du propriétaire  |
| **Sujet**        | (Si email) "Votre paiement a été reçu" |
| **Statut**       | Envoyé ✓ (ou En attente)               |
| **Date**         | Date/heure de création                 |

4. **Cliquer sur une ligne pour voir le détail**
   - Le corps du message doit afficher les variables remplacées :
     - `{{contactName}}` → "Jean Dupont"
     - `{{amount}}` → "850.00"
     - `{{propertyAddress}}` → "15 rue de la Paix, Paris"
     - etc.

##### 4.3 Déclencher un ticket de maintenance

1. **Aller dans le module Maintenance**
   - Menu **"Maintenance"** > **"Tickets"**

2. **Créer un nouveau ticket**

| Champ             | Valeur d'exemple                                             |
| ----------------- | ------------------------------------------------------------ |
| **Bien concerné** | Sélectionner un bien avec propriétaire                       |
| **Sujet**         | `Fuite d'eau dans la cuisine`                                |
| **Description**   | `Le locataire signale une fuite sous l'évier de la cuisine.` |
| **Priorité**      | `Haute`                                                      |
| **Statut**        | `Nouveau` ou `Ouvert`                                        |

3. **Enregistrer le ticket**

4. **✅ Vérification**
   - Retour au **module Communication > Historique**
   - Filtrer par **Type : Alerte**
   - Une nouvelle ligne doit apparaître pour le propriétaire
   - Sujet : "Nouveau ticket #123 - Fuite d'eau dans la cuisine"

##### ✅ Checkpoint ÉTAPE 4

- Les notifications automatiques sont déclenchées par les événements
- L'historique affiche toutes les communications créées
- Les variables sont correctement remplacées dans les messages
- Les statuts sont cohérents (Envoyé, En attente, etc.)

---

#### ÉTAPE 5 : Configurer les préférences d'un destinataire (5 min)

##### 5.1 Rechercher un destinataire

1. **Navigation**
   - Menu **"Communication"** > **"Préférences"**

2. **Rechercher un locataire ou propriétaire**

| Champ                    | Valeur d'exemple                           |
| ------------------------ | ------------------------------------------ |
| **Type de destinataire** | `Locataire` (liste déroulante)             |
| **Rechercher**           | Nom ou ID du locataire (ex: "Jean Dupont") |

3. **Cliquer sur "Rechercher" ou sélectionner dans la liste**

##### 5.2 Configurer les préférences

Si le destinataire n'a pas encore de préférences, un formulaire de création s'affiche.

**Formulaire de préférences :**

| Section                           | Champ               | Valeur d'exemple                                                              |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| **Canaux autorisés**              | Email               | `[✓] Oui`                                                                     |
|                                   | WhatsApp            | `[✓] Oui`                                                                     |
| **Types de messages**             | Annonces            | `[✓] Oui`                                                                     |
|                                   | Alertes             | `[✓] Oui`                                                                     |
|                                   | Notifications       | `[✓] Oui`                                                                     |
| **Plages horaires (Quiet Hours)** | Début               | `22:00`                                                                       |
|                                   | Fin                 | `08:00`                                                                       |
| **Événements désactivés**         | _Liste optionnelle_ | `[ ] INSTALLMENT_DUE_REMINDER` _(exemple : locataire ne veut pas de rappels)_ |

**Explications :**

- **Canaux autorisés** : Le destinataire ne recevra des messages QUE sur les canaux cochés
- **Types de messages** : Permet de filtrer par type (Annonce, Alerte, Notification)
- **Quiet Hours** : Pendant cette plage, les messages sont mis en attente et envoyés après
- **Événements désactivés** : Le destinataire ne recevra JAMAIS de notification pour ces événements

4. **Enregistrer les préférences**
   - Cliquer sur **"Enregistrer"**

##### 5.3 Tester les Quiet Hours

1. **Modifier les préférences**
   - Définir Quiet Hours : `08:00` - `23:59` (pour tester immédiatement)

2. **Déclencher une notification**
   - Enregistrer un nouveau paiement (comme à l'ÉTAPE 4)

3. **Vérifier l'historique**
   - Aller dans **Historique**
   - La communication doit avoir le statut **"Planifié"** ou **"En attente"**
   - La colonne **"Date d'envoi planifiée"** doit indiquer une heure après la fin des Quiet Hours

4. **Attendre ou modifier l'heure système**
   - Le job `communication-queue-processor` (toutes les minutes) traitera le message à l'heure prévue

##### 5.4 Tester la désactivation d'un canal

1. **Modifier les préférences d'un destinataire**
   - Rechercher le locataire "Jean Dupont"
   - Décocher **WhatsApp** dans "Canaux autorisés"
   - Enregistrer

2. **Déclencher une notification avec règle multi-canal**
   - Enregistrer un paiement (règle avec Email + WhatsApp)

3. **Vérifier l'historique**
   - Seul l'email doit apparaître pour "Jean Dupont"
   - Le WhatsApp ne doit PAS être créé

##### ✅ Checkpoint ÉTAPE 5

- Les préférences sont correctement enregistrées
- Les Quiet Hours reportent bien les envois
- Les canaux désactivés sont respectés
- Les événements désactivés ne génèrent pas de notification

---

#### ÉTAPE 6 : Envoyer une annonce manuelle (7 min)

##### 6.1 Composer une annonce

1. **Navigation**
   - Menu **"Communication"** > **"Annonces"**
   - Cliquer sur **"Nouvelle annonce"** ou **"Composer"**

2. **Remplir le formulaire**

| Champ                | Valeur d'exemple                                             |
| -------------------- | ------------------------------------------------------------ |
| **Type**             | `Annonce` (liste déroulante : Annonce, Alerte, Notification) |
| **Sujet**            | `Fermeture exceptionnelle de l'agence`                       |
| **Corps du message** | Voir ci-dessous                                              |
| **Canaux**           | `[✓] Email` `[ ] WhatsApp`                                   |
| **Destinataires**    | Voir ci-dessous                                              |
| **Pièces jointes**   | _(Optionnel pour email)_                                     |
| **Envoi**            | `Immédiat` (ou planifier à une date/heure)                   |

**Corps du message :**

```html
Bonjour, Nous vous informons que l'agence ImmoTopia sera exceptionnellement
fermée le vendredi 15 février 2026 pour inventaire annuel. En cas d'urgence,
vous pouvez nous contacter au 06 XX XX XX XX. Nous vous remercions de votre
compréhension. Cordialement, L'équipe ImmoTopia
```

##### 6.2 Sélectionner les destinataires

Plusieurs options selon l'interface :

**Option A : Sélection par groupe**

- `[✓] Tous les locataires`
- `[ ] Tous les propriétaires`
- `[ ] Tous les contacts CRM`

**Option B : Sélection manuelle (liste ou recherche)**

- Rechercher "Jean Dupont" → Ajouter
- Rechercher "Marie Martin" → Ajouter
- Rechercher "Paul Durand" → Ajouter

**Option C : Saisie format texte (selon implémentation)**

```
RENTER:uuid-du-locataire-1
RENTER:uuid-du-locataire-2
OWNER:uuid-du-proprietaire-1
```

**Format attendu dans la liste :**

- Type de destinataire : `RENTER`, `OWNER`, `CRM_CONTACT`, `AGENCY_USER`
- ID : UUID du destinataire
- Format : `TYPE:ID`

##### 6.3 Envoyer l'annonce

1. **Envoi immédiat**
   - Cliquer sur **"Envoyer maintenant"**
   - Une confirmation peut apparaître : "Envoyer à X destinataires ?"
   - Confirmer

2. **Ou planifier l'envoi**
   - Sélectionner **"Planifier l'envoi"**
   - Choisir date : `15/02/2026`
   - Choisir heure : `09:00`
   - Cliquer sur **"Planifier"**

3. **✅ Vérification**
   - Redirection vers **Historique** ou message de confirmation
   - Les communications doivent apparaître dans l'historique :
     - Statut **"Envoyé"** (si envoi immédiat)
     - Statut **"Planifié"** (si envoi différé)

##### 6.4 Annuler une annonce planifiée

1. **Aller dans l'historique**
   - Menu **"Communication"** > **"Historique"**
   - Filtrer par **Statut : Planifié** ou **En attente**

2. **Trouver l'annonce planifiée**
   - Sujet : "Fermeture exceptionnelle de l'agence"
   - Date d'envoi planifiée : 15/02/2026 09:00

3. **Annuler l'envoi**
   - Cliquer sur l'action **"Annuler"** (icône poubelle ou bouton)
   - Confirmer l'annulation

4. **✅ Vérification**
   - Le statut passe à **"Annulé"**
   - Le message ne sera pas envoyé à l'heure prévue

##### ✅ Checkpoint ÉTAPE 6

- Une annonce manuelle a été composée et envoyée
- Les destinataires ont bien été sélectionnés
- L'historique affiche les communications créées
- Une annonce planifiée peut être annulée avant l'envoi

---

#### ÉTAPE 7 : Consulter les analytics (5 min)

##### 7.1 Accéder au tableau de bord

1. **Navigation**
   - Menu **"Communication"** > **"Analytics"**

2. **Interface du tableau de bord**

L'écran doit afficher plusieurs sections :

##### Section 1 : Vue d'ensemble

| Indicateur            | Description                             | Exemple de valeur |
| --------------------- | --------------------------------------- | ----------------- |
| **Total envoyé**      | Nombre total de communications envoyées | 47                |
| **Taux de livraison** | % de messages délivrés / envoyés        | 94.5%             |
| **En attente**        | Messages planifiés ou en file           | 3                 |
| **Échecs**            | Messages en erreur                      | 2                 |

##### Section 2 : Répartition par canal

**Graphique camembert ou barres :**

- Email : 35 (74%)
- WhatsApp : 12 (26%)

**Taux de livraison par canal :**

- Email : 97% (34 délivrés / 35 envoyés)
- WhatsApp : 87% (10 délivrés / 12 envoyés)

##### Section 3 : Répartition par type

**Graphique barres ou camembert :**

- Notifications : 28 (60%)
- Annonces : 12 (26%)
- Alertes : 7 (14%)

##### Section 4 : Tendances (graphique ligne)

**Évolution sur 7 ou 30 derniers jours :**

- Axe X : Dates
- Axe Y : Nombre de messages
- Courbes : Envoyés, Délivrés, Échecs

##### 7.2 Filtrer par période

1. **Utiliser les filtres de date**

| Champ             | Valeur d'exemple |
| ----------------- | ---------------- |
| **Date de début** | `01/01/2026`     |
| **Date de fin**   | `31/01/2026`     |

2. **Cliquer sur "Appliquer"**
   - Les indicateurs et graphiques se mettent à jour
   - Seules les communications de la période sont prises en compte

##### 7.3 Identifier les problèmes

**Exemple de détection d'anomalie :**

- Si le taux de livraison WhatsApp chute à 40%
  → Vérifier les variables d'environnement Twilio
  → Vérifier les numéros de téléphone des destinataires
  → Consulter les logs backend

- Si beaucoup de messages en "Échec"
  → Aller dans **Historique** et filtrer par **Statut : Échec**
  → Consulter les raisons d'échec (adresse invalide, provider erreur, etc.)

##### ✅ Checkpoint ÉTAPE 7

- Le tableau de bord affiche les indicateurs clés
- Les graphiques par canal et par type sont cohérents
- Les filtres de période fonctionnent
- Les tendances permettent d'identifier les problèmes

---

#### ÉTAPE 8 : Gérer les échecs et réessayer (5 min)

##### 8.1 Simuler un échec

Pour tester cette fonctionnalité, vous pouvez :

**Option A : Email invalide**

1. Créer un destinataire avec email invalide : `test@invalid-domain-that-does-not-exist.xyz`
2. Envoyer une annonce à ce destinataire
3. Le message doit passer en statut **"Échec"**

**Option B : Désactiver temporairement le provider**

1. Dans `packages/api/.env`, mettre une clé API invalide
2. Envoyer une annonce
3. Redémarrer l'API avec la vraie clé après

##### 8.2 Consulter les échecs

1. **Aller dans l'historique**
   - Menu **"Communication"** > **"Historique"**
   - Filtrer par **Statut : Échec**

2. **Identifier les lignes en erreur**
   - Icône ❌ ou badge rouge "Échec"

3. **Cliquer sur une ligne pour voir le détail**

**Détail affiché :**

| Champ                   | Exemple de valeur                                                |
| ----------------------- | ---------------------------------------------------------------- |
| **Statut**              | Échec                                                            |
| **Raison**              | `Email address is invalid` ou `Provider error: 401 Unauthorized` |
| **Tentatives**          | 1/3                                                              |
| **Dernière tentative**  | 04/02/2026 10:45                                                 |
| **Prochaine tentative** | 04/02/2026 11:00 (selon politique de retry)                      |

##### 8.3 Corriger et réessayer

1. **Corriger le problème**
   - Si email invalide : aller dans le module Locatif et corriger l'email du locataire
   - Si clé API : corriger dans `.env` et redémarrer l'API

2. **Réessayer l'envoi**
   - Dans le détail de la communication, cliquer sur **"Réessayer"**
   - Ou dans la liste, cliquer sur l'icône "Réessayer" (icône flèche circulaire)

3. **✅ Vérification**
   - Le statut passe en **"En file d'attente"** puis **"Envoyé"**
   - La raison d'échec est effacée
   - Le nombre de tentatives augmente

##### 8.4 Politique de retry automatique

Le système peut réessayer automatiquement selon la configuration :

**Paramètres dans le code (CommunicationService) :**

- Nombre max de tentatives : 3
- Délai entre tentatives : 5 minutes (exponentiel : 5min, 10min, 20min)
- Après 3 échecs, le statut reste "Échec" sans nouvelle tentative

**Pour tester :**

1. Créer un échec (email invalide non corrigé)
2. Attendre 5-10 minutes
3. Vérifier le champ "Tentatives" dans l'historique (doit augmenter automatiquement)

##### ✅ Checkpoint ÉTAPE 8

- Les échecs sont correctement identifiés et affichés
- La raison de l'échec est visible
- Le bouton "Réessayer" fonctionne
- La politique de retry automatique est activée

---

### 🏁 Résumé du scénario complet

| Étape                 | Durée      | Résultat attendu                            |
| --------------------- | ---------- | ------------------------------------------- |
| 1. Connexion          | 5 min      | Accès au module Communication ✓             |
| 2. Templates          | 10 min     | 3 templates créés (2 email, 1 WhatsApp) ✓   |
| 3. Règles             | 10 min     | 3 règles actives configurées ✓              |
| 4. Notifications auto | 8 min      | Événements déclenchent des envois ✓         |
| 5. Préférences        | 5 min      | Quiet hours et canaux respectés ✓           |
| 6. Annonces manuelles | 7 min      | Annonce envoyée à plusieurs destinataires ✓ |
| 7. Analytics          | 5 min      | Indicateurs cohérents affichés ✓            |
| 8. Gestion échecs     | 5 min      | Réessai fonctionnel ✓                       |
| **TOTAL**             | **55 min** | **Module complet validé ✓**                 |

---

## 3. Guide détaillé par interface

### 3.1 Interface : Liste des Templates

**URL** : `/tenant/:tenantId/communication/templates`

#### Description

Page affichant tous les templates de messages créés pour le tenant. Permet de créer, modifier, dupliquer et supprimer des templates.

#### Éléments de l'interface

| Élément                | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| **En-tête**            | Titre "Templates" + bouton "Nouveau template"                                   |
| **Barre de recherche** | Rechercher par nom de template                                                  |
| **Filtres**            | Type (Annonce, Alerte, Notification), Canal (Email, WhatsApp)                   |
| **Tableau**            | Liste des templates avec colonnes : Nom, Type, Canal, Date de création, Actions |
| **Actions**            | Éditer (crayon), Dupliquer (copie), Supprimer (corbeille), Prévisualiser (œil)  |
| **Pagination**         | Si plus de 20 templates                                                         |

#### Données d'exemple pour test

**Template 1**

- Nom : "Bienvenue nouveau locataire"
- Type : Annonce
- Canal : Email
- Statut : Actif

**Template 2**

- Nom : "Alerte impayé loyer"
- Type : Alerte
- Canal : Email + WhatsApp

**Template 3**

- Nom : "Rappel RDV visite"
- Type : Notification
- Canal : WhatsApp

#### Actions possibles

1. **Créer** : Ouvre le formulaire de création
2. **Éditer** : Ouvre le formulaire en mode édition
3. **Dupliquer** : Crée une copie du template avec "_copie" dans le nom
4. **Supprimer** : Confirmation avant suppression (impossible si utilisé par une règle active)
5. **Prévisualiser** : Affiche un aperçu avec variables remplacées par des exemples

---

### 3.2 Interface : Formulaire Template (Création/Édition)

**URL** : `/tenant/:tenantId/communication/templates/new` ou `/templates/:id/edit`

#### Description

Formulaire complet pour créer ou modifier un template de message.

#### Champs du formulaire

| Champ           | Type              | Obligatoire      | Description                                        |
| --------------- | ----------------- | ---------------- | -------------------------------------------------- |
| **Nom**         | Texte             | ✓                | Nom unique du template (max 100 caractères)        |
| **Description** | Textarea          | ✗                | Description interne (non visible par destinataire) |
| **Type**        | Select            | ✓                | Annonce, Alerte, Notification                      |
| **Canal**       | Radio             | ✓                | Email ou WhatsApp                                  |
| **Sujet**       | Texte             | Email uniquement | Sujet de l'email (max 200 caractères)              |
| **Corps**       | Textarea/RichText | ✓                | Contenu du message (max 5000 caractères)           |
| **Variables**   | Panel/Liste       | ✗                | Liste des variables disponibles                    |
| **Mode HTML**   | Toggle            | Email uniquement | Activer le HTML pour mise en forme                 |

#### Variables disponibles par contexte

**Variables globales (toujours disponibles)**

```javascript
{
  agencyName: "Nom de l'agence",
  agencyPhone: "Téléphone de l'agence",
  agencyEmail: "Email de l'agence",
  contactName: "Nom du destinataire",
  contactEmail: "Email du destinataire",
  contactPhone: "Téléphone du destinataire",
  currentDate: "Date du jour",
  currentTime: "Heure actuelle"
}
```

**Variables liées aux paiements**

```javascript
{
  amount: "Montant du paiement",
  paymentDate: "Date du paiement",
  paymentMethod: "Moyen de paiement",
  paymentReference: "Référence du paiement"
}
```

**Variables liées aux baux**

```javascript
{
  leaseId: "ID du bail",
  leaseStartDate: "Date de début",
  leaseEndDate: "Date de fin",
  rentAmount: "Montant du loyer",
  depositAmount: "Montant de la caution"
}
```

**Variables liées aux propriétés**

```javascript
{
  propertyAddress: "Adresse complète",
  propertyCity: "Ville",
  propertyZipCode: "Code postal",
  propertyType: "Type de bien (Appartement, Maison, etc.)"
}
```

**Variables liées aux tickets**

```javascript
{
  ticketId: "Numéro du ticket",
  ticketSubject: "Sujet du ticket",
  ticketDescription: "Description",
  ticketPriority: "Priorité (Haute, Moyenne, Basse)",
  ticketStatus: "Statut (Nouveau, En cours, Résolu)",
  createdAt: "Date de création"
}
```

**Variables liées aux échéances**

```javascript
{
  dueDate: "Date d'échéance",
  dueAmount: "Montant dû",
  installmentNumber: "Numéro de l'échéance",
  remainingBalance: "Solde restant"
}
```

**Variables CRM**

```javascript
{
  dealId: "ID du deal",
  dealStage: "Étape du deal",
  dealValue: "Valeur du deal",
  appointmentDate: "Date du rendez-vous",
  appointmentTime: "Heure du rendez-vous"
}
```

#### Exemples de templates complets

**Exemple 1 : Email - Rappel échéance**

```
Nom: Rappel paiement loyer
Type: Notification
Canal: Email
Sujet: Rappel : Loyer à payer le {{dueDate}}

Corps (HTML):
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 12px; }
    .highlight { background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; }
  </style>
</head>
<body>
  <div class="header">
    <h2>{{agencyName}}</h2>
  </div>
  <div class="content">
    <p>Bonjour {{contactName}},</p>

    <p>Nous vous rappelons que votre loyer pour le bien situé au <strong>{{propertyAddress}}</strong>
    est à payer avant le <strong>{{dueDate}}</strong>.</p>

    <div class="highlight">
      <p><strong>Montant à régler : {{dueAmount}} €</strong></p>
      <p>Échéance n°{{installmentNumber}}</p>
    </div>

    <p>Merci de procéder au paiement avant cette date pour éviter tout désagrément.</p>

    <p>Coordonnées bancaires :<br>
    IBAN : FR76 XXXX XXXX XXXX XXXX XXXX XXX<br>
    BIC : XXXXXXXX</p>

    <p>Cordialement,<br>
    L'équipe {{agencyName}}<br>
    {{agencyPhone}} - {{agencyEmail}}</p>
  </div>
  <div class="footer">
    <p>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
  </div>
</body>
</html>
```

**Exemple 2 : WhatsApp - Confirmation rapide**

```
Nom: Confirmation paiement WhatsApp
Type: Notification
Canal: WhatsApp

Corps (Texte simple):
✅ Paiement reçu

Bonjour {{contactName}},

Votre paiement de {{amount}}€ pour le loyer du bien situé {{propertyAddress}} a bien été reçu le {{paymentDate}}.

Reçu : {{paymentReference}}

Merci !
{{agencyName}}
{{agencyPhone}}
```

**Exemple 3 : Email - Ticket maintenance**

```
Nom: Notification ticket maintenance
Type: Alerte
Canal: Email
Sujet: 🔧 Nouveau ticket #{{ticketId}} - {{ticketSubject}}

Corps:
Bonjour {{contactName}},

Un nouveau ticket de maintenance a été créé pour votre bien situé au {{propertyAddress}}.

📋 Détails du ticket :
- Numéro : #{{ticketId}}
- Sujet : {{ticketSubject}}
- Description : {{ticketDescription}}
- Priorité : {{ticketPriority}}
- Statut : {{ticketStatus}}
- Créé le : {{createdAt}}

Notre équipe maintenance va traiter votre demande dans les plus brefs délais.
Vous serez informé de l'évolution du ticket.

En cas d'urgence, contactez-nous au {{agencyPhone}}.

Cordialement,
Service Maintenance - {{agencyName}}
```

**Exemple 4 : Email - Annonce générale**

```
Nom: Annonce travaux immeuble
Type: Annonce
Canal: Email
Sujet: Travaux programmés dans votre immeuble

Corps:
Madame, Monsieur {{contactName}},

Nous vous informons que des travaux de rénovation auront lieu dans l'immeuble situé
au {{propertyAddress}} du 15 au 20 mars 2026.

Nature des travaux :
- Réfection de la toiture
- Peinture des parties communes
- Nettoyage des gouttières

Horaires : 8h00 - 18h00 (du lundi au vendredi)

Durant cette période :
- L'accès à l'immeuble sera maintenu
- Des nuisances sonores sont à prévoir
- Le stationnement devant l'immeuble pourra être limité

Nous vous remercions de votre compréhension.

Pour toute question, contactez-nous au {{agencyPhone}} ou {{agencyEmail}}.

Cordialement,
{{agencyName}}
```

#### Validation du formulaire

**Règles de validation :**

- Nom : requis, 3-100 caractères, unique par tenant
- Type : requis
- Canal : requis
- Sujet : requis pour Email, max 200 caractères
- Corps : requis, 10-5000 caractères
- Variables : doivent utiliser la syntaxe `{{variableName}}`

**Messages d'erreur :**

- "Le nom est requis"
- "Un template avec ce nom existe déjà"
- "Le sujet est requis pour les templates email"
- "Le corps doit contenir au moins 10 caractères"
- "Variable invalide : {{xxxxx}}. Vérifiez la syntaxe."

---

### 3.3 Interface : Liste des Règles

**URL** : `/tenant/:tenantId/communication/rules`

#### Description

Page affichant toutes les règles de notification configurées. Permet de créer, modifier, activer/désactiver et supprimer des règles.

#### Éléments de l'interface

| Élément                  | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| **En-tête**              | Titre "Règles de notification" + bouton "Nouvelle règle"          |
| **Barre de recherche**   | Rechercher par nom de règle                                       |
| **Filtres**              | Statut (Active, Inactive), Événement                              |
| **Tableau**              | Colonnes : Nom, Événement, Destinataires, Canaux, Statut, Actions |
| **Toggle Actif/Inactif** | Interrupteur pour activer/désactiver rapidement                   |
| **Actions**              | Éditer, Dupliquer, Supprimer                                      |

#### Données d'exemple pour test

**Règle 1**

```
Nom: Rappel loyer 3 jours avant
Événement: INSTALLMENT_DUE_REMINDER
Destinataires: Locataires
Canaux: Email
Statut: ✓ Active
```

**Règle 2**

```
Nom: Confirmation paiement reçu
Événement: PAYMENT_RECEIVED
Destinataires: Locataires, Propriétaires
Canaux: Email, WhatsApp
Statut: ✓ Active
```

**Règle 3**

```
Nom: Alerte ticket haute priorité
Événement: TICKET_CREATED
Destinataires: Propriétaires, Agence
Canaux: Email
Statut: ✗ Inactive
```

#### Actions possibles

1. **Toggle Statut** : Active/désactive la règle en un clic
2. **Éditer** : Ouvre le formulaire d'édition
3. **Dupliquer** : Crée une copie (inactive par défaut)
4. **Supprimer** : Confirmation requise

---

### 3.4 Interface : Formulaire Règle (Création/Édition)

**URL** : `/tenant/:tenantId/communication/rules/new` ou `/rules/:id/edit`

#### Description

Formulaire pour créer ou modifier une règle de notification automatique.

#### Champs du formulaire

| Champ                      | Type         | Obligatoire | Description                                  |
| -------------------------- | ------------ | ----------- | -------------------------------------------- |
| **Nom**                    | Texte        | ✓           | Nom de la règle (max 100 caractères)         |
| **Description**            | Textarea     | ✗           | Description interne                          |
| **Événement déclencheur**  | Select       | ✓           | Type d'événement qui déclenche la règle      |
| **Types de destinataires** | Checkboxes   | ✓           | Locataire, Propriétaire, Contact CRM, Agence |
| **Template Email**         | Select       | ✗           | Template à utiliser pour email               |
| **Template WhatsApp**      | Select       | ✗           | Template à utiliser pour WhatsApp            |
| **Copie à l'agence**       | Checkbox     | ✗           | Envoyer une copie à l'agence                 |
| **Email copie agence**     | Texte        | Si copie    | Email destinataire de la copie               |
| **Délai d'envoi**          | Number       | ✗           | Délai en minutes (0 = immédiat)              |
| **Conditions**             | JSON/Builder | ✗           | Conditions avancées (ex: montant > 1000)     |
| **Statut**                 | Toggle       | ✓           | Active ou Inactive                           |

#### Événements disponibles

**Catégorie : Paiements**

```
PAYMENT_RECEIVED - Paiement reçu
PAYMENT_CONFIRMED - Paiement confirmé
PAYMENT_FAILED - Paiement échoué
```

**Catégorie : Échéances**

```
INSTALLMENT_DUE_REMINDER - Rappel échéance (X jours avant)
INSTALLMENT_OVERDUE - Échéance dépassée
```

**Catégorie : Baux**

```
LEASE_ACTIVATED - Bail activé
LEASE_ENDING_SOON - Fin de bail prochaine (30 jours)
LEASE_TERMINATED - Bail résilié
```

**Catégorie : Maintenance**

```
TICKET_CREATED - Nouveau ticket créé
TICKET_STATUS_CHANGED - Statut ticket modifié
TICKET_ASSIGNED - Ticket assigné à un intervenant
TICKET_RESOLVED - Ticket résolu
```

**Catégorie : CRM**

```
DEAL_CREATED - Nouveau deal créé
DEAL_STAGE_CHANGED - Étape du deal modifiée
APPOINTMENT_REMINDER - Rappel rendez-vous (1 jour avant)
LEAD_ASSIGNED - Lead assigné
```

**Catégorie : Propriétés**

```
PROPERTY_PUBLISHED - Propriété publiée
DOCUMENT_EXPIRING - Document expirant (30 jours)
```

#### Exemples de règles complètes

**Règle 1 : Rappel échéance loyer**

```
Nom: Rappel loyer 3 jours avant échéance
Description: Envoie un email aux locataires 3 jours avant la date d'échéance du loyer

Événement: INSTALLMENT_DUE_REMINDER
Types de destinataires:
  [✓] Locataire
  [ ] Propriétaire
  [ ] Contact CRM
  [ ] Agence

Template Email: "Rappel paiement loyer"
Template WhatsApp: (None)

Copie à l'agence: [ ] Non
Délai d'envoi: 0 (immédiat)

Statut: [✓] Active
```

**Règle 2 : Multi-canal paiement reçu**

```
Nom: Confirmation paiement multi-canal
Description: Notifie locataire et propriétaire par email et WhatsApp lors d'un paiement

Événement: PAYMENT_RECEIVED
Types de destinataires:
  [✓] Locataire
  [✓] Propriétaire
  [ ] Contact CRM
  [ ] Agence

Template Email: "Confirmation paiement email"
Template WhatsApp: "Confirmation paiement WhatsApp"

Copie à l'agence: [✓] Oui
Email copie: compta@immotopia.fr

Délai d'envoi: 0 (immédiat)

Statut: [✓] Active
```

**Règle 3 : Alerte ticket haute priorité**

```
Nom: Alerte maintenance prioritaire
Description: Notifie le propriétaire et l'agence lors d'un ticket haute priorité

Événement: TICKET_CREATED
Types de destinataires:
  [ ] Locataire
  [✓] Propriétaire
  [ ] Contact CRM
  [✓] Agence

Template Email: "Notification ticket maintenance"
Template WhatsApp: (None)

Copie à l'agence: [✓] Oui
Email copie: maintenance@immotopia.fr

Délai d'envoi: 0 (immédiat)

Conditions (avancé):
{
  "ticketPriority": "HIGH"
}

Statut: [✓] Active
```

**Règle 4 : Rappel RDV visite**

```
Nom: Rappel rendez-vous visite J-1
Description: Rappel WhatsApp envoyé 1 jour avant un rendez-vous de visite

Événement: APPOINTMENT_REMINDER
Types de destinataires:
  [ ] Locataire
  [ ] Propriétaire
  [✓] Contact CRM
  [ ] Agence

Template Email: (None)
Template WhatsApp: "Rappel RDV visite"

Copie à l'agence: [ ] Non
Délai d'envoi: 0 (géré par le job scheduler)

Statut: [✓] Active
```

**Règle 5 : Fin de bail prochaine**

```
Nom: Notification fin de bail 30 jours
Description: Prévient locataire et propriétaire 30 jours avant la fin du bail

Événement: LEASE_ENDING_SOON
Types de destinataires:
  [✓] Locataire
  [✓] Propriétaire
  [ ] Contact CRM
  [ ] Agence

Template Email: "Fin de bail prochaine"
Template WhatsApp: (None)

Copie à l'agence: [✓] Oui
Email copie: gestion@immotopia.fr

Délai d'envoi: 0 (géré par le job)

Statut: [✓] Active
```

#### Validation du formulaire

**Règles de validation :**

- Nom : requis, 3-100 caractères
- Événement : requis
- Au moins 1 type de destinataire sélectionné
- Au moins 1 template (Email ou WhatsApp) sélectionné
- Si "Copie à l'agence", email requis
- Délai d'envoi : >= 0 minutes

**Messages d'erreur :**

- "Le nom est requis"
- "Sélectionnez au moins un événement"
- "Sélectionnez au moins un type de destinataire"
- "Sélectionnez au moins un template (Email ou WhatsApp)"
- "L'email de copie est requis si l'option est activée"

---

### 3.5 Interface : Historique des communications

**URL** : `/tenant/:tenantId/communication/history`

#### Description

Page affichant l'historique complet des communications envoyées, planifiées, en attente ou en échec. Permet de filtrer, rechercher, consulter les détails, annuler et réessayer.

#### Éléments de l'interface

| Élément                | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| **En-tête**            | Titre "Historique des communications" + stats rapides              |
| **Stats rapides**      | Total envoyé, Taux de livraison, En attente, Échecs                |
| **Filtres**            | Type, Canal, Statut, Date début/fin, Destinataire                  |
| **Barre de recherche** | Rechercher par destinataire ou sujet                               |
| **Tableau**            | Colonnes : Date, Type, Canal, Destinataire, Sujet, Statut, Actions |
| **Pagination**         | 20 résultats par page                                              |

#### Colonnes du tableau

| Colonne          | Description                                                                           | Exemple                      |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| **Date**         | Date/heure d'envoi ou de création                                                     | 04/02/2026 10:45             |
| **Type**         | Badge coloré : Annonce (bleu), Alerte (orange), Notification (vert)                   | 🔔 Notification              |
| **Canal**        | Icône Email 📧 ou WhatsApp 💬                                                         | 📧 Email                     |
| **Destinataire** | Nom et type (Locataire, Propriétaire, etc.)                                           | Jean Dupont (Locataire)      |
| **Sujet**        | Sujet du message (tronqué à 50 caractères)                                            | Rappel : Loyer à payer le... |
| **Statut**       | Badge : Envoyé ✓, Délivré ✓✓, Lu ✓✓✓, Échec ❌, En attente ⏳, Planifié 📅, Annulé 🚫 | ✓ Envoyé                     |
| **Actions**      | Voir détail 👁, Réessayer 🔄 (si échec), Annuler ❌ (si planifié)                      | 👁 🔄                         |

#### Filtres disponibles

**Filtre Type**

```
[ ] Tous
[ ] Annonces
[ ] Alertes
[ ] Notifications
```

**Filtre Canal**

```
[ ] Tous
[ ] Email
[ ] WhatsApp
```

**Filtre Statut**

```
[ ] Tous
[✓] Envoyé
[ ] Délivré
[ ] Lu
[ ] Échec
[ ] En attente
[ ] Planifié
[ ] Annulé
```

**Filtre Période**

```
Date de début: [04/01/2026]
Date de fin:   [04/02/2026]
```

**Filtre Destinataire**

```
Type: [Locataire ▼]
Rechercher: [Jean Dupont_____________] [🔍]
```

#### Données d'exemple pour test

**Communication 1**

```
Date: 04/02/2026 10:32
Type: Notification
Canal: Email
Destinataire: Jean Dupont (Locataire)
Sujet: Rappel : Loyer à payer le 10/02/2026
Statut: ✓✓ Délivré
```

**Communication 2**

```
Date: 04/02/2026 09:15
Type: Notification
Canal: WhatsApp
Destinataire: Marie Martin (Locataire)
Sujet: (WhatsApp - voir corps)
Statut: ✓ Envoyé
```

**Communication 3**

```
Date: 03/02/2026 14:20
Type: Alerte
Canal: Email
Destinataire: Paul Durand (Propriétaire)
Sujet: Nouveau ticket #456 - Fuite d'eau
Statut: ✓✓✓ Lu
```

**Communication 4**

```
Date: 04/02/2026 11:00
Type: Annonce
Canal: Email
Destinataire: Sophie Leclerc (Locataire)
Sujet: Fermeture exceptionnelle de l'agence
Statut: ⏳ En attente (Quiet hours)
Date planifiée: 04/02/2026 23:01
```

**Communication 5**

```
Date: 04/02/2026 08:45
Type: Notification
Canal: Email
Destinataire: Marc Petit (Locataire)
Sujet: Confirmation paiement reçu
Statut: ❌ Échec
Raison: Email address is invalid
Tentatives: 2/3
```

#### Détail d'une communication (modal ou page)

Cliquer sur l'action "Voir détail" 👁 ouvre un panneau avec toutes les informations :

**Section 1 : Informations générales**

```
ID: comm_01HQXXXXXXXXXXXXXX
Type: Notification
Canal: Email
Créé le: 04/02/2026 10:32:15
Statut: Envoyé ✓
```

**Section 2 : Destinataire**

```
Nom: Jean Dupont
Type: Locataire (RENTER)
Email: jean.dupont@example.com
Téléphone: +33 6 12 34 56 78
```

**Section 3 : Contenu**

```
Sujet: Rappel : Loyer à payer le 10/02/2026

Corps:
---
Bonjour Jean Dupont,

Nous vous rappelons que votre loyer pour le bien situé au 15 rue de la Paix, 75001 Paris
est à payer le 10/02/2026.

Montant à régler : 850.00 €

Merci de procéder au paiement avant cette date pour éviter tout désagrément.

Cordialement,
L'équipe ImmoTopia
---
```

**Section 4 : Historique d'envoi**

```
Créé:              04/02/2026 10:32:15
Mis en file:       04/02/2026 10:32:16
Envoyé:            04/02/2026 10:32:18
Délivré:           04/02/2026 10:32:25
Lu:                04/02/2026 11:15:42
```

**Section 5 : Métadonnées**

```
Template: "Rappel paiement loyer" (ID: tpl_xxxx)
Règle: "Rappel loyer 3 jours avant" (ID: rule_yyyy)
Événement source: INSTALLMENT_DUE_REMINDER
Entité source: Échéance #789
Provider: SendGrid
Message ID: <xxxxx@sendgrid.net>
```

#### Actions disponibles

**1. Voir le détail** (toujours disponible)

- Icône : 👁
- Ouvre le panneau de détail

**2. Réessayer** (si statut = Échec)

- Icône : 🔄
- Relance l'envoi immédiatement
- Confirmation : "Réessayer l'envoi de ce message ?"
- Résultat : Statut passe en "En file d'attente"

**3. Annuler** (si statut = Planifié ou En attente)

- Icône : ❌
- Annule l'envoi planifié
- Confirmation : "Annuler cet envoi planifié ?"
- Résultat : Statut passe en "Annulé"

**4. Exporter** (sélection multiple)

- Bouton : "Exporter la sélection"
- Formats : CSV, Excel, PDF
- Contient : Toutes les colonnes visibles

---

### 3.6 Interface : Annonces (Envoi manuel)

**URL** : `/tenant/:tenantId/communication/announcements`

#### Description

Page permettant de composer et envoyer des annonces manuelles à des groupes de destinataires, avec planification optionnelle.

#### Éléments de l'interface

| Élément                       | Description                                  |
| ----------------------------- | -------------------------------------------- |
| **En-tête**                   | Titre "Annonces" + bouton "Nouvelle annonce" |
| **Historique récent**         | Liste des 5 dernières annonces envoyées      |
| **Formulaire de composition** | Formulaire complet pour créer une annonce    |

#### Formulaire de composition

| Champ              | Type                 | Obligatoire | Description                                        |
| ------------------ | -------------------- | ----------- | -------------------------------------------------- |
| **Type**           | Select               | ✓           | Annonce, Alerte, Notification                      |
| **Sujet**          | Texte                | ✓ (email)   | Sujet de l'email (max 200 caractères)              |
| **Corps**          | Textarea/RichText    | ✓           | Contenu du message                                 |
| **Canaux**         | Checkboxes           | ✓           | Email, WhatsApp                                    |
| **Destinataires**  | Multi-select/Builder | ✓           | Sélection des destinataires                        |
| **Pièces jointes** | File upload          | ✗           | Uniquement pour email (max 5 fichiers, 10MB total) |
| **Envoi**          | Radio                | ✓           | Immédiat ou Planifié                               |
| **Date/Heure**     | DateTime             | Si planifié | Date et heure d'envoi                              |
| **Prévisualiser**  | Bouton               | -           | Aperçu avant envoi                                 |

#### Sélection des destinataires

**Option 1 : Groupes prédéfinis**

```
Groupes:
  [ ] Tous les locataires (47)
  [ ] Tous les propriétaires (32)
  [ ] Tous les contacts CRM (18)
  [ ] Tous les utilisateurs agence (5)
```

**Option 2 : Sélection manuelle**

```
Rechercher un destinataire:
Type: [Locataire ▼]
Nom: [___________________] [🔍]

Résultats:
  [ ] Jean Dupont - jean.dupont@example.com - +33 6 12 34 56 78
  [ ] Marie Martin - marie.martin@example.com - +33 6 98 76 54 32
  [ ] Paul Durand - paul.durand@example.com - +33 6 11 22 33 44

Destinataires sélectionnés (3):
  ✓ Jean Dupont (Locataire) [X]
  ✓ Marie Martin (Locataire) [X]
  ✓ Sophie Leclerc (Propriétaire) [X]
```

**Option 3 : Import CSV**

```
Importer une liste:
[Choisir un fichier CSV] [Télécharger le modèle]

Format CSV attendu:
type,email,phone,name
RENTER,jean.dupont@example.com,+33612345678,Jean Dupont
OWNER,marie.martin@example.com,+33698765432,Marie Martin
```

#### Exemples d'annonces complètes

**Annonce 1 : Fermeture agence**

```
Type: Annonce
Sujet: Fermeture exceptionnelle du 15 au 17 février

Corps:
Madame, Monsieur,

Nous vous informons que l'agence ImmoTopia sera exceptionnellement fermée
du vendredi 15 février au dimanche 17 février 2026 pour cause d'inventaire annuel.

Nous serons de nouveau à votre disposition dès le lundi 18 février à 9h00.

En cas d'urgence pendant cette période, vous pouvez nous contacter au :
📞 06 XX XX XX XX (astreinte)

Nous vous remercions de votre compréhension.

Cordialement,
L'équipe ImmoTopia

Canaux: [✓] Email [ ] WhatsApp

Destinataires:
  [✓] Tous les locataires (47)
  [✓] Tous les propriétaires (32)

Pièces jointes: (aucune)

Envoi: [•] Immédiat ( ) Planifié
```

**Annonce 2 : Travaux immeuble**

```
Type: Alerte
Sujet: 🚧 Travaux programmés - Immeuble 15 rue de la Paix

Corps:
Chers résidents,

Des travaux de rénovation sont programmés dans votre immeuble :

📅 Dates : Du 1er au 15 mars 2026
🕐 Horaires : 8h00 - 18h00 (lundi au vendredi)

Nature des travaux :
- Réfection de la toiture
- Peinture des parties communes
- Nettoyage des gouttières

⚠️ Nuisances à prévoir :
- Bruit modéré
- Présence d'ouvriers
- Stationnement limité devant l'immeuble

L'accès à l'immeuble sera maintenu en permanence.

Pour toute question : 📞 01 XX XX XX XX

Merci de votre compréhension.

L'équipe ImmoTopia

Canaux: [✓] Email [✓] WhatsApp

Destinataires: (Sélection manuelle)
  ✓ Jean Dupont - Apt 101
  ✓ Marie Martin - Apt 102
  ✓ Paul Durand - Apt 201
  ✓ Sophie Leclerc - Apt 202
  (4 destinataires)

Pièces jointes:
  📎 plan_travaux.pdf (245 KB)

Envoi: ( ) Immédiat [•] Planifié
Date: 25/02/2026 à 10:00
```

**Annonce 3 : Promotion programme neuf**

```
Type: Annonce
Sujet: 🏡 Nouveau programme immobilier - Offre de lancement

Corps:
Bonjour,

Nous avons le plaisir de vous présenter notre nouveau programme immobilier :

🌟 RÉSIDENCE LES JARDINS DU PARC 🌟
📍 Ville-d'Avray (92)

🏠 Appartements T2 à T4
💰 À partir de 289 000 €
🚗 Parkings inclus
🌳 Espaces verts privatifs
🚇 Métro à 5 minutes

🎁 OFFRE DE LANCEMENT :
- Frais de notaire offerts
- Cuisine équipée incluse
- TVA réduite à 5,5%

📞 Contactez-nous pour une visite du site et du showroom :
01 XX XX XX XX
commercial@immotopia.fr

Cordialement,
L'équipe commerciale ImmoTopia

Canaux: [✓] Email [ ] WhatsApp

Destinataires:
  [✓] Tous les contacts CRM (18)

Pièces jointes:
  📎 plaquette_commerciale.pdf (1.2 MB)
  📎 plan_appartements.pdf (856 KB)

Envoi: [•] Immédiat ( ) Planifié
```

#### Prévisualisation

Cliquer sur "Prévisualiser" ouvre un modal avec :

**Version Email**

```
┌─────────────────────────────────────────┐
│ De: ImmoTopia <noreply@immotopia.fr>   │
│ À: jean.dupont@example.com             │
│ Sujet: Fermeture exceptionnelle...     │
├─────────────────────────────────────────┤
│                                         │
│ [Contenu formaté du message]            │
│                                         │
│ [Pièces jointes si présentes]          │
├─────────────────────────────────────────┤
│ Cet email est envoyé par ImmoTopia     │
│ Pour vous désinscrire, cliquez ici     │
└─────────────────────────────────────────┘
```

**Version WhatsApp**

```
┌─────────────────────────────────────────┐
│ WhatsApp Business                       │
├─────────────────────────────────────────┤
│ ImmoTopia                               │
│ [Contenu du message - max 1600 car.]   │
│                                         │
│ [Pas de pièces jointes sur WhatsApp]   │
└─────────────────────────────────────────┘
```

Boutons :

- [Retour à l'édition]
- [Envoyer maintenant]

#### Validation et envoi

**Validation du formulaire :**

- Type : requis
- Sujet : requis si Email sélectionné
- Corps : requis, min 10 caractères
- Au moins 1 canal sélectionné
- Au moins 1 destinataire sélectionné
- Si planifié : date future requise
- Pièces jointes : max 5 fichiers, 10MB total, formats : PDF, DOC, DOCX, JPG, PNG

**Confirmation avant envoi :**

```
┌─────────────────────────────────────────┐
│ Confirmer l'envoi                       │
├─────────────────────────────────────────┤
│ Vous êtes sur le point d'envoyer une    │
│ annonce à 47 destinataires.             │
│                                         │
│ Canaux : Email                          │
│ Envoi : Immédiat                        │
│                                         │
│ Cette action ne peut pas être annulée   │
│ après l'envoi.                          │
├─────────────────────────────────────────┤
│ [Annuler]              [Confirmer] │
└─────────────────────────────────────────┘
```

**Après envoi :**

- Message de succès : "Annonce envoyée avec succès à 47 destinataires"
- Redirection vers **Historique** avec filtre Type=Annonce
- Les communications créées apparaissent dans la liste

---

### 3.7 Interface : Préférences des destinataires

**URL** : `/tenant/:tenantId/communication/preferences`

#### Description

Page permettant de rechercher un destinataire et de gérer ses préférences de communication (canaux, types de messages, quiet hours, événements désactivés).

#### Éléments de l'interface

| Élément                    | Description                                         |
| -------------------------- | --------------------------------------------------- |
| **En-tête**                | Titre "Préférences des destinataires"               |
| **Recherche**              | Formulaire de recherche par type + nom/ID           |
| **Résultats**              | Liste des destinataires trouvés                     |
| **Formulaire préférences** | Édition des préférences du destinataire sélectionné |

#### Formulaire de recherche

```
Type de destinataire: [Locataire ▼]
  Options:
    - Locataire
    - Propriétaire
    - Contact CRM
    - Utilisateur agence

Rechercher par: [Nom ▼]
  Options:
    - Nom
    - Email
    - Téléphone
    - ID

Valeur: [_________________________] [🔍 Rechercher]
```

**Exemple de recherche :**

```
Type: Locataire
Rechercher par: Nom
Valeur: Dupont

Résultats (2):
  1. Jean Dupont - jean.dupont@example.com - +33 6 12 34 56 78
     Préférences: Configurées ✓
  2. Marie Dupont - marie.dupont@example.com - +33 6 11 22 33 44
     Préférences: Non configurées (utilise les défauts)

[Sélectionner]
```

#### Formulaire de préférences

Une fois un destinataire sélectionné :

**En-tête du formulaire**

```
Préférences de communication

Destinataire: Jean Dupont (Locataire)
Email: jean.dupont@example.com
Téléphone: +33 6 12 34 56 78
Bien: 15 rue de la Paix, 75001 Paris
```

**Section 1 : Canaux autorisés**

```
Canaux de communication :

[✓] Email
    L'utilisation de l'email est autorisée pour tous types de messages.

[✓] WhatsApp
    L'utilisation de WhatsApp est autorisée pour tous types de messages.

[ ] SMS (bientôt disponible)
```

**Section 2 : Types de messages autorisés**

```
Types de messages :

[✓] Annonces
    Messages d'information générale (fermetures, travaux, actualités).

[✓] Alertes
    Messages urgents nécessitant une attention (maintenance, incidents).

[✓] Notifications
    Notifications automatiques liées aux événements (paiements, échéances, tickets).
```

**Section 3 : Plages horaires (Quiet Hours)**

```
Ne pas déranger (Quiet Hours) :

[✓] Activer les plages horaires de tranquillité

Début: [22:00 ▼]
Fin:   [08:00 ▼]

ℹ️ Les messages programmés pendant ces horaires seront reportés
   automatiquement après la fin de la plage.

Jours concernés:
  [✓] Lundi    [✓] Mardi     [✓] Mercredi  [✓] Jeudi
  [✓] Vendredi [✓] Samedi    [✓] Dimanche

Exception: Les alertes de haute priorité peuvent ignorer cette règle.
```

**Section 4 : Événements désactivés**

```
Désactiver des types de notifications :

Paiements et échéances:
  [ ] Rappels d'échéance de loyer
  [ ] Notifications de paiement reçu
  [ ] Alertes d'impayés

Baux:
  [ ] Activation de bail
  [ ] Fin de bail prochaine
  [ ] Résiliation de bail

Maintenance:
  [ ] Création de ticket
  [ ] Changement de statut de ticket
  [ ] Ticket résolu

CRM et rendez-vous:
  [ ] Rappels de rendez-vous
  [ ] Notifications de deal

Propriétés et documents:
  [ ] Propriété publiée
  [ ] Document expirant
```

**Section 5 : Paramètres avancés**

```
Paramètres avancés :

Langue préférée: [Français ▼]
  Options: Français, Anglais, Espagnol, Allemand

Format de date: [DD/MM/YYYY ▼]
  Options: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD

Format d'heure: [24h ▼]
  Options: 24h, 12h (AM/PM)

[ ] Recevoir les résumés quotidiens (1 email par jour avec toutes les notifications)

[ ] Recevoir les résumés hebdomadaires (tous les lundis)
```

**Boutons d'action**

```
[Réinitialiser aux valeurs par défaut]  [Annuler]  [Enregistrer les préférences]
```

#### Exemples de configurations

**Configuration 1 : Locataire standard**

```
Destinataire: Jean Dupont (Locataire)

Canaux: Email ✓, WhatsApp ✓
Types: Annonces ✓, Alertes ✓, Notifications ✓

Quiet Hours: Actif
  22:00 - 08:00 (tous les jours)

Événements désactivés: (aucun)

Résultat: Jean reçoit tous les messages sur tous les canaux,
          mais les envois entre 22h et 8h sont reportés.
```

**Configuration 2 : Propriétaire "Email uniquement"**

```
Destinataire: Marie Martin (Propriétaire)

Canaux: Email ✓, WhatsApp ✗
Types: Annonces ✓, Alertes ✓, Notifications ✓

Quiet Hours: Inactif

Événements désactivés:
  - Rappels d'échéance de loyer (ne la concernent pas)

Résultat: Marie reçoit uniquement par email, sans restriction horaire,
          et ne reçoit pas les rappels d'échéance.
```

**Configuration 3 : Locataire "Minimum de notifications"**

```
Destinataire: Paul Durand (Locataire)

Canaux: Email ✓, WhatsApp ✗
Types: Annonces ✗, Alertes ✓, Notifications ✓

Quiet Hours: Actif
  20:00 - 09:00 (lundi-vendredi)
  00:00 - 23:59 (samedi-dimanche - aucune notification le weekend)

Événements désactivés:
  - Rappels d'échéance de loyer
  - Fin de bail prochaine
  - Propriété publiée

Résultat: Paul ne reçoit que les notifications importantes (paiements, tickets)
          par email uniquement, jamais le weekend.
```

**Configuration 4 : Contact CRM "WhatsApp uniquement"**

```
Destinataire: Sophie Leclerc (Contact CRM)

Canaux: Email ✗, WhatsApp ✓
Types: Annonces ✓, Alertes ✓, Notifications ✓

Quiet Hours: Actif
  19:00 - 09:00 (tous les jours)

Événements désactivés: (aucun)

Résultat: Sophie ne reçoit que des WhatsApp, entre 9h et 19h.
```

#### Valeurs par défaut (si aucune préférence configurée)

```
Canaux: Email ✓, WhatsApp ✓ (si numéro présent)
Types: Annonces ✓, Alertes ✓, Notifications ✓
Quiet Hours: Inactif
Événements désactivés: (aucun)
Langue: Français
Format date: DD/MM/YYYY
Format heure: 24h
Résumés: Inactifs
```

#### Validation

**Règles de validation :**

- Au moins 1 canal doit être activé
- Si Quiet Hours actif, heure de début ≠ heure de fin
- Impossible de désactiver "Alertes" en tant que locataire (sécurité)

**Messages d'erreur :**

- "Au moins un canal de communication doit être activé"
- "Les heures de début et de fin ne peuvent pas être identiques"
- "Les alertes ne peuvent pas être désactivées pour les locataires"

**Message de succès :**

```
✓ Préférences enregistrées avec succès pour Jean Dupont
  Les nouvelles préférences seront appliquées dès le prochain envoi.
```

---

### 3.8 Interface : Analytics (Tableau de bord)

**URL** : `/tenant/:tenantId/communication/analytics`

#### Description

Tableau de bord affichant les indicateurs clés de performance des communications : taux de livraison, volumes par canal et type, tendances temporelles.

#### Éléments de l'interface

**En-tête**

```
Analytics - Communications

Période: [01/01/2026 ▼] au [04/02/2026 ▼] [Appliquer]

Raccourcis:
  [Aujourd'hui] [7 derniers jours] [30 derniers jours] [Ce mois-ci] [Mois dernier]
```

#### Section 1 : Vue d'ensemble (KPIs)

**4 cartes principales**

```
┌─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────────────┐
│ 📤 Total envoyé         │ ✅ Taux de livraison    │ ⏳ En attente           │ ❌ Échecs               │
│                         │                         │                         │                         │
│      147                │      94.5%              │       8                 │       6                 │
│                         │                         │                         │                         │
│ +12% vs période préc.   │ -1.2% vs période préc.  │ +3 depuis hier          │ +2 depuis hier          │
└─────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

**Explications des KPIs :**

- **Total envoyé** : Nombre de communications créées (envoyées + délivrées + lues + échecs)
- **Taux de livraison** : (Envoyés + Délivrés + Lus) / Total envoyé × 100
- **En attente** : Messages planifiés + en file d'attente + quiet hours
- **Échecs** : Messages en erreur après toutes les tentatives

#### Section 2 : Répartition par canal

**Graphique camembert + tableau**

```
┌────────────────────────────────────────────────────┐
│ Répartition par canal                              │
├────────────────────────────────────────────────────┤
│                                                    │
│            [Graphique camembert]                   │
│                                                    │
│         📧 Email (68%)                            │
│                                                    │
│         💬 WhatsApp (32%)                         │
│                                                    │
└────────────────────────────────────────────────────┘

Détails par canal:

Canal       | Total | Envoyés | Délivrés | Lus | Échecs | Taux livraison
------------|-------|---------|----------|-----|--------|---------------
📧 Email    | 100   | 95      | 92       | 45  | 5      | 95.0%
💬 WhatsApp | 47    | 44      | 40       | 28  | 3      | 93.6%
------------|-------|---------|----------|-----|--------|---------------
TOTAL       | 147   | 139     | 132      | 73  | 8      | 94.6%
```

**Graphique barres empilées**

```
Email    ████████████████████████████████████████ 95 ▓▓ 5
WhatsApp ████████████████████████████ 44 ▓ 3

         0    10   20   30   40   50   60   70   80   90   100

         ████ Envoyés/Délivrés    ▓▓▓▓ Échecs
```

#### Section 3 : Répartition par type

**Graphique barres horizontales + stats**

```
┌────────────────────────────────────────────────────┐
│ Répartition par type de message                   │
├────────────────────────────────────────────────────┤
│                                                    │
│ Notifications  ████████████████████ 88 (60%)      │
│                                                    │
│ Annonces       ████████████ 35 (24%)               │
│                                                    │
│ Alertes        ████████ 24 (16%)                   │
│                                                    │
└────────────────────────────────────────────────────┘

Détails par type:

Type          | Total | Email | WhatsApp | Taux livraison
--------------|-------|-------|----------|---------------
Notifications | 88    | 60    | 28       | 95.5%
Annonces      | 35    | 25    | 10       | 91.4%
Alertes       | 24    | 15    | 9        | 95.8%
```

#### Section 4 : Tendances temporelles

**Graphique ligne (7 derniers jours)**

```
┌────────────────────────────────────────────────────┐
│ Évolution des envois - 7 derniers jours           │
├────────────────────────────────────────────────────┤
│                                                    │
│ 40│                                    ●           │
│   │                               ●                │
│ 30│          ●              ●                       │
│   │     ●         ●                                │
│ 20│                   ●                            │
│   │●                                               │
│ 10│                                                │
│   │                                                │
│  0└──────┬──────┬──────┬──────┬──────┬──────┬─────│
│      29/01  30/01  31/01  01/02  02/02  03/02  04/02│
│                                                    │
│ ● Envoyés   ◆ Échecs                              │
└────────────────────────────────────────────────────┘

Légende:
- Ligne bleue : Messages envoyés avec succès
- Ligne rouge : Messages en échec
```

**Tableau de données**

```
Date       | Envoyés | Délivrés | Échecs | Taux
-----------|---------|----------|--------|-------
29/01/2026 | 18      | 17       | 1      | 94.4%
30/01/2026 | 25      | 24       | 1      | 96.0%
31/01/2026 | 15      | 14       | 1      | 93.3%
01/02/2026 | 28      | 26       | 2      | 92.9%
02/02/2026 | 22      | 21       | 1      | 95.5%
03/02/2026 | 31      | 30       | 1      | 96.8%
04/02/2026 | 8       | 7        | 1      | 87.5%
-----------|---------|----------|--------|-------
TOTAL      | 147     | 139      | 8      | 94.6%
```

#### Section 5 : Top événements déclencheurs

**Tableau des événements les plus fréquents**

```
┌────────────────────────────────────────────────────┐
│ Top 5 des événements déclencheurs                  │
├────────────────────────────────────────────────────┤
│                                                    │
│ 1. PAYMENT_RECEIVED                    45 (31%)   │
│    Paiement reçu                                   │
│                                                    │
│ 2. INSTALLMENT_DUE_REMINDER            32 (22%)   │
│    Rappel échéance                                 │
│                                                    │
│ 3. TICKET_CREATED                      18 (12%)   │
│    Ticket créé                                     │
│                                                    │
│ 4. LEASE_ACTIVATED                     12 (8%)    │
│    Bail activé                                     │
│                                                    │
│ 5. APPOINTMENT_REMINDER                8 (5%)     │
│    Rappel RDV                                      │
│                                                    │
│ Autres événements                      32 (22%)   │
└────────────────────────────────────────────────────┘
```

#### Section 6 : Performance des templates

**Tableau des templates les plus utilisés**

```
Template                           | Utilisations | Taux livraison | Taux lecture
-----------------------------------|--------------|----------------|-------------
Rappel échéance loyer              | 32           | 96.9%          | 75.0%
Confirmation paiement reçu         | 45           | 97.8%          | 82.2%
Nouveau ticket maintenance         | 18           | 94.4%          | 66.7%
Bienvenue nouveau locataire        | 12           | 100.0%         | 91.7%
Fermeture exceptionnelle agence    | 35           | 91.4%          | 45.7%
-----------------------------------|--------------|----------------|-------------
```

**Indicateur visuel :**

- Taux livraison >= 95% : ✅ Vert
- Taux livraison 85-94% : ⚠️ Orange
- Taux livraison < 85% : ❌ Rouge

#### Section 7 : Raisons d'échec

**Tableau des causes d'échec**

```
┌────────────────────────────────────────────────────┐
│ Analyse des échecs (8 total)                       │
├────────────────────────────────────────────────────┤
│                                                    │
│ Email invalide                          4 (50%)    │
│ Provider error (SendGrid timeout)       2 (25%)    │
│ Numéro WhatsApp invalide                1 (12.5%)  │
│ Destinataire a bloqué le numéro         1 (12.5%)  │
│                                                    │
└────────────────────────────────────────────────────┘

Actions recommandées:
⚠️ 4 emails invalides détectés → Mettre à jour les contacts
⚠️ 2 timeouts SendGrid → Vérifier l'état du provider
```

#### Filtres et exports

**Barre de filtres avancés**

```
Filtrer les analytics:

Type:        [Tous ▼]
Canal:       [Tous ▼]
Événement:   [Tous ▼]
Template:    [Tous ▼]

[Réinitialiser les filtres]  [Appliquer]

Export:
[📄 Exporter en PDF]  [📊 Exporter en Excel]  [📋 Exporter en CSV]
```

#### Alertes et recommandations

**Section en bas de page**

```
┌────────────────────────────────────────────────────┐
│ 💡 Recommandations                                 │
├────────────────────────────────────────────────────┤
│                                                    │
│ ✅ Bon taux de livraison global (94.6%)           │
│                                                    │
│ ⚠️ 4 emails invalides à corriger                  │
│    → Aller dans Historique > Filtre Échec         │
│                                                    │
│ 💬 WhatsApp sous-utilisé (32% des envois)         │
│    → Envisager d'augmenter l'usage WhatsApp       │
│                                                    │
│ 📈 +12% d'envois vs période précédente            │
│    → Tendance positive                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 4. Scénarios de test avancés

### 4.1 Test de charge - Envoi groupé

**Objectif** : Vérifier que le système gère correctement l'envoi d'une annonce à un grand nombre de destinataires.

#### Préparation

1. Créer ou avoir au moins 100 locataires dans la base de données
2. Vérifier que la file d'attente (queue) est activée (`COMMUNICATION_QUEUE_ENABLED=true`)
3. Surveiller les logs du backend

#### Étapes

1. **Composer une annonce**
   - Menu **Communication > Annonces**
   - Type : Annonce
   - Sujet : "Test envoi groupé"
   - Corps : "Ceci est un test d'envoi massif."
   - Canal : Email uniquement (plus rapide pour le test)
   - Destinataires : **Tous les locataires** (100+)

2. **Envoyer l'annonce**
   - Cliquer sur "Envoyer maintenant"
   - Noter l'heure d'envoi

3. **Vérifier l'historique immédiatement**
   - Aller dans **Historique**
   - Filtrer par Type : Annonce
   - Vérifier que 100+ lignes sont créées avec statut "En file d'attente" ou "En attente"

4. **Surveiller le traitement**
   - Attendre 5-10 minutes (le job `communication-queue-processor` traite la file toutes les minutes)
   - Rafraîchir l'historique toutes les minutes
   - Observer les statuts passer de "En file" à "Envoyé"

5. **Vérifier les résultats**
   - Tous les messages doivent passer en "Envoyé" (ou "Délivré")
   - Aucun blocage du backend
   - Vérifier le taux de livraison dans **Analytics**

#### Résultats attendus

- ✅ 100% des messages créés et mis en file
- ✅ Traitement progressif sans surcharge
- ✅ Taux de livraison > 90%
- ✅ Pas d'erreur 500 ou timeout
- ✅ Temps total < 15 minutes pour 100 emails

---

### 4.2 Test de robustesse - Gestion des échecs

**Objectif** : Vérifier que le système gère correctement les échecs (email invalide, provider down) avec retry automatique.

#### Préparation

1. Créer 3 locataires avec emails invalides :
   - `invalid-email-1@domain-that-does-not-exist-xyz.com`
   - `invalid@`
   - `test@.com`
2. Vérifier la politique de retry dans le code (`CommunicationService`) :
   - Max 3 tentatives
   - Délai exponentiel : 5min, 10min, 20min

#### Étapes

1. **Envoyer une annonce aux destinataires invalides**
   - Composer une annonce
   - Sélectionner les 3 locataires avec emails invalides
   - Envoyer

2. **Vérifier l'échec immédiat**
   - Aller dans **Historique**
   - Filtrer par Statut : Échec
   - Les 3 messages doivent apparaître avec statut "Échec"
   - Raison : "Email address is invalid" ou similaire
   - Tentatives : 1/3

3. **Attendre le retry automatique (5 minutes)**
   - Le job `communication-queue-processor` doit réessayer après 5 minutes
   - Rafraîchir l'historique
   - Tentatives doivent passer à 2/3
   - Statut reste "Échec"

4. **Attendre les tentatives suivantes (10 min + 20 min)**
   - Après 10 minutes : tentatives = 3/3
   - Après 20 minutes : plus de retry
   - Statut final : "Échec"

5. **Corriger un email et réessayer manuellement**
   - Aller dans le module Locatif
   - Corriger l'email du locataire : `valid-email@example.com`
   - Retour dans **Historique**
   - Cliquer sur "Réessayer" pour ce message
   - Le message doit passer en "Envoyé"

#### Résultats attendus

- ✅ Échecs détectés et enregistrés
- ✅ Retry automatique fonctionne (3 tentatives max)
- ✅ Raisons d'échec visibles
- ✅ Retry manuel fonctionne après correction
- ✅ Les échecs n'impactent pas les autres envois

---

### 4.3 Test de conformité - Respect des préférences

**Objectif** : Vérifier que le système respecte strictement les préférences des destinataires (canaux, types, quiet hours, événements désactivés).

#### Scénario 1 : Respect des canaux désactivés

**Préparation**

1. Locataire A : Email ✓, WhatsApp ✗
2. Locataire B : Email ✗, WhatsApp ✓ (cas limite)
3. Locataire C : Email ✓, WhatsApp ✓

**Test**

1. Créer une règle avec Email + WhatsApp pour "Paiement reçu"
2. Enregistrer un paiement pour chaque locataire
3. Vérifier l'historique :
   - Locataire A : 1 email uniquement ✓
   - Locataire B : 1 WhatsApp uniquement ✓
   - Locataire C : 1 email + 1 WhatsApp ✓

#### Scénario 2 : Respect des Quiet Hours

**Préparation**

1. Locataire D : Quiet hours 22:00 - 08:00
2. Heure actuelle du test : 23:30 (dans la plage)

**Test**

1. Enregistrer un paiement pour locataire D
2. Vérifier l'historique :
   - Statut : "Planifié" ou "En attente"
   - Date planifiée : Demain 08:01 (après la fin des quiet hours)
3. Modifier l'heure système à 08:05
4. Attendre 1 minute (job queue processor)
5. Le message doit passer en "Envoyé"

#### Scénario 3 : Respect des événements désactivés

**Préparation**

1. Locataire E : Événement "INSTALLMENT_DUE_REMINDER" désactivé
2. Règle active pour "INSTALLMENT_DUE_REMINDER"

**Test**

1. Déclencher un rappel d'échéance pour locataire E
2. Vérifier l'historique :
   - Aucune communication créée pour locataire E ✓
3. Déclencher un rappel pour un autre locataire (sans désactivation)
4. Vérifier l'historique :
   - Une communication créée pour cet autre locataire ✓

#### Résultats attendus

- ✅ 100% de respect des canaux configurés
- ✅ Messages reportés hors quiet hours
- ✅ Événements désactivés jamais envoyés
- ✅ Aucune fuite de communication

---

### 4.4 Test d'intégration - Flux complet automatique

**Objectif** : Vérifier le flux complet depuis un événement métier jusqu'à la réception du message.

#### Flux testé : Paiement reçu → Notification email → Historique → Analytics

**Préparation**

1. Locataire configuré : Jean Dupont, email valide
2. Template créé : "Confirmation paiement"
3. Règle active : "Paiement reçu" → Locataire → Template email

#### Étapes détaillées

**Étape 1 : Déclencher l'événement**

1. Aller dans **Module Locatif > Paiements**
2. Enregistrer un paiement :
   - Locataire : Jean Dupont
   - Montant : 850 €
   - Date : 04/02/2026
   - Statut : Confirmé
3. Noter l'heure exacte : 10:32:15

**Étape 2 : Vérifier la création de la communication (< 2 secondes)**

1. Aller immédiatement dans **Communication > Historique**
2. Vérifier qu'une ligne est créée :
   - Type : Notification
   - Canal : Email
   - Destinataire : Jean Dupont (Locataire)
   - Statut : En file d'attente
   - Créé à : 10:32:15

**Étape 3 : Vérifier le traitement de la file (< 1 minute)**

1. Attendre 30-60 secondes
2. Rafraîchir l'historique
3. Vérifier que le statut a changé :
   - Statut : Envoyé ✓
   - Date d'envoi : 10:32:18 (3 secondes après création)

**Étape 4 : Vérifier le contenu du message**

1. Cliquer sur la ligne pour voir le détail
2. Vérifier que les variables sont remplacées :
   - `{{contactName}}` → "Jean Dupont"
   - `{{amount}}` → "850.00"
   - `{{propertyAddress}}` → Adresse du bien
   - `{{paymentDate}}` → "04/02/2026"

**Étape 5 : Vérifier la mise à jour des analytics (< 5 minutes)**

1. Aller dans **Communication > Analytics**
2. Vérifier que les compteurs ont augmenté :
   - Total envoyé : +1
   - Email : +1
   - Notifications : +1
3. Le graphique des tendances doit afficher le point pour 04/02

**Étape 6 : Simuler la livraison (si webhook configuré)**

1. Si SendGrid webhook configuré, le statut doit passer à "Délivré" dans les minutes qui suivent
2. Si le destinataire ouvre l'email, statut → "Lu"

#### Résultats attendus

- ✅ Communication créée en < 2 secondes après l'événement
- ✅ Message envoyé en < 1 minute
- ✅ Variables correctement remplacées
- ✅ Analytics mis à jour en temps réel
- ✅ Statut final "Envoyé" ou "Délivré"

#### Temps total du flux

- De l'événement à "Envoyé" : < 1 minute
- De l'événement aux analytics : < 5 minutes

---

### 4.5 Test de sécurité - Isolation par tenant

**Objectif** : Vérifier qu'un tenant ne peut pas voir ou envoyer de communications pour un autre tenant.

#### Préparation

1. Tenant A : ID = `tenant-a-uuid`
2. Tenant B : ID = `tenant-b-uuid`
3. Utilisateur A : Accès uniquement à Tenant A
4. Utilisateur B : Accès uniquement à Tenant B

#### Tests à effectuer

**Test 1 : Isolation des templates**

1. Se connecter avec Utilisateur A
2. Créer un template "Template Tenant A"
3. Se déconnecter
4. Se connecter avec Utilisateur B
5. Aller dans **Templates**
6. ❌ Le template "Template Tenant A" ne doit PAS apparaître
7. Créer un template "Template Tenant B"
8. Vérifier qu'il apparaît uniquement pour Utilisateur B

**Test 2 : Isolation de l'historique**

1. Utilisateur A envoie une annonce
2. Se déconnecter, se connecter avec Utilisateur B
3. Aller dans **Historique**
4. ❌ L'annonce de Tenant A ne doit PAS apparaître
5. Vérifier que seules les communications de Tenant B sont visibles

**Test 3 : Tentative d'accès direct par URL**

1. Utilisateur A note l'ID d'un template de Tenant A : `tpl-tenant-a-123`
2. Se déconnecter, se connecter avec Utilisateur B
3. Tenter d'accéder directement à :
   ```
   /tenant/tenant-b-uuid/communication/templates/tpl-tenant-a-123/edit
   ```
4. ❌ Erreur 403 ou 404 attendue

**Test 4 : Tentative d'envoi cross-tenant via API**

1. Utilisateur B récupère son token d'authentification
2. Utiliser Postman pour tenter d'envoyer une annonce au tenant A :
   ```
   POST /api/tenants/tenant-a-uuid/communication/messages/bulk
   Authorization: Bearer [token de B]
   ```
3. ❌ Erreur 403 Forbidden attendue

#### Résultats attendus

- ✅ Isolation stricte des données par tenant
- ✅ Aucune fuite d'information entre tenants
- ✅ Erreurs 403 sur les tentatives d'accès non autorisés
- ✅ Middleware RBAC fonctionne correctement

---

### 4.6 Test de performance - Jobs planifiés

**Objectif** : Vérifier que les jobs CRON fonctionnent correctement et dans les temps.

#### Job 1 : communication-queue-processor (toutes les minutes)

**Test**

1. Créer 10 communications avec `scheduled_at` = dans 2 minutes
2. Surveiller les logs du backend
3. Vérifier que le job démarre toutes les minutes :
   ```
   [Job] communication-queue-processor started
   [Job] Processing 10 scheduled messages
   [Job] communication-queue-processor completed in 1.2s
   ```
4. Après 2 minutes, vérifier l'historique :
   - Les 10 messages doivent passer de "Planifié" à "Envoyé"

**Résultats attendus**

- ✅ Job démarre toutes les minutes
- ✅ Traitement en < 5 secondes pour 10 messages
- ✅ Pas d'erreur de concurrence

#### Job 2 : reminder-scheduler (tous les jours à 6h UTC)

**Test**

1. Créer des échéances de loyer avec `due_date` dans 1, 2, 3, 30 jours
2. Créer des baux avec `end_date` dans 30 jours
3. Déclencher manuellement le job (ou attendre 6h UTC) :
   ```bash
   cd packages/api
   npm run job:reminder-scheduler
   ```
4. Vérifier l'historique :
   - Rappels d'échéance créés pour J-3
   - Notifications "Fin de bail prochaine" créées pour J-30

**Résultats attendus**

- ✅ Job s'exécute une fois par jour à 6h UTC
- ✅ Rappels créés pour les bonnes échéances
- ✅ Pas de doublon

#### Job 3 : status-updater (toutes les 5 minutes)

**Test**

1. Envoyer un email via SendGrid
2. Attendre que SendGrid envoie un webhook "delivered"
3. Vérifier que le job met à jour le statut dans les 5 minutes

**Résultats attendus**

- ✅ Job démarre toutes les 5 minutes
- ✅ Statuts mis à jour selon les webhooks reçus

---

## 5. Vérifications et dépannage

### 5.1 Checklist de validation complète

Utilisez cette checklist pour valider que toutes les fonctionnalités sont opérationnelles :

#### Fondations

- [ ] Base de données migrée avec toutes les tables communication
- [ ] Variables d'environnement configurées (email, WhatsApp, queue)
- [ ] Backend démarré sans erreur (port 8001)
- [ ] Frontend démarré sans erreur (port 3000)
- [ ] Seed de communication exécuté (template + règle par défaut)

#### Templates

- [ ] Liste des templates affichée
- [ ] Création d'un template email avec variables
- [ ] Création d'un template WhatsApp
- [ ] Modification d'un template existant
- [ ] Suppression d'un template non utilisé
- [ ] Prévisualisation d'un template avec variables remplacées
- [ ] Variables affichées dans le sélecteur

#### Règles

- [ ] Liste des règles affichée
- [ ] Création d'une règle avec 1 événement + 1 destinataire + 1 template
- [ ] Création d'une règle multi-canal (Email + WhatsApp)
- [ ] Activation/Désactivation d'une règle via toggle
- [ ] Modification d'une règle existante
- [ ] Suppression d'une règle inactive
- [ ] Tous les événements disponibles dans la liste

#### Notifications automatiques

- [ ] Paiement reçu → Notification locataire
- [ ] Rappel échéance → Notification locataire
- [ ] Ticket créé → Notification propriétaire
- [ ] Bail activé → Notification locataire + propriétaire
- [ ] Les variables sont correctement remplacées
- [ ] Les destinataires sont correctement résolus
- [ ] Copie à l'agence fonctionne (si activée)

#### Historique

- [ ] Liste des communications affichée avec pagination
- [ ] Filtres par Type fonctionnels
- [ ] Filtres par Canal fonctionnels
- [ ] Filtres par Statut fonctionnels
- [ ] Filtres par Période fonctionnels
- [ ] Recherche par destinataire fonctionnelle
- [ ] Détail d'une communication complet
- [ ] Bouton "Réessayer" fonctionne sur échec
- [ ] Bouton "Annuler" fonctionne sur planifié
- [ ] Statuts corrects (Envoyé, Délivré, Lu, Échec, etc.)

#### Préférences

- [ ] Recherche de destinataire fonctionne
- [ ] Création de préférences pour un nouveau destinataire
- [ ] Modification de préférences existantes
- [ ] Désactivation d'un canal respectée lors des envois
- [ ] Quiet hours reportent bien les envois
- [ ] Événements désactivés ne génèrent pas de notification
- [ ] Types de messages désactivés respectés

#### Annonces manuelles

- [ ] Formulaire de composition affiché
- [ ] Sélection de destinataires par groupe fonctionne
- [ ] Sélection manuelle de destinataires fonctionne
- [ ] Envoi immédiat fonctionne
- [ ] Envoi planifié fonctionne
- [ ] Pièces jointes pour email fonctionnent (si implémenté)
- [ ] Prévisualisation affichée correctement
- [ ] Annonces apparaissent dans l'historique
- [ ] Préférences respectées (canaux, types)

#### Analytics

- [ ] KPIs affichés (Total envoyé, Taux livraison, En attente, Échecs)
- [ ] Graphique par canal affiché
- [ ] Graphique par type affiché
- [ ] Tendances temporelles affichées
- [ ] Filtres par période fonctionnels
- [ ] Top événements déclencheurs affiché
- [ ] Performance des templates affichée
- [ ] Raisons d'échec listées
- [ ] Export PDF/Excel/CSV fonctionne (si implémenté)

#### Jobs

- [ ] Job queue-processor démarre automatiquement (toutes les minutes)
- [ ] Job reminder-scheduler démarre (tous les jours à 6h UTC)
- [ ] Job status-updater démarre (toutes les 5 minutes)
- [ ] Messages planifiés sont traités à l'heure
- [ ] Retry automatique fonctionne (3 tentatives max)
- [ ] Pas d'erreur dans les logs des jobs

#### Sécurité et isolation

- [ ] Utilisateur ne voit que les données de son tenant
- [ ] Tentative d'accès à un autre tenant → 403
- [ ] Templates isolés par tenant
- [ ] Règles isolées par tenant
- [ ] Historique isolé par tenant
- [ ] Préférences isolées par tenant
- [ ] Analytics isolées par tenant

### 5.2 Problèmes courants et solutions

#### Problème 1 : Menu Communication absent

**Symptômes**

- Le menu "Communication" n'apparaît pas dans la sidebar

**Causes possibles**

1. Rôle utilisateur sans permission communication
2. Tenant non sélectionné
3. Route non enregistrée dans le frontend

**Solutions**

1. Vérifier les permissions du compte :
   ```sql
   SELECT * FROM users WHERE id = 'user-id';
   SELECT * FROM tenant_users WHERE user_id = 'user-id';
   ```
2. Vérifier que le tenant est bien sélectionné (dans l'URL ou le state)
3. Vérifier le fichier de routes : `apps/web/src/routes.tsx`
4. Vérifier le fichier de menu : `apps/web/src/components/Sidebar.tsx`

---

#### Problème 2 : Erreur 403 sur toutes les routes communication

**Symptômes**

- Toutes les requêtes vers `/api/tenants/:tenantId/communication/*` retournent 403

**Causes possibles**

1. Middleware RBAC trop restrictif
2. Token d'authentification invalide ou expiré
3. Utilisateur n'a pas accès au tenant spécifié

**Solutions**

1. Vérifier les logs du backend :
   ```
   [Auth] User xxx unauthorized for tenant yyy
   ```
2. Vérifier le token JWT :
   ```bash
   # Décoder le token sur jwt.io
   # Vérifier exp, userId, tenantIds
   ```
3. Vérifier la relation User-Tenant :
   ```sql
   SELECT * FROM tenant_users
   WHERE user_id = 'xxx' AND tenant_id = 'yyy';
   ```
4. Vérifier le middleware dans `packages/api/src/middleware/`

---

#### Problème 3 : Communications créées mais jamais envoyées

**Symptômes**

- Messages restent en statut "En file d'attente" indéfiniment
- Aucun passage à "Envoyé"

**Causes possibles**

1. Job `communication-queue-processor` ne démarre pas
2. `COMMUNICATION_QUEUE_ENABLED=false` dans .env
3. `NODE_ENV=test` (les jobs ne démarrent pas en mode test)
4. Erreur dans le traitement de la file

**Solutions**

1. Vérifier les logs du backend au démarrage :
   ```
   [Jobs] Starting communication-queue-processor (cron: */1 * * * *)
   ```
2. Vérifier le fichier `.env` :
   ```env
   COMMUNICATION_QUEUE_ENABLED=true
   NODE_ENV=development  # PAS "test"
   ```
3. Déclencher manuellement le job :
   ```bash
   cd packages/api
   npm run job:queue-processor
   ```
4. Vérifier les erreurs dans `communication_job_logs` (si table existe)

---

#### Problème 4 : Emails en échec avec "Provider error"

**Symptômes**

- Tous les emails passent en statut "Échec"
- Raison : "Provider error: 401 Unauthorized" ou "Network error"

**Causes possibles**

1. Clé API SendGrid invalide ou expirée
2. Credentials SMTP incorrects
3. Provider email non configuré
4. Rate limit atteint

**Solutions**

**SendGrid**

1. Vérifier la clé API dans `.env` :
   ```env
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
   ```
2. Tester la clé avec curl :
   ```bash
   curl --request POST \
     --url https://api.sendgrid.com/v3/mail/send \
     --header "Authorization: Bearer $SENDGRID_API_KEY" \
     --header 'Content-Type: application/json' \
     --data '{"personalizations":[{"to":[{"email":"test@example.com"}]}],"from":{"email":"noreply@immotopia.fr"},"subject":"Test","content":[{"type":"text/plain","value":"Test"}]}'
   ```
3. Vérifier le quota SendGrid (Dashboard SendGrid)

**Nodemailer (SMTP)**

1. Vérifier les credentials :
   ```env
   EMAIL_PROVIDER=nodemailer
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   ```
2. Pour Gmail, générer un "App Password" (pas le mot de passe principal)
3. Vérifier que le port 587 est ouvert

---

#### Problème 5 : Variables non remplacées dans les templates

**Symptômes**

- Les messages reçus contiennent `{{contactName}}` au lieu du nom réel
- Les variables restent en format brut

**Causes possibles**

1. Template mal enregistré (variables non parsées)
2. Données source manquantes (ex: locataire sans nom)
3. Erreur dans le service `NotificationEngine.resolveTemplateVariables()`

**Solutions**

1. Vérifier que les variables utilisent la bonne syntaxe : `{{variableName}}` (pas `{variableName}` ou `$variableName`)
2. Vérifier les données source :
   ```sql
   SELECT * FROM tenant_clients WHERE id = 'renter-id';
   -- Vérifier que first_name, last_name, email existent
   ```
3. Vérifier les logs du backend :
   ```
   [NotificationEngine] Resolving variables for template tpl_xxx
   [NotificationEngine] Context: { contactName: "Jean Dupont", ... }
   ```
4. Tester manuellement la résolution :
   ```typescript
   const context = { contactName: "Jean", amount: "850" };
   const template = "Bonjour {{contactName}}, montant: {{amount}}";
   const result = template.replace(
     /\{\{(\w+)\}\}/g,
     (match, key) => context[key] || match,
   );
   // Résultat attendu: "Bonjour Jean, montant: 850"
   ```

---

#### Problème 6 : Quiet hours non respectées

**Symptômes**

- Les messages sont envoyés pendant les quiet hours
- Pas de report après la plage

**Causes possibles**

1. Préférences du destinataire mal configurées
2. Job `queue-processor` ne vérifie pas les quiet hours
3. Timezone incorrecte

**Solutions**

1. Vérifier les préférences dans la base :
   ```sql
   SELECT * FROM communication_preferences
   WHERE recipient_type = 'RENTER' AND recipient_id = 'xxx';
   -- Vérifier quiet_hours_start et quiet_hours_end
   ```
2. Vérifier le code dans `NotificationEngine` :
   ```typescript
   // Doit calculer scheduled_at en fonction des quiet hours
   if (preference.quiet_hours_start && preference.quiet_hours_end) {
     const now = new Date();
     const [startHour, startMin] = preference.quiet_hours_start.split(":");
     // ... logique de calcul
   }
   ```
3. Vérifier la timezone du serveur :
   ```bash
   date  # Doit afficher la bonne timezone
   ```
4. Vérifier que le champ `scheduled_at` est bien renseigné dans la table `communications`

---

#### Problème 7 : Analytics vides ou incohérentes

**Symptômes**

- Les KPIs affichent 0 alors que des communications existent
- Les graphiques sont vides
- Les chiffres ne correspondent pas à l'historique

**Causes possibles**

1. Filtres de période trop restrictifs
2. Données dans un autre tenant
3. Erreur dans le calcul des analytics
4. Cache frontend

**Solutions**

1. Vérifier les filtres de période :
   - Élargir la période : "Tous" ou "30 derniers jours"
   - Vérifier que la date de fin >= date de début
2. Vérifier le tenantId dans l'URL et dans les requêtes API
3. Vérifier les données en base :
   ```sql
   SELECT
     DATE(sent_at) as date,
     COUNT(*) as total,
     SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
     SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
   FROM communications
   WHERE tenant_id = 'xxx'
     AND sent_at >= '2026-01-01'
   GROUP BY DATE(sent_at)
   ORDER BY date DESC;
   ```
4. Vider le cache du navigateur (Ctrl+Shift+R)
5. Vérifier les logs du backend pour erreurs SQL

---

#### Problème 8 : WhatsApp en échec systématique

**Symptômes**

- Tous les WhatsApp passent en échec
- Raison : "Twilio error" ou "Invalid phone number"

**Causes possibles**

1. Credentials Twilio invalides
2. Numéros de téléphone mal formatés
3. Template WhatsApp non approuvé (selon provider)
4. Solde Twilio épuisé

**Solutions**

**Credentials**

1. Vérifier dans `.env` :
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
2. Tester avec curl :
   ```bash
   curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
     --data-urlencode "From=$TWILIO_WHATSAPP_FROM" \
     --data-urlencode "Body=Test message" \
     --data-urlencode "To=whatsapp:+33612345678" \
     -u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN
   ```

**Format des numéros**

- Les numéros doivent être au format international : `+33612345678`
- Pas d'espaces, pas de tirets
- Préfixe `whatsapp:` ajouté automatiquement par le provider

**Vérifier le solde Twilio**

- Se connecter à Twilio Dashboard
- Vérifier le solde et les logs d'envoi

---

#### Problème 9 : Règle active mais aucune notification déclenchée

**Symptômes**

- Une règle est marquée "Active"
- Un événement se produit (ex: paiement)
- Aucune communication créée dans l'historique

**Causes possibles**

1. Événement non intégré (appel à `NotificationEngine.triggerEvent()` manquant)
2. Destinataire non résolu (ex: bail sans locataire)
3. Template supprimé ou manquant
4. Conditions de la règle non respectées

**Solutions**

1. Vérifier que l'événement appelle bien le NotificationEngine :
   ```typescript
   // Dans PaymentService ou équivalent
   await this.notificationEngine.triggerEvent({
     type: "PAYMENT_RECEIVED",
     tenantId: payment.tenantId,
     data: {
       paymentId: payment.id,
       leaseId: payment.leaseId,
       amount: payment.amount,
       // ...
     },
   });
   ```
2. Vérifier les logs du backend :
   ```
   [NotificationEngine] Event triggered: PAYMENT_RECEIVED
   [NotificationEngine] Found 1 active rule(s)
   [NotificationEngine] Resolving recipients for rule: xxx
   [NotificationEngine] Resolved 2 recipient(s)
   [NotificationEngine] Creating 2 communication(s)
   ```
3. Si "Resolved 0 recipient(s)", vérifier les relations :
   ```sql
   SELECT l.*, tc.*
   FROM leases l
   LEFT JOIN tenant_clients tc ON l.renter_id = tc.id
   WHERE l.id = 'lease-id';
   -- Vérifier que renter_id est bien renseigné
   ```
4. Vérifier que le template existe :
   ```sql
   SELECT * FROM communication_templates
   WHERE id = (SELECT email_template_id FROM notification_rules WHERE id = 'rule-id');
   ```

---

#### Problème 10 : Performances dégradées (lenteur)

**Symptômes**

- Chargement des pages communication très lent (> 5 secondes)
- Historique met longtemps à afficher
- Analytics timeout

**Causes possibles**

1. Table `communications` très volumineuse (> 100k lignes)
2. Index manquants
3. Requêtes non optimisées
4. Pagination non implémentée

**Solutions**

**Ajouter des index en base**

```sql
-- Index sur les colonnes les plus utilisées
CREATE INDEX idx_communications_tenant_id ON communications(tenant_id);
CREATE INDEX idx_communications_status ON communications(status);
CREATE INDEX idx_communications_sent_at ON communications(sent_at);
CREATE INDEX idx_communications_recipient ON communications(recipient_type, recipient_id);
CREATE INDEX idx_communications_tenant_status ON communications(tenant_id, status);
```

**Optimiser les requêtes**

```typescript
// Utiliser Prisma avec select pour limiter les colonnes
const communications = await prisma.communication.findMany({
  where: { tenantId },
  select: {
    id: true,
    type: true,
    channel: true,
    recipientType: true,
    recipientId: true,
    subject: true,
    status: true,
    sentAt: true,
    // Ne pas inclure 'body' qui peut être très volumineux
  },
  orderBy: { sentAt: "desc" },
  take: 20, // Pagination
  skip: (page - 1) * 20,
});
```

**Activer le cache (optionnel)**

```typescript
// Cache Redis pour analytics (1 heure)
const cacheKey = `analytics:${tenantId}:${startDate}:${endDate}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const analytics = await calculateAnalytics(tenantId, startDate, endDate);
await redis.setex(cacheKey, 3600, JSON.stringify(analytics));
```

**Archiver les anciennes communications**

```sql
-- Déplacer les communications > 1 an dans une table d'archive
CREATE TABLE communications_archive AS
SELECT * FROM communications
WHERE sent_at < NOW() - INTERVAL '1 year';

DELETE FROM communications
WHERE sent_at < NOW() - INTERVAL '1 year';
```

---

### 5.3 Logs et monitoring

#### Activer les logs détaillés

**Backend (packages/api/.env)**

```env
LOG_LEVEL=debug  # ou info, warn, error
LOG_FORMAT=json  # ou text pour développement
```

**Logs importants à surveiller**

```
[CommunicationService] Creating communication: { type, channel, recipientId }
[NotificationEngine] Event triggered: PAYMENT_RECEIVED
[NotificationEngine] Found X active rule(s)
[NotificationEngine] Resolved X recipient(s)
[EmailProvider] Sending email to xxx@example.com
[EmailProvider] Email sent successfully, messageId: yyy
[QueueService] Processing queue, found X messages
[Job] communication-queue-processor started
[Job] communication-queue-processor completed in Xs
```

**Erreurs à surveiller**

```
[ERROR] Failed to send email: Invalid API key
[ERROR] Twilio error: Phone number is not valid
[ERROR] Template not found: tpl_xxx
[ERROR] Recipient not found: RENTER:xxx
[ERROR] Database connection timeout
```

#### Monitoring production (recommandations)

**Métriques à suivre**

- Taux de livraison global (objectif > 95%)
- Temps de traitement de la queue (objectif < 30s)
- Nombre d'échecs par heure (objectif < 5%)
- Temps de réponse API /history (objectif < 500ms)

**Alertes à configurer**

- Taux de livraison < 85% pendant 1 heure
- Taux d'échec > 10% pendant 15 minutes
- Queue non traitée pendant > 5 minutes
- Job communication-queue-processor non exécuté depuis > 3 minutes

**Outils recommandés**

- Logs : Sentry, Datadog, CloudWatch
- Metrics : Prometheus + Grafana
- Uptime : UptimeRobot, Pingdom
- Email monitoring : SendGrid Dashboard, Postmark

---

### 5.4 Support et documentation

**Documentation complète**

- Architecture : `docs/communication/COMMUNICATION_MODULE.md`
- Variables templates : `docs/communication/TEMPLATE_VARIABLES.md`
- Validation checklist : `specs/010-communication-module/checklists/validation-checklist.md`
- Guide API : Swagger disponible à `http://localhost:8001/api-docs` (si configuré)

**Contacts et support**

- Issue GitHub : Ouvrir une issue avec le template "Bug" ou "Feature Request"
- Slack/Discord : Canal #module-communication
- Email support : support@immotopia.cloud

**Contribuer**

- Voir `CONTRIBUTING.md` pour les guidelines
- Toute PR doit inclure des tests
- Respecter les conventions du `.cursorrules`

---

## 6. Conclusion

Ce guide de test complet vous permet de valider l'ensemble des fonctionnalités du module Communication d'ImmoTopia.

**Points clés à retenir :**

1. **Ordre de test recommandé** : Suivre le scénario de bout en bout (Section 2) pour une première validation rapide
2. **Données d'exemple** : Utiliser les données fournies dans chaque section pour remplir les formulaires
3. **Vérifications systématiques** : Toujours vérifier l'historique après chaque action
4. **Analytics** : Consulter régulièrement pour détecter les anomalies
5. **Préférences** : Tester systématiquement le respect des préférences (canaux, quiet hours, événements désactivés)

**En cas de problème :**

- Consulter la section 5 "Vérifications et dépannage"
- Vérifier les logs du backend
- Utiliser la checklist de validation (Section 5.1)
- Contacter le support si nécessaire

**Bon test ! 🚀**

---

**Dernière mise à jour** : 04/02/2026  
**Version du module** : 1.0.0  
**Auteur** : Équipe ImmoTopia
