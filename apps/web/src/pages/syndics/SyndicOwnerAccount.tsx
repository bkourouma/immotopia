import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography
} from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue, StatCard, Table } from '../../components/primitives';
import {
  createLotOwnerAccountAdjustment,
  downloadLotOwnerAccountStatement,
  getLotOwnerAccount,
  listLotOwnerAccountTransactionsWithTotal
} from '../../services/syndic-service';
import { getLotAdvance } from '../../services/syndic-lot-payment-service';
import { downloadReceiptFile, listLotReceipts } from '../../services/syndic-receipt-service';
import { OwnerAccount, OwnerAccountTransaction, ReceiptKind, ReceiptView } from '../../types/syndic-types';
import type { ReceiptListParams } from '../../services/syndic-receipt-service';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { useTabParam } from '../../components/syndics/finances/url-params';
import { useListSearch } from '../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { displayCurrency } from '../../utils/syndic-currency';

import { localizedRecord } from '../../i18n/localized';
const receiptKindLabel: Record<ReceiptKind, string> = localizedRecord(() => ({
  RECEIPT: t('Reçu'),
  QUITTANCE: t('Quittance')
}));

const { Paragraph, Title } = Typography;

const ACCOUNT_TABS = ['transactions', 'recus'] as const;

/** Libellés affichés, construits au rendu : `t()` doit être appelé après le chargement de la langue. */
function transactionTypeLabels(): Record<OwnerAccountTransaction['type'], string> {
  return {
    CHARGE_CALL: t('Appel de charges'),
    PAYMENT: t('Paiement'),
    PENALTY: t('Pénalité'),
    WAIVER: t('Remise'),
    ADJUSTMENT: t('Ajustement'),
    FUND_TRANSFER: t('Transfert de fonds')
  };
}

/**
 * Sens du solde d'un compte copropriétaire.
 *
 * `OwnerAccount.balance` (et le `balanceAfter` de chaque mouvement) suit la
 * convention comptable posée par `appendOwnerAccountTransactionTx`
 * (`packages/api/src/lib/finance/ledger.ts`) : le débit (appel de charges,
 * pénalité) AUGMENTE le solde, le crédit (paiement, remise, ajustement
 * crédit) le DIMINUE. Un solde positif signifie donc que le copropriétaire
 * DOIT ce montant à la copropriété ; un solde négatif signifie qu'il a une
 * avance (trop-perçu). C'est la même convention qu'utilise le relevé PDF
 * (`owner-account-statement.ts`) : les deux écrans qui affichent ce solde
 * sont déjà cohérents entre eux, il n'y avait donc pas lieu de changer le
 * signe stocké en base — seulement de l'expliquer, ce qui manquait (constat
 * de recette, module 3.4 : un crédit de 20 000 affichait « -20 000 FCFA »
 * sans indication de ce que le signe négatif signifie).
 */
type BalanceTone = 'debtor' | 'creditor' | 'settled';

function describeOwnerBalance(rawBalance: number | string | null | undefined): { amount: number; tone: BalanceTone } {
  const balance = Math.round(Number(rawBalance ?? 0) * 100) / 100;
  if (balance > 0) return { amount: balance, tone: 'debtor' };
  if (balance < 0) return { amount: Math.abs(balance), tone: 'creditor' };
  return { amount: 0, tone: 'settled' };
}

const balanceToneLabel: Record<BalanceTone, string> = localizedRecord(() => ({
  debtor: t('Débiteur'),
  creditor: t('Créditeur'),
  settled: t('Soldé')
}));

const balanceToneHint: Record<BalanceTone, string> = localizedRecord(() => ({
  debtor: t('Le copropriétaire doit ce montant'),
  creditor: t('Le copropriétaire a une avance'),
  settled: t('Compte à jour')
}));

const balanceToneStatCardTone: Record<BalanceTone, 'warning' | 'positive' | 'neutral'> = {
  debtor: 'warning',
  creditor: 'positive',
  settled: 'neutral'
};

const balanceToneTagColor: Record<BalanceTone, string> = {
  debtor: 'orange',
  creditor: 'green',
  settled: 'default'
};

export const SyndicOwnerAccount: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId, lotId } = useSyndicRouteContext();
  const navigate = useNavigate();
  const [account, setAccount] = useState<OwnerAccount | null>(null);
  const [tab, setTab] = useTabParam(ACCOUNT_TABS, 'transactions');
  // Rechargement des transactions après un ajustement.
  const [txRefresh, setTxRefresh] = useState(0);
  // Nombre total de transactions, compté par l'API (la liste n'en porte qu'une page).
  // `null` tant que l'onglet « Historique » n'a pas été ouvert : il est seul à interroger les transactions.
  const [transactionsTotal, setTransactionsTotal] = useState<number | null>(null);
  // Lot S2 : avance du lot, imputée automatiquement sur ses prochains appels.
  const [advance, setAdvance] = useState<number | null>(null);
  // Lot S3 : historique des reçus et quittances de ce lot.
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId || !lotId) {
      setLoading(false);
      setError(t('Paramètres compte lot manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId, lotId]);

  // Deux listes paginées par l'API, une barre de recherche chacune (préfixes d'URL `tx` et `re`).
  const txSearch = useListSearch({
    paramPrefix: 'tx',
    ariaLabel: t('Rechercher dans les transactions'),
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé du mouvement…') },
      {
        key: 'type',
        type: 'multiSelect',
        label: t('Type'),
        primary: true,
        options: Object.entries(transactionTypeLabels()).map(([value, label]) => ({ value, label }))
      },
      { key: 'period', type: 'dateRange', label: t('Période'), primary: true, api: ['from', 'to'] }
    ]
  });
  const receiptSearch = useListSearch({
    paramPrefix: 're',
    ariaLabel: t('Rechercher dans les reçus et quittances'),
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Numéro du reçu ou de la quittance…') },
      {
        key: 'kind',
        type: 'select',
        label: t('Type'),
        primary: true,
        options: [
          { value: 'RECEIPT', label: receiptKindLabel.RECEIPT },
          { value: 'QUITTANCE', label: receiptKindLabel.QUITTANCE }
        ]
      },
      { key: 'issued', type: 'dateRange', label: t('Émis le'), primary: true, api: ['from', 'to'] },
      {
        key: 'backfilled',
        type: 'boolean',
        label: t('Rattrapés'),
        tristate: true,
        trueLabel: t('Rattrapés seulement'),
        falseLabel: t('Hors rattrapage')
      }
    ]
  });

  // Onglet « Historique des transactions » : page demandée au serveur, après la résolution du compte
  // (voir loadData : le compte est créé à la première consultation).
  const accountId = account?.id;
  const txQuery = useQuery({
    queryKey: queryKey('syndic-lot-transactions', effectiveTenantId, {
      syndicId,
      lotId,
      txRefresh,
      ...txSearch.apiParams
    }),
    queryFn: () =>
      listLotOwnerAccountTransactionsWithTotal(
        effectiveTenantId as string,
        syndicId as string,
        lotId as string,
        txSearch.apiParams
      ),
    enabled: tab === 'transactions' && Boolean(accountId && effectiveTenantId && syndicId && lotId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const transactions = txQuery.data?.items ?? [];
  const filteredTransactionsTotal = txQuery.data?.totalCount ?? 0;
  // Le compteur du haut est celui du compte entier : il ne suit pas les critères de la barre.
  const unfilteredTotal = txSearch.isFiltered ? undefined : txQuery.data?.totalCount;
  useEffect(() => {
    if (unfilteredTotal !== undefined) setTransactionsTotal(unfilteredTotal);
  }, [unfilteredTotal]);
  const transactionsError = txQuery.error
    ? (txQuery.error as any).response?.data?.error || t('Impossible de charger le compte lot')
    : null;

  // Onglet « Reçus et quittances » : page demandée au serveur.
  const receiptsQuery = useQuery({
    queryKey: queryKey('syndic-lot-receipts', effectiveTenantId, { syndicId, lotId, ...receiptSearch.apiParams }),
    queryFn: () =>
      listLotReceipts(
        effectiveTenantId as string,
        syndicId as string,
        lotId as string,
        receiptSearch.apiParams as ReceiptListParams
      ),
    enabled: tab === 'recus' && Boolean(effectiveTenantId && syndicId && lotId),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const receipts = receiptsQuery.data?.items ?? [];
  const receiptsTotal = receiptsQuery.data?.pagination.total ?? 0;

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    setLoading(true);
    setError(null);
    try {
      // Le compte du lot est créé à la première consultation
      // (`getOrCreateOwnerAccountForLot`, côté API). Lancer les deux appels en
      // parallèle faisait courir la création du compte deux fois de suite :
      // la seconde requête (transactions) déclenchait sa propre création
      // avant que celle du premier appel (compte) n'ait eu le temps de
      // committer, et l'API renvoyait 409 (constat de recette, module 3.3).
      // Les transactions ne sont donc demandées qu'une fois le compte résolu
      // (effet ci-dessus), en plus du correctif d'idempotence côté API.
      const accountData = await getLotOwnerAccount(effectiveTenantId, syndicId, lotId);
      setAccount(accountData);
      const advanceData = await getLotAdvance(effectiveTenantId, syndicId, lotId);
      setAdvance(advanceData.advance);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger le compte lot'));
    } finally {
      setLoading(false);
    }
  };

  const ownerName = useMemo(() => {
    if (!account?.contact) return t('Propriétaire');
    return (
      [account.contact.firstName, account.contact.lastName].filter(Boolean).join(' ').trim() ||
      account.contact.legalName ||
      t('Propriétaire')
    );
  }, [account]);

  const balanceInfo = useMemo(() => describeOwnerBalance(account?.balance), [account]);

  const handleAdjustment = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await createLotOwnerAccountAdjustment(effectiveTenantId, syndicId, lotId, {
        direction: values.direction,
        amount: values.amount,
        label: values.label,
        reference: values.reference || undefined
      });
      message.success(t('Ajustement enregistré'));
      setOpen(false);
      form.resetFields();
      await loadData();
      setTxRefresh(value => value + 1);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajustement impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadReceipt = async (receipt: ReceiptView, translation?: 'ar') => {
    if (!effectiveTenantId || !syndicId) return;
    setDownloadingReceiptId(receipt.id);
    try {
      const fallback = `${receipt.kind === 'QUITTANCE' ? 'Quittance' : 'Recu'} ${receipt.number}.pdf`;
      const { blob, filename } = translation
        ? await downloadReceiptFile(effectiveTenantId, syndicId, receipt.id, fallback, translation)
        : await downloadReceiptFile(effectiveTenantId, syndicId, receipt.id, fallback);
      saveBlob(blob, filename);
    } catch (err) {
      message.error(await describeDownloadError(err));
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleDownloadStatement = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    try {
      const blob = await downloadLotOwnerAccountStatement(effectiveTenantId, syndicId, lotId);
      saveBlob(blob, `releve-compte-lot-${lotId}.pdf`);
    } catch (err) {
      // `downloadLotOwnerAccountStatement` demande un `Blob` : le corps d'une
      // erreur serveur y arrive donc aussi en `Blob`, jamais en JSON déjà
      // parsé — `err.response?.data?.error` ne lisait rien.
      message.error(await describeDownloadError(err));
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/lots`)}
            >
              {t('Retour aux lots')}
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {t('Compte du lot')} {account?.lot?.lotNumber ?? ''}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Suivi du compte individuel et des mouvements.')}
            </Paragraph>
          </Space>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadStatement()}>
              {t('Télécharger le relevé')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              {t('Ajouter ajustement')}
            </Button>
          </Space>
        </div>

        {error || transactionsError ? <Alert type="error" message={error ?? transactionsError} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <StatCard
                  helpId="syndic.lots.compte.indicateurs"
                  label={t('Solde courant')}
                  value={<MoneyValue value={balanceInfo.amount} />}
                  hint={`${balanceToneLabel[balanceInfo.tone]} — ${balanceToneHint[balanceInfo.tone]}`}
                  tone={balanceToneStatCardTone[balanceInfo.tone]}
                />
              </Col>
              <Col xs={24} md={8}>
                <StatCard
                  helpId="syndic.lots.compte.indicateurs"
                  label={t('Transactions')}
                  value={transactionsTotal ?? '—'}
                />
              </Col>
              <Col xs={24} md={8}>
                <StatCard helpId="syndic.lots.compte.indicateurs" label={t('Propriétaire')} value={ownerName} />
              </Col>
              <Col xs={24} md={8}>
                <StatCard
                  helpId="syndic.lots.compte.indicateurs"
                  label={t('Avance disponible')}
                  value={<MoneyValue value={advance ?? 0} />}
                  hint={t('Imputée automatiquement sur les prochains appels de charges')}
                  tone={advance && advance > 0 ? 'positive' : 'neutral'}
                />
              </Col>
            </Row>

            <Tabs
              activeKey={tab}
              onChange={key => setTab(key as (typeof ACCOUNT_TABS)[number])}
              destroyOnHidden
              items={[
                {
                  key: 'transactions',
                  label: t('Historique des transactions'),
                  children: (
                    <Table
                      helpId="syndic.lots.compte.transactions"
                      aria-label={t('Historique des transactions')}
                      search={txSearch.searchProps}
                      exportFilename={t('Historique des transactions')}
                      exportFetchAll={() =>
                        collectAllPages<OwnerAccountTransaction>(async (page, limit) => {
                          const result = await listLotOwnerAccountTransactionsWithTotal(
                            effectiveTenantId as string,
                            syndicId as string,
                            lotId as string,
                            { ...txSearch.filterParams, page, limit }
                          );
                          return { items: result.items, total: result.totalCount };
                        })
                      }
                      scroll={{ x: 'max-content' }}
                      rowKey="id"
                      dataSource={transactions}
                      loading={txQuery.isFetching}
                      pagination={txSearch.tablePagination(filteredTransactionsTotal)}
                      columns={[
                        {
                          title: t('Date'),
                          dataIndex: 'transactionDate',
                          render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                        },
                        {
                          title: t('Type'),
                          dataIndex: 'type',
                          render: (value: OwnerAccountTransaction['type']) => transactionTypeLabels()[value] || value
                        },
                        { title: t('Libellé'), dataIndex: 'label' },
                        {
                          title: t('Débit'),
                          dataIndex: 'debit',
                          align: 'end',
                          render: (value: number | string | null) => (value ? <MoneyValue value={value} /> : '-')
                        },
                        {
                          title: t('Crédit'),
                          dataIndex: 'credit',
                          align: 'end',
                          render: (value: number | string | null) => (value ? <MoneyValue value={value} /> : '-')
                        },
                        {
                          title: t('Solde'),
                          dataIndex: 'balanceAfter',
                          align: 'end',
                          // Le rendu accole le montant et l'étiquette Débiteur/Créditeur : on les sépare.
                          exportTitle: t('Solde (+ débiteur, − créditeur)'),
                          exportValue: (row: OwnerAccountTransaction) => {
                            const info = describeOwnerBalance(row.balanceAfter);
                            return info.tone === 'creditor' ? -info.amount : info.amount;
                          },
                          render: (value: number | string) => {
                            const info = describeOwnerBalance(value);
                            return (
                              <Space size={6}>
                                <MoneyValue value={info.amount} />
                                <Tag color={balanceToneTagColor[info.tone]}>{balanceToneLabel[info.tone]}</Tag>
                              </Space>
                            );
                          }
                        }
                      ]}
                    />
                  )
                },
                {
                  key: 'recus',
                  label: t('Reçus et quittances'),
                  children: (
                    <Table
                      helpId="syndic.lots.compte.recus"
                      aria-label={t('Reçus et quittances')}
                      search={receiptSearch.searchProps}
                      exportFilename={t('Reçus et quittances')}
                      exportFetchAll={() =>
                        collectAllPages<ReceiptView>(async (page, limit) => {
                          const result = await listLotReceipts(
                            effectiveTenantId as string,
                            syndicId as string,
                            lotId as string,
                            { ...receiptSearch.filterParams, page, limit } as ReceiptListParams
                          );
                          return { items: result.items, total: result.pagination.total };
                        })
                      }
                      rowKey="id"
                      loading={receiptsQuery.isFetching}
                      dataSource={receipts}
                      pagination={receiptSearch.tablePagination(receiptsTotal)}
                      locale={
                        receiptSearch.isFiltered ? undefined : { emptyText: t('Aucun reçu ou quittance pour ce lot.') }
                      }
                      columns={[
                        { title: t('Numéro'), dataIndex: 'number' },
                        {
                          title: t('Type'),
                          dataIndex: 'kind',
                          render: (value: ReceiptView['kind']) => (
                            <Tag color={value === 'QUITTANCE' ? 'green' : 'blue'}>{receiptKindLabel[value]}</Tag>
                          )
                        },
                        {
                          title: t('Émis le'),
                          dataIndex: 'issuedAt',
                          render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                        },
                        {
                          title: t('Montant'),
                          align: 'end',
                          exportValue: (row: ReceiptView) => Number(row.amount),
                          render: (_: unknown, row: ReceiptView) => (
                            <MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />
                          )
                        },
                        {
                          title: t('Actions'),
                          exportable: false,
                          render: (_: unknown, row: ReceiptView) => (
                            <Space wrap>
                              <Button
                                size="small"
                                icon={<DownloadOutlined />}
                                loading={downloadingReceiptId === row.id}
                                onClick={() => void handleDownloadReceipt(row)}
                              >
                                {t('Télécharger')}
                              </Button>
                              <Button
                                size="small"
                                loading={downloadingReceiptId === row.id}
                                onClick={() => void handleDownloadReceipt(row, 'ar')}
                              >
                                {t('Traduction arabe')}
                              </Button>
                            </Space>
                          )
                        }
                      ]}
                    />
                  )
                }
              ]}
            />
          </>
        )}
      </Space>

      <Modal
        title={<HelpSectionTitle title={t('Ajouter un ajustement')} helpId="syndic.lots.compte.ajustement" />}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleAdjustment()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ direction: 'DEBIT' }}>
          <Form.Item label={t('Direction')} name="direction" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { label: t('Débit'), value: 'DEBIT' },
                { label: t('Crédit'), value: 'CREDIT' }
              ]}
            />
          </Form.Item>
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[{ required: true, message: t('Le montant est obligatoire') }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Libellé')}
            name="label"
            rules={[{ required: true, message: t('Le libellé est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Référence (optionnel)')} name="reference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
