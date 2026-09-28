# Partie D — CRM et Ventes

Mise en place des contacts de l'opérateur, ouverture d'une affaire de vente
sur le Terrain Bingerville OI, matching, mandat de vente, offre, compromis et
commission — puis vérification des droits d'un Agent sur ce domaine. Couvre
le domaine « CRM et Ventes »
(`docs/fonctionnalites/sous-fonctionnalites.md`).

---

## Prérequis

- Parties B et C terminées : opérateur actif, Terrain Bingerville OI créé
  (mode Vente, propriété de l'agence).
- Compte utilisé pour la création : admin.oi@recette.test, sauf D.15 (Agent).

## Réalité de l'environnement

- **Deux implémentations parallèles du matching et de la shortlist.** Le
  wiki liste une route « historique » (`crm-matching-controller`,
  `/deals/:id/match`, `/deals/:id/properties/legacy`,
  `/deals/:id/properties/:propertyId/status/legacy`) conservée pour
  compatibilité ascendante à côté de la route « principale »
  (`property-matching-service`). L'écran (`PropertyMatching.tsx`, monté
  depuis `DealDetail.tsx`) n'expose qu'un seul bouton « Rechercher des
  correspondances » : il n'y a pas deux parcours visibles, seulement deux
  implémentations serveur pour le même geste à l'écran.
- **Droits de matching plus stricts que les autres droits CRM.** L'Agent a
  `CRM_MATCHING_VIEW` (peut consulter les correspondances) mais pas
  `CRM_MATCHING_RUN` (ne peut pas lancer une recherche ni ajouter à la
  shortlist) — seuls Admin et Gestionnaire l'ont par défaut. Vérifié en D.15.
- **Le vendeur d'un mandat de vente est un `TenantClient` de type
  Propriétaire (`OWNER`), pas un contact CRM brut.** Le sélecteur
  « Vendeur (propriétaire) » du formulaire de mandat
  (`apps/web/src/pages/sales/selectors.tsx`, `SellerClientSelect`) ne liste
  que les `TenantClient` existants. Kouassi Yao OI a déjà été enregistré
  comme propriétaire lors de la création de la Villa Riviera OI (partie C,
  bien `CLIENT` avec `ownerEmail`) : il doit donc apparaître dans cette
  liste sans étape supplémentaire. Si ce n'est pas le cas, le consigner
  comme anomalie plutôt que de créer une fiche `TenantClient` par un autre
  biais non prévu par le scénario.
- **Un seul mandat ACTIF par bien.** Impossible de créer un second mandat de
  vente sur le Terrain Bingerville OI tant que le premier est actif — les
  sous-fonctionnalités « Révoquer un mandat », « Annuler un compromis » et
  « Supprimer une condition suspensive » ne sont donc pas testées ici (elles
  détruiraient le seul mandat/compromis prévu par le jeu de données de ce
  scénario) : voir « Hors interface ».
- **La commission de vente naît automatiquement.** Elle est créée par le
  passage à l'acte (`POST .../agreements/:id/complete`), pas par une action
  distincte : la carte « Commissions de vente » ne contient rien tant que
  D.12 n'est pas jouée.
- **Le bien change de statut par effet de bord, jamais par un bouton dédié**
  (voir partie C) : acceptation de l'offre → `UNDER_OFFER` (Réservé/Sous
  offre), passage à l'acte → `SOLD`.
- **La conversion en client (rôles CRM) est cumulative.** « Mettre à jour les
  rôles d'un contact » remplace l'état désiré en une passe ; un contact
  repasse en `LEAD` si on retire son dernier rôle actif.

---

## Jeu de données créé dans cette partie

Contacts **Kouassi Yao OI** (déjà propriétaire depuis la partie C — on lui
ajoute ici le rôle CRM Propriétaire), **Aminata Traoré OI** (locataire),
**Mariam Koné OI** (acquéreuse, `mariam.oi@recette.test`), **Ibrahim Diallo
OI** (copropriétaire) ; une affaire de vente sur le Terrain Bingerville OI ;
un mandat de vente, une offre, un compromis, un acte et une commission sur ce
même terrain.

---

### D.1 — Créer les quatre contacts CRM

**Compte :** admin.oi@recette.test
**Action :** menu **CRM > Contacts** (`/tenant/<TENANT>/crm/contacts`) →
bouton « Nouveau contact » (`apps/web/src/pages/crm/Contacts.tsx`). Créer,
avec type de contact **Personne physique**, prénom/nom, e-mail personnel et
commune (champs obligatoires du formulaire,
`apps/web/src/components/crm/ContactForm.tsx`) :

- Kouassi Yao OI — s'il existe déjà (créé implicitement en partie C via
  `ownerEmail`), ouvrir sa fiche plutôt que d'en recréer un doublon.
- Aminata Traoré OI (`locataire.oi@recette.test`).
- Mariam Koné OI (`mariam.oi@recette.test`).
- Ibrahim Diallo OI (`copro.oi@recette.test`).
  Sur la fiche d'un des contacts (ex. Aminata), assigner un tag existant ou en
  créer un nouveau (« Prospect OI »), puis le retirer.
  **Attendu :** chaque contact créé (201) apparaît dans la liste filtrable
  (**CRM > Contacts**) avec pagination ; sa fiche de détail affiche rôles,
  affaires, activités, tags, zones ciblées ; un champ obligatoire vide (ex.
  prénom) refuse l'enregistrement avec le message correspondant.
  **Couvre :** CRM > Contacts / Créer un contact ; Consulter le détail d'un
  contact ; Lister et filtrer les contacts ; Modifier un contact ; Assigner un
  tag à un contact ; Retirer un tag d'un contact ; Consulter les tags d'un
  contact ; Lister les tags de l'agence (référentiel) ; Créer un tag
  (référentiel).

### D.2 — Convertir les contacts en clients

**Compte :** admin.oi@recette.test
**Action :** sur chaque fiche contact, bouton « Convertir »
(`apps/web/src/components/crm/ContactDetail.tsx`) :

- Kouassi Yao OI → rôle **Propriétaire (Owner)**.
- Aminata Traoré OI → rôle **Locataire (Renter)**.
- Mariam Koné OI → rôle **Acquéreur (Buyer)**.
- Ibrahim Diallo OI → rôle **Copropriétaire (Co-owner)**.
  Sur l'un d'eux, ouvrir ensuite « Gérer les rôles »
  (`ManageRolesDialog.tsx`) pour ajouter un second rôle puis le retirer.
  **Attendu :** chaque contact passe en statut **Client actif** avec le rôle
  choisi ; la synchronisation des rôles (ajout puis retrait) laisse le contact
  avec son seul rôle d'origine, jamais repassé en `LEAD` tant qu'il lui reste
  un rôle actif.
  **Couvre :** CRM > Contacts / Convertir un lead en client ; Mettre à jour les
  rôles d'un contact ; Supprimer un rôle de contact.

### D.3 — Recherche avancée et export

**Compte :** admin.oi@recette.test
**Action :** **CRM > Contacts**, barre de recherche avancée : filtrer par
rôle « Acquéreur » (retrouve Mariam Koné OI). Sauvegarder cette recherche
sous un nom (« Acquéreurs OI »), la retrouver dans « Mes recherches », la
relancer, puis l'exporter en CSV, et enfin la supprimer.
**Attendu :** les suggestions de valeurs proposent des complétions sur le
champ filtré ; la recherche sauvegardée apparaît dans la liste des
recherches de l'utilisateur ; la relancer redonne les mêmes résultats ;
l'export déclenche un téléchargement CSV ; la suppression la retire de la
liste.
**Couvre :** CRM > Contacts > Recherche avancée / Recherche avancée
multi-critères ; Suggestions de valeurs pour un champ ; Sauvegarder une
recherche ; Lister ses recherches sauvegardées ; Réutiliser une recherche
sauvegardée ; Supprimer une recherche sauvegardée ; Exporter les résultats en
CSV.

### D.4 — Tableau de bord CRM et calendrier

**Compte :** admin.oi@recette.test
**Action :** menu **CRM > Tableau de bord CRM**
(`/tenant/<TENANT>/crm/dashboard`), puis **CRM > Calendrier**
(`/tenant/<TENANT>/crm/calendar`). Sur une activité affichant une date de
relance, reprogrammer la date, puis marquer une relance comme terminée.
**Attendu :** le tableau de bord affiche KPIs (nouveaux leads, conversions,
deals créés/gagnés, actions en retard), pipeline, funnel ; le calendrier
liste les relances (`nextActionAt`) et les visites de biens sur la période,
filtrable par portée (Global/Moi) et par type ; la reprogrammation et le
« marquer terminée » mettent à jour l'activité sans recharger la page.
**Couvre :** CRM > Tableau de bord CRM / Consulter le tableau de bord CRM ;
CRM > Calendrier / Consulter le calendrier CRM ; Reprogrammer une relance ;
Marquer une relance comme terminée.

### D.5 — Créer l'affaire de vente sur le Terrain Bingerville OI

**Compte :** admin.oi@recette.test
**Action :** menu **CRM > Affaires** (`/tenant/<TENANT>/crm/deals`) →
« Nouvelle affaire » (`apps/web/src/pages/crm/Deals.tsx`) : contact
**Mariam Koné OI**, type **Vente**, budget en rapport avec le terrain, zone
Bingerville. Sur le détail de l'affaire, faire évoluer l'étape (NEW →
QUALIFIED).
**Attendu :** l'affaire est créée avec l'étape initiale `NEW`, version 1 ;
elle apparaît dans **CRM > Affaires** (liste filtrable par type, étape,
assigné, contact, budget, dates) ; le changement d'étape utilise le
verrouillage optimiste par `version` (un second changement concurrent avec
une version obsolète serait refusé en 409, non testé ici).
**Couvre :** CRM > Affaires / Créer une affaire (deal) ; Consulter le détail
d'une affaire ; Lister et filtrer les affaires ; Modifier une affaire /
changer son étape de pipeline.

### D.6 — Journaliser une activité liée à l'affaire

**Compte :** admin.oi@recette.test
**Action :** sur la fiche de Mariam Koné OI ou de l'affaire, ajouter une
activité (type Appel ou Note, contenu, `dealId` de l'affaire de vente),
puis consulter **CRM > Activités** (`/tenant/<TENANT>/crm/activities`).
**Attendu :** l'activité créée met à jour `lastInteractionAt` du contact ;
elle apparaît dans la liste paginée, filtrable par contact, affaire, type,
auteur, période.
**Couvre :** CRM > Activités / Créer une activité ; Lister et filtrer les
activités.

### D.7 — Matching de biens pour l'affaire

**Compte :** admin.oi@recette.test
**Action :** détail de l'affaire de Mariam Koné OI, carte « Recherche de
correspondances » (`apps/web/src/components/properties/PropertyMatching.tsx`,
monté dans `DealDetail.tsx`) → bouton « Rechercher des correspondances ».
Ajouter le Terrain Bingerville OI à la shortlist, puis changer son statut
(ex. « Visité »).
**Attendu :** un score de correspondance et son détail (budget,
localisation, taille, caractéristiques, cohérence prix) s'affichent par
bien proposé ; « Ajouter à la shortlist » crée une entrée `CrmDealProperty`
en statut `SHORTLISTED` ; le changement de statut la met à jour.
**Couvre :** CRM > Affaires > Matching de biens / Lancer un matching de biens
(route principale) ; Consulter les correspondances d'une affaire ; Ajouter
un bien à la sélection (route principale) ; Changer le statut d'un bien dans
la sélection (route principale). Les variantes « route historique »
(`/match`, `/properties/legacy`, `/status/legacy`) sont le même geste côté
écran — aucune action supplémentaire à l'interface.

### D.8 — Tableau des ventes

**Compte :** admin.oi@recette.test
**Action :** menu **Ventes > Tableau des ventes**
(`/tenant/<TENANT>/sales`, `apps/web/src/pages/sales/SalesDashboard.tsx`).
**Attendu :** indicateurs affichés (mandats actifs/expirés et leur valeur,
offres ouvertes, compromis signés et leur valeur, ventes du mois,
commissions dues/encaissées ce mois), tous à zéro avant D.9.
**Couvre :** Ventes > Tableau des ventes / Consulter le tableau des ventes.

### D.9 — Créer le mandat de vente sur le Terrain Bingerville OI

**Compte :** admin.oi@recette.test
**Action :** menu **Ventes > Mandats de vente**
(`/tenant/<TENANT>/sales/mandates`) → « Nouveau mandat »
(`apps/web/src/pages/sales/SaleMandates.tsx`) : Bien = Terrain Bingerville
OI, Vendeur (propriétaire) = Kouassi Yao OI, Type de mandat **Simple**, Prix
demandé (> 0), Honoraires — mode **Pourcentage** avec un taux entre 0 et
20 %, Honoraires à la charge du **Vendeur**. Ouvrir le mandat créé, le
modifier (ajuster le prix), puis consulter la liste filtrée par statut.
**Attendu :** le mandat est créé avec un numéro séquentiel par année, statut
**Actif** ; un seul mandat actif est autorisé par bien (une seconde
tentative sur le même terrain serait refusée) ; la modification échoue si un
compromis `SIGNED`/`COMPLETED` existe déjà sur ce mandat (pas le cas ici).
**Couvre :** Ventes > Mandats de vente / Lister et filtrer les mandats de
vente ; Créer un mandat de vente ; Consulter le détail d'un mandat ; Modifier
un mandat.

### D.10 — Offre de Mariam Koné OI et décision

**Compte :** admin.oi@recette.test
**Action :** sur le mandat, onglet Offres → « Nouvelle offre » : acquéreur
Mariam Koné OI, montant, mode de financement, affaire liée (celle de D.5).
Sur l'offre créée, choisir la décision **Accepter**.
**Attendu :** l'offre est créée avec un numéro séquentiel ; l'acceptation
réserve le bien (passage en `UNDER_OFFER`) et n'autorise qu'une seule offre
`ACCEPTED` vivante par mandat à la fois.
**Couvre :** Ventes > Mandats de vente > Offres / Enregistrer une offre
d'achat ; Décider d'une offre (contrer / accepter / refuser / retirer) —
seule l'acceptation est exercée, la contre-offre/le refus/le retrait relèvent
du même écran mais ne sont pas testés sur cette offre unique.

### D.11 — Générer le compromis, conditions et échéancier

**Compte :** admin.oi@recette.test
**Action :** sur l'offre acceptée, bouton « Créer le compromis » : prix
repris de l'offre, dépositaire **Notaire**. Sur le compromis créé
(`/tenant/<TENANT>/sales/agreements/:id`) : ajouter une condition
suspensive (ex. « Obtention du prêt », échéance), consulter la liste et le
détail des compromis (**Ventes > Mandats de vente**, détail), modifier le
compromis (date d'acte prévue), remplir l'échéancier de paiement de
l'acquéreur (une ou plusieurs échéances), puis passer la condition
suspensive en « satisfaite ».
**Attendu :** le compromis est créé en statut **DRAFT**, un seul par offre ;
la condition ajoutée apparaît sur le détail ; l'échéancier remplacé
remplace entièrement l'ancien (aucune fusion) ; la modification échoue si le
compromis est `COMPLETED`/`CANCELLED` (pas le cas).
**Couvre :** Ventes > Mandats de vente > Compromis / Générer un compromis à
partir d'une offre acceptée ; Lister et filtrer les compromis ; Consulter le
détail d'un compromis ; Modifier un compromis ; Compromis > Conditions
suspensives / Ajouter une condition suspensive ; Modifier une condition
suspensive ; Compromis > Échéancier / Remplacer l'échéancier de paiement.

### D.12 — Signer le compromis et passer à l'acte

**Compte :** admin.oi@recette.test
**Action :** sur le détail du compromis, bouton « Signer le compromis »
(date de signature). Une fois **toutes** les conditions suspensives levées
(satisfaite ou renoncée), bouton « Passer à l'acte » (date de l'acte
authentique).
**Attendu :** signature → statut **SIGNED**, le bien passe en `UNDER_OFFER`
si ce n'était pas déjà le cas ; passage à l'acte → statut **COMPLETED**, le
Terrain Bingerville OI passe en `SOLD`, le mandat passe **COMPLETED**, les
autres offres du mandat se ferment, l'affaire CRM de D.5 passe **WON**, et
une commission de vente est créée automatiquement (message « Vente conclue :
acte signé. »). Tenter de passer à l'acte avant la levée d'une condition
`PENDING`/`FAILED` doit être refusé.
**Couvre :** Ventes > Mandats de vente > Compromis / Signer un compromis ;
Générer l'acte (conclure la vente).

### D.13 — Commissions de vente

**Compte :** admin.oi@recette.test (ou un profil finance si distinct)
**Action :** menu **Ventes > Commissions de vente**
(`/tenant/<TENANT>/sales/commissions`). Ouvrir la commission créée par
D.12, consulter son détail (base, HT/TVA/TTC, part négociateur), enregistrer
un règlement (montant ≤ reste dû, moyen de paiement, compte de trésorerie),
puis l'annuler (contre-passation).
**Attendu :** la liste affiche la commission avec ses totaux (dû/payé/
restant) ; l'encaissement comptabilise automatiquement (compte 70612 + TVA
4432 si assujetti) et recalcule le statut (`DUE` → `PARTIALLY_PAID`/`PAID`) ;
l'annulation contre-passe l'écriture et recalcule le statut, avec un motif
obligatoire (≥ 3 caractères).
**Couvre :** Ventes > Commissions de vente / Lister et filtrer les
commissions de vente ; Consulter le détail d'une commission ; Encaisser un
règlement de commission ; Annuler un règlement de commission.

### D.14 — Tableau des ventes après la vente conclue

**Compte :** admin.oi@recette.test
**Action :** revenir sur **Ventes > Tableau des ventes**.
**Attendu :** les indicateurs reflètent la vente conclue (compromis signé du
mois, commission due/encaissée selon D.13) — comparer avec l'état à zéro de
D.8.
**Couvre :** vérification de bout en bout de Ventes > Tableau des ventes
(déjà listé en D.8, ici simple contrôle de cohérence après le cycle complet).

### D.15 — Vérification des droits d'un Agent sur CRM et Ventes

**Compte :** agent.oi@recette.test
**Action :** se connecter. Ouvrir **CRM > Contacts** (créer un contact
test), **CRM > Affaires** (ouvrir l'affaire de Mariam Koné OI, essayer
« Rechercher des correspondances »), puis **Ventes > Mandats de vente**
(essayer d'ouvrir « Nouveau mandat » et de décider une offre si un mandat
est accessible).
**Attendu :**

- Contacts : création et consultation fonctionnent (`CRM_CONTACTS_CREATE`/
  `VIEW`/`EDIT` accordés à l'Agent).
- Affaires : consultation et création fonctionnent
  (`CRM_DEALS_VIEW`/`CREATE`) ; le bouton « Rechercher des correspondances »
  est absent ou son clic est refusé (`CRM_MATCHING_RUN` manquant — l'Agent
  n'a que `CRM_MATCHING_VIEW`).
- Ventes : le menu reste visible (feature `SALES` ouverte par le pack), mais
  la création/modification d'un mandat, la décision sur une offre et la
  génération d'un compromis sont refusées ou masquées (ces actions exigent
  `CRM_DEALS_EDIT`, que l'Agent n'a pas — seuls `CRM_DEALS_VIEW`/`CREATE`
  lui sont accordés).
  Consigner précisément ce qui apparaît à l'écran dans chaque cas (message de
  refus exact, bouton absent ou grisé).
  **Couvre :** vérification pratique des droits du rôle Agent tenant sur le
  domaine CRM et Ventes (complète B.15 et B.5).

---

## Hors interface

- **Révoquer un mandat de vente, Annuler un compromis, Supprimer une
  condition suspensive** — non testés : un seul mandat/compromis existe
  dans le jeu de données de cette partie (Terrain Bingerville OI) et il doit
  rester utilisable jusqu'à D.13 ; les détruire nécessiterait un second
  mandat/compromis non prévu par le cadre commun de ce scénario. À couvrir
  dans un scénario dédié aux annulations de vente si besoin.
- **Décider d'une offre — Contrer / Refuser / Retirer** — le même écran que
  l'acceptation (D.10) ; non exercés faute d'une seconde offre concurrente
  dans le jeu de données.
- **Route « historique » de matching et de shortlist** (`/deals/:id/match`,
  `/properties/legacy`, `/status/legacy`) — mêmes gestes à l'écran que la
  route principale (D.7), aucune action distincte à l'interface.
