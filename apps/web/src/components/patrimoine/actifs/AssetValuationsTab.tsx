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

/** Méthodes que le serveur recalcule : un montant retouché à la main les fait repasser en saisie manuelle. */
const COMPUTED_METHODS: readonly string[] = [
  'DEPRECIATION_LINEAR',
  'DEPRECIATION_DECLINING',
  'EQUITY_SHARE',
  'UNIT_COST',
  'ACCRUED_SAVINGS',
  'DISCOUNTED_CLAIM',
  'UNIT_VALUE'
];

const isComputed = (method: string | undefined): boolean => method !== undefined && COMPUTED_METHODS.includes(method);

/** Méthode à envoyer : celle de la suggestion seulement si son montant est inchangé. */
function methodForAmount(
  prefill: Partial<ValuationFormValues> | null | undefined,
  amount: number | null | undefined,
  method: AssetValuationDto['method']
): AssetValuationDto['method'] {
  if (!prefill || !isComputed(prefill.method) || method !== prefill.method) return method;
  return Number(amount) === prefill.estimatedValue ? method : 'MANUAL';
}

const isForbidden = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 403;

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
  const method = Form.useWatch('method', form);
  const amount = Form.useWatch('estimatedValue', form);
  const noteManual =
    !valuation && isComputed(prefill?.method) && method === 'MANUAL' && Number(amount) !== prefill?.estimatedValue;
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
        method: methodForAmount(valuation ? null : prefill, values.estimatedValue, values.method),
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
      <Form
        form={form}
        layout="vertical"
        onValuesChange={changed => {
          if (!('estimatedValue' in changed) || valuation || !prefill?.method) return;
          form.setFieldValue('method', methodForAmount(prefill, changed.estimatedValue, prefill.method));
        }}
      >
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
          extra={noteManual ? t('Montant modifié : la valeur sera enregistrée comme saisie manuelle.') : undefined}
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
        <Form.Item
          name="source"
          label={t('Source')}
          rules={[
            {
              required: method === 'EXPERT_APPRAISAL',
              whitespace: true,
              message: t("Indiquez l'expert ou le document (source) pour une expertise.")
            }
          ]}
        >
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
    // Le libellé d'un pourcentage porte déjà « (%) » : pas de second « % » dans ce cas.
    if (PERCENT_KEY.test(key)) return detailKeyLabel(key).includes('(%)') ? String(value) : `${value} %`;
    if (key === 'usefulLifeYears') {
      return value > 1 ? t('{{nombre}} ans', { nombre: value }) : t('{{nombre}} an', { nombre: value });
    }
    if (MONEY_KEYS.includes(key)) return formatAmount(value, currency);
  }
  return String(value);
}

type SuggestOk = Extract<SuggestResponse, { ok: true }>;
type SuggestRefused = Extract<SuggestResponse, { ok: false }>;

const wrapperStyle = { marginBottom: 'var(--space-4)' };

/** Valeur calculée : montant, méthode, hypothèses. Rien n'est enregistré sans confirmation. */
const SuggestionOk: React.FC<{
  asset: AssetDto;
  result: SuggestOk;
  canWrite: boolean;
  onSave: (result: SuggestOk) => Promise<void>;
  onEdit: (result: SuggestOk) => void;
  onDismiss: () => void;
}> = ({ asset, result, canWrite, onSave, onEdit, onDismiss }) => {
  const amount = formatAmount(result.amount, result.currency);
  const savable = canWrite && result.amount > 0;
  return (
    <Alert
      type="info"
      showIcon
      closable={{ onClose: onDismiss }}
      style={wrapperStyle}
      title={t('Valeur calculée : {{montant}}', { montant: amount })}
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
          {canWrite && (
            <Space wrap>
              {savable && (
                <ConfirmAction
                  title={t('Enregistrer cette valeur de {{montant}} ?', { montant: amount })}
                  description={t("Une valeur datée d'aujourd'hui sera ajoutée à l'historique.")}
                  okText={t('Enregistrer')}
                  onConfirm={() => onSave(result)}
                >
                  <Button type="primary">{t('Enregistrer cette valeur')}</Button>
                </ConfirmAction>
              )}
              <Button onClick={() => onEdit(result)}>{t('Modifier')}</Button>
            </Space>
          )}
        </div>
      }
    />
  );
};

function refusalTitle(result: SuggestRefused): string {
  switch (result.reason) {
    case 'ZERO_VALUE':
      return t(
        'Cette classe donne une valeur nulle avec les informations actuelles : saisissez la valeur manuellement.'
      );
    case 'OUT_OF_RANGE':
      return t("Le calcul donne un montant hors limites : vérifiez les informations de l'actif.");
    case 'ACQUISITION_DATE_IN_FUTURE':
      return t(
        "La date d'acquisition est postérieure à la date de calcul : corrigez-la dans les informations de l'actif."
      );
    default:
      return result.missing.length === 0
        ? t('Cette classe se valorise par saisie manuelle ou expertise.')
        : t('Il manque des informations pour calculer une valeur');
  }
}

/** Suggestion refusée : champs à compléter, ou raison métier (valeur nulle, hors limites, date future). */
const SuggestionMissing: React.FC<{
  result: SuggestRefused;
  onCompleteInfo?: () => void;
  onDismiss: () => void;
}> = ({ result, onCompleteInfo, onDismiss }) => {
  const missing = result.reason ? [] : result.missing;
  const only = missing.length === 1 ? missing[0] : null;
  const completeLink = onCompleteInfo && (
    <Button type="link" style={{ paddingInline: 0 }} onClick={onCompleteInfo}>
      {t("Compléter les informations de l'actif")}
    </Button>
  );
  const showBody = missing.length > 0 || result.reason === 'ACQUISITION_DATE_IN_FUTURE';
  return (
    <Alert
      type="warning"
      showIcon
      closable={{ onClose: onDismiss }}
      style={wrapperStyle}
      title={refusalTitle(result)}
      description={
        showBody ? (
          <div>
            {missing.length > 0 && (
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {missing.map(key => (
                  <li key={key}>{detailKeyLabel(key)}</li>
                ))}
              </ul>
            )}
            {only === 'balance' ? (
              <p style={{ margin: 0 }}>{t('Un solde se saisit directement : ajoutez une valeur.')}</p>
            ) : (
              completeLink
            )}
          </div>
        ) : undefined
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
  /** Faux pour un utilisateur en lecture seule : aucun bouton d'écriture. Par défaut vrai. */
  canWrite?: boolean;
}> = ({ tenantId, asset, onCompleteInfo, canWrite: canWriteProp = true }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetValuationDto | null>(null);
  const [prefill, setPrefill] = useState<Partial<ValuationFormValues> | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  // Le client ne connaît pas les permissions : un refus 403 du serveur retire aussi les boutons d'écriture.
  const [denied, setDenied] = useState(false);
  const canWrite = canWriteProp && !denied;

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
    try {
      if (editing) {
        await updateAssetValuation(tenantId, asset.id, editing.id, payload);
        message.success(t('Valeur modifiée.'));
      } else {
        await createAssetValuation(tenantId, asset.id, payload);
        message.success(t('Valeur ajoutée.'));
      }
    } catch (error) {
      if (isForbidden(error)) setDenied(true);
      throw error;
    }
    await refresh();
  };

  const handleDelete = async (valuation: AssetValuationDto) => {
    try {
      await deleteAssetValuation(tenantId, asset.id, valuation.id);
      message.success(t('Valeur supprimée.'));
      await refresh();
    } catch (error) {
      if (isForbidden(error)) setDenied(true);
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
      if (isForbidden(error)) setDenied(true);
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
          {canWrite && (
            <Button icon={<PlusOutlined />} onClick={() => openForm(null)}>
              {t('Ajouter une valeur')}
            </Button>
          )}
        </Space>
      }
    >
      {suggestion?.ok === true && (
        <SuggestionOk
          asset={asset}
          result={suggestion}
          canWrite={canWrite}
          onSave={handleSaveSuggestion}
          onEdit={result => {
            setSuggestion(null);
            openForm(null, { estimatedValue: result.amount, currency: result.currency, method: result.method });
          }}
          onDismiss={() => setSuggestion(null)}
        />
      )}
      {suggestion?.ok === false && (
        <SuggestionMissing result={suggestion} onCompleteInfo={onCompleteInfo} onDismiss={() => setSuggestion(null)} />
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
                render: (_: unknown, row) =>
                  canWrite && (
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
