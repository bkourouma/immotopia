import { z, ZodIssueCode, ZodParsedType } from 'zod';
import { t } from '../i18n';

/**
 * Messages Zod par défaut, en français.
 *
 * Un schéma qui pose un message personnalisé (`z.string().min(1, 'Le motif
 * est obligatoire.')`) n'a pas besoin de cette carte : son texte gagne
 * toujours. Elle ne joue que quand Zod retombe sur SON propre message —
 * notamment `invalid_type` quand un champ obligatoire est absent du corps
 * (et non simplement vide), cas que le message personnalisé d'un `.min()`
 * ne couvre pas puisqu'il ne s'applique qu'une fois le type de base validé.
 *
 * Sans cette carte, ce message par défaut sort en anglais (« Required »,
 * « Expected string, received number »...), quelle que soit la langue de la
 * requête : `t()` ne traduit que des clés qui existent en français, et un
 * texte anglais codé en dur dans Zod n'en est pas une. C'est exactement ce
 * qui s'est produit le 20 septembre 2026 sur l'annulation d'un bon de
 * commande sans `reason` (voir `apps/web/src/utils/api-client.ts`,
 * `detaillerErreurDeValidation`).
 *
 * Posée une fois globalement (`z.setErrorMap`, appelé par effet de bord à
 * l'import de ce module) plutôt que schéma par schéma : les ~90 schémas Zod
 * du module financier, entre autres, n'ont pas à être touchés un par un pour
 * en bénéficier.
 *
 * Chaque message passe par `t()` ICI MÊME, avec des motifs `{{valeur}}`
 * plutôt que des valeurs déjà injectées dans le texte : c'est ce qui permet
 * à `npm run i18n:extract` (qui ne reconnaît que `throw new XxxError(...)`,
 * les fabriques de `lib/errors` et les appels `t(...)`) de recenser ces
 * clés, alors qu'un gabarit JavaScript (`` `${minimum}` ``) lui serait
 * invisible et disparaîtrait du catalogue au prochain passage. Le second
 * appel à `t()` dans `error-middleware.ts` (qui traduit `errors[].message`)
 * retombe alors sur un texte déjà dans la bonne langue : `t()` est sans
 * effet sur un texte qui n'est plus une clé française.
 */
const frenchZodErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type: {
      if (issue.received === ZodParsedType.undefined) {
        return { message: t('Ce champ est obligatoire.') };
      }
      return {
        message: t('Type invalide : {{expected}} attendu, {{received}} reçu.', {
          expected: issue.expected,
          received: issue.received
        })
      };
    }

    case ZodIssueCode.invalid_literal:
      return {
        message: t('Valeur invalide, {{expected}} attendu.', { expected: JSON.stringify(issue.expected) })
      };

    case ZodIssueCode.unrecognized_keys:
      return { message: t('Clé(s) non reconnue(s) : {{keys}}.', { keys: issue.keys.join(', ') }) };

    case ZodIssueCode.invalid_union:
      return { message: t('Entrée invalide.') };

    case ZodIssueCode.invalid_union_discriminator:
      return {
        message: t('Valeur de discrimination invalide. Attendu : {{options}}.', {
          options: issue.options.map(String).join(', ')
        })
      };

    case ZodIssueCode.invalid_enum_value:
      return {
        message: t('Valeur invalide. Attendu : {{options}}, reçu « {{received}} ».', {
          options: issue.options.join(', '),
          received: String(issue.received)
        })
      };

    case ZodIssueCode.invalid_arguments:
      return { message: t('Arguments de fonction invalides.') };

    case ZodIssueCode.invalid_return_type:
      return { message: t('Type de retour de fonction invalide.') };

    case ZodIssueCode.invalid_date:
      return { message: t('Date invalide.') };

    case ZodIssueCode.invalid_string: {
      if (typeof issue.validation === 'object') {
        if ('includes' in issue.validation) {
          return { message: t('Doit contenir « {{valeur}} ».', { valeur: issue.validation.includes }) };
        }
        if ('startsWith' in issue.validation) {
          return { message: t('Doit commencer par « {{valeur}} ».', { valeur: issue.validation.startsWith }) };
        }
        if ('endsWith' in issue.validation) {
          return { message: t('Doit se terminer par « {{valeur}} ».', { valeur: issue.validation.endsWith }) };
        }
        return { message: t('Format invalide.') };
      }
      switch (issue.validation) {
        case 'email':
          return { message: t('Adresse email invalide.') };
        case 'url':
          return { message: t('URL invalide.') };
        case 'uuid':
        case 'cuid':
        case 'cuid2':
        case 'ulid':
          return { message: t('Identifiant invalide.') };
        case 'datetime':
          return { message: t('Date et heure invalides.') };
        case 'ip':
          return { message: t('Adresse IP invalide.') };
        case 'regex':
          return { message: t('Format invalide.') };
        default:
          return { message: t('Format invalide ({{validation}}).', { validation: issue.validation }) };
      }
    }

    case ZodIssueCode.too_small: {
      const minimum = String(issue.minimum);
      if (issue.type === 'array') {
        if (issue.exact)
          return { message: t('Le tableau doit contenir exactement {{minimum}} élément(s).', { minimum }) };
        if (issue.inclusive)
          return { message: t('Le tableau doit contenir au moins {{minimum}} élément(s).', { minimum }) };
        return { message: t('Le tableau doit contenir plus de {{minimum}} élément(s).', { minimum }) };
      }
      if (issue.type === 'string') {
        if (issue.exact)
          return { message: t('Le texte doit contenir exactement {{minimum}} caractère(s).', { minimum }) };
        if (issue.inclusive)
          return { message: t('Le texte doit contenir au moins {{minimum}} caractère(s).', { minimum }) };
        return { message: t('Le texte doit contenir plus de {{minimum}} caractère(s).', { minimum }) };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        if (issue.exact) return { message: t('Le nombre doit être exactement égal à {{minimum}}.', { minimum }) };
        if (issue.inclusive) return { message: t('Le nombre doit être supérieur ou égal à {{minimum}}.', { minimum }) };
        return { message: t('Le nombre doit être supérieur à {{minimum}}.', { minimum }) };
      }
      if (issue.type === 'date') {
        const date = new Date(Number(issue.minimum)).toISOString();
        if (issue.exact) return { message: t('La date doit être exactement égale au {{date}}.', { date }) };
        if (issue.inclusive) return { message: t('La date doit être postérieure ou égale au {{date}}.', { date }) };
        return { message: t('La date doit être postérieure au {{date}}.', { date }) };
      }
      return { message: t('Entrée invalide.') };
    }

    case ZodIssueCode.too_big: {
      const maximum = String(issue.maximum);
      if (issue.type === 'array') {
        if (issue.exact)
          return { message: t('Le tableau doit contenir exactement {{maximum}} élément(s).', { maximum }) };
        if (issue.inclusive)
          return { message: t('Le tableau doit contenir au plus {{maximum}} élément(s).', { maximum }) };
        return { message: t('Le tableau doit contenir moins de {{maximum}} élément(s).', { maximum }) };
      }
      if (issue.type === 'string') {
        if (issue.exact)
          return { message: t('Le texte doit contenir exactement {{maximum}} caractère(s).', { maximum }) };
        if (issue.inclusive)
          return { message: t('Le texte doit contenir au plus {{maximum}} caractère(s).', { maximum }) };
        return { message: t('Le texte doit contenir moins de {{maximum}} caractère(s).', { maximum }) };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        if (issue.exact) return { message: t('Le nombre doit être exactement égal à {{maximum}}.', { maximum }) };
        if (issue.inclusive) return { message: t('Le nombre doit être inférieur ou égal à {{maximum}}.', { maximum }) };
        return { message: t('Le nombre doit être inférieur à {{maximum}}.', { maximum }) };
      }
      if (issue.type === 'date') {
        const date = new Date(Number(issue.maximum)).toISOString();
        if (issue.exact) return { message: t('La date doit être exactement égale au {{date}}.', { date }) };
        if (issue.inclusive) return { message: t('La date doit être antérieure ou égale au {{date}}.', { date }) };
        return { message: t('La date doit être antérieure au {{date}}.', { date }) };
      }
      return { message: t('Entrée invalide.') };
    }

    case ZodIssueCode.invalid_intersection_types:
      return { message: t("Les résultats de l'intersection n'ont pas pu être fusionnés.") };

    case ZodIssueCode.not_multiple_of:
      return {
        message: t('Le nombre doit être un multiple de {{multipleOf}}.', { multipleOf: String(issue.multipleOf) })
      };

    case ZodIssueCode.not_finite:
      return { message: t('Le nombre doit être fini.') };

    case ZodIssueCode.custom:
      return { message: (issue.params?.message as string | undefined) ?? t('Entrée invalide.') };

    default:
      // Filet de sécurité : un code Zod encore inconnu de cette carte garde le
      // message par défaut de Zod plutôt que de casser la validation.
      return { message: ctx.defaultError };
  }
};

z.setErrorMap(frenchZodErrorMap);

export { frenchZodErrorMap };
