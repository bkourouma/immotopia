import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Empty, List, Space, Spin, Tooltip, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { getLease } from '../../../services/rental-service';
import { CreditorDto, listCreditors, listMandates, MandateDto } from '../../../services/direct-debit-service';
import { formatMoney } from '../../primitives';
import { MandateActions } from './MandateActions';
import { DebtorOption, MandateFormModal } from './MandateFormModal';
import { apiErrorMessage, formatDate, MandateStatusTag } from './direct-debit-shared';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface LeaseDirectDebitPanelProps {
  tenantId: string;
  leaseId: string;
}

/** Le nom affichable d'une partie : `displayName` résolu par l'API, sinon le compte utilisateur. */
interface LeaseParty {
  id?: string;
  displayName?: string | null;
  user?: { fullName?: string | null } | null;
}

interface LeaseWithParties {
  primaryRenter?: LeaseParty | null;
  primary_renter_client_id?: string;
  coRenters?: Array<{ renter_client_id?: string; renterClient?: LeaseParty | null }>;
}

function partyName(party: LeaseParty | null | undefined): string {
  return party?.displayName?.trim() || party?.user?.fullName?.trim() || '';
}

/** Débiteurs possibles : locataire principal et colocataires du bail. */
export function debtorOptionsFromLease(lease: LeaseWithParties | null | undefined): DebtorOption[] {
  if (!lease) return [];
  const options: DebtorOption[] = [];
  const primaryId = lease.primaryRenter?.id ?? lease.primary_renter_client_id;
  if (primaryId) {
    options.push({
      id: primaryId,
      label: `${partyName(lease.primaryRenter) || t('Locataire principal')} (${t('locataire principal')})`
    });
  }
  for (const coRenter of lease.coRenters ?? []) {
    const id = coRenter.renterClient?.id ?? coRenter.renter_client_id;
    if (!id || options.some(option => option.id === id)) continue;
    options.push({ id, label: `${partyName(coRenter.renterClient) || t('Colocataire')} (${t('colocataire')})` });
  }
  return options;
}

/**
 * Onglet « Prélèvements » de la fiche du bail (spec 042, PB2) : mandats du
 * bail, création et actions par statut.
 */
export const LeaseDirectDebitPanel: React.FC<LeaseDirectDebitPanelProps> = ({ tenantId, leaseId }) => {
  const { modal } = App.useApp();
  const [mandates, setMandates] = useState<MandateDto[] | null>(null);
  const [creditors, setCreditors] = useState<CreditorDto[]>([]);
  const [debtors, setDebtors] = useState<DebtorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, creditorList, leaseResponse] = await Promise.all([
        listMandates(tenantId, { leaseId, pageSize: 100 }),
        listCreditors(tenantId),
        getLease(tenantId, leaseId).catch(() => null)
      ]);
      setMandates(list.items);
      setCreditors(creditorList);
      setDebtors(debtorOptionsFromLease(leaseResponse?.success ? (leaseResponse.data as LeaseWithParties) : null));
    } catch (err) {
      setError(apiErrorMessage(err, t('Erreur lors du chargement des mandats de prélèvement')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, leaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replaceMandate = (updated: MandateDto) =>
    setMandates(previous => (previous ?? []).map(mandate => (mandate.id === updated.id ? updated : mandate)));

  const handleCreated = (mandate: MandateDto, warnings: string[]) => {
    setFormOpen(false);
    setMandates(previous => [mandate, ...(previous ?? [])]);
    if (warnings.length > 0) {
      modal.warning({
        title: t('Mandat créé, avec des avertissements'),
        content: (
          <ul style={{ paddingInlineStart: 20, margin: 0 }}>
            {warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ),
        okText: t('Compris')
      });
    }
  };

  const hasOpenMandate = useMemo(() => (mandates ?? []).some(mandate => mandate.status !== 'REVOKED'), [mandates]);

  const openMandateMessage = t(
    'Un mandat ouvert existe déjà : pour changer de compte bancaire, révoquez-le puis créez-en un nouveau.'
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message={error}
        action={
          <Button size="small" onClick={() => void load()}>
            {t('Réessayer')}
          </Button>
        }
      />
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Text type="secondary">
          {t("Le locataire autorise l'agence à prélever son loyer sur son compte bancaire.")}
        </Text>
        {/* Le <span> reçoit le survol : un bouton désactivé n'émet pas d'événement souris. */}
        <Tooltip title={hasOpenMandate ? openMandateMessage : undefined}>
          <span style={{ display: 'inline-block' }}>
            <Button type="primary" icon={<PlusOutlined />} disabled={hasOpenMandate} onClick={() => setFormOpen(true)}>
              {t('Nouveau mandat de prélèvement')}
            </Button>
          </span>
        </Tooltip>
      </Space>

      {hasOpenMandate && <Alert type="info" showIcon message={openMandateMessage} />}

      {(mandates ?? []).length === 0 ? (
        <Empty description={t('Aucun mandat de prélèvement pour ce bail')} />
      ) : (
        <List
          dataSource={mandates ?? []}
          renderItem={mandate => (
            <List.Item key={mandate.id} style={{ display: 'block' }}>
              <Card
                size="small"
                title={
                  <Space wrap>
                    <Text strong>{mandate.reference}</Text>
                    <MandateStatusTag status={mandate.status} />
                  </Space>
                }
              >
                <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }}>
                  <Descriptions.Item label={t('Débiteur')}>{mandate.debtor.displayName ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label={t('IBAN')}>
                    <bdi dir="ltr">{mandate.ibanMasked}</bdi>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Code banque')}>{mandate.bankCode}</Descriptions.Item>
                  <Descriptions.Item label={t('Titulaire')}>{mandate.holderName}</Descriptions.Item>
                  <Descriptions.Item label={t('Créancier')}>{mandate.creditor.label}</Descriptions.Item>
                  <Descriptions.Item label={t('Plafond')}>
                    {mandate.maxAmount != null ? formatMoney(mandate.maxAmount) : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Jour de collecte')}>{mandate.effectiveCollectionDay}</Descriptions.Item>
                  <Descriptions.Item label={t('Signé le')}>{formatDate(mandate.signedAt)}</Descriptions.Item>
                  <Descriptions.Item label={t('Rejets consécutifs')}>{mandate.consecutiveRejects}</Descriptions.Item>
                  {mandate.suspensionReason && mandate.status === 'SUSPENDED' && (
                    <Descriptions.Item label={t('Motif de suspension')}>{mandate.suspensionReason}</Descriptions.Item>
                  )}
                  {mandate.revocationReason && mandate.status === 'REVOKED' && (
                    <Descriptions.Item label={t('Motif de révocation')}>{mandate.revocationReason}</Descriptions.Item>
                  )}
                </Descriptions>
                <div style={{ marginBlockStart: 12 }}>
                  <MandateActions tenantId={tenantId} mandate={mandate} onChanged={replaceMandate} />
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <MandateFormModal
        tenantId={tenantId}
        leaseId={leaseId}
        open={formOpen}
        creditors={creditors}
        debtors={debtors}
        onClose={() => setFormOpen(false)}
        onCreated={handleCreated}
      />
    </Space>
  );
};
