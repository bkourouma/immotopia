Scénario de recette — Un syndic en essai, de la création du compte à la clôture de l'exercice
Parcours complet ImmoTopia, joué par clics dans l'interface web : le super-admin crée le cabinet de syndic Horizon Syndic Gestion avec le pack Syndic en période d'essai ; l'administratrice configure tout (équipe, agence mandante, copropriété, lots, copropriétaires, fonds, prestataires, comptabilité, documents) ; on déroule ensuite l'exercice 2026 entier de la Résidence Les Flamboyants (8 lots, 1 000 tantièmes) — budget, appels trimestriels, encaissements de tous types, avances, reçus et quittances, assemblée extraordinaire, appels de travaux, factures et paiements des prestataires, incident, recouvrement, appels automatiques, portail copropriétaire — jusqu'à l'arrêté des comptes au 31/12/2026, l'assemblée d'approbation des comptes et l'ouverture de l'exercice 2027.

Tous les montants sont choisis pour tomber rond : chaque résultat attendu est calculable à la main et recoupé en fin de document (annexe A).

Rédigé le 28/09/2026 d'après le code de main (b474b89, lots Syndic S1 à S6 et fonds #35 fusionnés). Scénarios voisins, plus ciblés : SCENARIO_SYNDIC_ABONNEMENT.md (quotas et dépassements) et SCENARIO_SYNDIC_MODULES.md (écran par écran).

Règles absolues — à relire avant chaque partie
Ne JAMAIS cliquer « Payer en ligne ». Le compte PaySecureHub de l'environnement local est en mode LIVE : un clic déclenche un paiement réel. Le bouton n'existe pas dans le module Syndic, mais il est visible ailleurs (page Abonnement, portail locataire) : ne jamais s'en approcher.
Aucun SMS, aucun WhatsApp. Un fournisseur SMS réel est configuré. Les contacts de ce scénario n'ont aucun numéro de téléphone ; dans toute liste « Canal », choisir Email, jamais SMS ni WhatsApp.
Adresses e-mail en @exemple.test uniquement. La création d'une assemblée, l'émission d'une quittance ou d'un avis d'appel envoient des e-mails automatiques : ils ne partent que vers ces adresses de test.
Rien supprimer, sauf les deux cas prévus en toutes lettres (facture saisie en double en I.5, paiement mal imputé en I.6 — et ce sont des annulations, pas des suppressions).
Aucune commande, aucun appel direct à l'API, aucun script. Si un écran ne montre pas ce que le document annonce, ou qu'une action semble impossible, s'arrêter et le consigner au journal (annexe D) plutôt que de contourner.
Ne jamais lancer npm run db:seed (efface la base de démonstration). 0. Environnement et conventions
0.1 Adresses
Élément Valeur
Instance de recette démo figée (npm run demo:sync, lancée par Baba avant le jeu)
Web http://localhost:3300
API http://localhost:8800 (jamais appelée directement)
Super-admin admin@immobillier.com — mot de passe de apps/web/src/dev/dev-accounts.ts
TENANT identifiant de l'agence créée en A.3 (lu dans l'adresse de sa fiche)
BASE http://localhost:3300/tenant/<TENANT>
COPRO identifiant de la Résidence Les Flamboyants (lu dans l'adresse en C.4)
S BASE/syndics/<COPRO> (raccourci utilisé dans tout le document)
0.2 Temps simulé
Le jeu se déroule en un ou deux jours réels (à partir du 28/09/2026), mais chaque opération porte la date de l'exercice simulé indiquée dans les tableaux (janvier 2026 à mars 2027). Aucun formulaire du module Syndic ne limite les dates : une date passée ou future est acceptée. Conséquences à connaître :

les écrans « en retard » comparent l'échéance à la date réelle du jour : la photographie du recouvrement (partie J) se prend après le 3ᵉ trimestre et avant la partie L ;
les numéros de reçus et de quittances suivent l'ordre de saisie, pas la date de paiement : respecter l'ordre des tableaux ;
si la tâche quotidienne des appels automatiques passe pendant le jeu (après le 01/10/2026), elle peut avoir émis le 4ᵉ trimestre avant L.3 : le consigner, ce n'est pas une anomalie.
0.3 Ce qui n'est pas une anomalie
Mode d'abonnement local warn : aucun quota ne bloque, tous les menus restent visibles, même les modules non souscrits.
Essai gratuit d'un mois coché et grisé, non désactivable ; aucune facture pendant l'essai.
Les parkings ne consomment pas de lot dans la jauge d'abonnement (seuls appartements, bureaux et commerces comptent).
Le lien d'invitation s'affiche à l'écran : on l'utilise même si l'e-mail n'a pas pu partir.
Les fonctions de clôture formelle d'exercice n'existent pas (voir N.8) : on les constate absentes, on ne les compte pas en échec du testeur.

1. Jeu de données
   1.1 L'agence (compte d'essai)
   Champ Valeur
   Nom de l'agence Horizon Syndic Gestion
   Nom de l'administrateur Aïcha Koné
   E-mail de l'administrateur aicha.kone@horizon-syndic.exemple.test
   Mot de passe (donnée de test) Horizon#2026 (8+ caractères, majuscule, chiffre, #)
   Packs Syndic seul
   Extensions aucune
   Cycle de facturation Mensuel
   Mise en route accompagnée non
   Plus d'options Raison sociale Horizon Syndic Gestion SARL, e-mail de contact contact@horizon-syndic.exemple.test, pays Côte d'Ivoire, ville Abidjan, adresse Plateau, avenue Chardy, immeuble Alpha 2000
   Pack Syndic (catalogue packages/api/src/lib/subscription/catalog.ts) : 49 900 FCFA HT/mois, mise en route facultative 150 000 FCFA, capacité 2 copropriétés et 100 lots, essai 30 jours, politique de dépassement par défaut « Facturer le dépassement », 7 jours de grâce.

1.2 L'équipe
Personne E-mail Rôle
Aïcha Koné aicha.kone@horizon-syndic.exemple.test Administrateur tenant (créée en A)
Yao Brou yao.brou@horizon-syndic.exemple.test Gestionnaire tenant
Mariam Diallo mariam.diallo@horizon-syndic.exemple.test Comptable tenant
Yao Brou est aussi créé comme contact CRM : c'est le gestionnaire de la copropriété.

1.3 L'agence mandante
Champ Valeur
Nom Cabinet Kouassi & Associés
Dénomination légale Kouassi & Associés SARL
Adresse Cocody Danga, rue des Jardins, villa 12, Abidjan
Téléphone laisser vide
E-mail contact@kouassi-associes.exemple.test
RCCM CI-ABJ-2019-B-14532
NIF 1914532K
Logo / Signature / Cachet trois petites images PNG ou JPG quelconques
1.4 La copropriété
Champ Valeur
Nom Résidence Les Flamboyants
Adresse Riviera Golf, rue des Flamboyants, lot 245, Cocody, Abidjan
Référence cadastrale CAD-CGY-2019-0245
N° d'immatriculation IMM-COP-2026-0017
Agence mandante Cabinet Kouassi & Associés
Exercice 1 (exercice calendaire, janvier–décembre)
Statut Active
Gestionnaire Yao Brou
1.5 Lots, tantièmes et copropriétaires
Lot Type Tantièmes généraux Tantièmes spéciaux (ascenseur) Copropriétaire (Propriétaire CRM) Propriétaire depuis le
A101 Appartement 150 250 Jean-Marc Kouadio 15/03/2019
A102 Appartement 150 250 Awa Traoré 15/03/2019
A201 Appartement 150 250 Sékou Bamba (indivision 50 % avec Fatim Bamba) 02/07/2021
A202 Appartement 150 250 Élise N'Guessan 10/01/2022
B01 Commerce 200 (vide) Pharmacie du Golf SARL 15/03/2019
B02 Bureau 100 (vide) Moussa Diabaté 01/09/2023
P01 Parking 50 (vide) Jean-Marc Kouadio 15/03/2019
P02 Parking 50 (vide) Awa Traoré 15/03/2019
Total 1 000 1 000 6 copropriétaires distincts
Locataire : A202 est loué à Arnaud Koffi depuis le 01/02/2026 (charges non refacturées au locataire).

1.6 Contacts CRM à créer (type Personne sauf mention, sans téléphone)
Prénom Nom E-mail Rôle dans le scénario
Yao Brou yao.brou@horizon-syndic.exemple.test gestionnaire de la copropriété
Jean-Marc Kouadio jm.kouadio@exemple.test A101 + P01, invité au portail
Awa Traoré awa.traore@exemple.test A102 + P02
Sékou Bamba sekou.bamba@exemple.test A201 (indivisaire 50 %)
Fatim Bamba fatim.bamba@exemple.test A201 (indivisaire 50 %)
Élise N'Guessan elise.nguessan@exemple.test A202 (bailleresse)
— Pharmacie du Golf SARL gerance@pharmaciedugolf.exemple.test B01 — type Entreprise si proposé, sinon Personne avec Nom Pharmacie du Golf SARL
Moussa Diabaté moussa.diabate@exemple.test B02 — le mauvais payeur
Arnaud Koffi arnaud.koffi@exemple.test locataire de A202
1.7 Fonds de la copropriété
Fonds Solde initial (reprise au 01/01/2026) Alimenté par
Fonds de roulement 1 500 000 poste du budget des charges courantes
Fonds de travaux 2 500 000 postes des budgets de travaux
1.8 Prestataires et contrats
Prestataire Spécialité E-mail Contrat (nature, montant annuel HT, période)
Ivoire Clean Services Nettoyage parties communes contact@ivoireclean.exemple.test Nettoyage des parties communes 2026, 1 800 000, 01/01–31/12/2026, alerte 60 j
Sécurité Plus CI Gardiennage contact@securiteplus.exemple.test Gardiennage 24h/24 2026, 3 600 000, 01/01–31/12/2026, alerte 60 j
Ascenseurs Élévation CI Ascenseur sav@elevation-ci.exemple.test Maintenance ascenseur 2026, 1 200 000, 01/01–31/12/2026, alerte 90 j
Énergie Distribution Test Électricité parties communes facturation@energie.exemple.test aucun contrat
Eau Distribution Test Eau parties communes facturation@eau.exemple.test aucun contrat
Assurances Lagune Test Assurance immeuble sinistres@lagune-assur.exemple.test aucun contrat
Plomberie Express Abidjan Plomberie devis@plomberie-express.exemple.test aucun — créé à la volée en G.3
Façades & Peinture CI Ravalement chantiers@facades-ci.exemple.test aucun contrat
1.9 Les chiffres clés de l'exercice 2026 (à retrouver en fin de parcours)
Élément Montant (FCFA)
Budget charges courantes 2026 (4 trimestres) 12 000 000
Appel travaux « Ravalement des façades » 4 000 000
Appel travaux « Câbles de l'ascenseur » 1 000 000
Total appelé 2026 17 000 000
Total encaissé auprès des copropriétaires 16 700 000
Reste dû au 31/12/2026 (B02, 4ᵉ trimestre) 300 000
Dépenses charges courantes (TTC) 10 836 300
Dépenses travaux (TTC) 4 484 000
Fonds de roulement au 31/12/2026 2 363 700
Fonds de travaux au 31/12/2026 3 016 000
Excédent des charges courantes (budget − réel) 1 163 700
Quote-part d'un tantième : 12 000 FCFA par an de charges courantes, soit 3 000 FCFA par trimestre.

Tantièmes Appel trimestriel Quote-part annuelle Ravalement (4 000/tantième)
150 450 000 1 800 000 600 000
200 600 000 2 400 000 800 000
100 300 000 1 200 000 400 000
50 150 000 600 000 200 000
Partie A — Création du compte en pack Syndic d'essai (super-admin)
A.1 Page /admin/tenants (Administration › Agences) — tiroir « Nouvelle agence »
Se connecter en super-admin sur http://localhost:3300/login.
Administration › Agences, bouton « Nouvelle agence ».
Remplir « Nom de l'agence », « Nom de l'administrateur », « E-mail de l'administrateur » (tableau 1.1).
Section « Packs » : cliquer la carte Syndic seule.
« Extensions » à 0, « Cycle de facturation » Mensuel, « Mise en route accompagnée » décochée.
Résultat attendu :

non terminé
Carte Syndic : 49 900 FCFA « / mois », cochée.
non terminé
Extensions proposées : lots supplémentaires (blocs de 10) et copropriétés supplémentaires ; pas de chantiers supplémentaires.
non terminé
« Essai gratuit d'un mois inclus (automatique, non désactivable) » : coché et grisé.
non terminé
Récapitulatif : Syndic 49 900, « Total HT mensuel » 49 900, « Total HT annuel (11 mois) » 548 900.
A.2 Devis en direct (sans valider)
Cocher « Mise en route accompagnée » : une ligne « Mise en route (frais uniques) » 150 000 apparaît hors total mensuel. La décocher.
Mettre « Copropriétés supplémentaires » à 1 : total mensuel 59 900 (49 900 + 10 000). Remettre à 0.
A.3 Plus d'options, puis création
« Plus d'options » : raison sociale, e-mail de contact, pays, ville, adresse (tableau 1.1).
« Créer l'agence ».
Résultat attendu :

non terminé
Écran « Agence créée » : Horizon Syndic Gestion prête à l'usage, « Packs Syndic, cycle mensuel », fin d'essai à J + 30 (le 28/10/2026 si le jeu démarre le 28/09/2026).
non terminé
« Lien d'invitation » http://localhost:3300/auth/accept-invite?token=… avec « Copier » : copier ce lien (INVITE).
non terminé
« E-mail d'invitation envoyé. » ou l'avertissement « L'e-mail n'a pas pu être envoyé — copiez le lien… » (les deux sont acceptables).
non terminé
« Ouvrir la fiche » → /admin/tenants/<TENANT> : noter TENANT.
non terminé
Onglet « Abonnement » : statut Essai, packs Syndic, politique Facturer le dépassement, jours de grâce 7, consommation Lots 0 / 100, Copropriétés 0 / 2.
Partie B — Invitation et première connexion
B.1 Accepter l'invitation (fenêtre de navigation privée)
Ouvrir INVITE dans une fenêtre privée.
Nom complet Aïcha Koné, mot de passe faible → valider.
Mot de passe et confirmation Horizon#2026 → valider.
Résultat attendu :

non terminé
faible refusé (longueur ou complexité).
non terminé
Message d'invitation acceptée, redirection vers /login?invite=accepted.
non terminé
Rouvrir INVITE : refus, invitation déjà utilisée.
B.2 Connexion et page Abonnement
Se connecter avec aicha.kone@horizon-syndic.exemple.test / Horizon#2026.
Ouvrir Paramètres › Abonnement (BASE/settings/abonnement).
Résultat attendu :

non terminé
Tableau de bord de l'agence Horizon Syndic Gestion.
