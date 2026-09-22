# Scénario de test — Les modules restants

Ce document couvre les modules d'ImmoTopia **qui n'ont pas encore de scénario
de test** : CRM, modèles de documents, maintenance, communication, newsletter,
portail locataire, portail propriétaire, gestion de l'agence, administration de
la plateforme, et les écrans Finance laissés de côté par le parcours chantier.

Il complète, sans les redoubler :

| Document existant                                                                            | Ce qu'il couvre déjà                                                                                               |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [SCENARIO_TEST_E2E_CHANTIER_VERS_LOCATION.md](SCENARIO_TEST_E2E_CHANTIER_VERS_LOCATION.md)   | Chantiers et leur financement, bascule au patrimoine, biens, baux, échéances, encaissements, comptabilité locative |
| [WORKFLOW_TEST_MODULE_PATRIMOINE_DEBUT_FIN.md](WORKFLOW_TEST_MODULE_PATRIMOINE_DEBUT_FIN.md) | Patrimoine : vue globale, performance, programmes de travaux, relevés de gérance                                   |
| [WORKFLOW_TEST_MODULE_SYNDIC_DEBUT_FIN.md](WORKFLOW_TEST_MODULE_SYNDIC_DEBUT_FIN.md)         | Syndic : copropriétés, lots, charges, assemblées, recouvrement, comptabilité                                       |

Rédigé le 22 septembre 2026 sur la branche `feat/finance-lot-0`, à partir du
code réel des écrans. Chaque libellé cité entre guillemets est celui affiché à
l'écran.

| Partie                                                              | Module                                                   | Compte utilisé       |
| ------------------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| [A](#partie-a--crm)                                                 | CRM : contacts, affaires, activités, calendrier          | Collaborateur        |
| [B](#partie-b--modèles-de-documents)                                | Modèles de documents                                     | Collaborateur        |
| [C](#partie-c--maintenance)                                         | Maintenance : prestataires, tickets, gestion             | Collaborateur        |
| [D](#partie-d--communication)                                       | Notifications e-mail et WhatsApp                         | Collaborateur        |
| [E](#partie-e--newsletter)                                          | Newsletter : listes, modèles, campagnes, pages publiques | Collaborateur        |
| [F](#partie-f--portail-locataire)                                   | Portail locataire                                        | Locataire            |
| [G](#partie-g--portail-propriétaire)                                | Portail propriétaire                                     | Propriétaire         |
| [H](#partie-h--gestion-de-lagence)                                  | Collaborateurs, invitations, paramètres, profil          | Collaborateur        |
| [I](#partie-i--administration-de-la-plateforme)                     | Agences, rôles et menus, statistiques, audit             | Super-administrateur |
| [J](#partie-j--les-écrans-laissés-de-côté-par-le-parcours-chantier) | Baux de terrain, importation, calendrier des visites     | Collaborateur        |
| [K](#partie-k--contrôles-transversaux)                              | Accès, langue, pannes, affichage mobile                  | Les quatre           |

---

## 0. Comment utiliser ce document

Pour chaque étape :

1. Lire « Cette page permet de faire ».
2. Faire, dans l'ordre, les actions de « Ce qu'on doit faire », avec les
   valeurs du jeu de données (section 2).
3. Vérifier « Résultat attendu » et consigner dans le journal de test
   (section 4).

Règles pour la personne — ou l'agent — qui pilote le navigateur :

- **Ne jamais lancer `npm run db:seed`** : il efface la base de démonstration.
- Toutes les données créées ici portent le préfixe `QA2`, pour ne pas les
  confondre avec celles du scénario chantier (préfixe `QA`) ni avec les données
  de démonstration.
- Trois états à distinguer : « Aucune donnée » (appel réussi, table vide),
  « Impossible de charger ces données » (appel en échec : lire le statut HTTP
  des requêtes vers `localhost:8001/api`), écran blanc (capture trop tôt).
- Un champ date Ant Design se remplit en cliquant dedans, en tapant
  `JJ/MM/AAAA`, puis `Entrée`. Un champ liste se remplit en cliquant, en tapant
  le début du libellé, puis `Entrée`.
- Le texte français **est** la clé de traduction du projet : un libellé qui
  s'affiche en anglais au milieu d'un écran français est une anomalie, sauf
  mention contraire ci-dessous.
- La date de référence est **J = 22/09/2026**. Les dates relatives (« J+3 »)
  se calculent à partir de là.

---

## 1. Préparation

### 1.1 Lancer l'application

1. Démarrer l'API (port 8001) puis le front (port 3000) : `npm run dev` à la
   racine, ou les entrées `api` puis `web` de `.claude/launch.json`.
2. Attendre que `http://localhost:8001/health` réponde `200`.
3. Ouvrir `http://localhost:3000/login`.

### 1.2 Se connecter

Quatre comptes sont nécessaires : ce document passe de l'un à l'autre. En mode
développement, le panneau « Comptes par tenant » de la page de connexion porte
deux boutons par ligne :

- **« Se connecter »** ouvre la session directement, sans passer par le champ
  de mot de passe. C'est le geste à utiliser pour dérouler ce document, et le
  seul moyen de changer de persona pour qui s'interdit de saisir un mot de
  passe.
- **« Utiliser »** se contente de pré-remplir le formulaire, pour qui veut voir
  les identifiants avant de valider.

Si ce panneau n'apparaît pas, c'est que `VITE_SHOW_DEMO_ACCOUNTS` n'est pas à
`true`.

| Rôle                                                                 | Compte                        | Mot de passe   | Utilisé dans        |
| -------------------------------------------------------------------- | ----------------------------- | -------------- | ------------------- |
| Collaborateur de l'agence (Kouassi N'Guessan, **Ivoire Résidences**) | `devaccrocs@gmail.com`        | `DevMick@2003` | Parties A à E, H, J |
| Locataire (Mariam Diomandé)                                          | `scolarflow@gmail.com`        | `DevMick@2003` | Partie F            |
| Propriétaire (Séraphin Koffi)                                        | `mickael.andjui.21@gmail.com` | `DevMick@2003` | Partie G            |
| Super-administrateur plateforme                                      | `admin@immobillier.com`       | `Admin@123456` | Partie I            |

Changer de compte suppose de se déconnecter, ou d'ouvrir une fenêtre de
navigation privée — c'est plus sûr pour comparer deux vues du même bail.

Identifiant d'agence utilisé dans toutes les adresses :
`385a1e76-ac08-4db5-9802-8b2ddfb1672b`. Dans la suite, `BASE` désigne
`http://localhost:3000/tenant/385a1e76-ac08-4db5-9802-8b2ddfb1672b`.

### 1.3 Relever les valeurs de départ

Avant toute création, noter :

- `BASE/crm/dashboard` : « Nouveaux leads », « Leads convertis »,
  « Affaires créées », « Affaires gagnées », « Actions en retard ».
- `BASE/crm/contacts` : nombre total affiché en bas de liste
  (« Affichage de X à Y sur **Z** contacts »).
- `BASE/crm/deals` : nombre d'affaires par colonne du pipeline.
- `BASE/maintenance` : nombre de tickets ; `BASE/admin/maintenance/vendors` :
  nombre de prestataires.
- `BASE/documents/templates` : nombre de modèles et lequel est « Par défaut ».
- `BASE/newsletter/lists` : listes existantes et leur nombre d'abonnés actifs —
  aucune ne doit être touchée par le test.
- `/admin/statistics` (compte super-administrateur) : « Total agences ».

---

## 2. Jeu de données

Un fil conducteur traverse les parties A à G : **une prospecte entre au CRM,
devient cliente, une panne est déclarée sur un logement loué, l'agence la
traite et la notifie, et la même affaire se relit ensuite depuis le portail de
la locataire puis depuis celui du propriétaire.**

Les contacts `QA2` ci-dessous sont des fiches CRM, créées pour le test. Les
portails (parties F et G), eux, se jouent avec les comptes de démonstration
existants — Mariam Diomandé et Séraphin Koffi — qui, eux, ont un vrai bail et
un vrai portefeuille derrière eux.

### 2.1 Les personnes

| Rôle dans le scénario                     | Nom                 | Email                          | Téléphone         |
| ----------------------------------------- | ------------------- | ------------------------------ | ----------------- |
| Prospecte, puis cliente au rôle Locataire | `QA2 Aya Traoré`    | `qa2.aya.traore@example.ci`    | `+225 0700002121` |
| Propriétaire bailleur                     | `QA2 Bakary Diallo` | `qa2.bakary.diallo@example.ci` | `+225 0700002122` |
| Acquéreur (2e affaire)                    | `QA2 Sekou Camara`  | `qa2.sekou.camara@example.ci`  | `+225 0700002123` |
| Collaborateur invité                      | —                   | `qa2.gestion@example.ci`       | —                 |

### 2.2 Les objets créés

| Objet                                   | Valeur                                                        |
| --------------------------------------- | ------------------------------------------------------------- |
| Affaire location                        | `Location` — budget `150 000` à `250 000` — Cocody            |
| Affaire achat                           | `Achat` — budget `25 000 000` à `40 000 000`                  |
| Relance calendrier                      | `QA2 Rappeler Aya pour la visite`                             |
| Prestataire maintenance                 | `QA2 Plomberie Ivoire`                                        |
| Ticket créé côté agence                 | `QA2 Fuite sous l'évier de la cuisine`                        |
| Ticket créé depuis le portail locataire | `QA2 Chauffe-eau en panne`                                    |
| Liste newsletter manuelle               | `QA2 Prospects Cocody`                                        |
| Liste newsletter dérivée                | `QA2 Propriétaires (lecture seule)`                           |
| Campagne newsletter                     | `QA2 Nouveaux biens — septembre`                              |
| Modèles de newsletter                   | `QA2 Modèle standard`, `QA2 Modèle sans lien`                 |
| Modèle de document                      | `QA2 Bail habitation`                                         |
| Bail de terrain                         | `QA2 Terrain Riviera, 800 m²`, bailleur `QA2 Mamadou Kouadio` |
| Agence jetable (partie I)               | `QA2 Agence jetable`                                          |

Devise affichée : `FCFA` (stockée `XOF`).

---

## Partie A — CRM

Menu **CRM**. Cinq écrans : Tableau de bord, Contacts, Affaires, Activités,
Calendrier.

### A.1 Créer la prospecte — formulaire complet

**Page** : `BASE/crm/contacts` puis « Nouveau contact » (`BASE/crm/contacts/new`).

#### Cette page permet de faire

Créer un contact personne ou entreprise, réparti sur six onglets : « Basique »,
« Identité », « Contact », « Professionnel », « CRM », « Consentements ».

#### Ce qu'on doit faire

1. Ouvrir `BASE/crm/contacts`, cliquer « Nouveau contact ».
2. Onglet **Basique** : « Type de contact » = `Personne`, « Prénom » = `QA2 Aya`,
   « Nom » = `Traoré`, « Email personnel » = `qa2.aya.traore@example.ci`,
   « Téléphone principal » = `0700002121` (indicatif `CI +225` par défaut),
   cocher « WhatsApp ».
3. **Sans remplir l'onglet « Contact »**, cliquer « Créer le contact ».
4. Lire le message d'erreur, aller à l'onglet **Contact**, renseigner
   « Commune » = `Cocody`, « Quartier/Zone » = `Angré 8e tranche`,
   « Canal de contact préféré » = `WhatsApp`.
5. Onglet **CRM** : « Source du lead » = `Site web`, « Niveau de maturité » =
   `Chaud`, « Score (0-100) » = `70`, « Priorité » = `Haute`. Laisser
   « Source (legacy) » **vide**.
6. Onglet **Consentements** : vérifier que les trois cases sont déjà cochées.
7. Cliquer « Créer le contact ».

#### Résultat attendu

1. À l'étape 3, la soumission est refusée avec un message qui **nomme l'onglet
   fautif** : « Champs invalides : … Vérifiez les onglets du formulaire ». Un
   refus muet, ou un bouton qui ne réagit pas, est une anomalie — c'est le bug
   corrigé que cette étape vérifie.
2. Le contact apparaît dans `BASE/crm/contacts`, statut « Prospect ».
3. La colonne « Téléphone » affiche `+225 0700002121`. Si elle reste vide alors
   que la fiche détail montre le numéro, c'est l'ancien champ `phone` qui est
   lu : anomalie à consigner.

> **À noter** : l'onglet « CRM » propose deux champs de source, « Source
> (legacy) » (texte libre) et « Source du lead » (liste). Les deux sont
> enregistrés séparément. Vérifier lequel ressort sur la fiche détail, sous
> « Source ».

### A.2 Créer le propriétaire — modale, et vérifier qu'elle repart vierge

**Page** : `BASE/crm/contacts`.

#### Ce qu'on doit faire

1. Cliquer « Nouveau contact » depuis la liste : la modale « Créer un nouveau
   contact » s'ouvre.
2. Saisir `QA2 Bakary` / `Diallo` / `qa2.bakary.diallo@example.ci` /
   `0700002122`, commune `Cocody`, puis valider.
3. Rouvrir aussitôt « Nouveau contact ».

#### Résultat attendu

1. Le second contact est créé.
2. **La modale rouverte est entièrement vide** : aucun champ ne garde les
   valeurs de Bakary Diallo. Un formulaire pré-rempli est l'anomalie ANO-22,
   corrigée le 20/09/2026 ; sa réapparition est un retour en arrière.

### A.3 Rôles, groupes et fiche contact

**Page** : `BASE/crm/contacts/:contactId` — ouvrir la fiche de `QA2 Bakary
Diallo` par l'icône « Voir les détails ».

#### Ce qu'on doit faire

1. Vérifier l'en-tête : badge « Prospect », boutons « Convertir » et
   « Modifier ».
2. Bloc « Rôles » : cliquer « Ajouter », choisir « Propriétaire (Owner) »,
   enregistrer.
3. Bloc « Groupes » : cliquer « Gérer », affecter le tag `QA2 Cocody`,
   enregistrer.
4. Bloc « Chronologie des activités » : cliquer « Ajouter », créer une activité
   de type `Appel`, intitulé `QA2 Premier échange`, date du jour.

#### Résultat attendu

1. Le rôle s'affiche avec le badge « Actif ».
2. Le tag apparaît dans le bloc « Groupes » et devient sélectionnable dans le
   filtre « Filtrer par tags: » de la liste des contacts.
3. L'activité apparaît en tête de chronologie.
4. Aucun bloc ne reste sur « Chargement… ». Les états vides attendus sont
   « Aucun rôle assigné », « Aucun groupe », « Aucune affaire associée »,
   « Aucune activité récente ».

### A.4 Convertir la prospecte en cliente

**Page** : fiche de `QA2 Aya Traoré`.

#### Ce qu'on doit faire

1. Cliquer « Convertir ».
2. Dans la boîte de dialogue, choisir le rôle « Locataire (Renter) », valider.

#### Résultat attendu

1. Le badge passe de « Prospect » (bleu) à « Client actif » (vert).
2. Le rôle « Locataire » apparaît dans le bloc « Rôles », badge « Actif ».
3. **Anomalie connue, à confirmer sans la corriger pendant le test** : cette
   boîte de dialogue est rédigée **en anglais** — « Convert Lead to Client »,
   « Cancel », « Convert to Client » — au milieu d'un écran entièrement
   français. La consigner telle quelle dans le journal.

### A.5 Créer les deux affaires

**Page** : `BASE/crm/deals` puis « Nouvelle affaire ».

#### Ce qu'on doit faire

1. Affaire 1 : « Type d'affaire » = `Location`, « Contact » = `QA2 Aya Traoré`,
   « Budget minimum (FCFA) » = `150000`, « Budget maximum (FCFA) » = `250000`,
   « Zone géographique (Commune) » = `Cocody`, « Type de bien » = `Appartement`.
2. Vérifier que la section « Critères spécifiques » ne se remplit qu'**après**
   le choix du type de bien : « Nombre de pièces » = `3`, « Surface (m²) » =
   `75`, « État du meublé » = `Non meublé`, cocher « Ascenseur » et « Parking ».
3. Valider par « Créer l'affaire ».
4. Affaire 2 : « Type d'affaire » = `Achat`, contact `QA2 Sekou Camara` (le
   créer au passage si nécessaire), budget `25000000` à `40000000`, « Type de
   bien » = `Terrain`, « Superficie (m²) » = `500`, « Type de terrain » =
   `Urbain`, cocher « Viabilisé (eau, électricité, etc.) ».
5. Garde-fou : rouvrir l'affaire 1 en modification, saisir un budget maximum
   **inférieur** au minimum, valider.

#### Résultat attendu

1. Tant qu'aucun type de bien n'est choisi, la section affiche « Sélectionnez un
   type de bien pour voir les critères disponibles ».
2. Les critères changent réellement selon le type de bien : un terrain ne
   propose pas « Ascenseur ».
3. À l'étape 5, le message « Le budget maximum doit être supérieur au budget
   minimum » bloque l'enregistrement.
4. La liste propose cinq types d'affaire (`Achat`, `Location`, `Vente`,
   `Gestion de biens`, `Mandat`) alors que le filtre de la liste des affaires
   n'en propose que deux (`Achat`, `Location`). Une affaire `Vente`, `Mandat` ou
   `Gestion de biens` reste donc introuvable par le filtre : c'est un écart réel
   au 22/09/2026, à consigner, pas à corriger.

### A.6 Le pipeline, et le contrôle des libellés de stade

**Page** : `BASE/crm/deals`, vue « Pipeline ».

#### Cette page permet de faire

Voir les affaires en colonnes par stade, en déplacer une par glisser-déposer,
basculer entre « Liste » et « Pipeline », exporter.

#### Ce qu'on doit faire

1. Vérifier que le pipeline n'affiche que quatre colonnes : « Nouveau »,
   « Qualifié », « Visite », « Négociation ». Les affaires gagnées et perdues
   n'y figurent pas.
2. Glisser l'affaire 1 de « Nouveau » vers « Qualifié », puis vers « Visite ».
3. Basculer sur « Liste » et relever l'orthographe de la colonne « Stade ».
4. Ouvrir la fiche de l'affaire 1 (`BASE/crm/deals/:dealId`) et **dérouler le
   sélecteur de stade**. Relever, une par une, les valeurs proposées et leur
   orthographe.
5. Depuis la fiche, passer l'affaire au stade « Gagné ».

#### Résultat attendu

1. Le déplacement est immédiat et persiste après rechargement.
2. **Point de contrôle principal** : comparer les libellés des trois écrans. La
   liste et le pipeline écrivent « Qualifié », « Négociation », « Gagné » avec
   leurs accents et connaissent sept stades, dont « Rendez-vous ». Le sélecteur
   de la fiche détail n'en propose que **six** — « Rendez-vous » manque — et
   écrit « Qualifie », « Negociation », « Gagne » sans accents. Consigner
   l'écart : il est réel dans le code au 22/09/2026.
3. Une affaire laissée au stade « Rendez-vous » depuis le kanban doit rester
   lisible sur sa fiche détail. Un sélecteur vide est la conséquence directe du
   point précédent.
4. Si un déplacement échoue avec « Erreur lors de la mise à jour du stade de
   l'affaire », recharger puis réessayer : c'est un conflit de version (deux
   écrans ouverts sur la même affaire), pas une panne.
5. Dans la vue liste, la colonne « Type » affiche la valeur brute
   (`ACHAT`, `LOCATION`) en majuscules, sans traduction : connu, à consigner.

### A.7 Activités et filtres

**Page** : `BASE/crm/activities`.

#### Ce qu'on doit faire

1. Cliquer « Nouvelle activité » : type `Visite`, contact `QA2 Aya Traoré`,
   intitulé `QA2 Visite appartement Angré`, date J, prochaine action J+3.
2. Filtrer par type en cliquant « Visite », puis revenir à « Tous les types ».
3. Cliquer « Afficher » les filtres avancés : filtrer par « Contact » =
   `QA2 Aya Traoré`, puis par « Collaborateur », puis par « Période »
   (J−7 → J+7).
4. Cliquer « Réinitialiser ».

#### Résultat attendu

1. L'activité apparaît en tête de la chronologie et sur la fiche du contact.
2. Chaque filtre réduit la liste ; le compteur « Affichage de X à Y sur Z
   activités » suit.
3. « Filtres réinitialisés » s'affiche et la liste complète revient.
4. **Fragilité à surveiller** : la liste déroulante « Collaborateur » est
   alimentée sans filet sur cet écran. Si elle échoue, c'est toute la page
   Activités qui tombe sur l'écran d'erreur, au lieu d'un simple sélecteur vide.
   Consigner le cas s'il se produit.

### A.8 Calendrier

**Page** : `BASE/crm/calendar`.

#### Cette page permet de faire

Voir les relances et les visites de biens en agenda ou en grille, reprogrammer
une relance par glisser-déposer, marquer un événement terminé, exporter.

#### Ce qu'on doit faire

1. Vérifier que la relance créée en A.7 (prochaine action J+3) apparaît.
2. Cliquer « Nouvelle relance » : intitulé `QA2 Rappeler Aya pour la visite`,
   date J+1.
3. Basculer entre « Agenda », « Mois », « Semaine », « Jour ».
4. Décocher puis recocher « Afficher les relances », puis « Mon calendrier ».
5. Glisser la relance de J+1 vers J+2.
6. Ouvrir l'événement, cliquer « Marquer comme terminé ».
7. Tenter de glisser une **visite de bien**, si la base en contient une.
8. Menu : « Exporter en CSV », puis « Revenir à aujourd'hui ».

#### Résultat attendu

1. Un seul bouton de création existe : « Nouvelle relance ». Deux boutons
   faisant la même chose seraient un retour en arrière.
2. Le glisser-déposer d'une relance affiche « Relance déplacée. » et persiste.
3. Le glisser-déposer d'une visite de bien affiche « Le déplacement d'une visite
   de bien n'est pas encore disponible. » — comportement attendu, pas une panne.
4. « Marquer comme terminé » grise ensuite le bouton.
5. Les vues « Mois », « Semaine » et « Jour » peuvent afficher un squelette de
   chargement une seconde : normal, la grille est chargée à la demande.
6. Le filtre « Nom du client » ne cherche que dans la période affichée. Un
   contact absent du résultat alors qu'il a un événement trois mois plus tard
   n'est **pas** une anomalie.
7. L'événement créé par « Nouvelle relance » est enregistré comme une tâche,
   quel que soit le type choisi dans le formulaire : le calendrier impose ce
   type. Le vérifier dans `BASE/crm/activities`.

### A.9 Exports

#### Ce qu'on doit faire

1. `BASE/crm/contacts` : « Exporter CSV », puis « Exporter Excel ».
2. `BASE/crm/deals` : « CSV », puis « Excel ».
3. Ouvrir les quatre fichiers.

#### Résultat attendu

1. Les fichiers se téléchargent et contiennent les contacts et affaires `QA2`.
2. Le statut exporté (`Prospect`, `Client actif`, `Archivé`) correspond à celui
   affiché à l'écran pour les mêmes lignes. Un écart entre l'écran et l'export
   est une anomalie : les deux libellés sont calculés à deux endroits différents
   du code.

### A.10 Retour au tableau de bord CRM

**Page** : `BASE/crm/dashboard`.

#### Ce qu'on doit faire

1. Comparer les cinq tuiles aux valeurs relevées en 1.3.
2. Cliquer chaque tuile et vérifier la destination :

| Tuile                 | Destination attendue                |
| --------------------- | ----------------------------------- |
| « Nouveaux leads »    | `crm/contacts?status=LEAD`          |
| « Leads convertis »   | `crm/contacts?status=ACTIVE_CLIENT` |
| « Affaires créées »   | `crm/deals`                         |
| « Affaires gagnées »  | `crm/deals?stage=WON`               |
| « Actions en retard » | `crm/activities?overdue=1`          |

3. Basculer « Ce mois » / « 30 derniers jours ».
4. Vérifier les cartes « Pipeline des affaires », « Évolution dans le temps »,
   « Plan de travail », « Performance de l'équipe ».

#### Résultat attendu

1. « Nouveaux leads » a augmenté de 3 (Aya, Bakary, Sekou), « Leads convertis »
   de 1 (Aya), « Affaires créées » de 2, « Affaires gagnées » de 1.
2. Chaque tuile cliquée arrive sur une liste **déjà filtrée**.
3. Si le tableau de bord affiche un message d'erreur en anglais mentionnant une
   agrégation non implémentée, c'est que l'appel serveur a échoué : lire le
   statut HTTP et le consigner — le message affiché n'est pas le bon.

---

## Partie B — Modèles de documents

Menu **Documents › Modèles de documents** : `BASE/documents/templates`.

### B.1 Lire l'existant

#### Cette page permet de faire

Gérer les modèles DOCX utilisés pour générer baux, quittances et relevés :
import, activation, modèle par défaut, suppression.

#### Ce qu'on doit faire

1. Ouvrir la page et relever les modèles présents, leur type et celui qui porte
   le badge « Par défaut ».
2. Utiliser « Filtrer par type » sur chacune des quatre valeurs : « Bail
   Habitation », « Bail Commercial », « Reçu de Loyer », « Relevé de Compte ».
3. Cliquer « Guide d'utilisation ».

#### Résultat attendu

1. Le filtre ramène la pagination à la page 1 : voulu.
2. Changer de page ne déclenche aucun appel réseau supplémentaire : la
   pagination est calculée dans le navigateur. Ce n'est pas une anomalie.
3. Le « Guide d'utilisation » ouvre un nouvel onglet. S'il affiche une page
   introuvable, consigner : le fichier statique attendu est
   `/docs/GUIDE_TENANT_MODELES_DOCUMENTS.md`.

### B.2 Importer un modèle

#### Ce qu'on doit faire

1. Cliquer « Ajouter un template ».
2. « Type de document » = `Bail Habitation`, « Nom du template » =
   `QA2 Bail habitation`.
3. **Test négatif** : choisir d'abord un fichier qui n'est pas un `.docx`
   (un PDF, une image).
4. Choisir ensuite un vrai `.docx` contenant au moins les variables
   `{{AGENCE_NOM}}` et `{{BAIL_LOYER_MENSUEL}}`, puis « Télécharger ».

#### Résultat attendu

1. À l'étape 3 : « Seuls les fichiers DOCX sont acceptés », et rien n'est
   envoyé.
2. À l'étape 4 : « Template ajouté avec succès ». Le modèle apparaît dans la
   liste, avec le nombre de placeholders détectés dans la colonne
   « Placeholders ».

### B.3 Activer, définir par défaut, supprimer

#### Ce qu'on doit faire

1. Sur `QA2 Bail habitation`, cliquer « Définir par défaut ».
2. Cliquer « Désactiver », puis « Activer ».
3. Générer un bail depuis `BASE/rental/leases` (fiche d'un bail existant,
   action de génération de document) et vérifier quel modèle est utilisé.
4. Supprimer `QA2 Bail habitation` en fin de test.

#### Résultat attendu

1. Le badge « Par défaut » (étoile dorée) se déplace sur le modèle `QA2`, et
   l'ancien modèle par défaut le perd. **Le noter : il faudra le remettre.**
2. Les messages « Template défini par défaut », « Template désactivé »,
   « Template activé » s'affichent.
3. Le document généré à l'étape 3 reprend bien le modèle `QA2` tant qu'il est
   par défaut et actif.
4. La suppression demande confirmation — « Le modèle ne sera plus proposé à la
   génération. Cette action est définitive. » — puis « Template supprimé avec
   succès ».
5. **Après le test** : remettre par défaut le modèle d'origine relevé en 1.3.
   Un modèle par défaut manquant casse la génération de baux et de quittances
   pour toute l'agence.

### B.4 Écran en échec

#### Ce qu'on doit faire

Couper l'API (arrêter le serveur du port 8001), recharger
`BASE/documents/templates`.

#### Résultat attendu

Un bloc d'erreur **persistant** affiche « Impossible de charger les modèles de
documents. ». Un simple message éphémère, ou une liste vide sans explication,
est une anomalie : le choix d'un bloc persistant est délibéré, pour ne pas
laisser croire qu'il n'y a aucun modèle.

---

## Partie C — Maintenance

Menu **Maintenance**. Trois entrées : « Tickets de l'agence », « Mes demandes »,
« Prestataires ».

> **Deux écrans portent le mot « Maintenance », et ce ne sont pas les mêmes.**
> `BASE/maintenance` — « Mes demandes » — est l'écran du **collaborateur**
> d'agence. `/tenant/maintenance`, sans identifiant d'agence dans l'adresse, est
> l'écran du **locataire** dans son portail (partie F). Les deux créent des
> tickets, mais pas de la même façon, et n'affichent pas les mêmes mots pour les
> mêmes priorités. Ne pas les confondre : c'est la principale source d'erreur de
> lecture sur ce module.

### C.1 Prestataires

**Page** : `BASE/admin/maintenance/vendors` (menu **Maintenance ›
Prestataires**).

#### Ce qu'on doit faire

1. Cliquer « Nouveau prestataire » : « Nom » = `QA2 Plomberie Ivoire`,
   « Téléphone » = `+225 0700002130`, « Email » = `qa2.plomberie@example.ci`,
   « Adresse » = `Marcory Zone 4`, « Spécialités » = `Plomberie` puis
   `Climatisation` (les taper et valider, elles deviennent des étiquettes).
2. Vérifier qu'il n'y a **pas** de champ « Statut » à la création.
3. Enregistrer, puis rouvrir la fiche par « Modifier » : le champ « Statut »
   apparaît. Passer le prestataire à `Inactif`, enregistrer, puis le remettre
   `Actif`.
4. Chercher `QA2` dans « Rechercher par nom ou spécialité... ».
5. Filtrer par statut « Actifs » puis « Inactifs ».
6. Tenter un enregistrement avec un nom d'une seule lettre et un e-mail
   `pas-un-email`.

#### Résultat attendu

1. Le prestataire apparaît avec ses deux spécialités en étiquettes, statut
   « Actif », et le compteur « Total: {n} prestataires » augmente de 1.
2. Le nom est refusé en dessous de deux caractères ; l'e-mail mal formé est
   refusé.
3. **À savoir avant de cliquer** : l'action de suppression de cet écran est une
   **suppression définitive**, pas une désactivation, malgré l'existence d'un
   statut « Inactif ». Le texte de confirmation le dit : « Cette action est
   irréversible. Le prestataire sera supprimé de manière permanente. » Pour
   retirer un prestataire du jeu sans perdre son historique, passer par
   « Modifier » › Statut `Inactif`.

### C.2 Créer un ticket côté agence

**Page** : `BASE/maintenance` puis « Nouveau ticket » (`BASE/maintenance/new`).

#### Ce qu'on doit faire

1. Ouvrir `BASE/maintenance` et relever « Total: {n} tickets ».
2. Essayer le filtre « Filtrer par propriété ».
3. Cliquer « Nouveau ticket ».
4. « Propriété » : choisir un bien **loué**. Observer le champ « Bail ».
5. « Titre » = `QA2 Fuite sous l'évier de la cuisine`, « Catégorie » =
   `Plomberie`, « Priorité » = `Élevée`, « Description » = `L'évier de la
cuisine goutte en continu depuis trois jours, le placard est mouillé.`,
   « Détails de localisation » = `Cuisine, meuble sous évier`.
6. Joindre deux images, puis créer le ticket.
7. Tester les bornes : un titre de deux caractères, une description de cinq
   caractères.

#### Résultat attendu

1. **Le filtre « Filtrer par propriété » est vide** : aucune option n'y est
   jamais chargée. C'est un champ mort à l'écran, à consigner.
2. Seuls les biens au statut loué sont proposés. Sur un bien sans bail actif,
   l'avertissement « ⚠️ Cette propriété n'a pas de bail actif… » apparaît et la
   création est refusée.
3. S'il n'existe qu'un seul bail actif, le champ « Bail » se remplit seul et se
   verrouille, avec l'explication « Le bail actif a été sélectionné
   automatiquement ».
4. Le titre exige 3 à 200 caractères, la description 10 à 5 000.
5. « Ticket créé avec succès ».
6. **Point de contrôle sur les pièces jointes** : ici, le ticket est créé
   d'abord, puis chaque fichier est envoyé séparément. Si un fichier échoue, le
   message doit **nommer le fichier en échec** et inviter à le rajouter depuis
   le ticket — pas faire échouer le ticket entier. Pour le vérifier, tenter un
   fichier de plus de 5 Mo parmi deux fichiers valides.

### C.3 Modifier, commenter, annuler

**Pages** : `BASE/maintenance/:ticketId` et `.../edit`.

#### Ce qu'on doit faire

1. Ouvrir le ticket `QA2`, lire « Historique des statuts », « Pièces jointes »,
   « Commentaires ».
2. Ajouter un commentaire, « Envoyer ».
3. Cliquer « Modifier » : changer la priorité en `Urgente`, enregistrer.
4. Vérifier que la propriété et le bail ne sont pas modifiables.
5. Faire passer le ticket « En cours » depuis la vue gestionnaire (C.4), puis
   revenir sur `.../edit`.

#### Résultat attendu

1. Le commentaire apparaît immédiatement, daté et signé.
2. La modification n'est possible que tant que le ticket est **« Déclaré »**.
   Une fois passé « En cours », l'écran affiche « Modification impossible » /
   « Seuls les tickets avec le statut 'Déclaré' peuvent être modifiés. »
3. Le bandeau rappelle ce qui est modifiable : titre, description, catégorie,
   priorité, localisation.
4. « Annuler le ticket » n'est proposé qu'au statut « Déclaré ».

### C.4 Traiter le ticket en gestionnaire

**Page** : `BASE/admin/maintenance/tickets` (menu **Maintenance › Tickets de
l'agence**).

#### Cette page permet de faire

Voir tous les tickets de l'agence, les filtrer, et ouvrir la fiche de gestion
où l'on affecte un prestataire et où l'on fait avancer le statut.

#### Ce qu'on doit faire

1. Régler les filtres « Filtrer par statut » = `Déclaré`, « Filtrer par
   priorité » = `Urgente`, et une plage de dates.
2. **Observer la fenêtre réseau** : compter les appels pendant qu'on change les
   filtres, puis au clic sur « Appliquer les filtres ».
3. Changer de page dans la pagination.
4. Ouvrir le ticket `QA2` par l'icône « Voir les détails ».
5. Dérouler « Statut » **sans rien choisir** et relever les valeurs proposées.
6. « Statut » = `En cours`, enregistrer.
7. « Prestataire assigné » = `QA2 Plomberie Ivoire`, « Statut » = `Assigné`,
   « Notes de résolution » = `Intervention programmée le {J+1}.`, enregistrer.
8. Ajouter un commentaire côté gestionnaire.
9. Passer le ticket en `Résolu`, puis rouvrir sa fiche.

#### Résultat attendu

1. **Point de contrôle réseau** : changer un filtre ne doit déclencher **aucun**
   appel ; seul « Appliquer les filtres » en déclenche un, et un seul. Deux
   appels pour un clic sont une régression du correctif de double interrogation.
2. La pagination, elle, s'applique immédiatement : c'est voulu.
3. **Le sélecteur ne propose que les étapes atteignables.** Depuis « Déclaré » :
   « Déclaré », « En cours », « Annulé » — ni « Assigné », ni « Résolu ». Un
   ticket s'affecte donc après l'avoir pris en charge, jamais avant : c'est
   l'ordre du parcours, et l'écran ne propose plus de le contourner. Sur un
   ticket « Résolu » ou « Annulé », le sélecteur est grisé, avec la mention
   « Ce ticket est arrivé au bout de son parcours : son statut ne change
   plus. »
4. Le prestataire choisi apparaît dans la colonne « Prestataire » de la liste et
   sur la fiche, avec son téléphone.
5. Chaque changement de statut ajoute une ligne dans « Historique des statuts »,
   visible aussi depuis la vue collaborateur du même ticket.
6. Les commentaires du gestionnaire et ceux du collaborateur apparaissent dans
   le même fil.
7. Les pièces jointes du ticket s'affichent en vignettes. Une vignette cassée
   signifie que le fichier n'est pas servi : relever le statut de la requête
   vers `localhost:8001/uploads/...`.

### C.5 Contrôle d'accès

#### Ce qu'on doit faire

1. Avec le compte collaborateur `QA2` créé en H.3 (rôle « Agent tenant »),
   ouvrir `BASE/admin/maintenance/vendors` **en tapant l'adresse à la main**.

#### Résultat attendu

1. Si l'entrée « Prestataires » n'apparaît pas dans son menu mais que la page
   s'ouvre quand même, c'est que seul le menu filtre l'accès : **le contrôle
   doit venir du serveur**. Lire le statut HTTP de l'appel. Une page qui
   s'affiche avec des données est une faille à consigner en priorité ; une page
   qui s'ouvre mais affiche une erreur d'autorisation est acceptable, quoique
   perfectible.
2. Cette vérification est reprise plus largement en K.1.

---

## Partie D — Communication

Menu **Communication**. Trois écrans : notifications e-mail, notifications
WhatsApp, message de groupe WhatsApp.

> **Avant de commencer — ce qui part vraiment.** En local, le SMTP **est**
> configuré dans `packages/api/.env` : tout envoi d'e-mail déclenché par
> l'application part réellement, depuis le compte d'envoi de production. Aucune
> variable WhatsApp n'est en revanche configurée : tout envoi WhatsApp échouera,
> et c'est le comportement attendu de ce scénario.

### D.1 Notifications e-mail — configuration

**Page** : `BASE/communication/email-notifications`.

#### Cette page permet de faire

Activer ou couper chaque e-mail déclenché par l'application, et personnaliser
son sujet et son corps HTML par destinataire. Cette page **n'envoie rien** :
elle ne fait que régler.

#### Ce qu'on doit faire

1. Ouvrir la page ; lire le bandeau « Gérez les événements déclencheurs et
   personnalisez les templates d'emails (sujet et corps). Les variables sont
   remplacées à l'envoi. Canal : Email uniquement. »
2. Dans « Choisir un événement déclencheur », prendre **« Nouveau ticket de
   maintenance »**.
3. Dans « Destinataires pour cet événement », cliquer « Agence (admins) ».
4. Déplier « Template par défaut (modèle) », lire « Sujet par défaut : » et
   « Corps HTML par défaut : », puis cliquer « Utiliser ce modèle dans les
   champs ci-dessous ».
5. Remplacer le sujet par `QA2 Nouveau ticket — {{ticketTitle}}`.
6. Dans « Variables pour cet événement », cliquer une variable et vérifier
   qu'elle s'insère dans le corps.
7. Cocher un autre destinataire dans « Appliquer ce template à d'autres
   destinataires », puis « Enregistrer ».
8. Dans le tableau du bas, basculer l'interrupteur « Activer » d'une ligne,
   puis le remettre.
9. Cliquer « Réinitialiser au modèle par défaut ».

#### Résultat attendu

1. Tant qu'aucun destinataire n'est choisi : « Cliquez sur un destinataire
   ci-dessus pour afficher et modifier son template. »
2. À l'étape 7 : « Template enregistré pour 2 destinataire(s). »
3. Aux étapes 8 : « Notification activée » / « Notification désactivée ».
4. À l'étape 9 : « Template réinitialisé », et le sujet `QA2` disparaît.
5. Le sujet et le corps n'ont **aucun champ obligatoire** : enregistrer à vide
   est permis et signifie « reprendre le modèle par défaut ». Ce n'est pas une
   anomalie.
6. La liste des événements couvre bien les six familles : maintenance,
   paiements et dépôts, baux et échéances, CRM, syndic, patrimoine.

### D.2 Notifications e-mail — vérifier qu'un envoi part vraiment

Cette étape est la seule qui envoie réellement un e-mail. **Utiliser une
adresse dont on relève la boîte.**

#### Ce qu'on doit faire

1. Vérifier que l'événement « Nouveau ticket de maintenance » est **activé**
   pour le destinataire « Agence (admins) ».
2. Créer un ticket : soit côté agence (étape C.2), soit depuis le portail
   locataire (étape F.4).
3. Relever la boîte du destinataire.

#### Résultat attendu

1. L'e-mail arrive, avec le sujet configuré et les variables remplacées (pas de
   `{{ticketTitle}}` visible dans le message reçu).
2. Si l'e-mail n'arrive pas, lire les journaux de l'API : l'écran de
   configuration ne rapporte jamais l'échec d'un envoi.

### D.3 Notifications WhatsApp — configuration

**Page** : `BASE/communication/whatsapp-notifications`.

#### Ce qu'on doit faire

1. Lire le bandeau « Message initié par l'entreprise (Sandbox / production) ».
2. Choisir l'événement « Nouveau ticket de maintenance (agence) ».
3. Saisir un message personnalisé :
   `QA2 Bonjour {{tenantName}}, votre ticket {{ticketTitle}} est enregistré.`
4. Cliquer une variable dans « Variables pour cet événement (cliquez pour
   insérer) ».
5. Déplier « Template Twilio (message initié par l'entreprise) » et saisir un
   « Content SID (Twilio) » manifestement faux : `PAS-UN-SID`, puis un
   « Mapping des variables (JSON) » invalide : `{"1":`.
6. Cliquer « Enregistrer ».
7. Cliquer « Réinitialiser au message par défaut ».

#### Résultat attendu

1. La configuration s'enregistre : cet écran ne parle qu'à la base, aucun
   message n'est envoyé.
2. **Point de contrôle** : ni le « Content SID » ni le JSON de mapping ne sont
   validés à la saisie. Un SID au mauvais format et un JSON tronqué sont
   acceptés sans un mot. Ce n'est découvert qu'au moment d'un envoi réel.
   Le consigner : c'est la principale faiblesse de cet écran.
3. Le champ de message est en texte simple : le HTML n'y est pas interprété.

### D.4 Message de groupe WhatsApp — les garde-fous, puis l'échec attendu

**Page** : `BASE/communication/whatsapp-group-message`.

#### Cette page permet de faire

Composer un message libre — texte mis en forme et image — et l'envoyer au
groupe WhatsApp configuré côté serveur.

#### Ce qu'on doit faire

1. Vérifier que le bouton « Envoyer au groupe » est **désactivé** sur une page
   vierge.
2. Taper un texte, puis utiliser « Gras », « Italique », « Barre », « Code »,
   « Emojis », « Liste » et vérifier les marqueurs insérés (`*gras*`,
   `_italique_`, `~barre~`).
3. Vérifier le compteur « {n} caracteres ».
4. « Image » : choisir un PDF → message attendu « Veuillez choisir une image ».
5. « Image » : choisir un GIF → « Format non supporte. Utilisez JPEG ou PNG ».
6. « Image » : choisir un JPEG de plus de 5 Mo → « Image trop volumineuse
   (max 5MB) ».
7. « Image » : choisir un JPEG valide → l'aperçu « Image jointe » apparaît ;
   cliquer « Retirer l image » et vérifier qu'il disparaît.
8. Remettre une image valide et cliquer « Envoyer au groupe ».

#### Résultat attendu

1. Les points 1 à 7 se vérifient **sans réseau** : ce sont des contrôles du
   navigateur.
2. À l'étape 8, l'envoi échoue avec un **400** et le message
   `WHATSAPP_GROUP_BROADCAST_TO non configure`. C'est le résultat attendu tant
   qu'aucune destination de groupe n'est configurée. Un écran blanc, une erreur
   500 ou un faux succès sont des anomalies.
3. Si la destination était configurée mais pas le fournisseur, le message
   deviendrait `Provider WhatsApp non configure`.
4. **À signaler** : l'image est écrite sur le disque du serveur
   (`uploads/whatsapp/group-broadcast/…`) **avant** l'échec de l'envoi. Répéter
   le test laisse des fichiers orphelins. Le mentionner dans le journal, ne pas
   chercher à les nettoyer depuis l'interface.

---

## Partie E — Newsletter

Menu **Communication › Newsletter**. Trois écrans d'agence — listes, campagnes,
modèles — et trois pages publiques : inscription, confirmation, désinscription.

> **Avertissement, à lire avant de cliquer « Envoyer ».** Le SMTP local est
> celui de production : une campagne envoyée part réellement, à **tous** les
> abonnés actifs de la liste choisie. Ne jamais lancer une campagne sur une
> liste dérivée (`Propriétaires`, `Locataires`, `Contacts CRM`) : elle
> s'adresserait aux vraies personnes de la base de démonstration. Toute cette
> partie se joue sur une liste manuelle `QA2` contenant **une seule adresse,
> celle du testeur**.

### E.1 Créer la liste

**Page** : `BASE/newsletter/lists`.

#### Ce qu'on doit faire

1. Cliquer « Nouvelle liste ».
2. « Nom » = `QA2 Prospects Cocody`, « Type » = `Manuelle (import, ajout
manuel)`, « Double opt-in » = `Oui`.
3. Créer, puis ouvrir la liste.
4. Cliquer « Ajouter des contacts (recherche CRM) » et ajouter `QA2 Aya
Traoré`.
5. Cliquer « Importer CSV » et déposer un fichier de deux lignes avec les
   colonnes `email` et `name`, dont **l'adresse réelle du testeur**.
6. Cliquer « Exporter CSV ».
7. Retirer un abonné avec l'action « Retirer ».

#### Résultat attendu

1. La carte de la liste affiche le tag « Manuelle », le tag « Double opt-in »,
   et les trois compteurs « Total », « Actifs », « Désabonnés ».
2. **Point de contrôle important** : les abonnés ajoutés par la recherche CRM
   et par l'import CSV apparaissent directement au statut « Actif », **pas**
   « En attente », malgré le double opt-in. C'est voulu : le double opt-in ne
   s'applique qu'au formulaire public. Une lecture contraire de l'écran serait
   une erreur d'interprétation, pas un bug.
3. L'export CSV se télécharge. Si rien ne se passe, vérifier le blocage des
   téléchargements par le navigateur avant de conclure à une panne.

### E.2 Liste dérivée — lire sans envoyer

#### Ce qu'on doit faire

1. Créer une seconde liste : « Nom » = `QA2 Propriétaires (lecture seule)`,
   « Type » = `Propriétaires (avec accord newsletter)`.
2. L'ouvrir et lire le nombre de destinataires potentiels.
3. Cliquer « Exporter CSV (destinataires actuels) ».
4. **Ne pas** créer de campagne sur cette liste.

#### Résultat attendu

1. Le texte affiché annonce « Liste dérivée : {n} destinataire(s) potentiel(s)…
   Les abonnés sont résolus à l'envoi de chaque campagne. »
2. Le « Type » n'est plus modifiable en édition, et l'interrupteur « Double
   opt-in » disparaît : il ne concerne que les listes manuelles.
3. L'export donne la liste des propriétaires ayant consenti. Vérifier qu'aucun
   contact sans consentement n'y figure.

### E.3 Modèle de newsletter

**Page** : `BASE/newsletter/templates`.

#### Ce qu'on doit faire

1. Cliquer « Nouveau template », « Nom » = `QA2 Modèle standard`.
2. Laisser le HTML proposé par défaut, qui contient déjà `{{prenom}}`,
   `{{contenu}}` et `{{lien_desinscription}}`.
3. Enregistrer, puis créer un second modèle `QA2 Modèle sans lien` dont on
   **supprime** la ligne du lien de désinscription.
4. Vider le champ « Nom », puis le champ « HTML », et tenter d'enregistrer.

#### Résultat attendu

1. Les messages « Nom requis » et « Contenu requis » bloquent l'enregistrement.
2. **Le second modèle, sans lien de désinscription, est accepté.** C'est un
   écart réel : le formulaire de campagne, lui, exige ce lien. Le consigner —
   un modèle sans lien de désinscription ne se révèle qu'au moment de rédiger
   la campagne.
3. La colonne « Aperçu » montre le texte du HTML, tronqué à 80 caractères.

### E.4 Campagne — la validation du lien de désinscription

**Page** : `BASE/newsletter/campaigns`.

#### Ce qu'on doit faire

1. Cliquer « Nouvelle campagne ».
2. « Liste de diffusion » = `QA2 Prospects Cocody`, « Template (optionnel) » =
   vide, « Sujet » = `QA2 Nouveaux biens — septembre`.
3. Dans « Corps du message (HTML) », écrire un texte **sans**
   `{{lien_desinscription}}`.
4. Observer le bouton de validation.
5. Ajouter `<a href="{{lien_desinscription}}">Se désabonner</a>` à la fin.
6. Enregistrer, puis cliquer « Aperçu ».
7. Cliquer « Planifier », choisir J+1 à 09:00, valider.
8. Cliquer « Annuler » sur la campagne planifiée.

#### Résultat attendu

1. Aux étapes 3-4 : l'alerte « Le lien de désinscription est obligatoire » est
   visible et le bouton d'enregistrement **reste désactivé**.
2. Après l'étape 5, l'enregistrement passe.
3. L'aperçu s'ouvre dans un cadre isolé : le HTML y est rendu inerte, aucun
   script ne s'exécute. C'est voulu.
4. Le statut suit la manœuvre : « Brouillon » → « Planifiée » → « Annulée ».
5. Le sélecteur de dates refuse les dates passées.

### E.5 Envoyer la campagne — et lire le vrai statut

#### Ce qu'on doit faire

1. Vérifier une dernière fois que `QA2 Prospects Cocody` ne contient que
   l'adresse du testeur.
2. Ouvrir la campagne `QA2` en brouillon, cliquer « Envoyer », confirmer.
3. Recharger la page et lire le tag de statut **et** la colonne
   « Statistiques ».
4. Relever la boîte de réception.

#### Résultat attendu

1. Le message de confirmation annonce l'envoi. **Ce message ne prouve rien** :
   il s'affiche même si tous les envois ont échoué.
2. La vérité est dans la ligne du tableau, après rechargement :
   - « Envoyée » avec « Envoyés: 1 » → l'envoi a réussi ;
   - « Échec » → aucun destinataire n'a reçu le message.
     Consigner la valeur lue, pas le message de confirmation.
3. L'e-mail reçu contient un lien « Se désabonner » fonctionnel.
4. Aucun message WhatsApp n'est tenté, faute de fournisseur configuré : ni
   erreur, ni trace à l'écran. Normal.

### E.6 Les trois pages publiques

Ces pages s'ouvrent **sans être connecté** — idéalement dans une fenêtre de
navigation privée.

#### Ce qu'on doit faire

1. Ouvrir `http://localhost:3000/newsletter/subscribe` **sans jeton**.
2. Revenir sur la liste `QA2 Prospects Cocody`, déplier « Formulaire
   d'inscription publique », copier le lien affiché et l'ouvrir.
3. S'inscrire avec **une adresse réelle du testeur** (cette soumission envoie
   un vrai e-mail).
4. Ouvrir le lien de confirmation reçu par e-mail.
5. Recharger la page de confirmation avec le **même** jeton.
6. Depuis l'e-mail de campagne reçu en E.5, ouvrir le lien « Se désabonner »,
   cocher « Me désabonner de toutes les newsletters de cet organisme », puis
   « Confirmer la désinscription ».
7. Rouvrir ce même lien de désinscription.

#### Résultat attendu

1. Sans jeton : « Lien d'inscription invalide. Utilisez le lien fourni dans
   l'invitation. »
2. Après inscription : « ✓ Un email de confirmation vous a été envoyé. Cliquez
   sur le lien pour valider votre inscription. » L'abonné apparaît « En
   attente » dans la liste — c'est ici, et seulement ici, que le double opt-in
   se manifeste.
3. Après confirmation : « Inscription confirmée », et l'abonné passe « Actif ».
4. Au second passage sur le même jeton : « Vous êtes déjà inscrit à cette
   newsletter. » ou « Lien invalide ou expiré. » — consigner lequel.
5. Après désinscription : « Désinscription effectuée », l'abonné passe
   « Désabonné » dans la liste et le compteur « Désabonnés » augmente.
6. Au second passage : « Ce lien de désinscription est invalide ou a déjà été
   utilisé. Utilisez le lien présent dans un email plus récent. »

> **À savoir avant de chercher un lien de désinscription** : il n'en existe pas
> de permanent par abonné. Le jeton est créé pour chaque destinataire **au
> moment de l'envoi d'une campagne**. Sans campagne envoyée, il est impossible
> de tester la désinscription — c'est pourquoi E.5 précède E.6.

### E.7 Nettoyage

1. Supprimer la campagne `QA2`, les deux modèles `QA2` et les deux listes
   `QA2`. La suppression d'une liste supprime aussi ses abonnés, sans retour
   possible.
2. Ne pas toucher aux listes et campagnes qui ne portent pas le préfixe `QA2`.

---

## Partie F — Portail locataire

Se déconnecter et se reconnecter avec `scolarflow@gmail.com` /
`DevMick@2003` (Mariam Diomandé). L'adresse de base devient
`http://localhost:3000/tenant`, **sans identifiant d'agence**.

> Ce portail est conçu pour le téléphone : quatre onglets en bas — « Accueil »,
> « Payer », « Incidents », « Mon bail » — et pas de barre latérale. Le tester
> dans une fenêtre étroite (375 px) est plus fidèle que sur un grand écran.
>
> **Deux écrans n'ont aucun lien dans la navigation** : `/tenant/deposit` et
> `/tenant/documents`. Il faut taper leur adresse. C'est un manque à consigner,
> pas une panne.

### F.1 Accueil

**Page** : `/tenant`.

#### Ce qu'on doit faire

1. Lire la carte « Informations du bail » : Adresse, Loyer mensuel, Charges,
   Date de début, Date de fin, Statut.
2. Lire les trois tuiles : « Retard des échéances », « Prochaine échéance »,
   « Dépôt de garantie ».
3. Lire « Paiements récents » et « Résumé maintenance ».

#### Résultat attendu

1. Les montants correspondent au bail réel de ce compte. Les croiser avec la
   fiche du même bail vue côté agence (`BASE/rental/leases`) : **un écart entre
   les deux vues est une anomalie majeure**.
2. Un bail sans date de fin affiche « Non définie ».
3. La tuile de retard accorde bien le singulier et le pluriel : « 1 échéance en
   retard », « 3 échéances en retard », « Aucune échéance en retard ».

### F.2 Mon bail

**Page** : `/tenant/lease`.

#### Ce qu'on doit faire

1. Parcourir la fiche : Numéro de bail, Adresse, dates, Loyer mensuel, Charges,
   Dépôt de garantie, Fréquence de facturation, Jour d'échéance, Notes.
2. Lire les cartes « Locataire principal », « Propriétaire », « Co-locataires »
   si elles existent.
3. Dans « Documents », télécharger un document de chaque type présent.

#### Résultat attendu

1. Le jour d'échéance se lit en clair : « Le 5 de chaque mois ».
2. Les documents sont groupés par type — Contrat de bail, Avenant, Quittance de
   loyer, Reçu de dépôt, Relevé, Autre.
3. Le fichier téléchargé s'ouvre, et **son extension correspond à son contenu**
   (un PDF ne doit pas arriver nommé `.docx`).
4. S'il n'y a rien : « Aucun document disponible ».

### F.3 Payer — échéances, historique, relevé

**Page** : `/tenant/payments`.

#### Ce qu'on doit faire

1. Onglet « Échéances » : lire les quatre tuiles — « Total échéances »,
   « Payées », « En attente », « En retard ». Filtrer par « Statut », puis par
   période, puis « Réinitialiser ».
2. Ouvrir « Détails » sur une échéance.
3. Onglet « Historique des paiements » : filtrer par méthode, déplier une ligne
   pour voir les allocations.
4. Onglet « Mon relevé » : lire les colonnes Date, Nature, Libellé, Facturé,
   Réglé, Solde après.
5. Cliquer « Déclarer un paiement » sur une échéance due : montant partiel,
   méthode `Mobile Money`, référence `QA2-MM-0001`, joindre un justificatif.

#### Résultat attendu

1. Le solde d'une échéance partiellement réglée est cohérent : montant total −
   payé.
2. La déclaration part et le paiement apparaît « En attente » : **le locataire
   déclare, il ne valide pas**. Vérifier ensuite côté agence
   (`BASE/rental/payments`) que le paiement s'y présente bien pour validation.
3. « Mon relevé » est en lecture seule et se termine sur le même solde que
   celui du compte tiers vu côté agence.
4. Si le compte n'est pas relié : « Aucun compte rattaché » / « Votre profil
   n'est pas encore relié à un compte locataire. » — à consigner, ce n'est pas
   normal pour un locataire en place.

### F.4 Incidents — déclarer une panne

**Page** : `/tenant/maintenance`.

#### Ce qu'on doit faire

1. Lire les quatre tuiles : Total tickets, Ouverts, En cours, Résolus.
2. Cliquer « Nouvelle demande » : « Titre » = `QA2 Chauffe-eau en panne`,
   « Catégorie » = `Plomberie`, « Priorité » = `Haute`, description complète,
   « Détails de localisation » = `Salle de bain`.
3. Joindre deux photos, puis un fichier PDF, puis une image de plus de 5 Mo.
4. Créer le ticket.
5. Ouvrir « Détails » : lire les photos, ajouter un commentaire.
6. Retourner côté agence (autre fenêtre, compte collaborateur) sur
   `BASE/admin/maintenance/tickets` et retrouver ce ticket.

#### Résultat attendu

1. Le PDF est refusé : « Vous ne pouvez télécharger que des images! » ; le
   fichier trop lourd : « Le fichier doit être inférieur à 5MB! »
2. **Point de contrôle** : ici, ticket et photos partent en **un seul envoi**,
   contrairement à l'écran d'agence (C.2) qui crée d'abord le ticket puis envoie
   les fichiers un par un. Le vérifier dans l'onglet réseau : une seule requête
   de création. Deux comportements différents pour le même besoin : à consigner.
3. **Écart de vocabulaire à consigner** : la priorité s'appelle ici « Basse /
   Moyenne / Haute / Urgente », alors que l'écran d'agence dit « Faible /
   Moyenne / Élevée / Urgente » — pour exactement les mêmes valeurs. Le ticket
   créé « Haute » ici doit se lire « Élevée » côté agence.
4. Le ticket apparaît immédiatement dans la liste de l'agence, et le
   commentaire du locataire dans le même fil que ceux du gestionnaire.
5. L'e-mail de notification configuré en D.1 doit partir à ce moment précis.

### F.5 Les deux écrans sans lien

#### Ce qu'on doit faire

1. Taper `/tenant/deposit` dans la barre d'adresse.
2. Taper `/tenant/documents`.

#### Résultat attendu

1. `/tenant/deposit` affiche quatre tuiles — Montant cible, Montant collecté,
   Montant retenu, Montant disponible — et l'historique des mouvements
   (Collecte, Mise en retenue, Libération, Remboursement, Confiscation,
   Ajustement). Les montants doivent correspondre à l'onglet « Dépôt de
   garantie » du même bail côté agence.
2. `/tenant/documents` liste les documents par type, avec un filtre et un
   bouton « Télécharger » désactivé quand aucun fichier n'est attaché.
3. Aucun des deux n'est atteignable depuis les onglets du portail : le
   consigner.

---

## Partie G — Portail propriétaire

Se reconnecter avec `mickael.andjui.21@gmail.com` / `DevMick@2003`
(Séraphin Koffi). Adresse de base : `http://localhost:3000/owner`.

Cinq onglets : « Accueil », « Biens », « Revenus », « Incidents », « Plus »
(Documents, Rapports, Préférences).

> Un compte qui appartient à une agence reste un collaborateur, même s'il porte
> aussi une fiche propriétaire : le portail propriétaire ne s'ouvre qu'avec un
> compte **sans rattachement d'agence**. Si l'application affiche le tableau de
> bord de l'agence au lieu du portail, c'est ce cumul qu'il faut vérifier avant
> de conclure à un bug.

### G.1 Accueil et portefeuille

#### Ce qu'on doit faire

1. `/owner` : relever les huit tuiles — Total propriétés, Louées, Disponibles,
   En maintenance, Taux d'occupation, Revenus ce mois, Revenus cette année,
   Revenus mois dernier.
2. Lire « Prochains paiements », « Paiements récents », « Tickets de maintenance
   récents ».
3. `/owner/properties` : essayer les trois filtres — « Statut », « Type de
   propriété », « Mode de transaction ».
4. Ouvrir un bien, puis ses cinq onglets : « Informations », « Bail actif »,
   « Historique des baux », « Statistiques de revenus », « Historique
   maintenance ».

#### Résultat attendu

1. Le taux d'occupation est cohérent avec Louées / Total.
2. **Cloisonnement** : ce portail ne montre que les biens de ce propriétaire.
   Comparer le nombre affiché avec celui de `BASE/properties` côté agence : il
   doit être **strictement inférieur**, sauf si ce propriétaire possède tout.
3. Un bien sans bail en cours affiche « Aucun bail actif », pas une erreur.
4. L'onglet « Historique maintenance » d'un bien concerné montre le ticket
   `QA2` créé en F.4.

### G.2 Baux, échéances, paiements, dépôts

#### Ce qu'on doit faire

1. `/owner/leases` : lire les tuiles (Baux actifs, terminés, suspendus),
   filtrer par statut, ouvrir un bail.
2. Sur la fiche de bail, parcourir les six onglets : « Informations »,
   « Locataires », « Échéances », « Historique des paiements », « Solde »,
   « Dépôt de garantie ».
3. `/owner/installments` : filtrer par statut, par propriété, par période.
4. `/owner/payments` : filtrer par propriété, méthode, période ; ouvrir
   « Détails » sur un paiement.
5. `/owner/deposits` : ouvrir « Mouvements » sur un dépôt.

#### Résultat attendu

1. L'onglet « Solde » d'un bail donne Total dû, Total payé, Reste à payer, et
   alerte quand le solde est positif. Ces trois nombres doivent coïncider avec
   la balance clients de l'agence pour le même bail.
2. Le tableau des échéances affiche la pénalité à part, sous la mention « dont
   pénalité: ».
3. **Détail d'ergonomie à vérifier** : sur les échéances et sur la maintenance,
   le filtre vit **au-dessus** du tableau, pas dans l'en-tête de colonne. Sur
   les paiements, en revanche, la colonne « Méthode » a conservé son filtre
   propre, en plus du sélecteur du haut. Deux filtres pour la même chose :
   vérifier qu'ils ne se contredisent pas, et consigner l'incohérence.
4. Le paiement déclaré par la locataire en F.3 apparaît ici une fois validé par
   l'agence, avec sa méthode et sa référence.

### G.3 Revenus

**Page** : `/owner/revenues`.

#### Ce qu'on doit faire

1. Lire les quatre tuiles : Ce mois, Cette année, Tous les temps, Moyenne
   mensuelle.
2. Filtrer par période, puis changer l'« Année (revenus mensuels) ».
3. Lire le graphique « Revenus par mois » et le tableau « Revenus par
   propriété ».

#### Résultat attendu

1. La somme du tableau par propriété égale le total de la période choisie.
2. Une année sans revenus affiche « Aucune donnée disponible pour cette
   année », pas un graphique vide sans explication.
3. La moyenne mensuelle est cohérente avec le total annuel divisé par les mois
   écoulés — relever l'écart s'il y en a un, il dit comment le calcul est fait.

### G.4 Incidents, documents, rapports, préférences

#### Ce qu'on doit faire

1. `/owner/maintenance` : filtrer par statut, propriété, catégorie, priorité ;
   ouvrir « Détails » sur le ticket `QA2` de F.4.
2. `/owner/documents` : filtrer par type et par propriété, télécharger un
   document.
3. `/owner/reports` : générer un « Rapport de revenus » en PDF sur l'année en
   cours, un « Rapport d'occupation » à la date du jour en CSV, puis un
   « Export de données » de type `Paiements` au format Excel.
4. `/owner/preferences` : basculer « Recevoir la newsletter », puis revenir à
   l'état initial.

#### Résultat attendu

1. Le détail du ticket est en **lecture seule** : le propriétaire voit
   statut, prestataire assigné, commentaires et historique, mais ne peut rien
   modifier. Un bouton d'action ici serait une anomalie.
2. Les trois rapports se téléchargent réellement et s'ouvrent dans leur
   application. Vérifier que le PDF n'est pas un fichier vide et que le CSV
   contient bien des lignes.
3. La bascule de préférence confirme par « Vous recevrez les newsletters. » ou
   « Vous ne recevrez plus les newsletters. »
4. **Contrôle croisé avec la partie E** : ce consentement est exactement celui
   qui alimente la liste dérivée « Propriétaires (avec accord newsletter) ».
   Couper le consentement ici, puis relire le nombre de destinataires de cette
   liste côté agence : il doit avoir diminué de un. Remettre ensuite le
   consentement dans son état d'origine.

---

## Partie H — Gestion de l'agence

Menu **Agence** : collaborateurs, invitations, paramètres. Plus le profil
personnel, accessible depuis l'avatar.

> **Règle de prudence** : ne jamais désactiver, réinitialiser ni révoquer le
> compte avec lequel on est connecté. Toute cette partie se joue sur une
> invitation `QA2` créée pour l'occasion.

### H.1 Paramètres de l'agence

**Page** : `BASE/settings` (menu **Agence › Paramètres**).

#### Cette page permet de faire

Renseigner l'identité de l'agence : c'est elle qui alimente les documents
générés — baux, quittances, reçus.

#### Ce qu'on doit faire

1. Relever les valeurs actuelles **avant** de toucher à quoi que ce soit.
2. Saisir un « Site web » invalide : `immotopia.ci` (sans `https://`).
3. Saisir un « Email de contact » invalide : `contact@`.
4. Corriger les deux, ajouter ` (QA2)` à la fin de la « Dénomination légale »,
   puis « Enregistrer ».
5. Générer un document depuis un bail (onglet **Documents** d'un bail) et
   vérifier que la dénomination modifiée y apparaît.
6. Remettre la dénomination d'origine.

#### Résultat attendu

1. « URL invalide (doit commencer par http:// ou https:// ) » et « Email
   invalide » bloquent l'enregistrement.
2. « Informations mises à jour avec succès ! » après correction.
3. Le document généré reprend la nouvelle dénomination : c'est le seul moyen de
   vérifier que ces champs servent réellement, comme l'annonce le bandeau
   « Les informations renseignées ici seront utilisées automatiquement dans
   tous les documents générés ».

### H.2 Inviter un collaborateur

**Pages** : `BASE/collaborators`, puis `BASE/invite`.

#### Ce qu'on doit faire

1. Ouvrir `BASE/collaborators` et relever « Total: {n} collaborateurs ».
2. Filtrer par « Tous les statuts » → « Actif », « Invitation en attente »,
   « Désactivé ».
3. Cliquer « Inviter un collaborateur ».
4. Tenter d'envoyer sans rôle.
5. « Email » = `qa2.gestion@example.ci`, cocher le rôle « Agent tenant »,
   « Envoyer l'invitation ».
6. Sur `BASE/invitations`, repérer la ligne `QA2` et cliquer « Renvoyer ».
7. Cliquer « Révoquer ».

#### Résultat attendu

1. Sans rôle : « Veuillez selectionner au moins un role », et le bouton d'envoi
   reste inactif.
2. Après envoi : « Invitation envoyee avec succes », puis redirection vers la
   liste des invitations.
3. La ligne affiche « En attente », une date d'invitation et une date
   d'expiration.
4. « Renvoyer » et « Révoquer » demandent confirmation.
5. Après révocation, le statut passe « Révoquée » et les deux actions
   disparaissent. **C'est définitif** : le lien reçu par e-mail ne fonctionne
   plus.
6. Si l'invitation est refusée avec un message évoquant un tenant « plus
   actif », c'est que l'agence a été suspendue — voir la partie I.

### H.3 Le parcours d'acceptation d'invitation

Cette étape demande une invitation **non révoquée**. En envoyer une seconde
vers une adresse relevable par le testeur.

#### Ce qu'on doit faire

1. Ouvrir le lien reçu par e-mail : `/auth/accept-invite?token=…`.
2. Ouvrir la même page **sans jeton** : `/auth/accept-invite`.
3. Sur la page avec jeton, saisir un mot de passe faible (`azerty`).
4. Saisir `QA2Invite@2026`, un nom complet, confirmer, valider.
5. Se connecter avec ce nouveau compte.

#### Résultat attendu

1. Sans jeton : « Token d'invitation manquant ou invalide. » et le bouton reste
   inactif.
2. Le mot de passe faible est refusé règle par règle (8 caractères, majuscule,
   minuscule, chiffre, caractère spécial) et l'indicateur « Force du mot de
   passe: » suit la saisie.
3. Après validation : « Invitation acceptee » puis redirection vers la
   connexion.
4. Le nouveau compte apparaît « Actif » dans `BASE/collaborators`, et son
   invitation passe « Acceptée ».
5. Connecté avec ce compte, la barre latérale ne montre que les menus ouverts
   au rôle « Agent tenant » — moins d'entrées qu'avec le compte administrateur.

### H.4 Fiche d'un collaborateur

**Page** : `BASE/collaborators/:userId` — ouvrir la fiche du collaborateur
`QA2` créé en H.3, **pas** celle du compte connecté.

#### Ce qu'on doit faire

1. Lire le bloc d'informations : Email, Nom complet, Statut, Dernière
   connexion.
2. Ajouter le rôle « Comptable tenant », « Enregistrer les rôles ».
3. Cliquer « Révoquer les sessions », confirmer.
4. Cliquer « Réinitialiser le mot de passe », confirmer.
5. Revenir à la liste et « Désactiver » ce collaborateur, puis l'« Activer ».

#### Résultat attendu

1. Les rôles enregistrés se retrouvent dans la colonne « Rôles » de la liste.
2. « Toutes les sessions ont été révoquées » : la session ouverte de ce compte
   dans l'autre fenêtre est effectivement rejetée au prochain clic.
3. « Mot de passe réinitialisé. Un email a été envoyé à l'utilisateur. »
4. Les bascules « Désactiver » / « Activer » demandent confirmation et
   changent le tag de statut.
5. **Contrôle croisé** : un compte désactivé ne peut plus se connecter. Le
   vérifier dans une fenêtre privée, puis le réactiver.

### H.5 Profil personnel

**Page** : `/settings/profile`.

#### Ce qu'on doit faire

1. Lire le bloc « Informations du compte » : Email, Nom complet, Compte créé
   le, Dernière mise à jour.
2. Changer la langue dans la section « Langue », puis revenir au français.
3. Cliquer « Changer le mot de passe ».

#### Résultat attendu

1. Les informations du compte sont en lecture seule : aucun champ n'est
   modifiable ici.
2. Le changement de langue prend effet immédiatement sur toute l'interface, et
   il est annoncé comme valant aussi pour les e-mails reçus.
3. « Changer le mot de passe » renvoie vers `/forgot-password` : c'est le
   parcours prévu, pas une erreur de lien. Y vérifier que le message de succès
   s'affiche **même pour une adresse inconnue** — c'est volontaire, pour ne pas
   révéler quels comptes existent.

---

## Partie I — Administration de la plateforme

Se déconnecter et se reconnecter avec `admin@immobillier.com` /
`Admin@123456`. Ces écrans sont réservés au super-administrateur : ouverts avec
un autre compte, ils doivent refuser l'accès.

> **Trois gestes à ne pas faire sur l'agence de démonstration** — ils coupent
> l'accès de tous les comptes qui servent au reste du scénario :
> suspendre **Ivoire Résidences**, désactiver un de ses modules, retirer une
> permission au rôle avec lequel on est connecté. Ce qui suit les fait tester
> sur une agence jetable, créée pour l'occasion.

### I.1 Contrôle d'accès

#### Ce qu'on doit faire

1. Connecté en **collaborateur** (`devaccrocs@gmail.com`), ouvrir directement
   `http://localhost:3000/admin/tenants`.
2. Se reconnecter en super-administrateur et rouvrir la même adresse.

#### Résultat attendu

1. Le collaborateur est refusé : redirection ou page d'accès refusé, jamais la
   liste des agences. Si la liste s'affiche, c'est une faille à consigner en
   priorité.
2. Le super-administrateur voit la liste et l'entrée « Administration » dans la
   barre latérale.

### I.2 Créer une agence jetable

**Page** : `/admin/tenants` puis « Nouveau Tenant ».

#### Ce qu'on doit faire

1. Relever « Total {n} résultat(s) » et essayer les filtres : recherche par nom,
   puis statut « Actif », « Suspendu », « Inactif ».
2. « Nouveau Tenant » : « Type d'agence » = `Agence`, « Nom » =
   `QA2 Agence jetable`, « Email de contact » = `qa2.agence@example.ci`,
   « Ville » = `Abidjan`, laisser « Pays » = `Côte d'Ivoire`.
3. Valider par « Créer ».

#### Résultat attendu

1. Le champ « Nom » est obligatoire : « Le nom est requis ».
2. La nouvelle agence apparaît dans la liste, statut « Actif », avec son slug
   sous son nom.

### I.3 Fiche d'agence — les cinq onglets

**Page** : `/admin/tenants/:tenantId` (celle de `QA2 Agence jetable`).

#### Ce qu'on doit faire

1. Onglet « Vue d'ensemble » : vérifier les informations saisies en I.2.
2. Onglet « Statistiques » : relever Propriétés, Clients, Collaborateurs,
   Modules actifs.
3. Onglet « Modules » : activer `MODULE_SYNDIC`, puis le désactiver.
4. Onglet « Abonnement » : lire le contenu ou l'état vide.
5. Onglet « Collaborateurs » : cliquer « Inviter », envoyer une invitation à
   `qa2.admin.jetable@example.ci`.
6. Revenir à l'en-tête, cliquer « Suspendre », confirmer.
7. Cliquer « Activer », confirmer.
8. Cliquer « Modifier », ajouter un « Site web » invalide, puis un valide,
   enregistrer.

#### Résultat attendu

1. Sur une agence neuve, les statistiques sont à zéro et l'abonnement affiche
   « Aucun abonnement » : deux états vides légitimes.
2. Les modules s'affichent sous leur nom technique — `MODULE_AGENCY`,
   `MODULE_SYNDIC`, `MODULE_PROMOTER` — sans traduction. Connu ; à consigner
   comme point d'ergonomie, pas comme panne.
3. La suspension prévient : « Ses collaborateurs perdent l'accès jusqu'à
   réactivation. » Puis « Agence suspendue », et le badge de statut change.
4. **Contrôle croisé** : pendant que l'agence est suspendue, tenter d'envoyer
   une invitation depuis son onglet « Collaborateurs ». Le refus doit être
   explicite et mentionner qu'il faut réactiver l'agence.
5. « URL invalide (https://…) » bloque le champ site web, puis « Agence mise à
   jour ».

### I.4 Rôles, menus et permissions

**Page** : `/admin/roles-permissions`.

#### Cette page permet de faire

Choisir un rôle, régler les menus qu'il voit et les permissions qu'il détient.
C'est le seul écran qui relie une permission technique à une porte visible dans
le menu.

#### Ce qu'on doit faire

1. Vérifier la liste des rôles et leurs étiquettes de portée : « Super
   administrateur plateforme » (Plateforme), « Administrateur tenant »,
   « Gestionnaire tenant », « Agent tenant », « Comptable tenant » (Agence),
   « Propriétaire (portail) » et « Locataire (portail) » (Portail client).
2. Sélectionner **« Agent tenant »** — surtout pas le rôle du compte connecté.
3. Onglet « Menus accessibles » : lire le badge « {n}/{total} actifs », couper
   l'entrée **Communication**, enregistrer.
4. Se connecter dans une fenêtre privée avec le collaborateur `QA2` créé en H.3
   (rôle « Agent tenant ») et vérifier la barre latérale.
5. Revenir, cliquer « Valeurs par défaut », puis « Enregistrer ».
6. Sélectionner « Super administrateur plateforme » et **essayer** de décocher
   le menu « Administration ».
7. Sélectionner « Locataire (portail) » et ouvrir l'onglet « Permissions
   détaillées ».
8. Onglet « Permissions détaillées » sur « Agent tenant » : cocher une
   permission, enregistrer, puis la décocher et enregistrer à nouveau.

#### Résultat attendu

1. À l'étape 3 : le tag « Personnalisé » apparaît sur l'entrée modifiée, et
   « Menus de « Agent tenant » enregistrés. » confirme.
2. À l'étape 4 : le menu **Communication** a réellement disparu pour ce compte.
   C'est la preuve que l'écran agit sur la navigation, et pas seulement sur un
   réglage théorique.
3. À l'étape 5 : « Rétablir les valeurs par défaut ? » prévient que rien n'est
   enregistré tant qu'on n'a pas cliqué « Enregistrer ».
4. À l'étape 6 : l'entrée « Administration » porte un tag « Verrouillé » et ne
   peut pas être coupée — « Menu indispensable pour revenir régler les accès :
   il ne peut pas être coupé. »
5. À l'étape 7 : un message explique que ce pseudo-rôle n'a pas de permissions,
   son périmètre venant du rattachement à l'agence. Seuls ses menus se règlent.
6. **Danger connu, à consigner sans le déclencher** : ce verrou protège le menu,
   pas la grille de permissions. Rien n'empêche de retirer au rôle
   plateforme une permission dont il a besoin pour revenir sur cet écran. Ne
   pas tenter la manœuvre sur le rôle avec lequel on est connecté.

### I.5 Statistiques et journal d'audit

#### Ce qu'on doit faire

1. `/admin/statistics` : relever « Total agences », « Collaborateurs »,
   « Abonnements », « Modules Activés », et la section « Activations par
   Module ».
2. `/admin/audit` : filtrer par « Action » avec un mot lu dans la colonne,
   puis par « Type de ressource », puis par « Période » (J−1 → J).
3. Ouvrir « Voir » sur la ligne correspondant à la suspension d'agence faite
   en I.3.
4. Chercher une ligne portant sur un bien et ouvrir son détail.

#### Résultat attendu

1. « Total agences » a augmenté de 1 depuis la création de I.2.
2. Le journal contient bien les gestes d'administration de cette session :
   création d'agence, suspension, réactivation, modification des menus.
3. La modale de détail montre la date, l'utilisateur, l'action, la ressource,
   l'agence, l'« IP client » et le User-Agent, plus le contenu enregistré
   lorsqu'il existe.
4. Sur une ressource « bien », le bloc de détail du bien s'affiche, ou bien le
   message « Impossible de charger les détails de la propriété (supprimée ou
   accès refusé). » si le bien n'existe plus : les deux sont corrects.

### I.6 Nettoyage

1. Supprimer ou laisser en « Inactif » l'agence `QA2 Agence jetable` — la
   supprimer si l'interface le permet, sinon la consigner comme donnée
   résiduelle.
2. Vérifier que **Ivoire Résidences** est bien « Actif » et que tous ses
   modules d'origine sont réactivés avant de quitter cette partie.

---

## Partie J — Les écrans laissés de côté par le parcours chantier

Revenir sur le compte collaborateur (`devaccrocs@gmail.com`).

Le scénario chantier couvre déjà budget, bons de commande, factures
fournisseurs, règlements, retenues, caisse, salaires, tâcherons, stock,
facturation, balances, relevés, file de validation, tableau de bord des
chantiers, associations, pénalités, dépôts et documents de bail. Restent trois
écrans : les baux de terrain, l'importation, et le calendrier des visites.

### J.1 Bail de terrain — création

**Page** : `BASE/finance/baux-terrain` (menu **Finance › Baux de terrain**).

#### Cette page permet de faire

Enregistrer un terrain loué à un tiers, sur lequel un ou plusieurs chantiers
sont bâtis, et suivre la consommation de l'avance versée.

#### Ce qu'on doit faire

1. Relever le sous-titre (« N bail » / « N baux ») et les colonnes.
2. « Nouveau bail » : « Bailleur » = `QA2 Mamadou Kouadio`, « Terrain loué » =
   `QA2 Terrain Riviera, 800 m²`, « Loyer annuel (FCFA) » = `6000000`,
   « Poste de dépense » = `Divers`, « Début » = `01/01/2026`, « Fin » laissée
   **vide**.
3. Test négatif : réessayer en omettant le poste de dépense.
4. Enregistrer et ouvrir la fiche.

#### Résultat attendu

1. Le refus cite les cinq champs obligatoires : « Le bailleur, le terrain, le
   loyer annuel, le poste de dépense et la date de début sont obligatoires. »
2. La fiche affiche cinq indicateurs — « Payé à ce jour », « Consommé à ce
   jour », « Reste à consommer », « Loyer annuel », « Mensualité ».
3. Avec un loyer annuel de 6 000 000, la mensualité attendue est **500 000**.
4. La fin vide se lit « tacite reconduction » dans la phrase de début de fiche.

### J.2 Bail de terrain — chantiers, paiement, constatation

#### Ce qu'on doit faire

1. Section « Chantiers rattachés » : lire l'état vide, puis rattacher un
   chantier existant depuis « Rattacher un chantier existant ».
2. Section « Paiements annuels » : « Date de paiement » = J, « Montant » =
   `6000000`, période couverte du `01/01/2026` au `31/12/2026`, enregistrer.
3. Lire le statut de la ligne créée, puis cliquer « Valider » et **lire l'avis
   avant de confirmer**.
4. Section « Constatations mensuelles » : constater le mois en cours par
   « Constater ce mois » (année `2026`, mois `Septembre`).
5. Rejouer exactement la même constatation une seconde fois.
6. Détacher le chantier, puis constater le mois suivant.

#### Résultat attendu

1. L'état vide annonce clairement la conséquence : « les prochaines
   constatations mensuelles seront enregistrées sans imputation tant qu'aucun
   n'est ajouté ».
2. Le paiement est créé « Brouillon », puis « Validé ». **La validation est
   irréversible** et l'écran le dit : une fois validée, l'avance commence à se
   consommer mois après mois.
3. Après validation, « Payé à ce jour » = 6 000 000 ; après une constatation,
   « Consommé à ce jour » = 500 000 et « Reste à consommer » = 5 500 000.
4. À l'étape 5, rejouer le même mois **ne double rien** — c'est ce que promet
   l'avertissement de l'écran. Un doublement du montant consommé est une
   anomalie majeure.
5. À l'étape 6, la constatation apparaît avec la mention « Aucun chantier actif
   sur ce bail à cette date : charge constatée sans imputation. »
6. Le détachement prévient que le chantier ne recevra plus d'imputation « à
   compter de la prochaine constatation mensuelle » : les constatations déjà
   faites ne bougent pas. Le vérifier.

### J.3 Importation d'un classeur Excel

**Page** : `BASE/finance/importation` (menu **Finance › Importation**).

#### Cette page permet de faire

Reprendre un suivi tenu sous Excel : le classeur est lu **dans le navigateur**,
jamais envoyé au serveur ; chaque ligne devient une pièce **en brouillon**,
jamais validée.

#### Ce qu'on doit faire

Préparer d'abord un fichier `.xlsx` de cinq lignes pour la nature « Pièce de
caisse », avec les colonnes `Poste de dépense`, `Bénéficiaire`, `Montant`,
`Date`, `Motif`. Y glisser volontairement une ligne fautive (montant vide) et
une ligne en double.

1. Étape « Le document » : « Type de document » = `Pièce de caisse`,
   « Chantier » = un chantier existant, « Date par défaut » = J. Continuer.
2. Étape « Le fichier » : déposer d'abord un `.csv` — il doit être refusé —
   puis le `.xlsx`.
3. Étape « Les colonnes » : rapprocher chaque colonne du fichier d'un champ du
   document. Laisser d'abord un champ obligatoire non rapproché et tenter de
   prévisualiser.
4. Essayer d'affecter **deux fois le même champ** à deux colonnes.
5. Étape « L'aperçu » : corriger la ligne fautive directement dans le tableau,
   décocher une ligne, lire le compteur.
6. Lancer « Importer N ligne(s) ».
7. Aller dans `BASE/finance/validation` et retrouver les pièces créées.

#### Résultat attendu

1. Le `.csv` est refusé : « Ce fichier n'a pas pu être lu. Attendu : un
   classeur Excel (.xlsx). » Seuls `.xlsx` et `.xlsm` sont acceptés.
2. La zone de dépôt annonce que le fichier ne quitte pas le poste. Le vérifier
   dans l'onglet réseau du navigateur : **aucune requête** ne part au moment de
   la lecture du classeur.
3. Tant qu'un champ obligatoire n'est pas rapproché, l'alerte « Champs
   obligatoires non rapprochés » bloque l'aperçu.
4. Un champ déjà utilisé n'est plus proposé pour une autre colonne.
5. Le compteur d'aperçu distingue trois choses : lignes prêtes, lignes en
   erreur, doublons probables. Une ligne décochée n'est pas importée.
6. **Cas particulier de la pièce de caisse** : aucun doublon n'est signalé, et
   l'écran l'explique — la file de validation ne montre pas assez
   d'informations pour les détecter. Ne pas conclure à un défaut de détection.
7. Le compte rendu final distingue quatre nombres : pièces saisies en brouillon,
   lignes refusées par le serveur, lignes décochées, lignes en erreur non
   envoyées. La somme doit correspondre au nombre de lignes du fichier.
8. Les pièces créées apparaissent dans la file de validation, **en attente** :
   l'importation ne valide jamais.

> **Deuxième passe, si le temps le permet** : refaire l'exercice avec la nature
> « Note de salaire » en choisissant un chantier à la première étape. Le poste
> de dépense devient alors obligatoire, et l'écran l'annonce : « Un chantier est
> choisi : le poste de dépense devient obligatoire. »
>
> Aucun fichier modèle n'est fourni dans le dépôt ni téléchargeable depuis
> l'écran : le classeur de test est à fabriquer. C'est un manque à consigner.

### J.4 Calendrier des visites

**Page** : `BASE/properties/visits/calendar` (menu **Biens › Calendrier des
visites**).

#### Ce qu'on doit faire

1. Ouvrir la page sans avoir planifié de visite.
2. Depuis une affaire CRM (partie A), planifier une visite de bien dans les
   trente jours.
3. Revenir sur le calendrier.
4. Chercher un filtre de période ou un bouton d'ajout.

#### Résultat attendu

1. L'état vide affiche « Aucune visite planifiée » / « Aucune visite n'est
   planifiée pour cette période ».
2. La visite créée apparaît sous sa date en toutes lettres, avec l'heure, la
   durée, un tag de statut, le lien vers le bien et le contact.
3. **Cet écran est en lecture seule** : ni création, ni modification, ni filtre
   de dates. La fenêtre est figée à trente jours. Une visite planifiée à plus
   de trente jours n'apparaîtra pas — ce n'est pas une anomalie, c'est la
   limite de l'écran, et elle mérite d'être consignée comme telle.

---

## Partie K — Contrôles transversaux

À faire en fin de parcours, une fois les données `QA2` en place.

### K.1 Cloisonnement des accès

Pour chaque ligne, ouvrir l'adresse **directement dans la barre du navigateur**,
avec le compte indiqué.

| Compte               | Adresse ouverte                                          | Attendu                                             |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Locataire            | `BASE/crm/contacts`                                      | Refus : jamais la liste des contacts de l'agence    |
| Locataire            | `BASE/finance/validation`                                | Refus                                               |
| Propriétaire         | `BASE/collaborators`                                     | Refus                                               |
| Propriétaire         | `/owner/properties/<id d'un bien qui n'est pas le sien>` | Refus ou « non trouvé », jamais la fiche            |
| Collaborateur        | `/admin/tenants`                                         | Refus                                               |
| Collaborateur        | `/tenant` (portail locataire)                            | Redirigé vers son propre tableau de bord            |
| Super-administrateur | `BASE/dashboard`                                         | Selon son rattachement ; consigner ce qui s'affiche |

Une seule de ces lignes qui laisse passer est une faille : la consigner en
priorité, avec le statut HTTP de la requête concernée.

### K.2 Un module coupé se voit dans le menu

#### Ce qu'on doit faire

1. En super-administrateur, sur l'agence jetable `QA2` (partie I), couper le
   menu **CRM** du rôle « Agent tenant ».
2. Se connecter avec le collaborateur `QA2` et vérifier la barre latérale.
3. Ouvrir malgré tout `BASE/crm/contacts` à la main.

#### Résultat attendu

1. L'entrée CRM disparaît du menu.
2. **Point de contrôle** : l'adresse ouverte à la main doit être refusée elle
   aussi. Un menu caché mais une page accessible signifierait que le contrôle
   n'existe que dans la barre latérale — à consigner immédiatement.

### K.3 Langue

#### Ce qu'on doit faire

1. Depuis `/settings/profile`, passer en anglais.
2. Parcourir : tableau de bord CRM, liste des contacts, notifications e-mail,
   campagnes newsletter, file de validation.
3. Revenir au français.

#### Résultat attendu

1. Les libellés changent réellement, sans page blanche ni clé technique
   affichée telle quelle (`crm.contacts.title`).
2. Les écrans déjà repérés comme rédigés en dur — la boîte de conversion d'un
   contact (A.4) — restent en anglais dans les deux sens : c'est le même défaut,
   vu de l'autre côté.
3. Revenu au français, aucun écran ne conserve d'anglais résiduel.

### K.4 Comportement quand le serveur ne répond pas

#### Ce qu'on doit faire

Arrêter l'API, puis ouvrir successivement : liste des contacts, pipeline des
affaires, tickets de maintenance, campagnes newsletter, modèles de documents,
tableau de bord.

#### Résultat attendu

1. Chaque écran affiche un message d'erreur explicite et, quand il existe, un
   bouton « Réessayer ».
2. Aucun écran n'affiche « Aucune donnée » : confondre « la table est vide » et
   « l'appel a échoué » est précisément le défaut que ce contrôle cherche.
3. Aucun écran blanc, aucun écran bloqué sur un squelette de chargement.
4. Après redémarrage de l'API, « Réessayer » suffit à recharger, sans avoir à
   se reconnecter.

### K.5 Affichage sur téléphone

Réduire la fenêtre à 375 px de large, ou utiliser le mode appareil mobile du
navigateur.

#### Résultat attendu

1. Le portail locataire est conçu pour cette largeur : quatre onglets en bas —
   « Accueil », « Payer », « Incidents », « Mon bail » — et **aucune barre
   latérale**. Une barre latérale de 256 px sur ce portail serait un défaut.
2. Le portail propriétaire montre cinq onglets : « Accueil », « Biens »,
   « Revenus », « Incidents », « Plus ».
3. Côté agence, les écrans qui ont une vue « cartes » y basculent — liste des
   modèles de documents, liste des abonnés — au lieu d'un tableau illisible.
4. Aucun écran ne défile horizontalement.

---

## 3. Ordre conseillé

Les parties se tiennent dans l'ordre A → K : chacune s'appuie sur ce que la
précédente a créé. Si le temps manque, voici trois parcours autonomes :

| Parcours       | Parties    | Durée indicative |
| -------------- | ---------- | ---------------- |
| Commercial     | A, B       | 1 h 30           |
| Exploitation   | C, D, F, G | 2 h              |
| Administration | H, I, K    | 1 h 30           |

La partie E (newsletter) et la partie J (finance restant) peuvent se jouer
seules, à condition de lire leurs avertissements d'ouverture.

Deux parties demandent une seconde fenêtre ouverte sur un autre compte : C
(agence et gestionnaire), F et G (portails clients face à la vue agence).

---

## 4. Journal de test

Une ligne par étape. « Constaté » reçoit la valeur lue à l'écran quand elle
diffère de l'attendu, ou quand le document demande de noter une valeur.

| Étape                 | Résultat (OK / KO / Noté) | Constaté                                                                      | Capture |
| --------------------- | ------------------------- | ----------------------------------------------------------------------------- | ------- |
| 1.3 valeurs de départ |                           | leads = … ; contacts = … ; affaires = … ; tickets = … ; modèle par défaut = … |         |
| A.1                   |                           | message de refus affiché = …                                                  |         |
| A.2                   |                           | modale vide au second passage ?                                               |         |
| A.3                   |                           |                                                                               |         |
| A.4                   |                           | dialogue en anglais ?                                                         |         |
| A.5                   |                           |                                                                               |         |
| A.6                   |                           | stades proposés sur la fiche = …                                              |         |
| A.7                   |                           |                                                                               |         |
| A.8                   |                           |                                                                               |         |
| A.9                   |                           | statut exporté vs écran                                                       |         |
| A.10                  |                           | deltas des cinq tuiles                                                        |         |
| B.1                   |                           | modèles présents = … ; défaut = …                                             |         |
| B.2                   |                           |                                                                               |         |
| B.3                   |                           | modèle par défaut rétabli ?                                                   |         |
| B.4                   |                           |                                                                               |         |
| C.1                   |                           |                                                                               |         |
| C.2                   |                           | filtre « propriété » vide ?                                                   |         |
| C.3                   |                           |                                                                               |         |
| C.4                   |                           | nombre d'appels réseau au clic                                                |         |
| C.5                   |                           | statut HTTP obtenu = …                                                        |         |
| D.1                   |                           |                                                                               |         |
| D.2                   |                           | e-mail reçu ? sujet = …                                                       |         |
| D.3                   |                           | SID et JSON invalides acceptés ?                                              |         |
| D.4                   |                           | message d'échec exact = …                                                     |         |
| E.1                   |                           | statut des abonnés importés = …                                               |         |
| E.2                   |                           | destinataires potentiels = …                                                  |         |
| E.3                   |                           | modèle sans lien accepté ?                                                    |         |
| E.4                   |                           |                                                                               |         |
| E.5                   |                           | statut après rechargement = … ; envoyés = …                                   |         |
| E.6                   |                           | messages des deux seconds passages                                            |         |
| E.7                   |                           |                                                                               |         |
| F.1                   |                           | écart avec la vue agence ?                                                    |         |
| F.2                   |                           | extension du fichier téléchargé = …                                           |         |
| F.3                   |                           | paiement visible côté agence ?                                                |         |
| F.4                   |                           | priorité affichée côté agence = …                                             |         |
| F.5                   |                           |                                                                               |         |
| G.1                   |                           | biens vus / biens de l'agence = … / …                                         |         |
| G.2                   |                           | solde portail vs balance clients                                              |         |
| G.3                   |                           |                                                                               |         |
| G.4                   |                           | destinataires de la liste dérivée avant/après = …                             |         |
| H.1                   |                           | dénomination rétablie ?                                                       |         |
| H.2                   |                           |                                                                               |         |
| H.3                   |                           |                                                                               |         |
| H.4                   |                           |                                                                               |         |
| H.5                   |                           |                                                                               |         |
| I.1                   |                           |                                                                               |         |
| I.2                   |                           |                                                                               |         |
| I.3                   |                           | refus d'invitation sur agence suspendue = …                                   |         |
| I.4                   |                           | menu réellement disparu ?                                                     |         |
| I.5                   |                           |                                                                               |         |
| I.6                   |                           | Ivoire Résidences active et modules rétablis ?                                |         |
| J.1                   |                           | mensualité calculée = …                                                       |         |
| J.2                   |                           | consommé après double constatation = …                                        |         |
| J.3                   |                           | requête réseau à la lecture du classeur ?                                     |         |
| J.4                   |                           |                                                                               |         |
| K.1                   |                           | lignes qui laissent passer = …                                                |         |
| K.2                   |                           |                                                                               |         |
| K.3                   |                           |                                                                               |         |
| K.4                   |                           | écrans affichant « Aucune donnée » à tort = …                                 |         |
| K.5                   |                           |                                                                               |         |

Les anomalies se consignent à part, avec : page, action, attendu, constaté,
statut HTTP de la requête en échec s'il y en a une, capture.

### Anomalies déjà connues au 22/09/2026

Elles sont **attendues**. Les retrouver confirme que le test a été mené ; ne
pas les compter comme découvertes.

| Réf. | Écran                     | Symptôme                                                         |
| ---- | ------------------------- | ---------------------------------------------------------------- |
| A.4  | Fiche contact, conversion | Boîte de dialogue entièrement en anglais                         |
| A.6  | Fiche d'une affaire       | Stade « Rendez-vous » absent du sélecteur, libellés sans accents |
| A.6  | Liste des affaires        | Colonne « Type » affichée en valeur brute majuscule              |
| A.5  | Formulaire d'affaire      | Cinq types proposés, deux seulement filtrables                   |
| C.2  | Mes tickets (agence)      | Filtre « Filtrer par propriété » sans aucune option              |
| C.1  | Prestataires              | La suppression est définitive, jamais une désactivation          |
| E.3  | Modèles de newsletter     | Un modèle sans lien de désinscription est accepté                |
| E.5  | Campagnes                 | Message de succès affiché même quand tous les envois échouent    |
| F.4  | Portail locataire         | Priorités nommées différemment de l'écran d'agence               |
| F.5  | Portail locataire         | `/tenant/deposit` et `/tenant/documents` sans lien de navigation |
| I.3  | Fiche d'agence            | Modules affichés sous leur nom technique                         |
| J.3  | Importation               | Aucun classeur modèle fourni                                     |
| J.4  | Calendrier des visites    | Fenêtre figée à trente jours, sans filtre                        |

---

## 5. Hors périmètre de ce document

- Tout ce que couvrent déjà les trois documents cités en tête : chantiers et
  financement, patrimoine, syndic, biens, baux, encaissements et comptabilité
  locative.
- L'envoi réel de messages WhatsApp : aucun fournisseur n'est configuré en
  local, et ce scénario vérifie l'échec, pas l'envoi.
- La connexion Google (OAuth) et le parcours d'inscription publique
  `/register`, qui dépendent d'une configuration externe.
- La suppression des données `QA2` en fin de test, hormis celles que les
  parties E.7 et I.6 demandent explicitement de retirer. Le reste demeure en
  base, repérable par son préfixe.
