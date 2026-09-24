import React from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { LeaseInspection } from '../../../services/lease-inspections-service';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface InspectionOverviewCardProps {
  title: string;
  inspection: LeaseInspection | null | undefined;
  onStart: () => void;
  onContinue: () => void;
  onView: () => void;
  /** Aide affichée près du bouton « Commencer » — utilisée pour la sortie. */
  startHelp?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Une des deux cartes de la vue d'ensemble : entrée ou sortie. */
export const InspectionOverviewCard: React.FC<InspectionOverviewCardProps> = ({
  title,
  inspection,
  onStart,
  onContinue,
  onView,
  startHelp
}) => {
  let statusNode: React.ReactNode;
  let action: React.ReactNode;

  if (!inspection) {
    statusNode = <Tag>{t('Non réalisé')}</Tag>;
    action = (
      <Space>
        <Button type="primary" onClick={onStart} style={{ minHeight: 44 }}>
          {t('Commencer')}
        </Button>
        {startHelp && (
          <Tooltip title={startHelp}>
            <QuestionCircleOutlined aria-hidden="true" />
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
              {startHelp}
            </span>
          </Tooltip>
        )}
      </Space>
    );
  } else if (inspection.status === 'DRAFT') {
    statusNode = <Tag color="orange">{t('Brouillon')}</Tag>;
    action = (
      <Button onClick={onContinue} style={{ minHeight: 44 }}>
        {t('Continuer')}
      </Button>
    );
  } else {
    statusNode = (
      <Space direction="vertical" size={0}>
        <Tag color="green">{t('Finalisé')}</Tag>
        {inspection.finalizedAt && <Text type="secondary">{formatDate(inspection.finalizedAt)}</Text>}
      </Space>
    );
    action = (
      <Button onClick={onView} style={{ minHeight: 44 }}>
        {t('Consulter')}
      </Button>
    );
  }

  return (
    <Card title={title}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {statusNode}
        {action}
      </Space>
    </Card>
  );
};

export default InspectionOverviewCard;
