# Scénario de recette — Modules Syndic de bout en bout

**⚠️ RÈGLES ABSOLUES — à relire avant chaque étape**

1. **Ne JAMAIS cliquer « Payer en ligne ».** Le compte PaySecureHub de cet
   environnement local est en mode **LIVE** : un clic déclenche un paiement
   réel. Ce bouton n'apparaît pas dans le module Syndic lui-même (aucun appel
   de charges ne s'y règle en ligne dans le code actuel — voir partie 7), mais
   il reste visible ailleurs dans l'application (portail locataire, page
   Abonnement) : ne jamais s'en approcher, y compris par curiosité.
2. **Ne jamais déclencher d'envoi de SMS.** Un fournisseur SMS réel est
   configuré pour cette agence (Orange CI). L'écran de relance manuelle
   (partie 8) propose un canal « SMS » dans une liste déroulante : on
   **constate l'option sans la sélectionner**, on choisit toujours « Email ».
3. **Les e-mails ne vont qu'à des adresses `@exemple.test`.** Tous les
   contacts CRM créés pour ce scénario (copropriétaires, gestionnaire) portent
   une adresse `...@exemple.test`. La création d'une assemblée déclenche un
   envoi automatique de convocation par e-mail à ces adresses (voir partie 11)
   — c'est acceptable, ce sont des adresses de test.
4. **Rien supprimer**, sauf ce que le scénario crée lui-même et qu'un module
   prévoit explicitement de tester en suppression — un seul cas dans ce
   scénario, signalé en toutes lettres dans la partie 1 (copropriété jetable
   créée puis supprimée pour vérifier le bouton « Supprimer »).
5. **Aucune commande, aucun appel direct à l'API, aucun script.** Tout se
   fait par clics dans l'interface web. Si un écran ne montre pas ce que ce
   document annonce, ou qu'une action semble impossible depuis l'interface,
   **s'arrêter et le consigner** plutôt que de supposer ou de contourner.

---

## 0. Préparation (faite par Baba avant le jeu — ne pas la rejouer)

L'agence de test **« Syndic Recette 2 »**
(`TENANT = ace199d3-0d8a-44f8-aa9e-15f795c7d3cf`) est réactivée avec le pack
**Syndic** par le super-admin avant que l'agent de navigateur ne commence,
selon le même mécanisme que
[SCENARIO_SYNDIC_ABONNEMENT.md](SCENARIO_SYNDIC_ABONNEMENT.md) (fiche agence
`/admin/tenants/<TENANT>`, onglet Abonnement). L'agent de navigateur ne
touche jamais à cette page : il se connecte directement en administrateur
d'agence.

- Web : **http://localhost:3002** — API : **http://localhost:8001** (jamais
  appelée directement).
- Mode d'abonnement : **`warn`** (les quotas ne bloquent aucune création — ce
  n'est pas ce scénario qui teste les quotas, voir
  [SCENARIO_SYNDIC_ABONNEMENT.md](SCENARIO_SYNDIC_ABONNEMENT.md) pour ça).
- Connexion administrateur d'agence : `admin.syndic.recette2@exemple.test`,
  mot de passe déjà défini lors du scénario précédent
  (`SyndicTest#2026` sauf changement — si le mot de passe est refusé,
  s'arrêter et le signaler, ne pas tenter de le réinitialiser).
- `BASE` = `http://localhost:3002/tenant/ace199d3-0d8a-44f8-aa9e-15f795c7d3cf`.

### Copropriétés déjà en base à connaître (ne pas les modifier sauf indication contraire)

| Copropriété                             | Lots                             | Rôle dans ce scénario                             |
| --------------------------------------- | -------------------------------- | ------------------------------------------------- |
| Copropriété Les Manguiers (Recette 2)   | ~102 lots (tantièmes par défaut) | Aucun — trop de lots pour un calcul à la main     |
| Copropriété Les Palmiers (Recette 2)    | ~25 lots importés                | Aucun                                             |
| Copropriété Les Cauris (Recette 2)      | 0 lot                            | Aucun                                             |
| Copropriété Les Fromagers (Recette 2)   | 0 lot                            | Aucun                                             |
| **Copropriété Les Acacias (Recette 2)** | **0 lot**                        | **Fil financier de ce scénario (parties 2 à 14)** |

Les Acacias sert de terrain vierge : 4 lots aux tantièmes ronds (100, 200,
300, 400 = 1000) y sont créés en partie 2, ce qui rend toutes les
répartitions calculables à la main.

### Données neuves de ce scénario (suffixe « Recette 3 »)

| Objet                                      | Valeur                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Copropriété jetable (créée puis supprimée) | `Copropriété Cycle de Vie (Recette 3)`                                                                                |
| Lots des Acacias                           | `ACA-A1` (100 tantièmes), `ACA-A2` (200), `ACA-A3` (300), `ACA-A4` (400)                                              |
| Contact gestionnaire                       | `Mamadou Gestionnaire (Recette 3)` — `gestionnaire.recette3@exemple.test`                                             |
| Contacts copropriétaires                   | `Copro Un (Recette 3)` … `Copro Quatre (Recette 3)` — `copro1.recette3@exemple.test` … `copro4.recette3@exemple.test` |
| Budget prévisionnel                        | `Budget prévisionnel 2026 (Recette 3)` — 1 000 000 FCFA                                                               |
| Assemblée générale                         | AG ordinaire du [date future], `Salle communale (Recette 3)`                                                          |

---

## Modules couverts et modules absents (résumé)

Voir l'annexe « Écarts spec ↔ code » en fin de document pour le détail. En
bref, la spec [013-syndic-module](../../specs/013-syndic-module/spec.md)
prévoit plusieurs choses qui n'existent tout simplement pas dans
`packages/api/src/lib/syndics/` ni dans `apps/web/src/pages/syndics/` :
aucune création de prestataire, aucun enregistrement de paiement de charges
depuis l'écran, aucun mandat/pouvoir d'AG, aucun fonds financier créable, et
aucun portail copropriétaire accessible. Ce scénario les traverse quand même
pour **constater** ces trous avec précision plutôt que de les deviner.

---

## 1. Création et paramétrage

### 1.1 Page : `BASE/syndics` (menu **Plus › Syndic › Copropriétés**) — cycle de vie complet sur une copropriété jetable

#### Ce qu'on doit faire

1. Cliquer **« Nouvelle copropriété »** (bouton en haut à droite de la liste).
2. Dans le tiroir modal « Créer une copropriété », remplir :
   - Nom : `Copropriété Cycle de Vie (Recette 3)`
   - Adresse : `Zone test, Abidjan`
   - Référence cadastrale : laisser vide
   - N° d'immatriculation : `RC-CYCLE-RECETTE3`
3. Cliquer **« Créer »**.

#### Résultat attendu

- [ ] Message de succès `Copropriété créée`.
- [ ] Redirection automatique vers `BASE/syndics/<id>/lots?openImport=true` : la
      modale « Importer des lots depuis des propriétés » s'ouvre toute seule
      sur l'écran des lots (comportement du code : `SyndicsList.handleCreate`
      navigue directement vers l'onglet Lots avec ce paramètre). **Ce n'est
      pas une anomalie.**

4. Fermer cette modale d'import sans rien importer (bouton Annuler ou croix).

### 1.2 Modifier la fiche

1. Revenir sur la fiche de la copropriété jetable (`BASE/syndics/<id>`).
2. Cliquer **« Modifier »** (carte « Informations générales »).
3. Changer le Nom en `Copropriété Cycle de Vie Modifiée (Recette 3)`, cliquer
   **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Copropriété mise à jour`, le nouveau nom apparaît dans le titre
      et dans la carte « Informations générales ».

### 1.3 Supprimer — cas explicitement prévu pour être supprimé

1. Retour à `BASE/syndics`, sur la carte de cette copropriété jetable cliquer
   **« Supprimer »**.
2. Confirmer dans la boîte de dialogue (titre `Supprimer cette copropriété ?`,
   texte `Cette action supprime définitivement la copropriété et ses données
liées.`, bouton **« Supprimer »**).

#### Résultat attendu

- [ ] Message `Copropriété supprimée`, la carte disparaît de la liste.
- [ ] **Point d'attention réel, à consigner tel quel** : malgré la formulation
      prudente du code (`archiveSyndicateByTenant`), il s'agit d'une
      **suppression définitive en base** (`prisma.syndicate.delete`, cascade
      sur les lots), pas d'un archivage réversible — il n'existe aucun statut
      intermédiaire ni bouton « Réactiver » pour une copropriété. C'est
      pourquoi ce scénario ne supprime **que** cette copropriété jetable, sans
      aucun lot ni enfant créé dessus.

### 1.4 Modifier la fiche des Acacias (copropriété du fil financier)

1. Ouvrir `BASE/syndics`, cliquer sur la carte **Copropriété Les Acacias
   (Recette 2)** → **« Voir la fiche »** (ou directement la carte).
2. Cliquer **« Modifier »**.
3. Renseigner :
   - N° d'immatriculation : `RC-ACACIAS-RECETTE3`
   - Référence cadastrale : `CAD-ACACIAS-R3`
   - Exercice : `1`
   - Gestionnaire : laisser vide pour l'instant (le contact
     `Mamadou Gestionnaire (Recette 3)` n'existe pas encore dans le CRM — on y
     revient à l'étape 1.5).
4. Cliquer **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Copropriété mise à jour`, la carte « Informations générales »
      affiche les nouvelles valeurs.

### 1.5 Créer le contact gestionnaire puis l'assigner

1. Menu **CRM › Contacts** (`BASE/crm/contacts`), bouton **« Nouveau
   contact »**.
2. Dans la modale « Créer un nouveau contact », onglet « Basique » :
   - Type de contact : **Personne**
   - Prénom : `Mamadou`
   - Nom : `Gestionnaire (Recette 3)`
   - Email personnel : `gestionnaire.recette3@exemple.test`
3. Enregistrer.
4. Revenir sur `BASE/syndics/<id-acacias>`, **« Modifier »**, champ
   « Gestionnaire » : sélectionner `Mamadou Gestionnaire (Recette 3)
(gestionnaire.recette3@exemple.test)`. Enregistrer.

#### Résultat attendu

- [ ] La carte « Informations générales » affiche désormais
      `Gestionnaire : Mamadou Gestionnaire (Recette 3)`.

---

## 2. Lots et tantièmes

### 2.1 Page : `BASE/syndics/<id-acacias>/lots`

#### Ce qu'on doit faire

Créer 4 lots avec **« Nouveau lot »** (pas de bien lié — laisser le champ
« Bien lié » vide, un lot de copropriété peut exister sans property
sous-jacente, cf. lots MC1/MP1 du scénario abonnement) :

| Numéro de lot | Type de lot | Tantièmes généraux | Tantièmes spéciaux |
| ------------- | ----------- | ------------------ | ------------------ |
| `ACA-A1`      | Appartement | 100                | (vide)             |
| `ACA-A2`      | Appartement | 200                | (vide)             |
| `ACA-A3`      | Appartement | 300                | (vide)             |
| `ACA-A4`      | Appartement | 400                | (vide)             |

Ne pas encore renseigner « Propriétaire CRM » (fait en partie 3).

#### Résultat attendu

- [ ] 4 messages `Lot créé`.
- [ ] Cartes de synthèse en haut de page : **« Nombre de lots » = 4**,
      **« Tantièmes généraux cumulés » = 1000**, « Lots avec propriétaire » =
      0, « Lots avec locataire actif » = 0.
- [ ] Le tableau des lots liste les 4 lignes, colonne « Propriétaire » à
      `Sans copropriétaire` / non renseigné pour les 4.

### 2.2 Clé de répartition — ce qui n'existe pas encore à ce stade

Il n'y a **aucune** clé de répartition portée par le lot lui-même : les
tantièmes saisis ici (`generalShares`/`specialShares`) sont la seule donnée du
lot. La **clé de répartition** (tantièmes généraux, tantièmes spéciaux,
répartition égale, ou manuelle) se choisit plus tard, **par ligne
budgétaire**, en partie 4 — ce n'est pas une anomalie si aucun sélecteur de
clé n'apparaît sur cet écran des lots.

---

## 3. Copropriétaires — rattachement aux lots, compte copropriétaire

### 3.1 Créer les 4 contacts CRM copropriétaires

Menu **CRM › Contacts**, **« Nouveau contact »** × 4, type **Personne** :

| Prénom | Nom                | Email                          |
| ------ | ------------------ | ------------------------------ |
| Copro  | Un (Recette 3)     | `copro1.recette3@exemple.test` |
| Copro  | Deux (Recette 3)   | `copro2.recette3@exemple.test` |
| Copro  | Trois (Recette 3)  | `copro3.recette3@exemple.test` |
| Copro  | Quatre (Recette 3) | `copro4.recette3@exemple.test` |

### 3.2 Rattacher chaque copropriétaire à son lot

Sur `BASE/syndics/<id-acacias>/lots`, pour chacun des 4 lots : bouton
**« Modifier »** (icône crayon dans la colonne Actions du tableau des lots) →
champ « Propriétaire CRM » → sélectionner le contact correspondant (Un→ACA-A1,
Deux→ACA-A2, Trois→ACA-A3, Quatre→ACA-A4) → renseigner « Propriétaire depuis
le » (date du jour) → **« Enregistrer »**.

#### Résultat attendu

- [ ] Colonne « Propriétaire » du tableau des lots affiche les 4 noms.
- [ ] Cartes de synthèse : « Lots avec propriétaire » = 4.

### 3.3 Compte du lot (compte copropriétaire)

1. Depuis le tableau des lots, bouton **« Compte »** sur la ligne `ACA-A1`
   (navigue vers `BASE/syndics/<id-acacias>/lots/<lotId>/compte`).

#### Résultat attendu

- [ ] La page se charge sans erreur (le compte est **créé automatiquement à
      la première consultation** — `getOrCreateOwnerAccountForLot` — dès lors
      que le lot a un propriétaire CRM ; **avant** le rattachement de l'étape
      3.2, cette même page aurait affiché une erreur de chargement `Compte lot
introuvable ou lot sans proprietaire`, ce qui n'aurait pas été une anomalie).
- [ ] Cartes : **Solde courant = 0 FCFA**, **Transactions = 0**,
      **Propriétaire = Copro Un (Recette 3)**.

### 3.4 Ajustement manuel sur le compte

1. Bouton **« Ajouter ajustement »**.
2. Direction : **Crédit**, Montant : `20000`, Libellé :
   `Avance de trésorerie (Recette 3)`. Enregistrer.

#### Résultat attendu

- [ ] Message `Ajustement enregistré`.
- [ ] **Solde courant = 20 000 FCFA**, **Transactions = 1**.
- [ ] Ligne du tableau : Type `Ajustement`, Crédit `20 000`, Solde `20 000`.

### 3.5 Relevé PDF

1. Bouton **« Télécharger le relevé »**.

#### Résultat attendu

- [ ] Un fichier `releve-compte-lot-<lotId>.pdf` est téléchargé sans erreur.

---

## 4. Budget prévisionnel, vote et appels de fonds

### 4.1 Page : `BASE/syndics/<id-acacias>/budgets`

#### Ce qu'on doit faire — créer le budget

1. **« Nouveau budget »**.
2. Remplir :
   - Exercice : `2026`
   - Libellé : `Budget prévisionnel 2026 (Recette 3)`
   - Montant total : `1000000`
   - Catégorie principale : `Entretien parties communes`
   - Description ligne : `Entretien, nettoyage et petites réparations`
   - Clé de distribution : **Tantièmes généraux**
   - Devise : `XOF`
3. **« Créer budget »**.

#### Résultat attendu

- [ ] Message `Budget créé`. Ligne dans le tableau « Budgets » : Exercice
      2026, Montant **1 000 000**, Allocations `0`, Statut `DRAFT`.

### 4.2 Approuver puis répartir

1. Sur la ligne du budget, bouton **« Approuver »**.
2. Puis bouton **« Répartir »**.

#### Résultat attendu

- [ ] Après « Approuver » : Statut devient `APPROVED`, message
      `Budget approuvé`.
- [ ] Après « Répartir » : message `Allocations recalculées (4 lot(s))`.
- [ ] Carte « Répartition des lots » — **montants exactement calculables**,
      la clé « Tantièmes généraux » répartit le 1 000 000 FCFA
      proportionnellement aux 1000 tantièmes des 4 lots :

  | Lot    | Tantièmes | Total alloué attendu |
  | ------ | --------- | -------------------- |
  | ACA-A1 | 100       | **100 000 FCFA**     |
  | ACA-A2 | 200       | **200 000 FCFA**     |
  | ACA-A3 | 300       | **300 000 FCFA**     |
  | ACA-A4 | 400       | **400 000 FCFA**     |

  (Ces 4 montants totalisent exactement 1 000 000 — aucun centime
  d'arrondi à attendre puisque 1 000 000 / 1000 tantièmes tombe rond.)

### 4.3 Générer les appels de charges depuis le budget

1. Sur la ligne du budget, bouton **« Générer appels »**.
2. Dans la modale, le libellé est pré-rempli `Campagne 2026`, période
   pré-remplie `2026-01` : les laisser tels quels. Choisir une **Date
   échéance** dans le futur (ex. dans 30 jours). Type de campagne :
   **Régulier**.
3. **« Générer »**.

#### Résultat attendu

- [ ] Message `Campagne d'appels générée`.
- [ ] Carte « Campagnes d'appels » : une ligne `Campagne 2026`, période
      `2026-01`, type `Régulier`, montant **1 000 000**, `Charges = 4`,
      statut `Envoyé`.
- [ ] En allant sur `BASE/syndics/<id-acacias>/charges` : 4 nouveaux appels de
      charges apparaissent, un par lot, avec exactement les montants de la
      table 4.2 (100 000 / 200 000 / 300 000 / 400 000), période `2026-01`,
      statut **En attente**.

---

## 5. Charges et dépenses directes, avec leur répartition

Ce module est **volontairement différent** du précédent : ici l'appel de
charges est saisi à la main, et **le même montant est appliqué tel quel à
chaque lot ciblé — il n'y a aucune répartition automatique par tantièmes**,
contrairement au parcours budgétaire de la partie 4. C'est une vraie
différence de comportement entre les deux écrans, pas une anomalie.

### 5.1 Page : `BASE/syndics/<id-acacias>/charges`

#### Ce qu'on doit faire — appel individuel

1. **« Nouvel appel de charges »**.
2. Cible : **Un lot** → Lot `ACA-A1`. Dates de période : aujourd'hui →
   aujourd'hui + 1 mois. Montant : `5000`, Devise `XOF`. Date d'échéance :
   dans 15 jours. Charge récurrente : Non.
3. **« Créer »**.

#### Résultat attendu

- [ ] Message `Appel de charges créé`.
- [ ] Carte « Montant appelé » de la page augmente de 5 000.

### 5.2 Appel identique sur plusieurs lots (pour vérifier l'absence de répartition)

1. **« Nouvel appel de charges »**.
2. Cible : **Plusieurs lots** → sélectionner `ACA-A2`, `ACA-A3`, `ACA-A4`.
   Montant : `5000` (le **même** montant, pas un total à répartir). Dates,
   échéance : identiques à 5.1.
3. **« Créer »**.

#### Résultat attendu

- [ ] Message `3 appels de charges créés`.
- [ ] Dans `BASE/syndics/<id-acacias>/comptabilite` ou sur la liste des
      appels : chacun des lots `ACA-A2`, `ACA-A3`, `ACA-A4` porte un appel de
      **5 000 FCFA chacun** (donc 15 000 au total pour les trois), **et non**
      5 000 réparti selon les tantièmes (qui aurait donné 1 000 / 1 500 /
      2 000 pour ces trois lots). Confirmer que les 4 lots ont chacun un
      montant de 5 000 sur cette charge — c'est le comportement réel du code
      (`createChargeCallAndUpdateStatus` recopie `data.amount` tel quel pour
      chaque lot cible), pas une répartition par tantièmes.

---

## 6. Comptabilité

### 6.1 Page : `BASE/syndics/<id-acacias>/comptabilite`

#### Ce qu'on doit faire — plan comptable

1. **« Nouveau compte »** × 2 :
   - Compte 1 : Numéro `512000`, Classe `5`, Intitulé
     `Banque (Recette 3)`, Type **ACTIF**.
   - Compte 2 : Numéro `702000`, Classe `7`, Intitulé
     `Produits charges copropriété (Recette 3)`, Type **PRODUIT**.

#### Résultat attendu

- [ ] 2 messages `Compte comptable créé`. Carte « Comptes » = incrémentée de 2.

### 6.2 Journal comptable

1. **« Nouveau journal »** : Code `BQ-R3`, Exercice `2026`, Libellé
   `Banque Recette 3`, Type journal `BANQUE`.

#### Résultat attendu

- [ ] Message `Journal comptable créé`.

### 6.3 Écriture comptable équilibrée

1. **« Nouvelle écriture »** (n'apparaît que si au moins 2 comptes et 1
   journal existent — condition déjà remplie).
2. Journal : `BQ-R3`. Date écriture : aujourd'hui. Référence : `ECR-R3-001`.
   Source : `MANUEL`. Description : `Encaissement test Recette 3`.
3. Ligne 1 : Compte `512000 - Banque (Recette 3)`, Débit `50000`, Crédit
   vide, Libellé `Entrée banque`.
4. Ligne 2 : Compte `702000 - Produits charges copropriété (Recette 3)`,
   Débit vide, Crédit `50000`, Libellé `Produit constaté`.
5. **« Créer écriture »**.

#### Résultat attendu

- [ ] Message `Écriture comptable enregistrée`.
- [ ] Carte « Balance équilibrée » = **Oui**.
- [ ] Balance de vérification : ligne `512000` Débit `50 000` / Crédit `0` /
      Solde `50 000` ; ligne `702000` Débit `0` / Crédit `50 000` / Solde
      `-50 000`. Total débit = total crédit = 50 000.
- [ ] Grand livre : 2 lignes portant la référence `ECR-R3-001`.

### 6.4 Verrouiller l'écriture

1. Sur la ligne de l'écriture, bouton **« Verrouiller »**.

#### Résultat attendu

- [ ] Message `Écriture verrouillée`. Le statut passe à `VERROUILLÉE`
      (tag vert), le bouton disparaît (remplacé par un tag `Verrouillée`).

---

## 7. Encaissements manuels — module non atteignable depuis l'interface

**Constat attendu, pas un objectif à atteindre par contournement.** Il
n'existe **aucun bouton, dans aucun écran du module Syndic, qui enregistre un
paiement (`ChargePayment`) contre un appel de charges.** La route API existe
bien (`POST .../syndics/:syndicId/charges/:chargeId/pay`,
`recordChargePaymentWithStatusUpdate`) et le service web la déclare
(`recordChargePayment` dans `services/syndic-service.ts`), mais **aucune page
ni composant ne l'appelle** (vérifié : ni `SyndicCharges`, ni
`SyndicFinances`, ni `ChargeCallTable`, ni `SyndicOwnerAccount` — ce dernier
ne fait que des ajustements manuels de compte, sans toucher au statut de
l'appel de charges).

### 7.1 Page : `BASE/syndics/<id-acacias>/finances`

#### Ce qu'on doit faire

1. Ouvrir la page, observer les cartes du haut.

#### Résultat attendu

- [ ] **« Total appelé »** reflète la somme de tous les appels créés en
      parties 4 et 5 : 1 000 000 (budget) + 5 000 (5.1) + 5 000×3 (5.2) =
      **1 020 000 FCFA**.
- [ ] **« Total payé » = 0 FCFA**, et **« Reste à payer » = 1 020 000 FCFA**,
      quel que soit le temps passé sur ce scénario : rien dans l'interface ne
      permet de le faire bouger. **Ce n'est pas une anomalie du scénario : le
      module lui-même ne l'implémente pas.** Le consigner comme tel dans le
      journal, sans chercher de bouton caché.
- [ ] Tous les appels de la partie 4 et 5 restent au statut **En attente**
      dans le tableau « Détail des appels de fonds ».

---

## 8. Relances et recouvrement

Le tableau des retards ne dépend **pas** d'un statut `OVERDUE` du modèle (rien
dans le code applicatif ne fait jamais passer un appel à ce statut — pas même
une tâche planifiée) : il liste simplement les appels dont **la date
d'échéance est dépassée et le statut n'est pas Payé**
(`listOverdueDashboardBySyndicate`). C'est pourquoi ce scénario doit générer
un appel dont l'échéance est **déjà passée** pour peupler ce tableau.

### 8.1 Générer un appel déjà en retard (par le budget, seule modale sans restriction de date)

1. Retour à `BASE/syndics/<id-acacias>/budgets`.
2. Sur le budget `Budget prévisionnel 2026 (Recette 3)` (déjà `APPROVED`,
   allocations déjà calculées en 4.2), bouton **« Générer appels »** une
   seconde fois.
3. Libellé : `Campagne retard test (Recette 3)`, Période : `2026-00-RETARD`,
   **Date échéance : une date d'il y a 10 jours** (champ `<input
type="date">` sans restriction, contrairement au formulaire de la partie 5).
   Type : **Exceptionnel**.
4. **« Générer »**.

#### Résultat attendu

- [ ] Message `Campagne d'appels générée` — la date passée est acceptée sans
      avertissement (ce formulaire, à la différence de celui de la partie 5,
      n'a pas de `disabledDate`). **Ce n'est pas une anomalie.**
- [ ] 4 nouveaux appels de 100 000 / 200 000 / 300 000 / 400 000 apparaissent,
      échéance il y a 10 jours, statut **En attente**.

### 8.2 Page : `BASE/syndics/<id-acacias>/recouvrement`

#### Résultat attendu

- [ ] Cartes : **« Lots en retard » = 4**, **« Montant restant dû »** =
      100 000 + 200 000 + 300 000 + 400 000 = **1 000 000 FCFA** (les 4 appels
      de 8.1, aucun paiement possible pour les faire baisser — voir partie 7).
- [ ] Tableau des retards : 4 lignes, colonne **« Jours retard » = 10** pour
      chacune (à ± 1 jour près selon l'heure du test).

### 8.3 Relance manuelle — ne jamais choisir SMS

1. **« Relance manuelle »**.
2. Appel de charges : choisir celui du lot `ACA-A1` (reste 100 000).
   Niveau : `1`. **Canal : Email** (la liste propose aussi SMS, WhatsApp,
   Push — **ne jamais sélectionner SMS**).
3. **« Créer »**.

#### Résultat attendu

- [ ] Message `Relance créée`. Carte « Historique relances » : une ligne
      Niveau `1`, Canal `EMAIL`, Statut `Envoyé`, Lot `ACA-A1`.

### 8.4 Relances groupées

1. Bouton **« Lancer les relances groupées »**.

#### Résultat attendu

- [ ] Message `Relances groupées envoyées : X relance(s) créée(s)` — `X`
      correspond aux lots en retard qui n'ont pas encore de relance au niveau
      suivant (comportement exact à consigner tel qu'observé, sans deviner la
      règle de niveau si elle n'est pas documentée à l'écran).

### 8.5 Pénalité de retard puis remise

1. **« Appliquer pénalité »** : Appel de charges = celui du lot `ACA-A2`
   (reste 200 000). Taux : `5` (%). Jours de retard : laisser vide (calculé).
   **« Appliquer »**.

#### Résultat attendu

- [ ] Message `Pénalité appliquée`. Carte « Pénalités de retard » : ligne
      Lot `ACA-A2`, Taux `5%`, **Montant = 200 000 × 5 % = 10 000 FCFA**,
      Statut `ACTIF`.

2. Sur cette ligne, bouton **« Remise »** → motif
   `Accord amiable Recette 3` → **« Appliquer remise »**.

#### Résultat attendu

- [ ] Message `Remise appliquée`. Statut de la ligne passe à `REMIS`.

### 8.6 Échéancier de paiement

1. **« Créer échéancier »** : Appel de charges = lot `ACA-A3` (reste
   300 000). Montant total : `300000`. Deux échéances : `150000` dans 30
   jours, `150000` dans 60 jours. **« Créer »**.

#### Résultat attendu

- [ ] Message `Échéancier créé`. Carte « Échéanciers » : une ligne Lot
      `ACA-A3`, Montant total `300 000`, 2 échéances listées
      (`+30j (150 000)` puis `+60j (150 000)`), Statut `ACTIVE` (ou
      équivalent affiché tel quel).

---

## 9. Prestataires

### 9.1 Page : `BASE/syndics/<id-acacias>/prestataires`

**Constat à faire avant toute action** : il n'existe **aucun bouton ni
formulaire, nulle part dans le code, pour créer un `ServiceProvider`** — ni
sur cette page, ni ailleurs dans le module. Le formulaire « Nouveau contrat »
exige de choisir un prestataire dans une liste déroulante alimentée
uniquement par les prestataires déjà en base pour le tenant (le catalogue de
prestataires est partagé entre toutes les copropriétés d'une même agence,
`ServiceProvider.tenantId`).

#### Ce qu'on doit faire

1. Ouvrir la page, observer la carte **« Prestataires (N) »**.
2. **Si N > 0** (prestataires déjà présents, hérités d'une autre
   copropriété de l'agence) : continuer avec « Nouveau contrat » en
   choisissant l'un d'eux.
3. **Si N = 0** : consigner qu'aucun contrat ne peut être créé pour cette
   partie faute de prestataire disponible, et **ne pas chercher de bouton de
   création de prestataire — il n'existe pas**. Passer directement au constat
   ci-dessous sans forcer d'action.

#### Si un prestataire est disponible — créer un contrat

1. **« Nouveau contrat »**. Prestataire : le premier de la liste. Nature :
   `Entretien espaces verts (Recette 3)`. Date de début : aujourd'hui. Date de
   fin : dans 1 an. Montant annuel : `600000`. Devise `XOF`. Alerte
   renouvellement : `30` jours.
2. **« Créer »**.

#### Résultat attendu

- [ ] Message `Contrat créé avec succès`. Carte « Contrats de maintenance » :
      une ligne avec ce prestataire, nature, montant `600 000`, statut actif.

---

## 10. Profils lot et incidents

Cet écran combine deux entités **distinctes** du modèle « Propriétaire CRM »
déjà utilisé en partie 3 (`SyndicateLot.ownerContactId`) : `LotOwnerProfile`
et `LotTenantProfile` sont des fiches séparées, avec leurs propres champs
(pourcentage de détention, dates, accès portail), et **ne réutilisent ni
n'affectent** le champ « Propriétaire CRM » du lot ni le compte copropriétaire
de la partie 3. Les deux coexistent sans se synchroniser.

### 10.1 Page : `BASE/syndics/<id-acacias>/profils-incidents`

#### Ce qu'on doit faire — profil propriétaire

1. **« Profil propriétaire »**. Lot : `ACA-A1`. Contact propriétaire :
   `Copro Un (Recette 3)`. Part de propriété (%) : `100`. Date de début :
   aujourd'hui. **Activer accès portail : Oui**.
2. **« OK »** (la modale n'a pas de libellé explicite sur le bouton de
   validation dans le code — consigner le libellé réellement affiché).

#### Résultat attendu

- [ ] Message `Profil propriétaire créé`. Tableau « Profils propriétaires » :
      une ligne Lot `ACA-A1`, Contact `Copro Un (Recette 3)`, Part `100`,
      Portail `ACTIVE` (tag vert).
- [ ] **Constat à faire, pas une action à tenter** : cocher « Activer accès
      portail » ne fait apparaître nulle part un lien d'invitation ni une
      page de portail à visiter (voir partie 13 — ce champ ne débouche sur
      aucune fonctionnalité observable dans l'interface).

#### Ce qu'on doit faire — profil locataire

1. **« Profil locataire »**. Lot : `ACA-A2`. Contact locataire :
   `Copro Deux (Recette 3)` (réutilisé ici comme locataire test, uniquement
   pour vérifier le formulaire — aucune incohérence métier n'est testée).
   Date d'entrée : aujourd'hui. Charges facturées au locataire : Non.
2. Valider.

#### Résultat attendu

- [ ] Message `Profil locataire créé`. Ligne dans « Profils locataires ».

### 10.2 Incident et imputation

1. **« Nouvel incident »**. Contact déclarant : `Copro Un (Recette 3)`. Lot :
   `ACA-A1`. Type incident : **Fuite**. Urgence : **Haute**. Description :
   `Fuite sous évier commun (Recette 3)`.
2. Valider.

#### Résultat attendu

- [ ] Message `Incident créé`. Ligne dans « Incidents et imputations » :
      Type `Fuite`, Urgence `Haute`, Statut `Signalé`, Imputations `0`.

3. Sur cette ligne, **« Ajouter imputation »**. Type imputation :
   **Budget syndic**. Montant : `15000`. Lot : `ACA-A1`. Notes :
   `Plomberie Recette 3`. Valider.

#### Résultat attendu

- [ ] Message `Imputation enregistree`. La ligne de l'incident affiche
      désormais `Imputations = 1` (tag bleu). En dépliant la ligne : Type
      `Budget syndic`, Montant `15 000`, Lot `ACA-A1`.

---

## 11. Assemblées générales — convocation, ordre du jour, résolutions, votes, majorité, procès-verbal

### 11.1 Page : `BASE/syndics/<id-acacias>/assemblees`

#### Ce qu'on doit faire — créer l'AG

1. **« Nouvelle assemblée »**. Type : **Ordinaire**. Date et heure : dans 14
   jours, 18h00. Heure de début : `18:00`. Heure de fin : `20:00`. Lieu :
   `Salle communale (Recette 3)`.
2. **« Créer »**.

#### Résultat attendu

- [ ] Message `Assemblée créée`.
- [ ] **Comportement réel à noter, pas à vérifier par un e-mail** : la
      création déclenche automatiquement une convocation (e-mail) à tous les
      copropriétaires ayant un e-mail rattaché à un lot de la copropriété
      (`notifyMeetingConvocation`, appelée par le contrôleur juste après la
      création) — ici les 4 contacts `copro*.recette3@exemple.test`. Aucun
      message de confirmation spécifique n'apparaît à l'écran pour cet envoi :
      c'est le message générique `Assemblée créée` qui couvre les deux. Ne pas
      chercher à consulter la boîte mail (hors périmètre de ce scénario), et
      ne pas considérer l'absence de confirmation visible comme une anomalie.
- [ ] La ligne apparaît dans la liste avec Statut `Planifiée`.

### 11.2 Ordre du jour

1. Ouvrir la fiche (**« Voir détails »**).
2. Carte « Ordre du jour », **« Ajouter un point »** : Titre
   `Approbation du budget prévisionnel 2026 (Recette 3)`, Ordre `1`,
   Discussions : `Présentation du budget des Acacias`.
3. Enregistrer.

#### Résultat attendu

- [ ] Message `Point d'ordre du jour enregistré`. Le point apparaît dans la
      carte « Ordre du jour », titré `1. Approbation du budget prévisionnel
2026 (Recette 3)`.

### 11.3 Résolution et votes — la règle de majorité réelle du code

1. **« Ajouter une résolution »** : Titre
   `Approbation du budget prévisionnel 2026 (Recette 3)`. Description :
   `Vote sur le budget des parties communes`. Règle de majorité :
   `Article 24` (texte libre).
2. Valider (`Ajouter`).

#### Résultat attendu

- [ ] Message `Résolution ajoutée`. La résolution apparaît dans « Ordre du
      jour et votes », statut `En attente`.

3. Dans le tableau de vote, saisir pour cette résolution :
   - `ACA-A1` (100 tantièmes) → **Pour**
   - `ACA-A2` (200 tantièmes) → **Pour**
   - `ACA-A3` (300 tantièmes) → **Contre**
   - `ACA-A4` (400 tantièmes) → **Abstention**

#### Résultat attendu — à vérifier précisément

- [ ] Chaque vote déclenche `Vote enregistré` et recalcule immédiatement le
      quorum et le résultat.
- [ ] **Quorum = 100 %** : les 4 lots ont voté, donc les 1000 tantièmes de la
      copropriété sont représentés sur les 1000 existants
      (`representedShares / totalShares × 100`).
- [ ] **Résultat de la résolution : Approuvée.** C'est la règle réelle et
      **importante à consigner** : le code compare **le nombre de lots ayant
      voté Pour contre le nombre de lots ayant voté Contre**
      (`votesFor > votesAgainst`), **pas** les tantièmes représentés. Ici
      2 lots Pour contre 1 lot Contre → Approuvée, **alors que les 200
      tantièmes du lot Contre (ACA-A3, 300 tantièmes) pèsent plus lourd que
      les 300 tantièmes cumulés des deux lots Pour (100+200)**. Le champ
      « Règle de majorité » saisi (`Article 24`) et le total `sharesFor`
      calculé (300) sont **purement informatifs** : ils n'influencent jamais
      le résultat. **Ce n'est pas une anomalie du scénario ni un bogue à
      signaler comme bloquant** — c'est le comportement exact du code
      (`castVoteAndRecomputeResolutionCounters`) ; le consigner tel quel dans
      le journal, avec le calcul ci-dessus à l'appui.
- [ ] Carte « Résultats des résolutions » (haut de la page détail) : Pour `2`,
      Contre `1`, Abstention `1`, Résultat `Approuvée`.

### 11.4 Procès-verbal

1. Bouton **« Générer compte rendu Word »**.

#### Résultat attendu

- [ ] Message `Compte rendu généré`. Un fichier
      `compte-rendu-<meetingId>.docx` est téléchargé.

### 11.5 Ce qui n'est pas une anomalie

- Le statut de l'assemblée reste **« Planifiée »** même après l'ajout de
  résolutions, la saisie de tous les votes et la génération du procès-verbal
  : il n'existe aucun bouton ni action pour faire transiter le statut vers
  « En cours », « Clôturée » ou « Annulée » (le formulaire de modification de
  l'AG ne porte que sur l'heure de début/fin et le lieu). Le consigner sans le
  traiter comme un blocage.

---

## 12. Documents

### 12.1 Page : `BASE/syndics/<id-acacias>/documents`

#### Ce qu'on doit faire

1. **« Ajouter un document »**. Titre : `Règlement de copropriété (Recette
3)`. Type : **Reglement**. Fichier : n'importe quel petit fichier disponible
   localement (le nom du fichier n'a pas d'importance, seul le titre saisi
   compte). Pas de date d'expiration.
2. Ajouter.
3. Répéter avec Titre `Assurance multirisque (Recette 3)`, Type
   **Assurance**, date d'expiration dans 1 an.

#### Résultat attendu

- [ ] 2 messages `Document ajoute`. Les 2 documents apparaissent dans le
      coffre documentaire.

4. Filtrer par type **Assurance** (sélecteur en haut de page).

#### Résultat attendu

- [ ] Seul `Assurance multirisque (Recette 3)` reste affiché.

---

## 13. Portail copropriétaire — module absent du code

**Ne pas chercher cette page : elle n'existe pas.** Vérification faite dans
le code (pas une supposition) : le champ `LotOwnerProfile.portalAccessToken`
généré à la partie 10 n'est lu par **aucune route** ni **aucune page** —
`grep` de `portalAccessToken` et de `LotOwnerProfile` dans
`packages/api/src/services/owner-portal-service.ts`,
`packages/api/src/middleware/owner-portal-access.ts` et
`packages/api/src/utils/owner-portal-validators.ts` ne renvoie **aucun
résultat**. Le « Portail Propriétaire » qui existe bel et bien dans
l'application (`apps/web/src/pages/OwnerPortal/*`, menu séparé) est une
fonctionnalité de la **gestion locative** (loyers, quittances, `OwnerPayout`,
`PropertyOwnershipShare`) : elle ne connaît ni les copropriétés, ni les lots
de copropriété, ni `LotOwnerProfile`.

#### Ce qu'on doit faire

Rien à jouer pour ce module. Se contenter de confirmer, en observant l'écran
« Profils lot et incidents » de la partie 10, qu'aucun lien d'invitation
n'apparaît nulle part après activation de l'accès portail (déjà vérifié en
10.1).

---

## 14. Tableaux de bord et exports

Il n'existe **pas** de page dédiée « Tableau de bord » ni « Exports » pour le
module Syndic. Les seuls éléments de synthèse sont les cartes déjà rencontrées
sur les pages précédentes :

- `BASE/syndics/<id>` (Détail) : Lots, Bâtiments, Appels de charges.
- `BASE/syndics/<id>/finances` : Total fonds, Total appelé, Total payé, Reste
  à payer, Dossiers en retard, Montant en retard.
- `BASE/syndics/<id>/charges` : Montant appelé, Dossiers en attente, Dossiers
  en retard.
- `BASE/syndics/<id>/recouvrement` : Lots en retard, Montant restant dû.
- `BASE/syndics/<id>/comptabilite` : Comptes, Journaux, Balance équilibrée.

Les deux **seules** fonctions d'export réelles de tout le module sont celles
déjà exercées plus haut : le relevé PDF d'un compte lot (partie 3.5) et le
procès-verbal Word d'une AG (partie 11.4). **Il n'y a aucun export CSV/Excel,
ni aucun tableau de bord consolidé multi-copropriétés** (chaque écran est
toujours cadré sur une seule copropriété à la fois — il n'existe pas de vue
globale de l'agence pour le Syndic, contrairement à ce que suggère la carte
« Total fonds » de la partie 6/7 : elle ne montre que les fonds de la
copropriété ouverte, et de toute façon **aucun `SyndicateFund` n'est jamais
créé** dans ce scénario ni ailleurs dans le code — voir l'annexe).

#### Ce qu'on doit faire

1. Revisiter rapidement les 5 pages ci-dessus pour confirmer les montants déjà
   consignés dans les parties précédentes restent cohérents entre eux (ex. le
   « Total appelé » de Finances doit correspondre à la somme des appels créés
   en parties 4, 5 et 8.1).

#### Résultat attendu

- [ ] Cohérence confirmée, aucun écran supplémentaire à découvrir.

---

## 15. Nettoyage

- La copropriété jetable a déjà été supprimée en partie 1.3 (seule
  suppression du scénario).
- Rien d'autre à nettoyer : les contacts CRM, lots, budgets, écritures et
  documents créés sur « Les Acacias (Recette 2) » restent en base pour
  inspection ultérieure, comme convenu (on ne supprime que ce qui a été
  explicitement désigné pour l'être).

---

## 16. Journal de test

| Étape | Résultat (OK / KO / Noté) | Constaté | Capture |
| ----- | ------------------------- | -------- | ------- |
| 1.1   |                           |          |         |
| 1.2   |                           |          |         |
| 1.3   |                           |          |         |
| 1.4   |                           |          |         |
| 1.5   |                           |          |         |
| 2.1   |                           |          |         |
| 3.1   |                           |          |         |
| 3.2   |                           |          |         |
| 3.3   |                           |          |         |
| 3.4   |                           |          |         |
| 3.5   |                           |          |         |
| 4.1   |                           |          |         |
| 4.2   |                           |          |         |
| 4.3   |                           |          |         |
| 5.1   |                           |          |         |
| 5.2   |                           |          |         |
| 6.1   |                           |          |         |
| 6.2   |                           |          |         |
| 6.3   |                           |          |         |
| 6.4   |                           |          |         |
| 7.1   |                           |          |         |
| 8.1   |                           |          |         |
| 8.2   |                           |          |         |
| 8.3   |                           |          |         |
| 8.4   |                           |          |         |
| 8.5   |                           |          |         |
| 8.6   |                           |          |         |
| 9.1   |                           |          |         |
| 10.1  |                           |          |         |
| 10.2  |                           |          |         |
| 11.1  |                           |          |         |
| 11.2  |                           |          |         |
| 11.3  |                           |          |         |
| 11.4  |                           |          |         |
| 12.1  |                           |          |         |
| 13    |                           |          |         |
| 14    |                           |          |         |
| 15    |                           |          |         |

Anomalies à consigner à part : page, action, résultat attendu, résultat
constaté, capture.

---

## Annexe — Écarts spec ↔ code

La spécification fonctionnelle
[specs/013-syndic-module/spec.md](../../specs/013-syndic-module/spec.md) et
son [data-model.md](../../specs/013-syndic-module/data-model.md) décrivent un
périmètre plus large que ce que `packages/api/src/lib/syndics/` et
`apps/web/src/pages/syndics/` implémentent réellement. Liste établie par
lecture directe du code (recherches `grep` documentées ci-dessous), pas par
déduction :

| #   | Exigence de la spec                                                                            | État réel du code                                                                                                                                                                                                                                                                                                                             | Preuve                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FR-005 : « Le système MUST permettre d'enregistrer des paiements d'appels de charges »         | La route API existe (`POST .../charges/:chargeId/pay`) et le service web la déclare (`recordChargePayment`), mais **aucun écran ne l'appelle**. Impossible à exercer par clic.                                                                                                                                                                | `grep -rn "recordChargePayment" apps/web/src/` → seule occurrence : la déclaration dans `services/syndic-service.ts`, aucun appel dans `pages/syndics/*.tsx` ni `components/syndics/*.tsx`.                                                                 |
| 2   | FR-010 : « Le système MUST permettre d'enregistrer des prestataires de services »              | Seule la **lecture** (`listServiceProvidersBySyndicate`) existe. Aucune fonction `createServiceProvider`, aucune route POST, aucun formulaire « Nouveau prestataire ». Seuls les **contrats** liés à un prestataire déjà existant peuvent être créés.                                                                                         | `grep -n "serviceProvider" packages/api/src/lib/syndics/queries.ts` → seulement `findMany`/`findFirst`, aucun `.create`.                                                                                                                                    |
| 3   | FR-008 : « y compris les cas de représentation via mandat (proxies) »                          | Le modèle `GMProxy` existe dans `schema.prisma` et est inclus dans les requêtes de lecture d'une AG, mais **aucune route** (`create`, `list`) ni **aucun écran** ne permet de créer ou consulter un pouvoir.                                                                                                                                  | `syndic-routes.ts` ne contient aucune route `/pouvoirs` ou `/proxies` ; `grep -rn "GMProxy\|Proxy\b\|Pouvoir\|Mandat" apps/web/src/pages/syndics apps/web/src/components/syndics` → aucun résultat.                                                         |
| 4   | FR-013 : « Le système MUST gérer des fonds financiers par copropriété... avec un solde »       | Le modèle `SyndicateFund` existe et apparaît (toujours vide) dans le résumé financier, mais **aucune route ni écran** ne permet de créer, alimenter ou modifier un fonds.                                                                                                                                                                     | Aucune route `/fonds` dans `syndic-routes.ts` ; aucune fonction de création dans `queries.ts`.                                                                                                                                                              |
| 5   | FR-007/US3 : parcours d'AG complet avec changement de statut (planifiée → en cours → clôturée) | Le statut de l'AG ne peut être modifié par aucun formulaire (`updateMeetingSchema` n'accepte que `startTime`, `endTime`, `location`). Le statut reste `PLANNED` indéfiniment.                                                                                                                                                                 | `packages/api/src/lib/syndics/schemas.ts` (bloc `updateMeetingSchema`).                                                                                                                                                                                     |
| 6   | FR-009 : « déterminer... selon la règle de majorité applicable »                               | Le champ texte libre `majorityRule` n'est jamais lu par le calcul de résultat : la décision se fait uniquement par comparaison du **nombre de lots** votant Pour contre Contre, indépendamment des tantièmes représentés.                                                                                                                     | `castVoteAndRecomputeResolutionCounters` dans `queries.ts` : `const result = votesFor > votesAgainst ? 'APPROVED' : 'REJECTED'` — `votesFor`/`votesAgainst` sont des compteurs de lots, pas de tantièmes ; `majorityRule` n'apparaît dans aucune condition. |
| 7   | Portail copropriétaire implicite (checkbox « Activer accès portail » sur `LotOwnerProfile`)    | Champ purement décoratif : le jeton `portalAccessToken` est généré mais n'est consommé par aucune route ni page. Le « Portail Propriétaire » réellement présent dans l'app (`apps/web/src/pages/OwnerPortal/*`) sert la gestion locative, sans lien avec les copropriétés.                                                                    | `grep` de `portalAccessToken`/`LotOwnerProfile` dans les fichiers du portail propriétaire (services, middleware, validators) → aucun résultat.                                                                                                              |
| 8   | Aucune exigence explicite, mais libellé UI trompeur                                            | Le bouton « Supprimer » d'une copropriété (`SyndicsList`) déclenche une **suppression définitive en base** (`prisma.syndicate.delete`, cascade), bien que la fonction s'appelle `archiveSyndicateByTenant` et que le message de succès soit `Copropriete supprimee` — il n'y a ni statut d'archivage, ni corbeille, ni réactivation possible. | `packages/api/src/lib/syndics/queries.ts`, fonction `archiveSyndicateByTenant` (ligne ~458).                                                                                                                                                                |
