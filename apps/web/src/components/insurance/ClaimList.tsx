import React from 'react';
import { Alert, Button, List, Space, Tag, Typography } from 'antd';
import type { InsuranceClaimDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';
import { ListSearch } from '../primitives/ListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { ClaimStatusTimeline } from './ClaimStatusTimeline';
import { PROPERTY_CLAIMS_API_LIMIT } from './claim-limits';
import {
  CLAIM_STATUS_VALUES,
  causeLabel,
  claimStatusColor,
  claimStatusLabel,
  formatAmount,
  formatDay,
  options
} from './insurance-labels';

interface Props {
  claims: InsuranceClaimDto[];
  onOpen: (claimId: string) => void;
}

/**
 * Au-delà de ce nombre de sinistres pour un même bien, la liste reçoit sa barre
 * de recherche (locale : l'API renvoie tous les sinistres du bien, 200 au plus)
 * et se pagine. En deçà, la barre n'apporterait que du bruit.
 */
export const CLAIMS_SEARCH_THRESHOLD = 10;

// Constantes de module : l'identité stable garde le filtrage mémoïsé.
const TEXTE_RECHERCHE = [
  (claim: InsuranceClaimDto) => causeLabel(claim.cause),
  (claim: InsuranceClaimDto) => claimStatusLabel(claim.status),
  (claim: InsuranceClaimDto) => claim.policyLabel,
  (claim: InsuranceClaimDto) => claim.description
];
const ACCESSEURS = {
  status: (claim: InsuranceClaimDto) => claim.status,
  period: (claim: InsuranceClaimDto) => claim.occurredAt,
  amount: (claim: InsuranceClaimDto) => claim.claimedAmount
};

function ClaimItem({ claim, onOpen }: { claim: InsuranceClaimDto; onOpen: (claimId: string) => void }) {
  return (
    <List.Item
      key={claim.id}
      actions={[
        <Button key="open" type="link" onClick={() => onOpen(claim.id)}>
          {t('Détail')}
        </Button>
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space wrap>
          <Typography.Text strong>{causeLabel(claim.cause)}</Typography.Text>
          <Tag color={claimStatusColor(claim.status)}>{claimStatusLabel(claim.status)}</Tag>
          <Typography.Text type="secondary">
            {formatDay(claim.occurredAt)} · {claim.policyLabel} · {formatAmount(claim.claimedAmount, claim.currency)}
          </Typography.Text>
        </Space>
        <ClaimStatusTimeline status={claim.status} rejectedAt={claim.rejectedAt} />
      </Space>
    </List.Item>
  );
}

/** Variante avec barre de recherche locale (préfixe d'URL `sin`) : plus de 10 sinistres. */
const SearchableClaimList: React.FC<Props> = ({ claims, onOpen }) => {
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Cause, statut, police, description…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: options(CLAIM_STATUS_VALUES, claimStatusLabel)
    },
    { key: 'period', type: 'dateRange', label: t('Date du sinistre'), primary: true },
    { key: 'amount', type: 'numberRange', label: t('Montant réclamé') }
  ];
  const local = useLocalListSearch<InsuranceClaimDto>(claims, {
    paramPrefix: 'sin',
    ariaLabel: t('Rechercher dans les sinistres'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  return (
    <>
      <ListSearch {...local.searchProps} />
      <List
        dataSource={local.filtered}
        locale={{ emptyText: t('Aucun élément ne correspond aux filtres appliqués.') }}
        pagination={{
          current: local.page,
          pageSize: local.pageSize,
          total: local.total,
          hideOnSinglePage: true,
          showSizeChanger: false,
          onChange: page => local.setPage(page)
        }}
        renderItem={claim => <ClaimItem claim={claim} onOpen={onOpen} />}
      />
    </>
  );
};

/** Sinistres d'un bien : cause, statut, montant réclamé et frise des statuts. */
export const ClaimList: React.FC<Props> = ({ claims, onOpen }) => (
  <>
    {claims.length >= PROPERTY_CLAIMS_API_LIMIT && (
      <Alert
        type="warning"
        showIcon
        style={{ marginBlockEnd: 16 }}
        message={t(
          'La liste est limitée aux {{limit}} sinistres les plus récents : d’autres existent. Affinez avec la recherche ou les filtres.',
          { limit: PROPERTY_CLAIMS_API_LIMIT }
        )}
      />
    )}
    {claims.length > CLAIMS_SEARCH_THRESHOLD ? (
      <SearchableClaimList claims={claims} onOpen={onOpen} />
    ) : (
      <List dataSource={claims} renderItem={claim => <ClaimItem claim={claim} onOpen={onOpen} />} />
    )}
  </>
);
