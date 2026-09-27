import React, { useMemo, useState } from 'react';
import { Button, Card, Col, Modal, Row, Select, Space, Table, Typography } from 'antd';
import { DownloadOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, SkeletonList, StateBlock } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  downloadCoOwnerReceiptFile,
  listMyLots,
  listMyPayments,
  type CoOwnerPayment,
  type CoOwnerPaymentDocument
} from '../../services/coowner-portal-service';
import { saveBlob } from '../../utils/save-blob';
import { blobErrorMessage, portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * « Mes paiements » (lot S5, besoin 2) : chaque règlement, son affectation
 * aux appels de charges (période, montant, ou avance), et les reçus /
 * quittances qui en découlent. Filtre par lot et par exercice ; l'avance
 * disponible de chaque lot est rappelée en tête, pas seulement dans le
 * détail d'un paiement.
 */

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current; year >= current - 5; year -= 1) years.push(year);
  return years;
}

function DocumentButton({ doc }: { doc: CoOwnerPaymentDocument }) {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const label = doc.kind === 'QUITTANCE' ? t('Quittance') : t('Reçu');
      const { blob, filename } = await downloadCoOwnerReceiptFile(
        doc.downloadPath,
        t('{{label}} {{number}}.pdf', { label, number: doc.number })
      );
      saveBlob(blob, filename);
    } catch (error) {
      feedback.error(await blobErrorMessage(error, t('Téléchargement impossible.')));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="small" icon={<DownloadOutlined />} loading={loading} onClick={() => void download()}>
      {doc.kind === 'QUITTANCE'
        ? t('Quittance {{number}}', { number: doc.number })
        : t('Reçu {{number}}', { number: doc.number })}
    </Button>
  );
}

function PaymentDetail({ payment }: { payment: CoOwnerPayment }) {
  const columns: ColumnsType<CoOwnerPayment['allocations'][number]> = [
    { title: t('Période'), dataIndex: 'period', key: 'period' },
    { title: t('Échéance'), key: 'dueDate', render: (_, row) => dayjs(row.dueDate).format('DD/MM/YYYY') },
    { title: t('Montant'), key: 'amount', align: 'end', render: (_, row) => <MoneyValue value={row.amount} /> },
    {
      title: t('Origine'),
      key: 'source',
      render: (_, row) => (row.source === 'ADVANCE' ? t('Avance existante') : t('Ce paiement'))
    }
  ];
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Text strong>{t('Affectations')}</Text>
        {payment.allocations.length === 0 ? (
          <div>
            <Text type="secondary">{t('Aucune affectation à un appel : la totalité reste en avance sur ce lot.')}</Text>
          </div>
        ) : (
          <Table
            size="small"
            columns={columns}
            dataSource={payment.allocations}
            rowKey={row => row.chargeCallId}
            pagination={false}
          />
        )}
      </div>
      {payment.remainingAdvance > 0 ? (
        <Space size={4}>
          <Text>{t('Avance restante après affectation :')}</Text>
          <MoneyValue value={payment.remainingAdvance} currency={payment.currency} />
        </Space>
      ) : null}
      <div>
        <Text strong>{t('Documents')}</Text>
        <div style={{ marginTop: 8 }}>
          {payment.documents.length === 0 ? (
            <Text type="secondary">{t("Aucun document n'a encore été émis pour ce paiement.")}</Text>
          ) : (
            <Space wrap>
              {payment.documents.map(doc => (
                <DocumentButton key={doc.id} doc={doc} />
              ))}
            </Space>
          )}
        </div>
      </div>
    </Space>
  );
}

export default function CoOwnerPayments() {
  const [lotId, setLotId] = useState<string | undefined>(undefined);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [detail, setDetail] = useState<CoOwnerPayment | null>(null);

  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], queryFn: () => listMyLots() });
  const payments = useQuery({
    queryKey: ['coowner-portal', 'payments', lotId ?? null, year ?? null],
    queryFn: () => listMyPayments({ lotId, year })
  });

  const lotOptions = useMemo(
    () =>
      (lots.data ?? []).map(lot => ({ value: lot.id, label: t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber }) })),
    [lots.data]
  );

  const columns: ColumnsType<CoOwnerPayment> = [
    { title: t('Date'), key: 'paidAt', render: (_, row) => dayjs(row.paidAt).format('DD/MM/YYYY') },
    { title: t('Lot'), key: 'lot', render: (_, row) => row.lot.lotNumber },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_, row) => <MoneyValue value={row.amount} currency={row.currency} />
    },
    { title: t('Mode'), key: 'method', render: (_, row) => row.methodLabel ?? '—' },
    { title: t('Référence'), key: 'reference', render: (_, row) => row.reference ?? '—' },
    {
      title: t('Avance restante'),
      key: 'remainingAdvance',
      align: 'end',
      render: (_, row) => <MoneyValue value={row.remainingAdvance} currency={row.currency} />
    },
    {
      title: t('Détail'),
      key: 'detail',
      align: 'end',
      render: (_, row) => (
        <Button icon={<EyeOutlined />} onClick={() => setDetail(row)}>
          {t('Détail')}
        </Button>
      )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes paiements')}</Title>
          <Text type="secondary">{t('Vos règlements de charges, leur affectation et les documents associés.')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void payments.refetch()} loading={payments.isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

      <Space wrap size="middle">
        <Select
          allowClear
          style={{ minWidth: 200 }}
          placeholder={t('Tous les lots')}
          options={lotOptions}
          value={lotId}
          onChange={value => setLotId(value ?? undefined)}
          aria-label={t('Lot')}
        />
        <Select
          allowClear
          style={{ minWidth: 140 }}
          placeholder={t('Tous les exercices')}
          options={yearOptions().map(candidate => ({ value: candidate, label: String(candidate) }))}
          value={year}
          onChange={value => setYear(value ?? undefined)}
          aria-label={t('Exercice')}
        />
      </Space>

      {payments.data && payments.data.advances.length > 0 ? (
        <Row gutter={[16, 16]}>
          {payments.data.advances
            .filter(advance => advance.advance > 0)
            .map(advance => (
              <Col key={advance.lot.id} xs={24} sm={12} md={8}>
                <Card>
                  <Text type="secondary">
                    {t('Avance disponible — lot {{lotNumber}}', { lotNumber: advance.lot.lotNumber })}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <MoneyValue value={advance.advance} currency={advance.currency} />
                  </div>
                </Card>
              </Col>
            ))}
        </Row>
      ) : null}

      {payments.isPending ? (
        <SkeletonList rows={3} />
      ) : payments.error ? (
        <StateBlock
          variant="error"
          description={portalErrorMessage(payments.error, t('Impossible de charger vos paiements.'))}
          actions={[{ label: t('Réessayer'), onClick: () => void payments.refetch(), primary: true }]}
        />
      ) : (
        <Card>
          <DataView<CoOwnerPayment>
            paginated={false}
            items={payments.data?.items ?? []}
            total={payments.data?.items.length ?? 0}
            page={1}
            pageSize={payments.data?.items.length || 20}
            onPageChange={() => {}}
            rowKey={row => row.id}
            aria-label={t('Mes paiements')}
            emptyDescription={t("Aucun paiement n'a encore été enregistré pour vos lots.")}
            columns={columns}
            renderCard={row => (
              <DataCard
                title={dayjs(row.paidAt).format('DD/MM/YYYY')}
                subtitle={[t('Lot {{lotNumber}}', { lotNumber: row.lot.lotNumber }), row.methodLabel]
                  .filter(Boolean)
                  .join(' · ')}
                highlight={<MoneyValue value={row.amount} currency={row.currency} />}
                fields={[
                  { label: t('Référence'), value: row.reference ?? '—' },
                  {
                    label: t('Avance restante'),
                    value: <MoneyValue value={row.remainingAdvance} currency={row.currency} />
                  }
                ]}
                primaryAction={{ label: t('Détail'), icon: <EyeOutlined />, onClick: () => setDetail(row) }}
              />
            )}
          />
        </Card>
      )}

      <Modal
        open={Boolean(detail)}
        onCancel={() => setDetail(null)}
        onOk={() => setDetail(null)}
        title={detail ? t('Paiement du {{date}}', { date: dayjs(detail.paidAt).format('DD/MM/YYYY') }) : ''}
        footer={
          <Button type="primary" onClick={() => setDetail(null)}>
            {t('Fermer')}
          </Button>
        }
      >
        {detail ? <PaymentDetail payment={detail} /> : null}
      </Modal>
    </Space>
  );
}
