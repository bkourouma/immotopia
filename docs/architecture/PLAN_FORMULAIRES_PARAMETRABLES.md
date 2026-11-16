# Plan — formulaires paramétrables (visibilité et caractère obligatoire des champs)

Date : 2026-11-16 · Statut : proposition, rien n'est implémenté.
Déclencheur : un client syndic souhaite que la « Référence de transaction » du
paiement déclaré (spec 047) soit facultative, voire masquée.

## 00. Décision de gouvernance (Baba, 2026-11-16) — prime sur la suite du document

| Classement du classeur          | Qui peut régler                                                                                          | Comportement                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Jamais facultatif (656 champs)  | personne                                                                                                 | ignoré par le moteur, le champ reste tel qu'aujourd'hui |
| Facultatif sous condition (270) | le **super-admin** déverrouille le champ pour une agence ; ensuite l'administrateur de l'agence le règle | sans déverrouillage, comportement actuel                |
| Paramétrable (237)              | l'**administrateur de l'agence**, directement                                                            | sans réglage, comportement actuel                       |

Conséquences de conception (remplacent §3.3 et les hypothèses H1, H2, H4, H5) :

- **Niveau : l'agence (tenant).** Pas de surcharge par copropriété dans le
  moteur. Le réglage métier existant `SyndicDeclaredPaymentSettings.proofRequired`
  reste où il est ; la capture du paiement déclaré est exclue du moteur pour
  ne pas avoir deux sources.
- **Registre** (§3.2) : chaque champ réglable porte sa classe `GATED` (sous
  condition) ou `OPEN` (paramétrable), son mode par défaut (= comportement
  actuel), ses modes permis (`masquable` = non → pas de `HIDDEN`) et le texte
  « ce qui casse » affiché au super-admin et à l'agence. Les champs « jamais
  facultatif » n'y figurent pas. Le registre est généré depuis le classeur.
- **Stockage**, deux tables multi-tenant :
  - `TenantFormFieldSetting (tenantId, formKey, fieldKey, mode, updatedById)` —
    écrit par l'administrateur de l'agence ;
  - `TenantFormFieldUnlock (tenantId, formKey, fieldKey, unlockedById, reason, createdAt)` —
    écrit par le super-admin seul, journal d'audit plateforme.
- **Résolution** côté serveur : champ absent du registre → comportement
  actuel ; `GATED` sans déverrouillage → mode par défaut, quel que soit le
  réglage enregistré ; sinon réglage de l'agence, à défaut mode par défaut.
  Re-verrouiller un champ fait revenir l'agence au défaut sans effacer son
  réglage (il reprend effet si on déverrouille à nouveau).
- **Écrans** :
  - super-admin, fiche d'une agence, onglet « Formulaires » : les champs
    `GATED`, regroupés par module puis formulaire, interrupteur « Autoriser
    le réglage » + motif, avec « ce qui casse » ;
  - agence, Paramètres > « Formulaires » : les champs `OPEN` et les `GATED`
    déverrouillés, choix Obligatoire / Facultatif / Masqué ; les `GATED`
    verrouillés apparaissent grisés avec « Réglage soumis à ImmoTopia ».
- **API** : un helper unique applique les modes à chaque corps reçu
  (`REQUIRED` absent → 400 `FIELD_REQUIRED`, `HIDDEN` → valeur ignorée et non
  stockée) ; 23 colonnes non nullables et 30 validations d'API sont à assouplir
  pour les champs réglables (le reste est déjà facultatif côté API).
- Ampleur : 507 champs réglables, répartis sur 150 formulaires.

### Découpage révisé (remplace §4)

| Lot                                                           | Contenu                                                                                                                                                                                                                                                                        | Dépend de | Parallèle |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------- |
| 0 — Moteur                                                    | 2 tables + **une seule migration** (dont les 23 colonnes rendues nullables), registre généré depuis le classeur, résolution, helper API, routes agence / portails / super-admin, hook web `useFormFieldModes`, tests (`routes-inventory`, `schema-tenant-coverage`, isolation) | —         | non       |
| 1 — Écrans de réglage                                         | onglet super-admin « Formulaires » de la fiche agence ; Paramètres > « Formulaires » de l'agence                                                                                                                                                                               | 0         | avec 2–6  |
| 2 — Syndic (cas Haiku, prioritaire)                           | 57 formulaires + portail copropriétaire ; anti-doublon du paiement déclaré sans référence                                                                                                                                                                                      | 0         | oui       |
| 3 — Gestion locative et portails                              | 23 formulaires                                                                                                                                                                                                                                                                 | 0         | oui       |
| 4 — Finance                                                   | 61 formulaires                                                                                                                                                                                                                                                                 | 0         | oui       |
| 5 — Patrimoine, assurance, maintenance                        | 35 formulaires                                                                                                                                                                                                                                                                 | 0         | oui       |
| 6 — Biens, CRM, ventes, newsletter, signature, administration | 19 formulaires                                                                                                                                                                                                                                                                 | 0         | oui       |
| 7 — Finitions                                                 | i18n fr/en/ar, classeur des fonctionnalités + `wiki:export`, `code-reviewer` + `security-auditor`, recette navigateur sur la démo                                                                                                                                              | 1–6       | non       |

Les lots 2 à 6 ne touchent que les fichiers de leur module (écran + routes et
services API correspondants) ; aucune migration hors lot 0 ; catalogues de
traduction et classeur uniquement au lot 7.

## 0. Portée élargie (2026-11-16, demande de Baba)

Le moteur couvre **tous les formulaires de saisie**, pas seulement la référence
de transaction ni le seul paiement déclaré. Inventaire complet et proposition
de classement champ par champ :
[FORMULAIRES_PARAMETRABLES_INVENTAIRE.xlsx](FORMULAIRES_PARAMETRABLES_INVENTAIRE.xlsx)
— 273 formulaires (228 de saisie, 39 réglages, 6 d'authentification),
1163 champs : 656 « jamais facultatif », 270 « facultatif sous condition »,
237 « paramétrable ». Réglages et authentification restent hors moteur.

Règle retenue pour « jamais facultatif » : la case de réglage n'existe pas ;
le champ garde son comportement actuel. 129 champs proposés « jamais
facultatif » sont pourtant facultatifs aujourd'hui côté API : les rendre
obligatoires est une décision distincte (colonne « Écart avec aujourd'hui »).

Conséquence sur le découpage (§4) : le registre §3.2 reçoit une entrée par
formulaire de saisie, alimentée par le classeur une fois annoté ; le
branchement se fait module par module (Syndic, Gestion locative, Finance,
Patrimoine/Assurance/Maintenance, Biens/CRM/Ventes/Newsletter), un lot par
module après le lot 0. Les sections 3.5 et 4 ci-dessous restent le premier
module branché (paiement déclaré).

## 1. Constat dans le code

| Élément                                                     | Où                                                                                                                                           | Ce qu'il impose aujourd'hui                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Formulaire gestionnaire « Déclarer pour un copropriétaire » | `apps/web/src/components/syndics/declared-payment/DeclareForThirdPartyModal.tsx:509`                                                         | référence `required` + motif 4–40 caractères |
| Formulaire du portail copropriétaire                        | `apps/web/src/components/coowner-portal/declared-payment/DeclarationForm.tsx`                                                                | même règle                                   |
| Validation de forme API                                     | `packages/api/src/lib/syndics/declared-payment/request-schemas.ts` (`transactionReference: z.string().min(1)`)                               | champ obligatoire                            |
| Règle métier API                                            | `declaration-create.ts:118` (`INVALID_TRANSACTION_REFERENCE`)                                                                                | refus si absente ou mal formée               |
| Base                                                        | `SyndicPaymentDeclaration.transactionReference String` (NOT NULL)                                                                            | colonne obligatoire                          |
| Anti-doublon                                                | index unique partiel `syndic_payment_declarations_ref_active_uq` (agence, numéro de réception, référence) + `DECLARATION_REFERENCE_USED`     | repose sur la référence                      |
| Alertes de revue                                            | `declaration-alerts.ts` : `REFERENCE_ON_EXISTING_PAYMENT`, doublon probable (`matchProbableDuplicates` exige des références **différentes**) | repose sur la référence                      |
| Validation                                                  | `declaration-review.ts:430` → `recordLotPaymentTx({ reference })`                                                                            | propage la référence à l'encaissement        |
| Pré-remplissage IA                                          | `vision/*`, `PREFILL_FIELDS`                                                                                                                 | lit la référence sur la capture              |

**Précédent utile :** `SyndicDeclaredPaymentSettings.proofRequired` (D14) rend
déjà la capture obligatoire ou facultative, par copropriété, depuis la carte
`DeclaredSettingsCard.tsx`, appliqué côté front ET côté API
(`DECLARATION_PROOF_REQUIRED`). Le besoin est le même mécanisme, généralisé.

## 2. Réponse courte

Oui, c'est faisable, et proprement, à condition de respecter trois règles :

1. **Le serveur fait foi.** Le réglage est relu par l'API à chaque
   déclaration ; masquer un champ côté écran sans l'appliquer à l'API laisserait
   le contournement ouvert (et l'inverse bloquerait l'écran).
2. **Tous les champs ne sont pas paramétrables.** Une liste blanche, déclarée
   dans le code, dit pour chaque formulaire quels champs peuvent changer de
   mode et lesquels sont verrouillés (montant, lots, numéro de réception, date :
   sans eux, la déclaration n'a pas de sens).
3. **Un champ facultatif ou masqué désactive ce qui en dépend**, explicitement
   (ici : l'anti-doublon par référence), et l'écran de réglage le dit.

## 3. Conception proposée

### 3.1 Trois modes par champ

`REQUIRED` (obligatoire) · `OPTIONAL` (visible, facultatif) · `HIDDEN` (non
affiché, jamais enregistré). Le registre fixe, par champ, les modes permis et
le mode par défaut (= comportement actuel, donc aucune agence ne voit de
changement sans action).

### 3.2 Registre côté code (partagé API/web)

```ts
// packages/api/src/lib/form-settings/registry.ts (exposé au web via l'API)
export const FORM_REGISTRY = {
  "syndic.declared-payment": {
    scope: "SYNDICATE", // réglage par copropriété
    fields: {
      transactionReference: {
        default: "REQUIRED",
        allowed: ["REQUIRED", "OPTIONAL", "HIDDEN"],
      },
      payerPhone: { default: "REQUIRED", allowed: ["REQUIRED", "OPTIONAL"] },
      comment: { default: "OPTIONAL", allowed: ["OPTIONAL", "HIDDEN"] },
      proof: {
        default: "OPTIONAL",
        allowed: ["REQUIRED", "OPTIONAL", "HIDDEN"],
      },
      // montant, lots, numéro de réception, date : absents = verrouillés
    },
  },
} as const;
```

Ajouter un formulaire paramétrable = une entrée au registre + brancher le hook
front et le helper serveur. Rien de générique côté schéma de données à refaire.

### 3.3 Stockage

Nouveau modèle, multi-tenant, une ligne par (agence, formulaire, portée) :

```prisma
model FormFieldSettings {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @map("tenant_id")
  formKey   String   @map("form_key")          // 'syndic.declared-payment'
  scopeId   String?  @map("scope_id")          // syndicateId ; null = défaut agence
  fields    Json                                // { transactionReference: 'OPTIONAL', … }
  updatedById String? @map("updated_by_id")
  updatedAt DateTime @updatedAt @map("updated_at")
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, formKey, scopeId])
  @@map("form_field_settings")
}
```

Résolution : réglage de la copropriété → défaut de l'agence → défaut du
registre. Le JSON est validé à l'écriture contre le registre (clé inconnue ou
mode non permis → 400). `proofRequired` existant est migré dans ce modèle (ou
lu comme alias pendant une version) pour n'avoir qu'une source.

### 3.4 API

- `GET /api/form-settings/:formKey?scopeId=` → modes résolus + registre
  (libellés, modes permis) ; lecture pour tout membre, et exposé au portail
  copropriétaire dans la réponse de disponibilité existante.
- `PUT /api/form-settings/:formKey` → droits d'administration de l'agence
  (même permission que les réglages 047), `assertBelongsToTenant` sur
  `scopeId`, journal d'audit `FORM_FIELD_SETTINGS_UPDATED`.
- Helper serveur `applyFieldModes(formKey, rules, body)` : champ `REQUIRED`
  absent → 400 `FIELD_REQUIRED` ; champ `HIDDEN` reçu → ignoré et non stocké ;
  `OPTIONAL` vide → `null`.

### 3.5 Effets sur le paiement déclaré (le cas Haiku)

- Migration : `transaction_reference` devient NULLABLE. L'index unique partiel
  ne change pas (PostgreSQL ne considère pas deux NULL comme égaux) : il
  continue de bloquer une référence réutilisée quand elle est saisie.
- `request-schemas.ts` : `transactionReference` `nullable().optional()` ;
  `declaration-create.ts` : la normalisation/validation ne s'applique que si
  une valeur est fournie ; `HIDDEN` → `null` forcé.
- `matchProbableDuplicates` : traiter deux références nulles comme
  « inconnues » (aujourd'hui `null !== null` est faux → le doublon probable ne
  serait **plus détecté**). C'est le garde-fou qui reste quand la référence
  manque (même payeur, même montant, 10 min d'écart).
- Alerte `REFERENCE_ON_EXISTING_PAYMENT` et motif de rejet `REFERENCE_USED` :
  sans objet quand la référence est nulle ; motif masqué dans `RejectModal`.
- Pré-remplissage IA : la référence lue sur la capture n'est proposée que si
  le champ n'est pas `HIDDEN`.
- Affichage : tableau, tiroir, modale de validation, portail, export, reçus,
  notifications e-mail/WhatsApp (`{{reference}}`) affichent « — » ou omettent
  la ligne quand la référence est nulle.
- Écran de réglage : dans `DeclaredSettingsCard`, une ligne « Référence de
  transaction » avec trois choix ; si OPTIONAL/HIDDEN, avertissement : « Sans
  référence, ImmoTopia ne peut plus bloquer une même transaction déclarée deux
  fois ; seul le doublon probable (même payeur, montant et heure) est
  signalé. » Suggestion : rendre la capture obligatoire en compensation.

### 3.6 Front

- Hook `useFormFieldModes(formKey, scopeId)` → `{ isVisible(f), isRequired(f) }`.
- `DeclareForThirdPartyModal` et `DeclarationForm` : `Form.Item` rendu
  seulement si visible, `required` piloté par le mode, étiquette
  « (facultatif) » ajoutée en OPTIONAL.
- Composant réutilisable `FieldModesEditor` (une ligne par champ du registre,
  Segmented Obligatoire / Facultatif / Masqué) pour les futurs formulaires.
- Libellés via `t()` + `npm run i18n:extract` (fr/en/ar).

## 4. Découpage en lots

| Lot                        | Contenu                                                                                                                                                                                        | Dépend de   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 0 — Fondations             | modèle `FormFieldSettings` + migration (dont `transaction_reference` nullable), registre, service de résolution, routes GET/PUT, tests unitaires, `routes-inventory`, `schema-tenant-coverage` | —           |
| 1 — API paiement déclaré   | schémas, `createDeclaration`, alertes (doublon avec référence nulle), revue/rejet, notifications, exports ; reprise de `proofRequired`                                                         | 0           |
| 2 — Web gestionnaire       | hook, `DeclareForThirdPartyModal`, `FieldModesEditor` dans `DeclaredSettingsCard`, affichages nulls (tableau, tiroir, modales)                                                                 | 0 (contrat) |
| 3 — Portail copropriétaire | `DeclarationForm`, liste des déclarations, disponibilité                                                                                                                                       | 1           |
| 4 — Finitions              | i18n fr/en/ar, classeur des fonctionnalités + `wiki:export`, spec 047 complétée (décision D-nouvelle), recette navigateur sur la démo                                                          | 1, 2, 3     |

Lots 2 et 3 en parallèle après 0 et 1 (fichiers disjoints). Contrôles :
`npm run typecheck`, `npm test` ciblé `declared-payment`, `npm run test:web`
ciblé, `npm run test:isolation`, `check:architecture`, `wiki:check`.
Diff sensible (portail, paiements, tenant) → `code-reviewer` +
`security-auditor` avant la PR.

## 5. Décisions métier à trancher

| #   | Question                                                                                    | Hypothèse proposée                                                 |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| H1  | Niveau du réglage : par copropriété, par agence, ou agence avec surcharge par copropriété ? | agence + surcharge par copropriété                                 |
| H2  | Qui règle : administrateur d'agence, ou super-admin seulement ?                             | administrateur d'agence (comme les réglages 047 actuels)           |
| H3  | Champs ouverts au réglage dans ce premier formulaire                                        | référence, numéro du payeur, commentaire, capture                  |
| H4  | Masquer la référence : acceptable de perdre le blocage du doublon exact ?                   | oui, avec avertissement et alerte « doublon probable » maintenue   |
| H5  | Étendre à d'autres formulaires dans la même livraison ?                                     | non : moteur générique livré, branché sur le seul paiement déclaré |

## 6. Estimation

Lot 0 : ~1 j · Lot 1 : ~1 j · Lots 2+3 : ~1 j · Lot 4 : ~0,5 j de recette.
Risque principal : les consommateurs de `transactionReference` qui
supposent une chaîne non vide (notifications, PDF, exports) — à recenser par
le typecheck une fois la colonne rendue nullable.
