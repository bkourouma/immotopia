import React from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLayout } from './WorkspaceLayout';
import {
  FINANCE_WORKSPACES,
  filterWorkspaceTabsByAccess,
  financeWorkspaceTabs
} from '../../navigation/finance-workspaces';
import { CORE_ONLY_ACCESS, useFeatureAccessState } from '../../hooks/useMenuAccess';
import type { FinanceWorkspaceFamily } from '../../navigation/finance-workspaces';
import { t } from '../../i18n/t';

/**
 * `<FinanceWorkspaceLayout>` — route de layout des espaces à onglets de la
 * finance (Caisse et trésorerie, Facturation et balances, Suivi des
 * chantiers…). Même rendu que le syndic, via `<WorkspaceLayout>`.
 *
 * L'en-tête ne dit que la famille d'écrans, connue statiquement ; seul le
 * filtrage des onglets par l'abonnement lit les droits de l'agence (socle seul
 * pendant la lecture, tout visible si elle échoue). Les onglets viennent de `navigation/finance-workspaces.tsx`,
 * la source dont la sidebar tire aussi ses `activeFor`.
 */

export interface FinanceWorkspaceLayoutProps {
  family: FinanceWorkspaceFamily;
}

export const FinanceWorkspaceLayout: React.FC<FinanceWorkspaceLayoutProps> = ({ family }) => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const label = FINANCE_WORKSPACES[family].label();
  const { access, loading } = useFeatureAccessState(tenantId, true);
  const tabs = tenantId
    ? filterWorkspaceTabsByAccess(financeWorkspaceTabs(family, tenantId), loading ? CORE_ONLY_ACCESS : access)
    : [];

  return <WorkspaceLayout eyebrow={t('Finance')} title={label} tabs={tabs} tabsLabel={label} />;
};
