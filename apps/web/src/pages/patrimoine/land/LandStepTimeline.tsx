import React from 'react';
import { Button, Space, Tag, Timeline, Typography } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { documentTypeLabel } from '../../../components/patrimoine/patrimoine-labels';
import { t } from '../../../i18n/t';
import { formatLandDate, formatXof, stepStatusColor, stepStatusLabel } from './land-labels';
import type { LandStep } from './land-types';

const { Text } = Typography;

export interface LandStepTimelineProps {
  steps: LandStep[];
  onOpenStep: (stepId: string) => void;
}

/**
 * Frise verticale des étapes d'un dossier : statut, dates, échéance, retard,
 * coût et pièce rattachée. Les détails et les actions sont dans le tiroir.
 */
export const LandStepTimeline: React.FC<LandStepTimelineProps> = ({ steps, onOpenStep }) => (
  <Timeline
    items={steps.map(step => ({
      color: step.isOverdue ? 'red' : step.status === 'TERMINEE' ? 'green' : step.status === 'BLOQUEE' ? 'red' : 'blue',
      content: (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Space wrap size="small">
            <Text strong>
              {step.order}. {step.label}
            </Text>
            {!step.required && <Tag>{t('Facultative')}</Tag>}
            <Tag color={stepStatusColor(step.status)}>{stepStatusLabel(step.status)}</Tag>
            {step.isOverdue && <Tag color="error">{t('En retard')}</Tag>}
          </Space>
          <Text type="secondary">
            {t('Échéance : {{date}}', { date: formatLandDate(step.dueDate) })}
            {step.startedAt && ` · ${t('Début : {{date}}', { date: formatLandDate(step.startedAt) })}`}
            {step.completedAt && ` · ${t('Fin : {{date}}', { date: formatLandDate(step.completedAt) })}`}
          </Text>
          <Text type="secondary">
            {t('Coût : {{montant}}', { montant: formatXof(step.costXof) })}
            {step.document && (
              <span className="ms-2">
                <PaperClipOutlined aria-hidden="true" /> {step.document.fileName} (
                {documentTypeLabel(step.document.documentType)})
              </span>
            )}
          </Text>
          <div>
            <Button
              size="small"
              onClick={() => onOpenStep(step.id)}
              aria-label={t("Ouvrir l'étape {{label}}", { label: step.label })}
            >
              {t('Détails et actions')}
            </Button>
          </div>
        </Space>
      )
    }))}
  />
);
