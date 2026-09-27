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

| Objet                                      | Valeur                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Copropriété jetable (créée puis supprimée) | `Copropriété Cycle de Vie (Recette 3)`                                                                                                  |
| Lots des Acacias                           | `ACA-A1` (100 tantièmes), `ACA-A2` (200), `ACA-A3` (300), `ACA-A4` (400)                                                                |
| Contact gestionnaire                       | `Mamadou Gestionnaire (Recette 3)` — `gestionnaire.recette3@exemple.test`                                                               |
| Contacts copropriétaires                   | `Copro Un (Recette 3)` … `Copro Quatre (Recette 3)` — `copro1.recette3@exemple.test` … `copro4.recette3@exemple.test`                   |
| Budget prévisionnel                        | `Budget prévisionnel 2026 (Recette 3)` — 1 000 000 FCFA                                                                                 |
| Assemblée générale                         | AG ordinaire du [date future], `Salle communale (Recette 3)`, et une seconde AG jetable `AG test annulation (Recette 3)` (partie 11.10) |
| Prestataires                               | `Espaces Verts Pro (Recette 3)`, `Ascenseurs Fiables (Recette 3)` (créé à la volée, partie 9.4)                                         |
| Fonds financier                            | `Fonds travaux et gros entretien (Recette 3)` — 150 000 FCFA après ajustement (partie 7.5)                                              |

---

## Modules couverts et modules absents (résumé)

Voir l'annexe « Écarts spec ↔ code » en fin de document pour le détail. La
spec [013-syndic-module](../../specs/013-syndic-module/spec.md) décrivait
plusieurs manques dans `packages/api/src/lib/syndics/` et
`apps/web/src/pages/syndics/` : ils ont été comblés par les lots
`feat/syndic-ag`, `feat/syndic-prestataires` et `feat/syndic-finances` de
cette branche — création de prestataires, enregistrement de paiement de
charges depuis l'écran, pouvoirs d'AG, fonds financiers créables, statut
d'AG (ouvrir/clôturer/annuler), majorité calculée en tantièmes et
suppression d'une copropriété réservée aux copropriétés vides. Il ne reste
qu'un seul module réellement absent : le **portail copropriétaire** (partie
13), qui n'existe encore dans aucune route ni page.

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

Depuis le correctif de l'écart recette #8 (`deleteEmptySyndicateByTenant`,
commit `409c3fb`), la suppression n'est plus une formulation prudente sans
effet réel : elle est **réservée aux copropriétés vides** (aucun lot, appel de
charges, assemblée, document, contrat ou incident lié). C'est pourquoi cette
étape ne joue le cas que sur la copropriété jetable, créée sans aucun enfant.

1. Retour à `BASE/syndics`, sur la carte de cette copropriété jetable, le
   bouton **« Supprimer »** est actif (elle est vide). Cliquer dessus.
2. Confirmer dans la boîte de dialogue (titre `Supprimer cette copropriété ?`,
   texte `Cette action supprime définitivement la copropriété et ses données
liées.`, bouton **« Supprimer »**).

#### Résultat attendu

- [ ] Message `Copropriété supprimée`, la carte disparaît de la liste.
- [ ] Il s'agit toujours d'une **suppression définitive en base**
      (`prisma.syndicate.delete`), pas d'un archivage réversible — aucun
      statut intermédiaire ni bouton « Réactiver » n'existe pour une
      copropriété.

#### Constat complémentaire — tenter de supprimer une copropriété non vide

1. Ouvrir `BASE/syndics`, repérer une copropriété qui a déjà des lots (ex.
   **Les Manguiers (Recette 2)** ou, plus tard dans ce scénario, **Les
   Acacias**).

#### Résultat attendu

- [ ] Le bouton **« Supprimer »** de sa carte est **désactivé** (grisé), avec
      une infobulle `Cette copropriété a des lots ou d'autres données liées :
    elle ne peut pas être supprimée.` — aucun clic possible pour vérifier le
      409 par ce chemin ; c'est le comportement voulu (`isSyndicateEmpty`,
      `SyndicateCard.tsx`). Si jamais une copropriété affichée sans compteurs
      encore chargés laissait le bouton actif, un clic dessus renverrait un
      409 du serveur avec le même message — mais ce cas ne doit pas se
      produire dans l'écran normal.

### 1.4 Modifier la fiche des Acacias (copropriété du fil financier)

1. Ouvrir `BASE/syndics`, cliquer sur la carte **Copropriété Les Acacias
   (Recette 2)** → **« Voir la fiche »** (ou directement la carte).
2. Cliquer **« Modifier »**.
3. Renseigner :
   - N° d'immatriculation : `RC-ACACIAS-RECETTE3`
   - Référence cadastrale : `CAD-ACACIAS-R3`
   - Exercice : `1`
   - Statut : laisser sur `Active` (le champ « Statut » liste `Active`,
     `En liquidation`, `En litige` — un simple constat de sa présence dans le
     formulaire suffit ici, ne pas changer de statut sur les Acacias puisque
     ce scénario continue à y créer des lots et des données jusqu'à la fin).
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
- [ ] **Solde courant = 20 000 FCFA**, avec le libellé **« Créditeur »** en
      dessous (et l'indication « Le copropriétaire a une avance ») —
      **Transactions = 1**. Depuis le correctif « solde lisible » (commit
      `a427757`), le montant affiché est toujours **positif** avec un tag
      Débiteur/Créditeur/Soldé selon le signe réel du solde en base ; un crédit
      rend le solde stocké négatif (`balanceAfter = solde + débit - crédit`),
      d'où le tag « Créditeur » ici — ce n'est pas une anomalie si le montant
      affiché ne porte jamais de signe négatif.
- [ ] Ligne du tableau des transactions : Type `Ajustement`, Crédit `20 000`,
      colonne Solde = `20 000` avec le même tag **« Créditeur »** à côté du
      montant.

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

## 7. Encaissements manuels — enregistrer un paiement contre un appel de charges

Ecart recette #1 (FR-005) comblé par les commits `cd141c8` (API) et `3375f21`
(web) : la route `POST .../syndics/:syndicId/charges/:chargeId/pay`
(`recordChargePaymentWithStatusUpdate`) est désormais **appelée depuis
l'écran**, via le bouton **« Enregistrer un paiement »** de
`ChargeCallTable.tsx`, affiché sur `BASE/syndics/<id-acacias>/charges` (pas
sur la page Finances, qui reste un tableau de lecture seule). Le bouton est
désactivé quand l'appel est déjà `Payé`.

### 7.1 Page : `BASE/syndics/<id-acacias>/finances` — avant paiement

#### Ce qu'on doit faire

1. Ouvrir la page, observer les cartes du haut.

#### Résultat attendu

- [ ] **« Total appelé »** reflète la somme de tous les appels créés en
      parties 4 et 5 : 1 000 000 (budget) + 5 000 (5.1) + 5 000×3 (5.2) =
      **1 020 000 FCFA**.
- [ ] **« Total payé » = 0 FCFA**, **« Reste à payer » = 1 020 000 FCFA**.
- [ ] Tous les appels de la partie 4 et 5 restent au statut **En attente**
      dans le tableau « Détail des appels de fonds ».

### 7.2 Paiement partiel puis solde, sur l'appel individuel de 5.1 (`ACA-A1`, 5 000 FCFA)

1. Aller sur `BASE/syndics/<id-acacias>/charges`, repérer la ligne de l'appel
   du lot `ACA-A1` créé en 5.1 (montant 5 000, statut `En attente`).
2. Bouton **« Enregistrer un paiement »**. Montant : `3000`. Date de
   paiement : aujourd'hui. Mode de paiement : `Virement`. Référence :
   `VIR-R3-001`. **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Paiement enregistré`. La ligne passe au statut **`Partiel`**,
      colonne « Payé » = `3 000`, colonne « Reste » = `2 000`.

3. Rouvrir **« Enregistrer un paiement »** sur la même ligne. Le champ
   Montant est plafonné au reste à payer (`max = 2000` dans le formulaire).
   Montant : `2000`. **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Paiement enregistré`. La ligne passe au statut **`Payé`**
      (tag vert), colonne « Payé » = `5 000`, colonne « Reste » = `0`. Le
      bouton « Enregistrer un paiement » de cette ligne devient **désactivé**.
- [ ] Sur `BASE/syndics/<id-acacias>/lots/<lotId-ACA-A1>/compte` (compte du
      lot `ACA-A1`, partie 3.3) : une transaction supplémentaire de type
      `Paiement`, Crédit `5 000` au total (deux mouvements de 3 000 puis
      2 000), le compte prend chacun en compte au moment de l'enregistrement
      du paiement.

### 7.3 Trop-perçu refusé, sur l'appel de 5.2 (`ACA-A2`, 5 000 FCFA)

1. Sur la même page des charges, ligne de l'appel du lot `ACA-A2` créé en
   5.2 (montant 5 000, encore `En attente`).
2. **« Enregistrer un paiement »**. Tenter un montant de `6000` (au-delà du
   reste dû). Le champ Montant refuse déjà toute saisie supérieure à `5000`
   côté formulaire (`max` = reste à payer) : constater cette limite plutôt que
   de forcer une valeur invalide. Saisir `5000` puis, avant de valider,
   **noter que si l'API était appelée directement avec 6000 elle répondrait
   422** avec un message du type
   `Le paiement (6000 XOF) depasse le reste a payer de cet appel de charges
(5000 XOF)` — ce scénario reste dans l'interface, donc ce constat se limite à
   observer le plafond du champ, sans appel direct à l'API (règle absolue n°5).
3. Annuler la modale sans valider (pour garder cet appel `En attente` et
   servir de matière au recouvrement, partie 8).

#### Résultat attendu

- [ ] Le champ Montant ne peut pas dépasser `5 000`. Aucun paiement enregistré
      sur cet appel à ce stade.

### 7.4 Page : `BASE/syndics/<id-acacias>/finances` — après paiement

#### Résultat attendu

- [ ] **« Total appelé »** reste **1 020 000 FCFA**, inchangé.
- [ ] **« Total payé » = 5 000 FCFA** (le paiement complet de 7.2).
- [ ] **« Reste à payer » = 1 015 000 FCFA** (1 020 000 − 5 000).
- [ ] Dans le tableau « Détail des appels de fonds » : la ligne `ACA-A1`
      (5.1) est `Payé`, les autres restent `En attente`.

### 7.5 Fonds financiers — création, renommage, ajustement

Écart recette #4 (FR-013) comblé par les commits `cd141c8` (API) et `3375f21`
(web) : le modèle `SyndicateFund` existait déjà mais aucune route ni écran ne
permettait de créer, alimenter ou modifier un fonds. La carte « Total fonds »
de cette page reste toutefois cadrée sur cette seule copropriété (voir
partie 14).

1. Sur `BASE/syndics/<id-acacias>/finances`, bouton **« Nouveau fonds »**.
   Nom du fonds : `Fonds travaux (Recette 3)`. Solde initial : `100000`.
   Devise : `XOF`. **« Créer »**.

#### Résultat attendu

- [ ] Message `Fonds créé`. Le tableau « Fonds » affiche une ligne
      `Fonds travaux (Recette 3)`, Solde `100 000 FCFA`. La carte « Total
      fonds » de la page passe à `100 000 FCFA`.

2. Sur cette ligne, bouton **« Renommer »**. Nouveau nom :
   `Fonds travaux et gros entretien (Recette 3)`. **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Fonds renommé`. La ligne affiche le nouveau nom, le solde ne
      change pas.

3. Bouton **« Ajuster le solde »**. Direction : **Crédit (augmenter le
   solde)**. Montant : `50000`. Motif : `Cotisation exceptionnelle travaux
(Recette 3)`. **« Appliquer »**.

#### Résultat attendu

- [ ] Message `Solde du fonds ajusté`. Solde du fonds = `150 000 FCFA`
      (100 000 + 50 000). La carte « Total fonds » de la page reflète ce
      nouveau total.

4. Rouvrir **« Ajuster le solde »** sans remplir le champ **Motif** et tenter
   **« Appliquer »**.

#### Résultat attendu

- [ ] Le formulaire refuse de valider : message `Le motif est obligatoire`
      sous le champ, aucun appel réseau déclenché. Fermer la modale sans
      ajustement supplémentaire.

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
      de 8.1 — aucun paiement n'a été enregistré dessus dans ce scénario ; le
      paiement est possible depuis la partie 7, mais seuls les appels de 5.1
      et 5.2 y ont été exercés).
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

Écart recette #2 (FR-010) comblé par les commits `409c3fb` (API) et
`cf426df` (web) : `SyndicProviders.tsx` (`BASE/syndics/<id>/prestataires`)
permet désormais de **créer, modifier et supprimer** un prestataire
(`ServiceProvider`), en plus de créer un contrat. Le catalogue de
prestataires reste partagé entre toutes les copropriétés d'une même agence
(`ServiceProvider.tenantId`) : un prestataire créé ici est réutilisable
depuis n'importe quelle autre copropriété du tenant.

### 9.1 Page : `BASE/syndics/<id-acacias>/prestataires` — créer un prestataire

#### Ce qu'on doit faire

1. Ouvrir la page, observer la carte **« Prestataires (N) »**.
2. Bouton **« Nouveau prestataire »**. Nom : `Espaces Verts Pro (Recette 3)`.
   Spécialité : `Entretien espaces verts`. Email :
   `contact.espacesverts.recette3@exemple.test`. Téléphone : laisser vide.
3. **« Créer »**.

#### Résultat attendu

- [ ] Message `Prestataire créé`. La carte passe à **« Prestataires (N+1) »**
      et le tableau affiche une ligne `Espaces Verts Pro (Recette 3)`,
      Spécialité `Entretien espaces verts`, avec les actions **« Modifier »**
      et **« Supprimer »**.

### 9.2 Modifier le prestataire

1. Sur cette ligne, bouton **« Modifier »**. Changer la Spécialité en
   `Entretien espaces verts et taille (Recette 3)`. **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Prestataire mis à jour`. La colonne Spécialité reflète la
      nouvelle valeur.

### 9.3 Créer un contrat en réutilisant ce prestataire

1. **« Nouveau contrat »**. Prestataire : `Espaces Verts Pro (Recette 3)`.
   Nature : `Entretien espaces verts (Recette 3)`. Date de début :
   aujourd'hui. Date de fin : dans 1 an. Montant annuel : `600000`. Devise
   `XOF`. Alerte renouvellement : `30` jours.
2. **« Créer »**.

#### Résultat attendu

- [ ] Message `Contrat créé avec succès`. Carte « Contrats de maintenance » :
      une ligne avec ce prestataire, nature, montant `600 000`, statut actif.

### 9.4 Créer un prestataire à la volée depuis un nouveau contrat

1. **« Nouveau contrat »**. Sous le champ Prestataire, lien **« Pas de
   prestataire ? Créer un prestataire »** : cliquer dessus.
2. Dans la modale « Nouveau prestataire » qui s'ouvre par-dessus : Nom :
   `Ascenseurs Fiables (Recette 3)`. Spécialité : `Ascenseur`. **« Créer »**.

#### Résultat attendu

- [ ] Message `Prestataire créé`. La modale de prestataire se ferme et la
      modale « Nouveau contrat » réapparaît avec le champ Prestataire
      **déjà pré-rempli** sur `Ascenseurs Fiables (Recette 3)` — pas besoin de
      le resélectionner.

3. Compléter le reste du formulaire (Nature `Maintenance ascenseur (Recette
3)`, dates identiques à 9.3, montant `400000`) et **« Créer »**.

#### Résultat attendu

- [ ] Message `Contrat créé avec succès`. Un deuxième contrat apparaît dans
      la carte « Contrats de maintenance ».

### 9.5 Suppression refusée — un prestataire avec des contrats

1. Sur la ligne `Espaces Verts Pro (Recette 3)` (a un contrat depuis 9.3),
   bouton **« Supprimer »**, confirmer.

#### Résultat attendu

- [ ] Message d'erreur `Ce prestataire a des contrats ou des incidents liés :
    il ne peut pas être supprimé.` (409, `deleteServiceProviderByTenant`).
      La ligne reste dans le tableau.

### 9.6 Assigner un prestataire à un incident

Cette action se joue depuis l'écran de la partie 10 (elle a besoin d'un
incident déjà créé) : voir **partie 10.3 « Assigner un prestataire à
l'incident »**, qui réutilise `Ascenseurs Fiables (Recette 3)` créé en 9.4.

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

### 10.3 Assigner un prestataire à l'incident (écart recette #2, suite)

`SyndicProfilesIncidents.tsx` charge désormais aussi le catalogue de
prestataires et expose une colonne **« Prestataire »** (sélecteur) par ligne
d'incident, branchée sur `updateSyndicIncident` — cette route existait déjà
côté service sans jamais être appelée depuis un écran.

1. Sur la ligne de l'incident `Fuite sous évier commun (Recette 3)` créé en
   10.2, colonne **« Prestataire »** : ouvrir le sélecteur et choisir
   `Ascenseurs Fiables (Recette 3)` (créé en 9.4 — le prestataire n'a pas
   besoin d'avoir de rapport avec la nature de l'incident pour ce constat,
   seul le branchement du champ est testé ici).

#### Résultat attendu

- [ ] Message `Prestataire assigné à l'incident`. Le sélecteur affiche
      désormais `Ascenseurs Fiables (Recette 3)` pour cette ligne, y compris
      après un rechargement de la page.

---

## 11. Assemblées générales — statut, pouvoirs, majorité en tantièmes, procès-verbal

Écarts recette #3, #5 et #6 comblés par les commits `9b210be` (API) et
`1e39806` (web) : l'AG a désormais un **statut piloté depuis l'écran**
(planifiée → en cours → clôturée, ou planifiée → annulée), des **pouvoirs**
(mandat d'un copropriétaire à un mandataire), et un **résultat calculé en
tantièmes** selon la règle de majorité choisie — plus la seule comparaison du
nombre de lots Pour/Contre de l'ancien code.

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
- [ ] La ligne apparaît dans la liste avec Statut **`Planifiée`**, et la fiche
      (**« Voir détails »**) affiche les boutons **« Ouvrir la séance »** et
      **« Annuler l'assemblée »** (`MeetingStatusActions`).

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

### 11.3 Pouvoir (mandat) — carte « Pouvoirs »

Un pouvoir peut être créé tant que l'AG n'est pas clôturée ni annulée ; ce
scénario le crée avant l'ouverture de la séance. Le mandant est choisi parmi
les copropriétaires des lots de la copropriété, le mandataire parmi tout
contact de l'agence autre que le mandant.

1. Sur la fiche de l'AG, carte **« Pouvoirs »**, bouton **« Ajouter un
   pouvoir »**.
2. Mandant : `Copro Un (Recette 3) (ACA-A1 · Appartement · 100 tantièmes)`
   (le libellé du lot dans cette liste suit désormais `formatLotLabel`,
   partagé avec le reste du module syndic — voir en tête de ce document).
   Mandataire : `Mamadou Gestionnaire (Recette 3)`. **« Enregistrer »**.

#### Résultat attendu

- [ ] Message `Pouvoir enregistré`. Le tableau des pouvoirs affiche une ligne
      Mandant `Copro Un (Recette 3)`, Lots
      `ACA-A1 · Appartement · 100 tantièmes`, Mandataire
      `Mamadou Gestionnaire (Recette 3)`, avec un bouton **« Retirer »**.
- [ ] Dans la carte de saisie des votes (visible dès qu'une résolution
      existe), le sélecteur de lot signale `ACA-A1 · Appartement · 100
tantièmes · représenté par Mamadou Gestionnaire (Recette 3)`, et un tag
      violet `Pouvoir : représenté par Mamadou Gestionnaire (Recette 3)`
      apparaît quand ce lot est sélectionné.

### 11.4 Ouvrir la séance

1. Bouton **« Ouvrir la séance »**, sans confirmation demandée.

#### Résultat attendu

- [ ] Message `Séance ouverte`. Le statut passe à **`En cours`** (tag orange).
      Le bouton **« Annuler l'assemblée »** disparaît, remplacé par
      **« Clôturer la séance »** seule (une AG en cours ne peut plus être
      annulée, seulement clôturée).

### 11.5 Résolution 1 — Article 24, majorité simple des tantièmes exprimés

1. **« Ajouter une résolution »** : Titre
   `Approbation du budget prévisionnel 2026 (Recette 3)`. Description :
   `Vote sur le budget des parties communes`. Règle de majorité : sélectionner
   **`Article 24 — majorité simple`** dans la liste déroulante (valeur par
   défaut ; la liste propose aussi Article 25, Article 26 et Unanimité).
2. Valider (`Ajouter`).

#### Résultat attendu

- [ ] Message `Résolution ajoutée`. La résolution apparaît dans « Ordre du
      jour et votes », statut `En attente`.

3. Dans le tableau de vote, saisir pour cette résolution :
   - `ACA-A1` (représenté par Mamadou Gestionnaire) → **Pour**
   - `ACA-A2` → **Pour**
   - `ACA-A3` → **Contre**
   - `ACA-A4` → **Abstention**

#### Résultat attendu — à vérifier précisément

- [ ] Chaque vote déclenche `Vote enregistré` et recalcule immédiatement le
      quorum et le résultat. Le vote de `ACA-A1` apparaît dans la liste des
      votes avec la mention `(représenté)`.
- [ ] Carte quorum (haut de la page détail) : **`100 %`**, avec le texte
      **`1000 / 1000 tantièmes représentés`** en dessous — les 4 lots ont
      voté, donc les 1000 tantièmes de la copropriété sont représentés sur les
      1000 existants (`representedShares / totalShares`).
- [ ] Carte « Résultats des résolutions » : Règle `Article 24 — majorité
    simple`, Pour `2 lot(s) · 300 tantièmes`, Contre `1 lot(s) · 300
    tantièmes`, Abstention `1 lot(s) · 400 tantièmes`, Total de référence
      `600 tantièmes`.
- [ ] **Résultat de la résolution : `Rejetée`.** C'est la règle réelle du code
      corrigé (`computeResolutionTally`, `meeting-majority.ts`) et
      **importante à consigner** : l'article 24 compare désormais **les
      tantièmes des lots Pour contre les tantièmes des lots Contre**
      (`sharesFor > sharesAgainst`), plus le seul nombre de lots. Ici
      `ACA-A1` (100) + `ACA-A2` (200) = **300 tantièmes Pour**, contre
      `ACA-A3` (300) = **300 tantièmes Contre** : égalité, donc **Rejetée**
      (`sharesFor > sharesAgainst` est faux à 300 contre 300), alors que
      2 lots ont voté Pour contre 1 seul Contre. Avant ce correctif, cette
      même saisie donnait `Approuvée` (comparaison par nombre de lots
      seulement) — le consigner comme le comportement corrigé, pas une
      anomalie.

### 11.6 Résolution 2 — Article 25, majorité absolue des tantièmes de tous les lots

1. **« Ajouter une résolution »** : Titre `Ravalement de façade (Recette 3)`.
   Description : `Vote sur le ravalement des façades communes`. Règle de
   majorité : **`Article 25 — majorité absolue`**.
2. Valider.
3. Votes : `ACA-A1` → **Pour**, `ACA-A2` → **Pour**, `ACA-A4` → **Pour**.
   Ne pas faire voter `ACA-A3` sur cette résolution (il a déjà voté sur la
   résolution 1 : il reste comptabilisé dans le quorum global de l'AG).

#### Résultat attendu

- [ ] Carte « Résultats des résolutions », ligne de cette résolution : Règle
      `Article 25 — majorité absolue`, Pour `3 lot(s) · 700 tantièmes`, Total
      de référence `1000 tantièmes` (tous les lots de la copropriété, votants
      ou non — pas seulement les 700 exprimés).
- [ ] **Résultat : `Approuvée`.** Règle réelle : Pour > 50 % des tantièmes de
      **tous** les lots de la copropriété (`sharesFor × 2 > totalShares`) —
      ici 700 × 2 = 1400 > 1000. `ACA-A3` n'a pas voté sur cette résolution et
      ne compte donc ni pour ni contre, mais pèse dans le total de référence.

### 11.7 Résolution 3 — Article 26, double majorité (copropriétaires et tantièmes)

1. **« Ajouter une résolution »** : Titre
   `Travaux de mise aux normes de l'ascenseur (Recette 3)`. Description :
   `Vote sur les travaux de mise aux normes`. Règle de majorité :
   **`Article 26 — double majorité`**.
2. Valider.
3. Votes : `ACA-A1` → **Contre**, `ACA-A2` → **Pour**, `ACA-A3` → **Pour**,
   `ACA-A4` → **Pour**.

#### Résultat attendu

- [ ] Carte « Résultats des résolutions », ligne de cette résolution : Règle
      `Article 26 — double majorité`, Pour `3 lot(s) · 900 tantièmes`, Contre
      `1 lot(s) · 100 tantièmes`, Total de référence `1000 tantièmes`.
- [ ] **Résultat : `Approuvée`.** Règle réelle : plus de la moitié des
      copropriétaires de la copropriété (en nombre, tous lots confondus) ET au
      moins 2/3 des tantièmes totaux votent Pour. Ici 3 copropriétaires sur 4
      ont voté Pour (`ownersFor × 2 > totalOwners` : 6 > 4) et 900 tantièmes
      sur 1000 représentent bien plus des deux tiers (`sharesFor × 3 ≥
    totalShares × 2` : 2700 ≥ 2000).

### 11.8 Procès-verbal

1. Bouton **« Générer compte rendu Word »** (disponible tant que l'AG n'est
   pas clôturée ni annulée).

#### Résultat attendu

- [ ] Message `Compte rendu généré`. Un fichier
      `compte-rendu-<meetingId>.docx` est téléchargé.

### 11.9 Clôturer la séance — l'AG se fige

1. Bouton **« Clôturer la séance »**, confirmer (`Oui`).

#### Résultat attendu

- [ ] Message `Séance clôturée : les votes sont figés`. Le statut passe à
      **`Clôturée`** (tag vert).
- [ ] La page affiche désormais le texte `Séance clôturée : les votes sont
    figés.` à la place du formulaire de vote. Plus aucun bouton
      **« Pour »/« Contre »/« Abstention »**, plus de bouton **« Ajouter une
      résolution »**, plus de bouton **« Clôturer la séance »**, plus de
      bouton **« Ajouter un pouvoir »** ni **« Retirer »** sur la carte
      Pouvoirs : l'AG entière est figée (`isMeetingFrozen`).
- [ ] Les résultats déjà calculés en 11.5 à 11.7 restent affichés à l'identique
      dans la carte « Résultats des résolutions ».

### 11.10 Annuler une assemblée — sur une AG séparée

L'annulation n'est possible qu'au statut `Planifiée` (le bouton disparaît dès
`En cours`) : elle se joue donc sur une **deuxième AG**, jetable, créée pour
ce seul constat — l'AG principale ci-dessus est déjà `Clôturée`.

1. Retour à `BASE/syndics/<id-acacias>/assemblees`, **« Nouvelle assemblée »**
   : Type **Ordinaire**, date dans 21 jours, 18h00, Lieu
   `AG test annulation (Recette 3)`.
2. Sur cette nouvelle ligne (statut `Planifiée`), ouvrir la fiche, bouton
   **« Annuler l'assemblée »**, confirmer (`Oui`).

#### Résultat attendu

- [ ] Message `Assemblée annulée`. Statut **`Annulée`** (tag rouge). La page
      affiche `Assemblée annulée : aucun vote possible.` ; plus aucun bouton
      de vote, de résolution ni de pouvoir n'apparaît (même figement que pour
      une AG clôturée, `isMeetingFrozen` couvre les deux statuts).
- [ ] Cette AG jetable reste en base au statut `Annulée` (règle n°4 : rien
      n'est supprimé hors du cas prévu en partie 1.3).

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
procès-verbal Word d'une AG (partie 11.8). **Il n'y a aucun export CSV/Excel,
ni aucun tableau de bord consolidé multi-copropriétés** (chaque écran est
toujours cadré sur une seule copropriété à la fois — il n'existe pas de vue
globale de l'agence pour le Syndic : la carte « Total fonds » ne montre que
les fonds de la copropriété ouverte, `Fonds travaux et gros entretien
(Recette 3)` créé en partie 7.5 compris — un fonds créé sur une autre
copropriété de l'agence n'y apparaîtrait pas).

#### Ce qu'on doit faire

1. Revisiter rapidement les 5 pages ci-dessus pour confirmer les montants déjà
   consignés dans les parties précédentes restent cohérents entre eux (ex. le
   « Total appelé » de Finances doit correspondre à la somme des appels créés
   en parties 4, 5 et 8.1 ; le « Total fonds » doit valoir `150 000 FCFA`,
   solde du fonds créé et ajusté en partie 7.5 ; le « Total payé » doit valoir
   `5 000 FCFA`, réglé en partie 7.2).

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

| #   | Exigence de la spec                                                                            | État réel du code                                                                                                                                                                                                                                                                                                                                                         | Preuve                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | FR-005 : « Le système MUST permettre d'enregistrer des paiements d'appels de charges »         | **Résolu (commits `cd141c8` API, `3375f21` web).** Le bouton « Enregistrer un paiement » (`ChargeCallTable.tsx`, page Charges) appelle désormais `recordChargePayment` ; un paiement au-delà du reste dû est refusé (422) au lieu d'être accepté en trop-perçu. Voir partie 7.                                                                                            | `grep -rn "onRecordPayment" apps/web/src/pages/syndics/SyndicCharges.tsx apps/web/src/components/syndics/ChargeCallTable.tsx` → bouton branché sur `handleOpenPayment`/`recordChargePayment`.       |
| 2   | FR-010 : « Le système MUST permettre d'enregistrer des prestataires de services »              | **Résolu (commits `409c3fb` API, `cf426df` web).** `createServiceProvider`/`updateServiceProviderByTenant`/`deleteServiceProviderByTenant` et les routes POST/PATCH/DELETE `.../prestataires[/:providerId]` existent ; `SyndicProviders.tsx` propose « Nouveau prestataire », modification, suppression protégée et création à la volée depuis un contrat. Voir partie 9. | `grep -n "createServiceProvider\|updateServiceProviderByTenant\|deleteServiceProviderByTenant" packages/api/src/lib/syndics/queries.ts`.                                                            |
| 3   | FR-008 : « y compris les cas de représentation via mandat (proxies) »                          | **Résolu (commits `9b210be` API, `1e39806` web).** Routes GET/POST/DELETE `.../assemblees/:meetingId/pouvoirs` ; carte « Pouvoirs » sur la fiche d'AG (création, liste, retrait) et signalement du lot représenté dans la saisie des votes. Voir partie 11.3.                                                                                                             | `grep -n "pouvoirs" packages/api/src/routes/syndic-routes.ts` → routes GET/POST/DELETE présentes.                                                                                                   |
| 4   | FR-013 : « Le système MUST gérer des fonds financiers par copropriété... avec un solde »       | **Résolu (commits `cd141c8` API, `3375f21` web).** Routes GET/POST `.../fonds`, PATCH `.../fonds/:fundId` et POST `.../fonds/:fundId/ajustement` (motif obligatoire) ; écran des fonds dans Finances copropriété (création, renommage, ajustement crédit/débit). Voir partie 7.5.                                                                                         | `grep -n "/fonds" packages/api/src/routes/syndic-routes.ts`.                                                                                                                                        |
| 5   | FR-007/US3 : parcours d'AG complet avec changement de statut (planifiée → en cours → clôturée) | **Résolu (commits `9b210be` API, `1e39806` web).** `PATCH .../assemblees/:id` accepte `status` ; transitions planifiée → en cours → clôturée et planifiée → annulée, toute autre transition répond 409. Boutons « Ouvrir la séance », « Clôturer la séance », « Annuler l'assemblée ». Voir parties 11.4, 11.9 et 11.10.                                                  | `packages/api/src/lib/syndics/schemas.ts` (`updateMeetingSchema` accepte désormais `status`) ; `components/syndics/MeetingStatusActions.tsx`.                                                       |
| 6   | FR-009 : « déterminer... selon la règle de majorité applicable »                               | **Résolu (commit `9b210be`, `lib/syndics/meeting-majority.ts`).** Le résultat se calcule désormais en tantièmes selon la règle choisie (article 24 : tantièmes exprimés ; 25 : majorité absolue de tous les lots ; 26 : double majorité copropriétaires/tantièmes ; unanimité). Voir parties 11.5 à 11.7.                                                                 | `computeResolutionTally` dans `meeting-majority.ts` : `sharesFor > sharesAgainst` (art. 24), `sharesFor * 2 > totalShares` (art. 25), etc. — `majorityRule` conditionne désormais bien le résultat. |
| 7   | Portail copropriétaire implicite (checkbox « Activer accès portail » sur `LotOwnerProfile`)    | **Ouvert — en cours de réalisation.** Champ toujours décoratif : le jeton `portalAccessToken` est généré mais n'est consommé par aucune route ni page à ce jour. Le « Portail Propriétaire » réellement présent dans l'app (`apps/web/src/pages/OwnerPortal/*`) sert la gestion locative, sans lien avec les copropriétés.                                                | `grep` de `portalAccessToken`/`LotOwnerProfile` dans les fichiers du portail propriétaire (services, middleware, validators) → aucun résultat à ce jour.                                            |
| 8   | Aucune exigence explicite, mais libellé UI trompeur                                            | **Résolu (commit `409c3fb`).** La fonction est renommée `deleteEmptySyndicateByTenant` et refuse désormais (409) la suppression d'une copropriété qui a le moindre lot, appel de charges, AG, document, contrat ou incident lié ; le bouton « Supprimer » de la carte est désactivé (avec infobulle) dès que ces compteurs sont connus. Voir partie 1.3.                  | `packages/api/src/lib/syndics/queries.ts`, fonction `deleteEmptySyndicateByTenant` ; `apps/web/src/components/syndics/SyndicateCard.tsx` (`isSyndicateEmpty`, `deleteDisabled`).                    |
