# Configuration Twilio pour les notifications WhatsApp

Ce document décrit ce que vous devez faire **côté plateforme Twilio** pour activer les notifications WhatsApp dans le menu Communication d’ImmoTopia.

---

## 1. Créer un compte Twilio

1. Rendez-vous sur [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. Inscrivez-vous (essai gratuit avec crédit offert).
3. Vérifiez votre numéro de téléphone et votre email si demandé.

---

## 2. Récupérer les identifiants API

1. Connectez-vous au **Console Twilio** : [https://console.twilio.com](https://console.twilio.com).
2. Sur le tableau de bord, repérez :
   - **Account SID** (ex. `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - **Auth Token** (cliquez sur « Show » pour l’afficher)
3. Vous en aurez besoin pour les variables d’environnement (voir ci-dessous).

---

## 3. Activer WhatsApp (Sandbox ou compte approuvé)

Twilio propose deux façons d’envoyer des messages WhatsApp :

### Option A : WhatsApp Sandbox (recommandé pour commencer)

1. Dans la console Twilio : **Messaging** → **Try it out** → **Send a WhatsApp message** (ou **Messaging** → **WhatsApp**).
2. Ouvrez la section **Sandbox** (ou **Sandbox settings**).
3. Vous verrez un numéro Twilio au format `+1 415 xxx xxxx` et un **code à rejoindre** (ex. « join xxx-yyy »).
4. Sur votre téléphone, ajoutez le numéro Twilio dans vos contacts, puis ouvrez une conversation WhatsApp avec ce numéro et envoyez le message indiqué (ex. `join xxx-yyy`).
5. Une fois rejoint, le **Sandbox** est activé. Le numéro affiché (sans espaces, ex. `+14155238886`) est votre **TWILIO_WHATSAPP_FROM**.

**Limitation Sandbox :** seuls les numéros qui ont envoyé « join … » au Sandbox peuvent recevoir des messages. Idéal pour les tests.

**Je ne reçois pas les messages :** avec le Sandbox, le numéro qui doit recevoir (ex. le vôtre) doit d’abord envoyer **depuis WhatsApp** le message « join xxx-yyy » au numéro Twilio du Sandbox. Sans cette étape, Twilio peut accepter l’envoi (status « queued ») mais le message ne sera pas livré. Vérifiez aussi dans la console Twilio → **Messaging** → **Logs** le statut final du message (delivered / failed).

### Option B : Compte WhatsApp Business (production)

1. Twilio : **Messaging** → **WhatsApp** → **Senders** (ou **WhatsApp Business Account**).
2. Suivez le processus pour connecter un **compte WhatsApp Business** (ou demander l’accès à l’API WhatsApp).
3. Après validation par Meta/WhatsApp, vous obtiendrez un numéro d’envoi (ex. `+33xxxxxxxxx`) à utiliser comme **TWILIO_WHATSAPP_FROM**.

Pour la production (vrais clients), il faudra en général utiliser l’option B et des **templates de message** approuvés par WhatsApp.

**Détail complet :** voir la section [WhatsApp Business (production)](#10-whatsapp-business-production) ci‑dessous.

---

## 4. Variables d’environnement (côté serveur ImmoTopia)

Sur le serveur où tourne l’API (ou dans votre fichier `.env`), ajoutez :

```env
# Twilio – Compte
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=votre_auth_token

# Twilio – Numéro WhatsApp expéditeur (Sandbox ou numéro approuvé)
# Format: +33123456789 (sans espaces)
TWILIO_WHATSAPP_FROM=+14155238886
```

- **TWILIO_ACCOUNT_SID** : Account SID de la console Twilio.  
- **TWILIO_AUTH_TOKEN** : Auth Token de la console Twilio.  
- **TWILIO_WHATSAPP_FROM** :  
  - **Sandbox** : le numéro du Sandbox (ex. `+14155238886`).  
  - **Production** : le numéro WhatsApp Business fourni par Twilio.

Redémarrez l’API après modification des variables.

---

## 5. Tester l’envoi

1. Dans l’app ImmoTopia : **Communication** → **Notifications WhatsApp**.
2. Activez par exemple « Nouveau ticket de maintenance » (locataire).
3. Côté CRM, assurez-vous qu’un contact a :
   - un numéro (WhatsApp ou téléphone) renseigné,
   - **Consentement WhatsApp** coché.
4. Créez un ticket de maintenance en associant ce contact comme « contact locataire » du ticket.
5. Si la config Twilio est correcte, le contact reçoit un WhatsApp (dans le Sandbox, il doit avoir rejoint le Sandbox avec ce numéro).

---

## 6. Message initié par l'entreprise (template)

Pour envoyer sans que le client ait répondu, Twilio exige un **template pré-approuvé**. Dans **Communication** → **Notifications WhatsApp**, ouvrez « Template Twilio » et renseignez le **Content SID** (ex. Sandbox Rappels de rendez-vous : `HXb5b62575e6e4ff6129ad7c8efe1f983e`) et le **mapping JSON** (ex. `{"1":"appointmentDate","2":"appointmentTime"}`).

---

## 7. Webhooks (optionnel)

Pour recevoir les statuts d’envoi (delivered, read, etc.) ou les réponses des destinataires, vous pouvez configurer une URL de webhook dans la console Twilio :

- **Messaging** → **Settings** → **Webhooks** (ou équivalent selon l’interface).
- **Status callback URL** : `https://votre-domaine.com/api/webhooks/twilio/whatsapp` (à créer dans l’API si besoin).
- Le provider ImmoTopia expose une fonction `handleWebhook(payload)` ; vous pouvez l’appeler depuis une route POST dédiée pour traiter le payload Twilio.

---

## 8. Résumé des étapes côté Twilio

| Étape | Action |
|-------|--------|
| 1 | Créer un compte sur twilio.com |
| 2 | Récupérer **Account SID** et **Auth Token** dans la console |
| 3 | Activer le **WhatsApp Sandbox** (ou un compte WhatsApp Business) et noter le numéro d’envoi |
| 4 | Configurer **TWILIO_ACCOUNT_SID**, **TWILIO_AUTH_TOKEN** et **TWILIO_WHATSAPP_FROM** sur le serveur / dans `.env` |
| 5 | Redémarrer l’API et tester depuis **Communication** → **Notifications WhatsApp** |

Une fois ces éléments en place, les notifications WhatsApp configurées dans le menu Communication (et déclenchées par les événements, ex. création de ticket) seront envoyées via Twilio.

### Tester l’envoi (script)

Pour vérifier que Twilio envoie bien un message WhatsApp sans passer par l’app :

```bash
cd packages/api
npm run test:twilio-whatsapp -- +2250103754238
```

Le script envoie un message de test au numéro indiqué (par défaut `+2250103754238`). Vérifiez que le numéro a rejoint le **Sandbox** Twilio si vous utilisez le Sandbox.

---

## 9. Préparer les contacts CRM pour WhatsApp (maintenance)

Pour que les **locataires** et les **admins agence** reçoivent bien le WhatsApp à la création d’un ticket de maintenance, il faut des **contacts CRM** avec le même email, le **consentement WhatsApp** coché et un **numéro** (WhatsApp ou téléphone principal).

Un script permet de créer ou mettre à jour ces contacts pour un tenant donné :

```bash
cd packages/api

# Tenant ID en argument (ou variable TENANT_ID)
npm run ensure:whatsapp-maintenance -- e3e428d1-364b-42c9-a102-a22daa9329c5

# Avec numéros (optionnel ; sinon les numéros déjà en base sont conservés)
LOCATAIRE_PHONE=+2250700000001 AGENCY_PHONES=+2250700000002,+2250700000003 npm run ensure:whatsapp-maintenance -- e3e428d1-364b-42c9-a102-a22daa9329c5
```

Par défaut le script cible :
- **Locataire** : `devaccrocs@gmail.com` (celui qui crée le ticket, reçoit « Votre ticket a bien été enregistré » + WhatsApp).
- **Agence** : `collab1.kouamé.diabaté@agence-mali.com` et `scolarflow@gmail.com` (reçoivent « Nouveau ticket de maintenance » + WhatsApp).

Variables d’environnement optionnelles : `LOCATAIRE_EMAIL`, `LOCATAIRE_PHONE`, `AGENCY_EMAILS`, `AGENCY_PHONES` (voir en-tête du script `scripts/ensure-whatsapp-contacts-maintenance.ts`).

Après exécution, créez un nouveau ticket avec le compte locataire pour tester l’envoi email + WhatsApp (locataire et agence).

---

## 10. WhatsApp Business (production)

Avec **WhatsApp Business**, vous n’avez plus à faire rejoindre le Sandbox à chaque destinataire : vos contacts reçoivent les messages sans aucune action de leur part. En revanche, les messages envoyés « à l’initiative de l’entreprise » doivent utiliser des **templates (modèles)** approuvés par WhatsApp.

### 10.1 Activer WhatsApp Business dans Twilio – Guide pas à pas

**Important :** L’enregistrement d’un **expéditeur WhatsApp** (votre propre numéro) nécessite un **compte Twilio payant**. Avec un compte d’essai (trial), Twilio affiche « Veuillez mettre à niveau votre compte pour soumettre un expéditeur WhatsApp ». Il faut cliquer sur **Mettre à niveau son compte Twilio** et passer au forfait payant. Le **Sandbox** (section 3, option A) reste lui utilisable en essai gratuit.

**Prérequis :**
- Un compte Twilio **payant** (Console → **Upgrade** en haut, ou Admin → Billing → Upgrade account).
- Un compte **Facebook** (pour lier Meta Business).
- Un **numéro de téléphone** qui n’est **pas déjà** enregistré sur WhatsApp (ou WhatsApp Business app). Ce numéro peut être un numéro Twilio que vous achetez, ou votre propre numéro (il devra recevoir un SMS ou un appel pour le code de vérification).

---

#### Étape 1 : Ouvrir la page WhatsApp Senders

1. Connectez-vous à la **Console Twilio** : [https://console.twilio.com](https://console.twilio.com).
2. Dans le menu de gauche : **Messaging** (Messagerie) → **Senders** → **WhatsApp Senders**.  
   Lien direct : [https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders](https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders).
3. Cliquez sur **Create new sender** (Créer un expéditeur).

---

#### Étape 2 : Choisir un numéro

- **Option A – Numéro Twilio :**  
  Achetez un numéro Twilio si vous n’en avez pas (Console → **Phone Numbers** → **Buy a number**). Puis dans l’assistant « Create new sender », sélectionnez ce numéro et cliquez **Continue**.
- **Option B – Votre propre numéro :**  
  Choisissez « Non-Twilio phone number » et entrez votre numéro (il doit pouvoir recevoir des **SMS** ou des **appels** pour le code de vérification).

Dans les deux cas, le numéro **ne doit pas** être déjà utilisé avec WhatsApp (ou WhatsApp Business). Si c’est le cas, il faut d’abord supprimer le compte WhatsApp associé à ce numéro.

---

#### Étape 3 : Lier un compte WhatsApp Business (Meta / Facebook)

1. Sur la page **Link WhatsApp Business Account with your number**, cliquez **Continue with Facebook** (Continuer avec Facebook).
2. Une **fenêtre pop-up** s’ouvre (ne la fermez pas et ne partagez pas son adresse). Restez dans le **même navigateur**.
3. **Connectez-vous à Facebook** si demandé (ou « Continue as [votre nom] »).
4. **Créez** un nouveau **Meta Business Portfolio** (ou sélectionnez un existant) → **Next**.
5. **Créez** un nouveau **WhatsApp Business Account (WABA)** (ou sélectionnez celui déjà lié à Twilio) → **Next**.  
   Important : si c’est votre premier expéditeur Twilio, choisissez **Create a new WABA**.
6. Cochez **Create a new WhatsApp Business profile** → **Next**.

---

#### Étape 4 : Remplir le profil WhatsApp Business

Renseignez au minimum :

- **WhatsApp Business display name** : le nom que vos clients verront (ex. « Agence Immobilière du Mali »). Il doit respecter les [règles Meta](https://www.facebook.com/business/help/757569725593362).
- **Category** : catégorie de votre activité (ex. Real Estate).

Vous pouvez aussi remplir la description et le site web. Puis **Next**.

---

#### Étape 5 : Vérifier le numéro avec WhatsApp (code OTP)

Meta envoie un **code de vérification** pour prouver que vous contrôlez le numéro.

- **Si vous avez choisi un numéro Twilio :**
  - Dans l’assistant, choisissez **Text message** (SMS).
  - Dans la **Console Twilio** (l’autre onglet), une section affiche le **code de vérification**. Cliquez **Copy**.
  - Collez ce code dans la pop-up Meta et validez.
- **Si vous avez choisi votre propre numéro :**
  - Choisissez **Text message** ou **Phone call**.
  - Vous recevrez le code par **SMS** ou **appel** sur ce numéro. Entrez-le dans la pop-up.

Une fois le code accepté, Meta confirme la propriété du numéro.

---

#### Étape 6 : Autoriser Twilio

1. La pop-up affiche **Review Twilio’s access request** (Demande d’accès de Twilio).
2. Lisez les autorisations demandées et cliquez **Confirm**.
3. La pop-up se ferme. La **Console Twilio** se met à jour et affiche votre nouvel **expéditeur WhatsApp** (WhatsApp sender).

---

#### Étape 7 : Récupérer le numéro d’envoi (TWILIO_WHATSAPP_FROM)

1. Sur la page **WhatsApp Senders**, votre nouveau sender apparaît avec un **numéro de téléphone** (ex. `+33 6 12 34 56 78` ou `+225 07 00 00 00 00`).
2. Notez ce numéro **au format E.164**, sans espaces : ex. `+33612345678` ou `+2250700000000`.
3. Dans votre fichier **`.env`** (ou variables d’environnement du serveur), ajoutez ou modifiez :

```env
TWILIO_WHATSAPP_FROM=+33612345678
```

(Remplacez par le numéro affiché dans la console.)

4. Redémarrez l’API ImmoTopia pour que la nouvelle variable soit prise en compte.

---

#### (Optionnel) Vérification Meta Business

Pour augmenter les limites d’envoi et passer en production complète, Meta peut demander une **vérification d’entreprise** (gratuite, différente de « Meta Verified »). Vous pouvez la lancer depuis le [Centre de sécurité Meta](https://business.facebook.com/settings/security). Le délai peut aller de quelques jours à quelques semaines.

---

**Documentation officielle :** [Twilio – Register WhatsApp senders (Self Sign-up)](https://www.twilio.com/docs/whatsapp/guided-onboarding).

### 10.2 Créer et faire approuver des templates (Content)

WhatsApp exige que chaque type de message « initié par l’entreprise » soit un **template** pré‑approuvé.

1. Dans Twilio : **Messaging** → **Content Editor** (ou **Content** → **Create new**).
2. Créer un **Content Template** pour chaque type de notification que vous utilisez (ex. accusé de réception ticket, rappel loyer, etc.).
3. Le template contient un **texte** avec des **variables** au format `{{1}}`, `{{2}}`, … (ou des noms selon l’interface).
4. Soumettre le template à WhatsApp pour **approbation** (peut prendre quelques heures à quelques jours).
5. Une fois approuvé, Twilio vous donne un **Content SID** (ex. `HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`). C’est cet identifiant que vous allez renseigner dans ImmoTopia.

**Exemple de template (accusé de réception ticket)**  
Texte proposé :  
`Bonjour {{1}}, votre demande de maintenance "{{2}}" a bien été enregistrée par {{3}}. Propriété : {{4}}. Suivez votre ticket dans le portail locataire.`  
→ Les variables 1, 2, 3, 4 correspondent à : prénom/nom du locataire, titre du ticket, nom de l’agence, référence du bien.

Pour connaître les **variables utilisées par ImmoTopia** pour chaque notification, voir le fichier **`docs/WHATSAPP-BUSINESS-TEMPLATES-REFERENCE.md`** (texte par défaut et noms de variables pour le mapping).

### 10.3 Configurer ImmoTopia (Content SID + mapping)

Pour chaque type de notification que vous voulez envoyer en WhatsApp Business :

1. Dans ImmoTopia : **Communication** → **Notifications WhatsApp**.
2. Ouvrir la notification concernée (ex. « Nouveau ticket de maintenance » pour le locataire).
3. Renseigner :
   - **Content SID (Template Twilio)** : le Content SID du template approuvé (ex. `HX…`).
   - **Mapping des variables (JSON)** : objet qui associe le **numéro de variable du template** (clé) au **nom de variable ImmoTopia** (valeur).

**Format du mapping :**  
`{"1": "tenantName", "2": "ticketTitle", "3": "agencyName", "4": "propertyReference"}`  

Cela signifie : dans le template, la place `{{1}}` reçoit la valeur de `tenantName`, `{{2}}` celle de `ticketTitle`, etc. Les noms de variables possibles sont listés dans `docs/WHATSAPP-BUSINESS-TEMPLATES-REFERENCE.md`.

4. Enregistrer. Désormais, quand cette notification est déclenchée, ImmoTopia enverra le message via le **template** (WhatsApp Business) au lieu du message libre (Sandbox). Aucune action n’est requise côté destinataire.

### 10.4 Résumé

| Étape | Où | Action |
|-------|-----|--------|
| 1 | Twilio | Activer WhatsApp Business, obtenir un numéro d’envoi → **TWILIO_WHATSAPP_FROM** |
| 2 | Twilio Content Editor | Créer les templates (texte + variables {{1}}, {{2}}, …), les soumettre à WhatsApp |
| 3 | Twilio | Après approbation, noter le **Content SID** de chaque template |
| 4 | ImmoTopia | Communication → Notifications WhatsApp → pour chaque type : **Content SID** + **Mapping JSON** |

Une fois cette configuration faite, les notifications WhatsApp partent sans que les destinataires aient à « rejoindre » quoi que ce soit.

