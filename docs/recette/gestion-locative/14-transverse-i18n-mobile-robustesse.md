# 14 — Transverse : langues, mobile, robustesse, saisies hostiles

**Module** : Gestion locative — contrôles qui s'appliquent à **tous** les écrans locatifs (agence, portail locataire, portail propriétaire, pages publiques).

## Périmètre

- Bascule **fr → en → ar** : aucun texte non traduit visible, mise en page de droite à gauche (RTL) correcte en arabe, montants et dates formatés selon la langue.
- Affichage à **375 px** (téléphone) et **768 px** (tablette), navigation au clavier, zoom.
- Erreurs réseau (API arrêtée ou lente, erreur serveur), session expirée, deux onglets.
- Saisies hostiles : accents et caractères spéciaux, longs textes, balises HTML et scripts, formules de tableur, **montants très grands** (999 999 999 999), séparateurs de milliers, devise FCFA, fuseau horaire et dates en limite de mois.
- Console du navigateur sans erreur rouge sur chaque écran ; absence d'appels réseau en échec inattendus.

## Prérequis

- Fichiers 02, 06, 10, 11, 12 joués (données `REC-GL…`). Comptes : ADMIN_A, LOCATAIRE_PORTAIL (T1), PROPRIETAIRE_PORTAIL (P1), PUBLIC. Outils de développement du navigateur ouverts (onglets Console, Réseau, Émulation d'appareil, Capteurs pour le fuseau horaire).
- Commutateur de langue : bouton **Changer la langue** de l'en-tête (affiche FR / EN / ع), menu « Français », « English », « العربية » ; le choix est mémorisé (clef `immotopia.language` du stockage local) et suit le compte connecté.
- Les pages publiques (`/rapport-proprietaire`, `/payer`, `/payer/statut`) n'ont **pas** de commutateur : la langue vient du stockage local ou du navigateur ; pour les tester, la choisir avant depuis une page connectée du même navigateur.

## Liste de passage des écrans (utilisée aux cas GL-14-039 et 040)

| Espace            | Écrans (adresses)                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Agence (ADMIN_A)  | Baux `/tenant/<A>/rental/leases`, fiche et formulaire d'un bail, Échéances `…/rental/installments`, détail d'échéance, Paiements `…/rental/payments`, détail, Prélèvements `…/rental/direct-debit`, Relevés `…/patrimoine/statements` et détail, Comptes propriétaires `…/finance/owner-accounts` et détail, Commissions `…/finance/commissions`, Paramètres financiers `…/settings/finance`, carte Indivision d'un bien |
| Locataire (T1)    | `/tenant`, `/tenant/lease`, `/tenant/payments` (3 onglets, fenêtre de déclaration), `/tenant/maintenance` (fenêtre de création), `/tenant/deposit`, `/tenant/documents`, `/notifications`, `/messages`                                                                                                                                                                                                                   |
| Propriétaire (P1) | `/owner`, `/owner/properties`, fiche d'un bien, `/owner/leases`, détail d'un bail, `/owner/revenues`, `/owner/installments`, `/owner/payments`, `/owner/account`, `/owner/deposits`, `/owner/documents`, `/owner/reports`, `/owner/preferences`, `/owner/maintenance`, `/owner/patrimoine` et fiche                                                                                                                      |
| Public            | `/rapport-proprietaire#<jeton>`, `/payer#<jeton>`, `/payer/statut?paiement=IMT-…`                                                                                                                                                                                                                                                                                                                                        |

## Données créées par ce fichier

Contact `REC-GL Éléonore N'Guessan-Ångström & Fils « SARL »`, libellés et notes d'essai (injection HTML, longs textes), baux d'essai « jour d'échéance 31 », paiements et reversements de limite de mois, tickets d'essai ; tous préfixés `REC-GL` et à nettoyer en fin de recette.

---

## A. Langues : français, anglais, arabe

### GL-14-001 — Bascule fr → en sur les écrans d'agence

- **Rôle** : ADMIN_A
- **Préconditions** : relevé 2026-10 de P1 envoyé, compte de P1 avec reversement et annulation, commissions d'octobre.
- **Données** : écrans Relevés, détail du relevé, Comptes propriétaires, détail du compte (fenêtres « Nouveau reversement » et « Annuler ce reversement ? »), Commissions, Paramètres financiers.
- **Étapes** :
  1. Cliquer **Changer la langue** › **English**.
  2. Parcourir chaque écran et chaque fenêtre ; ouvrir aussi les listes déroulantes, les info-bulles, les messages de validation (déclencher une erreur de saisie) et les messages de réussite.
  3. Revenir sur **Français** et vérifier que tout redevient français sans rechargement manuel.
- **Attendu** :
  - Titres, boutons, colonnes, étiquettes de statut (Brouillon, Envoyé, Payé, Validé, Annulé…), messages de réussite et d'erreur, fenêtres de confirmation et textes d'aide sont en anglais ; aucune clef brute (`owner.statements…`) ni texte français résiduel, hors **données saisies** (noms, libellés, notes) et **lignes de relevé enregistrées en français par le serveur** (« Loyers encaissés », « Honoraires de gestion (10 %) », « TVA sur honoraires », « Retenue à la source ») : ces dernières restent en français quelle que soit la langue — à noter comme limite connue (Cosmétique).
  - Les messages d'erreur du serveur (« Le reversement dépasse le solde dû au propriétaire ») s'affichent en anglais.
  - Réseau : les appels portent l'en-tête de langue (`Accept-Language: en`).
- **Gravité si échec** : Mineur (Cosmétique pour un libellé isolé)

### GL-14-002 — Bascule en arabe : droite à gauche

- **Rôle** : ADMIN_A
- **Préconditions** : GL-14-001 passé.
- **Données** : mêmes écrans, en arabe.
- **Étapes** :
  1. **Changer la langue** › **العربية**.
  2. Contrôler : sens de lecture, menu latéral, fil d'Ariane, tableaux, boutons d'action, onglets, cartes de synthèse, fenêtres, formulaires, listes déroulantes, sélecteurs de dates.
  3. Lire un montant, un pourcentage et une date dans une phrase arabe.
- **Attendu** :
  - `<html dir="rtl" lang="ar">` ; menu à droite, colonnes et actions retournées (colonne « Actions » à gauche du tableau), icônes directionnelles inversées, étiquettes à droite des champs, aucune marge ou alignement physique à gauche forcé.
  - Chiffres en chiffres occidentaux (0-9), montants « 234 320 FCFA » lisibles et **non retournés** (le nombre reste dans l'ordre gauche-droite), pourcentages « 10 % » corrects, pas de texte coupé ni chevauchant.
  - Les noms propres latins (REC-GL Propriétaire Un) restent lisibles au milieu du texte arabe.
- **Gravité si échec** : Majeur (écran inutilisable) ; Cosmétique (défaut d'alignement isolé)

### GL-14-003 — Portail locataire en anglais et en arabe

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : paiements, déclaration en attente, ticket, documents.
- **Données** : écrans de la liste de passage « Locataire ».
- **Étapes** :
  1. En anglais puis en arabe, parcourir Accueil, Mon bail, Payer (Échéances, Historique, Mon relevé, fenêtre de déclaration), Incidents (fenêtre et détail), Dépôt de garantie, Documents.
  2. Relever tout texte resté en français.
- **Attendu** :
  - Tout est traduit. **Textes français résiduels attendus à signaler** (littéraux non passés par la traduction) : « Mensuel / Trimestriel / Semestriel / Annuel » (fréquence de facturation sur Mon bail), « de chaque mois » (jour d'échéance), « Avenant », « Quittance », « Autre » et « Carte » (types de document et méthodes), « 5 derniers » (carte des paiements récents), « Plomberie », « Climatisation » (catégories d'incident dans la liste), statut brut anglais d'un paiement annulé (par exemple CANCELED) dans l'historique.
  - Les dates de l'onglet Payer s'affichent en `JJ/MM/AAAA` quelle que soit la langue (voir GL-14-008).
  - Messages d'erreur du portail renvoyés par le serveur (« Aucun bail actif trouvé. », « Accès portail locataire refusé. ») : restent en français (voir GL-14-006).
- **Gravité si échec** : Cosmétique

### GL-14-004 — Portail propriétaire en anglais et en arabe

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : données du jeu de référence.
- **Données** : écrans de la liste de passage « Propriétaire ».
- **Étapes** :
  1. En anglais puis en arabe, parcourir tous les écrans (Tableau de bord, Biens, fiche, Baux, Revenus, Échéances, Paiements, Mon compte, Dépôts, Documents, Rapports, Préférences, Incidents, Patrimoine).
  2. Relever les textes en français.
- **Attendu** :
  - Tout est traduit. **Résidus français attendus à signaler** : types de bien et statuts de la fiche (« Appartement », « Maison/Villa », « Studio », « Bureau », « Terrain », « Immeuble », « Brouillon », « Disponible », « Vendu », « Vente », « Location »), mouvements de dépôt (« Collecte », « Remboursement », « Confiscation », « Ajustement »), catégories d'incident (« Plomberie », « Climatisation », « Autre »), « Carte », « Avenant », « Quittance », libellés de lignes enregistrées par le serveur.
  - Fichiers exportés : en-têtes de colonnes en français (Propriété, Locataire, Montant…) quelle que soit la langue — noter.
  - Mise en page RTL correcte, y compris sur les tableaux de mouvements et les cartes de synthèse.
- **Gravité si échec** : Cosmétique

### GL-14-005 — Pages publiques dans les trois langues

- **Rôle** : PUBLIC
- **Préconditions** : lien de rapport (fichier 10), lien de paiement (fichier 11) ; choix de langue mémorisé depuis une page connectée du même navigateur.
- **Données** : langues fr, en, ar.
- **Étapes** :
  1. Pour chaque langue, ouvrir le rapport mensuel, le lien de paiement, la page de statut ; provoquer les messages d'erreur (lien invalide, trop de tentatives).
- **Attendu** :
  - Titres, étiquettes (Synthèse, Loyers appelés, Net à reverser, Sous-total), boutons (« Imprimer / enregistrer en PDF », « Payer maintenant ») et messages traduits ; titre de l'onglet « Rapport mensuel » traduit ; RTL en arabe ; lignes issues de la base (« Loyers encaissés… ») en français.
  - Aucune clef brute, aucun mélange fr/en dans un même bloc de phrase.
- **Gravité si échec** : Mineur

### GL-14-006 — Messages du serveur selon la langue

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : langue anglaise active partout.
- **Données** : cas d'erreur : reversement supérieur au solde (agence), « Aucun bail actif trouvé. » (locataire sans bail actif), document d'un autre locataire, accès propriétaire refusé.
- **Étapes** :
  1. ADMIN_A : provoquer l'erreur de reversement.
  2. Locataire sans bail actif : ouvrir Accueil.
  3. Locataire : télécharger le document d'un autre locataire (console).
- **Attendu** :
  - Erreurs passées par le gestionnaire d'erreurs de l'agence : texte anglais.
  - Erreurs émises directement par les portails : texte français (« Aucun bail actif trouvé. », « Document non trouvé ou accès refusé ») → incohérence de langue à signaler (Mineur) ; les écrans affichent ce message dans un bandeau « Error ».
- **Gravité si échec** : Mineur

### GL-14-007 — E-mails et langue du destinataire

- **Rôle** : ADMIN_A
- **Préconditions** : langue de l'interface d'ADMIN_A en anglais ; propriétaire P1 et locataire T1 avec langue préférée « français » sur leur fiche.
- **Données** : envoi du relevé, du rapport du mois, d'un lien de paiement, activation d'un bail.
- **Étapes** :
  1. En anglais, envoyer chaque message ; lire l'e-mail reçu.
  2. Refaire avec la fiche du destinataire en anglais.
- **Attendu** :
  - La langue de l'e-mail suit la requête en cours (ou la préférence du destinataire pour un envoi planifié) : consigner la règle observée ; les montants du relevé dans l'e-mail sont formatés à la française (« 234 320 FCFA »).
  - Aucune clef brute, aucune variable `{{…}}` non remplacée dans les e-mails.
- **Gravité si échec** : Mineur

### GL-14-008 — Dates et heures formatées selon la langue

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : paiement du 08/10/2026, échéance du 05/11/2026, relevé envoyé.
- **Données** : langues fr, en, ar.
- **Étapes** :
  1. Relever la date du paiement, l'échéance, « Envoyé le », le mois du relevé (« octobre 2026 ») sur : Payer (locataire), Mon compte (propriétaire), détail du relevé, Commissions, rapport public.
  2. Comparer entre les trois langues.
- **Attendu** :
  - Attendu produit : `JJ/MM/AAAA` en français et en arabe, `MM/JJ/AAAA` en anglais ; mois en toutes lettres dans la langue.
  - **Constat à vérifier (Cosmétique)** : sur Payer (locataire), Mon compte (propriétaire) et les sélecteurs de dates des rapports, le motif `JJ/MM/AAAA` est écrit en dur : une date reste en `JJ/MM/AAAA` en anglais (08/10/2026 lu comme le 10 août par un anglophone).
- **Gravité si échec** : Cosmétique

### GL-14-009 — Montants et devise selon la langue

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : montants 220 000, 234 320, 999 999 999.
- **Données** : langues fr, en, ar.
- **Étapes** :
  1. Relever le même montant sur : liste des comptes (agence), Accueil locataire, Payer, Mon compte propriétaire, rapport public.
  2. Comparer entre langues.
- **Attendu** :
  - Séparateur de milliers de la langue (espace fine insécable en français, virgule en anglais, séparateur arabe avec chiffres occidentaux en arabe) ; aucun retour à la ligne entre le nombre et la devise.
  - Devise toujours « FCFA » dans l'agence et le propriétaire. **Constat à vérifier** : le portail locataire utilise le formatage monétaire XOF du navigateur (« F CFA » en français, « CFA » ou « XOF » en anglais) → écart de présentation entre portails (Cosmétique).
  - Jamais de décimales parasites (« 220 000,00 ») ni de notation scientifique.
- **Gravité si échec** : Cosmétique

### GL-14-010 — Persistance et reprise de la langue

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : —
- **Données** : langue anglaise choisie.
- **Étapes** :
  1. Choisir English ; F5 ; fermer et rouvrir l'onglet ; se déconnecter et se reconnecter ; se connecter depuis une fenêtre privée.
  2. Dans le profil (Menu du compte › Profil), lire le champ « Langue ».
- **Attendu** :
  - La langue est conservée après F5 et reconnexion ; une fenêtre privée reprend la langue du compte après connexion ; aucun clignotement prolongé de français avant le passage à l'anglais.
- **Gravité si échec** : Mineur

---

## B. Mobile, tablette, clavier

### GL-14-011 — Écrans d'agence à 375 px

- **Rôle** : ADMIN_A
- **Préconditions** : outils de développement : émulation d'appareil 375 × 812 (téléphone), langue française puis arabe.
- **Données** : Relevés, détail du relevé, Comptes propriétaires, détail du compte, fenêtre « Nouveau reversement », Commissions, Paramètres financiers, fiche d'un bail.
- **Étapes** :
  1. Ouvrir chaque écran, défiler, ouvrir les fenêtres, les filtres, les listes déroulantes.
  2. Tourner l'appareil en paysage.
- **Attendu** :
  - Aucun défilement horizontal de la **page** (seuls les tableaux défilent dans leur cadre) ; la liste des comptes devient des cartes ; boutons d'au moins 44 px de haut, atteignables au pouce ; fenêtres entièrement visibles avec défilement interne ; clavier virtuel qui ne masque pas le champ actif.
  - Texte lisible sans zoom ; montants non coupés.
- **Gravité si échec** : Majeur (action inaccessible) ; Mineur (défaut d'affichage)

### GL-14-012 — Portail locataire à 375 px

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : émulation 375 px, en français puis en arabe.
- **Données** : tous les écrans « Locataire ».
- **Étapes** :
  1. Barre d'onglets du bas : Accueil, Payer, Incidents, Mon bail.
  2. Ouvrir la fenêtre « Déclarer un paiement » (clavier numérique pour le montant, sélecteur de date, téléversement d'une photo), le sélecteur de plage de dates, les filtres.
  3. Atteindre **Notifications** et **Messagerie** (icônes de l'en-tête).
- **Attendu** :
  - Navigation par le bas utilisable à une main ; tableaux de l'onglet Payer défilant dans leur cadre ; cartes de synthèse empilées ; la fenêtre de déclaration tient dans l'écran et se valide sans masquer le bouton « Déclarer le paiement ».
  - Les écrans sans entrée de menu (`/tenant/deposit`, `/tenant/documents`) sont accessibles seulement par adresse : constat (Mineur).
- **Gravité si échec** : Majeur

### GL-14-013 — Portail propriétaire à 375 px

- **Rôle** : PROPRIETAIRE_PORTAIL
- **Préconditions** : émulation 375 px.
- **Données** : tous les écrans « Propriétaire ».
- **Étapes** :
  1. Barre d'onglets : Accueil, Biens, Revenus, Incidents, **Plus** (Documents, Rapports, Préférences, Notifications, Messagerie…).
  2. Mon compte : tableaux en cartes ; Revenus : graphiques ; Rapports : formulaires et téléchargements.
- **Attendu** :
  - Aucune coupure de montant ; graphiques lisibles ; formulaires de rapport utilisables ; téléchargements lancés (fichier récupérable dans les téléchargements du téléphone).
- **Gravité si échec** : Majeur

### GL-14-014 — Tablette 768 px et zoom 200 %

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : émulation 768 × 1024.
- **Données** : écrans principaux de chaque espace ; zoom du navigateur à 200 %.
- **Étapes** :
  1. Ouvrir les écrans principaux en portrait et en paysage.
  2. Zoomer à 200 %.
- **Attendu** :
  - Barre latérale repliée ou tiroir ; tableaux complets avec défilement interne ; à 200 %, la mise en page se recompose sans chevauchement ni perte d'action.
- **Gravité si échec** : Mineur

### GL-14-016 — Navigation au clavier

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : clavier seul (souris non utilisée).
- **Données** : formulaire de génération de relevé, fenêtre « Nouveau reversement », fenêtre « Déclarer un paiement », confirmation « Révoquer ce lien ? ».
- **Étapes** :
  1. Atteindre chaque formulaire par Tab ; remplir ; valider par Entrée ; fermer par Échap.
  2. Parcourir un tableau (boutons de ligne, pagination) ; ouvrir la liste déroulante des statuts par Entrée/Flèches.
- **Attendu** :
  - Ordre de tabulation logique, focus visible, focus enfermé dans la fenêtre ouverte et rendu au bouton d'origine à la fermeture ; Échap ferme sans enregistrer ; les champs ont des étiquettes liées (lecteur d'écran) ; les cases de sélection d'échéance portent une étiquette « Sélectionner <période> » ; aucune action n'est réservée à la souris.
- **Gravité si échec** : Mineur

---

## C. Erreurs réseau, session, plusieurs onglets

### GL-14-020 — API injoignable pendant la consultation (lecture)

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, PUBLIC
- **Préconditions** : coupure simulée par l'onglet Réseau (case « Hors connexion ») ou, si le superviseur l'autorise, arrêt de l'API pendant quelques minutes. Ne pas arrêter les serveurs soi-même.
- **Données** : écrans Comptes propriétaires, Relevés, Accueil locataire, Payer, Mon compte propriétaire, page publique du rapport.
- **Étapes** :
  1. Charger chaque écran (Ctrl+F5) avec la connexion coupée ; chronométrer l'apparition de l'erreur.
  2. Rétablir la connexion ; cliquer **Réessayer**.
  3. Couper la connexion sur un écran déjà chargé puis cliquer **Actualiser** (propriétaire) ou changer de filtre.
- **Attendu** :
  - Après environ quatre secondes (une lecture est rejouée deux fois, à 1 s puis 3 s), un message **propre** : agence « Impossible de charger les comptes propriétaires. » / « Impossible de charger les baux. » avec **Réessayer** ; propriétaire « Impossible de charger votre compte. » avec **Réessayer** ; locataire bandeau « Erreur » + « Erreur lors du chargement du tableau de bord » ; page publique du rapport « Service momentanément indisponible, réessayez dans quelques minutes. »
  - Aucun écran blanc, aucun message technique (`Network Error`, pile), aucune boucle de requêtes infinie.
  - Après rétablissement : **Réessayer** recharge les données sans rechargement de page.
  - Écran déjà chargé : les données affichées restent visibles avec un signalement de l'échec (pas d'écran vidé).
- **Gravité si échec** : Majeur

### GL-14-021 — API injoignable pendant une écriture

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : connexion coupée juste avant la validation.
- **Données** : « Nouveau reversement » de 1 000 FCFA ; « Déclarer le paiement » de 1 000 ; « Générer le relevé » ; création de lien sécurisé.
- **Étapes** :
  1. Remplir le formulaire, couper la connexion, valider.
  2. Rétablir la connexion, **ne pas** revalider tout de suite : recharger la liste concernée pour savoir si l'écriture a eu lieu.
  3. Revalider si rien n'a été créé.
- **Attendu** :
  - Message d'échec **lisible** (« L'enregistrement du reversement a échoué. », « Erreur lors de la déclaration du paiement », « Échec de génération du relevé »), bouton redevenu actif, formulaire non vidé.
  - Une écriture n'est **jamais rejouée automatiquement** (pas de doublon de reversement ni de déclaration après retour du réseau).
  - Après rétablissement, un seul reversement / une seule déclaration au total.
- **Gravité si échec** : Bloquant (doublon financier) ; Mineur (message peu clair)

### GL-14-022 — Suivi d'un paiement en ligne sans réseau

- **Rôle** : LOCATAIRE_PORTAIL
- **Préconditions** : retour d'un paiement simulé sur `/tenant/payments?paiement=IMT-…` (fichier 11) ; réseau coupé au moment du retour.
- **Données** : —
- **Étapes** :
  1. Revenir de la page du simulateur avec la connexion coupée.
  2. Rétablir la connexion et recharger.
- **Attendu** :
  - Message « Impossible de vérifier ce paiement. » (ou message serveur) sans boucle ; après rétablissement, l'historique montre le paiement s'il a abouti ; aucun double paiement.
- **Gravité si échec** : Majeur

### GL-14-023 — Lenteur du réseau (3G) et erreur serveur 500

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : réseau limité (profil « 3G lente ») ; puis blocage ou remplacement d'une réponse par un 500 avec les outils de développement.
- **Données** : listes, formulaires, téléchargement d'un rapport.
- **Étapes** :
  1. Charger les écrans lourds (liste d'échéances, Revenus, Rapports) : observer les indicateurs de chargement.
  2. Soumettre un formulaire en double-cliquant.
  3. Forcer un 500 sur une requête de lecture, puis d'écriture.
- **Attendu** :
  - Squelettes ou indicateurs de chargement visibles ; pas de double soumission ; le téléchargement d'un rapport lent n'est pas relancé automatiquement.
  - 500 : message générique propre (« Une erreur est survenue. Veuillez réessayer plus tard. » ou message de l'écran), jamais de pile technique, de chemin de fichier ni de nom de table.
- **Gravité si échec** : Majeur

### GL-14-024 — Pages publiques avec API indisponible

- **Rôle** : PUBLIC
- **Préconditions** : lien de rapport et lien de paiement valides, connexion à l'API coupée.
- **Données** : —
- **Étapes** :
  1. Ouvrir chaque lien avec la connexion coupée.
  2. Rétablir la connexion et rouvrir le **même lien** (depuis l'historique ou le message d'origine).
- **Attendu** :
  - Rapport : « Service momentanément indisponible, réessayez dans quelques minutes. » ; paiement : « Service momentanément indisponible, réessayez dans quelques minutes. » ; jamais « Lien invalide » pour une simple panne.
  - Le jeton étant retiré de l'adresse après lecture, un F5 après la panne affiche « Lien invalide ou expiré » : le destinataire doit rouvrir son lien d'origine. À noter comme point d'ergonomie (Mineur) si l'on souhaite un nouvel essai sans retaper le lien.
- **Gravité si échec** : Mineur

### GL-14-025 — Session expirée

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : écran ouvert avec un formulaire à moitié rempli (fenêtre « Nouveau reversement », « Déclarer un paiement »).
- **Données** : suppression des cookies de session dans les outils de développement (Application › Cookies), ou révocation des sessions par ADMIN_A (cas GL-13-036).
- **Étapes** :
  1. Supprimer les cookies, puis valider le formulaire ou changer de page.
  2. Observer la redirection ; se reconnecter.
- **Attendu** :
  - Une tentative de renouvellement de session a lieu ; en cas d'échec : redirection vers `/login?redirect=<adresse d'origine>` ; après connexion, retour sur l'écran d'origine (portail du même type) ; aucune donnée ne reste affichée après la redirection.
  - Le formulaire à moitié rempli est perdu (comportement à noter) ; aucune écriture partielle n'a eu lieu.
  - Plusieurs requêtes simultanées en 401 ne provoquent qu'**une** tentative de renouvellement (pas de déconnexion générale par rejeu de jeton).
- **Gravité si échec** : Majeur

### GL-14-026 — Deux onglets, deux sessions

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : même navigateur, deux onglets connectés au même compte.
- **Données** : déconnexion dans l'onglet 1 ; changement de langue dans l'onglet 1 ; reversement dans les deux onglets (voir GL-10-055).
- **Étapes** :
  1. Onglet 1 : **Menu du compte › Déconnexion**. Onglet 2 : cliquer une action.
  2. Se reconnecter ; onglet 1 : passer en English ; onglet 2 : recharger.
  3. Ouvrir deux sessions différentes (ADMIN_A et T1) dans deux fenêtres privées distinctes et vérifier qu'elles ne se mélangent pas.
- **Attendu** :
  - Onglet 2 après déconnexion : action refusée puis redirection vers la connexion, sans donnée affichée ensuite.
  - Langue : appliquée à l'onglet 2 après rechargement.
  - Deux fenêtres privées distinctes = deux sessions indépendantes ; un compte locataire n'hérite jamais des droits d'agence d'un autre onglet.
- **Gravité si échec** : Majeur

### GL-14-027 — Retour arrière, avant, F5 et retour d'onglet

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : écrans filtrés ou profonds (relevé > détail, compte > fenêtre, Payer > détails de l'échéance).
- **Données** : —
- **Étapes** :
  1. Ouvrir un détail depuis une liste filtrée, **Précédent**, **Suivant**, F5.
  2. Sur Payer (locataire), changer d'onglet du navigateur pendant plus de 30 secondes, revenir.
  3. Après déconnexion, appuyer sur **Précédent**.
- **Attendu** :
  - Chaque écran se recharge sur la même adresse avec ses données (aucune erreur) ; les filtres portés par l'adresse (période de Commissions, `?period=`) sont conservés ; les fenêtres ne se rouvrent pas toutes seules.
  - Au retour sur l'onglet Payer après 30 secondes, les échéances et l'historique se mettent à jour en silence, sans repasser par un squelette complet.
  - Après déconnexion, **Précédent** ne montre aucune donnée du portail ni de l'agence (redirection vers la connexion).
- **Gravité si échec** : Majeur

---

## D. Saisies hostiles, limites et formats

### GL-14-030 — Accents, apostrophes, guillemets et esperluette

- **Rôle** : ADMIN_A
- **Préconditions** : —
- **Données** : nom de contact propriétaire `REC-GL Éléonore N'Guessan-Ångström & Fils « SARL »` ; libellé de dépense `REC-GL Réparation "volet" d'été – 50 % & plus` ; référence de paiement `REC-GL/été-2026#1` ; notes avec retour à la ligne.
- **Étapes** :
  1. Créer le contact comme propriétaire, un bien, un bail (fichier 02), la dépense, le paiement.
  2. Générer le relevé, l'envoyer, créer un lien, ouvrir le rapport public ; ouvrir le compte, le portail propriétaire et le locataire concernés ; exporter en CSV et en PDF (portail propriétaire).
- **Attendu** :
  - Le texte s'affiche à l'identique partout (liste, détail, e-mail, rapport public, portails, PDF, CSV ouvert dans un tableur) : accents, apostrophes, guillemets, `&`, `%` et tirets conservés ; pas de `&amp;`, de `?` ni de caractères carrés.
  - La recherche par nom (avec ou sans accents) retrouve le contact.
- **Gravité si échec** : Majeur

### GL-14-031 — Balises HTML et scripts dans les champs libres

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, PUBLIC
- **Préconditions** : fenêtre de dialogue du navigateur observable (une alerte JavaScript serait visible).
- **Données** : chaînes d'essai `<script>alert('X1')</script>`, `<img src=x onerror=alert('X2')>`, `"><svg onload=alert('X3')>`, `javascript:alert('X4')`, `{{7*7}}`, `<b>gras</b>`, `' OR '1'='1`.
- **Étapes** :
  1. Saisir, selon l'écran et le rôle, chaque chaîne dans : nom du contact (agence) ; notes du bail ; libellé de dépense ; référence et notes d'une déclaration de paiement (locataire) ; titre, description, localisation et commentaire d'un ticket (locataire) ; motif d'annulation d'un reversement ; référence et notes d'un reversement ; nom d'association/indivision si disponible.
  2. Relire chaque donnée **partout où elle est affichée** : listes et fiches d'agence, déclarations en attente, portails locataire et propriétaire, détail du relevé, e-mail reçu, rapport public, exports CSV/Excel/PDF, notifications, messagerie.
  3. Dans les e-mails, ouvrir le source HTML du message.
- **Attendu** :
  - Aucune boîte d'alerte, aucune image chargée, aucun style appliqué par les balises : les chaînes s'affichent comme **texte brut** (ou balises neutralisées) dans tous les écrans, e-mails (échappement dans le corps HTML), PDF et exports. `{{7*7}}` reste littéral (pas `49`). Le champ ne provoque ni erreur 500 ni coupure d'affichage.
  - Les exports CSV préfixent ou neutralisent une cellule commençant par `=`, `+`, `-`, `@` (voir GL-12-084).
  - Toute exécution de script : Bloquant.
- **Gravité si échec** : Bloquant (script exécuté) ; Majeur (balise interprétée sans script)

### GL-14-032 — Longs textes et chaînes sans espace

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : —
- **Données** : description de ticket de 5 000 caractères puis 5 001 ; notes de déclaration de 1 000 puis 1 001 ; référence de 255 puis 256 caractères ; mot de 300 lettres sans espace ; notes de bail de 2 000 caractères.
- **Étapes** :
  1. Saisir et valider chaque valeur.
  2. Relire les écrans (portail, agence, rapport).
- **Attendu** :
  - Valeurs au plafond acceptées ; au-dessus : message de limite clair (« La description ne peut pas dépasser 5000 caractères. », « Les notes ne peuvent pas dépasser 1000 caractères. », « La référence ne peut pas dépasser 255 caractères. ») et rien d'enregistré ; jamais d'erreur 500.
  - Affichage : retour à la ligne ou troncature propre, sans débordement hors cadre ni élargissement de la page ; le mot de 300 lettres ne casse pas la mise en page.
- **Gravité si échec** : Mineur

### GL-14-033 — Texte arabe, émoji et caractères de contrôle

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : —
- **Données** : libellé de dépense `REC-GL إصلاح السباكة 🔧 – villa`, nom de contact en arabe, notes avec émoji et zéro-largeur.
- **Étapes** :
  1. Saisir, générer relevé, rapport public, PDF et CSV.
- **Attendu** :
  - Texte arabe affiché dans le bon sens, mélangé proprement avec les chiffres et le latin ; émoji conservés ou remplacés sans erreur ; PDF sans carrés ; CSV encodé en UTF-8 lisible.
- **Gravité si échec** : Mineur

### GL-14-034 — Montants extrêmes et saisies numériques

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : formulaires de montant : déclaration de paiement (portail), reversement, paiement (fichier 06), loyer de bail, dépôt, forfait d'honoraires.
- **Données** : `999999999999` ; `9999999999` ; `0,01` ; `1000,5` ; `-1` ; `1e9` ; `abc` ; collage de `1 000 000` avec espaces ordinaires et insécables ; `1.000.000`.
- **Étapes** :
  1. Saisir chaque valeur dans chaque formulaire, valider.
  2. Relire la valeur enregistrée dans les écrans et les totaux (cartes de synthèse, compte, relevé).
- **Attendu** :
  - 999 999 999 999 (12 chiffres) dépasse la capacité d'un montant (9 999 999 999,99 au maximum) : refus **clair** (« montant trop élevé » ou borne de champ), pas d'erreur 500 ni de message générique. 9 999 999 999 accepté et affiché « 9 999 999 999 FCFA » sans coupure ni notation scientifique, totaux exacts.
  - 0,01 : refusé ou arrondi explicitement selon le champ (les montants du portail sont en FCFA entiers) ; −1, `1e9`, `abc` : refusés avec message ; collages avec espaces ou insécables : interprétés comme 1 000 000 ; `1.000.000` : interprété ou refusé sans valeur fausse (pas 1).
  - Aucune valeur enregistrée différente de celle affichée à la saisie.
- **Gravité si échec** : Majeur (valeur fausse ou 500) ; Mineur (message peu clair)

### GL-14-035 — Séparateurs de milliers et de décimales par langue

- **Rôle** : ADMIN_A, PROPRIETAIRE_PORTAIL
- **Préconditions** : montant 1 234 567 FCFA saisi dans un loyer d'essai ; honoraires à 12,5 %.
- **Données** : langues fr, en, ar.
- **Étapes** :
  1. Relever le montant et le pourcentage dans les écrans de saisie et de lecture, dans chaque langue.
  2. Saisir un taux avec virgule (« 12,5 ») puis avec point (« 12.5 ») dans le taux d'honoraires.
- **Attendu** :
  - Affichage conforme à la langue (fr : `1 234 567`, en : `1,234,567`, ar : chiffres occidentaux avec séparateur arabe) ; pourcentage `12,5 %` en français ; les deux saisies de taux sont comprises (12,5 ) ou l'une est refusée clairement ; jamais 125 ou 12.
- **Gravité si échec** : Majeur

### GL-14-036 — Devise FCFA partout

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : —
- **Données** : parcours de la liste de passage.
- **Étapes** :
  1. Relever la devise de chaque montant : écrans, e-mails, PDF, CSV, rapport public.
- **Attendu** :
  - « FCFA » (agence, propriétaire, rapport, e-mails) ; le code ISO « XOF » n'est jamais affiché en clair ; aucun montant sans devise là où elle est attendue (colonnes d'export : devise indiquée dans l'en-tête ou une colonne).
  - Constat connu : le portail locataire écrit la devise avec le formatage du navigateur (« F CFA ») : voir GL-14-009.
- **Gravité si échec** : Cosmétique

### GL-14-037 — Fuseau horaire et passage de minuit

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : outils de développement › Capteurs : fuseau forcé successivement à `Pacific/Kiritimati` (UTC+14), `Africa/Abidjan` (UTC), `Pacific/Pago_Pago` (UTC−11) ; paiement daté du 31/10/2026 enregistré en fin de journée (fichier 06) et un autre du 01/11/2026.
- **Données** : reversement daté « aujourd'hui », déclaration datée « aujourd'hui », paiement du 31/10.
- **Étapes** :
  1. Pour chaque fuseau, relire la date de ces paiements dans Payer (locataire), Paiements (agence), Mon compte (propriétaire), détail du compte.
  2. Dans le fuseau UTC+14, ouvrir « Nouveau reversement » avec la date du jour et enregistrer ; faire de même avec « Déclarer un paiement » (locataire).
  3. Générer les relevés d'octobre et de novembre et comparer l'affectation des deux paiements.
- **Attendu** :
  - La date affichée d'un paiement est celle saisie, quel que soit le fuseau de l'ordinateur (pas de décalage d'un jour) ; si un décalage existe dans un fuseau extrême, le noter (Mineur).
  - Reversement et déclaration « d'aujourd'hui » acceptés dans tous les fuseaux ; **point de vigilance** : en UTC+14 juste après minuit local, la date du jour locale est future côté serveur → refus « La date du reversement ne peut pas être dans le futur » ou « La date de paiement ne peut pas être dans le futur » pour une date légitime (Mineur).
  - Les relevés (bornes de mois en UTC) rangent le paiement du 31/10 dans octobre et celui du 01/11 dans novembre ; leur somme sur les deux mois est exacte.
- **Gravité si échec** : Majeur (paiement rangé dans le mauvais mois) ; Mineur (affichage)

### GL-14-038 — Dates en limite de mois et d'année

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL
- **Préconditions** : bail d'essai `REC-GL Bail J31` avec jour d'échéance 31 et début le 31/01/2027 (fichier 02) ; échéances générées ; bail à début le 29/02/2028 (année bissextile) si le calendrier de recette le permet.
- **Données** : échéances de février (28 jours), avril (30 jours), décembre ; relevé `2026-12` et `2027-01` ; paiement du 31/12/2026 et du 01/01/2027.
- **Étapes** :
  1. Lire la date d'échéance de chaque mois dans l'espace locataire et à l'agence.
  2. Générer les relevés `2026-12` et `2027-01` ; comparer l'affectation des deux paiements.
  3. Consulter « Revenus par mois » (propriétaire) pour 2026 et 2027.
- **Attendu** :
  - Le 31 se ramène au dernier jour du mois court (28/02/2027, 30/04/2027) sans sauter au mois suivant ; aucune échéance en double ni manquante ; le statut « En retard » n'apparaît qu'à partir du lendemain de la vraie date d'échéance.
  - Paiement du 31/12 dans le relevé de décembre et celui du 01/01 dans janvier ; « Revenus par mois » (propriétaire) range les mêmes paiements dans les mêmes mois ; l'année change correctement (2026/2027).
  - 29/02/2028 accepté (bissextile) ; 29/02/2027 refusé.
- **Gravité si échec** : Majeur

### GL-14-044 — Téléchargements : quittance, contrat, rapports, exports

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, ADMIN_A
- **Préconditions** : quittance et contrat de R1 générés ; rapport de revenus, rapport d'occupation et exports possibles côté propriétaire.
- **Données** : documents du locataire (Mon bail et Documents), rapports et exports du propriétaire (PDF, CSV, Excel), langues fr et ar.
- **Étapes** :
  1. Télécharger chaque fichier ; l'ouvrir avec le lecteur PDF / le tableur.
  2. Couper brièvement le réseau en plein téléchargement, puis relancer manuellement.
  3. Ouvrir le même fichier dans deux onglets en même temps.
- **Attendu** :
  - Fichier non vide, type conforme à l'extension (PDF lisible, `xlsx` ouvrable, CSV en UTF-8 avec accents corrects et séparateurs cohérents) ; noms : `document-<id>.pdf` côté locataire, `revenue-report-AAAA-MM-JJ.*`, `occupancy-report-…`, `payments-export-…` côté propriétaire.
  - Un PDF en langue arabe garde le sens de lecture et les caractères ; les montants du fichier égalent ceux de l'écran.
  - Une coupure pendant un téléchargement donne un message d'échec (« Erreur lors du téléchargement du document », « Erreur lors du téléchargement ») et **ne relance pas** automatiquement un gros fichier plus d'une fois ; **Réessayer** à la main fonctionne.
- **Gravité si échec** : Majeur

### GL-14-045 — Impression du rapport mensuel public

- **Rôle** : PUBLIC
- **Préconditions** : lien de rapport valide ouvert (fichier 10).
- **Données** : aperçu avant impression, formats A4 portrait, langue française puis arabe.
- **Étapes** :
  1. Cliquer **Imprimer / enregistrer en PDF** puis examiner l'aperçu ; enregistrer en PDF.
  2. Refaire à 375 px (téléphone).
- **Attendu** :
  - Le bouton d'impression et les éléments de navigation sont masqués dans l'aperçu ; les cartes ne sont pas coupées en deux ; les montants et le sous-total de chaque bien restent sur la même page que leurs lignes ; le PDF contient la période, le propriétaire, la synthèse et les lignes par bien ; arabe : sens de lecture correct.
- **Gravité si échec** : Mineur

---

## E. Console, réseau, fuites de données

### GL-14-039 — Console du navigateur sans erreur rouge

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, PUBLIC
- **Préconditions** : console ouverte, option « Conserver le journal » activée, filtre « Erreurs ».
- **Données** : tous les écrans de la liste de passage.
- **Étapes** :
  1. Pour chaque écran : charger, ouvrir chaque fenêtre, chaque onglet, chaque filtre ; effectuer une action nominale (sans erreur provoquée).
  2. Noter toute entrée rouge (erreur JavaScript non interceptée, avertissement React critique, ressource 404).
- **Attendu** :
  - Aucune erreur rouge sur un parcours nominal (hors erreurs volontairement provoquées par les cas de refus, où seuls les statuts HTTP attendus apparaissent). Pas de `Uncaught`, pas de `Warning: Each child…`, pas de clef de traduction manquante signalée.
  - Tableau de suivi : écran, erreur, reproduction.
- **Gravité si échec** : Mineur (Majeur si l'erreur bloque une action)

### GL-14-040 — Réseau : aucun échec ni boucle inattendus

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL
- **Préconditions** : onglet Réseau, filtre « Fetch/XHR ».
- **Données** : écrans de la liste de passage.
- **Étapes** :
  1. Charger chaque écran, attendre 10 secondes, relever les requêtes en échec (4xx/5xx), les requêtes répétées et le nombre d'appels par écran.
- **Attendu** :
  - Aucune requête 4xx/5xx sur un parcours nominal ; pas de requête répétée en boucle (hors le suivi d'un paiement en ligne, toutes les 3 secondes pendant 60 secondes au plus) ; pas de dizaines d'appels identiques au chargement ; les pages publiques n'appellent ni `/auth/me` ni `/auth/refresh`.
- **Gravité si échec** : Mineur (Majeur si boucle)

### GL-14-041 — Aucune donnée secrète dans les réponses

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, ADMIN_A
- **Préconditions** : onglet Réseau.
- **Données** : réponses de `/api/portal/tenant/lease`, `…/payments`, `…/documents`, `/api/portal/owner/leases/:id`, `…/documents`, `…/account`, `/api/tenants/<A>/owner-accounts`, `…/owner-statements/:id`.
- **Étapes** :
  1. Ouvrir chaque réponse JSON, chercher les clefs `passwordHash`, `password`, `token`, `tokenHash`, `file_path`, `proof_file_url`, `file_url`, `storage`, chemins de disque (`C:\…`, `/uploads/…`), IBAN complet, e-mail d'un autre client.
- **Attendu** :
  - Aucune de ces clefs ni valeurs : les fichiers sont désignés par un identifiant et une route de téléchargement ; l'IBAN n'apparaît jamais en clair sans droit de gestion des prélèvements ; les listes de liens sécurisés n'exposent ni jeton ni empreinte.
  - Les e-mails visibles au locataire se limitent à ceux du bail (propriétaire, co-locataires) — voir GL-11-021.
- **Gravité si échec** : Bloquant (secret ou chemin exposé) ; Mineur (e-mail du bail)

### GL-14-042 — Déconnexion : rien ne reste en mémoire

- **Rôle** : LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, ADMIN_A
- **Préconditions** : session ouverte après consultation de montants.
- **Données** : —
- **Étapes** :
  1. **Menu du compte › Déconnexion**.
  2. **Précédent** dans l'historique ; examiner Stockage local, Stockage de session et Cookies (Application).
  3. Rouvrir directement une adresse profonde (`/owner/account`).
- **Attendu** :
  - Redirection vers la connexion ; aucune donnée financière dans l'écran, le stockage local ou le stockage de session (seuls la langue et des préférences d'affichage restent) ; cookies de session supprimés ; l'adresse profonde renvoie vers `/login?redirect=…`.
- **Gravité si échec** : Majeur

### GL-14-043 — Gros volumes (si le jeu de données le permet)

- **Rôle** : LOCATAIRE_PORTAIL, ADMIN_A
- **Préconditions** : bail avec plus de 100 échéances et plus de 500 paiements (jeu de données volumineux fourni par l'équipe technique) ; sinon « non testable ».
- **Données** : 24 échéances sur l'année × plusieurs années, 600 paiements.
- **Étapes** :
  1. Locataire : Payer › Échéances (pagination, tri, filtres) et Historique (pagination).
  2. Agence : listes Paiements et Échéances ; Comptes propriétaires avec 100+ propriétaires ; formulaire de génération de relevé avec plus de 100 biens.
- **Attendu** :
  - Chargement inférieur à 3 secondes par page, pagination exacte (« Total: N échéances »), tri cohérent. **Points de vigilance** : l'historique du locataire n'intègre que les 500 paiements les plus récents (le « Total payé » reste exact) ; le formulaire de génération de relevé ne liste que 100 biens et 500 contacts : au-delà, un propriétaire ou un bien est introuvable → Majeur si constaté.
- **Gravité si échec** : Mineur

### GL-14-046 — Un même paiement, une même valeur sur toutes les vues

- **Rôle** : ADMIN_A, LOCATAIRE_PORTAIL, PROPRIETAIRE_PORTAIL, PUBLIC
- **Préconditions** : un paiement neuf de 220 000 FCFA sur R1 daté d'aujourd'hui, avec honoraires 10 % et TVA 18 % (jeu de référence), dépense de la Villa déjà enregistrée ; un relevé du mois courant, envoyé, avec lien public.
- **Données** : tableau de rapprochement à remplir : montant, date, statut, solde, honoraires, TVA, net.
- **Étapes** :
  1. Relever la valeur du paiement et ses conséquences sur : Paiements et Échéances (agence), Balance clients (Finance), Payer et Mon relevé (locataire), Revenus, Paiements reçus et Mon compte (propriétaire), détail du relevé et rapport public (e-mail et lien), Commissions des agents, Comptes propriétaires.
  2. Annuler ce paiement côté agence ; relire chaque vue.
  3. Réenregistrer le paiement.
- **Attendu** :
  - Loyer encaissé 220 000 partout ; honoraires 20 000 ; TVA 3 600 ; part nette 196 400 avant dépense (relevé et compte) ; échéance « Payé » chez le locataire, solde 0 ; revenus du propriétaire +220 000 (brut) ; commission d'agent = 40 % de 20 000 pour R1.
  - Après annulation : toutes les vues reviennent au même état initial (échéance de nouveau due, revenus −220 000, compte −196 400, honoraires et commission retirés, relevé recalculable tant qu'il n'est pas envoyé) ; un relevé **envoyé** garde ses chiffres d'origine (écart attendu à documenter, à régulariser sur le relevé suivant).
  - Après réenregistrement : valeurs restituées sans doublon d'honoraires.
  - Toute divergence entre deux vues sur un même chiffre est un défaut Bloquant (montant faux).
- **Gravité si échec** : Bloquant

---

## Couverture

| Contrôle transverse demandé                      | Cas                                                 |
| ------------------------------------------------ | --------------------------------------------------- |
| Bascule fr → en → ar, aucun texte non traduit    | GL-14-001, 003, 004, 005, 006, 007                  |
| Mise en page RTL en arabe                        | GL-14-002, 004, 005, 011, 012                       |
| Montants et dates formatés par langue            | GL-14-008, 009, 035                                 |
| Langue mémorisée et reprise                      | GL-14-010                                           |
| Affichage 375 px et 768 px                       | GL-14-011, 012, 013, 014                            |
| Navigation clavier minimale                      | GL-14-016                                           |
| Message d'erreur réseau (API arrêtée)            | GL-14-020, 021, 022, 023, 024                       |
| Session expirée                                  | GL-14-025 ; cas GL-13-036 (révocation)              |
| Double onglet                                    | GL-14-026 ; cas GL-10-055 (reversements simultanés) |
| Retour arrière, F5, retour d'onglet              | GL-14-027                                           |
| Caractères spéciaux, accents                     | GL-14-030, 033                                      |
| Longs textes                                     | GL-14-032                                           |
| Injection HTML / script, formules de tableur     | GL-14-031 ; cas GL-10-038, GL-12-084                |
| Montants très grands (999 999 999 999)           | GL-14-034 ; cas GL-11-053                           |
| Séparateurs de milliers                          | GL-14-009, 035                                      |
| Devise FCFA                                      | GL-14-009, 036                                      |
| Fuseau horaire et dates en limite de mois        | GL-14-037, 038                                      |
| Console sans erreur rouge sur chaque écran       | GL-14-039                                           |
| Réseau sans échec inattendu                      | GL-14-040                                           |
| Fuite de données dans les réponses ; déconnexion | GL-14-041, 042                                      |
| Gros volumes                                     | GL-14-043 (conditionnel)                            |
| Téléchargements de fichiers (PDF, CSV, Excel)    | GL-14-044                                           |
| Impression du rapport public                     | GL-14-045                                           |
| Cohérence d'un même montant sur toutes les vues  | GL-14-046                                           |
