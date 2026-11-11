# Contrat du lot Q — Comptes de réception de l'agence

**Spec** : [spec.md](./spec.md) (US0, FR-080 à FR-088) · **Plan** : [plan.md](./plan.md) (lot Q) ·
**Tâches** : [tasks.md](./tasks.md) (TQ03 à TQ13, périmètre v1 ci-dessous). `API/` =
`packages/api/src`, `WEB/` = `apps/web/src`.

Ce contrat fixe les formes d'échange pour que l'API et le web se développent en parallèle. En cas
de désaccord avec le code existant, suivre les conventions du dépôt (enveloppe de réponse, erreurs
typées, `asyncHandler`, `t()`) et le signaler.

## 0. Périmètre de la v1 (TQ03 tranchée)

- **Un modèle commun nouveau**, `ReceivingAccount`, pour l'agence (loyers) **et** pour la copropriété.
  `SyndicReceivingNumber` (spec 047) n'est **pas modifié** : les numéros de réception mobile money et
  leurs déclarations continuent comme aujourd'hui.
- **Dans la v1** : gestion (agence et copropriété), affichage au locataire et au copropriétaire, image
  du QR servie par route authentifiée, audit et e-mail aux administrateurs, bouton qui renvoie vers le
  circuit de **déclaration existant**.
- **Hors v1** (ne pas faire) : clé étrangère vers les déclarations, sous-compte comptable (TQ02),
  mention dans les PDF (TQ12), lecture automatique du QR, génération de QR, catalogues i18n et
  classeur des fonctionnalités (lot final), PI-SPI par API.
- ImmoTopia **ne génère ni ne modifie** aucun QR ; le montant n'est jamais prérempli.

## 1. Données

Modèle Prisma `ReceivingAccount` (table `receiving_accounts`), migration additive (SQL écrit à la
main selon la convention des migrations du dépôt ; **aucune** migration appliquée à une base) :

| Champ                    | Type                                                 | Règle                                                                                                       |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid                                                 | clé                                                                                                         |
| `tenantId`               | string                                               | obligatoire, relation `Tenant` (cascade)                                                                    |
| `scope`                  | enum `ReceivingAccountScope` (`AGENCY`, `SYNDICATE`) | obligatoire                                                                                                 |
| `syndicateId`            | uuid?                                                | obligatoire si `SYNDICATE`, nul si `AGENCY` ; relation `Syndicate` (cascade)                                |
| `institution`            | string 1 à 60                                        | « Wave », « Orange Money », « Banque X »…                                                                   |
| `scannableWith`          | string? ≤ 80                                         | « Toutes les applications PI-SPI », « Application Wave »…                                                   |
| `alias`                  | string? ≤ 80                                         | UUID v4 validé s'il en a la forme (36 caractères avec tirets), sinon texte libre sans caractère de contrôle |
| `holderName`             | string 2 à 80                                        | nom du titulaire attendu, obligatoire                                                                       |
| `instructions`           | string? ≤ 500                                        | texte libre                                                                                                 |
| `qrFileUrl`              | string?                                              | identifiant de stockage `/uploads/receiving-accounts/<tenantId>/<fichier>` ; **jamais renvoyé par l'API**   |
| `qrMimeType`             | string?                                              | `image/png`, `image/jpeg` ou `image/webp`                                                                   |
| `qrSha256`               | string?                                              | empreinte du fichier nettoyé                                                                                |
| `isActive`               | bool                                                 | défaut `true`                                                                                               |
| `sortOrder`              | int                                                  | défaut 0                                                                                                    |
| `createdAt`, `updatedAt` | dates                                                |                                                                                                             |

Règles : un compte **actif** doit avoir au moins un alias ou un QR ; 10 comptes au plus par agence
et par copropriété ; index `(tenantId, scope, syndicateId)` ; **tenant couvert** par
`__tests__/unit/schema-tenant-coverage.test.ts`.

Image : PNG, JPEG ou WebP, 2 Mo au plus, type vérifié sur le contenu (pas sur l'extension ni le
`Content-Type`), métadonnées retirées avant stockage (réutiliser les fonctions de
`lib/finance/stock-pieces-jointes.ts` : `detectStockFileKind`, `stripImageMetadata`, `sha256Hex`).
Stockage privé : jamais servi en statique ; lecture par `lib/files/private-files.ts`
(`privateUploadPath`, `readPrivateUpload`, `sendPrivateFile`).

## 2. DTO

Lecture portails (`ReceivingAccountPublic`) :

```json
{
  "id": "uuid",
  "institution": "Wave",
  "scannableWith": "Application Wave",
  "alias": "341c3e1b-…",
  "holderName": "Agence Soleil",
  "instructions": null,
  "hasQr": true,
  "qrPath": "/api/portal/tenant/receiving-accounts/<id>/qr"
}
```

Gestion (`ReceivingAccountAdmin`) : les mêmes champs plus `isActive`, `sortOrder`, `updatedAt`, et
`qrPath` pointant la route de gestion. **Jamais** `qrFileUrl`, `qrSha256` ni un chemin disque
(garde-fou `__tests__/api/portal-no-disk-paths.test.ts`).

## 3. Routes (toutes avec garde tenant ou portail, `routes-inventory`)

**Agence** (`routes/agency-settings-routes.ts`, `authenticate` + `requireTenantAccess`) :

| Verbe et chemin                                                    | Droit                  | Rôle                                                                     |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------ |
| `GET /tenants/:tenantId/settings/receiving-accounts`               | `TENANT_SETTINGS_VIEW` | liste (portée `AGENCY`)                                                  |
| `POST /tenants/:tenantId/settings/receiving-accounts`              | `TENANT_SETTINGS_EDIT` | création, `multipart/form-data` (champs texte + fichier `qr` facultatif) |
| `PUT /tenants/:tenantId/settings/receiving-accounts/:accountId`    | `TENANT_SETTINGS_EDIT` | modification, mêmes champs + `removeQr` (booléen)                        |
| `DELETE /tenants/:tenantId/settings/receiving-accounts/:accountId` | `TENANT_SETTINGS_EDIT` | suppression (ligne et fichier), l'audit garde l'historique               |
| `GET /tenants/:tenantId/settings/receiving-accounts/:accountId/qr` | `TENANT_SETTINGS_VIEW` | image                                                                    |

**Copropriété** (routeur syndic existant des numéros de réception : réutiliser **la même garde** que les
`receiving-numbers` ; base `/tenants/:tenantId/syndics/:syndicId/`) : mêmes verbes sous
`receiving-accounts`, portée `SYNDICATE`, `syndicId` vérifié par `assertSyndicateOfTenant`.

**Portail locataire** (`routes/tenant-portal-routes.ts`, monté sur `/api/portal/tenant`) :
`GET /receiving-accounts` (comptes **actifs** de l'agence du locataire, `ReceivingAccountPublic[]`),
`GET /receiving-accounts/:accountId/qr`.

**Portail copropriétaire** (`routes/coowner-portal-routes.ts`, monté sur `/api/portal/copropriete`) :
`GET /receiving-accounts` (comptes actifs de la copropriété dans le périmètre du copropriétaire, suivre
le modèle de la lecture des numéros de réception), `GET /receiving-accounts/:accountId/qr`.

Toute lecture vérifie l'appartenance du compte à l'agence (et à la copropriété pour la portée
`SYNDICATE`) ; un compte d'une autre agence ou inactif renvoie le même `NotFoundError` qu'un compte
inexistant. Limiteur de débit raisonnable sur les routes d'image.

## 4. Audit et notification

- Nouvelles clés d'audit : `RECEIVING_ACCOUNT_CREATED`, `RECEIVING_ACCOUNT_UPDATED`,
  `RECEIVING_ACCOUNT_DELETED`. Payload : établissement, ancien et nouvel alias, `hasQr` avant et
  après, `sortOrder`, `isActive` ; **jamais** l'image.
- E-mail à chaque création, modification de l'alias ou du QR, désactivation ou suppression, adressé
  aux administrateurs actifs de l'agence (suivre `lib/syndics/declared-payment/notifications.ts`
  `notifyReceivingNumberChanged` pour le mécanisme). Envoi **après** le commit. Une panne d'e-mail
  n'annule jamais l'opération.

## 5. Web

- **Réglages de l'agence** : carte « Comptes de réception » dans `pages/tenant/AgencyFinanceSettings.tsx`
  (liste, ajout, modification, ordre, activation, suppression, aperçu du QR). **Copropriété** : carte
  voisine de `components/syndics/declared-payment/ReceivingNumbersCard.tsx`.
- **Composant commun** `components/payment/PaymentAccountsCard.tsx` : par compte, établissement, « scannable
  avec », QR agrandissable (image chargée par la route authentifiée avec `utils/api-client`), alias avec
  bouton « copier », nom attendu du bénéficiaire, instructions ; étapes « Comment payer » (ouvrir son
  application, choisir scanner ou saisir l'alias, **saisir soi-même le montant**, vérifier le nom
  affiché, payer) ; avertissements (paiement irrévocable, ne pas payer si le nom diffère, prévenir
  l'agence) ; **motif suggéré** à copier, composé côté web avec les données déjà chargées (ex. « Loyer
  janvier — Appartement 3 ») ; bouton « J'ai payé : déclarer mon paiement » qui ouvre ou fait défiler
  vers le formulaire de déclaration existant.
- **Intégration** : portail locataire (`pages/TenantPortal/Payments.tsx`) et portail copropriétaire
  (`pages/CoOwnerPortal/ChargeCalls.tsx`). La carte n'apparaît pas s'il n'y a aucun compte actif.
- Libellés : « Payer l'agence », « Coordonnées de paiement » ; **jamais** « paiement en ligne ».
- Règles du dépôt : `t()` avec le texte français comme clé, propriétés logiques (`ms-*`, `me-*`), pages
  en `React.lazy`, réseau par `utils/api-client`, jamais `dangerouslySetInnerHTML`.
- Services : `services/receiving-account-service.ts` (gestion) et extensions de
  `services/coowner-portal-service.ts` et du service du portail locataire (lecture).

## 6. Tests exigés

- **API** : validation d'alias et d'image (type faux, trop lourde, SVG refusé) ; isolation entre deux
  agences et entre deux copropriétés (lecture, modification, image) ; compte inactif invisible aux
  portails ; image jamais servie sans authentification ; changement journalisé et notifié ; limite de 10
  comptes ; droits `VIEW`/`EDIT` ; `routes-inventory` et `schema-tenant-coverage` ;
  `portal-no-disk-paths`.
- **Web** : affichage, absence de compte (carte masquée), plusieurs comptes, copie de l'alias, motif
  suggéré, formulaire de gestion (ajout, erreurs), rendu en arabe.
