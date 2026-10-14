# Spécification 040 — Contrôle du stock de chantier (sprints A et B)

> **Branche** : `feat/controle-stock` · **Créée** : 04/10/2026 · **Statut** : révision 2, prête pour la réalisation
> **Documents liés** : [data-model.md](data-model.md) (schéma, migrations,
> écritures comptables), [contracts/openapi.yaml](contracts/openapi.yaml)
> (routes), [meubles.md](meubles.md) (volet meublés M1 à M5, spécifié à part),
> [ecrans.md](ecrans.md) (écrans), [plan.md](plan.md) (territoires des agents,
> recette, constats écartés).
> **Révision 2 (04/10/2026)** : corrections issues de la critique adverse —
> aveugle étendu aux valeurs et au rapprochement (§8.2), lignes non comptées
> (A2-R8), mise à l'écart et abandon alertés (A2-R6, A2-R7, B7), ouverture
> restreinte (A7-R1), bloqueurs de clôture refondus (A7-R3), retour fournisseur
> valorisé à la ligne de facture (A6-R3), rôles globaux et cache (B1-R2, B1-R6),
> mécanique des alertes et de la tâche d'e-mail (B7-R2, B7-R6), oublis de CI
> (§11, §12).
> **Entrée** : analyse « écarts de stock » du 04/10/2026 (synthèse, contre-vérification,
> modèle de menace en 16 stratagèmes), décisions D1 à D5 du fondateur.
> Toutes les références `fichier:ligne` ont été revérifiées dans le worktree
> (base `e72e960a`, à jour de `origin/main`). Les chemins sont relatifs à
> `packages/api/` sauf mention contraire.

## 1. Objectif

Les clients Promoteur et Opérateur intégré constatent des écarts de stock sur
leurs chantiers. Le module de stock existe (lot 5), il est juste en comptabilité,
mais il n'outille presque pas le contrôle humain : un administrateur compte et
valide seul, l'inventaire montre la quantité attendue à celui qui compte, le
preneur d'une sortie est un texte libre, il n'y a ni bon numéroté, ni photo, ni
alerte.

Ce lot ne prétend pas supprimer les disparitions. Il les rend **visibles,
attribuables à une opération et plus coûteuses à dissimuler** :

- **Sprint A — fermer les failles** (A1 à A11) : quatre yeux sur l'inventaire,
  comptage à l'aveugle, mouvements datés et bornés, motifs typés, types de
  mouvement manquants, contrôles à la bascule et à la clôture d'un chantier,
  contrôle des réceptions et des achats en espèces, verrou de concurrence.
- **Sprint B — attribuer et prouver** (B1 à B8) : rôle Magasinier sans accès aux
  valeurs, carnet des preneurs, parcours mobile en trois gestes, bons PDF
  numérotés, photos avec empreinte, journal d'audit, alertes et indicateurs.

Le système **montre, il ne juge pas** : il constate un écart, demande qu'on le
justifie, et laisse à une personne le soin de le qualifier.

## 2. Décisions du fondateur et leur traduction

| Décision | Contenu                                                                                                                                                  | Traduction dans ce lot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**   | Tout est inclus ; le stock reste sous `CONSTRUCTION`.                                                                                                    | Toutes les routes nouvelles sont sous `/finance/stock` ou `/finance/sites`, déjà classées `CONSTRUCTION` (`src/lib/subscription/route-features.ts:157-162`). Aucune ligne de catalogue, aucune option, aucun changement de gating. La nouvelle clé de notification e-mail est classée `CONSTRUCTION` dans `src/constants/notification-key-features.ts`.                                                                                                                                                                                                                                                                                                                                      |
| **D2**   | Vocabulaire : « écart à justifier », « disparition non expliquée ». Jamais « vol », « voleur », « fraude », « détournement ».                            | Liste fermée de motifs (§4), libellés d'alerte neutres, test de vocabulaire (§11). La doctrine « montré, pas jugé » de `src/lib/finance/stock-rapprochement.ts:54-58` et son test web restent intacts : ce lot n'ajoute au rapprochement que deux couples de champs descriptifs (data-model §4) et le masquage du restant pendant un comptage (§8.2).                                                                                                                                                                                                                                                                                                                                        |
| **D3**   | Périmètre : sprint A + sprint B + gabarit mobilier. Niveau 3 exclu.                                                                                      | §3. Le gabarit mobilier est dans [meubles.md](meubles.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **D4**   | Jamais de retenue ni de sanction automatique ; pas de signalement anonyme ; photos de marchandise et de bons, pas de personnes ; pas de géolocalisation. | Aucun champ « responsable » ni calcul d'imputation d'un écart à une personne. Indicateurs agrégés par lieu, jamais par personne (B8). Métadonnées EXIF retirées des photos à l'écriture (B5). Retrait d'une photo qui montrerait une personne (B5).                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **D5**   | Pas de SMS. Alertes : file « À traiter » et e-mail. WhatsApp seulement si l'infrastructure vise proprement des utilisateurs internes.                    | File « À traiter » + e-mail. **WhatsApp hors périmètre** : `User` ne porte aucun numéro de téléphone (`prisma/schema.prisma:451` et suivantes), et `sendWhatsappNotification` vise soit un numéro brut sans contrôle de consentement (`src/services/whatsapp-notification-send-service.ts:95-96`), soit un contact CRM consentant (`:97-110`) — aucun des deux n'est un membre de l'agence. **Révision 3 (04/10/2026)** : l'inventaire de chantier par WhatsApp est désormais traité par le lot 041 (`specs/041-inventaire-whatsapp/`), empilé sur ce lot ; il réutilise l'inventaire à l'aveugle, le cycle `DRAFT → COUNTED → VALIDATED` et les alertes de ce lot. Ce lot-ci ne change pas. |

## 3. Périmètre

### 3.1 Dans le périmètre

Les exigences A1 à A11 et B1 à B8 de ce document. Le volet meublés (M1 à M5)
fait partie du lot mais est spécifié dans [meubles.md](meubles.md) ; il ne touche
aucun fichier du stock.

### 3.2 Hors périmètre (niveau 3 de la synthèse, décision D3)

Sortie en deux temps ; transfert « en transit » avec accusé de réception ;
périmètre d'un utilisateur limité à un lieu ou à un chantier ; contrôle avancé des
achats (doublon proche de facture, bon de commande postérieur à la facture,
dérive de prix) ; rapprochement à trois voies par article ; consommation
théorique ; comptages surprise planifiés ; journal scellé par empreinte chaînée ;
QR et codes-barres ; mode hors ligne ; registre d'outillage et de clés ; syndic ;
stock hors chantier ; carburant ; code de remise envoyé au bénéficiaire ; SMS ;
WhatsApp (D5 ; traité par le lot 041) ; revente de ferraille comme type de mouvement.

### 3.3 Limites assumées, à connaître avant d'écrire les écrans

| Limite                                                                                                                                                                                                                                                                                                                          | Pourquoi elle reste                                                                                                                                                                                                                                                                                                                                                                                         | Conséquence                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Une réception exige une facture fournisseur **validée** (`src/lib/finance/stock-mouvements.ts:331-340`).                                                                                                                                                                                                                        | La facture porte déjà la valeur au 311 (`src/lib/finance/suppliers.ts:509-542`) ; une réception sans facture changerait la doctrine comptable du lot 5.                                                                                                                                                                                                                                                     | Le magasinier ne peut pas réceptionner sur simple bon de livraison. Le geste « Recevoir » commence par le choix d'une facture validée (B3). À signaler au client.                                                                                                              |
| L'unité d'un article reste libre et modifiable sans conversion (`src/lib/finance/stock-referentiel.ts:194-215`).                                                                                                                                                                                                                | Hors périmètre de la décision D3.                                                                                                                                                                                                                                                                                                                                                                           | Le motif `UNIT_CONFUSION` (§4) permet au moins de nommer l'écart qu'elle provoque.                                                                                                                                                                                             |
| Une photo ou un bon signé ne prouve ni l'identité de son auteur ni l'intégrité absolue du fichier.                                                                                                                                                                                                                              | Le journal scellé est au niveau 3.                                                                                                                                                                                                                                                                                                                                                                          | On dit « empreinte enregistrée, modification détectable », jamais « infalsifiable ».                                                                                                                                                                                           |
| Un administrateur seul dans son agence n'est jamais à l'aveugle ni contrôlé par un autre.                                                                                                                                                                                                                                       | Organisationnel.                                                                                                                                                                                                                                                                                                                                                                                            | La dérogation A1 le dit, le trace et le compte dans les indicateurs.                                                                                                                                                                                                           |
| Le comptage à l'aveugle ferme les **lectures directes** de l'attendu, pas sa **reconstitution** : additionner à la main les quantités du journal ou de l'export CSV depuis le dernier inventaire, ou essayer des sorties de quantités croissantes jusqu'au refus `409 STOCK_INSUFFICIENT` (dichotomie), redonne une estimation. | Masquer toutes les quantités passées d'un lieu pendant un comptage rendrait le journal, les bons et l'export inutilisables pour tout le monde pendant des jours, sans fermer les autres sources (bons PDF déjà imprimés, factures). Le comptage à l'aveugle vise la recopie de l'attendu affiché, pas un compteur décidé à tricher, que les quatre yeux (A1) et les lignes non comptées (A2-R8) rattrapent. | L'API ne livre aucun champ d'où l'attendu se déduit en une opération (§8.2). L'export CSV est tracé (`DATA_EXPORTED`, automatique) ; un refus `STOCK_INSUFFICIENT` sur un lieu en comptage est tracé (`STOCK_BLIND_INSUFFICIENT_REFUSED`, B6). L'écran ne propose aucun total. |
| Un détenteur de `STOCK_COUNT_VALIDATE` qui saisit une ligne n'est pas à l'aveugle : il lit les soldes hors des routes d'inventaire.                                                                                                                                                                                             | Le validateur doit voir le stock pour faire son travail.                                                                                                                                                                                                                                                                                                                                                    | La ligne est marquée « comptée sans aveugle » (`countedBlind = false`, A2-R9), mentionnée au procès-verbal et comptée dans les indicateurs (B8).                                                                                                                               |
| La dérogation A1-R3 peut s'obtenir en désactivant un moment l'autre validateur.                                                                                                                                                                                                                                                 | Une désactivation est une décision d'administration légitime.                                                                                                                                                                                                                                                                                                                                               | La désactivation est déjà auditée (`USER_DISABLED`) ; la dérogation lève l'alerte `COUNT_SELF_VALIDATED` et figure au procès-verbal : les deux traces se rapprochent dans le journal d'activité.                                                                               |
| Un retour fournisseur réduit le solde du compte du fournisseur, pas le « reste à payer » affiché facture par facture.                                                                                                                                                                                                           | Les règlements s'affectent par facture (`src/lib/finance/suppliers.ts:820-834`) ; un avoir affecté à une facture est un objet comptable nouveau (niveau 3).                                                                                                                                                                                                                                                 | L'écran du retour le dit ; l'avoir papier du fournisseur se rapproche du mouvement de retour (data-model §4).                                                                                                                                                                  |
| Une réception sur une facture imputée **en charge** (chantier non basculé, `src/lib/finance/suppliers.ts:520-560`) fait entrer la marchandise dans le stock sans débit du 311 au grand livre (comportement du lot 5).                                                                                                           | Corriger l'imputation des factures est hors périmètre (D3).                                                                                                                                                                                                                                                                                                                                                 | Le retour fournisseur et le rebut de cette marchandise créditent le 311 comme toute sortie : l'écart au grand livre préexiste au lot. Documenté pour l'expert-comptable (data-model §4).                                                                                       |

## 4. Vocabulaire

| Terme                         | Sens dans ce lot                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Écart**                     | Différence entre la quantité comptée et la quantité que le système attendait au moment de la saisie de la ligne. Négatif quand il manque.                                                                                                                                                                                                                                                   |
| **Écart à justifier**         | Écart non nul d'un inventaire clos, sans motif. Bloque la validation.                                                                                                                                                                                                                                                                                                                       |
| **Disparition non expliquée** | Motif `UNEXPLAINED_DISAPPEARANCE` : la personne qui justifie constate un manque sans en connaître la cause. C'est une constatation, pas une accusation.                                                                                                                                                                                                                                     |
| **Comptage à l'aveugle**      | Pendant qu'un inventaire est en cours (`DRAFT`), personne ne reçoit de l'API la quantité attendue ni l'écart de ce lieu, ni aucun champ dont ils se déduisent en une opération (valeur et coût moyen d'un solde, valeur après un mouvement, restant du rapprochement) ; seuls les détenteurs de `STOCK_COUNT_VALIDATE` lisent ces champs, et hors des routes d'inventaire seulement (§8.2). |
| **Comptage clos**             | Statut `COUNTED` : les quantités comptées sont figées, les écarts sont révélés et se justifient.                                                                                                                                                                                                                                                                                            |
| **Ligne non comptée**         | Ligne créée par le système à la clôture du comptage pour un article qui avait du stock sur le lieu et que personne n'a compté (A2-R8). Elle ne s'ajuste pas : elle s'écarte, avec un motif.                                                                                                                                                                                                 |
| **Article à recompter**       | Article dont la ligne a été écartée dans le dernier inventaire validé du lieu (A2-R7, A2-R8). Rappelé à l'écran du lieu et à l'ouverture de l'inventaire suivant.                                                                                                                                                                                                                           |
| **Compteurs**                 | Toutes les personnes qui ont saisi au moins une ligne d'un inventaire, même remplacée, retirée ou écartée ensuite (A1-R1).                                                                                                                                                                                                                                                                  |
| **Preneur**                   | La personne qui emporte la marchandise lors d'une sortie ou d'un transfert. Elle n'a pas de compte dans l'application.                                                                                                                                                                                                                                                                      |
| **Bon**                       | Pièce numérotée par agence : bon de réception (`BR`), bon de sortie (`BS`), procès-verbal d'inventaire (`PVI`).                                                                                                                                                                                                                                                                             |
| **Pièce jointe**              | Photo ou scan rattaché à un mouvement, à un bon ou à une ligne d'inventaire.                                                                                                                                                                                                                                                                                                                |
| **Alerte**                    | Point « à traiter » adressé au dirigeant. Une alerte informe, elle n'interdit rien et ne désigne personne.                                                                                                                                                                                                                                                                                  |

**Liste fermée des motifs** (`StockReasonCode`, data-model §2.1). Libellés
français proposés, à passer par `t()` :

| Code                        | Libellé                                 | Inventaire | Rebut | Retour fournisseur | Transfert |
| --------------------------- | --------------------------------------- | :--------: | :---: | :----------------: | :-------: |
| `BREAKAGE`                  | Casse                                   |     ✓      |   ✓   |                    |           |
| `DETERIORATION`             | Détérioration (humidité, péremption)    |     ✓      |   ✓   |                    |           |
| `COUNTING_ERROR`            | Erreur du comptage précédent            |     ✓      |       |                    |           |
| `ENTRY_ERROR`               | Erreur de saisie d'un mouvement         |     ✓      |       |                    |           |
| `UNIT_CONFUSION`            | Confusion d'unité                       |     ✓      |       |                    |           |
| `UNRECORDED_ISSUE`          | Sortie non enregistrée                  |     ✓      |       |                    |           |
| `UNRECORDED_RECEIPT`        | Réception non enregistrée               |     ✓      |       |                    |           |
| `UNEXPLAINED_DISAPPEARANCE` | Disparition non expliquée               |     ✓      |       |                    |           |
| `OPENING_BALANCE`           | Stock d'ouverture (posé par le système) |    auto    |       |                    |           |
| `NON_CONFORMING`            | Non conforme à la commande              |            |       |         ✓          |           |
| `DAMAGED_ON_DELIVERY`       | Endommagé à la livraison                |            |       |         ✓          |           |
| `EXCESS_DELIVERY`           | Livré en trop                           |            |       |         ✓          |           |
| `SITE_SUPPLY`               | Approvisionnement d'un chantier         |            |       |                    |     ✓     |
| `RETURN_TO_WAREHOUSE`       | Retour au magasin                       |            |       |                    |     ✓     |
| `SITE_EVACUATION`           | Évacuation d'un chantier                |            |       |                    |     ✓     |
| `REBALANCING`               | Rééquilibrage entre lieux               |            |       |                    |     ✓     |
| `OTHER`                     | Autre (précision obligatoire)           |     ✓      |   ✓   |         ✓          |     ✓     |

**Mots interdits** dans tout texte destiné à un utilisateur (message d'API,
libellé, PDF, e-mail, notification, traduction) : « vol », « vols », « voleur »,
« fraude », « frauduleux », « détournement », « détourné ». Les commentaires de
code existants qui les emploient (par exemple `prisma/schema.prisma:7539` et
`:7725`) ne sont pas exposés et ne sont pas réécrits par ce lot.

## 5. État vérifié de l'existant

| Sujet                    | Constat                                                                                                                                                                                                                                                                                                                 | Preuve                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Types de mouvement       | Quatre seulement : `RECEIPT`, `ISSUE`, `TRANSFER`, `ADJUSTMENT`. Le retour de chantier passe déjà par un transfert.                                                                                                                                                                                                     | `prisma/schema.prisma:7532-7541` ; `src/lib/finance/stock-inventaire.ts:303-424`                                                                             |
| Concurrence              | Le solde est lu puis réécrit en valeur absolue, sans verrou : deux sorties simultanées peuvent passer toutes les deux.                                                                                                                                                                                                  | `src/lib/finance/stock-mouvements.ts:227-271` ; aucun `FOR UPDATE` ni verrou dans `stock-*.ts`                                                               |
| Précédent de verrou      | Verrou consultatif de transaction, clé par agence.                                                                                                                                                                                                                                                                      | `src/lib/finance/cash.ts:149-163`                                                                                                                            |
| Inventaire non aveugle   | `expectedQuantity` est rendue dans chaque ligne, la ressaisie la refige.                                                                                                                                                                                                                                                | `src/lib/finance/stock-inventaire.ts:451-467, 622-623, 635-641`                                                                                              |
| Inventaire qui écrase    | À la validation, l'ajustement ramène le solde à la quantité comptée et écrase les mouvements postérieurs.                                                                                                                                                                                                               | `src/lib/finance/stock-inventaire.ts:57-59, 739-742` ; épinglé par `__tests__/unit/finance.stock-inventaire.test.ts:1117-1150`                               |
| Valeur d'écart flottante | `varianceValue` est recalculée au coût moyen **courant** à chaque lecture, même pour un inventaire validé.                                                                                                                                                                                                              | `src/lib/finance/stock-inventaire.ts:473-478`                                                                                                                |
| Quatre yeux              | Aucune comparaison entre compteur et validateur ; une ligne de comptage n'a pas d'auteur ; sur un ajustement, l'auteur enregistré est le validateur.                                                                                                                                                                    | `src/lib/finance/stock-inventaire.ts:681-839, 789` ; `prisma/schema.prisma:7775-7797`                                                                        |
| Motifs                   | Texte libre de 500 caractères, absent du journal des mouvements.                                                                                                                                                                                                                                                        | `src/lib/finance/schemas-stock-inventaire.ts` (`reason`) ; `src/lib/finance/stock-mouvements.ts:182-209`                                                     |
| Journal                  | Non paginé, filtres article/lieu/chantier/type/période, aucune borne de date, aucun export.                                                                                                                                                                                                                             | `src/lib/finance/stock-mouvements.ts:672-704` ; `src/lib/finance/schemas-stock-mouvements.ts:153-162`                                                        |
| Demandeur                | Texte libre exigé sur la sortie ; absent du transfert.                                                                                                                                                                                                                                                                  | `src/lib/finance/stock-mouvements.ts:464-469` ; `src/lib/finance/stock-inventaire.ts:370-383`                                                                |
| Chantier clos            | La sortie est refusée, le transfert vers le lieu d'un chantier clos est accepté et un test l'épingle.                                                                                                                                                                                                                   | `src/lib/finance/stock-mouvements.ts:507` ; `src/lib/finance/stock-inventaire.ts:33-38` ; `__tests__/unit/finance.stock-inventaire.test.ts:608-626`          |
| Clôture                  | Les bloqueurs ne regardent que les pièces en brouillon ; rien sur le stock.                                                                                                                                                                                                                                             | `src/lib/finance/site-closing.ts:707-762`                                                                                                                    |
| Bascule                  | Crée le lieu du chantier, sans aucun comptage.                                                                                                                                                                                                                                                                          | `src/lib/finance/stock-rapprochement.ts:218-256`                                                                                                             |
| Achats en espèces        | La pièce de caisse validée impute le chantier sans aucun lien avec le stock.                                                                                                                                                                                                                                            | `src/lib/finance/cash.ts:274-406` (imputation `:353-367`)                                                                                                    |
| Permissions              | Six droits `FINANCE_*`, aucun propre au stock ; `FINANCE_ACCOUNTS_READ` ouvre aussi salaires, tâcherons, fournisseurs.                                                                                                                                                                                                  | `src/middleware/finance-rbac-middleware.ts:22-37` ; `prisma/seeds/finance-permissions-seed.ts:34-44, 93-100`                                                 |
| Rôles                    | Rôles globaux (clé unique, sans agence), attribués par agence via `UserRole.tenantId`. Il n'existe **aucun rôle propre à une agence** : les permissions d'un rôle ne se modifient que par la plateforme (`PATCH /roles/:id/permissions` sous `PLATFORM_TENANTS_EDIT`), et la modification vaut pour toutes les agences. | `prisma/schema.prisma:926-990` ; `src/services/membership-service.ts:245-251` ; `src/routes/role-routes.ts:42-46` ; `src/controllers/role-controller.ts:162` |
| Cache des permissions    | En mémoire, par instance, 5 minutes. `invalidatePermissionCache` et `clearPermissionCache` n'ont **aucun appelant** : un changement de rôle prend effet au plus tard 5 minutes après, sur chaque instance.                                                                                                              | `src/services/permission-service.ts:3-13, 146-172`                                                                                                           |
| Menus par rôle           | Décisions globales par clé de rôle (`RoleMenuAccess.roleKey`), l'absence de décision vaut « visible ».                                                                                                                                                                                                                  | `prisma/schema.prisma:5903-5914` ; `src/services/role-menu-service.ts:1-18`                                                                                  |
| Audit agence             | Journal consultable par l'agence (`TENANT_AUDIT_VIEW`), aucune clé `STOCK_*`, aucun appel d'audit dans `lib/finance/`.                                                                                                                                                                                                  | `specs/023-audit-deux-niveaux/spec.md` §4, §7 ; `src/types/audit-catalog.ts`                                                                                 |
| Photos privées           | Modèle `LeaseInspectionPhoto`, fichier hors dossier public, sans empreinte.                                                                                                                                                                                                                                             | `prisma/schema.prisma:7959-7978` ; `src/lib/lease-inspections/service.ts:643-695` ; `src/lib/files/private-files.ts:53-108`                                  |
| PDF                      | `pdf-lib`, gabarit du bon de caisse.                                                                                                                                                                                                                                                                                    | `src/controllers/finance-sites-controller.ts:413, 549-564`                                                                                                   |
| File « À traiter »       | Union fermée de trois natures.                                                                                                                                                                                                                                                                                          | `src/services/dashboard-service.ts:62-77`                                                                                                                    |
| Erreurs                  | `lib/errors` (`conflict(message, details)`) ne transmet pas `details` au client ; seul `AppError` porte `code` et `data`.                                                                                                                                                                                               | `src/middleware/error-middleware.ts:69-91, 288-302`                                                                                                          |

## 6. Exigences — Sprint A : fermer les failles

Chaque critère d'acceptation est rédigé pour devenir un test (unitaire,
d'API ou d'isolation). « Compteur » désigne l'auteur d'une ligne de comptage.

### A1 — Celui qui compte ne valide pas

**Règles**

- **A1-R1. Compteurs.** Les compteurs d'un inventaire sont **toutes les
  personnes qui ont saisi au moins une ligne**, même si cette ligne a été
  ressaisie par quelqu'un d'autre, retirée en `DRAFT` ou écartée en `COUNTED`.
  Le service les accumule dans `StockCount.counterUserIds` à chaque saisie
  (jamais retirés). Raison : sans cette accumulation, un compteur qui fait
  ressaisir ou écarte ses propres lignes cesserait d'être compteur et pourrait
  valider. Un inventaire ouvert avant le lot, dont les lignes n'ont pas d'auteur,
  a pour compteur son créateur — la seule information disponible ; aucune valeur
  n'est inventée en base (doctrine de `prisma/schema.prisma:6302-6305`). Les
  lignes non comptées (A2-R8) n'ont pas de compteur.
- **A1-R2.** La validation est refusée (`403`, code `STOCK_COUNT_SELF_VALIDATION_FORBIDDEN`)
  quand le validateur est l'un des compteurs.
- **A1-R3. Dérogation.** Elle est permise seulement quand **aucun autre membre
  actif** de l'agence ne détient `STOCK_COUNT_VALIDATE` **sans être lui-même
  compteur de cet inventaire** (révision 3 : si tous les validateurs ont compté,
  l'un d'eux valide par dérogation, sinon l'inventaire resterait bloqué). Un
  inventaire sans ligne a pour compteur la personne qui a clos son comptage. Le test interroge la
  **base**, jamais `getUserPermissions` (cache de 5 minutes par instance, §5) :
  existe-t-il un utilisateur autre que l'appelant avec `Membership.status =
ACTIVE` dans l'agence, `User.isActive = true` (`prisma/schema.prisma:461`),
  `globalRole` différent de `SUPER_ADMIN`, et un `UserRole` de cette agence
  (`UserRole.tenantId`) dont le rôle porte la permission (`RolePermission`) ?
  La dérogation exige `selfValidationReason` (10 à 500 caractères). Elle est
  enregistrée sur l'inventaire (`selfValidated = true`), écrite au journal
  d'audit (`STOCK_COUNT_SELF_VALIDATED`), imprimée sur le procès-verbal,
  comptée dans les indicateurs (B8) et lève une alerte d'information
  `COUNT_SELF_VALIDATED` (B7).
- **A1-R4.** Le personnel de la plateforme (`globalRole = SUPER_ADMIN`) n'est pas
  compté comme « autre membre ».
- **A1-R5.** Le même test (A1-R3) alimente `CountView.validation`
  (`callerIsCounter`, `selfValidationAllowed`) en `COUNTED`, pour que l'écran
  prévienne avant le clic.

**Écart justifié avec la demande** : la demande parle d'« un seul administrateur
actif ». La règle porte sur le détenteur du droit de valider, qui est la
personne réellement concernée : une agence dont le seul administrateur
travaille avec des comptables (qui comptent mais ne valident pas, B1) n'a pas
de second validateur, même si elle compte plusieurs membres actifs.

**Limite assumée** (§3.3) : désactiver un moment l'autre validateur ouvre la
dérogation ; les deux faits sont tracés et rapprochables.

**Critères d'acceptation**

1. Étant donné un inventaire dont Awa a saisi une ligne, quand Awa le valide alors
   que Koffi détient aussi `STOCK_COUNT_VALIDATE` dans l'agence, alors la réponse
   est `403 STOCK_COUNT_SELF_VALIDATION_FORBIDDEN` et rien n'est écrit.
2. Étant donné le même inventaire, quand Koffi le valide, alors il passe en
   `VALIDATED` avec `selfValidated = false`.
3. Étant donné une agence où Awa est le seul membre actif à détenir
   `STOCK_COUNT_VALIDATE`, quand elle valide sans motif, alors `400
STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED` ; avec un motif, alors
   l'inventaire est validé, `selfValidated = true`, une ligne d'audit
   `STOCK_COUNT_SELF_VALIDATED` existe dans la même transaction et une alerte
   `COUNT_SELF_VALIDATED` est ouverte.
4. Étant donné que Koffi existe mais que son adhésion est `DISABLED`, alors la
   dérogation est permise à Awa.
5. Étant donné un inventaire ouvert avant la migration dont les lignes n'ont pas
   d'auteur, quand son créateur le valide et qu'un autre validateur existe, alors
   `403`.
6. Étant donné une ligne saisie par Awa puis ressaisie par Moussa, quand Awa
   valide alors que Koffi peut valider, alors `403` (Awa reste compteur).
7. Étant donné Koffi actif dans l'agence mais `User.isActive = false`, alors la
   dérogation est permise à Awa.

### A2 — Inventaire à l'aveugle

**Règles**

- **A2-R1. Cycle.** `DRAFT` (comptage en cours) → `COUNTED` (comptage clos) →
  `VALIDATED`. `DRAFT` → `CANCELLED` possible (A2-R6). Pas de retour de
  `COUNTED` à `DRAFT`.
- **A2-R2.** En `DRAFT`, aucune route d'inventaire ne livre `expectedQuantity`,
  `variance`, `varianceCount` ni aucune valeur d'écart, **à personne** : ces champs
  valent `null` et `blind = true`. La réponse d'une saisie de ligne ne contient
  que la ligne saisie.
- **A2-R3.** En `DRAFT`, pour le lieu compté, les routes hors inventaire
  (soldes, journal, export CSV, bons et leur PDF, réponses de réception, sortie,
  transfert, rebut, retour, contexte terrain, rapprochement du chantier, message
  « stock insuffisant ») masquent à tout appelant qui ne détient pas
  `STOCK_COUNT_VALIDATE` la quantité du lieu **et tout champ dont elle se
  déduit en une opération** : valeur et coût moyen d'un solde, valeur et coût
  unitaire d'un mouvement du lieu, restant du rapprochement (détail §8.2). La
  reconstitution par l'historique est une limite assumée (§3.3).
- **A2-R4. Clôture du comptage.** `POST …/counts/{countId}/close` (droit
  `STOCK_COUNT`) passe de `DRAFT` à `COUNTED`. Refusée si l'inventaire n'a aucune
  ligne (`409 STOCK_COUNT_EMPTY`), sauf pour un inventaire `CLOSING` dont le lieu
  n'a plus aucun solde non nul (il atteste alors un lieu vide). Les quantités
  comptées sont figées ; les écarts deviennent visibles à tout détenteur de
  `STOCK_VIEW` (les **valeurs** restent soumises à `STOCK_VALUES_VIEW`).
- **A2-R5. Justification.** Elle se fait en `COUNTED`, ligne par ligne :
  `reasonCode` obligatoire, `reason` obligatoire pour `OTHER`, facultative sinon
  (500 caractères au plus). Droits : `STOCK_COUNT` ou `STOCK_COUNT_VALIDATE`.
  L'auteur et l'heure serveur de la justification sont enregistrés. Saisir un
  motif dès le comptage est refusé (`400`, « Le motif se saisit après la clôture
  du comptage »).
- **A2-R6. Abandon.** Un inventaire `DRAFT` peut être abandonné (`CANCELLED`) par
  un détenteur de `STOCK_COUNT_VALIDATE`, avec un motif. Un inventaire `COUNTED`
  ne s'abandonne pas : ses écarts ont été vus, il se valide (éventuellement après
  avoir écarté des lignes, A2-R7). Les routes de lecture ne révèlent jamais les
  attendus d'un inventaire abandonné ; en revanche l'événement d'audit
  `STOCK_COUNT_CANCELLED` porte, **ligne par ligne, l'attendu figé et le
  compté**. **Exception (révision 3)** : un inventaire `OPENING` ou `CLOSING` en
  `COUNTED` s'abandonne (mêmes droit, motif, audit et alerte), puisqu'il ne
  s'écarte pas (A2-R7) : si un mouvement postérieur empêche sa validation
  (`STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`), il s'abandonne et se recompte. Le
  journal d'activité n'est lisible qu'avec `TENANT_AUDIT_VIEW`, et
  l'abandon d'un inventaire qui a **au moins une ligne** lève l'alerte
  d'information `COUNT_CANCELLED` (B7). Raison : le validateur voit pendant le
  comptage les quantités comptées et les soldes ; abandonner un comptage qui
  montre un manque ne doit pas être un geste silencieux. L'abandon libère le
  lieu pour un nouvel inventaire.
- **A2-R7. Écarter une ligne.** En `COUNTED`, un détenteur de
  `STOCK_COUNT_VALIDATE` peut écarter une ligne avec un motif (3 à 500
  caractères : comptage douteux, article à recompter). La ligne reste en base,
  n'est pas ajustée, figure au procès-verbal dans une rubrique « lignes
  écartées » et l'événement `STOCK_COUNT_LINE_SET_ASIDE` est audité avec les
  quantités attendue et comptée. Écarter n'efface pas l'écart :
  - à la validation, l'écart valorisé des lignes écartées est figé
    (`StockCount.setAsideVarianceValue`, valeur absolue au coût moyen du lieu à
    la validation), **entre dans l'assiette de `COUNT_VARIANCE`** (B7) et dans
    le taux d'écart (B8) ;
  - un inventaire validé avec au moins une ligne écartée (lignes non comptées
    comprises) lève l'alerte d'information `COUNT_LINE_SET_ASIDE` (B7), une par
    inventaire ;
  - l'article écarté devient « à recompter » : `LocationView.toRecount` le
    rappelle tant qu'aucun inventaire validé postérieur du lieu ne l'a compté, et
    l'ouverture d'un inventaire sur ce lieu le liste (`CountView.toRecount`).
- **A2-R8. Lignes non comptées.** À la clôture du comptage (`DRAFT` →
  `COUNTED`), dans la même transaction et sous les verrous A10 du lieu, le
  service crée pour **chaque article dont le solde du lieu est non nul et qui
  n'a pas de ligne** une ligne « non comptée » : `countedQuantity = null`,
  attendu figé à cet instant (`expectedQuantity`, `expectedCapturedAt`), sans
  compteur. Une ligne non comptée ne s'ajuste pas et ne se justifie pas : elle
  doit être **écartée** avec un motif (A2-R7) avant la validation, une par une
  ou toutes ensemble (`POST …/counts/{countId}/set-aside-uncounted`, un motif
  commun) ; sinon la validation répond `409 STOCK_COUNT_UNCOUNTED_LINES`
  (`data.items`). Elle est imprimée au procès-verbal dans une rubrique « non
  comptés » et comptée dans les indicateurs (B8). Pour un inventaire `OPENING` ou
  `CLOSING`, la clôture du comptage est **refusée** tant qu'un article de solde
  non nul n'a pas de ligne (`409 STOCK_COUNT_INCOMPLETE`, `data.items`) : ces
  deux natures doivent couvrir tout le lieu. Raison : sans cette règle, un
  compteur qui sait qu'un article manque ne le compte pas, et le manque
  disparaît sans écart, sans motif et sans alerte.
- **A2-R9. Comptage sans aveugle.** Une ligne saisie par un détenteur de
  `STOCK_COUNT_VALIDATE` (permission lue au moment de la saisie) porte
  `countedBlind = false` ; toute autre ligne saisie après le lot,
  `countedBlind = true` ; une ligne d'avant le lot, `null`. La mention figure
  au procès-verbal (« comptée par une personne qui voyait le stock ») et la part
  des lignes comptées à l'aveugle entre dans les indicateurs (B8).

**Écart justifié** : un statut intermédiaire `COUNTED` est ajouté. Sans lui,
« l'écart apparaît une fois le comptage clos » n'a pas de moment défini, et la
justification se ferait en même temps que la validation, donc par le validateur
seul.

**Écart justifié (A2-R8)** : pas d'« inventaire partiel » choisi par le
compteur. Un inventaire tournant reste possible : le validateur écarte en une
fois les articles qu'il n'a pas fait compter (`set-aside-uncounted`), avec un
motif, ce qui est tracé et alerté. Le choix de ce qui n'est pas compté revient
ainsi au contrôleur, jamais au compteur. Des comptages planifiés par article
relèvent du niveau 3 (D3).

**Critères d'acceptation**

1. Étant donné un inventaire `DRAFT` sur le lieu L où le système attend 100 sacs,
   quand le magasinier saisit 92, alors la réponse ne contient ni 100 ni −8, pour
   le magasinier comme pour un administrateur.
2. Étant donné ce même inventaire `DRAFT`, quand le magasinier lit
   `GET /stock/balances?locationId=L`, alors `quantity` vaut `null` et
   `meta.blindLocationIds` contient L ; quand un administrateur détenteur de
   `STOCK_COUNT_VALIDATE` lit la même route, alors il reçoit 100.
3. Étant donné ce même inventaire, quand le magasinier tente une sortie de 150
   sacs depuis L, alors `409 STOCK_INSUFFICIENT` dont le message ne contient
   aucune quantité disponible.
4. Étant donné l'inventaire clos (`COUNTED`), quand le magasinier le relit, alors
   il voit `expectedQuantity = 100`, `variance = -8`, et `varianceValue = null`.
5. Étant donné un inventaire `COUNTED`, quand on tente de saisir ou de supprimer
   une ligne, alors `409 STOCK_COUNT_WRONG_STATUS`.
6. Étant donné un inventaire `DRAFT` sans ligne, quand on le clôt, alors `409
STOCK_COUNT_EMPTY`.
7. Étant donné un inventaire `DRAFT` sur L, quand le comptable (`STOCK_VALUES_VIEW`,
   sans `STOCK_COUNT_VALIDATE`) lit `GET /stock/balances?locationId=L`, alors
   `quantity`, `value` et `averageUnitCost` valent `null` sur L ; dans
   `GET /stock/movements?locationId=L`, `quantityAfter`, `valueAfter` et
   `unitCost` valent `null` ; dans le rapprochement du chantier de L,
   `remainingQuantity` et `remainingValue` valent `null`.
8. Étant donné un lieu portant ciment (100) et sable (40), un inventaire
   `REGULAR` où seul le sable est compté, quand le comptage est clos, alors une
   ligne « non comptée » ciment existe (`countedQuantity = null`,
   `expectedQuantity = 100`) ; la validation répond `409
STOCK_COUNT_UNCOUNTED_LINES` tant qu'elle n'est pas écartée ; après mise à
   l'écart, la validation passe, n'ajuste pas le ciment, et ouvre
   `COUNT_LINE_SET_ASIDE`.
9. Même lieu, inventaire `CLOSING` où seul le sable est compté : la clôture du
   comptage répond `409 STOCK_COUNT_INCOMPLETE` avec le ciment dans `data.items`.
10. Étant donné un inventaire `DRAFT` avec une ligne, quand il est abandonné,
    alors l'audit `STOCK_COUNT_CANCELLED` porte attendu et compté de la ligne,
    et une alerte `COUNT_CANCELLED` est ouverte ; `GET` de l'inventaire renvoie
    toujours `expectedQuantity = null`.
11. Étant donné une ligne de 92 sacs pour un attendu de 100 écartée, quand
    l'inventaire est validé, alors `setAsideVarianceValue` vaut 8 × coût moyen
    et entre dans le calcul de `COUNT_VARIANCE`.
12. Une ligne saisie par l'administrateur porte `countedBlind = false`.

### A3 — Un mouvement postérieur au comptage n'est plus écrasé

**Règles**

- **A3-R1.** À la saisie (et à chaque ressaisie) d'une ligne, le service fige
  `expectedQuantity` (solde du lieu à cet instant) et `expectedCapturedAt`
  (heure serveur). Comportement existant conservé pour le figeage
  (`src/lib/finance/stock-inventaire.ts:622-623`).
- **A3-R2.** À la validation, l'ajustement applique **l'écart** au solde courant :
  `écart = compté − attendu figé` ; `nouveau solde = solde courant + écart`. Il ne
  ramène plus le solde à la quantité comptée. Aucun gel du lieu.
- **A3-R3.** Si `solde courant + écart < 0` pour un article (des sorties
  postérieures au comptage dépassent ce qui a été compté), la validation est
  refusée en entier (`409 STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`, `data.items`
  liste les articles) ; le validateur écarte la ligne (A2-R7) et fait recompter.
- **A3-R4.** Le nombre de mouvements du lieu et de l'article enregistrés entre
  `expectedCapturedAt` et la validation est figé sur la ligne
  (`movementsSinceCapture`) et imprimé au procès-verbal. Une ligne d'avant le
  lot n'a pas d'heure de figeage (`prisma/schema.prisma:7775-7797`, aucune
  colonne de date) : `movementsSinceCapture` y vaut `null` et le procès-verbal
  imprime « non mesuré (ligne antérieure au contrôle) » plutôt qu'un chiffre
  calculé depuis une date approximative.
- **A3-R5.** Valorisation inchangée : au coût moyen courant du lieu ; un surplus
  d'inventaire d'ouverture entre à valeur nulle (A7-R2).

**Critères d'acceptation**

1. Étant donné un solde de 100 sacs, une ligne comptée 90 (attendu figé 100), puis
   un transfert de 20 sacs hors du lieu (solde 80), quand l'inventaire est validé,
   alors l'ajustement est une **diminution de 10** et le solde vaut **70**. (Ce
   cas inverse délibérément le test `__tests__/unit/finance.stock-inventaire.test.ts:1118-1150`,
   qui attend aujourd'hui une entrée de 10 et un solde de 90.)
2. Étant donné une ligne comptée 10 (attendu 10) puis une sortie de 10 avant
   validation, alors aucun ajustement n'est écrit et le solde vaut 0.
3. Étant donné une ligne comptée 5 (attendu 10) puis une sortie de 8 (solde 2),
   quand l'inventaire est validé, alors `409 STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS`
   et rien n'est écrit.
4. Pendant un inventaire `DRAFT` ou `COUNTED` sur L, une réception, une sortie et
   un transfert sur L sont acceptés.

### A4 — Motifs typés, auteur de chaque ligne, motif visible au journal

**Règles**

- **A4-R1.** Chaque ligne de comptage porte `countedByUserId` et
  `countedAtServer` (dernière saisie). Une ressaisie par une autre personne change
  l'auteur de la ligne, mais la première personne reste compteur de l'inventaire
  (A1-R1). Chaque saisie et chaque retrait de ligne sont tracés
  (`STOCK_COUNT_LINE_RECORDED`, `STOCK_COUNT_LINE_REMOVED`, B6) avec la quantité
  avant et après : l'historique des comptages n'est pas perdu.
- **A4-R2. Règle unique de justification.** Une ligne en écart (écart non nul,
  non écartée) est **justifiée** si elle porte un `reasonCode` de la liste
  fermée (§4, colonne « Inventaire »), **ou** si elle a été créée avant le lot
  (`countedByUserId` nul) et porte un `reason` non vide. Toute autre ligne en
  écart bloque la validation : `409 STOCK_COUNT_UNJUSTIFIED_VARIANCE` avec
  `data.items`. La justification d'une ligne d'avant le lot reste modifiable en
  `COUNTED` par un `reasonCode`.
- **A4-R3.** L'ajustement écrit à la validation porte le `reasonCode` et le
  `reason` de sa ligne, l'identifiant de l'inventaire, et pour auteur le
  **validateur** (inchangé) ; le compteur reste lisible via la ligne.
- **A4-R4.** Le journal des mouvements expose `reasonCode` et `reason` pour tous
  les types qui en portent (ajustement, rebut, retour fournisseur, transfert).
- **A4-R5.** Une ligne d'inventaire antérieure au lot garde son motif libre ;
  `reasonCode` vaut `null`, l'écran l'affiche comme « Motif libre : … » et la
  compte comme justifiée (A4-R2) — l'écran et le serveur appliquent la même
  règle. L'ajustement qu'elle produit porte `reasonCode = null` et son `reason`.

**Critères d'acceptation**

1. Étant donné une ligne en écart justifiée `OTHER` sans précision, alors `400
STOCK_REASON_REQUIRED`.
2. Étant donné une ligne justifiée `BREAKAGE`, après validation le mouvement
   `ADJUSTMENT` correspondant renvoie `reasonCode = "BREAKAGE"` dans `GET
/stock/movements`.
3. Étant donné deux compteurs sur deux lignes, le détail de l'inventaire renvoie
   pour chaque ligne le libellé de son auteur.
4. Étant donné un inventaire ouvert avant le lot, dont une ligne en écart porte
   `reason = "casse"` et `reasonCode = null`, quand il est clos puis validé par
   une autre personne, alors la validation passe (pas de `409
STOCK_COUNT_UNJUSTIFIED_VARIANCE`) et `movementsSinceCapture` vaut `null`.

### A5 — Journal paginé, filtrable, exportable ; dates bornées

**Règles**

- **A5-R1. Pagination** par curseur opaque `(movementDate, createdAt, id)`, tri
  décroissant, `limit` de 1 à 200 (50 par défaut), `meta.nextCursor` nul à la
  dernière page.
- **A5-R2. Filtres** : `itemId`, `locationId`, `siteId`, `type` (six valeurs),
  `slipId`, `movementId` (un mouvement, ou les deux moitiés de son transfert),
  `takerId`, `createdByUserId`, `requestedBy` (contient, insensible à la casse),
  `from` / `to` (dates de mouvement, bornes incluses). **Les trois filtres par
  personne** (`takerId`, `createdByUserId`, `requestedBy`) sont réservés à
  `STOCK_VALUES_VIEW` (`403 STOCK_VALUE_FIELD_FORBIDDEN` sinon) : un filtre par
  personne est un outil d'encadrement (§10), qu'il vise un preneur par son
  identifiant ou par son nom. Le magasinier retrouve un mouvement par l'article,
  le lieu, la date ou le numéro de bon.
- **A5-R3. Export CSV** : mêmes filtres, sans curseur ; 50 000 lignes au plus,
  au-delà `422 STOCK_EXPORT_TOO_LARGE` ; format du dépôt (`src/lib/csv.ts` : BOM
  UTF-8, CRLF, protection contre les formules), séparateur `;`. Colonnes de
  valeur absentes sans `STOCK_VALUES_VIEW`. L'événement `DATA_EXPORTED` est écrit
  par le middleware d'accès existant (spec 023 §6, phase 3) : aucun événement
  propre au stock.
- **A5-R4. Bornes de date.** Pour toute réception, sortie, transfert, rebut,
  retour fournisseur et pour la date d'un inventaire : la date déclarée ne peut
  pas dépasser le jour courant (UTC, qui est l'heure légale de la Côte d'Ivoire),
  sinon `400 STOCK_DATE_IN_FUTURE` ; elle ne peut pas être antérieure de plus de
  `backdatingLimitDays` jours (réglage de l'agence, 7 par défaut, de 0 à 365),
  sinon `400 STOCK_DATE_TOO_OLD`. L'import par classeur est soumis à la même
  règle ; pour une reprise d'historique, l'agence relève temporairement la borne
  (événement audité `STOCK_CONTROLS_UPDATED`).
- **A5-R5. Délai de saisie.** Chaque mouvement expose `entryLagDays` = jour de
  `createdAt` − jour de `movementDate` (entier ≥ 0, calculé, jamais stocké).

**Critères d'acceptation**

1. Avec 120 mouvements, `limit=50` renvoie 50, 50 puis 20 lignes, sans doublon ni
   trou, `nextCursor` nul au troisième appel.
2. Une sortie datée de demain → `400 STOCK_DATE_IN_FUTURE`. Une sortie datée d'il
   y a 8 jours avec la borne par défaut → `400 STOCK_DATE_TOO_OLD` ; à 7 jours,
   acceptée et `entryLagDays = 7`.
3. Le magasinier qui passe `createdByUserId`, `takerId` ou `requestedBy` reçoit
   `403`.
4. L'export CSV d'un magasinier ne contient aucune colonne de valeur.

### A6 — Retour fournisseur et rebut

**Règles**

- **A6-R1. Retour fournisseur** (`SUPPLIER_RETURN`, droit `STOCK_DISPOSE`) :
  rattaché à une facture **validée** ; l'article doit avoir été réceptionné sur
  cette facture ; la quantité retournée ne dépasse ni le solde du lieu ni
  `reçu sur la facture − déjà retourné` pour cet article (`409
STOCK_RETURN_EXCEEDS_RECEIVED`). Motif dans la colonne « Retour fournisseur ».
- **A6-R2. Rebut** (`SCRAP`, droit `STOCK_DISPOSE`) : matière détruite ou
  inutilisable, motif dans la colonne « Rebut ». Jamais imputé à un chantier,
  comme un écart d'inventaire (`src/lib/finance/stock-inventaire.ts:72-73`, en-tête).
- **A6-R3. Comptabilité** (détail data-model §4) : rebut au débit du 603, crédit
  du 311, au coût moyen du lieu ; retour fournisseur au crédit du 311 au coût
  moyen du lieu, au débit du 401 au **prix fournisseur** du retour, l'écart en
  603, et un mouvement « réglé » sur le compte de tiers du fournisseur. Les deux
  restent dans le plan de comptes opérationnel existant
  (`src/lib/finance/accounting.ts:280-347`).
- **A6-R3 bis. Prix fournisseur du retour** (la part portée au 401) : jamais le
  coût de réception quand celui-ci a pu être fixé sans la facture. Dans l'ordre :
  1. `supplierInvoiceLineId` fourni (ligne de la **même** facture, avec un prix
     unitaire) → prix unitaire de la ligne de facture ;
  2. sinon, si **toutes** les réceptions de l'article sur cette facture ont la
     source `DECLARED` ou `INVOICE_LINE` (une réception d'avant le lot,
     `valuationSource` nul, avait un prix saisi obligatoire et compte comme
     `DECLARED`) → coût de réception de la facture (Σ `totalValue` ÷ Σ
     `quantity` de ces réceptions) ;
  3. sinon → `409 STOCK_RETURN_UNVALUED` : « Indiquez la ligne de la facture
     qui porte cet article pour valoriser le retour. »
     Raison : une réception valorisée au coût moyen du lieu, au dernier prix ou à
     zéro (A8-R3, étapes 3 à 5) réduirait la dette fournisseur d'un montant
     arbitraire, voire nul.
- **A6-R4.** Aucun mouvement de valeur nulle ne produit d'écriture (règle
  étendue à l'ajustement d'inventaire, qui en produit une aujourd'hui).
- **A6-R5.** Le rebut et le retour, comme toute diminution, sont refusés s'ils
  rendent le stock négatif.
- **A6-R6. Rebuts fractionnés.** Outre `LARGE_SCRAP` par rebut, le cumul du mois
  civil (date du rebut) des rebuts d'un même lieu **restés chacun sous le
  seuil** lève une seule alerte `LARGE_SCRAP` de cumul (`details.mode =
MONTHLY_CUMUL`) quand il atteint `issueAlertAmount` (clé
  `SCRAP_CUMUL:<locationId>:<AAAA-MM>`). Les rebuts entrent dans les indicateurs
  (B8 : valeur du mois et part de la valeur sortie du lieu), pour qu'une
  disparition passée en rebut plutôt qu'en écart d'inventaire reste visible.
- **A6-R7. Ce qu'un retour ne fait pas.** Il ne réduit pas le « reste à payer »
  affiché par facture (limite §3.3) ; l'écran du retour le dit.

**Critères d'acceptation**

1. 100 sacs reçus sur la facture F dont la ligne « Ciment » est à 5 000, coût
   moyen du lieu 5 200 : un retour de 10 sacs avec `supplierInvoiceLineId` de
   cette ligne écrit D401 50 000, C311 52 000, D603 2 000, et diminue de 50 000 le
   solde du compte de tiers du fournisseur.
2. Un retour de 120 sacs sur F (100 reçus) → `409 STOCK_RETURN_EXCEEDS_RECEIVED`.
3. Un rebut de 5 sacs au coût moyen 5 200 écrit D603 26 000 / C311 26 000, et
   `sumSiteActualCost` ne bouge pas.
4. Le magasinier (sans `STOCK_DISPOSE`) reçoit `403`.
5. Les réceptions de l'article sur F ont la source `AVERAGE_COST` et le retour
   n'indique pas de ligne de facture → `409 STOCK_RETURN_UNVALUED`, rien n'est
   écrit.
6. Seuil 500 000 : trois rebuts de 200 000 sur le même lieu dans le mois → aucune
   alerte aux deux premiers, une alerte `LARGE_SCRAP` de cumul au troisième.

### A7 — Bascule, clôture et chantier clos

**Règles**

- **A7-R1. Inventaire d'ouverture proposé, et seulement là où il a un sens.**
  Un inventaire de nature `OPENING` s'ouvre par `POST /stock/counts` aux trois
  conditions suivantes, sinon `409 STOCK_OPENING_COUNT_NOT_ALLOWED` :
  1. le lieu est le lieu d'un chantier (`kind = SITE`) — **jamais un magasin**
     (`WAREHOUSE`) : un magasin n'a pas d'« avant la bascule » dont la matière
     aurait déjà été imputée ;
  2. dans les **30 jours** qui suivent la bascule du chantier
     (`ConstructionSite.stockEnabledAt`) ;
  3. aucun autre `OPENING` non abandonné sur ce lieu (`409
STOCK_OPENING_COUNT_EXISTS`, index unique partiel).
     La bascule (`POST /finance/sites/{siteId}/stock/enable`), le statut de stock
     du chantier et `LocationView` renvoient `openingCountSuggested = true` tant
     que ces conditions sont remplies et qu'aucun `OPENING` n'a été validé.
- **A7-R2. Valorisation de l'ouverture.** Seul un **surplus** d'un inventaire
  `OPENING` est particulier : il entre **à valeur nulle**, motif
  `OPENING_BALANCE` posé par le système, sans justification à saisir, et
  n'entre ni dans les alertes ni dans le taux d'écart : la matière présente
  avant la bascule a déjà été imputée au chantier par ses factures
  (`src/lib/finance/suppliers.ts:509-520`), lui donner une valeur la compterait
  deux fois. Un **manque** d'ouverture suit toutes les règles d'un inventaire
  courant : valorisé, justifié, compté dans `COUNT_VARIANCE` et dans le taux
  d'écart. A1 et A2-R8 s'y appliquent. Raison du resserrement : un `OPENING`
  ouvert n'importe quand sur n'importe quel lieu servirait à radier un manque
  sans alerte.
- **A7-R3. Contrôle à la clôture : trois bloqueurs.** `collectClosureBlockers`
  (`src/lib/finance/site-closing.ts:707-762`) ajoute, pour un chantier qui a un
  lieu de stockage :
  1. `STOCK_COUNT` — un inventaire `DRAFT` ou `COUNTED` sur ce lieu
     (`documentIds = [countId]`). Message : « Un inventaire est en cours sur le
     lieu de stockage du chantier : terminez-le avant de clôturer. »
  2. `STOCK_RESIDUAL` — au moins un solde de quantité > 0 sur ce lieu
     (`count` = nombre d'articles, `documentIds = [locationId]`). Message :
     « Le lieu de stockage du chantier porte encore du stock : faites
     l'inventaire de clôture, puis transférez le reste vers un magasin. »
  3. `STOCK_CLOSING_COUNT_MISSING` — le lieu a reçu au moins un mouvement
     entrant (réception, transfert entrant, ajustement en hausse) et **aucun
     inventaire `CLOSING` n'a été validé après le dernier mouvement entrant**
     (`documentIds = [locationId]`). Message : « Le lieu de stockage du chantier
     n'a pas d'inventaire de clôture validé depuis sa dernière entrée de
     marchandise. »
     Le parcours attendu est donc : inventaire de clôture (qui ajuste le stock au
     réel et fait apparaître un manque), puis transfert du reste vers un magasin
     (motif `SITE_EVACUATION`), puis clôture. Un inventaire `CLOSING` d'un lieu dont
     tous les soldes sont nuls peut être clos sans ligne : il atteste un lieu vide
     (A2-R4).
- **A7-R3 bis. Course entre clôture et entrée de marchandise.** La clôture du
  chantier, la réception sur le lieu d'un chantier et le transfert **vers** le
  lieu d'un chantier prennent tous le verrou consultatif
  `pg_advisory_xact_lock(hashtext('stock-site'), hashtext(<siteId>))` **avant**
  de vérifier que le chantier est ouvert (clôture : avant
  `collectClosureBlockers`, `src/lib/finance/site-closing.ts:801`). Une entrée
  et une clôture simultanées ne passent donc jamais toutes les deux. Ordre des
  verrous : A10-R2.
- **A7-R4. Transfert vers un chantier clos refusé** (`409 STOCK_SITE_CLOSED`).
  Le transfert **depuis** un chantier clos reste permis (évacuation). La réception
  sur le lieu d'un chantier clos est refusée pour la même raison (extension
  cohérente : une livraison sur un chantier fini ne s'explique pas).

**Choix du bloqueur plutôt que l'avertissement** : après la clôture, plus rien
n'est imputable au chantier ; le reste qui y dort devient la matière la plus
facile à faire disparaître sans trace. C'est pourquoi aucun stock ne doit rester
sur le lieu d'un chantier clos (bloqueur 2), et pourquoi le reste doit avoir été
compté avant d'être déplacé (bloqueur 3) : un transfert du solde théorique vers
un magasin noierait le manque du chantier dans le stock du magasin. Un
avertissement se clique ; un bloqueur a une sortie simple et la réouverture
existe (`src/lib/finance/site-closing.ts:845`). C'est aussi la forme des
bloqueurs actuels.

**Critères d'acceptation**

1. Après la bascule d'un chantier, la réponse contient `openingCountSuggested:
true` ; après validation d'un inventaire `OPENING`, `false` ; 31 jours après
   la bascule sans `OPENING`, `false`.
2. Un inventaire `OPENING` compte 50 sacs sur un lieu vide : solde 50, valeur 0,
   aucune écriture (A6-R4), aucune alerte.
3. Un second `OPENING` sur le même lieu → `409 STOCK_OPENING_COUNT_EXISTS`.
4. Un `OPENING` sur un magasin, ou sur le lieu d'un chantier basculé il y a 31
   jours → `409 STOCK_OPENING_COUNT_NOT_ALLOWED`.
5. Un `OPENING` qui constate 10 sacs de moins que l'attendu (valeur 52 000, seuil
   100 000, taux 5 %, valeur comptée 400 000) : la ligne exige un motif, un
   ajustement à 52 000 est écrit, et `COUNT_VARIANCE` est ouverte (taux 13 %).
6. Un chantier dont le lieu porte 12 sacs : `GET …/closure-blockers` liste
   `STOCK_RESIDUAL` et `STOCK_CLOSING_COUNT_MISSING` ; `POST …/close` répond `409`.
   Après un inventaire `CLOSING` validé (qui constate 10 sacs) puis un transfert
   des 10 sacs vers un magasin, la clôture passe.
7. Même chantier, inventaire `CLOSING` validé, puis une réception de 5 sacs sur
   le lieu, puis leur sortie : `STOCK_CLOSING_COUNT_MISSING` revient.
8. Un transfert vers le lieu d'un chantier clos → `409 STOCK_SITE_CLOSED` ; depuis
   ce lieu vers un magasin → accepté. (Le test
   `__tests__/unit/finance.stock-inventaire.test.ts:608-626` est inversé
   délibérément, décision du fondateur.)
9. Test d'intégration (base réelle) : une clôture et un transfert vers le lieu du
   même chantier lancés en parallèle → l'un des deux échoue.

### A8 — Contrôle des réceptions

**Règles**

- **A8-R1.** Avant la réception, `GET /stock/supplier-invoices/{invoiceId}/receipts`
  liste les réceptions déjà faites sur la facture (bon, date, auteur, quantités
  par article ; valeurs selon `STOCK_VALUES_VIEW`) pour que l'écran prévienne.
  La même réponse porte les **lignes de la facture** (`invoice.lines`, pour
  rattacher une ligne reçue ou retournée à une ligne de facture) et un cumul
  **par article** (`byItem` : reçu, retourné, retournable, et si les valeurs
  sont visibles, la source de prix des réceptions) : l'écran n'additionne rien.
  Les lignes de facture ne sont plus livrées par le contexte terrain (B3-R1).
- **A8-R2.** Après chaque réception, dans la même transaction :
  - `RECEIPT_REPEATED` (information) si la facture avait déjà au moins une
    réception — les réceptions partielles sont légitimes, on le signale sans
    l'interdire ;
  - `RECEIPT_OVER_INVOICE` (attention) si la valeur cumulée reçue sur la facture
    (réceptions moins retours) dépasse `SupplierInvoice.amount` ;
  - `RECEIPT_UNVALUED` (information) si une ligne est entrée sans prix connu
    (A8-R3), avec la liste des articles concernés (`itemIds`).
    La réponse de réception porte `controls` (code, gravité, message, `itemIds` ;
    montants à `null` sans `STOCK_VALUES_VIEW`, et un `message` alors construit
    **sans montant**).
- **A8-R3. Prix d'une ligne reçue**, pour **tout appelant** (la même chaîne
  sert le magasinier, qui ne voit ni ne saisit de valeur, et le comptable qui
  réceptionne depuis l'écran Magasin, où aucun prix n'est demandé) :
  1. `unitCost` fourni (permis seulement avec `STOCK_VALUES_VIEW`) → `DECLARED` ;
  2. sinon `supplierInvoiceLineId` fourni et ligne de facture avec prix unitaire →
     `INVOICE_LINE` (la ligne doit appartenir à la facture) ;
  3. sinon coût moyen du lieu s'il a du stock → `AVERAGE_COST` ;
  4. sinon dernier prix de réception de l'article dans l'agence → `LAST_RECEIPT` ;
  5. sinon 0 → `NONE` et alerte `RECEIPT_UNVALUED`.
     Un `unitCost` envoyé sans `STOCK_VALUES_VIEW` → `403 STOCK_VALUE_FIELD_FORBIDDEN`.
     Le prix n'est plus exigé (le code `STOCK_UNIT_COST_REQUIRED` disparaît) : la
     chaîne de repli s'applique, et le contrôle `RECEIPT_OVER_INVOICE` ainsi que
     l'alerte `RECEIPT_UNVALUED` signalent ses effets. La source est enregistrée
     sur le mouvement (`valuationSource`) et visible avec les valeurs.

**Écart justifié** : le lien facultatif vers une ligne de facture ne sert qu'à
prendre le prix ; ce n'est pas le rapprochement par article du niveau 3 (aucun
contrôle de quantité par ligne).

**Critères d'acceptation**

1. Deuxième réception sur une même facture → la réception est enregistrée, la
   réponse contient `controls[0].code = "RECEIPT_REPEATED"`, une alerte est ouverte.
2. Facture de 1 000 000 ; réceptions cumulées de 1 050 000 → alerte
   `RECEIPT_OVER_INVOICE` avec `amount = 1 050 000`, `threshold = 1 000 000`.
3. Le magasinier réceptionne une ligne liée à une ligne de facture à 4 800 →
   mouvement à 4 800, `valuationSource = "INVOICE_LINE"`, et sa réponse affiche
   `unitCost = null`.
4. Le magasinier envoie `unitCost` → `403 STOCK_VALUE_FIELD_FORBIDDEN`.
5. Le comptable réceptionne sans `unitCost` ni ligne de facture sur un lieu au
   coût moyen 5 200 → mouvement à 5 200, `valuationSource = "AVERAGE_COST"`,
   aucune erreur.
6. Le magasinier reçoit un contrôle `RECEIPT_OVER_INVOICE` : `amount` et
   `threshold` valent `null` et `message` ne contient aucun chiffre suivi de
   « FCFA ».

### A9 — Achats de matériaux en espèces

**Règles**

- **A9-R1.** Un poste de dépense est « matériaux » s'il figure dans
  `StockSettings.materialCostCategoryIds` ; si cette liste est vide, s'il est le
  poste proposé (`defaultCostCategoryId`) d'au moins un article actif.
- **A9-R2.** À la **validation** d'une pièce de caisse
  (`src/lib/finance/cash.ts:274-406`), dans sa transaction, à côté de
  `raiseBudgetAlertIfNeededTx` (`:379`) : si le poste est « matériaux » et que
  `cashMaterialAlertAmount` est renseigné, une alerte `CASH_MATERIAL_PURCHASE`
  est levée, **une seule par événement** :
  - pièce **≥ seuil** → alerte de la pièce (`details.mode = SINGLE`, clé
    `CASH_MATERIAL_PURCHASE:<voucherId>`) ;
  - pièce **< seuil** → cumul du mois civil **de la date de la pièce**
    (`voucherDate`, UTC) des pièces « matériaux » **validées** du même chantier
    restées chacune sous le seuil, pièce courante comprise ; s'il atteint le
    seuil, alerte de cumul (`details.mode = MONTHLY_CUMUL`, clé
    `CASH_MATERIAL_CUMUL:<siteId>:<AAAA-MM>`), une seule par chantier et par
    mois : le fractionnement en petites pièces ne la contourne pas.
    Elle ne lève jamais d'exception. Les réglages se lisent **sans**
    `ensureStockSettingsTx` (`findUnique` puis défauts en mémoire, data-model
    §2.2) : la transaction d'une pièce de caisse ne crée pas de ligne de réglages,
    ce qui l'exposerait à un conflit d'unicité concurrent. La naissance de
    l'alerte suit B7-R2 (`ON CONFLICT DO NOTHING`).
- **A9-R3.** S'applique à tout chantier, basculé au stock ou non.

**Critères d'acceptation**

1. Seuil 100 000, poste « Ciment » proposé par un article : une pièce de 150 000
   validée ouvre une alerte `SINGLE` ; une pièce de 40 000 n'en ouvre pas.
2. Trois pièces de 40 000 dans le mois sur le même chantier : une seule alerte
   `MONTHLY_CUMUL`, à la troisième ; une quatrième pièce de 40 000 est validée
   sans erreur et n'ouvre rien de plus.
3. Poste « Main-d'œuvre », aucune alerte. Seuil vide, aucune alerte.
4. Une pièce de 150 000 puis une de 40 000 dans le mois : une alerte `SINGLE`,
   aucune alerte de cumul (40 000 < seuil).
5. Validation d'une pièce dans une agence sans ligne `StockSettings` : aucune
   ligne de réglages n'est créée, les défauts s'appliquent.

### A10 — Verrou contre les sorties simultanées

**Règles**

- **A10-R1.** Toute écriture de solde (réception, sortie, transfert, rebut,
  retour, validation d'inventaire) prend, **avant de lire le solde**, un verrou
  consultatif de transaction par couple (article, lieu) :
  `pg_advisory_xact_lock(hashtext('stock-balance'), hashtext(tenantId || ':' || itemId || ':' || locationId))`,
  par `$executeRaw` (piège documenté `src/lib/finance/cash.ts:150-161`).
- **A10-R2. Ordre des verrous, toujours le même** (exclut l'interblocage) : 0. le verrou de la ligne d'inventaire (`stock_counts` en `FOR UPDATE`) pour
  toute opération d'inventaire (révision 3), statut et lignes relus après lui ;
  1. le verrou de chantier `stock-site:<siteId>` (A7-R3 bis), quand
     l'opération fait entrer de la marchandise sur le lieu d'un chantier ou
     clôture un chantier ;
     1 bis. le verrou de facture `stock-invoice` (réception et retour
     fournisseur, révision 3 : plafond « reçu − déjà retourné » et contrôles de
     réception sérialisés) ; 1 ter. le verrou du cumul mensuel des rebuts
     `stock-scrap-month` (agence, lieu, mois) ;
  2. les verrous de solde `stock-balance` de tous les couples (article, lieu)
     de l'opération, **triés** par ordre lexicographique de
     `tenantId:itemId:locationId` (transfert, réception et sortie multi-lignes,
     clôture du comptage, validation d'inventaire) ;
  3. le verrou de numérotation `stock-slip` (A10-R3), en dernier.
     Aucun verrou n'est pris après une écriture de solde. La clé d'idempotence
     (B3-R2) est la première **écriture** de la transaction ; les verrous ne sont
     pas des écritures et se prennent juste après elle.
- **A10-R3.** La numérotation des bons prend son propre verrou
  `pg_advisory_xact_lock(hashtext('stock-slip'), hashtext(tenantId))` — forme à
  deux entiers, espace de clés distinct de celui des pièces de caisse
  (`src/lib/finance/cash.ts:149-163`, forme à un entier).

**Critères d'acceptation**

1. Test d'intégration sur base réelle : 100 sacs, deux sorties de 60 lancées en
   parallèle → une seule réussit, l'autre reçoit `409 STOCK_INSUFFICIENT` ; solde
   final 40, un seul mouvement.
2. Deux transferts croisés A→B et B→A simultanés se terminent sans interblocage.

### A11 — Transfert : demandeur et motif obligatoires

**Règles**

- **A11-R1.** Un transfert exige un demandeur : `takerId` (carnet, B2) ou
  `requestedBy` (texte, 1 à 200 caractères) ; avec `requireTaker = true`,
  `takerId` est exigé. Même règle que la sortie (B2-R3).
- **A11-R2.** Il exige `reasonCode` (colonne « Transfert ») et `reason` pour
  `OTHER`. Le motif est porté par les deux moitiés du transfert.

**Critères d'acceptation**

1. Transfert sans demandeur → `400 STOCK_REQUESTER_REQUIRED` ; sans motif → `400
STOCK_REASON_REQUIRED`.
2. Le journal affiche le demandeur et le motif sur la sortie comme sur l'entrée.

## 7. Exigences — Sprint B : attribuer et prouver

### B1 — Rôle Magasinier et droits du stock

**Règles**

- **B1-R1. Dix permissions** (seed `prisma/seeds/stock-permissions-seed.ts`,
  migration de données, data-model §3) :

| Permission             | Ce qu'elle ouvre                                                                                                   | Magasinier | Comptable | Gestionnaire | Admin |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | :--------: | :-------: | :----------: | :---: |
| `STOCK_VIEW`           | Référentiel en lecture, soldes en quantité, journal, inventaires, preneurs, bons, pièces jointes, contexte terrain |     ✓      |     ✓     |      ✓       |   ✓   |
| `STOCK_VALUES_VIEW`    | Toute valeur (coûts, valeurs, écarts valorisés, seuils), indicateurs, filtres par personne                         |            |     ✓     |      ✓       |   ✓   |
| `STOCK_RECEIVE`        | Réceptions                                                                                                         |     ✓      |     ✓     |              |   ✓   |
| `STOCK_ISSUE`          | Sorties                                                                                                            |     ✓      |     ✓     |              |   ✓   |
| `STOCK_TRANSFER`       | Transferts                                                                                                         |     ✓      |     ✓     |              |   ✓   |
| `STOCK_COUNT`          | Ouvrir, compter, clore, justifier un inventaire                                                                    |     ✓      |     ✓     |              |   ✓   |
| `STOCK_TAKERS_MANAGE`  | Carnet des preneurs                                                                                                |     ✓      |     ✓     |              |   ✓   |
| `STOCK_COUNT_VALIDATE` | Valider, abandonner un inventaire, écarter une ligne ; quantités visibles pendant un comptage                      |            |           |              |   ✓   |
| `STOCK_DISPOSE`        | Rebut, retour fournisseur, retrait d'une pièce jointe                                                              |            |           |              |   ✓   |
| `STOCK_ALERTS_VIEW`    | Alertes, file « À traiter », e-mail d'alerte                                                                       |            |           |              |   ✓   |

- **B1-R2. Articulation avec `FINANCE_*`.** Les routes du stock passent sur les
  `STOCK_*`. La migration de données reporte l'équivalent sur **tous** les rôles
  qui portaient les droits financiers — les rôles sont globaux : rôles système
  livrés par les seeds, et rôles dont la plateforme aurait modifié les
  permissions (`PATCH /roles/:id/permissions`, `src/routes/role-routes.ts:42-46`) ;
  il n'existe pas de rôle propre à une agence (§5). Modèle :
  `prisma/migrations/20261006130000_syndic_permissions/migration.sql` (étape 3) :
  `FINANCE_ACCOUNTS_READ` → `STOCK_VIEW` + `STOCK_VALUES_VIEW` ;
  `FINANCE_DOCUMENTS_CREATE` → `STOCK_RECEIVE`, `STOCK_ISSUE`, `STOCK_TRANSFER`,
  `STOCK_COUNT`, `STOCK_TAKERS_MANAGE` ; `FINANCE_DOCUMENTS_VALIDATE` →
  `STOCK_COUNT_VALIDATE`, `STOCK_DISPOSE`, `STOCK_ALERTS_VIEW`. Personne ne perd
  un accès qu'il avait. Le tableau ci-dessus est le résultat de ce report pour
  les rôles système (`prisma/seeds/finance-permissions-seed.ts:93-100`).
- **B1-R2 bis. Décision : le comptable compte** (ancienne question Q3). Le
  report laisse `STOCK_COUNT` au rôle `TENANT_ACCOUNTANT`, qui compte
  aujourd'hui (décision D7 du lot 2). C'est une décision produit **globale** :
  aucune agence ne peut la changer pour elle seule. Elle est sans risque pour
  l'aveugle depuis la révision 2 : le comptable n'a pas `STOCK_COUNT_VALIDATE`
  et §8.2 lui masque aussi valeurs et coûts du lieu compté.
- **B1-R3. Restent sur `FINANCE_*`** : écriture du référentiel et des réglages
  (`FINANCE_SETTINGS_MANAGE`, `src/routes/finance-stock-referentiel-routes.ts:70-97`),
  bascule (`FINANCE_SETTINGS_MANAGE`), statut et rapprochement d'un chantier
  (`FINANCE_ACCOUNTS_READ`, `src/routes/finance-stock-rapprochement-routes.ts:70-81`),
  clôture (`FINANCE_DOCUMENTS_VALIDATE`).
- **B1-R4. Rôle `TENANT_STOREKEEPER`** (portée `TENANT`, libellé « Magasinier »
  ajouté à `TENANT_ROLE_LABELS_FR`, `src/services/invitation-service.ts:26-31`) :
  `STOCK_VIEW`, `STOCK_RECEIVE`, `STOCK_ISSUE`, `STOCK_TRANSFER`, `STOCK_COUNT`,
  `STOCK_TAKERS_MANAGE`. Aucun droit `FINANCE_*`, aucun autre module. Il
  s'attribue par l'écran des membres existant (`src/services/membership-service.ts:245-251`
  accepte tout rôle de portée `TENANT` non réservé).
- **B1-R5. Masquage côté API** (§8.1) : sans `STOCK_VALUES_VIEW`, tout champ de
  valeur vaut `null` dans les réponses JSON, est absent des CSV et des PDF, et le
  magasinier ne peut pas en envoyer (A8-R3).
- **B1-R6. Cache des permissions.** Le cache est en mémoire, par instance,
  pour 5 minutes (`src/services/permission-service.ts:3-13`), et rien ne
  l'invalide (`invalidatePermissionCache` et `clearPermissionCache`,
  `:146-172`, n'ont aucun appelant) : l'attribution ou le retrait du rôle
  Magasinier prend effet **au plus tard 5 minutes après, sur chaque instance**.
  À dire à l'agence (aide de l'écran des collaborateurs, hors lot) ; ce lot ne
  branche pas l'invalidation (changement transverse de la gestion des membres).
  La migration est sans objet : le déploiement redémarre l'API et vide le cache.
  Tout contrôle qui engage la sécurité d'une écriture et porte sur **d'autres**
  utilisateurs que l'appelant (A1-R3, destinataires de B7-R6) lit la base, pas
  le cache.

**Critères d'acceptation**

1. Après migration, un rôle qui avait `FINANCE_DOCUMENTS_CREATE` (dont
   `TENANT_ACCOUNTANT`) possède `STOCK_ISSUE` ; un utilisateur qui pouvait
   sortir du stock le peut toujours.
2. Un magasinier reçoit `403` sur `GET /finance/suppliers`, `GET
/finance/sites/{id}/stock/reconciliation`, `GET /stock/indicators`, `GET
/stock/alerts`.
3. Un magasinier qui lit `GET /stock/balances` reçoit `value = null` et
   `averageUnitCost = null`, et `meta.valuesVisible = false`.
4. Un magasinier qui télécharge un bon de sortie obtient un PDF sans aucun montant.

### B2 — Carnet des preneurs

**Règles**

- **B2-R1.** Un preneur porte : nom complet (obligatoire, 2 à 120 caractères),
  équipe ou entreprise (facultatif, 120), téléphone (facultatif, format libre
  normalisé, 30), lien facultatif vers un employé **ou** un tâcheron de l'agence
  (`Employee`, `prisma/schema.prisma:7076` ; `Contractor`, `:7200`), actif ou non.
  Aucun autre champ (ni pièce d'identité, ni photo, ni note libre).
- **B2-R2.** Tout identifiant d'employé ou de tâcheron reçu est vérifié par
  `assertBelongsToTenant` (`src/utils/tenant-ownership.ts:64`) ; une référence
  d'une autre agence lève la même `NotFoundError` qu'un objet inexistant.
- **B2-R3. Sortie.** Elle porte `takerId` (facultatif) ou `requestedBy` (texte) ;
  au moins l'un des deux. Avec `takerId`, `requestedBy` reçoit un **instantané**
  du libellé du preneur (« Nom — Équipe ») : le renommer ne réécrit pas
  l'histoire, et les lecteurs actuels de `requestedBy` continuent de fonctionner.
  Le réglage `requireTaker` (faux par défaut) rend `takerId` obligatoire : mode
  simple ou mode strict, au choix de l'agence.
- **B2-R4.** Un preneur ne se supprime pas ; il se désactive. Un preneur inactif
  ne peut plus être choisi. Le téléphone peut être effacé à tout moment.
- **B2-R5.** Pas de doublon silencieux : à la création, si un preneur actif de
  même nom (insensible à la casse et aux accents) et même équipe existe, `409
STOCK_TAKER_DUPLICATE` avec `data.existingTakerId`.
- **B2-R6. Minimisation à la lecture.** Le téléphone d'un preneur n'est rendu
  qu'à un détenteur de `STOCK_TAKERS_MANAGE` (`phone = null` sinon, dans la
  liste, le contexte terrain et le bon). La liste des employés et tâcherons
  proposée pour lier un preneur (`FieldContext.people`) n'est livrée qu'à
  `STOCK_TAKERS_MANAGE` et ne porte que le **nom** (ni métier, ni poste, ni
  contact).

**Critères d'acceptation**

1. Une sortie avec `takerId` d'une autre agence → `404`.
2. Une sortie avec `requireTaker = true` et seulement `requestedBy` → `400
STOCK_TAKER_REQUIRED`.
3. Renommer un preneur ne change pas le `requestedBy` des sorties passées.
4. Un preneur désactivé choisi pour une sortie → `409 STOCK_TAKER_INACTIVE`.

### B3 — Parcours mobile du magasinier (contrat d'API)

Les écrans sont spécifiés par l'agent des écrans ; l'API leur garantit :

- **B3-R1. Un seul appel de chargement** : `GET /stock/field-context` renvoie les
  lieux actifs (avec l'inventaire en cours, le chantier clos, l'inventaire
  d'ouverture suggéré et les articles à recompter), les chantiers ouverts et leur
  lieu, les postes actifs, les articles actifs, les preneurs actifs, les **50**
  factures validées les plus récentes des 180 derniers jours **sans leurs
  lignes**, les listes de motifs, les réglages utiles (`requireTaker`,
  `backdatingLimitDays`) et les droits de l'appelant (`abilities`, dont
  `canViewAlerts` et `canManageSettings`). Valeurs masquées selon §8.1. Le
  poids reste compatible avec un téléphone en 3G : les lignes d'une facture se
  lisent à la demande (`GET /stock/supplier-invoices/{invoiceId}/receipts`,
  A8-R1), et une facture plus ancienne ou hors des 50 se cherche par
  `GET /stock/receivable-invoices?search=&cursor=` (`STOCK_VIEW`, mêmes
  masques, 20 par page).
- **B3-R2. Idempotence** : toute écriture terrain (réception, sortie, transfert,
  rebut, retour, saisie de ligne, dépôt de pièce jointe) accepte
  `clientRequestId` (UUID tiré par l'appareil). Mécanique :
  - l'insertion de la clé (`StockClientRequest`) est la **première écriture**
    de la transaction de l'opération ; un rejeu concurrent bute sur l'unicité,
    sa transaction est annulée (`P2002`), et le contrôleur relit la clé pour
    répondre ;
  - même identifiant, **même utilisateur** et même corps → `200` et le résultat
    d'origine, **relu et masqué pour l'appelant** (§8.1, §8.2 à l'instant du
    rejeu), sans rien réécrire ;
  - même identifiant avec un corps différent, ou rejoué par **un autre
    utilisateur** de l'agence → `409 STOCK_IDEMPOTENCY_MISMATCH` ;
  - les clés de plus de 30 jours sont purgées chaque nuit par la tâche
    `src/jobs/stock-maintenance-job.ts` (B7-R6).
    Indispensable sur un réseau instable.
- **B3-R3. Sortie multi-lignes** : une sortie porte 1 à 50 lignes (article,
  quantité, poste) pour un même lieu, chantier et preneur ; un seul bon. Le corps
  à un article (actuel) reste accepté.
- **B3-R4. Poids** : les réponses d'écriture renvoient le bon et les mouvements
  créés, sans relire de liste.
- **B3-R5. Photo** : le dépôt accepte 10 Mo ; l'écran est invité à réduire
  l'image avant envoi (recommandation : 1 600 px de grand côté, JPEG qualité 0,7).

**Critères d'acceptation**

1. Deux `POST /stock/issues` identiques avec le même `clientRequestId` : un seul
   mouvement, un seul bon, la seconde réponse est `200` avec le même bon.
2. `GET /stock/field-context` d'un magasinier ne contient aucun montant ni
   aucune ligne de facture ; celui d'un gestionnaire (`STOCK_VIEW` sans
   `STOCK_TAKERS_MANAGE`) ne contient aucun téléphone de preneur et une liste
   `people` vide.
3. Le même `clientRequestId` rejoué par un autre utilisateur → `409
STOCK_IDEMPOTENCY_MISMATCH`.

### B4 — Bons PDF numérotés

**Règles**

- **B4-R1. Trois natures** : bon de réception (`BR`), à la réception ; bon de
  sortie (`BS`), à la sortie ; procès-verbal d'inventaire (`PVI`), à la
  validation. Numéro `BR-2026-00042` : préfixe, année de la date du document,
  rang sur 5 chiffres, **continu par agence, nature et année** (unicité en base).
  Tiré sous verrou (A10-R3) dans la transaction de l'opération : une opération
  annulée ne consomme pas de numéro.
- **B4-R2. Contenu** : en-tête de l'agence (`src/lib/documents/document-branding.ts`),
  numéro en gras, date du document et heure serveur d'enregistrement, lieu,
  chantier, preneur ou demandeur, lignes (référence, désignation, unité,
  quantité), auteur ; valeurs seulement si l'appelant détient
  `STOCK_VALUES_VIEW`. Zones de signature : BR « Livré par » / « Reçu par
  (magasinier) » ; BS « Remis par (magasinier) » / « Reçu par (preneur) » ; PVI
  « Compté par » (tous les compteurs, A1-R1) / « Validé par », avec la mention de
  dérogation si A1-R3 s'applique, la mention « comptée par une personne qui
  voyait le stock » sur les lignes `countedBlind = false` (A2-R9), les rubriques
  « lignes écartées » et « non comptés » (A2-R7, A2-R8), et le nombre de
  mouvements postérieurs au comptage (« non mesuré » pour une ligne d'avant le
  lot, A3-R4).
- **B4-R3. Contenu figé.** Les libellés métier imprimés (articles : référence,
  désignation, unité ; lieu ; chantier ; preneur ou demandeur ; facture et
  fournisseur ; auteur ; compteurs et validateur pour un PVI) sont **figés à
  l'émission** dans `StockSlip.snapshot` (data-model §2.6) : renommer un article
  ou un preneur ne change pas un bon déjà émis. Seul l'en-tête de l'agence
  (`src/lib/documents/document-branding.ts`) est relu, puisqu'il identifie
  l'émetteur. Le PDF se régénère à la demande (aucun fichier stocké), avec la
  mention « exemplaire réimprimé le … ». Il est **en français** (pièce
  comptable) ; tout texte passe par `sanitizeForPdf`
  (`src/lib/documents/pdf-text.ts:24`) : la police Helvetica de `pdf-lib`
  (WinAnsi) n'imprime pas l'arabe, un libellé saisi en arabe sort translittéré
  ou remplacé, jamais en erreur. Le téléchargement est tracé par le middleware
  d'accès (`DOCUMENT_DOWNLOADED`, spec 023 §6).
- **B4-R3 bis. Inventaires validés avant le lot.** Ils n'ont pas de PVI
  numéroté : `GET …/counts/{countId}/report.pdf` produit un procès-verbal
  **sans numéro**, titré « Procès-verbal d'inventaire (antérieur à la
  numérotation) », reconstitué depuis les lignes (aucun `StockSlip` n'est créé
  à la volée).
- **B4-R4.** La photo du bon papier signé s'attache au bon (B5, finalité
  `SIGNED_SLIP`).

**Critères d'acceptation**

1. Deux sorties successives d'une agence en 2026 produisent `BS-2026-00001` puis
   `BS-2026-00002` ; une troisième agence repart à `00001`.
2. Une sortie refusée (`409`) ne consomme aucun numéro.
3. Le PDF d'un PVI en `DRAFT`, `COUNTED` ou `CANCELLED` → `409
STOCK_COUNT_WRONG_STATUS` (le numéro naît à la validation) ; celui d'un
   inventaire validé avant le lot → `200`, PDF sans numéro.
4. Renommer l'article après l'émission d'un BS : le PDF régénéré imprime
   l'ancien libellé.

### B5 — Pièces jointes photo

**Règles**

- **B5-R1. Cibles** : un mouvement (sortie, transfert, rebut, retour), un bon
  (réception, sortie, PV), une ligne d'inventaire. Finalités : `GOODS_PHOTO`,
  `DELIVERY_NOTE`, `SIGNED_SLIP`, `OTHER`. Un mouvement de type `RECEIPT` ou
  `ADJUSTMENT` n'est pas une cible (`409 STOCK_ATTACHMENT_TARGET_NOT_ALLOWED`) :
  une réception se documente sur son bon, un ajustement sur la ligne
  d'inventaire qui l'a produit.
- **B5-R2. Fichier** : JPEG, PNG, WebP ou PDF, 10 Mo au plus ; type vérifié sur
  les premiers octets, pas sur le seul type déclaré — en réutilisant les aides
  existantes (`detectProviderInvoiceFileKind`,
  `src/lib/syndics/provider-invoice-files.ts:30`, pour PDF, PNG et JPEG), à
  étendre au WebP (`RIFF….WEBP`) dans le module du stock. Stocké sous
  `uploads/stock/<tenantId>/<aaaa>/<uuid>.<ext>`, jamais servi en statique
  (`src/middleware/uploads-access-middleware.ts:63`), relu par
  `privateUploadPath` / `readPrivateUpload` / `sendPrivateFile`
  (`src/lib/files/private-files.ts:53, 75, 102`) après contrôle de l'agence.
- **B5-R3. Pas de géolocalisation** : les métadonnées (dont la position GPS) sont
  retirées **avant** écriture : un JPEG ne garde que APP0, APP2 (profil ICC) et
  les segments d'image (APP1, APP13, COM et autres APPn retirés) ; un PNG perd
  `eXIf` et tous les blocs texte (`tEXt`, `zTXt`, `iTXt`) ; un WebP perd `EXIF`
  et `XMP ` (drapeaux VP8X et taille RIFF recalculés), par un filtre d'octets sans dépendance nouvelle. Les PDF sont
  stockés tels quels : leurs métadonnées (auteur, logiciel) ne sont pas retirées.
- **B5-R4. Preuve** : empreinte SHA-256 du fichier **stocké**, taille, heure
  serveur (`createdAt`), auteur (`uploadedByUserId`, obligatoire). L'empreinte est
  rendue par l'API et imprimée sur le bon quand la pièce est un `SIGNED_SLIP`.
- **B5-R5. Retrait** : pas de suppression silencieuse. Le dépositaire peut retirer
  sa pièce dans les 15 minutes ; au-delà, un détenteur de `STOCK_DISPOSE`, avec
  un motif (cas type : la photo montre une personne). Le fichier est effacé du
  disque, la ligne reste avec `removedAt`, `removedByUserId`, `removalReason` et
  l'empreinte. Audité (`STOCK_ATTACHMENT_REMOVED`, critique).
- **B5-R6. Droit de dépôt**, vérifié par le service selon la cible (la garde
  de route exige l'un des droits ci-dessous) :

  | Cible                                  | Droit de dépôt                          |
  | -------------------------------------- | --------------------------------------- |
  | Mouvement `ISSUE`                      | `STOCK_ISSUE`                           |
  | Mouvement `TRANSFER` (moitié sortante) | `STOCK_TRANSFER`                        |
  | Mouvement `SCRAP`, `SUPPLIER_RETURN`   | `STOCK_DISPOSE`                         |
  | Bon `RECEIPT` (BR)                     | `STOCK_RECEIVE`                         |
  | Bon `ISSUE` (BS)                       | `STOCK_ISSUE`                           |
  | Bon `COUNT_REPORT` (PVI signé)         | `STOCK_COUNT_VALIDATE`                  |
  | Ligne d'inventaire                     | `STOCK_COUNT` ou `STOCK_COUNT_VALIDATE` |

  Une ligne d'inventaire n'accepte de pièce jointe qu'en `COUNTED` — c'est le
  moment de la justification ; en `DRAFT` la ligne peut encore disparaître, en
  `VALIDATED` elle est figée. Le **retrait** suit B5-R5 pour toutes les cibles
  (dépositaire dans les 15 minutes, `STOCK_DISPOSE` ensuite) ; `AttachmentView`
  dit à l'appelant s'il peut retirer (`canRemove`, `removableUntil`).

- **B5-R7. Rejeu d'un dépôt.** Le dépôt accepte `clientRequestId` (B3-R2,
  opération `ATTACHMENT`) : un envoi répété après une coupure ne dépose pas
  deux fois la même photo.
- **B5-R8. Lecture tracée.** Chaque lecture d'un fichier (vignette comprise)
  passe par `GET …/attachments/{attachmentId}/file` et produit une ligne
  `DOCUMENT_DOWNLOADED` (middleware d'accès, spec 023 §6). C'est voulu (une
  photo de preuve consultée laisse une trace) ; l'écran ne charge donc les
  vignettes qu'à l'ouverture d'un bon ou d'une ligne, jamais dans une liste.
- **B5-R9. Export d'agence.** Le dossier `stock/` est ajouté aux règles de
  l'export (`UPLOAD_FOLDER_RULES`,
  `src/services/tenant-data-export/file-references.ts:79-90`, propriétaire
  `tenant`) : sans cette entrée, les pièces jointes seraient refusées de
  l'archive. `StockClientRequest` est classé « exclu » du registre d'export
  (donnée technique sans valeur pour l'agence) : entrée dans `EXCLUDED_MODELS`
  (`src/services/tenant-data-export/model-registry.ts:62`), contrôlée par
  `__tests__/unit/tenant-data-export.registry.test.ts`.

**Critères d'acceptation**

1. Un JPEG contenant des coordonnées GPS est stocké sans bloc EXIF ; l'empreinte
   renvoyée est celle du fichier stocké.
2. Un fichier `.jpg` dont les premiers octets sont ceux d'un HTML → `400
STOCK_ATTACHMENT_TYPE`.
3. La pièce jointe d'une autre agence → `404` (test d'isolation).
4. Un retrait par un tiers sans `STOCK_DISPOSE` après 15 minutes → `403`.
5. Une pièce jointe visant un mouvement `RECEIPT` → `409
STOCK_ATTACHMENT_TARGET_NOT_ALLOWED`.
6. Deux dépôts du même fichier avec le même `clientRequestId` → une seule pièce.
7. L'export d'agence d'une agence qui a une pièce jointe de stock contient le
   fichier.

### B6 — Traçabilité dans le journal d'audit de l'agence

**Règles**

- **B6-R1.** Clés ajoutées à `AuditActionKey` et au catalogue
  (`src/types/audit-catalog.ts`), toutes `visibility = TENANT` :

| Clé                                                 | Catégorie | Critique | Objet                                                                                                      |
| --------------------------------------------------- | --------- | :------: | ---------------------------------------------------------------------------------------------------------- |
| `STOCK_RECEIPT_RECORDED`                            | DATA      |    ✓     | `StockSlip`                                                                                                |
| `STOCK_ISSUE_RECORDED`                              | DATA      |    ✓     | `StockSlip`                                                                                                |
| `STOCK_TRANSFER_RECORDED`                           | DATA      |    ✓     | `StockMovement` (moitié sortante)                                                                          |
| `STOCK_SUPPLIER_RETURN_RECORDED`                    | DATA      |    ✓     | `StockMovement`                                                                                            |
| `STOCK_SCRAP_RECORDED`                              | DATA      |    ✓     | `StockMovement`                                                                                            |
| `STOCK_COUNT_OPENED`                                | DATA      |          | `StockCount`                                                                                               |
| `STOCK_COUNT_LINE_RECORDED`                         | DATA      |          | `StockCount` (article, quantité avant et après, auteur précédent ; A4-R1)                                  |
| `STOCK_COUNT_LINE_REMOVED`                          | DATA      |          | `StockCount` (article, quantité retirée)                                                                   |
| `STOCK_COUNT_CLOSED`                                | DATA      |    ✓     | `StockCount` (dont nombre de lignes non comptées créées, A2-R8)                                            |
| `STOCK_COUNT_LINE_JUSTIFIED`                        | DATA      |          | `StockCount`                                                                                               |
| `STOCK_COUNT_LINE_SET_ASIDE`                        | DATA      |    ✓     | `StockCount` (attendu et compté ; une seule ligne d'audit listant les articles pour `set-aside-uncounted`) |
| `STOCK_COUNT_VALIDATED`                             | DATA      |    ✓     | `StockCount`                                                                                               |
| `STOCK_COUNT_SELF_VALIDATED`                        | SECURITY  |    ✓     | `StockCount`                                                                                               |
| `STOCK_COUNT_CANCELLED`                             | DATA      |    ✓     | `StockCount` (attendu et compté de chaque ligne, A2-R6)                                                    |
| `STOCK_BLIND_INSUFFICIENT_REFUSED`                  | DATA      |          | `StockLocation` (refus `STOCK_INSUFFICIENT` sur un lieu en comptage : article, quantité demandée ; §3.3)   |
| `STOCK_TAKER_CREATED` / `STOCK_TAKER_UPDATED`       | DATA      |          | `StockTaker` (`redact: ['phone']`)                                                                         |
| `STOCK_ATTACHMENT_ADDED`                            | DATA      |          | `StockAttachment`                                                                                          |
| `STOCK_ATTACHMENT_REMOVED`                          | DATA      |    ✓     | `StockAttachment`                                                                                          |
| `STOCK_ALERT_ACKNOWLEDGED`                          | DATA      |          | `StockAlert`                                                                                               |
| `STOCK_CONTROLS_UPDATED`                            | ADMIN     |    ✓     | `StockSettings` (avec `changes`)                                                                           |
| `STOCK_SITE_ENABLED`                                | ADMIN     |    ✓     | `ConstructionSite`                                                                                         |
| `STOCK_ITEM_CREATED` / `STOCK_ITEM_UPDATED`         | ADMIN     |          | `StockItem` (avec `changes`, dont l'unité)                                                                 |
| `STOCK_LOCATION_CREATED` / `STOCK_LOCATION_UPDATED` | ADMIN     |          | `StockLocation`                                                                                            |

- **B6-R2.** Les critiques s'écrivent par `recordAuditEvent(tx, …)`
  (`src/services/audit-service.ts:71`), les autres par `logAuditEvent`
  (`:38`). Le `payload` porte les identifiants, quantités, numéro de bon, motif ;
  les valeurs y figurent (le journal n'est lisible qu'avec `TENANT_AUDIT_VIEW`).
- **B6-R3.** `enrichAuditLogsWithResourceLabels` (`src/services/audit-service.ts:136`)
  reçoit les libellés de `StockSlip` (numéro), `StockCount` (lieu et date),
  `StockTaker` (nom), bornés à l'agence.
- **B6-R4.** Aucune migration de rattrapage : aucune ligne historique ne porte ces
  clés. En revanche `__tests__/unit/audit-catalog.test.ts` **doit être
  modifié** : chaque clé nouvelle s'ajoute à sa liste `postMigrationKeys`
  (`:74` et suivantes, « chaque nouvelle clé du catalogue s'ajoute ici »), sinon
  le test de concordance avec le SQL de la migration 023 échoue. Les libellés web
  vont dans `apps/web/src/constants/audit-labels.ts` (ecrans §10.6).
- **B6-R5.** Les événements non critiques écrits par `logAuditEvent` le sont
  **après** la transaction (un refus `STOCK_INSUFFICIENT` annule la transaction :
  `STOCK_BLIND_INSUFFICIENT_REFUSED` s'écrit dans le gestionnaire d'erreur du
  contrôleur, hors transaction).

**Critères d'acceptation**

1. Une sortie écrit `STOCK_ISSUE_RECORDED` dans sa transaction ; si l'écriture
   d'audit échoue, la sortie est annulée.
2. `GET /api/tenants/{tenantId}/audit?entityType=StockCount` d'un administrateur
   liste l'ouverture, la clôture et la validation d'un inventaire.

### B7 — Alertes

**Règles**

- **B7-R1. Natures** (`StockAlertKind`) et seuils (réglages de l'agence,
  data-model §2.2 ; défauts proposés, modifiables) :

| Nature                   | Quand                                                                                                                                                                                                      | Gravité     | Seuil                                                                    | Clé anti-doublon                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `COUNT_VARIANCE`         | Validation d'un inventaire dont l'écart brut valorisé — lignes ajustées **et lignes écartées** (A2-R7), hors surplus d'ouverture (A7-R2) — atteint le seuil en montant **ou** en taux de la valeur comptée | attention   | `countVarianceAlertAmount` (100 000) ; `countVarianceAlertPercent` (5 %) | `COUNT_VARIANCE:<countId>`                                                      |
| `COUNT_LINE_SET_ASIDE`   | Validation d'un inventaire qui a au moins une ligne écartée ou non comptée (A2-R7, A2-R8)                                                                                                                  | information | —                                                                        | `COUNT_LINE_SET_ASIDE:<countId>`                                                |
| `COUNT_CANCELLED`        | Abandon d'un inventaire qui avait au moins une ligne (A2-R6)                                                                                                                                               | information | —                                                                        | `COUNT_CANCELLED:<countId>`                                                     |
| `COUNT_SELF_VALIDATED`   | A1-R3                                                                                                                                                                                                      | information | —                                                                        | `COUNT_SELF_VALIDATED:<countId>`                                                |
| `LARGE_ISSUE`            | Bon de sortie dont la valeur totale atteint le seuil                                                                                                                                                       | attention   | `issueAlertAmount` (500 000)                                             | `LARGE_ISSUE:<slipId>`                                                          |
| `LARGE_SCRAP`            | Rebut dont la valeur atteint le seuil (`SINGLE`) ; cumul du mois des rebuts d'un lieu restés sous le seuil (`MONTHLY_CUMUL`, A6-R6)                                                                        | attention   | `issueAlertAmount`                                                       | `LARGE_SCRAP:<movementId>` ; `SCRAP_CUMUL:<locationId>:<AAAA-MM>`               |
| `RECEIPT_REPEATED`       | A8-R2                                                                                                                                                                                                      | information | —                                                                        | `RECEIPT_REPEATED:<slipId>`                                                     |
| `RECEIPT_OVER_INVOICE`   | A8-R2                                                                                                                                                                                                      | attention   | montant de la facture                                                    | `RECEIPT_OVER_INVOICE:<slipId>`                                                 |
| `RECEIPT_UNVALUED`       | A8-R3                                                                                                                                                                                                      | information | —                                                                        | `RECEIPT_UNVALUED:<slipId>`                                                     |
| `CASH_MATERIAL_PURCHASE` | A9-R2 (`SINGLE` ou `MONTHLY_CUMUL`)                                                                                                                                                                        | attention   | `cashMaterialAlertAmount` (100 000)                                      | `CASH_MATERIAL_PURCHASE:<voucherId>` ; `CASH_MATERIAL_CUMUL:<siteId>:<AAAA-MM>` |

Un seuil vide désactive la nature. Les défauts sont des hypothèses à valider
avec les clients pilotes.

- **B7-R2. Naissance** dans la transaction de l'opération ; jamais d'exception
  pour cause d'alerte (même discipline que `src/lib/finance/cash.ts:369-379`).
  **Mécanique imposée** : toute naissance d'alerte passe par une seule fonction
  (`raiseStockAlertTx`, `src/lib/finance/stock-alertes.ts`) qui écrit par
  `INSERT … ON CONFLICT (tenant_id, dedupe_key) DO NOTHING` —
  `tx.stockAlert.createMany({ data: [alerte], skipDuplicates: true })`, qui
  produit exactement cette instruction en PostgreSQL. **Jamais** un `create`
  simple : en PostgreSQL une commande en échec condamne toute la transaction
  (en-tête « Lecture avant écriture » de `src/lib/finance/stock-inventaire.ts:76-82`),
  et un doublon (cumul déjà alerté ce mois-ci, rejeu) ferait échouer
  l'opération elle-même — la 4e pièce de caisse du mois ne se validerait plus.
  `raiseStockAlertTx` ne lit pas l'identifiant créé (ce que `createMany` ne
  rend pas) : la réponse de réception relit l'alerte par sa clé quand elle doit
  renvoyer `alertId`.
- **B7-R3. Contenu** : titre et message neutres (« Écart d'inventaire à justifier
  au-dessus du seuil », « Lignes d'inventaire écartées », « Inventaire
  abandonné », « Sortie importante », « Rebut important », « Facture déjà
  réceptionnée », « Valeur reçue supérieure à la facture », « Réception sans prix
  connu », « Achat de matériaux en espèces », « Inventaire validé par son
  compteur »), montant et seuil figés, liens vers l'objet. **Jamais de nom de
  personne dans le titre**, jamais de qualification de la cause. Le message est
  construit à la lecture, dans la langue de la requête, **sans aucun montant**
  pour un appelant sans `STOCK_VALUES_VIEW`.
- **B7-R4. Traitement** : une alerte se marque « traitée » avec une note
  facultative (`STOCK_ALERTS_VIEW`) ; elle ne se supprime pas.
- **B7-R5. File « À traiter »** : `DashboardTask.kind` reçoit `STOCK_ALERT`
  (`src/services/dashboard-service.ts:62-77`) pour un appelant qui détient
  `STOCK_ALERTS_VIEW` et `STOCK_VALUES_VIEW` dans une agence qui a
  `CONSTRUCTION` ; gravité `warning` ou `info` ;
  `href = /tenant/<tenantId>/finance/stock/controle?alerte=<alertId>` (route web
  de l'écran Contrôle, ecrans §10.4).
- **B7-R6. E-mail.** Clé `STOCK_ALERT_AGENCY` (activable par l'agence comme les
  autres, `EmailNotificationConfig`, `prisma/schema.prisma:3399`), classée
  `CONSTRUCTION` (`src/constants/notification-key-features.ts`). Variables du
  gabarit : `agencyName`, `alertsCount`, `alertsSummary` (une ligne par alerte :
  titre, lieu ou chantier, montant — **jamais de nom de personne**),
  `controlUrl`. Destinataires : membres `ACTIVE` de l'agence, `User.isActive`,
  détenant `STOCK_ALERTS_VIEW` **et** `STOCK_VALUES_VIEW` — lus en base, pas
  dans le cache (B1-R6). Tâche `src/jobs/stock-maintenance-job.ts`
  (`node-cron`, toutes les 10 minutes), coupée par
  `STOCK_ALERT_MAIL_JOB_ENABLED` (`src/config/env.ts`, `env.example`, faux par
  défaut, comme `PATRIMOINE_MONTHLY_REPORT_JOB_ENABLED`, `src/index.ts:69`) :
  1. **lecture transverse assumée** de la liste des agences ayant des alertes
     non envoyées (`emailSentAt IS NULL`), hors contexte d'agence — même parti
     pris, commenté, que `src/jobs/newsletter-campaign-scheduler.job.ts:19-29` ;
  2. puis **une agence à la fois** dans `runWithTenantContext`
     (`src/jobs/document-expiry-alert-job.ts:110`), pour que la garde Prisma
     (`src/utils/prisma-tenant-guard-extension.ts`) reste active ;
  3. **réclamation** des alertes de l'agence par une mise à jour
     conditionnelle : `UPDATE stock_alerts SET email_claimed_at = now() WHERE
tenant_id = $1 AND email_sent_at IS NULL AND (email_claimed_at IS NULL OR
email_claimed_at < now() - interval '30 minutes') RETURNING id` — deux
     instances ne réclament jamais la même alerte, et une instance tombée en
     cours d'envoi libère ses alertes au bout de 30 minutes ;
  4. **envoi** d'un récapitulatif par agence, puis `email_sent_at = now()`
     **après** le succès SMTP seulement (un échec laisse la réclamation
     expirer : l'alerte repart au passage suivant, envoi « au moins une fois »,
     doublon possible seulement si l'instance tombe entre l'envoi et
     l'écriture) ;
  5. une alerte d'agence **sans objet** — clé désactivée, `CONSTRUCTION` absent,
     aucun destinataire — reçoit `email_sent_at = now()` et
     `email_skipped_reason` (`DISABLED`, `NO_FEATURE`, `NO_RECIPIENT`) : elle
     n'est plus relue à chaque passage, et l'écran Contrôle reste sa source.
     La même tâche purge chaque nuit (3 h UTC) les clés d'idempotence de plus de
     30 jours (B3-R2).
- **B7-R7.** WhatsApp et SMS : hors périmètre de ce lot (D5, §2). L'inventaire par WhatsApp du lot 041 ajoute ses propres natures d'alerte.

**Critères d'acceptation**

1. Une sortie de 600 000 avec le seuil par défaut ouvre `LARGE_ISSUE` ; la même
   requête rejouée (`clientRequestId`) n'en ouvre pas une seconde.
2. Une alerte marquée traitée disparaît de la file « À traiter » et reste dans
   `GET /stock/alerts?status=ACKNOWLEDGED`.
3. Deux exécutions simultanées de la tâche d'envoi n'envoient qu'un e-mail par
   alerte ; un échec SMTP laisse `emailSentAt` nul et l'alerte repart après 30
   minutes.
4. Aucun texte d'alerte ne contient un mot interdit (§4) — vérifié par le test de
   vocabulaire.
5. Une alerte de cumul déjà levée ce mois-ci : une nouvelle opération qui
   l'atteindrait encore passe sans erreur (aucun `P2002`).
6. Une agence dont la clé `STOCK_ALERT_AGENCY` est désactivée : l'alerte reçoit
   `email_skipped_reason = DISABLED` au premier passage et n'est plus relue.

### B8 — Indicateurs

**Règles** (`GET /stock/indicators`, `STOCK_VALUES_VIEW`, par lieu et par mois,
plus un total ; période de 1 à 24 mois) :

| Indicateur                                          | Définition                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Taux d'écart                                        | Σ (écart brut valorisé des lignes ajustées + écart valorisé des lignes écartées) des inventaires validés du mois ÷ Σ valeur comptée de ces inventaires. Les surplus d'ouverture n'y entrent pas (A7-R2), les manques d'ouverture si. Valeurs **figées à la validation** (data-model §2.4). `null` sans inventaire. La part écartée est aussi rendue seule (`setAsideVarianceValue`). |
| Lignes non comptées                                 | Nombre de lignes non comptées (A2-R8) des inventaires validés du mois.                                                                                                                                                                                                                                                                                                               |
| Part des lignes comptées à l'aveugle                | Lignes avec `countedBlind = true` ÷ lignes comptées après le lot, des inventaires validés du mois (A2-R9).                                                                                                                                                                                                                                                                           |
| Part des sorties avec preneur identifié             | Sorties avec `takerId` ÷ sorties du mois.                                                                                                                                                                                                                                                                                                                                            |
| Part des inventaires validés par une autre personne | Inventaires validés à valeurs figées avec `selfValidated = false` ÷ inventaires validés à valeurs figées du mois (ceux d'avant le lot sont exclus).                                                                                                                                                                                                                                  |
| Rebuts du mois                                      | Valeur des rebuts du mois, et part de la valeur sortie du lieu (rebuts ÷ (sorties + rebuts + retours)) (A6-R6).                                                                                                                                                                                                                                                                      |
| Délai moyen de saisie                               | Moyenne de `entryLagDays` des réceptions, sorties, transferts (moitié sortante), rebuts et retours du mois ; plus la part saisie le jour même.                                                                                                                                                                                                                                       |

- **B8-R1.** Aucun indicateur par personne (D4, §10).
- **B8-R2.** Les inventaires validés avant la migration n'ont pas de valeurs
  figées : ils sont exclus du taux d'écart (et comptés dans un champ
  `countsWithoutFrozenValues` pour que l'écran le dise).
- **B8-R3. Isolation des agrégats.** Si les indicateurs passent par
  `$queryRaw` (agrégations par mois), la garde Prisma ne s'applique pas : chaque
  requête porte `tenant_id = $1` explicite (paramètre, jamais concaténé), et le
  bloc « Stock » de `__tests__/integration/isolation.test.ts` vérifie que les
  indicateurs d'une agence ignorent les mouvements et inventaires d'une autre.

**Critères d'acceptation**

1. Un lieu avec un inventaire validé (valeur comptée 1 000 000, écart brut
   30 000) en septembre : taux 0,03 pour septembre.
2. 10 sorties dont 7 avec preneur : part 0,7.
3. Un inventaire validé de valeur comptée 1 000 000, écart ajusté 30 000 et
   ligne écartée valant 20 000 : taux 0,05, `setAsideVarianceValue` 20 000.

## 8. Règles transverses

### 8.1 Masquage des valeurs (B1)

Sans `STOCK_VALUES_VIEW`, valent `null` : `unitCost`, `totalValue`, `valueAfter`,
`supplierCreditValue` (mouvements) ; `value`, `averageUnitCost` (soldes) ;
`varianceValue`, `countedValue`, `varianceValueGross`, `varianceValueNet`,
`setAsideVarianceValue`, `unitCostAtValidation` (inventaires) ; `amount`,
`unitPrice` (factures et lignes de facture) ; `receivedValue`, `returnedValue`
(réceptions d'une facture) ; `amount`, `threshold` (contrôles de réception,
alertes) ; `totalValue` (bons) ; `valuationSource` (une source de prix est une
information de valeur). Les messages construits (contrôles, alertes) ne citent
aucun montant. Les CSV omettent les colonnes, les PDF les montants. Chaque
réponse porte `meta.valuesVisible`.

### 8.2 Aveugle (A2)

Un lieu est « en comptage » s'il porte un inventaire `DRAFT`. Pour un appelant
**sans `STOCK_COUNT_VALIDATE`**, sur ce lieu, valent `null` — quelles que soient
ses autres permissions, `STOCK_VALUES_VIEW` comprise :

| Où                                                                                                                                              | Champs masqués                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Soldes (`GET /stock/balances`)                                                                                                                  | `quantity`, `value`, `averageUnitCost`                                                    |
| Mouvements du lieu (journal, export CSV, bons et PDF de bon, réponses de réception, sortie, transfert, rebut, retour, réceptions d'une facture) | `quantityAfter`, `valueAfter`, `unitCost` (et la colonne correspondante du CSV et du PDF) |
| Rapprochement du chantier dont c'est le lieu (`GET /finance/sites/{siteId}/stock/reconciliation`)                                               | `remainingQuantity`, `remainingValue` de chaque ligne et leurs totaux                     |
| Message `409 STOCK_INSUFFICIENT`                                                                                                                | aucune quantité citée                                                                     |

Le filtre `onlyInStock` ne s'applique pas aux lieux en comptage (il trahirait
qu'un solde est nul) : leurs lignes de solde sont toutes rendues, masquées.
`quantity` d'un mouvement (la quantité déplacée par ce mouvement) reste visible :
la reconstitution de l'attendu par la somme de l'historique est une limite
assumée (§3.3). Les routes d'inventaire appliquent A2-R2 à **tous**, détenteurs
de `STOCK_COUNT_VALIDATE` compris. `meta.blindLocationIds` liste les lieux
masqués pour l'appelant ; toute route qui renvoie un champ de cette table porte
`meta` (le rapprochement compris). Le masquage s'applique aussi au résultat
d'un rejeu idempotent (B3-R2).

### 8.3 Erreurs

Les erreurs métier sont levées en `AppError` avec un `code` stable et, si utile,
`data` (`src/middleware/error-middleware.ts:69-91`) — jamais par
`lib/errors.conflict(message, details)`, dont les `details` ne parviennent pas au
client (`:288-302`). Codes : voir l'annexe du contrat (`components.schemas.StockErrorCode`).
Une référence d'une autre agence lève `NotFoundError`, comme un objet inexistant.

### 8.4 Isolation

Tous les nouveaux modèles portent `tenantId` (catégorie « cloisonné » de
`__tests__/unit/schema-tenant-coverage.test.ts`) ; `StockCountLine` reste enfant
de `StockCount` (`:171`). Toutes les routes passent `requireTenantAccess` et
`__tests__/unit/routes-inventory.test.ts`. Le bloc « Stock » de
`__tests__/integration/isolation.test.ts` couvre : preneur, bon, PDF, pièce
jointe, alerte, inventaire, contexte terrain d'une autre agence → `404` ;
indicateurs et factures réceptionnables sans fuite (B8-R3).

### 8.5 Contrats de types

Les fichiers `src/lib/finance/types-lot5-*.ts` sont des « contrats gelés »
(`src/lib/finance/types-lot5-mouvements.ts:1-5`) : **ils ne bougent pas**. Les
formes nouvelles ou étendues de ce lot vivent dans un fichier neuf,
`src/lib/finance/types-040-controle.ts`, écrit à l'étape des fondations
(plan.md) : il **dérive** les types du lot 5 au lieu de les modifier — par
exemple `type MovementView = Omit<StockMovementRecord, 'unitCost' | 'totalValue'
| 'quantityAfter' | 'valueAfter'> & { unitCost: number | null; … }` (un
`extends` ne peut pas élargir `number` en `number | null`). Les services du
stock renvoient les types 040.

## 9. Cas limites

| Cas                                                                | Comportement                                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Article ressaisi par un second compteur                            | La ligne est remplacée, `expectedQuantity` et `expectedCapturedAt` refigés, auteur de la ligne = second compteur ; le premier reste compteur de l'inventaire (A1-R1) ; l'audit garde l'ancienne quantité.                                |
| Inventaire ouvert avant la migration                               | Reste `DRAFT`, devient aveugle, se clôt (lignes non comptées créées, A2-R8) puis se valide selon les nouvelles règles ; motifs libres conservés et valant justification (A4-R2) ; `movementsSinceCapture` nul pour ses anciennes lignes. |
| Clôture du comptage d'un lieu de 300 articles dont 290 non comptés | 290 lignes non comptées créées dans la transaction (insertion en lot) ; le validateur les écarte en une fois (`set-aside-uncounted`).                                                                                                    |
| Inventaire `COUNTED` laissé sans validation                        | Il bloque l'ouverture d'un nouvel inventaire sur le lieu (index unique) et, pour un lieu de chantier, la clôture (A7-R3) ; l'écran Inventaire le liste en tête.                                                                          |
| Lieu désactivé avec inventaire en cours                            | Refus existant à l'ouverture conservé ; la désactivation d'un lieu portant un inventaire `DRAFT`/`COUNTED` est refusée (`409 STOCK_COUNT_IN_PROGRESS`).                                                                                  |
| Bascule refaite                                                    | Refus existant (`src/lib/finance/stock-rapprochement.ts:221-226`).                                                                                                                                                                       |
| Chantier rouvert après clôture                                     | Les bloqueurs de stock s'appliqueront à la prochaine clôture.                                                                                                                                                                            |
| Coût moyen à zéro                                                  | Sortie, rebut et retour valent 0 au 311 ; le retour fournisseur porte alors toute sa valeur fournisseur (A6-R3 bis) au crédit du 603 contre le 401 ; sans valeur fournisseur non plus, aucune écriture (A6-R4).                          |
| Rôle Magasinier attribué ou retiré                                 | Effet au plus tard 5 minutes après, sur chaque instance (B1-R6).                                                                                                                                                                         |
| Réception sur facture annulée après coup                           | Rien ne change à la réception ; l'alerte `RECEIPT_OVER_INVOICE` se calcule sur les factures validées.                                                                                                                                    |
| Date au 31 décembre saisie le 2 janvier                            | Numéro de bon de l'année du document (comme `src/lib/finance/cash.ts:292-295`).                                                                                                                                                          |
| Preneur supprimé du référentiel employé                            | Le preneur garde son nom ; le lien vers l'employé reste (l'employé ne se supprime pas, il se désactive).                                                                                                                                 |
| Agence sans aucun détenteur de `STOCK_COUNT_VALIDATE`              | Aucun inventaire ne peut être validé ; l'écran le dit (droit manquant), comme aujourd'hui.                                                                                                                                               |
| Photo d'une personne déposée par erreur                            | Retrait (B5-R5).                                                                                                                                                                                                                         |
| Rejeu `clientRequestId` après 30 jours                             | Les clés de plus de 30 jours sont purgées chaque nuit (B7-R6) ; un rejeu tardif crée une nouvelle opération (documenté pour l'écran).                                                                                                    |

## 10. Données personnelles

- **Données traitées** : nom, équipe et téléphone facultatif des preneurs ; auteur
  et heure de chaque opération ; photos de marchandise et de bons.
- **Minimisation** : aucun champ d'identité au-delà du nom ; téléphone facultatif
  et effaçable ; EXIF retiré ; consigne d'écran « photographiez la marchandise et
  les bons, pas les personnes ».
- **Qui voit quoi** : le carnet des preneurs (nom, équipe) est visible de
  `STOCK_VIEW` ; le téléphone et la liste des employés et tâcherons à lier, de
  `STOCK_TAKERS_MANAGE` seulement (B2-R6) ; les trois filtres par personne du
  journal et les indicateurs sont réservés à `STOCK_VALUES_VIEW` ; aucun
  indicateur par personne n'est produit.
- **Durée de conservation** : celle des pièces comptables auxquelles les
  mouvements et bons se rattachent ; à confirmer avec l'expert-comptable de
  l'agence [à vérifier : durée OHADA applicable]. Les clés d'idempotence sont
  purgées après 30 jours.
- **Droits des personnes** : rectification par `PATCH /stock/takers/{id}` ;
  effacement du téléphone ; le nom reste attaché aux bons déjà émis (pièce).
- **Information préalable** : l'agence informe son personnel et les preneurs que
  les sorties sont enregistrées à leur nom ; texte d'information fourni par
  l'écran du carnet (agent des écrans). Cadre : loi ivoirienne sur la protection
  des données à caractère personnel et autorité de contrôle (ARTCI) [Ext, à faire
  valider].
- **Ce que le produit ne fait pas** (D4) : pas de retenue, pas de sanction, pas
  d'imputation d'un écart à une personne, pas de signalement anonyme, pas de
  géolocalisation.

## 11. Tests à écrire ou à modifier délibérément

| Fichier                                                                               | Changement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__tests__/unit/finance.stock-inventaire.test.ts:608-626`                             | **Inversé** : le transfert vers un chantier clos est refusé (A7-R4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `__tests__/unit/finance.stock-inventaire.test.ts:1117-1150` et suivants               | **Inversés** : l'ajustement applique l'écart (A3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `__tests__/unit/schema-tenant-coverage.test.ts`                                       | Aucun ajout attendu (nouveaux modèles cloisonnés) ; à faire tourner après le schéma.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `__tests__/unit/routes-inventory.test.ts`                                             | Aucune modification : toutes les routes portent `requireTenantAccess` ; doit rester vert.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `__tests__/unit/audit-catalog.test.ts`                                                | **Modifié** : les clés `STOCK_*` s'ajoutent à `postMigrationKeys` (`:74`, B6-R4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `__tests__/unit/ai.catalog.test.ts`                                                   | Vert après `npm run ai:catalog` (dans `packages/api`) : le catalogue `src/lib/ai/gateway/catalog.generated.json` porte les routes et leurs permissions, il change avec les gardes `STOCK_*` et les routes nouvelles. Aucune route du stock n'est exclue de l'assistant ; les écritures `scraps`, `supplier-returns`, `set-aside`, `set-aside-uncounted`, `cancel`, `remove` doivent sortir **sensibles** (`src/lib/ai/gateway/path-rules.ts`) — sinon y ajouter les mots `scrap`, `return`, `aside`, `remove` (catégorie `lifecycle`) avec leur test. |
| `__tests__/unit/i18n-catalogs-completeness.test.ts`                                   | Vert après extraction et traduction en/ar des messages d'API, titres d'alerte, textes de PDF et d'e-mail (`src/i18n/locales/{en,ar}.json`), communs avec le volet meublés.                                                                                                                                                                                                                                                                                                                                                                            |
| `__tests__/unit/tenant-data-export.registry.test.ts`                                  | `StockClientRequest` exclu avec sa raison ; les autres modèles du lot exportés (B5-R9).                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Test d'archive de l'export (`file-references`)                                        | Une pièce jointe sous `uploads/stock/<tenantId>/…` entre dans l'archive (B5-R9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `__tests__/unit/stock-vocabulaire.test.ts` (nouveau)                                  | Parcourt les littéraux de chaîne des fichiers du stock (lib, contrôleurs, PDF, gabarits d'e-mail) et les catalogues de traduction : aucun mot interdit (§4), à frontière de mot, **en trois langues** : `\bvols?\b`, `\bvoleurs?\b`, `\bfraud`, `\bd[ée]tourn`, `\btheft\b`, `\bstolen\b`, `\bsteal`, `\bembezzl`, `سرق`, `احتيال`, `اختلاس`.                                                                                                                                                                                                         |
| `__tests__/integration/stock-concurrence.test.ts` (nouveau, base `DATABASE_URL_TEST`) | A10 ; course clôture / transfert entrant (A7, critère 9) ; alerte de cumul concurrente sans `P2002` (B7, critère 5).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `__tests__/integration/isolation.test.ts`                                             | Bloc « Stock » (§8.4), indicateurs compris (B8-R3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `apps/web/src/__tests__/finance/stock-chantier.test.tsx:481-486`                      | **Inchangé** (doctrine « montré, pas jugé »).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Les catalogues web `apps/web/src/i18n/locales/{en,ar}/finance.json` contiennent
aujourd'hui « theft » et « سرقة » (`finance.json:674`, `:1471`) : ces entrées
disparaissent avec leurs textes français (ecrans §13), le test de vocabulaire
web (ecrans §11.1) les attrape sinon.

## 12. Fichiers touchés

Le découpage exhaustif, par territoires d'agents, est dans [plan.md](plan.md).
Points de repère :

- Schéma et migrations : `prisma/schema.prisma`, trois migrations (data-model
  §5), `prisma/seeds/stock-permissions-seed.ts` (nouveau),
  `prisma/seeds/rbac-seed.ts` (appel après `seedFinancePermissions`, `:127`).
- Contrats : `src/lib/finance/types-040-controle.ts` (nouveau, §8.5), codes
  d'erreur dans `src/middleware/error-middleware.ts` (`ErrorCode`, `:45`), clés
  d'audit dans `src/types/audit-types.ts` et `src/types/audit-catalog.ts`.
- Domaine : `src/lib/finance/stock-mouvements.ts`, `stock-inventaire.ts`,
  `stock-referentiel.ts`, `stock-rapprochement.ts`, `site-closing.ts`, `cash.ts`,
  `accounting.ts` (deux natures de pièce), nouveaux `stock-controles.ts`
  (verrous, dates, idempotence, masquage), `stock-journal.ts` (journal paginé et
  CSV, extrait de `stock-mouvements.ts`), `stock-transferts.ts` (transfert,
  extrait de `stock-inventaire.ts`), `stock-terrain.ts` (contexte terrain,
  factures réceptionnables, réceptions d'une facture), `stock-preneurs.ts`,
  `stock-bons.ts` (naissance et numérotation) et `stock-bons-pdf.ts` (PDF),
  `stock-pieces-jointes.ts`, `stock-alertes.ts` (naissance) et
  `stock-alertes-lecture.ts` (lecture, messages, e-mail), `stock-indicateurs.ts`,
  `stock-reglages.ts` (réglages de contrôle), schémas Zod correspondants.
- Routes et contrôleurs : les quatre routeurs `finance-stock-*` du lot 5
  repassés sur `STOCK_*`, et quatre routeurs nouveaux —
  `finance-stock-transferts-routes.ts`, `finance-stock-journal-routes.ts`
  (journal, export, auteurs, contexte terrain, factures, preneurs),
  `finance-stock-preuves-routes.ts` (bons, PDF, pièces jointes),
  `finance-stock-pilotage-routes.ts` (alertes, indicateurs, réglages de
  contrôle) —, `src/middleware/stock-rbac-middleware.ts` (nouveau), montage
  dans **`src/app.ts`** (`:275-278`, à côté des routeurs du lot 5).
- Transverse : `src/services/dashboard-service.ts`,
  `src/constants/email-notification-keys.ts`,
  `email-notification-default-templates.ts`, `notification-key-features.ts`,
  `src/services/invitation-service.ts`, `src/jobs/stock-maintenance-job.ts`
  (nouveau) et son démarrage dans `src/index.ts`, `src/config/env.ts` et
  `env.example` (`STOCK_ALERT_MAIL_JOB_ENABLED`),
  `src/services/tenant-data-export/file-references.ts` et `model-registry.ts`,
  catalogue de l'assistant (`src/lib/ai/gateway/catalog.generated.json`,
  `path-rules.ts`), catalogues `src/i18n/locales/{en,ar}.json`.
- Web (ecrans.md) : services et types du stock, importeur
  `apps/web/src/lib/importation/natures.ts` (réception et sortie changent de
  réponse), libellés de permissions, de rôle et d'audit.
- Documentation : wiki des fonctionnalités et `npm run wiki:export` (AGENTS.md) ;
  `docs/workflows/DEPLOIEMENT.md` (retour arrière, data-model §5.3 ; variable
  `STOCK_ALERT_MAIL_JOB_ENABLED`).

## 13. Questions ouvertes

1. Seuils par défaut (§7, B7-R1) : à valider avec les clients pilotes.
2. Borne d'antériorité par défaut (7 jours) : suffisante pour un chantier sans
   réseau pendant une semaine ?
3. _(Tranchée en révision 2, B1-R2 bis : le comptable garde `STOCK_COUNT`.)_
4. Réception sur simple bon de livraison avant facture (§3.3) : besoin terrain
   probable, hors de ce lot.
5. Fenêtre de l'inventaire d'ouverture (30 jours après la bascule, A7-R1) : à
   confirmer avec les clients pilotes.
6. Invalidation du cache des permissions à l'attribution d'un rôle (B1-R6) :
   chantier transverse à ouvrir hors de ce lot.
