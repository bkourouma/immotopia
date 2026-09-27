import React from 'react';
import { Tag } from 'antd';
import { t } from '../../i18n/t';
import type {
  BalanceDirection,
  CoOwnerChargeCallStatus,
  CoOwnerLotType,
  CoOwnerMajorityRule,
  CoOwnerMeetingStatus,
  CoOwnerResolution,
  CoOwnerTransactionType
} from '../../services/coowner-portal-service';

/**
 * Libellés du portail copropriétaire.
 *
 * Des fonctions, pas des tables au niveau du module : `t()` ne réagit pas au
 * changement de langue (i18n/t.ts), un dictionnaire construit à l'import
 * resterait figé dans la langue du premier chargement.
 */

export function lotTypeLabel(type: CoOwnerLotType | string): string {
  switch (type) {
    case 'APARTMENT':
      return t('Appartement');
    case 'PARKING':
      return t('Parking');
    case 'CELLAR':
      return t('Cave');
    case 'OFFICE':
      return t('Bureau');
    case 'COMMERCIAL':
      return t('Commerce');
    default:
      return t('Autre');
  }
}

/**
 * Sens d'un solde de compte de lot. Même convention que l'écran gestionnaire
 * (`SyndicOwnerAccount.tsx`) : le montant est toujours affiché en valeur
 * absolue, le sens se lit dans la mention.
 */
export function balanceDirectionLabel(direction: BalanceDirection): string {
  switch (direction) {
    case 'DEBITEUR':
      return t('Débiteur');
    case 'CREDITEUR':
      return t('Créditeur');
    default:
      return t('Soldé');
  }
}

export function balanceDirectionHint(direction: BalanceDirection): string {
  switch (direction) {
    case 'DEBITEUR':
      return t('Vous devez ce montant à la copropriété');
    case 'CREDITEUR':
      return t('Vous avez une avance sur ce lot');
    default:
      return t('Compte à jour');
  }
}

export const BalanceDirectionTag: React.FC<{ direction: BalanceDirection }> = ({ direction }) => (
  <Tag color={direction === 'DEBITEUR' ? 'orange' : direction === 'CREDITEUR' ? 'green' : 'default'}>
    {balanceDirectionLabel(direction)}
  </Tag>
);

export const ChargeCallStatusTag: React.FC<{ status: CoOwnerChargeCallStatus }> = ({ status }) => {
  switch (status) {
    case 'PAID':
      return <Tag color="green">{t('Payé')}</Tag>;
    case 'PARTIAL':
      return <Tag color="gold">{t('Partiel')}</Tag>;
    case 'OVERDUE':
      return <Tag color="red">{t('En retard')}</Tag>;
    default:
      return <Tag color="blue">{t('En attente')}</Tag>;
  }
};

export function transactionTypeLabel(type: CoOwnerTransactionType | string): string {
  switch (type) {
    case 'CHARGE_CALL':
      return t('Appel de charges');
    case 'PAYMENT':
      return t('Paiement');
    case 'PENALTY':
      return t('Pénalité');
    case 'WAIVER':
      return t('Remise');
    case 'ADJUSTMENT':
      return t('Ajustement');
    case 'FUND_TRANSFER':
      return t('Transfert de fonds');
    default:
      return type;
  }
}

export function meetingStatusLabel(status: CoOwnerMeetingStatus): string {
  switch (status) {
    case 'PLANNED':
      return t('Planifiée');
    case 'IN_PROGRESS':
      return t('En cours');
    case 'COMPLETED':
      return t('Clôturée');
    default:
      return t('Annulée');
  }
}

export function meetingTypeLabel(type: string): string {
  return type === 'EXTRAORDINARY' ? t('Assemblée générale extraordinaire') : t('Assemblée générale ordinaire');
}

export function majorityRuleLabel(rule: CoOwnerMajorityRule): string {
  switch (rule) {
    case 'ARTICLE_25':
      return t('Article 25 — majorité absolue des tantièmes');
    case 'ARTICLE_26':
      return t('Article 26 — double majorité');
    case 'UNANIMITE':
      return t('Unanimité');
    default:
      return t('Article 24 — majorité simple des tantièmes exprimés');
  }
}

export const ResolutionResultTag: React.FC<{ result: CoOwnerResolution['result'] }> = ({ result }) => {
  switch (result) {
    case 'APPROVED':
      return <Tag color="green">{t('Adoptée')}</Tag>;
    case 'REJECTED':
      return <Tag color="red">{t('Rejetée')}</Tag>;
    case 'DEFERRED':
      return <Tag>{t('Reportée')}</Tag>;
    default:
      return <Tag>{t('Sans vote')}</Tag>;
  }
};

export function voteLabel(vote: 'FOR' | 'AGAINST' | 'ABSTAIN'): string {
  switch (vote) {
    case 'FOR':
      return t('Pour');
    case 'AGAINST':
      return t('Contre');
    default:
      return t('Abstention');
  }
}

export function documentTypeLabel(type: string): string {
  return type === 'REGULATION' ? t('Règlement de copropriété') : t("Procès-verbal d'assemblée générale");
}
