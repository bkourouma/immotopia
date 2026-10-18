import React from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceTabs } from '../../navigation/WorkspaceTabs';
import { t } from '../../../i18n/t';

/**
 * Onglets « Mandats » et « Remises » de Location › Prélèvements (spec 042, P2,
 * §7.10). Deux routes réelles : l'onglet actif suit l'adresse (préfixe le plus
 * long), donc le détail d'une remise allume « Remises ».
 */
export const DirectDebitTabs: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const root = `/tenant/${tenantId}/rental/direct-debit`;
  return (
    <WorkspaceTabs
      ariaLabel={t('Prélèvements')}
      className="mb-4"
      items={[
        { key: 'mandates', label: t('Mandats'), href: root },
        { key: 'remittances', label: t('Remises'), href: `${root}/remittances` }
      ]}
    />
  );
};
