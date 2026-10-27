# Partie H — Promoteur : chantiers, stock, main-d'œuvre, retenues

Domaine « Finance » du wiki, module **CONSTRUCTION** uniquement : Suivi des
chantiers (43 sous-fonctionnalités), Gestion du stock, Salaires, Tâcherons et
Retenues de garantie. Le reste du domaine Finance (caisse, comptabilité,
facturation, fournisseurs) est couvert par la partie 05.

Environnement : voir le cadre commun (web `http://localhost:3311`, API
`http://localhost:8811`, `SUBSCRIPTION_ENFORCEMENT=enforce`).

## Prérequis

Objets déjà créés par les parties précédentes (à ne pas recréer) :

- Partie 01 : opérateur « Groupe Intégré Recette OI » (pack Opérateur
  intégré), administrateur Awa Konaté OI, collaborateurs Moussa Diarra OI
  (gestionnaire), Salif Coulibaly OI (agent), Fanta Touré OI (comptable),
  tous membres **actifs**.
- Partie 05 : fournisseur « BTP Sahel OI » (genre Services), facture
  `FACT-BTP-001` validée puis réglée intégralement (200 000 FCFA), et une
  seconde facture de test validée puis **annulée** (doublon) — aucune des
  deux n'est réutilisable telle quelle ici (la première est déjà soldée, la
  seconde est `CANCELLED`) : cette partie saisit une facture neuve pour
  alimenter la réception de stock et la retenue de garantie (étape H.11).
- Partie 05, étape F.15 : le bon de commande `BC-BTP-001` a été **laissé en
  suspens** faute de chantier réel (le champ `siteId` est obligatoire côté
  API pour un bon de commande du module CONSTRUCTION). Les chantiers créés
  ici (H.1) le débloquent ; rejouer F.15/F.16 de la partie 05 reste à faire
  par ailleurs, ce n'est pas répété dans cette partie ni dans ce fichier.

## Réalité de l'environnement

- **Postes de dépense posés automatiquement, jamais créés à l'écran.**
  `DEFAULT_COST_CATEGORY_LABELS` (`packages/api/src/lib/finance/sites.ts`
  lignes 61-69) pose sept postes (`Gros œuvre`, `Toiture`, `Plomberie`,
  `Électricité`, `Main-d'œuvre`, `Matériaux`, `Divers`) à la première lecture
  du référentiel pour l'agence — c'est pour cela qu'aucun écran du web ne
  propose « Créer un poste de dépense » ni « Rattacher un poste à un compte
  comptable » : ces deux sous-fonctionnalités du wiki n'ont pas de formulaire
  (`apps/web/src/services/finance-lot2-service.ts` n'expose qu'un `GET`),
  elles vont en « Hors interface ». Le référentiel affiché dans les
  formulaires (budget, avenant, pièce de caisse, bail de terrain, marché de
  tâcheron) est donc toujours ce même jeu de sept postes, jamais vide.
- **Le formulaire « Nouveau chantier » n'a pas de champ Responsable.**
  `Chantiers.tsx` (commentaire de tête, lignes 41-48) : le contrat de
  `createConstructionSite` n'accepte que `name`, `zone`, `propertyId`,
  `startDate`, `plannedEndDate` — pas de `managerId`, alors que la colonne
  « Responsable » de la liste et `ConstructionSite.managerLabel` existent
  côté lecture. Un chantier créé ici n'a donc jamais de responsable affiché
  (`—`) : ce n'est pas un oubli de saisie, il n'y a nulle part où le saisir.
- **Chaque lot de chantier compte dans la jauge Lots, sans distinction de
  type.** Contrairement à un lot de copropriété (seuls Appartement, Bureau et
  Commercial comptent, voir partie 08/09), un `SiteLot` d'un chantier actif
  (`PLANNED`, `IN_PROGRESS`, `SUSPENDED`) compte **toujours** dans la réserve
  unique de 300 lots de l'abonnement Opérateur intégré
  (`docs/architecture/PLAN-ABONNEMENTS.md` §4, `PROGRAM_LOT`) — ce module n'a
  d'ailleurs pas de notion de type de lot (« Ajouter un lot » ne demande que
  nom, surface, quote-part). Cette partie garde volontairement le nombre de
  lots de chantier très bas (3 au total) pour ne pas fausser l'arithmétique
  de la partie 09.
- **Clôturer un chantier le retire de la jauge Chantiers.** Un chantier
  `CLOSED` ne compte plus dans `ACTIVE_SITE_STATUSES`. La partie 09 part de
  l'hypothèse que les trois chantiers créés ici (Émeraude, Saphir, Rubis)
  sont encore actifs (3/3) : l'étape H.9 clôture puis **rouvre** aussitôt
  « Chantier Rubis OI » pour ne rien changer à la jauge à la fin de cette
  partie. La bascule d'un lot au patrimoine (H.18), elle, clôture Rubis
  **définitivement** (aucune réouverture possible après capitalisation d'un
  lot) : elle est donc délibérément reportée à la toute fin de la campagne
  de recette, après la partie 09, pour ne pas invalider sa jauge Chantiers.
- **Docstring de `Tacherons.tsx` obsolète.** Le fichier affirme en commentaire
  que l'écran « n'est câblé nulle part » (`App.tsx`, `navigation/model.tsx`) ;
  en réalité les deux routes existent bien
  (`/tenant/:tenantId/finance/tacherons[/:contractorId]`, `App.tsx` autour de
  la ligne 1098) et l'entrée de menu aussi (Finance › Main-d'œuvre ›
  Tâcherons, `navigation/model.tsx` ligne 375). Ce n'est pas un écran
  manquant, juste un commentaire resté en l'état depuis son lot d'origine.
- **Onglet « Articles » de `StockReferentiel.tsx` non traduit.** La liste des
  onglets (ligne 943) écrit `label: 'Articles'` en dur, sans passer par
  `t()`, contrairement aux deux autres onglets de la même liste. Sans effet
  visible en français, mais l'arabe et l'anglais n'auront jamais ce libellé
  traduit — à signaler, pas à corriger ici.
- **Le poste de dépense d'un article n'est qu'une proposition.** `Créer un
article de stock` accepte un `defaultCostCategoryId`, mais c'est la sortie
  de stock qui choisit réellement le poste imputé (`StockReferentiel.tsx`,
  bloc d'avertissement dans l'onglet Articles) : le champ reste modifiable au
  moment de sortir l'article, jamais figé par l'article lui-même.
- **Réception et retenue exigent une facture fournisseur déjà VALIDATED**,
  jamais une facture en brouillon ni annulée — d'où la nouvelle facture posée
  en H.11 plutôt que la réutilisation de celles de la partie 05.

## H.1 — Créer les trois chantiers

**Compte :** admin.oi@recette.test
**Action :** Finance › Chantiers et stock › Suivi des chantiers › Chantiers
(`/tenant/:tenantId/finance/chantiers`). Bouton « Nouveau chantier » trois
fois : `Chantier Émeraude OI` (zone `Riviera Attoban, Abidjan`, pas de bien —
« Aucun bien — pourra en recevoir un à la clôture », début aujourd'hui, fin
prévue dans 18 mois) ; `Chantier Saphir OI` (zone `Bingerville`, début
aujourd'hui) ; `Chantier Rubis OI` (zone `Angré 8e Tranche, Abidjan`, début
aujourd'hui).
**Attendu :** Chaque validation affiche « Chantier « {{nom}} » créé. » et
ouvre sa fiche ; retour à la liste : trois chantiers au statut **Planifié**,
colonne Responsable à `—` (voir « Réalité de l'environnement »), colonne
Bien à « Sans bien (terrain loué) », coût réel `0`. Filtrer par statut
« Planifié » les affiche tous les trois.
**Couvre :** Suivi des chantiers / Lister les chantiers ; Créer un chantier

## H.2 — Fiche du chantier et première pièce de caisse

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Ouvrir la fiche « Chantier Émeraude OI ». Bouton « Nouvelle
pièce de caisse » (le chantier est présélectionné). Se reconnecter en
`compta.oi@recette.test` : poste `Matériaux`, bénéficiaire
`Quincaillerie Bingerville`, montant **250 000**, date du jour, motif
`Achat de ciment et fers à béton`. Émettre la pièce. Revenir en admin, ouvrir
la pièce et cliquer « Valider la pièce ».
**Attendu :** Pièce créée en brouillon (pas encore de numéro) ; validation
lui attribue un numéro `PC-AAAA-NNNN`, poste une écriture et fait passer le
coût réel du chantier à **250 000** sur sa fiche (`Chantiers et stock ›
Chantiers › Émeraude OI`), visible aussi dans « Sous-totaux par poste »
(ligne Matériaux) et « Imputations » (pièce d'origine libellée, jamais son
identifiant).
**Couvre :** Suivi des chantiers / Consulter la fiche d'un chantier ;
Consulter le détail des imputations ; Lister les postes de dépense (vus dans
le sélecteur) ; Émettre une pièce de caisse de chantier ; Valider une pièce
de caisse

## H.3 — Pièce de caisse : impression, brouillon supprimé, annulation

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Sur la pièce validée de H.2, bouton « Imprimer le bon ». Émettre
une deuxième pièce de test (`Petit outillage`, 30 000, motif `Test brouillon
à supprimer`) sans la valider, puis « Supprimer le brouillon ». Émettre une
troisième pièce (`Location bétonnière`, 60 000, motif `Test annulation`), la
valider en admin, puis « Annuler la pièce » avec le motif
`Pièce saisie en double`.
**Attendu :** Le PDF du bon se télécharge sans erreur ; le brouillon
disparaît de la fiche sans laisser de numéro ni d'écriture (« Il n'avait ni
numéro ni écriture : rien n'en reste. ») ; l'annulation crée une pièce
d'annulation et fait revenir le coût réel du chantier à **250 000** (la
troisième pièce n'y compte plus).
**Couvre :** Suivi des chantiers / Imprimer une pièce de caisse en PDF ;
Supprimer une pièce de caisse en brouillon ; Annuler une pièce de caisse
validée

## H.4 — Budget du chantier Émeraude : création et validation

**Compte :** admin.oi@recette.test
**Action :** Fiche « Chantier Émeraude OI » › onglet Budget
(`/finance/chantiers/:siteId/budget`). « Créer le budget » : nom
`Budget initial 2026`, trois lignes — `Gros œuvre` / `Fondations et
élévation` / montant prévu **30 000 000** ; `Matériaux` / `Ciment, fer, sable`
/ **10 000 000** ; `Main-d'œuvre` / `Équipe de chantier` / **8 000 000**.
Lister les budgets du chantier (un seul, en brouillon). Tenter de consulter
le budget validé (aucun pour l'instant). Bouton « Valider le budget ».
**Attendu :** Budget créé (« Budget créé en brouillon. »), total
**48 000 000** ; la liste des budgets l'affiche ; « Budget validé » renvoyait
un état vide avant validation ; après le clic, badge **Validé**, `Budget
initial` = `Budget révisé` = 48 000 000.
**Couvre :** Suivi des chantiers / Créer un budget de chantier ; Lister les
budgets d'un chantier ; Consulter le budget validé d'un chantier ; Valider un
budget de chantier

## H.5 — Avenant de budget

**Compte :** admin.oi@recette.test
**Action :** Même onglet Budget, section Avenants (vide au départ) :
« Nouvel avenant » — date du jour, motif `Renchérissement du ciment`, ligne
`Matériaux` avec un écart de **+2 000 000**. Enregistrer, puis « Valider »
l'avenant.
**Attendu :** Avenant créé en brouillon (« Avenant enregistré en
brouillon. ») ; liste des avenants l'affiche avec l'écart signé ; validation
(« Avenant validé. ») porte le budget révisé à **50 000 000**, le budget
initial restant à 48 000 000.
**Couvre :** Suivi des chantiers / Lister les avenants d'un budget ; Créer un
avenant de budget ; Valider un avenant de budget

## H.6 — Avancement, alertes et tableau de bord

**Compte :** admin.oi@recette.test
**Action :** Sur la fiche Émeraude, saisir un point d'avancement : **15 %**,
note `Fondations terminées`. Consulter l'historique d'avancement (un point).
Ouvrir Finance › Chantiers et stock › Suivi des chantiers › Tableau de bord
(`/finance/tableau-de-bord-chantiers`) : filtrer « Chantiers en dépassement
uniquement » (aucun pour l'instant, le budget révisé couvrant largement le
coût réel de 250 000), puis décocher le filtre pour voir les trois chantiers.
Si une alerte de dépassement apparaît sur une ligne (seuil franchi), cliquer
« Acquitter l'alerte ».
**Attendu :** Point d'avancement créé, avancement affiché à 15 % sur la fiche
et dans l'historique ; le tableau de bord liste les trois chantiers (budget
initial/révisé, engagé, réalisé, écart, avancement) avec, pour Émeraude,
réalisé = 250 000 et pas de badge Alerte (loin du seuil) ; si un badge
apparaît malgré tout, « Acquitter l'alerte » l'horodate et le fait
disparaître.
**Couvre :** Suivi des chantiers / Saisir un point d'avancement physique ;
Consulter l'historique d'avancement ; Consulter le tableau de bord des
chantiers ; Lister les alertes de dépassement budgétaire ; Acquitter une
alerte de dépassement

## H.7 — Bail de terrain du chantier Émeraude

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Finance › Chantiers et stock › Suivi des chantiers › Baux de
terrain (`/finance/baux-terrain`). « Nouveau bail » : bailleur
`Séraphin Koffi OI`, terrain loué `Terrain Riviera Attoban OI, 2 000 m²`,
loyer annuel **3 600 000**, poste `Divers`, début aujourd'hui (pas de fin —
tacite reconduction). Ouvrir le bail créé, « Rattacher un chantier
existant » → `Chantier Émeraude OI`. En comptable, saisir un paiement :
montant **300 000**, période couverte du 1er au dernier jour du mois en
cours. En admin, valider ce paiement. Sur le même bail, « Constater » le mois
précédent.
**Attendu :** Bail créé (mensualité affichée = 300 000, reste à consommer =
3 600 000) ; rattachement affiche Émeraude dans « Chantiers rattachés » ;
paiement créé en brouillon puis validé (payé à ce jour = 300 000, reste à
consommer = 3 300 000) ; constatation manuelle crée une charge déjà validée
pour le mois précédent, imputée à Émeraude (poste Divers).
**Couvre :** Suivi des chantiers / Enregistrer un bail de terrain ; Lister
les baux de terrain ; Consulter le détail d'un bail de terrain ; Rattacher un
chantier à un bail de terrain ; Lister les paiements d'un bail ; Saisir un
paiement de bail de terrain ; Valider un paiement de bail de terrain ; Lister
les constatations mensuelles d'un bail ; Constater manuellement un mois de
bail

## H.8 — Lots du chantier Émeraude, clé de répartition, coût de revient

**Compte :** admin.oi@recette.test
**Action :** Fiche Émeraude › « Lots et clôture »
(`/finance/chantiers/:siteId/cloture`). « Ajouter un lot » trois fois :
`Villa E1` (surface **250** m²), `Villa E2` (surface **200** m²), puis
`Lot Provisoire OI` (surface **10** m², à supprimer juste après). Supprimer
ce troisième lot. Sur `Villa E1`, « Corriger » : surface **260** m². Choisir
la clé de répartition « Au prorata des surfaces » (SURFACE), « Appliquer la
clé ». Consulter la section coût de revient par lot.
**Attendu :** Trois lots créés puis un supprimé sans erreur (pas encore
clôturé) ; correction de Villa E1 enregistrée ; la clé s'applique (la somme
des surfaces valides le calcul, pas de blocage « il manque X % ») ; le coût
de revient réparti Villa E1/Villa E2 se recalcule au prorata de 260/200 sur
le coût réel du chantier (250 000 FCFA à ce stade).
**Couvre :** Suivi des chantiers / Ajouter un lot à un chantier ; Lister les
lots d'un chantier ; Corriger un lot ; Supprimer un lot ; Fixer la clé de
répartition du coût ; Consulter le coût de revient par lot

## H.9 — Clôture et réouverture du chantier Rubis (aller-retour)

**Compte :** admin.oi@recette.test
**Action :** Fiche « Chantier Rubis OI » › « Lots et clôture ». Ajouter un
lot `Lot Capitalisable RU1` (surface **300** m²), appliquer la clé « Au
prorata des surfaces » (seul lot, 100 %). Consulter les bloqueurs de clôture.
Cliquer « Clôturer le chantier », confirmer. Immédiatement après, cliquer
« Rouvrir le chantier », confirmer.
**Attendu :** Aucun bloqueur (aucune pièce de caisse, facture, note de
salaire ni situation en brouillon sur Rubis — voir « Réalité de
l'environnement ») ; clôture réussie, badge **Clôturé**, coût figé à
**0 FCFA** (aucune dépense n'a jamais été imputée sur ce chantier, ce n'est
pas une anomalie) ; réouverture réussie aussitôt après (aucun lot n'a encore
basculé au patrimoine), badge **Ouvert** à nouveau. Sur la page Abonnement de
l'agence, la jauge Chantiers reste à 3/3 après cet aller-retour.
**Couvre :** Suivi des chantiers / Consulter les bloqueurs de clôture ;
Clôturer un chantier ; Rouvrir un chantier

## H.10 — Référentiel de stock : articles, lieux, méthode de valorisation

**Compte :** admin.oi@recette.test
**Action :** Finance › Chantiers et stock › Gestion du stock › Articles et
lieux (`/finance/stock/parametrage`). Onglet Articles : « Nouvel article » —
référence `CIM-50`, désignation `Ciment 50 kg`, unité `sac`, famille
`Matériaux`, poste proposé `Matériaux`. Consulter son détail, puis le
corriger (désignation `Ciment CPA 50 kg`). Onglet Lieux de stockage :
« Nouveau lieu de stockage » — nature Magasin (`WAREHOUSE`), libellé
`Magasin central OI` ; corriger son libellé en `Magasin central OI (Abidjan)`.
Onglet Méthode de valorisation : lire la décision en vigueur (coût moyen
pondéré par défaut), puis « Décider » à nouveau avec le motif
`Confirmation de la méthode à l'ouverture du dépôt`.
**Attendu :** Article créé, détail et correction affichés (référence non
modifiable) ; lieu Magasin créé et corrigé ; méthode affichée puis
re-décidée avec le nouveau motif horodaté.
**Couvre :** Gestion du stock / Lister les articles de stock ; Créer un
article de stock ; Consulter le détail d'un article ; Corriger un article ;
Lister les lieux de stockage ; Créer un lieu de stockage ; Corriger un lieu
de stockage ; Consulter la méthode de valorisation du stock ; Décider de la
méthode de valorisation

## H.11 — Nouvelle facture BTP Sahel OI pour le chantier

**Compte :** compta.oi@recette.test puis admin.oi@recette.test
**Action :** Finance › Achats et fournisseurs › Fournisseurs › fiche
`BTP Sahel OI` › « Saisir une facture » : référence `FACT-BTP-OI-002`, date du
jour, une ligne `Sacs de ciment 50 kg`, montant **500 000**. En admin,
« Valider » cette facture.
**Attendu :** Facture créée en brouillon puis validée (`VALIDATED`) : elle
devient éligible comme pièce source d'une réception de stock (H.12) et d'une
retenue de garantie (H.17).
**Couvre :** réutilise Fournisseurs et commandes (partie 05) pour fournir une
pièce VALIDATED au module CONSTRUCTION ; ne recompte pas de
sous-fonctionnalité ici.

## H.12 — Bascule au stock du chantier Émeraude, réception, rapprochement

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Fiche Émeraude › bouton secondaire « Stock du chantier »
(`/finance/chantiers/:siteId/stock`). Confirmer « Faire passer ce chantier au
stock ». Cela crée son lieu de stockage dédié. En comptable, Finance ›
Gestion du stock › Stock (`/finance/stock`), « Enregistrer une réception » :
lieu = celui du chantier Émeraude, fournisseur `BTP Sahel OI`, facture
`FACT-BTP-OI-002`, date du jour, une ligne (`Ciment CPA 50 kg`, quantité
**80**, prix unitaire **6 250**). Revenir sur la fiche Stock du chantier.
**Attendu :** Bascule irréversible confirmée (« Chantier passé au stock. »),
statut « Passé au stock », lieu affiché ; réception créée (mouvement d'entrée
au lieu du chantier, coût moyen recalculé, **500 000** FCFA au total, aucune
imputation au coût du chantier à ce stade — « Une réception ne fait monter
aucun coût de chantier ») ; le rapprochement Acheté/Consommé/Restant affiche
`Facturé au chantier` = 500 000, `Entré depuis une facture` = 500 000,
`Consommé` = 0, `Restant` = 500 000, écart = 0.
**Couvre :** Gestion du stock / Basculer un chantier au stock ; Consulter le
statut stock d'un chantier ; Enregistrer une réception de stock ; Consulter
le rapprochement acheté/consommé/restant

## H.13 — Sortie de stock vers le chantier, soldes, journal

**Compte :** compta.oi@recette.test
**Action :** Finance › Stock, « Enregistrer une sortie » : lieu du chantier
Émeraude, article `Ciment CPA 50 kg`, quantité **50**, chantier Émeraude,
poste `Matériaux`, demandeur `Chef de chantier Émeraude`, date du jour.
Consulter l'onglet État du stock (solde de l'article) puis Journal des
mouvements, filtré sur le chantier Émeraude.
**Attendu :** Sortie enregistrée, message `50 sac(s) de Ciment CPA 50 kg
imputés à « Chantier Émeraude OI » pour Matériaux.` ; le coût réel du
chantier passe de 250 000 à **562 500** FCFA (250 000 + 50 × 6 250) ; solde
de l'article au lieu du chantier = 30 sacs restants ; le journal des
mouvements liste la réception et la sortie, avec le chantier imputé sur la
sortie.
**Couvre :** Gestion du stock / Sortir du stock vers un chantier ; Consulter
les soldes de stock ; Consulter le journal des mouvements de stock

## H.14 — Transfert entre lieux et inventaire

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Finance › Gestion du stock › Inventaire. « Enregistrer un
transfert » : du lieu du chantier Émeraude vers `Magasin central OI
(Abidjan)`, article `Ciment CPA 50 kg`, quantité **10**, date du jour.
Ensuite « Ouvrir un inventaire physique » sur `Magasin central OI (Abidjan)`,
date du jour. Saisir une ligne de comptage : article Ciment CPA 50 kg,
quantité comptée **9** (soit un écart de −1, motif `Sac endommagé`). Ajouter
puis retirer une ligne sur un second article fictif pour vérifier le retrait.
Valider l'inventaire. Lister les inventaires, ouvrir son détail.
**Attendu :** Transfert enregistré (deux mouvements, sortie/entrée, valorisés
au coût moyen d'origine, sans imputation ni chantier) ; il reste 20 sacs au
lieu du chantier et 10 au magasin ; inventaire ouvert en brouillon (`DRAFT`) ;
ligne de comptage posée avec l'écart affiché ; ligne retirée disparaît du
comptage ; validation transforme l'écart en ajustement de stock (perte d'un
sac) avec écriture postée ; liste et détail de l'inventaire cohérents.
**Couvre :** Gestion du stock / Transférer du stock entre deux lieux ; Ouvrir
un inventaire physique ; Saisir/corriger une ligne de comptage ; Retirer une
ligne de comptage ; Valider un inventaire ; Lister les inventaires ;
Consulter le détail d'un inventaire

## H.15 — Tâcheron Yacouba Sanogo OI : marché, situation, règlement

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Finance › Main-d'œuvre › Tâcherons (`/finance/tacherons`).
« Nouveau tâcheron » : nom `Yacouba Sanogo OI`, corps de métier `Maçonnerie`.
Sur sa fiche, « Convenir d'un marché » : chantier `Chantier Émeraude OI`,
poste `Gros œuvre`, référence `MAR-EMR-001`, montant convenu **12 000 000**,
signé le jour même. En comptable, « Saisir une situation » : date du jour,
montant **3 000 000**, description `Élévation des murs porteurs, 1er
appel`. En admin, « Valider » la situation. En comptable, « Saisir un
règlement » de **3 000 000**. En admin, « Valider » le règlement.
**Attendu :** Tâcheron enregistré (compte de tiers ouvert, solde à 0) ;
marché créé (marché restant = 12 000 000) ; situation créée en brouillon
puis validée (marché restant descend à 9 000 000, « Ce qu'on lui doit »
monte à 3 000 000) ; règlement créé en brouillon puis validé (« Ce qu'on lui
doit » revient à 0) — les deux chiffres, marché restant et « ce qu'on lui
doit », ne sont jamais confondus (voir l'encart de la fiche).
**Couvre :** Tâcherons / Lister les tâcherons ; Enregistrer un tâcheron ;
Lister les marchés de tâcherons ; Créer un marché avec un tâcheron ;
Consulter le détail d'un marché ; Lister les situations d'un marché ; Saisir
une situation d'avancement de marché ; Valider une situation d'avancement ;
Lister les règlements d'un tâcheron ; Saisir un règlement de tâcheron ;
Valider un règlement de tâcheron

## H.16 — Salarié de chantier : note de salaire et règlement

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Finance › Main-d'œuvre › Salaires (`/finance/salaires`).
« Nouveau salarié » : nom `Boubacar Koné OI`, rôle `Chef d'équipe`. Ouvrir sa
fiche. En comptable, « Saisir une note de salaire » : mois en cours, montant
**450 000**, chantier `Chantier Émeraude OI`, poste `Main-d'œuvre`. En admin,
« Valider » la note. En comptable, « Saisir un règlement » de **450 000**. En
admin, « Valider » le règlement.
**Attendu :** Salarié enregistré (« Rien à lui verser » au départ) ; note
créée en brouillon puis validée (écriture postée, imputation au chantier
Émeraude visible dans ses imputations et son coût réel, qui passe à
**1 012 500** FCFA) ; « Ce qu'on lui doit » monte à 450 000 puis retombe à 0
après validation du règlement.
**Couvre :** Salaires / Lister les employés ; Enregistrer un employé ;
Consulter le détail d'un employé ; Lister les notes de salaire ; Saisir une
note de salaire ; Valider une note de salaire ; Lister les règlements d'un
employé ; Saisir un règlement de salaire ; Valider un règlement de salaire

## H.17 — Retenue de garantie sur la facture BTP Sahel OI

**Compte :** admin.oi@recette.test puis compta.oi@recette.test
**Action :** Finance › Achats et fournisseurs › Retenues de garantie
(`/finance/retenues`). « Poser une retenue » : nature « Facture »,
fournisseur `BTP Sahel OI`, facture `FACT-BTP-OI-002` (validée en H.11), taux
**10** %, date de libération prévue dans 3 mois. Filtrer les retenues par
statut « Détenue » et par chantier. Consulter le résumé (montant détenu par
chantier) puis le détail de la retenue. Cliquer « Libérer ».
**Attendu :** Retenue créée (HELD), montant dérivé = **50 000** FCFA
(10 % de 500 000), affichée avec son échéance ; liste et filtres fonctionnent ;
résumé agrégé cohérent ; libération fait passer le statut à **Libérée**
(« le montant détenu redevient exigible » — aucun règlement n'est créé
automatiquement, le versement se ferait séparément depuis la fiche du
fournisseur).
**Couvre :** Retenues de garantie / Poser une retenue de garantie ; Libérer
une retenue de garantie ; Lister les retenues de garantie ; Consulter le
résumé des retenues détenues ; Consulter le détail d'une retenue

## H.18 — Bascule d'un lot au patrimoine (à exécuter en tout dernier, après la partie 09)

> **Ne pas jouer cette étape avant la fin de la partie 09.** Elle clôture
> `Chantier Rubis OI` **sans retour possible** dès qu'un lot a basculé au
> patrimoine, ce qui ferait passer la jauge Chantiers de l'agence à 2/3 —
> une valeur que les étapes de quotas de la partie 09 ne prévoient pas.
> L'exécuter une fois tout le reste du scénario terminé.

**Compte :** admin.oi@recette.test
**Action :** Fiche « Chantier Rubis OI » › « Lots et clôture ». Vérifier les
bloqueurs de clôture (vides), « Clôturer le chantier ». Sur le lot
`Lot Capitalisable RU1`, bouton « Basculer au patrimoine » : référence
interne `VIL-OI-RUBIS-01`, titre `Villa Rubis 01`, type de bien Villa, mode
de détention Agence (ou celui proposé pour un bien créé par bascule), adresse
`Angré 8e Tranche, Abidjan`, description facultative laissée vide, date
d'acquisition = date de clôture. Confirmer la création du bien.
**Attendu :** Chantier Rubis clôturé, coût figé à 0 FCFA (aucune dépense n'y
a jamais été imputée) ; bascule confirmée (« Bien « VIL-OI-RUBIS-01 » créé au
patrimoine. »), le lot est marqué « Au patrimoine : Villa Rubis 01 » et le
bien apparaît désormais dans Biens › Toutes les propriétés ; Rubis ne peut
plus être rouvert (« Ce chantier ne peut plus être rouvert : un lot a basculé
au patrimoine. »).
**Couvre :** Suivi des chantiers / Basculer un lot au patrimoine

## Couverture

| Fonctionnalité       | Sous-fonctionnalités couvertes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Étapes          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Suivi des chantiers  | Lister/créer/consulter chantier, imputations, postes (lecture), pièce de caisse (émettre/valider/imprimer/supprimer/annuler), budget (créer/lister/consulter validé/valider), avenants (lister/créer/valider), avancement (saisir/historique), alertes (lister/acquitter), tableau de bord, bail de terrain (enregistrer/lister/détail/rattacher/paiements lister-saisir-valider/constatations lister-constater), lots (ajouter/lister/corriger/supprimer/clé de répartition/coût de revient), clôture (bloqueurs/clôturer/rouvrir/basculer au patrimoine) | H.1 à H.9, H.18 |
| Gestion du stock     | Articles (lister/créer/détail/corriger), lieux (lister/créer/corriger), méthode de valorisation (consulter/décider), bascule chantier au stock, statut stock, réception, rapprochement, sortie vers chantier, soldes, journal des mouvements, transfert, inventaire (ouvrir/compter/retirer ligne/valider/lister/détail)                                                                                                                                                                                                                                   | H.10 à H.14     |
| Salaires             | Employés (lister/enregistrer/détail), notes de salaire (lister/saisir/valider), règlements (lister/saisir/valider)                                                                                                                                                                                                                                                                                                                                                                                                                                         | H.16            |
| Tâcherons            | Tâcherons (lister/enregistrer), marchés (lister/créer/détail), situations (lister/saisir/valider), règlements (lister/saisir/valider)                                                                                                                                                                                                                                                                                                                                                                                                                      | H.15            |
| Retenues de garantie | Poser, libérer, lister, résumé, détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | H.17            |

Sous-fonctionnalités non couvertes (avec raison) :

- **Créer un poste de dépense** et **Rattacher un poste de dépense à un
  compte comptable** (Suivi des chantiers) : aucun écran — le référentiel de
  sept postes est posé automatiquement à la première lecture
  (`DEFAULT_COST_CATEGORY_LABELS`), et le service web n'expose qu'un `GET` ;
  ces deux routes sont API seules. Voir « Réalité de l'environnement ».
