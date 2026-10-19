import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, InputNumber, Modal, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { EditOutlined } from '@ant-design/icons';
import { MoneyValue } from '../primitives';
import {
  getLotTypeRates,
  updateLotTypeRates,
  type LotTypeRates,
  type LotTypeRatesView
} from '../../services/syndic-lot-type-rates-service';
import type { LotType } from '../../types/syndic-types';
import { getLotTypeLabel } from '../../utils/syndic-lot-label';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

/**
 * Barème par type de lot d'une copropriété (menu lot 2) : montant PAR LOT et
 * par type de lot, appliqué automatiquement par le mode de répartition
 * « Par type de lot ». Le chargement ne bloque jamais la page : un échec de
 * lecture s'affiche en message discret dans la carte.
 */

const LOT_TYPES: LotType[] = ['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER'];

interface RateRow {
  lotType: LotType;
  count: number;
  rate: number | undefined;
}

export interface LotTypeRatesCardProps {
  tenantId: string;
  syndicId: string;
  canEdit: boolean;
}

const formatAmount = (value: number | string | undefined): string =>
  `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const parseAmount = (value: string | undefined): number => Number((value ?? '').replace(/\s/g, ''));

export const LotTypeRatesCard: React.FC<LotTypeRatesCardProps> = ({ tenantId, syndicId, canEdit }) => {
  const { message } = App.useApp();
  const [view, setView] = useState<LotTypeRatesView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Record<LotType, number | null>>(() => emptyDraft());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getLotTypeRates(tenantId, syndicId);
      setView(result ?? null);
      setLoadFailed(!result);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantId, syndicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    const next = emptyDraft();
    for (const type of LOT_TYPES) next[type] = view?.rates?.[type] ?? null;
    setDraft(next);
    setEditOpen(true);
  };

  const handleSave = async () => {
    const rates: LotTypeRates = {};
    for (const type of LOT_TYPES) {
      const value = draft[type];
      if (typeof value === 'number' && Number.isFinite(value)) rates[type] = value;
    }
    if (Object.keys(rates).length === 0) {
      message.error(t('Renseignez au moins un montant'));
      return;
    }
    setSaving(true);
    try {
      await updateLotTypeRates(tenantId, syndicId, rates);
      setEditOpen(false);
      await load();
      message.success(t('Barème enregistré'));
    } catch (err) {
      const apiError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      message.error(apiError || t("Impossible d'enregistrer le barème"));
    } finally {
      setSaving(false);
    }
  };

  const rows: RateRow[] = LOT_TYPES.map(lotType => ({
    lotType,
    count: view?.lotTypesPresent?.find(item => item.lotType === lotType)?.count ?? 0,
    rate: view?.rates?.[lotType]
  }));

  const columns: ColumnsType<RateRow> = [
    { title: t('Type'), dataIndex: 'lotType', key: 'lotType', render: (value: LotType) => getLotTypeLabel(value) },
    { title: t('Nombre de lots'), dataIndex: 'count', key: 'count', align: 'end' },
    {
      title: t('Montant par lot'),
      dataIndex: 'rate',
      key: 'rate',
      align: 'end',
      render: (value: number | undefined) =>
        value === undefined || value === null ? t('Non renseigné') : <MoneyValue value={value} />
    }
  ];

  const missingLabels = (view?.missingTypes ?? []).map(type => getLotTypeLabel(type) ?? type).join(', ');

  return (
    <Card
      title={t('Barème par type de lot')}
      extra={
        canEdit && view ? (
          <Button icon={<EditOutlined />} onClick={openEdit}>
            {t('Modifier le barème')}
          </Button>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">
        {t(
          'Le montant est défini PAR LOT. Il s’applique automatiquement quand on choisit « Par type de lot » en créant un appel de charges ou une programmation. Un montant à 0 signifie « type non appelé ».'
        )}
      </Typography.Paragraph>

      {loadFailed ? (
        <Typography.Text type="secondary">{t('Le barème n’a pas pu être chargé pour le moment.')}</Typography.Text>
      ) : null}

      {view?.isEmpty ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('Aucun barème enregistré : le mode Par type de lot est indisponible')}
        />
      ) : view && view.missingTypes?.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${t('Types de lots sans montant au barème')} : ${missingLabels}`}
        />
      ) : null}

      {view ? (
        <Table<RateRow>
          size="small"
          rowKey="lotType"
          columns={columns}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      ) : null}

      {view?.updatedAt ? (
        <Typography.Text type="secondary">
          {t('Dernière mise à jour')} : {dayjs(view.updatedAt).format(dateFormat())}
        </Typography.Text>
      ) : null}

      {editOpen ? (
        <Modal
          title={t('Modifier le barème')}
          open
          onCancel={() => setEditOpen(false)}
          onOk={() => void handleSave()}
          okText={t('Enregistrer')}
          cancelText={t('Annuler')}
          confirmLoading={saving}
          destroyOnClose
        >
          <Typography.Paragraph type="secondary">
            {t('Montant par lot. Laissez vide un type sans montant ; 0 signifie « type non appelé ».')}
          </Typography.Paragraph>
          {LOT_TYPES.map(type => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ flex: '0 0 140px' }}>{getLotTypeLabel(type)}</span>
              <InputNumber
                aria-label={getLotTypeLabel(type)}
                min={0}
                style={{ flex: 1 }}
                value={draft[type]}
                formatter={formatAmount}
                parser={parseAmount}
                onChange={value => setDraft(prev => ({ ...prev, [type]: typeof value === 'number' ? value : null }))}
              />
            </div>
          ))}
        </Modal>
      ) : null}
    </Card>
  );
};

function emptyDraft(): Record<LotType, number | null> {
  return { APARTMENT: null, PARKING: null, CELLAR: null, OFFICE: null, COMMERCIAL: null, OTHER: null };
}

export default LotTypeRatesCard;
