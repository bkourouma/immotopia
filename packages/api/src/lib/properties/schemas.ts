import { z } from 'zod';
import {
  PropertyType,
  PropertyOwnershipType,
  PropertyTransactionMode,
  PropertyFurnishingStatus,
  PropertyStatus,
  PropertyAvailability
} from '@prisma/client';

/**
 * Schema Zod du corps de creation et de mise a jour d'un bien
 * (`POST /tenants/:tenantId/properties`, `POST .../properties/:id/sub-properties`,
 * `PUT /tenants/:tenantId/properties/:id`).
 *
 * Remplace `assertCreatePropertyRequest` (`services/property-service.ts`,
 * commit 335658e), qui ne verifiait a la main que quatre champs et laissait
 * passer un champ mal type (`price: "abc"`, `bedrooms: "x"`, un `ownerUserId`
 * qui n'est pas un uuid...) jusqu'a `tx.property.create()` / `.update()`, qui
 * levait alors une `PrismaClientValidationError` classee 500 par
 * `errorHandler`.
 *
 * Un ZodError leve ici (appel nu de `.parse()`, sans try/catch) remonte tel
 * quel a travers `asyncHandler` jusqu'a `errorHandler`
 * (`middleware/error-middleware.ts`), qui le classe deja en 400
 * `VALIDATION_ERROR` avec `errors: [{ field, message }]` — meme mecanisme que
 * `lib/syndics/schemas.ts` + `syndic-controller.ts`
 * (`createSyndicateSchema.parse(req.body)`).
 *
 * Cinq messages reprennent mot pour mot ceux d'`assertCreatePropertyRequest`
 * (deja au catalogue `i18n/locales/{en,ar}.json`, lignes 200-205) : la
 * validation gagne en couverture sans rien retraduire. Les autres champs
 * retombent sur le message par defaut de `lib/zod-error-map.ts`
 * (« Ce champ est obligatoire. », « Type invalide : ... », « Identifiant
 * invalide. »...), deja traduit lui aussi.
 *
 * Les enums reprennent exactement les valeurs Prisma ; les identifiants sont
 * des uuid ; `typeSpecificData` reste un objet libre, valide plus loin par
 * `property-template-service.ts` selon le type de bien.
 */

const propertyTypeSchema = z.nativeEnum(PropertyType, {
  errorMap: () => ({ message: 'Le type de bien est absent ou inconnu.' })
});

const ownershipTypeSchema = z.nativeEnum(PropertyOwnershipType, {
  errorMap: () => ({ message: 'Le type de détention du bien est absent ou inconnu.' })
});

const transactionModeSchema = z.nativeEnum(PropertyTransactionMode, {
  errorMap: () => ({ message: 'Les modes de transaction du bien sont invalides.' })
});

/**
 * Facultatif a la creation comme a la mise a jour : le modele Prisma
 * `Property.transactionModes` est une liste sans `@default`, mais Zod comme
 * Prisma acceptent qu'elle soit absente (une liste omise vaut liste vide) —
 * voir `__tests__/unit/property-service.create.test.ts`, qui l'exclut des
 * champs requis lus dans le DMMF genere.
 */
const transactionModesSchema = z
  .array(transactionModeSchema, { invalid_type_error: 'Les modes de transaction du bien sont invalides.' })
  .optional();

const titleSchema = z
  .string({ required_error: 'Le titre du bien est requis.' })
  .trim()
  .min(1, 'Le titre du bien est requis.');

const addressSchema = z
  .string({ invalid_type_error: "L'adresse du bien doit être un texte." })
  .nullable()
  .optional();

const descriptionSchema = z
  .string({ invalid_type_error: 'La description du bien doit être un texte.' })
  .nullable()
  .optional();

const uuidOptional = z.string().uuid().optional();
const numberOptional = z.number().nullable().optional();

/** Champs communs a la creation et a la mise a jour (tous facultatifs). */
const writablePropertyFields = {
  ownerUserId: uuidOptional,
  ownerEmail: z.string().email().optional(),
  description: descriptionSchema,
  address: addressSchema,
  locationZone: z.string().nullable().optional(),
  latitude: numberOptional,
  longitude: numberOptional,
  transactionModes: transactionModesSchema,
  price: numberOptional,
  fees: numberOptional,
  currency: z.string().optional(),
  surfaceArea: numberOptional,
  surfaceUseful: numberOptional,
  surfaceTerrain: numberOptional,
  rooms: numberOptional,
  bedrooms: numberOptional,
  bathrooms: numberOptional,
  furnishingStatus: z.nativeEnum(PropertyFurnishingStatus).optional(),
  availability: z.nativeEnum(PropertyAvailability).optional(),
  status: z.nativeEnum(PropertyStatus).optional(),
  typeSpecificData: z.record(z.any()).nullable().optional()
};

export const createPropertySchema = z.object({
  propertyType: propertyTypeSchema,
  ownershipType: ownershipTypeSchema,
  containerParentId: uuidOptional,
  title: titleSchema,
  ...writablePropertyFields
});

export const updatePropertySchema = z.object({
  title: titleSchema.optional(),
  ...writablePropertyFields
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
