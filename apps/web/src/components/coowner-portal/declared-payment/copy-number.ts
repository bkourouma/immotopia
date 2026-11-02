import { t } from '../../../i18n/t';
import { feedback } from '../../../lib/feedback';

/** « +2250707070707 » donne « 0707070707 » ; tout autre motif est copié tel quel. */
export function nationalNumber(e164: string): string {
  const match = /^\+225(\d{10})$/.exec(e164);
  return match ? match[1] : e164;
}

export async function copyText(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    feedback.success(successMessage);
  } catch {
    feedback.error(t('Copie impossible, recopiez le numéro à la main.'));
  }
}
