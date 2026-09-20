import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Button, Card, Tag, Tabs, Select, Descriptions, Space, Row, Col, Spin, Alert, Typography } from 'antd';
import {
  EditOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  CalendarOutlined,
  DollarOutlined,
  CreditCardOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { getLease, RentalLease, RentalLeaseStatus, updateLeaseStatus } from '../../services/rental-service';
import { getContact } from '../../services/crm-service';
import { PropertyTransactionMode } from '../../types/property-types';
import { Installments } from './Installments';
import { Payments } from './Payments';
import { Penalties } from './Penalties';
import { Deposits } from './Deposits';
import { Documents } from './Documents';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

export const LeaseDetailPage: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, leaseId } = useParams<{ tenantId: string; leaseId: string }>();
  const navigate = useNavigate();
  const [lease, setLease] = useState<RentalLease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactNameById, setContactNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tenantId && leaseId) {
      loadLease();
    }
  }, [tenantId, leaseId]);

  useEffect(() => {
    const loadMissingContactNames = async () => {
      if (!tenantId || !lease) return;

      const candidates = [
        { id: lease.primaryRenter?.crmContactId, currentName: lease.primaryRenter?.user?.fullName },
        { id: lease.ownerClient?.crmContactId, currentName: lease.ownerClient?.user?.fullName }
      ]
        .filter(item => Boolean(item.id))
        .filter(item => !item.currentName?.trim())
        .filter(item => !contactNameById[item.id as string])
        .map(item => ({ id: item.id as string }));

      if (candidates.length === 0) return;

      const entries = await Promise.all(
        candidates.map(async ({ id }) => {
          try {
            const response = await getContact(tenantId, id);
            const firstName = response.data?.firstName?.trim() || '';
            const lastName = response.data?.lastName?.trim() || '';
            const fullName = `${firstName} ${lastName}`.trim();
            return [id, fullName || 'Contact'] as const;
          } catch {
            return [id, 'Contact'] as const;
          }
        })
      );

      setContactNameById(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    };

    loadMissingContactNames();
  }, [tenantId, lease, contactNameById]);

  const loadLease = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getLease(tenantId, leaseId);
      if (response.success) {
        setLease(response.data);
      } else {
        setError(translate('Erreur lors du chargement du bail'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || translate('Erreur lors du chargement du bail'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: RentalLeaseStatus) => {
    if (!tenantId || !leaseId) return;
    try {
      await updateLeaseStatus(tenantId, leaseId, newStatus);
      message.success(translate('Statut mis à jour avec succès'));
      loadLease();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || translate('Erreur lors de la mise à jour du statut');
      setError(errorMsg);
      message.error(errorMsg);
    }
  };

  const getStatusTag = (status: RentalLeaseStatus) => {
    const statusMap: Record<RentalLeaseStatus, { label: string; color: string }> = {
      DRAFT: { label: translate('Brouillon'), color: 'default' },
      ACTIVE: { label: translate('Actif'), color: 'success' },
      SUSPENDED: { label: translate('Suspendu'), color: 'warning' },
      ENDED: { label: translate('Terminé'), color: 'default' },
      CANCELED: { label: translate('Annulé'), color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(activeLocale());
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const formatPenaltyRate = (rate: number | string | null | undefined): string => {
    // Convert to number if it's a string or handle null/undefined
    if (rate === null || rate === undefined) {
      return '0.00';
    }

    const numRate = typeof rate === 'string' ? parseFloat(rate) : Number(rate);

    // Check if it's a valid number
    if (isNaN(numRate)) {
      return '0.00';
    }

    // The rate can be stored either as:
    // - A decimal (0.05 for 5%) - need to multiply by 100
    // - A percentage (5 for 5%) - use as is
    // We check: if rate < 1, it's a decimal, otherwise it's already a percentage
    if (numRate < 1) {
      // Stored as decimal (0.05), convert to percentage
      return (numRate * 100).toFixed(2);
    } else {
      // Already stored as percentage (5), use as is
      return numRate.toFixed(2);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" tip="Chargement..." />
        </div>
      </>
    );
  }

  if (error || !lease) {
    return (
      <>
        <Alert
          message={translate('Erreur')}
          description={error || translate('Bail non trouvé')}
          type="error"
          showIcon
          style={{ margin: '24px' }}
        />
      </>
    );
  }

  const modes = lease.property?.transactionModes ?? [];
  const isSaleOnly =
    modes.includes(PropertyTransactionMode.SALE) &&
    !modes.includes(PropertyTransactionMode.RENTAL) &&
    !modes.includes(PropertyTransactionMode.SHORT_TERM);
  const renterDisplayName =
    lease.primaryRenter?.user?.fullName?.trim() ||
    (lease.primaryRenter?.crmContactId ? contactNameById[lease.primaryRenter.crmContactId] : '') ||
    '-';
  const ownerDisplayName =
    lease.ownerClient?.user?.fullName?.trim() ||
    (lease.ownerClient?.crmContactId ? contactNameById[lease.ownerClient.crmContactId] : '') ||
    '-';

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="middle">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${tenantId}/rental/leases`)}>
                {translate('Retour')}
              </Button>
              <div>
                <Title level={2} style={{ margin: 0 }}>
                  {translate('Bail')} {lease.lease_number}
                </Title>
                <Text type="secondary">{translate('Détails du bail de location')}</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Select
                value={lease.status}
                onChange={value => handleStatusChange(value as RentalLeaseStatus)}
                style={{ width: 180 }}
              >
                <Select.Option value="DRAFT">{translate('Brouillon')}</Select.Option>
                <Select.Option value="ACTIVE">{translate('Actif')}</Select.Option>
                <Select.Option value="SUSPENDED">{translate('Suspendu')}</Select.Option>
                <Select.Option value="ENDED">{translate('Terminé')}</Select.Option>
                <Select.Option value="CANCELED">{translate('Annulé')}</Select.Option>
              </Select>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => navigate(`/tenant/${tenantId}/rental/leases/${leaseId}/edit`)}
              >
                {translate('Modifier')}
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <FileTextOutlined />
                  <span>{translate('Informations générales')}</span>
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={translate('Numéro de bail')}>{lease.lease_number}</Descriptions.Item>
                <Descriptions.Item label={translate('Statut')}>{getStatusTag(lease.status)}</Descriptions.Item>
                <Descriptions.Item label={translate('Propriété')}>
                  {lease.property?.internalReference || '-'}
                  {lease.property?.title && ` - ${lease.property.title}`}
                  {lease.property?.address && ` - ${lease.property.address}`}
                </Descriptions.Item>
                <Descriptions.Item label={translate('Locataire principal')}>
                  {lease.primaryRenter?.crmContactId ? (
                    <Button
                      type="link"
                      onClick={() =>
                        navigate(`/tenant/${tenantId}/crm/contacts/${lease.primaryRenter?.crmContactId}/edit`)
                      }
                      style={{ padding: 0 }}
                    >
                      {renterDisplayName}
                    </Button>
                  ) : (
                    <span>{renterDisplayName}</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={translate('Propriétaire')}>
                  {lease.ownerClient ? (
                    lease.ownerClient.crmContactId ? (
                      <Button
                        type="link"
                        onClick={() =>
                          navigate(`/tenant/${tenantId}/crm/contacts/${lease.ownerClient?.crmContactId}/edit`)
                        }
                        style={{ padding: 0 }}
                      >
                        {ownerDisplayName}
                      </Button>
                    ) : (
                      <span>{ownerDisplayName}</span>
                    )
                  ) : (
                    <Text type="secondary">{translate('Non renseigné')}</Text>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <CalendarOutlined />
                  <span>{translate('Dates')}</span>
                </Space>
              }
            >
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label={translate('Date de début')}>{formatDate(lease.start_date)}</Descriptions.Item>
                <Descriptions.Item label={translate('Date de fin')}>{formatDate(lease.end_date)}</Descriptions.Item>
                <Descriptions.Item label={translate("Date d'emménagement")}>
                  {formatDate(lease.move_in_date)}
                </Descriptions.Item>
                <Descriptions.Item label={translate('Date de déménagement')}>
                  {formatDate(lease.move_out_date)}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>

          {!isSaleOnly && (
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space>
                    <DollarOutlined />
                    <span>{translate('Financier')}</span>
                  </Space>
                }
              >
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={translate('Loyer')}>
                    {formatCurrency(lease.rent_amount, lease.currency)}
                  </Descriptions.Item>
                  <Descriptions.Item label={translate('Charges de service')}>
                    {formatCurrency(lease.service_charge_amount, lease.currency)}
                  </Descriptions.Item>
                  <Descriptions.Item label={translate('Dépôt de garantie')}>
                    {formatCurrency(lease.security_deposit_amount, lease.currency)}
                  </Descriptions.Item>
                  <Descriptions.Item label={translate('Fréquence de facturation')}>
                    {lease.billing_frequency === 'MONTHLY' && translate('Mensuel')}
                    {lease.billing_frequency === 'QUARTERLY' && translate('Trimestriel')}
                    {lease.billing_frequency === 'SEMIANNUAL' && translate('Semestriel')}
                    {lease.billing_frequency === 'ANNUAL' && translate('Annuel')}
                  </Descriptions.Item>
                  <Descriptions.Item label={translate("Jour d'échéance")}>
                    {translate('Le')} {lease.due_day_of_month} de chaque mois
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
          )}

          {!isSaleOnly && (
            <Col xs={24} md={12}>
              <Card
                title={
                  <Space>
                    <SafetyOutlined />
                    <span>{translate('Pénalités de retard')}</span>
                  </Space>
                }
              >
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label={translate('Jours de grâce')}>
                    {lease.penalty_grace_days > 0 ? (
                      <>
                        {lease.penalty_grace_days} jour{lease.penalty_grace_days > 1 ? 's' : ''}
                        <br />
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {translate('Les pénalités seront appliquées après')} {lease.penalty_grace_days} jour
                          {lease.penalty_grace_days > 1 ? 's' : ''} de retard
                        </Text>
                      </>
                    ) : (
                      translate('Aucun')
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label={translate('Mode de pénalité')}>
                    {lease.penalty_mode === 'PERCENT_OF_BALANCE' && translate('Pourcentage du solde')}
                    {lease.penalty_mode === 'FIXED_AMOUNT' && translate('Montant fixe')}
                    {lease.penalty_mode === 'PERCENT_OF_RENT' && translate('Pourcentage du loyer')}
                  </Descriptions.Item>
                  {lease.penalty_mode === 'PERCENT_OF_BALANCE' && (
                    <>
                      <Descriptions.Item label={translate('Taux de pénalité')}>
                        {formatPenaltyRate(lease.penalty_rate)}%
                        <br />
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {translate('Appliqué sur le solde impayé')}
                        </Text>
                      </Descriptions.Item>
                      {lease.penalty_cap_amount && lease.penalty_cap_amount > 0 && (
                        <Descriptions.Item label={translate('Montant maximum de pénalité')}>
                          {formatCurrency(lease.penalty_cap_amount, lease.currency)}
                          <br />
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {translate('La pénalité ne dépassera pas ce montant')}
                          </Text>
                        </Descriptions.Item>
                      )}
                    </>
                  )}
                  {lease.penalty_mode === 'FIXED_AMOUNT' && (
                    <Descriptions.Item label={translate('Montant fixe de pénalité')}>
                      {formatCurrency(lease.penalty_fixed_amount, lease.currency)}
                      <br />
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {translate('Montant fixe appliqué par période de retard')}
                      </Text>
                    </Descriptions.Item>
                  )}
                  {lease.penalty_mode === 'PERCENT_OF_RENT' && (
                    <>
                      <Descriptions.Item label={translate('Taux de pénalité')}>
                        {formatPenaltyRate(lease.penalty_rate)}%
                        <br />
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {translate('Appliqué sur le montant du loyer')}
                        </Text>
                      </Descriptions.Item>
                      {lease.penalty_cap_amount && lease.penalty_cap_amount > 0 && (
                        <Descriptions.Item label={translate('Montant maximum de pénalité')}>
                          {formatCurrency(lease.penalty_cap_amount, lease.currency)}
                        </Descriptions.Item>
                      )}
                    </>
                  )}
                </Descriptions>
              </Card>
            </Col>
          )}

          {lease.notes && (
            <Col xs={24}>
              <Card title={translate('Notes')}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{lease.notes}</Text>
              </Card>
            </Col>
          )}
        </Row>

        <Card>
          {(() => {
            const allTabItems = [
              {
                key: 'installments',
                label: (
                  <span>
                    <CalendarOutlined />
                    {translate('Échéances')}
                  </span>
                ),
                children: <Installments leaseId={leaseId} />
              },
              {
                key: 'payments',
                label: (
                  <span>
                    <CreditCardOutlined />
                    {translate('Paiements')}
                  </span>
                ),
                children: <Payments leaseId={leaseId} />
              },
              {
                key: 'penalties',
                label: (
                  <span>
                    <DollarOutlined />
                    {translate('Pénalités')}
                  </span>
                ),
                children: <Penalties leaseId={leaseId} />
              },
              {
                key: 'deposit',
                label: (
                  <span>
                    <SafetyOutlined />
                    {translate('Dépôt de garantie')}
                  </span>
                ),
                children: <Deposits leaseId={leaseId} />
              },
              {
                key: 'documents',
                label: (
                  <span>
                    <FileTextOutlined />
                    {translate('Documents')}
                  </span>
                ),
                children: <Documents leaseId={leaseId} />
              }
            ];

            const tabItems = isSaleOnly ? allTabItems.filter(t => t.key === 'documents') : allTabItems;

            return (
              <Tabs
                defaultActiveKey={isSaleOnly ? 'documents' : 'installments'}
                type="line"
                size="large"
                items={tabItems}
              />
            );
          })()}
        </Card>
      </Space>
    </>
  );
};
