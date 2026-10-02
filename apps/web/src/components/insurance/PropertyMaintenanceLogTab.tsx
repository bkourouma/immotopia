import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Select, Space, Spin } from 'antd';
import { DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import {
  deleteMaintenanceLogEntry,
  downloadMaintenanceLogCsv,
  listMaintenanceLog
} from '../../services/insurance-service';
import type { MaintenanceLogCategory, MaintenanceLogEntryDto } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { saveBlob } from '../../utils/save-blob';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { MaintenanceLogFormModal } from './MaintenanceLogFormModal';
import { MaintenanceLogTimeline } from './MaintenanceLogTimeline';
import { LOG_CATEGORY_VALUES, logCategoryLabel, options } from './insurance-labels';

interface Props {
  propertyId: string;
  tenantId: string;
  /** Voir `PropertyInsuranceTab` : faux masque toutes les écritures. */
  canEdit?: boolean;
}

/** Onglet « Carnet d'entretien » : interventions du bien, la plus récente en haut. */
export const PropertyMaintenanceLogTab: React.FC<Props> = ({ propertyId, tenantId, canEdit = true }) => {
  const [entries, setEntries] = useState<MaintenanceLogEntryDto[]>([]);
  const [category, setCategory] = useState<MaintenanceLogCategory | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; entry: MaintenanceLogEntryDto | null }>({
    open: false,
    entry: null
  });
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await listMaintenanceLog(tenantId, propertyId, category ? { category } : undefined));
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, t("Impossible de charger le carnet d'entretien.")));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (entry: MaintenanceLogEntryDto) => {
    try {
      await deleteMaintenanceLogEntry(tenantId, entry.id);
      feedback.success(t('Entrée supprimée.'));
      await load();
    } catch (e) {
      feedback.error(apiErrorMessage(e, t('Suppression impossible.')));
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await downloadMaintenanceLogCsv(tenantId, propertyId);
      saveBlob(result.blob, result.filename || 'carnet-entretien.csv');
    } catch (e) {
      feedback.error(apiErrorMessage(e, t('Export impossible.')));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card
      title={t("Carnet d'entretien")}
      extra={
        <Space wrap>
          <Select
            allowClear
            value={category}
            onChange={setCategory}
            placeholder={t('Toutes les catégories')}
            options={options(LOG_CATEGORY_VALUES, logCategoryLabel)}
            style={{ minWidth: 200 }}
            aria-label={t('Filtrer par catégorie')}
          />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportCsv}>
            {t('Exporter (CSV)')}
          </Button>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, entry: null })}>
              {t('Ajouter une intervention')}
            </Button>
          )}
        </Space>
      }
    >
      {loading ? (
        <Spin />
      ) : error ? (
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
      ) : entries.length === 0 ? (
        <Empty description={t('Aucune intervention enregistrée.')} />
      ) : (
        <MaintenanceLogTimeline
          entries={entries}
          canEdit={canEdit}
          onEdit={entry => setModal({ open: true, entry })}
          onDelete={remove}
        />
      )}
      <MaintenanceLogFormModal
        open={modal.open}
        tenantId={tenantId}
        propertyId={propertyId}
        entry={modal.entry}
        onClose={() => setModal({ open: false, entry: null })}
        onSaved={() => {
          setModal({ open: false, entry: null });
          void load();
        }}
      />
    </Card>
  );
};

export default PropertyMaintenanceLogTab;
