# Partie F — Finance

Domaine « Finance » du wiki, à l'exception des sous-fonctionnalités du module
**CONSTRUCTION** (suivi des chantiers, gestion du stock, salaires, tâcherons,
retenues de garantie), qui vont dans la partie 07 (Promoteur). Cette partie
couvre : caisse et trésorerie, saisie et validation, comptabilité, facturation
et balances, reversements et commissions (associations RENTAL côté Finance),
fournisseurs et commandes.

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`, `SUBSCRIPTION_ENFORCEMENT=enforce`).

## Prérequis

- Parties 01-04 déjà jouées : opérateur, collaborateurs, biens, baux
  « Palmiers A1 » et « Villa Riviera OI » actifs avec au moins un paiement de
  loyer enregistré (partie 04, étape E.10) — nécessaire pour que le journal
  comptable et les balances clients ne soient pas vides.
- Comptable Fanta Touré OI membre actif (`compta.oi@recette.test`).
- Aucun compte de trésorerie ni fournisseur créé au-delà de ceux déjà posés
  automatiquement par le paiement en ligne (partie 04, étape E.13, qui crée
  un compte de collecte PaySecureHub 5525 si aucun n'est choisi).

## Réalité de l'environnement

- **Rôles et permissions Finance très concentrés sur TENANT_ADMIN.** Par
  défaut, `FINANCE_DOCUMENTS_VALIDATE` (valider une pièce), `FINANCE_SITES_MANAGE`
  (chantiers) et `FINANCE_SETTINGS_MANAGE` (comptes de trésorerie,
  fournisseurs paramétrage) ne sont attribués **qu'à TENANT_ADMIN** dans les
  seeds ; Fanta Touré OI (TENANT_ACCOUNTANT) peut saisir et consulter
  (`FINANCE_DOCUMENTS_CREATE`, `FINANCE_ACCOUNTS_READ`, `FINANCE_REPORTS_READ`)
  mais ne peut **pas valider** une facture fournisseur, un règlement, une
  clôture de caisse ni créer un compte de trésorerie — ces actions
  demandent `admin.oi@recette.test`. Ce n'est pas une anomalie : une agence
  peut réattribuer ces permissions via Rôles et permissions, mais ce
  scénario utilise la configuration de seed telle quelle.
- **Validation d'une clôture de caisse : le validateur ne peut pas être le
  caissier lui-même.** Si Fanta Touré OI ouvre et clôture sa propre caisse,
  la validation doit être faite par un autre TENANT_ADMIN (Awa Konaté OI).
- **Import Excel de saisie en lot : aucune route API dédiée.** Le moteur
  d'import (`apps/web/src/lib/importation/execution.ts`) rejoue les points
  d'entrée POST déjà listés selon la nature détectée de chaque ligne ; un
  échec d'import peut donc renvoyer l'erreur du point d'entrée sous-jacent
  plutôt qu'une erreur d'import générique.
- **Rattachement fournisseur/chantier :** créer un fournisseur de type
  **Matériaux** (`MATERIALS`) exige, au niveau de la facture, un rattachement
  à un chantier — sans objet pour le fournisseur « BTP Sahel OI » de ce
  scénario si on le déclare **Services** ou **Mixte** ; le choisir en
  **Services** évite toute dépendance avec la partie 07 (Promoteur), non
  encore jouée à ce stade de la numérotation.
- **Aucune facture pendant l'essai / avant premier cycle** : sans objet ici
  (le pack Opérateur intégré du cadre commun est souscrit dès la création,
  hors essai gratuit d'un mois — à vérifier sur la fiche de l'agence côté
  super-admin si des montants inattendus apparaissent).

## F.1 — Ouvrir une session de caisse

**Compte :** compta.oi@recette.test
**Action :** Finance › Caisse et comptabilité › Caisse et trésorerie › Caisse
(`/tenant/:tenantId/finance/caisse`). Bouton « Ouvrir ma caisse » (si aucune
n'est ouverte) : Fond de départ **50 000** FCFA, note `Ouverture matinale`.
**Attendu :** Session créée (numéro `CAI-AAAA-NNNN`, statut **Ouverte**) ;
« Consulter ma caisse ouverte du jour » l'affiche désormais avec le solde
attendu égal au fond de départ.
**Couvre :** Caisse et trésorerie / Consulter ma caisse ouverte du jour ;
Ouvrir une session de caisse

## F.2 — Lister et consulter les sessions de caisse

**Compte :** manager.oi@recette.test
**Action :** Même page, filtrer par statut **Ouverte**, puis ouvrir le détail
de la session de Fanta Touré OI.
**Attendu :** Liste des sessions (montants attendu/compté/écart) ; le détail
affiche le fond de départ et les mouvements liés à la caisse depuis
l'ouverture.
**Couvre :** Caisse et trésorerie / Lister les sessions de caisse ; Consulter
le détail d'une session

## F.3 — Clôturer puis valider une caisse

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Sur la session ouverte en F.1, bouton « Clôturer la caisse » :
comptage global **50 000** (pas d'écart). Se reconnecter en
`admin.oi@recette.test`, ouvrir la même session, bouton « Valider ».
**Attendu :** Session **Clôturée** (écart = 0, donc aucun motif requis) ;
validation par Awa Konaté OI (différente du caissier) passe la session en
**Validée** ; si un écart avait été saisi, une écriture comptable (compte 658
ou 758) aurait été postée automatiquement.
**Couvre :** Caisse et trésorerie / Clôturer une caisse (comptage) ; Valider
une clôture de caisse

## F.4 — Comptes de trésorerie et virement interne

**Compte :** admin.oi@recette.test
**Action :** Finance › Caisse et trésorerie › Trésorerie
(`/tenant/:tenantId/finance/tresorerie`). Bouton « Nouveau compte » : nature
**Mobile Money**, libellé `Orange Money OI`, numéro de compte (préfixe imposé
selon la nature), opérateur Orange. Lister les comptes, modifier le libellé
du compte créé. Bouton « Nouveau virement » : du compte Mobile Money vers le
compte de caisse, montant **20 000**, libellé `Réassort caisse`. Consulter la
liste des virements, puis annuler ce virement avec un motif
`Virement test recette`.
**Attendu :** Compte créé (numéro non dupliqué, sinon refus) ; modification
enregistrée ; virement créé (`VIR-AAAA-NNNN`) avec écriture comptable
postée ; annulation crée l'écriture inverse (`VOIDED`).
**Couvre :** Caisse et trésorerie / Lister les comptes de trésorerie ; Créer
un compte de trésorerie ; Modifier / désactiver un compte de trésorerie ;
Lister les virements internes ; Effectuer un virement interne ; Annuler un
virement

## F.5 — Retenue à la source et versements DGI

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Même écran Trésorerie, section retenue à la source cumulée :
consulter le montant dû. Bouton de déclaration d'un versement DGI : compte de
trésorerie actif, montant (jusqu'au cumul affiché ou un montant partiel),
date du jour. Lister les versements. En admin, annuler un versement avec un
motif.
**Attendu :** Montant cumulé affiché (0 si aucune retenue à la source n'a
encore été calculée sur les honoraires — dépend du statut fiscal du
propriétaire configuré en partie 04, étape E.13) ; versement créé
(`DGI-AAAA-NNNN`) avec écriture postée ; annulation refusée si déjà annulé.
**Couvre :** Caisse et trésorerie / Consulter la retenue à la source
cumulée ; Lister les versements DGI ; Déclarer un versement DGI ; Annuler un
versement DGI

## F.6 — File de validation et import Excel

**Compte :** admin.oi@recette.test
**Action :** Finance › Caisse et comptabilité › Saisie et validation › Pièces
à valider (`FileDeValidation.tsx`). Filtrer par auteur `Fanta Touré OI`.
Onglet Importation : sélectionner un petit classeur Excel de test (créé
manuellement avec deux lignes de saisie simples, par exemple deux paiements
de loyer) et lancer l'import.
**Attendu :** La file liste les pièces en attente créées par la comptable
(factures/règlements/pièces de caisse en brouillon) ; le compte rendu
d'import détaille les lignes réussies/en erreur, chaque ligne étant traitée
par le point d'entrée POST correspondant à sa nature détectée (voir « Réalité
de l'environnement »).
**Couvre :** Saisie et validation / Consulter la file de validation ;
Importer un classeur Excel (saisie en lot)

## F.7 — Comptabilité : journal, grand livre, balances

**Compte :** manager.oi@recette.test
**Action :** Finance › Caisse et comptabilité › Comptabilité
(`Comptabilite.tsx`), sur la période du mois courant. Onglet **Journal** :
filtrer par journal. Onglet **Grand livre** : filtrer par compte (ex. le
compte de trésorerie créé en F.4). Onglet **Balance générale** : exporter en
Excel puis en CSV. Onglet **Mandants** : consulter le grand livre auxiliaire
et la balance auxiliaire des mandants (Kouassi Yao OI doit y apparaître après
les écritures de la partie 04).
**Attendu :** Les quatre onglets affichent des lignes cohérentes avec les
écritures déjà postées (paiement de loyer, reversement, virement, caisse) ;
les exports Excel/CSV se téléchargent sans erreur.
**Couvre :** Comptabilité / Consulter le journal comptable ; Consulter le
grand livre ; Consulter la balance générale ; Consulter le grand livre
auxiliaire des mandants ; Consulter la balance auxiliaire des mandants

## F.8 — Facturation du mois et campagnes

**Compte :** compta.oi@recette.test
**Action :** Finance › Clients et propriétaires › Facturation et balances ›
Facturation du mois (`Facturation.tsx`). Bouton « Lancer la facturation du
mois » pour le mois courant. Consulter l'historique des campagnes, ouvrir le
détail de la campagne créée. Relancer (« Relancer la campagne ») pour
vérifier l'idempotence.
**Attendu :** Campagne créée (résumé de facturation) ; relancer la même
période renvoie la campagne déjà existante (201, pas de doublon) ; le détail
affiche le résumé complet.
**Couvre :** Facturation et balances / Lister les campagnes de facturation ;
Consulter le détail d'une campagne ; Lancer une campagne de facturation
mensuelle

## F.9 — Balances clients et relevé de compte

**Compte :** manager.oi@recette.test
**Action :** Finance › Clients et propriétaires › Facturation et balances ›
Balance clients (`BalanceClients.tsx`), export CSV. Balance âgée
(`BalanceAgee.tsx`) à la date du jour. Depuis une ligne de la balance clients
(Aminata Traoré OI), ouvrir le relevé de compte de tiers et l'imprimer en
PDF.
**Attendu :** Balance clients affiche facturé/réglé/solde par locataire ;
balance âgée montre l'ancienneté des impayés par tranche ; le relevé de
compte de tiers (solde ouverture/clôture, mouvements) s'imprime en PDF sans
erreur.
**Couvre :** Facturation et balances / Consulter la balance clients ;
Consulter la balance clients âgée ; Consulter le relevé d'un compte de
tiers ; Imprimer le relevé de compte en PDF

## F.10 — Associations et quotes-parts (indivision Villa Riviera OI)

**Compte :** admin.oi@recette.test
**Action :** Finance › Clients et propriétaires › Reversements et
commissions › Associations (`Associations.tsx`). Bouton de création : libellé
`Association Villa Riviera OI`. Ouvrir le détail, ajouter un associé
`Kouassi Yao OI` avec une quote-part **70 %**, puis un second associé fictif
`Héritier Riviera` à **30 %**. Rattacher le bien « Villa Riviera OI » à cette
association. Consulter l'état de quote-part de Kouassi Yao OI sur la période
du mois courant. Retirer le second associé.
**Attendu :** Association créée sans associé ; ajout d'un associé accepté
tant que la somme des quotes-parts ne dépasse pas 100 % ; rattachement du
bien accepté (le bien doit exister dans le tenant) ; état de quote-part
alimenté par la campagne de facturation de F.8 (peut afficher des montants à
zéro si la période ne recoupe pas les loyers déjà facturés) ; retrait de
l'associé accepté.
**Couvre :** Reversements et commissions (Finance) / Lister les
associations ; Créer une association ; Consulter le détail d'une
association ; Ajouter un associé (quote-part) ; Retirer un associé ;
Rattacher un bien à une association ; Consulter l'état de quote-part d'un
associé

## F.11 — Créer le fournisseur « BTP Sahel OI »

**Compte :** compta.oi@recette.test
**Action :** Finance › Achats et fournisseurs › Fournisseurs et commandes ›
Fournisseurs (`Fournisseurs.tsx`). Bouton « Nouveau fournisseur » : nom
`BTP Sahel OI`, genre **Services** (voir « Réalité de l'environnement »),
contact téléphone/e-mail de test.
**Attendu :** Fournisseur créé avec un compte de tiers associé ; apparaît
dans la liste avec un solde à 0.
**Couvre :** Fournisseurs et commandes / Lister les fournisseurs ; Créer un
fournisseur ; Consulter le détail d'un fournisseur

## F.12 — Facture fournisseur : saisie, validation, annulation

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Fiche du fournisseur BTP Sahel OI › « Saisir une facture » :
date du jour, référence `FACT-BTP-001`, une ligne (`Prestation de nettoyage`,
montant **200 000**). Lister les factures du fournisseur, ouvrir le détail.
En admin, bouton « Valider ». Puis, sur une seconde facture de test, bouton
« Annuler » (motif `Facture en double`) une fois validée.
**Attendu :** Facture créée en brouillon (montant calculé depuis les lignes) ;
détail affiche lignes et imputations ; validation pose une dette comptable
(écriture postée) ; annulation d'une facture validée crée une pièce
d'annulation (écriture inverse), jamais une modification directe.
**Couvre :** Fournisseurs et commandes / Lister les factures d'un
fournisseur ; Saisir une facture fournisseur ; Consulter le détail d'une
facture fournisseur ; Valider une facture fournisseur ; Annuler une facture
fournisseur validée

## F.13 — Règlement fournisseur

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Sur la facture BTP Sahel OI validée en F.12, saisir un règlement
de **200 000** (méthode Virement bancaire, imputé intégralement à la
facture). En admin, valider le règlement. Sur un second règlement de test,
annuler après validation (motif `Double règlement`).
**Attendu :** Règlement créé en brouillon (somme des imputations ≤ montant du
règlement, facture imputée déjà validée) ; validation pose l'écriture
comptable ; annulation crée une pièce d'annulation.
**Couvre :** Fournisseurs et commandes / Saisir un règlement fournisseur ;
Valider un règlement fournisseur ; Annuler un règlement fournisseur

## F.14 — Balance fournisseurs

**Compte :** manager.oi@recette.test
**Action :** Finance › Achats et fournisseurs › Balance fournisseurs
(`BalanceFournisseurs.tsx`), période du mois courant.
**Attendu :** BTP Sahel OI apparaît avec son solde dû après F.12/F.13 (0 si le
règlement de F.13 a soldé la facture).
**Couvre :** Fournisseurs et commandes / Consulter la balance fournisseurs

## F.15 — Bon de commande fournisseur

**Compte :** admin.oi@recette.test
**Action :** Finance › Achats et fournisseurs › Bons de commande
(`BonsDeCommande.tsx`) › « Nouveau bon » : fournisseur BTP Sahel OI,
référence `BC-BTP-001`, une ligne libellée `Fournitures de nettoyage`,
montant **80 000** — le champ « chantier » (`siteId`) étant obligatoire côté
API pour ce bon (module CONSTRUCTION, wiki), le renseigner avec l'un des
chantiers de la partie 07 s'il existe déjà, sinon consigner ce blocage dans
« Réalité de l'environnement » et reporter cette étape après la partie 07.
Bouton « Émettre le bon », consulter le détail, puis sur un second bon de
test, bouton d'annulation (motif obligatoire).
**Attendu :** Bon créé en brouillon (référence unique par agence) ; émission
fait entrer le montant dans l'engagé du chantier ; annulation retire le bon
de l'engagé (`CANCELLED`).
**Couvre :** Fournisseurs et commandes / Lister les bons de commande ; Créer
un bon de commande (brouillon) ; Consulter le détail d'un bon de commande ;
Émettre un bon de commande ; Annuler un bon de commande

## F.16 — Rapprocher une facture à un bon de commande, engagé du chantier

**Compte :** compta.oi@recette.test / manager.oi@recette.test
**Action :** Sur une nouvelle facture BTP Sahel OI non encore validée, la
rapprocher au bon de commande émis en F.15 (même fournisseur, même
chantier). Puis consulter l'engagé du chantier concerné.
**Attendu :** Le bon est mis à jour (montant facturé recalculé) ; le
rapprochement est refusé si la facture est déjà validée ou si le bon n'est
pas `ISSUED` ; l'écran d'engagé affiche coût réel + engagements ouverts +
engagé total.
**Couvre :** Fournisseurs et commandes / Rapprocher une facture fournisseur à
un bon de commande ; Consulter l'engagé d'un chantier

## Couverture

| Fonctionnalité                                       | Sous-fonctionnalités couvertes                                                                                                                                                                                                                        | Étapes      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Caisse et trésorerie                                 | Caisse (consulter/lister/ouvrir/détail/clôturer/valider), comptes de trésorerie (lister/créer/modifier), virements (lister/effectuer/annuler), retenue à la source (consulter/lister), DGI (déclarer/annuler)                                         | F.1 à F.5   |
| Saisie et validation                                 | File de validation, import Excel                                                                                                                                                                                                                      | F.6         |
| Comptabilité                                         | Journal, grand livre, balance générale, grand livre auxiliaire mandants, balance auxiliaire mandants                                                                                                                                                  | F.7         |
| Facturation et balances                              | Campagnes (lister/détail/lancer), balance clients, balance clients âgée, relevé de compte de tiers, impression PDF                                                                                                                                    | F.8, F.9    |
| Reversements et commissions (Finance — associations) | Lister/créer/détail associations, ajouter/retirer un associé, rattacher un bien, état de quote-part                                                                                                                                                   | F.10        |
| Fournisseurs et commandes                            | Fournisseurs (lister/créer/détail), factures (lister/saisir/détail/valider/annuler), règlements (saisir/valider/annuler), balance fournisseurs, bons de commande (lister/créer/détail/émettre/annuler), rapprochement facture-bon, engagé de chantier | F.11 à F.16 |

Sous-fonctionnalités non couvertes (avec raison) :

- **Retenues de garantie** (poser/libérer/lister/résumé/détail) : module
  CONSTRUCTION, hors périmètre de cette partie — voir la partie 07.
- **Émettre / valider / supprimer / imprimer / annuler une pièce de caisse de
  chantier**, **budgets de chantier**, **avenants de budget**, **points
  d'avancement**, **alertes de dépassement budgétaire**, **tableau de bord
  des chantiers**, **baux de terrain**, **gestion du stock**, **salaires**,
  **tâcherons** : toutes rattachées au module CONSTRUCTION, couvertes dans la
  partie 07 (Promoteur).
- **Rapprocher une facture à un bon de commande / consulter l'engagé d'un
  chantier (F.16)** : dépend de l'existence d'un chantier réel créé en
  partie 07 ; si cette partie n'a pas encore été jouée au moment de
  l'exécution, consigner le blocage plutôt que de forcer une donnée
  incohérente, comme indiqué à l'étape F.15.
