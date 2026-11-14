import { t } from '../../i18n/t';
import type { RentalAlertRule } from '../../types/copilot';

export function rentalAlertLabels() {
  return {
    lease_expiry: t('Fin de bail'),
    declaration_pending: t('Déclaration en attente'),
    overdue_rent: t('Impayés locatifs')
  };
}

export function rentalAlertDescription(rule: RentalAlertRule) {
  if (rule.kind === 'lease_expiry') return t('Bail actif se terminant dans les {{days}} prochains jours', rule);
  if (rule.kind === 'declaration_pending')
    return t('Déclaration en attente depuis au moins {{days}} jours ouvrés', rule);
  return t('Solde cumulé d’au moins {{minimumAmount}} {{currency}} après {{days}} jours de retard', rule);
}

export function rentalAlertParams(rule: RentalAlertRule, conversationId?: string) {
  const params = new URLSearchParams({ 'alertes-locatives': '1', regle: rule.kind, jours: String(rule.days) });
  if (conversationId) params.set('c', conversationId);
  if (rule.propertyId) params.set('bien', rule.propertyId);
  if (rule.kind === 'overdue_rent') {
    params.set('minimum', String(rule.minimumAmount));
    params.set('devise', rule.currency);
  }
  return params.toString();
}
