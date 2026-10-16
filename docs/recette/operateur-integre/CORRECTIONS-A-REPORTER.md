# Corrections à reporter dans le scénario (remontées par la recette)

## Partie 01

- B.1 : les agences démo s'appellent « Bamako Immobilier » et « Agence Immobilière du Mali ».
- B.4 : effectif, modules et dernière connexion sont dans l'onglet « Activité », pas « Statistiques ».
- B.6 : pas de filtre par agence ; lire la colonne « Agence ».
- B.8 : arrivée sur `/dashboard` ; entrée « Syndic » (Copropriétés, Agences mandantes, Copropriété, Finances, Assemblées et documents) ; menu « Plus » seulement en largeur mobile.
- B.9 : « Mes demandes » n'apparaît pas tant qu'aucune demande n'existe.
- B.11 : adresse `/tenant/<T>/invite`, pas de champ nom ; cliquer la case elle-même.
- B.13 : liens d'invitation lus dans la boîte SMTP de recette (`scratchpad/mails/INDEX.md`) ; réalité de l'environnement à ajouter.
- B.14 : bouton « Enregistrer les rôles » ; « Désactiver » est dans la liste, pas sur la fiche.
- B.10 : logo/signature/cachet non testables sans sélection de fichier dans le navigateur intégré.

## Partie 01 (retest B.13–B.15)

- B.15 : aucun bien ni affaire n'existe à ce stade ; jouer la vérification « fiche d'un bien » et « détail d'affaire » après les parties 02/03, ou le dire.

## Partie 02

- C.1 : le mode Location/Vente se choisit à l'étape 4 « Prix & Conditions » ; la référence interne n'apparaît pas sur la carte de liste (seulement sur la fiche).
- C.2 : l'onglet Lots crée des appartements par « groupes » (Nombre, Titre de base…) ; type et mode hérités, pas choisis. Choisir « Meublé » sinon la modification ultérieure échoue (BUG-013).
- C.4 : pas de type « Titre de propriété » ; types : Assurance, Document fiscal, Mandat, PV d'assemblée, Budget/Contrat du syndicat, Règlement de copropriété, Autre. Section « Coffre-fort documentaire ».
- C.5 : latitude/longitude se saisissent dans les champs Latitude/Longitude de /edit (ou « Adresse précise » via un service externe), PAS via la commune ; aucune route /public/properties dans l'application web (404) ; publication impossible sans photo (upload).
- C.6 : une visite exige un contact CRM → à jouer après la partie 03.
- C.7/C.8 : l'assistant n'a pas de choix « Mandat de gestion » ni de champ e-mail libre ; le propriétaire se choisit parmi les contacts CRM ayant un rôle actif → créer le contact Kouassi Yao OI (partie 03) avant C.7, ou rattacher la villa ensuite (Modifier > Propriétaire).
- C.10 : filtre « Commune » (pas « ville ») ; la suppression d'un bien se fait depuis la carte de la liste (Autres actions > Supprimer), pas depuis la fiche.
- C.11 : la page Performance n'a pas d'aperçu portefeuille : rien ne s'affiche sans bien sélectionné.

## Partie 03 (CRM et ventes)

- Réalité de l'environnement : faux que Kouassi Yao OI soit déjà TenantClient après la partie C (l'assistant n'a ni « Mandat de gestion » ni ownerEmail qui crée un TenantClient). Le seul chemin qui crée un TenantClient OWNER est la création d'un bail avec propriétaire (partie 04) → le mandat de vente D.9 doit venir après un bail avec Kouassi propriétaire, ou attendre BUG-2026-09-28-019.
- D.1 : la commune n'est pas obligatoire (seuls prénom, nom, e-mail) ; la commune est dans l'onglet « Contact » ; la fiche s'ouvre par l'icône oeil (colonne Actions), pas par le nom ; les tags s'appellent « Groupes » sur la fiche et « Gérer les tags » dans la modale ; aucune création de tag possible (BUG-014) ; pas de bloc « zones ciblées » sur la fiche.
- D.2 : bouton « Convertir » ouvre « Convert Lead to Client » (anglais, BUG-015) ; « Gérer les rôles » = bouton « Ajouter » de la carte Rôles, modale « Gérer les rôles ».
- D.3 : la recherche avancée n'est pas sur CRM > Contacts mais dans Communication > Newsletter — Listes > liste manuelle > « Ajouter des contacts (recherche CRM) » ; pas de filtre par rôle (utiliser Communes ou Nom) ; appuyer sur « Rechercher » après « Appliquer les filtres » ; « Sauvegarder » = invite native du navigateur ; pas d'écran de suggestions de valeurs (hors interface).
- D.4 : reprogrammer une relance = glisser-déposer l'événement dans le calendrier CRM (pas de bouton) ; « Marquer comme terminé » dans le tiroir « Détails de l'événement ». Créer d'abord une relance (activité avec « Prochaine action ») : aucune n'existe avant D.6.
- D.5 : type « Vente » choisi, mais pour une acquéreuse le type cohérent est « Achat » (à trancher) ; étapes affichées « Qualifie » (sans accent).
- D.6 : pas d'ajout d'activité sur le détail d'affaire : passer par CRM > Affaires > Liste > « Ajouter une activité » ou CRM > Activités > « Nouvelle activité » ; pas de filtre par affaire dans CRM > Activités.
- D.7 : le matching ne retient que les biens publiés (isPublished) ; prérequis : Terrain Bingerville OI publié (photo nécessaire).
- D.15 : l'Agent a CRM_DEALS_EDIT (rbac-seed.ts:295) → il peut changer l'étape d'une affaire et les routes Ventes (mandat, offre, compromis, acte) lui sont ouvertes ; seul CRM_MATCHING_RUN lui manque (bouton visible, 403). Revoir l'attendu ou la matrice de droits.

## Partie 02 (rejeu C.6–C.8 après la partie 03)

- C.6 : la visite se planifie depuis l'onglet Visites (Contact, Objectif, Affaire, Date au format AAAA-MM-JJ à la saisie, Heure, Lieu, Assigné à, Notes) ; pas de liste des visites sur le bien, pas de changement de statut ; clôture via CRM > Calendrier > « Marquer comme terminé » sans compte-rendu (BUG-020) ; pas de filtre par collaborateur sur le calendrier des visites.
- C.7/C.8 : même après création du contact Kouassi (rôle Propriétaire), aucune voie pour le rattacher à la villa, passer le bien en mandat de gestion, ni le choisir en indivision (BUG-019).

## Partie 04 (Gestion locative et portails)

- Réalité de l'environnement : les liens de création de compte des portails sont dans la boîte SMTP de recette (« Votre compte ImmoTopia a été créé » / « Votre bail … est activé », lien /reset-password?token=…) → E.14/E.18 jouables ; la réserve « jeton en base » est à retirer.
- E.1 : le bail est créé directement ACTIF (rental-lease-service.ts:241), pas en Brouillon ; retour sur la liste des baux, pas sur la fiche ; devise affichée « CFA ». Le champ « Montant du loyer » est pré-rempli avec le prix du bien et « Propriétaire » pré-rempli (voir BUG-021) : les vérifier/vider.
- E.2 : pas d'étape « passer à Actif » (déjà actif) — tester Actif → Suspendu → Actif ; aucun écran de co-locataires (addCoRenter jamais appelé) → à mettre en « Hors interface ».
- E.5 : pas d'activation à faire ; « locataire externe » = Mariam Koné OI (seul contact libre).
- E.6 : la collecte exige un « Paiement associé » (paiement Réussi non affecté du bail) et n'a pas de champ méthode → enregistrer d'abord un paiement de 150 000 / 800 000 dans l'onglet Paiements du bail (après E.10 ou en tête de E.6).
- E.7 : document généré directement « Final », numéro = numéro du bail (BAIL-2026-0001), aucune action de changement de statut (seulement « Régénérer à partir des données actuelles ») ; pas de modèle BAIL-OI requis (modèle par défaut).
- E.8 : Encaisser › Échéances n'a ni bouton « Générer » ni menu d'actions ; tout se fait sur la fiche du bail, onglet Échéances (« Générer les échéances », « Autres actions » › « Recalculer les statuts et pénalités »). « Calculer les pénalités » est dans l'onglet Pénalités du bail. Le détail d'une échéance n'est accessible (« Voir ») qu'une fois soldée. Comptable sans droit (BUG-022) : jouer E.8–E.12 avec le gestionnaire ou attendre le correctif.
- E.9 : une seule pénalité existe → pas de « suppression d'une autre pénalité » ; justificatif = upload.
- E.10 : « Nouveau paiement » de la page globale n'a pas de choix du bail → saisir depuis la fiche du bail, onglet Paiements ; le bouton s'appelle « Affecter » (modale « Allouer le paiement »).
- E.11 : l'annulation d'un paiement se fait sur son détail (liste de statut en tête) ; onglet « Déclarations en attente » dans Encaisser › Paiements.
- E.12 : le bouton s'appelle « Vérifier le statut » et n'existe que pour un paiement en ligne En attente/Revue ; il faut laisser un paiement simulateur non réglé pour le voir.
- E.13 : statut fiscal : « Personne physique / Personne morale / Exonéré » (pas « Particulier ») ; « Réinitialiser » = « Revenir aux conditions de l'agence ». Sans taux d'honoraires en vigueur, E.16/E.17 n'ont aucun honoraire : prévoir un taux (agence ou dérogation du bail) AVANT les encaissements.
- E.14 : pas d'entrées « Mes échéances / Mon dépôt / Mes documents » : menu Accueil, Payer, Incidents, Mon bail ; le bouton « Payer » d'une ligne ouvre la DÉCLARATION ; le paiement en ligne = cases à cocher + « Payer en ligne ».
- E.15 : relevé = onglet « Mon relevé » de la page Payer.
- E.16 : menu Finance › Clients et propriétaires › Reversements et commissions (/finance/owner-accounts) ; l'annulation d'un reversement exige FINANCE_DOCUMENTS_VALIDATE (admin), pas le comptable.
- E.18 : Plus › Rapports déclenchent des téléchargements (autorisation nécessaire en recette navigateur) ; « Mes baux », « Échéances », « Paiements », « Dépôts » accessibles par URL (/owner/leases, /owner/installments, /owner/payments, /owner/deposits).
- E.20 : envoi réussi si le propriétaire a consenti (fait en E.18) → « Relevé envoyé (email) ».
- E.21 : « À l'initiative de » : Locataire / Bailleur / Accord amiable (pas « Propriétaire ») ; renouvellement refusé sur un bail à durée indéterminée (« Ce bail est à durée indéterminée : il n'a pas de fin à repousser. ») → créer un bail avec date de fin pour tester le renouvellement.

## Partie 05 (Finance)

- Navigation : dans le panneau navigateur, les sous-menus Finance ne se déplient pas ; adresses directes /tenant/<T>/finance/caisse, /tresorerie, /validation, /comptabilite, /facturation, /balance-clients, /balance-agee, /associations, /fournisseurs, /fournisseurs/balance, /bons-de-commande.
- F.1 : la session ouverte n'affiche pas de libellé « Ouverte » en tête mais « Ouverte le … » ; le statut « Ouverte » se lit dans l'onglet « Historique ».
- F.2 : le gestionnaire n'a pas FINANCE_DOCUMENTS_CREATE : l'onglet « Ma caisse » est en erreur pour lui, utiliser « Historique » ; le filtre Statut propose Ouverte / À valider / Validée.
- F.3 : après clôture le statut affiché est « À valider » (pas « Clôturée ») ; le comptage se fait par billetage (ou interrupteur « Saisir le total sans billetage »).
- F.4 : la Caisse principale 5711, la Banque 5211 et « Mobile Money — Orange Money » 5522 existent déjà : prendre un numéro libre (ex. 55221) ; opérateur à saisir exactement « ORANGE » (voir fiche) ; le virement n'a pas de champ « libellé » : « Réassort caisse » va dans Notes ; partir d'un compte approvisionné (5522) plutôt que du compte neuf à 0.
- F.5 : prérequis manquant : activer la retenue à la source dans les paramètres financiers de l'agence (avec sa date d'effet) AVANT les encaissements de la partie 04, sinon Collecté/Dû = 0 et aucun versement DGI n'est possible.
- F.6 : la file de validation ne se remplit qu'après les saisies du Comptable (F.12/F.13) : la jouer après ; elle montre des compteurs par nature (Facture fournisseur / Règlement fournisseur / Pièce de caisse) et valide directement.
- F.10 : l'associé est un nom en saisie libre (pas de choix du contact Kouassi Yao OI) ; « Retirer » est dans « Autres actions » ; l'état de quote-part reste à 0 si aucun loyer n'a été ventilé depuis le rattachement.
- F.11 : la nature « Services » s'appelle « Prestation » (Matériaux / Prestation / Matériaux et prestation) ; la liste n'a pas de colonne solde (lire Balance fournisseurs).
- F.12 : pas d'écran de détail d'une facture fournisseur (lignes, imputations) : sous-fonctionnalité sans interface → « Hors interface » ; le brouillon se valide aussi depuis Pièces à valider.
- F.13 : le règlement se saisit dans le bloc « Règlement » de la page fournisseur (pas « sur la facture ») ; il n'y a pas de compte de trésorerie à choisir ; le « second règlement de test » doit être saisi ET validé par le même utilisateur dans la même page pour pouvoir l'annuler (voir BUG-2026-09-29-001).
- F.15/F.16 : chantier obligatoire, aucun chantier avant la partie 07 → placer F.15/F.16 après la partie 07.
