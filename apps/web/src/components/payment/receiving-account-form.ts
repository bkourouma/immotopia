import type { FormRule } from 'antd';
import { t } from '../../i18n/t';

/**
 * Règles du formulaire des comptes de réception, recopiées du schéma de l'API
 * (`packages/api/src/lib/receiving-accounts/schemas.ts`) : espaces retirés
 * AVANT les contrôles de longueur, alias UUID v4 s'il en a la forme.
 */

// eslint-disable-next-line no-control-regex
const ANY_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Les instructions acceptent tabulation et retours à la ligne.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_EXCEPT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Problème d'un alias, `null` s'il convient (vide compris). */
export function aliasProblem(raw: string | undefined | null): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value.length > 80) return t('80 caractères au plus');
  if (ANY_CONTROL_CHARS.test(value)) return t("L'alias ne doit pas contenir de caractère de contrôle");
  if (UUID_SHAPE.test(value) && !UUID_V4.test(value)) {
    return t("L'alias a la forme d'un identifiant PI-SPI mais n'est pas un UUID v4 valide.");
  }
  return null;
}

interface TextRuleOptions {
  min?: number;
  max: number;
  /** Message affiché hors des bornes `min`..`max`. */
  lengthMessage: string;
  allowLines?: boolean;
}

/** Longueur mesurée après retrait des espaces, comme le fait l'API. */
export function trimmedTextRule({ min = 0, max, lengthMessage, allowLines = false }: TextRuleOptions): FormRule {
  return {
    validator: (_rule, raw?: string) => {
      const value = (raw ?? '').trim();
      if (value && (allowLines ? CONTROL_CHARS_EXCEPT_LINES : ANY_CONTROL_CHARS).test(value)) {
        return Promise.reject(new Error(t('Caractères non autorisés.')));
      }
      // Un champ obligatoire vide est signalé par la règle `required`.
      if (value.length === 0) return Promise.resolve();
      if (value.length < min || value.length > max) {
        return Promise.reject(new Error(lengthMessage));
      }
      return Promise.resolve();
    }
  };
}

export const aliasRule: FormRule = {
  validator: (_rule, value?: string) => {
    const problem = aliasProblem(value);
    return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
  }
};

interface ApiErrorBody {
  message?: string;
  error?: string;
  errors?: Array<{ field?: string; message?: string }>;
}

function errorResponse(error: unknown): { status?: number; data?: ApiErrorBody } | undefined {
  return (error as { response?: { status?: number; data?: ApiErrorBody } } | null)?.response;
}

/**
 * Message à afficher : le premier détail par champ s'il y en a un (le message
 * général « Les données fournies sont invalides. » n'aide pas), sinon le
 * message du serveur, sinon `fallback`.
 */
export function receivingAccountErrorMessage(error: unknown, fallback: string): string {
  const data = errorResponse(error)?.data;
  const detail = data?.errors?.find(entry => typeof entry?.message === 'string' && entry.message.trim());
  return detail?.message || data?.message || data?.error || fallback;
}

/** 409 : le compte a été modifié ou supprimé par quelqu'un d'autre depuis la lecture. */
export function isConflictError(error: unknown): boolean {
  return errorResponse(error)?.status === 409;
}
