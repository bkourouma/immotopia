# Spécification 041 — Écrans de l'inventaire par WhatsApp

> **Documents liés** : [spec.md](spec.md), [data-model.md](data-model.md),
> [contracts/openapi.yaml](contracts/openapi.yaml) (fait foi pour les données et
> les routes), écrans du lot 040 (`specs/040-controle-stock/ecrans.md`), dont ce
> document reprend les cinq règles (§0.1) sans les répéter.
> Références relatives à `apps/web/src/`. Routes d'API sous
> `/api/tenants/{tenantId}/finance`.

## 0. Principes

1. **L'écran ne montre que ce que le serveur rend.** Une quantité théorique
   reçue à `null` (lieu dans `meta.blindLocationIds`) s'affiche par
   `StockQuantityCell` : « Comptage en cours ». Une valeur reçue à `null`
   (`meta.valuesVisible = false`) fait disparaître la colonne (règle 2 du lot
   040).
2. **Aucun écran ne rapproche une personne d'un écart.** L'écran Comptages
   terrain montre « comptée par » à côté d'une quantité comptée, jamais à côté
   d'un écart (il n'en calcule aucun).
3. **Téléphones masqués** (`phoneMasked`) partout, sauf la fiche d'inscription,
   réservée à `FINANCE_SETTINGS_MANAGE`.
4. **Le code d'activation s'affiche une fois.** Fermer la fenêtre le perd ;
   l'écran le dit et propose « Régénérer le code ».
5. Libellés par `t()`, texte français = clé ; marges logiques ; mots interdits
   du lot 040 exclus.

## 1. Inventaire des écrans

| #    | Écran                                      | Route web                                           | Fichier                                                                                                                                                                                                                      | Statut   | Accès                                   |
| ---- | ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------- |
| W-E1 | Onglet « WhatsApp » de Gestion du stock    | `/tenant/:tenantId/finance/stock/whatsapp`          | `pages/finance/StockWhatsapp.tsx` (+ `components/finance/stock/whatsapp/`)                                                                                                                                                   | nouveau  | `FINANCE_SETTINGS_MANAGE`               |
| W-E2 | Comptages terrain                          | `/tenant/:tenantId/finance/stock/comptages-terrain` | `pages/finance/StockComptagesTerrain.tsx`                                                                                                                                                                                    | nouveau  | `STOCK_VIEW`                            |
| W-E3 | Visualiseur de preuve (tiroir)             | `?capture=<captureId>` sur W-E2 et sur l'Inventaire | `components/finance/stock/whatsapp/FieldCaptureDrawer.tsx`                                                                                                                                                                   | nouveau  | `STOCK_VIEW` (conversation : voir §4.4) |
| W-E4 | Inventaire (lot 040) : badge et lien photo | `/tenant/:tenantId/finance/stock/inventaire`        | `pages/finance/StockInventaire.tsx` (point d'accroche)                                                                                                                                                                       | retouché | inchangé                                |
| W-E5 | Abonnement et catalogue : capacité         | écrans existants                                    | `pages/tenant/TenantSubscriptionSettings.tsx`, `components/admin/tenant-detail/SubscriptionTab.tsx`, `components/admin/CreateTenantDrawer.tsx`, `utils/subscription-denial-notice.ts`, `services/subscription-v2-service.ts` | libellés | inchangé                                |
| W-E6 | Rôles et membres : « Chef de chantier »    | écrans existants                                    | `constants/permissions-labels.ts`                                                                                                                                                                                            | libellés | inchangé                                |
| W-E7 | Journal d'activité                         | `/tenant/:tenantId/activity`                        | `constants/audit-labels.ts`                                                                                                                                                                                                  | libellés | `TENANT_AUDIT_VIEW`                     |
| W-E8 | Contrôle (lot 040) : nature d'alerte       | `/tenant/:tenantId/finance/stock/controle`          | `types/finance-stock-controle-types.ts` (libellé de nature)                                                                                                                                                                  | libellé  | inchangé                                |

Toutes les routes sont sous `finance/stock` : déjà classées `CONSTRUCTION`
(ecrans 040 §1). Pages en `React.lazy`, chunk `finance`, montées dans
`<FinanceWorkspaceLayout family="gestion-stock" />` (`App.tsx:1198-1200` pour
les routes voisines).

## 2. Navigation

`navigation/finance-workspaces.tsx:195` (espace `gestion-stock`) reçoit deux
onglets, après « Contrôle » du lot 040 :

| Ordre | Clé                       | Libellé           | Route                              | Icône              |
| ----- | ------------------------- | ----------------- | ---------------------------------- | ------------------ |
| 6     | `stock-comptages-terrain` | Comptages terrain | `/finance/stock/comptages-terrain` | `CameraOutlined`   |
| 7     | `stock-whatsapp`          | WhatsApp          | `/finance/stock/whatsapp`          | `WhatsAppOutlined` |

« Articles et lieux » reste le dernier. Les onglets ne sont filtrés que par
fonctionnalité (ecrans 040 §2.2) : la page W-E1 lit
`FieldContext.abilities.canManageSettings` (lot 040) et affiche l'état refus
§3.5 sans appeler les routes WhatsApp si elle est fausse.

Paramètres reconnus : W-E1 `?onglet=inscriptions|simulateur|mesures` ; W-E2
`?lieu=<locationId>&article=<itemId>&source=WHATSAPP|WEB&capture=<captureId>`.

## 3. W-E2 — Comptages terrain

`PageHeader` « Comptages terrain », sous-titre « Stock théorique et dernier
comptage physique, par lieu et par article ». Texte sous l'en-tête : « Les
comptages faits par WhatsApp entrent dans l'inventaire du lieu. Le stock ne
change qu'à la validation de l'inventaire, par une autre personne que celle qui
a compté. »

**Filtres** (`FilterSheet` sous 992 px) : Chantier, Lieu, Article, Source du
dernier comptage (WhatsApp, Web, toutes).

**Données** : `GET /stock/whatsapp/field-counts` (pagination « Charger
plus ») ; lieux, articles, chantiers par `useStockFieldContext` (lot 040).

**Tableau** (`DataView`, carte sous 992 px) :

| Colonne          | Contenu                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Lieu             | libellé, chantier en secondaire                                                                                     |
| Article          | référence et libellé                                                                                                |
| Stock théorique  | `StockQuantityCell(theoreticalQuantity, unit)` (« Comptage en cours » si `null`)                                    |
| Valeur           | si `valuesVisible` et non `null` : `MoneyValue` ; colonne absente sinon                                             |
| Dernier comptage | `lastCount.countedQuantity` + unité ; « Non compté » si `null` ; « — » si `lastCount` nul                           |
| Date et heure    | `countedAtServer`, « heure du serveur » en infobulle                                                                |
| Compté par       | `countedByLabel`                                                                                                    |
| Source           | pastille « WhatsApp » (`info`) ou « Web » (`neutral`) ; « corrigé » en secondaire si `outcome = CORRECTED`          |
| Inventaire       | statut (libellés §3.6 du lot 040) ; lien « Ouvrir l'inventaire » → `/finance/stock/inventaire?inventaire=<countId>` |
| Photo            | bouton « Voir la photo » si `captureId` et `hasPhoto` → ouvre W-E3 ; « Photo retirée » si `captureId` sans photo    |

**Pas de colonne d'écart** : l'écart se lit dans l'inventaire, après la clôture
du comptage, sous les règles du lot 040. **Pas de vignette dans la liste** :
une lecture de fichier est tracée (lot 040 B5-R8) ; la photo se charge à
l'ouverture du tiroir.

**Bandeau** quand un lieu filtré est dans `meta.blindLocationIds` :
`StockBlindBanner variant="count"` (lot 040).

**Rappel des non comptés** : si un inventaire `COUNTED` de source `WHATSAPP`
est affiché, encadré `info` : « Un inventaire clos par WhatsApp crée une ligne
« non comptée » pour chaque article du lieu qui n'a pas été photographié. Le
validateur peut les écarter en une fois depuis l'inventaire. »

**États** : chargement `Skeleton` ; vide « Aucun comptage pour ces filtres. »
avec, si aucune inscription n'existe et `canManageSettings`, le lien
« Inscrire un chef de chantier » ; erreur : `StateBlock` avec « Réessayer » ;
`403` : « Le stock ne vous est pas ouvert » (texte du lot 040 §3.3) ;
`MODULE_NOT_INCLUDED` : `ModuleNotIncluded`.

## 4. W-E3 — Visualiseur de preuve (tiroir)

`Drawer` (plein écran sous 768 px), titre « Comptage par photo », ouvert par
`?capture=<captureId>`. `GET /stock/whatsapp/captures/{captureId}`.

### 4.1 Photo

Image lue en blob (`GET …/captures/{id}/file`, `responseType: 'blob'`), puis
`URL.createObjectURL`, révoquée au démontage (forme de
`components/rental/inspections/InspectionPhotoImage.tsx`). Zoom au clic
(`Image` d'Ant Design, aperçu). Photo retirée : cadre gris « Photo retirée le
{{date}} par {{nom}} — motif : {{motif}} », empreinte conservée.

### 4.2 Preuve

- « Reçue le {{date}} à {{heure}} (heure du serveur) » (`receivedAt`).
- « Empreinte : 3fa9…c21e » + « Copier l'empreinte complète » ; infobulle
  « Empreinte enregistrée : toute modification du fichier serait détectable. »
  (jamais « infalsifiable »).
- « Reçue par : WhatsApp » ou « Reçue par : simulateur (recette) » (`via`).
- Chef : `chefLabel`. Chantier, lieu.

### 4.3 Analyse

- Article : libellé et référence ; « choisi par le chef de chantier » si
  `itemImposed`.
- Méthode (libellés : `SACKS_STACKED` « Sacs empilés », `BARS_BUNDLE` « Barres
  ou tubes en fagot », `BLOCKS_PALLET` « Blocs sur palette », `OTHER` « Autre »)
  et détail (unités de face, couches × colonnes, rangées en profondeur).
- « Total proposé par l'IA » (`proposedTotal`), « Confiance » en pourcentage
  arrondi, « Qualité de la photo » (`OK` « Bonne », `TOO_DARK` « Trop sombre »,
  `BLURRY` « Floue », `NOT_STOCK` « Aucun matériau visible »), explication de
  l'IA en citation.
- Fournisseur, modèle, durée de l'analyse (secondaire).
- Échec : « L'analyse n'a pas abouti » + raison (`TIMEOUT` « délai dépassé »,
  `PROVIDER_ERROR` « service indisponible », `INVALID_OUTPUT` « réponse
  illisible », `DISABLED` « analyse désactivée »).

### 4.4 Ce que le chef a fait

- « Quantité retenue » (`confirmedQuantity`) et mode : « Validée telle quelle »
  (`ACCEPTED`), « Corrigée par le chef » (`CORRECTED`), « Annulée »,
  « Abandonnée (sans réponse) » (`EXPIRED`), « Photo illisible »,
  « Article non reconnu », « Analyse en échec ».
- Si `mergeMode` : « Ajoutée au comptage existant : ligne portée à
  {{lineQuantityAfter}} » ou « A remplacé le comptage existant ».
- Lien « Ouvrir l'inventaire » (statut de l'inventaire en pastille).
- **Extrait de conversation** : si `canReadConversation`, bouton « Voir la
  conversation » → `GET /stock/whatsapp/sessions/{sessionId}/messages`, bulles
  entrantes à gauche, sortantes à droite (`margin-inline-start: auto`, l'arabe
  inverse), boutons proposés en pastilles sous la bulle, message lié à la
  capture surligné. Sinon le bouton n'existe pas.

### 4.5 Retrait de la photo

Bouton « Retirer la photo » si `canRemovePhoto` → fenêtre « Retirer cette
photo ? Le fichier sera effacé. Le comptage et l'empreinte restent. Faites-le
par exemple si la photo montre une personne. » + « Motif » (3 à 500) →
`POST …/remove-photo`. `409 STOCK_WHATSAPP_PHOTO_ALREADY_REMOVED` : relecture.

## 5. W-E1 — Onglet WhatsApp

`PageHeader` « Inventaire par WhatsApp », sous-titre « Chefs de chantier,
quota du mois et état de la passerelle ». Trois sous-onglets.

### 5.1 En-tête commun : passerelle et quota

`GET /stock/whatsapp/overview`.

- Carte « Passerelle » : `meta` « Connectée à WhatsApp » (`success`) ou
  « Configuration incomplète » (`warning`) si `gatewayReady` est faux ;
  `log` « Mode recette : aucun message n'est envoyé, utilisez le simulateur »
  (`info`) ; `disabled` « Désactivée sur ce serveur » (`neutral`). Numéro du bot
  (`botNumber`) en gros, avec « Copier ».
- Carte « Photos analysées ce mois-ci » : `used / limit` et barre de
  progression ; `source` : `OPTION` « {{blocks}} bloc(s) de 500 photos » ;
  `WARN_FALLBACK` « Option non souscrite : quota provisoire de {{limit}}
  photos, le temps de la mise en place » ; `NONE` « Option non souscrite. Le
  bot refuse les photos. » avec, pour un administrateur, le lien vers l'écran
  d'abonnement ; à 80 % et plus, ton `warning`.
- Carte « Analyse » : fournisseur et modèle ; `disabled` : « L'analyse des
  photos est désactivée sur ce serveur : le bot répondra qu'il ne peut pas
  analyser les photos. »

### 5.2 Sous-onglet « Chefs de chantier » (inscriptions)

`GET /stock/whatsapp/registrations`. Tableau (`DataView`) : Chef, Téléphone
(`phoneMasked`), Chantiers (pastilles ; un chantier non éligible barré avec la
raison en infobulle), État (`PENDING_ACTIVATION` « En attente du code »
`warning`, avec l'échéance ; `ACTIVE` « Actif » `success` ; `REVOKED`
« Révoqué » `neutral`), Accès (si `access.ok` est faux : pastille `warning`
avec la raison : « Agence suspendue », « Adhésion inactive », « Compte
désactivé », « Rôle Chef de chantier retiré », « Option non souscrite »),
Dernier message, Actions.

Actions : « Modifier les chantiers » (fenêtre multi-choix,
`GET /stock/whatsapp/eligible-sites`, 10 au plus) ; « Régénérer le code »
(en attente) ; « Révoquer » (fenêtre : « Révoquer l'accès de {{nom}} ? Le bot
refusera ses prochains messages. Une photo en attente de réponse sera
abandonnée. » + « Motif » facultatif) ; « Voir les conversations » (filtre
de la liste des sessions).

Bouton « Inscrire un chef de chantier » → fenêtre :

1. « Chef de chantier » : `GET /stock/whatsapp/eligible-members` ; membres déjà
   inscrits désactivés (« déjà inscrit ») ; liste vide : « Aucun membre n'a le
   rôle Chef de chantier. Attribuez-le dans Paramètres › Collaborateurs. » avec
   le lien.
2. « Numéro WhatsApp » (`inputMode="tel"`), aide « Format ivoirien accepté
   (07 12 34 56 78) ou international (+225…). »
3. « Chantiers » (1 à 10), aide « Seuls les chantiers ouverts et basculés au
   stock sont proposés. »
4. Encadré : « Le chef de chantier enverra un code au numéro WhatsApp
   d'ImmoTopia. Ce message prouve qu'il utilise bien ce numéro et vaut son
   accord pour recevoir les réponses du bot. »

Après `201` : fenêtre « Code d'activation » : code en grand (6 chiffres,
police à chasse fixe, groupés 3 + 3), numéro du bot, échéance (« valable
72 heures, 5 essais »), consigne à transmettre au chef : « Ouvrez WhatsApp,
écrivez au {{botNumber}} et envoyez ce code : {{code}}. », bouton « Copier la
consigne ». Avertissement : « Ce code ne sera plus affiché. Notez-le ou
régénérez-en un plus tard. »

Erreurs de la fenêtre : `STOCK_WHATSAPP_PHONE_INVALID` et
`STOCK_WHATSAPP_PHONE_UNAVAILABLE` sur le champ numéro (message du serveur) ;
`STOCK_WHATSAPP_SITE_NOT_ELIGIBLE` : chantiers de `data.siteIds` en erreur ;
`STOCK_WHATSAPP_MEMBER_NOT_ELIGIBLE` : sur le champ chef, liste rechargée.

Texte d'information sous le tableau (données personnelles) : « Le numéro sert
seulement à reconnaître le chef de chantier. Les photos reçues sont analysées
par un service d'intelligence artificielle et conservées comme preuve de
l'inventaire. Informez vos chefs de chantier avant de les inscrire. »

### 5.3 Sous-onglet « Simulateur » (si `simulatorAvailable`)

Absent sinon. Bandeau `warning` : « Simulateur de recette : les messages ne
partent pas sur WhatsApp. »

- Choix de l'expéditeur : une inscription de l'agence (chef, état) ou
  « Numéro inconnu » (champ libre).
- Fil de conversation (même rendu que §4.4), rafraîchi après chaque envoi puis
  toutes les 2 s pendant 30 s (`GET …/simulator/conversation?after=`).
- Saisie : champ texte « Écrire un message » + « Envoyer » ; bouton « Envoyer
  une photo » (`Upload`, `accept="image/jpeg,image/png,image/webp"`, 10 Mo) avec
  champ « Légende » et aide « Le fournisseur de recette lit les directives
  fake:… de la légende (fake:dark, fake:unknown, fake:item=REF;total=60;conf=0.5). » ;
  les boutons et lignes de liste d'un message du bot sont cliquables et
  envoient la réponse (`replyId`, `replyTitle`).
- « Avancer de 10 minutes », « Avancer de 30 minutes » (session ouverte
  seulement, W13-R5).

### 5.4 Sous-onglet « Mesures »

`overview.measures` du mois choisi (sélecteur de mois) en `StatCard` : Photos
analysées ; Délai médian jusqu'à la confirmation (objectif « moins de 45 s ») ;
Comptages validés sans correction (objectif « 88 % et plus ») ; Lignes avec
photo de preuve (objectif « 100 % ») ; Photos illisibles ; Articles non
reconnus ; Analyses en échec. Mention : « Mesures de l'agence entière. Aucune
mesure par personne. »

### 5.5 Refus

Sans `canManageSettings` : `StateBlock variant="forbidden"` « Réservé aux
administrateurs du stock » / « L'inscription des chefs de chantier demande le
droit de paramétrer la finance. » ; sans appel aux routes WhatsApp.

## 6. W-E4 — Inventaire du lot 040 (point d'accroche)

Fichier `pages/finance/StockInventaire.tsx` (propriétaire WEB-2 du lot 040 ;
dans ce lot : territoire W5, retouche limitée à ce qui suit).

- Au chargement du détail d'un inventaire : `GET
/stock/whatsapp/counts/{countId}/captures` (une requête, `staleTime` court ;
  `403` ou `404` ignorés : l'écran reste celui du lot 040).
- `source = WHATSAPP` : pastille « Ouvert par WhatsApp » à côté du statut.
- Ligne dont l'article figure dans `lines` : pastille « WhatsApp » dans la
  colonne « Compté par », et bouton icône « Photo » (`hasPhoto`) qui ouvre W-E3
  (`?capture=<captureId>`). `capturesCount > 1` : « {{n}} photos ».
- Rien d'autre ne change : attendus, écarts, justification, validation suivent
  le lot 040.

## 7. Composants

| Composant                                                  | Rôle                                                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/finance/stock/whatsapp/FieldCaptureDrawer.tsx` | W-E3 ; propriétés `{ tenantId, captureId, onClose }`.                                                                                                                              |
| `…/whatsapp/ConversationThread.tsx`                        | Bulles, boutons et listes ; propriétés `{ messages, highlightCaptureId?, onReply? }` (W-E3 et simulateur).                                                                         |
| `…/whatsapp/RegistrationForm.tsx`                          | Fenêtre d'inscription (§5.2).                                                                                                                                                      |
| `…/whatsapp/ActivationCodeModal.tsx`                       | Affichage unique du code.                                                                                                                                                          |
| `…/whatsapp/WhatsappSimulator.tsx`                         | §5.3.                                                                                                                                                                              |
| `…/whatsapp/WhatsappOverviewCards.tsx`                     | §5.1.                                                                                                                                                                              |
| Réutilisés du lot 040                                      | `StockQuantityCell`, `StockBlindBanner`, `useStockFieldContext`, libellés de statut d'inventaire (`types/finance-stock-controle-types.ts`).                                        |
| Réutilisés du dépôt                                        | `PageHeader`, `DataView`, `FilterSheet`, `StateBlock`, `StatusTag`, `StatCard`, `MoneyValue`, `ModuleNotIncluded` (`components/primitives/`), `saveBlob`, `describeDownloadError`. |

Services (`services/finance-stock-whatsapp-service.ts`, nouveau) et types
(`types/finance-stock-whatsapp-types.ts`, nouveau, recopie du contrat, noms
identiques) : une fonction par route du contrat ; les lectures qui rendent
`meta` renvoient `{ data, meta }`. Réseau par `utils/api-client` uniquement.

## 8. Tests Vitest

| Fichier (`__tests__/finance/`)                                            | Ce qu'il vérifie                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock-whatsapp.test.tsx` (nouveau)                                       | Refus sans `canManageSettings` sans appel réseau ; inscription : erreurs sur les bons champs ; code affiché une fois puis plus jamais après fermeture ; révocation ; simulateur absent si `simulatorAvailable` faux ; boutons du bot cliquables dans le simulateur. |
| `stock-comptages-terrain.test.tsx` (nouveau)                              | `theoreticalQuantity = null` → « Comptage en cours » ; `valuesVisible = false` → aucune colonne Valeur, aucun « 0 FCFA » ; aucune colonne d'écart ; aucune lecture de fichier avant l'ouverture du tiroir.                                                          |
| `stock-capture-drawer.test.tsx` (nouveau)                                 | Blob révoqué au démontage ; photo retirée ; empreinte copiée ; « Voir la conversation » absent si `canReadConversation` faux ; libellés des issues.                                                                                                                 |
| `stock-inventaire.test.tsx` (lot 040, **étendu**)                         | Pastilles « Ouvert par WhatsApp » et « WhatsApp » ; `404` de la route des captures sans effet sur l'écran.                                                                                                                                                          |
| `corps-des-requetes.test.ts` (**étendu**)                                 | Corps des écritures WhatsApp : aucun ne répète `tenantId` ; l'inscription n'envoie que `userId`, `phone`, `siteIds`.                                                                                                                                                |
| `stock-vocabulaire.test.ts` (lot 040, **étendu**)                         | Fichiers `whatsapp/` et pages du lot.                                                                                                                                                                                                                               |
| `__tests__/navigation/finance-workspace-tabs-access.test.ts` (**étendu**) | Deux onglets de plus, ordre.                                                                                                                                                                                                                                        |

Tests en français (`setupTests.ts`) ; chaque `vi.mock` déclare tous les
exports utilisés (AGENTS.md, pièges).

## 9. Wiki des fonctionnalités (à reporter par l'intégration)

Sous-fonctionnalités ajoutées : Inscription d'un chef de chantier (numéro,
chantiers, code) ; Révocation d'un chef de chantier ; Comptage du stock par
photo WhatsApp ; Analyse IA d'une photo de stock ; Comptages terrain
(réconciliation) ; Visualiseur de preuve photo ; Retrait d'une photo de
comptage ; Quota mensuel de photos ; Simulateur WhatsApp (recette) ; Mesures de
l'inventaire WhatsApp. Modifiées : Inventaire physique (badge WhatsApp, lien
photo) ; Alertes de stock (nature « Inventaire de chantier clos par
WhatsApp ») ; Catalogue d'abonnement (option Inventaire WhatsApp) ; Rôles
(Chef de chantier).
