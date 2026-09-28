# Scénario de recette — Un syndic en essai, de la création du compte à la clôture de l'exercice

Parcours complet ImmoTopia, joué **par clics dans l'interface web** : le
super-admin crée le cabinet de syndic **Horizon Syndic Gestion** avec le pack
**Syndic** en période d'essai ; l'administratrice configure tout (équipe,
agence mandante, copropriété, lots, copropriétaires, fonds, prestataires,
comptabilité, documents) ; on déroule ensuite **l'exercice 2026 entier** de
la **Résidence Les Flamboyants** (8 lots, 1 000 tantièmes) — budget, appels
trimestriels, encaissements de tous types, avances, reçus et quittances,
assemblée extraordinaire, appels de travaux, factures et paiements des
prestataires, incident, recouvrement, appels automatiques, portail
copropriétaire — jusqu'à l'**arrêté des comptes au 31/12/2026**, l'assemblée
d'approbation des comptes et l'ouverture de l'exercice 2027.

Tous les montants sont choisis pour tomber rond : chaque résultat attendu est
calculable à la main et recoupé en fin de document (annexe A).

Rédigé le 28/09/2026 d'après le code de `main` (`b474b89`, lots Syndic S1 à
S6 et fonds #35 fusionnés). Scénarios voisins, plus ciblés :
[SCENARIO_SYNDIC_ABONNEMENT.md](SCENARIO_SYNDIC_ABONNEMENT.md) (quotas et
dépassements) et [SCENARIO_SYNDIC_MODULES.md](SCENARIO_SYNDIC_MODULES.md)
(écran par écran).

---

## Règles absolues — à relire avant chaque partie

1. **Ne JAMAIS cliquer « Payer en ligne ».** Le compte PaySecureHub de
   l'environnement local est en mode **LIVE** : un clic déclenche un paiement
   réel. Le bouton n'existe pas dans le module Syndic, mais il est visible
   ailleurs (page Abonnement, portail locataire) : ne jamais s'en approcher.
2. **Aucun SMS, aucun WhatsApp.** Un fournisseur SMS réel est configuré. Les
   contacts de ce scénario n'ont **aucun numéro de téléphone** ; dans toute
   liste « Canal », choisir **Email**, jamais SMS ni WhatsApp.
3. **Adresses e-mail en `@exemple.test` uniquement.** La création d'une
   assemblée, l'émission d'une quittance ou d'un avis d'appel envoient des
   e-mails automatiques : ils ne partent que vers ces adresses de test.
4. **Rien supprimer**, sauf les deux cas prévus en toutes lettres (facture
   saisie en double en I.5, paiement mal imputé en I.6 — et ce sont des
   annulations, pas des suppressions).
5. **Aucune commande, aucun appel direct à l'API, aucun script.** Si un écran
   ne montre pas ce que le document annonce, ou qu'une action semble
   impossible, **s'arrêter et le consigner** au journal (annexe D) plutôt que
   de contourner.
6. Ne jamais lancer `npm run db:seed` (efface la base de démonstration).

---

## 0. Environnement et conventions

### 0.1 Adresses

| Élément             | Valeur                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| Instance de recette | démo figée (`npm run demo:sync`, lancée par Baba avant le jeu)               |
| Web                 | **http://localhost:3300**                                                    |
| API                 | http://localhost:8800 (jamais appelée directement)                           |
| Super-admin         | `admin@immobillier.com` — mot de passe de `apps/web/src/dev/dev-accounts.ts` |
| `TENANT`            | identifiant de l'agence créée en A.3 (lu dans l'adresse de sa fiche)         |
| `BASE`              | `http://localhost:3300/tenant/<TENANT>`                                      |
| `COPRO`             | identifiant de la Résidence Les Flamboyants (lu dans l'adresse en C.4)       |
| `S`                 | `BASE/syndics/<COPRO>` (raccourci utilisé dans tout le document)             |

### 0.2 Temps simulé

Le jeu se déroule en un ou deux jours réels (à partir du 28/09/2026), mais
**chaque opération porte la date de l'exercice simulé** indiquée dans les
tableaux (janvier 2026 à mars 2027). Aucun formulaire du module Syndic ne
limite les dates : une date passée ou future est acceptée. Conséquences à
connaître :

- les écrans « en retard » comparent l'échéance à la **date réelle du
  jour** : la photographie du recouvrement (partie J) se prend **après le
  3ᵉ trimestre et avant la partie L** ;
- les numéros de reçus et de quittances suivent l'**ordre de saisie**, pas la
  date de paiement : respecter l'ordre des tableaux ;
- si la tâche quotidienne des appels automatiques passe pendant le jeu (après
  le 01/10/2026), elle peut avoir émis le 4ᵉ trimestre avant L.3 : le
  consigner, ce n'est pas une anomalie.

### 0.3 Ce qui n'est pas une anomalie

- Mode d'abonnement local **`warn`** : aucun quota ne bloque, tous les menus
  restent visibles, même les modules non souscrits.
- Essai gratuit d'un mois **coché et grisé**, non désactivable ; **aucune
  facture** pendant l'essai.
- Les parkings ne consomment pas de lot dans la jauge d'abonnement (seuls
  appartements, bureaux et commerces comptent).
- Le lien d'invitation s'affiche à l'écran : on l'utilise même si l'e-mail
  n'a pas pu partir.
- Les fonctions de **clôture formelle d'exercice** n'existent pas (voir N.8) :
  on les **constate absentes**, on ne les compte pas en échec du testeur.

---

## 1. Jeu de données

### 1.1 L'agence (compte d'essai)

| Champ                         | Valeur                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom de l'agence               | `Horizon Syndic Gestion`                                                                                                                                                                            |
| Nom de l'administrateur       | `Aïcha Koné`                                                                                                                                                                                        |
| E-mail de l'administrateur    | `aicha.kone@horizon-syndic.exemple.test`                                                                                                                                                            |
| Mot de passe (donnée de test) | `Horizon#2026` (8+ caractères, majuscule, chiffre, `#`)                                                                                                                                             |
| Packs                         | **Syndic** seul                                                                                                                                                                                     |
| Extensions                    | aucune                                                                                                                                                                                              |
| Cycle de facturation          | **Mensuel**                                                                                                                                                                                         |
| Mise en route accompagnée     | non                                                                                                                                                                                                 |
| Plus d'options                | Raison sociale `Horizon Syndic Gestion SARL`, e-mail de contact `contact@horizon-syndic.exemple.test`, pays `Côte d'Ivoire`, ville `Abidjan`, adresse `Plateau, avenue Chardy, immeuble Alpha 2000` |

Pack Syndic (catalogue `packages/api/src/lib/subscription/catalog.ts`) :
**49 900 FCFA HT/mois**, mise en route facultative 150 000 FCFA, capacité
**2 copropriétés et 100 lots**, essai **30 jours**, politique de dépassement
par défaut « Facturer le dépassement », 7 jours de grâce.

### 1.2 L'équipe

| Personne      | E-mail                                      | Rôle                               |
| ------------- | ------------------------------------------- | ---------------------------------- |
| Aïcha Koné    | `aicha.kone@horizon-syndic.exemple.test`    | Administrateur tenant (créée en A) |
| Yao Brou      | `yao.brou@horizon-syndic.exemple.test`      | Gestionnaire tenant                |
| Mariam Diallo | `mariam.diallo@horizon-syndic.exemple.test` | Comptable tenant                   |

Yao Brou est aussi créé comme **contact CRM** : c'est le gestionnaire de la
copropriété.

### 1.3 L'agence mandante

| Champ                     | Valeur                                             |
| ------------------------- | -------------------------------------------------- |
| Nom                       | `Cabinet Kouassi & Associés`                       |
| Dénomination légale       | `Kouassi & Associés SARL`                          |
| Adresse                   | `Cocody Danga, rue des Jardins, villa 12, Abidjan` |
| Téléphone                 | laisser vide                                       |
| E-mail                    | `contact@kouassi-associes.exemple.test`            |
| RCCM                      | `CI-ABJ-2019-B-14532`                              |
| NIF                       | `1914532K`                                         |
| Logo / Signature / Cachet | trois petites images PNG ou JPG quelconques        |

### 1.4 La copropriété

| Champ                | Valeur                                                        |
| -------------------- | ------------------------------------------------------------- |
| Nom                  | `Résidence Les Flamboyants`                                   |
| Adresse              | `Riviera Golf, rue des Flamboyants, lot 245, Cocody, Abidjan` |
| Référence cadastrale | `CAD-CGY-2019-0245`                                           |
| N° d'immatriculation | `IMM-COP-2026-0017`                                           |
| Agence mandante      | `Cabinet Kouassi & Associés`                                  |
| Exercice             | `1` (exercice calendaire, janvier–décembre)                   |
| Statut               | Active                                                        |
| Gestionnaire         | `Yao Brou`                                                    |

### 1.5 Lots, tantièmes et copropriétaires

| Lot       | Type        | Tantièmes généraux | Tantièmes spéciaux (ascenseur) | Copropriétaire (Propriétaire CRM)              | Propriétaire depuis le |
| --------- | ----------- | -----------------: | -----------------------------: | ---------------------------------------------- | ---------------------- |
| `A101`    | Appartement |                150 |                            250 | Jean-Marc Kouadio                              | 15/03/2019             |
| `A102`    | Appartement |                150 |                            250 | Awa Traoré                                     | 15/03/2019             |
| `A201`    | Appartement |                150 |                            250 | Sékou Bamba (indivision 50 % avec Fatim Bamba) | 02/07/2021             |
| `A202`    | Appartement |                150 |                            250 | Élise N'Guessan                                | 10/01/2022             |
| `B01`     | Commerce    |                200 |                         (vide) | Pharmacie du Golf SARL                         | 15/03/2019             |
| `B02`     | Bureau      |                100 |                         (vide) | Moussa Diabaté                                 | 01/09/2023             |
| `P01`     | Parking     |                 50 |                         (vide) | Jean-Marc Kouadio                              | 15/03/2019             |
| `P02`     | Parking     |                 50 |                         (vide) | Awa Traoré                                     | 15/03/2019             |
| **Total** |             |          **1 000** |                      **1 000** | **6 copropriétaires distincts**                |                        |

Locataire : `A202` est loué à **Arnaud Koffi** depuis le 01/02/2026 (charges
non refacturées au locataire).

### 1.6 Contacts CRM à créer (type Personne sauf mention, **sans téléphone**)

| Prénom    | Nom                    | E-mail                                 | Rôle dans le scénario                                                                  |
| --------- | ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Yao       | Brou                   | `yao.brou@horizon-syndic.exemple.test` | gestionnaire de la copropriété                                                         |
| Jean-Marc | Kouadio                | `jm.kouadio@exemple.test`              | A101 + P01, invité au portail                                                          |
| Awa       | Traoré                 | `awa.traore@exemple.test`              | A102 + P02                                                                             |
| Sékou     | Bamba                  | `sekou.bamba@exemple.test`             | A201 (indivisaire 50 %)                                                                |
| Fatim     | Bamba                  | `fatim.bamba@exemple.test`             | A201 (indivisaire 50 %)                                                                |
| Élise     | N'Guessan              | `elise.nguessan@exemple.test`          | A202 (bailleresse)                                                                     |
| —         | Pharmacie du Golf SARL | `gerance@pharmaciedugolf.exemple.test` | B01 — type **Entreprise** si proposé, sinon Personne avec Nom `Pharmacie du Golf SARL` |
| Moussa    | Diabaté                | `moussa.diabate@exemple.test`          | B02 — le mauvais payeur                                                                |
| Arnaud    | Koffi                  | `arnaud.koffi@exemple.test`            | locataire de A202                                                                      |

### 1.7 Fonds de la copropriété

| Fonds                | Solde initial (reprise au 01/01/2026) | Alimenté par                          |
| -------------------- | ------------------------------------: | ------------------------------------- |
| `Fonds de roulement` |                             1 500 000 | poste du budget des charges courantes |
| `Fonds de travaux`   |                             2 500 000 | postes des budgets de travaux         |

### 1.8 Prestataires et contrats

| Prestataire                 | Spécialité                   | E-mail                                 | Contrat (nature, montant annuel HT, période)                                    |
| --------------------------- | ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `Ivoire Clean Services`     | Nettoyage parties communes   | `contact@ivoireclean.exemple.test`     | `Nettoyage des parties communes 2026`, 1 800 000, 01/01–31/12/2026, alerte 60 j |
| `Sécurité Plus CI`          | Gardiennage                  | `contact@securiteplus.exemple.test`    | `Gardiennage 24h/24 2026`, 3 600 000, 01/01–31/12/2026, alerte 60 j             |
| `Ascenseurs Élévation CI`   | Ascenseur                    | `sav@elevation-ci.exemple.test`        | `Maintenance ascenseur 2026`, 1 200 000, 01/01–31/12/2026, alerte 90 j          |
| `Énergie Distribution Test` | Électricité parties communes | `facturation@energie.exemple.test`     | aucun contrat                                                                   |
| `Eau Distribution Test`     | Eau parties communes         | `facturation@eau.exemple.test`         | aucun contrat                                                                   |
| `Assurances Lagune Test`    | Assurance immeuble           | `sinistres@lagune-assur.exemple.test`  | aucun contrat                                                                   |
| `Plomberie Express Abidjan` | Plomberie                    | `devis@plomberie-express.exemple.test` | aucun — créé à la volée en G.3                                                  |
| `Façades & Peinture CI`     | Ravalement                   | `chantiers@facades-ci.exemple.test`    | aucun contrat                                                                   |

### 1.9 Les chiffres clés de l'exercice 2026 (à retrouver en fin de parcours)

| Élément                                        | Montant (FCFA) |
| ---------------------------------------------- | -------------: |
| Budget charges courantes 2026 (4 trimestres)   |     12 000 000 |
| Appel travaux « Ravalement des façades »       |      4 000 000 |
| Appel travaux « Câbles de l'ascenseur »        |      1 000 000 |
| **Total appelé 2026**                          | **17 000 000** |
| Total encaissé auprès des copropriétaires      |     16 700 000 |
| Reste dû au 31/12/2026 (B02, 4ᵉ trimestre)     |        300 000 |
| Dépenses charges courantes (TTC)               |     10 836 300 |
| Dépenses travaux (TTC)                         |      4 484 000 |
| Fonds de roulement au 31/12/2026               |      2 363 700 |
| Fonds de travaux au 31/12/2026                 |      3 016 000 |
| Excédent des charges courantes (budget − réel) |      1 163 700 |

Quote-part d'un tantième : **12 000 FCFA par an** de charges courantes, soit
**3 000 FCFA par trimestre**.

| Tantièmes | Appel trimestriel | Quote-part annuelle | Ravalement (4 000/tantième) |
| --------: | ----------------: | ------------------: | --------------------------: |
|       150 |           450 000 |           1 800 000 |                     600 000 |
|       200 |           600 000 |           2 400 000 |                     800 000 |
|       100 |           300 000 |           1 200 000 |                     400 000 |
|        50 |           150 000 |             600 000 |                     200 000 |

---

## Partie A — Création du compte en pack Syndic d'essai (super-admin)

### A.1 Page `/admin/tenants` (Administration › Agences) — tiroir « Nouvelle agence »

1. Se connecter en super-admin sur `http://localhost:3300/login`.
2. **Administration › Agences**, bouton **« Nouvelle agence »**.
3. Remplir « Nom de l'agence », « Nom de l'administrateur », « E-mail de
   l'administrateur » (tableau 1.1).
4. Section « Packs » : cliquer la carte **Syndic** seule.
5. « Extensions » à 0, « Cycle de facturation » **Mensuel**, « Mise en route
   accompagnée » décochée.

Résultat attendu :

- [ ] Carte Syndic : `49 900` FCFA « / mois », cochée.
- [ ] Extensions proposées : lots supplémentaires (blocs de 10) et
      copropriétés supplémentaires ; **pas** de chantiers supplémentaires.
- [ ] « Essai gratuit d'un mois inclus (automatique, non désactivable) » :
      coché et grisé.
- [ ] Récapitulatif : `Syndic 49 900`, « Total HT mensuel » **49 900**,
      « Total HT annuel (11 mois) » **548 900**.

### A.2 Devis en direct (sans valider)

1. Cocher « Mise en route accompagnée » : une ligne « Mise en route (frais
   uniques) » **150 000** apparaît hors total mensuel. La **décocher**.
2. Mettre « Copropriétés supplémentaires » à `1` : total mensuel **59 900**
   (49 900 + 10 000). **Remettre à 0.**

### A.3 Plus d'options, puis création

1. « Plus d'options » : raison sociale, e-mail de contact, pays, ville,
   adresse (tableau 1.1).
2. **« Créer l'agence »**.

Résultat attendu :

- [ ] Écran « Agence créée » : `Horizon Syndic Gestion` prête à l'usage,
      « Packs Syndic, cycle mensuel », fin d'essai à **J + 30** (le
      28/10/2026 si le jeu démarre le 28/09/2026).
- [ ] « Lien d'invitation » `http://localhost:3300/auth/accept-invite?token=…`
      avec **« Copier »** : copier ce lien (`INVITE`).
- [ ] « E-mail d'invitation envoyé. » ou l'avertissement « L'e-mail n'a pas
      pu être envoyé — copiez le lien… » (les deux sont acceptables).
- [ ] **« Ouvrir la fiche »** → `/admin/tenants/<TENANT>` : noter `TENANT`.
- [ ] Onglet « Abonnement » : statut **Essai**, packs **Syndic**, politique
      **Facturer le dépassement**, jours de grâce **7**, consommation
      **Lots 0 / 100**, **Copropriétés 0 / 2**.

---

## Partie B — Invitation et première connexion

### B.1 Accepter l'invitation (fenêtre de navigation privée)

1. Ouvrir `INVITE` dans une fenêtre privée.
2. Nom complet `Aïcha Koné`, mot de passe `faible` → valider.
3. Mot de passe et confirmation `Horizon#2026` → valider.

Résultat attendu :

- [ ] `faible` refusé (longueur ou complexité).
- [ ] Message d'invitation acceptée, redirection vers `/login?invite=accepted`.
- [ ] Rouvrir `INVITE` : refus, invitation déjà utilisée.

### B.2 Connexion et page Abonnement

1. Se connecter avec `aicha.kone@horizon-syndic.exemple.test` / `Horizon#2026`.
2. Ouvrir **Paramètres › Abonnement** (`BASE/settings/abonnement`).

Résultat attendu :

- [ ] Tableau de bord de l'agence `Horizon Syndic Gestion`.
- [ ] Carte « Formule » : statut **Essai**, cycle **Mensuel**, pack
      **Syndic**, **30 jours d'essai restants** (29 selon l'heure).
- [ ] Carte « Consommation » : Lots **0 / 100**, Copropriétés **0 / 2**.
- [ ] Section Factures **vide**. Ne **pas** cliquer « Payer en ligne » s'il
      apparaît.
- [ ] Texte « Les modifications de la formule passent par l'équipe
      ImmoTopia ».

---

## Partie C — Configuration complète

### C.1 Inviter l'équipe — `BASE/invite`

1. E-mail `yao.brou@horizon-syndic.exemple.test`, rôle **Gestionnaire
   tenant** → **« Envoyer l'invitation »**.
2. E-mail `mariam.diallo@horizon-syndic.exemple.test`, rôle **Comptable
   tenant** → **« Envoyer l'invitation »**.

Résultat attendu :

- [ ] Deux confirmations d'envoi. Si un lien d'invitation s'affiche, ouvrir
      celui de Mariam Diallo en fenêtre privée, définir `Comptable#2026`,
      se connecter, constater l'accès au menu **Syndic**, se déconnecter.
      Si aucun lien n'est affiché, le consigner et continuer (les étapes
      suivantes se font avec Aïcha Koné).

### C.2 Contacts CRM — **CRM › Contacts** (`BASE/crm/contacts`)

**« Nouveau contact »** × 9, onglet « Basique », selon le tableau 1.6
(Prénom, Nom, E-mail personnel ; téléphone **vide**).

- [ ] 9 contacts créés, visibles dans la liste.

### C.3 Agence mandante — **Syndic › Agences mandantes** (`BASE/syndics/mandants`)

1. **« Nouvelle agence mandante »** : champs du tableau 1.3 → **« Enregistrer »**.
2. Message « Agence mandante créée. Vous pouvez maintenant ajouter son logo,
   sa signature et son cachet. »
3. Section « Images pour les documents » : charger **Logo**, **Signature**,
   **Cachet**.

Résultat attendu :

- [ ] Ligne `Cabinet Kouassi & Associés`, colonne Copropriétés **0**.
- [ ] Les trois images apparaissent en aperçu.
- [ ] Recréer une agence mandante au même nom → refus « Une agence mandante
      porte déjà ce nom. » (annuler ensuite).

### C.4 Copropriété — **Syndic › Copropriétés** (`BASE/syndics`)

1. **« Nouvelle copropriété »**, modale « Créer une copropriété » : Nom,
   Adresse, Référence cadastrale, N° d'immatriculation, Agence mandante
   (tableau 1.4) → **« Créer »**.
2. La page des lots s'ouvre avec la modale « Importer des lots depuis des
   propriétés » (comportement normal) : la **fermer** sans importer. Noter
   `COPRO` dans l'adresse.
3. Onglet de la fiche (`S`) → **« Modifier »** : Exercice `1`, Statut
   `Active`, Gestionnaire `Yao Brou` → **« Enregistrer »**. Si la modale
   propose un logo de copropriété, charger une petite image.

Résultat attendu :

- [ ] « Copropriété créée », puis « Copropriété mise à jour ».
- [ ] Carte « Informations générales » : nom, adresse, immatriculation
      `IMM-COP-2026-0017`, gestionnaire `Yao Brou`, mandant `Cabinet Kouassi
  & Associés`.
- [ ] Retour sur Agences mandantes : colonne Copropriétés **1**.

### C.5 Lots — `S/lots`

**« Nouveau lot »** × 8 selon le tableau 1.5 : Numéro de lot, Type de lot,
Tantièmes généraux, Tantièmes spéciaux (vide pour B01, B02, P01, P02), Bien
lié **vide**, Propriétaire CRM et « Propriétaire depuis le » renseignés tout
de suite → **« Créer le lot »**.

Résultat attendu :

- [ ] 8 × « Lot créé ».
- [ ] Cartes : **Nombre de lots 8**, **Tantièmes généraux cumulés 1 000**,
      **Lots avec propriétaire 8**, Lots avec locataire actif 0.
- [ ] Tableau des lots : 8 lignes, colonne Propriétaire renseignée.

### C.6 Profils propriétaires, indivision, locataire — `S/profils-incidents`

1. **« Profil propriétaire »** (un par ligne) :

| Lot  | Contact propriétaire   | Part (%) | Date de début | Accès portail |
| ---- | ---------------------- | -------: | ------------- | ------------- |
| A101 | Jean-Marc Kouadio      |      100 | 15/03/2019    | **Oui**       |
| P01  | Jean-Marc Kouadio      |      100 | 15/03/2019    | **Oui**       |
| A102 | Awa Traoré             |      100 | 15/03/2019    | Non           |
| A201 | Sékou Bamba            |       50 | 02/07/2021    | Non           |
| A201 | Fatim Bamba            |       50 | 02/07/2021    | Non           |
| A202 | Élise N'Guessan        |      100 | 10/01/2022    | Non           |
| B01  | Pharmacie du Golf SARL |      100 | 15/03/2019    | Non           |
| B02  | Moussa Diabaté         |      100 | 01/09/2023    | Non           |

2. **« Profil locataire »** : Lot `A202`, Contact `Arnaud Koffi`, Date
   d'entrée `01/02/2026`, Charges facturées au locataire **Non**.

Résultat attendu :

- [ ] 8 lignes « Profils propriétaires » ; `A201` porte **deux** lignes à
      50 % (indivision). Portail **ACTIVE** pour A101 et P01, INACTIF ailleurs.
- [ ] 1 ligne « Profils locataires » ; sur `S/lots`, « Lots avec locataire
      actif » = **1** (consigner si la carte ne suit pas les profils).
- [ ] Ne pas encore cliquer « Inviter au portail » (partie M).

### C.7 Fonds — `S/finances`, carte « Détail des fonds »

**« Nouveau fonds »** × 2 (tableau 1.7) : Nom du fonds, Solde initial, Devise
`XOF` → **« Créer »**.

Résultat attendu :

- [ ] 2 × « Fonds créé ». Carte **Total fonds = 4 000 000 FCFA**.
- [ ] « Historique des mouvements » de chaque fonds : un mouvement
      d'ouverture (1 500 000 / 2 500 000), solde après égal.

### C.8 Prestataires et contrats — `S/prestataires`

1. Onglet « Prestataires » : **« Nouveau prestataire »** × 7 (tous ceux du
   tableau 1.8 **sauf** Plomberie Express Abidjan) : Nom, Spécialité, E-mail,
   Téléphone vide → **« Créer »**.
2. Onglet « Contrats de maintenance » : **« Nouveau contrat »** × 3 (Ivoire
   Clean, Sécurité Plus, Ascenseurs Élévation) : Prestataire, Nature du
   contrat, Date de début `01/01/2026`, Date de fin `31/12/2026`, Montant
   annuel, Devise `XOF`, Alerte renouvellement → **« Créer »**.

Résultat attendu :

- [ ] « Prestataires (7) ». 3 contrats **actifs** : 1 800 000, 3 600 000,
      1 200 000.

### C.9 Comptabilité de départ — `S/comptabilite`

1. Onglet « Plan comptable », **« Nouveau compte »** × 7 :

| N° de compte | Intitulé                              | Classe | Type             |
| ------------ | ------------------------------------- | -----: | ---------------- |
| `1010`       | Fonds de roulement                    |      1 | CAPITAUX PROPRES |
| `1020`       | Fonds de travaux                      |      1 | CAPITAUX PROPRES |
| `4500`       | Copropriétaires — comptes individuels |      4 | ACTIF            |
| `521`        | Banque                                |      5 | ACTIF            |
| `7010`       | Appels de charges courantes           |      7 | PRODUIT          |
| `7020`       | Appels de fonds travaux               |      7 | PRODUIT          |
| `7580`       | Produits divers (pénalités)           |      7 | PRODUIT          |

Les comptes `401` (prestataires), `624` (entretien) et `6241` (travaux)
sont créés **automatiquement** par la première facture de prestataire
(I.1) ; `521` créé ici est réutilisé par ces écritures automatiques.

2. Onglet « Journaux comptables », **« Nouveau journal »** : Code `OD`,
   Libellé `Opérations diverses`, Exercice `2026`, Type **GENERAL**.
3. **« Nouvelle écriture »** (reprise des soldes d'ouverture) : Journal `OD`,
   Date `01/01/2026`, Référence `OUV-2026`, Source `MANUEL`, Description
   `Reprise des soldes au 01/01/2026` :

| Compte |     Débit |    Crédit | Libellé                   |
| ------ | --------: | --------: | ------------------------- |
| 521    | 4 000 000 |           | Trésorerie reprise        |
| 1010   |           | 1 500 000 | Fonds de roulement repris |
| 1020   |           | 2 500 000 | Fonds de travaux repris   |

Résultat attendu :

- [ ] 7 × « Compte comptable créé », « Journal comptable créé »,
      « Écriture comptable enregistrée ».
- [ ] « Balance équilibrée » **Oui** ; balance : 521 débit 4 000 000,
      1010 crédit 1 500 000, 1020 crédit 2 500 000.
- [ ] Une écriture déséquilibrée (521 débit 100, 1010 crédit 90) est
      **refusée** ; annuler la saisie.

### C.10 Documents — `S/documents`

**« Ajouter un document »** × 3 (petit fichier PDF quelconque) :

| Titre                                 | Type       | Expiration |
| ------------------------------------- | ---------- | ---------- |
| `Règlement de copropriété`            | Reglement  | —          |
| `Assurance multirisque immeuble 2026` | Assurance  | 31/12/2026 |
| `Diagnostic ascenseur 2025`           | Diagnostic | —          |

- [ ] 3 documents au coffre ; filtre **Assurance** → 1 seul document ;
      **« Télécharger »** rend le fichier déposé (aucun lien `/uploads/…`).

### C.11 Contrôle de l'abonnement après configuration

**Paramètres › Abonnement** :

- [ ] Copropriétés **1 / 2** ; Lots **6 / 100** (A101, A102, A201, A202,
      B01, B02 — les parkings ne comptent pas). Consigner la valeur exacte.
- [ ] Statut toujours **Essai**, aucune facture.

---

## Partie D — Budget prévisionnel 2026 (charges courantes)

Le budget 2026 a été voté par l'AG du 28/11/2025, avant l'arrivée du cabinet
dans ImmoTopia : on le saisit et on l'approuve directement.

### D.1 Créer le budget — `S/budgets`

**« Nouveau budget »** :

| Champ                       | Valeur                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| Exercice                    | `2026`                                                                            |
| Libellé                     | `Budget charges courantes 2026`                                                   |
| Montant total               | `12000000`                                                                        |
| Catégorie principale        | `Charges courantes`                                                               |
| Description ligne           | `Nettoyage, gardiennage, ascenseur, énergie, eau, assurance, petites réparations` |
| Clé de distribution         | **Tantièmes généraux**                                                            |
| Devise                      | `XOF`                                                                             |
| Fonds alimenté par ce poste | `Fonds de roulement`                                                              |

**« Créer budget »**.

- [ ] « Budget créé » ; ligne Exercice 2026, Montant **12 000 000**,
      **Allocations 8**, statut **DRAFT**.

### D.2 Approuver, répartir, vérifier

1. **« Approuver »** → « Budget approuvé », statut **APPROVED**.
2. **« Répartir »** deux fois → « Allocations recalculées (8 lot(s)) » ; les
   allocations restent **8** (jamais 16).
3. **« Voir allocations »** :

| Lot       |   Total alloué |
| --------- | -------------: |
| A101      |      1 800 000 |
| A102      |      1 800 000 |
| A201      |      1 800 000 |
| A202      |      1 800 000 |
| B01       |      2 400 000 |
| B02       |      1 200 000 |
| P01       |        600 000 |
| P02       |        600 000 |
| **Total** | **12 000 000** |

4. **« Postes et fonds »** : le poste « Charges courantes » affiche Prévu
   12 000 000 et Fonds alimenté `Fonds de roulement`.

---

## Partie E — 1ᵉʳ trimestre 2026

### E.1 Générer les appels du T1 — `S/budgets`, **« Générer appels »**

| Champ                  | Valeur                        |
| ---------------------- | ----------------------------- |
| Libellé de la campagne | `Charges courantes 2026 — T1` |
| Période                | `2026-T1`                     |
| Répartir sur           | **4 périodes (trimestriel)**  |
| Période n°             | `1`                           |
| Date échéance          | `15/01/2026`                  |
| Type de campagne       | **Régulier**                  |

**« Générer »**.

Résultat attendu :

- [ ] « Campagne créée » ; campagne `Charges courantes 2026 — T1`, montant
      **3 000 000**, 8 appels, statut **Envoyé**.
- [ ] `S/charges` : 8 appels **En attente** : A101/A102/A201/A202
      **450 000**, B01 **600 000**, B02 **300 000**, P01/P02 **150 000**.
      (Un montant de 1 800 000 sur A101 signifierait que le quart n'est pas
      appliqué : anomalie.)
- [ ] Sur une ligne, l'avis d'appel PDF se télécharge : en-tête et logo du
      **Cabinet Kouassi & Associés**, lot, période, montant, échéance.

### E.2 Encaissements du T1 — `S/charges`, **« Enregistrer un paiement »**

Pour chaque ligne, dans cet ordre : choisir le **Lot**, saisir Montant, Date
de paiement, Mode, Référence, laisser l'affectation automatique (aucune case
cochée), lire l'**aperçu** puis **« Enregistrer »**. Après chaque paiement,
noter la section « Documents émis ».

| #   | Lot  | Montant | Date       | Mode         | Référence      | Effet attendu                                                                                            | Documents émis attendus |
| --- | ---- | ------: | ---------- | ------------ | -------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | A101 | 450 000 | 08/01/2026 | Virement     | `VIR-KOU-2601` | T1 A101 **Payé**                                                                                         | Quittance               |
| 2   | P01  | 150 000 | 08/01/2026 | Espèces      | `ESP-0001`     | T1 P01 **Payé**                                                                                          | Quittance               |
| 3   | A102 | 900 000 | 10/01/2026 | Virement     | `VIR-TRA-2601` | T1 A102 **Payé** + **avance 450 000** (« Paiement enregistré : 1 appel(s) soldé(s), avance de 450 000 ») | Quittance **et** Reçu   |
| 4   | P02  | 150 000 | 20/01/2026 | Mobile money | `MM-TRA-2601`  | T1 P02 **Payé** (en retard mais soldé)                                                                   | Quittance               |
| 5   | A201 | 200 000 | 14/01/2026 | Chèque       | `CHQ-BAM-0101` | T1 A201 **Partiel**, reste 250 000                                                                       | Reçu                    |
| 6   | A201 | 250 000 | 05/02/2026 | Chèque       | `CHQ-BAM-0102` | T1 A201 **Payé**                                                                                         | Quittance (pas de reçu) |
| 7   | A202 | 450 000 | 15/01/2026 | Mobile money | `MM-NGU-2601`  | T1 A202 **Payé**                                                                                         | Quittance               |
| 8   | B01  | 600 000 | 13/01/2026 | Virement     | `VIR-PHA-2601` | T1 B01 **Payé**                                                                                          | Quittance               |
| —   | B02  |       — | —          | —            | —              | **Aucun paiement** : T1 B02 reste **En attente**                                                         | —                       |

Numérotation attendue (émetteur : le mandant, année 2026) : quittances
`Q-2026-000001` à `Q-2026-000007`, reçus `R-2026-000001` (paiement 3) et
`R-2026-000002` (paiement 5).

Contrôles après E.2 :

- [ ] `S/lots` → **« Compte »** de A102 : débit 450 000 (appel), crédit
      900 000 (paiement), solde **450 000 Créditeur** ; l'avance de
      **450 000** est affichée.
- [ ] Compte de A201 : deux crédits (200 000 et 250 000), solde **Soldé**.
- [ ] `S/finances` : Total appelé **3 000 000** ; Total payé **2 700 000**
      (affecté aux appels) ; Reste à payer **300 000** ; Total des avances
      **450 000**. Consigner si « Total payé » inclut l'avance (3 150 000).
- [ ] Fonds de roulement : solde **4 200 000** (1 500 000 + 2 700 000) ;
      l'avance de 450 000 **n'a crédité aucun fonds** (elle n'est pas encore
      imputée). Historique : 8 mouvements « Paiement de charges ».
- [ ] `S/quittances` : **7 quittances et 2 reçus** ; ouvrir le PDF de
      `Q-2026-000001` : « QUITTANCE DE CHARGES », période 1ᵉʳ trimestre 2026,
      lot A101, **« Montant acquitté : 450 000 »** avec le montant en
      lettres, logo, signature et cachet du mandant.
- [ ] Reçu `R-2026-000002` : « REÇU DE PAIEMENT », « Montant reçu :
      200 000 », reste dû 250 000.
- [ ] `S/suivi-mensuel`, exercice 2026 : janvier–mars **Réglé** partout sauf
      B02 (**Dû**, puis **En retard** une fois l'échéance passée), A102 avec
      une avance.

---

## Partie F — Assemblée générale extraordinaire du 20/02/2026 et appels de travaux

### F.1 Créer l'AGE — `S/assemblees`

**« Nouvelle assemblée »** : Type **Extraordinaire**, Date et heure
`20/02/2026 18:00`, Heure de début `18:00`, Heure de fin `20:30`, Lieu
`Salle polyvalente de la résidence` → **« Créer »**.

- [ ] « Assemblée créée », statut **Planifiée** (la convocation part par
      e-mail vers les adresses `@exemple.test`, sans message dédié).

### F.2 Ordre du jour — fiche de l'AG, « Ordre du jour »

| Ordre | Titre                                                  | Discussions                                                       |
| ----: | ------------------------------------------------------ | ----------------------------------------------------------------- |
|     1 | `Ravalement des façades — devis Façades & Peinture CI` | `Devis de 3 540 000 TTC, appel de 4 000 000`                      |
|     2 | `Remplacement des câbles de l'ascenseur`               | `Devis de 944 000 TTC, appel de 1 000 000 en tantièmes ascenseur` |

- [ ] 2 × « Point d'ordre du jour enregistré ».

### F.3 Pouvoir

Carte **« Pouvoirs »**, **« Ajouter un pouvoir »** : Mandant `Awa Traoré`
(lots A102 et P02), Mandataire `Jean-Marc Kouadio` → **« Enregistrer »**.

- [ ] « Pouvoir enregistré » ; ligne Mandant Awa Traoré, lots A102 et P02,
      Mandataire Jean-Marc Kouadio.

### F.4 Séance et votes

1. **« Ouvrir la séance »** → statut **En cours**.
2. **« Ajouter une résolution »** × 2 puis votes par lot :

**Résolution 1 — `Ravalement des façades pour 4 000 000 FCFA`**, règle
**Article 25 — majorité absolue** :

| Lot  | A101 | A102 (représenté) | A201 | A202   | B01  | B02      | P01  | P02 (représenté) |
| ---- | ---- | ----------------- | ---- | ------ | ---- | -------- | ---- | ---------------- |
| Vote | Pour | Pour              | Pour | Contre | Pour | (absent) | Pour | Pour             |

- [ ] Pour **6 lot(s) · 750 tantièmes**, Contre **1 lot(s) · 150
      tantièmes**, total de référence **1 000** ; 750 × 2 = 1 500 > 1 000 →
      **Approuvée**.

**Résolution 2 — `Remplacement des câbles de l'ascenseur pour 1 000 000
FCFA`**, règle **Article 24 — majorité simple** :

| Lot  | A101 | A102 (représenté) | A201 | A202   | B01        | B02      | P01  | P02 (représenté) |
| ---- | ---- | ----------------- | ---- | ------ | ---------- | -------- | ---- | ---------------- |
| Vote | Pour | Pour              | Pour | Contre | Abstention | (absent) | Pour | Pour             |

- [ ] Pour **550**, Contre **150**, Abstention **200** tantièmes ; 550 > 150
      → **Approuvée**.
- [ ] Quorum : **90 %**, « 900 / 1000 tantièmes représentés » (7 lots
      votants, B02 absent).
- [ ] Les votes de A102 et P02 portent la mention **(représenté)**.

3. **« Générer compte rendu Word »** → fichier `compte-rendu-<id>.docx`
   téléchargé : logo du mandant, les deux résolutions et leurs résultats.
4. **« Clôturer la séance »** → « Séance clôturée : les votes sont figés »,
   statut **Clôturée** ; plus aucun bouton de vote, de résolution ni de
   pouvoir.
5. `S/documents` : ajouter le PV téléchargé, Titre `PV AGE du 20/02/2026`,
   Type **PV d'AG**.

### F.5 Budgets de travaux — `S/budgets`

| Libellé                               | Exercice | Montant total | Catégorie | Clé de distribution    | Fonds alimenté     |
| ------------------------------------- | -------- | ------------: | --------- | ---------------------- | ------------------ |
| `Travaux ravalement des façades 2026` | 2026     |     4 000 000 | `Travaux` | **Tantièmes généraux** | `Fonds de travaux` |
| `Travaux câbles ascenseur 2026`       | 2026     |     1 000 000 | `Travaux` | **Tantièmes spéciaux** | `Fonds de travaux` |

Créer, **« Approuver »**, **« Répartir »** chacun.

- [ ] Ravalement : A101–A202 **600 000**, B01 **800 000**, B02 **400 000**,
      P01/P02 **200 000** (total 4 000 000).
- [ ] Ascenseur : A101–A202 **250 000** chacun ; B01, B02, P01, P02 **0**
      (consigner s'ils n'apparaissent pas du tout).

### F.6 Appels de travaux — **« Générer appels »** sur chaque budget, **dans cet ordre**

| Budget     | Libellé de la campagne             | Période   | Répartir sur           | Période n° | Date échéance | Type             |
| ---------- | ---------------------------------- | --------- | ---------------------- | ---------: | ------------- | ---------------- |
| Ravalement | `Appel travaux — ravalement`       | `2026-03` | **1 période (annuel)** |          1 | `31/03/2026`  | **Exceptionnel** |
| Ascenseur  | `Appel travaux — câbles ascenseur` | `2026-03` | **1 période (annuel)** |          1 | `31/03/2026`  | **Exceptionnel** |

Résultat attendu — **imputation automatique de l'avance** :

- [ ] Ravalement : 8 appels ; celui de **A102 (600 000)** reçoit
      immédiatement l'avance de **450 000** : statut **Partiel**, reste
      **150 000**. Compte A102 : avance **0**.
- [ ] Fonds de travaux crédité de **450 000** au moment de l'imputation
      (mouvement « Paiement de charges », origine avance) : solde
      **2 950 000**.
- [ ] Ascenseur : 4 appels de 250 000 (A101, A102, A201, A202), **En
      attente** ; aucun appel pour les autres lots, ou appels à 0 à
      consigner. Aucune avance à imputer (A102 n'en a plus).

### F.7 Encaissements des travaux — `S/charges`

| #   | Lot  | Montant | Date       | Mode         | Référence     | Effet attendu                                          | Documents    |
| --- | ---- | ------: | ---------- | ------------ | ------------- | ------------------------------------------------------ | ------------ |
| 9   | A101 | 850 000 | 20/03/2026 | Virement     | `VIR-KOU-TRV` | ravalement 600 000 + ascenseur 250 000 **Payés**       | 2 quittances |
| 10  | P01  | 200 000 | 20/03/2026 | Espèces      | `ESP-0002`    | ravalement **Payé**                                    | 1 quittance  |
| 11  | A102 | 400 000 | 25/03/2026 | Virement     | `VIR-TRA-TRV` | reste ravalement 150 000 + ascenseur 250 000 **Payés** | 2 quittances |
| 12  | P02  | 200 000 | 25/03/2026 | Mobile money | `MM-TRA-TRV`  | ravalement **Payé**                                    | 1 quittance  |
| 13  | A201 | 850 000 | 28/03/2026 | Chèque       | `CHQ-BAM-TRV` | ravalement + ascenseur **Payés**                       | 2 quittances |
| 14  | A202 | 850 000 | 30/03/2026 | Mobile money | `MM-NGU-TRV`  | ravalement + ascenseur **Payés**                       | 2 quittances |
| 15  | B01  | 800 000 | 28/03/2026 | Virement     | `VIR-PHA-TRV` | ravalement **Payé**                                    | 1 quittance  |
| —   | B02  |       — | —          | —            | —             | ravalement 400 000 **En attente**                      | —            |

**Paiement 9 — test des cases à cocher (sans valider d'abord)** : avant de
saisir, cocher **uniquement** l'appel ascenseur de A101 avec un montant de
850 000 et lire l'aperçu : 250 000 affectés à l'ascenseur, **600 000 en
avance** (le ravalement non coché n'est pas touché). **Décocher**, lire le
nouvel aperçu (affectation du plus ancien au plus récent : les deux appels
soldés, pas d'avance), puis **« Enregistrer »**.

Contrôles :

- [ ] Fonds de travaux : 2 950 000 + 3 150 000 (ravalement encaissé hors
      avance) + 1 000 000 (ascenseur) = **7 100 000**.
- [ ] `S/quittances` : 7 + 11 = **18 quittances**, **2 reçus**.

---

## Partie G — 2ᵉ trimestre 2026 et incident

### G.1 Appels du T2 — **« Générer appels »** sur le budget charges courantes

Libellé `Charges courantes 2026 — T2`, Période `2026-T2`, **4 périodes**,
Période n° `2`, Date échéance `15/04/2026`, **Régulier**.

- [ ] 8 appels, mêmes montants qu'au T1 (total 3 000 000), tous **En
      attente** (plus aucune avance disponible).

### G.2 Encaissements du T2

| #   | Lot  | Montant | Date       | Mode         | Référence      | Effet attendu              | Documents |
| --- | ---- | ------: | ---------- | ------------ | -------------- | -------------------------- | --------- |
| 16  | A101 | 450 000 | 09/04/2026 | Virement     | `VIR-KOU-2604` | **Payé**                   | Quittance |
| 17  | P01  | 150 000 | 09/04/2026 | Espèces      | `ESP-0003`     | **Payé**                   | Quittance |
| 18  | A102 | 450 000 | 10/04/2026 | Virement     | `VIR-TRA-2604` | **Payé**                   | Quittance |
| 19  | P02  | 150 000 | 12/04/2026 | Mobile money | `MM-TRA-2604`  | **Payé**                   | Quittance |
| 20  | A201 | 450 000 | 14/04/2026 | Chèque       | `CHQ-BAM-0104` | **Payé**                   | Quittance |
| 21  | A202 | 300 000 | 30/04/2026 | Mobile money | `MM-NGU-2604`  | **Partiel**, reste 150 000 | Reçu      |
| 22  | B01  | 600 000 | 11/04/2026 | Virement     | `VIR-PHA-2604` | **Payé**                   | Quittance |
| —   | B02  |       — | —          | —            | —              | **En attente**             | —         |

- [ ] 18 + 6 = **24 quittances**, **3 reçus**.

### G.3 Incident — `S/profils-incidents`, « Incidents et imputations »

1. **« Nouvel incident »** : Contact déclarant `Élise N'Guessan`, Lot `A202`,
   Type **Fuite**, Urgence **Haute**, Description `Fuite sur la colonne
d'eau commune au 2ᵉ étage, infiltration dans A202 — 03/05/2026`.
2. Page `S/prestataires`, **« Nouveau contrat »**, lien « Pas de prestataire ?
   Créer un prestataire » : Nom `Plomberie Express Abidjan`, Spécialité
   `Plomberie`, e-mail du tableau 1.8 → **« Créer »** ; puis **annuler** la
   modale du contrat (aucun contrat pour ce prestataire).
3. Retour sur l'incident : colonne **« Prestataire »** → `Plomberie Express
Abidjan` ; **« Modifier l'incident »** → statut **En cours**.
4. **« Ajouter imputation »** : Type **Budget syndic**, Montant `218300`,
   Lot `A202`, Notes `Réparation colonne commune — facture PEA-2026-058`.

- [ ] « Incident créé », « Prestataire assigné à l'incident »,
      « Imputation enregistrée » ; Imputations **1**.
- [ ] L'incident sera clôturé en I.4 après paiement de la facture.

---

## Partie H — 3ᵉ trimestre 2026

### H.1 Appels du T3

Libellé `Charges courantes 2026 — T3`, Période `2026-T3`, **4 périodes**,
Période n° `3`, Date échéance `15/07/2026`, **Régulier** → 8 appels, total
3 000 000.

### H.2 Encaissements du T3

| #   | Lot  |   Montant | Date       | Mode         | Référence      | Effet attendu                                                                                                 | Documents                 |
| --- | ---- | --------: | ---------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 23  | A101 |   450 000 | 08/07/2026 | Virement     | `VIR-KOU-2607` | **Payé**                                                                                                      | Quittance                 |
| 24  | P01  |   150 000 | 08/07/2026 | Espèces      | `ESP-0004`     | **Payé**                                                                                                      | Quittance                 |
| 25  | A102 |   450 000 | 10/07/2026 | Virement     | `VIR-TRA-2607` | **Payé**                                                                                                      | Quittance                 |
| 26  | P02  |   150 000 | 10/07/2026 | Mobile money | `MM-TRA-2607`  | **Payé**                                                                                                      | Quittance                 |
| 27  | A201 |   450 000 | 13/07/2026 | Chèque       | `CHQ-BAM-0107` | **Payé**                                                                                                      | Quittance                 |
| 28  | A202 |   600 000 | 20/07/2026 | Mobile money | `MM-NGU-2607`  | affectation **du plus ancien au plus récent** : reste T2 **150 000** puis T3 **450 000** → les deux **Payés** | 2 quittances, pas de reçu |
| 29  | B01  | 1 200 000 | 12/07/2026 | Virement     | `VIR-PHA-2607` | T3 **Payé** + **avance 600 000**                                                                              | Quittance + Reçu          |
| —   | B02  |         — | —          | —            | —              | **En attente**                                                                                                | —                         |

- [ ] 24 + 8 = **32 quittances**, **4 reçus**.
- [ ] Compte B01 : avance **600 000** ; « Total des avances » (`S/finances`)
      **600 000**.

---

## Partie I — Dépenses de l'année : factures et paiements des prestataires

Écran : `S/prestataires`, onglet **« Factures »** (« Factures des
prestataires »), bouton **« Enregistrer une facture »**, puis tiroir de la
facture → **« Enregistrer un paiement »**. Toutes les factures sont en
**XOF**. « Nature de la dépense » : **Charges courantes** (compte 624) sauf
mention **Travaux** (compte 6241). « Fonds débité par défaut » : **Fonds de
roulement** sauf mention. Joindre à chaque facture un petit PDF quelconque.

### I.1 Factures de charges courantes des trois premiers trimestres (15 factures)

| N° de facture   | Prestataire               | Contrat / Incident         | Libellé                         | Date facture | Échéance   |            HT |         TVA |           TTC | Paiement (date, mode, montant)                                                                       |
| --------------- | ------------------------- | -------------------------- | ------------------------------- | ------------ | ---------- | ------------: | ----------: | ------------: | ---------------------------------------------------------------------------------------------------- |
| `AL-POL-2026`   | Assurances Lagune Test    | —                          | Prime multirisque 2026          | 05/01/2026   | 31/01/2026 |       950 000 |           0 |       950 000 | 15/01/2026, Virement bancaire, 950 000                                                               |
| `ICS-2026-01`   | Ivoire Clean Services     | Nettoyage 2026             | Nettoyage T1                    | 31/03/2026   | 15/04/2026 |       450 000 |      81 000 |       531 000 | 10/04/2026, Virement bancaire, 531 000                                                               |
| `SPC-2026-T1`   | Sécurité Plus CI          | Gardiennage 2026           | Gardiennage T1                  | 31/03/2026   | 15/04/2026 |       900 000 |     162 000 |     1 062 000 | 05/04/2026, Virement bancaire, 1 062 000                                                             |
| `ED-2026-03`    | Énergie Distribution Test | —                          | Électricité parties communes T1 | 31/03/2026   | 10/04/2026 |       350 000 |           0 |       350 000 | 10/04/2026, Mobile money, 350 000                                                                    |
| `EDT-2026-Q1`   | Eau Distribution Test     | —                          | Eau parties communes T1         | 31/03/2026   | 10/04/2026 |       120 000 |           0 |       120 000 | 10/04/2026, Mobile money, 120 000                                                                    |
| `PEA-2026-058`  | Plomberie Express Abidjan | Incident fuite A202        | Réparation colonne d'eau        | 06/05/2026   | 20/05/2026 |       185 000 |      33 300 |       218 300 | 15/05/2026, Mobile money, 218 300                                                                    |
| `ICS-2026-02`   | Ivoire Clean Services     | Nettoyage 2026             | Nettoyage T2                    | 30/06/2026   | 15/07/2026 |       450 000 |      81 000 |       531 000 | 10/07/2026, Virement bancaire, 531 000                                                               |
| `SPC-2026-T2`   | Sécurité Plus CI          | Gardiennage 2026           | Gardiennage T2                  | 30/06/2026   | 15/07/2026 |       900 000 |     162 000 |     1 062 000 | **deux paiements** : 05/07/2026 Virement bancaire 500 000, puis 20/07/2026 Virement bancaire 562 000 |
| `AEC-M-2026-S1` | Ascenseurs Élévation CI   | Maintenance ascenseur 2026 | Maintenance 1ᵉʳ semestre        | 30/06/2026   | 15/07/2026 |       600 000 |     108 000 |       708 000 | 15/07/2026, Chèque, 708 000                                                                          |
| `ED-2026-06`    | Énergie Distribution Test | —                          | Électricité T2                  | 30/06/2026   | 10/07/2026 |       350 000 |           0 |       350 000 | 10/07/2026, Mobile money, 350 000                                                                    |
| `EDT-2026-Q2`   | Eau Distribution Test     | —                          | Eau T2                          | 30/06/2026   | 10/07/2026 |       120 000 |           0 |       120 000 | 10/07/2026, Mobile money, 120 000                                                                    |
| `ICS-2026-03`   | Ivoire Clean Services     | Nettoyage 2026             | Nettoyage T3                    | 30/09/2026   | 15/10/2026 |       450 000 |      81 000 |       531 000 | 10/10/2026, Virement bancaire, 531 000                                                               |
| `SPC-2026-T3`   | Sécurité Plus CI          | Gardiennage 2026           | Gardiennage T3                  | 30/09/2026   | 15/10/2026 |       900 000 |     162 000 |     1 062 000 | voir I.6 (erreur de fonds puis correction)                                                           |
| `ED-2026-09`    | Énergie Distribution Test | —                          | Électricité T3                  | 30/09/2026   | 10/10/2026 |       350 000 |           0 |       350 000 | 10/10/2026, Mobile money, 350 000                                                                    |
| `EDT-2026-Q3`   | Eau Distribution Test     | —                          | Eau T3                          | 30/09/2026   | 10/10/2026 |       120 000 |           0 |       120 000 | 10/10/2026, Mobile money, 120 000                                                                    |
| **Total**       |                           |                            |                                 |              |            | **7 195 000** | **870 300** | **8 065 300** |                                                                                                      |

(Les 5 factures du 4ᵉ trimestre, datées du 31/12/2026, se saisissent en
L.5, une fois les encaissements du T4 enregistrés : le Fonds de roulement ne
passe ainsi jamais en négatif.)

Résultat attendu à la première facture :

- [ ] « Facture enregistrée », statut **Enregistrée**, « Montant TTC
      (calculé) » = HT + TVA.
- [ ] `S/comptabilite` : les comptes **401**, **624**, **6241** apparaissent
      d'eux-mêmes, ainsi que les journaux **ACH** (Achats et prestataires) et
      **BQ** (Banque). Écriture de facture : débit 624 / crédit 401 pour le
      **TTC**.

Après paiement de chaque facture :

- [ ] Statut **Payée** (ou **Partiellement payée** entre les deux paiements
      de `SPC-2026-T2`, reste dû 562 000).
- [ ] Écriture de paiement : débit 401 / crédit 521.
- [ ] Mouvement « Paiement prestataire » au débit du fonds choisi.

### I.2 Factures de travaux (Nature **Travaux**, fonds **Fonds de travaux**)

| N° de facture    | Prestataire             | Libellé                             | Date facture |        HT |     TVA |       TTC | Paiements                                                                                             |
| ---------------- | ----------------------- | ----------------------------------- | ------------ | --------: | ------: | --------: | ----------------------------------------------------------------------------------------------------- |
| `FPC-2026-014`   | Façades & Peinture CI   | Ravalement des façades (AGE 20/02)  | 01/04/2026   | 3 000 000 | 540 000 | 3 540 000 | acompte 15/04/2026 Virement bancaire **1 770 000** ; solde 30/06/2026 Virement bancaire **1 770 000** |
| `AEC-T-2026-001` | Ascenseurs Élévation CI | Remplacement des câbles (AGE 20/02) | 15/04/2026   |   800 000 | 144 000 |   944 000 | 30/04/2026 Chèque 944 000                                                                             |

- [ ] Écritures sur **6241** (Travaux sur parties communes), débit 4 484 000
      au total.
- [ ] `FPC-2026-014` : **Partiellement payée** après l'acompte (reste
      1 770 000), **Payée** après le solde.
- [ ] Fonds de travaux : 7 100 000 − 3 540 000 − 944 000 = **2 616 000**
      avant la partie L.

### I.3 Rattachement budgétaire

Dans chaque facture de charges courantes, « Ligne budgétaire » = poste
**Charges courantes** du budget 2026 ; pour les travaux, le poste du budget
de travaux correspondant.

- [ ] Consigner si le **réalisé** du budget est visible quelque part : le
      code le calcule (`amountActual`) mais aucun écran ne l'affiche à ce
      jour — écart connu (N.8).

### I.4 Clore l'incident

`S/profils-incidents` : l'incident de fuite → **« Modifier l'incident »** →
statut **Résolu**, puis **Clôturé**.

- [ ] La facture `PEA-2026-058` est visible dans les factures liées à
      l'incident (« Factures liées »).

### I.5 Facture saisie en double, puis annulée

1. Enregistrer à nouveau `ICS-2026-02` (mêmes valeurs) — si le numéro en
   double est refusé, consigner le message et passer à I.6 ; sinon :
2. Ouvrir cette seconde facture → **« Annuler la facture »**, motif
   `Saisie en double de ICS-2026-02` → **« Confirmer l'annulation »**.

- [ ] Statut **Annulée** ; la facture reste visible, rien n'est supprimé.
- [ ] Comptabilité : l'écriture de facture est **contre-passée** (débit 401 /
      crédit 624 du même montant) ; le solde du 624 n'en garde aucune trace.

### I.6 Paiement imputé sur le mauvais fonds, puis annulé

1. Facture `SPC-2026-T3` → **« Enregistrer un paiement »** : 05/10/2026,
   Virement bancaire, 1 062 000, **Fonds à débiter : Fonds de travaux**
   (l'erreur voulue) → **« Enregistrer »**.
2. Constater : Fonds de travaux débité de 1 062 000.
3. Sur ce paiement → **« Annuler ce paiement »**, motif `Mauvais fonds
débité` → confirmer.
4. Nouveau paiement : 05/10/2026, Virement bancaire, 1 062 000, **Fonds de
   roulement**.

- [ ] « Paiement annulé » : Fonds de travaux **recrédité** de 1 062 000
      (mouvement « Annulation de paiement prestataire ») ; écriture 401/521
      contre-passée.
- [ ] Facture `SPC-2026-T3` finalement **Payée**, débitée sur le Fonds de
      roulement.

### I.7 Point d'étape après le 3ᵉ trimestre — `S/finances`

| Carte                | Valeur attendue | Détail                                              |
| -------------------- | --------------: | --------------------------------------------------- |
| Total appelé         |      14 000 000 | 9 000 000 (T1–T3) + 4 000 000 + 1 000 000           |
| Total payé (affecté) |      12 700 000 | 8 100 000 charges courantes + 4 600 000 travaux     |
| Reste à payer        |       1 300 000 | B02 : T1, T2, T3 (3 × 300 000) + ravalement 400 000 |
| Total des avances    |         600 000 | B01                                                 |
| Fonds de roulement   |       1 534 700 | 1 500 000 + 8 100 000 − 8 065 300 (factures I.1)    |
| Fonds de travaux     |       2 616 000 | 2 500 000 + 4 600 000 − 4 484 000 (factures I.2)    |
| **Total fonds**      |   **4 150 700** |                                                     |

---

## Partie J — Recouvrement (photographie au jour réel du test)

À jouer **avant la partie L**. Écran `S/recouvrement`.

### J.1 Tableau des retards

- [ ] Seul **B02 (Moussa Diabaté)** est en retard : T1, T2, T3 (300 000
      chacun) et ravalement (400 000) → **Montant restant dû 1 300 000** ;
      « Lots en retard » **1** (si la carte compte les appels et affiche 4,
      le consigner). Jours de retard du T1 : écart entre le 15/01/2026 et la
      date du jour.

### J.2 Relance manuelle

**« Relance manuelle »** : Appel de charges = T1 de B02 (reste 300 000),
Niveau `1`, **Canal : Email** (ne jamais choisir SMS ni WhatsApp) →
**« Créer »**.

- [ ] « Relance créée » ; « Historique relances » : Niveau 1, Canal EMAIL,
      statut Envoyé, lot B02.

### J.3 Relances groupées

**« Lancer les relances groupées »**.

- [ ] « Relances groupées envoyées : N relance(s) créée(s) » — consigner N ;
      seules des relances pour **B02** doivent apparaître.

### J.4 Pénalité puis remise

1. **« Appliquer pénalité »** : Appel = T1 de B02, Taux `10`, Jours de retard
   vide → **« Appliquer »**.
2. Ligne créée → **« Remise »**, motif `Accord amiable du 30/09/2026 :
règlement échelonné accepté` → **« Appliquer remise »**.

- [ ] Pénalité **30 000** (300 000 × 10 %), statut ACTIF, puis **REMIS**.
- [ ] Consigner si la pénalité a débité le compte du lot B02 (et si la
      remise l'a recrédité).

### J.5 Échéancier

**« Créer échéancier »** : Appel = T3 de B02 (reste 300 000), Montant total
`300000`, Date accord `30/09/2026`, échéances **150 000 au 15/11/2026** et
**150 000 au 15/12/2026** → **« Créer »**.

- [ ] « Échéancier créé », statut ACTIVE, 2 échéances PENDING.

---

## Partie K — Portail copropriétaire (vérification en cours d'année)

La partie M rejoue le portail après la clôture ; ici on ouvre l'accès.

1. `S/profils-incidents`, ligne A101 / Jean-Marc Kouadio → **« Inviter au
   portail »**.
2. Fenêtre « Inviter au portail copropriétaire » : « Jean-Marc Kouadio
   (jm.kouadio@exemple.test) peut consulter **2 lot(s)** en lecture seule »,
   lien d'invitation → **« Copier »**.
3. Fenêtre privée : ouvrir le lien, définir `Kouadio#2026`, se connecter
   avec `jm.kouadio@exemple.test`.

- [ ] Arrivée directe sur `/copropriete`, **Mes lots** : A101 (150
      tantièmes, part 100 %) et P01 (50 tantièmes) ; **aucun autre lot**.
- [ ] Soldes : A101 et P01 **Soldé** à ce stade.
- [ ] Appels, Paiements, Quittances : uniquement ceux de A101 et P01 ;
      **aucun bouton de paiement**.
- [ ] Documents : `Règlement de copropriété` et `PV AGE du 20/02/2026`
      seulement (pas l'assurance, pas le diagnostic).
- [ ] Assemblées : l'AGE clôturée avec ses résultats et « Votre vote »
      (A101 : Pour, Pour ; P01 : Pour, Pour), sans le vote des autres.
- [ ] Remplacer l'identifiant du lot dans l'adresse par celui de B02 →
      « Ce lot est introuvable dans votre espace. »

---

## Partie L — 4ᵉ trimestre 2026 par appels automatiques, et fin des encaissements

### L.1 Programmation — `S/programmation`

**« Nouvelle programmation »** :

| Champ                         | Valeur                                  |
| ----------------------------- | --------------------------------------- |
| Libellé                       | `Charges courantes trimestrielles 2026` |
| Fréquence                     | **Trimestrielle**                       |
| Source du montant             | **Budget approuvé**                     |
| Budget approuvé de l'exercice | `Budget charges courantes 2026`         |
| Date de début                 | `01/10/2026`                            |
| Date de fin (optionnelle)     | `31/12/2026`                            |
| Jour d'émission               | `1`                                     |
| Délai avant échéance (jours)  | `14`                                    |
| Devise                        | `XOF`                                   |

**« Créer »**.

- [ ] « Programmation créée », statut **Active**, « Prochaine émission »
      **01/10/2026**.
- [ ] **« Aperçu »** : une seule période (T4 2026), échéance **15/10/2026**,
      8 lots, total **3 000 000** (période 4 sur 4 : elle absorbe l'arrondi,
      nul ici).

### L.2 Pause et reprise

**« Pause »** → « Programmation mise en pause », statut **En pause** ;
**« Reprise »** → « Programmation reprise ».

### L.3 Exécuter maintenant

**« Exécuter maintenant »** → confirmer « Exécuter la programmation
« Charges courantes trimestrielles 2026 » maintenant ? ».

- [ ] 8 appels T4 créés (450 000 / 600 000 / 300 000 / 150 000).
- [ ] L'avance de **B01 (600 000)** est imputée **automatiquement** : T4 B01
      **Payé** dès sa création, **quittance émise** (33ᵉ), avance **0** ;
      Fonds de roulement crédité de 600 000.
- [ ] « Historique des exécutions » : **Réussie**, Appels créés 8,
      **Couverts 1** ; l'avis de B01 n'est pas envoyé (appel couvert).
- [ ] Relancer **« Exécuter maintenant »** : « Période … déjà traitée : rien
      à créer. » (aucun doublon).
- [ ] « Prochaine émission » : **Aucune (fin de programmation atteinte)**.

### L.4 Encaissements du T4 et régularisation de B02

| #   | Lot  | Montant | Date       | Mode         | Référence      | Affectation                    | Effet attendu                                                          | Documents    |
| --- | ---- | ------: | ---------- | ------------ | -------------- | ------------------------------ | ---------------------------------------------------------------------- | ------------ |
| 30  | A101 | 450 000 | 08/10/2026 | Virement     | `VIR-KOU-2610` | automatique                    | T4 **Payé**                                                            | Quittance    |
| 31  | P01  | 150 000 | 08/10/2026 | Espèces      | `ESP-0005`     | automatique                    | T4 **Payé**                                                            | Quittance    |
| 32  | A102 | 450 000 | 10/10/2026 | Virement     | `VIR-TRA-2610` | automatique                    | T4 **Payé**                                                            | Quittance    |
| 33  | P02  | 150 000 | 10/10/2026 | Mobile money | `MM-TRA-2610`  | automatique                    | T4 **Payé**                                                            | Quittance    |
| 34  | A201 | 450 000 | 12/10/2026 | Chèque       | `CHQ-BAM-0110` | automatique                    | T4 **Payé**                                                            | Quittance    |
| 35  | A202 | 450 000 | 14/10/2026 | Mobile money | `MM-NGU-2610`  | automatique                    | T4 **Payé**                                                            | Quittance    |
| 36  | B02  | 600 000 | 17/10/2026 | Virement     | `VIR-DIA-2610` | **cocher T1 et T2 uniquement** | T1 et T2 **Payés** (ravalement, plus ancien que T2, reste dû)          | 2 quittances |
| 37  | B02  | 700 000 | 31/12/2026 | Virement     | `VIR-DIA-2612` | automatique                    | ravalement 400 000 puis T3 300 000 **Payés** ; T4 reste **En attente** | 2 quittances |

- [ ] Paiement 36 : l'aperçu montre bien T1 + T2 et **aucune** affectation
      au ravalement malgré son ancienneté.
- [ ] Après le paiement 37 : l'échéancier de J.5 — consigner son statut
      (COMPLETED attendu si l'échéancier suit l'appel soldé ; ACTIVE sinon,
      à noter comme écart).
- [ ] Total : **43 quittances** (31 charges courantes + 8 ravalement + 4
      ascenseur) et **4 reçus**.

### L.5 Factures du 4ᵉ trimestre — `S/prestataires`, onglet « Factures »

Mêmes règles qu'en I.1 (Charges courantes, Fonds de roulement), à saisir
**après** L.4 :

| N° de facture   | Prestataire               | Contrat                    | Libellé                 | Date facture | Échéance   |            HT |         TVA |           TTC | Paiement (31/12/2026)        |
| --------------- | ------------------------- | -------------------------- | ----------------------- | ------------ | ---------- | ------------: | ----------: | ------------: | ---------------------------- |
| `ICS-2026-04`   | Ivoire Clean Services     | Nettoyage 2026             | Nettoyage T4            | 31/12/2026   | 15/01/2027 |       450 000 |      81 000 |       531 000 | Virement bancaire, 531 000   |
| `SPC-2026-T4`   | Sécurité Plus CI          | Gardiennage 2026           | Gardiennage T4          | 31/12/2026   | 15/01/2027 |       900 000 |     162 000 |     1 062 000 | Virement bancaire, 1 062 000 |
| `AEC-M-2026-S2` | Ascenseurs Élévation CI   | Maintenance ascenseur 2026 | Maintenance 2ᵉ semestre | 31/12/2026   | 15/01/2027 |       600 000 |     108 000 |       708 000 | Chèque, 708 000              |
| `ED-2026-12`    | Énergie Distribution Test | —                          | Électricité T4          | 31/12/2026   | 10/01/2027 |       350 000 |           0 |       350 000 | Mobile money, 350 000        |
| `EDT-2026-Q4`   | Eau Distribution Test     | —                          | Eau T4                  | 31/12/2026   | 10/01/2027 |       120 000 |           0 |       120 000 | Mobile money, 120 000        |
| **Total**       |                           |                            |                         |              |            | **2 420 000** | **351 000** | **2 771 000** |                              |

- [ ] 5 factures **Payées**.
- [ ] Fonds de roulement : 1 534 700 (I.7) + 3 600 000 (charges courantes
      encaissées en L.3 et L.4) − 2 771 000 = **2 363 700**.
- [ ] Charges courantes de l'année : 8 065 300 (I.1) + 2 771 000 =
      **10 836 300** (HT 9 615 000 + TVA 1 221 300).

---

## Partie M — Portail copropriétaire après les encaissements

Fenêtre privée, connecté comme Jean-Marc Kouadio :

- [ ] **Mes quittances** : 11 quittances (A101 : T1–T4, ravalement,
      ascenseur ; P01 : T1–T4, ravalement), téléchargeables.
- [ ] **Mes paiements** : 10 paiements (5 pour A101, 5 pour P01).
- [ ] **Suivi mensuel** : tous les mois 2026 **Réglés** pour A101 et P01.
- [ ] **Relevé PDF** de A101 : 6 appels (4 × 450 000, 600 000, 250 000),
      paiements 450 000 × 4 et 850 000, solde **0**.
- [ ] **Fiche copropriété** : Résidence Les Flamboyants, mandant Cabinet
      Kouassi & Associés et ses coordonnées, logo.

Puis, session gestionnaire, `S/profils-incidents` → ligne A101 →
**« Révoquer l'accès »** → **« Révoquer »** :

- [ ] « Accès au portail révoqué » ; dans la fenêtre privée, actualiser :
      accès refusé immédiatement.

---

## Partie N — Clôture de l'exercice 2026

ImmoTopia ne propose **pas** de clôture d'exercice automatisée (voir N.8).
La clôture se fait donc avec les outils existants : arrêté et rapprochement
des comptes, écritures de fin d'année, verrouillage, assemblée
d'approbation, régularisation et ouverture de 2027.

### N.1 Arrêté des appels et des encaissements au 31/12/2026 — `S/finances` et `S/charges`

| Contrôle                        |     Valeur attendue |
| ------------------------------- | ------------------: |
| Total appelé                    |          17 000 000 |
| Total payé (affecté aux appels) |          16 700 000 |
| Reste à payer                   |    300 000 (B02 T4) |
| Total des avances               |                   0 |
| Appels **Payé**                 |                  43 |
| Appels non soldés               | 1 (B02 T4, 300 000) |

### N.2 Comptes des copropriétaires au 31/12/2026 — `S/lots` → « Compte »

| Lot       |    Appelé 2026 |      Payé 2026 | Solde                |
| --------- | -------------: | -------------: | -------------------- |
| A101      |      2 650 000 |      2 650 000 | Soldé                |
| A102      |      2 650 000 |      2 650 000 | Soldé                |
| A201      |      2 650 000 |      2 650 000 | Soldé                |
| A202      |      2 650 000 |      2 650 000 | Soldé                |
| B01       |      3 200 000 |      3 200 000 | Soldé                |
| B02       |      1 600 000 |      1 300 000 | **300 000 Débiteur** |
| P01       |        800 000 |        800 000 | Soldé                |
| P02       |        800 000 |        800 000 | Soldé                |
| **Total** | **17 000 000** | **16 700 000** | **300 000**          |

(Hors pénalité de J.4, remise en totalité.) Télécharger le **relevé PDF** de
B02 : il doit se terminer sur 300 000 débiteur.

### N.3 Quittances de l'exercice — `S/quittances`

1. **« Générer les quittances manquantes »** → « 0 quittance(s) créée(s), 43
   déjà à jour » (aucune ne manque).
2. **« Imprimer les quittances »** : Période **01/01/2026 → 31/12/2026**,
   Portée **Tous les copropriétaires**, Type de document **Quittances**,
   Mise en page A4 **2 colonnes × 3 lignes** → **« Aperçu »**.

- [ ] 43 quittances sur **8 pages** (6 par feuille), traits de coupe.
- [ ] Portée **Un copropriétaire ou un lot** → Moussa Diabaté, 1 × 1 :
      4 quittances (T1, T2, T3, ravalement), 4 pages.
- [ ] Filtre Type **Reçus** : 4 reçus (A102, A201, A202, B01).

### N.4 Fonds au 31/12/2026 — `S/finances`, « Historique des mouvements »

| Fonds              | Ouverture | Crédits (paiements de charges) | Débits (prestataires) | Solde attendu |
| ------------------ | --------: | -----------------------------: | --------------------: | ------------: |
| Fonds de roulement | 1 500 000 |                     11 700 000 |            10 836 300 | **2 363 700** |
| Fonds de travaux   | 2 500 000 |                      5 000 000 |             4 484 000 | **3 016 000** |
| **Total fonds**    | 4 000 000 |                     16 700 000 |            15 320 300 | **5 379 700** |

Les deux mouvements d'I.6 (débit puis annulation de 1 062 000) figurent dans
l'historique du Fonds de travaux et s'annulent.

- [ ] Carte **Total fonds = 5 379 700 FCFA**.

Prestataires — `S/prestataires`, onglet « Factures », « Soldes par
prestataire » (la facture annulée en I.5 n'entre dans aucun total) :

| Prestataire               |  Total facturé |     Total payé | Reste dû |
| ------------------------- | -------------: | -------------: | -------: |
| Assurances Lagune Test    |        950 000 |        950 000 |        0 |
| Ivoire Clean Services     |      2 124 000 |      2 124 000 |        0 |
| Sécurité Plus CI          |      4 248 000 |      4 248 000 |        0 |
| Ascenseurs Élévation CI   |      2 360 000 |      2 360 000 |        0 |
| Énergie Distribution Test |      1 400 000 |      1 400 000 |        0 |
| Eau Distribution Test     |        480 000 |        480 000 |        0 |
| Plomberie Express Abidjan |        218 300 |        218 300 |        0 |
| Façades & Peinture CI     |      3 540 000 |      3 540 000 |        0 |
| **Total**                 | **15 320 300** | **15 320 300** |    **0** |

- [ ] Aucun reste dû : la dette fournisseurs (compte 401) est soldée.

### N.5 Réel contre budget des charges courantes

| Poste (réel TTC 2026)      |                Montant |
| -------------------------- | ---------------------: |
| Assurance                  |                950 000 |
| Nettoyage                  |              2 124 000 |
| Gardiennage                |              4 248 000 |
| Maintenance ascenseur      |              1 416 000 |
| Électricité                |              1 400 000 |
| Eau                        |                480 000 |
| Plomberie (incident)       |                218 300 |
| **Réel**                   |         **10 836 300** |
| **Budget**                 |         **12 000 000** |
| **Excédent à régulariser** | **1 163 700** (9,70 %) |

Excédent par lot (1 163,70 FCFA par tantième) — sert en N.7 :

| Lot                    |  Tantièmes | Crédit de régularisation |
| ---------------------- | ---------: | -----------------------: |
| A101, A102, A201, A202 | 150 chacun |           174 555 chacun |
| B01                    |        200 |                  232 740 |
| B02                    |        100 |                  116 370 |
| P01, P02               |  50 chacun |            58 185 chacun |
| **Total**              |      1 000 |            **1 163 700** |

- [ ] Consigner si l'écran « Postes et fonds » ou la fiche budget montre le
      réalisé (10 836 300) : sinon, écart connu N.8.

### N.6 Écritures de fin d'année et balance — `S/comptabilite` (connecté comme Mariam Diallo si C.1 l'a permis)

Journal `OD`, Source `MANUEL`, date **31/12/2026** :

| Référence  | Description                        | Débit             | Crédit            |
| ---------- | ---------------------------------- | ----------------- | ----------------- |
| `APP-2026` | Appels de charges courantes 2026   | 4500 : 12 000 000 | 7010 : 12 000 000 |
| `TRV-2026` | Appels de fonds travaux 2026       | 4500 : 5 000 000  | 7020 : 5 000 000  |
| `ENC-2026` | Encaissements copropriétaires 2026 | 521 : 16 700 000  | 4500 : 16 700 000 |

Balance de vérification attendue (soldes) :

| Compte    | Intitulé                              | Solde débiteur | Solde créditeur |
| --------- | ------------------------------------- | -------------: | --------------: |
| 401       | Fournisseurs et prestataires          |              0 |               0 |
| 521       | Banque                                |      5 379 700 |                 |
| 4500      | Copropriétaires                       |        300 000 |                 |
| 624       | Entretien, réparations et maintenance |     10 836 300 |                 |
| 6241      | Travaux sur parties communes          |      4 484 000 |                 |
| 1010      | Fonds de roulement                    |                |       1 500 000 |
| 1020      | Fonds de travaux                      |                |       2 500 000 |
| 7010      | Appels de charges courantes           |                |      12 000 000 |
| 7020      | Appels de fonds travaux               |                |       5 000 000 |
| **Total** |                                       | **21 000 000** |  **21 000 000** |

- [ ] « Balance équilibrée » **Oui**, totaux 21 000 000 / 21 000 000.
- [ ] **Banque 521 = 5 379 700 = Total fonds (N.4)** : la trésorerie
      comptable et les fonds concordent.
- [ ] Grand livre du 4500 : solde 300 000 = créance de B02 (N.2).

Affectation du résultat (écriture `AFF-2026`, 31/12/2026) — résultat
17 000 000 − 15 320 300 = **1 679 700** :

| Débit             | Crédit           |
| ----------------- | ---------------- |
| 7010 : 12 000 000 | 624 : 10 836 300 |
| 7020 : 5 000 000  | 6241 : 4 484 000 |
|                   | 1010 : 1 163 700 |
|                   | 1020 : 516 000   |

- [ ] Après `AFF-2026` : classes 6 et 7 **à zéro** ; 1010 = **2 663 700**
      crédit ; 1020 = **3 016 000** crédit. L'écart de **300 000** entre le
      1010 comptable (2 663 700) et le Fonds de roulement de l'application
      (2 363 700) est la créance de B02 : comptabilité d'engagement contre
      trésorerie. Ce n'est pas une anomalie.

Verrouillage : **« Verrouiller »** chaque écriture de l'exercice (manuelles
et automatiques).

- [ ] Toutes au statut **VERROUILLÉE** ; plus aucune modification possible.

### N.7 Mise en attente de la régularisation

La régularisation de l'excédent est **décidée par l'AG** (N.9, résolution 3) : ne rien saisir avant.

### N.8 Fonctions de clôture absentes — constats d'écart (à consigner, pas des échecs)

| #   | Fonction attendue d'un logiciel de syndic                       | Constat attendu dans ImmoTopia                                  |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Bouton ou écran « Clôturer l'exercice 2026 »                    | Absent (aucune route, aucun écran)                              |
| 2   | Budget 2026 au statut « Clôturé » ou « Révisé »                 | Statuts présents en base mais **inatteignables** depuis l'écran |
| 3   | Réalisé par poste et écart budget/réel à l'écran                | Calculé en base (`amountActual`), **non affiché**               |
| 4   | Régularisation automatique des charges (provisions contre réel) | Absente — calcul manuel (N.5) et ajustements (N.10)             |
| 5   | Report à nouveau et ouverture automatique de l'exercice suivant | Absents — l'exercice est un simple nombre                       |
| 6   | Verrouillage d'une période entière                              | Seulement écriture par écriture                                 |
| 7   | Annexes comptables de l'AG (état financier, dettes et créances) | Absentes — seuls le relevé par lot et le PV Word existent       |
| 8   | Conseil syndical                                                | Absent                                                          |
| 9   | Comptes bancaires de la copropriété                             | Modèle en base, **aucun écran**                                 |
| 10  | Relances par SMS                                                | Canal listé mais non câblé (ne pas le tester, règle n° 2)       |

### N.9 AG ordinaire d'approbation des comptes — 20/03/2027

1. `S/assemblees`, **« Nouvelle assemblée »** : Type **Ordinaire**,
   `20/03/2027 17:00`, fin `19:30`, Lieu `Salle polyvalente de la
résidence`.
2. Ordre du jour (5 points) : `Approbation des comptes 2026`, `Quitus au
syndic`, `Affectation de l'excédent 2026`, `Budget prévisionnel 2027`,
   `Questions diverses`.
3. Pouvoir : Mandant `Élise N'Guessan` (A202) → Mandataire `Sékou Bamba`.
4. `S/documents` : ajouter `Comptes 2026 — balance et grand livre` (Type
   **Budget**, PDF quelconque) et les relevés N.2.
5. **« Ouvrir la séance »**, puis 7 résolutions :

Rappel : 6 copropriétaires distincts (Kouadio, Traoré, Bamba, N'Guessan,
Pharmacie du Golf, Diabaté).

| #   | Résolution                                                                        | Règle      | Pour                                                                         | Contre             | Abstention | Calcul                                                            | Résultat attendu |
| --- | --------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- | ------------------ | ---------- | ----------------------------------------------------------------- | ---------------- |
| 1   | `Approbation des comptes de l'exercice 2026`                                      | Article 24 | tous sauf B02 (900)                                                          | B02 (100)          | —          | 900 > 100                                                         | **Approuvée**    |
| 2   | `Quitus au syndic Horizon Syndic Gestion pour 2026`                               | Article 24 | A101, P01, A102, P02, A201, B01 (750)                                        | A202 (150)         | B02 (100)  | 750 > 150                                                         | **Approuvée**    |
| 3   | `Excédent de 1 163 700 FCFA crédité aux copropriétaires au prorata des tantièmes` | Article 24 | les 8 lots (1 000)                                                           | —                  | —          | 1 000 > 0                                                         | **Approuvée**    |
| 4   | `Budget prévisionnel 2027 de 13 200 000 FCFA`                                     | Article 24 | A101, P01, A102, P02, B01 (600)                                              | A201, A202 (300)   | B02 (100)  | 600 > 300                                                         | **Approuvée**    |
| 5   | `Renouvellement du mandat du syndic pour un an`                                   | Article 25 | A101, P01, A102, P02, A201, B01 (750)                                        | A202, B02 (250)    | —          | 750 × 2 = 1 500 > 1 000                                           | **Approuvée**    |
| 6   | `Cotisation annuelle de 2 000 000 FCFA au fonds de travaux`                       | Article 25 | A101, P01, A202, B02 (450)                                                   | les 4 autres (550) | —          | 450 × 2 = 900 ≤ 1 000                                             | **Rejetée**      |
| 7   | `Cession de l'ancienne loge du gardien`                                           | Article 26 | Kouadio (A101, P01), Traoré (A102, P02), Bamba (A201), Pharmacie (B01) — 750 | A202, B02 (250)    | —          | 4 copropriétaires sur 6 : 4 × 2 = 8 > 6 ; 750 × 3 = 2 250 ≥ 2 000 | **Approuvée**    |
| 8   | `Changement d'affectation du local B01 en habitation`                             | Unanimité  | tous sauf B02 (900)                                                          | B02 (100)          | —          | un Contre suffit                                                  | **Rejetée**      |

(Le vote de A202 est saisi « représenté par Sékou Bamba ».)

- [ ] Quorum **100 %**, « 1000 / 1000 tantièmes représentés ».
- [ ] Les 8 résultats ci-dessus, en tantièmes (jamais en nombre de lots,
      sauf le décompte des copropriétaires de la résolution 7).
- [ ] **« Générer compte rendu Word »** → PV téléchargé, puis **« Clôturer
      la séance »** → **Clôturée** ; déposer le PV dans les documents,
      Titre `PV AGO du 20/03/2027`, Type **PV d'AG**.

### N.10 Régularisation décidée par l'AG — comptes des lots

Sur `S/lots` → **« Compte »** de chaque lot → **« Ajouter ajustement »**,
Direction **Crédit**, Libellé `Régularisation charges 2026 (AGO 20/03/2027)` :

| Lot  | Montant | Solde attendu après                      |
| ---- | ------: | ---------------------------------------- |
| A101 | 174 555 | 174 555 Créditeur                        |
| A102 | 174 555 | 174 555 Créditeur                        |
| A201 | 174 555 | 174 555 Créditeur                        |
| A202 | 174 555 | 174 555 Créditeur                        |
| B01  | 232 740 | 232 740 Créditeur                        |
| B02  | 116 370 | **183 630 Débiteur** (300 000 − 116 370) |
| P01  |  58 185 | 58 185 Créditeur                         |
| P02  |  58 185 | 58 185 Créditeur                         |

- [ ] 8 × « Ajustement enregistré », soldes conformes.
- [ ] Consigner si ces crédits apparaissent comme **avance** imputable au
      prochain appel (Suivi mensuel, « Avance ») : si l'ajustement ne
      devient pas une avance, l'imputation en 2027 ne sera pas automatique —
      écart à signaler.

Écriture comptable correspondante (journal `OD`, 20/03/2027, exercice
2027 — créer le journal `OD` 2027 si besoin) : débit **1010** 1 163 700 /
crédit **4500** 1 163 700, référence `REG-2026`.

### N.11 Ouverture de l'exercice 2027

1. `S/budgets`, **« Nouveau budget »** : Exercice `2027`, Libellé `Budget
charges courantes 2027`, Montant `13200000`, Catégorie `Charges
courantes`, Tantièmes généraux, Fonds `Fonds de roulement` →
   **« Créer budget »**, **« Approuver »**, **« Répartir »**.

- [ ] Allocations : 150 → **1 980 000**, 200 → **2 640 000**, 100 →
      **1 320 000**, 50 → **660 000** (total 13 200 000).

2. `S/programmation`, **« Nouvelle programmation »** : `Charges courantes
trimestrielles 2027`, Trimestrielle, Budget approuvé `Budget charges
courantes 2027`, début `01/01/2027`, sans date de fin, jour d'émission
   `1`, délai `14` → **« Créer »** → **« Aperçu »** (ne **pas** exécuter).

- [ ] 4 prochaines périodes 2027 ; T1 : 495 000 / 660 000 / 330 000 /
      165 000 par lot, total **3 300 000**, échéance **15/01/2027**.
- [ ] Budget 2026 : toujours **APPROVED** (aucun passage à « Clôturé »
      possible — écart N.8-2).

3. Écriture `OUV-2027` (journal OD 2027, 01/01/2027) reprenant les soldes de
   bilan : 521 débit 5 379 700 ; 4500 débit 300 000 ; 1010 crédit
   2 663 700 ; 1020 crédit 3 016 000 (total 5 679 700 de chaque côté).

- [ ] Balance 2027 équilibrée.

---

## Partie O — Fin de la période d'essai (facultatif, super-admin)

Le passage réel en fin d'essai dépend d'une tâche planifiée : on se limite à
des constats.

1. Super-admin, `/admin/tenants/<TENANT>`, onglet « Abonnement ».

- [ ] Statut **Essai**, fin d'essai à J + 30 ; « Prochaine facture
      (aperçu) » **49 900 HT** (sans les 150 000 de mise en route, non
      choisie).
- [ ] Consommation : Copropriétés **1 / 2**, Lots **6 / 100**.

2. Poser une **lecture seule manuelle**, motif `Test recette fin d'essai`.
   Côté agence (recharger ; attendre 30 s si besoin) : bandeau « Compte en
   lecture seule » ; tenter **« Nouveau lot »** → refus ; les écrans restent
   consultables. **Lever** la lecture seule et vérifier que l'écriture est
   de nouveau possible (annuler la création du lot).

---

## Annexe A — Récapitulatif chiffré et recoupements

### A.1 Trésorerie de l'exercice 2026

| Flux                                                        |       Montant |
| ----------------------------------------------------------- | ------------: |
| Trésorerie reprise au 01/01/2026                            |     4 000 000 |
| + Encaissements copropriétaires                             |    16 700 000 |
| − Paiements prestataires (charges)                          |    10 836 300 |
| − Paiements prestataires (travaux)                          |     4 484 000 |
| **= Trésorerie au 31/12/2026**                              | **5 379 700** |
| = Fonds de roulement 2 363 700 + Fonds de travaux 3 016 000 |     5 379 700 |
| = Solde du compte 521                                       |     5 379 700 |

### A.2 Encaissements par lot

| Lot       |      T1 | Travaux |      T2 |        T3 |                         T4 |     Total 2026 |
| --------- | ------: | ------: | ------: | --------: | -------------------------: | -------------: |
| A101      | 450 000 | 850 000 | 450 000 |   450 000 |                    450 000 |      2 650 000 |
| A102      | 900 000 | 400 000 | 450 000 |   450 000 |                    450 000 |      2 650 000 |
| A201      | 450 000 | 850 000 | 450 000 |   450 000 |                    450 000 |      2 650 000 |
| A202      | 450 000 | 850 000 | 300 000 |   600 000 |                    450 000 |      2 650 000 |
| B01       | 600 000 | 800 000 | 600 000 | 1 200 000 |                   (avance) |      3 200 000 |
| B02       |       — |       — |       — |         — | 1 300 000 (17/10 et 31/12) |      1 300 000 |
| P01       | 150 000 | 200 000 | 150 000 |   150 000 |                    150 000 |        800 000 |
| P02       | 150 000 | 200 000 | 150 000 |   150 000 |                    150 000 |        800 000 |
| **Total** |         |         |         |           |                            | **16 700 000** |

### A.3 Modes de paiement couverts

Copropriétaires : Virement, Espèces, Chèque, Mobile money (pas de paiement en
ligne : il n'existe pas pour les charges). Prestataires : Virement bancaire,
Mobile money, Chèque. Cas couverts : paiement exact, partiel, trop-perçu en
avance, avance imputée automatiquement (création d'appel et programmation),
affectation du plus ancien au plus récent, affectation par cases cochées,
paiement fractionné d'une facture, annulation de facture, annulation de
paiement.

## Annexe B — Documents émis attendus

| Type                  |       Nombre | Lots                                                                                    |
| --------------------- | -----------: | --------------------------------------------------------------------------------------- |
| Quittances            |           43 | 31 charges courantes (tout sauf B02 T4), 8 ravalement, 4 ascenseur                      |
| Reçus                 |            4 | A102 (10/01, avance), A201 (14/01, partiel), A202 (30/04, partiel), B01 (12/07, avance) |
| Avis d'appel PDF      | à la demande | un par appel                                                                            |
| Relevés de compte PDF |            8 | un par lot au 31/12/2026                                                                |
| PV d'AG (Word)        |            2 | AGE 20/02/2026, AGO 20/03/2027                                                          |

## Annexe C — Couverture fonctionnelle

| Domaine                                                     | Parties                    |
| ----------------------------------------------------------- | -------------------------- |
| Abonnement, essai, devis                                    | A, B, C.11, O              |
| Équipe et rôles                                             | C.1                        |
| Agence mandante et en-têtes                                 | C.3, E.1, E.2              |
| Copropriété, lots, tantièmes généraux et spéciaux           | C.4, C.5, F.5              |
| Copropriétaires, indivision, locataire                      | C.6                        |
| Fonds et mouvements                                         | C.7, F.6, I, L.3, L.5, N.4 |
| Prestataires, contrats, factures                            | C.8, I, L.5, N.4           |
| Comptabilité                                                | C.9, I, N.6                |
| Documents                                                   | C.10, F.4, N.9             |
| Budget, répartition, appels par période                     | D, E.1, G.1, H.1           |
| Appels exceptionnels de travaux                             | F.5, F.6                   |
| Encaissements, avances, reçus, quittances                   | E, F.7, G.2, H.2, L.4      |
| Suivi mensuel                                               | E.2, M                     |
| Incident et imputation                                      | G.3, I.4                   |
| Assemblées, pouvoirs, règles de majorité 24/25/26/unanimité | F, N.9                     |
| Recouvrement (relances, pénalité, remise, échéancier)       | J                          |
| Appels automatiques                                         | L, N.11                    |
| Portail copropriétaire                                      | K, M                       |
| Clôture d'exercice                                          | N                          |

## Annexe D — Journal de test

| Étape   | OK / KO / Noté | Constaté (texte exact, montant affiché) | Capture |
| ------- | -------------- | --------------------------------------- | ------- |
| A.1     |                |                                         |         |
| A.2     |                |                                         |         |
| A.3     |                |                                         |         |
| B.1     |                |                                         |         |
| B.2     |                |                                         |         |
| C.1     |                |                                         |         |
| C.2     |                |                                         |         |
| C.3     |                |                                         |         |
| C.4     |                |                                         |         |
| C.5     |                |                                         |         |
| C.6     |                |                                         |         |
| C.7     |                |                                         |         |
| C.8     |                |                                         |         |
| C.9     |                |                                         |         |
| C.10    |                |                                         |         |
| C.11    |                |                                         |         |
| D.1     |                |                                         |         |
| D.2     |                |                                         |         |
| E.1     |                |                                         |         |
| E.2     |                |                                         |         |
| F.1–F.4 |                |                                         |         |
| F.5     |                |                                         |         |
| F.6     |                |                                         |         |
| F.7     |                |                                         |         |
| G.1     |                |                                         |         |
| G.2     |                |                                         |         |
| G.3     |                |                                         |         |
| H.1     |                |                                         |         |
| H.2     |                |                                         |         |
| I.1     |                |                                         |         |
| I.2     |                |                                         |         |
| I.3     |                |                                         |         |
| I.4     |                |                                         |         |
| I.5     |                |                                         |         |
| I.6     |                |                                         |         |
| I.7     |                |                                         |         |
| J.1     |                |                                         |         |
| J.2     |                |                                         |         |
| J.3     |                |                                         |         |
| J.4     |                |                                         |         |
| J.5     |                |                                         |         |
| K       |                |                                         |         |
| L.1     |                |                                         |         |
| L.2     |                |                                         |         |
| L.3     |                |                                         |         |
| L.4     |                |                                         |         |
| L.5     |                |                                         |         |
| M       |                |                                         |         |
| N.1     |                |                                         |         |
| N.2     |                |                                         |         |
| N.3     |                |                                         |         |
| N.4     |                |                                         |         |
| N.5     |                |                                         |         |
| N.6     |                |                                         |         |
| N.8     |                |                                         |         |
| N.9     |                |                                         |         |
| N.10    |                |                                         |         |
| N.11    |                |                                         |         |
| O       |                |                                         |         |

Chaque anomalie se consigne à part : page, action, résultat attendu, résultat
constaté, capture — modèle
[docs/workflows/BUG_REPORT_TEMPLATE.md](../workflows/BUG_REPORT_TEMPLATE.md).
