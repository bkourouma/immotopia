# Partie I — Syndic copropriété et portail copropriétaire

Domaine « Syndic copropriete » du wiki (127 sous-fonctionnalités éligibles au
pack Opérateur intégré, sur 129 — les deux rattachées au pack `CORE`, gestion
de la signature/du cachet de l'**agence**, sont hors périmètre : elles ne
portent pas « Opérateur intégré » dans leur colonne Pack(s)) et domaine
« Portails externes », module `MODULE_SYNDIC` (12 sous-fonctionnalités du
portail copropriétaire).

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`, `SUBSCRIPTION_ENFORCEMENT=enforce`).

## Prérequis

Objets déjà créés par les parties précédentes (à ne pas recréer) :

- Partie 01 : opérateur « Groupe Intégré Recette OI » (pack Opérateur
  intégré), administrateur Awa Konaté OI, collaborateurs Moussa Diarra OI
  (gestionnaire), Salif Coulibaly OI (agent), Fanta Touré OI (comptable).
- Partie 02 : immeuble « Résidence Les Palmiers OI » avec les appartements
  « Palmiers A1 », « Palmiers A2 », « Palmiers A3 » (A3 encore libre, sans
  bail — utilisé en I.3 pour l'import de lots).
- Partie 03 : contacts CRM Kouassi Yao OI (propriétaire), Aminata Traoré OI
  (locataire), Mariam Koné OI (acquéreuse), **Ibrahim Diallo OI**
  (copropriétaire, `copro.oi@recette.test`) — tous membres de l'agence.
- Partie 06 : au moins un modèle de document et une campagne de communication
  existants (sans effet direct sur cette partie).

## Réalité de l'environnement

- **Aucun écran ne permet de lier une copropriété à un immeuble.** L'API
  (`createSyndicate`/`updateSyndicate`, `apps/web/src/services/syndic-service.ts`
  lignes 138 et 161) accepte `propertyId`, et le wiki le documente comme
  paramètre d'entrée des deux routes — mais ni le tiroir « Créer une
  copropriété » (`SyndicsList.tsx`, formulaire des lignes 213-244) ni le
  modal « Modifier la copropriété » (`SyndicDetail.tsx`, lignes 580-639)
  n'exposent de champ pour le choisir : `initialValues={{ propertyId:
undefined }}` est posé sans aucun `<Form.Item name="propertyId">`
  correspondant. Une copropriété créée par clics n'est donc **jamais**
  rattachable à un immeuble depuis l'interface — champ mort côté web, à
  signaler. « Copro Les Cocotiers OI » sera créée sans immeuble lié.
- **« Créer un budget » ne pose jamais qu'une seule ligne.** Le formulaire
  (`SyndicBudgets.tsx` lignes 158-190) n'a ni répéteur ni bouton « Ajouter une
  ligne » — contrairement à son équivalent du module Promoteur
  (`BudgetChantier.tsx`) — et envoie systématiquement `lines: [{ category,
description, amountForecast: totalAmount, distributionKey, fundId }]`, une
  ligne unique. Le contrat serveur accepte pourtant plusieurs lignes
  (`lines[]`, au moins une). Impossible donc, par clics, de poser un budget à
  plusieurs postes distincts (nettoyage + gardiennage + ascenseur, par
  exemple) en une seule création : chaque poste veut son propre budget, ou
  passe par un avenant après coup.
- **Le champ « Catégorie principale » d'un budget est un texte libre**, pas un
  sélecteur sur le plan comptable de la copropriété : aucune vérification ne
  rapproche cette catégorie d'un `ChartOfAccount` créé en I.13.
- **L'ancienne route de paiement (`POST .../charges/:chargeId/pay`) n'est
  appelée par aucun écran.** `recordChargePayment`
  (`apps/web/src/services/syndic-service.ts` ligne 256) existe côté service
  mais n'est importé nulle part dans `pages/` ni `components/` : tout
  paiement de charges passe désormais par `LotPaymentModal`
  (`/lots/:lotId/paiements`, moteur d'affectation par lot, I.9). La
  sous-fonctionnalité du wiki reste donc fonctionnellement couverte (même
  résultat observable : reçu et quittance émis), mais son point d'entrée
  historique précis n'a plus de bouton dédié.
- **Libellés non traduits (mineurs).** Dans `SyndicDocuments.tsx`, les options
  de type de document `Reglement`, `Diagnostic`, `Assurance`, `Budget` et
  `Autre` sont des chaînes françaises codées en dur, pas des appels à `t()` (à
  la différence de `Proces-verbal AG`) ; de même la clé de distribution
  `Manuelle` dans `SyndicBudgets.tsx`. Sans effet visible en français, mais
  ces libellés ne seront jamais traduits en anglais ni en arabe.
- **Émission automatique des appels de charges programmés** (tâche
  `syndic-charge-call-scheduler`, wiki ligne « Émettre automatiquement… ») :
  tâche planifiée sans route ni écran, non déclenchable depuis le navigateur.
  Elle peut avoir tourné entre deux étapes de cette partie si l'agent la
  rejoue à cheval sur minuit ; à consigner sans le traiter comme un échec.
- **Cache des droits d'agence (30 s)** : après une action du super-admin sur
  l'abonnement (partie 09), recharger la page et attendre au besoin 30
  secondes avant de conclure à une anomalie.

## I.1 — Trois copropriétés et l'agence mandante

**Compte :** admin.oi@recette.test
**Action :** Syndic › Copropriétés (`/tenant/:tenantId/syndics`). D'abord
Syndic › Agences mandantes (`/tenant/:tenantId/syndics/mandants`) :
« Nouvelle agence mandante » — nom `Cabinet Gestion Partenaire OI`,
dénomination légale `Cabinet Gestion Partenaire OI SARL`, adresse
`Cocody Danga, Abidjan`, RCCM `CI-ABJ-2020-B-99887`, identifiant fiscal
`2099887X`. Une fois créée, rouvrir la fiche et déposer un logo, une
signature et un cachet (trois images PNG/JPG quelconques). Revenir sur
Copropriétés, « Nouvelle copropriété » trois fois : `Copro Les Cocotiers OI`
(adresse `Riviera Golf, Abidjan`, référence cadastrale `CAD-OI-2026-001`,
agence mandante `Cabinet Gestion Partenaire OI`) ; `Copro Plateau OI`
(adresse `Plateau, avenue Chardy, Abidjan`, pas de mandant) ; `Copro Marcory
OI` (adresse `Marcory Zone 4, Abidjan`, pas de mandant).
**Attendu :** Agence mandante créée (« Vous pouvez maintenant ajouter son
logo, sa signature et son cachet. ») ; les trois images se déposent sans
erreur (`hasLogo/hasSignature/hasStamp` passent à vrai) ; les trois
copropriétés apparaissent dans la liste, celle des Cocotiers affichant le nom
du mandant sur sa carte.
**Couvre :** Copropriétés / Lister les copropriétés ; Créer une copropriété ;
Identité des documents (agences mandantes) / Lister les agences mandantes ;
Créer une agence mandante ; Consulter une agence mandante ; Gérer le logo
d'un mandant ; Gérer la signature et le cachet d'un mandant

## I.2 — Fiche de la copropriété Cocotiers, logo propre, modification

**Compte :** admin.oi@recette.test
**Action :** Ouvrir « Copro Les Cocotiers OI ». Consulter le détail (infos
générales, lots, appels de charges — vides pour l'instant). Bouton
« Modifier » : exercice `1`, gestionnaire (contact CRM) `Kouassi Yao OI`,
statut **Active** (déjà le cas). Enregistrer. Carte « Logo de la
copropriété » : déposer une image PNG/JPG distincte de celle du mandant.
**Attendu :** Détail affiche 0 lot, 0 appel ; modification enregistrée
(« Copropriété mise à jour »), gestionnaire affiché = Kouassi Yao OI ; logo
de la copropriété déposé indépendamment de celui du mandant (les deux
coexistent, le logo de la copropriété complète celui du mandant sur les
documents).
**Couvre :** Copropriétés / Consulter le détail d'une copropriété ; Modifier
une copropriété ; Identité des documents (copropriété) / Gérer le logo d'une
copropriété

## I.3 — Lots C01 à C04, import depuis un bien existant, correction

**Compte :** admin.oi@recette.test
**Action :** Copro Cocotiers › onglet Lots. « Nouveau lot » quatre fois :
`C01` (Appartement, tantièmes généraux **120**, propriétaire CRM
`Ibrahim Diallo OI`, propriétaire depuis aujourd'hui) ; `C02` (Appartement,
**120**, propriétaire `Kouassi Yao OI`) ; `C03` (Bureau, **100**, propriétaire
`Mariam Koné OI`) ; `C04` (Parking, **40**, propriétaire `Ibrahim Diallo OI`).
Corriger `C01` : tantièmes spéciaux **20**. Copro Plateau OI › onglet Lots ›
« Importer des biens » : sélectionner « Palmiers A3 ». Retour sur Cocotiers,
tenter « Supprimer cette copropriété » depuis la liste des copropriétés.
**Attendu :** Quatre lots créés avec leur propriétaire ; correction de C01
enregistrée (« Lot mis à jour ») ; import sur Plateau crée un lot à partir de
« Palmiers A3 » (résumé « 1 lot(s) importé(s) avec succès ») ; suppression de
Cocotiers **refusée** (409 : la copropriété porte des lots, elle n'est pas
vide) — aucune donnée perdue, message d'erreur affiché.
**Couvre :** Copropriété (lots, prestataires, incidents) / Lister les lots
d'une copropriété ; Créer un lot ; Importer des lots depuis des biens
existants ; Modifier un lot ; Copropriétés / Supprimer une copropriété
(refus)

## I.4 — Profils propriétaires/locataires, portail, affectation locataire

**Compte :** admin.oi@recette.test
**Action :** Copro Cocotiers › onglet « Profils et incidents ». « Profil
propriétaire » quatre fois, un par lot (C01→Ibrahim Diallo OI 100 %, C02→
Kouassi Yao OI 100 %, C03→Mariam Koné OI 100 %, C04→Ibrahim Diallo OI 100 %),
date de début = aujourd'hui, accès portail activé pour C01 et C04 (Ibrahim),
désactivé pour les deux autres pour l'instant. Sur le profil de Kouassi Yao
OI (C02), « Inviter au portail » puis, aussitôt après, « Révoquer l'accès »
(démonstration du couple invite/révoque, sans laisser Kouassi Yao OI avec un
accès actif). Sur le profil d'Ibrahim Diallo OI (C01), « Inviter au
portail » : copier le lien affiché (c'est `INVITE_COPRO` pour I.16). Onglet
Lots, sur C02 : « Ajouter un locataire » → contact `Aminata Traoré OI`, dates
de début/fin, charges non facturées au locataire. « Profil locataire » pour
Aminata Traoré OI sur C02 (mêmes dates, `chargesBilledToTenant` = non). Pour
finir, désactiver l'affectation locataire de C02.
**Attendu :** Quatre profils propriétaires créés (« Profil propriétaire
créé ») ; invitation/révocation sur Kouassi Yao OI réussies (« Accès au
portail révoqué ») ; invitation d'Ibrahim Diallo OI affiche « Accès au
portail ouvert », lien `http://localhost:3311/...` avec bouton « Copier » —
copier `INVITE_COPRO` ; affectation locataire créée puis désactivée sans
erreur ; profil locataire créé (« Profil locataire créé »).
**Couvre :** Copropriété (lots…) / Lister les profils propriétaires de lot ;
Créer un profil propriétaire de lot ; Modifier un profil propriétaire de
lot ; Inviter un copropriétaire au portail ; Révoquer l'accès portail d'un
copropriétaire ; Lister les profils locataires de lot ; Créer un profil
locataire de lot ; Modifier un profil locataire de lot ; Affecter un
locataire à un lot ; Désactiver une affectation locataire

## I.5 — Prestataires, contrats, incidents et imputations

**Compte :** admin.oi@recette.test
**Action :** Copro Cocotiers › onglet Prestataires. « Nouveau prestataire » :
`Net Propreté OI`, spécialité `Nettoyage parties communes`, e-mail/téléphone
de test. « Nouveau contrat » : prestataire `Net Propreté OI`, nature
`Nettoyage des parties communes 2026`, début aujourd'hui, montant annuel
**2 400 000**, alerte renouvellement **60** jours. Modifier le prestataire
(téléphone corrigé). Onglet « Profils et incidents » : « Nouvel incident » —
déclarant `Ibrahim Diallo OI`, type `Fuite d'eau`, urgence Haute, lot C01,
description `Fuite sous l'évier de la cuisine, partie commune touchée`.
Modifier l'incident : statut **Assigné**, prestataire `Net Propreté OI`.
Imputer un coût : type `Budget syndic`, montant **50 000**. Sur un second
prestataire de test (`Sécurité Éphémère OI`, sans contrat ni incident),
« Supprimer ».
**Attendu :** Prestataire et contrat créés ; modification enregistrée ;
incident créé (« Incident créé »), puis mis à jour avec le prestataire
assigné (« Prestataire assigné à l'incident ») ; imputation enregistrée
(« Imputation enregistree ») ; suppression du second prestataire réussie
(aucun contrat ni incident lié) — une suppression sur `Net Propreté OI`
aurait été refusée (409, contrat et incident liés).
**Couvre :** Copropriété (lots…) / Lister les prestataires (+contrats+actifs
communs) ; Créer un prestataire ; Modifier un prestataire ; Supprimer un
prestataire ; Lister les contrats liés à la copropriété ; Créer un contrat de
maintenance ; Consulter un contrat de maintenance ; Modifier un contrat de
maintenance ; Lister les incidents copropriété ; Créer un incident
copropriété ; Modifier un incident copropriété ; Imputer un coût à un
incident

## I.6 — Fonds et budget de la copropriété Cocotiers

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances (`/tenant/:tenantId/syndics/:syndicId/finances`).
« Nouveau fonds » : nom `Fonds de roulement OI`, solde initial **500 000**.
Syndic › Budgets. « Nouveau budget » : exercice **2026**, libellé
`Charges courantes 2026`, montant total **24 000 000**, catégorie
`Charges courantes`, description `Nettoyage, gardiennage, ascenseur`, clé
« Tantièmes généraux », fonds alimenté `Fonds de roulement OI`. « Approuver »
le budget. « Répartir » : recalculer l'allocation par lot. Bouton « Postes et
fonds » : vérifier que la ligne pointe déjà vers `Fonds de roulement OI` (ou
le réaffecter si besoin). « Générer appels » : libellé `Appel T1 2026`,
période `2026-T1`, échéance dans 30 jours, type Régulier.
**Attendu :** Fonds créé, solde 500 000 ; budget créé en brouillon puis
**Approuvé** (`approvedAt` daté) ; répartition calculée pour C01-C04 au
prorata des tantièmes généraux (120/120/100/40, soit 380 au total) ; postes
et fonds affiche le rattachement au fonds ; génération crée un lot d'appels
(un par lot), montant proportionnel à l'allocation de chacun, total
**24 000 000**.
**Couvre :** Finances / Lister les fonds financiers ; Créer un fonds ;
Lister les budgets ; Créer un budget ; Voter/approuver un budget ; Recalculer
la répartition budgétaire par lot ; Générer les appels de charges depuis un
budget ; Affecter un poste de budget à un fonds

## I.7 — Appels de charges manuels et batches

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances › Appels de charges. « Nouvel appel de
charges » : cible « Un lot » → C01, libellé de période `2026-Avril`, montant
**45 000**, échéance dans 15 jours, fonds alimenté `Fonds de roulement OI`.
Puis un second, cible « Tous les lots », libellé `2026-Mai (exceptionnel)`,
montant **20 000**, échéance dans 30 jours, sans fonds. Lister les batches
d'appels de charges (le batch T1 de I.6, plus ce dernier). Ouvrir le détail
de l'appel de C01. Sur cet appel, « Télécharger » l'avis d'appel PDF.
Affecter cet appel à un fonds différent si besoin (revenir à
`Fonds de roulement OI`).
**Attendu :** Premier appel créé sur C01 (« Appel de charges créé ») ;
second créé sur les quatre lots (« 4 appels de charges créés ») ; liste des
batches cohérente ; détail de l'appel de C01 affiche montant, lot,
copropriétaire, statut **En attente** ; le PDF de l'avis d'appel se
télécharge sans erreur ; l'affectation au fonds se confirme
(« Affectation au fonds enregistrée »).
**Couvre :** Finances / Lister les appels de charges ; Créer un appel de
charges ; Consulter un appel de charges ; Lister les batches d'appels de
charges ; Créer un batch d'appels de charges (manuel) ; Télécharger l'avis
d'appel de charges (PDF) ; Affecter un appel de charges à un fonds

## I.8 — Programmation des appels de charges

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances › Programmation. « Nouvelle programmation » de
test : libellé `Test à supprimer`, fréquence Mensuelle, jour d'émission 1,
échéance à 10 jours, source `Montant fixe` **10 000**, date de début demain —
puis, avant toute exécution, « Supprimer » cette programmation. En créer une
seconde, réelle : libellé `Charges trimestrielles Cocotiers`, fréquence
Trimestrielle, jour d'émission 5, échéance à 20 jours, source `Budget
approuvé` (le budget de I.6), date de début aujourd'hui. « Aperçu » des trois
prochaines périodes. « Exécuter maintenant ». « Mettre en pause », puis
« Reprendre ». Consulter l'historique d'exécution.
**Attendu :** Première programmation supprimée définitivement
(`{deleted: true}`, rien émis) ; seconde créée (`nextRunAt` = aujourd'hui ou
après) ; aperçu affiche 3 périodes à venir avec montants par lot ;
exécution manuelle émet la période due (appels créés, avis envoyés aux
copropriétaires en reste à payer) ; mise en pause puis reprise recalculent
`active`/`nextRunAt` ; historique liste l'exécution manuelle (déclencheur
`Manuelle`, statut **Réussie**).
**Couvre :** Finances / Lister les programmations d'appels de charges ;
Consulter une programmation d'appels de charges ; Créer une programmation
d'appels de charges ; Modifier une programmation d'appels de charges ;
Supprimer une programmation d'appels de charges ; Mettre en pause une
programmation ; Reprendre une programmation ; Exécuter maintenant une
programmation ; Consulter l'historique d'exécution d'une programmation ;
Prévisualiser les prochaines périodes d'une programmation

## I.9 — Paiement du lot C01 avec affectation, compte du lot

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Syndic › Copropriété › onglet Lots, sur C01, bouton « Compte ».
Consulter le solde et l'historique (vide). Retour aux appels de charges,
« Enregistrer un paiement » : lot C01, montant **65 000** (couvre l'appel
d'avril de 45 000 et une partie de celui de mai), date du jour, mode
Espèces ; cocher les deux appels ouverts de C01 dans l'aperçu avant de
valider. Consulter à nouveau le compte du lot C01 : transactions, avance
disponible. Ajouter un ajustement manuel : crédit **5 000**, libellé
`Trop-perçu de bienvenue`. Télécharger le relevé de compte du lot en PDF.
**Attendu :** Compte du lot ouvert automatiquement à la première consultation
(solde 0) ; paiement enregistré, aperçu affiche l'affectation aux deux
appels (45 000 + 20 000 = 65 000, aucune avance restante) ; deux appels
passent à **Payé** ; reçu et quittances émis pour chacun ; compte du lot
affiche les mouvements (appels, paiement) ; ajustement manuel visible en
transaction `ADJUSTMENT` ; relevé PDF téléchargé sans erreur.
**Couvre :** Finances / Consulter le compte d'un lot copropriétaire ; Lister
les transactions du compte d'un lot ; Créer un ajustement de compte lot ;
Télécharger le relevé de compte lot (PDF) ; Enregistrer un paiement de lot
avec affectation ; Prévisualiser l'affectation d'un paiement de lot ;
Consulter l'avance d'un lot ; Lister les appels ouverts d'un lot

## I.10 — Suivi mensuel, quittances et reçus

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances › Suivi mensuel, exercice **2026**. Syndic ›
Finances › Quittances : lister les quittances/reçus de la copropriété,
filtrer par lot C01. Depuis la fiche du lot C01, ouvrir « Mes quittances »
équivalent côté agence (liste des reçus/quittances du lot). Télécharger un
reçu, puis « Renvoyer par e-mail ». Imprimer une grille de quittances (1×1)
sur la période du mois en cours. Cliquer « Générer les quittances
manquantes ».
**Attendu :** Grille mois × lot affichant C01 en **Réglé** (payé au H.9) et
les trois autres en **Dû** ou **En retard** selon l'échéance ; liste de
quittances/reçus affichant les deux documents émis par le paiement de I.9 ;
téléchargement PDF réussi ; renvoi confirmé (« Document renvoyé par
e-mail. », limité en fréquence par `receiptResendRateLimiter`) ; impression
grille génère un PDF imprimable ; génération des manquantes renvoie
`{created: 0, skipped: N}` (aucun appel PAID sans quittance à ce stade).
**Couvre :** Finances / Consulter le suivi mensuel d'une copropriété ; Lister
les quittances et reçus d'une copropriété ; Lister les quittances et reçus
d'un lot ; Télécharger un reçu ou une quittance ; Renvoyer une quittance ou
un reçu par e-mail ; Imprimer les quittances en grille ; Générer les
quittances manquantes

## I.11 — Recouvrement des impayés (C03 et C04)

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances › Recouvrement. Consulter le tableau de bord
des retards (C03 et C04, non payés). « Relance manuelle » sur l'appel de mai
de C03, canal Email, niveau 1. « Lancer les relances groupées ». « Appliquer
pénalité » sur l'appel d'avril de C04 : taux **5** %, jours de retard
**10**. Sur cette pénalité, « Remise » avec motif
`Geste commercial recette`. « Créer un échéancier » sur l'appel de mai de C03
: montant total 20 000, deux échéances de 10 000 à 15 et 30 jours.
**Attendu :** Dashboard affiche C03/C04 en retard, montants dus ; relance
manuelle créée et notifiée ; batch de relances traite les appels en retard
restants (niveau incrémenté, plafonné à 4) ; pénalité créée, débite le
compte de C04 ; remise appliquée, crédite le montant remis, `waived: true` ;
échéancier créé (deux échéances, somme = montant total).
**Couvre :** Finances / Dashboard des retards ; Lister les relances de
paiement ; Créer une relance manuelle ; Lancer un batch de relances
automatique ; Lister les pénalités de retard ; Créer une pénalité de
retard ; Remettre (annuler) une pénalité ; Créer un échéancier de paiement ;
Lister les échéanciers de paiement

## I.12 — Fonds : renommer, ajuster, synthèse financière

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances, section Fonds. « Renommer » `Fonds de
roulement OI` en `Fonds de roulement Cocotiers OI`. « Ajuster le solde » :
débit **30 000**, motif `Achat de fournitures de nettoyage`, nature Dépense.
« Historique des mouvements » du fonds. Consulter la synthèse financière de
la copropriété (soldes des fonds, total appelé/payé/restant, retard).
**Attendu :** Fonds renommé (« Fonds renommé ») ; ajustement enregistré
(« Solde du fonds ajusté »), nouveau solde = 500 000 + 65 000 (encaissé sur
les appels de C01 alimentés) − 30 000 (si le solde devient négatif, un
avertissement l'indique — ce n'est pas bloqué) ; historique liste
`OPENING`, `CHARGE_PAYMENT`, `MANUAL_EXPENSE` ; synthèse cohérente avec les
appels et paiements des étapes précédentes.
**Couvre :** Finances / Renommer un fonds ; Ajuster le solde d'un fonds ou
saisir une dépense ; Synthèse financière de la copropriété

## I.13 — Comptabilité de la copropriété

**Compte :** admin.oi@recette.test
**Action :** Syndic › Finances › Comptabilité. « Nouveau compte » : numéro
`706100`, intitulé `Produits des appels de charges`, classe 7, type Produit.
« Nouveau journal » : type Charges, libellé `Journal des charges`, code `JC`,
exercice 2026. « Nouvelle écriture » : journal `JC`, date du jour, référence
`OD-OI-001`, description `Régularisation`, deux lignes équilibrées (débit
5 000 / crédit 5 000 sur deux comptes existants). « Verrouiller » cette
écriture. Consulter la balance générale et le grand livre filtré sur le
compte créé.
**Attendu :** Compte et journal créés ; écriture créée puis verrouillée
(« Écriture verrouillée », `isLocked: true`, plus aucune modification
possible) ; balance affiche l'équilibre global (`isBalanced: true`) ; grand
livre liste les lignes de l'écriture avec compte, journal et lot le cas
échéant.
**Couvre :** Finances / Lister le plan comptable de la copropriété ; Créer un
compte du plan comptable ; Lister les journaux comptables ; Créer un journal
comptable ; Lister les écritures comptables ; Créer une écriture comptable ;
Verrouiller une écriture comptable ; Consulter la balance comptable ;
Consulter le grand livre général

## I.14 — Documents de la copropriété

**Compte :** admin.oi@recette.test
**Action :** Syndic › Assemblées et documents › Documents. « Ajouter un
document » : titre `Règlement de copropriété — Cocotiers`, type Reglement,
fichier PDF/image de test. Lister, filtrer par type Reglement. Télécharger le
fichier déposé.
**Attendu :** Document créé (« Document ajoute »), apparaît dans la liste et
le filtre ; téléchargement réussi (fichier privé servi par route
authentifiée, jamais `/uploads`).
**Couvre :** Assemblées et documents / Lister les documents de copropriété ;
Déposer un document de copropriété ; Télécharger le fichier d'un document de
copropriété

## I.15 — Assemblée générale : ordre du jour, résolutions, votes, pouvoir

**Compte :** admin.oi@recette.test
**Action :** Syndic › Assemblées et documents › Assemblées générales.
« Nouvelle assemblée » : type Ordinaire, date/heure dans une semaine, lieu
`Salle de réunion Cocotiers`, une résolution initiale `Approbation du budget
2026` (règle article 24). Ouvrir le détail : « Ajouter un point à l'ordre du
jour » (`Point divers`, discussion `Questions diverses des copropriétaires`).
« Ajouter une résolution » : `Renouvellement du contrat de nettoyage`. Sur
cette AG, « Ajouter un pouvoir » : mandant `Mariam Koné OI` (C03), mandataire
`Kouassi Yao OI`. « Ouvrir la séance ». Enregistrer les votes de chaque lot
sur les deux résolutions (C01/C02/C04 Pour, C03 représenté par son
mandataire, vote Pour). « Clôturer la séance ». « Générer compte rendu Word ».
**Attendu :** Assemblée créée (statut **Planifiée**) ; point et résolution
ajoutés ; pouvoir créé (Mariam ≠ mandataire, un seul pouvoir par mandant) ;
ouverture passe le statut à **Séance ouverte** ; chaque vote recalcule
immédiatement quorum et résultat ; clôture fige les votes (« Séance
clôturée : les votes sont figés »), quorum et tally visibles pour les deux
résolutions ; le fichier `.docx` du compte rendu se télécharge, nommé
`compte-rendu-<meetingId>.docx`.
**Couvre :** Assemblées et documents / Lister les assemblées générales ;
Convoquer une assemblée générale ; Modifier une assemblée (dates, statut) ;
Consulter le détail d'une assemblée ; Ajouter une résolution à une
assemblée ; Ajouter un point à l'ordre du jour ; Modifier un point de l'ordre
du jour ; Supprimer un point de l'ordre du jour (sur un point de test créé
puis retiré) ; Enregistrer le vote d'un lot sur une résolution ; Lister les
pouvoirs d'une assemblée ; Créer un pouvoir (procuration) ; Supprimer un
pouvoir (procuration) (sur un pouvoir de test créé puis retiré avant
ouverture) ; Générer le procès-verbal

## I.16 — Portail copropriétaire d'Ibrahim Diallo OI : lots, comptes, appels

**Compte :** copro.oi@recette.test (voir `INVITE_COPRO` copié en I.4)
**Action :** Ouvrir `INVITE_COPRO` dans une fenêtre privée, définir le mot de
passe (déjà en base d'après le cadre commun : `RecetteOI#2026`, ou le
choisir si le lien demande une première définition). Se connecter. Onglet
« Mes lots » (`/copropriete`) : consulter C01 et C04. Ouvrir le compte de
C01 (solde, mouvements). Onglet « Appels » (`/copropriete/appels`) :
consulter les appels de C01/C04, télécharger l'avis d'appel PDF d'un appel
non soldé de C04.
**Attendu :** Connexion réussie, tableau de bord copropriétaire ; « Mes
lots » liste C01 et C04 uniquement (pas C02 ni C03, hors périmètre) avec
solde et sens (créditeur pour C01 après le paiement de I.9) ; compte de C01
affiche les mêmes mouvements que côté agence ; appels de C01/C04 visibles en
lecture seule (aucun paiement en ligne) ; téléchargement de l'avis d'appel
réussi pour un appel du périmètre, refusé (404) pour un appel hors
périmètre si testé par erreur.
**Couvre :** Portail Copropriétaire (Portails externes) / Consulter mes
lots ; Consulter le compte d'un lot ; Consulter mes appels de charges ;
Télécharger l'avis d'appel de charges (portail copropriétaire) ; Syndic
copropriete › Portail copropriétaire (hors menu agence) / Lister ses lots ;
Consulter le compte de son lot ; Lister ses appels de charges (portail
copropriétaire)

## I.17 — Portail copropriétaire : documents, assemblées, paiements, quittances, suivi, fiche

**Compte :** copro.oi@recette.test
**Action :** Onglet « Documents » (`/copropriete/documents`) : ouvrir/
télécharger le règlement déposé en I.14 (le PV de l'AG de I.15 n'apparaît pas
ici tant qu'il n'a pas été déposé manuellement dans le coffre — voir
« Réalité de l'environnement » de la partie 09 le cas échéant). Onglet
« Assemblées » (`/copropriete/assemblees`) : ouvrir l'AG de I.15, vérifier
que seuls les votes des lots d'Ibrahim (C01, C04) sont indiqués comme « Votre
vote », jamais ceux de C02/C03. Menu « Plus » : « Mes paiements »
(`/copropriete/paiements`) — le paiement de I.9 sur C01, ses affectations,
l'avance restante. « Mes quittances » (`/copropriete/quittances`) —
télécharger un reçu et une quittance. « Suivi mensuel »
(`/copropriete/suivi-mensuel`) sur C01 : grille des mois de l'exercice.
« Ma copropriété » (`/copropriete/ma-copropriete`) : fiche de Copro Les
Cocotiers OI (adresse, immatriculation, nombre de lots, mes lots, émetteur —
`Cabinet Gestion Partenaire OI`, contact du syndic).
**Attendu :** Documents filtrés au règlement (et à un éventuel PV déposé) ;
assemblée affichée avec résolutions et tallies si clôturée, `myVotes`
restreint aux lots du copropriétaire ; paiements et quittances cohérents
avec I.9/I.10 (jamais de moyen de payer en ligne) ; suivi mensuel de C01
affiche le mois en cours réglé ; fiche de copropriété affiche le mandant
`Cabinet Gestion Partenaire OI` comme émetteur, son logo et celui de la
copropriété (jamais signature ni cachet, réservés aux documents PDF).
**Couvre :** Portail Copropriétaire (Portails externes) / Consulter les
documents de copropriété ; Consulter les assemblées générales ; Consulter mes
paiements ; Consulter mes reçus et quittances ; Télécharger un reçu ou une
quittance ; Consulter le suivi mensuel d'un lot ; Consulter la fiche de sa
copropriété ; Télécharger le relevé de compte d'un lot ; Syndic copropriete
› Portail copropriétaire (hors menu agence) / Lister les documents
visibles ; Télécharger un document ; Lister les assemblées de sa
copropriété

## Couverture

| Fonctionnalité                                                  | Sous-fonctionnalités couvertes                                                                                                                                                                                                                                                                                        | Étapes        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Copropriétés                                                    | Lister, créer, consulter, modifier, supprimer (refus)                                                                                                                                                                                                                                                                 | I.1, I.2, I.3 |
| Copropriété (lots, prestataires, incidents)                     | Lots (lister/créer/importer/modifier/affecter-désactiver locataire), profils propriétaires/locataires (lister/créer/modifier/inviter/révoquer), incidents (lister/créer/modifier/lier maintenance/imputer), prestataires (lister/créer/modifier/supprimer), contrats (lister/lier/créer/consulter/modifier/supprimer) | I.3, I.4, I.5 |
| Finances                                                        | Budgets, fonds, appels de charges, programmation, paiements de lot, compte de lot, suivi mensuel, quittances, recouvrement, comptabilité (voir détail dans chaque étape)                                                                                                                                              | I.6 à I.13    |
| Assemblées et documents                                         | Documents (lister/déposer/télécharger), assemblées (lister/convoquer/modifier/détail/résolutions/ordre du jour/votes/pouvoirs/compte rendu)                                                                                                                                                                           | I.14, I.15    |
| Identité des documents (agences mandantes, copropriété)         | Mandantes (lister/créer/consulter/logo/signature-cachet), logo de copropriété                                                                                                                                                                                                                                         | I.1, I.2      |
| Portail copropriétaire (Syndic copropriete + Portails externes) | Lots, compte, appels, avis PDF, documents, assemblées, paiements, quittances, suivi mensuel, fiche de copropriété                                                                                                                                                                                                     | I.16, I.17    |

Sous-fonctionnalités non couvertes (avec raison) :

- **Enregistrer un paiement (recouvrement)** — route historique
  `POST /charges/:chargeId/pay` : aucun écran ne l'appelle
  (`recordChargePayment` inutilisé, voir « Réalité de l'environnement ») ; la
  même fonction observable (paiement, allocations, reçu, quittance) est
  couverte par I.9 via la route plus récente `/lots/:lotId/paiements`.
- **Émettre automatiquement les appels de charges programmés** : tâche
  planifiée (`syndic-charge-call-scheduler`), sans route ni écran, non
  déclenchable depuis le navigateur — équivalent manuel testé en I.8
  (« Exécuter maintenant »).
- **Consulter la signature et le cachet de l'agence** / **Gérer la signature
  et le cachet de l'agence** (Identité des documents, domaine CORE) : colonne
  Pack(s) = `CORE`, ne contient pas « Opérateur intégré » — hors périmètre de
  cette partie par construction du wiki.
