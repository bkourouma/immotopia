import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag
} from 'antd';
import { CalculatorOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  createAssetValuation,
  deleteAssetValuation,
  listAssetValuations,
  suggestAssetValuation,
  updateAssetValuation,
  type AssetDto,
  type AssetValuationDto,
  type AssetValuationInput,
  type SuggestResponse
} from '../../../services/patrimoine-assets-service';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { ConfirmAction, StateBlock } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatAmount, formatDay, serverFieldErrors, todayIso } from './asset-format';
import { detailKeyLabel, VALUATION_METHODS, valuationMethodName } from './asset-classes';
import { ReliabilityBadge } from './ReliabilityBadge';

interface ValuationFormValues {
  valuatedAt: string;
  estimatedValue: number;
  currency: string;
  method: AssetValuationDto['method'];
  source?: string;
  notes?: string;
}

const FORM_FIELDS = ['valuatedAt', 'estimatedValue', 'currency', 'method', 'source', 'notes'];

const ValuationFormModal: React.FC<{
  open: boolean;
  asset: AssetDto;
  valuation: AssetValuationDto | null;
  /** Montant et méthode proposés (suggestion modifiée par l'utilisateur) ; jamais enregistrés sans validation. */
  prefill?: Partial<ValuationFormValues> | null;
  onClose: () => void;
  onSubmit: (payload: AssetValuationInput) => Promise<void>;
}> = ({ open, asset, valuation, prefill, onClose, onSubmit }) => {
  const [form] = Form.useForm<ValuationFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.resetFields();
    form.setFieldsValue(
      valuation
        ? {
            valuatedAt: valuation.valuatedAt.slice(0, 10),
            estimatedValue: valuation.estimatedValue,
            currency: valuation.currency,
            method: valuation.method,
            source: valuation.source ?? undefined,
            notes: valuation.notes ?? undefined
          }
        : { valuatedAt: todayIso(), currency: asset.currency, method: 'MANUAL', ...prefill }
    );
  }, [open, valuation, prefill, asset.currency, form]);

  const handleOk = async () => {
    setErrorMessage(null);
    let values: ValuationFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        valuatedAt: values.valuatedAt,
        estimatedValue: values.estimatedValue,
        currency: values.currency,
        method: values.method,
        source: values.source?.trim() || null,
        notes: values.notes?.trim() || null
      });
      onClose();
    } catch (error) {
      const issues = serverFieldErrors(error).filter(issue => FORM_FIELDS.includes(issue.path[0]));
      if (issues.length > 0) {
        form.setFields(
          issues.map(issue => ({ name: issue.path[0] as keyof ValuationFormValues, errors: [issue.message] }))
        );
      } else {
        setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer cette valeur.")));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={valuation ? t('Modifier une valeur') : t('Ajouter une valeur')}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={valuation ? t('Enregistrer') : t('Ajouter')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical">
        <Form.Item
          name="valuatedAt"
          label={t('Date de la valeur')}
          rules={[{ required: true, message: t('Champ obligatoire') }]}
        >
          <Input type="date" />
        </Form.Item>
        <Form.Item
          name="estimatedValue"
          label={t('Valeur estimée')}
          rules={[
            { required: true, message: t('Champ obligatoire') },
            {
              validator: (_rule, value) =>
                value === undefined || value === null || Number(value) > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La valeur doit être supérieure à 0')))
            }
          ]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
          <Select options={['XOF', 'EUR', 'USD'].map(value => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="method" label={t('Méthode')} rules={[{ required: true }]}>
          <Select options={VALUATION_METHODS.map(value => ({ value, label: valuationMethodName(value) }))} />
        </Form.Item>
        <Form.Item name="source" label={t('Source')}>
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const PERCENT_KEY = /Percent$/;
const MONEY_KEYS = ['companyValue', 'netIncome', 'unitCost', 'principal', 'unitValue'];

function assumptionValue(key: string, value: string | number, currency: string): string {
  if (typeof value === 'number') {
    if (PERCENT_KEY.test(key)) return `${value} %`;
    if (MONEY_KEYS.includes(key)) return formatAmount(value, currency);
  }
  return String(value);
}

/** Résultat d'une suggestion : valeur, méthode, hypothèses ; ou champs à compléter. Rien n'est enregistré ici. */
const SuggestionResult: React.FC<{
  asset: AssetDto;
  result: SuggestResponse;
  onSave: (result: Extract<SuggestResponse, { ok: true }>) => Promise<void>;
  onEdit: (result: Extract<SuggestResponse, { ok: true }>) => void;
  onCompleteInfo?: () => void;
  onDismiss: () => void;
}> = ({ asset, result, onSave, onEdit, onCompleteInfo, onDismiss }) => {
  const wrapperStyle = { marginBottom: 'var(--space-4)' };
  if (result.ok) {
    return (
      <Alert
        type="info"
        showIcon
        closable={{ onClose: onDismiss }}
        style={wrapperStyle}
        title={t('Valeur calculée : {{montant}}', { montant: formatAmount(result.amount, result.currency) })}
        description={
          <div>
            <Descriptions column={1} size="small" style={{ marginTop: 'var(--space-2)' }}>
              <Descriptions.Item label={t('Méthode')}>{valuationMethodName(result.method)}</Descriptions.Item>
              {(result.assumptions ?? []).map(item => (
                <Descriptions.Item key={item.key} label={detailKeyLabel(item.key)}>
                  {assumptionValue(item.key, item.value, asset.currency)}
                </Descriptions.Item>
              ))}
            </Descriptions>
            <Space wrap>
              <ConfirmAction
                title={t('Enregistrer cette valeur de {{montant}} ?', {
                  montant: formatAmount(result.amount, result.currency)
                })}
                description={t("Une valeur datée d'aujourd'hui sera ajoutée à l'historique.")}
                okText={t('Enregistrer')}
                onConfirm={() => onSave(result)}
              >
                <Button type="primary">{t('Enregistrer cette valeur')}</Button>
              </ConfirmAction>
              <Button onClick={() => onEdit(result)}>{t('Modifier')}</Button>
            </Space>
          </div>
        }
      />
    );
  }
  const only = result.missing.length === 1 ? result.missing[0] : null;
  return (
    <Alert
      type="warning"
      showIcon
      closable={{ onClose: onDismiss }}
      style={wrapperStyle}
      title={
        result.missing.length === 0
          ? t('Cette classe se valorise par saisie manuelle ou expertise.')
          : t('Il manque des informations pour calculer une valeur')
      }
      description={
        result.missing.length === 0 ? undefined : (
          <div>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {result.missing.map(key => (
                <li key={key}>{detailKeyLabel(key)}</li>
              ))}
            </ul>
            {only === 'balance' ? (
              <p style={{ margin: 0 }}>{t('Un solde se saisit directement : ajoutez une valeur.')}</p>
            ) : (
              onCompleteInfo && (
                <Button type="link" style={{ paddingInline: 0 }} onClick={onCompleteInfo}>
                  {t("Compléter les informations de l'actif")}
                </Button>
              )
            )}
          </div>
        )
      }
    />
  );
};

const ValuationCurve: React.FC<{ valuations: AssetValuationDto[] }> = ({ valuations }) => {
  const points = useMemo(
    () =>
      [...valuations]
        .sort((a, b) => a.valuatedAt.localeCompare(b.valuatedAt))
        .map(v => ({ date: v.valuatedAt, value: v.estimatedValue })),
    [valuations]
  );
  if (points.length < 2) return null;
  const day = (value: unknown) => new Date(String(value)).toLocaleDateString(activeLocale(), { timeZone: 'UTC' });
  return (
    <div style={{ width: '100%', height: 220, marginBottom: 'var(--space-4)' }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={day} />
          <YAxis
            width={70}
            tickFormatter={value =>
              new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(
                Number(value)
              )
            }
          />
          <Tooltip labelFormatter={day} formatter={value => formatAmount(Number(value), 'XOF')} />
          <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Onglet « Valeurs » : historique des valorisations avec ajout, modification, suppression et courbe. */
export const AssetValuationsTab: React.FC<{
  tenantId: string;
  asset: AssetDto;
  /** Ouvre l'édition de l'actif (champs manquants à une suggestion). */
  onCompleteInfo?: () => void;
}> = ({ tenantId, asset, onCompleteInfo }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetValuationDto | null>(null);
  const [prefill, setPrefill] = useState<Partial<ValuationFormValues> | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const valuationsQuery = useQuery({
    queryKey: queryKey('patrimoine-asset-valuations', tenantId, { assetId: asset.id }),
    queryFn: () => listAssetValuations(tenantId, asset.id),
    staleTime: STALE_TIME.list
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patrimoine-asset-valuations'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-asset'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth-history'] })
    ]);
  };

  const handleSubmit = async (payload: AssetValuationInput) => {
    if (editing) {
      await updateAssetValuation(tenantId, asset.id, editing.id, payload);
      message.success(t('Valeur modifiée.'));
    } else {
      await createAssetValuation(tenantId, asset.id, payload);
      message.success(t('Valeur ajoutée.'));
    }
    await refresh();
  };

  const handleDelete = async (valuation: AssetValuationDto) => {
    try {
      await deleteAssetValuation(tenantId, asset.id, valuation.id);
      message.success(t('Valeur supprimée.'));
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de supprimer cette valeur.')));
    }
  };

  const openForm = (valuation: AssetValuationDto | null, proposed: Partial<ValuationFormValues> | null = null) => {
    setEditing(valuation);
    setPrefill(proposed);
    setModalOpen(true);
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestion(null);
    try {
      setSuggestion(await suggestAssetValuation(tenantId, asset.id));
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de calculer une valeur.')));
    } finally {
      setSuggesting(false);
    }
  };

  /** Enregistrement explicite (après confirmation) : montant et méthode de la suggestion, date du jour. */
  const handleSaveSuggestion = async (result: Extract<SuggestResponse, { ok: true }>) => {
    try {
      await createAssetValuation(tenantId, asset.id, {
        valuatedAt: todayIso(),
        estimatedValue: result.amount,
        currency: result.currency,
        method: result.method
      });
      message.success(t('Valeur ajoutée.'));
      setSuggestion(null);
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t("Impossible d'enregistrer cette valeur.")));
    }
  };

  return (
    <Card
      title={t('Historique des valeurs')}
      extra={
        <Space wrap>
          <Button icon={<CalculatorOutlined />} loading={suggesting} onClick={handleSuggest}>
            {t('Calculer une valeur')}
          </Button>
          <Button icon={<PlusOutlined />} onClick={() => openForm(null)}>
            {t('Ajouter une valeur')}
          </Button>
        </Space>
      }
    >
      {suggestion && (
        <SuggestionResult
          asset={asset}
          result={suggestion}
          onSave={handleSaveSuggestion}
          onEdit={result => {
            setSuggestion(null);
            openForm(null, { estimatedValue: result.amount, currency: result.currency, method: result.method });
          }}
          onCompleteInfo={onCompleteInfo}
          onDismiss={() => setSuggestion(null)}
        />
      )}
      {valuationsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => valuationsQuery.refetch(), primary: true }]}
        />
      ) : (
        <>
          <ValuationCurve valuations={valuationsQuery.data ?? []} />
          <Table<AssetValuationDto>
            rowKey="id"
            size="small"
            loading={valuationsQuery.isPending}
            dataSource={valuationsQuery.data ?? []}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{
              emptyText: t(
                'Aucune valeur enregistrée : ajoutez-en une pour que cet actif compte dans votre valeur nette.'
              )
            }}
            columns={[
              { title: t('Date'), dataIndex: 'valuatedAt', render: (value: string) => formatDay(value) },
              {
                title: t('Valeur'),
                dataIndex: 'estimatedValue',
                align: 'end',
                render: (value: number, row) => formatAmount(value, row.currency)
              },
              {
                title: t('Méthode'),
                dataIndex: 'method',
                render: (value: AssetValuationDto['method']) => <Tag>{valuationMethodName(value)}</Tag>
              },
              {
                title: t('Fiabilité'),
                key: 'reliability',
                render: (_: unknown, row) => (
                  <ReliabilityBadge reliability={row.reliability} reasons={row.reliabilityReasons} />
                )
              },
              { title: t('Source'), dataIndex: 'source', render: (value: string | null) => value || '—' },
              {
                title: t('Actions'),
                key: 'actions',
                render: (_: unknown, row) => (
                  <Space>
                    <a onClick={() => openForm(row)}>{t('Modifier')}</a>
                    <ConfirmAction title={t('Supprimer cette valeur ?')} danger onConfirm={() => handleDelete(row)}>
                      <a>{t('Supprimer')}</a>
                    </ConfirmAction>
                  </Space>
                )
              }
            ]}
          />
        </>
      )}
      <ValuationFormModal
        open={modalOpen}
        asset={asset}
        valuation={editing}
        prefill={prefill}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setPrefill(null);
        }}
        onSubmit={handleSubmit}
      />
    </Card>
  );
};
