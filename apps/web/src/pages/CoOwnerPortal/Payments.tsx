import React, { useMemo, useState } from 'react';
import { Button, Card, Col, Modal, Row, Space, Typography } from 'antd';
import { DownloadOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, SkeletonList, Table } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { useListSearch } from '../../hooks/useListSearch';
import { filterItems, paginate } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';
import { DeclarationsList } from '../../components/coowner-portal/declared-payment/DeclarationsList';
import {
  downloadCoOwnerReceiptFile,
  listMyDeclarations,
  listMyLots,
  listMyPayments,
  type CoOwnerPayment,
  type CoOwnerPaymentDocument,
  type DeclarationStatus
} from '../../services/coowner-portal-service';
import { saveBlob } from '../../utils/save-blob';
import { displayCurrency } from '../../utils/syndic-currency';
import { declarationStatusLabel } from '../../components/coowner-portal/declared-payment/labels';
import { blobErrorMessage, portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/**
 * « Mes paiements » (lot S5, besoin 2) : chaque règlement, son affectation
 * aux appels de charges (période, montant, ou avance), et les reçus /
 * quittances qui en découlent. Filtre par lot et par exercice ; l'avance
 * disponible de chaque lot est rappelée en tête, pas seulement dans le
 * détail d'un paiement.
 */

// Champ libre : référence, numéro de lot et mode de paiement affichés. Constantes de module.
const TEXTE_RECHERCHE = [
  (payment: CoOwnerPayment) => payment.reference,
  (payment: CoOwnerPayment) => payment.lot.lotNumber,
  (payment: CoOwnerPayment) => payment.methodLabel
];
const NO_PAYMENTS: CoOwnerPayment[] = [];
const DECLARATION_STATUSES: DeclarationStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED'];

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
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      exportValue: row => Number(row.amount),
      render: (_, row) => <MoneyValue value={row.amount} />
    },
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
            // Détail d'un paiement ouvert dans une fenêtre : la ligne est déjà exportée par la liste.
            exportable={false}
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
          <MoneyValue value={payment.remainingAdvance} currency={displayCurrency(payment.currency)} />
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

/**
 * « Mes déclarations » : liste paginée et filtrée par le serveur (statut). Section facultative :
 * toute erreur (API absente, droit refusé) ou l'absence de toute déclaration la masque sans
 * casser la page. Préfixe `dec` : le tableau des paiements (`pa`) partage l'écran.
 */
function DeclarationsSection() {
  const queryClient = useQueryClient();
  // Champ libre serveur (`search` : référence de transaction déclarée, numéro de lot) + statut.
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Référence de transaction, lot…')
    },
    {
      key: 'status',
      type: 'select',
      label: t('Statut'),
      primary: true,
      options: DECLARATION_STATUSES.map(status => ({ value: status, label: declarationStatusLabel(status) }))
    }
  ];
  const search = useListSearch({ criteria, paramPrefix: 'dec', apiNames: { sort: false } });
  const declarations = useQuery({
    queryKey: ['coowner-portal', 'declarations', search.apiParams],
    staleTime: 30_000,
    queryFn: () =>
      listMyDeclarations(
        search.apiParams as { status?: DeclarationStatus; search?: string; page?: number; limit?: number }
      ),
    placeholderData: keepPreviousData,
    retry: false
  });

  // Section facultative : une erreur la masque, sauf sous critère actif (il faut pouvoir l'effacer).
  if (declarations.isError && !search.isFiltered) return null;
  const items = declarations.data?.items ?? [];
  const total = declarations.data?.pagination.total ?? 0;
  // Aucune déclaration et aucun critère : section masquée. Sous critère, elle reste affichée
  // (la recherche et le critère « Statut » ne doivent pas disparaître avec elle quand il ne laisse aucun résultat).
  if (!search.isFiltered && total === 0) return null;
  const dataViewProps = {
    ...search.dataViewProps,
    error: declarations.isError
      ? portalErrorMessage(declarations.error, t('Impossible de charger vos déclarations.'))
      : null,
    onRetry: () => void declarations.refetch()
  };

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Title level={3}>{t('Mes déclarations')}</Title>
          <Text type="secondary">
            {t(
              'Paiements mobile money que vous avez déclarés au syndic. Rien n’est porté à votre compte avant validation.'
            )}
          </Text>
        </div>
        <DeclarationsList
          items={items}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['coowner-portal', 'declarations'] })}
          serverList={{
            search: { ...search.searchProps, 'aria-label': t('Rechercher dans les déclarations') },
            total,
            dataViewProps,
            isReloading: declarations.isFetching && !declarations.isPending
          }}
        />
      </Space>
    </Card>
  );
}

export default function CoOwnerPayments() {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<CoOwnerPayment | null>(null);

  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], staleTime: 30_000, queryFn: () => listMyLots() });
  const lotOptions = useMemo(
    () =>
      (lots.data ?? []).map(lot => ({ value: lot.id, label: t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber }) })),
    [lots.data]
  );

  // Préfixe `pa` : le tableau des déclarations (`dec`) partage l'écran. Lot et exercice pilotent
  // l'appel (le serveur filtre) : `api: false`, la requête les lit dans `search.values`. Le champ
  // libre filtre ici la liste de cet appel, qui arrive en entier.
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Référence, lot, mode de paiement…'),
      api: false
    },
    { key: 'lot', type: 'select', label: t('Lot'), primary: true, options: lotOptions, api: false },
    {
      key: 'year',
      type: 'select',
      label: t('Exercice'),
      primary: true,
      options: yearOptions().map(candidate => ({ value: String(candidate), label: String(candidate) })),
      api: false
    }
  ];
  const search = useListSearch({ criteria, paramPrefix: 'pa', apiNames: { sort: false } });
  const lotId = typeof search.values.lot === 'string' ? search.values.lot : undefined;
  const yearValue = typeof search.values.year === 'string' ? Number(search.values.year) : NaN;
  const year = Number.isInteger(yearValue) ? yearValue : undefined;

  const payments = useQuery({
    queryKey: ['coowner-portal', 'payments', lotId ?? null, year ?? null],
    staleTime: 30_000,
    queryFn: () => listMyPayments({ lotId, year }),
    placeholderData: keepPreviousData
  });
  const paymentItems = payments.data?.items ?? NO_PAYMENTS;
  const filteredPayments = useMemo(
    () => filterItems(paymentItems, search.values, { criteria: search.criteria, text: TEXTE_RECHERCHE }),
    [paymentItems, search.values, search.criteria]
  );
  const paymentsPage = useMemo(
    () => paginate(filteredPayments, search.page, search.pageSize),
    [filteredPayments, search.page, search.pageSize]
  );

  const refreshAll = () => {
    void payments.refetch();
    void queryClient.invalidateQueries({ queryKey: ['coowner-portal', 'declarations'] });
  };

  const columns: ColumnsType<CoOwnerPayment> = [
    { title: t('Date'), key: 'paidAt', render: (_, row) => dayjs(row.paidAt).format('DD/MM/YYYY') },
    { title: t('Lot'), key: 'lot', render: (_, row) => row.lot.lotNumber },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      exportValue: row => Number(row.amount),
      render: (_, row) => <MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />
    },
    { title: t('Mode'), key: 'method', render: (_, row) => row.methodLabel ?? '—' },
    { title: t('Référence'), key: 'reference', render: (_, row) => row.reference ?? '—' },
    {
      title: t('Avance restante'),
      key: 'remainingAdvance',
      align: 'end',
      exportValue: row => Number(row.remainingAdvance),
      render: (_, row) => <MoneyValue value={row.remainingAdvance} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Détail'),
      key: 'detail',
      align: 'end',
      exportable: false,
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
        <Button icon={<SyncOutlined />} onClick={refreshAll} loading={payments.isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

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
                    <MoneyValue value={advance.advance} currency={displayCurrency(advance.currency)} />
                  </div>
                </Card>
              </Col>
            ))}
        </Row>
      ) : null}

      {payments.isPending ? (
        <SkeletonList rows={3} />
      ) : (
        // Sur erreur, la barre et ses critères restent affichés : l'erreur s'affiche dessous (DataView).
        <Card>
          <DataView<CoOwnerPayment>
            {...search.dataViewProps}
            error={
              payments.error ? portalErrorMessage(payments.error, t('Impossible de charger vos paiements.')) : null
            }
            onRetry={() => void payments.refetch()}
            page={paymentsPage.page}
            items={paymentsPage.items}
            total={filteredPayments.length}
            search={{
              ...search.searchProps,
              resultCount: filteredPayments.length,
              'aria-label': t('Rechercher dans les paiements')
            }}
            isReloading={payments.isFetching && !payments.isPending}
            rowKey={row => row.id}
            aria-label={t('Mes paiements')}
            export={{ filename: t('Mes paiements'), fetchAll: () => Promise.resolve(filteredPayments) }}
            emptyDescription={t("Aucun paiement n'a encore été enregistré pour vos lots.")}
            columns={columns}
            renderCard={row => (
              <DataCard
                title={dayjs(row.paidAt).format('DD/MM/YYYY')}
                subtitle={[t('Lot {{lotNumber}}', { lotNumber: row.lot.lotNumber }), row.methodLabel]
                  .filter(Boolean)
                  .join(' · ')}
                highlight={<MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />}
                fields={[
                  { label: t('Référence'), value: row.reference ?? '—' },
                  {
                    label: t('Avance restante'),
                    value: <MoneyValue value={row.remainingAdvance} currency={displayCurrency(row.currency)} />
                  }
                ]}
                primaryAction={{ label: t('Détail'), icon: <EyeOutlined />, onClick: () => setDetail(row) }}
              />
            )}
          />
        </Card>
      )}

      <DeclarationsSection />

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
