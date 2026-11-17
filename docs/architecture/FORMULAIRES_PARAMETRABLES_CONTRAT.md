# Contrat technique — formulaires paramétrables (moteur + Syndic)

Date : 2026-11-16 · Plan : [PLAN_FORMULAIRES_PARAMETRABLES.md](PLAN_FORMULAIRES_PARAMETRABLES.md)
(section « 00. Décision de gouvernance » qui prime). Ce contrat fixe les noms
et signatures pour que tous les lots avancent en parallèle. Toute déviation
se signale dans le rapport, elle ne s'improvise pas.

## 1. Vocabulaire

- `FieldMode` = `'REQUIRED' | 'OPTIONAL' | 'HIDDEN'`.
- `FieldClass` = `'GATED'` (« facultatif sous condition » : le super-admin doit
  déverrouiller pour l'agence) | `'OPEN'` (« paramétrable » : l'agence règle
  directement). Les champs « jamais facultatif » n'apparaissent **nulle part**.
- `formKey` : `<module>.<formulaire>` en kebab-case, stable, ex.
  `syndic.declared-payment-manager`, `syndic.declared-payment-portal`.
- `fieldKey` : chemin de la clé **dans le corps JSON envoyé à l'API**
  (pas le nom du `Form.Item` s'il diffère). Clé de premier niveau
  (`transactionReference`) ou élément de tableau (`lines[].chargeCallIds`).

## 2. Registre (packages/api/src/lib/form-settings/)

```ts
// types.ts
export type FieldMode = "REQUIRED" | "OPTIONAL" | "HIDDEN";
export type FieldClass = "GATED" | "OPEN";
export interface FormFieldDefinition {
  key: string; // fieldKey
  label: string; // libellé français affiché (clé i18n)
  fieldClass: FieldClass;
  defaultMode: FieldMode; // = comportement actuel
  allowedModes: FieldMode[]; // contient toujours defaultMode ; sans 'HIDDEN' si non masquable
  consequence: string; // « ce qui casse », français, affiché aux deux écrans
}
export interface FormDefinition {
  formKey: string;
  module: string; // 'syndic' pour ce lot
  label: string; // titre français du formulaire
  audience: "agency" | "coowner-portal" | "tenant-portal" | "owner-portal";
  fields: FormFieldDefinition[];
}
```

- `registry/index.ts` (lot moteur) : `export const FORM_REGISTRY: Record<string, FormDefinition>`
  assemblé depuis `registry/syndic-paiements.ts`, `registry/syndic-copropriete.ts`,
  `registry/syndic-charges.ts`, `registry/syndic-assemblees.ts`. Chacun exporte
  `export const FORMS: FormDefinition[]`. Chaque fichier appartient au lot
  Syndic correspondant, qui le crée ; le lot moteur ne fait que les importer
  et teste son service avec un registre injecté (paramètre optionnel
  `registry` des fonctions du service).
- Une fonction `assertRegistryConsistency()` (testée) vérifie : formKey unique,
  fieldKey unique par formulaire, `defaultMode ∈ allowedModes`.
- Libellés et conséquences en français littéral passés par `t()` à la lecture
  (texte français = clé), jamais de clé technique.

## 3. Données (lot moteur, une seule migration)

```prisma
model TenantFormFieldSetting {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id")
  formKey     String   @map("form_key")
  fieldKey    String   @map("field_key")
  mode        String                        // FieldMode, validé par le registre
  updatedById String?  @map("updated_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, formKey, fieldKey])
  @@index([tenantId, formKey])
  @@map("tenant_form_field_settings")
}

model TenantFormFieldUnlock {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id")
  formKey      String   @map("form_key")
  fieldKey     String   @map("field_key")
  reason       String?  @db.VarChar(500)
  unlockedById String   @map("unlocked_by_id")
  createdAt    DateTime @default(now()) @map("created_at")
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, formKey, fieldKey])
  @@map("tenant_form_field_unlocks")
}
```

Même migration : `syndic_payment_declarations.transaction_reference` devient
NULLABLE (`transactionReference String?`). L'index unique partiel
`syndic_payment_declarations_ref_active_uq` reste tel quel (deux NULL ne se
heurtent pas). Migration écrite sans base (`prisma migrate diff`), nommée
`20261116120000_formulaires_parametrables`.

## 4. Service serveur (lot moteur) — `lib/form-settings/service.ts`

```ts
export interface EffectiveField {
  key: string;
  mode: FieldMode;
}
export interface EffectiveForm {
  formKey: string;
  fields: Record<string, FieldMode>;
}

/** Modes effectifs d'un formulaire pour une agence (une requête, mise en cache 30 s par tenant+formKey). */
export function getEffectiveFieldModes(
  tenantId: string,
  formKey: string,
): Promise<EffectiveForm>;
/** Invalide le cache (appelé par les écritures). */
export function invalidateFieldModes(tenantId: string, formKey?: string): void;
```

Résolution : `OPEN` → réglage agence sinon `defaultMode` ; `GATED` → réglage
agence **seulement s'il existe un déverrouillage**, sinon `defaultMode` ; mode
stocké hors `allowedModes` → `defaultMode`.

`lib/form-settings/apply.ts` :

```ts
/** Applique les modes à un corps déjà parsé. REQUIRED absent/vide → AppError 400
 *  ErrorCode.FORM_FIELD_REQUIRED (details: { fieldKey }) ; HIDDEN → clé supprimée
 *  (ou mise à null si `nullOnHidden`) ; OPTIONAL → inchangé. Gère `a[].b`. */
export function applyFieldModes(
  body: unknown,
  modes: EffectiveForm,
  opts?: { nullOnHidden?: boolean },
): void;

/** Middleware Express : lit tenantId (req.tenantContext, ou contexte portail),
 *  appelle getEffectiveFieldModes puis applyFieldModes(req.body). À placer APRÈS
 *  multer pour les routes multipart (le corps JSON peut être dans req.body.payload :
 *  option `{ payloadField: 'payload' }` qui parse/réécrit ce champ). */
export function formFieldModes(
  formKey: string,
  opts?: { payloadField?: string; nullOnHidden?: boolean },
): RequestHandler;
```

Option `partial: true` pour les routes de mise à jour partielle (`PATCH`) :
un champ `REQUIRED` absent du corps est accepté (on ne le modifie pas) ; il
n'est refusé que s'il est présent et vide. Un même `formKey` peut couvrir la
création (`POST`, strict) et la modification (`PATCH`, `partial`) d'une
entité, et deux sous-formulaires qui envoient au même `PATCH` partagent un
seul `formKey` (ex. `syndic.assemblee-informations`).

Les `formKey` du Syndic sont fixés dans `.orchestration/slices/syndic-*.json`
(attribut `formKey` de chaque formulaire, à reprendre à l'identique).

« Vide » = `undefined`, `null`, chaîne après `trim()` vide, tableau vide.
Le middleware s'exécute **avant** la validation zod de la route : un champ
masqué n'arrive donc jamais au service. Ajouter `FORM_FIELD_REQUIRED` à
`ErrorCode` (message : « Le champ {label} est obligatoire. »).

## 5. Routes (lot routes de réglage)

| Méthode | Chemin                                           | Garde                                                                          | Rôle                                                                                                                                                                                                                                 |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET     | `/api/tenants/:tenantId/settings/forms`          | `authenticate, requireTenantAccess, requirePermission('TENANT_SETTINGS_VIEW')` | registre complet + pour chaque champ : `fieldClass`, `allowedModes`, `defaultMode`, `mode` effectif, `storedMode`, `unlocked` (bool, GATED)                                                                                          |
| PUT     | `/api/tenants/:tenantId/settings/forms/:formKey` | `… requirePermission('TENANT_SETTINGS_EDIT')`                                  | corps `{ fields: { [fieldKey]: FieldMode \| null } }` (`null` = revenir au défaut) ; refuse (400) clé inconnue, mode non permis, champ GATED non déverrouillé (403 `FORM_FIELD_LOCKED`) ; audit `TENANT_FORM_FIELD_SETTINGS_UPDATED` |
| GET     | `/api/tenants/:tenantId/forms/:formKey/modes`    | `authenticate, requireTenantAccess` (tout membre)                              | `{ formKey, fields: { [fieldKey]: FieldMode } }` pour les écrans de saisie                                                                                                                                                           |
| GET     | `/api/portal/copropriete/forms/:formKey/modes`   | garde du portail copropriétaire (comme `paiements-declares`)                   | idem, formulaires `audience: 'coowner-portal'` seulement, sinon 404                                                                                                                                                                  |
| GET     | `/api/admin/tenants/:tenantId/form-unlocks`      | `requirePermission('PLATFORM_TENANTS_VIEW')`                                   | champs GATED du registre + état déverrouillé, auteur, date, motif                                                                                                                                                                    |
| PUT     | `/api/admin/tenants/:tenantId/form-unlocks`      | `requirePermission('PLATFORM_TENANTS_EDIT')`                                   | `{ formKey, fieldKey, unlocked: boolean, reason?: string }` ; vérifie que le tenant existe et que le champ est GATED ; audit plateforme `PLATFORM_FORM_FIELD_UNLOCK_CHANGED` ; invalide le cache                                     |

Chaque nouvelle route est ajoutée à `__tests__/unit/routes-inventory.test.ts`
selon ses conventions ; chaque modèle à `schema-tenant-coverage.test.ts`.

## 6. Web socle (apps/web/src)

- `services/form-settings-service.ts` : appels des routes §5 via `utils/api-client`,
  URL via `config/api`. Types `FieldMode`, `FormSettingsResponse`… alignés sur §5.
- `hooks/useFormFieldModes.ts` :
  ```ts
  export function useFormFieldModes(
    formKey: string,
    opts?: { portal?: "coowner" },
  ): {
    loading: boolean;
    mode(fieldKey: string, fallback?: FieldMode): FieldMode; // fallback = comportement actuel
    isVisible(fieldKey: string): boolean;
    isRequired(fieldKey: string, fallbackRequired: boolean): boolean;
  };
  ```
  Tant que la réponse n'est pas arrivée ou en cas d'erreur : comportement
  actuel (fallback), jamais de formulaire bloqué. Cache mémoire par formKey
  pendant la session, invalidé par l'écran de réglage.
- `components/form-settings/FieldModesEditor.tsx` : props
  `{ form: FormSettingsForm; editable: boolean; onChange(fieldKey, mode | null) }`,
  une ligne par champ : libellé, conséquence en texte secondaire, `Segmented`
  Obligatoire / Facultatif / Masqué limité aux `allowedModes`, cadenas et
  « Réglage soumis à ImmoTopia » pour un GATED non déverrouillé.

Usage dans un formulaire AntD :

```tsx
const fm = useFormFieldModes('syndic.declared-payment-manager');
{fm.isVisible('transactionReference') && (
  <Form.Item name="transactionReference" label={t('Référence de transaction')}
    rules={[{ required: fm.isRequired('transactionReference', true), whitespace: true, message: … }, …]}>
```

Un champ OPTIONAL dont le libellé ne dit pas déjà « (facultatif) » ne change
pas de libellé ; un champ HIDDEN n'est pas envoyé dans le corps.

## 7. Règles communes à tous les lots

- Comportement par défaut strictement identique à aujourd'hui (aucune ligne en
  base = rien ne change) ; les tests existants doivent rester verts.
- Isolation : toute lecture/écriture filtrée par `tenantId` ; jamais
  `include: { user: true }`.
- Textes visibles par `t('texte français')` ; marges logiques.
- Ne pas toucher aux catalogues i18n ni au classeur des fonctionnalités : lot final.
- Ne pas lancer `npm run typecheck`, `npm test` ni `npm run test:web` complets
  (poste partagé par plusieurs agents) : seulement le ou les fichiers de test
  ciblés de son territoire (`npx jest <chemin>` dans packages/api,
  `npx vitest run <chemin>` dans apps/web), et `npx tsc --noEmit -p <paquet>`
  au plus une fois en fin de travail.
