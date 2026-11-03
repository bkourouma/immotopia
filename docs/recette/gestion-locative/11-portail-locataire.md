# 11 — Portail locataire

**Module** : Gestion locative — espace du locataire (`apps/web/src/pages/TenantPortal/*`), pages publiques de paiement par lien.

## Périmètre

- Accès du locataire : création du compte à la création du bail, définition du mot de passe, connexion, redirection vers le portail, cas sans bail actif, co-locataire.
- Écrans (URL du portail, sans identifiant d'agence) : **Accueil** `/tenant`, **Mon bail** `/tenant/lease`, **Payer** `/tenant/payments` (onglets Échéances, Historique des paiements, Mon relevé), **Incidents** `/tenant/maintenance`, **Dépôt de garantie** `/tenant/deposit` et **Documents** `/tenant/documents` (écrans sans entrée de menu : atteints par saisie de l'adresse), menu **Plus** (Notifications, Messagerie).
- Déclaration de paiement hors ligne avec justificatif et son suivi jusqu'à l'approbation ou au rejet par l'agence ; paiement en ligne (mode simulé) ; pages publiques `/payer` et `/payer/statut`.
- Maintenance (signalement lié au logement, commentaires, pièces jointes).
- Étanchéité : un locataire ne voit que ses données (URL et identifiants forgés).

## Prérequis

- Fichiers 02 (baux) et 06 (paiements) joués. Rôles : **LOCATAIRE_PORTAIL** = REC-GL Locataire Un (T1, bail R1 de la Villa), **LOCATAIRE_PORTAIL_2** = REC-GL Locataire Deux (T2, bail R2 du Studio). Données de référence : voir le tableau du fichier `10-proprietaires-releves-reversements.md` (R1 : loyer 200 000 + charges 20 000, échéance le 5 ; R2 : loyer 100 000 ; paiement R1 d'octobre 220 000 ; paiement R2 d'octobre 60 000, solde 40 000 en retard ; dépôt de garantie R1 de 400 000 FCFA à collecter ou collecté).
- Agence A en pack Agence ; ADMIN_A disponible pour les actions côté agence ; récepteur d'e-mails local de l'environnement. Paiement en ligne de l'agence en mode simulé (ne jamais viser un prestataire réel).
- Les dates de ce fichier suivent le jeu de référence (octobre 2026, jour d'échéance le 5). Si la recette se joue à une autre date, décaler les mois et recalculer les statuts « Dû » / « En retard ».

- **Convention réseau** : les `fetch` de console cités dans ce fichier utilisent l'adresse de l'API de l'environnement (voir RUNBOOK ; `http://localhost:8820/api` pour la recette du 2026-11-03, voir le README du dossier) avec `credentials:'include'` ; on peut aussi relever la requête émise par l'écran dans l'onglet Réseau. Les identifiants d'objets sont relevés dans l'onglet Réseau, jamais saisis à la main.
- **Comptes** : LOCATAIRE_PORTAIL et LOCATAIRE_PORTAIL_2 du README sont des comptes du seed, avec leurs propres baux et leur historique. Les cas à montants exacts se jouent avec les comptes REC-GL créés ici (T1 et T2, cas GL-11-001 et suivants). Les cas de lecture, d'étanchéité et de robustesse peuvent se jouer avec les comptes du seed, en remplaçant les valeurs du jeu de référence par celles de leur bail lues côté agence (les formules ne changent pas).
- **Écriture des montants** : le portail locataire affiche les montants avec le format monétaire du navigateur (en français « 200 000 F CFA », avec espaces insécables), alors que l'agence et le portail propriétaire écrivent « 200 000 FCFA ». Les attendus de ce fichier écrivent « FCFA » par simplicité : seule la valeur numérique est contrôlée (voir GL-14-009 pour l'écart de présentation).

## Données créées par ce fichier

Comptes portail de T1 et T2 (mot de passe défini), déclarations de paiement `REC-GL…` (références de transaction), ticket de maintenance « REC-GL Fuite robinet », commentaires, liens de paiement.

---

## A. Accès au portail

### GL-11-001 — Compte créé avec le bail : e-mail d'activation

- **Rôle** : ADMIN_A
- **Préconditions** : contact CRM de T1 avec e-mail `rec-gl-locataire1@exemple.test` et **sans compte** dans l'application ; bail R1 à créer (cas de création du fichier 02, à jouer à partir du contact).
- **Données** : locataire principal = contact REC-GL Locataire Un.
- **Étapes** :
  1. Créer le bail R1 depuis le contact (fichier 02) et le laisser en statut Actif.
  2. Ouvrir le récepteur d'e-mails local.
- **Attendu** :
  - Un compte utilisateur et un client de type locataire sont créés avec le bail (atomique) ; un e-mail « Votre bail BAIL-AAAA-NNNN est activé — <agence> » arrive à T1 avec le numéro, l'adresse, les dates, le loyer, le jour d'échéance et un lien `…/reset-password?token=…` (compte nouveau) ou `…/login` (compte déjà existant).
  - Si le contact existe déjà comme utilisateur (même adresse e-mail), aucun nouveau compte n'est créé : l'e-mail renvoie vers la page de connexion et ne propose pas de mot de passe temporaire. Un contact sans e-mail : comportement à confirmer avec le fichier 02.
- **Gravité si échec** : Bloquant

### GL-11-002 — Définir le mot de passe depuis le lien reçu

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : e-mail de GL-11-001 reçu (lien valable 7 jours).
- **Données** : mot de passe `Rec-GL-2026!x` (majuscule, minuscule, chiffre, caractère spécial, 8 caractères ou plus) ; essais invalides `abc`, `abcdefgh`, `Abcdefgh`.
- **Étapes** :
  1. Ouvrir le lien : page « Réinitialiser votre mot de passe » (« Entrez votre nouveau mot de passe ci-dessous. »).
  2. Saisir les mots de passe invalides dans « Nouveau mot de passe », puis une confirmation différente.
  3. Saisir le mot de passe valide deux fois et valider.
  4. Rouvrir le même lien.
- **Attendu** :
  - Messages précis : « Le mot de passe doit contenir au moins 8 caractères. », « … au moins une majuscule. », « … au moins un chiffre. », « … au moins un caractère spécial. », « Les mots de passe ne correspondent pas. ».
  - Succès : « Mot de passe réinitialisé ! » avec accès à la connexion ; l'adresse e-mail du compte est désormais vérifiée.
  - Second usage du lien : refus clair (lien déjà utilisé, message à confirmer), jamais d'écran blanc.
- **Gravité si échec** : Bloquant

### GL-11-003 — Connexion et arrivée sur le portail

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : GL-11-002 passé.
- **Données** : e-mail du locataire, mot de passe défini.
- **Étapes** :
  1. Ouvrir la page de connexion, saisir l'adresse e-mail et le mot de passe, cliquer **Se connecter**.
  2. Observer l'adresse et les menus.
  3. Largeur ≥ 992 px puis 375 px.
- **Attendu** :
  - Redirection automatique vers `/tenant` (via `/dashboard`) ; titre « Tableau de bord ».
  - Navigation du portail (barre d'onglets, éventuellement accompagnée d'un menu selon la largeur) : **Accueil**, **Payer**, **Incidents**, **Mon bail**, puis menu **Plus** : **Notifications**, **Messagerie**. Aucun menu d'agence (Baux, Finance, CRM…).
  - Aucune erreur rouge dans la console.
- **Gravité si échec** : Bloquant

### GL-11-004 — Connexion refusée et mot de passe oublié

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : compte de T1 actif.
- **Données** : mot de passe erroné `Mauvais-1234!`.
- **Étapes** :
  1. Se connecter avec un mauvais mot de passe.
  2. Cliquer **Mot de passe oublié ?**, saisir l'e-mail de T1, valider ; lire l'e-mail reçu ; définir un nouveau mot de passe.
  3. Se reconnecter avec le nouveau.
- **Attendu** :
  - Mauvais mot de passe : message d'identifiants invalides (libellé à confirmer), pas de détail sur l'existence du compte.
  - Mot de passe oublié : message neutre identique que l'adresse existe ou non ; e-mail avec lien ; la reconnexion fonctionne.
- **Gravité si échec** : Majeur

### GL-11-005 — Locataire sans bail actif

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : un locataire (T3 par exemple) dont le seul bail est **brouillon, suspendu ou terminé** (fichier 02).
- **Données** : compte de T3.
- **Étapes** :
  1. Se connecter avec le compte de T3.
  2. Visiter Accueil, Payer, Mon bail, Incidents.
- **Attendu** :
  - Connexion possible ; chaque écran affiche un bandeau « Erreur » avec le message « Aucun bail actif trouvé. » (réponse 403 du portail), sans écran blanc.
  - Le message est en français même en anglais/arabe (voir fichier 14).
  - Aucune donnée d'un autre locataire n'apparaît.
- **Gravité si échec** : Majeur

### GL-11-006 — Mauvais portail et non connecté

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A, PUBLIC
- **Préconditions** : sessions séparées (fenêtres distinctes).
- **Données** : adresses `/owner`, `/tenant`, `/copropriete`, `/tenant/lease`.
- **Étapes** :
  1. LOCATAIRE_PORTAIL tape `/owner`, puis `/copropriete`.
  2. ADMIN_A (collaborateur) tape `/tenant` et `/tenant/lease`.
  3. PUBLIC (non connecté) tape `/tenant/payments`, se connecte, observe la destination.
- **Attendu** :
  - Locataire sur `/owner` : redirigé vers `/tenant`. Sur `/copropriete` : accès à l'espace copropriétaire seulement s'il y est invité, sinon écran explicatif.
  - Collaborateur sur `/tenant` : redirigé vers `/dashboard` (aucun contenu locataire).
  - Non connecté : redirigé vers `/login?redirect=%2Ftenant%2Fpayments` ; après connexion de T1, retour sur `/tenant/payments`.
- **Gravité si échec** : Majeur

### GL-11-007 — Co-locataire : même bail, mêmes échéances

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : un co-locataire ajouté au bail R1 par ADMIN_A (fichier 02) avec son propre compte ; co-locataire = LOCATAIRE_PORTAIL_2 pour ce cas uniquement (sinon utiliser un contact dédié `REC-GL Co-locataire`).
- **Données** : co-locataire du bail R1.
- **Étapes** :
  1. Se connecter avec le co-locataire.
  2. Comparer Accueil, Mon bail, Payer avec ceux de T1.
  3. Retirer le co-locataire du bail côté agence, recharger.
- **Attendu** :
  - Le co-locataire voit le bail R1, les mêmes échéances et paiements que T1 (même bail) ; Mon bail liste « Co-locataires » avec nom et e-mail de chaque co-locataire.
  - Après retrait : « Aucun bail actif trouvé. » pour ce compte.
- **Gravité si échec** : Majeur

### GL-11-008 — Locataire client de deux agences : sélecteur d'agence

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : le même compte (e-mail de T1) est aussi locataire d'un bail actif de l'agence B (créé par ADMIN_B avec le même contact e-mail) ; sinon « non testable ».
- **Données** : agences A et B.
- **Étapes** :
  1. Connecté en T1, repérer le sélecteur **Changer d'agence** de l'en-tête (invisible pour un compte d'une seule agence).
  2. Comparer Accueil, Payer et Mon bail pour chaque agence ; changer d'agence plusieurs fois, F5 entre deux.
  3. Faire désactiver le bail de T1 dans l'agence A (statut Terminé) puis rouvrir le portail.
- **Attendu** :
  - Le sélecteur propose A et B ; au changement, l'application revient au tableau de bord et vide les données en mémoire : aucune donnée de l'autre agence ne reste affichée, même brièvement ; chaque agence montre uniquement son bail, ses échéances et ses paiements.
  - Les requêtes portent l'en-tête d'agence choisie ; l'agence par défaut sans choix est la plus ancienne agence non suspendue du client.
  - **Point de vigilance** : si l'agence par défaut n'a plus de bail actif alors que l'autre en a un, l'accès sans choix explicite répond « Aucun bail actif trouvé. » au lieu de basculer sur l'agence qui en a un ; le sélecteur permet de contourner (Mineur).
- **Gravité si échec** : Majeur

---

## B. Accueil (tableau de bord)

### GL-11-010 — Informations du bail et cohérence avec l'agence

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : bail R1 actif, début 01/10/2026, sans date de fin.
- **Données** : —
- **Étapes** :
  1. Ouvrir **Accueil**.
  2. Comparer avec la fiche du bail R1 côté agence (fichier 02).
- **Attendu** :
  - Carte « Informations du bail » : Adresse = adresse du bien ; Loyer mensuel **200 000 FCFA** ; Charges **20 000 FCFA** ; Date de début « 1 octobre 2026 » (format long de la langue) ; Date de fin « Non définie » ; Statut « Actif » (étiquette verte).
  - Les montants sont écrits sans retour à la ligne entre le nombre et la devise.
- **Gravité si échec** : Majeur

### GL-11-011 — Retard des échéances

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : R2 d'octobre partiellement payée (60 000 sur 100 000), échéance du 05/10 dépassée ; la tâche de 02:00 est passée ou non (noter l'état).
- **Données** : —
- **Étapes** :
  1. Connecté en T2, ouvrir **Accueil**.
  2. Relever la carte « Retard des échéances ».
  3. Comparer avec la liste Payer › Échéances.
- **Attendu** :
  - Si l'échéance est « En retard » : compteur 1, texte « 1 échéance en retard », chiffre rouge. Si elle est « Partiel » (statut conservé) : compteur 0 « Aucune échéance en retard » alors que 40 000 FCFA sont dus après la date → **écart à signaler** (la carte ne compte que les échéances « En retard »).
  - Avec plusieurs retards : « N échéances en retard ».
- **Gravité si échec** : Majeur

### GL-11-012 — Prochaine échéance et reste dû

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : même situation (échéance d'octobre de R2 payée à 60 %).
- **Données** : —
- **Étapes** :
  1. Lire la carte « Prochaine échéance ».
  2. Faire un paiement complémentaire de 10 000 côté agence (fichier 06), recharger.
- **Attendu** :
  - La carte affiche la **plus ancienne échéance non soldée** : montant = **reste dû** (40 000 FCFA), date et période (`2026-10`) ; sous le montant : « Reste dû : 60 000 FCFA déjà réglés sur 100 000 FCFA » (libellé du produit : le texte donne le déjà-réglé et le total).
  - Après 10 000 supplémentaires : montant 30 000 ; « 70 000 … sur 100 000 ».
  - Aucune échéance non soldée : montant 0 et « Aucune échéance à venir ».
- **Gravité si échec** : Majeur

### GL-11-013 — Dépôt de garantie sur l'accueil

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : dépôt de R1 attendu 400 000 FCFA ; collecte partielle puis totale côté agence (fichier 06 ou 07).
- **Données** : collecte de 200 000 puis 200 000.
- **Étapes** :
  1. Lire la carte « Dépôt de garantie » avant collecte, après 200 000, après 400 000.
  2. Sur un bail sans dépôt, relire la carte (T2 si R2 n'a pas de dépôt).
- **Attendu** :
  - Avant : « 0 FCFA / 400 000 FCFA » et « Montant versé / Montant total » ; après 200 000 : « 200 000 FCFA / 400 000 FCFA » ; après 400 000 : « 400 000 … », texte « Dépôt effectué », valeur en vert.
  - Bail sans dépôt : « Aucun dépôt configuré ».
- **Gravité si échec** : Majeur

### GL-11-014 — Paiements récents et état vide

- **Rôle** : LOCATAIRE_PORTAIL, LOCATAIRE_PORTAIL_2
- **Préconditions** : T1 a au moins un paiement réussi ; un locataire sans paiement (T3 ou nouveau bail).
- **Données** : —
- **Étapes** :
  1. Lire « Paiements récents » (T1).
  2. Même carte pour le locataire sans paiement.
- **Attendu** :
  - T1 : jusqu'à 5 paiements les plus récents, chacun avec montant, étiquette de méthode (« Espèces », « Virement bancaire », « Chèque », « Mobile Money », « Prélèvement bancaire ») et date longue ; le paiement de 220 000 FCFA du 8 octobre est présent.
  - Sans paiement : « Aucun paiement récent ».
  - Seuls les paiements **réussis** sont listés (pas les paiements annulés ou en échec).
- **Gravité si échec** : Majeur

### GL-11-015 — Résumé de maintenance

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : au moins un ticket déclaré par T1 (voir section I).
- **Données** : —
- **Étapes** :
  1. Lire la carte « Résumé maintenance » avant puis après la création d'un ticket (GL-11-100) et après sa résolution côté agence.
- **Attendu** :
  - Compteurs « Total », « Ouverts » (déclarés), « En cours » (en cours ou assignés), « Résolus » cohérents avec la liste Incidents ; un ticket annulé compte dans Total seulement.
- **Gravité si échec** : Mineur

### GL-11-016 — Bouton « Payer en ligne » sur l'accueil

- **Rôle** : LOCATAIRE_PORTAIL, LOCATAIRE_PORTAIL_2
- **Préconditions** : paiement en ligne activé pour l'agence (mode simulé) ; T1 avec échéance à payer ; T2 avec une échéance **partiellement payée** (statut « Partiel »).
- **Données** : —
- **Étapes** :
  1. T1 : ouvrir l'accueil.
  2. T2 : ouvrir l'accueil.
  3. Désactiver le paiement en ligne côté agence (Paramétrage), recharger T1 ; réactiver.
- **Attendu** :
  - T1 : bouton **Payer en ligne** en haut à droite ; il mène à `/tenant/payments`. Désactivé côté agence : le bouton disparaît.
  - T2 : le bouton est attendu puisque 30 000 à 40 000 FCFA restent dus. **Point de vigilance** : le solde de l'accueil ignore les échéances « Partiel » (règle de calcul : échéances « Dû » et « En retard » seulement) ; si le bouton manque alors que l'onglet Payer montre un solde positif, noter l'anomalie (Majeur).
- **Gravité si échec** : Majeur

### GL-11-017 — Accueil sans aucune échéance

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : un bail neuf (R4 à créer, fichier 02) sans échéances générées.
- **Données** : —
- **Étapes** :
  1. Se connecter avec le locataire du bail neuf et ouvrir l'accueil et **Payer**.
- **Attendu** :
  - Accueil : retard 0, « Aucune échéance à venir », dépôt « Aucun dépôt configuré » si aucun, « Aucun paiement récent », maintenance à 0 ; pas de NaN, pas de « undefined ».
  - Payer : cartes de synthèse à 0 et « Aucune échéance trouvée ».
- **Gravité si échec** : Mineur

---

## C. Mon bail

### GL-11-020 — Détail du bail

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : bail R1 ; notes du bail « REC-GL note interne visible ? » (champ Notes du bail rempli côté agence).
- **Données** : —
- **Étapes** :
  1. Menu **Mon bail** (`/tenant/lease`).
  2. Comparer chaque ligne avec la fiche du bail côté agence.
- **Attendu** :
  - Titre « Mon bail », sous-titre « Détails complets de votre contrat de location » ; carte « Informations du bail » : Numéro de bail (BAIL-AAAA-NNNN), Nom du bail (si renseigné), Adresse, Statut, Date de début, Date de fin, Date d'emménagement, Loyer mensuel 200 000, Charges 20 000, Dépôt de garantie 400 000, Fréquence de facturation « Mensuel », Jour d'échéance « Le 5 de chaque mois », Notes.
  - **Vigilance** : le champ Notes du bail est visible du locataire ; si des notes internes de l'agence y figurent, c'est une fuite d'information (Majeur) ; le préciser à l'agence.
- **Gravité si échec** : Majeur

### GL-11-021 — Locataire principal, propriétaire, co-locataires

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : bail R1 avec propriétaire P1 et un co-locataire.
- **Données** : —
- **Étapes** :
  1. Lire les cartes « Locataire principal », « Propriétaire », « Co-locataires ».
- **Attendu** :
  - Locataire principal : nom et e-mail de T1. Propriétaire : nom de P1 (ou nom tiré de l'adresse e-mail si le nom est vide). Co-locataires : nom et e-mail de chacun, ou carte absente s'il n'y en a pas.
  - **Vigilance (confidentialité)** : le locataire voit l'e-mail du propriétaire et des co-locataires ; confirmer que c'est voulu par l'agence, sinon Mineur.
- **Gravité si échec** : Mineur

### GL-11-022 — Documents du bail et téléchargement

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : ADMIN_A a généré un contrat de bail et une quittance pour R1 (fichier 06 ou 02) ; un document a été annulé (statut Annulé).
- **Données** : —
- **Étapes** :
  1. Descendre à la carte « Documents » de **Mon bail**.
  2. Cliquer **Télécharger** sur le contrat, puis sur la quittance.
  3. Ouvrir les fichiers.
- **Attendu** :
  - Chaque document : titre ou numéro (sinon « Document xxxxxxxx »), type (« Contrat de bail », « Quittance de loyer », « Reçu de dépôt », « Relevé », « Avenant », « Quittance »), « Émis le … » ; le document annulé n'apparaît pas.
  - Le téléchargement produit un PDF lisible, au nom `document-<id>.pdf` côté navigateur ; en cas d'échec : « Erreur lors du téléchargement du document ».
  - Aucun document d'un autre bail.
- **Gravité si échec** : Majeur

---

## D. Payer : échéances et historique

### GL-11-030 — Liste des échéances et cartes de synthèse

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : bail R2 avec échéances générées (une facturée et partiellement payée, les suivantes à venir).
- **Données** : —
- **Étapes** :
  1. Menu **Payer** (`/tenant/payments`), onglet **Échéances**.
  2. Lire les cartes « Total échéances », « Payées », « En attente », « En retard » puis le tableau.
  3. Trier les colonnes Date d'échéance, Montant total, Payé, Solde.
- **Attendu** :
  - Titre « Paiements et échéances » ; colonnes Période (`AAAA-MM`), Date d'échéance, Montant total, Payé, Solde (en rouge si positif), Statut, Actions (**Payer** si solde > 0, **Détails**).
  - Octobre : montant total 100 000, payé 60 000, solde 40 000, statut « Partiel » ou « En retard » (jamais « Payé ») ; les cartes comptent chaque échéance une seule fois.
  - Pas de carte « Partiel » dédiée : une échéance partielle n'est comptée ni dans « Payées », ni dans « En attente », ni « En retard » tant qu'elle reste « Partiel » → noter si les totaux des cartes ne s'additionnent pas.
  - Pagination « Total: N échéances » (20 par page).
- **Gravité si échec** : Majeur

### GL-11-031 — Filtres de la liste des échéances

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : échéances R1 de statuts variés (payée, à payer, brouillon).
- **Données** : statut « En retard » ; plage du 01/10/2026 au 31/10/2026.
- **Étapes** :
  1. Filtrer par statut **En retard**, puis **Payé**, puis **Brouillon**.
  2. Choisir la plage de dates, puis **Réinitialiser**.
- **Attendu** :
  - Chaque filtre ne montre que les lignes du statut demandé ; la plage restreint par date d'échéance ; **Réinitialiser** restaure la liste.
  - **Point de vigilance** : le filtre agit sur le statut **stocké** alors que le tableau affiche un statut recalculé ; une ligne affichée « En retard » mais stockée « Brouillon » ou « À payer » ne sort pas dans le filtre « En retard » → Mineur à noter.
  - Aucune erreur 500.
- **Gravité si échec** : Mineur

### GL-11-032 — Détail d'une échéance

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : échéance d'octobre de R1 payée en totalité.
- **Données** : —
- **Étapes** :
  1. Cliquer **Détails** sur la ligne d'octobre.
  2. Lire toutes les sections de la fenêtre « Détails de l'échéance ».
- **Attendu** :
  - Informations : Bail, Propriété, Période, Date d'échéance, Statut « Payé » ; éléments : Loyer 200 000, Charges de service 20 000 (« Autres frais » s'il y en a) ; financier : Total dû 220 000, Montant payé 220 000, Reste à payer 0 ; « Historique des paiements » avec date, méthode « Espèces », montant 220 000, statut « Réussi » et montant alloué ; « Pénalités appliquées » vide.
  - Échéance introuvable (cas d'un lien forgé) : « Échéance introuvable ».
- **Gravité si échec** : Majeur

### GL-11-033 — Échéance annulée ou non facturée côté agence

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : une échéance future de R1 **annulée** par ADMIN_A (fichier 06) et une échéance future encore au statut Brouillon (non facturée).
- **Données** : —
- **Étapes** :
  1. Recharger **Payer › Échéances** et repérer ces deux lignes.
  2. Lire leur statut et les boutons proposés.
- **Attendu** :
  - Attendu métier : une échéance annulée n'est plus due (statut « Annulé », pas de bouton Payer) ; une échéance non encore facturée n'est pas proposée au paiement.
  - **Points de vigilance (anomalies probables)** : le calcul d'affichage remet une échéance annulée en « Dû » ou « En retard » et propose **Payer** ; une échéance brouillon future s'affiche « Dû » avec **Payer**. Si c'est le cas : Majeur (le locataire est invité à régler une dette qui n'existe pas).
- **Gravité si échec** : Majeur

### GL-11-034 — Pénalité de retard visible par le locataire

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : pénalité calculée sur l'échéance d'octobre de R2 (fichier 07 : taux et délai de grâce connus).
- **Données** : —
- **Étapes** :
  1. Payer › Échéances : lire le montant total de l'échéance d'octobre.
  2. Ouvrir **Détails** : sections Pénalités.
- **Attendu** :
  - Montant total = loyer + charges + pénalité ; section « Pénalités appliquées » avec montant, date d'application et raison ; le solde intègre la pénalité.
  - Une pénalité supprimée ou réduite par l'agence se reflète après rechargement.
- **Gravité si échec** : Majeur

### GL-11-035 — Historique des paiements : lignes, filtres, allocations

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : paiements réussis de R1 ; un paiement non affecté ou partiellement affecté (avance) si disponible ; une déclaration en attente (GL-11-050).
- **Données** : filtre Méthode « Espèces » ; plage de dates.
- **Étapes** :
  1. Onglet **Historique des paiements**.
  2. Déplier un paiement (flèche de ligne).
  3. Appliquer les filtres puis **Réinitialiser**.
- **Attendu** :
  - Colonnes Date, Montant, Méthode, Référence, Statut (« Réussi », « En attente », « Rejetée »), Alloué, Non alloué ; les déclarations portent la mention « (déclaration) » à côté de la date.
  - Ligne dépliée : tableau Échéance, Date d'échéance, Montant alloué, ou « Aucune allocation ».
  - Bas de page : « Total payé (tous les paiements) » = somme des paiements réussis (220 000 pour T1 seul) ; pagination « Total: N élément(s) (paiements et déclarations) ». Vide : « Aucun paiement trouvé ».
  - **Vigilance** : avec le filtre Méthode ou dates, les **déclarations** restent affichées (elles ne sont pas filtrées) → Mineur ; un paiement annulé ou en échec s'affiche avec son statut brut anglais (ex. CANCELED) → Cosmétique.
- **Gravité si échec** : Majeur

### GL-11-036 — Onglet « Mon relevé »

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : paiements et facturation de R1 ; relevé de compte du locataire côté agence (Finance › Facturation et balances › Balance clients).
- **Données** : —
- **Étapes** :
  1. Onglet **Mon relevé** : lire Compte, « Solde d'ouverture », « Solde de clôture » et les mouvements (Date, Nature, Libellé, Facturé, Réglé, Solde après).
  2. Comparer avec la ligne du locataire dans la balance clients de l'agence et son relevé.
- **Attendu** :
  - Le solde de clôture est égal au solde de la balance clients pour T1 (une échéance ne compte qu'à sa date d'exigibilité) ; aucun mouvement d'un autre locataire.
  - Aucun bouton d'impression ni d'action (lecture seule). Vide : « Aucun mouvement enregistré. »
  - Si le profil n'est relié à aucun compte : « Aucun compte rattaché ».
- **Gravité si échec** : Majeur

---

## E. Déclaration de paiement (paiement hors ligne) et suivi

### GL-11-050 — Déclarer un paiement sur une échéance (espèces)

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : échéance de novembre de R1 (220 000 FCFA) facturée et non payée ; aucune déclaration en cours.
- **Données** : montant proposé 220 000 ; date du jour ; méthode Espèces ; référence `REC-GL-ESP-001` ; notes « Remis au gardien ».
- **Étapes** :
  1. **Payer** › onglet Échéances › ligne novembre › bouton **Payer**.
  2. Lire le titre « Déclarer un paiement — échéance 2026-11 » et les valeurs par défaut (montant = solde, date = aujourd'hui, méthode = Espèces).
  3. Saisir référence et notes, cliquer **Déclarer le paiement**.
  4. Ouvrir l'onglet **Historique des paiements**.
- **Attendu** :
  - Message « Déclaration de paiement créée avec succès. Elle est en attente d'approbation par le gestionnaire. » ; la fenêtre se ferme.
  - Historique : une ligne « (déclaration) », montant 220 000, méthode Espèces, référence `REC-GL-ESP-001`, statut **En attente**, Alloué 0, Non alloué 220 000.
  - L'échéance reste « Dû » avec son solde de 220 000 tant que l'agence n'a pas approuvé (la déclaration n'est pas un paiement).
  - Réseau : `POST /api/portal/tenant/payments/declare` → 201 ; la réponse n'expose pas le fichier de justificatif.
- **Gravité si échec** : Bloquant

### GL-11-051 — Déclaration Mobile Money avec justificatif

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : échéance d'octobre de R2 avec 40 000 FCFA dus ; une capture `preuve.png` (< 5 Mo) et un fichier `preuve.pdf`.
- **Données** : montant 40000 ; méthode Mobile Money ; téléphone `0700000000` ; opérateur Wave ; référence `REC-GL-WAVE-77` ; justificatif `preuve.png`.
- **Étapes** :
  1. **Payer** › ligne d'octobre › **Payer**.
  2. Choisir « Mobile Money » : les champs « Numéro de téléphone (transaction) » et « Opérateur mobile » apparaissent.
  3. Remplir, joindre `preuve.png` avec **Télécharger un fichier**, valider.
  4. Refaire avec `preuve.pdf` pour une seconde déclaration et vérifier que seul le dernier fichier choisi est conservé.
- **Attendu** :
  - Message de succès identique à GL-11-050 ; ligne « (déclaration) » en attente avec référence `REC-GL-WAVE-77`.
  - Côté agence (Encaisser › Paiements › **Déclarations en attente**), la déclaration affiche déclarant, montant, date, méthode, téléphone, opérateur et un accès au justificatif (cas GL-06-… du fichier 06) ; le justificatif n'est jamais accessible au locataire par une adresse publique.
- **Gravité si échec** : Majeur

### GL-11-052 — Validations de la fenêtre de déclaration

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : fenêtre « Déclarer un paiement » ouverte (bouton de l'en-tête, sans échéance).
- **Données** : montant vide, 0 ; date de demain ; Mobile Money sans téléphone ni opérateur ; téléphone de 51 caractères ; fichier `virus.exe` ; fichier image de 6 Mo ; notes de 1001 caractères.
- **Étapes** :
  1. Valider avec le montant vide, puis 0.
  2. Ouvrir le sélecteur de date : tenter demain.
  3. Mobile Money sans téléphone, sans opérateur ; puis téléphone trop long.
  4. Joindre `virus.exe`, puis l'image de 6 Mo.
  5. Saisir 1001 caractères dans les notes.
- **Attendu** :
  - « Le montant est requis » ; 0 : « Le montant doit être positif » (ou saisie bloquée au minimum) ; les dates futures sont grisées.
  - « Le numéro de téléphone ayant servi à la transaction est requis » ; « L'opérateur mobile est requis » ; « Le numéro ne peut pas dépasser 50 caractères ».
  - `virus.exe` : « Vous ne pouvez télécharger que des images ou des PDF! » ; 6 Mo : « Le fichier doit être inférieur à 5MB! » ; le fichier n'est pas retenu.
  - Notes > 1000 caractères : refus serveur « Les notes ne peuvent pas dépasser 1000 caractères. » (400), jamais 500.
  - Annuler (**Annuler**) ferme sans rien créer.
- **Gravité si échec** : Mineur

### GL-11-053 — Montant supérieur au solde, montant énorme, double clic

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : échéance de décembre de R1 facturée (220 000).
- **Données** : 500 000 ; 999 999 999 999 ; double clic.
- **Étapes** :
  1. Déclarer 500 000 sur l'échéance de décembre.
  2. Déclarer 999 999 999 999 (sans échéance).
  3. Déclarer 1 000 en double-cliquant sur **Déclarer le paiement**.
  4. F5 juste après.
- **Attendu** :
  - 500 000 : accepté en attente (la spécification autorise un montant supérieur au solde, à vérifier ensuite par l'agence).
  - 999 999 999 999 dépasse la capacité du champ (12 chiffres dont 2 décimales, soit 9 999 999 999,99 maximum) : refus **clair** (message de montant trop élevé) ; si l'écran répond « Erreur lors de la déclaration du paiement » ou une erreur 500, noter l'anomalie (Majeur : aucune borne côté serveur).
  - Double clic : une seule déclaration de 1 000 ; F5 : pas de doublon, historique identique.
- **Gravité si échec** : Majeur

### GL-11-054 — Approbation par l'agence : ce que voit le locataire

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL
- **Préconditions** : déclaration de 220 000 sur novembre (GL-11-050) en attente.
- **Données** : notes de révision « Reçu en main propre REC-GL ».
- **Étapes** :
  1. ADMIN_A : **Encaisser › Paiements › Déclarations en attente** › **Approuver** › fenêtre « Approuver la déclaration de paiement » (choisir le compte de trésorerie, notes optionnelles) › **Approuver**.
  2. LOCATAIRE_PORTAIL : recharger Accueil, Payer (échéances, historique, relevé) et ouvrir la liste des notifications.
- **Attendu** :
  - Côté locataire : la ligne « (déclaration) » en attente disparaît et un **paiement** « Réussi » de 220 000 apparaît (sans doublon) avec une allocation vers l'échéance de novembre ; l'échéance passe **Payé**, solde 0 ; « Paiements récents » de l'accueil l'affiche ; le relevé montre un règlement de 220 000 ; « Total payé » augmente de 220 000.
  - Une quittance peut être générée côté agence (fichier 06) et apparaît dans **Documents** après rechargement.
  - Une notification peut apparaître (cloche ou page **Notifications**) ; noter si elle est envoyée (libellé à confirmer).
  - Approuver deux fois la même déclaration (deux onglets) : un seul paiement créé (le second reçoit une erreur).
- **Gravité si échec** : Bloquant

### GL-11-055 — Rejet par l'agence : ce que voit le locataire

- **Rôle** : ADMIN_A, puis LOCATAIRE_PORTAIL
- **Préconditions** : déclaration de 40 000 (R2, Wave) en attente.
- **Données** : raison du rejet « Justificatif illisible REC-GL ».
- **Étapes** :
  1. ADMIN_A : **Déclarations en attente** › **Rejeter** › « Rejeter la déclaration de paiement » : laisser la raison vide (bouton ou champ obligatoire), puis saisir la raison et confirmer.
  2. LOCATAIRE_PORTAIL_2 : Payer › Historique des paiements.
- **Attendu** :
  - Raison vide refusée (« Raison du rejet (obligatoire) »).
  - Côté locataire : la ligne « (déclaration) » passe à **Rejetée** (étiquette rouge) ; l'échéance reste à 40 000 dus ; aucun paiement créé.
  - **Vigilance** : la raison du rejet saisie par l'agence n'est pas renvoyée au locataire par le portail ; le locataire ne sait pas pourquoi. À signaler (Mineur) si c'est le cas ; l'agence doit alors le prévenir par la Messagerie.
- **Gravité si échec** : Majeur

### GL-11-056 — Déclaration sans échéance puis rattachement par l'agence

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : —
- **Données** : montant 50000, méthode Virement bancaire, référence `REC-GL-VIR-50K`.
- **Étapes** :
  1. En-tête de Payer : bouton **Déclarer un paiement** (sans choisir d'échéance) ; déclarer 50 000.
  2. ADMIN_A approuve (sans affecter) puis alloue (fichier 06).
- **Attendu** :
  - Titre de la fenêtre sans échéance ; la déclaration est enregistrée « générale ».
  - Après approbation : paiement « Réussi » avec **Non alloué 50 000** jusqu'à affectation, puis Alloué 50 000 sur l'échéance choisie par l'agence ; le locataire voit l'avance puis l'affectation.
- **Gravité si échec** : Majeur

---

## F. Paiement en ligne (mode simulé) et liens de paiement publics

### GL-11-060 — Disponibilité du paiement en ligne

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : paiement en ligne **activé** puis **désactivé** dans les paramètres de l'agence (Paramétrage, carte de la passerelle de paiement) ; mode Simulateur.
- **Données** : —
- **Étapes** :
  1. Activé : ouvrir **Payer › Échéances**.
  2. Désactivé : recharger.
- **Attendu** :
  - Activé : bandeau « Mode démonstration » (si simulateur), cases à cocher à gauche de chaque échéance avec solde, texte « Sélectionnez une ou plusieurs échéances à régler en ligne. », bouton **Payer en ligne** désactivé tant que rien n'est coché ; échéance soldée : case grisée.
  - Désactivé : ni cases, ni bouton, ni bandeau ; l'onglet reste utilisable.
- **Gravité si échec** : Majeur

### GL-11-061 — Payer en ligne deux échéances (simulateur)

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : environnement en mode **Simulateur** (sinon ne pas exécuter) ; échéances de décembre et janvier de R1 facturées.
- **Données** : décembre (220 000) + janvier (220 000).
- **Étapes** :
  1. Cocher les deux échéances : lire « Total à payer : 440 000 FCFA » et, si les frais sont à la charge du client, « Des frais de l'agrégateur de paiement peuvent s'ajouter au montant. »
  2. Cliquer **Payer en ligne** (une seule fois).
  3. Sur la page du simulateur, valider un paiement réussi, puis revenir sur le portail.
- **Attendu** :
  - Redirection vers la page de paiement hébergée (simulateur) ; retour sur `/tenant/payments?paiement=IMT-…`.
  - Un bandeau « Vérification du paiement en cours… » devient « Paiement confirmé. » en moins de 60 secondes ; le paramètre `paiement` disparaît de l'adresse ; la liste se met à jour (échéances Payé) ; l'historique contient un paiement « Réussi » de 440 000 réparti sur deux échéances.
  - Si la confirmation dépasse 60 secondes : « En cours de confirmation… » et le message « Le paiement met plus de temps que prévu à se confirmer. Il apparaîtra automatiquement dans votre historique dès sa confirmation. »
  - Réseau : `POST /api/portal/tenant/online-payments` → 201 avec `checkoutUrl` ; suivi `GET …/online-payments/<code>`.
- **Gravité si échec** : Bloquant

### GL-11-062 — Paiement en ligne annulé, échoué, déjà en cours

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : mode Simulateur ; échéance de février de R1 facturée.
- **Données** : —
- **Étapes** :
  1. Démarrer un paiement en ligne et l'**annuler** sur la page du simulateur ; revenir.
  2. Démarrer un autre paiement et le faire **échouer** (option du simulateur).
  3. Démarrer un paiement sur février, **ne pas finir**, revenir sur Payer et recliquer **Payer en ligne** pour la même échéance.
  4. Saisir à la main dans l'adresse `?paiement=IMT-INVENTE12345678901234`.
- **Attendu** :
  - Annulé : « Le paiement a été annulé. » ; échoué : « Le paiement a échoué. » (avec le motif du prestataire s'il existe) ; l'échéance reste due.
  - Paiement déjà ouvert depuis moins de 15 minutes : l'application reprend le paiement existant (même page hébergée) au lieu d'en créer un second.
  - Code inventé : message d'erreur « Impossible de vérifier ce paiement. » (ou message serveur), pas de boucle infinie ni d'écran blanc.
- **Gravité si échec** : Majeur

### GL-11-063 — Page publique « Paiement du loyer » (lien envoyé par l'agence)

- **Rôle** : PUBLIC
- **Préconditions** : ADMIN_A a créé un lien de paiement pour l'échéance de mars de R1 (« Copier le lien » dans le détail de l'échéance, cas du fichier 06) ; fenêtre privée.
- **Données** : lien `…/payer#<jeton>`.
- **Étapes** :
  1. Ouvrir le lien.
  2. Lire la page ; cliquer **Payer maintenant** (mode simulé seulement) ; revenir par l'adresse de retour.
  3. F5 sur la page `/payer`.
- **Attendu** :
  - Page « Paiement du loyer » : nom de l'agence, période, échéance, **Montant dû** (reste dû recalculé, pénalités comprises, sans nom ni téléphone du locataire), « Moyens de paiement » (Wave, Orange Money, MTN Money, Moov Money) ; bandeau « Mode test » et « Ce paiement est simulé : aucun argent ne sera débité. »
  - Retour : page « Statut du paiement » (« Vérification du paiement… » puis « Paiement reçu » / « Merci, votre loyer est réglé. ») ; code `IMT-…` effacé de l'adresse.
  - F5 sur `/payer` : « Lien invalide ou expiré » (jeton retiré de l'adresse, comportement par conception à confirmer).
  - Un second clic sur « Payer maintenant » pendant un paiement ouvert : « Un paiement est déjà en cours pour cette échéance. Patientez quelques minutes puis réessayez. »
- **Gravité si échec** : Majeur

### GL-11-064 — Lien de paiement révoqué, inconnu ou échéance soldée

- **Rôle** : PUBLIC, ADMIN_A
- **Préconditions** : un lien actif sur l'échéance d'avril de R1 ; un lien sur une échéance déjà payée.
- **Données** : —
- **Étapes** :
  1. ADMIN_A révoque le lien d'avril (panneau « Lien de paiement Mobile Money » › **Révoquer**, « Révoquer ce lien ? » › **Révoquer**) ; message « Lien révoqué. »
  2. PUBLIC ouvre le lien révoqué, un lien au jeton modifié et le lien de l'échéance payée.
  3. Console : 31 appels rapides à `POST /api/public/secure-links/installment-payment`.
- **Attendu** :
  - Les trois cas : « Lien invalide ou expiré » avec le même 404 uniforme (rien ne distingue un jeton inconnu d'un jeton révoqué).
  - 31ᵉ appel : 429 ; message « Trop de tentatives, réessayez dans quelques minutes. »
  - L'état du lien côté agence passe à « Révoqué ».
- **Gravité si échec** : Majeur

---

## G. Dépôt de garantie

### GL-11-070 — Écran « Dépôt de garantie » (accès par adresse)

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : dépôt de R1 collecté en deux fois (200 000 + 200 000), puis une retenue de 30 000 FCFA et une libération côté agence (fichier 07), selon disponibilité.
- **Données** : adresse `/tenant/deposit` saisie dans la barre (aucun lien de menu ne mène à cet écran).
- **Étapes** :
  1. Saisir l'adresse ; lire « Informations sur votre dépôt de garantie » et « Détails du dépôt ».
  2. Lire l'historique des mouvements.
- **Attendu** :
  - Montant cible 400 000 ; Montant collecté 400 000 ; Montant retenu 30 000 ; Montant remboursé / confisqué / disponible cohérents (disponible = collecté − retenu − remboursé − confisqué) ; Devise ; Numéro de bail ; Nom du bail.
  - « Historique des mouvements » : lignes Date, Type (Collecte, Mise en retenue, Libération, Remboursement, Confiscation, Ajustement), Montant, Paiement associé, Échéance associée, Note, Créé par ; « Total: N mouvements » ; vide : « Aucun mouvement enregistré ».
  - Sans dépôt : « Aucun dépôt de garantie trouvé ».
  - Les valeurs sont celles de l'onglet Dépôt de garantie du bail côté agence.
  - **Écran sans entrée de menu** : à noter comme défaut de navigation (Mineur) ; l'accueil ne propose pas non plus de lien.
- **Gravité si échec** : Majeur

---

## H. Documents

### GL-11-080 — Écran « Documents » : liste, filtre, téléchargement

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : contrat de bail et quittance de R1 émis (statut Final) ; un document en Brouillon ; un document annulé.
- **Données** : adresse `/tenant/documents` ; filtre « Type de document » = Quittance de loyer.
- **Étapes** :
  1. Saisir l'adresse.
  2. Filtrer par type puis **Réinitialiser**.
  3. **Télécharger** un document.
- **Attendu** :
  - Titre « Documents », sous-titre « Accédez et téléchargez vos documents de location » ; chaque ligne : titre, type, statut (« Final », « Brouillon »), « Émis le … », bouton **Télécharger** ; message « Document téléchargé avec succès ».
  - Le document annulé n'apparaît jamais ; un brouillon est visible : **vigilance** (un brouillon de contrat visible du locataire avant finalisation est discutable → Mineur).
  - Filtre : seuls les documents du type choisi ; vide : « Aucun document trouvé ».
  - Aucun document d'un autre bail ni d'une autre agence.
- **Gravité si échec** : Majeur

### GL-11-081 — Téléchargement refusé : document d'un autre locataire

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : identifiant d'un document de R1 (récupéré dans le réseau du navigateur de T1).
- **Données** : `GET /api/portal/tenant/documents/<id du document de R1>/download` avec la session de T2.
- **Étapes** :
  1. Depuis la console de T2, exécuter le `fetch` avec cookies (`credentials:'include'`).
  2. Lire le statut et le corps.
- **Attendu** :
  - 404 « Document non trouvé ou accès refusé » ; aucun fichier ; pas de 500.
- **Gravité si échec** : Bloquant

---

## I. Incidents (maintenance)

### GL-11-100 — Créer une demande de maintenance liée au logement

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : bail actif ; une image `fuite.jpg` (< 5 Mo).
- **Données** : titre « REC-GL Fuite robinet » ; catégorie Plomberie ; priorité Haute ; description « Le robinet de la cuisine fuit depuis ce matin. » ; localisation « Cuisine, évier » ; une photo.
- **Étapes** :
  1. Menu **Incidents** (`/tenant/maintenance`) : lire « Gérez vos demandes de maintenance » et l'état vide « Aucun ticket trouvé ».
  2. Cliquer **Nouvelle demande** : fenêtre « Nouvelle demande de maintenance ».
  3. Remplir : Titre, Catégorie (Plomberie, Électricité, Climatisation, Autre), Priorité (Basse, Moyenne par défaut, Haute, Urgente), Description, « Détails de localisation (optionnel) », Photos.
  4. Cliquer **Créer le ticket**.
- **Attendu** :
  - Message « Ticket de maintenance créé avec succès » ; la liste affiche le ticket : titre, catégorie, priorité, statut **Déclaré**, date ; cartes « Total tickets » 1, « Ouverts » 1.
  - Le ticket est lié au **bien du bail R1** (propriété affichée dans le détail) et au bail ; côté agence (Maintenance) il apparaît avec le locataire comme déclarant.
  - Réseau : `POST /api/portal/tenant/maintenance` → 201.
- **Gravité si échec** : Majeur

### GL-11-101 — Validations de la demande de maintenance

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : fenêtre « Nouvelle demande de maintenance » ouverte.
- **Données** : champs vides ; titre de 201 caractères ; description de 5001 caractères ; fichier PDF comme photo ; image de 6 Mo ; 11 images.
- **Étapes** :
  1. Valider vide.
  2. Titre de 201 caractères, description de 5001, localisation de 501 caractères.
  3. Joindre un PDF, puis une image de 6 Mo, puis 11 images.
- **Attendu** :
  - « Le titre est requis », « La catégorie est requise », « La description est requise » ; la priorité est préremplie « Moyenne ».
  - Limites serveur : « Le titre ne peut pas dépasser 200 caractères. », description 5000, localisation 500 → 400 lisible.
  - PDF refusé : « Vous ne pouvez télécharger que des images! » ; 6 Mo : « Le fichier doit être inférieur à 5MB! » ; au plus 10 photos retenues.
- **Gravité si échec** : Mineur

### GL-11-102 — Détails, commentaires et suivi des statuts

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : ticket « REC-GL Fuite robinet » créé.
- **Données** : commentaire locataire « Toujours la fuite ce soir. » ; commentaire agence « Plombier assigné demain. » ; statut passé à Assigné puis Résolu côté agence.
- **Étapes** :
  1. Locataire : **Détails** du ticket, section « Ajouter un commentaire » : envoyer le commentaire.
  2. ADMIN_A : répondre au ticket, assigner, changer le statut (Maintenance, fichier hors périmètre mais requis).
  3. Locataire : recharger les détails.
  4. Filtrer la liste par statut (Déclaré, Assigné, En cours, Résolu, Annulé) puis **Réinitialiser**.
- **Attendu** :
  - Message « Commentaire ajouté avec succès » ; section « Commentaires (n) » mise à jour, « Aucun commentaire » au départ.
  - Les commentaires de l'agence et le nouveau statut apparaissent ; « Pièces jointes » listées avec téléchargement par une adresse du portail.
  - **Vigilance** : le détail renvoie des champs de l'agence (coûts, prestataire avec téléphone et e-mail, e-mail du gestionnaire) ; vérifier dans le réseau qu'aucun **coût interne** n'est exposé au locataire (Mineur si oui).
  - Le ticket n'apparaît que chez les locataires du même bail (co-locataires) ou rattachés par leur fiche contact.
- **Gravité si échec** : Majeur

### GL-11-103 — Ticket d'un autre locataire : lecture, commentaire, pièce jointe

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : identifiants du ticket et d'une pièce jointe de T1 relevés dans le réseau.
- **Données** : `<ticketId de T1>`, `<attachmentId>`.
- **Étapes** :
  1. Console de T2 : `GET /api/portal/tenant/maintenance/<ticketId>` ; `POST …/maintenance/<ticketId>/comment` avec `{comment:'REC-GL intrusion'}` ; `GET …/maintenance/<ticketId>/attachments/<attachmentId>`.
  2. Même chose avec un identifiant mal formé (`abc`).
- **Attendu** :
  - Trois réponses 404 « Ticket introuvable » (même réponse qu'un ticket inexistant) ; aucun commentaire créé chez T1 ; identifiant mal formé : 404 également, pas de 500.
- **Gravité si échec** : Bloquant

---

## J. Étanchéité entre locataires et entre agences

### GL-11-110 — Échéances et paiements d'un autre locataire

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : identifiant d'une échéance de R1 (réseau de T1) et d'un paiement de R1.
- **Données** : `<installmentId de R1>`.
- **Étapes** :
  1. Console de T2 : `GET /api/portal/tenant/installments/<installmentId de R1>`.
  2. `GET /api/portal/tenant/installments?page=1&limit=100` : chercher des lignes de R1.
  3. `GET /api/portal/tenant/payments` : chercher des paiements de R1.
- **Attendu** :
  - Étape 1 : 404 « Échéance non trouvée… » ; étapes 2 et 3 : uniquement les lignes de R2.
  - Aucune donnée de R1 (montants, noms) dans aucune réponse.
- **Gravité si échec** : Bloquant

### GL-11-111 — Déclarer un paiement sur l'échéance d'un autre locataire ou inexistante

- **Rôle** : LOCATAIRE_PORTAIL_2
- **Préconditions** : identifiant d'une échéance de R1.
- **Données** : corps multipart `amount=1000`, `paymentDate=<aujourd'hui>`, `paymentMethod=CASH`, `installmentId=<échéance de R1>` ; puis `installmentId=00000000-0000-4000-8000-000000000000`.
- **Étapes** :
  1. Console de T2 : `fetch('/api/portal/tenant/payments/declare', {method:'POST', body: formData, credentials:'include'})` pour chaque cas.
  2. Vérifier côté agence qu'aucune déclaration n'a été créée.
- **Attendu** :
  - Refus avec un code 404 (introuvable) ; **point de vigilance** : le refus remonte aujourd'hui avec le message « Échéance non trouvée ou non associée à ce bail » mais un code 500 → Mineur (code erroné, aucune fuite).
  - Aucune déclaration créée chez l'agence.
- **Gravité si échec** : Majeur

### GL-11-112 — En-tête d'agence forgé et accès aux écrans d'agence

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_B
- **Préconditions** : identifiant de l'agence B.
- **Données** : en-tête `X-Portal-Tenant-Id: <agence B>` ; adresses `/api/tenants/<A>/rental/leases`, `/api/tenants/<A>/owner-accounts`.
- **Étapes** :
  1. T1 : `GET /api/portal/tenant/dashboard` avec l'en-tête `X-Portal-Tenant-Id` de l'agence B.
  2. T1 : `GET /api/tenants/<A>/rental/leases` et `GET /api/tenants/<A>/owner-accounts`.
  3. T1 : saisir `/tenant/<A>/rental/leases` et `/tenant/<A>/finance/owner-accounts` dans la barre d'adresse.
- **Attendu** :
  - Étape 1 : 403 « Accès portail locataire refusé. » (T1 n'est pas client de B).
  - Étape 2 : 403 (aucun droit d'agence) ; aucun bail ni compte dans la réponse.
  - Étape 3 : écran « Aucune agence rattachée » (compte client sans appartenance à une agence), « Accès non autorisé » ou « Cette agence n’est pas la vôtre », sans aucune donnée.
- **Gravité si échec** : Bloquant

### GL-11-113 — Justificatifs de paiement non servis en statique

- **Rôle** : PUBLIC, LOCATAIRE_PORTAIL
- **Préconditions** : une déclaration avec justificatif (GL-11-051) existe.
- **Données** : adresses `/uploads/portal/payments/` et `/uploads/portal/payments/<id agence>/` (le nom exact du fichier n'est connu d'aucun écran).
- **Étapes** :
  1. Ouvrir ces adresses sur le serveur d'API, connecté et non connecté.
- **Attendu** :
  - 404 dans les deux cas ; aucun listing de dossier ; le justificatif ne sort que par la route authentifiée de l'agence.
- **Gravité si échec** : Bloquant

### GL-11-114 — Droit d'agence refusé au locataire ; compte collaborateur sur les routes du portail

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : sessions séparées.
- **Données** : routes `GET /api/portal/tenant/dashboard` (avec la session d'ADMIN_A) et `GET /api/tenants/<A>/rental/payments` (avec celle de T1).
- **Étapes** :
  1. Console d'ADMIN_A : appeler la route du portail locataire.
  2. Console de T1 : appeler la route d'agence.
- **Attendu** :
  - 403 « Accès portail locataire refusé. » pour le collaborateur sans fiche locataire.
  - 403 « Vous n'avez pas les droits nécessaires pour effectuer cette action. » pour le locataire.
- **Gravité si échec** : Bloquant

---

## K. Notifications et messagerie

### GL-11-120 — Notifications du locataire

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : un événement notifiable (approbation d'une déclaration, GL-11-054).
- **Données** : —
- **Étapes** :
  1. Menu **Plus › Notifications** (`/notifications`) ; cloche de l'en-tête.
  2. Cocher « Non lues seulement » ; cliquer sur une notification ; **Tout marquer comme lu**.
- **Attendu** :
  - Compteur de la cloche = notifications non lues ; liste affichée, lecture individuelle et globale effectives après rechargement.
  - Aucune notification d'un autre locataire.
  - Pas de notification : texte d'état vide (à confirmer).
- **Gravité si échec** : Mineur

### GL-11-121 — Messagerie avec l'agence

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : membres du personnel dans l'annuaire.
- **Données** : message « REC-GL Bonjour, question sur ma quittance. »
- **Étapes** :
  1. **Plus › Messagerie** (`/messages`) : **Nouvelle conversation**, choisir un membre du personnel par son nom, écrire le premier message.
  2. ADMIN_A répond depuis la messagerie de l'agence.
  3. Le locataire cherche un autre locataire dans l'annuaire.
- **Attendu** :
  - Conversation 1-à-1 avec un membre du personnel créée ; la réponse arrive et le compteur de non-lus évolue ; l'annuaire du locataire ne propose que le personnel (jamais un autre locataire, jamais un groupe).
  - Texte vide refusé ; message de plus de 5000 caractères refusé ; plus de 30 envois par minute : refus de débit.
- **Gravité si échec** : Mineur

---

## Couverture

| Sous-fonctionnalité du classeur (Portail locataire)                                                | Cas                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Tableau de bord (bail, solde, prochaine échéance, paiements récents, dépôt, maintenance)           | GL-11-003, 010 à 017                                                                                       |
| Consulter mon bail (détail, co-locataires, propriétaire, documents)                                | GL-11-007, 020, 021, 022                                                                                   |
| Consulter mes échéances (liste, filtres, détail, pénalités)                                        | GL-11-030 à 034, 110                                                                                       |
| Déclarer un paiement (hors ligne, justificatif)                                                    | GL-11-050 à 056, 111                                                                                       |
| Historique de mes paiements                                                                        | GL-11-035, 054                                                                                             |
| Payer en ligne : disponibilité                                                                     | GL-11-060                                                                                                  |
| Payer en ligne : démarrer et suivre un paiement                                                    | GL-11-061, 062                                                                                             |
| Consulter mon dépôt de garantie                                                                    | GL-11-013, 070                                                                                             |
| Consulter mon compte courant / relevé agence                                                       | GL-11-036                                                                                                  |
| Consulter mes documents (liste, téléchargement)                                                    | GL-11-022, 080, 081                                                                                        |
| Maintenance : créer, lister, détailler, commenter, pièces jointes                                  | GL-11-015, 100 à 103                                                                                       |
| Notifications persistantes du portail                                                              | GL-11-120                                                                                                  |
| Messagerie interne (liste, envoi, contact avec le personnel)                                       | GL-11-121                                                                                                  |
| Lien de paiement d'un loyer (page publique `/payer`)                                               | GL-11-063, 064                                                                                             |
| Page « Statut du paiement » (`/payer/statut`)                                                      | GL-11-063, 062                                                                                             |
| Accès du locataire : création du compte, mot de passe, connexion, redirections, sélecteur d'agence | GL-11-001 à 008                                                                                            |
| Approbation / rejet par l'agence vus du portail                                                    | GL-11-054, 055                                                                                             |
| Étanchéité (autre locataire, autre agence, fichiers privés)                                        | GL-11-081, 103, 110 à 114                                                                                  |
| Compte désactivé ou agence suspendue (403 immédiat)                                                | non testable par le locataire seul : action du super-administrateur ; à jouer si le superviseur le propose |
| Langue, mobile, clavier, erreurs réseau, injection                                                 | fichier 14                                                                                                 |
