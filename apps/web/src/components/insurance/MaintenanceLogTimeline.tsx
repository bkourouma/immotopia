import React from 'react';
import { Button, Popconfirm, Space, Timeline, Typography } from 'antd';
import type { MaintenanceLogEntryDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';
import { formatAmount, formatDay, logCategoryLabel } from './insurance-labels';

interface Props {
  entries: MaintenanceLogEntryDto[];
  canEdit: boolean;
  onEdit: (entry: MaintenanceLogEntryDto) => void;
  onDelete: (entry: MaintenanceLogEntryDto) => void;
}

/** Ligne de détail : prestataire, coût, échéances (chaque échéance est une phrase traduite entière). */
function details(entry: MaintenanceLogEntryDto): string {
  return [
    entry.vendorName,
    entry.cost !== null ? formatAmount(entry.cost, entry.currency) : null,
    entry.nextDueDate ? t('Prochaine échéance : {{date}}', { date: formatDay(entry.nextDueDate) }) : null,
    entry.warrantyEndDate ? t('Fin de garantie : {{date}}', { date: formatDay(entry.warrantyEndDate) }) : null
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Interventions du carnet, la plus récente en haut (l'ordre est fixé ici, quel que soit l'ordre reçu). */
export const MaintenanceLogTimeline: React.FC<Props> = ({ entries, canEdit, onEdit, onDelete }) => {
  const sorted = [...entries].sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  return (
    <Timeline
      data-testid="maintenance-log"
      items={sorted.map(entry => ({
        key: entry.id,
        children: (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>
              {formatDay(entry.performedAt)} · {logCategoryLabel(entry.category)}
            </Typography.Text>
            <span>{entry.description}</span>
            <Typography.Text type="secondary">{details(entry)}</Typography.Text>
            {canEdit && (
              <Space>
                <Button size="small" type="link" onClick={() => onEdit(entry)}>
                  {t('Modifier')}
                </Button>
                <Popconfirm
                  title={t('Supprimer cette entrée ?')}
                  okText={t('Supprimer')}
                  cancelText={t('Annuler')}
                  onConfirm={() => onDelete(entry)}
                >
                  <Button size="small" type="link" danger>
                    {t('Supprimer')}
                  </Button>
                </Popconfirm>
              </Space>
            )}
          </Space>
        )
      }))}
    />
  );
};
