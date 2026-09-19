# Lot 4, sous-lot 1 — Baux de terrain · Modèle et contrat

> Périmètre : `docs/finance/PLAN-mise-en-oeuvre.md` §8, PRD épique E7, besoin B10.
> Contrat gelé : `packages/api/src/lib/finance/types-lot4.ts` et
> `apps/web/src/types/finance-lot4-types.ts`.
> Migration : `20260919200000_add_land_leases`, appliquée.
> 19 septembre 2026.

---

## 1. Pourquoi ce sous-lot ouvre le lot 4, seul

C'est le **seul « must »** du lot 4 dans le PRD. Les associations, les salaires, les tâcherons, la retenue de garantie et la clôture sont tous en priorité inférieure. Le plan dit par ailleurs que ces sous-lots sont indépendants et peuvent être livrés séparément.

S'y ajoute une raison de méthode. Trois lots de suite, les défauts les plus coûteux sont venus de contrats que j'ai gelés seuls et que personne n'a relus : quatre au lot 1, trois au lot 2, cinq au lot 3. Un contrat plus court est un contrat que je rate moins.

---

## 2. Le besoin

L'entreprise loue des terrains pour y bâtir. Elle paie le bailleur **une fois par an, d'avance**, et consomme cette avance mois après mois.

Sans mécanisme dédié, un chantier sur terrain loué porte soit la totalité du loyer le mois du paiement — et son coût devient illisible — soit rien du tout. C'est précisément ce que le PRD demande d'éviter.

### Le cycle, en trois temps

1. **Le bail est enregistré**, et ouvre le compte de tiers du bailleur.
2. **Le paiement annuel est saisi puis validé.** L'avance est versée, et le compte du bailleur devient débiteur de ce qu'il nous doit encore en jouissance du terrain.
3. **Chaque mois, un douzième est constaté.** La charge naît, le compte du bailleur remonte d'autant, et il atteint zéro au douzième mois.

### Les deux vues

| Vue               | Ce qu'elle porte                                            |
| ----------------- | ----------------------------------------------------------- |
| Compte de tiers   | Combien ai-je payé d'avance, combien reste-t-il à consommer |
| Journal comptable | Paiement au 486, consommation mensuelle virée au 613        |

Elles ne se contredisent jamais parce qu'elles naissent de la même pièce, dans la même transaction. C'est la discipline des lots 1 et 2.

---

## 3. Trois choses que le PRD ne dit pas, tranchées ici

### 3.1 Le prorata, au prorata de quoi

Le PRD dit que la charge « s'impute aux chantiers rattachés au prorata », sans dire au prorata de quoi. Un chantier ne porte ni surface ni durée exploitable : il n'existe aucune grandeur sur laquelle proratiser.

**La charge est répartie à parts égales entre les chantiers actifs du bail.** Le reliquat de l'arrondi va au premier d'entre eux, par ordre de création, sans quoi la somme des imputations ne vaudrait pas la charge et le coût réel des chantiers s'écarterait du grand livre.

Quand un bail n'a **aucun** chantier actif, la charge est constatée en comptabilité sans imputation analytique. Elle a bien eu lieu ; elle n'est simplement imputable à rien.

### 3.2 Le douzième, et son reliquat

Onze mois à `arrondi(annuel / 12)`, puis un dernier à `annuel − 11 × arrondi(annuel / 12)`.

Sans cela, douze douzièmes ne feraient pas un an, et le compte du bailleur n'atteindrait pas zéro — ce que le PRD exige explicitement.

Le mois se compte **à partir de la date de début du bail**, pas de janvier : un bail qui commence en mars a son douzième mois en février suivant.

### 3.3 Une constatation n'a pas de brouillon

Personne ne saisit une constatation mensuelle, et il n'y aurait personne pour la valider : elle est posée par un travail programmé. Elle naît validée, avec son écriture, dans une seule transaction.

Le principe P-2 tient — la pièce précède l'écriture — seul le cycle brouillon/validé ne s'applique pas. Le paiement annuel, lui, est saisi par une personne : il a un brouillon, comme toute pièce depuis le lot 2.

---

## 4. Les trois modèles

| Modèle             | Rôle                                       | Idempotence                  |
| ------------------ | ------------------------------------------ | ---------------------------- |
| `LandLease`        | Le bail, et le compte de tiers du bailleur |                              |
| `LandLeasePayment` | Le paiement annuel, brouillon puis validé  |                              |
| `LandLeaseAccrual` | La constatation mensuelle                  | Unique `(bail, année, mois)` |

`ConstructionSite.landLeaseId` existait depuis le lot 2 en colonne libre, sans modèle ni clé étrangère : une amorce posée en prévision. Elle en a une désormais.

Deux comptes rejoignent le plan opérationnel : `486 — Charges constatées d'avance` et `613 — Locations`. Un loyer payé d'avance n'est pas une charge le jour où on le paie, c'est une créance de jouissance qui se consomme.

---

## 5. Les points d'entrée

Neuf routes, sous `/tenants/{tenantId}/finance`. **Aucune permission neuve.**

| Méthode | Chemin                                     | Permission           | Rend                 |
| ------- | ------------------------------------------ | -------------------- | -------------------- |
| GET     | `land-leases`                              | `accounts.read`      | `LandLease[]`        |
| POST    | `land-leases`                              | `sites.manage`       | `LandLease`          |
| GET     | `land-leases/{landLeaseId}`                | `accounts.read`      | `LandLease`          |
| PUT     | `sites/{siteId}/land-lease`                | `sites.manage`       | `LandLease` ou null  |
| GET     | `land-leases/{landLeaseId}/payments`       | `accounts.read`      | `LandLeasePayment[]` |
| POST    | `land-leases/{landLeaseId}/payments`       | `documents.create`   | `LandLeasePayment`   |
| POST    | `land-lease-payments/{paymentId}/validate` | `documents.validate` | `LandLeasePayment`   |
| GET     | `land-leases/{landLeaseId}/accruals`       | `accounts.read`      | `LandLeaseAccrual[]` |
| POST    | `land-leases/{landLeaseId}/accruals`       | `documents.validate` | `LandLeaseAccrual`   |

Le rattachement d'un chantier prend `{ "landLeaseId": "<uuid>" | null }` : passer `null` détache.

La dernière route permet de constater un mois à la main, quand le travail programmé n'a pas tourné. Elle est idempotente comme lui.

**Les gardes se posent avec leur chemin**, jamais en `router.use(authenticate)` nu — le défaut corrigé au lot 2, qui rendait le sélecteur de commune muet.

---

## 6. Le travail programmé

Le 1er de chaque mois, sur le modèle de `penalty-calculation-job.ts`.

Il traite **chaque bail dans sa propre transaction** : un bail mal configuré ne doit pas empêcher les autres d'être constatés. Le compte rendu dit ce qui a été constaté, ce qui l'était déjà, et ce qui a échoué avec la raison.

Il est rejouable sans rien doubler, garanti par l'unicité `(bail, année, mois)` en base et par une lecture préalable dans le service — parce qu'en PostgreSQL une commande en échec condamne toute la transaction, et que « tenter puis rattraper » ne marche pas.

---

## 7. Critères de sortie

1. Sur une vraie base, douze constatations successives ramènent le solde du compte du bailleur **exactement à zéro**.
2. Rejouer une constatation déjà faite ne crée rien et ne bouge aucun solde.
3. La somme des imputations d'une constatation égale son montant, y compris quand le nombre de chantiers ne divise pas le douzième.
4. Un bail sans chantier actif se constate quand même, sans imputation.
5. Aucun écran ne prononce « débit » ni « crédit ».

Vérifiés par `scripts/finance-e2e-lot4.ts`, sur le modèle des lots 2 et 3 : tenant jetable, fonctions de production appelées telles quelles, nettoyage systématique.
