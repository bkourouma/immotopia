/**
 * Geste standard à la sonnette d'un `<Form>` AntD dont la validation échoue.
 *
 * Sur un formulaire long, l'erreur de validation d'AntD s'affiche au ras du
 * champ fautif — qui peut se trouver tout en haut du formulaire, hors écran,
 * pendant qu'on clique « Enregistrer » tout en bas. Rien d'autre ne bouge :
 * l'utilisateur croit alors que rien n'a été envoyé. On fait défiler jusqu'au
 * premier champ en erreur et on l'annonce par un message, pour que l'échec
 * de validation soit aussi visible que l'aurait été un succès.
 *
 * Utilisation : `<Form onFinishFailed={onAntFormValidationFailed(form)}>`.
 */
import type { FormInstance } from 'antd';
import { feedback } from './feedback';
import { t } from '../i18n/t';

interface AntFormErrorInfo {
  errorFields: { name: (string | number)[]; errors: string[] }[];
}

export function onAntFormValidationFailed<Values = any>(form: FormInstance<Values>) {
  return ({ errorFields }: AntFormErrorInfo): void => {
    if (errorFields.length > 0) {
      form.scrollToField(errorFields[0].name, { behavior: 'smooth', block: 'center' });
    }
    feedback.error(t('Le formulaire contient des erreurs — voir les champs en rouge.'));
  };
}
