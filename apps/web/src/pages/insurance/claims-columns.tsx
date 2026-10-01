import React from 'react';
import { Link } from 'react-router-dom';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DataCard } from '../../components/primitives';
import {
  causeLabel,
  claimStatusColor,
  claimStatusLabel,
  formatAmount,
  formatDay
} from '../../components/insurance/insurance-labels';
import type { InsuranceClaimDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';

/** Colonnes du tableau et carte mobile de la page Sinistres. */

const resteAcharge = (claim: InsuranceClaimDto) =>
  claim.outOfPocketAmount === null ? '—' : formatAmount(claim.outOfPocketAmount, claim.currency);

function StatutTag({ status }: { status: string }) {
  return <Tag color={claimStatusColor(status)}>{claimStatusLabel(status)}</Tag>;
}

function BienLien({ claim, tenantId }: { claim: InsuranceClaimDto; tenantId: string }) {
  const libelle = claim.propertyReference || t('Bien');
  return <Link to={`/tenant/${tenantId}/properties/${claim.propertyId}`}>{libelle}</Link>;
}

export function claimColumns(tenantId: string): ColumnsType<InsuranceClaimDto> {
  return [
    { title: t('Bien'), key: 'bien', render: (_, c) => <BienLien claim={c} tenantId={tenantId} /> },
    { title: t('Police'), dataIndex: 'policyLabel', key: 'police' },
    { title: t('Cause'), key: 'cause', render: (_, c) => causeLabel(c.cause) },
    { title: t('Date du sinistre'), key: 'date', render: (_, c) => formatDay(c.occurredAt) },
    { title: t('Statut'), key: 'statut', render: (_, c) => <StatutTag status={c.status} /> },
    {
      title: t('Montant réclamé'),
      key: 'reclame',
      align: 'end',
      render: (_, c) => formatAmount(c.claimedAmount, c.currency)
    },
    {
      title: t('Indemnisé'),
      key: 'indemnise',
      align: 'end',
      render: (_, c) => formatAmount(c.indemnifiedAmount, c.currency)
    },
    { title: t('Reste à charge'), key: 'reste', align: 'end', render: (_, c) => resteAcharge(c) }
  ];
}

export function ClaimCard({ claim }: { claim: InsuranceClaimDto }) {
  return (
    <DataCard
      title={causeLabel(claim.cause)}
      aria-label={`${causeLabel(claim.cause)}, ${claim.propertyReference ?? ''}`}
      subtitle={claim.propertyReference || claim.policyLabel}
      status={<StatutTag status={claim.status} />}
      fields={[
        { label: t('Police'), value: claim.policyLabel },
        { label: t('Date du sinistre'), value: formatDay(claim.occurredAt) },
        { label: t('Montant réclamé'), value: formatAmount(claim.claimedAmount, claim.currency) },
        { label: t('Indemnisé'), value: formatAmount(claim.indemnifiedAmount, claim.currency) },
        { label: t('Reste à charge'), value: resteAcharge(claim) }
      ]}
    />
  );
}
