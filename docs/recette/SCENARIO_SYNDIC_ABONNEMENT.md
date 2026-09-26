# Scénario de recette — Création d'un Syndic et limites de son abonnement

**⚠️ NE JAMAIS CLIQUER « Payer en ligne ».** Le compte PaySecureHub de cet
environnement local est configuré en mode **LIVE** : un clic sur ce bouton
déclenche un paiement réel. Ce bouton apparaît sur la page
`Paramètres › Abonnement` de l'agence (section Factures) et sur le portail
locataire — dans ce scénario on ne s'en approche jamais.

Parcours complet ImmoTopia, **exécuté uniquement par clics dans l'interface
web** (aucune requête API, aucune commande, aucun script) : le super-admin
crée une agence de syndic avec le pack **Syndic** seul, l'administrateur de
l'agence accepte son invitation et se connecte, puis on vérifie ce que
l'abonnement autorise et refuse — menu, page Abonnement, capacité de
copropriétés et de lots, dépassement, politique de dépassement, extensions,
module non souscrit, lecture seule manuelle — avant de nettoyer.

Réécrit le 25 septembre 2026 sur `fix/quota-exceeded-409` pour être rejoué de
zéro par un agent de navigateur, à partir du code réel de
[docs/architecture/PLAN-ABONNEMENTS.md](../architecture/PLAN-ABONNEMENTS.md).
Une exécution précédente de ce scénario (25/09/2026, agence
« Syndic Recette 25-09-2026 ») existe en base : **l'ignorer**, ne pas la
modifier, ne pas réutiliser son adresse e-mail ni son identifiant d'agence.

---

## 0. Consignes pour l'agent de navigateur

- Adresse de l'application : **http://localhost:3300**. API sur
  **http://localhost:8800** (aucun appel direct : on ne fait qu'observer ce
  que l'interface affiche).
- N'invente jamais un résultat : si un écran ne montre pas ce qui est décrit
  ci-dessous, ou si l'action n'est pas possible depuis l'interface, **s'arrêter
  et le signaler** plutôt que de continuer ou de supposer.
- Capturer (ou décrire précisément) chaque résultat attendu dans le journal
  (section 8) : ce que l'écran affichait réellement.
- **Ne jamais cliquer « Payer en ligne »** (voir l'avertissement en tête de
  document).
- Ne rien supprimer (aucune agence, aucun bien, aucune copropriété, aucun
  utilisateur) : ce scénario ne crée que des données neuves marquées
  « Recette 2 » et se termine par une suspension d'agence, pas une
  suppression.
- Ne jamais lancer `npm run db:seed` (efface la base de démonstration) et ne
  lancer aucune commande shell : tout se fait par clics.

---

## 1. Réalité de l'environnement local

Ces points ne sont **pas** des anomalies : ils décrivent le comportement réel
de cette instance locale pour que l'agent ne les prenne pas pour des bogues.

- **Mode d'application des abonnements — `warn`.** La variable d'API
  `SUBSCRIPTION_ENFORCEMENT` vaut `warn` par défaut
  (`packages/api/src/config/env.ts`). En `warn`, **tous les menus restent
  visibles et accessibles**, y compris les modules non souscrits par le pack
  Syndic (Gestion locative, Chantiers, CRM, Ventes, Patrimoine) : rien n'est
  masqué. **`warn` désactive aussi le blocage des quotas** (`evaluateQuota`,
  `packages/api/src/lib/subscription/entitlements.ts`) : quelle que soit la
  « Politique de dépassement » choisie par le super-admin sur la fiche de
  l'agence — **y compris « Bloquer le dépassement »** —, une création
  au-delà de la capacité de l'agence est **acceptée**, jamais refusée. Les
  étapes D.4 et D.6 de ce scénario, qui attendent un refus, exigent donc le
  mode `enforce`, tout comme E.1 pour le masquage des menus. Le test du
  masquage réel comme du blocage réel demande le mode `enforce`
  (`SUBSCRIPTION_ENFORCEMENT=enforce` puis redémarrage de l'API) : c'est une
  **étape optionnelle que Baba active lui-même** (partie E ci-dessous) — ne
  pas essayer de changer cette variable depuis le navigateur.
- **Lien d'invitation.** L'agent de navigateur ne lit aucune boîte mail. Après
  la création de l'agence, l'écran de résultat du tiroir (composant
  `TenantCreatedResult.tsx`) affiche le champ « Lien d'invitation » avec un
  bouton « Copier » : c'est ce lien qu'on ouvre pour l'étape B, qu'un e-mail
  soit parti ou non.
- **Alertes 80 % / 100 %.** Elles sont levées par une tâche planifiée
  (`jobs/subscription-usage-job.ts`, chaque heure à :15). L'agent de
  navigateur ne peut pas la déclencher : il **constate les jauges** de
  consommation (section 6.2) à mesure qu'elles montent, sans attendre ni
  vérifier l'e-mail d'alerte. Si Baba veut valider les alertes elles-mêmes, il
  relance la tâche lui-même — ce n'est pas à l'agent de le faire.
- **Message de refus de quota (politique Bloquer).** Cette branche
  (`fix/quota-exceeded-409`) est en train de corriger ce message. Une fois le
  correctif posé, un dépassement en politique Bloquer doit refuser avec un
  message clair (« quota atteint », capacité pleine). **Avant que le
  correctif ne soit posé**, l'interface peut encore afficher une erreur
  générique à la place : dans ce cas, le consigner tel quel dans le journal
  (texte exact affiché) sans le traiter comme un échec du scénario — c'est
  l'état attendu tant que le correctif n'est pas en place.
- **Cache des droits d'agence (30 s).** Après une action du super-admin
  (politique de dépassement, extension, lecture seule), recharger la page de
  l'agence pour voir l'effet ; si rien ne change, attendre 30 secondes et
  recharger à nouveau.
- **Essai gratuit automatique.** L'interrupteur « Essai gratuit d'un mois
  inclus » est coché et grisé dans le tiroir de création : on ne peut pas le
  désactiver, c'est voulu.
- **Aucune facture pendant l'essai.** La liste « Factures » de l'agence reste
  vide tout le scénario ; seul « Prochaine facture (aperçu) » côté super-admin
  change.
- **Un bien en mode Vente ne consomme pas de lot.** Seul un logement en
  location, ou un lot principal (appartement/bureau/commercial) d'une
  copropriété compte dans la jauge « Lots ».
- **Écran « module non compris » possiblement absent.** Le composant dédié
  (`ModuleNotIncluded.tsx`) existe dans le code mais n'est monté sur aucune
  route : taper à la main l'adresse d'un module non souscrit peut afficher
  l'état d'erreur générique de la page plutôt qu'un écran dédié. Si c'est ce
  qui apparaît, le décrire tel quel — ce n'est pas un échec de l'étape E.1.
- **Aperçu de facture sans les frais de mise en route.** L'aperçu de la
  prochaine facture (section 6/7) n'inclut pas les 150 000 FCFA de mise en
  route du pack Syndic : ils ne sont ajoutés qu'à l'émission de la première
  facture réelle. Ne pas s'étonner de l'écart.

---

## 2. Jeu de données (neuf)

### 2.1 L'agence

| Champ                      | Valeur                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Nom de l'agence            | `Syndic Recette 2`                                                                              |
| Nom de l'administrateur    | `Fatou Recette2`                                                                                |
| E-mail de l'administrateur | `admin.syndic.recette2@exemple.test`                                                            |
| Packs                      | **Syndic** seul                                                                                 |
| Extensions à la création   | aucune                                                                                          |
| Cycle de facturation       | Mensuel                                                                                         |
| Mise en route accompagnée  | non                                                                                             |
| Plus d'options             | E-mail de contact `contact.syndic.recette2@exemple.test`, ville `Abidjan`, pays `Côte d'Ivoire` |

### 2.2 Comptes

| Rôle                    | Compte                               | Mot de passe                                        |
| ----------------------- | ------------------------------------ | --------------------------------------------------- |
| Super-admin             | `admin@immobillier.com`              | `Admin@123456` (`apps/web/src/dev/dev-accounts.ts`) |
| Administrateur d'agence | `admin.syndic.recette2@exemple.test` | `SyndicTest#2026` (donnée de test)                  |

Le mot de passe de l'administrateur d'agence est saisi par l'agent à
l'acceptation de l'invitation (étape B.1) — ce n'est pas un mot de passe déjà
en base. Règles vérifiées dans
`packages/api/src/utils/password-utils.ts::validatePasswordStrength` :
8 caractères minimum, au moins une majuscule, une minuscule, un chiffre, un
caractère spécial. `SyndicTest#2026` les respecte (S/T majuscules, minuscules,
2026, `#`).

### 2.3 Ce que contient le pack Syndic (catalogue, inchangé)

| Élément                            | Valeur                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Prix HT mensuel                    | 49 900 FCFA                                                                                                      |
| Mise en route (facultative)        | 150 000 FCFA                                                                                                     |
| Module                             | Syndic (`MODULE_SYNDIC`) : fonctions Socle + Syndic                                                              |
| Capacité                           | 2 copropriétés, 100 lots                                                                                         |
| Extensions possibles               | « Bloc de 10 lots » (10 lots, 1 500 FCFA/mois), « Copropriété supplémentaire » (1 copropriété, 10 000 FCFA/mois) |
| Dépassement (politique par défaut) | 150 FCFA par lot, 10 000 FCFA par copropriété                                                                    |

### 2.4 Immeubles, copropriétés et lots (noms neufs)

| Objet            | Nom                                              | Détail                                                                            |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Immeuble A       | `Immeuble Les Manguiers (Recette 2)`             | Type Immeuble, mode **Vente**, adresse `Rue des Manguiers, Cocody, Abidjan`       |
| Unités de A      | `Manguiers Apt M001` … `Manguiers Apt M102`      | 102 appartements, mode Vente (sous-biens de A)                                    |
|                  | `Manguiers Parking MP1`, `Manguiers Parking MP2` | Type Parking / box                                                                |
|                  | `Manguiers Cave MC1`                             | Lot de type Cave (créé au niveau de la copropriété, pas comme bien)               |
| Copropriété 1    | `Copropriété Les Manguiers (Recette 2)`          | liée à l'immeuble A                                                               |
| Copropriété 2    | `Copropriété Les Palmiers (Recette 2)`           | sans immeuble, adresse `Boulevard Latrille, Cocody, Abidjan`                      |
| Copropriété 3    | `Copropriété Les Cauris (Recette 2)`             | adresse `Riviera 3, Abidjan` — au-delà de la capacité (dépassement)               |
| Copropriété 4    | `Copropriété Les Fromagers (Recette 2)`          | adresse `Angré, Abidjan` — refusée en politique Bloquer, acceptée après extension |
| Immeuble B       | `Immeuble Les Baobabs du Lac (Recette 2)`        | 12 appartements `Lac Apt L01` … `Lac Apt L12`, mode Vente — pour l'import         |
| Bien en location | `Studio Manguiers Location (Recette 2)`          | mode **Location** — pour tester le dépassement                                    |

Lots de la copropriété 1 : `M001`…`M102` (Appartement, tantièmes 10), `MP1`,
`MP2` (Parking, 5), `MC1` (Cave, 3). En interface, créer quelques lots suffit
pour vérifier le principe ; le nombre exact (79, 80, 100, 101…) compte pour
les jauges — voir partie D.

---

## 3. Ce qui n'est pas une anomalie (récapitulatif)

- Interrupteur d'essai coché et grisé, non désactivable.
- Aucune facture pendant l'essai ; l'aperçu de facture ne montre pas les frais
  de mise en route.
- Un bien en Vente (ou en brouillon) ne consomme pas de lot.
- Deux extensions « Copropriété supplémentaire » ajoutées séparément
  apparaissent comme deux lignes distinctes (une ligne par ajout, prix figé).
- Menu identique en `enforce` et en `warn` sauf action explicite de Baba (voir
  section 1).
- En `warn` (l'état par défaut), un dépassement de quota n'est **jamais**
  bloqué, quelle que soit la politique choisie — « Bloquer le dépassement »
  compris : les étapes D.4 et D.6 (refus attendus) ainsi que E.1 (masquage de
  menu) exigent le mode `enforce` (voir section 1).

---

## 4. Partie A — Création de l'agence par le super-admin

### A.1 Page : `/admin/tenants` (menu **Administration › Agences**, sidebar du super-admin) — bouton « Nouvelle agence »

#### Ce qu'on doit faire

1. Se connecter en super-admin (`admin@immobillier.com` / `Admin@123456`).
2. Ouvrir **Administration › Agences**, cliquer « Nouvelle agence » (le tiroir
   s'ouvre à droite).
3. Remplir « Nom de l'agence », « Nom de l'administrateur », « E-mail de
   l'administrateur » (section 2.1).
4. Section « Packs » : cliquer la carte **Syndic** seule.
5. Laisser « Extensions » à 0, « Cycle de facturation » sur **Mensuel**,
   « Mise en route accompagnée » décochée.

#### Résultat attendu

- [ ] La carte Syndic affiche `49 900` FCFA « / mois » et se coche.
- [ ] Section « Extensions » : « Lots supplémentaires (blocs de 10) » et
      « Copropriétés supplémentaires » présents, **pas** « Chantiers
      supplémentaires » (réservé Promoteur/Intégré).
- [ ] « Essai gratuit d'un mois inclus (automatique, non désactivable) » :
      interrupteur coché et grisé.
- [ ] « Récapitulatif » (calculé en direct) : ligne `Syndic 49 900`,
      « Total HT mensuel » **49 900**, « Total HT annuel (11 mois) »
      **548 900**.

### A.2 Même tiroir — devis en direct (sans valider)

#### Ce qu'on doit faire

1. Cocher en plus la carte **Agence**, lire le récapitulatif.
2. Décocher Agence (retour au Syndic seul).
3. Mettre « Lots supplémentaires » à `1` et « Copropriétés supplémentaires » à
   `1`, lire le récapitulatif, puis **remettre les deux à 0**.
4. Cocher « Mise en route accompagnée » pour voir la ligne apparaître, puis la
   **décocher**.

#### Résultat attendu

- [ ] Syndic + Agence : lignes `Syndic 49 900`, `Agence 29 900`,
      « Remise de combinaison (10 % sur Agence) » `−2 990` ; total mensuel
      **76 810**, annuel **844 910**.
- [ ] Syndic + 1 bloc + 1 copropriété : `Bloc de 10 lots 1 500`,
      `Copropriété supplémentaire 10 000` ; total mensuel **61 400**, annuel
      **675 400**.
- [ ] Mise en route cochée : ligne « Mise en route (frais uniques) »
      `150 000`, hors total mensuel.
- [ ] Cocher « Opérateur intégré » grise les autres packs (exclusif).

### A.3 Même tiroir — plus d'options, puis création

#### Ce qu'on doit faire

1. « Plus d'options » : e-mail de contact, ville, pays (section 2.1).
2. Cliquer « Créer l'agence ».

#### Résultat attendu

- [ ] Le tiroir devient « Agence créée » : « Syndic Recette 2 (<slug>) est
      prête à l'usage. », « Packs Syndic, cycle mensuel », « fin d'essai le »
      J + 30.
- [ ] « Lien d'invitation » de la forme
      `http://localhost:3300/auth/accept-invite?token=<uuid>` avec un bouton
      « Copier ». **Copier ce lien** : c'est `INVITE` pour la partie B.
- [ ] « E-mail d'invitation envoyé. » ou, si l'envoi échoue,
      « L'e-mail n'a pas pu être envoyé — copiez le lien et transmettez-le
      vous-même. » (les deux sont acceptables ; on utilise le lien copié dans
      tous les cas).
- [ ] « Ouvrir la fiche » mène à `/admin/tenants/<TENANT>` : noter `TENANT`
      (visible dans l'URL) dans le journal.
- [ ] Onglet « Abonnement » de la fiche : statut **Essai**, « Packs en
      vigueur » Syndic, « Politique de dépassement » **Facturer le
      dépassement**, « Jours de grâce » 7, « Remise de combinaison » 10 %,
      consommation Lots 0 / 100, Copropriétés 0 / 2, Chantiers 0 / 0.

---

## 5. Partie B — Invitation et première connexion

### B.1 Page : `INVITE` (le lien copié à l'étape A.3)

#### Ce qu'on doit faire

1. Se déconnecter du compte super-admin (ou ouvrir une fenêtre de navigation
   privée), ouvrir `INVITE`.
2. Saisir d'abord un mot de passe faible (`faible`), valider.
3. Saisir `SyndicTest#2026` (et le nom `Fatou Recette2` si le formulaire le
   demande), valider.

#### Résultat attendu

- [ ] Mot de passe faible refusé (message sur la longueur ou la complexité).
- [ ] Mot de passe conforme : « Invitation acceptée avec succès. » puis
      redirection vers la connexion ou l'espace de l'agence.
- [ ] Rouvrir `INVITE` : refus, l'invitation est déjà acceptée.

### B.2 Page : `/login`

#### Ce qu'on doit faire

1. Se connecter avec `admin.syndic.recette2@exemple.test` /
   `SyndicTest#2026`.

#### Résultat attendu

- [ ] Connexion réussie, arrivée sur le tableau de bord de l'agence
      (`/tenant/<TENANT>/…`). Pas d'écran « vérifiez votre e-mail ».

---

## 6. Partie C — Ce que voit l'agence

`BASE` = `http://localhost:3300/tenant/<TENANT>`.

### 6.1 Le menu (sidebar du persona Collaborateur d'agence)

#### Résultat attendu

- [ ] En mode par défaut de cette instance (**`warn`**) : **tout le menu est
      visible**, y compris Gestion locative (Baux, Encaisser), Finance ›
      Chantiers et stock, Ventes, CRM, Patrimoine — rien n'est masqué. C'est
      l'état normal (voir section 1) ; ce n'est le cas « module masqué » que
      si Baba a lui-même basculé l'API en `enforce`.
- [ ] Entrée **Syndic** présente dans le menu « Plus », domaine
      « Copropriété », avec les sous-entrées Copropriétés, Copropriété,
      Finances, Assemblées et documents.

### 6.2 Page : `BASE/settings/abonnement`

Accès : menu **Agence › Paramètres de l'agence**, puis bouton
« Voir mon abonnement » (ou directement `BASE/settings/abonnement`).

#### Résultat attendu

- [ ] Carte « Formule » : Statut **Essai**, Cycle **Mensuel**, Packs
      **Syndic**, « Période en cours » J → J + 30, jours d'essai restants
      affichés.
- [ ] Carte « Consommation » : jauges Lots 0 / 100, Copropriétés 0 / 2,
      Chantiers 0 / 0.
- [ ] Carte « Modules » : Syndic.
- [ ] Section Factures : aucune facture (essai en cours) ; **ne pas** essayer
      « Payer en ligne » même si un bouton apparaissait.
- [ ] Carte « Demander une extension » : formulaire présent (Offre
      souhaitée, Quantité, Votre demande) ; « Mes demandes » vide.

---

## 7. Partie D — Copropriétés, lots, dépassement, extensions, modules, lecture seule

### D.1 Copropriétés et lots dans la capacité

#### Ce qu'on doit faire

1. `BASE/properties` : créer l'immeuble A (`Immeuble Les Manguiers
(Recette 2)`, type Immeuble, mode **Vente**). Créer quelques appartements
   sous-biens pour vérifier le principe (le nombre exact n'a pas besoin d'être
   102 pour cette étape, mais la copropriété 1 en aura besoin plus loin — voir
   ci-dessous).
2. Relire la jauge « Lots » de la page Abonnement (6.2).
3. Menu **Syndic** (`BASE/syndics`) : « Nouvelle copropriété » → copropriété 1
   (`Copropriété Les Manguiers (Recette 2)`) liée à l'immeuble A, puis
   copropriété 2 (`Copropriété Les Palmiers (Recette 2)`) sans immeuble.
4. Ouvrir la copropriété 1, onglet Lots : créer les lots `MP1`, `MP2`
   (Parking) et `MC1` (Cave), relire la jauge Lots.
5. Créer les lots `M001` à `M079` (Appartement, tantièmes 10) dans la
   copropriété 1, relire la jauge après chaque lot ou par lots de quelques
   unités.

#### Résultat attendu

- [ ] Après l'étape 1 : jauge Lots toujours **0** (biens en mode Vente : ne
      comptent pas ; un immeuble découpé en sous-biens ne compte jamais).
- [ ] Copropriétés **2 / 2** après l'étape 3.
- [ ] Après les parkings et la cave : Lots toujours **0** (seuls Appartement,
      Bureau et Commercial comptent).
- [ ] Après `M079` : Lots **79 / 100**.

### D.2 Approche des seuils 80 % et 100 %

Les alertes elles-mêmes sont levées par une tâche planifiée que l'agent ne
peut pas déclencher (voir section 1) : on se contente de **constater les
jauges**.

#### Ce qu'on doit faire

1. À 79 lots, noter la jauge affichée sur la page Abonnement (6.2).
2. Créer `M080`, relire la jauge.
3. Créer `M081` à `M100`, relire la jauge.

#### Résultat attendu

- [ ] À 79 lots : Copropriétés **2 / 2** (déjà à 100 %), Lots 79 / 100 (pas
      encore à 80 %).
- [ ] À 80 lots : jauge Lots **80 / 100** — c'est le seuil d'alerte 80 % (à
      constater visuellement ; l'e-mail éventuel n'est pas vérifié par
      l'agent).
- [ ] À 100 lots : jauge Lots **100 / 100** — seuil 100 %.

### D.3 Dépassement en politique par défaut (Facturer le dépassement)

#### Ce qu'on doit faire

1. Créer le lot `M101` dans la copropriété 1.
2. Créer la copropriété 3 (`Copropriété Les Cauris (Recette 2)`).
3. Super-admin : fiche de l'agence (`/admin/tenants/<TENANT>`), onglet
   « Abonnement », carte « Prochaine facture (aperçu) ».

#### Résultat attendu

- [ ] Les deux créations **réussissent** (message de succès, la ligne
      apparaît dans les listes).
- [ ] Jauges (page Abonnement de l'agence) : Lots 101 / 100 (« 1 au-delà du
      plafond »), Copropriétés 3 / 2.
- [ ] Aperçu de facture (super-admin) : ligne `Syndic 49 900`, une ligne de
      dépassement lots (`150`), une ligne de dépassement copropriétés
      (`10 000`), une ligne TVA 18 % ; Total HT **60 050**, Total TTC
      **70 859**. (Les frais de mise en route ne figurent pas dans cet
      aperçu — section 1.)

### D.4 Passage en politique Bloquer et refus (nécessite `enforce`)

> **Nécessite `enforce`.** En `warn` (l'état par défaut de cette instance),
> le changement de politique n'a aucun effet sur les créations : elles
> passent toutes, même au-delà de la capacité (voir section 1). Si l'API
> tourne encore en `warn`, le noter dans le journal et considérer que le
> refus n'est pas testable pour l'instant, sans le traiter comme un échec.

#### Ce qu'on doit faire

1. Super-admin, onglet « Abonnement » : « Politique de dépassement » →
   **Bloquer le dépassement**.
2. Agence (recharger la page) : créer le lot `M102`.
3. Créer la copropriété 4 (`Copropriété Les Fromagers (Recette 2)`).
4. `BASE/properties` : créer un appartement **en location**
   (`Studio Manguiers Location (Recette 2)`, mode Location).

#### Résultat attendu

- [ ] Message de confirmation du changement de politique (« Politique de
      dépassement mise à jour » ou équivalent).
- [ ] Les trois créations sont **refusées** : un message d'erreur apparaît et
      **rien n'est créé** (le lot, la copropriété et le bien en location
      n'apparaissent pas dans les listes après rechargement).
- [ ] Le texte exact du message affiché est à consigner dans le journal.
      Une fois le correctif de cette branche posé, il doit annoncer
      clairement que la capacité de l'abonnement est atteinte ; **avant le
      correctif**, un message d'erreur générique est attendu à la place —
      voir section 1. Dans les deux cas, ce qui compte est que rien ne soit
      créé.

### D.5 Demande d'extension par l'agence

#### Ce qu'on doit faire

1. Agence, `BASE/settings/abonnement`, carte « Demander une extension » :
   « Offre souhaitée » **Bloc de 10 lots**, « Quantité » 1, « Votre demande »
   `Nous avons des lots supplémentaires à intégrer dans la copropriété Les
Palmiers.` → « Envoyer la demande ».
2. Super-admin, fiche de l'agence, onglet « Abonnement », carte « Demandes
   d'extension ».

#### Résultat attendu

- [ ] Confirmation d'envoi côté agence ; « Mes demandes » affiche une ligne
      **En attente**.
- [ ] Côté super-admin : la demande (demandeur Fatou Recette2, offre
      « Bloc de 10 lots », message) avec les actions « Marquer traitée » et
      « Refuser ».

### D.6 Extensions ajoutées par le super-admin, nouvelles tentatives (nécessite `enforce`)

> **Nécessite `enforce`.** Cette étape prolonge D.4 : les refus qu'elle
> attend au fil des extensions ne se produisent qu'en mode `enforce`, pour la
> même raison (voir section 1).

#### Ce qu'on doit faire

1. Super-admin, onglet « Abonnement », carte « Packs et extensions » :
   « Ajouter » → Offre **Bloc de 10 lots**, Quantité 1 ; puis « Ajouter » →
   Offre **Copropriété supplémentaire**, Quantité 1.
2. Agence : recréer le lot `M102`, puis la copropriété 4.
3. Super-admin : ajouter une seconde « Copropriété supplémentaire », quantité 1.
4. Agence : recréer la copropriété 4.
5. Super-admin : sur la demande de D.5, « Marquer traitée ».

#### Résultat attendu

- [ ] Après l'étape 1 : jauges Lots 101 / **110**, Copropriétés 3 / **3**.
- [ ] `M102` est **créé** (102 / 110).
- [ ] La copropriété 4 est encore **refusée** à l'étape 2 : la copropriété 3
      (créée en dépassement) a absorbé la première extension (3 / 3) — c'est
      correct, à noter et non à traiter comme un échec.
- [ ] Après la seconde extension, la copropriété 4 est **créée** (4 / 4).
- [ ] La demande passe **Traitée** côté super-admin et côté agence.
- [ ] Aperçu de facture (super-admin) : `Syndic 49 900`, `Bloc de 10 lots
  1 500`, deux lignes `Copropriété supplémentaire 10 000`, TVA `12 852` ;
      Total HT **71 400**, Total TTC **84 252** ; plus aucune ligne de
      dépassement.

### D.7 Import de lots partiel en politique Bloquer (nécessite `enforce`)

> **Nécessite `enforce`.** L'écart entre unités importables et unités créées
> vient du même blocage de quota que D.4 et D.6 : en `warn`, les 12 unités
> seraient toutes importées (voir section 1).

#### Ce qu'on doit faire

1. `BASE/properties` : créer l'immeuble B (`Immeuble Les Baobabs du Lac
(Recette 2)`) et ses 12 appartements (`Lac Apt L01`…`L12`, mode Vente).
2. Copropriété 2 (Palmiers), onglet Lots : « Importer des lots depuis des
   propriétés », sélectionner l'immeuble B, « Importer ».

#### Résultat attendu

- [ ] 12 unités importables ; **8 créées**, **4 écartées** avec une raison
      liée au quota de lots (il restait 8 places sur 110).
- [ ] Jauge Lots **110 / 110**.

---

## 8. Partie E — Modules non souscrits et lecture seule manuelle (optionnel : `enforce`)

Cette partie suppose que **Baba a lui-même** relancé l'API avec
`SUBSCRIPTION_ENFORCEMENT=enforce`. Si l'API tourne encore en `warn` (l'état
par défaut), sauter E.1 et le noter dans le journal — le menu reste alors
entièrement visible (voir section 1) et il n'y a rien à constater de plus.

### E.1 Module non souscrit (nécessite `enforce`)

#### Ce qu'on doit faire

1. Agence connectée, taper directement dans la barre d'adresse
   `BASE/rental/leases` (gestion locative), puis `BASE/finance/chantiers`
   (chantiers).
2. Par contrôle, ouvrir aussi `BASE/syndics`, `BASE/properties`,
   `BASE/settings/abonnement` (doivent rester ouverts).
3. Revenir au menu (sidebar) : vérifier si les entrées Gestion locative,
   Finance › Chantiers et stock, Ventes, CRM, Patrimoine sont toujours
   visibles ou ont disparu.

#### Résultat attendu

- [ ] En `enforce` : les entrées de menu des modules non souscrits par le
      pack Syndic (Gestion locative, Chantiers/Finance de chantier, CRM,
      Ventes, Patrimoine) sont **masquées**.
- [ ] Ouvrir directement l'adresse d'un module non souscrit affiche une
      notification indiquant que la fonction n'est pas comprise dans
      l'abonnement de l'agence, et la page elle-même reste en état d'erreur de
      chargement (voir section 1 : l'écran dédié n'est pas forcément monté,
      ce n'est pas un échec de l'étape).
- [ ] Les adresses du point 2 restent accessibles normalement.

### E.2 Lecture seule manuelle

#### Ce qu'on doit faire

1. Super-admin, onglet « Abonnement » : « Passer en lecture seule ». Essayer
   d'abord sans motif : refusé. Puis avec un motif, par exemple
   `Recette 2 : lecture seule manuelle`, confirmer.
2. Agence (recharger) : ouvrir `BASE/settings/abonnement`, la liste des
   copropriétés, les lots de la copropriété 1, les factures — en lecture
   seulement.
3. Agence : essayer de modifier la copropriété 1 (par exemple le champ
   « N° d'immatriculation », valeur `RC-RECETTE2`), et essayer de créer un
   bien.
4. Agence : envoyer une nouvelle demande d'extension (Offre « Copropriété
   supplémentaire », Quantité 1, message `Demande envoyée pendant la lecture
seule`).
5. Super-admin : « Lever la lecture seule », confirmer.
6. Agence : refaire la modification du point 3 avec `RC-RECETTE2-001`.

#### Résultat attendu

- [ ] Sans motif : refus (message d'erreur sur le motif). Avec motif :
      confirmation, badge « Lecture seule (manuelle) » et motif affiché sur la
      fiche de l'agence.
- [ ] Page Abonnement de l'agence : bandeau « Compte en lecture seule », motif
      affiché.
- [ ] Les lectures du point 2 fonctionnent normalement (listes, factures,
      abonnement consultables).
- [ ] Les écritures du point 3 sont **refusées** avec une notification
      « Abonnement en lecture seule » (ou équivalent) ; rien n'est modifié ni
      créé.
- [ ] Le point 4 (demande d'extension) est **accepté** — la page « Demander
      une extension » reste ouverte même en lecture seule.
- [ ] Après la levée : la modification du point 6 **réussit**.

---

## 9. Partie F — Nettoyage de l'agence de test

Il n'existe **aucune route de suppression d'agence** (une agence porte un
plan de comptes, des journaux et des factures numérotées sans trou). On la
neutralise :

1. Super-admin, `/admin/tenants/<TENANT>` : bouton **« Suspendre »**.
   L'agence n'est plus accessible à ses membres ; le bouton « Réactiver » la
   rouvrirait si nécessaire.
2. Facultatif : sur l'onglet « Abonnement », retirer les extensions et le
   pack « immédiatement » avec une raison du type `Agence de recette`, pour
   qu'aucune facture ne soit émise à la fin de l'essai.
3. **Ne rien faire en base de données.** Si une purge devient nécessaire,
   c'est à Baba de la faire, sur une copie de la base — jamais depuis ce
   scénario.

Le compte `admin.syndic.recette2@exemple.test` reste en base ; il devient
inutilisable une fois l'agence suspendue.

---

## 10. Journal de test

| Étape | Résultat (OK / KO / Noté) | Constaté | Capture |
| ----- | ------------------------- | -------- | ------- |
| A.1   |                           |          |         |
| A.2   |                           |          |         |
| A.3   |                           |          |         |
| B.1   |                           |          |         |
| B.2   |                           |          |         |
| 6.1   |                           |          |         |
| 6.2   |                           |          |         |
| D.1   |                           |          |         |
| D.2   |                           |          |         |
| D.3   |                           |          |         |
| D.4   |                           |          |         |
| D.5   |                           |          |         |
| D.6   |                           |          |         |
| D.7   |                           |          |         |
| E.1   |                           |          |         |
| E.2   |                           |          |         |
| F     |                           |          |         |

Anomalies à consigner à part : page, action, résultat attendu, résultat
constaté, capture.
