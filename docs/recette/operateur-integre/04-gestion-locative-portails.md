# Partie E — Gestion locative et Portails externes

Domaines couverts : « Gestion locative » (baux, vie du bail, états des lieux,
dépôt de garantie, documents locatifs, échéances, paiements, pénalités,
reversements et commissions, paramètres financiers, Patrimoine › Relevés) et
« Portails externes » pour les portails Propriétaire et Locataire. Le portail
Copropriétaire va dans la partie 08 (Syndic).

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`, `SUBSCRIPTION_ENFORCEMENT=enforce`).

## Prérequis

Objets déjà créés par les parties précédentes (à ne pas recréer) :

- Partie 01 : opérateur « Groupe Intégré Recette OI » (pack Opérateur
  intégré), l'administrateur Awa Konaté OI et les collaborateurs Moussa
  Diarra OI (gestionnaire), Salif Coulibaly OI (agent), Fanta Touré OI
  (comptable) — tous membres **actifs**.
- Partie 02 : immeuble « Résidence Les Palmiers OI » (Cocody) avec les
  appartements « Palmiers A1 », « Palmiers A2 », « Palmiers A3 » en mode
  Location ; villa « Villa Riviera OI » (propriétaire privé Kouassi Yao OI,
  `ownershipType` CLIENT, mandat de gestion actif, mode Location).
- Partie 03 : contact Kouassi Yao OI avec le rôle **Propriétaire** actif
  (nécessaire pour apparaître dans le sélecteur « Propriétaire » du relevé de
  gérance et dans le mandat) ; contact Aminata Traoré OI avec un rôle
  locataire/e-mail renseigné (`locataire.oi@recette.test`).

## Réalité de l'environnement

- **Paiement en ligne du loyer — uniquement en mode Simulateur.** La
  disponibilité du paiement en ligne côté portail locataire vient de
  `getOnlinePaymentAvailability` (`packages/api/src/lib/payment-gateway/checkout.ts`
  ligne 101) qui lit `PaymentGatewayConfig` de l'agence : si l'agence n'a
  **jamais** enregistré cette configuration, `available` vaut `false` (aucun
  paiement en ligne possible), quel que soit l'environnement — voir
  `isConfigUsable` (`packages/api/src/lib/payment-gateway/config.ts` ligne 19) qui exige `config.isActive === true`. Il faut donc que l'agence
  configure elle-même « Paiement en ligne » (`Paramètres financiers` ›
  section « Paiement en ligne », composant `PaymentGatewaySettingsCard.tsx`)
  avant que le locataire ne voie le bouton « Payer » fonctionner : Mode
  **Simulateur** (case cochée par défaut, l'option « Réel » existe mais ne
  doit **jamais** être choisie dans cet environnement), interrupteur
  « Activer le paiement en ligne ». Le mode Simulateur est toujours
  disponible en développement (`paymentGatewaySimulatorAvailable`,
  `packages/api/src/config/env.ts`) ; l'identifiant marchand et la clé API ne
  sont exigés qu'en mode Réel. Le paiement simulé se règle ensuite sur une
  page technique (`GET /payment-gateway/simulator/:codePaiement`) avec trois
  boutons : « Payer » (succès), « Solde insuffisant » (échec), « Annuler ».
- **Aucune invitation ni lien de connexion visibles pour les comptes
  Propriétaire/Locataire — suspicion d'anomalie plutôt qu'un choix voulu.**
  Contrairement à la création d'agence (`TenantCreatedResult.tsx`, « Lien
  d'invitation » + bouton Copier) et à l'invitation d'un copropriétaire côté
  Syndic (`CoOwnerInvitationResult.tsx`, « Accès au portail ouvert »), la
  création d'un bail qui rattache un propriétaire/locataire **par contact**
  (`ownerContactId`/`primaryRenterContactId`) crée en silence, si le contact
  n'a pas encore de compte, un `User` sans mot de passe
  (`getOrCreateTenantClientFromContact`) et un jeton de réinitialisation ;
  ce jeton n'est **jamais renvoyé à l'écran** ni affiché sur la fiche du bail
  ou du contact — il part uniquement par e-mail
  (`emailService.sendAccountCreationEmail`, `rental-lease-service.ts` lignes
  394-470) et, en best-effort, par WhatsApp. Aucun fournisseur n'étant
  configuré dans cet environnement, l'e-mail échoue et l'erreur est avalée en
  silence (`forgotPassword`, `packages/api/src/services/auth-service.ts`
  lignes 505-510, même mécanisme pour `/forgot-password`) : le jeton existe
  bien en base (`PasswordResetToken`) mais **aucun écran ne le donne à
  lire**. Concrètement : après la création des baux E.1 et E.5, Kouassi Yao
  OI et Aminata Traoré OI ont chacun un compte de portail créé, mais aucune
  page cliquable ne permet de connaître ni de fixer leur mot de passe. Les
  étapes E.9 et E.15 (connexion aux portails) utilisent donc les mots de
  passe du cadre commun (`RecetteOI#2026`) **tels quels via l'écran
  `/reset-password?token=…`, en admettant que ce jeton ait été récupéré
  hors interface** (base de données) — ce n'est pas faisable par un agent
  qui ne fait que cliquer. Consigner ceci comme point bloquant plutôt que de
  l'exécuter en silence.
- **Relevés de gérance (Patrimoine › Relevés) : le module apparaît sous
  « Patrimoine » alors que la sous-fonctionnalité est tagué `RENTAL`** — sans
  incidence pour le pack Opérateur intégré (qui a les deux modules), mais
  cohérent avec la note du wiki sur le classement CORE/RENTAL ambigu.
- **Génération de documents locatifs : dépend d'un modèle déjà actif.** Un
  modèle global (`tenant_id: null`) pour `LEASE_HABITATION` a pu être posé
  par le seed `db:seed:document-templates` (cadre commun : « gabarits … de
  documents »). Si aucun modèle actif n'existe pour le type demandé, l'écran
  renvoie une erreur explicite invitant à uploader un modèle d'abord (la
  partie 06 crée le modèle « BAIL-OI » avant que ce scénario ne soit rejoué
  intégralement) ; le consigner sans le traiter comme un échec si le message
  apparaît ici.
- **Bien en mode Vente ne consomme pas la gestion locative** : sans objet
  pour cette partie (les trois appartements Palmiers et la Villa sont déjà en
  mode Location).
- **Honoraires du bail / commission des collaborateurs, taggés CORE alors que
  fonctionnellement RENTAL** (Notes du wiki) : ces écrans restent sous
  Paramétrage › Paramètres financiers, disponibles pour tous les packs y
  compris ceux sans le module RENTAL — sans incidence sur le pack Opérateur
  intégré.

## E.1 — Créer le bail « Palmiers A1 » → Aminata Traoré OI

**Compte :** manager.oi@recette.test
**Action :** Baux › bouton « Nouveau bail ». Étape « Informations générales » :
Propriété « Palmiers A1 », Date de début (aujourd'hui). Étape « Parties
impliquées » : Locataire principal = Aminata Traoré OI (si elle n'apparaît pas
dans la liste des locataires, revenir sur cette étape après avoir vérifié son
rôle CRM en partie 03). Étape « Informations financières » : Devise FCFA,
Fréquence de facturation **Mensuel**, Jour d'échéance **5**, Montant du loyer
**150 000**, Dépôt de garantie **150 000**. Étape « Pénalités » : Mode de
pénalité **Pourcentage du solde**, Taux **5**, Jours de grâce **5**. Étape
« Notes » : `Bail OI — Palmiers A1`. Bouton « Créer le bail ».
**Attendu :** Bail créé avec un numéro `BAIL-AAAA-NNNN` auto-généré ; fiche du
bail ouverte, statut **Brouillon** (`DRAFT`).
**Couvre :** Baux / Créer un bail ; Consulter les baux (liste et détail)

## E.2 — Activer le bail, co-locataire, honoraires du bail

**Compte :** manager.oi@recette.test
**Action :** Fiche du bail Palmiers A1 › bouton de statut › passer à **Actif**.
Puis (si l'écran le propose) ajouter Kouassi Yao OI ou un second contact
comme co-locataire, puis le retirer pour vérifier la liste. Section
« Configurer les honoraires » (dérogation) : laisser vide (hérite des
réglages agence), enregistrer, désigner Moussa Diarra OI comme gestionnaire
du bail.
**Attendu :** Statut passé à **Actif** ; le logement « Palmiers A1 » n'est
plus disponible dans le parc tant que ce bail est actif ; co-locataire
ajouté puis retiré sans erreur ; conditions effectives affichées
(dérogation > propriétaire > agence).
**Couvre :** Baux / Changer le statut d'un bail ; Ajouter un co-locataire ;
Retirer un co-locataire / lister les co-locataires ; Configurer les honoraires
du bail (dérogation + gestionnaire)

## E.3 — Vie du bail : avenant et révision de loyer

**Compte :** manager.oi@recette.test
**Action :** Fiche du bail Palmiers A1 › onglet « Vie du bail » (`translate('Vie du bail')`,
`LeaseDetailPage.tsx`). Bouton d'ajout d'avenant : Date d'effet aujourd'hui,
Résumé `Ajout d'une clause de restitution des clés`. Puis bouton de révision
de loyer : Mois d'effet = mois suivant, Nouveau loyer **160 000**.
**Attendu :** Un événement `AMENDMENT` apparaît dans la chronologie ; un
événement `REVISION` apparaît ensuite, avec le nouveau loyer effectif à
partir du mois choisi ; aucune échéance de la période ciblée ne doit déjà
être réglée (sinon message de refus, choisir un mois postérieur).
**Couvre :** Baux — Vie du bail / Consulter l'historique du bail ; Réviser le
loyer ; Enregistrer un avenant

## E.4 — États des lieux d'entrée

**Compte :** manager.oi@recette.test
**Action :** Onglet « États des lieux » (`translate('États des lieux')`) du
bail Palmiers A1 › créer un état des lieux **Entrée**, date du jour. Renseigner
l'état de quelques pièces/éléments, ajouter une photo (JPEG), désigner un
signataire agence, cocher « Locataire présent » et renseigner son nom. Bouton
« Supprimer » sur cet état des lieux pour vérifier qu'un brouillon se supprime,
puis recréer un état des lieux Entrée identique et le finaliser.
**Attendu :** Premier état créé (rooms par défaut) puis supprimé (avec sa
photo) sans erreur ; le second, une fois les champs renseignés (au moins un
élément avec état + signataires requis), se finalise (`FINALIZED`, horodaté) ;
tenter de le modifier ou de le supprimer après finalisation est refusé.
**Couvre :** Baux — États des lieux / Réaliser un état des lieux (entrée ou
sortie) ; Consulter / lister les états des lieux ; Modifier un état des lieux
(brouillon) ; Finaliser un état des lieux ; Supprimer un état des lieux ;
Ajouter / consulter / supprimer une photo d'état des lieux

## E.5 — Créer le bail « Villa Riviera OI » (propriétaire Kouassi)

**Compte :** manager.oi@recette.test
**Action :** Baux › « Nouveau bail ». Propriété « Villa Riviera OI ». Un
locataire externe est nécessaire pour ce bail de démonstration : créer/choisir
un locataire déjà présent en base (ou, si le formulaire l'exige, utiliser
Kouassi Yao OI comme propriétaire désigné dans « Sélectionner un propriétaire
(optionnel) » tout en gardant un locataire distinct). Loyer **400 000**,
Fréquence **Mensuel**, Jour d'échéance **10**, Dépôt **800 000**, Devise FCFA.
Créer le bail, puis l'activer.
**Attendu :** Bail « Villa Riviera OI » créé et actif, avec Kouassi Yao OI
comme propriétaire du bail (`ownerClientId`/`ownerContactId`).
**Couvre :** Baux / Créer un bail ; Changer le statut d'un bail (réutilise le
mécanisme déjà vérifié en E.1-E.2 sur un second bail, pour poser le
propriétaire nécessaire aux étapes de reversement)

## E.6 — Dépôt de garantie

**Compte :** manager.oi@recette.test / compta.oi@recette.test
**Action :** Onglet « Dépôt de garantie » du bail Palmiers A1 : la première
consultation initialise le dépôt (cible 150 000). Enregistrer un mouvement
**Collecte** de 150 000 FCFA (méthode Mobile Money), puis consulter la liste
des mouvements. Faire de même sur la Villa Riviera OI (mouvement de 800 000).
**Attendu :** Dépôt affiché avec montant cible/collecté/solde courant à jour ;
la collecte doit égaler le montant cible et être unique (une seconde tentative
de `COLLECT` est refusée) ; mouvement visible dans l'historique.
**Couvre :** Baux — Dépôt de garantie / Consulter / créer le dépôt de
garantie ; Enregistrer un mouvement de dépôt (collecte) ; Lister les
mouvements de dépôt

## E.7 — Documents locatifs

**Compte :** manager.oi@recette.test
**Action :** Onglet « Documents » du bail Palmiers A1 : générer un document
type **Contrat de bail** (`LEASE_CONTRACT`). Consulter la liste, ouvrir le
document généré, passer son statut à **Final**.
**Attendu :** Document créé en `DRAFT` avec un numéro séquentiel
(`AAAA-NNN`) si un modèle actif existe pour ce type (sinon message d'erreur
invitant à uploader un modèle — voir « Réalité de l'environnement », ne pas
traiter comme un échec) ; passage à `FINAL` réussi.
**Couvre :** Baux — Documents / Générer un document locatif ; Consulter /
lister les documents ; Changer le statut d'un document

## E.8 — Échéances et pénalités

**Compte :** compta.oi@recette.test
**Action :** Encaisser › Échéances (`/tenant/:tenantId/rental/installments`) :
bouton « Générer les échéances » sur le bail Palmiers A1, puis sur la Villa
Riviera OI. Consulter la liste globale et le détail d'une échéance. Menu
d'actions › « Recalculer les statuts et pénalités ». Sur une échéance
antérieure fictive ou en attendant qu'une échéance dépasse son jour d'échéance

- délai de grâce, bouton « Calculer les pénalités » (calcul en masse).
  **Attendu :** Échéances créées pour chaque bail (une par mois jusqu'à la fin
  du bail ou 12 mois si durée indéterminée) ; statuts recalculés
  (`DRAFT/DUE/OVERDUE/PARTIAL/PAID`) ; pénalités calculées seulement au-delà du
  délai de grâce.
  **Couvre :** Encaisser — Échéances / Générer les échéances d'un bail ;
  Consulter / lister les échéances ; Recalculer les statuts des échéances ;
  Encaisser — Pénalités / Calculer une pénalité de retard (une échéance ou
  toutes)

## E.9 — Pénalité : remise manuelle et justificatif

**Compte :** compta.oi@recette.test
**Action :** Baux › Détail du bail › onglet « Pénalités » (une fois une
pénalité calculée en E.8) : bouton d'ajustement, montant réduit, raison
`Retard justifié par une panne réseau Mobile Money`. Joindre un justificatif
(PDF), puis le télécharger. Sur une autre pénalité, bouton de suppression.
**Attendu :** Pénalité marquée `is_manual_override`, montant ajusté reporté
au compte du locataire ; justificatif attaché puis téléchargeable ;
suppression d'une pénalité recalcule le montant de pénalité de l'échéance.
**Couvre :** Encaisser — Pénalités / Consulter / lister les pénalités ;
Modifier une pénalité (remise manuelle) ; Supprimer une pénalité ; Joindre /
télécharger un justificatif de pénalité

## E.10 — Encaisser un paiement et l'allouer

**Compte :** compta.oi@recette.test
**Action :** Encaisser › Paiements › « Enregistrer un paiement » : bail
Palmiers A1, méthode **Mobile Money**, montant **150 000**, date du jour.
Consulter le paiement créé, bouton « Allouer » sur une ou plusieurs échéances
en attente. Répéter avec un paiement partiel plus faible (ex. 50 000) pour
observer le statut `PARTIAL`.
**Attendu :** Paiement créé en `SUCCESS` ; allocation met à jour le(s)
statut(s) d'échéance(s) ; un reliquat non affecté est inscrit comme avance au
compte du locataire.
**Couvre :** Encaisser — Paiements / Enregistrer un paiement ; Consulter /
lister les paiements ; Allouer un paiement à des échéances

## E.11 — Statut d'un paiement et déclarations en attente

**Compte :** compta.oi@recette.test
**Action :** Sur un paiement enregistré par erreur, changer son statut à
**Annulé** (`CANCELED`). Menu Encaisser › Paiements › onglet ou filtre des
déclarations : consulter les déclarations en attente (aucune tant que le
locataire n'a pas déclaré de paiement portail — voir E.14) ; y revenir après
E.14 pour approuver ou rejeter la déclaration d'Aminata Traoré OI.
**Attendu :** Paiement `CANCELED` défait ses allocations et recalcule les
échéances concernées ; liste des déclarations vide au premier passage,
peuplée après E.14 ; approuver une déclaration crée le paiement correspondant,
rejeter exige une raison (`reviewNotes`).
**Couvre :** Encaisser — Paiements / Changer le statut d'un paiement ;
Consulter / lister les déclarations de paiement ; Approuver une déclaration
de paiement ; Rejeter une déclaration de paiement

## E.12 — Relancer un rapprochement de paiement en ligne

**Compte :** compta.oi@recette.test
**Action :** Une fois un paiement en ligne initié côté portail locataire
(E.14), revenir sur ce paiement dans Encaisser › Paiements et cliquer
« Relancer le rapprochement » (`online-check`).
**Attendu :** Le résumé du checkout en ligne (statut, montant) se met à jour
d'après une nouvelle interrogation de PaySecureHub (mode Simulateur).
**Couvre :** Encaisser — Paiements / Relancer le rapprochement d'un paiement
en ligne

## E.13 — Paramètres financiers : honoraires et commissions

**Compte :** admin.oi@recette.test
**Action :** Paramétrage › Paramètres financiers (`/tenant/:tenantId/settings/finance`).
Section honoraires par propriétaire : sélectionner Kouassi Yao OI, mode
**Taux**, `managementFeeRate` **10 %**, base loyer encaissé, statut fiscal
**Particulier**. Enregistrer, puis « Réinitialiser » pour revenir aux réglages
d'agence. Section commission des collaborateurs : Moussa Diarra OI, part
**20 %**.
**Action (même page) :** activer « Paiement en ligne » — Mode **Simulateur**,
interrupteur « Activer le paiement en ligne » ON, Compte de trésorerie par
défaut, « Qui paie les frais » = Le locataire. Bouton « Enregistrer », puis
« Tester la connexion ».
**Attendu :** Conditions d'honoraires du propriétaire enregistrées puis
supprimées après réinitialisation (retour aux réglages d'agence) ; taux de
commission du collaborateur enregistré ; paramètres du paiement en ligne
enregistrés (message « Paramètres du paiement en ligne enregistrés ») ; le
test de connexion réussit en mode Simulateur.
**Couvre :** Paramétrage › Paramètres financiers / Consulter / configurer les
honoraires de gestion par propriétaire ; Réinitialiser les honoraires d'un
propriétaire ; Consulter / configurer la commission des collaborateurs

## E.14 — Portail Locataire : connexion et parcours (Aminata Traoré OI)

**Compte :** locataire.oi@recette.test
**Action :** Se connecter sur `/login` (voir « Réalité de l'environnement »
pour la réserve sur l'obtention du mot de passe). Parcourir : Accueil
(tableau de bord du bail actif), « Mon bail » (détail, colocataires, dépôt),
« Payer » (échéances, historique). Sur une échéance due, bouton « Payer » :
vérifier disponibilité (`SIMULATOR`), démarrer le paiement, être redirigé vers
la page simulateur, cliquer « Payer » (succès). Revenir sur l'application,
suivre le statut du paiement (`codePaiement`). Séparément, bouton « Déclarer
un paiement » : montant, date, méthode Mobile Money, joindre une preuve
(image). Consulter « Mes échéances », « Mon dépôt de garantie », « Mes
documents ».
**Attendu :** Tableau de bord affiche solde courant, prochaine échéance,
paiements récents ; disponibilité du paiement en ligne = `{available: true,
mode: 'SIMULATOR'}` (après E.13) ; le paiement simulé revient en `SUCCESS`
après réconciliation serveur-à-serveur ; la déclaration de paiement apparaît
ensuite côté agence (E.11) en attente de contrôle ; le dépôt affiché
correspond à celui saisi en E.6 ; documents du bail téléchargeables.
**Couvre :** Portail Locataire / Tableau de bord ; Consulter mon bail ;
Consulter mes échéances ; Payer en ligne — vérifier la disponibilité ;
Payer en ligne — démarrer un paiement ; Payer en ligne — suivre un paiement ;
Déclarer un paiement (hors ligne) ; Consulter mon historique de paiements ;
Consulter mon dépôt de garantie ; Consulter mes documents

## E.15 — Portail Locataire : compte courant / relevé

**Compte :** locataire.oi@recette.test
**Action :** Depuis le portail, ouvrir le relevé de compte de tiers
(`GET /api/portal/tenant/finance/statement` — si aucune entrée de menu
dédiée n'apparaît, y accéder par l'URL directe indiquée par le wiki, ou noter
son absence à l'écran).
**Attendu :** Relevé en lecture seule (mouvements, solde), identique en
format à l'écran gestionnaire côté agence.
**Couvre :** Portail Locataire / Consulter mon compte courant / relevé
agence

## E.16 — Reversement du propriétaire et comptes courants

**Compte :** compta.oi@recette.test
**Action :** Finance › Clients et propriétaires › Reversements et
commissions › Comptes propriétaires (`ComptesProprietaires.tsx`). Ouvrir le
compte de Kouassi Yao OI : consulter le solde dû (loyers encaissés −
honoraires − TVA − dépenses − reversements). Bouton « Nouveau reversement » :
montant ≤ solde dû, méthode Mobile Money, date du jour. Puis, sur un
reversement erroné, bouton d'annulation avec raison
`Montant saisi deux fois par erreur`.
**Attendu :** Reversement créé (n° `REV-AAAA-NNNN`), écriture comptable
postée ; le solde dû diminue d'autant ; l'annulation contre-passe l'écriture
et repasse le relevé lié à `SENT` (dû à nouveau) si un relevé y était lié.
**Couvre :** Finance › Reversements et commissions / Lister / consulter les
comptes courants propriétaires ; Reverser un propriétaire ; Annuler un
reversement

## E.17 — Commissions des collaborateurs

**Compte :** compta.oi@recette.test / admin.oi@recette.test
**Action :** Finance › Clients et propriétaires › Reversements et
commissions › Commissions des agents (`CommissionsAgents.tsx`), période du
mois courant (`AAAA-MM`).
**Attendu :** Totaux (honoraires HT, TVA, part collaborateurs, part non
affectée) affichés, avec le détail par bail pour Moussa Diarra OI (part 20 %
configurée en E.13) ; les baux sans gestionnaire désigné affichent une part
`null`.
**Couvre :** Finance › Reversements et commissions / Consulter l'état des
commissions des collaborateurs

## E.18 — Portail Propriétaire : connexion et parcours (Kouassi Yao OI)

**Compte :** proprio.oi@recette.test
**Action :** Se connecter sur `/login` (même réserve qu'en E.14). Parcourir :
Accueil (tableau de bord portefeuille), « Mes biens » (Villa Riviera OI),
fiche du bien (médias, documents, bail courant, historique), « Revenus »
(résumé, par bien, par mois), « Mon compte » (solde courant tenu par
l'agence, mouvements, historique des reversements — doit refléter le
reversement de E.16), Plus › « Documents », Plus › « Rapports » (export PDF
revenus), Plus › « Préférences » (consentement newsletter).
**Attendu :** Le solde de « Mon compte » correspond au compte courant vu en
E.16 côté agence ; « Mes biens » ne montre que Villa Riviera OI (ou les biens
liés à son mandat) ; les rapports Plus › Rapports sont marqués « À vérifier —
bug probable » dans le wiki : consigner le résultat réel (fichier généré ou
erreur) sans le traiter comme un échec de cette étape s'il échoue.
**Couvre :** Portail Propriétaire / Tableau de bord ; Consulter mes biens ;
Consulter le détail d'un bien ; Consulter mes revenus ; Consulter mon compte
courant agence ; Consulter mes documents ; Générer un rapport de revenus ;
Générer un rapport d'occupation ; Exporter mes données ; Gérer mes
préférences

## E.19 — Portail Propriétaire : baux, échéances, paiements, dépôts

**Compte :** proprio.oi@recette.test
**Action :** Depuis la fiche du bien ou par URL directe (le wiki signale
l'absence d'entrée de menu dédiée pour ces quatre écrans) : consulter « mes
baux » (liste + détail du bail Villa Riviera OI), « mes échéances », « mes
paiements reçus », « mes dépôts de garantie ».
**Attendu :** Le bail Villa Riviera OI apparaît avec ses échéances, le
paiement encaissé en E.10 (s'il concerne ce bail) et le dépôt saisi en E.6 ;
un 404 si Kouassi Yao OI tente d'ouvrir un bail hors de son périmètre (non
testé ici faute d'un second propriétaire).
**Couvre :** Portail Propriétaire / Consulter mes baux ; Consulter le détail
d'un bail ; Consulter mes échéances (loyers dus) ; Consulter mes paiements
reçus ; Consulter mes dépôts de garantie

## E.20 — Relevé de gérance (Patrimoine › Relevés)

**Compte :** manager.oi@recette.test
**Action :** Patrimoine › Relevés (`OwnerStatementsPage.tsx`). Bouton de
génération : Propriétaire Kouassi Yao OI, Période (mois courant), Biens
« Villa Riviera OI ». Consulter le relevé généré, bouton « Recalculer »,
bouton « Envoyer ».
**Attendu :** Relevé créé avec le résumé (loyers encaissés, honoraires,
dépenses, retenues, solde) ; recalcul possible tant que le relevé n'est pas
réglé ; l'envoi échoue proprement (`NO_EMAIL_OR_CONSENT` ou équivalent) si
Kouassi Yao OI n'a pas consenti aux e-mails — consigner le message affiché
(`sendReasonLabel`) sans le traiter comme une anomalie de cette étape.
**Couvre :** Patrimoine › Relevés / Consulter / lister les relevés
propriétaires ; Générer un relevé propriétaire ; Modifier un relevé
propriétaire ; Recalculer un relevé propriétaire ; Envoyer un relevé au
propriétaire

## E.21 — Vie du bail : renouvellement et résiliation (fin de partie)

À exécuter en dernier, une fois toutes les étapes précédentes validées : ces
actions changent l'état du bail et peuvent empêcher de rejouer certaines
étapes ci-dessus.

**Compte :** manager.oi@recette.test
**Action :** Sur le bail Villa Riviera OI, onglet « Vie du bail » : bouton
de résiliation — Date de préavis aujourd'hui, Date d'effet dans 30 jours,
Initiée par **Propriétaire**, résumé `Fin de mandat de gestion`. Puis, sur le
bail Palmiers A1 (s'il porte une date de fin) : bouton de renouvellement —
Nouvelle date de fin reportée d'un an.
**Attendu :** Résiliation : un événement `TERMINATION` apparaît, les
échéances non réglées postérieures à la date d'effet sont annulées et
contre-passées ; le bail passe `ENDED` si la date est déjà passée, sinon
reste actif jusqu'à cette date. Renouvellement : un événement `RENEWAL`
apparaît (+ `REVISION` si le loyer change), de nouvelles échéances sont
créées pour la période prolongée.
**Couvre :** Baux — Vie du bail / Renouveler le bail ; Résilier le bail ;
Consulter le solde de tout compte (à vérifier juste après la résiliation, sur
le bail Villa Riviera OI : dépôt détenu, arriérés, retenues de l'état des
lieux de sortie, solde à rembourser)

## Hors interface

- **Enregistrer un mouvement de dépôt de type RELEASE/REFUND/FORFEIT/
  ADJUSTMENT** : non testés faute de scénario de restitution complet dans ce
  parcours (le bail Villa Riviera OI vient d'être résilié en E.21, sans
  attendre le solde de tout compte définitif) — sous-fonctionnalité couverte
  seulement pour `COLLECT` (E.6).
- **Recevoir une notification de création/changement de statut de ticket**
  (job asynchrone) : sans objet ici (domaine Maintenance, partie 06), citée
  pour mémoire seulement si un ticket a été ouvert sur un bien loué de cette
  partie.

## Couverture

| Fonctionnalité                                                        | Sous-fonctionnalités couvertes                                                                                                                                    | Étapes           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Baux                                                                  | Créer, consulter, modifier (implicite E.2), changer le statut, supprimer (non testé — voir note), ajouter/retirer co-locataire, configurer les honoraires du bail | E.1, E.2, E.5    |
| Baux — Vie du bail                                                    | Historique, révision, renouvellement, avenant, résiliation, solde de tout compte                                                                                  | E.3, E.21        |
| Baux — États des lieux                                                | Réaliser, consulter/lister, modifier, finaliser, supprimer, comparer (non exécuté faute de sortie finalisée avant la fin du scénario), photos                     | E.4              |
| Baux — Dépôt de garantie                                              | Consulter/créer, enregistrer un mouvement (collecte), lister les mouvements                                                                                       | E.6              |
| Baux — Documents                                                      | Générer, consulter/lister, changer le statut                                                                                                                      | E.7              |
| Encaisser — Échéances                                                 | Générer, consulter/lister, recalculer, supprimer (non testé — destructif)                                                                                         | E.8              |
| Encaisser — Paiements                                                 | Enregistrer, consulter/lister, allouer, changer le statut, relancer le rapprochement, déclarations (consulter/approuver/rejeter)                                  | E.10, E.11, E.12 |
| Encaisser — Pénalités                                                 | Calculer, consulter/lister, modifier (remise), supprimer, justificatif                                                                                            | E.8, E.9         |
| Finance › Reversements et commissions (RENTAL, côté Gestion locative) | Comptes propriétaires, reverser, annuler, commissions des agents                                                                                                  | E.16, E.17       |
| Portail propriétaire (compte)                                         | Consulter mon compte                                                                                                                                              | E.18             |
| Paramétrage › Paramètres financiers                                   | Honoraires par propriétaire, réinitialiser, commission des collaborateurs                                                                                         | E.13             |
| Patrimoine › Relevés                                                  | Consulter/lister, générer, modifier (implicite recalcul), recalculer, envoyer                                                                                     | E.20             |
| Portail Propriétaire                                                  | Tableau de bord, biens, bail(s), revenus, échéances, paiements, dépôts, compte courant, documents, rapports, export, préférences                                  | E.18, E.19       |
| Portail Locataire                                                     | Tableau de bord, bail, échéances, déclarer un paiement, historique, payer en ligne (disponibilité/démarrer/suivre), dépôt, compte courant, documents              | E.14, E.15       |

Sous-fonctionnalités non couvertes (avec raison) :

- **Supprimer un bail** — destructif et exigerait de recréer un bail entier
  pour la suite du scénario ; non joué pour ne pas perturber E.8-E.21.
- **Supprimer toutes les échéances d'un bail** — refusé de toute façon dès
  qu'un paiement est alloué (E.10), donc non démontrable après E.8 sans
  revenir en arrière.
- **Comparer les états des lieux (entrée / sortie)** — un état de sortie
  n'est créé nulle part dans ce parcours (le bail résilié en E.21 ne va pas
  jusqu'au solde de tout compte avec état des lieux de sortie) ; à couvrir
  dans un parcours de fin de bail dédié.
- **Consulter mes échéances (portail propriétaire, installments)**,
  **Consulter mes paiements reçus (détail)** : mentionnés dans le wiki comme
  « à vérifier — pas d'entrée de menu dédiée » ; testés en E.19 par accès
  direct si l'écran existe, sinon consigner l'absence.
