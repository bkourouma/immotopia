import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Button,
  Space,
  Select,
  DatePicker,
  Statistic,
  Modal,
  Descriptions,
  Empty,
  Tabs,
  Collapse
} from 'antd';
import { DollarOutlined, CalendarOutlined, EyeOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalService } from '../../services/tenantPortalService';
import InstallmentDetails from '../../components/TenantPortal/InstallmentDetails';
import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';
import dayjs from 'dayjs';
import { useAuth } from '../../hooks/useAuth';
import { getMyStatement } from '../../services/finance-service';
import type { ThirdPartyMovementLine } from '../../types/finance-types';
import { natureLabel } from '../finance/Releve';
import { MoneyValue, StateBlock, SkeletonTable } from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface InstallmentItem {
  id: string;
  period: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
  items: any[];
  payments: any[];
}

interface InstallmentsData {
  installments: InstallmentItem[];
  summary: {
    total: number;
    paid: number;
    due: number;
    overdue: number;
    partial: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Onglet « Mon relevé » — Récit 6 du spec, tâche 1.15 du plan.
 *
 * Le même document que celui que verrait la gestionnaire pour ce compte
 * (`pages/finance/Releve.tsx`), mais en LECTURE SEULE : aucun bouton
 * d'impression, aucune action, et surtout aucun moyen d'atteindre le compte
 * d'un autre locataire — `getMyStatement` ne prend aucun identifiant de
 * compte, la session résout seule le locataire. `tenantClient` ne sert ici
 * qu'à distinguer un profil non encore relié à un bail (état vide).
 *
 * `natureLabel` est réimporté de l'écran agence plutôt que redéfini ici :
 * les deux surfaces doivent afficher exactement le même vocabulaire (P-1), et
 * une seule table de correspondance ne peut pas diverger d'elle-même.
 */
function MonReleve() {
  const { tenantClient } = useAuth();
  const tenantId = tenantClient?.tenantId;

  // Aucun identifiant de compte n'est passe ici, et c'est deliberé : la route
  // du portail resout le locataire depuis sa session. Le compte de tiers
  // porte son propre identifiant, distinct de celui du `TenantClient` ; les
  // confondre ne trouverait rien, et exposer l'un ou l'autre a l'ecran
  // ouvrirait la porte au releve du voisin.
  const {
    data: releve,
    isPending,
    error,
    refetch
  } = useQuery({
    queryKey: ['account-statement', 'portail', tenantId],
    queryFn: () => getMyStatement(),
    enabled: Boolean(tenantId)
  });

  if (!tenantId) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucun compte rattaché')}
        description={t("Votre profil n'est pas encore relié à un compte locataire.")}
      />
    );
  }

  if (isPending) {
    return <SkeletonTable rows={6} columns={6} aria-label={t('Relevé en cours de chargement')} />;
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger votre relevé.')}
        actions={[{ label: t('Réessayer'), onClick: () => void refetch(), primary: true }]}
      />
    );
  }

  const mouvements = releve?.movements ?? [];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label={t('Compte')}>{releve?.label}</Descriptions.Item>
          <Descriptions.Item label={t("Solde d'ouverture")}>
            <MoneyValue value={releve?.openingBalance} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Solde de clôture')}>
            <MoneyValue value={releve?.closingBalance} />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {mouvements.length === 0 ? (
        <Empty description={t('Aucun mouvement enregistré.')} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table
            rowKey="id"
            dataSource={mouvements}
            pagination={false}
            scroll={{ x: 800 }}
            columns={[
              {
                title: t('Date'),
                key: 'date',
                render: (_: unknown, m: ThirdPartyMovementLine) =>
                  new Date(m.movementDate).toLocaleDateString(activeLocale())
              },
              {
                title: t('Nature'),
                key: 'nature',
                render: (_: unknown, m: ThirdPartyMovementLine) => natureLabel(m.type)
              },
              { title: t('Libellé'), dataIndex: 'label', key: 'libelle' },
              {
                title: t('Facturé'),
                key: 'facture',
                align: 'end' as const,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.amountBilled} />
              },
              {
                title: t('Réglé'),
                key: 'regle',
                align: 'end' as const,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.amountSettled} />
              },
              {
                title: t('Solde après'),
                key: 'solde',
                align: 'end' as const,
                render: (_: unknown, m: ThirdPartyMovementLine) => <MoneyValue value={m.balanceAfter} />
              }
            ]}
          />
        </div>
      )}
    </Space>
  );
}

export default function TenantPayments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallmentsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<string | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [declarationModalVisible, setDeclarationModalVisible] = useState(false);
  // Echeance visee quand la declaration est lancee depuis une ligne du tableau.
  const [declarationFor, setDeclarationFor] = useState<InstallmentItem | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  // Payment history state
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [paymentHistoryData, setPaymentHistoryData] = useState<any>(null);
  const [paymentHistoryFilters, setPaymentHistoryFilters] = useState<{
    startDate?: string;
    endDate?: string;
    method?: string;
  }>({});
  const [paymentHistoryPagination, setPaymentHistoryPagination] = useState({ current: 1, pageSize: 20 });

  const loadRef = useRef<{
    loadInstallments: (silencieux?: boolean) => void;
    loadPaymentHistory: (silencieux?: boolean) => void;
  } | null>(null);
  /** Horodatage de la dernière revalidation, pour le délai de garde ci-dessous. */
  const derniereRevalidation = useRef(Date.now());

  /**
   * @param silencieux Revalidation en arrière-plan : la donnée affichée reste
   *   à l'écran, sans repasser par le squelette.
   */
  const loadInstallments = async (silencieux = false) => {
    try {
      if (!silencieux) setLoading(true);
      setError(null);

      const params: any = {
        page: pagination.current,
        limit: pagination.pageSize
      };

      if (statusFilter) {
        params.status = statusFilter;
      }

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await tenantPortalService.getInstallments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des échéances'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des échéances'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY');
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      PAID: { label: t('Payé'), color: 'success' },
      DUE: { label: t('Dû'), color: 'warning' },
      OVERDUE: { label: t('En retard'), color: 'error' },
      PARTIAL: { label: t('Partiel'), color: 'processing' },
      DRAFT: { label: t('Brouillon'), color: 'default' },
      CANCELED: { label: t('Annulé'), color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const handleViewDetails = (installmentId: string) => {
    setSelectedInstallment(installmentId);
    setDetailsModalVisible(true);
  };

  const handleCloseDetails = () => {
    setDetailsModalVisible(false);
    setSelectedInstallment(null);
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };

  /** @param silencieux Voir `loadInstallments`. */
  const loadPaymentHistory = async (silencieux = false) => {
    try {
      if (!silencieux) setPaymentHistoryLoading(true);
      setPaymentHistoryError(null);

      const params: any = {
        page: paymentHistoryPagination.current,
        limit: paymentHistoryPagination.pageSize
      };

      if (paymentHistoryFilters.startDate) {
        params.startDate = paymentHistoryFilters.startDate;
      }
      if (paymentHistoryFilters.endDate) {
        params.endDate = paymentHistoryFilters.endDate;
      }
      if (paymentHistoryFilters.method) {
        params.method = paymentHistoryFilters.method;
      }

      const response = await tenantPortalService.getPaymentHistory(params);
      if (response.data?.success && response.data?.data) {
        setPaymentHistoryData(response.data.data);
      } else {
        setPaymentHistoryError(t("Erreur lors du chargement de l'historique"));
      }
    } catch (err: any) {
      setPaymentHistoryError(err.response?.data?.message || t("Erreur lors du chargement de l'historique"));
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  loadRef.current = { loadInstallments, loadPaymentHistory };

  useEffect(() => {
    loadInstallments();
  }, [statusFilter, dateRange, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadPaymentHistory();
  }, [paymentHistoryFilters, paymentHistoryPagination.current, paymentHistoryPagination.pageSize]);

  /**
   * Retour sur l'onglet : revalidation en arrière-plan (REFONTE_UI_UX.md §8.4).
   *
   * Deux corrections par rapport à l'ancienne version :
   *
   * 1. **Le chargement est silencieux.** Il posait `loading = true`, ce qui
   *    renvoyait l'écran à son squelette à chaque retour d'onglet : la mise en
   *    page sautait et le lecteur perdait sa ligne, pour une donnée qui la
   *    plupart du temps n'avait pas changé.
   * 2. **Un délai de garde.** L'événement se déclenche à chaque va-et-vient
   *    entre onglets ou applications. Sans ce seuil, consulter une notification
   *    et revenir relançait deux requêtes complètes. Trente secondes, la même
   *    fraîcheur que `STALE_TIME.list`.
   */
  useEffect(() => {
    const REVALIDATION_MIN_MS = 30_000;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const maintenant = Date.now();
      if (maintenant - derniereRevalidation.current < REVALIDATION_MIN_MS) return;
      derniereRevalidation.current = maintenant;
      void loadRef.current?.loadInstallments(true);
      void loadRef.current?.loadPaymentHistory(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: t('Espèces'),
      BANK_TRANSFER: t('Virement bancaire'),
      MOBILE_MONEY: t('Mobile Money'),
      CHECK: t('Chèque'),
      CARD: t('Carte bancaire'),
      OTHER: 'Autre'
    };
    return labels[method] || method;
  };

  const handlePaymentHistoryTableChange = (newPagination: any) => {
    setPaymentHistoryPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };

  const columns = [
    {
      title: t('Période'),
      dataIndex: 'period',
      key: 'period',
      width: 110,
      render: (period: string) => <Text strong>{period}</Text>
    },
    {
      title: t("Date d'échéance"),
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 160,
      render: (date: string) => (
        <Space>
          <CalendarOutlined />
          {formatDate(date)}
        </Space>
      ),
      sorter: (a: InstallmentItem, b: InstallmentItem) => dayjs(a.dueDate).unix() - dayjs(b.dueDate).unix()
    },
    {
      title: t('Montant total'),
      dataIndex: 'amount',
      key: 'amount',
      width: 150,
      render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>,
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.amount - b.amount
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      key: 'paid',
      width: 130,
      render: (paid: number) => formatCurrency(paid),
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.paid - b.paid
    },
    {
      title: t('Solde'),
      dataIndex: 'balance',
      key: 'balance',
      width: 140,
      render: (balance: number) => <Text type={balance > 0 ? 'danger' : 'success'}>{formatCurrency(balance)}</Text>,
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.balance - b.balance
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 190,
      render: (_: any, record: InstallmentItem) => (
        <Space>
          {record.balance > 0 && (
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => {
                setDeclarationFor(record);
                setDeclarationModalVisible(true);
              }}
            >
              {t('Payer')}
            </Button>
          )}
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(record.id)}>
            {t('Détails')}
          </Button>
        </Space>
      )
    }
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des échéances...')} />
      </div>
    );
  }

  if (error && !data) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          // Sur un ecran etroit le titre et le bouton se chevauchaient : on
          // autorise le passage a la ligne plutot que la compression.
          flexWrap: 'wrap',
          gap: 16
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Title level={2} style={{ marginBottom: 4 }}>
            {t('Paiements et échéances')}
          </Title>
          <Text type="secondary">{t("Suivez vos échéances et l'historique de vos paiements")}</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setDeclarationFor(null);
            setDeclarationModalVisible(true);
          }}
        >
          {t('Déclarer un paiement')}
        </Button>
      </div>

      {/* Summary Cards (T054) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Total échéances')} value={data.summary.total} prefix={<DollarOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('Payées')}
                value={data.summary.paid}
                valueStyle={{ color: '#3f8600' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('En attente')}
                value={data.summary.due}
                valueStyle={{ color: '#faad14' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={t('En retard')}
                value={data.summary.overdue}
                valueStyle={{ color: '#cf1322' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters (T052, T053) */}
      <Card>
        <div className="it-toolbar__actions">
          <Space>
            <FilterOutlined />
            <Text strong>{t('Filtres :')}</Text>
          </Space>
          <Select
            placeholder={t('Statut')}
            allowClear
            style={{ width: 150 }}
            value={statusFilter}
            onChange={value => setStatusFilter(value)}
          >
            <Select.Option value="PAID">{t('Payé')}</Select.Option>
            <Select.Option value="DUE">{t('Dû')}</Select.Option>
            <Select.Option value="OVERDUE">{t('En retard')}</Select.Option>
            <Select.Option value="PARTIAL">{t('Partiel')}</Select.Option>
            <Select.Option value="DRAFT">{t('Brouillon')}</Select.Option>
          </Select>
          <RangePicker
            placeholder={[t('Date début'), t('Date fin')]}
            value={dateRange}
            onChange={dates => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="DD/MM/YYYY"
          />
          {(statusFilter || dateRange) && (
            <Button
              onClick={() => {
                setStatusFilter(undefined);
                setDateRange(null);
              }}
            >
              {t('Réinitialiser')}
            </Button>
          )}
        </div>
      </Card>

      {/* Tabs for Installments and Payment History */}
      <Tabs
        defaultActiveKey="installments"
        items={[
          {
            key: 'installments',
            label: t('Échéances'),
            children: (
              <Card
                title={
                  <>
                    <DollarOutlined /> {t('Liste des échéances')}
                  </>
                }
              >
                {data && data.installments.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <Table
                      columns={columns}
                      dataSource={data.installments}
                      rowKey="id"
                      loading={loading}
                      size="middle"
                      scroll={{ x: 1000 }}
                      pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: data.pagination.total,
                        showSizeChanger: true,
                        showTotal: total => t('Total: {{total}} échéances', { total: total })
                      }}
                      onChange={handleTableChange}
                    />
                  </div>
                ) : (
                  <Empty description={t('Aucune échéance trouvée')} />
                )}
              </Card>
            )
          },
          {
            key: 'payments',
            label: t('Historique des paiements'),
            children: (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Payment History Filters (T075) */}
                <Card>
                  <div className="it-toolbar__actions">
                    <Space>
                      <FilterOutlined />
                      <Text strong>{t('Filtres :')}</Text>
                    </Space>
                    <Select
                      placeholder={t('Méthode de paiement')}
                      allowClear
                      style={{ width: 200 }}
                      value={paymentHistoryFilters.method}
                      onChange={value => setPaymentHistoryFilters({ ...paymentHistoryFilters, method: value })}
                    >
                      <Select.Option value="CASH">{t('Espèces')}</Select.Option>
                      <Select.Option value="BANK_TRANSFER">{t('Virement bancaire')}</Select.Option>
                      <Select.Option value="MOBILE_MONEY">{t('Mobile Money')}</Select.Option>
                      <Select.Option value="CHECK">{t('Chèque')}</Select.Option>
                      <Select.Option value="CARD">{t('Carte bancaire')}</Select.Option>
                      <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                    </Select>
                    <RangePicker
                      placeholder={[t('Date début'), t('Date fin')]}
                      onChange={dates => {
                        if (dates && dates[0] && dates[1]) {
                          setPaymentHistoryFilters({
                            ...paymentHistoryFilters,
                            startDate: dates[0].format('YYYY-MM-DD'),
                            endDate: dates[1].format('YYYY-MM-DD')
                          });
                        } else {
                          setPaymentHistoryFilters({
                            ...paymentHistoryFilters,
                            startDate: undefined,
                            endDate: undefined
                          });
                        }
                      }}
                      format="DD/MM/YYYY"
                    />
                    {(paymentHistoryFilters.method || paymentHistoryFilters.startDate) && (
                      <Button
                        onClick={() => {
                          setPaymentHistoryFilters({});
                        }}
                      >
                        {t('Réinitialiser')}
                      </Button>
                    )}
                  </div>
                </Card>

                {/* Payment History Table (T073, T074) */}
                <Card
                  title={
                    <>
                      <DollarOutlined /> {t('Historique des paiements')}
                    </>
                  }
                >
                  {paymentHistoryError ? (
                    <Alert message={t('Erreur')} description={paymentHistoryError} type="error" showIcon />
                  ) : paymentHistoryData && paymentHistoryData.payments.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <Table
                        scroll={{ x: 1000 }}
                        columns={[
                          {
                            title: 'Date',
                            dataIndex: 'succeededAt',
                            key: 'date',
                            render: (_: string | null, record: any) => {
                              const date = record.succeededAt || record.initiatedAt;
                              return (
                                <Space>
                                  <CalendarOutlined />
                                  {date ? formatDate(date) : '-'}
                                  {record.isDeclaration && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      {t('(déclaration)')}
                                    </Text>
                                  )}
                                </Space>
                              );
                            },
                            sorter: (a: any, b: any) => {
                              const dateA =
                                a.succeededAt || a.initiatedAt ? dayjs(a.succeededAt || a.initiatedAt).unix() : 0;
                              const dateB =
                                b.succeededAt || b.initiatedAt ? dayjs(b.succeededAt || b.initiatedAt).unix() : 0;
                              return dateA - dateB;
                            }
                          },
                          {
                            title: 'Montant',
                            dataIndex: 'amount',
                            key: 'amount',
                            render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>,
                            sorter: (a: any, b: any) => a.amount - b.amount
                          },
                          {
                            title: t('Méthode'),
                            dataIndex: 'method',
                            key: 'method',
                            render: (method: string) => getPaymentMethodLabel(method)
                          },
                          {
                            title: t('Référence'),
                            dataIndex: 'reference',
                            key: 'reference',
                            render: (ref: string | null) => ref || '-'
                          },
                          {
                            title: 'Statut',
                            dataIndex: 'status',
                            key: 'status',
                            render: (status: string, record: any) => {
                              const declStatus = record.declarationStatus || status;
                              const label =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? t('Réussi')
                                  : declStatus === 'PENDING'
                                    ? t('En attente')
                                    : declStatus === 'REJECTED'
                                      ? t('Rejetée')
                                      : status;
                              const color =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? 'success'
                                  : declStatus === 'PENDING'
                                    ? 'warning'
                                    : declStatus === 'REJECTED'
                                      ? 'error'
                                      : 'default';
                              return <Tag color={color}>{label}</Tag>;
                            }
                          },
                          {
                            title: t('Alloué'),
                            dataIndex: 'allocatedAmount',
                            key: 'allocated',
                            render: (amount: number) => formatCurrency(amount),
                            align: 'end' as const
                          },
                          {
                            title: t('Non alloué'),
                            dataIndex: 'unallocatedAmount',
                            key: 'unallocated',
                            render: (amount: number) => (
                              <Text type={amount > 0 ? 'warning' : 'success'}>{formatCurrency(amount)}</Text>
                            ),
                            align: 'end' as const
                          }
                        ]}
                        dataSource={paymentHistoryData.payments}
                        rowKey={(r: any) => (r.isDeclaration ? `decl-${r.id}` : r.id)}
                        loading={paymentHistoryLoading}
                        pagination={{
                          current: paymentHistoryPagination.current,
                          pageSize: paymentHistoryPagination.pageSize,
                          total: paymentHistoryData.pagination?.total ?? paymentHistoryData.payments.length,
                          showSizeChanger: true,
                          showTotal: total =>
                            t('Total: {{total}} élément{{value}} (paiements et déclarations)', {
                              total: total,
                              value: total !== 1 ? 's' : ''
                            })
                        }}
                        onChange={handlePaymentHistoryTableChange}
                        expandable={{
                          expandedRowRender: (record: any) => {
                            if (!record.allocations || record.allocations.length === 0) {
                              return <Text type="secondary">{t('Aucune allocation')}</Text>;
                            }
                            return (
                              <Table
                                columns={[
                                  {
                                    title: t('Échéance'),
                                    dataIndex: ['installment', 'period'],
                                    key: 'period',
                                    render: (period: string | null, row: any) =>
                                      row?.installment?.period ?? period ?? '-'
                                  },
                                  {
                                    title: t("Date d'échéance"),
                                    dataIndex: ['installment', 'dueDate'],
                                    key: 'dueDate',
                                    render: (date: string | null, row: any) =>
                                      (row?.installment?.dueDate ?? date)
                                        ? formatDate(row?.installment?.dueDate ?? date)
                                        : '-'
                                  },
                                  {
                                    title: t('Montant alloué'),
                                    dataIndex: 'amount',
                                    key: 'amount',
                                    render: (amount: number) => formatCurrency(amount),
                                    align: 'end' as const
                                  }
                                ]}
                                dataSource={record.allocations}
                                rowKey="id"
                                pagination={false}
                                size="small"
                              />
                            );
                          },
                          rowExpandable: (record: any) => record.allocations && record.allocations.length > 0
                        }}
                      />
                    </div>
                  ) : (
                    <Empty description={t('Aucun paiement trouvé')} />
                  )}
                </Card>

                {/* Total Paid Summary */}
                {paymentHistoryData && (
                  <Card>
                    <Statistic
                      title={t('Total payé (tous les paiements)')}
                      value={paymentHistoryData.totalPaid}
                      prefix={<DollarOutlined />}
                      formatter={value => formatCurrency(Number(value))}
                    />
                  </Card>
                )}
              </Space>
            )
          },
          {
            key: 'releve',
            label: t('Mon relevé'),
            children: <MonReleve />
          }
        ]}
      />

      {/* Installment Details Modal */}
      <Modal
        title={t("Détails de l'échéance")}
        open={detailsModalVisible}
        onCancel={handleCloseDetails}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedInstallment && <InstallmentDetails installmentId={selectedInstallment} />}
      </Modal>

      {/* Payment Declaration Modal (T069) */}
      <PaymentDeclarationModal
        open={declarationModalVisible}
        installmentId={declarationFor?.id}
        defaultAmount={declarationFor?.balance}
        installmentLabel={declarationFor?.period}
        onCancel={() => {
          setDeclarationModalVisible(false);
          setDeclarationFor(null);
        }}
        onSuccess={() => {
          setDeclarationFor(null);
          loadInstallments();
          loadPaymentHistory();
        }}
      />
    </Space>
  );
}
