import { isTest } from '../../config/env';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/email-notification-default-templates';
import { DEFAULT_LANGUAGE, isLanguage, runWithLanguage, t, type Language } from '../../i18n';
import { emailService } from '../../services/email-service';
import { hasPermission } from '../../services/permission-service';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { runWithTenantContext } from '../../utils/tenant-context';
import { applyTemplate, escapeHtml } from '../patrimoine/notification-channels';

/**
 * E-mail aux administrateurs de l'agence quand un compte de réception change
 * (spec 048, lot Q, contrat §4) : création, alias ou QR modifié, désactivation,
 * suppression. Modèle : `notifyReceivingNumberChanged` (spec 047).
 *
 * Envoi APRÈS le commit, en tâche de fond, jamais bloquant : une panne d'e-mail
 * est journalisée et n'annule rien. Désactivé sous Jest (`NODE_ENV=test`) ; les
 * tests appellent `sendReceivingAccountChangedAlert`. Aucune image, aucun chemin
 * de fichier : seulement l'établissement, l'alias, le titulaire et la présence d'un QR.
 *
 * ALERTE DE SÉCURITÉ, toujours envoyée : le réglage « activé » et les surcharges
 * de sujet et de corps de la configuration des notifications sont IGNORÉS (tout
 * collaborateur peut les modifier ; un détournement ne doit pas pouvoir couper
 * ni réécrire l'alerte). Seul le gabarit par défaut part.
 */

const KEY = 'RECEIVING_ACCOUNT_CHANGED' as const;

export type ReceivingAccountChange =
  | 'CREATED'
  | 'ALIAS_CHANGED'
  | 'QR_CHANGED'
  | 'DEACTIVATED'
  | 'REACTIVATED'
  | 'HOLDER_CHANGED'
  | 'INSTITUTION_CHANGED'
  | 'INSTRUCTIONS_CHANGED'
  | 'SCANNABLE_WITH_CHANGED'
  | 'DELETED';

export interface ReceivingAccountAlert {
  tenantId: string;
  actorUserId: string;
  scope: 'AGENCY' | 'SYNDICATE';
  syndicateId: string | null;
  institution: string;
  changes: ReceivingAccountChange[];
  previousAlias: string | null;
  newAlias: string | null;
  hadQr: boolean;
  hasQr: boolean;
  /** Titulaire attendu avant et après (absent : inchangé ou non pertinent). */
  previousHolderName?: string | null;
  newHolderName?: string | null;
}

interface Admin {
  userId: string;
  email: string;
  language: Language;
}

/** Membres ACTIFS et comptes actifs qui détiennent `TENANT_SETTINGS_EDIT` dans CETTE agence. */
async function resolveAdmins(tenantId: string): Promise<Admin[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: 'ACTIVE', user: { isActive: true } },
    select: { userId: true, user: { select: { email: true, preferredLanguage: true } } }
  });
  const admins: Admin[] = [];
  for (const membership of memberships) {
    const email = membership.user?.email?.trim();
    if (!email) continue;
    if (!(await hasPermission(membership.userId, 'TENANT_SETTINGS_EDIT', tenantId))) continue;
    const language = membership.user?.preferredLanguage;
    admins.push({ userId: membership.userId, email, language: isLanguage(language) ? language : DEFAULT_LANGUAGE });
  }
  return admins;
}

function changeLabel(changes: ReceivingAccountChange[]): string {
  const labels: Record<ReceivingAccountChange, string> = {
    CREATED: t('compte ajouté'),
    ALIAS_CHANGED: t('alias modifié'),
    QR_CHANGED: t('QR modifié'),
    DEACTIVATED: t('compte désactivé'),
    DELETED: t('compte supprimé'),
    REACTIVATED: t('compte réactivé'),
    HOLDER_CHANGED: t('titulaire modifié'),
    INSTITUTION_CHANGED: t('établissement modifié'),
    INSTRUCTIONS_CHANGED: t('instructions modifiées'),
    SCANNABLE_WITH_CHANGED: t('« scannable avec » modifié')
  };
  return changes.map(change => labels[change]).join(', ');
}

/** Envoie l'alerte ; renvoie le nombre d'envois réussis. Ne lève jamais. */
export async function sendReceivingAccountChangedAlert(alert: ReceivingAccountAlert): Promise<number> {
  const { tenantId } = alert;
  try {
    const admins = await resolveAdmins(tenantId);
    if (admins.length === 0) return 0;

    const [actor, syndicate] = await Promise.all([
      prisma.user.findFirst({ where: { id: alert.actorUserId }, select: { fullName: true } }),
      alert.syndicateId
        ? prisma.syndicate.findFirst({ where: { id: alert.syndicateId, tenantId }, select: { name: true } })
        : Promise.resolve(null)
    ]);
    const defaults = EMAIL_NOTIFICATION_DEFAULT_TEMPLATES[KEY];
    let delivered = 0;
    for (const admin of admins) {
      try {
        await runWithLanguage(admin.language, async () => {
          const none = t('aucun');
          const present = t('présent');
          const absent = t('absent');
          const variables = {
            scopeLabel: syndicate?.name ?? t("l'agence"),
            actorName: actor?.fullName?.trim() || t('Un gestionnaire'),
            institution: alert.institution,
            changeLabel: changeLabel(alert.changes),
            previousAlias: alert.previousAlias ?? none,
            newAlias: alert.newAlias ?? none,
            previousQr: alert.hadQr ? present : absent,
            newQr: alert.hasQr ? present : absent,
            previousHolder: alert.previousHolderName ?? none,
            newHolder: alert.newHolderName ?? none
          };
          const escaped = Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, escapeHtml(v)]));
          await emailService.sendEmail({
            to: admin.email,
            tenantId,
            subject: applyTemplate(defaults.subject, variables),
            html: applyTemplate(defaults.bodyHtml, escaped),
            journal: {
              key: KEY,
              recipient: { userId: admin.userId, email: admin.email },
              relatedEntity: alert.syndicateId ? { type: 'Syndicate', id: alert.syndicateId } : undefined
            }
          });
        });
        delivered += 1;
      } catch (error) {
        logger.warn('[receiving-accounts] alerte non envoyée à un administrateur', {
          tenantId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return delivered;
  } catch (error) {
    logger.error('[receiving-accounts] alerte en échec', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/** Lance l'alerte sans attendre, sans jamais lever (désactivée sous Jest). */
export function notifyReceivingAccountChanged(alert: ReceivingAccountAlert): void {
  if (isTest) return;
  try {
    void runWithTenantContext({ tenantId: alert.tenantId }, () => sendReceivingAccountChangedAlert(alert)).catch(
      error =>
        logger.error('[receiving-accounts] alerte non lancée', {
          tenantId: alert.tenantId,
          error: error instanceof Error ? error.message : String(error)
        })
    );
  } catch {
    // La notification ne doit jamais faire échouer l'appelant.
  }
}
