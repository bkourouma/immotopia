import { z } from 'zod';
import { t } from '../../i18n';
import { BadRequestError } from '../../middleware/error-middleware';

const translationSchema = z.literal('ar').optional();

/** L'absence du paramètre sert l'original ; seule la copie arabe est proposée. */
export function pdfTranslationQuery(value: unknown): 'ar' | undefined {
  const result = translationSchema.safeParse(value);
  if (!result.success) throw new BadRequestError(t('Paramètre de traduction invalide.'));
  return result.data;
}
