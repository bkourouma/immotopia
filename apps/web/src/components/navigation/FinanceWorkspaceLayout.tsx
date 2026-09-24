import React from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLayout } from './WorkspaceLayout';
import { FINANCE_WORKSPACES, financeWorkspaceTabs } from '../../navigation/finance-workspaces';
import type { FinanceWorkspaceFamily } from '../../navigation/finance-workspaces';
import { t } from '../../i18n/t';

/**
 * `<FinanceWorkspaceLayout>` — route de layout des espaces à onglets de la
 * finance (Caisse et trésorerie, Facturation et balances, Suivi des
 * chantiers…). Même rendu que le syndic, via `<WorkspaceLayout>`.
 *
 * Aucun appel réseau : l'en-tête ne dit que la famille d'écrans, connue
 * statiquement. Les onglets viennent de `navigation/finance-workspaces.tsx`,
 * la source dont la sidebar tire aussi ses `activeFor`.
 */

export interface FinanceWorkspaceLayoutProps {
  family: FinanceWorkspaceFamily;
}

export const FinanceWorkspaceLayout: React.FC<FinanceWorkspaceLayoutProps> = ({ family }) => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const label = FINANCE_WORKSPACES[family].label();
  const tabs = tenantId ? financeWorkspaceTabs(family, tenantId) : [];

  return <WorkspaceLayout eyebrow={t('Finance')} title={label} tabs={tabs} tabsLabel={label} />;
};
