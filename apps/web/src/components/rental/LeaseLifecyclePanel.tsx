import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Divider, Skeleton, Space, Typography } from 'antd';
import { EditOutlined, FileTextOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  AddAmendmentRequest,
  FinalSettlement,
  LeaseEvent,
  LeaseLifecycleState,
  ReviseLeaseRequest,
  RenewLeaseRequest,
  TerminateLeaseRequest,
  addLeaseAmendment,
  getFinalSettlement,
  getLeaseEvents,
  renewLease,
  reviseLease,
  terminateLease
} from '../../services/lease-lifecycle-service';
import { MoneyValue } from '../primitives';
import { LeaseEventTimeline } from './lifecycle/LeaseEventTimeline';
import { RevisionModal } from './lifecycle/RevisionModal';
import { RenewalModal } from './lifecycle/RenewalModal';
import { AmendmentModal } from './lifecycle/AmendmentModal';
import { TerminationModal } from './lifecycle/TerminationModal';
import { FinalSettlementCard } from './lifecycle/FinalSettlementCard';
import { t } from '../../i18n/t';

const { Text } = Typography;

export interface LeaseLifecyclePanelProps {
  tenantId: string;
  leaseId: string;
  onLeaseChanged?: () => void;
}

/** Format d'affichage imposé au panneau : `DD/MM/YYYY`. */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '—';
}

/**
 * Panneau autonome « Vie du bail » (Lot 5 §A).
 *
 * Révision, renouvellement, avenant et résiliation, plus l'historique et le
 * solde de tout compte. Ecrit contre le contrat d'API du lot — l'API elle-même
 * est en cours en parallèle — et s'intègre comme un onglet de la fiche du
 * bail, à charge de l'appelant : ce composant ne touche pas
 * `LeaseDetailPage.tsx`.
 */
export const LeaseLifecyclePanel: React.FC<LeaseLifecyclePanelProps> = ({ tenantId, leaseId, onLeaseChanged }) => {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LeaseEvent[]>([]);
  const [lease, setLease] = useState<LeaseLifecycleState | null>(null);

  const [settlement, setSettlement] = useState<FinalSettlement | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);

  const [revisionOpen, setRevisionOpen] = useState(false);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [terminationOpen, setTerminationOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaseEvents(tenantId, leaseId);
      setEvents(data.events);
      setLease(data.lease);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('Erreur lors du chargement de la vie du bail'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, leaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lease?.terminated) {
      setSettlement(null);
      return;
    }
    let annule = false;
    setSettlementLoading(true);
    getFinalSettlement(tenantId, leaseId)
      .then(data => {
        if (!annule) setSettlement(data);
      })
      .catch((e: any) => {
        if (!annule)
          message.error(e?.response?.data?.message || t('Erreur lors du chargement du solde de tout compte'));
      })
      .finally(() => {
        if (!annule) setSettlementLoading(false);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lease?.terminated, tenantId, leaseId]);

  /**
   * Echéances déjà facturées au-delà de la fin, après la dernière résiliation.
   *
   * Dérivé de l'historique plutôt que d'un état local posé juste après l'appel
   * réseau : l'avertissement doit rester visible même après un rechargement du
   * panneau, et l'événement TERMINATION porte déjà cette information.
   */
  const billedAfterEnd = useMemo(() => {
    const terminaison = events.find(e => e.type === 'TERMINATION');
    return terminaison?.details?.billedAfterEnd ?? 0;
  }, [events]);

  const refreshAfterAction = async () => {
    await load();
    onLeaseChanged?.();
  };

  const handleRevision = async (data: ReviseLeaseRequest) => {
    await reviseLease(tenantId, leaseId, data);
    setRevisionOpen(false);
    message.success(t('Loyer révisé'));
    await refreshAfterAction();
  };

  const handleRenewal = async (data: RenewLeaseRequest) => {
    await renewLease(tenantId, leaseId, data);
    setRenewalOpen(false);
    message.success(t('Bail renouvelé'));
    await refreshAfterAction();
  };

  const handleAmendment = async (data: AddAmendmentRequest) => {
    await addLeaseAmendment(tenantId, leaseId, data);
    setAmendmentOpen(false);
    message.success(t('Avenant enregistré'));
    await refreshAfterAction();
  };

  const handleTermination = async (data: TerminateLeaseRequest) => {
    await terminateLease(tenantId, leaseId, data);
    setTerminationOpen(false);
    message.success(t('Bail résilié'));
    await refreshAfterAction();
  };

  if (loading) {
    return (
      <Card title={t('Vie du bail')}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (error || !lease) {
    return (
      <Card title={t('Vie du bail')}>
        <Alert
          type="error"
          showIcon
          message={error || t('Bail introuvable')}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={t('Vie du bail')}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {lease.terminated && (
            <Alert
              type="warning"
              showIcon
              message={t('Bail résilié — fin le {{date}}', { date: formatDate(lease.endDate) })}
            />
          )}

          {billedAfterEnd > 0 && (
            <Alert
              type="warning"
              showIcon
              message={t('{{n}} échéance(s) déjà réglée(s) après la fin du bail : à régulariser par un avoir.', {
                n: billedAfterEnd
              })}
            />
          )}

          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
            <Descriptions.Item label={t('Loyer en vigueur')}>
              <MoneyValue value={lease.rentAmount} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Charges en vigueur')}>
              <MoneyValue value={lease.serviceChargeAmount} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Date de fin')}>{formatDate(lease.endDate)}</Descriptions.Item>
          </Descriptions>

          <Space wrap>
            <Button icon={<EditOutlined />} disabled={lease.terminated} onClick={() => setRevisionOpen(true)}>
              {t('Réviser le loyer')}
            </Button>
            <Button icon={<SyncOutlined />} disabled={lease.terminated} onClick={() => setRenewalOpen(true)}>
              {t('Renouveler')}
            </Button>
            <Button icon={<FileTextOutlined />} onClick={() => setAmendmentOpen(true)}>
              {t('Enregistrer un avenant')}
            </Button>
            <Button icon={<StopOutlined />} danger disabled={lease.terminated} onClick={() => setTerminationOpen(true)}>
              {t('Résilier le bail')}
            </Button>
          </Space>

          <Divider style={{ margin: 0 }} />

          <div>
            <Text strong>{t('Historique')}</Text>
            <div style={{ marginTop: 12 }}>
              <LeaseEventTimeline events={events} />
            </div>
          </div>
        </Space>
      </Card>

      {lease.terminated && <FinalSettlementCard settlement={settlement} loading={settlementLoading} />}

      <RevisionModal
        open={revisionOpen}
        currentRent={lease.rentAmount}
        currentCharges={lease.serviceChargeAmount}
        onCancel={() => setRevisionOpen(false)}
        onSubmit={handleRevision}
      />
      <RenewalModal
        open={renewalOpen}
        currentEndDate={lease.endDate}
        onCancel={() => setRenewalOpen(false)}
        onSubmit={handleRenewal}
      />
      <AmendmentModal open={amendmentOpen} onCancel={() => setAmendmentOpen(false)} onSubmit={handleAmendment} />
      <TerminationModal
        open={terminationOpen}
        onCancel={() => setTerminationOpen(false)}
        onSubmit={handleTermination}
      />
    </Space>
  );
};

export default LeaseLifecyclePanel;
