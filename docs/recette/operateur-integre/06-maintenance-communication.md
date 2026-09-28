# Partie G — Maintenance et Communication et Documents

Domaines couverts : « Maintenance » (tickets, prestataires) et
« Communication et Documents » (notifications e-mail/WhatsApp, newsletter,
modèles de documents).

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`, `SUBSCRIPTION_ENFORCEMENT=enforce`).

## Prérequis

- Parties 01-04 déjà jouées : opérateur, collaborateurs, biens (dont
  « Palmiers A2 », un appartement en location sans incident), bail actif
  « Palmiers A1 » avec Aminata Traoré OI, portail locataire accessible.
- Contact Aminata Traoré OI (locataire) et Kouassi Yao OI (propriétaire) déjà
  créés (partie 03).
- Un contact CRM avec consentement WhatsApp et un numéro renseigné, si
  disponible, pour tester l'envoi groupé (sinon consigner le manque de
  donnée plutôt que d'inventer un consentement).

## Réalité de l'environnement

- **« Tester l'envoi WhatsApp » et « Envoyer une invitation groupe WhatsApp en
  masse » n'ont aucun bouton dans l'interface.** Les deux routes existent
  côté API (`POST /tenants/:tenantId/whatsapp-notifications/test-send` et
  `POST .../whatsapp-notifications/group-invite/send-all`) et le service
  frontend correspondant (`whatsapp-notification-config-service.ts`,
  fonctions exportées lignes 87 et 100) est bien importé par
  `WhatsAppNotificationsPage.tsx`, mais **aucun composant de cette page**
  (325 lignes, relue intégralement) n'appelle ces deux fonctions : seuls
  « Enregistrer »/« Réinitialiser au message par défaut » (édition du gabarit
  d'un événement) sont câblés à un bouton. C'est un point à signaler comme
  suspicion d'anomalie (écran incomplet) plutôt qu'un choix voulu — voir le
  rapport final. Ces deux sous-fonctionnalités vont donc en « Hors
  interface ».
- **Aucun e-mail ni WhatsApp ne part réellement** (cadre commun : fournisseurs
  non configurés). Les actions de configuration (activer/désactiver un
  événement, personnaliser le corps) restent vérifiables à l'écran ; les
  envois eux-mêmes (campagne newsletter, message groupé WhatsApp, invitation
  groupe) renverront un succès apparent côté écran (l'appel HTTP réussit),
  mais aucune remise réelle n'a lieu — ce n'est pas un échec de l'étape.
- **Webhook WhatsApp entrant** (`POST /api/whatsapp/webhook`) : endpoint
  technique public, non déclenchable depuis l'interface ; le code lui-même
  note qu'il ne fait que journaliser le message reçu, sans action métier
  (pas de création de ticket ou de conversation) — sans écran à tester, et
  sans effet visible même si on le déclenchait.
- **Tâche planifiée d'envoi automatique des campagnes** (cron minute par
  minute) et **notification de ticket** (déclenchée en tâche de fond) : non
  déclenchables depuis le navigateur ; se contenter de vérifier qu'une
  campagne planifiée passe en statut **Planifiée** (G.9) sans attendre son
  exécution automatique.
- **Génération de document depuis un modèle : dépendance avec la partie 04.**
  Le document généré en partie 04 (étape E.7) dépend d'un modèle actif pour
  `LEASE_CONTRACT` — cette partie (G.11) crée justement un modèle
  « Bail Habitation OI » qui, une fois marqué par défaut, sert de modèle pour
  toute génération ultérieure. Si la partie 04 a été rejouée avant celle-ci,
  elle n'a pu utiliser qu'un éventuel modèle global de seed
  (`db:seed:document-templates`) — le consigner sans le traiter comme un
  échec.
- **Route d'assignation de prestataires plus permissive que le reste du
  module** (Notes du wiki) : `GET /maintenance/vendors/active` n'exige que
  l'accès tenant générique, aucune permission `MAINTENANCE_*` — sans
  incidence visible côté écran (l'utilisateur y accède quand même via
  l'assignation d'un ticket), mais à signaler dans le rapport comme
  suspicion d'oubli de garde.
- **`assignVendor()` du service de tickets de maintenance jamais appelé** :
  l'assignation réelle passe uniquement par la mise à jour générique du
  ticket (`PATCH .../admin/tickets/:id`) — sans conséquence pour l'étape
  G.4 qui utilise ce chemin.

## G.1 — Déclarer un ticket de maintenance (côté agence, pour Aminata Traoré OI)

**Compte :** agent.oi@recette.test
**Action :** Maintenance › Mes demandes (`/tenant/:tenantId/maintenance`) ›
« Créer un ticket de maintenance ». Propriété « Palmiers A2 » (le bail actif
sélectionne automatiquement le bail s'il n'y en a qu'un), Titre
`Fuite au niveau de l'évier de la cuisine`, Catégorie **Plomberie**, Priorité
**Élevée**, Description (≥10 caractères)
`L'évier de la cuisine fuit depuis ce matin, de l'eau s'accumule sous le meuble.`,
Détails de localisation `Cuisine`, joindre une photo.
**Attendu :** Ticket créé, statut **Déclaré** (`DECLARED`) ; un bail actif
doit exister pour ce bien, sinon message d'erreur « Bail actif introuvable » —
si Palmiers A2 n'a pas de bail actif (partie 04 ne l'a pas prescrit), utiliser
Palmiers A1 à la place et le consigner.
**Couvre :** Maintenance / Déclarer un ticket de maintenance (demandeur) ;
Ajouter une pièce jointe à mon ticket

## G.2 — Consulter, modifier, commenter mon ticket

**Compte :** agent.oi@recette.test
**Action :** Maintenance › Mes demandes : filtrer par statut **Déclaré**,
ouvrir le détail du ticket créé en G.1. Bouton « Modifier » : ajuster la
description. Ajouter un commentaire
`Le propriétaire a été prévenu, en attente d'un plombier`.
**Attendu :** Liste filtrée correcte ; détail affiche pièces jointes,
commentaires, historique de statut ; modification acceptée uniquement tant
que le ticket reste **Déclaré** (message d'erreur explicite sinon) ;
commentaire créé avec `authorType: TENANT`.
**Couvre :** Maintenance / Lister mes tickets (demandeur) ; Consulter le
détail d'un ticket (demandeur) ; Modifier mon ticket ; Commenter mon ticket
(demandeur)

## G.3 — Annuler et supprimer un ticket de test

**Compte :** agent.oi@recette.test
**Action :** Créer un second ticket de test (mêmes champs minimaux), puis
l'annuler (passage à **Annulé**), puis le supprimer définitivement.
**Attendu :** Annulation acceptée (transition `DECLARED`/`IN_PROGRESS` →
`CANCELED`) ; suppression acceptée uniquement pour un ticket **Déclaré** ou
**Annulé**, avec suppression en cascade des pièces jointes.
**Couvre :** Maintenance / Annuler mon ticket ; Supprimer définitivement mon
ticket

## G.4 — Prestataire, assignation, workflow de statut

**Compte :** admin.oi@recette.test / manager.oi@recette.test
**Action :** Maintenance › Prestataires (`/tenant/:tenantId/admin/maintenance/vendors`)
› « Nouveau prestataire » : nom `Plomberie Express OI`, téléphone, e-mail,
spécialités `Plomberie`. Maintenance › Tickets de l'agence
(`/tenant/:tenantId/admin/maintenance/tickets`) : ouvrir le ticket de G.1,
changer le statut à **En cours** (`IN_PROGRESS`), puis assigner le
prestataire `Plomberie Express OI` (passage automatique à **Assigné**).
Ajouter une note de résolution et réévaluer la priorité à **Urgente**.
Commenter côté agence. Terminer en passant le statut à **Résolu**
(`RESOLVED`).
**Attendu :** Prestataire créé (nom unique dans l'agence) ; transition de
statut refusée si elle saute une étape ; passage à **Assigné** exige qu'un
prestataire ou un responsable soit déjà désigné ; commentaire créé avec
`authorType: MANAGER` ; historique de statut de bien mis à jour et consultable
depuis la fiche du bien « Palmiers A2 ».
**Couvre :** Maintenance / Consulter/traiter les tickets (côté agence) —
lister ; Consulter/traiter les tickets — détail ; Changer le statut d'un
ticket ; Assigner un prestataire ou un responsable à un ticket ; Ajouter des
notes de résolution / priorité ; Commenter un ticket (côté agence/
gestionnaire) ; Consulter l'historique de maintenance d'un bien ; Enregistrer
un prestataire ; Consulter un prestataire ; Modifier un prestataire

## G.5 — Désactiver puis purger un prestataire de test

**Compte :** admin.oi@recette.test
**Action :** Créer un second prestataire de test `Prestataire à supprimer OI`
(sans jamais l'assigner à un ticket). Le désactiver, puis le supprimer
définitivement.
**Attendu :** Désactivation acceptée (`isActive:false`) tant qu'aucun ticket
actif ne lui est assigné ; suppression définitive acceptée uniquement si
aucun ticket (même résolu) ni contrat syndic n'y est lié — ce qui est le cas
pour ce prestataire jamais utilisé.
**Couvre :** Maintenance / Désactiver un prestataire ; Supprimer
définitivement un prestataire ; Lister les prestataires actifs (pour
assignation) — vérifié indirectement en rouvrant le sélecteur d'assignation
de G.4 après cette suppression

## G.6 — Télécharger une pièce jointe et portail locataire

**Compte :** manager.oi@recette.test puis locataire.oi@recette.test
**Action :** Depuis Maintenance › Tickets de l'agence, télécharger la photo
jointe au ticket de G.1. Se reconnecter en tant que Aminata Traoré OI,
Portail Locataire › Incidents : déclarer un nouveau ticket depuis le portail
(catégorie **Électricité**, titre `Prise électrique qui grésille`,
description ≥10 caractères, une pièce jointe), le consulter dans la liste,
ouvrir son détail, ajouter un commentaire, télécharger sa propre pièce
jointe.
**Attendu :** Téléchargement agence réussi (fichier jamais servi en
statique) ; le locataire ne voit que ses propres tickets ; le ticket déclaré
depuis le portail apparaît aussitôt côté agence (G.4) avec le même workflow
de statut.
**Couvre :** Maintenance / Télécharger une pièce jointe (agence) ;
Maintenance (portail locataire) / Déclarer un ticket ; Consulter mes tickets ;
Consulter le détail d'un ticket ; Commenter un ticket ; Télécharger une pièce
jointe

## G.7 — Portail propriétaire : incidents de mes biens

**Compte :** proprio.oi@recette.test
**Action :** Portail Propriétaire › Incidents (`/owner/maintenance`) :
consulter la liste des tickets concernant Villa Riviera OI (aucun attendu
dans ce scénario) ou, si un ticket a été déclaré sur un bien sous son
mandat, ouvrir son détail et télécharger une pièce jointe.
**Attendu :** Liste filtrée aux biens du propriétaire (`propertyIds`) ; 404
« accès non autorisé » si l'on tente d'ouvrir un ticket hors de son
périmètre (non testé faute d'un second propriétaire).
**Couvre :** Maintenance (portail propriétaire) / Consulter les tickets de
mes biens ; Consulter le détail d'un ticket ; Télécharger une pièce jointe

## G.8 — Notifications e-mail

**Compte :** admin.oi@recette.test
**Action :** Communication › Notifications e-mail
(`EmailNotificationsUnifiedPage.tsx`). Sélectionner l'événement
`MAINTENANCE_TICKET_CREATED` (ou équivalent), personnaliser le sujet et le
corps HTML, enregistrer. Désactiver un autre événement (interrupteur).
Bouton « Réinitialiser au modèle par défaut » sur l'événement personnalisé.
**Attendu :** Configuration enregistrée (`enabled`, `subjectOverride`,
`bodyHtmlOverride`) ; réinitialisation efface la personnalisation et revient
au gabarit par défaut ; aucun e-mail réel n'est envoyé dans cet
environnement.
**Couvre :** Communication / Configurer les notifications e-mail

## G.9 — Notifications WhatsApp

**Compte :** admin.oi@recette.test
**Action :** Communication › Notifications WhatsApp
(`WhatsAppNotificationsPage.tsx`). Sélectionner un événement (ex.
`MAINTENANCE_TICKET_CREATED`), personnaliser le corps, renseigner un Content
SID de test et son mapping de variables JSON, enregistrer. Désactiver un
événement.
**Attendu :** Configuration enregistrée (corps, `contentSid`,
`contentVariablesJson`) ; interrupteur d'activation fonctionnel.
**Couvre :** Communication / Configurer les notifications WhatsApp

## G.10 — Message groupé WhatsApp (diffusion manuelle)

**Compte :** admin.oi@recette.test
**Action :** Communication › Message groupé WhatsApp
(`WhatsAppGroupMessagePage.tsx`). Composer un message texte, l'enrichir (gras,
liste), joindre une image (JPEG, ≤5 Mo), bouton d'envoi au groupe.
**Attendu :** Message envoyé (ou repli texte seul si l'envoi image échoue,
message affiché en conséquence) vers la destination configurée
(`WHATSAPP_GROUP_BROADCAST_TO`) — si cette variable n'est pas renseignée dans
cet environnement, un message d'erreur explicite apparaît : le consigner sans
le traiter comme un échec de l'étape.
**Couvre :** Communication / Envoyer un message groupé WhatsApp (diffusion
manuelle)

## G.11 — Modèles de documents

**Compte :** admin.oi@recette.test
**Action :** Documents › Modèles de documents
(`/tenant/:tenantId/documents/templates`) › « Ajouter un template » : Type de
document **Bail Habitation**, Nom du template `Bail Habitation OI`, fichier
DOCX de test contenant au moins un placeholder `{{VARIABLE}}`. Une fois
téléversé, bouton « Définir par défaut ». Créer un second modèle du même type
`Bail Habitation OI (brouillon)`, puis le désactiver, puis le supprimer.
**Attendu :** Premier modèle créé avec ses placeholders extraits
automatiquement ; refus si un fichier de contenu strictement identique
existe déjà pour ce type/tenant (même hash) ; « Définir par défaut » retire
le drapeau à tout autre modèle du même type ; désactivation d'un modèle
retire le drapeau « par défaut » s'il le portait ; suppression logique
(`DELETED`) promeut implicitement un autre modèle actif du même type au
prochain usage.
**Couvre :** Documents / Gérer les modèles de documents (upload) ; Lister les
modèles de documents ; Activer / désactiver un modèle de document ; Définir
un modèle de document par défaut ; Supprimer un modèle de document

## G.12 — Régénérer et télécharger un document généré

**Compte :** manager.oi@recette.test
**Action :** Reprendre le document « Contrat de bail » généré en partie 04
(étape E.7) ou en générer un nouveau maintenant que « Bail Habitation OI »
est le modèle par défaut (G.11). Bouton de régénération, puis téléchargement
du fichier `.docx`.
**Attendu :** Régénération incrémente la révision et recalcule les hash
fichier/modèle ; téléchargement sert le fichier avec
`Content-Disposition: attachment`, jamais un chemin disque brut.
**Couvre :** Documents / Générer un document à partir d'un modèle (déjà
amorcé en partie 04, revérifié ici avec le nouveau modèle par défaut) ;
Régénérer un document (nouvelle révision) ; Télécharger un document généré

## G.13 — Listes de diffusion newsletter

**Compte :** admin.oi@recette.test
**Action :** Communication › Newsletter — Listes
(`NewsletterListsPage.tsx`) › « Nouvelle liste » : type **Manuelle**, nom
`Newsletter OI`, double opt-in désactivé. Ajouter un abonné manuellement
(e-mail de test), puis ajouter depuis les contacts CRM (sélectionner un
contact consentant), exporter la liste en CSV, puis retirer l'abonné ajouté
manuellement. Consulter aussi une liste dérivée (ex. « Depuis les
propriétaires ») pour vérifier qu'elle ne peut pas recevoir d'ajout manuel.
**Attendu :** Liste manuelle créée avec compteurs à jour
(`totalCount/activeCount/unsubscribedCount`) ; ajout depuis les contacts CRM
accepté ; export CSV téléchargé ; une liste dérivée (`FROM_OWNERS`,
`FROM_RENTERS`, `FROM_CRM_CONTACTS`) refuse l'ajout manuel et calcule ses
compteurs depuis les consentements existants.
**Couvre :** Communication / Gérer les listes de diffusion newsletter

## G.14 — Modèles de newsletter

**Compte :** admin.oi@recette.test
**Action :** Communication › Newsletter — Modèles
(`NewsletterTemplatesPage.tsx`) : créer un modèle HTML `Modèle OI` contenant
la variable `{{contenu}}`, le modifier, puis tenter de le supprimer alors
qu'il est utilisé par une campagne planifiée (voir G.15) — reporter la
suppression après l'annulation de cette campagne si le blocage se confirme.
**Attendu :** Modèle créé/modifié ; suppression bloquée tant qu'une campagne
**Planifiée** l'utilise, avec un message explicite.
**Couvre :** Communication / Gérer les modèles de newsletter

## G.15 — Campagne newsletter : créer, prévisualiser, planifier, annuler

**Compte :** admin.oi@recette.test
**Action :** Communication › Newsletter — Campagnes
(`NewsletterCampaignsPage.tsx`) › « Nouvelle campagne » : liste
`Newsletter OI`, modèle `Modèle OI`, sujet
`Actualités de Groupe Intégré Recette OI`, corps HTML incluant
`{{lien_desinscription}}`. Bouton « Prévisualiser ». Bouton « Planifier » à
une date future proche. Puis « Annuler la campagne ».
**Attendu :** Campagne créée en **Brouillon**, modifiable tant qu'elle
l'est ; prévisualisation rend sujet/HTML avec des variables d'exemple sans
envoyer réellement ; planification passe la campagne à **Planifiée** (date
future exigée) ; annulation la repasse à **Annulée** avant tout envoi
automatique.
**Couvre :** Communication / Créer / modifier une campagne newsletter ;
Prévisualiser une campagne ; Planifier une campagne newsletter ; Annuler une
campagne planifiée

## G.16 — Campagne newsletter : envoi immédiat et destinataires

**Compte :** admin.oi@recette.test
**Action :** Créer une seconde campagne (même liste/modèle), sujet
`Test envoi immédiat OI`, corps incluant `{{lien_desinscription}}`. Bouton
« Envoyer ». Consulter la liste des destinataires de la campagne envoyée.
**Attendu :** Refus si le corps ne contient pas `{{lien_desinscription}}` ou
si la liste est vide ; sinon la campagne passe **Envoi en cours** puis
**Envoyée**/**Échouée** selon le résultat (aucune remise réelle dans cet
environnement, mais le statut et les compteurs se mettent à jour) ; la liste
des destinataires affiche le statut par destinataire (`SENT`/`FAILED`), la
date d'envoi et l'ouverture.
**Couvre :** Communication / Envoyer une campagne newsletter ; Consulter les
destinataires d'une campagne

## Hors interface

- **Tester l'envoi WhatsApp** (`POST .../whatsapp-notifications/test-send`) —
  aucun bouton dans l'interface bien que le service frontend existe (voir
  « Réalité de l'environnement »).
- **Envoyer une invitation groupe WhatsApp en masse**
  (`POST .../whatsapp-notifications/group-invite/send-all`) — même
  constat.
- **Recevoir un message WhatsApp entrant (webhook)** — endpoint technique
  public, sans écran, sans action métier réelle dans le code actuel.
- **Recevoir une notification de création/changement de statut de ticket** —
  traitement asynchrone serveur, sans point d'entrée cliquable ; ses effets
  (e-mail/WhatsApp) ne sont pas vérifiables dans cet environnement sans
  fournisseur configuré.
- **Envoi automatique programmé des campagnes** (`newsletter-campaign-scheduler.job.ts`) —
  tâche planifiée interne (cron chaque minute) ; G.15 vérifie seulement le
  passage en « Planifiée », pas le déclenchement automatique.
- **S'inscrire à une newsletter (formulaire public)**, **Confirmer une
  inscription (double opt-in)**, **Se désinscrire**, **Suivi d'ouverture des
  campagnes** — formulaires/liens publics hors navigation back-office,
  atteignables seulement via un lien e-mail ou une URL publique connue à
  l'avance ; non testés faute d'e-mail réellement envoyé dans cet
  environnement (le double opt-in et le tracking d'ouverture supposent un
  e-mail reçu). À couvrir séparément en ouvrant directement
  `/newsletter/subscribe`, `/newsletter/confirm`, `/newsletter/unsubscribe`
  avec des jetons lus en base si un test plus poussé est nécessaire.

## Couverture

| Fonctionnalité                     | Sous-fonctionnalités couvertes                                                                                                                                                                                                                                                             | Étapes                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| Maintenance (demandeur, agence)    | Déclarer, lister, consulter, modifier, annuler, supprimer, commenter, pièce jointe (demandeur) ; lister/détail/statut/assigner/notes/commenter (agence) ; historique du bien ; prestataires (créer/lister/consulter/modifier/désactiver/supprimer) ; télécharger une pièce jointe (agence) | G.1 à G.6               |
| Maintenance (portail locataire)    | Déclarer, consulter mes tickets, détail, commenter, télécharger une pièce jointe                                                                                                                                                                                                           | G.6                     |
| Maintenance (portail propriétaire) | Consulter les tickets de mes biens, détail, télécharger une pièce jointe                                                                                                                                                                                                                   | G.7                     |
| Communication                      | Notifications e-mail, notifications WhatsApp, message groupé WhatsApp (diffusion manuelle), listes de diffusion newsletter, modèles de newsletter, créer/modifier/prévisualiser/planifier/annuler/envoyer une campagne, consulter les destinataires                                        | G.8 à G.10, G.13 à G.16 |
| Documents                          | Gérer les modèles (upload/lister/activer-désactiver/défaut/supprimer), générer un document, régénérer, télécharger                                                                                                                                                                         | G.11, G.12              |

Sous-fonctionnalités non couvertes : voir « Hors interface » ci-dessus (6
routes sans écran ou sans remise réelle possible dans cet environnement).
